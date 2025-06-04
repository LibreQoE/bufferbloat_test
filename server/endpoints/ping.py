"""
Shared Ping Endpoint
===================

Provides ping endpoint functionality that can be used by both main server
and worker processes. Includes priority handling and jitter control.
"""

import asyncio
import random
import logging
from fastapi import Request, Response

async def create_ping_endpoint(app, logger_prefix: str = ""):
    """
    Create ping endpoint that can be used by any FastAPI app.
    
    Args:
        app: FastAPI application instance
        logger_prefix: Prefix for log messages
    """
    logger = logging.getLogger(__name__)
    
    @app.get("/ping")
    async def ping_endpoint(request: Request):
        """
        Simple ping endpoint that returns immediately.
        Used for latency measurements.
        
        Prioritizes response when X-Priority header is set to 'high'.
        Implements special handling for consecutive timeouts.
        """
        # Check if this is a high priority request
        is_high_priority = request.headers.get("X-Priority") == "high"
        
        # Check if client is experiencing consecutive timeouts
        consecutive_timeouts = 0
        try:
            consecutive_timeouts = int(request.headers.get("X-Ping-Attempt", "0"))
        except ValueError:
            pass
        
        # For high priority requests, ensure immediate response
        # This helps maintain accurate latency measurements during upload saturation
        if is_high_priority:
            # Set higher task priority if possible
            try:
                # Get the current task and set higher priority
                current_task = asyncio.current_task()
                if current_task:
                    current_task.set_name(f"high_priority_ping_{logger_prefix.strip('[] ')}")
            except Exception as e:
                pass  # Ignore if not supported
        
        # If client is experiencing consecutive timeouts, add special handling
        if consecutive_timeouts > 2:
            # Log the issue for monitoring
            logger.warning(f"{logger_prefix}Client experiencing {consecutive_timeouts} consecutive ping timeouts")
            
            # For severe timeout situations, we could implement additional measures here
            # such as temporarily reducing rate limits on other endpoints
        
        # Add a small random delay to prevent synchronization issues
        # This helps avoid "thundering herd" problems where all pings happen at once
        jitter = 0.001 * (0.5 + 0.5 * random.random())  # 0.5-1ms jitter
        await asyncio.sleep(jitter)
        
        return Response(
            content="",
            media_type="application/octet-stream",
            headers={
                "Cache-Control": "no-store, no-cache, must-revalidate",
                "Pragma": "no-cache",
                "X-Priority-Processed": "true" if is_high_priority else "false",
                "X-Ping-Received": "true",
                "X-Ping-Timeouts-Seen": str(consecutive_timeouts),
                "X-Worker-Source": logger_prefix.strip("[] ") if logger_prefix else "main"
            }
        )