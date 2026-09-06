import { getPool } from "./pg";
import { embedQuery } from "./voyage";
import type { ClassifiedCandidate } from "./classify";
import type { SourceKind, Tier } from "./types";

const TOP_K = 8;
const COVERAGE_MIN_SIMILARITY = 0.45;
const COVERAGE_MIN_CHUNKS = 3;
const COVERAGE_MIN_DOCS = 2;
// Below this, a chunk is noise for the query: the index always returns
// nearest neighbors, and admitting irrelevant Tier-1 chunks would defeat
// honest failure (FR8). Measured: real queries ≥0.53, nonsense probes ≤0.36.
const MIN_CANDIDATE_SIMILARITY = 0.4;

interface ChunkHit {
  docId: number;
  url: string;
  title: string;
  domain: string;
  tier: Tier;
  kind: SourceKind;
  note: string;
  seq: number;
  text: string;
  similarity: number;
}

export interface IndexSearchResult {
  candidates: ClassifiedCandidate[];
  /** ≥3 chunks with similarity ≥0.45 across ≥2 distinct Tier 1–2 documents. */
  coverageMet: boolean;
}

export async function searchIndex(query: string): Promise<IndexSearchResult> {
  const embedding = await embedQuery(query);
  const vector = `[${embedding.join(",")}]`;

  const { rows } = await getPool().query<{
    doc_id: number;
    url: string;
    title: string;
    domain: string;
    tier: number;
    kind: string;
    note: string;
    seq: number;
    text: string;
    similarity: number;
  }>(
    `SELECT d.id AS doc_id, d.url, d.title, s.domain, s.tier, s.kind, s.note,
            c.seq, c.text, 1 - (c.embedding <=> $1::vector) AS similarity
     FROM chunks c
     JOIN documents d ON d.id = c.document_id
     JOIN sources s ON s.id = d.source_id
     ORDER BY c.embedding <=> $1::vector
     LIMIT $2`,
    [vector, TOP_K],
  );

  const hits: ChunkHit[] = rows
    .filter((r) => Number(r.similarity) >= MIN_CANDIDATE_SIMILARITY)
    .map((r) => ({
    docId: r.doc_id,
    url: r.url,
    title: r.title,
    domain: r.domain,
    tier: r.tier as Tier,
    kind: r.kind as SourceKind,
    note: r.note,
    seq: r.seq,
    text: r.text,
    similarity: Number(r.similarity),
  }));

  const strongCommunity = hits.filter(
    (h) => h.similarity >= COVERAGE_MIN_SIMILARITY && (h.tier === 1 || h.tier === 2),
  );
  const coverageMet =
    strongCommunity.length >= COVERAGE_MIN_CHUNKS &&
    new Set(strongCommunity.map((h) => h.docId)).size >= COVERAGE_MIN_DOCS;

  const byDoc = new Map<number, ChunkHit[]>();
  for (const h of hits) {
    byDoc.set(h.docId, [...(byDoc.get(h.docId) ?? []), h]);
  }

  const candidates: ClassifiedCandidate[] = [...byDoc.values()].map((chunks) => {
    const sorted = [...chunks].sort((a, b) => a.seq - b.seq);
    const first = sorted[0];
    return {
      title: first.title || first.domain,
      url: first.url,
      snippet: sorted[0].text.slice(0, 200),
      rawContent: sorted.map((c) => c.text).join("\n\n"),
      score: Math.max(...chunks.map((c) => c.similarity)),
      retrievalPath: "index",
      tier: first.tier,
      kind: first.kind,
      tierJustification: first.note || "Curated index source",
    };
  });

  return { candidates, coverageMet };
}
