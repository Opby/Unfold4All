import { NextRequest } from "next/server";
import { streamBaselineAnswer, streamSourcedAnswer } from "@/lib/answer";
import { classifyCandidates, type ClassifiedCandidate } from "@/lib/classify";
import { searchIndex } from "@/lib/index-search";
import { indexAvailable } from "@/lib/pg";
import { logQuery } from "@/lib/query-log";
import { searchCommunitySources } from "@/lib/tavily";
import { selectSources, toSourceCards } from "@/lib/select";
import { sseEmitter, type SseEmitter } from "@/lib/sse";
import type { ChatRequest } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300; // Vercel Fluid compute; answers can run minutes

const MAX_QUERY_CHARS = 2000;
const MAX_HISTORY = 6;

function parseRequest(body: unknown): ChatRequest | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as Record<string, unknown>;
  if (typeof b.query !== "string") return null;
  const query = b.query.trim();
  if (query.length === 0 || query.length > MAX_QUERY_CHARS) return null;

  let history: ChatRequest["history"];
  if (Array.isArray(b.history)) {
    history = b.history
      .filter(
        (h): h is { role: "user" | "assistant"; content: string } =>
          typeof h === "object" &&
          h !== null &&
          (h.role === "user" || h.role === "assistant") &&
          typeof h.content === "string",
      )
      .slice(-MAX_HISTORY);
  }
  return { query, history, compare: b.compare !== false };
}

async function runBaseline(req: ChatRequest, emit: SseEmitter, signal: AbortSignal) {
  if (!req.compare) return;
  try {
    await streamBaselineAnswer(req, {
      signal,
      onText: (text) => emit.emit("baseline_delta", { text }),
    });
    emit.emit("baseline_done", {});
  } catch (err) {
    if (signal.aborted) return;
    console.error("baseline answer failed:", err);
    emit.emit("baseline_done", { aborted: true });
    throw err; // so total failure (both sides) yields a terminal `error`
  }
}

/** Hybrid retrieval (specs/slice-2.md §3): curated index first; live search
 *  only when index coverage is thin. Merge dedupes by URL, index wins. */
async function retrieve(req: ChatRequest, emit: SseEmitter) {
  const paths: ("index" | "live")[] = [];
  let indexCandidates: ClassifiedCandidate[] = [];
  let coverageMet = false;

  if (indexAvailable()) {
    emit.emit("status", { phase: "searching", detail: "Searching curated index…" });
    try {
      ({ candidates: indexCandidates, coverageMet } = await searchIndex(req.query));
      paths.push("index");
    } catch (err) {
      console.error("index search failed:", err);
    }
  }

  let classified: ClassifiedCandidate[] = indexCandidates;
  if (!coverageMet) {
    emit.emit("status", { phase: "searching", detail: "Searching community sources…" });
    const liveCandidates = await searchCommunitySources(req.query).catch((err) => {
      console.error("source search failed:", err);
      return [];
    });
    paths.push("live");
    emit.emit("status", { phase: "classifying", detail: "Assessing source authorship…" });
    const indexUrls = new Set(indexCandidates.map((c) => c.url));
    const classifiedLive = await classifyCandidates(
      req.query,
      liveCandidates.filter((c) => !indexUrls.has(c.url)),
    );
    classified = [...indexCandidates, ...classifiedLive];
  } else {
    console.log(`index coverage met for query; skipping live search`);
  }
  return { classified, paths };
}

async function runSourced(
  req: ChatRequest,
  emit: SseEmitter,
  signal: AbortSignal,
  started: number,
) {
  const { classified, paths } = await retrieve(req, emit);
  const { sources, tierMix } = selectSources(classified);
  const cards = toSourceCards(sources);

  emit.emit("sources", { sources: cards });
  emit.emit("status", { phase: "answering", detail: "Writing grounded answer…" });

  try {
    await streamSourcedAnswer(req, sources, tierMix.honestFailure, {
      signal,
      onText: (text) => emit.emit("sourced_delta", { text }),
    });
    emit.emit("sourced_done", { tierMix });
  } catch (err) {
    if (signal.aborted) return;
    console.error("sourced answer failed:", err);
    emit.emit("sourced_done", { tierMix, aborted: true });
    throw err;
  } finally {
    if (!signal.aborted) {
      logQuery({
        query: req.query,
        paths,
        tierMix,
        sources: cards,
        latencyMs: Date.now() - started,
      });
    }
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  const body = await request.json().catch(() => null);
  const req = parseRequest(body);
  if (!req) {
    return Response.json(
      { error: `query must be a non-empty string of at most ${MAX_QUERY_CHARS} characters` },
      { status: 400 },
    );
  }

  const started = Date.now();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = sseEmitter(controller);
      const signal = request.signal;

      const [baseline, sourced] = await Promise.allSettled([
        runBaseline(req, emit, signal),
        runSourced(req, emit, signal, started),
      ]);

      // Single terminal event: `error` only on total failure (spec §1).
      const sourcedFailed = sourced.status === "rejected";
      const baselineFailed = baseline.status === "rejected";
      if (sourcedFailed && (baselineFailed || !req.compare)) {
        emit.emit("error", {
          message: "Something went wrong answering this question. Please try again.",
          phase: "answering",
        });
      } else {
        emit.emit("done", { latencyMs: Date.now() - started });
      }
      emit.close();
    },
    cancel() {
      // Client disconnected; request.signal aborts the model calls.
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
