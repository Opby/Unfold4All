# Slice 4 — PAI live metrics (FR10–FR12)

Implements the live-chat half of the PAI extension in
[requirements.md](../requirements.md) (§ Extension, 2026-11-03): framing/agency
analysis, a semantic-divergence proxy, and metric logging. Eval-side metrics
(FR13–FR16) and the methods page (FR17–FR18) are later slices.

## 1. SSE contract additions

One new event, emitted at most once per exchange, after `baseline_done` and
`sourced_done` and before `done`:

```
event: metrics
data: {
  "community": string,          // who the framing analysis is about
  "baseline":  { "pastVerbs": string[], "presentVerbs": string[] },  // ≤12 each
  "sourced":   { "pastVerbs": string[], "presentVerbs": string[] },
  "shifts":    [ { "aspect": string, "baseline": string, "sourced": string } ],  // ≤3
  "divergence": number | null   // 0..1 embedding cosine distance; null = unavailable
}
```

A new `status` phase `"analyzing"` precedes it. `metrics` is **best-effort**:
on any failure (classifier error, timeout, no Voyage key) the event is simply
absent and `done` follows — metrics never fail an exchange or delay answer
streaming (NFR6).

Skipped entirely when: comparison mode is off, either answer aborted, or the
sourced answer is an honest failure (there is no grounded framing to compare).

## 2. Computation

- **Framing (FR10):** one `claude-haiku-4-5` structured call
  (`src/prompts/framing-analysis.md`) over both final answer texts: verbs whose
  subject is the community, tagged past/present, plus ≤3 semantic shifts.
- **Divergence (FR11):** cosine distance between `voyage-4-lite` embeddings of
  the two answers, mapped to [0,1]. A *text-level proxy* for distributional
  divergence — the API exposes no token logprobs (requirements § guiding
  constraint). Null when `VOYAGE_API_KEY` is unset.
- Budget: exactly one haiku call + one embedding call per exchange, run after
  both answers complete; 25 s timeout.

## 3. UI

`MetricsStrip` renders under the comparison panes when `metrics` arrives:
agency ratio + verb chips per answer (present = emerald, past = amber), the
divergence bar, the shifts as "baseline → sourced" lines, and a one-line
honesty caption saying the numbers are text-level estimates (NFR7). While the
server is analyzing, a subtle "Analyzing answer framing…" pulse shows; if
metrics never arrive the strip is simply absent.

Verb evidence is shown as chips in the strip rather than inline highlights in
the answer markdown (simpler, and keeps the answer text verbatim).

## 4. Logging (FR12)

`query_logs` gains a `metrics jsonb` column (pipeline migration
`002_query_log_metrics.sql`), holding the same payload as the SSE event; null
when metrics were skipped or failed. The app tolerates an unmigrated database:
on a missing-column error it retries the insert without `metrics`, so FR9
logging never regresses. Run `unfold-pipeline migrate` against the production
database when deploying this slice.
