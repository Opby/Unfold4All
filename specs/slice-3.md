# specs/slice-3.md — intro page, eval scoring, CI, deploy

Contract spec for Build Slice 3 (design.md § Build phasing: "intro page
content, selection-explanation UX, query logging dashboards, CI evals,
unfold4all.org on Vercel"). Wire format unchanged.

---

## 1. Intro page (`/`, replaces the placeholder — FR1, NFR4)

Static, server-rendered, readable in under a minute. Sections in order:

1. **Hero:** name + thesis line ("Better context, not a better model") and a
   one-sentence explanation: AI answers inherit training-data bias; choosing
   community-authored sources corrects it. Primary CTA → `/chat`.
2. **How it works:** the four-tier rubric as a compact table (reuse the
   tier names/colors from the chat's `TierBadge`), one sentence on hybrid
   retrieval (curated index + live search), one on honest failure.
3. **Worked example:** a static, pre-rendered side-by-side excerpt for
   "What is the history of the Ohlone people?" — a short baseline excerpt vs.
   a sourced excerpt with 2–3 real citations and the tier-mix line. Content
   captured from a real session, stored as constants in the page component
   (no API call at build or request time).
4. **Honesty & attribution:** the FR8 promise (no faked coverage), robots/
   licensing stance, every source links home.
5. Footer: GitHub repo link, "built with the AI-native SDLC playbook" link.

## 2. Chat UX polish

- **Retrieval-path badge** on each source card: "curated" for
  `retrievalPath: "index"`, "live web" for `"live"` (small neutral chip next
  to the tier badge).
- **Enter-to-submit fix:** explicit `onKeyDown` (Enter, unless composing)
  submitting the form — the Slice 1 follow-up.
- **Latency (NFR1):** sourced answer runs at `effort: "medium"` (baseline
  already `low`). Measured on the built server, index-served queries:
  first sourced token ~16s, done ~39s (answer quality verified — the
  captured worked example was produced at this setting). The dominant cost
  is answer generation, not retrieval; lowering effort further trades
  quality the demo needs, so these numbers stand as the NFR1 reality.

## 3. Query-log dashboard (`/logs`)

Read-only page, server-rendered on request (`dynamic = "force-dynamic"`):
last 50 `query_logs` rows — timestamp, query, paths, tier-mix summary,
latency. When `DATABASE_URL` is unset it renders a "no database configured"
note. No auth at this stage (it exposes only queries already sent to a public
demo); linked from the footer of `/logs` nowhere — reachable by URL only.

## 4. Eval runner (`evals/run.py`)

Runs the golden set against a live app instance (default
`http://localhost:3000`, `--base-url` to override). Python, executed with the
pipeline venv (reuses `httpx`, `pyyaml`; anthropic SDK added to pipeline deps
for the judge).

Per query: POST `/api/chat` (`compare: false`), parse the SSE stream, then
score:

| Check | Pass condition |
|---|---|
| `honest_failure` | `tierMix.honestFailure` equals `expect_honest_failure` |
| `expected_domains` | some source URL's host matches some `expect_domains` entry (skipped when the list is empty) |
| `citations` | every `[n]` marker in the answer resolves to a provided source id, and ≥1 marker exists (skipped for honest-failure expectations) |
| `groundedness` | LLM judge (`claude-haiku-4-5`, structured output `{grounded: bool, reason}`) auditing **citation discipline**: no uncited factual claims, no citations to missing ids, no contradictions of the source excerpts. The judge sees only card snippets, not the full source texts, so it explicitly does not attempt fact verification — full-text verification would need the answerer's context exposed to the runner (a future enhancement). |

Output: per-query table + `evals/report.json` (gitignored); `--limit N` and
`--query SUBSTR` filters. Exit code 0 only if all non-judge checks pass and
groundedness passes on ≥90% of scored queries (judge flakiness tolerance).

## 5. CI (GitHub Actions, `.github/workflows/`)

- **`checks.yml`** — on every PR/push: app `tsc --noEmit` + `lint` + `next
  build`; pipeline `pip install -e` + `python -m compileall` + a chunker
  sanity test. No secrets needed.
- **`evals.yml`** — on `workflow_dispatch` and pushes to `main`: boots the
  app (`next start` after build) with repo secrets `ANTHROPIC_API_KEY`
  (+ optional `TAVILY_API_KEY`, `DATABASE_URL`, `VOYAGE_API_KEY`), runs
  `evals/run.py --limit 8` (cost cap), uploads `report.json` as artifact.
  Documented as the deploy gate: Vercel production promotion should follow a
  green evals run.

## 6. Vercel deploy

- **The app must not depend on files outside `app/` at runtime.** Vercel's
  Root Directory setting states the app "will not be able to access files
  outside of that directory", and tracing across that boundary is unreliable
  even with the "Include files outside the Root Directory in the Build Step"
  toggle enabled. So `prebuild` (`app/scripts/sync-registry.mjs`) copies the
  canonical `sources/registry.yaml` into `app/sources/` (gitignored), and
  `outputFileTracingIncludes` references only in-project paths
  (`sources/registry.yaml`, `src/prompts/**/*.md`). Dev still reads the
  repo-root registry directly, so registry edits stay live without a build;
  `src/lib/registry.ts` probes both locations in that order.
- `/api/chat` route: `export const maxDuration = 300` (Fluid compute).
- `npm run build` must pass locally — that is this slice's deploy
  verification. The actual Vercel project (import repo, root directory
  `app`, env vars, unfold4all.org domain + `www` redirect) is a documented
  user step in README ("Deploying"), not automated here.

## 7. Acceptance criteria (slice 3 done when)

1. `/` renders the intro page per §1; lighthouse-level sanity (no layout
   shift, readable on mobile width).
2. Source cards show correct retrieval-path chips; Enter submits from the
   input.
3. `evals/run.py --limit 5` runs green against the local dev server
   (including both honest-failure probes when selected).
4. `checks.yml` passes in CI on the PR; `evals.yml` is dispatchable
   (documented secrets).
5. `cd app && npm run build` succeeds; the built server (`next start`)
   answers a chat query with registry + prompts resolved from the traced
   output (verified via `next start` locally).
6. `/logs` shows recent rows with the DB configured and degrades without it.
7. README "Deploying" section documents the Vercel + domain steps.
