#!/usr/bin/env python3
"""
Simple Multi-Process Virtual Household Startup Script
====================================================

Easy startup script for the new simple multi-process system.
Starts all user processes and the main server for maximum throughput.
"""

import asyncio
import logging
import signal
import sys
import os
import time
from typing import Optional

# Add server directory to path
sys.path.append(os.path.join(os.path.dirname(__file__), 'server'))

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - STARTUP - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

class SimpleMultiProcessStarter:
    """Startup manager for simple multi-process system"""
    
    def __init__(self, ssl_keyfile=None, ssl_certfile=None):
        self.ssl_keyfile = ssl_keyfile
        self.ssl_certfile = ssl_certfile
        self.ssl_enabled = bool(ssl_keyfile and ssl_certfile)
        self.process_manager = None
        self.main_server_task: Optional[asyncio.Task] = None
        self.ping_server_task: Optional[asyncio.Task] = None
        self.running = False
    
    async def start_system(self, port: int = 8000):
        """Start the complete simple multi-process system"""
        if self.ssl_enabled:
            logger.info("🔒 Starting Simple Multi-Process Virtual Household System with HTTPS")
        else:
            logger.info("🚀 Starting Simple Multi-Process Virtual Household System")
        logger.info("🎯 Maximum throughput with process isolation enabled")
        
        try:
            # Import and initialize process manager with SSL support
            from simple_process_manager import SimpleProcessManager
            self.process_manager = SimpleProcessManager(self.ssl_keyfile, self.ssl_certfile)
            
            # Start all user processes first
            logger.info("🚀 Starting user type processes...")
            success = await self.process_manager.start_all_processes()
            
            if not success:
                logger.error("❌ Failed to start user processes")
                return False
            
            logger.info("✅ All user processes started successfully")
            logger.info(f"📋 Process ports: {self.process_manager.user_ports}")
            
            # Wait longer for processes to fully initialize (especially on boot)
            logger.info("⏳ Waiting for processes to initialize...")
            await asyncio.sleep(8.0)  # Increased from 3s to 8s for boot stability
            
            # Verify all processes are healthy with retry logic (for boot scenarios)
            for attempt in range(3):
                health = self.process_manager.get_process_health()
                healthy_count = sum(1 for h in health.values() if h['is_healthy'])
                total_count = len(health)
                
                if healthy_count == total_count:
                    break
                
                logger.warning(f"⚠️ Attempt {attempt + 1}/3: Only {healthy_count}/{total_count} processes healthy")
                if attempt < 2:  # Not the last attempt
                    logger.info("🔄 Retrying health check in 5 seconds...")
                    await asyncio.sleep(5.0)
                else:
                    logger.error(f"❌ Final attempt: Only {healthy_count}/{total_count} processes are healthy")
                    # Log which processes are unhealthy
                    for process_name, health_info in health.items():
                        if not health_info['is_healthy']:
                            logger.error(f"❌ Unhealthy process: {process_name} - {health_info}")
                    return False
            
            logger.info(f"✅ All {total_count} processes are healthy and ready")
            
            # Start main server
            if self.ssl_enabled:
                logger.info(f"🔒 Starting main server with HTTPS on port {port}...")
            else:
                logger.info(f"🌐 Starting main server on port {port}...")
            self.main_server_task = asyncio.create_task(self._run_main_server(port))
            
            # Small delay before starting ping server to avoid port conflicts
            await asyncio.sleep(2.0)
            logger.info("🎯 Starting dedicated ping server on port 8005...")
            self.ping_server_task = asyncio.create_task(self._run_ping_server(8005))
            
            self.running = True
            logger.info("🎉 Simple Multi-Process Virtual Household System is running!")
            logger.info("🎯 Dedicated ping server running for accurate latency measurements")
            
            protocol = "https" if self.ssl_enabled else "http"
            ws_protocol = "wss" if self.ssl_enabled else "ws"
            logger.info(f"🌐 Main server: {protocol}://localhost:{port}")
            logger.info(f"🎯 Ping server: {protocol}://localhost:8005")
            logger.info("� Virtual Household endpoints:")
            
            for user_type, port_num in self.process_manager.user_ports.items():
                logger.info(f"   {user_type.title()}: {ws_protocol}://localhost:{port_num}/ws/virtual-household/{user_type}")
            
            return True
            
        except Exception as e:
            logger.error(f"❌ System startup failed: {e}")
            return False
    
    async def _run_main_server(self, port: int):
        """Run the main server with optional SSL support"""
        try:
            import uvicorn
            from main import app
            
            config_kwargs = {
                "app": app,
                "host": "0.0.0.0",
                "port": port,
                "log_level": "info",
                "access_log": True
            }
            
            # Add SSL configuration if enabled
            if self.ssl_enabled:
                config_kwargs["ssl_keyfile"] = self.ssl_keyfile
                config_kwargs["ssl_certfile"] = self.ssl_certfile
                logger.info(f"🔒 Main server using SSL certificates")
            
            config = uvicorn.Config(**config_kwargs)
            server = uvicorn.Server(config)
            await server.serve()
            
        except Exception as e:
            logger.error(f"❌ Main server error: {e}")
            self.running = False
    
    async def _run_ping_server(self, port: int):
        """Run the dedicated ping server with optional SSL support"""
        try:
            import uvicorn
            from main import ping_app
            
            config_kwargs = {
                "app": ping_app,
                "host": "0.0.0.0",
                "port": port,
                "log_level": "warning",  # Reduce logging overhead
                "access_log": False,     # Disable access logs for performance
            }
            
            # Add SSL configuration if enabled
            if self.ssl_enabled:
                config_kwargs["ssl_keyfile"] = self.ssl_keyfile
                config_kwargs["ssl_certfile"] = self.ssl_certfile
                logger.info(f"🔒 Ping server using SSL certificates")
            
            config = uvicorn.Config(**config_kwargs)
            server = uvicorn.Server(config)
            await server.serve()
            
        except Exception as e:
            logger.error(f"❌ Ping server error: {e}")
            self.running = False
    
    async def stop_system(self):
        """Stop the complete system"""
        logger.info("🛑 Stopping Simple Multi-Process Virtual Household System...")
        
        self.running = False
        
        # Stop main server
        if self.main_server_task and not self.main_server_task.done():
            logger.info("🛑 Stopping main server...")
            self.main_server_task.cancel()
            try:
                await self.main_server_task
            except asyncio.CancelledError:
                pass
        
        # Stop ping server
        if self.ping_server_task and not self.ping_server_task.done():
            logger.info("🛑 Stopping ping server...")
            self.ping_server_task.cancel()
            try:
                await self.ping_server_task
            except asyncio.CancelledError:
                pass
        
        # Stop all user processes
        if self.process_manager:
            logger.info("🛑 Stopping user processes...")
            await self.process_manager.stop_all_processes()
        
        logger.info("✅ System shutdown complete")
    
    async def monitor_system(self):
        """Monitor system health"""
        logger.info("🔍 Starting system monitoring...")
        
        while self.running:
            try:
                if self.process_manager:
                    health = self.process_manager.get_process_health()
                    healthy_count = sum(1 for h in health.values() if h['is_healthy'])
                    total_count = len(health)
                    
                    if healthy_count != total_count:
                        logger.warning(f"⚠️ System health degraded: {healthy_count}/{total_count} processes healthy")
                    else:
                        logger.debug(f"✅ System healthy: {healthy_count}/{total_count} processes running")
                
                await asyncio.sleep(30.0)  # Check every 30 seconds
                
            except Exception as e:
                logger.error(f"❌ Monitoring error: {e}")
                await asyncio.sleep(5.0)
    
    async def run_with_monitoring(self, port: int = 8000):
        """Run system with health monitoring"""
        # Start system
        if not await self.start_system(port):
            return False
        
        # Set up signal handlers
        def signal_handler(signum, frame):
            logger.info(f"🛑 Received signal {signum}, shutting down...")
            asyncio.create_task(self.stop_system())
        
        signal.signal(signal.SIGTERM, signal_handler)
        signal.signal(signal.SIGINT, signal_handler)
        
        try:
            # Run monitoring, main server, and ping server concurrently
            await asyncio.gather(
                self.monitor_system(),
                self.main_server_task,
                self.ping_server_task
            )
        except KeyboardInterrupt:
            logger.info("🛑 Keyboard interrupt received")
        except Exception as e:
            logger.error(f"❌ System error: {e}")
        finally:
            await self.stop_system()
        
        return True

async def main():
    """Main entry point"""
    import argparse
    
    parser = argparse.ArgumentParser(description="LibreQoS Simple Multi-Process Virtual Household")
    parser.add_argument("--port", type=int, default=8000, help="Main server port")
    parser.add_argument("--test", action="store_true", help="Run tests after startup")
    parser.add_argument("--ssl-keyfile", type=str, help="SSL key file path for HTTPS")
    parser.add_argument("--ssl-certfile", type=str, help="SSL certificate file path for HTTPS")
    
    args = parser.parse_args()
    
    starter = SimpleMultiProcessStarter(args.ssl_keyfile, args.ssl_certfile)
    
    try:
        if args.test:
            # Start system and run tests
            logger.info("🧪 Starting system in test mode...")
            
            if await starter.start_system(args.port):
                logger.info("✅ System started, running tests...")
                
                # Wait for system to stabilize
                await asyncio.sleep(5.0)
                
                # Run tests
                from test_simple_multiprocess_implementation import SimpleMultiProcessTester
                tester = SimpleMultiProcessTester()
                
                try:
                    success = await tester.run_all_tests()
                    if success:
                        logger.info("🎉 All tests passed!")
                    else:
                        logger.error("❌ Some tests failed")
                finally:
                    await tester.cleanup()
                    await starter.stop_system()
                
                return 0 if success else 1
            else:
                logger.error("❌ Failed to start system for testing")
                return 1
        else:
            # Normal startup
            logger.info("🚀 Starting system in normal mode...")
            success = await starter.run_with_monitoring(args.port)
            return 0 if success else 1
            
    except KeyboardInterrupt:
        logger.info("🛑 Startup interrupted")
        return 1
    except Exception as e:
        logger.error(f"❌ Startup error: {e}")
        return 1

if __name__ == "__main__":
    # Enable environment variable for simple multiprocess
    os.environ['ENABLE_SIMPLE_MULTIPROCESS'] = 'true'
    
    # Run the system
    exit_code = asyncio.run(main())
    sys.exit(exit_code)
