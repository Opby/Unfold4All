import type { Tier } from "@/lib/types";

const TIER_LABEL: Record<Tier, string> = {
  1: "Tier 1 · community-authored",
  2: "Tier 2 · community-collaborative",
  3: "Tier 3 · secondary scholarship",
  4: "Tier 4 · generic web",
};

const TIER_STYLE: Record<Tier, string> = {
  1: "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200",
  2: "bg-sky-100 text-sky-900 dark:bg-sky-900/40 dark:text-sky-200",
  3: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200",
  4: "bg-zinc-200 text-zinc-700 dark:bg-zinc-700/60 dark:text-zinc-300",
};

export function TierBadge({ tier, justification }: { tier: Tier; justification: string }) {
  return (
    <span
      title={justification}
      className={`inline-block cursor-help rounded-full px-2 py-0.5 text-xs font-medium ${TIER_STYLE[tier]}`}
    >
      {TIER_LABEL[tier]}
    </span>
  );
}
