import os
import bcrypt

from database import Base, SessionLocal, engine
from models import (
    AuditLog, History, Message, Notification, Project, Task, TaskComment, User,
    Role, Permission, RolePermission, Team, Phase, TeamPhase, UserTeam, Session, TaskStateLog
)

def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode('utf-8')

def seed_production_admin() -> None:
    admin_username = os.environ.get("SEED_ADMIN_USER", "admin")
    admin_password = os.environ.get("SEED_ADMIN_PASSWORD", "Welcome@123")
    admin_team_name = os.environ.get("SEED_ADMIN_TEAM", "Management")

    # Ensure schema exists on brand-new deployments.
    # Note: Alembic handles actual migrations.
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    try:
        # 1. Roles and Permissions
        # Core Permissions
        perms = [
            ("task.create", "Create Tasks (Legacy)", "Task"),
            ("task.read", "Read Tasks (Legacy)", "Task"),
            ("task.update", "Update Tasks (Legacy)", "Task"),
            ("task.delete", "Delete Tasks (Legacy)", "Task"),
            ("task.approve", "Approve Tasks (Legacy)", "Task"),
            ("task.review_accept", "Accept Tasks (Legacy)", "Task"),
            ("task.review_finish", "Finish Tasks (Legacy)", "Task"),
            ("task.block", "Block Tasks (Legacy)", "Task"),
            ("project.create", "Create Projects (Legacy)", "Project"),
            ("project.read", "Read Projects (Legacy)", "Project"),
            ("project.update", "Update Projects (Legacy)", "Project"),
            ("project.delete", "Delete Projects (Legacy)", "Project"),
            ("project.manage", "Manage Projects/Streams (Legacy)", "Project"),
            ("project.phase_submit", "Submit Phases (Legacy)", "Project"),
            ("project.phase_any", "Any Phase (Legacy)", "Project"),
            ("project.status_manage", "Manage Status (Legacy)", "Project"),
            ("user.manage", "Manage Users (Legacy)", "System"),
            ("audit.read", "Read Audit Logs (Legacy)", "System"),
            ("analytics.read_all", "Read All Analytics (Legacy)", "Analytics"),
            ("analytics.read_team", "Read Team Analytics (Legacy)", "Analytics"),
            ("analytics.read_own", "Read Own Analytics (Legacy)", "Analytics"),
            ("admin.panel", "Access Admin Panel (Legacy)", "System"),
            ("config.manage", "Manage Configuration (Legacy)", "System"),
            ("messages.read", "Read Comms/Messages (Legacy)", "System"),
            ("messages.create", "Post Comms/Messages (Legacy)", "System"),
            
            # Apache Superset-style Permissions
            ("can_create:Task", "Can Create Task", "Task"),
            ("can_read:Task", "Can Read Task", "Task"),
            ("can_write:Task", "Can Write Task", "Task"),
            ("can_delete:Task", "Can Delete Task", "Task"),
            ("can_approve:Task", "Can Approve Task", "Task"),
            ("can_accept:Task", "Can Accept Task", "Task"),
            ("can_finish:Task", "Can Finish Task", "Task"),
            ("can_block:Task", "Can Block Task", "Task"),
            ("can_read_all_tasks:Task", "Can Read All Tasks", "Task"),
            ("can_read_team_tasks:Task", "Can Read Team Tasks", "Task"),
            ("can_read_own_tasks:Task", "Can Read Own Tasks Only", "Task"),
            ("can_create:Project", "Can Create Project", "Project"),
            ("can_read:Project", "Can Read Project", "Project"),
            ("can_write:Project", "Can Write Project", "Project"),
            ("can_delete:Project", "Can Delete Project", "Project"),
            ("can_manage:Project", "Can Manage Project/Streams", "Project"),
            ("can_submit_phase:Project", "Can Submit Phase", "Project"),
            ("can_any_phase:Project", "Can Any Phase", "Project"),
            ("can_manage_status:Project", "Can Manage Status", "Project"),
            ("can_read_all_phases:Phase", "Can Read All Phases", "Phase"),
            ("can_read_team_phases:Phase", "Can Read Team Associated Phases", "Phase"),
            ("can_read_all_projects:Project", "Can Read All Projects", "Project"),
            ("can_read_team_projects:Project", "Can Read Team Projects", "Project"),
            ("can_read_own_projects:Project", "Can Read Own Projects Only", "Project"),
            ("can_manage:User", "Can Manage Users", "System"),
            ("menu_access:AuditLog", "Access Audit Log Menu", "System"),
            ("can_read_all:Task", "Can Read All Task Analytics", "Analytics"),
            ("can_read_team:Task", "Can Read Team Task Analytics", "Analytics"),
            ("can_read_own:Task", "Can Read Own Task Analytics", "Analytics"),
            ("menu_access:AdminPanel", "Access Admin Panel Menu", "System"),
            ("can_manage:Config", "Can Manage Configuration", "System"),
            ("menu_access:Comms", "Access Comms/Messages Menu", "System"),
            ("can_create:Message", "Can Post Comms/Messages", "System")
        ]
        
        for code, label, grp in perms:
            if not db.query(Permission).filter_by(code=code).first():
                db.add(Permission(code=code, label=label, grp=grp))
        db.commit()
        
        # Roles
        roles = [
            ("admin", "Administrator", True),
            ("leader", "Team Leader", True),
            ("member", "Team Member", True)
        ]
        
        for name, label, is_system in roles:
            if not db.query(Role).filter_by(name=name).first():
                db.add(Role(name=name, label=label, is_system=is_system))
        db.commit()

        # Role Permissions mapping
        admin_role = db.query(Role).filter_by(name="admin").first()
        leader_role = db.query(Role).filter_by(name="leader").first()
        member_role = db.query(Role).filter_by(name="member").first()
        all_perms = db.query(Permission).all()

        # Admin gets all
        for p in all_perms:
            if not db.query(RolePermission).filter_by(role_id=admin_role.id, permission_id=p.id).first():
                db.add(RolePermission(role_id=admin_role.id, permission_id=p.id))
        
        # Leader gets specific
        leader_codes = [
            "task.create", "task.read", "task.update", "task.delete", "task.approve", "task.review_accept", "task.review_finish", "task.block",
            "project.read", "project.update", "project.manage", "project.phase_submit", "project.status_manage",
            "analytics.read_team", "analytics.read_own", "messages.read", "messages.create",
            
            # Apache Superset equivalents
            "can_create:Task", "can_read:Task", "can_write:Task", "can_delete:Task", "can_approve:Task", "can_accept:Task", "can_finish:Task", "can_block:Task",
            "can_read:Project", "can_write:Project", "can_manage:Project", "can_submit_phase:Project", "can_manage_status:Project",
            "can_read_team:Task", "can_read_own:Task", "menu_access:Comms", "can_create:Message",
            "can_read_all_tasks:Task", "can_read_team_tasks:Task", "can_read_own_tasks:Task", "can_read_all_phases:Phase", "can_read_team_phases:Phase",
            "can_read_all_projects:Project", "can_read_team_projects:Project", "can_read_own_projects:Project"
        ]
        for p in all_perms:
            if p.code in leader_codes:
                if not db.query(RolePermission).filter_by(role_id=leader_role.id, permission_id=p.id).first():
                    db.add(RolePermission(role_id=leader_role.id, permission_id=p.id))

        # Member gets specific
        member_codes = [
            "task.create", "task.read", "task.update", "task.block", "project.read",
            "analytics.read_own", "messages.read", "messages.create",
            
            # Apache Superset equivalents
            "can_create:Task", "can_read:Task", "can_write:Task", "can_block:Task", "can_read:Project",
            "can_read_own:Task", "menu_access:Comms", "can_create:Message",
            "can_read_all_tasks:Task", "can_read_own_tasks:Task", "can_read_team_tasks:Task", "can_read_team_phases:Phase",
            "can_read_all_projects:Project", "can_read_team_projects:Project", "can_read_own_projects:Project"
        ]
        for p in all_perms:
            if p.code in member_codes:
                if not db.query(RolePermission).filter_by(role_id=member_role.id, permission_id=p.id).first():
                    db.add(RolePermission(role_id=member_role.id, permission_id=p.id))
        
        db.commit()

        # 2. Teams
        teams = ["Management", "Development Team", "Data Engineering Team", "Data Science/Analysis Team"]
        for t in teams:
            if not db.query(Team).filter_by(name=t).first():
                db.add(Team(name=t, color="#6366f1"))
        db.commit()

        # 3. Phases
        phases = [
            ("Business Understanding", "color-biz", False),
            ("Data Understanding", "color-data", False),
            ("Data Preparation", "color-prep", False),
            ("Modeling", "color-model", False),
            ("Evaluation", "color-eval", False),
            ("Deployment", "color-dep", False),
            ("Security & Governance", "color-sec", False),
            ("Deployed and in Use", "color-live", True)
        ]
        for i, (name, color, is_terminal) in enumerate(phases):
            if not db.query(Phase).filter_by(name=name).first():
                db.add(Phase(name=name, color_class=color, display_order=i, is_terminal=is_terminal))
        db.commit()

        # 4. Admin User
        admin_team = db.query(Team).filter_by(name=admin_team_name).first()
        if not admin_team:
            admin_team = Team(name=admin_team_name)
            db.add(admin_team)
            db.commit()

        admin_user = db.query(User).filter_by(username=admin_username).first()
        if not admin_user:
            admin_user = User(
                username=admin_username,
                password=hash_password(admin_password),
                role_id=admin_role.id,
                needs_rehash=False,
                is_active=1
            )
            db.add(admin_user)
            db.commit()
            
            db.add(UserTeam(user_id=admin_user.id, team_id=admin_team.id, is_primary=True))
            db.commit()
        else:
            # Update password and role if it already exists
            admin_user.password = hash_password(admin_password)
            admin_user.role_id = admin_role.id
            admin_user.needs_rehash = False
            db.commit()

    finally:
        db.close()

    print("Production seed applied successfully to PostgreSQL.")
    print("Core roles, permissions, teams, and phases created.")
    print(f"Available admin user: {admin_username} / {admin_password}")

if __name__ == "__main__":
    seed_production_admin()
