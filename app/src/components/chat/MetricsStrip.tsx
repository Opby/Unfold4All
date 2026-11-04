"use client";

import type { AnswerMetrics, FramingTags } from "@/lib/types";

/** Human label for the present:past agency balance (FR10). */
function agencyLabel(f: FramingTags): string {
  const present = f.presentVerbs.length;
  const past = f.pastVerbs.length;
  if (present === 0 && past === 0) return "no community framing detected";
  if (past === 0) return "all present tense";
  if (present === 0) return "all past tense";
  return `present : past = ${(present / past).toFixed(1)} : 1`;
}

function VerbChips({ verbs, tone }: { verbs: string[]; tone: "past" | "present" }) {
  if (verbs.length === 0) return null;
  const cls =
    tone === "present"
      ? "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"
      : "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200";
  return (
    <span className="inline-flex flex-wrap gap-1">
      {verbs.map((v) => (
        <span key={v} className={`rounded-full border px-1.5 py-0.5 text-[11px] leading-tight ${cls}`}>
          {v}
        </span>
      ))}
    </span>
  );
}

function FramingColumn({ title, tags }: { title: string; tags: FramingTags }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
        {title}
      </p>
      <p className="mt-0.5 text-xs text-zinc-700 dark:text-zinc-300">{agencyLabel(tags)}</p>
      <div className="mt-1.5 space-y-1 text-xs">
        {tags.presentVerbs.length > 0 && (
          <div>
            <VerbChips verbs={tags.presentVerbs} tone="present" />
          </div>
        )}
        {tags.pastVerbs.length > 0 && (
          <div>
            <VerbChips verbs={tags.pastVerbs} tone="past" />
          </div>
        )}
      </div>
    </div>
  );
}

/** FR10–FR11 presentation: framing/agency comparison, semantic shifts, and the
 *  embedding-distance divergence score, labeled as text-level estimates (NFR7). */
export function MetricsStrip({ metrics }: { metrics: AnswerMetrics }) {
  const { baseline, sourced, shifts, divergence, community } = metrics;
  const empty =
    baseline.pastVerbs.length + baseline.presentVerbs.length === 0 &&
    sourced.pastVerbs.length + sourced.presentVerbs.length === 0 &&
    shifts.length === 0 &&
    divergence === null;
  if (empty) return null;

  return (
    <div className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-4 text-sm dark:border-indigo-900 dark:bg-indigo-950/20">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-indigo-800 dark:text-indigo-300">
        Framing analysis{community ? ` — ${community}` : ""}
      </h3>

      <div className="grid gap-3 sm:grid-cols-2">
        <FramingColumn title="Default AI" tags={baseline} />
        <FramingColumn title="Community-sourced" tags={sourced} />
      </div>

      {divergence !== null && (
        <div className="mt-3 border-t border-indigo-200 pt-2 dark:border-indigo-900">
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-700 dark:text-zinc-300">
              Semantic shift from grounding: {(divergence * 100).toFixed(0)}%
            </span>
            <span
              className="h-1.5 flex-1 overflow-hidden rounded-full bg-indigo-100 dark:bg-indigo-950"
              role="presentation"
            >
              <span
                className="block h-full rounded-full bg-indigo-500"
                style={{ width: `${Math.min(100, Math.max(2, divergence * 100))}%` }}
              />
            </span>
          </div>
        </div>
      )}

      {shifts.length > 0 && (
        <ul className="mt-2 space-y-1">
          {shifts.map((s) => (
            <li key={s.aspect} className="text-xs text-zinc-700 dark:text-zinc-300">
              <span className="font-medium">{s.aspect}:</span>{" "}
              <span className="text-amber-800 dark:text-amber-300">“{s.baseline}”</span>
              <span aria-hidden> → </span>
              <span className="text-emerald-800 dark:text-emerald-300">“{s.sourced}”</span>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-2 text-[11px] text-zinc-500">
        Estimated from the answer texts (verb tagging + embedding distance) — the
        model&rsquo;s token probabilities aren&rsquo;t observable.
      </p>
    </div>
  );
}
