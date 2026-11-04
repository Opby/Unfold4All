import { getPool, indexAvailable } from "./pg";
import type { AnswerMetrics, SourceCard, TierMix } from "./types";

/** Fire-and-forget FR9/FR12 logging; failures are logged, never surfaced. */
export function logQuery(entry: {
  query: string;
  paths: ("index" | "live")[];
  tierMix: TierMix;
  sources: SourceCard[];
  latencyMs: number;
  metrics?: AnswerMetrics | null;
}): void {
  if (!indexAvailable()) return;
  const base = [
    entry.query,
    JSON.stringify(entry.paths),
    JSON.stringify(entry.tierMix),
    JSON.stringify(entry.sources.map((s) => s.url)),
    entry.latencyMs,
  ];
  getPool()
    .query(
      `INSERT INTO query_logs (query, paths, tier_mix, source_urls, latency_ms, metrics)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [...base, entry.metrics ? JSON.stringify(entry.metrics) : null],
    )
    .catch((err: Error & { code?: string }) => {
      // 42703: metrics column missing (migration 002 not applied yet) —
      // keep FR9 logging alive rather than dropping the row.
      if (err.code !== "42703") {
        console.error("query_logs insert failed:", err);
        return;
      }
      getPool()
        .query(
          `INSERT INTO query_logs (query, paths, tier_mix, source_urls, latency_ms)
           VALUES ($1, $2, $3, $4, $5)`,
          base,
        )
        .catch((e) => console.error("query_logs insert failed:", e));
    });
}
