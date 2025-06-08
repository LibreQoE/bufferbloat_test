# LibreQoS Bufferbloat Test

A comprehensive web-based tool for measuring bufferbloat and network performance under realistic load conditions. This project provides both traditional single-user testing and advanced virtual household simulation to evaluate network behavior under real-world usage scenarios.

## 🚀 What is Bufferbloat?

Bufferbloat occurs when excessive buffering in network equipment causes high latency and poor performance for real-time applications like gaming, video calls, and VoIP. Our test measures how your network connection performs under load, with a focus on latency increases that occur during high bandwidth utilization.

## Overview

The LibreQoS Bufferbloat Test offers two distinct testing modes designed to provide comprehensive network analysis. The system uses a **Simple Multiprocess Architecture** with process isolation for optimal performance and stability.

## Test Modes

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

#### Advanced Features:
- **Process Isolation**: Each user type runs in dedicated process for maximum stability
- **Real-time Performance Monitoring**: Live metrics for each virtual user including ping, jitter, and throughput
- **Realistic Traffic Generation**: Authentic application behavior patterns with burst cycles
- **WebSocket-based Latency Measurement**: Per-user latency tracking through dedicated connections
- **Resource Leak Prevention**: Advanced session management with automatic cleanup
- **Network Fairness Assessment**: Measures bandwidth sharing equity
- **Bufferbloat Detection**: Real-time severity classification and alerts

## Key Features

### Core Testing Capabilities
- **Adaptive Warmup System**: Intelligent ramp-up to optimal test speeds
- **Parameter Discovery**: Automatic detection of connection capabilities
- **Phase-Based Testing**: Sequential load application with precise timing
- **Real-Time Latency Measurement**: 500ms interval ping monitoring per virtual user
- **Comprehensive Throughput Analysis**: Current rate calculation with EMA smoothing

### Advanced Analytics
- **Bufferbloat Grading**: A+ to F scoring based on latency increase
- **Statistical Analysis**: Median, average, percentile calculations
- **Performance Visualization**: Real-time charts and sparklines
- **Results Sharing**: Exportable test results and screenshots
- **Enhanced Logging**: Comprehensive debugging and diagnostics

### Technical Architecture
- **Simple Multiprocess Architecture**: Process isolation with dedicated ports (8001-8004) for each user type
- **Direct WebSocket Connections**: Optimized 4-18ms connection times with 800+ Mbps aggregate throughput
- **Real Traffic Generation**: Genuine `os.urandom()` data transfer (no fake traffic)
- **Resource Management**: Advanced session health tracking with automatic cleanup
- **Native HTTPS Support**: SSL/TLS without reverse proxy overhead
- **Health Monitoring**: Automatic process restart and health validation
- **Responsive Design**: Mobile-friendly interface with dark theme

## Bufferbloat Grading System

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
- **Network Fairness**: How equitably bandwidth is distributed
- **Latency Stability**: Consistency of performance under load

## Architecture Overview

### Simple Multiprocess Architecture
- **Capacity**: 30+ concurrent users with process isolation
- **Process Model**: Dedicated processes for each user type (Jake:8001, Alex:8002, Sarah:8003, Computer:8004)
- **Memory Usage**: Optimized resource utilization with automatic cleanup
- **Performance**: 800+ Mbps aggregate throughput, 4-18ms WebSocket latency
- **Features**:
  - Complete process isolation for maximum stability
  - Direct WebSocket connections to dedicated processes
  - Automatic process health monitoring and restart
  - Resource leak prevention with session management
  - Native HTTPS support without proxy overhead

For detailed architecture information, see [`DESIGN.md`](DESIGN.md).

## Project Structure

```
server/
├── main.py                     # FastAPI application entry point
├── simple_config.py            # Configuration management
├── simple_load_balancer.py     # Load balancing for multiple processes
├── simple_process_manager.py   # Process management and coordination
├── simple_user_process.py      # Individual user process handling
├── websocket_virtual_household.py # Virtual household WebSocket with realistic traffic
├── requirements.txt            # Python dependencies
└── endpoints/                  # API endpoints
    ├── download.py             # Download endpoint for downstream saturation
    ├── ping.py                 # Dedicated ping endpoint for latency measurement
    └── upload.py               # Upload endpoint for upstream saturation

client/
├── index.html                  # Main HTML page with dual-mode interface
├── style.css                   # Comprehensive CSS styling
├── app.js                      # Main application logic and mode switching
├── config.js                   # Client configuration
├── ui.js                       # User interface management
├── results.js                  # Results display and analysis
├── share.js                    # Results sharing functionality
├── test-netflix-pattern.html   # Netflix traffic pattern testing
├── test-real-traffic.html      # Real traffic pattern testing
├── virtualHousehold/
│   ├── virtualHousehold.js     # Main virtual household controller
│   ├── uiHousehold.js          # Virtual household UI management
│   ├── webSocketManager.js     # WebSocket connection management
│   ├── latencyTracker.js       # Per-user latency tracking
│   ├── trafficManager.js       # Traffic pattern management
│   ├── charts/                 # Visualization components
│   │   └── timelineChart.js    # Timeline chart implementation
│   └── workers/                # Virtual user traffic workers
│       ├── workerGamer.js      # Gaming traffic simulation (Alex)
│       ├── workerZoom.js       # Video conference simulation (Sarah)
│       ├── workerNetflix.js    # Streaming simulation (Jake)
│       ├── workerWebSocketUnified.js # Unified WebSocket worker
│       └── workerDownloaderWebSocket.js # Background downloads (Computer)
└── [additional monitoring and utility files...]

# Configuration and deployment files
├── install_service.sh          # Systemd service installation
├── setup_ssl_certificates.sh   # SSL certificate setup
├── create_test_certificates.sh # Test certificate generation
├── start_https.sh              # HTTPS server startup
├── libreqos-bufferbloat.service # Systemd service definition
└── [additional setup scripts...]
```

## Installation and Setup

### Prerequisites
- **Server**: Ubuntu Server 22.04 or 24.04 (or any Linux distribution)
- **Python**: 3.8 or higher
- **Network**: Sufficient bandwidth for testing (recommended: 100+ Mbps)

### Quick Start

1. **Clone the Repository**:
   ```bash
   cd /opt/
   git clone https://github.com/LibreQoE/bufferbloat_test.git libreqos_test
   cd /opt/libreqos_test
   ```

2. **Install Dependencies**:
   ```bash
   pip install -r server/requirements.txt
   ```

3. **Run the Server**:
   ```bash
   python3 server/main.py
   ```
   
   The server runs on port 80 by default with a dedicated ping server on port 8085.

4. **Access the Test**:
   ```
   http://your-server-ip/
   ```

### Production Deployment

#### Systemd Service Installation
For production environments, install as a systemd service:

```bash
sudo ./install_service.sh
```

This provides:
- **Automatic startup** on system boot
- **Automatic restart** on failure
- **System journal logging**
- **Process management** via systemctl

#### Native HTTPS Setup
Set up secure access with SSL certificates (no reverse proxy needed):

```bash
# Production setup with Let's Encrypt
sudo ./setup_ssl_certificates.sh yourdomain.example.com

# Start with HTTPS and HTTP/2 support
python3 server/main.py \
  --port 443 \
  --ssl-keyfile /etc/letsencrypt/live/yourdomain.com/privkey.pem \
  --ssl-certfile /etc/letsencrypt/live/yourdomain.com/fullchain.pem \
  --http2 \
  --production
```

Or for quick testing with self-signed certificates:
```bash
sudo ./create_test_certificates.sh
sudo ./start_https.sh
```

Benefits:
- **Native SSL/TLS encryption** without proxy overhead
- **HTTP/2 support** for improved performance
- **Direct process connections** maintain optimal performance
- **Enhanced security** for production deployments

### Docker Deployment

For containerized deployment, Docker support is available:

#### Quick Start with Docker

```bash
# Build and run with docker-compose (serves on port 80)
docker-compose up -d

# Or build manually with custom port mapping
docker build -t libreqos-bufferbloat .
docker run -p 80:8000 -p 8001-8004:8001-8004 -p 8085:8085 libreqos-bufferbloat
```

#### Docker Configuration

The Docker setup includes:
- **Multi-process support**: All processes run within a single container
- **Port exposure**: Ports 8000-8004, 8085, and optionally 443
- **SSL support**: Mount certificates via volumes
- **Development mode**: Optional source code mounting for live updates

```yaml
# docker-compose.yml example with SSL
services:
  libreqos-bufferbloat:
    build: .
    ports:
      - "8000:8000"
      - "8001-8004:8001-8004"
      - "8085:8085"
      - "443:443"
    volumes:
      - ./ssl:/app/ssl:ro
```

### Configuration Options

#### Multiprocess Configuration
Configure the multiprocess architecture for optimal performance:

```bash
# Enable multiprocess mode (recommended for production)
export VH_ENABLE_MULTIPROCESS=true

# Configure process limits
export MAX_PROCESSES=8
export TESTS_PER_PROCESS=12
```

#### Performance Tuning
Optimize for high-bandwidth connections:

```bash
# Kernel parameters for high concurrency
echo 'net.core.somaxconn = 65535' >> /etc/sysctl.conf
echo 'net.ipv4.tcp_max_syn_backlog = 65535' >> /etc/sysctl.conf
echo 'fs.file-max = 1000000' >> /etc/sysctl.conf
sysctl -p
```

#### Alternative Startup Methods
```bash
# Simple multiprocess startup
python3 start_simple_multiprocess.py

# Or use the shell script
./run_simple_multiprocess.sh
```

## Advanced Features

### Realistic Traffic Generation
- **Authentic Patterns**: Real application behavior simulation with process isolation
- **Burst Cycles**: Netflix streaming with buffer management (Jake process)
- **Gaming Traffic**: Low-latency, consistent flows (Alex process)
- **Video Conferencing**: Bidirectional real-time streams (Sarah process)
- **Background Tasks**: Bulk transfers with realistic patterns (Computer process)

### Real-Time Monitoring
- **Per-User Metrics**: Individual latency, jitter, and throughput tracking per process
- **WebSocket Latency**: Dedicated ping/pong through each user's isolated connection
- **Current Rate Calculation**: 2-second sliding windows with EMA smoothing
- **Resource Health**: Session management with automatic cleanup
- **Sparkline Visualization**: Real-time latency charts for each user

### Simple Multiprocess Architecture Features
- **Complete Process Isolation**: Each user type runs in dedicated process (ports 8001-8004)
- **Direct Connections**: Optimized WebSocket routing to specific processes
- **Health Monitoring**: Automatic process restart and health validation
- **Resource Management**: Advanced session cleanup prevents resource leaks
- **High Performance**: 800+ Mbps aggregate throughput with 4-18ms latency

## API Endpoints

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

### System Monitoring Endpoints
- `GET /health` - System health status
- `GET /metrics` - Performance metrics
- `GET /status` - Current system status

## Performance Targets

### Simple Multiprocess Architecture
- **Concurrent Users**: 30+ simultaneous tests with process isolation
- **Memory Usage**: Optimized with automatic session cleanup
- **Process Count**: Fixed 4 user-type processes + main server + ping server
- **Response Time**: <500ms test initiation, 4-18ms WebSocket connections
- **Throughput**: 800+ Mbps aggregate across all processes
- **Reliability**: Automatic process restart, health monitoring, and resource leak prevention

## Troubleshooting

### Common Issues
- **Port Conflicts**: Ensure ports 80, 443, and 8000-8005 are available
- **Firewall**: Configure firewall rules for HTTP/HTTPS access and access to ports 8000-8005
- **Permissions**: Run with appropriate privileges for port binding
- **Resources**: Ensure sufficient CPU and memory for testing

### Debug Mode
Enable enhanced logging for troubleshooting:
```javascript
window.debugMode = true;
```

### Log Analysis
Access comprehensive logs via the Enhanced Logger:
- **Export Logs**: Download complete diagnostic information
- **Real-time Stats**: Monitor system performance during tests
- **Error Tracking**: Detailed error reporting and analysis

## Contributing

This project welcomes contributions for:
- **New Test Modes**: Additional testing scenarios
- **Performance Optimization**: Speed and efficiency improvements
- **Platform Support**: Additional operating system support
- **Documentation**: Improved guides and examples

## License

This project is open source and available under the MIT License.

---

**Built with ❤️ by [LibreQoS](https://libreqos.io)**

For detailed technical documentation, see:
- [`DESIGN.md`](DESIGN.md) - Complete system design and architecture
