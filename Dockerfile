FROM python:3.11-slim

# Install system dependencies including curl for healthchecks
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    make \
    libffi-dev \
    libssl-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy requirements first for better caching
COPY server/requirements.txt /app/server/

# Install Python dependencies
RUN pip install --no-cache-dir -r server/requirements.txt

# Copy the entire application
COPY . /app/

# Create SSL directory and ensure proper permissions
RUN mkdir -p /app/ssl && chmod 755 /app/ssl

# Copy and set entrypoint
COPY docker-entrypoint.sh /app/
RUN chmod +x /app/docker-entrypoint.sh

# Expose all required ports
# Main server (HTTP/HTTPS)
EXPOSE 8000 443
# Ping server
EXPOSE 8085
# User process servers
EXPOSE 8001 8002 8003 8004

# Set environment variables
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1

# Add comprehensive healthcheck to ensure all services are ready
HEALTHCHECK --interval=15s --timeout=10s --start-period=45s --retries=5 \
    CMD curl -f http://localhost:8000/health && \
        curl -f http://localhost:8085/ping && \
        curl -f http://localhost:8001/health && \
        curl -f http://localhost:8002/health && \
        curl -f http://localhost:8003/health && \
        curl -f http://localhost:8004/health || exit 1

# Use entrypoint for proper initialization
ENTRYPOINT ["/app/docker-entrypoint.sh"]