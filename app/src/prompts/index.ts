import fs from "node:fs";
import path from "node:path";

// Prompts are product surface: plain .md files, reviewed in PRs like code
// (specs/slice-1.md §4). Read from disk so they work under any bundler;
// Vercel file tracing handled in Slice 3.
const PROMPTS_DIR = path.resolve(process.cwd(), "src", "prompts");

function load(name: string): string {
  return fs.readFileSync(path.join(PROMPTS_DIR, `${name}.md`), "utf8");
}

let cache: Record<string, string> | null = null;

export function prompts() {
  cache ??= {
    sourcedAnswer: load("sourced-answer"),
    baselineAnswer: load("baseline-answer"),
    tierClassifier: load("tier-classifier"),
  };
  return cache as { sourcedAnswer: string; baselineAnswer: string; tierClassifier: string };
}
