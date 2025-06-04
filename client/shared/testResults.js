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
            ${config.showStatistics ? renderStatisticsTables(data.statistics) : ''}
            ${config.showExplanation ? renderExplanationToggle(data.metadata.explanationContent) : ''}
            ${config.showShareButton && isSharingSupported() ? renderShareButton() : ''}
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
 * @returns {string} HTML content
 */
function renderStatisticsTables(statistics) {
    let html = '<div class="statistics-section">';
    
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
                <h3>Network Performance Metrics</h3>
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
    
    html += '</div>';
    return html;
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
    const container = document.getElementById(containerId);
    if (!container) return;
    
    const toggleButton = container.querySelector('#toggleExplanation');
    const explanationContent = container.querySelector('#explanationContent');
    
    if (!toggleButton || !explanationContent) return;
    
    // Add click event listener to toggle button
    toggleButton.addEventListener('click', function() {
        const isHidden = explanationContent.classList.contains('hidden');
        const toggleIcon = toggleButton.querySelector('.toggle-icon');
        
        if (isHidden) {
            // Show the explanation content
            explanationContent.classList.remove('hidden');
            toggleButton.classList.add('expanded');
            if (toggleIcon) toggleIcon.textContent = '▲';
        } else {
            // Hide the explanation content
            explanationContent.classList.add('hidden');
            toggleButton.classList.remove('expanded');
            if (toggleIcon) toggleIcon.textContent = '▼';
        }
    });
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
    `;
    
    document.head.appendChild(style);
}

// Auto-add CSS when module is imported
addResultsCSS();

// Export adapters for convenience
export { createSingleUserAdapter, createVirtualHouseholdAdapter } from './resultAdapters.js';