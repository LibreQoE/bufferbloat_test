/**
 * Main Test Results Module
 * Orchestrates all shared UI components for displaying beautiful test results
 * Provides unified interface for both Single User Test and Virtual Household Test
 */

import { initializeCelebrationEffects, cleanupCelebrationEffects } from './celebrationEffects.js';
import { initializeTooltipSystem, cleanupTooltips } from './interactiveTooltips.js';
import { initializeShareSystem, isSharingSupported } from './shareSystem.js';
import { shouldCelebrate } from './gradeCalculations.js';

/**
 * Main entry point for displaying unified test results
 * @param {Object} data - Unified result data
 * @param {string} containerId - DOM container ID
 * @param {Object} options - Display configuration options
 */
export function displayUnifiedResults(data, containerId, options = {}) {
    const defaults = {
        showStatistics: true,
        showExplanation: true,
        showShareButton: true,
        enableCelebrations: true,
        enableTooltips: true,
        customCSS: ''
    };
    
    const config = { ...defaults, ...options };
    
    try {
        // Get container element
        const container = document.getElementById(containerId);
        if (!container) {
            throw new Error(`Container with ID '${containerId}' not found`);
        }
        
        // Clear existing content
        container.innerHTML = '';
        
        // Add custom CSS class if provided
        if (config.customCSS) {
            container.classList.add(config.customCSS);
        }
        
        // Render main results content
        renderResultsContent(container, data, config);
        
        // Initialize interactive features
        if (config.enableCelebrations || config.enableTooltips || config.showShareButton) {
            initializeInteractiveFeatures(containerId, data, config);
        }
        
        // Show the results container
        container.classList.remove('hidden');
        container.style.display = 'block';
        
        console.log(`✅ Results displayed successfully for ${data.metadata.testType} test`);
        
    } catch (error) {
        console.error('Error displaying unified results:', error);
        displayErrorMessage(containerId, 'Unable to display test results. Please try again.');
    }
}

/**
 * Render the main results content
 * @param {HTMLElement} container - Container element
 * @param {Object} data - Unified result data
 * @param {Object} config - Display configuration
 */
function renderResultsContent(container, data, config) {
    const html = `
        <div class="results-content">
            ${renderTotalGradeCard(data.totalGrade)}
            ${renderPhaseGrades(data.phases)}
            ${config.showStatistics ? renderStatisticsTables(data.statistics, config.showExplanation ? data.metadata.explanationContent : null, data.userResults) : ''}
        </div>
    `;
    
    container.innerHTML = html;
}

/**
 * Render the total grade card
 * @param {Object} totalGrade - Total grade data
 * @returns {string} HTML content
 */
function renderTotalGradeCard(totalGrade) {
    return `
        <div class="total-grade-container">
            <div class="total-grade-box">
                <h2>Total Bufferbloat Grade</h2>
                <div id="totalGrade" class="total-grade ${totalGrade.cssClass}">${totalGrade.grade}</div>
                <p class="total-grade-description">${totalGrade.description}</p>
                ${totalGrade.showApproved ? '<img src="approved.png" alt="Approved" class="approved-img">' : ''}
            </div>
        </div>
    `;
}

/**
 * Render phase grade boxes
 * @param {Array} phases - Phase data array
 * @returns {string} HTML content
 */
function renderPhaseGrades(phases) {
    const phasesHTML = phases.map(phase => `
        <div class="grade-box">
            <h3>${phase.name}</h3>
            <div id="${phase.id}Grade" class="grade ${phase.cssClass}">${phase.grade}</div>
            <p class="grade-metric">${phase.metric}</p>
        </div>
    `).join('');
    
    return `
        <div class="individual-grades-section">
            <h3 class="section-title">Individual Phase Grades</h3>
            <div class="grade-container">
                ${phasesHTML}
            </div>
        </div>
    `;
}

/**
 * Render statistics tables
 * @param {Object} statistics - Statistics data
 * @param {string} explanationContent - HTML content for explanation (optional)
 * @param {Array} userResults - Individual user results (optional)
 * @returns {string} HTML content
 */
function renderStatisticsTables(statistics, explanationContent = null, userResults = null) {
    let html = '<div class="statistics-section">';
    
    // Check if this is Virtual Household test (has userStats) or Single User test
    const isVirtualHousehold = statistics.userStats && statistics.userStats.length > 0;
    
    // For Single User Test: render explanation and share buttons before statistics tables
    if (!isVirtualHousehold && explanationContent) {
        html += renderExplanationToggle(explanationContent);
        html += renderShareButton();
    }
    
    // Render latency statistics if available
    if (statistics.latency && statistics.latency.length > 0) {
        html += `
            <div class="stats-table-container">
                <h3>Latency Statistics (ms)</h3>
                <table id="latencyStats" class="stats-table">
                    <thead>
                        <tr>
                            <th>Phase</th>
                            <th>Median</th>
                            <th>Average</th>
                            <th>25th %</th>
                            <th>75th %</th>
                            <th>95th %</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${statistics.latency.map(stat => `
                            <tr>
                                <td>${stat.phase}</td>
                                <td>${formatStatValue(stat.median)}</td>
                                <td>${formatStatValue(stat.average)}</td>
                                <td>${formatStatValue(stat.p25)}</td>
                                <td>${formatStatValue(stat.p75)}</td>
                                <td>${formatStatValue(stat.p95)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }
    
    // Render throughput statistics if available
    if (statistics.throughput && statistics.throughput.length > 0) {
        html += `
            <div class="stats-table-container">
                <h3>Throughput Statistics (Mbps)</h3>
                <table id="throughputStats" class="stats-table">
                    <thead>
                        <tr>
                            <th>Phase</th>
                            <th>Median</th>
                            <th>Average</th>
                            <th>75th %</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${statistics.throughput.map(stat => `
                            <tr>
                                <td>${stat.phase}</td>
                                <td>${formatStatValue(stat.median)}</td>
                                <td>${formatStatValue(stat.average)}</td>
                                <td>${formatStatValue(stat.p75)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }
    
    // Render custom statistics if available
    if (statistics.custom && statistics.custom.length > 0) {
        html += `
            <div class="stats-table-container">
                <h3 class="centered-title">Network Performance Metrics</h3>
                <table class="stats-table">
                    <tbody>
                        ${statistics.custom.map(stat => `
                            <tr>
                                <td>${stat.label}</td>
                                <td><strong>${stat.value}</strong></td>
                                ${stat.description ? `<td class="description">${stat.description}</td>` : ''}
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }
    
    // For Virtual Household Test: render share button after Network Performance Metrics
    if (isVirtualHousehold) {
        html += renderShareButton();
    }
    
    // For Virtual Household Test: render explanation toggle after share button
    if (isVirtualHousehold && explanationContent) {
        html += renderExplanationToggle(explanationContent);
    }
    
    // Render individual user grade cards if available (Virtual Household only)
    if (isVirtualHousehold && userResults && userResults.length > 0) {
        html += renderUserGradeCards(userResults);
    }
    
    // Render per-user statistics if available (Virtual Household only)
    if (isVirtualHousehold) {
        html += renderUserStatisticsTables(statistics.userStats);
    }
    
    html += '</div>';
    return html;
}

/**
 * Render per-user statistics tables
 * @param {Array} userStats - Array of user statistics data
 * @returns {string} HTML content
 */
function renderUserStatisticsTables(userStats) {
    let html = '<div class="user-statistics-section">';
    html += '<h3 class="section-title">Individual User Statistics</h3>';
    
    userStats.forEach(user => {
        html += `
            <div class="user-stats-container">
                <h4 class="user-stats-title">
                    <span class="user-icon">${user.icon}</span>
                    ${user.name} - Performance Statistics
                </h4>
                <div class="user-stats-tables">
                    ${renderUserLatencyTable(user)}
                    ${renderUserThroughputTable(user)}
                </div>
            </div>
        `;
    });
    
    html += '</div>';
    return html;
}

/**
 * Render latency statistics table for a user
 * @param {Object} user - User statistics data
 * @returns {string} HTML content
 */
function renderUserLatencyTable(user) {
    const latency = user.latency;
    
    return `
        <div class="stats-table-container">
            <h5>Latency Statistics (ms)</h5>
            <table class="stats-table">
                <thead>
                    <tr>
                        <th>Metric</th>
                        <th>Value</th>
                    </tr>
                </thead>
                <tbody>
                    <tr><td>Median</td><td>${formatStatValue(latency.median)}</td></tr>
                    <tr><td>Average</td><td>${formatStatValue(latency.average)}</td></tr>
                    <tr><td>25th %</td><td>${formatStatValue(latency.p25)}</td></tr>
                    <tr><td>75th %</td><td>${formatStatValue(latency.p75)}</td></tr>
                    <tr><td>95th %</td><td>${formatStatValue(latency.p95)}</td></tr>
                </tbody>
            </table>
        </div>
    `;
}

/**
 * Render throughput statistics table for a user
 * @param {Object} user - User statistics data
 * @returns {string} HTML content
 */
function renderUserThroughputTable(user) {
    const throughput = user.throughput;
    
    return `
        <div class="stats-table-container">
            <h5>Throughput Statistics (Mbps)</h5>
            <table class="stats-table">
                <thead>
                    <tr>
                        <th>Direction</th>
                        <th>Median</th>
                        <th>Average</th>
                        <th>75th %</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td>Download</td>
                        <td>${formatStatValue(throughput.download.median)}</td>
                        <td>${formatStatValue(throughput.download.average)}</td>
                        <td>${formatStatValue(throughput.download.p75)}</td>
                    </tr>
                    <tr>
                        <td>Upload</td>
                        <td>${formatStatValue(throughput.upload.median)}</td>
                        <td>${formatStatValue(throughput.upload.average)}</td>
                        <td>${formatStatValue(throughput.upload.p75)}</td>
                    </tr>
                </tbody>
            </table>
        </div>
    `;
}

/**
 * Render individual user grade cards
 * @param {Array} userResults - Array of user result data
 * @returns {string} HTML content
 */
function renderUserGradeCards(userResults) {
    let html = '<div class="user-grades-section">';
    html += '<h3 class="section-title">Individual User Performance</h3>';
    html += '<div class="user-grade-container">';
    
    userResults.forEach(user => {
        const userInfo = getUserDisplayInfo(user.userId);
        html += `
            <div class="user-grade-box">
                <h4 class="user-grade-title">
                    <span class="user-icon">${userInfo.icon}</span>
                    ${userInfo.name}
                </h4>
                <div class="grade ${user.grade.toLowerCase().replace('+', '-plus')}">${user.grade}</div>
                <p class="user-grade-description">${user.description}</p>
            </div>
        `;
    });
    
    html += '</div>';
    html += '</div>';
    return html;
}

/**
 * Get user display information for grade cards
 * @param {string} userId - User ID
 * @returns {Object} User display info
 */
function getUserDisplayInfo(userId) {
    const userDisplayMap = {
        alex: {
            name: 'Alex (Gaming)',
            icon: '🎮'
        },
        sarah: {
            name: 'Sarah (Video Calls)',
            icon: '💼'
        },
        jake: {
            name: 'Jake (Streaming)',
            icon: '📺'
        },
        computer: {
            name: 'Computer (Downloads)',
            icon: '💻'
        }
    };
    
    return userDisplayMap[userId] || {
        name: userId.charAt(0).toUpperCase() + userId.slice(1),
        icon: '👤'
    };
}

/**
 * Render explanation toggle section
 * @param {string} explanationContent - HTML content for explanation
 * @returns {string} HTML content
 */
function renderExplanationToggle(explanationContent) {
    if (!explanationContent) return '';
    
    return `
        <div class="explanation-section">
            <button id="toggleExplanation" class="explanation-toggle">
                <span class="toggle-icon">▼</span>
                What Do My Results Mean?
            </button>
            <div id="explanationContent" class="explanation-content hidden">
                ${explanationContent}
            </div>
        </div>
    `;
}

/**
 * Render share button
 * @returns {string} HTML content
 */
function renderShareButton() {
    return `
        <div class="share-section">
            <button id="shareResultBtn" class="share-btn">
                <span class="share-icon">📤</span> Share My Result
            </button>
        </div>
    `;
}

/**
 * Initialize all interactive features
 * @param {string} containerId - Container ID
 * @param {Object} data - Unified result data
 * @param {Object} config - Display configuration
 */
export function initializeInteractiveFeatures(containerId, data, config) {
    try {
        // Initialize celebration effects
        if (config.enableCelebrations) {
            initializeCelebrationEffects(data, containerId);
        }
        
        // Initialize tooltip system
        if (config.enableTooltips) {
            initializeTooltipSystem(data, containerId);
        }
        
        // Initialize share system
        if (config.showShareButton && isSharingSupported()) {
            initializeShareSystem(data, containerId);
        }
        
        // Initialize explanation toggle
        if (config.showExplanation) {
            initializeExplanationToggle(containerId);
        }
        
    } catch (error) {
        console.error('Error initializing interactive features:', error);
    }
}

/**
 * Initialize the explanation toggle functionality
 * @param {string} containerId - Container ID
 */
function initializeExplanationToggle(containerId) {
    console.log(`🔧 Initializing explanation toggle for container: ${containerId}`);
    
    const container = document.getElementById(containerId);
    if (!container) {
        console.warn(`⚠️ Container not found: ${containerId}`);
        return;
    }
    
    const toggleButton = container.querySelector('#toggleExplanation');
    const explanationContent = container.querySelector('#explanationContent');
    
    console.log(`🔧 Toggle elements found:`, {
        toggleButton: !!toggleButton,
        explanationContent: !!explanationContent,
        containerId
    });
    
    if (!toggleButton || !explanationContent) {
        console.warn(`⚠️ Toggle elements not found in container ${containerId}:`, {
            toggleButton: !!toggleButton,
            explanationContent: !!explanationContent
        });
        return;
    }
    
    // Remove any existing event listeners by cloning the button
    const newToggleButton = toggleButton.cloneNode(true);
    toggleButton.parentNode.replaceChild(newToggleButton, toggleButton);
    
    // Add click event listener to the new toggle button
    newToggleButton.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        
        console.log(`🔧 Explanation toggle clicked for container: ${containerId}`);
        
        const currentExplanationContent = container.querySelector('#explanationContent');
        if (!currentExplanationContent) {
            console.warn(`⚠️ Explanation content not found during toggle for container: ${containerId}`);
            return;
        }
        
        const isHidden = currentExplanationContent.classList.contains('hidden');
        const toggleIcon = newToggleButton.querySelector('.toggle-icon');
        
        console.log(`🔧 Current state - hidden: ${isHidden}`);
        
        if (isHidden) {
            // Show the explanation content
            currentExplanationContent.classList.remove('hidden');
            newToggleButton.classList.add('expanded');
            if (toggleIcon) toggleIcon.textContent = '▲';
            console.log(`✅ Showing explanation content for container: ${containerId}`);
        } else {
            // Hide the explanation content
            currentExplanationContent.classList.add('hidden');
            newToggleButton.classList.remove('expanded');
            if (toggleIcon) toggleIcon.textContent = '▼';
            console.log(`✅ Hiding explanation content for container: ${containerId}`);
        }
    });
    
    console.log(`✅ Explanation toggle initialized successfully for container: ${containerId}`);
}

/**
 * Format a statistical value for display
 * @param {number} value - The value to format
 * @returns {string} The formatted value
 */
function formatStatValue(value) {
    if (typeof value !== 'number' || isNaN(value)) return '--';
    
    // For values under 10, show one decimal place
    // For values 10 and above, round to nearest integer
    if (value < 10) {
        return value.toFixed(1);
    } else {
        return Math.round(value).toString();
    }
}

/**
 * Display error message in container
 * @param {string} containerId - Container ID
 * @param {string} message - Error message
 */
function displayErrorMessage(containerId, message) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    container.innerHTML = `
        <div class="error-message">
            <h3>⚠️ Error</h3>
            <p>${message}</p>
        </div>
    `;
    
    container.style.display = 'block';
}

/**
 * Clean up event listeners and animations
 * @param {string} containerId - Container ID
 */
export function cleanupResults(containerId) {
    try {
        cleanupCelebrationEffects(containerId);
        cleanupTooltips(containerId);
        
        // Clean up explanation toggle
        const container = document.getElementById(containerId);
        if (container) {
            const toggleButton = container.querySelector('#toggleExplanation');
            if (toggleButton) {
                // Remove event listeners by cloning
                const newButton = toggleButton.cloneNode(true);
                toggleButton.parentNode.replaceChild(newButton, toggleButton);
            }
        }
        
        console.log(`✅ Results cleanup completed for container: ${containerId}`);
        
    } catch (error) {
        console.error('Error during results cleanup:', error);
    }
}

/**
 * Add main results CSS styles
 */
export function addResultsCSS() {
    // Check if CSS is already added
    if (document.getElementById('results-styles')) return;
    
    const style = document.createElement('style');
    style.id = 'results-styles';
    style.textContent = `
        /* Main results container */
        .results-content {
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
        }
        
        /* Total grade card */
        .total-grade-container {
            margin-bottom: 30px;
        }
        
        .total-grade-box {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            padding: 30px;
            border-radius: 12px;
            text-align: center;
            position: relative;
            box-shadow: 0 8px 32px rgba(102, 126, 234, 0.3);
        }
        
        .total-grade-box h2 {
            margin: 0 0 15px 0;
            color: white;
            font-size: 24px;
            font-weight: 600;
        }
        
        .total-grade {
            font-size: 72px;
            font-weight: bold;
            color: white;
            margin: 15px 0;
            text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
        }
        
        .total-grade-description {
            margin: 15px 0 0 0;
            color: rgba(255, 255, 255, 0.9);
            font-size: 16px;
            line-height: 1.4;
        }
        
        .approved-img {
            position: absolute;
            top: 15px;
            right: 15px;
            width: 50px;
            height: 50px;
        }
        
        /* Individual grades */
        .individual-grades-section {
            margin-bottom: 30px;
        }
        
        .section-title {
            text-align: center;
            margin: 0 0 20px 0;
            color: #ffffff !important;
            font-size: 20px;
            font-weight: 600;
        }
        
        .grade-container {
            display: flex;
            gap: 20px;
            justify-content: center;
            flex-wrap: wrap;
        }
        
        .grade-box {
            background: rgba(255, 255, 255, 0.05) !important;
            padding: 20px;
            border-radius: 8px;
            text-align: center;
            min-width: 150px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
            border: 2px solid transparent;
            transition: all 0.3s ease;
        }
        
        .grade-box h3 {
            margin: 0 0 10px 0;
            color: #ffffff !important;
            font-size: 16px;
            font-weight: 600;
        }
        
        .grade {
            font-size: 36px;
            font-weight: bold;
            margin: 10px 0;
        }
        
        .grade-metric {
            margin: 10px 0 0 0;
            color: #888;
            font-size: 14px;
        }
        
        /* Grade colors */
        .grade.a-plus, .total-grade.a-plus { color: #00ff00; }
        .grade.a, .total-grade.a { color: #7fff00; }
        .grade.b, .total-grade.b { color: #ffff00; }
        .grade.c, .total-grade.c { color: #ffa500; }
        .grade.d, .total-grade.d { color: #ff6347; }
        .grade.f, .total-grade.f { color: #ff0000; }
        
        /* Statistics tables */
        .statistics-section {
            margin-bottom: 30px;
        }
        
        .stats-table-container {
            margin-bottom: 25px;
        }
        
        .stats-table-container h3 {
            margin: 0 0 15px 0;
            color: #ffffff !important;
            font-size: 18px;
            font-weight: 600;
        }
        
        .stats-table-container h3.centered-title {
            text-align: center;
        }
        
        .stats-table {
            width: 100%;
            border-collapse: collapse;
            background: rgba(255, 255, 255, 0.05) !important;
            border-radius: 8px;
            overflow: hidden;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
        }
        
        .stats-table th,
        .stats-table td {
            padding: 12px;
            text-align: left;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1) !important;
            color: #ffffff !important;
        }
        
        .stats-table th {
            background: rgba(255, 255, 255, 0.1) !important;
            font-weight: 600;
            color: #ffffff !important;
        }
        
        .stats-table td.description {
            color: #666;
            font-size: 14px;
        }
        
        /* Explanation toggle */
        .explanation-section {
            margin-bottom: 30px;
        }
        
        .explanation-toggle {
            background: rgba(255, 255, 255, 0.05) !important;
            border: 1px solid rgba(255, 255, 255, 0.1) !important;
            padding: 15px 20px;
            border-radius: 8px;
            width: 100%;
            text-align: left;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s ease;
            display: flex;
            align-items: center;
            gap: 10px;
            color: #ffffff !important;
        }
        
        .explanation-toggle:hover {
            background: rgba(255, 255, 255, 0.1) !important;
        }
        
        .toggle-icon {
            transition: transform 0.3s ease;
        }
        
        .explanation-toggle.expanded .toggle-icon {
            transform: rotate(180deg);
        }
        
        .explanation-content {
            padding: 20px;
            background: rgba(255, 255, 255, 0.05) !important;
            border: 1px solid rgba(255, 255, 255, 0.1) !important;
            border-top: none;
            border-radius: 0 0 8px 8px;
            transition: all 0.3s ease;
            color: #ffffff !important;
        }
        
        .explanation-content.hidden {
            display: none;
        }
        
        /* Share section */
        .share-section {
            text-align: center;
            margin-bottom: 20px;
        }
        
        /* Error message */
        .error-message {
            background: #f8d7da;
            color: #721c24;
            padding: 20px;
            border-radius: 8px;
            text-align: center;
            border: 1px solid #f5c6cb;
        }
        
        .error-message h3 {
            margin: 0 0 10px 0;
        }
        
        /* Responsive design */
        @media (max-width: 768px) {
            .grade-container {
                flex-direction: column;
                align-items: center;
            }
            
            .grade-box {
                width: 100%;
                max-width: 300px;
            }
            
            .total-grade {
                font-size: 48px;
            }
            
            .stats-table {
                font-size: 14px;
            }
            
            .stats-table th,
            .stats-table td {
                padding: 8px;
            }
        }
        
        /* Virtual Household Explanation Styles */
        .metric-explanation-section {
            margin-bottom: 25px;
            padding: 20px;
            background: rgba(255, 255, 255, 0.03);
            border-radius: 8px;
            border-left: 4px solid #667eea;
        }
        
        .metric-explanation-section h4 {
            color: #ffffff !important;
            margin: 0 0 15px 0;
            font-size: 18px;
            font-weight: 600;
        }
        
        .metric-explanation-section p {
            color: rgba(255, 255, 255, 0.9) !important;
            margin: 10px 0;
            line-height: 1.5;
        }
        
        .calculation-details {
            margin-top: 15px;
            padding: 15px;
            background: rgba(255, 255, 255, 0.05);
            border-radius: 6px;
            border: 1px solid rgba(255, 255, 255, 0.1);
        }
        
        .calculation-details p {
            color: rgba(255, 255, 255, 0.8) !important;
            margin: 8px 0;
            font-size: 14px;
        }
        
        .calculation-details ul {
            margin: 10px 0;
            padding-left: 20px;
        }
        
        .calculation-details li {
            color: rgba(255, 255, 255, 0.8) !important;
            margin: 5px 0;
            font-size: 14px;
            line-height: 1.4;
        }
        
        .explanation-intro {
            margin-bottom: 25px;
            padding: 15px;
            background: rgba(255, 255, 255, 0.03);
            border-radius: 8px;
            border-left: 4px solid #45b7d1;
        }
        
        .explanation-intro p {
            color: rgba(255, 255, 255, 0.9) !important;
            margin: 0;
            line-height: 1.5;
        }
        
        .grade-explanations {
            margin: 25px 0;
        }
        
        .grade-explanations h4 {
            color: #ffffff !important;
            margin: 0 0 20px 0;
            font-size: 18px;
            font-weight: 600;
        }
        
        .grade-explanation {
            display: flex;
            align-items: flex-start;
            gap: 15px;
            margin-bottom: 20px;
            padding: 15px;
            background: rgba(255, 255, 255, 0.03);
            border-radius: 8px;
            border: 1px solid rgba(255, 255, 255, 0.1);
        }
        
        .grade-badge {
            min-width: 50px;
            height: 50px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: bold;
            font-size: 18px;
            color: white;
            flex-shrink: 0;
        }
        
        .grade-badge.a-plus {
            background: linear-gradient(135deg, #28a745, #20c997);
        }
        
        .grade-badge.a {
            background: linear-gradient(135deg, #28a745, #34ce57);
        }
        
        .grade-badge.b {
            background: linear-gradient(135deg, #17a2b8, #20c997);
        }
        
        .grade-badge.c {
            background: linear-gradient(135deg, #ffc107, #ffca2c);
            color: #212529;
        }
        
        .grade-badge.d {
            background: linear-gradient(135deg, #fd7e14, #ff8c42);
        }
        
        .grade-badge.f {
            background: linear-gradient(135deg, #dc3545, #e55353);
        }
        
        .grade-description h4 {
            color: #ffffff !important;
            margin: 0 0 8px 0;
            font-size: 16px;
            font-weight: 600;
        }
        
        .grade-description p {
            color: rgba(255, 255, 255, 0.8) !important;
            margin: 0;
            line-height: 1.4;
            font-size: 14px;
        }
        
        .explanation-footer {
            margin-top: 25px;
            padding: 15px;
            background: rgba(255, 255, 255, 0.05);
            border-radius: 6px;
            border: 1px solid rgba(255, 255, 255, 0.1);
        }
        
        .explanation-footer p {
            color: rgba(255, 255, 255, 0.9) !important;
            margin: 0;
            font-style: italic;
        }
        
        /* User Statistics Tables */
        .user-statistics-section {
            margin-top: 30px;
        }
        
        .user-stats-container {
            margin-bottom: 30px;
            padding: 20px;
            background: rgba(255, 255, 255, 0.03);
            border-radius: 8px;
            border-left: 4px solid #667eea;
        }
        
        .user-stats-title {
            display: flex;
            align-items: center;
            gap: 10px;
            margin: 0 0 20px 0;
            color: #ffffff !important;
            font-size: 18px;
            font-weight: 600;
        }
        
        .user-icon {
            font-size: 24px;
        }
        
        .user-stats-tables {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
        }
        
        .user-stats-tables .stats-table-container {
            margin-bottom: 0;
        }
        
        .user-stats-tables .stats-table-container h5 {
            margin: 0 0 15px 0;
            color: #ffffff !important;
            font-size: 16px;
            font-weight: 600;
        }
        
        /* User Grade Cards */
        .user-grades-section {
            margin-bottom: 30px;
        }
        
        .user-grade-container {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin-top: 20px;
        }
        
        .user-grade-box {
            background: rgba(255, 255, 255, 0.05) !important;
            padding: 20px;
            border-radius: 8px;
            text-align: center;
            border: 2px solid transparent;
            transition: all 0.3s ease;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
        }
        
        .user-grade-title {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            margin: 0 0 15px 0;
            color: #ffffff !important;
            font-size: 16px;
            font-weight: 600;
        }
        
        .user-grade-box .grade {
            font-size: 48px;
            font-weight: bold;
            margin: 15px 0;
        }
        
        .user-grade-description {
            margin: 15px 0 0 0;
            color: rgba(255, 255, 255, 0.8) !important;
            font-size: 14px;
            line-height: 1.4;
        }
        
        /* Responsive design for user statistics */
        @media (max-width: 768px) {
            .user-stats-tables {
                grid-template-columns: 1fr;
            }
            
            .user-stats-container {
                padding: 15px;
            }
            
            .user-stats-title {
                font-size: 16px;
            }
            
            .user-icon {
                font-size: 20px;
            }
            
            .user-grade-container {
                grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
                gap: 15px;
            }
            
            .user-grade-box {
                padding: 15px;
            }
            
            .user-grade-box .grade {
                font-size: 36px;
            }
            
            .user-grade-title {
                font-size: 14px;
            }
        }
    `;
    
    document.head.appendChild(style);
}

// Auto-add CSS when module is imported
addResultsCSS();

// Export adapters for convenience
export { createSingleUserAdapter, createVirtualHouseholdAdapter } from './resultAdapters.js';