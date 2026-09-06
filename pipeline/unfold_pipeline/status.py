from __future__ import annotations

import psycopg


def status(conn: psycopg.Connection, show_logs: bool) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """SELECT s.domain, s.tier, count(DISTINCT d.id), count(c.id),
                      max(d.fetched_at)
               FROM sources s
               LEFT JOIN documents d ON d.source_id = s.id
               LEFT JOIN chunks c ON c.document_id = d.id
               GROUP BY s.domain, s.tier ORDER BY s.tier, s.domain"""
        )
        rows = cur.fetchall()
        print(f"{'domain':42} {'tier':>4} {'docs':>5} {'chunks':>7}  last fetch")
        for domain, tier, docs, chunks, fetched in rows:
            ts = fetched.strftime("%Y-%m-%d %H:%M") if fetched else "-"
            print(f"{domain:42} {tier:>4} {docs:>5} {chunks:>7}  {ts}")

        if show_logs:
            cur.execute(
                """SELECT created_at, query, paths, tier_mix->>'summary', latency_ms
                   FROM query_logs ORDER BY id DESC LIMIT 10"""
            )
            logs = cur.fetchall()
            print(f"\nrecent query_logs ({len(logs)}):")
            for created, query, paths, summary, latency in logs:
                print(f"  [{created:%m-%d %H:%M}] ({latency}ms) {paths} {query!r}")
                print(f"      {summary}")
