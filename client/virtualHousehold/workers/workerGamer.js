/**
 * Simple Gaming Worker - 1 Mbps Bidirectional Traffic
 * Generates simple gaming traffic pattern with low latency requirements
 * DSCP: EF (Expedited Forwarding) - Highest priority
 */

// Web Worker global scope variables
let gamerWorker = null;

class SimpleGamerWorker {
    constructor(dataChannel, config = {}) {
        this.dataChannel = dataChannel;
        this.config = {
            userId: config.userId || 'gamer',
            targetThroughput: 1000000, // 1 Mbps total (500k each direction)
            packetSize: 1000, // 1KB packets
            sendInterval: 8, // Send every 8ms for 125 packets/sec = 1Mbps
            dscp: 'EF',
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
            // Create simple game packet
            const packet = new ArrayBuffer(this.config.packetSize);
            const view = new DataView(packet);
            
            // Simple header
            view.setUint32(0, this.stats.packetsSent, true); // Sequence
            view.setUint32(4, performance.now() & 0xFFFFFFFF, true); // Timestamp
            view.setUint32(8, this.config.packetSize, true); // Size
            
            // Fill with gaming data pattern
            for (let i = 12; i < this.config.packetSize - 4; i += 4) {
                view.setUint32(i, 0x47414D45, true); // "GAME" pattern
            }
            
            // Send packet
            this.dataChannel.send(packet);
            
            // Update stats
            this.stats.packetsSent++;
            this.stats.bytesSent += packet.byteLength;
            
            // Send traffic update every 100 packets
            if (this.stats.packetsSent % 100 === 0) {
                this.dispatchTrafficUpdate();
            }
            
        } catch (error) {
            console.error('❌ Failed to send game packet:', error);
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