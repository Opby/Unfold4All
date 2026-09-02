# requirements.md — unfold4all.org

Derived from [intent.md](intent.md). Design stage, 2026-09-02.

## Functional requirements

**FR1 — Intro page.** A static page at `/` that explains the thesis (AI bias is a
context problem; primary/community sources correct it) in under a minute of
reading, with a link into the chat and one worked example.

**FR2 — Chat interface.** A chat page where a user submits a free-text question.
Responses stream. Conversation history persists for the browser session (no
accounts at launch).

**FR3 — Source-first answering.** For each query, the system retrieves candidate
sources, classifies each into a trust tier (1 community-authored, 2
community-collaborative, 3 secondary scholarship, 4 generic web/textbook),
prefers higher tiers, and grounds the answer strictly in the selected sources.

**FR4 — Explicit sources.** Every answer displays its sources: title, link,
source type (blog / video transcript / oral history / article), and trust tier.

**FR5 — Selection explanation.** Every answer includes a short, plain-language
explanation of the source selection: the tier mix used, why these sources were
preferred, and what was deliberately not relied on.

**FR6 — Side-by-side comparison.** The UI shows two answers per query: the
"default AI" baseline (same model, no retrieved context) and the
context-corrected answer. Comparison is on by default; user can collapse it.

**FR7 — Hybrid retrieval.** Retrieval consults (a) a curated, pre-indexed corpus
for the exemplar domain and (b) on-the-fly web search with tier-aware domain
rules when the index has thin coverage. The answer indicates which path(s)
supplied each source.

**FR8 — Honest failure.** When no Tier 1–2 sources are found, the answer says so
explicitly rather than silently falling back to Tier 4 content.

**FR9 — Query logging.** Queries, retrieval results, tier mix, and answer
metadata are logged (no PII beyond what the user types) to feed the Maintain
stage.

## Non-functional requirements

- **NFR1 Latency:** first streamed token of the sourced answer within ~10s for
  index-served queries; up to ~30s acceptable when the on-the-fly path runs, with
  progress feedback in the UI ("searching community sources…").
- **NFR2 Cost:** target < $25/month at demo traffic (free-tier hosting/DB; LLM
  and search API are the main variable costs).
- **NFR3 Attribution ethics:** respect robots.txt and licenses during ingestion;
  every source linked to its origin; no rehosting of full community content.
- **NFR4 Inspectability:** source-ranking rubric documented in the repo and
  summarized on the intro page; per-answer selection metadata visible in the UI.
- **NFR5 Quality gate:** a golden eval set (≥20 queries for the Ohlone domain)
  scoring groundedness, tier mix, and citation accuracy; run in CI before deploy.

## Out of scope for launch

- User accounts, saved history, multi-domain coverage, community submission of
  sources (all candidates for later intents), mobile apps, non-English queries.
