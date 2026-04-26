# BI Project Manager

A comprehensive **Business Intelligence Project Management & Analytics Platform** built with Preact + HTM (frontend) and Python/SQLite (backend). Designed for managing BI/DataOps project lifecycles using the CRISP-DM methodology.

## Features

- **Dashboard** — Real-time project health monitoring with progress vs timeline tracking
- **Task Management** — Full task lifecycle: create, assign, accept, track, resolve
- **Team Pool** — Unassigned task queue for team members to claim
- **Task Analytics** — TTR/TLC metrics in days + hours, SLA indicators, filterable views
- **Project Governance** — Phase submissions, stakeholder tracking, multi-team coordination
- **Communications** — Team channels, private messaging, broadcast announcements
- **Audit Trail** — Full audit log of all system actions
- **Admin Panel** — User management, role-based access control (Admin / Leader / Member)
- **Role-Based Security** — Scoped views and actions per user role

## Quick Start (Local)

```bash
# Clone the repository
git clone https://github.com/AhmedElKinani/BI-Project-Manager.git
cd BI-Project-Manager

# Run the server (Python 3.8+ required, no external dependencies)
python3 backend.py

# Open in browser
open http://localhost:8080
```

**Default Admin Account:** `admin` / `admin123`

## Docker Deployment

```bash
# Build the image
docker build -t bi-project-manager .

# Run with persistent database storage
docker run -d \
  -p 8080:8080 \
  -v bi-data:/app/data \
  --name bi-manager \
  bi-project-manager

# Access the app
open http://localhost:8080
```

### Docker Compose (optional)

Create a `docker-compose.yml`:

```yaml
version: '3.8'
services:
  bi-manager:
    build: .
    ports:
      - "8080:8080"
    volumes:
      - bi-data:/app/data
    restart: unless-stopped

volumes:
  bi-data:
```

Then run:
```bash
docker compose up -d
```

## Project Structure

```
BI-Project-Manager/
├── backend.py        # Python HTTP server + SQLite API (no external deps)
├── index.html        # Entry point HTML
├── App.js            # Preact + HTM frontend (single-file SPA)
├── styles.css        # Theme & layout (premium dark mode)
├── mockData.js       # Shared constants (PHASES, TEAMS)
├── Dockerfile        # Production container definition
├── .dockerignore     # Docker build exclusions
├── .gitignore        # Git exclusions
└── README.md         # This file
```

## Tech Stack

| Layer     | Technology                        |
|-----------|-----------------------------------|
| Frontend  | Preact + HTM (CDN, no build step) |
| Backend   | Python stdlib `http.server`       |
| Database  | SQLite (file-based, zero-config)  |
| Container | Docker (Python 3.11-slim)         |

## Environment Variables

| Variable   | Default          | Description                |
|------------|------------------|----------------------------|
| `DB_PATH`  | `bi_manager.db`  | Path to the SQLite database |

## Roles & Permissions

| Permission                   | Admin | Leader | Member |
|------------------------------|:-----:|:------:|:------:|
| View Dashboard               |   ✓   |   ✓    |   ✓    |
| Create/Manage Users          |   ✓   |        |        |
| Assign Tasks                 |   ✓   |   ✓    |        |
| Self-Assign Tasks            |   ✓   |   ✓    |   ✓    |
| Claim Pool Tasks             |   ✓   |   ✓    |   ✓    |
| View All Teams Pool          |   ✓   |        |        |
| Submit Phase Transitions     |   ✓   |   ✓    |        |
| Broadcast Messages           |   ✓   |   ✓    |        |
| View All Task Analytics      |   ✓   |        |        |
| View Team Task Analytics     |   ✓   |   ✓    |        |

## License

See [LICENSE](LICENSE) for details.
