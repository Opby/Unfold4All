from __future__ import annotations

import psycopg

from .config import MIGRATIONS_DIR, Settings


def connect(settings: Settings) -> psycopg.Connection:
    return psycopg.connect(settings.database_url)


def migrate(conn: psycopg.Connection) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """CREATE TABLE IF NOT EXISTS schema_migrations (
                 name text PRIMARY KEY,
                 applied_at timestamptz NOT NULL DEFAULT now()
               )"""
        )
        cur.execute("SELECT name FROM schema_migrations")
        applied = {row[0] for row in cur.fetchall()}

    for path in sorted(MIGRATIONS_DIR.glob("*.sql")):
        if path.name in applied:
            continue
        print(f"applying {path.name} ...")
        with conn.cursor() as cur:
            cur.execute(path.read_text())
            cur.execute(
                "INSERT INTO schema_migrations (name) VALUES (%s)", (path.name,)
            )
        conn.commit()
    print("migrations up to date")
