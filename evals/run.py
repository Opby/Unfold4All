#!/usr/bin/env python
"""Golden-set eval runner (specs/slice-3.md §4).

Runs evals/golden.yaml queries against a live app instance and scores:
honest-failure expectation, expected-domain citation, citation-marker
resolution, and LLM-judged groundedness. Run with the pipeline venv:

    pipeline/.venv/bin/python evals/run.py [--base-url URL] [--limit N] [--query SUBSTR]

Requires ANTHROPIC_API_KEY (env or pipeline/.env) for the judge; the target
app instance needs its own keys. Exit 0 iff all non-judge checks pass and
groundedness passes on >=90% of judged queries.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import asdict, dataclass
from pathlib import Path
from urllib.parse import urlparse

import httpx
import yaml

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "pipeline"))
from unfold_pipeline.config import _load_dotenv, PIPELINE_DIR  # noqa: E402

EVALS_DIR = Path(__file__).resolve().parent
GOLDEN = EVALS_DIR / "golden.yaml"
REPORT = EVALS_DIR / "report.json"
JUDGE_MODEL = "claude-haiku-4-5"
GROUNDEDNESS_PASS_RATE = 0.9


@dataclass
class ChatResult:
    answer: str
    sources: list[dict]
    tier_mix: dict
    aborted: bool
    error: str | None


def run_query(client: httpx.Client, base_url: str, query: str) -> ChatResult:
    answer_parts: list[str] = []
    sources: list[dict] = []
    tier_mix: dict = {}
    aborted = False
    error = None
    event = None
    with client.stream(
        "POST",
        f"{base_url}/api/chat",
        json={"query": query, "compare": False},
        timeout=180,
    ) as resp:
        resp.raise_for_status()
        for line in resp.iter_lines():
            if line.startswith("event: "):
                event = line[7:]
            elif line.startswith("data: "):
                data = json.loads(line[6:])
                if event == "sourced_delta":
                    answer_parts.append(data["text"])
                elif event == "sources":
                    sources = data["sources"]
                elif event == "sourced_done":
                    tier_mix = data["tierMix"]
                    aborted = bool(data.get("aborted"))
                elif event == "error":
                    error = data["message"]
    return ChatResult("".join(answer_parts), sources, tier_mix, aborted, error)


def judge_groundedness(anthropic_client, query: str, result: ChatResult) -> tuple[bool, str]:
    from pydantic import BaseModel

    class Verdict(BaseModel):
        grounded: bool
        reason: str

    source_texts = "\n\n".join(
        f"[{s['id']}] {s['title']} — {s['url']}\n{s.get('snippet', '')}" for s in result.sources
    )
    response = anthropic_client.messages.parse(
        model=JUDGE_MODEL,
        max_tokens=1024,
        messages=[
            {
                "role": "user",
                "content": (
                    "You are auditing the CITATION DISCIPLINE of a retrieval-grounded "
                    "answer. The answerer saw the FULL text of each source; you see only "
                    "short excerpts, so you CANNOT verify facts — do not try, and never "
                    "fail an answer because the excerpts are too short to confirm a claim.\n\n"
                    f"Question: {query}\n\nSources (titles + short excerpts only):\n{source_texts}\n\n"
                    f"Answer:\n{result.answer}\n\n"
                    "Return grounded=false ONLY if you find at least one of:\n"
                    "1. A substantive factual claim presented with NO citation marker at all.\n"
                    "2. A citation to a source id that was not provided.\n"
                    "3. A claim that directly CONTRADICTS one of the excerpts.\n"
                    "4. No 'Why these sources' style disclosure while claiming coverage "
                    "the source list obviously cannot support (e.g. citing nothing).\n"
                    "Otherwise return grounded=true. In `reason`, name the specific "
                    "violation or state that citation discipline holds."
                ),
            }
        ],
        output_format=Verdict,
    )
    verdict = response.parsed_output
    if verdict is None:
        return True, "judge parse failed; not counted against"
    return verdict.grounded, verdict.reason


def check_query(entry: dict, result: ChatResult, anthropic_client) -> dict:
    checks: dict[str, dict] = {}
    expect_hf = bool(entry.get("expect_honest_failure"))

    if result.error or result.aborted:
        return {
            "query": entry["query"],
            "checks": {"completed": {"pass": False, "detail": result.error or "aborted"}},
            "passed": False,
        }

    actual_hf = bool(result.tier_mix.get("honestFailure"))
    checks["honest_failure"] = {
        "pass": actual_hf == expect_hf,
        "detail": f"expected {expect_hf}, got {actual_hf}",
    }

    expect_domains = entry.get("expect_domains") or []
    if expect_domains:
        hosts = {urlparse(s["url"]).hostname or "" for s in result.sources}
        hit = any(h == d or h.endswith("." + d) for d in expect_domains for h in hosts)
        checks["expected_domains"] = {
            "pass": hit,
            "detail": f"wanted one of {expect_domains}, got {sorted(hosts)}",
        }

    if not expect_hf:
        ids = {s["id"] for s in result.sources}
        cited = {int(m) for m in re.findall(r"\[(\d+)\]", result.answer)}
        checks["citations"] = {
            "pass": bool(cited) and cited <= ids,
            "detail": f"cited {sorted(cited)}, provided {sorted(ids)}",
        }
        grounded, reason = judge_groundedness(anthropic_client, entry["query"], result)
        checks["groundedness"] = {"pass": grounded, "detail": reason, "judge": True}

    hard = [c for name, c in checks.items() if not c.get("judge")]
    return {
        "query": entry["query"],
        "checks": checks,
        "passed": all(c["pass"] for c in hard),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://localhost:3000")
    parser.add_argument("--limit", type=int)
    parser.add_argument("--query", help="only queries containing this substring")
    args = parser.parse_args()

    _load_dotenv(PIPELINE_DIR / ".env")
    import anthropic

    anthropic_client = anthropic.Anthropic()

    entries = yaml.safe_load(GOLDEN.read_text())["queries"]
    if args.query:
        entries = [e for e in entries if args.query.lower() in e["query"].lower()]
    if args.limit:
        # Keep at least one honest-failure probe in any limited run.
        probes = [e for e in entries if e.get("expect_honest_failure")]
        entries = entries[: args.limit]
        if probes and not any(e.get("expect_honest_failure") for e in entries):
            entries[-1] = probes[0]

    results = []
    with httpx.Client() as client:
        for i, entry in enumerate(entries, 1):
            print(f"[{i}/{len(entries)}] {entry['query'][:70]} ...", flush=True)
            chat = run_query(client, args.base_url, entry["query"])
            scored = check_query(entry, chat, anthropic_client)
            results.append(scored)
            for name, c in scored["checks"].items():
                mark = "PASS" if c["pass"] else "FAIL"
                print(f"    {mark} {name}: {c['detail'][:110]}")

    hard_pass = all(r["passed"] for r in results)
    judged = [r["checks"]["groundedness"] for r in results if "groundedness" in r["checks"]]
    grounded_rate = (sum(1 for j in judged if j["pass"]) / len(judged)) if judged else 1.0

    REPORT.write_text(json.dumps({"results": results, "grounded_rate": grounded_rate}, indent=2))
    print(f"\nhard checks: {'PASS' if hard_pass else 'FAIL'}; "
          f"groundedness: {grounded_rate:.0%} (threshold {GROUNDEDNESS_PASS_RATE:.0%}); "
          f"report: {REPORT}")
    return 0 if hard_pass and grounded_rate >= GROUNDEDNESS_PASS_RATE else 1


if __name__ == "__main__":
    sys.exit(main())
