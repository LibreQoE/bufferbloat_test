#!/bin/bash

# LibreQoS Bufferbloat Test - Systemd Service Installation Script
# This script installs the LibreQoS Bufferbloat Test as a systemd service

# Check if running as root
if [ "$EUID" -ne 0 ]; then
  echo "Please run as root (sudo ./install_service.sh)"
  exit 1
fi

echo "Installing LibreQoS Bufferbloat Test as a systemd service..."

# Copy the service file to systemd directory
cp libreqos-bufferbloat.service /etc/systemd/system/
if [ $? -ne 0 ]; then
  echo "Failed to copy service file. Aborting."
  exit 1
fi

echo "Service file copied to /etc/systemd/system/"

# Reload systemd daemon
systemctl daemon-reload
if [ $? -ne 0 ]; then
  echo "Failed to reload systemd daemon. Aborting."
  exit 1
fi

echo "Systemd daemon reloaded"

# Enable the service
systemctl enable libreqos-bufferbloat.service
if [ $? -ne 0 ]; then
  echo "Failed to enable service. Aborting."
  exit 1
fi

echo "Service enabled to start on boot"

# Start the service
systemctl start libreqos-bufferbloat.service
if [ $? -ne 0 ]; then
  echo "Failed to start service. Check logs with: journalctl -u libreqos-bufferbloat.service"
  exit 1
fi

echo "Service started successfully"

# Check service status
echo "Service status:"
systemctl status libreqos-bufferbloat.service --no-pager

echo ""
echo "Installation complete!"
echo "You can access the LibreQoS Bufferbloat Test at: http://$(hostname -I | awk '{print $1}'):80/"
echo ""
echo "To view logs: journalctl -u libreqos-bufferbloat.service -f"
echo "To stop service: systemctl stop libreqos-bufferbloat.service"
echo "To restart service: systemctl restart libreqos-bufferbloat.service"

exit 0