/**
 * Adaptive Warmup Module
 * Implements a 2-Stage Adaptive Model for optimal parameter discovery
 * Stage 1: Baseline Bandwidth Estimation (3 seconds)
 * Stage 2: Parameter Optimization (12 seconds)
 */

import StreamManager from './streamManager.js';
import throughputTracker from './throughputTracker.js';
import { updateSpeedEstimationStatus, updateParameterOptimizationStatus, updateOptimizationCompleteStatus } from './testStatusDisplay.js';
import { serverDiscovery } from './discovery.js';
import { generateTestData as xoshiroGenerateTestData, getPooledTestData } from './xoshiro.js';

/**
 * Create standardized headers for upload requests to ensure TCP connection reuse
 * @param {Object} additionalHeaders - Optional additional headers to include
 * @returns {Object} Standardized headers object
 */
function createUploadHeaders(additionalHeaders = {}) {
    const baseHeaders = {
        'Content-Type': 'application/octet-stream',
        'Connection': 'keep-alive',
        'Keep-Alive': 'timeout=30, max=100',
        'Cache-Control': 'no-store',
        'Pragma': 'no-cache',
        'Accept-Encoding': 'identity'  // Request no compression for optimal connection reuse
    };
    
    // Merge additional headers while preserving base headers for connection reuse
    return { ...baseHeaders, ...additionalHeaders };
}

/**
 * AdaptiveWarmup Class
 * Handles intelligent speed estimation and targeted parameter optimization
 */
class AdaptiveWarmup {
    /**
     * Constructor
     * @param {string} direction - The direction ('download' or 'upload')
     * @param {number} baselineLatency - The baseline latency in ms
     */
    constructor(direction, baselineLatency) {
        this.direction = direction;
        this.baselineLatency = baselineLatency || 20;
        this.estimatedSpeed = 0;
        this.speedTier = null;
        this.candidateConfigs = [];
        this.trialResults = [];
        this.optimalConfig = null;
        this.optimalChunkSize = 64 * 1024; // Start with 64KB default
        this.chunkSizeResults = [];
        this.startTime = performance.now();
        
        // Configuration matrices for different speed tiers
        // LIMITED TO MAX 4 STREAMS to prevent latency spikes
        this.configMatrix = {
            download: {
                slow: [
                    { streamCount: 1 },
                    { streamCount: 2 }
                ],
                medium: [
                    { streamCount: 2 },
                    { streamCount: 3 },
                    { streamCount: 4 }
                ],
                fast: [
                    { streamCount: 3 },
                    { streamCount: 4 }
                ],
                gigabit: [
                    { streamCount: 4 }
                ],
                ultragig: [
                    { streamCount: 4 }
                ]
            },
            upload: {
                slow: [
                    { streamCount: 3, pendingUploads: 1 },
                    { streamCount: 3, pendingUploads: 2 },
                    { streamCount: 3, pendingUploads: 3 }
                ],
                medium: [
                    { streamCount: 3, pendingUploads: 2 },
                    { streamCount: 3, pendingUploads: 3 },
                    { streamCount: 3, pendingUploads: 4 },
                    { streamCount: 3, pendingUploads: 5 }
                ],
                fast: [
                    { streamCount: 3, pendingUploads: 4 },
                    { streamCount: 3, pendingUploads: 6 },
                    { streamCount: 3, pendingUploads: 8 },
                    { streamCount: 3, pendingUploads: 10 }
                ],
                gigabit: [
                    { streamCount: 3, pendingUploads: 12 },  // 36 concurrent uploads
                    { streamCount: 3, pendingUploads: 16 },  // 48 concurrent uploads
                    { streamCount: 3, pendingUploads: 20 },  // 60 concurrent uploads
                    { streamCount: 3, pendingUploads: 24 },  // 72 concurrent uploads
                    { streamCount: 3, pendingUploads: 28 },  // 84 concurrent uploads
                    { streamCount: 3, pendingUploads: 32 },  // 96 concurrent uploads
                    { streamCount: 3, pendingUploads: 36 },  // 108 concurrent uploads
                    { streamCount: 3, pendingUploads: 40 }   // 120 concurrent uploads
                ]
            }
        };
        
        // Speed tier boundaries - simplified for better performance
        this.tierBoundaries = {
            // Upload-optimized boundaries (download uses different logic)
            slow: { min: 0, max: 10 },      // Very slow upload
            medium: { min: 10, max: 100 },  // Typical residential upload
            fast: { min: 100, max: 300 },   // High-speed residential upload
            gigabit: { min: 300, max: Infinity } // All high-speed connections (300+ Mbps)
        };
        
        // AdaptiveWarmup initialized
    }
    
    /**
     * Stage 1: Estimate connection speed using single-stream transfer
     * @returns {Promise<number>} Estimated speed in Mbps
     */
    async estimateConnectionSpeed() {
        console.log(`🎯 Independent ${this.direction.toUpperCase()} Speed Estimation`);
        const overallStartTime = performance.now();
        const minEstimationDuration = 800; // Reduced to 0.8 seconds for faster parameter optimization
        
        // Update UI status
        updateSpeedEstimationStatus(this.direction, { stage: 1 });
        
        try {
            // 🔧 STAGE 1: Quick probe with direction-specific sizing
            console.log(`📊 Stage 1: Quick ${this.direction} speed probe`);
            
            // Use larger initial test for upload to get proper timing on high-speed connections
            const stage1Size = this.direction === 'upload' ? 2 * 1024 * 1024 : 1 * 1024 * 1024; // 2MB upload, 1MB download
            const stage1MaxDuration = 2000; // 2 seconds max for faster optimization
            
            console.log(`🔧 ASYMMETRIC HANDLING: Using ${(stage1Size / 1024 / 1024).toFixed(1)}MB initial test for ${this.direction}`);
            
            const stage1Result = await this.runSpeedTest(stage1Size, stage1MaxDuration);
            const stage1Elapsed = (performance.now() - overallStartTime) / 1000;
            
            if (stage1Result.bytesTransferred <= 0 || stage1Elapsed <= 0) {
                throw new Error(`Stage 1 failed: no data transferred`);
            }
            
            const roughSpeed = (stage1Result.bytesTransferred * 8) / (stage1Elapsed * 1000000); // Mbps
            console.log(`📊 Stage 1 ${this.direction} result: ${roughSpeed.toFixed(2)} Mbps in ${stage1Elapsed.toFixed(3)}s`);
            
            // 🔧 STAGE 2: Direction-specific adaptive sizing
            console.log(`📊 Stage 2: Adaptive ${this.direction} precision test`);
            
            // Update UI status for stage 2
            updateSpeedEstimationStatus(this.direction, { stage: 2, estimatedSpeed: roughSpeed });
            
            const targetDuration = 2.5; // seconds
            let adaptiveSize;
            
            if (this.direction === 'upload') {
                // 🔧 UPLOAD: Larger sizing to ensure proper timing on high-speed connections
                if (roughSpeed < 5) {
                    // Very slow upload: 2-5MB test (increased from 1-2MB)
                    adaptiveSize = Math.max(2 * 1024 * 1024, Math.min(5 * 1024 * 1024, roughSpeed * 125000 * targetDuration));
                } else if (roughSpeed < 25) {
                    // Slow upload: 5-15MB test (increased from 2-8MB)
                    adaptiveSize = Math.max(5 * 1024 * 1024, Math.min(15 * 1024 * 1024, roughSpeed * 125000 * targetDuration));
                } else if (roughSpeed < 100) {
                    // Medium upload: 15-50MB test (increased from 8-25MB)
                    adaptiveSize = Math.max(15 * 1024 * 1024, Math.min(50 * 1024 * 1024, roughSpeed * 125000 * targetDuration));
                } else if (roughSpeed < 500) {
                    // Fast upload: 50-150MB test (increased from 25-75MB)
                    adaptiveSize = Math.max(50 * 1024 * 1024, Math.min(150 * 1024 * 1024, roughSpeed * 125000 * targetDuration));
                } else if (roughSpeed < 1500) {
                    // Gigabit upload: 150-500MB test (increased from 150-400MB)
                    adaptiveSize = Math.max(150 * 1024 * 1024, Math.min(500 * 1024 * 1024, roughSpeed * 125000 * targetDuration));
                } else {
                    // Ultra-gigabit upload: 500MB-1GB test for 2000+ Mbps connections
                    adaptiveSize = Math.max(500 * 1024 * 1024, Math.min(1024 * 1024 * 1024, roughSpeed * 125000 * targetDuration));
                }
            } else {
                // 🔧 DOWNLOAD: Standard sizing for download
                if (roughSpeed < 10) {
                    adaptiveSize = Math.max(2 * 1024 * 1024, Math.min(5 * 1024 * 1024, roughSpeed * 125000 * targetDuration));
                } else if (roughSpeed < 100) {
                    adaptiveSize = Math.max(5 * 1024 * 1024, Math.min(25 * 1024 * 1024, roughSpeed * 125000 * targetDuration));
                } else if (roughSpeed < 500) {
                    adaptiveSize = Math.max(25 * 1024 * 1024, Math.min(125 * 1024 * 1024, roughSpeed * 125000 * targetDuration));
                } else {
                    adaptiveSize = Math.max(125 * 1024 * 1024, Math.min(500 * 1024 * 1024, roughSpeed * 125000 * targetDuration));
                }
            }
            
            console.log(`🔧 ${this.direction.toUpperCase()} ADAPTIVE SIZING: Based on ${roughSpeed.toFixed(2)} Mbps, using ${(adaptiveSize / 1024 / 1024).toFixed(0)}MB test`);
            
            const stage2StartTime = performance.now();
            const stage2MaxDuration = 2000; // 2 seconds max for stage 2 - save time for optimization
            
            const stage2Result = await this.runSpeedTest(adaptiveSize, stage2MaxDuration);
            const stage2Elapsed = (performance.now() - stage2StartTime) / 1000;
            const totalElapsed = (performance.now() - overallStartTime) / 1000;
            
            if (stage2Result.bytesTransferred > 0 && stage2Elapsed > 0) {
                this.estimatedSpeed = (stage2Result.bytesTransferred * 8) / (stage2Elapsed * 1000000);
                console.log(`✅ ${this.direction.toUpperCase()} speed estimation complete: ${this.estimatedSpeed.toFixed(2)} Mbps`);
                console.log(`   Stage 2: ${(stage2Result.bytesTransferred / 1024 / 1024).toFixed(2)} MB in ${stage2Elapsed.toFixed(2)}s`);
                console.log(`   Total time: ${totalElapsed.toFixed(2)}s`);
                
                // 🔧 DIAGNOSTIC: Log speed tier that will be assigned
                const predictedTier = this.classifySpeedTier(this.estimatedSpeed);
                console.log(`🔧 SPEED TIER PREDICTION: ${this.estimatedSpeed.toFixed(2)} Mbps → ${predictedTier} tier`);
            } else {
                console.warn(`⚠️ Stage 2 failed, using Stage 1 result: ${roughSpeed.toFixed(2)} Mbps`);
                this.estimatedSpeed = roughSpeed;
                
                // 🔧 DIAGNOSTIC: Log speed tier for fallback speed
                const predictedTier = this.classifySpeedTier(this.estimatedSpeed);
                console.log(`🔧 SPEED TIER PREDICTION (fallback): ${this.estimatedSpeed.toFixed(2)} Mbps → ${predictedTier} tier`);
            }
            
            // Ensure minimum duration for visibility in UI
            const remainingTime = minEstimationDuration - totalElapsed * 1000;
            if (remainingTime > 0) {
                console.log(`⏱️ Enforcing minimum ${this.direction} estimation duration: waiting ${(remainingTime/1000).toFixed(1)}s more`);
                await new Promise(resolve => setTimeout(resolve, remainingTime));
            }
            
            return this.estimatedSpeed;
        } catch (error) {
            console.error(`❌ ${this.direction.toUpperCase()} speed estimation failed:`, error);
            
            // 🔧 Direction-specific fallback defaults
            const fallbackSpeed = this.direction === 'upload' ? 50 : 200; // More conservative upload default
            console.warn(`⚠️ Using conservative ${this.direction} fallback: ${fallbackSpeed} Mbps`);
            this.estimatedSpeed = fallbackSpeed;
            return this.estimatedSpeed;
        }
    }
    
    /**
     * Run a speed test for the specified direction
     * @param {number} targetSize - Target size to transfer in bytes
     * @param {number} maxDuration - Maximum duration in milliseconds
     * @returns {Promise<Object>} Result with bytesTransferred
     */
    async runSpeedTest(targetSize, maxDuration) {
        const startTime = performance.now();
        let bytesTransferred = 0;
        
        try {
            if (this.direction === 'download') {
                // Create a single download stream for speed testing
                const controller = new AbortController();
                const signal = controller.signal;
                
                // Set timeout
                const timeoutId = setTimeout(() => controller.abort(), maxDuration);
                
                // Speed estimation phase - enable throughput reporting for graph visibility
                let lastDownloadReport = startTime;
                
                try {
                    const response = await serverDiscovery.makeRequest('/download', {
                        method: 'GET',
                        signal,
                        cache: 'no-store',
                        headers: {
                            'Pragma': 'no-cache',
                            'Cache-Control': 'no-store',
                            'X-Speed-Test': 'true',
                            'X-Discovery-Phase': 'true'
                        }
                    });
                    
                    if (!response.ok) {
                        throw new Error(`HTTP error! Status: ${response.status}`);
                    }
                    
                    const reader = response.body.getReader();
                    
                    while (true) {
                        const { done, value } = await reader.read();
                        
                        if (done || bytesTransferred >= targetSize) {
                            break;
                        }
                        
                        if (value && value.length > 0) {
                            bytesTransferred += value.length;
                            
                            // Report download throughput every 250ms during speed estimation
                            const currentTime = performance.now();
                            if (currentTime - lastDownloadReport >= 250) {
                                const timeElapsed = (currentTime - startTime) / 1000;
                                const currentThroughput = (bytesTransferred * 8) / (timeElapsed * 1000000); // Mbps
                                
                                // Dispatch throughput event for speed estimation phase
                                window.dispatchEvent(new CustomEvent('throughput:download', {
                                    detail: {
                                        throughput: currentThroughput,
                                        smoothedThroughput: currentThroughput,
                                        time: timeElapsed,
                                        phase: 'DOWNLOAD_WARMUP',
                                        isSpeedEstimation: true,
                                        isOutOfPhase: false
                                    }
                                }));
                                
                                lastDownloadReport = currentTime;
                            }
                        }
                        
                        // Check if we've exceeded max duration
                        if ((performance.now() - startTime) >= maxDuration) {
                            break;
                        }
                    }
                    
                    await reader.cancel();
                    clearTimeout(timeoutId);
                    
                    // Final download throughput report for speed estimation phase
                    const finalTime = performance.now();
                    const finalTimeElapsed = (finalTime - startTime) / 1000;
                    const finalThroughput = (bytesTransferred * 8) / (finalTimeElapsed * 1000000); // Mbps
                    
                    if (finalThroughput > 0) {
                        window.dispatchEvent(new CustomEvent('throughput:download', {
                            detail: {
                                throughput: finalThroughput,
                                smoothedThroughput: finalThroughput,
                                time: finalTimeElapsed,
                                phase: 'DOWNLOAD_WARMUP',
                                isSpeedEstimation: true,
                                isOutOfPhase: false
                            }
                        }));
                        console.log(`📊 Download speed estimation final throughput: ${finalThroughput.toFixed(2)} Mbps`);
                    }
                    
                    // SPEED TEST FIX: Ensure we got some data
                    if (bytesTransferred === 0) {
                        console.warn(`⚠️ No data received from /download endpoint during speed test`);
                        // Try a fallback approach with a smaller request
                        const fallbackResponse = await serverDiscovery.makeRequest('/download?size=1048576', { // 1MB fallback
                            method: 'GET',
                            cache: 'no-store',
                            headers: {
                                'Pragma': 'no-cache',
                                'Cache-Control': 'no-store'
                            }
                        });
                        
                        if (fallbackResponse.ok) {
                            const fallbackData = await fallbackResponse.arrayBuffer();
                            bytesTransferred = fallbackData.byteLength;
                            console.log(`✅ Fallback download successful: ${bytesTransferred} bytes`);
                        }
                    }
                    
                } catch (error) {
                    clearTimeout(timeoutId);
                    if (error.name !== 'AbortError') {
                        console.error(`❌ Download speed test error:`, error);
                        // Try a simple fallback
                        try {
                            const fallbackResponse = await serverDiscovery.makeRequest('/download?size=1048576');
                            if (fallbackResponse.ok) {
                                const fallbackData = await fallbackResponse.arrayBuffer();
                                bytesTransferred = fallbackData.byteLength;
                                console.log(`✅ Error recovery successful: ${bytesTransferred} bytes`);
                            }
                        } catch (fallbackError) {
                            console.error(`❌ Fallback also failed:`, fallbackError);
                            throw error;
                        }
                    }
                }
                
            } else {
                // Upload speed test - use parallel streams for high-speed detection
                console.log(`🔧 UPLOAD SPEED TEST: Starting with targetSize=${(targetSize/1024/1024).toFixed(1)}MB, maxDuration=${maxDuration}ms`);
                
                // Use very aggressive parallel streams for upload speed estimation to detect actual capacity
                const numParallelStreams = 24; // Increased from 16 to 24 for better capacity detection
                const chunkSize = Math.min(4096 * 1024, Math.max(1024 * 1024, targetSize / 50)); // 1MB-4MB chunks for high-speed detection
                const chunksPerStream = Math.ceil(targetSize / (chunkSize * numParallelStreams));
                
                console.log(`🔧 PARALLEL UPLOAD: Using ${numParallelStreams} streams, ${chunksPerStream} chunks of ${(chunkSize/1024)}KB each per stream`);
                
                // 🚨 DIAGNOSTIC: Log speed estimation parameters for high-speed connections
                const totalConcurrentUploads = numParallelStreams * chunksPerStream;
                const totalDataMB = (targetSize / 1024 / 1024);
                console.warn(`🚨 SPEED ESTIMATION SETUP: ${totalConcurrentUploads} total uploads, ${totalDataMB.toFixed(1)}MB total data`);
                console.warn(`🚨 THEORETICAL CAPACITY: ${numParallelStreams} parallel streams for high-speed detection`);
                
                // Speed estimation phase - enable throughput reporting for graph visibility
                let totalBytesTransferred = 0;
                let lastThroughputReport = startTime;
                
                // Create parallel upload promises
                const uploadPromises = [];
                const streamResults = [];
                
                for (let streamIndex = 0; streamIndex < numParallelStreams; streamIndex++) {
                    const uploadPromise = (async () => {
                        let streamBytesTransferred = 0;
                        
                        for (let chunkIndex = 0; chunkIndex < chunksPerStream; chunkIndex++) {
                            if ((performance.now() - startTime) >= maxDuration) {
                                break;
                            }
                            
                            const chunk = this.generateTestData(chunkSize);
                            
                            try {
                                const controller = new AbortController();
                                const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 seconds per chunk for ultra-high-speed
                                
                                const response = await serverDiscovery.makeRequest('/upload', {
                                    method: 'POST',
                                    signal: controller.signal,
                                    headers: createUploadHeaders({
                                        'X-Speed-Test': 'true',
                                        'X-Stream-Index': streamIndex.toString(),
                                        'X-Discovery-Phase': 'true'
                                    }),
                                    body: chunk
                                });
                                
                                clearTimeout(timeoutId);
                                
                                if (response.ok) {
                                    streamBytesTransferred += chunkSize;
                                    bytesTransferred += chunkSize; // Update total for throughput calculation
                                    totalBytesTransferred += chunkSize; // Track for throughput reporting
                                    
                                    // Report throughput every 250ms during speed estimation
                                    const currentTime = performance.now();
                                    if (currentTime - lastThroughputReport >= 250) {
                                        const timeElapsed = (currentTime - startTime) / 1000;
                                        const currentThroughput = (totalBytesTransferred * 8) / (timeElapsed * 1000000); // Mbps
                                        
                                        // Dispatch throughput event for speed estimation phase
                                        window.dispatchEvent(new CustomEvent('throughput:upload', {
                                            detail: {
                                                throughput: currentThroughput,
                                                smoothedThroughput: currentThroughput,
                                                time: timeElapsed,
                                                phase: 'UPLOAD_WARMUP',
                                                isSpeedEstimation: true,
                                                isOutOfPhase: false
                                            }
                                        }));
                                        
                                        lastThroughputReport = currentTime;
                                    }
                                } else {
                                    console.warn(`Upload chunk failed with status: ${response.status} (stream ${streamIndex})`);
                                    break;
                                }
                                
                            } catch (error) {
                                if (error.name !== 'AbortError') {
                                    console.warn(`Upload chunk error (stream ${streamIndex}):`, error);
                                }
                                break;
                            }
                        }
                        
                        return streamBytesTransferred;
                    })();
                    
                    uploadPromises.push(uploadPromise);
                }
                
                // Wait for all parallel streams to complete
                try {
                    const results = await Promise.all(uploadPromises);
                    const totalBytes = results.reduce((total, streamBytes) => total + streamBytes, 0);
                    bytesTransferred = totalBytes; // Use the final total
                    console.log(`🔧 PARALLEL UPLOAD RESULTS: ${results.map((bytes, i) => `Stream ${i}: ${(bytes/1024/1024).toFixed(1)}MB`).join(', ')}`);
                    console.log(`🔧 TOTAL UPLOAD BYTES: ${(bytesTransferred/1024/1024).toFixed(1)}MB across ${numParallelStreams} streams`);
                    
                    // Final throughput report for speed estimation phase
                    const finalTime = performance.now();
                    const finalTimeElapsed = (finalTime - startTime) / 1000;
                    const finalThroughput = (totalBytesTransferred * 8) / (finalTimeElapsed * 1000000); // Mbps
                    
                    if (finalThroughput > 0) {
                        window.dispatchEvent(new CustomEvent('throughput:upload', {
                            detail: {
                                throughput: finalThroughput,
                                smoothedThroughput: finalThroughput,
                                time: finalTimeElapsed,
                                phase: 'UPLOAD_WARMUP',
                                isSpeedEstimation: true,
                                isOutOfPhase: false
                            }
                        }));
                        console.log(`📊 Speed estimation final throughput: ${finalThroughput.toFixed(2)} Mbps`);
                    }
                } catch (error) {
                    console.warn('Parallel upload error:', error);
                    // Fallback to whatever was transferred
                }
            }
            
            return { bytesTransferred };
            
        } catch (error) {
            console.error(`❌ Speed test failed for ${this.direction}:`, error);
            console.error('Speed test error details:', {
                name: error.name,
                message: error.message,
                direction: this.direction,
                targetSize,
                maxDuration,
                bytesTransferred
            });
            return { bytesTransferred };
        }
    }
    
    /**
     * Classify speed into tiers
     * @param {number} speed - Speed in Mbps
     * @returns {string} Speed tier
     */
    classifySpeedTier(speed) {
        console.log(`🔧 SPEED TIER CLASSIFICATION: Starting for ${this.direction} with speed=${speed.toFixed(2)} Mbps`);
        let tier;
        
        if (this.direction === 'upload') {
            // 🔧 UPLOAD: Independent tier classification based solely on upload speed
            // Adjusted boundaries for typical asymmetric residential connections
            if (speed < 10) tier = 'slow';        // Very slow upload: < 10 Mbps
            else if (speed < 100) tier = 'medium'; // Typical residential: 10-100 Mbps
            else if (speed < 300) tier = 'fast';   // High-speed residential: 100-300 Mbps
            else tier = 'gigabit';                 // All high-speed connections: 300+ Mbps
            
            console.log(`🔧 INDEPENDENT UPLOAD CLASSIFICATION: ${speed.toFixed(2)} Mbps → ${tier} tier (no download dependency)`);
            
            // 🚨 DIAGNOSTIC: Log potential under-saturation for 300+ Mbps connections
            if (speed >= 300) {
                console.warn(`🚨 HIGH-SPEED DIAGNOSTIC: ${speed.toFixed(2)} Mbps connection - ${tier} tier`);
                console.warn(`🚨 TIER ASSIGNMENT: ${tier} tier - checking if configuration is adequate`);
                
                const configs = this.configMatrix[this.direction][tier] || [];
                const maxStreams = Math.max(...configs.map(c => c.streamCount || 0));
                const maxPending = Math.max(...configs.map(c => c.pendingUploads || 0));
                
                console.warn(`🚨 MAX CONFIG FOR ${tier.toUpperCase()}: ${maxStreams} streams, ${maxPending} pending uploads`);
                console.warn(`🚨 THEORETICAL MAX: ${maxStreams * maxPending} concurrent uploads`);
                
                // Calculate if this is sufficient for the speed
                const estimatedThroughputPerUpload = 10; // Conservative 10 Mbps per upload
                const theoreticalMax = maxStreams * maxPending * estimatedThroughputPerUpload;
                console.warn(`🚨 ESTIMATED CAPACITY: ${theoreticalMax.toFixed(0)} Mbps vs required ${speed.toFixed(2)} Mbps`);
                
                if (theoreticalMax < speed * 1.2) { // Need 20% headroom
                    console.error(`❌ INSUFFICIENT CAPACITY: Configuration may not saturate ${speed.toFixed(2)} Mbps connection`);
                }
            }
            
            // Optional: Log download speed for informational purposes only (not used for classification)
            const lastDownloadThroughput = window.lastDownloadThroughput || 0;
            if (lastDownloadThroughput > 0) {
                const asymmetricRatio = lastDownloadThroughput / speed;
                console.log(`🔧 INFO: Download was ${lastDownloadThroughput.toFixed(2)} Mbps (ratio: ${asymmetricRatio.toFixed(1)}:1) - not affecting upload tier`);
            }
        } else {
            // 🔧 DOWNLOAD: Use original tier boundaries for download (higher speeds expected)
            if (speed < 25) tier = 'slow';
            else if (speed < 200) tier = 'medium';
            else if (speed < 600) tier = 'fast';
            else if (speed < 700) tier = 'gigabit';
            else tier = 'ultragig';
            
            console.log(`🔧 DOWNLOAD CLASSIFICATION: ${speed.toFixed(2)} Mbps → ${tier} tier`);
        }
        
        // 🔧 DIAGNOSTIC: Log tier boundaries for reference
        console.log(`🔧 TIER BOUNDARIES: slow(0-${this.tierBoundaries.slow.max}), medium(${this.tierBoundaries.medium.min}-${this.tierBoundaries.medium.max}), fast(${this.tierBoundaries.fast.min}-${this.tierBoundaries.fast.max}), gigabit(${this.tierBoundaries.gigabit.min}+)`);
        
        return tier;
    }
    
    /**
     * Get symmetric tier classification (without asymmetric override)
     * @param {number} speed - Speed in Mbps
     * @returns {string} Speed tier
     */
    getSymmetricTier(speed) {
        if (speed < 25) return 'slow';
        else if (speed < 200) return 'medium';
        else if (speed < 600) return 'fast';
        else if (speed < 700) return 'gigabit';
        else return 'ultragig';
    }
    
    /**
     * Generate candidate configurations based on speed tier
     * @param {string} tier - Speed tier
     * @returns {Array} Array of configuration objects
     */
    generateCandidateConfigs(tier) {
        const configs = this.configMatrix[this.direction][tier] || this.configMatrix[this.direction]['medium'];
        
        // Tier-adaptive trial counts for optimization
        let maxConfigs;
        switch (tier) {
            case 'slow':
                maxConfigs = 3; // Fewer trials for slow connections
                break;
            case 'medium':
                maxConfigs = 4; // Moderate trials for medium connections (covers asymmetric 35 Mbps)
                break;
            case 'fast':
                maxConfigs = 6; // More trials for fast connections
                break;
            case 'gigabit':
                maxConfigs = 8; // Full trials for all high-speed connections (300+ Mbps)
                break;
            default:
                maxConfigs = 4;
        }
        
        const limitedConfigs = configs.slice(0, maxConfigs);
        console.log(`🔧 ${tier.toUpperCase()} tier: limiting to ${limitedConfigs.length}/${configs.length} configurations for efficiency`);
        console.log(`🔧 SPEED CONTEXT: ${this.estimatedSpeed.toFixed(2)} Mbps ${this.direction} classified as ${tier} tier`);
        
        // 🔧 DIAGNOSTIC: Log the actual configurations that will be tested
        console.log(`🔧 CONFIGURATIONS TO TEST:`, limitedConfigs.map((config, i) =>
            `${i+1}: ${JSON.stringify(config)}`).join(', '));
        
        return limitedConfigs;
    }
    
    /**
     * Stage 1.5: Optimize chunk size for upload direction
     * @returns {Promise<number>} Optimal chunk size in bytes
     */
    async optimizeChunkSize() {
        if (this.direction !== 'upload') {
            console.log(`📦 Chunk size optimization skipped for ${this.direction} direction`);
            return this.optimalChunkSize;
        }

        console.log(`📦 Stage 1.5: Starting chunk size optimization for ${this.speedTier} tier`);
        
        // Define chunk sizes to test based on speed tier
        let chunkSizesToTest;
        switch (this.speedTier) {
            case 'slow':
                chunkSizesToTest = [64 * 1024]; // 64KB only for slow connections
                break;
            case 'medium':
                chunkSizesToTest = [64 * 1024, 128 * 1024]; // 64KB, 128KB
                break;
            case 'fast':
                chunkSizesToTest = [64 * 1024, 128 * 1024, 256 * 1024]; // 64KB, 128KB, 256KB
                break;
            case 'gigabit':
                chunkSizesToTest = [256 * 1024, 512 * 1024, 1024 * 1024, 2048 * 1024]; // 256KB, 512KB, 1MB, 2MB for high-speed
                break;
            default:
                chunkSizesToTest = [64 * 1024, 128 * 1024];
        }

        console.log(`📦 Testing chunk sizes: ${chunkSizesToTest.map(s => `${s/1024}KB`).join(', ')}`);

        let bestChunkSize = this.optimalChunkSize;
        let bestThroughput = 0;
        const testDuration = 1000; // 1 second per chunk size test

        for (const chunkSize of chunkSizesToTest) {
            // Check for force termination at the start of each chunk size test
            if (this.forceTermination) {
                console.log(`🛑 CHUNK SIZE OPTIMIZATION: Force termination requested during ${chunkSize/1024}KB test`);
                break;
            }
            
            console.log(`📦 Testing chunk size: ${chunkSize/1024}KB`);
            
            try {
                // Test this chunk size with a single stream
                const config = { streamCount: 1, pendingUploads: 3 };
                const result = await this.testChunkSizeConfiguration(config, chunkSize, testDuration);
                
                this.chunkSizeResults.push({
                    chunkSize,
                    throughput: result.throughput,
                    latency: result.latency
                });

                console.log(`📦 Chunk size ${chunkSize/1024}KB: ${result.throughput.toFixed(2)} Mbps, ${result.latency.toFixed(2)} ms`);

                // 🔧 FIX: More lenient chunk size selection - prioritize throughput over strict latency requirements
                // For high-speed connections, allow higher latency if throughput is significantly better
                const latencyThreshold = this.speedTier === 'gigabit' ? this.baselineLatency * 4 : this.baselineLatency * 2;
                
                // Update best chunk size if this one performs better
                if (result.throughput > bestThroughput && result.latency <= latencyThreshold) {
                    bestThroughput = result.throughput;
                    bestChunkSize = chunkSize;
                    console.log(`📦 ⭐ New best chunk size: ${chunkSize/1024}KB (${result.throughput.toFixed(2)} Mbps, ${result.latency.toFixed(2)} ms)`);
                } else if (result.throughput > 0) {
                    console.log(`📦 Chunk size ${chunkSize/1024}KB rejected: throughput=${result.throughput.toFixed(2)} vs best=${bestThroughput.toFixed(2)}, latency=${result.latency.toFixed(2)} vs threshold=${latencyThreshold.toFixed(2)}`);
                }

            } catch (error) {
                console.warn(`📦 Chunk size ${chunkSize/1024}KB test failed:`, error);
            }
            
            // Check for force termination after each chunk size test
            if (this.forceTermination) {
                console.log(`🛑 CHUNK SIZE OPTIMIZATION: Force termination requested after ${chunkSize/1024}KB test`);
                break;
            }
        }

        // 🔧 FIX: If no chunk size performed better than baseline, use the largest tested size for high-speed connections
        if (bestThroughput === 0 && this.speedTier === 'gigabit' && chunkSizesToTest.length > 0) {
            bestChunkSize = Math.max(...chunkSizesToTest);
            console.log(`📦 ⚠️ No chunk size showed measurable improvement, using largest tested size for gigabit: ${bestChunkSize/1024}KB`);
        }
        
        this.optimalChunkSize = bestChunkSize;
        console.log(`📦 ✅ Optimal chunk size: ${bestChunkSize/1024}KB (${bestThroughput.toFixed(2)} Mbps)`);

        // Update the global chunk size for the full test phase
        if (typeof window !== 'undefined') {
            // Set multiple global variables to ensure StreamManager picks it up
            window.optimalUploadChunkSize = bestChunkSize;
            window.adaptiveWarmupResults = window.adaptiveWarmupResults || {};
            window.adaptiveWarmupResults.optimalChunkSize = bestChunkSize;
            console.log(`📦 Set global optimal upload chunk size: ${bestChunkSize/1024}KB`);
        }

        return bestChunkSize;
    }

    /**
     * Test a configuration with a specific chunk size
     * @param {Object} config - Configuration to test
     * @param {number} chunkSize - Chunk size in bytes
     * @param {number} duration - Test duration in milliseconds
     * @returns {Promise<Object>} Test results
     */
    async testChunkSizeConfiguration(config, chunkSize, duration = 1000) {
        const startTime = performance.now();
        let throughputMeasurements = [];
        let latencyMeasurements = [];
        let totalBytesTransferred = 0;
        
        // Use higher concurrency for gigabit connections during chunk size tests
        const effectiveConfig = this.speedTier === 'gigabit'
            ? { streamCount: 4, pendingUploads: 8 }
            : config;
        
        console.log(`📦 Starting chunk size test: ${chunkSize/1024}KB with ${effectiveConfig.streamCount} streams, ${effectiveConfig.pendingUploads} pending uploads`);
        
        // Start upload streams with effective configuration
        const streamIds = await this.startChunkSizeTestStreams(effectiveConfig, chunkSize);
        
        if (streamIds.length === 0) {
            console.warn(`📦 No streams started for chunk size ${chunkSize/1024}KB test`);
            return { throughput: 0, latency: this.baselineLatency, chunkSize: chunkSize };
        }
        
        // Allow stream to stabilize
        await new Promise(resolve => setTimeout(resolve, 300)); // Increased stabilization time
        
        // Monitor for specified duration
        const monitoringInterval = 100; // Check every 100ms
        let measurementCount = 0;
        
        while ((performance.now() - startTime) < duration) {
            await new Promise(resolve => setTimeout(resolve, monitoringInterval));
            measurementCount++;
            
            // Collect throughput measurement with fallback calculation
            let currentThroughput = this.getCurrentThroughput();
            
            // 🔧 FIX: If throughputTracker returns 0, calculate throughput manually from stream data
            if (currentThroughput <= 0) {
                // Try to get bytes transferred from active streams
                let streamBytes = 0;
                for (const streamId of streamIds) {
                    const streamMap = StreamManager.streams['upload'];
                    if (streamMap) {
                        const stream = streamMap.get(streamId);
                        if (stream && stream.bytesSent) {
                            streamBytes += stream.bytesSent;
                        }
                    }
                }
                
                if (streamBytes > totalBytesTransferred) {
                    const deltaBytes = streamBytes - totalBytesTransferred;
                    const deltaTime = monitoringInterval / 1000; // Convert to seconds
                    currentThroughput = (deltaBytes * 8) / (deltaTime * 1000000); // Convert to Mbps
                    totalBytesTransferred = streamBytes;
                    
                    console.log(`📦 Manual throughput calculation: ${deltaBytes} bytes in ${deltaTime}s = ${currentThroughput.toFixed(2)} Mbps`);
                }
            }
            
            if (currentThroughput > 0) {
                throughputMeasurements.push(currentThroughput);
                console.log(`📦 Measurement ${measurementCount}: ${currentThroughput.toFixed(2)} Mbps`);
            }
            
            // Collect latency measurement
            const currentLatency = this.getCurrentLatency();
            if (currentLatency > 0) {
                latencyMeasurements.push(currentLatency);
            }
        }
        
        // Stop test streams
        await this.stopTestStreams(streamIds);
        
        // Calculate averages
        const avgThroughput = throughputMeasurements.length > 0
            ? throughputMeasurements.reduce((a, b) => a + b) / throughputMeasurements.length
            : 0;
            
        const avgLatency = latencyMeasurements.length > 0
            ? latencyMeasurements.reduce((a, b) => a + b) / latencyMeasurements.length
            : this.baselineLatency;
        
        console.log(`📦 Chunk size ${chunkSize/1024}KB test complete: ${throughputMeasurements.length} throughput measurements, avg=${avgThroughput.toFixed(2)} Mbps`);
        
        return {
            throughput: avgThroughput,
            latency: avgLatency,
            chunkSize: chunkSize
        };
    }

    /**
     * Start test streams for chunk size testing
     * @param {Object} config - Configuration object
     * @param {number} chunkSize - Chunk size in bytes
     * @returns {Promise<Array>} Array of stream IDs
     */
    async startChunkSizeTestStreams(config, chunkSize) {
        const streamIds = [];
        
        // Only test upload streams for chunk size optimization
        for (let i = 0; i < config.streamCount; i++) {
            const options = {
                pendingUploads: config.pendingUploads,
                uploadDelay: 0,
                isSpeedTest: true,
                isDiscovery: true,  // Mark as discovery to enable chunk size tracking
                chunkSize: chunkSize  // Specify the chunk size to test
            };
            
            // Create test data chunks with the specified size
            const numChunks = 30; // More chunks for sustained testing
            const dataChunks = [];
            
            for (let j = 0; j < numChunks; j++) {
                const chunk = this.generateTestData(chunkSize);
                dataChunks.push(chunk);
            }
            
            const streamId = await StreamManager.createUploadStream(options, dataChunks);
            if (streamId) {
                streamIds.push(streamId);
            }
            
            // Small delay between stream starts
            if (i < config.streamCount - 1) {
                await new Promise(resolve => setTimeout(resolve, 50));
            }
        }
        
        return streamIds;
    }

    /**
     * Stage 2: Optimize parameters using adaptive gradient ascent for smooth saturation
     * @returns {Promise<Object>} Optimal configuration
     */
    async optimizeParameters() {
        console.log(`⚙️ Stage 2: Starting adaptive parameter optimization for ${this.speedTier} tier`);
        
        // Use adaptive optimization instead of fixed discrete steps
        const useAdaptiveOptimization = true;
        
        if (useAdaptiveOptimization) {
            return await this.adaptiveGradientOptimization();
        } else {
            // Fallback to legacy discrete optimization
            return await this.discreteStepOptimization();
        }
    }
    
    /**
     * Adaptive gradient ascent optimization for smooth saturation
     * @returns {Promise<Object>} Optimal configuration
     */
    async adaptiveGradientOptimization() {
        console.log(`🎯 Using adaptive gradient ascent for smooth upload saturation`);
        
        let bestConfig = null;
        let bestScore = -1;
        let bestThroughput = 0;
        
        // Start with more aggressive baseline for faster saturation
        let currentPendingUploads = this.speedTier === 'gigabit' ? 16 : 
                                   this.speedTier === 'fast' ? 8 : 
                                   this.speedTier === 'medium' ? 4 : 2;
        
        // Initialize chunk size based on speed tier
        let currentChunkSize = this.speedTier === 'gigabit' ? 256 * 1024 :  // 256KB for gigabit
                              this.speedTier === 'fast' ? 128 * 1024 :      // 128KB for fast
                              64 * 1024;                                     // 64KB for medium/slow
        
        // Aggressive step sizing for 9-second window
        let pendingStep = this.speedTier === 'gigabit' ? 8 : 4; // Larger initial steps
        let chunkStep = 128 * 1024; // 128KB steps for faster chunk size optimization
        let optimizingPending = true; // Start by optimizing pending uploads
        let consecutiveImprovements = 0;
        let consecutiveDeclines = 0;
        const maxOptimizationTime = 7000; // 7 seconds max for optimization in 9-second window
        const shortTrialDuration = 200;   // Very short trials (200ms) for rapid convergence
        
        const startTime = performance.now();
        console.log(`🎯 Starting at ${currentPendingUploads} pending uploads, ${currentChunkSize/1024}KB chunks`);
        
        while ((performance.now() - startTime) < maxOptimizationTime && !this.forceTermination) {
            const config = { 
                streamCount: 3, 
                pendingUploads: currentPendingUploads,
                chunkSize: currentChunkSize 
            };
            console.log(`🧪 Testing: 3×${currentPendingUploads} pending, ${currentChunkSize/1024}KB chunks = ${3 * currentPendingUploads} concurrent uploads`);
            
            try {
                const result = await this.testConfiguration(config, shortTrialDuration);
                const scoring = this.scoreConfiguration(result.throughput, result.latency, this.estimatedSpeed, this.baselineLatency);
                
                this.trialResults.push({ config, result, scoring, adaptive: true });
                
                const throughputImprovement = result.throughput - bestThroughput;
                const scoreImprovement = scoring.score - bestScore;
                
                console.log(`📊 Result: ${result.throughput.toFixed(2)} Mbps (+${throughputImprovement.toFixed(2)}), ${result.latency.toFixed(2)} ms, score: ${scoring.score.toFixed(3)}`);
                
                // Check if this is better
                if (scoring.acceptable && scoring.score > bestScore) {
                    bestConfig = { ...config }; // Deep copy to preserve chunk size
                    bestScore = scoring.score;
                    bestThroughput = result.throughput;
                    consecutiveDeclines = 0;
                    consecutiveImprovements++;
                    
                    console.log(`⭐ New best: ${result.throughput.toFixed(2)} Mbps with ${currentPendingUploads} pending, ${currentChunkSize/1024}KB chunks`);
                    
                    // Accelerated optimization for 9-second window
                    if (optimizingPending) {
                        // More aggressive acceleration for time-constrained optimization
                        if (consecutiveImprovements >= 1 && pendingStep < 16) {
                            pendingStep = Math.min(pendingStep * 2, 16); // Double step size quickly
                            console.log(`⚡ Aggressively accelerating pending step to ${pendingStep}`);
                        }
                        currentPendingUploads += pendingStep;
                    } else {
                        // Optimizing chunk size - larger jumps
                        if (consecutiveImprovements >= 1 && currentChunkSize < 2048 * 1024) {
                            currentChunkSize += chunkStep * 2; // Double chunk size increments
                        } else {
                            // Switch back to pending optimization faster
                            optimizingPending = true;
                            currentPendingUploads = bestConfig.pendingUploads + pendingStep;
                        }
                    }
                    
                } else {
                    consecutiveDeclines++;
                    consecutiveImprovements = 0;
                    
                    if (optimizingPending) {
                        // Pending upload optimization
                        if (consecutiveDeclines === 1) {
                            // First decline: try smaller step
                            pendingStep = Math.max(1, Math.floor(pendingStep / 2));
                            console.log(`📉 Pending decline, reducing step to ${pendingStep}`);
                            currentPendingUploads = Math.max(1, (bestConfig?.pendingUploads || currentPendingUploads) + pendingStep);
                        } else if (consecutiveDeclines >= 2) { // Faster switching
                            // Switch to chunk size optimization faster
                            console.log(`🔄 Switching to chunk size optimization`);
                            optimizingPending = false;
                            consecutiveDeclines = 0;
                            currentPendingUploads = bestConfig?.pendingUploads || currentPendingUploads;
                            currentChunkSize = Math.min(currentChunkSize + chunkStep, 2048 * 1024);
                        } else {
                            currentPendingUploads += Math.max(1, pendingStep / 2); // Larger steps even on decline
                        }
                    } else {
                        // Chunk size optimization
                        if (consecutiveDeclines >= 2 || currentChunkSize >= 1024 * 1024) {
                            // Done with chunk size, found optimal configuration
                            console.log(`🎯 Convergence: Found optimal parameters`);
                            break;
                        } else {
                            currentChunkSize = Math.min(currentChunkSize + chunkStep, 2048 * 1024);
                        }
                    }
                }
                
                // Safety limits
                if (currentPendingUploads > 50) {
                    console.log(`🛑 Hit safety limit: 50 pending uploads`);
                    break;
                }
                
                // Latency safety
                if (result.latency > this.baselineLatency * 5) {
                    console.log(`🛑 Latency too high: ${result.latency.toFixed(2)}ms > 5x baseline`);
                    break;
                }
                
            } catch (error) {
                console.warn(`❌ Adaptive trial failed at ${currentPendingUploads} pending:`, error);
                break;
            }
        }
        
        // Update the optimal chunk size globally
        if (bestConfig && bestConfig.chunkSize) {
            this.optimalChunkSize = bestConfig.chunkSize;
            if (typeof window !== 'undefined') {
                window.optimalUploadChunkSize = bestConfig.chunkSize;
                window.adaptiveWarmupResults = window.adaptiveWarmupResults || {};
                window.adaptiveWarmupResults.optimalChunkSize = bestConfig.chunkSize;
            }
        }
        
        console.log(`✅ Adaptive optimization complete: ${this.trialResults.length} trials`);
        console.log(`   Best config: ${bestThroughput.toFixed(2)} Mbps with ${bestConfig?.pendingUploads || 4} pending, ${(bestConfig?.chunkSize || 65536)/1024}KB chunks`);
        
        return bestConfig || { streamCount: 3, pendingUploads: 4, chunkSize: 64 * 1024 };
    }
    
    /**
     * Legacy discrete step optimization (fallback)
     * @returns {Promise<Object>} Optimal configuration  
     */
    async discreteStepOptimization() {
        const maxTrials = Math.min(this.candidateConfigs.length, 6);
        const trialDuration = 600;
        let bestConfig = null;
        let bestScore = -1;
        let consecutiveDeclines = 0;
        
        // Generate candidate configs for discrete testing
        this.candidateConfigs = this.generateCandidateConfigs(this.speedTier);
        
        for (let i = 0; i < maxTrials; i++) {
            if (this.forceTermination) break;
            
            const config = this.candidateConfigs[i];
            if (!config) break;
            
            try {
                const result = await this.testConfiguration(config, trialDuration);
                const scoring = this.scoreConfiguration(result.throughput, result.latency, this.estimatedSpeed, this.baselineLatency);
                
                this.trialResults.push({ config, result, scoring, discrete: true });
                
                if (scoring.acceptable && scoring.score > bestScore) {
                    bestScore = scoring.score;
                    bestConfig = config;
                    consecutiveDeclines = 0;
                } else {
                    consecutiveDeclines++;
                    if (consecutiveDeclines >= 5) break;
                }
                
            } catch (error) {
                console.warn(`❌ Config ${i + 1} failed:`, error);
            }
        }
        
        return bestConfig || this.getDefaultConfigForTier(this.speedTier);
    }
    
    /**
     * Test a specific configuration
     * @param {Object} config - Configuration to test
     * @param {number} duration - Test duration in milliseconds
     * @returns {Promise<Object>} Test results
     */
    async testConfiguration(config, duration = 1000) {
        const startTime = performance.now();
        let throughputMeasurements = [];
        let latencyMeasurements = [];
        
        // Start streams with this configuration
        const streamIds = await this.startTestStreams(config);
        
        // Allow streams to stabilize
        await new Promise(resolve => setTimeout(resolve, 200));
        
        // Monitor for specified duration
        const monitoringInterval = 100; // Check every 100ms
        while ((performance.now() - startTime) < duration) {
            await new Promise(resolve => setTimeout(resolve, monitoringInterval));
            
            // Collect throughput measurement
            const currentThroughput = this.getCurrentThroughput();
            if (currentThroughput > 0) {
                throughputMeasurements.push(currentThroughput);
            }
            
            // Collect latency measurement
            const currentLatency = this.getCurrentLatency();
            if (currentLatency > 0) {
                latencyMeasurements.push(currentLatency);
            }
        }
        
        // Stop test streams
        await this.stopTestStreams(streamIds);
        
        // Calculate averages
        const avgThroughput = throughputMeasurements.length > 0
            ? throughputMeasurements.reduce((a, b) => a + b) / throughputMeasurements.length
            : 0;
            
        const avgLatency = latencyMeasurements.length > 0
            ? latencyMeasurements.reduce((a, b) => a + b) / latencyMeasurements.length
            : this.baselineLatency;
        
        return {
            throughput: avgThroughput,
            latency: avgLatency,
            measurements: {
                throughput: throughputMeasurements,
                latency: latencyMeasurements
            }
        };
    }
    
    /**
     * Start test streams for a configuration
     * @param {Object} config - Configuration object
     * @returns {Promise<Array>} Array of stream IDs
     */
    async startTestStreams(config) {
        const streamIds = [];
        
        if (this.direction === 'download') {
            // Start download streams
            for (let i = 0; i < config.streamCount; i++) {
                const options = {
                    isSpeedTest: true,
                    addDelay: false,
                    chunkSize: this.optimalChunkSize, // Use discovered optimal chunk size
                    isDiscovery: false  // Adaptive warmup streams are NOT discovery phase
                };
                
                const streamId = await StreamManager.createDownloadStream(options);
                if (streamId) {
                    streamIds.push(streamId);
                }
                
                // Small delay between stream starts
                if (i < config.streamCount - 1) {
                    await new Promise(resolve => setTimeout(resolve, 50));
                }
            }
        } else {
            // Start upload streams
            for (let i = 0; i < config.streamCount; i++) {
                const options = {
                    pendingUploads: config.pendingUploads,
                    uploadDelay: 0,
                    isSpeedTest: true,
                    isDiscovery: false  // Adaptive warmup streams are NOT discovery phase
                };
                
                // Use chunk size from config if specified, otherwise use default
                const chunkSize = config.chunkSize || this.optimalChunkSize || 64 * 1024;
                const numChunks = 20; // More chunks for sustained testing
                const dataChunks = [];
                
                for (let j = 0; j < numChunks; j++) {
                    const chunk = this.generateTestData(chunkSize);
                    dataChunks.push(chunk);
                }
                
                const streamId = await StreamManager.createUploadStream(options, dataChunks);
                if (streamId) {
                    streamIds.push(streamId);
                }
                
                // Small delay between stream starts
                if (i < config.streamCount - 1) {
                    await new Promise(resolve => setTimeout(resolve, 50));
                }
            }
        }
        
        return streamIds;
    }
    
    /**
     * Stop test streams
     * @param {Array} streamIds - Array of stream IDs to stop
     * @returns {Promise}
     */
    async stopTestStreams(streamIds) {
        const stopPromises = streamIds.map(streamId => {
            return StreamManager.terminateStream(streamId, this.direction);
        });
        
        await Promise.all(stopPromises);
    }
    
    /**
     * Clean up all active streams (discovery and test streams)
     * @returns {Promise}
     */
    async cleanupAllStreams() {
        try {
            console.log(`🧹 STREAM CLEANUP: Terminating all active ${this.direction} streams`);
            
            // Get all active streams from StreamManager
            const activeStreams = StreamManager.getActiveStreams(this.direction);
            
            if (activeStreams.length === 0) {
                console.log(`🧹 No active ${this.direction} streams to clean up`);
                return;
            }
            
            console.log(`🧹 Found ${activeStreams.length} active ${this.direction} streams to terminate`);
            
            // Terminate all active streams
            const cleanupPromises = activeStreams.map(async (streamId) => {
                try {
                    console.log(`🧹 Terminating ${this.direction} stream: ${streamId}`);
                    await StreamManager.terminateStream(streamId, this.direction);
                    console.log(`✅ Successfully terminated ${this.direction} stream: ${streamId}`);
                } catch (error) {
                    console.warn(`⚠️ Failed to terminate ${this.direction} stream ${streamId}:`, error);
                }
            });
            
            // Wait for all cleanup operations to complete
            await Promise.all(cleanupPromises);
            
            // Additional cleanup: Reset any global state that might interfere
            if (this.direction === 'upload') {
                // Reset upload-specific global state
                if (typeof window !== 'undefined') {
                    // Clear any lingering upload state
                    window.uploadStreamCount = 0;
                    window.activeUploadStreams = new Set();
                }
            }
            
            console.log(`✅ STREAM CLEANUP COMPLETE: All ${this.direction} streams terminated`);
            
        } catch (error) {
            console.error(`❌ Stream cleanup failed for ${this.direction}:`, error);
            // Don't throw - continue with parameter optimization even if cleanup fails
        }
    }
    
    /**
     * Get current throughput from throughput tracker
     * @returns {number} Current throughput in Mbps
     */
    getCurrentThroughput() {
        try {
            return throughputTracker.getCurrentThroughput(this.direction);
        } catch (error) {
            console.warn('Failed to get throughput from tracker, using fallback:', error);
            // Fallback to global measurement
            if (window.currentThroughputMeasurement) {
                return this.direction === 'download'
                    ? window.currentThroughputMeasurement.download || 0
                    : window.currentThroughputMeasurement.upload || 0;
            }
            return 0;
        }
    }
    
    /**
     * Get current latency measurement
     * @returns {number} Current latency in ms
     */
    getCurrentLatency() {
        return window.latestLatencyMeasurement || this.baselineLatency;
    }
    
    /**
     * Score a configuration based on throughput and latency
     * @param {number} throughput - Measured throughput in Mbps
     * @param {number} latency - Measured latency in ms
     * @param {number} estimatedSpeed - Estimated connection speed in Mbps
     * @param {number} baselineLatency - Baseline latency in ms
     * @returns {Object} Scoring object
     */
    scoreConfiguration(throughput, latency, estimatedSpeed, baselineLatency) {
        // Weighted scoring: prioritize throughput more heavily for better saturation
        const throughputWeight = 0.85; // Increased from 0.7 to prioritize throughput
        const latencyWeight = 0.15;    // Decreased from 0.3 to reduce latency penalty
        
        // Normalize throughput (0-1 scale)
        const normalizedThroughput = Math.min(1, throughput / estimatedSpeed);
        
        // More lenient latency thresholds based on speed tier
        let latencyThreshold;
        if (this.speedTier === 'gigabit') {
            latencyThreshold = baselineLatency * 4; // 4x for gigabit connections
        } else if (this.speedTier === 'fast') {
            latencyThreshold = baselineLatency * 3; // 3x for fast connections  
        } else {
            latencyThreshold = baselineLatency * 2.5; // 2.5x for medium/slow
        }
        
        // Gentler latency penalty using logarithmic scale instead of linear
        // This prevents harsh penalties for moderate latency increases
        const latencyRatio = latency / baselineLatency;
        const latencyScore = latencyRatio <= 1 ? 1 : Math.max(0, 1 - Math.log(latencyRatio) / Math.log(latencyThreshold / baselineLatency));
        
        // Combined score (higher is better)
        const score = (throughputWeight * normalizedThroughput) + (latencyWeight * latencyScore);
        
        // Configuration is acceptable if latency doesn't exceed threshold
        const acceptable = latency <= latencyThreshold;
        
        return {
            score,
            throughputComponent: normalizedThroughput,
            latencyComponent: latencyScore,
            acceptable,
            latencyThreshold
        };
    }
    
    /**
     * Get default configuration for a speed tier
     * @param {string} tier - Speed tier
     * @returns {Object} Default configuration
     */
    getDefaultConfigForTier(tier) {
        const configs = this.configMatrix[this.direction][tier] || this.configMatrix[this.direction]['medium'];
        
        // 🔧 FIX: For ultra-high-speed connections (600+ Mbps), use more aggressive default config
        if (tier === 'gigabit' && this.direction === 'upload' && this.estimatedSpeed >= 600) {
            console.log(`🚀 ULTRA-HIGH-SPEED DEFAULT: Using aggressive config for ${this.estimatedSpeed.toFixed(2)} Mbps connection`);
            // Use 3 streams × 40 pending = 120 concurrent uploads for 600+ Mbps connections
            return { streamCount: 3, pendingUploads: 40, chunkSize: 512 * 1024 };
        }
        
        const defaultConfig = configs[0] || { streamCount: this.direction === 'upload' ? 3 : 2, pendingUploads: 2 };
        
        // Add default chunk size if not present
        if (this.direction === 'upload' && !defaultConfig.chunkSize) {
            defaultConfig.chunkSize = tier === 'gigabit' ? 256 * 1024 :
                                     tier === 'fast' ? 128 * 1024 :
                                     64 * 1024;
        }
        
        return defaultConfig;
    }
    
    /**
     * Interpolate configuration for speeds between tiers
     * @param {number} speed - Connection speed in Mbps
     * @returns {Object} Interpolated configuration
     */
    interpolateConfiguration(speed) {
        // Find the two tiers this speed falls between
        let lowerTier = 'slow';
        let upperTier = 'medium';
        
        if (speed >= 10 && speed < 100) {
            lowerTier = 'medium';
            upperTier = 'fast';
        } else if (speed >= 100 && speed < 500) {
            lowerTier = 'fast';
            upperTier = 'gigabit';
        } else if (speed >= 500 && speed < 1500) {
            lowerTier = 'gigabit';
            upperTier = 'ultragig';
        } else if (speed >= 1500) {
            return this.getDefaultConfigForTier('ultragig');
        }
        
        const lowerConfig = this.getDefaultConfigForTier(lowerTier);
        const upperConfig = this.getDefaultConfigForTier(upperTier);
        
        // Calculate interpolation ratio
        const lowerMax = this.tierBoundaries[lowerTier].max;
        const upperMin = this.tierBoundaries[upperTier].min;
        const ratio = (speed - lowerMax) / (upperMin - lowerMax);
        
        // Interpolate parameters
        const interpolated = {
            streamCount: Math.round(
                lowerConfig.streamCount + ratio * (upperConfig.streamCount - lowerConfig.streamCount)
            )
        };
        
        // Add pendingUploads for upload direction
        if (this.direction === 'upload') {
            interpolated.pendingUploads = Math.round(
                lowerConfig.pendingUploads + ratio * (upperConfig.pendingUploads - lowerConfig.pendingUploads)
            );
        }
        
        return interpolated;
    }
    
    /**
     * Run the complete adaptive warmup process
     * @returns {Promise<Object>} Optimal configuration
     */
    async run() {
        try {
            console.log(`🚀 ADAPTIVE WARMUP ENTRY POINT: Starting Phase-Aware Adaptive Warmup for ${this.direction}`);
            console.log(`🔧 ADAPTIVE WARMUP: Checking dependencies...`);
            
            // Add phase change listener to ensure we terminate when phase changes
            this.phaseChangeListener = (event) => {
                const newPhase = event.detail.phase;
                console.log(`🔧 ADAPTIVE WARMUP: Phase change detected - ${newPhase}`);
                
                // If we're in upload warmup and phase changes to upload saturation, terminate immediately
                if (this.direction === 'upload' && newPhase === 'UPLOAD') {
                    console.log(`🛑 ADAPTIVE WARMUP: Upload phase started, terminating adaptive warmup immediately`);
                    this.forceTermination = true;
                }
                // If we're in download warmup and phase changes to download saturation, terminate immediately
                else if (this.direction === 'download' && newPhase === 'DOWNLOAD') {
                    console.log(`🛑 ADAPTIVE WARMUP: Download phase started, terminating adaptive warmup immediately`);
                    this.forceTermination = true;
                }
            };
            
            window.addEventListener('test:phaseChange', this.phaseChangeListener);
            
            // 🔧 FIX: Use phase-relative timing that respects actual phase boundaries
            // For download: use test-relative timing (this.startTime + 5250)
            // For upload: calculate deadline based on remaining time in the warmup phase
            let adaptiveWarmupDeadline;
            
            if (this.direction === 'upload') {
                // For upload, calculate deadline based on remaining warmup phase time
                // Upload warmup phase is 13 seconds total, use almost all of it for adaptive warmup
                // Stabilization is minimal since streams continue running
                const maxAdaptiveWarmupDuration = 12000; // 12 seconds max (increased from 10s)
                const currentTime = performance.now();
                
                // Check if we have phase timing information
                if (window.getCurrentPhase && window.getElapsedTime) {
                    const currentPhase = window.getCurrentPhase();
                    const elapsedTime = window.getElapsedTime();
                    
                    if (currentPhase === 'UPLOAD_WARMUP') {
                        // Upload warmup starts at 23s and ends at 36s (13s duration)
                        const uploadWarmupStartTime = 23000; // 23 seconds
                        const uploadWarmupEndTime = 36000;   // 36 seconds
                        const testStartTime = currentTime - (elapsedTime * 1000);
                        const phaseEndTime = testStartTime + uploadWarmupEndTime;
                        const remainingPhaseTime = phaseEndTime - currentTime;
                        
                        // Use 95% of remaining phase time for adaptive warmup, leaving minimal time for stabilization
                        // The stabilization phase can be very short since streams continue running
                        const adaptiveWarmupTime = Math.min(maxAdaptiveWarmupDuration, remainingPhaseTime * 0.95);
                        adaptiveWarmupDeadline = currentTime + adaptiveWarmupTime;
                        
                        console.log(`🔧 UPLOAD WARMUP TIMING: Phase ends in ${(remainingPhaseTime/1000).toFixed(1)}s, using ${(adaptiveWarmupTime/1000).toFixed(1)}s for adaptive warmup`);
                    } else {
                        // Fallback: use fixed duration
                        adaptiveWarmupDeadline = currentTime + Math.min(maxAdaptiveWarmupDuration, 5250);
                        console.log(`🔧 UPLOAD WARMUP FALLBACK: Using ${Math.min(maxAdaptiveWarmupDuration, 5250)/1000}s fixed duration`);
                    }
                } else {
                    // Fallback: use fixed duration
                    adaptiveWarmupDeadline = currentTime + Math.min(maxAdaptiveWarmupDuration, 5250);
                    console.log(`🔧 UPLOAD WARMUP FALLBACK: No phase timing available, using ${Math.min(maxAdaptiveWarmupDuration, 5250)/1000}s fixed duration`);
                }
            } else {
                // For download: use test-relative timing (original logic)
                adaptiveWarmupDeadline = this.startTime + 5250;
            }

            console.log(`🔧 ADAPTIVE WARMUP DEADLINE: ${this.direction === 'upload' ? 'Phase-aware' : 'Test-relative'} timing - ${(adaptiveWarmupDeadline - performance.now())/1000}s remaining`);
            
            // Check if throughputTracker is available
            if (typeof throughputTracker === 'undefined') {
                console.warn('⚠️ throughputTracker not available, using fallback methods');
            } else {
                console.log('✅ throughputTracker available');
            }
            
            // Stage 1: Speed Estimation (2-3 seconds)
            console.log(`🎯 Stage 1: Starting speed estimation`);
            await this.estimateConnectionSpeed();
            
            // Check for force termination after speed estimation
            if (this.forceTermination) {
                console.log(`🛑 ADAPTIVE WARMUP: Force termination requested after speed estimation`);
                return this.getDefaultConfigForTier('medium');
            }
            
            this.speedTier = this.classifySpeedTier(this.estimatedSpeed);
            console.log(`📊 Classified as ${this.speedTier} tier (${this.estimatedSpeed.toFixed(2)} Mbps)`);
            
            // Check remaining time
            const timeAfterEstimation = performance.now();
            const remainingTime = adaptiveWarmupDeadline - timeAfterEstimation;
            console.log(`⏱️ Time remaining for optimization: ${(remainingTime/1000).toFixed(1)}s`);
            
            if (remainingTime > 2000 && !this.forceTermination) { // At least 2 seconds remaining and not terminated
                // 🔧 CRITICAL: Clean up all discovery streams before parameter optimization
                console.log(`🧹 Cleaning up discovery streams before parameter optimization`);
                await this.cleanupAllStreams();
                
                // Wait for cleanup to complete and streams to fully terminate
                await new Promise(resolve => setTimeout(resolve, 300)); // Reduced cleanup wait
                console.log(`✅ Stream cleanup complete, ready for parameter optimization`);
                
                // Generate candidate configurations (only used for discrete fallback)
                this.candidateConfigs = this.generateCandidateConfigs(this.speedTier);
                
                // Stage 2: Unified Parameter & Chunk Size Optimization
                const timeBeforeOptimization = performance.now();
                const optimizationTimeRemaining = adaptiveWarmupDeadline - timeBeforeOptimization;
                
                if (optimizationTimeRemaining > 1000 && !this.forceTermination) { // At least 1 second remaining and not terminated
                    console.log(`⚙️ Stage 2: Starting unified parameter optimization with ${(optimizationTimeRemaining/1000).toFixed(1)}s remaining`);
                    const optimalConfig = await this.optimizeParameters();
                    
                    // Check for force termination after parameter optimization
                    if (this.forceTermination) {
                        console.log(`🛑 ADAPTIVE WARMUP: Force termination requested after parameter optimization`);
                        return this.optimalConfig || this.getDefaultConfigForTier(this.speedTier);
                    }
                    
                    console.log(`✅ Parameter optimization complete`);
                } else {
                    console.log(`⚠️ Insufficient time for parameter optimization, using default config`);
                    const optimalConfig = this.getDefaultConfigForTier(this.speedTier);
                }
            } else {
                console.log(`⚠️ Insufficient time remaining, using default configuration for ${this.speedTier} tier`);
            }
            
            // Ensure we have a valid optimal config
            const optimalConfig = this.optimalConfig || this.getDefaultConfigForTier(this.speedTier);
            
            // Add metadata to the result
            optimalConfig.adaptiveWarmup = {
                estimatedSpeed: this.estimatedSpeed,
                speedTier: this.speedTier,
                trialsCompleted: this.trialResults.length,
                bestScore: this.trialResults.length > 0
                    ? Math.max(...this.trialResults.filter(r => r.scoring.acceptable).map(r => r.scoring.score))
                    : 0,
                totalDuration: (performance.now() - this.startTime) / 1000,
                optimalChunkSize: optimalConfig.chunkSize || this.optimalChunkSize || 64 * 1024,
                unifiedOptimization: true
            };
            
            console.log(`✅ Adaptive warmup complete: ${optimalConfig.adaptiveWarmup.totalDuration.toFixed(2)}s`);
            
            // Start stabilization phase for remaining warmup time
            await this.startStabilizationPhase(optimalConfig, adaptiveWarmupDeadline);
            
            return optimalConfig;
            
        } catch (error) {
            console.error('❌ Adaptive warmup failed:', error);
            console.error('Error details:', {
                name: error.name,
                message: error.message,
                stack: error.stack
            });
            
            // Return fallback configuration
            const fallbackConfig = this.getDefaultConfigForTier('medium');
            fallbackConfig.adaptiveWarmup = {
                estimatedSpeed: 50,
                speedTier: 'medium',
                trialsCompleted: 0,
                bestScore: 0,
                totalDuration: (performance.now() - this.startTime) / 1000,
                optimalChunkSize: fallbackConfig.chunkSize || 64 * 1024,
                unifiedOptimization: true,
                fallback: true,
                error: error.message
            };
            
            console.log(`🔄 Fallback config due to error`);
            return fallbackConfig;
        } finally {
            // Clean up phase change listener
            if (this.phaseChangeListener) {
                window.removeEventListener('test:phaseChange', this.phaseChangeListener);
                console.log(`🧹 ADAPTIVE WARMUP: Cleaned up phase change listener`);
            }
        }
    }
    
    /**
     * Start stabilization phase with optimal parameters
     * @param {Object} optimalConfig - The optimal configuration discovered
     * @param {number} adaptiveWarmupDeadline - When adaptive warmup should end (15s mark)
     * @returns {Promise} Promise that resolves when stabilization is complete
     */
    async startStabilizationPhase(optimalConfig, adaptiveWarmupDeadline) {
        const stabilizationStart = performance.now();
        
        // 🔧 FIX: Use phase-relative timing for upload phases in stabilization calculation
        let warmupPhaseEnd;
        
        if (this.direction === 'upload') {
            // For upload, calculate the actual phase end time to ensure we don't bleed into saturation phase
            if (window.getCurrentPhase && window.getElapsedTime) {
                const currentPhase = window.getCurrentPhase();
                const elapsedTime = window.getElapsedTime();
                
                if (currentPhase === 'UPLOAD_WARMUP') {
                    // Upload warmup ends at 36 seconds
                    const uploadWarmupEndTime = 36000; // 36 seconds
                    const currentTime = performance.now();
                    const testStartTime = currentTime - (elapsedTime * 1000);
                    warmupPhaseEnd = testStartTime + uploadWarmupEndTime;
                    
                    console.log(`🔧 STABILIZATION TIMING: Phase ends at ${(warmupPhaseEnd - testStartTime)/1000}s, current time ${elapsedTime.toFixed(1)}s`);
                } else {
                    // Fallback: use adaptive warmup deadline
                    warmupPhaseEnd = adaptiveWarmupDeadline;
                }
            } else {
                // Fallback: use adaptive warmup deadline
                warmupPhaseEnd = adaptiveWarmupDeadline;
            }
        } else {
            // For download: use test-relative timing (original logic)
            warmupPhaseEnd = this.startTime + 5250;
        }

        const stabilizationDuration = Math.max(0, warmupPhaseEnd - stabilizationStart);
        
        if (stabilizationDuration > 500) { // At least 0.5 second of stabilization
            console.log(`🔄 STABILIZATION PHASE: ${(stabilizationDuration/1000).toFixed(1)}s remaining with optimal parameters`);
            console.log(`🔄 STABILIZATION CONFIG: ${JSON.stringify(optimalConfig)}`);
            
            // 🔧 FIX: Don't start new streams during stabilization to avoid throughput disruption
            // The optimization phase streams should continue running with optimal parameters
            console.log(`🔄 STABILIZATION: Letting existing optimized streams continue running`);
            console.log(`✅ STABILIZATION SETUP COMPLETE: No new streams needed - optimized streams continue until phase transition`);
            
            // No need to start new streams - this was causing the throughput drop
            // The existing streams from parameter optimization are already using optimal config
            
        } else {
            console.log(`⚠️ STABILIZATION SKIPPED: Insufficient time remaining (${(stabilizationDuration/1000).toFixed(1)}s)`);
        }
    }
    
    /**
     * Generate test data using optimized xoshiro PRNG with pooling
     * @param {number} size - Size of data to generate in bytes
     * @returns {Uint8Array} Generated test data
     */
    generateTestData(size) {
        try {
            // Use pooled data for better performance when possible
            if (size <= 256 * 1024) { // 256KB or smaller - use pooling
                return getPooledTestData(size);
            } else {
                // For very large chunks, generate directly
                console.log(`Generating large adaptive warmup chunk (${(size/1024/1024).toFixed(1)}MB) directly`);
                return xoshiroGenerateTestData(size);
            }
        } catch (error) {
            console.warn('⚠️ Optimized xoshiro generation failed, using direct generation:', error);
            // Fallback to direct generation (no crypto API fallback needed since we fixed the imports)
            return xoshiroGenerateTestData(size);
        }
    }
}

export default AdaptiveWarmup;