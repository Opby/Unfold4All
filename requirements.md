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

---

## Extension: PAI probabilistic metrics (2026-11-03)

Applies Week 6 of Stanford's *Probability for AI* (Piech) — calibration,
fairness, sampling volatility, distributional divergence — to make the bias
correction *measurable*, not just visible. Guiding constraint: the Claude API
exposes no token logprobs, so every metric is computed over **generated text
and repeated samples**, never over logits. Cost split: cheap metrics run live
per query; sampling- and verification-heavy metrics run offline in the eval
pipeline (and once, precomputed, for the intro page).

### Functional requirements — live chat (per query)

**FR10 — Framing / agency analysis (PAI Pillar 2).** After both answers
complete, a cheap classifier pass (`claude-haiku-4-5`) tags each verb whose
subject is the community as past- or present-tense and computes the agency
ratio P(present)/P(past) per answer. The UI shows a "framing" strip under the
side-by-side comparison: the two ratios plus the tagged verbs highlighted in
each answer (e.g. baseline "lived, were" vs. sourced "is, leads").

**FR11 — Semantic divergence (PAI Pillar 4, text-level proxy).** For each
query, compute a divergence score between baseline and sourced answers:
embedding-space distance (Voyage) plus a highlight of the semantic slots that
shifted most (claim-level diff produced by the same haiku pass as FR10). UI
shows the score with a one-line gloss ("how far grounding moved the answer")
and the diff highlights. Labeled as a Jensen–Shannon *proxy*, not token-level
$D_{JS}$.

**FR12 — Metric logging.** Framing ratios and divergence scores are written to
`query_logs` alongside the existing tier mix, feeding the Maintain stage.

### Functional requirements — eval pipeline (golden set)

**FR13 — Claim-level confidence + verification (PAI Pillar 1, inputs).** The
eval runner elicits per-claim verbalized confidence $\hat{p}_i$ for both
answers, and verifies each claim against the curated Tier 1–2 corpus
(LLM-judge with retrieved chunks as ground-truth oracle) to produce labels
$y_i$. Extends the existing groundedness check in `evals/run.py`.

**FR14 — Calibration report / ECE (PAI Pillar 1).** From FR13's
$(\hat{p}_i, y_i)$ pairs across the golden set, compute ECE with $M = 5$ bins
for baseline vs. sourced answers and emit a reliability diagram. Expected
headline: baseline sits above the diagonal (overconfident), sourced tracks it.

**FR15 — Self-consistency / $D_{self}$ (PAI Pillar 3).** For a designated
subset of golden queries, sample each path $k = 5$ times and score
disagreement two ways: mean pairwise embedding distance and fraction of claims
that flip across runs. Report per query and aggregate; the same samples feed
FR16. Runs only in evals (never live) plus one precomputed intro-page demo.

**FR16 — Fairness probe pairs (PAI Pillar 2, parity).** Add paired probe
queries to `evals/golden.yaml` (same question template about the exemplar
community vs. a dominant-group control) and report the parity gap in framing
metrics between pairs, for both baseline and sourced paths.

### Functional requirements — presentation

**FR17 — Methods page.** A `/methods` (or "lab") page that states each metric
in plain language with its formula (ECE, agency ratio, $D_{self}$, JS proxy),
shows the latest eval run's reliability diagram and consistency scores, and
names each metric's limits honestly (verbalized confidence is itself
miscalibrated; divergence is text-level because logprobs are unavailable).

**FR18 — Intro-page volatility demo.** One precomputed exhibit from FR15: the
same question asked 5× to the baseline (disagreeing claims highlighted) next
to 5 near-identical sourced runs. Static content, refreshed manually per
eval run — zero live cost.

### Non-functional requirements (extension)

- **NFR6 Live-cost guard:** FR10–FR11 together add at most one
  `claude-haiku-4-5` call + one embedding call per query and must not delay
  first streamed answer tokens (they render after answers complete).
  Sampling metrics (FR13–FR16) never run on live traffic.
- **NFR7 Metric honesty:** every displayed number is labeled with what it
  estimates and how (sampled, verbalized, text-proxy) — same honesty standard
  as FR8.
- **NFR8 Eval budget:** the full PAI eval run (confidence elicitation,
  verification, k=5 sampling on the probe subset) stays within a single-digit
  dollar cost per run; probe subset sized accordingly (~5 queries).

### Out of scope (extension)

- Token-logprob metrics (true $D_{JS}$, logit calibration) — API doesn't
  expose them.
- Live per-query ECE or stability checks (an on-demand "stability check"
  button is a later candidate).
- Fairness metrics beyond tense/agency framing (e.g., sentiment or
  sovereignty-framing classifiers) — later iteration once FR10 is validated.
