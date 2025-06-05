"""
Simple User Process Server - High Performance Single User Type Handler
====================================================================

Lightweight server that handles ONE user type only for maximum throughput.
Each process runs on a dedicated port with isolated WebSocket handling.

Key Features:
- Process isolation: No interference between user types
- Maximum throughput: Optimized for single user profile
- Simple architecture: No complex coordination needed
- Direct WebSocket handling: Minimal overhead
"""

import asyncio
import json
import logging
import time
import os
import sys
import signal
from typing import Dict, Optional
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

# Import the existing high-performance components
sys.path.append(os.path.dirname(__file__))
from websocket_virtual_household import (
    HighPerformanceSessionManager, 
    HighPerformanceDataPool,
    HighPerformanceTrafficGenerator,
    RealTrafficMeasurement,
    UserProfile
)

logger = logging.getLogger(__name__)

class SingleUserProcessServer:
    """High-performance server for a single user type"""
    
    def __init__(self, user_type: str, port: int):
        self.user_type = user_type.lower()
        self.port = port
        self.app = FastAPI(title=f"LibreQoS {user_type.title()} Process Server")
        
        # Configure CORS for maximum performance
        self.app.add_middleware(
            CORSMiddleware,
            allow_origins=["*"],
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )
        
        # Create optimized session manager for this user type only
        self.session_manager = self._create_optimized_session_manager()
        
        # Setup routes
        self._setup_routes()
        
        # Performance tracking
        self.stats = {
            'connections': 0,
            'total_bytes_sent': 0,
            'total_bytes_received': 0,
            'start_time': time.time()
        }
        
        logger.info(f"🚀 {user_type.title()} Process Server initialized on port {port}")
    
    def _create_optimized_session_manager(self) -> HighPerformanceSessionManager:
        """Create session manager optimized for single user type"""
        manager = HighPerformanceSessionManager()
        
        # Verify this user type exists but keep all profiles for proper fallback handling
        if self.user_type in manager.user_profiles:
            target_profile = manager.user_profiles[self.user_type]
            logger.info(f"✅ Optimized for {self.user_type}: {target_profile.name}")
        else:
            logger.error(f"❌ User type '{self.user_type}' not found in profiles")
            raise ValueError(f"Unknown user type: {self.user_type}")
        
        # Optimize for single user type - increase capacity since no interference
        manager.max_users = 50  # Increased from 30 since we have process isolation
        
        # Optimize update interval for this specific user type
        if target_profile.download_mbps >= 25.0:  # High throughput users (Jake, Computer)
            manager.update_interval = 0.1  # 100ms for high-speed users
        else:  # Lower throughput users (Alex, Sarah)
            manager.update_interval = 0.25  # 250ms for steady users
        
        logger.info(f"🔧 Optimized settings: max_users={manager.max_users}, "
                   f"update_interval={manager.update_interval}s")
        
        return manager
    
    def _setup_routes(self):
        """Setup FastAPI routes for maximum performance"""
        
        @self.app.websocket(f"/ws/virtual-household/{self.user_type}")
        async def websocket_user_endpoint(websocket: WebSocket):
            """High-performance WebSocket endpoint for this user type only"""
            user_id = f"{self.user_type}_{int(time.time() * 1000)}"  # Unique ID
            logger.info(f"🔌 {self.user_type.title()} WebSocket connection: {user_id}")
            
            try:
                # Start session with optimized manager
                if not await self.session_manager.start_session(user_id, websocket):
                    await websocket.close(code=1013, reason="Server capacity exceeded")
                    return
                
                self.stats['connections'] += 1
                logger.info(f"✅ {self.user_type.title()} session started: {user_id}")
                
                # High-performance message handling loop
                await self._handle_websocket_messages(websocket, user_id)
                
            except Exception as e:
                logger.error(f"❌ {self.user_type.title()} WebSocket error for {user_id}: {e}")
            finally:
                # Cleanup
                await self.session_manager.stop_session(user_id)
                logger.info(f"🧹 {self.user_type.title()} session cleaned up: {user_id}")
        
        # CRITICAL FIX: Add HTTP endpoint blocker to prevent redirect requests from creating sessions
        @self.app.get("/ws/virtual-household/{user_id}")
        async def block_http_redirect_requests(user_id: str):
            """Block HTTP requests that should only be handled by main server"""
            logger.warning(f"🚫 {self.user_type.title()} process rejecting HTTP redirect request for {user_id}")
            logger.warning(f"🚫 HTTP redirect requests should only go to main server (port 8000)")
            return {
                "error": "HTTP redirect requests not supported on dedicated processes",
                "message": f"This is the {self.user_type} dedicated process. HTTP redirects should go to main server.",
                "user_type": self.user_type,
                "port": self.port,
                "redirect_to": "http://localhost:8000/ws/virtual-household/" + user_id
            }, 400
        
        # REMOVED: Generic endpoint that was creating orphaned sessions
        # The dedicated process should ONLY handle its specific user type
        # Generic user_id routing should be handled by the main server
        
        @self.app.get("/health")
        async def health_check():
            """Health check endpoint"""
            active_sessions = len([s for s in self.session_manager.sessions.values() if s.active])
            uptime = time.time() - self.stats['start_time']
            
            return {
                "status": "healthy",
                "user_type": self.user_type,
                "port": self.port,
                "active_sessions": active_sessions,
                "max_capacity": self.session_manager.max_users,
                "uptime_seconds": round(uptime, 1),
                "total_connections": self.stats['connections'],
                "process_isolation": True,
                "optimized_for": self.session_manager.user_profiles[self.user_type].name
            }
        
        @self.app.get("/stats")
        async def get_stats():
            """Detailed statistics for this user type process"""
            stats = self.session_manager.get_system_stats()
            
            # Add session details
            session_details = {}
            for user_id, session in self.session_manager.sessions.items():
                metrics = self.session_manager.measurement.get_session_metrics(session)
                session_details[user_id] = metrics
            
            stats['sessions'] = session_details
            stats['process_stats'] = self.stats
            stats['user_type'] = self.user_type
            stats['port'] = self.port
            
            return stats
        
        @self.app.post("/update-profile")
        async def update_profile(request_data: dict):
            """Update user profile for this process (inter-process communication)"""
            try:
                logger.info(f"🔧 ADAPTIVE: {self.user_type.title()} process received profile update: {request_data}")
                
                # Only allow updates for this process's user type
                target_user_type = request_data.get('user_type', '').lower()
                if target_user_type != self.user_type:
                    logger.warning(f"❌ ADAPTIVE: Profile update rejected - target: {target_user_type}, process: {self.user_type}")
                    return {"error": f"This process handles {self.user_type}, not {target_user_type}"}, 400
                
                # Extract profile updates
                profile_updates = request_data.get('profile_updates', {})
                if not profile_updates:
                    return {"error": "No profile_updates provided"}, 400
                
                # Update the profile in this process's session manager
                if self.user_type in self.session_manager.user_profiles:
                    profile = self.session_manager.user_profiles[self.user_type]
                    
                    # Apply updates
                    for key, value in profile_updates.items():
                        if hasattr(profile, key):
                            old_value = getattr(profile, key)
                            setattr(profile, key, value)
                            logger.info(f"🔧 ADAPTIVE: Updated {self.user_type} profile.{key}: {old_value} -> {value}")
                    
                    # Update any active sessions with new profile
                    updated_sessions = 0
                    for user_id, session in self.session_manager.sessions.items():
                        if user_id.startswith(f'{self.user_type}_') and session.active:
                            # Update session profile
                            for key, value in profile_updates.items():
                                if hasattr(session.profile, key):
                                    setattr(session.profile, key, value)
                            updated_sessions += 1
                            logger.info(f"🔧 ADAPTIVE: Updated active session {user_id} profile")
                    
                    return {
                        "success": True,
                        "message": f"{self.user_type.title()} profile updated successfully",
                        "user_type": self.user_type,
                        "updated_sessions": updated_sessions,
                        "profile_updates": profile_updates
                    }
                else:
                    return {"error": f"Profile for {self.user_type} not found"}, 500
                    
            except Exception as e:
                logger.error(f"❌ ADAPTIVE: Error updating {self.user_type} profile: {e}")
                return {"error": str(e)}, 500
        
        @self.app.post("/stop-session")
        async def stop_session_endpoint(request_data: dict):
            """Stop a specific session on this process"""
            try:
                session_id = request_data.get('session_id')
                user_type = request_data.get('user_type', '').lower()
                action = request_data.get('action')
                reason = request_data.get('reason', 'client_request')
                
                logger.info(f"🛑 {self.user_type.title()} process received stop request for session: {session_id}")
                
                # Verify this is for our user type
                if user_type != self.user_type:
                    logger.warning(f"🛑 Stop request rejected - target: {user_type}, process: {self.user_type}")
                    return {"error": f"This process handles {self.user_type}, not {user_type}"}, 400
                
                # Find and stop the session
                stopped_sessions = []
                for user_id, session in list(self.session_manager.sessions.items()):
                    if session_id in user_id or user_id == session_id:
                        logger.info(f"🛑 {self.user_type.title()} stopping session: {user_id}")
                        session.active = False
                        await self.session_manager.stop_session(user_id)
                        stopped_sessions.append(user_id)
                
                if stopped_sessions:
                    logger.info(f"✅ {self.user_type.title()} stopped {len(stopped_sessions)} sessions")
                    return {
                        "success": True,
                        "message": f"Stopped {len(stopped_sessions)} sessions",
                        "stopped_sessions": stopped_sessions,
                        "user_type": self.user_type,
                        "reason": reason
                    }
                else:
                    logger.warning(f"⚠️ {self.user_type.title()} no matching sessions found for: {session_id}")
                    return {
                        "success": False,
                        "message": "No matching sessions found",
                        "session_id": session_id,
                        "user_type": self.user_type,
                        "active_sessions": list(self.session_manager.sessions.keys())
                    }
                    
            except Exception as e:
                logger.error(f"❌ {self.user_type.title()} error stopping session: {e}")
                return {"error": str(e)}, 500
    
    async def _handle_websocket_messages(self, websocket: WebSocket, user_id: str):
        """High-performance WebSocket message handling"""
        message_count = 0
        
        while user_id in self.session_manager.sessions:
            try:
                message_count += 1
                
                # Check connection state
                from starlette.websockets import WebSocketState
                if websocket.client_state != WebSocketState.CONNECTED:
                    logger.info(f"📡 {self.user_type.title()} WebSocket disconnected: {user_id}")
                    break
                
                # Receive message with timeout for responsiveness
                try:
                    raw_message = await asyncio.wait_for(websocket.receive(), timeout=1.0)
                except asyncio.TimeoutError:
                    continue  # Keep connection alive, check for new messages
                
                # Process message types
                if raw_message["type"] == "websocket.receive":
                    if "text" in raw_message:
                        # Handle JSON control messages
                        try:
                            data = json.loads(raw_message["text"])
                            await self._handle_control_message(user_id, data, websocket)
                        except json.JSONDecodeError:
                            logger.debug(f"📨 Non-JSON text from {user_id}")
                    
                    elif "bytes" in raw_message:
                        # Handle binary upload data
                        binary_data = raw_message["bytes"]
                        data_size = len(binary_data)
                        await self.session_manager.handle_upload_data(user_id, data_size)
                        self.stats['total_bytes_received'] += data_size
                        logger.debug(f"📥 {data_size} bytes from {user_id}")
                
                elif raw_message["type"] == "websocket.disconnect":
                    logger.info(f"📡 {self.user_type.title()} disconnect message: {user_id}")
                    break
                
            except (WebSocketDisconnect, ConnectionError):
                logger.info(f"📡 {self.user_type.title()} connection closed: {user_id}")
                break
            except Exception as e:
                logger.warning(f"⚠️ {self.user_type.title()} message error for {user_id}: {e}")
                if "Cannot call 'receive'" in str(e):
                    break
                await asyncio.sleep(0.01)  # Brief pause on error
    
    async def _handle_control_message(self, user_id: str, data: dict, websocket: WebSocket):
        """Handle control messages efficiently"""
        message_type = data.get('type')
        
        if message_type == 'real_upload_data' or message_type == 'bulk_upload_data':
            data_size = data.get('size', 0)
            await self.session_manager.handle_upload_data(user_id, data_size)
            self.stats['total_bytes_received'] += data_size
            
        elif message_type == 'client_confirmation':
            received_bytes = data.get('received_bytes', 0)
            sent_bytes = data.get('sent_bytes', 0)
            await self.session_manager.handle_client_confirmation(user_id, received_bytes, sent_bytes)
            
        elif message_type == 'stop_test':
            # Handle stop test signal from client
            logger.info(f"🛑 {self.user_type.title()} received stop_test signal for {user_id}")
            if user_id in self.session_manager.sessions:
                session = self.session_manager.sessions[user_id]
                session.active = False
                logger.info(f"🛑 {self.user_type.title()} marked session {user_id} as inactive")
                
                # Send acknowledgment back to client
                stop_ack = {
                    'type': 'stop_test_ack',
                    'user_id': user_id,
                    'timestamp': time.time() * 1000,
                    'message': 'Traffic generation stopped'
                }
                from starlette.websockets import WebSocketState
                if websocket.client_state == WebSocketState.CONNECTED:
                    await websocket.send_text(json.dumps(stop_ack))
                    logger.info(f"🛑 {self.user_type.title()} sent stop acknowledgment to {user_id}")
            else:
                logger.warning(f"🛑 {self.user_type.title()} received stop_test for unknown session: {user_id}")
            
        elif message_type == 'ping':
            # Fast pong response
            pong_response = {
                'type': 'pong',
                'user_id': user_id,
                'sequence': data.get('sequence', 0),
                'timestamp': data.get('timestamp', time.time() * 1000),
                'server_timestamp': time.time() * 1000,
                'server_time': time.time()
            }
            from starlette.websockets import WebSocketState
            if websocket.client_state == WebSocketState.CONNECTED:
                await websocket.send_text(json.dumps(pong_response))
                
        elif message_type == 'pong':
            await self.session_manager.handle_pong(user_id, data)
    
    async def start(self, ssl_keyfile=None, ssl_certfile=None):
        """Start the user process server with optional SSL support"""
        if ssl_keyfile and ssl_certfile:
            logger.info(f"🔒 Starting {self.user_type.title()} Process Server with HTTPS on port {self.port}")
        else:
            logger.info(f"🚀 Starting {self.user_type.title()} Process Server on port {self.port}")
        
        config_kwargs = {
            "app": self.app,
            "host": "0.0.0.0",
            "port": self.port,
            "log_level": "warning",  # Reduce logging overhead for performance
            "access_log": False,     # Disable access logs for maximum performance
            "loop": "asyncio"        # Use asyncio for best WebSocket performance
        }
        
        # Add SSL configuration if certificates are provided
        if ssl_keyfile and ssl_certfile:
            config_kwargs["ssl_keyfile"] = ssl_keyfile
            config_kwargs["ssl_certfile"] = ssl_certfile
            logger.info(f"🔒 {self.user_type.title()} Process Server using SSL certificates")
        
        config = uvicorn.Config(**config_kwargs)
        server = uvicorn.Server(config)
        await server.serve()

def create_user_process_server(user_type: str, port: int) -> SingleUserProcessServer:
    """Factory function to create user process server"""
    return SingleUserProcessServer(user_type, port)

async def run_user_process(user_type: str, port: int, ssl_keyfile=None, ssl_certfile=None):
    """Run a user process server (entry point for multiprocessing)"""
    # Set up logging for this process
    logging.basicConfig(
        level=logging.INFO,
        format=f'%(asctime)s - {user_type.upper()}:{port} - %(name)s - %(levelname)s - %(message)s'
    )
    
    if ssl_keyfile and ssl_certfile:
        logger.info(f"🔒 Starting {user_type.title()} process with HTTPS on port {port}")
    else:
        logger.info(f"🎯 Starting {user_type.title()} process on port {port}")
    
    # Create and start server
    server = create_user_process_server(user_type, port)
    
    # Set up signal handlers for graceful shutdown
    def signal_handler(signum, frame):
        logger.info(f"🛑 {user_type.title()} process received signal {signum}, shutting down...")
        # The server will handle graceful shutdown
        
    signal.signal(signal.SIGTERM, signal_handler)
    signal.signal(signal.SIGINT, signal_handler)
    
    try:
        await server.start(ssl_keyfile=ssl_keyfile, ssl_certfile=ssl_certfile)
    except KeyboardInterrupt:
        logger.info(f"🛑 {user_type.title()} process interrupted")
    except Exception as e:
        logger.error(f"❌ {user_type.title()} process error: {e}")
        raise
    finally:
        logger.info(f"✅ {user_type.title()} process shutdown complete")

if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="LibreQoS Simple User Process Server")
    parser.add_argument("user_type", choices=['jake', 'alex', 'sarah', 'computer'],
                       help="User type for this process")
    parser.add_argument("port", type=int, help="Port to run this process on")
    parser.add_argument("--ssl-keyfile", type=str, help="SSL key file path for HTTPS")
    parser.add_argument("--ssl-certfile", type=str, help="SSL certificate file path for HTTPS")
    
    args = parser.parse_args()
    
    # Run the user process
    asyncio.run(run_user_process(args.user_type, args.port, args.ssl_keyfile, args.ssl_certfile))