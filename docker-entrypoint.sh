#!/bin/bash
set -e

echo "🚀 Starting LibreQoS Bufferbloat Test..."
echo "📝 Environment: ${DEBUG:-production}"
echo "🐍 Python version: $(python3 --version)"

# Function to check if a service is ready
check_service() {
    local url=$1
    local name=$2
    local max_attempts=${3:-5}
    local attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        if curl -sf "$url" > /dev/null 2>&1; then
            echo "✅ $name is ready (attempt $attempt/$max_attempts)"
            return 0
        else
            echo "⏳ Waiting for $name... (attempt $attempt/$max_attempts)"
            attempt=$((attempt + 1))
            sleep 1
        fi
    done
    
    echo "❌ $name failed to start after $max_attempts attempts"
    return 1
}

# Function to handle graceful shutdown
cleanup() {
    echo "🛑 Received shutdown signal, cleaning up..."
    if [ ! -z "$MAIN_PID" ] && kill -0 $MAIN_PID 2>/dev/null; then
        echo "⏳ Stopping main process (PID: $MAIN_PID)..."
        kill -TERM $MAIN_PID
        wait $MAIN_PID 2>/dev/null || true
    fi
    echo "✅ Cleanup complete"
    exit 0
}

# Set up signal handlers
trap cleanup SIGTERM SIGINT

# Create logs directory if it doesn't exist
mkdir -p /app/logs

# Check if SSL certificates exist
if [ -f "/app/ssl/cert.pem" ] && [ -f "/app/ssl/key.pem" ]; then
    echo "🔒 SSL certificates found"
    export SSL_ENABLED=true
else
    echo "ℹ️  No SSL certificates found, running in HTTP mode"
    export SSL_ENABLED=false
fi

# Start the main application
python3 start_simple_multiprocess.py &
MAIN_PID=$!

# Wait for all services to be ready
echo "⏳ Waiting for all services to initialize..."
RETRY_COUNT=0
MAX_RETRIES=30

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    ALL_READY=true
    
    # Check main server
    check_service "http://localhost:8000/health" "Main server" || ALL_READY=false
    
    # Check ping server
    check_service "http://localhost:8085/ping" "Ping server" || ALL_READY=false
    
    # Check user processes
    check_service "http://localhost:8001/health" "Jake process" || ALL_READY=false
    check_service "http://localhost:8002/health" "Alex process" || ALL_READY=false
    check_service "http://localhost:8003/health" "Sarah process" || ALL_READY=false
    check_service "http://localhost:8004/health" "Computer process" || ALL_READY=false
    
    if [ "$ALL_READY" = true ]; then
        echo "🎉 All services are ready!"
        break
    fi
    
    RETRY_COUNT=$((RETRY_COUNT + 1))
    sleep 2
done

if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
    echo "❌ Services failed to start within timeout"
    cleanup
    exit 1
fi

echo "🎯 All services started successfully!"
echo "🌐 Main server available at: http://localhost:8000"
if [ "$SSL_ENABLED" = true ]; then
    echo "🔒 HTTPS server available at: https://localhost:443"
fi
echo "📊 Virtual Household Mode: Available on main server"
echo "🏓 Ping server: http://localhost:8085"

# Keep the main process running and wait for signals
wait $MAIN_PID