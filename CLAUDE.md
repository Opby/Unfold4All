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
  `ANTHROPIC_API_KEY`; `TAVILY_API_KEY` optional — keyless mode is rate-limited).
- Checks: `cd app && npx tsc --noEmit && npm run lint`.

## Current stage

Build Slice 1 (on-the-fly retrieval, no DB). Slice 2 adds the Python pipeline
+ pgvector index; Slice 3 adds intro page, evals in CI, Vercel deploy
(remember `outputFileTracingIncludes` for `sources/registry.yaml` and
`app/src/prompts/*.md`).
