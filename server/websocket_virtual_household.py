"""
Real Traffic Virtual Household System
Complete rewrite with genuine traffic generation and bidirectional measurement
Supports 30 concurrent users with real upload/download capabilities
"""

import asyncio
import json
import logging
import time
import os
from typing import Dict, Optional, Set, List
from dataclasses import dataclass, field
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Request
from fastapi.responses import JSONResponse
from starlette.websockets import WebSocketState
from websockets.exceptions import ConnectionClosed

logger = logging.getLogger(__name__)
router = APIRouter()

@dataclass
class UserProfile:
    """User profile with real traffic targets and burst patterns"""
    name: str
    download_mbps: float
    upload_mbps: float
    description: str
    activity_type: str
    # Burst pattern configuration
    burst_pattern: dict = None
    
    def __post_init__(self):
        if self.burst_pattern is None:
            self.burst_pattern = {'type': 'constant'}

@dataclass
class PerUserLatencyTracker:
    """Enhanced per-user latency tracking for bufferbloat observation with jitter detection"""
    user_id: str
    baseline_latency: float = 0.0      # Initial latency before congestion
    current_latency: float = 0.0       # Current measured latency
    latency_increase: float = 0.0      # Bufferbloat impact
    bufferbloat_severity: str = 'none' # none/mild/moderate/severe
    ping_history: list = None          # Recent ping measurements
    last_ping_time: float = 0.0        # Last ping timestamp
    ping_interval: float = 0.5         # Ping every 500ms for responsive UI
    baseline_established: bool = False # Whether baseline is set
    
    # Enhanced metrics for jitter detection
    ping_sequence: int = 0             # Sequence number for tracking
    total_pings: int = 0               # Total ping packets sent
    jitter: float = 0.0                # Current jitter (latency variance)
    min_latency: float = float('inf')  # Minimum latency observed
    max_latency: float = 0.0           # Maximum latency observed
    avg_latency: float = 0.0           # Average latency
    
    def __post_init__(self):
        if self.ping_history is None:
            self.ping_history = []
    
    def update_latency(self, latency_ms: float, sequence_num: int = None):
        """Enhanced latency update with jitter calculation"""
        self.current_latency = latency_ms
        current_time = time.time()
        
        # Update min/max latency
        self.min_latency = min(self.min_latency, latency_ms)
        self.max_latency = max(self.max_latency, latency_ms)
        
        # Track sequence numbers for monitoring (no loss calculation)
        if sequence_num is not None:
            self.ping_sequence = sequence_num
        
        self.total_pings += 1
        
        # Add to history with enhanced data
        self.ping_history.append({
            'timestamp': current_time,
            'latency_ms': latency_ms,
            'sequence': sequence_num
        })
        
        # Keep only recent history (last 60 seconds)
        cutoff_time = current_time - 60
        self.ping_history = [
            h for h in self.ping_history
            if h['timestamp'] > cutoff_time
        ]
        
        # Calculate average latency
        if self.ping_history:
            self.avg_latency = sum(h['latency_ms'] for h in self.ping_history) / len(self.ping_history)
        
        # Calculate jitter (standard deviation of latency)
        if len(self.ping_history) >= 2:
            latencies = [h['latency_ms'] for h in self.ping_history]
            mean_latency = sum(latencies) / len(latencies)
            variance = sum((lat - mean_latency) ** 2 for lat in latencies) / len(latencies)
            self.jitter = variance ** 0.5
        
        # Establish baseline (first 10 measurements)
        if not self.baseline_established and len(self.ping_history) >= 10:
            # Use average of first 10 measurements as baseline
            early_measurements = self.ping_history[:10]
            self.baseline_latency = sum(h['latency_ms'] for h in early_measurements) / len(early_measurements)
            self.baseline_established = True
        
        # Calculate bufferbloat impact
        if self.baseline_established and self.baseline_latency > 0:
            self.latency_increase = self.current_latency - self.baseline_latency
            
            # Enhanced bufferbloat severity classification
            if self.latency_increase < 10:
                self.bufferbloat_severity = 'none'
            elif self.latency_increase < 50:
                self.bufferbloat_severity = 'mild'
            elif self.latency_increase < 200:
                self.bufferbloat_severity = 'moderate'
            else:
                self.bufferbloat_severity = 'severe'
    
    def get_metrics(self) -> dict:
        """Get comprehensive latency metrics including jitter"""
        return {
            'baseline_latency': round(self.baseline_latency, 1),
            'current_latency': round(self.current_latency, 1),
            'min_latency': round(self.min_latency, 1) if self.min_latency != float('inf') else 0.0,
            'max_latency': round(self.max_latency, 1),
            'avg_latency': round(self.avg_latency, 1),
            'latency_increase': round(self.latency_increase, 1),
            'jitter': round(self.jitter, 2),
            'bufferbloat_severity': self.bufferbloat_severity,
            'baseline_established': self.baseline_established,
            'total_pings': self.total_pings,
            'ping_history_count': len(self.ping_history)
        }

@dataclass
class TrafficSession:
    """Real traffic session for a user"""
    user_id: str
    websocket: WebSocket
    profile: UserProfile
    start_time: float
    # Server-side tracking (bytes actually sent/received over network)
    server_sent_bytes: int = 0      # Bytes server successfully sent to client
    server_received_bytes: int = 0  # Bytes server actually received from client
    # Client-side tracking (bytes actually received/sent by client)
    client_received_bytes: int = 0  # Bytes client actually received from server
    client_sent_bytes: int = 0      # Bytes client actually sent to server
    last_update: float = 0
    active: bool = True
    # Throughput measurement windows
    measurement_window_start: float = 0
    measurement_interval: float = 1.0  # 1 second measurement windows
    # NEW: Per-user latency tracking
    latency_tracker: PerUserLatencyTracker = None
    latency_task: Optional[asyncio.Task] = None
    # NEW: Burst pattern state tracking
    burst_state: dict = None
    # RESOURCE LEAK FIX: Session health and timeout tracking
    last_activity: float = 0           # Last time session had activity
    max_session_duration: float = 300  # 5 minutes maximum session duration
    inactivity_timeout: float = 30     # 30 seconds inactivity timeout
    connection_test_failures: int = 0  # Count of consecutive connection test failures
    max_connection_failures: int = 3   # Max failures before marking inactive
    
    def __post_init__(self):
        if self.latency_tracker is None:
            self.latency_tracker = PerUserLatencyTracker(self.user_id)
        if self.burst_state is None:
            self.burst_state = {
                'phase': 'active',  # 'active' or 'pause'
                'phase_start_time': time.time(),
                'cycle_count': 0
            }
        # RESOURCE LEAK FIX: Initialize session health tracking
        if self.last_activity == 0:
            self.last_activity = self.start_time

class HighPerformanceDataPool:
    """High-performance pre-generated data pool for bulk traffic generation"""
    
    def __init__(self):
        self.bulk_pools = {}
        self._generate_bulk_pools()
        # WARMUP EFFICIENCY: Add warmup's exact 4MB pool approach
        self.WARMUP_CHUNK_SIZE = 1048576  # 1MB chunks like warmup
        self.WARMUP_POOL = os.urandom(self.WARMUP_CHUNK_SIZE * 4)  # 4MB pool like warmup
        logger.info("🚀 WARMUP POOL: Created 4MB warmup-style data pool for fixed 1MB chunks")
    
    def _generate_bulk_pools(self):
        """Generate large bulk data pools for high-throughput traffic"""
        logger.info("🚀 Generating high-performance bulk data pools...")
        
        # PERFORMANCE FIX: Generate larger pools to support high-throughput users
        # Include pools up to 64MB to support 1000 Mbps Computer user
        bulk_sizes = [1048576, 2097152, 4194304, 8388608, 16777216, 33554432, 67108864]  # 1MB to 64MB pools
        
        for size in bulk_sizes:
            logger.info(f"📦 Generating {size // 1048576}MB bulk data pool...")
            self.bulk_pools[size] = os.urandom(size)
        
        logger.info(f"✅ Generated {len(self.bulk_pools)} high-performance bulk data pools")
    
    def get_bulk_data(self, size: int) -> bytes:
        """High-performance bulk data generation for all throughput levels"""
        # PERFORMANCE FIX: Allow larger chunks to support high-throughput users
        # Increased limit to 64MB to support 1000 Mbps Computer user
        max_single_chunk = 67108864  # 64MB maximum per chunk
        if size > max_single_chunk:
            logger.warning(f"🔍 DATA POOL: Requested {size} bytes exceeds max chunk size {max_single_chunk}, capping")
            size = max_single_chunk
        
        # PERFORMANCE FIX: Use appropriately sized pools for efficient data generation
        # Find the smallest pool that can satisfy the request
        suitable_pools = [pool_size for pool_size in sorted(self.bulk_pools.keys()) if pool_size >= size]
        
        if suitable_pools:
            # Use the smallest pool that can satisfy the request
            chosen_pool_size = suitable_pools[0]
            return self.bulk_pools[chosen_pool_size][:size]
        else:
            # Request is larger than any pool, use the largest available
            largest_pool_size = max(self.bulk_pools.keys())
            return self.bulk_pools[largest_pool_size][:size]
    
    def get_warmup_chunk(self, chunk_count: int) -> bytes:
        """Get warmup-style fixed 1MB chunk from 4MB pool (exactly like warmup)"""
        # WARMUP EFFICIENCY: Use warmup's exact cycling approach
        chunk_offset = (chunk_count % 4) * self.WARMUP_CHUNK_SIZE
        return self.WARMUP_POOL[chunk_offset:chunk_offset + self.WARMUP_CHUNK_SIZE]

class HighPerformanceTrafficGenerator:
    """High-performance bulk traffic generator with async batching"""
    
    def __init__(self, data_pool: HighPerformanceDataPool):
        self.data_pool = data_pool
        # Pre-calculate optimal chunk sizes for different throughput targets
        # THROUGHPUT FIX: Chunk size thresholds increased 4x to achieve target speeds
        self.chunk_size_map = {
            1.0: 65536,      # 1 Mbps -> 64KB chunks
            5.0: 262144,     # 5 Mbps -> 256KB chunks
            25.0: 524288,    # 25 Mbps -> 512KB chunks (was 10 Mbps)
            100.0: 1048576,  # 100 Mbps -> 1MB chunks (was 25 Mbps)
            200.0: 2097152,  # 200 Mbps -> 2MB chunks (was 50 Mbps)
            400.0: 4194304,  # 400 Mbps -> 4MB chunks (was 100 Mbps)
            800.0: 8388608,  # 800 Mbps -> 8MB chunks (was 200 Mbps)
            1000.0: 16777216, # 1000 Mbps -> 16MB chunks (was 500 Mbps)
            2000.0: 33554432 # 2000 Mbps -> 32MB chunks (was 1000 Mbps)
        }
    
    # WARMUP EFFICIENCY: Removed _get_optimal_chunk_size method completely
    # Both downloads and uploads now use fixed 1MB chunks like warmup
    
    def get_current_effective_rate(self, session: TrafficSession, direction: str = 'download') -> float:
        """Calculate current effective rate based on burst pattern"""
        profile = session.profile
        burst_pattern = profile.burst_pattern
        
        if burst_pattern['type'] == 'constant':
            return profile.download_mbps if direction == 'download' else profile.upload_mbps
        
        current_time = time.time()
        phase_elapsed = current_time - session.burst_state['phase_start_time']
        
        if burst_pattern['type'] == 'netflix_adaptive':
            if session.burst_state['phase'] == 'active':
                # In burst phase
                if phase_elapsed >= burst_pattern['burst_duration']:
                    # Switch to pause phase
                    session.burst_state['phase'] = 'pause'
                    session.burst_state['phase_start_time'] = current_time
                    session.burst_state['cycle_count'] += 1
                    logger.info(f"📺 {session.user_id} Netflix: Switching to pause phase (cycle #{session.burst_state['cycle_count']})")
                    return burst_pattern['pause_rate'] if direction == 'download' else profile.upload_mbps
                else:
                    return burst_pattern['burst_rate'] if direction == 'download' else profile.upload_mbps
            else:
                # In pause phase
                if phase_elapsed >= burst_pattern['pause_duration']:
                    # Switch to burst phase
                    session.burst_state['phase'] = 'active'
                    session.burst_state['phase_start_time'] = current_time
                    logger.info(f"📺 {session.user_id} Netflix: Switching to burst phase (filling buffer)")
                    return burst_pattern['burst_rate'] if direction == 'download' else profile.upload_mbps
                else:
                    return burst_pattern['pause_rate'] if direction == 'download' else profile.upload_mbps
        
        elif burst_pattern['type'] == 'update_bursts':
            if session.burst_state['phase'] == 'active':
                # In burst phase
                if phase_elapsed >= burst_pattern['burst_duration']:
                    # Switch to pause phase
                    session.burst_state['phase'] = 'pause'
                    session.burst_state['phase_start_time'] = current_time
                    session.burst_state['cycle_count'] += 1
                    logger.info(f"💻 {session.user_id} Updates: Switching to background sync (cycle #{session.burst_state['cycle_count']})")
                    return burst_pattern['pause_rate'] if direction == 'download' else profile.upload_mbps
                else:
                    return burst_pattern['burst_rate'] if direction == 'download' else profile.upload_mbps
            else:
                # In pause phase (background sync)
                if phase_elapsed >= burst_pattern['pause_duration']:
                    # Switch to burst phase
                    session.burst_state['phase'] = 'active'
                    session.burst_state['phase_start_time'] = current_time
                    logger.info(f"💻 {session.user_id} Updates: Switching to active download")
                    return burst_pattern['burst_rate'] if direction == 'download' else profile.upload_mbps
                else:
                    return burst_pattern['pause_rate'] if direction == 'download' else profile.upload_mbps
        
        # Fallback to profile defaults
        return profile.download_mbps if direction == 'download' else profile.upload_mbps

    async def generate_download_traffic_bulk(self, session: TrafficSession, duration_ms: int = 250):
        """RESOURCE LEAK FIX: Memory-efficient bulk download traffic generation with 4-stream multiplexing for high-throughput users"""
        start_time = time.time()
        try:
            # RESOURCE LEAK FIX: Pre-generation session validation
            if not session.active:
                logger.debug(f"🔍 TRAFFIC GEN: {session.user_id} - Session not active, aborting")
                return 0
            
            # RESOURCE LEAK FIX: Active connection test before traffic generation
            ws_state = session.websocket.client_state
            if ws_state != WebSocketState.CONNECTED:
                logger.warning(f"🔍 TRAFFIC GEN: {session.user_id} - WebSocket not connected: {ws_state}, marking inactive")
                session.active = False
                return 0
            
            # Get current effective download rate based on burst pattern
            effective_download_mbps = self.get_current_effective_rate(session, 'download')
            target_bytes = int((effective_download_mbps * 1_000_000 / 8) * (duration_ms / 1000))
            
            # THROUGHPUT FIX: Debug log to identify 4x conservative issue
            logger.info(f"🔍 THROUGHPUT DEBUG: {session.user_id} - Profile speed: {session.profile.download_mbps} Mbps, Effective: {effective_download_mbps} Mbps, Target bytes: {target_bytes}")
            
            # DIAGNOSTIC: Log traffic generation parameters with burst pattern info
            logger.info(f"🔍 TRAFFIC GEN: {session.user_id} - Target: {target_bytes} bytes "
                       f"({effective_download_mbps} Mbps effective rate × {duration_ms}ms) "
                       f"[Profile: {session.profile.download_mbps} Mbps, Pattern: {session.profile.burst_pattern['type']}]")
            
            # Log burst state for non-constant patterns
            if session.profile.burst_pattern['type'] != 'constant':
                logger.info(f"🔍 BURST STATE: {session.user_id} - Phase: {session.burst_state['phase']}, "
                           f"Cycle: #{session.burst_state['cycle_count']}")
            
            if target_bytes <= 0:
                logger.warning(f"🔍 TRAFFIC GEN: {session.user_id} - Zero target bytes!")
                return 0
            
            # ALL USERS: Keep interval-based realistic patterns with warmup chunks
            optimal_chunk_size = 1048576  # Fixed 1MB chunks like warmup
            logger.info(f"🚀 WARMUP STYLE: {session.user_id} - Using fixed 1MB chunks")
            
            logger.info(f"🔍 TRAFFIC GEN: {session.user_id} - Target: {target_bytes} bytes, Chunk size: {optimal_chunk_size} bytes")
            
            # ADAPTIVE/WARMUP: Single chunk case when target fits in one chunk
            if target_bytes <= optimal_chunk_size:
                try:
                    if session.user_id.startswith('computer_'):
                        logger.info(f"🚀 COMPUTER ADAPTIVE: {session.user_id} - Single large chunk: {target_bytes} bytes")
                        # COMPUTER OPTIMIZATION: Use bulk data generation for large chunks
                        bulk_data = self.data_pool.get_bulk_data(target_bytes)
                    else:
                        logger.info(f"🚀 WARMUP STYLE: {session.user_id} - Single chunk mode: {target_bytes} bytes")
                        # WARMUP EFFICIENCY: Use warmup pool for small chunks
                        bulk_data = self.data_pool.WARMUP_POOL[:target_bytes]
                    
                    send_start = time.time()
                    await session.websocket.send_bytes(bulk_data)
                    send_duration = time.time() - send_start
                    
                    session.server_sent_bytes += target_bytes
                    # Update measurement window for current rate calculation
                    RealTrafficMeasurement.update_measurement_window(session, 'download', target_bytes)
                    logger.info(f"🚀 WARMUP-STYLE: {session.user_id} - SUCCESS: Sent {target_bytes} bytes "
                               f"in {send_duration*1000:.1f}ms")
                    return target_bytes
                    
                except (ConnectionClosed, WebSocketDisconnect) as e:
                    # WARMUP EFFICIENCY: Natural WebSocket disconnection
                    logger.info(f"📡 WARMUP-STYLE: {session.user_id} - WebSocket disconnected during single chunk: {type(e).__name__}")
                    session.active = False
                    return 0
                    
                except Exception as e:
                    logger.error(f"❌ WARMUP-STYLE: {session.user_id} - Single chunk send failed: {e}")
                    session.active = False
                    return 0
            
            # MEMORY OPTIMIZATION: Stream chunks instead of pre-generating all data
            logger.info(f"🔍 TRAFFIC GEN: {session.user_id} - Streaming chunk mode: {target_bytes} bytes")
            bytes_sent = 0
            remaining = target_bytes
            chunk_count = 0
            
            # Calculate total chunks for logging - adaptive for computer, fixed for others
            total_chunks = (target_bytes + optimal_chunk_size - 1) // optimal_chunk_size
            logger.info(f"🚀 ADAPTIVE: {session.user_id} - Will stream {total_chunks} chunks of {optimal_chunk_size//1048576}MB each")
            
            # WARMUP EFFICIENCY: Minimal delays like warmup for maximum throughput
            send_start = time.time()
            # PERFORMANCE OPTIMIZATION: Even more minimal delays than before
            # Warmup uses only 1ms between 1MB chunks, we'll use similar approach
            micro_batch_delay = 0.001 if total_chunks > 50 else 0  # 1ms only for very large transfers (50+ chunks)
            
            # ADAPTIVE EFFICIENCY: Exception-based approach with optimal chunk sizes
            # Computer user gets large chunks for saturation, others get 1MB warmup chunks
            # Eliminate all proactive WebSocket state checks that cause latency overhead
            while remaining > 0:
                chunk_size = min(optimal_chunk_size, remaining)
                chunk_count += 1
                
                try:
                    # ADAPTIVE CHUNK GENERATION: Computer uses bulk data, others use warmup pool
                    if session.user_id.startswith('computer_'):
                        # COMPUTER OPTIMIZATION: Use bulk data for large chunks
                        chunk_data = self.data_pool.get_bulk_data(chunk_size)
                    elif chunk_size == 1048576:  # 1MB chunks for other users
                        # WARMUP EFFICIENCY: Use warmup's cycling approach for 1MB chunks
                        chunk_data = self.data_pool.get_warmup_chunk(chunk_count)
                    else:
                        # WARMUP EFFICIENCY: Use warmup pool for partial chunks
                        chunk_data = self.data_pool.WARMUP_POOL[:chunk_size]
                    
                    chunk_send_start = time.time()
                    await session.websocket.send_bytes(chunk_data)
                    chunk_send_duration = time.time() - chunk_send_start
                    
                    bytes_sent += chunk_size
                    remaining -= chunk_size
                    session.server_sent_bytes += chunk_size
                    # Update measurement window for current rate calculation
                    RealTrafficMeasurement.update_measurement_window(session, 'download', chunk_size)
                    
                    # Log first and last chunk, plus every 10th chunk for high-throughput users
                    if chunk_count == 1 or chunk_count == total_chunks or (chunk_count % 10 == 0 and effective_download_mbps > 100):
                        if session.user_id.startswith('computer_'):
                            logger.info(f"🚀 COMPUTER ADAPTIVE: {session.user_id} - Chunk {chunk_count}/{total_chunks}: "
                                       f"{chunk_size} bytes in {chunk_send_duration*1000:.1f}ms")
                        else:
                            logger.info(f"🚀 WARMUP STYLE: {session.user_id} - Chunk {chunk_count}/{total_chunks}: "
                                       f"{chunk_size} bytes in {chunk_send_duration*1000:.1f}ms")
                    
                    # WARMUP EFFICIENCY: Minimal delay like warmup's 1ms pattern
                    if micro_batch_delay > 0 and chunk_count % 10 == 0:  # Every 10th chunk only
                        await asyncio.sleep(micro_batch_delay)
                    
                    # EFFICIENT TEST STOP: Only check session.active periodically, not WebSocket state
                    # Let WebSocket exceptions handle connection issues naturally
                    if chunk_count % 20 == 0 and not session.active:
                        logger.info(f"🛑 WARMUP-STYLE: {session.user_id} - Test ended, stopping traffic generation")
                        break
                        
                except (ConnectionClosed, WebSocketDisconnect) as e:
                    # WARMUP EFFICIENCY: Natural WebSocket disconnection - no proactive checks needed
                    logger.info(f"📡 WARMUP-STYLE: {session.user_id} - WebSocket disconnected naturally: {type(e).__name__}")
                    session.active = False
                    break
                    
                except Exception as e:
                    # Other errors (encoding, memory, etc.)
                    logger.error(f"❌ WARMUP-STYLE: {session.user_id} - Chunk {chunk_count} send failed: {e}")
                    session.active = False
                    break
            
            send_duration = time.time() - send_start
            total_duration = time.time() - start_time
            
            logger.info(f"🔍 TRAFFIC GEN: {session.user_id} - COMPLETE: {bytes_sent}/{target_bytes} bytes "
                       f"({bytes_sent/target_bytes*100:.1f}%) in {total_duration*1000:.1f}ms "
                       f"(send: {send_duration*1000:.1f}ms)")
            
            # Calculate actual throughput achieved
            if total_duration > 0:
                actual_mbps = (bytes_sent * 8) / (total_duration * 1_000_000)
                logger.info(f"🔍 TRAFFIC GEN: {session.user_id} - Actual rate: {actual_mbps:.2f} Mbps "
                           f"(target: {session.profile.download_mbps} Mbps)")
            
            return bytes_sent
            
        except Exception as e:
            total_duration = time.time() - start_time
            logger.error(f"🔍 TRAFFIC GEN: {session.user_id} - FATAL ERROR after {total_duration*1000:.1f}ms: {e}")
            logger.error(f"🔍 TRAFFIC GEN: {session.user_id} - WebSocket state: {session.websocket.client_state}")
            return 0
    
    
    async def _send_multistream_data(self, session: TrafficSession, target_bytes: int, stream_chunk_size: int, effective_download_mbps: float) -> int:
        """Send data using 4 parallel streams to avoid WebSocket choking"""
        try:
            bytes_per_stream = target_bytes // 4
            remaining_bytes = target_bytes % 4  # Handle any remainder
            
            logger.info(f"🚀 MULTISTREAM: {session.user_id} - Starting 4 parallel streams, {bytes_per_stream} bytes each")
            
            # Create 4 concurrent stream tasks
            stream_tasks = []
            for stream_id in range(4):
                stream_bytes = bytes_per_stream + (1 if stream_id < remaining_bytes else 0)  # Distribute remainder
                if stream_bytes > 0:
                    task = asyncio.create_task(
                        self._send_single_stream(session, stream_id, stream_bytes, stream_chunk_size, effective_download_mbps)
                    )
                    stream_tasks.append(task)
            
            # Wait for all streams to complete
            results = await asyncio.gather(*stream_tasks, return_exceptions=True)
            
            # Calculate total bytes sent
            total_bytes_sent = 0
            for i, result in enumerate(results):
                if isinstance(result, Exception):
                    logger.error(f"🚀 MULTISTREAM: {session.user_id} - Stream {i} failed: {result}")
                else:
                    total_bytes_sent += result
                    logger.info(f"🚀 MULTISTREAM: {session.user_id} - Stream {i} completed: {result} bytes")
            
            logger.info(f"🚀 MULTISTREAM: {session.user_id} - All streams complete: {total_bytes_sent}/{target_bytes} bytes")
            return total_bytes_sent
            
        except Exception as e:
            logger.error(f"🚀 MULTISTREAM: {session.user_id} - Fatal error: {e}")
            return 0
    
    async def _send_single_stream(self, session: TrafficSession, stream_id: int, stream_bytes: int, chunk_size: int, effective_download_mbps: float) -> int:
        """Send data for a single stream within the multistream approach"""
        bytes_sent = 0
        remaining = stream_bytes
        chunk_count = 0
        
        try:
            while remaining > 0 and session.websocket.client_state == WebSocketState.CONNECTED and session.active:
                current_chunk_size = min(chunk_size, remaining)
                chunk_count += 1
                
                # Generate chunk data
                chunk_data = self.data_pool.get_bulk_data(current_chunk_size)
                
                # Create stream message with metadata
                stream_message = {
                    'type': 'multistream_data',
                    'stream_id': stream_id,
                    'chunk_id': chunk_count,
                    'data_size': current_chunk_size,
                    'timestamp': time.time() * 1000
                }
                
                # Send metadata first, then binary data
                await session.websocket.send_text(json.dumps(stream_message))
                await session.websocket.send_bytes(chunk_data)
                
                bytes_sent += current_chunk_size
                remaining -= current_chunk_size
                session.server_sent_bytes += current_chunk_size
                
                # Update measurement window
                RealTrafficMeasurement.update_measurement_window(session, 'download', current_chunk_size)
                
                # Small delay between chunks for flow control
                if effective_download_mbps > 300 and chunk_count % 2 == 0:
                    await asyncio.sleep(0.001)  # 1ms delay every 2nd chunk
                
                # Check session status periodically
                if chunk_count % 5 == 0 and not session.active:
                    logger.info(f"🚀 STREAM-{stream_id}: {session.user_id} - Session inactive, aborting")
                    break
                    
            logger.info(f"🚀 STREAM-{stream_id}: {session.user_id} - Complete: {bytes_sent}/{stream_bytes} bytes")
            return bytes_sent
            
        except Exception as e:
            logger.error(f"🚀 STREAM-{stream_id}: {session.user_id} - Error: {e}")
            return bytes_sent

    async def request_upload_traffic_bulk(self, session: TrafficSession, duration_ms: int = 250):
        """RESOURCE LEAK FIX: Request bulk upload traffic from client with connection safeguards"""
        try:
            # RESOURCE LEAK FIX: Pre-request session validation
            if not session.active:
                logger.debug(f"🔍 UPLOAD REQUEST: {session.user_id} - Session not active, aborting")
                return
            
            # RESOURCE LEAK FIX: Check connection state before upload request
            if session.websocket.client_state != WebSocketState.CONNECTED:
                logger.warning(f"🔍 UPLOAD REQUEST: {session.user_id} - WebSocket not connected: {session.websocket.client_state}, marking inactive")
                session.active = False
                return
            
            # Get current effective upload rate based on burst pattern
            effective_upload_mbps = self.get_current_effective_rate(session, 'upload')
            target_bytes = int((effective_upload_mbps * 1_000_000 / 8) * (duration_ms / 1000))
            
            logger.info(f"🚀 WARMUP UPLOAD: {session.user_id} - Target: {target_bytes} bytes "
                       f"({effective_upload_mbps} Mbps effective rate × {duration_ms}ms) "
                       f"[Profile: {session.profile.upload_mbps} Mbps, Fixed 1MB chunks]")
            
            if target_bytes <= 0:
                logger.warning(f"🔍 UPLOAD REQUEST: {session.user_id} - Zero target bytes!")
                return
            
            # WARMUP EFFICIENCY: Use fixed 1MB chunks for uploads too (same as downloads)
            WARMUP_UPLOAD_CHUNK_SIZE = 1048576  # Fixed 1MB chunks like warmup
            
            # Request client to send bulk data with fixed warmup-style chunk size
            upload_request = {
                'type': 'real_upload_request',
                'target_bytes': target_bytes,
                'optimal_chunk_size': WARMUP_UPLOAD_CHUNK_SIZE,  # Fixed 1MB chunks
                'duration_ms': duration_ms,
                'timestamp': time.time() * 1000
            }
            
            await session.websocket.send_text(json.dumps(upload_request))
            logger.info(f"🚀 WARMUP UPLOAD: {session.user_id} - SUCCESS: Sent upload request for {target_bytes} bytes with fixed 1MB chunks")
                
        except Exception as e:
            logger.error(f"🔍 UPLOAD REQUEST: {session.user_id} - FAILED: {e}")
            # RESOURCE LEAK FIX: Mark session inactive on upload request failure
            session.active = False

class RealTrafficMeasurement:
    """Real-time measurement of actual network traffic with current rate calculation"""
    
    @staticmethod
    def calculate_throughput(bytes_transferred: int, elapsed_seconds: float) -> float:
        """Calculate real throughput in Mbps from actual bytes transferred"""
        if elapsed_seconds <= 0:
            return 0.0
        return (bytes_transferred * 8) / (elapsed_seconds * 1_000_000)
    
    @staticmethod
    def calculate_current_rate(session: TrafficSession, direction: str = 'download') -> float:
        """Calculate current throughput rate using recent measurement window"""
        current_time = time.time()
        
        # Initialize measurement window tracking if not present
        if not hasattr(session, 'measurement_windows'):
            session.measurement_windows = {
                'download': {'bytes': 0, 'start_time': current_time},
                'upload': {'bytes': 0, 'start_time': current_time}
            }
        
        window = session.measurement_windows[direction]
        window_duration = current_time - window['start_time']
        
        # Reset window every 2 seconds for current rate calculation
        if window_duration >= 2.0:
            # Calculate current rate from this window
            if window_duration > 0:
                current_rate_mbps = (window['bytes'] * 8) / (window_duration * 1_000_000)
            else:
                current_rate_mbps = 0.0
            
            # Reset window for next measurement
            session.measurement_windows[direction] = {
                'bytes': 0,
                'start_time': current_time
            }
            
            return current_rate_mbps
        else:
            # Window still accumulating, return last calculated rate or 0
            return getattr(session, f'last_{direction}_rate', 0.0)
    
    @staticmethod
    def update_measurement_window(session: TrafficSession, direction: str, bytes_added: int):
        """Update measurement window with new bytes"""
        current_time = time.time()
        
        # Initialize if not present
        if not hasattr(session, 'measurement_windows'):
            session.measurement_windows = {
                'download': {'bytes': 0, 'start_time': current_time},
                'upload': {'bytes': 0, 'start_time': current_time}
            }
        
        # Add bytes to current window
        session.measurement_windows[direction]['bytes'] += bytes_added
    
    @staticmethod
    def get_session_metrics(session: TrafficSession) -> dict:
        """Get real-time metrics for a session based on actual network transfer"""
        current_time = time.time()
        elapsed = current_time - session.start_time
        
        # Calculate current rates using measurement windows (not cumulative averages)
        current_download_mbps = RealTrafficMeasurement.calculate_current_rate(session, 'download')
        current_upload_mbps = RealTrafficMeasurement.calculate_current_rate(session, 'upload')
        
        # Store current rates for next calculation
        session.last_download_rate = current_download_mbps
        session.last_upload_rate = current_upload_mbps
        
        # Keep cumulative measurements for debugging
        cumulative_download_mbps = RealTrafficMeasurement.calculate_throughput(session.client_received_bytes, elapsed)
        cumulative_upload_mbps = RealTrafficMeasurement.calculate_throughput(session.client_sent_bytes, elapsed)
        
        # Keep server-side measurements for comparison/debugging
        server_download_mbps = RealTrafficMeasurement.calculate_throughput(session.server_sent_bytes, elapsed)
        server_upload_mbps = RealTrafficMeasurement.calculate_throughput(session.server_received_bytes, elapsed)
        
        # Get comprehensive latency metrics including jitter and loss
        latency_metrics = session.latency_tracker.get_metrics()
        
        return {
            'user_id': session.user_id,
            'profile_name': session.profile.name,
            'target_upload_mbps': session.profile.upload_mbps,
            'target_download_mbps': session.profile.download_mbps,
            # CURRENT network measurements (real-time rates, not cumulative averages)
            'actual_upload_mbps': round(current_upload_mbps, 2),
            'actual_download_mbps': round(current_download_mbps, 2),
            # Cumulative measurements for comparison
            'cumulative_upload_mbps': round(cumulative_upload_mbps, 2),
            'cumulative_download_mbps': round(cumulative_download_mbps, 2),
            # Server-side measurements for debugging (what server thinks it sent - often fake)
            'server_calculated_upload_mbps': round(server_upload_mbps, 2),
            'server_calculated_download_mbps': round(server_download_mbps, 2),
            # Byte counts
            'server_sent_bytes': session.server_sent_bytes,
            'server_received_bytes': session.server_received_bytes,
            'client_received_bytes': session.client_received_bytes,
            'client_sent_bytes': session.client_sent_bytes,
            'elapsed_seconds': round(elapsed, 1),
            'active': session.active,
            'timestamp': current_time * 1000,
            # Enhanced latency metrics (ping, jitter)
            'latency_metrics': latency_metrics,
            'ping_ms': latency_metrics['current_latency'],
            'jitter_ms': latency_metrics['jitter'],
            'bufferbloat_severity': latency_metrics['bufferbloat_severity'],
            # Legacy bufferbloat metrics for backward compatibility
            'bufferbloat_metrics': latency_metrics,
            # Diagnostic information
            'measurement_source': 'current_rate_windows',
            'fake_data_warning': session.client_received_bytes == 0 and session.server_sent_bytes > 0
        }

class HighPerformanceSessionManager:
    """High-performance session manager optimized for bulk traffic generation"""
    
    def __init__(self):
        self.sessions: Dict[str, TrafficSession] = {}
        self.data_pool = HighPerformanceDataPool()
        self.traffic_generator = HighPerformanceTrafficGenerator(self.data_pool)
        self.measurement = RealTrafficMeasurement()
        self.max_users = 30
        self.update_interval = 0.25  # 250ms updates - reverting to stable baseline
        
        # User profiles with realistic traffic patterns for household simulation
        self.user_profiles = {
            'alex': UserProfile(
                name='Alex (Gamer)',
                download_mbps=1.5,
                upload_mbps=0.75,
                description='Competitive gaming with low latency needs',
                activity_type='gaming',
                burst_pattern={'type': 'constant'}
            ),
            'sarah': UserProfile(
                name='Sarah (Video Call)',
                download_mbps=2.5,
                upload_mbps=2.5,
                description='HD video conferencing',
                activity_type='video_call',
                burst_pattern={'type': 'constant'}
            ),
            'jake': UserProfile(
                name='Jake (Netflix)',
                download_mbps=25.0,
                upload_mbps=0.1,
                description='HD Netflix streaming with realistic buffering (5 Mbps average)',
                activity_type='streaming',
                burst_pattern={
                    'type': 'netflix_adaptive',
                    'burst_duration': 1.0,    # 1 second at 25 Mbps
                    'pause_duration': 4.0,    # 4 seconds at 0 Mbps
                    'burst_rate': 25.0,       # 25 Mbps during burst
                    'pause_rate': 0.0         # 0 Mbps during pause
                }
            ),
            'computer': UserProfile(
                name='Computer (Updates)',
                download_mbps=1000.0,  # 1 Gbps default
                upload_mbps=0.1,
                description='High-speed downloads (1 Gbps)',
                activity_type='bulk_transfer',
                burst_pattern={'type': 'constant'}
            )
        }
        
        # Background tasks
        self.update_task: Optional[asyncio.Task] = None
        self.running = False
        
        logger.info(f"🏠 Real Traffic Virtual Household initialized (max {self.max_users} users)")
    
    def update_computer_profile(self, measured_speed_mbps: float):
        """Update Computer user profile based on measured connection speed"""
        try:
            # Apply bandwidth cap to prevent excessive usage
            MAX_COMPUTER_SPEED = 1000.0  # 1000 Mbps upper limit
            capped_speed = min(measured_speed_mbps, MAX_COMPUTER_SPEED)
            
            if capped_speed < measured_speed_mbps:
                logger.info(f"🔧 ADAPTIVE: Capping Computer speed from {measured_speed_mbps} Mbps to {capped_speed} Mbps (bandwidth conservation)")
            
            # Update the Computer profile with capped speed
            self.user_profiles['computer'].download_mbps = capped_speed
            description = f'Adaptive high-speed downloads ({capped_speed} Mbps based on connection test'
            if capped_speed < measured_speed_mbps:
                description += f', capped from {measured_speed_mbps} Mbps'
            description += ')'
            self.user_profiles['computer'].description = description
            
            logger.info(f"🔧 ADAPTIVE: Updated Computer profile to {capped_speed} Mbps")
            
            # Update any existing Computer sessions with new profile
            for user_id, session in self.sessions.items():
                if user_id.startswith('computer_') and session.active:
                    session.profile.download_mbps = capped_speed
                    session.profile.description = description
                    logger.info(f"🔧 ADAPTIVE: Updated active Computer session {user_id} to {capped_speed} Mbps")
            
            return True
        except Exception as e:
            logger.error(f"❌ Error updating Computer profile: {e}")
            return False
    
    def get_adaptive_profiles(self, computer_speed_mbps: float) -> dict:
        """Get user profiles with adaptive Computer speed"""
        try:
            adaptive_profiles = {}
            for key, profile in self.user_profiles.items():
                if key == 'computer':
                    # Create adaptive Computer profile
                    adaptive_profiles[key] = {
                        'name': 'Computer (Updates)',
                        'download_mbps': computer_speed_mbps,
                        'upload_mbps': profile.upload_mbps,
                        'description': f'Adaptive high-speed downloads ({computer_speed_mbps} Mbps based on connection test)',
                        'activity_type': profile.activity_type
                    }
                else:
                    # Keep other profiles unchanged
                    adaptive_profiles[key] = {
                        'name': profile.name,
                        'download_mbps': profile.download_mbps,
                        'upload_mbps': profile.upload_mbps,
                        'description': profile.description,
                        'activity_type': profile.activity_type
                    }
            
            return adaptive_profiles
        except Exception as e:
            logger.error(f"❌ Error creating adaptive profiles: {e}")
            return {}
    
    async def test_connection_health(self, session: TrafficSession) -> bool:
        """RESOURCE LEAK FIX: Test if WebSocket connection is actually healthy"""
        try:
            # Quick connection state check first
            if session.websocket.client_state != WebSocketState.CONNECTED:
                logger.debug(f"🔍 CONNECTION_TEST: {session.user_id} - WebSocket state not connected: {session.websocket.client_state}")
                return False
            
            # Active connection test with small ping
            connection_test = {
                'type': 'connection_test',
                'user_id': session.user_id,
                'timestamp': time.time() * 1000
            }
            
            # Send test message with timeout
            await asyncio.wait_for(
                session.websocket.send_text(json.dumps(connection_test)),
                timeout=1.0
            )
            
            # Update activity timestamp on successful test
            session.last_activity = time.time()
            session.connection_test_failures = 0
            return True
            
        except asyncio.TimeoutError:
            logger.warning(f"🔍 CONNECTION_TEST: {session.user_id} - Timeout during connection test")
            session.connection_test_failures += 1
            return False
        except Exception as e:
            logger.warning(f"🔍 CONNECTION_TEST: {session.user_id} - Connection test failed: {e}")
            session.connection_test_failures += 1
            return False
    
    def is_session_expired(self, session: TrafficSession) -> bool:
        """RESOURCE LEAK FIX: Check if session has expired due to timeout or duration"""
        current_time = time.time()
        inactive_duration = current_time - session.last_activity
        total_duration = current_time - session.start_time
        
        # Check inactivity timeout
        if inactive_duration > session.inactivity_timeout:
            logger.info(f"🔍 SESSION_EXPIRED: {session.user_id} - Inactive for {inactive_duration:.1f}s (limit: {session.inactivity_timeout}s)")
            return True
        
        # TRAFFIC CONTINUATION FIX: Much shorter session durations to prevent runaway traffic
        # Virtual Household tests only run for 30s, so sessions should not persist much longer
        if session.profile.download_mbps > 100.0:
            max_duration = 45  # 45 seconds for high-throughput users (15s grace period after 30s test)
        else:
            max_duration = 60  # 60 seconds for normal users (30s grace period)
            
        if total_duration > max_duration:
            logger.info(f"🔍 SESSION_EXPIRED: {session.user_id} - Total duration {total_duration:.1f}s (limit: {max_duration}s, high-throughput: {session.profile.download_mbps > 100.0})")
            return True
        
        # Check connection test failures
        if session.connection_test_failures >= session.max_connection_failures:
            logger.info(f"🔍 SESSION_EXPIRED: {session.user_id} - Too many connection failures ({session.connection_test_failures}/{session.max_connection_failures})")
            return True
        
        return False
    
    async def cleanup_inactive_sessions(self) -> List[str]:
        """RESOURCE LEAK FIX: Clean up inactive and expired sessions FIRST"""
        cleanup_list = []
        current_time = time.time()
        
        for user_id, session in list(self.sessions.items()):
            should_cleanup = False
            cleanup_reason = ""
            
            # Check if session is marked inactive
            if not session.active:
                should_cleanup = True
                cleanup_reason = "marked_inactive"
            
            # Check if session has expired
            elif self.is_session_expired(session):
                should_cleanup = True
                cleanup_reason = "expired"
                session.active = False  # Mark as inactive
            
            # Check WebSocket state
            elif session.websocket.client_state != WebSocketState.CONNECTED:
                should_cleanup = True
                cleanup_reason = f"websocket_state_{session.websocket.client_state}"
                session.active = False  # Mark as inactive
            
            if should_cleanup:
                logger.info(f"🧹 CLEANUP: {user_id} - Reason: {cleanup_reason}, Duration: {current_time - session.start_time:.1f}s")
                cleanup_list.append(user_id)
        
        # Perform cleanup
        for user_id in cleanup_list:
            await self.stop_session(user_id)
        
        if cleanup_list:
            logger.info(f"🧹 CLEANUP: Removed {len(cleanup_list)} inactive sessions: {cleanup_list}")
        
        return cleanup_list
    
    async def start_session(self, user_id: str, websocket: WebSocket) -> bool:
        """Start a new real traffic session"""
        try:
            logger.info(f"🔍 SESSION_START: start_session called for {user_id}")
            
            # Check capacity
            if len(self.sessions) >= self.max_users:
                logger.warning(f"⚠️ Maximum users ({self.max_users}) reached, rejecting {user_id}")
                return False
            
            logger.info(f"🔍 SESSION_START: Capacity check passed for {user_id}")
            
            # Accept WebSocket connection
            logger.info(f"🔍 SESSION_START: Accepting WebSocket connection for {user_id}")
            logger.info(f"🔍 SESSION_START: WebSocket state before accept: {websocket.client_state}")
            await websocket.accept()
            logger.info(f"🔍 SESSION_START: WebSocket accepted for {user_id}")
            logger.info(f"🔍 SESSION_START: WebSocket state after accept: {websocket.client_state}")
            
            # Extract user type from user_id (e.g., "alex_1748955310342" -> "alex")
            user_type = user_id.split('_')[0].lower()
            profile = self.user_profiles.get(user_type, self.user_profiles['computer'])
            logger.info(f"🔍 SESSION_START: Extracted user type '{user_type}' from '{user_id}', using profile {profile.name}")
            
            # Create session
            session = TrafficSession(
                user_id=user_id,
                websocket=websocket,
                profile=profile,
                start_time=time.time()
            )
            logger.info(f"🔍 SESSION_START: TrafficSession created for {user_id}")
            
            self.sessions[user_id] = session
            logger.info(f"🔍 SESSION_START: Session added to sessions dict for {user_id}")
            
            # Start latency tracking task for this user
            logger.info(f"🔍 SESSION_START: Starting latency tracking task for {user_id}")
            session.latency_task = asyncio.create_task(
                self.start_latency_tracking(session)
            )
            logger.info(f"🔍 SESSION_START: Latency tracking task started for {user_id}")
            
            # Start background update task if not running
            if not self.running:
                logger.info(f"🔍 SESSION_START: Starting background tasks for {user_id}")
                await self.start_background_tasks()
                logger.info(f"🔍 SESSION_START: Background tasks started for {user_id}")
            else:
                logger.info(f"🔍 SESSION_START: Background tasks already running for {user_id}")
            
            logger.info(f"✅ SESSION_START: Started real traffic session for {user_id} ({profile.name})")
            
            # Send initial session info
            logger.info(f"🔍 SESSION_START: Sending initial session info for {user_id}")
            await self.send_session_info(session)
            logger.info(f"🔍 SESSION_START: Initial session info sent for {user_id}")
            
            return True
            
        except Exception as e:
            logger.error(f"❌ SESSION_START: Error starting session for {user_id}: {e}")
            logger.error(f"🔍 SESSION_START: Exception type: {type(e).__name__}")
            logger.error(f"🔍 SESSION_START: WebSocket state during error: {websocket.client_state}")
            return False
    
    async def stop_session(self, user_id: str):
        """Stop a real traffic session"""
        try:
            logger.info(f"🔍 SESSION_STOP: stop_session called for {user_id}")
            if user_id in self.sessions:
                session = self.sessions[user_id]
                logger.info(f"🔍 SESSION_STOP: Session found for {user_id}, marking inactive")
                logger.info(f"🔍 SESSION_STOP: Session was active: {session.active}")
                logger.info(f"🔍 SESSION_STOP: Session duration: {time.time() - session.start_time:.2f}s")
                logger.info(f"🔍 SESSION_STOP: WebSocket state: {session.websocket.client_state}")
                session.active = False
                
                # Stop latency tracking task
                if session.latency_task and not session.latency_task.done():
                    logger.info(f"🔍 SESSION_STOP: Cancelling latency tracking task for {user_id}")
                    session.latency_task.cancel()
                    try:
                        await session.latency_task
                    except asyncio.CancelledError:
                        pass
                
                # Send final metrics (but don't fail if WebSocket is closed)
                try:
                    logger.info(f"🔍 SESSION_STOP: Sending final metrics for {user_id}")
                    await self.send_final_metrics(session)
                except Exception as e:
                    logger.debug(f"Could not send final metrics to {user_id}: {e}")
                
                del self.sessions[user_id]
                logger.info(f"🛑 SESSION_STOP: Stopped real traffic session for {user_id}")
            else:
                logger.warning(f"🔍 SESSION_STOP: Session not found for {user_id}")
                
                # Only stop background tasks if ALL sessions are gone AND we're in a clean shutdown
                # Don't stop during normal operation when individual connections fail
                active_sessions = len([s for s in self.sessions.values() if s.active])
                if not self.sessions and self.running and active_sessions == 0:
                    logger.info(f"🔄 All sessions ended, stopping background tasks")
                    await self.stop_background_tasks()
                else:
                    
                    pass
        except Exception as e:
            logger.error(f"❌ Error stopping session for {user_id}: {e}")
    
    async def handle_upload_data(self, user_id: str, data_size: int):
        """Handle real upload data received from client (client->server)"""
        try:
            if user_id in self.sessions:
                session = self.sessions[user_id]
                # Track bytes actually received by server from client (upload)
                session.server_received_bytes += data_size
                # Update measurement window for current rate calculation
                RealTrafficMeasurement.update_measurement_window(session, 'upload', data_size)
                logger.debug(f"📥 Received {data_size} real upload bytes from {user_id}")
                
        except Exception as e:
            logger.error(f"❌ Error handling upload data from {user_id}: {e}")
    
    async def handle_client_confirmation(self, user_id: str, received_bytes: int, sent_bytes: int):
        """Handle client confirmation of actual bytes received/sent"""
        try:
            if user_id in self.sessions:
                session = self.sessions[user_id]
                # Update client-confirmed byte counts for validation
                session.client_received_bytes = received_bytes
                session.client_sent_bytes = sent_bytes
                
        except Exception as e:
            logger.error(f"❌ Error handling client confirmation from {user_id}: {e}")
    
    async def start_latency_tracking(self, session: TrafficSession):
        """Enhanced latency tracking with sequence numbers and jitter/loss detection"""
        try:
            
            while session.active:
                try:
                    # Increment sequence number for loss detection
                    session.latency_tracker.ping_sequence += 1
                    
                    # Send enhanced ping with sequence number
                    ping_message = {
                        'type': 'ping',
                        'user_id': session.user_id,
                        'sequence': session.latency_tracker.ping_sequence,
                        'timestamp': time.time() * 1000,
                        'server_time': time.time()
                    }
                    
                    if session.websocket.client_state == WebSocketState.CONNECTED:
                        await session.websocket.send_text(json.dumps(ping_message))
                        session.latency_tracker.last_ping_time = time.time()
                        
                        # Log periodic ping status
                        if session.latency_tracker.ping_sequence % 20 == 0:  # Every 10 seconds at 500ms interval
                            metrics = session.latency_tracker.get_metrics()
                        
                    await asyncio.sleep(session.latency_tracker.ping_interval)
                    
                except Exception as e:
                    logger.debug(f"Ping error for {session.user_id}: {e}")
                    break
                    
        except Exception as e:
            logger.error(f"❌ Enhanced latency tracking error for {session.user_id}: {e}")
    
    async def handle_pong(self, user_id: str, pong_data: dict):
        """Enhanced pong handling with sequence number processing and comprehensive metrics"""
        try:
            if user_id in self.sessions:
                session = self.sessions[user_id]
                sent_time = pong_data.get('timestamp', 0) / 1000
                current_time = time.time()
                latency_ms = (current_time - sent_time) * 1000
                sequence_num = pong_data.get('sequence', None)
                
                # Update latency tracker with sequence number for loss detection
                session.latency_tracker.update_latency(latency_ms, sequence_num)
                
                # Get comprehensive metrics
                metrics = session.latency_tracker.get_metrics()
                
                # Log detailed metrics periodically
                if sequence_num and sequence_num % 10 == 0:  # Every 5 seconds at 500ms interval
                    pass  # Removed verbose logging
                else:
                    pass  # Removed verbose logging
                
        except Exception as e:
            logger.error(f"❌ Error handling enhanced pong from {user_id}: {e}")
    
    async def send_session_info(self, session: TrafficSession):
        """Send session information to client"""
        try:
            session_info = {
                'type': 'session_info',
                'user_id': session.user_id,
                'profile': {
                    'name': session.profile.name,
                    'download_mbps': session.profile.download_mbps,
                    'upload_mbps': session.profile.upload_mbps,
                    'description': session.profile.description,
                    'activity_type': session.profile.activity_type
                },
                'real_traffic': True,
                'timestamp': time.time() * 1000
            }
            
            if session.websocket.client_state == WebSocketState.CONNECTED:
                await session.websocket.send_text(json.dumps(session_info))
                
        except Exception as e:
            logger.error(f"❌ Error sending session info to {session.user_id}: {e}")
    
    async def send_real_time_update(self, session: TrafficSession):
        """Send real-time metrics update"""
        try:
            metrics = self.measurement.get_session_metrics(session)
            
            # DIAGNOSTIC: Log throughput target vs actual discrepancies
            target_down = session.profile.download_mbps
            actual_down = metrics['actual_download_mbps']
            target_up = session.profile.upload_mbps
            actual_up = metrics['actual_upload_mbps']
            
            # Log significant throughput discrepancies
            down_ratio = actual_down / target_down if target_down > 0 else 1.0
            up_ratio = actual_up / target_up if target_up > 0 else 1.0
            
            if down_ratio < 0.5 or up_ratio < 0.5:
                logger.warning(f"🔍 DIAGNOSTIC: {session.user_id} throughput degradation - "
                             f"Down: {actual_down:.1f}/{target_down:.1f} Mbps ({down_ratio:.2%}), "
                             f"Up: {actual_up:.1f}/{target_up:.1f} Mbps ({up_ratio:.2%})")
            
            update_message = {
                'type': 'real_time_update',
                **metrics
            }
            
            # DIAGNOSTIC: Log WebSocket connection state before sending
            ws_state = session.websocket.client_state
            if ws_state != WebSocketState.CONNECTED:
                logger.warning(f"🔍 DIAGNOSTIC: {session.user_id} WebSocket state: {ws_state}")
            
            if session.websocket.client_state == WebSocketState.CONNECTED:
                await session.websocket.send_text(json.dumps(update_message))
                session.last_update = time.time()
                
        except Exception as e:
            logger.error(f"❌ Error sending real-time update to {session.user_id}: {e}")
            # DIAGNOSTIC: Log detailed error information
            logger.error(f"🔍 DIAGNOSTIC: {session.user_id} update error details - "
                        f"WebSocket state: {session.websocket.client_state}, "
                        f"Session active: {session.active}, "
                        f"Error type: {type(e).__name__}")
    
    async def send_final_metrics(self, session: TrafficSession):
        """Send final session metrics"""
        try:
            metrics = self.measurement.get_session_metrics(session)
            
            final_message = {
                'type': 'session_complete',
                **metrics,
                'session_duration': time.time() - session.start_time
            }
            
            if session.websocket.client_state == WebSocketState.CONNECTED:
                await session.websocket.send_text(json.dumps(final_message))
                
        except Exception as e:
            logger.error(f"❌ Error sending final metrics to {session.user_id}: {e}")
    
    async def start_background_tasks(self):
        """Start background traffic generation and measurement tasks"""
        if self.running:
            return
            
        self.running = True
        self.update_task = asyncio.create_task(self.background_update_loop())
        logger.info("🚀 Started background real traffic tasks")
    
    async def stop_background_tasks(self):
        """Stop background tasks"""
        self.running = False
        
        if self.update_task and not self.update_task.done():
            self.update_task.cancel()
            try:
                await self.update_task
            except asyncio.CancelledError:
                pass
        
        logger.info("🛑 Stopped background real traffic tasks")
    
    async def background_update_loop(self):
        """RESOURCE LEAK FIX: Background loop with prioritized session cleanup and connection validation"""
        try:
            loop_count = 0
            last_loop_time = time.time()
            
            while self.running:
                start_time = time.time()
                loop_count += 1
                
                # RESOURCE LEAK FIX: STEP 1 - Clean up inactive sessions FIRST
                cleanup_start = time.time()
                cleaned_sessions = await self.cleanup_inactive_sessions()
                cleanup_duration = time.time() - cleanup_start
                
                if cleanup_duration > 0.1:  # Log if cleanup takes more than 100ms
                    logger.warning(f"🔍 CLEANUP_TIMING: Loop {loop_count} cleanup took {cleanup_duration*1000:.1f}ms")
                
                # DIAGNOSTIC: Track timing between loops
                if loop_count > 1:
                    interval_actual = start_time - last_loop_time
                    if loop_count % 4 == 0:  # Log every second
                        logger.info(f"🔍 TIMING: Loop interval - "
                                  f"Target: 250ms, Actual: {interval_actual*1000:.1f}ms")
                
                # Get remaining active sessions after cleanup
                active_sessions = [s for s in self.sessions.values() if s.active]
                
                # DIAGNOSTIC: Log session state every 4 loops (1 second intervals with 250ms updates)
                if loop_count % 4 == 0:
                    total_sessions = len(self.sessions)
                    active_count = len(active_sessions)
                    logger.info(f"🔍 BACKGROUND LOOP: Loop {loop_count} - "
                              f"Sessions: {active_count}/{total_sessions} active, Cleaned: {len(cleaned_sessions)}")
                    
                    # Log total bytes sent across all sessions
                    total_sent = sum(s.server_sent_bytes for s in self.sessions.values())
                    total_received = sum(s.server_received_bytes for s in self.sessions.values())
                    logger.info(f"🔍 BACKGROUND LOOP: Total traffic - "
                              f"Sent: {total_sent} bytes, Received: {total_received} bytes")
                
                if not active_sessions:
                    # No active sessions, but keep running in case new ones connect
                    await asyncio.sleep(self.update_interval)
                    last_loop_time = start_time
                    continue
                
                # RESOURCE LEAK FIX: STEP 2 - Validate connections before traffic generation
                connection_validation_start = time.time()
                validated_sessions = []
                connection_failures = []
                
                for session in active_sessions:
                    if not session.active:  # Double-check after cleanup
                        continue
                    
                    # Test connection health before traffic generation
                    if await self.test_connection_health(session):
                        validated_sessions.append(session)
                    else:
                        logger.warning(f"🔍 CONNECTION_FAILED: {session.user_id} failed health check, marking inactive")
                        session.active = False
                        connection_failures.append(session.user_id)
                
                connection_validation_duration = time.time() - connection_validation_start
                if connection_validation_duration > 0.5:  # Log if validation takes more than 500ms
                    logger.warning(f"🔍 VALIDATION_TIMING: Loop {loop_count} connection validation took {connection_validation_duration*1000:.1f}ms")
                
                if connection_failures:
                    logger.warning(f"🔍 CONNECTION_FAILURES: Loop {loop_count} - {len(connection_failures)} connections failed: {connection_failures}")
                
                # RESOURCE LEAK FIX: STEP 3 - Generate traffic only for validated sessions
                traffic_generation_start = time.time()
                successful_traffic = 0
                failed_traffic = []
                
                for session in validated_sessions:
                    if not session.active:  # Triple-check session state
                        continue
                    
                    try:
                        # Generate bulk download traffic (server->client) with connection safeguards
                        bytes_sent = await self.traffic_generator.generate_download_traffic_bulk(
                            session, duration_ms=int(self.update_interval * 1000)
                        )
                        
                        # Only proceed with upload if download succeeded
                        if bytes_sent > 0 or session.profile.download_mbps == 0:
                            # Request bulk upload traffic (client->server) with connection safeguards
                            await self.traffic_generator.request_upload_traffic_bulk(
                                session, duration_ms=int(self.update_interval * 1000)
                            )
                        
                        # Send real-time update only if session is still active
                        if session.active:
                            await self.send_real_time_update(session)
                            successful_traffic += 1
                        
                        # Update activity timestamp on successful traffic generation
                        session.last_activity = time.time()
                        
                    except Exception as e:
                        logger.warning(f"⚠️ TRAFFIC_ERROR: {session.user_id} traffic generation failed: {e}")
                        logger.warning(f"🔍 TRAFFIC_ERROR: {session.user_id} - "
                                     f"WebSocket state: {session.websocket.client_state}, "
                                     f"Error type: {type(e).__name__}")
                        # Mark session as inactive on traffic generation error
                        session.active = False
                        failed_traffic.append(session.user_id)
                
                traffic_generation_duration = time.time() - traffic_generation_start
                
                # DIAGNOSTIC: Log performance metrics
                if loop_count % 4 == 0:
                    logger.info(f"🔍 PERFORMANCE: Loop {loop_count} - "
                              f"Validated: {len(validated_sessions)}, "
                              f"Successful: {successful_traffic}, "
                              f"Failed: {len(failed_traffic)}")
                
                if failed_traffic:
                    logger.warning(f"🔍 TRAFFIC_FAILURES: Loop {loop_count} - {len(failed_traffic)} traffic failures: {failed_traffic}")
                
                # DIAGNOSTIC: Log timing information for performance analysis
                total_elapsed = time.time() - start_time
                if total_elapsed > self.update_interval * 2:  # Log if loop takes more than 2x expected time
                    logger.warning(f"🔍 DIAGNOSTIC: Slow background loop {loop_count}: {total_elapsed:.3f}s "
                                 f"(expected {self.update_interval}s) - "
                                 f"Cleanup: {cleanup_duration*1000:.1f}ms, "
                                 f"Validation: {connection_validation_duration*1000:.1f}ms, "
                                 f"Traffic: {traffic_generation_duration*1000:.1f}ms")
                
                # Maintain update interval
                sleep_time = max(0, self.update_interval - total_elapsed)
                if sleep_time > 0:
                    await asyncio.sleep(sleep_time)
                
                # Update timing for next iteration
                last_loop_time = start_time
                    
        except Exception as e:
            logger.error(f"❌ Background update loop error: {e}")
            # DIAGNOSTIC: Log detailed loop error context
            logger.error(f"🔍 DIAGNOSTIC: Background loop error details - "
                        f"Loop count: {loop_count}, "
                        f"Sessions: {len(self.sessions)}, "
                        f"Running: {self.running}, "
                        f"Error type: {type(e).__name__}")
        finally:
            self.running = False
            logger.info("🛑 Background update loop ended")
    
    def get_system_stats(self) -> dict:
        """Get system statistics"""
        active_sessions = len([s for s in self.sessions.values() if s.active])
        
        return {
            'active_sessions': active_sessions,
            'max_users': self.max_users,
            'capacity_used': f"{(active_sessions/self.max_users)*100:.1f}%",
            'real_traffic_enabled': True,
            'update_interval_ms': int(self.update_interval * 1000),
            'supported_profiles': list(self.user_profiles.keys()),
            'data_pools': list(self.data_pool.bulk_pools.keys())
        }

# Global high-performance session manager
session_manager = HighPerformanceSessionManager()

@router.websocket("/ws/virtual-household/{user_id}")
async def websocket_virtual_user(websocket: WebSocket, user_id: str):
    """WebSocket endpoint for real traffic virtual users"""
    logger.info(f"🔍 WEBSOCKET_ENDPOINT: WebSocket connection attempt for: {user_id}")
    logger.info(f"🔍 WEBSOCKET_ENDPOINT: WebSocket state: {websocket.client_state}")
    
    # Rate limiting for WebSocket connections
    client_ip = "unknown"
    try:
        from server.simple_rate_limiter import rate_limiter
        
        # Get client IP
        if websocket.client:
            client_ip = websocket.client.host
        
        # Check WebSocket rate limit
        allowed, error_msg = rate_limiter.check_websocket_limit(client_ip)
        if not allowed:
            logger.warning(f"🛡️ WebSocket rate limit exceeded for {client_ip}: {error_msg}")
            await websocket.close(code=1008, reason=error_msg)
            return
        
        # Track WebSocket connection
        rate_limiter.track_websocket_connect(client_ip)
        logger.info(f"🛡️ WebSocket connection tracked for {client_ip}")
        
    except ImportError:
        logger.warning("⚠️ Rate limiter not available for WebSocket connections")
    except Exception as e:
        logger.error(f"❌ Error in WebSocket rate limiting: {e}")
    
    try:
        logger.info(f"🔍 WEBSOCKET_ENDPOINT: Starting session for {user_id}")
        # Start session
        if not await session_manager.start_session(user_id, websocket):
            logger.warning(f"🔍 WEBSOCKET_ENDPOINT: Session start failed for {user_id}")
            await websocket.close(code=1013, reason="Server capacity exceeded")
            return
        
        logger.info(f"🔍 WEBSOCKET_ENDPOINT: Session started successfully for {user_id}")
        
        # Handle messages - use generic receive to handle both text and binary
        logger.info(f"🔍 WEBSOCKET_ENDPOINT: Starting message handling loop for {user_id}")
        message_count = 0
        while user_id in session_manager.sessions:
            try:
                message_count += 1
                # Check WebSocket state before attempting to receive
                if websocket.client_state != WebSocketState.CONNECTED:
                    logger.info(f"📡 WEBSOCKET_ENDPOINT: WebSocket no longer connected for {user_id} after {message_count} messages")
                    logger.info(f"🔍 WEBSOCKET_ENDPOINT: WebSocket state: {websocket.client_state}")
                    break
                
                # Receive any type of message
                raw_message = await websocket.receive()
                
                if raw_message["type"] == "websocket.receive":
                    if "text" in raw_message:
                        # Handle JSON control messages
                        try:
                            data = json.loads(raw_message["text"])
                            message_type = data.get('type')
                            
                            if message_type == 'real_upload_data' or message_type == 'bulk_upload_data':
                                # Handle real/bulk upload data notification from client
                                data_size = data.get('size', 0)
                                await session_manager.handle_upload_data(user_id, data_size)
                                
                            elif message_type == 'client_confirmation':
                                # Handle client confirmation of actual bytes transferred
                                received_bytes = data.get('received_bytes', 0)
                                sent_bytes = data.get('sent_bytes', 0)
                                await session_manager.handle_client_confirmation(user_id, received_bytes, sent_bytes)
                                
                            elif message_type == 'stop_test':
                                # Handle stop test signal from client
                                logger.info(f"🛑 Main server received stop_test signal for {user_id}")
                                if user_id in session_manager.sessions:
                                    session = session_manager.sessions[user_id]
                                    session.active = False
                                    logger.info(f"🛑 Main server marked session {user_id} as inactive")
                                    
                                    # Send acknowledgment back to client
                                    stop_ack = {
                                        'type': 'stop_test_ack',
                                        'user_id': user_id,
                                        'timestamp': time.time() * 1000,
                                        'message': 'Traffic generation stopped'
                                    }
                                    if websocket.client_state == WebSocketState.CONNECTED:
                                        await websocket.send_text(json.dumps(stop_ack))
                                        logger.info(f"🛑 Main server sent stop acknowledgment to {user_id}")
                                else:
                                    logger.warning(f"🛑 Main server received stop_test for unknown session: {user_id}")
                                
                            elif message_type == 'ping':
                                # Enhanced ping handling with sequence numbers
                                pong_response = {
                                    'type': 'pong',
                                    'user_id': user_id,
                                    'sequence': data.get('sequence', 0),
                                    'timestamp': data.get('timestamp', time.time() * 1000),
                                    'server_timestamp': time.time() * 1000,
                                    'server_time': time.time()
                                }
                                if websocket.client_state == WebSocketState.CONNECTED:
                                    await websocket.send_text(json.dumps(pong_response))
                                    
                            elif message_type == 'pong':
                                # Handle pong response for latency calculation
                                await session_manager.handle_pong(user_id, data)
                            
                            elif message_type == 'connection_test_response':
                                # RESOURCE LEAK FIX: Handle connection test response
                                if user_id in session_manager.sessions:
                                    session = session_manager.sessions[user_id]
                                    session.last_activity = time.time()
                                    session.connection_test_failures = 0
                                    logger.debug(f"🔍 CONNECTION_TEST: {user_id} - Response received, connection healthy")
                                
                            else:
                                logger.debug(f"📨 Received message from {user_id}: {message_type}")
                                
                        except json.JSONDecodeError:
                            logger.debug(f"📨 Received non-JSON text from {user_id}")
                            
                    elif "bytes" in raw_message:
                        # Handle real binary traffic data from client (upload traffic)
                        binary_data = raw_message["bytes"]
                        data_size = len(binary_data)
                        await session_manager.handle_upload_data(user_id, data_size)
                        logger.debug(f"📥 Received {data_size} real upload bytes from {user_id}")
                        
                elif raw_message["type"] == "websocket.disconnect":
                    logger.info(f"📡 WebSocket disconnect message for {user_id}")
                    break
                    
            except (WebSocketDisconnect, ConnectionClosed):
                logger.info(f"📡 WEBSOCKET_ENDPOINT: WebSocket disconnected for {user_id} after {message_count} messages")
                break
            except Exception as e:
                logger.warning(f"⚠️ WEBSOCKET_ENDPOINT: Message handling error for {user_id}: {e}")
                logger.warning(f"🔍 WEBSOCKET_ENDPOINT: Error type: {type(e).__name__}")
                logger.warning(f"🔍 WEBSOCKET_ENDPOINT: Message count: {message_count}")
                logger.warning(f"🔍 WEBSOCKET_ENDPOINT: WebSocket state: {websocket.client_state}")
                # For serious errors, break the loop to prevent infinite error loops
                if "Cannot call 'receive' once a disconnect message has been received" in str(e):
                    logger.info(f"📡 WEBSOCKET_ENDPOINT: WebSocket receive error for {user_id}, ending connection")
                    break
                # For other errors, try to continue briefly
                await asyncio.sleep(0.1)
                
    except Exception as e:
        logger.error(f"❌ WEBSOCKET_ENDPOINT: WebSocket error for {user_id}: {e}")
        logger.error(f"🔍 WEBSOCKET_ENDPOINT: Exception type: {type(e).__name__}")
        logger.error(f"🔍 WEBSOCKET_ENDPOINT: WebSocket state during error: {websocket.client_state}")
    finally:
        # Clean up session
        logger.info(f"🔍 WEBSOCKET_ENDPOINT: Cleaning up session for {user_id}")
        await session_manager.stop_session(user_id)
        
        # Track WebSocket disconnection for rate limiting
        try:
            from server.simple_rate_limiter import rate_limiter
            rate_limiter.track_websocket_disconnect(client_ip)
            logger.info(f"🛡️ WebSocket disconnection tracked for {client_ip}")
        except ImportError:
            pass  # Rate limiter not available
        except Exception as e:
            logger.error(f"❌ Error tracking WebSocket disconnection: {e}")
        
        logger.info(f"🔍 WEBSOCKET_ENDPOINT: Session cleanup complete for {user_id}")

@router.get("/ws/virtual-household/{user_id}")
async def get_virtual_household_worker_info(user_id: str):
    """HTTP endpoint to provide worker information for WebSocket connection"""
    try:
        logger.info(f"🔍 DIAGNOSTIC: HTTP request for worker info: {user_id}")
        
        # For now, return simple connection info (no worker redirection)
        worker_info = {
            "redirect": False,
            "websocket_url": f"ws://localhost:8000/ws/virtual-household/{user_id}",
            "port": None,
            "architecture": "simple",
            "connection_type": "direct_main_server"
        }
        
        logger.info(f"🔍 DIAGNOSTIC: Returning worker info for {user_id}: {worker_info}")
        return JSONResponse(worker_info)
        
    except Exception as e:
        logger.error(f"❌ Error getting worker info for {user_id}: {e}")
        return JSONResponse({"error": str(e)}, status_code=500)

@router.get("/virtual-household/stats")
async def get_virtual_household_stats():
    """Get real traffic virtual household statistics"""
    try:
        stats = session_manager.get_system_stats()
        
        # Add session details
        session_details = {}
        for user_id, session in session_manager.sessions.items():
            metrics = session_manager.measurement.get_session_metrics(session)
            session_details[user_id] = metrics
        
        stats['sessions'] = session_details
        
        return JSONResponse(stats)
    except Exception as e:
        logger.error(f"❌ Error getting virtual household stats: {e}")
        return JSONResponse({"error": str(e)}, status_code=500)

@router.get("/virtual-household/profiles")
async def get_user_profiles():
    """Get available user profiles"""
    try:
        profiles = {}
        for key, profile in session_manager.user_profiles.items():
            profiles[key] = {
                'name': profile.name,
                'download_mbps': profile.download_mbps,
                'upload_mbps': profile.upload_mbps,
                'description': profile.description,
                'activity_type': profile.activity_type
            }
        
        return JSONResponse({
            'profiles': profiles,
            'max_concurrent_users': session_manager.max_users
        })
    except Exception as e:
        logger.error(f"❌ Error getting user profiles: {e}")
        return JSONResponse({"error": str(e)}, status_code=500)

@router.post("/virtual-household/adaptive/update-computer")
async def update_computer_profile(request_data: dict):
    """Update Computer user profile with measured connection speed"""
    try:
        measured_speed = request_data.get('measured_speed_mbps')
        if not measured_speed or measured_speed <= 0:
            return JSONResponse({"error": "Invalid measured_speed_mbps"}, status_code=400)
        
        # Apply bandwidth cap to prevent excessive usage
        MAX_COMPUTER_SPEED = 1000.0  # 1000 Mbps upper limit
        capped_speed = min(measured_speed, MAX_COMPUTER_SPEED)
        
        if capped_speed < measured_speed:
            logger.info(f"🔧 ADAPTIVE: Capping Computer speed from {measured_speed} Mbps to {capped_speed} Mbps (bandwidth conservation)")
        
        logger.info(f"🔧 ADAPTIVE: Main server received Computer profile update: {measured_speed} Mbps (using {capped_speed} Mbps)")
        
        # Step 1: Update main server's session manager
        main_server_success = session_manager.update_computer_profile(capped_speed)
        
        # Step 2: Send profile update to Computer's dedicated process (port 8004)
        computer_process_success = False
        computer_process_error = None
        
        try:
            import aiohttp
            import ssl
            
            # Determine protocol and create SSL context if needed
            protocol = "https" if os.path.exists("/etc/ssl/certs/libreqos.crt") else "http"
            ssl_context = None
            
            if protocol == "https":
                ssl_context = ssl.create_default_context()
                ssl_context.check_hostname = False
                ssl_context.verify_mode = ssl.CERT_NONE
            
            # Send update to Computer process on port 8004
            computer_port = 8004
            computer_url = f"{protocol}://localhost:{computer_port}/update-profile"
            
            profile_update_data = {
                "user_type": "computer",
                "profile_updates": {
                    "download_mbps": capped_speed,
                    "description": f"Adaptive high-speed downloads ({capped_speed} Mbps based on connection test, capped from {measured_speed} Mbps)" if capped_speed < measured_speed else f"Adaptive high-speed downloads ({capped_speed} Mbps based on connection test)"
                }
            }
            
            logger.info(f"🔧 ADAPTIVE: Sending profile update to Computer process: {computer_url}")
            logger.info(f"🔧 ADAPTIVE: Update data: {profile_update_data}")
            
            connector = aiohttp.TCPConnector(ssl=ssl_context) if ssl_context else None
            
            async with aiohttp.ClientSession(
                timeout=aiohttp.ClientTimeout(total=5.0),
                connector=connector
            ) as session:
                async with session.post(
                    computer_url,
                    json=profile_update_data,
                    headers={"Content-Type": "application/json"}
                ) as response:
                    if response.status == 200:
                        computer_response = await response.json()
                        computer_process_success = True
                        logger.info(f"✅ ADAPTIVE: Computer process updated successfully: {computer_response}")
                    else:
                        error_text = await response.text()
                        computer_process_error = f"HTTP {response.status}: {error_text}"
                        logger.error(f"❌ ADAPTIVE: Computer process update failed: {computer_process_error}")
                        
        except Exception as e:
            computer_process_error = str(e)
            logger.error(f"❌ ADAPTIVE: Error communicating with Computer process: {e}")
        
        # Determine overall success
        if main_server_success and computer_process_success:
            message = f"Computer profile updated to {capped_speed} Mbps (main server + dedicated process)"
            if capped_speed < measured_speed:
                message += f" - capped from {measured_speed} Mbps for bandwidth conservation"
            
            return JSONResponse({
                "success": True,
                "message": message,
                "computer_speed_mbps": capped_speed,
                "measured_speed_mbps": measured_speed,
                "capped": capped_speed < measured_speed,
                "updated_profiles": session_manager.get_adaptive_profiles(capped_speed),
                "main_server_updated": True,
                "computer_process_updated": True
            })
        elif main_server_success:
            message = f"Computer profile updated to {capped_speed} Mbps (main server only - process communication failed)"
            if capped_speed < measured_speed:
                message += f" - capped from {measured_speed} Mbps for bandwidth conservation"
            
            return JSONResponse({
                "success": True,
                "message": message,
                "computer_speed_mbps": capped_speed,
                "measured_speed_mbps": measured_speed,
                "capped": capped_speed < measured_speed,
                "updated_profiles": session_manager.get_adaptive_profiles(capped_speed),
                "main_server_updated": True,
                "computer_process_updated": False,
                "computer_process_error": computer_process_error
            })
        else:
            return JSONResponse({
                "error": "Failed to update Computer profile on main server",
                "main_server_updated": False,
                "computer_process_updated": computer_process_success
            }, status_code=500)
            
    except Exception as e:
        logger.error(f"❌ Error in adaptive Computer profile update: {e}")
        return JSONResponse({"error": str(e)}, status_code=500)

@router.get("/virtual-household/adaptive/profiles")
async def get_adaptive_profiles(computer_speed_mbps: float = 1000.0):
    """Get user profiles with adaptive Computer speed"""
    try:
        if computer_speed_mbps <= 0:
            return JSONResponse({"error": "Invalid computer_speed_mbps"}, status_code=400)
        
        adaptive_profiles = session_manager.get_adaptive_profiles(computer_speed_mbps)
        
        return JSONResponse({
            'profiles': adaptive_profiles,
            'computer_speed_mbps': computer_speed_mbps,
            'max_concurrent_users': session_manager.max_users,
            'adaptive_mode': True
        })
    except Exception as e:
        logger.error(f"❌ Error getting adaptive profiles: {e}")
        return JSONResponse({"error": str(e)}, status_code=500)
@router.post("/virtual-household/stop-user-sessions/{test_id}")
async def stop_user_sessions(test_id: str, request: Request):
    """
    ENHANCED STOP ENDPOINT: Handle both central server relay and ISP server direct stop
    
    Architecture flow:
    - Central Server: Frontend → Central Server (this endpoint) → ISP Server → WebSocket sessions stopped
    - ISP Server: Central Server → ISP Server (this endpoint) → WebSocket sessions stopped
    
    This ensures proper multi-user safety by routing through the central server
    when called from frontend, or handling direct stops when called from central server.
    """
    # Import here to avoid circular imports
    import socket
    
    try:
        logger.info(f"🛑 STOP_ENDPOINT: Received stop request for test ID: {test_id}")
        
        # ISP server always handles stop signals directly (no central server relay)
        logger.info(f"🏭 ISP_SERVER: Handling stop signal directly for test ID: {test_id}")
        
        stopped_sessions = []
        total_sessions = len(session_manager.sessions)
        
        # Find all sessions that match the test ID
        sessions_to_stop = []
        for session_id, session in list(session_manager.sessions.items()):
            # Extract timestamp from session ID (e.g., "alex_1749143640811" -> "1749143640811")
            if '_' in session_id:
                session_timestamp = session_id.split('_')[1]
                # Convert to test ID format (seconds instead of milliseconds)
                session_test_id = str(int(session_timestamp) // 1000)
                if session_test_id == test_id:
                    sessions_to_stop.append(session_id)
            
            # Also support legacy "all" parameter for backward compatibility
            if test_id.lower() == 'all':
                sessions_to_stop.append(session_id)
        
        logger.info(f"🛑 ISP_SERVER: Found {len(sessions_to_stop)} sessions to stop for test ID '{test_id}': {sessions_to_stop}")
        
        # Stop each matching session
        for session_id in sessions_to_stop:
            try:
                logger.info(f"🛑 ISP_SERVER: Stopping session {session_id}")
                await session_manager.stop_session(session_id)
                stopped_sessions.append(session_id)
                logger.info(f"✅ ISP_SERVER: Successfully stopped session {session_id}")
            except Exception as e:
                logger.error(f"❌ ISP_SERVER: Failed to stop session {session_id}: {e}")
        
        remaining_sessions = len(session_manager.sessions)
        
        logger.info(f"🛑 ISP_SERVER: Completed stop request for test ID '{test_id}' - "
                   f"Stopped: {len(stopped_sessions)}, "
                   f"Total before: {total_sessions}, "
                   f"Remaining: {remaining_sessions}")
        
        return JSONResponse({
            "success": True,
            "test_id": test_id,
            "stopped_sessions": stopped_sessions,
            "stopped_count": len(stopped_sessions),
            "total_sessions_before": total_sessions,
            "remaining_sessions": remaining_sessions,
            "message": f"ISP server stopped {len(stopped_sessions)} sessions for test ID '{test_id}'",
            "server_type": "isp"
        })
                    
    except Exception as e:
        logger.error(f"❌ STOP_ENDPOINT: Error handling stop signal for test ID '{test_id}': {e}")
        return JSONResponse({
            "success": False,
            "error": f"Stop endpoint error: {str(e)}",
            "test_id": test_id
        }, status_code=500)

@router.get("/virtual-household/health")
async def virtual_household_health():
    """Health check for real traffic virtual household service"""
    try:
        stats = session_manager.get_system_stats()
        
        return JSONResponse({
            "status": "healthy",
            "real_traffic_enabled": True,
            "fake_data": False,
            "active_sessions": stats['active_sessions'],
            "max_users": stats['max_users'],
            "capacity_available": session_manager.max_users - stats['active_sessions'],
            "supported_profiles": stats['supported_profiles'],
            "genuine_upload_traffic": True,
            "genuine_download_traffic": True,
            "real_time_measurement": True,
            "update_interval_ms": stats['update_interval_ms'],
            "adaptive_mode_supported": True
        })
    except Exception as e:
        logger.error(f"❌ Error in health check: {e}")
        return JSONResponse({"error": str(e)}, status_code=500)

