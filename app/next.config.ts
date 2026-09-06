import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // registry.yaml and the prompt .md files are read from disk at request time,
  // so they must be bundled into the serverless functions (specs/slice-3.md §6).
  // Both paths stay inside the project: `prebuild` (scripts/sync-registry.mjs)
  // copies the repo-root registry into app/sources first, because Vercel's Root
  // Directory setting blocks `..` access at runtime.
  outputFileTracingIncludes: {
    "/api/chat": ["sources/registry.yaml", "src/prompts/**/*.md"],
    "/logs": ["sources/registry.yaml"],
  },
};

export default nextConfig;
