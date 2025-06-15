/**
 * Results Module
 * Handles the analysis and display of test results
 * Now uses the shared results module system for consistent UI across test modes
 */

// Import shared modules
import {
    displayUnifiedResults,
    createSingleUserAdapter,
    cleanupResults
} from './shared/testResults.js';

import {
    determineGrade,
    determineBaselineGrade,
    calculateTotalGrade,
    calculateTotalGradeFromLatency
} from './shared/gradeCalculations.js';

import { telemetryManager } from './telemetry.js';

/**
 * Calculate percentile from an array of values
 * @param {Array} values - Array of numeric values
 * @param {number} percentile - Percentile to calculate (0-100)
 * @returns {number} The calculated percentile value
 */
function calculatePercentile(values, percentile) {
    if (!values || values.length === 0) return 0;
    
    // Sort the values
    const sorted = [...values].sort((a, b) => a - b);
    
    // Calculate the index
    const index = (percentile / 100) * (sorted.length - 1);
    
    // If index is an integer, return the value at that index
    if (Number.isInteger(index)) {
        return sorted[index];
    }
    
    // Otherwise, interpolate between the two nearest values
    const lowerIndex = Math.floor(index);
    const upperIndex = Math.ceil(index);
    const weight = index - lowerIndex;
    
    return sorted[lowerIndex] * (1 - weight) + sorted[upperIndex] * weight;
}

/**
 * Calculate statistics for an array of values
 * @param {Array} values - Array of numeric values
 * @returns {Object} Object containing statistics
 */
function calculateStats(values) {
    if (!values || values.length === 0) {
        return {
            median: 0,
            average: 0,
            p25: 0,
            p75: 0,
            p95: 0
        };
    }
    
    // Calculate average
    const sum = values.reduce((acc, val) => acc + val, 0);
    const average = sum / values.length;
    
    // Calculate percentiles
    const median = calculatePercentile(values, 50);
    const p25 = calculatePercentile(values, 25);
    const p75 = calculatePercentile(values, 75);
    const p95 = calculatePercentile(values, 95);
    
    return {
        median: median,
        average: average,
        p25: p25,
        p75: p75,
        p95: p95
    };
}

// Note: determineGrade and calculateTotalGrade functions are now imported from shared/gradeCalculations.js
// This eliminates duplicate code and ensures consistent grading across all test modes

/**
 * Analyze test results and display them using the shared results system
 * @param {Object} testData - Object containing test data
 */
async function analyzeAndDisplayResults(testData) {
    try {
        const {
            baselineLatency,
            downloadWarmupLatency,
            downloadLatency,
            uploadWarmupLatency,
            uploadLatency,
            bidirectionalLatency,
            downloadThroughput,
            uploadThroughput
        } = testData;
        
        // Calculate latency statistics for each phase
        const baselineStats = calculateStats(baselineLatency);
        const downloadWarmupStats = calculateStats(downloadWarmupLatency);
        const downloadStats = calculateStats(downloadLatency);
        const uploadWarmupStats = calculateStats(uploadWarmupLatency);
        const uploadStats = calculateStats(uploadLatency);
        const bidirectionalStats = calculateStats(bidirectionalLatency);
        
        // Calculate throughput statistics for download phase
        const downloadThroughputStats = calculateStats(
            Array.isArray(downloadThroughput) ?
            downloadThroughput :
            (downloadThroughput.download || [])
        );
        
        // Calculate throughput statistics for upload phase
        // Filter out zero values which can skew the median calculation
        const uploadData = Array.isArray(uploadThroughput) ?
            uploadThroughput :
            (uploadThroughput.upload || []);
        
        // Filter out zero or near-zero values that would skew the median
        const filteredUploadData = uploadData.filter(value => value > 0.1);
        
        // Use filtered data if available, otherwise use original data
        const uploadThroughputStats = calculateStats(
            filteredUploadData.length > 0 ? filteredUploadData : uploadData
        );
        
        // Calculate throughput statistics for bidirectional phase
        const bidiDownloadThroughputStats = calculateStats(
            Array.isArray(downloadThroughput) ?
            downloadThroughput :
            (downloadThroughput.bidirectional || [])
        );
        
        const bidiUploadData = Array.isArray(uploadThroughput) ?
            uploadThroughput :
            (uploadThroughput.bidirectional || []);
        
        // Filter out zero values for bidirectional upload
        const filteredBidiUploadData = bidiUploadData.filter(value => value > 0.1);
        
        // Use filtered data if available, otherwise use original data
        const bidiUploadThroughputStats = calculateStats(
            filteredBidiUploadData.length > 0 ? filteredBidiUploadData : bidiUploadData
        );
        
        // Calculate loaded latency values using average values from full test phases
        // Use only the full test phases (not warmup) for grading
        const downloadLoadedLatency = downloadStats.average;
        const uploadLoadedLatency = uploadStats.average;
        const bidirectionalLoadedLatency = bidirectionalStats.average;
        
        // Calculate latency increases for display purposes (still useful for user understanding)
        const downloadLatencyIncrease = downloadStats.average - baselineStats.average;
        const uploadLatencyIncrease = uploadStats.average - baselineStats.average;
        const bidirectionalLatencyIncrease = bidirectionalStats.average - baselineStats.average;
        
        // Determine the grades for each component using appropriate thresholds
        const baselineGrade = await determineBaselineGrade(baselineStats.average);
        const downloadGrade = await determineGrade(downloadLatencyIncrease);
        const uploadGrade = await determineGrade(uploadLatencyIncrease);
        const bidirectionalGrade = await determineGrade(bidirectionalLatencyIncrease);
        
        // Calculate Total Grade using new min(baseline, average_bloat) formula with latency increases
        const totalGrade = await calculateTotalGradeFromLatency(baselineStats.average, downloadLatencyIncrease, uploadLatencyIncrease, bidirectionalLatencyIncrease);
        
        // Transform to unified format using adapter
        const adapter = createSingleUserAdapter();
        const unifiedData = adapter.transform({
            baselineGrade,
            downloadGrade,
            uploadGrade,
            bidirectionalGrade,
            totalGrade,
            downloadLatencyIncrease,
            uploadLatencyIncrease,
            bidirectionalLatencyIncrease,
            baselineStats,
            downloadStats,
            uploadStats,
            bidirectionalStats,
            downloadThroughputStats,
            uploadThroughputStats,
            bidiDownloadThroughputStats,
            bidiUploadThroughputStats
        });
        
        // Display using shared results system
        displayUnifiedResults(unifiedData, 'results', {
            showStatistics: true,
            showExplanation: true,
            showShareButton: true,
            enableCelebrations: true,
            enableTooltips: true
        });
        
        console.log('✅ Single User Test results displayed using shared module system');
        
        // Submit telemetry data
        const telemetryData = {
            testType: 'single',
            grades: {
                baseline: baselineGrade,
                download: downloadGrade,
                upload: uploadGrade,
                bidirectional: bidirectionalGrade,
                overall: totalGrade
            },
            baselineLatency: baselineStats.average,
            downloadLoadedLatency: Math.round(downloadLoadedLatency),
            uploadLoadedLatency: Math.round(uploadLoadedLatency),
            bidirectionalLoadedLatency: Math.round(bidirectionalLoadedLatency),
            // Keep legacy fields for compatibility - ensure non-negative values
            downloadLatencyIncrease: Math.round(Math.max(0, downloadLatencyIncrease)),
            uploadLatencyIncrease: Math.round(Math.max(0, uploadLatencyIncrease)),
            bidirectionalLatencyIncrease: Math.round(Math.max(0, bidirectionalLatencyIncrease)),
            downloadThroughput: Math.round(downloadThroughputStats.median * 10) / 10,
            uploadThroughput: Math.round(uploadThroughputStats.median * 10) / 10,
            testDuration: 40 // Standard test duration
        };
        
        telemetryManager.submitResults(telemetryData).then(result => {
            console.log('Telemetry submission result:', result);
        }).catch(error => {
            console.error('Telemetry submission error:', error);
        });
        
    } catch (error) {
        console.error('Error analyzing and displaying results:', error);
        
        // Fallback to basic error display
        const resultsContainer = document.getElementById('results');
        if (resultsContainer) {
            resultsContainer.innerHTML = `
                <div class="error-message">
                    <h3>⚠️ Error</h3>
                    <p>Unable to display test results. Please try running the test again.</p>
                </div>
            `;
            resultsContainer.classList.remove('hidden');
            resultsContainer.style.display = 'block';
        }
    }
}

// Legacy functions removed - now handled by shared module system
// All UI display, celebration effects, tooltips, and statistics are managed by:
// - client/shared/testResults.js (main orchestrator)
// - client/shared/celebrationEffects.js (confetti, sparkles, animations)
// - client/shared/interactiveTooltips.js (hover tooltips)
// - client/shared/shareSystem.js (PNG generation and sharing)

export { analyzeAndDisplayResults };