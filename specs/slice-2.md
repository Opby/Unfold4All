# specs/slice-2.md — curated index + Python ingestion pipeline

Contract spec for Build Slice 2 (see design.md § Build phasing). Slice 1's
wire format (`app/src/lib/types.ts`, specs/slice-1.md §1–2) is unchanged;
this slice fills in `retrievalPath: "index"` and completes hybrid retrieval.

**Slice 2 scope:** a Python pipeline (`pipeline/`) that ingests the registry's
Tier 1–2 web sources into Postgres + pgvector, and an app-side index search
that the sourced path consults *before* live search. Plus the golden eval
query set (`evals/golden.yaml`) — scoring/CI is Slice 3. No deploy changes.

**Graceful absence:** with no `DATABASE_URL` configured, the app behaves
exactly as Slice 1 (live-only). The index is an enhancement, never a
dependency.

---

## 1. Database schema (Postgres + pgvector)

Migrations are plain SQL files in `pipeline/migrations/`, applied in filename
order by `unfold-pipeline migrate` (tracked in a `schema_migrations` table).

```sql
-- 001_init.sql (shape; exact file is authoritative)
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE sources (          -- synced from sources/registry.yaml
  id           serial PRIMARY KEY,
  domain       text UNIQUE NOT NULL,
  name         text NOT NULL,
  tier         int  NOT NULL CHECK (tier BETWEEN 1 AND 4),
  kind         text NOT NULL,
  note         text NOT NULL DEFAULT '',
  origin       text NOT NULL DEFAULT 'curated',  -- curated | discovered
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE documents (
  id           serial PRIMARY KEY,
  source_id    int REFERENCES sources(id) ON DELETE CASCADE,
  url          text UNIQUE NOT NULL,
  title        text NOT NULL DEFAULT '',
  raw_text     text NOT NULL,
  content_hash text NOT NULL,     -- sha256 of raw_text; skip unchanged
  fetched_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE chunks (
  id           serial PRIMARY KEY,
  document_id  int REFERENCES documents(id) ON DELETE CASCADE,
  seq          int NOT NULL,
  text         text NOT NULL,
  embedding    vector(1024),      -- voyage-4-lite, default dims
  UNIQUE (document_id, seq)
);
CREATE INDEX chunks_embedding_idx ON chunks
  USING hnsw (embedding vector_cosine_ops);

CREATE TABLE query_logs (         -- written by the app (FR9), Slice 2+
  id           serial PRIMARY KEY,
  query        text NOT NULL,
  paths        jsonb NOT NULL,    -- e.g. ["index","live"]
  tier_mix     jsonb NOT NULL,
  source_urls  jsonb NOT NULL,
  latency_ms   int,
  created_at   timestamptz NOT NULL DEFAULT now()
);
```

## 2. Pipeline (`pipeline/`, Python 3.12)

Package `unfold_pipeline`, CLI entry `unfold-pipeline` (argparse; installed
via `pip install -e .`). Deps: `trafilatura`, `youtube-transcript-api`,
`voyageai`, `psycopg[binary]`, `pyyaml`, `httpx`. Env from `pipeline/.env`
(`DATABASE_URL`, `VOYAGE_API_KEY`), loaded with a tiny dotenv reader.

Commands (all idempotent; safe to re-run):

| Command | Behavior |
|---|---|
| `migrate` | Apply pending `migrations/*.sql` in order. |
| `sync-registry` | Upsert `sources` rows from `sources/registry.yaml` (by domain). Registry stays the source of truth for tier/kind/note. |
| `crawl [--domain D] [--max-pages N]` | For each Tier 1–2 source (or just D): discover URLs via sitemap.xml, falling back to trafilatura's spider from the homepage; fetch + extract main text with trafilatura; upsert `documents` (skip when `content_hash` unchanged). Default cap 40 pages/domain. Respect robots.txt (trafilatura default) and a ≥1s per-domain delay (NFR3). Sources with `kind: youtube_channel` use `youtube-transcript-api` per video (video list via channel RSS/`yt-dlp`); tolerate zero such sources. |
| `embed [--all]` | Chunk documents lacking chunks (or `--all` re-chunks): split on paragraph boundaries to ~3200 chars (~800 tokens) with ~400-char overlap; embed batches via voyage-4-lite `input_type="document"`; upsert `chunks`. |
| `status` | Print counts per source: documents, chunks, last fetch. |

`sync-registry`, `crawl`, `embed` compose as `unfold-pipeline ingest` (all
three in order) for the common case.

## 3. App-side hybrid retrieval

New module `app/src/lib/index-search.ts`:

- `indexAvailable()`: `DATABASE_URL` set (connection pooled via `pg`).
- `searchIndex(query)`: embed query via Voyage REST (`input_type: "query"`,
  model `voyage-4-lite`); `SELECT` top **8** chunks by cosine distance with
  document + source joins; **drop chunks below similarity 0.40** (the index
  always returns nearest neighbors — without a floor, irrelevant Tier-1
  chunks would defeat honest failure; measured separation: real queries
  ≥0.53, nonsense probes ≤0.36); group survivors by document → candidates
  (`retrievalPath: "index"`, tier/kind/note from `sources`, text = joined
  chunk texts in seq order, score = max similarity).

Changed flow in `/api/chat` (spec §3 of slice-1 otherwise unchanged):

1. `status: searching` (detail "Searching curated index…") → `searchIndex`.
2. **Coverage check:** index path alone suffices when ≥3 chunks have
   similarity ≥ 0.45 spanning ≥2 distinct Tier 1–2 documents. Otherwise run
   the Slice-1 live search too (detail "Searching community sources…") and
   merge candidates (dedupe by URL; index wins ties — it's curated).
3. Classification/selection/answering as in Slice 1. Index candidates carry
   registry tiers already; only live unknowns hit the classifier.
4. After `done`: insert a `query_logs` row (fire-and-forget; failures logged,
   never surfaced).

`SourceCard.retrievalPath` now honestly reports `"index"` or `"live"` per
source. No SSE event changes.

## 4. Eval set (`evals/golden.yaml`)

≥20 Ohlone-domain queries, each with: `query`, `expect_domains` (registry
domains a good answer should cite from), `expect_honest_failure`
(true for the deliberate no-coverage probes — include ≥2), and free-text
`notes`. Schema documented in the file header. Scoring script + CI: Slice 3.

## 5. Env & secrets

- `app/.env.local` gains optional `DATABASE_URL`, `VOYAGE_API_KEY` (both
  absent → Slice-1 behavior; `DATABASE_URL` without `VOYAGE_API_KEY` is a
  startup config error surfaced in logs, index skipped).
- `pipeline/.env` (gitignored) holds the same two; `pipeline/.env.example`
  documents them.

## 6. Acceptance criteria (slice 2 done when)

1. Against a fresh database: `unfold-pipeline migrate && unfold-pipeline
   ingest` completes; `status` shows documents + chunks for ≥3 Tier-1
   domains.
2. Index-served query (e.g. "What is the history of the Ohlone people?")
   answers with ≥1 source card marked `retrievalPath: "index"`, and skips
   live search when coverage is met (log-visible).
3. Thin-coverage query falls through to live search; merged answer works;
   honest failure still triggers on the no-coverage probes.
4. With `DATABASE_URL` unset, behavior is byte-identical Slice 1 (no errors,
   pure live path).
5. `query_logs` rows appear after answers when the DB is configured.
6. Re-running `ingest` is a no-op for unchanged content (hash skip visible in
   output).
7. `evals/golden.yaml` exists with ≥20 queries meeting §4.
