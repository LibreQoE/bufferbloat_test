/**
 * Simple Zoom Worker - 3.5 Mbps Bidirectional Traffic
 * Generates simple video conferencing traffic pattern
 * DSCP: AF41 (Assured Forwarding) - High priority for real-time communication
 */

// Web Worker global scope variables
let zoomWorker = null;
let antiChunkingManager = null;

// Import anti-chunking manager if available
if (typeof importScripts !== 'undefined') {
    try {
        importScripts('../antiChunkingManager.js');
        antiChunkingManager = new AntiChunkingManager();
        console.log('💼 Video worker: Anti-chunking manager loaded');
    } catch (error) {
        console.warn('💼 Video worker: Anti-chunking manager not available:', error.message);
    }
}

class SimpleZoomWorker {
    constructor(dataChannel, config = {}) {
        this.dataChannel = dataChannel;
        this.config = {
            userId: config.userId || 'worker',
            targetThroughput: 3600000, // 3.6 Mbps total (1.8 Mbps each direction)
            packetSize: () => 800 + Math.floor(Math.random() * 200), // 800-1000 bytes randomized
            sendInterval: 20, // Send every 20ms for 50 frames/sec (realistic video)
            dscp: 'AF41',
            uploadRatio: 0.5, // 50% upload (local video/audio)
            downloadRatio: 0.5, // 50% download (remote video/audio)
            frameCounter: 0, // Track frame types for realistic video simulation
            ...config
        };
        
        this.isActive = false;
        this.sendInterval = null;
        this.stats = {
            packetsSent: 0,
            bytesSent: 0,
            startTime: null
        };
        
        console.log('💼 Simple Zoom worker initialized');
    }
    
    start() {
        if (this.isActive) {
            console.warn('⚠️ Zoom worker already active');
            return;
        }
        
        console.log('💼 Starting simple video conferencing traffic (3.5 Mbps bidirectional)');
        
        this.isActive = true;
        this.stats.startTime = performance.now();
        
        // Send packets every 3.2ms for 3.5 Mbps
        this.sendInterval = setInterval(() => {
            this.sendVideoPacket();
        }, this.config.sendInterval);
        
        console.log('✅ Simple Zoom worker started');
    }
    
    sendVideoPacket() {
        if (!this.isActive) return;
        
        try {
            // Determine if this is upload (local stream) or download (remote stream)
            const isUpload = Math.random() < this.config.uploadRatio;
            
            // Increment frame counter for realistic video frame types
            this.config.frameCounter++;
            
            // Determine frame type (I/P/B frames for realistic video encoding)
            let frameType, packetSize;
            const frameInGOP = this.config.frameCounter % 30; // Group of Pictures = 30 frames
            
            if (frameInGOP === 0) {
                // I-frame (keyframe) - larger packets every 30 frames
                frameType = 'I';
                packetSize = 1200 + Math.floor(Math.random() * 200); // 1200-1400 bytes
            } else if (frameInGOP % 3 === 0) {
                // P-frame (predicted) - medium packets
                frameType = 'P';
                packetSize = typeof this.config.packetSize === 'function' ?
                    this.config.packetSize() : this.config.packetSize; // 800-1000 bytes
            } else {
                // B-frame (bidirectional) - smaller packets
                frameType = 'B';
                packetSize = 600 + Math.floor(Math.random() * 200); // 600-800 bytes
            }
            
            // Create realistic video packet
            const packet = new ArrayBuffer(packetSize);
            const view = new DataView(packet);
            
            // Realistic video header (16 bytes)
            view.setUint32(0, this.stats.packetsSent, true); // Sequence number
            view.setUint32(4, performance.now() & 0xFFFFFFFF, true); // Timestamp
            view.setUint8(8, isUpload ? 1 : 0); // Direction flag (1=upload, 0=download)
            view.setUint8(9, frameType.charCodeAt(0)); // Frame type (I/P/B)
            view.setUint16(10, packetSize, true); // Packet size
            view.setUint32(12, frameInGOP, true); // Frame position in GOP
            
            // Fill with realistic video data patterns
            if (frameType === 'I') {
                // I-frame: More complex data (keyframe)
                for (let i = 16; i < packetSize - 4; i += 4) {
                    view.setUint32(i, 0x49465241 + (i % 256), true); // "IFRA" + variation
                }
            } else if (frameType === 'P') {
                // P-frame: Predicted frame data
                for (let i = 16; i < packetSize - 4; i += 4) {
                    view.setUint32(i, 0x50465241 + (this.stats.packetsSent % 256), true); // "PFRA" + sequence
                }
            } else {
                // B-frame: Bidirectional frame data
                for (let i = 16; i < packetSize - 4; i += 4) {
                    view.setUint32(i, 0x42465241 + (frameInGOP % 256), true); // "BFRA" + GOP position
                }
            }
            
            // Use anti-chunking manager if available, otherwise use direct transmission
            const transmitPacket = () => {
                if (this.isActive) {
                    this.dataChannel.send(packet);
                    
                    // Update stats
                    this.stats.packetsSent++;
                    this.stats.bytesSent += packet.byteLength;
                    
                    // Track upload/download and frame types separately
                    if (isUpload) {
                        this.stats.uploadPackets = (this.stats.uploadPackets || 0) + 1;
                        this.stats.uploadBytes = (this.stats.uploadBytes || 0) + packet.byteLength;
                    } else {
                        this.stats.downloadPackets = (this.stats.downloadPackets || 0) + 1;
                        this.stats.downloadBytes = (this.stats.downloadBytes || 0) + packet.byteLength;
                    }
                    
                    // Track frame type stats
                    this.stats[`${frameType}Frames`] = (this.stats[`${frameType}Frames`] || 0) + 1;
                    
                    // Send traffic update every 50 packets (once per second at 20ms intervals)
                    if (this.stats.packetsSent % 50 === 0) {
                        this.dispatchTrafficUpdate();
                    }
                }
            };

            if (antiChunkingManager) {
                // Use anti-chunking manager for CAKE-optimized transmission
                antiChunkingManager.scheduleTransmission(
                    this.config.userId,
                    packet,
                    'video',
                    transmitPacket
                );
            } else {
                // Fallback: Add small timing jitter to prevent synchronization (±1ms for video)
                const jitter = (Math.random() - 0.5) * 2; // -1ms to +1ms
                setTimeout(transmitPacket, Math.max(0, jitter));
            }
            
        } catch (error) {
            console.error('❌ Failed to send realistic video packet:', error);
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
        
        console.log('🛑 Stopping simple Zoom worker');
        
        this.isActive = false;
        
        if (this.sendInterval) {
            clearInterval(this.sendInterval);
            this.sendInterval = null;
        }
        
        console.log('✅ Simple Zoom worker stopped');
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
    
    console.log('💼 Simple Zoom worker received message:', type);
    
    switch (type) {
        case 'init':
            try {
                console.log('💼 Initializing simple Zoom worker with config:', config);
                
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
                
                zoomWorker = new SimpleZoomWorker(directDataChannel, config);
                
                self.postMessage({
                    type: 'initialized',
                    userId: config.userId
                });
                
            } catch (error) {
                console.error('❌ Failed to initialize simple Zoom worker:', error);
                self.postMessage({
                    type: 'error',
                    error: error.message
                });
            }
            break;
            
        case 'server-response':
            // Handle server responses
            if (zoomWorker) {
                console.log(`💼 Received server response: type=${typeof event.data.data}, size=${event.data.data?.byteLength || event.data.data?.length || 'unknown'}`);
                
                // Handle both ArrayBuffer and Blob data types
                if (event.data.data instanceof ArrayBuffer) {
                    zoomWorker.handleIncomingData(event.data.data);
                } else if (event.data.data instanceof Blob) {
                    // Convert Blob to ArrayBuffer
                    event.data.data.arrayBuffer().then(arrayBuffer => {
                        zoomWorker.handleIncomingData(arrayBuffer);
                    }).catch(error => {
                        console.error('❌ Failed to convert Blob to ArrayBuffer:', error);
                    });
                }
            }
            break;
            
        case 'channel-ready':
            // WebRTC channel is ready for communication
            console.log('💼 Zoom WebRTC channel ready');
            if (zoomWorker && !zoomWorker.isActive) {
                // Start the worker when channel is ready
                setTimeout(() => {
                    if (zoomWorker) {
                        zoomWorker.start();
                    }
                }, 100);
            }
            break;
            
        case 'start':
            if (zoomWorker) {
                zoomWorker.start();
            }
            break;
            
        case 'stop':
            if (zoomWorker) {
                zoomWorker.stop();
                zoomWorker = null;
            }
            break;
            
        case 'getStats':
            if (zoomWorker) {
                self.postMessage({
                    type: 'stats',
                    stats: zoomWorker.getStats()
                });
            }
            break;
            
        default:
            console.warn('💼 Unknown message type:', type);
    }
};

// Handle worker errors
self.onerror = function(error) {
    console.error('❌ Simple Zoom worker error:', error);
    self.postMessage({
        type: 'error',
        error: error.message
    });
};

console.log('💼 Simple Zoom worker script loaded');