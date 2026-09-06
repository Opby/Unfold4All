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

// ---- SSE events (specs/slice-1.md §1) ----

export type ChatPhase = "searching" | "reading" | "classifying" | "answering";

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
  done: { latencyMs: number };
  error: { message: string; phase?: string };
};

export type SseEventName = keyof SseEventMap;
