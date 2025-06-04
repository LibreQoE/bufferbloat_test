/**
 * WebSocket Downloader Worker - High-Throughput Bulk Downloads
 * Replaces WebRTC for Computer user to achieve 1+ Gbps download speeds
 * Maintains latency monitoring through WebSocket ping/pong
 */

// Web Worker global scope variables
let downloaderWorker = null;

class WorkerDownloaderWebSocket {
    constructor(config = {}) {
        this.config = {
            userId: 'downloader',
            dscp: 'BE',
            testDuration: 30000,
            targetThroughput: 1000000000, // 1 Gbps default
            chunkSize: 'large',
            pattern: 'bulk',
            serverUrl: null, // Will be provided by main thread
            ...config
        };
        
        this.isActive = false;
        this.websocket = null;
        this.startTime = null;
        
        // Download state
        this.downloadState = {
            active: false,
            bytesReceived: 0,
            chunksReceived: 0,
            startTime: null,
            lastChunkTime: null,
            actualThroughput: 0,
            targetThroughput: this.config.targetThroughput
        };
        
        // Sliding window for throughput calculation
        this.throughputWindow = 5000; // 5-second sliding window
        this.downloadHistory = []; // Array to store timestamped download events
        
        // Latency monitoring
        this.latencyState = {
            pingSent: 0,
            pongReceived: 0,
            latencySamples: [],
            averageLatency: 0,
            jitter: 0,
            lastPingTime: 0,
            pingInterval: null
        };
        
        // Statistics
        this.stats = {
            startTime: null,
            totalBytes: 0,
            totalChunks: 0,
            averageThroughput: 0,
            peakThroughput: 0,
            connectionUptime: 0,
            reconnections: 0
        };
        
        console.log('💾 WebSocket Downloader worker initialized');
    }
    
    async start() {
        if (this.isActive) {
            console.warn('⚠️ WebSocket Downloader already active');
            return;
        }
        
        console.log('🚀 Starting WebSocket Downloader (high-throughput mode)');
        
        this.isActive = true;
        this.stats.startTime = performance.now();
        this.startTime = this.stats.startTime;
        
        try {
            await this.connectWebSocket();
            this.startLatencyMonitoring();
            
            console.log('✅ WebSocket Downloader started successfully');
            
        } catch (error) {
            console.error('❌ Failed to start WebSocket Downloader:', error);
            this.stop();
        }
    }
    
    async connectWebSocket() {
        return new Promise((resolve, reject) => {
            try {
                // Use server URL provided by main thread
                if (!this.config.serverUrl) {
                    reject(new Error('Server URL not provided to WebSocket worker'));
                    return;
                }
                
                const wsUrl = `${this.config.serverUrl}/ws/bulk-download/${this.config.userId}?dscp=${this.config.dscp}`;
                
                console.log(`📡 Connecting to WebSocket: ${wsUrl}`);
                
                this.websocket = new WebSocket(wsUrl);
                this.websocket.binaryType = 'arraybuffer';
                
                this.websocket.onopen = () => {
                    console.log('✅ WebSocket connected for bulk downloads');
                    this.stats.connectionUptime = performance.now();
                    resolve();
                };
                
                this.websocket.onmessage = (event) => {
                    this.handleWebSocketMessage(event);
                };
                
                this.websocket.onclose = (event) => {
                    console.log(`📡 WebSocket closed: ${event.code} - ${event.reason}`);
                    if (this.isActive) {
                        // Attempt reconnection
                        setTimeout(() => this.reconnectWebSocket(), 1000);
                    }
                };
                
                this.websocket.onerror = (error) => {
                    console.error('❌ WebSocket error:', error);
                    reject(error);
                };
                
                // Connection timeout
                setTimeout(() => {
                    if (this.websocket.readyState !== WebSocket.OPEN) {
                        reject(new Error('WebSocket connection timeout'));
                    }
                }, 5000);
                
            } catch (error) {
                reject(error);
            }
        });
    }
    
    async reconnectWebSocket() {
        if (!this.isActive) return;
        
        try {
            console.log('🔄 Attempting WebSocket reconnection...');
            this.stats.reconnections++;
            
            if (this.websocket) {
                this.websocket.close();
            }
            
            await this.connectWebSocket();
            
            // Resume download if it was active
            if (this.downloadState.active) {
                await this.startBulkDownload();
            }
            
        } catch (error) {
            console.error('❌ WebSocket reconnection failed:', error);
            setTimeout(() => this.reconnectWebSocket(), 2000);
        }
    }
    
    handleWebSocketMessage(event) {
        try {
            if (event.data instanceof ArrayBuffer) {
                // Binary data - bulk download chunk
                this.handleDownloadChunk(event.data);
            } else {
                // Text data - control message
                const message = JSON.parse(event.data);
                this.handleControlMessage(message);
            }
        } catch (error) {
            console.error('❌ Error handling WebSocket message:', error);
        }
    }
    
    handleDownloadChunk(data) {
        const now = performance.now();
        const chunkSize = data.byteLength;
        
        // Update download statistics
        this.downloadState.bytesReceived += chunkSize;
        this.downloadState.chunksReceived++;
        this.downloadState.lastChunkTime = now;
        
        // Add to download history for sliding window calculation
        this.downloadHistory.push({
            timestamp: now,
            bytes: chunkSize
        });
        
        // Calculate throughput using sliding window
        if (this.downloadState.startTime) {
            this.downloadState.actualThroughput = this.calculateSlidingWindowThroughput();
            
            // Update peak throughput
            if (this.downloadState.actualThroughput > this.stats.peakThroughput) {
                this.stats.peakThroughput = this.downloadState.actualThroughput;
            }
        }
        
        // Update global stats
        this.stats.totalBytes += chunkSize;
        this.stats.totalChunks++;
        
        // Calculate average throughput using sliding window for consistency
        this.stats.averageThroughput = this.downloadState.actualThroughput;
        
        // Send traffic update to main thread
        this.dispatchTrafficUpdate();
    }
    
    /**
     * Calculate throughput using a sliding window approach
     * @returns {number} Throughput in bits per second
     */
    calculateSlidingWindowThroughput() {
        const now = performance.now();
        const windowStart = now - this.throughputWindow;
        
        // Remove events older than the window
        this.downloadHistory = this.downloadHistory.filter(event => event.timestamp >= windowStart);
        
        // If no events in window, return 0
        if (this.downloadHistory.length === 0) {
            return 0;
        }
        
        // Calculate total bytes in the window
        const totalBytes = this.downloadHistory.reduce((sum, event) => sum + event.bytes, 0);
        
        // Calculate time span of actual events (not the full window)
        const oldestEvent = this.downloadHistory[0];
        const newestEvent = this.downloadHistory[this.downloadHistory.length - 1];
        const timeSpanMs = newestEvent.timestamp - oldestEvent.timestamp;
        
        // If time span is too small, use the window size
        const effectiveTimeSpanMs = Math.max(timeSpanMs, 1000); // Minimum 1 second
        
        // Convert to bits per second
        const throughputBps = (totalBytes * 8) / (effectiveTimeSpanMs / 1000);
        
        return throughputBps;
    }
    
    handleControlMessage(message) {
        switch (message.type) {
            case 'ping':
                this.handlePing(message);
                break;
            case 'pong':
                this.handlePong(message);
                break;
            case 'download_started':
                console.log('📥 Bulk download started on server');
                this.downloadState.active = true;
                this.downloadState.startTime = performance.now();
                break;
            case 'download_stopped':
                console.log('📥 Bulk download stopped on server');
                this.downloadState.active = false;
                break;
            case 'error':
                console.error('❌ Server error:', message.error);
                break;
            default:
                console.log('📨 Unknown control message:', message.type);
        }
    }
    
    handlePing(message) {
        // Respond to server ping
        const pong = {
            type: 'pong',
            client_timestamp: message.timestamp,
            server_timestamp: performance.now()
        };
        
        this.sendControlMessage(pong);
    }
    
    handlePong(message) {
        // Process latency measurement
        const now = performance.now();
        const clientTimestamp = message.client_timestamp;
        const serverTimestamp = message.server_timestamp;
        
        if (clientTimestamp && this.latencyState.lastPingTime) {
            const roundTripTime = now - clientTimestamp;
            
            // Add to samples
            this.latencyState.latencySamples.push(roundTripTime);
            
            // Keep only last 10 samples
            if (this.latencyState.latencySamples.length > 10) {
                this.latencyState.latencySamples.shift();
            }
            
            // Calculate average latency
            const sum = this.latencyState.latencySamples.reduce((a, b) => a + b, 0);
            this.latencyState.averageLatency = sum / this.latencyState.latencySamples.length;
            
            // Calculate jitter (standard deviation)
            if (this.latencyState.latencySamples.length > 1) {
                const variance = this.latencyState.latencySamples.reduce((acc, val) => {
                    return acc + Math.pow(val - this.latencyState.averageLatency, 2);
                }, 0) / this.latencyState.latencySamples.length;
                this.latencyState.jitter = Math.sqrt(variance);
            }
            
            this.latencyState.pongReceived++;
        }
    }
    
    startLatencyMonitoring() {
        // Send ping every 2 seconds for latency measurement
        this.latencyState.pingInterval = setInterval(() => {
            this.sendPing();
        }, 2000);
        
        console.log('📊 Started latency monitoring via WebSocket');
    }
    
    sendPing() {
        if (!this.websocket || this.websocket.readyState !== WebSocket.OPEN) {
            return;
        }
        
        const ping = {
            type: 'ping',
            timestamp: performance.now()
        };
        
        this.latencyState.lastPingTime = ping.timestamp;
        this.latencyState.pingSent++;
        
        this.sendControlMessage(ping);
    }
    
    sendControlMessage(message) {
        if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
            this.websocket.send(JSON.stringify(message));
        }
    }
    
    async startBulkDownload() {
        if (!this.websocket || this.websocket.readyState !== WebSocket.OPEN) {
            console.error('❌ WebSocket not connected');
            return;
        }
        
        const downloadConfig = {
            type: 'start_download',
            throughput: this.downloadState.targetThroughput,
            chunk_size: this.config.chunkSize,
            pattern: this.config.pattern,
            duration: this.config.testDuration / 1000 // Convert to seconds
        };
        
        console.log(`🚀 Starting bulk download: ${this.downloadState.targetThroughput/1000000} Mbps target`);
        
        this.sendControlMessage(downloadConfig);
        this.downloadState.active = true;
        this.downloadState.startTime = performance.now();
    }
    
    async stopBulkDownload() {
        if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
            this.sendControlMessage({ type: 'stop_download' });
        }
        
        this.downloadState.active = false;
        console.log('🛑 Stopped bulk download');
    }
    
    setTargetThroughput(throughput) {
        this.downloadState.targetThroughput = throughput;
        
        if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
            this.sendControlMessage({
                type: 'set_throughput',
                throughput: throughput
            });
        }
        
        console.log(`📊 Updated target throughput: ${throughput/1000000} Mbps`);
    }
    
    dispatchTrafficUpdate() {
        const now = performance.now();
        const throughput = this.downloadState.actualThroughput || 0;
        
        // WebSocket downloader is primarily downstream traffic
        const downloadThroughput = throughput * 0.99; // 99% download
        const uploadThroughput = throughput * 0.01;   // 1% upload (control messages)
        
        // Send traffic update to main thread
        self.postMessage({
            type: 'traffic-update',
            data: {
                userId: this.config.userId,
                throughput: throughput,
                downloadThroughput: downloadThroughput,
                uploadThroughput: uploadThroughput,
                status: this.downloadState.active ? 'downloading' : 'idle',
                bytes: this.stats.totalBytes,
                chunks: this.stats.totalChunks,
                latency: this.latencyState.averageLatency,
                jitter: this.latencyState.jitter,
                timestamp: now
            }
        });
    }
    
    getStats() {
        const now = performance.now();
        const duration = now - this.stats.startTime;
        
        return {
            isActive: this.isActive,
            duration: duration,
            websocketConnected: this.websocket?.readyState === WebSocket.OPEN,
            downloadActive: this.downloadState.active,
            totalBytes: this.stats.totalBytes,
            totalChunks: this.stats.totalChunks,
            averageThroughput: this.stats.averageThroughput,
            peakThroughput: this.stats.peakThroughput,
            actualThroughput: this.downloadState.actualThroughput,
            targetThroughput: this.downloadState.targetThroughput,
            latency: this.latencyState.averageLatency,
            jitter: this.latencyState.jitter,
            packetLoss: this.calculatePacketLoss(),
            reconnections: this.stats.reconnections,
            connectionUptime: this.stats.connectionUptime ? now - this.stats.connectionUptime : 0
        };
    }
    
    calculatePacketLoss() {
        if (this.latencyState.pingSent === 0) return 0;
        const lossRate = (this.latencyState.pingSent - this.latencyState.pongReceived) / this.latencyState.pingSent;
        return Math.max(0, lossRate * 100); // Percentage
    }
    
    stop() {
        if (!this.isActive) return;
        
        console.log('🛑 Stopping WebSocket Downloader');
        
        this.isActive = false;
        
        // Stop bulk download
        this.stopBulkDownload();
        
        // Stop latency monitoring
        if (this.latencyState.pingInterval) {
            clearInterval(this.latencyState.pingInterval);
            this.latencyState.pingInterval = null;
        }
        
        // Close WebSocket
        if (this.websocket) {
            this.websocket.close();
            this.websocket = null;
        }
        
        console.log('✅ WebSocket Downloader stopped');
    }
    
    reset() {
        console.log('🔄 Resetting WebSocket Downloader');
        
        // Reset statistics
        this.stats = {
            startTime: null,
            totalBytes: 0,
            totalChunks: 0,
            averageThroughput: 0,
            peakThroughput: 0,
            connectionUptime: 0,
            reconnections: 0
        };
        
        // Reset download state
        this.downloadState = {
            active: false,
            bytesReceived: 0,
            chunksReceived: 0,
            startTime: null,
            lastChunkTime: null,
            actualThroughput: 0,
            targetThroughput: this.config.targetThroughput
        };
        
        // Reset latency state
        this.latencyState = {
            pingSent: 0,
            pongReceived: 0,
            latencySamples: [],
            averageLatency: 0,
            jitter: 0,
            lastPingTime: 0,
            pingInterval: null
        };
        
        console.log('✅ WebSocket Downloader reset');
    }
    
    exportData() {
        return {
            type: 'websocket_downloader',
            config: { ...this.config },
            stats: this.getStats(),
            timestamp: new Date().toISOString()
        };
    }
    
    destroy() {
        this.stop();
        console.log('🗑️ WebSocket Downloader destroyed');
    }
}

// Web Worker message handling
self.onmessage = function(event) {
    const { type, config } = event.data;
    
    console.log('💾 WebSocket Downloader worker received message:', type);
    
    switch (type) {
        case 'init':
            try {
                console.log('💾 Initializing WebSocket Downloader worker with config:', config);
                
                downloaderWorker = new WorkerDownloaderWebSocket(config);
                
                // Auto-start after initialization
                setTimeout(() => {
                    if (downloaderWorker) {
                        downloaderWorker.start();
                        
                        // Start bulk download after connection is established
                        setTimeout(() => {
                            if (downloaderWorker && downloaderWorker.isActive) {
                                downloaderWorker.startBulkDownload();
                            }
                        }, 1000);
                    }
                }, 100);
                
                self.postMessage({
                    type: 'initialized',
                    userId: config.userId
                });
                
            } catch (error) {
                console.error('❌ Failed to initialize WebSocket Downloader worker:', error);
                self.postMessage({
                    type: 'error',
                    error: error.message
                });
            }
            break;
            
        case 'start':
            if (downloaderWorker) {
                downloaderWorker.start();
            }
            break;
            
        case 'stop':
            if (downloaderWorker) {
                downloaderWorker.stop();
                downloaderWorker = null;
            }
            break;
            
        case 'start_download':
            if (downloaderWorker) {
                downloaderWorker.startBulkDownload();
            }
            break;
            
        case 'stop_download':
            if (downloaderWorker) {
                downloaderWorker.stopBulkDownload();
            }
            break;
            
        case 'set_throughput':
            if (downloaderWorker && event.data.throughput) {
                downloaderWorker.setTargetThroughput(event.data.throughput);
            }
            break;
            
        case 'getStats':
            if (downloaderWorker) {
                self.postMessage({
                    type: 'stats',
                    stats: downloaderWorker.getStats()
                });
            }
            break;
            
        default:
            console.warn('💾 Unknown message type:', type);
    }
};

// Handle worker errors
self.onerror = function(error) {
    console.error('❌ WebSocket Downloader worker error:', error);
    self.postMessage({
        type: 'error',
        error: error.message
    });
};

console.log('💾 WebSocket Downloader worker script loaded');

// Note: Web Workers don't need export statements
// export default WorkerDownloaderWebSocket;