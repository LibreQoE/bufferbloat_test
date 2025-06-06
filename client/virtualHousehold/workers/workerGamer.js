/**
 * Simple Gaming Worker - 1 Mbps Bidirectional Traffic
 * Generates simple gaming traffic pattern with low latency requirements
 * DSCP: EF (Expedited Forwarding) - Highest priority
 */

// Web Worker global scope variables
let gamerWorker = null;
let antiChunkingManager = null;

// Import anti-chunking manager if available
if (typeof importScripts !== 'undefined') {
    try {
        importScripts('../antiChunkingManager.js');
        antiChunkingManager = new AntiChunkingManager();
        console.log('🎮 Gaming worker: Anti-chunking manager loaded');
    } catch (error) {
        console.warn('🎮 Gaming worker: Anti-chunking manager not available:', error.message);
    }
}

class SimpleGamerWorker {
    constructor(dataChannel, config = {}) {
        this.dataChannel = dataChannel;
        this.config = {
            userId: config.userId || 'gamer',
            targetThroughput: 310000, // 0.31 Mbps total (realistic gaming)
            packetSize: () => 64 + Math.floor(Math.random() * 64), // 64-128 bytes randomized
            sendInterval: 25, // Send every 25ms for 40 packets/sec (realistic gaming)
            dscp: 'EF',
            uploadRatio: 0.3, // 30% upload (commands)
            downloadRatio: 0.7, // 70% download (game state)
            ...config
        };
        
        this.isActive = false;
        this.sendInterval = null;
        this.stats = {
            packetsSent: 0,
            bytesSent: 0,
            startTime: null
        };
        
        console.log('🎮 Simple Gamer worker initialized');
    }
    
    start() {
        if (this.isActive) {
            console.warn('⚠️ Gamer worker already active');
            return;
        }
        
        console.log('🎮 Starting simple gaming traffic (1 Mbps bidirectional)');
        
        this.isActive = true;
        this.stats.startTime = performance.now();
        
        // Send packets every 8ms for 1 Mbps
        this.sendInterval = setInterval(() => {
            this.sendGamePacket();
        }, this.config.sendInterval);
        
        console.log('✅ Simple gamer worker started');
    }
    
    sendGamePacket() {
        if (!this.isActive) return;
        
        try {
            // Determine if this is an upload (command) or download (state) packet
            const isUpload = Math.random() < this.config.uploadRatio;
            
            // Get realistic packet size (64-128 bytes)
            const packetSize = typeof this.config.packetSize === 'function' ?
                this.config.packetSize() : this.config.packetSize;
            
            // Create realistic game packet
            const packet = new ArrayBuffer(packetSize);
            const view = new DataView(packet);
            
            // Realistic gaming header (12 bytes)
            view.setUint32(0, this.stats.packetsSent, true); // Sequence number
            view.setUint32(4, performance.now() & 0xFFFFFFFF, true); // Timestamp
            view.setUint8(8, isUpload ? 1 : 0); // Direction flag (1=upload, 0=download)
            view.setUint8(9, packetSize); // Packet size
            view.setUint16(10, isUpload ? 0x434D : 0x5354, true); // Type: "CM"=command, "ST"=state
            
            // Fill remaining bytes with realistic gaming data
            if (isUpload) {
                // Upload: Game commands/input (smaller, more frequent)
                for (let i = 12; i < packetSize - 4; i += 2) {
                    view.setUint16(i, Math.floor(Math.random() * 65536), true); // Random input data
                }
            } else {
                // Download: Game state updates (larger, less frequent)
                for (let i = 12; i < packetSize - 4; i += 4) {
                    view.setUint32(i, 0x47414D45 + (this.stats.packetsSent % 256), true); // "GAME" + sequence
                }
            }
            
            // Use anti-chunking manager if available, otherwise use direct transmission
            const transmitPacket = () => {
                if (this.isActive) {
                    this.dataChannel.send(packet);
                    
                    // Update stats
                    this.stats.packetsSent++;
                    this.stats.bytesSent += packet.byteLength;
                    
                    // Track upload/download separately
                    if (isUpload) {
                        this.stats.uploadPackets = (this.stats.uploadPackets || 0) + 1;
                        this.stats.uploadBytes = (this.stats.uploadBytes || 0) + packet.byteLength;
                    } else {
                        this.stats.downloadPackets = (this.stats.downloadPackets || 0) + 1;
                        this.stats.downloadBytes = (this.stats.downloadBytes || 0) + packet.byteLength;
                    }
                    
                    // Send traffic update every 40 packets (once per second at 25ms intervals)
                    if (this.stats.packetsSent % 40 === 0) {
                        this.dispatchTrafficUpdate();
                    }
                }
            };

            if (antiChunkingManager) {
                // Use anti-chunking manager for CAKE-optimized transmission
                antiChunkingManager.scheduleTransmission(
                    this.config.userId,
                    packet,
                    'gaming',
                    transmitPacket
                );
            } else {
                // Fallback: Add small timing jitter to prevent synchronization (±2ms)
                const jitter = (Math.random() - 0.5) * 4; // -2ms to +2ms
                setTimeout(transmitPacket, Math.max(0, jitter));
            }
            
        } catch (error) {
            console.error('❌ Failed to send realistic game packet:', error);
        }
    }
    
    dispatchTrafficUpdate() {
        const now = performance.now();
        const duration = now - this.stats.startTime;
        const throughput = (this.stats.bytesSent * 8) / (duration / 1000); // bits per second
        
        // Send traffic update to main thread
        self.postMessage({
            type: 'traffic-update',
            data: {
                userId: this.config.userId,
                throughput: throughput,
                status: 'active',
                packets: this.stats.packetsSent,
                bytes: this.stats.bytesSent,
                timestamp: now
            }
        });
    }
    
    handleIncomingData(data) {
        // Simple echo for latency measurement
        try {
            if (data instanceof ArrayBuffer && this.dataChannel.readyState === 'open') {
                this.dataChannel.send(data);
            }
        } catch (error) {
            console.error('❌ Failed to handle incoming data:', error);
        }
    }
    
    stop() {
        if (!this.isActive) return;
        
        console.log('🛑 Stopping simple gamer worker');
        
        this.isActive = false;
        
        if (this.sendInterval) {
            clearInterval(this.sendInterval);
            this.sendInterval = null;
        }
        
        console.log('✅ Simple gamer worker stopped');
    }
    
    getStats() {
        const now = performance.now();
        const duration = now - this.stats.startTime;
        
        return {
            isActive: this.isActive,
            duration: duration,
            packetsSent: this.stats.packetsSent,
            bytesSent: this.stats.bytesSent,
            avgThroughput: (this.stats.bytesSent * 8) / (duration / 1000)
        };
    }
}

// Web Worker message handling
self.onmessage = function(event) {
    const { type, config } = event.data;
    
    console.log('🎮 Simple Gamer worker received message:', type);
    
    switch (type) {
        case 'init':
            try {
                console.log('🎮 Initializing simple gamer worker with config:', config);
                
                // Create direct data channel interface
                const directDataChannel = {
                    readyState: 'open',
                    send: (data) => {
                        // Send data directly to server via main thread
                        self.postMessage({
                            type: 'send-data',
                            data: data
                        });
                    }
                };
                
                gamerWorker = new SimpleGamerWorker(directDataChannel, config);
                
                self.postMessage({
                    type: 'initialized',
                    userId: config.userId
                });
                
            } catch (error) {
                console.error('❌ Failed to initialize simple gamer worker:', error);
                self.postMessage({
                    type: 'error',
                    error: error.message
                });
            }
            break;
            
        case 'server-response':
            // Handle server responses
            if (gamerWorker) {
                console.log(`🎮 Received server response: type=${typeof event.data.data}, size=${event.data.data?.byteLength || event.data.data?.length || 'unknown'}`);
                
                // Handle both ArrayBuffer and Blob data types
                if (event.data.data instanceof ArrayBuffer) {
                    gamerWorker.handleIncomingData(event.data.data);
                } else if (event.data.data instanceof Blob) {
                    // Convert Blob to ArrayBuffer
                    event.data.data.arrayBuffer().then(arrayBuffer => {
                        gamerWorker.handleIncomingData(arrayBuffer);
                    }).catch(error => {
                        console.error('❌ Failed to convert Blob to ArrayBuffer:', error);
                    });
                }
            }
            break;
            
        case 'channel-ready':
            // WebRTC channel is ready for communication
            console.log('🎮 Gaming WebRTC channel ready');
            if (gamerWorker && !gamerWorker.isActive) {
                // Start the worker when channel is ready
                setTimeout(() => {
                    if (gamerWorker) {
                        gamerWorker.start();
                    }
                }, 100);
            }
            break;
            
        case 'start':
            if (gamerWorker) {
                gamerWorker.start();
            }
            break;
            
        case 'stop':
            if (gamerWorker) {
                gamerWorker.stop();
                gamerWorker = null;
            }
            break;
            
        case 'getStats':
            if (gamerWorker) {
                self.postMessage({
                    type: 'stats',
                    stats: gamerWorker.getStats()
                });
            }
            break;
            
        default:
            console.warn('🎮 Unknown message type:', type);
    }
};

// Handle worker errors
self.onerror = function(error) {
    console.error('❌ Simple Gamer worker error:', error);
    self.postMessage({
        type: 'error',
        error: error.message
    });
};

console.log('🎮 Simple Gamer worker script loaded');