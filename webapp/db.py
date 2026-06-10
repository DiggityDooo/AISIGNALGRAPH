"""SQL migration runner for the AI graph database."""

import sqlite3
import time
from pathlib import Path

from loguru import logger

MIGRATIONS_DIR = Path(__file__).parent / "migrations"


def run_migrations(conn: sqlite3.Connection, migrations_dir: Path = MIGRATIONS_DIR) -> int:
    """Apply pending .sql migrations in filename order.

    Each migration runs in its own transaction; a failure rolls back that
    migration and logs the error without crashing the app. Returns the number
    of migrations applied.
    """
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS schema_version (
            filename TEXT PRIMARY KEY,
            applied_ts INTEGER NOT NULL
        )
        """
    )
    conn.commit()

    applied = {
        row[0] for row in conn.execute("SELECT filename FROM schema_version").fetchall()
    }

    if not migrations_dir.exists():
        return 0

    count = 0
    for sql_file in sorted(migrations_dir.glob("*.sql")):
        if sql_file.name in applied:
            continue
        try:
            script = sql_file.read_text(encoding="utf-8")
        except OSError as exc:
            logger.error("Cannot read migration {}: {}", sql_file.name, exc)
            continue

        try:
            conn.executescript(script)
            conn.execute(
                "INSERT INTO schema_version (filename, applied_ts) VALUES (?, ?)",
                (sql_file.name, int(time.time())),
            )
            conn.commit()
            count += 1
            logger.info("Applied migration {}", sql_file.name)
        except sqlite3.DatabaseError as exc:
            conn.rollback()
            logger.error("Migration {} failed (rolled back): {}", sql_file.name, exc)

    return count
