# Dual Telemetry System Implementation

This document describes the implemented dual telemetry system that provides both local ISP storage and central aggregated statistics.

## Overview

The dual telemetry system implements the corrected processing flow:
```
client_ip → asn_lookup → forward_to_isp(ip+asn+data) → store_in_db(asn+data)
```

This ensures:
- **ISP servers**: Store full client data (including IP) for customer support
- **Central server**: Store only anonymized ASN data for global statistics
- **Privacy**: Client IPs never stored on central server
- **Functionality**: ISP support teams get customer correlation, researchers get aggregate statistics

## Architecture

### Component Overview

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Client Web    │    │   ISP Server     │    │ Central Server  │
│   Application   │    │                  │    │                 │
│                 │    │ ┌─────────────┐  │    │ ┌─────────────┐ │
│ telemetry.js    │───►│ │Local Storage│  │    │ │ASN Database │ │
│                 │    │ │(with IPs)   │  │    │ │(no IPs)     │ │
│                 │    │ └─────────────┘  │    │ └─────────────┘ │
│                 │    │        │         │    │                 │
│                 │    │        ▼         │    │                 │
│                 │    │ ┌─────────────┐  │    │                 │
│                 │    │ │ASN Lookup   │  │───►│                 │
│                 │    │ │& Forward    │  │    │                 │
│                 │    │ └─────────────┘  │    │                 │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

### Data Flow

1. **Client Submission**: Client submits test results to local server
2. **Local Storage**: ISP server stores complete data (including client IP)
3. **ASN Resolution**: ISP server resolves client IP to ASN
4. **Central Forwarding**: ISP server forwards anonymized data (ASN + metrics) to central
5. **Central Storage**: Central server stores only ASN and performance data

## Implementation Details

### Client (telemetry.js)

The client always submits to the local server endpoint:

```javascript
// Always submit to local server - it handles dual telemetry
const submitUrl = '/api/telemetry';
```

This ensures consistent behavior regardless of whether the client is on the central server or an ISP server.

### ISP Server (main.py)

The ISP server `/api/telemetry` endpoint implements dual storage:

```python
@app.post("/api/telemetry")
async def submit_telemetry(request: Request):
    # Step 1: Store locally with full IP (for ISP support)
    if not IS_CENTRAL_SERVER:
        local_test_id = await record_isp_test_result(
            data.get('results', {}),
            client_ip,
            user_agent
        )
    
    # Step 2: Forward to central with ASN lookup
    asn_info = await telemetry_manager.get_asn(client_ip)
    central_payload = {
        "results": data.get("results", {}),
        "client_ip": client_ip,  # For ASN verification
        "asn": asn_info,  # Pre-resolved ASN
        "source_server": "isp"
    }
    # Forward to central server...
```

### Central Server (telemetry.py)

The central server handles both direct submissions and ISP forwarding:

```python
async def record_test_result(self, result_data: Dict, client_ip: str, 
                           pre_resolved_asn: str = None, 
                           source_server: str = "direct"):
    # Use pre-resolved ASN if available, otherwise lookup
    if pre_resolved_asn and pre_resolved_asn != 'UNKNOWN':
        asn = pre_resolved_asn
    else:
        asn = await self.get_asn(client_ip)
    
    # NEVER store IP addresses - critical for privacy
    if 'client_ip' in result_data:
        del result_data['client_ip']
    
    # Store only ASN + performance data
```

### Local ISP Storage (enhanced_telemetry.py)

ISP servers store complete test data for customer support:

```python
class ISPTelemetryManager:
    async def record_test_result(self, results_data: Dict, 
                               client_ip: str, user_agent: str = ""):
        # Store complete data including IP for ISP support
        cursor.execute("""
            INSERT INTO test_results (
                client_ip, user_agent, test_type,
                download_mbps, upload_mbps, baseline_latency_ms,
                download_grade, upload_grade, overall_grade,
                # ... all performance metrics
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ...)
        """)
        
        # Send webhook to ISP systems if configured
        if self.webhook_enabled:
            await self._send_webhook(test_id, results_data, client_ip, user_agent)
```

## Configuration

### ISP Server Configuration (/etc/lqos_test.conf)

```bash
# ISP identification
sponsor_name="Example ISP"
sponsor_url="https://example-isp.com"
sponsor_city="Example City"

# Optional webhook for ISP integration
webhook_url="https://isp-systems.example.com/libreqos-webhook"
webhook_secret="your-webhook-secret-key"
telemetry_api_key="your-api-key-for-telemetry-access"
```

### Environment Variables

```bash
# Server mode detection
SERVER_MODE=isp  # or 'central'
ENABLE_TELEMETRY=true

# ISP webhook configuration (alternative to config file)
LIBREQOS_WEBHOOK_URL="https://isp-systems.example.com/webhook"
LIBREQOS_WEBHOOK_SECRET="webhook-secret"
LIBREQOS_TELEMETRY_API_KEY="api-key"
```

## API Endpoints

### Client Test Submission

**POST /api/telemetry**
- Accepts test results from client applications
- On ISP servers: stores locally + forwards to central
- On central server: stores with ASN lookup

### ISP Support Endpoints (Authentication Required)

**GET /api/telemetry/recent?limit=50**
- Get recent test results for ISP support team
- Includes client IPs for customer correlation
- Requires API key authentication

**GET /api/telemetry/customer/{client_ip}?limit=20**
- Get test history for specific customer IP
- For troubleshooting customer bufferbloat issues
- Requires API key authentication

**GET /api/telemetry/stats**
- Get ISP telemetry system statistics
- Database usage, webhook status, etc.
- Requires API key authentication

### Central Server Endpoints (Public)

**GET /api/asn/{asn}**
- Get performance statistics for specific ASN
- Anonymized aggregate data only

**GET /api/rankings**
- Get ISP performance rankings
- Based on anonymized test data

## Privacy and Security

### Privacy Measures

1. **IP Address Isolation**:
   - Client IPs stored only on ISP servers (for customer support)
   - Central server never stores IP addresses
   - ASN lookup uses IP but discards it immediately

2. **Data Anonymization**:
   - Central database contains only ASN + performance metrics
   - No personally identifiable information
   - Statistical aggregation prevents individual identification

3. **Access Control**:
   - ISP endpoints require API key authentication
   - Central endpoints are public (anonymized data only)
   - Webhook security with HMAC signatures

### Security Features

1. **API Authentication**:
   - Bearer token or X-API-Key header authentication
   - Configurable API keys per ISP
   - Constant-time comparison prevents timing attacks

2. **Webhook Security**:
   - HMAC-SHA256 signature verification
   - Configurable webhook secrets
   - Timeout protection (10 second limit)

3. **Data Validation**:
   - Input sanitization and validation
   - SQL injection prevention
   - Rate limiting on endpoints

## Data Storage

### ISP Local Database

**Location**: `/opt/libreqos_data/isp_telemetry.db`

**Schema**: Complete test data including:
- Client IP address (for support correlation)
- User agent and browser info
- Complete performance metrics
- Test grades and scores
- Timestamp and test duration

**Retention**: 1000 most recent tests (configurable)

### Central Database

**Location**: `/var/lib/libreqos_test/telemetry.db`

**Schema**: Anonymized aggregate data:
- ASN number and organization name
- Performance metrics and grades
- Statistical aggregations
- No IP addresses or personal data

**Retention**: 1 year of historical data

## Webhook Integration

ISP servers can optionally send webhooks to internal systems:

```json
{
  "test_id": "isp_1704123456_7890",
  "timestamp": "2024-01-01T12:34:56Z",
  "source": "libreqos-bufferbloat",
  "client_ip": "192.168.1.100",
  "user_agent": "Mozilla/5.0...",
  "test_type": "single_user",
  "download_mbps": 95.3,
  "upload_mbps": 12.7,
  "ping_ms": 25.3,
  "bufferbloat": {
    "overall_grade": "B",
    "download_latency_increase_ms": 45.2,
    "upload_latency_increase_ms": 67.8,
    "bidirectional_latency_increase_ms": 89.1
  }
}
```

**Security**: Webhooks include HMAC-SHA256 signature in `X-LibreQoS-Signature` header.

## Testing

Use the provided test script to verify implementation:

```bash
python3 test_dual_telemetry.py
```

This tests:
- ISP server local storage
- Central server forwarding
- API endpoint functionality
- Error handling and fallbacks

## Deployment Checklist

### ISP Server Setup

1. ✅ Install LibreQoS server with dual telemetry
2. ✅ Configure `/etc/lqos_test.conf` with ISP details
3. ✅ Set `SERVER_MODE=isp` environment variable
4. ✅ Test local telemetry storage: `/api/telemetry/stats`
5. ✅ Test central forwarding: monitor logs for successful submissions
6. ✅ Configure API keys for support team access
7. ✅ Optional: Set up webhook integration

### Central Server Setup

1. ✅ Install LibreQoS central server
2. ✅ Set `SERVER_MODE=central` environment variable
3. ✅ Verify ASN lookup functionality: `/api/asn_lookup`
4. ✅ Test rankings endpoint: `/api/rankings`
5. ✅ Monitor telemetry submissions in logs
6. ✅ Verify privacy: no IP addresses in database

## Benefits

### For ISP Support Teams

- **Customer Correlation**: Link test results to customer IPs for support
- **Historical Analysis**: Track customer performance over time
- **Proactive Support**: Identify customers with bufferbloat issues
- **Integration**: Webhook delivery to existing support systems

### For Research Community

- **Anonymized Statistics**: ASN-level performance data without privacy concerns
- **Global Rankings**: Compare ISP performance across regions
- **Trend Analysis**: Historical bufferbloat improvement tracking
- **Public Access**: Open API for research and analysis

### For Privacy

- **Compartmentalized Data**: IPs stored only where needed (ISP support)
- **Central Anonymization**: Global statistics without personal data
- **Minimal Retention**: Limited local storage (1000 tests)
- **Access Control**: API authentication for sensitive endpoints

This implementation provides the best of both worlds: practical ISP support capabilities and privacy-preserving global research data.