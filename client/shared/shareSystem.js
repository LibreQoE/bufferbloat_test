/**
 * Share System Module
 * Handles PNG generation and sharing functionality for test results
 * Supports both Single User Test and Virtual Household Test formats
 */

/**
 * Initialize share functionality
 * @param {Object} data - Unified result data for sharing
 * @param {string} containerId - Container ID
 */
export function initializeShareSystem(data, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    // Find or create share button
    let shareBtn = container.querySelector('#shareResultBtn');
    if (!shareBtn) {
        shareBtn = createShareButton(container);
    }

    // Remove any existing event listeners by cloning the button
    const newShareBtn = shareBtn.cloneNode(true);
    shareBtn.parentNode.replaceChild(newShareBtn, shareBtn);

    // Add click event listener with button reference
    newShareBtn.addEventListener('click', () => handleShareClick(data, newShareBtn));
}

/**
 * Create share button if it doesn't exist
 * @param {HTMLElement} container - Container element
 * @returns {HTMLElement} Share button element
 */
function createShareButton(container) {
    const shareBtn = document.createElement('button');
    shareBtn.id = 'shareResultBtn';
    shareBtn.className = 'share-btn';
    shareBtn.innerHTML = '<span class="share-icon">📤</span> Share My Result';
    
    // Add button styles
    shareBtn.style.cssText = `
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        border: none;
        padding: 12px 24px;
        border-radius: 8px;
        font-size: 16px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.3s ease;
        margin: 20px auto;
        display: block;
        box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
    `;

    // Add hover effect
    shareBtn.addEventListener('mouseenter', () => {
        shareBtn.style.transform = 'translateY(-2px)';
        shareBtn.style.boxShadow = '0 6px 16px rgba(102, 126, 234, 0.4)';
    });

    shareBtn.addEventListener('mouseleave', () => {
        shareBtn.style.transform = 'translateY(0)';
        shareBtn.style.boxShadow = '0 4px 12px rgba(102, 126, 234, 0.3)';
    });

    // Insert button at the end of the container
    container.appendChild(shareBtn);
    return shareBtn;
}

/**
 * Handle share button click
 * @param {Object} data - Unified result data
 * @param {HTMLElement} shareBtn - The specific share button that was clicked
 */
async function handleShareClick(data, shareBtn) {
    if (!shareBtn) return;

    const originalText = shareBtn.innerHTML;
    
    try {
        // Update button to show loading state
        shareBtn.innerHTML = '<span class="share-icon">⏳</span> Generating...';
        shareBtn.disabled = true;
        
        // Generate and download the PNG
        await generateShareablePNG(data);
        
        // Update button to show success
        shareBtn.innerHTML = '<span class="share-icon">✅</span> Downloaded!';
        
        // Reset button after 2 seconds
        setTimeout(() => {
            shareBtn.innerHTML = originalText;
            shareBtn.disabled = false;
        }, 2000);
        
    } catch (error) {
        console.error('Error generating shareable PNG:', error);
        
        // Update button to show error
        shareBtn.innerHTML = '<span class="share-icon">❌</span> Error';
        
        // Reset button after 2 seconds
        setTimeout(() => {
            shareBtn.innerHTML = originalText;
            shareBtn.disabled = false;
        }, 2000);
    }
}

/**
 * Generate a shareable PNG image of the test results
 * @param {Object} data - Unified result data
 * @returns {Promise<Blob>} PNG image blob
 */
export async function generateShareablePNG(data) {
    // Check if html2canvas is available
    if (typeof html2canvas === 'undefined') {
        throw new Error('html2canvas library is not available');
    }

    // Create a temporary container for the shareable content
    const shareableContainer = createShareableContent(data);
    
    // Temporarily add it to the DOM (hidden)
    shareableContainer.style.position = 'absolute';
    shareableContainer.style.left = '-9999px';
    shareableContainer.style.top = '-9999px';
    shareableContainer.style.zIndex = '-1';
    document.body.appendChild(shareableContainer);
    
    try {
        // Generate the canvas using html2canvas
        const canvas = await html2canvas(shareableContainer, {
            backgroundColor: '#22252a', // Match the background color
            scale: 2, // Higher resolution for better quality
            useCORS: true,
            allowTaint: true,
            width: 500, // Fixed width to eliminate dead space
            height: shareableContainer.offsetHeight
        });
        
        // Convert canvas to blob and download
        return new Promise((resolve) => {
            canvas.toBlob((blob) => {
                downloadPNG(blob, generateFilename(data));
                resolve(blob);
            }, 'image/png');
        });
        
    } finally {
        // Remove the temporary container
        document.body.removeChild(shareableContainer);
    }
}

/**
 * Create a shareable content container with the grades
 * @param {Object} data - Unified result data
 * @returns {HTMLElement} Shareable content container
 */
export function createShareableContent(data) {
    const container = document.createElement('div');
    container.className = 'shareable-content';
    container.style.cssText = `
        width: 500px;
        margin: 0 auto;
        background: #22252a;
        color: white;
        padding: 30px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        box-sizing: border-box;
    `;
    
    // Create content based on test type
    if (data.metadata.testType === 'single-user') {
        container.innerHTML = createSingleUserShareContent(data);
    } else {
        container.innerHTML = createVirtualHouseholdShareContent(data);
    }
    
    return container;
}

/**
 * Create share content for Single User Test
 * @param {Object} data - Unified result data
 * @returns {string} HTML content
 */
function createSingleUserShareContent(data) {
    const phasesHTML = data.phases
        .filter(phase => phase.showInShareImage)
        .map(phase => `
            <div class="grade-box" style="text-align: center; background: rgba(255, 255, 255, 0.1); border-radius: 8px; padding: 15px; min-width: 120px; max-width: 140px;">
                <h3 style="margin: 0 0 8px 0; font-size: 14px; color: rgba(255, 255, 255, 0.8);">${phase.name}</h3>
                <div class="grade ${phase.cssClass}" style="font-size: 28px; font-weight: bold; margin-bottom: 6px;">${phase.grade}</div>
                <p style="font-size: 12px; color: rgba(255, 255, 255, 0.7); margin: 0;">${phase.metric}</p>
            </div>
        `).join('');

    return `
        <div style="text-align: center; margin-bottom: 25px;">
            <img src="logo.svg" alt="LibreQoS Logo" style="width: 120px; height: auto; margin-bottom: 10px;">
            <h2 style="color: #ffffff; margin: 0; font-size: 24px;">LibreQoS Bufferbloat Test</h2>
            <p style="color: rgba(255, 255, 255, 0.8); margin: 5px 0 0 0; font-size: 16px;">${data.metadata.shareTitle}</p>
        </div>
        
        <div class="total-grade-container" style="text-align: center; margin-bottom: 25px;">
            <div class="total-grade-box" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; border-radius: 12px; position: relative;">
                <h2 style="margin: 0 0 10px 0; font-size: 18px; color: white;">Total Bufferbloat Grade</h2>
                <div class="total-grade ${data.totalGrade.cssClass}" style="font-size: 48px; font-weight: bold; color: white; margin-bottom: 8px;">${data.totalGrade.grade}</div>
                <p style="margin: 0; font-size: 14px; color: rgba(255, 255, 255, 0.9);">Combined score from all test phases</p>
                ${data.totalGrade.showApproved ? '<img src="approved.png" alt="Approved" style="position: absolute; top: 10px; right: 10px; width: 40px; height: 40px;">' : ''}
            </div>
        </div>
        
        <div class="individual-grades-section">
            <h3 style="text-align: center; margin: 0 0 15px 0; font-size: 16px; color: rgba(255, 255, 255, 0.9);">Individual Phase Grades</h3>
            <div style="display: flex; justify-content: center; gap: 15px; flex-wrap: wrap;">
                ${phasesHTML}
            </div>
        </div>
        
        <div class="share-footer" style="text-align: center; margin-top: 25px; padding-top: 20px; border-top: 1px solid rgba(255, 255, 255, 0.2);">
            <p style="margin: 0 0 5px 0; font-size: 14px; color: rgba(255, 255, 255, 0.9);">Test your connection at <strong>test.libreqos.com</strong></p>
            <p style="font-size: 12px; margin: 0; color: rgba(255, 255, 255, 0.7);">Tested on ${new Date().toLocaleDateString()}</p>
        </div>
    `;
}

/**
 * Create share content for Virtual Household Test
 * @param {Object} data - Unified result data
 * @returns {string} HTML content
 */
function createVirtualHouseholdShareContent(data) {
    const phasesHTML = data.phases
        .filter(phase => phase.showInShareImage)
        .map(phase => `
            <div class="grade-box" style="text-align: center; background: rgba(255, 255, 255, 0.1); border-radius: 8px; padding: 15px; min-width: 120px; max-width: 140px;">
                <h3 style="margin: 0 0 8px 0; font-size: 14px; color: rgba(255, 255, 255, 0.8);">${phase.name}</h3>
                <div class="grade ${phase.cssClass}" style="font-size: 28px; font-weight: bold; margin-bottom: 6px;">${phase.grade}</div>
                <p style="font-size: 12px; color: rgba(255, 255, 255, 0.7); margin: 0;">${phase.metric}</p>
            </div>
        `).join('');

    return `
        <div style="text-align: center; margin-bottom: 25px;">
            <img src="logo.svg" alt="LibreQoS Logo" style="width: 120px; height: auto; margin-bottom: 10px;">
            <h2 style="color: #ffffff; margin: 0; font-size: 24px;">LibreQoS Virtual Household Test</h2>
            <p style="color: rgba(255, 255, 255, 0.8); margin: 5px 0 0 0; font-size: 16px;">${data.metadata.shareTitle}</p>
        </div>
        
        <div class="total-grade-container" style="text-align: center; margin-bottom: 25px;">
            <div class="total-grade-box" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; border-radius: 12px; position: relative;">
                <h2 style="margin: 0 0 10px 0; font-size: 18px; color: white;">Overall Network Grade</h2>
                <div class="total-grade ${data.totalGrade.cssClass}" style="font-size: 48px; font-weight: bold; color: white; margin-bottom: 8px;">${data.totalGrade.grade}</div>
                <p style="margin: 0; font-size: 14px; color: rgba(255, 255, 255, 0.9);">Virtual household performance</p>
                ${data.totalGrade.showApproved ? '<img src="approved.png" alt="Approved" style="position: absolute; top: 10px; right: 10px; width: 40px; height: 40px;">' : ''}
            </div>
        </div>
        
        <div class="individual-grades-section">
            <h3 style="text-align: center; margin: 0 0 15px 0; font-size: 16px; color: rgba(255, 255, 255, 0.9);">Network Performance Metrics</h3>
            <div style="display: flex; justify-content: center; gap: 15px; flex-wrap: wrap;">
                ${phasesHTML}
            </div>
        </div>
        
        <div class="share-footer" style="text-align: center; margin-top: 25px; padding-top: 20px; border-top: 1px solid rgba(255, 255, 255, 0.2);">
            <p style="margin: 0 0 5px 0; font-size: 14px; color: rgba(255, 255, 255, 0.9);">Test your household at <strong>test.libreqos.com</strong></p>
            <p style="font-size: 12px; margin: 0; color: rgba(255, 255, 255, 0.7);">Tested on ${new Date().toLocaleDateString()}</p>
        </div>
    `;
}

/**
 * Download PNG image
 * @param {Blob} blob - PNG image blob
 * @param {string} filename - Download filename
 */
export function downloadPNG(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

/**
 * Generate filename for download
 * @param {Object} data - Unified result data
 * @returns {string} Filename
 */
function generateFilename(data) {
    const testType = data.metadata.testType === 'single-user' ? 'Bufferbloat' : 'Virtual-Household';
    const date = new Date().toISOString().split('T')[0];
    return `LibreQoS-${testType}-Test-Result-${date}.png`;
}

/**
 * Check if sharing is supported
 * @returns {boolean} True if html2canvas is available
 */
export function isSharingSupported() {
    return typeof html2canvas !== 'undefined';
}

/**
 * Add share system CSS styles
 */
export function addShareCSS() {
    // Check if CSS is already added
    if (document.getElementById('share-styles')) return;
    
    const style = document.createElement('style');
    style.id = 'share-styles';
    style.textContent = `
        /* Grade color classes for share images */
        .grade.a-plus { color: #00ff00; }
        .grade.a { color: #7fff00; }
        .grade.b { color: #ffff00; }
        .grade.c { color: #ffa500; }
        .grade.d { color: #ff6347; }
        .grade.f { color: #ff0000; }
        
        /* Share button disabled state */
        .share-btn:disabled {
            opacity: 0.7;
            cursor: not-allowed;
            transform: none !important;
        }
        
        /* Shareable content styling */
        .shareable-content * {
            box-sizing: border-box;
        }
    `;
    
    document.head.appendChild(style);
}

// Auto-add CSS when module is imported
addShareCSS();