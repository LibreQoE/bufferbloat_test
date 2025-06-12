"""
Shared Download Endpoint
=======================

Provides download endpoint functionality that can be used by both main server
and worker processes. Includes streaming download and Netflix chunk support.
"""

import os
import asyncio
import logging
import struct
import time
from fastapi import Request, Response
from fastapi.responses import StreamingResponse

# Import rate limiter
from server.rate_limiter import rate_limiter

# Create a reusable buffer of random data (128KB for higher throughput)
CHUNK_SIZE = 128 * 1024  # 128KB chunks
random_buffer = os.urandom(CHUNK_SIZE)

async def download_generator(request: Request, logger_prefix: str = "", traffic_pattern: str = "steady"):
    """
    Generator that yields random data chunks indefinitely.
    Checks for client disconnection between chunks.
    
    Args:
        request: FastAPI request object
        logger_prefix: Prefix for log messages (e.g., "[WORKER-alex] ")
        traffic_pattern: Traffic pattern type ("steady", "bursty_netflix", "adaptive_streaming")
    """
    logger = logging.getLogger(__name__)
    chunk_count = 0
    
    try:
        while True:
            # Check if client has disconnected
            if await request.is_disconnected():
                logger.info(f"{logger_prefix}Client disconnected after {chunk_count} chunks")
                break
                
            yield random_buffer
            chunk_count += 1
            
            # Apply traffic pattern delays
            if traffic_pattern == "bursty_netflix":
                # Jake's Netflix: burst 10 chunks, then pause
                if chunk_count % 10 == 0:
                    await asyncio.sleep(0.5)  # 500ms pause between bursts
                else:
                    await asyncio.sleep(0.001)  # 1ms within burst
                    
            elif traffic_pattern == "steady_web":
                # Alex's web browsing: consistent delays
                await asyncio.sleep(0.01)  # 10ms steady
                
            elif traffic_pattern == "adaptive_streaming":
                # Sarah's adaptive streaming: variable based on quality
                quality_delay = {"HD": 0.002, "1080p": 0.005, "720p": 0.01}
                await asyncio.sleep(quality_delay.get("HD", 0.005))
                
            else:
                # Default steady pattern
                # Small delay to allow abort signals to be processed
                # This makes the download more responsive to abort signals
                if chunk_count % 20 == 0:  # Add delay every 20 chunks (was 10)
                    await asyncio.sleep(0.005)  # 5ms delay (was 10ms)
                    
    except Exception as e:
        logger.error(f"{logger_prefix}Error in download generator: {e}")
    finally:
        logger.info(f"{logger_prefix}Download generator finished after {chunk_count} chunks")

async def create_download_endpoint(app, logger_prefix: str = "", traffic_pattern: str = "steady"):
    """
    Create download endpoint that can be used by any FastAPI app.
    
    Args:
        app: FastAPI application instance
        logger_prefix: Prefix for log messages
        traffic_pattern: Traffic pattern for this endpoint
    """
    logger = logging.getLogger(__name__)
    
    @app.get("/download")
    async def download_endpoint(request: Request):
        """
        Endpoint that streams random data to saturate the download connection.
        Protected by rate limiting to prevent DDOS.
        """
        # Check rate limits before starting download
        await rate_limiter.check_download_limit(request)
        
        logger.info(f"{logger_prefix}Starting download stream")
        
        try:
            return StreamingResponse(
                download_generator(request, logger_prefix, traffic_pattern),
                media_type="application/octet-stream",
                headers={
                    "Cache-Control": "no-store",
                    "Pragma": "no-cache"
                }
            )
        finally:
            # Always release the connection when done
            await rate_limiter.release_download_connection(request)

def generate_netflix_chunk(chunk_size: int, quality: str, sequence: int, request_data: dict, logger_prefix: str = ""):
    """Generate Netflix-style chunk with proper headers"""
    logger = logging.getLogger(__name__)
    
    chunk_data = bytearray()
    
    # Netflix-style header (48 bytes)
    # Fix: Use modulo to keep timestamp within 32-bit range
    timestamp_ms = int(time.time() * 1000) % (2**32)  # Keep within 32-bit unsigned int range
    header = struct.pack('<IIIIHBBBBHH',
        sequence,                    # Sequence number
        timestamp_ms,               # Timestamp (32-bit safe)
        chunk_size,                 # Chunk size
        0,                          # Reserved
        0,                          # Viewer count placeholder
        1 if sequence % 30 == 0 else 0,  # Key frame flag (every 30th chunk)
        {'HD': 3, '1080p': 2, '720p': 1, '480p': 0}.get(quality, 2),  # Quality level
        1,                          # Complexity (medium)
        0,                          # Padding
        0,                          # Buffer level placeholder
        0                           # Padding
    )
    
    # Add 32 bytes for stream/session IDs
    session_id = request_data.get('sessionId', 'netflix_session').encode('utf-8')[:16]
    session_id = session_id.ljust(16, b'\0')
    flow_id = str(request_data.get('flowId', 0)).encode('utf-8')[:16]
    flow_id = flow_id.ljust(16, b'\0')
    
    chunk_data.extend(header)
    chunk_data.extend(session_id)
    chunk_data.extend(flow_id)
    
    # Fill remaining space with simulated video data
    remaining_size = chunk_size - len(chunk_data)
    if remaining_size > 0:
        # Use different patterns for key frames vs delta frames
        if sequence % 30 == 0:  # Key frame
            # More varied data for I-frames
            patterns = [0x12345678, 0x87654321, 0xABCDEF00, 0x00FEDCBA]
            pattern_data = bytearray()
            for i in range(0, remaining_size, 4):
                pattern = patterns[(i // 4) % len(patterns)]
                pattern_data.extend(struct.pack('<I', pattern))
            chunk_data.extend(pattern_data[:remaining_size])
        else:  # Delta frame
            # More repetitive data for P-frames
            base_pattern = 0x11111111 ^ (sequence & 0xFFFF)
            pattern_data = struct.pack('<I', base_pattern) * (remaining_size // 4 + 1)
            chunk_data.extend(pattern_data[:remaining_size])
    
    return bytes(chunk_data[:chunk_size])

async def create_netflix_endpoint(app, logger_prefix: str = "", burst_mode: bool = False, quality: str = "1080p"):
    """
    Create Netflix chunk endpoint that can be used by any FastAPI app.
    
    Args:
        app: FastAPI application instance
        logger_prefix: Prefix for log messages
        burst_mode: Whether to use burst mode for Jake's traffic pattern
        quality: Default quality level
    """
    logger = logging.getLogger(__name__)
    
    @app.post("/netflix-chunk")
    async def netflix_chunk_endpoint(request: Request):
        """
        Endpoint that serves Netflix-style video chunks.
        Supports variable chunk sizes for adaptive streaming simulation.
        Protected by download rate limiting.
        """
        # Use download rate limiting for Netflix chunks
        await rate_limiter.check_download_limit(request)
        
        try:
            # Parse request data
            request_data = await request.json()
            chunk_size = request_data.get('chunkSize', 2 * 1024 * 1024)  # Default 2MB
            chunk_quality = request_data.get('quality', quality)
            sequence = request_data.get('sequence', 0)
            
            logger.info(f"{logger_prefix}Netflix chunk request: {chunk_quality} quality, {chunk_size} bytes, sequence {sequence}")
            
            # Generate chunk data with header
            if burst_mode:
                # Jake's pattern: send larger chunks in bursts
                if sequence % 5 == 0:
                    chunk_size = int(chunk_size * 1.5)  # Larger chunks at burst start
                    
            chunk_data = generate_netflix_chunk(chunk_size, chunk_quality, sequence, request_data, logger_prefix)
            
            return Response(
                content=chunk_data,
                media_type="application/octet-stream",
                headers={
                    "Cache-Control": "no-store",
                    "Pragma": "no-cache",
                    "X-Netflix-Sequence": str(sequence),
                    "X-Netflix-Quality": chunk_quality,
                    "X-Netflix-Chunk-Size": str(chunk_size),
                    "X-Worker-Source": logger_prefix.strip("[] ") if logger_prefix else "main"
                }
            )
            
        except Exception as e:
            logger.error(f"{logger_prefix}Error serving Netflix chunk: {e}")
            return Response(
                content=b"Error serving chunk",
                status_code=500
            )
        finally:
            # Always release the connection when done
            await rate_limiter.release_download_connection(request)