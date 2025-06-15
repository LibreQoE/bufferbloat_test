/**
 * Unified WebSocket Manager for Virtual Household Mode
 * Replaces WebRTC with high-performance WebSocket connections
 * Tracks: throughput download, throughput upload, latency, jitter, and loss
 */

class WebSocketManager {
    constructor() {
        this.connections = new Map(); // userId -> WebSocket
        this.connectionStates = new Map(); // userId -> state info
        this.messageHandlers = new Map(); // userId -> message handler
        this.latencyTrackers = new Map(); // userId -> latency data
        this.throughputTrackers = new Map(); // userId -> throughput data
        this.isInitialized = false;
        
        // User configurations matching server-side
        this.userConfigs = {
            'gamer': {
                'dscp': 'EF',
                'priority': 'high',
                'ping_interval': 50,    // 50ms
                'expected_latency': 25, // Expected low latency
                'metrics': ['latency', 'jitter', 'loss']
            },
            'worker': {
                'dscp': 'AF41',
                'priority': 'high',
                'ping_interval': 100,   // 100ms
                'expected_latency': 50, // Expected medium latency
                'metrics': ['latency', 'jitter', 'loss']
            },
            'streamer': {
                'dscp': 'AF31',
                'priority': 'medium',
                'ping_interval': 200,   // 200ms
                'expected_latency': 100, // Expected higher latency
                'metrics': ['quality', 'buffering', 'drops']
            },
            'computer': {
                'dscp': 'BE',
                'priority': 'low',
                'ping_interval': 1000,  // 1s
                'expected_latency': 200, // Expected highest latency
                'metrics': ['throughput', 'progress', 'impact']
            }
        };
        
        console.log('🌐 WebSocket Manager initialized');
    }
    
    async initialize() {
        if (this.isInitialized) {
            console.log('🌐 WebSocket Manager already initialized');
            return;
        }
        
        try {
            console.log('🚀 Initializing WebSocket Manager...');
            
            // Generate WebSocket server URL
            this.serverUrl = this.getWebSocketServerUrl();
            console.log(`🌐 WebSocket server URL: ${this.serverUrl}`);
            
            this.isInitialized = true;
            console.log('✅ WebSocket Manager initialized successfully');
            
        } catch (error) {
            console.error('❌ Failed to initialize WebSocket Manager:', error);
            throw error;
        }
    }
    
    getWebSocketServerUrl() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.host;
        return `${protocol}//${host}`;
    }
    
    async createUserConnection(userId, testId) {
        if (this.connections.has(userId)) {
            console.log(`🌐 Connection already exists for ${userId}`);
            return this.connections.get(userId);
        }
        
        try {
            const startTime = Date.now();
            
            // Step 1: Get worker port from main server (direct connection optimization)
            console.log(`🔍 Getting worker port for ${userId} with test ID ${testId}...`);
            const response = await fetch(`${this.serverUrl}/ws/virtual-household/${userId}`);
            
            if (!response.ok) {
                throw new Error(`Failed to get worker port: ${response.status} ${response.statusText}`);
            }
            
            const workerInfo = await response.json();
            console.log(`📍 Worker info for ${userId}:`, workerInfo);
            
            // Step 2: Connect directly to worker process (bypass main server)
            let wsUrl;
            if (workerInfo.redirect && workerInfo.websocket_url) {
                // Direct connection to worker process with test ID
                wsUrl = `${workerInfo.websocket_url}?test_id=${testId}`;
                console.log(`🚀 Direct connection to worker for ${userId} with test ID ${testId}: ${wsUrl}`);
            } else {
                // Fallback to main server routing with test ID
                wsUrl = `${this.serverUrl}/ws/virtual-household-fallback/${userId}?test_id=${testId}`;
                console.log(`🔄 Fallback connection for ${userId} with test ID ${testId}: ${wsUrl}`);
            }
            
            const ws = new WebSocket(wsUrl);
            
            // Set up connection state tracking
            this.connectionStates.set(userId, {
                state: 'connecting',
                connected_at: null,
                connection_type: workerInfo.redirect ? 'direct_worker' : 'main_server_fallback',
                worker_port: workerInfo.port || null,
                architecture: workerInfo.architecture || 'unknown',
                last_ping: 0,
                latency_samples: [],
                bytes_sent: 0,
                bytes_received: 0,
                messages_sent: 0,
                messages_received: 0,
                packet_loss_count: 0,
                total_packets: 0
            });
            
            // Set up latency tracking
            this.latencyTrackers.set(userId, {
                ping_interval: this.userConfigs[userId]?.ping_interval || 1000,
                last_ping_time: 0,
                pending_pings: new Map(), // timestamp -> ping_data
                latency_history: [],
                jitter_history: [],
                loss_history: [],
                ping_sequence: 0
            });
            
            // Set up throughput tracking
            this.throughputTrackers.set(userId, {
                download_bytes: 0,
                upload_bytes: 0,
                download_start_time: null,
                upload_start_time: null,
                download_throughput: 0,
                upload_throughput: 0,
                throughput_history: [],
                last_throughput_update: 0
            });
            
            // Promise to handle connection establishment
            return new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error(`WebSocket connection timeout for ${userId}`));
                }, 10000); // 10 second timeout
                
                ws.onopen = () => {
                    clearTimeout(timeout);
                    const connectionTime = Date.now();
                    const connectionDuration = connectionTime - startTime;
                    
                    console.log(`✅ WebSocket connected for ${userId} in ${connectionDuration}ms`);
                    console.log(`🔗 Connection type: ${workerInfo.redirect ? 'DIRECT_WORKER' : 'MAIN_SERVER_FALLBACK'}`);
                    if (workerInfo.port) {
                        console.log(`📍 Worker port: ${workerInfo.port}`);
                    }
                    
                    this.connections.set(userId, ws);
                    const state = this.connectionStates.get(userId);
                    state.state = 'connected';
                    state.connected_at = connectionTime;
                    state.connection_duration_ms = connectionDuration;
                    
                    // Initialize throughput tracking start times
                    const throughputTracker = this.throughputTrackers.get(userId);
                    throughputTracker.download_start_time = Date.now();
                    throughputTracker.upload_start_time = Date.now();
                    
                    // Set up message handling
                    this.setupMessageHandling(userId, ws);
                    
                    // Start ping/latency tracking
                    this.startLatencyTracking(userId);
                    
                    // Start throughput monitoring
                    this.startThroughputMonitoring(userId);
                    
                    resolve(ws);
                };
                
                ws.onerror = (error) => {
                    clearTimeout(timeout);
                    console.error(`❌ WebSocket error for ${userId}:`, error);
                    this.cleanup(userId);
                    reject(error);
                };
                
                ws.onclose = (event) => {
                    console.log(`📡 WebSocket closed for ${userId}:`, event.code, event.reason);
                    this.cleanup(userId);
                };
            });
            
        } catch (error) {
            console.error(`❌ Failed to create WebSocket connection for ${userId}:`, error);
            this.cleanup(userId);
            throw error;
        }
    }
    
    setupMessageHandling(userId, ws) {
        ws.onmessage = (event) => {
            try {
                // Update received bytes counter for download throughput
                const state = this.connectionStates.get(userId);
                const throughputTracker = this.throughputTrackers.get(userId);
                
                if (state && throughputTracker) {
                    const messageSize = event.data.length || event.data.byteLength || 0;
                    state.bytes_received += messageSize;
                    state.messages_received += 1;
                    throughputTracker.download_bytes += messageSize;
                }
                
                // Handle different message types
                if (typeof event.data === 'string') {
                    // JSON message
                    const message = JSON.parse(event.data);
                    this.handleJsonMessage(userId, message);
                } else {
                    // Binary message (traffic data)
                    this.handleBinaryMessage(userId, event.data);
                }
                
            } catch (error) {
                console.error(`❌ Error handling message for ${userId}:`, error);
            }
        };
    }
    
    handleJsonMessage(userId, message) {
        const messageType = message.type;
        
        switch (messageType) {
            case 'ping':
                this.handlePing(userId, message);
                break;
                
            case 'pong':
                this.handlePong(userId, message);
                break;
                
            case 'metrics':
                this.handleMetrics(userId, message);
                break;
                
            default:
                console.log(`📨 Received message from ${userId}:`, messageType);
                break;
        }
    }
    
    handleBinaryMessage(userId, data) {
        // Handle binary traffic data for download throughput
        const bytes = data.byteLength || data.length || 0;
        console.log(`📦 Received ${bytes} bytes from ${userId}`);
        
        // Update download throughput
        this.updateDownloadThroughput(userId, bytes);
        
        // Emit traffic event for UI
        window.dispatchEvent(new CustomEvent('websocket-traffic', {
            detail: {
                userId,
                bytes,
                direction: 'download',
                timestamp: performance.now()
            }
        }));
    }
    
    handlePing(userId, message) {
        // Respond to server ping
        const pong = {
            type: 'pong',
            timestamp: message.timestamp,
            client_timestamp: Date.now(),
            sequence: message.sequence || 0
        };
        
        this.sendMessage(userId, pong);
    }
    
    handlePong(userId, message) {
        // Handle server pong response for latency calculation
        const now = Date.now();
        const latency = now - message.client_timestamp;
        
        // Update latency tracking
        const tracker = this.latencyTrackers.get(userId);
        if (tracker) {
            tracker.latency_history.push(latency);
            
            // Calculate jitter (variation in latency)
            if (tracker.latency_history.length > 1) {
                const prevLatency = tracker.latency_history[tracker.latency_history.length - 2];
                const jitter = Math.abs(latency - prevLatency);
                tracker.jitter_history.push(jitter);
            }
            
            // Check for packet loss (if sequence numbers are available)
            if (message.sequence !== undefined) {
                const expectedSequence = tracker.ping_sequence;
                if (message.sequence !== expectedSequence) {
                    const lossCount = message.sequence - expectedSequence;
                    tracker.loss_history.push(lossCount);
                    
                    // Update connection state loss tracking
                    const state = this.connectionStates.get(userId);
                    if (state) {
                        state.packet_loss_count += lossCount;
                        state.total_packets += lossCount + 1;
                    }
                } else {
                    tracker.loss_history.push(0);
                    const state = this.connectionStates.get(userId);
                    if (state) {
                        state.total_packets += 1;
                    }
                }
                tracker.ping_sequence = message.sequence + 1;
            }
            
            // Keep only recent samples (memory optimization)
            if (tracker.latency_history.length > 100) {
                tracker.latency_history = tracker.latency_history.slice(-100);
            }
            if (tracker.jitter_history.length > 100) {
                tracker.jitter_history = tracker.jitter_history.slice(-100);
            }
            if (tracker.loss_history.length > 100) {
                tracker.loss_history = tracker.loss_history.slice(-100);
            }
        }
        
        // Update connection state
        const state = this.connectionStates.get(userId);
        if (state) {
            state.last_ping = now;
            state.latency_samples.push(latency);
            if (state.latency_samples.length > 50) {
                state.latency_samples = state.latency_samples.slice(-50);
            }
        }
        
        // Calculate current metrics
        const currentMetrics = this.calculateCurrentMetrics(userId);
        
        // Emit latency measurement event
        window.dispatchEvent(new CustomEvent('latency-measurement', {
            detail: {
                userId,
                latency: currentMetrics.latency,
                jitter: currentMetrics.jitter,
                loss: currentMetrics.loss,
                timestamp: performance.now()
            }
        }));
    }
    
    handleMetrics(userId, message) {
        // Handle server-provided metrics
        console.log(`📊 Received metrics for ${userId}:`, message);
        
        // Emit metrics event for UI
        window.dispatchEvent(new CustomEvent('websocket-metrics', {
            detail: {
                userId,
                metrics: message,
                timestamp: performance.now()
            }
        }));
    }
    
    startLatencyTracking(userId) {
        const tracker = this.latencyTrackers.get(userId);
        if (!tracker) return;
        
        const sendPing = () => {
            const ws = this.connections.get(userId);
            if (!ws || ws.readyState !== WebSocket.OPEN) return;
            
            const ping = {
                type: 'ping',
                timestamp: Date.now(),
                sequence: tracker.ping_sequence++
            };
            
            this.sendMessage(userId, ping);
            tracker.last_ping_time = Date.now();
        };
        
        // Send initial ping
        setTimeout(sendPing, 100);
        
        // Set up periodic pings
        const pingInterval = setInterval(() => {
            if (!this.connections.has(userId)) {
                clearInterval(pingInterval);
                return;
            }
            sendPing();
        }, tracker.ping_interval);
        
        // Store interval for cleanup
        tracker.pingInterval = pingInterval;
    }
    
    startThroughputMonitoring(userId) {
        const throughputTracker = this.throughputTrackers.get(userId);
        if (!throughputTracker) return;
        
        const updateThroughput = () => {
            if (!this.connections.has(userId)) return;
            
            const now = Date.now();
            const timeSinceLastUpdate = now - throughputTracker.last_throughput_update;
            
            if (timeSinceLastUpdate >= 1000) { // Update every second
                // Calculate download throughput
                const downloadElapsed = (now - throughputTracker.download_start_time) / 1000;
                if (downloadElapsed > 0) {
                    throughputTracker.download_throughput = (throughputTracker.download_bytes * 8) / downloadElapsed; // bits per second
                }
                
                // Calculate upload throughput
                const uploadElapsed = (now - throughputTracker.upload_start_time) / 1000;
                if (uploadElapsed > 0) {
                    throughputTracker.upload_throughput = (throughputTracker.upload_bytes * 8) / uploadElapsed; // bits per second
                }
                
                // Store throughput history
                throughputTracker.throughput_history.push({
                    timestamp: now,
                    download: throughputTracker.download_throughput,
                    upload: throughputTracker.upload_throughput
                });
                
                // Keep only recent history
                if (throughputTracker.throughput_history.length > 300) { // 5 minutes at 1s intervals
                    throughputTracker.throughput_history = throughputTracker.throughput_history.slice(-300);
                }
                
                throughputTracker.last_throughput_update = now;
                
                // Emit throughput update event
                window.dispatchEvent(new CustomEvent('throughput-update', {
                    detail: {
                        userId,
                        downloadThroughput: throughputTracker.download_throughput,
                        uploadThroughput: throughputTracker.upload_throughput,
                        totalThroughput: throughputTracker.download_throughput + throughputTracker.upload_throughput,
                        timestamp: performance.now()
                    }
                }));
            }
        };
        
        // Set up periodic throughput updates
        const throughputInterval = setInterval(updateThroughput, 1000);
        
        // Store interval for cleanup
        throughputTracker.throughputInterval = throughputInterval;
    }
    
    updateDownloadThroughput(userId, bytes) {
        const throughputTracker = this.throughputTrackers.get(userId);
        if (throughputTracker) {
            throughputTracker.download_bytes += bytes;
        }
    }
    
    updateUploadThroughput(userId, bytes) {
        const throughputTracker = this.throughputTrackers.get(userId);
        if (throughputTracker) {
            throughputTracker.upload_bytes += bytes;
        }
    }
    
    sendMessage(userId, message) {
        const ws = this.connections.get(userId);
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            console.warn(`⚠️ Cannot send message to ${userId}: connection not ready`);
            return false;
        }
        
        try {
            const messageStr = JSON.stringify(message);
            ws.send(messageStr);
            
            // Update sent bytes counter for upload throughput
            const state = this.connectionStates.get(userId);
            if (state) {
                state.bytes_sent += messageStr.length;
                state.messages_sent += 1;
            }
            
            this.updateUploadThroughput(userId, messageStr.length);
            
            return true;
        } catch (error) {
            console.error(`❌ Error sending message to ${userId}:`, error);
            return false;
        }
    }
    
    sendBinaryData(userId, data) {
        const ws = this.connections.get(userId);
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            console.warn(`⚠️ Cannot send binary data to ${userId}: connection not ready`);
            return false;
        }
        
        try {
            ws.send(data);
            
            // Update sent bytes counter for upload throughput
            const bytes = data.byteLength || data.length || 0;
            const state = this.connectionStates.get(userId);
            if (state) {
                state.bytes_sent += bytes;
            }
            
            this.updateUploadThroughput(userId, bytes);
            
            // Emit traffic event for UI
            window.dispatchEvent(new CustomEvent('websocket-traffic', {
                detail: {
                    userId,
                    bytes,
                    direction: 'upload',
                    timestamp: performance.now()
                }
            }));
            
            return true;
        } catch (error) {
            console.error(`❌ Error sending binary data to ${userId}:`, error);
            return false;
        }
    }
    
    calculateCurrentMetrics(userId) {
        const latencyTracker = this.latencyTrackers.get(userId);
        const throughputTracker = this.throughputTrackers.get(userId);
        const state = this.connectionStates.get(userId);
        
        if (!latencyTracker || !throughputTracker || !state) {
            return {
                latency: 0,
                jitter: 0,
                loss: 0,
                downloadThroughput: 0,
                uploadThroughput: 0
            };
        }
        
        // Calculate average latency
        const latencyHistory = latencyTracker.latency_history;
        const avgLatency = latencyHistory.length > 0 
            ? latencyHistory.reduce((sum, val) => sum + val, 0) / latencyHistory.length 
            : 0;
        
        // Calculate average jitter
        const jitterHistory = latencyTracker.jitter_history;
        const avgJitter = jitterHistory.length > 0 
            ? jitterHistory.reduce((sum, val) => sum + val, 0) / jitterHistory.length 
            : 0;
        
        // Calculate packet loss percentage
        const lossPercentage = state.total_packets > 0 
            ? (state.packet_loss_count / state.total_packets) * 100 
            : 0;
        
        return {
            latency: avgLatency,
            jitter: avgJitter,
            loss: lossPercentage,
            downloadThroughput: throughputTracker.download_throughput,
            uploadThroughput: throughputTracker.upload_throughput
        };
    }
    
    getLatestMeasurements() {
        const measurements = {};
        
        for (const userId of this.connections.keys()) {
            measurements[userId] = this.calculateCurrentMetrics(userId);
        }
        
        return measurements;
    }
    
    getConnectionStats() {
        const stats = {};
        
        for (const [userId, state] of this.connectionStates) {
            const metrics = this.calculateCurrentMetrics(userId);
            stats[userId] = {
                ...state,
                ...metrics
            };
        }
        
        return stats;
    }
    
    getPerformanceReport() {
        const stats = this.getConnectionStats();
        const report = {
            total_connections: Object.keys(stats).length,
            direct_worker_connections: 0,
            fallback_connections: 0,
            average_latency: 0,
            average_throughput: 0,
            connection_types: {},
            user_performance: {}
        };
        
        let totalLatency = 0;
        let totalThroughput = 0;
        let latencyCount = 0;
        
        for (const [userId, userStats] of Object.entries(stats)) {
            // Count connection types
            if (userStats.connection_type === 'direct_worker') {
                report.direct_worker_connections++;
            } else {
                report.fallback_connections++;
            }
            
            // Track connection types
            const connType = userStats.connection_type || 'unknown';
            if (!report.connection_types[connType]) {
                report.connection_types[connType] = 0;
            }
            report.connection_types[connType]++;
            
            // Calculate averages
            if (userStats.latency > 0) {
                totalLatency += userStats.latency;
                latencyCount++;
            }
            
            const userThroughput = (userStats.downloadThroughput || 0) + (userStats.uploadThroughput || 0);
            totalThroughput += userThroughput;
            
            // Store user performance
            report.user_performance[userId] = {
                connection_type: userStats.connection_type,
                worker_port: userStats.worker_port,
                architecture: userStats.architecture,
                connection_duration_ms: userStats.connection_duration_ms,
                latency_ms: userStats.latency,
                jitter_ms: userStats.jitter,
                loss_percent: userStats.loss,
                download_throughput_bps: userStats.downloadThroughput,
                upload_throughput_bps: userStats.uploadThroughput,
                total_throughput_bps: userThroughput,
                messages_sent: userStats.messages_sent,
                messages_received: userStats.messages_received,
                bytes_sent: userStats.bytes_sent,
                bytes_received: userStats.bytes_received
            };
        }
        
        report.average_latency = latencyCount > 0 ? totalLatency / latencyCount : 0;
        report.average_throughput = report.total_connections > 0 ? totalThroughput / report.total_connections : 0;
        
        return report;
    }
    
    cleanup(userId) {
        // Clean up connection
        if (this.connections.has(userId)) {
            const ws = this.connections.get(userId);
            if (ws.readyState === WebSocket.OPEN) {
                ws.close();
            }
            this.connections.delete(userId);
        }
        
        // Clean up trackers and intervals
        const latencyTracker = this.latencyTrackers.get(userId);
        if (latencyTracker && latencyTracker.pingInterval) {
            clearInterval(latencyTracker.pingInterval);
        }
        
        const throughputTracker = this.throughputTrackers.get(userId);
        if (throughputTracker && throughputTracker.throughputInterval) {
            clearInterval(throughputTracker.throughputInterval);
        }
        
        // Remove from maps
        this.connectionStates.delete(userId);
        this.latencyTrackers.delete(userId);
        this.throughputTrackers.delete(userId);
        
        console.log(`🧹 Cleaned up WebSocket connection for ${userId}`);
    }
    
    async cleanupAll() {
        console.log('🧹 Cleaning up all WebSocket connections');
        
        for (const userId of this.connections.keys()) {
            this.cleanup(userId);
        }
        
        this.isInitialized = false;
    }
    
    // API compatibility methods for replacing WebRTC
    async createUserChannels(userIds, testId) {
        console.log('🔗 Creating WebSocket connections for users:', userIds, 'with test ID:', testId);
        
        const connections = {};
        for (const userId of userIds) {
            try {
                const ws = await this.createUserConnection(userId, testId);
                connections[userId] = ws;
            } catch (error) {
                console.error(`❌ Failed to create connection for ${userId}:`, error);
            }
        }
        
        return connections;
    }
    
    getChannelsForLatencyTracker() {
        // Return a Map compatible with the existing latency tracker
        const channels = new Map();
        
        for (const [userId, ws] of this.connections) {
            if (ws.readyState === WebSocket.OPEN) {
                channels.set(userId, {
                    send: (data) => this.sendBinaryData(userId, data),
                    readyState: 'open'
                });
            }
        }
        
        return channels;
    }
    
    registerWorker(userId, worker) {
        // Handle worker registration for compatibility
        console.log(`🔗 Registering worker for ${userId} with WebSocket`);
        
        // Set up worker message handling
        worker.onmessage = (event) => {
            const message = event.data;
            
            if (message.type === 'send-data' && message.data) {
                this.sendBinaryData(userId, message.data);
            }
        };
        
        // Store worker reference
        if (!this.messageHandlers.has(userId)) {
            this.messageHandlers.set(userId, []);
        }
        this.messageHandlers.get(userId).push(worker);
    }
    
    sendDataToServer(userId, data) {
        return this.sendBinaryData(userId, data);
    }
    
    getSetupInfo() {
        return {
            type: 'WebSocket',
            unified: true,
            concurrent: true,
            dscp_support: true,
            active_connections: this.connections.size
        };
    }
}

export default WebSocketManager;