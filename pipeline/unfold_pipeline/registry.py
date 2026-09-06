"""Sync sources/registry.yaml into the sources table (registry stays truth)."""

from __future__ import annotations

from dataclasses import dataclass

import psycopg
import yaml

from .config import REGISTRY_PATH


@dataclass(frozen=True)
class RegistryEntry:
    domain: str
    name: str
    tier: int
    kind: str
    note: str


def load_registry() -> list[RegistryEntry]:
    data = yaml.safe_load(REGISTRY_PATH.read_text())
    return [
        RegistryEntry(
            domain=d["domain"],
            name=d["name"],
            tier=int(d["tier"]),
            kind=d["kind"],
            note=str(d.get("note", "")).strip(),
        )
        for d in data["domains"]
    ]


def sync_registry(conn: psycopg.Connection) -> None:
    entries = load_registry()
    with conn.cursor() as cur:
        for e in entries:
            cur.execute(
                """INSERT INTO sources (domain, name, tier, kind, note, origin)
                   VALUES (%s, %s, %s, %s, %s, 'curated')
                   ON CONFLICT (domain) DO UPDATE SET
                     name = EXCLUDED.name, tier = EXCLUDED.tier,
                     kind = EXCLUDED.kind, note = EXCLUDED.note,
                     updated_at = now()""",
                (e.domain, e.name, e.tier, e.kind, e.note),
            )
    conn.commit()
    print(f"synced {len(entries)} registry entries")


def crawlable_sources(conn: psycopg.Connection) -> list[tuple[int, str, str]]:
    """(id, domain, kind) for Tier 1-2 sources — the curated corpus."""
    with conn.cursor() as cur:
        cur.execute(
            "SELECT id, domain, kind FROM sources WHERE tier IN (1, 2) ORDER BY domain"
        )
        return list(cur.fetchall())
