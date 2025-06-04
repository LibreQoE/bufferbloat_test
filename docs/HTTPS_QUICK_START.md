# LibreQoS Bufferbloat Test - HTTPS Quick Start Guide

## For Testing (Self-Signed Certificates)

If you just want to test HTTPS functionality without setting up a real domain:

```bash
# 1. Create test certificates
./create_test_certificates.sh

# 2. Start with HTTPS on port 8443 (no sudo needed)
python3 start_simple_multiprocess.py \
    --ssl-certfile ssl/cert.pem \
    --ssl-keyfile ssl/key.pem \
    --port 8443

# 3. Access in browser: https://localhost:8443
# (Accept the security warning for self-signed certificate)
```

## For Production (Real Domain)

If you have a real domain pointing to your server:

```bash
# 1. Run the SSL setup script
sudo ./setup_ssl_certificates.sh
# Enter your domain (e.g., test.libreqos.com)
# Enter your email for Let's Encrypt notifications

# 2. Start with HTTPS on port 443
sudo python3 start_simple_multiprocess.py \
    --ssl-certfile ssl/cert.pem \
    --ssl-keyfile ssl/key.pem \
    --port 443

# 3. Access in browser: https://your-domain.com
```

## Troubleshooting the User's Issues

### Issue 1: "Invalid domain format: test.libreqos.com"

**Fixed!** The domain validation regex was too strict. The updated script now accepts subdomains like `test.libreqos.com`.

### Issue 2: "[Errno 2] No such file or directory"

This happens when SSL certificate files don't exist. **Solutions:**

#### Option A: Create Test Certificates (Recommended for Testing)
```bash
# Create self-signed certificates for testing
./create_test_certificates.sh test.libreqos.com

# Start on port 8443 (no sudo needed)
python3 start_simple_multiprocess.py \
    --ssl-certfile ssl/cert.pem \
    --ssl-keyfile ssl/key.pem \
    --port 8443
```

#### Option B: Complete Let's Encrypt Setup
```bash
# Make sure your domain points to this server first
dig test.libreqos.com

# Run the SSL setup script
sudo ./setup_ssl_certificates.sh

# Start on port 443 (requires sudo)
sudo python3 start_simple_multiprocess.py \
    --ssl-certfile ssl/cert.pem \
    --ssl-keyfile ssl/key.pem \
    --port 443
```

## Verification

After starting with HTTPS, verify it's working:

```bash
# Check processes are running
ps aux | grep simple_user_process

# Test HTTPS connection
curl -k https://localhost:8443/health  # For test certificates
curl https://your-domain.com/health    # For real certificates

# Check individual user processes
curl -k https://localhost:8001/health  # Jake process
curl -k https://localhost:8002/health  # Alex process
curl -k https://localhost:8003/health  # Sarah process
curl -k https://localhost:8004/health  # Computer process
```

## Browser Access

- **Test certificates**: https://localhost:8443 (accept security warning)
- **Production**: https://your-domain.com
- **Virtual Household**: Click "Virtual Household" mode and start a test

The client will automatically use `wss://` (secure WebSockets) when accessing via HTTPS.

## Next Steps

1. **For Testing**: Use the test certificates and port 8443
2. **For Production**: Set up DNS, run Let's Encrypt setup, use port 443
3. **Systemd Service**: Use `sudo systemctl start libreqos-bufferbloat` for production deployment

## Support

If you encounter issues:
1. Check the troubleshooting section in `HTTPS_PRODUCTION_DEPLOYMENT.md`
2. Verify certificate files exist: `ls -la ssl/`
3. Check logs for specific error messages
4. Use test certificates first to verify HTTPS functionality