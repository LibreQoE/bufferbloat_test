/**
 * Share Module
 * Handles generating and sharing PNG images of test results
 */

/**
 * Initialize share functionality
 */
function initializeShare() {
    const shareBtn = document.getElementById('shareResultBtn');
    if (shareBtn) {
        shareBtn.addEventListener('click', handleShareClick);
    }
}

/**
 * Handle share button click
 */
async function handleShareClick() {
    const shareBtn = document.getElementById('shareResultBtn');
    const originalText = shareBtn.innerHTML;
    
    try {
        // Update button to show loading state
        shareBtn.innerHTML = '<span class="share-icon">⏳</span> Generating...';
        shareBtn.disabled = true;
        
        // Generate and download the PNG
        await generateShareablePNG();
        
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
 */
async function generateShareablePNG() {
    // Create a temporary container for the shareable content
    const shareableContainer = createShareableContent();
    
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
            width: 500, // Reduced width to eliminate dead space
            height: shareableContainer.offsetHeight
        });
        
        // Convert canvas to blob and download
        canvas.toBlob((blob) => {
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `LibreQoS-Bufferbloat-Test-Result-${new Date().toISOString().split('T')[0]}.png`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        }, 'image/png');
        
    } finally {
        // Remove the temporary container
        document.body.removeChild(shareableContainer);
    }
}

/**
 * Create a shareable content container with the grades
 */
function createShareableContent() {
    const container = document.createElement('div');
    container.className = 'shareable-content';
    container.style.width = '500px'; // Set fixed width for better centering
    container.style.margin = '0 auto'; // Center the container
    
    // Get current grades and data
    const totalGrade = document.getElementById('totalGrade');
    const downloadGrade = document.getElementById('downloadGrade');
    const uploadGrade = document.getElementById('uploadGrade');
    const bidirectionalGrade = document.getElementById('bidirectionalGrade');
    
    const downloadLatencyIncrease = document.getElementById('downloadLatencyIncrease');
    const uploadLatencyIncrease = document.getElementById('uploadLatencyIncrease');
    const bidirectionalLatencyIncrease = document.getElementById('bidirectionalLatencyIncrease');
    
    // Create the shareable content HTML
    container.innerHTML = `
        <div style="text-align: center; margin-bottom: 25px;">
            <img src="logo.svg" alt="LibreQoS Logo" style="width: 120px; height: auto; margin-bottom: 10px;">
            <h2 style="color: #ffffff; margin: 0; font-size: 24px;">LibreQoS Bufferbloat Test</h2>
            <p style="color: rgba(255, 255, 255, 0.8); margin: 5px 0 0 0; font-size: 16px;">My Connection Results</p>
        </div>
        
        <div class="total-grade-container">
            <div class="total-grade-box">
                <h2>Total Bufferbloat Grade</h2>
                <div class="total-grade ${totalGrade?.className || ''}">${totalGrade?.textContent || 'N/A'}</div>
                <p class="total-grade-description">Combined score from all test phases</p>
                ${totalGrade?.closest('.total-grade-box')?.querySelector('.approved-img')?.outerHTML || ''}
            </div>
        </div>
        
        <div class="individual-grades-section">
            <h3 class="section-title">Individual Phase Grades</h3>
            <div class="grade-container">
                <div class="grade-box">
                    <h3>Download</h3>
                    <div class="grade ${downloadGrade?.className || ''}">${downloadGrade?.textContent || 'N/A'}</div>
                    <p style="font-size: 12px; color: rgba(255, 255, 255, 0.7); margin-top: 5px;">
                        +${downloadLatencyIncrease?.textContent || '-- ms'}
                    </p>
                </div>
                <div class="grade-box">
                    <h3>Upload</h3>
                    <div class="grade ${uploadGrade?.className || ''}">${uploadGrade?.textContent || 'N/A'}</div>
                    <p style="font-size: 12px; color: rgba(255, 255, 255, 0.7); margin-top: 5px;">
                        +${uploadLatencyIncrease?.textContent || '-- ms'}
                    </p>
                </div>
                <div class="grade-box">
                    <h3>Bidirectional</h3>
                    <div class="grade ${bidirectionalGrade?.className || ''}">${bidirectionalGrade?.textContent || 'N/A'}</div>
                    <p style="font-size: 12px; color: rgba(255, 255, 255, 0.7); margin-top: 5px;">
                        +${bidirectionalLatencyIncrease?.textContent || '-- ms'}
                    </p>
                </div>
            </div>
        </div>
        
        <div class="share-footer">
            <p>Test your connection at <strong>test.libreqos.com</strong></p>
            <p style="font-size: 12px; margin-top: 5px;">Tested on ${new Date().toLocaleDateString()}</p>
        </div>
    `;
    
    return container;
}

/**
 * Check if sharing is supported
 */
function isSharingSupported() {
    return typeof html2canvas !== 'undefined';
}

export { initializeShare, isSharingSupported };