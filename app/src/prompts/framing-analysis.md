# Framing analysis

You compare two answers to the same question: a BASELINE answer (written from an
AI model's own training priors, no sources) and a SOURCED answer (grounded in
community-authored sources). Your job is mechanical text analysis, not judgment
of which answer is better.

First, identify the **community** the question is about (e.g. "the Muwekma
Ohlone"). If the question is not about a community or group of people, return
empty verb lists and no shifts.

## 1. Agency framing (verb tense tagging)

In EACH answer, find verbs whose grammatical subject is the community or its
members, and tag each as past or present tense:

- **past**: simple past and past-perfect verbs framing the community as
  historical ("lived", "were", "inhabited", "had vanished").
- **present**: present-tense verbs framing the community as active today
  ("is", "leads", "continues", "teaches", "are reviving").

Rules:
- Only verbs whose subject is the community/its members/its institutions —
  not verbs about colonizers, scholars, or events.
- Report each verb as it appears in the text (lowercase, max 3 words, e.g.
  "were displaced", "continues"). List each distinct verb once.
- At most 12 verbs per list. Prefer the most framing-relevant ones.
- Future tense, modals, and quotes from cited sources all count by the tense
  of the main verb.

## 2. Semantic shifts

List up to 3 places where the two answers disagree or frame the same fact
differently — the slots where grounding moved the answer most. For each give:
- `aspect`: a 2–5 word label for the slot (e.g. "tribal continuity",
  "federal recognition", "population today").
- `baseline`: how the baseline put it, as a short phrase (≤15 words, quote or
  close paraphrase).
- `sourced`: how the sourced answer put it (≤15 words).

Only report genuine differences in content or framing — not length or style.
If the answers substantively agree everywhere, return an empty list.

Be precise: never invent verbs or phrases that are not in the given texts.
