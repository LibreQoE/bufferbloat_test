/**
 * Virtual Household Mode - Main Controller
 * Simulates 4 virtual users sharing a connection simultaneously
 */

import LatencyTracker from './latencyTracker.js';
import UIHousehold from './uiHousehold.js';

class VirtualHousehold {
    constructor() {
        this.isActive = false;
        this.isCompleting = false; // Guard against multiple completion calls
        this.testDuration = 30000; // 30 seconds
        this.startTime = null;
        this.latencyTracker = null;
        this.ui = null;
        this.adaptiveController = null;
        this.workers = new Map();
        this.websocketConnections = new Map(); // Track individual WebSocket connections
        this.testResults = {
            users: {},
            overall: {},
            recommendations: []
        };
        
        // Enhanced sentiment tracking
        this.sentimentHistory = new Map(); // userId -> array of sentiment scores
        this.lastSentimentUpdate = new Map(); // userId -> timestamp
        this.currentSentiments = new Map(); // userId -> current sentiment object
        
        // Memory optimization settings
        this.memoryOptimization = {
            enabled: true,
            maxSentimentHistory: 50, // Limit sentiment history per user
            memoryCheckInterval: 10000, // Check every 10 seconds
            lastMemoryCheck: 0,
            totalMemoryUsage: 0
        };
        
        // Real Traffic User Configurations - matching server implementation with realistic patterns
        this.userConfigs = {
            alex: {
                name: 'Alex',
                familyName: 'Alex (Gamer)',
                icon: '👨‍🎮',
                activityIcon: '🎮',
                description: 'Gaming with low latency needs',
                activity: 'Competitive Gaming',
                color: '#45b7d1',
                targetDownload: 0.215,  // Mbps - realistic gaming download (calculated)
                targetUpload: 0.092,    // Mbps - realistic gaming upload (calculated)
                activityType: 'gaming',
                connectionType: 'websocket',
                metrics: ['latency', 'jitter'],
                thresholds: {
                    latency: 75,
                    jitter: 5,
                    loss: 0.1
                },
                statusMessages: {
                    excellent: {
                        stable: ["Connection feels great!", "Zero lag, perfect shots!", "Dominating the server!"],
                        improving: ["Lag is clearing up!", "Getting back in the zone!", "Connection stabilizing!"],
                        degrading: ["Still good but getting choppy", "Hope this doesn't get worse"]
                    },
                    good: {
                        stable: ["Game running smoothly!", "Decent connection", "Playable performance"],
                        improving: ["Getting better!", "Lag reducing nicely", "Connection improving"],
                        degrading: ["Starting to notice some lag", "Connection getting worse"]
                    },
                    fair: {
                        stable: ["Some lag during fights", "Manageable but not great", "Could be better"],
                        improving: ["Lag is improving!", "Getting more playable", "Connection recovering"],
                        degrading: ["This is getting frustrating", "Lag is getting worse"]
                    },
                    poor: {
                        stable: ["Getting frustrated with lag", "Barely playable", "This is terrible"],
                        improving: ["Finally improving!", "About time!", "Getting slightly better"],
                        degrading: ["Unplayable!", "I'm done with this lag!", "Connection is awful!"]
                    }
                }
            },
            sarah: {
                name: 'Sarah',
                familyName: 'Sarah (Video Call)',
                icon: '👩‍💼',
                activityIcon: '💻',
                description: 'HD video conferencing',
                activity: 'Microsoft Teams',
                color: '#45b7d1',
                targetDownload: 1.8,  // Mbps - realistic HD video call download (calculated)
                targetUpload: 1.8,    // Mbps - realistic HD video call upload (calculated)
                activityType: 'video_call',
                connectionType: 'websocket',
                metrics: ['latency', 'jitter'],
                thresholds: {
                    latency: 150,
                    jitter: 10,
                    loss: 0.5
                },
                statusMessages: {
                    excellent: {
                        stable: ["Can everyone hear me?", "Crystal clear audio!", "Perfect call quality"],
                        improving: ["Audio is clearing up!", "Much better now", "Connection stabilizing"],
                        degrading: ["Still clear but getting choppy", "Hope the call stays stable"]
                    },
                    good: {
                        stable: ["Call quality is perfect!", "Good connection", "Audio is clear"],
                        improving: ["Getting clearer!", "Audio improving", "Better connection"],
                        degrading: ["Starting to break up", "Audio getting worse"]
                    },
                    fair: {
                        stable: ["Minor audio issues", "Manageable quality", "Could be clearer"],
                        improving: ["Audio is improving!", "Getting better", "Clearing up nicely"],
                        degrading: ["This is getting choppy", "Audio degrading"]
                    },
                    poor: {
                        stable: ["Call keeps dropping", "Terrible audio", "Can barely hear"],
                        improving: ["Finally getting better!", "Audio improving", "About time!"],
                        degrading: ["Can't continue like this", "Audio is unusable", "Need to reconnect"]
                    }
                }
            },
            jake: {
                name: 'Jake',
                familyName: 'Jake (Netflix)',
                icon: '👨‍💻',
                activityIcon: '📺',
                description: 'HD Netflix streaming with realistic buffering (5 Mbps average)',
                activity: 'Netflix HD',
                color: '#45b7d1',
                targetDownload: 25.0, // Mbps - bursty pattern (1s burst, 4s pause, 5 Mbps average)
                targetUpload: 0.1,    // Mbps - minimal Netflix telemetry
                activityType: 'streaming',
                connectionType: 'websocket',
                metrics: ['quality', 'buffering', 'drops'],
                thresholds: {
                    latency: 300,
                    jitter: 100,
                    loss: 1.0
                },
                statusMessages: {
                    excellent: {
                        stable: ["Enjoying crisp HD video!", "Perfect streaming quality!", "This show looks amazing!"],
                        improving: ["Video quality getting better!", "Much smoother now!", "Back to crystal clear!"],
                        degrading: ["Still looks great", "Hope it stays this smooth"]
                    },
                    good: {
                        stable: ["Good video quality", "Smooth streaming", "Enjoying the show"],
                        improving: ["Picture getting clearer!", "Less stuttering now", "Quality improving"],
                        degrading: ["Starting to see some pixelation", "Getting a bit choppy"]
                    },
                    fair: {
                        stable: ["Some buffering interruptions", "Video quality dropped", "Watchable but not great"],
                        improving: ["Buffering less now", "Picture getting better", "Becoming more watchable"],
                        degrading: ["More frequent pauses", "Quality getting worse"]
                    },
                    poor: {
                        stable: ["Constant buffering pauses", "Very poor video quality", "This is really frustrating"],
                        improving: ["Finally playing smoother!", "Quality starting to improve", "About time!"],
                        degrading: ["Can't watch like this", "Keeps stopping to buffer", "Might switch to something else"]
                    }
                }
            },
            computer: {
                name: 'Computer',
                familyName: 'Computer (Game Updates)',
                icon: '🎮',
                activityIcon: '🎮',
                description: 'Continuous high-speed downloads',
                activity: 'Game Updates',
                color: '#45b7d1',
                targetDownload: 1000.0, // Mbps - adaptive high-speed download (will be updated by speed detection)
                targetUpload: 0.1,    // Mbps - minimal upload (100 Kbps)
                activityType: 'bulk_transfer',
                connectionType: 'websocket',
                metrics: ['throughput', 'progress', 'impact'],
                thresholds: {
                    latency: 5000,
                    jitter: 100,
                    loss: 5.0
                },
                statusMessages: {
                    excellent: {
                        stable: ["Downloading at maximum speed", "Excellent throughput", "Optimal performance"],
                        improving: ["Speed ramping up nicely", "Performance improving", "Getting faster"],
                        degrading: ["Still fast but declining", "Performance dropping slightly"]
                    },
                    good: {
                        stable: ["Good download speed", "Steady high throughput", "Performing well"],
                        improving: ["Speed increasing", "Performance recovering", "Getting better"],
                        degrading: ["Downloads slowing down", "Performance declining"]
                    },
                    fair: {
                        stable: ["Moderate download speed", "Reduced throughput", "Could be faster"],
                        improving: ["Speed recovering", "Performance improving", "Getting better"],
                        degrading: ["Downloads getting slower", "Performance struggling"]
                    },
                    poor: {
                        stable: ["Very slow downloads", "Poor throughput", "Barely progressing"],
                        improving: ["Finally speeding up!", "Performance recovering", "About time!"],
                        degrading: ["Downloads failing", "Connection struggling", "Very poor performance"]
                    }
                }
            }
        };
        
        // Client-side measurement tracking with real throughput calculation
        this.clientStats = {};
        this.throughputCalculationInterval = 500; // Calculate throughput every 500ms
        this.throughputTimers = new Map(); // Track throughput calculation timers per user
        
        // Note: init() is async and will be called separately
        // Don't call it in constructor to avoid race conditions
    }
    
    sendClientConfirmation(userId, websocket) {
        // Send client confirmation every 500ms to avoid overwhelming the server
        const now = performance.now();
        if (!this.lastConfirmation) this.lastConfirmation = {};
        if (!this.lastConfirmation[userId] || now - this.lastConfirmation[userId] > 500) {
            this.lastConfirmation[userId] = now;
            
            const stats = this.clientStats[userId];
            if (stats && websocket.readyState === WebSocket.OPEN) {
                websocket.send(JSON.stringify({
                    type: 'client_confirmation',
                    received_bytes: stats.receivedBytes,
                    sent_bytes: stats.sentBytes,
                    timestamp: now
                }));
            }
        }
    }
    
    getWebSocketServerUrl() {
        // Generate WebSocket URL for workers (since they can't access window.location)
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.host;
        return `${protocol}//${host}`;
    }
    
    getUserTargetThroughput(userId) {
        // Get target throughput from user config
        const config = this.userConfigs[userId];
        if (!config) return 10000000; // 10 Mbps default
        
        // Return download target in bps (server expects this)
        return (config.targetDownload || 10) * 1000000;
    }
    
    getUserUploadTarget(userId) {
        // Get upload target from user config
        const config = this.userConfigs[userId];
        if (!config) return 5000000; // 5 Mbps default
        
        // Return upload target in bps
        return (config.targetUpload || 5) * 1000000;
    }
    
    getUserActivityType(userId) {
        // Get activity type from user config
        const config = this.userConfigs[userId];
        return config?.activityType || 'bulk_transfer';
    }
    
    /**
     * Send adaptive profile update to Computer process on port 8004
     */
    async sendAdaptiveUpdate(downloadSpeed) {
        try {
            console.log('🔧 ADAPTIVE DEBUG: Starting sendAdaptiveUpdate with speed:', downloadSpeed);
            
            // FIXED: Send POST directly to Computer process on port 8004
            // Import server discovery to get the correct server URL
            const { serverDiscovery } = await import('../discovery.js');
            
            // For distributed architecture, use discovered server's hostname
            let hostname, protocol;
            if (serverDiscovery.currentServer) {
                const serverUrl = new URL(serverDiscovery.currentServer.url);
                hostname = serverUrl.hostname;
                protocol = serverUrl.protocol;
            } else {
                // Fallback to current location
                protocol = window.location.protocol;
                hostname = window.location.hostname;
            }
            
            const computerPort = 8004; // Computer process port
            const adaptiveUpdateUrl = `${protocol}//${hostname}:${computerPort}/update-profile`;
            
            console.log('🔧 ADAPTIVE DEBUG: Sending POST to Computer process (port 8004):', adaptiveUpdateUrl);
            console.log('🔧 ADAPTIVE DEBUG: Computer process will update its own profile directly');
            
            const requestBody = {
                user_type: "computer",
                profile_updates: {
                    download_mbps: downloadSpeed,
                    upload_mbps: 0.1, // Keep minimal upload for Computer
                    description: `Computer (${downloadSpeed.toFixed(1)} Mbps detected)`
                }
            };
            console.log('🔧 ADAPTIVE DEBUG: Request body:', requestBody);
            
            const response = await fetch(adaptiveUpdateUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody)
            });

            console.log('🔧 ADAPTIVE DEBUG: Computer process response status:', response.status);
            console.log('🔧 ADAPTIVE DEBUG: Computer process response headers:', response.headers);
            
            if (!response.ok) {
                const errorText = await response.text();
                console.error('🔧 ADAPTIVE DEBUG: Computer process error response:', errorText);
                throw new Error(`Computer process adaptive update failed: ${response.status} - ${errorText}`);
            }

            const result = await response.json();
            console.log('🔧 ADAPTIVE DEBUG: Computer process response data:', result);
            console.log('✅ ADAPTIVE UPDATE SUCCESS: Computer process updated its profile successfully');
            this.logger.log('✅ Computer process updated its profile:', result);

        } catch (error) {
            console.error('🔧 ADAPTIVE DEBUG: sendAdaptiveUpdate failed:', error);
            console.error('🔧 ADAPTIVE DEBUG: Error type:', error.constructor.name);
            console.error('🔧 ADAPTIVE DEBUG: Error message:', error.message);
            console.error('🔧 ADAPTIVE DEBUG: Error stack:', error.stack);
            this.logger.error('❌ Failed to update Computer profile via Computer process:', error);
            throw error;
        }
    }
    
    async init() {
        console.log('🏠 Initializing Virtual Household Mode');
        
        // Initialize enhanced logger for comprehensive debugging
        if (window.EnhancedLogger) {
            this.logger = new window.EnhancedLogger('VirtualHousehold');
            this.logger.log('🏠 Virtual Household Mode starting with enhanced logging');
        } else {
            console.warn('⚠️ Enhanced Logger not available - using console logging');
            this.logger = console;
        }
        
        // Initialize UI controller
        console.log('🔍 DEBUG: About to create UIHousehold instance');
        console.log('🔍 DEBUG: this (VirtualHousehold instance):', this);
        console.log('🔍 DEBUG: typeof this:', typeof this);
        console.log('🔍 DEBUG: this.startAdaptiveTest exists?', typeof this.startAdaptiveTest);
        
        this.ui = new UIHousehold(this);
        
        console.log('🔍 DEBUG: UIHousehold instance created');
        console.log('🔍 DEBUG: this.ui:', this.ui);
        console.log('🔍 DEBUG: this.ui.virtualHousehold:', this.ui.virtualHousehold);
        
        // AdaptiveController will be initialized lazily when needed
        // This avoids script loading order issues
        this.adaptiveController = null;
        
        // Initialize latency tracker
        this.latencyTracker = new LatencyTracker();
        
        // Set up event listeners
        this.setupEventListeners();
        
        this.logger.log('✅ Virtual Household Mode initialized');
    }
    
    setupEventListeners() {
        // Start test button (regular test)
        // Button handler removed - now handled by UIHousehold class
        
        // Event listener removed - UI calls startAdaptiveTest() directly
        
        // Listen for worker messages
        window.addEventListener('message', (event) => {
            if (event.data.type === 'household-worker-data') {
                this.handleWorkerData(event.data);
            }
        });
        
        // Listen for throughput updates
        window.addEventListener('throughput-update', (event) => {
            this.handleThroughputUpdate(event.detail);
        });
        
        // Listen for enhanced latency measurement events
        window.addEventListener('latency-measurement', (event) => {
            this.handleLatencyMeasurementEvent(event.detail);
        });
    }
    
    async startAdaptiveTest() {
        this.logger.log('🔍 DIAGNOSTIC: startAdaptiveTest() called, isActive:', this.isActive);
        this.logger.log('🔍 DIAGNOSTIC: Current websocketConnections size:', this.websocketConnections.size);
        
        if (this.isActive) {
            this.logger.warn('Test already running - forcing reset');
            await this.stopTest();
            // Wait a moment for cleanup to complete
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        
        // RESTART FIX: Reset AdaptiveController guard flag to allow Phase 2 on restart
        if (this.adaptiveController) {
            this.logger.log('🔄 RESTART FIX: Resetting AdaptiveController guard flag for restart');
            this.adaptiveController.householdPhaseStarted = false;
        }
        
        this.logger.log('🚀 Starting MANDATORY Two-Phase Virtual Household Test (Phase 1: Speed Detection + Phase 2: Household Saturation)');
        
        // Update UI to show test is starting
        if (this.ui) {
            this.ui.updateStatus('Starting two-phase adaptive household test...');
            this.ui.setTestRunning(true);
        }
        
        try {
            // Lazy initialization of AdaptiveController to avoid script loading order issues
            if (!this.adaptiveController) {
                this.logger.log('🔍 DEBUG: Checking for window.AdaptiveController...');
                this.logger.log('🔍 DEBUG: window.AdaptiveController type:', typeof window.AdaptiveController);
                this.logger.log('🔍 DEBUG: window.AdaptiveController value:', window.AdaptiveController);
                
                if (window.AdaptiveController) {
                    this.adaptiveController = new window.AdaptiveController(this);
                    this.logger.log('✅ AdaptiveController initialized lazily');
                } else {
                    const errorMsg = 'CRITICAL ERROR: AdaptiveController not available - script loading order issue detected!';
                    this.logger.error('❌', errorMsg);
                    alert(errorMsg + '\n\nThe adaptive controller script failed to load. Please refresh the page.');
                    throw new Error(errorMsg);
                }
            }
            
            this.logger.log('🎯 AdaptiveController ready, starting two-phase test...');
            
            // Start the MANDATORY two-phase adaptive test workflow
            await this.adaptiveController.startAdaptiveTest();
            
            this.logger.log('✅ Two-phase adaptive test completed successfully');
        } catch (error) {
            this.logger.error('❌ CRITICAL FAILURE in two-phase adaptive test:', error);
            this.logger.error('❌ Error stack:', error.stack);
            
            if (this.ui) {
                this.ui.updateStatus(`CRITICAL ERROR: Two-phase test failed: ${error.message}`);
                this.ui.setTestRunning(false);
            }
            
            // Show alert to user
            alert(`CRITICAL ERROR: Two-phase test failed!\n\n${error.message}\n\nCheck console for details. No fallback available - test must be two-phase.`);
            
            // No fallback - the test must be two-phase
            throw error;
        }
    }
    
    async startTest() {
        // DEPRECATED: Regular test mode is no longer supported
        // All tests must now be two-phase (adaptive + household)
        this.logger.warn('⚠️ Regular startTest() called - redirecting to mandatory two-phase test');
        return this.startAdaptiveTest();
    }
    
    async startHouseholdPhase() {
        // This method is called by the adaptive controller for Phase 2
        this.logger.log('🔍 DIAGNOSTIC: startHouseholdPhase() called, isActive:', this.isActive);
        this.logger.log('🔍 DIAGNOSTIC: Current websocketConnections size:', this.websocketConnections.size);
        
        // PHASE TRANSITION FIX: Don't reset if this is a legitimate phase transition
        // Only reset if there are existing WebSocket connections (indicating a real conflict)
        if (this.isActive && this.websocketConnections.size > 0) {
            this.logger.warn('Test already running with active connections - forcing reset');
            await this.stopTest();
            // Wait a moment for cleanup to complete
            await new Promise(resolve => setTimeout(resolve, 500));
        } else if (this.isActive) {
            this.logger.log('🔄 PHASE TRANSITION: isActive=true but no WebSocket connections - continuing with Phase 2');
        }
        
        this.logger.log('🏠 Starting Phase 2: Virtual Household Simulation with detected connection speed');
        this.isActive = true;
        this.startTime = performance.now();
        this.testStartTime = Date.now(); // Use actual timestamp for test identification
        
        try {
            // Dispatch test start event for UI
            this.logger.log('📡 Dispatching household-test-start event');
            window.dispatchEvent(new CustomEvent('household-test-start'));
            
            // Update UI
            if (this.ui) {
                this.ui.updateStatus('Phase 2: Starting household simulation...');
                this.ui.setTestRunning(true);
            }
            this.logger.log('🚀 Using Simple Multi-Process Architecture - Each user type gets dedicated connection');
            if (this.ui) {
                this.ui.updateStatus('Phase 2: Initializing virtual users...');
            }
            
            // Initialize workers for each user
            await this.initializeWorkers();
            
            // Start periodic throughput calculation for all users
            this.startThroughputCalculationTimer();
            
            // Start the test timer
            this.startTestTimer();
            
            this.logger.log('✅ Phase 2: Virtual Household Simulation started successfully');
            
        } catch (error) {
            this.logger.error('❌ Failed to start Phase 2 household simulation:', error);
            this.logger.error('❌ Error details:', {
                name: error.name,
                message: error.message,
                stack: error.stack
            });
            
            this.isActive = false;
            
            if (this.ui) {
                this.ui.updateStatus(`Phase 2 failed: ${error.message}`);
                this.ui.setTestRunning(false);
            }
            
            throw error; // Re-throw for adaptive controller to handle
        }
    }
    
    async initializeWorkers() {
        this.logger.log('👥 Initializing Simple Multi-Process WebSocket connections');
        this.logger.log('🌐 Each user gets dedicated connection with separate WebSocket handling');
        
        // DIAGNOSTIC: Check for competing WebSocket implementations
        this.logger.log('🔍 DIAGNOSTIC: Checking for competing WebSocket implementations...');
        this.logger.log('🔍 DIAGNOSTIC: window.WebSocketManager exists?', typeof window.WebSocketManager);
        this.logger.log('🔍 DIAGNOSTIC: Current websocketConnections size:', this.websocketConnections.size);
        this.logger.log('🔍 DIAGNOSTIC: Existing connections:', Array.from(this.websocketConnections.keys()));
        
        // GUARD: Prevent multiple connection attempts
        if (this.websocketConnections.size > 0) {
            this.logger.warn('⚠️ DIAGNOSTIC: WebSocket connections already exist - clearing before creating new ones');
            for (const [userId, ws] of this.websocketConnections) {
                if (ws.readyState === WebSocket.OPEN) {
                    this.logger.log(`🔨 DIAGNOSTIC: Force closing existing connection for ${userId}`);
                    ws.close(1000, 'Reinitializing connections');
                }
            }
            this.websocketConnections.clear();
        }
        
        for (const [userId, config] of Object.entries(this.userConfigs)) {
            try {
                this.logger.log(`🔧 Initializing dedicated connection for ${userId}...`);
                
                // Step 1: Get redirect information from main server (but don't create session)
                // Import server discovery to get the correct server URL
                const { serverDiscovery } = await import('../discovery.js');
                
                // Use discovered server for WebSocket connections
                let baseUrl;
                if (serverDiscovery.currentServer) {
                    baseUrl = serverDiscovery.currentServer.url;
                } else {
                    baseUrl = `${window.location.protocol}//${window.location.host}`;
                }
                
                const redirectUrl = `${baseUrl}/ws/virtual-household/${userId}`;
                this.logger.log(`🔀 Getting redirect info from: ${redirectUrl}`);
                
                const response = await fetch(redirectUrl);
                if (!response.ok) {
                    throw new Error(`Redirect request failed: ${response.status} ${response.statusText}`);
                }
                
                const redirectInfo = await response.json();
                this.logger.log(`📋 Redirect info for ${userId}:`, redirectInfo);
                
                if (!redirectInfo.redirect || !redirectInfo.websocket_url) {
                    throw new Error(`Invalid redirect response: ${JSON.stringify(redirectInfo)}`);
                }
                
                // Step 2: Connect directly to the dedicated user process WebSocket
                let wsUrl = redirectInfo.websocket_url;
                
                // Add test ID to WebSocket URL for proper session identification
                const testId = Math.floor(this.testStartTime / 1000);
                wsUrl += `?test_id=${testId}`;
                
                this.logger.log(`🌐 Connecting to dedicated ${userId} connection: ${wsUrl}`);
                this.logger.log(`🔍 DEBUG: Dedicated WebSocket URL for ${userId}: ${wsUrl}`);
                this.logger.log(`🔍 DEBUG: Test ID: ${testId}, Port: ${redirectInfo.port}, Architecture: ${redirectInfo.architecture}`);
                this.logger.log(`🔍 DEBUG: Dedicated connection enabled: ${redirectInfo.process_isolation}`);
                
                // DIAGNOSTIC: Track WebSocket creation
                this.logger.log(`🔍 DIAGNOSTIC: About to create WebSocket for ${userId} at ${wsUrl}`);
                this.logger.log(`🔍 DIAGNOSTIC: Current timestamp: ${Date.now()}, Test ID: ${testId}`);
                this.logger.log(`🔍 DIAGNOSTIC: Existing connections before creation:`, Array.from(this.websocketConnections.keys()));
                
                const websocket = new WebSocket(wsUrl);
                
                this.logger.log(`🔍 DIAGNOSTIC: WebSocket created for ${userId}, readyState: ${websocket.readyState}`);
                
                websocket.onopen = () => {
                    this.logger.log(`✅ Dedicated WebSocket connected for ${userId}`);
                    this.logger.log(`🔍 DEBUG: WebSocket readyState for ${userId}: ${websocket.readyState}`);
                    this.logger.log(`🔍 DEBUG: WebSocket URL for ${userId}: ${websocket.url}`);
                    this.logger.log(`🔍 DEBUG: Connected to dedicated ${userId} connection on port ${redirectInfo.port}`);
                    
                    // Update UI
                    if (this.ui) {
                        this.ui.setUserActive(userId, true);
                    }
                };
                
                websocket.onmessage = (event) => {
                    // DEBUG: Log ALL incoming WebSocket messages
                    this.logger.log(`🔍 DEBUG: WebSocket message received for ${userId}`);
                    this.logger.log(`🔍 DEBUG: Message type: ${typeof event.data}`);
                    this.logger.log(`🔍 DEBUG: Message constructor: ${event.data.constructor.name}`);
                    
                    if (event.data instanceof ArrayBuffer) {
                        this.logger.log(`🔍 DEBUG: ArrayBuffer received - size: ${event.data.byteLength} bytes`);
                    } else if (event.data instanceof Blob) {
                        this.logger.log(`🔍 DEBUG: Blob received - size: ${event.data.size} bytes`);
                    } else {
                        this.logger.log(`🔍 DEBUG: Text/JSON message received - length: ${event.data.length} chars`);
                        this.logger.log(`🔍 DEBUG: Message content preview: ${event.data.substring(0, 100)}...`);
                    }
                    
                    // Handle both binary traffic data and JSON control messages
                    if (event.data instanceof ArrayBuffer || event.data instanceof Blob) {
                        // Binary data - this is real download traffic data from server
                        const byteLength = event.data instanceof ArrayBuffer ?
                            event.data.byteLength : event.data.size;
                        
                        this.logger.log(`📥 BINARY DATA RECEIVED for ${userId}: ${byteLength} bytes`);
                        
                        // Track client-side received bytes for accurate measurement
                        if (!this.clientStats) {
                            this.clientStats = {};
                        }
                        if (!this.clientStats[userId]) {
                            this.clientStats[userId] = {
                                receivedBytes: 0,
                                sentBytes: 0,
                                startTime: performance.now(),
                                lastThroughputUpdate: performance.now(),
                                lastDownloadThroughput: 0,
                                lastUploadThroughput: 0
                            };
                        }
                        
                        const now = performance.now();
                        this.clientStats[userId].receivedBytes += byteLength;
                        
                        // Add bytes to current measurement interval for smoothing
                        if (!this.clientStats[userId].smoothing) {
                            this.clientStats[userId].smoothing = {
                                downloadEMA: 0,
                                uploadEMA: 0,
                                alpha: 0.3,
                                lastUpdateTime: now,
                                bytesInInterval: { download: 0, upload: 0 },
                                intervalStart: now,
                                intervalDuration: 1000
                            };
                        }
                        
                        // Accumulate bytes in current interval
                        this.clientStats[userId].smoothing.bytesInInterval.download += byteLength;
                        
                        // Send periodic client confirmation to server for accurate measurement
                        this.sendClientConfirmation(userId, websocket);
                        
                        // Note: Throughput calculation is now handled by calculateAndEmitThroughput()
                        // which uses exponential moving average for smooth readings
                    } else {
                        // Text data - parse as JSON control message
                        this.logger.log(`📨 JSON message received for ${userId}`);
                        try {
                            const data = JSON.parse(event.data);
                            this.logger.log(`📨 Parsed JSON data for ${userId}:`, data);
                            this.handleRealTrafficMessage(userId, data);
                        } catch (error) {
                            this.logger.error(`❌ Failed to parse JSON message from ${userId}:`, error);
                            this.logger.error(`❌ Raw message content:`, event.data);
                        }
                    }
                };
                
                websocket.onerror = (error) => {
                    this.logger.error(`❌ Dedicated WebSocket error for ${userId}:`, error);
                    this.logger.error(`❌ Error connecting to dedicated ${userId} connection on port ${redirectInfo.port}`);
                };
                
                websocket.onclose = (event) => {
                    this.logger.log(`📡 Dedicated WebSocket closed for ${userId} (code: ${event.code}, reason: ${event.reason})`);
                    if (event.code === 1014) {
                        this.logger.log(`🔀 Server requested redirect - this should not happen with updated client`);
                    }
                };
                
                // DIAGNOSTIC: Track connection storage
                this.logger.log(`🔍 DIAGNOSTIC: About to store WebSocket for ${userId} in connections map`);
                this.logger.log(`🔍 DIAGNOSTIC: Map size before storing: ${this.websocketConnections.size}`);
                
                this.websocketConnections.set(userId, websocket);
                
                this.logger.log(`🔍 DIAGNOSTIC: WebSocket stored for ${userId}, map size now: ${this.websocketConnections.size}`);
                this.logger.log(`🔍 DIAGNOSTIC: All connections in map:`, Array.from(this.websocketConnections.keys()));
                this.logger.log(`✅ Initialized dedicated connection for ${userId} on port ${redirectInfo.port}`);
                
            } catch (error) {
                this.logger.error(`❌ Failed to initialize dedicated connection for ${userId}:`, error);
                this.logger.error(`❌ Error details: ${error.message}`);
                
                // Provide helpful error context
                if (error.message.includes('Redirect request failed')) {
                    this.logger.error(`❌ Could not get redirect info - is the simple multiprocess system running?`);
                } else if (error.message.includes('Invalid redirect response')) {
                    this.logger.error(`❌ Server returned invalid redirect - check process manager health`);
                }
            }
        }
        
    }
    
    startTestTimer() {
        const updateInterval = 200; // Update every 200ms
        let lastUpdate = performance.now();
        
        const timer = setInterval(() => {
            // Check if test is still active and components are available
            if (!this.isActive || !this.ui) {
                clearInterval(timer);
                return;
            }
            
            const now = performance.now();
            const elapsed = now - this.startTime;
            const remaining = Math.max(0, this.testDuration - elapsed);
            
            // Update status
            const remainingSeconds = Math.ceil(remaining / 1000);
            this.ui.updateStatus(`Testing... ${remainingSeconds}s remaining`);
            
            // Update timeline chart
            if (now - lastUpdate >= updateInterval) {
                this.updateRealTimeMetrics();
                lastUpdate = now;
            }
            
            // Check if test is complete
            if (remaining <= 0) {
                clearInterval(timer);
                this.completeTest();
            }
        }, 100);
    }
    
    startThroughputCalculationTimer() {
        
        // Clear any existing timer
        this.stopThroughputCalculationTimer();
        
        // Start periodic throughput calculation for smooth updates
        this.throughputCalculationTimer = setInterval(() => {
            this.calculateAndEmitThroughput();
        }, this.throughputCalculationInterval);
        
        this.logger.log(`✅ Throughput calculation timer started (${this.throughputCalculationInterval}ms interval)`);
    }
    
    stopThroughputCalculationTimer() {
        if (this.throughputCalculationTimer) {
            clearInterval(this.throughputCalculationTimer);
            this.throughputCalculationTimer = null;
            this.logger.log('🛑 Stopped throughput calculation timer');
        }
    }
    
    calculateAndEmitThroughput() {
        if (!this.isActive || !this.clientStats) return;
        
        const now = performance.now();
        
        // Calculate smoothed throughput for each active user using exponential moving average
        for (const [userId, stats] of Object.entries(this.clientStats)) {
            if (!stats || !stats.startTime) continue;
            
            // Initialize smoothing parameters if not present
            if (!stats.smoothing) {
                stats.smoothing = {
                    downloadEMA: 0,           // Exponential moving average for download
                    uploadEMA: 0,             // Exponential moving average for upload
                    alpha: 0.3,               // UI SMOOTHING: Smooth display (0.3 = more smooth, 0.7 = more responsive)
                    lastUpdateTime: now,
                    bytesInInterval: { download: 0, upload: 0 },
                    intervalStart: now,
                    intervalDuration: 500     // THROUGHPUT FIX: 500ms intervals for more responsive measurement
                };
            }
            
            const smoothing = stats.smoothing;
            const timeSinceLastUpdate = now - smoothing.lastUpdateTime;
            
            // Calculate instantaneous rate for this interval
            const intervalElapsed = (now - smoothing.intervalStart) / 1000; // seconds
            let instantDownloadRate = 0;
            let instantUploadRate = 0;
            
            // THROUGHPUT MEASUREMENT FIX: Allow shorter intervals and convert bytes to Mbps properly
            if (intervalElapsed >= 0.5) { // Allow 500ms intervals for more responsive measurement
                if (intervalElapsed > 0) {
                    // Convert bytes per second to Mbps: (bytes/sec * 8 bits/byte) / 1,000,000
                    instantDownloadRate = (smoothing.bytesInInterval.download * 8) / (intervalElapsed * 1000000);
                    instantUploadRate = (smoothing.bytesInInterval.upload * 8) / (intervalElapsed * 1000000);
                }
                
                // Apply exponential moving average for smooth readings
                if (smoothing.downloadEMA === 0 && smoothing.uploadEMA === 0) {
                    // First measurement - initialize EMA
                    smoothing.downloadEMA = instantDownloadRate;
                    smoothing.uploadEMA = instantUploadRate;
                } else {
                    // Update EMA: EMA = α × current + (1-α) × previous_EMA
                    smoothing.downloadEMA = (smoothing.alpha * instantDownloadRate) +
                                          ((1 - smoothing.alpha) * smoothing.downloadEMA);
                    smoothing.uploadEMA = (smoothing.alpha * instantUploadRate) +
                                        ((1 - smoothing.alpha) * smoothing.uploadEMA);
                }
                
                // Reset interval counters
                smoothing.bytesInInterval.download = 0;
                smoothing.bytesInInterval.upload = 0;
                smoothing.intervalStart = now;
                
                // Use smoothed values for display
                const smoothedDownload = smoothing.downloadEMA;
                const smoothedUpload = smoothing.uploadEMA;
                
                // THROUGHPUT FIX: Update thresholds for Mbps values instead of bytes per second
                const downloadChanged = Math.abs(smoothedDownload - (stats.lastDownloadThroughput || 0)) > 0.1; // 0.1 Mbps threshold
                const uploadChanged = Math.abs(smoothedUpload - (stats.lastUploadThroughput || 0)) > 0.1;
                
                if (downloadChanged || uploadChanged || smoothedDownload > 0 || smoothedUpload > 0) {
                    // Update stored values
                    stats.lastDownloadThroughput = smoothedDownload;
                    stats.lastUploadThroughput = smoothedUpload;
                    stats.lastThroughputUpdate = now;
                    
                    // THROUGHPUT FIX: Convert Mbps to bps for UI compatibility
                    window.dispatchEvent(new CustomEvent('traffic-update', {
                        detail: {
                            userId,
                            downloadThroughput: smoothedDownload * 1000000, // Convert Mbps to bps for UI
                            uploadThroughput: smoothedUpload * 1000000,     // Convert Mbps to bps for UI
                            status: smoothedDownload > 0.1 || smoothedUpload > 0.1 ? 'active' : 'idle', // 0.1 Mbps threshold
                            timestamp: now
                        }
                    }));
                    
                    // THROUGHPUT FIX: Log throughput in Mbps (values are already in Mbps now)
                    if (smoothedDownload > 0.5 || smoothedUpload > 0.5) { // > 0.5 Mbps
                        this.logger.log(`📈 ${userId} smoothed: ↓${smoothedDownload.toFixed(1)} Mbps, ↑${smoothedUpload.toFixed(1)} Mbps`);
                    }
                }
            }
            
            smoothing.lastUpdateTime = now;
        }
    }
    
    updateRealTimeMetrics() {
        // Check if components are available
        if (!this.ui) {
            return;
        }
        
        // Note: We now get latency data from WebSocket real-time updates instead of latencyTracker
        // The latency measurements come through handleRealTimeUpdate() and are processed via events
        
        // Listen for latency measurement events from WebSocket updates
        // This method now primarily handles UI updates that don't come from WebSocket events
        
        // Update any UI elements that need periodic refresh
        if (this.isActive) {
            // Trigger UI refresh for any components that need it
            // Most updates now come through the 'latency-measurement' events
        }
    }
    
    calculateUserStatus(userId, data) {
        const config = this.userConfigs[userId];
        if (!config) return 'stable';
        
        // Enhanced metrics processing
        const metrics = {
            latency: data.latency || 0,
            jitter: data.jitter || 0,
            bufferbloatSeverity: data.bufferbloatSeverity || 'none',
            throughput: data.throughput || 0
        };
        
        // Calculate enhanced sentiment with trend analysis
        const sentiment = this.calculateEnhancedSentiment(userId, metrics);
        
        // Update UI with dynamic sentiment message
        if (this.ui) {
            this.ui.updateUserSentiment(userId, sentiment);
        }
        
        // Enhanced status calculation based on multiple factors
        let status = 'stable';
        
        // Check latency thresholds
        if (metrics.latency > config.thresholds.latency * 2) {
            status = 'error';
        } else if (metrics.latency > config.thresholds.latency) {
            status = 'warning';
        }
        
        // Check jitter thresholds
        if (metrics.jitter > config.thresholds.jitter * 2) {
            status = 'error';
        } else if (metrics.jitter > config.thresholds.jitter && status === 'stable') {
            status = 'warning';
        }
        
        
        // Check bufferbloat severity
        if (metrics.bufferbloatSeverity === 'severe') {
            status = 'error';
        } else if (metrics.bufferbloatSeverity === 'moderate' && status === 'stable') {
            status = 'warning';
        }
        
        return status;
    }
    
    calculateEnhancedSentiment(userId, currentMetrics) {
        const config = this.userConfigs[userId];
        if (!config) return { score: 50, level: 'fair', trend: 'stable', message: 'Unknown user' };
        
        const { latency = 0, jitter = 0, throughput = 0 } = currentMetrics;
        const now = performance.now();
        
        // Calculate weighted performance score (0-100)
        const weights = this.getSentimentWeights(userId);
        let score = 100;
        
        // Latency impact
        if (latency > 0) {
            const latencyRatio = latency / config.thresholds.latency;
            score -= Math.min(40, latencyRatio * weights.latency * 40);
        }
        
        // Jitter impact
        if (jitter > 0) {
            const jitterRatio = jitter / config.thresholds.jitter;
            score -= Math.min(30, jitterRatio * weights.jitter * 30);
        }
        
        
        // Ensure score is within bounds
        score = Math.max(0, Math.min(100, score));
        
        // Calculate trend
        const trend = this.calculateSentimentTrend(userId, score);
        
        // Determine performance level
        const level = this.scoreToLevel(score);
        
        // Select dynamic message
        const message = this.selectDynamicMessage(userId, level, trend);
        
        // Store sentiment history
        this.updateSentimentHistory(userId, score, now);
        
        // Store current sentiment
        const sentiment = { score, level, trend, message, timestamp: now };
        this.currentSentiments.set(userId, sentiment);
        
        return sentiment;
    }
    
    getSentimentWeights(userId) {
        // User-specific priority weights
        switch (userId) {
            case 'gamer':
                return { latency: 0.6, jitter: 0.4, throughput: 0.0 };
            case 'worker':
                return { latency: 0.4, jitter: 0.6, throughput: 0.0 };
            case 'streamer':
                return { latency: 0.25, jitter: 0.25, throughput: 0.5 };
            case 'downloader':
                return { latency: 0.15, jitter: 0.15, throughput: 0.7 };
            default:
                return { latency: 0.33, jitter: 0.33, throughput: 0.34 };
        }
    }
    
    calculateSentimentTrend(userId, currentScore) {
        const history = this.sentimentHistory.get(userId) || [];
        
        if (history.length < 3) return 'stable';
        
        // Look at last 3 measurements for trend
        const recent = history.slice(-3);
        const avgRecent = recent.reduce((sum, item) => sum + item.score, 0) / recent.length;
        
        const difference = currentScore - avgRecent;
        
        if (difference > 5) return 'improving';
        if (difference < -5) return 'degrading';
        return 'stable';
    }
    
    scoreToLevel(score) {
        if (score >= 80) return 'excellent';
        if (score >= 60) return 'good';
        if (score >= 40) return 'fair';
        return 'poor';
    }
    
    selectDynamicMessage(userId, level, trend) {
        const config = this.userConfigs[userId];
        if (!config || !config.statusMessages[level] || !config.statusMessages[level][trend]) {
            return 'Status unknown';
        }
        
        const messages = config.statusMessages[level][trend];
        if (!Array.isArray(messages) || messages.length === 0) {
            return 'Status unknown';
        }
        
        // Select message based on time to add variety
        const messageIndex = Math.floor(Date.now() / 5000) % messages.length;
        return messages[messageIndex];
    }
    
    updateSentimentHistory(userId, score, timestamp) {
        if (!this.sentimentHistory.has(userId)) {
            this.sentimentHistory.set(userId, []);
        }
        
        const history = this.sentimentHistory.get(userId);
        history.push({ score, timestamp });
        
        // Memory optimization: limit history size
        const maxHistory = this.memoryOptimization.enabled ?
            this.memoryOptimization.maxSentimentHistory : 10;
        
        while (history.length > maxHistory) {
            history.shift();
        }
        
        this.sentimentHistory.set(userId, history);
    }
    
    handleRealTrafficMessage(userId, data) {
        switch (data.type) {
            case 'session_info':
                this.logger.log(`📋 Session info for ${userId}:`, data);
                // Note: Session info received but not used due to architecture limitations
                break;
            case 'real_time_update':
                this.handleRealTimeUpdate(userId, data);
                break;
            case 'session_complete':
                this.logger.log(`🏁 Session complete for ${userId}:`, data);
                break;
            case 'ping':
                // Handle ping from server - send pong response
                this.handlePingRequest(userId, data);
                break;
            case 'pong':
                // Handle pong response from server - calculate latency
                this.handlePongResponse(userId, data);
                break;
            case 'real_upload_request':
                // Handle upload request from server (client sends to server)
                this.handleUploadRequest(userId, data);
                break;
            default:
                this.logger.log(`📨 Unhandled real traffic message from ${userId}:`, data.type);
                break;
        }
    }
    
    handleRealTimeUpdate(userId, data) {
        // Emit traffic update event for UI
        window.dispatchEvent(new CustomEvent('traffic-update', {
            detail: {
                userId,
                throughput: (data.actual_download_mbps + data.actual_upload_mbps) * 1000000, // Convert to bps
                downloadThroughput: data.actual_download_mbps * 1000000, // Convert to bps
                uploadThroughput: data.actual_upload_mbps * 1000000, // Convert to bps
                status: data.active ? 'active' : 'idle',
                timestamp: data.timestamp
            }
        }));
        
        // Emit enhanced latency measurement event with server data
        if (data.latency_metrics) {
            window.dispatchEvent(new CustomEvent('latency-measurement', {
                detail: {
                    userId,
                    latency: data.ping_ms || data.latency_metrics.current_latency || 0,
                    jitter: data.jitter_ms || data.latency_metrics.jitter || 0,
                    bufferbloatSeverity: data.bufferbloat_severity || data.latency_metrics.bufferbloat_severity || 'none',
                    baselineLatency: data.latency_metrics.baseline_latency || 0,
                    latencyIncrease: data.latency_metrics.latency_increase || 0,
                    minLatency: data.latency_metrics.min_latency || 0,
                    maxLatency: data.latency_metrics.max_latency || 0,
                    avgLatency: data.latency_metrics.avg_latency || 0,
                    totalPings: data.latency_metrics.total_pings || 0,
                    timestamp: data.timestamp
                }
            }));
            
        }
        
        // Store for final results
        if (!this.testResults.users[userId]) {
            this.testResults.users[userId] = {
                metrics: [],
                config: this.userConfigs[userId]
            };
        }
        
        this.testResults.users[userId].metrics.push({
            downloadThroughput: data.actual_download_mbps * 1000000,
            uploadThroughput: data.actual_upload_mbps * 1000000,
            downloadBytes: data.download_bytes,
            uploadBytes: data.upload_bytes,
            // Enhanced latency metrics
            latency: data.ping_ms || 0,
            jitter: data.jitter_ms || 0,
            bufferbloatSeverity: data.bufferbloat_severity || 'none',
            timestamp: data.timestamp
        });
    }
    
    handleLatencyMeasurement(userId, data) {
        const latency = data.server_timestamp - data.timestamp;
        
        // Emit latency measurement event
        window.dispatchEvent(new CustomEvent('latency-measurement', {
            detail: {
                userId,
                latency: Math.max(0, latency),
                jitter: 0, // Real jitter calculation would need multiple samples
                timestamp: data.server_timestamp
            }
        }));
    }
    
    handlePingRequest(userId, data) {
        /**
         * Handle ping request from server - send pong response immediately
         */
        const websocket = this.websocketConnections.get(userId);
        if (websocket && websocket.readyState === WebSocket.OPEN) {
            const pongResponse = {
                type: 'pong',
                user_id: userId,
                sequence: data.sequence || 0,
                timestamp: data.timestamp,
                client_timestamp: performance.now(),
                server_time: data.server_time
            };
            
            websocket.send(JSON.stringify(pongResponse));
        }
    }
    
    handlePongResponse(userId, data) {
        /**
         * Handle pong response from server - this is for client-initiated pings
         * Currently the server initiates pings, but this is ready for bidirectional ping
         */
        const currentTime = performance.now();
        const sentTime = data.timestamp || 0;
        const latency = currentTime - sentTime;
        
        
        // Emit latency measurement event
        window.dispatchEvent(new CustomEvent('latency-measurement', {
            detail: {
                userId,
                latency: Math.max(0, latency),
                sequence: data.sequence || 0,
                timestamp: currentTime
            }
        }));
    }
    
    handleUploadRequest(userId, data) {
        // Generate and send real binary data to server (client upload to server)
        const targetBytes = data.target_bytes || 8192;
        
        // Send real binary data to server
        const websocket = this.websocketConnections.get(userId);
        if (websocket && websocket.readyState === WebSocket.OPEN) {
            // crypto.getRandomValues() has a 65536 byte limit, so chunk large requests
            const maxChunkSize = 65536;
            let totalSent = 0;
            
            while (totalSent < targetBytes) {
                const chunkSize = Math.min(maxChunkSize, targetBytes - totalSent);
                const realData = new Uint8Array(chunkSize);
                crypto.getRandomValues(realData);
                
                // Send real binary data chunk to server
                websocket.send(realData.buffer);
                totalSent += chunkSize;
            }
            
            // Track client-side sent bytes
            if (!this.clientStats[userId]) {
                this.clientStats[userId] = {
                    receivedBytes: 0,
                    sentBytes: 0,
                    startTime: performance.now(),
                    lastThroughputUpdate: performance.now(),
                    lastDownloadThroughput: 0,
                    lastUploadThroughput: 0
                };
            }
            
            const now = performance.now();
            this.clientStats[userId].sentBytes += totalSent;
            
            // Initialize smoothing if not present
            if (!this.clientStats[userId].smoothing) {
                this.clientStats[userId].smoothing = {
                    downloadEMA: 0,
                    uploadEMA: 0,
                    alpha: 0.3,
                    lastUpdateTime: now,
                    bytesInInterval: { download: 0, upload: 0 },
                    intervalStart: now,
                    intervalDuration: 1000
                };
            }
            
            // Accumulate upload bytes in current interval
            this.clientStats[userId].smoothing.bytesInInterval.upload += totalSent;
            
            this.logger.log(`📤 ${userId} uploaded ${totalSent} bytes - tracking in smoothing interval`);
            
            // Send JSON notification about the upload
            websocket.send(JSON.stringify({
                type: 'real_upload_data',
                size: targetBytes,
                timestamp: performance.now()
            }));
            
            this.logger.log(`📤 ${userId} uploaded ${targetBytes} bytes of real binary data (${Math.ceil(targetBytes/maxChunkSize)} chunks)`);
        }
    }
    
    handleTrafficUpdate(userId, data) {
        // Memory optimization: check memory usage periodically
        this.checkMemoryUsage();
        
        let stats = null;
        if (data.data && typeof data.data === 'object') {
            stats = data.data;
        } else if (data.stats) {
            stats = data.stats;
        } else {
            return; // No valid stats
        }
        
        if (stats) {
            // Use direct throughput values if available, otherwise calculate based on user type
            const totalThroughput = stats.throughput || 0;
            let downloadThroughput = stats.downloadThroughput || 0;
            let uploadThroughput = stats.uploadThroughput || 0;
            
            // If direct values aren't available, calculate based on user type
            if (downloadThroughput === 0 && uploadThroughput === 0 && totalThroughput > 0) {
                switch (userId) {
                    case 'alex':
                        uploadThroughput = totalThroughput * 0.7;
                        downloadThroughput = totalThroughput * 0.3;
                        break;
                    case 'sarah':
                        uploadThroughput = totalThroughput * 0.5;
                        downloadThroughput = totalThroughput * 0.5;
                        break;
                    case 'jake':
                        downloadThroughput = totalThroughput * 0.9;
                        uploadThroughput = totalThroughput * 0.1;
                        break;
                    case 'computer':
                        downloadThroughput = totalThroughput * 0.6;
                        uploadThroughput = totalThroughput * 0.4;
                        break;
                    default:
                        downloadThroughput = totalThroughput * 0.5;
                        uploadThroughput = totalThroughput * 0.5;
                }
            }
            
            // Emit traffic update event for UI
            window.dispatchEvent(new CustomEvent('traffic-update', {
                detail: {
                    userId,
                    throughput: totalThroughput,
                    downloadThroughput,
                    uploadThroughput,
                    status: stats.status || 'active',
                    packets: stats.packets || 0,
                    bytes: stats.bytes || 0,
                    timestamp: stats.timestamp || performance.now()
                }
            }));
            
            // Store for final results (with memory optimization)
            if (!this.testResults.users[userId]) {
                this.testResults.users[userId] = {
                    metrics: [],
                    config: this.userConfigs[userId]
                };
            }
            
            const userMetrics = this.testResults.users[userId].metrics;
            userMetrics.push({
                ...stats,
                timestamp: performance.now() - this.startTime
            });
            
            // Memory optimization: limit metrics history
            if (this.memoryOptimization.enabled && userMetrics.length > 100) {
                // Keep only the most recent 100 metrics
                userMetrics.splice(0, userMetrics.length - 100);
            }
        }
    }
    
    /**
     * Check overall memory usage and log warnings
     */
    checkMemoryUsage() {
        const now = performance.now();
        
        if (now - this.memoryOptimization.lastMemoryCheck < this.memoryOptimization.memoryCheckInterval) {
            return;
        }
        
        this.memoryOptimization.lastMemoryCheck = now;
        
        if (!this.memoryOptimization.enabled) return;
        
        try {
            // Estimate memory usage
            let totalMemory = 0;
            
            // Sentiment history
            for (const [userId, history] of this.sentimentHistory) {
                totalMemory += history.length * 50; // ~50 bytes per entry
            }
            
            // Test results
            totalMemory += JSON.stringify(this.testResults).length;
            
            // Worker count
            totalMemory += this.workers.size * 1000; // ~1KB per worker overhead
            
            this.memoryOptimization.totalMemoryUsage = totalMemory;
            
            // Only log memory usage if it's excessive (> 50MB)
            if (totalMemory > 50 * 1024 * 1024) {
                console.warn(`⚠️ Virtual Household memory usage: ${(totalMemory / 1024 / 1024).toFixed(1)}MB`);
            }
            
        } catch (error) {
            console.warn('⚠️ Memory monitoring error:', error);
        }
    }
    
    handleWorkerMetrics(userId, metrics) {
        // Store metrics for final results (with memory optimization)
        if (!this.testResults.users[userId]) {
            this.testResults.users[userId] = {
                metrics: [],
                config: this.userConfigs[userId]
            };
        }
        
        const userMetrics = this.testResults.users[userId].metrics;
        userMetrics.push({
            ...metrics,
            timestamp: performance.now() - this.startTime
        });
        
        // Memory optimization: limit metrics history
        if (this.memoryOptimization.enabled && userMetrics.length > 100) {
            // Keep only the most recent 100 metrics
            userMetrics.splice(0, userMetrics.length - 100);
        }
        
        // Update UI with worker-specific metrics
        if (this.ui) {
            this.ui.updateUserMetrics(userId, metrics);
        }
    }
    
    handleThroughputUpdate(data) {
        // Handle throughput updates from workers (removed verbose logging)
        
        // Emit traffic update event for UI compatibility
        window.dispatchEvent(new CustomEvent('traffic-update', {
            detail: {
                userId: data.userId,
                throughput: data.totalThroughput,
                downloadThroughput: data.downloadThroughput,
                uploadThroughput: data.uploadThroughput,
                status: 'active',
                timestamp: data.timestamp
            }
        }));
    }
    
    handleLatencyMeasurementEvent(data) {
        /**
         * Handle enhanced latency measurement events from WebSocket updates
         */
        const { userId, latency, jitter, loss, bufferbloatSeverity } = data;
        
        // Update UI with real latency metrics
        if (this.ui) {
            this.ui.updateUserMetrics(userId, {
                latency: latency || 0,
                jitter: jitter || 0,
                bufferbloatSeverity: bufferbloatSeverity || 'none',
                timestamp: data.timestamp
            });
            
            // Calculate and update user status based on enhanced metrics
            const status = this.calculateUserStatus(userId, data);
            this.ui.updateUserStatus(userId, status);
        }
        
        // Log significant latency events
    }
    
    async completeTest() {
        // RACE CONDITION GUARD: Prevent multiple simultaneous completion calls
        if (this.isCompleting) {
            console.log('⚠️ RACE CONDITION PREVENTED: completeTest() already in progress');
            if (this.logger && this.logger.warn) this.logger.warn('⚠️ RACE CONDITION PREVENTED: completeTest() already in progress');
            return;
        }
        
        this.isCompleting = true;
        
        // Robust logging that won't fail if logger is undefined
        if (this.logger && this.logger.log) {
            this.logger.log('🏁 STARTING completeTest() method');
        }
        console.log('🏁 ENHANCED completeTest() method starting');
        console.log('🏁 Completing Virtual Household Test');
        
        try {
            // Stop throughput calculation timer
            console.log('🛑 Stopping throughput calculation timer...');
            if (this.logger && this.logger.log) this.logger.log('🛑 Stopping throughput calculation timer...');
            this.stopThroughputCalculationTimer();
            
            // CRITICAL: Send stop signals to all server processes FIRST
            console.log(`🔍 Found ${this.websocketConnections.size} WebSocket connections to close`);
            if (this.logger && this.logger.log) this.logger.log(`🔍 Found ${this.websocketConnections.size} WebSocket connections to close`);
            
            if (this.websocketConnections.size === 0) {
                console.warn('⚠️ No WebSocket connections found - this may indicate a problem');
                if (this.logger && this.logger.warn) this.logger.warn('⚠️ No WebSocket connections found - this may indicate a problem');
            }
            
            const stopPromises = [];
            
            // MULTI-USER SAFE APPROACH: Only close the WebSocket connections for THIS test instance
            // The server bug where sessions don't clean up on disconnect is a server-side issue
            // that needs to be fixed on the server side. We cannot safely stop other users' sessions.
            console.log(`🛑 SERVER BUG IDENTIFIED: Sessions don't clean up on WebSocket disconnect`);
            console.log(`🛑 SAFE WORKAROUND: Force close only THIS client's WebSocket connections`);
            console.log(`⚠️ NOTE: Server-side fix needed to properly clean up sessions on disconnect`);
            if (this.logger && this.logger.log) {
                this.logger.log(`🛑 SERVER BUG IDENTIFIED: Sessions don't clean up on WebSocket disconnect`);
                this.logger.log(`🛑 SAFE WORKAROUND: Force close only THIS client's WebSocket connections`);
                this.logger.log(`⚠️ NOTE: Server-side fix needed to properly clean up sessions on disconnect`);
            }
            
            for (const [userId, websocket] of this.websocketConnections) {
                console.log(`🔍 Processing WebSocket for ${userId}, readyState: ${websocket.readyState}`);
                if (this.logger && this.logger.log) this.logger.log(`🔍 Processing WebSocket for ${userId}, readyState: ${websocket.readyState}`);
                
                if (websocket.readyState === WebSocket.OPEN) {
                    try {
                        console.log(`🛑 MULTI-USER SAFE: Force closing only THIS client's WebSocket for ${userId}`);
                        if (this.logger && this.logger.log) this.logger.log(`🛑 MULTI-USER SAFE: Force closing only THIS client's WebSocket for ${userId}`);
                        
                        // Force close the WebSocket - this is safe as it only affects this client
                        websocket.close(1000, 'Test completed - force disconnect');
                        
                        console.log(`✅ Safely force closed WebSocket for ${userId}`);
                        if (this.logger && this.logger.log) this.logger.log(`✅ Safely force closed WebSocket for ${userId}`);
                        
                        // Create a promise that resolves when the WebSocket closes
                        const closePromise = new Promise((resolve) => {
                            const originalOnClose = websocket.onclose;
                            websocket.onclose = (event) => {
                                console.log(`🔌 WebSocket closed for ${userId} (code: ${event.code}, reason: ${event.reason})`);
                                if (this.logger && this.logger.log) this.logger.log(`🔌 WebSocket closed for ${userId} (code: ${event.code}, reason: ${event.reason})`);
                                if (originalOnClose) originalOnClose(event);
                                resolve();
                            };
                            
                            // Force close after a timeout if server doesn't close gracefully
                            setTimeout(() => {
                                if (websocket.readyState === WebSocket.OPEN) {
                                    console.log(`⏰ Force closing WebSocket for ${userId} after 2s timeout`);
                                    if (this.logger && this.logger.log) this.logger.log(`⏰ Force closing WebSocket for ${userId} after 2s timeout`);
                                    websocket.close(1000, 'Test completed - timeout');
                                } else {
                                    console.log(`✅ WebSocket for ${userId} already closed naturally`);
                                    if (this.logger && this.logger.log) this.logger.log(`✅ WebSocket for ${userId} already closed naturally`);
                                }
                                resolve();
                            }, 2000); // 2 second timeout
                        });
                        
                        stopPromises.push(closePromise);
                    } catch (error) {
                        console.error(`❌ Failed to send stop signal to ${userId}:`, error);
                        if (this.logger && this.logger.error) {
                            this.logger.error(`❌ Failed to send stop signal to ${userId}:`, error);
                            this.logger.error(`❌ Error details:`, error.message, error.stack);
                        }
                    }
                } else {
                    console.log(`⚠️ WebSocket for ${userId} not open (state: ${websocket.readyState})`);
                    if (this.logger && this.logger.log) this.logger.log(`⚠️ WebSocket for ${userId} not open (state: ${websocket.readyState})`);
                }
            }
            
            // Wait for all WebSockets to close gracefully or timeout
            console.log(`⏳ Waiting for ${stopPromises.length} WebSocket connections to close...`);
            if (this.logger && this.logger.log) this.logger.log(`⏳ Waiting for ${stopPromises.length} WebSocket connections to close...`);
            if (stopPromises.length > 0) {
                await Promise.all(stopPromises);
                console.log(`✅ All ${stopPromises.length} WebSocket close promises resolved`);
                if (this.logger && this.logger.log) this.logger.log(`✅ All ${stopPromises.length} WebSocket close promises resolved`);
            } else {
                console.warn('⚠️ No WebSocket close promises to wait for');
                if (this.logger && this.logger.warn) this.logger.warn('⚠️ No WebSocket close promises to wait for');
            }
            
            // Force close any remaining connections
            let remainingConnections = 0;
            for (const [userId, websocket] of this.websocketConnections) {
                if (websocket.readyState === WebSocket.OPEN) {
                    remainingConnections++;
                    console.log(`🔨 Force closing remaining WebSocket for ${userId}`);
                    if (this.logger && this.logger.log) this.logger.log(`🔨 Force closing remaining WebSocket for ${userId}`);
                    websocket.close(1000, 'Test completed - force close');
                }
            }
            
            if (remainingConnections > 0) {
                console.log(`🔨 Force closed ${remainingConnections} remaining connections`);
                if (this.logger && this.logger.log) this.logger.log(`🔨 Force closed ${remainingConnections} remaining connections`);
            } else {
                console.log(`✅ No remaining connections needed force closing`);
                if (this.logger && this.logger.log) this.logger.log(`✅ No remaining connections needed force closing`);
            }
            
            this.websocketConnections.clear();
            console.log('🧹 WebSocket connections map cleared');
            if (this.logger && this.logger.log) this.logger.log('🧹 WebSocket connections map cleared');
            
            // TRAFFIC CONTINUATION FIX: Send immediate HTTP stop signal to server
            try {
                console.log('🛑 IMMEDIATE STOP: Sending HTTP stop signal to prevent traffic continuation');
                if (this.logger && this.logger.log) this.logger.log('🛑 IMMEDIATE STOP: Sending HTTP stop signal to prevent traffic continuation');
                
                const { serverDiscovery } = await import('../discovery.js');
                
                // Send stop signal directly to the ISP server we're connected to
                let stopUrl;
                if (serverDiscovery.currentServer) {
                    // Use the ISP server URL from discovery
                    stopUrl = `${serverDiscovery.currentServer.url}/api/virtual-household/stop-user-sessions/${this.testStartTime ? Math.floor(this.testStartTime / 1000).toString() : 'all'}`;
                } else {
                    // Fallback to current host if no server discovered
                    stopUrl = `${window.location.protocol}//${window.location.host}/api/virtual-household/stop-user-sessions/${this.testStartTime ? Math.floor(this.testStartTime / 1000).toString() : 'all'}`;
                }
                
                const stopResponse = await fetch(stopUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        action: 'stop_all_sessions', 
                        reason: 'test_completed_immediate',
                        timestamp: Date.now()
                    })
                });
                
                if (stopResponse.ok) {
                    const result = await stopResponse.json();
                    console.log('✅ IMMEDIATE STOP: Server stop signal successful:', result);
                    if (this.logger && this.logger.log) this.logger.log('✅ IMMEDIATE STOP: Server stop signal successful: ' + JSON.stringify(result));
                } else {
                    console.warn('⚠️ IMMEDIATE STOP: Server stop signal failed:', stopResponse.status);
                    if (this.logger && this.logger.warn) this.logger.warn('⚠️ IMMEDIATE STOP: Server stop signal failed: ' + stopResponse.status);
                }
            } catch (error) {
                console.warn('⚠️ IMMEDIATE STOP: Error sending stop signal:', error.message);
                if (this.logger && this.logger.warn) this.logger.warn('⚠️ IMMEDIATE STOP: Error sending stop signal: ' + error.message);
            }
            
// ARCHITECTURE FIX: Send stop signals directly to the separate processes (ports 8001-8004)
            // The main server (port 8000) doesn't have the actual WebSocket sessions
            // Store session info before clearing connections
            const sessionInfo = Array.from(this.websocketConnections.entries()).map(([userId, websocket]) => ({
                userId,
                userType: userId.split('_')[0].toLowerCase(),
                readyState: websocket.readyState
            }));
            
            try {
                console.log(`🛑 ARCHITECTURE FIX: Sending stop signals directly to separate processes`);
                if (this.logger && this.logger.log) this.logger.log(`🛑 ARCHITECTURE FIX: Sending stop signals directly to separate processes`);
                
                // DISTRIBUTED ARCHITECTURE FIX: Check if we're using distributed or local architecture
                const { serverDiscovery } = await import('../discovery.js');
                const isDistributedMode = serverDiscovery.currentServer && 
                    !serverDiscovery.currentServer.url.includes('localhost') && 
                    !serverDiscovery.currentServer.url.includes('127.0.0.1');
                
                const stopPromises = [];
                
                if (isDistributedMode) {
                    // Distributed mode: send one stop signal to main server for all sessions
                    console.log(`🔍 DISTRIBUTED MODE: Sending single stop signal for all sessions`);
                    if (this.logger && this.logger.log) this.logger.log(`🔍 DISTRIBUTED MODE: Sending single stop signal for all sessions`);
                    
                    const stopPromise = this.sendStopSignalToDistributedServer();
                    stopPromises.push(stopPromise);
                } else {
                    // Local multiprocess mode: send stop signals to each user's dedicated process
                    const userPorts = {
                        'alex': 8001,
                        'sarah': 8002, 
                        'jake': 8003,
                        'computer': 8004
                    };
                    
                    for (const session of sessionInfo) {
                        const port = userPorts[session.userType];
                        
                        if (port) {
                            const stopPromise = this.sendStopSignalToProcess(session.userType, port, session.userId);
                            stopPromises.push(stopPromise);
                        }
                    }
                }
                
                // Wait for all stop signals to complete
                const results = await Promise.allSettled(stopPromises);
                const successful = results.filter(r => r.status === 'fulfilled').length;
                const failed = results.filter(r => r.status === 'rejected').length;
                
                console.log(`✅ Stop signals sent to separate processes: ${successful} successful, ${failed} failed`);
                if (this.logger && this.logger.log) this.logger.log(`✅ Stop signals sent to separate processes: ${successful} successful, ${failed} failed`);
                
            } catch (error) {
                console.warn('⚠️ Stop signals to separate processes failed (non-critical):', error.message);
                if (this.logger && this.logger.log) this.logger.log('⚠️ Stop signals to separate processes failed (non-critical): ' + error.message);
            }
            
            this.websocketConnections.clear();
            console.log('🧹 WebSocket connections map cleared');
            if (this.logger && this.logger.log) this.logger.log('🧹 WebSocket connections map cleared');
            
            // Stop latency tracking
            if (this.latencyTracker) {
                this.latencyTracker.stop();
                console.log('🛑 Latency tracker stopped');
                if (this.logger && this.logger.log) this.logger.log('🛑 Latency tracker stopped');
            }
            
            // Calculate final results
            console.log('📊 Calculating final results...');
            if (this.logger && this.logger.log) this.logger.log('📊 Calculating final results...');
            this.calculateResults();
            
            // Dispatch test completion event for UI
            console.log('📡 Dispatching household-test-complete event');
            if (this.logger && this.logger.log) this.logger.log('📡 Dispatching household-test-complete event');
            window.dispatchEvent(new CustomEvent('household-test-complete', {
                detail: this.testResults
            }));
            
            // Update UI
            if (this.ui) {
                this.ui.setTestRunning(false);
                this.ui.showResults(this.testResults);
                this.ui.updateStatus('Test complete! Check your results below.');
                console.log('🎨 UI updated with completion status');
                if (this.logger && this.logger.log) this.logger.log('🎨 UI updated with completion status');
            }
            
            console.log('🧹 All WebSocket connections properly closed');
            console.log('✅ completeTest() method finished successfully');
            if (this.logger && this.logger.log) {
                this.logger.log('🧹 All WebSocket connections properly closed');
                this.logger.log('✅ completeTest() method finished successfully');
            }
            console.log('✅ Virtual Household Simple Multi-Process Test completed');
            
        } catch (error) {
            console.error('❌ CRITICAL ERROR in completeTest():', error);
            console.error('❌ Error message:', error.message);
            console.error('❌ Error stack:', error.stack);
            if (this.logger && this.logger.error) {
                this.logger.error('❌ CRITICAL ERROR in completeTest():', error);
                this.logger.error('❌ Error message:', error.message);
                this.logger.error('❌ Error stack:', error.stack);
            }
        } finally {
            this.isActive = false;
            this.isCompleting = false; // Reset completion guard
            console.log('🏁 completeTest() finally block - isActive set to false');
            if (this.logger && this.logger.log) this.logger.log('🏁 completeTest() finally block - isActive and isCompleting set to false');
        }
    }
    
    async sendStopSignalToDistributedServer() {
        /**
         * REMOVED: Direct stop signals to ISP servers
         * All stop signals now go through the central server which relays to ISP servers
         * This ensures proper multi-user safety and session management
         */
        console.log(`🔍 DISTRIBUTED MODE: Stop signals handled by central server relay`);
        if (this.logger && this.logger.log) this.logger.log(`🔍 DISTRIBUTED MODE: Stop signals handled by central server relay`);
        
        // Return success since the main stop signal to central server handles everything
        return { success: true, result: "Central server handles stop signal relay" };
        
        // REMOVED: The following code was sending stop signals directly to ISP servers
        // which violates the distributed architecture and can affect other users' tests
        /*
        try {
            console.log(`🛑 Sending stop signal to distributed server for all sessions`);
            if (this.logger && this.logger.log) this.logger.log(`🛑 Sending stop signal to distributed server for all sessions`);
            
            // Import server discovery to get the correct server URL
            const { serverDiscovery } = await import('../discovery.js');
            
            // Use the main server endpoint for stopping all sessions
            let stopUrl;
            if (serverDiscovery.currentServer) {
                stopUrl = `${serverDiscovery.currentServer.url}/api/virtual-household/stop-user-sessions/${this.testStartTime}`;
            } else {
                stopUrl = `${window.location.protocol}//${window.location.host}/api/virtual-household/stop-user-sessions/all`;
            }
            
            console.log(`🔍 Distributed stop URL: ${stopUrl}`);
            if (this.logger && this.logger.log) this.logger.log(`🔍 Distributed stop URL: ${stopUrl}`);
            
            // Send stop request for all sessions
            const response = await fetch(stopUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    action: 'stop_all_sessions',
                    reason: 'test_completed',
                    test_id: this.testStartTime ? Math.floor(this.testStartTime / 1000).toString() : 'all'
                })
            });
            
            if (response.ok) {
                const result = await response.json();
                console.log(`✅ Successfully sent stop signal to distributed server:`, result);
                if (this.logger && this.logger.log) this.logger.log(`✅ Successfully sent stop signal to distributed server:`, result);
                return { success: true, result };
            } else {
                const errorText = await response.text();
                console.warn(`⚠️ Stop signal to distributed server failed: ${response.status} ${response.statusText} - ${errorText}`);
                if (this.logger && this.logger.warn) this.logger.warn(`⚠️ Stop signal to distributed server failed: ${response.status} ${response.statusText} - ${errorText}`);
                return { success: false, error: `${response.status} ${response.statusText}` };
            }
            
        } catch (error) {
            console.error(`❌ Error sending stop signal to distributed server:`, error);
            if (this.logger && this.logger.error) this.logger.error(`❌ Error sending stop signal to distributed server:`, error);
            return { success: false, error: error.message };
        }
    }

    async sendStopSignalToProcess(userType, port, sessionId) {
        /**
         * Send stop signal directly to the dedicated process for this user type
         * This bypasses the main server and goes directly to the process handling the WebSocket
         */
        try {
            console.log(`🛑 Sending stop signal to ${userType} process on port ${port} for session ${sessionId}`);
            if (this.logger && this.logger.log) this.logger.log(`🛑 Sending stop signal to ${userType} process on port ${port} for session ${sessionId}`);
            
            // Import server discovery to get the correct server URL
            const { serverDiscovery } = await import('../discovery.js');
            
            // Construct URL for the dedicated process using discovered server
            let protocol, hostname;
            if (serverDiscovery.currentServer) {
                const serverUrl = new URL(serverDiscovery.currentServer.url);
                protocol = serverUrl.protocol.replace(':', '');
                hostname = serverUrl.hostname;
            } else {
                protocol = window.location.protocol.replace(':', '');
                hostname = window.location.hostname;
            }
            // DISTRIBUTED ARCHITECTURE FIX: In distributed mode, send stop signals to main server
            // instead of trying to reach dedicated processes on specific ports
            let processUrl;
            if (serverDiscovery.currentServer && hostname !== 'localhost' && hostname !== '127.0.0.1') {
                // Distributed architecture: use ISP server endpoint
                processUrl = `${serverDiscovery.currentServer.url}/api/virtual-household/stop-user-sessions/all`;
                console.log(`🔍 DISTRIBUTED MODE: Using ISP server stop endpoint: ${processUrl}`);
                if (this.logger && this.logger.log) this.logger.log(`🔍 DISTRIBUTED MODE: Using ISP server stop endpoint: ${processUrl}`);
            } else {
                // Local multiprocess architecture: use dedicated process ports
                processUrl = `${protocol}://${hostname}:${port}/stop-session`;
            }
            
            console.log(`🔍 Process stop URL: ${processUrl}`);
            if (this.logger && this.logger.log) this.logger.log(`🔍 Process stop URL: ${processUrl}`);
            
            // Send stop request with session-specific information
            const response = await fetch(processUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    session_id: sessionId,
                    user_type: userType,
                    action: 'stop_session',
                    reason: 'test_completed'
                })
            });
            
            if (response.ok) {
                const result = await response.json();
                console.log(`✅ Successfully sent stop signal to ${userType} process:`, result);
                if (this.logger && this.logger.log) this.logger.log(`✅ Successfully sent stop signal to ${userType} process:`, result);
                return { success: true, userType, port, result };
            } else {
                const errorText = await response.text();
                console.warn(`⚠️ Stop signal to ${userType} process failed: ${response.status} ${response.statusText} - ${errorText}`);
                if (this.logger && this.logger.warn) this.logger.warn(`⚠️ Stop signal to ${userType} process failed: ${response.status} ${response.statusText} - ${errorText}`);
                return { success: false, userType, port, error: `${response.status} ${response.statusText}` };
            }
            
        } catch (error) {
            console.error(`❌ Error sending stop signal to ${userType} process on port ${port}:`, error);
            if (this.logger && this.logger.error) this.logger.error(`❌ Error sending stop signal to ${userType} process on port ${port}:`, error);
            return { success: false, userType, port, error: error.message };
        }
    }
    
    calculateResults() {
        
        // Calculate individual user grades
        for (const [userId, userData] of Object.entries(this.testResults.users)) {
            const grade = this.calculateUserGrade(userId, userData.metrics);
            userData.grade = grade;
            userData.description = this.generateUserDescription(userId, userData.metrics, grade);
        }
        
        // SIMPLIFIED: Only calculate overall grade based on Alex and Sarah
        this.testResults.overall = {};
        
        // Calculate overall grade based on Alex and Sarah individual grades
        this.testResults.overall.overallGrade = this.calculateOverallGrade();
        
        // Generate recommendations
        this.testResults.recommendations = this.generateRecommendations();
        
    }
    
    calculateUserGrade(userId, metrics) {
        if (!metrics || metrics.length === 0) return 'F';
        
        const config = this.userConfigs[userId];
        const avgMetrics = this.calculateAverageMetrics(metrics);
        
        let score = 100;
        
        // More forgiving scoring: only penalize when significantly exceeding thresholds
        for (const [metricName, value] of Object.entries(avgMetrics)) {
            const threshold = config.thresholds[metricName];
            if (threshold && typeof threshold === 'number') {
                if (value > threshold * 3) {
                    score -= 25; // Very poor performance (3x threshold)
                } else if (value > threshold * 2) {
                    score -= 15; // Poor performance (2x threshold)
                } else if (value > threshold * 1.5) {
                    score -= 8;  // Moderate performance (1.5x threshold)
                }
                // No penalty if within 1.5x threshold - this allows for normal network variation
            }
        }
        
        // More generous grading scale
        if (score >= 92) return 'A+';
        if (score >= 85) return 'A';
        if (score >= 75) return 'B';
        if (score >= 65) return 'C';
        if (score >= 55) return 'D';
        return 'F';
    }
    
    calculateAverageMetrics(metrics) {
        const sums = {};
        const counts = {};
        
        for (const metric of metrics) {
            for (const [key, value] of Object.entries(metric)) {
                if (typeof value === 'number') {
                    sums[key] = (sums[key] || 0) + value;
                    counts[key] = (counts[key] || 0) + 1;
                }
            }
        }
        
        const averages = {};
        for (const key of Object.keys(sums)) {
            averages[key] = sums[key] / counts[key];
        }
        
        return averages;
    }
    
    calculateNetworkFairness() {
        // Enhanced Network Fairness: Focus on whether Alex and Sarah
        // can consistently reach their download/upload throughput targets
        // Other users don't matter for fairness scoring
        
        const criticalUsers = ['alex', 'sarah'];
        const userScores = {};
        
        for (const userId of criticalUsers) {
            const userData = this.testResults.users[userId];
            if (!userData || !userData.metrics || userData.metrics.length === 0) {
                userScores[userId] = 50; // Default if no data
                continue;
            }
            
            userScores[userId] = this.calculateUserThroughputFairness(userId, userData);
        }
        
        // Calculate weighted average (Alex and Sarah equally important)
        const alexScore = userScores.alex || 50;
        const sarahScore = userScores.sarah || 50;
        const finalScore = (alexScore + sarahScore) / 2;
        
        
        // Convert to grade
        return this.scoreToFairnessGrade(finalScore);
    }
    
    calculateUserThroughputFairness(userId, userData) {
        // Calculate how well a user achieved their throughput targets
        const config = this.userConfigs[userId];
        if (!config) return 50;
        
        const downloadTarget = config.targetDownload * 1000000; // Convert Mbps to bps
        const uploadTarget = config.targetUpload * 1000000;     // Convert Mbps to bps
        
        const downloadAchievements = [];
        const uploadAchievements = [];
        
        // Analyze each measurement
        for (const metric of userData.metrics) {
            if (metric.downloadThroughput !== undefined) {
                const downloadAchievement = Math.min(100, (metric.downloadThroughput / downloadTarget) * 100);
                downloadAchievements.push(downloadAchievement);
            }
            
            if (metric.uploadThroughput !== undefined) {
                const uploadAchievement = Math.min(100, (metric.uploadThroughput / uploadTarget) * 100);
                uploadAchievements.push(uploadAchievement);
            }
        }
        
        // Calculate scores
        let downloadScore = 0;
        let uploadScore = 0;
        
        if (downloadAchievements.length > 0) {
            // Score based on consistency of achieving target
            const avgDownloadAchievement = downloadAchievements.reduce((a, b) => a + b) / downloadAchievements.length;
            const consistentDownloadMeasurements = downloadAchievements.filter(a => a >= 90).length; // 90% of target
            const downloadConsistency = (consistentDownloadMeasurements / downloadAchievements.length) * 100;
            
            // Weighted score: 60% average achievement, 40% consistency
            downloadScore = (avgDownloadAchievement * 0.6) + (downloadConsistency * 0.4);
        }
        
        if (uploadAchievements.length > 0) {
            // Score based on consistency of achieving target
            const avgUploadAchievement = uploadAchievements.reduce((a, b) => a + b) / uploadAchievements.length;
            const consistentUploadMeasurements = uploadAchievements.filter(a => a >= 90).length; // 90% of target
            const uploadConsistency = (consistentUploadMeasurements / uploadAchievements.length) * 100;
            
            // Weighted score: 60% average achievement, 40% consistency
            uploadScore = (avgUploadAchievement * 0.6) + (uploadConsistency * 0.4);
        }
        
        // Combine download and upload scores
        let finalScore;
        if (downloadScore > 0 && uploadScore > 0) {
            // Both directions matter equally for Alex and Sarah
            finalScore = (downloadScore + uploadScore) / 2;
        } else if (downloadScore > 0) {
            finalScore = downloadScore;
        } else if (uploadScore > 0) {
            finalScore = uploadScore;
        } else {
            finalScore = 50; // Default if no valid measurements
        }
        
        const avgDownload = downloadAchievements.length > 0 ?
            downloadAchievements.reduce((a, b) => a + b) / downloadAchievements.length : 0;
        const avgUpload = uploadAchievements.length > 0 ?
            uploadAchievements.reduce((a, b) => a + b) / uploadAchievements.length : 0;
        
        
        return finalScore;
    }
    
    scoreToFairnessGrade(score) {
        // Grading scale for throughput fairness
        if (score >= 95) return 'A+';  // Excellent: Consistently achieving targets
        if (score >= 85) return 'A';   // Good: Usually achieving targets
        if (score >= 75) return 'B';   // Acceptable: Often achieving targets
        if (score >= 65) return 'C';   // Fair: Sometimes achieving targets
        if (score >= 55) return 'D';   // Poor: Rarely achieving targets
        return 'F';                    // Very poor: Failing to achieve targets
    }
    
    calculateLatencyStability() {
        // Enhanced Latency Stability Calculation
        // Prioritizes Alex and Sarah (latency-sensitive), tolerates Jake's buffering spikes,
        // and monitors Computer's safety threshold
        
        const userWeights = {
            alex: 0.45,    // 45% - Primary latency-sensitive (gaming)
            sarah: 0.45,   // 45% - Primary latency-sensitive (video calls)
            jake: 0.10,    // 10% - Secondary consideration (streaming)
            computer: 0.0  // 0% - Not included in stability scoring
        };
        
        const scores = {};
        let computerSafetyPenalty = false;
        
        // Calculate user-specific latency scores
        for (const [userId, userData] of Object.entries(this.testResults.users)) {
            if (!userData.metrics || userData.metrics.length === 0) {
                scores[userId] = 50; // Default score if no data
                continue;
            }
            
            switch (userId) {
                case 'alex':
                case 'sarah':
                    scores[userId] = this.calculatePrimaryUserLatencyScore(userId, userData);
                    break;
                case 'jake':
                    scores[userId] = this.calculateSecondaryUserLatencyScore(userId, userData);
                    break;
                case 'computer':
                    const safetyResult = this.calculateComputerSafetyScore(userId, userData);
                    if (safetyResult < 0) {
                        computerSafetyPenalty = true;
                    }
                    break;
                default:
                    scores[userId] = 50; // Default for unknown users
            }
        }
        
        // Calculate weighted final score
        let finalScore = 0;
        let totalWeight = 0;
        
        for (const [userId, weight] of Object.entries(userWeights)) {
            if (weight > 0 && scores[userId] !== undefined) {
                finalScore += scores[userId] * weight;
                totalWeight += weight;
            }
        }
        
        // Normalize if we don't have all users
        if (totalWeight > 0) {
            finalScore = finalScore / totalWeight;
        } else {
            finalScore = 50; // Default if no valid users
        }
        
        // Apply Computer safety penalty if needed
        if (computerSafetyPenalty) {
            finalScore = finalScore * 0.5; // 50% penalty for Computer latency violations
        }
        
        // Convert to grade
        return this.scoreToLatencyGrade(finalScore);
    }
    
    calculatePrimaryUserLatencyScore(userId, userData) {
        // For Alex (gaming) and Sarah (video calls) - need consistent ≤100ms latency
        const latencies = userData.metrics
            .map(m => m.latency)
            .filter(l => l !== undefined && l !== null);
        
        if (latencies.length === 0) return 50;
        
        const targetLatency = 100; // ms
        const criticalLatency = 200; // ms - raised from 150ms to be more tolerant
        
        // 1. Consistency Score: Percentage of measurements ≤100ms
        const consistentMeasurements = latencies.filter(l => l <= targetLatency).length;
        const consistencyScore = (consistentMeasurements / latencies.length) * 100;
        
        // 2. Stability Score: Much more tolerant of jitter
        const avgLatency = latencies.reduce((a, b) => a + b) / latencies.length;
        const variance = latencies.reduce((sum, l) => sum + Math.pow(l - avgLatency, 2), 0) / latencies.length;
        const stdDev = Math.sqrt(variance);
        
        // More forgiving jitter penalty: only penalize excessive jitter
        let stabilityScore = 100;
        if (stdDev > 50) {
            // Only penalize jitter above 50ms standard deviation
            stabilityScore = Math.max(60, 100 - ((stdDev - 50) / 5)); // Much gentler penalty
        }
        
        // 3. Peak Penalty: Reduced penalty for spikes, only for truly bad spikes
        const criticalSpikes = latencies.filter(l => l > criticalLatency).length;
        const spikePercentage = criticalSpikes / latencies.length;
        
        // Only penalize if >10% of measurements are critical spikes
        const peakPenalty = spikePercentage > 0.1 ? (spikePercentage - 0.1) * 200 : 0; // Much reduced penalty
        
        // 4. Average Latency Penalty: More tolerant
        const avgPenalty = avgLatency > 120 ? (avgLatency - 120) / 4 : 0; // Only penalize if avg >120ms
        
        const finalScore = Math.max(0, (consistencyScore * 0.5 + stabilityScore * 0.5) - peakPenalty - avgPenalty);
        
        
        return finalScore;
    }
    
    calculateSecondaryUserLatencyScore(userId, userData) {
        // For Jake (streaming) - focus on average stability, allow buffering spikes
        const latencies = userData.metrics
            .map(m => m.latency)
            .filter(l => l !== undefined && l !== null);
        
        if (latencies.length === 0) return 50;
        
        const targetAvgLatency = 200; // ms - more tolerant for streaming
        const maxTolerableLatency = 500; // ms - spikes above this during non-buffering are penalized
        
        // 1. Rolling Average Stability: Focus on sustained performance
        const rollingAverages = this.calculateRollingAverages(latencies, 10); // 10-measurement window
        const avgOfAverages = rollingAverages.reduce((a, b) => a + b) / rollingAverages.length;
        const avgStabilityScore = Math.max(0, 100 - Math.max(0, avgOfAverages - targetAvgLatency) / 5);
        
        // 2. Detect buffering periods based on throughput patterns
        const bufferingPeriods = this.detectBufferingPeriods(userId, userData);
        
        // 3. Context-aware spike penalty: Only penalize spikes outside buffering
        const contextualSpikes = this.countSpikesOutsideBuffering(
            userData.metrics, bufferingPeriods, maxTolerableLatency
        );
        const spikePenalty = contextualSpikes * 3; // Lighter penalty than primary users
        
        // 4. Overall latency check: Ensure it's not consistently terrible
        const overallAvg = latencies.reduce((a, b) => a + b) / latencies.length;
        const overallPenalty = overallAvg > 300 ? (overallAvg - 300) / 10 : 0;
        
        const finalScore = Math.max(0, avgStabilityScore - spikePenalty - overallPenalty);
        
        
        return finalScore;
    }
    
    calculateComputerSafetyScore(userId, userData) {
        // For Computer - simple safety check: must stay <5000ms
        const latencies = userData.metrics
            .map(m => m.latency)
            .filter(l => l !== undefined && l !== null);
        
        if (latencies.length === 0) return 0; // Neutral if no data
        
        const safetyThreshold = 5000; // ms
        const maxLatency = Math.max(...latencies);
        const violationCount = latencies.filter(l => l > safetyThreshold).length;
        
        
        // Return -1 if any violations (triggers penalty), 0 if safe
        return violationCount > 0 ? -1 : 0;
    }
    
    calculateRollingAverages(values, windowSize) {
        // Calculate rolling averages for trend analysis
        const rollingAverages = [];
        for (let i = windowSize - 1; i < values.length; i++) {
            const window = values.slice(i - windowSize + 1, i + 1);
            const avg = window.reduce((a, b) => a + b) / window.length;
            rollingAverages.push(avg);
        }
        return rollingAverages.length > 0 ? rollingAverages : [values.reduce((a, b) => a + b) / values.length];
    }
    
    detectBufferingPeriods(userId, userData) {
        // Detect periods when Jake is likely buffering based on throughput patterns
        if (userId !== 'jake') return [];
        
        const bufferingPeriods = [];
        const metrics = userData.metrics;
        
        for (let i = 1; i < metrics.length - 1; i++) {
            const current = metrics[i];
            const prev = metrics[i - 1];
            const next = metrics[i + 1];
            
            // Look for throughput spikes (buffering) followed by drops (playback)
            const currentThroughput = (current.downloadThroughput || 0) / 1000000; // Convert to Mbps
            const prevThroughput = (prev.downloadThroughput || 0) / 1000000;
            const nextThroughput = (next.downloadThroughput || 0) / 1000000;
            
            // Detect buffering: high throughput (>15 Mbps) indicating buffer filling
            if (currentThroughput > 15 && (prevThroughput < 10 || nextThroughput < 10)) {
                bufferingPeriods.push({
                    start: current.timestamp - 2000, // 2s before
                    end: current.timestamp + 3000,   // 3s after
                    throughput: currentThroughput
                });
            }
        }
        
        // Merge overlapping periods
        return this.mergeOverlappingPeriods(bufferingPeriods);
    }
    
    mergeOverlappingPeriods(periods) {
        if (periods.length === 0) return [];
        
        periods.sort((a, b) => a.start - b.start);
        const merged = [periods[0]];
        
        for (let i = 1; i < periods.length; i++) {
            const current = periods[i];
            const last = merged[merged.length - 1];
            
            if (current.start <= last.end) {
                // Overlapping periods - merge them
                last.end = Math.max(last.end, current.end);
            } else {
                merged.push(current);
            }
        }
        
        return merged;
    }
    
    countSpikesOutsideBuffering(metrics, bufferingPeriods, threshold) {
        // Count latency spikes that occur outside of buffering periods
        let spikesOutsideBuffering = 0;
        
        for (const metric of metrics) {
            if (!metric.latency || metric.latency <= threshold) continue;
            
            // Check if this spike occurs during a buffering period
            const isDuringBuffering = bufferingPeriods.some(period =>
                metric.timestamp >= period.start && metric.timestamp <= period.end
            );
            
            if (!isDuringBuffering) {
                spikesOutsideBuffering++;
            }
        }
        
        return spikesOutsideBuffering;
    }
    
    scoreToLatencyGrade(score) {
        // More realistic grading scale for home networks
        if (score >= 85) return 'A+';  // Excellent: Consistently good latency with minimal jitter
        if (score >= 75) return 'A';   // Good: Generally good latency with occasional spikes
        if (score >= 65) return 'B';   // Acceptable: Decent latency with some consistency issues
        if (score >= 55) return 'C';   // Fair: Manageable latency but noticeable issues
        if (score >= 45) return 'D';   // Poor: Significant latency problems affecting experience
        return 'F';                    // Very poor: Unacceptable for real-time applications
    }
    
    calculateQoSEffectiveness() {
        // QoS/DSCP functionality removed - no longer used
        return null;
    }
    
    getAverageLatencyForUsers(userIds) {
        const latencies = [];
        
        for (const userId of userIds) {
            const userData = this.testResults.users[userId];
            if (userData) {
                const avgMetrics = this.calculateAverageMetrics(userData.metrics);
                if (avgMetrics.latency) {
                    latencies.push(avgMetrics.latency);
                }
            }
        }
        
        return latencies.length > 0 ? latencies.reduce((a, b) => a + b) / latencies.length : 0;
    }
    
    generateUserDescription(userId, metrics, grade) {
        const config = this.userConfigs[userId];
        const avgMetrics = this.calculateAverageMetrics(metrics);
        
        switch (userId) {
            case 'gamer':
                if (grade === 'A+' || grade === 'A') {
                    return 'Minimal lag, consistent ping';
                } else if (grade === 'B') {
                    return 'Slight lag during heavy usage';
                } else {
                    return 'Noticeable lag affecting gameplay';
                }
                
            case 'worker':
                if (grade === 'A+' || grade === 'A') {
                    return 'Call was clear, zero drops or jitter';
                } else if (grade === 'B') {
                    return 'Minor call quality issues';
                } else {
                    return 'Call quality significantly affected';
                }
                
            case 'streamer':
                if (grade === 'A+' || grade === 'A') {
                    return 'Smooth streaming, no buffering';
                } else if (grade === 'B') {
                    return 'Slight buffering due to congestion';
                } else {
                    return 'Frequent buffering and quality drops';
                }
                
            case 'downloader':
                if (grade === 'A+' || grade === 'A') {
                    return 'Good throughput, minimal impact';
                } else if (grade === 'B') {
                    return 'Moderate throughput, some impact';
                } else {
                    return 'High delay, low throughput (expected)';
                }
                
            default:
                return 'Performance analysis complete';
        }
    }
    
    generateRecommendations() {
        const recommendations = [];
        
        // Enhanced recommendations based on new scoring systems
        
        // 1. Analyze Network Fairness (Alex and Sarah throughput targets)
        this.analyzeNetworkFairnessRecommendations(recommendations);
        
        // 2. Analyze Latency Stability (prioritizing Alex and Sarah)
        this.analyzeLatencyStabilityRecommendations(recommendations);
        
        // 3. Analyze Computer Safety Issues
        this.analyzeComputerSafetyRecommendations(recommendations);
        
        // 4. Analyze Jake's Buffering Patterns
        this.analyzeJakeBufferingRecommendations(recommendations);
        
        // 5. Add general recommendations if no specific issues found
        if (recommendations.length === 0) {
            recommendations.push({
                type: 'success',
                title: 'Excellent Network Performance',
                description: 'Your network handled the virtual household test exceptionally well. Alex and Sarah maintained low latency, throughput targets were consistently met, and Jake\'s streaming was smooth with minimal buffering.'
            });
        }
        
        return recommendations;
    }
    
    analyzeNetworkFairnessRecommendations(recommendations) {
        // SIMPLIFIED: Check individual Alex and Sarah grades for throughput issues
        const alexGrade = this.testResults.users.alex?.grade || 'F';
        const sarahGrade = this.testResults.users.sarah?.grade || 'F';
        
        if (alexGrade === 'F' || alexGrade === 'D' || sarahGrade === 'F' || sarahGrade === 'D') {
            // Critical throughput issues
            const alexData = this.testResults.users.alex;
            const sarahData = this.testResults.users.sarah;
            
            let specificIssues = [];
            
            if (alexData) {
                const alexAvgDownload = this.calculateAverageThroughputAchievement(alexData, 'download');
                const alexAvgUpload = this.calculateAverageThroughputAchievement(alexData, 'upload');
                
                if (alexAvgDownload < 70) {
                    specificIssues.push(`Alex's gaming download only achieved ${alexAvgDownload.toFixed(0)}% of target (needs 1.5 Mbps)`);
                }
                if (alexAvgUpload < 70) {
                    specificIssues.push(`Alex's gaming upload only achieved ${alexAvgUpload.toFixed(0)}% of target (needs 0.75 Mbps)`);
                }
            }
            
            if (sarahData) {
                const sarahAvgDownload = this.calculateAverageThroughputAchievement(sarahData, 'download');
                const sarahAvgUpload = this.calculateAverageThroughputAchievement(sarahData, 'upload');
                
                if (sarahAvgDownload < 70) {
                    specificIssues.push(`Sarah's video call download only achieved ${sarahAvgDownload.toFixed(0)}% of target (needs 2.5 Mbps)`);
                }
                if (sarahAvgUpload < 70) {
                    specificIssues.push(`Sarah's video call upload only achieved ${sarahAvgUpload.toFixed(0)}% of target (needs 2.5 Mbps)`);
                }
            }
            
            recommendations.push({
                type: 'error',
                title: 'Critical Throughput Issues',
                description: `Primary users cannot reach their throughput targets: ${specificIssues.join('; ')}. Consider implementing Smart Queue Management (SQM) or upgrading your internet plan.`
            });
            
        } else if (alexGrade === 'C' || sarahGrade === 'C') {
            recommendations.push({
                type: 'warning',
                title: 'Inconsistent Throughput Performance',
                description: 'Alex and Sarah sometimes struggle to reach their throughput targets. Consider enabling Quality of Service (QoS) rules to prioritize gaming and video call traffic.'
            });
        }
    }
    
    analyzeLatencyStabilityRecommendations(recommendations) {
        // SIMPLIFIED: Check individual Alex and Sarah grades for latency issues
        const alexGrade = this.testResults.users.alex?.grade || 'F';
        const sarahGrade = this.testResults.users.sarah?.grade || 'F';
        
        if (alexGrade === 'F' || alexGrade === 'D' || sarahGrade === 'F' || sarahGrade === 'D') {
            // Critical latency issues
            const alexData = this.testResults.users.alex;
            const sarahData = this.testResults.users.sarah;
            
            let latencyIssues = [];
            
            if (alexData) {
                const alexLatencies = alexData.metrics.map(m => m.latency).filter(l => l !== undefined);
                const alexAvg = alexLatencies.length > 0 ? alexLatencies.reduce((a, b) => a + b) / alexLatencies.length : 0;
                const alexSpikes = alexLatencies.filter(l => l > 150).length;
                
                if (alexAvg > 75) {
                    latencyIssues.push(`Alex's gaming averages ${alexAvg.toFixed(0)}ms (target: ≤75ms)`);
                }
                if (alexSpikes > alexLatencies.length * 0.1) {
                    latencyIssues.push(`Alex experiences frequent latency spikes (${alexSpikes} spikes >150ms)`);
                }
            }
            
            if (sarahData) {
                const sarahLatencies = sarahData.metrics.map(m => m.latency).filter(l => l !== undefined);
                const sarahAvg = sarahLatencies.length > 0 ? sarahLatencies.reduce((a, b) => a + b) / sarahLatencies.length : 0;
                const sarahSpikes = sarahLatencies.filter(l => l > 150).length;
                
                if (sarahAvg > 150) {
                    latencyIssues.push(`Sarah's video calls average ${sarahAvg.toFixed(0)}ms (target: ≤150ms)`);
                }
                if (sarahSpikes > sarahLatencies.length * 0.1) {
                    latencyIssues.push(`Sarah experiences frequent call quality issues (${sarahSpikes} spikes >150ms)`);
                }
            }
            
            recommendations.push({
                type: 'error',
                title: 'Critical Latency Problems',
                description: `Real-time applications are severely impacted: ${latencyIssues.join('; ')}. Implement bufferbloat mitigation (SQM/fq_codel) immediately.`
            });
            
        } else if (alexGrade === 'C' || sarahGrade === 'C') {
            recommendations.push({
                type: 'warning',
                title: 'Latency Consistency Issues',
                description: 'Alex and Sarah experience occasional latency spikes that may affect gaming and video call quality. Consider enabling Smart Queue Management to reduce bufferbloat.'
            });
        }
    }
    
    analyzeComputerSafetyRecommendations(recommendations) {
        const computerData = this.testResults.users.computer;
        if (!computerData) return;
        
        const computerLatencies = computerData.metrics.map(m => m.latency).filter(l => l !== undefined);
        const maxLatency = computerLatencies.length > 0 ? Math.max(...computerLatencies) : 0;
        const violations = computerLatencies.filter(l => l > 5000).length;
        
        if (violations > 0) {
            recommendations.push({
                type: 'error',
                title: 'Network Safety Threshold Violated',
                description: `Computer downloads caused extreme latency (max: ${maxLatency.toFixed(0)}ms, ${violations} violations >5000ms). This indicates severe bufferbloat that could make the network unusable. Implement SQM immediately.`
            });
        } else if (maxLatency > 2000) {
            recommendations.push({
                type: 'warning',
                title: 'High Background Download Impact',
                description: `Computer downloads caused significant latency increases (max: ${maxLatency.toFixed(0)}ms). While within safety limits, consider rate limiting or SQM for better performance.`
            });
        }
    }
    
    analyzeJakeBufferingRecommendations(recommendations) {
        const jakeData = this.testResults.users.jake;
        if (!jakeData) return;
        
        const jakeLatencies = jakeData.metrics.map(m => m.latency).filter(l => l !== undefined);
        const jakeAvg = jakeLatencies.length > 0 ? jakeLatencies.reduce((a, b) => a + b) / jakeLatencies.length : 0;
        const jakeSpikes = jakeLatencies.filter(l => l > 500).length;
        
        // Detect buffering periods
        const bufferingPeriods = this.detectBufferingPeriods('jake', jakeData);
        const contextualSpikes = this.countSpikesOutsideBuffering(jakeData.metrics, bufferingPeriods, 500);
        
        if (jakeAvg > 300 || contextualSpikes > jakeLatencies.length * 0.15) {
            recommendations.push({
                type: 'warning',
                title: 'Streaming Performance Issues',
                description: `Jake's Netflix streaming shows signs of network stress (avg: ${jakeAvg.toFixed(0)}ms, ${contextualSpikes} unexpected spikes). This may cause quality drops or buffering during peak usage.`
            });
        } else if (bufferingPeriods.length > 10) {
            recommendations.push({
                type: 'info',
                title: 'Normal Streaming Behavior',
                description: `Jake's Netflix streaming shows normal buffering patterns (${bufferingPeriods.length} buffering periods detected). Latency spikes during buffering are expected and don't indicate network problems.`
            });
        }
    }
    
    calculateAverageThroughputAchievement(userData, direction) {
        // Calculate average percentage of throughput target achieved
        const config = this.userConfigs[userData.config?.name?.toLowerCase()] ||
                      this.userConfigs[Object.keys(this.userConfigs).find(key =>
                          this.userConfigs[key].name === userData.config?.name)];
        
        if (!config) return 0;
        
        const target = direction === 'download' ?
            config.targetDownload * 1000000 :
            config.targetUpload * 1000000;
        
        const achievements = userData.metrics
            .map(m => direction === 'download' ? m.downloadThroughput : m.uploadThroughput)
            .filter(t => t !== undefined)
            .map(t => Math.min(100, (t / target) * 100));
        
        return achievements.length > 0 ?
            achievements.reduce((a, b) => a + b) / achievements.length : 0;
    }
    
    calculateOverallGrade() {
        // SIMPLIFIED: Base overall grade on average of Alex and Sarah individual grades
        // They are the priority users most sensitive to bufferbloat
        
        // Convert letter grades to numeric scores
        const gradeToScore = {
            'A+': 97,
            'A': 93,
            'B': 85,
            'C': 75,
            'D': 65,
            'F': 50
        };
        
        const scoreToGrade = (score) => {
            if (score >= 95) return 'A+';
            if (score >= 90) return 'A';
            if (score >= 80) return 'B';
            if (score >= 70) return 'C';
            if (score >= 60) return 'D';
            return 'F';
        };
        
        // Get Alex and Sarah individual grades
        const alexGrade = this.testResults.users.alex?.grade || 'F';
        const sarahGrade = this.testResults.users.sarah?.grade || 'F';
        
        const alexScore = gradeToScore[alexGrade] || 50;
        const sarahScore = gradeToScore[sarahGrade] || 50;
        
        // Simple average of Alex and Sarah scores
        const finalScore = (alexScore + sarahScore) / 2;
        
        return scoreToGrade(finalScore);
    }
    
    async stopTest() {
        if (!this.isActive) {
            this.logger.log('⚠️ stopTest() called but test is not active');
            return;
        }
        
        this.logger.log('🛑 STARTING stopTest() method');
        console.log('🛑 Stopping Virtual Household Test');
        
        try {
            // Stop throughput calculation timer
            this.logger.log('🛑 Stopping throughput calculation timer...');
            this.stopThroughputCalculationTimer();
            
            // CRITICAL: Send stop signals to all server processes FIRST
            this.logger.log(`🔍 Found ${this.websocketConnections.size} WebSocket connections to close`);
            
            if (this.websocketConnections.size === 0) {
                this.logger.warn('⚠️ No WebSocket connections found in stopTest()');
            }
            
            const stopPromises = [];
            
            // MULTI-USER SAFE APPROACH: Only close the WebSocket connections for THIS test instance
            this.logger.log(`🛑 SERVER BUG IDENTIFIED: Sessions don't clean up on WebSocket disconnect`);
            this.logger.log(`🛑 SAFE WORKAROUND: Force close only THIS client's WebSocket connections`);
            this.logger.log(`⚠️ NOTE: Server-side fix needed to properly clean up sessions on disconnect`);
            
            for (const [userId, websocket] of this.websocketConnections) {
                this.logger.log(`🔍 Processing WebSocket for ${userId}, readyState: ${websocket.readyState}`);
                
                if (websocket.readyState === WebSocket.OPEN) {
                    try {
                        this.logger.log(`🛑 MULTI-USER SAFE: Force closing only THIS client's WebSocket for ${userId}`);
                        
                        // Force close the WebSocket - this is safe as it only affects this client
                        websocket.close(1000, 'Test stopped - force disconnect');
                        
                        // Immediately clear all event handlers to prevent reconnection
                        websocket.onopen = null;
                        websocket.onmessage = null;
                        websocket.onerror = null;
                        websocket.onclose = null;
                        
                        this.logger.log(`✅ Safely force closed WebSocket for ${userId}`);
                        
                        // Create a promise that resolves immediately since we've force closed
                        const closePromise = new Promise((resolve) => {
                            // WebSocket is force closed, resolve immediately  
                            this.logger.log(`🔌 WebSocket force closed for ${userId} (immediate cleanup)`);
                            resolve();
                        });
                        
                        stopPromises.push(closePromise);
                    } catch (error) {
                        this.logger.error(`❌ Failed to send stop signal to ${userId}:`, error);
                        this.logger.error(`❌ Error details:`, error.message, error.stack);
                    }
                } else {
                    this.logger.log(`⚠️ WebSocket for ${userId} not open (state: ${websocket.readyState})`);
                }
            }
            
            // Wait for all WebSockets to close gracefully or timeout
            this.logger.log(`⏳ Waiting for ${stopPromises.length} WebSocket connections to close...`);
            if (stopPromises.length > 0) {
                await Promise.all(stopPromises);
                this.logger.log(`✅ All ${stopPromises.length} WebSocket close promises resolved`);
            } else {
                this.logger.warn('⚠️ No WebSocket close promises to wait for in stopTest()');
            }
            
            // Force close any remaining connections and clear event handlers
            let remainingConnections = 0;
            for (const [userId, websocket] of this.websocketConnections) {
                if (websocket.readyState === WebSocket.OPEN) {
                    remainingConnections++;
                    this.logger.log(`🔨 Force closing remaining WebSocket for ${userId}`);
                    websocket.close(1000, 'Test stopped - force close');
                    
                    // Clear all event handlers to prevent any further activity
                    websocket.onopen = null;
                    websocket.onmessage = null;
                    websocket.onerror = null;
                    websocket.onclose = null;
                }
            }
            
            if (remainingConnections > 0) {
                this.logger.log(`🔨 Force closed ${remainingConnections} remaining connections`);
            } else {
                this.logger.log(`✅ No remaining connections needed force closing`);
            }
            
            // ARCHITECTURE FIX: Send stop signals directly to the separate processes (ports 8001-8004)
            // The main server (port 8000) doesn't have the actual WebSocket sessions
            // Do this BEFORE clearing the websocketConnections map
            try {
                this.logger.log(`🛑 ARCHITECTURE FIX: Sending stop signals directly to separate processes`);
                
                // Send stop signals to each user's dedicated process
                const stopPromises = [];
                const userPorts = {
                    'alex': 8001,
                    'sarah': 8002, 
                    'jake': 8003,
                    'computer': 8004
                };
                
                for (const [userId, websocket] of this.websocketConnections) {
                    const userType = userId.split('_')[0].toLowerCase(); // Extract user type from session ID
                    const port = userPorts[userType];
                    
                    if (port) {
                        const stopPromise = this.sendStopSignalToProcess(userType, port, userId);
                        stopPromises.push(stopPromise);
                    }
                }
                
                // Wait for all stop signals to complete
                const results = await Promise.allSettled(stopPromises);
                const successful = results.filter(r => r.status === 'fulfilled').length;
                const failed = results.filter(r => r.status === 'rejected').length;
                
                this.logger.log(`✅ Stop signals sent to separate processes: ${successful} successful, ${failed} failed`);
                
            } catch (error) {
                this.logger.warn('⚠️ Stop signals to separate processes failed (non-critical): ' + error.message);
            }
            
            this.websocketConnections.clear();
            this.logger.log('🧹 WebSocket connections map cleared');
            
            // Stop tracking
            if (this.latencyTracker) {
                this.latencyTracker.stop();
                this.logger.log('🛑 Latency tracker stopped');
            }
            
            // Update UI
            if (this.ui) {
                this.ui.setTestRunning(false);
                this.ui.updateStatus('Test stopped - WebSocket connections closed');
                this.logger.log('🎨 UI updated with stop status');
            }
            
            this.logger.log('🧹 All WebSocket connections properly closed');
            this.logger.log('✅ stopTest() method finished successfully');
            
        } catch (error) {
            this.logger.error('❌ CRITICAL ERROR in stopTest():', error);
            this.logger.error('❌ Error message:', error.message);
            this.logger.error('❌ Error stack:', error.stack);
            console.error('❌ Error stopping test:', error);
        } finally {
            this.isActive = false;
            this.logger.log('🛑 stopTest() finally block - isActive set to false');
        }
    }
    
    // Public API for mode switching
    show() {
        const container = document.getElementById('householdContainer');
        if (container) {
            container.classList.remove('hidden');
        }
        
        // Update header description
        const description = document.getElementById('headerDescription');
        if (description) {
            description.textContent = 'Simulate realistic multi-user household conditions';
        }
    }
    
    hide() {
        const container = document.getElementById('householdContainer');
        if (container) {
            container.classList.add('hidden');
        }
        
        // Stop test if running
        if (this.isActive) {
            this.stopTest();
        }
    }
    
    // Cleanup method for proper destruction
    async destroy() {
        console.log('🗑️ Destroying Virtual Household Mode');
        
        // Stop test if running
        if (this.isActive) {
            await this.stopTest();
        }
        
        // Clean up all components
        if (this.latencyTracker) {
            this.latencyTracker.stop();
            this.latencyTracker = null;
        }
        
        // WebSocket connections are managed by individual workers
        
        if (this.ui) {
            this.ui = null;
        }
        
        if (this.adaptiveController) {
            this.adaptiveController = null;
        }
        
        // Clear workers
        this.workers.clear();
        
        // Reset state
        this.testResults = {
            users: {},
            overall: {},
            recommendations: []
        };
        
        console.log('✅ Virtual Household Mode destroyed');
    }
}

export default VirtualHousehold;