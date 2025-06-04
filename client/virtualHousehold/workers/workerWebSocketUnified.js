/**
 * Unified WebSocket Worker - Pure WebSocket Traffic Generation
 * Replaces all WebRTC workers with WebSocket-based traffic generation
 * Each virtual user gets their own WebSocket connection and server process
 */

// Web Worker global scope variables
let websocketWorker = null;

class WebSocketUnifiedWorker {
    constructor(config = {}) {
        this.config = {
            userId: config.userId || 'user',
            dscp: config.dscp || 'BE',
            testDuration: config.testDuration || 30000,
            targetThroughput: config.targetThroughput || 10000000, // 10 Mbps default
            chunkSize: config.chunkSize || 'medium',
            pattern: config.pattern || 'bulk',
            serverUrl: config.serverUrl || null,
            ...config
        };
        
        this.isActive = false;
        this.websocket = null;
        this.startTime = null;
        
        // Traffic generation state
        this.trafficState = {
            active: false,
            bytesSent: 0,
            bytesReceived: 0,
            packetsSent: 0,
            packetsReceived: 0,
            startTime: null,
            lastPacketTime: null,
            actualUploadThroughput: 0,
            actualDownloadThroughput: 0,
            targetThroughput: this.config.targetThroughput
        };
        
        // Sliding window for throughput calculation
        this.throughputWindow = 5000; // 5-second sliding window
        this.downloadHistory = []; // Array to store timestamped download events
        this.uploadHistory = []; // Array to store timestamped upload events
        
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
        
        // Traffic generation intervals
        this.uploadInterval = null;
        this.downloadRequestInterval = null;
        
        // User-specific traffic patterns
        this.trafficPattern = this.getTrafficPattern();
        
        // Worker initialized (removed verbose logging)
    }
    
    getTrafficPattern() {
        // Define traffic patterns based on user type
        switch (this.config.userId) {
            case 'gamer':
                return {
                    uploadRatio: 0.7,      // 70% upload (game commands)
                    downloadRatio: 0.3,    // 30% download (game state)
                    packetSize: 1000,      // 1KB packets
                    sendInterval: 8,       // 8ms intervals for low latency
                    burstPattern: false    // Consistent traffic
                };
            case 'worker':
                return {
                    uploadRatio: 0.5,      // 50% upload (video/audio)
                    downloadRatio: 0.5,    // 50% download (video/audio)
                    packetSize: 1400,      // 1.4KB packets (video frames)
                    sendInterval: 3.2,     // 3.2ms intervals
                    burstPattern: false    // Consistent traffic
                };
            case 'streamer':
                return {
                    uploadRatio: 0.1,      // 10% upload (control)
                    downloadRatio: 0.9,    // 90% download (HD video)
                    packetSize: 8000,      // 8KB packets (large video chunks)
                    sendInterval: 2,       // 2ms intervals for high throughput
                    burstPattern: true     // Bursty video traffic
                };
            case 'downloader':
                return {
                    uploadRatio: 0.4,      // 40% upload (cloud backup)
                    downloadRatio: 0.6,    // 60% download (OS updates)
                    packetSize: 16000,     // 16KB packets (bulk transfer)
                    sendInterval: 1,       // 1ms intervals for maximum throughput
                    burstPattern: true     // Bursty bulk traffic
                };
            default:
                return {
                    uploadRatio: 0.5,
                    downloadRatio: 0.5,
                    packetSize: 1500,
                    sendInterval: 5,
                    burstPattern: false
                };
        }
    }
    
    async start() {
        if (this.isActive) {
            return;
        }
        
        this.isActive = true;
        this.startTime = performance.now();
        
        try {
            await this.connectWebSocket();
            this.startLatencyMonitoring();
            this.startTrafficGeneration();
            
        } catch (error) {
            console.error(`❌ Failed to start WebSocket worker for ${this.config.userId}:`, error);
            this.stop();
        }
    }
    
    async connectWebSocket() {
        return new Promise((resolve, reject) => {
            try {
                if (!this.config.serverUrl) {
                    reject(new Error('Server URL not provided to WebSocket worker'));
                    return;
                }
                
                // Create user-specific WebSocket endpoint
                const wsUrl = `${this.config.serverUrl}/ws/virtual-household/${this.config.userId}?dscp=${this.config.dscp}&throughput=${this.config.targetThroughput}`;
                
                this.websocket = new WebSocket(wsUrl);
                this.websocket.binaryType = 'arraybuffer';
                
                this.websocket.onopen = () => {
                    resolve();
                };
                
                this.websocket.onmessage = (event) => {
                    this.handleWebSocketMessage(event);
                };
                
                this.websocket.onclose = (event) => {
                    if (this.isActive) {
                        // Attempt reconnection
                        setTimeout(() => this.reconnectWebSocket(), 1000);
                    }
                };
                
                this.websocket.onerror = (error) => {
                    console.error(`❌ WebSocket error for ${this.config.userId}:`, error);
                    reject(error);
                };
                
                // Connection timeout
                setTimeout(() => {
                    if (this.websocket.readyState !== WebSocket.OPEN) {
                        reject(new Error(`WebSocket connection timeout for ${this.config.userId}`));
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
            if (this.websocket) {
                this.websocket.close();
            }
            
            await this.connectWebSocket();
            
            // Resume traffic generation if it was active
            if (this.trafficState.active) {
                this.startTrafficGeneration();
            }
            
        } catch (error) {
            console.error(`❌ WebSocket reconnection failed for ${this.config.userId}:`, error);
            setTimeout(() => this.reconnectWebSocket(), 2000);
        }
    }
    
    handleWebSocketMessage(event) {
        try {
            if (event.data instanceof ArrayBuffer) {
                // Binary data - traffic response
                this.handleTrafficResponse(event.data);
            } else {
                // Text data - control message
                const message = JSON.parse(event.data);
                this.handleControlMessage(message);
            }
        } catch (error) {
            console.error(`❌ Error handling WebSocket message for ${this.config.userId}:`, error);
        }
    }
    
    handleTrafficResponse(data) {
        const now = performance.now();
        const dataSize = data.byteLength;
        
        // Update download statistics
        this.trafficState.bytesReceived += dataSize;
        this.trafficState.packetsReceived++;
        this.trafficState.lastPacketTime = now;
        
        // Add to download history for sliding window calculation
        this.downloadHistory.push({
            timestamp: now,
            bytes: dataSize
        });
        
        // Calculate download throughput using sliding window
        if (this.trafficState.startTime) {
            this.trafficState.actualDownloadThroughput = this.calculateSlidingWindowDownloadThroughput();
        }
        
        // Send traffic update
        this.dispatchTrafficUpdate();
    }
    
    handleControlMessage(message) {
        switch (message.type) {
            case 'ping':
                this.handlePing(message);
                break;
            case 'pong':
                this.handlePong(message);
                break;
            case 'connection_test':
                this.handleConnectionTest(message);
                break;
            case 'download_request':
                console.log(`📥 Received download_request for ${this.config.userId}:`, message);
                this.handleDownloadRequest(message);
                break;
            case 'traffic_started':
                this.trafficState.active = true;
                this.trafficState.startTime = performance.now();
                break;
            case 'traffic_stopped':
                this.trafficState.active = false;
                break;
            case 'error':
                console.error(`❌ Server error for ${this.config.userId}:`, message.error);
                break;
            default:
                // Removed verbose logging for unknown messages
                break;
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

    handleConnectionTest(message) {
        // RESOURCE LEAK FIX: Respond to server connection test
        const response = {
            type: 'connection_test_response',
            user_id: message.user_id,
            timestamp: message.timestamp,
            client_timestamp: performance.now()
        };
        
        this.sendControlMessage(response);
    }

    handlePong(message) {
        // Process latency measurement
        const now = performance.now();
        const clientTimestamp = message.client_timestamp;
        
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
    
    handleDownloadRequest(message) {
        // Server is requesting download traffic measurement
        // Send data back to server to measure client→server throughput
        try {
            const size = message.size || this.trafficPattern.packetSize;
            const timestamp = message.timestamp || performance.now();
            
            // Create download response packet
            const packet = new ArrayBuffer(size);
            const view = new DataView(packet);
            
            // Packet header for download measurement
            view.setUint32(0, 0x444F574E, true); // Download marker "DOWN"
            view.setUint32(4, timestamp & 0xFFFFFFFF, true); // Original timestamp
            view.setUint32(8, performance.now() & 0xFFFFFFFF, true); // Response timestamp
            view.setUint32(12, size, true); // Packet size
            
            // Fill with download pattern
            const pattern = 0x444F574E; // "DOWN"
            for (let i = 16; i < size - 4; i += 4) {
                view.setUint32(i, pattern, true);
            }
            
            // Send binary data back to server only if WebSocket is still open
            if (this.websocket && this.websocket.readyState === WebSocket.OPEN && this.isActive) {
                this.websocket.send(packet);
                
                // Also send control message for tracking
                const downloadResponse = {
                    type: 'download_response',
                    size: size,
                    timestamp: performance.now()
                };
                this.sendControlMessage(downloadResponse);
            } else {
                // WebSocket closed, stop processing download requests
                return;
            }
            
            // Update download stats
            this.trafficState.bytesReceived += size;
            this.trafficState.packetsReceived++;
            
            // Add to download history for sliding window calculation
            const now = performance.now();
            this.downloadHistory.push({
                timestamp: now,
                bytes: size
            });
            
            // Calculate download throughput using sliding window
            if (this.trafficState.startTime) {
                this.trafficState.actualDownloadThroughput = this.calculateSlidingWindowDownloadThroughput();
            }
            
        } catch (error) {
            console.error(`❌ Failed to handle download request for ${this.config.userId}:`, error);
        }
    }
    
    startLatencyMonitoring() {
        // Send ping every 2 seconds for latency measurement
        this.latencyState.pingInterval = setInterval(() => {
            this.sendPing();
        }, 2000);
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
        // Prevent sending data when WebSocket connection is closed
        if (!this.websocket ||
            this.websocket.readyState !== WebSocket.OPEN ||
            !this.isActive) {
            return;
        }
        
        try {
            // Double-check state before sending to prevent race conditions
            if (this.websocket.readyState === WebSocket.OPEN) {
                this.websocket.send(JSON.stringify(message));
            }
        } catch (error) {
            console.error(`❌ Failed to send control message for ${this.config.userId}:`, error);
            // Stop trying to send if WebSocket is closed
            if (this.websocket.readyState !== WebSocket.OPEN) {
                this.isActive = false;
            }
        }
    }
    
    startTrafficGeneration() {
        if (!this.websocket || this.websocket.readyState !== WebSocket.OPEN) {
            console.error(`❌ WebSocket not connected for ${this.config.userId}`);
            return;
        }
        
        // Send traffic configuration to server
        const trafficConfig = {
            type: 'start_traffic',
            userId: this.config.userId,
            targetThroughput: this.config.targetThroughput,
            uploadRatio: this.trafficPattern.uploadRatio,
            downloadRatio: this.trafficPattern.downloadRatio,
            packetSize: this.trafficPattern.packetSize,
            pattern: this.config.pattern,
            dscp: this.config.dscp,
            duration: this.config.testDuration / 1000
        };
        
        this.sendControlMessage(trafficConfig);
        
        // Start upload traffic generation
        this.startUploadTraffic();
        
        // Request download traffic
        this.requestDownloadTraffic();
        
        this.trafficState.active = true;
        this.trafficState.startTime = performance.now();
    }
    
    startUploadTraffic() {
        // Calculate upload throughput and interval
        const uploadThroughput = this.config.targetThroughput * this.trafficPattern.uploadRatio;
        const bytesPerSecond = uploadThroughput / 8;
        const bytesPerPacket = this.trafficPattern.packetSize;
        const packetsPerSecond = bytesPerSecond / bytesPerPacket;
        const intervalMs = 1000 / packetsPerSecond;
        
        this.uploadInterval = setInterval(() => {
            this.sendUploadPacket();
        }, Math.max(1, intervalMs)); // Minimum 1ms interval
    }
    
    sendUploadPacket() {
        // Prevent sending data when WebSocket connection is closed
        if (!this.isActive ||
            !this.websocket ||
            this.websocket.readyState !== WebSocket.OPEN) {
            return;
        }
        
        try {
            // Create traffic packet
            const packet = new ArrayBuffer(this.trafficPattern.packetSize);
            const view = new DataView(packet);
            
            // Packet header
            view.setUint32(0, this.trafficState.packetsSent, true); // Sequence
            view.setUint32(4, performance.now() & 0xFFFFFFFF, true); // Timestamp
            view.setUint32(8, this.trafficPattern.packetSize, true); // Size
            view.setUint32(12, this.config.userId.charCodeAt(0), true); // User ID marker
            
            // Fill with user-specific pattern
            const pattern = this.getUserPattern();
            for (let i = 16; i < this.trafficPattern.packetSize - 4; i += 4) {
                view.setUint32(i, pattern, true);
            }
            
            // Double-check WebSocket state before sending to prevent race conditions
            if (this.websocket.readyState === WebSocket.OPEN && this.isActive) {
                this.websocket.send(packet);
                
                // Update stats only after successful send
                this.trafficState.packetsSent++;
                this.trafficState.bytesSent += packet.byteLength;
                
                // Add to upload history for sliding window calculation
                const now = performance.now();
                this.uploadHistory.push({
                    timestamp: now,
                    bytes: packet.byteLength
                });
                
                // Calculate upload throughput using sliding window
                if (this.trafficState.startTime) {
                    this.trafficState.actualUploadThroughput = this.calculateSlidingWindowUploadThroughput();
                }
                
                // Send traffic update every 200 packets (reduced frequency)
                if (this.trafficState.packetsSent % 200 === 0) {
                    this.dispatchTrafficUpdate();
                }
            } else {
                // WebSocket closed, stop traffic generation
                this.isActive = false;
                this.stop();
            }
            
        } catch (error) {
            console.error(`❌ Failed to send upload packet for ${this.config.userId}:`, error);
            // Stop trying to send if WebSocket is closed
            if (!this.websocket || this.websocket.readyState !== WebSocket.OPEN) {
                this.isActive = false;
                this.stop();
            }
        }
    }
    
    getUserPattern() {
        // User-specific data patterns for identification
        switch (this.config.userId) {
            case 'gamer':
                return 0x47414D45; // "GAME"
            case 'worker':
                return 0x56494445; // "VIDE"
            case 'streamer':
                return 0x53545245; // "STRE"
            case 'downloader':
                return 0x44415441; // "DATA"
            default:
                return 0x55534552; // "USER"
        }
    }
    
    requestDownloadTraffic() {
        // Request download traffic from server
        const downloadRequest = {
            type: 'request_download',
            userId: this.config.userId,
            throughput: this.config.targetThroughput * this.trafficPattern.downloadRatio,
            packetSize: this.trafficPattern.packetSize,
            pattern: this.config.pattern
        };
        
        this.sendControlMessage(downloadRequest);
        
        // Periodically request more download traffic
        this.downloadRequestInterval = setInterval(() => {
            if (this.isActive && this.websocket && this.websocket.readyState === WebSocket.OPEN) {
                this.sendControlMessage(downloadRequest);
            }
        }, 5000); // Request every 5 seconds
    }
    
    dispatchTrafficUpdate() {
        const now = performance.now();
        const totalThroughput = this.trafficState.actualUploadThroughput + this.trafficState.actualDownloadThroughput;
        
        // Send traffic update to main thread
        self.postMessage({
            type: 'traffic-update',
            data: {
                userId: this.config.userId,
                throughput: totalThroughput,
                downloadThroughput: this.trafficState.actualDownloadThroughput,
                uploadThroughput: this.trafficState.actualUploadThroughput,
                status: this.trafficState.active ? 'active' : 'idle',
                packets: this.trafficState.packetsSent + this.trafficState.packetsReceived,
                bytes: this.trafficState.bytesSent + this.trafficState.bytesReceived,
                latency: this.latencyState.averageLatency,
                jitter: this.latencyState.jitter,
                timestamp: now
            }
        });
    }
    
    /**
     * Calculate download throughput using a sliding window approach
     * @returns {number} Throughput in bits per second
     */
    calculateSlidingWindowDownloadThroughput() {
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
    
    /**
     * Calculate upload throughput using a sliding window approach
     * @returns {number} Throughput in bits per second
     */
    calculateSlidingWindowUploadThroughput() {
        const now = performance.now();
        const windowStart = now - this.throughputWindow;
        
        // Remove events older than the window
        this.uploadHistory = this.uploadHistory.filter(event => event.timestamp >= windowStart);
        
        // If no events in window, return 0
        if (this.uploadHistory.length === 0) {
            return 0;
        }
        
        // Calculate total bytes in the window
        const totalBytes = this.uploadHistory.reduce((sum, event) => sum + event.bytes, 0);
        
        // Calculate time span of actual events (not the full window)
        const oldestEvent = this.uploadHistory[0];
        const newestEvent = this.uploadHistory[this.uploadHistory.length - 1];
        const timeSpanMs = newestEvent.timestamp - oldestEvent.timestamp;
        
        // If time span is too small, use the window size
        const effectiveTimeSpanMs = Math.max(timeSpanMs, 1000); // Minimum 1 second
        
        // Convert to bits per second
        const throughputBps = (totalBytes * 8) / (effectiveTimeSpanMs / 1000);
        
        return throughputBps;
    }
    
    stop() {
        if (!this.isActive) return;
        
        this.isActive = false;
        
        // Stop traffic generation
        if (this.uploadInterval) {
            clearInterval(this.uploadInterval);
            this.uploadInterval = null;
        }
        
        if (this.downloadRequestInterval) {
            clearInterval(this.downloadRequestInterval);
            this.downloadRequestInterval = null;
        }
        
        // Stop latency monitoring
        if (this.latencyState.pingInterval) {
            clearInterval(this.latencyState.pingInterval);
            this.latencyState.pingInterval = null;
        }
        
        // Send stop message to server
        if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
            this.sendControlMessage({ type: 'stop_traffic', userId: this.config.userId });
        }
        
        // Close WebSocket
        if (this.websocket) {
            this.websocket.close();
            this.websocket = null;
        }
    }
    
    getStats() {
        const now = performance.now();
        const duration = now - this.startTime;
        
        return {
            isActive: this.isActive,
            duration: duration,
            websocketConnected: this.websocket?.readyState === WebSocket.OPEN,
            trafficActive: this.trafficState.active,
            totalBytesSent: this.trafficState.bytesSent,
            totalBytesReceived: this.trafficState.bytesReceived,
            totalPacketsSent: this.trafficState.packetsSent,
            totalPacketsReceived: this.trafficState.packetsReceived,
            uploadThroughput: this.trafficState.actualUploadThroughput,
            downloadThroughput: this.trafficState.actualDownloadThroughput,
            totalThroughput: this.trafficState.actualUploadThroughput + this.trafficState.actualDownloadThroughput,
            targetThroughput: this.config.targetThroughput,
            latency: this.latencyState.averageLatency,
            jitter: this.latencyState.jitter,
            packetLoss: this.calculatePacketLoss()
        };
    }
    
    calculatePacketLoss() {
        if (this.latencyState.pingSent === 0) return 0;
        const lossRate = (this.latencyState.pingSent - this.latencyState.pongReceived) / this.latencyState.pingSent;
        return Math.max(0, lossRate * 100); // Percentage
    }
}

// Web Worker message handling
self.onmessage = function(event) {
    const { type, config } = event.data;
    
    switch (type) {
        case 'init':
            try {
                websocketWorker = new WebSocketUnifiedWorker(config);
                
                // Auto-start after initialization
                setTimeout(() => {
                    if (websocketWorker) {
                        websocketWorker.start();
                    }
                }, 100);
                
                self.postMessage({
                    type: 'initialized',
                    userId: config.userId
                });
                
            } catch (error) {
                console.error('❌ Failed to initialize WebSocket Unified worker:', error);
                self.postMessage({
                    type: 'error',
                    error: error.message
                });
            }
            break;
            
        case 'start':
            if (websocketWorker) {
                websocketWorker.start();
            }
            break;
            
        case 'stop':
            if (websocketWorker) {
                websocketWorker.stop();
                websocketWorker = null;
            }
            break;
            
        case 'getStats':
            if (websocketWorker) {
                self.postMessage({
                    type: 'stats',
                    stats: websocketWorker.getStats()
                });
            }
            break;
            
        default:
            // Removed verbose logging for unknown message types
            break;
    }
};

// Handle worker errors
self.onerror = function(error) {
    console.error('❌ WebSocket Unified worker error:', error);
    self.postMessage({
        type: 'error',
        error: error.message
    });
};

// WebSocket Unified worker script loaded (removed verbose logging)