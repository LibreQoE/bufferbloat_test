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
     * Get optimal chunk size based on speed and latency
     */
    getOptimalChunkSize(speedMbps, baselineLatencyMs) {
        // Target: chunks should complete in 4x RTT for good pacing
        const targetUploadTimeMs = Math.max(100, (baselineLatencyMs || 20) * 4);
        const bytesPerMs = (speedMbps * 1024 * 1024) / (8 * 1000);
        const idealChunkSize = bytesPerMs * targetUploadTimeMs;
        
        // Clamp to reasonable bounds
        return Math.max(8 * 1024,        // 8KB minimum
               Math.min(4 * 1024 * 1024,  // 4MB maximum
                        Math.floor(idealChunkSize)));
    }
    
    /**
     * Get initial chunk size based on current throughput
     */
    getInitialChunkSize() {
        const currentThroughput = this.getCurrentThroughput();
        if (currentThroughput > 0) {
            return this.getOptimalChunkSize(currentThroughput, this.baselineLatency);
        }
        return 64 * 1024; // Default 64KB if no measurement
    }
    
    /**
     * Classify connection speed into tiers
     * @param {number} estimatedMbps - Estimated speed in Mbps
     * @returns {string} Speed tier: 'low', 'medium', 'high', 'very_high'
     */
    classifySpeed(estimatedMbps) {
        if (estimatedMbps < 50) return 'low';
        if (estimatedMbps < 150) return 'medium';
        if (estimatedMbps < 250) return 'high';   // Lowered from 500 to be less restrictive
        if (estimatedMbps < 800) return 'very_high'; // Lowered from 500 to 250, and added upper bound
        return 'ultra_high'; // New tier for >800 Mbps
    }
    
    /**
     * Get speed tier parameters
     * @param {string} speedTier - Speed tier classification
     * @returns {Object} Parameters for the speed tier
     */
    getSpeedTierParams(speedTier) {
        // HTTP/1.1 optimized: All tiers use 3 streams × 1 pending = 3 total concurrent
        // Differentiation is by chunk size optimization instead of concurrency
        const tiers = {
            low: { 
                streams: 3, 
                pendingPerStream: 1, 
                maxChunk: 1024 * 1024, // Increased from 512KB to 1MB
                description: 'Low speed (< 50 Mbps)'
            },
            medium: { 
                streams: 3, 
                pendingPerStream: 1, 
                maxChunk: 2 * 1024 * 1024, // Increased from 1MB to 2MB
                description: 'Medium speed (50-150 Mbps)'
            },
            high: { 
                streams: 3, 
                pendingPerStream: 1, 
                maxChunk: 4 * 1024 * 1024, // Increased from 2MB to 4MB
                description: 'High speed (150-250 Mbps)'
            },
            very_high: { 
                streams: 3, 
                pendingPerStream: 1, 
                maxChunk: 8 * 1024 * 1024, // Increased from 6MB to 8MB
                description: 'Very high speed (250-800 Mbps)'
            },
            ultra_high: { 
                streams: 3, 
                pendingPerStream: 1, 
                maxChunk: 12 * 1024 * 1024, // New tier with 12MB chunks
                description: 'Ultra high speed (> 800 Mbps)'
            }
        };
        return tiers[speedTier] || tiers.medium;
    }
    
    /**
     * Run rapid speed estimation phase (3 seconds)
     * @returns {Promise<number>} Estimated speed in Mbps
     */
    async runRapidSpeedEstimation() {
        console.log(`⚡ Running rapid speed estimation (3 seconds)...`);
        
        const estimationDuration = 3000; // 3 seconds
        const estimationStartTime = performance.now();
        const estimationEndTime = estimationStartTime + estimationDuration;
        
        let streamIds = [];
        let maxThroughput = 0;
        
        // HTTP/1.1 optimized parameters for reliable estimation
        const ESTIMATION_STREAMS = 3;
        const ESTIMATION_PENDING = 1; // Conservative - 3 total concurrent uploads within HTTP/1.1 limits
        
        try {
            // Create estimation streams with larger initial chunks for 2 Gbps detection
            for (let i = 0; i < ESTIMATION_STREAMS; i++) {
                const initialChunkSize = 2 * 1024 * 1024; // Start with 2MB immediately for high-speed (doubled)
                const dataChunks = this.generateUploadChunks(initialChunkSize, 20); // Even more chunks
                const streamId = await StreamManager.createUploadStream({
                    pendingUploads: ESTIMATION_PENDING,
                    uploadDelay: 0,
                    isSpeedTest: true // Mark as speed estimation
                }, dataChunks);
                
                if (streamId) streamIds.push(streamId);
                
                // Minimal stagger for quick start
                await new Promise(resolve => setTimeout(resolve, 25));
            }
            
            // Monitor throughput during estimation period with aggressive ramping for high-speed detection
            let lastChunkSizeUpdate = estimationStartTime;
            const chunkUpdateInterval = 300; // Faster updates every 300ms (was 500ms)
            
            while (performance.now() < estimationEndTime) {
                const elapsed = performance.now() - estimationStartTime;
                const currentThroughput = this.getCurrentThroughput();
                
                if (currentThroughput > maxThroughput) {
                    maxThroughput = currentThroughput;
                }
                
                // Aggressive chunk size ramping for high-speed connections
                if (performance.now() - lastChunkSizeUpdate > chunkUpdateInterval && streamIds.length > 0) {
                    const progress = elapsed / estimationDuration;
                    let targetChunkSize;
                    
                    // More aggressive chunk progression for 2 Gbps connections
                    if (progress < 0.2) {
                        targetChunkSize = 2 * 1024 * 1024; // 2MB for first 20% (doubled from 1MB)
                    } else if (progress < 0.4) {
                        targetChunkSize = 4 * 1024 * 1024; // 4MB for next 20% (doubled from 2MB)
                    } else if (progress < 0.6) {
                        targetChunkSize = 6 * 1024 * 1024; // 6MB for next 20% (doubled from 3MB)
                    } else if (progress < 0.8) {
                        targetChunkSize = 8 * 1024 * 1024; // 8MB for next 20% (doubled from 4MB)
                    } else {
                        targetChunkSize = 10 * 1024 * 1024; // 10MB for final 20% (increased from 6MB)
                    }
                    
                    // Add more chunks with aggressive sizes to existing streams
                    for (let streamId of streamIds) {
                        const stream = StreamManager.streams.upload.get(streamId);
                        if (stream && stream.active) {
                            const newChunks = this.generateUploadChunks(targetChunkSize, 8); // More chunks per update
                            stream.dataChunks.push(...newChunks);
                        }
                    }
                    
                    lastChunkSizeUpdate = performance.now();
                    console.log(`⚡ HTTP/1.1 optimized estimation: ${(progress * 100).toFixed(0)}%, ${Math.round(targetChunkSize/1024)}KB chunks, 3 concurrent uploads, peak: ${maxThroughput.toFixed(1)} Mbps`);
                }
                
                await new Promise(resolve => setTimeout(resolve, 50));
            }
            
            console.log(`⚡ Speed estimation complete: ${maxThroughput.toFixed(1)} Mbps (3-second measurement)`);
            
        } finally {
            // Clean up estimation streams
            await this.cleanupStreams(streamIds);
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        return maxThroughput;
    }
    
    /**
     * Run upload warmup with speed-tiered approach
     */
    async runUploadWarmup() {
        console.log(`📤 Starting speed-tiered upload warmup`);
        
        // Phase 1: Rapid Speed Estimation (3 seconds)
        const estimatedSpeed = await this.runRapidSpeedEstimation();
        
        // Phase 2: Speed Classification and Parameter Selection
        const speedTier = this.classifySpeed(estimatedSpeed);
        const tierParams = this.getSpeedTierParams(speedTier);
        
        console.log(`🎯 Connection classified as: ${tierParams.description}`);
        console.log(`🔧 Using tier parameters: ${tierParams.streams} streams, ${tierParams.pendingPerStream} pending/stream (${tierParams.streams * tierParams.pendingPerStream} total), max chunk: ${Math.round(tierParams.maxChunk/1024)}KB`);
        
        // Check for early termination (asymmetric connections)
        if (this.shouldTerminateEarly(estimatedSpeed)) {
            console.log(`⚠️ Early termination: Upload speed (${estimatedSpeed.toFixed(1)} Mbps) indicates asymmetric connection`);
            return this.createOptimalConfig(tierParams, estimatedSpeed);
        }
        
        // Phase 3: Optimized Warmup (remaining ~10 seconds)
        const optimizedStartTime = performance.now();
        const remainingDuration = this.duration - (optimizedStartTime - this.startTime);
        const optimizedEndTime = optimizedStartTime + remainingDuration;
        
        console.log(`🚀 Starting optimized warmup phase (${Math.round(remainingDuration/1000)}s remaining after 3s estimation)`);
        
        // Use tier-specific parameters
        const PENDING_UPLOADS_PER_STREAM = tierParams.pendingPerStream;
        const STREAM_COUNT = tierParams.streams;
        
        // Starting chunk size based on tier
        let currentChunkSize = Math.min(this.getInitialChunkSize(), tierParams.maxChunk / 4);
        let bestChunkSize = currentChunkSize;
        let bestThroughput = Math.max(estimatedSpeed, 0);
        
        console.log(`🔧 Optimized upload warmup: ${STREAM_COUNT} streams, ${PENDING_UPLOADS_PER_STREAM} pending/stream, starting chunk: ${Math.round(currentChunkSize/1024)}KB, max chunk: ${Math.round(tierParams.maxChunk/1024)}KB`);
        
        let streamIds = [];
        
        // Main ramping loop with tier-specific optimization
        while (performance.now() < optimizedEndTime) {
            const elapsed = performance.now() - this.startTime;
            const progress = Math.min(1, elapsed / this.duration);
            
            // Clean up existing streams if this is a new iteration
            if (elapsed % 2000 < 100) {  // Every 2 seconds
                if (streamIds.length > 0) {
                    await this.cleanupStreams(streamIds);
                    streamIds = [];
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
                
                // Create new streams with fixed pending uploads and current chunk size
                for (let i = 0; i < STREAM_COUNT; i++) {
                    const dataChunks = this.generateUploadChunks(currentChunkSize, 20);
                    const streamId = await StreamManager.createUploadStream({
                        pendingUploads: PENDING_UPLOADS_PER_STREAM,
                        uploadDelay: 0,
                        isSpeedTest: false
                    }, dataChunks);
                    
                    if (streamId) streamIds.push(streamId);
                    
                    // Stagger stream starts
                    await new Promise(resolve => setTimeout(resolve, 50));
                }
                
                console.log(`🔧 Upload: ${PENDING_UPLOADS_PER_STREAM} pending/stream, ${Math.round(currentChunkSize/1024)}KB chunks`);
            }
            
            // Monitor throughput
            const throughput = this.getCurrentThroughput();
            const latency = this.getCurrentLatency();
            
            if (throughput > 0) {
                this.updateThroughputHistory(throughput);
                
                // Check if we should adjust chunk size
                if (elapsed > 2000 && elapsed % 2000 < 500) {  // Every 2 seconds after initial period
                    const latencyOK = latency < (this.baselineLatency || 20) * 2.5;
                    
                    if (latencyOK && throughput > bestThroughput * 1.05) {
                        // Performance improved, try larger chunks up to tier maximum
                        bestThroughput = throughput;
                        bestChunkSize = currentChunkSize;
                        
                        const newChunkSize = Math.min(currentChunkSize * 1.5, tierParams.maxChunk);
                        if (newChunkSize !== currentChunkSize) {
                            currentChunkSize = newChunkSize;
                            console.log(`📈 Throughput improved to ${throughput.toFixed(1)} Mbps, increasing chunk size to ${Math.round(currentChunkSize/1024)}KB (tier max: ${Math.round(tierParams.maxChunk/1024)}KB)`);
                        }
                    } else if (!latencyOK) {
                        // Latency too high, reduce chunk size
                        currentChunkSize = Math.max(currentChunkSize * 0.75, 8 * 1024);
                        console.log(`📉 Latency spike (${latency.toFixed(1)}ms), reducing chunk size to ${Math.round(currentChunkSize/1024)}KB`);
                    }
                }
                
                // Track peak performance
                if (throughput > this.peakThroughput) {
                    this.peakThroughput = throughput;
                }
            }
            
            // Continue monitoring every 100ms
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        // Clean up streams
        await this.cleanupStreams(streamIds);
        
        // Create optimal configuration using tier parameters and best measurements
        this.optimalConfig = {
            streamCount: STREAM_COUNT,
            pendingUploads: PENDING_UPLOADS_PER_STREAM,
            chunkSize: bestChunkSize,
            uploadDelay: 0,
            peakThroughput: this.peakThroughput,
            speedTier: speedTier,
            tierDescription: tierParams.description,
            totalConcurrentUploads: STREAM_COUNT * PENDING_UPLOADS_PER_STREAM
        };
        
        // Store optimal parameters globally for saturation phases
        window.optimalUploadParams = this.optimalConfig;
        
        // Also store in alternative global variables that might be checked
        window.optimalUploadChunkSize = bestChunkSize;
        
        console.log(`✅ HTTP/1.1 optimized upload warmup complete:`);
        console.log(`   📊 Final results: ${this.peakThroughput.toFixed(2)} Mbps peak`);
        console.log(`   🎯 Speed tier: ${tierParams.description}`);
        console.log(`   🔧 Parameters: ${STREAM_COUNT}×${PENDING_UPLOADS_PER_STREAM} (${STREAM_COUNT * PENDING_UPLOADS_PER_STREAM} total concurrent), ${Math.round(bestChunkSize/1024)}KB chunks`);
        console.log(`   🌐 HTTP/1.1 optimized: Conservative concurrency, focus on chunk size optimization`);
        console.log(`🔧 Stored optimal upload parameters: ${JSON.stringify(this.optimalConfig)}`);
        console.log(`🔧 Stored window.optimalUploadParams: ${JSON.stringify(window.optimalUploadParams)}`);
        console.log(`🔧 Stored window.optimalUploadChunkSize: ${Math.round(window.optimalUploadChunkSize/1024)}KB`);
        
        // Add a small delay to ensure all async operations and logging complete before returning
        await new Promise(resolve => setTimeout(resolve, 200));
        
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
        // Much more lenient latency thresholds optimized for 2 Gbps connections
        // Minimum +100ms tolerance before any backoff consideration
        
        // Check if we're in estimation phase (first 3 seconds) - no backoff during estimation
        const elapsed = performance.now() - this.startTime;
        if (elapsed < 3000) {
            // No latency backoff during estimation phase
            return false;
        }
        
        // Minimum latency tolerance: baseline + 100ms
        const minimumTolerance = this.baselineLatency + 100;
        
        let latencyThreshold;
        if (this.direction === 'upload') {
            // Upload is more tolerant for high-speed connections
            if (this.peakThroughput > 200) {
                // High-speed connections get baseline + 150ms minimum
                latencyThreshold = Math.max(minimumTolerance, this.baselineLatency + 150);
            } else {
                // Lower-speed connections get baseline + 100ms
                latencyThreshold = minimumTolerance;
            }
        } else {
            // Download gets baseline + 100ms tolerance
            latencyThreshold = minimumTolerance;
        }
        
        if (latency > latencyThreshold) {
            this.latencySpikes++;
            
            // Require more consecutive spikes before backing off (5 instead of 3)
            const requiredSpikes = 5;
            
            if (this.latencySpikes >= requiredSpikes) {
                console.log(`📉 ${this.direction} latency spike detected: ${latency.toFixed(2)}ms > ${latencyThreshold.toFixed(2)}ms (+${(latencyThreshold - this.baselineLatency).toFixed(0)}ms tolerance), backing off after ${this.latencySpikes} spikes`);
                return true;
            }
        } else {
            this.latencySpikes = 0;
        }
        
        return false;
    }
    
    /**
     * Check if we should terminate early due to asymmetric connection
     * @param {number} uploadSpeed - Measured upload speed in Mbps
     * @returns {boolean} True if should terminate early
     */
    shouldTerminateEarly(uploadSpeed) {
        // Get download speed from previous phase if available
        const downloadSpeed = this.peakThroughput || 0;
        
        // If upload is significantly lower than download, it might be asymmetric
        // Only terminate early if we have a reliable download measurement
        if (downloadSpeed > 100 && uploadSpeed > 0) {
            const uploadToDownloadRatio = uploadSpeed / downloadSpeed;
            
            // If upload is less than 20% of download speed, consider it asymmetric
            if (uploadToDownloadRatio < 0.2) {
                console.log(`📊 Asymmetric connection detected: Upload ${uploadSpeed.toFixed(1)} Mbps vs Download ${downloadSpeed.toFixed(1)} Mbps (ratio: ${(uploadToDownloadRatio * 100).toFixed(1)}%)`);
                return true;
            }
        }
        
        return false;
    }
    
    /**
     * Create optimal configuration based on tier parameters and measured speed
     * @param {Object} tierParams - Tier-specific parameters
     * @param {number} measuredSpeed - Measured speed in Mbps
     * @returns {Object} Optimal configuration
     */
    createOptimalConfig(tierParams, measuredSpeed) {
        const config = {
            streamCount: tierParams.streams,
            pendingUploads: tierParams.pendingPerStream,
            chunkSize: Math.min(tierParams.maxChunk, this.getOptimalChunkSize(measuredSpeed, this.baselineLatency)),
            uploadDelay: 0,
            peakThroughput: measuredSpeed,
            speedTier: this.classifySpeed(measuredSpeed),
            tierDescription: tierParams.description
        };
        
        console.log(`✅ Created optimal config: ${config.streamCount}×${config.pendingUploads} (${config.streamCount * config.pendingUploads} total), ${Math.round(config.chunkSize/1024)}KB chunks, ${config.peakThroughput.toFixed(1)} Mbps`);
        
        return config;
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