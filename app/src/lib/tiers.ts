import type { Tier } from "./types";

// Shared tier presentation — used by the chat's badges and the intro page's
// rubric table. The rubric itself lives in design.md; keep wording aligned.

export const TIER_LABEL: Record<Tier, string> = {
  1: "Tier 1 · community-authored",
  2: "Tier 2 · community-collaborative",
  3: "Tier 3 · secondary scholarship",
  4: "Tier 4 · generic web",
};

export const TIER_STYLE: Record<Tier, string> = {
  1: "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200",
  2: "bg-sky-100 text-sky-900 dark:bg-sky-900/40 dark:text-sky-200",
  3: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200",
  4: "bg-zinc-200 text-zinc-700 dark:bg-zinc-700/60 dark:text-zinc-300",
};

export const TIER_DESCRIPTION: Record<Tier, string> = {
  1: "The community speaking for itself: tribal organizations' own sites and blogs, their video channels, oral histories, newsletters.",
  2: "Made with the community: long-form interviews, co-curated exhibits, journalism quoting members at length.",
  3: "Academic, archival, or journalistic work about the community without substantial community voice.",
  4: "What default search surfaces: encyclopedias, textbook summaries, SEO content. Used only as labeled gap-filler.",
};
