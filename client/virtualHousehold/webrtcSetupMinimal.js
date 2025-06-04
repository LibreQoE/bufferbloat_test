/**
 * Minimal WebRTC Setup - Starting Fresh
 * Ultra-simple WebRTC client to establish basic connections
 */

class WebRTCSetupMinimal {
    constructor() {
        this.peerConnection = null;
        this.connectionId = null;
        this.isInitialized = false;
        
        // Add minimal STUN servers for connection establishment
        this.config = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' }
            ]
        };
        
        console.log('🔗 Minimal WebRTC Setup initialized with STUN server');
    }
    
    async initialize() {
        console.log('🚀 Starting minimal WebRTC initialization');
        
        if (this.isInitialized) {
            console.warn('⚠️ WebRTC already initialized');
            return;
        }
        
        try {
            // Create peer connection
            console.log('🔗 Creating RTCPeerConnection with config:', this.config);
            this.peerConnection = new RTCPeerConnection(this.config);
            
            // Set up debug handlers
            this.setupDebugHandlers();
            
            // Create offer
            console.log('📤 Creating WebRTC offer');
            const offer = await this.peerConnection.createOffer();
            
            console.log('📤 Offer created:', {
                type: offer.type,
                sdpLength: offer.sdp.length
            });
            
            // Set local description
            console.log('📤 Setting local description');
            await this.peerConnection.setLocalDescription(offer);
            
            console.log('✅ Local description set, signaling state:', this.peerConnection.signalingState);
            
            // Send offer to server
            console.log('📤 Sending offer to server');
            const response = await this.sendOfferToServer(offer);
            
            console.log('📥 Received server response:', {
                connection_id: response.connection_id,
                answer_type: response.answer?.type,
                answer_sdp_length: response.answer?.sdp?.length
            });
            
            // Set remote description
            console.log('📥 Setting remote description');
            const answer = new RTCSessionDescription(response.answer);
            await this.peerConnection.setRemoteDescription(answer);
            
            console.log('✅ Remote description set, signaling state:', this.peerConnection.signalingState);
            
            this.connectionId = response.connection_id;
            
            // Wait for connection
            console.log('⏳ Waiting for connection to establish');
            await this.waitForConnection();
            
            this.isInitialized = true;
            console.log('✅ Minimal WebRTC connection established!');
            
        } catch (error) {
            console.error('❌ Failed to initialize WebRTC:', error);
            throw error;
        }
    }
    
    setupDebugHandlers() {
        console.log('🔧 Setting up debug handlers');
        
        // ICE candidate handler
        this.peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                console.log('🧊 ICE candidate generated:', event.candidate.candidate);
                
                // Send to server
                this.sendIceCandidateToServer(event.candidate).catch(error => {
                    console.warn('⚠️ Failed to send ICE candidate:', error);
                });
            } else {
                console.log('🧊 ICE gathering complete');
            }
        };
        
        // ICE gathering state
        this.peerConnection.onicegatheringstatechange = () => {
            console.log('🧊 ICE gathering state:', this.peerConnection.iceGatheringState);
        };
        
        // ICE connection state
        this.peerConnection.oniceconnectionstatechange = () => {
            console.log('🧊 ICE connection state:', this.peerConnection.iceConnectionState);
        };
        
        // Connection state
        this.peerConnection.onconnectionstatechange = () => {
            console.log('🔗 Connection state:', this.peerConnection.connectionState);
        };
        
        // Signaling state
        this.peerConnection.onsignalingstatechange = () => {
            console.log('📡 Signaling state:', this.peerConnection.signalingState);
        };
        
        // Data channel handler (for future use)
        this.peerConnection.ondatachannel = (event) => {
            console.log('📡 Received data channel:', event.channel.label);
        };
        
        console.log('✅ Debug handlers set up');
    }
    
    async sendOfferToServer(offer) {
        const response = await fetch('/webrtc/concurrent/offer', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                user_id: 'minimal_test',
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
            console.warn('⚠️ No connection ID, skipping ICE candidate');
            return;
        }
        
        try {
            const response = await fetch('/webrtc/concurrent/ice-candidate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
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
            
            if (response.ok) {
                console.log('✅ ICE candidate sent successfully');
            } else {
                console.warn('⚠️ ICE candidate send failed:', response.status);
            }
        } catch (error) {
            console.warn('⚠️ Failed to send ICE candidate:', error);
        }
    }
    
    async waitForConnection(timeout = 30000) {
        console.log('⏳ Waiting for WebRTC connection to establish');
        
        const startTime = Date.now();
        
        while (Date.now() - startTime < timeout) {
            const connectionState = this.peerConnection.connectionState;
            const iceConnectionState = this.peerConnection.iceConnectionState;
            
            console.log(`🔗 States: connection=${connectionState}, ice=${iceConnectionState}`);
            
            if (connectionState === 'connected') {
                console.log('✅ WebRTC connection established!');
                return true;
            }
            
            if (connectionState === 'failed' || iceConnectionState === 'failed') {
                throw new Error('WebRTC connection failed');
            }
            
            // Wait before next check
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        
        throw new Error(`WebRTC connection timeout after ${timeout}ms`);
    }
    
    async cleanup() {
        console.log('🧹 Cleaning up minimal WebRTC setup');
        
        if (this.peerConnection) {
            this.peerConnection.close();
            this.peerConnection = null;
        }
        
        this.isInitialized = false;
        this.connectionId = null;
        
        console.log('✅ Minimal WebRTC setup cleaned up');
    }
    
    // Compatibility methods for Virtual Household Mode
    async createUserChannels(userIds) {
        console.log('📡 createUserChannels called with:', userIds);
        console.log('⚠️ Data channels not implemented in minimal version yet');
        // TODO: Implement data channels after basic connection works
    }
    
    getChannelsForLatencyTracker() {
        console.log('📊 getChannelsForLatencyTracker called');
        console.log('⚠️ Data channels not implemented in minimal version yet');
        return new Map(); // Empty map for now
    }
    
    getSetupInfo() {
        return {
            concurrent: false,
            simplified: false,
            minimal: true,
            channels: 0,
            workers: 0
        };
    }
    
    registerWorker(userId, worker) {
        console.log(`📝 registerWorker called for ${userId}`);
        console.log('⚠️ Workers not implemented in minimal version yet');
        // TODO: Implement workers after basic connection works
    }
    
    sendDataToServer(userId, data) {
        console.log(`📤 sendDataToServer called for ${userId}`);
        console.log('⚠️ Data channels not implemented in minimal version yet');
        return false;
    }
}

export default WebRTCSetupMinimal;