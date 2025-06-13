import os
import asyncio
import time
import uvicorn
from fastapi import FastAPI, Response, Request, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
import random
import logging
from typing import Dict, Optional


# Import shared endpoint modules - Always use shared endpoints for consistency
from server.endpoints.download import create_download_endpoint, create_netflix_endpoint
from server.endpoints.upload import create_upload_endpoint
from server.endpoints.ping import create_ping_endpoint
from server.endpoints.warmup import router as warmup_router
SHARED_ENDPOINTS_AVAILABLE = True

# Token system removed - using simple access control
# Removed obsolete webrtc_concurrent and websocket_bulk_download imports - no longer used in simple multiprocess system

# Import telemetry system
# Only enable telemetry on the central server (test.libreqos.com)
import socket
SERVER_MODE = os.getenv('SERVER_MODE', 'isp')
IS_CENTRAL_SERVER = (
    SERVER_MODE == 'central' or 
    socket.getfqdn() == 'test.libreqos.com' or 
    os.getenv('ENABLE_TELEMETRY', 'false').lower() == 'true'
)

if IS_CENTRAL_SERVER:
    try:
        from server.telemetry import telemetry_manager
        TELEMETRY_AVAILABLE = True
        logger = logging.getLogger(__name__)
        logger.info("Telemetry system enabled (central server)")
    except ImportError:
        TELEMETRY_AVAILABLE = False
        logger = logging.getLogger(__name__)
        logger.warning("Telemetry system not available")
else:
    TELEMETRY_AVAILABLE = False
    logger = logging.getLogger(__name__)
    logger.info("Telemetry disabled (ISP server)")

# Import token authentication system
# Token authentication and rate limiter removed

# Import Simple Multi-Process Virtual Household System
SIMPLE_MULTIPROCESS_ENABLED = os.getenv('ENABLE_SIMPLE_MULTIPROCESS', 'true').lower() == 'true'

if SIMPLE_MULTIPROCESS_ENABLED:
    try:
        from server.simple_process_manager import process_manager
        SIMPLE_MULTIPROCESS_AVAILABLE = True
        logger = logging.getLogger(__name__)
        logger.info("✅ Simple Multi-Process Virtual Household available")
    except ImportError as e:
        SIMPLE_MULTIPROCESS_AVAILABLE = False
        logger = logging.getLogger(__name__)
        logger.warning(f"⚠️ Simple Multi-Process not available: {e}")
else:
    SIMPLE_MULTIPROCESS_AVAILABLE = False

# Import single-process fallback (removed - we're going full multiprocess)
# from websocket_virtual_household import router as websocket_household_router, session_manager

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Create main FastAPI app
app = FastAPI(title="LibreQoS Bufferbloat Test")

# Configure CORS - restrict origins for security
import re

# Remove CORS restrictions entirely for maximum performance
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Rate limiting middleware
@app.middleware("http")
async def rate_limiting_middleware(request: Request, call_next):
    """Apply rate limiting to download and WebSocket endpoints"""
    if not RATE_LIMITING_AVAILABLE:
        return await call_next(request)
    
    # Get client IP (handle proxy headers)
    client_ip = get_client_ip(request)
    
    # Handle CORS preflight requests immediately
    if request.method == "OPTIONS":
        response = Response()
        response.headers["Access-Control-Allow-Origin"] = "*"
        response.headers["Access-Control-Allow-Methods"] = "*"
        response.headers["Access-Control-Allow-Headers"] = "*"
        response.headers["Access-Control-Allow-Credentials"] = "true"
        return response
    
    # Check rate limits for download endpoints
    if request.url.path in ["/download", "/netflix-chunk"]:
        allowed, error_msg = rate_limiter.check_download_limit(client_ip)
        if not allowed:
            usage_stats = rate_limiter.get_usage_stats(client_ip)
            response = JSONResponse(
                status_code=429,
                content={
                    "error": "Rate limit exceeded",
                    "message": error_msg,
                    "retry_after": 3600,  # 1 hour
                    "current_usage": usage_stats
                }
            )
            # Add CORS headers manually for rate limit responses
            response.headers["Access-Control-Allow-Origin"] = "*"
            response.headers["Access-Control-Allow-Methods"] = "*"
            response.headers["Access-Control-Allow-Headers"] = "*"
            response.headers["Access-Control-Allow-Credentials"] = "true"
            return response
    
    # Process the request
    response = await call_next(request)
    
    # Track download bandwidth after successful response
    if (request.url.path in ["/download", "/netflix-chunk"] and 
        response.status_code == 200 and
        hasattr(response, 'headers')):
        
        # Try to get content length from response
        content_length = response.headers.get('content-length')
        if content_length:
            try:
                bytes_sent = int(content_length)
                rate_limiter.track_download_request(client_ip, bytes_sent)
            except (ValueError, TypeError):
                # Content-length not available or invalid, skip tracking
                pass
    
    return response

def get_client_ip(request: Request) -> str:
    """Extract client IP from request, handling proxy headers"""
    # Check for forwarded IP headers (common in proxy setups)
    forwarded_ip = request.headers.get("x-forwarded-for")
    if forwarded_ip:
        # Take the first IP in case of multiple proxies
        return forwarded_ip.split(",")[0].strip()
    
    real_ip = request.headers.get("x-real-ip")
    if real_ip:
        return real_ip.strip()
    
    # Fall back to direct client IP
    return request.client.host if request.client else "unknown"

# Rate limiting system
try:
    from server.simple_rate_limiter import rate_limiter
    RATE_LIMITING_AVAILABLE = True
    logger.info("🛡️ Rate limiting system available")
except ImportError as e:
    RATE_LIMITING_AVAILABLE = False
    logger.warning(f"⚠️ Rate limiting system not available: {e}")

# Use shared endpoint modules for main server (same as workers)
async def setup_main_server_endpoints():
    """Set up shared endpoints for main server"""
    try:
        await create_download_endpoint(app, "[MAIN] ", "steady")
        await create_upload_endpoint(app, "[MAIN] ", "standard")
        await create_ping_endpoint(app, "[MAIN] ")
        await create_netflix_endpoint(app, "[MAIN] ", burst_mode=False, quality="1080p")
        
        # Include warmup endpoint for adaptive Virtual Household
        app.include_router(warmup_router, prefix="/api")
        
        # Include adaptive Virtual Household endpoints
        from server.websocket_virtual_household import router as adaptive_household_router
        app.include_router(adaptive_household_router, prefix="/api")
        
        logger.info("✅ Main server using shared endpoint modules with warmup and adaptive household support")
    except Exception as e:
        logger.error(f"❌ Error setting up shared endpoints for main server: {e}")
        raise  # Re-raise to make startup failures visible

# Removed obsolete router inclusions - using simple multiprocess system instead

# Simple Multi-Process Virtual Household Routing
@app.get("/ws/virtual-household/{user_id}")
async def websocket_virtual_user_redirect(user_id: str, request: Request):
    """HTTP redirect endpoint that routes clients to appropriate user process WebSocket ports"""
    logger.info(f"🔀 Virtual Household redirect request for: {user_id}")
    
    try:
        if SIMPLE_MULTIPROCESS_AVAILABLE and process_manager.is_running():
            # Get port from simple process manager
            port = process_manager.get_port_for_user(user_id)
            
            if port:
                # Use the same host as the incoming request
                host = request.headers.get("host", "localhost:8000").split(":")[0]
                # Use wss:// for secure WebSockets when SSL is enabled
                ws_protocol = "wss" if process_manager.ssl_enabled else "ws"
                redirect_url = f"{ws_protocol}://{host}:{port}/ws/virtual-household/{user_id}"
                logger.info(f"🔌 Redirecting {user_id} to dedicated process at {redirect_url}")
                
                return JSONResponse({
                    "redirect": True,
                    "websocket_url": redirect_url,
                    "port": port,
                    "user_id": user_id,
                    "architecture": "simple_multiprocess",
                    "process_isolation": True,
                    "message": f"Connect to dedicated {user_id} process on port {port}",
                    "host": host
                })
            else:
                logger.error(f"❌ No healthy process available for {user_id}")
                return JSONResponse({
                    "redirect": False,
                    "error": f"No healthy process available for user type: {user_id}",
                    "available_processes": list(process_manager.user_ports.keys())
                }, status_code=503)
        else:
            logger.error("❌ Simple Multi-Process system not available")
            return JSONResponse({
                "redirect": False,
                "error": "Multi-process system not available",
                "architecture": "unavailable"
            }, status_code=503)
            
    except Exception as e:
        logger.error(f"❌ Error in WebSocket redirect for {user_id}: {e}")
        return JSONResponse({
            "redirect": False,
            "error": str(e),
            "architecture": "error"
        }, status_code=500)

@app.websocket("/ws/virtual-household/{user_id}")
async def websocket_virtual_user_main(websocket: WebSocket, user_id: str):
    """Main WebSocket endpoint that routes to appropriate user process"""
    logger.info(f"🔀 Direct WebSocket connection request for: {user_id}")
    
    # Check WebSocket rate limits before accepting connection
    try:
        # Create a fake request object to pass to rate limiter
        # Extract IP from WebSocket connection
        client_ip = websocket.client.host if websocket.client else "unknown"
        
        # Create mock request for rate limiter
        class MockRequest:
            def __init__(self, ip):
                self.client_ip = ip
                self.headers = {}
                self.client = type('obj', (object,), {'host': ip})()
        
        mock_request = MockRequest(client_ip)
        await rate_limiter.check_websocket_limit(mock_request)
        
    except HTTPException as e:
        logger.warning(f"WebSocket rate limit exceeded for {user_id} from {client_ip}: {e.detail}")
        await websocket.close(code=1013, reason="Too many WebSocket connections from your IP")
        return
    
    try:
        if SIMPLE_MULTIPROCESS_AVAILABLE and process_manager.is_running():
            # FIXED: Get port and redirect client to dedicated process
            port = process_manager.get_port_for_user(user_id)
            
            if port:
                # Close with redirect instruction containing the correct port
                redirect_reason = f"Redirect to port {port}"
                logger.info(f"🔀 Redirecting {user_id} WebSocket to dedicated process on port {port}")
                await websocket.close(code=1014, reason=redirect_reason)
                return
            else:
                logger.error(f"❌ No healthy process available for {user_id}")
                await websocket.close(code=1013, reason=f"No healthy process for {user_id}")
                return
        else:
            # Multi-process system not available
            await websocket.close(code=1013, reason="Multi-process system not available")
            return
            
    except Exception as e:
        logger.error(f"❌ WebSocket error for {user_id}: {e}")
        try:
            await websocket.close(code=1011, reason="Internal error")
        except:
            pass
    finally:
        # Always release WebSocket connection when done
        try:
            mock_request = type('obj', (object,), {
                'client': type('obj', (object,), {'host': client_ip})(),
                'headers': {}
            })()
            await rate_limiter.release_websocket_connection(mock_request)
        except:
            pass  # Ignore errors in cleanup

@app.get("/api/health")
async def get_health():
    """Health check endpoint for the main server"""
    return JSONResponse({
        "status": "healthy",
        "server": "libreqos-main",
        "version": "1.0.0",
        "timestamp": int(time.time())
    })

@app.get("/api/sponsor")
async def get_sponsor_config():
    """Get sponsor configuration from /etc/lqos_test.conf"""
    try:
        config_path = "/etc/lqos_test.conf"
        if os.path.exists(config_path):
            sponsor_name = None
            sponsor_url = None
            sponsor_city = None
            
            with open(config_path, 'r') as f:
                for line in f:
                    line = line.strip()
                    if line.startswith("sponsor_name="):
                        sponsor_name = line.split("=", 1)[1].strip()
                    elif line.startswith("sponsor_url="):
                        sponsor_url = line.split("=", 1)[1].strip()
                    elif line.startswith("sponsor_city="):
                        sponsor_city = line.split("=", 1)[1].strip()
            
            if sponsor_name and sponsor_url:
                return JSONResponse({
                    "sponsor_name": sponsor_name,
                    "sponsor_url": sponsor_url,
                    "sponsor_city": sponsor_city or "Local"
                })
        
        # No sponsor config found
        return JSONResponse({"sponsor_name": None, "sponsor_url": None, "sponsor_city": None})
    except Exception as e:
        logger.error(f"Error reading sponsor config: {e}")
        return JSONResponse({"sponsor_name": None, "sponsor_url": None, "sponsor_city": None})

# ===== ISP TOKEN ENDPOINTS =====

@app.post("/api/get-test-token")
async def generate_test_token(request: Request):
    """Generate token when user clicks Start Test (direct access)"""
    if not TOKEN_SYSTEM_AVAILABLE:
        raise HTTPException(503, "Token system not available")
    
    try:
        client_ip = get_client_ip(request)
        data = await request.json()
        
        test_type = data.get('test_type', 'single_user')
        user_agent = data.get('user_agent', request.headers.get('user-agent', 'unknown'))
        
        # Validate test type
        if test_type not in ['single_user', 'virtual_household']:
            raise HTTPException(400, "Invalid test_type. Must be 'single_user' or 'virtual_household'")
        
        # Get token manager
        token_mgr = get_token_manager()
        
        # Check if user can test (policy enforcement)
        can_test, reason = token_mgr.can_user_test(client_ip, test_type)
        if not can_test:
            raise HTTPException(403, f"Testing not available: {reason}")
        
        # Generate token
        token = token_mgr.issue_token(
            client_ip=client_ip,
            test_type=test_type,
            source="direct",
            user_agent=user_agent
        )
        
        logger.info(f"🎫 Issued {test_type} token for {client_ip[:8]}... (direct access)")
        
        return JSONResponse({
            "token": token,
            "expires_in": token_mgr.token_expiry_seconds,
            "test_type": test_type,
            "server_id": token_mgr.isp_id
        })
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Error generating test token: {e}")
        raise HTTPException(500, "Failed to generate test token")

@app.post("/api/request-token")
async def handle_central_token_request(request: Request):
    """Handle token requests from central server"""
    if not TOKEN_SYSTEM_AVAILABLE:
        raise HTTPException(503, "Token system not available")
    
    try:
        # TODO: Add central server authentication in Phase 2
        # For now, accept all requests for Phase 1 testing
        
        data = await request.json()
        client_ip = data.get("client_ip")
        test_type = data.get("test_type", "single_user")
        
        if not client_ip:
            raise HTTPException(400, "client_ip required")
        
        if test_type not in ['single_user', 'virtual_household']:
            raise HTTPException(400, "Invalid test_type")
        
        # Get token manager
        token_mgr = get_token_manager()
        
        # Check if user can test
        can_test, reason = token_mgr.can_user_test(client_ip, test_type)
        if not can_test:
            raise HTTPException(403, f"Access denied by ISP policy: {reason}")
        
        # Generate token
        token = token_mgr.issue_token(
            client_ip=client_ip,
            test_type=test_type,
            source="central"
        )
        
        logger.info(f"🎫 Issued {test_type} token for {client_ip[:8]}... (central server request)")
        
        return JSONResponse({
            "token": token,
            "expires_in": token_mgr.token_expiry_seconds,
            "test_type": test_type,
            "server_id": token_mgr.isp_id
        })
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Error handling central token request: {e}")
        raise HTTPException(500, "Failed to process token request")

@app.get("/api/token-stats")
async def get_token_stats():
    """Get token usage statistics (optional monitoring)"""
    if not TOKEN_SYSTEM_AVAILABLE:
        raise HTTPException(503, "Token system not available")
    
    try:
        token_mgr = get_token_manager()
        stats = token_mgr.get_stats()
        
        return JSONResponse({
            "success": True,
            "stats": stats,
            "timestamp": time.time()
        })
        
    except Exception as e:
        logger.error(f"❌ Error getting token stats: {e}")
        raise HTTPException(500, "Failed to get token statistics")

@app.delete("/api/revoke-token")
async def revoke_token(request: Request):
    """Revoke tokens for debugging/admin purposes"""
    if not TOKEN_SYSTEM_AVAILABLE:
        raise HTTPException(503, "Token system not available")
    
    try:
        data = await request.json()
        client_ip = data.get("client_ip")
        
        if not client_ip:
            raise HTTPException(400, "client_ip required")
        
        token_mgr = get_token_manager()
        revoked_count = token_mgr.revoke_tokens_for_ip(client_ip)
        
        return JSONResponse({
            "success": True,
            "revoked_count": revoked_count,
            "message": f"Revoked {revoked_count} tokens for {client_ip}"
        })
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Error revoking tokens: {e}")
        raise HTTPException(500, "Failed to revoke tokens")

# Note: get_client_ip function defined above

# Token validation middleware
async def require_valid_token(request: Request) -> dict:
    """Middleware to validate tokens on all test endpoints"""
    if not TOKEN_SYSTEM_AVAILABLE:
        raise HTTPException(503, "Token system not available")
    
    token = request.headers.get("X-Session-Token")
    client_ip = get_client_ip(request)
    
    if not token:
        raise HTTPException(401, "Test session token required. Please start a test to get a token.")
    
    token_mgr = get_token_manager()
    payload = token_mgr.validate_token(token, client_ip)
    
    if not payload:
        raise HTTPException(401, "Invalid or expired test session. Please start a new test.")
    
    return payload

@app.post("/api/telemetry")
async def submit_telemetry(request: Request):
    """Dual telemetry endpoint: local ISP storage + central ASN statistics"""
    try:
        # Get request data and client info
        data = await request.json()
        
        # Check if this is forwarded from central server
        if data.get('forwarded_from') == 'central_server':
            # Use the forwarded client IP and ASN info
            client_ip = data.get('client_ip', get_client_ip(request))
            user_agent = request.headers.get('user-agent', '')
            asn_info = data.get('asn_info', {})
            logger.info(f"📊 Telemetry forwarded from central server for {client_ip[:8]}... (ASN: {asn_info.get('asn', 'UNKNOWN')})")
        else:
            # Direct submission from client
            client_ip = get_client_ip(request)
            user_agent = request.headers.get('user-agent', '')
            asn_info = None
            logger.info(f"📊 Direct telemetry submission from {client_ip[:8]}...")
        
        # Step 1: Store locally with full IP (for ISP support)
        local_test_id = None
        if not IS_CENTRAL_SERVER:
            try:
                # Import enhanced telemetry for ISP servers
                try:
                    from .enhanced_telemetry import record_isp_test_result
                except ImportError:
                    from enhanced_telemetry import record_isp_test_result
                
                # Include ASN info if available (from central server forwarding)
                results_data = data.get('results', {})
                if asn_info:
                    results_data['asn_info'] = asn_info
                
                local_test_id = await record_isp_test_result(
                    results_data,
                    client_ip,
                    user_agent
                )
                logger.info(f"📊 Stored locally with IP for ISP support (ID: {local_test_id})")
            except Exception as e:
                logger.warning(f"Local ISP telemetry storage failed: {e}")
        
        # Step 2: Central server processing (with ASN lookup)
        central_test_id = None
        if IS_CENTRAL_SERVER and TELEMETRY_AVAILABLE:
            # On central server - check if this is from ISP server or direct client
            try:
                source_server = data.get('source_server', 'direct')
                pre_resolved_asn = data.get('asn')
                
                # Handle ISP server forwarding vs direct client submission
                if source_server == 'isp' and pre_resolved_asn:
                    # ISP server forwarded this with pre-resolved ASN
                    central_test_id = await telemetry_manager.record_test_result(
                        data.get('results', {}),
                        data.get('client_ip', client_ip),  # Use forwarded IP if available
                        True,  # telemetry_enabled
                        pre_resolved_asn,
                        source_server
                    )
                    logger.info(f"📊 Stored ISP-forwarded data with ASN {pre_resolved_asn} (ID: {central_test_id})")
                else:
                    # Direct client submission
                    central_test_id = await telemetry_manager.record_test_result(
                        data.get('results', {}),
                        client_ip,
                        True,  # telemetry_enabled
                        None,  # No pre-resolved ASN
                        'direct'
                    )
                    logger.info(f"📊 Stored direct client data with ASN lookup (ID: {central_test_id})")
                    
            except Exception as e:
                logger.error(f"Central telemetry storage failed: {e}")
        
        elif not IS_CENTRAL_SERVER:
            # On ISP server - forward to central with ASN lookup
            try:
                # Get ASN for this IP first
                asn_info = None
                if TELEMETRY_AVAILABLE:
                    asn_info = await telemetry_manager.get_asn(client_ip)
                
                # Forward to central server with IP + ASN + data
                import aiohttp
                central_payload = {
                    "telemetry_enabled": data.get("telemetry_enabled", True),
                    "results": data.get("results", {}),
                    "client_ip": client_ip,  # Send IP to central for ASN verification
                    "asn": asn_info,  # Pre-resolved ASN
                    "user_agent": user_agent,
                    "source_server": "isp"
                }
                
                async with aiohttp.ClientSession() as session:
                    response = await session.post(
                        'https://test.libreqos.com/api/telemetry',
                        json=central_payload,
                        timeout=aiohttp.ClientTimeout(total=10)
                    )
                    
                    if response.status == 200:
                        response_data = await response.json()
                        central_test_id = response_data.get("test_id")
                        logger.info(f"📊 Forwarded to central server (ID: {central_test_id})")
                    else:
                        logger.warning(f"Central server forward failed: HTTP {response.status}")
                        
            except Exception as e:
                logger.warning(f"Central telemetry forward failed (non-critical): {e}")
        
        # Return success with appropriate test ID
        return JSONResponse({
            "success": True,
            "test_id": central_test_id or local_test_id or f"fallback_{int(time.time())}",
            "local_id": local_test_id,
            "central_id": central_test_id,
            "message": "Test results processed successfully"
        })
        
    except Exception as e:
        logger.error(f"Error in telemetry processing: {e}")
        return JSONResponse({"error": str(e)}, status_code=500)

# Helper function for API key authentication
def verify_telemetry_auth(request: Request) -> bool:
    """Verify API key for telemetry endpoints"""
    try:
        try:
            from .enhanced_telemetry import isp_telemetry
        except ImportError:
            from enhanced_telemetry import isp_telemetry
        
        # Check Authorization header first
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            api_key = auth_header[7:]  # Remove "Bearer " prefix
            return isp_telemetry.verify_api_key(api_key)
        
        # Check X-API-Key header
        api_key = request.headers.get("X-API-Key")
        if api_key:
            return isp_telemetry.verify_api_key(api_key)
        
        # Check query parameter (less secure, but convenient)
        api_key = request.query_params.get("api_key")
        return isp_telemetry.verify_api_key(api_key)
    except ImportError:
        # Enhanced telemetry not available, disable auth requirement
        return True

# ISP Support Team Endpoints for Local Telemetry (Protected)
@app.get("/api/telemetry/recent")
async def get_recent_tests(request: Request, limit: int = 50):
    """Get recent test results for ISP support team (requires authentication)"""
    # Verify authentication
    if not verify_telemetry_auth(request):
        return JSONResponse(
            {"error": "Authentication required. Provide API key via Authorization header, X-API-Key header, or api_key parameter."}, 
            status_code=401
        )
    
    try:
        try:
            from .enhanced_telemetry import isp_telemetry
        except ImportError:
            from enhanced_telemetry import isp_telemetry
        
        results = isp_telemetry.get_recent_tests(client_ip=None, limit=limit)
        return JSONResponse({
            "success": True,
            "tests": results,
            "total": len(results),
            "limit": limit
        })
    except ImportError:
        return JSONResponse({"error": "Enhanced telemetry not available"}, status_code=503)
    except Exception as e:
        logger.error(f"Error getting recent tests: {e}")
        return JSONResponse({"error": str(e)}, status_code=500)

@app.get("/api/telemetry/customer/{client_ip}")
async def get_customer_tests(request: Request, client_ip: str, limit: int = 20):
    """Get test history for specific customer IP (for support correlation)"""
    # Verify authentication
    if not verify_telemetry_auth(request):
        return JSONResponse(
            {"error": "Authentication required. Provide API key via Authorization header, X-API-Key header, or api_key parameter."}, 
            status_code=401
        )
    
    try:
        try:
            from .enhanced_telemetry import isp_telemetry
        except ImportError:
            from enhanced_telemetry import isp_telemetry
        
        tests = isp_telemetry.get_recent_tests(client_ip=client_ip, limit=limit)
        return JSONResponse({
            "success": True,
            "client_ip": client_ip,
            "tests": tests,
            "total_tests": len(tests)
        })
    except ImportError:
        return JSONResponse({"error": "Enhanced telemetry not available"}, status_code=503)
    except Exception as e:
        logger.error(f"Error getting customer tests: {e}")
        return JSONResponse({"error": str(e)}, status_code=500)

@app.get("/api/telemetry/stats")
async def get_isp_telemetry_stats(request: Request):
    """Get ISP telemetry system statistics"""
    # Verify authentication
    if not verify_telemetry_auth(request):
        return JSONResponse(
            {"error": "Authentication required. Provide API key via Authorization header, X-API-Key header, or api_key parameter."}, 
            status_code=401
        )
    
    try:
        try:
            from .enhanced_telemetry import isp_telemetry
        except ImportError:
            from enhanced_telemetry import isp_telemetry
        
        stats = isp_telemetry.get_stats()
        return JSONResponse(stats)
    except ImportError:
        return JSONResponse({"error": "Enhanced telemetry not available"}, status_code=503)
    except Exception as e:
        logger.error(f"Error getting telemetry stats: {e}")
        return JSONResponse({"error": str(e)}, status_code=500)

@app.get("/api/sponsor/stats")
async def get_sponsor_stats(days: int = 30):
    """Get sponsor statistics dashboard data"""
    if not TELEMETRY_AVAILABLE:
        return JSONResponse({"error": "Telemetry not available"}, status_code=503)
    
    try:
        stats = await telemetry_manager.get_sponsor_stats(days)
        return JSONResponse(stats)
    except Exception as e:
        logger.error(f"Error getting sponsor stats: {e}")
        return JSONResponse({"error": str(e)}, status_code=500)


@app.get("/api/rate-limit-stats")
async def get_rate_limit_stats():
    """Get rate limiting statistics for monitoring"""
    try:
        stats = rate_limiter.get_stats()
        return JSONResponse(stats)
    except Exception as e:
        logger.error(f"Error getting rate limit stats: {e}")
        return JSONResponse({"error": str(e)}, status_code=500)

@app.get("/virtual-household/stats")
async def get_virtual_household_stats():
    """Get comprehensive virtual household statistics"""
    try:
        if SIMPLE_MULTIPROCESS_AVAILABLE and process_manager.is_running():
            # Get stats from simple multi-process system
            stats = process_manager.get_system_stats()
            
            # Add detailed process statistics
            process_stats = {}
            for user_type, health_info in stats['process_health'].items():
                if health_info['is_healthy']:
                    try:
                        # Get detailed stats from each process
                        import aiohttp
                        port = health_info['port']
                        
                        # Use HTTPS if SSL is enabled, otherwise HTTP
                        protocol = "https" if process_manager.ssl_enabled else "http"
                        
                        # Create SSL context for HTTPS requests
                        ssl_context = None
                        if process_manager.ssl_enabled:
                            import ssl
                            ssl_context = ssl.create_default_context()
                            ssl_context.check_hostname = False  # Allow localhost
                            ssl_context.verify_mode = ssl.CERT_NONE  # Skip cert verification
                        
                        connector = aiohttp.TCPConnector(ssl=ssl_context) if process_manager.ssl_enabled else None
                        
                        async with aiohttp.ClientSession(
                            timeout=aiohttp.ClientTimeout(total=2.0),
                            connector=connector
                        ) as session:
                            async with session.get(f"{protocol}://localhost:{port}/stats") as response:
                                if response.status == 200:
                                    process_data = await response.json()
                                    process_stats[user_type] = process_data
                                else:
                                    process_stats[user_type] = {"error": f"HTTP {response.status}"}
                    except Exception as e:
                        process_stats[user_type] = {"error": str(e)}
                else:
                    process_stats[user_type] = {"error": "Process unhealthy"}
            
            stats['detailed_process_stats'] = process_stats
            return JSONResponse(stats)
        else:
            return JSONResponse({
                "error": "Simple Multi-Process system not available",
                "architecture": "unavailable"
            }, status_code=503)
    except Exception as e:
        logger.error(f"❌ Error getting virtual household stats: {e}")
        return JSONResponse({"error": str(e)}, status_code=500)

@app.get("/virtual-household/process-health")
async def get_process_health():
    """Get health status of all user type processes"""
    try:
        if SIMPLE_MULTIPROCESS_AVAILABLE and process_manager.is_running():
            health = process_manager.get_process_health()
            return JSONResponse({
                "process_health": health,
                "architecture": "simple_multiprocess",
                "process_isolation": True,
                "total_processes": len(health),
                "healthy_processes": sum(1 for h in health.values() if h['is_healthy'])
            })
        else:
            return JSONResponse({
                "error": "Simple Multi-Process system not available",
                "architecture": "unavailable"
            }, status_code=503)
    except Exception as e:
        logger.error(f"❌ Error getting process health: {e}")
        return JSONResponse({"error": str(e)}, status_code=500)

@app.get("/virtual-household/profiles")
async def get_user_profiles():
    """Get available user profiles"""
    try:
        if SIMPLE_MULTIPROCESS_AVAILABLE:
            # Get profiles from the original session manager (for profile info)
            from server.websocket_virtual_household import session_manager
            
            profiles = {}
            for key, profile in session_manager.user_profiles.items():
                profiles[key] = {
                    'name': profile.name,
                    'download_mbps': profile.download_mbps,
                    'upload_mbps': profile.upload_mbps,
                    'description': profile.description,
                    'activity_type': profile.activity_type,
                    'dedicated_port': process_manager.user_ports.get(key),
                    'process_isolated': True
                }
            
            return JSONResponse({
                'profiles': profiles,
                'max_concurrent_users_per_type': 50,  # Increased due to process isolation
                'multiprocess_enabled': True,
                'process_isolation': True,
                'architecture': 'simple_multiprocess',
                'user_ports': process_manager.user_ports
            })
        else:
            return JSONResponse({
                "error": "Simple Multi-Process system not available",
                "architecture": "unavailable"
            }, status_code=503)
    except Exception as e:
        logger.error(f"❌ Error getting user profiles: {e}")
        return JSONResponse({"error": str(e)}, status_code=500)

@app.get("/virtual-household/health")
async def virtual_household_health():
    """Health check for virtual household service"""
    try:
        if SIMPLE_MULTIPROCESS_AVAILABLE and process_manager.is_running():
            # Get health from simple multi-process system
            system_stats = process_manager.get_system_stats()
            process_health = process_manager.get_process_health()
            
            # Determine overall health
            healthy_processes = sum(1 for health in process_health.values()
                                  if health.get('is_healthy', False))
            total_processes = len(process_health)
            overall_health = "healthy" if healthy_processes == total_processes else "degraded"
            
            return JSONResponse({
                "status": overall_health,
                "multiprocess_enabled": True,
                "process_isolation": True,
                "real_traffic_enabled": True,
                "fake_data": False,
                "active_processes": system_stats['active_processes'],
                "total_processes": system_stats['total_processes'],
                "supported_user_types": list(process_manager.user_ports.keys()),
                "process_health": process_health,
                "user_ports": process_manager.user_ports,
                "genuine_upload_traffic": True,
                "genuine_download_traffic": True,
                "real_time_measurement": True,
                "architecture": "simple_multiprocess",
                "max_throughput_optimization": True
            })
        else:
            return JSONResponse({
                "status": "unavailable",
                "error": "Simple Multi-Process system not available",
                "multiprocess_enabled": False,
                "architecture": "unavailable"
            }, status_code=503)
    except Exception as e:
        logger.error(f"❌ Error in health check: {e}")
        return JSONResponse({"error": str(e)}, status_code=500)

@app.get("/api/rate-limit-status")
async def rate_limit_status(request: Request):
    """Get rate limiting status and statistics"""
    if not RATE_LIMITING_AVAILABLE:
        return {"available": False, "message": "Rate limiting not available"}
    
    client_ip = get_client_ip(request)
    usage_stats = rate_limiter.get_usage_stats(client_ip)
    memory_stats = rate_limiter.get_memory_stats()
    
    return {
        "available": True,
        "client_ip": client_ip,
        "usage": usage_stats,
        "system": memory_stats,
        "limits": {
            "downloads_per_hour": rate_limiter.downloads_per_hour,
            "bandwidth_gb_per_hour": rate_limiter.bandwidth_gb_per_hour,
            "websocket_sessions": rate_limiter.websocket_sessions
        }
    }

# Rankings page route
@app.get("/rankings")
async def get_rankings_page():
    """Serve the ISP rankings page"""
    try:
        client_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "client")
        rankings_file = os.path.join(client_dir, "rankings.html")
        
        with open(rankings_file, 'r', encoding='utf-8') as f:
            content = f.read()
        
        return Response(content=content, media_type="text/html")
        
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Rankings page not found")
    except Exception as e:
        logger.error(f"Error serving rankings page: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

# Startup and shutdown events
@app.on_event("startup")
async def startup_event():
    """Initialize services on startup"""
    logger.info("🚀 Initializing LibreQoS services...")
    
    # Set up shared endpoints first
    logger.info("🚀 Setting up shared endpoints...")
    await setup_main_server_endpoints()
    
    # Mount static files AFTER API endpoints are registered to avoid conflicts
    client_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "client")
    app.mount("/", StaticFiles(directory=client_dir, html=True), name="client")
    logger.info("✅ Static files mounted at root path")
    
    # Initialize concurrent WebRTC processing
    # Removed obsolete WebRTC initialization - no longer used in simple multiprocess system
    logger.info("✅ Simple multiprocess system ready (no WebRTC initialization needed)")
    
    # Initialize Simple Multi-Process Virtual Household System
    if SIMPLE_MULTIPROCESS_AVAILABLE:
        try:
            # Configure SSL for process manager if we're running with HTTPS
            # This needs to happen before process detection
            import sys
            if '--ssl-keyfile' in sys.argv and '--ssl-certfile' in sys.argv:
                ssl_keyfile_idx = sys.argv.index('--ssl-keyfile') + 1
                ssl_certfile_idx = sys.argv.index('--ssl-certfile') + 1
                if ssl_keyfile_idx < len(sys.argv) and ssl_certfile_idx < len(sys.argv):
                    await configure_process_manager_ssl(sys.argv[ssl_keyfile_idx], sys.argv[ssl_certfile_idx])
            
            # Check if processes are already running (from standalone script)
            if process_manager.is_running():
                logger.info("✅ Simple Multi-Process Virtual Household System already running")
                logger.info("🎯 Process isolation enabled - each user type runs in dedicated process")
                logger.info(f"📋 User process ports: {process_manager.user_ports}")
            else:
                # Try to detect existing processes first
                logger.info("🔍 Checking for existing user processes...")
                detected = await process_manager.detect_existing_processes()
                
                if detected:
                    logger.info("✅ Detected existing Simple Multi-Process Virtual Household System")
                    logger.info("🎯 Process isolation enabled - each user type runs in dedicated process")
                    logger.info(f"📋 User process ports: {process_manager.user_ports}")
                else:
                    logger.info("� Starting Simple Multi-Process Virtual Household System...")
                    success = await process_manager.start_all_processes()
                    
                    if success:
                        logger.info("✅ Simple Multi-Process Virtual Household System started successfully")
                        logger.info("🎯 Process isolation enabled - each user type runs in dedicated process")
                        logger.info(f"📋 User process ports: {process_manager.user_ports}")
                    else:
                        logger.error("❌ Failed to start Simple Multi-Process Virtual Household System")
                
        except Exception as e:
            logger.error(f"❌ Error initializing Simple Multi-Process system: {e}")
            logger.error(f"🎯 Exception details: {type(e).__name__}: {str(e)}")
            import traceback
            logger.error(f"🎯 Traceback: {traceback.format_exc()}")
    else:
        logger.warning("⚠️ Simple Multi-Process Virtual Household System not available")
    
    # Log final configuration
    if SIMPLE_MULTIPROCESS_AVAILABLE and process_manager.is_running():
        logger.info("✅ LibreQoS started with SIMPLE MULTI-PROCESS Virtual Household")
        logger.info("🎯 Maximum throughput enabled with process isolation")
    else:
        logger.warning("⚠️ LibreQoS started WITHOUT Virtual Household (processes failed)")

@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup services on shutdown"""
    logger.info("🛑 Shutting down LibreQoS services...")
    
    # Cleanup Simple Multi-Process system
    if SIMPLE_MULTIPROCESS_AVAILABLE:
        logger.info("🛑 Shutting down Simple Multi-Process Virtual Household System...")
        await process_manager.stop_all_processes()
        logger.info("✅ Simple Multi-Process Virtual Household System stopped")
    
    # Cleanup concurrent WebRTC processing
    # Removed obsolete WebRTC cleanup - no longer used in simple multiprocess system
    logger.info("✅ Simple multiprocess system cleanup complete (no WebRTC cleanup needed)")
    
    logger.info("✅ LibreQoS shutdown complete")

# Create dedicated ping server app (isolated from main processing)
ping_app = FastAPI(
    title="LibreQoS Dedicated Ping Server",
    description="Isolated latency measurement server",
    version="1.0.0"
)

# Add CORS middleware to ping server - no restrictions
ping_app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@ping_app.get("/ping")
async def dedicated_ping(request: Request):
    """
    Ultra-lightweight ping endpoint optimized for minimal latency.
    This endpoint is isolated from upload/download processing to ensure
    accurate latency measurements during high-throughput tests.
    """
    # Check if this is a high priority request
    is_high_priority = request.headers.get("X-Priority") == "high"
    
    # Check if client is experiencing consecutive timeouts
    consecutive_timeouts = 0
    try:
        consecutive_timeouts = int(request.headers.get("X-Ping-Attempt", "0"))
    except ValueError:
        pass
    
    # Log excessive timeouts for monitoring
    if consecutive_timeouts > 5:
        logger.warning(f"Client experiencing {consecutive_timeouts} consecutive ping timeouts")
    
    # Minimal jitter to prevent synchronization issues
    jitter = 0.0005 * (0.5 + 0.5 * random.random())  # 0.25-0.5ms jitter
    await asyncio.sleep(jitter)
    
    return Response(
        content="pong",
        media_type="text/plain",
        headers={
            "Cache-Control": "no-store, no-cache, must-revalidate",
            "Pragma": "no-cache",
            "X-Ping-Server": "dedicated",
            "X-Priority-Processed": "true" if is_high_priority else "false",
            "X-Ping-Timeouts-Seen": str(consecutive_timeouts)
        }
    )

@ping_app.get("/health")
async def ping_health():
    """Health check endpoint for ping server"""
    return {"status": "healthy", "server": "ping-dedicated", "port": 8005}

@ping_app.get("/")
async def ping_root():
    """Root endpoint with ping server info"""
    return {
        "server": "LibreQoS Dedicated Ping Server",
        "purpose": "Isolated latency measurements",
        "port": 8005,
        "endpoints": {
            "/ping": "Latency measurement endpoint",
            "/health": "Health check",
        }
    }

async def run_ping_server(port=8005, ssl_keyfile=None, ssl_certfile=None):
    """Run the dedicated ping server with optional HTTPS support"""
    config_kwargs = {
        "app": ping_app,
        "host": "0.0.0.0",
        "port": port,
        "log_level": "warning",  # Reduce logging overhead
        "access_log": False,     # Disable access logs for performance
        "loop": "asyncio",       # Use asyncio event loop
    }
    
    # Add SSL configuration if certificates are provided
    if ssl_keyfile and ssl_certfile:
        config_kwargs["ssl_keyfile"] = ssl_keyfile
        config_kwargs["ssl_certfile"] = ssl_certfile
        logger.info(f"Starting dedicated ping server with HTTPS on port {port}")
    else:
        logger.info(f"Starting dedicated ping server with HTTP on port {port}")
    
    config = uvicorn.Config(**config_kwargs)
    server = uvicorn.Server(config)
    await server.serve()

async def configure_process_manager_ssl(ssl_keyfile=None, ssl_certfile=None):
    """Configure process manager with SSL parameters"""
    if SIMPLE_MULTIPROCESS_AVAILABLE and ssl_keyfile and ssl_certfile:
        process_manager.ssl_keyfile = ssl_keyfile
        process_manager.ssl_certfile = ssl_certfile
        process_manager.ssl_enabled = True
        logger.info("🔒 Process manager configured with SSL")

async def run_main_server(args):
    """Run the main server with appropriate configuration"""
    # Configure process manager with SSL parameters early
    await configure_process_manager_ssl(args.ssl_keyfile, args.ssl_certfile)
    
    if args.ssl_keyfile and args.ssl_certfile:
        # Run with HTTPS using Uvicorn
        logger.info(f"Starting HTTPS server on port {args.port}")
        config = uvicorn.Config(
            app,
            host="0.0.0.0",
            port=args.port,
            ssl_keyfile=args.ssl_keyfile,
            ssl_certfile=args.ssl_certfile,
            reload=not args.production  # Disable reloader in production
        )
        server = uvicorn.Server(config)
        await server.serve()
    else:
        # Run with HTTP
        logger.info(f"Starting HTTP server on port {args.port}")
        config = uvicorn.Config(
            app,
            host="0.0.0.0",
            port=args.port,
            reload=not args.production  # Disable reloader in production
        )
        server = uvicorn.Server(config)
        await server.serve()

async def run_both_servers(args):
    """Run both the main server and dedicated ping server concurrently"""
    logger.info("Starting LibreQoS Bufferbloat Test with dedicated ping server")
    logger.info(f"Main server: port {args.port}")
    logger.info("Ping server: port 8005 (isolated for accurate latency measurements)")
    
    # Run both servers concurrently
    # Pass SSL certificates to ping server if available
    await asyncio.gather(
        run_main_server(args),
        run_ping_server(8005, args.ssl_keyfile, args.ssl_certfile)
    )

if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="LibreQoS Bufferbloat Test Server")
    parser.add_argument("--port", type=int, default=80, help="Port to run the server on")
    parser.add_argument("--ssl-keyfile", type=str, help="SSL key file path for HTTPS")
    parser.add_argument("--ssl-certfile", type=str, help="SSL certificate file path for HTTPS")
    parser.add_argument("--production", action="store_true", help="Run in production mode (disables auto-reload)")
    args = parser.parse_args()
    
    # Run both servers
    asyncio.run(run_both_servers(args))
