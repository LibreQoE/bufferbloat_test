/**
 * Configuration Module
 * Centralized configuration for the LibreQoS Bufferbloat Test
 */

const config = {
    // Adaptive Warmup Configuration
    adaptiveWarmup: {
        enabled: true, // Enable/disable adaptive warmup
        fallbackToSimple: true, // Fall back to simple discovery on failure
        speedEstimationTimeout: 3000, // 3 seconds for speed estimation
        configTrialDuration: 750, // 0.75 seconds per configuration trial (optimized)
        maxTrials: 10, // Maximum number of configuration trials (optimized)
        earlyTerminationThreshold: 0.85, // 85% bandwidth efficiency for early termination (more aggressive)
        
        // Speed tier boundaries (Mbps)
        speedTiers: {
            slow: { min: 0, max: 10 },
            medium: { min: 10, max: 100 },
            fast: { min: 100, max: 500 },
            gigabit: { min: 500, max: Infinity }
        },
        
        // Scoring weights
        scoring: {
            throughputWeight: 0.7, // 70% weight on throughput
            latencyWeight: 0.3,    // 30% weight on latency
            latencyMultiplier: 2.0 // Latency threshold = baseline * multiplier
        }
    },
    
    // Test Configuration
    test: {
        totalDuration: 50, // Total test duration in seconds
        phases: {
            baseline: 5,
            downloadWarmup: 15,
            download: 5,
            uploadWarmup: 15,
            upload: 5,
            bidirectional: 5
        }
    },
    
    // Debug Configuration
    debug: {
        enabled: false, // Enable debug mode by default
        verboseLogging: false, // Extra verbose logging
        showParameterHistory: true, // Show parameter discovery visualization
        logLevel: 'INFO' // LOG_LEVELS: 'ERROR', 'WARN', 'INFO', 'DEBUG'
    }
};

/**
 * Get configuration value by path
 * @param {string} path - Dot-separated path (e.g., 'adaptiveWarmup.enabled')
 * @returns {*} Configuration value
 */
function getConfig(path) {
    return path.split('.').reduce((obj, key) => obj && obj[key], config);
}

/**
 * Set configuration value by path
 * @param {string} path - Dot-separated path
 * @param {*} value - Value to set
 */
function setConfig(path, value) {
    const keys = path.split('.');
    const lastKey = keys.pop();
    const target = keys.reduce((obj, key) => {
        if (!obj[key]) obj[key] = {};
        return obj[key];
    }, config);
    target[lastKey] = value;
}

// isAdaptiveWarmupEnabled function removed - adaptive warmup is now always used

/**
 * Get adaptive warmup configuration
 * @returns {Object} Adaptive warmup configuration
 */
function getAdaptiveWarmupConfig() {
    return getConfig('adaptiveWarmup');
}


/**
 * Get debug configuration
 * @returns {Object} Debug configuration
 */
function getDebugConfig() {
    return getConfig('debug');
}

/**
 * Enable or disable debug mode
 * @param {boolean} enabled - Whether to enable debug mode
 */
function setDebugEnabled(enabled) {
    setConfig('debug.enabled', enabled);
    window.debugMode = enabled;
}

/**
 * Log levels for filtering verbose output
 */
const LOG_LEVELS = {
    ERROR: 0,
    WARN: 1,
    INFO: 2,
    DEBUG: 3
};

/**
 * Conditional logging based on log level
 * @param {string} level - Log level ('ERROR', 'WARN', 'INFO', 'DEBUG')
 * @param {...any} args - Arguments to log
 */
function logWithLevel(level, ...args) {
    const currentLevel = LOG_LEVELS[getConfig('debug.logLevel')] || LOG_LEVELS.INFO;
    const messageLevel = LOG_LEVELS[level] || LOG_LEVELS.INFO;
    
    if (messageLevel <= currentLevel) {
        console.log(...args);
    }
}

// Export configuration functions
export {
    config,
    getConfig,
    setConfig,
    getAdaptiveWarmupConfig,
    getDebugConfig,
    setDebugEnabled,
    logWithLevel,
    LOG_LEVELS
};

export default config;