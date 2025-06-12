/**
 * Simple Telemetry Manager
 * Handles anonymous submission of test results for statistical analysis
 */

class TelemetryManager {
    constructor() {
        this.enabled = true;
        this.centralServerUrl = 'https://test.libreqos.com';
        this.submitUrl = `${this.centralServerUrl}/api/telemetry`;
        this.maxRetries = 3;
        this.retryDelay = 1000; // 1 second
    }

    /**
     * Check if telemetry is enabled
     * @returns {boolean} True if telemetry should be collected
     */
    isEnabled() {
        // Telemetry is always enabled - automatic submission
        return true;
    }

    /**
     * Submit test results to telemetry system (central server only)
     * @param {Object} results - Test results object
     */
    async submitResults(results) {
        if (!this.isEnabled()) {
            console.log('📊 Telemetry disabled, skipping result submission');
            return;
        }

        // Only submit telemetry if we're NOT already on the central server
        if (window.location.hostname === 'test.libreqos.com') {
            console.log('📊 On central server, telemetry handled server-side');
            return;
        }

        try {
            const telemetryData = this._prepareTelemetryData(results);
            await this._submitWithRetry(telemetryData);
            console.log('📊 Telemetry submitted successfully to central server');
        } catch (error) {
            console.warn('📊 Telemetry submission failed:', error.message);
            // Don't throw error - telemetry failures shouldn't break the test
        }
    }

    /**
     * Prepare telemetry data from test results
     * @param {Object} results - Raw test results
     * @returns {Object} Formatted telemetry data
     */
    _prepareTelemetryData(results) {
        const telemetryData = {
            telemetry_enabled: true,
            timestamp: new Date().toISOString(),
            results: {
                test_type: results.testType || 'single',
                grades: {},
                metrics: {}
            }
        };

        // Extract grades
        if (results.grades) {
            telemetryData.results.grades = {
                overall: results.grades.overall,
                download: results.grades.download,
                upload: results.grades.upload,
                bidirectional: results.grades.bidirectional
            };
        }

        // Extract metrics
        if (results.metrics) {
            telemetryData.results.metrics = {
                baseline_latency_ms: results.metrics.baselineLatency,
                download_latency_increase_ms: results.metrics.downloadLatencyIncrease,
                upload_latency_increase_ms: results.metrics.uploadLatencyIncrease,
                bidirectional_latency_increase_ms: results.metrics.bidirectionalLatencyIncrease,
                download_throughput_mbps: results.metrics.downloadThroughput,
                upload_throughput_mbps: results.metrics.uploadThroughput
            };
        }

        // Virtual Household specific data
        if (results.testType === 'virtual_household' && results.householdResults) {
            telemetryData.results.household_metrics = {
                alex_performance: results.householdResults.alex?.grade,
                sarah_performance: results.householdResults.sarah?.grade,
                jake_performance: results.householdResults.jake?.grade,
                computer_performance: results.householdResults.computer?.grade
            };
        }

        return telemetryData;
    }

    /**
     * Submit telemetry data with retry logic
     * @param {Object} data - Telemetry data to submit
     */
    async _submitWithRetry(data) {
        let lastError;
        
        for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
            try {
                const response = await fetch(this.submitUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(data)
                });

                if (response.ok) {
                    return; // Success
                }

                // Non-2xx response
                lastError = new Error(`HTTP ${response.status}: ${response.statusText}`);
                
            } catch (error) {
                lastError = error;
            }

            // Wait before retry (except on last attempt)
            if (attempt < this.maxRetries) {
                await this._sleep(this.retryDelay * attempt);
            }
        }

        throw lastError;
    }

    /**
     * Sleep for specified milliseconds
     * @param {number} ms - Milliseconds to sleep
     */
    _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Insert telemetry UI controls into the page
     */
    insertUI() {
        // Telemetry is automatic - no UI controls needed
        console.log('📊 Telemetry system initialized (automatic submission)');
    }

    /**
     * Get telemetry status for UI display
     * @returns {Object} Status information
     */
    getStatus() {
        return {
            enabled: this.isEnabled(),
            submitUrl: this.submitUrl,
            maxRetries: this.maxRetries
        };
    }
}

// Create global instance
const telemetryManager = new TelemetryManager();

// Export for use in other modules
export { telemetryManager };

// Make available globally for debugging
if (typeof window !== 'undefined') {
    window.telemetryManager = telemetryManager;
}