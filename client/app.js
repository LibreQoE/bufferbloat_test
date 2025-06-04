/**
 * Main Application Module
 * Coordinates all modules and runs the bufferbloat test
 */

import { createLatencyChart, resetChart, addLatencyDataPoint } from './timelineChart.js';
import {
    createThroughputChart,
    resetThroughputChart,
    updateThroughputChart,
    addDownloadThroughputDataPoint,
    addUploadThroughputDataPoint,
    addNullDownloadDataPoint,
    addNullUploadDataPoint,
    updateThroughputChartWithAllData,
    addPhaseAnnotations
} from './throughputChart.js';
import { analyzeAndDisplayResults } from './results.js';
import { initUI, startTestUI, TEST_PHASES, getCurrentPhase, getElapsedTime } from './ui.js';
import {
    initDiscovery,
    handleMeasurement,
    isDiscoveryInProgress,
    getBestParameters,
    getParameterHistory
} from './parameterDiscovery.js';
import {
    initTestStatusDisplay,
    initParameterVisualization,
    updateParameterVisualization,
    updateTestStatus,
    updateDownloadWarmupStatus,
    updateDownloadMeasurementStatus,
    updateUploadWarmupStatus,
    updateUploadMeasurementStatus,
    updateTestCompleteStatus,
    updateErrorStatus,
    updateIdleStatus,
    hideParameterVisualization
} from './testStatusDisplay.js';
import StreamManager from './streamManager.js';
import { PhaseController, PhaseBarrier } from './phaseController.js';
import throughputMonitor, {
    startThroughputMonitor,
    stopThroughputMonitor,
    resetThroughputMonitor,
    getDownloadThroughputData,
    getUploadThroughputData
} from './throughputMonitor.js';
import throughputTracker from './throughputTracker.js';
import { getAdaptiveWarmupConfig, logWithLevel } from './config.js';
import { initializeShare } from './share.js';

// Virtual Household Mode imports
import VirtualHousehold from './virtualHousehold/virtualHousehold.js';
import UIHousehold from './virtualHousehold/uiHousehold.js';

// Global variable to store the latest latency measurement
window.latestLatencyMeasurement = 0;
window.consecutiveTimeouts = 0;

// Test data storage
const testData = {
    baselineLatency: [],
    downloadDiscoveryLatency: [], // New phase for parameter discovery
    downloadLatency: [],
    uploadDiscoveryLatency: [], // New phase for parameter discovery
    uploadLatency: [],
    bidirectionalLatency: [], // Bidirectional phase latency data
    downloadThroughput: {
        discovery: [],   // Download discovery phase
        download: [],    // Download phase
        bidirectional: [] // Bidirectional phase
    },
    uploadThroughput: {
        discovery: [],   // Upload discovery phase
        upload: [],      // Upload phase
        bidirectional: [] // Bidirectional phase
    },
    // Store the discovered optimal parameters
    optimalDownloadParams: null,
    optimalUploadParams: null,
    // Store the original optimal parameters from warmup phases
    originalOptimalDownloadParams: null,
    originalOptimalUploadParams: null,
    // Store the baseline latency for parameter discovery
    baselineLatencyAvg: 0
};

// Web Worker for latency measurements
let latencyWorker = null;

// Chart instances
let latencyChart = null;
let throughputChart = null;

// Phase controller instance
const phaseController = new PhaseController();

// Virtual Household Mode instances
let virtualHousehold = null;
let uiHousehold = null;

// Current test mode
let currentMode = 'single'; // 'single' or 'household'

/**
 * Initialize the application
 */
async function init() {
    console.log('🎯 ADAPTIVE WARMUP: Legacy discovery system removed - always using adaptive warmup');
    console.log('🚀 Starting app initialization...');
    
    // Initialize optimized xoshiro data pools for better performance
    StreamManager.initializeOptimizations();
    
    // Initialize UI
    initUI();
    
    // Create charts
    latencyChart = createLatencyChart('latencyChart');
    throughputChart = createThroughputChart('throughputChart');
    
    // Initialize test status display
    initTestStatusDisplay();
    
    // Set initial idle status
    updateIdleStatus();
    
    // Initialize share functionality
    initializeShare();
    
    // Initialize Virtual Household Mode
    console.log('🏠 About to initialize Virtual Household Mode...');
    await initVirtualHouseholdMode();
    
    // Set up event listeners
    setupEventListeners();
    
    // Set up mode toggle functionality
    setupModeToggle();
    
    console.log('✅ App initialization complete');
}

/**
 * Set up event listeners
 */
function setupEventListeners() {
    // Test lifecycle events
    window.addEventListener('test:start', handleTestStart);
    window.addEventListener('test:phaseChange', handlePhaseChange);
    window.addEventListener('test:complete', handleTestComplete);
    
    // Throughput measurement events
    window.addEventListener('throughput:download', handleDownloadThroughput);
    window.addEventListener('throughput:upload', handleUploadThroughput);
    
    // Stream lifecycle events
    window.addEventListener('stream:lifecycle', handleStreamLifecycleEvent);
    window.addEventListener('stream:reset', handleStreamResetEvent);
    
    // Phase change events
    window.addEventListener('phase:change', handlePhaseControllerEvent);
    
    // Virtual Household Mode events
    setupVirtualHouseholdEventListeners();
    
    // Handle page unload
    window.addEventListener('beforeunload', cleanup);
}

/**
 * Handle phase controller events
 * @param {CustomEvent} event - The phase change event
 */
function handlePhaseControllerEvent(event) {
    const { type, phase, timestamp, elapsedTime } = event.detail;
    
    // Update UI based on phase change
    if (type === 'start') {
        // Phase has started
    } else if (type === 'end') {
        // Phase has ended
    }
}

/**
 * Handle stream lifecycle events
 * @param {CustomEvent} event - The stream lifecycle event
 */
function handleStreamLifecycleEvent(event) {
    const { type, streamId, streamType, timestamp } = event.detail;
    
    // Log to UI if in debug mode
    if (window.debugMode) {
        const debugElement = document.getElementById('streamDebug') || createStreamDebugElement();
        const entry = document.createElement('div');
        entry.textContent = `${new Date(timestamp).toLocaleTimeString()} - ${type}: Stream #${streamId} (${streamType})`;
        entry.className = `stream-event ${type}`;
        debugElement.appendChild(entry);
        
        // Limit entries
        if (debugElement.children.length > 100) {
            debugElement.removeChild(debugElement.firstChild);
        }
    }
}

/**
 * Handle stream reset events
 * @param {CustomEvent} event - The stream reset event
 */
function handleStreamResetEvent(event) {
    const { timestamp } = event.detail;
    
    // Log to UI if in debug mode
    if (window.debugMode) {
        const debugElement = document.getElementById('streamDebug') || createStreamDebugElement();
        const entry = document.createElement('div');
        entry.textContent = `${new Date(timestamp).toLocaleTimeString()} - EMERGENCY RESET`;
        entry.className = 'stream-event reset';
        entry.style.color = 'red';
        entry.style.fontWeight = 'bold';
        debugElement.appendChild(entry);
    }
}

/**
 * Create stream debug element for UI
 * @returns {HTMLElement} The created debug element
 */
function createStreamDebugElement() {
    const debugElement = document.createElement('div');
    debugElement.id = 'streamDebug';
    debugElement.className = 'stream-debug';
    debugElement.style.position = 'fixed';
    debugElement.style.bottom = '10px';
    debugElement.style.right = '10px';
    debugElement.style.width = '300px';
    debugElement.style.maxHeight = '200px';
    debugElement.style.overflow = 'auto';
    debugElement.style.backgroundColor = 'rgba(0,0,0,0.7)';
    debugElement.style.color = 'white';
    debugElement.style.padding = '5px';
    debugElement.style.fontSize = '10px';
    debugElement.style.fontFamily = 'monospace';
    debugElement.style.zIndex = '9999';
    debugElement.style.display = window.debugMode ? 'block' : 'none';
    debugElement.style.borderRadius = '5px';
    debugElement.style.boxShadow = '0 0 10px rgba(0,0,0,0.5)';
    document.body.appendChild(debugElement);
    return debugElement;
}

/**
 * Handle test start event
 */
function handleTestStart() {
    console.log('🎯 ADAPTIVE WARMUP: Test starting with forced adaptive warmup');
    
    updateTestStatus('🚀 Starting Test', 'Initializing bufferbloat test environment...');
    
    // Reset test data
    resetTestData();
    
    // Reset charts
    resetChart(latencyChart);
    resetThroughputChart(throughputChart);
    
    // Initialize phase controller
    const testStartTime = performance.now();
    phaseController.initialize(testStartTime);
    
    // Start throughput monitor
    startThroughputMonitor(testStartTime);
    
    // Start throughput tracker for adaptive warmup
    throughputTracker.startTracking();
    
    // Start the UI updates
    startTestUI();
    
    // Initialize and start the latency worker
    initLatencyWorker();
    
    // Set up parameter visualization updates
    setupParameterVisualizationUpdates();
    
    // Start with baseline phase
    phaseController.startPhase(TEST_PHASES.BASELINE);
}

/**
 * Handle phase change event
 * @param {CustomEvent} event - The phase change event
 */
async function handlePhaseChange(event) {
    const phase = event.detail.phase;
    
    // Start the phase using the phase controller
    await phaseController.startPhase(phase);
    
    // Add null values at phase boundaries to break the lines
    const elapsedTime = getElapsedTime();
    
    switch (phase) {
        case TEST_PHASES.BASELINE:
            updateTestStatus('📊 Baseline Measurement', 'Measuring baseline latency without load...');
            // Calculate average baseline latency at the end of baseline phase
            if (testData.baselineLatency.length > 0) {
                testData.baselineLatencyAvg = testData.baselineLatency.reduce((sum, val) => sum + val, 0) / testData.baselineLatency.length;
                
                // 🔧 FIX: Ensure baseline latency is finite and reasonable
                if (!isFinite(testData.baselineLatencyAvg) || testData.baselineLatencyAvg <= 0) {
                    console.warn(`🔧 Invalid baseline latency calculated: ${testData.baselineLatencyAvg}, using default 20ms`);
                    testData.baselineLatencyAvg = 20; // Default to 20ms
                }
            } else {
                // 🔧 FIX: No baseline measurements, use default
                console.warn(`🔧 No baseline latency measurements available, using default 20ms`);
                testData.baselineLatencyAvg = 20; // Default to 20ms
            }
            break;
            
        case TEST_PHASES.DOWNLOAD_WARMUP:
            updateTestStatus('🔥 Download Warmup', 'Starting download parameter discovery...');
            console.log(`Starting download parameter discovery with aggressive initial parameters`);
            
            // Ensure any previous visualization is hidden first
            hideParameterVisualization();
            
            // Force a small delay before showing the visualization to ensure DOM is ready
            setTimeout(() => {
                // Show parameter visualization for download
                console.log("Showing download parameter visualization");
                updateParameterVisualization([], 'download');
            }, 100);
            
            // Start with more aggressive parameters for download warmup
            const dlWarmupParams = { streamCount: 3 };
            console.log(`Using aggressive initial download warmup parameters: ${JSON.stringify(dlWarmupParams)}`);
            await StreamManager.startDownloadSaturation(true, 0, dlWarmupParams);
            
            // Always use adaptive warmup - legacy discovery system removed
            console.log(`🎯 FORCED ADAPTIVE: Using adaptive warmup for download (legacy system removed)`);
            
            console.log(`🔧 DEBUG: About to call initDiscovery with adaptive warmup:`, {
                direction: 'download',
                baselineLatency: testData.baselineLatencyAvg,
                useAdaptive: true
            });
            
            testData.optimalDownloadParams = await initDiscovery('download', testData.baselineLatencyAvg);
            // Save a copy of the original optimal parameters
            testData.originalOptimalDownloadParams = { ...testData.optimalDownloadParams };
            console.log(`Download parameter discovery complete. Optimal parameters:`, testData.optimalDownloadParams);
            console.log(`Saved original optimal download parameters:`, testData.originalOptimalDownloadParams);
            
            // Update visualization with final parameter history
            updateParameterVisualization(getParameterHistory(), 'download');
            break;
            
        case TEST_PHASES.DOWNLOAD:
            updateTestStatus('📏 Download Measurement', 'Measuring download performance under load...');
            console.log(`Using discovered optimal download parameters: ${JSON.stringify(testData.optimalDownloadParams)}`);
            
            // Keep download parameter visualization visible after warmup
            // (removed hideParameterVisualization call)
            
            // Add null value for download to break the line between Download Warmup and Download phases
            addNullDownloadDataPoint(throughputChart, elapsedTime);
            
            // Use optimal parameters with proper fallbacks
            let downloadParams;
            
            if (testData.originalOptimalDownloadParams) {
                // Use the original optimal parameters from warmup phase
                downloadParams = { ...testData.originalOptimalDownloadParams };
                // Add a flag to indicate this is for the download phase (not bidirectional)
                downloadParams.isDownloadPhase = true;
                console.log(`Using original optimal download parameters from warmup: ${JSON.stringify(downloadParams)}`);
            } else if (testData.optimalDownloadParams) {
                // Ensure streamCount is properly preserved with fallback
                downloadParams = {
                    streamCount: testData.optimalDownloadParams.streamCount !== undefined ?
                        testData.optimalDownloadParams.streamCount : 3,
                    pendingUploads: testData.optimalDownloadParams.pendingUploads !== undefined ?
                        testData.optimalDownloadParams.pendingUploads : 1,
                    isDownloadPhase: true // Add flag for download phase
                };
                console.log(`Using optimal download parameters with fallbacks: ${JSON.stringify(downloadParams)}`);
            } else {
                // Default fallback
                downloadParams = { streamCount: 3, pendingUploads: 1, isDownloadPhase: true };
                console.log(`No download parameters found, using defaults: ${JSON.stringify(downloadParams)}`);
            }
            
            console.log(`Download parameters being used: ${JSON.stringify(downloadParams)}`);
            
            // Store the parameters globally for later phases
            window.optimalDownloadParams = downloadParams;
            console.log(`Storing optimal download parameters globally: ${JSON.stringify(window.optimalDownloadParams)}`);
            
            // Start download with optimal parameters
            await StreamManager.startDownloadSaturation(false, 0, downloadParams);
            break;
            
        case TEST_PHASES.UPLOAD_WARMUP:
            updateTestStatus('🔥 Upload Warmup', 'Starting upload parameter discovery...');
            console.log(`Starting upload parameter discovery with adaptive warmup`);
            
            // Ensure any previous visualization is hidden first
            hideParameterVisualization();
            
            // Force a small delay before showing the visualization to ensure DOM is ready
            setTimeout(() => {
                // Show parameter visualization for upload
                console.log("Showing upload parameter visualization");
                updateParameterVisualization([], 'upload');
            }, 100);
            
            // Add null value for download to break the line
            // First add a null point at the end of the Download phase
            addNullDownloadDataPoint(throughputChart, elapsedTime);
            
            // Always use adaptive warmup - legacy discovery system removed
            console.log(`🎯 FORCED ADAPTIVE: Using adaptive warmup for upload (legacy system removed)`);
            
            console.log(`🔧 DEBUG: About to call initDiscovery with adaptive warmup:`, {
                direction: 'upload',
                baselineLatency: testData.baselineLatencyAvg,
                useAdaptive: true
            });
            
            // For adaptive warmup, run discovery first to get optimal parameters
            console.log(`🚀 Starting adaptive warmup discovery to find optimal parameters`);
            testData.optimalUploadParams = await initDiscovery('upload', testData.baselineLatencyAvg);
            
            // 🔧 FIX: Adaptive warmup discovery complete - now continue uploading with discovered parameters
            console.log(`✅ Adaptive warmup discovery complete - discovered optimal parameters: ${JSON.stringify(testData.optimalUploadParams)}`);
            
            // Get the best parameters directly from the discovery module
            const bestUploadWarmupParams = getBestParameters();
            console.log(`Direct best parameters from discovery module:`, bestUploadWarmupParams);
            
            // Use the best parameters from the discovery module if available
            if (bestUploadWarmupParams && bestUploadWarmupParams.streamCount && bestUploadWarmupParams.pendingUploads) {
                testData.optimalUploadParams = { ...bestUploadWarmupParams };
                console.log(`Using best parameters from discovery module:`, testData.optimalUploadParams);
            }
            
            // Ensure we have valid parameters before saving a copy
            if (testData.optimalUploadParams) {
                // Save a copy of the original optimal parameters
                testData.originalOptimalUploadParams = { ...testData.optimalUploadParams };
                console.log(`Upload parameter discovery complete. Optimal parameters:`, testData.optimalUploadParams);
                console.log(`Saved original optimal upload parameters:`, testData.originalOptimalUploadParams);
            } else {
                // Create default parameters if none were discovered
                testData.optimalUploadParams = { streamCount: 2, pendingUploads: 2, uploadDelay: 0 };
                testData.originalOptimalUploadParams = { ...testData.optimalUploadParams };
                console.log(`No upload parameters discovered, using defaults:`, testData.optimalUploadParams);
                console.log(`Saved default upload parameters as original:`, testData.originalOptimalUploadParams);
            }
            
            // Log the parameters in detail
            console.log(`UPLOAD WARMUP PHASE: Discovered optimal parameters:`);
            console.log(`  - Stream count: ${testData.optimalUploadParams.streamCount}`);
            console.log(`  - Pending uploads: ${testData.optimalUploadParams.pendingUploads}`);
            console.log(`  - Upload delay: ${testData.optimalUploadParams.uploadDelay || 0}`);
            
            // Update visualization with final parameter history
            updateParameterVisualization(getParameterHistory(), 'upload');
            
            // 🔧 CRITICAL FIX: Continue uploading with discovered parameters for remainder of warmup phase
            console.log(`🚀 WARMUP CONTINUATION: Starting upload streams with discovered parameters for remainder of warmup phase`);
            
            // Prepare parameters for warmup continuation
            const warmupContinuationParams = {
                streamCount: testData.optimalUploadParams.streamCount,
                pendingUploads: testData.optimalUploadParams.pendingUploads,
                uploadDelay: 0, // No delay for warmup continuation
                isWarmupContinuation: true // Flag to indicate this is warmup continuation, not discovery
            };
            
            console.log(`🚀 Starting upload warmup continuation with parameters: ${JSON.stringify(warmupContinuationParams)}`);
            
            // Start upload streams with discovered parameters for the remainder of the warmup phase
            await StreamManager.startUploadSaturation(true, 0, warmupContinuationParams);
            break;
            
        case TEST_PHASES.UPLOAD:
            updateTestStatus('📏 Upload Measurement', 'Measuring upload performance under load...');
            console.log(`Using discovered optimal upload parameters: ${JSON.stringify(testData.optimalUploadParams)}`);
            
            // Double-check with the discovery module for the best parameters
            const bestUploadParams = getBestParameters();
            console.log(`Direct best parameters from discovery module for upload phase:`, bestUploadParams);
            
            // Keep upload parameter visualization visible after warmup
            // (removed hideParameterVisualization call)
            
            // Add null value for upload to break the line between Upload Warmup and Upload phases
            addNullUploadDataPoint(throughputChart, elapsedTime);
            
            // Use default parameters if none were discovered
            let uploadParams;
            if (!testData.optimalUploadParams && !bestUploadParams) {
                // If no parameters were discovered, use moderate defaults
                uploadParams = { streamCount: 1, pendingUploads: 4, uploadDelay: 0 };
                console.log(`No upload parameters discovered, using moderate defaults: ${JSON.stringify(uploadParams)}`);
            } else {
                // Prioritize parameters from the discovery module if available
                const sourceParams = bestUploadParams || testData.optimalUploadParams;
                console.log(`Using parameters source:`, sourceParams);
                
                // Use the parameters discovered during warmup phase - create a deep copy
                uploadParams = {
                    // Use the actual values from sourceParams, not fallbacks
                    streamCount: sourceParams.streamCount !== undefined ?
                        sourceParams.streamCount : 1,
                    pendingUploads: sourceParams.pendingUploads !== undefined ?
                        sourceParams.pendingUploads : 4,
                    uploadDelay: 0 // No delay for full test
                };
                console.log(`Using discovered upload parameters: ${JSON.stringify(uploadParams)}`);
                
                // Log the parameters in detail
                console.log(`UPLOAD PHASE: Using parameters:`);
                console.log(`  - Stream count: ${uploadParams.streamCount}`);
                console.log(`  - Pending uploads: ${uploadParams.pendingUploads}`);
                console.log(`  - Upload delay: ${uploadParams.uploadDelay || 0}`);
            }
            
            console.log(`Upload parameters being used: ${JSON.stringify(uploadParams)}`);
            
            // Store a copy of the parameters for bidirectional phase
            // But don't overwrite the original optimal parameters discovered during warmup
            if (!testData.originalOptimalUploadParams) {
                if (testData.optimalUploadParams) {
                    // Save the original optimal parameters from warmup
                    testData.originalOptimalUploadParams = { ...testData.optimalUploadParams };
                    console.log(`Saved original optimal upload parameters: ${JSON.stringify(testData.originalOptimalUploadParams)}`);
                } else {
                    // Create default parameters if none were discovered
                    testData.originalOptimalUploadParams = { ...uploadParams };
                    console.log(`No original upload parameters found, using current parameters as original: ${JSON.stringify(testData.originalOptimalUploadParams)}`);
                }
            } else {
                console.log(`Using existing original optimal upload parameters: ${JSON.stringify(testData.originalOptimalUploadParams)}`);
            }
            
            // Store the parameters globally for later phases
            window.optimalUploadParams = uploadParams;
            console.log(`Storing optimal upload parameters globally: ${JSON.stringify(window.optimalUploadParams)}`);
            
            // Start upload with optimal parameters
            await StreamManager.startUploadSaturation(false, 0, uploadParams);
            break;
            
        case TEST_PHASES.BIDIRECTIONAL:
            updateTestStatus('🔄 Bidirectional Test', 'Testing download and upload simultaneously...');
            console.log(`Using discovered optimal parameters for bidirectional test`);
            
            // Double-check with the discovery module for the best parameters
            const bestBiParams = getBestParameters();
            console.log(`Direct best parameters from discovery module for bidirectional phase:`, bestBiParams);
            
            // Add null values to break the lines
            // This will create a clean break between Upload and Bidirectional phases
            addNullUploadDataPoint(throughputChart, elapsedTime);
            
            // Also add a null download data point to ensure a clean break for download data
            addNullDownloadDataPoint(throughputChart, elapsedTime);
            
            // Prioritize testData over global variables to ensure we use the parameters from warmup phases
            let biDlParams, biUlParams;
            
            // For download parameters - prioritize original optimal parameters from warmup
            if (testData.originalOptimalDownloadParams) {
                // Use the original optimal parameters from warmup phase WITHOUT MODIFICATION
                biDlParams = { ...testData.originalOptimalDownloadParams };
                
                // Only set isDownloadPhase to false for bidirectional phase
                biDlParams.isDownloadPhase = false;
                console.log(`Using exact optimal download parameters from warmup for bidirectional test: ${JSON.stringify(biDlParams)}`);
            } else if (testData.optimalDownloadParams) {
                // Fall back to current optimalDownloadParams if original not available
                biDlParams = { ...testData.optimalDownloadParams };
                
                biDlParams.addDelay = false;
                biDlParams.isDownloadPhase = false;
                console.log(`Using testData download parameters for bidirectional test: ${JSON.stringify(biDlParams)}`);
            } else if (window.optimalDownloadParams) {
                biDlParams = { ...window.optimalDownloadParams };
                
                biDlParams.addDelay = false;
                biDlParams.isDownloadPhase = false;
                console.log(`Using global download parameters for bidirectional test: ${JSON.stringify(biDlParams)}`);
            } else {
                // Default fallback
                biDlParams = {
                    streamCount: 3,
                    pendingUploads: 1,
                    addDelay: false,
                    isDownloadPhase: false
                };
                console.log(`No download parameters found, using defaults for bidirectional test: ${JSON.stringify(biDlParams)}`);
            }
            
            // For upload parameters - prioritize best parameters from discovery module
            if (bestBiParams && bestBiParams.streamCount && bestBiParams.pendingUploads) {
                // Use the best parameters from the discovery module WITHOUT MODIFICATION
                biUlParams = { ...bestBiParams };
                console.log(`Using exact best parameters from discovery module for bidirectional test: ${JSON.stringify(biUlParams)}`);
                
                // Ensure we have valid values for required parameters
                if (biUlParams.streamCount === undefined || biUlParams.pendingUploads === undefined) {
                    console.log(`Best parameters missing required fields, adding defaults`);
                    biUlParams.streamCount = biUlParams.streamCount || 1;
                    biUlParams.pendingUploads = biUlParams.pendingUploads || 4;
                    biUlParams.uploadDelay = biUlParams.uploadDelay || 0;
                    console.log(`Updated upload parameters: ${JSON.stringify(biUlParams)}`);
                }
            } else if (testData.originalOptimalUploadParams) {
                // Use the original optimal parameters from warmup phase WITHOUT MODIFICATION
                biUlParams = { ...testData.originalOptimalUploadParams };
                // Keep all original properties including uploadDelay
                console.log(`Using exact original optimal upload parameters from warmup for bidirectional test: ${JSON.stringify(biUlParams)}`);
                
                // Ensure we have valid values for required parameters
                if (biUlParams.streamCount === undefined || biUlParams.pendingUploads === undefined) {
                    console.log(`Original upload parameters missing required fields, adding defaults`);
                    biUlParams.streamCount = biUlParams.streamCount || 1;
                    biUlParams.pendingUploads = biUlParams.pendingUploads || 4;
                    biUlParams.uploadDelay = biUlParams.uploadDelay || 0;
                    console.log(`Updated upload parameters: ${JSON.stringify(biUlParams)}`);
                }
            } else if (testData.optimalUploadParams) {
                // Fall back to current optimalUploadParams if original not available
                biUlParams = {
                    streamCount: testData.optimalUploadParams.streamCount !== undefined ?
                        testData.optimalUploadParams.streamCount : 1,
                    pendingUploads: testData.optimalUploadParams.pendingUploads !== undefined ?
                        testData.optimalUploadParams.pendingUploads : 4,
                    uploadDelay: 0 // No delay for bidirectional test
                };
                console.log(`Using testData upload parameters for bidirectional test: ${JSON.stringify(biUlParams)}`);
            } else if (window.optimalUploadParams) {
                biUlParams = { ...window.optimalUploadParams };
                console.log(`Using global upload parameters for bidirectional test: ${JSON.stringify(biUlParams)}`);
            } else {
                // Default fallback
                biUlParams = { streamCount: 1, pendingUploads: 4, uploadDelay: 0 };
                console.log(`No upload parameters found, using defaults for bidirectional test: ${JSON.stringify(biUlParams)}`);
            }
            
            console.log(`Download parameters: ${JSON.stringify(biDlParams)}`);
            console.log(`Upload parameters: ${JSON.stringify(biUlParams)}`);
            
            // Log the parameters in detail
            console.log(`BIDIRECTIONAL PHASE: Using parameters:`);
            console.log(`  - Download stream count: ${biDlParams.streamCount}`);
            console.log(`  - Download pending uploads: ${biDlParams.pendingUploads}`);
            console.log(`  - Upload stream count: ${biUlParams.streamCount}`);
            console.log(`  - Upload pending uploads: ${biUlParams.pendingUploads}`);
            console.log(`  - Upload delay: ${biUlParams.uploadDelay || 0}`);
            
            // Compare with original parameters - compare only the core properties
            console.log(`Are these the same as the original optimal parameters? (core properties only)`);
            
            // Extract core properties for comparison
            const extractCoreDownloadParams = (params) => {
                if (!params) return null;
                return {
                    streamCount: params.streamCount,
                    pendingUploads: params.pendingUploads
                };
            };
            
            const extractCoreUploadParams = (params) => {
                if (!params) return null;
                return {
                    streamCount: params.streamCount,
                    pendingUploads: params.pendingUploads,
                    uploadDelay: params.uploadDelay || 0
                };
            };
            
            // For download parameters
            const biDlParamsCore = extractCoreDownloadParams(biDlParams);
            const originalDlParamsCore = extractCoreDownloadParams(testData.originalOptimalDownloadParams);
            
            const dlParamsMatch = originalDlParamsCore ?
                JSON.stringify(biDlParamsCore) === JSON.stringify(originalDlParamsCore) : false;
                
            console.log(`  - Download (core properties): ${dlParamsMatch}`);
            if (!dlParamsMatch) {
                console.log(`  - Download params differences (core properties):`);
                console.log(`    - Original core: ${JSON.stringify(originalDlParamsCore)}`);
                console.log(`    - Used core: ${JSON.stringify(biDlParamsCore)}`);
                console.log(`    - Original full: ${JSON.stringify(testData.originalOptimalDownloadParams)}`);
                console.log(`    - Used full: ${JSON.stringify(biDlParams)}`);
            }
            
            // For upload parameters
            // If originalOptimalUploadParams is null, initialize it with current parameters
            if (!testData.originalOptimalUploadParams) {
                testData.originalOptimalUploadParams = { ...biUlParams };
                console.log(`Original optimal upload parameters were null, initializing with current parameters: ${JSON.stringify(testData.originalOptimalUploadParams)}`);
            }
            
            const biUlParamsCore = extractCoreUploadParams(biUlParams);
            const originalUlParamsCore = extractCoreUploadParams(testData.originalOptimalUploadParams);
            
            const ulParamsMatch = originalUlParamsCore ?
                JSON.stringify(biUlParamsCore) === JSON.stringify(originalUlParamsCore) : false;
                
            console.log(`  - Upload (core properties): ${ulParamsMatch}`);
            if (!ulParamsMatch) {
                console.log(`  - Upload params differences (core properties):`);
                console.log(`    - Original core: ${JSON.stringify(originalUlParamsCore)}`);
                console.log(`    - Used core: ${JSON.stringify(biUlParamsCore)}`);
                console.log(`    - Original full: ${JSON.stringify(testData.originalOptimalUploadParams)}`);
                console.log(`    - Used full: ${JSON.stringify(biUlParams)}`);
            }
            
            // Log the exact parameters being passed to the bidirectional saturation function
            console.log(`BIDIRECTIONAL PHASE: Passing parameters to StreamManager.startBidirectionalSaturation:`);
            console.log(`  - Download parameters: ${JSON.stringify(biDlParams)}`);
            console.log(`  - Upload parameters: ${JSON.stringify(biUlParams)}`);
            console.log(`  - Global window.optimalDownloadParams: ${JSON.stringify(window.optimalDownloadParams)}`);
            console.log(`  - Global window.optimalUploadParams: ${JSON.stringify(window.optimalUploadParams)}`);
            console.log(`  - testData.originalOptimalDownloadParams: ${JSON.stringify(testData.originalOptimalDownloadParams)}`);
            console.log(`  - testData.originalOptimalUploadParams: ${JSON.stringify(testData.originalOptimalUploadParams)}`);
            
            await StreamManager.startBidirectionalSaturation(
                0, // No fixed throughput
                0, // No fixed throughput
                biDlParams,
                biUlParams
            );
            break;
    }
}

/**
 * Handle test complete event
 */
async function handleTestComplete() {
    console.log('Test complete - initiating comprehensive cleanup');
    updateTestStatus('🎉 Test Complete', 'Cleaning up resources and analyzing results...');
    
    // CRITICAL: Stop all streams FIRST before any other cleanup
    console.log('🛑 MANDATORY: Terminating all active streams');
    await StreamManager.terminateAllStreams();
    
    // Verify streams are actually terminated
    const remainingStreams = StreamManager.getActiveStreamCounts();
    if (remainingStreams.total > 0) {
        console.warn(`⚠️ WARNING: ${remainingStreams.total} streams still active after termination attempt`);
        // Force emergency cleanup
        await StreamManager.emergencyCleanup();
    }
    
    // End current phase
    await phaseController.endPhase();
    
    // Stop the latency worker
    if (latencyWorker) {
        latencyWorker.postMessage({ command: 'stop' });
        latencyWorker.terminate();
        latencyWorker = null;
    }
    
    // Stop throughput monitor
    stopThroughputMonitor();
    
    // Stop throughput tracker
    throughputTracker.stopTracking();
    
    // Get phase transitions from phase controller
    const phaseHistory = phaseController.getPhaseHistory();
    const phaseTransitions = phaseHistory.map((phase, index) => {
        if (index === 0) return null;
        
        const previousPhase = phaseHistory[index - 1];
        return {
            time: (phase.startTime - phaseController.testStartTime) / 1000,
            fromPhase: previousPhase.phase,
            toPhase: phase.phase
        };
    }).filter(Boolean);
    
    // Add phase annotations to the chart without redrawing the entire chart
    // This preserves the nice-looking chart from during the test
    addPhaseAnnotations(throughputChart, phaseTransitions);
    
    // Get throughput data for analysis (but don't redraw the chart)
    const downloadData = getDownloadThroughputData();
    const uploadData = getUploadThroughputData();
    
    // Extract phase-specific data for analysis
    testData.downloadThroughput.download = downloadData
        .filter(point => point.phase === TEST_PHASES.DOWNLOAD && !point.isOutOfPhase)
        .map(point => point.value);
        
    testData.uploadThroughput.upload = uploadData
        .filter(point => point.phase === TEST_PHASES.UPLOAD && !point.isOutOfPhase)
        .map(point => point.value);
        
    testData.downloadThroughput.bidirectional = downloadData
        .filter(point => point.phase === TEST_PHASES.BIDIRECTIONAL && !point.isOutOfPhase)
        .map(point => point.value);
        
    testData.uploadThroughput.bidirectional = uploadData
        .filter(point => point.phase === TEST_PHASES.BIDIRECTIONAL && !point.isOutOfPhase)
        .map(point => point.value);
    
    // Log data for debugging
    console.log('Download throughput data (download phase):', testData.downloadThroughput.download);
    console.log('Upload throughput data (upload phase):', testData.uploadThroughput.upload);
    console.log('Download throughput data (bidirectional phase):', testData.downloadThroughput.bidirectional);
    console.log('Upload throughput data (bidirectional phase):', testData.uploadThroughput.bidirectional);
    
    // Analyze and display results
    analyzeAndDisplayResults(testData);
}

/**
 * Set up periodic updates for parameter visualization during discovery
 */
function setupParameterVisualizationUpdates() {
    console.log("Setting up parameter visualization updates");
    
    // Update visualization more frequently (every 300ms) during discovery
    const updateInterval = setInterval(() => {
        const currentPhase = getCurrentPhase();
        const history = getParameterHistory();
        
        if (currentPhase === TEST_PHASES.DOWNLOAD_WARMUP) {
            logWithLevel('DEBUG', "Updating download parameter visualization");
            updateParameterVisualization(history, 'download');
        } else if (currentPhase === TEST_PHASES.UPLOAD_WARMUP) {
            logWithLevel('DEBUG', "Updating upload parameter visualization");
            updateParameterVisualization(history, 'upload');
        }
    }, 300);
    
    // Set up phase change listener to ensure visualization is shown/hidden appropriately
    window.addEventListener('test:phaseChange', (event) => {
        const phase = event.detail.phase;
        
        if (phase === TEST_PHASES.DOWNLOAD_WARMUP) {
            // Ensure visualization is shown at the start of download warmup
            setTimeout(() => {
                console.log("Phase change to download warmup - showing visualization");
                updateParameterVisualization(getParameterHistory(), 'download');
            }, 100);
        } else if (phase === TEST_PHASES.UPLOAD_WARMUP) {
            // Ensure visualization is shown at the start of upload warmup
            setTimeout(() => {
                console.log("Phase change to upload warmup - showing visualization");
                updateParameterVisualization(getParameterHistory(), 'upload');
            }, 100);
        } else if (phase === TEST_PHASES.DOWNLOAD) {
            // Keep download visualization visible when moving to download saturation phase
            console.log("Phase change to download saturation phase - keeping download visualization visible");
            // (removed hideParameterVisualization call)
        } else if (phase === TEST_PHASES.UPLOAD) {
            // Keep upload visualization visible when moving to upload saturation phase
            console.log("Phase change to upload saturation phase - keeping upload visualization visible");
            // (removed hideParameterVisualization call)
        }
    });
    
    // Clear interval on test complete
    window.addEventListener('test:complete', () => {
        console.log("Test complete - cleaning up visualization updates");
        clearInterval(updateInterval);
        // Keep visualizations visible after test completes
        // (removed hideParameterVisualization call)
    }, { once: true });
}

/**
 * Handle download throughput event
 * @param {CustomEvent} event - The throughput event
 */
function handleDownloadThroughput(event) {
    const throughput = event.detail.throughput;
    const smoothedThroughput = event.detail.smoothedThroughput;
    const elapsedTime = event.detail.time;
    const phase = event.detail.phase;
    const isOutOfPhase = event.detail.isOutOfPhase;
    
    // Store throughput data by phase
    if (phase === TEST_PHASES.DOWNLOAD_WARMUP) {
        testData.downloadThroughput.discovery.push(throughput);
        
        // If parameter discovery is in progress, send measurement
        if (isDiscoveryInProgress()) {
            // Get latest latency measurement
            let latency = testData.downloadDiscoveryLatency.length > 0 ?
                testData.downloadDiscoveryLatency[testData.downloadDiscoveryLatency.length - 1] :
                testData.baselineLatencyAvg;
                
            // 🔧 FIX: Ensure latency is finite and reasonable
            if (!isFinite(latency) || latency <= 0) {
                console.warn(`🔧 Invalid download latency detected: ${latency}, using baseline average: ${testData.baselineLatencyAvg}`);
                latency = testData.baselineLatencyAvg || 20; // Fallback to 20ms
            }
                
            // 🔧 FIX: Ensure throughput is finite and reasonable
            if (!isFinite(throughput) || throughput < 0) {
                console.warn(`🔧 Invalid download throughput detected: ${throughput}, skipping measurement`);
                return; // Skip this measurement
            }
            
            // Send measurement to parameter discovery module
            handleMeasurement({
                throughput: throughput,
                latency: latency
            });
        }
    } else if (phase === TEST_PHASES.DOWNLOAD) {
        testData.downloadThroughput.download.push(throughput);
        // Update status with current throughput
        updateDownloadMeasurementStatus({ currentThroughput: smoothedThroughput });
    } else if (phase === TEST_PHASES.BIDIRECTIONAL) {
        testData.downloadThroughput.bidirectional.push(throughput);
        // Update status for bidirectional test
        updateTestStatus('🔄 Bidirectional Test', `Download: ${smoothedThroughput.toFixed(1)} Mbps`);
    }
    
    // Add data point to throughput chart for all phases except baseline
    if (phase !== TEST_PHASES.BASELINE) {
        addDownloadThroughputDataPoint(throughputChart, elapsedTime, throughput, isOutOfPhase);
    }
}

/**
 * Handle upload throughput event
 * @param {CustomEvent} event - The throughput event
 */
function handleUploadThroughput(event) {
    const throughput = event.detail.throughput;
    const smoothedThroughput = event.detail.smoothedThroughput;
    const elapsedTime = event.detail.time;
    const phase = event.detail.phase;
    const isOutOfPhase = event.detail.isOutOfPhase;
    
    // Store throughput data by phase
    if (phase === TEST_PHASES.UPLOAD_WARMUP) {
        testData.uploadThroughput.discovery.push(throughput);
        
        // If parameter discovery is in progress, send measurement
        if (isDiscoveryInProgress()) {
            // Get latest latency measurement
            let latency = testData.uploadDiscoveryLatency.length > 0 ?
                testData.uploadDiscoveryLatency[testData.uploadDiscoveryLatency.length - 1] :
                testData.baselineLatencyAvg;
                
            // 🔧 FIX: Ensure latency is finite and reasonable
            if (!isFinite(latency) || latency <= 0) {
                console.warn(`🔧 Invalid upload latency detected: ${latency}, using baseline average: ${testData.baselineLatencyAvg}`);
                latency = testData.baselineLatencyAvg || 20; // Fallback to 20ms
            }
                
            // 🔧 FIX: Ensure throughput is finite and reasonable
            if (!isFinite(throughput) || throughput < 0) {
                console.warn(`🔧 Invalid upload throughput detected: ${throughput}, skipping measurement`);
                return; // Skip this measurement
            }
            
            // Send measurement to parameter discovery module
            handleMeasurement({
                throughput: throughput,
                latency: latency
            });
        }
    } else if (phase === TEST_PHASES.UPLOAD) {
        testData.uploadThroughput.upload.push(throughput);
        // Update status with current throughput
        updateUploadMeasurementStatus({ currentThroughput: smoothedThroughput });
    } else if (phase === TEST_PHASES.BIDIRECTIONAL) {
        testData.uploadThroughput.bidirectional.push(throughput);
        // Update status for bidirectional test
        updateTestStatus('🔄 Bidirectional Test', `Upload: ${smoothedThroughput.toFixed(1)} Mbps`);
    }
    
    // Add data point to throughput chart for all phases except baseline and download phases
    if (phase !== TEST_PHASES.BASELINE &&
        phase !== TEST_PHASES.DOWNLOAD_WARMUP &&
        phase !== TEST_PHASES.DOWNLOAD) {
        addUploadThroughputDataPoint(throughputChart, elapsedTime, throughput, isOutOfPhase);
    }
}

/**
 * Initialize the latency worker
 */
function initLatencyWorker() {
    // Create the worker
    latencyWorker = new Worker('latencyWorker.js');
    
    // Set up message handler
    latencyWorker.onmessage = handleLatencyWorkerMessage;
    
    // Start the worker
    latencyWorker.postMessage({ command: 'start' });
}

/**
 * Handle messages from the latency worker
 * @param {MessageEvent} event - The message event
 */
function handleLatencyWorkerMessage(event) {
    const data = event.data;
    
    switch (data.type) {
        case 'latency':
            // Process only real latency measurements (no artificial timeout data)
            processLatencyMeasurement(data.rtt, false);
            break;
        case 'timeout':
            // Log timeout but don't add artificial data to measurements
            console.warn(`Latency measurement timeout: ${data.message} (consecutive: ${data.consecutiveTimeouts})`);
            break;
        case 'error':
            console.error('Latency worker error:', data.error);
            break;
        case 'status':
            console.log('Latency worker status:', data.status);
            break;
    }
}

/**
 * Process a latency measurement
 * @param {number} latency - The measured latency in ms
 * @param {boolean} isTimeout - Whether the measurement timed out
 */
function processLatencyMeasurement(latency, isTimeout = false) {
    const currentPhase = getCurrentPhase();
    const elapsedTime = getElapsedTime();
    
    // Store latency based on current phase
    switch (currentPhase) {
        case TEST_PHASES.BASELINE:
            testData.baselineLatency.push(latency);
            break;
        case TEST_PHASES.DOWNLOAD_WARMUP:
            testData.downloadDiscoveryLatency.push(latency);
            break;
        case TEST_PHASES.DOWNLOAD:
            testData.downloadLatency.push(latency);
            break;
        case TEST_PHASES.UPLOAD_WARMUP:
            testData.uploadDiscoveryLatency.push(latency);
            break;
        case TEST_PHASES.UPLOAD:
            testData.uploadLatency.push(latency);
            break;
        case TEST_PHASES.BIDIRECTIONAL:
            testData.bidirectionalLatency.push(latency);
            break;
    }
    
    // Store the latest latency measurement in the global variable
    // This is used by the saturation.js file to adapt pacing
    window.latestLatencyMeasurement = latency;
    
    // Track consecutive timeouts with AGGRESSIVE backoff for asymmetric connections
    if (isTimeout) {
        window.consecutiveTimeouts++;
        console.log(`Consecutive timeouts: ${window.consecutiveTimeouts}`);
        
        // Handle timeouts more moderately for high-speed connections
        if (currentPhase === TEST_PHASES.UPLOAD_WARMUP) {
            // For upload warmup, be much more tolerant - back off after 10 timeouts for high-speed connections
            if (window.consecutiveTimeouts >= 10) {
                console.log(`🚨 MODERATE TIMEOUT BACKOFF: ${window.consecutiveTimeouts} consecutive timeouts during upload warmup, applying gentle backoff`);
                
                // Apply gentle parameter backoff for upload
                window.dispatchEvent(new CustomEvent('upload:force_backoff', {
                    detail: {
                        backoffFactor: 0.85, // Gentle 15% backoff instead of 25%
                        forceStreamReduction: false, // Don't force stream reduction immediately
                        reason: 'timeout_backoff'
                    }
                }));
                
                // Reset counter to prevent continuous backoffs
                window.consecutiveTimeouts = 0;
            }
        } else if (currentPhase === TEST_PHASES.DOWNLOAD_WARMUP) {
            // For download warmup, be more tolerant - back off after 5 timeouts
            if (window.consecutiveTimeouts >= 5) {
                console.log(`🚨 TIMEOUT BACKOFF: ${window.consecutiveTimeouts} consecutive timeouts during download warmup, forcing parameter backoff`);
                // Force a parameter backoff for download
                window.dispatchEvent(new CustomEvent('download:force_backoff', {
                    detail: { backoffFactor: 0.75 } // 75% backoff for download (less aggressive)
                }));
                
                // Reset counter
                window.consecutiveTimeouts = 0;
            }
        } else {
            // For other phases, use original logic but more aggressive
            if (window.consecutiveTimeouts >= 4) {
                console.log(`🚨 GENERAL TIMEOUT BACKOFF: ${window.consecutiveTimeouts} consecutive timeouts during ${currentPhase}, forcing backoff`);
                
                // Dispatch generic backoff event
                window.dispatchEvent(new CustomEvent('timeout:backoff', {
                    detail: {
                        phase: currentPhase,
                        consecutiveTimeouts: window.consecutiveTimeouts,
                        backoffFactor: 0.7
                    }
                }));
                
                // Reset counter
                window.consecutiveTimeouts = 0;
            }
        }
    } else {
        // Reset consecutive timeouts counter on successful measurement
        window.consecutiveTimeouts = 0;
    }
    
    // Add data point to chart with timeout indicator
    addLatencyDataPoint(latencyChart, elapsedTime, latency, isTimeout);
    
    // Dispatch latency measurement event for adaptive upload streams
    window.dispatchEvent(new CustomEvent('latency:measurement', {
        detail: {
            latency: latency,
            phase: currentPhase,
            time: elapsedTime,
            isTimeout: isTimeout,
            consecutiveTimeouts: window.consecutiveTimeouts
        }
    }));
}

/**
 * Reset test data
 */
function resetTestData() {
    // Reset global latency variables
    window.latestLatencyMeasurement = 0;
    window.consecutiveTimeouts = 0;
    
    testData.baselineLatency = [];
    testData.downloadDiscoveryLatency = [];
    testData.downloadLatency = [];
    testData.uploadDiscoveryLatency = [];
    testData.uploadLatency = [];
    testData.bidirectionalLatency = [];
    testData.downloadThroughput = {
        discovery: [],
        download: [],
        bidirectional: []
    };
    testData.uploadThroughput = {
        discovery: [],
        upload: [],
        bidirectional: []
    };
    // Initialize with null values
    testData.optimalDownloadParams = null;
    testData.optimalUploadParams = null;
    testData.originalOptimalDownloadParams = null;
    testData.originalOptimalUploadParams = null;
    testData.baselineLatencyAvg = 0;
    
    // Clear global parameters
    window.optimalDownloadParams = null;
    window.optimalUploadParams = null;
    
    console.log('Test data reset complete');
}

/**
 * Clean up resources
 */
function cleanup() {
    console.log("Page unloading, cleaning up resources");
    
    // Stop the latency worker
    if (latencyWorker) {
        latencyWorker.terminate();
        latencyWorker = null;
    }
    
    // Stop throughput monitor
    stopThroughputMonitor();
    
    // Stop throughput tracker
    throughputTracker.stopTracking();
    
    // Stop all streams
    StreamManager.terminateAllStreams();
    
    // Clean up Virtual Household Mode
    if (virtualHousehold) {
        virtualHousehold.destroy();
        virtualHousehold = null;
    }
    
    if (uiHousehold) {
        uiHousehold.destroy();
        uiHousehold = null;
    }
}

/**
 * Initialize Virtual Household Mode
 */
async function initVirtualHouseholdMode() {
    console.log('🏠 Initializing Virtual Household Mode');
    
    try {
        // Initialize Virtual Household controller
        console.log('🔧 Creating VirtualHousehold instance...');
        virtualHousehold = new VirtualHousehold();
        console.log('✅ VirtualHousehold instance created');
        
        // Initialize the VirtualHousehold instance properly
        console.log('🔧 Initializing VirtualHousehold instance...');
        await virtualHousehold.init();
        console.log('✅ VirtualHousehold instance fully initialized');
        
        // Initialize Virtual Household UI
        console.log('🔧 Creating UIHousehold instance...');
        console.log('🔍 DEBUG: Passing fully initialized virtualHousehold instance to UIHousehold constructor:', virtualHousehold);
        uiHousehold = new UIHousehold(virtualHousehold);
        console.log('✅ UIHousehold instance created with fully initialized VirtualHousehold parameter');
        
        console.log('✅ Virtual Household Mode initialized successfully');
    } catch (error) {
        console.error('❌ Failed to initialize Virtual Household Mode:', error);
        console.error('❌ Error details:', error.stack);
    }
}

/**
 * Set up mode toggle functionality
 */
function setupModeToggle() {
    const singleUserMode = document.getElementById('singleUserMode');
    const householdMode = document.getElementById('householdMode');
    const testContainer = document.querySelector('.test-container');
    const householdContainer = document.getElementById('householdContainer');
    const headerDescription = document.getElementById('headerDescription');
    
    if (!singleUserMode || !householdMode || !testContainer || !householdContainer) {
        console.warn('⚠️ Mode toggle elements not found');
        return;
    }
    
    // Set initial state
    updateModeDisplay();
    
    // Single User Mode click handler
    singleUserMode.addEventListener('click', () => {
        if (currentMode !== 'single') {
            switchToSingleUserMode();
        }
    });
    
    // Household Mode click handler
    householdMode.addEventListener('click', () => {
        if (currentMode !== 'household') {
            switchToHouseholdMode();
        }
    });
    
    console.log('✅ Mode toggle functionality set up');
}

/**
 * Switch to Single User Test mode
 */
function switchToSingleUserMode() {
    console.log('👤 Switching to Single User Test mode');
    
    currentMode = 'single';
    
    // Stop any running household test
    if (virtualHousehold && virtualHousehold.isActive) {
        virtualHousehold.stop();
    }
    
    // Hide household UI
    if (uiHousehold) {
        uiHousehold.hide();
    }
    
    // Update display
    updateModeDisplay();
    
    console.log('✅ Switched to Single User Test mode');
}

/**
 * Switch to Virtual Household Mode
 */
function switchToHouseholdMode() {
    console.log('🏠 Switching to Virtual Household Mode');
    
    currentMode = 'household';
    
    // Stop any running single user test
    if (latencyWorker) {
        latencyWorker.postMessage({ command: 'stop' });
    }
    
    // Stop throughput monitoring
    stopThroughputMonitor();
    
    // Stop all streams
    StreamManager.terminateAllStreams();
    
    // Show household UI
    if (uiHousehold) {
        uiHousehold.show();
    }
    
    // Update display
    updateModeDisplay();
    
    console.log('✅ Switched to Virtual Household Mode');
}

/**
 * Update mode display based on current mode
 */
function updateModeDisplay() {
    const singleUserMode = document.getElementById('singleUserMode');
    const householdMode = document.getElementById('householdMode');
    const testContainer = document.querySelector('.test-container');
    const householdContainer = document.getElementById('householdContainer');
    const headerDescription = document.getElementById('headerDescription');
    
    if (!singleUserMode || !householdMode || !testContainer || !householdContainer) {
        return;
    }
    
    if (currentMode === 'single') {
        // Update mode toggle appearance
        singleUserMode.classList.add('active');
        householdMode.classList.remove('active');
        
        // Show/hide containers
        testContainer.style.display = 'block';
        householdContainer.classList.add('hidden');
        
        // Update header description
        if (headerDescription) {
            headerDescription.textContent = "Measure your connection's latency under load";
        }
        
        // No body class needed - using same container width
        
    } else if (currentMode === 'household') {
        // Update mode toggle appearance
        singleUserMode.classList.remove('active');
        householdMode.classList.add('active');
        
        // Show/hide containers
        testContainer.style.display = 'none';
        householdContainer.classList.remove('hidden');
        
        // Update header description
        if (headerDescription) {
            headerDescription.textContent = "Simulate realistic multi-user home internet conditions";
        }
        
        // No body class needed - using same container width as Single User Test
    }
}

/**
 * Handle Virtual Household test events
 */
function setupVirtualHouseholdEventListeners() {
    // Listen for UI events to start/stop household tests
    window.addEventListener('ui-start-household-test', () => {
        if (virtualHousehold && currentMode === 'household') {
            virtualHousehold.startTest();
        }
    });
    
    // Stop test functionality removed
}

// Initialize the application when the DOM is ready
document.addEventListener('DOMContentLoaded', init);