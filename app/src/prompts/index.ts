import fs from "node:fs";
import path from "node:path";

// Prompts are product surface: plain .md files, reviewed in PRs like code
// (specs/slice-1.md §4). Read from disk so they work under any bundler;
// traced into the serverless bundle via next.config.ts. Probe candidates so
// dev (cwd = app/) and traced filesystems both resolve.
const PROMPT_DIR_CANDIDATES = [
  path.resolve(process.cwd(), "src", "prompts"),
  path.resolve(process.cwd(), "app", "src", "prompts"),
];

const PROMPTS_DIR = (() => {
  const found = PROMPT_DIR_CANDIDATES.find((p) => fs.existsSync(p));
  if (!found) {
    throw new Error(`prompts dir not found; tried:\n${PROMPT_DIR_CANDIDATES.join("\n")}`);
  }
  return found;
})();

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
