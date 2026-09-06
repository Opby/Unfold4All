import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { anthropic, CLASSIFIER_MODEL } from "./anthropic";
import { matchRegistry } from "./registry";
import { prompts } from "@/prompts";
import type { Candidate } from "./tavily";
import type { SourceKind, Tier } from "./types";

const Classification = z.object({
  tier: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  kind: z.enum([
    "blog",
    "video_transcript",
    "oral_history",
    "article",
    "site",
    "other",
  ]),
  justification: z.string(),
});

export interface ClassifiedCandidate extends Candidate {
  tier: Tier;
  kind: SourceKind;
  tierJustification: string;
}

async function classifyOne(
  query: string,
  c: Candidate,
): Promise<ClassifiedCandidate> {
  const response = await anthropic().messages.parse({
    model: CLASSIFIER_MODEL,
    max_tokens: 512,
    system: prompts().tierClassifier,
    messages: [
      {
        role: "user",
        content: [
          `Question the user asked (identifies the community): ${query}`,
          `Source URL: ${c.url}`,
          `Source title: ${c.title}`,
          `Content excerpt:\n${(c.rawContent || c.snippet).slice(0, 1500)}`,
        ].join("\n\n"),
      },
    ],
    output_config: { format: zodOutputFormat(Classification) },
  });
  const parsed = response.parsed_output;
  if (!parsed) throw new Error("classification parse failed");
  return {
    ...c,
    tier: parsed.tier,
    kind: parsed.kind,
    tierJustification: parsed.justification.slice(0, 140),
  };
}

/**
 * Registry pin wins; unknown hosts go to the classifier in parallel.
 * Classifier failure → conservative Tier 4 (specs/slice-1.md §3).
 */
export async function classifyCandidates(
  query: string,
  candidates: Candidate[],
): Promise<ClassifiedCandidate[]> {
  return Promise.all(
    candidates.map(async (c) => {
      const pinned = matchRegistry(c.url);
      if (pinned) {
        return {
          ...c,
          tier: pinned.tier,
          kind: pinned.kind,
          tierJustification: pinned.note,
        };
      }
      try {
        return await classifyOne(query, c);
      } catch {
        return {
          ...c,
          tier: 4 as Tier,
          kind: "other" as SourceKind,
          tierJustification: "Unclassified (classifier unavailable)",
        };
      }
    }),
  );
}
