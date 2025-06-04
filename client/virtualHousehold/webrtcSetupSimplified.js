/**
 * Simplified WebRTC Setup - Direct Worker Communication
 * Eliminates traffic proxy complexity while maintaining all monitoring capabilities
 */

import LatencyTracker from './latencyTracker.js';

class WebRTCSetupSimplified {
    constructor() {
        this.peerConnection = null;
        this.dataChannels = new Map(); // userId -> RTCDataChannel
        this.workers = new Map(); // userId -> Worker
        this.isInitialized = false;
        this.connectionId = null;
        
        // Initialize enhanced logger
        if (window.EnhancedLogger) {
            this.logger = new window.EnhancedLogger('WebRTCSetup');
            this.logger.log('🔗 Simplified WebRTC Setup initialized with enhanced logging');
        } else {
            console.warn('⚠️ Enhanced Logger not available in WebRTC setup - using console logging');
            this.logger = console;
        }
        
        // Simple STUN configuration to fix SDP BUNDLE issues
        this.config = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
            ],
            iceTransportPolicy: 'all',
            bundlePolicy: 'balanced',
            rtcpMuxPolicy: 'require'
        };
        
        // Get server hostname/IP for direct connection hints
        this.serverHost = window.location.hostname;
        this.serverIP = null; // Will be resolved
        
        this.logger.log('🔗 Simplified WebRTC Setup initialized');
    }
    
    async resolveServerIP() {
        try {
            // Try to resolve server IP for direct connection hints
            this.logger.log(`🔍 Resolving server IP for ${this.serverHost}...`);
            
            // For direct connections, we can use the hostname as-is
            // The browser will resolve it to the appropriate IP
            this.serverIP = this.serverHost;
            
            this.logger.log(`✅ Server target resolved: ${this.serverIP}`);
            return this.serverIP;
        } catch (error) {
            this.logger.warn('⚠️ Could not resolve server IP, using hostname:', error);
            this.serverIP = this.serverHost;
            return this.serverIP;
        }
    }
    
    async testBasicIceGeneration() {
        this.logger.log('🔍 DIAGNOSTIC: Starting TURN server connectivity test...');
        
        // Simple test - just check if RTCPeerConnection works
        if (typeof RTCPeerConnection === 'undefined') {
            this.logger.error('❌ DIAGNOSTIC: RTCPeerConnection not available!');
            return;
        }
        
        this.logger.log('✅ DIAGNOSTIC: RTCPeerConnection is available');
        
        // Test with our TURN server configuration
        const testPc = new RTCPeerConnection(this.config);
        
        this.logger.log('✅ DIAGNOSTIC: Test peer connection created with TURN config');
        this.logger.log('🔧 DIAGNOSTIC: Using ICE servers:', this.config.iceServers);
        
        let candidatesGenerated = 0;
        let turnCandidatesGenerated = 0;
        let stunCandidatesGenerated = 0;
        let hostCandidatesGenerated = 0;
        
        testPc.onicecandidate = (event) => {
            if (event.candidate) {
                candidatesGenerated++;
                const candidate = event.candidate.candidate;
                
                if (candidate.includes('typ relay')) {
                    turnCandidatesGenerated++;
                    this.logger.log(`🔄 DIAGNOSTIC: TURN relay candidate ${turnCandidatesGenerated} generated!`);
                } else if (candidate.includes('typ srflx')) {
                    stunCandidatesGenerated++;
                    this.logger.log(`🌐 DIAGNOSTIC: STUN srflx candidate ${stunCandidatesGenerated} generated!`);
                } else if (candidate.includes('typ host')) {
                    hostCandidatesGenerated++;
                    this.logger.log(`🏠 DIAGNOSTIC: Host candidate ${hostCandidatesGenerated} generated`);
                }
                
                this.logger.log(`✅ DIAGNOSTIC: ICE candidate ${candidatesGenerated} - ${event.candidate.type}: ${candidate}`);
            } else {
                this.logger.log('🧊 DIAGNOSTIC: ICE gathering complete');
            }
        };
        
        testPc.onicegatheringstatechange = () => {
            this.logger.log(`🧊 DIAGNOSTIC: ICE gathering state: ${testPc.iceGatheringState}`);
        };
        
        const offer = await testPc.createOffer();
        await testPc.setLocalDescription(offer);
        
        this.logger.log('✅ DIAGNOSTIC: Offer created and local description set');
        this.logger.log('🔍 DIAGNOSTIC: ICE gathering state:', testPc.iceGatheringState);
        
        // Wait 5 seconds for ICE gathering
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        this.logger.log(`🔍 DIAGNOSTIC: Final results after 5 seconds:`);
        this.logger.log(`   Total candidates: ${candidatesGenerated}`);
        this.logger.log(`   Host candidates: ${hostCandidatesGenerated}`);
        this.logger.log(`   STUN candidates: ${stunCandidatesGenerated}`);
        this.logger.log(`   TURN candidates: ${turnCandidatesGenerated}`);
        this.logger.log(`   Final gathering state: ${testPc.iceGatheringState}`);
        
        if (turnCandidatesGenerated > 0) {
            this.logger.log('✅ DIAGNOSTIC: TURN server is working - relay candidates generated!');
        } else if (stunCandidatesGenerated > 0) {
            this.logger.log('⚠️ DIAGNOSTIC: STUN working but no TURN candidates - may indicate TURN server issue');
        } else if (hostCandidatesGenerated > 0) {
            this.logger.log('⚠️ DIAGNOSTIC: Only host candidates - STUN/TURN servers may be blocked');
        } else {
            this.logger.log('❌ DIAGNOSTIC: No ICE candidates generated - serious connectivity issue');
        }
        
        testPc.close();
    }
    
    async initialize() {
        console.log('🔍 DEBUG: WebRTC initialize() method called');
        
        if (this.isInitialized) {
            console.log('⚠️ DEBUG: WebRTC already initialized');
            this.logger.warn('⚠️ WebRTC already initialized');
            return;
        }
        
        // Clean up any existing peer connection to ensure fresh state
        if (this.peerConnection) {
            this.logger.log('🧹 Cleaning up existing peer connection before creating new one');
            this.peerConnection.close();
            this.peerConnection = null;
        }
        
        console.log('🚀 DEBUG: Starting WebRTC initialization');
        this.logger.log('🚀 Initializing simplified WebRTC connection');
        
        try {
            // Resolve server IP for direct connection hints
            await this.resolveServerIP();
            
            this.logger.log('🔧 WebRTC config being used:', JSON.stringify(this.config, null, 2));
            this.logger.log('🎯 Target server for direct connection:', this.serverIP);
            
            // Create peer connection
            this.logger.log('🔗 Creating RTCPeerConnection with config:', this.config);
            this.peerConnection = new RTCPeerConnection(this.config);
            this.logger.log('✅ RTCPeerConnection created successfully');
            this.logger.log('🔍 Initial signaling state:', this.peerConnection.signalingState);
            this.logger.log('🔍 Initial connection state:', this.peerConnection.connectionState);
            
            // Verify we start in the correct state
            if (this.peerConnection.signalingState !== 'stable') {
                this.logger.error('❌ Peer connection not in stable state after creation:', this.peerConnection.signalingState);
                throw new Error(`Peer connection created in wrong state: ${this.peerConnection.signalingState}`);
            }
            
            // Run diagnostic test to check TURN server connectivity
            this.logger.log('🔍 Running TURN server diagnostic test first...');
            await this.testBasicIceGeneration();
            this.logger.log('🔍 Diagnostic complete, proceeding with WebRTC initialization');
            
            // Set up connection event handlers
            console.log('🔍 DEBUG: About to setup connection handlers');
            this.logger.log('🔗 Setting up connection handlers');
            this.setupConnectionHandlers();
            console.log('🔍 DEBUG: Connection handlers set up');
            
            // Create offer
            console.log('🔍 DEBUG: About to create WebRTC offer');
            this.logger.log('📤 Creating WebRTC offer');
            const offer = await this.peerConnection.createOffer();
            console.log('🔍 DEBUG: WebRTC offer created successfully');
            this.logger.log('📤 Offer created successfully:', {
                type: offer.type,
                sdpLength: offer.sdp.length,
                sdpPreview: offer.sdp.substring(0, 200) + '...' // Log first 200 chars of SDP
            });
            
            this.logger.log('📤 Setting local description...');
            this.logger.log('🔍 Current signaling state before setLocalDescription:', this.peerConnection.signalingState);
            
            if (this.peerConnection.signalingState !== 'stable') {
                this.logger.warn('⚠️ Unexpected signaling state for setLocalDescription:', this.peerConnection.signalingState);
                this.logger.warn('⚠️ Expected: stable, Got:', this.peerConnection.signalingState);
            }
            
            await this.peerConnection.setLocalDescription(offer);
            this.logger.log('✅ Local description set successfully');
            this.logger.log('🔍 New signaling state after setLocalDescription:', this.peerConnection.signalingState);
            
            // Verify state transition occurred correctly
            if (this.peerConnection.signalingState !== 'have-local-offer') {
                this.logger.error('❌ setLocalDescription did not change state to have-local-offer!');
                this.logger.error('❌ Current state:', this.peerConnection.signalingState);
                this.logger.error('❌ Offer details:', {
                    type: offer.type,
                    sdpLength: offer.sdp.length,
                    sdpPreview: offer.sdp.substring(0, 100)
                });
                throw new Error(`setLocalDescription failed to change state. Current: ${this.peerConnection.signalingState}, Expected: have-local-offer`);
            }
            
            // Log ICE gathering state after setting local description
            this.logger.log('🧊 ICE gathering state after setLocalDescription:', this.peerConnection.iceGatheringState);
            
            // DIAGNOSTIC: Check if ICE gathering even starts
            this.logger.log('🔍 DIAGNOSTIC: Checking ICE gathering state immediately after setLocalDescription');
            this.logger.log('🔍 DIAGNOSTIC: iceGatheringState:', this.peerConnection.iceGatheringState);
            this.logger.log('🔍 DIAGNOSTIC: iceConnectionState:', this.peerConnection.iceConnectionState);
            this.logger.log('🔍 DIAGNOSTIC: connectionState:', this.peerConnection.connectionState);
            
            // Wait a moment to see if gathering state changes
            await new Promise(resolve => setTimeout(resolve, 1000));
            this.logger.log('🔍 DIAGNOSTIC: After 1 second wait:');
            this.logger.log('🔍 DIAGNOSTIC: iceGatheringState:', this.peerConnection.iceGatheringState);
            this.logger.log('🔍 DIAGNOSTIC: iceConnectionState:', this.peerConnection.iceConnectionState);
            this.logger.log('🔍 DIAGNOSTIC: connectionState:', this.peerConnection.connectionState);
            
            // BYPASS ICE CANDIDATE WAIT: Firefox appears to be blocking ICE generation
            // Proceed directly with offer/answer exchange - ICE will happen during connection
            this.logger.log('🧊 BYPASSING ICE candidate wait - proceeding with offer/answer exchange');
            this.logger.log('🧊 ICE candidates will be exchanged during connection establishment');
            
            // Send offer to server (now with ICE candidates included)
            this.logger.log('📤 Sending offer to server...');
            this.logger.log('🔍 Signaling state before server communication:', this.peerConnection.signalingState);
            
            const response = await this.sendOfferToServer(offer);
            
            this.logger.log('📥 Received server response:', {
                connection_id: response.connection_id,
                answer_type: response.answer?.type,
                answer_sdp_length: response.answer?.sdp?.length
            });
            this.logger.log('🔍 Signaling state after server communication:', this.peerConnection.signalingState);
            
            // Set remote description with state validation
            this.logger.log('📥 Setting remote description...');
            this.logger.log('🔍 Current signaling state before setRemoteDescription:', this.peerConnection.signalingState);
            this.logger.log('🔍 Current connection state before setRemoteDescription:', this.peerConnection.connectionState);
            this.logger.log('🔍 Current ICE connection state before setRemoteDescription:', this.peerConnection.iceConnectionState);
            this.logger.log('🔍 Current ICE gathering state before setRemoteDescription:', this.peerConnection.iceGatheringState);
            
            if (this.peerConnection.signalingState !== 'have-local-offer') {
                this.logger.error('❌ Invalid signaling state for setRemoteDescription:', this.peerConnection.signalingState);
                this.logger.error('❌ Expected: have-local-offer, Got:', this.peerConnection.signalingState);
                this.logger.error('❌ This suggests the state changed unexpectedly between setLocalDescription and setRemoteDescription');
                this.logger.error('❌ Possible causes: ICE events, connection events, or timing issues');
                
                // If we're in stable state, the connection may have been reset - try to recover
                if (this.peerConnection.signalingState === 'stable') {
                    this.logger.warn('⚠️ Signaling state reset to stable - attempting recovery by recreating offer');
                    
                    // Create a new offer since the state was reset
                    const newOffer = await this.peerConnection.createOffer();
                    await this.peerConnection.setLocalDescription(newOffer);
                    
                    this.logger.log('🔄 Recovery: New offer created and local description set');
                    this.logger.log('🔍 Recovery: New signaling state:', this.peerConnection.signalingState);
                    
                    // Send the new offer to server
                    const newResponse = await this.sendOfferToServer(newOffer);
                    this.connectionId = newResponse.connection_id;
                    
                    // Now try setting remote description again
                    const newAnswer = new RTCSessionDescription(newResponse.answer);
                    await this.peerConnection.setRemoteDescription(newAnswer);
                    
                    this.logger.log('✅ Recovery successful: Remote description set after state reset');
                } else {
                    throw new Error(`Cannot set remote description in state: ${this.peerConnection.signalingState}`);
                }
            } else {
                // Normal case: state is correct, set remote description
                const answer = new RTCSessionDescription(response.answer);
                await this.peerConnection.setRemoteDescription(answer);
            }
            this.logger.log('✅ Remote description set successfully');
            this.logger.log('🔍 New signaling state after setRemoteDescription:', this.peerConnection.signalingState);
            
            this.connectionId = response.connection_id;
            
            // Wait for connection to be established before marking as initialized
            this.logger.log('⏳ Waiting for WebRTC connection to be established...');
            await this.waitForConnectionEstablished();
            
            this.isInitialized = true;
            
            this.logger.log('✅ Direct WebRTC connection established with ID:', this.connectionId);
            this.logger.log('🔗 Connection is ready for data channels');
            
        } catch (error) {
            this.logger.error('❌ Failed to initialize WebRTC:', error);
            this.logger.error('❌ Error details:', {
                name: error.name,
                message: error.message,
                stack: error.stack
            });
            
            // Don't set peerConnection to null - keep it for debugging
            this.isInitialized = false;
            throw error;
        }
    }
    
    
    setupConnectionHandlers() {
        this.logger.log('🔧 Setting up WebRTC connection handlers...');
        
        // ICE candidate handling with enhanced logging and server IP prioritization
        this.peerConnection.onicecandidate = (event) => {
            try {
                this.logger.log('🧊 ICE candidate event triggered:', {
                    hasCandidate: !!event.candidate,
                    candidateType: event.candidate?.type,
                    candidateString: event.candidate?.candidate
                });
                
                if (event.candidate) {
                    const isServerCandidate = this.isServerCandidate(event.candidate);
                    
                    this.logger.log('🧊 ICE candidate generated:', {
                        candidate: event.candidate.candidate,
                        sdpMid: event.candidate.sdpMid,
                        sdpMLineIndex: event.candidate.sdpMLineIndex,
                        foundation: event.candidate.foundation,
                        component: event.candidate.component,
                        priority: event.candidate.priority,
                        protocol: event.candidate.protocol,
                        port: event.candidate.port,
                        type: event.candidate.type,
                        isServerCandidate: isServerCandidate
                    });
                    
                    // Log TURN server usage
                    if (event.candidate.candidate.includes('typ relay')) {
                        this.logger.log('🔄 TURN RELAY candidate generated - using TURN server!');
                    } else if (event.candidate.candidate.includes('typ srflx')) {
                        this.logger.log('🌐 STUN SRFLX candidate generated - using STUN server!');
                    } else if (event.candidate.candidate.includes('typ host')) {
                        this.logger.log('🏠 HOST candidate generated - direct connection possible');
                    }
                    
                    if (isServerCandidate) {
                        this.logger.log('🎯 PRIORITY: Found server candidate for direct connection!');
                    }
                    
                    // Send candidate to server (non-blocking)
                    this.sendIceCandidateToServer(event.candidate).catch(error => {
                        this.logger.warn('⚠️ Failed to send ICE candidate to server:', error.message);
                    });
                } else {
                    this.logger.log('🧊 ICE gathering complete (null candidate)');
                }
            } catch (error) {
                this.logger.error('❌ Error in ICE candidate handler:', error);
            }
        };
        
        // ICE gathering state monitoring
        this.peerConnection.onicegatheringstatechange = () => {
            this.logger.log(`🧊 ICE gathering state changed: ${this.peerConnection.iceGatheringState}`);
            
            if (this.peerConnection.iceGatheringState === 'gathering') {
                this.logger.log('🧊 ICE gathering started - candidates should be generated soon');
            } else if (this.peerConnection.iceGatheringState === 'complete') {
                this.logger.log('🧊 ICE gathering completed');
            }
        };
        
        // ICE connection state monitoring
        this.peerConnection.oniceconnectionstatechange = () => {
            this.logger.log(`🧊 ICE connection state changed: ${this.peerConnection.iceConnectionState}`);
            
            if (this.peerConnection.iceConnectionState === 'connected') {
                this.logger.log('✅ ICE connection established successfully');
            } else if (this.peerConnection.iceConnectionState === 'failed') {
                this.logger.error('❌ ICE connection failed');
            } else if (this.peerConnection.iceConnectionState === 'disconnected') {
                this.logger.warn('⚠️ ICE connection disconnected');
            }
        };
        
        // Connection state monitoring
        this.peerConnection.onconnectionstatechange = () => {
            this.logger.log(`🔗 Connection state changed: ${this.peerConnection.connectionState}`);
            
            // Log detailed connection info
            if (this.peerConnection.connectionState === 'connected') {
                this.logger.log('✅ WebRTC connection established successfully');
            } else if (this.peerConnection.connectionState === 'failed') {
                this.logger.error('❌ WebRTC connection failed');
            } else if (this.peerConnection.connectionState === 'connecting') {
                this.logger.log('🔗 WebRTC connection in progress...');
            }
        };
        
        this.logger.log('✅ WebRTC connection handlers set up successfully');
        
        // Data channel handling
        this.peerConnection.ondatachannel = (event) => {
            const channel = event.channel;
            this.logger.log(`📡 Received data channel: ${channel.label}`);
            
            // Handle server-created response channels
            if (channel.label.startsWith('server-to-')) {
                // Extract userId from server response channel name
                const userId = channel.label.replace('server-to-', '').replace('-downstream', '');
                this.logger.log(`📡 Server response channel for ${userId}: ${channel.label}`);
                
                // Store the response channel
                this.dataChannels.set(`${channel.label}`, channel);
                
                // Set up handlers for response channel
                this.setupResponseChannelHandlers(channel, userId);
            } else {
                // Set up channel handlers for client-created channels
                this.setupChannelHandlers(channel);
            }
        };
    }
    
    async createUserChannels(userIds) {
        this.logger.log('📡 Creating data channels for users:', userIds);
        
        // CRITICAL: Ensure connection is fully established before creating channels
        if (this.peerConnection.connectionState !== 'connected') {
            this.logger.log('⏳ Connection not yet established, waiting before creating channels...');
            await this.waitForConnectionEstablished();
        }
        
        const channelPromises = [];
        for (const userId of userIds) {
            channelPromises.push(this.createUserChannel(userId));
        }
        
        // Wait for all channels to be created
        await Promise.all(channelPromises);
        
        this.logger.log(`✅ Created ${this.dataChannels.size} data channels`);
        
        // Now wait for all channels to be in "open" state before proceeding
        this.logger.log('⏳ Waiting for all channels to reach "open" state...');
        await this.waitForAllChannelsOpen(userIds);
        this.logger.log('✅ All channels are now open and ready');
    }
    
    async createUserChannel(userId) {
        const channelName = `${userId}-upstream`;
        
        if (this.dataChannels.has(channelName)) {
            this.logger.warn(`⚠️ Channel for ${userId} already exists`);
            return this.dataChannels.get(channelName);
        }
        
        // Use server-expected naming convention: {userId}-upstream
        this.logger.log(`📡 Creating data channel for ${userId} as ${channelName}`);
        
        // Create bidirectional channel with proper naming
        const channelConfig = {
            ordered: false,
            maxRetransmits: 0
        };
        
        this.logger.log(`📡 Channel config for ${userId}:`, channelConfig);
        
        const channel = this.peerConnection.createDataChannel(channelName, channelConfig);
        
        // Force ArrayBuffer type to avoid Blob issues
        channel.binaryType = 'arraybuffer';
        
        this.logger.log(`📡 Channel created for ${userId}:`, {
            label: channel.label,
            id: channel.id,
            readyState: channel.readyState,
            binaryType: channel.binaryType,
            ordered: channel.ordered,
            maxRetransmits: channel.maxRetransmits
        });
        
        // Set up channel handlers
        this.setupChannelHandlers(channel);
        
        // Store channel with the actual channel name
        this.dataChannels.set(channelName, channel);
        
        return channel;
    }
    
    async waitForAllChannelsOpen(userIds, timeout = 30000) {
        this.logger.log('⏳ Waiting for all channels to open...');
        this.logger.log('🔒 STRICT MODE: Channels will only be considered ready when connection is "connected" AND all channels are "open"');
        
        const startTime = Date.now();
        const checkInterval = 200; // Check every 200ms
        
        while (Date.now() - startTime < timeout) {
            // First check: WebRTC connection must be "connected"
            const connectionState = this.peerConnection.connectionState;
            if (connectionState !== 'connected') {
                this.logger.log(`🔄 WebRTC connection not ready: ${connectionState} (waiting for "connected")`);
                await new Promise(resolve => setTimeout(resolve, checkInterval));
                continue;
            }
            
            // Second check: All channels must be "open"
            let allOpen = true;
            const channelStates = [];
            
            for (const userId of userIds) {
                const channelName = `${userId}-upstream`;
                const channel = this.dataChannels.get(channelName);
                
                if (!channel) {
                    allOpen = false;
                    channelStates.push(`${userId}: NO_CHANNEL`);
                } else if (channel.readyState !== 'open') {
                    allOpen = false;
                    channelStates.push(`${userId}: ${channel.readyState}`);
                } else {
                    channelStates.push(`${userId}: OPEN`);
                }
            }
            
            this.logger.log(`📊 Connection: ${connectionState}, Channel states: ${channelStates.join(', ')}`);
            
            if (allOpen) {
                this.logger.log('✅ WebRTC connection is "connected" AND all channels are "open" - ready for testing!');
                return true;
            }
            
            // Wait before next check
            await new Promise(resolve => setTimeout(resolve, checkInterval));
        }
        
        // Timeout reached
        const finalConnectionState = this.peerConnection.connectionState;
        this.logger.error(`❌ TIMEOUT: Failed to achieve ready state after ${timeout}ms`);
        this.logger.error(`❌ Final WebRTC connection state: ${finalConnectionState} (required: "connected")`);
        
        // Log final channel states for debugging
        for (const userId of userIds) {
            const channelName = `${userId}-upstream`;
            const channel = this.dataChannels.get(channelName);
            this.logger.error(`❌ Final channel state for ${userId}: ${channel ? channel.readyState : 'NO_CHANNEL'} (required: "open")`);
        }
        
        throw new Error(`WebRTC system failed to reach ready state within ${timeout}ms. Connection: ${finalConnectionState}, channels not all open.`);
    }
    
    async waitForConnectionEstablished(timeout = 30000) {
        this.logger.log('⏳ Waiting for WebRTC peer connection to reach "connected" state...');
        this.logger.log('🔒 STRICT MODE: Will only proceed when connectionState === "connected"');
        
        const startTime = Date.now();
        const checkInterval = 200; // Check every 200ms
        
        while (Date.now() - startTime < timeout) {
            const connectionState = this.peerConnection.connectionState;
            const iceConnectionState = this.peerConnection.iceConnectionState;
            const iceGatheringState = this.peerConnection.iceGatheringState;
            
            this.logger.log(`🔗 Connection state: ${connectionState}, ICE state: ${iceConnectionState}, ICE gathering: ${iceGatheringState}`);
            
            // STRICT CHECK: Only proceed when connectionState is exactly "connected"
            if (connectionState === 'connected') {
                this.logger.log('✅ WebRTC connection state is "connected" - proceeding with test!');
                this.logger.log(`✅ Final states: connection=${connectionState}, ice=${iceConnectionState}, gathering=${iceGatheringState}`);
                return true;
            }
            
            // Check for failure states
            if (connectionState === 'failed' || iceConnectionState === 'failed') {
                this.logger.error('❌ WebRTC connection failed');
                this.logger.error(`❌ Failed states: connection=${connectionState}, ice=${iceConnectionState}`);
                throw new Error('WebRTC connection failed');
            }
            
            // Log progress for other states
            if (connectionState === 'connecting') {
                this.logger.log('🔄 Connection in progress...');
            } else if (connectionState === 'new') {
                this.logger.log('🆕 Connection still initializing...');
            }
            
            // Wait before next check
            await new Promise(resolve => setTimeout(resolve, checkInterval));
        }
        
        // Timeout reached - connection never reached "connected" state
        const finalConnectionState = this.peerConnection.connectionState;
        const finalIceState = this.peerConnection.iceConnectionState;
        const finalGatheringState = this.peerConnection.iceGatheringState;
        
        this.logger.error(`❌ TIMEOUT: WebRTC connection never reached "connected" state after ${timeout}ms`);
        this.logger.error(`❌ Final connection state: ${finalConnectionState} (required: "connected")`);
        this.logger.error(`❌ Final ICE state: ${finalIceState}`);
        this.logger.error(`❌ Final ICE gathering state: ${finalGatheringState}`);
        
        throw new Error(`WebRTC connection failed to reach "connected" state within ${timeout}ms. Final state: ${finalConnectionState}`);
    }
    
    async waitForIceCandidates(timeout = 10000) {
        this.logger.log('🧊 Waiting for ICE candidates to be generated...');
        
        return new Promise((resolve, reject) => {
            const startTime = Date.now();
            let candidatesReceived = 0;
            let hostCandidatesReceived = 0;
            let gatheringComplete = false;
            
            const checkCandidates = () => {
                const elapsed = Date.now() - startTime;
                const gatheringState = this.peerConnection.iceGatheringState;
                
                this.logger.log(`🧊 ICE gathering: ${gatheringState}, candidates: ${candidatesReceived} (${hostCandidatesReceived} host), elapsed: ${elapsed}ms`);
                
                // Success conditions: we have at least one candidate OR gathering is complete
                if (candidatesReceived > 0 || gatheringState === 'complete' || gatheringComplete) {
                    this.logger.log(`✅ ICE candidates ready: ${candidatesReceived} total (${hostCandidatesReceived} host), state: ${gatheringState}`);
                    resolve();
                    return;
                }
                
                // Check timeout
                if (elapsed >= timeout) {
                    this.logger.error(`❌ ICE candidate timeout after ${timeout}ms - NO CANDIDATES GENERATED!`);
                    this.logger.error(`❌ This indicates a fundamental ICE generation problem`);
                    this.logger.error(`❌ Final gathering state: ${gatheringState}`);
                    this.logger.error(`❌ Possible causes: STUN servers unreachable, network blocked, or WebRTC disabled`);
                    reject(new Error(`ICE candidate generation failed - no candidates generated within ${timeout}ms`));
                    return;
                }
                
                // Continue waiting
                setTimeout(checkCandidates, 100);
            };
            
            // Add event listener for ICE candidates (don't override existing handler)
            const candidateListener = (event) => {
                if (event.candidate) {
                    candidatesReceived++;
                    
                    // Check if this is a host candidate (local network)
                    if (event.candidate.type === 'host') {
                        hostCandidatesReceived++;
                    }
                    
                    this.logger.log(`🧊 ICE candidate ${candidatesReceived} generated:`, {
                        type: event.candidate.type,
                        protocol: event.candidate.protocol,
                        address: event.candidate.address || 'N/A',
                        port: event.candidate.port,
                        priority: event.candidate.priority,
                        foundation: event.candidate.foundation,
                        candidate: event.candidate.candidate.substring(0, 100) + '...'
                    });
                } else {
                    this.logger.log('🧊 ICE gathering complete (null candidate received)');
                    gatheringComplete = true;
                }
            };
            
            // Add event listener instead of overriding
            this.peerConnection.addEventListener('icecandidate', candidateListener);
            
            // Clean up listener when done
            const cleanup = () => {
                this.peerConnection.removeEventListener('icecandidate', candidateListener);
            };
            
            // Override resolve and reject to include cleanup
            const originalResolve = resolve;
            const originalReject = reject;
            resolve = (...args) => {
                cleanup();
                originalResolve(...args);
            };
            reject = (...args) => {
                cleanup();
                originalReject(...args);
            };
            
            // Start checking immediately
            checkCandidates();
        });
    }
    
    isServerCandidate(candidate) {
        try {
            // Check if this candidate points to our server
            const candidateString = candidate.candidate;
            
            // Extract IP from candidate string (format: "candidate:... IP PORT ...")
            const parts = candidateString.split(' ');
            if (parts.length >= 5) {
                const candidateIP = parts[4]; // IP is typically at index 4
                
                // Check if this IP matches our server
                const isMatch = candidateIP === this.serverIP ||
                               candidateIP === this.serverHost ||
                               candidateString.includes(this.serverIP) ||
                               candidateString.includes(this.serverHost);
                
                if (isMatch) {
                    this.logger.log(`🎯 Server candidate detected: ${candidateIP} matches ${this.serverIP}`);
                    return true;
                }
            }
            
            return false;
        } catch (error) {
            this.logger.warn('⚠️ Error checking server candidate:', error);
            return false;
        }
    }
    
    setupChannelHandlers(channel) {
        // Extract userId from channel label (remove -upstream suffix)
        const userId = channel.label.replace('-upstream', '');
        
        channel.onopen = () => {
            this.logger.log(`✅ DIAGNOSTIC: Channel opened for ${userId} - ready for traffic`);
            this.logger.log(`✅ DIAGNOSTIC: Channel state: ${channel.readyState}, label: ${channel.label}`);
            console.log(`📡 Channel opened for ${userId} - ready for traffic`);
            
            // Notify worker that channel is ready
            const worker = this.workers.get(userId);
            if (worker) {
                this.logger.log(`📤 DIAGNOSTIC: Notifying worker ${userId} that channel is ready`);
                worker.postMessage({
                    type: 'channel-ready',
                    userId: userId
                });
            } else {
                this.logger.warn(`⚠️ DIAGNOSTIC: No worker found for ${userId} when channel opened`);
            }
        };
        
        channel.onmessage = (event) => {
            this.handleChannelMessage(userId, event.data);
        };
        
        channel.onerror = (error) => {
            this.logger.error(`❌ DIAGNOSTIC: Channel error for ${userId}:`, error);
            this.logger.error(`❌ DIAGNOSTIC: Channel state when error occurred: ${channel.readyState}`);
            console.error(`❌ Channel error for ${userId}:`, error);
        };
        
        channel.onclose = () => {
            this.logger.log(`📡 DIAGNOSTIC: Channel closed for ${userId}, final state: ${channel.readyState}`);
            console.log(`📡 Channel closed for ${userId}`);
        };
    }
    
    setupResponseChannelHandlers(channel, userId) {
        channel.onopen = () => {
            console.log(`📡 Server response channel opened for ${userId}: ${channel.label}`);
        };
        
        channel.onmessage = (event) => {
            // Forward server responses to the appropriate worker
            this.handleChannelMessage(userId, event.data);
        };
        
        channel.onerror = (error) => {
            console.error(`❌ Server response channel error for ${userId}:`, error);
        };
        
        channel.onclose = () => {
            console.log(`📡 Server response channel closed for ${userId}: ${channel.label}`);
        };
    }
    
    handleChannelMessage(userId, data) {
        // Forward message directly to worker
        const worker = this.workers.get(userId);
        if (worker) {
            // Handle both Blob and ArrayBuffer
            if (data instanceof Blob) {
                // Convert Blob to ArrayBuffer asynchronously
                data.arrayBuffer().then(arrayBuffer => {
                    worker.postMessage({
                        type: 'server-response',
                        data: arrayBuffer,
                        timestamp: performance.now()
                    });
                });
            } else {
                worker.postMessage({
                    type: 'server-response',
                    data: data,
                    timestamp: performance.now()
                });
            }
        } else {
            console.warn(`⚠️ No worker found for ${userId}`);
        }
    }
    
    registerWorker(userId, worker) {
        console.log(`📝 Registering worker for ${userId}`);
        
        this.workers.set(userId, worker);
        
        // Set up worker message handling
        worker.onmessage = (event) => {
            this.handleWorkerMessage(userId, event.data);
        };
        
        worker.onerror = (error) => {
            console.error(`❌ Worker error for ${userId}:`, error);
        };
        
        // If channel is already ready, notify worker
        const channelName = `${userId}-upstream`;
        const channel = this.dataChannels.get(channelName);
        if (channel && channel.readyState === 'open') {
            worker.postMessage({
                type: 'channel-ready',
                userId: userId
            });
        }
    }
    
    handleWorkerMessage(userId, message) {
        switch (message.type) {
            case 'send-data':
                this.sendDataToServer(userId, message.data);
                break;
                
            case 'traffic-update':
                // Forward traffic updates to main thread
                window.dispatchEvent(new CustomEvent('traffic-update', {
                    detail: {
                        userId: userId,
                        ...message.data
                    }
                }));
                break;
                
            case 'initialized':
                // Handle worker initialization
                console.log(`✅ Worker ${userId} initialized successfully`);
                window.dispatchEvent(new CustomEvent('worker-initialized', {
                    detail: {
                        userId: userId,
                        message: message
                    }
                }));
                break;
                
            default:
                // Forward other messages to main thread
                window.dispatchEvent(new CustomEvent('worker-message', {
                    detail: {
                        userId: userId,
                        message: message
                    }
                }));
                break;
        }
    }
    
    sendDataToServer(userId, data) {
        // Use the upstream channel name
        const channelName = `${userId}-upstream`;
        const channel = this.dataChannels.get(channelName);
        
        if (!channel || channel.readyState !== 'open') {
            this.logger.warn(`⚠️ DIAGNOSTIC: Cannot send data for ${userId}: channel not ready`);
            this.logger.warn(`⚠️ DIAGNOSTIC: Channel exists: ${!!channel}, state: ${channel?.readyState}, label: ${channel?.label}`);
            this.logger.warn(`⚠️ DIAGNOSTIC: Available channels: ${Array.from(this.dataChannels.keys()).join(', ')}`);
            console.warn(`⚠️ Cannot send data for ${userId}: channel not ready`);
            return false;
        }
        
        try {
            channel.send(data);
            this.logger.log(`✅ DIAGNOSTIC: Successfully sent data for ${userId}: ${data.byteLength || data.length} bytes`);
            return true;
        } catch (error) {
            this.logger.error(`❌ DIAGNOSTIC: Failed to send data for ${userId}:`, error);
            this.logger.error(`❌ DIAGNOSTIC: Channel state during send failure: ${channel.readyState}`);
            console.error(`❌ Failed to send data for ${userId}:`, error);
            return false;
        }
    }
    
    async sendOfferToServer(offer) {
        const response = await fetch('/webrtc/concurrent/offer', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                user_id: 'household',
                dscp_priority: 'AF41',
                offer: {
                    sdp: offer.sdp,
                    type: offer.type
                }
            })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        return await response.json();
    }
    
    async sendIceCandidateToServer(candidate) {
        // For direct connection, we still send host candidates to server
        if (!this.connectionId) {
            this.logger.warn('⚠️ No connection ID, skipping ICE candidate');
            return;
        }
        
        this.logger.log(`🧊 Sending ICE candidate to server:`, {
            candidate: candidate.candidate,
            type: candidate.type,
            connectionId: this.connectionId,
            sdpMid: candidate.sdpMid,
            sdpMLineIndex: candidate.sdpMLineIndex
        });
        
        try {
            const requestBody = {
                user_id: 'household',
                connection_id: this.connectionId,
                candidate: {
                    candidate: candidate.candidate,
                    sdpMid: candidate.sdpMid,
                    sdpMLineIndex: candidate.sdpMLineIndex
                }
            };
            
            this.logger.log('📤 ICE candidate request body:', requestBody);
            
            const response = await fetch('/webrtc/concurrent/ice-candidate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody)
            });
            
            const responseText = await response.text();
            this.logger.log(`📥 ICE candidate response: ${response.status} - ${responseText}`);
            
            if (response.ok) {
                this.logger.log('✅ ICE candidate sent successfully');
            } else {
                this.logger.warn(`⚠️ ICE candidate send failed: ${response.status} - ${responseText}`);
                // Don't throw error - continue with ICE process
            }
        } catch (error) {
            this.logger.warn('⚠️ Failed to send ICE candidate (continuing):', error.message);
            // Don't throw error - ICE process should continue
        }
    }
    
    // Get channels for latency tracker - provide compatibility mapping
    getChannelsForLatencyTracker() {
        // Create a compatibility map that maps userId to the actual channel
        const compatibilityMap = new Map();
        
        for (const [channelName, channel] of this.dataChannels) {
            if (channelName.endsWith('-upstream')) {
                // Extract userId from channel name
                const userId = channelName.replace('-upstream', '');
                compatibilityMap.set(userId, channel);
            } else {
                // Keep other channels as-is (like server response channels)
                compatibilityMap.set(channelName, channel);
            }
        }
        
        return compatibilityMap;
    }
    
    // Get setup info for compatibility
    getSetupInfo() {
        return {
            concurrent: true,
            simplified: true,
            channels: this.dataChannels.size,
            workers: this.workers.size
        };
    }
    
    async cleanup() {
        console.log('🧹 Cleaning up simplified WebRTC setup');
        
        // Close all data channels
        for (const [userId, channel] of this.dataChannels) {
            if (channel.readyState === 'open') {
                channel.close();
            }
        }
        this.dataChannels.clear();
        
        // Terminate all workers
        for (const [userId, worker] of this.workers) {
            worker.terminate();
        }
        this.workers.clear();
        
        // Close peer connection
        if (this.peerConnection) {
            this.peerConnection.close();
            this.peerConnection = null;
        }
        
        this.isInitialized = false;
        
        console.log('✅ Simplified WebRTC setup cleaned up');
    }
    
    // ICE monitoring methods removed - not needed for direct connection
}

export default WebRTCSetupSimplified;