# unfold4all.org

**Better context, not a better model: correcting AI bias through source selection.**

Unfold4all is a demo site with an introductory page and a chat interface that
answers questions by deliberately seeking out **primary, community-authored
sources** — and shows its work. Ask about Ohlone history and culture, and the
answer draws on the tribe's own blogs, websites, and YouTube video transcripts
rather than generic search results or textbook summaries. Every answer displays
its sources explicitly and explains why they were chosen.

## Why

Large language models inherit the biases of their training corpora:
institutional, textbook-centric perspectives dominate, while communities' own
voices are underweighted. This project demonstrates that the fix is not a better
model but **better context** — a retrieval pipeline that privileges a
community's own account of itself.

To make the point visible instead of asserted, every query produces a
**side-by-side comparison**: the "default AI" answer (same model, no retrieved
context — raw training priors) next to the context-corrected, community-sourced
answer.

## How it works

Sources are ranked by **authorship proximity**, not popularity:

| Tier | What it is | Example |
|---|---|---|
| 1 — Community-authored | The community speaking for itself | Tribal org sites/blogs, their YouTube channels, oral histories |
| 2 — Community-collaborative | Made *with* the community | Long-form interviews, co-curated exhibits |
| 3 — Secondary scholarship | Academic/archival work *about* the community | Papers, archives |
| 4 — Generic web/textbook | What default search surfaces | Gap-filler only, always labeled |

Retrieval is hybrid: a curated, pre-indexed corpus (Postgres + pgvector) for the
exemplar domain, plus on-the-fly agentic web search (Tavily) with tier-aware
domain rules for everything else. The answer reports its tier mix ("4 Tier-1
sources; no Tier-4 content used") — and when no community sources can be found,
it says so honestly instead of quietly falling back to generic content.

Launch scope is one domain done well: **Ohlone / Bay Area Indigenous history
and culture**. The pipeline is domain-agnostic by design; more domains come
later.

## Stack

Next.js (TypeScript) on Vercel · Postgres + pgvector on Neon · Claude API
(`claude-opus-5`) for answers · Voyage AI embeddings · Tavily search · Python
ingestion pipeline. Details in [design.md](design.md).

## Repository guide

This project follows Anthropic's
[AI-native SDLC playbook](https://academy.claude.com/courses/ai-native-sdlc-playbook) —
intent and design are version-controlled artifacts, built with Claude Code:

| File | Playbook stage | Contents |
|---|---|---|
| [intent.md](intent.md) | Plan | What, why, constraints, decisions |
| [requirements.md](requirements.md) | Design | Functional + non-functional requirements |
| [design.md](design.md) | Design | Architecture, data model, query flow, build phasing |

Planned layout as the Build stage lands: `app/` (Next.js), `pipeline/` (Python
ingestion), `sources/` (source registry), `evals/` (golden query set), `specs/`
(per-slice contracts).

## Status

🚧 Design stage complete; Build stage (Slice 1: end-to-end chat with on-the-fly
retrieval) is next.

## Ethics & attribution

This site surfaces and cites communities' own materials; it does not claim to
speak for any community. Ingestion respects robots.txt and content licenses,
every source links back to its origin, and no community content is rehosted in
full.
