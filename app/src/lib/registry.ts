import fs from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import type { SourceKind, Tier } from "./types";

export interface RegistryEntry {
  domain: string;
  name: string;
  tier: Tier;
  kind: SourceKind;
  note: string;
}

interface RegistryFile {
  version: number;
  domains: RegistryEntry[];
}

// Dev/self-host: cwd is app/, registry lives at the repo root. Vercel needs
// outputFileTracingIncludes for this path (deferred to Slice 3).
const REGISTRY_PATH = path.resolve(process.cwd(), "..", "sources", "registry.yaml");

let cached: RegistryEntry[] | null = null;
let cachedMtime = 0;

export function loadRegistry(): RegistryEntry[] {
  const mtime = fs.statSync(REGISTRY_PATH).mtimeMs;
  if (!cached || mtime !== cachedMtime) {
    const file = parse(fs.readFileSync(REGISTRY_PATH, "utf8")) as RegistryFile;
    cached = file.domains;
    cachedMtime = mtime;
  }
  return cached;
}

/** Registry entry whose domain matches the host exactly or as a parent domain. */
export function matchRegistry(url: string): RegistryEntry | undefined {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return undefined;
  }
  return loadRegistry().find(
    (e) => host === e.domain || host.endsWith(`.${e.domain}`),
  );
}

export function domainsByTier(...tiers: Tier[]): string[] {
  return loadRegistry()
    .filter((e) => tiers.includes(e.tier))
    .map((e) => e.domain);
}
