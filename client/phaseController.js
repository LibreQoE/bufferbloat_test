/**
 * Phase Controller
 * Manages test phases and ensures clean transitions
 */

import StreamManager from './streamManager.js';

// Logging control - set to false to reduce console spam for production
const VERBOSE_LOGGING = false;

/**
 * Phase Controller class
 * Manages test phases and transitions
 */
class PhaseController {
    constructor() {
        this.currentPhase = null;
        this.phaseStartTime = 0;
        this.phaseEndTime = 0;
        this.isTransitioning = false;
        this.phaseHistory = [];
        this.testStartTime = 0;
    }
    
    /**
     * Initialize the phase controller
     * @param {number} startTime - The test start time
     */
    initialize(startTime) {
        this.testStartTime = startTime || performance.now();
        this.phaseHistory = [];
        this.currentPhase = null;
        this.isTransitioning = false;
    }
    
    /**
     * Start a new phase
     * @param {string} phase - The phase to start
     * @returns {Promise} A promise that resolves when the phase is started
     */
    async startPhase(phase) {
        
        // Ensure previous phase is completely terminated
        if (this.currentPhase) {
            await this.endPhase();
        }
        
        this.isTransitioning = true;
        
        // Enforce phase barrier
        await PhaseBarrier.enforceBarrier();
        
        // Record phase start
        this.currentPhase = phase;
        this.phaseStartTime = performance.now();
        this.isTransitioning = false;
        
        // Add to phase history
        this.phaseHistory.push({
            phase,
            startTime: this.phaseStartTime,
            endTime: null
        });
        
        // Update global phase variable for other modules
        window.currentTestPhase = phase;
        
        // Dispatch phase start event
        this.dispatchPhaseEvent('start');
        
        return true;
    }
    
    /**
     * End the current phase
     * @returns {Promise} A promise that resolves when the phase is ended
     */
    async endPhase() {
        if (!this.currentPhase) return true;
        
        // Ending phase
        
        this.isTransitioning = true;
        this.phaseEndTime = performance.now();
        
        // Update phase history
        const currentPhaseRecord = this.phaseHistory[this.phaseHistory.length - 1];
        if (currentPhaseRecord) {
            currentPhaseRecord.endTime = this.phaseEndTime;
        }
        
        // Dispatch phase end event
        this.dispatchPhaseEvent('end');
        
        // Enforce phase barrier
        await PhaseBarrier.enforceBarrier();
        
        // Reset phase state
        const endedPhase = this.currentPhase;
        this.currentPhase = null;
        this.isTransitioning = false;
        
        return true;
    }
    
    /**
     * Get the current phase
     * @returns {string} The current phase
     */
    getCurrentPhase() {
        return this.currentPhase;
    }
    
    /**
     * Get the elapsed time in the current phase
     * @returns {number} The elapsed time in seconds
     */
    getPhaseElapsedTime() {
        if (!this.currentPhase) return 0;
        
        return (performance.now() - this.phaseStartTime) / 1000;
    }
    
    /**
     * Get the total elapsed time since test start
     * @returns {number} The elapsed time in seconds
     */
    getTotalElapsedTime() {
        if (!this.testStartTime) return 0;
        
        return (performance.now() - this.testStartTime) / 1000;
    }
    
    /**
     * Get the phase history
     * @returns {Array} The phase history
     */
    getPhaseHistory() {
        return this.phaseHistory;
    }
    
    /**
     * Dispatch phase event
     * @param {string} eventType - The event type ('start' or 'end')
     */
    dispatchPhaseEvent(eventType) {
        window.dispatchEvent(new CustomEvent('phase:change', {
            detail: {
                type: eventType,
                phase: this.currentPhase,
                timestamp: performance.now(),
                elapsedTime: this.getPhaseElapsedTime(),
                totalElapsedTime: this.getTotalElapsedTime()
            }
        }));
    }
}

/**
 * Phase Barrier class
 * Ensures clean transitions between phases
 */
class PhaseBarrier {
    /**
     * Enforce phase barrier
     * @returns {Promise} A promise that resolves when the barrier is enforced
     */
    static async enforceBarrier() {
        if (VERBOSE_LOGGING) {
            console.log(`🔧 BARRIER DEBUG: Enforcing phase barrier`);
        }
        
        // Check stream counts before termination
        const preTerminationCounts = StreamManager.getActiveStreamCounts();
        if (VERBOSE_LOGGING) {
            console.log(`🔧 BARRIER DEBUG: Streams before termination: ${preTerminationCounts.download} download, ${preTerminationCounts.upload} upload`);
        }
        
        // Stop all streams
        if (VERBOSE_LOGGING) {
            console.log(`🔧 BARRIER DEBUG: Terminating all streams...`);
        }
        await StreamManager.terminateAllStreams();
        
        // Check stream counts after termination
        const postTerminationCounts = StreamManager.getActiveStreamCounts();
        if (VERBOSE_LOGGING) {
            console.log(`🔧 BARRIER DEBUG: Streams after termination: ${postTerminationCounts.download} download, ${postTerminationCounts.upload} upload`);
        }
        
        // Wait for network quiescence
        await this.waitForNetworkQuiescence();
        
        // Verify all streams are terminated
        const verified = await this.verifyAllStreamsTerminated();
        
        if (!verified) {
            // Emergency measures
            this.emergencyCleanup();
        }
        
        if (VERBOSE_LOGGING) {
            console.log(`🔧 BARRIER DEBUG: Phase barrier enforcement complete, verified: ${verified}`);
        }
        return verified;
    }
    
    /**
     * Wait for network quiescence
     * @returns {Promise} A promise that resolves when network activity drops below threshold
     */
    static async waitForNetworkQuiescence() {
        
        // Simple implementation: just wait a fixed amount of time
        // In a more sophisticated implementation, we would monitor network activity
        await new Promise(resolve => setTimeout(resolve, 200));
        
        return true;
    }
    
    /**
     * Verify all streams are terminated
     * @param {number} maxAttempts - Maximum number of verification attempts
     * @param {number} delayMs - Delay between attempts in milliseconds
     * @returns {Promise<boolean>} A promise that resolves to true if all streams are terminated
     */
    static async verifyAllStreamsTerminated(maxAttempts = 15, delayMs = 100) {
        
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            const counts = StreamManager.getActiveStreamCounts();
            const totalStreams = counts.total;
            
            if (totalStreams === 0) {
                return true;
            }
            
            console.warn(`Streams still active (attempt ${attempt}/${maxAttempts}): ${counts.download} download, ${counts.upload} upload`);
            
            // If this is the last attempt, try one more aggressive cleanup
            if (attempt === maxAttempts - 1) {
                console.warn("Performing emergency stream cleanup");
                // Only call terminateAllStreams if there are actually streams to terminate
                if (totalStreams > 0) {
                    await StreamManager.terminateAllStreams();
                }
            }
            
            // Wait before next check with increasing delays
            await new Promise(resolve => setTimeout(resolve, delayMs * Math.pow(1.5, attempt - 1)));
        }
        
        console.error("Failed to verify all streams terminated after maximum attempts");
        return false;
    }
    
    /**
     * Emergency cleanup
     */
    static emergencyCleanup() {
        console.warn("EMERGENCY: Forcing stream registry reset");
        
        // Reset stream registry
        StreamManager.resetRegistry();
        
        // Force garbage collection if possible
        if (window.gc) window.gc();
    }
}

// Export both classes
export { PhaseController, PhaseBarrier };