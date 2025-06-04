# Simple Multi-Process Virtual Household System

## Overview

A high-performance, process-isolated Virtual Household system that runs each user type (Jake, Alex, Sarah, Computer) in separate processes for maximum WebSocket throughput and zero interference.

## Key Benefits

- **Process Isolation**: Each user type runs in its own dedicated process
- **Maximum Throughput**: No WebSocket interference between user types
- **Simple Architecture**: No complex coordination or message passing
- **High Performance**: Optimized for maximum bandwidth per user type
- **Easy Management**: Simple process lifecycle management

## Architecture

```
Main Server (Port 8000)
├── Single User Mode (unchanged)
│   ├── /download
│   ├── /upload  
│   └── /ping
└── Virtual Household Mode (process-isolated)
    ├── Jake Process (Port 8001) - Netflix streaming
    ├── Alex Process (Port 8002) - Gaming
    ├── Sarah Process (Port 8003) - Video calls
    └── Computer Process (Port 8004) - Bulk downloads
```

## Quick Start

### 1. Start the System

```bash
# Start all processes and main server
python start_simple_multiprocess.py

# Start on custom port
python start_simple_multiprocess.py --port 8080

# Start with tests
python start_simple_multiprocess.py --test
```

### 2. Test the System

```bash
# Run comprehensive tests
python test_simple_multiprocess_implementation.py
```

### 3. Use Virtual Household

1. **Get connection info**: `GET http://localhost:8000/ws/virtual-household/jake`
2. **Connect to dedicated process**: Use the returned WebSocket URL
3. **Enjoy isolated performance**: Each user type has dedicated resources

## User Types and Ports

| User Type | Port | Profile | Traffic Pattern |
|-----------|------|---------|----------------|
| Jake | 8001 | Netflix Streaming | 25 Mbps bursts (1s on, 4s off) |
| Alex | 8002 | Gaming | 1.5 Mbps steady, low latency |
| Sarah | 8003 | Video Calls | 2.5 Mbps bidirectional |
| Computer | 8004 | Bulk Downloads | 200 Mbps steady |

## API Endpoints

### Main Server (Port 8000)

- `GET /ws/virtual-household/{user_id}` - Get connection redirect info
- `GET /virtual-household/health` - System health check
- `GET /virtual-household/stats` - Comprehensive statistics
- `GET /virtual-household/profiles` - Available user profiles
- `GET /virtual-household/process-health` - Process health status

### User Processes (Ports 8001-8004)

- `WS /ws/virtual-household/{user_id}` - WebSocket connection
- `GET /health` - Process health check
- `GET /stats` - Process statistics

## Performance Optimizations

### Process-Level Optimizations
- **Dedicated Resources**: Each user type has isolated CPU/memory
- **Optimized Capacity**: 50 users per process (vs 30 shared)
- **Custom Update Intervals**: High-throughput users get 100ms updates
- **No Interference**: WebSocket handling completely isolated

### Network Optimizations
- **Bulk Data Pools**: Pre-generated 1MB, 2MB, 4MB data pools
- **Adaptive Chunking**: Optimal chunk sizes per throughput target
- **Minimal Overhead**: Reduced logging and access logs for performance

## Monitoring and Health

### System Health
```bash
curl http://localhost:8000/virtual-household/health
```

### Process Health
```bash
curl http://localhost:8000/virtual-household/process-health
```

### Individual Process Health
```bash
curl http://localhost:8001/health  # Jake
curl http://localhost:8002/health  # Alex
curl http://localhost:8003/health  # Sarah
curl http://localhost:8004/health  # Computer
```

## Development

### File Structure
```
server/
├── main.py                      # Main server with routing
├── simple_user_process.py       # Individual user process server
├── simple_process_manager.py    # Process spawning and management
└── websocket_virtual_household.py  # Original implementation (for profiles)

# Startup and testing
start_simple_multiprocess.py        # Easy startup script
test_simple_multiprocess_implementation.py  # Comprehensive tests
```

### Adding New User Types

1. Add profile to `websocket_virtual_household.py`
2. Add port mapping to `simple_process_manager.py`
3. Restart system

### Debugging

#### Check Process Status
```bash
# Process manager status
python server/simple_process_manager.py --status

# Individual process logs
# Each process logs with format: USERTYPE:PORT - message
```

#### Common Issues

**Processes won't start**
- Check port availability (8001-8004)
- Verify Python path and imports
- Check system resources

**WebSocket connections fail**
- Verify process health endpoints
- Check redirect responses from main server
- Ensure processes are fully initialized

**Performance issues**
- Monitor individual process stats
- Check for resource contention
- Verify process isolation

## Migration from Old System

The new system completely replaces the complex coordinator architecture:

### Removed Components
- ❌ Complex coordinator architecture
- ❌ Message protocol system
- ❌ Shared state management
- ❌ Load balancer complexity
- ❌ Worker pool coordination

### New Components
- ✅ Simple process manager
- ✅ Direct user process servers
- ✅ Simple HTTP routing
- ✅ Process health monitoring
- ✅ Maximum throughput optimization

### Client Changes
**None required** - clients use the same API endpoints and get redirected automatically.

## Performance Expectations

### Throughput Improvements
- **Jake (Netflix)**: 25 Mbps bursts without interference
- **Alex (Gaming)**: Consistent 1.5 Mbps with low latency
- **Sarah (Video)**: Stable 2.5 Mbps bidirectional
- **Computer (Bulk)**: Maximum 200 Mbps throughput

### Latency Improvements
- **Process Isolation**: No cross-user WebSocket blocking
- **Dedicated Resources**: Each user type has isolated event loop
- **Optimized Updates**: Custom intervals per user type

### Capacity Improvements
- **Per-Process**: 50 concurrent users (vs 30 shared)
- **Total System**: 200 concurrent users (50 × 4 processes)
- **Resource Efficiency**: Better CPU/memory utilization

## Troubleshooting

### System Won't Start
1. Check Python dependencies
2. Verify port availability (8000-8004)
3. Check system resources
4. Review startup logs

### Poor Performance
1. Monitor process health
2. Check system resources
3. Verify process isolation
4. Review individual process stats

### Connection Issues
1. Test redirect endpoints
2. Verify process health
3. Check WebSocket connectivity
4. Review client-side errors

## Support

For issues or questions:
1. Check process health endpoints
2. Review comprehensive logs
3. Run test suite for diagnostics
4. Monitor system statistics

The simple multi-process system provides maximum throughput with minimal complexity - exactly what you need for realistic household network simulation.