import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { anthropic, CLASSIFIER_MODEL } from "./anthropic";
import { embedTexts } from "./voyage";
import { prompts } from "@/prompts";
import type { AnswerMetrics } from "./types";

// Answers are typically well under this; the cap bounds the haiku call's input.
const MAX_ANSWER_CHARS = 8000;
const METRICS_TIMEOUT_MS = 25_000;

const Framing = z.object({
  pastVerbs: z.array(z.string()).max(12),
  presentVerbs: z.array(z.string()).max(12),
});

const FramingAnalysis = z.object({
  community: z.string(),
  baseline: Framing,
  sourced: Framing,
  shifts: z
    .array(
      z.object({
        aspect: z.string(),
        baseline: z.string(),
        sourced: z.string(),
      }),
    )
    .max(3),
});

async function analyzeFraming(
  query: string,
  baselineText: string,
  sourcedText: string,
  signal: AbortSignal,
): Promise<z.infer<typeof FramingAnalysis>> {
  const response = await anthropic().messages.parse(
    {
      model: CLASSIFIER_MODEL,
      max_tokens: 1024,
      system: prompts().framingAnalysis,
      messages: [
        {
          role: "user",
          content: [
            `Question: ${query}`,
            `BASELINE answer:\n${baselineText.slice(0, MAX_ANSWER_CHARS)}`,
            `SOURCED answer:\n${sourcedText.slice(0, MAX_ANSWER_CHARS)}`,
          ].join("\n\n---\n\n"),
        },
      ],
      output_config: { format: zodOutputFormat(FramingAnalysis) },
    },
    { signal },
  );
  const parsed = response.parsed_output;
  if (!parsed) throw new Error("framing analysis parse failed");
  return parsed;
}

function cosineDistance(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  if (denom === 0) return 0;
  // Clamp: float error can push the similarity a hair outside [-1, 1].
  const sim = Math.max(-1, Math.min(1, dot / denom));
  return (1 - sim) / 2; // map [-1,1] similarity → [0,1] distance
}

/** Embedding distance between the two answers (FR11's divergence proxy);
 *  null when Voyage is not configured or the call fails. */
async function computeDivergence(
  baselineText: string,
  sourcedText: string,
): Promise<number | null> {
  if (!process.env.VOYAGE_API_KEY) return null;
  try {
    const [a, b] = await embedTexts(
      [baselineText.slice(0, MAX_ANSWER_CHARS), sourcedText.slice(0, MAX_ANSWER_CHARS)],
      "document",
    );
    return Number(cosineDistance(a, b).toFixed(4));
  } catch (err) {
    console.error("divergence embedding failed:", err);
    return null;
  }
}

/**
 * FR10–FR11: one cheap classifier call + one embedding call, run only after
 * both answers have fully streamed (NFR6). Returns null on failure — metrics
 * are never worth failing an exchange over.
 */
export async function computeAnswerMetrics(
  query: string,
  baselineText: string,
  sourcedText: string,
): Promise<AnswerMetrics | null> {
  try {
    const signal = AbortSignal.timeout(METRICS_TIMEOUT_MS);
    const [framing, divergence] = await Promise.all([
      analyzeFraming(query, baselineText, sourcedText, signal),
      computeDivergence(baselineText, sourcedText),
    ]);
    return { ...framing, divergence };
  } catch (err) {
    console.error("answer metrics failed:", err);
    return null;
  }
}
