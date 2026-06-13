import os
import json
import hashlib
import logging
import jwt
import bcrypt
import uuid
import asyncio
from datetime import datetime, timedelta, timezone
from typing import List, Optional, Dict

from fastapi import FastAPI, Depends, HTTPException, Request, Response, status, Query, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.orm import Session, joinedload

# Structured production logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(name)s: %(message)s',
    datefmt='%Y-%m-%dT%H:%M:%S'
)
logger = logging.getLogger('bi_manager')

from database import SessionLocal, engine, Base, get_db
from models import (
    User, Project, Task, History, TaskComment, AuditLog, Notification, Message,
    Role, Permission, RolePermission, Team, Phase, TeamPhase, UserTeam, Session as SessionModel, TaskStateLog, ProjectStream,
    PublishedShortcut, PhaseComment, SystemSetting, ProjectSnapshot, ProjectMember
)

JWT_SECRET = os.environ.get('JWT_SECRET')
if not JWT_SECRET:
    raise RuntimeError("JWT_SECRET environment variable is missing")

def hash_password(pw: str) -> str:
    # legacy sha256 for checking old passwords before rehash
    return hashlib.sha256(pw.encode()).hexdigest()

def check_password(pw: str, hashed: str) -> bool:
    if hashed.startswith('$2b$'):
        return bcrypt.checkpw(pw.encode(), hashed.encode())
    return hash_password(pw) == hashed

def hash_password_bcrypt(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode('utf-8')

# Custom model serialization to maintain full backwards compatibility with Frontend UI schema keys
def serialize_model(obj, db: Session, active_phases: Optional[List[str]] = None):
    if obj is None:
        return None
    
    result = {}
    # Extract native SQLAlchemy table attributes
    for c in obj.__table__.columns:
        val = getattr(obj, c.name)
        if isinstance(val, datetime):
            result[c.name] = val.isoformat()
        elif hasattr(val, 'isoformat'):  # date objects
            result[c.name] = val.isoformat()
        else:
            result[c.name] = val
            
    # Model-specific relationship expansions to match original front-end expectations
    if isinstance(obj, User):
        result["role"] = obj.role_rel.name if obj.role_rel else ""
        pt = db.query(UserTeam).filter_by(user_id=obj.id, is_primary=True).first()
        result["team"] = db.query(Team).filter_by(id=pt.team_id).first().name if pt else ""
        
    elif isinstance(obj, Project):
        result["phase"] = obj.phase_rel.name if obj.phase_rel else ""
        result["team"] = obj.team_rel.name if obj.team_rel else ""
        result["assignee"] = obj.assignee_rel.username if obj.assignee_rel else ""
        result["blockers"] = [b.strip() for b in (obj.blockers or '').split(',') if b.strip()]
        try:
            result["stakeholders"] = json.loads(obj.stakeholders or '[]')
        except:
            result["stakeholders"] = []
        try:
            result["shortcuts"] = json.loads(obj.shortcuts or '[]')
        except:
            result["shortcuts"] = []
        result["history"] = [serialize_model(h, db, active_phases) for h in obj.history]
        result["computed_progress"] = _compute_project_progress(obj, obj.tasks, db, active_phases)
        result["progress"] = result["computed_progress"]
        result["project_lead"] = obj.lead_rel.username if obj.lead_rel else None
        result["project_lead_id"] = obj.project_lead_id
        result["members"] = [
            {
                "user_id": pm.user_id,
                "username": pm.user.username if pm.user else "Unknown",
                "assigned_phases": [p.strip() for p in (pm.assigned_phases or "").split(",") if p.strip()]
            } for pm in (obj.members or [])
        ]

    elif isinstance(obj, Task):
        result["crisp_dm_phase"] = obj.phase_rel.name if obj.phase_rel else ""
        result["assignee"] = obj.assignee_rel.username if obj.assignee_rel else ""
        result["team"] = obj.team_rel.name if obj.team_rel else ""
        result["created_by"] = obj.created_by_rel.username if obj.created_by_rel else ""
        result["completed_by"] = obj.completed_by_rel.username if obj.completed_by_rel else ""

    elif isinstance(obj, TaskComment):
        result["author"] = obj.author_rel.username if obj.author_rel else ""

    elif isinstance(obj, Notification):
        result["user_id"] = str(obj.user_fk)

    elif isinstance(obj, Message):
        result["sender"] = obj.sender_rel.username if obj.sender_rel else ""

    return result

def get_user_permissions(db: Session, user_id: int):
    user = db.query(User).filter(User.id == user_id).first()
    if not user or not user.role_id: return []
    perms = db.query(Permission.code).join(RolePermission).filter(RolePermission.role_id == user.role_id).all()
    return [p[0] for p in perms]

def get_user_team_ids(db: Session, user_id: int):
    teams = db.query(UserTeam.team_id).filter(UserTeam.user_id == user_id).all()
    return [t[0] for t in teams]

# Core FastAPI App setup
app = FastAPI(title="BI Project Manager API", version="2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: str):
        for connection in list(self.active_connections):
            try:
                await connection.send_text(message)
            except Exception:
                self.disconnect(connection)

manager = ConnectionManager()

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception:
        manager.disconnect(websocket)

def broadcast_event(event_type: str, payload: dict):
    message = json.dumps({"event": event_type, "data": payload})
    try:
        try:
            loop = asyncio.get_running_loop()
            loop.create_task(manager.broadcast(message))
        except RuntimeError:
            asyncio.run(manager.broadcast(message))
    except Exception:
        pass

# Authentication Dependency
def get_current_user_id(request: Request, db: Session = Depends(get_db)) -> int:
    token = request.cookies.get('session')
    if not token:
        raise HTTPException(status_code=401, detail="Unauthorized")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=['HS256'])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Session expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")
        
    token_hash = hashlib.sha256(payload['jti'].encode()).hexdigest()
    session = db.query(SessionModel).filter_by(token_hash=token_hash, revoked=False).first()
    if not session or session.expires_at.replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="Session revoked or expired")
    return payload['sub']

LEGACY_PERMISSION_MAP = {
    "task.create": ["can_create:Task"],
    "task.read": ["can_read:Task"],
    "task.update": ["can_write:Task"],
    "task.delete": ["can_delete:Task"],
    "task.approve": ["can_approve:Task"],
    "task.review_accept": ["can_accept:Task"],
    "task.review_finish": ["can_finish:Task"],
    "task.block": ["can_block:Task"],
    "project.create": ["can_create:Project"],
    "project.read": ["can_read:Project"],
    "project.read_all": ["can_read_all_projects:Project"],
    "project.read_team": ["can_read_team_projects:Project"],
    "project.read_own": ["can_read_own_projects:Project"],
    "project.update": ["can_write:Project"],
    "project.delete": ["can_delete:Project"],
    "project.manage": ["can_manage:Project"],
    "project.phase_submit": ["can_submit_phase:Project"],
    "project.phase_any": ["can_any_phase:Project"],
    "user.manage": ["can_manage:User"],
    "audit.read": ["menu_access:AuditLog"],
    "analytics.read_all": ["can_read_all:Task", "can_read_all_tasks:Task"],
    "analytics.read_team": ["can_read_team:Task", "can_read_team_tasks:Task"],
    "analytics.read_own": ["can_read_own:Task", "can_read_own_tasks:Task"],
    "admin.panel": ["menu_access:AdminPanel"],
    "config.manage": ["can_manage:Config"],
    "messages.read": ["menu_access:Comms"],
    "messages.create": ["can_create:Message"]
}

def get_mapped_permission_codes(code: str) -> list:
    mapped = [code]
    if code in LEGACY_PERMISSION_MAP:
        mapped.extend(LEGACY_PERMISSION_MAP[code])
    for legacy, supersets in LEGACY_PERMISSION_MAP.items():
        if code in supersets:
            mapped.append(legacy)
            mapped.extend(supersets)
    return list(set(mapped))

def check_permission(code: str, user_id: int, db: Session):
    perms = get_user_permissions(db, user_id)
    mapped_codes = get_mapped_permission_codes(code)
    if not any(c in perms for c in mapped_codes):
        raise HTTPException(status_code=403, detail="Forbidden")

def has_permission(code: str, user_id: int, db: Session) -> bool:
    perms = get_user_permissions(db, user_id)
    mapped_codes = get_mapped_permission_codes(code)
    return any(c in perms for c in mapped_codes)

def user_can(user_id: int, action: str, resource: str, db: Session) -> bool:
    code = f"can_{action}:{resource}"
    return has_permission(code, user_id, db)

def apply_task_security_filter(query, user_id: int, db: Session):
    perms = get_user_permissions(db, user_id)
    # 1. Global Scope Check
    if any(c in perms for c in ['can_read_all_tasks:Task', 'analytics.read_all']):
        return query
        
    # 2. Team Scope Check
    user_team_ids = get_user_team_ids(db, user_id)
    if any(c in perms for c in ['can_read_team_tasks:Task', 'analytics.read_team']):
        team_user_ids = [ut.user_id for ut in db.query(UserTeam).filter(UserTeam.team_id.in_(user_team_ids)).all()]
        return query.filter(
            (Task.team_id.in_(user_team_ids)) |
            (Task.assignee_id.in_(team_user_ids)) |
            (Task.created_by_id.in_(team_user_ids))
        )
        
    # 3. Personal (Own) Scope Check
    if any(c in perms for c in ['can_read_own_tasks:Task', 'analytics.read_own', 'task.read']):
        return query.filter(
            (Task.assignee_id == user_id) |
            (Task.created_by_id == user_id)
        )
        
    # 4. Zero-Trust Access Denied (Default fallback)
    return query.filter(Task.id == -1)

def apply_project_security_filter(query, user_id: int, db: Session):
    perms = get_user_permissions(db, user_id)
    if any(c in perms for c in ['can_read_all_projects:Project', 'analytics.read_all', 'project.read_all']):
        return query
    elif any(c in perms for c in ['can_read_team_projects:Project', 'analytics.read_team', 'project.read_team']):
        user_team_ids = get_user_team_ids(db, user_id)
        return query.filter((Project.team_id.in_(user_team_ids)) | (Project.assignee_id == user_id))
    elif any(c in perms for c in ['can_read_own_projects:Project', 'analytics.read_own', 'project.read_own']):
        return query.filter(Project.assignee_id == user_id)
    else:
        user_team_ids = get_user_team_ids(db, user_id)
        return query.filter((Project.team_id.in_(user_team_ids)) | (Project.assignee_id == user_id))

def secure_query(model, user_id: int, db: Session):
    query = db.query(model)
    if model == Task:
        return apply_task_security_filter(query, user_id, db)
    elif model == Project:
        return apply_project_security_filter(query, user_id, db)
    return query

def apply_phase_security_filter(user_id: int, db: Session):
    perms = get_user_permissions(db, user_id)
    has_all_phases = any(c in perms for c in ['can_read_all_phases:Phase', 'project.phase_any', 'can_any_phase:Project'])
    
    if not has_all_phases:
        user_team_ids = get_user_team_ids(db, user_id)
        allowed_phase_ids = [tp.phase_id for tp in db.query(TeamPhase).filter(TeamPhase.team_id.in_(user_team_ids)).all()]
        return db.query(Phase).filter(Phase.id.in_(allowed_phase_ids), Phase.is_active == 1).order_by(Phase.display_order).all()
        
    return db.query(Phase).filter_by(is_active=1).order_by(Phase.display_order).all()

def verify_scope_boundary(user_id: int, team_id: Optional[int], assignee_id: Optional[int], db: Session, bypass_permission: str = "analytics.read_all"):
    if assignee_id == user_id:
        return
    if has_permission(bypass_permission, user_id, db):
        return
    if team_id is not None:
        user_teams = get_user_team_ids(db, user_id)
        if team_id in user_teams:
            return
    raise HTTPException(status_code=403, detail="Resource out of team scope boundaries")

def validate_assignee_scope(assignee_id: Optional[int], team_id: Optional[int], current_user_id: int, db: Session):
    if not assignee_id:
        return
        
    assignee = db.query(User).filter_by(id=assignee_id, is_active=1).first()
    if not assignee:
        raise HTTPException(status_code=400, detail="Selected assignee does not exist or is inactive")
        
    # 1. Prevent non-admins from assigning resources to admin users (dynamic capability check)
    if has_permission("admin.panel", assignee_id, db):
        if not has_permission("admin.panel", current_user_id, db):
            raise HTTPException(status_code=403, detail="Only administrators can assign tasks or projects to administrative accounts")
            
    # 2. Prevent assignment to a user outside the selected team
    if team_id is not None:
        user_in_team = db.query(UserTeam).filter_by(user_id=assignee_id, team_id=team_id).first()
        if not user_in_team:
            raise HTTPException(status_code=400, detail="The selected assignee does not belong to the resource owning team")


# Helper state calculations
def _compute_task_progress(core_tasks):
    if not core_tasks: return 0
    total_est = sum(t.estimated_hours or 0 for t in core_tasks)
    if total_est > 0:
        done_est = sum(t.estimated_hours or 0 for t in core_tasks if t.status == 'done')
        return min(100, round(done_est / total_est * 100))
    done = sum(1 for t in core_tasks if t.status == 'done')
    return min(100, round(done / len(core_tasks) * 100))

def _compute_project_progress(project, tasks, db, active_phases=None):
    if project.is_deployed or project.is_launched or (project.phase_rel and project.phase_rel.is_terminal): return 100
    
    if active_phases is not None:
        phases = active_phases
    else:
        phases = [p.name for p in db.query(Phase).filter_by(is_active=1).order_by(Phase.display_order).all()]
    if not phases: return 0
    
    current_phase_name = project.phase_rel.name if project.phase_rel else ""
    try: current_phase_idx = phases.index(current_phase_name)
    except ValueError: current_phase_idx = 0
    
    streams = project.streams
    completed_streams = {(s.phase_name, s.team_name) for s in streams if s.status == 'complete'}
    manual_progress = {(s.phase_name, s.team_name): s.progress or 0 for s in streams if s.status != 'complete'}
    
    phase_weight = 100 / len(phases)
    total_pct = 0
    
    for idx, phase in enumerate(phases):
        phase_tasks = [t for t in tasks if t.phase_rel and t.phase_rel.name == phase and not getattr(t, 'post_production', False)]
        
        phase_progress = 0
        if phase_tasks:
            teams_in_phase = {t.team_rel.name for t in phase_tasks if t.team_rel}
            team_progresses = []
            for team in teams_in_phase:
                if (phase, team) in completed_streams:
                    team_progresses.append(100)
                else:
                    team_tasks = [t for t in phase_tasks if t.team_rel and t.team_rel.name == team]
                    task_pct = _compute_task_progress(team_tasks)
                    manual_pct = manual_progress.get((phase, team), 0)
                    team_progresses.append(max(task_pct, manual_pct))
            phase_progress = sum(team_progresses) / len(team_progresses) if team_progresses else 0
        else:
            if idx < current_phase_idx:
                phase_progress = 100
            else:
                phase_streams = [s for s in streams if s.phase_name == phase]
                if phase_streams:
                    if all(s.status == 'complete' for s in phase_streams):
                        phase_progress = 100
                    else:
                        phase_progress = max((s.progress or 0) for s in phase_streams)
                else:
                    phase_progress = 0
            
        total_pct += (phase_progress / 100) * phase_weight
        
    return min(100, round(total_pct))

# --- API REST ENDPOINTS ---

@app.get('/api/config/app-name')
def get_app_name(db: Session = Depends(get_db)):
    setting = db.query(SystemSetting).filter(SystemSetting.key == 'app_name').first()
    return {"app_name": setting.value if setting else "BI Project Manager"}

@app.put('/api/config/app-name')
def put_app_name(body: dict, user_id: int = Depends(get_current_user_id), db: Session = Depends(get_db)):
    check_permission('admin.panel', user_id, db)
    new_name = body.get('app_name', '').strip()
    if not new_name:
        raise HTTPException(status_code=400, detail="App name cannot be empty")
    
    setting = db.query(SystemSetting).filter(SystemSetting.key == 'app_name').first()
    if not setting:
        setting = SystemSetting(key='app_name', value=new_name)
        db.add(setting)
    else:
        setting.value = new_name
    db.commit()
    
    # Audit log
    actor = db.query(User).filter(User.id == user_id).first()
    actor_name = actor.username if actor else "an administrator"
    actor_role = "admin"
    if actor and actor.role_id:
        role_obj = db.query(Role).filter_by(id=actor.role_id).first()
        if role_obj:
            actor_role = role_obj.name
            
    db.add(AuditLog(
        timestamp=datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
        username=actor_name,
        user_role=actor_role,
        action="update_app_name",
        details=f"Application Name updated to '{new_name}'"
    ))
    db.commit()
    return {"app_name": new_name}

@app.get('/api/config/bootstrap')
def get_bootstrap(user_id: int = Depends(get_current_user_id), db: Session = Depends(get_db)):
    active_phases = apply_phase_security_filter(user_id, db)
    phases = [serialize_model(p, db) for p in active_phases]
    teams = [t.name for t in db.query(Team).filter_by(is_active=1).all()]
    roles = [serialize_model(r, db) for r in db.query(Role).filter_by(is_active=1).all()]
    
    team_phases_list = db.query(TeamPhase).all()
    teamPhases = {}
    for tp in team_phases_list:
        t = db.query(Team).filter_by(id=tp.team_id).first()
        p = db.query(Phase).filter_by(id=tp.phase_id).first()
        if t and p:
            teamPhases.setdefault(t.name, []).append(p.name)
            
    users = [u.username for u in db.query(User).filter_by(is_active=1).all()]
    users_obj = [serialize_model(u, db) for u in db.query(User).filter_by(is_active=1).all()]
    
    return {
        "phases": [p['name'] for p in phases],
        "phases_obj": phases,
        "teams": teams,
        "teams_obj": [serialize_model(t, db) for t in db.query(Team).filter_by(is_active=1).all()],
        "teamPhases": teamPhases,
        "roles": roles,
        "users": users,
        "users_obj": users_obj
    }

@app.get('/api/me')
def get_me(user_id: int = Depends(get_current_user_id), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    role = db.query(Role).filter(Role.id == user.role_id).first()
    pt = db.query(UserTeam).filter_by(user_id=user.id, is_primary=True).first()
    primary_team = db.query(Team).filter_by(id=pt.team_id).first().name if pt else ""
    
    # Query all user teams to support leaders/members across multiple teams
    teams_query = db.query(Team.name).join(UserTeam).filter(UserTeam.user_id == user.id).all()
    teams_list = [t[0] for t in teams_query]
    
    return {
        "id": user.id,
        "username": user.username,
        "role": role.name if role else "",
        "team": primary_team,
        "teams": teams_list,
        "permissions": get_user_permissions(db, user_id)
    }

@app.post('/api/login')
def login(body: dict, response: Response, db: Session = Depends(get_db)):
    username = body.get('username')
    password = body.get('password')
    if not username or not password:
        raise HTTPException(status_code=400, detail="Username and password are required")
        
    user = db.query(User).filter(User.username == username, User.is_active == 1).first()
    if user and check_password(password, user.password):
        if user.needs_rehash:
            user.password = hash_password_bcrypt(password)
            user.needs_rehash = False
            db.commit()
            
        jti = str(uuid.uuid4())
        token = jwt.encode({
            "sub": user.id,
            "jti": jti,
            "exp": datetime.now(timezone.utc) + timedelta(hours=24)
        }, JWT_SECRET, algorithm="HS256")
        
        session = SessionModel(
            user_id=user.id,
            token_hash=hashlib.sha256(jti.encode()).hexdigest(),
            expires_at=datetime.now(timezone.utc) + timedelta(hours=24)
        )
        db.add(session)
        db.commit()
        
        role = db.query(Role).filter(Role.id == user.role_id).first()
        pt = db.query(UserTeam).filter_by(user_id=user.id, is_primary=True).first()
        primary_team = db.query(Team).filter_by(id=pt.team_id).first().name if pt else ""
        
        response.set_cookie(key="session", value=token, httponly=True, path="/", samesite="lax")
        return {
            "id": user.id,
            "username": user.username,
            "role": role.name if role else "",
            "team": primary_team,
            "permissions": get_user_permissions(db, user.id)
        }
    else:
        raise HTTPException(status_code=401, detail="Invalid credentials")

@app.post('/api/logout')
def logout(request: Request, response: Response, db: Session = Depends(get_db)):
    token = request.cookies.get('session')
    if token:
        try:
            payload = jwt.decode(token, JWT_SECRET, algorithms=['HS256'])
            token_hash = hashlib.sha256(payload['jti'].encode()).hexdigest()
            session = db.query(SessionModel).filter_by(token_hash=token_hash).first()
            if session:
                session.revoked = True
                db.commit()
        except: pass
    response.delete_cookie(key="session", path="/")
    return {"status": "ok"}

# --- USERS ---

@app.get('/api/users')
def get_users(user_id: int = Depends(get_current_user_id), db: Session = Depends(get_db)):
    users = db.query(User).filter(User.is_active == 1).all()
    return [serialize_model(u, db) for u in users]

@app.post('/api/users')
def create_user(body: dict, user_id: int = Depends(get_current_user_id), db: Session = Depends(get_db)):
    check_permission('user.manage', user_id, db)
    username = body.get('username')
    password = body.get('password')
    role_name = body.get('role')
    team_name = body.get('team')
    
    if not username or not password:
        raise HTTPException(status_code=400, detail="Username and password are required")
        
    existing = db.query(User).filter_by(username=username).first()
    if existing:
        raise HTTPException(status_code=400, detail="Username taken")
        
    try:
        role_obj = db.query(Role).filter_by(name=role_name).first()
        new_user = User(
            username=username, 
            password=hash_password_bcrypt(password),
            role_id=role_obj.id if role_obj else None, 
            needs_rehash=False
        )
        db.add(new_user)
        db.commit()
        
        if team_name:
            team_obj = db.query(Team).filter_by(name=team_name).first()
            if team_obj:
                db.add(UserTeam(user_id=new_user.id, team_id=team_obj.id, is_primary=True))
                db.commit()
                
        trigger_notification(
            user_id=new_user.id,
            message=f"Welcome to BI Project Manager, {username}! Your account has been initialized.",
            related_task_id=None,
            db=db,
            category='general'
        )
        db.commit()
                
        return {"status": "ok"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))

@app.put('/api/users/{target_uid}')
def update_user(target_uid: int, body: dict, user_id: int = Depends(get_current_user_id), db: Session = Depends(get_db)):
    check_permission('user.manage', user_id, db)
    user = db.query(User).filter(User.id == target_uid).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    role_name = body.get('role')
    team_name = body.get('team')
    password = body.get('password')
    
    if role_name:
        role_obj = db.query(Role).filter_by(name=role_name).first()
        if role_obj:
            user.role_id = role_obj.id
            
    if team_name:
        team_obj = db.query(Team).filter_by(name=team_name).first()
        if team_obj:
            # Update primary team link
            pt = db.query(UserTeam).filter_by(user_id=user.id, is_primary=True).first()
            if pt:
                pt.team_id = team_obj.id
            else:
                db.add(UserTeam(user_id=user.id, team_id=team_obj.id, is_primary=True))
                
    if password:
        user.password = hash_password_bcrypt(password)
        user.needs_rehash = False
        
    db.commit()
    
    actor = db.query(User).filter(User.id == user_id).first()
    actor_username = actor.username if actor else "an administrator"
    trigger_notification(
        user_id=user.id,
        message=f"Your profile settings have been updated (Role: {role_name or 'unaltered'}, Team: {team_name or 'unaltered'}) by {actor_username}.",
        related_task_id=None,
        db=db,
        category='admin'
    )
    db.commit()
    
    return {"status": "ok"}

@app.delete('/api/users/{target_uid}')
def delete_user(target_uid: int, user_id: int = Depends(get_current_user_id), db: Session = Depends(get_db)):
    check_permission('user.manage', user_id, db)
    if target_uid == user_id:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    user = db.query(User).filter(User.id == target_uid).first()
    if user:
        user.is_active = 0
        db.commit()
    return {"status": "ok"}

# --- CONFIG MANAGEMENT ---

@app.get('/api/config/teams')
def get_config_teams(all: Optional[bool] = False, user_id: int = Depends(get_current_user_id), db: Session = Depends(get_db)):
    q = db.query(Team) if all else db.query(Team).filter_by(is_active=1)
    return [serialize_model(t, db) for t in q.all()]

@app.post('/api/config/teams')
def create_config_team(body: dict, user_id: int = Depends(get_current_user_id), db: Session = Depends(get_db)):
    check_permission('config.manage', user_id, db)
    name = body.get('name')
    if not name: raise HTTPException(status_code=400, detail="Team name is required")
    existing = db.query(Team).filter_by(name=name).first()
    if existing: raise HTTPException(status_code=400, detail="Team name already exists")
    
    db.add(Team(name=name, description=body.get('description',''), color=body.get('color', '#6366f1')))
    db.commit()
    notify_admins_and_leaders(f"A new team '{name}' has been created in the organization.", db)
    db.commit()
    return {"status": "ok"}

@app.put('/api/config/teams/{t_id}')
def update_config_team(t_id: int, body: dict, user_id: int = Depends(get_current_user_id), db: Session = Depends(get_db)):
    check_permission('config.manage', user_id, db)
    team = db.query(Team).filter(Team.id == t_id).first()
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    for k in ['name', 'description', 'color', 'is_active']:
        if k in body: setattr(team, k, body[k])
    db.commit()
    actor = db.query(User).filter(User.id == user_id).first()
    actor_name = actor.username if actor else "an administrator"
    notify_team_members(t_id, f"Team settings for '{team.name}' have been updated by {actor_name}.", db)
    db.commit()
    return {"status": "ok"}

@app.delete('/api/config/teams/{t_id}')
def delete_config_team(t_id: int, user_id: int = Depends(get_current_user_id), db: Session = Depends(get_db)):
    check_permission('config.manage', user_id, db)
    team = db.query(Team).filter(Team.id == t_id).first()
    if team:
        team.is_active = 0
        db.commit()
        actor = db.query(User).filter(User.id == user_id).first()
        actor_name = actor.username if actor else "an administrator"
        notify_team_members(t_id, f"Team '{team.name}' has been deleted by {actor_name}.", db)
        db.commit()
    return {"status": "ok"}

@app.get('/api/config/phases')
def get_config_phases(all: Optional[bool] = False, user_id: int = Depends(get_current_user_id), db: Session = Depends(get_db)):
    q = db.query(Phase) if all else db.query(Phase).filter_by(is_active=1)
    phases = q.order_by(Phase.display_order).all()
    return [serialize_model(p, db) for p in phases]

@app.post('/api/config/phases')
def create_config_phase(body: dict, user_id: int = Depends(get_current_user_id), db: Session = Depends(get_db)):
    check_permission('config.manage', user_id, db)
    db.add(Phase(
        name=body.get('name'), 
        display_order=body.get('display_order', 0),
        color_class=body.get('color_class', 'color-dep'), 
        is_terminal=body.get('is_terminal', False)
    ))
    db.commit()
    notify_admins_and_leaders(f"New Crisp-DM Phase '{body.get('name')}' has been created.", db)
    db.commit()
    return {"status": "ok"}

@app.put('/api/config/phases/{p_id}')
def update_config_phase(p_id: int, body: dict, user_id: int = Depends(get_current_user_id), db: Session = Depends(get_db)):
    check_permission('config.manage', user_id, db)
    phase = db.query(Phase).filter(Phase.id == p_id).first()
    if not phase: raise HTTPException(status_code=404, detail="Phase not found")
    for k in ['name', 'display_order', 'color_class', 'is_terminal', 'is_active']:
        if k in body: setattr(phase, k, body[k])
    db.commit()
    notify_admins_and_leaders(f"Crisp-DM Phase '{phase.name}' details have been modified.", db)
    db.commit()
    return {"status": "ok"}

@app.delete('/api/config/phases/{p_id}')
def delete_config_phase(p_id: int, hard: Optional[bool] = False, user_id: int = Depends(get_current_user_id), db: Session = Depends(get_db)):
    check_permission('config.manage', user_id, db)
    phase = db.query(Phase).filter(Phase.id == p_id).first()
    if phase:
        phase_name = phase.name
        if hard:
            db.query(TeamPhase).filter(TeamPhase.phase_id == p_id).delete(synchronize_session=False)
            db.delete(phase)
        else:
            phase.is_active = 0
        db.commit()
        notify_admins_and_leaders(f"Crisp-DM Phase '{phase_name}' has been deleted.", db)
        db.commit()
    return {"status": "ok"}

@app.get('/api/config/roles')
def get_config_roles(all: Optional[bool] = False, user_id: int = Depends(get_current_user_id), db: Session = Depends(get_db)):
    check_permission('admin.panel', user_id, db)
    q = db.query(Role) if all else db.query(Role).filter_by(is_active=1)
    return [serialize_model(r, db) for r in q.all()]

@app.post('/api/config/roles')
def create_config_role(body: dict, user_id: int = Depends(get_current_user_id), db: Session = Depends(get_db)):
    check_permission('admin.panel', user_id, db)
    name = body.get('name')
    if not name: raise HTTPException(status_code=400, detail="Role name code is required")
    existing = db.query(Role).filter_by(name=name).first()
    if existing: raise HTTPException(status_code=400, detail="Role code already exists")
    db.add(Role(name=name, label=body.get('label')))
    db.commit()
    notify_admins_and_leaders(f"New Custom Role '{body.get('label') or name}' has been added to the system.", db)
    db.commit()
    return {"status": "ok"}

@app.put('/api/config/roles/{r_id}')
def update_config_role(r_id: int, body: dict, user_id: int = Depends(get_current_user_id), db: Session = Depends(get_db)):
    check_permission('admin.panel', user_id, db)
    role = db.query(Role).filter(Role.id == r_id).first()
    if not role: raise HTTPException(status_code=404, detail="Role not found")
    
    if 'is_active' in body and not body['is_active']:
        if role.is_system or role.name == 'admin':
            raise HTTPException(status_code=400, detail="Administrative Safeguard: System roles cannot be deactivated.")
            
    for k in ['name', 'label', 'is_active']:
        if k in body: setattr(role, k, body[k])
    db.commit()
    actor = db.query(User).filter(User.id == user_id).first()
    actor_name = actor.username if actor else "an administrator"
    role_users = db.query(User).filter(User.role_id == r_id).all()
    for u in role_users:
        trigger_notification(u.id, f"The settings/permissions for your role '{role.label or role.name}' have been updated by {actor_name}.", None, db, category='admin')
    db.commit()
    return {"status": "ok"}

@app.delete('/api/config/roles/{r_id}')
def delete_config_role(r_id: int, user_id: int = Depends(get_current_user_id), db: Session = Depends(get_db)):
    check_permission('admin.panel', user_id, db)
    role = db.query(Role).filter(Role.id == r_id).first()
    if role:
        if role.is_system or role.name == 'admin':
            raise HTTPException(status_code=400, detail="Administrative Safeguard: System roles cannot be deleted.")
        role.is_active = 0
        db.commit()
    return {"status": "ok"}

@app.get('/api/config/permissions')
def get_config_permissions(user_id: int = Depends(get_current_user_id), db: Session = Depends(get_db)):
    check_permission('admin.panel', user_id, db)
    perms = db.query(Permission).order_by(Permission.grp, Permission.code).all()
    return [serialize_model(p, db) for p in perms]

@app.post('/api/config/permissions')
def create_config_permission(body: dict, user_id: int = Depends(get_current_user_id), db: Session = Depends(get_db)):
    check_permission('admin.panel', user_id, db)
    code = body.get('code')
    if not code: raise HTTPException(status_code=400, detail="Permission code is required")
    existing = db.query(Permission).filter_by(code=code).first()
    if existing: raise HTTPException(status_code=400, detail="Permission code already exists")
    db.add(Permission(code=code, label=body.get('label'), grp=body.get('grp', 'custom')))
    db.commit()
    return {"status": "ok"}

@app.get('/api/config/roles/{role_id}/permissions')
def get_role_permissions(role_id: int, user_id: int = Depends(get_current_user_id), db: Session = Depends(get_db)):
    check_permission('admin.panel', user_id, db)
    rps = db.query(RolePermission).filter_by(role_id=role_id).all()
    return [rp.permission_id for rp in rps]

@app.post('/api/config/roles/{role_id}/permissions')
def update_role_permissions(role_id: int, body: dict, user_id: int = Depends(get_current_user_id), db: Session = Depends(get_db)):
    check_permission('admin.panel', user_id, db)
    role = db.query(Role).filter(Role.id == role_id).first()
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
        
    if role.name == 'admin':
        permissions_submitted = body.get('permissions', [])
        admin_panel_perm = db.query(Permission).filter(Permission.code.in_(['admin.panel', 'menu_access:AdminPanel'])).all()
        user_manage_perm = db.query(Permission).filter(Permission.code.in_(['user.manage', 'can_manage:User'])).all()
        
        missing = []
        if admin_panel_perm:
            if not any(p.id in permissions_submitted for p in admin_panel_perm):
                missing.append("Access Admin Panel (menu_access:AdminPanel)")
        if user_manage_perm:
            if not any(p.id in permissions_submitted for p in user_manage_perm):
                missing.append("Manage Users (can_manage:User)")
                
        if missing:
            raise HTTPException(
                status_code=400,
                detail=f"Administrative Lockout Safeguard: You cannot remove critical permissions from Administrator role: {', '.join(missing)}"
            )

    db.query(RolePermission).filter_by(role_id=role_id).delete(synchronize_session=False)
    for p_id in body.get('permissions', []):
        db.add(RolePermission(role_id=role_id, permission_id=int(p_id)))
    db.commit()
    role_users = db.query(User).filter(User.role_id == role_id).all()
    for u in role_users:
        trigger_notification(u.id, f"The security permission matrix for your role '{role.label or role.name}' has been updated.", None, db, category='admin')
    db.commit()
    return {"status": "ok"}

@app.get('/api/config/teams/{team_id}/phases')
def get_team_phases(team_id: int, user_id: int = Depends(get_current_user_id), db: Session = Depends(get_db)):
    check_permission('admin.panel', user_id, db)
    tps = db.query(TeamPhase).filter_by(team_id=team_id).all()
    return [tp.phase_id for tp in tps]

@app.post('/api/config/teams/{team_id}/phases')
def update_team_phases(team_id: int, body: dict, user_id: int = Depends(get_current_user_id), db: Session = Depends(get_db)):
    check_permission('config.manage', user_id, db)
    db.query(TeamPhase).filter_by(team_id=team_id).delete(synchronize_session=False)
    for p_id in body.get('phases', []):
        db.add(TeamPhase(team_id=team_id, phase_id=int(p_id)))
    db.commit()
    team = db.query(Team).filter(Team.id == team_id).first()
    actor = db.query(User).filter(User.id == user_id).first()
    actor_name = actor.username if actor else "an administrator"
    notify_team_members(team_id, f"The Crisp-DM Phases mapping for team '{team.name}' has been modified by {actor_name}.", db)
    db.commit()
    return {"status": "ok"}

# --- PROJECTS ---

@app.get('/api/projects')
def get_projects(user_id: int = Depends(get_current_user_id), db: Session = Depends(get_db)):
    check_permission('project.read', user_id, db)
    
    active_phases = [p.name for p in db.query(Phase).filter_by(is_active=1).order_by(Phase.display_order).all()]
    projects_query = secure_query(Project, user_id, db)
        
    # 3. Eager load relationships to prevent N+1 lazy queries
    projects = projects_query.options(
        joinedload(Project.phase_rel),
        joinedload(Project.team_rel),
        joinedload(Project.assignee_rel),
        joinedload(Project.history),
        joinedload(Project.tasks).joinedload(Task.phase_rel),
        joinedload(Project.tasks).joinedload(Task.team_rel),
        joinedload(Project.streams)
    ).all()
    
    return [serialize_model(p, db, active_phases) for p in projects]

@app.post('/api/projects')
def create_project(body: dict, user_id: int = Depends(get_current_user_id), db: Session = Depends(get_db)):
    check_permission('project.create', user_id, db)
    id = body.get('id')
    if not id: raise HTTPException(status_code=400, detail="Project ID is required")
    existing = db.query(Project).filter_by(id=id).first()
    if existing: raise HTTPException(status_code=400, detail="Project ID already exists")
    
    try:
        phase = db.query(Phase).filter_by(name=body.get('phase')).first()
        team = db.query(Team).filter_by(name=body.get('team')).first()
        assignee = db.query(User).filter_by(username=body.get('assignee')).first()
        
        # Validate assignee scope against selected team and user roles
        validate_assignee_scope(assignee.id if assignee else None, team.id if team else None, user_id, db)
        
        lead_user = None
        if body.get('project_lead'):
            if has_permission('admin.panel', user_id, db):
                lead_user = db.query(User).filter_by(username=body.get('project_lead')).first()
            else:
                raise HTTPException(status_code=403, detail="Only Admins can assign a Project Lead.")
        
        new_proj = Project(
            id=id, 
            title=body.get('title'), 
            description=body.get('description'), 
            status=body.get('status', 'active'),
            phase_id=phase.id if phase else None,
            team_id=team.id if team else None,
            assignee_id=assignee.id if assignee else None,
            project_lead_id=lead_user.id if lead_user else None,
            blockers=", ".join(body.get('blockers', [])), 
            nextStep=body.get('nextStep'), 
            start_date=body.get('start_date'), 
            target_date=body.get('target_date'), 
            is_deployed=body.get('is_deployed', 0), 
            is_launched=body.get('is_launched', False),
            iteration=body.get('iteration', 1), 
            is_iterating=body.get('is_iterating', 0), 
            short_description=body.get('short_description', ''), 
            full_description=body.get('full_description', ''), 
            stakeholders=json.dumps(body.get('stakeholders', [])),
            actual_end_date=body.get('actual_end_date'),
            launch_note=body.get('launch_note')
        )
        db.add(new_proj)
        
        today = datetime.now().strftime('%Y-%m-%d')
        u = db.query(User).filter(User.id == user_id).first()
        new_hist = History(project_id=id, date=today, phase=body.get('phase'), status='completed' if body.get('is_launched') else 'active', note='Project Initialized as completed/historical.' if body.get('is_launched') else 'Project Initialized.', actor=u.username if u else 'System')
        db.add(new_hist)
        
        # Save per-phase notes as system comments if provided
        phase_notes = body.get('phase_notes', {})
        for ph_name, note_text in phase_notes.items():
            if note_text and note_text.strip():
                comment = PhaseComment(
                    project_id=id,
                    phase_name=ph_name,
                    author_id=user_id,
                    submitted_by=u.username if u else 'System',
                    content=note_text.strip()
                )
                db.add(comment)
        
        db.commit()
        
        if new_proj.assignee_id:
            trigger_notification(
                user_id=new_proj.assignee_id,
                message=f"You have been assigned as primary assignee for project: {new_proj.title}.",
                related_task_id=None,
                db=db,
                category='project'
            )
            db.commit()
        
        broadcast_event("PROJECT_CREATED", {"id": new_proj.id, "title": new_proj.title})
        return {"status": "ok"}
    except HTTPException as he:
        db.rollback()
        raise he
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))

@app.put('/api/projects')
def update_project(body: dict, user_id: int = Depends(get_current_user_id), db: Session = Depends(get_db)):
    project_id = body.get('id')
    proj = db.query(Project).filter(Project.id == project_id).first()
    if not proj: raise HTTPException(status_code=404, detail="Project not found")
    
    # Bypass permission if user is project lead of this project
    if proj.project_lead_id == user_id:
        pass
    else:
        check_permission('project.update', user_id, db)
    
    # RLS Scope Enforcement for projects
    if not has_permission('analytics.read_all', user_id, db):
        if has_permission('analytics.read_team', user_id, db):
            verify_scope_boundary(user_id, proj.team_id, proj.assignee_id, db, bypass_permission="analytics.read_all")
        elif has_permission('analytics.read_own', user_id, db):
            if proj.assignee_id != user_id:
                raise HTTPException(status_code=403, detail="Resource out of personal scope boundaries")
        else:
            raise HTTPException(status_code=403, detail="Access denied")
            
    try:
        orig_assignee_id = proj.assignee_id
        orig_phase_id = proj.phase_id
        orig_blockers = proj.blockers or ""
        
        for k, v in body.items():
            if hasattr(proj, k) and k not in ['id', 'history', 'blockers', 'stakeholders', 'phase', 'team', 'assignee', 'project_lead', 'members', 'shortcuts']:
                setattr(proj, k, v)
        
        if 'project_lead' in body:
            is_admin = has_permission('admin.panel', user_id, db)
            is_current_lead = (proj.project_lead_id == user_id)
            if not is_admin and not is_current_lead:
                raise HTTPException(status_code=403, detail="Only Admins or the current Project Lead can assign or change the Project Lead.")
            lead_val = body.get('project_lead')
            if not lead_val:
                proj.project_lead_id = None
            else:
                lead_user = db.query(User).filter_by(username=lead_val).first()
                if lead_user:
                    proj.project_lead_id = lead_user.id
                else:
                    proj.project_lead_id = None

        if 'phase' in body:
            phase = db.query(Phase).filter_by(name=body.get('phase')).first()
            if phase: proj.phase_id = phase.id
        if 'team' in body:
            team = db.query(Team).filter_by(name=body.get('team')).first()
            if team: proj.team_id = team.id
        if 'assignee' in body:
            assignee_val = body.get('assignee')
            if not assignee_val:
                proj.assignee_id = None
            else:
                assignee = db.query(User).filter_by(username=assignee_val).first()
                if assignee: proj.assignee_id = assignee.id
                else: proj.assignee_id = None
                
        # Validate assignee scope on updated project
        validate_assignee_scope(proj.assignee_id, proj.team_id, user_id, db)
            
        proj.blockers = ", ".join(body.get('blockers', []))
        proj.stakeholders = json.dumps(body.get('stakeholders', []))
        proj.shortcuts = json.dumps(body.get('shortcuts', []))
        
        history_payload = body.get('history', [])
        existing_hist = db.query(History).filter(History.project_id == project_id).all()
        existing_dates = {h.date for h in existing_hist}
        
        u = db.query(User).filter(User.id == user_id).first()
        for h in history_payload:
            if h.get('date') not in existing_dates:
                db.add(History(
                    project_id=project_id, 
                    date=h.get('date'), 
                    phase=h.get('phase'),
                    status=h.get('status'), 
                    note=h.get('note'), 
                    actor=u.username
                ))
        
        # Project-to-Task Status Cascading
        if proj.status in ['archived', 'cancelled', 'completed']:
            target_status = 'done' if proj.status == 'completed' else proj.status
            db.query(Task).filter(
                Task.project_id == proj.id, 
                Task.status.in_(['todo', 'in_progress', 'review'])
            ).update({Task.status: target_status}, synchronize_session=False)
            
        db.commit()
        
        # Hooks for project triggers
        actor_username = u.username if u else "an administrator"
        if proj.assignee_id and proj.assignee_id != orig_assignee_id:
            trigger_notification(
                user_id=proj.assignee_id,
                message=f"You have been assigned as primary assignee for project: {proj.title} by {actor_username}.",
                related_task_id=None,
                db=db,
                category='project'
            )
            
        if proj.phase_id and proj.phase_id != orig_phase_id:
            new_phase_obj = db.query(Phase).filter(Phase.id == proj.phase_id).first()
            new_phase_name = new_phase_obj.name if new_phase_obj else "unknown"
            msg = f"Project '{proj.title}' has advanced to phase: {new_phase_name} by {actor_username}."
            recipients = set()
            if proj.assignee_id:
                recipients.add(proj.assignee_id)
            if proj.team_id:
                team_users = db.query(User).join(UserTeam).filter(UserTeam.team_id == proj.team_id).all()
                for tu in team_users:
                    recipients.add(tu.id)
            for r_id in recipients:
                trigger_notification(r_id, msg, None, db, category='project')
                
        if proj.blockers and proj.blockers != orig_blockers:
            if proj.assignee_id:
                trigger_notification(
                    user_id=proj.assignee_id,
                    message=f"A new blocker has been flagged on your project '{proj.title}': {proj.blockers}.",
                    related_task_id=None,
                    db=db,
                    category='project'
                )
        db.commit()
        
        broadcast_event("PROJECT_UPDATED", {"id": proj.id, "title": proj.title, "phase": proj.phase_rel.name if proj.phase_rel else None})
        return {"status": "ok"}
    except HTTPException as he:
        db.rollback()
        raise he
    except Exception as e:
        db.rollback()
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=400, detail=str(e))

@app.delete('/api/projects/{p_id}')
def delete_project(p_id: str, user_id: int = Depends(get_current_user_id), db: Session = Depends(get_db)):
    check_permission('project.delete', user_id, db)
    proj = db.query(Project).filter(Project.id == p_id).first()
    if not proj: raise HTTPException(status_code=404, detail="Project not found")
    
    # RLS Scope Enforcement for project deletion
    if not has_permission('analytics.read_all', user_id, db):
        if has_permission('analytics.read_team', user_id, db):
            verify_scope_boundary(user_id, proj.team_id, proj.assignee_id, db, bypass_permission="analytics.read_all")
        elif has_permission('analytics.read_own', user_id, db):
            if proj.assignee_id != user_id:
                raise HTTPException(status_code=403, detail="Resource out of personal scope boundaries")
        else:
            raise HTTPException(status_code=403, detail="Access denied")
            
    actor = db.query(User).filter(User.id == user_id).first()
    actor_username = actor.username if actor else "an administrator"
    if proj.assignee_id:
        trigger_notification(
            user_id=proj.assignee_id,
            message=f"Project '{proj.title}' has been deleted by {actor_username}.",
            related_task_id=None,
            db=db,
            category='project'
        )
        db.commit()
    db.delete(proj)
    db.commit()
    broadcast_event("PROJECT_DELETED", {"id": p_id})
    return {"status": "ok"}

# --- PHASE COMMENTS ---

@app.get('/api/projects/{project_id}/phase-comments')
def get_phase_comments(project_id: str, phase: Optional[str] = None,
                       user_id: int = Depends(get_current_user_id), db: Session = Depends(get_db)):
    check_permission('project.read', user_id, db)
    q = db.query(PhaseComment).filter_by(project_id=project_id)
    if phase:
        q = q.filter_by(phase_name=phase)
    return [serialize_model(c, db) for c in q.order_by(PhaseComment.created_at.asc()).all()]

@app.post('/api/projects/{project_id}/phase-comments')
def post_phase_comment(project_id: str, body: dict,
                       user_id: int = Depends(get_current_user_id), db: Session = Depends(get_db)):
    u = db.query(User).filter_by(id=user_id).first()
    project = db.query(Project).filter_by(id=project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
        
    is_lead = project.project_lead_id == user_id
    is_admin = has_permission('admin.panel', user_id, db)
    is_leader = has_permission('task.approve', user_id, db)
    
    if not (is_admin or is_lead or is_leader):
        raise HTTPException(status_code=403, detail="Only Project Lead, Admin, or Team Leaders can post phase comments")
    
    content = body.get('content', '').strip()
    if not content:
        raise HTTPException(status_code=400, detail="Comment content cannot be empty")
        
    comment = PhaseComment(
        project_id=project_id,
        phase_name=body.get('phase_name'),
        author_id=user_id,
        submitted_by=u.username if u else 'Unknown',
        content=content
    )
    db.add(comment)
    db.commit()
    broadcast_event("PHASE_COMMENT_ADDED", {"project_id": project_id})
    return serialize_model(comment, db)


# --- PROJECT DOCUMENT & LEDGER ENDPOINTS ---

@app.get('/api/projects/{p_id}/document')
def get_project_document(p_id: str, user_id: int = Depends(get_current_user_id), db: Session = Depends(get_db)):
    check_permission('project.read', user_id, db)
    proj = db.query(Project).filter(Project.id == p_id).first()
    if not proj: raise HTTPException(status_code=404, detail="Project not found")
    
    # RLS Scope Enforcement
    if not has_permission('analytics.read_all', user_id, db):
        if has_permission('analytics.read_team', user_id, db):
            verify_scope_boundary(user_id, proj.team_id, proj.assignee_id, db, bypass_permission="analytics.read_all")
        elif has_permission('analytics.read_own', user_id, db):
            if proj.assignee_id != user_id:
                raise HTTPException(status_code=403, detail="Resource out of personal scope boundaries")
        else:
            raise HTTPException(status_code=403, detail="Access denied")

    active_phases = [p.name for p in db.query(Phase).filter_by(is_active=1).order_by(Phase.display_order).all()]
    
    proj_data = serialize_model(proj, db, active_phases)
    
    snaps = db.query(ProjectSnapshot).filter_by(project_id=p_id).all()
    serialized_snaps = {s.phase_name: {
        "id": s.id,
        "summary": s.summary,
        "deliverables": s.deliverables,
        "completed_at": s.completed_at,
        "completed_by": s.completed_by
    } for s in snaps}
    
    streams = db.query(ProjectStream).filter_by(project_id=p_id).all()
    serialized_streams = [serialize_model(s, db) for s in streams]
    
    tasks = db.query(Task).filter_by(project_id=p_id).all()
    serialized_tasks = [serialize_model(t, db) for t in tasks]
    
    comments = db.query(PhaseComment).filter_by(project_id=p_id).all()
    serialized_comments = [serialize_model(c, db) for c in comments]
    
    return {
        "project": proj_data,
        "snapshots": serialized_snaps,
        "streams": serialized_streams,
        "tasks": serialized_tasks,
        "comments": serialized_comments,
        "history": proj_data.get("history", [])
    }

@app.post('/api/projects/{p_id}/record-launch')
def record_project_launch(p_id: str, body: dict, user_id: int = Depends(get_current_user_id), db: Session = Depends(get_db)):
    proj = db.query(Project).filter(Project.id == p_id).first()
    if not proj: raise HTTPException(status_code=404, detail="Project not found")
    
    is_lead = proj.project_lead_id == user_id
    is_admin = has_permission('admin.panel', user_id, db)
    if not (is_admin or is_lead):
        raise HTTPException(status_code=403, detail="Only Project Lead or Admin can record project launch")
        
    actual_end_date = body.get('actual_end_date')
    launch_note = body.get('launch_note', '').strip()
    if not actual_end_date:
        raise HTTPException(status_code=400, detail="Actual end date is required")
        
    proj.is_launched = True
    proj.actual_end_date = actual_end_date
    proj.launch_note = launch_note
    proj.status = 'completed'
    
    u = db.query(User).filter(User.id == user_id).first()
    today = datetime.now().strftime('%Y-%m-%d')
    new_hist = History(
        project_id=p_id,
        date=today,
        phase=proj.phase_rel.name if proj.phase_rel else 'None',
        status='launched',
        note=f"Project officially launched. Note: {launch_note}" if launch_note else "Project officially launched.",
        actor=u.username if u else 'System'
    )
    db.add(new_hist)
    db.commit()
    
    broadcast_event("PROJECT_UPDATED", {"id": p_id})
    return {"status": "ok"}

@app.get('/api/projects/{p_id}/snapshots')
def get_project_snapshots(p_id: str, user_id: int = Depends(get_current_user_id), db: Session = Depends(get_db)):
    check_permission('project.read', user_id, db)
    proj = db.query(Project).filter(Project.id == p_id).first()
    if not proj: raise HTTPException(status_code=404, detail="Project not found")
    
    # RLS Scope Enforcement
    if not has_permission('analytics.read_all', user_id, db):
        if has_permission('analytics.read_team', user_id, db):
            verify_scope_boundary(user_id, proj.team_id, proj.assignee_id, db, bypass_permission="analytics.read_all")
        elif has_permission('analytics.read_own', user_id, db):
            if proj.assignee_id != user_id:
                raise HTTPException(status_code=403, detail="Resource out of personal scope boundaries")
        else:
            raise HTTPException(status_code=403, detail="Access denied")
            
    snaps = db.query(ProjectSnapshot).filter_by(project_id=p_id).all()
    return [serialize_model(s, db) for s in snaps]

@app.post('/api/projects/{p_id}/snapshots')
def create_project_snapshot(p_id: str, body: dict, user_id: int = Depends(get_current_user_id), db: Session = Depends(get_db)):
    proj = db.query(Project).filter(Project.id == p_id).first()
    if not proj: raise HTTPException(status_code=404, detail="Project not found")
    
    phase_name = body.get('phase_name')
    if not phase_name:
        raise HTTPException(status_code=400, detail="Phase name is required")
        
    is_lead = proj.project_lead_id == user_id
    is_admin = has_permission('admin.panel', user_id, db)
    
    is_allowed = is_admin or is_lead
    if not is_allowed:
        is_leader = has_permission('task.approve', user_id, db)
        if is_leader:
            user_team_ids = get_user_team_ids(db, user_id)
            user_teams = db.query(Team.name).filter(Team.id.in_(user_team_ids)).all()
            user_team_names = [t[0] for t in user_teams]
            stream_exists = db.query(ProjectStream).filter(
                ProjectStream.project_id == p_id,
                ProjectStream.phase_name == phase_name,
                ProjectStream.team_name.in_(user_team_names)
            ).first()
            if stream_exists:
                is_allowed = True
                
    if not is_allowed:
        raise HTTPException(status_code=403, detail="You do not have permission to edit this phase snapshot")
        
    existing = db.query(ProjectSnapshot).filter_by(project_id=p_id, phase_name=phase_name).first()
    u = db.query(User).filter(User.id == user_id).first()
    username = u.username if u else "Unknown"
    
    if existing:
        existing.summary = body.get('summary')
        existing.deliverables = body.get('deliverables')
        existing.completed_at = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        existing.completed_by = username
        db.commit()
        broadcast_event("PROJECT_UPDATED", {"id": p_id})
        return serialize_model(existing, db)
    else:
        snap = ProjectSnapshot(
            project_id=p_id,
            phase_name=phase_name,
            summary=body.get('summary'),
            deliverables=body.get('deliverables'),
            completed_at=datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
            completed_by=username
        )
        db.add(snap)
        db.commit()
        broadcast_event("PROJECT_UPDATED", {"id": p_id})
        return serialize_model(snap, db)

@app.put('/api/projects/{p_id}/snapshots/{sid}')
def update_project_snapshot(p_id: str, sid: int, body: dict, user_id: int = Depends(get_current_user_id), db: Session = Depends(get_db)):
    proj = db.query(Project).filter(Project.id == p_id).first()
    if not proj: raise HTTPException(status_code=404, detail="Project not found")
    
    snap = db.query(ProjectSnapshot).filter_by(id=sid, project_id=p_id).first()
    if not snap: raise HTTPException(status_code=404, detail="Snapshot not found")
    
    is_lead = proj.project_lead_id == user_id
    is_admin = has_permission('admin.panel', user_id, db)
    
    is_allowed = is_admin or is_lead
    if not is_allowed:
        is_leader = has_permission('task.approve', user_id, db)
        if is_leader:
            user_team_ids = get_user_team_ids(db, user_id)
            user_teams = db.query(Team.name).filter(Team.id.in_(user_team_ids)).all()
            user_team_names = [t[0] for t in user_teams]
            stream_exists = db.query(ProjectStream).filter(
                ProjectStream.project_id == p_id,
                ProjectStream.phase_name == snap.phase_name,
                ProjectStream.team_name.in_(user_team_names)
            ).first()
            if stream_exists:
                is_allowed = True
                
    if not is_allowed:
        raise HTTPException(status_code=403, detail="You do not have permission to edit this phase snapshot")
        
    snap.summary = body.get('summary')
    snap.deliverables = body.get('deliverables')
    snap.completed_at = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    u = db.query(User).filter(User.id == user_id).first()
    snap.completed_by = u.username if u else "Unknown"
    
    db.commit()
    broadcast_event("PROJECT_UPDATED", {"id": p_id})
    return serialize_model(snap, db)

@app.get('/api/projects/{p_id}/export-pdf')
def export_project_pdf(p_id: str, user_id: int = Depends(get_current_user_id), db: Session = Depends(get_db)):
    check_permission('project.read', user_id, db)
    proj = db.query(Project).filter(Project.id == p_id).first()
    if not proj: raise HTTPException(status_code=404, detail="Project not found")
    
    # RLS Scope Enforcement
    if not has_permission('analytics.read_all', user_id, db):
        if has_permission('analytics.read_team', user_id, db):
            verify_scope_boundary(user_id, proj.team_id, proj.assignee_id, db, bypass_permission="analytics.read_all")
        elif has_permission('analytics.read_own', user_id, db):
            if proj.assignee_id != user_id:
                raise HTTPException(status_code=403, detail="Resource out of personal scope boundaries")
        else:
            raise HTTPException(status_code=403, detail="Access denied")

    active_phases = [p.name for p in db.query(Phase).filter_by(is_active=1).order_by(Phase.display_order).all()]
    computed_progress = _compute_project_progress(proj, proj.tasks, db, active_phases)
    
    snaps = db.query(ProjectSnapshot).filter_by(project_id=p_id).all()
    snaps_map = {s.phase_name: s for s in snaps}
    
    tasks = db.query(Task).filter_by(project_id=p_id).all()
    comments = db.query(PhaseComment).filter_by(project_id=p_id).order_by(PhaseComment.created_at.asc()).all()
    history = db.query(History).filter_by(project_id=p_id).order_by(History.date.desc()).all()
    streams = db.query(ProjectStream).filter_by(project_id=p_id).all()
    
    import io
    from fastapi.responses import StreamingResponse
    from reportlab.lib.pagesizes import letter
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, KeepTogether
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib import colors
    
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        rightMargin=40, leftMargin=40, topMargin=40, bottomMargin=40
    )
    
    styles = getSampleStyleSheet()
    
    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Heading1'],
        fontName='Helvetica-Bold',
        fontSize=24,
        leading=28,
        textColor=colors.HexColor('#1e1b4b'),
        spaceAfter=15
    )
    
    h2_style = ParagraphStyle(
        'DocH2',
        parent=styles['Heading2'],
        fontName='Helvetica-Bold',
        fontSize=16,
        leading=20,
        textColor=colors.HexColor('#312e81'),
        spaceBefore=15,
        spaceAfter=10,
        keepWithNext=True
    )
    
    body_style = ParagraphStyle(
        'DocBody',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=10,
        leading=14,
        textColor=colors.HexColor('#374151'),
        spaceAfter=8
    )

    bold_body_style = ParagraphStyle(
        'DocBoldBody',
        parent=body_style,
        fontName='Helvetica-Bold'
    )
    
    phase_header_style = ParagraphStyle(
        'PhaseHeader',
        parent=styles['Heading3'],
        fontName='Helvetica-Bold',
        fontSize=12,
        leading=16,
        textColor=colors.HexColor('#1e3a8a'),
        spaceBefore=10,
        spaceAfter=5,
        keepWithNext=True
    )
    
    meta_style = ParagraphStyle(
        'DocMeta',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9,
        leading=12,
        textColor=colors.HexColor('#4b5563')
    )
    
    story = []
    
    story.append(Paragraph(f"Project Document: {proj.title}", title_style))
    story.append(Spacer(1, 10))
    
    meta_data = [
        [
            Paragraph("<b>Project ID:</b>", meta_style), Paragraph(proj.id, meta_style),
            Paragraph("<b>Status:</b>", meta_style), Paragraph(proj.status.upper(), meta_style)
        ],
        [
            Paragraph("<b>Project Lead:</b>", meta_style), Paragraph(proj.lead_rel.username if proj.lead_rel else "N/A", meta_style),
            Paragraph("<b>Assignee:</b>", meta_style), Paragraph(proj.assignee_rel.username if proj.assignee_rel else "N/A", meta_style)
        ],
        [
            Paragraph("<b>Start Date:</b>", meta_style), Paragraph(proj.start_date or "N/A", meta_style),
            Paragraph("<b>Target Date:</b>", meta_style), Paragraph(proj.target_date or "N/A", meta_style)
        ],
        [
            Paragraph("<b>Progress:</b>", meta_style), Paragraph(f"{computed_progress}%", meta_style),
            Paragraph("<b>Is Launched:</b>", meta_style), Paragraph("YES" if proj.is_launched else "NO", meta_style)
        ]
    ]
    
    if proj.is_launched:
        meta_data.append([
            Paragraph("<b>Actual End Date:</b>", meta_style), Paragraph(proj.actual_end_date or "N/A", meta_style),
            Paragraph("<b>Launch Note:</b>", meta_style), Paragraph(proj.launch_note or "N/A", meta_style)
        ])
        
    t = Table(meta_data, colWidths=[110, 150, 110, 150])
    t.setStyle(TableStyle([
        ('ALIGN', (0,0), (-1,-1), 'LEFT'),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#f3f4f6')),
        ('TOPPADDING', (0,0), (-1,-1), 6),
        ('BOTTOMPADDING', (0,0), (-1,-1), 6),
        ('LEFTPADDING', (0,0), (-1,-1), 8),
        ('RIGHTPADDING', (0,0), (-1,-1), 8),
        ('BOX', (0,0), (-1,-1), 0.5, colors.HexColor('#e5e7eb')),
        ('INNERGRID', (0,0), (-1,-1), 0.25, colors.HexColor('#e5e7eb')),
    ]))
    story.append(t)
    story.append(Spacer(1, 15))
    
    story.append(Paragraph("Executive Summary", h2_style))
    story.append(Paragraph(proj.description or "No description provided.", body_style))
    story.append(Spacer(1, 10))
    
    story.append(Paragraph("Phase-by-Phase Progress & Deliverables", h2_style))
    
    for phase in active_phases:
        phase_streams = [s for s in streams if s.phase_name == phase]
        phase_tasks = [t for t in tasks if t.phase_rel and t.phase_rel.name == phase]
        phase_comments = [c for c in comments if c.phase_name == phase]
        snap = snaps_map.get(phase)
        
        p_status = "NOT STARTED"
        p_progress = 0
        if phase_streams:
            if all(s.status == 'complete' for s in phase_streams):
                p_status = "COMPLETED"
                p_progress = 100
            elif any(s.status == 'active' for s in phase_streams):
                p_status = "IN PROGRESS"
                p_progress = max(s.progress or 0 for s in phase_streams)
        
        phase_elements = []
        phase_elements.append(Paragraph(f"Phase: {phase} — {p_status} ({p_progress}%)", phase_header_style))
        
        summary_text = snap.summary if snap else "No summary provided for this phase."
        deliv_text = snap.deliverables if snap else "No deliverables recorded."
        
        phase_elements.append(Paragraph(f"<b>Summary:</b> {summary_text}", body_style))
        phase_elements.append(Paragraph(f"<b>Deliverables:</b> {deliv_text}", body_style))
        
        if phase_tasks:
            t_header = [Paragraph("<b>Task Title</b>", meta_style), Paragraph("<b>Assignee</b>", meta_style), Paragraph("<b>Status</b>", meta_style)]
            t_rows = [t_header]
            for pt in phase_tasks:
                t_rows.append([
                    Paragraph(f"{pt.title}{' (Post-Prod)' if getattr(pt, 'post_production', False) else ''}", meta_style),
                    Paragraph(pt.assignee_rel.username if pt.assignee_rel else "Unassigned", meta_style),
                    Paragraph(pt.status.upper(), meta_style)
                ])
            task_table = Table(t_rows, colWidths=[280, 120, 120])
            task_table.setStyle(TableStyle([
                ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#e5e7eb')),
                ('BOX', (0,0), (-1,-1), 0.5, colors.HexColor('#e5e7eb')),
                ('INNERGRID', (0,0), (-1,-1), 0.25, colors.HexColor('#e5e7eb')),
                ('TOPPADDING', (0,0), (-1,-1), 4),
                ('BOTTOMPADDING', (0,0), (-1,-1), 4),
            ]))
            phase_elements.append(Spacer(1, 5))
            phase_elements.append(Paragraph("<b>Phase Tasks:</b>", bold_body_style))
            phase_elements.append(task_table)
            
        if phase_comments:
            phase_elements.append(Spacer(1, 5))
            phase_elements.append(Paragraph("<b>Phase Comments:</b>", bold_body_style))
            for pc in phase_comments:
                phase_elements.append(Paragraph(f"• <i>{pc.submitted_by} ({pc.created_at}):</i> {pc.content}", meta_style))
                
        phase_elements.append(Spacer(1, 10))
        story.append(KeepTogether(phase_elements))
        
    if history:
        hist_elements = [Paragraph("Activity History Timeline", h2_style)]
        h_header = [Paragraph("<b>Date</b>", meta_style), Paragraph("<b>Phase</b>", meta_style), Paragraph("<b>Event / Note</b>", meta_style), Paragraph("<b>Actor</b>", meta_style)]
        h_rows = [h_header]
        for he in history[:15]:
            h_rows.append([
                Paragraph(he.date or "", meta_style),
                Paragraph(he.phase or "", meta_style),
                Paragraph(he.note or "", meta_style),
                Paragraph(he.actor or "", meta_style)
            ])
        hist_table = Table(h_rows, colWidths=[80, 100, 240, 100])
        hist_table.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#e5e7eb')),
            ('BOX', (0,0), (-1,-1), 0.5, colors.HexColor('#e5e7eb')),
            ('INNERGRID', (0,0), (-1,-1), 0.25, colors.HexColor('#e5e7eb')),
            ('TOPPADDING', (0,0), (-1,-1), 4),
            ('BOTTOMPADDING', (0,0), (-1,-1), 4),
        ]))
        hist_elements.append(hist_table)
        story.append(KeepTogether(hist_elements))
        
    doc.build(story)
    buffer.seek(0)
    
    return StreamingResponse(
        buffer,
        media_type='application/pdf',
        headers={"Content-Disposition": f"attachment; filename=project_{p_id}_document.pdf"}
    )


# --- STREAMS ---

@app.get('/api/projects/{project_id}/streams')
def get_project_streams(project_id: str, user_id: int = Depends(get_current_user_id), db: Session = Depends(get_db)):
    check_permission('project.read', user_id, db)
    streams = db.query(ProjectStream).filter_by(project_id=project_id).all()
    tasks = secure_query(Task, user_id, db).filter_by(project_id=project_id).all()
    
    res = []
    for s in streams:
        d = serialize_model(s, db)
        if s.status == 'complete':
            d['computed_progress'] = 100
        else:
            stream_tasks = [t for t in tasks if t.phase_rel and t.phase_rel.name == s.phase_name and t.team_rel and t.team_rel.name == s.team_name]
            if stream_tasks:
                d['computed_progress'] = _compute_task_progress(stream_tasks)
            else:
                d['computed_progress'] = s.progress or 0
        res.append(d)
    return res

@app.post('/api/projects/{project_id}/streams')
def create_project_stream(project_id: str, body: dict, user_id: int = Depends(get_current_user_id), db: Session = Depends(get_db)):
    check_permission('project.manage', user_id, db)
    new_stream = ProjectStream(
        project_id=project_id,
        phase_name=body.get('phase_name'),
        team_name=body.get('team_name'),
        status='active',
        started_at=datetime.now().strftime('%Y-%m-%d')
    )
    db.add(new_stream)
    db.commit()
    
    proj = db.query(Project).filter(Project.id == project_id).first()
    proj_title = proj.title if proj else "Unknown"
    msg = f"New project stream '{new_stream.phase_name} - {new_stream.team_name}' created under project '{proj_title}'."
    
    recipients = set()
    if proj and proj.assignee_id:
        recipients.add(proj.assignee_id)
    stream_team = db.query(Team).filter(Team.name == new_stream.team_name).first()
    if stream_team:
        team_users = db.query(User).join(UserTeam).filter(UserTeam.team_id == stream_team.id).all()
        for tu in team_users:
            recipients.add(tu.id)
            
    for r_id in recipients:
        trigger_notification(r_id, msg, None, db)
    db.commit()
    
    return serialize_model(new_stream, db)

@app.put('/api/projects/{project_id}/streams/{stream_id}')
def update_project_stream(project_id: str, stream_id: int, body: dict, user_id: int = Depends(get_current_user_id), db: Session = Depends(get_db)):
    check_permission('project.update', user_id, db)
    stream = db.query(ProjectStream).filter_by(id=stream_id, project_id=project_id).first()
    if not stream: raise HTTPException(status_code=404, detail="Stream not found")
    
    orig_progress = stream.progress
    orig_status = stream.status
    
    for k, v in body.items():
        if hasattr(stream, k) and k != 'id': setattr(stream, k, v)
        
    if body.get('status') == 'complete' and not stream.completed_at:
        stream.completed_at = datetime.now().strftime('%Y-%m-%d')
        u = db.query(User).filter_by(id=user_id).first()
        stream.completed_by = u.username if u else "Unknown"
        
    db.commit()
    
    if stream.progress != orig_progress or stream.status != orig_status:
        u = db.query(User).filter_by(id=user_id).first()
        actor_username = u.username if u else "an administrator"
        proj = db.query(Project).filter(Project.id == project_id).first()
        msg = f"Project stream '{stream.phase_name} - {stream.team_name}' progress updated to {stream.progress}% ({stream.status}) by {actor_username}."
        
        recipients = set()
        if proj and proj.assignee_id:
            recipients.add(proj.assignee_id)
        stream_team = db.query(Team).filter(Team.name == stream.team_name).first()
        if stream_team:
            team_users = db.query(User).join(UserTeam).filter(UserTeam.team_id == stream_team.id).all()
            for tu in team_users:
                recipients.add(tu.id)
                
        for r_id in recipients:
            trigger_notification(r_id, msg, None, db)
        db.commit()
    return serialize_model(stream, db)


# --- PROJECT MEMBERS ---

@app.get('/api/projects/{project_id}/members')
def get_project_members(project_id: str, user_id: int = Depends(get_current_user_id), db: Session = Depends(get_db)):
    check_permission('project.read', user_id, db)
    p_members = db.query(ProjectMember).filter_by(project_id=project_id).all()
    res = []
    for pm in p_members:
        res.append({
            "user_id": pm.user_id,
            "username": pm.user.username if pm.user else "Unknown",
            "assigned_phases": [p.strip() for p in (pm.assigned_phases or "").split(",") if p.strip()]
        })
    return res

@app.post('/api/projects/{project_id}/members')
def set_project_members(project_id: str, body: dict, user_id: int = Depends(get_current_user_id), db: Session = Depends(get_db)):
    proj = db.query(Project).filter(Project.id == project_id).first()
    if not proj:
        raise HTTPException(status_code=404, detail="Project not found")
    
    is_lead_or_admin = (user_id == proj.project_lead_id) or has_permission('admin.panel', user_id, db)
    if not is_lead_or_admin:
        raise HTTPException(status_code=403, detail="Only the Project Lead or Admin can manage project members.")
    
    if 'user_id' in body:
        # Single member add
        target_user_id = int(body['user_id'])
        existing = db.query(ProjectMember).filter_by(project_id=project_id, user_id=target_user_id).first()
        if not existing:
            phases_str = ",".join(body.get('assigned_phases', []))
            pm = ProjectMember(
                project_id=project_id,
                user_id=target_user_id,
                assigned_phases=phases_str if phases_str else None
            )
            db.add(pm)
            db.commit()
        return {"status": "ok"}
    else:
        # Bulk set
        db.query(ProjectMember).filter_by(project_id=project_id).delete()
        for m in body.get('members', []):
            phases_str = ",".join(m.get('assigned_phases', []))
            pm = ProjectMember(
                project_id=project_id,
                user_id=int(m['user_id']),
                assigned_phases=phases_str if phases_str else None
            )
            db.add(pm)
        db.commit()
        return {"status": "ok"}

@app.delete('/api/projects/{project_id}/members/{member_user_id}')
def remove_project_member(project_id: str, member_user_id: int, user_id: int = Depends(get_current_user_id), db: Session = Depends(get_db)):
    proj = db.query(Project).filter(Project.id == project_id).first()
    if not proj:
        raise HTTPException(status_code=404, detail="Project not found")
    
    is_lead_or_admin = (user_id == proj.project_lead_id) or has_permission('admin.panel', user_id, db)
    if not is_lead_or_admin:
        raise HTTPException(status_code=403, detail="Only the Project Lead or Admin can manage project members.")
        
    db.query(ProjectMember).filter_by(project_id=project_id, user_id=member_user_id).delete()
    db.commit()
    return {"status": "ok"}

@app.put('/api/projects/{project_id}/members/{member_user_id}')
def update_project_member_phases(project_id: str, member_user_id: int, body: dict, user_id: int = Depends(get_current_user_id), db: Session = Depends(get_db)):
    proj = db.query(Project).filter(Project.id == project_id).first()
    if not proj:
        raise HTTPException(status_code=404, detail="Project not found")
    
    is_lead_or_admin = (user_id == proj.project_lead_id) or has_permission('admin.panel', user_id, db)
    if not is_lead_or_admin:
        raise HTTPException(status_code=403, detail="Only the Project Lead or Admin can manage project members.")
        
    pm = db.query(ProjectMember).filter_by(project_id=project_id, user_id=member_user_id).first()
    if not pm:
        raise HTTPException(status_code=404, detail="Member not found in project")
        
    phases_str = ",".join(body.get('assigned_phases', []))
    pm.assigned_phases = phases_str if phases_str else None
    db.commit()
    return {"status": "ok"}


# --- TASKS ---

@app.get('/api/tasks')
def get_tasks(project_id: Optional[str] = None, team: Optional[str] = None, user_id: int = Depends(get_current_user_id), db: Session = Depends(get_db)):
    check_permission('task.read', user_id, db)
    query = secure_query(Task, user_id, db)
    
    if team:
        target_team = db.query(Team).filter_by(name=team).first()
        if target_team:
            query = query.filter(Task.team_id == target_team.id)
            
    if project_id:
        query = query.filter(Task.project_id == project_id)
        
    tasks = query.options(
        joinedload(Task.phase_rel),
        joinedload(Task.team_rel),
        joinedload(Task.assignee_rel),
        joinedload(Task.created_by_rel),
        joinedload(Task.completed_by_rel)
    ).order_by(Task.id.desc()).all()
    
    return [serialize_model(t, db) for t in tasks]

@app.post('/api/tasks')
def create_task(body: dict, user_id: int = Depends(get_current_user_id), db: Session = Depends(get_db)):
    project_id = body.get('project_id')
    project = db.query(Project).filter_by(id=project_id).first() if project_id else None
    
    # Bypass permission check if user is the project lead of THIS project
    if project and project.project_lead_id == user_id:
        pass
    else:
        check_permission('task.create', user_id, db)
        
    u = db.query(User).filter(User.id == user_id).first()
    role = db.query(Role).filter(Role.id == u.role_id).first() if u else None
    
    project_lead_id = project.project_lead_id if project else None
    pending_notif_lead_id = None
    pending_notif_team_leads = False
    if project_lead_id:
        is_lead_or_admin = (user_id == project_lead_id) or has_permission('admin.panel', user_id, db)
        is_team_leader = has_permission('task.approve', user_id, db)
        is_member = (role and role.name == 'member')
        
        if not is_lead_or_admin and not is_team_leader and not is_member:
            raise HTTPException(status_code=403, detail="Only the Project Lead, a Lead, or an Admin can assign tasks on this project.")
    
    phase_id = body.get('phase_id')
    if not phase_id and body.get('crisp_dm_phase'):
        phase = db.query(Phase).filter(Phase.name == body.get('crisp_dm_phase')).first()
        if phase: phase_id = phase.id
    if not phase_id:
        first_phase = db.query(Phase).filter_by(is_active=1).order_by(Phase.display_order).first()
        if first_phase: phase_id = first_phase.id
        
    team_id = body.get('team_id')
    if not team_id and body.get('team'):
        team = db.query(Team).filter(Team.name == body.get('team')).first()
        if team: team_id = team.id
        
    assignee_id = body.get('assignee_id')
    if not assignee_id and body.get('assignee'):
        assignee = db.query(User).filter(User.username == body.get('assignee')).first()
        if assignee: assignee_id = assignee.id
        
    # Validate assignee scope against selected team and user roles
    validate_assignee_scope(assignee_id, team_id, user_id, db)
    
    # Ensure task creator belongs to the selected team (unless they have global bypass)
    if team_id is not None:
        verify_scope_boundary(user_id, team_id, None, db, bypass_permission="analytics.read_all")
        
    if project_id and not project:
        raise HTTPException(status_code=400, detail=f"Project '{project_id}' not found")
    if not project_id:
        raise HTTPException(status_code=400, detail="A linked project is required to create a task")

    # Member role check for project/phase assignment and self-assign limit
    if role and role.name == 'member':
        if assignee_id and assignee_id != user_id:
            raise HTTPException(status_code=403, detail="Access Denied: Members can only assign tasks to themselves.")
        
        pm = db.query(ProjectMember).filter_by(project_id=project_id, user_id=user_id).first()
        if not pm:
            raise HTTPException(status_code=403, detail="Access Denied: You are not assigned to this project.")
            
        if pm.assigned_phases:
            assigned_phases = [p.strip() for p in pm.assigned_phases.split(",") if p.strip()]
            phase_obj = db.query(Phase).filter(Phase.id == phase_id).first()
            phase_name = phase_obj.name if phase_obj else None
            if not phase_name or phase_name not in assigned_phases:
                raise HTTPException(status_code=403, detail=f"Access Denied: You are not assigned to phase '{phase_name}' on this project.")
        
    if project and (project.status in ['archived', 'cancelled', 'completed'] or project.is_deployed or (project.phase_rel and project.phase_rel.is_terminal)):
        if not body.get('post_production', False):
            raise HTTPException(status_code=400, detail="Standard tasks cannot be created for a completed, archived, or deployed project. Use Post-Production instead.")
            
    # Resolve approval status using the two-phase approval logic
    app_status, notify_lead_id, notify_team_leads = _determine_task_approval(project_id, assignee_id, user_id, db)
    body['approval_status'] = app_status
    pending_notif_lead_id = notify_lead_id
    pending_notif_team_leads = notify_team_leads
        
    try:
        est_hours = body.get('estimated_hours')
        if est_hours == '' or est_hours is None:
            est_hours = None
        else:
            try:
                est_hours = float(est_hours)
            except (ValueError, TypeError):
                est_hours = None

        new_task = Task(
            project_id=project_id,
            title=body.get('title'),
            description=body.get('description', ''),
            status=body.get('status', 'todo'),
            created_by_id=u.id,
            assignee_id=assignee_id,
            approval_status=body.get('approval_status', 'approved'),
            acceptance_status=body.get('acceptance_status', 'pending_acceptance'),
            start_date=body.get('start_date'),
            due_date=body.get('due_date'),
            priority=body.get('priority', 'medium'),
            estimated_hours=est_hours,
            phase_id=phase_id,
            team_id=team_id,
            post_production=body.get('post_production', False)
        )
        db.add(new_task)
        
        # F1 Auto-Enroll
        is_lead_or_admin = (project and project.project_lead_id == user_id) or has_permission('admin.panel', user_id, db)
        if is_lead_or_admin and assignee_id:
            _ensure_project_member(project_id, assignee_id, u.username, db)
            
        db.commit()
        
        log = TaskStateLog(task_id=new_task.id, to_state=new_task.status, actor_id=u.id)
        db.add(log)
        db.commit()
        
        # F2 Approval notification
        if pending_notif_lead_id:
            trigger_notification(
                user_id=pending_notif_lead_id,
                message=f"User '{u.username}' submitted a task '{new_task.title}' for your approval on project '{project.title}'.",
                related_task_id=new_task.id,
                db=db,
                category='task'
            )
            db.commit()
            
        if pending_notif_team_leads and new_task.assignee_id:
            pt = db.query(UserTeam).filter_by(user_id=new_task.assignee_id, is_primary=True).first()
            if pt:
                team_users = db.query(User).join(UserTeam).filter(
                    UserTeam.team_id == pt.team_id,
                    User.is_active == 1
                ).all()
                team_leads = [user for user in team_users if has_permission("task.approve", user.id, db)]
                for tl in team_leads:
                    trigger_notification(
                        user_id=tl.id,
                        message=f"A task '{new_task.title}' has been submitted for your approval on team '{pt.team.name}'.",
                        related_task_id=new_task.id,
                        db=db,
                        category='task'
                    )
            db.commit()
        
        if new_task.assignee_id:
            trigger_notification(
                user_id=new_task.assignee_id,
                message=f"New task '{new_task.title}' has been created and assigned to you by {u.username}.",
                related_task_id=new_task.id,
                db=db,
                category='task'
            )
            db.commit()
            
        broadcast_event("TASK_CREATED", {"id": new_task.id, "title": new_task.title})
        return {"status": "ok", "id": new_task.id}
    except HTTPException as he:
        db.rollback()
        raise he
    except Exception as ex:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(ex))

@app.put('/api/tasks/{task_id}')
def update_task(task_id: int, body: dict, user_id: int = Depends(get_current_user_id), db: Session = Depends(get_db)):
    check_permission('task.update', user_id, db)
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task: raise HTTPException(status_code=404, detail="Task not found")
    
    # Read-only guard for assignee when task is pending approval
    if task.approval_status in ['pending_lead_approval', 'pending_team_lead_approval'] and user_id == task.assignee_id:
        if not has_permission('admin.panel', user_id, db):
            raise HTTPException(status_code=403, detail="Task is pending approval and is read-only for the assignee.")
            
    notify_lead_on_update = False
    notify_team_leads_on_update = False
    
    # Project Lead vs Team Leader permission check
    task_project = db.query(Project).filter_by(id=task.project_id).first()
    project_lead_id = task_project.project_lead_id if task_project else None
    if project_lead_id:
        is_lead_or_admin = (user_id == project_lead_id) or has_permission('admin.panel', user_id, db)
        is_team_leader = has_permission('task.approve', user_id, db)
        
        if not is_lead_or_admin:
            # Determine assignee and cast to int to check if they are self-assigning/accepting
            requested_assignee_id = task.assignee_id
            if ('assignee_id' in body) or ('assignee' in body):
                val = body.get('assignee_id')
                if val is not None and val != '':
                    try:
                        requested_assignee_id = int(val)
                    except (ValueError, TypeError):
                        requested_assignee_id = None
                else:
                    requested_assignee_id = None
                
                if requested_assignee_id is None and 'assignee' in body:
                    assignee_val = body.get('assignee')
                    if assignee_val:
                        a_user = db.query(User).filter_by(username=assignee_val).first()
                        requested_assignee_id = a_user.id if a_user else None

            is_approving = False
            if body.get('status') == 'done':
                is_approving = True
            if 'approval_status' in body and body.get('approval_status') == 'approved' and task.approval_status != 'approved':
                is_approving = True
            if 'acceptance_status' in body and body.get('acceptance_status') == 'accepted' and task.acceptance_status != 'accepted':
                if requested_assignee_id != user_id or task.status == 'review':
                    is_approving = True
            
            if is_approving:
                raise HTTPException(status_code=403, detail="This project has a designated Project Lead. Only the Lead or Admin can approve tasks.")
            
            if 'assignee' in body or 'assignee_id' in body:
                if requested_assignee_id != task.assignee_id:
                    if is_team_leader:
                        app_status, notify_lead_id, notify_team_leads = _determine_task_approval(task.project_id, requested_assignee_id, user_id, db)
                        body['approval_status'] = app_status
                        if app_status == 'pending_lead_approval':
                            notify_lead_on_update = True
                        elif app_status == 'pending_team_lead_approval':
                            notify_team_leads_on_update = True
                    elif requested_assignee_id != user_id:
                        raise HTTPException(status_code=403, detail="This project has a designated Project Lead. Only the Lead or Admin can assign tasks.")
            
            if 'team' in body or 'team_id' in body:
                requested_team_id = task.team_id
                val = body.get('team_id')
                if val is not None and val != '':
                    try:
                        requested_team_id = int(val)
                    except (ValueError, TypeError):
                        requested_team_id = None
                else:
                    requested_team_id = None
                
                if requested_team_id is None and 'team' in body:
                    t_val = body.get('team')
                    if t_val:
                        t_obj = db.query(Team).filter_by(name=t_val).first()
                        requested_team_id = t_obj.id if t_obj else None
                
                if requested_team_id != task.team_id:
                    if is_team_leader:
                        app_status, notify_lead_id, notify_team_leads = _determine_task_approval(task.project_id, task.assignee_id, user_id, db)
                        body['approval_status'] = app_status
                        if app_status == 'pending_lead_approval':
                            notify_lead_on_update = True
                        elif app_status == 'pending_team_lead_approval':
                            notify_team_leads_on_update = True
                    else:
                        raise HTTPException(status_code=403, detail="This project has a designated Project Lead. Only the Lead or Admin can change task teams.")
    
    current_user = db.query(User).filter(User.id == user_id).first()
    role = db.query(Role).filter(Role.id == current_user.role_id).first()

    # Enforce Member Project and Phase restrictions
    # Only apply when the member is self-assigning a task they don't already own.
    # If the task is already assigned to the member, they are free to update status/acceptance.
    if role and role.name == 'member':
        requested_assignee_id = task.assignee_id
        if ('assignee_id' in body) or ('assignee' in body):
            val = body.get('assignee_id')
            if val is not None and val != '':
                try:
                    requested_assignee_id = int(val)
                except (ValueError, TypeError):
                    requested_assignee_id = None
            else:
                requested_assignee_id = None
                
            if requested_assignee_id is None and 'assignee' in body:
                assignee_val = body.get('assignee')
                if assignee_val:
                    a_user = db.query(User).filter_by(username=assignee_val).first()
                    requested_assignee_id = a_user.id if a_user else None

        # Only enforce ProjectMember check when the member is assigning a task to themselves
        # that was previously unassigned (i.e. they are claiming or self-assigning it).
        # If the task is already assigned to this member, skip the project membership guard
        # so they can freely update status and acceptance on their own tasks.
        is_claiming = (requested_assignee_id == user_id and task.assignee_id != user_id)
        if is_claiming:
            pm = db.query(ProjectMember).filter_by(project_id=task.project_id, user_id=user_id).first()
            if not pm:
                raise HTTPException(status_code=403, detail="Access Denied: You are not assigned to this project.")
            
            if pm.assigned_phases:
                assigned_phases = [p.strip() for p in pm.assigned_phases.split(",") if p.strip()]
                task_phase = db.query(Phase).filter(Phase.id == task.phase_id).first()
                phase_name = task_phase.name if task_phase else None
                
                if 'crisp_dm_phase' in body:
                    phase_name = body.get('crisp_dm_phase')
                elif 'phase_id' in body:
                    new_phase_id = body.get('phase_id')
                    if new_phase_id:
                        p_obj = db.query(Phase).filter(Phase.id == int(new_phase_id)).first()
                        phase_name = p_obj.name if p_obj else None
                
                if phase_name and phase_name not in assigned_phases:
                    raise HTTPException(status_code=403, detail=f"Access Denied: You are not assigned to phase '{phase_name}' on this project.")
    
    # RLS Scope Enforcement for task updates
    if not has_permission('analytics.read_all', user_id, db):
        if has_permission('analytics.read_team', user_id, db):
            verify_scope_boundary(user_id, task.team_id, task.assignee_id, db, bypass_permission="analytics.read_all")
        elif has_permission('analytics.read_own', user_id, db):
            if task.assignee_id != user_id and task.created_by_id != user_id:
                raise HTTPException(status_code=403, detail="Resource out of personal scope boundaries")
        else:
            raise HTTPException(status_code=403, detail="Access denied")
            
    # Assigned Task Metadata Protection Guard
    # Dynamic check: Does the user lack Admin Panel capabilities?
    is_lead_of_project = (task_project and task_project.project_lead_id == user_id)
    is_unauthorized = not has_permission("admin.panel", user_id, db) and not is_lead_of_project
    if task.assignee_id is not None and is_unauthorized:
        protected_fields = ['title', 'description', 'team_id', 'assignee_id', 'priority', 'estimated_hours', 'start_date', 'due_date', 'project_id']
        for field in protected_fields:
            if field in body:
                new_val = body[field]
                # Resolve legacy parameters if passed in body
                if field == 'team_id' and 'team' in body:
                    t_obj = db.query(Team).filter_by(name=body['team']).first()
                    new_val = t_obj.id if t_obj else None
                elif field == 'assignee_id' and 'assignee' in body:
                    a_obj = db.query(User).filter_by(username=body['assignee']).first()
                    new_val = a_obj.id if a_obj else None
                
                old_val = getattr(task, field)
                
                # Normalize empty values (None and empty string should be treated as equal)
                norm_new = "" if new_val is None else str(new_val).strip()
                norm_old = "" if old_val is None else str(old_val).strip()
                
                # If numeric comparison is possible, normalize floats/ints
                is_numeric = False
                try:
                    if new_val is not None and old_val is not None:
                        float_new = float(new_val)
                        float_old = float(old_val)
                        is_numeric = True
                        if float_new != float_old:
                            raise HTTPException(
                                status_code=403,
                                detail=f"Compliance Alert: Once a task is assigned, only administrators can modify '{field}'."
                            )
                except (ValueError, TypeError):
                    pass
                
                if not is_numeric and norm_new != norm_old:
                    raise HTTPException(
                        status_code=403,
                        detail=f"Compliance Alert: Once a task is assigned, only administrators can modify '{field}'."
                    )
            
    # SOC 2 Segregation of Duties (SoD) backend guard
    new_status = body.get('status')
    is_completing = (new_status == 'done' and task.status != 'done')
    is_approving = (body.get('approval_status') == 'approved' and task.approval_status != 'approved')
    if is_completing or is_approving:
        if (task.assignee_id == user_id or task.created_by_id == user_id) and not has_permission("admin.panel", user_id, db):
            raise HTTPException(
                status_code=403, 
                detail="SOC 2 Segregation of Duties Violation: You cannot self-approve or mark tasks as Done if you are the creator or assignee."
            )
            
    # State transition guards
    if new_status and new_status != task.status:
        # Standard member cannot transition directly to done
        if new_status == 'done' and not has_permission('task.approve', user_id, db):
            raise HTTPException(status_code=403, detail="Standard team members cannot set tasks to Done directly. Please submit for review.")
            
        # Reopening Guard: locked to team leaders and administrators
        if task.status == 'done':
            if not has_permission('task.approve', user_id, db):
                raise HTTPException(status_code=403, detail="Only team leaders and administrators can reopen approved tasks.")
                
        # Missing Assignee Guard: require assignee when submitting for review
        if new_status in ['review', 'active_review']:
            updated_assignee_id = task.assignee_id
            if 'assignee' in body:
                assignee_val = body.get('assignee')
                if assignee_val:
                    assignee_obj = db.query(User).filter_by(username=assignee_val).first()
                    updated_assignee_id = assignee_obj.id if assignee_obj else None
                else:
                    updated_assignee_id = None
            elif 'assignee_id' in body:
                updated_assignee_id = body.get('assignee_id')
                
            if not updated_assignee_id:
                raise HTTPException(status_code=400, detail="A task must have an assigned resource before submitting for peer review.")
        
        # Blocked tasks cannot change status until unblocked
        if task.is_blocked:
            # Exception: we can unblock and update at the same time, but if it stays blocked we can't change status
            if body.get('is_blocked', task.is_blocked):
                raise HTTPException(status_code=400, detail="Blocked tasks cannot change status. Unblock the task first.")
                
    try:
        old_status = task.status
        orig_assignee_id = task.assignee_id
        orig_approval_status = task.approval_status
        orig_is_blocked = task.is_blocked
        
        for k, v in body.items():
            if hasattr(task, k) and k not in ['id', 'crisp_dm_phase', 'assignee', 'team', 'created_by', 'completed_by']:
                # Clean up empty strings and type-cast for numeric fields to avoid DB representation issues
                if k in ['estimated_hours', 'actual_hours']:
                    if v == '' or v is None:
                        v = None
                    else:
                        try:
                            v = float(v)
                        except (ValueError, TypeError):
                            v = None
                elif k in ['team_id', 'assignee_id', 'created_by_id', 'completed_by_id', 'phase_id']:
                    if v == '' or v is None:
                        v = None
                    else:
                        try:
                            v = int(v)
                        except (ValueError, TypeError):
                            v = None
                setattr(task, k, v)
                
        # Resolve relationship mappings from legacy strings if passed
        if 'crisp_dm_phase' in body:
            phase = db.query(Phase).filter_by(name=body.get('crisp_dm_phase')).first()
            if phase: task.phase_id = phase.id
        if 'team' in body:
            team = db.query(Team).filter_by(name=body.get('team')).first()
            if team: task.team_id = team.id
        if 'assignee' in body:
            assignee = db.query(User).filter_by(username=body.get('assignee')).first()
            task.assignee_id = assignee.id if assignee else None
        if 'completed_by' in body:
            completed_by = db.query(User).filter_by(username=body.get('completed_by')).first()
            task.completed_by_id = completed_by.id if completed_by else None
            
        # Validate assignee scope on updated task
        validate_assignee_scope(task.assignee_id, task.team_id, user_id, db)
            
        if task.status != old_status:
            prev_log = db.query(TaskStateLog).filter(TaskStateLog.task_id == task.id, TaskStateLog.exited_at == None).first()
            if prev_log:
                prev_log.exited_at = datetime.utcnow()
            db.add(TaskStateLog(task_id=task.id, from_state=old_status, to_state=task.status, actor_id=user_id))
            
        db.commit()
        
        # Hooks for task triggers
        actor_username = current_user.username if current_user else "an administrator"
        if task.assignee_id and task.assignee_id != orig_assignee_id:
            # F1 Auto-enroll: check if actor is lead or admin
            is_lead_or_admin = (task_project and task_project.project_lead_id == user_id) or has_permission('admin.panel', user_id, db)
            if is_lead_or_admin:
                _ensure_project_member(task.project_id, task.assignee_id, actor_username, db)
                db.commit()

            trigger_notification(
                user_id=task.assignee_id,
                message=f"You have been assigned to task: '{task.title}' by {actor_username}.",
                related_task_id=task.id,
                db=db,
                category='task'
            )
            db.commit()
            
        # F2 notification on update
        if notify_lead_on_update and project_lead_id:
            trigger_notification(
                user_id=project_lead_id,
                message=f"User '{actor_username}' updated assignment on task '{task.title}' which requires your approval.",
                related_task_id=task.id,
                db=db,
                category='task'
            )
            db.commit()

        if notify_team_leads_on_update and task.assignee_id:
            pt = db.query(UserTeam).filter_by(user_id=task.assignee_id, is_primary=True).first()
            if pt:
                team_users = db.query(User).join(UserTeam).filter(
                    UserTeam.team_id == pt.team_id,
                    User.is_active == 1
                ).all()
                team_leads = [user for user in team_users if has_permission("task.approve", user.id, db)]
                for tl in team_leads:
                    trigger_notification(
                        user_id=tl.id,
                        message=f"Task '{task.title}' assignment has been updated and requires your approval on team '{pt.team.name}'.",
                        related_task_id=task.id,
                        db=db,
                        category='task'
                    )
            db.commit()
            # Task status transition notification
            msg = f"{actor_username} updated status of task '{task.title}' to {task.status}."
            recipients = set()
            if task.assignee_id and task.assignee_id != user_id:
                recipients.add(task.assignee_id)
            if task.created_by_id and task.created_by_id != user_id:
                recipients.add(task.created_by_id)
            for r_id in recipients:
                trigger_notification(r_id, msg, task.id, db, category='task')
                
            # Review pool notification
            if task.status in ['review', 'active_review'] and old_status not in ['review', 'active_review']:
                assignee_username = task.assignee_rel.username if task.assignee_rel else "Someone"
                rev_msg = f"{assignee_username} has submitted task '{task.title}' to the review pool."
                # Fetch users dynamically based on approval and admin capabilities
                all_users = db.query(User).all()
                rev_recipients = set()
                for u in all_users:
                    if has_permission("task.approve", u.id, db):
                        if has_permission("admin.panel", u.id, db):
                            rev_recipients.add(u.id)
                        else:
                            is_in_team = db.query(UserTeam).filter_by(user_id=u.id, team_id=task.team_id).first()
                            if is_in_team:
                                rev_recipients.add(u.id)
                    elif has_permission("admin.panel", u.id, db):
                        rev_recipients.add(u.id)
                for r_id in rev_recipients:
                    trigger_notification(r_id, rev_msg, task.id, db, category='task')
                    
        # Approval notification
        if (task.status == 'done' and old_status != 'done') or (body.get('approval_status') == 'approved' and orig_approval_status != 'approved'):
            app_msg = f"Your task '{task.title}' has been approved by {actor_username}."
            recipients = set()
            if task.assignee_id:
                recipients.add(task.assignee_id)
            if task.created_by_id:
                recipients.add(task.created_by_id)
            for r_id in recipients:
                trigger_notification(r_id, app_msg, task.id, db, category='task')
                
        # Rejection notification
        if body.get('approval_status') == 'rejected' and orig_approval_status != 'rejected':
            reason = body.get('rejection_reason') or body.get('reason') or "rejection reason not specified"
            rej_msg = f"Your task '{task.title}' was rejected by {actor_username}: {reason}."
            if task.assignee_id:
                trigger_notification(task.assignee_id, rej_msg, task.id, db, category='task')
                
        # Blocked notification
        if task.is_blocked and not orig_is_blocked:
            reason = body.get('blocker_reason') or body.get('blockers') or task.description or "blocked"
            blk_msg = f"Your task '{task.title}' is blocked: {reason}."
            if task.assignee_id:
                trigger_notification(task.assignee_id, blk_msg, task.id, db, category='task')
                
        db.commit()
        broadcast_event("TASK_UPDATED", {"id": task.id, "title": task.title, "status": task.status})
        return {"status": "ok"}
    except HTTPException as he:
        db.rollback()
        raise he
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))

@app.delete('/api/tasks/{task_id}')
def delete_task(task_id: int, user_id: int = Depends(get_current_user_id), db: Session = Depends(get_db)):
    check_permission('task.delete', user_id, db)
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task: raise HTTPException(status_code=404, detail="Task not found")
    
    actor = db.query(User).filter(User.id == user_id).first()
    actor_username = actor.username if actor else "an administrator"
    # RLS Scope Enforcement for task deletion
    if not has_permission('analytics.read_all', user_id, db):
        if has_permission('analytics.read_team', user_id, db):
            verify_scope_boundary(user_id, task.team_id, task.assignee_id, db, bypass_permission="analytics.read_all")
        elif has_permission('analytics.read_own', user_id, db):
            if task.assignee_id != user_id and task.created_by_id != user_id:
                raise HTTPException(status_code=403, detail="Resource out of personal scope boundaries")
        else:
            raise HTTPException(status_code=403, detail="Access denied")
            
    # Service Management State-Based Deletion Guards (dynamic capability check)
    if not has_permission("admin.panel", user_id, db):
        if task.assignee_id is not None:
            raise HTTPException(
                status_code=400,
                detail="Compliance Alert: Assigned tasks can only be deleted by administrators."
            )
        if task.status != 'todo':
            raise HTTPException(
                status_code=400,
                detail=f"Compliance Alert: Active or completed tasks cannot be deleted by team leaders. "
                       f"Only administrators can delete tasks in '{task.status}' state."
            )
            
    if task.assignee_id:
        trigger_notification(
            user_id=task.assignee_id,
            message=f"Task '{task.title}' has been deleted by {actor_username}.",
            related_task_id=None,
            db=db,
            category='task'
        )
        db.commit()
    db.delete(task)
    db.commit()
    broadcast_event("TASK_DELETED", {"id": task_id})
    return {"status": "ok"}

@app.post('/api/tasks/{task_id}/approve-lead')
def lead_approve_task(task_id: int, user_id: int = Depends(get_current_user_id), db: Session = Depends(get_db)):
    task = db.query(Task).filter_by(id=task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    project = db.query(Project).filter_by(id=task.project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if project.project_lead_id != user_id and not has_permission('admin.panel', user_id, db):
        raise HTTPException(status_code=403, detail="Only the Project Lead or Admin can approve.")
    
    # Resolve assignee's primary team and its team leads
    team_leads = []
    if task.assignee_id:
        pt = db.query(UserTeam).filter_by(user_id=task.assignee_id, is_primary=True).first()
        if pt:
            team_users = db.query(User).join(UserTeam).filter(
                UserTeam.team_id == pt.team_id,
                User.is_active == 1
            ).all()
            team_leads = [u.id for u in team_users if has_permission("task.approve", u.id, db)]
            
    # If the assignee has Team Leads, and none of them is the creator or the currently approving user:
    needs_team_lead_approval = False
    if team_leads:
        if task.created_by_id not in team_leads and user_id not in team_leads:
            needs_team_lead_approval = True
            
    if needs_team_lead_approval:
        task.approval_status = 'pending_team_lead_approval'
        db.commit()
        # Notify Team Leads
        pt = db.query(UserTeam).filter_by(user_id=task.assignee_id, is_primary=True).first()
        team_name = pt.team.name if pt and pt.team else "their team"
        for tl_id in team_leads:
            trigger_notification(
                user_id=tl_id,
                message=f"Task '{task.title}' approved by Project Lead. Awaiting your Team Lead approval on team '{team_name}'.",
                related_task_id=task.id,
                db=db,
                category='task'
            )
    else:
        task.approval_status = 'approved'
        db.commit()
        # Auto-enroll assignee if not already a member
        if task.assignee_id:
            actor = db.query(User).filter_by(id=user_id).first()
            actor_username = actor.username if actor else "Project Lead"
            _ensure_project_member(task.project_id, task.assignee_id, actor_username, db)
            db.commit()

        # Notify assignee and original creator
        if task.assignee_id:
            trigger_notification(
                user_id=task.assignee_id,
                message=f"Your task '{task.title}' has been approved by the Project Lead.",
                related_task_id=task.id,
                db=db,
                category='task'
            )
        if task.created_by_id and task.created_by_id != task.assignee_id:
            trigger_notification(
                user_id=task.created_by_id,
                message=f"Task '{task.title}' you submitted was approved by the Project Lead.",
                related_task_id=task.id,
                db=db,
                category='task'
            )
            
    db.commit()
    broadcast_event("TASK_UPDATED", {"id": task.id, "title": task.title, "status": task.status})
    return {"status": "ok"}

@app.post('/api/tasks/{task_id}/reject-lead')
def lead_reject_task(task_id: int, body: dict, user_id: int = Depends(get_current_user_id), db: Session = Depends(get_db)):
    task = db.query(Task).filter_by(id=task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    project = db.query(Project).filter_by(id=task.project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if project.project_lead_id != user_id and not has_permission('admin.panel', user_id, db):
        raise HTTPException(status_code=403, detail="Only the Project Lead or Admin can reject.")
    
    task.approval_status = 'rejected'
    rejection_reason = body.get('reason', '')
    db.commit()
    # Notify creator and assignee
    reason_text = f" Reason: {rejection_reason}" if rejection_reason else ""
    if task.created_by_id:
        trigger_notification(
            user_id=task.created_by_id,
            message=f"Task '{task.title}' was rejected by the Project Lead.{reason_text}",
            related_task_id=task.id,
            db=db,
            category='task'
        )
    if task.assignee_id and task.assignee_id != task.created_by_id:
        trigger_notification(
            user_id=task.assignee_id,
            message=f"Task '{task.title}' assigned to you was rejected by the Project Lead.{reason_text}",
            related_task_id=task.id,
            db=db,
            category='task'
        )
    db.commit()
    broadcast_event("TASK_UPDATED", {"id": task.id, "title": task.title, "status": task.status})
    return {"status": "ok"}

@app.post('/api/tasks/{task_id}/approve-team-lead')
def team_lead_approve_task(task_id: int, user_id: int = Depends(get_current_user_id), db: Session = Depends(get_db)):
    task = db.query(Task).filter_by(id=task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
        
    if not task.assignee_id:
        raise HTTPException(status_code=400, detail="Task must have an assignee for Team Lead approval.")
        
    # Verify user is a Team Lead for assignee's primary team, or Admin
    is_authorized = False
    if has_permission('admin.panel', user_id, db):
        is_authorized = True
    else:
        # Resolve assignee's primary team
        pt = db.query(UserTeam).filter_by(user_id=task.assignee_id, is_primary=True).first()
        if pt:
            # Check if current user is on same team and has task.approve permission
            ut = db.query(UserTeam).filter_by(user_id=user_id, team_id=pt.team_id).first()
            if ut and has_permission('task.approve', user_id, db):
                is_authorized = True
                
    if not is_authorized:
        raise HTTPException(status_code=403, detail="Only a Team Lead for the assignee's primary team or Admin can approve.")
        
    task.approval_status = 'approved'
    db.commit()
    
    # Auto-enroll assignee if not already a member
    actor = db.query(User).filter_by(id=user_id).first()
    actor_username = actor.username if actor else "Team Lead"
    _ensure_project_member(task.project_id, task.assignee_id, actor_username, db)
    db.commit()
    
    # Notify assignee and creator
    trigger_notification(
        user_id=task.assignee_id,
        message=f"Your task '{task.title}' has been approved by the Team Lead.",
        related_task_id=task.id,
        db=db,
        category='task'
    )
    if task.created_by_id and task.created_by_id != task.assignee_id:
        trigger_notification(
            user_id=task.created_by_id,
            message=f"Task '{task.title}' was approved by the Team Lead.",
            related_task_id=task.id,
            db=db,
            category='task'
        )
    db.commit()
    broadcast_event("TASK_UPDATED", {"id": task.id, "title": task.title, "status": task.status})
    return {"status": "ok"}

@app.post('/api/tasks/{task_id}/reject-team-lead')
def team_lead_reject_task(task_id: int, body: dict, user_id: int = Depends(get_current_user_id), db: Session = Depends(get_db)):
    task = db.query(Task).filter_by(id=task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
        
    if not task.assignee_id:
        raise HTTPException(status_code=400, detail="Task must have an assignee for Team Lead rejection.")
        
    # Verify user is a Team Lead for assignee's primary team, or Admin
    is_authorized = False
    if has_permission('admin.panel', user_id, db):
        is_authorized = True
    else:
        pt = db.query(UserTeam).filter_by(user_id=task.assignee_id, is_primary=True).first()
        if pt:
            ut = db.query(UserTeam).filter_by(user_id=user_id, team_id=pt.team_id).first()
            if ut and has_permission('task.approve', user_id, db):
                is_authorized = True
                
    if not is_authorized:
        raise HTTPException(status_code=403, detail="Only a Team Lead for the assignee's primary team or Admin can reject.")
        
    task.approval_status = 'rejected'
    rejection_reason = body.get('reason', '')
    db.commit()
    
    # Notify creator and assignee
    reason_text = f" Reason: {rejection_reason}" if rejection_reason else ""
    if task.created_by_id:
        trigger_notification(
            user_id=task.created_by_id,
            message=f"Task '{task.title}' was rejected by the Team Lead.{reason_text}",
            related_task_id=task.id,
            db=db,
            category='task'
        )
    if task.assignee_id and task.assignee_id != task.created_by_id:
        trigger_notification(
            user_id=task.assignee_id,
            message=f"Task '{task.title}' assigned to you was rejected by the Team Lead.{reason_text}",
            related_task_id=task.id,
            db=db,
            category='task'
        )
    db.commit()
    broadcast_event("TASK_UPDATED", {"id": task.id, "title": task.title, "status": task.status})
    return {"status": "ok"}

@app.get('/api/tasks/{task_id}/logs')
def get_task_logs(task_id: int, user_id: int = Depends(get_current_user_id), db: Session = Depends(get_db)):
    check_permission('task.read', user_id, db)
    logs = db.query(TaskStateLog).filter(TaskStateLog.task_id == task_id).order_by(TaskStateLog.id.asc()).all()
    result = []
    for log in logs:
        d = serialize_model(log, db)
        actor = db.query(User).filter(User.id == log.actor_id).first()
        d['actor_name'] = actor.username if actor else None
        result.append(d)
    return result

# --- TASK COMMENTS ---

@app.get('/api/task-comments')
def get_task_comments(task_id: Optional[int] = None, user_id: int = Depends(get_current_user_id), db: Session = Depends(get_db)):
    check_permission('task.read', user_id, db)
    query = db.query(TaskComment)
    if task_id:
        task = db.query(Task).filter(Task.id == task_id).first()
        if not task:
            raise HTTPException(status_code=404, detail="Task not found")
        verify_scope_boundary(user_id, task.team_id, task.assignee_id, db, bypass_permission="analytics.read_all")
        query = query.filter(TaskComment.task_id == task_id)
    else:
        if not has_permission("analytics.read_all", user_id, db):
            user_teams = get_user_team_ids(db, user_id)
            query = query.join(Task).filter(
                (Task.assignee_id == user_id) | (Task.team_id.in_(user_teams))
            )
    comments = query.order_by(TaskComment.id.asc()).all()
    return [serialize_model(c, db) for c in comments]

@app.post('/api/task-comments')
def create_task_comment(body: dict, user_id: int = Depends(get_current_user_id), db: Session = Depends(get_db)):
    task_id = body.get('task_id')
    content = body.get('content', '').strip()
    if not task_id or not content:
        raise HTTPException(status_code=400, detail="Missing task_id or content")
        
    check_permission('task.update', user_id, db)
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
        
    verify_scope_boundary(user_id, task.team_id, task.assignee_id, db, bypass_permission="analytics.read_all")
        
    u = db.query(User).filter(User.id == user_id).first()
    new_comment = TaskComment(
        task_id=task_id, 
        author_id=u.id, 
        content=content
    )
    db.add(new_comment)
    db.commit()
    
    # Notify assignee and creator (excluding commenter)
    recipients = set()
    if task.assignee_id and task.assignee_id != user_id:
        recipients.add(task.assignee_id)
    if task.created_by_id and task.created_by_id != user_id:
        recipients.add(task.created_by_id)
        
    comment_text = content[:60] + "..." if len(content) > 60 else content
    msg = f"{u.username} commented on task '{task.title}': \"{comment_text}\""
    for r_id in recipients:
        trigger_notification(r_id, msg, task.id, db, category='comment')
    db.commit()
    
    return {"status": "ok"}

# --- PROJECT HISTORIES/COMMENTS ---

@app.post('/api/comments')
def create_project_history_comment(body: dict, user_id: int = Depends(get_current_user_id), db: Session = Depends(get_db)):
    project_id = body.get('project_id')
    note = body.get('note')
    phase = body.get('phase')
    if not project_id:
        raise HTTPException(status_code=400, detail="Missing project_id")
        
    check_permission('project.update', user_id, db)
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
        
    verify_scope_boundary(user_id, project.team_id, project.assignee_id, db, bypass_permission="analytics.read_all")
        
    today = datetime.now().strftime('%Y-%m-%d')
    u = db.query(User).filter(User.id == user_id).first()
    
    new_hist = History(
        project_id=project_id, 
        date=today, 
        phase=phase, 
        status='note', 
        note=note, 
        actor=u.username
    )
    db.add(new_hist)
    db.commit()
    
    if project.assignee_id and project.assignee_id != user_id:
        note_text = note[:60] + "..." if note and len(note) > 60 else (note or "")
        msg = f"{u.username} commented on project '{project.title}': \"{note_text}\""
        trigger_notification(project.assignee_id, msg, None, db, category='comment')
        db.commit()
        
    return {"status": "ok"}

# --- AUDIT LOGS ---

@app.get('/api/audit-logs')
def get_audit_logs(user_id: int = Depends(get_current_user_id), db: Session = Depends(get_db)):
    check_permission('audit.read', user_id, db)
    logs = db.query(AuditLog).order_by(AuditLog.id.desc()).limit(200).all()
    return [serialize_model(l, db) for l in logs]

@app.post('/api/audit-logs')
def create_audit_log(body: dict, user_id: int = Depends(get_current_user_id), db: Session = Depends(get_db)):
    now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    u = db.query(User).filter(User.id == user_id).first()
    role = db.query(Role).filter(Role.id == u.role_id).first()
    
    new_log = AuditLog(
        timestamp=now, 
        username=u.username, 
        user_role=role.name if role else "",
        action=body.get('action', ''), 
        details=body.get('details', '')
    )
    db.add(new_log)
    db.commit()
    return {"status": "ok"}

def _determine_task_approval(project_id: str, assignee_id: Optional[int], creator_id: int, db: Session):
    """
    Returns (approval_status, notify_lead_id, notify_team_leads)
    notify_team_leads is a boolean indicating if we notify the assignee's team leads.
    """
    # If creator is Admin, bypass approvals entirely.
    if has_permission('admin.panel', creator_id, db):
        return 'approved', None, False
        
    proj = db.query(Project).filter_by(id=project_id).first()
    project_lead_id = proj.project_lead_id if proj else None
    
    # If there is no assignee, approval doesn't apply in the same way.
    if not assignee_id:
        return 'approved', None, False

    # Resolve assignee's primary team and its team leads (who have task.approve)
    team_leads = []
    pt = db.query(UserTeam).filter_by(user_id=assignee_id, is_primary=True).first()
    if pt:
        team_users = db.query(User).join(UserTeam).filter(
            UserTeam.team_id == pt.team_id,
            User.is_active == 1
        ).all()
        team_leads = [u.id for u in team_users if has_permission("task.approve", u.id, db)]
        
    # If the creator is the assignee's Team Lead, it is pre-approved.
    if creator_id in team_leads:
        return 'approved', None, False
        
    # Phase 1: Project Lead approval.
    # Required if: project has a lead AND creator is NOT that project lead.
    if project_lead_id and creator_id != project_lead_id:
        return 'pending_lead_approval', project_lead_id, False
        
    # Phase 2: Team Lead approval.
    # Required if: assignee has Team Lead(s) AND creator is NOT one of those Team Leads.
    if team_leads:
        return 'pending_team_lead_approval', None, True
        
    return 'approved', None, False

def _ensure_project_member(project_id: str, assignee_id: int, actor_username: str, db: Session):
    """Auto-create a ProjectMember record when a lead/admin assigns someone to a project task."""
    if not assignee_id:
        return
    existing = db.query(ProjectMember).filter_by(
        project_id=project_id, user_id=assignee_id
    ).first()
    if not existing:
        db.add(ProjectMember(project_id=project_id, user_id=assignee_id, assigned_phases=None))
        proj = db.query(Project).filter_by(id=project_id).first()
        proj_title = proj.title if proj else project_id
        trigger_notification(
            user_id=assignee_id,
            message=f"You have been added as a member of project '{proj_title}' by {actor_username}.",
            related_task_id=None,
            db=db,
            category='project'
        )

def trigger_notification(user_id: int, message: str, related_task_id: Optional[int], db: Session, category: str = 'general'):
    now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    notif = Notification(
        user_fk=user_id,
        message=message,
        is_read=0,
        created_at=now,
        related_task_id=related_task_id,
        category=category,
        deleted_at=None
    )
    db.add(notif)

def notify_admins_and_leaders(message: str, db: Session):
    all_users = db.query(User).all()
    users = [u for u in all_users if has_permission("admin.panel", u.id, db) or has_permission("task.approve", u.id, db)]
    for u in users:
        trigger_notification(u.id, message, None, db)

def notify_team_members(team_id: int, message: str, db: Session):
    users = db.query(User).join(UserTeam).filter(UserTeam.team_id == team_id).all()
    for u in users:
        trigger_notification(u.id, message, None, db)

# --- DASHBOARD LAYOUT & SHORTCUTS ENDPOINTS ---

@app.get('/api/users/me/config')
def get_user_dashboard_config(user_id: int = Depends(get_current_user_id), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    role = user.role_rel.name if user.role_rel else ""
    user_team_ids = get_user_team_ids(db, user_id)
    teams = db.query(Team).filter(Team.id.in_(user_team_ids)).all()
    team_names = [t.name for t in teams]
    
    try:
        config = json.loads(user.dashboard_config or "{}")
    except Exception:
        config = {}
        
    return {
        "username": user.username,
        "role": role,
        "team": team_names[0] if team_names else "",
        "teams": team_names,
        "dashboard_config": config
    }

@app.put('/api/users/me/config')
def update_user_dashboard_config(body: dict, user_id: int = Depends(get_current_user_id), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    user.dashboard_config = json.dumps(body.get('dashboard_config', {}))
    db.commit()
    return {"status": "ok"}

@app.post('/api/shortcuts/publish')
def publish_shortcut(body: dict, user_id: int = Depends(get_current_user_id), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    # Dynamic capability validation for shortcuts publishing
    is_admin = has_permission("admin.panel", user_id, db)
    is_leader = has_permission("task.approve", user_id, db)
    if not is_admin and not is_leader:
        raise HTTPException(status_code=403, detail="Only administrators and team leaders can publish shortcuts")
        
    title = body.get('title')
    url = body.get('url')
    icon = body.get('icon', 'fa-link')
    team_name = body.get('team')
    
    if not title or not url:
        raise HTTPException(status_code=400, detail="Title and URL are required")
        
    target_team_id = None
    if team_name and team_name != "Global":
        target_team = db.query(Team).filter(Team.name == team_name).first()
        if not target_team:
            raise HTTPException(status_code=400, detail=f"Team '{team_name}' not found")
        target_team_id = target_team.id
        
    if not is_admin and is_leader:
        if not target_team_id:
            raise HTTPException(status_code=403, detail="Team leaders cannot publish global shortcuts")
        user_team_ids = get_user_team_ids(db, user_id)
        if target_team_id not in user_team_ids:
            raise HTTPException(status_code=403, detail="Team leaders can only publish to their active teams")
            
    new_shortcut = PublishedShortcut(
        title=title,
        url=url,
        icon=icon,
        team_id=target_team_id,
        creator_id=user_id
    )
    db.add(new_shortcut)
    db.commit()
    return {"status": "ok"}

@app.get('/api/shortcuts/published')
def get_published_shortcuts(user_id: int = Depends(get_current_user_id), db: Session = Depends(get_db)):
    user_team_ids = get_user_team_ids(db, user_id)
    shortcuts = db.query(PublishedShortcut).filter(
        (PublishedShortcut.team_id == None) | (PublishedShortcut.team_id.in_(user_team_ids))
    ).order_by(PublishedShortcut.id.asc()).all()
    return [serialize_model(s, db) for s in shortcuts]

@app.delete('/api/shortcuts/published/{shortcut_id}')
def delete_published_shortcut(shortcut_id: int, user_id: int = Depends(get_current_user_id), db: Session = Depends(get_db)):
    shortcut = db.query(PublishedShortcut).filter(PublishedShortcut.id == shortcut_id).first()
    if not shortcut:
        raise HTTPException(status_code=404, detail="Shortcut not found")
        
    is_admin = has_permission("admin.panel", user_id, db)
    is_leader = has_permission("task.approve", user_id, db)
    
    if is_admin:
        pass  # Admins can delete any shared shortcut
    elif is_leader:
        user_team_ids = get_user_team_ids(db, user_id)
        if shortcut.team_id not in user_team_ids:
            raise HTTPException(status_code=403, detail="Team leaders can only delete shortcuts published to their active teams")
    else:
        raise HTTPException(status_code=403, detail="Only administrators and team leaders can delete shared shortcuts")
        
    db.delete(shortcut)
    db.commit()
    return {"status": "ok"}


# --- NOTIFICATIONS ---

@app.get('/api/notifications')
def get_notifications(category: Optional[str] = None, user_id: int = Depends(get_current_user_id), db: Session = Depends(get_db)):
    query = db.query(Notification).filter(
        Notification.user_fk == user_id,
        Notification.deleted_at == None
    )
    if category and category != 'all':
        query = query.filter(Notification.category == category)
    notifs = query.order_by(Notification.id.desc()).limit(50).all()
    return [serialize_model(n, db) for n in notifs]

@app.post('/api/notifications')
def create_notification(body: dict, user_id: int = Depends(get_current_user_id), db: Session = Depends(get_db)):
    # Standardize notification posting
    target_username = body.get('user_id')  # FE passes user_id as string (which represents username or user ID)
    target_user = db.query(User).filter((User.id == target_username) | (User.username == target_username)).first()
    if not target_user:
        raise HTTPException(status_code=400, detail="Target user not found")
        
    now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    new_notif = Notification(
        user_fk=target_user.id,
        message=body.get('message'),
        is_read=0,
        created_at=now,
        related_task_id=body.get('related_task_id'),
        category=body.get('category', 'general'),
        deleted_at=None
    )
    db.add(new_notif)
    db.commit()
    return {"status": "ok"}

@app.put('/api/notifications/mark-all-read')
def mark_all_notifications_read(user_id: int = Depends(get_current_user_id), db: Session = Depends(get_db)):
    count = db.query(Notification).filter(
        Notification.user_fk == user_id,
        Notification.is_read == 0,
        Notification.deleted_at == None
    ).update({'is_read': 1}, synchronize_session=False)
    db.commit()
    return {"status": "ok", "count": count}

@app.put('/api/notifications/{notif_id}')
def mark_notification_read(notif_id: int, body: dict, user_id: int = Depends(get_current_user_id), db: Session = Depends(get_db)):
    notif = db.query(Notification).filter(Notification.id == notif_id, Notification.user_fk == user_id).first()
    if notif:
        notif.is_read = body.get('is_read', 0)
        db.commit()
    return {"status": "ok"}

@app.delete('/api/notifications/clear-read')
def clear_read_notifications(user_id: int = Depends(get_current_user_id), db: Session = Depends(get_db)):
    now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    count = db.query(Notification).filter(
        Notification.user_fk == user_id,
        Notification.is_read == 1,
        Notification.deleted_at == None
    ).update({'deleted_at': now}, synchronize_session=False)
    db.commit()
    return {"status": "ok", "count": count}

@app.delete('/api/notifications/{notif_id}')
def delete_notification(notif_id: int, user_id: int = Depends(get_current_user_id), db: Session = Depends(get_db)):
    notif = db.query(Notification).filter(
        Notification.id == notif_id,
        Notification.user_fk == user_id
    ).first()
    if notif:
        notif.deleted_at = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        db.commit()
    return {"status": "ok"}

# --- MESSAGES / CHAT ---

@app.get('/api/messages')
def get_messages(channel: Optional[str] = None, db: Session = Depends(get_db)):
    query = db.query(Message)
    if channel: query = query.filter(Message.channel_name == channel)
    messages = query.order_by(Message.id.asc()).all()
    return [serialize_model(m, db) for m in messages]

@app.post('/api/messages')
def create_message(body: dict, user_id: int = Depends(get_current_user_id), db: Session = Depends(get_db)):
    u = db.query(User).filter(User.id == user_id).first()
    new_msg = Message(
        channel_name=body.get('channel_name'), 
        sender_id=u.id,
        content=body.get('content'), 
        timestamp=datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    )
    db.add(new_msg)
    db.commit()
    return {"status": "ok", "id": new_msg.id}

# --- SLA BREEDING ENGINE & ALERTS API ---

def get_task_sla_status(task: Task):
    if task.status == 'done':
        return "normal"
        
    accepted_dt = None
    if task.accepted_at:
        for fmt in ('%Y-%m-%d %H:%M:%S', '%Y-%m-%dT%H:%M:%S', '%Y-%m-%d'):
            try:
                accepted_dt = datetime.strptime(task.accepted_at, fmt)
                break
            except ValueError:
                continue
    
    hours_active = 0
    if accepted_dt:
        hours_active = (datetime.now() - accepted_dt).total_seconds() / 3600
        
    due_dt = None
    if task.due_date:
        try:
            due_dt = datetime.strptime(task.due_date[:10], '%Y-%m-%d')
        except ValueError:
            pass
            
    is_past_due = False
    if due_dt and datetime.now().date() > due_dt.date():
        is_past_due = True
        
    if hours_active >= 168 or is_past_due:
        return "breach"
    elif hours_active >= 72 and task.status != 'review':
        return "warning"
    return "normal"

@app.get('/api/sla/breaches')
def get_sla_breaches(current_user_id: int = Depends(get_current_user_id), db: Session = Depends(get_db)):
    if not (has_permission('analytics.read_team', current_user_id, db) or has_permission('analytics.read_all', current_user_id, db)):
        raise HTTPException(status_code=403, detail="SLA breaches are only visible to Leaders and Administrators")
        
    if not has_permission('analytics.read_all', current_user_id, db):
        user_team_ids = get_user_team_ids(db, current_user_id)
        active_tasks = db.query(Task).filter(Task.status != 'done', Task.team_id.in_(user_team_ids)).all()
    else:
        active_tasks = db.query(Task).filter(Task.status != 'done').all()
        
    breached_tasks = []
    for t in active_tasks:
        status = get_task_sla_status(t)
        if status in ["warning", "breach"]:
            d = serialize_model(t, db)
            d["sla_status"] = status
            breached_tasks.append(d)
            
    return breached_tasks

async def check_sla_rules(db: Session):
    active_tasks = db.query(Task).filter(Task.status != 'done').all()
    now_str = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    
    for task in active_tasks:
        status = get_task_sla_status(task)
        if status == "normal":
            continue
            
        # Determine msg based on breach alert
        if status == "breach":
            accepted_dt = None
            if task.accepted_at:
                for fmt in ('%Y-%m-%d %H:%M:%S', '%Y-%m-%dT%H:%M:%S', '%Y-%m-%d'):
                    try:
                        accepted_dt = datetime.strptime(task.accepted_at, fmt)
                        break
                    except ValueError:
                        continue
            hours_active = 0
            if accepted_dt:
                hours_active = (datetime.now() - accepted_dt).total_seconds() / 3600
                
            due_dt = None
            if task.due_date:
                try: due_dt = datetime.strptime(task.due_date[:10], '%Y-%m-%d')
                except: pass
            
            if due_dt and datetime.now().date() > due_dt.date():
                msg = f"SLA Breach: Task '{task.title}' has exceeded its due date deadline ({task.due_date})."
            else:
                msg = f"SLA Breach: Task '{task.title}' is active for {int(hours_active)} hours (exceeds 168h SLA)."
        else:  # warning
            accepted_dt = None
            if task.accepted_at:
                for fmt in ('%Y-%m-%d %H:%M:%S', '%Y-%m-%dT%H:%M:%S', '%Y-%m-%d'):
                    try:
                        accepted_dt = datetime.strptime(task.accepted_at, fmt)
                        break
                    except ValueError:
                        continue
            hours_active = 0
            if accepted_dt:
                hours_active = (datetime.now() - accepted_dt).total_seconds() / 3600
            msg = f"SLA Warning: Task '{task.title}' is active for {int(hours_active)} hours without review."
            
        # Check if we already notified this task for this exact alert message
        existing_notif = db.query(Notification).filter_by(
            related_task_id=task.id,
            message=msg
        ).first()
        
        if not existing_notif:
            # Resolve team leaders for assignee's team
            leaders = []
            if task.assignee_id:
                pt = db.query(UserTeam).filter_by(user_id=task.assignee_id, is_primary=True).first()
                if pt:
                    # Dynamic check: Resolve team leaders for assignee's team who have task.approve permission
                    team_users = db.query(User).join(UserTeam).filter(
                        UserTeam.team_id == pt.team_id,
                        User.is_active == 1
                    ).all()
                    leaders = [u for u in team_users if has_permission("task.approve", u.id, db)]
                    
            # Send notification to assigned team member
            if task.assignee_id:
                db.add(Notification(user_fk=task.assignee_id, message=msg, created_at=now_str, related_task_id=task.id))
                
            # Send notification to member's team leader(s)
            for leader in leaders:
                db.add(Notification(user_fk=leader.id, message=msg, created_at=now_str, related_task_id=task.id))
                
            # Write audit log entry
            db.add(AuditLog(
                timestamp=now_str,
                username="System",
                user_role="system",
                action="SLA Escalation",
                details=f"Task '{task.title}' (ID {task.id}): {msg}"
            ))
            db.commit()

async def sla_breach_monitor_loop():
    logger.info("Starting SLA Breach Tracking engine...")
    while True:
        try:
            db = SessionLocal()
            try:
                await check_sla_rules(db)
            finally:
                db.close()
        except Exception as e:
            logger.error("Error in SLA breach monitor background thread: %s", e, exc_info=True)
        await asyncio.sleep(60)

@app.on_event("startup")
async def startup_event():
    # Run migrations and metadata schemas locally on startup if need be
    # Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        try:
            db.execute(text("ALTER TABLE projects ADD COLUMN shortcuts TEXT;"))
            db.commit()
            logger.info("Database migration: Added 'shortcuts' column to 'projects' table.")
        except Exception as alter_err:
            db.rollback()
            logger.info(f"Database migration note: 'shortcuts' column check completed (already exists or skipped): {alter_err}")
            
        db.query(Role).filter_by(name="leader").update({"label": "Lead"})
        db.query(Role).filter_by(name="member").update({"label": "Member"})
        db.commit()
    except Exception as e:
        logger.error(f"Failed to migrate role labels: {e}")
        db.rollback()
    finally:
        db.close()
        
    asyncio.create_task(sla_breach_monitor_loop())

# --- FRONTEND SINGLE PAGE APP (SPA) WILD-CARD PATH SERVING ---

@app.get("/{catchall:path}")
async def serve_spa(catchall: str):
    if catchall.startswith("api/"):
        raise HTTPException(status_code=404, detail="API endpoint not found")
        
    # Check if this maps to a valid filesystem path (relative to repo root)
    filepath = os.path.join(".", catchall)
    if os.path.isfile(filepath):
        return FileResponse(filepath)
        
    return FileResponse("index.html")

if __name__ == '__main__':
    import uvicorn
    logger.info("Starting BI Manager Uvicorn Server on port 8080...")
    uvicorn.run(app, host="0.0.0.0", port=8080)
