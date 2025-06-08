# LibreQoS Bufferbloat Test - Docker Management
# Usage: make [target]

.PHONY: help build start stop restart logs clean dev prod ssl-dev ssl-prod health

# Default target
help:
	@echo "LibreQoS Bufferbloat Test - Docker Management"
	@echo ""
	@echo "Available targets:"
	@echo "  build      - Build the Docker image"
	@echo "  start      - Start services in background"
	@echo "  stop       - Stop all services"
	@echo "  restart    - Restart all services"
	@echo "  logs       - Follow logs from all services"
	@echo "  clean      - Remove containers and images"
	@echo "  dev        - Start in development mode"
	@echo "  prod       - Start in production mode"
	@echo "  ssl-dev    - Generate SSL certificates for development"
	@echo "  ssl-prod   - Start with HTTPS using Traefik"
	@echo "  health     - Check service health"
	@echo "  shell      - Open shell in running container"
	@echo ""

# Build the Docker image
build:
	@echo "🔨 Building LibreQoS Bufferbloat Test image..."
	docker-compose build

# Start services in background
start:
	@echo "🚀 Starting LibreQoS Bufferbloat Test..."
	docker-compose up -d
	@echo "✅ Services started! Access at http://localhost"

# Stop all services
stop:
	@echo "🛑 Stopping LibreQoS Bufferbloat Test..."
	docker-compose down
	@echo "✅ Services stopped"

# Restart all services
restart: stop start

# Follow logs
logs:
	@echo "📋 Following logs..."
	docker-compose logs -f

# Clean up containers, images, and volumes
clean:
	@echo "🧹 Cleaning up..."
	docker-compose down -v --rmi local
	docker system prune -f
	@echo "✅ Cleanup complete"

# Development mode with hot reloading
dev:
	@echo "🔧 Starting in development mode..."
	docker-compose -f docker-compose.yml -f docker-compose.dev.yml up --build
	@echo "✅ Development mode started! Access at http://localhost"

# Production mode
prod:
	@echo "🏭 Starting in production mode..."
	docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
	@echo "✅ Production mode started! Access at http://localhost"

# Generate SSL certificates for development
ssl-dev:
	@echo "🔒 Generating self-signed SSL certificates..."
	mkdir -p ssl
	openssl req -x509 -newkey rsa:4096 -keyout ssl/key.pem -out ssl/cert.pem -days 365 -nodes \
		-subj "/C=US/ST=Test/L=Test/O=LibreQoS/CN=localhost"
	chmod 600 ssl/key.pem
	chmod 644 ssl/cert.pem
	@echo "✅ SSL certificates generated in ssl/ directory"

# Start with HTTPS using Traefik (production)
ssl-prod:
	@echo "🔒 Starting with HTTPS using Traefik..."
	@if [ -z "$(ACME_EMAIL)" ]; then \
		echo "❌ Please set ACME_EMAIL environment variable"; \
		echo "   Example: make ssl-prod ACME_EMAIL=your-email@example.com"; \
		exit 1; \
	fi
	ACME_EMAIL=$(ACME_EMAIL) docker-compose --profile https up -d --build
	@echo "✅ HTTPS mode started! Access at https://localhost"

# Check service health
health:
	@echo "🏥 Checking service health..."
	@echo "Main server:"
	@curl -sf http://localhost:8000/health && echo " ✅ OK" || echo " ❌ FAILED"
	@echo "Ping server:"
	@curl -sf http://localhost:8085/ping && echo " ✅ OK" || echo " ❌ FAILED"
	@echo "Jake process:"
	@curl -sf http://localhost:8001/health && echo " ✅ OK" || echo " ❌ FAILED"
	@echo "Alex process:"
	@curl -sf http://localhost:8002/health && echo " ✅ OK" || echo " ❌ FAILED"
	@echo "Sarah process:"
	@curl -sf http://localhost:8003/health && echo " ✅ OK" || echo " ❌ FAILED"
	@echo "Computer process:"
	@curl -sf http://localhost:8004/health && echo " ✅ OK" || echo " ❌ FAILED"

# Open shell in running container
shell:
	@echo "🐚 Opening shell in container..."
	docker-compose exec libreqos-bufferbloat bash

# Quick commands
up: start
down: stop
rebuild: clean build start

# Display status
status:
	@echo "📊 Container status:"
	docker-compose ps
	@echo ""
	@echo "💾 Resource usage:"
	docker stats --no-stream libreqos-bufferbloat 2>/dev/null || echo "Container not running"