# design.md — unfold4all.org architecture

Design stage, 2026-09-02. Satisfies [requirements.md](requirements.md).

## Stack (decided)

| Concern | Choice | Notes |
|---|---|---|
| Web app + API | **Next.js (App Router, TypeScript) on Vercel** | Intro page, chat UI, serverless API routes; streaming via SSE. Custom domain unfold4all.org. |
| Database | **Postgres + pgvector on Neon (free tier)** | One DB for source registry, chunks + embeddings, query logs. |
| Answering LLM | **Claude API, `claude-opus-5`** | Streaming, adaptive thinking (default). Same model for baseline and sourced answers so the comparison isolates *context*, not model quality. |
| Tier classifier | **`claude-haiku-4-5`** | Cheap per-source classification calls where the registry doesn't already decide the tier. |
| Embeddings | **Voyage AI (`voyage-4-lite`)** | Claude API has no embeddings endpoint; Voyage is the standard pairing. Free tier covers a demo-size corpus. Used by both the Python pipeline (indexing) and the app (query embedding, via REST). |
| On-the-fly search | **Tavily API** | Domain include/exclude lists implement tier preferences; built-in content extraction. |
| Ingestion pipeline | **Python 3.12** (`pipeline/`) | `trafilatura` (web extraction), `youtube-transcript-api`/`yt-dlp` (transcripts), `voyageai`, `psycopg`. Run manually / cron at launch. |

## Repo layout

```
unfold4all/
  intent.md  requirements.md  design.md  CLAUDE.md
  app/          # Next.js project (web + API routes)
  pipeline/     # Python ingestion (own pyproject.toml)
  sources/      # source registry: registry.yaml (+ per-domain files later)
  evals/        # golden query set + scoring script
```

## Data model (Postgres)

- **sources** — the registry, synced from `sources/registry.yaml`: id, name, url,
  domain, `kind` (blog | youtube_channel | oral_history | article | site),
  `tier` (1–4), `origin` (curated | discovered), license/robots notes.
- **documents** — one fetched item (page, video transcript): source_id, url,
  title, published_at, fetched_at, raw text hash.
- **chunks** — document_id, seq, text, `embedding vector(…)`, token_count.
  HNSW index on embedding.
- **query_logs** — query, retrieval path(s) used, tier mix, source ids, latency,
  token usage, timestamp.

## Query flow

```
user query
  ├─(parallel)─ BASELINE: claude-opus-5, no retrieval, "answer from your own
  │             knowledge" → streamed to left pane
  └─ SOURCED PATH:
     1. Embed query (Voyage) → pgvector top-k over curated chunks
     2. Coverage check: enough Tier 1–2 material above similarity threshold?
     3. If thin → on-the-fly: Tavily search with include-list of known
        community domains first; second pass unrestricted but with
        tier-demoting rules; extract content of top candidates
     4. Tier classification: registry match wins; otherwise claude-haiku-4-5
        classifies fetched source against the rubric (authorship proximity,
        community endorsement, first-person testimony)
     5. Context assembly: rank by (tier asc, similarity desc), fill budget
        Tier 1 → 2 → 3; Tier 4 only as labeled gap-filler (FR8: if no Tier 1–2,
        say so in the answer)
     6. Answer: claude-opus-5 with assembled context; system prompt requires
        grounding in provided sources only, inline citation markers [1][2],
        and a "why these sources" paragraph → streamed to right pane
     7. Log to query_logs
```

UI shows per-answer metadata: source cards (title, link, kind, tier badge) and
the tier-mix summary ("4 Tier-1 sources; no Tier-4 content used").

## Source-ranking rubric (the core)

Tier is decided by *authorship proximity*, not popularity or polish:

1. **Tier 1 — community-authored:** the community speaking for itself (tribal
   org sites/blogs, their YouTube channels, oral histories, newsletters).
2. **Tier 2 — community-collaborative:** made with the community (long-form
   interviews, co-curated exhibits, journalism quoting members at length).
3. **Tier 3 — secondary scholarship:** academic/archival work *about* them.
4. **Tier 4 — generic web/textbook:** default-search results; gap-filler only,
   always labeled.

Rubric lives here + `sources/registry.yaml` pins tiers for known domains; the
classifier prompt embeds the rubric for unknown sources and must output a tier
plus a one-line justification (surfaced in the UI on hover).

## Evals (woven in from the start, per playbook Test stage)

- `evals/golden.yaml`: ≥20 Ohlone-domain queries with expected source domains
  and topic notes.
- Scoring script (Python) checks per answer: (a) every claim cites a provided
  source id — groundedness via LLM-judge; (b) tier mix meets expectation;
  (c) links resolve. Run locally per PR, then in CI as a deploy gate.

## Build phasing (thin slice first)

1. **Slice 1 — end-to-end on-the-fly:** Next.js app, chat UI, baseline +
   sourced answers using Tavily-only retrieval with registry-seeded domain
   lists. Demoable without any DB content.
2. **Slice 2 — curated index:** pipeline ingests `sources/registry.yaml` for
   the Ohlone domain into pgvector; sourced path consults index first (hybrid
   complete). Eval set built alongside.
3. **Slice 3 — polish + deploy:** intro page content, selection-explanation UX,
   query logging dashboards, CI evals, unfold4all.org on Vercel.

## Risks

- **Community source availability/quality varies** → registry curation is
  manual and ongoing; FR8 keeps the system honest when coverage is thin.
- **YouTube transcript access is brittle** (rate limits, auto-captions quality)
  → treat transcripts as best-effort; prefer channels with real captions.
- **Latency of on-the-fly path** → cache Tavily extractions into `documents`
  so repeated queries warm the index over time.
- **LLM cost creep from comparison mode** → baseline answer capped at modest
  max_tokens; effort dial available if needed.
