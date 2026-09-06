import { tavily } from "@tavily/core";
import { domainsByTier } from "./registry";

export interface Candidate {
  title: string;
  url: string;
  snippet: string;
  rawContent: string;
  score: number;
  retrievalPath: "index" | "live";
}

const MAX_CANDIDATES = 10;

// Keyless mode (shared rate limit) works when TAVILY_API_KEY is unset —
// fine for local demos; real traffic needs a key.
function client() {
  return tavily({ apiKey: process.env.TAVILY_API_KEY });
}

interface RawResult {
  title?: string;
  url: string;
  content?: string;
  rawContent?: string | null;
  score?: number;
}

function toCandidate(r: RawResult): Candidate {
  return {
    title: r.title || new URL(r.url).hostname,
    url: r.url,
    snippet: (r.content ?? "").slice(0, 200),
    rawContent: r.rawContent ?? "",
    score: r.score ?? 0,
    retrievalPath: "live",
  };
}

/**
 * Two-pass search (specs/slice-1.md §3): pass A restricted to registry
 * Tier 1–2 domains, pass B unrestricted minus registry Tier-4 pins.
 * Both passes always run; failures degrade to fewer/zero candidates
 * (honest-failure handling happens downstream).
 */
export async function searchCommunitySources(query: string): Promise<Candidate[]> {
  const tvly = client();
  const common = {
    searchDepth: "advanced" as const,
    includeRawContent: "markdown" as const,
  };

  const [passA, passB] = await Promise.allSettled([
    tvly.search(query, {
      ...common,
      includeDomains: domainsByTier(1, 2),
      maxResults: 6,
    }),
    tvly.search(query, {
      ...common,
      excludeDomains: domainsByTier(4),
      maxResults: 6,
    }),
  ]);

  const seen = new Set<string>();
  const candidates: Candidate[] = [];
  for (const pass of [passA, passB]) {
    if (pass.status !== "fulfilled") continue;
    for (const r of pass.value.results as RawResult[]) {
      const c = toCandidate(r);
      // Empty extraction → drop rather than sending empty text to the model.
      if (!c.rawContent.trim() && !c.snippet.trim()) continue;
      if (seen.has(c.url)) continue;
      seen.add(c.url);
      candidates.push(c);
    }
  }
  return candidates.slice(0, MAX_CANDIDATES);
}
