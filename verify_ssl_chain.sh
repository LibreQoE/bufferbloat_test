#!/bin/bash
# Verify SSL certificate chain is properly served

echo "=== SSL Certificate Chain Verification ==="
echo
echo "Checking certificate chain from test.libreqos.com..."
echo

# Run openssl check and capture output
output=$(openssl s_client -connect test.libreqos.com:443 -servername test.libreqos.com < /dev/null 2>&1)

# Count certificates in chain
cert_count=$(echo "$output" | grep -c "s:")

echo "Certificate chain depth: $cert_count"
echo

# Show the chain
echo "Certificate chain details:"
echo "$output" | grep -A 2 "Certificate chain" | head -10

echo
if [ $cert_count -ge 2 ]; then
    echo "✅ SUCCESS: Full certificate chain is being served!"
    echo "   - Certificate 0: Server certificate (test.libreqos.com)"
    echo "   - Certificate 1: Intermediate certificate (Let's Encrypt R11)"
    echo
    echo "ISP servers should now be able to verify SSL properly when forwarding telemetry."
else
    echo "❌ ISSUE: Only $cert_count certificate(s) in chain"
    echo "   Expected: 2 (server + intermediate)"
    echo
    echo "Troubleshooting:"
    echo "1. Check if nginx is running: systemctl status nginx"
    echo "2. Check nginx error log: tail -n 50 /var/log/nginx/error.log"
    echo "3. Verify cert file: ls -la /etc/letsencrypt/live/test.libreqos.com/"
fi

echo
echo "Additional checks:"

# Test HTTPS connectivity
echo -n "HTTPS response: "
if curl -s -o /dev/null -w "%{http_code}" https://test.libreqos.com/health 2>/dev/null | grep -q "200"; then
    echo "✅ 200 OK"
else
    echo "❌ Failed"
fi

# Test from Python (simulating ISP server telemetry)
echo -n "Python SSL test: "
python3 -c "
import urllib.request
import ssl
try:
    context = ssl.create_default_context()
    with urllib.request.urlopen('https://test.libreqos.com/health', context=context) as response:
        print('✅ SSL verification successful')
except Exception as e:
    print(f'❌ SSL verification failed: {e}')
" 2>/dev/null || echo "❌ Python test failed"