/**
 * Interactive Tooltips Module
 * Provides hover tooltips with detailed explanations for grade elements
 * Supports both mouse and keyboard interactions for accessibility
 */

/**
 * Initialize tooltip system for all grade elements
 * @param {Object} data - Unified result data with tooltip content
 * @param {string} containerId - Container ID
 */
export function initializeTooltipSystem(data, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    // Create tooltip element if it doesn't exist
    let tooltip = document.getElementById('gradeTooltip');
    if (!tooltip) {
        tooltip = createTooltipElement();
        document.body.appendChild(tooltip);
    }

    // Add tooltip to total grade
    addTooltipToTotalGrade(data.totalGrade, tooltip, container);

    // Add tooltips to phase grades
    data.phases.forEach(phase => {
        addTooltipToPhaseGrade(phase, tooltip, container);
    });
}

/**
 * Create the main tooltip element
 * @returns {HTMLElement} Tooltip element
 */
function createTooltipElement() {
    const tooltip = document.createElement('div');
    tooltip.id = 'gradeTooltip';
    tooltip.className = 'grade-tooltip hidden';
    tooltip.style.cssText = `
        position: absolute;
        background: rgba(0, 0, 0, 0.9);
        color: white;
        padding: 12px 16px;
        border-radius: 8px;
        font-size: 14px;
        line-height: 1.4;
        max-width: 300px;
        z-index: 1000;
        pointer-events: none;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        border: 1px solid rgba(255, 255, 255, 0.1);
        backdrop-filter: blur(10px);
        transition: opacity 0.2s ease-in-out;
    `;
    return tooltip;
}

/**
 * Add tooltip to total grade element
 * @param {Object} totalGrade - Total grade data
 * @param {HTMLElement} tooltip - Tooltip element
 * @param {HTMLElement} container - Container element
 */
function addTooltipToTotalGrade(totalGrade, tooltip, container) {
    const totalGradeElement = container.querySelector('#totalGrade');
    const totalGradeBox = totalGradeElement?.closest('.total-grade-box');
    
    if (!totalGradeBox) return;

    // Generate tooltip content for Total Grade
    const tooltipContent = generateTotalGradeTooltipContent(totalGrade);

    // Add event listeners
    addTooltipEventListeners(totalGradeBox, tooltip, tooltipContent);
}

/**
 * Add tooltip to phase grade element
 * @param {Object} phase - Phase data with tooltip content
 * @param {HTMLElement} tooltip - Tooltip element
 * @param {HTMLElement} container - Container element
 */
function addTooltipToPhaseGrade(phase, tooltip, container) {
    const gradeElement = container.querySelector(`#${phase.id}Grade`);
    const gradeBox = gradeElement?.closest('.grade-box');
    
    if (!gradeBox) return;

    // Use tooltip content from phase data
    const tooltipContent = `
        <div class="tooltip-header">
            <strong>${phase.tooltip.header}</strong>
        </div>
        <div class="tooltip-content">
            ${phase.tooltip.content}
        </div>
    `;

    // Add event listeners
    addTooltipEventListeners(gradeBox, tooltip, tooltipContent);
}

/**
 * Add tooltip event listeners to an element
 * @param {HTMLElement} element - Target element
 * @param {HTMLElement} tooltip - Tooltip element
 * @param {string} content - Tooltip HTML content
 */
function addTooltipEventListeners(element, tooltip, content) {
    // Make element focusable for keyboard accessibility
    if (!element.hasAttribute('tabindex')) {
        element.setAttribute('tabindex', '0');
    }
    
    // Add ARIA attributes for accessibility
    element.setAttribute('aria-describedby', 'gradeTooltip');
    element.setAttribute('role', 'button');
    element.setAttribute('aria-label', 'Grade information - press Enter or hover for details');

    // Mouse events
    element.addEventListener('mouseenter', (e) => {
        showTooltip(tooltip, content, e.target);
    });

    element.addEventListener('mouseleave', () => {
        hideTooltip(tooltip);
    });

    element.addEventListener('mousemove', (e) => {
        if (!tooltip.classList.contains('hidden')) {
            positionTooltip(tooltip, e.target, e.clientX, e.clientY);
        }
    });

    // Keyboard events for accessibility
    element.addEventListener('focus', (e) => {
        showTooltip(tooltip, content, e.target);
    });

    element.addEventListener('blur', () => {
        hideTooltip(tooltip);
    });

    element.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            if (tooltip.classList.contains('hidden')) {
                showTooltip(tooltip, content, e.target);
            } else {
                hideTooltip(tooltip);
            }
        } else if (e.key === 'Escape') {
            hideTooltip(tooltip);
            element.blur();
        }
    });
}

/**
 * Show tooltip with content
 * @param {HTMLElement} tooltip - Tooltip element
 * @param {string} content - HTML content
 * @param {HTMLElement} target - Target element
 */
function showTooltip(tooltip, content, target) {
    tooltip.innerHTML = content;
    tooltip.classList.remove('hidden');
    tooltip.style.opacity = '1';
    
    // Position tooltip
    positionTooltip(tooltip, target);
}

/**
 * Hide tooltip
 * @param {HTMLElement} tooltip - Tooltip element
 */
function hideTooltip(tooltip) {
    tooltip.classList.add('hidden');
    tooltip.style.opacity = '0';
}

/**
 * Position tooltip relative to the target element
 * @param {HTMLElement} tooltip - Tooltip element
 * @param {HTMLElement} target - Target element
 * @param {number} mouseX - Mouse X coordinate (optional)
 * @param {number} mouseY - Mouse Y coordinate (optional)
 */
export function positionTooltip(tooltip, target, mouseX, mouseY) {
    const rect = target.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    
    let left, top;
    
    if (mouseX && mouseY) {
        // Position relative to mouse cursor
        left = mouseX + 10;
        top = mouseY - tooltipRect.height - 10;
    } else {
        // Position relative to target element
        left = rect.left + (rect.width / 2) - (tooltipRect.width / 2);
        top = rect.top - tooltipRect.height - 10;
    }
    
    // Ensure tooltip stays within viewport
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    // Adjust horizontal position
    if (left < 10) {
        left = 10;
    } else if (left + tooltipRect.width > viewportWidth - 10) {
        left = viewportWidth - tooltipRect.width - 10;
    }
    
    // Adjust vertical position
    if (top < 10) {
        top = rect.bottom + 10; // Show below if not enough space above
    }
    
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
}

/**
 * Generate tooltip content for Total Grade
 * @param {Object} totalGrade - Total grade data
 * @returns {string} HTML content for tooltip
 */
function generateTotalGradeTooltipContent(totalGrade) {
    return `
        <div class="tooltip-header">
            <strong>Total Bufferbloat Grade: ${totalGrade.grade}</strong>
        </div>
        <div class="tooltip-content">
            ${totalGrade.description}
        </div>
    `;
}

/**
 * Clean up tooltip system
 * @param {string} containerId - Container ID
 */
export function cleanupTooltips(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    // Remove tooltip element
    const tooltip = document.getElementById('gradeTooltip');
    if (tooltip) {
        tooltip.remove();
    }
    
    // Remove event listeners by cloning elements (removes all listeners)
    const elementsWithTooltips = container.querySelectorAll('[aria-describedby="gradeTooltip"]');
    elementsWithTooltips.forEach(element => {
        const newElement = element.cloneNode(true);
        element.parentNode.replaceChild(newElement, element);
    });
}

/**
 * Add tooltip CSS styles to the page
 */
export function addTooltipCSS() {
    // Check if CSS is already added
    if (document.getElementById('tooltip-styles')) return;
    
    const style = document.createElement('style');
    style.id = 'tooltip-styles';
    style.textContent = `
        .grade-tooltip {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }
        
        .grade-tooltip.hidden {
            opacity: 0;
            pointer-events: none;
        }
        
        .tooltip-header {
            margin-bottom: 8px;
            font-weight: 600;
            color: #ffffff;
        }
        
        .tooltip-content {
            color: rgba(255, 255, 255, 0.9);
            font-weight: 400;
        }
        
        /* Focus styles for accessibility */
        .total-grade-box:focus,
        .grade-box:focus {
            outline: 2px solid #4ecdc4;
            outline-offset: 2px;
            border-radius: 8px;
        }
        
        /* Hover cursor for interactive elements */
        .total-grade-box[tabindex],
        .grade-box[tabindex] {
            cursor: help;
        }
        
        /* Smooth transitions */
        .total-grade-box,
        .grade-box {
            transition: transform 0.2s ease-in-out;
        }
        
        .total-grade-box:hover,
        .grade-box:hover {
            transform: translateY(-2px);
        }
    `;
    
    document.head.appendChild(style);
}

// Auto-add CSS when module is imported
addTooltipCSS();