#!/bin/bash

# LibreQoS Bufferbloat Test - Service Installation Script
# This script configures and installs the systemd service with the correct username

set -e

echo "🚀 LibreQoS Bufferbloat Test - Service Installation"
echo "=================================================="

# Get current username
USERNAME=$(whoami)
echo "📋 Detected username: $USERNAME"

# Check if service file exists
if [ ! -f "libreqos-bufferbloat.service" ]; then
    echo "❌ Error: libreqos-bufferbloat.service file not found"
    echo "   Make sure you're running this from the LibreQoS directory"
    exit 1
fi

# Create a temporary service file with the correct username
echo "🔧 Configuring service file for user: $USERNAME"
cp libreqos-bufferbloat.service libreqos-bufferbloat.service.tmp
sed -i "s/YOUR_USERNAME/$USERNAME/g" libreqos-bufferbloat.service.tmp

# Install dependencies
echo "📦 Installing Python dependencies..."
pip3 install -r server/requirements.txt

# Set up SSL certificate access
echo "🔒 Setting up SSL certificate access..."

# Create ssl-cert group if it doesn't exist
if ! getent group ssl-cert > /dev/null 2>&1; then
    echo "   Creating ssl-cert group..."
    sudo groupadd ssl-cert
else
    echo "   ssl-cert group already exists"
fi

# Add user to ssl-cert group
echo "   Adding $USERNAME to ssl-cert group..."
sudo usermod -a -G ssl-cert $USERNAME

# Set up certificate permissions if Let's Encrypt directory exists
if [ -d "/etc/letsencrypt" ]; then
    echo "   Setting Let's Encrypt certificate permissions..."
    sudo chgrp -R ssl-cert /etc/letsencrypt/live/ /etc/letsencrypt/archive/ 2>/dev/null || true
    sudo chmod -R g+rx /etc/letsencrypt/live/ /etc/letsencrypt/archive/ 2>/dev/null || true
else
    echo "   Let's Encrypt directory not found - will be configured when certificates are created"
fi

# Install systemd service
echo "⚙️  Installing systemd service..."
sudo cp libreqos-bufferbloat.service.tmp /etc/systemd/system/libreqos-bufferbloat.service
rm libreqos-bufferbloat.service.tmp

# Reload systemd
echo "🔄 Reloading systemd daemon..."
sudo systemctl daemon-reload

# Enable service
echo "✅ Enabling service for auto-start..."
sudo systemctl enable libreqos-bufferbloat.service

echo ""
echo "🎉 Installation complete!"
echo ""
echo "Next steps:"
echo "1. Set up SSL certificates (if not already done):"
echo "   sudo ./setup_ssl_certificates.sh"
echo ""
echo "2. Start the service:"
echo "   sudo systemctl start libreqos-bufferbloat.service"
echo ""
echo "3. Check service status:"
echo "   sudo systemctl status libreqos-bufferbloat.service"
echo ""
echo "4. View logs:"
echo "   sudo journalctl -u libreqos-bufferbloat.service -f"
echo ""
echo "⚠️  Note: You may need to log out and back in for group membership changes to take effect"
