"""
SSL Helper for proper certificate chain handling
Ensures intermediate certificates are properly served
"""

import ssl
import os
import tempfile
import logging

logger = logging.getLogger(__name__)

def create_ssl_context_with_chain(certfile, keyfile):
    """
    Create an SSL context that properly serves the certificate chain.
    
    This function addresses the issue where Python's SSL module doesn't
    always serve intermediate certificates even when they're in the file.
    """
    # Create SSL context
    ssl_context = ssl.create_default_context(ssl.Purpose.CLIENT_AUTH)
    
    # Load the certificate chain
    try:
        ssl_context.load_cert_chain(certfile, keyfile)
        
        # Additional configuration to ensure proper chain serving
        # Disable SSL session tickets (can cause chain issues)
        ssl_context.options |= ssl.OP_NO_TICKET
        
        # Set ciphers to modern secure defaults
        ssl_context.set_ciphers('ECDHE+AESGCM:ECDHE+CHACHA20:DHE+AESGCM:DHE+CHACHA20:!aNULL:!MD5:!DSS')
        
        logger.info(f"✅ SSL context created with certificate chain from {certfile}")
        
        # Verify the certificate file contains multiple certificates
        with open(certfile, 'r') as f:
            cert_content = f.read()
            cert_count = cert_content.count('BEGIN CERTIFICATE')
            if cert_count < 2:
                logger.warning(f"⚠️  Certificate file only contains {cert_count} certificate(s). Expected 2 (server + intermediate).")
                logger.warning(f"⚠️  This may cause SSL verification issues for clients.")
            else:
                logger.info(f"✅ Certificate file contains {cert_count} certificates (server + intermediate chain)")
                
    except Exception as e:
        logger.error(f"❌ Failed to load certificate chain: {e}")
        raise
        
    return ssl_context

def ensure_fullchain_pem(certfile):
    """
    Ensure the certificate file contains the full chain.
    
    This is a diagnostic function to check if the certificate file
    has both the server certificate and intermediate certificate.
    """
    if not os.path.exists(certfile):
        logger.error(f"Certificate file not found: {certfile}")
        return False
        
    try:
        with open(certfile, 'r') as f:
            content = f.read()
            
        # Count certificates
        cert_count = content.count('BEGIN CERTIFICATE')
        
        if cert_count < 2:
            logger.error(f"Certificate file {certfile} only contains {cert_count} certificate(s)")
            logger.error("Please ensure you're using fullchain.pem from Let's Encrypt")
            return False
            
        # Check if it's a symlink
        if os.path.islink(certfile):
            target = os.path.realpath(certfile)
            logger.info(f"Certificate {certfile} is a symlink to {target}")
            
        return True
        
    except Exception as e:
        logger.error(f"Error checking certificate file: {e}")
        return False