# LibreQoS Bufferbloat Test - ISP Installation & Operations Guide

Welcome to the LibreQoS Bufferbloat Test platform! This guide will help ISPs and hosting providers set up their own bufferbloat testing server to provide customers with reliable internet connection quality measurement.

## 🌟 What This Provides Your Customers

Your bufferbloat testing server offers customers:

- **Comprehensive Network Quality Testing**: Measures how connections perform under realistic load conditions
- **Two Testing Modes**: Traditional single-user testing and advanced virtual household simulation
- **Professional Results**: Clear grading system (A+ to F) with detailed performance metrics
- **Real-World Scenarios**: Tests gaming, video conferencing, streaming, and background downloads simultaneously
- **Mobile-Friendly Interface**: Works seamlessly on phones, tablets, and computers
- **Customer Support Integration**: Enhanced telemetry system for troubleshooting correlation

## 🚀 What is Bufferbloat?

Bufferbloat occurs when excessive buffering in network equipment causes high latency and poor performance for real-time applications like gaming, video calls, and VoIP. Our test measures how network connections perform under load, with a focus on latency increases that occur during high bandwidth utilization.

## 🔧 Quick Setup Options

Choose the installation method that works best for your infrastructure:

### Option 1: Docker Installation (Recommended)

The fastest way to get started with HTTPS support:

```bash
# 1. Clone the repository
cd /opt/
git clone https://github.com/LibreQoE/bufferbloat_test.git libreqos_test
cd /opt/libreqos_test

# 2. Set up SSL certificates (for production)
sudo ./setup_ssl_certificates.sh yourdomain.example.com

# 3. Deploy with Docker
docker-compose -f docker-compose.prod.yml up -d
```

Your test server will be available at `https://yourdomain.example.com`

### Option 2: Direct Installation

For more control over the server configuration:

```bash
# 1. Clone and install dependencies
cd /opt/
git clone https://github.com/LibreQoE/bufferbloat_test.git libreqos_test
cd /opt/libreqos_test
pip install -r server/requirements.txt

# 2. Set up SSL certificates
sudo ./setup_ssl_certificates.sh yourdomain.example.com

# 3. Install as system service
sudo ./install_service.sh

# 4. Start the service
sudo systemctl start libreqos-bufferbloat
sudo systemctl enable libreqos-bufferbloat
```

## 🏢 ISP Configuration & Branding

### Display Your Organization Information

Create `/etc/lqos_test.conf` to configure your server's display information:

```bash
# Your organization/ISP information
sponsor_name=Your ISP Name
sponsor_url=https://www.yourisp.com
sponsor_city=Your City

# Optional webhook for customer support integration
webhook_url=https://your-portal.example.com/api/speedtest-results
webhook_secret=your-shared-secret-key

# Optional API key for telemetry endpoint protection
telemetry_api_key=your-secure-api-key-here
```

This will display: **"Sponsor: Your ISP Name | Your City"** where your ISP name links to your website.

### Enhanced Telemetry for Customer Support

The system includes advanced telemetry designed specifically for ISP support teams:

- **Local Storage**: 1000 most recent tests stored with full IP addresses for customer correlation
- **Support APIs**: Query test history for customer troubleshooting
- **Optional Webhooks**: Integrate with existing ISP portals/systems
- **Privacy Preserving**: Central server never stores customer IPs
- **API Authentication**: Secure access to telemetry endpoints

#### Support Team API Endpoints

```bash
# Get recent tests from all customers
curl -H "Authorization: Bearer your-api-key" \
  "https://your-server/api/telemetry/recent?limit=50"

# Get test history for specific customer IP
curl -H "Authorization: Bearer your-api-key" \
  "https://your-server/api/telemetry/customer/192.168.1.100"

# Get system statistics
curl -H "Authorization: Bearer your-api-key" \
  "https://your-server/api/telemetry/stats"
```

See [docs/ISP_TELEMETRY_GUIDE.md](docs/ISP_TELEMETRY_GUIDE.md) for complete telemetry documentation.

## 🧪 Test Modes

### 🧑 Single User Test Mode
Traditional bufferbloat testing that measures individual connection performance through sequential load phases:

- **Baseline Phase (0-5s)**: Measures unloaded latency baseline
- **Download Warmup (5-10s)**: Gradual ramp-up to target download speed
- **Download Saturation (10-20s)**: Full download load with latency monitoring
- **Upload Warmup (20-25s)**: Gradual ramp-up to target upload speed  
- **Upload Saturation (25-35s)**: Full upload load with latency monitoring
- **Bidirectional Phase (35-40s)**: Simultaneous download and upload load

### 🏠 Virtual Household Mode
Advanced simulation that recreates a realistic household environment with multiple concurrent users and applications using **authentic traffic patterns** and **process isolation**:

#### Virtual Users (Process Isolated):
- **Alex (Competitive Gaming)** 🎮 - *Process :8002*
  - Counter-Strike 2 gameplay simulation
  - **Traffic**: 1.5 Mbps ↓ / 0.75 Mbps ↑ (constant, low-latency)
  - Real-time gaming with latency sensitivity
  
- **Sarah (Video Conference)** 👩‍💻 - *Process :8003*
  - Microsoft Teams video call simulation
  - **Traffic**: 2.5 Mbps ↓ / 2.5 Mbps ↑ (constant, bidirectional)
  - HD video conferencing with consistent streams
  
- **Jake (HD Netflix Streaming)** 📺 - *Process :8001*
  - Netflix HD streaming with adaptive bitrate
  - **Traffic**: 25 Mbps ↓ (1s bursts) / 0.1 Mbps ↑ (minimal telemetry)
  - **Pattern**: 1-second bursts at 25 Mbps, 4-second pauses (5 Mbps average)
  - Realistic streaming buffer management
  
- **Computer (System Updates)** 🤖 - *Process :8004*
  - System updates and cloud backup simulation
  - **Traffic**: 50 Mbps ↓ (continuous) / 2 Mbps ↑ (constant backup)
  - Background bulk data transfers

## 📊 Bufferbloat Grading System

The test assigns grades based on additional latency under load:

| Latency Increase | Grade | Description |
|------------------|-------|-------------|
| < 5 ms           | A+    | Excellent - Virtually no bufferbloat |
| 5-30 ms          | A     | Very Good - Minimal bufferbloat |
| 30-60 ms         | B     | Good - Moderate bufferbloat |
| 60-200 ms        | C     | Fair - Noticeable bufferbloat |
| 200-400 ms       | D     | Poor - Significant bufferbloat |
| ≥ 400 ms         | F     | Very Poor - Severe bufferbloat |

**Virtual Household Mode** provides additional grading for:
- **Overall Performance**: Combined score across all virtual users
- **Individual User Performance**: Gaming, Video Calls, Streaming, Background Traffic
- **Network Fairness**: How equitably bandwidth is distributed

## 🔒 HTTPS Setup

### Production SSL Certificates (Let's Encrypt)

For a production server accessible to your customers:

```bash
# Automatic Let's Encrypt setup
sudo ./setup_ssl_certificates.sh your-test-server.yourdomain.com

# The script will:
# - Install certbot
# - Obtain SSL certificates
# - Configure automatic renewal
# - Set appropriate permissions
```

### Development/Testing Certificates

For internal testing or development:

```bash
# Generate self-signed certificates
sudo ./create_test_certificates.sh

# Start with HTTPS
python3 start_simple_multiprocess.py \
  --ssl-certfile ssl/cert.pem \
  --ssl-keyfile ssl/key.pem \
  --port 443
```

## 🏗️ Architecture Overview

### Simple Multiprocess Architecture

Your server uses a robust multiprocess architecture designed for ISP-grade performance:

- **Main Server (Port 443/8000)**: Handles web interface and coordination
- **Dedicated Processes (Ports 8001-8004)**: Handle different types of traffic simulation
- **Ping Server (Port 8005)**: Provides low-latency measurement endpoint
- **Load Balancer**: Distributes connections efficiently
- **Health Monitor**: Automatically restarts failed processes

**Performance Targets:**
- **Concurrent Users**: 30+ simultaneous tests with process isolation
- **Throughput**: 800+ Mbps aggregate across all processes
- **Response Time**: <500ms test initiation, 4-18ms WebSocket connections
- **Reliability**: Automatic process restart, health monitoring, and resource leak prevention

This design ensures:
- **High Performance**: Professional-grade throughput capabilities
- **Reliability**: Process isolation prevents cascading failures
- **Scalability**: Supports multiple concurrent customers
- **Accuracy**: Realistic traffic patterns provide meaningful results

## 🌐 Server Requirements

### Minimum Requirements
- **CPU**: 2 cores, 2.0 GHz
- **RAM**: 4 GB
- **Network**: 100 Mbps symmetric connection
- **OS**: Ubuntu 22.04/24.04 or compatible Linux distribution

### Recommended for High Traffic
- **CPU**: 4+ cores, 3.0+ GHz
- **RAM**: 8+ GB
- **Network**: 1+ Gbps symmetric connection
- **Storage**: 20+ GB available space

## 🚀 Performance Optimization

### Network Configuration

```bash
# Optimize for high concurrency
echo 'net.core.somaxconn = 65535' >> /etc/sysctl.conf
echo 'net.ipv4.tcp_max_syn_backlog = 65535' >> /etc/sysctl.conf
echo 'fs.file-max = 1000000' >> /etc/sysctl.conf
sysctl -p
```

### Firewall Configuration

```bash
# Allow HTTP and HTTPS traffic
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Allow test server ports (required for proper operation)
sudo ufw allow 8000:8005/tcp
```

## 📊 Privacy and Data Handling

### Your Customer's Privacy is Protected

- **No Personal Data Collection**: The test does not collect names, emails, or personal information
- **Local IP Storage**: Customer IP addresses stored locally for support correlation only
- **Optional Central Reporting**: Anonymized data forwarded to central server (no IPs)
- **API Access Control**: Optional authentication protects customer data access
- **Automatic Cleanup**: Local database maintains only 1000 most recent tests

### ISP Support Features

- **Customer Correlation**: Full IP addresses stored locally for support troubleshooting
- **Webhook Integration**: Optional integration with existing ISP customer portals
- **API Authentication**: Secure access to telemetry data for authorized support staff
- **Data Retention**: Configurable retention policies for compliance

### Full Control

As the server operator, you have complete control over:
- What data (if any) you choose to log locally
- API access authentication and authorization
- Customer access and usage policies
- Integration with your existing support systems

## 📈 Monitoring Your Server

### Health Checks

Monitor your server status:

```bash
# Check service status
sudo systemctl status libreqos-bufferbloat

# View recent logs
sudo journalctl -u libreqos-bufferbloat -f

# Test server health
curl https://your-server.com/api/health

# Check telemetry system
curl -H "Authorization: Bearer your-api-key" \
  https://your-server.com/api/telemetry/stats
```

### Performance Metrics

Access server statistics:
- **System Health**: `https://your-server.com/api/health`
- **Virtual Household Stats**: `https://your-server.com/virtual-household/stats`
- **Telemetry Statistics**: `https://your-server.com/api/telemetry/stats`

## 🔄 Maintenance

### Updates

Keep your server current:

```bash
cd /opt/libreqos_test
git pull origin main
sudo systemctl restart libreqos-bufferbloat
```

### SSL Certificate Renewal

Let's Encrypt certificates auto-renew, but you can check status:

```bash
# Check certificate status
sudo certbot certificates

# Test renewal process
sudo certbot renew --dry-run
```

### Telemetry Database Maintenance

The telemetry system automatically maintains the database:
- Keeps only 1000 most recent tests
- No manual cleanup required
- Database typically 10-50MB in size

## 🆘 Support and Troubleshooting

### Common Issues

**Service won't start:**
```bash
# Check for port conflicts
sudo netstat -tulpn | grep :443
sudo netstat -tulpn | grep :8000

# Check logs for errors
sudo journalctl -u libreqos-bufferbloat --no-pager
```

**HTTPS certificate issues:**
```bash
# Verify certificate files exist
ls -la /etc/letsencrypt/live/yourdomain.com/

# Check certificate validity
openssl x509 -in /etc/letsencrypt/live/yourdomain.com/cert.pem -text -noout
```

**Telemetry not working:**
```bash
# Check database directory permissions
ls -la /opt/libreqos_data/

# Test telemetry API
curl -H "Authorization: Bearer your-api-key" \
  http://localhost:8000/api/telemetry/stats
```

### Getting Help

- **Documentation**: Check [DESIGN.md](DESIGN.md) for technical details
- **Telemetry Guide**: See [docs/ISP_TELEMETRY_GUIDE.md](docs/ISP_TELEMETRY_GUIDE.md)
- **Community**: Join the LibreQoS community forums
- **Issues**: Report problems on the GitHub repository
- **Direct Support**: Contact LibreQoS for enterprise support options

## 🔌 API Endpoints

### Core Testing Endpoints
- `GET /ping` - Latency measurement endpoint
- `GET /download` - Download saturation endpoint
- `POST /upload` - Upload saturation endpoint
- `WebSocket /ws/bulk-download` - High-performance download streams

### Virtual Household Endpoints
- `WebSocket /ws/virtual-household/{user_id}` - Virtual user connections
- `GET /virtual-household/stats` - System statistics
- `GET /virtual-household/health` - Health monitoring
- `GET /virtual-household/profiles` - Available user profiles

### ISP Support Endpoints (Protected)
- `GET /api/telemetry/recent` - Recent test results from all customers
- `GET /api/telemetry/customer/{ip}` - Test history for specific customer IP
- `GET /api/telemetry/stats` - Telemetry system statistics

### System Monitoring Endpoints
- `GET /api/health` - System health status
- `GET /api/sponsor` - ISP sponsorship configuration

## 🏗️ Project Structure

```
server/
├── main.py                     # FastAPI application entry point
├── enhanced_telemetry.py       # ISP telemetry system
├── simple_process_manager.py   # Process management and coordination
├── simple_user_process.py      # Individual user process handling
├── websocket_virtual_household.py # Virtual household WebSocket
├── requirements.txt            # Python dependencies
└── endpoints/                  # API endpoints

client/
├── index.html                  # Main HTML page with dual-mode interface
├── style.css                   # Comprehensive CSS styling
├── app.js                      # Main application logic
├── telemetry.js               # Telemetry data collection
├── virtualHousehold/          # Virtual household components
└── [additional UI components...]

docs/
├── ISP_TELEMETRY_GUIDE.md     # Complete telemetry documentation
├── DESIGN.md                  # Technical architecture details
└── [additional documentation...]

# Configuration and deployment files
├── install_service.sh          # Systemd service installation
├── setup_ssl_certificates.sh   # SSL certificate setup
├── docker-compose.prod.yml     # Production Docker deployment
└── [additional setup scripts...]
```

---

**Ready to provide your customers with professional-grade internet testing?**

Start with our Quick Setup options above, and refer to the detailed documentation for advanced configuration and telemetry integration.

---

*Built with ❤️ by [LibreQoS](https://libreqos.io) - Empowering ISPs and their customers with transparent internet quality measurement.*