"""
DDOS Protection Rate Limiter
============================

IP-based rate limiting middleware for LibreQoS endpoints.
Designed to be NAT-aware for ISP deployments with CGNAT.
"""

import time
import asyncio
import logging
from typing import Dict, Set, Optional
from dataclasses import dataclass, field
from fastapi import Request, HTTPException
from fastapi.responses import JSONResponse

logger = logging.getLogger(__name__)

@dataclass
class ConnectionTracker:
    """Track active connections and request patterns per IP"""
    ip: str
    active_downloads: int = 0
    active_uploads: int = 0
    active_websockets: int = 0
    ping_requests: list = field(default_factory=list)  # timestamps of recent pings
    static_requests: list = field(default_factory=list)  # timestamps of static requests
    last_cleanup: float = field(default_factory=time.time)
    
    def cleanup_expired(self, current_time: float):
        """Remove expired request timestamps"""
        # Keep ping requests from last minute
        self.ping_requests = [t for t in self.ping_requests if current_time - t < 60]
        
        # Keep static requests from last minute  
        self.static_requests = [t for t in self.static_requests if current_time - t < 60]
        
        self.last_cleanup = current_time
    
    def get_ping_count_last_minute(self, current_time: float) -> int:
        """Get ping request count in the last minute"""
        self.cleanup_expired(current_time)
        return len(self.ping_requests)
    
    def get_static_count_last_minute(self, current_time: float) -> int:
        """Get static request count in the last minute"""
        self.cleanup_expired(current_time)
        return len(self.static_requests)

class RateLimiter:
    """
    NAT-aware rate limiter for LibreQoS endpoints
    """
    
    def __init__(self):
        self.connections: Dict[str, ConnectionTracker] = {}
        self.cleanup_interval = 300  # Clean up every 5 minutes
        self.last_global_cleanup = time.time()
        
        # Rate limits (configurable)
        self.MAX_DOWNLOAD_CONNECTIONS = 3
        self.MAX_UPLOAD_CONNECTIONS = 100  # Very permissive - uploads are bandwidth-limited, not DDoS vectors
        self.MAX_WEBSOCKET_CONNECTIONS = 12
        self.MAX_PING_REQUESTS_PER_MINUTE = 180
        self.MAX_STATIC_REQUESTS_PER_MINUTE = 20
        
    def get_client_ip(self, request: Request) -> str:
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
    
    def is_central_server_request(self, request: Request) -> bool:
        """Check if request is from central server (should bypass rate limits)"""
        client_ip = self.get_client_ip(request)
        user_agent = request.headers.get("user-agent", "")
        
        # Check if request is from central server based on User-Agent and known central server patterns
        if user_agent.startswith("LibreQoS-Central/"):
            return True
        
        # TODO: Add IP-based detection when central server IPs are known
        # For now, rely on User-Agent which is set by the central server
        
        return False
    
    def get_or_create_tracker(self, ip: str) -> ConnectionTracker:
        """Get or create connection tracker for IP"""
        current_time = time.time()
        
        if ip not in self.connections:
            self.connections[ip] = ConnectionTracker(ip=ip)
        
        tracker = self.connections[ip]
        
        # Periodic cleanup of old data
        if current_time - tracker.last_cleanup > 60:
            tracker.cleanup_expired(current_time)
        
        return tracker
    
    def global_cleanup(self):
        """Remove trackers for IPs with no active connections"""
        current_time = time.time()
        
        if current_time - self.last_global_cleanup < self.cleanup_interval:
            return
        
        # Remove trackers with no active connections and no recent requests
        inactive_ips = []
        for ip, tracker in self.connections.items():
            tracker.cleanup_expired(current_time)
            
            has_active_connections = (
                tracker.active_downloads > 0 or 
                tracker.active_uploads > 0 or 
                tracker.active_websockets > 0
            )
            
            has_recent_requests = (
                len(tracker.ping_requests) > 0 or 
                len(tracker.static_requests) > 0
            )
            
            if not has_active_connections and not has_recent_requests:
                inactive_ips.append(ip)
        
        for ip in inactive_ips:
            del self.connections[ip]
        
        if inactive_ips:
            logger.info(f"Rate limiter cleanup: removed {len(inactive_ips)} inactive IP trackers")
        
        self.last_global_cleanup = current_time
    
    async def check_download_limit(self, request: Request) -> bool:
        """Check if download connection is allowed"""
        # Skip rate limiting for central server requests
        if self.is_central_server_request(request):
            logger.debug("Bypassing download rate limit for central server request")
            return True
            
        ip = self.get_client_ip(request)
        tracker = self.get_or_create_tracker(ip)
        
        if tracker.active_downloads >= self.MAX_DOWNLOAD_CONNECTIONS:
            logger.warning(f"Download connection limit exceeded for IP {ip}: {tracker.active_downloads}/{self.MAX_DOWNLOAD_CONNECTIONS}")
            raise HTTPException(
                status_code=429,
                detail=f"Too many download connections from your IP ({tracker.active_downloads}/{self.MAX_DOWNLOAD_CONNECTIONS}). "
                       f"Multiple customers may share your IP address. Please wait for current tests to complete."
            )
        
        tracker.active_downloads += 1
        logger.debug(f"Download connection started for IP {ip}: {tracker.active_downloads}/{self.MAX_DOWNLOAD_CONNECTIONS}")
        return True
    
    async def release_download_connection(self, request: Request):
        """Release download connection"""
        ip = self.get_client_ip(request)
        if ip in self.connections:
            self.connections[ip].active_downloads = max(0, self.connections[ip].active_downloads - 1)
            logger.debug(f"Download connection released for IP {ip}: {self.connections[ip].active_downloads}/{self.MAX_DOWNLOAD_CONNECTIONS}")
        
        self.global_cleanup()
    
    async def check_upload_limit(self, request: Request) -> bool:
        """Check if upload connection is allowed"""
        # Skip rate limiting for central server requests
        if self.is_central_server_request(request):
            logger.debug("Bypassing upload rate limit for central server request")
            return True
            
        ip = self.get_client_ip(request)
        tracker = self.get_or_create_tracker(ip)
        
        if tracker.active_uploads >= self.MAX_UPLOAD_CONNECTIONS:
            logger.warning(f"Upload connection limit exceeded for IP {ip}: {tracker.active_uploads}/{self.MAX_UPLOAD_CONNECTIONS}")
            raise HTTPException(
                status_code=429,
                detail=f"Too many upload connections from your IP ({tracker.active_uploads}/{self.MAX_UPLOAD_CONNECTIONS}). "
                       f"Multiple customers may share your IP address. Please wait for current tests to complete."
            )
        
        tracker.active_uploads += 1
        logger.debug(f"Upload connection started for IP {ip}: {tracker.active_uploads}/{self.MAX_UPLOAD_CONNECTIONS}")
        return True
    
    async def release_upload_connection(self, request: Request):
        """Release upload connection"""
        ip = self.get_client_ip(request)
        if ip in self.connections:
            self.connections[ip].active_uploads = max(0, self.connections[ip].active_uploads - 1)
            logger.debug(f"Upload connection released for IP {ip}: {self.connections[ip].active_uploads}/{self.MAX_UPLOAD_CONNECTIONS}")
        
        self.global_cleanup()
    
    async def check_ping_limit(self, request: Request) -> bool:
        """Check if ping request is allowed"""
        # Skip rate limiting for central server requests
        if self.is_central_server_request(request):
            logger.debug("Bypassing ping rate limit for central server request")
            return True
            
        ip = self.get_client_ip(request)
        tracker = self.get_or_create_tracker(ip)
        current_time = time.time()
        
        ping_count = tracker.get_ping_count_last_minute(current_time)
        
        if ping_count >= self.MAX_PING_REQUESTS_PER_MINUTE:
            logger.warning(f"Ping rate limit exceeded for IP {ip}: {ping_count}/{self.MAX_PING_REQUESTS_PER_MINUTE} per minute")
            raise HTTPException(
                status_code=429,
                detail=f"Too many ping requests from your IP ({ping_count}/{self.MAX_PING_REQUESTS_PER_MINUTE} per minute). "
                       f"Please reduce request frequency."
            )
        
        tracker.ping_requests.append(current_time)
        return True
    
    async def check_websocket_limit(self, request: Request) -> bool:
        """Check if WebSocket connection is allowed"""
        # Skip rate limiting for central server requests
        if self.is_central_server_request(request):
            logger.debug("Bypassing WebSocket rate limit for central server request")
            return True
            
        ip = self.get_client_ip(request)
        tracker = self.get_or_create_tracker(ip)
        
        if tracker.active_websockets >= self.MAX_WEBSOCKET_CONNECTIONS:
            logger.warning(f"WebSocket connection limit exceeded for IP {ip}: {tracker.active_websockets}/{self.MAX_WEBSOCKET_CONNECTIONS}")
            raise HTTPException(
                status_code=429,
                detail=f"Too many WebSocket connections from your IP ({tracker.active_websockets}/{self.MAX_WEBSOCKET_CONNECTIONS}). "
                       f"Multiple customers may share your IP address. Please close unused connections."
            )
        
        tracker.active_websockets += 1
        logger.debug(f"WebSocket connection started for IP {ip}: {tracker.active_websockets}/{self.MAX_WEBSOCKET_CONNECTIONS}")
        return True
    
    async def release_websocket_connection(self, request: Request):
        """Release WebSocket connection"""
        ip = self.get_client_ip(request)
        if ip in self.connections:
            self.connections[ip].active_websockets = max(0, self.connections[ip].active_websockets - 1)
            logger.debug(f"WebSocket connection released for IP {ip}: {self.connections[ip].active_websockets}/{self.MAX_WEBSOCKET_CONNECTIONS}")
        
        self.global_cleanup()
    
    async def check_static_limit(self, request: Request) -> bool:
        """Check if static file request is allowed"""
        ip = self.get_client_ip(request)
        tracker = self.get_or_create_tracker(ip)
        current_time = time.time()
        
        static_count = tracker.get_static_count_last_minute(current_time)
        
        if static_count >= self.MAX_STATIC_REQUESTS_PER_MINUTE:
            logger.warning(f"Static file rate limit exceeded for IP {ip}: {static_count}/{self.MAX_STATIC_REQUESTS_PER_MINUTE} per minute")
            raise HTTPException(
                status_code=429,
                detail=f"Too many static file requests from your IP ({static_count}/{self.MAX_STATIC_REQUESTS_PER_MINUTE} per minute). "
                       f"Please reduce request frequency."
            )
        
        tracker.static_requests.append(current_time)
        return True
    
    def get_stats(self) -> dict:
        """Get current rate limiting statistics"""
        self.global_cleanup()
        
        total_ips = len(self.connections)
        active_downloads = sum(t.active_downloads for t in self.connections.values())
        active_uploads = sum(t.active_uploads for t in self.connections.values())
        active_websockets = sum(t.active_websockets for t in self.connections.values())
        
        return {
            "tracked_ips": total_ips,
            "active_downloads": active_downloads,
            "active_uploads": active_uploads, 
            "active_websockets": active_websockets,
            "limits": {
                "max_downloads_per_ip": self.MAX_DOWNLOAD_CONNECTIONS,
                "max_uploads_per_ip": self.MAX_UPLOAD_CONNECTIONS,
                "max_websockets_per_ip": self.MAX_WEBSOCKET_CONNECTIONS,
                "max_pings_per_minute": self.MAX_PING_REQUESTS_PER_MINUTE,
                "max_static_per_minute": self.MAX_STATIC_REQUESTS_PER_MINUTE
            }
        }

# Global rate limiter instance
rate_limiter = RateLimiter()