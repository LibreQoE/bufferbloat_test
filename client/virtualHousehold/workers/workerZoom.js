/**
 * Simple Zoom Worker - 3.5 Mbps Bidirectional Traffic
 * Generates simple video conferencing traffic pattern
 * DSCP: AF41 (Assured Forwarding) - High priority for real-time communication
 */

// Web Worker global scope variables
let zoomWorker = null;

class SimpleZoomWorker {
    constructor(dataChannel, config = {}) {
        this.dataChannel = dataChannel;
        this.config = {
            userId: config.userId || 'worker',
            targetThroughput: 3500000, // 3.5 Mbps total (1.75 Mbps each direction)
            packetSize: 1400, // 1.4KB packets (typical video frame size)
            sendInterval: 3.2, // Send every 3.2ms for ~312 packets/sec = 3.5Mbps
            dscp: 'AF41',
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
            // Create simple video packet
            const packet = new ArrayBuffer(this.config.packetSize);
            const view = new DataView(packet);
            
            // Simple header
            view.setUint32(0, this.stats.packetsSent, true); // Sequence
            view.setUint32(4, performance.now() & 0xFFFFFFFF, true); // Timestamp
            view.setUint32(8, this.config.packetSize, true); // Size
            view.setUint8(12, this.stats.packetsSent % 30 === 0 ? 1 : 0); // Key frame flag
            
            // Fill with video data pattern
            for (let i = 16; i < this.config.packetSize - 4; i += 4) {
                view.setUint32(i, 0x56494445, true); // "VIDE" pattern
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
            console.error('❌ Failed to send video packet:', error);
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