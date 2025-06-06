"""
Simple Process Manager - High Performance Multi-Process Orchestration
===================================================================

Spawns and manages one process per user type for maximum throughput.
No complex coordination - just simple process lifecycle management.

Key Features:
- Process isolation: Each user type in separate process
- Health monitoring: Auto-restart failed processes
- Maximum throughput: Optimized process allocation
- Simple management: No complex message passing
"""

import asyncio
import logging
import multiprocessing
import time
import signal
import os
import sys
from typing import Dict, Optional, Tuple
from dataclasses import dataclass
import psutil

logger = logging.getLogger(__name__)

@dataclass
class ProcessInfo:
    """Information about a user process"""
    user_type: str
    port: int
    process: Optional[multiprocessing.Process] = None
    start_time: float = 0.0
    restart_count: int = 0
    last_health_check: float = 0.0
    is_healthy: bool = False

class SimpleProcessManager:
    """High-performance process manager for user type isolation"""
    
    def __init__(self, ssl_keyfile=None, ssl_certfile=None):
        # User type to port mapping - optimized for no conflicts
        self.user_ports = {
            'jake': 8001,      # Netflix streaming - high throughput
            'alex': 8002,      # Gaming - low latency priority
            'sarah': 8003,     # Video calls - bidirectional
            'computer': 8004   # Bulk downloads - maximum throughput
        }
        
        # SSL configuration
        self.ssl_keyfile = ssl_keyfile
        self.ssl_certfile = ssl_certfile
        self.ssl_enabled = bool(ssl_keyfile and ssl_certfile)
        
        # Process tracking
        self.processes: Dict[str, ProcessInfo] = {}
        
        # Configuration
        self.health_check_interval = 5.0  # Check every 5 seconds
        self.max_restart_attempts = 3
        self.restart_delay = 2.0  # Wait 2 seconds before restart
        
        # Control flags
        self.running = False
        self.health_monitor_task: Optional[asyncio.Task] = None
        
        # Performance tracking
        self.stats = {
            'total_processes_started': 0,
            'total_restarts': 0,
            'start_time': time.time()
        }
        
        if self.ssl_enabled:
            logger.info("🔒 Simple Process Manager initialized with SSL support")
        else:
            logger.info("🎯 Simple Process Manager initialized")
        logger.info(f"📋 User port mapping: {self.user_ports}")
    
    async def detect_existing_processes(self) -> bool:
        """Detect and register existing processes that are already running"""
        logger.info("🔍 Detecting existing user processes...")
        
        detected_count = 0
        for user_type, port in self.user_ports.items():
            # Check if process is responding on this port
            if await self._check_process_http_health(user_type, port):
                logger.info(f"✅ Detected existing {user_type} process on port {port}")
                
                # Create a placeholder ProcessInfo for the detected process
                self.processes[user_type] = ProcessInfo(
                    user_type=user_type,
                    port=port,
                    process=None,  # We don't have the actual process object
                    start_time=time.time(),  # Use current time as start time
                    is_healthy=True
                )
                detected_count += 1
            else:
                logger.debug(f"No {user_type} process detected on port {port}")
        
        if detected_count > 0:
            logger.info(f"✅ Detected {detected_count} existing processes")
            self.running = True
            
            # Start health monitoring for detected processes
            self.health_monitor_task = asyncio.create_task(self._health_monitor_loop())
            return True
        else:
            logger.info("No existing processes detected")
            return False
    
    async def start_all_processes(self) -> bool:
        """Start all user type processes for maximum throughput"""
        logger.info("🚀 Starting all user type processes...")
        
        success_count = 0
        for user_type, port in self.user_ports.items():
            if await self._start_user_process(user_type, port):
                success_count += 1
            else:
                logger.error(f"❌ Failed to start {user_type} process on port {port}")
        
        if success_count == len(self.user_ports):
            logger.info(f"✅ All {success_count} user processes started successfully")
            self.running = True
            
            # Start health monitoring
            self.health_monitor_task = asyncio.create_task(self._health_monitor_loop())
            return True
        else:
            logger.error(f"❌ Only {success_count}/{len(self.user_ports)} processes started")
            await self.stop_all_processes()  # Clean up partial start
            return False
    
    async def _start_user_process(self, user_type: str, port: int) -> bool:
        """Start a single user process with maximum performance settings"""
        try:
            logger.info(f"🚀 Starting {user_type} process on port {port}...")
            
            # Import the user process runner
            from simple_user_process import run_user_process
            
            # Create process with optimized settings
            process = multiprocessing.Process(
                target=self._run_process_wrapper,
                args=(user_type, port),
                name=f"LibreQoS-{user_type.title()}",
                daemon=False  # Don't make daemon for proper cleanup
            )
            
            # Start the process
            process.start()
            
            # Wait briefly to check if process started successfully
            await asyncio.sleep(0.5)
            
            if process.is_alive():
                # Store process info
                self.processes[user_type] = ProcessInfo(
                    user_type=user_type,
                    port=port,
                    process=process,
                    start_time=time.time(),
                    is_healthy=True  # Assume healthy until proven otherwise
                )
                
                self.stats['total_processes_started'] += 1
                logger.info(f"✅ {user_type.title()} process started successfully (PID: {process.pid})")
                return True
            else:
                logger.error(f"❌ {user_type} process failed to start")
                return False
                
        except Exception as e:
            logger.error(f"❌ Error starting {user_type} process: {e}")
            return False
    
    def _run_process_wrapper(self, user_type: str, port: int):
        """Wrapper to run user process in multiprocessing context"""
        try:
            # Set process title for easier monitoring
            try:
                import setproctitle
                setproctitle.setproctitle(f"libreqos-{user_type}")
            except ImportError:
                pass  # setproctitle not available, continue anyway
            
            # Run the user process
            asyncio.run(self._run_user_process_async(user_type, port))
            
        except Exception as e:
            logger.error(f"❌ Process wrapper error for {user_type}: {e}")
            sys.exit(1)
    
    async def _run_user_process_async(self, user_type: str, port: int):
        """Async wrapper for user process"""
        from simple_user_process import run_user_process
        await run_user_process(user_type, port, self.ssl_keyfile, self.ssl_certfile)
    
    async def stop_all_processes(self):
        """Stop all user processes gracefully"""
        logger.info("🛑 Stopping all user processes...")
        
        self.running = False
        
        # Stop health monitoring
        if self.health_monitor_task and not self.health_monitor_task.done():
            self.health_monitor_task.cancel()
            try:
                await self.health_monitor_task
            except asyncio.CancelledError:
                pass
        
        # Stop all processes
        for user_type, process_info in self.processes.items():
            if process_info.process and process_info.process.is_alive():
                logger.info(f"🛑 Stopping {user_type} process (PID: {process_info.process.pid})")
                
                try:
                    # Try graceful shutdown first
                    process_info.process.terminate()
                    
                    # Wait for graceful shutdown
                    process_info.process.join(timeout=5.0)
                    
                    if process_info.process.is_alive():
                        # Force kill if still alive
                        logger.warning(f"⚠️ Force killing {user_type} process")
                        process_info.process.kill()
                        process_info.process.join(timeout=2.0)
                    
                    logger.info(f"✅ {user_type} process stopped")
                    
                except Exception as e:
                    logger.error(f"❌ Error stopping {user_type} process: {e}")
        
        self.processes.clear()
        logger.info("✅ All user processes stopped")
    
    async def _health_monitor_loop(self):
        """Monitor process health and restart failed processes"""
        logger.info("🔍 Starting health monitoring loop")
        
        while self.running:
            try:
                await self._check_all_process_health()
                await asyncio.sleep(self.health_check_interval)
            except Exception as e:
                logger.error(f"❌ Health monitor error: {e}")
                await asyncio.sleep(1.0)  # Brief pause on error
    
    async def _check_all_process_health(self):
        """Check health of all processes"""
        current_time = time.time()
        
        for user_type, process_info in list(self.processes.items()):
            try:
                # Check if process is still alive
                # For detected processes (process=None), rely on HTTP health checks only
                if process_info.process is not None and not process_info.process.is_alive():
                    logger.warning(f"⚠️ {user_type} process is dead (process object)")
                    process_info.is_healthy = False
                    
                    # Attempt restart if within limits
                    if process_info.restart_count < self.max_restart_attempts:
                        logger.info(f"🔄 Restarting {user_type} process (attempt {process_info.restart_count + 1})")
                        await self._restart_process(user_type)
                    else:
                        logger.error(f"❌ {user_type} process exceeded restart limit, giving up")
                        del self.processes[user_type]
                    continue
                elif process_info.process is None:
                    # This is a detected process - rely on HTTP health check only
                    logger.debug(f"🔍 Checking detected {user_type} process via HTTP health check")
                
                # Check process health via HTTP endpoint
                health_ok = await self._check_process_http_health(user_type, process_info.port)
                process_info.is_healthy = health_ok
                process_info.last_health_check = current_time
                
                if not health_ok:
                    logger.warning(f"⚠️ {user_type} process health check failed")
                
            except Exception as e:
                logger.error(f"❌ Health check error for {user_type}: {e}")
                process_info.is_healthy = False
    
    async def _check_process_http_health(self, user_type: str, port: int) -> bool:
        """Check process health via HTTP/HTTPS health endpoint"""
        try:
            import aiohttp
            import ssl
            
            # Use HTTPS if SSL is enabled, otherwise HTTP
            protocol = "https" if self.ssl_enabled else "http"
            url = f"{protocol}://localhost:{port}/health"
            
            # Create SSL context for HTTPS health checks
            connector = None
            if self.ssl_enabled:
                ssl_context = ssl.create_default_context()
                ssl_context.check_hostname = False  # Allow localhost
                ssl_context.verify_mode = ssl.CERT_NONE  # Skip cert verification for health checks
                connector = aiohttp.TCPConnector(ssl=ssl_context)
            
            async with aiohttp.ClientSession(
                timeout=aiohttp.ClientTimeout(total=5.0),  # Increased timeout
                connector=connector
            ) as session:
                async with session.get(url) as response:
                    if response.status == 200:
                        data = await response.json()
                        return data.get('status') == 'healthy'
                    return False
                    
        except Exception as e:
            logger.debug(f"Health check failed for {user_type}:{port}: {e}")
            return False
    
    async def _restart_process(self, user_type: str):
        """Restart a failed process"""
        try:
            process_info = self.processes[user_type]
            port = process_info.port
            
            # Clean up old process
            if process_info.process:
                try:
                    if process_info.process.is_alive():
                        process_info.process.terminate()
                        process_info.process.join(timeout=2.0)
                        if process_info.process.is_alive():
                            process_info.process.kill()
                except:
                    pass  # Process cleanup errors are not critical
            
            # Wait before restart
            await asyncio.sleep(self.restart_delay)
            
            # Start new process
            if await self._start_user_process(user_type, port):
                self.processes[user_type].restart_count += 1
                self.stats['total_restarts'] += 1
                logger.info(f"✅ {user_type} process restarted successfully")
            else:
                logger.error(f"❌ Failed to restart {user_type} process")
                
        except Exception as e:
            logger.error(f"❌ Error restarting {user_type} process: {e}")
    
    def get_port_for_user(self, user_id: str) -> Optional[int]:
        """Get port for a user type (simple mapping)"""
        # Extract user type from user_id (e.g., 'jake', 'alex', etc.)
        user_type = user_id.lower()
        
        # Handle variations in user_id format
        for known_type in self.user_ports.keys():
            if known_type in user_type:
                if known_type in self.processes and self.processes[known_type].is_healthy:
                    return self.user_ports[known_type]
                break
        
        return None
    
    def is_running(self) -> bool:
        """Check if process manager is running"""
        return self.running
    
    def get_process_health(self) -> Dict[str, dict]:
        """Get health status of all processes"""
        health_status = {}
        
        for user_type, process_info in self.processes.items():
            health_status[user_type] = {
                'is_healthy': process_info.is_healthy,
                'port': process_info.port,
                'pid': process_info.process.pid if process_info.process else None,
                'uptime_seconds': time.time() - process_info.start_time,
                'restart_count': process_info.restart_count,
                'last_health_check': process_info.last_health_check
            }
        
        return health_status
    
    def get_system_stats(self) -> dict:
        """Get comprehensive system statistics"""
        active_processes = sum(1 for p in self.processes.values() if p.is_healthy)
        total_processes = len(self.processes)
        uptime = time.time() - self.stats['start_time']
        
        return {
            'process_manager_running': self.running,
            'active_processes': active_processes,
            'total_processes': total_processes,
            'process_health': self.get_process_health(),
            'user_ports': self.user_ports,
            'stats': {
                **self.stats,
                'uptime_seconds': round(uptime, 1)
            },
            'architecture': 'simple_multiprocess'
        }

# Global process manager instance (initialized on import)
process_manager = SimpleProcessManager()

async def main():
    """Main entry point for standalone process manager"""
    import argparse
    
    parser = argparse.ArgumentParser(description="LibreQoS Simple Process Manager")
    parser.add_argument("--start", action="store_true", help="Start all user processes")
    parser.add_argument("--stop", action="store_true", help="Stop all user processes")
    parser.add_argument("--status", action="store_true", help="Show process status")
    parser.add_argument("--ssl-keyfile", type=str, help="SSL key file path for HTTPS")
    parser.add_argument("--ssl-certfile", type=str, help="SSL certificate file path for HTTPS")
    
    args = parser.parse_args()
    
    # Update global process manager with SSL parameters
    global process_manager
    if args.ssl_keyfile and args.ssl_certfile:
        process_manager.ssl_keyfile = args.ssl_keyfile
        process_manager.ssl_certfile = args.ssl_certfile
        process_manager.ssl_enabled = True
        logger.info("🔒 SSL configuration updated for process manager")
    
    # Set up logging
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - ProcessManager - %(name)s - %(levelname)s - %(message)s'
    )
    
    if args.start:
        logger.info("🚀 Starting Simple Process Manager...")
        
        # Set up signal handlers
        def signal_handler(signum, frame):
            logger.info(f"🛑 Received signal {signum}, shutting down...")
            asyncio.create_task(process_manager.stop_all_processes())
        
        signal.signal(signal.SIGTERM, signal_handler)
        signal.signal(signal.SIGINT, signal_handler)
        
        try:
            success = await process_manager.start_all_processes()
            if success:
                logger.info("✅ All processes started, monitoring...")
                # Keep running until interrupted
                while process_manager.running:
                    await asyncio.sleep(1)
            else:
                logger.error("❌ Failed to start processes")
                sys.exit(1)
        except KeyboardInterrupt:
            logger.info("🛑 Keyboard interrupt received")
        finally:
            await process_manager.stop_all_processes()
            
    elif args.stop:
        logger.info("🛑 Stopping all processes...")
        await process_manager.stop_all_processes()
        
    elif args.status:
        stats = process_manager.get_system_stats()
        print(f"Process Manager Status: {'Running' if stats['process_manager_running'] else 'Stopped'}")
        print(f"Active Processes: {stats['active_processes']}/{stats['total_processes']}")
        print("\nProcess Health:")
        for user_type, health in stats['process_health'].items():
            status = "✅ Healthy" if health['is_healthy'] else "❌ Unhealthy"
            print(f"  {user_type.title()}: {status} (Port {health['port']}, PID {health['pid']})")
    else:
        parser.print_help()

if __name__ == "__main__":
    asyncio.run(main())