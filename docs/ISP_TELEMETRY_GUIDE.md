# ISP Telemetry System Guide

## Overview

The LibreQoS bufferbloat test now includes enhanced telemetry specifically designed for ISP support teams. This system provides customer correlation capabilities for support troubleshooting, while adding unique bufferbloat insights.

## Key Features

- **Local Storage**: 1000 most recent tests stored with full IP addresses
- **Support APIs**: Query test history for customer troubleshooting  
- **Optional Webhooks**: Integrate with existing ISP portals/systems
- **Privacy Preserving**: Central server never stores customer IPs
- **Zero Configuration**: Works out of the box with sensible defaults

## What Data is Collected

### Single User Tests
- Client IP address and User-Agent
- Download/Upload speeds (Mbps)
- Baseline latency (ms)
- **Bufferbloat-specific metrics**:
  - Additional latency during download (ms)
  - Additional latency during upload (ms) 
  - Additional latency during bidirectional traffic (ms)
  - Overall bufferbloat grade (A+ to F)
  - Individual grades for download/upload/bidirectional

### Virtual Household Tests  
- Client IP address and User-Agent
- Overall household performance score
- **Individual user performance**:
  - Alex (Gaming) grade
  - Sarah (Video Calls) grade  
  - Jake (Streaming) grade
  - Computer (Background Traffic) grade

### Additional Context
- Test timestamp and duration
- Test server used
- Test type (single_user or virtual_household)

## API Endpoints for Support Teams

All telemetry API endpoints require authentication if `telemetry_api_key` is configured. Provide the API key via:
- Authorization header: `Authorization: Bearer your-api-key`
- X-API-Key header: `X-API-Key: your-api-key`
- Query parameter: `?api_key=your-api-key`

### Get Recent Tests
```bash
# With Authorization header
curl -H "Authorization: Bearer your-api-key" \
  "http://your-server/api/telemetry/recent?limit=50"

# With X-API-Key header  
curl -H "X-API-Key: your-api-key" \
  "http://your-server/api/telemetry/recent?limit=50"

# With query parameter
curl "http://your-server/api/telemetry/recent?limit=50&api_key=your-api-key"
```
Returns the most recent tests from all customers.

### Get Customer Test History
```bash
curl -H "Authorization: Bearer your-api-key" \
  "http://your-server/api/telemetry/customer/192.168.1.100?limit=20"
```
Returns test history for a specific customer IP address.

### Get System Statistics
```bash
curl -H "Authorization: Bearer your-api-key" \
  "http://your-server/api/telemetry/stats"
```
Returns telemetry system statistics and configuration.

## Configuration

### Basic Setup (No webhooks)
No configuration needed! The system automatically:
- Creates local database at `/opt/libreqos_data/isp_telemetry.db`
- Stores 1000 most recent tests
- Provides API endpoints for support teams

### Optional Webhook Integration
Add to your existing `/etc/lqos_test.conf` file:

```bash
# Existing ISP configuration
sponsor_name="Your ISP Name"
sponsor_url="https://your-isp.com" 
sponsor_city="Your City"

# Optional webhook for existing portal integration
webhook_url="https://your-portal.example.com/api/speedtest-results"
webhook_secret="your-shared-secret-key"

# Optional API key for telemetry endpoint protection
telemetry_api_key="your-secure-api-key-here"
```

## Webhook Payload Format

When webhooks are configured, test results are sent in a standard format compatible with existing ISP systems:

```json
{
  "test_id": "isp_1234567890_5678",
  "timestamp": "2025-06-12T12:42:18.123Z",
  "source": "libreqos-bufferbloat",
  "client_ip": "192.168.1.100",
  "user_agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)...",
  "test_type": "single_user",
  "download_mbps": 115.6,
  "upload_mbps": 23.4,
  "ping_ms": 12.3,
  "bufferbloat": {
    "overall_grade": "B",
    "download_latency_increase_ms": 45.2,
    "upload_latency_increase_ms": 78.9,
    "bidirectional_latency_increase_ms": 67.1
  }
}
```

For Virtual Household tests, additional `virtual_household` data is included:
```json
{
  "virtual_household": {
    "alex_performance": "A",
    "sarah_performance": "B", 
    "jake_performance": "A",
    "computer_performance": "C"
  }
}
```

## Webhook Security

Webhooks include HMAC-SHA256 signature verification:
- Header: `X-LibreQoS-Signature: sha256=<hex_digest>`
- Verify using your configured `webhook_secret`

Example verification (Python):
```python
import hmac
import hashlib

def verify_webhook(payload, signature, secret):
    expected = hmac.new(
        secret.encode('utf-8'),
        payload.encode('utf-8'), 
        hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(f"sha256={expected}", signature)
```

## Database Schema

The local SQLite database stores:

```sql
CREATE TABLE test_results (
    id INTEGER PRIMARY KEY,
    timestamp DATETIME,
    client_ip TEXT,
    user_agent TEXT,
    test_type TEXT,
    download_mbps REAL,
    upload_mbps REAL,
    baseline_latency_ms REAL,
    download_latency_increase_ms REAL,
    upload_latency_increase_ms REAL,
    bidirectional_latency_increase_ms REAL,
    single_user_score INTEGER,
    download_grade TEXT,
    upload_grade TEXT,
    bidirectional_grade TEXT,
    overall_grade TEXT,
    household_score INTEGER,
    alex_grade TEXT,
    sarah_grade TEXT,
    jake_grade TEXT,
    computer_grade TEXT,
    test_server_name TEXT
);
```

## Support Team Queries

### Recent bufferbloat issues
```bash
curl -H "Authorization: Bearer your-api-key" \
  "http://your-server/api/telemetry/recent?limit=20" | \
  jq '.tests[] | select(.overall_grade == "D" or .overall_grade == "F")'
```

### Customer with performance issues  
```bash
curl -H "Authorization: Bearer your-api-key" \
  "http://your-server/api/telemetry/customer/192.168.1.100" | \
  jq '.tests[] | {timestamp, test_type, overall_grade, download_mbps, upload_mbps}'
```

### Household test analysis
```bash
curl -H "Authorization: Bearer your-api-key" \
  "http://your-server/api/telemetry/recent" | \
  jq '.tests[] | select(.test_type == "virtual_household")'
```

## Maintenance

### Database Cleanup
The system automatically maintains only the 1000 most recent tests. No manual cleanup required.

### Log Monitoring
Monitor server logs for:
- `ISP telemetry: local storage + webhook to <url>` - Webhook enabled
- `ISP telemetry: local storage only` - Local storage only
- `Webhook delivery failed` - Webhook issues (non-critical)

### Database Location
- Default: `/opt/libreqos_data/isp_telemetry.db`
- Backup: Standard SQLite backup procedures
- Size: Typically 10-50MB for 1000 tests

## Troubleshooting

### No data appearing
1. Check server logs for telemetry errors
2. Verify `/opt/libreqos_data/` directory is writable
3. Test API endpoints: `curl -H "Authorization: Bearer your-api-key" http://localhost:8000/api/telemetry/stats`

### Webhook not working
1. Check `/etc/lqos_test.conf` syntax
2. Verify webhook URL is accessible
3. Check server logs for webhook delivery errors
4. Test webhook endpoint manually

### Database issues
1. Check disk space in `/opt/libreqos_data/`
2. Verify SQLite installation
3. Check file permissions

## Integration Examples

### Customer Support Dashboard
Display recent customer tests in your existing portal by querying the API endpoints.

### Automated Alerts
Set up monitoring to alert when customers consistently get poor bufferbloat grades.

### Performance Analytics  
Analyze bufferbloat patterns across your network using the stored data.

## Privacy and Compliance

- **Customer IPs**: Stored locally on your servers only
- **Central Server**: Receives anonymized data without IP addresses  
- **Retention**: Automatically limited to 1000 most recent tests
- **Access Control**: Optional API key authentication for telemetry endpoints
- **Authentication**: Configure `telemetry_api_key` in `/etc/lqos_test.conf` to protect API access

## Key Advantages

**Standard ISP Features:**
- Customer IP Storage for support correlation
- Speed Test Results tracking
- Support Team APIs for troubleshooting
- Webhook Integration with existing systems
- Local Database storage

**Unique LibreQoS Features:**
- **Bufferbloat Analysis**: Detailed latency impact measurements during throughput tests
- **Virtual Household Testing**: Realistic multi-user scenario testing with individual performance grades
- **Real-time Quality Assessment**: Per-application performance grades (Gaming, Video Calls, Streaming, Background Traffic)

The LibreQoS system provides comprehensive customer correlation capabilities plus unique network quality insights focused on real-world user experience.