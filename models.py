import datetime
from sqlalchemy import Column, Integer, String, Text, ForeignKey, DateTime, Boolean, Float, BigInteger
from sqlalchemy.orm import relationship
from database import Base

class Role(Base):
    __tablename__ = "roles"
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(Text, unique=True, nullable=False)
    label = Column(Text, nullable=False)
    is_system = Column(Boolean, default=False, nullable=False)
    is_active = Column(Integer, default=1, nullable=False)
    description = Column(Text)
    created_at = Column(DateTime(timezone=True), default=datetime.datetime.utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    permissions = relationship("RolePermission", back_populates="role", cascade="all, delete-orphan")
    users = relationship("User", back_populates="role_rel")

class Permission(Base):
    __tablename__ = "permissions"
    id = Column(Integer, primary_key=True, autoincrement=True)
    code = Column(Text, unique=True, nullable=False)
    label = Column(Text, nullable=False)
    grp = Column(Text, nullable=False)

class RolePermission(Base):
    __tablename__ = "role_permissions"
    role_id = Column(Integer, ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True)
    permission_id = Column(Integer, ForeignKey("permissions.id", ondelete="CASCADE"), primary_key=True)
    
    role = relationship("Role", back_populates="permissions")
    permission = relationship("Permission")

class Team(Base):
    __tablename__ = "teams"
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(Text, unique=True, nullable=False)
    description = Column(Text)
    color = Column(Text, default="#6366f1", nullable=False)
    is_active = Column(Integer, default=1, nullable=False)
    created_at = Column(DateTime(timezone=True), default=datetime.datetime.utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    phases = relationship("TeamPhase", back_populates="team", cascade="all, delete-orphan")
    users = relationship("UserTeam", back_populates="team", cascade="all, delete-orphan")

class Phase(Base):
    __tablename__ = "phases"
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(Text, unique=True, nullable=False)
    display_order = Column(Integer, default=0, nullable=False)
    color_class = Column(Text, default="color-dep", nullable=False)
    is_terminal = Column(Boolean, default=False, nullable=False)
    is_active = Column(Integer, default=1, nullable=False)
    created_at = Column(DateTime(timezone=True), default=datetime.datetime.utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    teams = relationship("TeamPhase", back_populates="phase", cascade="all, delete-orphan")

class TeamPhase(Base):
    __tablename__ = "team_phases"
    team_id = Column(Integer, ForeignKey("teams.id", ondelete="CASCADE"), primary_key=True)
    phase_id = Column(Integer, ForeignKey("phases.id", ondelete="CASCADE"), primary_key=True)
    
    team = relationship("Team", back_populates="phases")
    phase = relationship("Phase", back_populates="teams")

class UserTeam(Base):
    __tablename__ = "user_teams"
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    team_id = Column(Integer, ForeignKey("teams.id", ondelete="CASCADE"), primary_key=True)
    is_primary = Column(Boolean, default=True, nullable=False)
    joined_at = Column(DateTime(timezone=True), default=datetime.datetime.utcnow, nullable=False)
    
    user = relationship("User", back_populates="teams")
    team = relationship("Team", back_populates="users")

class Session(Base):
    __tablename__ = "sessions"
    id = Column(BigInteger, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    token_hash = Column(Text, unique=True, index=True, nullable=False)
    issued_at = Column(DateTime(timezone=True), default=datetime.datetime.utcnow, nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    revoked = Column(Boolean, default=False, nullable=False)
    
    user = relationship("User")

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    password = Column(String)
    
    # New FK columns
    role_id = Column(Integer, ForeignKey("roles.id", ondelete="SET NULL"))
    is_active = Column(Integer, default=1, nullable=False)
    needs_rehash = Column(Boolean, default=True, nullable=False)
    
    role_rel = relationship("Role", back_populates="users")
    teams = relationship("UserTeam", back_populates="user", cascade="all, delete-orphan")
    dashboard_config = Column(Text, default="{}")

class Project(Base):
    __tablename__ = "projects"
    id = Column(String, primary_key=True, index=True)
    title = Column(String)
    description = Column(Text)
    
    # New FK columns
    status = Column(Text, default="active", nullable=False)
    phase_id = Column(Integer, ForeignKey("phases.id", ondelete="SET NULL"))
    team_id = Column(Integer, ForeignKey("teams.id", ondelete="SET NULL"))
    assignee_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"))
    project_lead_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    
    blockers = Column(Text)
    nextStep = Column(Text)
    start_date = Column(String)
    target_date = Column(String)
    is_deployed = Column(Integer, default=0)
    is_launched = Column(Boolean, default=False, nullable=False)
    iteration = Column(Integer, default=1)
    is_iterating = Column(Integer, default=0)
    short_description = Column(Text)
    full_description = Column(Text)
    stakeholders = Column(Text)
    
    phase_rel = relationship("Phase")
    team_rel = relationship("Team")
    assignee_rel = relationship("User", foreign_keys=[assignee_id])
    lead_rel = relationship("User", foreign_keys=[project_lead_id])
    
    tasks = relationship("Task", back_populates="project", cascade="all, delete-orphan")
    streams = relationship("ProjectStream", back_populates="project", cascade="all, delete-orphan")
    history = relationship("History", back_populates="project", cascade="all, delete-orphan")
    snapshots = relationship("ProjectSnapshot", back_populates="project", cascade="all, delete-orphan")
    actual_end_date = Column(String)
    launch_note = Column(Text)

class Task(Base):
    __tablename__ = "tasks"
    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(String, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    title = Column(String, nullable=False)
    description = Column(Text)
    
    # New FK and tracking columns
    priority = Column(Text, default="medium", nullable=False)
    estimated_hours = Column(Float)
    actual_hours = Column(Float)
    is_blocked = Column(Boolean, default=False, nullable=False)
    blocked_reason = Column(Text)
    phase_id = Column(Integer, ForeignKey("phases.id", ondelete="CASCADE"), nullable=False)
    team_id = Column(Integer, ForeignKey("teams.id", ondelete="SET NULL"))
    assignee_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"))
    created_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"))
    completed_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"))
    
    status = Column(String, default="todo")
    created_at = Column(String, default=lambda: datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S'))
    approval_status = Column(String, default="approved")
    acceptance_status = Column(String, default="pending_acceptance")
    start_date = Column(String)
    due_date = Column(String)
    resolution_note = Column(Text)
    resolved_at = Column(String)
    accepted_at = Column(String)
    post_production = Column(Boolean, default=False, nullable=False)
    rejection_reason = Column(Text)
    review_submitted_at = Column(String)
    reviewed_by = Column(String)
    review_accepted_at = Column(String)
    
    phase_rel = relationship("Phase")
    team_rel = relationship("Team")
    assignee_rel = relationship("User", foreign_keys=[assignee_id])
    created_by_rel = relationship("User", foreign_keys=[created_by_id])
    completed_by_rel = relationship("User", foreign_keys=[completed_by_id])
    
    project = relationship("Project", back_populates="tasks")
    comments = relationship("TaskComment", back_populates="task", cascade="all, delete-orphan")
    state_logs = relationship("TaskStateLog", back_populates="task", cascade="all, delete-orphan")

class TaskStateLog(Base):
    __tablename__ = "task_state_logs"
    id = Column(BigInteger, primary_key=True, autoincrement=True)
    task_id = Column(Integer, ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False, index=True)
    from_state = Column(Text)
    to_state = Column(Text, nullable=False, index=True)
    actor_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"))
    reason = Column(Text)
    entered_at = Column(DateTime(timezone=True), default=datetime.datetime.utcnow, nullable=False)
    exited_at = Column(DateTime(timezone=True))
    
    task = relationship("Task", back_populates="state_logs")

class History(Base):
    __tablename__ = "history"
    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(String, ForeignKey("projects.id", ondelete="CASCADE"))
    date = Column(String)
    phase = Column(String)
    status = Column(String)
    note = Column(Text)
    actor = Column(Text)

    project = relationship("Project", back_populates="history")

class TaskComment(Base):
    __tablename__ = "task_comments"
    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(Integer, ForeignKey("tasks.id", ondelete="CASCADE"))
    author_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"))
    content = Column(Text)
    created_at = Column(String, default=lambda: datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S'))
    
    author_rel = relationship("User")
    task = relationship("Task", back_populates="comments")

class AuditLog(Base):
    __tablename__ = "audit_logs"
    id = Column(Integer, primary_key=True, autoincrement=True)
    timestamp = Column(String)
    username = Column(String)
    user_role = Column(String)
    action = Column(String)
    details = Column(Text)

class Notification(Base):
    __tablename__ = "notifications"
    id = Column(Integer, primary_key=True, autoincrement=True)
    user_fk = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"))
    message = Column(Text)
    is_read = Column(Integer, default=0)
    created_at = Column(String)
    related_task_id = Column(Integer)
    
    user_rel = relationship("User")

class ProjectStream(Base):
    __tablename__ = "project_streams"
    id = Column(Integer, primary_key=True, autoincrement=True)
    project_id = Column(String, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    phase_name = Column(Text, nullable=False)
    team_name = Column(Text, nullable=False)
    status = Column(Text, default="active", nullable=False) # active | complete | on_hold
    progress = Column(Integer, default=0, nullable=False)
    started_at = Column(String)
    completed_at = Column(String)
    completed_by = Column(String)
    notes = Column(Text)
    
    project = relationship("Project", back_populates="streams")

class PhaseComment(Base):
    __tablename__ = "phase_comments"
    id = Column(Integer, primary_key=True, autoincrement=True)
    project_id = Column(String, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    phase_name = Column(Text, nullable=False)
    author_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    submitted_by = Column(Text, nullable=False)  # username snapshot at time of post
    content = Column(Text, nullable=False)
    created_at = Column(String, default=lambda: datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S'))
    
    author_rel = relationship("User")
    project_rel = relationship("Project")

class ProjectSnapshot(Base):
    __tablename__ = "project_snapshots"
    id = Column(Integer, primary_key=True, autoincrement=True)
    project_id = Column(String, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    phase_name = Column(Text, nullable=False)
    summary = Column(Text)
    deliverables = Column(Text)
    completed_at = Column(String)
    completed_by = Column(String)
    created_at = Column(String, default=lambda: datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S'))

    project = relationship("Project", back_populates="snapshots")

class Message(Base):
    __tablename__ = "messages"
    id = Column(Integer, primary_key=True, autoincrement=True)
    channel_name = Column(String, index=True)
    sender_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"))
    content = Column(Text)
    timestamp = Column(String)
    
    sender_rel = relationship("User")

class PublishedShortcut(Base):
    __tablename__ = "published_shortcuts"
    id = Column(Integer, primary_key=True, autoincrement=True)
    title = Column(Text, nullable=False)
    url = Column(Text, nullable=False)
    icon = Column(Text, default="fa-link", nullable=False)
    team_id = Column(Integer, ForeignKey("teams.id", ondelete="CASCADE"), nullable=True)
    creator_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.datetime.utcnow, nullable=False)

class SystemSetting(Base):
    __tablename__ = "system_settings"
    key = Column(String, primary_key=True)
    value = Column(Text, nullable=False)

