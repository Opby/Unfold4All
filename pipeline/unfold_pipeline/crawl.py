"""Fetch Tier 1-2 sites into `documents`: sitemap-first discovery, trafilatura
extraction, sha256 hash-skip, polite pacing (>=1s per domain, robots.txt via
trafilatura's fetch defaults)."""

from __future__ import annotations

import hashlib
import time
import xml.etree.ElementTree as ET
from urllib.parse import urlparse

import httpx
import psycopg
import trafilatura
from trafilatura import spider

from .registry import crawlable_sources
from .youtube import crawl_youtube_channel

FETCH_DELAY_S = 1.0
SKIP_EXTENSIONS = (".pdf", ".jpg", ".jpeg", ".png", ".gif", ".mp3", ".mp4", ".zip", ".doc")
UA = "unfold4all-pipeline/0.1 (+https://unfold4all.org; respectful curator bot)"


def _same_domain(url: str, domain: str) -> bool:
    host = urlparse(url).hostname or ""
    return host == domain or host.endswith("." + domain)


def _sitemap_urls(domain: str, cap: int) -> list[str]:
    """Read /sitemap.xml (following one level of sitemap indexes)."""
    found: list[str] = []
    queue = [f"https://{domain}/sitemap.xml", f"https://www.{domain}/sitemap.xml"]
    seen_maps: set[str] = set()
    with httpx.Client(timeout=20, follow_redirects=True, headers={"User-Agent": UA}) as client:
        while queue and len(found) < cap * 3:
            sm_url = queue.pop(0)
            if sm_url in seen_maps:
                continue
            seen_maps.add(sm_url)
            try:
                resp = client.get(sm_url)
                if resp.status_code != 200:
                    continue
                root = ET.fromstring(resp.content)
            except Exception:
                continue
            ns = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}
            for loc in root.findall(".//sm:sitemap/sm:loc", ns):
                if loc.text and len(seen_maps) < 10:
                    queue.append(loc.text.strip())
            for loc in root.findall(".//sm:url/sm:loc", ns):
                if loc.text:
                    found.append(loc.text.strip())
    return found


def _spider_urls(domain: str, cap: int) -> list[str]:
    try:
        to_visit, known = spider.focused_crawler(
            f"https://{domain}/", max_seen_urls=cap * 3, max_known_urls=cap * 10
        )
        return list(known)
    except Exception as err:
        print(f"  spider failed for {domain}: {err}")
        return []


def discover_urls(domain: str, cap: int) -> list[str]:
    urls = _sitemap_urls(domain, cap) or _spider_urls(domain, cap)
    cleaned: list[str] = []
    seen: set[str] = set()
    for url in urls:
        url = url.split("#")[0]
        if not _same_domain(url, domain):
            continue
        if url.lower().endswith(SKIP_EXTENSIONS):
            continue
        if url in seen:
            continue
        seen.add(url)
        cleaned.append(url)
        if len(cleaned) >= cap:
            break
    return cleaned


def _extract(url: str) -> tuple[str, str] | None:
    """(title, text) or None."""
    downloaded = trafilatura.fetch_url(url)
    if not downloaded:
        return None
    text = trafilatura.extract(downloaded, include_comments=False)
    if not text or len(text.strip()) < 200:  # skip boilerplate-only pages
        return None
    title = ""
    try:
        meta = trafilatura.extract_metadata(downloaded)
        title = (meta.title or "") if meta else ""
    except Exception:
        pass
    return (title or urlparse(url).path.strip("/") or url, text.strip())


def upsert_document(
    conn: psycopg.Connection, source_id: int, url: str, title: str, text: str
) -> str:
    """Returns 'new' | 'updated' | 'unchanged'."""
    content_hash = hashlib.sha256(text.encode()).hexdigest()
    with conn.cursor() as cur:
        cur.execute("SELECT id, content_hash FROM documents WHERE url = %s", (url,))
        row = cur.fetchone()
        if row and row[1] == content_hash:
            return "unchanged"
        if row:
            cur.execute(
                """UPDATE documents SET title=%s, raw_text=%s, content_hash=%s,
                   fetched_at=now() WHERE id=%s""",
                (title, text, content_hash, row[0]),
            )
            cur.execute("DELETE FROM chunks WHERE document_id = %s", (row[0],))
            conn.commit()
            return "updated"
        cur.execute(
            """INSERT INTO documents (source_id, url, title, raw_text, content_hash)
               VALUES (%s, %s, %s, %s, %s)""",
            (source_id, url, title, text, content_hash),
        )
        conn.commit()
        return "new"


def crawl(conn: psycopg.Connection, only_domain: str | None, max_pages: int) -> None:
    for source_id, domain, kind in crawlable_sources(conn):
        if only_domain and domain != only_domain:
            continue
        if kind == "youtube_channel":
            crawl_youtube_channel(conn, source_id, domain, max_pages)
            continue
        print(f"crawling {domain} (cap {max_pages}) ...")
        urls = discover_urls(domain, max_pages)
        print(f"  discovered {len(urls)} urls")
        counts = {"new": 0, "updated": 0, "unchanged": 0, "skipped": 0}
        for url in urls:
            time.sleep(FETCH_DELAY_S)
            extracted = _extract(url)
            if not extracted:
                counts["skipped"] += 1
                continue
            title, text = extracted
            counts[upsert_document(conn, source_id, url, title, text)] += 1
        print(f"  {counts}")
