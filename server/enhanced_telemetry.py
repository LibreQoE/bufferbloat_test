"""
Enhanced Telemetry System for ISP Servers
==========================================
Extends the existing telemetry system to support:
1. Local ISP server storage (1000 most recent tests with full IP)
2. Optional webhook delivery to ISP systems  
3. Maintains existing central server telemetry (no IP stored)

Compatible with existing client telemetry.js structure.
"""

import json
import sqlite3
import time
import logging
import asyncio
import aiohttp
from datetime import datetime, timedelta
from typing import Dict, Optional, Any, List
import os
from pathlib import Path

logger = logging.getLogger(__name__)

class ISPTelemetryManager:
    """Manages local test result storage and optional webhook delivery for ISP servers"""
    
    def __init__(self, db_path: str = "/opt/libreqos_data/isp_telemetry.db"):
        self.db_path = db_path
        self.max_stored_tests = 1000
        
        # Initialize database
        self._init_database()
        
        # Load webhook configuration from existing ISP config file
        self.webhook_url = None
        self.webhook_secret = None
        self.telemetry_api_key = None
        self._load_webhook_config()
        self.webhook_enabled = bool(self.webhook_url)
        
        if self.webhook_enabled:
            logger.info(f"ISP telemetry: local storage + webhook to {self.webhook_url}")
        else:
            logger.info("ISP telemetry: local storage only")
    
    def _init_database(self):
        """Initialize SQLite database for local test result storage"""
        # Create directory if needed
        os.makedirs(os.path.dirname(self.db_path), exist_ok=True)
        
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        # Create main results table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS test_results (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                
                -- Client info (for ISP support correlation)
                client_ip TEXT NOT NULL,
                user_agent TEXT,
                
                -- Test metadata
                test_type TEXT NOT NULL,  -- 'single_user' or 'virtual_household'
                test_duration_seconds INTEGER,
                server_name TEXT,
                
                -- Single user test results
                download_mbps REAL,
                upload_mbps REAL,
                baseline_latency_ms REAL,
                download_latency_increase_ms REAL,
                upload_latency_increase_ms REAL,
                bidirectional_latency_increase_ms REAL,
                single_user_score INTEGER,  -- Overall test score
                
                -- Single user grades
                download_grade TEXT,
                upload_grade TEXT,
                bidirectional_grade TEXT,
                overall_grade TEXT,
                
                -- Virtual household results
                household_score INTEGER,  -- Overall household score
                alex_grade TEXT,     -- Gaming performance
                sarah_grade TEXT,    -- Video call performance  
                jake_grade TEXT,     -- Streaming performance
                computer_grade TEXT, -- Background traffic performance
                
                -- Additional context  
                test_server_name TEXT -- Which test server was used
            )
        """)
        
        # Create index for efficient queries
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_client_ip ON test_results(client_ip)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_timestamp ON test_results(timestamp)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_test_type ON test_results(test_type)")
        
        conn.commit()
        conn.close()
        
        logger.info(f"ISP telemetry database initialized: {self.db_path}")
    
    def _load_webhook_config(self):
        """Load webhook configuration from /etc/lqos_test.conf"""
        config_file = "/etc/lqos_test.conf"
        
        # Also try environment variables as fallback
        self.webhook_url = os.getenv('LIBREQOS_WEBHOOK_URL')
        self.webhook_secret = os.getenv('LIBREQOS_WEBHOOK_SECRET')
        self.telemetry_api_key = os.getenv('LIBREQOS_TELEMETRY_API_KEY')
        
        if os.path.exists(config_file):
            try:
                with open(config_file, 'r') as f:
                    for line in f:
                        line = line.strip()
                        if line.startswith('#') or not line:
                            continue
                        
                        if '=' in line:
                            key, value = line.split('=', 1)
                            key = key.strip()
                            value = value.strip().strip('"').strip("'")  # Remove quotes
                            
                            if key == 'webhook_url':
                                self.webhook_url = value
                            elif key == 'webhook_secret':
                                self.webhook_secret = value
                            elif key == 'telemetry_api_key':
                                self.telemetry_api_key = value
                
                if self.webhook_url:
                    logger.info(f"Loaded webhook config from {config_file}")
                else:
                    logger.debug(f"No webhook config found in {config_file}")
                    
            except Exception as e:
                logger.warning(f"Error reading webhook config from {config_file}: {e}")
        else:
            logger.debug(f"Config file {config_file} not found, webhook disabled")
    
    async def record_test_result(self, results_data: Dict, client_ip: str, user_agent: str = "") -> str:
        """
        Record test results locally and optionally send webhook
        
        Args:
            results_data: Test results from client telemetry
            client_ip: Client IP address (stored locally for ISP support)
            user_agent: Client user agent string
            
        Returns:
            test_id: Generated test ID
        """
        test_id = f"isp_{int(time.time())}_{hash(client_ip) % 10000}"
        
        try:
            # Store results locally
            await self._store_local_result(test_id, results_data, client_ip, user_agent)
            
            # Send webhook if configured
            if self.webhook_enabled:
                await self._send_webhook(test_id, results_data, client_ip, user_agent)
            
            # Cleanup old records
            await self._cleanup_old_records()
            
            logger.info(f"Recorded test result for {client_ip[:8]}... (ID: {test_id})")
            return test_id
            
        except Exception as e:
            logger.error(f"Error recording test result: {e}")
            raise
    
    async def _store_local_result(self, test_id: str, results: Dict, client_ip: str, user_agent: str):
        """Store test result in local SQLite database"""
        
        # Extract data from results structure (matches telemetry.js format)
        test_type = results.get('test_type', 'single_user')
        grades = results.get('grades', {})
        metrics = results.get('metrics', {})
        household_metrics = results.get('household_metrics', {})
        
        # Get test server info if available
        test_server_name = results.get('server_info', {}).get('name', 'Unknown')
        
        # Calculate scores (convert grades to scores for easier querying)
        single_user_score = self._grade_to_score(grades.get('overall')) if test_type == 'single_user' else None
        household_score = self._calculate_household_score(household_metrics) if test_type == 'virtual_household' else None
        
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute("""
            INSERT INTO test_results (
                timestamp, client_ip, user_agent, test_type, test_duration_seconds,
                download_mbps, upload_mbps, baseline_latency_ms,
                download_latency_increase_ms, upload_latency_increase_ms, 
                bidirectional_latency_increase_ms,
                single_user_score, download_grade, upload_grade, 
                bidirectional_grade, overall_grade,
                household_score, alex_grade, sarah_grade, jake_grade, computer_grade,
                test_server_name
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            datetime.now().isoformat(), client_ip, user_agent, test_type, 
            metrics.get('test_duration_seconds', 0),
            metrics.get('download_throughput_mbps', 0), metrics.get('upload_throughput_mbps', 0), 
            metrics.get('baseline_latency_ms', 0),
            metrics.get('download_latency_increase_ms', 0),
            metrics.get('upload_latency_increase_ms', 0),
            metrics.get('bidirectional_latency_increase_ms', 0),
            single_user_score, self._extract_grade_string(grades.get('download')), self._extract_grade_string(grades.get('upload')),
            self._extract_grade_string(grades.get('bidirectional')), self._extract_grade_string(grades.get('overall')),
            household_score, household_metrics.get('alex_performance'),
            household_metrics.get('sarah_performance'), household_metrics.get('jake_performance'),
            household_metrics.get('computer_performance'),
            test_server_name
        ))
        
        conn.commit()
        conn.close()
    
    async def _send_webhook(self, test_id: str, results: Dict, client_ip: str, user_agent: str):
        """Send webhook to ISP system (optional)"""
        try:
            # Format webhook payload for ISP integration
            payload = {
                "test_id": test_id,
                "timestamp": datetime.now().isoformat(),
                "source": "libreqos-bufferbloat",
                
                # Client info
                "client_ip": client_ip,
                "user_agent": user_agent,
                
                # Test results
                "test_type": results.get('test_type', 'single_user'),
                "download_mbps": results.get('metrics', {}).get('download_throughput_mbps', 0),
                "upload_mbps": results.get('metrics', {}).get('upload_throughput_mbps', 0),
                "ping_ms": results.get('metrics', {}).get('baseline_latency_ms', 0),
                
                # Bufferbloat specifics
                "bufferbloat": {
                    "overall_grade": results.get('grades', {}).get('overall'),
                    "download_latency_increase_ms": results.get('metrics', {}).get('download_latency_increase_ms', 0),
                    "upload_latency_increase_ms": results.get('metrics', {}).get('upload_latency_increase_ms', 0),
                    "bidirectional_latency_increase_ms": results.get('metrics', {}).get('bidirectional_latency_increase_ms', 0)
                }
            }
            
            # Add household data if available
            if results.get('test_type') == 'virtual_household':
                payload["virtual_household"] = results.get('household_metrics', {})
            
            # Send HTTP POST
            headers = {"Content-Type": "application/json"}
            if self.webhook_secret:
                # Add signature for security
                import hmac, hashlib
                signature = hmac.new(
                    self.webhook_secret.encode(),
                    json.dumps(payload).encode(),
                    hashlib.sha256
                ).hexdigest()
                headers["X-LibreQoS-Signature"] = f"sha256={signature}"
            
            timeout = aiohttp.ClientTimeout(total=10)
            async with aiohttp.ClientSession(timeout=timeout) as session:
                async with session.post(self.webhook_url, json=payload, headers=headers) as response:
                    if response.status == 200:
                        logger.debug(f"Webhook sent successfully for {test_id}")
                    else:
                        logger.warning(f"Webhook failed: HTTP {response.status} for {test_id}")
                        
        except Exception as e:
            logger.warning(f"Webhook delivery failed for {test_id}: {e}")
            # Don't raise - webhook failures shouldn't break telemetry storage
    
    async def _cleanup_old_records(self):
        """Keep only the most recent N test records"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        # Count current records
        cursor.execute("SELECT COUNT(*) FROM test_results")
        count = cursor.fetchone()[0]
        
        if count > self.max_stored_tests:
            # Delete oldest records beyond limit
            records_to_delete = count - self.max_stored_tests
            cursor.execute("""
                DELETE FROM test_results 
                WHERE id IN (
                    SELECT id FROM test_results 
                    ORDER BY timestamp ASC 
                    LIMIT ?
                )
            """, (records_to_delete,))
            
            conn.commit()
            logger.debug(f"Cleaned up {records_to_delete} old test records")
        
        conn.close()
    
    def get_recent_tests(self, client_ip: Optional[str] = None, limit: int = 50) -> List[Dict]:
        """Get recent test results for ISP support team"""
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        if client_ip:
            cursor.execute("""
                SELECT * FROM test_results 
                WHERE client_ip = ? 
                ORDER BY timestamp DESC 
                LIMIT ?
            """, (client_ip, limit))
        else:
            cursor.execute("""
                SELECT * FROM test_results 
                ORDER BY timestamp DESC 
                LIMIT ?
            """, (limit,))
        
        results = [dict(row) for row in cursor.fetchall()]
        conn.close()
        
        return results
    
    def get_stats(self) -> Dict[str, Any]:
        """Get telemetry system statistics"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute("SELECT COUNT(*) FROM test_results")
        total_tests = cursor.fetchone()[0]
        
        cursor.execute("SELECT COUNT(DISTINCT client_ip) FROM test_results")
        unique_ips = cursor.fetchone()[0]
        
        cursor.execute("SELECT timestamp FROM test_results ORDER BY timestamp DESC LIMIT 1")
        last_test = cursor.fetchone()
        
        conn.close()
        
        return {
            "total_tests_stored": total_tests,
            "unique_client_ips": unique_ips,
            "last_test_time": last_test[0] if last_test else None,
            "max_stored_tests": self.max_stored_tests,
            "webhook_enabled": self.webhook_enabled,
            "webhook_url": self.webhook_url if self.webhook_enabled else None,
            "database_path": self.db_path
        }
    
    # Helper methods
    
    def _extract_grade_string(self, grade) -> Optional[str]:
        """Extract grade string from various grade formats"""
        if isinstance(grade, str):
            return grade
        elif isinstance(grade, dict):
            # Handle nested grade objects with 'letter' property
            if 'letter' in grade:
                return grade['letter']
            elif 'grade' in grade:
                return grade['grade']
        
        return None
    
    def _grade_to_score(self, grade) -> Optional[int]:
        """Convert letter grade to numeric score"""
        grade_map = {'A+': 100, 'A': 90, 'B': 80, 'C': 70, 'D': 60, 'F': 50}
        
        grade_string = self._extract_grade_string(grade)
        return grade_map.get(grade_string) if grade_string else None
    
    def _calculate_household_score(self, household_metrics: Dict) -> Optional[int]:
        """Calculate overall household score from individual user grades"""
        grades = [
            household_metrics.get('alex_performance'),
            household_metrics.get('sarah_performance'), 
            household_metrics.get('jake_performance'),
            household_metrics.get('computer_performance')
        ]
        
        scores = [self._grade_to_score(g) for g in grades if g]
        return int(sum(scores) / len(scores)) if scores else None
    
    def verify_api_key(self, provided_key: Optional[str]) -> bool:
        """Verify API key for telemetry endpoints"""
        if not self.telemetry_api_key:
            # No API key configured - allow access (backward compatibility)
            return True
        
        if not provided_key:
            return False
        
        # Simple constant-time comparison to prevent timing attacks
        import hmac
        return hmac.compare_digest(self.telemetry_api_key, provided_key)

# Global instance for ISP servers
isp_telemetry = ISPTelemetryManager()

# Integration function for existing telemetry endpoint
async def record_isp_test_result(results_data: Dict, client_ip: str, user_agent: str = "") -> str:
    """Record test result for ISP server (matches existing telemetry interface)"""
    return await isp_telemetry.record_test_result(results_data, client_ip, user_agent)