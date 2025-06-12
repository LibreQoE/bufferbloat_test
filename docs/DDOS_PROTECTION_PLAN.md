# DDOS Protection Plan for LibreQoS ISP/Sponsor Servers

## Overview

This document outlines the DDOS protection strategy for LibreQoS test servers hosted by ISPs and sponsors. The protection is designed to be NAT-aware, accounting for up to 16 customers sharing a single public IP address through Carrier-Grade NAT (CGNAT).

## Current Protection (Existing)

- ✅ Upload size limits: 512MB max request, 8MB chunk processing  
- ✅ Rate limiting: 2000 MB/s max processing rate in upload endpoints
- ✅ CORS domain restrictions to prevent cross-origin abuse
- ✅ Process isolation architecture (multiprocess system)

## Attack Vectors

### Primary Targets
1. **HTTP Endpoints**: `/download`, `/upload`, `/ping`, `/netflix-chunk`
2. **WebSocket Processes**: Virtual household workers (ports 8001-8004)
3. **Static File Serving**: Client assets and resources

### Attack Types
- Connection flooding (exhausting server connections)
- Request rate flooding (overwhelming endpoint processing)
- Bandwidth exhaustion (saturating server bandwidth)
- WebSocket connection abuse (memory/resource exhaustion)

## Protection Strategy: Layer 2 - Endpoint-Specific Limits

### NAT-Aware Design Principles

**ISP Customer Context:**
- Up to 16 customers per public IP (CGNAT)
- Allow 3 concurrent active test sessions per IP
- Balance protection vs. legitimate usage

### Rate Limits Per IP Address

#### HTTP Endpoints
- **`/download`**: Maximum 3 simultaneous connections
- **`/upload`**: Maximum 3 simultaneous connections  
- **`/ping`**: Maximum 180 requests per minute (60 per customer × 3)
- **`/netflix-chunk`**: Maximum 3 simultaneous connections

#### WebSocket Connections
- **Virtual Household WebSockets**: Maximum 12 connections per IP
  - Allows 4 connections per customer × 3 customers
  - Covers all user types (jake, alex, sarah, computer)

#### Static File Serving
- **Static assets**: Maximum 20 requests per minute per IP
  - Covers initial page load and resource requests

## Implementation Details

### Rate Limiting Middleware

Create IP-based rate limiting that tracks:
- Active connections per endpoint per IP
- Request timestamps for time-based limits
- Automatic cleanup of expired tracking data

### Response Behavior

**When limits exceeded:**
- HTTP 429 "Too Many Requests" response
- Informative error message explaining NAT limits
- Retry-After header suggesting wait time

**Grace handling:**
- Brief burst allowance for connection overlap during test transitions
- Gradual connection cleanup (don't immediately drop on limit)

### Memory Management

- In-memory tracking with automatic cleanup
- TTL-based expiration for tracking data
- Bounded memory usage to prevent memory leaks

## Benefits

### For ISPs/Sponsors
- Protects server resources from abuse
- Maintains service availability for legitimate users
- Simple implementation with minimal maintenance

### For Customers
- Allows multiple customers per IP to test simultaneously
- Graceful handling of legitimate usage patterns
- Clear error messages when limits reached

## Monitoring

### Metrics to Track
- Requests per IP over time
- Rate limit violations by endpoint
- Connection patterns and durations
- Resource usage during high load

### Alerting
- Sustained rate limit violations (potential attacks)
- Unusual connection patterns
- Resource exhaustion approaching

## Future Enhancements (Not Implemented)

These could be added later if needed:

### Layer 1 - Session Management
- Track complete test sessions per IP
- Session-based timeouts and cleanup
- Cross-endpoint session correlation

### Layer 3 - Resource Protection  
- Memory usage monitoring per process
- CPU usage throttling
- Automatic process restart on resource exhaustion

### Layer 4 - Advanced Detection
- Pattern-based attack detection
- IP reputation integration
- Adaptive limits based on server load

## Configuration

All limits should be configurable via environment variables or configuration files to allow ISPs to adjust based on their specific customer patterns and server capacity.

Example configuration:
```
MAX_DOWNLOAD_CONNECTIONS_PER_IP=3
MAX_UPLOAD_CONNECTIONS_PER_IP=3  
MAX_PING_REQUESTS_PER_MINUTE=180
MAX_WEBSOCKET_CONNECTIONS_PER_IP=12
MAX_STATIC_REQUESTS_PER_MINUTE=20
```

## Implementation Priority

1. **High Priority**: HTTP endpoint limits (/download, /upload, /ping)
2. **High Priority**: WebSocket connection limits  
3. **Medium Priority**: Static file serving limits
4. **Low Priority**: Advanced monitoring and alerting