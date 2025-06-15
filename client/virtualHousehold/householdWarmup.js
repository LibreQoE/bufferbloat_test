/**
 * Connection Warmup Controller
 * Simple 10-second bulk download to measure connection speed
 */

class HouseholdWarmup {
    constructor() {
        this.samples = [];
        this.sampleInterval = 250; // ms - sample every 250ms
        this.duration = 10000; // 10 seconds
        this.maxRetries = 1;
        this.isRunning = false;
        this.startTime = null;
        this.bytesReceived = 0;
        this.lastSampleTime = 0;
        this.lastSampleBytes = 0;
        this.preciseDurationTimeout = null; // PHASE 1 FIX: Track precise timeout for cleanup
    }

    /**
     * Measure connection download speed
     * @returns {Promise<Object>} { success, download80th, maxDownload, samples, error }
     */
    async measureConnection() {
        console.log('🚀 Starting connection warmup measurement...');
        
        try {
            const result = await this._attemptMeasurement();
            if (result.success) {
                return result;
            }
            
            // Retry once if failed
            console.log('⚠️ First warmup attempt failed, retrying...');
            return await this._attemptMeasurement();
            
        } catch (error) {
            console.error('❌ Warmup measurement failed:', error);
            return {
                success: false,
                error: error.message,
                download80th: 200.0, // Fallback to 200 Mbps
                maxDownload: 200.0,
                samples: []
            };
        }
    }

    async _attemptMeasurement() {
        this.samples = [];
        this.bytesReceived = 0;
        this.isRunning = true;
        this.startTime = performance.now();
        this.lastSampleTime = this.startTime;
        this.lastSampleBytes = 0;

        try {
            // Start bulk download and sampling
            const downloadPromise = this._startBulkDownload();
            const samplingPromise = this._startSampling();

            // Wait for both to complete
            await Promise.all([downloadPromise, samplingPromise]);

            // Calculate results
            if (this.samples.length < 10) {
                throw new Error(`Insufficient samples: ${this.samples.length} (need at least 10)`);
            }

            const download80th = this._calculate80thPercentile(this.samples);
            const maxDownload = Math.max(...this.samples);

            console.log(`✅ Warmup complete: ${download80th.toFixed(1)} Mbps (80th percentile), ${maxDownload.toFixed(1)} Mbps (max)`);
            console.log(`📊 Collected ${this.samples.length} samples over ${this.duration/1000}s`);

            return {
                success: true,
                download80th: download80th,
                maxDownload: maxDownload,
                samples: this.samples,
                totalBytes: this.bytesReceived,
                duration: this.duration
            };

        } catch (error) {
            console.error('❌ Measurement attempt failed:', error);
            return {
                success: false,
                error: error.message,
                download80th: 200.0, // Fallback
                maxDownload: 200.0,
                samples: this.samples
            };
        } finally {
            this.isRunning = false;
            // PHASE 1 FIX: Ensure precise timeout is cleaned up
            if (this.preciseDurationTimeout) {
                clearTimeout(this.preciseDurationTimeout);
                this.preciseDurationTimeout = null;
            }
        }
    }

    async _startBulkDownload() {
        const controller = new AbortController();
        // PHASE 1 TERMINATION FIX: Shorter timeout, will be aborted when warmup ends
        const timeoutId = setTimeout(() => controller.abort(), this.duration + 5000);
        let reader = null;

        try {
            // Import server discovery for distributed architecture
            const { serverDiscovery } = await import('../discovery.js');
            
            const response = await serverDiscovery.makeRequest('/api/warmup/bulk-download', {
                method: 'GET',
                signal: controller.signal
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            reader = response.body.getReader();
            
            while (this.isRunning) {
                const { done, value } = await reader.read();
                
                if (done) break;
                
                if (value) {
                    this.bytesReceived += value.length;
                }
            }

            // PHASE 1 TERMINATION FIX: Explicitly close reader when warmup ends
            console.log('📡 Warmup duration completed, closing bulk download reader');

        } catch (error) {
            if (error.name === 'AbortError') {
                console.log('📡 Download aborted (normal for warmup)');
            } else {
                throw error;
            }
        } finally {
            // PHASE 1 TERMINATION FIX: Ensure reader is always closed and controller aborted
            if (reader) {
                try {
                    await reader.cancel();
                    console.log('📡 Bulk download reader cancelled');
                } catch (e) {
                    console.log('📡 Reader cancel error (may be normal):', e.message);
                }
            }
            
            // Force abort the controller to terminate server-side stream
            if (!controller.signal.aborted) {
                controller.abort();
                console.log('📡 Bulk download controller aborted');
            }
            
            clearTimeout(timeoutId);
        }
    }

    async _startSampling() {
        return new Promise((resolve) => {
            // PHASE 1 TERMINATION FIX: Use precise timeout for exact 10-second duration
            // Set up a precise timeout to ensure exactly 10 seconds regardless of sampling interval
            this.preciseDurationTimeout = setTimeout(() => {
                console.log('⏰ PRECISE TIMEOUT: Phase 1 terminating after exactly 10 seconds');
                this.isRunning = false;
                if (sampleTimer) {
                    clearInterval(sampleTimer);
                }
                this.preciseDurationTimeout = null; // Clear reference
                resolve();
            }, this.duration);

            const sampleTimer = setInterval(() => {
                if (!this.isRunning) {
                    clearInterval(sampleTimer);
                    if (this.preciseDurationTimeout) {
                        clearTimeout(this.preciseDurationTimeout);
                        this.preciseDurationTimeout = null;
                    }
                    resolve();
                    return;
                }

                const now = performance.now();
                const elapsed = now - this.startTime;

                // Remove the interval-based duration check to prevent early termination
                // The precise timeout above will handle the exact termination timing
                
                // Calculate throughput for this sample
                const sampleDuration = (now - this.lastSampleTime) / 1000; // seconds
                const sampleBytes = this.bytesReceived - this.lastSampleBytes;
                
                if (sampleDuration > 0) {
                    const throughputMbps = (sampleBytes * 8) / (sampleDuration * 1000000);
                    this.samples.push(throughputMbps);
                    
                    console.log(`📊 Sample ${this.samples.length}: ${throughputMbps.toFixed(1)} Mbps (${elapsed.toFixed(0)}ms elapsed)`);
                }

                this.lastSampleTime = now;
                this.lastSampleBytes = this.bytesReceived;

            }, this.sampleInterval);
        });
    }

    _calculate80thPercentile(samples) {
        if (samples.length === 0) return 0;
        
        const sorted = [...samples].sort((a, b) => a - b);
        const index = Math.ceil(0.80 * sorted.length) - 1;
        return sorted[Math.max(0, index)];
    }

    _calculate95thPercentile(samples) {
        if (samples.length === 0) return 0;
        
        const sorted = [...samples].sort((a, b) => a - b);
        const index = Math.ceil(0.95 * sorted.length) - 1;
        return sorted[Math.max(0, index)];
    }

    /**
     * Get current warmup progress
     * @returns {Object} { progress, elapsed, samples, currentSpeed }
     */
    getProgress() {
        if (!this.isRunning || !this.startTime) {
            return { progress: 0, elapsed: 0, samples: 0, currentSpeed: 0 };
        }

        const elapsed = performance.now() - this.startTime;
        const progress = Math.min(elapsed / this.duration, 1.0);
        const currentSpeed = this.samples.length > 0 ? this.samples[this.samples.length - 1] : 0;

        return {
            progress: progress,
            elapsed: elapsed,
            samples: this.samples.length,
            currentSpeed: currentSpeed
        };
    }

    /**
     * Stop the warmup measurement
     * PHASE 1 TERMINATION FIX: Explicit cleanup method
     */
    stop() {
        console.log('🛑 PHASE 1 TERMINATION: Explicitly stopping warmup measurement');
        this.isRunning = false;
        
        // PHASE 1 FIX: Clean up precise timeout on manual stop
        if (this.preciseDurationTimeout) {
            clearTimeout(this.preciseDurationTimeout);
            this.preciseDurationTimeout = null;
        }
        
        console.log('✅ PHASE 1 TERMINATION: Warmup measurement stopped');
    }
}

// Export for use in other modules
window.HouseholdWarmup = HouseholdWarmup;