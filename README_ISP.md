# LibreQoS Bufferbloat Test - ISP/Sponsor Installation Guide

Welcome to the LibreQoS Bufferbloat Test platform! This guide will help you set up your own bufferbloat testing server to provide your customers with a reliable way to measure their internet connection quality.

## 🌟 What This Provides Your Customers

Your bufferbloat testing server will offer customers:

- **Comprehensive Network Quality Testing**: Measures how their connection performs under realistic load conditions
- **Two Testing Modes**: Traditional single-user testing and advanced virtual household simulation
- **Professional Results**: Clear grading system (A+ to F) with detailed performance metrics
- **Real-World Scenarios**: Tests gaming, video conferencing, streaming, and background downloads simultaneously
- **Mobile-Friendly Interface**: Works seamlessly on phones, tablets, and computers

## 🚀 Quick Setup Options

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

## 🏢 Branding Your Server

### Display Your Organization Information

Create `/etc/lqos_test.conf` to configure your server's display information:

```bash
# Your organization/ISP information
sponsor_name=Your ISP Name
sponsor_url=https://www.yourisp.com
sponsor_city=Your City
```

This will display: **"Sponsor: Your ISP Name | Your City"** where your ISP name links to your website.

## 🌐 Join the Global Network (Optional)

### Local Operation (Default)

Your server works perfectly as a standalone testing platform for your customers. They can access it directly at your domain and get full testing capabilities.

### Global Network Participation

To have your server participate in the global LibreQoS test network (where users on test.libreqos.com might be directed to your server):

1. **Contact LibreQoS**: Reach out to us with your server details
2. **Server Registration**: We'll add your server to the global discovery system
3. **Validation**: We'll verify your server meets performance standards
4. **Activation**: Your server becomes part of the distributed testing network

**Benefits of joining:**
- Increased visibility for your organization
- Reduced load on central servers
- Better service for users in your geographic area
- Contributing to open internet infrastructure

**Contact information:** [Include contact details for LibreQoS team]

## 🔧 Server Requirements

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

## 📊 Privacy and Data Handling

### Your Customer's Privacy is Protected

- **No Personal Data Collection**: The test does not collect names, emails, or personal information
- **IP Privacy**: Customer IP addresses are anonymized and not stored long-term
- **Local Testing**: When customers use your server directly, all data stays on your infrastructure
- **Minimal Metrics**: Only basic performance measurements are recorded

### When Users Visit test.libreqos.com

If users access the central LibreQoS portal (test.libreqos.com) and are directed to your server:
- Basic usage statistics help improve the service
- All data collection follows strict privacy guidelines
- Users can opt out of any optional data sharing
- No sensitive or identifying information is collected

### Full Control

As the server operator, you have complete control over:
- What data (if any) you choose to log locally
- Your server's participation in the global network
- Customer access and usage policies

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
```

### Performance Metrics

Access server statistics at: `https://your-server.com/api/metrics`

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

### Getting Help

- **Documentation**: Check [DESIGN.md](DESIGN.md) for technical details
- **Community**: Join the LibreQoS community forums
- **Issues**: Report problems on the GitHub repository
- **Direct Support**: Contact LibreQoS for enterprise support options

## 🏗️ Architecture Overview

Your server uses a robust multiprocess architecture:

- **Main Server (Port 443/8000)**: Handles web interface and coordination
- **Dedicated Processes (Ports 8001-8004)**: Handle different types of traffic simulation
- **Ping Server (Port 8005)**: Provides low-latency measurement endpoint
- **Load Balancer**: Distributes connections efficiently
- **Health Monitor**: Automatically restarts failed processes

This design ensures:
- **High Performance**: 800+ Mbps aggregate throughput
- **Reliability**: Process isolation prevents cascading failures
- **Scalability**: Supports 30+ concurrent users
- **Accuracy**: Realistic traffic patterns provide meaningful results

---

**Ready to provide your customers with professional-grade internet testing?**

Start with our Quick Setup options above, and contact us if you'd like to join the global LibreQoS testing network!

---

*Built with ❤️ by [LibreQoS](https://libreqos.io) - Empowering ISPs and their customers with transparent internet quality measurement.*