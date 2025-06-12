"""
Simple Rate Limiter for LibreQoS Speed Test Servers
Provides NAT-friendly rate limiting for download and WebSocket endpoints
"""

import time
import threading
import os
import logging
from typing import Dict, List, Tuple, NamedTuple
from collections import defaultdict

logger = logging.getLogger(__name__)

class DownloadRecord(NamedTuple):
    timestamp: float
    bytes_downloaded: int

class SimpleRateLimiter:
    """
    In-memory rate limiter with NAT-friendly limits:
    - 16 download tests per IP per hour
    - 45GB bandwidth per IP per hour  
    - 4 concurrent WebSocket sessions per IP
    """
    
    def __init__(self):
        # Configuration - can be overridden by environment variables
        self.downloads_per_hour = int(os.getenv('RATE_LIMIT_DOWNLOADS_PER_HOUR', 16))
        self.bandwidth_gb_per_hour = int(os.getenv('RATE_LIMIT_BANDWIDTH_GB_PER_HOUR', 45))
        self.websocket_sessions = int(os.getenv('RATE_LIMIT_WEBSOCKET_SESSIONS', 4))
        self.cleanup_interval = int(os.getenv('RATE_LIMIT_CLEANUP_INTERVAL', 600))  # 10 minutes
        
        # Convert GB to bytes for internal calculations
        self.bandwidth_bytes_per_hour = self.bandwidth_gb_per_hour * 1024 * 1024 * 1024
        
        # Tracking data structures
        self.download_history: Dict[str, List[DownloadRecord]] = defaultdict(list)
        self.websocket_sessions_count: Dict[str, int] = defaultdict(int)
        
        # Thread safety
        self.lock = threading.RLock()
        
        # Cleanup tracking
        self.last_cleanup = time.time()
        
        logger.info(f"Rate limiter initialized: {self.downloads_per_hour} downloads/hour, "
                   f"{self.bandwidth_gb_per_hour}GB/hour, {self.websocket_sessions} WebSocket sessions")
    
    def check_download_limit(self, client_ip: str) -> Tuple[bool, str]:
        """
        Check if download request is allowed for this IP.
        
        Returns:
            (is_allowed, error_message)
        """
        with self.lock:
            self._cleanup_if_needed()
            
            current_time = time.time()
            hour_ago = current_time - 3600
            
            # Get download history for this IP in the last hour
            ip_downloads = self.download_history[client_ip]
            recent_downloads = [record for record in ip_downloads if record.timestamp > hour_ago]
            
            # Check test count limit
            test_count = len(recent_downloads)
            if test_count >= self.downloads_per_hour:
                return False, (f"Rate limit exceeded: {test_count}/{self.downloads_per_hour} "
                             f"download tests used this hour (NAT/ISP friendly limit)")
            
            # Check bandwidth limit
            total_bytes = sum(record.bytes_downloaded for record in recent_downloads)
            total_gb = total_bytes / (1024 * 1024 * 1024)
            
            if total_bytes >= self.bandwidth_bytes_per_hour:
                return False, (f"Bandwidth limit exceeded: {total_gb:.1f}/{self.bandwidth_gb_per_hour}GB "
                             f"used this hour (NAT/ISP friendly limit)")
            
            return True, ""
    
    def track_download_request(self, client_ip: str, bytes_downloaded: int):
        """
        Track a completed download for rate limiting.
        
        Args:
            client_ip: Client IP address
            bytes_downloaded: Number of bytes sent to client
        """
        with self.lock:
            current_time = time.time()
            record = DownloadRecord(timestamp=current_time, bytes_downloaded=bytes_downloaded)
            self.download_history[client_ip].append(record)
            
            # Log significant downloads
            if bytes_downloaded > 100 * 1024 * 1024:  # > 100MB
                mb_downloaded = bytes_downloaded / (1024 * 1024)
                logger.info(f"Large download tracked: {client_ip} downloaded {mb_downloaded:.1f}MB")
    
    def check_websocket_limit(self, client_ip: str) -> Tuple[bool, str]:
        """
        Check if WebSocket connection is allowed for this IP.
        
        Returns:
            (is_allowed, error_message)
        """
        with self.lock:
            current_sessions = self.websocket_sessions_count[client_ip]
            
            if current_sessions >= self.websocket_sessions:
                total_connections = current_sessions * 4  # 4 connections per session
                return False, (f"Connection limit exceeded: {current_sessions}/{self.websocket_sessions} "
                             f"virtual household sessions active ({total_connections}/16 total connections)")
            
            return True, ""
    
    def track_websocket_connect(self, client_ip: str):
        """
        Track a new WebSocket session connection.
        
        Args:
            client_ip: Client IP address
        """
        with self.lock:
            self.websocket_sessions_count[client_ip] += 1
            current_count = self.websocket_sessions_count[client_ip]
            logger.debug(f"WebSocket session started: {client_ip} now has {current_count} active sessions")
    
    def track_websocket_disconnect(self, client_ip: str):
        """
        Track WebSocket session disconnection.
        
        Args:
            client_ip: Client IP address
        """
        with self.lock:
            if self.websocket_sessions_count[client_ip] > 0:
                self.websocket_sessions_count[client_ip] -= 1
                current_count = self.websocket_sessions_count[client_ip]
                
                # Clean up if no sessions remain
                if current_count == 0:
                    del self.websocket_sessions_count[client_ip]
                
                logger.debug(f"WebSocket session ended: {client_ip} now has {current_count} active sessions")
            else:
                logger.warning(f"Attempted to disconnect WebSocket for {client_ip} but no sessions tracked")
    
    def get_usage_stats(self, client_ip: str) -> Dict:
        """
        Get current usage statistics for an IP address.
        
        Returns:
            Dictionary with current usage stats
        """
        with self.lock:
            current_time = time.time()
            hour_ago = current_time - 3600
            
            # Download stats
            ip_downloads = self.download_history[client_ip]
            recent_downloads = [record for record in ip_downloads if record.timestamp > hour_ago]
            
            tests_this_hour = len(recent_downloads)
            bytes_this_hour = sum(record.bytes_downloaded for record in recent_downloads)
            gb_this_hour = bytes_this_hour / (1024 * 1024 * 1024)
            
            # WebSocket stats
            active_sessions = self.websocket_sessions_count[client_ip]
            total_connections = active_sessions * 4
            
            return {
                "tests_this_hour": tests_this_hour,
                "tests_limit": self.downloads_per_hour,
                "bandwidth_this_hour_gb": round(gb_this_hour, 2),
                "bandwidth_limit_gb": self.bandwidth_gb_per_hour,
                "active_websocket_sessions": active_sessions,
                "websocket_sessions_limit": self.websocket_sessions,
                "total_websocket_connections": total_connections
            }
    
    def _cleanup_if_needed(self):
        """
        Clean up old data if cleanup interval has passed.
        Called internally with lock already held.
        """
        current_time = time.time()
        if current_time - self.last_cleanup > self.cleanup_interval:
            self._cleanup_old_data()
            self.last_cleanup = current_time
    
    def _cleanup_old_data(self):
        """
        Remove download history older than 1 hour.
        Called internally with lock already held.
        """
        cutoff_time = time.time() - 3600  # 1 hour ago
        initial_ips = len(self.download_history)
        
        # Clean up download history
        for ip in list(self.download_history.keys()):
            # Keep only recent downloads
            recent_downloads = [
                record for record in self.download_history[ip]
                if record.timestamp > cutoff_time
            ]
            
            if recent_downloads:
                self.download_history[ip] = recent_downloads
            else:
                # No recent downloads, remove IP entirely
                del self.download_history[ip]
        
        final_ips = len(self.download_history)
        if initial_ips > 0:
            logger.info(f"Rate limiter cleanup: {initial_ips} -> {final_ips} IPs with download history")
    
    def force_cleanup(self):
        """
        Force immediate cleanup of old data.
        Useful for testing or manual maintenance.
        """
        with self.lock:
            self._cleanup_old_data()
            self.last_cleanup = time.time()
    
    def get_memory_stats(self) -> Dict:
        """
        Get memory usage statistics for monitoring.
        
        Returns:
            Dictionary with memory usage info
        """
        with self.lock:
            download_ips = len(self.download_history)
            websocket_ips = len(self.websocket_sessions_count)
            
            total_download_records = sum(
                len(records) for records in self.download_history.values()
            )
            
            # Rough memory estimation
            bytes_per_download_record = 64  # timestamp + bytes count + overhead
            bytes_per_websocket_entry = 8   # just an integer counter
            
            estimated_memory_bytes = (
                total_download_records * bytes_per_download_record +
                websocket_ips * bytes_per_websocket_entry
            )
            
            return {
                "download_tracking_ips": download_ips,
                "websocket_tracking_ips": websocket_ips,
                "total_download_records": total_download_records,
                "estimated_memory_kb": round(estimated_memory_bytes / 1024, 2),
                "last_cleanup": self.last_cleanup
            }

# Global rate limiter instance
rate_limiter = SimpleRateLimiter()