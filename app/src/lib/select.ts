import type { ClassifiedCandidate } from "./classify";
import type { SourceCard, Tier, TierMix } from "./types";

const CONTEXT_TOKEN_BUDGET = 15_000;
const estimateTokens = (text: string) => Math.ceil(text.length / 4);

export interface SelectedSource extends ClassifiedCandidate {
  id: number; // citation index
  text: string; // content sent to the model (budget-trimmed)
}

export interface Selection {
  sources: SelectedSource[];
  tierMix: TierMix;
}

/**
 * Sort (tier asc, relevance desc), fill the context budget Tier 1 → 3;
 * Tier 4 only when fewer than 2 sources made it (specs/slice-1.md §3).
 */
export function selectSources(candidates: ClassifiedCandidate[]): Selection {
  const sorted = [...candidates].sort(
    (a, b) => a.tier - b.tier || b.score - a.score,
  );

  const selected: SelectedSource[] = [];
  let budget = CONTEXT_TOKEN_BUDGET;
  for (const c of sorted) {
    if (c.tier === 4 && selected.length >= 2) continue;
    if (budget <= 0) break;
    const text = (c.rawContent || c.snippet).slice(0, budget * 4);
    if (!text.trim()) continue;
    budget -= estimateTokens(text);
    selected.push({ ...c, id: selected.length + 1, text });
  }

  const counts: Record<Tier, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
  for (const s of selected) counts[s.tier]++;
  const honestFailure = counts[1] + counts[2] === 0;

  return { sources: selected, tierMix: { counts, summary: summarize(counts), honestFailure } };
}

function summarize(counts: Record<Tier, number>): string {
  const parts: string[] = [];
  const label: Record<Tier, string> = {
    1: "Tier-1 (community-authored)",
    2: "Tier-2 (community-collaborative)",
    3: "Tier-3 (secondary scholarship)",
    4: "Tier-4 (generic web)",
  };
  for (const tier of [1, 2, 3, 4] as Tier[]) {
    if (counts[tier] > 0) parts.push(`${counts[tier]} ${label[tier]}`);
  }
  if (parts.length === 0) return "No sources could be retrieved.";
  const used = parts.join(", ");
  return counts[4] === 0
    ? `Drawing on ${used} source${plural(counts)}; no Tier-4 content was used.`
    : `Drawing on ${used} source${plural(counts)}.`;
}

const plural = (counts: Record<Tier, number>) =>
  Object.values(counts).reduce((a, b) => a + b, 0) === 1 ? "" : "s";

export function toSourceCards(sources: SelectedSource[]): SourceCard[] {
  return sources.map((s) => ({
    id: s.id,
    title: s.title,
    url: s.url,
    kind: s.kind,
    tier: s.tier,
    tierJustification: s.tierJustification,
    retrievalPath: s.retrievalPath,
    snippet: s.snippet || undefined,
  }));
}
