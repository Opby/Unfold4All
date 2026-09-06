"""Settings, loaded from environment with a pipeline/.env fallback."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

PIPELINE_DIR = Path(__file__).resolve().parent.parent
REPO_ROOT = PIPELINE_DIR.parent
REGISTRY_PATH = REPO_ROOT / "sources" / "registry.yaml"
MIGRATIONS_DIR = PIPELINE_DIR / "migrations"

EMBED_MODEL = "voyage-4-lite"
EMBED_DIMS = 1024


def _load_dotenv(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        os.environ.setdefault(key.strip(), value.strip())


@dataclass(frozen=True)
class Settings:
    database_url: str
    voyage_api_key: str  # may be empty; only `embed` requires it


def load_settings() -> Settings:
    _load_dotenv(PIPELINE_DIR / ".env")
    database_url = os.environ.get("DATABASE_URL", "")
    if not database_url:
        raise SystemExit(
            "DATABASE_URL is not set (env or pipeline/.env). "
            "Create a Neon project and copy its connection string."
        )
    return Settings(
        database_url=database_url,
        voyage_api_key=os.environ.get("VOYAGE_API_KEY", ""),
    )
