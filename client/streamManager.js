/**
 * Stream Manager
 * Handles the creation, tracking, and termination of network streams
 */

import { generateTestData as xoshiroGenerateTestData, getPooledTestData, initializeDataPools } from './xoshiro.js';
import { logWithLevel } from './config.js';
import { getCurrentPhase } from './ui.js';
import { serverDiscovery } from './discovery.js';

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

// Logging control - set to false to reduce console spam for production
const VERBOSE_LOGGING = false;

// Global variable to track the final chunk size from the discovery phase
let finalUploadDiscoveryChunkSize = 64 * 1024; // Default to 64KB if discovery phase is skipped

class StreamManager {
    // Stream registry
    static streams = {
        download: new Map(),
        upload: new Map()
    };
    
    // Stream ID counter
    static nextStreamId = 1;
    
    // Enhanced monitoring for resilient throughput tracking
    static streamMetrics = new Map();
    static lastMetricsSnapshot = { download: new Map(), upload: new Map() };
    
    /**
     * Generate a unique stream ID
     * @returns {string} A unique stream ID
     */
    static generateId() {
        return `stream-${Date.now()}-${this.nextStreamId++}`;
    }
    
    /**
     * Register a stream in the registry
     * @param {string} type - The stream type ('download' or 'upload')
     * @param {Object} stream - The stream object
     * @returns {string} The stream ID
     */
    static registerStream(type, stream) {
        const streamId = this.generateId();
        stream.id = streamId;
        stream.type = type;
        stream.createdAt = performance.now();
        stream.active = true;
        
        this.streams[type].set(streamId, stream);
        
        // Dispatch stream creation event
        this.dispatchStreamEvent('created', streamId, type);
        
        return streamId;
    }
    
    /**
     * Create a download stream
     * @param {Object} options - Stream options
     * @returns {string} The stream ID
     */
    static async createDownloadStream(options = {}) {
        const controller = new AbortController();
        const signal = controller.signal;
        
        const stream = {
            controller,
            bytesReceived: 0,
            options,
            readerCancelled: false,
            isSpeedTest: options.isSpeedTest || false
        };
        
        // Register stream before starting it
        const streamId = this.registerStream('download', stream);
        
        try {
            const headers = {
                'Pragma': 'no-cache',
                'Cache-Control': 'no-store',
                'X-Stream-ID': streamId,
                'X-Priority': 'low'
            };
            
            // Add speed test header if this is a speed test
            if (stream.isSpeedTest) {
                headers['X-Speed-Test'] = 'true';
            }
            
            stream.promise = serverDiscovery.makeRequest('/download', {
                method: 'GET',
                signal,
                cache: 'no-store',
                headers
            }).then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP error! Status: ${response.status}`);
                }
                
                // Check if stream is still active before proceeding
                if (!stream.active) {
                    console.log(`Stream ${streamId} no longer active, aborting reader setup`);
                    return false;
                }
                
                const reader = response.body.getReader();
                stream.reader = reader;
                
                // Process the stream
                return this.processStream(stream, reader);
            }).catch(error => {
                // Only handle error if stream is still active
                if (stream.active) {
                    this.handleStreamError(stream, error);
                } else {
                    console.log(`Stream ${streamId} already terminated, skipping error handling`);
                }
            });
            
            return streamId;
        } catch (error) {
            // Only handle error if stream is still active
            if (stream.active) {
                this.handleStreamError(stream, error);
            } else {
                console.log(`Stream ${streamId} already terminated, skipping error handling`);
            }
            return null;
        }
    }
    
    /**
     * Create an upload stream
     * @param {Object} options - Stream options
     * @param {Array} dataChunks - Data chunks to upload
     * @returns {string} The stream ID
     */
    static async createUploadStream(options = {}, dataChunks = []) {
        
        const stream = {
            bytesSent: 0,
            pendingUploads: 0,
            maxPendingUploads: options.pendingUploads || 1,
            uploadDelay: options.uploadDelay || 0,
            options,
            dataChunks,
            active: true,
            isSpeedTest: options.isSpeedTest || false
        };
        
        // Register stream before starting it
        const streamId = this.registerStream('upload', stream);
        
        try {
            // Start the upload process
            this.runUploadStream(stream);
            return streamId;
        } catch (error) {
            this.handleStreamError(stream, error);
            return null;
        }
    }
    
    /**
     * Run an upload stream
     * @param {Object} stream - The stream object
     */
    static async runUploadStream(stream) {
        // Keep track of pending uploads
        let pendingUploads = 0;
        let consecutiveErrors = 0;
        let lastUploadTime = performance.now();
        let noActivityDuration = 0;
        
        // Continue uploading while the stream is active
        while (stream.active) {
            const currentTime = performance.now();
            
            // Calculate time since last successful upload
            noActivityDuration = currentTime - lastUploadTime;
            
            // Check if we can start a new upload
            if (pendingUploads < stream.maxPendingUploads && stream.dataChunks.length > 0) {
                pendingUploads++;
                
                // Start a new upload
                this.uploadChunk(stream)
                    .then(() => {
                        pendingUploads--;
                        consecutiveErrors = 0; // Reset error counter on success
                        lastUploadTime = performance.now(); // Update last upload time
                    })
                    .catch(error => {
                        pendingUploads--;
                        if (error.name !== 'AbortError') {
                            console.error(`Upload error:`, error);
                            consecutiveErrors++;
                            
                            // If we have too many consecutive errors, add more chunks to ensure we keep trying
                            if (consecutiveErrors > 3 && stream.dataChunks.length < 5) {
                                // Add more chunks if we're running low
                                this.addMoreUploadChunks(stream, 10);
                                // Reduce consecutive errors but don't reset completely
                                consecutiveErrors = 2;
                            }
                        }
                    });
            } else if (stream.dataChunks.length < 5) {
                // If we're running low on chunks, add more to keep the stream alive
                // This applies to both discovery and full test phases
                this.addMoreUploadChunks(stream, 10);
            }
            
            // If no upload activity for more than 300ms, force new chunks and uploads
            // More aggressive for discovery phase to ensure continuous upload
            const activityThreshold = stream.options.isDiscovery ? 300 : 500;
            if (noActivityDuration > activityThreshold && pendingUploads === 0) {
                // Add more chunks to ensure we have something to upload
                // Add more chunks for discovery phase
                const chunkCount = stream.options.isDiscovery ? 30 : 20;
                this.addMoreUploadChunks(stream, chunkCount);
                // Reset the timer to prevent spamming
                lastUploadTime = performance.now();
            }
            
            // Add delay between upload attempts
            if (stream.uploadDelay > 0) {
                await new Promise(resolve => setTimeout(resolve, stream.uploadDelay));
            } else {
                // Small delay to prevent tight loop
                await new Promise(resolve => setTimeout(resolve, 10));
            }
            
            // If no more data chunks and no pending uploads, replenish
            if (stream.dataChunks.length === 0 && pendingUploads === 0) {
                // For both discovery and full test phases, add more chunks to keep going
                this.addMoreUploadChunks(stream, 20);
                
                // Reset the timer to prevent spamming
                lastUploadTime = performance.now();
            }
        }
    }
    
    /**
     * Upload a chunk of data
     * @param {Object} stream - The stream object
     * @returns {Promise} A promise that resolves when the upload is complete
     */
    static async uploadChunk(stream) {
        if (!stream.active || stream.dataChunks.length === 0) {
            return;
        }
        
        // Get a chunk to upload
        const chunk = stream.dataChunks[0];
        
        // Create a controller for this upload with a longer timeout (15 seconds)
        const controller = new AbortController();
        const signal = controller.signal;
        const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout
        
        try {
            // Log chunk size before upload
            const chunkSize = chunk.length;
            // Consolidated upload logging - only log every 10th chunk to reduce verbosity
            if (VERBOSE_LOGGING && stream.chunksUploaded % 10 === 0) {
                logWithLevel('INFO', `Stream ${stream.id}: uploaded ${stream.chunksUploaded} chunks, ${Math.round(stream.bytesSent/1024)}KB total`);
            }
            
            // Log phase information
            if (VERBOSE_LOGGING) {
                const phaseInfo = stream.options.isDiscovery ? 'discovery' : 'full test';
                console.log(`Stream ${stream.id} is in ${phaseInfo} phase`);
            }
            
            // Perform the upload with retry logic (reduced retries to prevent spam)
            let retries = 0;
            const maxRetries = 1; // Reduced from 2 to 1 to prevent request spam
            let response = null;
            
            while (retries <= maxRetries) {
                try {
                    response = await serverDiscovery.makeRequest('/upload', {
                        method: 'POST',
                        signal,
                        headers: createUploadHeaders({
                            'X-Stream-ID': stream.id,
                            'X-Priority': 'low',
                            'X-Retry-Count': retries.toString(),
                            ...(stream.isSpeedTest && { 'X-Speed-Test': 'true' })
                        }),
                        body: chunk
                    });
                    
                    if (response.ok) {
                        break; // Success, exit retry loop
                    } else {
                        retries++;
                        if (retries <= maxRetries) {
                            await new Promise(resolve => setTimeout(resolve, 500)); // Wait 500ms before retry
                        }
                    }
                } catch (fetchError) {
                    retries++;
                    if (retries <= maxRetries && fetchError.name !== 'AbortError') {
                        await new Promise(resolve => setTimeout(resolve, 500)); // Wait 500ms before retry
                    } else {
                        throw fetchError; // Rethrow if max retries reached or if aborted
                    }
                }
            }
            
            // Clear the timeout
            clearTimeout(timeoutId);
            
            if (!response || !response.ok) {
                throw new Error(`HTTP error! Status: ${response ? response.status : 'unknown'}`);
            }
            
            // Update bytes sent
            const previousBytesSent = stream.bytesSent || 0;
            stream.bytesSent = (previousBytesSent + chunkSize);
            
            // Track chunk count for consolidated logging
            stream.chunksUploaded = (stream.chunksUploaded || 0) + 1;
            
            // If this is a discovery phase, track the chunk size for use in full test phases
            if (stream.options.isDiscovery) {
                finalUploadDiscoveryChunkSize = chunkSize;
                if (VERBOSE_LOGGING) {
                    console.log(`Updated final discovery chunk size to ${Math.round(finalUploadDiscoveryChunkSize/1024)}KB`);
                }
                
                // Also update the global optimal chunk size for consistency
                window.optimalUploadChunkSize = chunkSize;
            }
            
            // Remove the chunk from the queue
            stream.dataChunks.shift();
            
            return response;
        } catch (error) {
            // Clear the timeout if it exists
            clearTimeout(timeoutId);
            
            if (error.name !== 'AbortError') {
                console.error(`Upload chunk error:`, error);
            }
            throw error;
        }
    }
    
    /**
     * Process a stream
     * @param {Object} stream - The stream object
     * @param {ReadableStreamDefaultReader} reader - The stream reader
     * @returns {Promise} A promise that resolves when the stream is done
     */
    static async processStream(stream, reader) {
        try {
            while (true) {
                const { done, value } = await reader.read();
                
                if (done) {
                    break;
                }
                
                // Process the chunk
                stream.bytesReceived += value.length;
                
                // If delay is needed for pacing
                if (stream.options.addDelay) {
                    // Use the specified chunkDelay or default to 10ms
                    const delayMs = stream.options.chunkDelay || 10;
                    await new Promise(resolve => setTimeout(resolve, delayMs));
                }
            }
            
            // Mark reader as cancelled since it completed normally
            stream.readerCancelled = true;
            
            // Check if stream is already terminated to avoid double termination
            if (stream.active) {
                // Stream completed normally
                this.terminateStream(stream.id, stream.type);
            } else {
                // Stream already terminated
            }
            return true;
        } catch (error) {
            // Handle stream processing error
            this.handleStreamError(stream, error);
            return false;
        }
    }
    
    /**
     * Handle stream error
     * @param {Object} stream - The stream object
     * @param {Error} error - The error object
     */
    static handleStreamError(stream, error) {
        if (error.name !== 'AbortError') {
            console.error(`Stream ${stream.id} error:`, error);
        }
        
        // Check if stream is already terminated to avoid double termination
        if (stream.active) {
            // Ensure stream is terminated
            this.terminateStream(stream.id, stream.type);
        } else {
            // Stream already terminated
        }
    }
    
    /**
     * Terminate a stream with enhanced error handling and timeout
     * @param {string} streamId - The stream ID
     * @param {string} type - The stream type ('download' or 'upload')
     * @returns {boolean} True if the stream was terminated, false otherwise
     */
    static async terminateStream(streamId, type) {
        const streamMap = this.streams[type];
        const stream = streamMap.get(streamId);
        
        if (!stream) {
            console.warn(`Stream ${streamId} (${type}) not found in registry`);
            return false;
        }
        
        if (!stream.active) {
            console.log(`Stream ${streamId} (${type}) already inactive`);
            streamMap.delete(streamId);
            return true;
        }
        
        console.log(`🛑 Terminating ${type} stream: ${streamId}`);
        
        try {
            // Multiple termination mechanisms with timeout
            const terminationPromise = (async () => {
                if (stream.controller) {
                    stream.controller.abort();
                    stream.controller = null;
                }
                
                if (stream.reader) {
                    try {
                        // Check if the reader is already closed or cancelled
                        if (!stream.readerCancelled) {
                            await stream.reader.cancel();
                            stream.readerCancelled = true;
                        }
                    } catch (e) {
                        // Suppress AbortError messages as they're expected when terminating streams
                        if (e.name !== 'AbortError') {
                            console.warn(`⚠️ Error cancelling reader for stream ${streamId}:`, e);
                        }
                    }
                    stream.reader = null;
                }
                
                // Clear all references
                stream.active = false;
                stream.promise = null;
            })();
            
            // Apply timeout to termination
            await Promise.race([
                terminationPromise,
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Stream termination timeout')), 3000)
                )
            ]);
            
            // Remove from registry
            streamMap.delete(streamId);
            
            // Dispatch stream termination event
            this.dispatchStreamEvent('terminated', streamId, type);
            
            if (VERBOSE_LOGGING) {
                console.log(`✅ Successfully terminated ${type} stream: ${streamId}`);
            }
            return true;
            
        } catch (error) {
            console.error(`❌ Error terminating stream ${streamId}:`, error);
            
            // Force removal even if error occurs
            if (stream) {
                stream.active = false;
            }
            streamMap.delete(streamId);
            
            // Dispatch termination event even on error for consistency
            this.dispatchStreamEvent('terminated', streamId, type);
            
            return false;
        }
    }
    
    /**
     * Terminate all streams with timeout and verification
     * @returns {Promise} A promise that resolves when all streams are terminated
     */
    static async terminateAllStreams() {
        console.log('🛑 Terminating all streams...');
        
        const downloadPromises = Array.from(this.streams.download.keys())
            .map(id => this.terminateStream(id, 'download'));
            
        const uploadPromises = Array.from(this.streams.upload.keys())
            .map(id => this.terminateStream(id, 'upload'));
            
        // Wait for all terminations to complete with timeout
        try {
            await Promise.race([
                Promise.all([...downloadPromises, ...uploadPromises]),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Termination timeout')), 5000)
                )
            ]);
        } catch (error) {
            console.warn('⚠️ Graceful termination failed, triggering emergency cleanup:', error);
            await this.emergencyCleanup();
            return true;
        }
        
        // Verify all streams are actually terminated
        if (this.streams.download.size > 0 || this.streams.upload.size > 0) {
            console.warn('⚠️ Some streams still active after termination, triggering emergency cleanup');
            await this.emergencyCleanup();
            return true;
        }
        
        console.log('✅ All streams terminated and verified');
        
        // Dispatch termination complete event
        window.dispatchEvent(new CustomEvent('stream:all_terminated', {
            detail: {
                timestamp: performance.now()
            }
        }));
        
        return true;
    }
    
    /**
     * Reset the stream registry
     */
    static resetRegistry() {
        this.streams.download.clear();
        this.streams.upload.clear();
        
        // Dispatch registry reset event
        window.dispatchEvent(new CustomEvent('stream:reset', {
            detail: {
                timestamp: performance.now()
            }
        }));
    }
    
    /**
     * Emergency cleanup - force terminate all streams with extreme prejudice
     * @returns {Promise} A promise that resolves when emergency cleanup is complete
     */
    static async emergencyCleanup() {
        console.log('🚨 EMERGENCY CLEANUP: Force terminating all streams');
        
        // Force abort all controllers
        for (const [streamId, stream] of this.streams.download) {
            if (stream.controller) {
                stream.controller.abort();
            }
            if (stream.reader && !stream.readerCancelled) {
                try {
                    await stream.reader.cancel();
                } catch (e) {
                    // Ignore errors during emergency cleanup
                }
            }
            stream.active = false;
        }
        
        for (const [streamId, stream] of this.streams.upload) {
            stream.active = false;
        }
        
        // Clear all registries
        this.streams.download.clear();
        this.streams.upload.clear();
        
        // Dispatch emergency cleanup event
        window.dispatchEvent(new CustomEvent('stream:emergency_cleanup', {
            detail: { timestamp: performance.now() }
        }));
        
        console.log('✅ Emergency cleanup complete');
    }
    
    /**
     * Get active stream counts
     * @returns {Object} Object with download and upload counts
     */
    static getActiveStreamCounts() {
        return {
            download: this.streams.download.size,
            upload: this.streams.upload.size,
            total: this.streams.download.size + this.streams.upload.size
        };
    }
    
    /**
     * Get active streams for a specific direction
     * @param {string} direction - The direction ('download' or 'upload')
     * @returns {Array} Array of active stream IDs
     */
    static getActiveStreams(direction) {
        if (!this.streams[direction]) {
            return [];
        }
        
        // Return array of stream IDs for active streams
        return Array.from(this.streams[direction].keys()).filter(streamId => {
            const stream = this.streams[direction].get(streamId);
            return stream && stream.active;
        });
    }
    
    /**
     * Add more chunks to an upload stream to keep it going
     * @param {Object} stream - The stream object
     * @param {number} count - Number of chunks to add
     */
    static addMoreUploadChunks(stream, count = 10) {
        // For discovery phase, use gradually increasing chunk sizes
        // For full test, use the maximum size
        if (stream.options.isDiscovery) {
            // Calculate appropriate chunk sizes based on how many chunks we've already sent
            // This helps continue the gradual ramp-up even when adding more chunks
            const initialChunkSize = 4 * 1024; // 4KB initial size (works for all speeds)
            const maxTargetChunkSize = 128 * 1024; // 128KB max (reasonable for most connections)
            
            // Estimate how many chunks we've already processed based on bytes sent
            const bytesPerChunk = (initialChunkSize + maxTargetChunkSize) / 2; // Rough average
            const estimatedChunksProcessed = Math.floor(stream.bytesSent / bytesPerChunk) || 0;
            
            console.log(`Stream ${stream.id} estimated chunks processed: ${estimatedChunksProcessed}, bytes sent: ${stream.bytesSent}`);
            
            // Ensure we're adding enough chunks to keep the upload stream going
            // This is especially important for the discovery phase
            if (count < 10 && stream.options.isDiscovery) {
                count = 10; // Ensure we add at least 10 chunks for discovery phase
                console.log(`Increasing chunk count to ${count} to ensure continuous upload during discovery`);
            }
            
            for (let i = 0; i < count; i++) {
                // Calculate size for this chunk - gradually increase from initial to max
                // Use a logarithmic scale to start small and ramp up more slowly
                const chunkIndex = estimatedChunksProcessed + i;
                const progress = Math.min(1, chunkIndex / 30); // Cap at 1 after 30 chunks
                const scaleFactor = Math.pow(progress, 0.5); // Slower initial growth
                const targetChunkSize = Math.floor(initialChunkSize + scaleFactor * (maxTargetChunkSize - initialChunkSize));
                
                // Adding upload discovery chunk
                
                const chunk = this.generateUploadTestData(targetChunkSize);
                stream.dataChunks.push(chunk);
            }
        } else {
            // For full test, prioritize chunk size from stream options (simple warmup)
            let targetChunkSize;
            
            if (stream.options && stream.options.optimalChunkSize) {
                // Use chunk size from simple warmup stored on stream
                targetChunkSize = stream.options.optimalChunkSize;
                console.log(`🔧 SIMPLE WARMUP: Using optimal chunk size from stream: ${Math.round(targetChunkSize/1024)}KB`);
            } else if (window.optimalUploadChunkSize) {
                // Fallback to global adaptive warmup chunk size
                targetChunkSize = window.optimalUploadChunkSize;
                console.log(`🔧 FALLBACK: Using global adaptive warmup chunk size: ${Math.round(targetChunkSize/1024)}KB`);
            } else if (window.adaptiveWarmupResults && window.adaptiveWarmupResults.optimalChunkSize) {
                // Fallback to adaptive warmup results
                targetChunkSize = window.adaptiveWarmupResults.optimalChunkSize;
                console.log(`🔧 FALLBACK: Using adaptive warmup results chunk size: ${Math.round(targetChunkSize/1024)}KB`);
            } else {
                // Final fallback
                targetChunkSize = finalUploadDiscoveryChunkSize || 256 * 1024;
                console.log(`🔧 DEFAULT: Using fallback chunk size: ${Math.round(targetChunkSize/1024)}KB`);
            }
            
            console.log(`🔧 CHUNK SIZE: Adding ${count} chunks of ${Math.round(targetChunkSize/1024)}KB each for full test`);
            
            for (let i = 0; i < count; i++) {
                const chunk = this.generateUploadTestData(targetChunkSize);
                stream.dataChunks.push(chunk);
            }
        }
        
        // Added more chunks to upload stream
    }
    
    /**
     * Dispatch stream event
     * @param {string} eventType - The event type ('created' or 'terminated')
     * @param {string} streamId - The stream ID
     * @param {string} streamType - The stream type ('download' or 'upload')
     */
    static dispatchStreamEvent(eventType, streamId, streamType) {
        window.dispatchEvent(new CustomEvent('stream:lifecycle', {
            detail: {
                type: eventType,
                streamId,
                streamType,
                timestamp: performance.now()
            }
        }));
    }
    
    /**
     * Start download saturation
     * @param {boolean} isDiscovery - Whether this is a discovery phase
     * @param {number} fixedThroughput - Fixed throughput in Mbps (0 for auto)
     * @param {Object} params - Stream parameters
     * @returns {Promise} A promise that resolves when saturation is started
     */
    static async startDownloadSaturation(isDiscovery = false, fixedThroughput = 0, params = {}) {
        console.log(`Starting download saturation (${isDiscovery ? 'discovery' : 'full'} phase)`);
        
        // Log the full parameters received
        console.log(`Download saturation parameters received:`, JSON.stringify(params));
        
        // Get stream count from params or use default
        let streamCount;
        if (isDiscovery) {
            streamCount = params.streamCount || 1;
        } else {
            // For full test, use the parameters discovered during warmup
            streamCount = params.streamCount || 3;  // Default to 3 streams for better performance
            console.log(`Using discovered stream count for download: ${streamCount}`);
            console.log(`isDownloadPhase flag: ${params.isDownloadPhase}`);
            
            // Determine if this is for bidirectional phase by comparing core properties
            if (window.optimalDownloadParams) {
                const isBidirectional = !(params.streamCount === window.optimalDownloadParams.streamCount &&
                                         params.pendingUploads === window.optimalDownloadParams.pendingUploads &&
                                         params.isDownloadPhase === window.optimalDownloadParams.isDownloadPhase);
                console.log(`Is this for bidirectional phase? ${isBidirectional ? 'Yes' : 'No'}`);
            }
        }
        
        // Create specified number of download streams
        const streamPromises = [];
        for (let i = 0; i < streamCount; i++) {
            const options = {
                // Only add delay if explicitly requested in params
                // This ensures phase 3 (Download) and phase 6 (Bidirectional) behave consistently
                addDelay: params.addDelay || false,
                chunkDelay: params.chunkDelay || 10,
                chunkSize: 128 * 1024, // Use moderate chunk size (128KB) that works for most connections
                isDiscovery: isDiscovery, // Pass the phase information
                // Preserve the isDownloadPhase flag exactly as it was in the original parameters
                // This is critical for consistent behavior between phases
                isDownloadPhase: params.isDownloadPhase
            };
            
            // Log the options being used for this download stream
            console.log(`Download stream options: isDownloadPhase=${options.isDownloadPhase}, addDelay=${options.addDelay}`);
            
            streamPromises.push(this.createDownloadStream(options));
            
            // Add a small delay between starting streams
            if (i < streamCount - 1) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }
        
        return Promise.all(streamPromises);
    }
    
    /**
     * Start upload saturation
     * @param {boolean} isDiscovery - Whether this is a discovery phase
     * @param {number} fixedThroughput - Fixed throughput in Mbps (0 for auto)
     * @param {Object} params - Stream parameters
     * @param {Array} dataChunks - Data chunks to upload
     * @returns {Promise} A promise that resolves when saturation is started
     */
    static async startUploadSaturation(isDiscovery = false, fixedThroughput = 0, params = {}, dataChunks = []) {
        if (VERBOSE_LOGGING) {
            console.log(`🔧 UPLOAD DEBUG: Starting upload saturation (${isDiscovery ? 'discovery' : 'full'} phase)`);
            console.log(`🔧 UPLOAD DEBUG: Parameters received:`, JSON.stringify(params));
            
            // Check if this is being called during bidirectional phase
            const isBidirectionalCall = window.currentTestPhase === 'bidirectional';
            console.log(`🔧 UPLOAD DEBUG: Current test phase: ${window.currentTestPhase}`);
            console.log(`🔧 UPLOAD DEBUG: Is bidirectional call: ${isBidirectionalCall}`);
        }
        
        // Get parameters from params or use defaults
        // For full test, use more streams and pending uploads to better saturate the connection
        let streamCount, pendingUploads, uploadDelay, minDuration;
        
        if (isDiscovery) {
            // Reset the final chunk size at the beginning of the discovery phase
            // This ensures each test run starts fresh
            // Check if adaptive warmup has set an optimal chunk size
            if (window.optimalUploadChunkSize) {
                finalUploadDiscoveryChunkSize = window.optimalUploadChunkSize;
                console.log(`Using adaptive warmup optimal chunk size: ${Math.round(finalUploadDiscoveryChunkSize/1024)}KB`);
            } else if (window.adaptiveWarmupResults && window.adaptiveWarmupResults.optimalChunkSize) {
                finalUploadDiscoveryChunkSize = window.adaptiveWarmupResults.optimalChunkSize;
                console.log(`Using adaptive warmup results optimal chunk size: ${Math.round(finalUploadDiscoveryChunkSize/1024)}KB`);
            } else {
                finalUploadDiscoveryChunkSize = 64 * 1024; // Reset to default
                console.log(`Reset final discovery chunk size to ${Math.round(finalUploadDiscoveryChunkSize/1024)}KB for new discovery phase`);
            }
            
            streamCount = params.streamCount || 1;
            pendingUploads = params.pendingUploads || 1;
            uploadDelay = params.uploadDelay || 0; // Changed from 50 to 0 for better saturation
            minDuration = params.minDuration || 0; // Minimum duration for discovery phase
            
            // If minDuration is specified, pass it to the parameter discovery module
            if (minDuration > 0) {
                // Dispatch event to set minimum duration for parameter discovery
                window.dispatchEvent(new CustomEvent('upload:set_min_duration', {
                    detail: { minDuration }
                }));
                console.log(`Setting minimum upload discovery duration to ${minDuration/1000} seconds`);
            }
        } else {
            // For full test, use the EXACT parameters provided by the warmup phase
            // This is critical for consistent behavior between phases
            streamCount = params.streamCount;
            pendingUploads = params.pendingUploads;
            uploadDelay = params.uploadDelay !== undefined ? params.uploadDelay : 0;
            
            // Log the parameters in detail
            console.log(`Using upload parameters from warmup phase: streams=${streamCount}, pendingUploads=${pendingUploads}, uploadDelay=${uploadDelay}`);
            
            // Check if simple warmup provided a chunk size
            if (params.chunkSize) {
                console.log(`Simple warmup provided chunk size: ${Math.round(params.chunkSize/1024)}KB`);
            }
            
            // Determine if this is for bidirectional phase by checking current test phase
            // More reliable than parameter comparison since bidirectional uses same optimal parameters
            let currentPhase;
            try {
                currentPhase = getCurrentPhase();
            } catch (error) {
                console.warn('Failed to get current phase:', error);
                currentPhase = window.getCurrentPhase ? window.getCurrentPhase() : 'unknown';
            }
            const isBidirectional = currentPhase === 'bidirectional';
            
            console.log(`🔧 PHASE DEBUG: Current phase: ${currentPhase}`);
                  
            console.log(`🔧 UPLOAD DEBUG: Is this for bidirectional phase? ${isBidirectional ? 'Yes' : 'No'}`);
            console.log(`🔧 UPLOAD DEBUG: Optimal upload params: ${JSON.stringify(window.optimalUploadParams)}`);
            console.log(`🔧 UPLOAD DEBUG: Current params: ${JSON.stringify(params)}`);
            
            // Validate that we have valid parameters
            if (!streamCount || !pendingUploads) {
                console.warn(`WARNING: Invalid upload parameters received. Using fallbacks.`);
                streamCount = streamCount || 2;  // Increased from 1 to 2 for better performance
                pendingUploads = pendingUploads || 2;  // Increased from 1 to 2 for better performance
            }
        }
        
        // Create data chunks if not provided
        if (dataChunks.length === 0) {
            // Create chunks with random data using xoshiro PRNG
            const chunksPerStream = isDiscovery ? 50 : 20; // More chunks for discovery to allow for gradual size increase and continuous upload
            
            // For discovery phase, start with smaller chunks and gradually increase size
            // For full test, use the maximum size
            let initialChunkSize, maxTargetChunkSize;
            
            if (isDiscovery) {
                // Start with very small chunks (4KB) for discovery and gradually increase
                // This works well for all connection speeds
                initialChunkSize = 4 * 1024; // 4KB initial size
                maxTargetChunkSize = 128 * 1024; // 128KB max (reasonable for most connections)
                console.log(`Starting upload discovery with small chunks (${initialChunkSize/1024}KB) ramping up to ${maxTargetChunkSize/1024}KB based on connection speed`);
                
                // Create chunks with gradually increasing sizes
                for (let i = 0; i < chunksPerStream; i++) {
                    // Calculate size for this chunk - gradually increase from initial to max
                    // Use a logarithmic scale to start small and ramp up more slowly
                    const progress = i / (chunksPerStream - 1); // 0 to 1
                    const scaleFactor = Math.pow(progress, 0.5); // Slower initial growth
                    const targetChunkSize = Math.floor(initialChunkSize + scaleFactor * (maxTargetChunkSize - initialChunkSize));
                    
                    if (VERBOSE_LOGGING) {
                        console.log(`Upload discovery chunk ${i+1}/${chunksPerStream}: ${Math.round(targetChunkSize/1024)}KB`);
                    }
                    
                    const chunk = this.generateUploadTestData(targetChunkSize);
                    dataChunks.push(chunk);
                }
            } else {
                // For full test, prioritize chunk size from simple warmup parameters
                let targetChunkSize;
                
                if (params.chunkSize) {
                    // Use chunk size from simple warmup
                    targetChunkSize = params.chunkSize;
                    console.log(`🔧 SIMPLE WARMUP: Using optimal chunk size from warmup: ${Math.round(targetChunkSize/1024)}KB`);
                } else if (window.optimalUploadChunkSize) {
                    // Fallback to adaptive warmup if available
                    targetChunkSize = window.optimalUploadChunkSize;
                    console.log(`🔧 FALLBACK: Using adaptive warmup chunk size: ${Math.round(targetChunkSize/1024)}KB`);
                } else if (window.adaptiveWarmupResults && window.adaptiveWarmupResults.optimalChunkSize) {
                    // Fallback to adaptive warmup results
                    targetChunkSize = window.adaptiveWarmupResults.optimalChunkSize;
                    console.log(`🔧 FALLBACK: Using adaptive warmup results chunk size: ${Math.round(targetChunkSize/1024)}KB`);
                } else {
                    // Final fallback to discovery or default
                    targetChunkSize = finalUploadDiscoveryChunkSize || 256 * 1024;
                    console.log(`🔧 DEFAULT: Using fallback chunk size: ${Math.round(targetChunkSize/1024)}KB`);
                }
                
                console.log(`🔧 CHUNK SIZE: Creating ${chunksPerStream} initial chunks of ${Math.round(targetChunkSize/1024)}KB each for full test`);
                
                for (let i = 0; i < chunksPerStream; i++) {
                    const chunk = this.generateUploadTestData(targetChunkSize);
                    dataChunks.push(chunk);
                }
            }
        }
        
        // Store the target chunk size for use by addMoreUploadChunks
        const finalTargetChunkSize = dataChunks.length > 0 && dataChunks[0] 
            ? dataChunks[0].length 
            : (params.chunkSize || window.optimalUploadChunkSize || 256 * 1024);
        
        // Create specified number of upload streams
        const streamPromises = [];
        for (let i = 0; i < streamCount; i++) {
            const options = {
                pendingUploads,
                uploadDelay,
                isDiscovery: isDiscovery,  // Explicitly use the parameter value
                optimalChunkSize: finalTargetChunkSize  // Store optimal chunk size for later use
            };
            
            // Clone data chunks for each stream
            const streamChunks = [...dataChunks];
            
            streamPromises.push(this.createUploadStream(options, streamChunks));
            
            // Add a small delay between starting streams
            if (i < streamCount - 1) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }
        
        return Promise.all(streamPromises);
    }
    
    /**
     * Start bidirectional saturation
     * @param {number} downloadThroughput - Fixed download throughput in Mbps (0 for auto)
     * @param {number} uploadThroughput - Fixed upload throughput in Mbps (0 for auto)
     * @param {Object} downloadParams - Download stream parameters
     * @param {Object} uploadParams - Upload stream parameters
     * @returns {Promise} A promise that resolves when saturation is started
     */
    static async startBidirectionalSaturation(downloadThroughput = 0, uploadThroughput = 0, downloadParams = {}, uploadParams = {}) {
        if (VERBOSE_LOGGING) {
            console.log(`🔧 BIDIRECTIONAL DEBUG: Starting bidirectional saturation`);
            
            // Use the parameters discovered in the warmup phases WITHOUT MODIFICATION
            console.log(`🔧 BIDIRECTIONAL DEBUG: Download parameters: ${JSON.stringify(downloadParams)}`);
            console.log(`🔧 BIDIRECTIONAL DEBUG: Upload parameters: ${JSON.stringify(uploadParams)}`);
            
            // Check if we have active streams before starting
            const preStartCounts = this.getActiveStreamCounts();
            console.log(`🔧 BIDIRECTIONAL DEBUG: Active streams before start: ${preStartCounts.download} download, ${preStartCounts.upload} upload`);
        }
        
        // Compare with the original optimal parameters
        console.log(`Original optimal download parameters: ${JSON.stringify(window.optimalDownloadParams)}`);
        console.log(`Original optimal upload parameters: ${JSON.stringify(window.optimalUploadParams)}`);
        
        // Check if the parameters match - but ignore additional properties that might be present
        // Extract only the core properties for comparison
        const downloadParamsCore = {
            streamCount: downloadParams.streamCount,
            pendingUploads: downloadParams.pendingUploads
        };
        
        const uploadParamsCore = {
            streamCount: uploadParams.streamCount,
            pendingUploads: uploadParams.pendingUploads,
            uploadDelay: uploadParams.uploadDelay || 0
        };
        
        const optimalDownloadParamsCore = window.optimalDownloadParams ? {
            streamCount: window.optimalDownloadParams.streamCount,
            pendingUploads: window.optimalDownloadParams.pendingUploads
        } : null;
        
        const optimalUploadParamsCore = window.optimalUploadParams ? {
            streamCount: window.optimalUploadParams.streamCount,
            pendingUploads: window.optimalUploadParams.pendingUploads,
            uploadDelay: window.optimalUploadParams.uploadDelay || 0
        } : null;
        
        // Compare only the core properties
        const downloadParamsMatch = optimalDownloadParamsCore ?
            JSON.stringify(downloadParamsCore) === JSON.stringify(optimalDownloadParamsCore) : false;
        const uploadParamsMatch = optimalUploadParamsCore ?
            JSON.stringify(uploadParamsCore) === JSON.stringify(optimalUploadParamsCore) : false;
        
        console.log(`Download parameters match (core properties): ${downloadParamsMatch}`);
        console.log(`Upload parameters match (core properties): ${uploadParamsMatch}`);
        
        // Log detailed parameter information for debugging
        console.log(`Download parameters details:`);
        console.log(`  - Stream count: ${downloadParams.streamCount}`);
        console.log(`  - Pending uploads: ${downloadParams.pendingUploads}`);
        console.log(`  - isDownloadPhase: ${downloadParams.isDownloadPhase}`);
        
        console.log(`Upload parameters details:`);
        console.log(`  - Stream count: ${uploadParams.streamCount}`);
        console.log(`  - Pending uploads: ${uploadParams.pendingUploads}`);
        console.log(`  - Upload delay: ${uploadParams.uploadDelay}`);
        
        // Start download saturation
        console.log(`🔧 BIDIRECTIONAL DEBUG: Starting download streams...`);
        const downloadPromise = this.startDownloadSaturation(false, downloadThroughput, downloadParams);
        
        // Check stream counts after download start
        await new Promise(resolve => setTimeout(resolve, 100));
        const postDownloadCounts = this.getActiveStreamCounts();
        console.log(`🔧 BIDIRECTIONAL DEBUG: Active streams after download start: ${postDownloadCounts.download} download, ${postDownloadCounts.upload} upload`);
        
        // Add a small delay between starting download and upload
        await new Promise(resolve => setTimeout(resolve, 200));
        
        // Start upload saturation
        console.log(`🔧 BIDIRECTIONAL DEBUG: Starting upload streams...`);
        const uploadPromise = this.startUploadSaturation(false, uploadThroughput, uploadParams);
        
        // Check final stream counts
        await new Promise(resolve => setTimeout(resolve, 100));
        const finalCounts = this.getActiveStreamCounts();
        console.log(`🔧 BIDIRECTIONAL DEBUG: Final active streams: ${finalCounts.download} download, ${finalCounts.upload} upload`);
        
        return Promise.all([downloadPromise, uploadPromise]);
    }
    
    /**
     * Generate upload test data using optimized xoshiro PRNG with pooling
     * @param {number} size - Size of data to generate in bytes
     * @returns {Uint8Array} Generated test data
     */
    static generateUploadTestData(size) {
        try {
            // Use pooled data for better performance when possible
            if (size <= 256 * 1024) { // 256KB or smaller - use pooling
                return getPooledTestData(size);
            } else {
                // For very large chunks, generate directly
                console.log(`Generating large upload chunk (${(size/1024/1024).toFixed(1)}MB) directly`);
                return xoshiroGenerateTestData(size);
            }
        } catch (error) {
            console.warn('⚠️ Optimized xoshiro generation failed, using fallback:', error);
            // Fallback to direct generation
            return xoshiroGenerateTestData(size);
        }
    }
    
    /**
     * Initialize data pools for optimal performance
     * Call this during application startup
     */
    static initializeOptimizations() {
        console.log('Initializing StreamManager optimizations...');
        initializeDataPools();
        console.log('StreamManager optimizations ready');
    }
}


export default StreamManager;
