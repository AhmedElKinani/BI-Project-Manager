import os
import json
import hashlib
from http.server import SimpleHTTPRequestHandler, HTTPServer
from socketserver import ThreadingMixIn
import urllib.parse
from datetime import datetime

from database import SessionLocal, engine, Base
from models import User, Project, Task, History, TaskComment, AuditLog, Notification, Message

def hash_password(pw: str) -> str:
    return hashlib.sha256(pw.encode()).hexdigest()

def dict_factory(row):
    return {c.name: getattr(row, c.name) for c in row.__table__.columns}

def seed_db():
    db = SessionLocal()
    try:
        if db.query(User).count() == 0:
            db.add_all([
                User(username='admin', password=hash_password('admin'), role='admin', team='SysAdmin'),
                User(username='alice', password=hash_password('password'), role='leader', team='Data Engineering'),
                User(username='bob', password=hash_password('password'), role='member', team='Data Engineering'),
                User(username='carol', password=hash_password('password'), role='leader', team='Data Science'),
                User(username='dave', password=hash_password('password'), role='member', team='Data Science'),
                User(username='eve', password=hash_password('password'), role='leader', team='BI & Analytics'),
                User(username='frank', password=hash_password('password'), role='member', team='BI & Analytics')
            ])
            db.commit()
    finally:
        db.close()

class APIHandler(SimpleHTTPRequestHandler):
    def _require_auth(self):
        user = self.headers.get('X-User', '').strip()
        if not user:
            self.send_json({"error": "Unauthorized"}, 401)
            return None
        return user

    def _require_admin(self):
        role = self.headers.get('X-Role', '').strip()
        if role != 'admin':
            self.send_json({"error": "Forbidden"}, 403)
            return False
        return True

    def send_json(self, data, status=200):
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(data).encode('utf-8'))

    def get_body(self):
        content_length = int(self.headers.get('Content-Length', 0))
        if content_length == 0:
            return {}
        return json.loads(self.rfile.read(content_length).decode('utf-8'))

    def do_GET(self):
        if self.path.startswith('/api/'):
            if not self._require_auth():
                return
            db = SessionLocal()
            try:
                if self.path == '/api/projects':
                    projects = db.query(Project).all()
                    result = []
                    for p in projects:
                        d = dict_factory(p)
                        d['history'] = [dict_factory(h) for h in p.history]
                        d['blockers'] = [b.strip() for b in (p.blockers or '').split(',') if b.strip()]
                        d['stakeholders'] = json.loads(p.stakeholders or '[]')
                        
                        tasks = p.tasks
                        d['computed_progress'] = self._compute_progress(tasks)
                        result.append(d)
                    self.send_json(result)
                
                elif self.path == '/api/users':
                    users = db.query(User).all()
                    self.send_json([dict_factory(u) for u in users])
                    
                elif self.path.startswith('/api/tasks'):
                    parts = urllib.parse.urlparse(self.path)
                    qs = urllib.parse.parse_qs(parts.query)
                    role = qs.get('role', [None])[0]
                    team = qs.get('team', [None])[0]
                    project_id = qs.get('project_id', [None])[0]
                    assignee = qs.get('assignee', [None])[0]
                    approval_status = qs.get('approval_status', [None])[0]
                    acceptance_status = qs.get('acceptance_status', [None])[0]
                    
                    query = db.query(Task)
                    
                    if role == 'member' and team:
                        query = query.filter(Task.team == team)
                    if project_id:
                        query = query.filter(Task.project_id == project_id)
                    if assignee:
                        query = query.filter(Task.assignee == assignee)
                    if approval_status:
                        query = query.filter(Task.approval_status == approval_status)
                    if acceptance_status:
                        query = query.filter(Task.acceptance_status == acceptance_status)
                        
                    tasks = query.order_by(Task.id.desc()).all()
                    self.send_json([dict_factory(t) for t in tasks])
                    
                elif self.path.startswith('/api/task-comments'):
                    parts = urllib.parse.urlparse(self.path)
                    qs = urllib.parse.parse_qs(parts.query)
                    task_id = qs.get('task_id', [None])[0]
                    
                    query = db.query(TaskComment)
                    if task_id:
                        query = query.filter(TaskComment.task_id == task_id)
                        
                    comments = query.order_by(TaskComment.id.asc()).all()
                    self.send_json([dict_factory(c) for c in comments])
                    
                elif self.path.startswith('/api/audit-logs'):
                    logs = db.query(AuditLog).order_by(AuditLog.id.desc()).limit(200).all()
                    self.send_json([dict_factory(l) for l in logs])
                    
                elif self.path.startswith('/api/notifications'):
                    parts = urllib.parse.urlparse(self.path)
                    qs = urllib.parse.parse_qs(parts.query)
                    user_id = qs.get('user_id', [None])[0]
                    
                    query = db.query(Notification)
                    if user_id:
                        query = query.filter(Notification.user_id == user_id)
                        
                    notifs = query.order_by(Notification.id.desc()).limit(50).all()
                    self.send_json([dict_factory(n) for n in notifs])
                    
                elif self.path.startswith('/api/messages'):
                    parts = urllib.parse.urlparse(self.path)
                    qs = urllib.parse.parse_qs(parts.query)
                    channel = qs.get('channel', [None])[0]
                    
                    query = db.query(Message)
                    if channel:
                        query = query.filter(Message.channel_name == channel)
                        
                    messages = query.order_by(Message.id.asc()).all()
                    self.send_json([dict_factory(m) for m in messages])
                    
                else:
                    self.send_json({"error": "Not found"}, 404)
            except Exception as e:
                print(f"Error GET {self.path}: {e}")
                self.send_json({"error": str(e)}, 500)
            finally:
                db.close()
        else:
            if not os.path.exists(self.translate_path(self.path)):
                self.path = '/'
            super().do_GET()

    def do_POST(self):
        if self.path.startswith('/api/'):
            if self.path != '/api/login' and not self._require_auth():
                return
            db = SessionLocal()
            try:
                body = self.get_body()
                
                if self.path == '/api/login':
                    username, password = body.get('username'), body.get('password')
                    user = db.query(User).filter(User.username == username, User.password == hash_password(password)).first()
                    if user:
                        self.send_json(dict_factory(user))
                    else:
                        self.send_json({"error": "Invalid credentials"}, 401)
                        
                elif self.path == '/api/users':
                    if not self._require_admin(): return
                    username, password, role, team = body.get('username'), body.get('password'), body.get('role'), body.get('team')
                    try:
                        new_user = User(username=username, password=hash_password(password), role=role, team=team)
                        db.add(new_user)
                        db.commit()
                        self.send_json({"status": "ok"})
                    except Exception:
                        db.rollback()
                        self.send_json({"error": "Username taken"}, 400)
                
                elif self.path == '/api/task-comments':
                    task_id = body.get('task_id')
                    author = body.get('author', 'unknown')
                    content = body.get('content', '').strip()
                    if task_id and content:
                        new_comment = TaskComment(task_id=task_id, author=author, content=content)
                        db.add(new_comment)
                        db.commit()
                        self.send_json({"status": "ok"})
                    else:
                        self.send_json({"error": "Missing task_id or content"}, 400)

                elif self.path == '/api/comments':
                    project_id = body.get('project_id')
                    note = body.get('note')
                    phase = body.get('phase')
                    today = datetime.now().strftime('%Y-%m-%d')
                    new_hist = History(project_id=project_id, date=today, phase=phase, status='note', note=note)
                    db.add(new_hist)
                    db.commit()
                    self.send_json({"status": "ok"})
                    
                elif self.path == '/api/projects':
                    id = body.get('id')
                    title = body.get('title')
                    description = body.get('description')
                    phase = body.get('phase')
                    team = body.get('team')
                    assignee = body.get('assignee')
                    progress = body.get('progress')
                    nextStep = body.get('nextStep')
                    start_date = body.get('start_date')
                    target_date = body.get('target_date')
                    is_deployed = body.get('is_deployed', 0)
                    is_iterating = body.get('is_iterating', 0)
                    iteration = body.get('iteration', 1)
                    blockers = ", ".join(body.get('blockers', []))
                    short_description = body.get('short_description', '')
                    full_description = body.get('full_description', '')
                    stakeholders = json.dumps(body.get('stakeholders', []))
                    
                    try:
                        new_proj = Project(
                            id=id, title=title, description=description, phase=phase, team=team, assignee=assignee, 
                            progress=progress, blockers=blockers, nextStep=nextStep, start_date=start_date, 
                            target_date=target_date, is_deployed=is_deployed, iteration=iteration, 
                            is_iterating=is_iterating, short_description=short_description, 
                            full_description=full_description, stakeholders=stakeholders
                        )
                        db.add(new_proj)
                        today = datetime.now().strftime('%Y-%m-%d')
                        new_hist = History(project_id=id, date=today, phase=phase, status='completed', note='Project Initialized.')
                        db.add(new_hist)
                        db.commit()
                        self.send_json({"status": "ok"})
                    except Exception:
                        db.rollback()
                        self.send_json({"error": "Project ID already exists"}, 400)
                        
                elif self.path == '/api/tasks':
                    try:
                        new_task = Task(
                            project_id=body.get('project_id'),
                            title=body.get('title'),
                            description=body.get('description', ''),
                            crisp_dm_phase=body.get('crisp_dm_phase'),
                            assignee=body.get('assignee', ''),
                            team=body.get('team', ''),
                            status=body.get('status', 'todo'),
                            created_by=body.get('created_by', ''),
                            approval_status=body.get('approval_status', 'approved'),
                            acceptance_status=body.get('acceptance_status', 'pending_acceptance'),
                            start_date=body.get('start_date'),
                            due_date=body.get('due_date')
                        )
                        db.add(new_task)
                        db.commit()
                        self.send_json({"status": "ok", "id": new_task.id})
                    except Exception as ex:
                        db.rollback()
                        self.send_json({"error": str(ex)}, 400)

                elif self.path == '/api/audit-logs':
                    now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
                    new_log = AuditLog(
                        timestamp=now, username=body.get('username', ''), user_role=body.get('user_role', ''),
                        action=body.get('action', ''), details=body.get('details', '')
                    )
                    db.add(new_log)
                    db.commit()
                    self.send_json({"status": "ok"})
                    
                elif self.path == '/api/notifications':
                    new_notif = Notification(
                        user_id=body.get('user_id'), message=body.get('message'), is_read=0,
                        related_task_id=body.get('related_task_id'),
                        created_at=datetime.now().strftime('%Y-%m-%d %H:%M:%S')
                    )
                    db.add(new_notif)
                    db.commit()
                    self.send_json({"status": "ok"})
                    
                elif self.path == '/api/messages':
                    new_msg = Message(
                        channel_name=body.get('channel_name'), sender=body.get('sender'),
                        content=body.get('content'), timestamp=datetime.now().strftime('%Y-%m-%d %H:%M:%S')
                    )
                    db.add(new_msg)
                    db.commit()
                    self.send_json({"status": "ok", "id": new_msg.id})
            finally:
                db.close()

    def do_PUT(self):
        if self.path.startswith('/api/'):
            if not self._require_auth():
                return
            db = SessionLocal()
            try:
                body = self.get_body()
                if self.path.startswith('/api/projects'):
                    project_id = body.get('id')
                    proj = db.query(Project).filter(Project.id == project_id).first()
                    if proj:
                        proj.title = body.get('title')
                        proj.description = body.get('description')
                        proj.phase = body.get('phase')
                        proj.team = body.get('team')
                        proj.assignee = body.get('assignee')
                        proj.progress = body.get('progress')
                        proj.nextStep = body.get('nextStep')
                        proj.start_date = body.get('start_date')
                        proj.target_date = body.get('target_date')
                        proj.is_deployed = body.get('is_deployed', 0)
                        proj.iteration = body.get('iteration', 1)
                        proj.is_iterating = body.get('is_iterating', 0)
                        proj.short_description = body.get('short_description', '')
                        proj.full_description = body.get('full_description', '')
                        proj.blockers = ", ".join(body.get('blockers', []))
                        proj.stakeholders = json.dumps(body.get('stakeholders', []))
                        
                        history = body.get('history', [])
                        db.query(History).filter(History.project_id == project_id).delete()
                        for h in history:
                            new_h = History(
                                project_id=project_id, date=h.get('date'), phase=h.get('phase'),
                                status=h.get('status'), note=h.get('note')
                            )
                            db.add(new_h)
                        db.commit()
                    self.send_json({"status": "ok"})

                elif self.path.startswith('/api/tasks/'):
                    task_id = self.path.split('/')[-1]
                    task = db.query(Task).filter(Task.id == task_id).first()
                    if task:
                        for k, v in body.items():
                            if hasattr(task, k) and k != 'id':
                                setattr(task, k, v)
                        db.commit()
                    self.send_json({"status": "ok"})

                elif self.path.startswith('/api/users/'):
                    if not self._require_admin(): return
                    user_id = self.path.split('/')[-1]
                    user = db.query(User).filter(User.id == user_id).first()
                    if user:
                        user.role = body.get('role')
                        user.team = body.get('team')
                        if body.get('password'):
                            user.password = hash_password(body.get('password'))
                        db.commit()
                    self.send_json({"status": "ok"})
                    
                elif self.path.startswith('/api/notifications/'):
                    notif_id = self.path.split('/')[-1]
                    notif = db.query(Notification).filter(Notification.id == notif_id).first()
                    if notif:
                        notif.is_read = body.get('is_read', 0)
                        db.commit()
                    self.send_json({"status": "ok"})
            finally:
                db.close()

    def do_DELETE(self):
        if self.path.startswith('/api/'):
            if not self._require_auth():
                return
            db = SessionLocal()
            try:
                if self.path.startswith('/api/projects/'):
                    if not self._require_admin(): return
                    project_id = self.path.split('/')[-1]
                    proj = db.query(Project).filter(Project.id == project_id).first()
                    if proj:
                        db.delete(proj)
                        db.commit()
                    self.send_json({"status": "ok"})
                elif self.path.startswith('/api/tasks/'):
                    task_id = self.path.split('/')[-1]
                    task = db.query(Task).filter(Task.id == task_id).first()
                    if task:
                        db.delete(task)
                        db.commit()
                    self.send_json({"status": "ok"})
                elif self.path.startswith('/api/users/'):
                    if not self._require_admin(): return
                    user_id = self.path.split('/')[-1]
                    user = db.query(User).filter(User.id == user_id).first()
                    if user:
                        db.delete(user)
                        db.commit()
                    self.send_json({"status": "ok"})
                else:
                    self.send_error(404)
            finally:
                db.close()

    def _compute_progress(self, tasks):
        if not tasks: return 0
        phase_stats = {}
        for t in tasks:
            ph = t.crisp_dm_phase
            phase_stats.setdefault(ph, {'done': 0, 'total': 0})
            phase_stats[ph]['total'] += 1
            if t.status == 'done':
                phase_stats[ph]['done'] += 1
        ratios = [s['done']/s['total'] for s in phase_stats.values() if s['total']]
        return int((sum(ratios)/len(ratios))*100) if ratios else 0

class ThreadedHTTPServer(ThreadingMixIn, HTTPServer):
    daemon_threads = True

if __name__ == '__main__':
    Base.metadata.create_all(bind=engine)
    seed_db()
    server_address = ('', 8080)
    httpd = ThreadedHTTPServer(server_address, APIHandler)
    print("Serving on port 8080 (Threaded, PostgreSQL via SQLAlchemy ORM)...")
    httpd.serve_forever()
