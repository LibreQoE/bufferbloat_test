# LibreQoS Bufferbloat Test - Docker Deployment

This document describes how to deploy the LibreQoS Bufferbloat Test using Docker.

## Overview

The LibreQoS Bufferbloat Test is a comprehensive network performance testing tool that measures bufferbloat and provides detailed analysis of connection quality. This Docker deployment includes:

- **Single User Test**: Traditional bufferbloat testing for individual connections
- **Virtual Household Mode**: Simulates realistic multi-user home internet scenarios
- **Multi-process Architecture**: Separate processes for different user types (gaming, video calls, streaming, bulk transfers)
- **Real-time WebSocket Communication**: Live updates during testing
- **SSL/HTTPS Support**: Optional secure connections

## Quick Start

### Development Setup

```bash
# Clone the repository
git clone <repository-url>
cd libreqos_test

# Start in development mode with hot reloading
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up --build

# Access the application
open http://localhost
```

### Production Setup

```bash
# Build and start in production mode
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build

# Check status
docker-compose ps
docker-compose logs -f libreqos-bufferbloat
```

## Architecture

### Services

The application consists of several services running in a single container:

- **Main Server** (port 8000): Serves the web interface and handles HTTP requests
- **Ping Server** (port 8085): Dedicated low-latency ping endpoint
- **User Processes** (ports 8001-8004): Simulate different user types:
  - Port 8001: Jake (Netflix streaming simulation)
  - Port 8002: Alex (Gaming traffic simulation)  
  - Port 8003: Sarah (Video conference simulation)
  - Port 8004: Computer (Bulk transfer simulation)

### Port Mapping

| Internal Port | External Port | Service | Description |
|---------------|---------------|---------|-------------|
| 8000 | 80 | Main Server | Web interface (HTTP) |
| 443 | 443 | Main Server | Web interface (HTTPS) |
| 8085 | 8085 | Ping Server | Low-latency ping endpoint |
| 8001 | 8001 | Jake Process | Netflix streaming simulation |
| 8002 | 8002 | Alex Process | Gaming traffic simulation |
| 8003 | 8003 | Sarah Process | Video conference simulation |
| 8004 | 8004 | Computer Process | Bulk transfer simulation |

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PYTHONUNBUFFERED` | 1 | Ensure Python output is not buffered |
| `PYTHONDONTWRITEBYTECODE` | 1 | Prevent Python from writing .pyc files |
| `DEBUG` | - | Enable debug mode in development |
| `SSL_CERT_PATH` | `/app/ssl/cert.pem` | Path to SSL certificate |
| `SSL_KEY_PATH` | `/app/ssl/key.pem` | Path to SSL private key |
| `ACME_EMAIL` | - | Email for Let's Encrypt certificates |

### SSL/HTTPS Setup

#### Option 1: Self-signed certificates (Development)

```bash
# Generate self-signed certificates
sudo ./create_test_certificates.sh

# Start with SSL
docker-compose up -d
```

#### Option 2: Let's Encrypt (Production)

```bash
# Set your email for Let's Encrypt
export ACME_EMAIL=your-email@example.com

# Start with Traefik for automatic SSL
docker-compose --profile https up -d
```

#### Option 3: Existing certificates

```bash
# Place your certificates in the ssl directory
mkdir -p ssl
cp your-cert.pem ssl/cert.pem
cp your-key.pem ssl/key.pem

# Start the application
docker-compose up -d
```

## Usage

### Starting the Application

```bash
# Standard HTTP deployment
docker-compose up -d

# With HTTPS using Traefik
docker-compose --profile https up -d

# Development mode with hot reloading
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up

# Production mode with enhanced logging
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

### Monitoring

```bash
# Check service health
docker-compose ps
docker-compose exec libreqos-bufferbloat curl http://localhost:8000/health

# View logs
docker-compose logs -f libreqos-bufferbloat

# Monitor resource usage
docker stats libreqos-bufferbloat
```

### Testing

Once the application is running, navigate to:

- **HTTP**: `http://your-server-ip/` or `http://localhost/`
- **HTTPS**: `https://your-server-ip/` or `https://localhost/`

### Running Tests

1. **Single User Test**:
   - Click on "Single User Test" tab
   - Click "Start Test" button
   - Wait for test completion (~2-3 minutes)
   - View detailed results

2. **Virtual Household Mode**:
   - Click on "Virtual Household Mode" tab  
   - Click "Start Test" button
   - Watch real-time simulation of 4 users
   - View comprehensive household analysis

## Troubleshooting

### Common Issues

#### Container won't start
```bash
# Check logs for errors
docker-compose logs libreqos-bufferbloat

# Verify port availability
netstat -tulpn | grep -E ':(80|443|8001|8002|8003|8004|8085)'

# Restart services
docker-compose restart
```

#### Services not ready
```bash
# Check individual service health
curl http://localhost:8000/health
curl http://localhost:8085/ping
curl http://localhost:8001/health
curl http://localhost:8002/health
curl http://localhost:8003/health
curl http://localhost:8004/health
```

#### SSL certificate issues
```bash
# Verify certificates exist and are readable
ls -la ssl/
docker-compose exec libreqos-bufferbloat ls -la /app/ssl/

# Test SSL connection
openssl s_client -connect localhost:443 -servername localhost
```

#### WebSocket connection issues
```bash
# Check if WebSocket endpoints are accessible
curl -H "Upgrade: websocket" -H "Connection: Upgrade" http://localhost:8001/ws
```

### Performance Optimization

#### Resource Limits
```yaml
# Adjust in docker-compose.prod.yml
deploy:
  resources:
    limits:
      memory: 2G      # Increase for high-traffic sites
      cpus: '2.0'     # Increase for better performance
```

#### Network Performance
```bash
# Increase shared memory for WebRTC
shm_size: '512m'

# Enable network capabilities
cap_add:
  - NET_ADMIN
  - NET_RAW
```

## Development

### Development Setup

```bash
# Start development environment
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up

# The following directories are mounted for hot reloading:
# - ./client -> /app/client (frontend files)
# - ./server -> /app/server (backend files)
```

### Debugging

```bash
# Enable debug mode
export DEBUG=1
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up

# Access container for debugging
docker-compose exec libreqos-bufferbloat bash

# View debug port (if configured)
# Port 5678 is exposed for Python debugging
```

### Building Custom Images

```bash
# Build specific version
docker build -t libreqos-bufferbloat:v1.0 .

# Build for production
docker build --target production -t libreqos-bufferbloat:prod .

# Multi-platform build
docker buildx build --platform linux/amd64,linux/arm64 -t libreqos-bufferbloat:latest .
```

## Deployment Scenarios

### Single Server Deployment
```bash
# Simple HTTP deployment
docker-compose up -d

# Access at http://your-server-ip/
```

### Load Balanced Deployment
```bash
# Use Docker Swarm or Kubernetes for scaling
docker swarm init
docker stack deploy -c docker-compose.yml libreqos
```

### Cloud Deployment
```bash
# AWS/GCP/Azure with container services
# Use docker-compose.prod.yml for production settings
```

## Security Considerations

- **Network Capabilities**: The container requires `NET_ADMIN` and `NET_RAW` capabilities for network testing
- **Port Exposure**: Only expose necessary ports to the public internet
- **SSL Certificates**: Always use HTTPS in production environments
- **Resource Limits**: Set appropriate memory and CPU limits
- **Regular Updates**: Keep the container image updated

## Support

For issues, feature requests, or contributions:

1. Check the logs: `docker-compose logs libreqos-bufferbloat`
2. Verify health checks: `docker-compose ps`
3. Review this documentation
4. Create an issue with detailed information about your setup

## License

This project is licensed under the same terms as the main LibreQoS project.