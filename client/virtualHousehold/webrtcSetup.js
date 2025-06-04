/**
 * WebRTC Setup for Virtual Household Mode
 * Manages peer-to-peer connections and data channels for realistic network simulation
 * Enhanced with bidirectional traffic support and proxy integration
 */

class WebRTCSetup {
    constructor() {
        this.peerConnection = null;
        this.dataChannels = new Map();
        this.upstreamChannels = new Map();
        this.downstreamChannels = new Map();
        this.serverResponseChannels = new Map();
        this.trafficProxy = null;
        this.trafficManager = null;
        this.isInitialized = false;
        this.localOffer = null;
        this.localAnswer = null;
        
        // No STUN servers needed for client-server connection to known server
        this.iceServers = [];
    }
    
    async initialize() {
        console.log('🔗 Initializing WebRTC for Virtual Household Mode');
        
        // Check if we're in a secure context
        const isSecureContext = window.isSecureContext;
        const protocol = window.location.protocol;
        const hostname = window.location.hostname;
        
        console.log('🔒 Security context check:', {
            isSecureContext,
            protocol,
            hostname,
            webrtcSupported: !!window.RTCPeerConnection
        });
        
        if (!isSecureContext && protocol !== 'https:' && hostname !== 'localhost') {
            console.warn('⚠️ WebRTC may be restricted in non-secure contexts');
        }
        
        try {
            // Force ICE candidate generation with aggressive configuration
            this.peerConnection = new RTCPeerConnection({
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' },
                    { urls: 'stun:stun.services.mozilla.com' }
                ],
                iceCandidatePoolSize: 0, // Disable pooling for immediate generation
                iceTransportPolicy: 'all',
                bundlePolicy: 'balanced'
            });
            
            console.log('🔗 Created peer connection with STUN servers to force ICE generation');
            console.log('🔗 Peer connection configuration:', {
                iceServers: '3 STUN servers',
                iceCandidatePoolSize: 0,
                iceTransportPolicy: 'all',
                bundlePolicy: 'balanced'
            });
            
            // Create a dummy data channel immediately to force ICE gathering
            const dummyChannel = this.peerConnection.createDataChannel('dummy', {
                ordered: false
            });
            console.log('🔧 Created dummy data channel to force ICE gathering');
            
            // Set up event handlers
            this.setupEventHandlers();
            
            // Create connection to server
            await this.createServerConnection();
            
            this.isInitialized = true;
            console.log('✅ WebRTC initialized successfully');
            
        } catch (error) {
            console.error('❌ Failed to initialize WebRTC:', error);
            throw error;
        }
    }
    
    /**
     * Initialize traffic proxy and manager for real traffic generation
     */
    async initializeTrafficSystem() {
        console.log('🔄 Initializing traffic proxy system');
        
        try {
            // Import modules dynamically to avoid circular dependencies
            const { default: TrafficProxy } = await import('./trafficProxy.js');
            const { default: TrafficManager } = await import('./trafficManager.js');
            
            // Create traffic manager
            this.trafficManager = new TrafficManager();
            
            // Create traffic proxy
            this.trafficProxy = new TrafficProxy(this);
            
            // Initialize proxy with traffic manager
            await this.trafficProxy.initialize(this.trafficManager);
            
            // Start traffic manager
            this.trafficManager.start();
            
            console.log('✅ Traffic proxy system initialized');
            
        } catch (error) {
            console.error('❌ Failed to initialize traffic system:', error);
            throw error;
        }
    }
    
    // Removed STUN connectivity test - not needed for client-server connections
    
    setupEventHandlers() {
        this.peerConnection.oniceconnectionstatechange = () => {
            console.log('🧊 ICE connection state:', this.peerConnection.iceConnectionState);
            
            // Dispatch event for connection state changes
            window.dispatchEvent(new CustomEvent('webrtc-ice-state', {
                detail: {
                    state: this.peerConnection.iceConnectionState,
                    timestamp: performance.now()
                }
            }));
        };
        
        this.peerConnection.onconnectionstatechange = () => {
            console.log('🔗 Connection state:', this.peerConnection.connectionState);
            
            // Dispatch event for connection state changes
            window.dispatchEvent(new CustomEvent('webrtc-connection-state', {
                detail: {
                    state: this.peerConnection.connectionState,
                    timestamp: performance.now()
                }
            }));
        };
        
        this.peerConnection.ondatachannel = (event) => {
            console.log('📡 Received server data channel:', event.channel.label);
            this.setupDataChannelHandlers(event.channel);
            
            // Store server-created channels for response handling
            if (event.channel.label.startsWith('server-to-')) {
                const userId = event.channel.label.replace('server-to-', '').replace('-downstream', '');
                console.log(`📡 Storing server response channel for ${userId}: ${event.channel.label}`);
                this.serverResponseChannels = this.serverResponseChannels || new Map();
                this.serverResponseChannels.set(userId, event.channel);
                
                // Connect server response channel to traffic proxy for downstream traffic
                if (this.trafficProxy) {
                    // For Netflix streaming, use 'netflix' as workerId instead of 'streamer'
                    const workerId = userId === 'streamer' ? 'netflix' : userId;
                    console.log(`🔗 Connecting server response channel to traffic proxy for ${workerId} (user: ${userId})`);
                    this.trafficProxy.setupServerResponseChannel(workerId, event.channel);
                }
            }
        };
        
        // Store original ICE candidate handler - will be overridden during loopback setup
        this.originalIceCandidateHandler = (event) => {
            if (event.candidate) {
                console.log('🧊 ICE candidate:', event.candidate.candidate);
            }
        };
        
        this.peerConnection.onicecandidate = this.originalIceCandidateHandler;
    }
    
    async createServerConnection() {
        console.log('🔄 Creating WebRTC connection to server');
        
        try {
            this.connectionId = `household_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            
            // Set up ICE candidate handling with detailed logging
            this.peerConnection.onicecandidate = async (event) => {
                console.log('🧊 ICE candidate event fired:', event);
                if (event.candidate) {
                    console.log('🧊 Local ICE candidate generated:', {
                        candidate: event.candidate.candidate,
                        type: event.candidate.type,
                        protocol: event.candidate.protocol,
                        address: event.candidate.address,
                        port: event.candidate.port,
                        foundation: event.candidate.foundation
                    });
                    
                    // Wait for server connection to be established before sending candidates
                    if (this.serverConnectionEstablished) {
                        await this.sendIceCandidate(event.candidate);
                    } else {
                        // Queue candidates until server connection is ready
                        if (!this.queuedCandidates) {
                            this.queuedCandidates = [];
                        }
                        this.queuedCandidates.push(event.candidate);
                        console.log('📦 Queued ICE candidate until server connection is ready');
                    }
                } else {
                    console.log('🧊 Local ICE gathering complete (null candidate)');
                }
            };
            
            // Set up ICE gathering state monitoring
            this.peerConnection.onicegatheringstatechange = () => {
                console.log('🧊 ICE gathering state:', this.peerConnection.iceGatheringState);
            };
            
            // Create offer with explicit options to force ICE gathering
            this.localOffer = await this.peerConnection.createOffer({
                offerToReceiveAudio: false,
                offerToReceiveVideo: false,
                iceRestart: false
            });
            console.log('📝 Created offer:', this.localOffer.type);
            await this.peerConnection.setLocalDescription(this.localOffer);
            console.log('✅ Set local description (offer)');
            console.log('🧊 ICE gathering state after setLocalDescription:', this.peerConnection.iceGatheringState);
            
            // Force ICE gathering to start immediately
            if (this.peerConnection.iceGatheringState === 'new') {
                console.log('🔥 Forcing ICE gathering to start...');
                // Trigger ICE gathering by accessing the local description again
                const desc = this.peerConnection.localDescription;
                console.log('🔥 Local description SDP length:', desc.sdp.length);
            }
            
            // Wait for ICE gathering to start and generate some candidates
            console.log('⏳ Waiting for ICE candidates to be generated...');
            await this.waitForIceCandidates();
            
            // Send offer to server and get answer
            const response = await fetch('/webrtc/offer', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    connection_id: this.connectionId,
                    offer: {
                        sdp: this.localOffer.sdp,
                        type: this.localOffer.type
                    }
                })
            });
            
            if (!response.ok) {
                throw new Error(`Server responded with ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            console.log('📝 Received answer from server');
            
            // Set remote description (server's answer)
            const answer = new RTCSessionDescription({
                sdp: data.answer.sdp,
                type: data.answer.type
            });
            
            await this.peerConnection.setRemoteDescription(answer);
            console.log('✅ Set remote description (answer)');
            console.log('🧊 ICE gathering state after setRemoteDescription:', this.peerConnection.iceGatheringState);
            
            // Mark server connection as established
            this.serverConnectionEstablished = true;
            console.log('✅ Server connection established, processing queued ICE candidates');
            
            // Send any queued ICE candidates
            if (this.queuedCandidates && this.queuedCandidates.length > 0) {
                console.log(`📤 Sending ${this.queuedCandidates.length} queued ICE candidates`);
                for (const candidate of this.queuedCandidates) {
                    await this.sendIceCandidate(candidate);
                }
                this.queuedCandidates = [];
            }
            
            // Start polling for server ICE candidates
            this.startServerCandidatePolling();
            
            // Wait for ICE connection to be established
            await this.waitForIceConnection();
            
            console.log('✅ WebRTC connection to server established');
            
        } catch (error) {
            console.error('❌ Failed to create server connection:', error);
            throw error;
        }
    }
    
    async sendIceCandidate(candidate) {
        try {
            // Validate candidate before sending
            if (!candidate.candidate || candidate.candidate.trim() === '') {
                console.warn('⚠️ Skipping empty ICE candidate');
                return;
            }
            
            console.log('📤 Sending ICE candidate to server:', {
                candidate: candidate.candidate,
                sdpMid: candidate.sdpMid,
                sdpMLineIndex: candidate.sdpMLineIndex
            });
            
            const response = await fetch('/webrtc/ice-candidate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    connection_id: this.connectionId,
                    candidate: {
                        candidate: candidate.candidate,
                        sdpMid: candidate.sdpMid,
                        sdpMLineIndex: candidate.sdpMLineIndex
                    }
                })
            });
            
            if (!response.ok) {
                const errorText = await response.text();
                console.error('❌ Failed to send ICE candidate:', response.status, response.statusText, errorText);
            } else {
                console.log('✅ ICE candidate sent successfully');
            }
        } catch (error) {
            console.error('❌ Error sending ICE candidate:', error);
        }
    }
    
    startServerCandidatePolling() {
        console.log('🔄 Starting server ICE candidate polling');
        this.candidatePollingInterval = setInterval(async () => {
            try {
                const response = await fetch(`/webrtc/candidates/${this.connectionId}`);
                if (response.ok) {
                    const data = await response.json();
                    if (data.candidates && data.candidates.length > 0) {
                        console.log(`🧊 Received ${data.candidates.length} server ICE candidates`);
                        for (const candidateData of data.candidates) {
                            const candidate = new RTCIceCandidate({
                                candidate: candidateData.candidate,
                                sdpMid: candidateData.sdpMid,
                                sdpMLineIndex: candidateData.sdpMLineIndex
                            });
                            await this.peerConnection.addIceCandidate(candidate);
                            console.log('🧊 Added server ICE candidate:', candidateData.candidate);
                        }
                    }
                }
            } catch (error) {
                console.error('❌ Error polling for server candidates:', error);
            }
        }, 500); // Poll every 500ms
    }
    
    stopServerCandidatePolling() {
        if (this.candidatePollingInterval) {
            clearInterval(this.candidatePollingInterval);
            this.candidatePollingInterval = null;
            console.log('🛑 Stopped server ICE candidate polling');
        }
    }
    
    async waitForIceCandidates() {
        console.log('⏳ Waiting for ICE candidates to be generated...');
        
        const maxWait = 10000; // Increased to 10 seconds
        const checkInterval = 100; // 100ms
        let waited = 0;
        
        // Use a promise-based approach to wait for the first candidate
        return new Promise((resolve) => {
            const timeout = setTimeout(() => {
                console.warn('⚠️ No ICE candidates generated within timeout, proceeding anyway...');
                resolve();
            }, maxWait);
            
            // Use the existing onicecandidate handler to detect first candidate
            const originalHandler = this.peerConnection.onicecandidate;
            this.peerConnection.onicecandidate = (event) => {
                // Call the original handler first
                if (originalHandler) {
                    originalHandler(event);
                }
                
                // If we got our first candidate, resolve immediately
                if (event.candidate) {
                    console.log('✅ First ICE candidate generated, proceeding...');
                    clearTimeout(timeout);
                    resolve();
                    // Restore original handler
                    this.peerConnection.onicecandidate = originalHandler;
                }
            };
            
            // Also check gathering state periodically
            const checkGathering = () => {
                const gatheringState = this.peerConnection.iceGatheringState;
                console.log(`🧊 ICE gathering state: ${gatheringState}`);
                
                if (gatheringState === 'gathering' || gatheringState === 'complete') {
                    console.log('✅ ICE gathering started/completed');
                    clearTimeout(timeout);
                    resolve();
                    return;
                }
                
                if (waited < maxWait) {
                    waited += checkInterval;
                    setTimeout(checkGathering, checkInterval);
                }
            };
            
            // Start checking immediately
            setTimeout(checkGathering, checkInterval);
        });
    }
    
    async waitForIceConnection() {
        console.log('⏳ Waiting for ICE connection to server...');
        
        const maxWait = 15000; // 15 seconds
        const checkInterval = 100; // 100ms
        let waited = 0;
        
        while (waited < maxWait) {
            const iceState = this.peerConnection.iceConnectionState;
            
            console.log(`🧊 ICE connection state: ${iceState}`);
            
            if (iceState === 'connected' || iceState === 'completed') {
                console.log('✅ ICE connection to server established successfully');
                return;
            }
            
            if (iceState === 'failed' || iceState === 'disconnected') {
                throw new Error(`ICE connection failed with state: ${iceState}`);
            }
            
            await new Promise(resolve => setTimeout(resolve, checkInterval));
            waited += checkInterval;
        }
        
        console.warn('⚠️ ICE connection to server did not establish within timeout');
        throw new Error('ICE connection timeout');
    }
    
    async createUserChannels(userIds) {
        console.log('📡 Creating bidirectional data channels for users:', userIds);
        console.log('🔗 Peer connection state:', this.peerConnection.connectionState);
        console.log('🧊 ICE connection state:', this.peerConnection.iceConnectionState);
        console.log('📡 Signaling state:', this.peerConnection.signalingState);
        
        // Ensure ICE connection is established before creating data channels
        const iceState = this.peerConnection.iceConnectionState;
        if (iceState !== 'connected' && iceState !== 'completed') {
            console.log('⏳ ICE connection not ready, waiting...');
            await this.waitForIceConnection();
        }
        
        // Traffic system should already be initialized by now
        if (!this.trafficProxy) {
            console.warn('⚠️ Traffic system not initialized - this should not happen');
            await this.initializeTrafficSystem();
        }
        
        for (const userId of userIds) {
            try {
                console.log(`🔧 Creating bidirectional channels for ${userId}...`);
                
                // Create upstream channel (client to server)
                const upstreamChannel = this.peerConnection.createDataChannel(`${userId}-upstream`, {
                    ordered: false, // UDP-like behavior for realistic simulation
                    maxRetransmits: 0, // No retransmissions for latency-sensitive traffic
                    protocol: 'household-upstream'
                });
                
                // Create downstream channel (server to client)
                const downstreamChannel = this.peerConnection.createDataChannel(`${userId}-downstream`, {
                    ordered: false, // UDP-like behavior for realistic simulation
                    maxRetransmits: 0, // No retransmissions for latency-sensitive traffic
                    protocol: 'household-downstream'
                });
                
                console.log(`📡 Bidirectional channels created for ${userId}`);
                
                // Set up handlers for both channels
                this.setupDataChannelHandlers(upstreamChannel);
                this.setupDataChannelHandlers(downstreamChannel);
                
                // Store channels
                this.upstreamChannels.set(userId, upstreamChannel);
                this.downstreamChannels.set(userId, downstreamChannel);
                this.dataChannels.set(userId, upstreamChannel); // Keep backward compatibility for sending
                
                // Set up proxy channels
                if (this.trafficProxy) {
                    // For Netflix streaming, use 'netflix' as workerId instead of 'streamer'
                    const workerId = userId === 'streamer' ? 'netflix' : userId;
                    console.log(`🔗 Setting up traffic proxy channels for ${workerId} (user: ${userId})`);
                    this.trafficProxy.setupChannels(workerId, upstreamChannel, downstreamChannel);
                }
                
                console.log(`✅ Created bidirectional channels for ${userId}`);
                
            } catch (error) {
                console.error(`❌ Failed to create channels for ${userId}:`, error);
                console.error('❌ Error details:', {
                    name: error.name,
                    message: error.message,
                    stack: error.stack
                });
            }
        }
        
        console.log(`📊 Total channel pairs created: ${this.upstreamChannels.size}`);
        
        // Wait for channels to open
        await this.waitForChannelsToOpen();
    }
    
    setupDataChannelHandlers(channel) {
        console.log(`🔧 Setting up handlers for channel: ${channel.label}`);
        
        channel.onopen = () => {
            console.log(`📡 Data channel opened: ${channel.label}`);
            this.applyDSCPConfiguration(channel);
        };
        
        channel.onclose = () => {
            console.log(`📡 Data channel closed: ${channel.label}`);
        };
        
        channel.onerror = (error) => {
            console.error(`❌ Data channel error for ${channel.label}:`, error);
            console.error('❌ Error event details:', {
                type: error.type,
                target: error.target,
                currentTarget: error.currentTarget
            });
        };
        
        channel.onmessage = (event) => {
            this.handleChannelMessage(channel.label, event.data);
        };
        
        console.log(`✅ Handlers set up for channel: ${channel.label}`);
    }
    
    
    applyDSCPConfiguration(channel) {
        // Apply DSCP marking where supported
        // This is browser/OS dependent and may not always work
        try {
            const userConfigs = {
                gamer: 'EF', // Expedited Forwarding
                worker: 'EF', // Expedited Forwarding  
                streamer: 'AF41', // Assured Forwarding 4.1
                downloader: 'BE' // Best Effort
            };
            
            const dscp = userConfigs[channel.label];
            if (dscp) {
                // Attempt to set DSCP via SDP manipulation
                // This is a best-effort approach as browser support varies
                console.log(`🏷️ Attempting to apply DSCP ${dscp} to ${channel.label}`);
                
                // Dispatch event for DSCP effectiveness tracking
                window.dispatchEvent(new CustomEvent('webrtc-data', {
                    detail: {
                        type: 'dscp-applied',
                        channel: channel.label,
                        dscp: dscp
                    }
                }));
            }
        } catch (error) {
            console.warn('⚠️ DSCP configuration not supported:', error);
        }
    }
    
    async waitForChannelsToOpen() {
        console.log('⏳ Waiting for bidirectional data channels to open...');
        
        const maxWait = 15000; // 15 seconds (increased from 10)
        const checkInterval = 500; // 500ms (increased for less spam)
        let waited = 0;
        
        while (waited < maxWait) {
            const upstreamStates = Array.from(this.upstreamChannels.entries()).map(([userId, channel]) => ({
                userId,
                direction: 'upstream',
                state: channel.readyState
            }));
            
            const downstreamStates = Array.from(this.downstreamChannels.entries()).map(([userId, channel]) => ({
                userId,
                direction: 'downstream',
                state: channel.readyState
            }));
            
            const allChannelStates = [...upstreamStates, ...downstreamStates];
            const allOpen = allChannelStates.every(ch => ch.state === 'open');
            
            // Log current states every 2 seconds
            if (waited % 2000 === 0) {
                console.log('📊 Bidirectional channel states:', {
                    upstream: upstreamStates,
                    downstream: downstreamStates
                });
                console.log('🧊 Current ICE state:', this.peerConnection.iceConnectionState);
                console.log('🔗 Current connection state:', this.peerConnection.connectionState);
            }
            
            if (allOpen) {
                console.log('✅ All bidirectional data channels are open');
                console.log('📊 Final channel states:', {
                    upstream: upstreamStates,
                    downstream: downstreamStates
                });
                return;
            }
            
            await new Promise(resolve => setTimeout(resolve, checkInterval));
            waited += checkInterval;
        }
        
        // Log final states on timeout
        const finalUpstreamStates = Array.from(this.upstreamChannels.entries()).map(([userId, channel]) => ({
            userId,
            direction: 'upstream',
            state: channel.readyState
        }));
        
        const finalDownstreamStates = Array.from(this.downstreamChannels.entries()).map(([userId, channel]) => ({
            userId,
            direction: 'downstream',
            state: channel.readyState
        }));
        
        console.warn('⚠️ Some bidirectional channels may not have opened within timeout');
        console.warn('📊 Final channel states:', {
            upstream: finalUpstreamStates,
            downstream: finalDownstreamStates
        });
        console.warn('🧊 Final ICE state:', this.peerConnection.iceConnectionState);
        console.warn('🔗 Final connection state:', this.peerConnection.connectionState);
    }
    
    /**
     * Register a worker with the traffic proxy for real traffic generation
     */
    registerWorker(workerId, worker) {
        if (this.trafficProxy) {
            this.trafficProxy.registerWorker(workerId, worker);
            console.log(`✅ Registered worker ${workerId} with traffic proxy`);
        } else {
            console.warn(`⚠️ Traffic proxy not initialized, cannot register worker ${workerId}`);
        }
    }
    
    /**
     * Get traffic proxy statistics
     */
    getTrafficStats() {
        if (this.trafficProxy) {
            return this.trafficProxy.getStats();
        }
        return null;
    }
    
    /**
     * Get traffic manager statistics
     */
    getTrafficManagerStats() {
        if (this.trafficManager) {
            return this.trafficManager.getStats();
        }
        return null;
    }
    
    handleChannelMessage(channelLabel, data) {
        try {
            // Extract userId from channel label
            let userId;
            if (channelLabel.startsWith('server-to-')) {
                // Server response channel: "server-to-gamer" -> "gamer"
                userId = channelLabel.replace('server-to-', '').replace('-downstream', '');
                console.log(`📨 Received server response on channel ${channelLabel} for user ${userId}`);
            } else {
                // Client channel: "gamer-upstream" -> "gamer"
                userId = channelLabel.split('-')[0];
                console.log(`📨 Received message on channel ${channelLabel} for user ${userId}`);
            }
            
            // Handle different types of messages
            if (data instanceof ArrayBuffer) {
                this.handleBinaryMessage(userId, data);
            } else if (typeof data === 'string') {
                // Only try to parse as JSON if it's actually a string
                this.handleTextMessage(userId, data);
            } else {
                // For any other data type, try to convert to ArrayBuffer
                console.log(`📨 Converting ${typeof data} to binary for ${userId}`);
                let buffer;
                if (data instanceof Blob) {
                    // Convert Blob to ArrayBuffer
                    data.arrayBuffer().then(arrayBuffer => {
                        this.handleBinaryMessage(userId, arrayBuffer);
                    });
                    return;
                } else if (data instanceof Uint8Array) {
                    buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
                } else {
                    console.warn(`❌ Unknown data type from ${userId}:`, typeof data);
                    return;
                }
                this.handleBinaryMessage(userId, buffer);
            }
        } catch (error) {
            console.error(`❌ Error handling message from channel ${channelLabel}:`, error);
        }
    }
    
    handleBinaryMessage(userId, data) {
        // Handle binary data (pong responses and server echoes)
        this.handleBinaryPong(userId, data);
    }
    
    handleTextMessage(userId, data) {
        try {
            const message = JSON.parse(data);
            
            // Handle different message types
            switch (message.type) {
                case 'metrics':
                    this.handleMetrics(userId, message);
                    break;
                default:
                    console.log(`📨 Unknown message from ${userId}:`, message);
            }
        } catch (error) {
            console.error(`❌ Error parsing message from ${userId}:`, error);
        }
    }
    
    handleBinaryPong(userId, data) {
        try {
            console.log(`📡 Received binary pong from ${userId}, size: ${data.byteLength} bytes`);
            
            if (data.byteLength === 24) {
                // 24-byte latency tracker pong: client_timestamp + ping_id_hash + server_timestamp
                const view = new DataView(data);
                const clientTimestamp = view.getFloat64(0, true); // little-endian
                const pingIdHash = view.getFloat64(8, true); // little-endian
                const serverTimestamp = view.getFloat64(16, true); // little-endian
                const now = performance.now();
                
                // Calculate RTT from client timestamp
                const rtt = now - clientTimestamp;
                
                console.log(`📡 Latency tracker pong from ${userId}: RTT=${rtt.toFixed(2)}ms, clientTs=${clientTimestamp.toFixed(2)}, serverTs=${serverTimestamp.toFixed(2)}`);
                
                // Dispatch RTT measurement event
                window.dispatchEvent(new CustomEvent('webrtc-rtt', {
                    detail: {
                        userId,
                        rtt,
                        timestamp: now,
                        serverTimestamp,
                        pingIdHash
                    }
                }));
                
                console.log(`📡 RTT to ${userId}: ${rtt.toFixed(2)}ms`);
                
            } else if (data.byteLength === 16) {
                // 16-byte pong: client_timestamp + server_timestamp
                const view = new DataView(data);
                const clientTimestamp = view.getFloat64(0, true); // little-endian
                const serverTimestamp = view.getFloat64(8, true); // little-endian
                const now = performance.now();
                
                // Calculate RTT from client timestamp
                const rtt = now - clientTimestamp;
                
                // Dispatch RTT measurement event
                window.dispatchEvent(new CustomEvent('webrtc-rtt', {
                    detail: {
                        userId,
                        rtt,
                        timestamp: now,
                        serverTimestamp
                    }
                }));
                
                console.log(`📡 RTT to ${userId}: ${rtt.toFixed(2)}ms`);
                
            } else if (data.byteLength === 8) {
                // 8-byte response: server timestamp echo
                const view = new DataView(data);
                const serverTimestamp = view.getFloat64(0, true);
                const now = performance.now();
                
                // This is a response to game data, not a ping
                console.log(`📡 Server response to ${userId}: ${(now - serverTimestamp).toFixed(2)}ms`);
            }
        } catch (error) {
            console.error(`❌ Error handling binary pong from ${userId}:`, error);
        }
    }
    
    handleMetrics(userId, message) {
        // Handle metrics from workers
        window.dispatchEvent(new CustomEvent('webrtc-metrics', {
            detail: {
                userId,
                metrics: message.metrics,
                timestamp: performance.now()
            }
        }));
    }
    
    sendToUser(userId, data) {
        const channel = this.dataChannels.get(userId);
        if (channel && channel.readyState === 'open') {
            try {
                if (typeof data === 'object' && !(data instanceof ArrayBuffer)) {
                    channel.send(JSON.stringify(data));
                } else {
                    channel.send(data);
                }
                return true;
            } catch (error) {
                console.error(`❌ Failed to send data to ${userId}:`, error);
                return false;
            }
        }
        return false;
    }
    
    sendPing(userId) {
        // Send binary ping timestamp for high-precision RTT measurement
        const buffer = new ArrayBuffer(8);
        const view = new DataView(buffer);
        view.setFloat64(0, performance.now(), true); // little-endian
        
        return this.sendToUser(userId, buffer);
    }
    
    sendBinaryTimestamp(userId) {
        // Alias for sendPing - both send 8-byte timestamp
        return this.sendPing(userId);
    }
    
    getChannelStats(userId) {
        const channel = this.dataChannels.get(userId);
        if (!channel) return null;
        
        return {
            label: channel.label,
            readyState: channel.readyState,
            bufferedAmount: channel.bufferedAmount,
            bufferedAmountLowThreshold: channel.bufferedAmountLowThreshold,
            maxPacketLifeTime: channel.maxPacketLifeTime,
            maxRetransmits: channel.maxRetransmits,
            ordered: channel.ordered,
            protocol: channel.protocol
        };
    }
    
    getAllChannelStats() {
        const stats = {};
        for (const userId of this.dataChannels.keys()) {
            stats[userId] = this.getChannelStats(userId);
        }
        return stats;
    }
    
    async getConnectionStats() {
        if (!this.peerConnection) return null;
        
        try {
            const stats = await this.peerConnection.getStats();
            const result = {
                connection: {
                    state: this.peerConnection.connectionState,
                    iceState: this.peerConnection.iceConnectionState,
                    signalingState: this.peerConnection.signalingState
                },
                channels: this.getAllChannelStats(),
                ice: [],
                transport: []
            };
            
            stats.forEach(report => {
                if (report.type === 'candidate-pair' && report.state === 'succeeded') {
                    result.ice.push({
                        localCandidateType: report.localCandidateType,
                        remoteCandidateType: report.remoteCandidateType,
                        bytesReceived: report.bytesReceived,
                        bytesSent: report.bytesSent,
                        currentRoundTripTime: report.currentRoundTripTime
                    });
                }
                
                if (report.type === 'transport') {
                    result.transport.push({
                        bytesReceived: report.bytesReceived,
                        bytesSent: report.bytesSent,
                        packetsReceived: report.packetsReceived,
                        packetsSent: report.packetsSent
                    });
                }
            });
            
            return result;
        } catch (error) {
            console.error('❌ Failed to get connection stats:', error);
            return null;
        }
    }
    
    async cleanup() {
        console.log('🧹 Cleaning up WebRTC connections and traffic system');
        
        try {
            // Stop traffic system
            if (this.trafficManager) {
                this.trafficManager.stop();
                this.trafficManager = null;
            }
            
            if (this.trafficProxy) {
                this.trafficProxy.stop();
                this.trafficProxy = null;
            }
            
            // Stop server candidate polling
            this.stopServerCandidatePolling();
            
            // Close all bidirectional data channels
            for (const [userId, channel] of this.upstreamChannels) {
                if (channel.readyState === 'open') {
                    channel.close();
                }
            }
            this.upstreamChannels.clear();
            
            for (const [userId, channel] of this.downstreamChannels) {
                if (channel.readyState === 'open') {
                    channel.close();
                }
            }
            this.downstreamChannels.clear();
            
            // Close legacy data channels
            for (const [userId, channel] of this.dataChannels) {
                if (channel.readyState === 'open') {
                    channel.close();
                }
            }
            this.dataChannels.clear();
            
            // Close server connection if we have a connection ID
            if (this.connectionId) {
                try {
                    await fetch(`/webrtc/connection/${this.connectionId}`, {
                        method: 'DELETE'
                    });
                    console.log('✅ Notified server of connection closure');
                } catch (error) {
                    console.warn('⚠️ Failed to notify server of connection closure:', error);
                }
                this.connectionId = null;
            }
            
            // Close peer connection
            if (this.peerConnection) {
                this.peerConnection.close();
                this.peerConnection = null;
            }
            
            this.isInitialized = false;
            console.log('✅ WebRTC and traffic system cleanup complete');
            
        } catch (error) {
            console.error('❌ Error during WebRTC cleanup:', error);
        }
    }
}

export default WebRTCSetup;
