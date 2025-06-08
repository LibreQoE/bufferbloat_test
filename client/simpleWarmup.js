/**
 * Simple Warmup Module
 * Provides smooth saturation for connections from 256 kbps to 2000 Mbps
 * Uses fixed 3 TCP streams with progressive parameter ramping
 */

import StreamManager from './streamManager.js';
import throughputTracker from './throughputTracker.js';
import { generateTestData as xoshiroGenerateTestData, getPooledTestData } from './xoshiro.js';

/**
 * Simple Warmup class - replaces complex adaptive warmup
 */
class SimpleWarmup {
    /**
     * Constructor
     * @param {string} direction - 'download' or 'upload'
     * @param {number} baselineLatency - Baseline latency in ms
     * @param {number} duration - Warmup duration in seconds
     */
    constructor(direction, baselineLatency, duration) {
        this.direction = direction;
        this.baselineLatency = baselineLatency || 20;
        this.duration = duration * 1000; // Convert to ms
        this.startTime = performance.now();
        
        // Fixed configuration
        this.streamCount = 3; // Always 3 streams
        
        // Progressive ramping parameters
        this.currentThroughput = 0;
        this.peakThroughput = 0;
        this.optimalConfig = null;
        
        // Saturation detection
        this.throughputHistory = [];
        this.stagnationCount = 0;
        this.latencySpikes = 0;
        
        console.log(`🔧 Simple ${direction} warmup: 3 streams, ${duration}s duration`);
    }
    
    /**
     * Run the warmup process
     * @returns {Promise<Object>} Optimal configuration
     */
    async run() {
        console.log(`🚀 Starting simple ${this.direction} warmup`);
        
        try {
            if (this.direction === 'download') {
                return await this.runDownloadWarmup();
            } else {
                return await this.runUploadWarmup();
            }
        } catch (error) {
            console.error(`❌ Simple warmup failed:`, error);
            return this.getFallbackConfig();
        }
    }
    
    /**
     * Run download warmup with progressive chunk size ramping
     */
    async runDownloadWarmup() {
        console.log(`📥 Starting download warmup with 3 fixed streams`);
        
        // Progressive chunk sizes from 64KB to 2MB over the warmup period
        const startChunkSize = 64 * 1024;   // 64KB
        const endChunkSize = 2 * 1024 * 1024; // 2MB
        
        const endTime = this.startTime + this.duration;
        let bestChunkSize = startChunkSize;
        let streamIds = [];
        
        // Start 3 download streams
        for (let i = 0; i < 3; i++) {
            const streamId = await StreamManager.createDownloadStream({
                isSpeedTest: false,
                addDelay: false,
                chunkSize: startChunkSize
            });
            if (streamId) streamIds.push(streamId);
            
            // Stagger stream starts
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        // Progressive ramping loop
        while (performance.now() < endTime) {
            const elapsed = performance.now() - this.startTime;
            const progress = Math.min(1, elapsed / this.duration);
            
            // Calculate current target chunk size (exponential curve for smooth ramping)
            const currentChunkSize = Math.floor(
                startChunkSize + (endChunkSize - startChunkSize) * Math.pow(progress, 0.7)
            );
            
            // Monitor throughput
            const throughput = this.getCurrentThroughput();
            const latency = this.getCurrentLatency();
            
            if (throughput > 0) {
                this.updateThroughputHistory(throughput);
                
                // Check for saturation or latency issues
                if (this.shouldBackoff(latency)) {
                    console.log(`📉 Download latency spike detected: ${latency.toFixed(2)}ms, backing off`);
                    break;
                }
                
                // Track best configuration
                if (throughput > this.peakThroughput) {
                    this.peakThroughput = throughput;
                    bestChunkSize = currentChunkSize;
                }
            }
            
            // Update chunk size every 500ms
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        
        // Clean up streams
        await this.cleanupStreams(streamIds);
        
        this.optimalConfig = {
            streamCount: 3,
            chunkSize: bestChunkSize,
            peakThroughput: this.peakThroughput
        };
        
        console.log(`✅ Download warmup complete: ${this.peakThroughput.toFixed(2)} Mbps, ${bestChunkSize/1024}KB chunks`);
        
        // Add a small delay to ensure all async operations and logging complete before returning
        await new Promise(resolve => setTimeout(resolve, 100));
        
        return this.optimalConfig;
    }
    
    /**
     * Run upload warmup with progressive pending upload and chunk size ramping
     */
    async runUploadWarmup() {
        console.log(`📤 Starting upload warmup with 3 fixed streams`);
        
        // Progressive parameters
        const startPendingUploads = 1;
        const endPendingUploads = 40; // Handles up to 3×40=120 concurrent uploads for gigabit+
        const startChunkSize = 64 * 1024;   // 64KB
        const endChunkSize = 2 * 1024 * 1024; // 2MB
        
        const endTime = this.startTime + this.duration;
        let bestPendingUploads = startPendingUploads;
        let bestChunkSize = startChunkSize;
        let streamIds = [];
        
        // Main ramping loop
        while (performance.now() < endTime) {
            const elapsed = performance.now() - this.startTime;
            const progress = Math.min(1, elapsed / this.duration);
            
            // Calculate current parameters (smoother logarithmic curves for gradual saturation)
            const currentPendingUploads = Math.floor(
                startPendingUploads + (endPendingUploads - startPendingUploads) * Math.pow(progress, 0.5)
            );
            const currentChunkSize = Math.floor(
                startChunkSize + (endChunkSize - startChunkSize) * Math.pow(progress, 0.4)
            );
            
            // Restart streams with new parameters every 3 seconds for smoother ramping
            // Use a longer interval to reduce throughput drops from stream restarts
            if (streamIds.length === 0 || elapsed % 3000 < 500) {
                // Clean up old streams
                if (streamIds.length > 0) {
                    await this.cleanupStreams(streamIds);
                    streamIds = [];
                }
                
                // Start new streams with current parameters
                for (let i = 0; i < 3; i++) {
                    const dataChunks = this.generateUploadChunks(currentChunkSize, 20);
                    const streamId = await StreamManager.createUploadStream({
                        pendingUploads: currentPendingUploads,
                        uploadDelay: 0,
                        isSpeedTest: false
                    }, dataChunks);
                    
                    if (streamId) streamIds.push(streamId);
                    
                    // Stagger stream starts
                    await new Promise(resolve => setTimeout(resolve, 50));
                }
                
                console.log(`🔧 Upload: ${currentPendingUploads} pending, ${currentChunkSize/1024}KB chunks (${(progress*100).toFixed(1)}%)`);
            }
            
            // Monitor throughput
            const throughput = this.getCurrentThroughput();
            const latency = this.getCurrentLatency();
            
            if (throughput > 0) {
                this.updateThroughputHistory(throughput);
                
                // Check for saturation or latency issues
                if (this.shouldBackoff(latency)) {
                    console.log(`📉 Upload latency spike detected: ${latency.toFixed(2)}ms, backing off`);
                    break;
                }
                
                // Track best configuration
                if (throughput > this.peakThroughput) {
                    this.peakThroughput = throughput;
                    bestPendingUploads = currentPendingUploads;
                    bestChunkSize = currentChunkSize;
                }
            }
            
            // Continue ramping every 500ms
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        
        // Clean up streams
        await this.cleanupStreams(streamIds);
        
        this.optimalConfig = {
            streamCount: 3,
            pendingUploads: bestPendingUploads,
            chunkSize: bestChunkSize,
            uploadDelay: 0,
            peakThroughput: this.peakThroughput
        };
        
        console.log(`✅ Upload warmup complete: ${this.peakThroughput.toFixed(2)} Mbps, 3×${bestPendingUploads} pending, ${bestChunkSize/1024}KB chunks`);
        
        // Add a small delay to ensure all async operations and logging complete before returning
        await new Promise(resolve => setTimeout(resolve, 100));
        
        return this.optimalConfig;
    }
    
    /**
     * Generate upload chunks for testing
     * @param {number} chunkSize - Size of each chunk
     * @param {number} count - Number of chunks
     * @returns {Array} Array of data chunks
     */
    generateUploadChunks(chunkSize, count) {
        const chunks = [];
        for (let i = 0; i < count; i++) {
            try {
                const chunk = chunkSize <= 256 * 1024 
                    ? getPooledTestData(chunkSize)
                    : xoshiroGenerateTestData(chunkSize);
                chunks.push(chunk);
            } catch (error) {
                console.warn('Chunk generation failed, using fallback:', error);
                chunks.push(xoshiroGenerateTestData(chunkSize));
            }
        }
        return chunks;
    }
    
    /**
     * Update throughput history for saturation detection
     * @param {number} throughput - Current throughput in Mbps
     */
    updateThroughputHistory(throughput) {
        this.currentThroughput = throughput;
        this.throughputHistory.push(throughput);
        
        // Keep only last 10 measurements
        if (this.throughputHistory.length > 10) {
            this.throughputHistory.shift();
        }
        
        // Detect stagnation (throughput not improving)
        if (this.throughputHistory.length >= 5) {
            const recent = this.throughputHistory.slice(-3);
            const older = this.throughputHistory.slice(-6, -3);
            
            const recentAvg = recent.reduce((a, b) => a + b) / recent.length;
            const olderAvg = older.reduce((a, b) => a + b) / older.length;
            
            // If recent throughput is not significantly better than older
            if (recentAvg < olderAvg * 1.05) {
                this.stagnationCount++;
            } else {
                this.stagnationCount = 0;
            }
        }
    }
    
    /**
     * Check if we should back off due to latency
     * @param {number} latency - Current latency in ms
     * @returns {boolean} True if should back off
     */
    shouldBackoff(latency) {
        // More lenient thresholds for high-speed connections
        // Upload requires higher tolerance for latency spikes due to buffer filling
        let latencyMultiplier;
        
        if (this.direction === 'upload') {
            // Upload is more tolerant - high-speed connections can handle 500-800ms during saturation
            if (this.peakThroughput > 800) {
                // High-speed connections (>800 Mbps) - very lenient
                latencyMultiplier = 15; // Allow up to 15x baseline (300-450ms for 20-30ms baseline)
            } else if (this.peakThroughput > 200) {
                // Medium-speed connections (200-800 Mbps) - moderately lenient  
                latencyMultiplier = 10; // Allow up to 10x baseline
            } else {
                // Lower-speed connections - more conservative
                latencyMultiplier = 6; // Allow up to 6x baseline
            }
        } else {
            // Download is more sensitive to latency
            if (this.peakThroughput > 800) {
                latencyMultiplier = 8; // Still lenient but less than upload
            } else {
                latencyMultiplier = 4; // Original threshold for lower speeds
            }
        }
        
        const latencyThreshold = this.baselineLatency * latencyMultiplier;
        
        if (latency > latencyThreshold) {
            this.latencySpikes++;
            
            // For high-speed upload, require more consecutive spikes before backing off
            const requiredSpikes = (this.direction === 'upload' && this.peakThroughput > 800) ? 5 : 3;
            
            if (this.latencySpikes >= requiredSpikes) {
                console.log(`📉 ${this.direction} latency spike detected: ${latency.toFixed(2)}ms > ${latencyThreshold.toFixed(2)}ms (${latencyMultiplier}x baseline), backing off after ${this.latencySpikes} spikes`);
                return true;
            }
        } else {
            this.latencySpikes = 0;
        }
        
        return false;
    }
    
    /**
     * Get current throughput from tracker
     * @returns {number} Throughput in Mbps
     */
    getCurrentThroughput() {
        try {
            return throughputTracker.getCurrentThroughput(this.direction) || 0;
        } catch (error) {
            return 0;
        }
    }
    
    /**
     * Get current latency
     * @returns {number} Latency in ms
     */
    getCurrentLatency() {
        return window.latestLatencyMeasurement || this.baselineLatency;
    }
    
    /**
     * Clean up streams
     * @param {Array} streamIds - Array of stream IDs to clean up
     */
    async cleanupStreams(streamIds) {
        const cleanupPromises = streamIds.map(streamId => 
            StreamManager.terminateStream(streamId, this.direction)
        );
        
        try {
            await Promise.all(cleanupPromises);
        } catch (error) {
            console.warn('Stream cleanup error:', error);
        }
    }
    
    /**
     * Get fallback configuration
     * @returns {Object} Fallback config
     */
    getFallbackConfig() {
        return {
            streamCount: 3,
            pendingUploads: this.direction === 'upload' ? 4 : undefined,
            chunkSize: 256 * 1024, // 256KB fallback
            uploadDelay: this.direction === 'upload' ? 0 : undefined,
            peakThroughput: 0,
            fallback: true
        };
    }
}

export default SimpleWarmup;