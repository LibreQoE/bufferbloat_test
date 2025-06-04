/**
 * Throughput Tracker
 * Provides real-time throughput measurements for adaptive warmup
 */

class ThroughputTracker {
    constructor() {
        this.downloadMeasurements = [];
        this.uploadMeasurements = [];
        this.measurementWindow = 5000; // 5 second window
        this.isTracking = false;
        
        // Bind methods
        this.handleDownloadThroughput = this.handleDownloadThroughput.bind(this);
        this.handleUploadThroughput = this.handleUploadThroughput.bind(this);
    }
    
    /**
     * Start tracking throughput measurements
     */
    startTracking() {
        if (this.isTracking) return;
        
        this.isTracking = true;
        this.downloadMeasurements = [];
        this.uploadMeasurements = [];
        
        // Listen for throughput events
        window.addEventListener('throughput:download', this.handleDownloadThroughput);
        window.addEventListener('throughput:upload', this.handleUploadThroughput);
        
        // ThroughputTracker: Started tracking
    }
    
    /**
     * Stop tracking throughput measurements
     */
    stopTracking() {
        if (!this.isTracking) return;
        
        this.isTracking = false;
        
        // Remove event listeners
        window.removeEventListener('throughput:download', this.handleDownloadThroughput);
        window.removeEventListener('throughput:upload', this.handleUploadThroughput);
        
        // ThroughputTracker: Stopped tracking
    }
    
    /**
     * Handle download throughput event
     * @param {CustomEvent} event - Throughput event
     */
    handleDownloadThroughput(event) {
        const { throughput, time } = event.detail;
        
        this.downloadMeasurements.push({
            throughput,
            timestamp: performance.now(),
            time
        });
        
        // Clean old measurements
        this.cleanOldMeasurements('download');
        
        // Update global current measurement
        this.updateCurrentMeasurement();
    }
    
    /**
     * Handle upload throughput event
     * @param {CustomEvent} event - Throughput event
     */
    handleUploadThroughput(event) {
        const { throughput, time } = event.detail;
        
        this.uploadMeasurements.push({
            throughput,
            timestamp: performance.now(),
            time
        });
        
        // Clean old measurements
        this.cleanOldMeasurements('upload');
        
        // Update global current measurement
        this.updateCurrentMeasurement();
    }
    
    /**
     * Clean old measurements outside the window
     * @param {string} direction - 'download' or 'upload'
     */
    cleanOldMeasurements(direction) {
        const now = performance.now();
        const measurements = direction === 'download' ? this.downloadMeasurements : this.uploadMeasurements;
        
        // Remove measurements older than the window
        const filtered = measurements.filter(m => (now - m.timestamp) <= this.measurementWindow);
        
        if (direction === 'download') {
            this.downloadMeasurements = filtered;
        } else {
            this.uploadMeasurements = filtered;
        }
    }
    
    /**
     * Update global current measurement for adaptive warmup
     */
    updateCurrentMeasurement() {
        const currentDownload = this.getCurrentThroughput('download');
        const currentUpload = this.getCurrentThroughput('upload');
        
        // Update global variable that AdaptiveWarmup can access
        window.currentThroughputMeasurement = {
            download: currentDownload,
            upload: currentUpload,
            timestamp: performance.now()
        };
    }
    
    /**
     * Get current throughput for a direction
     * @param {string} direction - 'download' or 'upload'
     * @returns {number} Current throughput in Mbps
     */
    getCurrentThroughput(direction) {
        const measurements = direction === 'download' ? this.downloadMeasurements : this.uploadMeasurements;
        
        if (measurements.length === 0) return 0;
        
        // Calculate average of recent measurements (last 2 seconds)
        const now = performance.now();
        const recentWindow = 2000; // 2 seconds
        const recentMeasurements = measurements.filter(m => (now - m.timestamp) <= recentWindow);
        
        if (recentMeasurements.length === 0) return 0;
        
        const avgThroughput = recentMeasurements.reduce((sum, m) => sum + m.throughput, 0) / recentMeasurements.length;
        return avgThroughput;
    }
    
    /**
     * Get throughput statistics for a direction
     * @param {string} direction - 'download' or 'upload'
     * @returns {Object} Statistics object
     */
    getThroughputStats(direction) {
        const measurements = direction === 'download' ? this.downloadMeasurements : this.uploadMeasurements;
        
        if (measurements.length === 0) {
            return {
                current: 0,
                average: 0,
                max: 0,
                min: 0,
                count: 0
            };
        }
        
        const throughputs = measurements.map(m => m.throughput);
        const current = this.getCurrentThroughput(direction);
        const average = throughputs.reduce((sum, t) => sum + t, 0) / throughputs.length;
        const max = Math.max(...throughputs);
        const min = Math.min(...throughputs);
        
        return {
            current,
            average,
            max,
            min,
            count: measurements.length
        };
    }
    
    /**
     * Reset all measurements
     */
    reset() {
        this.downloadMeasurements = [];
        this.uploadMeasurements = [];
        
        // Clear global measurement
        window.currentThroughputMeasurement = {
            download: 0,
            upload: 0,
            timestamp: performance.now()
        };
        
        // ThroughputTracker: Reset all measurements
    }
}

// Create global instance
const throughputTracker = new ThroughputTracker();

// Initialize global measurement object
window.currentThroughputMeasurement = {
    download: 0,
    upload: 0,
    timestamp: performance.now()
};

export default throughputTracker;