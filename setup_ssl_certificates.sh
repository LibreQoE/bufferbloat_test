#!/bin/bash

# LibreQoS Bufferbloat Test - SSL Certificate Setup Script
# This script sets up Let's Encrypt SSL certificates for production HTTPS deployment

set -e  # Exit on any error

# Configuration
DOMAIN=""
EMAIL=""
CERT_DIR="/etc/letsencrypt/live"
LIBREQOS_DIR="/opt/libreqos_test"
WEBROOT_DIR="/var/www/html"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_header() {
    echo -e "${BLUE}================================================${NC}"
    echo -e "${BLUE}  LibreQoS Bufferbloat Test - SSL Setup${NC}"
    echo -e "${BLUE}================================================${NC}"
    echo
}

print_step() {
    echo -e "${GREEN}[STEP]${NC} $1"
}

print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_root() {
    if [[ $EUID -ne 0 ]]; then
        print_error "This script must be run as root (use sudo)"
        exit 1
    fi
}

get_domain_info() {
    print_step "Getting domain and email information"
    
    if [[ -z "$DOMAIN" ]]; then
        echo -n "Enter your domain name (e.g., bufferbloat.example.com): "
        read DOMAIN
    fi
    
    if [[ -z "$EMAIL" ]]; then
        echo -n "Enter your email address for Let's Encrypt notifications: "
        read EMAIL
    fi
    
    # Validate domain format (more permissive for subdomains)
    if [[ ! "$DOMAIN" =~ ^[a-zA-Z0-9][a-zA-Z0-9.-]*[a-zA-Z0-9]\.[a-zA-Z]{2,}$ ]]; then
        print_error "Invalid domain format: $DOMAIN"
        print_info "Domain should be in format: example.com or subdomain.example.com"
        exit 1
    fi
    
    # Validate email format
    if [[ ! "$EMAIL" =~ ^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$ ]]; then
        print_error "Invalid email format: $EMAIL"
        exit 1
    fi
    
    print_info "Domain: $DOMAIN"
    print_info "Email: $EMAIL"
    echo
}

install_certbot() {
    print_step "Installing Certbot (Let's Encrypt client)"
    
    # Detect OS and install certbot
    if command -v apt-get &> /dev/null; then
        # Debian/Ubuntu
        apt-get update
        apt-get install -y certbot python3-certbot-nginx snapd
        
        # Install certbot via snap for latest version
        snap install core; snap refresh core
        snap install --classic certbot
        ln -sf /snap/bin/certbot /usr/bin/certbot
        
    elif command -v yum &> /dev/null; then
        # RHEL/CentOS/Fedora
        yum install -y epel-release
        yum install -y certbot python3-certbot-nginx snapd
        
        # Enable and start snapd
        systemctl enable --now snapd.socket
        ln -s /var/lib/snapd/snap /snap
        
        # Install certbot via snap
        snap install core; snap refresh core
        snap install --classic certbot
        ln -sf /snap/bin/certbot /usr/bin/certbot
        
    else
        print_error "Unsupported operating system. Please install certbot manually."
        exit 1
    fi
    
    print_info "Certbot installed successfully"
}

check_dns() {
    print_step "Checking DNS resolution for $DOMAIN"
    
    # Check if domain resolves to this server's IP
    DOMAIN_IP=$(dig +short "$DOMAIN" | tail -n1)
    SERVER_IP=$(curl -s ifconfig.me || curl -s ipinfo.io/ip || echo "unknown")
    
    print_info "Domain IP: $DOMAIN_IP"
    print_info "Server IP: $SERVER_IP"
    
    if [[ "$DOMAIN_IP" != "$SERVER_IP" ]]; then
        print_warning "Domain $DOMAIN does not resolve to this server ($SERVER_IP)"
        print_warning "Make sure your DNS A record points to this server's IP address"
        echo -n "Continue anyway? (y/N): "
        read -r response
        if [[ ! "$response" =~ ^[Yy]$ ]]; then
            print_info "Exiting. Please update your DNS records and try again."
            exit 1
        fi
    else
        print_info "DNS resolution looks good!"
    fi
}

setup_webroot() {
    print_step "Setting up webroot directory for domain validation"
    
    # Create webroot directory
    mkdir -p "$WEBROOT_DIR"
    
    # Create a simple index page for verification
    cat > "$WEBROOT_DIR/index.html" << EOF
<!DOCTYPE html>
<html>
<head>
    <title>LibreQoS Bufferbloat Test - SSL Setup</title>
</head>
<body>
    <h1>LibreQoS Bufferbloat Test</h1>
    <p>SSL certificate setup in progress...</p>
    <p>Domain: $DOMAIN</p>
</body>
</html>
EOF
    
    # Set proper permissions
    chown -R www-data:www-data "$WEBROOT_DIR" 2>/dev/null || chown -R nginx:nginx "$WEBROOT_DIR" 2>/dev/null || true
    chmod -R 755 "$WEBROOT_DIR"
    
    print_info "Webroot directory created at $WEBROOT_DIR"
}

obtain_certificate() {
    print_step "Obtaining SSL certificate from Let's Encrypt"
    
    # Stop any services that might be using port 80
    print_info "Temporarily stopping web services..."
    systemctl stop nginx 2>/dev/null || true
    systemctl stop apache2 2>/dev/null || true
    systemctl stop httpd 2>/dev/null || true
    
    # Kill any processes using port 80
    fuser -k 80/tcp 2>/dev/null || true
    sleep 2
    
    # Obtain certificate using standalone mode
    print_info "Requesting certificate for $DOMAIN..."
    certbot certonly \
        --standalone \
        --non-interactive \
        --agree-tos \
        --email "$EMAIL" \
        --domains "$DOMAIN" \
        --rsa-key-size 4096 \
        --verbose
    
    if [[ $? -eq 0 ]]; then
        print_info "Certificate obtained successfully!"
    else
        print_error "Failed to obtain certificate"
        exit 1
    fi
}

setup_certificate_paths() {
    print_step "Setting up certificate paths for LibreQoS"
    
    CERT_PATH="$CERT_DIR/$DOMAIN"
    
    # Verify certificate files exist
    if [[ ! -f "$CERT_PATH/fullchain.pem" ]] || [[ ! -f "$CERT_PATH/privkey.pem" ]]; then
        print_error "Certificate files not found in $CERT_PATH"
        exit 1
    fi
    
    # Create symlinks in LibreQoS directory for easy access
    LIBREQOS_CERT_DIR="$LIBREQOS_DIR/ssl"
    mkdir -p "$LIBREQOS_CERT_DIR"
    
    ln -sf "$CERT_PATH/fullchain.pem" "$LIBREQOS_CERT_DIR/cert.pem"
    ln -sf "$CERT_PATH/privkey.pem" "$LIBREQOS_CERT_DIR/key.pem"
    
    # Set proper permissions (readable by LibreQoS user)
    chmod 644 "$CERT_PATH/fullchain.pem"
    chmod 600 "$CERT_PATH/privkey.pem"
    
    # If running as specific user, adjust ownership
    if [[ -n "$SUDO_USER" ]]; then
        chown -h "$SUDO_USER:$SUDO_USER" "$LIBREQOS_CERT_DIR"/*.pem 2>/dev/null || true
    fi
    
    print_info "Certificate paths configured:"
    print_info "  Certificate: $LIBREQOS_CERT_DIR/cert.pem -> $CERT_PATH/fullchain.pem"
    print_info "  Private Key: $LIBREQOS_CERT_DIR/key.pem -> $CERT_PATH/privkey.pem"
}

setup_auto_renewal() {
    print_step "Setting up automatic certificate renewal"
    
    # Create renewal script
    cat > /usr/local/bin/libreqos-cert-renewal.sh << 'EOF'
#!/bin/bash

# LibreQoS Certificate Renewal Script
LIBREQOS_DIR="/opt/libreqos_test"

# Renew certificates
certbot renew --quiet

# Restart LibreQoS if it's running
if pgrep -f "start_simple_multiprocess.py" > /dev/null; then
    echo "Restarting LibreQoS Bufferbloat Test for certificate renewal..."
    pkill -f "start_simple_multiprocess.py"
    sleep 5
    cd "$LIBREQOS_DIR"
    nohup python3 start_simple_multiprocess.py --ssl-certfile ssl/cert.pem --ssl-keyfile ssl/key.pem > /dev/null 2>&1 &
fi
EOF
    
    chmod +x /usr/local/bin/libreqos-cert-renewal.sh
    
    # Add cron job for automatic renewal (runs twice daily)
    (crontab -l 2>/dev/null; echo "0 */12 * * * /usr/local/bin/libreqos-cert-renewal.sh") | crontab -
    
    print_info "Automatic renewal configured (runs twice daily)"
}

create_startup_script() {
    print_step "Creating HTTPS startup script"
    
    cat > "$LIBREQOS_DIR/start_https.sh" << EOF
#!/bin/bash

# LibreQoS Bufferbloat Test - HTTPS Startup Script
# This script starts the LibreQoS system with SSL/HTTPS support

cd "\$(dirname "\$0")"

# Check if SSL certificates exist
if [[ ! -f "ssl/cert.pem" ]] || [[ ! -f "ssl/key.pem" ]]; then
    echo "ERROR: SSL certificates not found!"
    echo "Please run setup_ssl_certificates.sh first"
    exit 1
fi

# Start LibreQoS with HTTPS
echo "Starting LibreQoS Bufferbloat Test with HTTPS..."
echo "Domain: $DOMAIN"
echo "Certificates: ssl/cert.pem, ssl/key.pem"
echo

python3 start_simple_multiprocess.py \\
    --ssl-certfile ssl/cert.pem \\
    --ssl-keyfile ssl/key.pem \\
    --host 0.0.0.0 \\
    --port 443

EOF
    
    chmod +x "$LIBREQOS_DIR/start_https.sh"
    
    print_info "HTTPS startup script created: $LIBREQOS_DIR/start_https.sh"
}

create_systemd_service() {
    print_step "Creating systemd service for production deployment"
    
    cat > /etc/systemd/system/libreqos-bufferbloat.service << EOF
[Unit]
Description=LibreQoS Bufferbloat Test (HTTPS)
After=network.target
Wants=network.target

[Service]
Type=simple
User=root
Group=root
WorkingDirectory=$LIBREQOS_DIR
ExecStart=/usr/bin/python3 start_simple_multiprocess.py --ssl-certfile ssl/cert.pem --ssl-keyfile ssl/key.pem --port 443
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

# Security settings
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=$LIBREQOS_DIR

[Install]
WantedBy=multi-user.target
EOF
    
    # Reload systemd and enable service
    systemctl daemon-reload
    systemctl enable libreqos-bufferbloat.service
    
    print_info "Systemd service created and enabled"
    print_info "Use: systemctl start libreqos-bufferbloat.service"
}

test_certificate() {
    print_step "Testing SSL certificate"
    
    CERT_PATH="$CERT_DIR/$DOMAIN"
    
    # Check certificate validity
    print_info "Certificate information:"
    openssl x509 -in "$CERT_PATH/fullchain.pem" -text -noout | grep -E "(Subject:|Issuer:|Not Before:|Not After:)"
    
    # Test certificate chain
    print_info "Testing certificate chain..."
    openssl verify -CAfile "$CERT_PATH/chain.pem" "$CERT_PATH/cert.pem" 2>/dev/null || \
    openssl verify "$CERT_PATH/fullchain.pem"
    
    print_info "Certificate test completed"
}

print_completion_info() {
    print_step "SSL Setup Complete!"
    echo
    print_info "Your LibreQoS Bufferbloat Test is now ready for HTTPS deployment:"
    echo
    print_info "🔒 Domain: https://$DOMAIN"
    print_info "📁 Certificates: $LIBREQOS_DIR/ssl/"
    print_info "🚀 Start command: $LIBREQOS_DIR/start_https.sh"
    print_info "⚙️  Systemd service: systemctl start libreqos-bufferbloat"
    echo
    print_info "Next steps:"
    print_info "1. Test the HTTPS startup: cd $LIBREQOS_DIR && ./start_https.sh"
    print_info "2. Access your site: https://$DOMAIN"
    print_info "3. For production: systemctl start libreqos-bufferbloat"
    echo
    print_info "Certificate auto-renewal is configured and will run twice daily."
    print_warning "Make sure port 443 is open in your firewall!"
    echo
}

# Main execution
main() {
    print_header
    
    check_root
    get_domain_info
    install_certbot
    check_dns
    setup_webroot
    obtain_certificate
    setup_certificate_paths
    setup_auto_renewal
    create_startup_script
    create_systemd_service
    test_certificate
    
    print_completion_info
}

# Run main function
main "$@"
