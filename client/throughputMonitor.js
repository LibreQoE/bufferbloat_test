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
        
        // Enhanced cumulative tracking across phase transitions
        this.sessionCumulativeDownload = 0;
        this.sessionCumulativeUpload = 0;
        this.phaseTransitionHistory = [];
        
        // Stream-level monitoring
        this.streamLevelTracking = new Map();
        this.lastStreamSnapshot = { download: new Map(), upload: new Map() };
        
        // Measurement window for resilient calculations
        this.measurementWindow = [];
        this.maxWindowSize = 10; // Keep last 10 measurements
        
        // Smoothing factors
        this.downloadSmoothingFactor = 0.7; // Higher values = more smoothing (0-1)
        this.uploadSmoothingFactor = 0.8; // More aggressive smoothing for upload
        
        // Smoothed values
        this.smoothedDownloadThroughput = 0;
        this.smoothedUploadThroughput = 0;
        
        // Fallback measurement tracking
        this.fallbackMeasurements = {
            download: { lastValidMeasurement: 0, consecutiveFailures: 0 },
            upload: { lastValidMeasurement: 0, consecutiveFailures: 0 }
        };
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
        
        // Enhanced reset - preserve session tracking
        this.sessionCumulativeDownload = 0;
        this.sessionCumulativeUpload = 0;
        this.phaseTransitionHistory = [];
        this.streamLevelTracking.clear();
        this.lastStreamSnapshot = { download: new Map(), upload: new Map() };
        this.measurementWindow = [];
        
        // Reset fallback tracking
        this.fallbackMeasurements = {
            download: { lastValidMeasurement: 0, consecutiveFailures: 0 },
            upload: { lastValidMeasurement: 0, consecutiveFailures: 0 }
        };
        
        // 🔧 FIX: Track last reset time to coordinate with saturation.js
        this.lastResetTime = Date.now();
    }
    
    /**
     * Measure throughput with enhanced resilience
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
        
        // Create measurement record
        const measurement = {
            timestamp: now,
            elapsedTime,
            downloadThroughput,
            uploadThroughput,
            phase: currentPhase,
            sessionDownloadBytes: this.sessionCumulativeDownload,
            sessionUploadBytes: this.sessionCumulativeUpload,
            activeStreams: {
                download: StreamManager.streams.download.size,
                upload: StreamManager.streams.upload.size
            },
            isValid: downloadThroughput > 0 || uploadThroughput > 0
        };
        
        // Add to measurement window
        this.measurementWindow.push(measurement);
        if (this.measurementWindow.length > this.maxWindowSize) {
            this.measurementWindow.shift();
        }
        
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
        
        // Store measurements - always store to maintain timeline continuity
        this.downloadData.push({
            time: elapsedTime,
            value: downloadThroughput,
            smoothedValue: this.smoothedDownloadThroughput,
            phase: currentPhase,
            isOutOfPhase: isDownloadOutOfPhase,
            sessionBytes: this.sessionCumulativeDownload,
            activeStreams: measurement.activeStreams.download,
            isInterpolated: downloadThroughput === 0 && this.fallbackMeasurements.download.consecutiveFailures > 3
        });
        
        this.uploadData.push({
            time: elapsedTime,
            value: uploadThroughput,
            smoothedValue: this.smoothedUploadThroughput,
            phase: currentPhase,
            isOutOfPhase: isUploadOutOfPhase,
            sessionBytes: this.sessionCumulativeUpload,
            activeStreams: measurement.activeStreams.upload,
            isInterpolated: uploadThroughput === 0 && this.fallbackMeasurements.upload.consecutiveFailures > 3
        });
        
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
     * Calculate download throughput with enhanced tracking
     * @param {number} timeDelta - Time delta in seconds
     * @returns {number} Throughput in Mbps
     */
    calculateDownloadThroughput(timeDelta) {
        const currentPhase = window.currentTestPhase || 'unknown';
        
        // Stream-level monitoring for resilient tracking
        const currentStreamSnapshot = new Map();
        let totalBytesReceived = 0;
        
        // Collect current stream data
        StreamManager.streams.download.forEach((stream, streamId) => {
            const streamBytes = stream.bytesReceived || 0;
            currentStreamSnapshot.set(streamId, streamBytes);
            totalBytesReceived += streamBytes;
        });
        
        // Calculate delta using stream-level tracking
        let bytesReceivedDelta = 0;
        
        // For each active stream, calculate its contribution
        currentStreamSnapshot.forEach((currentBytes, streamId) => {
            const previousBytes = this.lastStreamSnapshot.download.get(streamId) || 0;
            const streamDelta = Math.max(0, currentBytes - previousBytes);
            bytesReceivedDelta += streamDelta;
            
            // Update stream tracking
            if (!this.streamLevelTracking.has(streamId)) {
                this.streamLevelTracking.set(streamId, {
                    type: 'download',
                    totalBytes: 0,
                    createdAt: performance.now()
                });
            }
            this.streamLevelTracking.get(streamId).totalBytes += streamDelta;
        });
        
        // Handle phase transitions gracefully
        if (this.lastPhase && this.lastPhase !== currentPhase) {
            logWithLevel('INFO', `📊 Phase transition: ${this.lastPhase} → ${currentPhase}`);
            
            // Record phase transition
            this.phaseTransitionHistory.push({
                fromPhase: this.lastPhase,
                toPhase: currentPhase,
                timestamp: performance.now(),
                sessionDownloadBytes: this.sessionCumulativeDownload,
                sessionUploadBytes: this.sessionCumulativeUpload
            });
            
            // Don't reset counters - maintain continuity
            logWithLevel('INFO', `📊 Maintaining continuous tracking across phase transition`);
        }
        
        // Update session cumulative tracking
        this.sessionCumulativeDownload += bytesReceivedDelta;
        this.cumulativeBytesReceived = totalBytesReceived;
        this.lastPhase = currentPhase;
        
        // Update stream snapshot
        this.lastStreamSnapshot.download = new Map(currentStreamSnapshot);
        
        // Calculate throughput
        const throughput = (bytesReceivedDelta * 8) / (timeDelta * 1000000);
        
        // Fallback measurement tracking
        if (throughput > 0) {
            this.fallbackMeasurements.download.lastValidMeasurement = throughput;
            this.fallbackMeasurements.download.consecutiveFailures = 0;
        } else {
            this.fallbackMeasurements.download.consecutiveFailures++;
            
            // During severe bufferbloat, use last valid measurement with decay
            if (this.fallbackMeasurements.download.consecutiveFailures > 3 && 
                this.fallbackMeasurements.download.lastValidMeasurement > 0) {
                const decayFactor = Math.max(0.1, 1 - (this.fallbackMeasurements.download.consecutiveFailures * 0.1));
                return this.fallbackMeasurements.download.lastValidMeasurement * decayFactor;
            }
        }
        
        return throughput;
    }
    
    /**
     * Calculate upload throughput with enhanced tracking
     * @param {number} timeDelta - Time delta in seconds
     * @returns {number} Throughput in Mbps
     */
    calculateUploadThroughput(timeDelta) {
        const currentPhase = window.currentTestPhase || 'unknown';
        
        // Stream-level monitoring for resilient tracking
        const currentStreamSnapshot = new Map();
        let totalBytesSent = 0;
        let streamCount = 0;
        
        // Collect current stream data
        StreamManager.streams.upload.forEach((stream, streamId) => {
            const streamBytes = stream.bytesSent || 0;
            currentStreamSnapshot.set(streamId, streamBytes);
            totalBytesSent += streamBytes;
            streamCount++;
        });
        
        // Calculate delta using stream-level tracking
        let bytesSentDelta = 0;
        
        // For each active stream, calculate its contribution
        currentStreamSnapshot.forEach((currentBytes, streamId) => {
            const previousBytes = this.lastStreamSnapshot.upload.get(streamId) || 0;
            const streamDelta = Math.max(0, currentBytes - previousBytes);
            bytesSentDelta += streamDelta;
            
            // Update stream tracking
            if (!this.streamLevelTracking.has(streamId)) {
                this.streamLevelTracking.set(streamId, {
                    type: 'upload',
                    totalBytes: 0,
                    createdAt: performance.now()
                });
            }
            this.streamLevelTracking.get(streamId).totalBytes += streamDelta;
        });
        
        // Handle phase transitions gracefully
        if (this.lastUploadPhase && this.lastUploadPhase !== currentPhase) {
            logWithLevel('INFO', `📊 Upload phase transition: ${this.lastUploadPhase} → ${currentPhase}`);
            // Don't reset counters - maintain continuity
        }
        
        // Update session cumulative tracking
        this.sessionCumulativeUpload += bytesSentDelta;
        this.cumulativeBytesSent = totalBytesSent;
        this.lastUploadPhase = currentPhase;
        
        // Update stream snapshot
        this.lastStreamSnapshot.upload = new Map(currentStreamSnapshot);
        
        // Calculate throughput
        const throughput = (bytesSentDelta * 8) / (timeDelta * 1000000);
        
        // Fallback measurement tracking
        if (throughput > 0) {
            this.fallbackMeasurements.upload.lastValidMeasurement = throughput;
            this.fallbackMeasurements.upload.consecutiveFailures = 0;
        } else {
            this.fallbackMeasurements.upload.consecutiveFailures++;
            
            // During severe bufferbloat, use last valid measurement with decay
            if (this.fallbackMeasurements.upload.consecutiveFailures > 3 && 
                this.fallbackMeasurements.upload.lastValidMeasurement > 0) {
                const decayFactor = Math.max(0.1, 1 - (this.fallbackMeasurements.upload.consecutiveFailures * 0.1));
                return this.fallbackMeasurements.upload.lastValidMeasurement * decayFactor;
            }
        }
        
        // Log detailed throughput calculation at DEBUG level
        logWithLevel('DEBUG', `Upload throughput: ${bytesSentDelta} bytes in ${timeDelta.toFixed(3)}s = ${throughput.toFixed(2)} Mbps (${streamCount} streams)`);
        
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
