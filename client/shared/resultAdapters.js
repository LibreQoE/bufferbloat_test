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
                    id: 'baseline',
                    name: 'Baseline',
                    grade: baselineGrade.grade,
                    cssClass: baselineGrade.cssClass,
                    metric: `${baselineStats.average.toFixed(1)}ms`,
                    tooltip: {
                        header: `Baseline Grade: ${baselineGrade.grade}`,
                        content: `Baseline latency is ${baselineStats.average.toFixed(1)}ms — ${getPerformanceDescription(baselineGrade.grade)}`
                    },
                    showInShareImage: true
                },
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
                return 'exceptional baseline latency and bufferbloat performance!';
            case 'A':
                return 'excellent baseline latency and bufferbloat performance!';
            case 'B':
                return 'good baseline latency and bufferbloat performance.';
            case 'C':
                return 'fair baseline latency and bufferbloat performance.';
            case 'D':
                return 'poor baseline latency and bufferbloat performance.';
            case 'F':
                return 'very poor baseline latency and bufferbloat performance.';
            default:
                return 'baseline latency and bufferbloat performance measured.';
        }
    }

    /**
     * Get Single User explanation content
     */
    getSingleUserExplanation() {
        return `
            <div class="explanation-intro">
                <p>Your bufferbloat grade shows how much extra latency (delay) your connection adds when under heavy load. Lower latency increase = better grade.</p>
            </div>
            
            <!-- How Scores Are Calculated -->
            <div class="calculation-explanation-section">
                <h4>How Your Scores Are Calculated</h4>
                <p><strong>Latency Measurement:</strong> We measure your baseline latency (idle connection), then measure latency again during heavy network load to calculate the increase.</p>
                <div class="calculation-details">
                    <p><strong>Test Phases:</strong></p>
                    <ul>
                        <li><strong>Download Phase:</strong> Saturates your download bandwidth while measuring latency increase</li>
                        <li><strong>Upload Phase:</strong> Saturates your upload bandwidth while measuring latency increase</li>
                        <li><strong>Bidirectional Phase:</strong> Saturates both download and upload simultaneously</li>
                    </ul>
                    <p><strong>Grade Calculation:</strong> Based on latency increase in milliseconds:</p>
                    <div class="grade-calculation-table">
                        <table class="calculation-table">
                            <thead>
                                <tr>
                                    <th>Latency Value</th>
                                    <th>Grade</th>
                                    <th>Description</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr class="grade-row a-plus">
                                    <td>&lt; 50 ms</td>
                                    <td><span class="grade-badge-small a-plus">A+</span></td>
                                    <td>Excellent - Virtually no bufferbloat</td>
                                </tr>
                                <tr class="grade-row a">
                                    <td>50-90 ms</td>
                                    <td><span class="grade-badge-small a">A</span></td>
                                    <td>Very Good - Minimal bufferbloat</td>
                                </tr>
                                <tr class="grade-row b">
                                    <td>90-100 ms</td>
                                    <td><span class="grade-badge-small b">B</span></td>
                                    <td>Good - Moderate bufferbloat</td>
                                </tr>
                                <tr class="grade-row c">
                                    <td>100-150 ms</td>
                                    <td><span class="grade-badge-small c">C</span></td>
                                    <td>Fair - Noticeable bufferbloat</td>
                                </tr>
                                <tr class="grade-row d">
                                    <td>150-175 ms</td>
                                    <td><span class="grade-badge-small d">D</span></td>
                                    <td>Poor - Significant bufferbloat</td>
                                </tr>
                                <tr class="grade-row f">
                                    <td>≥ 175 ms</td>
                                    <td><span class="grade-badge-small f">F</span></td>
                                    <td>Very Poor - Severe bufferbloat</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
            
            <!-- Total Grade Explanation -->
            <div class="total-grade-explanation-section">
                <h4>Total Grade Calculation</h4>
                <p>Your <strong>Total Grade</strong> considers both baseline latency and bufferbloat performance. A high baseline latency connection can't provide good real-time performance even with zero bufferbloat.</p>
                <p><strong>New Formula:</strong> Total Grade = min(Baseline Grade, Average Bufferbloat Grade)</p>
                <p><strong>Components:</strong></p>
                <ul>
                    <li><strong>Baseline Grade:</strong> Based on your idle connection latency</li>
                    <li><strong>Average Bufferbloat Grade:</strong> Average of Download, Upload, and Bidirectional latency increases</li>
                </ul>
                <p><strong>Example:</strong> If you have 75ms baseline (B grade) with 10ms average bufferbloat increase (A+ grade), your total = min(B, A+) = B grade overall.</p>
            </div>
            
            <!-- Individual Grades Explanation -->
            <div class="individual-grades-explanation-section">
                <h4>What Each Phase Tests</h4>
                <p><strong>Baseline:</strong> Your idle connection latency without any load (foundation for all real-time performance)</p>
                <p><strong>Download:</strong> How much latency increases when downloading large files (simulates streaming, software updates)</p>
                <p><strong>Upload:</strong> How much latency increases when uploading data (simulates video calls, cloud backups)</p>
                <p><strong>Bidirectional:</strong> How much latency increases during simultaneous heavy download and upload (simulates real-world mixed usage)</p>
            </div>
            
            <div class="grade-explanations">
                <div class="grade-explanation a-plus">
                    <div class="grade-badge">A+</div>
                    <div class="grade-description">
                        <h4>Excellent (&lt; 50ms)</h4>
                        <p>Your connection has virtually no bufferbloat! Perfect for video calls, online gaming, and real-time applications. Your connection maintains low latency even under heavy load.</p>
                    </div>
                </div>
                <div class="grade-explanation a">
                    <div class="grade-badge">A</div>
                    <div class="grade-description">
                        <h4>Very Good (50-90ms)</h4>
                        <p>Minimal bufferbloat with excellent performance. Great for video calls, streaming, and gaming. You may notice slight delays only during very heavy usage.</p>
                    </div>
                </div>
                <div class="grade-explanation b">
                    <div class="grade-badge">B</div>
                    <div class="grade-description">
                        <h4>Good (90-100ms)</h4>
                        <p>Moderate bufferbloat that's generally acceptable. Good for most activities, though you might notice some lag during video calls or gaming when downloading large files.</p>
                    </div>
                </div>
                <div class="grade-explanation c">
                    <div class="grade-badge">C</div>
                    <div class="grade-description">
                        <h4>Fair (100-150ms)</h4>
                        <p>Noticeable bufferbloat that affects performance. You'll likely experience lag during video calls, choppy streaming, and delayed responses in online games when your connection is busy.</p>
                    </div>
                </div>
                <div class="grade-explanation d">
                    <div class="grade-badge">D</div>
                    <div class="grade-description">
                        <h4>Poor (150-175ms)</h4>
                        <p>Significant bufferbloat causing major performance issues. Video calls will be problematic, streaming may buffer frequently, and online gaming will be frustrating during heavy usage.</p>
                    </div>
                </div>
                <div class="grade-explanation f">
                    <div class="grade-badge">F</div>
                    <div class="grade-description">
                        <h4>Very Poor (≥ 175ms)</h4>
                        <p>Severe bufferbloat making real-time applications nearly unusable. Video calls will drop frequently, streaming will buffer constantly, and online gaming will be extremely laggy when downloading or uploading.</p>
                    </div>
                </div>
            </div>
            <div class="explanation-footer">
                <p><strong>What can I do about bufferbloat?</strong> Consider upgrading your router firmware to one with better queue management (like OpenWrt with SQM), or contact your ISP about the issue.</p>
            </div>
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
                // SIMPLIFIED: No fairness/stability phases - overall grade is based on Alex & Sarah
            ],
            statistics: {
                custom: this.transformHouseholdStats(householdData),
                userStats: this.transformUserStatistics(householdData.users || {})
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
                return 'exceptional bufferbloat performance - Alex (Gaming) and Sarah (Video Calls) both performed excellently!';
            case 'A':
                return 'excellent bufferbloat performance - Alex (Gaming) and Sarah (Video Calls) both performed very well!';
            case 'B':
                return 'good bufferbloat performance - Alex (Gaming) and Sarah (Video Calls) performed adequately.';
            case 'C':
                return 'fair bufferbloat performance - Alex (Gaming) and Sarah (Video Calls) experienced some issues.';
            case 'D':
                return 'poor bufferbloat performance - Alex (Gaming) and Sarah (Video Calls) experienced significant issues.';
            case 'F':
                return 'very poor bufferbloat performance - Alex (Gaming) and Sarah (Video Calls) experienced severe issues.';
            default:
                return 'bufferbloat performance measured for Alex (Gaming) and Sarah (Video Calls).';
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
        // SIMPLIFIED: No custom stats - overall grade is based purely on Alex & Sarah
        return [];
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
            <div class="explanation-intro">
                <p>Your Virtual Household test simulates multiple users with different internet usage patterns to evaluate your network's bufferbloat performance under realistic load.</p>
            </div>
            
            <!-- Simplified Scoring Explanation -->
            <div class="metric-explanation-section">
                <h4>Overall Bufferbloat Score</h4>
                <p><strong>What it measures:</strong> How well your network handles bufferbloat when multiple latency-sensitive applications are running simultaneously.</p>
                <p><strong>How it's calculated:</strong> Your overall grade is the simple average of Alex (Gaming) and Sarah (Video Calls) individual performance grades. These are the two users most sensitive to bufferbloat and latency issues.</p>
                <div class="calculation-details">
                    <p><strong>Simplified Formula:</strong></p>
                    <ul>
                        <li><strong>Overall Grade = (Alex Grade + Sarah Grade) ÷ 2</strong></li>
                        <li><strong>Alex (Gaming):</strong> Tests low-latency gaming performance with 1.5 Mbps requirements</li>
                        <li><strong>Sarah (Video Calls):</strong> Tests video conferencing performance with 2.5 Mbps bidirectional requirements</li>
                        <li><strong>Rationale:</strong> Gaming and video calls are the most affected by bufferbloat and require consistent low latency</li>
                    </ul>
                </div>
                <div class="calculation-details">
                    <p><strong>Why Focus on Alex and Sarah?</strong></p>
                    <ul>
                        <li>Gaming requires ultra-low latency (≤75ms) to avoid lag and stuttering</li>
                        <li>Video calls need consistent latency (≤150ms) for smooth conversation</li>
                        <li>These applications are most negatively impacted by bufferbloat</li>
                        <li>Jake (Streaming) and Computer (Downloads) are more tolerant of latency variations</li>
                    </ul>
                </div>
            </div>
            
            <!-- Grade Scale -->
            <div class="grade-explanations">
                <h4>Grade Scale</h4>
                <div class="grade-explanation a-plus">
                    <div class="grade-badge a-plus">A+</div>
                    <div class="grade-description">
                        <h4>Excellent</h4>
                        <p>Outstanding bufferbloat performance. Both Alex (Gaming) and Sarah (Video Calls) performed excellently with minimal latency increases under household load.</p>
                    </div>
                </div>
                <div class="grade-explanation a">
                    <div class="grade-badge a">A</div>
                    <div class="grade-description">
                        <h4>Very Good</h4>
                        <p>Great bufferbloat performance. Alex (Gaming) and Sarah (Video Calls) both performed very well with only minor latency increases.</p>
                    </div>
                </div>
                <div class="grade-explanation b">
                    <div class="grade-badge b">B</div>
                    <div class="grade-description">
                        <h4>Good</h4>
                        <p>Good bufferbloat performance. Alex (Gaming) and Sarah (Video Calls) experienced some latency increases but remained usable.</p>
                    </div>
                </div>
                <div class="grade-explanation c">
                    <div class="grade-badge c">C</div>
                    <div class="grade-description">
                        <h4>Fair</h4>
                        <p>Acceptable performance with moderate bufferbloat. Alex (Gaming) or Sarah (Video Calls) experienced noticeable latency issues during household usage.</p>
                    </div>
                </div>
                <div class="grade-explanation d">
                    <div class="grade-badge d">D</div>
                    <div class="grade-description">
                        <h4>Poor</h4>
                        <p>Poor bufferbloat performance. Alex (Gaming) and Sarah (Video Calls) experienced significant latency problems affecting usability.</p>
                    </div>
                </div>
                <div class="grade-explanation f">
                    <div class="grade-badge f">F</div>
                    <div class="grade-description">
                        <h4>Very Poor</h4>
                        <p>Severe bufferbloat problems. Alex (Gaming) and Sarah (Video Calls) experienced major latency issues making real-time applications nearly unusable.</p>
                    </div>
                </div>
            </div>
            
            <div class="explanation-footer">
                <p><strong>What can I do about bufferbloat?</strong> Consider upgrading your router firmware to one with Smart Queue Management (SQM) like OpenWrt, or contact your ISP about implementing bufferbloat controls. QoS settings alone are often insufficient - proper queue management is key.</p>
            </div>
        `;
    }

    /**
     * Transform user statistics for detailed per-user tables
     */
    transformUserStatistics(users) {
        const userStats = [];
        
        Object.entries(users).forEach(([userId, userData]) => {
            if (userData.metrics && userData.metrics.length > 0) {
                const userInfo = this.getUserDisplayInfo(userId);
                const latencyStats = this.calculateUserLatencyStats(userData.metrics);
                const throughputStats = this.calculateUserThroughputStats(userData.metrics);
                
                userStats.push({
                    userId,
                    name: userInfo.name,
                    icon: userInfo.icon,
                    color: userInfo.color,
                    latency: latencyStats,
                    throughput: throughputStats
                });
            }
        });
        
        return userStats;
    }

    /**
     * Calculate latency statistics for a user
     */
    calculateUserLatencyStats(metrics) {
        const latencies = metrics
            .map(m => m.latency)
            .filter(l => l !== undefined && l !== null && !isNaN(l))
            .sort((a, b) => a - b);
        
        if (latencies.length === 0) {
            return {
                median: 0,
                average: 0,
                p25: 0,
                p75: 0,
                p95: 0
            };
        }
        
        const median = this.calculatePercentile(latencies, 50);
        const average = latencies.reduce((sum, val) => sum + val, 0) / latencies.length;
        const p25 = this.calculatePercentile(latencies, 25);
        const p75 = this.calculatePercentile(latencies, 75);
        const p95 = this.calculatePercentile(latencies, 95);
        
        return {
            median: Math.round(median * 10) / 10,
            average: Math.round(average * 10) / 10,
            p25: Math.round(p25 * 10) / 10,
            p75: Math.round(p75 * 10) / 10,
            p95: Math.round(p95 * 10) / 10
        };
    }

    /**
     * Calculate throughput statistics for a user
     */
    calculateUserThroughputStats(metrics) {
        const downloadThroughputs = metrics
            .map(m => m.downloadThroughput)
            .filter(t => t !== undefined && t !== null && !isNaN(t))
            .map(t => t / 1000000) // Convert bps to Mbps
            .sort((a, b) => a - b);
        
        const uploadThroughputs = metrics
            .map(m => m.uploadThroughput)
            .filter(t => t !== undefined && t !== null && !isNaN(t))
            .map(t => t / 1000000) // Convert bps to Mbps
            .sort((a, b) => a - b);
        
        const calculateStats = (values) => {
            if (values.length === 0) {
                return { median: 0, average: 0, p75: 0 };
            }
            
            const median = this.calculatePercentile(values, 50);
            const average = values.reduce((sum, val) => sum + val, 0) / values.length;
            const p75 = this.calculatePercentile(values, 75);
            
            return {
                median: Math.round(median * 10) / 10,
                average: Math.round(average * 10) / 10,
                p75: Math.round(p75 * 10) / 10
            };
        };
        
        return {
            download: calculateStats(downloadThroughputs),
            upload: calculateStats(uploadThroughputs)
        };
    }

    /**
     * Calculate percentile from sorted array
     */
    calculatePercentile(sortedArray, percentile) {
        if (sortedArray.length === 0) return 0;
        if (sortedArray.length === 1) return sortedArray[0];
        
        const index = (percentile / 100) * (sortedArray.length - 1);
        const lower = Math.floor(index);
        const upper = Math.ceil(index);
        
        if (lower === upper) {
            return sortedArray[lower];
        }
        
        const weight = index - lower;
        return sortedArray[lower] * (1 - weight) + sortedArray[upper] * weight;
    }

    /**
     * Get user display information
     */
    getUserDisplayInfo(userId) {
        const userDisplayMap = {
            alex: {
                name: 'Alex (Gaming)',
                icon: '🎮',
                color: '#45b7d1'
            },
            sarah: {
                name: 'Sarah (Video Calls)',
                icon: '💼',
                color: '#45b7d1'
            },
            jake: {
                name: 'Jake (Streaming)',
                icon: '📺',
                color: '#45b7d1'
            },
            computer: {
                name: 'Computer (Game Updates)',
                icon: '🎮',
                color: '#45b7d1'
            }
        };
        
        return userDisplayMap[userId] || {
            name: userId.charAt(0).toUpperCase() + userId.slice(1),
            icon: '👤',
            color: '#45b7d1'
        };
    }
}