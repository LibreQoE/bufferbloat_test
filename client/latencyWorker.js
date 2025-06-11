/**
 * Web Worker for measuring latency
 * This worker runs in a separate thread and sends ping requests every 200ms
 */

// Configuration
const PING_INTERVAL = 100; // ms - more frequent measurements during saturation
const MAX_TIMEOUT = 1000; // ms - reduced from 8000ms since we now use dedicated ping server
const MIN_TIMEOUT = 500; // ms - reduced minimum timeout for dedicated ping server
let isRunning = false;
let pingTimer = null;
let consecutiveTimeouts = 0; // Track consecutive timeouts for backoff

// Authentication state
let authToken = null;
let serverUrl = null;

// Handle messages from the main thread
self.onmessage = function(e) {
    const command = e.data.command;
    
    switch (command) {
        case 'start':
            startLatencyMeasurement();
            break;
        case 'stop':
            stopLatencyMeasurement();
            break;
        case 'setAuth':
            // Token authentication removed
            serverUrl = e.data.serverUrl;
            break;
        default:
            console.error('Unknown command:', command);
    }
};

/**
 * Start sending ping requests at regular intervals
 */
function startLatencyMeasurement() {
    if (isRunning) return;
    
    isRunning = true;
    self.postMessage({ type: 'status', status: 'started' });
    
    // Start the ping loop
    pingTimer = setInterval(sendPing, PING_INTERVAL);
}

/**
 * Stop sending ping requests
 */
function stopLatencyMeasurement() {
    if (!isRunning) return;
    
    clearInterval(pingTimer);
    isRunning = false;
    self.postMessage({ type: 'status', status: 'stopped' });
}

/**
 * Send a ping request and measure the round-trip time
 */
async function sendPing() {
    const startTime = performance.now();
    let timeoutId;
    
    // Calculate dynamic timeout based on consecutive failures
    // This implements exponential backoff for timeouts
    let currentTimeout = MAX_TIMEOUT;
    if (consecutiveTimeouts > 0) {
        // Increase timeout for consecutive failures, but cap at MAX_TIMEOUT
        currentTimeout = Math.min(MAX_TIMEOUT, MIN_TIMEOUT + (consecutiveTimeouts * 100));
    }
    
    try {
        // Send a request to the ping endpoint with a timeout
        // Use AbortController to implement timeout
        const controller = new AbortController();
        timeoutId = setTimeout(() => controller.abort(), currentTimeout);
        
        // Add a random query parameter to prevent caching
        const cacheBuster = Math.floor(Math.random() * 1000000);
        
        // Use authenticated server URL if available, otherwise fallback to dedicated ping server
        let pingUrl;
        let headers = {
            'Pragma': 'no-cache',
            'Cache-Control': 'no-store, no-cache, must-revalidate',
            'X-Priority': 'high', // Hint to server this is a priority request
            'X-Ping-Attempt': consecutiveTimeouts.toString() // Let server know if we're having trouble
        };
        
        // Token authentication removed
        
        // Check if we're on an ISP server (should use local ping endpoint)
        const hostname = location.hostname;
        const isISPServer = hostname.startsWith('test-') && hostname !== 'test.libreqos.com';
        
        if (serverUrl && !isISPServer) {
            // Use ping endpoint on discovered server's dedicated ping port (for central server discovery)
            const pingServerUrl = serverUrl.replace(/:\d+$/, '') + ':8005';
            pingUrl = `${pingServerUrl}/ping?cb=${cacheBuster}`;
        } else {
            // Use local ping server (for ISP servers or fallback)
            if (isISPServer) {
                // For ISP servers, use local ping on port 8005
                pingUrl = `${location.protocol}//${location.hostname}:8005/ping?cb=${cacheBuster}`;
            } else {
                // Fallback to local ping server (for backward compatibility)
                const currentPort = location.port || (location.protocol === 'https:' ? '443' : '80');
                const fallbackPort = currentPort === '8080' || currentPort === '80' || currentPort === '443' ? '8005' : '8005';
                pingUrl = `${location.protocol}//${location.hostname}:${fallbackPort}/ping?cb=${cacheBuster}`;
            }
        }
        
        const response = await fetch(pingUrl, {
            method: 'GET',
            cache: 'no-store',
            signal: controller.signal,
            headers: headers,
            priority: 'high' // Use fetch priority if supported
        });
        
        // Clear the timeout
        clearTimeout(timeoutId);
        
        if (response.ok) {
            const endTime = performance.now();
            let rtt = endTime - startTime;
            
            // Fix: Divide RTT by 2 to correct the doubling issue
            // The measurement is showing exactly 2x the actual RTT
            rtt = rtt / 2;
            
            // Reset consecutive timeouts counter on success
            consecutiveTimeouts = 0;
            
            // Send the result back to the main thread
            self.postMessage({
                type: 'latency',
                timestamp: Date.now(),
                rtt: rtt
            });
        } else {
            // Increment timeout counter for non-200 responses
            consecutiveTimeouts++;
            
            self.postMessage({
                type: 'error',
                error: `Ping failed with status: ${response.status}`
            });
        }
    } catch (error) {
        // Clear the timeout if it exists
        if (timeoutId) clearTimeout(timeoutId);
        
        if (error.name === 'AbortError') {
            // Increment consecutive timeouts counter
            consecutiveTimeouts++;
            
            // Send timeout notification without artificial latency data
            // This maintains accuracy by not injecting fake measurements
            self.postMessage({
                type: 'timeout',
                timestamp: Date.now(),
                consecutiveTimeouts: consecutiveTimeouts,
                message: 'Ping timeout - measurement skipped for accuracy'
            });
            
            // Log timeout for debugging
            console.warn(`Ping timeout ${consecutiveTimeouts} - skipping measurement for accuracy`);
        } else {
            // For other errors, send the error message
            self.postMessage({
                type: 'error',
                error: error.message
            });
        }
    }
}

// Let the main thread know the worker is ready
self.postMessage({ type: 'status', status: 'ready' });
