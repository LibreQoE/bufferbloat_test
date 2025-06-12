# ISP-Controlled Token Authentication Implementation Plan

## Overview

This document outlines the implementation of a unified token-based authentication system where ISP servers generate and validate their own access tokens. This design provides enhanced security for both direct access and central server routing while maintaining ISP autonomy.

## Architecture Summary

### Token Authority Model
- **ISP servers** generate and validate their own tokens
- **Central server** requests tokens from ISP servers on behalf of users
- **Users** receive tokens when they start a test (token-on-demand)
- **All test endpoints** require valid tokens (generated just-in-time)

### Access Flows

#### Flow 1: Direct Access (Token-on-Demand)
```
User → ISP Server (/) 
ISP Server → Returns test page (no token yet)
User → Browses freely, reads instructions, etc.
User → Clicks "Start Test" button
JavaScript → POST /api/get-test-token
ISP Server → Generates fresh 10-minute token
User → ISP Server (/download, /upload, etc.) with token
ISP Server → Validates own token locally ✅
```

#### Flow 2: Central Discovery
```
User → test.libreqos.com
Central Server → ISP Server (/api/request-token)
ISP Server → Generates and returns token
Central Server → Redirects user to ISP with token
User → ISP Server (test page with token)
User → Clicks "Start Test" (uses existing token)
ISP Server → Validates own token locally ✅
```

---

## Design Decisions (Finalized)

### 1. Token Distribution Method ✅ **DECIDED**
**Approach:** Token-on-demand when user clicks "Start Test"
- No tokens generated during initial page load
- Users can browse freely without time pressure
- Fresh 10-minute token for each test session
- Optimal timing and resource efficiency

### 2. Token Expiry Strategy ✅ **DECIDED**
**Approach:** Fixed 10-minute tokens, generated just-in-time
- Token created only when test starts
- 10 minutes is sufficient for any test type
- No renewal needed - tests complete within window
- Clean lifecycle management

### 3. Policy Complexity ✅ **DECIDED**
**Approach:** Start with simple policies
- Basic geographic blocking
- Simple rate limiting
- Time-based restrictions
- Enhance later based on ISP feedback

### 4. Deployment Strategy ✅ **DECIDED**
**Approach:** Immediate switch to token-required
- All test endpoints require valid tokens
- Clean implementation without backward compatibility complexity
- Clear security model from day one

### 5. Central Server Authentication ✅ **RECOMMENDED**
**Approach:** Shared secret between central server and each ISP
- Central server authenticates token requests
- Each ISP has unique shared secret
- Prevents token request abuse

### 6. Token Storage ✅ **RECOMMENDED**
**Approach:** In-memory with periodic cleanup
- Fast validation performance
- Automatic cleanup on server restart
- Minimal complexity for initial implementation

### 7. Rate Limiting Integration ✅ **RECOMMENDED**
**Approach:** Enhanced rate limiting based on token metadata
- Token provides access, rate limiting provides protection
- More sophisticated policies possible with token data
- Maintain existing IP-based limits as backup

### 8. Error Handling ✅ **RECOMMENDED**
**Approach:** Return 401 error with clear message
- User can retry by clicking "Start Test" again
- Clear feedback about token issues
- Simple and predictable behavior

---

## Proposed Implementation Phases

### Phase 1: Core Token System (Week 1-2)
- ISP server token generation and validation
- Basic token issuance for direct access
- Central server token request API
- Simple token embedding in HTML

### Phase 2: Policy Engine (Week 3)
- Configurable token policies
- Geographic and time-based restrictions
- Capacity management integration
- Enhanced logging

### Phase 3: Integration & Testing (Week 4)
- Full central server integration
- Comprehensive testing
- Documentation and deployment guides
- Monitoring and metrics

### Phase 4: Production Hardening (Week 5-6)
- Advanced security features
- Performance optimization
- Monitoring dashboards
- Automated deployment

---

## Technical Specifications

### Token Format (JWT)
```json
{
  "iss": "isp-dallas-01",
  "sub": "1.2.3.4",
  "iat": 1640995200,
  "exp": 1640995800,
  "jti": "abc123...",
  "source": "direct|central",
  "test_type": "single_user|virtual_household",
  "capabilities": {
    "download": true,
    "upload": true,
    "ping": true,
    "websocket": true,
    "max_duration": 600,
    "max_data_gb": 10
  },
  "metadata": {
    "user_agent": "Mozilla/5.0...",
    "referrer": "test.libreqos.com"
  }
}
```

### ISP Server Endpoints

#### Core Token Endpoints
- `POST /api/get-test-token` - Generate token when user starts test (direct access)
- `POST /api/request-token` - Token issuance for central server requests
- `GET /api/token-stats` - Token usage statistics (optional)
- `DELETE /api/revoke-token` - Token revocation (optional)

#### Test Endpoints (All Require Tokens)
- `GET /download` - Download speed test (requires X-Session-Token header)
- `POST /upload` - Upload speed test (requires X-Session-Token header)  
- `GET /ping` - Latency test (requires X-Session-Token header)
- `WebSocket /ws/virtual-household/{user_id}` - Virtual household tests

### Configuration Schema
```yaml
token_settings:
  expiry_minutes: 10
  max_tokens_per_ip: 5
  cleanup_interval: 300

policies:
  geographic:
    allowed_countries: ["US", "CA"]
    blocked_regions: []
  
  temporal:
    business_hours_only: false
    timezone: "America/Chicago"
  
  capacity:
    max_concurrent_tests: 100
    deny_tokens_when_overloaded: true
```

---

## Security Considerations

### Token Security
- HMAC-SHA256 signing with server-specific secrets
- IP binding to prevent token sharing
- Short expiry times (10 minutes default)
- Unique JTI (JWT ID) for replay prevention

### Policy Enforcement
- Token validation on every endpoint
- Rate limiting based on token metadata
- Automatic token revocation for abuse
- Comprehensive audit logging

### Central Server Communication
- Optional mutual TLS for token requests
- Request rate limiting from central server
- Configurable trust relationships

---

## Deployment Strategy

### For Existing ISP Servers
1. **Preparation Phase**: Deploy token system code
2. **Testing Phase**: Validate token generation and validation
3. **Full Deployment**: Switch to token-required mode immediately
4. **Monitoring**: Monitor for issues and performance impact
5. **Documentation**: Update ISP operator guides

### For New ISP Servers
- Deploy with token system enabled from start
- Use reference configuration templates
- Automated testing and validation

### Client-Side Updates Required
1. **Update JavaScript**: Add token request logic to "Start Test" buttons
2. **Error Handling**: Display user-friendly messages for token failures
3. **Token Storage**: Use sessionStorage for token lifecycle management
4. **HTTP Headers**: Add X-Session-Token to all test endpoint requests

---

## Success Metrics

### Security Metrics
- Reduction in abuse incidents
- Improved attack detection capabilities
- Decreased resource exhaustion events

### Performance Metrics
- Token validation latency (<1ms)
- Memory usage for token storage
- No impact on test performance

### Operational Metrics
- ISP adoption rate
- Configuration errors and issues
- Support request volume

---

## Implementation Examples

### Client-Side JavaScript (Token-on-Demand)

```javascript
// Add to app.js or equivalent
async function startSingleUserTest() {
    try {
        // Show loading state
        showTestStarting();
        
        // Request fresh token from ISP server
        const response = await fetch('/api/get-test-token', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                test_type: 'single_user',
                user_agent: navigator.userAgent
            })
        });
        
        if (!response.ok) {
            throw new Error(`Token request failed: ${response.status}`);
        }
        
        const {token, expires_in} = await response.json();
        
        // Store token for test session
        sessionStorage.setItem('test_token', token);
        sessionStorage.setItem('token_expires', Date.now() + (expires_in * 1000));
        
        // Start the actual test with token
        await beginSingleUserTest();
        
    } catch (error) {
        console.error('Failed to start test:', error);
        showError('Failed to start test. Please try again.');
    }
}

async function startVirtualHouseholdTest() {
    // Similar logic for virtual household test
    const response = await fetch('/api/get-test-token', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            test_type: 'virtual_household',
            user_agent: navigator.userAgent
        })
    });
    
    const {token} = await response.json();
    sessionStorage.setItem('test_token', token);
    await beginVirtualHouseholdTest();
}

// Helper function to add token to requests
function getAuthHeaders() {
    const token = sessionStorage.getItem('test_token');
    if (!token) {
        throw new Error('No valid test token available');
    }
    
    return {
        'X-Session-Token': token,
        'Content-Type': 'application/json'
    };
}

// Example usage in existing test code
async function downloadTest() {
    const headers = getAuthHeaders();
    const response = await fetch('/download', {headers});
    // ... rest of download test logic
}
```

### ISP Server Implementation

```python
# Add to server/main.py

import jwt
import secrets
import time
from typing import Dict, Optional

class ISPTokenManager:
    def __init__(self, isp_id: str, secret_key: str):
        self.isp_id = isp_id
        self.secret = secret_key
        self.active_tokens: Dict[str, dict] = {}
        self.cleanup_interval = 300  # 5 minutes
        self.last_cleanup = time.time()
    
    def issue_token(self, client_ip: str, test_type: str, source: str = "direct") -> str:
        """Issue a fresh token for a test session"""
        current_time = time.time()
        jti = secrets.token_hex(16)
        
        token_data = {
            "iss": self.isp_id,
            "sub": client_ip,
            "iat": int(current_time),
            "exp": int(current_time) + 600,  # 10 minutes
            "jti": jti,
            "source": source,
            "test_type": test_type,
            "capabilities": {
                "download": True,
                "upload": True,
                "ping": True,
                "websocket": True,
                "max_duration": 600,
                "max_data_gb": 10
            }
        }
        
        # Sign with ISP's secret
        token = jwt.encode(token_data, self.secret, algorithm="HS256")
        
        # Store for validation
        self.active_tokens[jti] = {
            "ip": client_ip,
            "expires": token_data["exp"],
            "test_type": test_type,
            "source": source
        }
        
        # Periodic cleanup
        if current_time - self.last_cleanup > self.cleanup_interval:
            self.cleanup_expired_tokens()
        
        return token
    
    def validate_token(self, token: str, client_ip: str) -> Optional[dict]:
        """Validate a token we issued"""
        try:
            payload = jwt.decode(token, self.secret, algorithms=["HS256"])
            
            # Verify IP and expiry
            if payload["sub"] != client_ip:
                return None
            if time.time() > payload["exp"]:
                return None
            
            # Check active tokens
            jti = payload["jti"]
            if jti not in self.active_tokens:
                return None
                
            return payload
            
        except jwt.InvalidTokenError:
            return None
    
    def cleanup_expired_tokens(self):
        """Remove expired tokens from memory"""
        current_time = time.time()
        expired_tokens = [
            jti for jti, data in self.active_tokens.items()
            if current_time > data["expires"]
        ]
        
        for jti in expired_tokens:
            del self.active_tokens[jti]
        
        self.last_cleanup = current_time

# Initialize token manager
token_manager = ISPTokenManager(
    isp_id=os.getenv('ISP_SERVER_ID', 'isp-server-local'),
    secret_key=os.getenv('ISP_TOKEN_SECRET', 'change-in-production')
)

@app.post("/api/get-test-token")
async def generate_test_token(request: Request):
    """Generate token when user clicks Start Test"""
    client_ip = get_client_ip(request)
    data = await request.json()
    test_type = data.get('test_type', 'single_user')
    
    # Apply ISP policies
    if not await can_user_test(client_ip, test_type):
        raise HTTPException(403, "Testing not available for your location/time")
    
    # Generate token
    token = token_manager.issue_token(client_ip, test_type, "direct")
    
    logger.info(f"Issued test token for {client_ip} (test_type: {test_type})")
    
    return {
        "token": token,
        "expires_in": 600,
        "test_type": test_type
    }

@app.post("/api/request-token") 
async def handle_central_token_request(request: Request):
    """Handle token requests from central server"""
    # Authenticate central server request (using shared secret)
    auth_header = request.headers.get("Authorization")
    if not validate_central_server_auth(auth_header):
        raise HTTPException(401, "Invalid central server authentication")
    
    data = await request.json()
    client_ip = data["client_ip"]
    test_type = data.get("test_type", "single_user")
    
    # Apply ISP policies
    if not await can_user_test(client_ip, test_type):
        raise HTTPException(403, "Access denied by ISP policy")
    
    token = token_manager.issue_token(client_ip, test_type, "central")
    
    return {
        "token": token,
        "expires_in": 600
    }

# Add token validation to all test endpoints
async def require_valid_token(request: Request) -> dict:
    """Middleware to validate tokens on all test endpoints"""
    token = request.headers.get("X-Session-Token")
    client_ip = get_client_ip(request)
    
    if not token:
        raise HTTPException(401, "Test session token required")
    
    payload = token_manager.validate_token(token, client_ip)
    if not payload:
        raise HTTPException(401, "Invalid or expired test session")
    
    return payload

# Update existing endpoints to require tokens
@app.get("/download")
async def download_endpoint(request: Request):
    # Validate token first
    token_payload = await require_valid_token(request)
    
    # Existing download logic continues...
    await rate_limiter.check_download_limit(request)
    # ... rest of existing code
```

---

## Next Steps

With all design decisions finalized, the implementation can proceed immediately:

### **Phase 1 (Week 1)**: Core Token System
1. Implement ISPTokenManager class
2. Add /api/get-test-token endpoint
3. Update client JavaScript for token-on-demand
4. Add token validation to test endpoints

### **Phase 2 (Week 2)**: Central Server Integration  
1. Add /api/request-token endpoint for central server
2. Implement central server authentication
3. Update discovery.js for token handling
4. Integration testing

### **Phase 3 (Week 3)**: Policy Engine & Production
1. Add simple policy configuration
2. Enhanced logging and monitoring
3. Production deployment procedures
4. Documentation and guides

**Ready to begin implementation immediately with the token-on-demand approach.**

---

## Risk Assessment

### Low Risk
- Token generation and validation logic
- Basic policy enforcement
- HTML token embedding

### Medium Risk
- Central server integration complexity
- Backward compatibility during transition
- Performance impact of token validation

### High Risk
- Policy configuration complexity
- Cross-server coordination
- Production deployment coordination

### Mitigation Strategies
- Extensive testing in staging environments
- Feature flags for gradual rollout
- Comprehensive monitoring and alerting
- Rollback procedures for each deployment phase