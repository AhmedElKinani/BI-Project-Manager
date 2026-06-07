# BI Project Manager

> A production-grade **Business Intelligence Project Management & Analytics Platform** designed for DataOps/MLOps teams. Built on a CRISP-DM methodology workflow with a premium, fully responsive dark-mode UI.

[![Python](https://img.shields.io/badge/Python-3.11-blue?logo=python)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.109-009688?logo=fastapi)](https://fastapi.tiangolo.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791?logo=postgresql)](https://www.postgresql.org/)
[![Preact](https://img.shields.io/badge/Preact-10-673AB8?logo=preact)](https://preactjs.com/)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker)](https://docs.docker.com/compose/)
[![License](https://img.shields.io/badge/License-MIT-green)](LICENSE)

---

## ✨ Features

### Core Platform
- **📊 Executive Dashboard** — Real-time project health monitoring, timeline vs progress delta, team workload distribution, and portfolio-level KPIs.
- **🗂 Kanban Pivot Board** — Phase view, team view, and interactive Deep Dive Matrix showing per-phase task completion across all projects.
- **✅ Task Management** — Full lifecycle: assign, accept/pass, track (To Do → In Progress → Review → Done), resolve with notes.
- **🏊 Team Pool** — Unassigned task queue for team members to self-claim.
- **📬 Management Approvals** — Three-column approval queue: self-assign requests, task review pool, and active review sign-off.

### Analytics & Monitoring
- **📈 Project Analytics** — Phase-weighted progress scores and executive rollup view.
- **⏱ SLA & Monitoring** — Time-To-Resolve (TTR) and Task Lifecycle (TLC) metrics per task with SLA breach indicators.

### Collaboration
- **💬 Team Communications** — Multi-channel chat with team-scoped channels, broadcast support, and inline task linking via `[TASK:id:title]`.
- **🔔 Notification Bell** — Real-time in-app notifications for assignments, approvals, and task events.

### UX & Productivity
- **🖱️ Floating Quick Shortcuts** — A persistent floating button in the bottom-right corner that launches a glassmorphic shortcuts drawer. Supports batch-adding multiple shortcuts at once.
- **⌨️ Command Palette (Cmd+K)** — Global fuzzy search across all projects and tasks, with instant navigation.
- **🌓 Theme Switcher** — Persistent Light / Dark mode toggle based on browser system preferences with a manual override option.
- **🏷 Due Date Badges** — Dynamic urgency badges: `Overdue` · `Due Today` · `Due Soon` on all task views.
- **☑ Bulk Operations** — Select multiple tasks in Team Dash for batch reassignment; bulk-approve creation requests.
- **📋 Audit Log** — Immutable, filterable log of all system actions with actor and timestamp.

### Security & Access Control
- **🔐 bcrypt Password Hashing** — All passwords stored with bcrypt (cost factor 12).
- **🛡 Role-Based Access Control** — Three-tier model (Admin / Leader / Member) with server-side enforcement.
- **🔑 JWT-based Auth** — Secure JSON Web Token header validation on every protected endpoint.

---

## 🏗 Architecture

```
┌─────────────────────────────────┐    ┌──────────────────────────┐
│         Browser (Preact)        │    │    Python HTTP Server    │
│                                 │    │    (FastAPI + Uvicorn)   │
│  App.js (ESM bootstrap)         │◄──►│                          │
│  ├── components/                │    │  ├── /api/*  (JSON API)  │
│  │   ├── Communications.js      │    │  └── static file serving │
│  │   ├── Dashboard.js           │    └──────────┬───────────────┘
│  │   ├── KanbanBoard.js         │               │ SQLAlchemy ORM
│  │   ├── TaskManagement.js      │               ▼
│  │   ├── Analytics.js           │    ┌──────────────────────────┐
│  │   ├── ProjectManagement.js   │    │   PostgreSQL 16           │
│  │   ├── AdminPanel.js          │    │   (via Docker service)   │
│  │   ├── FocusModal.js          │    └──────────────────────────┘
│  │   └── DeepDiveDrawer.js      │
│  └── utils/
│      └── core.js                │
└─────────────────────────────────┘
```

---

## 🚀 Quick Start (Docker Compose — Recommended)

Docker Compose provisions the app container and a PostgreSQL database together.

**Prerequisites:** [Docker Desktop](https://www.docker.com/products/docker-desktop/)

```bash
# 1. Clone the repository
git clone https://github.com/AhmedElKinani/BI-Project-Manager.git
cd BI-Project-Manager

# 2. Build and start both services (app + postgres)
docker compose up -d --build

# 3. Open in browser
open http://localhost:8080
```

**Default credentials:**

| Username | Password | Role   |
|----------|----------|--------|
| `admin`  | `admin`  | Admin  |

> On first startup, the database is automatically seeded with default users, core configurations, and team schemas.

### Stopping the app

```bash
docker compose down          # Stop containers (data persists in volume)
docker compose down -v       # Stop containers AND delete the database volume
```

---

## 📁 Project Structure

```
BI-Project-Manager/
│
├── backend.py              # FastAPI REST API + static files router
├── database.py             # SQLAlchemy engine & session factory
├── models.py               # ORM models (User, Project, Task, etc.)
├── requirements.txt        # Python dependencies (fastapi, uvicorn, psycopg2, bcrypt, jwt)
│
├── index.html              # HTML entry point
├── App.js                  # ESM bootstrap — mounts the Preact app
├── styles.css              # Global design system (dark/light themes, tokens)
│
├── alembic/                # Database schema migrations versions
├── alembic.ini             # Alembic migration configuration
│
├── components/             # Modular Preact components (ES Modules)
│   ├── Communications.js   # App root navigation and global shell
│   ├── Dashboard.js        # Executive dashboard & KPI cards
│   ├── KanbanBoard.js      # Pivot board + Deep Dive Matrix
│   ├── TaskManagement.js   # My Tasks, Team Pool, Team Dash
│   ├── ApprovalsView.js    # Multi-stage approvals review manager
│   ├── Analytics.js        # Project analytics & SLA monitoring
│   ├── ProjectManagement.js # Project CRUD and phase submissions
│   ├── FocusModal.js       # Low-level accessible focus modal shell
│   ├── DeepDiveDrawer.js   # Side slide-out project/task deep-dives
│   ├── AdminPanel.js       # User management panel
│   ├── CommandPalette.js   # Cmd+K global search palette
│   ├── NotificationBell.js # In-app real-time notification queue
│   ├── LoginScreen.js      # Login page
│   ├── RoleDashboard.js    # Role-specific dashboard layouts and shortcuts
│   ├── TeamDashboardView.js# Team-specific metrics view
│   ├── TeamPoolView.js     # Unclaimed tasks pool view
│   └── AuditLog.js         # Audit trail log viewer
│
├── utils/
│   ├── core.js             # Shared utilities (apiFetch, useSmartPoll, logs)
│   └── configStore.js      # Dynamic system configuration cache store
│
├── tests/
│   └── verify_lifecycle_security.py # Compliance verification suite
│
├── vendor/                 # Locally-vendored fonts
├── Dockerfile              # Multi-stage production container
└── docker-compose.yaml     # App + PostgreSQL service definition
```

---

## 🛠 Tech Stack

| Layer      | Technology                                          |
|------------|-----------------------------------------------------|
| Frontend   | Preact 10 + HTM (CDN ESM, zero build step)          |
| Backend    | Python 3.11 + FastAPI + Uvicorn                      |
| ORM        | SQLAlchemy 2.x (declarative models)                 |
| Migration  | Alembic (database version control)                  |
| Database   | PostgreSQL 16 (managed via Docker Compose)          |
| Auth       | bcrypt password hashing + JWT session tokens        |
| Container  | Docker + Docker Compose                             |
| State Sync | Visibility API + Exponential Backoff                |

---

## 🔐 Roles & Permissions

| Permission                   | Admin | Leader | Member |
|------------------------------|:-----:|:------:|:------:|
| View Dashboard & Analytics   |   ✓   |   ✓    |   ✓    |
| Create / Manage Users        |   ✓   |        |        |
| Create / Edit Projects       |   ✓   |        |        |
| Submit Phase Transitions     |   ✓   |   ✓    |        |
| Assign Tasks to Team         |   ✓   |   ✓    |        |
| Approve / Reject Tasks       |   ✓   |   ✓    |        |
| Self-Assign Tasks (approval) |   ✓   |   ✓    |   ✓    |
| Claim Pool Tasks             |   ✓   |   ✓    |   ✓    |
| View All Teams' Data         |   ✓   |        |        |
| View Team Analytics          |   ✓   |   ✓    |        |
| Broadcast Messages           |   ✓   |   ✓    |        |
| View Audit Log               |   ✓   |        |        |

---

## ⚙️ Environment Variables

The following environment variables are loaded via `.env` / `docker-compose.yaml`:

| Variable | Default | Description |
|---|---|---|
| `POSTGRES_USER` | `bi_user` | PostgreSQL username |
| `POSTGRES_PASSWORD` | `bi_password` | PostgreSQL password |
| `POSTGRES_DB` | `bi_manager` | PostgreSQL database name |
| `JWT_SECRET` | `replace_with_strong_random_secret` | JWT payload signature secret |
| `SEED_ADMIN_PASSWORD` | `admin` | Default admin password generated on seed |

---

## 🗄 Database & Migrations

The app uses **PostgreSQL 16** managed by Docker Compose. The database schema version control is managed via **Alembic**.

### Running Migrations

Database tables are automatically created on startup, but future schema upgrades should be managed via Alembic:

```bash
# 1. Generate a new migration revision
docker compose exec bi-manager alembic revision --autogenerate -m "description of changes"

# 2. Apply migrations to database
docker compose exec bi-manager alembic upgrade head

# 3. Rollback migration
docker compose exec bi-manager alembic downgrade -1
```

---

## 🧪 Compliance & Security Verification

A test suite verifying row-level security (RLS) policies, Segregation of Duties (SoD), and state transition guards is provided in `tests/`.

Run this test suite inside the container environment using:

```bash
docker compose exec bi-manager python tests/verify_lifecycle_security.py
```

---

## ⌨️ Keyboard Shortcuts

| Shortcut      | Action                        |
|---------------|-------------------------------|
| `Cmd+K` / `Ctrl+K` | Open Command Palette    |
| `Esc`         | Close modal / Command Palette |

---

## 📄 License

See [LICENSE](LICENSE) for details.
