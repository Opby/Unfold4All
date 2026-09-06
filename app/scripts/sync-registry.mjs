// Copies the canonical registry (repo root) into the app so the built output
// never depends on files outside the Next.js project root — Vercel's Root
// Directory setting forbids `..` access at runtime, and file tracing across
// that boundary is unreliable. Runs as `prebuild`; dev reads the repo-root
// copy directly (see src/lib/registry.ts candidate paths).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const source = path.resolve(here, "..", "..", "sources", "registry.yaml");
const destDir = path.resolve(here, "..", "sources");
const dest = path.join(destDir, "registry.yaml");

if (!fs.existsSync(source)) {
  // Already-synced copy is acceptable; a build with neither will fail loudly
  // at request time with the candidate paths listed.
  const status = fs.existsSync(dest) ? "keeping existing copy" : "NO REGISTRY AVAILABLE";
  console.warn(`sync-registry: ${source} not readable — ${status}`);
  process.exit(0);
}

fs.mkdirSync(destDir, { recursive: true });
fs.copyFileSync(source, dest);
console.log(`sync-registry: copied registry.yaml -> ${path.relative(process.cwd(), dest)}`);
