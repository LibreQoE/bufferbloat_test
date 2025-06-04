/**
 * Latency Tracker for Virtual Household Mode
 * Implements passive RTT measurement via timestamp echoing over WebRTC DataChannels
 */

class LatencyTracker {
    constructor() {
        this.isActive = false;
        this.dataChannels = null;
        this.measurements = new Map();
        this.pingInterval = 200; // Send ping every 200ms
        this.maxHistory = 150; // Keep 30 seconds of history (150 * 200ms)
        this.pingTimers = new Map();
        this.pendingPings = new Map();
        
        // Bind event handlers
        this.handleRTTMeasurement = this.handleRTTMeasurement.bind(this);
        
        // Set up event listeners
        this.setupEventListeners();
    }
    
    setupEventListeners() {
        // Listen for RTT measurements from WebRTC
        window.addEventListener('webrtc-rtt', this.handleRTTMeasurement);
    }
    
    async start(dataChannels) {
        if (this.isActive) {
            console.warn('⚠️ Latency tracker already active');
            return;
        }
        
        console.log('📊 Starting latency tracking');
        console.log('📊 Received data channels:', dataChannels);
        console.log('📊 Data channels type:', typeof dataChannels);
        console.log('📊 Data channels size:', dataChannels?.size);
        console.log('📊 Data channels keys:', Array.from(dataChannels?.keys() || []));
        
        // Log each channel details
        if (dataChannels) {
            for (const [userId, channel] of dataChannels.entries()) {
                console.log(`📡 Channel for ${userId}:`, {
                    label: channel?.label,
                    readyState: channel?.readyState,
                    protocol: channel?.protocol
                });
            }
        }
        
        this.isActive = true;
        this.dataChannels = dataChannels;
        
        // Initialize measurement storage for each user (only for upstream channels)
        for (const channelKey of dataChannels.keys()) {
            // Only initialize measurements for upstream channels (user IDs without suffix)
            if (!channelKey.includes('-downstream')) {
                this.measurements.set(channelKey, {
                    rtts: [],
                    jitters: [],
                    losses: [],
                    lastPingTime: 0,
                    pingCount: 0,
                    pongCount: 0
                });
            }
        }
        
        // Wait for all channels to be open before starting ping timers
        console.log('⏳ Waiting for all channels to be open before starting latency tracking...');
        await this.waitForChannelsOpen();
        
        // Start ping timers for each user
        this.startPingTimers();
        
        console.log('✅ Latency tracking started');
    }
    
    async waitForChannelsOpen(timeout = 30000) {
        const startTime = Date.now();
        const checkInterval = 100;
        
        while (Date.now() - startTime < timeout) {
            let allOpen = true;
            const channelStates = [];
            
            for (const [channelKey, channel] of this.dataChannels.entries()) {
                if (!channelKey.includes('-downstream')) { // Only check upstream channels
                    if (!channel || channel.readyState !== 'open') {
                        allOpen = false;
                        channelStates.push(`${channelKey}: ${channel?.readyState || 'NO_CHANNEL'}`);
                    } else {
                        channelStates.push(`${channelKey}: OPEN`);
                    }
                }
            }
            
            console.log(`📊 Latency tracker channel states: ${channelStates.join(', ')}`);
            
            if (allOpen) {
                console.log('✅ All channels are open - latency tracking can begin');
                return true;
            }
            
            await new Promise(resolve => setTimeout(resolve, checkInterval));
        }
        
        console.error('❌ Timeout waiting for channels to open for latency tracking');
        throw new Error('Channels failed to open for latency tracking');
    }
    
    startPingTimers() {
        const upstreamChannels = Array.from(this.dataChannels.keys()).filter(key => !key.includes('-downstream'));
        console.log('🔄 Starting ping timers for users:', upstreamChannels);
        console.log('📊 Data channels available:', this.dataChannels.size);
        
        for (const userId of upstreamChannels) {
            console.log(`⏰ Creating ping timer for ${userId} (interval: ${this.pingInterval}ms)`);
            const timer = setInterval(() => {
                this.sendPing(userId);
            }, this.pingInterval);
            
            this.pingTimers.set(userId, timer);
            console.log(`✅ Ping timer created for ${userId}`);
        }
        
        console.log(`📊 Total ping timers created: ${this.pingTimers.size}`);
    }
    
    sendPing(userId) {
        if (!this.isActive || !this.dataChannels) return;
        
        const channel = this.dataChannels.get(userId);
        if (!channel || channel.readyState !== 'open') {
            console.warn(`⚠️ Cannot send ping to ${userId}: channel not available or not open. State: ${channel?.readyState}, Label: ${channel?.label}`);
            return;
        }
        
        try {
            const pingId = Math.random().toString(36).substr(2, 9);
            const timestamp = performance.now();
            
            console.log(`📡 Sending ping to ${userId} on channel ${channel.label} (state: ${channel.readyState})`);
            
            // Send binary timestamp for high precision
            const buffer = new ArrayBuffer(16); // 8 bytes timestamp + 8 bytes ping ID hash
            const view = new Float64Array(buffer);
            view[0] = timestamp;
            view[1] = this.hashString(pingId); // Simple hash for ping ID
            
            channel.send(buffer);
            console.log(`✅ Ping sent to ${userId}: ${timestamp.toFixed(2)}ms, pingId: ${pingId}`);
            
            // Track pending ping
            if (!this.pendingPings.has(userId)) {
                this.pendingPings.set(userId, new Map());
            }
            this.pendingPings.get(userId).set(pingId, timestamp);
            
            // Update ping count
            const userMeasurements = this.measurements.get(userId);
            if (userMeasurements) {
                userMeasurements.pingCount++;
                userMeasurements.lastPingTime = timestamp;
            }
            
            // Clean up old pending pings (older than 5 seconds)
            this.cleanupOldPings(userId, timestamp);
            
        } catch (error) {
            console.error(`❌ Failed to send ping to ${userId}:`, error);
            console.error(`❌ Channel details:`, {
                label: channel?.label,
                readyState: channel?.readyState,
                bufferedAmount: channel?.bufferedAmount
            });
        }
    }
    
    hashString(str) {
        // Simple hash function for ping ID
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return hash;
    }
    
    cleanupOldPings(userId, currentTime) {
        const pendingPings = this.pendingPings.get(userId);
        if (!pendingPings) return;
        
        const timeout = 5000; // 5 seconds
        for (const [pingId, timestamp] of pendingPings.entries()) {
            if (currentTime - timestamp > timeout) {
                pendingPings.delete(pingId);
            }
        }
    }
    
    handleRTTMeasurement(event) {
        const { userId, rtt, timestamp } = event.detail;
        
        if (!this.isActive || !this.measurements.has(userId)) return;
        
        const userMeasurements = this.measurements.get(userId);
        
        // Add RTT measurement
        userMeasurements.rtts.push({
            value: rtt,
            timestamp: timestamp
        });
        
        // Update pong count
        userMeasurements.pongCount++;
        
        // Calculate jitter (variation in RTT)
        if (userMeasurements.rtts.length >= 2) {
            const prevRTT = userMeasurements.rtts[userMeasurements.rtts.length - 2].value;
            const jitter = Math.abs(rtt - prevRTT);
            
            userMeasurements.jitters.push({
                value: jitter,
                timestamp: timestamp
            });
        }
        
        // Calculate packet loss
        const lossRate = this.calculatePacketLoss(userId);
        userMeasurements.losses.push({
            value: lossRate,
            timestamp: timestamp
        });
        
        // Trim history to max size
        this.trimHistory(userMeasurements);
        
        // Dispatch updated measurements
        this.dispatchMeasurementUpdate(userId, {
            latency: rtt,
            jitter: this.getLatestJitter(userId),
            loss: lossRate,
            timestamp: timestamp
        });
    }
    
    calculatePacketLoss(userId) {
        const userMeasurements = this.measurements.get(userId);
        if (!userMeasurements) return 0;
        
        const { pingCount, pongCount } = userMeasurements;
        
        if (pingCount === 0) return 0;
        
        const lossRate = ((pingCount - pongCount) / pingCount) * 100;
        return Math.max(0, Math.min(100, lossRate)); // Clamp between 0-100%
    }
    
    getLatestJitter(userId) {
        const userMeasurements = this.measurements.get(userId);
        if (!userMeasurements || userMeasurements.jitters.length === 0) return 0;
        
        return userMeasurements.jitters[userMeasurements.jitters.length - 1].value;
    }
    
    trimHistory(userMeasurements) {
        // Trim each array to max history size
        if (userMeasurements.rtts.length > this.maxHistory) {
            userMeasurements.rtts = userMeasurements.rtts.slice(-this.maxHistory);
        }
        
        if (userMeasurements.jitters.length > this.maxHistory) {
            userMeasurements.jitters = userMeasurements.jitters.slice(-this.maxHistory);
        }
        
        if (userMeasurements.losses.length > this.maxHistory) {
            userMeasurements.losses = userMeasurements.losses.slice(-this.maxHistory);
        }
    }
    
    dispatchMeasurementUpdate(userId, data) {
        window.dispatchEvent(new CustomEvent('latency-measurement', {
            detail: {
                userId,
                ...data
            }
        }));
    }
    
    getLatestMeasurements() {
        const latest = {};
        
        for (const [userId, userMeasurements] of this.measurements) {
            const rtts = userMeasurements.rtts;
            const jitters = userMeasurements.jitters;
            const losses = userMeasurements.losses;
            
            latest[userId] = {
                latency: rtts.length > 0 ? rtts[rtts.length - 1].value : 0,
                jitter: jitters.length > 0 ? jitters[jitters.length - 1].value : 0,
                loss: losses.length > 0 ? losses[losses.length - 1].value : 0,
                timestamp: performance.now()
            };
        }
        
        return latest;
    }
    
    getMeasurementHistory(userId, metric = 'latency', duration = 30000) {
        const userMeasurements = this.measurements.get(userId);
        if (!userMeasurements) return [];
        
        const now = performance.now();
        const cutoff = now - duration;
        
        let data;
        switch (metric) {
            case 'latency':
                data = userMeasurements.rtts;
                break;
            case 'jitter':
                data = userMeasurements.jitters;
                break;
            case 'loss':
                data = userMeasurements.losses;
                break;
            default:
                return [];
        }
        
        return data.filter(point => point.timestamp >= cutoff);
    }
    
    getStatistics(userId, metric = 'latency', duration = 30000) {
        const history = this.getMeasurementHistory(userId, metric, duration);
        
        if (history.length === 0) {
            return {
                min: 0,
                max: 0,
                average: 0,
                median: 0,
                p95: 0,
                count: 0
            };
        }
        
        const values = history.map(point => point.value).sort((a, b) => a - b);
        const count = values.length;
        
        const min = values[0];
        const max = values[count - 1];
        const average = values.reduce((sum, val) => sum + val, 0) / count;
        
        const medianIndex = Math.floor(count / 2);
        const median = count % 2 === 0 
            ? (values[medianIndex - 1] + values[medianIndex]) / 2
            : values[medianIndex];
        
        const p95Index = Math.floor(count * 0.95);
        const p95 = values[Math.min(p95Index, count - 1)];
        
        return {
            min,
            max,
            average,
            median,
            p95,
            count
        };
    }
    
    getAllStatistics(duration = 30000) {
        const stats = {};
        
        for (const userId of this.measurements.keys()) {
            stats[userId] = {
                latency: this.getStatistics(userId, 'latency', duration),
                jitter: this.getStatistics(userId, 'jitter', duration),
                loss: this.getStatistics(userId, 'loss', duration)
            };
        }
        
        return stats;
    }
    
    getTimelineData(duration = 30000) {
        const timeline = {};
        
        for (const userId of this.measurements.keys()) {
            timeline[userId] = this.getMeasurementHistory(userId, 'latency', duration);
        }
        
        return timeline;
    }
    
    stop() {
        if (!this.isActive) return;
        
        console.log('🛑 Stopping latency tracking');
        
        // Clear ping timers
        for (const timer of this.pingTimers.values()) {
            clearInterval(timer);
        }
        this.pingTimers.clear();
        
        // Clear pending pings
        this.pendingPings.clear();
        
        this.isActive = false;
        this.dataChannels = null;
        
        console.log('✅ Latency tracking stopped');
    }
    
    reset() {
        console.log('🔄 Resetting latency tracker');
        
        // Clear all measurements
        for (const userMeasurements of this.measurements.values()) {
            userMeasurements.rtts = [];
            userMeasurements.jitters = [];
            userMeasurements.losses = [];
            userMeasurements.pingCount = 0;
            userMeasurements.pongCount = 0;
            userMeasurements.lastPingTime = 0;
        }
        
        // Clear pending pings
        this.pendingPings.clear();
        
        console.log('✅ Latency tracker reset');
    }
    
    // Export data for analysis
    exportData() {
        const exportData = {
            timestamp: new Date().toISOString(),
            duration: this.isActive ? performance.now() - this.startTime : 0,
            users: {}
        };
        
        for (const [userId, userMeasurements] of this.measurements) {
            exportData.users[userId] = {
                rtts: [...userMeasurements.rtts],
                jitters: [...userMeasurements.jitters],
                losses: [...userMeasurements.losses],
                pingCount: userMeasurements.pingCount,
                pongCount: userMeasurements.pongCount,
                statistics: {
                    latency: this.getStatistics(userId, 'latency'),
                    jitter: this.getStatistics(userId, 'jitter'),
                    loss: this.getStatistics(userId, 'loss')
                }
            };
        }
        
        return exportData;
    }
    
    // Cleanup
    destroy() {
        this.stop();
        
        // Remove event listeners
        window.removeEventListener('webrtc-rtt', this.handleRTTMeasurement);
        
        // Clear all data
        this.measurements.clear();
        this.pendingPings.clear();
        this.pingTimers.clear();
        
        console.log('🗑️ Latency tracker destroyed');
    }
}

export default LatencyTracker;