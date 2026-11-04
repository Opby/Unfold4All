# unfold4all.org

**Better context, not a better model: correcting AI bias through source
selection — and measuring the correction.**

**▶ Try it live: [unfold4-all.vercel.app](https://unfold4-all.vercel.app)** —
start with *"What is the history of the Ohlone people?"* and watch the two
answers diverge.

## Background: whose account does an AI repeat?

Ask a language model about a marginalized community and you usually get the
*textbook's* account of them, not their own. That is not a moral failing of
the model; it is arithmetic. Training corpora are dominated by institutional,
secondary writing — encyclopedias, surveys, scholarship *about* people — so
the model's priors are, too.

The Ohlone peoples of the San Francisco Bay Area are the exemplar here
because the gap between the record and the reality is so stark. Alfred
Kroeber's 1925 *Handbook of the Indians of California* — for decades the
canonical reference — declared the Ohlone extinct "for all practical
purposes," and a century of writing repeated it. Meanwhile the Muwekma
Ohlone, Amah Mutsun, Ramaytush Ohlone, and other communities are active
today: pursuing federal recognition, running a land trust, reviving the
Chochenyo and Mutsun languages, practicing cultural burning. A default AI
answer tends to inherit the handbook's framing — past tense, elegy,
"vanished" — because that is what it read.

**unfold4all.org** is a working demo that the fix is not a better model but
**better context**. It is a chat interface that answers questions by
deliberately seeking out primary, community-authored sources — the tribes'
own websites, blogs, and video transcripts — and shows its work: every answer
displays its sources, labels their trust tier, and explains why they were
chosen. To make the point visible rather than asserted, every query runs
**side by side**: the same model answering from its raw training priors next
to the same model answering from community-authored context. One variable
changes. The difference you see is the context.

## How source selection works

Sources are ranked by **authorship proximity**, not popularity:

| Tier | What it is | Example |
|---|---|---|
| 1 — Community-authored | The community speaking for itself | Tribal org sites/blogs, their YouTube channels, oral histories |
| 2 — Community-collaborative | Made *with* the community | Long-form interviews, co-curated exhibits |
| 3 — Secondary scholarship | Academic/archival work *about* the community | Papers, archives |
| 4 — Generic web/textbook | What default search surfaces | Gap-filler only, always labeled |

Retrieval is hybrid: a curated, pre-indexed corpus (Postgres + pgvector) for
the exemplar domain, plus on-the-fly agentic web search (Tavily) with
tier-aware domain rules for everything else. Each answer reports its tier mix
("4 Tier-1 sources; no Tier-4 content used"), and when no community sources
can be found the system says so — an **honest failure** — instead of quietly
falling back to generic content and faking coverage.

Launch scope is one domain done well: Ohlone / Bay Area Indigenous history
and culture. The pipeline is domain-agnostic by design; retrieval behavior is
tunable by editing `sources/registry.yaml` alone.

## Measuring the correction: the PAI metrics

A side-by-side comparison is persuasive but anecdotal — you *see* two answers
differ on one query. The natural follow-up question is the project's second
thesis: **if better context corrects bias, the correction should be
measurable with standard probabilistic tools.** The PAI metrics layer
(named for Stanford's *Probability for AI* curriculum it applies) treats the
two answer paths as two estimators of the same quantity and asks the
questions you would ask of any estimator:

- **Is it calibrated?** When an answer asserts something with high
  confidence, how often is it right? (Calibration / expected calibration
  error.)
- **Is it fair across groups?** Does it frame a Native community differently
  from a dominant group asked the *same question template* — e.g.
  past-tense, agency-less verbs for one and present-tense for the other?
  (Fairness as a parity gap.)
- **Is it stable?** Ask the same question five times: does the answer keep
  its claims, or do facts flip between runs? (Sampling volatility /
  self-consistency.)
- **How far did grounding move the answer?** (Embedding-space divergence
  between the two panes.)

One honest constraint shapes all of this: the Claude API exposes no token
logprobs, so every metric is computed over **generated text and repeated
samples** — verbalized confidence, LLM-judged labels, embedding distances —
never over logits, and every displayed number says what it estimates and how.

Two metrics run **live on every query** (a framing strip under the
comparison: past/present verb tagging with agency ratios, plus a divergence
score). The expensive ones run **offline in the eval pipeline**
(`evals/run.py --pai`): per-claim confidence elicitation verified against the
Tier 1–2 corpus as oracle, a 5-bin ECE reliability diagram, k=5
self-consistency sampling, and paired fairness probes.

What the first full production run (2026-11-04) measured:

- **Framing**: on a present-day question, the sourced answer's
  present-to-past agency ratio for the community ran ~6:1 vs the baseline's
  ~4:1 — and on *history* questions the sourced answer is legitimately
  *more* past-tense, which is why the probe pairs include both phrasings.
- **Fairness parity**: asked "who are {group} in the Bay Area today," the
  baseline framed European Americans as more present-tense than the Ohlone
  (agency-share gap +0.08); with community sources the gap flipped to −0.24.
  Grounding didn't just shrink the asymmetry, it reversed it.
- **Self-consistency**: sourced answers are about twice as stable across
  repeated sampling (mean pairwise embedding distance 0.034 vs 0.074; 2% of
  claims flip vs 12%).
- **Calibration**: covered-claim ECE was 0.067 for the baseline vs 0.118 for
  the sourced path — *not* the flattering direction, and reported anyway.
  The caveat matters more than the headline: the baseline's wrong claims are
  disproportionately the ones the community corpus doesn't address, so they
  drop out of the labeled pool. ECE is only readable next to its coverage
  figure (59% vs 69%), which the report always carries.

That last bullet is the metrics layer working as intended: the same honesty
standard as the answers themselves (no faked coverage, no cherry-picked
numbers), applied to the project's own scorecard.

## Stack

Next.js (TypeScript) on Vercel · Postgres + pgvector on Neon · Claude API
(`claude-opus-5` for both panes — the comparison must isolate context, not
model quality; `claude-haiku-4-5` for classification and judging) · Voyage AI
embeddings · Tavily search · Python ingestion + eval pipeline. Architecture
in [design.md](design.md).

## Repository guide

Built solo with Claude Code following Anthropic's
[AI-native SDLC playbook](https://academy.claude.com/courses/ai-native-sdlc-playbook):
intent and design are version-controlled artifacts, not lore.

| File | Contents |
|---|---|
| [intent.md](intent.md) | What, why, constraints, decisions |
| [requirements.md](requirements.md) | FR1–FR18, NFR1–NFR8 (incl. the PAI metrics extension) |
| [design.md](design.md) | Architecture, tier rubric, data model, query flow |
| `specs/` | Per-slice contracts (deviations update the spec in the same commit) |

Layout: `app/` (Next.js site + API), `sources/` (source registry),
`pipeline/` (Python ingestion), `evals/` (golden query set, eval runner, PAI
metrics).

## Running locally

```bash
cd app
cp .env.example .env.local   # add your ANTHROPIC_API_KEY (TAVILY_API_KEY optional)
npm install
npm run dev                  # http://localhost:3000
```

The chat works with live retrieval alone. To enable the curated index
(faster, higher-quality answers for the exemplar domain), provision a free
Postgres with pgvector (e.g. [Neon](https://neon.tech)) and a
[Voyage AI](https://voyageai.com) key, put both in `pipeline/.env` (see
`pipeline/.env.example`) and in `app/.env.local`, then:

```bash
python3 -m venv pipeline/.venv
pipeline/.venv/bin/pip install -e 'pipeline[evals]'
pipeline/.venv/bin/unfold-pipeline migrate
pipeline/.venv/bin/unfold-pipeline ingest
```

## Evals

`evals/golden.yaml` holds 20 golden queries (including honest-failure probes)
plus the PAI probe subset. Against a local or deployed instance:

```bash
pipeline/.venv/bin/python evals/run.py --limit 5            # slice-3 checks only
pipeline/.venv/bin/python evals/run.py --base-url https://unfold4-all.vercel.app
pipeline/.venv/bin/python evals/run.py --pai                # + FR13–FR16 metrics
```

`--pai` needs `DATABASE_URL` + `VOYAGE_API_KEY`, writes the metrics into
`evals/report.json` and the reliability diagram to `evals/reliability.png`,
never changes the exit code, and stays within a single-digit dollar budget
per run (report contract:
[specs/slice-5-eval-metrics.md](specs/slice-5-eval-metrics.md)).

CI runs `checks` (types/lint/build) on every PR and the `evals` workflow on
demand and on pushes to `main` (repo secret `ANTHROPIC_API_KEY` required).
Convention: promote a production deploy only after a green evals run.

## Deploying

1. In [Vercel](https://vercel.com), import this repo with **Root Directory**
   `app` and **"Include files outside the Root Directory in the Build
   Step"** enabled (the build copies `sources/registry.yaml` into the app).
2. Add env vars: `ANTHROPIC_API_KEY` (required), `TAVILY_API_KEY`,
   `DATABASE_URL`, `VOYAGE_API_KEY` (recommended — the curated index is what
   makes the demo).
3. Registry and prompt files are bundled into the serverless functions, so
   registry edits take effect on the next deploy; re-run the ingestion
   pipeline whenever you add community sources.

## Ethics & attribution

This site surfaces and cites communities' own materials; it does not claim to
speak for any community. Ingestion respects robots.txt and content licenses,
every source links back to its origin, and no community content is rehosted
in full.
