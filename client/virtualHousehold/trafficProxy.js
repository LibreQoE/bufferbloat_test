/**
 * Traffic Proxy - Bridges Web Workers to Real WebRTC Data Channels
 * Enables real network traffic generation instead of mock data channels
 */

class TrafficProxy {
    constructor(webrtcSetup) {
        this.webrtcSetup = webrtcSetup;
        this.workers = new Map();
        this.upstreamChannels = new Map();
        this.downstreamChannels = new Map();
        this.trafficManager = null;
        this.isActive = false;
        
        // Traffic statistics
        this.stats = {
            upstreamBytes: 0,
            downstreamBytes: 0,
            upstreamPackets: 0,
            downstreamPackets: 0,
            startTime: null
        };
        
        console.log('🔄 Traffic Proxy initialized');
    }
    
    /**
     * Initialize the proxy with traffic manager
     */
    async initialize(trafficManager) {
        this.trafficManager = trafficManager;
        this.stats.startTime = performance.now();
        this.isActive = true;
        
        console.log('✅ Traffic Proxy ready');
    }
    
    /**
     * Register a worker with the proxy
     */
    registerWorker(workerId, worker) {
        this.workers.set(workerId, worker);
        
        // Set up message handling for this worker
        if (worker.addEventListener) {
            // Real Web Worker
            worker.addEventListener('message', (event) => {
                this.handleWorkerMessage(workerId, event.data);
            });
        } else if (worker.onmessage !== undefined) {
            // Mock worker with onmessage property
            const originalOnMessage = worker.onmessage;
            worker.onmessage = (event) => {
                this.handleWorkerMessage(workerId, event.data);
                if (originalOnMessage) {
                    originalOnMessage(event);
                }
            };
        }
        
        console.log(`📝 Registered worker: ${workerId}`);
    }
    
    /**
     * Set up bidirectional channels for a worker
     */
    setupChannels(workerId, upstreamChannel, downstreamChannel) {
        this.upstreamChannels.set(workerId, upstreamChannel);
        this.downstreamChannels.set(workerId, downstreamChannel);
        
        // Set up upstream channel handlers
        upstreamChannel.onopen = () => {
            console.log(`📤 Upstream channel open for ${workerId}`);
        };
        
        upstreamChannel.onmessage = (event) => {
            this.handleUpstreamMessage(workerId, event.data);
        };
        
        upstreamChannel.onerror = (error) => {
            console.error(`❌ Upstream channel error for ${workerId}:`, error);
        };
        
        // Set up downstream channel handlers
        downstreamChannel.onopen = () => {
            console.log(`📥 Downstream channel open for ${workerId}`);
        };
        
        downstreamChannel.onmessage = (event) => {
            this.handleDownstreamMessage(workerId, event.data);
        };
        
        downstreamChannel.onerror = (error) => {
            console.error(`❌ Downstream channel error for ${workerId}:`, error);
        };
        
        console.log(`🔗 Channels set up for ${workerId}`);
    }
    
    /**
     * Set up server response channel for downstream traffic
     */
    setupServerResponseChannel(workerId, serverResponseChannel) {
        console.log(`📡 Setting up server response channel for ${workerId}: ${serverResponseChannel.label}, state: ${serverResponseChannel.readyState}`);
        
        // Set up server response channel handlers for downstream traffic
        serverResponseChannel.onopen = () => {
            console.log(`📥 Server response channel open for ${workerId}: ${serverResponseChannel.label}`);
        };
        
        serverResponseChannel.onmessage = (event) => {
            console.log(`📥 Received server response for ${workerId} on ${serverResponseChannel.label}, size: ${event.data?.byteLength || event.data?.length || 'unknown'}, forwarding to worker`);
            this.handleDownstreamMessage(workerId, event.data);
        };
        
        serverResponseChannel.onerror = (error) => {
            console.error(`❌ Server response channel error for ${workerId} on ${serverResponseChannel.label}:`, error);
        };
        
        serverResponseChannel.onclose = () => {
            console.log(`📥 Server response channel closed for ${workerId}: ${serverResponseChannel.label}`);
        };
        
        console.log(`✅ Server response channel connected for ${workerId}: ${serverResponseChannel.label}`);
    }
    
    /**
     * Handle messages from workers
     */
    handleWorkerMessage(workerId, message) {
        console.log(`🔄 Traffic proxy received message from ${workerId}:`, message.type);
        
        if (!this.isActive) {
            console.warn(`⚠️ Traffic proxy not active, ignoring ${message.type} from ${workerId}`);
            return;
        }
        
        switch (message.type) {
            case 'upstream-traffic':
                console.log(`📤 Handling upstream traffic from ${workerId}, size: ${message.data?.byteLength || message.data?.length || 'unknown'}`);
                this.handleUpstreamTraffic(workerId, message.data, message.dscp);
                break;
                
            case 'downstream-request':
                console.log(`📥 Handling downstream request from ${workerId}`);
                this.handleDownstreamRequest(workerId, message.requestData || message.data);
                break;
                
            case 'traffic-stats-request':
                console.log(`📊 Handling stats request from ${workerId}`);
                this.sendTrafficStats(workerId);
                break;
                
            case 'traffic-update':
                console.log(`📊 Forwarding traffic update from ${workerId} to main thread`);
                this.forwardToMainThread(workerId, message);
                break;
                
            default:
                console.log(`📨 Passing through ${message.type} from ${workerId}`);
                break;
        }
    }
    
    /**
     * Handle upstream traffic from workers to WebRTC
     */
    handleUpstreamTraffic(workerId, data, dscp = 'BE') {
        const channel = this.upstreamChannels.get(workerId);
        
        console.log(`📤 Processing upstream traffic for ${workerId}: channel=${channel?.label}, state=${channel?.readyState}, dscp=${dscp}`);
        
        if (!channel || channel.readyState !== 'open') {
            console.warn(`⚠️ Upstream channel not ready for ${workerId}: channel=${!!channel}, state=${channel?.readyState}`);
            return false;
        }
        
        try {
            // Create traffic packet with QoS information
            const packet = {
                workerId: workerId,
                data: data,
                dscp: dscp,
                timestamp: performance.now(),
                direction: 'upstream'
            };
            
            const dataSize = data.byteLength || data.length || 0;
            console.log(`📦 Sending ${dataSize} bytes from ${workerId} with DSCP ${dscp}`);
            
            // Use traffic manager for QoS scheduling if available
            if (this.trafficManager) {
                console.log(`🚦 Using traffic manager for ${workerId}`);
                this.trafficManager.scheduleUpstreamTraffic(packet, channel);
            } else {
                console.log(`📡 Direct send for ${workerId} (no traffic manager)`);
                channel.send(data);
            }
            
            // Update statistics
            this.stats.upstreamPackets++;
            this.stats.upstreamBytes += dataSize;
            
            console.log(`✅ Successfully processed upstream traffic for ${workerId}: packets=${this.stats.upstreamPackets}, bytes=${this.stats.upstreamBytes}`);
            return true;
            
        } catch (error) {
            console.error(`❌ Failed to send upstream traffic for ${workerId}:`, error);
            return false;
        }
    }
    
    /**
     * Handle downstream traffic requests from workers
     */
    handleDownstreamRequest(workerId, requestData) {
        console.log(`📥 Processing downstream request for ${workerId}:`, requestData?.type);
        
        // Handle all downstream requests via WebRTC (including Netflix)
        const channel = this.upstreamChannels.get(workerId);
        
        if (!channel || channel.readyState !== 'open') {
            console.warn(`⚠️ Cannot send downstream request for ${workerId}: channel=${!!channel}, state=${channel?.readyState}`);
            return false;
        }
        
        if (!requestData) {
            console.error(`❌ No requestData provided for ${workerId}`);
            return false;
        }
        
        try {
            // Handle binary download chunk requests
            if (requestData.type === 'binary_download_chunk_request' && requestData.binaryData) {
                console.log(`📤 Forwarding binary download chunk request for ${workerId} to server (${requestData.binaryData.byteLength} bytes)`);
                channel.send(requestData.binaryData);
                console.log(`✅ Successfully sent binary downstream request for ${workerId}`);
                return true;
            }
            
            // Handle legacy JSON requests (fallback)
            const request = {
                ...requestData,
                workerId: workerId,
                timestamp: performance.now()
            };
            
            console.log(`📤 Forwarding ${requestData.type} request for ${workerId} to server (${JSON.stringify(request).length} bytes)`);
            
            channel.send(JSON.stringify(request));
            console.log(`✅ Successfully sent downstream request for ${workerId}`);
            return true;
            
        } catch (error) {
            console.error(`❌ Failed to send downstream request for ${workerId}:`, error);
            return false;
        }
    }
    
    /**
     * Handle upstream messages (from server via WebRTC)
     */
    handleUpstreamMessage(workerId, data) {
        // This is typically server acknowledgments or responses
        const worker = this.workers.get(workerId);
        
        if (worker) {
            worker.postMessage({
                type: 'upstream-response',
                data: data,
                timestamp: performance.now()
            });
        }
    }
    
    /**
     * Handle downstream messages (from server via WebRTC)
     */
    handleDownstreamMessage(workerId, data) {
        const worker = this.workers.get(workerId);
        
        if (!worker) {
            console.warn(`⚠️ No worker found for downstream traffic: ${workerId}`);
            return;
        }
        
        try {
            // Send downstream traffic to worker
            worker.postMessage({
                type: 'downstream-traffic',
                data: data,
                timestamp: performance.now()
            });
            
            // Update statistics
            this.stats.downstreamPackets++;
            this.stats.downstreamBytes += data.byteLength || data.length || 0;
            
        } catch (error) {
            console.error(`❌ Failed to forward downstream traffic to ${workerId}:`, error);
        }
    }
    
    /**
     * Forward messages to the main thread (virtualHousehold controller)
     */
    forwardToMainThread(workerId, message) {
        // Dispatch a custom event that the main thread can listen for
        window.dispatchEvent(new CustomEvent('worker-message', {
            detail: {
                workerId: workerId,
                message: message
            }
        }));
    }
    
    /**
     * Send traffic statistics to a worker
     */
    sendTrafficStats(workerId) {
        const worker = this.workers.get(workerId);
        
        if (worker) {
            const now = performance.now();
            const duration = now - this.stats.startTime;
            
            const stats = {
                upstreamThroughput: (this.stats.upstreamBytes * 8) / (duration / 1000),
                downstreamThroughput: (this.stats.downstreamBytes * 8) / (duration / 1000),
                upstreamPackets: this.stats.upstreamPackets,
                downstreamPackets: this.stats.downstreamPackets,
                upstreamBytes: this.stats.upstreamBytes,
                downstreamBytes: this.stats.downstreamBytes,
                duration: duration
            };
            
            worker.postMessage({
                type: 'traffic-stats',
                stats: stats
            });
        }
    }
    
    /**
     * Get overall proxy statistics
     */
    getStats() {
        const now = performance.now();
        const duration = now - this.stats.startTime;
        
        return {
            isActive: this.isActive,
            duration: duration,
            upstreamThroughput: (this.stats.upstreamBytes * 8) / (duration / 1000),
            downstreamThroughput: (this.stats.downstreamBytes * 8) / (duration / 1000),
            upstreamPackets: this.stats.upstreamPackets,
            downstreamPackets: this.stats.downstreamPackets,
            upstreamBytes: this.stats.upstreamBytes,
            downstreamBytes: this.stats.downstreamBytes,
            activeWorkers: this.workers.size,
            activeChannels: {
                upstream: Array.from(this.upstreamChannels.values()).filter(c => c.readyState === 'open').length,
                downstream: Array.from(this.downstreamChannels.values()).filter(c => c.readyState === 'open').length
            }
        };
    }
    
    /**
     * Stop the proxy and clean up resources
     */
    stop() {
        console.log('🛑 Stopping Traffic Proxy');
        
        this.isActive = false;
        
        // Close all channels
        for (const [workerId, channel] of this.upstreamChannels) {
            if (channel.readyState === 'open') {
                channel.close();
            }
        }
        
        for (const [workerId, channel] of this.downstreamChannels) {
            if (channel.readyState === 'open') {
                channel.close();
            }
        }
        
        // Clear maps
        this.workers.clear();
        this.upstreamChannels.clear();
        this.downstreamChannels.clear();
        
        console.log('✅ Traffic Proxy stopped');
    }
    
    /**
     * Reset proxy statistics
     */
    resetStats() {
        this.stats = {
            upstreamBytes: 0,
            downstreamBytes: 0,
            upstreamPackets: 0,
            downstreamPackets: 0,
            startTime: performance.now()
        };
        
        console.log('🔄 Traffic Proxy stats reset');
    }
}

export default TrafficProxy;