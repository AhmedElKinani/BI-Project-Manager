import hashlib
import os

from database import Base, SessionLocal, engine
from models import AuditLog, History, Message, Notification, Project, Task, TaskComment, User


def hash_password(pw: str) -> str:
    return hashlib.sha256(pw.encode()).hexdigest()


def seed_production_admin() -> None:
    admin_username = os.environ.get("SEED_ADMIN_USER", "admin")
    admin_password = os.environ.get("SEED_ADMIN_PASSWORD", "Welcome@123")
    admin_team = os.environ.get("SEED_ADMIN_TEAM", "Management")

    # Ensure schema exists on brand-new deployments.
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    try:
        # Wipe app data for a fresh production start.
        db.query(TaskComment).delete()
        db.query(Task).delete()
        db.query(History).delete()
        db.query(Project).delete()
        db.query(AuditLog).delete()
        db.query(Notification).delete()
        db.query(Message).delete()
        db.query(User).delete()

        # Create one admin user with the same hashing strategy as backend login.
        db.add(
            User(
                username=admin_username,
                password=hash_password(admin_password),
                role="admin",
                team=admin_team,
            )
        )
        db.commit()
    finally:
        db.close()

    print("Production seed applied successfully to PostgreSQL.")
    print("All projects/tasks/history/messages/logs were reset.")
    print(f"Available user: {admin_username} / {admin_password}")


if __name__ == "__main__":
    seed_production_admin()
