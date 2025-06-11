# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## MANDATORY: Git Commit Rule

**AFTER EVERY FILE MODIFICATION (Edit, Write, MultiEdit operations), YOU MUST IMMEDIATELY CREATE A GIT COMMIT.**

### Git Commit Requirements:
- Create a commit after EVERY file change - no exceptions
- Use descriptive commit messages in format: `<type>: <description>`
- Commit each logical change separately (don't batch unrelated changes)
- NEVER skip commits - this allows safe rollback of any change

### Commit Types:
- `fix:` - Bug fixes
- `feat:` - New features  
- `refactor:` - Code refactoring
- `remove:` - Removing code/files
- `update:` - Updates to existing functionality
- `docs:` - Documentation changes
- `style:` - CSS/styling changes

### Example Workflow:
1. Make file change with Edit/Write/MultiEdit
2. IMMEDIATELY run: `git add <changed_files>`
3. IMMEDIATELY run: `git commit -m "fix: remove token validation from websocket"`

This ensures every change is tracked and can be safely undone.

## Common Development Commands

### Running the Server

```bash
# Basic development server (HTTP on port 8000)
python3 server/main.py

# Production multiprocess server (recommended)
python3 start_simple_multiprocess.py

# HTTPS server with SSL certificates
python3 start_simple_multiprocess.py --ssl-certfile ssl/cert.pem --ssl-keyfile ssl/key.pem --port 443

# Alternative HTTPS startup (if certificates are already set up)
./start_https.sh
```

### Installing Dependencies

```bash
# Install Python dependencies
pip install -r server/requirements.txt
```

### SSL Certificate Setup

```bash
# Production Let's Encrypt certificates
sudo ./setup_ssl_certificates.sh yourdomain.example.com

# Development self-signed certificates
sudo ./create_test_certificates.sh
```

### Service Management

```bash
# Install as systemd service
sudo ./install_service.sh

# Service control
sudo systemctl start libreqos-bufferbloat
sudo systemctl stop libreqos-bufferbloat
sudo systemctl restart libreqos-bufferbloat
sudo systemctl status libreqos-bufferbloat
```

## High-Level Architecture

### Simple Multiprocess Architecture

The system uses process isolation for stability and performance:

- **Main Server (port 8000/443)**: Handles routing and static content
- **Ping Server (port 8005)**: Dedicated low-latency ping endpoint
- **User Processes**:
  - Jake Process (port 8001): Netflix streaming simulation
  - Alex Process (port 8002): Gaming traffic simulation
  - Sarah Process (port 8003): Video conference simulation
  - Computer Process (port 8004): Bulk transfer simulation

### Key Components

1. **Process Manager** (`server/simple_process_manager.py`):
   - Spawns and monitors all user processes
   - Implements health checks and automatic restart
   - Routes WebSocket connections to appropriate processes

2. **Load Balancer** (`server/simple_load_balancer.py`):
   - Distributes connections across process instances
   - Tracks session health and manages cleanup

3. **Virtual Household** (`client/virtualHousehold/`):
   - Simulates realistic household network usage
   - Each user type has dedicated traffic patterns
   - Real-time latency and throughput monitoring

### Traffic Patterns

- **Gaming (Alex)**: Constant 1.5 Mbps down / 0.75 Mbps up with low latency requirements
- **Video Call (Sarah)**: Bidirectional 2.5 Mbps with consistent streams
- **Streaming (Jake)**: 25 Mbps bursts (1s on, 4s off) averaging 5 Mbps
- **System Updates (Computer)**: Continuous 50 Mbps down / 2 Mbps up bulk transfer

### WebSocket Architecture

All virtual household connections use WebSocket for real-time communication:
- Direct connections to user-specific processes (ports 8001-8004)
- Per-user latency tracking through dedicated ping/pong
- Resource leak prevention with session management
- Automatic cleanup on disconnection

### Client-Server Communication

1. **Single User Test**: Traditional HTTP endpoints for download/upload/ping
2. **Virtual Household**: WebSocket connections to dedicated processes
3. **Metrics Collection**: Real-time statistics through WebSocket channels
4. **Health Monitoring**: Periodic health checks and automatic recovery
