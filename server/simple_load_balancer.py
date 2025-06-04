"""
Simple Load Balancer for Multiprocess Virtual Household
Routes user connections to appropriate user type processes
"""

import asyncio
import json
import logging
import multiprocessing
import os
import signal
import subprocess
import sys
import time
import uuid
from typing import Dict, Optional, List, Any
from fastapi import WebSocket, WebSocketDisconnect
from starlette.websockets import WebSocketState

from simple_config import simple_config
from simple_shared_state import shared_state, ProcessHealth

logger = logging.getLogger(__name__)

class ProcessManager:
    """Manages user type processes"""
    
    def __init__(self):
        self.processes: Dict[str, subprocess.Popen] = {}  # user_type -> process
        self.process_queues: Dict[str, multiprocessing.Queue] = {}  # user_type -> queue
        self.running = False
        
    def start_user_type_process(self, user_type: str) -> bool:
        """Start a user type worker server process"""
        try:
            if user_type in self.processes:
                logger.warning(f"⚠️ {user_type} worker already running")
                return True
            
            # Get port for this user type
            config = simple_config.get_user_type_config(user_type)
            port = config['port']
            
            # Start worker server subprocess
            cmd = [sys.executable, "worker_server.py", user_type]
            process = subprocess.Popen(
                cmd,
                cwd=os.path.dirname(__file__),
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE
            )
            
            self.processes[user_type] = process
            logger.info(f"🚀 Started {user_type} worker server on port {port} (PID: {process.pid})")
            return True
            
        except Exception as e:
            logger.error(f"❌ Error starting {user_type} worker server: {e}")
            return False
    
    def stop_user_type_process(self, user_type: str) -> bool:
        """Stop a user type process"""
        try:
            if user_type not in self.processes:
                return True
            
            process = self.processes[user_type]
            
            # Send SIGTERM
            process.terminate()
            
            # Wait for graceful shutdown
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                # Force kill if not responding
                process.kill()
                process.wait()
            
            del self.processes[user_type]
            logger.info(f"🛑 Stopped {user_type} process")
            return True
            
        except Exception as e:
            logger.error(f"❌ Error stopping {user_type} process: {e}")
            return False
    
    def start_all_processes(self) -> bool:
        """Start all user type processes"""
        success = True
        for user_type in simple_config.get_supported_user_types():
            if not self.start_user_type_process(user_type):
                success = False
        return success
    
    def stop_all_processes(self):
        """Stop all user type processes"""
        for user_type in list(self.processes.keys()):
            self.stop_user_type_process(user_type)
    
    def is_process_healthy(self, user_type: str) -> bool:
        """Check if a user type process is healthy"""
        if user_type not in self.processes:
            logger.debug(f"🔍 HEALTH: {user_type} not in processes")
            return False
        
        process = self.processes[user_type]
        if process.poll() is not None:
            # Process has terminated
            logger.debug(f"🔍 HEALTH: {user_type} process has terminated (poll: {process.poll()})")
            return False
        
        # Check health from shared state - be more tolerant of health check delays
        process_id = f"{user_type}_worker_{process.pid}"
        health = shared_state.get_process_health(process_id)
        
        if health:
            # Allow up to 60 seconds for health updates (more tolerant)
            time_since_heartbeat = time.time() - health.last_heartbeat
            is_healthy = health.status == 'healthy' and time_since_heartbeat < 60
            logger.debug(f"🔍 HEALTH: {user_type} health data found - "
                        f"Status: {health.status}, "
                        f"Heartbeat age: {time_since_heartbeat:.1f}s, "
                        f"Healthy: {is_healthy}")
            return is_healthy
        else:
            # If no health data yet, assume healthy for new processes (grace period)
            logger.debug(f"🔍 HEALTH: {user_type} no health data found for process_id: {process_id} - assuming healthy")
            return True
    
    def restart_process_if_needed(self, user_type: str) -> bool:
        """Restart process if it's unhealthy"""
        if not self.is_process_healthy(user_type):
            # TEMPORARY: Log health check details instead of restarting
            process = self.processes.get(user_type)
            if process:
                process_id = f"{user_type}_worker_{process.pid}"
                health = shared_state.get_process_health(process_id)
                logger.warning(f"🔍 HEALTH DEBUG: {user_type} process unhealthy - "
                             f"PID: {process.pid}, "
                             f"Poll: {process.poll()}, "
                             f"Health data: {health.__dict__ if health else 'None'}, "
                             f"Process ID: {process_id}")
                
                # Check if process is actually running
                if process.poll() is None:
                    logger.warning(f"🔍 HEALTH DEBUG: {user_type} process is still running but marked unhealthy - NOT restarting")
                    return True
                else:
                    logger.warning(f"🔍 HEALTH DEBUG: {user_type} process has actually terminated - restarting")
            
            logger.warning(f"⚠️ {user_type} process unhealthy, restarting...")
            self.stop_user_type_process(user_type)
            return self.start_user_type_process(user_type)
        return True

class SimpleLoadBalancer:
    """Simple load balancer routing by user type"""
    
    def __init__(self):
        self.process_manager = ProcessManager()
        self.active_connections: Dict[str, Dict[str, WebSocket]] = {}  # test_id -> {user_type -> websocket}
        self.connection_handlers: Dict[str, asyncio.Task] = {}  # connection_id -> handler task
        self.running = False
        self.health_monitor_task: Optional[asyncio.Task] = None
        
    async def start(self):
        """Start the load balancer"""
        try:
            if not simple_config.enable_multiprocess:
                logger.info("🔄 Multiprocess mode disabled, using single process")
                return True
            
            self.running = True
            
            # Start user type processes
            if not self.process_manager.start_all_processes():
                logger.error("❌ Failed to start all user type processes")
                return False
            
            # Start health monitoring
            self.health_monitor_task = asyncio.create_task(self.health_monitoring_loop())
            
            logger.info("🚀 Simple load balancer started")
            return True
            
        except Exception as e:
            logger.error(f"❌ Error starting load balancer: {e}")
            return False
    
    async def stop(self):
        """Stop the load balancer"""
        try:
            self.running = False
            
            # Stop health monitoring
            if self.health_monitor_task and not self.health_monitor_task.done():
                self.health_monitor_task.cancel()
                try:
                    await self.health_monitor_task
                except asyncio.CancelledError:
                    pass
            
            # Stop all connection handlers
            for task in self.connection_handlers.values():
                if not task.done():
                    task.cancel()
            
            # Wait for handlers to complete
            if self.connection_handlers:
                await asyncio.gather(*self.connection_handlers.values(), return_exceptions=True)
            
            # Stop user type processes
            self.process_manager.stop_all_processes()
            
            logger.info("🛑 Simple load balancer stopped")
            
        except Exception as e:
            logger.error(f"❌ Error stopping load balancer: {e}")
    
    def generate_test_id(self) -> str:
        """Generate unique test ID"""
        return f"test_{int(time.time())}_{uuid.uuid4().hex[:8]}"
    
    def extract_test_id_from_headers(self, websocket: WebSocket) -> str:
        """Extract test ID from WebSocket headers or generate new one"""
        # Try to get test ID from headers
        test_id = websocket.headers.get('x-test-id')
        if not test_id:
            # Generate new test ID
            test_id = self.generate_test_id()
        
        return test_id
    
    async def route_user_connection(self, user_id: str, websocket: WebSocket) -> bool:
        """Route user connection to appropriate user type process (in-process multiprocess system)"""
        try:
            # Validate user type
            if user_id not in simple_config.get_supported_user_types():
                logger.error(f"❌ Unsupported user type: {user_id}")
                await websocket.close(code=1003, reason="Unsupported user type")
                return False
            
            # Check if multiprocess mode is enabled
            if not simple_config.enable_multiprocess:
                # Fall back to single process mode
                return await self.handle_single_process_connection(user_id, websocket)
            
            # Check if user type worker is healthy
            if not self.process_manager.is_process_healthy(user_id):
                logger.warning(f"⚠️ {user_id} worker unhealthy, attempting restart")
                if not self.process_manager.restart_process_if_needed(user_id):
                    logger.error(f"❌ Failed to restart {user_id} worker")
                    await websocket.close(code=1011, reason="Service unavailable")
                    return False
            
            # Use in-process user type system instead of port redirects
            return await self.handle_in_process_connection(user_id, websocket)
            
        except Exception as e:
            logger.error(f"❌ Error routing user connection: {e}")
            try:
                await websocket.close(code=1011, reason="Internal error")
            except:
                pass
            return False
    
    async def handle_in_process_connection(self, user_id: str, websocket: WebSocket) -> bool:
        """Handle connection using in-process user type system"""
        try:
            # Generate test ID for this connection
            test_id = self.generate_test_id()
            
            # Register test in shared state
            shared_state.register_test(test_id)
            logger.info(f"📝 Registered new test instance: {test_id}")
            
            # Get the user type process for this user type
            # Import here to avoid circular imports
            from user_type_process import UserTypeProcess
            
            # Create or get existing user type process
            if not hasattr(self, 'user_type_processes'):
                self.user_type_processes = {}
            
            if user_id not in self.user_type_processes:
                # Create new user type process
                process = UserTypeProcess(user_id)
                await process.start_process()
                self.user_type_processes[user_id] = process
                logger.info(f"🏭 Created new {user_id} process")
            
            process = self.user_type_processes[user_id]
            
            # Handle the connection through the user type process
            success = await process.handle_user_connection(test_id, websocket)
            
            if not success:
                shared_state.unregister_test(test_id)
                logger.error(f"❌ Failed to handle connection for {user_id} in test {test_id}")
                return False
            
            logger.info(f"✅ Successfully handled {user_id} connection in test {test_id}")
            return True
            
        except Exception as e:
            logger.error(f"❌ Error in in-process connection for {user_id}: {e}")
            return False

    async def handle_single_process_connection(self, user_id: str, websocket: WebSocket) -> bool:
        """Handle connection in single process mode (fallback)"""
        try:
            # Import the original session manager
            from websocket_virtual_household import session_manager
            
            # Use the original single process implementation
            return await session_manager.start_session(user_id, websocket)
            
        except Exception as e:
            logger.error(f"❌ Error in single process connection: {e}")
            return False
    
    async def health_monitoring_loop(self):
        """Monitor health of user type processes"""
        try:
            while self.running:
                # Check health of all processes
                for user_type in simple_config.get_supported_user_types():
                    self.process_manager.restart_process_if_needed(user_type)
                
                # Clean up old data
                shared_state.cleanup_old_data()
                
                await asyncio.sleep(simple_config.health_check_interval)
                
        except Exception as e:
            logger.error(f"❌ Health monitoring error: {e}")
    
    def get_system_stats(self) -> Dict[str, Any]:
        """Get comprehensive system statistics"""
        try:
            # Get basic stats from shared state
            system_stats = shared_state.get_system_stats()
            
            # Add process manager stats
            process_stats = {}
            for user_type in simple_config.get_supported_user_types():
                is_healthy = self.process_manager.is_process_healthy(user_type)
                process_stats[user_type] = {
                    'running': user_type in self.process_manager.processes,
                    'healthy': is_healthy,
                    'pid': self.process_manager.processes[user_type].pid if user_type in self.process_manager.processes else None
                }
            
            # Add connection stats
            active_tests = len(self.active_connections)
            total_connections = sum(len(users) for users in self.active_connections.values())
            
            return {
                **system_stats,
                'multiprocess_enabled': simple_config.enable_multiprocess,
                'process_stats': process_stats,
                'active_tests': active_tests,
                'total_connections': total_connections,
                'load_balancer_running': self.running
            }
            
        except Exception as e:
            logger.error(f"❌ Error getting system stats: {e}")
            return {'error': str(e)}
    
    def get_process_health(self) -> Dict[str, Any]:
        """Get health status of all processes"""
        try:
            health_data = {}
            
            for user_type in simple_config.get_supported_user_types():
                process_id = f"{user_type}_process"
                if user_type in self.process_manager.processes:
                    process_id += f"_{self.process_manager.processes[user_type].pid}"
                
                health = shared_state.get_process_health(process_id)
                health_data[user_type] = {
                    'process_running': user_type in self.process_manager.processes,
                    'health_data': health.__dict__ if health else None,
                    'is_healthy': self.process_manager.is_process_healthy(user_type)
                }
            
            return health_data
            
        except Exception as e:
            logger.error(f"❌ Error getting process health: {e}")
            return {'error': str(e)}

# Global load balancer instance
load_balancer = SimpleLoadBalancer()

async def start_load_balancer():
    """Start the load balancer"""
    return await load_balancer.start()

async def stop_load_balancer():
    """Stop the load balancer"""
    await load_balancer.stop()

def setup_signal_handlers():
    """Set up signal handlers for graceful shutdown"""
    def signal_handler(signum, frame):
        logger.info(f"🛑 Received signal {signum}, shutting down load balancer")
        asyncio.create_task(stop_load_balancer())
    
    signal.signal(signal.SIGTERM, signal_handler)
    signal.signal(signal.SIGINT, signal_handler)