# BI Project Management tool

A modern, robust DataOps/MLOps lifecycle management tool designed to track complex Business Intelligence and Data Analytics projects through the CRISP-DM phases.

<img width="1919" height="1000" alt="image" src="https://github.com/user-attachments/assets/6c4f55c7-6e67-4a51-9cb0-3382e22fb372" />


## Key Features

- **Lifecycle Tracking**: Full management of projects from Business Understanding to Deployment.
- **Production Toggling**: Administrative control to flag projects as "New" or "Production".
- **Task Management**: Granular task tracking tied to specific CRISP-DM phases and project teams.
- **Audit Logging**: Comprehensive system record of all user actions for transparency and accountability.
- **Team Workload Visualization**: Real-time metrics on team capacity and project distribution.

## Technical Stack

- **Frontend**: Vanilla JavaScript (Preact + HTM), CSS3 (Modern Glassmorphism Design).
- **Backend**: Python 3.9 (Standard Library `http.server`).
- **Database**: SQLite3.
- **Infrastructure**: Dockerized for seamless deployment.

## Getting Started

### Prerequisites

- [Docker](https://www.docker.com/get-started) installed on your system.

### Deployment with Docker

To get the application up and running quickly:

1. **Build the Docker Image**:
   ```bash
   docker build -t bi-project-manager .
   ```

2. **Run the Container**:
   ```bash
   docker run -d -p 8080:8080 --name bi-manager bi-project-manager
   ```

3. **Access the Application**:
   Open your browser and navigate to:
   [http://localhost:8080](http://localhost:8080)

### Local Development (Alternative)

If you prefer to run it without Docker:

1. Ensure Python 3.9+ is installed.
2. Run the backend:
   ```bash
   python backend.py
   ```
3. Access at [http://localhost:8080](http://localhost:8080).

## Access & Credentials

The application is seeded with demo accounts for evaluation:

- **Admin User**:
    - Username: `admin`
    - Password: `admin`
- **Team Users**:
    - Usernames: `dev_user`, `de_user`, `ds_user`
    - Password: `password`

## Project Initialization

On the first run, the system automatically:
1. Creates the SQLite database (`bi_manager.db`).
2. Seeds sample projects, historical records, and tasks.

---
Built with ❤️ for DataOps teams.
