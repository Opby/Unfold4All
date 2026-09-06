from __future__ import annotations

import argparse

from . import __version__
from .config import load_settings
from .db import connect, migrate
from .registry import sync_registry


def main() -> None:
    parser = argparse.ArgumentParser(
        prog="unfold-pipeline",
        description="unfold4all ingestion: registry -> crawl -> chunk -> embed -> pgvector",
    )
    parser.add_argument("--version", action="version", version=__version__)
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("migrate", help="apply pending migrations")
    sub.add_parser("sync-registry", help="upsert sources from sources/registry.yaml")

    p_crawl = sub.add_parser("crawl", help="fetch Tier 1-2 sites into documents")
    p_crawl.add_argument("--domain", help="only this registry domain")
    p_crawl.add_argument("--max-pages", type=int, default=40)

    p_embed = sub.add_parser("embed", help="chunk + embed documents lacking chunks")
    p_embed.add_argument("--all", action="store_true", help="re-chunk and re-embed everything")

    p_ingest = sub.add_parser("ingest", help="sync-registry, then crawl, then embed")
    p_ingest.add_argument("--domain", help="only this registry domain")
    p_ingest.add_argument("--max-pages", type=int, default=40)

    p_status = sub.add_parser("status", help="per-source document/chunk counts")
    p_status.add_argument("--logs", action="store_true", help="also show recent query logs")

    args = parser.parse_args()
    settings = load_settings()
    conn = connect(settings)
    try:
        if args.command == "migrate":
            migrate(conn)
        elif args.command == "sync-registry":
            sync_registry(conn)
        elif args.command == "crawl":
            from .crawl import crawl

            crawl(conn, args.domain, args.max_pages)
        elif args.command == "embed":
            from .embed import embed

            embed(conn, settings, args.all)
        elif args.command == "ingest":
            from .crawl import crawl
            from .embed import embed

            sync_registry(conn)
            crawl(conn, args.domain, args.max_pages)
            embed(conn, settings, re_all=False)
        elif args.command == "status":
            from .status import status

            status(conn, args.logs)
    finally:
        conn.close()


if __name__ == "__main__":
    main()
