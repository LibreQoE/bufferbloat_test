# Simple Rate Limiting Implementation Plan

## Overview
Implement in-memory rate limiting to prevent bandwidth abuse and resource exhaustion while being NAT-friendly for ISPs with multiple customers behind single IPs.

## Rate Limiting Rules

### Download Endpoints (`/download`, `/netflix-chunk`)
- **16 tests per IP per hour** - Allows multiple customers behind NAT
- **45GB total per IP per hour** - Hard bandwidth cap (~3GB per customer)
- **Window**: Rolling 1-hour window
- **Response**: HTTP 429 with clear error message

### WebSocket Virtual Household (`/ws/virtual-household/*`)
- **4 concurrent sessions per IP** - Prevents process exhaustion
- **16 total connections per IP** - 4 sessions × 4 users each
- **Tracking**: Active connection count only
- **Response**: HTTP 503 with clear error message

## Implementation Architecture

### 1. Rate Limiter Module (`server/simple_rate_limiter.py`)

```python
import time
import threading
from typing import Dict, List, Tuple
from collections import defaultdict

class SimpleRateLimiter:
    def __init__(self):
        # Download tracking: ip -> [(timestamp, bytes_downloaded), ...]
        self.download_history: Dict[str, List[Tuple[float, int]]] = defaultdict(list)
        
        # WebSocket tracking: ip -> active_session_count
        self.websocket_sessions: Dict[str, int] = defaultdict(int)
        
        # Thread safety
        self.lock = threading.RLock()
        
        # Cleanup
        self.last_cleanup = time.time()
        self.cleanup_interval = 600  # 10 minutes
    
    def check_download_limit(self, client_ip: str) -> Tuple[bool, str]:
        """
        Returns: (is_allowed, error_message)
        """
        
    def track_download_request(self, client_ip: str, bytes_downloaded: int):
        """Track completed download for rate limiting"""
        
    def check_websocket_limit(self, client_ip: str) -> Tuple[bool, str]:
        """Check if WebSocket connection is allowed"""
        
    def track_websocket_connect(self, client_ip: str):
        """Track new WebSocket connection"""
        
    def track_websocket_disconnect(self, client_ip: str):
        """Track WebSocket disconnection"""
        
    def cleanup_old_data(self):
        """Remove data older than 1 hour"""
```

### 2. Middleware Integration

**Option A: FastAPI Middleware (Recommended)**
```python
# In server/main.py
from server.simple_rate_limiter import rate_limiter

@app.middleware("http")
async def rate_limiting_middleware(request: Request, call_next):
    # Check rate limits for specific endpoints
    # Return 429/503 if exceeded
    # Otherwise continue to endpoint
```

**Option B: Decorator Approach**
```python
from functools import wraps

def rate_limited(endpoint_type: str):
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            # Check rate limit
            # Return error or continue
        return wrapper
    return decorator

@rate_limited("download")
async def download_endpoint():
    pass
```

### 3. Integration Points

#### Download Endpoints
```python
# Before starting download stream
allowed, error_msg = rate_limiter.check_download_limit(client_ip)
if not allowed:
    raise HTTPException(429, error_msg)

# After download completes
rate_limiter.track_download_request(client_ip, bytes_sent)
```

#### WebSocket Endpoints
```python
# Before WebSocket connection
allowed, error_msg = rate_limiter.check_websocket_limit(client_ip)
if not allowed:
    await websocket.close(code=1008, reason=error_msg)
    return

# On successful connection
rate_limiter.track_websocket_connect(client_ip)

# On disconnection (in finally block)
rate_limiter.track_websocket_disconnect(client_ip)
```

### 4. Error Responses

#### Download Rate Limit (HTTP 429)
```json
{
    "error": "Rate limit exceeded",
    "message": "Maximum 16 download tests per hour per IP address (NAT/ISP friendly)",
    "retry_after": 1800,
    "current_usage": {
        "tests_this_hour": 16,
        "bandwidth_this_hour_gb": 12.5
    }
}
```

#### WebSocket Connection Limit (HTTP 503)
```json
{
    "error": "Connection limit exceeded", 
    "message": "Maximum 4 virtual household sessions per IP address (16 total connections)",
    "current_usage": {
        "active_sessions": 4,
        "total_connections": 16
    }
}
```

## Implementation Steps

### Phase 1: Core Rate Limiter
1. Create `server/simple_rate_limiter.py` with basic structure
2. Implement download tracking logic
3. Implement WebSocket tracking logic
4. Add cleanup functionality
5. Write unit tests

### Phase 2: Download Integration
1. Add rate limiter to download endpoints
2. Track bandwidth usage
3. Test with multiple concurrent downloads
4. Verify cleanup works correctly

### Phase 3: WebSocket Integration  
1. Add rate limiter to WebSocket endpoints
2. Track connection/disconnection events
3. Test with virtual household sessions
4. Handle connection drops gracefully

### Phase 4: Monitoring & Tuning
1. Add logging for rate limit violations
2. Monitor memory usage of rate limiter
3. Tune cleanup frequency if needed
4. Add metrics endpoint (optional)

## Memory Considerations

### Estimated Memory Usage
- **Per IP with max downloads**: ~1KB (16 entries × ~64 bytes each)
- **Per IP with max WebSockets**: ~8 bytes (just a counter)
- **1000 active IPs**: ~1MB total memory usage
- **Cleanup every 10 minutes**: Prevents unbounded growth

### Cleanup Strategy
```python
def cleanup_old_data(self):
    cutoff_time = time.time() - 3600  # 1 hour ago
    with self.lock:
        # Remove old download history
        for ip in list(self.download_history.keys()):
            self.download_history[ip] = [
                (ts, bytes_) for ts, bytes_ in self.download_history[ip]
                if ts > cutoff_time
            ]
            if not self.download_history[ip]:
                del self.download_history[ip]
```

## Configuration

### Environment Variables
```bash
# Optional overrides
RATE_LIMIT_DOWNLOADS_PER_HOUR=16
RATE_LIMIT_BANDWIDTH_GB_PER_HOUR=45
RATE_LIMIT_WEBSOCKET_SESSIONS=4
RATE_LIMIT_CLEANUP_INTERVAL=600
```

### Runtime Configuration
```python
# In server/main.py startup
rate_limiter = SimpleRateLimiter(
    downloads_per_hour=int(os.getenv('RATE_LIMIT_DOWNLOADS_PER_HOUR', 16)),
    bandwidth_gb_per_hour=int(os.getenv('RATE_LIMIT_BANDWIDTH_GB_PER_HOUR', 45)),
    websocket_sessions=int(os.getenv('RATE_LIMIT_WEBSOCKET_SESSIONS', 4)),
    cleanup_interval=int(os.getenv('RATE_LIMIT_CLEANUP_INTERVAL', 600))
)
```

## Testing Strategy

### Unit Tests
- Test download rate limiting with various scenarios
- Test WebSocket connection tracking
- Test cleanup functionality
- Test thread safety

### Integration Tests
- Simulate NAT scenario with multiple rapid requests
- Test rate limit recovery after time window
- Test WebSocket limit enforcement
- Test memory usage under load

### Load Testing
```bash
# Test download rate limiting
for i in {1..20}; do
    curl -w "%{http_code}\n" https://test-dal.libreqos.com/download &
done
wait

# Should see: 16 × 200 responses, 4 × 429 responses
```

## Deployment Considerations

### Restart Behavior
- **Rate limits reset on restart** - This is acceptable for simple implementation
- **No persistent storage** - Keeps implementation simple
- **Quick recovery** - Service available immediately after restart

### Multi-Process Setup
- **Each process has independent limits** - Effective limits are multiplied by process count
- **This is acceptable** - Still prevents individual process overload
- **Future enhancement**: Shared Redis/memcached if needed

### Monitoring
- **Log rate limit violations** for monitoring
- **Track memory usage** of rate limiter
- **Monitor cleanup frequency** and duration

## Future Enhancements

### Persistence (if needed)
- Redis backend for shared state across processes
- SQLite for local persistence across restarts

### Advanced Features
- Whitelist for trusted IPs
- Different limits per ISP/ASN
- Burst allowances
- Sliding window instead of fixed window

### Metrics
- Rate limit violation counts
- Top offending IPs
- Bandwidth usage statistics
- WebSocket connection patterns

## Security Considerations

### IP Spoofing
- Rate limiter uses `request.client.host` 
- Relies on proxy/load balancer for real IP via headers
- Consider `X-Forwarded-For` header handling

### Memory DoS
- Cleanup prevents unbounded memory growth
- Maximum memory usage is bounded by number of unique IPs
- Large number of unique IPs could still consume memory

### Bypass Attempts
- IP rotation to bypass limits
- IPv4/IPv6 switching
- These are acceptable tradeoffs for simple implementation