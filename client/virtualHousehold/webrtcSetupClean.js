/**
 * Clean WebRTC Setup - Standard Implementation
 * Follows proper WebRTC flow without bypasses or complex workarounds
 */

class WebRTCSetupClean {
    constructor() {
        this.peerConnection = null;
        this.dataChannels = new Map(); // channelName -> RTCDataChannel
        this.workers = new Map(); // userId -> Worker
        this.connectionId = null;
        this.isInitialized = false;
        
        // Initialize logger
        if (window.EnhancedLogger) {
            this.logger = new window.EnhancedLogger('WebRTCClean');
        } else {
            this.logger = console;
        }
        
        // Simple, reliable configuration - only proven STUN servers
        this.config = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
            ],
            iceTransportPolicy: 'all',
            bundlePolicy: 'balanced',
            rtcpMuxPolicy: 'require'
        };
        
        this.logger.log('🔗 Clean WebRTC Setup initialized with simple STUN configuration');
    }
    
    async initialize() {
        this.logger.log('🚀 Starting clean WebRTC initialization');
        
        if (this.isInitialized) {
            this.logger.warn('⚠️ WebRTC already initialized');
            return;
        }
        
        try {
            // Step 1: Create peer connection with simple configuration
            this.logger.log('🔗 Creating RTCPeerConnection');
            this.peerConnection = new RTCPeerConnection(this.config);
            this.logger.log('✅ RTCPeerConnection created successfully');
            
            // Step 2: Set up event handlers BEFORE any operations
            this.logger.log('🔧 Setting up event handlers');
            this.setupEventHandlers();
            this.logger.log('✅ Event handlers configured');
            
            // Step 3: Create offer WITHOUT data channels first (fixes SDP BUNDLE issue)
            this.logger.log('📤 Creating WebRTC offer (no data channels yet)');
            const offer = await this.peerConnection.createOffer();
            this.logger.log('✅ Offer created successfully');
            
            // Step 4: Set local description (this starts ICE gathering)
            this.logger.log('📤 Setting local description');
            await this.peerConnection.setLocalDescription(offer);
            this.logger.log('✅ Local description set - ICE gathering started');
            
            // Step 5: Send offer to server and get answer
            this.logger.log('📤 Sending offer to server');
            const response = await this.sendOfferToServer(offer);
            this.connectionId = response.connection_id;
            this.logger.log('📥 Received server response with connection ID:', this.connectionId);
            
            // Step 6: Set remote description
            this.logger.log('📥 Setting remote description');
            const answer = new RTCSessionDescription(response.answer);
            await this.peerConnection.setRemoteDescription(answer);
            this.logger.log('✅ Remote description set - connection negotiation complete');
            
            // Step 7: Wait for connection to establish naturally
            this.logger.log('⏳ Waiting for WebRTC connection to establish');
            await this.waitForConnection();
            
            this.isInitialized = true;
            this.logger.log('✅ Clean WebRTC initialization complete');
            
        } catch (error) {
            this.logger.error('❌ WebRTC initialization failed:', error);
            this.isInitialized = false;
            throw error;
        }
    }
    
    setupEventHandlers() {
        // ICE candidate handling - standard approach
        this.peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                this.logger.log('🧊 ICE candidate generated:', {
                    type: event.candidate.type,
                    protocol: event.candidate.protocol,
                    address: event.candidate.address || 'N/A',
                    port: event.candidate.port
                });
                
                // Send candidate to server (non-blocking)
                this.sendIceCandidateToServer(event.candidate).catch(error => {
                    this.logger.warn('⚠️ Failed to send ICE candidate:', error.message);
                });
            } else {
                this.logger.log('🧊 ICE gathering complete');
            }
        };
        
        // ICE gathering state monitoring
        this.peerConnection.onicegatheringstatechange = () => {
            this.logger.log('🧊 ICE gathering state:', this.peerConnection.iceGatheringState);
        };
        
        // ICE connection state monitoring
        this.peerConnection.oniceconnectionstatechange = () => {
            this.logger.log('🧊 ICE connection state:', this.peerConnection.iceConnectionState);
        };
        
        // Connection state monitoring
        this.peerConnection.onconnectionstatechange = () => {
            this.logger.log('🔗 Connection state:', this.peerConnection.connectionState);
        };
        
        // Data channel handling
        this.peerConnection.ondatachannel = (event) => {
            const channel = event.channel;
            this.logger.log('📡 Received data channel:', channel.label);
            this.handleIncomingDataChannel(channel);
        };
        
        this.logger.log('✅ Event handlers set up successfully');
    }
    
    async waitForConnection(timeout = 30000) {
        this.logger.log('⏳ Waiting for WebRTC connection to reach "connected" state');
        
        return new Promise((resolve, reject) => {
            const startTime = Date.now();
            
            const checkConnection = () => {
                const elapsed = Date.now() - startTime;
                const connectionState = this.peerConnection.connectionState;
                const iceState = this.peerConnection.iceConnectionState;
                
                this.logger.log(`🔍 Connection check: ${connectionState}, ICE: ${iceState}, elapsed: ${elapsed}ms`);
                
                if (connectionState === 'connected') {
                    this.logger.log('✅ WebRTC connection established successfully');
                    resolve();
                } else if (connectionState === 'failed') {
                    this.logger.error('❌ WebRTC connection failed');
                    reject(new Error('WebRTC connection failed'));
                } else if (elapsed > timeout) {
                    this.logger.error(`❌ WebRTC connection timeout after ${timeout}ms`);
                    this.logger.error(`❌ Final states: connection=${connectionState}, ice=${iceState}`);
                    reject(new Error(`WebRTC connection timeout after ${timeout}ms. Final state: ${connectionState}`));
                } else {
                    // Continue waiting
                    setTimeout(checkConnection, 200);
                }
            };
            
            // Start checking immediately
            checkConnection();
        });
    }
    
    async createUserChannels(userIds) {
        this.logger.log('📡 Creating data channels for users:', userIds);
        
        // Ensure connection is established before creating channels
        if (this.peerConnection.connectionState !== 'connected') {
            this.logger.log('⏳ Waiting for connection to be established before creating channels');
            await this.waitForConnection();
        }
        
        // Create all channels
        const channelPromises = userIds.map(userId => this.createUserChannel(userId));
        await Promise.all(channelPromises);
        
        this.logger.log(`✅ Created ${this.dataChannels.size} data channels`);
        
        // Wait for all channels to open
        this.logger.log('⏳ Waiting for all channels to open');
        await this.waitForChannelsOpen(userIds);
        this.logger.log('✅ All channels are open and ready');
    }
    
    async createUserChannel(userId) {
        const channelName = `${userId}-upstream`;
        
        if (this.dataChannels.has(channelName)) {
            this.logger.warn(`⚠️ Channel for ${userId} already exists`);
            return this.dataChannels.get(channelName);
        }
        
        this.logger.log(`📡 Creating data channel: ${channelName}`);
        
        const channel = this.peerConnection.createDataChannel(channelName, {
            ordered: false,
            maxRetransmits: 0
        });
        
        channel.binaryType = 'arraybuffer';
        this.dataChannels.set(channelName, channel);
        
        // Set up channel handlers
        this.setupChannelHandlers(channel, userId);
        
        this.logger.log(`✅ Data channel created: ${channelName}`);
        return channel;
    }
    
    async waitForChannelsOpen(userIds, timeout = 30000) {
        this.logger.log('⏳ Waiting for all channels to open');
        
        const startTime = Date.now();
        
        while (Date.now() - startTime < timeout) {
            // Check if connection is ready
            if (this.peerConnection.connectionState !== 'connected') {
                this.logger.log('🔄 Waiting for connection to be established first');
                await new Promise(resolve => setTimeout(resolve, 200));
                continue;
            }
            
            // Check all channels
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
            
            this.logger.log(`📊 Channel states: ${channelStates.join(', ')}`);
            
            if (allOpen) {
                this.logger.log('✅ All channels are open');
                return true;
            }
            
            await new Promise(resolve => setTimeout(resolve, 200));
        }
        
        throw new Error(`Channels failed to open within ${timeout}ms`);
    }
    
    setupChannelHandlers(channel, userId) {
        channel.onopen = () => {
            this.logger.log(`✅ Channel opened: ${channel.label}`);
            
            // Notify worker that channel is ready
            const worker = this.workers.get(userId);
            if (worker) {
                worker.postMessage({
                    type: 'channel-ready',
                    userId: userId
                });
            }
        };
        
        channel.onmessage = (event) => {
            this.handleChannelMessage(userId, event.data);
        };
        
        channel.onerror = (error) => {
            this.logger.error(`❌ Channel error for ${userId}:`, error);
        };
        
        channel.onclose = () => {
            this.logger.log(`📡 Channel closed: ${channel.label}`);
        };
    }
    
    handleIncomingDataChannel(channel) {
        this.logger.log(`📡 Setting up incoming channel: ${channel.label}`);
        
        // Store the channel
        this.dataChannels.set(channel.label, channel);
        
        // Set up handlers for server-created channels
        channel.onopen = () => {
            this.logger.log(`✅ Incoming channel opened: ${channel.label}`);
        };
        
        channel.onmessage = (event) => {
            // Extract userId from channel label for server response channels
            let userId = channel.label;
            if (channel.label.startsWith('server-to-')) {
                userId = channel.label.replace('server-to-', '').replace('-downstream', '');
            }
            this.handleChannelMessage(userId, event.data);
        };
        
        channel.onerror = (error) => {
            this.logger.error(`❌ Incoming channel error for ${channel.label}:`, error);
        };
        
        channel.onclose = () => {
            this.logger.log(`📡 Incoming channel closed: ${channel.label}`);
        };
    }
    
    handleChannelMessage(userId, data) {
        // Forward message to worker
        const worker = this.workers.get(userId);
        if (worker) {
            if (data instanceof Blob) {
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
            this.logger.warn(`⚠️ No worker found for ${userId}`);
        }
    }
    
    registerWorker(userId, worker) {
        this.logger.log(`📝 Registering worker for ${userId}`);
        this.workers.set(userId, worker);
        
        // Set up worker message handling
        worker.onmessage = (event) => {
            this.handleWorkerMessage(userId, event.data);
        };
        
        worker.onerror = (error) => {
            this.logger.error(`❌ Worker error for ${userId}:`, error);
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
                window.dispatchEvent(new CustomEvent('traffic-update', {
                    detail: {
                        userId: userId,
                        ...message.data
                    }
                }));
                break;
                
            case 'initialized':
                this.logger.log(`✅ Worker ${userId} initialized`);
                window.dispatchEvent(new CustomEvent('worker-initialized', {
                    detail: {
                        userId: userId,
                        message: message
                    }
                }));
                break;
                
            default:
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
        const channelName = `${userId}-upstream`;
        const channel = this.dataChannels.get(channelName);
        
        if (!channel || channel.readyState !== 'open') {
            this.logger.warn(`⚠️ Cannot send data for ${userId}: channel not ready`);
            return false;
        }
        
        try {
            channel.send(data);
            return true;
        } catch (error) {
            this.logger.error(`❌ Failed to send data for ${userId}:`, error);
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
        if (!this.connectionId) {
            this.logger.warn('⚠️ No connection ID, skipping ICE candidate');
            return;
        }
        
        try {
            const response = await fetch('/webrtc/concurrent/ice-candidate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    user_id: 'household',
                    connection_id: this.connectionId,
                    candidate: {
                        candidate: candidate.candidate,
                        sdpMid: candidate.sdpMid,
                        sdpMLineIndex: candidate.sdpMLineIndex
                    }
                })
            });
            
            if (response.ok) {
                this.logger.log('✅ ICE candidate sent successfully');
            } else {
                this.logger.warn(`⚠️ ICE candidate send failed: ${response.status}`);
            }
        } catch (error) {
            this.logger.warn('⚠️ Failed to send ICE candidate:', error.message);
        }
    }
    
    // Compatibility methods for existing code
    getChannelsForLatencyTracker() {
        const compatibilityMap = new Map();
        
        for (const [channelName, channel] of this.dataChannels) {
            if (channelName.endsWith('-upstream')) {
                const userId = channelName.replace('-upstream', '');
                compatibilityMap.set(userId, channel);
            } else {
                compatibilityMap.set(channelName, channel);
            }
        }
        
        return compatibilityMap;
    }
    
    getSetupInfo() {
        return {
            clean: true,
            simplified: true,
            channels: this.dataChannels.size,
            workers: this.workers.size
        };
    }
    
    async cleanup() {
        this.logger.log('🧹 Cleaning up clean WebRTC setup');
        
        // Close all data channels
        for (const [channelName, channel] of this.dataChannels) {
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
        this.logger.log('✅ Clean WebRTC setup cleaned up');
    }
}

export default WebRTCSetupClean;