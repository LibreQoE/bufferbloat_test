/**
 * Saturation Module
 * Handles download and upload saturation tests
 */

import { initWithCryptoSeed, fillRandomBytes } from './xoshiro.js';

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

// Configuration
const THROUGHPUT_INTERVAL = 500; // ms - increased from 200ms for more stable measurements
const CONCURRENT_STREAMS = 8; // Moderate number of concurrent streams

// 🔧 FIX: Remove duplicate byte counting - throughputMonitor.js handles all measurements
// These variables are no longer needed as StreamManager tracks bytes directly
// let cumulativeBytesReceived = 0; // REMOVED - causes conflicts with throughputMonitor.js
// let cumulativeBytesSent = 0; // REMOVED - causes conflicts with throughputMonitor.js
// let lastThroughputResetTime = 0; // REMOVED - no longer needed
// const CUMULATIVE_RESET_INTERVAL = 10000; // REMOVED - no longer needed
const UPLOAD_CHUNK_SIZE = 128 * 1024; // Increased from 64KB to 128KB for better throughput
const UPLOAD_CHUNKS_PER_REQUEST = 4; // Increased from 2 to 4 for better throughput
const MAX_PENDING_UPLOADS = 2; // Moderate maximum pending uploads per stream
const UPLOAD_DELAY = 75; // Increased from 50ms to 75ms for more conservative testing

// Warmup phase configuration - optimized for fast bandwidth detection
const WARMUP_CHUNK_SIZE = 32 * 1024; // Reduced from 64KB to 32KB for more conservative probing
const WARMUP_CHUNKS_PER_REQUEST = 1; // Reduced from 2 to 1 for more conservative probing
const WARMUP_MEASUREMENT_INTERVAL = 150; // More frequent measurements during warmup
const WARMUP_STREAMS_INITIAL = 1; // Reduced from 2 to 1 for more conservative start
const WARMUP_MAX_STREAMS = 4; // Reduced from 6 to 4 for more conservative testing
const WARMUP_STREAM_RAMP_INTERVAL = 2000; // Increased from 1000ms to 2000ms for more gradual ramp-up

// Rate limiting and smoothing configuration
const RATE_LIMIT_WINDOW = 500; // ms - window for rate limiting
const DOWNLOAD_SMOOTHING_FACTOR = 0.7; // Higher values = more smoothing (0-1)
const UPLOAD_SMOOTHING_FACTOR = 0.8; // More aggressive smoothing for upload
const UPLOAD_PACING_ENABLED = true; // Enable upload pacing for smoother throughput
const DOWNLOAD_CHUNK_DELAY = 10; // ms - small delay between processing download chunks
const UPLOAD_RATE_LIMIT_BUFFER = 0.9; // Target 90% of measured throughput for upload
const RESERVED_BANDWIDTH_PERCENT = 5; // Reserve 5% of bandwidth for latency measurements

// Ramp-up configuration
const INITIAL_STREAMS = 2; // Start with two streams
const STREAM_RAMP_INTERVAL = 2500; // Add a new stream every 2.5 seconds
const INITIAL_PENDING_UPLOADS = 2; // Start with 2 pending uploads
const INITIAL_UPLOAD_DELAY = 150; // Start with moderate delays
const MAX_CONSECUTIVE_ERRORS = 3; // Maximum consecutive errors before backing off
const HIGH_LATENCY_THRESHOLD = 200; // ms - more conservative latency threshold

// High-bandwidth handling configuration
const MAX_UPLOAD_SIZE_PER_REQUEST = 4 * 1024 * 1024; // 4MB max per request
const MAX_CHUNK_SIZE_HIGH_BANDWIDTH = 256 * 1024; // 256KB max for high bandwidth
const MAX_THROUGHPUT_PER_STREAM = 300; // 300 Mbps per stream max for ultra-high bandwidth

// Adaptive latency threshold based on measured throughput using logarithmic scaling
const getLatencyThreshold = (throughput) => {
    // Use logarithmic scaling for a smooth curve that works for all connection speeds
    // This formula gives a range from 200ms (low throughput) to 300ms (very high throughput)
    const logScale = Math.log10(Math.max(1, throughput)) / Math.log10(10000);
    const threshold = 200 + (100 * logScale);
    
    return Math.round(threshold);
};

// Store recent latency measurements for adaptive decisions
let recentLatencyMeasurements = [];
const MAX_LATENCY_HISTORY = 10; // Keep last 10 measurements

// State variables
let downloadStreams = [];
let uploadStreams = [];
let downloadThroughputData = [];
let uploadThroughputData = [];
let throughputTimer = null;
let bytesReceived = new Array(CONCURRENT_STREAMS).fill(0);
let bytesSent = new Array(CONCURRENT_STREAMS).fill(0);
let lastMeasurementTime = 0;

// Global stream registry for enhanced tracking
let activeStreamRegistry = {
    download: new Map(), // Map of stream ID to stream object
    upload: new Map()    // Map of stream ID to stream object
};

// Stream ID counter
let streamIdCounter = 0;

// Rate limiting and smoothing state
let targetDownloadThroughput = 0; // Target download throughput in bytes per second
let targetUploadThroughput = 0; // Target upload throughput in bytes per second
let smoothedDownloadThroughput = 0; // Smoothed download throughput in Mbps
let smoothedUploadThroughput = 0; // Smoothed upload throughput in Mbps
let downloadTokenBucket = 0; // Bytes available to send/receive for download
let uploadTokenBucket = 0; // Bytes available to send for upload
let lastTokenRefillTime = 0; // Last time tokens were refilled for upload
let lastDownloadTokenRefillTime = 0; // Last time tokens were refilled for download
// Note: targetDownloadThroughput is already declared on line 71

// Flags to track if we're in discovery or using optimal parameters
let isDownloadDiscovery = false;
let isUploadDiscovery = false;
let usingOptimalDownloadParams = false;
let usingOptimalUploadParams = false;

// Store optimal parameters globally so they're accessible across phases
window.optimalDownloadParams = null;
window.optimalUploadParams = null;

/**
 * Start the download saturation test
 * @returns {Promise} Resolves when the test is started
 */
async function startDownloadSaturation(isDiscovery = false, fixedThroughput = 0, optimalParams = null) {
    console.log(`Starting download saturation test (${isDiscovery ? 'discovery' : 'full'} phase${
        fixedThroughput > 0 ? ` with fixed throughput: ${fixedThroughput.toFixed(2)} Mbps` : ''
    }${
        optimalParams ? ` using optimal parameters` : ''
    })`);
    
    // Set flags
    isDownloadDiscovery = isDiscovery;
    usingOptimalDownloadParams = optimalParams !== null;
    
    // Use globally stored parameters if not provided directly
    if (!optimalParams && window.optimalDownloadParams && !isDiscovery) {
        optimalParams = window.optimalDownloadParams;
        console.log("Using globally stored optimal download parameters:", optimalParams);
        usingOptimalDownloadParams = true;
    }
    
    if (optimalParams) {
        optimalDownloadParams = optimalParams;
        console.log("Stored optimal download parameters:", optimalDownloadParams);
        
        // Also store globally for other phases to use
        window.optimalDownloadParams = optimalParams;
    }
    
    // Only reset state if not continuing from discovery
    if (!isDiscovery) {
        stopAllStreams();
        downloadThroughputData = [];
        bytesReceived = new Array(CONCURRENT_STREAMS).fill(0);
        
        // Reset smoothed values
        smoothedDownloadThroughput = 0;
        
        // Reset the recent values array for moving average
        if (typeof recentDownloadValues !== 'undefined') {
            recentDownloadValues.length = 0;
        }
    }
    
    // Always start throughput measurement, even in warmup phase
    const now = performance.now();
    lastMeasurementTime = now;
    lastDownloadTokenRefillTime = now; // Initialize token bucket refill time
    
    if (throughputTimer) {
        clearInterval(throughputTimer);
    }
    throughputTimer = setInterval(measureDownloadThroughput, THROUGHPUT_INTERVAL);
    
    // Initialize target download throughput based on fixed throughput or previous measurements
    if (fixedThroughput > 0) {
        // Convert Mbps to bytes per millisecond for token bucket
        targetDownloadThroughput = (fixedThroughput * 1000000) / 8 / 1000;
        console.log(`Setting target download throughput to ${fixedThroughput} Mbps (${targetDownloadThroughput.toFixed(2)} bytes/ms)`);
    } else if (window.lastDownloadThroughput) {
        // Use previous measurement as a starting point, but be conservative
        const conservativeFactor = 0.8; // Use 80% of previous throughput
        targetDownloadThroughput = (window.lastDownloadThroughput * conservativeFactor * 1000000) / 8 / 1000;
        console.log(`Using previous throughput measurement: ${window.lastDownloadThroughput.toFixed(2)} Mbps, setting target to ${(window.lastDownloadThroughput * conservativeFactor).toFixed(2)} Mbps (${targetDownloadThroughput.toFixed(2)} bytes/ms)`);
    } else {
        // Start with a conservative default
        targetDownloadThroughput = 0; // Will fall back to delay-based pacing
    }
    
    // Set up latency-based backoff for download streams
    setupDownloadLatencyBackoff();
    
    // Use appropriate settings based on phase, fixed throughput, and optimal parameters
    let MAX_DOWNLOAD_STREAMS, INITIAL_DOWNLOAD_STREAMS, STREAM_RAMP_INTERVAL;
    
    if (optimalParams && optimalParams.streamCount > 0) {
        // Use the exact parameters that achieved max throughput during discovery
        console.log(`Using locked-in parameters: ${JSON.stringify(optimalParams)}`);
        MAX_DOWNLOAD_STREAMS = optimalParams.streamCount;
        INITIAL_DOWNLOAD_STREAMS = optimalParams.streamCount; // Start with all streams immediately
        STREAM_RAMP_INTERVAL = 0; // No ramp-up, use all streams immediately
    } else if (isDiscovery) {
        // Discovery phase: use ultra-conservative settings for download warmup
        // Start with absolute minimal impact and let parameter discovery gradually increase
        MAX_DOWNLOAD_STREAMS = 1; // Start with just 1 stream for download warmup
        INITIAL_DOWNLOAD_STREAMS = 1; // Only 1 stream in download warmup
        
        // Use smaller chunk sizes and add delays for discovery phase
        // These will be applied to the fetch request below
        window.DISCOVERY_DOWNLOAD_CHUNK_DELAY = 100; // Increased from 50ms to 100ms
        window.DISCOVERY_DOWNLOAD_MODE = true; // Flag to enable special handling in readStream
        
        // Add a timeout handler to detect and respond to timeouts
        window.addEventListener('latency:measurement', (event) => {
            // If we're in discovery mode and get a timeout, reduce parameters immediately
            if (window.DISCOVERY_DOWNLOAD_MODE && event.detail.isTimeout) {
                console.log("TIMEOUT detected during download discovery - reducing parameters");
                
                // Increase delay dramatically
                window.DISCOVERY_DOWNLOAD_CHUNK_DELAY = Math.min(300, window.DISCOVERY_DOWNLOAD_CHUNK_DELAY * 1.5);
                
                // Notify parameter discovery to back off
                if (typeof window.notifyDiscoveryBackoff === 'function') {
                    window.notifyDiscoveryBackoff(0.5); // Reduce parameters by 50%
                }
            }
        });
    } else if (fixedThroughput > 0) {
        // Full test with fixed throughput but no optimal parameters: use estimated settings
        const streamFactor = Math.min(Math.ceil(fixedThroughput / 100), 4);
        MAX_DOWNLOAD_STREAMS = Math.max(2, streamFactor); // At least 2 streams, up to 4
        INITIAL_DOWNLOAD_STREAMS = MAX_DOWNLOAD_STREAMS; // Start with all streams immediately
        STREAM_RAMP_INTERVAL = 0; // No ramp-up, use all streams immediately
    } else {
        // Default full test settings
        MAX_DOWNLOAD_STREAMS = 4;
        INITIAL_DOWNLOAD_STREAMS = 4; // Start with all streams immediately
        STREAM_RAMP_INTERVAL = 0; // No ramp-up, use all streams immediately
    }
    
    console.log(`Starting with ${INITIAL_DOWNLOAD_STREAMS} download streams and gradually ramping up to ${MAX_DOWNLOAD_STREAMS}`);
    
    // Start initial streams
    for (let i = 0; i < INITIAL_DOWNLOAD_STREAMS; i++) {
        const streamIndex = i;
        const controller = new AbortController();
        const signal = controller.signal;
        
        const stream = {
            controller: controller,
            promise: fetch('/download', {
                method: 'GET',
                signal: signal,
                cache: 'no-store',
                headers: {
                    'Pragma': 'no-cache',
                    'Cache-Control': 'no-store',
                    'X-Priority': 'low' // Lower priority than latency measurements
                }
            }).then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP error! Status: ${response.status}`);
                }
                
                const reader = response.body.getReader();
                stream.reader = reader; // Store reader reference for cleanup
                
                // Process the stream
                return readStream(reader, chunk => {
                    bytesReceived[streamIndex] += chunk.length;
                }, true); // Add small delay between chunks for smoother throughput
            }).catch(error => {
                if (error.name !== 'AbortError') {
                    console.error(`Download stream ${streamIndex} error:`, error);
                }
                // Remove from registry on error
                if (stream.id) {
                    activeStreamRegistry.download.delete(stream.id);
                }
            })
        };
        
        // Register the stream in the registry
        registerStream('download', stream);
        
        // Store in the array for backward compatibility
        downloadStreams[i] = stream;
        
        // Add a small delay between starting streams
        if (i < INITIAL_DOWNLOAD_STREAMS - 1) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }
    
    // Gradually add more streams
    if (INITIAL_DOWNLOAD_STREAMS < MAX_DOWNLOAD_STREAMS) {
        let currentStreams = INITIAL_DOWNLOAD_STREAMS;
        
        const rampInterval = setInterval(() => {
            if (currentStreams >= MAX_DOWNLOAD_STREAMS) {
                clearInterval(rampInterval);
                return;
            }
            
            console.log(`Ramping up: Adding download stream ${currentStreams}`);
            
            const streamIndex = currentStreams;
            const controller = new AbortController();
            const signal = controller.signal;
            
            const stream = {
                controller: controller,
                promise: fetch('/download', {
                    method: 'GET',
                    signal: signal,
                    cache: 'no-store',
                    headers: {
                        'Pragma': 'no-cache',
                        'Cache-Control': 'no-store',
                        'X-Priority': 'low' // Lower priority than latency measurements
                    }
                }).then(response => {
                    if (!response.ok) {
                        throw new Error(`HTTP error! Status: ${response.status}`);
                    }
                    
                    const reader = response.body.getReader();
                    stream.reader = reader; // Store reader reference for cleanup
                    
                    // Process the stream
                    return readStream(reader, chunk => {
                        bytesReceived[streamIndex] += chunk.length;
                    }, true); // Add delay between chunks for smoother throughput
                }).catch(error => {
                    if (error.name !== 'AbortError') {
                        console.error(`Download stream ${streamIndex} error:`, error);
                    }
                    // Remove from registry on error
                    if (stream.id) {
                        activeStreamRegistry.download.delete(stream.id);
                    }
                })
            };
            
            // Register the stream in the registry
            registerStream('download', stream);
            
            // Store in the array for backward compatibility
            downloadStreams[streamIndex] = stream;
            
            currentStreams++;
            
            // If we've reached max streams, clear the interval
            if (currentStreams >= MAX_DOWNLOAD_STREAMS) {
                console.log(`Download ramp-up complete: ${MAX_DOWNLOAD_STREAMS} streams active`);
                clearInterval(rampInterval);
            }
        }, STREAM_RAMP_INTERVAL); // Add a new stream every 2-3 seconds based on phase
    }
    
    return Promise.resolve();
}

/**
 * Start the upload saturation test
 * @returns {Promise} Resolves when the test is started
 */
// Global variable to store upload chunks
let uploadChunks = [];

async function startUploadSaturation(isDiscovery = false, fixedThroughput = 0, optimalParams = null) {
    console.log(`Starting upload saturation test (${isDiscovery ? 'discovery' : 'full'} phase${
        fixedThroughput > 0 ? ` with fixed throughput: ${fixedThroughput.toFixed(2)} Mbps` : ''
    }${
        optimalParams ? ` using optimal parameters` : ''
    })`);
    
    // Set flags
    isUploadDiscovery = isDiscovery;
    usingOptimalUploadParams = optimalParams !== null;
    
    // Use globally stored parameters if not provided directly
    if (!optimalParams && window.optimalUploadParams && !isDiscovery) {
        optimalParams = window.optimalUploadParams;
        console.log("Using globally stored optimal upload parameters:", optimalParams);
        usingOptimalUploadParams = true;
    }
    
    if (optimalParams) {
        optimalUploadParams = optimalParams;
        console.log("Stored optimal upload parameters:", optimalUploadParams);
        
        // Also store globally for other phases to use
        window.optimalUploadParams = optimalParams;
    }
    
    // Only reset state if not continuing from discovery
    if (!isDiscovery) {
        stopAllStreams();
        uploadThroughputData = [];
        bytesSent = new Array(CONCURRENT_STREAMS).fill(0);
        
        // Reset smoothed values
        smoothedUploadThroughput = 0;
        
        // Reset the recent values array for moving average
        if (typeof recentUploadThroughputValues !== 'undefined') {
            recentUploadThroughputValues.length = 0;
        }
    }
    
    // Always start throughput measurement, even in warmup phase
    lastMeasurementTime = performance.now();
    if (throughputTimer) {
        clearInterval(throughputTimer);
    }
    throughputTimer = setInterval(measureUploadThroughput, THROUGHPUT_INTERVAL);
        
    // Initialize the xoshiro PRNG with a cryptographically secure seed if needed
    if (!isDiscovery || uploadChunks.length === 0) {
        initWithCryptoSeed();
        
        console.log("Generating upload data using xoshiro PRNG");
        
        // Create adaptive chunks based on connection speed
        uploadChunks = []; // Reset the global array
        
        // Determine chunk size based on test phase and previous throughput measurements
        let effectiveChunkSize;
        let effectiveChunksPerRequest;
        const lastThroughput = window.lastUploadThroughput || 0;
        
        if (isDiscovery) {
            // For warmup/discovery phase, use smaller chunks for faster probing
            effectiveChunkSize = WARMUP_CHUNK_SIZE;
            effectiveChunksPerRequest = WARMUP_CHUNKS_PER_REQUEST;
            
            console.log(`Warmup phase: Using smaller chunks (${effectiveChunkSize / 1024} KB) for faster bandwidth probing`);
        } else {
            // Continuous scaling based on throughput - works for any connection speed
            // Logarithmic scaling to handle very high bandwidths (up to multi-gigabit)
            
            // Scale chunk size continuously from 64KB to 256KB based on throughput
            // This formula works well from 1 Mbps to 10+ Gbps
            // Reduced from previous max of 1MB to prevent server overload
            const logScale = Math.log10(Math.max(1, lastThroughput)) / Math.log10(1000);
            const chunkSizeScale = Math.min(1, Math.max(0, logScale));
            
            // Check if we need to use smaller chunks due to previous 413 errors
            let maxChunkSize = MAX_CHUNK_SIZE_HIGH_BANDWIDTH;
            if (window.needSmallerChunks) {
                console.log(`Using smaller chunks due to previous payload size errors`);
                maxChunkSize = Math.min(128 * 1024, maxChunkSize / 2);
                window.needSmallerChunks = false; // Reset flag after applying
            }
            
            // Use a single fixed chunk size for all connections
            // This simplifies the code and provides more consistent behavior
            const STANDARD_CHUNK_SIZE = 128 * 1024; // 128KB standard chunk size
            effectiveChunkSize = STANDARD_CHUNK_SIZE;
            
            // Use a fixed number of chunks per request for all connections
            // This eliminates bandwidth-specific handling and simplifies the code
            const STANDARD_CHUNKS_PER_REQUEST = 4; // 4 chunks per request for all connections
            effectiveChunksPerRequest = STANDARD_CHUNKS_PER_REQUEST;
            
            console.log(`Using standard chunk configuration: ${effectiveChunkSize/1024}KB chunks, ${effectiveChunksPerRequest} chunks per request`);
            
            // Ensure total upload size doesn't exceed the maximum
            const totalBytes = effectiveChunkSize * effectiveChunksPerRequest;
            if (totalBytes > MAX_UPLOAD_SIZE_PER_REQUEST) {
                // Reduce chunks per request to stay under the limit
                effectiveChunksPerRequest = Math.max(1, Math.floor(MAX_UPLOAD_SIZE_PER_REQUEST / effectiveChunkSize));
                console.log(`Reduced chunks per request to ${effectiveChunksPerRequest} to stay under ${MAX_UPLOAD_SIZE_PER_REQUEST/1024/1024}MB limit`);
            }
            
            console.log(`Continuous scaling: Using ${effectiveChunkSize/1024} KB chunks, ${effectiveChunksPerRequest} chunks per request (throughput: ${lastThroughput.toFixed(2)} Mbps, scale: ${chunkSizeScale.toFixed(2)})`);
        }
        
        // This section is now handled in the conditional block above
        
        console.log(`Using adaptive chunk size of ${effectiveChunkSize / 1024} KB and ${effectiveChunksPerRequest} chunks per request based on previous throughput: ${lastThroughput} Mbps`);
        
        // Create chunks with the adaptive size
        for (let i = 0; i < effectiveChunksPerRequest; i++) {
            // Create a chunk of random data
            const chunk = new Uint8Array(effectiveChunkSize);
            
            // Fill with random data using our fast PRNG
            fillRandomBytes(chunk);
            
            uploadChunks.push(chunk);
        }
        
        const totalBytes = effectiveChunkSize * effectiveChunksPerRequest;
        console.log(`Created ${effectiveChunksPerRequest} upload chunks of ${effectiveChunkSize} bytes each (total: ${totalBytes} bytes)`);
    }
    
    // Use appropriate settings based on phase, fixed throughput, and optimal parameters
    let MAX_UPLOAD_STREAMS, INITIAL_UPLOAD_STREAMS, UPLOAD_RAMP_INTERVAL, PENDING_UPLOADS, UPLOAD_DELAY_VALUE;
    
    if (optimalParams && optimalParams.streamCount > 0) {
        // Use the exact parameters that achieved max throughput during discovery
        console.log(`Using locked-in upload parameters: ${JSON.stringify(optimalParams)}`);
        MAX_UPLOAD_STREAMS = optimalParams.streamCount;
        INITIAL_UPLOAD_STREAMS = optimalParams.streamCount; // Start with all streams immediately
        UPLOAD_RAMP_INTERVAL = 0; // No ramp-up, use all streams immediately
        PENDING_UPLOADS = optimalParams.pendingUploads || 1;
        UPLOAD_DELAY_VALUE = optimalParams.uploadDelay || INITIAL_UPLOAD_DELAY;
    } else if (isDiscovery) {
        console.log(`Upload warmup phase: Using adaptive fast probing approach`);
        
        // Get previous throughput measurement if available
        const lastThroughput = window.lastUploadThroughput || 0;
        
        // Check if discovery mode is enabled
        if (window.DISCOVERY_UPLOAD_MODE) {
            console.log(`Upload discovery mode enabled: Using extremely conservative settings`);
            
            // Use extremely conservative settings for discovery mode
            MAX_UPLOAD_STREAMS = 1; // Start with just 1 stream
            INITIAL_UPLOAD_STREAMS = 1; // Only 1 initial stream
            UPLOAD_RAMP_INTERVAL = 0; // No ramp-up
            PENDING_UPLOADS = 1; // Only 1 pending upload
            UPLOAD_DELAY_VALUE = window.DISCOVERY_UPLOAD_CHUNK_DELAY || 50; // Use the specified delay
            
            console.log(`Conservative discovery settings: ${MAX_UPLOAD_STREAMS} max streams, ${INITIAL_UPLOAD_STREAMS} initial streams, ${PENDING_UPLOADS} pending uploads, ${UPLOAD_DELAY_VALUE}ms delay`);
        }
        // Adaptive settings based on previous measurements
        else if (lastThroughput > 0) {
            console.log(`Previous upload throughput: ${lastThroughput.toFixed(2)} Mbps, using as hint for warmup`);
            
            // Scale settings based on previous throughput, but more conservatively
            const streamScale = Math.min(0.7, Math.max(0.2, lastThroughput / 400)); // More conservative scaling
            const pendingScale = Math.min(0.7, Math.max(0.2, lastThroughput / 300)); // More conservative scaling
            const delayScale = Math.min(1.0, Math.max(0.3, 150 / lastThroughput)); // Higher minimum delay
            
            // Calculate adaptive settings
            MAX_UPLOAD_STREAMS = Math.max(1, Math.min(WARMUP_MAX_STREAMS, Math.ceil(WARMUP_MAX_STREAMS * streamScale)));
            INITIAL_UPLOAD_STREAMS = Math.max(1, Math.min(WARMUP_STREAMS_INITIAL, Math.ceil(WARMUP_STREAMS_INITIAL * streamScale)));
            UPLOAD_RAMP_INTERVAL = WARMUP_STREAM_RAMP_INTERVAL;
            PENDING_UPLOADS = Math.max(1, Math.min(2, Math.ceil(2 * pendingScale))); // Max 2 pending uploads
            UPLOAD_DELAY_VALUE = Math.max(50, Math.min(250, Math.ceil(250 * delayScale))); // Higher delay range
            
            console.log(`Adaptive warmup settings: ${MAX_UPLOAD_STREAMS} max streams, ${INITIAL_UPLOAD_STREAMS} initial streams, ${PENDING_UPLOADS} pending uploads, ${UPLOAD_DELAY_VALUE}ms delay`);
        } else {
            // Without previous measurements, use more conservative settings
            MAX_UPLOAD_STREAMS = Math.max(1, WARMUP_MAX_STREAMS - 2); // Reduce max streams
            INITIAL_UPLOAD_STREAMS = 1; // Start with just 1 stream
            UPLOAD_RAMP_INTERVAL = WARMUP_STREAM_RAMP_INTERVAL * 1.5; // Slower ramp-up
            PENDING_UPLOADS = 1; // Start with 1 pending upload
            UPLOAD_DELAY_VALUE = 150; // Use a higher delay
            
            console.log(`Conservative default settings: ${MAX_UPLOAD_STREAMS} max streams, ${INITIAL_UPLOAD_STREAMS} initial streams, ${PENDING_UPLOADS} pending uploads, ${UPLOAD_DELAY_VALUE}ms delay`);
        }
        
        // Override throughput measurement interval for faster feedback during warmup
        if (throughputTimer) {
            clearInterval(throughputTimer);
            throughputTimer = setInterval(() => {
                measureUploadThroughput();
            }, WARMUP_MEASUREMENT_INTERVAL);
            
            console.log(`Using faster measurement interval during warmup: ${WARMUP_MEASUREMENT_INTERVAL}ms`);
        }
    } else if (fixedThroughput > 0) {
        // Full test with fixed throughput but no optimal parameters: use continuous scaling
        console.log(`Using continuously scaled settings for fixed throughput: ${fixedThroughput.toFixed(2)} Mbps`);
        
        // Check for asymmetric connection (high download, low upload)
        // Use the last measured download throughput as a reference
        const lastDownloadThroughput = window.lastDownloadThroughput || 0;
        const isAsymmetricConnection = lastDownloadThroughput > 100 && fixedThroughput < 50;
        
        if (isAsymmetricConnection) {
            console.log(`Detected asymmetric connection: ${lastDownloadThroughput.toFixed(2)} Mbps down / ${fixedThroughput.toFixed(2)} Mbps up`);
            
            // For asymmetric connections with low upload, use more optimized settings
            // Use more streams with less aggressive parameters - LIMITED TO MAX 4
            MAX_UPLOAD_STREAMS = Math.max(2, Math.min(4, Math.ceil(fixedThroughput / 10)));
            INITIAL_UPLOAD_STREAMS = MAX_UPLOAD_STREAMS;
            UPLOAD_RAMP_INTERVAL = 0; // No ramp-up, use all streams immediately
            
            // Use more conservative pending uploads for low bandwidth
            PENDING_UPLOADS = Math.max(1, Math.min(2, Math.ceil(fixedThroughput / 15)));
            
            // Use longer delays for low bandwidth to prevent overwhelming
            UPLOAD_DELAY_VALUE = Math.max(20, Math.min(150, Math.round(150 - fixedThroughput)));
            
            console.log(`Asymmetric connection settings: ${MAX_UPLOAD_STREAMS} streams, ${PENDING_UPLOADS} pending uploads, ${UPLOAD_DELAY_VALUE}ms delay`);
        } else {
            // Standard logarithmic scaling for stream count - works from 1 Mbps to 10+ Gbps
            // This formula gives a smooth curve that scales well across all bandwidths
            const logScale = Math.log10(Math.max(1, fixedThroughput)) / Math.log10(10000);
            
            // Scale streams from 2 to 4 based on logarithmic throughput scale
            // LIMITED TO MAX 4 STREAMS to prevent latency spikes
            // This ensures we don't use too many streams for low bandwidth
            const streamCount = Math.max(2, Math.min(4, Math.round(
                2 + 2 * logScale
            )));
            
            // Use all streams immediately for fixed throughput tests
            MAX_UPLOAD_STREAMS = streamCount;
            INITIAL_UPLOAD_STREAMS = streamCount;
            UPLOAD_RAMP_INTERVAL = 0; // No ramp-up, use all streams immediately
            
            // Scale pending uploads using the same logarithmic approach
            // This gives 1-2 pending uploads for low bandwidth and up to 6 for very high bandwidth
            const pendingUploads = Math.max(1, Math.min(6, Math.round(
                1 + 5 * logScale
            )));
            PENDING_UPLOADS = pendingUploads;
            
            // Inverse logarithmic scaling for delay - lower delay for higher throughput
            // This gives ~100ms for low bandwidth and near 0ms for very high bandwidth
            const delayScale = 1 - logScale;
            UPLOAD_DELAY_VALUE = Math.max(0, Math.min(100, Math.round(
                100 * delayScale
            )));
        }
        
        // Special handling for ultra-high bandwidth connections (>1000 Mbps)
        // This prevents overwhelming the server with too much data
        if (fixedThroughput > 1000 && !isAsymmetricConnection) {
            console.log(`Ultra-high bandwidth detected (${fixedThroughput.toFixed(2)} Mbps), applying conservative settings`);
            
            // Use more streams with smaller chunks and more aggressive pacing - LIMITED TO MAX 4
            MAX_UPLOAD_STREAMS = Math.min(4, Math.max(2, Math.ceil(MAX_UPLOAD_STREAMS * 1.2)));
            PENDING_UPLOADS = Math.min(3, PENDING_UPLOADS); // Cap pending uploads
            UPLOAD_DELAY_VALUE = Math.max(10, UPLOAD_DELAY_VALUE); // Ensure minimum delay
            
            // Enable more aggressive pacing for ultra-high bandwidth
            UPLOAD_PACING_ENABLED = true;
            
            // Cap target upload throughput per stream to avoid overwhelming the server
            // This distributes load across more streams with better pacing
            targetUploadThroughput = Math.min(MAX_THROUGHPUT_PER_STREAM, fixedThroughput / MAX_UPLOAD_STREAMS);
            
            console.log(`Ultra-high bandwidth adjustments: ${MAX_UPLOAD_STREAMS} streams, ${PENDING_UPLOADS} pending uploads, ${UPLOAD_DELAY_VALUE}ms delay, ${targetUploadThroughput.toFixed(2)} Mbps per stream`);
        }
        
        console.log(`Continuous scaling for fixed throughput: ${MAX_UPLOAD_STREAMS} streams, ${PENDING_UPLOADS} pending uploads, ${UPLOAD_DELAY_VALUE}ms delay (log scale: ${logScale.toFixed(2)})`);
    } else {
        // Default full test settings with more gradual ramp-up - LIMITED TO MAX 4
        MAX_UPLOAD_STREAMS = 4; // Limited to 4 streams to prevent latency spikes
        INITIAL_UPLOAD_STREAMS = 2; // Start with just 2 streams
        UPLOAD_RAMP_INTERVAL = 2000; // Add a new stream every 2 seconds
        PENDING_UPLOADS = INITIAL_PENDING_UPLOADS;
        UPLOAD_DELAY_VALUE = INITIAL_UPLOAD_DELAY;
    }
    
    console.log(`Starting with ${INITIAL_UPLOAD_STREAMS} upload stream${INITIAL_UPLOAD_STREAMS > 1 ? 's' : ''} and gradually ramping up to ${MAX_UPLOAD_STREAMS}`);
    
    // Start initial stream(s)
    const promises = [];
    console.log(`Starting initial upload stream${INITIAL_UPLOAD_STREAMS > 1 ? 's' : ''} with ${isDiscovery ? 'discovery' : 'improved'} settings`);
    
    // Start initial streams
    for (let i = 0; i < INITIAL_UPLOAD_STREAMS; i++) {
        promises.push(runUploadStream(i, uploadChunks, PENDING_UPLOADS, UPLOAD_DELAY_VALUE));
        
        // Small delay between starting initial streams
    }
    
    // Implement gradual stream ramp-up if needed
    if (UPLOAD_RAMP_INTERVAL > 0 && MAX_UPLOAD_STREAMS > INITIAL_UPLOAD_STREAMS) {
        let currentStreamCount = INITIAL_UPLOAD_STREAMS;
        
        console.log(`Setting up gradual ramp-up from ${INITIAL_UPLOAD_STREAMS} to ${MAX_UPLOAD_STREAMS} upload streams`);
        
        const streamRampTimer = setInterval(() => {
            if (currentStreamCount < MAX_UPLOAD_STREAMS) {
                currentStreamCount++;
                console.log(`Ramping up to ${currentStreamCount} upload streams`);
                promises.push(runUploadStream(currentStreamCount - 1, uploadChunks, PENDING_UPLOADS, UPLOAD_DELAY_VALUE));
            } else {
                console.log(`Upload ramp-up complete: ${MAX_UPLOAD_STREAMS} streams active`);
                clearInterval(streamRampTimer);
            }
        }, UPLOAD_RAMP_INTERVAL);
        if (i < INITIAL_UPLOAD_STREAMS - 1) {
            await new Promise(resolve => setTimeout(resolve, 200));
        }
    }
    
    // No wait time in discovery phase - binary search will control timing
    if (!isDiscovery) {
        await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    // Gradually add more streams
    if (INITIAL_UPLOAD_STREAMS < MAX_UPLOAD_STREAMS) {
        let currentStreams = INITIAL_UPLOAD_STREAMS;
        
        const rampInterval = setInterval(() => {
            if (currentStreams >= MAX_UPLOAD_STREAMS) {
                clearInterval(rampInterval);
                return;
            }
            
            console.log(`Ramping up: Adding upload stream ${currentStreams}`);
            // Adaptive ramp-up strategy based on current phase and throughput
            const lastThroughput = window.lastUploadThroughput || 0;
            
            // For warmup phase, use more aggressive settings
            if (window.currentTestPhase === 'upload_warmup') {
                // Scale pending uploads based on throughput and current stream count
                const pendingScale = Math.min(1.0, Math.max(0.3, lastThroughput / 300));
                const pendingUploads = Math.max(1, Math.min(3, Math.round(1 + pendingScale * 2)));
                
                // Scale delay based on throughput and current stream count
                // Higher throughput = lower delay
                const delayScale = Math.min(1.0, Math.max(0.2, 100 / Math.max(1, lastThroughput)));
                const uploadDelay = Math.max(20, Math.min(100, Math.round(100 * delayScale - currentStreams * 5)));
                
                console.log(`Warmup ramp-up for stream ${currentStreams}: Using ${pendingUploads} pending uploads, ${uploadDelay}ms delay (throughput: ${lastThroughput.toFixed(2)} Mbps)`);
                promises.push(runUploadStream(currentStreams, uploadChunks, pendingUploads, uploadDelay));
            } else {
                // Standard settings for full test
                const pendingUploads = Math.min(2, MAX_PENDING_UPLOADS);
                const uploadDelay = Math.max(UPLOAD_DELAY + 20, INITIAL_UPLOAD_DELAY - (currentStreams * 5));
                
                console.log(`Standard ramp-up for stream ${currentStreams}: Using ${pendingUploads} pending uploads, ${uploadDelay}ms delay`);
                promises.push(runUploadStream(currentStreams, uploadChunks, pendingUploads, uploadDelay));
            }
            
            // Console log is now handled in the conditional blocks above
            
            currentStreams++;
            
            // If we've reached max streams, clear the interval
            if (currentStreams >= MAX_UPLOAD_STREAMS) {
                console.log(`Ramp-up complete: ${currentStreams} upload streams active`);
                clearInterval(rampInterval);
            }
        }, UPLOAD_RAMP_INTERVAL);
    }
    
    // Keep the upload running in the background
    Promise.all(promises).catch(err => {
        console.error("Upload stream error:", err);
    });
    
    return Promise.resolve();
}

/**
 * Start a single upload stream
 * @param {number} streamIndex - The index of the stream
 * @param {Uint8Array} data - The data to upload
 */
/**
 * Run a continuous upload stream
 * @param {number} streamIndex - The index of the stream
 * @param {Uint8Array} data - The data to upload
 * @returns {Promise} - A promise that resolves when the stream is stopped
 */
async function runUploadStream(streamIndex, dataChunks, maxPendingUploads = MAX_PENDING_UPLOADS, uploadDelay = UPLOAD_DELAY) {
    const controller = new AbortController();
    
    const totalBytes = dataChunks.reduce((sum, chunk) => sum + chunk.length, 0);
    console.log(`Starting upload stream ${streamIndex} with ${dataChunks.length} chunks (${totalBytes} bytes total)`);
    console.log(`  - Max pending uploads: ${maxPendingUploads}, Upload delay: ${uploadDelay}ms`);
    
    // Create a stream object to track this upload
    const stream = {
        controller: controller,
        active: true,
        pendingUploads: 0,
        totalUploaded: 0,
        maxPendingUploads: maxPendingUploads,
        uploadDelay: uploadDelay,
        successfulUploads: 0
    };
    
    // Register the stream in the registry
    registerStream('upload', stream);
    
    // Store in the array for backward compatibility
    uploadStreams[streamIndex] = stream;
    
    // Keep uploading until stopped
    let uploadCount = 0;
    let consecutiveErrors = 0;
    let backoffDelay = uploadDelay; // Start with the configured delay
    let highLatencyBackoff = false; // Track if we're in a high latency backoff period
    let lastLatencyCheck = performance.now();
    
    // Listen for high latency events
    const highLatencyHandler = (event) => {
        const latency = event.detail.latency;
        const now = performance.now();
        
        // Only check every 500ms to avoid too frequent adjustments
        if (now - lastLatencyCheck < 500) return;
        lastLatencyCheck = now;
        
        // Get the current throughput for adaptive decisions
        const lastThroughput = window.lastUploadThroughput || 0;
        
        // Use a single adaptive latency threshold based on logarithmic throughput scale
        // This provides a smooth curve that works for all connection speeds
        const logScale = Math.log10(Math.max(1, lastThroughput)) / Math.log10(10000);
        
        // Base threshold that increases with throughput (200ms to 300ms)
        const baseThreshold = 200 + (100 * logScale);
        
        // Adaptive backoff ratio that increases with throughput (40% to 80%)
        // Higher throughput connections can tolerate higher latency before backing off
        const backoffRatio = 0.4 + (0.4 * logScale);
        
        // Calculate the actual backoff threshold
        const backoffThreshold = baseThreshold * backoffRatio;
        
        if (logScale > 0.5) { // Only log for higher throughput connections
            console.log(`Adaptive latency threshold: ${baseThreshold.toFixed(0)}ms with ${(backoffRatio * 100).toFixed(0)}% backoff ratio (throughput: ${lastThroughput.toFixed(0)} Mbps)`);
        }
        
        // Only backoff if latency exceeds the adaptive threshold
        if (latency > backoffThreshold && !highLatencyBackoff) {
            highLatencyBackoff = true;
            
            // Calculate latency ratio using the base threshold
            const latencyRatio = latency / baseThreshold;
            
            // Use logarithmic scaling for all backoff parameters
            // This provides a smooth curve that works for all connection speeds
            
            // Backoff factor scales inversely with throughput (more aggressive for lower throughput)
            // Range: 1.2x (very high throughput) to 3.0x (low throughput)
            const backoffFactor = 3.0 - (1.8 * logScale);
            
            // Max backoff delay scales inversely with throughput - reduced maximum further
            // Range: 50ms (very high throughput) to 150ms (low throughput)
            const maxBackoffDelay = 150 - (100 * logScale);
            
            // Apply adaptive backoff with a more moderate approach
            backoffDelay = Math.min(backoffDelay * Math.min(backoffFactor, 1.2), maxBackoffDelay);
            
            if (uploadStreams[streamIndex]) {
                // Minimum pending uploads scales with throughput
                // Range: 1 (low throughput) to 3 (very high throughput)
                const minPending = Math.max(1, Math.round(1 + (2 * logScale)));
                
                // Reduction amount scales with latency ratio
                // More aggressive reduction for higher latency ratio
                const reductionAmount = Math.min(3, Math.max(1, Math.ceil(latencyRatio)));
                
                // Calculate new pending uploads value
                const newMaxPending = Math.max(minPending,
                    uploadStreams[streamIndex].maxPendingUploads - reductionAmount);
                
                console.log(`Upload stream ${streamIndex}: High latency detected (${latency.toFixed(0)}ms), adaptive backoff: delay=${backoffDelay.toFixed(0)}ms, pending=${newMaxPending}`);
                uploadStreams[streamIndex].maxPendingUploads = newMaxPending;
                
                // Delay factor scales inversely with throughput
                // Range: 1.2x (very high throughput) to 2.0x (low throughput)
                const delayFactor = 2.0 - (0.8 * logScale);
                
                // Max delay scales inversely with throughput
                // Range: 50ms (very high throughput) to 200ms (low throughput)
                const maxDelay = 200 - (150 * logScale);
                
                // Apply delay increase with a more moderate cap
                uploadStreams[streamIndex].uploadDelay = Math.min(
                    uploadStreams[streamIndex].uploadDelay * delayFactor,
                    Math.min(maxDelay, 100) // Cap at 100ms to prevent excessive delays
                );
                
                // For upload warmup phase, be extremely conservative about stopping streams
                // Only stop streams in the most extreme cases and maintain at least 6 active streams
                const stopThreshold = 2.0; // Only stop on extreme latency (200% of threshold)
                if (window.currentTestPhase === 'upload_warmup' && latencyRatio > stopThreshold &&
                    uploadStreams.filter(s => s && s.active).length > 6) { // Ensure at least 6 streams remain active
                    console.log(`Upload warmup phase: Extreme latency (${latency.toFixed(0)}ms), stopping stream ${streamIndex}`);
                    if (uploadStreams[streamIndex]) {
                        uploadStreams[streamIndex].active = false;
                    }
                }
            }
            
            // Recovery period scales with throughput - reduced further from 1500ms to 1000ms
            // Range: 300ms (very high throughput) to 1000ms (low throughput)
            const recoveryTime = 1000 - (700 * logScale);
            
            setTimeout(() => {
                highLatencyBackoff = false;
                console.log(`Upload stream ${streamIndex}: Latency backoff period ended after ${recoveryTime.toFixed(0)}ms`);
            }, recoveryTime);
        }
    };
    
    // Add and remove event listener
    window.addEventListener('latency:measurement', event => {
        // Store recent latency measurements for adaptive decisions
        const latency = event.detail.latency;
        recentLatencyMeasurements.push(latency);
        if (recentLatencyMeasurements.length > MAX_LATENCY_HISTORY) {
            recentLatencyMeasurements.shift(); // Remove oldest measurement
        }
        
        // Call the high latency handler
        highLatencyHandler(event);
    });
    
    // Make sure to remove the event listener when the stream is stopped
    const cleanup = () => {
        window.removeEventListener('latency:measurement', highLatencyHandler);
    };
    
    // Rate-limited queue system to maintain consistent uploads
    const startUpload = async () => {
        // Safety check to ensure the stream object exists
        if (!uploadStreams[streamIndex] || !uploadStreams[streamIndex].active) return;
        
        // Safely increment pending uploads
        if (uploadStreams[streamIndex]) {
            uploadStreams[streamIndex].pendingUploads++;
        }
        
        // Apply pacing if enabled and we have a target throughput
        if (UPLOAD_PACING_ENABLED && targetUploadThroughput > 0) {
            // Calculate how long to wait based on token bucket
            const totalBytes = dataChunks.reduce((sum, chunk) => sum + chunk.length, 0);
            
            // Get the latest latency measurement to adapt pacing
            const latestLatency = window.latestLatencyMeasurement || 0;
            const isHighLatency = latestLatency > 300; // Consider anything over 300ms as high latency
            const isVeryHighLatency = latestLatency > 600; // Consider anything over 600ms as very high latency
            
            // Adjust reserved bandwidth based on latency
            let reservedBandwidthPercent = RESERVED_BANDWIDTH_PERCENT; // Default 5%
            if (isHighLatency) {
                reservedBandwidthPercent = 15; // Increase to 15% during high latency
            }
            if (isVeryHighLatency) {
                reservedBandwidthPercent = 30; // Increase to 30% during very high latency
            }
            
            // Apply bandwidth reservation - reduce available tokens by reserved percentage
            const effectiveTargetThroughput = targetUploadThroughput * (1 - reservedBandwidthPercent/100);
            
            // Refill token bucket based on time elapsed
            const now = performance.now();
            const elapsed = now - lastTokenRefillTime;
            if (elapsed > 0) {
                // Simple token bucket refill - no smoothing factors or complex calculations
                // Just add tokens based on elapsed time and target throughput
                const tokensToAdd = (effectiveTargetThroughput * elapsed) / 1000; // Convert to ms
                
                // Adjust token bucket capacity based on latency
                let tokenBucketCapacity = effectiveTargetThroughput * 3; // Default 3 seconds worth
                if (isHighLatency) {
                    tokenBucketCapacity = effectiveTargetThroughput * 2; // Reduce to 2 seconds during high latency
                }
                if (isVeryHighLatency) {
                    tokenBucketCapacity = effectiveTargetThroughput * 1; // Reduce to 1 second during very high latency
                }
                
                // Simple refill without smoothing
                uploadTokenBucket = Math.min(uploadTokenBucket + tokensToAdd, tokenBucketCapacity);
                lastTokenRefillTime = now;
            }
            
            // Simple token bucket consumption with adaptive delays
            if (uploadTokenBucket < totalBytes) {
                // Calculate wait time with adaptive maximum cap
                let maxWaitTime = 50; // Default 50ms max wait
                if (isHighLatency) {
                    maxWaitTime = 100; // Increase to 100ms during high latency
                }
                if (isVeryHighLatency) {
                    maxWaitTime = 200; // Increase to 200ms during very high latency
                }
                
                const waitTime = Math.min(((totalBytes - uploadTokenBucket) / targetUploadThroughput) * 1000, maxWaitTime);
                
                // Adjust minimum wait time based on latency
                let minimumWaitTime = 5; // Default 5ms minimum
                if (isHighLatency) {
                    minimumWaitTime = 10; // Increase to 10ms during high latency
                }
                if (isVeryHighLatency) {
                    minimumWaitTime = 20; // Increase to 20ms during very high latency
                }
                
                const effectiveWaitTime = Math.max(waitTime, minimumWaitTime);
                
                // Log significant adjustments for debugging
                if (isVeryHighLatency) {
                    console.log(`Applying aggressive upload pacing due to very high latency (${latestLatency.toFixed(0)}ms): ${effectiveWaitTime.toFixed(1)}ms delay, ${reservedBandwidthPercent}% bandwidth reserved`);
                }
                
                await new Promise(resolve => setTimeout(resolve, effectiveWaitTime));
            } else {
                // Always add a small consistent delay, adjusted for latency
                let standardDelay = 5; // Default 5ms
                if (isHighLatency) {
                    standardDelay = 10; // Increase to 10ms during high latency
                }
                if (isVeryHighLatency) {
                    standardDelay = 20; // Increase to 20ms during very high latency
                }
                
                await new Promise(resolve => setTimeout(resolve, standardDelay));
            }
            
            // Consume tokens
            uploadTokenBucket = Math.max(0, uploadTokenBucket - totalBytes);
        }
        
        try {
            // Combine all chunks into one blob for this request
            const combinedBlob = new Blob(dataChunks, { type: 'application/octet-stream' });
            
            // Track request start time for response time monitoring
            const requestStartTime = performance.now();
            
            const response = await fetch('/upload', {
                method: 'POST',
                signal: controller.signal,
                headers: createUploadHeaders(),
                body: combinedBlob
            });
            
            // Calculate request duration for response time monitoring
            const requestDuration = performance.now() - requestStartTime;
            
            // Track server response times
            if (!window.serverResponseTimes) window.serverResponseTimes = [];
            window.serverResponseTimes.push(requestDuration);
            if (window.serverResponseTimes.length > 10) window.serverResponseTimes.shift();
            
            // Calculate average response time
            const avgResponseTime = window.serverResponseTimes.reduce((sum, time) => sum + time, 0) / window.serverResponseTimes.length;
            
            // If response times are increasing, the server might be under stress
            if (requestDuration > avgResponseTime * 1.5 && avgResponseTime > 100 && uploadStreams[streamIndex]) {
                console.log(`Upload stream ${streamIndex}: Server response time increasing (${requestDuration.toFixed(0)}ms vs avg ${avgResponseTime.toFixed(0)}ms), reducing load`);
                
                // Reduce load on server
                uploadStreams[streamIndex].uploadDelay = Math.min(500, uploadStreams[streamIndex].uploadDelay * 1.2);
                
                if (uploadStreams[streamIndex].maxPendingUploads > 1) {
                    uploadStreams[streamIndex].maxPendingUploads--;
                }
            }
            
            // Safety check again before updating counters
            if (response.ok && uploadStreams[streamIndex]) {
                // Update bytes sent counter
                bytesSent[streamIndex] += totalBytes;
                uploadCount++;
                uploadStreams[streamIndex].totalUploaded += totalBytes;
                uploadStreams[streamIndex].successfulUploads++;
                consecutiveErrors = 0;
                
                // Log every upload for debugging
                console.log(`Upload stream ${streamIndex}: Upload #${uploadCount} successful (${totalBytes} bytes)`);
                
                if (uploadCount % 5 === 0) {
                    console.log(`Upload stream ${streamIndex}: ${uploadCount} requests sent (${(uploadStreams[streamIndex].totalUploaded / 1024 / 1024).toFixed(2)} MB)`);
                }
            } else if (!response.ok) {
                console.error(`Upload error: ${response.status}`);
                consecutiveErrors++;
                
                // More aggressive backoff for server errors (413, 429, 500, 503)
                // These status codes indicate the server is overwhelmed
                if ([413, 429, 500, 503].includes(response.status)) {
                    // Server is overwhelmed, back off more aggressively
                    backoffDelay = Math.min(backoffDelay * 2.0, 2000); // Increase delay up to 2 seconds max
                    console.log(`Upload stream ${streamIndex}: Server stress detected (${response.status}), aggressive backoff - ${backoffDelay}ms delay`);
                    
                    // Reduce chunk size and pending uploads immediately
                    if (uploadStreams[streamIndex]) {
                        const newMaxPending = Math.max(1, Math.floor(uploadStreams[streamIndex].maxPendingUploads / 2));
                        console.log(`Upload stream ${streamIndex}: Server stress, reducing max pending to ${newMaxPending}`);
                        uploadStreams[streamIndex].maxPendingUploads = newMaxPending;
                        
                        // Also increase delay substantially
                        uploadStreams[streamIndex].uploadDelay = Math.min(500, uploadStreams[streamIndex].uploadDelay * 2);
                        
                        // For 413 (Payload Too Large) errors, reduce chunk size for future uploads
                        if (response.status === 413 && window.currentTestPhase === 'upload_warmup') {
                            console.log(`Upload stream ${streamIndex}: Payload too large, reducing chunk size for future uploads`);
                            // Signal to other parts of the code that we need smaller chunks
                            window.needSmallerChunks = true;
                        }
                    }
                } else {
                    // Regular error backoff
                    backoffDelay = Math.min(backoffDelay * 1.5, 1000); // Increase delay up to 1 second max
                    console.log(`Upload stream ${streamIndex}: Error backoff - ${backoffDelay}ms delay`);
                }
                
                // Add increasing delay after errors
                await new Promise(resolve => setTimeout(resolve, backoffDelay));
                
                // If too many consecutive errors, reduce pending uploads
                if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS && uploadStreams[streamIndex]) {
                    const newMaxPending = Math.max(1, uploadStreams[streamIndex].maxPendingUploads - 1);
                    console.log(`Upload stream ${streamIndex}: Too many errors, reducing max pending to ${newMaxPending}`);
                    uploadStreams[streamIndex].maxPendingUploads = newMaxPending;
                    consecutiveErrors = 0; // Reset counter after taking action
                }
            }
        } catch (error) {
            if (error.name !== 'AbortError') {
                console.error(`Upload stream ${streamIndex} error:`, error);
                consecutiveErrors++;
                
                // Add delay after errors
                await new Promise(resolve => setTimeout(resolve, 200));
            }
        } finally {
            // Safety check before decrementing
            if (uploadStreams[streamIndex]) {
                uploadStreams[streamIndex].pendingUploads--;
                
                // Start next upload if we're still active
                if (uploadStreams[streamIndex].active) {
                    // Use the stream's specific upload delay, reset backoff if successful
                    if (consecutiveErrors === 0) {
                        backoffDelay = uploadStreams[streamIndex].uploadDelay || UPLOAD_DELAY;
                    }
                    
                    // Add a small random jitter to prevent synchronized uploads
                    const jitter = Math.floor(Math.random() * 20); // 0-20ms jitter
                    const delay = backoffDelay + jitter;
                    
                    await new Promise(resolve => setTimeout(resolve, delay));
                    startUpload();
                }
            }
        }
    };
    
    // Start initial uploads (limited number based on the stream's configuration)
    const streamMaxPending = uploadStreams[streamIndex].maxPendingUploads || MAX_PENDING_UPLOADS;
    const promises = [];
    for (let i = 0; i < streamMaxPending; i++) {
        promises.push(startUpload());
    }
    
    // Wait for all pending uploads to complete when stopping
    while (uploadStreams[streamIndex]?.active) {
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // Clean up event listeners
    cleanup();
    
    // Final safety check before logging
    if (uploadStreams[streamIndex]) {
        console.log(`Upload stream ${streamIndex} stopped after sending ${uploadCount} requests (${(uploadStreams[streamIndex].totalUploaded / 1024 / 1024).toFixed(2)} MB total)`);
    } else {
        console.log(`Upload stream ${streamIndex} stopped after sending ${uploadCount} requests`);
    }
}

/**
 * Stop all active streams
 */
/**
 * Stop all active streams and clean up resources
 */
function stopAllStreams() {
    const counts = getActiveStreamCounts();
    console.log(`Stopping all streams: ${counts.downloadCount} download streams, ${counts.uploadCount} upload streams`);
    
    // Stop download streams with more aggressive cleanup
    for (const [id, stream] of activeStreamRegistry.download.entries()) {
        console.log(`Aborting download stream ${id}`);
        
        try {
            // Clear any timeouts
            if (stream.timeoutId) {
                clearTimeout(stream.timeoutId);
                stream.timeoutId = null;
            }
            
            // Abort the controller
            if (stream.controller) {
                stream.controller.abort("Stream explicitly aborted by stopAllStreams");
                // Force reference cleanup
                stream.controller = null;
                stream.promise = null;
            }
            
            // Clear the reader if it exists
            if (stream.reader) {
                stream.reader.cancel("Reader explicitly cancelled by stopAllStreams");
                stream.reader = null;
            }
            
            // Emit stream lifecycle event
            emitStreamEvent('terminated', id, { type: 'download' });
            
            // Remove from registry
            activeStreamRegistry.download.delete(id);
        } catch (e) {
            console.warn(`Error terminating download stream ${id}:`, e);
            // Force remove from registry even if error occurs
            activeStreamRegistry.download.delete(id);
        }
    }
    
    // Similar enhancements for upload streams
    for (const [id, stream] of activeStreamRegistry.upload.entries()) {
        console.log(`Stopping upload stream ${id}`);
        
        try {
            stream.active = false;
            
            if (stream.controller) {
                stream.controller.abort("Stream explicitly aborted by stopAllStreams");
                stream.controller = null;
            }
            
            // Force garbage collection of any pending promises
            if (stream.promise) {
                stream.promise = null;
            }
            
            // Emit stream lifecycle event
            emitStreamEvent('terminated', id, { type: 'upload' });
            
            // Remove from registry
            activeStreamRegistry.upload.delete(id);
        } catch (e) {
            console.warn(`Error terminating upload stream ${id}:`, e);
            // Force remove from registry even if error occurs
            activeStreamRegistry.upload.delete(id);
        }
    }
    
    // Clear arrays as well (legacy support)
    downloadStreams = [];
    uploadStreams = [];
    
    // Clear any throughput measurement timers
    if (throughputTimer) {
        clearInterval(throughputTimer);
        throughputTimer = null;
    }
    
    // Verify cleanup was successful
    const afterCounts = getActiveStreamCounts();
    console.log(`After cleanup: ${afterCounts.downloadCount} download streams, ${afterCounts.uploadCount} upload streams`);
    
    // Stop throughput measurement
    if (throughputTimer) {
        clearInterval(throughputTimer);
        throughputTimer = null;
    }
    
    // 🔧 FIX: Removed throughput reset time tracking - no longer needed without cumulative counters
    
    // Reset download backoff state
    downloadHighLatencyBackoff = false;
    downloadBackoffDelay = 5;
    
    // Reset discovery modes
    window.DISCOVERY_DOWNLOAD_MODE = false;
    window.DISCOVERY_UPLOAD_MODE = false;
    
    // Remove latency event listeners
    if (downloadLatencyHandler) {
        window.removeEventListener('latency:measurement', downloadLatencyHandler);
        downloadLatencyHandler = null;
    }
    
    // Force garbage collection hint
    bytesReceived = null;
    bytesSent = null;
    bytesReceived = new Array(CONCURRENT_STREAMS).fill(0);
    bytesSent = new Array(CONCURRENT_STREAMS).fill(0);
    
    // Add a final forced cleanup after a short delay
    setTimeout(() => {
        console.log("Performing final cleanup check");
        if (downloadStreams.length > 0 || uploadStreams.length > 0) {
            console.warn("Streams still exist after cleanup, forcing final reset");
            downloadStreams = [];
            uploadStreams = [];
        }
    }, 100);
    
    console.log("All streams stopped and resources cleaned up");
}

/**
 * Measure download throughput
 */
// Store recent download throughput values for smoothing
const recentDownloadValues = [];
const DOWNLOAD_SMOOTHING_WINDOW_SIZE = 5; // Number of points to average for download

// Exponential moving average alpha value (weight of new samples)
const EMA_ALPHA = 0.3; // 30% weight to new samples, 70% to history

// Note: smoothedDownloadThroughput is already declared at line 79

function measureDownloadThroughput() {
    const now = performance.now();
    const elapsedSeconds = (now - lastMeasurementTime) / 1000;
    lastMeasurementTime = now;
    
    if (elapsedSeconds <= 0) return;
    
    // Calculate total bytes received across all streams for this interval
    const intervalBytes = bytesReceived.reduce((sum, bytes) => sum + bytes, 0);
    
    // 🔧 FIX: Removed duplicate cumulative counter - throughputMonitor.js handles all measurements
    // No need for separate cumulative tracking here as StreamManager provides coordinated measurements
    
    // Reset interval byte counters for next measurement
    bytesReceived = new Array(CONCURRENT_STREAMS).fill(0);
    
    // Calculate raw throughput in Mbps (megabits per second)
    let rawThroughputMbps = (intervalBytes * 8) / (elapsedSeconds * 1000000);
    
    // Outlier handling - only cap extreme values rather than rejecting them
    // This helps prevent gaps in the throughput chart
    if (smoothedDownloadThroughput > 1.0 && rawThroughputMbps > smoothedDownloadThroughput * 5) {
        console.log(`Capping extreme download throughput: ${rawThroughputMbps.toFixed(2)} Mbps (previous: ${smoothedDownloadThroughput.toFixed(2)} Mbps)`);
        // Cap the value at 5x the previous instead of rejecting it
        rawThroughputMbps = smoothedDownloadThroughput * 5;
        console.log(`Capped to: ${rawThroughputMbps.toFixed(2)} Mbps`);
    }
    
    // Add to recent values array for moving average
    recentDownloadValues.push(rawThroughputMbps);
    
    // Keep only the most recent values for the moving average
    if (recentDownloadValues.length > DOWNLOAD_SMOOTHING_WINDOW_SIZE) {
        recentDownloadValues.shift();
    }
    
    // Calculate smoothed value (simple moving average)
    let movingAvgThroughput = rawThroughputMbps;
    if (recentDownloadValues.length >= 2) {
        const sum = recentDownloadValues.reduce((a, b) => a + b, 0);
        movingAvgThroughput = sum / recentDownloadValues.length;
    }
    
    // Apply exponential moving average for even smoother results
    if (smoothedDownloadThroughput === 0) {
        // First measurement
        smoothedDownloadThroughput = movingAvgThroughput;
    } else {
        // EMA formula: newValue = alpha * currentValue + (1 - alpha) * previousValue
        smoothedDownloadThroughput = (EMA_ALPHA * movingAvgThroughput) +
                                    ((1 - EMA_ALPHA) * smoothedDownloadThroughput);
    }
    
    console.log(`Download throughput: ${smoothedDownloadThroughput.toFixed(2)} Mbps (raw: ${rawThroughputMbps.toFixed(2)} Mbps)`);
    
    // Store the measurement
    downloadThroughputData.push(smoothedDownloadThroughput);
    
    // Store the throughput for adaptive pacing
    window.lastDownloadThroughput = smoothedDownloadThroughput;
    
    // Smooth target throughput update using exponential moving average
    if (targetDownloadThroughput > 0 && !usingOptimalDownloadParams) {
        // Target 90% of measured throughput
        const TARGET_PERCENTAGE = 0.9;
        const newTargetMbps = smoothedDownloadThroughput * TARGET_PERCENTAGE;
        const newTargetBytesPerMs = (newTargetMbps * 1000000) / 8 / 1000;
        
        // Apply EMA to target updates for smoother transitions
        const targetEmaAlpha = 0.2; // Even slower changes for target (20% weight to new value)
        targetDownloadThroughput = (targetEmaAlpha * newTargetBytesPerMs) +
                                  ((1 - targetEmaAlpha) * targetDownloadThroughput);
        
        console.log(`Updated target download throughput to ${(targetDownloadThroughput * 8 * 1000 / 1000000).toFixed(2)} Mbps`);
    }
    
    // Dispatch an event to notify about the new throughput measurement
    window.dispatchEvent(new CustomEvent('throughput:download', {
        detail: { throughput: smoothedDownloadThroughput }
    }));
}

// Store recent upload throughput values for smoothing
const recentUploadThroughputValues = [];
const UPLOAD_SMOOTHING_WINDOW_SIZE = 5; // Number of points to average for upload

/**
 * Measure upload throughput
 */
function measureUploadThroughput() {
    const now = performance.now();
    const elapsedSeconds = (now - lastMeasurementTime) / 1000;
    lastMeasurementTime = now;
    
    if (elapsedSeconds <= 0) return;
    
    // Calculate total bytes sent across all streams for this interval
    const intervalBytes = bytesSent.reduce((sum, bytes) => sum + bytes, 0);
    
    // 🔧 FIX: Removed duplicate cumulative counter - throughputMonitor.js handles all measurements
    // No need for separate cumulative tracking here as StreamManager provides coordinated measurements
    
    console.log(`Upload throughput measurement: ${intervalBytes} bytes in ${elapsedSeconds.toFixed(3)}s`);
    
    // Reset interval byte counters for next measurement
    bytesSent = new Array(CONCURRENT_STREAMS).fill(0);
    
    // Calculate raw throughput in Mbps (megabits per second)
    const rawThroughputMbps = (intervalBytes * 8) / (elapsedSeconds * 1000000);
    
    // Guard against NaN or Infinity values
    if (isNaN(rawThroughputMbps) || !isFinite(rawThroughputMbps)) {
        console.log(`Invalid upload throughput value: ${rawThroughputMbps}, using 0 instead`);
        return;
    }
    
    // Outlier rejection - only reject extreme outliers that are likely measurement errors
    // Skip values that are more than 5x the previous smoothed value (increased from 3x)
    // Only apply this if we have a significant previous value to compare against
    if (smoothedUploadThroughput > 1.0 && rawThroughputMbps > smoothedUploadThroughput * 5) {
        console.log(`Rejecting extreme outlier upload throughput: ${rawThroughputMbps.toFixed(2)} Mbps (previous: ${smoothedUploadThroughput.toFixed(2)} Mbps)`);
        // Instead of rejecting completely, cap the value at 5x the previous
        rawThroughputMbps = smoothedUploadThroughput * 5;
        console.log(`Capped to: ${rawThroughputMbps.toFixed(2)} Mbps`);
    }
    
    // Add to recent values array for moving average
    recentUploadThroughputValues.push(rawThroughputMbps);
    
    // Keep only the most recent values for the moving average
    if (recentUploadThroughputValues.length > UPLOAD_SMOOTHING_WINDOW_SIZE) {
        recentUploadThroughputValues.shift();
    }
    
    // Calculate smoothed value (simple moving average)
    let movingAvgThroughput = rawThroughputMbps;
    if (recentUploadThroughputValues.length >= 2) {
        const sum = recentUploadThroughputValues.reduce((a, b) => a + b, 0);
        movingAvgThroughput = sum / recentUploadThroughputValues.length;
    }
    
    // Apply exponential moving average for even smoother results
    if (smoothedUploadThroughput === 0) {
        // First measurement
        smoothedUploadThroughput = movingAvgThroughput;
    } else {
        // EMA formula: newValue = alpha * currentValue + (1 - alpha) * previousValue
        smoothedUploadThroughput = (EMA_ALPHA * movingAvgThroughput) +
                                  ((1 - EMA_ALPHA) * smoothedUploadThroughput);
    }
    
    // Final guard against NaN values
    if (isNaN(smoothedUploadThroughput) || !isFinite(smoothedUploadThroughput)) {
        console.log(`Smoothed upload throughput is invalid: ${smoothedUploadThroughput}, using raw value`);
        smoothedUploadThroughput = Math.max(0, rawThroughputMbps);
    }
    
    console.log(`Upload throughput: ${smoothedUploadThroughput.toFixed(2)} Mbps (raw: ${rawThroughputMbps.toFixed(2)} Mbps)`);
    
    // Store the throughput for adaptive chunk sizing
    window.lastUploadThroughput = smoothedUploadThroughput;
    
    // For statistics, only store meaningful measurements
    if (smoothedUploadThroughput > 0.1) {
        uploadThroughputData.push(smoothedUploadThroughput);
    } else {
        console.log("Low upload throughput value (for statistics only): " + smoothedUploadThroughput.toFixed(2) + " Mbps");
    }
    
    // Always dispatch the event to ensure the chart line is drawn
    window.dispatchEvent(new CustomEvent('throughput:upload', {
        detail: { throughput: smoothedUploadThroughput }
    }));
}

/**
 * Read a stream and process chunks
 * @param {ReadableStreamDefaultReader} reader - The stream reader
 * @param {Function} processChunk - Function to process each chunk
 * @returns {Promise} Resolves when the stream is fully read
 */
// Track high latency state for download streams
let downloadHighLatencyBackoff = false;
let downloadBackoffDelay = 5; // Start with 5ms delay
let downloadLatencyHandler = null; // Global reference to the latency handler

async function readStream(reader, processChunk, addDelay = false) {
    try {
        let aborted = false;
        
        while (!aborted) {
            try {
                const { done, value } = await reader.read();
                
                if (done) {
                    console.log("Stream reading complete");
                    break;
                }
                
                processChunk(value);
                
                // Add a delay between chunks for download streams with a simplified approach
                if (addDelay && value.length > 0) {
                    // Simple token bucket implementation
                    if (targetDownloadThroughput > 0) {
                        // Simple token bucket refill
                        const now = performance.now();
                        const elapsed = now - lastDownloadTokenRefillTime;
                        
                        if (elapsed > 0) {
                            // Standard bandwidth reservation
                            const RESERVED_BANDWIDTH_PERCENT = 5;
                            const effectiveTargetThroughput = targetDownloadThroughput * (1 - RESERVED_BANDWIDTH_PERCENT/100);
                            
                            // Simple token addition
                            const tokensToAdd = (effectiveTargetThroughput * elapsed) / 1000;
                            
                            // Fixed token bucket capacity - 3 seconds worth
                            const TOKEN_BUCKET_CAPACITY = effectiveTargetThroughput * 3;
                            
                            // Simple refill without smoothing factors
                            downloadTokenBucket = Math.min(downloadTokenBucket + tokensToAdd, TOKEN_BUCKET_CAPACITY);
                            lastDownloadTokenRefillTime = now;
                        }
                        
                        // Simple token consumption
                        if (downloadTokenBucket < value.length) {
                            // Simple wait time calculation with a maximum cap
                            const MAXIMUM_WAIT_TIME = 50; // Never wait more than 50ms
                            const MINIMUM_WAIT_TIME = 5;  // Always wait at least 5ms
                            
                            const waitTime = Math.min(
                                ((value.length - downloadTokenBucket) / targetDownloadThroughput) * 1000,
                                MAXIMUM_WAIT_TIME
                            );
                            
                            // Ensure minimum wait time
                            const effectiveWaitTime = Math.max(waitTime, MINIMUM_WAIT_TIME);
                            
                            // Consume tokens
                            downloadTokenBucket = Math.max(0, downloadTokenBucket - value.length);
                            
                            // Apply delay
                            await new Promise(resolve => setTimeout(resolve, effectiveWaitTime));
                            continue; // Skip additional delay logic
                        } else {
                            // Consume tokens
                            downloadTokenBucket = Math.max(0, downloadTokenBucket - value.length);
                        }
                    }
                    
                    // Simple fallback delay logic - no complex conditions or calculations
                    let delayTime;
                    
                    // Simple discovery mode handling
                    if (window.DISCOVERY_DOWNLOAD_MODE) {
                        // Fixed delay for discovery mode
                        delayTime = window.DISCOVERY_DOWNLOAD_CHUNK_DELAY || 100;
                    } else {
                        // Standard delay for normal operation
                        delayTime = downloadBackoffDelay;
                    }
                    
                    // Standard minimum delay
                    const MINIMUM_DELAY = 10;
                    delayTime = Math.max(delayTime, MINIMUM_DELAY);
                    
                    // Apply the delay
                    await new Promise(resolve => setTimeout(resolve, delayTime));
                }
            } catch (readError) {
                if (readError.name === 'AbortError') {
                    console.log("Stream reading aborted");
                    aborted = true;
                    break;
                } else {
                    throw readError;
                }
            }
        }
    } catch (error) {
        if (error.name !== 'AbortError') {
            console.error('Stream reading error:', error);
        } else {
            console.log("Stream aborted");
        }
    } finally {
        try {
            // Attempt to explicitly close the reader
            await reader.cancel("Stream explicitly cancelled");
            console.log("Reader explicitly cancelled");
        } catch (cancelError) {
            console.log("Error while cancelling reader:", cancelError);
        }
    }
}

// Latency-based backoff handler for download streams
function setupDownloadLatencyBackoff() {
    // Remove any existing listener to avoid duplicates
    if (downloadLatencyHandler) {
        window.removeEventListener('latency:measurement', downloadLatencyHandler);
    }
    
    downloadLatencyHandler = (event) => {
        const latency = event.detail.latency;
        const isTimeout = event.detail.isTimeout || false;
        
        // Get the current throughput for adaptive decisions
        const lastThroughput = window.lastDownloadThroughput || 0;
        
        // Use a much lower adaptive latency threshold
        const logScale = Math.log10(Math.max(1, lastThroughput)) / Math.log10(10000);
        
        // Lower base threshold (100ms to 200ms)
        const baseThreshold = 100 + (100 * logScale);
        
        // More aggressive backoff ratio (60% to 90%)
        const backoffRatio = 0.6 + (0.3 * logScale);
        
        // Calculate the actual backoff threshold
        const backoffThreshold = baseThreshold * backoffRatio;
        
        // Immediately backoff on timeouts
        if ((isTimeout || latency > backoffThreshold) && !downloadHighLatencyBackoff) {
            downloadHighLatencyBackoff = true;
            
            // Calculate how much we're exceeding the threshold
            const latencyRatio = latency / baseThreshold;
            
            // More aggressive backoff factor
            const backoffFactor = Math.min(4.0, Math.max(2.0, 4.0 - (lastThroughput / 500)));
            
            // Apply adaptive backoff to the delay - reduced maximum delay from 100ms to 50ms
            downloadBackoffDelay = Math.min(downloadBackoffDelay * backoffFactor, 50);
            
            // Ensure a minimum throughput by capping the maximum delay
            const MIN_THROUGHPUT_FACTOR = 0.2; // Maintain at least 20% of normal throughput
            const estimatedMaxDelay = lastThroughput > 0 ?
                (1000 / lastThroughput) * (1 / MIN_THROUGHPUT_FACTOR) : 50;
            downloadBackoffDelay = Math.min(downloadBackoffDelay, estimatedMaxDelay);
            
            console.log(`Download: High latency detected (${latency.toFixed(0)}ms), increasing chunk delay to ${downloadBackoffDelay.toFixed(0)}ms`);
            
            // Always reduce streams on timeouts
            if (isTimeout || latencyRatio > 1.2) {
                const activeStreams = downloadStreams.filter(s => s && s.controller).length;
                
                // More aggressive stream reduction - up to half of active streams
                const streamsToRemove = isTimeout ?
                    Math.min(activeStreams - 1, Math.ceil(activeStreams / 2)) :
                    Math.min(activeStreams - 1, Math.ceil(activeStreams / 4));
                
                if (activeStreams > 1 && streamsToRemove > 0) {
                    console.log(`Download: ${isTimeout ? 'TIMEOUT' : 'High latency'} detected (${latency.toFixed(0)}ms), reducing streams from ${activeStreams} to ${activeStreams - streamsToRemove}`);
                    
                    // Remove multiple streams from the end
                    for (let i = 0; i < streamsToRemove; i++) {
                        const streamIndex = activeStreams - 1 - i;
                        if (streamIndex >= 0 && downloadStreams[streamIndex] && downloadStreams[streamIndex].controller) {
                            downloadStreams[streamIndex].controller.abort();
                            downloadStreams[streamIndex] = null;
                        }
                    }
                }
            }
            
            // Shorter recovery period - reduced from 5000ms to 2000ms
            const recoveryTime = Math.min(2000, Math.max(1000, 2000 - (lastThroughput / 100)));
            
            setTimeout(() => {
                downloadHighLatencyBackoff = false;
                // Reduce the delay more aggressively - from 0.7 to 0.5 factor
                downloadBackoffDelay = Math.max(10, downloadBackoffDelay * 0.5);
                console.log(`Download: Latency backoff period ended after ${recoveryTime}ms, reducing delay to ${downloadBackoffDelay}ms`);
            }, recoveryTime);
        }
    };
    
    // Add the event listener
    window.addEventListener('latency:measurement', downloadLatencyHandler);
}

/**
 * Get the download throughput data
 * @returns {Array} Array of throughput measurements in Mbps
 */
function getDownloadThroughputData() {
    return [...downloadThroughputData];
}

/**
 * Get the upload throughput data
 * @returns {Array} Array of throughput measurements in Mbps
 */
function getUploadThroughputData() {
    return [...uploadThroughputData];
}

// Separate timing variables for bidirectional test
let lastDownloadMeasurementTime = 0;
let lastUploadMeasurementTime = 0;

/**
 * Start bidirectional saturation test (both download and upload simultaneously)
 * @returns {Promise} Resolves when the test is started
 */
async function startBidirectionalSaturation(
    fixedDownloadThroughput = 0,
    fixedUploadThroughput = 0,
    optimalDownloadParams = null,
    optimalUploadParams = null
) {
    console.log(`Starting bidirectional saturation test${
        (fixedDownloadThroughput > 0 || fixedUploadThroughput > 0) ?
        ` with fixed throughputs: Download=${fixedDownloadThroughput.toFixed(2)} Mbps, Upload=${fixedUploadThroughput.toFixed(2)} Mbps` :
        ' with simplified approach'
    }${
        (optimalDownloadParams || optimalUploadParams) ? ' using optimal parameters' : ''
    }`);
    
    // Define variables for bidirectional streams
    let BIDIRECTIONAL_STREAMS;
    let INITIAL_BIDIRECTIONAL_STREAMS;
    
    // Check if we have optimal parameters from warmup phases
    // First check the parameters passed to this function
    const hasOptimalDownloadParams = optimalDownloadParams && optimalDownloadParams.streamCount > 0;
    const hasOptimalUploadParams = optimalUploadParams && optimalUploadParams.streamCount > 0;
    
    // If no parameters were passed, check the global variables
    if (!hasOptimalDownloadParams && window.optimalDownloadParams && window.optimalDownloadParams.streamCount > 0) {
        optimalDownloadParams = window.optimalDownloadParams;
        console.log(`Using globally stored download parameters for bidirectional test: ${JSON.stringify(optimalDownloadParams)}`);
    }
    
    if (!hasOptimalUploadParams && window.optimalUploadParams && window.optimalUploadParams.streamCount > 0) {
        optimalUploadParams = window.optimalUploadParams;
        console.log(`Using globally stored upload parameters for bidirectional test: ${JSON.stringify(optimalUploadParams)}`);
    }
    
    // Use optimal parameters if available
    if (hasOptimalDownloadParams || hasOptimalUploadParams) {
        console.log(`Using optimal parameters from warmup phases for bidirectional test`);
        
        if (hasOptimalDownloadParams) {
            console.log(`Optimal download parameters: ${JSON.stringify(optimalDownloadParams)}`);
        }
        
        if (hasOptimalUploadParams) {
            console.log(`Optimal upload parameters: ${JSON.stringify(optimalUploadParams)}`);
        }
        
        // Use optimal stream counts if available, otherwise use reasonable defaults
        const downloadStreamCount = hasOptimalDownloadParams ? optimalDownloadParams.streamCount : 2;
        const uploadStreamCount = hasOptimalUploadParams ? optimalUploadParams.streamCount : 2;
        
        // Get the last measured throughputs
        const lastDownloadThroughput = window.lastDownloadThroughput || 0;
        const lastUploadThroughput = window.lastUploadThroughput || 0;
        
        // Check for asymmetric connection
        const isAsymmetricConnection = lastDownloadThroughput > (lastUploadThroughput * 5) && lastUploadThroughput > 0;
        
        // Reduction factors for bidirectional test
        let downloadStreamReduction = 0.7; // Reduce download streams by 30%
        let uploadStreamReduction = 0.7;   // Reduce upload streams by 30%
        
        if (isAsymmetricConnection) {
            console.log(`Detected asymmetric connection: ${lastDownloadThroughput.toFixed(2)} Mbps down / ${lastUploadThroughput.toFixed(2)} Mbps up`);
            
            // For asymmetric connections, reduce upload impact more to protect latency
            uploadStreamReduction = 0.5; // Reduce upload streams by 50%
            
            console.log(`Using more conservative upload settings for asymmetric connection`);
        }
        
        // Apply reductions to stream counts
        const adjustedDownloadStreams = Math.max(1, Math.floor(downloadStreamCount * downloadStreamReduction));
        const adjustedUploadStreams = Math.max(1, Math.floor(uploadStreamCount * uploadStreamReduction));
        
        // Use the adjusted stream counts
        BIDIRECTIONAL_STREAMS = Math.max(2, Math.max(adjustedDownloadStreams, adjustedUploadStreams));
        
        // Start with all streams immediately when using optimal parameters
        INITIAL_BIDIRECTIONAL_STREAMS = BIDIRECTIONAL_STREAMS;
        
        console.log(`Using adjusted parameters for bidirectional test: ${BIDIRECTIONAL_STREAMS} streams`);
        console.log(`Original: DL=${downloadStreamCount}, UL=${uploadStreamCount}, Adjusted: DL=${adjustedDownloadStreams}, UL=${adjustedUploadStreams}`);
    } else {
        // FALLBACK ONLY: This code only runs if warmup phases didn't complete successfully
        console.log(`WARNING: No optimal parameters available from warmup phases`);
        
        // Use a reasonable default configuration
        BIDIRECTIONAL_STREAMS = 4; // Use a moderate number of streams
        INITIAL_BIDIRECTIONAL_STREAMS = 2; // Start with fewer streams
        
        console.log(`Using fallback bidirectional configuration with ${BIDIRECTIONAL_STREAMS} max streams (${INITIAL_BIDIRECTIONAL_STREAMS} initial)`);
    }
    
    // Make sure we stop any existing streams first to avoid conflicts
    stopAllStreams();
    
    // Reset download backoff state explicitly
    downloadHighLatencyBackoff = false;
    downloadBackoffDelay = 5;
    
    // Initialize upload streams array
    uploadStreams = new Array(BIDIRECTIONAL_STREAMS);
    
    // Reset state
    downloadThroughputData = [];
    uploadThroughputData = [];
    bytesReceived = new Array(BIDIRECTIONAL_STREAMS).fill(0);
    bytesSent = new Array(BIDIRECTIONAL_STREAMS).fill(0);
    
    // Initialize separate timing variables
    lastDownloadMeasurementTime = performance.now();
    lastUploadMeasurementTime = performance.now();
    
    // Start combined throughput measurement
    throughputTimer = setInterval(() => {
        // Measure both download and upload throughput with separate timing
        measureBidirectionalDownloadThroughput();
        measureBidirectionalUploadThroughput();
    }, THROUGHPUT_INTERVAL);
    
    console.log(`Using ${BIDIRECTIONAL_STREAMS} streams each for download and upload (total: ${BIDIRECTIONAL_STREAMS * 2} connections) to avoid browser connection limits`);
    
    // Start download streams (2 streams)
    for (let i = 0; i < BIDIRECTIONAL_STREAMS; i++) {
        const streamIndex = i;
        const controller = new AbortController();
        const signal = controller.signal;
        
        const stream = {
            controller: controller,
            promise: fetch('/download', {
                method: 'GET',
                signal: signal,
                cache: 'no-store',
                headers: {
                    'Pragma': 'no-cache',
                    'Cache-Control': 'no-store',
                    'X-Stream-ID': `${streamIndex}` // Add stream ID for server logging
                }
            }).then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP error! Status: ${response.status}`);
                }
                
                const reader = response.body.getReader();
                stream.reader = reader; // Store reader reference for explicit cancellation
                
                // Process the stream
                return readStream(reader, chunk => {
                    bytesReceived[streamIndex] += chunk.length;
                });
            }).catch(error => {
                if (error.name !== 'AbortError') {
                    console.error(`Download stream ${streamIndex} error:`, error);
                } else {
                    console.log(`Download stream ${streamIndex} aborted`);
                }
                // Remove from registry on error
                if (stream.id) {
                    activeStreamRegistry.download.delete(stream.id);
                }
            })
        };
        
        // Register the stream in the registry
        registerStream('download', stream);
        
        // Store in the array for backward compatibility
        downloadStreams[i] = stream;
        
        // Set a timeout for the fetch request
        const timeoutId = setTimeout(() => {
            console.log(`Download stream ${streamIndex} timed out after 30 seconds`);
            if (downloadStreams[i] && downloadStreams[i].controller) {
                downloadStreams[i].controller.abort("Stream timed out after 30 seconds");
            }
        }, 30000); // 30 second timeout
        
        downloadStreams[i].timeoutId = timeoutId;
    }
    
    // Use the existing upload chunks if available, otherwise create new ones
    if (uploadChunks.length === 0) {
        // Initialize the PRNG if needed
        initWithCryptoSeed();
        
        // Create upload chunks
        for (let i = 0; i < UPLOAD_CHUNKS_PER_REQUEST; i++) {
            // Create a chunk of random data
            const chunk = new Uint8Array(UPLOAD_CHUNK_SIZE);
            
            // Fill with random data using our fast PRNG
            fillRandomBytes(chunk);
            
            uploadChunks.push(chunk);
        }
    }
    
    const totalBytes = UPLOAD_CHUNK_SIZE * UPLOAD_CHUNKS_PER_REQUEST;
    console.log(`Created ${UPLOAD_CHUNKS_PER_REQUEST} upload chunks of ${UPLOAD_CHUNK_SIZE} bytes each (total: ${totalBytes} bytes)`);
    
    // Start upload streams with a simpler approach
    const promises = [];
    
    console.log(`Starting with ${INITIAL_BIDIRECTIONAL_STREAMS} bidirectional upload stream`);
    
    // Determine upload settings based on optimal parameters or adaptive approach
    let pendingUploads;
    let uploadDelay;
    
    if (hasOptimalUploadParams) {
        // Use optimal upload parameters from warmup phase
        pendingUploads = optimalUploadParams.pendingUploads || 2;
        uploadDelay = optimalUploadParams.uploadDelay || 100;
        
        console.log(`Using optimal upload parameters for bidirectional test: ${pendingUploads} pending uploads, ${uploadDelay}ms delay`);
    } else {
        // FALLBACK ONLY: This code only runs if warmup phases didn't complete successfully
        console.log(`WARNING: Using fallback upload parameters since optimal parameters aren't available`);
        
        // Use reasonable defaults
        pendingUploads = 2;
        uploadDelay = 50;
        
        console.log(`Using fallback upload settings: ${pendingUploads} pending uploads, ${uploadDelay}ms delay`);
    }
    
    // Start with adaptive settings
    const uploadStream = {
        controller: new AbortController(),
        active: true,
        pendingUploads: 0,
        totalUploaded: 0,
        maxPendingUploads: pendingUploads,
        uploadDelay: uploadDelay,
        successfulUploads: 0
    };
    
    // Register the stream in the registry
    registerStream('upload', uploadStream);
    
    // Store in the array for backward compatibility
    uploadStreams[0] = uploadStream;
    
    try {
        const promise = runUploadStream(0, uploadChunks, pendingUploads, uploadDelay);
        promises.push(promise);
    } catch (err) {
        console.error(`Error starting upload stream 0:`, err);
    }
    
    // Add the second stream after a delay if needed
    if (BIDIRECTIONAL_STREAMS > 1) {
        setTimeout(() => {
            if (uploadStreams[0] && uploadStreams[0].successfulUploads > 0) {
                console.log("First upload stream is working, adding second stream");
                
                // Use the same settings as the first stream (optimal or adaptive)
                const uploadStream2 = {
                    controller: new AbortController(),
                    active: true,
                    pendingUploads: 0,
                    totalUploaded: 0,
                    maxPendingUploads: pendingUploads,
                    uploadDelay: uploadDelay,
                    successfulUploads: 0
                };
                
                // Register the stream in the registry
                registerStream('upload', uploadStream2);
                
                // Store in the array for backward compatibility
                uploadStreams[1] = uploadStream2;
                
                console.log(`Adding second bidirectional upload stream with same settings: ${pendingUploads} pending uploads, ${uploadDelay}ms delay`);
                
                try {
                    const promise = runUploadStream(1, uploadChunks, pendingUploads, uploadDelay);
                    promises.push(promise);
                } catch (err) {
                    console.error(`Error starting upload stream 1:`, err);
                }
            } else {
                console.log("First upload stream not working yet, not adding second stream");
            }
        }, 3000); // Wait 3 seconds before adding second stream
    }
    
    // Keep the upload running in the background
    Promise.all(promises).catch(err => {
        console.error("Upload stream error:", err);
    });
    
    return Promise.resolve();
}

/**
 * Measure download throughput for bidirectional test
 * Uses separate timing variable to avoid interference
 */
function measureBidirectionalDownloadThroughput() {
    const now = performance.now();
    const elapsedSeconds = (now - lastDownloadMeasurementTime) / 1000;
    lastDownloadMeasurementTime = now;
    
    if (elapsedSeconds <= 0) return;
    
    // Calculate total bytes received across all streams
    const totalBytes = bytesReceived.reduce((sum, bytes) => sum + bytes, 0);
    
    // Reset byte counters for next measurement
    bytesReceived = new Array(bytesReceived.length).fill(0);
    
    // Calculate throughput in Mbps (megabits per second)
    let throughputMbps = (totalBytes * 8) / (elapsedSeconds * 1000000);
    
    // Guard against NaN or Infinity values
    if (isNaN(throughputMbps) || !isFinite(throughputMbps)) {
        console.log(`Invalid bidirectional download throughput value: ${throughputMbps}, using 0 instead`);
        throughputMbps = 0;
    }
    
    // Outlier handling - only cap extreme values rather than rejecting them
    // This helps prevent gaps in the throughput chart
    if (window.lastDownloadThroughput > 1.0 && throughputMbps > window.lastDownloadThroughput * 5) {
        console.log(`Capping extreme bidirectional download throughput: ${throughputMbps.toFixed(2)} Mbps (previous: ${window.lastDownloadThroughput.toFixed(2)} Mbps)`);
        // Cap the value at 5x the previous instead of rejecting it
        throughputMbps = window.lastDownloadThroughput * 5;
        console.log(`Capped to: ${throughputMbps.toFixed(2)} Mbps`);
    }
    
    // Apply simple smoothing to avoid spikes
    // Use a weighted average with the previous value if available
    if (window.lastDownloadThroughput && window.lastDownloadThroughput > 0) {
        const SMOOTHING_FACTOR = 0.3; // 30% weight to new value, 70% to previous
        throughputMbps = (SMOOTHING_FACTOR * throughputMbps) +
                         ((1 - SMOOTHING_FACTOR) * window.lastDownloadThroughput);
    }
    
    // Store for next smoothing operation
    window.lastDownloadThroughput = throughputMbps;
    
    console.log(`Download throughput: ${throughputMbps.toFixed(2)} Mbps`);
    
    // Store the measurement
    downloadThroughputData.push(throughputMbps);
    
    // Dispatch an event to notify about the new throughput measurement
    window.dispatchEvent(new CustomEvent('throughput:download', {
        detail: { throughput: throughputMbps }
    }));
}

/**
 * Measure upload throughput for bidirectional test
 * Uses separate timing variable to avoid interference
 */
function measureBidirectionalUploadThroughput() {
    const now = performance.now();
    const elapsedSeconds = (now - lastUploadMeasurementTime) / 1000;
    lastUploadMeasurementTime = now;
    
    if (elapsedSeconds <= 0) return;
    
    // Calculate total bytes sent across all streams
    const totalBytes = bytesSent.reduce((sum, bytes) => sum + bytes, 0);
    
    console.log(`Upload throughput measurement: ${totalBytes} bytes in ${elapsedSeconds.toFixed(3)}s`);
    
    // Reset byte counters for next measurement
    bytesSent = new Array(bytesSent.length).fill(0);
    
    // Calculate throughput in Mbps (megabits per second)
    let throughputMbps = (totalBytes * 8) / (elapsedSeconds * 1000000);
    
    // Guard against NaN or Infinity values
    if (isNaN(throughputMbps) || !isFinite(throughputMbps)) {
        console.log(`Invalid bidirectional upload throughput value: ${throughputMbps}, using 0 instead`);
        throughputMbps = 0;
    }
    
    // Outlier handling - only cap extreme values rather than rejecting them
    // This helps prevent gaps in the throughput chart
    if (window.lastUploadThroughput > 1.0 && throughputMbps > window.lastUploadThroughput * 5) {
        console.log(`Capping extreme bidirectional upload throughput: ${throughputMbps.toFixed(2)} Mbps (previous: ${window.lastUploadThroughput.toFixed(2)} Mbps)`);
        // Cap the value at 5x the previous instead of rejecting it
        throughputMbps = window.lastUploadThroughput * 5;
        console.log(`Capped to: ${throughputMbps.toFixed(2)} Mbps`);
    }
    
    // Apply simple smoothing to avoid spikes
    // Use a weighted average with the previous value if available
    if (window.lastUploadThroughput && window.lastUploadThroughput > 0) {
        const SMOOTHING_FACTOR = 0.3; // 30% weight to new value, 70% to previous
        throughputMbps = (SMOOTHING_FACTOR * throughputMbps) +
                         ((1 - SMOOTHING_FACTOR) * window.lastUploadThroughput);
    }
    
    // Store for next smoothing operation
    window.lastUploadThroughput = throughputMbps;
    
    console.log(`Upload throughput: ${throughputMbps.toFixed(2)} Mbps`);
    
    // For bidirectional phase, always store and dispatch measurements
    // This ensures the upload line is always drawn on the chart
    
    // Store the measurement (for statistics)
    if (throughputMbps > 0.1) {
        uploadThroughputData.push(throughputMbps);
    } else {
        console.log("Low upload throughput value (for statistics only): " + throughputMbps.toFixed(2) + " Mbps");
    }
    
    // Always dispatch the event to ensure the chart line is drawn
    // With linear scale, we can use the actual value
    window.dispatchEvent(new CustomEvent('throughput:upload', {
        detail: { throughput: throughputMbps }
    }));
}

// Event listeners for applying parameters
window.addEventListener('download:apply_params', (event) => {
    const params = event.detail.params;
    console.log("Received download parameters event:", params);
    
    // Set flags
    isDownloadDiscovery = false;
    usingOptimalDownloadParams = true;
    window.optimalDownloadParams = params;
    
    // Apply parameters to existing streams
    applyOptimalDownloadParams(params);
});

window.addEventListener('upload:apply_params', (event) => {
    const params = event.detail.params;
    console.log("Received upload parameters event:", params);
    
    // Set flags
    isUploadDiscovery = false;
    usingOptimalUploadParams = true;
    window.optimalUploadParams = params;
    
    // Apply parameters to existing streams
    applyOptimalUploadParams(params);
});

/**
 * Apply optimal parameters to existing download streams
 * @param {Object} params - The optimal parameters
 */
function applyOptimalDownloadParams(params) {
    if (!params || !params.streamCount) {
        console.warn("Invalid optimal download parameters");
        return;
    }
    
    console.log("Applying optimal download parameters:", params);
    
    // Adjust stream count if needed
    const currentStreamCount = downloadStreams.filter(s => s && s.controller).length;
    const targetStreamCount = params.streamCount;
    
    if (currentStreamCount < targetStreamCount) {
        // Add more streams to reach the target
        console.log(`Adding ${targetStreamCount - currentStreamCount} download streams to reach optimal count`);
        
        for (let i = currentStreamCount; i < targetStreamCount; i++) {
            const streamIndex = i;
            const controller = new AbortController();
            const signal = controller.signal;
            
            downloadStreams[streamIndex] = {
                controller: controller,
                promise: fetch('/download', {
                    method: 'GET',
                    signal: signal,
                    cache: 'no-store',
                    headers: {
                        'Pragma': 'no-cache',
                        'Cache-Control': 'no-store',
                        'X-Priority': 'low'
                    }
                }).then(response => {
                    if (!response.ok) {
                        throw new Error(`HTTP error! Status: ${response.status}`);
                    }
                    
                    const reader = response.body.getReader();
                    
                    return readStream(reader, chunk => {
                        bytesReceived[streamIndex] += chunk.length;
                    });
                }).catch(error => {
                    if (error.name !== 'AbortError') {
                        console.error(`Download stream ${streamIndex} error:`, error);
                    }
                })
            };
        }
    } else if (currentStreamCount > targetStreamCount) {
        // Remove excess streams
        console.log(`Removing ${currentStreamCount - targetStreamCount} download streams to reach optimal count`);
        
        for (let i = targetStreamCount; i < currentStreamCount; i++) {
            if (downloadStreams[i] && downloadStreams[i].controller) {
                downloadStreams[i].controller.abort();
                downloadStreams[i] = null;
            }
        }
        
        // Clean up the array
        downloadStreams = downloadStreams.filter(s => s !== null);
    }
    
    console.log(`Download streams adjusted to optimal count: ${targetStreamCount}`);
}

/**
 * Apply optimal parameters to existing upload streams
 * @param {Object} params - The optimal parameters
 */
/**
 * Get the current count of active download and upload streams
 * @returns {Object} Object with downloadCount and uploadCount properties
 */
/**
 * Register a stream in the active stream registry
 * @param {string} type - The type of stream ('download' or 'upload')
 * @param {Object} stream - The stream object to register
 * @returns {number} The stream ID
 */
function registerStream(type, stream) {
    const streamId = ++streamIdCounter;
    stream.id = streamId;
    stream.type = type;
    stream.createdAt = Date.now();
    
    if (type === 'download') {
        activeStreamRegistry.download.set(streamId, stream);
    } else {
        activeStreamRegistry.upload.set(streamId, stream);
    }
    
    console.log(`Registered ${type} stream #${streamId}, active: ${getActiveStreamCounts().downloadCount + getActiveStreamCounts().uploadCount}`);
    
    // Emit stream lifecycle event
    emitStreamEvent('created', streamId, { type });
    
    return streamId;
}

/**
 * Emit a stream lifecycle event
 * @param {string} eventType - The type of event ('created', 'terminated', etc.)
 * @param {number} streamId - The ID of the stream
 * @param {Object} details - Additional details about the event
 */
function emitStreamEvent(eventType, streamId, details = {}) {
    window.dispatchEvent(new CustomEvent('stream:lifecycle', {
        detail: {
            type: eventType,
            streamId: streamId,
            timestamp: Date.now(),
            ...details
        }
    }));
}

/**
 * Emergency function to reset all stream tracking
 * Only used as a last resort
 */
function resetStreamRegistry() {
    console.warn("EMERGENCY: Resetting stream registry");
    activeStreamRegistry.download.clear();
    activeStreamRegistry.upload.clear();
    downloadStreams = [];
    uploadStreams = [];
    
    if (throughputTimer) {
        clearInterval(throughputTimer);
        throughputTimer = null;
    }
    
    console.log("Stream registry reset complete");
    
    // Emit reset event
    window.dispatchEvent(new CustomEvent('stream:reset', {
        detail: {
            timestamp: Date.now()
        }
    }));
}

/**
 * Get the current count of active download and upload streams
 * @returns {Object} Object with downloadCount and uploadCount properties
 */
function getActiveStreamCounts() {
    return {
        downloadCount: activeStreamRegistry.download.size,
        uploadCount: activeStreamRegistry.upload.size
    };
}

function applyOptimalUploadParams(params) {
    if (!params) {
        console.warn("Invalid optimal upload parameters: null or undefined");
        return;
    }
    
    // Validate all parameters and use defaults for invalid values
    if (!params.streamCount || isNaN(params.streamCount) || !isFinite(params.streamCount)) {
        console.warn("Invalid optimal upload streamCount:", params.streamCount);
        params.streamCount = 2; // Default to 2 streams
    }
    
    if (!params.pendingUploads || isNaN(params.pendingUploads) || !isFinite(params.pendingUploads)) {
        console.warn("Invalid optimal upload pendingUploads:", params.pendingUploads);
        params.pendingUploads = 1; // Default to 1 pending upload
    }
    
    if (!params.uploadDelay || isNaN(params.uploadDelay) || !isFinite(params.uploadDelay)) {
        console.warn("Invalid optimal upload delay:", params.uploadDelay);
        params.uploadDelay = INITIAL_UPLOAD_DELAY; // Default to initial delay
    }
    
    console.log("Applying optimal upload parameters:", params);
    
    // Adjust stream count if needed
    const currentStreamCount = uploadStreams.filter(s => s && s.active).length;
    const targetStreamCount = Math.max(1, Math.min(8, Math.floor(params.streamCount))); // Ensure it's a reasonable number
    const pendingUploads = Math.max(1, Math.min(4, Math.floor(params.pendingUploads))); // Ensure it's a reasonable number
    const uploadDelay = Math.max(0, Math.min(200, params.uploadDelay)); // Ensure it's a reasonable delay
    
    if (currentStreamCount < targetStreamCount) {
        // Add more streams to reach the target
        console.log(`Adding ${targetStreamCount - currentStreamCount} upload streams to reach optimal count`);
        
        for (let i = currentStreamCount; i < targetStreamCount; i++) {
            runUploadStream(i, uploadChunks, pendingUploads, uploadDelay);
        }
    } else if (currentStreamCount > targetStreamCount) {
        // Remove excess streams
        console.log(`Removing ${currentStreamCount - targetStreamCount} upload streams to reach optimal count`);
        
        for (let i = targetStreamCount; i < currentStreamCount; i++) {
            if (uploadStreams[i]) {
                uploadStreams[i].active = false;
                if (uploadStreams[i].controller) {
                    uploadStreams[i].controller.abort();
                }
                uploadStreams[i] = null;
            }
        }
        
        // Clean up the array
        uploadStreams = uploadStreams.filter(s => s !== null);
    }
    
    // Update parameters for existing streams
    for (let i = 0; i < targetStreamCount; i++) {
        if (uploadStreams[i]) {
            uploadStreams[i].maxPendingUploads = pendingUploads;
            uploadStreams[i].uploadDelay = uploadDelay;
        }
    }
    
    console.log(`Upload streams adjusted to optimal count: ${targetStreamCount} with pendingUploads=${pendingUploads}, delay=${uploadDelay}`);
}

export {
    startDownloadSaturation,
    startUploadSaturation,
    startBidirectionalSaturation,
    stopAllStreams,
    getDownloadThroughputData,
    getUploadThroughputData,
    getActiveStreamCounts,
    resetStreamRegistry
};