/**
 * Test Status Display Module
 * Displays real-time text descriptions of what the system is doing during all phases of the bufferbloat test
 */

/**
 * Create test status container
 * @returns {HTMLElement} The status container
 */
function createStatusContainer() {
    // Create main container
    const container = document.createElement('div');
    container.id = 'testStatusDisplay';
    container.className = 'test-status';
    container.style.width = '100%';
    container.style.display = 'block';
    container.style.marginBottom = '20px';
    container.style.padding = '20px';
    container.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
    container.style.borderRadius = '8px';
    
    // Create status display
    const statusDisplay = document.createElement('div');
    statusDisplay.id = 'statusDisplay';
    statusDisplay.className = 'status-display';
    statusDisplay.style.textAlign = 'center';
    statusDisplay.style.color = 'white';
    statusDisplay.style.fontSize = '16px';
    statusDisplay.style.lineHeight = '1.5';
    
    // Create main status text
    const mainStatus = document.createElement('div');
    mainStatus.id = 'mainStatus';
    mainStatus.className = 'main-status';
    mainStatus.style.fontSize = '18px';
    mainStatus.style.fontWeight = 'bold';
    mainStatus.style.marginBottom = '10px';
    mainStatus.textContent = 'Initializing bufferbloat test...';
    statusDisplay.appendChild(mainStatus);
    
    // Create detailed status text
    const detailStatus = document.createElement('div');
    detailStatus.id = 'detailStatus';
    detailStatus.className = 'detail-status';
    detailStatus.style.fontSize = '14px';
    detailStatus.style.opacity = '0.8';
    detailStatus.textContent = 'Preparing to analyze your internet connection';
    statusDisplay.appendChild(detailStatus);
    
    container.appendChild(statusDisplay);
    
    return container;
}

/**
 * Initialize test status display
 */
export function initTestStatusDisplay() {
    // Create container if it doesn't exist
    let container = document.getElementById('testStatusDisplay');
    if (!container) {
        container = createStatusContainer();
        
        // Insert after throughput chart container and before results container
        const throughputChartContainer = document.querySelector('.throughput-chart-container');
        const resultsContainer = document.getElementById('results');
        
        if (throughputChartContainer && throughputChartContainer.parentNode) {
            // Insert after throughput chart
            throughputChartContainer.parentNode.insertBefore(container, resultsContainer);
        } else {
            // Fallback to appending to test container
            const testContainer = document.querySelector('.test-container');
            if (testContainer) {
                testContainer.appendChild(container);
            }
        }
    }
    
    // Add CSS styles
    addStatusStyles();
}

/**
 * Add status display styles
 */
function addStatusStyles() {
    // Check if styles already exist
    if (document.getElementById('testStatusStyles')) return;
    
    const styleEl = document.createElement('style');
    styleEl.id = 'testStatusStyles';
    styleEl.textContent = `
        .test-status {
            margin: 15px 0 25px 0;
            overflow: hidden;
            background-color: rgba(255, 255, 255, 0.05);
            border-radius: 8px;
            padding: 20px;
        }
        
        .status-display {
            text-align: center;
            color: white;
            font-size: 16px;
            line-height: 1.5;
        }
        
        .main-status {
            font-size: 18px;
            font-weight: bold;
            margin-bottom: 10px;
            color: #6b9bd1;
        }
        
        .detail-status {
            font-size: 14px;
            opacity: 0.8;
            color: #ffffff;
        }
    `;
    document.head.appendChild(styleEl);
}

/**
 * Update status for any phase of the test
 * @param {string} message - Main status message
 * @param {string} detail - Detailed status message
 */
export function updateTestStatus(message, detail = '') {
    const mainStatus = document.getElementById('mainStatus');
    const detailStatus = document.getElementById('detailStatus');
    
    if (!mainStatus || !detailStatus) return;
    
    mainStatus.textContent = message;
    detailStatus.textContent = detail;
}

/**
 * Update status for test initialization
 */
export function updateInitializationStatus() {
    updateTestStatus(
        '🚀 Initializing Test',
        'Setting up bufferbloat test environment...'
    );
}

/**
 * Update status for download warmup phase
 * @param {Object} progress - Progress information
 */
export function updateDownloadWarmupStatus(progress = {}) {
    if (progress.timeRemaining) {
        updateTestStatus(
            '🔥 Download Warmup',
            `Warming up download connection - ${progress.timeRemaining}s remaining...`
        );
    } else if (progress.currentThroughput) {
        updateTestStatus(
            '🔥 Download Warmup',
            `Current throughput: ${progress.currentThroughput.toFixed(1)} Mbps`
        );
    } else {
        updateTestStatus(
            '🔥 Download Warmup',
            'Warming up download connection to reach stable performance...'
        );
    }
}

/**
 * Update status for download measurement phase
 * @param {Object} progress - Progress information
 */
export function updateDownloadMeasurementStatus(progress = {}) {
    if (progress.currentThroughput && progress.currentLatency) {
        updateTestStatus(
            '📏 Download Measurement',
            `Throughput: ${progress.currentThroughput.toFixed(1)} Mbps | Latency: ${progress.currentLatency.toFixed(1)} ms`
        );
    } else if (progress.currentThroughput) {
        updateTestStatus(
            '📏 Download Measurement',
            `Measuring download performance - Current: ${progress.currentThroughput.toFixed(1)} Mbps`
        );
    } else {
        updateTestStatus(
            '📏 Download Measurement',
            'Measuring download throughput and latency under load...'
        );
    }
}

/**
 * Update status for upload warmup phase
 * @param {Object} progress - Progress information
 */
export function updateUploadWarmupStatus(progress = {}) {
    if (progress.timeRemaining) {
        updateTestStatus(
            '🔥 Upload Warmup',
            `Warming up upload connection - ${progress.timeRemaining}s remaining...`
        );
    } else if (progress.currentThroughput) {
        updateTestStatus(
            '🔥 Upload Warmup',
            `Current throughput: ${progress.currentThroughput.toFixed(1)} Mbps`
        );
    } else {
        updateTestStatus(
            '🔥 Upload Warmup',
            'Warming up upload connection to reach stable performance...'
        );
    }
}

/**
 * Update status for upload measurement phase
 * @param {Object} progress - Progress information
 */
export function updateUploadMeasurementStatus(progress = {}) {
    if (progress.currentThroughput && progress.currentLatency) {
        updateTestStatus(
            '📏 Upload Measurement',
            `Throughput: ${progress.currentThroughput.toFixed(1)} Mbps | Latency: ${progress.currentLatency.toFixed(1)} ms`
        );
    } else if (progress.currentThroughput) {
        updateTestStatus(
            '📏 Upload Measurement',
            `Measuring upload performance - Current: ${progress.currentThroughput.toFixed(1)} Mbps`
        );
    } else {
        updateTestStatus(
            '📏 Upload Measurement',
            'Measuring upload throughput and latency under load...'
        );
    }
}

/**
 * Update status for adaptive warmup speed estimation
 * @param {string} type - Type of test ('download' or 'upload')
 * @param {Object} details - Additional details about current progress
 */
export function updateSpeedEstimationStatus(type, details = {}) {
    const direction = type === 'download' ? 'Download' : 'Upload';
    
    if (details.stage === 1) {
        updateTestStatus(
            `📊 ${direction} Speed Estimation`,
            'Stage 1: Quick speed probe to estimate connection capacity...'
        );
    } else if (details.stage === 2) {
        updateTestStatus(
            `📊 ${direction} Speed Estimation`,
            `Stage 2: Precision test (${details.estimatedSpeed ? details.estimatedSpeed.toFixed(1) + ' Mbps detected' : 'measuring...'})`
        );
    } else {
        updateTestStatus(
            `📊 ${direction} Speed Estimation`,
            'Measuring connection speed to determine optimal parameters...'
        );
    }
}

/**
 * Update status for parameter optimization
 * @param {string} type - Type of test ('download' or 'upload')
 * @param {Object} details - Additional details about current progress
 */
export function updateParameterOptimizationStatus(type, details = {}) {
    const direction = type === 'download' ? 'Download' : 'Upload';
    
    if (details.trial && details.totalTrials) {
        updateTestStatus(
            `⚙️ ${direction} Parameter Optimization`,
            `Trial ${details.trial}/${details.totalTrials}: Testing ${details.config ? (details.config.pendingUploads ? `${details.config.streamCount} streams, ${details.config.pendingUploads} pending` : `${details.config.streamCount} streams`) : 'configuration'}...`
        );
    } else if (details.speedTier) {
        updateTestStatus(
            `⚙️ ${direction} Parameter Optimization`,
            `Optimizing for ${details.speedTier} tier connection (${details.estimatedSpeed ? details.estimatedSpeed.toFixed(1) + ' Mbps' : ''})`
        );
    } else {
        updateTestStatus(
            `⚙️ ${direction} Parameter Optimization`,
            'Finding the best parameters for your connection type...'
        );
    }
}

/**
 * Update status for asymmetric connection detection
 * @param {Object} details - Connection details
 */
export function updateAsymmetricDetectionStatus(details = {}) {
    updateTestStatus(
        '🔍 Asymmetric Connection Analysis',
        `Detected ${details.downloadSpeed?.toFixed(1) || 'N/A'} Mbps down / ${details.uploadSpeed?.toFixed(1) || 'N/A'} Mbps up - Using conservative settings`
    );
}

/**
 * Update status for optimization completion
 * @param {string} type - Type of test ('download' or 'upload')
 * @param {Object} details - Final configuration details
 */
export function updateOptimizationCompleteStatus(type, details = {}) {
    const direction = type === 'download' ? 'Download' : 'Upload';
    updateTestStatus(
        `✅ ${direction} Optimization Complete`,
        `Found optimal settings: ${details.finalConfig ? (details.finalConfig.pendingUploads ? `${details.finalConfig.streamCount} streams, ${details.finalConfig.pendingUploads} pending uploads` : `${details.finalConfig.streamCount} streams`) : 'parameters configured'}`
    );
}

/**
 * Update status for test completion
 * @param {Object} results - Test results
 */
export function updateTestCompleteStatus(results = {}) {
    if (results.downloadThroughput && results.uploadThroughput) {
        updateTestStatus(
            '🎉 Test Complete',
            `Download: ${results.downloadThroughput.toFixed(1)} Mbps | Upload: ${results.uploadThroughput.toFixed(1)} Mbps`
        );
    } else {
        updateTestStatus(
            '🎉 Test Complete',
            'Bufferbloat test finished - Check results below'
        );
    }
}

/**
 * Update status for error conditions
 * @param {string} error - Error message
 */
export function updateErrorStatus(error) {
    updateTestStatus(
        '❌ Test Error',
        error || 'An error occurred during the test'
    );
}

/**
 * Update status for idle/waiting state
 */
export function updateIdleStatus() {
    updateTestStatus(
        '⏳ Ready to Test',
        'Click "Start Test" to begin bufferbloat analysis'
    );
}

// Legacy compatibility functions
export function updateParameterVisualization(parameterHistory, type) {
    // Convert to new status format
    if (parameterHistory && parameterHistory.length > 0) {
        const latest = parameterHistory[parameterHistory.length - 1];
        const trialCount = parameterHistory.length;
        
        updateParameterOptimizationStatus(type, {
            trial: trialCount,
            totalTrials: 10, // Default max
            config: latest.parameters
        });
    } else {
        updateSpeedEstimationStatus(type);
    }
}

export function updateAdaptiveWarmupStatus(phase, type, details = {}) {
    if (phase === 'speed_estimation') {
        updateSpeedEstimationStatus(type, details);
    } else if (phase === 'parameter_optimization') {
        updateParameterOptimizationStatus(type, details);
    } else if (phase === 'asymmetric_detection') {
        updateAsymmetricDetectionStatus(details);
    } else if (phase === 'complete') {
        updateOptimizationCompleteStatus(type, details);
    }
}

export function hideParameterVisualization(type = null) {
    // No-op for compatibility
    return;
}

// Alias for backward compatibility
export const initParameterVisualization = initTestStatusDisplay;

export default {
    initTestStatusDisplay,
    initParameterVisualization,
    updateTestStatus,
    updateInitializationStatus,
    updateDownloadWarmupStatus,
    updateDownloadMeasurementStatus,
    updateUploadWarmupStatus,
    updateUploadMeasurementStatus,
    updateSpeedEstimationStatus,
    updateParameterOptimizationStatus,
    updateAsymmetricDetectionStatus,
    updateOptimizationCompleteStatus,
    updateTestCompleteStatus,
    updateErrorStatus,
    updateIdleStatus,
    updateParameterVisualization,
    updateAdaptiveWarmupStatus,
    hideParameterVisualization
};