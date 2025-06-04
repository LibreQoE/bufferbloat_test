#!/bin/bash

# LibreQoS Bufferbloat Test - HTTPS Startup Script
# This script starts the LibreQoS system with SSL/HTTPS support

cd "$(dirname "$0")"

# Check if SSL certificates exist
if [[ ! -f "ssl/cert.pem" ]] || [[ ! -f "ssl/key.pem" ]]; then
    echo "ERROR: SSL certificates not found!"
    echo "Please run setup_ssl_certificates.sh first"
    exit 1
fi

# Start LibreQoS with HTTPS
echo "Starting LibreQoS Bufferbloat Test with HTTPS..."
echo "Domain: test.libreqos.com"
echo "Certificates: ssl/cert.pem, ssl/key.pem"
echo

python3 start_simple_multiprocess.py \
    --ssl-certfile ssl/cert.pem \
    --ssl-keyfile ssl/key.pem \
    --port 443