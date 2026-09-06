import { getPool, indexAvailable } from "./pg";
import type { SourceCard, TierMix } from "./types";

/** Fire-and-forget FR9 logging; failures are logged, never surfaced. */
export function logQuery(entry: {
  query: string;
  paths: ("index" | "live")[];
  tierMix: TierMix;
  sources: SourceCard[];
  latencyMs: number;
}): void {
  if (!indexAvailable()) return;
  getPool()
    .query(
      `INSERT INTO query_logs (query, paths, tier_mix, source_urls, latency_ms)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        entry.query,
        JSON.stringify(entry.paths),
        JSON.stringify(entry.tierMix),
        JSON.stringify(entry.sources.map((s) => s.url)),
        entry.latencyMs,
      ],
    )
    .catch((err) => console.error("query_logs insert failed:", err));
}
