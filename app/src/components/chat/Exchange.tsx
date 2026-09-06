"use client";

import type { SourceCard, TierMix } from "@/lib/types";
import { AnswerMarkdown } from "./Markdown";
import { SourceCardView } from "./SourceCard";

export interface BaselineState {
  text: string;
  done: boolean;
  aborted: boolean;
}

export interface SourcedState {
  text: string;
  sources: SourceCard[];
  tierMix?: TierMix;
  status?: { phase: string; detail?: string };
  done: boolean;
  aborted: boolean;
}

export interface ExchangeData {
  id: string;
  query: string;
  baseline: BaselineState;
  sourced: SourcedState;
  error?: string;
  inFlight: boolean;
}

export function Exchange({
  exchange,
  baselineCollapsed,
  onToggleBaseline,
  onRetry,
}: {
  exchange: ExchangeData;
  baselineCollapsed: boolean;
  onToggleBaseline: () => void;
  onRetry: () => void;
}) {
  const { query, baseline, sourced, error, inFlight } = exchange;
  const citePrefix = `cite-${exchange.id}`;

  return (
    <section className="space-y-3">
      <div className="flex justify-end">
        <p className="max-w-[85%] rounded-2xl rounded-br-sm bg-zinc-900 px-4 py-2 text-sm text-zinc-50 dark:bg-zinc-100 dark:text-zinc-900">
          {query}
        </p>
      </div>

      {/* Sourced pane first on mobile; wider on desktop (spec §5). */}
      <div className="flex flex-col gap-3 md:flex-row-reverse">
        <div className="min-w-0 rounded-xl border border-emerald-200 bg-emerald-50/40 p-4 dark:border-emerald-900 dark:bg-emerald-950/20 md:flex-[3]">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-emerald-800 dark:text-emerald-300">
            Community-sourced
          </h3>

          {sourced.tierMix?.honestFailure && (
            <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
              No community-authored sources found for this question.
            </div>
          )}

          {sourced.status && !sourced.text && !sourced.done && (
            <p className="animate-pulse text-sm text-zinc-500">
              {sourced.status.detail ?? "Working…"}
            </p>
          )}

          {sourced.text && <AnswerMarkdown text={sourced.text} citePrefix={citePrefix} />}

          {sourced.aborted && (
            <p className="mt-2 text-sm text-red-600 dark:text-red-400">
              The sourced answer could not be completed.
            </p>
          )}

          {sourced.tierMix && !sourced.aborted && (
            <p className="mt-3 border-t border-emerald-200 pt-2 text-xs text-zinc-600 dark:border-emerald-900 dark:text-zinc-400">
              {sourced.tierMix.summary}
            </p>
          )}

          {sourced.sources.length > 0 && (
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {sourced.sources.map((s) => (
                <SourceCardView key={s.id} source={s} anchorId={`${citePrefix}-${s.id}`} />
              ))}
            </div>
          )}
        </div>

        <div className="min-w-0 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900 md:flex-[2]">
          <button
            onClick={onToggleBaseline}
            className="mb-2 flex w-full items-center justify-between text-left text-xs font-semibold uppercase tracking-wide text-zinc-500"
          >
            Default AI (no sources)
            <span aria-hidden>{baselineCollapsed ? "▸" : "▾"}</span>
          </button>
          {!baselineCollapsed && (
            <>
              {!baseline.text && !baseline.done && (
                <p className="animate-pulse text-sm text-zinc-400">Answering…</p>
              )}
              {baseline.text && (
                <AnswerMarkdown text={baseline.text} citePrefix={`${citePrefix}-baseline`} />
              )}
              {baseline.aborted && (
                <p className="mt-2 text-sm text-red-600 dark:text-red-400">
                  The baseline answer could not be completed.
                </p>
              )}
            </>
          )}
        </div>
      </div>

      {error && !inFlight && (
        <div className="flex items-center justify-between rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          <span>{error}</span>
          <button
            onClick={onRetry}
            className="rounded-md border border-red-300 px-3 py-1 font-medium hover:bg-red-100 dark:border-red-800 dark:hover:bg-red-900/40"
          >
            Retry
          </button>
        </div>
      )}
    </section>
  );
}
