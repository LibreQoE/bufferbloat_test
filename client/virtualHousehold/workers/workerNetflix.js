/**
 * Simple Netflix Worker - Streaming Traffic Pattern
 * Generates simple streaming traffic with buffering behavior
 * DSCP: AF31 (Assured Forwarding) - Medium priority for streaming
 */

// Web Worker global scope variables
let netflixWorker = null;

class SimpleNetflixWorker {
    constructor(dataChannel, config = {}) {
        this.dataChannel = dataChannel;
        this.config = {
            userId: config.userId || 'streamer',
            targetThroughput: 8000000, // 8 Mbps streaming
            packetSize: 8192, // 8KB chunks (Netflix-like)
            sendInterval: 8, // Send every 8ms for 1000 packets/sec = 8Mbps
            dscp: 'AF31',
            ...config
        };
        
        this.isActive = false;
        this.sendInterval = null;
        this.stats = {
            chunksSent: 0,
            bytesSent: 0,
            startTime: null
        };
        
        console.log('📺 Simple Netflix worker initialized');
    }
    
    start() {
        if (this.isActive) {
            console.warn('⚠️ Netflix worker already active');
            return;
        }
        
        console.log('📺 Starting simple Netflix streaming traffic (8 Mbps)');
        
        this.isActive = true;
        this.stats.startTime = performance.now();
        
        // Send chunks every 8ms for 8 Mbps
        this.sendInterval = setInterval(() => {
            this.sendStreamingChunk();
        }, this.config.sendInterval);
        
        console.log('✅ Simple Netflix worker started');
    }
    
    sendStreamingChunk() {
        if (!this.isActive) return;
        
        try {
            // Create simple streaming chunk
            const chunk = new ArrayBuffer(this.config.packetSize);
            const view = new DataView(chunk);
            
            // Simple header
            view.setUint32(0, this.stats.chunksSent, true); // Sequence
            view.setUint32(4, performance.now() & 0xFFFFFFFF, true); // Timestamp
            view.setUint32(8, this.config.packetSize, true); // Size
            view.setUint8(12, this.stats.chunksSent % 100 === 0 ? 1 : 0); // Key frame flag
            
            // Fill with streaming data pattern
            for (let i = 16; i < this.config.packetSize - 4; i += 4) {
                view.setUint32(i, 0x4E464C58, true); // "NFLX" pattern
            }
            
            // Send chunk
            this.dataChannel.send(chunk);
            
            // Update stats
            this.stats.chunksSent++;
            this.stats.bytesSent += chunk.byteLength;
            
            // Send traffic update every 50 chunks
            if (this.stats.chunksSent % 50 === 0) {
                this.dispatchTrafficUpdate();
            }
            
        } catch (error) {
            console.error('❌ Failed to send streaming chunk:', error);
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
                status: 'streaming',
                chunks: this.stats.chunksSent,
                bytes: this.stats.bytesSent,
                timestamp: now
            }
        });
    }
    
    handleIncomingData(data) {
        // Simple acknowledgment for streaming
        try {
            if (data instanceof ArrayBuffer && data.byteLength > 0) {
                // Just log received data, no echo needed for streaming
                console.log(`📺 Received ${data.byteLength} bytes from server`);
            }
        } catch (error) {
            console.error('❌ Failed to handle incoming data:', error);
        }
    }
    
    stop() {
        if (!this.isActive) return;
        
        console.log('🛑 Stopping simple Netflix worker');
        
        this.isActive = false;
        
        if (this.sendInterval) {
            clearInterval(this.sendInterval);
            this.sendInterval = null;
        }
        
        console.log('✅ Simple Netflix worker stopped');
    }
    
    getStats() {
        const now = performance.now();
        const duration = now - this.stats.startTime;
        
        return {
            isActive: this.isActive,
            duration: duration,
            chunksSent: this.stats.chunksSent,
            bytesSent: this.stats.bytesSent,
            avgThroughput: (this.stats.bytesSent * 8) / (duration / 1000)
        };
    }
}

// Web Worker message handling
self.onmessage = function(event) {
    const { type, config } = event.data;
    
    console.log('📺 Simple Netflix worker received message:', type);
    
    switch (type) {
        case 'init':
            try {
                console.log('📺 Initializing simple Netflix worker with config:', config);
                
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
                
                netflixWorker = new SimpleNetflixWorker(directDataChannel, config);
                
                self.postMessage({
                    type: 'initialized',
                    userId: config.userId
                });
                
            } catch (error) {
                console.error('❌ Failed to initialize simple Netflix worker:', error);
                self.postMessage({
                    type: 'error',
                    error: error.message
                });
            }
            break;
            
        case 'server-response':
            // Handle server responses
            if (netflixWorker) {
                console.log(`📺 Received server response: type=${typeof event.data.data}, size=${event.data.data?.byteLength || event.data.data?.length || 'unknown'}`);
                
                // Handle both ArrayBuffer and Blob data types
                if (event.data.data instanceof ArrayBuffer) {
                    netflixWorker.handleIncomingData(event.data.data);
                } else if (event.data.data instanceof Blob) {
                    // Convert Blob to ArrayBuffer
                    event.data.data.arrayBuffer().then(arrayBuffer => {
                        netflixWorker.handleIncomingData(arrayBuffer);
                    }).catch(error => {
                        console.error('❌ Failed to convert Blob to ArrayBuffer:', error);
                    });
                }
            }
            break;
            
        case 'channel-ready':
            // WebRTC channel is ready for communication
            console.log('📺 Netflix WebRTC channel ready');
            if (netflixWorker && !netflixWorker.isActive) {
                // Start the worker when channel is ready
                setTimeout(() => {
                    if (netflixWorker) {
                        netflixWorker.start();
                    }
                }, 100);
            }
            break;
            
        case 'start':
            if (netflixWorker) {
                netflixWorker.start();
            }
            break;
            
        case 'stop':
            if (netflixWorker) {
                netflixWorker.stop();
                netflixWorker = null;
            }
            break;
            
        case 'getStats':
            if (netflixWorker) {
                self.postMessage({
                    type: 'stats',
                    stats: netflixWorker.getStats()
                });
            }
            break;
            
        default:
            console.warn('📺 Unknown message type:', type);
    }
};

// Handle worker errors
self.onerror = function(error) {
    console.error('❌ Simple Netflix worker error:', error);
    self.postMessage({
        type: 'error',
        error: error.message
    });
};

console.log('📺 Simple Netflix worker script loaded');