/**
 * Throughput Monitor
 * Tracks and reports network throughput
 */

import StreamManager from './streamManager.js';
import { logWithLevel } from './config.js';

/**
 * Throughput Monitor class
 * Measures and reports network throughput
 */
class ThroughputMonitor {
    constructor() {
        this.downloadData = [];
        this.uploadData = [];
        this.measurementInterval = 500; // ms
        this.timer = null;
        this.lastMeasurementTime = 0;
        this.cumulativeBytesReceived = 0;
        this.cumulativeBytesSent = 0;
        this.testStartTime = 0;
        
        // Smoothing factors
        this.downloadSmoothingFactor = 0.7; // Higher values = more smoothing (0-1)
        this.uploadSmoothingFactor = 0.8; // More aggressive smoothing for upload
        
        // Smoothed values
        this.smoothedDownloadThroughput = 0;
        this.smoothedUploadThroughput = 0;
    }
    
    /**
     * Start the throughput monitor
     * @param {number} startTime - The test start time
     */
    start(startTime) {
        this.testStartTime = startTime || performance.now();
        this.lastMeasurementTime = this.testStartTime;
        
        if (this.timer) this.stop();
        
        this.timer = setInterval(() => this.measure(), this.measurementInterval);
    }
    
    /**
     * Stop the throughput monitor
     */
    stop() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }
    
    /**
     * Reset the throughput monitor
     */
    reset() {
        this.stop();
        this.downloadData = [];
        this.uploadData = [];
        this.cumulativeBytesReceived = 0;
        this.cumulativeBytesSent = 0;
        this.smoothedDownloadThroughput = 0;
        this.smoothedUploadThroughput = 0;
        
        // 🔧 FIX: Track last reset time to coordinate with saturation.js
        this.lastResetTime = Date.now();
    }
    
    /**
     * Measure throughput
     */
    measure() {
        const now = performance.now();
        const elapsedTime = (now - this.testStartTime) / 1000; // seconds
        const timeDelta = (now - this.lastMeasurementTime) / 1000; // seconds
        
        // Get current phase
        const currentPhase = window.currentTestPhase || 'unknown';
        
        // Calculate download throughput
        const downloadThroughput = this.calculateDownloadThroughput(timeDelta);
        
        // Calculate upload throughput
        const uploadThroughput = this.calculateUploadThroughput(timeDelta);
        
        // Apply smoothing
        this.smoothedDownloadThroughput = this.applySmoothing(
            this.smoothedDownloadThroughput, 
            downloadThroughput, 
            this.downloadSmoothingFactor
        );
        
        this.smoothedUploadThroughput = this.applySmoothing(
            this.smoothedUploadThroughput, 
            uploadThroughput, 
            this.uploadSmoothingFactor
        );
        
        // Determine if traffic is out of phase
        const isDownloadOutOfPhase = this.isTrafficOutOfPhase('download', currentPhase);
        const isUploadOutOfPhase = this.isTrafficOutOfPhase('upload', currentPhase);
        
        // Store measurements
        if (downloadThroughput > 0) {
            this.downloadData.push({
                time: elapsedTime,
                value: downloadThroughput,
                smoothedValue: this.smoothedDownloadThroughput,
                phase: currentPhase,
                isOutOfPhase: isDownloadOutOfPhase
            });
        }
        
        if (uploadThroughput > 0) {
            this.uploadData.push({
                time: elapsedTime,
                value: uploadThroughput,
                smoothedValue: this.smoothedUploadThroughput,
                phase: currentPhase,
                isOutOfPhase: isUploadOutOfPhase
            });
        }
        
        // Update last measurement time
        this.lastMeasurementTime = now;
        
        // Dispatch throughput events
        this.dispatchThroughputEvents(
            downloadThroughput, 
            uploadThroughput, 
            this.smoothedDownloadThroughput,
            this.smoothedUploadThroughput,
            elapsedTime, 
            currentPhase
        );
    }
    
    /**
     * Apply exponential smoothing to a value
     * @param {number} previousValue - The previous smoothed value
     * @param {number} currentValue - The current raw value
     * @param {number} factor - The smoothing factor (0-1)
     * @returns {number} The smoothed value
     */
    applySmoothing(previousValue, currentValue, factor) {
        if (previousValue === 0) return currentValue;
        return (factor * previousValue) + ((1 - factor) * currentValue);
    }
    
    /**
     * Calculate download throughput
     * @param {number} timeDelta - Time delta in seconds
     * @returns {number} Throughput in Mbps
     */
    calculateDownloadThroughput(timeDelta) {
        // Calculate bytes received since last measurement
        let bytesReceived = 0;
        
        // Sum bytes received from all download streams
        StreamManager.streams.download.forEach(stream => {
            bytesReceived += stream.bytesReceived || 0;
        });
        
        // Calculate delta from last measurement
        let bytesReceivedDelta = bytesReceived - this.cumulativeBytesReceived;
        
        // 🔧 FIX: Handle byte counter resets (negative deltas) for download
        if (bytesReceivedDelta < 0) {
            console.warn(`🔧 DOWNLOAD BYTE COUNTER RESET DETECTED:`);
            console.warn(`  Current bytesReceived: ${bytesReceived}`);
            console.warn(`  Previous cumulativeBytesReceived: ${this.cumulativeBytesReceived}`);
            console.warn(`  Negative delta: ${bytesReceivedDelta}`);
            console.warn(`  Using current bytesReceived as delta to handle reset`);
            
            // When a reset occurs, use the current bytesReceived as the delta
            bytesReceivedDelta = bytesReceived;
        }
        
        this.cumulativeBytesReceived = bytesReceived;
        
        // Calculate throughput in Mbps
        // bytes to bits (x8) and then to Mbps (/1000000)
        return (bytesReceivedDelta * 8) / (timeDelta * 1000000);
    }
    
    /**
     * Calculate upload throughput
     * @param {number} timeDelta - Time delta in seconds
     * @returns {number} Throughput in Mbps
     */
    calculateUploadThroughput(timeDelta) {
        // Calculate bytes sent since last measurement
        let bytesSent = 0;
        let streamCount = 0;
        
        // Sum bytes sent from all upload streams
        StreamManager.streams.upload.forEach(stream => {
            const streamBytes = stream.bytesSent || 0;
            bytesSent += streamBytes;
            streamCount++;
            console.log(`Upload stream ${stream.id}: ${streamBytes} bytes sent`);
        });
        
        // Calculate delta from last measurement
        let bytesSentDelta = bytesSent - this.cumulativeBytesSent;
        
        // 🔧 FIX: Handle byte counter resets (negative deltas)
        if (bytesSentDelta < 0) {
            console.warn(`🔧 BYTE COUNTER RESET DETECTED:`);
            console.warn(`  Current bytesSent: ${bytesSent}`);
            console.warn(`  Previous cumulativeBytesSent: ${this.cumulativeBytesSent}`);
            console.warn(`  Negative delta: ${bytesSentDelta}`);
            console.warn(`  Current phase: ${window.currentTestPhase}`);
            console.warn(`  Active upload streams: ${streamCount}`);
            console.warn(`  Using current bytesSent as delta to handle reset`);
            
            // When a reset occurs, use the current bytesSent as the delta
            // This assumes the counter was reset to 0 and then accumulated to bytesSent
            bytesSentDelta = bytesSent;
        }
        
        this.cumulativeBytesSent = bytesSent;
        
        // Calculate throughput in Mbps
        // bytes to bits (x8) and then to Mbps (/1000000)
        const throughput = (bytesSentDelta * 8) / (timeDelta * 1000000);
        
        // Log detailed throughput calculation at DEBUG level
        logWithLevel('DEBUG', `Upload throughput calculation: ${bytesSentDelta} bytes in ${timeDelta.toFixed(3)}s = ${throughput.toFixed(2)} Mbps (${streamCount} active streams)`);
        
        return throughput;
    }
    
    /**
     * Determine if traffic is out of phase
     * @param {string} trafficType - The traffic type ('download' or 'upload')
     * @param {string} currentPhase - The current phase
     * @returns {boolean} True if traffic is out of phase
     */
    isTrafficOutOfPhase(trafficType, currentPhase) {
        // Determine if traffic is expected in the current phase
        switch (currentPhase) {
            case 'baseline':
                // No traffic expected
                return true;
                
            case 'download_warmup':
            case 'download':
                // Only download traffic expected
                return trafficType === 'upload';
                
            case 'upload_warmup':
            case 'upload':
                // Only upload traffic expected
                return trafficType === 'download';
                
            case 'bidirectional':
                // Both traffic types expected
                return false;
                
            default:
                // No traffic expected after test completion
                return true;
        }
    }
    
    /**
     * Dispatch throughput events
     * @param {number} downloadThroughput - Download throughput in Mbps
     * @param {number} uploadThroughput - Upload throughput in Mbps
     * @param {number} smoothedDownloadThroughput - Smoothed download throughput in Mbps
     * @param {number} smoothedUploadThroughput - Smoothed upload throughput in Mbps
     * @param {number} elapsedTime - Elapsed time in seconds
     * @param {string} phase - Current phase
     */
    dispatchThroughputEvents(
        downloadThroughput, 
        uploadThroughput, 
        smoothedDownloadThroughput,
        smoothedUploadThroughput,
        elapsedTime, 
        phase
    ) {
        // Dispatch download throughput event
        if (downloadThroughput > 0) {
            window.dispatchEvent(new CustomEvent('throughput:download', {
                detail: {
                    throughput: downloadThroughput,
                    smoothedThroughput: smoothedDownloadThroughput,
                    time: elapsedTime,
                    phase: phase,
                    isOutOfPhase: this.isTrafficOutOfPhase('download', phase)
                }
            }));
        }
        
        // Dispatch upload throughput event
        if (uploadThroughput > 0) {
            window.dispatchEvent(new CustomEvent('throughput:upload', {
                detail: {
                    throughput: uploadThroughput,
                    smoothedThroughput: smoothedUploadThroughput,
                    time: elapsedTime,
                    phase: phase,
                    isOutOfPhase: this.isTrafficOutOfPhase('upload', phase)
                }
            }));
        }
    }
    
    /**
     * Get download throughput data
     * @returns {Array} Download throughput data
     */
    getDownloadThroughputData() {
        return this.downloadData;
    }
    
    /**
     * Get upload throughput data
     * @returns {Array} Upload throughput data
     */
    getUploadThroughputData() {
        return this.uploadData;
    }
    
    /**
     * Get the latest download throughput
     * @returns {number} The latest download throughput in Mbps
     */
    getLatestDownloadThroughput() {
        if (this.downloadData.length === 0) return 0;
        return this.downloadData[this.downloadData.length - 1].smoothedValue;
    }
    
    /**
     * Get the latest upload throughput
     * @returns {number} The latest upload throughput in Mbps
     */
    getLatestUploadThroughput() {
        if (this.uploadData.length === 0) return 0;
        return this.uploadData[this.uploadData.length - 1].smoothedValue;
    }
}

// Create a singleton instance
const throughputMonitor = new ThroughputMonitor();

export default throughputMonitor;

// Export individual functions for convenience
export const startThroughputMonitor = (startTime) => throughputMonitor.start(startTime);
export const stopThroughputMonitor = () => throughputMonitor.stop();
export const resetThroughputMonitor = () => throughputMonitor.reset();
export const getDownloadThroughputData = () => throughputMonitor.getDownloadThroughputData();
export const getUploadThroughputData = () => throughputMonitor.getUploadThroughputData();
export const getLatestDownloadThroughput = () => throughputMonitor.getLatestDownloadThroughput();
export const getLatestUploadThroughput = () => throughputMonitor.getLatestUploadThroughput();