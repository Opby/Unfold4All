"""YouTube channel ingestion: video list via channel RSS, transcripts via
youtube-transcript-api. Registry entries with kind `youtube_channel` must set
`domain` to the channel id (e.g. `youtube.com/channel/UCxxxx` is pinned by its
UC... id in `note` as `channel_id: UC...`). Tolerates zero such sources."""

from __future__ import annotations

import re
import time
import xml.etree.ElementTree as ET

import httpx
import psycopg

FETCH_DELAY_S = 1.0


def _channel_id(domain: str, note: str) -> str | None:
    m = re.search(r"channel_id:\s*(UC[\w-]{10,})", note)
    if m:
        return m.group(1)
    m = re.search(r"(UC[\w-]{20,})", domain)
    return m.group(1) if m else None


def _channel_videos(channel_id: str) -> list[tuple[str, str]]:
    """[(video_id, title)] from the channel's RSS feed (latest ~15)."""
    url = f"https://www.youtube.com/feeds/videos.xml?channel_id={channel_id}"
    resp = httpx.get(url, timeout=20)
    resp.raise_for_status()
    root = ET.fromstring(resp.content)
    ns = {"a": "http://www.w3.org/2005/Atom", "yt": "http://www.youtube.com/xml/schemas/2015"}
    videos = []
    for entry in root.findall("a:entry", ns):
        vid = entry.findtext("yt:videoId", namespaces=ns)
        title = entry.findtext("a:title", namespaces=ns) or vid
        if vid:
            videos.append((vid, title))
    return videos


def crawl_youtube_channel(
    conn: psycopg.Connection, source_id: int, domain: str, max_videos: int
) -> None:
    from youtube_transcript_api import YouTubeTranscriptApi

    from .crawl import upsert_document  # late import to avoid cycle

    with conn.cursor() as cur:
        cur.execute("SELECT note FROM sources WHERE id = %s", (source_id,))
        note = (cur.fetchone() or [""])[0]
    channel_id = _channel_id(domain, note)
    if not channel_id:
        print(f"skipping {domain}: no channel_id (add `channel_id: UC...` to its registry note)")
        return

    print(f"fetching transcripts for channel {channel_id} ...")
    api = YouTubeTranscriptApi()
    counts = {"new": 0, "updated": 0, "unchanged": 0, "skipped": 0}
    for video_id, title in _channel_videos(channel_id)[:max_videos]:
        time.sleep(FETCH_DELAY_S)
        try:
            transcript = api.fetch(video_id)
            text = " ".join(snippet.text for snippet in transcript).strip()
        except Exception:
            counts["skipped"] += 1
            continue
        if len(text) < 200:
            counts["skipped"] += 1
            continue
        url = f"https://www.youtube.com/watch?v={video_id}"
        counts[upsert_document(conn, source_id, url, title, text)] += 1
    print(f"  {counts}")
