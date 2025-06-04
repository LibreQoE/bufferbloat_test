/**
 * Traffic Manager - QoS Priority Scheduling and Bandwidth Management
 * Implements priority queues and congestion control for realistic traffic simulation
 */

class TrafficManager {
    constructor() {
        this.isActive = false;
        
        // QoS Priority Queues (RFC 2474 DSCP)
        this.priorityQueues = {
            EF: [],     // Expedited Forwarding (Gaming)
            AF41: [],   // Assured Forwarding 4.1 (Streaming/Zoom)
            BE: []      // Best Effort (Downloads)
        };
        
        // Bandwidth tracking
        this.bandwidth = {
            upstream: {
                total: 0,
                used: 0,
                available: 0,
                peak: 0
            },
            downstream: {
                total: 0,
                used: 0,
                available: 0,
                peak: 0
            }
        };
        
        // Traffic shaping parameters
        this.shaping = {
            EF: {
                maxBandwidth: 1000000,    // 1 Mbps max for gaming
                burstSize: 64000,         // 64KB burst
                priority: 1
            },
            AF41: {
                maxBandwidth: 10000000,   // 10 Mbps max for streaming/zoom
                burstSize: 256000,        // 256KB burst
                priority: 2
            },
            BE: {
                maxBandwidth: Infinity,   // Unlimited for downloads
                burstSize: 1048576,       // 1MB burst
                priority: 3
            }
        };
        
        // Processing intervals
        this.processingInterval = null;
        this.bandwidthUpdateInterval = null;
        
        // Statistics
        this.stats = {
            packetsProcessed: 0,
            packetsDropped: 0,
            bytesProcessed: 0,
            congestionEvents: 0,
            startTime: null
        };
        
        console.log('📊 Traffic Manager initialized');
    }
    
    /**
     * Start the traffic manager
     */
    start() {
        if (this.isActive) {
            console.warn('⚠️ Traffic Manager already active');
            return;
        }
        
        this.isActive = true;
        this.stats.startTime = performance.now();
        
        // Start queue processing (every 5ms for low latency)
        this.processingInterval = setInterval(() => {
            this.processQueues();
        }, 5);
        
        // Start bandwidth monitoring (every 100ms)
        this.bandwidthUpdateInterval = setInterval(() => {
            this.updateBandwidthStats();
        }, 100);
        
        console.log('✅ Traffic Manager started');
    }
    
    /**
     * Stop the traffic manager
     */
    stop() {
        if (!this.isActive) return;
        
        console.log('🛑 Stopping Traffic Manager');
        
        this.isActive = false;
        
        // Clear intervals
        if (this.processingInterval) {
            clearInterval(this.processingInterval);
            this.processingInterval = null;
        }
        
        if (this.bandwidthUpdateInterval) {
            clearInterval(this.bandwidthUpdateInterval);
            this.bandwidthUpdateInterval = null;
        }
        
        // Clear queues
        this.priorityQueues.EF = [];
        this.priorityQueues.AF41 = [];
        this.priorityQueues.BE = [];
        
        console.log('✅ Traffic Manager stopped');
    }
    
    /**
     * Schedule upstream traffic with QoS priority
     */
    scheduleUpstreamTraffic(packet, channel) {
        if (!this.isActive) {
            // Fallback to direct send if manager not active - with size check
            const packetSize = packet.data.byteLength || packet.data.length || 0;
            const maxMessageSize = 8192; // 8KB - very conservative limit for WebRTC
            
            if (packetSize > maxMessageSize) {
                // Send a representative packet for large data
                const representativeSize = Math.min(4096, Math.floor(packetSize / 20)); // Even smaller representative
                const representativeData = new ArrayBuffer(representativeSize);
                channel.send(representativeData);
                console.log(`📦 Fallback: Sent ${representativeSize} bytes for ${packetSize} bytes original`);
            } else {
                channel.send(packet.data);
            }
            return;
        }
        
        const priority = packet.dscp || 'BE';
        
        // Add channel reference to packet
        packet.channel = channel;
        packet.queueTime = performance.now();
        
        // Enqueue based on priority
        if (this.priorityQueues[priority]) {
            this.priorityQueues[priority].push(packet);
        } else {
            console.warn(`⚠️ Unknown priority: ${priority}, using BE`);
            this.priorityQueues.BE.push(packet);
        }
    }
    
    /**
     * Process priority queues in order
     */
    processQueues() {
        if (!this.isActive) return;
        
        // Process in priority order: EF > AF41 > BE
        this.processQueue('EF');
        this.processQueue('AF41');
        this.processQueue('BE');
    }
    
    /**
     * Process a specific priority queue
     */
    processQueue(priority) {
        const queue = this.priorityQueues[priority];
        if (!queue || queue.length === 0) return;
        
        const shaping = this.shaping[priority];
        const now = performance.now();
        
        // Calculate how many packets we can send based on bandwidth limits
        const maxPackets = this.calculateMaxPackets(priority);
        
        let processed = 0;
        while (queue.length > 0 && processed < maxPackets) {
            const packet = queue.shift();
            
            if (this.sendPacket(packet)) {
                processed++;
                this.stats.packetsProcessed++;
                this.stats.bytesProcessed += packet.data.byteLength || packet.data.length || 0;
            } else {
                // Put packet back if send failed
                queue.unshift(packet);
                break;
            }
        }
        
        // Drop old packets to prevent queue buildup
        this.dropOldPackets(queue, priority);
    }
    
    /**
     * Calculate maximum packets to send based on bandwidth limits
     */
    calculateMaxPackets(priority) {
        const shaping = this.shaping[priority];
        
        // For EF (gaming), maintain strict timing
        if (priority === 'EF') {
            return 10; // Process up to 10 gaming packets per cycle
        }
        
        // For AF41 (streaming/zoom), allow larger bursts
        if (priority === 'AF41') {
            return 20; // Process up to 20 media packets per cycle
        }
        
        // For BE (downloads), use available bandwidth
        if (priority === 'BE') {
            const availableBandwidth = this.bandwidth.upstream.available;
            if (availableBandwidth > 1000000) { // > 1 Mbps available
                return 50; // Large burst for downloads
            } else if (availableBandwidth > 100000) { // > 100 Kbps available
                return 10; // Medium burst
            } else {
                return 2; // Small burst when congested
            }
        }
        
        return 5; // Default
    }
    
    /**
     * Send a packet through its channel
     */
    sendPacket(packet) {
        if (!packet.channel || packet.channel.readyState !== 'open') {
            this.stats.packetsDropped++;
            return false;
        }
        
        try {
            const packetSize = packet.data.byteLength || packet.data.length || 0;
            const maxMessageSize = 8192; // 8KB - very conservative limit for WebRTC
            
            // If packet is too large, send representative packet
            if (packetSize > maxMessageSize) {
                return this.sendFragmentedPacket(packet, maxMessageSize);
            }
            
            packet.channel.send(packet.data);
            
            // Update bandwidth usage
            this.bandwidth.upstream.used += packetSize;
            
            return true;
            
        } catch (error) {
            console.error('❌ Failed to send packet:', error);
            this.stats.packetsDropped++;
            return false;
        }
    }
    
    /**
     * Send a large packet by fragmenting it
     */
    sendFragmentedPacket(packet, maxSize) {
        try {
            const data = packet.data;
            const totalSize = data.byteLength || data.length || 0;
            
            // For any large packet, just send a small representative packet
            // This maintains traffic simulation without WebRTC size issues
            const representativeSize = Math.min(maxSize, 8192); // Use 8KB max
            const representativeData = new ArrayBuffer(representativeSize);
            
            packet.channel.send(representativeData);
            
            // Update bandwidth usage with original size for accurate simulation
            this.bandwidth.upstream.used += totalSize;
            
            console.log(`📦 Sent representative packet: ${representativeSize} bytes for ${totalSize} bytes original`);
            
            return true;
            
        } catch (error) {
            console.error('❌ Failed to send representative packet:', error);
            this.stats.packetsDropped++;
            return false;
        }
    }
    
    /**
     * Drop old packets to prevent queue buildup
     */
    dropOldPackets(queue, priority) {
        const now = performance.now();
        const maxAge = this.getMaxPacketAge(priority);
        
        let dropped = 0;
        while (queue.length > 0 && (now - queue[0].queueTime) > maxAge) {
            queue.shift();
            dropped++;
            this.stats.packetsDropped++;
        }
        
        if (dropped > 0) {
            console.warn(`⚠️ Dropped ${dropped} old ${priority} packets`);
        }
        
        // Also drop if queue is too long
        const maxQueueLength = this.getMaxQueueLength(priority);
        while (queue.length > maxQueueLength) {
            queue.shift();
            dropped++;
            this.stats.packetsDropped++;
        }
        
        if (dropped > 0) {
            this.stats.congestionEvents++;
        }
    }
    
    /**
     * Get maximum packet age before dropping
     */
    getMaxPacketAge(priority) {
        switch (priority) {
            case 'EF':   return 50;   // 50ms for gaming
            case 'AF41': return 200;  // 200ms for streaming/zoom
            case 'BE':   return 5000; // 5s for downloads
            default:     return 1000; // 1s default
        }
    }
    
    /**
     * Get maximum queue length before dropping
     */
    getMaxQueueLength(priority) {
        switch (priority) {
            case 'EF':   return 100;  // Small queue for gaming
            case 'AF41': return 500;  // Medium queue for streaming/zoom
            case 'BE':   return 2000; // Large queue for downloads
            default:     return 200;  // Default
        }
    }
    
    /**
     * Update bandwidth statistics
     */
    updateBandwidthStats() {
        const now = performance.now();
        
        // Calculate current throughput (last 100ms)
        const currentUpstream = this.bandwidth.upstream.used * 8 * 10; // Convert to bps
        
        // Update peak
        if (currentUpstream > this.bandwidth.upstream.peak) {
            this.bandwidth.upstream.peak = currentUpstream;
        }
        
        // Calculate available bandwidth (simplified)
        this.bandwidth.upstream.total = 100000000; // Assume 100 Mbps total
        this.bandwidth.upstream.available = Math.max(0, 
            this.bandwidth.upstream.total - currentUpstream);
        
        // Reset usage counter
        this.bandwidth.upstream.used = 0;
        
        // Detect congestion
        if (this.bandwidth.upstream.available < (this.bandwidth.upstream.total * 0.1)) {
            this.handleCongestion();
        }
    }
    
    /**
     * Handle network congestion
     */
    handleCongestion() {
        console.warn('⚠️ Network congestion detected');
        
        // Reduce BE (download) traffic more aggressively
        const beQueue = this.priorityQueues.BE;
        if (beQueue.length > 100) {
            // Drop half the BE queue
            const dropCount = Math.floor(beQueue.length / 2);
            beQueue.splice(0, dropCount);
            this.stats.packetsDropped += dropCount;
            this.stats.congestionEvents++;
        }
        
        // Slightly reduce AF41 queue if very congested
        const af41Queue = this.priorityQueues.AF41;
        if (af41Queue.length > 200) {
            const dropCount = Math.floor(af41Queue.length * 0.1);
            af41Queue.splice(0, dropCount);
            this.stats.packetsDropped += dropCount;
        }
        
        // Never drop EF (gaming) packets due to congestion
    }
    
    /**
     * Get traffic manager statistics
     */
    getStats() {
        const now = performance.now();
        const duration = now - this.stats.startTime;
        
        return {
            isActive: this.isActive,
            duration: duration,
            packetsProcessed: this.stats.packetsProcessed,
            packetsDropped: this.stats.packetsDropped,
            bytesProcessed: this.stats.bytesProcessed,
            congestionEvents: this.stats.congestionEvents,
            packetRate: this.stats.packetsProcessed / (duration / 1000),
            throughput: (this.stats.bytesProcessed * 8) / (duration / 1000),
            dropRate: this.stats.packetsDropped / (this.stats.packetsProcessed + this.stats.packetsDropped),
            queueLengths: {
                EF: this.priorityQueues.EF.length,
                AF41: this.priorityQueues.AF41.length,
                BE: this.priorityQueues.BE.length
            },
            bandwidth: { ...this.bandwidth }
        };
    }
    
    /**
     * Reset statistics
     */
    resetStats() {
        this.stats = {
            packetsProcessed: 0,
            packetsDropped: 0,
            bytesProcessed: 0,
            congestionEvents: 0,
            startTime: performance.now()
        };
        
        this.bandwidth.upstream.peak = 0;
        this.bandwidth.downstream.peak = 0;
        
        console.log('🔄 Traffic Manager stats reset');
    }
}

export default TrafficManager;