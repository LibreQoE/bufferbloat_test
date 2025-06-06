# LibreQoS Bufferbloat Test - HTTPS Production Deployment Guide

## Overview

This guide covers deploying the LibreQoS Bufferbloat Test with native HTTPS support for production use. The implementation uses SSL termination directly in the LibreQoS processes to preserve the high-performance direct WebSocket connections while providing production-ready security.

## Architecture

### Native HTTPS Implementation
- **SSL Termination**: Direct SSL handling in each LibreQoS process
- **WebSocket Security**: Automatic `wss://` (WebSocket Secure) connections
- **Performance Preservation**: No reverse proxy - maintains direct client-to-worker connections
- **Multi-Process Support**: SSL enabled across all user processes (Jake, Alex, Sarah, Computer)

### Connection Flow
```
Client (HTTPS) → Main Server (Port 443, SSL) → Direct WebSocket (WSS) → User Process (SSL)
```

## Quick Start

### 1. For Testing - Self-Signed Certificates
For testing or development environments:

```bash
# Create test certificates (self-signed)
./create_test_certificates.sh

# Or for a specific domain
./create_test_certificates.sh your-domain.com

# Start with test certificates on port 8443
python3 start_simple_multiprocess.py \
    --ssl-certfile ssl/cert.pem \
    --ssl-keyfile ssl/key.pem \
    --port 8443
```

### 2. For Production - Let's Encrypt
Run the automated SSL certificate setup script:

```bash
sudo ./setup_ssl_certificates.sh
```

This script will:
- Install Let's Encrypt Certbot
- Obtain SSL certificates for your domain
- Configure automatic renewal
- Create startup scripts and systemd service
- Set up proper file permissions

### 3. Manual Configuration
If you prefer manual setup or have existing certificates:

```bash
# Create SSL directory
mkdir -p ssl/

# Copy your certificates
cp /path/to/your/certificate.pem ssl/cert.pem
cp /path/to/your/private-key.pem ssl/key.pem

# Set proper permissions
chmod 644 ssl/cert.pem
chmod 600 ssl/key.pem
```

### 3. Start HTTPS Server
```bash
# Using the generated startup script
./start_https.sh

# Or manually
python3 start_simple_multiprocess.py \
    --ssl-certfile ssl/cert.pem \
    --ssl-keyfile ssl/key.pem \
    --host 0.0.0.0 \
    --port 443
```

### 4. Production Deployment
```bash
# Start as systemd service
sudo systemctl start libreqos-bufferbloat

# Enable auto-start on boot
sudo systemctl enable libreqos-bufferbloat

# Check status
sudo systemctl status libreqos-bufferbloat
```

## SSL Certificate Management

### Let's Encrypt Integration
The setup script configures automatic certificate renewal:

- **Renewal Schedule**: Twice daily via cron
- **Auto-Restart**: LibreQoS automatically restarts with new certificates
- **Monitoring**: Renewal logs available in system journal

### Manual Certificate Renewal
```bash
# Renew certificates
sudo certbot renew

# Restart LibreQoS to use new certificates
sudo systemctl restart libreqos-bufferbloat
```

### Certificate Verification
```bash
# Check certificate validity
openssl x509 -in ssl/cert.pem -text -noout | grep -E "(Subject:|Not After:)"

# Test HTTPS connection
curl -I https://your-domain.com

# Check WebSocket SSL
wscat -c wss://your-domain.com/ws/virtual-household/jake
```

## Configuration Details

### SSL Parameters
The implementation supports standard SSL configuration:

```python
# In start_simple_multiprocess.py
parser.add_argument('--ssl-certfile', help='SSL certificate file path')
parser.add_argument('--ssl-keyfile', help='SSL private key file path')
```

### Process-Specific SSL
Each user process (Jake, Alex, Sarah, Computer) runs with SSL:

```python
# Each process gets SSL configuration
process_args = [
    'python3', 'server/simple_user_process.py',
    '--user-id', user_id,
    '--port', str(port),
    '--ssl-certfile', ssl_certfile,  # SSL enabled
    '--ssl-keyfile', ssl_keyfile
]
```

### Client WebSocket Security
The client automatically detects HTTPS and uses secure WebSockets:

```javascript
getWebSocketServerUrl() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    return `${protocol}//${host}`;
}
```

## Performance Considerations

### Direct Connection Optimization
- **No Reverse Proxy**: SSL termination in LibreQoS processes preserves direct connections
- **Connection Times**: Maintains 4-18ms WebSocket connection times
- **Throughput**: Preserves 800+ Mbps aggregate throughput capability
- **Process Isolation**: Each user type maintains dedicated process with SSL

### SSL Performance
- **RSA 4096-bit Keys**: Strong security with reasonable performance
- **TLS 1.2/1.3**: Modern TLS versions supported
- **Connection Reuse**: WebSocket connections maintain SSL session

## Security Features

### Certificate Security
- **Let's Encrypt**: Industry-standard CA with automatic renewal
- **Strong Encryption**: RSA 4096-bit keys, modern cipher suites
- **HSTS Ready**: Can be configured with HTTP Strict Transport Security

### Process Security
- **Privilege Separation**: Each user process runs with minimal privileges
- **File Permissions**: SSL keys protected with 600 permissions
- **Network Isolation**: Processes bound to specific ports

## Firewall Configuration

### Required Ports
```bash
# Allow HTTPS traffic
sudo ufw allow 443/tcp

# Allow user process ports (if external access needed)
sudo ufw allow 8001:8004/tcp

# Check firewall status
sudo ufw status
```

### iptables Example
```bash
# Allow HTTPS
iptables -A INPUT -p tcp --dport 443 -j ACCEPT

# Allow user process ports
iptables -A INPUT -p tcp --dport 8001:8004 -j ACCEPT
```

## Monitoring and Logging

### System Logs
```bash
# View LibreQoS service logs
sudo journalctl -u libreqos-bufferbloat -f

# View certificate renewal logs
sudo journalctl -u certbot.timer -f

# Check SSL certificate status
sudo certbot certificates
```

### Health Checks
The system includes HTTPS-aware health monitoring:

```python
# Health checks use HTTPS when SSL is enabled
health_url = f"{'https' if ssl_enabled else 'http'}://localhost:{port}/health"
```

## Troubleshooting

### Common Issues

#### Server Starts But Only Worker Processes Function
**Symptoms**: Worker processes (ports 8001-8004) start successfully, but main server (port 443) doesn't start and health checks fail.

**Root Cause**: This typically occurs when moving from a root-only VPS to a sudo-based environment.

**Solution**:
1. **Fix systemd service configuration** - Update service to run as non-root user:
   ```bash
   # First, determine your username
   USERNAME=$(whoami)
   
   # Edit /etc/systemd/system/libreqos-bufferbloat.service
   # Replace YOUR_USERNAME with your actual username in the service file:
   sudo sed -i "s/YOUR_USERNAME/$USERNAME/g" /etc/systemd/system/libreqos-bufferbloat.service
   
   # Or manually edit the service file:
   # [Service]
   # User=$USERNAME
   # Group=$USERNAME
   # SupplementaryGroups=ssl-cert
   # AmbientCapabilities=CAP_NET_BIND_SERVICE
   # CapabilityBoundingSet=CAP_NET_BIND_SERVICE
   ```

2. **Set up SSL certificate access**:
   ```bash
   # Get current username
   USERNAME=$(whoami)
   
   # Create ssl-cert group if it doesn't exist
   sudo groupadd ssl-cert
   
   # Add current user to ssl-cert group
   sudo usermod -a -G ssl-cert $USERNAME
   
   # Set proper group ownership for certificates
   sudo chgrp -R ssl-cert /etc/letsencrypt/live/ /etc/letsencrypt/archive/
   sudo chmod -R g+rx /etc/letsencrypt/live/ /etc/letsencrypt/archive/
   ```

3. **Install missing dependencies**:
   ```bash
   # Install aiohttp for health checks
   pip3 install aiohttp
   
   # Or install all requirements
   pip3 install -r server/requirements.txt
   ```

4. **Reload and restart service**:
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl restart libreqos-bufferbloat.service
   ```

#### Certificate Files Not Found (`[Errno 2] No such file or directory`)
This error occurs when SSL certificate files don't exist:

```bash
# Check if certificate files exist
ls -la ssl/
# Should show cert.pem and key.pem

# If missing, create test certificates
./create_test_certificates.sh

# Or for production, run SSL setup
sudo ./setup_ssl_certificates.sh

# Verify files exist and have correct permissions
ls -la ssl/
# cert.pem should be 644, key.pem should be 600
```

#### Missing Dependencies (`ModuleNotFoundError: No module named 'aiohttp'`)
The health check system requires aiohttp for HTTPS health monitoring:

```bash
# Install missing dependency
pip3 install aiohttp

# Or install all requirements
pip3 install -r server/requirements.txt

# Restart service after installing
sudo systemctl restart libreqos-bufferbloat.service
```

#### Domain Validation Failed in SSL Setup
If the SSL setup script rejects your domain:

```bash
# The domain should be in format: example.com or subdomain.example.com
# Valid examples:
#   test.libreqos.com
#   bufferbloat.example.org
#   my-site.domain.net

# If you get "Invalid domain format", check for:
# - No spaces in domain name
# - Valid TLD (.com, .org, .net, etc.)
# - No special characters except hyphens and dots
```

#### Permission Denied
```bash
# Fix SSL key permissions
sudo chmod 600 ssl/key.pem
sudo chown $USER:$USER ssl/key.pem
```

#### Port 443 Access Denied
```bash
# Run with sudo for port 443
sudo python3 start_simple_multiprocess.py --ssl-certfile ssl/cert.pem --ssl-keyfile ssl/key.pem --port 443

# Or use systemd service
sudo systemctl start libreqos-bufferbloat

# For testing, use a non-privileged port
python3 start_simple_multiprocess.py --ssl-certfile ssl/cert.pem --ssl-keyfile ssl/key.pem --port 8443
```

#### WebSocket Connection Failed
```bash
# Check if all processes are running with SSL
ps aux | grep simple_user_process

# Verify WebSocket URLs use wss://
# Check browser developer console for connection errors

# For self-signed certificates, accept browser security warning
```

#### Let's Encrypt Certificate Acquisition Failed
```bash
# Check DNS resolution
dig your-domain.com

# Ensure domain points to your server
curl -I http://your-domain.com

# Check firewall allows port 80 (needed for domain validation)
sudo ufw allow 80/tcp

# Try manual certificate request
sudo certbot certonly --standalone -d your-domain.com
```

### Debug Mode
```bash
# Run with verbose logging
python3 start_simple_multiprocess.py \
    --ssl-certfile ssl/cert.pem \
    --ssl-keyfile ssl/key.pem \
    --port 443 \
    --debug
```

## Migration from HTTP

### Gradual Migration
1. **Test HTTPS**: Run HTTPS on port 8443 first
2. **Verify Functionality**: Test all Virtual Household features
3. **Update DNS**: Point domain to HTTPS
4. **Switch Ports**: Move to port 443
5. **Redirect HTTP**: Optional HTTP→HTTPS redirect

### Backup Strategy
```bash
# Backup current configuration
cp -r . ../libreqos-backup-$(date +%Y%m%d)

# Test HTTPS without affecting HTTP
python3 start_simple_multiprocess.py \
    --ssl-certfile ssl/cert.pem \
    --ssl-keyfile ssl/key.pem \
    --port 8443
```

## Advanced Configuration

### Custom SSL Settings
For advanced SSL configuration, modify the SSL context in the server code:

```python
# In server/simple_user_process.py and start_simple_multiprocess.py
ssl_context = ssl.create_default_context(ssl.Purpose.CLIENT_AUTH)
ssl_context.load_cert_chain(ssl_certfile, ssl_keyfile)

# Optional: Configure specific TLS versions
ssl_context.minimum_version = ssl.TLSVersion.TLSv1_2
ssl_context.maximum_version = ssl.TLSVersion.TLSv1_3
```

### Load Balancing
For high-traffic deployments, consider:

- **Multiple Instances**: Run multiple LibreQoS instances behind a load balancer
- **Sticky Sessions**: Ensure WebSocket connections stay with the same instance
- **SSL Termination**: Can be done at load balancer level if needed

## Support and Maintenance

### Regular Maintenance
- **Certificate Monitoring**: Check certificate expiry dates
- **Log Rotation**: Configure log rotation for production
- **Security Updates**: Keep system and dependencies updated
- **Performance Monitoring**: Monitor SSL handshake times and throughput

### Backup and Recovery
```bash
# Backup SSL certificates
sudo cp -r /etc/letsencrypt/ /backup/letsencrypt-$(date +%Y%m%d)

# Backup LibreQoS configuration
tar -czf libreqos-config-$(date +%Y%m%d).tar.gz ssl/ *.py *.md
```

## Conclusion

The native HTTPS implementation provides production-ready SSL security while maintaining the high-performance direct WebSocket connections that make the LibreQoS Bufferbloat Test effective. The automated setup script handles most configuration details, making deployment straightforward while preserving the system's performance characteristics.

For additional support or advanced configurations, refer to the LibreQoS documentation or submit issues to the project repository.