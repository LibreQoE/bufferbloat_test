/**
 * Adaptive Virtual Household Controller
 * Orchestrates two-phase test: Warmup → Household Simulation
 */

class AdaptiveController {
    constructor(virtualHouseholdInstance) {
        this.virtualHousehold = virtualHouseholdInstance;
        this.state = 'idle'; // idle, warmup, household, complete
        this.warmupController = new window.HouseholdWarmup();
        this.warmupResults = null;
        this.adaptiveProfiles = null;
        
        // Total test duration: 10s warmup + 30s household = 40s
        this.totalDuration = 40000; // 40 seconds
        this.warmupDuration = 10000; // 10 seconds
        this.householdDuration = 30000; // 30 seconds
        
        this.testStartTime = null;
        this.householdPhaseStarted = false; // Guard against double execution
    }

    updateOverallProgress() {
        if (!this.testStartTime) return;
        
        const elapsed = performance.now() - this.testStartTime;
        let progress = 0;
        
        if (this.state === 'warmup') {
            // Phase 1: Show progress from 0% to 100% over 10 seconds
            const warmupElapsed = Math.min(elapsed, this.warmupDuration);
            progress = (warmupElapsed / this.warmupDuration) * 100;
            
            // Use warmup controller's progress if available for more accuracy
            if (this.warmupController && typeof this.warmupController.getProgress === 'function') {
                const warmupProgress = this.warmupController.getProgress();
                if (warmupProgress.progress > 0) {
                    progress = warmupProgress.progress * 100;
                }
            }
        } else if (this.state === 'household') {
            // Phase 2: Let UIHousehold handle progress bar updates to avoid conflicts
            // Don't update progress bar here to prevent blinking
            return;
        }
        
        // Ensure progress is within bounds
        progress = Math.max(0, Math.min(progress, 100));
        
        // Update the main progress bar (only during warmup phase)
        const progressBar = document.getElementById('test-progress-bar');
        
        if (progressBar) {
            progressBar.style.width = `${progress}%`;
        }
        
        // Update status text only (no flashing progress text)
        if (this.state === 'warmup') {
            this.virtualHousehold.ui.updateStatus('Phase 1: Detecting connection speed...');
        } else if (this.state === 'household') {
            this.virtualHousehold.ui.updateStatus('Phase 2: Household simulation...');
        }
    }

    /**
     * Start the complete integrated adaptive test
     */
    async startAdaptiveTest() {
        console.log('🚀 Starting Integrated Adaptive Virtual Household Test (40s total)');
        console.log('🔍 DEBUG: AdaptiveController warmupController:', this.warmupController);
        console.log('🔍 DEBUG: window.HouseholdWarmup available:', typeof window.HouseholdWarmup);
        console.log('🔍 DEBUG: this.virtualHousehold available:', !!this.virtualHousehold);
        console.log('🔍 DEBUG: this.virtualHousehold.sendAdaptiveUpdate available:', typeof this.virtualHousehold?.sendAdaptiveUpdate);
        
        // RESTART FIX: Always reset guard flag at start of new test
        console.log('🔄 RESTART FIX: Resetting householdPhaseStarted flag for new test');
        this.householdPhaseStarted = false;
        
        this.testStartTime = performance.now();
        
        // Start progress monitoring
        this.progressInterval = setInterval(() => {
            this.updateOverallProgress();
        }, 500); // Reduced frequency to prevent flashing
        
        try {
            // Phase 1: Warmup (10 seconds) - MUST complete before Phase 2
            console.log('📡 Phase 1: Starting connection speed detection...');
            console.log('🔍 DEBUG: About to call runWarmupPhase()');
            await this.runWarmupPhase();
            console.log('✅ Phase 1: Connection speed detection complete');
            console.log('🔍 DEBUG: Warmup results after Phase 1:', this.warmupResults);
            
            // Brief pause between phases (removed progress bar reset to prevent blinking)
            console.log('🔍 DEBUG: Pausing 1 second between phases');
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Phase 2: Household simulation (30 seconds) - start only after Phase 1 completes
            console.log('🏠 Phase 2: Starting household simulation...');
            this.state = 'household'; // Ensure state is set for Phase 2
            console.log('🔍 DEBUG: About to call startHouseholdPhase()');
            await this.startHouseholdPhase();
            console.log('✅ Phase 2: Household simulation complete');
            
            console.log('✅ Integrated Adaptive Virtual Household Test Complete');
            
        } catch (error) {
            console.error('❌ ADAPTIVE TEST FAILED:', error);
            console.error('❌ Error type:', error.constructor.name);
            console.error('❌ Error message:', error.message);
            console.error('❌ Error stack:', error.stack);
            console.error('❌ Current state:', this.state);
            console.error('❌ Warmup results:', this.warmupResults);
            this.virtualHousehold.ui.updateStatus(`Adaptive test failed: ${error.message}`);
            
            // Re-throw the error so it's visible in the console
            throw error;
        } finally {
            if (this.progressInterval) {
                clearInterval(this.progressInterval);
                this.progressInterval = null;
            }
        }
    }

    async runWarmupPhase() {
        console.log('📡 Phase 1: Connection Speed Detection (10s)');
        console.log('🔍 DEBUG: runWarmupPhase() called');
        console.log('🔍 DEBUG: warmupController type:', typeof this.warmupController);
        console.log('🔍 DEBUG: warmupController:', this.warmupController);
        
        this.state = 'warmup';
        
        // Update status
        this.virtualHousehold.ui.updateStatus('Phase 1: Detecting your connection speed...');
        
        try {
            // Check if warmupController is available
            if (!this.warmupController) {
                throw new Error('WarmupController not available');
            }
            
            if (typeof this.warmupController.measureConnection !== 'function') {
                throw new Error('WarmupController.measureConnection is not a function');
            }
            
            // Run warmup measurement and wait for completion
            console.log('🔍 Starting connection measurement...');
            console.log('🔍 DEBUG: About to call warmupController.measureConnection()');
            this.warmupResults = await this.warmupController.measureConnection();
            console.log('🔍 DEBUG: warmupController.measureConnection() returned:', this.warmupResults);
            
            if (!this.warmupResults.success) {
                throw new Error(this.warmupResults.error || 'Connection speed detection failed');
            }
            
            console.log(`✅ Speed detection complete: ${this.warmupResults.download80th.toFixed(1)} Mbps`);

            // Update Computer profile with detected speed (but don't send to server yet)
            const detectedSpeed = this.warmupResults.download80th;
            this.virtualHousehold.userConfigs.computer.targetDownload = detectedSpeed;
            this.virtualHousehold.userConfigs.computer.description = `Game Updates (${detectedSpeed.toFixed(1)} Mbps detected)`;
            this.virtualHousehold.userConfigs.computer.familyName = `Computer (${detectedSpeed.toFixed(1)} Mbps detected)`;
            
            console.log(`🔧 Updated Computer profile locally: ${detectedSpeed.toFixed(1)} Mbps`);
            
            // Brief status update
            this.virtualHousehold.ui.updateStatus(`Detected ${detectedSpeed.toFixed(1)} Mbps - Preparing household simulation...`);
            
        } catch (error) {
            console.error('❌ Warmup phase failed:', error);
            console.error('❌ Warmup error stack:', error.stack);
            throw error;
        }
    }

    // Removed separate results phase - goes directly to household simulation

    async startHouseholdPhase() {
        // DOUBLE EXECUTION GUARD: Prevent multiple calls to household phase
        if (this.householdPhaseStarted) {
            console.log('⚠️ DOUBLE EXECUTION PREVENTED: startHouseholdPhase() already called');
            return;
        }
        this.householdPhaseStarted = true;
        
        console.log('🏠 Phase 2: Household Simulation (30s)');
        this.state = 'household';
        
        // Update status
        this.virtualHousehold.ui.updateStatus('Phase 2: Simulating busy household...');
        
        try {
            // Send adaptive update to server before starting household test
            console.log(`🔧 ADAPTIVE DEBUG: Checking warmup results:`, this.warmupResults);
            console.log(`🔧 ADAPTIVE DEBUG: warmupResults exists?`, !!this.warmupResults);
            console.log(`🔧 ADAPTIVE DEBUG: download80th exists?`, this.warmupResults?.download80th);
            console.log(`🔧 ADAPTIVE DEBUG: download80th value:`, this.warmupResults?.download80th);

            if (this.warmupResults && this.warmupResults.download80th) {
                console.log(`🔧 ADAPTIVE: Sending server update for detected speed: ${this.warmupResults.download80th} Mbps`);
                await this.virtualHousehold.sendAdaptiveUpdate(this.warmupResults.download80th);
                console.log(`🔧 ADAPTIVE: Server update sent, waiting for processing...`);
                // TIMING FIX: Increased delay to ensure server profile update is fully processed before session creation
                // This prevents the computer session from being created with the default 200 Mbps profile
                // instead of the detected connection speed (e.g., 1200 Mbps)
                await new Promise(resolve => setTimeout(resolve, 500)); // Increased to 500ms delay
                console.log(`🔧 ADAPTIVE: Server update processing complete, starting household test`);
            } else {
                console.error(`🔧 ADAPTIVE ERROR: Cannot send server update - warmup results invalid:`, {
                    warmupResults: this.warmupResults,
                    hasDownload80th: !!this.warmupResults?.download80th,
                    download80thValue: this.warmupResults?.download80th
                });
            }
            
            // Start household test (this will run for 30 seconds)
            await this.virtualHousehold.startHouseholdPhase();
            
            this.state = 'complete';
            console.log('✅ Integrated Adaptive Virtual Household Test Complete');
            
        } catch (error) {
            console.error('❌ Household phase failed:', error);
            throw error;
        }
    }

    // Removed separate phase UI management - using main progress bar

    /**
     * Stop the current test
     */
    stop() {
        if (this.progressInterval) {
            clearInterval(this.progressInterval);
            this.progressInterval = null;
        }
        
        if (this.warmupController) {
            this.warmupController.stop();
        }
        
        if (this.virtualHousehold) {
            this.virtualHousehold.stopTest();
        }
        
        this.state = 'idle';
        this.householdPhaseStarted = false; // Reset guard for next test
    }

    /**
     * Get current test state and results
     */
    getStatus() {
        return {
            state: this.state,
            warmupResults: this.warmupResults,
            totalDuration: this.totalDuration,
            warmupDuration: this.warmupDuration,
            householdDuration: this.householdDuration
        };
    }
}

// Export for use in other modules
window.AdaptiveController = AdaptiveController;