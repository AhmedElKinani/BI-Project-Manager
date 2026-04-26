import sqlite3
import json
import os
from http.server import SimpleHTTPRequestHandler, HTTPServer
import urllib.parse
from datetime import datetime

DB_FILE = os.environ.get('DB_PATH', 'bi_manager.db')

def init_db():
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    
    c.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE,
            password TEXT,
            role TEXT,
            team TEXT
        )
    ''')
    
    c.execute('''
        CREATE TABLE IF NOT EXISTS projects (
            id TEXT PRIMARY KEY,
            title TEXT,
            description TEXT,
            phase TEXT,
            team TEXT,
            assignee TEXT,
            progress INTEGER,
            blockers TEXT,
            nextStep TEXT,
            start_date TEXT,
            target_date TEXT
        )
    ''')
    
    try:
        c.execute("ALTER TABLE projects ADD COLUMN start_date TEXT")
        c.execute("ALTER TABLE projects ADD COLUMN target_date TEXT")
    except sqlite3.OperationalError:
        pass

    try:
        c.execute("ALTER TABLE projects ADD COLUMN is_deployed INTEGER DEFAULT 0")
        c.execute("UPDATE projects SET is_deployed=1 WHERE phase='Deployed and in Use'")
    except sqlite3.OperationalError:
        pass

    try:
        c.execute("ALTER TABLE projects ADD COLUMN iteration INTEGER DEFAULT 1")
    except sqlite3.OperationalError:
        pass

    try:
        c.execute("ALTER TABLE projects ADD COLUMN is_iterating INTEGER DEFAULT 0")
    except sqlite3.OperationalError:
        pass
        
    try:
        c.execute("ALTER TABLE projects ADD COLUMN short_description TEXT")
    except sqlite3.OperationalError:
        pass
        
    try:
        c.execute("ALTER TABLE projects ADD COLUMN full_description TEXT")
    except sqlite3.OperationalError:
        pass
        
    try:
        c.execute("ALTER TABLE projects ADD COLUMN stakeholders TEXT")
    except sqlite3.OperationalError:
        pass

    
    c.execute('''
        CREATE TABLE IF NOT EXISTS history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id TEXT,
            date TEXT,
            phase TEXT,
            status TEXT,
            note TEXT,
            FOREIGN KEY(project_id) REFERENCES projects(id)
        )
    ''')

    # ── NEW: tasks table ─────────────────────────────────────────────────────
    c.execute('''
        CREATE TABLE IF NOT EXISTS tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id TEXT,
            title TEXT NOT NULL,
            description TEXT,
            crisp_dm_phase TEXT,
            assignee TEXT,
            team TEXT,
            status TEXT DEFAULT 'todo',
            created_by TEXT,
            created_at TEXT,
            FOREIGN KEY(project_id) REFERENCES projects(id)
        )
    ''')
    
    try:
        c.execute("ALTER TABLE tasks ADD COLUMN resolution_note TEXT")
    except sqlite3.OperationalError:
        pass
    try:
        c.execute("ALTER TABLE tasks ADD COLUMN completed_by TEXT")
    except sqlite3.OperationalError:
        pass
    try:
        c.execute("ALTER TABLE tasks ADD COLUMN approval_status TEXT DEFAULT 'approved'")
    except sqlite3.OperationalError:
        pass
    try:
        c.execute("ALTER TABLE tasks ADD COLUMN acceptance_status TEXT DEFAULT 'accepted'")
    except sqlite3.OperationalError:
        pass
    try:
        c.execute("ALTER TABLE tasks ADD COLUMN due_date TEXT")
    except sqlite3.OperationalError:
        pass
    try:
        c.execute("ALTER TABLE tasks ADD COLUMN accepted_at TEXT")
    except sqlite3.OperationalError:
        pass
    try:
        c.execute("ALTER TABLE tasks ADD COLUMN resolved_at TEXT")
    except sqlite3.OperationalError:
        pass
    try:
        c.execute("ALTER TABLE tasks ADD COLUMN start_date TEXT")
    except sqlite3.OperationalError:
        pass

    # ── NEW: task_comments table ─────────────────────────────────────────────
    c.execute('''
        CREATE TABLE IF NOT EXISTS task_comments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            task_id INTEGER,
            author TEXT,
            content TEXT,
            created_at TEXT,
            FOREIGN KEY(task_id) REFERENCES tasks(id)
        )
    ''')

    # ── NEW: audit_logs table ────────────────────────────────────────────────
    c.execute('''
        CREATE TABLE IF NOT EXISTS audit_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT,
            username TEXT,
            user_role TEXT,
            action TEXT,
            details TEXT
        )
    ''')
    
    # ── NEW: notifications table ────────────────────────────────────────────────
    c.execute('''
        CREATE TABLE IF NOT EXISTS notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT,
            message TEXT,
            is_read INTEGER DEFAULT 0,
            created_at TEXT,
            related_task_id INTEGER
        )
    ''')

    # ── NEW: messages table ────────────────────────────────────────────────
    c.execute('''
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            channel_name TEXT,
            sender TEXT,
            content TEXT,
            timestamp TEXT
        )
    ''')
    
    # Seed Data
    c.execute("SELECT COUNT(*) FROM users")
    if c.fetchone()[0] == 0:
        users = [
            ('admin', 'admin', 'admin', 'Management'),
            ('dev_user', 'password', 'member', 'Development Team'),
            ('dev_leader', 'password', 'leader', 'Development Team'),
            ('de_user', 'password', 'member', 'Data Engineering Team'),
            ('de_leader', 'password', 'leader', 'Data Engineering Team'),
            ('ds_user', 'password', 'member', 'Data Science/Analysis Team'),
            ('ds_leader', 'password', 'leader', 'Data Science/Analysis Team')
        ]
        c.executemany("INSERT INTO users (username, password, role, team) VALUES (?, ?, ?, ?)", users)
        
        projects = [
            ("BI-104", "Network Traffic Anomaly Detection", "Build a machine learning pipeline.", "Modeling", "Data Science/Analysis Team", "Alice Smith", 45, "Waiting on updated training set", "Fine-tune hyperparameters", "2023-10-01", "2023-12-15", 0, 1, 0, "Detect anomalies in traffic", "Full markdown desc", "[]"),
            ("BI-105", "Executive KPI Dashboard v2", "A high-visibility dashboard for C-suite.", "Data Preparation", "Data Engineering Team", "Bob Jones", 70, "Sales API rate limits", "Optimize the ETL cron job", "2023-11-01", "2023-11-30", 0, 1, 0, "KPI dashboard for execs", "Full markdown desc", "[]"),
            ("BI-106", "Customer Churn Predictor", "Identify at-risk customers.", "Deployment", "Development Team", "Carol White", 95, "", "Rollout endpoint to production API.", "2023-09-01", "2023-12-01", 0, 1, 0, "Churn prediction model", "Full markdown desc", "[]")
        ]
        c.executemany("INSERT INTO projects (id, title, description, phase, team, assignee, progress, blockers, nextStep, start_date, target_date, is_deployed, iteration, is_iterating, short_description, full_description, stakeholders) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", projects)
        
        history = [
            ("BI-104", "2023-10-01", "Business Understanding", "completed", "Project scope defined."),
            ("BI-104", "2023-11-20", "Modeling", "in_progress", "Initial models built, tuning underway."),
            ("BI-105", "2023-11-01", "Business Understanding", "completed", "KPIs agreed upon with stakeholders."),
            ("BI-106", "2023-11-25", "Deployment", "in_progress", "Dockerizing and setting up CI/CD.")
        ]
        c.executemany("INSERT INTO history (project_id, date, phase, status, note) VALUES (?, ?, ?, ?, ?)", history)

        now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        tasks = [
            ("BI-104", "Data Cleaning Sprints", "Cleaning the new traffic dataset.", "Data Preparation", "ds_user", "Data Science/Analysis Team", "done", "admin", now, "approved", "accepted", now, now),
            ("BI-104", "Model Training", "Initial XGBoost training.", "Modeling", "ds_user", "Data Science/Analysis Team", "in_progress", "admin", now, "approved", "accepted", now, None),
            ("BI-105", "ETL Script Optimization", "Refactor the existing ETL job.", "Data Preparation", "de_user", "Data Engineering Team", "todo", "admin", now, "approved", "pending_acceptance", None, None),
            ("BI-106", "Final UAT Testing", "User acceptance testing for the churn predictor.", "Evaluation", "dev_user", "Development Team", "todo", "admin", now, "approved", "pending_acceptance", None, None)
        ]
        c.executemany("INSERT INTO tasks (project_id, title, description, crisp_dm_phase, assignee, team, status, created_by, created_at, approval_status, acceptance_status, accepted_at, resolved_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", tasks)

    conn.commit()
    conn.close()

def dict_factory(cursor, row):
    d = {}
    for idx, col in enumerate(cursor.description):
        d[col[0]] = row[idx]
    return d

def compute_project_progress(c, project_id):
    c.execute("SELECT crisp_dm_phase, status FROM tasks WHERE project_id=?", (project_id,))
    tasks = c.fetchall()
    if not tasks:
        return 0
    
    phase_stats = {}
    for t in tasks:
        phase = t['crisp_dm_phase']
        if phase not in phase_stats:
            phase_stats[phase] = {'done': 0, 'total': 0}
        phase_stats[phase]['total'] += 1
        if t['status'] == 'done':
            phase_stats[phase]['done'] += 1
            
    ratios = []
    for phase, stats in phase_stats.items():
        if stats['total'] > 0:
            ratios.append(stats['done'] / stats['total'])
            
    if ratios:
        return int((sum(ratios) / len(ratios)) * 100)
    return 0

class APIHandler(SimpleHTTPRequestHandler):
    def send_json(self, data, status=200):
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(data).encode('utf-8'))
        
    def get_body(self):
        length = int(self.headers.get('Content-Length', 0))
        return json.loads(self.rfile.read(length)) if length > 0 else {}
        
    def do_GET(self):
        if self.path.startswith('/api/'):
            conn = sqlite3.connect(DB_FILE)
            conn.row_factory = dict_factory
            c = conn.cursor()
            
            if self.path == '/api/projects':
                c.execute("SELECT * FROM projects")
                projects = c.fetchall()
                for p in projects:
                    c.execute("SELECT * FROM history WHERE project_id = ? ORDER BY id ASC", (p['id'],))
                    p['history'] = c.fetchall()
                    p['blockers'] = [b.strip() for b in p['blockers'].split(',') if b.strip()]
                    p['stakeholders'] = json.loads(p['stakeholders']) if p['stakeholders'] else []
                    
                    # Compute dynamic progress
                    computed_progress = compute_project_progress(c, p['id'])
                    p['computed_progress'] = computed_progress
                    
                self.send_json(projects)
            elif self.path == '/api/users':
                c.execute("SELECT id, username, role, team FROM users")
                self.send_json(c.fetchall())
            elif self.path.startswith('/api/task-comments'):
                parts = urllib.parse.urlparse(self.path)
                qs = urllib.parse.parse_qs(parts.query)
                task_id = qs.get('task_id', [None])[0]
                if task_id:
                    c.execute("SELECT * FROM task_comments WHERE task_id=? ORDER BY id ASC", (task_id,))
                else:
                    c.execute("SELECT * FROM task_comments ORDER BY id ASC")
                self.send_json(c.fetchall())

            elif self.path.startswith('/api/tasks'):
                parts = urllib.parse.urlparse(self.path)
                qs = urllib.parse.parse_qs(parts.query)
                team_filter = qs.get('team', [None])[0]
                role_filter = qs.get('role', ['member'])[0].lower()
                project_id_filter = qs.get('project_id', [None])[0]
                assignee_filter = qs.get('assignee', [None])[0]
                approval_status_filter = qs.get('approval_status', [None])[0]
                acceptance_status_filter = qs.get('acceptance_status', [None])[0]
                
                query = "SELECT * FROM tasks WHERE 1=1"
                params = []
                
                if role_filter not in ('admin', 'leader') and team_filter:
                    query += " AND team=?"
                    params.append(team_filter)
                
                if project_id_filter:
                    query += " AND project_id=?"
                    params.append(project_id_filter)
                    
                if assignee_filter:
                    query += " AND assignee=?"
                    params.append(assignee_filter)
                    
                if approval_status_filter:
                    query += " AND approval_status=?"
                    params.append(approval_status_filter)
                    
                if acceptance_status_filter:
                    query += " AND acceptance_status=?"
                    params.append(acceptance_status_filter)
                    
                query += " ORDER BY id DESC"
                c.execute(query, params)
                self.send_json(c.fetchall())

            elif self.path.startswith('/api/audit-logs'):
                c.execute("SELECT * FROM audit_logs ORDER BY id DESC LIMIT 200")
                self.send_json(c.fetchall())
                
            elif self.path.startswith('/api/notifications'):
                parts = urllib.parse.urlparse(self.path)
                qs = urllib.parse.parse_qs(parts.query)
                user_id = qs.get('user_id', [None])[0]
                if user_id:
                    c.execute("SELECT * FROM notifications WHERE user_id=? ORDER BY id DESC LIMIT 50", (user_id,))
                else:
                    c.execute("SELECT * FROM notifications ORDER BY id DESC LIMIT 50")
                self.send_json(c.fetchall())
                
            elif self.path.startswith('/api/messages'):
                parts = urllib.parse.urlparse(self.path)
                qs = urllib.parse.parse_qs(parts.query)
                channel = qs.get('channel', [None])[0]
                if channel:
                    c.execute("SELECT * FROM messages WHERE channel_name=? ORDER BY id ASC", (channel,))
                else:
                    c.execute("SELECT * FROM messages ORDER BY id ASC")
                self.send_json(c.fetchall())

            else:
                self.send_json({"error": "Not found"}, 404)
            conn.close()
        else:
            # Fallback to Single Page App behavior
            if not os.path.exists(self.translate_path(self.path)):
                self.path = '/'
            super().do_GET()

    def do_POST(self):
        if self.path.startswith('/api/'):
            conn = sqlite3.connect(DB_FILE)
            conn.row_factory = dict_factory
            c = conn.cursor()
            body = self.get_body()
            
            if self.path == '/api/login':
                username, password = body.get('username'), body.get('password')
                c.execute("SELECT id, username, role, team FROM users WHERE username=? AND password=?", (username, password))
                user = c.fetchone()
                if user:
                    self.send_json(user)
                else:
                    self.send_json({"error": "Invalid credentials"}, 401)
                    
            elif self.path == '/api/users':
                username, password, role, team = body.get('username'), body.get('password'), body.get('role'), body.get('team')
                try:
                    c.execute("INSERT INTO users (username, password, role, team) VALUES (?, ?, ?, ?)", (username, password, role, team))
                    conn.commit()
                    self.send_json({"status": "ok"})
                except sqlite3.IntegrityError:
                    self.send_json({"error": "Username taken"}, 400)
            
            elif self.path == '/api/task-comments':
                task_id = body.get('task_id')
                author = body.get('author', 'unknown')
                content = body.get('content', '').strip()
                now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
                if task_id and content:
                    c.execute("INSERT INTO task_comments (task_id, author, content, created_at) VALUES (?, ?, ?, ?)",
                              (task_id, author, content, now))
                    conn.commit()
                    self.send_json({"status": "ok"})
                else:
                    self.send_json({"error": "Missing task_id or content"}, 400)

            elif self.path == '/api/comments':
                project_id = body.get('project_id')
                note = body.get('note')
                phase = body.get('phase')
                today = datetime.now().strftime('%Y-%m-%d')
                c.execute("INSERT INTO history (project_id, date, phase, status, note) VALUES (?, ?, ?, ?, ?)", 
                          (project_id, today, phase, 'note', note))
                conn.commit()
                self.send_json({"status": "ok"})
                
            elif self.path == '/api/projects':
                id, title, description, phase, team, assignee, progress, nextStep = body.get('id'), body.get('title'), body.get('description'), body.get('phase'), body.get('team'), body.get('assignee'), body.get('progress'), body.get('nextStep')
                start_date, target_date = body.get('start_date'), body.get('target_date')
                is_deployed = body.get('is_deployed', 0)
                is_iterating = body.get('is_iterating', 0)
                iteration = body.get('iteration', 1)
                blockers = ", ".join(body.get('blockers', []))
                short_description = body.get('short_description', '')
                full_description = body.get('full_description', '')
                stakeholders = json.dumps(body.get('stakeholders', []))
                
                try:
                    c.execute("INSERT INTO projects (id, title, description, phase, team, assignee, progress, blockers, nextStep, start_date, target_date, is_deployed, iteration, is_iterating, short_description, full_description, stakeholders) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                              (id, title, description, phase, team, assignee, progress, blockers, nextStep, start_date, target_date, is_deployed, iteration, is_iterating, short_description, full_description, stakeholders))
                    
                    # Insert initial history note
                    today = datetime.now().strftime('%Y-%m-%d')
                    c.execute("INSERT INTO history (project_id, date, phase, status, note) VALUES (?, ?, ?, ?, ?)", 
                              (id, today, phase, 'completed', 'Project Initialized.'))
                    
                    conn.commit()
                    self.send_json({"status": "ok"})
                except sqlite3.IntegrityError:
                    self.send_json({"error": "Project ID already exists"}, 400)
            elif self.path == '/api/tasks':
                now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
                try:
                    c.execute(
                        "INSERT INTO tasks (project_id, title, description, crisp_dm_phase, assignee, team, status, created_by, created_at, approval_status, acceptance_status, start_date, due_date) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
                        (body.get('project_id'), body.get('title'), body.get('description',''),
                         body.get('crisp_dm_phase'), body.get('assignee',''), body.get('team',''),
                         body.get('status','todo'), body.get('created_by',''), now,
                         body.get('approval_status', 'approved'), body.get('acceptance_status', 'pending_acceptance'),
                         body.get('start_date', None), body.get('due_date', None))
                    )
                    new_id = c.lastrowid
                    conn.commit()
                    self.send_json({"status": "ok", "id": new_id})
                except Exception as ex:
                    self.send_json({"error": str(ex)}, 400)

            elif self.path == '/api/audit-logs':
                now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
                c.execute(
                    "INSERT INTO audit_logs (timestamp, username, user_role, action, details) VALUES (?,?,?,?,?)",
                    (now, body.get('username',''), body.get('user_role',''), body.get('action',''), body.get('details',''))
                )
                conn.commit()
                self.send_json({"status": "ok"})
                
            elif self.path == '/api/notifications':
                now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
                c.execute(
                    "INSERT INTO notifications (user_id, message, is_read, created_at, related_task_id) VALUES (?,?,?,?,?)",
                    (body.get('user_id'), body.get('message'), 0, now, body.get('related_task_id'))
                )
                conn.commit()
                self.send_json({"status": "ok"})
                
            elif self.path == '/api/messages':
                now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
                c.execute(
                    "INSERT INTO messages (channel_name, sender, content, timestamp) VALUES (?,?,?,?)",
                    (body.get('channel_name'), body.get('sender'), body.get('content'), now)
                )
                new_id = c.lastrowid
                conn.commit()
                self.send_json({"status": "ok", "id": new_id})

            conn.close()
        else:
            self.send_error(404)
            
    def do_PUT(self):
        if self.path.startswith('/api/projects/'):
            pass # we handle it below via startswith('/api/projects') but with no trailing slash
        if self.path.startswith('/api/projects'):
            conn = sqlite3.connect(DB_FILE)
            c = conn.cursor()
            body = self.get_body()
            
            project_id = body.get('id')
            blockers = ", ".join(body.get('blockers', []))
            stakeholders = json.dumps(body.get('stakeholders', []))
            
            try:
                c.execute('''
                    UPDATE projects SET 
                    title=?, description=?, phase=?, team=?, assignee=?, progress=?, blockers=?, nextStep=?, start_date=?, target_date=?, is_deployed=?, iteration=?, is_iterating=?, short_description=?, full_description=?, stakeholders=?
                    WHERE id=?
                ''', (body.get('title'), body.get('description'), body.get('phase'), body.get('team'), 
                      body.get('assignee'), body.get('progress'), blockers, body.get('nextStep'), body.get('start_date'), body.get('target_date'), int(body.get('is_deployed', 0)), int(body.get('iteration', 1)), int(body.get('is_iterating', 0)), body.get('short_description', ''), body.get('full_description', ''), stakeholders, project_id))
            except sqlite3.OperationalError:
                c.execute('''
                    UPDATE projects SET 
                    title=?, description=?, phase=?, team=?, assignee=?, progress=?, blockers=?, nextStep=?, start_date=?, target_date=?, is_deployed=?, iteration=?, is_iterating=?
                    WHERE id=?
                ''', (body.get('title'), body.get('description'), body.get('phase'), body.get('team'), 
                      body.get('assignee'), body.get('progress'), blockers, body.get('nextStep'), body.get('start_date'), body.get('target_date'), int(body.get('is_deployed', 0)), int(body.get('iteration', 1)), int(body.get('is_iterating', 0)), project_id))
            
            # Check for new history items to insert
            history = body.get('history', [])
            c.execute("SELECT COUNT(*) FROM history WHERE project_id=?", (project_id,))
            existing_history_count = c.fetchone()[0]
            
            if len(history) > existing_history_count:
                new_items = history[existing_history_count:]
                for item in new_items:
                    c.execute("INSERT INTO history (project_id, date, phase, status, note) VALUES (?, ?, ?, ?, ?)",
                              (project_id, item.get('date'), item.get('phase'), item.get('status'), item.get('note')))
            
            conn.commit()
            conn.close()
            self.send_json({"status": "ok"})

        elif self.path.startswith('/api/tasks/'):
            task_id = self.path.split('/')[-1]
            body = self.get_body()
            conn = sqlite3.connect(DB_FILE)
            c = conn.cursor()
            
            try:
                c.execute(
                    "UPDATE tasks SET title=?, description=?, crisp_dm_phase=?, assignee=?, team=?, status=?, resolution_note=?, completed_by=?, approval_status=?, acceptance_status=?, start_date=?, due_date=?, accepted_at=?, resolved_at=? WHERE id=?",
                    (body.get('title'), body.get('description'), body.get('crisp_dm_phase'),
                     body.get('assignee'), body.get('team'), body.get('status'), 
                     body.get('resolution_note'), body.get('completed_by'),
                     body.get('approval_status'), body.get('acceptance_status'),
                     body.get('start_date'), body.get('due_date'), body.get('accepted_at'), body.get('resolved_at'),
                     task_id)
                )
            except sqlite3.OperationalError:
                # If they haven't re-run init_db yet
                try:
                    c.execute(
                        "UPDATE tasks SET title=?, description=?, crisp_dm_phase=?, assignee=?, team=?, status=?, resolution_note=?, completed_by=? WHERE id=?",
                        (body.get('title'), body.get('description'), body.get('crisp_dm_phase'),
                         body.get('assignee'), body.get('team'), body.get('status'), 
                         body.get('resolution_note'), body.get('completed_by'), task_id)
                    )
                except sqlite3.OperationalError:
                     c.execute(
                        "UPDATE tasks SET title=?, description=?, crisp_dm_phase=?, assignee=?, team=?, status=? WHERE id=?",
                        (body.get('title'), body.get('description'), body.get('crisp_dm_phase'),
                         body.get('assignee'), body.get('team'), body.get('status'), task_id)
                    )
                
            conn.commit()
            conn.close()
            self.send_json({"status": "ok"})
            
        elif self.path.startswith('/api/notifications/'):
            notif_id = self.path.split('/')[-1]
            body = self.get_body()
            conn = sqlite3.connect(DB_FILE)
            c = conn.cursor()
            c.execute("UPDATE notifications SET is_read=? WHERE id=?", (body.get('is_read', 1), notif_id))
            conn.commit()
            conn.close()
            self.send_json({"status": "ok"})

        elif self.path.startswith('/api/users/'):
            user_id = self.path.split('/')[-1]
            body = self.get_body()
            conn = sqlite3.connect(DB_FILE)
            c = conn.cursor()
            if body.get('password'):
                c.execute("UPDATE users SET role=?, team=?, password=? WHERE id=?",
                          (body.get('role'), body.get('team'), body.get('password'), user_id))
            else:
                c.execute("UPDATE users SET role=?, team=? WHERE id=?",
                          (body.get('role'), body.get('team'), user_id))
            conn.commit()
            conn.close()
            self.send_json({"status": "ok"})

        else:
            self.send_error(404)


    def do_DELETE(self):
        if self.path.startswith('/api/projects/'):
            project_id = self.path.split('/')[-1]
            conn = sqlite3.connect(DB_FILE)
            c = conn.cursor()
            
            # Cascade delete matching history and the project itself
            c.execute("DELETE FROM history WHERE project_id=?", (project_id,))
            c.execute("DELETE FROM projects WHERE id=?", (project_id,))
            
            conn.commit()
            conn.close()
            self.send_json({"status": "ok"})
        elif self.path.startswith('/api/tasks/'):
            task_id = self.path.split('/')[-1]
            conn = sqlite3.connect(DB_FILE)
            c = conn.cursor()
            c.execute("DELETE FROM tasks WHERE id=?", (task_id,))
            conn.commit()
            conn.close()
            self.send_json({"status": "ok"})
        elif self.path.startswith('/api/users/'):
            user_id = self.path.split('/')[-1]
            conn = sqlite3.connect(DB_FILE)
            c = conn.cursor()
            c.execute("DELETE FROM users WHERE id=?", (user_id,))
            conn.commit()
            conn.close()
            self.send_json({"status": "ok"})
        else:
            self.send_error(404)

if __name__ == '__main__':
    init_db()
    server_address = ('', 8080)
    httpd = HTTPServer(server_address, APIHandler)
    print("Serving on port 8080...")
    httpd.serve_forever()
