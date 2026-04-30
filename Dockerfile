# ─── BI Project Manager ───────────────────────────────────────────────────────
# Lightweight Python image for the HTTP server + SQLite backend.
# No external dependencies required — stdlib only.
#
# Build:  docker build -t bi-project-manager .
# Run:    docker run -d -p 8080:8080 -v bi-data:/app/data --name bi-manager bi-project-manager
# ──────────────────────────────────────────────────────────────────────────────

FROM python:3.11-slim

LABEL maintainer="BI Project Manager Team"
LABEL description="BI Project Management & Analytics Platform"
LABEL version="2.0"

# Set working directory
WORKDIR /app

# Create a persistent data directory for the SQLite database
RUN mkdir -p /app/data

# Copy application files
COPY backend.py .
COPY index.html .
COPY App.js .
COPY styles.css .
COPY mockData.js .

# Copy self-hosted vendor assets (fonts, icons, JS libs — no internet needed)
COPY vendor/ ./vendor/

# Set environment variable so backend.py can optionally use it for DB path
ENV DB_PATH=/app/data/bi_manager.db
ENV PYTHONUNBUFFERED=1

# Expose the application port
EXPOSE 8080

# Health check — ensures the server is responding
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD python3 -c "import urllib.request; urllib.request.urlopen('http://localhost:8080/')" || exit 1

# Run the backend server
CMD ["python3", "backend.py"]
