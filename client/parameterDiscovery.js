/**
 * Parameter Discovery
 * Adaptive Warmup Only - Legacy discovery system removed
 */

import StreamManager from './streamManager.js';
import AdaptiveWarmup from './adaptiveWarmup.js';

/**
 * Adaptive Parameter Discovery class
 * Uses only the adaptive warmup system
 */
class AdaptiveParameterDiscovery {
    /**
     * Constructor
     * @param {string} type - The type of discovery ('download' or 'upload')
     * @param {number} baselineLatency - The baseline latency in ms
     */
    constructor(type, baselineLatency) {
        this.type = type; // 'download' or 'upload'
        this.baselineLatency = baselineLatency || 20; // Default to 20ms if not provided
        this.adaptiveWarmup = null; // Will hold AdaptiveWarmup instance
        
        // State tracking for adaptive warmup
        this.stableParameters = {
            streamCount: 1,
            pendingUploads: 1
        };
        this.bestThroughput = 0;
        this.bestLatency = baselineLatency;
        
        // Parameter history for visualization
        this.parameterHistory = [];
        this.isComplete = false;
        
        // Minimum duration for warmup phases
        this.startTime = performance.now();
    }
    
    /**
     * Start the parameter discovery process
     * @returns {Promise} A promise that resolves when discovery is complete
     */
    async start() {
        console.log(`🎯 FORCED ADAPTIVE: Starting adaptive ${this.type} parameter discovery (legacy system removed)`);
        console.log(`🔧 AdaptiveWarmup import status:`, typeof AdaptiveWarmup);
        
        // Mark as complete immediately to prevent legacy system from running
        this.isComplete = true;
        
        // Run adaptive warmup and return its results directly
        console.log(`🔧 About to call runAdaptiveWarmup()`);
        return this.runAdaptiveWarmup();
    }
    
    /**
     * Run the adaptive warmup process
     * @returns {Promise<Object>} Optimal parameters
     */
    async runAdaptiveWarmup() {
        console.log(`🔧 runAdaptiveWarmup() for ${this.type}`);

        try {
            // Create and run adaptive warmup
            this.adaptiveWarmup = new AdaptiveWarmup(this.type, this.baselineLatency);
            console.log(`🚀 Starting adaptive warmup`);
            const optimalConfig = await this.adaptiveWarmup.run();
            
            // Set discovered parameters
            this.stableParameters = {
                streamCount: optimalConfig.streamCount,
                pendingUploads: optimalConfig.pendingUploads || 1,
                uploadDelay: optimalConfig.uploadDelay || 0
            };
            
            // Store adaptive warmup metadata
            this.adaptiveWarmupData = optimalConfig.adaptiveWarmup;
            
            // Calculate best throughput from trial results
            if (this.adaptiveWarmup.trialResults.length > 0) {
                const validResults = this.adaptiveWarmup.trialResults.filter(r => r.scoring.acceptable);
                this.bestThroughput = validResults.length > 0
                    ? Math.max(...validResults.map(r => r.result.throughput))
                    : 0;
                this.bestLatency = validResults.length > 0
                    ? validResults.find(r => r.result.throughput === this.bestThroughput).result.latency
                    : this.baselineLatency;
            } else {
                this.bestThroughput = 0;
                this.bestLatency = this.baselineLatency;
            }
            
            // Update parameter history for visualization
            this.updateParameterHistoryFromAdaptive();
            
            console.log(`✅ Adaptive ${this.type} complete: ${this.adaptiveWarmupData.estimatedSpeed.toFixed(2)} Mbps, ${this.adaptiveWarmupData.trialsCompleted} trials`);
            
            // 🔧 DIAGNOSTIC: Log complete parameter set being returned
            console.log(`🔧 ADAPTIVE WARMUP RESULT OBJECT:`, JSON.stringify(optimalConfig, null, 2));
            console.log(`🔧 STABLE PARAMETERS BEING RETURNED:`, JSON.stringify(this.stableParameters, null, 2));
            
            this.isComplete = true;
            return this.stableParameters;
            
        } catch (error) {
            console.error(`❌ Adaptive ${this.type} discovery failed:`, error);
            console.error(`❌ Error occurred in runAdaptiveWarmup() method`);
            console.error(`❌ Error details:`, {
                name: error.name,
                message: error.message,
                stack: error.stack,
                toString: error.toString(),
                constructor: error.constructor?.name
            });
            console.error(`❌ Full error object:`, error);
            console.error(`❌ Error type check:`, {
                isError: error instanceof Error,
                isTypeError: error instanceof TypeError,
                isReferenceError: error instanceof ReferenceError,
                isSyntaxError: error instanceof SyntaxError
            });
            
            // No fallback - adaptive warmup is required
            console.error(`❌ Adaptive warmup failed and no fallback available: ${error.message}`);
            throw error;
        }
    }
    
    /**
     * Update parameter history from adaptive warmup results for visualization
     */
    updateParameterHistoryFromAdaptive() {
        if (!this.adaptiveWarmup || !this.adaptiveWarmup.trialResults) {
            return;
        }
        
        // Convert adaptive warmup trial results to parameter history format
        this.parameterHistory = this.adaptiveWarmup.trialResults.map((trial, index) => {
            return {
                timestamp: this.adaptiveWarmup.startTime + (index * 1000), // Approximate timing
                parameters: {
                    streamCount: trial.config.streamCount,
                    pendingUploads: trial.config.pendingUploads || 1
                },
                throughput: trial.result.throughput,
                latency: trial.result.latency,
                isOptimal: trial.config === this.adaptiveWarmup.optimalConfig,
                adaptiveScore: trial.scoring.score,
                adaptiveAcceptable: trial.scoring.acceptable
            };
        });
    }
    
    /**
     * Handle a measurement (legacy - not used with adaptive warmup)
     * @param {Object} measurement - The measurement object
     */
    handleMeasurement(measurement) {
        if (this.isComplete) return;
        
        // Legacy measurement handling removed - adaptive warmup only
        return;
    }
    
    /**
     * Get parameter history
     * @returns {Array} The parameter history
     */
    getParameterHistory() {
        return this.parameterHistory;
    }
}

/**
 * Initialize parameter discovery
 * @param {string} type - The type of discovery ('download' or 'upload')
 * @param {number} baselineLatency - The baseline latency in ms
 * @returns {Promise} A promise that resolves with the optimal parameters
 */
export function initDiscovery(type, baselineLatency) {
    console.log(`🎯 FORCED ADAPTIVE: initDiscovery() with parameters:`, {
        type,
        baselineLatency,
        AdaptiveWarmupAvailable: typeof AdaptiveWarmup
    });
    
    // Create discovery instance - always uses adaptive warmup
    console.log(`🔧 About to create AdaptiveParameterDiscovery instance (adaptive warmup only)`);
    const discovery = new AdaptiveParameterDiscovery(type, baselineLatency);
    console.log(`🔧 AdaptiveParameterDiscovery instance created:`, discovery);
    
    // Store discovery instance globally for event handling
    window.currentDiscovery = discovery;
    
    // Set up event listener for force backoff with enhanced handling
    window.addEventListener(`${type}:force_backoff`, (event) => {
        const backoffFactor = event.detail?.backoffFactor || 0.5;
        const forceStreamReduction = event.detail?.forceStreamReduction || false;
        const reason = event.detail?.reason || 'unknown';
        
        console.log(`🚨 FORCE BACKOFF EVENT: ${type}, factor: ${backoffFactor}, forceStreamReduction: ${forceStreamReduction}, reason: ${reason}`);
        
        // Adaptive warmup handles its own backoff internally
        console.log(`🎯 ADAPTIVE WARMUP: Backoff events handled internally by adaptive warmup system`);
    });
    
    // Start discovery process with error handling
    return discovery.start().catch(error => {
        console.error(`Parameter discovery for ${type} failed:`, error);
        // Return reasonable default parameters that work for all connection speeds
        const defaultParams = {
            streamCount: type === 'upload' ? 3 : 3,
            pendingUploads: type === 'upload' ? 2 : 1,
            uploadDelay: 0
        };
        console.log(`Discovery failed, using defaults: ${JSON.stringify(defaultParams)}`);
        return defaultParams;
    });
}

/**
 * Handle measurement for current discovery
 * @param {Object} measurement - The measurement object
 */
export function handleMeasurement(measurement) {
    if (window.currentDiscovery) {
        window.currentDiscovery.handleMeasurement(measurement);
    }
}

/**
 * Check if discovery is in progress
 * @returns {boolean} True if discovery is in progress
 */
export function isDiscoveryInProgress() {
    return window.currentDiscovery && !window.currentDiscovery.isComplete;
}

/**
 * Get best parameters from discovery
 * @returns {Object} The best parameters
 */
export function getBestParameters() {
    if (window.currentDiscovery) {
        // Make sure we return a deep copy to avoid reference issues
        const params = window.currentDiscovery.stableParameters;
        if (params) {
            return { ...params };
        }
    }
    return null;
}

/**
 * Get parameter history from discovery
 * @returns {Array} The parameter history
 */
export function getParameterHistory() {
    if (window.currentDiscovery) {
        return window.currentDiscovery.getParameterHistory();
    }
    return [];
}

export default {
    initDiscovery,
    handleMeasurement,
    isDiscoveryInProgress,
    getBestParameters,
    getParameterHistory
};