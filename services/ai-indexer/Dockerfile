# Production Dockerfile for LosslessDrop Ephemeral AI Indexer
# Zero-disk persistence: in-memory LlamaIndex service running as non-root user

FROM python:3.12-slim

# Security: prevent Python from writing bytecode (.pyc) to disk & buffer stdout
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    HOST=0.0.0.0 \
    PORT=8000 \
    EPHEMERAL_MODE=true

# Create non-root system user and group (UID/GID 10001)
RUN groupadd -g 10001 appuser && \
    useradd -u 10001 -g appuser -m -s /bin/sh appuser

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application source files
COPY main.py indexer.py models.py ./

# Set proper ownership and permissions
RUN chown -R appuser:appuser /app

# Switch to non-root user
USER 10001:10001

# Expose microservice HTTP port
EXPOSE 8000

# Healthcheck confirming zero disk persistence endpoint
HEALTHCHECK --interval=20s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health')" || exit 1

# Start Uvicorn ASGI server
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
