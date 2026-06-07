#!/bin/bash
set -e

echo "==> Running Alembic migrations..."
alembic upgrade head

echo "==> Seeding admin user and default config..."
python3 seed_production.py

echo "==> Starting application server..."
exec python3 backend.py
