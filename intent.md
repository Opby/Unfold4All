# intent.md — unfold4all.org

## What

A public website with two parts:

1. **Introductory page** — explains the mission: AI answers are only as unbiased as the
   context they're given. We demonstrate that choosing the *right* sources — primary,
   community-authored, first-person — produces more reliable and less biased answers
   than default AI behavior (training-data priors + generic web search).

2. **Chat interface** — a question-answering experience where, for each query, the
   system deliberately *seeks out primary and community sources* before answering.
   Example: a question about Ohlone history and culture is answered from the tribe's
   own blogs, websites, and YouTube video transcripts — not from Google's top results
   or textbook summaries.

Every answer must:
- **Display its sources explicitly** (linked, labeled by type: tribal blog, oral
  history transcript, community archive, etc.)
- **Explain the source selection** — why these sources were chosen over the
  conventional ones, and how that shapes the summary.
- Ground the summary strictly in the selected sources.

## Why

Large language models inherit the biases of their training corpora: institutional,
Western, textbook-centric perspectives dominate; marginalized communities' own voices
are underweighted. This project is a working demo that the fix is not a better model
but **better context** — a retrieval pipeline that privileges a community's own
account of itself. It doubles as a teaching artifact: sources and reasoning are
shown, so users can see *how* the answer was constructed.

## What it is not (scope guards)

- Not a general-purpose search engine or Perplexity clone — it is a demo with a
  point of view about source selection.
- Not an authority claiming to speak *for* any community — it surfaces and cites
  the community's own materials, with clear attribution.
- Not required to cover every topic at launch — a small set of well-served domains
  (e.g., Indigenous history/culture) beats shallow universal coverage.

## Constraints

- **Cost:** hobby/demo budget — hosting and API costs should stay small
  (roughly free-tier to low tens of dollars/month). [confirm]
- **Team:** one developer working with Claude Code, following the AI-native SDLC
  playbook (intent → design → build with plan mode → continuous eval → deploy →
  maintain).
- **Multi-stage delivery:** ship an end-to-end thin slice first (intro page + chat
  answering one exemplar topic well), then deepen the source pipeline.
- **Ethics/attribution:** respect robots.txt and content licenses when fetching
  community sources; always link back; never paywall or claim their content.
- **Domain:** unfold4all.org (already owned? [confirm]).

## Decisions (made in Plan stage, 2026-09-02)

1. **Source seeking strategy: hybrid from day one.** A curated, pre-indexed corpus
   (vector DB) for the exemplar domain, plus on-the-fly agentic search — with
   source-quality rules — as fallback/supplement for queries the index can't answer.
2. **Launch scope: one domain, done well.** Ohlone / Bay Area Indigenous history
   and culture is the exemplar. Generality is claimed via pipeline design and
   demonstrated in later stages.
3. **Comparison mode: yes, side-by-side.** Each query shows the "default AI answer"
   (no curated context) next to the context-corrected, community-sourced answer,
   making the bias correction visible rather than asserted. May be a toggle.

## Open questions (to resolve in the Design stage)

1. **What counts as a "primary/reliable" source, operationally?** Need explicit,
   explainable ranking criteria (authorship proximity, community endorsement,
   first-person testimony, etc.) — this is the intellectual core of the demo.
2. Hosting, LLM provider, search API, vector DB, and web framework choices.
3. Ingestion pipeline design: crawl cadence, YouTube transcript extraction,
   chunking/embedding strategy, source-registry format.

## Success criteria

- A visitor can ask about an exemplar topic and receive an answer whose sources are
  visibly community-primary, with a readable explanation of why those sources.
- The intro page makes the thesis legible in under a minute of reading.
- The pipeline's source-selection logic is inspectable (shown in the UI, documented
  in the repo).
