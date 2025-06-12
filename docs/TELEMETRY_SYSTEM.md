# LibreQoS Telemetry System

This document describes the central telemetry system that provides anonymized ASN-based statistics and rankings for bufferbloat test results.

## Overview

The telemetry system collects anonymized test results from LibreQoS bufferbloat tests and provides:

- **ASN-based statistics**: Performance metrics grouped by Internet Service Provider (ASN)
- **Global rankings**: Comparative rankings of ISPs based on bufferbloat performance
- **Privacy preservation**: No IP addresses or personal data stored
- **Real-time aggregation**: Statistics updated as tests are submitted

## Architecture

### Components

1. **ASN Lookup Service** (`central_server/asn_lookup.py`)
   - Fast IP-to-ASN resolution using `/opt/ipinfo_lite.json`
   - In-memory caching with automatic reloading
   - Support for IPv4 and IPv6

2. **Central Database** (`central_server/database.py`)
   - SQLite database with aggregated statistics
   - Automatic data aggregation and percentile calculations
   - Rankings cache with 5-minute TTL

3. **API Endpoints** (`central_server/telemetry_endpoints.py`)
   - RESTful API for accessing statistics
   - Rate limiting and input validation
   - Comprehensive error handling

### Data Flow

```
Client Test → Telemetry Submission → ASN Lookup → Database Storage → Statistics Aggregation → API Endpoints
```

## API Endpoints

### 1. ASN Statistics: `/api/asn/{asn}`

Get detailed statistics for a specific ASN.

**Example Request:**
```bash
curl "https://test.libreqos.com/api/asn/AS32505?min_tests=10"
```

**Example Response:**
```json
{
  "asn": "AS32505",
  "asn_name": "Conterra",
  "country_code": "US",
  "stats": {
    "total_tests": 1247,
    "single_user_tests": 892,
    "virtual_household_tests": 355,
    "last_updated": "2024-01-15T10:30:00Z"
  },
  "single_user_performance": {
    "overall_grade": {
      "average": 4.2,
      "letter_grade": "B",
      "percentile": 68.3,
      "distribution": {"A+": 12, "A": 89, "B": 234, "C": 401, "D": 134, "F": 22}
    },
    "download_grade": {
      "average": 4.5,
      "letter_grade": "A"
    },
    "upload_grade": {
      "average": 3.8,
      "letter_grade": "B"
    },
    "bidirectional_grade": {
      "average": 4.1,
      "letter_grade": "B"
    }
  },
  "virtual_household_performance": {
    "overall_grade": {
      "average": 3.8,
      "letter_grade": "B",
      "percentile": 61.2
    },
    "alex_performance": {
      "average": 4.1,
      "letter_grade": "B"
    },
    "sarah_performance": {
      "average": 3.9,
      "letter_grade": "B"
    }
  },
  "performance_metrics": {
    "avg_baseline_latency_ms": 23.4,
    "avg_download_throughput_mbps": 95.3,
    "avg_upload_throughput_mbps": 12.7
  },
  "comparison": {
    "single_user_percentile": 68.3,
    "virtual_household_percentile": 61.2,
    "better_than_percent": 68.3
  }
}
```

**Parameters:**
- `min_tests` (optional): Minimum number of tests required (default: 10)

### 2. Rankings: `/api/rankings`

Get ranked list of ASNs by performance.

**Example Request:**
```bash
curl "https://test.libreqos.com/api/rankings?mode=single&sort=overall_grade&order=desc&limit=50&min_tests=50&country=US"
```

**Example Response:**
```json
{
  "mode": "single",
  "sort_by": "overall_grade",
  "order": "desc",
  "total_asns": 2847,
  "rankings": [
    {
      "rank": 1,
      "asn": "AS15169",
      "asn_name": "Google LLC",
      "country_code": "US",
      "overall_grade": {
        "average": 5.8,
        "letter_grade": "A",
        "confidence": "high"
      },
      "test_count": 15420,
      "distribution": {"A+": 8234, "A": 4512, "B": 1876, "C": 654, "D": 112, "F": 32},
      "last_updated": "2024-01-15T09:15:00Z"
    }
  ],
  "filters": {
    "min_tests": 50,
    "time_window": "30d",
    "country": "US"
  },
  "generated_at": "2024-01-15T10:45:00Z"
}
```

**Parameters:**
- `mode`: Test mode (`single` or `household`)
- `sort`: Sort field (`overall_grade`, `tests`, `asn`, `name`)
- `order`: Sort order (`asc` or `desc`)
- `limit`: Maximum results (1-200, default: 50)
- `min_tests`: Minimum tests required (10-1000, default: 50)
- `country`: Filter by country code (optional)

### 3. ASN Search: `/api/asn/{asn}/search`

Search for ASNs by number or organization name.

**Example Request:**
```bash
curl "https://test.libreqos.com/api/asn/search?query=comcast&limit=10"
```

### 4. Global Statistics: `/api/stats/global`

Get overall system statistics.

**Example Request:**
```bash
curl "https://test.libreqos.com/api/stats/global"
```

### 5. Telemetry Submission: `/api/telemetry`

Submit test results (used by clients).

**Example Request:**
```bash
curl -X POST "https://test.libreqos.com/api/telemetry" \
  -H "Content-Type: application/json" \
  -d '{
    "telemetry_enabled": true,
    "results": {
      "test_type": "single",
      "grades": {
        "overall": "B",
        "download": "A",
        "upload": "B",
        "bidirectional": "C"
      },
      "metrics": {
        "baseline_latency_ms": 25.3,
        "download_latency_increase_ms": 45.2,
        "upload_latency_increase_ms": 67.8,
        "bidirectional_latency_increase_ms": 89.1,
        "download_throughput_mbps": 95.3,
        "upload_throughput_mbps": 12.7
      }
    }
  }'
```

## Database Schema

### test_results
Stores individual test results with ASN information:
- `test_id`: Unique test identifier
- `timestamp`: Test completion time
- `test_type`: 'single' or 'household'
- `asn`: ASN number (e.g., 'AS32505')
- `asn_name`: Organization name
- `country_code`: Country code
- Grade fields (both numeric and letter)
- Performance metrics

### asn_stats
Aggregated statistics per ASN:
- Weighted averages for all metrics
- Test counts by type
- Grade distributions
- Rankings and percentiles
- Last update timestamp

### rankings_cache
Cached rankings with TTL:
- `cache_key`: Unique key for ranking type
- `rankings_json`: Serialized rankings data
- `expires_at`: Cache expiration time

## Privacy and Security

### Privacy Measures
1. **No IP Storage**: Client IP addresses are only used for ASN lookup, never stored
2. **IP Hashing**: Full IPs are hashed for cache keys, then discarded after ASN lookup
3. **Aggregated Data**: Only statistical aggregations are stored
4. **Anonymized Results**: No individual test results linked to users

### Security Features
1. **Rate Limiting**: API endpoints have rate limits to prevent abuse
2. **Input Validation**: All inputs are validated and sanitized
3. **Error Handling**: Comprehensive error handling without information leakage
4. **Data Retention**: Automatic cleanup of data older than 1 year

## Performance Optimizations

### Database
- Optimized indexes for common queries
- Aggregated statistics to avoid expensive calculations
- Cached rankings with TTL
- Automatic cleanup of old data

### ASN Lookup
- In-memory network tree for fast lookups
- Separate IPv4/IPv6 processing
- Automatic data reloading
- Thread-safe operations

### API
- Response caching for expensive operations
- Efficient pagination
- Minimal data transfer
- Async/await for scalability

## Configuration

### Environment Variables
- `ASN_DATA_FILE`: Path to ipinfo_lite.json (default: `/opt/ipinfo_lite.json`)
- `CENTRAL_DB_PATH`: Database file path (default: `/var/lib/libreqos_central/telemetry.db`)
- `MIN_TESTS_DEFAULT`: Default minimum tests for statistics (default: 10)

### File Locations
- ASN Data: `/opt/ipinfo_lite.json` (~358K entries, 45MB)
- Database: `/var/lib/libreqos_central/telemetry.db`
- Logs: Standard FastAPI logging

## Deployment

### Requirements
```bash
pip install -r central_server/requirements.txt
```

### Running the Server
```bash
cd central_server
python main.py --port 8080
```

### HTTPS (Production)
```bash
python main.py --ssl --ssl-certfile ssl/cert.pem --ssl-keyfile ssl/key.pem --port 443
```

### Systemd Service
The system includes a systemd service file for production deployment:
```bash
sudo ./install_central_service.sh
sudo systemctl start libreqos-central
```

## Monitoring and Maintenance

### Health Checks
- `/api/health`: Basic health check endpoint
- Database connectivity verification
- ASN lookup service status

### Automatic Maintenance
- Daily statistics aggregation
- Automatic data cleanup (1 year retention)
- Cache expiration and cleanup
- ASN data reloading (1 hour interval)

### Logging
The system provides comprehensive logging:
- Request/response logging
- Performance metrics
- Error tracking
- Statistical updates

## Usage Examples

### Get Statistics for Specific ISP
```bash
# Get stats for Comcast
curl "https://test.libreqos.com/api/asn/AS7922"

# Get stats for Google Fiber
curl "https://test.libreqos.com/api/asn/AS15169"
```

### Get Top Performing ISPs
```bash
# Top 20 ISPs for Single User tests
curl "https://test.libreqos.com/api/rankings?mode=single&limit=20"

# Top US ISPs for Virtual Household tests
curl "https://test.libreqos.com/api/rankings?mode=household&country=US&limit=50"
```

### Search for ISPs
```bash
# Find all Comcast ASNs
curl "https://test.libreqos.com/api/asn/search?query=comcast"

# Search by ASN number
curl "https://test.libreqos.com/api/asn/search?query=7922"
```

## Troubleshooting

### Common Issues

1. **ASN Not Found**
   - Verify ASN exists in ipinfo_lite.json
   - Check ASN format (with/without 'AS' prefix)

2. **Insufficient Data**
   - ASN may not have enough tests
   - Adjust min_tests parameter

3. **Performance Issues**
   - Check database indexes
   - Monitor cache hit rates
   - Verify ASN data loading

### Logs to Check
- FastAPI access logs
- Database operation logs
- ASN lookup performance logs
- Statistics aggregation logs

## Future Enhancements

### Planned Features
1. **Geographic Analysis**: City/region-level statistics
2. **Historical Trends**: Time-series analysis
3. **API Keys**: Authentication for high-volume users
4. **Real-time Updates**: WebSocket updates for live data
5. **Export Features**: CSV/JSON data exports

### Scalability
1. **Database Migration**: PostgreSQL for larger datasets
2. **Caching Layer**: Redis for improved performance
3. **Load Balancing**: Multiple server instances
4. **CDN Integration**: Static asset optimization