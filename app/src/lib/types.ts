// Single source of truth for the wire format between the chat API and the UI.
// specs/slice-1.md §2 is the authoritative contract; keep this file in sync.

export type Tier = 1 | 2 | 3 | 4;

export type SourceKind =
  | "blog"
  | "video_transcript"
  | "oral_history"
  | "article"
  | "site"
  | "other";

export interface SourceCard {
  id: number; // 1-based citation index within this answer
  title: string;
  url: string;
  kind: SourceKind;
  tier: Tier;
  tierJustification: string; // one line; from registry note or classifier
  retrievalPath: "index" | "live"; // slice 1: always "live"
  snippet?: string; // ≤200 chars, for the card
}

export interface TierMix {
  counts: Record<Tier, number>;
  summary: string;
  honestFailure: boolean; // true when no Tier 1–2 sources found
}

// ---- PAI metrics (requirements.md FR10–FR12; specs/slice-4-metrics.md) ----

/** Verbs whose subject is the community, tagged by tense (FR10). */
export interface FramingTags {
  pastVerbs: string[];
  presentVerbs: string[];
}

/** One semantic slot that shifted between baseline and sourced answer (FR11). */
export interface SemanticShift {
  aspect: string; // e.g. "sovereignty", "time framing"
  baseline: string; // short phrase as the baseline put it
  sourced: string; // short phrase as the sourced answer put it
}

export interface AnswerMetrics {
  community: string; // who the framing analysis is about
  baseline: FramingTags;
  sourced: FramingTags;
  shifts: SemanticShift[]; // ≤3, most salient first
  /** Embedding cosine distance between the two answers, 0..1 (text-level
   *  JS-divergence proxy); null when embeddings are unavailable. */
  divergence: number | null;
}

// ---- SSE events (specs/slice-1.md §1) ----

export type ChatPhase =
  | "searching"
  | "reading"
  | "classifying"
  | "answering"
  | "analyzing";

export interface ChatRequest {
  query: string;
  history?: { role: "user" | "assistant"; content: string }[];
  compare?: boolean;
}

export type SseEventMap = {
  status: { phase: ChatPhase; detail?: string };
  baseline_delta: { text: string };
  baseline_done: { aborted?: boolean };
  sources: { sources: SourceCard[] };
  sourced_delta: { text: string };
  sourced_done: { tierMix: TierMix; aborted?: boolean };
  metrics: AnswerMetrics;
  done: { latencyMs: number };
  error: { message: string; phase?: string };
};

export type SseEventName = keyof SseEventMap;
