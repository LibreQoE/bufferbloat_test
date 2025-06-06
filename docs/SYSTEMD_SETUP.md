# LibreQoS Bufferbloat Test - Systemd Service Setup

This document provides instructions for setting up the LibreQoS Bufferbloat Test as a systemd service on Ubuntu Server.

## Installation Steps

### Automated Installation (Recommended)

Use the provided installation script that automatically configures everything:

```bash
# Run the automated installation script
./install_service.sh
```

This script will:
- Detect your username and configure the service accordingly
- Install Python dependencies
- Set up SSL certificate access permissions
- Install and enable the systemd service

### Manual Installation

If you prefer manual installation:

1. **Configure the service file for your username**:
```bash
# Get your username
USERNAME=$(whoami)

# Update the service file
sed -i "s/YOUR_USERNAME/$USERNAME/g" libreqos-bufferbloat.service

# Copy to systemd directory
sudo cp libreqos-bufferbloat.service /etc/systemd/system/
```

2. **Install dependencies**:
```bash
pip3 install -r server/requirements.txt
```

3. **Set up SSL certificate access**:
```bash
# Create ssl-cert group and add user
sudo groupadd ssl-cert
sudo usermod -a -G ssl-cert $USERNAME

# Set certificate permissions (if Let's Encrypt exists)
sudo chgrp -R ssl-cert /etc/letsencrypt/live/ /etc/letsencrypt/archive/
sudo chmod -R g+rx /etc/letsencrypt/live/ /etc/letsencrypt/archive/
```

4. **Enable and start the service**:
```bash
# Reload systemd daemon
sudo systemctl daemon-reload

# Enable auto-start on boot
sudo systemctl enable libreqos-bufferbloat.service

# Start the service
sudo systemctl start libreqos-bufferbloat.service

# Check status
sudo systemctl status libreqos-bufferbloat.service
```

## Managing the Service

### Stopping the Service

```bash
sudo systemctl stop libreqos-bufferbloat.service
```

### Restarting the Service

```bash
sudo systemctl restart libreqos-bufferbloat.service
```

### Viewing Service Logs

```bash
sudo journalctl -u libreqos-bufferbloat.service
```

To follow logs in real-time:

```bash
sudo journalctl -u libreqos-bufferbloat.service -f
```

## Troubleshooting

If the service fails to start, check the logs for errors:

```bash
sudo journalctl -u libreqos-bufferbloat.service -n 50
```

### Common Issues

#### Workers Start But Main Server Doesn't (Root-to-Sudo Migration)
**Symptoms**: Worker processes start on ports 8001-8004, but main server (port 443) fails to start.

**Root Cause**: Service configured for root user but environment uses sudo-based access.

**Solution**:
1. **Update service configuration** for non-root user:
   ```bash
   # Get current username
   USERNAME=$(whoami)
   
   # Update the service file with your username
   sudo sed -i "s/YOUR_USERNAME/$USERNAME/g" /etc/systemd/system/libreqos-bufferbloat.service
   
   # Or manually edit the service file:
   # sudo nano /etc/systemd/system/libreqos-bufferbloat.service
   #
   # Change the [Service] section to:
   # [Service]
   # Type=simple
   # User=$USERNAME
   # Group=$USERNAME
   # SupplementaryGroups=ssl-cert
   # Environment=ENABLE_SIMPLE_MULTIPROCESS=true
   # WorkingDirectory=/opt/libreqos_test
   # ExecStart=/usr/bin/python3 /opt/libreqos_test/start_simple_multiprocess.py --ssl-certfile /opt/libreqos_test/ssl/cert.pem --ssl-keyfile /opt/libreqos_test/ssl/key.pem --port 443
   # AmbientCapabilities=CAP_NET_BIND_SERVICE
   # CapabilityBoundingSet=CAP_NET_BIND_SERVICE
   ```

2. **Set up SSL certificate access**:
   ```bash
   # Get current username
   USERNAME=$(whoami)
   
   # Create ssl-cert group if needed
   sudo groupadd ssl-cert
   
   # Add current user to ssl-cert group
   sudo usermod -a -G ssl-cert $USERNAME
   
   # Set certificate permissions
   sudo chgrp -R ssl-cert /etc/letsencrypt/live/ /etc/letsencrypt/archive/
   sudo chmod -R g+rx /etc/letsencrypt/live/ /etc/letsencrypt/archive/
   ```

3. **Install missing dependencies**:
   ```bash
   pip3 install -r server/requirements.txt
   ```

4. **Apply changes**:
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl restart libreqos-bufferbloat.service
   ```

#### Other Common Issues
- Incorrect file paths in the service file
- Missing dependencies (especially `aiohttp` for health checks)
- SSL certificate permission issues
- Port 443 binding requires capabilities or root privileges

## Service Configuration

The service is configured to:
- Run as a specified user (not root for security)
- Use capabilities for privileged port binding
- Set `ENABLE_SIMPLE_MULTIPROCESS=true` environment variable for multi-process mode
- Automatically restart if it crashes
- Start after the network is available
- Log output to the system journal
- Access SSL certificates via group membership

### Environment Variables

The service sets the following environment variables:
- `ENABLE_SIMPLE_MULTIPROCESS=true` - Enables the high-performance multi-process architecture

This environment variable is crucial for the system to operate in multi-process mode, which provides:
- Process isolation for each user type (Jake, Alex, Sarah, Computer)
- Maximum throughput and performance
- Better fault tolerance and resource management

If you need to modify the service configuration, edit the service file and reload the daemon:

```bash
sudo nano /etc/systemd/system/libreqos-bufferbloat.service
sudo systemctl daemon-reload
sudo systemctl restart libreqos-bufferbloat.service
```

## Accessing the Application

Once the service is running, you can access the LibreQoS Bufferbloat Test at:

```
http://your-server-ip:80/
```

Replace `your-server-ip` with the IP address of your server.