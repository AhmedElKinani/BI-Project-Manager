import os
import sqlite3


DB_FILE = os.environ.get("DB_PATH", "/app/data/bi_manager.db")


def seed_production_admin():
    conn = sqlite3.connect(DB_FILE)
    cur = conn.cursor()

    # Keep schema creation minimal and focused on users for production seeding.
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

    # Enforce a clean production auth state with one admin account.
    cur.execute("DELETE FROM users")
    cur.execute(
        "INSERT INTO users (username, password, role, team) VALUES (?, ?, ?, ?)",
        ("admin", "Welcome@123", "admin", "Management"),
    )

    conn.commit()
    conn.close()
    print(f"Production seed applied successfully to: {DB_FILE}")
    print("Available user: admin / Welcome@123")


if __name__ == "__main__":
    seed_production_admin()
