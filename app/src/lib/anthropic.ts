import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null = null;

export function anthropic(): Anthropic {
  client ??= new Anthropic();
  return client;
}

export const ANSWER_MODEL = "claude-opus-5";
export const CLASSIFIER_MODEL = "claude-haiku-4-5";
