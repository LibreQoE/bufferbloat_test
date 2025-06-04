/**
 * UI Module
 * Handles user interface interactions and updates
 */

import { logWithLevel } from './config.js';

// Test phases
const TEST_PHASES = {
    IDLE: 'idle',
    BASELINE: 'baseline',
    DOWNLOAD_WARMUP: 'download_warmup',
    DOWNLOAD: 'download',
    UPLOAD_WARMUP: 'upload_warmup',
    UPLOAD: 'upload',
    BIDIRECTIONAL: 'bidirectional',
    COMPLETE: 'complete'
};

// Phase durations in seconds
const PHASE_DURATIONS = {
    [TEST_PHASES.BASELINE]: 4,           // Reduced from 5s to 4s
    [TEST_PHASES.DOWNLOAD_WARMUP]: 7,    // Reduced from 13s to 7s (-6s)
    [TEST_PHASES.DOWNLOAD]: 12,          // Increased from 10s to 12s (+2s)
    [TEST_PHASES.UPLOAD_WARMUP]: 13,     // Reduced from 20s to 13s
    [TEST_PHASES.UPLOAD]: 12,            // Increased from 10s to 12s (+2s)
    [TEST_PHASES.BIDIRECTIONAL]: 12      // Increased from 10s to 12s (+2s)
};

// Total test duration in seconds
const TOTAL_TEST_DURATION = 60;

// UI elements
let startButton;
let progressBar;
let currentPhaseElement;
let stepElements;
let debugModeToggle;

// State
let currentPhase = TEST_PHASES.IDLE;
let testStartTime = 0;
let progressTimer = null;

// Initialize debug mode to false
window.debugMode = false;

/**
 * Initialize the UI
 */
function initUI() {
    // Get UI elements
    startButton = document.getElementById('startTest');
    progressBar = document.querySelector('.progress-fill');
    currentPhaseElement = document.getElementById('currentPhase');
    
    // Get all step elements
    stepElements = {
        [TEST_PHASES.BASELINE]: document.querySelector('.step.baseline'),
        [TEST_PHASES.DOWNLOAD_WARMUP]: document.querySelector('.step.download_warmup'),
        [TEST_PHASES.DOWNLOAD]: document.querySelector('.step.download'),
        [TEST_PHASES.UPLOAD_WARMUP]: document.querySelector('.step.upload_warmup'),
        [TEST_PHASES.UPLOAD]: document.querySelector('.step.upload'),
        [TEST_PHASES.BIDIRECTIONAL]: document.querySelector('.step.bidirectional')
    };
    
    // Add event listener to start button
    if (startButton) {
        startButton.addEventListener('click', onStartButtonClick);
    }
    
    // Create and add debug mode toggle
    createDebugModeToggle();
}

/**
 * Create and add debug mode toggle to the UI
 */
function createDebugModeToggle() {
    // Create container
    const container = document.createElement('div');
    container.className = 'debug-toggle-container';
    container.style.position = 'fixed';
    container.style.bottom = '10px';
    container.style.left = '10px';
    container.style.zIndex = '9999';
    container.style.backgroundColor = 'rgba(0,0,0,0.7)';
    container.style.padding = '5px';
    container.style.borderRadius = '5px';
    container.style.color = 'white';
    container.style.fontFamily = 'monospace';
    container.style.fontSize = '12px';
    
    // Create checkbox
    debugModeToggle = document.createElement('input');
    debugModeToggle.type = 'checkbox';
    debugModeToggle.id = 'debugModeToggle';
    debugModeToggle.checked = window.debugMode;
    
    // Create label
    const label = document.createElement('label');
    label.htmlFor = 'debugModeToggle';
    label.textContent = 'Debug';
    label.style.marginLeft = '5px';
    
    // Add event listener
    debugModeToggle.addEventListener('change', function() {
        window.debugMode = this.checked;
        console.log(`Debug mode ${window.debugMode ? 'enabled' : 'disabled'}`);
        
        // Show/hide debug elements
        const debugElement = document.getElementById('streamDebug');
        if (debugElement) {
            debugElement.style.display = window.debugMode ? 'block' : 'none';
        }
        
        // Show/hide Enhanced Logger controls instead of old console logger
        const enhancedLoggingControls = document.getElementById('enhancedLoggingControls');
        if (enhancedLoggingControls) {
            enhancedLoggingControls.style.display = window.debugMode ? 'block' : 'none';
            console.log(`Enhanced Logger controls ${window.debugMode ? 'shown' : 'hidden'}`);
        }
        
        // Hide old console logger panel if it exists
        const consoleLoggerPanel = document.getElementById('console-logger-panel');
        if (consoleLoggerPanel) {
            consoleLoggerPanel.style.display = 'none';
        }
    });
    
    // Assemble and add to document
    container.appendChild(debugModeToggle);
    container.appendChild(label);
    document.body.appendChild(container);
}


/**
 * Handle start button click
 */
function onStartButtonClick() {
    // Disable the button during the test
    startButton.disabled = true;
    
    // Hide any previous results
    document.getElementById('results').classList.add('hidden');
    
    // Notify that the test is starting
    const startEvent = new CustomEvent('test:start');
    window.dispatchEvent(startEvent);
}

/**
 * Start the test UI updates
 */
function startTestUI() {
    // Reset state
    testStartTime = performance.now();
    currentPhase = TEST_PHASES.BASELINE;
    
    console.log(`🔧 TEST STARTING: Setting currentPhase to ${currentPhase} at time ${testStartTime}`);
    
    // Reset all steps
    resetStepperUI();
    
    // Start progress updates
    progressTimer = setInterval(updateProgress, 100);
    
    // Update UI for baseline phase
    updatePhaseUI(TEST_PHASES.BASELINE);
    
    console.log(`🔧 TEST UI INITIALIZED: currentPhase=${currentPhase}, progressTimer started`);
}

/**
 * Update the test progress
 */
function updateProgress() {
    const elapsedSeconds = (performance.now() - testStartTime) / 1000;
    const progressPercent = Math.min(100, (elapsedSeconds / TOTAL_TEST_DURATION) * 100);
    
    // Update progress bar
    progressBar.style.width = `${progressPercent}%`;
    
    // Check if we need to transition to the next phase
    checkPhaseTransition(elapsedSeconds);
    
    // Check if the test is complete
    if (elapsedSeconds >= TOTAL_TEST_DURATION) {
        completeTest();
    }
}

/**
 * Check if we need to transition to the next test phase
 * @param {number} elapsedSeconds - Elapsed time in seconds
 */
function checkPhaseTransition(elapsedSeconds) {
    // Calculate phase transition points (start times for each phase) - OPTIMIZED TIMELINE
    const baselineEnd = PHASE_DURATIONS[TEST_PHASES.BASELINE];                    // 4s
    const downloadWarmupEnd = baselineEnd + PHASE_DURATIONS[TEST_PHASES.DOWNLOAD_WARMUP]; // 11s
    const downloadEnd = downloadWarmupEnd + PHASE_DURATIONS[TEST_PHASES.DOWNLOAD];         // 23s
    const uploadWarmupStart = downloadEnd;                                                 // 23s ← Upload warmup starts when download ends
    const uploadWarmupEnd = uploadWarmupStart + PHASE_DURATIONS[TEST_PHASES.UPLOAD_WARMUP]; // 36s
    const uploadStart = uploadWarmupEnd;                                                   // 36s ← Upload starts when upload warmup ends
    const uploadEnd = uploadStart + PHASE_DURATIONS[TEST_PHASES.UPLOAD];                  // 48s
    
    // Only log phase boundaries once per second to reduce spam
    // Reduce phase check logging frequency - only log every 5 seconds
    if (Math.floor(elapsedSeconds) % 5 === 0 && Math.floor(elapsedSeconds) !== Math.floor(elapsedSeconds - 0.1)) {
        logWithLevel('DEBUG', `🔧 Phase check: ${elapsedSeconds.toFixed(1)}s, current=${currentPhase}`);
    }
    
    // Check for phase transitions - only log actual transitions
    if (currentPhase === TEST_PHASES.BASELINE && elapsedSeconds >= baselineEnd) {
        console.log(`🔧 TRANSITION: ${currentPhase} -> ${TEST_PHASES.DOWNLOAD_WARMUP} at ${elapsedSeconds.toFixed(1)}s`);
        currentPhase = TEST_PHASES.DOWNLOAD_WARMUP;
        updatePhaseUI(TEST_PHASES.DOWNLOAD_WARMUP);
        notifyPhaseChange(TEST_PHASES.DOWNLOAD_WARMUP);
    } else if (currentPhase === TEST_PHASES.DOWNLOAD_WARMUP && elapsedSeconds >= downloadWarmupEnd) {
        console.log(`🔧 TRANSITION: ${currentPhase} -> ${TEST_PHASES.DOWNLOAD} at ${elapsedSeconds.toFixed(1)}s`);
        currentPhase = TEST_PHASES.DOWNLOAD;
        updatePhaseUI(TEST_PHASES.DOWNLOAD);
        notifyPhaseChange(TEST_PHASES.DOWNLOAD);
    } else if (currentPhase === TEST_PHASES.DOWNLOAD && elapsedSeconds >= uploadWarmupStart) {
        console.log(`🔧 TRANSITION: ${currentPhase} -> ${TEST_PHASES.UPLOAD_WARMUP} at ${elapsedSeconds.toFixed(1)}s`);
        console.log(`🔧 UPLOAD WARMUP STARTING - This should trigger adaptive warmup!`);
        currentPhase = TEST_PHASES.UPLOAD_WARMUP;
        updatePhaseUI(TEST_PHASES.UPLOAD_WARMUP);
        notifyPhaseChange(TEST_PHASES.UPLOAD_WARMUP);
    } else if (currentPhase === TEST_PHASES.UPLOAD_WARMUP && elapsedSeconds >= uploadStart) {
        console.log(`🔧 TRANSITION: ${currentPhase} -> ${TEST_PHASES.UPLOAD} at ${elapsedSeconds.toFixed(1)}s`);
        currentPhase = TEST_PHASES.UPLOAD;
        updatePhaseUI(TEST_PHASES.UPLOAD);
        notifyPhaseChange(TEST_PHASES.UPLOAD);
    } else if (currentPhase === TEST_PHASES.UPLOAD && elapsedSeconds >= uploadEnd) {
        console.log(`🔧 TRANSITION: ${currentPhase} -> ${TEST_PHASES.BIDIRECTIONAL} at ${elapsedSeconds.toFixed(1)}s`);
        currentPhase = TEST_PHASES.BIDIRECTIONAL;
        updatePhaseUI(TEST_PHASES.BIDIRECTIONAL);
        notifyPhaseChange(TEST_PHASES.BIDIRECTIONAL);
    }
    
    // Critical boundary checks - only log at key moments (OPTIMIZED TIMELINE)
    if (elapsedSeconds >= 10.9 && elapsedSeconds <= 11.1) {
        console.log(`🔧 11s CHECK: phase=${currentPhase}, should transition to download at 11s`);
    }
    if (elapsedSeconds >= 22.9 && elapsedSeconds <= 23.1) {
        console.log(`🔧 23s CHECK: phase=${currentPhase}, should transition to upload_warmup at 23s`);
    }
    if (elapsedSeconds >= 35.9 && elapsedSeconds <= 36.1) {
        console.log(`🔧 36s CHECK: phase=${currentPhase}, should transition to upload at 36s`);
    }
    if (elapsedSeconds >= 47.9 && elapsedSeconds <= 48.1) {
        console.log(`🔧 48s CHECK: phase=${currentPhase}, should transition to bidirectional at 48s`);
    }
}

/**
 * Update the UI for a new phase
 * @param {string} phase - The new phase
 */
function updatePhaseUI(phase) {
    // Get previous phase for animation
    const phases = Object.values(TEST_PHASES);
    const currentPhaseIndex = phases.indexOf(currentPhase);
    const previousPhase = currentPhaseIndex > 0 ? phases[currentPhaseIndex - 1] : null;
    
    // Update stepper UI
    updateStepperUI(phase, previousPhase);
    
    // Update current phase text
    switch (phase) {
        case TEST_PHASES.BASELINE:
            currentPhaseElement.textContent = 'Measuring baseline latency...';
            break;
        case TEST_PHASES.DOWNLOAD_WARMUP:
            currentPhaseElement.textContent = 'Warming up download...';
            break;
        case TEST_PHASES.DOWNLOAD:
            currentPhaseElement.textContent = 'Testing download saturation...';
            break;
        case TEST_PHASES.UPLOAD_WARMUP:
            currentPhaseElement.textContent = 'Warming up upload...';
            break;
        case TEST_PHASES.UPLOAD:
            currentPhaseElement.textContent = 'Testing upload saturation...';
            break;
        case TEST_PHASES.BIDIRECTIONAL:
            currentPhaseElement.textContent = 'Testing bidirectional saturation...';
            break;
        case TEST_PHASES.COMPLETE:
            currentPhaseElement.textContent = 'Test complete!';
            break;
        default:
            currentPhaseElement.textContent = 'Ready to start';
    }
}

/**
 * Notify that the phase has changed
 * @param {string} phase - The new phase
 */
function notifyPhaseChange(phase) {
    console.log(`🔧 PHASE CHANGE: ${phase}`);
    const event = new CustomEvent('test:phaseChange', { detail: { phase } });
    window.dispatchEvent(event);
}

/**
 * Complete the test
 */
function completeTest() {
    // Stop progress updates
    if (progressTimer) {
        clearInterval(progressTimer);
        progressTimer = null;
    }
    
    // Update UI
    currentPhase = TEST_PHASES.COMPLETE;
    updatePhaseUI(TEST_PHASES.COMPLETE);
    progressBar.style.width = '100%';
    startButton.disabled = false;
    
    // Notify that the test is complete
    const completeEvent = new CustomEvent('test:complete');
    window.dispatchEvent(completeEvent);
}

/**
 * Get the current test phase
 * @returns {string} The current phase
 */
function getCurrentPhase() {
    return currentPhase;
}

/**
 * Get the elapsed time since the test started
 * @returns {number} Elapsed time in seconds
 */
function getElapsedTime() {
    if (testStartTime === 0) return 0;
    return (performance.now() - testStartTime) / 1000;
}

/**
 * Reset the stepper UI to initial state
 */
function resetStepperUI() {
    // Remove all active and completed classes
    Object.values(stepElements).forEach(element => {
        if (element) {
            element.classList.remove('active', 'completed', 'just-completed');
        }
    });
}

/**
 * Update the stepper UI for a phase change
 * @param {string} newPhase - The new phase
 * @param {string} previousPhase - The previous phase
 */
function updateStepperUI(newPhase, previousPhase) {
    // Remove active class from all steps
    Object.values(stepElements).forEach(element => {
        if (element) {
            element.classList.remove('active', 'just-completed');
        }
    });
    
    // Mark the current step as active
    if (stepElements[newPhase]) {
        stepElements[newPhase].classList.add('active');
    }
    
    // Mark previous steps as completed
    const phases = Object.values(TEST_PHASES);
    const newPhaseIndex = phases.indexOf(newPhase);
    
    for (let i = 0; i < newPhaseIndex; i++) {
        const phase = phases[i];
        if (stepElements[phase] && phase !== TEST_PHASES.IDLE && phase !== TEST_PHASES.COMPLETE) {
            stepElements[phase].classList.add('completed');
        }
    }
    
    // Add animation to the previous step that just completed
    if (previousPhase && stepElements[previousPhase]) {
        stepElements[previousPhase].classList.add('just-completed');
        
        // Remove the animation class after it completes
        setTimeout(() => {
            if (stepElements[previousPhase]) {
                stepElements[previousPhase].classList.remove('just-completed');
            }
        }, 500);
    }
}

export {
    initUI,
    startTestUI,
    TEST_PHASES,
    PHASE_DURATIONS,
    getCurrentPhase,
    getElapsedTime,
    createDebugModeToggle
};