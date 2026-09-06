"""Paragraph-boundary chunking: ~3200 chars (~800 tokens) with ~400-char
overlap carried from the previous chunk's tail (specs/slice-2.md §2)."""

from __future__ import annotations

CHUNK_CHARS = 3200
OVERLAP_CHARS = 400


def chunk_text(text: str) -> list[str]:
    paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
    if not paragraphs:
        paragraphs = [text.strip()]

    chunks: list[str] = []
    current = ""
    for para in paragraphs:
        # A single paragraph longer than the budget gets hard-split.
        while len(para) > CHUNK_CHARS:
            head, para = para[:CHUNK_CHARS], para[CHUNK_CHARS - OVERLAP_CHARS :]
            if current:
                chunks.append(current)
                current = ""
            chunks.append(head)
        if len(current) + len(para) + 2 > CHUNK_CHARS and current:
            chunks.append(current)
            current = current[-OVERLAP_CHARS:] + "\n\n" + para
        else:
            current = f"{current}\n\n{para}" if current else para
    if current.strip():
        chunks.append(current)
    return chunks
