const EMBED_MODEL = "voyage-4-lite";

/** Embed a search query via Voyage REST (dims must match pipeline: 1024). */
export async function embedQuery(text: string): Promise<number[]> {
  const apiKey = process.env.VOYAGE_API_KEY;
  if (!apiKey) throw new Error("VOYAGE_API_KEY is not set");
  const resp = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: EMBED_MODEL, input: [text], input_type: "query" }),
  });
  if (!resp.ok) {
    throw new Error(`Voyage embeddings failed: ${resp.status} ${await resp.text()}`);
  }
  const data = (await resp.json()) as { data: { embedding: number[] }[] };
  return data.data[0].embedding;
}
