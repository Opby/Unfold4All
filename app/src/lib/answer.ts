import { anthropic, ANSWER_MODEL } from "./anthropic";
import { prompts } from "@/prompts";
import type { SelectedSource } from "./select";
import type { ChatRequest } from "./types";

// Refusal resilience: server-side fallback routes a policy decline to another
// model inside the same call (claude-api guidance for Opus 5).
const FALLBACK_BETA = "server-side-fallback-2026-07-01";

interface StreamArgs {
  signal: AbortSignal;
  onText: (text: string) => void;
}

async function runStream(
  params: {
    system: string;
    messages: { role: "user" | "assistant"; content: string }[];
    maxTokens: number;
  },
  { signal, onText }: StreamArgs,
): Promise<void> {
  const stream = anthropic().beta.messages.stream(
    {
      model: ANSWER_MODEL,
      max_tokens: params.maxTokens,
      betas: [FALLBACK_BETA],
      fallbacks: "default",
      system: params.system,
      messages: params.messages,
    },
    { signal },
  );
  stream.on("text", onText);
  const final = await stream.finalMessage();
  if (final.stop_reason === "refusal") {
    throw new Error("The model declined to answer this question.");
  }
}

export async function streamBaselineAnswer(
  req: ChatRequest,
  args: StreamArgs,
): Promise<void> {
  await runStream(
    {
      system: prompts().baselineAnswer,
      messages: [
        ...(req.history ?? []),
        { role: "user", content: req.query },
      ],
      maxTokens: 1024,
    },
    args,
  );
}

/** User-message template per specs/slice-1.md §4.1. */
export function buildSourcedUserMessage(
  query: string,
  sources: SelectedSource[],
  honestFailure: boolean,
): string {
  const blocks = sources.map(
    (s) => `[${s.id}] (Tier ${s.tier}, ${s.kind}) ${s.title} — ${s.url}\n${s.text}`,
  );
  return [
    `Question: ${query}`,
    sources.length > 0 ? `Sources:\n\n${blocks.join("\n\n---\n\n")}` : "Sources: none retrieved.",
    `honestFailure: ${honestFailure}`,
  ].join("\n\n");
}

export async function streamSourcedAnswer(
  req: ChatRequest,
  sources: SelectedSource[],
  honestFailure: boolean,
  args: StreamArgs,
): Promise<void> {
  await runStream(
    {
      system: prompts().sourcedAnswer,
      messages: [
        ...(req.history ?? []),
        {
          role: "user",
          content: buildSourcedUserMessage(req.query, sources, honestFailure),
        },
      ],
      maxTokens: 4096,
    },
    args,
  );
}
