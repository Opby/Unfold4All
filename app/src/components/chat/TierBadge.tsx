import { TIER_LABEL, TIER_STYLE } from "@/lib/tiers";
import type { Tier } from "@/lib/types";

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
