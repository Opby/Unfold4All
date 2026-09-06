# unfold4all.org

Demo that AI bias is corrected by better *context*: chat answers grounded in
community-authored primary sources, streamed side-by-side with a no-retrieval
baseline, with sources and selection reasoning shown explicitly.

## Process

This repo follows the AI-native SDLC playbook. Read in order when context is
needed: `intent.md` (what/why/constraints) → `requirements.md` (FR1–FR9,
NFR1–NFR5) → `design.md` (architecture, tiers, phasing) → `specs/slice-N.md`
(per-slice contracts). Spec deviations must update the spec in the same commit.

## Conventions

- `app/src/lib/types.ts` is the single source of truth for the wire format
  (SSE events, SourceCard, TierMix). The UI, API, and future Python pipeline
  conform to it.
- Prompts (`app/src/prompts/*.md`) are product surface — review changes like
  code. The tier rubric lives in `design.md` and `tier-classifier.md`.
- `sources/registry.yaml` pins trust tiers for known domains; retrieval
  behavior must be tunable by registry edits alone, no code changes.
- Answer model: `claude-opus-5` (same model both panes — the comparison must
  isolate context, not model quality). Classifier: `claude-haiku-4-5`.
- Tier semantics: 1 community-authored, 2 community-collaborative, 3 secondary
  scholarship, 4 generic web (labeled gap-filler only). When no Tier 1–2
  sources exist, the answer says so (honest failure) — never fake coverage.

## Commands

- Dev server: `cd app && npm run dev` (needs `app/.env.local` with
  `ANTHROPIC_API_KEY`; `TAVILY_API_KEY` optional — keyless mode is rate-limited;
  optional `DATABASE_URL` + `VOYAGE_API_KEY` pair enables the curated index —
  without them the app runs live-only, by design).
- Checks: `cd app && npx tsc --noEmit && npm run lint`.
- Pipeline setup: `python3 -m venv pipeline/.venv && pipeline/.venv/bin/pip
  install -e pipeline` (Python ≥3.12; `pipeline/.env` needs `DATABASE_URL`,
  `VOYAGE_API_KEY`).
- Index build: `pipeline/.venv/bin/unfold-pipeline migrate` then `... ingest
  [--max-pages N]`; inspect with `... status [--logs]`. All commands are
  idempotent (sha256 hash-skip).

## Current stage

Slice 2 (pipeline + pgvector index, hybrid retrieval, golden eval set) built
on branch `slice-2-pipeline`. Slice 3 adds intro page, eval scoring in CI,
Vercel deploy (remember `outputFileTracingIncludes` for
`sources/registry.yaml` and `app/src/prompts/*.md`).
