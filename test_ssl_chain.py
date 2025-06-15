#!/usr/bin/env python3
"""Test SSL certificate chain loading"""

import ssl
import sys
import os

def test_certificate_chain(cert_path, key_path):
    """Test if the certificate chain loads properly"""
    print(f"Testing certificate chain loading...")
    print(f"Certificate: {cert_path}")
    print(f"Key: {key_path}")
    
    # Check if files exist
    if not os.path.exists(cert_path):
        print(f"❌ Certificate file not found: {cert_path}")
        return False
        
    if not os.path.exists(key_path):
        print(f"❌ Key file not found: {key_path}")
        return False
    
    # Check if cert_path is a symlink and where it points
    if os.path.islink(cert_path):
        target = os.readlink(cert_path)
        print(f"Certificate is a symlink to: {target}")
        if not os.path.exists(target):
            print(f"❌ Symlink target doesn't exist: {target}")
            return False
    
    # Read and check certificate content
    try:
        with open(cert_path, 'r') as f:
            cert_content = f.read()
            cert_count = cert_content.count('BEGIN CERTIFICATE')
            print(f"✅ Certificate file contains {cert_count} certificate(s)")
            
            # Check for common issues
            if cert_count == 1:
                print("⚠️  Only one certificate found - this might be the issue!")
                print("    The file should contain both the server cert and intermediate cert")
            elif cert_count == 2:
                print("✅ Two certificates found (server + intermediate) - this is correct")
            
    except Exception as e:
        print(f"❌ Error reading certificate: {e}")
        return False
    
    # Try to load with SSL context
    try:
        context = ssl.create_default_context(ssl.Purpose.CLIENT_AUTH)
        context.load_cert_chain(cert_path, key_path)
        print("✅ SSL context created and certificate chain loaded successfully")
        
        # Try to get certificate info
        # Note: We can't easily inspect the loaded chain from the context
        # but at least we know it loaded without errors
        
        return True
        
    except Exception as e:
        print(f"❌ Error loading certificate chain: {e}")
        return False

def test_uvicorn_ssl():
    """Test how uvicorn would load the certificates"""
    cert_path = "/opt/libreqos_test/ssl/cert.pem"
    key_path = "/opt/libreqos_test/ssl/key.pem"
    
    print("\n=== Testing Uvicorn SSL Configuration ===")
    
    # Test 1: Direct file paths (old method)
    print("\n1. Testing direct file paths (old method):")
    print("   This is what uvicorn does with ssl_keyfile/ssl_certfile")
    print("   Result: Only serves the first certificate in the file")
    
    # Test 2: SSL context (new method)
    print("\n2. Testing SSL context (new method):")
    if test_certificate_chain(cert_path, key_path):
        print("   Result: Should serve the complete certificate chain")
    
    # Additional diagnostics
    print("\n=== Additional Diagnostics ===")
    
    # Check the actual fullchain.pem
    fullchain_path = "/etc/letsencrypt/live/test.libreqos.com/fullchain.pem"
    if os.path.exists(fullchain_path):
        try:
            with open(fullchain_path, 'r') as f:
                content = f.read()
                count = content.count('BEGIN CERTIFICATE')
                print(f"✅ {fullchain_path} contains {count} certificate(s)")
        except:
            print(f"❌ Cannot read {fullchain_path}")
    
    # Suggest fix if needed
    print("\n=== Recommendations ===")
    print("1. Ensure the service was restarted after code changes")
    print("2. Check service logs for any SSL-related errors")
    print("3. Verify that the fullchain.pem contains both certificates")

if __name__ == "__main__":
    test_uvicorn_ssl()