/**
 * Enhanced Console Logger - Captures ALL console messages and errors
 * Overcomes Firefox's 1000-line export limitation for debugging WebRTC issues
 */

class EnhancedLogger {
    constructor(source = 'Global') {
        this.source = source;
        this.logs = [];
        this.maxLogs = 10000; // Store up to 10k logs
        this.startTime = performance.now();
        this.originalConsole = {};
        
        // Store original console methods
        this.originalConsole.log = console.log;
        this.originalConsole.warn = console.warn;
        this.originalConsole.error = console.error;
        this.originalConsole.debug = console.debug;
        this.originalConsole.info = console.info;
        
        this.init();
    }
    
    init() {
        console.log('🔍 Enhanced Logger initialized - capturing all console output');
        
        // Override console methods
        this.interceptConsole();
        
        // Capture unhandled errors
        this.captureErrors();
        
        // Add WebRTC specific logging
        this.setupWebRTCLogging();
        
        // Add export functionality
        this.addExportControls();
    }
    
    interceptConsole() {
        const self = this;
        
        ['log', 'warn', 'error', 'debug', 'info'].forEach(level => {
            console[level] = function(...args) {
                // Call original console method
                self.originalConsole[level].apply(console, args);
                
                // Store in our log system
                self.addLog(level, args);
            };
        });
    }
    
    addLog(level, args) {
        const timestamp = performance.now() - this.startTime;
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
        
        // Filter out verbose/unnecessary logs to reduce context window usage
        if (this.shouldFilterLog(level, message)) {
            return;
        }
        
        const logEntry = {
            timestamp: timestamp,
            level: level,
            message: message,
            stack: level === 'error' ? new Error().stack : null,
            url: window.location.href,
            userAgent: navigator.userAgent
        };
        
        this.logs.push(logEntry);
        
        // Trim logs if too many - use the configured maxLogs value
        if (this.logs.length > this.maxLogs) {
            this.logs.shift();
        }
        
        // Update real-time display if visible (throttled)
        this.throttledUpdateDisplay();
    }
    
    shouldFilterLog(level, message) {
        // Filter out verbose logs that break LLM context window
        const verbosePatterns = [
            // WebSocket traffic updates (too frequent)
            /📊 Received traffic update from/,
            /📊 Processing traffic data from/,
            /📊 Traffic update from/,
            /🚀 Dispatching traffic-update event/,
            
            // Real-time metrics (too frequent)
            /📊 Latest latency measurements/,
            /📊 Throughput update from/,
            
            // WebSocket worker messages (too verbose)
            /📤 Starting upload traffic for/,
            /📥 Requesting download traffic for/,
            /📡 WebSocket connected for/,
            /📡 WebSocket closed for/,
            
            // ICE candidates (not needed for WebSocket architecture)
            /🧊 ICE candidate generated/,
            /🧊 ICE connection state/,
            /🧊 ICE gathering state/,
            /🌐 Sending ICE candidate/,
            /🌐 ICE candidate response/,
            
            // Frequent status updates
            /📨 Unhandled message from/,
            /📨 Unknown control message/,
            
            // Memory usage (too frequent)
            /📊 Virtual Household memory usage/,
            
            // Sentiment calculations (too frequent)
            /📊 Processing direct traffic stats/,
            
            // Worker initialization spam
            /🌐 WebSocket Unified worker received message/,
            /🌐 Initializing WebSocket Unified worker/
        ];
        
        // Only filter debug and info level messages, keep warnings and errors
        if (level === 'error' || level === 'warn') {
            return false;
        }
        
        return verbosePatterns.some(pattern => pattern.test(message));
    }
    
    throttledUpdateDisplay() {
        // Throttle display updates to reduce performance impact
        if (!this.displayUpdateTimeout) {
            this.displayUpdateTimeout = setTimeout(() => {
                this.updateLogDisplay();
                this.displayUpdateTimeout = null;
            }, 500); // Update every 500ms instead of immediately
        }
    }
    
    captureErrors() {
        const self = this;
        
        // Capture unhandled errors
        window.addEventListener('error', (event) => {
            self.addLog('error', [
                `Unhandled Error: ${event.message}`,
                `File: ${event.filename}:${event.lineno}:${event.colno}`,
                `Stack: ${event.error?.stack || 'No stack trace'}`
            ]);
        });
        
        // Capture unhandled promise rejections
        window.addEventListener('unhandledrejection', (event) => {
            self.addLog('error', [
                `Unhandled Promise Rejection: ${event.reason}`,
                `Stack: ${event.reason?.stack || 'No stack trace'}`
            ]);
        });
    }
    
    setupWebRTCLogging() {
        // WebRTC logging disabled - system now uses WebSocket architecture
        // This reduces log verbosity significantly since WebRTC events are not relevant
        console.log('🔗 WebRTC logging disabled - using WebSocket architecture');
    }
    
    addExportControls() {
        // Wait for DOM to be ready
        if (!document.body) {
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', () => this.addExportControls());
                return;
            } else {
                setTimeout(() => this.addExportControls(), 100);
                return;
            }
        }
        
        // Don't add controls if they already exist
        if (document.getElementById('enhanced-logger-export-btn')) {
            return;
        }
        
        // Add export button to page
        const exportButton = document.createElement('button');
        exportButton.id = 'enhanced-logger-export-btn';
        exportButton.textContent = '📥 Export Full Logs';
        exportButton.style.cssText = `
            position: fixed;
            top: 10px;
            right: 10px;
            z-index: 10000;
            background: #007bff;
            color: white;
            border: none;
            padding: 10px 15px;
            border-radius: 5px;
            cursor: pointer;
            font-size: 14px;
            display: none;
        `;
        exportButton.onclick = () => this.exportLogs();
        document.body.appendChild(exportButton);
        
        // Add toggle log display button
        const toggleButton = document.createElement('button');
        toggleButton.id = 'enhanced-logger-toggle-btn';
        toggleButton.textContent = '👁️ Toggle Logs';
        toggleButton.style.cssText = `
            position: fixed;
            top: 10px;
            right: 150px;
            z-index: 10000;
            background: #28a745;
            color: white;
            border: none;
            padding: 10px 15px;
            border-radius: 5px;
            cursor: pointer;
            font-size: 14px;
            display: none;
        `;
        toggleButton.onclick = () => this.toggleLogDisplay();
        document.body.appendChild(toggleButton);
        
        // Create log display panel
        this.createLogDisplay();
    }
    
    createLogDisplay() {
        // Wait for DOM to be ready
        if (!document.body) {
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', () => this.createLogDisplay());
                return;
            } else {
                setTimeout(() => this.createLogDisplay(), 100);
                return;
            }
        }
        
        // Don't create if already exists
        if (document.getElementById('enhanced-log-display')) {
            this.logDisplay = document.getElementById('enhanced-log-display');
            return;
        }
        
        this.logDisplay = document.createElement('div');
        this.logDisplay.id = 'enhanced-log-display';
        this.logDisplay.style.cssText = `
            position: fixed;
            bottom: 0;
            left: 0;
            right: 0;
            height: 300px;
            background: rgba(0, 0, 0, 0.9);
            color: #00ff00;
            font-family: monospace;
            font-size: 12px;
            overflow-y: auto;
            padding: 10px;
            z-index: 9999;
            display: none;
            border-top: 2px solid #007bff;
        `;
        document.body.appendChild(this.logDisplay);
    }
    
    toggleLogDisplay() {
        if (this.logDisplay.style.display === 'none') {
            this.logDisplay.style.display = 'block';
            this.updateLogDisplay();
        } else {
            this.logDisplay.style.display = 'none';
        }
    }
    
    updateLogDisplay() {
        if (!this.logDisplay || this.logDisplay.style.display === 'none') return;
        
        const recentLogs = this.logs.slice(-100); // Show last 100 logs
        this.logDisplay.innerHTML = recentLogs.map(log => {
            const time = (log.timestamp / 1000).toFixed(3);
            const levelColor = {
                'error': '#ff4444',
                'warn': '#ffaa00',
                'info': '#4444ff',
                'debug': '#888888',
                'log': '#00ff00'
            }[log.level] || '#00ff00';
            
            return `<div style="color: ${levelColor}; margin-bottom: 2px;">
                [${time}s] [${log.level.toUpperCase()}] ${log.message}
            </div>`;
        }).join('');
        
        // Auto-scroll to bottom
        this.logDisplay.scrollTop = this.logDisplay.scrollHeight;
    }
    
    exportLogs() {
        // Create plain text format for easier grep analysis
        const exportTime = new Date().toISOString();
        const sessionDuration = (performance.now() - this.startTime) / 1000;
        
        let textOutput = '';
        textOutput += `=== Enhanced Logger Export ===\n`;
        textOutput += `Export Time: ${exportTime}\n`;
        textOutput += `Total Logs: ${this.logs.length}\n`;
        textOutput += `Session Duration: ${sessionDuration.toFixed(2)}s\n`;
        textOutput += `URL: ${window.location.href}\n`;
        textOutput += `User Agent: ${navigator.userAgent}\n`;
        textOutput += `=== Log Entries ===\n\n`;
        
        // Convert logs to plain text format
        this.logs.forEach(log => {
            const timestamp = (log.timestamp / 1000).toFixed(3);
            const level = log.level.toUpperCase().padEnd(5);
            textOutput += `[${timestamp}s] [${level}] ${log.message}\n`;
            
            // Add stack trace for errors
            if (log.stack && log.level === 'error') {
                textOutput += `    Stack: ${log.stack}\n`;
            }
        });
        
        // Create downloadable file
        const blob = new Blob([textOutput], {
            type: 'text/plain'
        });
        
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `enhanced-logs-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        console.log(`📥 Exported ${this.logs.length} logs to .txt file for easier grep analysis`);
    }
    
    // Public API for manual logging
    logWebRTC(message, data = {}) {
        this.addLog('info', [`🔗 WebRTC: ${message}`, data]);
    }
    
    logICE(message, candidate = null) {
        const logData = candidate ? [
            `🧊 ICE: ${message}`,
            `Type: ${candidate.type || 'N/A'}`,
            `Protocol: ${candidate.protocol || 'N/A'}`,
            `Candidate: ${candidate.candidate || 'N/A'}`
        ] : [`🧊 ICE: ${message}`];
        
        this.addLog('debug', logData);
    }
    
    logDataChannel(message, channel = null) {
        const logData = channel ? [
            `📡 Channel: ${message}`,
            `Label: ${channel.label}`,
            `State: ${channel.readyState}`,
            `Buffered: ${channel.bufferedAmount || 0} bytes`
        ] : [`📡 Channel: ${message}`];
        
        this.addLog('info', logData);
    }
    
    // Get filtered logs
    getWebRTCLogs() {
        return this.logs.filter(log => 
            log.message.includes('🔗') || 
            log.message.includes('🧊') || 
            log.message.includes('📡') ||
            log.message.includes('WebRTC') ||
            log.message.includes('ICE') ||
            log.message.includes('channel')
        );
    }
    
    getErrorLogs() {
        return this.logs.filter(log => log.level === 'error');
    }
    
    // Clear logs
    clearLogs() {
        this.logs = [];
        this.updateLogDisplay();
        console.log('🗑️ Enhanced logs cleared');
    }
    
    // Public API methods expected by Virtual Household mode
    log(...args) {
        this.addLog('log', args);
    }
    
    warn(...args) {
        this.addLog('warn', args);
    }
    
    error(...args) {
        this.addLog('error', args);
    }
    
    info(...args) {
        this.addLog('info', args);
    }
    
    debug(...args) {
        this.addLog('debug', args);
    }
    
    // Get statistics
    getStats() {
        const totalSize = JSON.stringify(this.logs).length;
        const timestamps = this.logs.map(log => log.timestamp);
        
        return {
            totalEntries: this.logs.length,
            totalSize: totalSize,
            oldestEntry: timestamps.length > 0 ? Math.min(...timestamps) + this.startTime : Date.now(),
            newestEntry: timestamps.length > 0 ? Math.max(...timestamps) + this.startTime : Date.now()
        };
    }
}

// Make EnhancedLogger available globally
window.EnhancedLogger = EnhancedLogger;

// Initialize global enhanced logger instance
if (!window.enhancedLogger) {
    // Wait for DOM to be ready before initializing
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            window.enhancedLogger = new EnhancedLogger('Global');
        });
    } else {
        window.enhancedLogger = new EnhancedLogger('Global');
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = EnhancedLogger;
}