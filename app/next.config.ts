import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // registry.yaml lives at the repo root (outside app/), so widen the tracing
  // root to the repo; the .md prompts and registry are read from disk at
  // request time and must be bundled for serverless (specs/slice-3.md §6).
  outputFileTracingRoot: path.join(__dirname, ".."),
  outputFileTracingIncludes: {
    "/api/chat": ["../sources/registry.yaml", "src/prompts/**/*.md"],
    "/logs": ["../sources/registry.yaml"],
  },
};

export default nextConfig;
