/**
 * Result Adapters Module
 * Transforms different test result formats into a unified interface
 * Supports both Single User Test and Virtual Household Test data
 */

import { 
    gradeToClass, 
    convertGradeToPercent, 
    getPerformanceDescription 
} from './gradeCalculations.js';

/**
 * Create adapter for Single User Test data
 * @returns {SingleUserAdapter}
 */
export function createSingleUserAdapter() {
    return new SingleUserAdapter();
}

/**
 * Create adapter for Virtual Household Test data
 * @returns {VirtualHouseholdAdapter}
 */
export function createVirtualHouseholdAdapter() {
    return new VirtualHouseholdAdapter();
}

/**
 * Single User Test data adapter
 */
class SingleUserAdapter {
    /**
     * Transform Single User test data to unified format
     * @param {Object} singleUserData - Original Single User test data
     * @returns {Object} Unified result data
     */
    transform(singleUserData) {
        const {
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
        } = singleUserData;

        return {
            totalGrade: {
                grade: totalGrade.grade,
                cssClass: totalGrade.cssClass,
                description: this.generateTotalGradeDescription(totalGrade.grade),
                showApproved: ['A+', 'A'].includes(totalGrade.grade)
            },
            phases: [
                {
                    id: 'download',
                    name: 'Download',
                    grade: downloadGrade.grade,
                    cssClass: downloadGrade.cssClass,
                    metric: `+${Math.max(0, downloadLatencyIncrease).toFixed(1)}ms`,
                    tooltip: {
                        header: `Download Grade: ${downloadGrade.grade}`,
                        content: `Latency increased by ${Math.max(0, downloadLatencyIncrease).toFixed(1)}ms under load — ${getPerformanceDescription(downloadGrade.grade)}`
                    },
                    showInShareImage: true
                },
                {
                    id: 'upload',
                    name: 'Upload',
                    grade: uploadGrade.grade,
                    cssClass: uploadGrade.cssClass,
                    metric: `+${Math.max(0, uploadLatencyIncrease).toFixed(1)}ms`,
                    tooltip: {
                        header: `Upload Grade: ${uploadGrade.grade}`,
                        content: `Latency increased by ${Math.max(0, uploadLatencyIncrease).toFixed(1)}ms under load — ${getPerformanceDescription(uploadGrade.grade)}`
                    },
                    showInShareImage: true
                },
                {
                    id: 'bidirectional',
                    name: 'Bidirectional',
                    grade: bidirectionalGrade.grade,
                    cssClass: bidirectionalGrade.cssClass,
                    metric: `+${Math.max(0, bidirectionalLatencyIncrease).toFixed(1)}ms`,
                    tooltip: {
                        header: `Bidirectional Grade: ${bidirectionalGrade.grade}`,
                        content: `Latency increased by ${Math.max(0, bidirectionalLatencyIncrease).toFixed(1)}ms under load — ${getPerformanceDescription(bidirectionalGrade.grade)}`
                    },
                    showInShareImage: true
                }
            ],
            statistics: {
                latency: this.transformLatencyStats(baselineStats, downloadStats, uploadStats, bidirectionalStats),
                throughput: this.transformThroughputStats(downloadThroughputStats, uploadThroughputStats, bidiDownloadThroughputStats, bidiUploadThroughputStats)
            },
            metadata: {
                testType: 'single-user',
                timestamp: new Date(),
                shareTitle: 'My Bufferbloat Test Results',
                explanationContent: this.getSingleUserExplanation()
            }
        };
    }

    /**
     * Transform latency statistics for display
     */
    transformLatencyStats(baselineStats, downloadStats, uploadStats, bidirectionalStats) {
        return [
            { phase: 'Baseline', ...baselineStats },
            { phase: 'Download', ...downloadStats },
            { phase: 'Upload', ...uploadStats },
            { phase: 'Bidirectional', ...bidirectionalStats }
        ];
    }

    /**
     * Transform throughput statistics for display
     */
    transformThroughputStats(downloadStats, uploadStats, bidiDownloadStats, bidiUploadStats) {
        return [
            { phase: 'Download', ...downloadStats },
            { phase: 'Upload', ...uploadStats },
            { phase: 'Bidi Download', ...bidiDownloadStats },
            { phase: 'Bidi Upload', ...bidiUploadStats }
        ];
    }

    /**
     * Generate total grade description
     */
    generateTotalGradeDescription(grade) {
        switch (grade) {
            case 'A+':
                return 'exceptional overall bufferbloat performance across all test phases!';
            case 'A':
                return 'excellent overall bufferbloat performance across all test phases!';
            case 'B':
                return 'good overall bufferbloat performance across all test phases.';
            case 'C':
                return 'fair overall bufferbloat performance across all test phases.';
            case 'D':
                return 'poor overall bufferbloat performance across all test phases.';
            case 'F':
                return 'very poor overall bufferbloat performance across all test phases.';
            default:
                return 'overall bufferbloat performance measured.';
        }
    }

    /**
     * Get Single User explanation content
     */
    getSingleUserExplanation() {
        return `
            <h3>What Do My Results Mean?</h3>
            <p>Your bufferbloat test measures how much extra latency (delay) is added to your internet connection when it's under heavy load.</p>
            <ul>
                <li><strong>Download Phase:</strong> Tests latency increase during heavy downloading</li>
                <li><strong>Upload Phase:</strong> Tests latency increase during heavy uploading</li>
                <li><strong>Bidirectional Phase:</strong> Tests latency increase during simultaneous download and upload</li>
            </ul>
            <p>Lower latency increases mean better performance for real-time applications like gaming, video calls, and streaming.</p>
        `;
    }
}

/**
 * Virtual Household Test data adapter
 */
class VirtualHouseholdAdapter {
    /**
     * Transform Virtual Household test data to unified format
     * @param {Object} householdData - Original Virtual Household test data
     * @returns {Object} Unified result data
     */
    transform(householdData) {
        const overall = householdData.overall || {};

        return {
            totalGrade: {
                grade: overall.overallGrade || 'F',
                cssClass: gradeToClass(overall.overallGrade || 'F'),
                description: this.generateHouseholdGradeDescription(overall.overallGrade || 'F'),
                showApproved: ['A+', 'A'].includes(overall.overallGrade || 'F')
            },
            phases: [
                {
                    id: 'fairness',
                    name: 'Network Fairness',
                    grade: overall.fairness || 'F',
                    cssClass: gradeToClass(overall.fairness || 'F'),
                    metric: convertGradeToPercent(overall.fairness || 'F') + '%',
                    tooltip: {
                        header: `Network Fairness: ${overall.fairness || 'F'}`,
                        content: `How fairly bandwidth is distributed among household users — ${this.getFairnessDescription(overall.fairness || 'F')}`
                    },
                    showInShareImage: true
                },
                {
                    id: 'stability',
                    name: 'Latency Stability',
                    grade: overall.stability || 'F',
                    cssClass: gradeToClass(overall.stability || 'F'),
                    metric: convertGradeToPercent(overall.stability || 'F') + '%',
                    tooltip: {
                        header: `Latency Stability: ${overall.stability || 'F'}`,
                        content: `How consistent latency remains under household load — ${this.getStabilityDescription(overall.stability || 'F')}`
                    },
                    showInShareImage: true
                }
            ],
            statistics: {
                custom: this.transformHouseholdStats(householdData)
            },
            metadata: {
                testType: 'virtual-household',
                timestamp: new Date(),
                shareTitle: 'My Virtual Household Test Results',
                explanationContent: this.getHouseholdExplanation()
            },
            userResults: this.transformUserResults(householdData.users || {}),
            recommendations: householdData.recommendations || []
        };
    }

    /**
     * Generate household grade description
     */
    generateHouseholdGradeDescription(grade) {
        switch (grade) {
            case 'A+':
                return 'exceptional network performance for your virtual household!';
            case 'A':
                return 'excellent network performance for your virtual household!';
            case 'B':
                return 'good network performance for your virtual household.';
            case 'C':
                return 'fair network performance for your virtual household.';
            case 'D':
                return 'poor network performance for your virtual household.';
            case 'F':
                return 'very poor network performance for your virtual household.';
            default:
                return 'network performance measured for your virtual household.';
        }
    }

    /**
     * Get fairness description
     */
    getFairnessDescription(grade) {
        switch (grade) {
            case 'A+':
            case 'A':
                return 'excellent bandwidth sharing among all users!';
            case 'B':
                return 'good bandwidth sharing with minor inequalities.';
            case 'C':
                return 'fair bandwidth sharing with some users getting less.';
            case 'D':
                return 'poor bandwidth sharing with significant inequalities.';
            case 'F':
                return 'very poor bandwidth sharing with major inequalities.';
            default:
                return 'bandwidth sharing measured.';
        }
    }

    /**
     * Get stability description
     */
    getStabilityDescription(grade) {
        switch (grade) {
            case 'A+':
            case 'A':
                return 'excellent latency consistency under load!';
            case 'B':
                return 'good latency consistency with minor variations.';
            case 'C':
                return 'fair latency consistency with some fluctuations.';
            case 'D':
                return 'poor latency consistency with significant variations.';
            case 'F':
                return 'very poor latency consistency with major fluctuations.';
            default:
                return 'latency consistency measured.';
        }
    }

    /**
     * Transform household statistics
     */
    transformHouseholdStats(householdData) {
        const stats = [];
        const overall = householdData.overall || {};

        if (overall.fairness) {
            stats.push({
                label: 'Network Fairness',
                value: `${convertGradeToPercent(overall.fairness)}%`,
                description: 'How evenly bandwidth is shared'
            });
        }

        if (overall.stability) {
            stats.push({
                label: 'Latency Stability',
                value: `${convertGradeToPercent(overall.stability)}%`,
                description: 'How consistent latency remains'
            });
        }

        return stats;
    }

    /**
     * Transform user results
     */
    transformUserResults(users) {
        return Object.entries(users).map(([userId, userData]) => ({
            userId,
            grade: userData.grade || 'F',
            description: userData.description || 'No description available',
            metrics: userData.metrics || {}
        }));
    }

    /**
     * Get household explanation content
     */
    getHouseholdExplanation() {
        return `
            <h3>What Do My Virtual Household Results Mean?</h3>
            <p>Your virtual household test simulates multiple users with different internet usage patterns to evaluate your network's performance under realistic load.</p>
            <ul>
                <li><strong>Network Fairness:</strong> How evenly bandwidth is distributed among different users and applications</li>
                <li><strong>Latency Stability:</strong> How consistent response times remain when multiple users are active</li>
            </ul>
            <p>Better scores indicate your network can handle multiple users effectively without degrading performance for any individual user.</p>
        `;
    }
}