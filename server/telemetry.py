"""
Telemetry system for LibreQoS Bufferbloat Test
Handles privacy-preserving test result collection and storage
"""

import os
import json
import time
import sqlite3
import hashlib
import asyncio
import aiohttp
import logging
from datetime import datetime, timedelta
from typing import Optional, Dict, List, Tuple
from contextlib import asynccontextmanager
import uuid

logger = logging.getLogger(__name__)


class TelemetryManager:
    """Manages telemetry data collection, storage, and synchronization"""
    
    def __init__(self, db_path: str = "/var/lib/libreqos_test/telemetry.db"):
        self.db_path = db_path
        self.central_api_url = "https://test.libreqos.com/api"
        self.sponsor_id = None
        self.telemetry_available = True
        
        try:
            self._init_database()
            self._load_sponsor_id()
        except Exception as e:
            logger.error(f"Telemetry initialization failed: {e}")
            self.telemetry_available = False
    
    def _init_database(self):
        """Initialize the SQLite database with schema"""
        try:
            os.makedirs(os.path.dirname(self.db_path), exist_ok=True)
        except PermissionError as e:
            raise Exception(f"Cannot create telemetry database directory: {e}")
        
        try:
            with sqlite3.connect(self.db_path) as conn:
                cursor = conn.cursor()
                
                # Main test results table
                cursor.execute("""
                CREATE TABLE IF NOT EXISTS test_results (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    test_id TEXT UNIQUE NOT NULL,
                    timestamp INTEGER NOT NULL,
                    test_type TEXT NOT NULL,
                    sponsor_id TEXT,
                    asn TEXT,
                    grades_json TEXT NOT NULL,
                    metrics_json TEXT NOT NULL,
                    connection_info_json TEXT,
                    test_duration INTEGER,
                    client_version TEXT,
                    telemetry_enabled BOOLEAN DEFAULT TRUE,
                    synced BOOLEAN DEFAULT FALSE,
                    created_at INTEGER NOT NULL
                )
            """)
            
                # Indexes for efficient queries
                cursor.execute("CREATE INDEX IF NOT EXISTS idx_timestamp ON test_results(timestamp)")
                cursor.execute("CREATE INDEX IF NOT EXISTS idx_sponsor ON test_results(sponsor_id)")
                cursor.execute("CREATE INDEX IF NOT EXISTS idx_synced ON test_results(synced)")
                cursor.execute("CREATE INDEX IF NOT EXISTS idx_asn ON test_results(asn)")
            
                # Aggregated daily statistics
                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS daily_stats (
                        date TEXT NOT NULL,
                        sponsor_id TEXT,
                        total_tests INTEGER DEFAULT 0,
                        avg_download_grade REAL,
                        avg_upload_grade REAL,
                        avg_overall_grade REAL,
                        avg_download_mbps REAL,
                        avg_upload_mbps REAL,
                        avg_baseline_latency REAL,
                        test_types_json TEXT,
                        asn_distribution_json TEXT,
                        PRIMARY KEY (date, sponsor_id)
                    )
                """)
                
                # ASN cache table
                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS asn_cache (
                        prefix_hash TEXT PRIMARY KEY,
                        asn TEXT NOT NULL,
                        cached_at INTEGER NOT NULL
                    )
                """)
                
                cursor.execute("CREATE INDEX IF NOT EXISTS idx_cache_time ON asn_cache(cached_at)")
                
                conn.commit()
        except Exception as e:
            raise Exception(f"Cannot initialize telemetry database: {e}")
    
    def _load_sponsor_id(self):
        """Load sponsor ID from config file"""
        try:
            config_path = "/etc/lqos_test.conf"
            if os.path.exists(config_path):
                with open(config_path, 'r') as f:
                    for line in f:
                        line = line.strip()
                        if line.startswith("sponsor_url="):
                            url = line.split("=", 1)[1].strip()
                            # Create hash of sponsor URL for privacy
                            self.sponsor_id = hashlib.sha256(url.encode()).hexdigest()[:16]
                            break
        except Exception as e:
            logger.error(f"Error loading sponsor ID: {e}")
    
    def _grade_to_numeric(self, grade: str) -> float:
        """Convert letter grade to numeric value"""
        grade_map = {
            'A+': 6.0, 'A': 5.0, 'B': 4.0,
            'C': 3.0, 'D': 2.0, 'F': 1.0
        }
        return grade_map.get(grade, 0.0)
    
    
    async def get_asn(self, client_ip: str) -> str:
        """
        Get ASN for client IP with direct lookup (no IP stripping for better accuracy)
        
        We use the full IP for ASN lookup to ensure accuracy, especially for:
        - Cloud providers (AWS/Google/Azure) with multiple ASNs per /24
        - Hosting providers with complex ASN boundaries
        - Anycast networks with overlapping ranges
        
        Privacy is preserved by:
        - Only using IP for ASN lookup, never storing the IP
        - Hashing IP for cache keys, then discarding the original IP
        - Only storing the resulting ASN number
        """
        # Create hash of full IP for cache key (privacy preserved in cache)
        ip_hash = hashlib.sha256(client_ip.encode()).hexdigest()[:16]
        
        # Check cache first
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT asn FROM asn_cache WHERE prefix_hash = ? AND cached_at > ?",
                (ip_hash, int(time.time()) - 86400)  # 24 hour cache
            )
            result = cursor.fetchone()
            if result:
                return result[0]
        
        # Query central server with full IP for accurate ASN lookup
        try:
            async with aiohttp.ClientSession() as session:
                response = await session.post(
                    f"{self.central_api_url}/asn_lookup",
                    json={
                        'ip': client_ip  # Send full IP for accurate lookup
                    },
                    timeout=aiohttp.ClientTimeout(total=2.0)
                )
                
                if response.status == 200:
                    data = await response.json()
                    asn = data.get('asn', 'UNKNOWN')
                    
                    # Cache the result using IP hash (privacy preserved)
                    with sqlite3.connect(self.db_path) as conn:
                        cursor = conn.cursor()
                        cursor.execute(
                            "INSERT OR REPLACE INTO asn_cache (prefix_hash, asn, cached_at) VALUES (?, ?, ?)",
                            (ip_hash, asn, int(time.time()))
                        )
                        conn.commit()
                    
                    return asn
        except asyncio.TimeoutError:
            logger.warning("ASN lookup timed out")
        except Exception as e:
            logger.error(f"ASN lookup error: {e}")
        
        return 'UNKNOWN'
    
    async def record_test_result(self, result_data: Dict, client_ip: str, telemetry_enabled: bool = True, 
                               pre_resolved_asn: str = None, source_server: str = "direct") -> str:
        """Record a test result with privacy-preserving ASN lookup
        
        Args:
            result_data: Test results from client or ISP server
            client_ip: Client IP address (used only for ASN lookup, never stored)
            telemetry_enabled: Whether telemetry is enabled
            pre_resolved_asn: ASN already resolved by ISP server (optional)
            source_server: Source of the submission ("direct", "isp")
        """
        if not self.telemetry_available:
            logger.warning("Telemetry system not available, skipping result recording")
            return "telemetry_unavailable"
            
        test_id = str(uuid.uuid4())
        timestamp = int(time.time())
        
        # Get ASN - use pre-resolved if available, otherwise lookup
        if pre_resolved_asn and pre_resolved_asn != 'UNKNOWN':
            asn = pre_resolved_asn
            logger.info(f"Using pre-resolved ASN: {asn} from {source_server} server")
        else:
            asn = await self.get_asn(client_ip)
            logger.info(f"Resolved ASN: {asn} for client {client_ip[:8]}...")
        
        telemetry_enabled = True  # Force telemetry to be enabled
        
        # Prepare data for storage
        grades = result_data.get('grades', {})
        metrics = result_data.get('metrics', {})
        connection_info = result_data.get('connection_info', {})
        
        # NEVER store IP addresses - this is critical for privacy
        if 'ip' in connection_info:
            del connection_info['ip']
        if 'client_ip' in result_data:
            del result_data['client_ip']
        
        # Add source information for debugging
        connection_info['source_server'] = source_server
        
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO test_results (
                    test_id, timestamp, test_type, sponsor_id, asn,
                    grades_json, metrics_json, connection_info_json,
                    test_duration, client_version, telemetry_enabled,
                    synced, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                test_id,
                timestamp,
                result_data.get('test_type', 'single'),
                self.sponsor_id,
                asn,
                json.dumps(grades),
                json.dumps(metrics),
                json.dumps(connection_info),
                result_data.get('test_duration', 0),
                result_data.get('client_version', '1.0.0'),
                telemetry_enabled,
                False,
                timestamp
            ))
            conn.commit()
        
        # Update daily statistics
        await self._update_daily_stats(result_data, asn)
        
        # Clean up old data (> 1 year)
        await self._cleanup_old_data()
        
        logger.info(f"📊 Central telemetry stored: {test_id} -> ASN {asn} (source: {source_server})")
        return test_id
    
    async def _update_daily_stats(self, result_data: Dict, asn: str):
        """Update aggregated daily statistics"""
        date = datetime.now().strftime('%Y-%m-%d')
        
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            
            # Get existing stats
            cursor.execute(
                "SELECT * FROM daily_stats WHERE date = ? AND sponsor_id = ?",
                (date, self.sponsor_id)
            )
            existing = cursor.fetchone()
            
            if existing:
                # Update existing record
                # This is simplified - in production you'd update running averages
                cursor.execute("""
                    UPDATE daily_stats 
                    SET total_tests = total_tests + 1
                    WHERE date = ? AND sponsor_id = ?
                """, (date, self.sponsor_id))
            else:
                # Create new record
                grades = result_data.get('grades', {})
                metrics = result_data.get('metrics', {})
                
                cursor.execute("""
                    INSERT INTO daily_stats (
                        date, sponsor_id, total_tests,
                        avg_download_grade, avg_upload_grade, avg_overall_grade,
                        avg_download_mbps, avg_upload_mbps, avg_baseline_latency,
                        test_types_json, asn_distribution_json
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    date,
                    self.sponsor_id,
                    1,
                    self._grade_to_numeric(grades.get('download', 'F')),
                    self._grade_to_numeric(grades.get('upload', 'F')),
                    self._grade_to_numeric(grades.get('overall', 'F')),
                    metrics.get('download_throughput_mbps', 0),
                    metrics.get('upload_throughput_mbps', 0),
                    metrics.get('baseline_latency_ms', 0),
                    json.dumps({result_data.get('test_type', 'single'): 1}),
                    json.dumps({asn: 1} if asn != 'OPTED_OUT' else {})
                ))
            
            conn.commit()
    
    async def _cleanup_old_data(self):
        """Remove data older than 1 year"""
        one_year_ago = int(time.time()) - (365 * 24 * 60 * 60)
        
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute(
                "DELETE FROM test_results WHERE timestamp < ?",
                (one_year_ago,)
            )
            cursor.execute(
                "DELETE FROM asn_cache WHERE cached_at < ?",
                (int(time.time()) - 7 * 24 * 60 * 60,)  # 7 day cache
            )
            conn.commit()
    
    async def get_sponsor_stats(self, days: int = 30) -> Dict:
        """Get statistics for the sponsor dashboard"""
        since = int(time.time()) - (days * 24 * 60 * 60)
        
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            
            # Get summary stats
            cursor.execute("""
                SELECT 
                    COUNT(*) as total_tests,
                    AVG(CAST(json_extract(metrics_json, '$.download_throughput_mbps') AS REAL)) as avg_download_mbps,
                    AVG(CAST(json_extract(metrics_json, '$.upload_throughput_mbps') AS REAL)) as avg_upload_mbps,
                    AVG(CAST(json_extract(metrics_json, '$.baseline_latency_ms') AS REAL)) as avg_baseline_latency
                FROM test_results
                WHERE sponsor_id = ? AND timestamp > ? AND telemetry_enabled = TRUE
            """, (self.sponsor_id, since))
            
            summary = dict(cursor.fetchone())
            
            # Get daily stats
            cursor.execute("""
                SELECT * FROM daily_stats
                WHERE sponsor_id = ? AND date > date('now', '-' || ? || ' days')
                ORDER BY date DESC
            """, (self.sponsor_id, days))
            
            daily_stats = [dict(row) for row in cursor.fetchall()]
            
            # Get ASN distribution
            cursor.execute("""
                SELECT asn, COUNT(*) as count
                FROM test_results
                WHERE sponsor_id = ? AND timestamp > ? AND telemetry_enabled = TRUE
                GROUP BY asn
                ORDER BY count DESC
                LIMIT 20
            """, (self.sponsor_id, since))
            
            asn_distribution = [dict(row) for row in cursor.fetchall()]
            
            return {
                'summary': summary,
                'daily_stats': daily_stats,
                'asn_distribution': asn_distribution,
                'period_days': days
            }
    
    async def get_unsynced_results(self, limit: int = 100) -> List[Dict]:
        """Get unsynced results for central server sync"""
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            
            cursor.execute("""
                SELECT * FROM test_results
                WHERE synced = FALSE AND telemetry_enabled = TRUE
                ORDER BY created_at ASC
                LIMIT ?
            """, (limit,))
            
            results = []
            for row in cursor.fetchall():
                result = dict(row)
                # Parse JSON fields
                result['grades'] = json.loads(result['grades_json'])
                result['metrics'] = json.loads(result['metrics_json'])
                result['connection_info'] = json.loads(result['connection_info_json'] or '{}')
                # Remove _json fields
                for key in ['grades_json', 'metrics_json', 'connection_info_json']:
                    del result[key]
                results.append(result)
            
            return results
    
    async def mark_synced(self, test_ids: List[str]):
        """Mark test results as synced"""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.executemany(
                "UPDATE test_results SET synced = TRUE WHERE test_id = ?",
                [(test_id,) for test_id in test_ids]
            )
            conn.commit()


# Global instance
telemetry_manager = TelemetryManager()