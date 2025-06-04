#!/bin/bash

# LibreQoS Bufferbloat Test - Test Certificate Generator
# Creates self-signed certificates for testing HTTPS functionality

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Configuration
CERT_DIR="ssl"
DOMAIN="${1:-localhost}"
DAYS="${2:-365}"

print_info "Creating test SSL certificates for LibreQoS Bufferbloat Test"
print_info "Domain: $DOMAIN"
print_info "Valid for: $DAYS days"
echo

# Create SSL directory
mkdir -p "$CERT_DIR"

# Check if openssl is available
if ! command -v openssl &> /dev/null; then
    print_error "OpenSSL is not installed. Please install it first:"
    print_error "  Ubuntu/Debian: sudo apt-get install openssl"
    print_error "  RHEL/CentOS: sudo yum install openssl"
    exit 1
fi

# Generate private key
print_info "Generating private key..."
openssl genrsa -out "$CERT_DIR/key.pem" 2048

# Generate certificate signing request
print_info "Generating certificate signing request..."
openssl req -new -key "$CERT_DIR/key.pem" -out "$CERT_DIR/cert.csr" -subj "/C=US/ST=Test/L=Test/O=LibreQoS/OU=Bufferbloat Test/CN=$DOMAIN"

# Generate self-signed certificate
print_info "Generating self-signed certificate..."
openssl x509 -req -in "$CERT_DIR/cert.csr" -signkey "$CERT_DIR/key.pem" -out "$CERT_DIR/cert.pem" -days "$DAYS"

# Clean up CSR file
rm "$CERT_DIR/cert.csr"

# Set proper permissions
chmod 644 "$CERT_DIR/cert.pem"
chmod 600 "$CERT_DIR/key.pem"

# Verify certificate
print_info "Verifying certificate..."
openssl x509 -in "$CERT_DIR/cert.pem" -text -noout | grep -E "(Subject:|Issuer:|Not Before:|Not After:)"

echo
print_success "Test SSL certificates created successfully!"
print_info "Certificate: $CERT_DIR/cert.pem"
print_info "Private Key: $CERT_DIR/key.pem"
echo
print_warning "These are SELF-SIGNED certificates for TESTING ONLY!"
print_warning "Browsers will show security warnings."
print_warning "For production, use real certificates from Let's Encrypt or a CA."
echo
print_info "To start LibreQoS with HTTPS:"
print_info "  python3 start_simple_multiprocess.py --ssl-certfile $CERT_DIR/cert.pem --ssl-keyfile $CERT_DIR/key.pem --port 8443"
echo
print_info "Then access: https://$DOMAIN:8443"
print_info "(Accept the browser security warning for testing)"