/**
 * Anti-Chunking Manager
 * Prevents packet batching and ensures individual transmission
 * to avoid CAKE QoS misclassification as bulk traffic
 */

class AntiChunkingManager {
    constructor() {
        this.transmissionQueue = new Map(); // userId -> packet queue
        this.lastTransmission = new Map(); // userId -> timestamp
        this.minInterval = 1; // Minimum 1ms between packets per user
        this.maxBurstSize = 1; // Maximum 1 packet per transmission
    }

    /**
     * Validate packet size for realistic traffic patterns
     */
    validatePacketSize(size, userType) {
        switch (userType) {
            case 'gaming':
                return size >= 32 && size <= 128; // Gaming: 32-128 bytes
            case 'video':
                return size >= 600 && size <= 1400; // Video: 600-1400 bytes (including I-frames)
            default:
                return true; // Allow other traffic types
        }
    }

    /**
     * Schedule individual packet transmission with anti-chunking logic
     */
    scheduleTransmission(userId, packet, userType, transmitFunction) {
        if (!this.validatePacketSize(packet.byteLength, userType)) {
            console.warn(`⚠️ Anti-chunking: Invalid packet size ${packet.byteLength} for ${userType}`);
            return false;
        }

        const now = performance.now();
        const lastTx = this.lastTransmission.get(userId) || 0;
        const timeSinceLastTx = now - lastTx;

        // Ensure minimum interval between packets to prevent chunking
        const delay = Math.max(0, this.minInterval - timeSinceLastTx);

        setTimeout(() => {
            try {
                // Transmit single packet
                transmitFunction(packet);
                
                // Update last transmission time
                this.lastTransmission.set(userId, performance.now());
                
                // Log anti-chunking activity (reduced verbosity)
                if (Math.random() < 0.01) { // Log 1% of transmissions
                    console.log(`📦 Anti-chunking: ${userType} packet ${packet.byteLength}B transmitted individually`);
                }
                
            } catch (error) {
                console.error(`❌ Anti-chunking transmission failed for ${userId}:`, error);
            }
        }, delay);

        return true;
    }

    /**
     * Add timing jitter to prevent synchronization across users
     */
    addTimingJitter(baseInterval, maxJitter = 2) {
        const jitter = (Math.random() - 0.5) * maxJitter * 2; // ±maxJitter ms
        return Math.max(1, baseInterval + jitter); // Minimum 1ms interval
    }

    /**
     * Check if traffic pattern looks realistic for CAKE classification
     */
    validateTrafficPattern(userId, packetSizes, intervals) {
        if (packetSizes.length < 10) return true; // Need more data

        // Check for consistent small packets (gaming)
        const avgSize = packetSizes.reduce((a, b) => a + b) / packetSizes.length;
        const avgInterval = intervals.reduce((a, b) => a + b) / intervals.length;

        if (avgSize < 150 && avgInterval > 20) {
            // Looks like gaming traffic - should be classified as real-time
            return true;
        }

        if (avgSize > 700 && avgSize < 1200 && avgInterval > 15 && avgInterval < 25) {
            // Looks like video traffic - should be classified as real-time
            return true;
        }

        // Check for bulk-like patterns that might confuse CAKE
        const hasLargePackets = packetSizes.some(size => size > 1500);
        const hasShortIntervals = intervals.some(interval => interval < 5);
        
        if (hasLargePackets && hasShortIntervals) {
            console.warn(`⚠️ Traffic pattern for ${userId} may be classified as bulk by CAKE`);
            return false;
        }

        return true;
    }

    /**
     * Get statistics for monitoring anti-chunking effectiveness
     */
    getStats() {
        return {
            activeUsers: this.transmissionQueue.size,
            lastTransmissions: Object.fromEntries(this.lastTransmission),
            minInterval: this.minInterval,
            maxBurstSize: this.maxBurstSize
        };
    }

    /**
     * Reset anti-chunking state for a user
     */
    resetUser(userId) {
        this.transmissionQueue.delete(userId);
        this.lastTransmission.delete(userId);
    }

    /**
     * Clean up all state
     */
    cleanup() {
        this.transmissionQueue.clear();
        this.lastTransmission.clear();
    }
}

// Export for use in workers and main application
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AntiChunkingManager;
} else if (typeof window !== 'undefined') {
    window.AntiChunkingManager = AntiChunkingManager;
}

console.log('📦 Anti-Chunking Manager loaded - prevents CAKE QoS misclassification');