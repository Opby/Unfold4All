"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { streamChat } from "@/lib/sse-client";
import { Exchange, type ExchangeData } from "@/components/chat/Exchange";

const MAX_QUERY_CHARS = 2000;
const HISTORY_SENT = 6;
const STORAGE_KEY = "unfold4all.exchanges.v1";
const COLLAPSE_KEY = "unfold4all.baselineCollapsed";

function newExchange(query: string): ExchangeData {
  return {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    query,
    baseline: { text: "", done: false, aborted: false },
    sourced: { text: "", sources: [], done: false, aborted: false },
    inFlight: true,
  };
}

function readStorage<T>(key: string, fallback: T): T {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export default function ChatPage() {
  const [exchanges, setExchanges] = useState<ExchangeData[]>([]);
  const [input, setInput] = useState("");
  const [baselineCollapsed, setBaselineCollapsed] = useState(false);
  const [busy, setBusy] = useState(false);
  const stickToBottom = useRef(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<(() => void) | null>(null);

  // Restore session state on mount. sessionStorage is client-only, so this
  // can't move into the useState initializer without a hydration mismatch.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setExchanges(
      readStorage<ExchangeData[]>(STORAGE_KEY, []).map((e) => ({
        ...e,
        inFlight: false,
      })),
    );
    setBaselineCollapsed(readStorage(COLLAPSE_KEY, false));
    return () => abortRef.current?.();
  }, []);

  // Persist finished exchanges; auto-scroll unless the user scrolled up.
  useEffect(() => {
    try {
      sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(exchanges.filter((e) => !e.inFlight)),
      );
    } catch {
      // storage unavailable — fine
    }
    if (stickToBottom.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [exchanges]);

  useEffect(() => {
    const onScroll = () => {
      const gap =
        document.documentElement.scrollHeight - window.scrollY - window.innerHeight;
      stickToBottom.current = gap < 120;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const toggleBaseline = () => {
    setBaselineCollapsed((c) => {
      try {
        sessionStorage.setItem(COLLAPSE_KEY, JSON.stringify(!c));
      } catch {}
      return !c;
    });
  };

  const patchLast = useCallback((fn: (e: ExchangeData) => ExchangeData) => {
    setExchanges((prev) =>
      prev.length === 0 ? prev : [...prev.slice(0, -1), fn(prev[prev.length - 1])],
    );
  }, []);

  const submit = useCallback(
    (query: string) => {
      const trimmed = query.trim();
      if (!trimmed || trimmed.length > MAX_QUERY_CHARS || busy) return;

      const history = exchanges
        .filter((e) => e.sourced.done && !e.sourced.aborted)
        .flatMap((e) => [
          { role: "user" as const, content: e.query },
          { role: "assistant" as const, content: e.sourced.text },
        ])
        .slice(-HISTORY_SENT);

      setBusy(true);
      stickToBottom.current = true;
      setExchanges((prev) => [...prev, newExchange(trimmed)]);

      const finish = () => setBusy(false);
      abortRef.current = streamChat(
        { query: trimmed, history },
        {
          status: (p) =>
            patchLast((e) => ({ ...e, sourced: { ...e.sourced, status: p } })),
          baseline_delta: (p) =>
            patchLast((e) => ({
              ...e,
              baseline: { ...e.baseline, text: e.baseline.text + p.text },
            })),
          baseline_done: (p) =>
            patchLast((e) => ({
              ...e,
              baseline: { ...e.baseline, done: true, aborted: !!p.aborted },
            })),
          sources: (p) =>
            patchLast((e) => ({
              ...e,
              sourced: { ...e.sourced, sources: p.sources },
            })),
          sourced_delta: (p) =>
            patchLast((e) => ({
              ...e,
              sourced: { ...e.sourced, text: e.sourced.text + p.text, status: undefined },
            })),
          sourced_done: (p) =>
            patchLast((e) => ({
              ...e,
              sourced: {
                ...e.sourced,
                tierMix: p.tierMix,
                done: true,
                aborted: !!p.aborted,
                status: undefined,
              },
            })),
          done: () => {
            patchLast((e) => ({ ...e, inFlight: false }));
            finish();
          },
          error: (p) => {
            patchLast((e) => ({ ...e, error: p.message, inFlight: false }));
            finish();
          },
          onTransportError: (message) => {
            patchLast((e) => ({ ...e, error: message, inFlight: false }));
            finish();
          },
        },
      );
    },
    [busy, exchanges, patchLast],
  );

  const overLimit = input.length > MAX_QUERY_CHARS;

  return (
    <div className="mx-auto flex min-h-dvh max-w-4xl flex-col px-4">
      <header className="sticky top-0 z-10 -mx-4 border-b border-zinc-200 bg-zinc-50/90 px-4 py-3 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/90">
        <Link href="/" className="text-sm font-semibold">
          unfold4all
        </Link>
        <span className="ml-2 text-xs text-zinc-500">
          answers grounded in community-authored sources
        </span>
      </header>

      <main className="flex-1 space-y-8 py-6">
        {exchanges.length === 0 && (
          <div className="mt-16 text-center text-sm text-zinc-500">
            <p className="mb-2 text-base font-medium text-zinc-700 dark:text-zinc-300">
              Ask about Ohlone history and culture
            </p>
            <p>
              Try: &ldquo;What is the history of the Ohlone people?&rdquo; — you&rsquo;ll see a
              default AI answer next to one grounded in the community&rsquo;s own sources.
            </p>
          </div>
        )}
        {exchanges.map((e, i) => (
          <Exchange
            key={e.id}
            exchange={e}
            baselineCollapsed={baselineCollapsed}
            onToggleBaseline={toggleBaseline}
            onRetry={() => {
              setExchanges((prev) => prev.filter((_, j) => j !== i));
              submit(e.query);
            }}
          />
        ))}
        <div ref={bottomRef} />
      </main>

      <footer className="sticky bottom-0 -mx-4 border-t border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit(input);
            setInput("");
          }}
          className="flex gap-2"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={busy}
            placeholder={busy ? "Answering…" : "Ask a question…"}
            className="min-w-0 flex-1 rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm outline-none focus:border-zinc-500 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900"
          />
          <button
            type="submit"
            disabled={busy || !input.trim() || overLimit}
            className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            Ask
          </button>
        </form>
        {overLimit && (
          <p className="mt-1 text-xs text-red-600">
            Questions are limited to {MAX_QUERY_CHARS} characters.
          </p>
        )}
      </footer>
    </div>
  );
}
