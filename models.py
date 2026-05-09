from sqlalchemy import Column, Integer, String, Text, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from database import Base
import datetime

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    password = Column(String)
    role = Column(String)
    team = Column(String)

class Project(Base):
    __tablename__ = "projects"
    id = Column(String, primary_key=True, index=True)
    title = Column(String)
    description = Column(Text)
    phase = Column(String)
    team = Column(String)
    assignee = Column(String)
    progress = Column(Integer)
    blockers = Column(Text)
    nextStep = Column(Text)
    start_date = Column(String)
    target_date = Column(String)
    is_deployed = Column(Integer, default=0)
    iteration = Column(Integer, default=1)
    is_iterating = Column(Integer, default=0)
    short_description = Column(Text)
    full_description = Column(Text)
    stakeholders = Column(Text)
    
    tasks = relationship("Task", back_populates="project", cascade="all, delete-orphan")
    history = relationship("History", back_populates="project", cascade="all, delete-orphan")

class Task(Base):
    __tablename__ = "tasks"
    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(String, ForeignKey("projects.id", ondelete="CASCADE"))
    title = Column(String, nullable=False)
    description = Column(Text)
    crisp_dm_phase = Column(String)
    assignee = Column(String)
    team = Column(String)
    status = Column(String, default="todo")
    created_by = Column(String)
    created_at = Column(String, default=lambda: datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S'))
    approval_status = Column(String, default="approved")
    acceptance_status = Column(String, default="pending_acceptance")
    start_date = Column(String)
    due_date = Column(String)
    resolution_note = Column(Text)
    completed_by = Column(String)
    resolved_at = Column(String)
    accepted_at = Column(String)
    
    project = relationship("Project", back_populates="tasks")
    comments = relationship("TaskComment", back_populates="task", cascade="all, delete-orphan")

class History(Base):
    __tablename__ = "history"
    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(String, ForeignKey("projects.id", ondelete="CASCADE"))
    date = Column(String)
    phase = Column(String)
    status = Column(String)
    note = Column(Text)

    project = relationship("Project", back_populates="history")

class TaskComment(Base):
    __tablename__ = "task_comments"
    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(Integer, ForeignKey("tasks.id", ondelete="CASCADE"))
    author = Column(String)
    content = Column(Text)
    created_at = Column(String, default=lambda: datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S'))
    
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
    user_id = Column(String, index=True)
    message = Column(Text)
    is_read = Column(Integer, default=0)
    created_at = Column(String)
    related_task_id = Column(Integer)

class Message(Base):
    __tablename__ = "messages"
    id = Column(Integer, primary_key=True, autoincrement=True)
    channel_name = Column(String, index=True)
    sender = Column(String)
    content = Column(Text)
    timestamp = Column(String)
