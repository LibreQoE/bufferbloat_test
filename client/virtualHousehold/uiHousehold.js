/**
 * UI Management for Virtual Household Mode
 * Handles real-time updates, user interactions, and visual feedback
 */

// Import shared results system for beautiful UI components
import { displayUnifiedResults, initializeInteractiveFeatures, cleanupResults } from '../shared/testResults.js';
import { createVirtualHouseholdAdapter } from '../shared/resultAdapters.js';
import { determineGrade, calculateTotalGrade } from '../shared/gradeCalculations.js';
import { telemetryManager } from '../telemetry.js';

// Logging control - set to false to reduce console spam for production
const VERBOSE_LOGGING = false;

class UIHousehold {
    constructor(virtualHousehold) {
        if (VERBOSE_LOGGING) {
            console.log('🏗️ UIHousehold constructor called');
            console.log('🔍 DEBUG: virtualHousehold parameter:', virtualHousehold);
            console.log('🔍 DEBUG: typeof virtualHousehold:', typeof virtualHousehold);
            console.log('🔍 DEBUG: virtualHousehold is null?', virtualHousehold === null);
            console.log('🔍 DEBUG: virtualHousehold is undefined?', virtualHousehold === undefined);
        }
        
        if (!virtualHousehold) {
            console.error('❌ VirtualHousehold instance not passed to UIHousehold constructor!');
            console.error('❌ This will cause the adaptive test to fail');
        } else if (VERBOSE_LOGGING) {
            console.log('✅ VirtualHousehold instance received in UIHousehold constructor');
            console.log('🔍 DEBUG: VirtualHousehold has startAdaptiveTest?', typeof virtualHousehold.startAdaptiveTest);
        }
        
        this.virtualHousehold = virtualHousehold;
        this.isActive = false;
        this.testRunning = false;
        this.startTime = null;
        this.testDuration = 30000; // 30 seconds
        
        // Optimized smooth animation system with synchronized updates
        this.masterUpdateInterval = 33; // 30fps master cycle for all animations
        this.updateCycle = 0; // Cycle counter for staggered updates
        this.frameSkipThreshold = 50; // Skip frames if update takes longer than 50ms
        
        // Single master timer for synchronized updates
        this.masterTimer = null;
        this.lastFrameTime = 0;
        this.frameTimeBuffer = [];
        this.adaptiveQuality = true; // Enable adaptive quality based on performance
        
        // Enhanced data buffering with smoothing
        this.latestMetrics = {}; // Buffer latest metrics for smooth updates
        this.smoothedMetrics = {}; // Smoothed values for display
        this.lastNumberUpdate = {}; // Track when numbers were last updated
        this.pendingSparklineUpdates = {}; // Queue sparkline updates for smooth rendering
        this.dataHistory = {}; // Historical data for smoothing calculations
        
        // Animation state tracking
        this.animationState = {
            sparklineNeedsUpdate: {},
            numbersNeedUpdate: {},
            progressNeedsUpdate: {},
            lastSparklineUpdate: {},
            frameDropCount: 0
        };
        
        // Separate sentiment update system
        this.sentimentUpdateInterval = 5000; // Update sentiment every 5 seconds
        this.sentimentTimer = null;
        this.lastSentimentUpdate = {};
        this.pendingSentiments = {}; // Store pending sentiment updates
        
        // Real Traffic User Profiles (matching new server implementation)
        this.users = {
            alex: {
                name: 'Alex',
                activity: 'Gaming with low latency needs',
                icon: '🎮',
                color: '#4A7C59', // Green theme for Alex's Bedroom
                targetDownload: 1.5,  // Mbps - realistic gaming
                targetUpload: 0.75,   // Mbps - realistic gaming
                activityType: 'gaming',
                thresholds: { latency: 75, jitter: 30 }
            },
            sarah: {
                name: 'Sarah',
                activity: 'Video conferencing',
                icon: '💼',
                color: '#4A6B8A', // Blue theme for Home Office
                targetDownload: 2.5,  // Mbps - realistic HD video call
                targetUpload: 2.5,    // Mbps - realistic HD video call
                activityType: 'video_call',
                thresholds: { latency: 150, jitter: 30 }
            },
            jake: {
                name: 'Jake',
                activity: 'HD video streaming',
                icon: '📺',
                color: '#6B5B7B', // Purple theme for Living Room
                targetDownload: 25.0, // Mbps
                targetUpload: 0.1,    // Mbps - minimal Netflix telemetry
                activityType: 'streaming',
                thresholds: { latency: 300, jitter: 100 }
            },
            computer: {
                name: 'Computer',
                activity: 'High-speed downloads (speed auto-detected)',
                icon: '🎮',
                color: '#7B6B5B', // Brown theme for Utility Room
                targetDownload: 1000.0, // Mbps - will be updated by Phase 1 speed detection
                targetUpload: 0.1,    // Mbps - minimal upload (100 Kbps)
                activityType: 'bulk_transfer',
                thresholds: { latency: 5000, jitter: 100 },
                adaptive: true // Mark as adaptive user
            }
        };
        
        // Bind event handlers
        this.handleLatencyMeasurement = this.handleLatencyMeasurement.bind(this);
        this.handleTrafficUpdate = this.handleTrafficUpdate.bind(this);
        this.updateUI = this.updateUI.bind(this);
        
        // Set up event listeners
        this.setupEventListeners();
        
        // Initialize UI elements
        this.initializeElements();
        
        // Apply smooth CSS transitions
        this.applySmoothTransitions();
    }
    
    setupEventListeners() {
        console.log('🎧 Setting up UI event listeners');
        
        // Listen for latency measurements
        window.addEventListener('latency-measurement', this.handleLatencyMeasurement);
        console.log('✅ Added latency-measurement listener');
        
        // Listen for traffic updates
        window.addEventListener('traffic-update', this.handleTrafficUpdate);
        console.log('✅ Added traffic-update listener');
        
        // Listen for test events
        window.addEventListener('household-test-start', () => {
            console.log('📡 Received household-test-start event');
            this.onTestStart();
        });
        window.addEventListener('household-test-complete', (e) => {
            console.log('📡 Received household-test-complete event:', e.detail);
            this.onTestComplete(e.detail);
        });
        window.addEventListener('household-test-error', (e) => {
            console.log('📡 Received household-test-error event:', e.detail);
            this.onTestError(e.detail);
        });
        console.log('✅ Added household test event listeners');
        
        console.log('🎧 All UI event listeners set up successfully');
    }
    
    initializeElements() {
        console.log('🔍 Initializing UI elements');
        
        // Cache DOM elements
        this.elements = {
            container: document.getElementById('householdContainer'), // Fixed: correct ID
            startButton: document.getElementById('start-household-test'),
            stopButton: null, // Stop button removed
            progressBar: document.getElementById('test-progress-bar'),
            
            resultsContainer: document.getElementById('householdResults'), // Fixed: correct ID
            overallGrade: document.getElementById('overall-grade'),
            networkFairness: document.getElementById('network-fairness'),
            latencyStability: document.getElementById('latency-stability'),
            recommendations: document.getElementById('recommendations-list')
        };
        
        // Log which elements were found (skip intentionally missing elements)
        Object.entries(this.elements).forEach(([key, element]) => {
            if (element) {
                console.log(`✅ Found element: ${key}`);
            } else if (key !== 'stopButton') { // stopButton is intentionally removed
                console.warn(`⚠️ Missing element: ${key}`);
            }
        });
        
        // Initialize user cards
        this.initializeUserCards();
        
        // Set up button handlers
        if (this.elements.startButton) {
            this.elements.startButton.addEventListener('click', () => this.startTest());
            console.log('✅ Start button handler added');
        } else {
            console.warn('⚠️ Start button not found');
        }
        
        // Stop button removed - no event listener needed
        
        console.log('🔍 UI elements initialization complete');
    }
    
    initializeUserCards() {
        console.log('🏠 Initializing user cards with smooth animation system');
        
        // Initialize sparkline data storage
        this.sparklineData = {};
        
        for (const [userId, user] of Object.entries(this.users)) {
            const card = document.getElementById(`room-${userId}`);
            if (!card) {
                console.warn(`⚠️ Card not found for user: ${userId}`);
                continue;
            }
            
            console.log(`✅ Found card for user: ${userId}`);
            
            // Initialize sparkline data with enhanced smoothing
            this.sparklineData[userId] = {
                latency: [],
                maxPoints: 30, // Reduced from 50 for better performance
                smoothingFactor: 0.3 // Exponential moving average factor
            };
            
            // Initialize data smoothing buffers
            this.smoothedMetrics[userId] = {
                downloadThroughput: 0,
                uploadThroughput: 0,
                latency: 0,
                jitter: 0
            };
            
            this.dataHistory[userId] = {
                downloadThroughput: [],
                uploadThroughput: [],
                latency: [],
                jitter: [],
                maxHistory: 5 // Keep last 5 values for smoothing
            };
            
            // Initialize animation state
            this.animationState.sparklineNeedsUpdate[userId] = false;
            this.animationState.numbersNeedUpdate[userId] = false;
            this.animationState.progressNeedsUpdate[userId] = false;
            this.animationState.lastSparklineUpdate[userId] = 0;
            
            // Initialize sparkline canvas with optimized settings
            this.initializeSparkline(userId);
            
            // Initialize metrics
            this.updateUserMetrics(userId, {
                downloadThroughput: 0,
                uploadThroughput: 0,
                latency: 0,
                jitter: 0,
                status: 'idle'
            });
            
            // Set initial status
            this.updateUserStatus(userId, 'idle', `${user.name} is ready`);
        }
        
        console.log('🏠 User cards initialization complete with smooth animation system');
    }
    
    show() {
        const container = document.getElementById('householdContainer');
        if (container) {
            container.classList.remove('hidden');
            container.style.display = 'block';
            this.isActive = true;
            console.log('📱 Virtual Household UI shown, isActive:', this.isActive);
        } else {
            console.warn('⚠️ Household container not found');
        }
    }
    
    hide() {
        const container = document.getElementById('householdContainer');
        if (container) {
            container.classList.add('hidden');
            container.style.display = 'none';
            this.isActive = false;
            console.log('📱 Virtual Household UI hidden, isActive:', this.isActive);
        } else {
            console.warn('⚠️ Household container not found');
        }
    }
    
    async startTest() {
        if (this.testRunning) return;
        
        console.log('🏠 UI BUTTON CLICKED: Starting MANDATORY two-phase Virtual Household test (Adaptive + Household)');
        
        // Token system removed for simplicity
        
        if (VERBOSE_LOGGING) {
            console.log('🔍 DEBUG: this:', this);
            console.log('🔍 DEBUG: this.virtualHousehold:', this.virtualHousehold);
            console.log('🔍 DEBUG: typeof this.virtualHousehold:', typeof this.virtualHousehold);
            console.log('🔍 DEBUG: this.virtualHousehold === null?', this.virtualHousehold === null);
            console.log('🔍 DEBUG: this.virtualHousehold === undefined?', this.virtualHousehold === undefined);
        }
        
        // Check if virtualHousehold instance exists
        if (!this.virtualHousehold) {
            console.error('❌ VirtualHousehold instance not available in UIHousehold');
            console.error('❌ this.virtualHousehold is:', this.virtualHousehold);
            console.error('❌ Constructor was called with virtualHousehold parameter, but it\'s now undefined');
            this.updateStatus('Error: VirtualHousehold instance not found');
            return;
        }
        
        // Check if startAdaptiveTest method exists
        if (typeof this.virtualHousehold.startAdaptiveTest !== 'function') {
            console.error('❌ startAdaptiveTest method not available on VirtualHousehold instance');
            console.error('❌ Available methods:', Object.getOwnPropertyNames(this.virtualHousehold));
            this.updateStatus('Error: startAdaptiveTest method not found');
            return;
        }
        
        console.log('✅ UI: About to call virtualHousehold.startAdaptiveTest()');
        
        // MANDATORY: Always start the two-phase adaptive test
        // Phase 1: Speed detection, Phase 2: Household saturation with detected speed
        try {
            this.virtualHousehold.startAdaptiveTest();
            console.log('✅ UI: virtualHousehold.startAdaptiveTest() called successfully');
        } catch (error) {
            console.error('❌ UI: Error calling startAdaptiveTest():', error);
            console.error('❌ UI: Error stack:', error.stack);
            this.updateStatus(`Error starting adaptive test: ${error.message}`);
        }
    }

    showProgress() {
        const progressContainer = document.querySelector('.test-progress-container');
        if (progressContainer) {
            progressContainer.style.display = 'block';
        }
    }

    hideProgress() {
        const progressContainer = document.querySelector('.test-progress-container');
        if (progressContainer) {
            progressContainer.style.display = 'none';
        }
        
        // Reset progress bar
        const progressBar = document.getElementById('test-progress-bar');
        if (progressBar) {
            progressBar.style.width = '0%';
        }
        
        
    }
    
    updateAdaptiveProfiles(adaptiveProfiles) {
        console.log('🔧 Updating adaptive profiles:', adaptiveProfiles);
        
        // Update Computer user profile with measured speed
        if (adaptiveProfiles.computer) {
            this.users.computer.targetDownload = adaptiveProfiles.computer.download_mbps;
            this.users.computer.activity = adaptiveProfiles.computer.description;
            
            // Update UI display
            const computerCard = document.getElementById('room-computer');
            if (computerCard) {
                const activityEl = computerCard.querySelector('.family-activity');
                if (activityEl) {
                    activityEl.textContent = adaptiveProfiles.computer.description;
                }
                
                const targetEl = computerCard.querySelector('.metric-download .metric-target');
                if (targetEl) {
                    targetEl.textContent = `Target: ${adaptiveProfiles.computer.download_mbps} Mbps`;
                }
            }
            
            console.log(`🔧 Updated Computer profile: ${adaptiveProfiles.computer.download_mbps} Mbps`);
        }
    }
    
    showPhaseIndicator(phase, progress = 0, message = '') {
        console.log(`📊 Showing phase indicator: ${phase} (${progress}%) - ${message}`);
        
        // Create or update phase indicator
        let phaseIndicator = document.getElementById('phase-indicator');
        if (!phaseIndicator) {
            phaseIndicator = document.createElement('div');
            phaseIndicator.id = 'phase-indicator';
            phaseIndicator.className = 'phase-indicator';
            
            // Insert at top of household container
            const container = document.getElementById('householdContainer');
            if (container) {
                container.insertBefore(phaseIndicator, container.firstChild);
            }
        }
        
        // Update phase indicator content
        const phaseIcons = {
            'warmup': '🔥',
            'results': '📊',
            'household': '🏠'
        };
        
        const phaseNames = {
            'warmup': 'Connection Speed Test',
            'results': 'Speed Test Results',
            'household': 'Virtual Household Test'
        };
        
        phaseIndicator.innerHTML = `
            <div class="phase-header">
                <span class="phase-icon">${phaseIcons[phase] || '📊'}</span>
                <span class="phase-name">${phaseNames[phase] || phase}</span>
            </div>
            <div class="phase-progress">
                <div class="phase-progress-bar">
                    <div class="phase-progress-fill" style="width: ${progress}%"></div>
                </div>
                <span class="phase-message">${message}</span>
            </div>
        `;
        
        phaseIndicator.className = `phase-indicator phase-${phase}`;
        phaseIndicator.style.display = 'block';
    }
    
    hidePhaseIndicator() {
        const phaseIndicator = document.getElementById('phase-indicator');
        if (phaseIndicator) {
            phaseIndicator.style.display = 'none';
        }
    }
    
    showWarmupResults(results) {
        console.log('🔥 Showing warmup results:', results);
        
        // Create or update warmup results display
        let warmupResults = document.getElementById('warmup-results');
        if (!warmupResults) {
            warmupResults = document.createElement('div');
            warmupResults.id = 'warmup-results';
            warmupResults.className = 'warmup-results';
            
            // Insert after phase indicator
            const phaseIndicator = document.getElementById('phase-indicator');
            if (phaseIndicator && phaseIndicator.parentNode) {
                phaseIndicator.parentNode.insertBefore(warmupResults, phaseIndicator.nextSibling);
            }
        }
        
        warmupResults.innerHTML = `
            <div class="warmup-results-header">
                <h3>🔥 Connection Speed Detected</h3>
            </div>
            <div class="warmup-results-content">
                <div class="speed-measurement">
                    <span class="speed-value">${results.measuredSpeed.toFixed(1)}</span>
                    <span class="speed-unit">Mbps</span>
                </div>
                <div class="speed-details">
                    <p>80th percentile of ${results.sampleCount} measurements</p>
                    <p>Computer user will adapt to this speed</p>
                </div>
            </div>
        `;
        
        warmupResults.style.display = 'block';
        
        // Auto-hide after 3 seconds
        setTimeout(() => {
            if (warmupResults) {
                warmupResults.style.display = 'none';
            }
        }, 3000);
    }
    
    stopTest() {
        if (!this.testRunning) return;
        
        console.log('🛑 Stopping Virtual Household test UI');
        
        // Dispatch stop event
        window.dispatchEvent(new CustomEvent('ui-stop-household-test'));
    }
    
    onTestStart() {
        console.log('🚀 onTestStart() called - setting testRunning to true');
        this.testRunning = true;
        this.startTime = performance.now();
        
        // Ensure UI is active when test starts
        this.isActive = true;
        console.log('🚀 Test starting - UI state:', {
            testRunning: this.testRunning,
            isActive: this.isActive,
            startTime: this.startTime
        });
        
        // Update button states
        if (this.elements.startButton) {
            this.elements.startButton.disabled = true;
            this.elements.startButton.textContent = 'Test Running...';
        }
        
        // Stop button removed
        
        // Reset progress
        this.updateProgress(0);
        
        // Hide previous results
        if (this.elements.resultsContainer) {
            this.elements.resultsContainer.style.display = 'none';
        }
        
        // Start separate update timers for smooth animations
        this.startSmoothUpdateTimers();
        
        // Start separate sentiment update timer
        this.startSentimentTimer();
        
        // Note: Legacy sparkline timer is disabled - using master timer instead
        
        console.log('✅ Virtual Household test UI started, isActive:', this.isActive);
    }
    
    onTestComplete(results) {
        this.testRunning = false;
        // Keep isActive = true so UI continues to show any ongoing data updates
        // This helps diagnose if WebSockets are not properly closed
        
        // Stop all smooth update timers
        this.stopSmoothUpdateTimers();
        
        // Stop sentiment updates
        this.stopSentimentTimer();
        
        // Update button states
        if (this.elements.startButton) {
            this.elements.startButton.disabled = false;
            this.elements.startButton.textContent = 'Start Household Test';
        }
        
        // Stop button removed
        
        // Complete progress
        this.updateProgress(100);
        
        // Show results
        this.displayResults(results);
        
        console.log('✅ Virtual Household test UI completed');
    }
    
    onTestError(error) {
        this.testRunning = false;
        
        // Stop all smooth update timers
        this.stopSmoothUpdateTimers();
        
        // Stop sentiment updates
        this.stopSentimentTimer();
        
        // Reset button states
        if (this.elements.startButton) {
            this.elements.startButton.disabled = false;
            this.elements.startButton.textContent = 'Start Household Test';
        }
        
        // Stop button removed
        
        // Show error
        this.showError(error);
        
        console.error('❌ Virtual Household test error:', error);
    }
    
    updateUI() {
        if (!this.testRunning || !this.startTime) return;
        
        const elapsed = performance.now() - this.startTime;
        const progress = Math.min((elapsed / this.testDuration) * 100, 100);
        
        this.updateProgress(progress);
    }
    
    updateProgress(percentage) {
        if (this.elements.progressBar) {
            this.elements.progressBar.style.width = `${percentage}%`;
        }
        
        
    }
    
    // Smooth animation system methods with master timer
    startSmoothUpdateTimers() {
        console.log('🎬 Starting synchronized smooth animation system');
        
        // Stop any existing timers first
        this.stopSmoothUpdateTimers();
        
        // Initialize data buffers and animation state
        for (const userId of Object.keys(this.users)) {
            // Only initialize if not already present, preserving existing traffic data
            if (!this.latestMetrics[userId]) {
                this.latestMetrics[userId] = {};
            }
            this.lastNumberUpdate[userId] = 0;
            this.pendingSparklineUpdates[userId] = [];
        }
        
        // Reset performance monitoring
        this.frameTimeBuffer = [];
        this.animationState.frameDropCount = 0;
        this.lastFrameTime = performance.now();
        
        // Start master timer with synchronized updates (replaces all legacy timers)
        this.startMasterTimer();
        
        // Legacy sparkline timer is disabled - using master timer instead
        // this.startSparklineTimer(); // Disabled to prevent conflicts
        
        console.log('✅ Synchronized smooth animation system started');
    }
    
    stopSmoothUpdateTimers() {
        console.log('🛑 Stopping synchronized smooth animation system');
        
        // Stop master timer
        this.stopMasterTimer();
        
        // Stop legacy timers if they exist
        if (this.numberTimer) {
            clearInterval(this.numberTimer);
            this.numberTimer = null;
        }
        
        if (this.progressTimer) {
            clearInterval(this.progressTimer);
            this.progressTimer = null;
        }
        
        if (this.generalTimer) {
            clearInterval(this.generalTimer);
            this.generalTimer = null;
        }
        
        // Stop sparkline animation (legacy)
        this.stopSparklineTimer();
        
        console.log('✅ Synchronized smooth animation system stopped');
    }

    startMasterTimer() {
        const masterUpdate = (currentTime) => {
            if (!this.testRunning) return;
            
            // Performance monitoring
            const frameTime = currentTime - this.lastFrameTime;
            this.frameTimeBuffer.push(frameTime);
            if (this.frameTimeBuffer.length > 10) {
                this.frameTimeBuffer.shift();
            }
            
            // Check for frame drops
            if (frameTime > this.frameSkipThreshold) {
                this.animationState.frameDropCount++;
                
                // Adaptive quality: reduce update frequency if performance is poor
                if (this.adaptiveQuality && this.animationState.frameDropCount > 5) {
                    this.updateCycle += 2; // Skip more frames
                }
            }
            
            // Synchronized updates based on cycle
            const cycle = this.updateCycle % 30; // 30-frame cycle at 30fps = 1 second
            
            // Sparkline updates: Every frame (30fps)
            this.updateSparklines();
            
            // Number updates: Every 30 frames (1 second)
            if (cycle === 0) {
                this.updateNumbers();
            }
            
            // Progress bar updates: Every frame (30fps)
            this.updateProgressBars();
            
            // General UI updates: Every 3 frames (10fps)
            if (cycle % 3 === 0) {
                this.updateUI();
            }
            
            this.updateCycle++;
            this.lastFrameTime = currentTime;
            
            // Schedule next frame
            this.masterTimer = requestAnimationFrame(masterUpdate);
        };
        
        // Start the master animation loop
        this.masterTimer = requestAnimationFrame(masterUpdate);
        console.log('🎬 Started master timer with synchronized 30fps updates');
    }

    stopMasterTimer() {
        if (this.masterTimer) {
            cancelAnimationFrame(this.masterTimer);
            this.masterTimer = null;
            console.log('🛑 Stopped master timer');
        }
    }

    updateSparklines() {
        // Process pending sparkline updates with smoothing
        for (const [userId, updates] of Object.entries(this.pendingSparklineUpdates)) {
            if (updates.length > 0) {
                // Get the latest latency value
                const latestUpdate = updates[updates.length - 1];
                
                // Apply data smoothing
                const smoothedLatency = this.getSmoothedValue(userId, 'latency', latestUpdate.latency);
                
                // Check if enough time has passed for sparkline update
                const now = performance.now();
                const lastUpdate = this.animationState.lastSparklineUpdate[userId] || 0;
                
                if (now - lastUpdate >= 16) { // ~60fps for sparklines
                    this.renderSparklineSmooth(userId, smoothedLatency);
                    this.animationState.lastSparklineUpdate[userId] = now;
                }
                
                // Clear processed updates
                this.pendingSparklineUpdates[userId] = [];
            }
        }
    }
    
    startSparklineTimer() {
        // Use requestAnimationFrame for 60fps sparkline updates
        const updateSparklines = () => {
            if (!this.testRunning) return;
            
            // Process pending sparkline updates
            for (const [userId, updates] of Object.entries(this.pendingSparklineUpdates)) {
                if (updates.length > 0) {
                    // Get the latest latency value
                    const latestUpdate = updates[updates.length - 1];
                    this.renderSparklineSmooth(userId, latestUpdate.latency);
                    
                    // Clear processed updates
                    this.pendingSparklineUpdates[userId] = [];
                }
            }
            
            // Schedule next frame
            this.sparklineTimer = requestAnimationFrame(updateSparklines);
        };
        
        // Start the animation loop
        this.sparklineTimer = requestAnimationFrame(updateSparklines);
        console.log('🎨 Started 60fps sparkline animation timer');
    }
    
    stopSparklineTimer() {
        if (this.sparklineTimer) {
            cancelAnimationFrame(this.sparklineTimer);
            this.sparklineTimer = null;
            console.log('🛑 Stopped sparkline animation timer');
        }
    }
    
    updateNumbers() {
        if (!this.testRunning) return;
        
        const now = performance.now();
        
        // Update numbers for each user using already smoothed values
        for (const [userId, metrics] of Object.entries(this.latestMetrics)) {
            if (Object.keys(metrics).length === 0) {
                continue;
            }
            
            // Use already smoothed values from smoothedMetrics buffer to avoid double-smoothing
            const smoothedMetrics = {};
            
            if (metrics.latency !== undefined) {
                smoothedMetrics.latency = this.getSmoothedValue(userId, 'latency', metrics.latency);
            }
            
            if (metrics.jitter !== undefined) {
                smoothedMetrics.jitter = this.getSmoothedValue(userId, 'jitter', metrics.jitter);
            }
            
            // For throughput, use the already smoothed values from the buffer
            // (these were smoothed in handleTrafficUpdate to prevent oscillations)
            if (this.smoothedMetrics[userId]) {
                if (this.smoothedMetrics[userId].downloadThroughput !== undefined) {
                    smoothedMetrics.downloadThroughput = this.smoothedMetrics[userId].downloadThroughput;
                }
                if (this.smoothedMetrics[userId].uploadThroughput !== undefined) {
                    smoothedMetrics.uploadThroughput = this.smoothedMetrics[userId].uploadThroughput;
                }
            }
            
            // Update display with smoothed values (only latency/jitter, throughput already updated)
            if (smoothedMetrics.latency !== undefined || smoothedMetrics.jitter !== undefined) {
                this.updateUserNumbersOnly(userId, smoothedMetrics);
            }
            this.lastNumberUpdate[userId] = now;
        }
    }
    
    updateProgressBars() {
        if (!this.testRunning) return;
        
        // Update progress bars for each user with smoothed data
        for (const [userId, metrics] of Object.entries(this.latestMetrics)) {
            if (Object.keys(metrics).length === 0) continue;
            
            // Use smoothed metrics from smoothedMetrics buffer (already updated in handleTrafficUpdate)
            const smoothedMetrics = this.smoothedMetrics[userId];
            if (smoothedMetrics) {
                this.updateUserProgressBarsOnly(userId, smoothedMetrics);
            }
        }
    }
    
    handleLatencyMeasurement(event) {
        const { userId, latency, jitter, timestamp } = event.detail;
        
        if (!this.isActive) return;
        
        // Buffer metrics for smooth updates
        this.latestMetrics[userId] = {
            ...this.latestMetrics[userId],
            latency,
            jitter,
            timestamp
        };
        
        // Queue sparkline update for smooth 60fps rendering
        if (this.pendingSparklineUpdates[userId]) {
            this.pendingSparklineUpdates[userId].push({ latency, timestamp });
        }
        
        // Update user status based on performance (immediate for responsiveness)
        this.updateUserPerformanceStatus(userId, { latency, jitter });
    }
    
    handleTrafficUpdate(event) {
        const { userId, throughput, status, downloadThroughput, uploadThroughput } = event.detail;
        
        if (!this.isActive) {
            return;
        }
        
        // Use actual throughput values from workers - no artificial splits
        // This accurately tracks real traffic in each direction
        let calculatedDownload = downloadThroughput || 0;
        let calculatedUpload = uploadThroughput || 0;
        
        // Only use total throughput as fallback if no directional data is available
        // This preserves backward compatibility with workers that only send total throughput
        if (calculatedDownload === 0 && calculatedUpload === 0 && throughput !== undefined && throughput > 0) {
            calculatedDownload = throughput;
            calculatedUpload = 0;
        }
        
        // Buffer metrics for smooth updates
        this.latestMetrics[userId] = {
            ...this.latestMetrics[userId],
            downloadThroughput: calculatedDownload,
            uploadThroughput: calculatedUpload
        };
        
        // Apply smoothing immediately for responsive display
        const smoothedDownload = this.getSmoothedValue(userId, 'downloadThroughput', calculatedDownload);
        const smoothedUpload = this.getSmoothedValue(userId, 'uploadThroughput', calculatedUpload);
        
        // Update display with smoothed values
        this.updateUserNumbersOnly(userId, {
            downloadThroughput: smoothedDownload,
            uploadThroughput: smoothedUpload
        });
        this.updateUserProgressBarsOnly(userId, {
            downloadThroughput: smoothedDownload,
            uploadThroughput: smoothedUpload
        });
        
        // Update user status (immediate for responsiveness)
        if (status) {
            this.updateUserStatus(userId, status);
        }
    }
    
    // Helper methods for smooth animation system
    updateUserNumbersOnly(userId, metrics) {
        const card = document.getElementById(`room-${userId}`);
        if (!card) {
            return;
        }
        
        // Update download throughput number only
        if (metrics.downloadThroughput !== undefined) {
            const downloadEl = card.querySelector('.metric-download .metric-value');
            if (downloadEl) {
                const bps = metrics.downloadThroughput;
                let displayValue, unit;
                
                if (bps >= 1000000) {
                    // >= 1 Mbps: show in Mbps
                    displayValue = (bps / 1000000).toFixed(1);
                    unit = 'Mbps';
                } else if (bps >= 1000) {
                    // >= 1 Kbps: show in Kbps
                    displayValue = (bps / 1000).toFixed(1);
                    unit = 'Kbps';
                } else {
                    // < 1 Kbps: show in bps
                    displayValue = Math.round(bps);
                    unit = 'bps';
                }
                
                downloadEl.textContent = `${displayValue} ${unit}`;
            }
        }
        
        // Update upload throughput number only
        if (metrics.uploadThroughput !== undefined) {
            const uploadEl = card.querySelector('.metric-upload .metric-value');
            if (uploadEl) {
                const bps = metrics.uploadThroughput;
                let displayValue, unit;
                
                if (bps >= 1000000) {
                    // >= 1 Mbps: show in Mbps
                    displayValue = (bps / 1000000).toFixed(1);
                    unit = 'Mbps';
                } else if (bps >= 1000) {
                    // >= 1 Kbps: show in Kbps
                    displayValue = (bps / 1000).toFixed(1);
                    unit = 'Kbps';
                } else {
                    // < 1 Kbps: show in bps
                    displayValue = Math.round(bps);
                    unit = 'bps';
                }
                
                uploadEl.textContent = `${displayValue} ${unit}`;
            }
        }
        
        // Update latency number only
        if (metrics.latency !== undefined) {
            const latencyEl = card.querySelector('.metric-latency .metric-value');
            if (latencyEl) {
                const latency = Math.round(metrics.latency);
                latencyEl.textContent = `${latency}ms`;
                
                // Apply color coding
                latencyEl.classList.remove('ping-excellent', 'ping-good', 'ping-fair', 'ping-poor');
                let colorClass;
                if (latency < 50) colorClass = 'ping-excellent';
                else if (latency < 100) colorClass = 'ping-good';
                else if (latency < 200) colorClass = 'ping-fair';
                else colorClass = 'ping-poor';
                latencyEl.classList.add(colorClass);
            }
        }
        
        // Update jitter number only
        if (metrics.jitter !== undefined) {
            const jitterEl = card.querySelector('.metric-jitter .metric-value');
            if (jitterEl) {
                const jitter = Math.round(metrics.jitter);
                jitterEl.textContent = `${jitter}ms`;
                
                // Apply color coding
                jitterEl.classList.remove('jitter-excellent', 'jitter-good', 'jitter-fair', 'jitter-poor');
                let colorClass;
                if (jitter < 5) colorClass = 'jitter-excellent';
                else if (jitter < 20) colorClass = 'jitter-good';
                else if (jitter < 50) colorClass = 'jitter-fair';
                else colorClass = 'jitter-poor';
                jitterEl.classList.add(colorClass);
            }
        }
        
    }
    
    updateUserProgressBarsOnly(userId, metrics) {
        const card = document.getElementById(`room-${userId}`);
        if (!card) return;
        
        const user = this.users[userId];
        if (!user) return;
        
        // Update download progress bar with target-based scaling
        if (metrics.downloadThroughput !== undefined) {
            const downloadProgressEl = card.querySelector('.metric-download .metric-progress-fill.download');
            if (downloadProgressEl) {
                const actualMbps = metrics.downloadThroughput / 1000000;
                const targetMbps = user.targetDownload;
                // Scale progress based on target (100% = target achieved)
                const percentage = Math.min((actualMbps / targetMbps) * 100, 100);
                downloadProgressEl.style.width = `${percentage}%`;
                
                // Add visual indicator for target achievement
                if (actualMbps >= targetMbps * 0.9) { // 90% of target
                    downloadProgressEl.classList.add('target-achieved');
                } else {
                    downloadProgressEl.classList.remove('target-achieved');
                }
            }
        }
        
        // Update upload progress bar with target-based scaling
        if (metrics.uploadThroughput !== undefined) {
            const uploadProgressEl = card.querySelector('.metric-upload .metric-progress-fill.upload');
            if (uploadProgressEl) {
                const actualMbps = metrics.uploadThroughput / 1000000;
                const targetMbps = user.targetUpload;
                // Scale progress based on target (100% = target achieved)
                const percentage = Math.min((actualMbps / targetMbps) * 100, 100);
                uploadProgressEl.style.width = `${percentage}%`;
                
                // Add visual indicator for target achievement
                if (actualMbps >= targetMbps * 0.9) { // 90% of target
                    uploadProgressEl.classList.add('target-achieved');
                } else {
                    uploadProgressEl.classList.remove('target-achieved');
                }
            }
        }
        
        // Update health indicator only
        if (metrics.latency !== undefined) {
            const healthEl = card.querySelector(`#${userId}PingHealth`);
            if (healthEl) {
                const latency = metrics.latency;
                let healthIcon, healthClass;
                
                if (latency < 50) {
                    healthIcon = '🟢';
                    healthClass = 'excellent';
                } else if (latency < 100) {
                    healthIcon = '🟡';
                    healthClass = 'good';
                } else if (latency < 200) {
                    healthIcon = '🟠';
                    healthClass = 'fair';
                } else {
                    healthIcon = '🔴';
                    healthClass = 'poor';
                }
                
                healthEl.textContent = healthIcon;
                healthEl.classList.remove('excellent', 'good', 'fair', 'poor');
                healthEl.classList.add(healthClass);
            }
        }
    }
    
    renderSparklineSmooth(userId, latency) {
        if (!this.sparklineData || !this.sparklineData[userId]) {
            return;
        }
        
        const canvas = document.getElementById(`${userId}Sparkline`);
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        
        // Add new data point
        this.sparklineData[userId].latency.push(latency);
        
        // Keep only the last maxPoints
        if (this.sparklineData[userId].latency.length > this.sparklineData[userId].maxPoints) {
            this.sparklineData[userId].latency.shift();
        }
        
        // Get actual canvas dimensions (accounting for device pixel ratio)
        const dpr = window.devicePixelRatio || 1;
        const displayWidth = canvas.width / dpr;
        const displayHeight = canvas.height / dpr;
        
        // Clear canvas completely (no background fill - let CSS handle it)
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        const data = this.sparklineData[userId].latency;
        if (data.length < 2) return;
        
        // Use fixed scale to prevent shifting (0-200ms range)
        const maxLatency = 200; // Fixed maximum for stable visualization
        const minLatency = 0;   // Fixed minimum
        const range = maxLatency - minLatency;
        
        // Get brighter theme colors for better visibility
        const themeColors = {
            alex: '#7FD99F',    // Bright green
            sarah: '#7FB8D9',   // Bright blue
            jake: '#B89FD9',    // Bright purple
            computer: '#D9B89F' // Bright brown
        };
        
        // Draw smooth sparkline with anti-aliasing
        ctx.save();
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        
        ctx.beginPath();
        ctx.strokeStyle = themeColors[userId] || '#FFFFFF';
        ctx.lineWidth = 2.5; // Slightly thicker for better visibility
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        
        const stepX = displayWidth / (this.sparklineData[userId].maxPoints - 1);
        
        for (let i = 0; i < data.length; i++) {
            const x = i * stepX;
            const y = displayHeight - ((data[i] - minLatency) / range) * (displayHeight - 4) - 2;
            
            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }
        
        ctx.stroke();
        
        // Add smooth gradient fill with brighter colors
        ctx.lineTo(data.length * stepX, displayHeight);
        ctx.lineTo(0, displayHeight);
        ctx.closePath();
        
        const gradient = ctx.createLinearGradient(0, 0, 0, displayHeight);
        const brightColor = themeColors[userId] || '#FFFFFF';
        gradient.addColorStop(0, brightColor + '60'); // 38% opacity
        gradient.addColorStop(1, brightColor + '20'); // 12% opacity
        
        ctx.fillStyle = gradient;
        ctx.fill();
        
        ctx.restore();
    }
    
    updateUserMetrics(userId, metrics) {
        const card = document.getElementById(`room-${userId}`);
        if (!card) {
            console.warn(`⚠️ Card not found for user ${userId}`);
            return;
        }
        
        
        // Update download throughput with target-based progress bar
        if (metrics.downloadThroughput !== undefined) {
            const downloadEl = card.querySelector('.metric-download .metric-value');
            const downloadProgressEl = card.querySelector('.metric-download .metric-progress-fill.download');
            const downloadTargetEl = card.querySelector('.metric-download .metric-target');
            
            if (downloadEl) {
                const bps = metrics.downloadThroughput;
                const user = this.users[userId];
                let displayValue, unit;
                
                if (bps >= 1000000) {
                    // >= 1 Mbps: show in Mbps
                    displayValue = (bps / 1000000).toFixed(1);
                    unit = 'Mbps';
                } else if (bps >= 1000) {
                    // >= 1 Kbps: show in Kbps
                    displayValue = (bps / 1000).toFixed(1);
                    unit = 'Kbps';
                } else {
                    // < 1 Kbps: show in bps
                    displayValue = Math.round(bps);
                    unit = 'bps';
                }
                
                downloadEl.textContent = `${displayValue} ${unit}`;
                
                // Show target if element exists
                if (downloadTargetEl && user) {
                    downloadTargetEl.textContent = `Target: ${user.targetDownload} Mbps`;
                }
                
                // Update progress bar with target-based scaling
                if (downloadProgressEl && user) {
                    const actualMbps = bps / 1000000;
                    const targetMbps = user.targetDownload;
                    const percentage = Math.min((actualMbps / targetMbps) * 100, 100);
                    downloadProgressEl.style.width = `${percentage}%`;
                    
                    // Add visual indicator for target achievement
                    if (actualMbps >= targetMbps * 0.9) {
                        downloadProgressEl.classList.add('target-achieved');
                    } else {
                        downloadProgressEl.classList.remove('target-achieved');
                    }
                } else {
                    console.warn(`⚠️ Download progress element not found for ${userId}`);
                }
            } else {
                console.warn(`⚠️ Download element not found for ${userId}`);
            }
        }
        
        // Update upload throughput with target-based progress bar
        if (metrics.uploadThroughput !== undefined) {
            const uploadEl = card.querySelector('.metric-upload .metric-value');
            const uploadProgressEl = card.querySelector('.metric-upload .metric-progress-fill.upload');
            const uploadTargetEl = card.querySelector('.metric-upload .metric-target');
            
            if (uploadEl) {
                const bps = metrics.uploadThroughput;
                const user = this.users[userId];
                let displayValue, unit;
                
                if (bps >= 1000000) {
                    // >= 1 Mbps: show in Mbps
                    displayValue = (bps / 1000000).toFixed(1);
                    unit = 'Mbps';
                } else if (bps >= 1000) {
                    // >= 1 Kbps: show in Kbps
                    displayValue = (bps / 1000).toFixed(1);
                    unit = 'Kbps';
                } else {
                    // < 1 Kbps: show in bps
                    displayValue = Math.round(bps);
                    unit = 'bps';
                }
                
                uploadEl.textContent = `${displayValue} ${unit}`;
                
                // Show target if element exists
                if (uploadTargetEl && user) {
                    uploadTargetEl.textContent = `Target: ${user.targetUpload} Mbps`;
                }
                
                // Update progress bar with target-based scaling
                if (uploadProgressEl && user) {
                    const actualMbps = bps / 1000000;
                    const targetMbps = user.targetUpload;
                    const percentage = Math.min((actualMbps / targetMbps) * 100, 100);
                    uploadProgressEl.style.width = `${percentage}%`;
                    
                    // Add visual indicator for target achievement
                    if (actualMbps >= targetMbps * 0.9) {
                        uploadProgressEl.classList.add('target-achieved');
                    } else {
                        uploadProgressEl.classList.remove('target-achieved');
                    }
                } else {
                    console.warn(`⚠️ Upload progress element not found for ${userId}`);
                }
            } else {
                console.warn(`⚠️ Upload element not found for ${userId}`);
            }
        }
        
        // Update latency (ping) with color coding and health indicator
        if (metrics.latency !== undefined) {
            const latencyEl = card.querySelector('.metric-latency .metric-value');
            const healthEl = card.querySelector(`#${userId}PingHealth`);
            if (latencyEl) {
                const latency = Math.round(metrics.latency);
                latencyEl.textContent = `${latency}ms`;
                
                // Apply color coding based on latency
                latencyEl.classList.remove('ping-excellent', 'ping-good', 'ping-fair', 'ping-poor');
                let colorClass, healthIcon, healthClass;
                
                if (latency < 50) {
                    colorClass = 'ping-excellent';
                    healthIcon = '🟢';
                    healthClass = 'excellent';
                } else if (latency < 100) {
                    colorClass = 'ping-good';
                    healthIcon = '🟡';
                    healthClass = 'good';
                } else if (latency < 200) {
                    colorClass = 'ping-fair';
                    healthIcon = '🟠';
                    healthClass = 'fair';
                } else {
                    colorClass = 'ping-poor';
                    healthIcon = '🔴';
                    healthClass = 'poor';
                }
                
                latencyEl.classList.add(colorClass);
                
                // Update health indicator
                if (healthEl) {
                    healthEl.textContent = healthIcon;
                    healthEl.classList.remove('excellent', 'good', 'fair', 'poor');
                    healthEl.classList.add(healthClass);
                }
                
                // Sparkline updates are now handled by the master timer system
                // this.updateSparkline(userId, latency); // Removed to prevent duplicate updates
            }
        }
        
        // Update jitter with color coding
        if (metrics.jitter !== undefined) {
            const jitterEl = card.querySelector('.metric-jitter .metric-value');
            if (jitterEl) {
                const jitter = Math.round(metrics.jitter);
                jitterEl.textContent = `${jitter}ms`;
                
                // Apply color coding based on jitter
                jitterEl.classList.remove('jitter-excellent', 'jitter-good', 'jitter-fair', 'jitter-poor');
                let colorClass;
                
                if (jitter < 5) {
                    colorClass = 'jitter-excellent';
                } else if (jitter < 20) {
                    colorClass = 'jitter-good';
                } else if (jitter < 50) {
                    colorClass = 'jitter-fair';
                } else {
                    colorClass = 'jitter-poor';
                }
                
                jitterEl.classList.add(colorClass);
            }
        }
        
        
        // Legacy throughput support (for backward compatibility)
        if (metrics.throughput !== undefined && metrics.downloadThroughput === undefined) {
            const downloadEl = card.querySelector('.metric-download .metric-value');
            const downloadProgressEl = card.querySelector('.metric-download .metric-progress-fill.download');
            if (downloadEl) {
                const bps = metrics.throughput;
                let displayValue, unit, mbpsForProgress;
                
                if (bps >= 1000000) {
                    // >= 1 Mbps: show in Mbps
                    displayValue = (bps / 1000000).toFixed(1);
                    unit = 'Mbps';
                    mbpsForProgress = parseFloat(displayValue);
                } else if (bps >= 1000) {
                    // >= 1 Kbps: show in Kbps
                    displayValue = (bps / 1000).toFixed(1);
                    unit = 'Kbps';
                    mbpsForProgress = parseFloat(displayValue) / 1000; // Convert Kbps to Mbps for progress bar
                } else {
                    // < 1 Kbps: show in bps
                    displayValue = Math.round(bps);
                    unit = 'bps';
                    mbpsForProgress = bps / 1000000; // Convert bps to Mbps for progress bar
                }
                
                downloadEl.textContent = `${displayValue} ${unit}`;
                
                // Update progress bar
                if (downloadProgressEl) {
                    const percentage = Math.min((mbpsForProgress / 100) * 100, 100);
                    downloadProgressEl.style.width = `${percentage}%`;
                } else {
                    console.warn(`⚠️ Legacy download progress element not found for ${userId}`);
                }
            }
        }
    }
    
    updateUserStatus(userId, status, message = '') {
        const card = document.getElementById(`room-${userId}`);
        if (!card) return;
        
        const statusEl = card.querySelector('.family-status');
        if (!statusEl) return;
        
        // Remove existing status classes
        statusEl.classList.remove('status-idle', 'status-active', 'status-good', 'status-warning', 'status-error');
        statusEl.classList.remove('excellent', 'good', 'fair', 'poor', 'warning', 'error');
        
        // Map status to enhanced classes
        let enhancedClass = status;
        switch (status) {
            case 'idle':
            case 'active':
            case 'good':
                enhancedClass = 'excellent';
                break;
            case 'warning':
                enhancedClass = 'poor';
                break;
            case 'error':
                enhancedClass = 'error';
                break;
        }
        
        // Add new status classes
        statusEl.classList.add(`status-${status}`, enhancedClass);
        
        // Update status icon
        const statusIcon = statusEl.querySelector('.status-icon');
        if (statusIcon) {
            statusIcon.textContent = this.getStatusIndicator(status);
        }
        
        // Update status text (look for direct text content or .status-text element)
        const statusText = statusEl.querySelector('.status-text');
        const finalMessage = message || this.getFamilyStatusMessage(userId, status);
        
        if (statusText) {
            statusText.textContent = finalMessage;
        } else {
            // Update the text content while preserving the icon
            const iconElement = statusEl.querySelector('.status-icon');
            if (iconElement) {
                statusEl.innerHTML = iconElement.outerHTML + finalMessage;
            } else {
                statusEl.textContent = finalMessage;
            }
        }
    }
    
    updateUserPerformanceStatus(userId, metrics) {
        const user = this.users[userId];
        if (!user) return;
        
        const { latency, jitter } = metrics;
        const thresholds = user.thresholds;
        
        // Determine performance status
        let status = 'good';
        let issues = [];
        
        if (latency > thresholds.latency) {
            status = 'warning';
            issues.push('High latency');
        }
        
        if (jitter > thresholds.jitter) {
            status = 'warning';
            issues.push('High jitter');
        }
        
        // Update status with performance info
        const message = issues.length > 0 ? issues.join(', ') : 'Performing well';
        this.updateUserStatus(userId, status, message);
    }
    
    updateUserSentiment(userId, sentimentData) {
        // Store the sentiment update for the separate timer to process
        this.pendingSentiments[userId] = sentimentData;
    }
    
    startSentimentTimer() {
        // Clear any existing timer
        this.stopSentimentTimer();
        
        // Start the sentiment update timer
        this.sentimentTimer = setInterval(() => {
            this.processPendingSentiments();
        }, this.sentimentUpdateInterval);
        
        console.log(`🕐 Started sentiment timer with ${this.sentimentUpdateInterval}ms interval`);
    }
    
    stopSentimentTimer() {
        if (this.sentimentTimer) {
            clearInterval(this.sentimentTimer);
            this.sentimentTimer = null;
            console.log('🛑 Stopped sentiment timer');
        }
    }
    
    processPendingSentiments() {
        for (const [userId, sentimentData] of Object.entries(this.pendingSentiments)) {
            this.updateSentimentContainer(userId, sentimentData);
        }
        // Clear processed sentiments
        this.pendingSentiments = {};
    }
    
    updateSentimentContainer(userId, sentimentData) {
        const container = document.getElementById(`${userId}Sentiment`);
        if (!container) {
            console.warn(`⚠️ Sentiment container not found for user ${userId}`);
            return;
        }
        
        const text = container.querySelector('.sentiment-text');
        
        if (!text) {
            console.warn(`⚠️ Sentiment text not found for user ${userId}`);
            return;
        }
        
        // Check if the message is actually different to avoid unnecessary updates
        if (text.textContent === `"${sentimentData.message}"`) {
            return;
        }
        
        // Smooth transition effect
        container.style.opacity = '0.5';
        
        setTimeout(() => {
            // Update the sentiment message
            text.textContent = `"${sentimentData.message}"`;
            
            // The CSS already handles the styling based on user-specific classes
            // No need to update bubble classes since we're using fixed user-specific styling
            
            // Fade back in
            container.style.opacity = '1';
        }, 250);
    }
    
    getStatusMessage(status) {
        const messages = {
            idle: 'Ready',
            active: 'Active',
            good: 'Performing well',
            warning: 'Performance issues',
            error: 'Connection problems'
        };
        
        return messages[status] || 'Unknown';
    }
    
    getFamilyStatusMessage(userId, status) {
        const user = this.users[userId];
        if (!user) return this.getStatusMessage(status);
        
        const familyMessages = {
            idle: {
                alex: 'Alex is ready to game',
                sarah: 'Sarah is ready for work',
                jake: 'Jake is ready to watch Netflix',
                computer: 'Computer is ready'
            },
            active: {
                alex: 'Alex is gaming',
                sarah: 'Sarah is in a meeting',
                jake: 'Jake is watching Netflix',
                computer: 'Computer is transferring files'
            },
            good: {
                alex: 'Gaming smoothly',
                sarah: 'Meeting going well',
                jake: 'Streaming perfectly',
                computer: 'Transfers running smoothly'
            },
            warning: {
                alex: 'Game lag detected',
                sarah: 'Meeting quality issues',
                jake: 'Stream buffering',
                computer: 'Slow transfers'
            },
            error: {
                alex: 'Gaming connection issues',
                sarah: 'Meeting connection problems',
                jake: 'Stream connection lost',
                computer: 'Transfer failures'
            }
        };
        
        return familyMessages[status]?.[userId] || this.getStatusMessage(status);
    }
    
    getStatusIndicator(status) {
        const indicators = {
            idle: '⚪',
            active: '🔵',
            good: '🟢',
            warning: '🟡',
            error: '🔴'
        };
        
        return indicators[status] || '⚪';
    }
    
    
    displayResults(results) {
        if (!this.elements.resultsContainer) return;
        
        console.log('🏠 Virtual Household Test - Using shared results system:', results);
        
        try {
            // Clean up any existing results first
            cleanupResults('householdResults');
            
            // Clear the results container completely to remove any static HTML
            this.elements.resultsContainer.innerHTML = '';
            console.log('🏠 Cleared householdResults container of static HTML');
            
            // Create Virtual Household adapter to transform results data
            const adapter = createVirtualHouseholdAdapter();
            const unifiedResults = adapter.transform(results);
            
            console.log('🏠 Transformed Virtual Household results:', unifiedResults);
            
            // Use shared results system for beautiful UI components
            // Pass the container ID string, not the DOM element
            displayUnifiedResults(unifiedResults, 'householdResults');
            
            // Initialize interactive features (tooltips, celebrations, sharing)
            initializeInteractiveFeatures('householdResults', unifiedResults, {
                enableCelebrations: true,
                enableTooltips: true,
                showShareButton: true,
                showExplanation: true
            });
            
            // Show results container
            this.elements.resultsContainer.style.display = 'block';
            
            // Scroll to results with smooth animation
            this.elements.resultsContainer.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
            
            console.log('✅ Virtual Household Test results displayed with shared system');
            
            // Submit telemetry data
            this.submitTelemetryData(results);
            
        } catch (error) {
            console.error('❌ Error displaying Virtual Household results with shared system:', error);
            console.error('❌ Error stack:', error.stack);
            console.error('❌ Falling back to legacy display');
            
            // Fallback to legacy display if shared system fails
            this.displayResultsLegacy(results);
        }
    }
    
    // Legacy results display as fallback
    displayResultsLegacy(results) {
        console.log('🏠 Using legacy results display:', results);
        
        // Show results container
        this.elements.resultsContainer.style.display = 'block';
        
        // Access the overall results object
        const overall = results.overall || {};
        
        // Update overall grade
        if (this.elements.overallGrade && overall.overallGrade) {
            this.elements.overallGrade.textContent = overall.overallGrade;
            this.elements.overallGrade.className = `grade grade-${overall.overallGrade.toLowerCase()}`;
        }
        
        // SIMPLIFIED: No fairness/stability metrics to display
        
        // Update recommendations
        if (results.recommendations) {
            this.displayRecommendations(results.recommendations);
        }
        
        // Scroll to results
        this.elements.resultsContainer.scrollIntoView({
            behavior: 'smooth',
            block: 'start'
        });
    }
    
    displayRecommendations(recommendations) {
        if (!this.elements.recommendations) return;
        
        // Clear existing recommendations
        this.elements.recommendations.innerHTML = '';
        
        // Add new recommendations
        recommendations.forEach(rec => {
            const li = document.createElement('li');
            li.className = `recommendation recommendation-${rec.type}`;
            
            const icon = document.createElement('span');
            icon.className = 'recommendation-icon';
            icon.textContent = this.getRecommendationIcon(rec.type);
            
            const text = document.createElement('span');
            text.className = 'recommendation-text';
            text.textContent = rec.description || rec.message || 'No description available';
            
            li.appendChild(icon);
            li.appendChild(text);
            this.elements.recommendations.appendChild(li);
        });
    }
    
    getRecommendationIcon(type) {
        const icons = {
            info: 'ℹ️',
            warning: '⚠️',
            error: '❌',
            success: '✅',
            tip: '💡'
        };
        
        return icons[type] || 'ℹ️';
    }
    
    convertGradeToPercent(grade) {
        // Convert letter grades to approximate percentages for display
        const gradeMap = {
            'A+': 98,
            'A': 95,
            'A-': 92,
            'B+': 88,
            'B': 85,
            'B-': 82,
            'C+': 78,
            'C': 75,
            'C-': 72,
            'D+': 68,
            'D': 65,
            'D-': 62,
            'F': 50
        };
        
        return gradeMap[grade] || 0;
    }
    
    initializeSparkline(userId) {
        const canvas = document.getElementById(`${userId}Sparkline`);
        if (!canvas) {
            console.warn(`⚠️ Sparkline canvas not found for user ${userId}`);
            return;
        }
        
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            console.warn(`⚠️ Could not get 2D context for sparkline ${userId}`);
            return;
        }
        
        // Use HTML-defined dimensions as fallback if getBoundingClientRect returns 0
        const rect = canvas.getBoundingClientRect();
        const canvasWidth = rect.width > 0 ? rect.width : 200; // Fallback to HTML width
        const canvasHeight = rect.height > 0 ? rect.height : 40; // Fallback to HTML height
        
        // Set canvas size with device pixel ratio for crisp rendering
        const dpr = window.devicePixelRatio || 1;
        canvas.width = canvasWidth * dpr;
        canvas.height = canvasHeight * dpr;
        ctx.scale(dpr, dpr);
        canvas.style.width = canvasWidth + 'px';
        canvas.style.height = canvasHeight + 'px';
        
        // Enable image smoothing for better quality
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        
        // Clear canvas completely - let CSS handle the background styling
        ctx.clearRect(0, 0, canvasWidth, canvasHeight);
        
        console.log(`✅ Initialized sparkline for ${userId} with dimensions ${canvasWidth}x${canvasHeight} (DPR: ${dpr})`);
    }
// Data smoothing functions for smooth animation system
    smoothValue(newValue, oldValue, factor = 0.3) {
        if (oldValue === undefined || oldValue === null) return newValue;
        return oldValue + factor * (newValue - oldValue);
    }

    addToHistory(userId, metric, value) {
        if (!this.dataHistory[userId] || !this.dataHistory[userId][metric]) return;
        
        const history = this.dataHistory[userId][metric];
        history.push(value);
        
        // Keep only the last maxHistory values
        if (history.length > this.dataHistory[userId].maxHistory) {
            history.shift();
        }
    }

    getSmoothedValue(userId, metric, newValue) {
        // Ensure smoothedMetrics exists for this user
        if (!this.smoothedMetrics[userId]) {
            this.smoothedMetrics[userId] = {
                downloadThroughput: 0,
                uploadThroughput: 0,
                latency: 0,
                jitter: 0
            };
        }
        
        // Add to history
        this.addToHistory(userId, metric, newValue);
        
        // Get current smoothed value
        const currentSmoothed = this.smoothedMetrics[userId][metric];
        
        // Apply exponential moving average
        const smoothed = this.smoothValue(newValue, currentSmoothed, 0.3);
        
        // Update smoothed metrics
        this.smoothedMetrics[userId][metric] = smoothed;
        
        return smoothed;
    }
// Apply CSS transitions for smooth visual changes
    applySmoothTransitions() {
        const style = document.createElement('style');
        style.textContent = `
            /* User-specific card colors and gradients */
            #room-alex {
                background: linear-gradient(135deg, #2D5A3D 0%, #4A7C59 100%);
                border: 1px solid rgba(74, 124, 89, 0.3);
                box-shadow: 0 4px 15px rgba(45, 90, 61, 0.2);
            }

            #room-sarah {
                background: linear-gradient(135deg, #2B4A6B 0%, #4A6B8A 100%);
                border: 1px solid rgba(74, 107, 138, 0.3);
                box-shadow: 0 4px 15px rgba(43, 74, 107, 0.2);
            }

            #room-jake {
                background: linear-gradient(135deg, #4A3B5C 0%, #6B5B7B 100%);
                border: 1px solid rgba(107, 91, 123, 0.3);
                box-shadow: 0 4px 15px rgba(74, 59, 92, 0.2);
            }

            #room-computer {
                background: linear-gradient(135deg, #5C4A3B 0%, #7B6B5B 100%);
                border: 1px solid rgba(123, 107, 91, 0.3);
                box-shadow: 0 4px 15px rgba(92, 74, 59, 0.2);
            }

            /* Enhanced card styling */
            .user-card {
                border-radius: 12px;
                transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                backdrop-filter: blur(10px);
            }

            .user-card:hover {
                transform: translateY(-2px);
                box-shadow: 0 8px 25px rgba(0, 0, 0, 0.15);
            }

            /* Text contrast adjustments for colored backgrounds */
            .user-card .user-name,
            .user-card .user-activity,
            .user-card .metric-label,
            .user-card .metric-value {
                color: rgba(255, 255, 255, 0.95);
                text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
            }

            /* Progress bar enhancements for colored cards */
            .metric-progress-bar {
                background: rgba(255, 255, 255, 0.2);
                border-radius: 4px;
            }

            .metric-progress-fill {
                background: rgba(255, 255, 255, 0.8);
                border-radius: 4px;
                box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
                transition: width 0.2s cubic-bezier(0.4, 0, 0.2, 1);
            }

            .metric-progress-fill.target-achieved {
                background: linear-gradient(90deg, #4CAF50, #8BC34A);
                box-shadow: 0 0 8px rgba(76, 175, 80, 0.3);
            }

            /* Status indicator enhancements */
            .family-status {
                background: rgba(255, 255, 255, 0.1);
                border: 1px solid rgba(255, 255, 255, 0.2);
                border-radius: 8px;
                backdrop-filter: blur(5px);
                transition: all 0.25s ease-in-out;
            }

            /* Sentiment container styling - positioned within cards below activity-info */
            .sentiment-container {
                text-align: center;
                margin: 8px 0 12px 0;
                padding: 6px 10px;
                background: rgba(255, 255, 255, 0.15);
                border: 1px solid rgba(255, 255, 255, 0.2);
                border-radius: 6px;
                backdrop-filter: blur(5px);
                transition: all 0.25s ease-in-out;
                position: relative;
                width: 100%;
                box-sizing: border-box;
            }

            .sentiment-text {
                font-style: italic;
                font-size: 13px;
                font-weight: 500;
                color: rgba(255, 255, 255, 0.95);
                text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
                line-height: 1.3;
                margin: 0;
                display: block;
            }

            /* Theme-specific sentiment styling - enhanced for within-card placement */
            #alexSentiment .sentiment-container {
                background: rgba(255, 255, 255, 0.2);
                border-color: rgba(127, 217, 159, 0.4);
                box-shadow: 0 2px 8px rgba(127, 217, 159, 0.15);
            }

            #sarahSentiment .sentiment-container {
                background: rgba(255, 255, 255, 0.2);
                border-color: rgba(127, 184, 217, 0.4);
                box-shadow: 0 2px 8px rgba(127, 184, 217, 0.15);
            }

            #jakeSentiment .sentiment-container {
                background: rgba(255, 255, 255, 0.2);
                border-color: rgba(184, 159, 217, 0.4);
                box-shadow: 0 2px 8px rgba(184, 159, 217, 0.15);
            }

            #computerSentiment .sentiment-container {
                background: rgba(255, 255, 255, 0.2);
                border-color: rgba(217, 184, 159, 0.4);
                box-shadow: 0 2px 8px rgba(217, 184, 159, 0.15);
            }

            /* Sparkline canvas styling with theme-specific backgrounds */
            #alexSparkline {
                border-radius: 4px;
                background: rgba(74, 124, 89, 0.2);
                border: 1px solid rgba(74, 124, 89, 0.3);
            }
            
            #sarahSparkline {
                border-radius: 4px;
                background: rgba(74, 107, 138, 0.2);
                border: 1px solid rgba(74, 107, 138, 0.3);
            }
            
            #jakeSparkline {
                border-radius: 4px;
                background: rgba(107, 91, 123, 0.2);
                border: 1px solid rgba(107, 91, 123, 0.3);
            }
            
            #computerSparkline {
                border-radius: 4px;
                background: rgba(123, 107, 91, 0.2);
                border: 1px solid rgba(123, 107, 91, 0.3);
            }

            .metric-value {
                transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            }
            
            .sentiment-container {
                transition: opacity 0.25s ease-in-out;
            }
            
            .ping-health {
                transition: all 0.2s ease-in-out;
            }
            
            .metric-target {
                font-size: 0.8em;
                color: rgba(255, 255, 255, 0.7);
                margin-top: 2px;
                text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
            }
            
            /* Smooth color transitions for metrics */
            .ping-excellent, .ping-good, .ping-fair, .ping-poor,
            .jitter-excellent, .jitter-good, .jitter-fair, .jitter-poor {
                transition: color 0.3s ease-in-out;
            }
            
            /* Real traffic indicators */
            .real-traffic-indicator {
                display: inline-block;
                width: 8px;
                height: 8px;
                border-radius: 50%;
                background: #4CAF50;
                margin-left: 5px;
                animation: pulse 2s infinite;
            }
            
            @keyframes pulse {
                0% { opacity: 1; }
                50% { opacity: 0.5; }
                100% { opacity: 1; }
            }
            
            /* Room labels for prototype-style theming */
            .room-label {
                position: absolute;
                top: 8px;
                right: 8px;
                background: rgba(255, 255, 255, 0.2);
                color: rgba(255, 255, 255, 0.8);
                padding: 4px 8px;
                border-radius: 12px;
                font-size: 10px;
                font-weight: 500;
                text-transform: uppercase;
                letter-spacing: 0.5px;
                backdrop-filter: blur(5px);
            }

            /* Desktop layout for users-grid - 4x1 horizontal layout */
            .users-grid {
                display: grid;
                grid-template-columns: repeat(4, 1fr);
                gap: 20px;
                padding: 20px;
                width: 100%;
                box-sizing: border-box;
            }

            /* Mobile responsiveness for colored cards */
            @media (max-width: 768px) {
                .users-grid {
                    display: flex;
                    flex-direction: row;
                    overflow-x: auto;
                    overflow-y: hidden;
                    gap: 16px;
                    padding: 0 20px 20px 40px; /* Increased right padding for last card */
                    scroll-snap-type: x mandatory;
                    -webkit-overflow-scrolling: touch; /* Smooth scrolling on iOS */
                    scrollbar-width: none; /* Firefox */
                    -ms-overflow-style: none; /* IE/Edge */
                    width: 100%;
                    box-sizing: border-box;
                }
                
                .users-grid::-webkit-scrollbar {
                    display: none; /* Chrome/Safari */
                }
                
                .user-card {
                    flex: 0 0 280px; /* Fixed width, no shrinking */
                    min-width: 280px;
                    scroll-snap-align: start;
                    padding: 12px;
                    min-height: auto;
                    display: flex;
                    flex-direction: column;
                }
                
                /* Ensure last card has extra space */
                .user-card:last-child {
                    margin-right: 20px;
                }
                
                /* Fix layout spacing for mobile cards */
                .user-metrics {
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                    margin-top: auto;
                }
                
                .metric {
                    margin-bottom: 6px;
                }
                
                .metric:last-child {
                    margin-bottom: 0;
                }
                
                .user-card:hover {
                    transform: none; /* Disable hover effects on mobile */
                }
                
                .user-header {
                    flex-direction: row;
                    align-items: center;
                    margin-bottom: 8px;
                }
                
                .user-name {
                    font-size: 16px;
                    font-weight: 600;
                }
                
                .user-activity {
                    font-size: 12px;
                    line-height: 1.2;
                }
                
                .metrics-grid {
                    grid-template-columns: 1fr 1fr;
                    gap: 8px;
                }
                
                .metric-item {
                    padding: 6px;
                    font-size: 11px;
                }
                
                .metric-value {
                    font-size: 14px;
                    font-weight: 500;
                }
                
                .metric-label {
                    font-size: 10px;
                }
                
                .status-message {
                    font-size: 11px;
                    line-height: 1.3;
                }
                
                .metric-target {
                    font-size: 0.7em;
                }
                
                /* Mobile sentiment styling - optimized for within-card placement */
                .sentiment-container {
                    margin: 6px 0 8px 0;
                    padding: 5px 8px;
                    width: 100%;
                    box-sizing: border-box;
                }
                
                .sentiment-text {
                    font-size: 11px;
                    line-height: 1.2;
                }
            }
            
            /* Adaptive Virtual Household Phase Indicators */
            .phase-indicator {
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                border-radius: 12px;
                padding: 16px;
                margin-bottom: 20px;
                color: white;
                box-shadow: 0 4px 15px rgba(102, 126, 234, 0.3);
                transition: all 0.3s ease;
            }
            
            .phase-indicator.phase-warmup {
                background: linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%);
            }
            
            .phase-indicator.phase-results {
                background: linear-gradient(135deg, #a8edea 0%, #fed6e3 100%);
            }
            
            .phase-indicator.phase-household {
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            }
            
            .phase-header {
                display: flex;
                align-items: center;
                margin-bottom: 12px;
            }
            
            .phase-icon {
                font-size: 24px;
                margin-right: 12px;
            }
            
            .phase-name {
                font-size: 18px;
                font-weight: 600;
            }
            
            .phase-progress {
                display: flex;
                flex-direction: column;
                gap: 8px;
            }
            
            .phase-progress-bar {
                background: rgba(255, 255, 255, 0.3);
                border-radius: 8px;
                height: 8px;
                overflow: hidden;
            }
            
            .phase-progress-fill {
                background: rgba(255, 255, 255, 0.9);
                height: 100%;
                border-radius: 8px;
                transition: width 0.3s ease;
            }
            
            .phase-message {
                font-size: 14px;
                opacity: 0.9;
            }
            
            /* Warmup Results Display */
            .warmup-results {
                background: linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%);
                border-radius: 12px;
                padding: 20px;
                margin-bottom: 20px;
                color: white;
                text-align: center;
                box-shadow: 0 4px 15px rgba(255, 154, 158, 0.3);
                animation: slideIn 0.5s ease;
            }
            
            @keyframes slideIn {
                from {
                    opacity: 0;
                    transform: translateY(-20px);
                }
                to {
                    opacity: 1;
                    transform: translateY(0);
                }
            }
            
            .warmup-results-header h3 {
                margin: 0 0 16px 0;
                font-size: 20px;
                font-weight: 600;
            }
            
            .speed-measurement {
                display: flex;
                align-items: baseline;
                justify-content: center;
                gap: 8px;
                margin-bottom: 12px;
            }
            
            .speed-value {
                font-size: 48px;
                font-weight: 700;
                line-height: 1;
            }
            
            .speed-unit {
                font-size: 24px;
                font-weight: 500;
                opacity: 0.9;
            }
            
            .speed-details {
                font-size: 14px;
                opacity: 0.9;
            }
            
            .speed-details p {
                margin: 4px 0;
            }
        `;
        document.head.appendChild(style);
        console.log('✅ Applied smooth CSS transitions with adaptive household styling');
    }

    interpolateValue(startValue, endValue, progress) {
        return startValue + (endValue - startValue) * progress;
    }
    
    updateSparkline(userId, latency) {
        if (!this.sparklineData || !this.sparklineData[userId]) {
            console.warn(`⚠️ Sparkline data not initialized for user ${userId}`);
            return;
        }
        
        const canvas = document.getElementById(`${userId}Sparkline`);
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        
        // Add new data point
        this.sparklineData[userId].latency.push(latency);
        
        // Keep only the last maxPoints
        if (this.sparklineData[userId].latency.length > this.sparklineData[userId].maxPoints) {
            this.sparklineData[userId].latency.shift();
        }
        
        // Get actual canvas dimensions (accounting for device pixel ratio)
        const dpr = window.devicePixelRatio || 1;
        const displayWidth = canvas.width / dpr;
        const displayHeight = canvas.height / dpr;
        
        // Clear canvas completely (no background fill - let CSS handle it)
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        const data = this.sparklineData[userId].latency;
        if (data.length < 2) return;
        
        // Use fixed scale to prevent shifting (0-200ms range)
        const maxLatency = 200; // Fixed maximum for stable visualization
        const minLatency = 0;   // Fixed minimum
        const range = maxLatency - minLatency;
        
        // Get brighter theme colors for better visibility
        const themeColors = {
            alex: '#7FD99F',    // Bright green
            sarah: '#7FB8D9',   // Bright blue
            jake: '#B89FD9',    // Bright purple
            computer: '#D9B89F' // Bright brown
        };
        
        // Draw sparkline with enhanced visibility
        ctx.save();
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        
        ctx.beginPath();
        ctx.strokeStyle = themeColors[userId] || '#FFFFFF';
        ctx.lineWidth = 2.5; // Slightly thicker for better visibility
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        
        const stepX = displayWidth / (this.sparklineData[userId].maxPoints - 1);
        
        for (let i = 0; i < data.length; i++) {
            const x = i * stepX;
            const y = displayHeight - ((data[i] - minLatency) / range) * (displayHeight - 4) - 2;
            
            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }
        
        ctx.stroke();
        
        // Add gradient fill with brighter colors
        ctx.lineTo(data.length * stepX, displayHeight);
        ctx.lineTo(0, displayHeight);
        ctx.closePath();
        
        const gradient = ctx.createLinearGradient(0, 0, 0, displayHeight);
        const brightColor = themeColors[userId] || '#FFFFFF';
        gradient.addColorStop(0, brightColor + '60'); // 38% opacity
        gradient.addColorStop(1, brightColor + '20'); // 12% opacity
        
        ctx.fillStyle = gradient;
        ctx.fill();
        
        ctx.restore();
    }
    
    showError(error) {
        // Create error message
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-message';
        errorDiv.innerHTML = `
            <div class="error-icon">❌</div>
            <div class="error-text">
                <strong>Test Failed</strong><br>
                ${error.message || 'An unexpected error occurred'}
            </div>
            <button class="error-dismiss" onclick="this.parentElement.remove()">×</button>
        `;
        
        // Insert error at top of container
        if (this.elements.container) {
            this.elements.container.insertBefore(errorDiv, this.elements.container.firstChild);
        }
        
        // Auto-remove after 10 seconds
        setTimeout(() => {
            if (errorDiv.parentElement) {
                errorDiv.remove();
            }
        }, 10000);
    }
    
    reset() {
        console.log('🔄 Resetting Virtual Household UI');
        
        // Stop any running test
        if (this.testRunning) {
            this.stopTest();
        }
        
        // Reset progress
        this.updateProgress(0);
        
        // Reset user cards
        for (const userId of Object.keys(this.users)) {
            this.updateUserMetrics(userId, {
                downloadThroughput: 0,
                uploadThroughput: 0,
                latency: 0,
                jitter: 0,
                loss: 0
            });
            this.updateUserStatus(userId, 'idle', 'Ready');
        }
        
        // Hide results
        if (this.elements.resultsContainer) {
            this.elements.resultsContainer.style.display = 'none';
        }
        
        
        console.log('✅ Virtual Household UI reset');
    }
    
    // Export current state for debugging
    exportState() {
        return {
            isActive: this.isActive,
            testRunning: this.testRunning,
            startTime: this.startTime,
            users: this.users,
            elements: Object.keys(this.elements)
        };
    }
    
    // Cleanup
    destroy() {
        // Stop any running test
        if (this.testRunning) {
            this.stopTest();
        }
        
        // Stop all smooth animation timers
        this.stopSmoothUpdateTimers();
        
        // Clear legacy timer
        if (this.updateTimer) {
            clearInterval(this.updateTimer);
        }
        
        // Stop sentiment timer
        this.stopSentimentTimer();
        
        // Clean up shared results system
        try {
            cleanupResults();
            console.log('✅ Cleaned up shared results system on destroy');
        } catch (error) {
            console.warn('⚠️ Error cleaning up shared results on destroy:', error);
        }
        
        // Remove event listeners
        window.removeEventListener('latency-measurement', this.handleLatencyMeasurement);
        window.removeEventListener('traffic-update', this.handleTrafficUpdate);
        
        console.log('🗑️ Virtual Household UI destroyed');
    }
    
    // Methods expected by VirtualHousehold class
    updateStatus(message) {
        const statusEl = document.getElementById('householdStatus');
        if (statusEl) {
            statusEl.textContent = message;
        }
    }
    
    setTestRunning(running) {
        this.testRunning = running;
        
        if (this.elements.startButton) {
            this.elements.startButton.disabled = running;
            this.elements.startButton.textContent = running ? 'Test Running...' : 'Start Test';
        }
        
        // Stop button removed
    }
    
    setUserActive(userId, active) {
        const card = document.getElementById(`room-${userId}`);
        if (!card) return;
        
        if (active) {
            card.classList.add('active');
        } else {
            card.classList.remove('active');
        }
        
        console.log(`🏠 User ${userId} set to ${active ? 'active' : 'inactive'}`);
    }
    
    showResults(results) {
        console.log('🏠 Showing results:', results);
        this.displayResults(results);
    }
    
    submitTelemetryData(results) {
        try {
            // Extract key metrics from virtual household results
            const overall = results.overall || {};
            const users = results.users || {};
            
            // Calculate average metrics across all users
            let totalLatency = 0;
            let latencyCount = 0;
            let totalThroughput = 0;
            let throughputCount = 0;
            
            for (const [userId, userData] of Object.entries(users)) {
                if (userData.metrics && userData.metrics.length > 0) {
                    const avgMetrics = this.calculateAverageMetrics(userData.metrics);
                    if (avgMetrics.latency) {
                        totalLatency += avgMetrics.latency;
                        latencyCount++;
                    }
                    if (avgMetrics.downloadThroughput) {
                        totalThroughput += avgMetrics.downloadThroughput / 1000000; // Convert to Mbps
                        throughputCount++;
                    }
                }
            }
            
            const telemetryData = {
                testType: 'household',
                grades: {
                    // SIMPLIFIED: Only overall grade (based on Alex + Sarah average)
                    overall: overall.overallGrade || 'F',
                    alex: results.users?.alex?.grade || 'F',
                    sarah: results.users?.sarah?.grade || 'F'
                },
                baselineLatency: latencyCount > 0 ? Math.round(totalLatency / latencyCount) : 0,
                downloadThroughput: throughputCount > 0 ? Math.round((totalThroughput / throughputCount) * 10) / 10 : 0,
                uploadThroughput: 0, // Virtual household doesn't have a single upload metric
                testDuration: 30 // Virtual household test duration
            };
            
            telemetryManager.submitResults(telemetryData).then(result => {
                console.log('Virtual Household telemetry submission result:', result);
            }).catch(error => {
                console.error('Virtual Household telemetry submission error:', error);
            });
            
        } catch (error) {
            console.error('Error preparing virtual household telemetry data:', error);
        }
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
}

export default UIHousehold;
