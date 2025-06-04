/**
 * Automatic Console Logger
 * Captures all console output and saves to downloadable file
 */

class ConsoleLogger {
    constructor() {
        this.logs = [];
        this.startTime = new Date();
        this.isCapturing = false;
        
        // Store original console methods
        this.originalConsole = {
            log: console.log,
            warn: console.warn,
            error: console.error,
            info: console.info,
            debug: console.debug
        };
        
        this.setupUI();
    }
    
    /**
     * Start capturing console logs
     */
    startCapture() {
        if (this.isCapturing) return;
        
        this.isCapturing = true;
        this.logs = [];
        this.startTime = new Date();
        
        // Override console methods
        console.log = (...args) => this.captureLog('LOG', args);
        console.warn = (...args) => this.captureLog('WARN', args);
        console.error = (...args) => this.captureLog('ERROR', args);
        console.info = (...args) => this.captureLog('INFO', args);
        console.debug = (...args) => this.captureLog('DEBUG', args);
        
        this.updateUI();
        this.originalConsole.log('🎬 Console logging started - all output will be captured');
    }
    
    /**
     * Stop capturing and restore original console
     */
    stopCapture() {
        if (!this.isCapturing) return;
        
        // Restore original console methods
        console.log = this.originalConsole.log;
        console.warn = this.originalConsole.warn;
        console.error = this.originalConsole.error;
        console.info = this.originalConsole.info;
        console.debug = this.originalConsole.debug;
        
        this.isCapturing = false;
        this.updateUI();
        
        console.log('🛑 Console logging stopped');
    }
    
    /**
     * Capture a log entry
     */
    captureLog(level, args) {
        const timestamp = new Date();
        const elapsed = timestamp - this.startTime;
        
        // Convert arguments to strings
        const message = args.map(arg => {
            if (typeof arg === 'object') {
                try {
                    return JSON.stringify(arg, null, 2);
                } catch (e) {
                    return String(arg);
                }
            }
            return String(arg);
        }).join(' ');
        
        // Store log entry
        this.logs.push({
            timestamp: timestamp.toISOString(),
            elapsed: elapsed,
            level: level,
            message: message
        });
        
        // Call original console method
        this.originalConsole[level.toLowerCase()](...args);
        
        // Update log count in UI
        this.updateLogCount();
    }
    
    /**
     * Download logs as a file
     */
    downloadLogs() {
        if (this.logs.length === 0) {
            alert('No logs captured yet. Start capture first.');
            return;
        }
        
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `console-logs-${timestamp}.txt`;
        
        // Format logs for download
        let content = `Console Logs Export\n`;
        content += `Generated: ${new Date().toISOString()}\n`;
        content += `Session Duration: ${(Date.now() - this.startTime) / 1000}s\n`;
        content += `Total Entries: ${this.logs.length}\n`;
        content += `${'='.repeat(80)}\n\n`;
        
        this.logs.forEach((log, index) => {
            content += `[${log.timestamp}] [+${(log.elapsed/1000).toFixed(3)}s] [${log.level}] ${log.message}\n`;
        });
        
        // Create and download file
        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        console.log(`📁 Logs downloaded as ${filename}`);
    }
    
    /**
     * Clear captured logs
     */
    clearLogs() {
        this.logs = [];
        this.startTime = new Date();
        this.updateLogCount();
        console.log('🗑️ Console logs cleared');
    }
    
    /**
     * Setup UI controls
     */
    setupUI() {
        // Create floating control panel
        const panel = document.createElement('div');
        panel.id = 'console-logger-panel';
        panel.style.cssText = `
            position: fixed;
            top: 10px;
            right: 10px;
            background: #2d3748;
            color: white;
            padding: 10px;
            border-radius: 8px;
            font-family: monospace;
            font-size: 12px;
            z-index: 10000;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            min-width: 200px;
            display: none;
        `;
        
        panel.innerHTML = `
            <div style="font-weight: bold; margin-bottom: 8px;">📊 Console Logger</div>
            <div id="logger-status">Ready</div>
            <div id="logger-count" style="margin: 5px 0;">Logs: 0</div>
            <div style="display: flex; gap: 5px; flex-wrap: wrap;">
                <button id="logger-start" style="background: #48bb78; color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 11px;">Start</button>
                <button id="logger-stop" style="background: #f56565; color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 11px;" disabled>Stop</button>
                <button id="logger-download" style="background: #4299e1; color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 11px;">Download</button>
                <button id="logger-clear" style="background: #a0aec0; color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 11px;">Clear</button>
            </div>
        `;
        
        document.body.appendChild(panel);
        
        // Add event listeners
        document.getElementById('logger-start').onclick = () => this.startCapture();
        document.getElementById('logger-stop').onclick = () => this.stopCapture();
        document.getElementById('logger-download').onclick = () => this.downloadLogs();
        document.getElementById('logger-clear').onclick = () => this.clearLogs();
        
        // Listen for debug mode changes
        this.setupDebugModeListener();
    }
    
    /**
     * Setup listener for debug mode changes
     */
    setupDebugModeListener() {
        // Check initial debug mode state
        this.updateVisibility();
        
        // Listen for debug mode toggle changes
        const checkDebugMode = () => {
            this.updateVisibility();
        };
        
        // Check periodically for debug mode changes
        setInterval(checkDebugMode, 100);
        
        // Also listen for the debug mode toggle if it exists
        const debugToggle = document.getElementById('debugModeToggle');
        if (debugToggle) {
            debugToggle.addEventListener('change', checkDebugMode);
        } else {
            // If toggle doesn't exist yet, wait for it
            const waitForToggle = setInterval(() => {
                const toggle = document.getElementById('debugModeToggle');
                if (toggle) {
                    toggle.addEventListener('change', checkDebugMode);
                    clearInterval(waitForToggle);
                }
            }, 100);
        }
    }
    
    /**
     * Update panel visibility based on debug mode
     */
    updateVisibility() {
        const panel = document.getElementById('console-logger-panel');
        if (panel) {
            panel.style.display = window.debugMode ? 'block' : 'none';
        }
    }
    
    /**
     * Update UI status
     */
    updateUI() {
        const status = document.getElementById('logger-status');
        const startBtn = document.getElementById('logger-start');
        const stopBtn = document.getElementById('logger-stop');
        
        if (this.isCapturing) {
            status.textContent = '🔴 Recording...';
            status.style.color = '#f56565';
            startBtn.disabled = true;
            stopBtn.disabled = false;
        } else {
            status.textContent = '⚪ Stopped';
            status.style.color = '#a0aec0';
            startBtn.disabled = false;
            stopBtn.disabled = true;
        }
    }
    
    /**
     * Update log count display
     */
    updateLogCount() {
        const countEl = document.getElementById('logger-count');
        if (countEl) {
            countEl.textContent = `Logs: ${this.logs.length}`;
        }
    }
}

// Auto-initialize when page loads
let consoleLogger;
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        consoleLogger = new ConsoleLogger();
    });
} else {
    consoleLogger = new ConsoleLogger();
}

// Export for manual use
window.ConsoleLogger = ConsoleLogger;
window.consoleLogger = consoleLogger;