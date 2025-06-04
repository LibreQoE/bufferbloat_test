/**
 * Auto-Detecting WebRTC Setup for Virtual Household Mode
 * Automatically detects and uses concurrent WebRTC if available, falls back to regular WebRTC
 */

import WebRTCSetup from './webrtcSetup.js';
import WebRTCSetupConcurrent from './webrtcSetupConcurrent.js';

class WebRTCSetupAuto {
    constructor() {
        this.actualSetup = null;
        this.isConcurrent = false;
    }
    
    async initialize() {
        console.log('🔍 Auto-detecting WebRTC setup (concurrent vs regular)...');
        
        // First, try to detect if concurrent WebRTC is available
        const hasConcurrent = await this.detectConcurrentWebRTC();
        
        if (hasConcurrent) {
            console.log('✅ Concurrent WebRTC detected - using enhanced mode');
            this.actualSetup = new WebRTCSetupConcurrent();
            this.isConcurrent = true;
        } else {
            console.log('⚠️ Concurrent WebRTC not available - using regular mode');
            this.actualSetup = new WebRTCSetup();
            this.isConcurrent = false;
        }
        
        // Initialize the selected setup
        return await this.actualSetup.initialize();
    }
    
    async detectConcurrentWebRTC() {
        console.log('🔍 Checking for concurrent WebRTC availability...');
        
        try {
            // Try to access the concurrent health endpoint
            const response = await fetch('/webrtc/concurrent/health', {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                },
                signal: AbortSignal.timeout(3000) // 3 second timeout
            });
            
            if (response.ok) {
                const data = await response.json();
                console.log('✅ Concurrent WebRTC health check passed:', data);
                return data.concurrent_processing === true;
            } else {
                console.log('❌ Concurrent WebRTC health check failed:', response.status);
                return false;
            }
        } catch (error) {
            console.log('❌ Concurrent WebRTC not available:', error.message);
            return false;
        }
    }
    
    // Proxy all methods to the actual setup
    async initializeTrafficSystem() {
        if (!this.actualSetup) {
            console.warn('⚠️ initializeTrafficSystem called but actualSetup is null');
            return Promise.resolve();
        }
        return await this.actualSetup.initializeTrafficSystem();
    }
    
    async createUserChannels(userIds) {
        if (!this.actualSetup) {
            console.warn('⚠️ createUserChannels called but actualSetup is null');
            return Promise.resolve();
        }
        return await this.actualSetup.createUserChannels(userIds);
    }
    
    registerWorker(workerId, worker) {
        if (!this.actualSetup) {
            console.warn('⚠️ registerWorker called but actualSetup is null');
            return;
        }
        return this.actualSetup.registerWorker(workerId, worker);
    }
    
    getTrafficStats() {
        if (!this.actualSetup) {
            console.warn('⚠️ getTrafficStats called but actualSetup is null');
            return {};
        }
        return this.actualSetup.getTrafficStats();
    }
    
    getTrafficManagerStats() {
        if (!this.actualSetup) {
            console.warn('⚠️ getTrafficManagerStats called but actualSetup is null');
            return {};
        }
        return this.actualSetup.getTrafficManagerStats();
    }
    
    sendToUser(userId, data) {
        if (!this.actualSetup) {
            console.warn('⚠️ sendToUser called but actualSetup is null');
            return;
        }
        return this.actualSetup.sendToUser(userId, data);
    }
    
    sendPing(userId) {
        if (!this.actualSetup) {
            console.warn('⚠️ sendPing called but actualSetup is null');
            return;
        }
        return this.actualSetup.sendPing(userId);
    }
    
    sendBinaryTimestamp(userId) {
        if (!this.actualSetup) {
            console.warn('⚠️ sendBinaryTimestamp called but actualSetup is null');
            return;
        }
        return this.actualSetup.sendBinaryTimestamp(userId);
    }
    
    getChannelStats(userId) {
        if (!this.actualSetup) {
            console.warn('⚠️ getChannelStats called but actualSetup is null');
            return {};
        }
        return this.actualSetup.getChannelStats(userId);
    }
    
    getAllChannelStats() {
        if (!this.actualSetup) {
            console.warn('⚠️ getAllChannelStats called but actualSetup is null');
            return {};
        }
        return this.actualSetup.getAllChannelStats();
    }
    
    async getConnectionStats() {
        if (!this.actualSetup) {
            console.warn('⚠️ getConnectionStats called but actualSetup is null');
            return Promise.resolve({});
        }
        return await this.actualSetup.getConnectionStats();
    }
    
    async cleanup() {
        if (this.actualSetup) {
            return await this.actualSetup.cleanup();
        }
        console.log('⚠️ WebRTC cleanup called but actualSetup is null');
        return Promise.resolve();
    }
    
    // Getter proxies for properties
    get dataChannels() {
        return this.actualSetup ? this.actualSetup.dataChannels : null;
    }
    
    get upstreamChannels() {
        return this.actualSetup ? this.actualSetup.upstreamChannels : null;
    }
    
    get downstreamChannels() {
        return this.actualSetup ? this.actualSetup.downstreamChannels : null;
    }
    
    get serverResponseChannels() {
        return this.actualSetup ? this.actualSetup.serverResponseChannels : null;
    }
    
    get trafficProxy() {
        return this.actualSetup ? this.actualSetup.trafficProxy : null;
    }
    
    get trafficManager() {
        return this.actualSetup ? this.actualSetup.trafficManager : null;
    }
    
    get isInitialized() {
        return this.actualSetup ? this.actualSetup.isInitialized : false;
    }
    
    // Additional info methods
    getSetupInfo() {
        return {
            type: this.isConcurrent ? 'concurrent' : 'regular',
            concurrent: this.isConcurrent,
            setupClass: this.actualSetup ? this.actualSetup.constructor.name : 'none',
            features: {
                separateConnections: this.isConcurrent,
                priorityProcessing: this.isConcurrent,
                concurrentTasks: this.isConcurrent,
                fairResourceAllocation: this.isConcurrent
            }
        };
    }
    
    // Get concurrent-specific stats if available
    getConcurrentStats() {
        if (this.isConcurrent && this.actualSetup && this.actualSetup.getConcurrentStats) {
            return this.actualSetup.getConcurrentStats();
        }
        return null;
    }
}

export default WebRTCSetupAuto;