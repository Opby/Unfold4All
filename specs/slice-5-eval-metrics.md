# Slice 5 — PAI eval metrics (FR13–FR16)

Implements the eval-pipeline half of the PAI extension in
[requirements.md](../requirements.md) (§ Extension, 2026-11-03): claim-level
calibration (ECE + reliability diagram), self-consistency sampling, and
fairness probe pairs. The live half (FR10–FR12) is
[slice-4-metrics.md](slice-4-metrics.md); the methods page (FR17–FR18) is a
later slice.

Everything here runs **only** in `evals/` (never live, NFR6) and is
**report-only**: `evals/run.py` exit codes and the slice-3 checks are
unchanged, so CI behavior does not move.

## 1. Invocation

```
pipeline/.venv/bin/python evals/run.py --pai [--k 5] [--base-url URL]
```

- `--pai` requires `DATABASE_URL` + `VOYAGE_API_KEY` (env, `pipeline/.env`,
  or `app/.env.local` — the runner now falls back to the app's env file) and
  exits 2 with a message when missing. Without `--pai` the runner behaves
  exactly as slice 3 defined it; CI keeps calling it without the flag.
- With `--pai`, golden queries run in **compare mode** so the baseline answer
  is captured for FR13; the slice-3 checks still score only the sourced
  fields.
- Reliability diagram: `evals/reliability.png` (needs matplotlib — install
  with `pip install -e 'pipeline[evals]'`; skipped with a notice when absent).
- Report: the slice-3 `evals/report.json` gains one `pai` section (below).

Models: confidence is elicited from `claude-opus-5` — the answer model, since
FR14 measures *its* calibration; verification, claim extraction, consistency
judging and framing use `claude-haiku-4-5`; embeddings `voyage-4-lite`.
Constraint carried from the extension header: no token logprobs, so every
number is a text-level estimate (verbalized, LLM-judged, or sampled) and the
report says so (NFR7).

## 2. FR13 — claims, confidence, labels

For every non-honest-failure golden query that completed, per path
(baseline, sourced):

1. **Elicit**: one `claude-opus-5` structured call restates the answer's
   substantive claims (≤10, clamped after parsing — never a schema cap) with
   a verbalized probability each is factually correct ($\hat{p}_i$, clamped
   to [0,1]). Post-hoc self-assessment by the model that wrote the answer; a
   known-imperfect estimator, named as a limit in the report and (later)
   methods page.
2. **Verify**: each claim retrieves its own Tier 1–2 chunks from the curated
   pgvector index (top 4, cosine, noise floor 0.4 — mirrors
   `app/src/lib/index-search.ts` with a `tier <= 2` filter), then one
   `claude-haiku-4-5` call per answer labels every claim
   `supported` / `contradicted` / `not_covered` against those excerpts only
   (corpus-as-oracle; the judge is told never to use its own knowledge).

$y_i$ = 1 for `supported`, 0 for `contradicted`; `not_covered` claims are
**excluded from ECE** and reported as coverage instead — the corpus not
addressing a claim is not evidence either way (honest-failure principle
applied to labeling).

## 3. FR14 — ECE + reliability diagram

Pooled $(\hat{p}_i, y_i)$ across the golden set, per path:
$ECE = \sum_b \frac{n_b}{N} \lvert acc_b - conf_b \rvert$ with $M = 5$
equal-width bins. `evals/reliability.png` plots both paths against the
diagonal with per-bin claim counts and ECE in the legend. Expected headline
(requirements FR14): baseline sits above the diagonal (overconfident),
sourced tracks it.

**Caveat (observed on the first full run, 2026-11-03):** cross-path ECE
comparisons must be read next to `coverage`. The baseline's wrong claims
tend to be the ones the community corpus does not address (generic or
invented framing), so they fall in `not_covered` and leave the ECE pool —
covered-claims ECE can flatter the baseline. The report therefore always
carries `coverage` and the verdict counts alongside `ece`, and the summary
line prints them together; the methods page (FR17) must state this limit.

## 4. FR15 — self-consistency ($D_{self}$)

Probe queries = all parity-pair instantiations plus
`probes.self_consistency_extra` in `evals/golden.yaml` (5 queries total;
NFR8 sizing). Each is sampled `--k` times (default 5) in compare mode; the
same samples feed FR16. Per query and path:

- **mean_pairwise_distance**: mean pairwise cosine distance between
  `voyage-4-lite` embeddings of the k answers.
- **flips**: claims are extracted from sample 1 (reference, haiku); each
  other sample is judged `asserted` / `contradicted` / `absent` per
  reference claim. `claim_flip_fraction` = fraction of reference claims
  contradicted in ≥1 other sample; `claim_assertion_rate` = mean assertion
  rate across claims × samples (omissions lower this without counting as
  flips).

Aggregate = unweighted mean over probe queries per path.

## 5. FR16 — framing-parity probes

`probes.parity_pairs` in `evals/golden.yaml`: one template instantiated for
the exemplar community and a dominant-group control, in **two phrasings** —
`history` (past) and `present_day` — because on history questions a sourced
answer is legitimately more past-tense; the thesis contrast is expected on
the present-day pair (requirements FR16 design input).

Per sample, the FR10 framing prompt (`app/src/prompts/framing-analysis.md`,
shifts omitted) tags community-subject verbs by tense; **agency share** =
|present| / (|present| + |past|), undefined when no verbs are tagged. Per
pair and path:

```
agency_gap = mean agency share(control) − mean agency share(community)
```

Gap > 0 means the control group is framed as more present-tense than the
community on that path. Control queries have no Tier 1–2 coverage by design,
so their sourced path may honest-fail; the report carries
`honest_failure_rate` per member instead of pretending coverage.

## 6. Report contract (`report.json` → `pai`)

```jsonc
{
  "results": [...], "grounded_rate": 0.95,        // slice 3, unchanged
  "pai": {
    "method": "...",                               // NFR7 one-liner
    "elicit_model": "claude-opus-5",
    "judge_model": "claude-haiku-4-5",
    "embed_model": "voyage-4-lite",
    "calibration": {
      "baseline": { "ece": 0.31, "n": 74,          // labeled claims only
        "bins": [ { "range": [0.8, 1.0], "count": 40,
                    "mean_confidence": 0.93, "accuracy": 0.62 } ],
        "verdicts": { "supported": 46, "contradicted": 28, "not_covered": 61 },
        "coverage": 0.55 },                        // labeled / all claims
      "sourced": { ... },
      "diagram": "reliability.png"                 // null if matplotlib absent
    },
    "claims": [ { "query", "path", "claim", "confidence", "verdict", "reason" } ],
    "self_consistency": {
      "k": 5,
      "queries": [ { "query", "k_effective", "paths": {
        "baseline": { "mean_pairwise_distance": 0.18,
          "flips": { "n_reference_claims": 8, "claim_flip_fraction": 0.25,
                     "claim_assertion_rate": 0.66, "flipped_claims": [...] } },
        "sourced": { ... } } } ],
      "aggregate": { "mean_pairwise_distance": { "baseline": ..., "sourced": ... },
                     "claim_flip_fraction": { ... }, "claim_assertion_rate": { ... } }
    },
    "parity": [ {
      "name": "present_day", "phrasing": "present", "template": "...",
      "community": { "query", "honest_failure_rate",
        "agency_share": { "baseline": 0.21, "sourced": 0.78 },
        "example_framing": { "community", "baseline", "sourced" } },
      "control": { ... },
      "agency_gap": { "baseline": 0.55, "sourced": 0.04 }
    } ]
  }
}
```

Failures degrade, never abort: a query whose elicitation/judging/framing call
fails is skipped with a console notice and the metric is computed over the
rest (`k_effective`, `n`, nulls in place of numbers).

## 7. Budget (NFR8)

Per full `--pai` run against ~20 golden queries, k=5, 5 probe queries:
~20 extra baseline answers (compare mode) + 25 probe exchanges (50 opus
answers) + ~36 opus elicitation calls + ~90 haiku judge calls + ~350 Voyage
embeddings. Dominated by opus output tokens; comfortably single-digit
dollars. Knobs: `--k`, `--limit`, probe list size in `golden.yaml`.
