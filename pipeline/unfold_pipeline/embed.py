from __future__ import annotations

import psycopg

from .chunk import chunk_text
from .config import EMBED_MODEL, Settings

BATCH_SIZE = 128


def _vector_literal(values: list[float]) -> str:
    return "[" + ",".join(f"{v:.7f}" for v in values) + "]"


def embed(conn: psycopg.Connection, settings: Settings, re_all: bool) -> None:
    if not settings.voyage_api_key:
        raise SystemExit("VOYAGE_API_KEY is not set (env or pipeline/.env)")
    import voyageai

    client = voyageai.Client(api_key=settings.voyage_api_key)

    with conn.cursor() as cur:
        if re_all:
            cur.execute("DELETE FROM chunks")
            conn.commit()
        cur.execute(
            """SELECT d.id, d.raw_text FROM documents d
               WHERE NOT EXISTS (SELECT 1 FROM chunks c WHERE c.document_id = d.id)
               ORDER BY d.id"""
        )
        pending = cur.fetchall()

    if not pending:
        print("nothing to embed (all documents chunked)")
        return

    print(f"embedding {len(pending)} documents ...")
    total_chunks = 0
    for doc_id, raw_text in pending:
        texts = chunk_text(raw_text)
        embeddings: list[list[float]] = []
        for i in range(0, len(texts), BATCH_SIZE):
            result = client.embed(
                texts[i : i + BATCH_SIZE], model=EMBED_MODEL, input_type="document"
            )
            embeddings.extend(result.embeddings)
        with conn.cursor() as cur:
            for seq, (text, vec) in enumerate(zip(texts, embeddings)):
                cur.execute(
                    """INSERT INTO chunks (document_id, seq, text, embedding)
                       VALUES (%s, %s, %s, %s::vector)
                       ON CONFLICT (document_id, seq) DO UPDATE SET
                         text = EXCLUDED.text, embedding = EXCLUDED.embedding""",
                    (doc_id, seq, text, _vector_literal(vec)),
                )
        conn.commit()
        total_chunks += len(texts)
    print(f"embedded {total_chunks} chunks across {len(pending)} documents")
