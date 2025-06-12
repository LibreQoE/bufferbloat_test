"""
Shared Upload Endpoint
=====================

Provides upload endpoint functionality that can be used by both main server
and worker processes. Includes rate limiting and throughput measurement.
"""

import asyncio
import logging
import time
from fastapi import Request, Response, HTTPException
from fastapi.responses import JSONResponse

# Import rate limiter
from server.rate_limiter import rate_limiter

# Constants for rate limiting and size control
MAX_CHUNK_SIZE = 8 * 1024 * 1024  # Process in 8MB chunks max (optimized for ultra-high-speed)
MAX_REQUEST_SIZE = 512 * 1024 * 1024  # 512MB max per request (optimized for high-speed uploads)
MAX_PROCESSING_RATE = 2000 * 1024 * 1024  # 2000MB/s max processing rate (16 Gbps)

async def create_upload_endpoint(app, logger_prefix: str = "", traffic_pattern: str = "standard"):
    """
    Create upload endpoint that can be used by any FastAPI app.
    
    Args:
        app: FastAPI application instance
        logger_prefix: Prefix for log messages
        traffic_pattern: Traffic pattern for this endpoint ("standard", "background_batch", "high_priority")
    """
    logger = logging.getLogger(__name__)
    
    @app.post("/upload")
    async def upload_endpoint(request: Request):
        """
        Endpoint that accepts binary data uploads and discards them immediately.
        Used to saturate the upload connection.
        
        Includes rate limiting and size checks to prevent server overload
        on high-capacity connections. Protected by DDOS rate limiting.
        """
        # Check rate limits before processing upload
        await rate_limiter.check_upload_limit(request)
        
        try:
            # Initialize counters and rate limiting
            size = 0
            chunk_count = 0
            start_time = asyncio.get_event_loop().time()
            last_rate_check = start_time
            bytes_since_check = 0
            
            # Adjust processing based on traffic pattern
            max_request_size = MAX_REQUEST_SIZE
            max_processing_rate = MAX_PROCESSING_RATE
            
            if traffic_pattern == "background_batch":
                # Computer's background pattern: larger files, lower priority
                max_request_size = 512 * 1024 * 1024  # 512MB for background uploads (same as default)
                max_processing_rate = 1000 * 1024 * 1024  # 1000MB/s (lower priority)
            elif traffic_pattern == "high_priority":
                # High priority pattern: faster processing
                max_processing_rate = 4000 * 1024 * 1024  # 4000MB/s (32 Gbps)
            
            # Process chunks with minimal memory usage - optimized for maximum throughput
            async for chunk in request.stream():
                chunk_size = len(chunk)
                size += chunk_size
                chunk_count += 1
                
                if size > max_request_size:
                    logger.warning(f"{logger_prefix}Upload request too large: {size/1024/1024:.2f} MB exceeds limit of {max_request_size/1024/1024} MB")
                    raise HTTPException(status_code=413, detail="Request too large")
                
                # Skip chunk processing entirely - just count bytes for maximum throughput
                # No need to slice or copy chunk data, just discard immediately
                bytes_since_check += chunk_size
                # chunk is automatically garbage collected here
                
                # Rate monitoring (no throttling for gigabit+ connections)
                current_time = asyncio.get_event_loop().time()
                time_since_check = current_time - last_rate_check
                
                if time_since_check > 0.1:  # Check every 100ms
                    current_rate = bytes_since_check / time_since_check
                    current_rate_mbps = (current_rate * 8) / 1000000  # Convert to Mbps
                    
                    # 🚨 DIAGNOSTIC: Log high-speed upload rates for 500-2000 Mbps connections
                    if current_rate_mbps > 400:  # Log rates above 400 Mbps
                        logger.info(f"{logger_prefix}🚨 HIGH-SPEED UPLOAD: {current_rate_mbps:.2f} Mbps ({current_rate/1024/1024:.2f} MB/s)")
                    
                    # Only throttle if we're exceeding the very high limit (for server protection)
                    if current_rate > max_processing_rate:
                        delay_time = bytes_since_check / max_processing_rate - time_since_check
                        if delay_time > 0:
                            # Log if we're throttling at the extreme limit
                            logger.warning(f"{logger_prefix}🚨 RATE LIMITING ACTIVE: {current_rate_mbps:.2f} Mbps exceeds {(max_processing_rate*8)/1000000:.0f} Mbps limit, adding {delay_time*1000:.1f}ms delay")
                            await asyncio.sleep(delay_time)
                    
                    # Reset rate monitoring counters
                    bytes_since_check = 0
                    last_rate_check = asyncio.get_event_loop().time()
            
            # Calculate throughput for logging
            duration = asyncio.get_event_loop().time() - start_time
            if duration > 0:
                throughput_mbps = (size * 8) / (duration * 1000000)
                
                # Log for gigabit+ uploads (for debugging performance)
                if size > 10 * 1024 * 1024 or throughput_mbps > 500:
                    logger.info(f"{logger_prefix}Received upload: {size/1024/1024:.2f} MB at {throughput_mbps:.2f} Mbps")
            
            return Response(
                content="",
                media_type="application/octet-stream",
                headers={
                    "Cache-Control": "no-store",
                    "Pragma": "no-cache",
                    "Connection": "keep-alive",  # Encourage connection reuse
                    "Content-Encoding": "identity",  # Disable compression for optimal connection reuse
                    "X-Worker-Source": logger_prefix.strip("[] ") if logger_prefix else "main"
                }
            )
        except HTTPException as he:
            logger.warning(f"{logger_prefix}Upload request rejected: {he.detail}")
            return JSONResponse(
                status_code=he.status_code,
                content={"error": he.detail}
            )
        except Exception as e:
            logger.error(f"{logger_prefix}Upload error: {str(e)}")
            return JSONResponse(
                status_code=500,
                content={"error": str(e)}
            )
        finally:
            # Always release the upload connection when done
            await rate_limiter.release_upload_connection(request)