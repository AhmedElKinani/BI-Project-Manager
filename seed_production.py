import os
import sqlite3


DB_FILE = os.environ.get("DB_PATH", "/app/data/bi_manager.db")


def seed_production_admin():
    conn = sqlite3.connect(DB_FILE)
    cur = conn.cursor()
    cur.execute("PRAGMA foreign_keys = OFF")

    # Keep schema creation minimal but complete enough for a clean production reset.
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE,
            password TEXT,
            role TEXT,
            team TEXT
        )
        """
    )
    cur.execute(
        """
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
            target_date TEXT,
            is_deployed INTEGER DEFAULT 0,
            iteration INTEGER DEFAULT 1,
            is_iterating INTEGER DEFAULT 0,
            short_description TEXT,
            full_description TEXT,
            stakeholders TEXT
        )
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id TEXT,
            date TEXT,
            phase TEXT,
            status TEXT,
            note TEXT
        )
        """
    )
    cur.execute(
        """
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
            resolution_note TEXT,
            completed_by TEXT,
            approval_status TEXT DEFAULT 'approved',
            acceptance_status TEXT DEFAULT 'accepted',
            due_date TEXT,
            accepted_at TEXT,
            resolved_at TEXT,
            start_date TEXT
        )
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS task_comments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            task_id INTEGER,
            author TEXT,
            content TEXT,
            created_at TEXT
        )
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS audit_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT,
            username TEXT,
            user_role TEXT,
            action TEXT,
            details TEXT
        )
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT,
            message TEXT,
            is_read INTEGER DEFAULT 0,
            created_at TEXT,
            related_task_id INTEGER
        )
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            channel_name TEXT,
            sender TEXT,
            content TEXT,
            timestamp TEXT
        )
        """
    )

    # Wipe app data for a fresh production start.
    cur.execute("DELETE FROM task_comments")
    cur.execute("DELETE FROM tasks")
    cur.execute("DELETE FROM history")
    cur.execute("DELETE FROM projects")
    cur.execute("DELETE FROM audit_logs")
    cur.execute("DELETE FROM notifications")
    cur.execute("DELETE FROM messages")
    cur.execute("DELETE FROM users")

    # Reset autoincrement counters where applicable.
    cur.execute(
        "DELETE FROM sqlite_sequence WHERE name IN "
        "('users','history','tasks','task_comments','audit_logs','notifications','messages')"
    )

    # Enforce a clean production auth state with one admin account.
    cur.execute(
        "INSERT INTO users (username, password, role, team) VALUES (?, ?, ?, ?)",
        ("admin", "Welcome@123", "admin", "Management"),
    )

    cur.execute("PRAGMA foreign_keys = ON")
    conn.commit()
    conn.close()
    print(f"Production seed applied successfully to: {DB_FILE}")
    print("All projects/tasks/history/messages/logs were reset.")
    print("Available user: admin / Welcome@123")


if __name__ == "__main__":
    seed_production_admin()
