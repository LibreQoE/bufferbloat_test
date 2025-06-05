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
                                    <th>Latency Increase</th>
                                    <th>Grade</th>
                                    <th>Description</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr class="grade-row a-plus">
                                    <td>&lt; 5 ms</td>
                                    <td><span class="grade-badge-small a-plus">A+</span></td>
                                    <td>Excellent - Virtually no bufferbloat</td>
                                </tr>
                                <tr class="grade-row a">
                                    <td>5-30 ms</td>
                                    <td><span class="grade-badge-small a">A</span></td>
                                    <td>Very Good - Minimal bufferbloat</td>
                                </tr>
                                <tr class="grade-row b">
                                    <td>30-60 ms</td>
                                    <td><span class="grade-badge-small b">B</span></td>
                                    <td>Good - Moderate bufferbloat</td>
                                </tr>
                                <tr class="grade-row c">
                                    <td>60-200 ms</td>
                                    <td><span class="grade-badge-small c">C</span></td>
                                    <td>Fair - Noticeable bufferbloat</td>
                                </tr>
                                <tr class="grade-row d">
                                    <td>200-400 ms</td>
                                    <td><span class="grade-badge-small d">D</span></td>
                                    <td>Poor - Significant bufferbloat</td>
                                </tr>
                                <tr class="grade-row f">
                                    <td>≥ 400 ms</td>
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
                <p>Your <strong>Total Bufferbloat Grade</strong> combines all three test phases with equal weighting (33.33% each). Each letter grade is converted to a numeric value (A+=6, A=5, B=4, C=3, D=2, F=1), averaged, then converted back to a letter grade.</p>
                <p><strong>Example:</strong> If you get A+ (6), B (4), and A (5), your total = (6+4+5)/3 = 5.0 = A grade overall.</p>
            </div>
            
            <!-- Individual Grades Explanation -->
            <div class="individual-grades-explanation-section">
                <h4>What Each Phase Tests</h4>
                <p><strong>Download:</strong> How much latency increases when downloading large files (simulates streaming, software updates)</p>
                <p><strong>Upload:</strong> How much latency increases when uploading data (simulates video calls, cloud backups)</p>
                <p><strong>Bidirectional:</strong> How much latency increases during simultaneous heavy download and upload (simulates real-world mixed usage)</p>
            </div>
            
            <div class="grade-explanations">
                <div class="grade-explanation a-plus">
                    <div class="grade-badge">A+</div>
                    <div class="grade-description">
                        <h4>Excellent (0-5ms increase)</h4>
                        <p>Your connection has virtually no bufferbloat! Perfect for video calls, online gaming, and real-time applications. Your connection maintains low latency even under heavy load.</p>
                    </div>
                </div>
                <div class="grade-explanation a">
                    <div class="grade-badge">A</div>
                    <div class="grade-description">
                        <h4>Very Good (5-30ms increase)</h4>
                        <p>Minimal bufferbloat with excellent performance. Great for video calls, streaming, and gaming. You may notice slight delays only during very heavy usage.</p>
                    </div>
                </div>
                <div class="grade-explanation b">
                    <div class="grade-badge">B</div>
                    <div class="grade-description">
                        <h4>Good (30-60ms increase)</h4>
                        <p>Moderate bufferbloat that's generally acceptable. Good for most activities, though you might notice some lag during video calls or gaming when downloading large files.</p>
                    </div>
                </div>
                <div class="grade-explanation c">
                    <div class="grade-badge">C</div>
                    <div class="grade-description">
                        <h4>Fair (60-200ms increase)</h4>
                        <p>Noticeable bufferbloat that affects performance. You'll likely experience lag during video calls, choppy streaming, and delayed responses in online games when your connection is busy.</p>
                    </div>
                </div>
                <div class="grade-explanation d">
                    <div class="grade-badge">D</div>
                    <div class="grade-description">
                        <h4>Poor (200-400ms increase)</h4>
                        <p>Significant bufferbloat causing major performance issues. Video calls will be problematic, streaming may buffer frequently, and online gaming will be frustrating during heavy usage.</p>
                    </div>
                </div>
                <div class="grade-explanation f">
                    <div class="grade-badge">F</div>
                    <div class="grade-description">
                        <h4>Very Poor (400ms+ increase)</h4>
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
            <div class="explanation-intro">
                <p>Your Virtual Household test simulates multiple users with different internet usage patterns to evaluate your network's performance under realistic load.</p>
            </div>
            
            <!-- Network Fairness Explanation -->
            <div class="metric-explanation-section">
                <h4>Network Fairness</h4>
                <p><strong>What it measures:</strong> How evenly bandwidth is distributed among different users and applications in your household.</p>
                <p><strong>How it's calculated:</strong> We measure the actual throughput each virtual user receives compared to their target bandwidth needs, then calculate how fairly the available bandwidth is shared using the Jain's Fairness Index formula.</p>
                <div class="calculation-details">
                    <p><strong>Calculation method:</strong></p>
                    <ul>
                        <li>Each user has target bandwidth requirements (Gaming: 1.5 Mbps, Video calls: 2.5 Mbps, Streaming: 25 Mbps, Downloads: varies)</li>
                        <li>We measure actual throughput achieved by each user during the test</li>
                        <li>Fairness score = (sum of throughputs)² / (n × sum of throughputs²) where n = number of users</li>
                        <li>Score ranges from 0% (completely unfair) to 100% (perfectly fair)</li>
                    </ul>
                </div>
            </div>
            
            <!-- Latency Stability Explanation -->
            <div class="metric-explanation-section">
                <h4>Latency Stability</h4>
                <p><strong>What it measures:</strong> How consistent response times remain when multiple users are active simultaneously.</p>
                <p><strong>How it's calculated:</strong> We continuously measure latency for each user throughout the test and calculate the coefficient of variation (standard deviation / mean) to determine stability. <strong>This metric is primarily weighted based on Alex (Gaming) and Sarah (Video Calls) performance</strong>, as these users are most sensitive to latency variations.</p>
                <div class="calculation-details">
                    <p><strong>Calculation method:</strong></p>
                    <ul>
                        <li>Latency is measured every 100ms for each virtual user during the 30-second household simulation</li>
                        <li><strong>Weighting Formula:</strong> Alex (Gaming) = 40%, Sarah (Video Calls) = 40%, Jake (Streaming) = 15%, Computer (Downloads) = 5%</li>
                        <li>We calculate the coefficient of variation for each user: CV = (standard deviation / mean latency) × 100</li>
                        <li>Overall stability CV = (Alex_CV × 0.4) + (Sarah_CV × 0.4) + (Jake_CV × 0.15) + (Computer_CV × 0.05)</li>
                        <li>Lower CV values indicate more stable latency</li>
                        <li>Stability percentage = max(0, 100 - Overall_CV) where CV < 10% = excellent stability</li>
                        <li><strong>Rationale:</strong> Gaming and video calls require the most consistent latency for optimal user experience</li>
                    </ul>
                </div>
            </div>
            
            <!-- Overall Grade Calculation -->
            <div class="metric-explanation-section">
                <h4>Overall Grade Calculation</h4>
                <p><strong>What it measures:</strong> Your overall network performance combining fairness, stability, and individual user experiences.</p>
                <p><strong>How it's calculated:</strong> The overall grade is a weighted average of multiple performance metrics, designed to reflect real-world user satisfaction.</p>
                <div class="calculation-details">
                    <p><strong>Weighting Formula:</strong></p>
                    <ul>
                        <li><strong>Network Fairness (40%):</strong> How evenly bandwidth is distributed among users</li>
                        <li><strong>Latency Stability (30%):</strong> How consistent response times remain under load</li>
                        <li><strong>Individual User Performance (30%):</strong> Average of all four virtual users' individual grades</li>
                    </ul>
                    <p><strong>Calculation Steps:</strong></p>
                    <ul>
                        <li>1. Calculate Network Fairness percentage using Jain's Fairness Index</li>
                        <li>2. Calculate Latency Stability percentage using coefficient of variation</li>
                        <li>3. Calculate individual user grades based on their specific requirements:
                            <ul style="margin-top: 8px;">
                                <li><strong>Alex (Gaming):</strong> Prioritizes low latency and jitter (&lt;50ms ping, &lt;10ms jitter = A+)</li>
                                <li><strong>Sarah (Video Calls):</strong> Needs stable bandwidth and low jitter (2.5+ Mbps, &lt;20ms jitter = A+)</li>
                                <li><strong>Jake (Streaming):</strong> Requires consistent high throughput (25+ Mbps sustained = A+)</li>
                                <li><strong>Computer (Downloads):</strong> Tolerates higher latency but needs fair bandwidth allocation</li>
                            </ul>
                        </li>
                        <li>4. Combine using weighted formula: Overall = (Fairness × 0.4) + (Stability × 0.3) + (User Average × 0.3)</li>
                        <li>5. Convert final percentage to letter grade using standard scale</li>
                    </ul>
                </div>
            </div>
            
            <!-- Grade Scale -->
            <div class="grade-explanations">
                <h4>Grade Scale</h4>
                <div class="grade-explanation a-plus">
                    <div class="grade-badge a-plus">A+</div>
                    <div class="grade-description">
                        <h4>Excellent (95-100%)</h4>
                        <p>Outstanding network performance. All users get fair bandwidth allocation and latency remains very stable under load.</p>
                    </div>
                </div>
                <div class="grade-explanation a">
                    <div class="grade-badge a">A</div>
                    <div class="grade-description">
                        <h4>Very Good (90-94%)</h4>
                        <p>Great network performance with minor variations. Most users get adequate bandwidth with stable latency.</p>
                    </div>
                </div>
                <div class="grade-explanation b">
                    <div class="grade-badge b">B</div>
                    <div class="grade-description">
                        <h4>Good (80-89%)</h4>
                        <p>Good network performance with some inequality in bandwidth distribution or latency variations under load.</p>
                    </div>
                </div>
                <div class="grade-explanation c">
                    <div class="grade-badge c">C</div>
                    <div class="grade-description">
                        <h4>Fair (70-79%)</h4>
                        <p>Acceptable performance but some users may experience reduced bandwidth or inconsistent latency during peak usage.</p>
                    </div>
                </div>
                <div class="grade-explanation d">
                    <div class="grade-badge d">D</div>
                    <div class="grade-description">
                        <h4>Poor (60-69%)</h4>
                        <p>Poor network performance with significant bandwidth inequality or latency instability affecting user experience.</p>
                    </div>
                </div>
                <div class="grade-explanation f">
                    <div class="grade-badge f">F</div>
                    <div class="grade-description">
                        <h4>Very Poor (Below 60%)</h4>
                        <p>Very poor network performance. Major bandwidth inequality and latency instability make multi-user scenarios problematic.</p>
                    </div>
                </div>
            </div>
            
            <div class="explanation-footer">
                <p><strong>What can I do to improve?</strong> Consider upgrading your router firmware to one with better Quality of Service (QoS) management, or contact your ISP about implementing Smart Queue Management (SQM).</p>
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
                name: 'Computer (Downloads)',
                icon: '💻',
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