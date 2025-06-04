"""
Shared Endpoint Modules
======================

This package contains shared endpoint implementations that can be used by both
the main server and worker processes. This ensures a single source of truth
for all endpoint logic while avoiding code duplication.

Modules:
- download: Download endpoint with streaming and Netflix chunk support
- upload: Upload endpoint with rate limiting and throughput measurement
- ping: Ping endpoint with priority handling and jitter control
"""