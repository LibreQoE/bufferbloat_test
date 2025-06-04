/**
 * Concurrent WebRTC Setup for Virtual Household Mode
 * Uses server-side concurrent connection manager for fair resource allocation
 * Provides separate connections per virtual user to eliminate bottlenecks
 */

import WebRTCSetup from './webrtcSetup.js';

class WebRTCSetupConcurrent extends WebRTCSetup {
    constructor() {
        super();
        
        // Override for concurrent connections
        this.userConnections = new Map(); // userId -> { peerConnection, connectionId, channels }
        this.concurrentMode = true;
        this.userConfigs = {
            gamer: { dscp: 'EF', priority: 'high' },
            worker: { dscp: 'EF', priority: 'high' },
            streamer: { dscp: 'AF41', priority: 'medium' },
            downloader: { dscp: 'BE', priority: 'low' }
        };
    }
    
    async initialize() {
        console.log('🔗 Initializing Concurrent WebRTC for Virtual Household Mode');
        
        // Check security context
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
            // Initialize traffic system first
            await this.initializeTrafficSystem();
            
            this.isInitialized = true;
            console.log('✅ Concurrent WebRTC initialized successfully');
            
        } catch (error) {
            console.error('❌ Failed to initialize concurrent WebRTC:', error);
            throw error;
        }
    }
    
    async createUserConnections(userIds) {
        console.log('🔗 Creating separate WebRTC connections for users:', userIds);
        
        // Create all connections concurrently using Promise.allSettled
        const connectionPromises = userIds.map(async (userId) => {
            try {
                console.log(`🚀 Starting concurrent connection for ${userId}`);
                const connectionId = await this.createUserConnection(userId);
                console.log(`✅ Concurrent connection completed for ${userId}: ${connectionId}`);
                return { userId, connectionId, success: true };
            } catch (error) {
                console.error(`❌ Failed to create connection for ${userId}:`, error);
                return { userId, error: error.message, success: false };
            }
        });
        
        // Wait for all connections to complete (successful or failed)
        const results = await Promise.allSettled(connectionPromises);
        
        // Log results
        const successful = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
        const failed = results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.success)).length;
        
        console.log(`✅ Created ${successful} concurrent connections (${failed} failed)`);
        console.log(`📊 Total concurrent connections: ${this.userConnections.size}`);
        
        // Log any failures
        results.forEach(result => {
            if (result.status === 'fulfilled' && !result.value.success) {
                console.error(`❌ Connection failed for ${result.value.userId}: ${result.value.error}`);
            } else if (result.status === 'rejected') {
                console.error(`❌ Connection promise rejected:`, result.reason);
            }
        });
    }
    
    async createUserConnection(userId) {
        console.log(`🔗 Creating dedicated connection for ${userId}`);
        
        const userConfig = this.userConfigs[userId] || { dscp: 'BE', priority: 'low' };
        
        // Create dedicated peer connection for this user
        const peerConnection = new RTCPeerConnection({
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun.services.mozilla.com' }
            ],
            iceCandidatePoolSize: 0,
            iceTransportPolicy: 'all',
            bundlePolicy: 'balanced'
        });
        
        console.log(`🔗 Created dedicated peer connection for ${userId} with DSCP ${userConfig.dscp}`);
        
        // Store user connection data early so it's available for server response channel setup
        const userConnection = {
            peerConnection,
            connectionId: null, // Will be set after server connection
            channels: {
                upstream: null,
                downstream: null,
                serverResponse: null
            },
            config: userConfig
        };
        this.userConnections.set(userId, userConnection);
        
        // Set up event handlers for this connection
        this.setupUserConnectionHandlers(userId, peerConnection);
        
        // Create connection to server using concurrent endpoints
        const connectionId = await this.createServerConnection(userId, peerConnection, userConfig);
        
        // Update connection ID
        userConnection.connectionId = connectionId;
        
        // Create data channels for this user
        const channels = await this.createUserDataChannels(userId, peerConnection);
        
        // Update channels
        userConnection.channels.upstream = channels.upstream;
        userConnection.channels.downstream = channels.downstream;
        
        console.log(`✅ Created dedicated connection for ${userId}: ${connectionId}`);
        
        return connectionId;
    }
    
    setupUserConnectionHandlers(userId, peerConnection) {
        peerConnection.oniceconnectionstatechange = () => {
            console.log(`🧊 ICE connection state for ${userId}:`, peerConnection.iceConnectionState);
            
            window.dispatchEvent(new CustomEvent('webrtc-ice-state', {
                detail: {
                    userId,
                    state: peerConnection.iceConnectionState,
                    timestamp: performance.now()
                }
            }));
        };
        
        peerConnection.onconnectionstatechange = () => {
            console.log(`🔗 Connection state for ${userId}:`, peerConnection.connectionState);
            
            window.dispatchEvent(new CustomEvent('webrtc-connection-state', {
                detail: {
                    userId,
                    state: peerConnection.connectionState,
                    timestamp: performance.now()
                }
            }));
        };
        
        peerConnection.ondatachannel = (event) => {
            console.log(`📡 Received server data channel for ${userId}:`, event.channel.label);
            this.setupDataChannelHandlers(event.channel);
            
            // Store server-created response channels
            if (event.channel.label.startsWith('server-to-')) {
                console.log(`📡 Server response channel detected for ${userId}: ${event.channel.label}`);
                const userConnection = this.userConnections.get(userId);
                if (userConnection) {
                    userConnection.channels.serverResponse = event.channel;
                    
                    // Connect server response channel to traffic proxy for downstream traffic
                    if (this.trafficProxy) {
                        // For Netflix streaming, use 'netflix' as workerId instead of 'streamer'
                        const workerId = userId === 'streamer' ? 'netflix' : userId;
                        console.log(`🔗 Connecting server response channel ${event.channel.label} to traffic proxy for ${workerId} (user: ${userId})`);
                        this.trafficProxy.setupServerResponseChannel(workerId, event.channel);
                    } else {
                        console.warn(`⚠️ No traffic proxy available to connect server response channel for ${userId}`);
                    }
                } else {
                    console.warn(`⚠️ No user connection found for ${userId} when setting up server response channel`);
                }
            } else {
                console.log(`📡 Non-response channel for ${userId}: ${event.channel.label}`);
            }
        };
        
        // ICE candidate handler will be set up during connection creation
    }
    
    async createServerConnection(userId, peerConnection, userConfig) {
        console.log(`🔄 Creating server connection for ${userId} with priority ${userConfig.priority}`);
        
        const connectionId = `${userId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        // Set up ICE candidate handling
        const queuedCandidates = [];
        let serverConnectionEstablished = false;
        
        peerConnection.onicecandidate = async (event) => {
            if (event.candidate) {
                console.log(`🧊 ICE candidate for ${userId}:`, event.candidate.candidate);
                
                if (serverConnectionEstablished) {
                    await this.sendConcurrentIceCandidate(userId, connectionId, event.candidate);
                } else {
                    queuedCandidates.push(event.candidate);
                    console.log(`📦 Queued ICE candidate for ${userId}`);
                }
            } else {
                console.log(`🧊 ICE gathering complete for ${userId}`);
            }
        };
        
        // Create dummy channel to force ICE gathering
        const dummyChannel = peerConnection.createDataChannel(`${userId}-dummy`, {
            ordered: false
        });
        
        // Create offer
        const offer = await peerConnection.createOffer({
            offerToReceiveAudio: false,
            offerToReceiveVideo: false,
            iceRestart: false
        });
        
        await peerConnection.setLocalDescription(offer);
        console.log(`✅ Set local description for ${userId}`);
        
        // Wait for ICE candidates
        await this.waitForUserIceCandidates(userId, peerConnection);
        
        // Send offer to concurrent server endpoint
        const response = await fetch('/webrtc/concurrent/offer', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                user_id: userId,
                connection_id: connectionId,
                dscp_priority: userConfig.dscp,
                offer: {
                    sdp: offer.sdp,
                    type: offer.type
                }
            })
        });
        
        if (!response.ok) {
            throw new Error(`Server responded with ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        console.log(`📝 Received answer from server for ${userId}`);
        
        // Set remote description
        const answer = new RTCSessionDescription({
            sdp: data.answer.sdp,
            type: data.answer.type
        });
        
        await peerConnection.setRemoteDescription(answer);
        console.log(`✅ Set remote description for ${userId}`);
        
        // Mark connection as established
        serverConnectionEstablished = true;
        
        // Send queued ICE candidates
        if (queuedCandidates.length > 0) {
            console.log(`📤 Sending ${queuedCandidates.length} queued ICE candidates for ${userId}`);
            for (const candidate of queuedCandidates) {
                await this.sendConcurrentIceCandidate(userId, connectionId, candidate);
            }
        }
        
        // Wait for ICE connection
        await this.waitForUserIceConnection(userId, peerConnection);
        
        console.log(`✅ Server connection established for ${userId}: ${connectionId}`);
        return connectionId;
    }
    
    async sendConcurrentIceCandidate(userId, connectionId, candidate) {
        try {
            if (!candidate.candidate || candidate.candidate.trim() === '') {
                console.warn(`⚠️ Skipping empty ICE candidate for ${userId}`);
                return;
            }
            
            const response = await fetch('/webrtc/concurrent/ice-candidate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    user_id: userId,
                    connection_id: connectionId,
                    candidate: {
                        candidate: candidate.candidate,
                        sdpMid: candidate.sdpMid,
                        sdpMLineIndex: candidate.sdpMLineIndex
                    }
                })
            });
            
            if (!response.ok) {
                console.error(`❌ Failed to send ICE candidate for ${userId}:`, response.status);
            } else {
                console.log(`✅ ICE candidate sent for ${userId}`);
            }
        } catch (error) {
            console.error(`❌ Error sending ICE candidate for ${userId}:`, error);
        }
    }
    
    async waitForUserIceCandidates(userId, peerConnection) {
        console.log(`⏳ Waiting for ICE candidates for ${userId}...`);
        
        const maxWait = 5000; // Reduced from 10s to 5s
        
        return new Promise((resolve) => {
            const timeout = setTimeout(() => {
                console.warn(`⚠️ No ICE candidates for ${userId} within timeout, proceeding...`);
                resolve();
            }, maxWait);
            
            const originalHandler = peerConnection.onicecandidate;
            peerConnection.onicecandidate = (event) => {
                if (originalHandler) {
                    originalHandler(event);
                }
                
                if (event.candidate) {
                    console.log(`✅ First ICE candidate for ${userId}, proceeding...`);
                    clearTimeout(timeout);
                    resolve();
                    peerConnection.onicecandidate = originalHandler;
                }
            };
        });
    }
    
    async waitForUserIceConnection(userId, peerConnection) {
        console.log(`⏳ Waiting for ICE connection for ${userId}...`);
        
        const maxWait = 10000; // Reduced from 15s to 10s
        const checkInterval = 100;
        let waited = 0;
        
        while (waited < maxWait) {
            const iceState = peerConnection.iceConnectionState;
            
            if (iceState === 'connected' || iceState === 'completed') {
                console.log(`✅ ICE connection established for ${userId}`);
                return;
            }
            
            if (iceState === 'failed' || iceState === 'disconnected') {
                throw new Error(`ICE connection failed for ${userId}: ${iceState}`);
            }
            
            await new Promise(resolve => setTimeout(resolve, checkInterval));
            waited += checkInterval;
        }
        
        console.warn(`⚠️ ICE connection timeout for ${userId}`);
        throw new Error(`ICE connection timeout for ${userId}`);
    }
    
    async createUserDataChannels(userId, peerConnection) {
        console.log(`📡 Creating data channels for ${userId}`);
        
        // Optimize channel configuration based on user type
        const userConfig = this.userConfigs[userId] || { dscp: 'BE', priority: 'low' };
        let channelConfig = {
            ordered: false
        };
        
        // Special optimization for Netflix streaming (high-frequency data)
        if (userId === 'streamer') {
            channelConfig = {
                ordered: false,
                maxPacketLifeTime: 100, // 100ms max lifetime for streaming data
                protocol: 'netflix-streaming'
            };
            console.log(`📺 Optimized Netflix streaming channels for ${userId}`);
        } else if (userId === 'gamer') {
            channelConfig = {
                ordered: false,
                maxPacketLifeTime: 50, // 50ms max lifetime for gaming
                protocol: 'gaming-realtime'
            };
            console.log(`🎮 Optimized gaming channels for ${userId}`);
        } else {
            // For other users (worker, downloader), use maxRetransmits instead
            channelConfig.maxRetransmits = 0;
        }
        
        // Create upstream channel (client to server)
        const upstreamChannel = peerConnection.createDataChannel(`${userId}-upstream`, {
            ...channelConfig,
            protocol: `${channelConfig.protocol || 'household'}-upstream`
        });
        
        // Create downstream channel (server to client) - optimized for bulk data
        const downstreamChannel = peerConnection.createDataChannel(`${userId}-downstream`, {
            ...channelConfig,
            protocol: `${channelConfig.protocol || 'household'}-downstream`
        });
        
        // Set up handlers
        this.setupDataChannelHandlers(upstreamChannel);
        this.setupDataChannelHandlers(downstreamChannel);
        
        // Wait for channels to open
        await this.waitForUserChannelsToOpen(userId, [upstreamChannel, downstreamChannel]);
        
        const channels = {
            upstream: upstreamChannel,
            downstream: downstreamChannel,
            serverResponse: null // Will be set when server creates response channel
        };
        
        // Set up proxy channels if traffic proxy is available
        if (this.trafficProxy) {
            // For Netflix streaming, use 'netflix' as workerId instead of 'streamer'
            const workerId = userId === 'streamer' ? 'netflix' : userId;
            console.log(`🔗 Setting up traffic proxy channels for ${workerId} (user: ${userId})`);
            this.trafficProxy.setupChannels(workerId, upstreamChannel, downstreamChannel);
        }
        
        // Store in legacy maps for backward compatibility
        this.upstreamChannels.set(userId, upstreamChannel);
        this.downstreamChannels.set(userId, downstreamChannel);
        this.dataChannels.set(userId, upstreamChannel);
        
        console.log(`✅ Created data channels for ${userId}`);
        return channels;
    }
    
    async waitForUserChannelsToOpen(userId, channels) {
        console.log(`⏳ Waiting for channels to open for ${userId}...`);
        
        const maxWait = 10000; // Reduced from 15s to 10s
        const checkInterval = 200; // Reduced from 500ms to 200ms for faster checking
        let waited = 0;
        
        while (waited < maxWait) {
            const allOpen = channels.every(channel => channel.readyState === 'open');
            
            if (allOpen) {
                console.log(`✅ All channels open for ${userId}`);
                return;
            }
            
            if (waited % 2000 === 0) {
                console.log(`📊 Channel states for ${userId}:`,
                    channels.map(ch => ({ label: ch.label, state: ch.readyState }))
                );
            }
            
            await new Promise(resolve => setTimeout(resolve, checkInterval));
            waited += checkInterval;
        }
        
        console.warn(`⚠️ Channel timeout for ${userId}`);
        console.warn(`📊 Final channel states for ${userId}:`,
            channels.map(ch => ({ label: ch.label, state: ch.readyState }))
        );
    }
    
    // Override createUserChannels to use concurrent connections
    async createUserChannels(userIds) {
        console.log('📡 Creating concurrent user connections and channels:', userIds);
        
        // Create separate connections for each user
        await this.createUserConnections(userIds);
        
        console.log(`📊 Total concurrent connections created: ${this.userConnections.size}`);
    }
    
    // Override sendToUser to use the correct user connection
    sendToUser(userId, data) {
        const userConnection = this.userConnections.get(userId);
        if (!userConnection || !userConnection.channels.upstream) {
            console.warn(`⚠️ No connection found for user ${userId}`);
            return false;
        }
        
        const channel = userConnection.channels.upstream;
        if (channel.readyState !== 'open') {
            console.warn(`⚠️ Channel not open for user ${userId}: ${channel.readyState}`);
            return false;
        }
        
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
    
    // Override getChannelStats to use concurrent connections
    getChannelStats(userId) {
        const userConnection = this.userConnections.get(userId);
        if (!userConnection) return null;
        
        const channel = userConnection.channels.upstream;
        if (!channel) return null;
        
        return {
            label: channel.label,
            readyState: channel.readyState,
            bufferedAmount: channel.bufferedAmount,
            bufferedAmountLowThreshold: channel.bufferedAmountLowThreshold,
            maxPacketLifeTime: channel.maxPacketLifeTime,
            maxRetransmits: channel.maxRetransmits,
            ordered: channel.ordered,
            protocol: channel.protocol,
            connectionId: userConnection.connectionId,
            dscp: userConnection.config.dscp,
            priority: userConnection.config.priority
        };
    }
    
    // Override getAllChannelStats
    getAllChannelStats() {
        const stats = {};
        for (const userId of this.userConnections.keys()) {
            stats[userId] = this.getChannelStats(userId);
        }
        return stats;
    }
    
    // Override getConnectionStats to include all user connections
    async getConnectionStats() {
        const allStats = {
            concurrent: true,
            totalConnections: this.userConnections.size,
            users: {}
        };
        
        for (const [userId, userConnection] of this.userConnections) {
            try {
                const peerConnection = userConnection.peerConnection;
                const stats = await peerConnection.getStats();
                
                const userStats = {
                    connection: {
                        state: peerConnection.connectionState,
                        iceState: peerConnection.iceConnectionState,
                        signalingState: peerConnection.signalingState
                    },
                    channels: this.getChannelStats(userId),
                    ice: [],
                    transport: []
                };
                
                stats.forEach(report => {
                    if (report.type === 'candidate-pair' && report.state === 'succeeded') {
                        userStats.ice.push({
                            localCandidateType: report.localCandidateType,
                            remoteCandidateType: report.remoteCandidateType,
                            bytesReceived: report.bytesReceived,
                            bytesSent: report.bytesSent,
                            currentRoundTripTime: report.currentRoundTripTime
                        });
                    }
                    
                    if (report.type === 'transport') {
                        userStats.transport.push({
                            bytesReceived: report.bytesReceived,
                            bytesSent: report.bytesSent,
                            packetsReceived: report.packetsReceived,
                            packetsSent: report.packetsSent
                        });
                    }
                });
                
                allStats.users[userId] = userStats;
            } catch (error) {
                console.error(`❌ Failed to get stats for ${userId}:`, error);
                allStats.users[userId] = { error: error.message };
            }
        }
        
        return allStats;
    }
    
    // Override cleanup to handle concurrent connections
    async cleanup() {
        console.log('🧹 Cleaning up concurrent WebRTC connections');
        
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
            
            // Clean up each user connection
            for (const [userId, userConnection] of this.userConnections) {
                try {
                    console.log(`🧹 Cleaning up connection for ${userId}`);
                    
                    // Close channels
                    if (userConnection.channels.upstream && userConnection.channels.upstream.readyState === 'open') {
                        userConnection.channels.upstream.close();
                    }
                    if (userConnection.channels.downstream && userConnection.channels.downstream.readyState === 'open') {
                        userConnection.channels.downstream.close();
                    }
                    if (userConnection.channels.serverResponse && userConnection.channels.serverResponse.readyState === 'open') {
                        userConnection.channels.serverResponse.close();
                    }
                    
                    // Notify server of connection closure
                    if (userConnection.connectionId) {
                        try {
                            await fetch(`/webrtc/concurrent/user/${userId}`, {
                                method: 'DELETE'
                            });
                            console.log(`✅ Notified server of connection closure for ${userId}`);
                        } catch (error) {
                            console.warn(`⚠️ Failed to notify server of connection closure for ${userId}:`, error);
                        }
                    }
                    
                    // Close peer connection
                    if (userConnection.peerConnection) {
                        userConnection.peerConnection.close();
                    }
                    
                } catch (error) {
                    console.error(`❌ Error cleaning up connection for ${userId}:`, error);
                }
            }
            
            // Clear all maps
            this.userConnections.clear();
            this.upstreamChannels.clear();
            this.downstreamChannels.clear();
            this.dataChannels.clear();
            
            this.isInitialized = false;
            console.log('✅ Concurrent WebRTC cleanup complete');
            
        } catch (error) {
            console.error('❌ Error during concurrent WebRTC cleanup:', error);
        }
    }
    
    // Get concurrent connection statistics
    getConcurrentStats() {
        const stats = {
            totalConnections: this.userConnections.size,
            users: {},
            serverEndpoint: '/webrtc/concurrent'
        };
        
        for (const [userId, userConnection] of this.userConnections) {
            stats.users[userId] = {
                connectionId: userConnection.connectionId,
                connectionState: userConnection.peerConnection.connectionState,
                iceConnectionState: userConnection.peerConnection.iceConnectionState,
                dscp: userConnection.config.dscp,
                priority: userConnection.config.priority,
                channels: {
                    upstream: userConnection.channels.upstream?.readyState || 'none',
                    downstream: userConnection.channels.downstream?.readyState || 'none',
                    serverResponse: userConnection.channels.serverResponse?.readyState || 'none'
                }
            };
        }
        
        return stats;
    }
}

export default WebRTCSetupConcurrent;