import type { SourceCard as SourceCardData } from "@/lib/types";
import { TierBadge } from "./TierBadge";

const KIND_LABEL: Record<SourceCardData["kind"], string> = {
  blog: "Blog",
  video_transcript: "Video transcript",
  oral_history: "Oral history",
  article: "Article",
  site: "Website",
  other: "Source",
};

export function SourceCardView({
  source,
  anchorId,
}: {
  source: SourceCardData;
  anchorId: string;
}) {
  return (
    <div
      id={anchorId}
      className="rounded-lg border border-zinc-200 bg-white p-3 text-sm transition-shadow dark:border-zinc-700 dark:bg-zinc-900"
    >
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs text-zinc-500">[{source.id}]</span>
        <TierBadge tier={source.tier} justification={source.tierJustification} />
        <span
          title={
            source.retrievalPath === "index"
              ? "From the curated, pre-indexed corpus"
              : "Found by live web search for this question"
          }
          className="cursor-help rounded-full border border-zinc-300 px-2 py-0.5 text-xs text-zinc-500 dark:border-zinc-600 dark:text-zinc-400"
        >
          {source.retrievalPath === "index" ? "curated" : "live web"}
        </span>
        <span className="text-xs text-zinc-500">{KIND_LABEL[source.kind]}</span>
      </div>
      <a
        href={source.url}
        target="_blank"
        rel="noopener noreferrer"
        className="font-medium text-zinc-900 underline decoration-zinc-300 underline-offset-2 hover:decoration-zinc-600 dark:text-zinc-100 dark:decoration-zinc-600 dark:hover:decoration-zinc-300"
      >
        {source.title}
      </a>
      {source.snippet && (
        <p className="mt-1 line-clamp-2 text-xs text-zinc-500">{source.snippet}</p>
      )}
    </div>
  );
}
