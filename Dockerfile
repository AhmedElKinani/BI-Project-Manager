FROM python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq-dev gcc && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend.py database.py models.py ./
COPY seed_production.py ./
COPY index.html App.js styles.css ./
COPY vendor/ ./vendor/
COPY components/ ./components/
COPY utils/ ./utils/
COPY alembic/ ./alembic/
COPY alembic.ini ./
COPY entrypoint.sh ./
RUN chmod +x /app/entrypoint.sh

ENV PYTHONUNBUFFERED=1
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD python3 -c "import urllib.request; urllib.request.urlopen('http://localhost:8080/')" || exit 1

CMD ["/bin/sh", "/app/entrypoint.sh"]
