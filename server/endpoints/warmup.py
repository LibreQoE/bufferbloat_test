"""
Warmup endpoint for connection speed measurement
Provides bulk data streaming for throughput testing
"""

import asyncio
import os
import time
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
import logging

logger = logging.getLogger(__name__)
router = APIRouter()

# Pre-generate bulk data for efficient streaming
CHUNK_SIZE = 1048576  # 1MB chunks
BULK_DATA_POOL = os.urandom(CHUNK_SIZE * 4)  # 4MB pool

@router.get("/warmup/bulk-download")
async def warmup_bulk_download():
    """
    Stream bulk data for connection warmup measurement
    Optimized for pure throughput testing
    """
    logger.info("🚀 Starting warmup bulk download stream")
    
    async def generate_bulk_data():
        """Generate continuous bulk data stream"""
        start_time = time.time()
        bytes_sent = 0
        chunk_count = 0
        
        try:
            # Stream data continuously until client disconnects
            while True:
                # Use pre-generated data for efficiency
                chunk_offset = (chunk_count % 4) * CHUNK_SIZE
                chunk_data = BULK_DATA_POOL[chunk_offset:chunk_offset + CHUNK_SIZE]
                
                yield chunk_data
                
                bytes_sent += len(chunk_data)
                chunk_count += 1
                
                # Log progress every 10 chunks (10MB)
                if chunk_count % 10 == 0:
                    elapsed = time.time() - start_time
                    if elapsed > 0:
                        throughput_mbps = (bytes_sent * 8) / (elapsed * 1000000)
                        logger.info(f"📊 Warmup stream: {bytes_sent/1048576:.1f} MB sent, "
                                  f"{throughput_mbps:.1f} Mbps, {chunk_count} chunks")
                
                # Small delay to prevent overwhelming the connection
                await asyncio.sleep(0.001)  # 1ms
                
        except Exception as e:
            elapsed = time.time() - start_time
            logger.info(f"📡 Warmup stream ended: {bytes_sent/1048576:.1f} MB in {elapsed:.1f}s")
            if "ClientDisconnect" not in str(e):
                logger.warning(f"⚠️ Warmup stream error: {e}")
    
    return StreamingResponse(
        generate_bulk_data(),
        media_type="application/octet-stream",
        headers={
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "Expires": "0",
            "Content-Type": "application/octet-stream"
        }
    )

@router.get("/warmup/health")
async def warmup_health():
    """Health check for warmup endpoint"""
    return {
        "status": "healthy",
        "endpoint": "warmup_bulk_download",
        "chunk_size": CHUNK_SIZE,
        "pool_size": len(BULK_DATA_POOL)
    }