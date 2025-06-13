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
import SimpleWarmup from './simpleWarmup.js';
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
import { telemetryManager } from './telemetry.js';
import { serverDiscovery } from './discovery.js';

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
    
    // Set initial mode CSS class for strict results separation
    document.body.classList.add('single-user-mode');
    document.body.classList.remove('virtual-household-mode');
    
    // Initialize optimized xoshiro data pools for better performance
    StreamManager.initializeOptimizations();
    
    // Initialize UI
    initUI();
    
    // 🔧 STREAM DEBUG OVERLAY FIX: Hide any existing stream debug overlay on initialization
    const existingDebugElement = document.getElementById('streamDebug');
    if (existingDebugElement) {
        existingDebugElement.style.display = 'none';
        console.log('🔧 Hidden existing stream debug overlay');
    }
    
    // Disable debug mode to prevent stream overlay from appearing
    window.debugMode = false;
    
    // Create charts
    latencyChart = createLatencyChart('latencyChart');
    throughputChart = createThroughputChart('throughputChart');
    
    // Initialize test status display
    initTestStatusDisplay();
    
    // Set initial idle status
    updateIdleStatus();
    
    // Initialize share functionality
    initializeShare();
    
    // Initialize telemetry UI
    telemetryManager.insertUI();
    
    // Discover optimal test server
    try {
        await serverDiscovery.discoverServer();
        console.log('✅ Server discovery completed');
    } catch (error) {
        console.error('❌ Server discovery failed, some features may not work:', error);
    }
    
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
    
    // 🔧 STREAM DEBUG OVERLAY DISABLED: Commenting out debug overlay to prevent UI blocking
    // The stream debug overlay was blocking the Download Logs button
    /*
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
    */
    
    // Hide any existing stream debug overlay
    const existingDebugElement = document.getElementById('streamDebug');
    if (existingDebugElement) {
        existingDebugElement.style.display = 'none';
    }
}

/**
 * Handle stream reset events
 * @param {CustomEvent} event - The stream reset event
 */
function handleStreamResetEvent(event) {
    const { timestamp } = event.detail;
    
    // 🔧 STREAM DEBUG OVERLAY DISABLED: Commenting out debug overlay to prevent UI blocking
    /*
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
    */
    
    // Hide any existing stream debug overlay
    const existingDebugElement = document.getElementById('streamDebug');
    if (existingDebugElement) {
        existingDebugElement.style.display = 'none';
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
    
    // Initialize and start the latency worker (after token should be available)
    initLatencyWorker();
    
    // Simple warmup - no complex parameter visualization needed
    
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
            updateTestStatus('🔥 Download Warmup', 'Smoothly saturating download with 3 fixed streams...');
            console.log(`Starting simple download warmup with 3 fixed TCP streams`);
            
            // Hide complex parameter visualization
            hideParameterVisualization();
            
            // Run simple download warmup
            const downloadWarmup = new SimpleWarmup('download', testData.baselineLatencyAvg, 10);
            testData.optimalDownloadParams = await downloadWarmup.run();
            
            // Add a small delay to ensure all cleanup operations complete
            await new Promise(resolve => setTimeout(resolve, 200));
            
            // Save a copy of the original optimal parameters
            testData.originalOptimalDownloadParams = { ...testData.optimalDownloadParams };
            console.log(`Simple download warmup complete. Optimal parameters:`, testData.optimalDownloadParams);
            console.log(`Peak throughput: ${testData.optimalDownloadParams.peakThroughput?.toFixed(2) || 0} Mbps`);
            
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
            updateTestStatus('🔥 Upload Warmup', 'Smoothly saturating upload with 3 fixed streams...');
            console.log(`Starting simple upload warmup with 3 fixed TCP streams`);
            
            // Hide complex parameter visualization
            hideParameterVisualization();
            
            // Add null value for download to break the line
            addNullDownloadDataPoint(throughputChart, elapsedTime);
            
            // Run simple upload warmup
            const uploadWarmup = new SimpleWarmup('upload', testData.baselineLatencyAvg, 13);
            testData.optimalUploadParams = await uploadWarmup.run();
            
            // Add a longer delay to ensure all cleanup operations complete and parameters are properly set
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Explicit verification that parameters were set
            if (!testData.optimalUploadParams) {
                console.warn('⚠️ Race condition detected: Upload parameters still null after warmup');
                // Wait a bit more and check again
                await new Promise(resolve => setTimeout(resolve, 500));
                if (!testData.optimalUploadParams) {
                    console.error('❌ Upload warmup failed to set parameters, will use defaults');
                }
            }
            
            // Log the final parameters for debugging
            console.log(`🔧 FINAL CHECK: Upload parameters after warmup:`, testData.optimalUploadParams);
            
            // Ensure we have valid parameters
            if (testData.optimalUploadParams) {
                // Save a copy of the original optimal parameters
                testData.originalOptimalUploadParams = { ...testData.optimalUploadParams };
                console.log(`Simple upload warmup complete. Optimal parameters:`, testData.optimalUploadParams);
                console.log(`Peak throughput: ${testData.optimalUploadParams.peakThroughput?.toFixed(2) || 0} Mbps`);
            } else {
                // Create default parameters if warmup failed
                testData.optimalUploadParams = { streamCount: 3, pendingUploads: 4, uploadDelay: 0, chunkSize: 256 * 1024 };
                testData.originalOptimalUploadParams = { ...testData.optimalUploadParams };
                console.log(`Upload warmup failed, using defaults:`, testData.optimalUploadParams);
            }
            
            break;
            
        case TEST_PHASES.UPLOAD:
            updateTestStatus('📏 Upload Measurement', 'Measuring upload performance under load...');
            
            // Wait for warmup parameters to be available (with timeout)
            let waitAttempts = 0;
            const maxWaitAttempts = 20; // Wait up to 2 seconds (20 * 100ms)
            while (!testData.optimalUploadParams && waitAttempts < maxWaitAttempts) {
                console.log(`⏳ Waiting for upload warmup parameters... (attempt ${waitAttempts + 1})`);
                await new Promise(resolve => setTimeout(resolve, 100));
                waitAttempts++;
            }
            
            console.log(`Using discovered optimal upload parameters: ${JSON.stringify(testData.optimalUploadParams)}`);
            
            // Add null value for upload to break the line between Upload Warmup and Upload phases
            addNullUploadDataPoint(throughputChart, elapsedTime);
            
            // Use the parameters discovered during simple warmup
            let uploadParams;
            if (testData.optimalUploadParams) {
                uploadParams = {
                    streamCount: testData.optimalUploadParams.streamCount || 3,
                    pendingUploads: testData.optimalUploadParams.pendingUploads || 4,
                    chunkSize: testData.optimalUploadParams.chunkSize || 256 * 1024,
                    uploadDelay: 0 // No delay for full test
                };
                console.log(`Using simple warmup parameters: ${JSON.stringify(uploadParams)}`);
            } else {
                // Fallback if warmup failed
                uploadParams = { streamCount: 3, pendingUploads: 4, uploadDelay: 0, chunkSize: 256 * 1024 };
                console.log(`No upload parameters from warmup, using defaults: ${JSON.stringify(uploadParams)}`);
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
            
            // Use parameters from simple warmup phases
            
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
            
            // For upload parameters - use simple warmup results
            if (testData.originalOptimalUploadParams) {
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
                        testData.optimalUploadParams.streamCount : 3,
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
                biUlParams = { streamCount: 3, pendingUploads: 4, uploadDelay: 0 };
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
    await analyzeAndDisplayResults(testData);
}

// Removed complex parameter visualization - using simple warmup instead

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
    const isSpeedEstimation = event.detail.isSpeedEstimation;
    
    // Store throughput data by phase
    if (phase === TEST_PHASES.DOWNLOAD_WARMUP) {
        testData.downloadThroughput.discovery.push(throughput);
        
        // Simple warmup - no complex parameter discovery needed
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
    const isSpeedEstimation = event.detail.isSpeedEstimation;
    
    // Store throughput data by phase
    if (phase === TEST_PHASES.UPLOAD_WARMUP) {
        testData.uploadThroughput.discovery.push(throughput);
        
        // Simple warmup - no complex parameter discovery needed
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
    // Exception: Include upload warmup if it's speed estimation phase
    if (phase !== TEST_PHASES.BASELINE &&
        phase !== TEST_PHASES.DOWNLOAD_WARMUP &&
        phase !== TEST_PHASES.DOWNLOAD) {
        addUploadThroughputDataPoint(throughputChart, elapsedTime, throughput, isOutOfPhase);
    } else if (phase === TEST_PHASES.UPLOAD_WARMUP && isSpeedEstimation) {
        // Plot speed estimation phase for upload warmup
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
    
    // Send discovered server info to worker
    if (serverDiscovery.currentServer) {
        latencyWorker.postMessage({
            command: 'setAuth',
            serverUrl: serverDiscovery.currentServer.url
        });
    }
    
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
            // Log timeout and treat as high latency measurement for accurate scoring
            console.warn(`Latency measurement timeout: ${data.message} (consecutive: ${data.consecutiveTimeouts})`);
            // For bufferbloat testing, timeouts indicate severe congestion and should be treated as very high latency
            // Use 1000ms as timeout latency value (represents severe bufferbloat)
            processLatencyMeasurement(1000, true);
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
        } else if (currentPhase === TEST_PHASES.BIDIRECTIONAL) {
            // For bidirectional phase, DO NOT adjust parameters at all
            // The bidirectional phase should use the optimal parameters discovered during warmup
            // and maintain them throughout, regardless of timeouts
            if (window.consecutiveTimeouts >= 15) {
                console.log(`📊 BIDIRECTIONAL: ${window.consecutiveTimeouts} consecutive timeouts detected, but maintaining optimal parameters (no backoff)`);
                // Reset counter to prevent excessive logging, but don't dispatch backoff events
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
    
    // Check if essential mode toggle elements exist
    if (!singleUserMode || !householdMode) {
        console.error('❌ Mode toggle buttons not found - this is critical');
        return;
    }
    
    // Warn about missing containers but continue with toggle setup
    if (!testContainer) {
        console.warn('⚠️ Single User test container not found');
    }
    if (!householdContainer) {
        console.warn('⚠️ Virtual Household container not found');
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
    
    // Token system removed
    
    // Hide household UI
    if (uiHousehold) {
        uiHousehold.hide();
    }
    
    // Hide Virtual Household results when switching to Single User mode
    const householdResults = document.getElementById('householdResults');
    if (householdResults) {
        householdResults.classList.add('hidden');
    }
    
    // Single User results container should remain as-is to preserve any existing results
    const singleUserResults = document.getElementById('results');
    if (singleUserResults) {
        // Only hide it initially, don't clear the content
        singleUserResults.classList.add('hidden');
    }
    
    // Update display
    updateModeDisplay();
    
    console.log('✅ Switched to Single User Test mode and preserved existing results');
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
    
    // Token system removed
    
    // Hide Single User results when switching to Virtual Household mode
    const singleUserResults = document.getElementById('results');
    if (singleUserResults) {
        singleUserResults.classList.add('hidden');
    }
    
    // Virtual Household results container should remain as-is to preserve any existing results
    const householdResults = document.getElementById('householdResults');
    if (householdResults) {
        // Only hide it initially, don't clear the content
        householdResults.classList.add('hidden');
    }
    
    // Show household UI
    if (uiHousehold) {
        uiHousehold.show();
    }
    
    // Update display
    updateModeDisplay();
    
    console.log('✅ Switched to Virtual Household Mode and preserved existing results');
}

/**
 * Check if a results container has valid results (not just placeholder content)
 * @param {HTMLElement} container - The results container to check
 * @returns {boolean} True if the container has valid results
 */
function hasValidResults(container) {
    if (!container || !container.innerHTML.trim()) {
        return false;
    }
    
    // Check for signs of actual test results vs placeholder content
    const hasGradeValues = container.querySelector('.total-grade') && 
                          container.querySelector('.total-grade').textContent.trim() !== '';
    
    const hasStats = container.querySelector('.stats-table tbody tr') && 
                     !container.innerHTML.includes('<!-- Filled by JavaScript -->');
    
    const hasUserResults = container.querySelector('.user-result-grade') && 
                          container.querySelector('.user-result-grade').textContent.trim() !== '';
    
    // Return true if we have either Single User results or Virtual Household results
    return hasGradeValues || hasStats || hasUserResults;
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
    
    // Get results containers
    const singleUserResults = document.getElementById('results');
    const householdResults = document.getElementById('householdResults');
    
    // Check if essential mode toggle elements exist
    if (!singleUserMode || !householdMode) {
        console.error('❌ Mode toggle buttons not found in updateModeDisplay()');
        return;
    }
    
    if (currentMode === 'single') {
        // Apply mode-aware CSS classes for strict separation
        document.body.classList.add('single-user-mode');
        document.body.classList.remove('virtual-household-mode');
        
        // Update mode toggle appearance
        singleUserMode.classList.add('active');
        householdMode.classList.remove('active');
        
        // Show/hide containers (check if they exist)
        if (testContainer) {
            testContainer.style.display = 'block';
        }
        if (householdContainer) {
            householdContainer.classList.add('hidden');
        }
        
        // Always hide Single User results in Single User mode - they will be shown by results.js when test completes
        if (singleUserResults) {
            singleUserResults.classList.add('hidden');
            singleUserResults.style.display = 'none';
        }
        // Virtual Household results will be hidden by CSS mode classes
        if (householdResults) {
            householdResults.classList.add('hidden');
        }
        
        // Update header description
        if (headerDescription) {
            headerDescription.textContent = "Measure your connection's latency under load";
        }
        
    } else if (currentMode === 'household') {
        // Apply mode-aware CSS classes for strict separation
        document.body.classList.add('virtual-household-mode');
        document.body.classList.remove('single-user-mode');
        
        // Update mode toggle appearance
        singleUserMode.classList.remove('active');
        householdMode.classList.add('active');
        
        // Show/hide containers (check if they exist)
        if (testContainer) {
            testContainer.style.display = 'none';
        }
        if (householdContainer) {
            householdContainer.classList.remove('hidden');
        }
        
        // Always hide Virtual Household results in Virtual Household mode - they will be shown by uiHousehold.js when test completes
        if (householdResults) {
            householdResults.classList.add('hidden');
            householdResults.style.display = 'none';
        }
        // Single User results will be hidden by CSS mode classes
        if (singleUserResults) {
            singleUserResults.classList.add('hidden');
        }
        
        // Update header description
        if (headerDescription) {
            headerDescription.textContent = "Simulate realistic multi-user home internet conditions";
        }
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
