# specs/slice-1.md — end-to-end chat, on-the-fly retrieval

Contract spec for Build Slice 1 (see design.md § Build phasing). This pins the
frontend/backend contract, the shared types, UI behavior, and the prompts.
Component breakdown and file structure are left to the plan-mode session.

**Slice 1 scope:** Next.js app with chat UI; every query produces a baseline
answer and a sourced answer via Tavily-only retrieval, guided by a seed
`sources/registry.yaml`. No database, no pipeline, no intro-page content yet
(placeholder page links to `/chat`). Deployed manually to a vercel.app URL at
most; custom domain and CI are Slice 3.

---

## 1. API contract

### `POST /api/chat`

Request (JSON):

```ts
{
  query: string;                  // 1..2000 chars, trimmed; reject empty
  history?: { role: 'user' | 'assistant'; content: string }[];
                                  // prior sourced-answer turns only, last ≤6
                                  // entries; server truncates further if long
  compare?: boolean;              // default true; false skips the baseline
}
```

Response: `text/event-stream`. Named SSE events, each `data:` line one JSON
object. Event order guarantees:

- `status` events may appear any time before `done`.
- `sources` is emitted exactly once, before the first `sourced_delta`.
- `baseline_*` and `sourced_*` events interleave freely (the two answers run
  in parallel).
- Stream always terminates with exactly one `done` or one `error`.

| Event | Payload | Notes |
|---|---|---|
| `status` | `{ phase: 'searching' \| 'reading' \| 'classifying' \| 'answering', detail?: string }` | Drives the sourced pane's progress UI, e.g. `detail: "Searching community sources…"` |
| `baseline_delta` | `{ text: string }` | Streamed baseline tokens |
| `baseline_done` | `{}` | |
| `sources` | `{ sources: SourceCard[] }` | The selected sources, in citation order (`id` = 1-based citation index) |
| `sourced_delta` | `{ text: string }` | Streamed sourced-answer tokens; may contain citation markers `[1]`, `[2]` matching `SourceCard.id` |
| `sourced_done` | `{ tierMix: TierMix }` | |
| `done` | `{ latencyMs: number }` | |
| `error` | `{ message: string, phase?: string }` | User-safe message; details go to server logs only |

Failure semantics:

- Tavily/extraction failure → still answer: emit `sources` with whatever was
  retrieved (possibly `[]`) and let the prompt's honest-failure rule (FR8)
  speak in the answer text.
- Baseline failure with sourced success (or vice versa) → emit the failing
  side's `*_done` with an `aborted: true` field and keep streaming the other;
  only total failure emits `error`.
- Claude `refusal` stop reason: requests enable the server-side fallback beta
  (`fallbacks: "default"`); if a refusal still surfaces, emit `error` with a
  plain-language message.

### `GET /api/health`

Returns `{ ok: true }`. Used by deploy checks later; trivial now.

## 2. Shared types

One module (`app/src/lib/types.ts`) is the single source of truth; the SSE
payloads above reference these. The Slice 2 pipeline mirrors them in Python.

```ts
type Tier = 1 | 2 | 3 | 4;

type SourceKind =
  | 'blog' | 'video_transcript' | 'oral_history'
  | 'article' | 'site' | 'other';

interface SourceCard {
  id: number;                 // 1-based citation index within this answer
  title: string;
  url: string;
  kind: SourceKind;
  tier: Tier;
  tierJustification: string;  // one line; from registry note or classifier
  retrievalPath: 'index' | 'live';   // slice 1: always 'live'
  snippet?: string;           // ≤200 chars, for the card
}

interface TierMix {
  counts: Record<Tier, number>;      // e.g. {1: 4, 2: 1, 3: 0, 4: 0}
  summary: string;                   // "4 Tier-1 and 1 Tier-2 sources; no
                                     //  Tier-4 content was used."
  honestFailure: boolean;            // true when no Tier 1–2 sources found
}
```

### `sources/registry.yaml` (seed schema)

Slice 1 uses the registry only for Tavily domain lists and tier pinning:

```yaml
version: 1
domains:
  - domain: muwekma.org
    name: Muwekma Ohlone Tribe
    tier: 1
    kind: site
    note: Official site of the Muwekma Ohlone Tribe of the SF Bay Area
  # ... more entries; include-list = all tier 1–2 domains
```

Any fetched source whose host matches a registry `domain` (or subdomain)
takes its pinned `tier`/`kind`/`note`; everything else goes to the classifier.

## 3. Retrieval flow (server, slice-1 version)

1. Tavily search pass A: query against include-list of registry Tier 1–2
   domains. Pass B (always run): unrestricted query with registry-known
   textbook/aggregator domains excluded. Cap combined candidates at ~10.
2. Extract content for top candidates (Tavily raw content; skip failures).
3. Tier-assign each candidate: registry pin, else `claude-haiku-4-5`
   classifier (§4.3), calls made in parallel.
4. Select: sort (tier asc, relevance desc); fill a ~15K-token context budget
   Tier 1 → 2 → 3; include Tier 4 only if fewer than 2 sources selected so
   far, and set `honestFailure` when no Tier 1–2 made the cut.
5. Answer with `claude-opus-5` (streaming, adaptive thinking); baseline call
   runs in parallel from step 1 (it needs no retrieval) at `effort: "low"`
   with `max_tokens: 4096` — thinking tokens count toward `max_tokens`, so a
   tighter cap can silently swallow the entire visible answer.

## 4. Prompts (versioned files, `app/src/prompts/`)

Prompts are product surface: plain `.md` files imported as strings, reviewed
in PRs like code. Initial drafts:

### 4.1 `sourced-answer.md` (system prompt, claude-opus-5)

```
You answer questions using ONLY the numbered sources provided in the user
message. These sources were deliberately selected to privilege the community's
own voice: Tier 1 is community-authored, Tier 2 community-collaborative,
Tier 3 secondary scholarship, Tier 4 generic web content.

Rules:
- Ground every factual claim in the provided sources and mark it with its
  citation, e.g. [1] or [2][3]. Never use your own background knowledge for
  facts, even to fill small gaps; if the sources don't cover something the
  question asks, say so plainly.
- Prefer the framing and terminology the Tier 1–2 sources themselves use
  (e.g. how a community names itself).
- If the provided material is marked as an honest failure (no Tier 1–2
  sources), open by saying that community-authored sources could not be
  found for this question, and clearly attribute what follows to the
  lower-tier sources that were available.
- End with a short section titled "Why these sources", 2–4 sentences: what
  tiers were used, why they were preferred for this question, and what was
  deliberately not relied on.
- Write in clear, plain prose for a general audience. No headers other than
  "Why these sources".
```

User message template: the question, then each source as
`[id] (Tier N, kind) title — url` followed by its extracted text, then the
`honestFailure` flag.

### 4.2 `baseline-answer.md` (system prompt, claude-opus-5, no retrieval)

```
Answer the question from your own knowledge, the way a general-purpose AI
assistant typically would. Do not search, do not cite sources, and do not
caveat about needing sources — just give your best direct answer in a few
short paragraphs.
```

### 4.3 `tier-classifier.md` (claude-haiku-4-5, structured output)

```
Classify this web source's relationship to the community the user's question
is about, by AUTHORSHIP PROXIMITY — who is speaking, not how polished or
popular the source is.

Tier 1 — community-authored: the community speaking for itself (its own
  organizations' sites, blogs, channels, oral histories, newsletters).
Tier 2 — community-collaborative: created with the community (long-form
  interviews, co-curated exhibits, journalism quoting members at length).
Tier 3 — secondary scholarship: academic, archival, museum, or journalistic
  work about the community without substantial community voice.
Tier 4 — generic: textbook summaries, encyclopedias, SEO content, aggregators.

Judge from the URL, site name, and content excerpt. When torn between two
tiers, choose the higher number (less proximate) — overclaiming community
authorship is worse than underclaiming it.
```

Output (enforced via `output_config.format`):
`{ tier: 1|2|3|4, kind: SourceKind, justification: string /* ≤140 chars */ }`.

## 5. UI behavior

Layout — `/chat`:

- Two answer panes per exchange: left **"Default AI"**, right **"Community-
  sourced"**; the right pane is visually primary (wider on desktop, first
  when stacked on mobile).
- Baseline pane has a collapse control; collapsed state persists per session.
  With `compare` off (future toggle — slice 1 always compares) the layout is
  single-pane.
- Below the sourced answer: the tier-mix summary line, then source cards.

Source cards: tier badge (color-coded 1→4, labeled "Tier 1 · community-
authored" etc.), kind icon, title linking to `url` (new tab), snippet.
Hovering the badge shows `tierJustification`. Citation markers `[n]` in the
answer text are rendered as links that highlight/scroll to card `n`.

Streaming & progress:

- On submit: input disables, both panes appear immediately; the sourced pane
  shows the `status` phases as a progress line ("Searching community
  sources…" → "Reading sources…" → "Answering…") until first `sourced_delta`.
- Tokens render as they stream; markdown supported; auto-scroll pauses when
  the user scrolls up.
- `honestFailure: true` renders a distinct notice banner above the sourced
  answer ("No community-authored sources found for this question").

State & errors:

- Conversation history lives in `sessionStorage` (survives reload, not the
  browser session); history sent per §1.
- `error` event → inline error card with a retry button that resubmits the
  same query; partial answers remain visible.
- Empty input and >2000 chars are blocked client-side with inline hints.

## 6. Acceptance criteria (slice 1 done when)

1. `npm run dev`, ask "What is the history of the Ohlone people?": both
   answers stream, sourced answer cites ≥3 sources with ≥1 Tier-1, tier-mix
   line and "Why these sources" section render.
2. A deliberately obscure question triggers the honest-failure banner rather
   than an invented community sourcing.
3. Killing the Tavily key still yields a (failure-honest) sourced answer and
   a healthy baseline — no hung stream.
4. Registry edit (add a domain with a pinned tier) changes retrieval behavior
   with no code change.
5. Types in §2 are the only definition of the wire format used by either side.
