# BI Project Manager

> A production-grade **Business Intelligence Project Management & Analytics Platform** designed for DataOps/MLOps teams. Built on a CRISP-DM methodology workflow with a premium, fully responsive dark-mode UI.

[![Python](https://img.shields.io/badge/Python-3.11-blue?logo=python)](https://www.python.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791?logo=postgresql)](https://www.postgresql.org/)
[![Preact](https://img.shields.io/badge/Preact-10-673AB8?logo=preact)](https://preactjs.com/)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker)](https://docs.docker.com/compose/)
[![License](https://img.shields.io/badge/License-MIT-green)](LICENSE)

---

## ✨ Features

### Core Platform
- **📊 Executive Dashboard** — Real-time project health monitoring, timeline vs progress delta, team workload distribution, and portfolio-level KPIs
- **🗂 Kanban Pivot Board** — Phase view, team view, and interactive Deep Dive Matrix showing per-phase task completion across all projects
- **✅ Task Management** — Full lifecycle: assign, accept/pass, track (To Do → In Progress → Review → Done), resolve with notes
- **🏊 Team Pool** — Unassigned task queue for team members to self-claim
- **📬 Management Approvals** — Three-column approval queue: self-assign requests, task review pool, and active review sign-off

### Analytics & Monitoring
- **📈 Project Analytics** — Phase-weighted progress scores and executive rollup view
- **⏱ SLA & Monitoring** — Time-To-Resolve (TTR) and Task Lifecycle (TLC) metrics per task with SLA breach indicators

### Collaboration
- **💬 Team Communications** — Multi-channel chat with team-scoped channels, broadcast support, and inline task linking via `[TASK:id:title]`
- **🔔 Notification Bell** — Real-time in-app notifications for assignments, approvals, and task events

### UX & Productivity
- **⌨️ Command Palette (Cmd+K)** — Global fuzzy search across all projects and tasks, with instant navigation
- **🌓 Theme Switcher** — Persistent Light / Dark mode toggle saved to `localStorage`
- **🏷 Due Date Badges** — Dynamic urgency badges: `Overdue` · `Due Today` · `Due Soon` on all task views
- **☑ Bulk Operations** — Select multiple tasks in Team Dash for batch reassignment; bulk-approve creation requests
- **📋 Audit Log** — Immutable, filterable log of all system actions with actor and timestamp

### Security & Access Control
- **🔐 bcrypt Password Hashing** — All passwords stored with bcrypt (cost factor 12)
- **🛡 Role-Based Access Control** — Three-tier model (Admin / Leader / Member) with server-side enforcement
- **🔑 Header-based Auth** — `X-User` / `X-Role` headers validated on every protected endpoint

---

## 🏗 Architecture

```
┌─────────────────────────────────┐    ┌──────────────────────────┐
│         Browser (Preact)        │    │   Python HTTP Server     │
│                                 │    │   (stdlib, no framework) │
│  App.js (ESM bootstrap)         │◄──►│                          │
│  ├── components/                │    │  ├── /api/*  (JSON API)  │
│  │   ├── Communications.js      │    │  └── static file serving │
│  │   ├── Dashboard.js           │    └──────────┬───────────────┘
│  │   ├── KanbanBoard.js         │               │ SQLAlchemy ORM
│  │   ├── TaskManagement.js      │               ▼
│  │   ├── Analytics.js           │    ┌──────────────────────────┐
│  │   ├── ProjectManagement.js   │    │   PostgreSQL 16           │
│  │   ├── AdminPanel.js          │    │   (via Docker service)   │
│  │   ├── CommandPalette.js      │    └──────────────────────────┘
│  │   ├── NotificationBell.js    │
│  │   ├── LoginScreen.js         │
│  │   └── AuditLog.js            │
│  └── utils/
│      └── core.js               │
└─────────────────────────────────┘
```

---

## 🚀 Quick Start (Docker Compose — Recommended)

Docker Compose is the **only supported local setup**. It provisions the app and a PostgreSQL database together.

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

> On first startup, the database is automatically seeded with the admin account and schema via SQLAlchemy.

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
├── backend.py              # Python HTTP server + full REST API
├── database.py             # SQLAlchemy engine & session factory
├── models.py               # ORM models (User, Project, Task, etc.)
├── requirements.txt        # Python dependencies (sqlalchemy, psycopg2, bcrypt)
│
├── index.html              # HTML entry point
├── App.js                  # ESM bootstrap — mounts the Preact app
├── styles.css              # Global design system (dark/light themes, tokens)
├── mockData.js             # Shared constants (PHASES, TEAMS arrays)
│
├── components/             # Modular Preact components (ES Modules)
│   ├── Communications.js   # App root + nav + global layout
│   ├── Dashboard.js        # Executive dashboard & KPI cards
│   ├── KanbanBoard.js      # Pivot board + Deep Dive Matrix
│   ├── TaskManagement.js   # My Tasks, Team Pool, Team Dash, Approvals
│   ├── Analytics.js        # Project analytics & SLA monitoring
│   ├── ProjectManagement.js # Project CRUD, phase submissions
│   ├── AdminPanel.js       # User management panel
│   ├── CommandPalette.js   # Cmd+K global search palette
│   ├── NotificationBell.js # In-app notification dropdown
│   ├── LoginScreen.js      # Login page
│   └── AuditLog.js         # Audit trail viewer
│
├── utils/
│   └── core.js             # Shared utilities: apiFetch, useSmartPoll,
│                           # ProjectBadges, AppDialogHost, logAudit, etc.
│
├── vendor/                 # Locally-vendored fonts (offline support)
├── Dockerfile              # Multi-stage production container
├── docker-compose.yaml     # App + PostgreSQL service definition
└── .gitignore
```

---

## 🛠 Tech Stack

| Layer      | Technology                                          |
|------------|-----------------------------------------------------|
| Frontend   | Preact 10 + HTM (CDN ESM, zero build step)          |
| Backend    | Python 3.11 `http.server` (zero framework overhead) |
| ORM        | SQLAlchemy 2.x (declarative models)                 |
| Database   | PostgreSQL 16 (managed via Docker)                  |
| Auth       | bcrypt password hashing + header-based session      |
| Container  | Docker + Docker Compose                             |
| State Sync | Visibility API + Exponential Backoff (no polling spam) |

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

The following environment variables are set via `docker-compose.yaml` and can be overridden:

| Variable       | Default                                               | Description                     |
|----------------|-------------------------------------------------------|---------------------------------|
| `DATABASE_URL` | `postgresql://bi_user:bi_password@postgres:5432/bi_manager` | Full PostgreSQL connection URL |
| `PYTHONUNBUFFERED` | `1`                                             | Force Python stdout flushing    |

---

## 🗄 Database

The app uses **PostgreSQL 16** managed by Docker Compose. The schema is defined via **SQLAlchemy ORM models** in `models.py` and is automatically created on startup via `Base.metadata.create_all()`.

**Schema includes:**
- `users` — accounts, roles, team assignments
- `projects` — full project metadata, phase, stakeholders, iteration state
- `tasks` — task lifecycle, acceptance, SLA timestamps, resolution notes
- `task_history` — immutable change log per task
- `task_comments` — threaded comments per task
- `audit_logs` — system-wide action audit trail
- `notifications` — per-user notification queue
- `messages` — team channel chat messages

The database volume is named `bi-postgres-data` and persists across container restarts.

---

## 🧪 Keyboard Shortcuts

| Shortcut      | Action                        |
|---------------|-------------------------------|
| `Cmd+K` / `Ctrl+K` | Open Command Palette    |
| `Esc`         | Close modal / Command Palette |

---

## 📄 License

See [LICENSE](LICENSE) for details.
