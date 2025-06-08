import os
import asyncio
import uvicorn
from fastapi import FastAPI, Response, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
import random
import logging

# Import shared endpoint modules - Always use shared endpoints for consistency
from endpoints.download import create_download_endpoint, create_netflix_endpoint
from endpoints.upload import create_upload_endpoint
from endpoints.ping import create_ping_endpoint
from endpoints.warmup import router as warmup_router
SHARED_ENDPOINTS_AVAILABLE = True
# Removed obsolete webrtc_concurrent and websocket_bulk_download imports - no longer used in simple multiprocess system

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

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # For development - restrict in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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

# Add CORS middleware to ping server
ping_app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
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
    return {"status": "healthy", "server": "ping-dedicated", "port": 8085}

@ping_app.get("/")
async def ping_root():
    """Root endpoint with ping server info"""
    return {
        "server": "LibreQoS Dedicated Ping Server",
        "purpose": "Isolated latency measurements",
        "port": 8085,
        "endpoints": {
            "/ping": "Latency measurement endpoint",
            "/health": "Health check",
        }
    }

async def run_ping_server(port=8085, ssl_keyfile=None, ssl_certfile=None):
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
    logger.info("Ping server: port 8085 (isolated for accurate latency measurements)")
    
    # Run both servers concurrently
    # Pass SSL certificates to ping server if available
    await asyncio.gather(
        run_main_server(args),
        run_ping_server(8085, args.ssl_keyfile, args.ssl_certfile)
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