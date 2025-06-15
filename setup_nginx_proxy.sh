#!/bin/bash
# Setup nginx as SSL reverse proxy for LibreQoS
# This fixes the SSL certificate chain issue with uvicorn

set -e

echo "=== LibreQoS nginx SSL Proxy Setup ==="
echo

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   echo "This script must be run as root (use sudo)" 
   exit 1
fi

# Install nginx if not already installed
echo "1. Installing nginx..."
if ! command -v nginx &> /dev/null; then
    apt-get update
    apt-get install -y nginx
    echo "✅ nginx installed"
else
    echo "✅ nginx already installed"
fi

# Stop nginx temporarily
echo
echo "2. Stopping nginx temporarily..."
systemctl stop nginx || true

# Copy nginx configuration
echo
echo "3. Installing nginx configuration..."

# Add WebSocket mapping to http context if not already present
if ! grep -q "map.*http_upgrade.*connection_upgrade" /etc/nginx/nginx.conf; then
    echo "Adding WebSocket mapping to nginx.conf..."
    # Insert the mapping in the http context
    sed -i '/http {/a\\n\t# WebSocket upgrade mapping for LibreQoS\n\tmap $http_upgrade $connection_upgrade {\n\t\tdefault upgrade;\n\t\t'"'"''"'"' close;\n\t}' /etc/nginx/nginx.conf
    echo "✅ WebSocket mapping added to nginx.conf"
else
    echo "✅ WebSocket mapping already exists in nginx.conf"
fi

# Copy the site configuration
cp /opt/libreqos_test/nginx-libreqos.conf /etc/nginx/sites-available/libreqos
echo "✅ Site configuration copied"

# Enable the site
echo
echo "4. Enabling LibreQoS site..."
ln -sf /etc/nginx/sites-available/libreqos /etc/nginx/sites-enabled/libreqos
echo "✅ Site enabled"

# Disable default site if it exists
if [ -L /etc/nginx/sites-enabled/default ]; then
    rm /etc/nginx/sites-enabled/default
    echo "✅ Default site disabled"
fi

# Test nginx configuration
echo
echo "5. Testing nginx configuration..."
nginx -t
if [ $? -eq 0 ]; then
    echo "✅ nginx configuration is valid"
else
    echo "❌ nginx configuration test failed"
    exit 1
fi

# Update LibreQoS systemd service to run on port 8000 without SSL
echo
echo "6. Updating LibreQoS service configuration..."
cat > /etc/systemd/system/libreqos-bufferbloat-http.service << 'EOF'
[Unit]
Description=LibreQoS Bufferbloat Test (HTTP for nginx proxy)
After=network.target
Wants=network.target

[Service]
Type=simple
User=root
Group=root
WorkingDirectory=/opt/libreqos_test
# Run on port 8000 without SSL (nginx handles SSL)
ExecStart=/usr/bin/python3 start_simple_multiprocess.py --port 8000
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

# Security settings
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/opt/libreqos_test

# Environment
Environment="PYTHONUNBUFFERED=1"

[Install]
WantedBy=multi-user.target
EOF

echo "✅ Service file created"

# Reload systemd
echo
echo "7. Reloading systemd..."
systemctl daemon-reload
echo "✅ systemd reloaded"

# Stop the old HTTPS service if running
echo
echo "8. Stopping old HTTPS service..."
systemctl stop libreqos-bufferbloat.service || true
systemctl disable libreqos-bufferbloat.service || true
echo "✅ Old service stopped"

# Enable and start the new HTTP service
echo
echo "9. Starting LibreQoS HTTP service..."
systemctl enable libreqos-bufferbloat-http.service
systemctl start libreqos-bufferbloat-http.service

# Wait a moment for service to start
sleep 3

# Check if service is running
if systemctl is-active --quiet libreqos-bufferbloat-http.service; then
    echo "✅ LibreQoS HTTP service is running"
else
    echo "❌ LibreQoS HTTP service failed to start"
    echo "Check logs with: journalctl -u libreqos-bufferbloat-http.service -n 50"
    exit 1
fi

# Start nginx
echo
echo "10. Starting nginx..."
systemctl start nginx
systemctl enable nginx

# Check if nginx is running
if systemctl is-active --quiet nginx; then
    echo "✅ nginx is running"
else
    echo "❌ nginx failed to start"
    echo "Check logs with: journalctl -u nginx -n 50"
    exit 1
fi

# Test the setup
echo
echo "11. Testing the setup..."
sleep 2

# Test local HTTP service
if curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/health | grep -q "200"; then
    echo "✅ LibreQoS HTTP service responding on port 8000"
else
    echo "⚠️  LibreQoS HTTP service not responding on port 8000"
fi

# Test nginx HTTPS
if curl -s -o /dev/null -w "%{http_code}" https://localhost/health -k | grep -q "200"; then
    echo "✅ nginx HTTPS proxy working"
else
    echo "⚠️  nginx HTTPS proxy not responding"
fi

echo
echo "=== Setup Complete ==="
echo
echo "✅ nginx is now handling SSL termination on port 443"
echo "✅ LibreQoS is running on HTTP port 8000 (internal only)"
echo "✅ SSL certificate chain should now be properly served"
echo
echo "Test commands:"
echo "  - Service status: systemctl status libreqos-bufferbloat-http nginx"
echo "  - Test SSL chain: openssl s_client -connect test.libreqos.com:443 -servername test.libreqos.com < /dev/null"
echo "  - View logs: journalctl -u libreqos-bufferbloat-http -f"
echo
echo "Note: Cloudflare proxy can be enabled at any time - this setup is compatible!"