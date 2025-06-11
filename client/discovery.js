/**
 * Server Discovery System
 * Finds the optimal test server for the client without token dependencies
 */

class ServerDiscovery {
    constructor() {
        this.currentServer = null;
        this.discoveryUrl = '/api/discover';
        this.isCentralServer = window.location.hostname === 'test.libreqos.com';
        this.isISPServer = !this.isCentralServer && window.location.hostname !== 'localhost' && !window.location.hostname.startsWith('127.');
        
        // If already on an ISP server, use it directly
        if (this.isISPServer) {
            this.currentServer = {
                id: window.location.hostname,
                name: `ISP Server (${window.location.hostname})`,
                url: window.location.origin,
                sponsor: { name: 'ISP Server', url: window.location.origin },
                location: { city: 'Direct Access', country: 'DIRECT' }
            };
        }
        
        // Fallback only for local development
        this.fallbackServer = this.isCentralServer ? null : {
            id: 'localhost',
            name: 'Local Development Server',
            url: window.location.origin,
            sponsor: { name: 'LibreQoS', url: 'https://libreqos.io' },
            location: { city: 'Local', country: 'LOCAL' }
        };
    }

    /**
     * Discover the optimal test server for this client
     * @returns {Promise<Object>} Server information
     */
    async discoverServer() {
        // If already on an ISP server, skip discovery
        if (this.isISPServer) {
            console.log(`🎯 Using current ISP server directly: ${this.currentServer.name}`);
            console.log(`📍 Location: ${this.currentServer.location.city}`);
            console.log(`🔗 URL: ${this.currentServer.url}`);
            
            this.updateServerInfoDisplay();
            return this.currentServer;
        }
        
        try {
            console.log('🔍 Discovering optimal test server...');
            
            const response = await fetch(this.discoveryUrl);
            
            if (!response.ok) {
                throw new Error(`Discovery failed: ${response.status}`);
            }
            
            const data = await response.json();
            
            if (data.success && data.server) {
                this.currentServer = data.server;
                console.log(`✅ Server discovered: ${this.currentServer.name} (${this.currentServer.id})`);
                console.log(`📍 Location: ${this.currentServer.location.city}, ${this.currentServer.location.country}`);
                console.log(`🔗 URL: ${this.currentServer.url}`);
                
                this.updateServerInfoDisplay();
                return this.currentServer;
            } else {
                throw new Error('Invalid discovery response');
            }
            
        } catch (error) {
            console.warn('⚠️ Server discovery failed:', error.message);
            
            if (this.isCentralServer) {
                // On central server, discovery failure is critical - no fallback to central server
                throw new Error('Server discovery is required on central server but failed. Cannot use central server for speed testing.');
            } else {
                // Local development can use fallback
                console.log('🔄 Using local development fallback server');
                this.currentServer = this.fallbackServer;
                return this.currentServer;
            }
        }
    }

    /**
     * Get the current selected server
     * @returns {Object|null} Current server info
     */
    getCurrentServer() {
        return this.currentServer;
    }

    /**
     * Get server URL for API requests
     * @returns {string} Server base URL
     */
    getServerUrl() {
        if (this.currentServer) {
            return this.currentServer.url;
        }
        
        if (this.isCentralServer) {
            throw new Error('No test server discovered. Central server cannot be used for speed testing.');
        }
        
        return this.fallbackServer?.url || window.location.origin;
    }

    /**
     * Make a request to the discovered server
     * @param {string} endpoint - API endpoint (e.g., '/download')
     * @param {Object} options - Fetch options
     * @returns {Promise<Response>} Fetch response
     */
    async makeRequest(endpoint, options = {}) {
        if (!this.currentServer) {
            await this.discoverServer();
        }

        const url = `${this.currentServer.url}${endpoint}`;
        console.log(`🌐 Making request to ${url}`);
        
        return fetch(url, options);
    }

    /**
     * Update the server info display in the UI
     */
    updateServerInfoDisplay() {
        if (!this.currentServer) return;

        const sponsorInfoElement = document.getElementById('sponsorInfo');
        
        if (sponsorInfoElement) {
            // Only show on central server (test.libreqos.com)
            if (this.isCentralServer) {
                const sponsorName = this.currentServer.sponsor?.name || this.currentServer.name;
                const sponsorUrl = this.currentServer.sponsor?.url;
                const city = this.currentServer.location?.city || 'Unknown';
                
                let sponsorText;
                if (sponsorUrl) {
                    // Create clickable sponsor link
                    sponsorText = `Sponsor: <a href="${sponsorUrl}" target="_blank" rel="noopener noreferrer">${sponsorName}</a> | ${city}`;
                } else {
                    // Fallback to plain text if no URL
                    sponsorText = `Sponsor: ${sponsorName} | ${city}`;
                }
                
                sponsorInfoElement.innerHTML = sponsorText;
                sponsorInfoElement.style.display = 'block';
                
                console.log(`📋 Server info displayed: ${sponsorName} | ${city}${sponsorUrl ? ` (${sponsorUrl})` : ''}`);
            } else {
                // Hide on ISP servers
                sponsorInfoElement.style.display = 'none';
            }
        }
    }

    /**
     * Get server status for UI display
     * @returns {Object} Server status information
     */
    getServerStatus() {
        if (!this.currentServer) {
            return {
                status: 'not_discovered',
                message: 'Server not yet discovered'
            };
        }

        return {
            status: 'connected',
            server: this.currentServer,
            message: `Connected to ${this.currentServer.name}`
        };
    }
}

// Create global instance
const serverDiscovery = new ServerDiscovery();

// Export for use in other modules
export { serverDiscovery };

// Make available globally for debugging
if (typeof window !== 'undefined') {
    window.serverDiscovery = serverDiscovery;
}