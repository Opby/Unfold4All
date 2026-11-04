"""PAI probabilistic metrics for the golden-set evals (FR13-FR16).

Implements the eval-pipeline half of requirements.md § "Extension: PAI
probabilistic metrics (2026-11-03)"; report contract in
specs/slice-5-eval-metrics.md. Never runs live — invoked by evals/run.py
behind the --pai flag.

Guiding constraint (requirements § extension): the Claude API exposes no
token logprobs, so everything here is computed over generated text and
repeated samples — verbalized confidence, LLM-judged labels, embedding
distances. The report labels every number accordingly (NFR7).
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

EVALS_DIR = Path(__file__).resolve().parent
REPO_ROOT = EVALS_DIR.parent
FRAMING_PROMPT = REPO_ROOT / "app" / "src" / "prompts" / "framing-analysis.md"

# Confidence is elicited from the same model that wrote the answers
# (CLAUDE.md: answer model), so FR14 measures *its* calibration. Verification
# and framing are judge work and stay on the cheap classifier model.
ELICIT_MODEL = "claude-opus-5"
JUDGE_MODEL = "claude-haiku-4-5"
EMBED_MODEL = "voyage-4-lite"

ECE_BINS = 5
MAX_CLAIMS = 10  # clamped after parsing — never a schema cap (slice-4 lesson)
ORACLE_TOP_K = 4  # chunks retrieved per claim
ORACLE_MIN_SIMILARITY = 0.4  # mirrors app/src/lib/index-search.ts noise floor
CHUNK_EXCERPT_CHARS = 1200


# ---------------------------------------------------------------- oracle ----


class CorpusOracle:
    """Tier 1-2 chunks from the curated pgvector index, as ground truth.

    Mirrors the retrieval in app/src/lib/index-search.ts (cosine distance,
    noise floor) with an added tier <= 2 filter: the oracle is the
    community-authored corpus only.
    """

    def __init__(self, database_url: str, voyage_api_key: str):
        import psycopg
        import voyageai

        self._conn = psycopg.connect(database_url)
        self._voyage = voyageai.Client(api_key=voyage_api_key)

    def embed(self, texts: list[str], input_type: str) -> list[list[float]]:
        return self._voyage.embed(texts, model=EMBED_MODEL, input_type=input_type).embeddings

    def retrieve(self, claim: str, top_k: int = ORACLE_TOP_K) -> list[dict]:
        [vec] = self.embed([claim], input_type="query")
        literal = "[" + ",".join(f"{v:.7f}" for v in vec) + "]"
        with self._conn.cursor() as cur:
            cur.execute(
                """SELECT d.url, d.title, s.tier, c.text,
                          1 - (c.embedding <=> %s::vector) AS similarity
                   FROM chunks c
                   JOIN documents d ON d.id = c.document_id
                   JOIN sources s ON s.id = d.source_id
                   WHERE s.tier <= 2
                   ORDER BY c.embedding <=> %s::vector
                   LIMIT %s""",
                (literal, literal, top_k),
            )
            rows = cur.fetchall()
        return [
            {"url": u, "title": t, "tier": tier, "text": text, "similarity": float(sim)}
            for u, t, tier, text, sim in rows
            if float(sim) >= ORACLE_MIN_SIMILARITY
        ]

    def close(self) -> None:
        self._conn.close()


# ------------------------------------------------- FR13: claims + labels ----


@dataclass
class Claim:
    text: str
    confidence: float  # verbalized p-hat, clamped to [0, 1]
    verdict: str = "not_covered"  # supported | contradicted | not_covered
    reason: str = ""

    @property
    def label(self) -> int | None:
        """y_i for ECE: 1 supported, 0 contradicted, None excluded."""
        if self.verdict == "supported":
            return 1
        if self.verdict == "contradicted":
            return 0
        return None


def elicit_claims(anthropic_client, query: str, answer: str) -> list[Claim]:
    """Verbalized per-claim confidence from the answer model (FR13).

    Post-hoc self-assessment: the elicit model is the model that wrote the
    answer, asked to restate its claims and rate each one. This is itself an
    imperfectly calibrated estimator — that caveat ships with the report.
    """
    from pydantic import BaseModel

    class ClaimConf(BaseModel):
        claim: str
        confidence: float

    class ClaimList(BaseModel):
        claims: list[ClaimConf]

    response = anthropic_client.messages.parse(
        model=ELICIT_MODEL,
        # 10 standalone claims + confidences need room; a truncated JSON body
        # fails the whole answer's elicitation (seen at 2048 on long answers).
        max_tokens=4096,
        messages=[
            {
                "role": "user",
                "content": (
                    "You wrote the answer below to the given question. Identify "
                    "its distinct substantive factual claims — the checkable "
                    "assertions that carry its content, restated so each stands "
                    "alone (no citation markers, no pronouns). For each claim, "
                    "give your honest probability (0 to 1) that the claim is "
                    "factually correct. Rate the claim against reality, not "
                    "against the answer text; be willing to use low numbers. "
                    f"At most {MAX_CLAIMS} claims, most central first.\n\n"
                    f"Question: {query}\n\nAnswer:\n{answer}"
                ),
            }
        ],
        output_format=ClaimList,
    )
    parsed = response.parsed_output
    if parsed is None:
        return []
    return [
        Claim(text=c.claim.strip(), confidence=min(1.0, max(0.0, c.confidence)))
        for c in parsed.claims[:MAX_CLAIMS]
        if c.claim.strip()
    ]


def verify_claims(anthropic_client, oracle: CorpusOracle, query: str, claims: list[Claim]) -> None:
    """Label each claim against the Tier 1-2 corpus (FR13). Mutates claims."""
    from pydantic import BaseModel

    if not claims:
        return

    # Retrieve per claim, then judge all claims of the answer in one call.
    excerpts: dict[tuple[str, str], dict] = {}
    per_claim_keys: list[list[tuple[str, str]]] = []
    for claim in claims:
        keys = []
        for chunk in oracle.retrieve(claim.text):
            key = (chunk["url"], chunk["text"][:80])
            excerpts.setdefault(key, chunk)
            keys.append(key)
        per_claim_keys.append(keys)

    keys_in_order = list(excerpts)
    excerpt_block = "\n\n".join(
        f"[E{i + 1}] {excerpts[k]['title']} — {excerpts[k]['url']}\n"
        f"{excerpts[k]['text'][:CHUNK_EXCERPT_CHARS]}"
        for i, k in enumerate(keys_in_order)
    )
    claim_block = "\n".join(
        "C{}: {} (relevant excerpts: {})".format(
            i + 1,
            claim.text,
            ", ".join(f"E{keys_in_order.index(k) + 1}" for k in keys)
            if keys
            else "none retrieved",
        )
        for i, (claim, keys) in enumerate(zip(claims, per_claim_keys))
    )

    class Verdict(BaseModel):
        claim_index: int  # 1-based, matching C1..Cn
        verdict: Literal["supported", "contradicted", "not_covered"]
        reason: str

    class VerdictList(BaseModel):
        verdicts: list[Verdict]

    response = anthropic_client.messages.parse(
        model=JUDGE_MODEL,
        max_tokens=3072,
        messages=[
            {
                "role": "user",
                "content": (
                    "You verify factual claims against excerpts from a curated "
                    "corpus of community-authored sources (the ground-truth "
                    "oracle for this eval). For each claim return exactly one "
                    "verdict:\n"
                    "- supported: at least one excerpt affirms the claim's substance.\n"
                    "- contradicted: at least one excerpt states otherwise.\n"
                    "- not_covered: the excerpts do not address the claim. Use "
                    "this whenever you are unsure — never guess from your own "
                    "knowledge; the corpus is the only oracle here.\n\n"
                    f"Question the claims answer: {query}\n\n"
                    f"Corpus excerpts:\n{excerpt_block or '(none retrieved)'}\n\n"
                    f"Claims:\n{claim_block}\n\n"
                    "Return one verdict per claim, claim_index matching C-numbers."
                ),
            }
        ],
        output_format=VerdictList,
    )
    parsed = response.parsed_output
    if parsed is None:
        return
    for v in parsed.verdicts:
        if 1 <= v.claim_index <= len(claims):
            claims[v.claim_index - 1].verdict = v.verdict
            claims[v.claim_index - 1].reason = v.reason


# --------------------------------------------------- FR14: ECE + diagram ----


def ece_stats(pairs: list[tuple[float, int]], bins: int = ECE_BINS) -> dict:
    """Expected calibration error over (p-hat, y) pairs, equal-width bins."""
    bin_rows = []
    total = len(pairs)
    ece = 0.0
    for b in range(bins):
        lo, hi = b / bins, (b + 1) / bins
        members = [
            (p, y) for p, y in pairs if (lo <= p < hi) or (b == bins - 1 and p == hi)
        ]
        if members:
            conf = sum(p for p, _ in members) / len(members)
            acc = sum(y for _, y in members) / len(members)
            ece += (len(members) / total) * abs(acc - conf)
        else:
            conf = acc = None
        bin_rows.append(
            {"range": [lo, hi], "count": len(members), "mean_confidence": conf, "accuracy": acc}
        )
    return {"ece": ece if total else None, "n": total, "bins": bin_rows}


def reliability_diagram(baseline: dict, sourced: dict, out_path: Path) -> bool:
    """Write the FR14 reliability diagram PNG. Returns False if matplotlib is missing."""
    try:
        import matplotlib

        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
    except ImportError:
        return False

    fig, ax = plt.subplots(figsize=(6, 5.2))
    ax.plot([0, 1], [0, 1], "--", color="#999", linewidth=1, label="perfect calibration")
    for stats, color, name in (
        (baseline, "#d97706", "baseline (no sources)"),
        (sourced, "#059669", "sourced (community-grounded)"),
    ):
        xs = [b["mean_confidence"] for b in stats["bins"] if b["count"]]
        ys = [b["accuracy"] for b in stats["bins"] if b["count"]]
        ns = [b["count"] for b in stats["bins"] if b["count"]]
        label = f"{name} — ECE {stats['ece']:.3f}, n={stats['n']}" if stats["n"] else name
        ax.plot(xs, ys, "o-", color=color, label=label)
        for x, y, n in zip(xs, ys, ns):
            dy = -11 if y > 0.95 else 4  # keep labels inside the axes
            ax.annotate(str(n), (x, y), textcoords="offset points", xytext=(5, dy), fontsize=7)
    ax.set_xlim(0, 1)
    ax.set_ylim(0, 1)
    ax.set_xlabel("verbalized confidence (binned mean)")
    ax.set_ylabel("fraction verified against Tier 1-2 corpus")
    ax.set_title(f"Reliability diagram — {ECE_BINS} bins, golden set")
    ax.legend(loc="upper left", fontsize=8)
    fig.text(
        0.99,
        0.01,
        "verbalized confidence + LLM-judged labels (no logprobs available); "
        "point labels = claims per bin",
        ha="right",
        fontsize=6.5,
        color="#777",
    )
    fig.tight_layout()
    fig.savefig(out_path, dpi=150)
    plt.close(fig)
    return True


# -------------------------------------------- FR15: self-consistency ----


def mean_pairwise_distance(oracle: CorpusOracle, texts: list[str]) -> float | None:
    """Mean pairwise cosine distance between Voyage embeddings of the samples."""
    texts = [t for t in texts if t.strip()]
    if len(texts) < 2:
        return None
    vecs = oracle.embed(texts, input_type="document")

    def cos_dist(a: list[float], b: list[float]) -> float:
        dot = sum(x * y for x, y in zip(a, b))
        na = math.sqrt(sum(x * x for x in a))
        nb = math.sqrt(sum(x * x for x in b))
        return 1 - dot / (na * nb) if na and nb else 0.0

    dists = [
        cos_dist(vecs[i], vecs[j]) for i in range(len(vecs)) for j in range(i + 1, len(vecs))
    ]
    return sum(dists) / len(dists)


def extract_plain_claims(anthropic_client, query: str, answer: str) -> list[str]:
    """Reference claim set for flip detection (judge model; no confidence)."""
    from pydantic import BaseModel

    class Claims(BaseModel):
        claims: list[str]

    response = anthropic_client.messages.parse(
        model=JUDGE_MODEL,
        max_tokens=1536,
        messages=[
            {
                "role": "user",
                "content": (
                    "List the distinct substantive factual claims this answer "
                    "makes, each restated to stand alone (no citation markers, "
                    f"no pronouns). At most {MAX_CLAIMS}, most central first.\n\n"
                    f"Question: {query}\n\nAnswer:\n{answer}"
                ),
            }
        ],
        output_format=Claims,
    )
    parsed = response.parsed_output
    if parsed is None:
        return []
    return [c.strip() for c in parsed.claims[:MAX_CLAIMS] if c.strip()]


def claim_consistency(
    anthropic_client, query: str, reference_claims: list[str], other_samples: list[str]
) -> dict | None:
    """Judge each reference claim against every other sample (FR15 flips)."""
    from pydantic import BaseModel

    if not reference_claims or not other_samples:
        return None

    class Status(BaseModel):
        claim_index: int
        status: Literal["asserted", "contradicted", "absent"]

    class StatusList(BaseModel):
        statuses: list[Status]

    n = len(reference_claims)
    contradicted = [False] * n
    asserted_counts = [0] * n
    claim_block = "\n".join(f"C{i + 1}: {c}" for i, c in enumerate(reference_claims))
    for sample in other_samples:
        response = anthropic_client.messages.parse(
            model=JUDGE_MODEL,
            max_tokens=2048,
            messages=[
                {
                    "role": "user",
                    "content": (
                        "These claims were extracted from one answer to a "
                        "question. Below is ANOTHER answer to the same "
                        "question. For each claim, say whether this other "
                        "answer asserts it (same substance, any wording), "
                        "contradicts it (states otherwise), or is absent "
                        "(does not address it).\n\n"
                        f"Question: {query}\n\nClaims:\n{claim_block}\n\n"
                        f"Other answer:\n{sample}\n\n"
                        "One status per claim, claim_index matching C-numbers."
                    ),
                }
            ],
            output_format=StatusList,
        )
        parsed = response.parsed_output
        if parsed is None:
            continue
        for s in parsed.statuses:
            if not (1 <= s.claim_index <= n):
                continue
            if s.status == "contradicted":
                contradicted[s.claim_index - 1] = True
            elif s.status == "asserted":
                asserted_counts[s.claim_index - 1] += 1

    k_other = len(other_samples)
    return {
        "n_reference_claims": n,
        "claim_flip_fraction": sum(contradicted) / n,
        "claim_assertion_rate": sum(asserted_counts) / (n * k_other),
        "flipped_claims": [c for c, f in zip(reference_claims, contradicted) if f],
    }


# ----------------------------------------------------- FR16: framing ----


def analyze_framing(anthropic_client, query: str, baseline: str, sourced: str) -> dict | None:
    """Framing tags for one baseline/sourced pair, reusing the FR10 prompt."""
    from pydantic import BaseModel

    class Tags(BaseModel):
        past_verbs: list[str]
        present_verbs: list[str]

    class Framing(BaseModel):
        community: str
        baseline: Tags
        sourced: Tags

    system = FRAMING_PROMPT.read_text()
    response = anthropic_client.messages.parse(
        model=JUDGE_MODEL,
        max_tokens=1536,
        system=system
        + "\n\nFor this eval run, return only the community and the two verb "
        "lists (semantic shifts are not needed).",
        messages=[
            {
                "role": "user",
                "content": (
                    f"Question: {query}\n\nBASELINE answer:\n{baseline}\n\n"
                    f"SOURCED answer:\n{sourced}"
                ),
            }
        ],
        output_format=Framing,
    )
    parsed = response.parsed_output
    if parsed is None:
        return None

    def tags(t: Tags) -> dict:
        return {"past_verbs": t.past_verbs[:12], "present_verbs": t.present_verbs[:12]}

    return {
        "community": parsed.community,
        "baseline": tags(parsed.baseline),
        "sourced": tags(parsed.sourced),
    }


def agency_share(tags: dict) -> float | None:
    """P(present) among community-subject verbs; None when no verbs tagged."""
    present = len(tags["present_verbs"])
    past = len(tags["past_verbs"])
    return present / (present + past) if present + past else None


def mean_or_none(values: list[float | None]) -> float | None:
    vals = [v for v in values if v is not None]
    return sum(vals) / len(vals) if vals else None


def gap_or_none(a: float | None, b: float | None) -> float | None:
    return a - b if a is not None and b is not None else None


# ------------------------------------------------------- orchestration ----


def probe_queries(golden: dict) -> tuple[list[dict], list[str]]:
    """Parity pairs (FR16) and the full FR15 probe-query list from golden.yaml."""
    probes = golden.get("probes") or {}
    pairs = []
    queries: list[str] = []
    for pair in probes.get("parity_pairs") or []:
        community_q = pair["template"].format(group=pair["community"])
        control_q = pair["template"].format(group=pair["control"])
        pairs.append({**pair, "community_query": community_q, "control_query": control_q})
        queries += [community_q, control_q]
    for extra in probes.get("self_consistency_extra") or []:
        queries.append(extra["query"])
    return pairs, queries


def run_pai(
    *,
    anthropic_client,
    oracle: CorpusOracle,
    golden: dict,
    base_results: list[tuple[dict, object]],
    sample_fn,
    k: int,
    report_dir: Path,
) -> dict:
    """FR13-FR16 over the golden set. Returns the report's "pai" section.

    base_results: (golden entry, compare-mode ChatResult) from the base run.
    sample_fn(query) -> ChatResult with .baseline/.answer/.tier_mix/.error.
    """
    # ---- FR13: (confidence, label) pairs per path --------------------------
    claim_rows: list[dict] = []
    pairs_by_path: dict[str, list[tuple[float, int]]] = {"baseline": [], "sourced": []}
    verdict_counts: dict[str, dict[str, int]] = {
        "baseline": {"supported": 0, "contradicted": 0, "not_covered": 0},
        "sourced": {"supported": 0, "contradicted": 0, "not_covered": 0},
    }
    eligible = [
        (e, r)
        for e, r in base_results
        if not e.get("expect_honest_failure")
        and not getattr(r, "error", None)
        and not getattr(r, "aborted", False)
        and not getattr(r, "baseline_aborted", False)
        and getattr(r, "baseline", "")
        and getattr(r, "answer", "")
    ]
    print(f"\n[pai] FR13 claim confidence + verification over {len(eligible)} queries ...")
    for i, (entry, result) in enumerate(eligible, 1):
        query = entry["query"]
        print(f"[pai] [{i}/{len(eligible)}] {query[:60]} ...", flush=True)
        for path, answer in (("baseline", result.baseline), ("sourced", result.answer)):
            try:
                claims = elicit_claims(anthropic_client, query, answer)
                verify_claims(anthropic_client, oracle, query, claims)
            except Exception as exc:  # one bad query never sinks the run
                print(f"[pai]   {path}: skipped ({exc})")
                continue
            for c in claims:
                verdict_counts[path][c.verdict] += 1
                if c.label is not None:
                    pairs_by_path[path].append((c.confidence, c.label))
                claim_rows.append(
                    {
                        "query": query,
                        "path": path,
                        "claim": c.text,
                        "confidence": c.confidence,
                        "verdict": c.verdict,
                        "reason": c.reason,
                    }
                )

    # ---- FR14: ECE + reliability diagram ------------------------------------
    calibration = {}
    for path in ("baseline", "sourced"):
        stats = ece_stats(pairs_by_path[path])
        counts = verdict_counts[path]
        n_claims = sum(counts.values())
        calibration[path] = {
            **stats,
            "verdicts": counts,
            "coverage": (stats["n"] / n_claims) if n_claims else None,
        }
    diagram_path = report_dir / "reliability.png"
    if reliability_diagram(calibration["baseline"], calibration["sourced"], diagram_path):
        calibration["diagram"] = diagram_path.name
    else:
        calibration["diagram"] = None
        print("[pai] matplotlib unavailable — reliability diagram skipped")

    # ---- FR15 sampling (samples shared with FR16) ---------------------------
    pairs, probe_qs = probe_queries(golden)
    samples: dict[str, list] = {}
    print(f"\n[pai] FR15 sampling {len(probe_qs)} probe queries x k={k} ...")
    for q in probe_qs:
        runs = []
        for j in range(k):
            print(f"[pai]   sample {j + 1}/{k}: {q[:60]} ...", flush=True)
            runs.append(sample_fn(q))
        samples[q] = [
            r for r in runs if not getattr(r, "error", None) and not getattr(r, "aborted", False)
        ]

    self_consistency: list[dict] = []
    for q in probe_qs:
        row: dict = {"query": q, "k_effective": len(samples[q]), "paths": {}}
        for path in ("baseline", "sourced"):
            texts = [getattr(r, "baseline" if path == "baseline" else "answer") for r in samples[q]]
            texts = [t for t in texts if t.strip()]
            entry: dict = {"mean_pairwise_distance": None, "flips": None}
            try:
                entry["mean_pairwise_distance"] = mean_pairwise_distance(oracle, texts)
                if len(texts) >= 2:
                    reference = extract_plain_claims(anthropic_client, q, texts[0])
                    entry["flips"] = claim_consistency(anthropic_client, q, reference, texts[1:])
            except Exception as exc:
                print(f"[pai]   self-consistency {path} failed for {q[:40]}: {exc}")
            row["paths"][path] = entry
        self_consistency.append(row)

    def aggregate(metric_fn) -> dict:
        return {
            path: mean_or_none([metric_fn(row["paths"][path]) for row in self_consistency])
            for path in ("baseline", "sourced")
        }

    sc_aggregate = {
        "mean_pairwise_distance": aggregate(lambda p: p["mean_pairwise_distance"]),
        "claim_flip_fraction": aggregate(
            lambda p: p["flips"]["claim_flip_fraction"] if p["flips"] else None
        ),
        "claim_assertion_rate": aggregate(
            lambda p: p["flips"]["claim_assertion_rate"] if p["flips"] else None
        ),
    }

    # ---- FR16: framing parity over the same samples -------------------------
    parity_rows = []
    for pair in pairs:
        members = {}
        for role in ("community", "control"):
            q = pair[f"{role}_query"]
            shares = {"baseline": [], "sourced": []}
            framings = []
            for r in samples[q]:
                try:
                    framing = analyze_framing(anthropic_client, q, r.baseline, r.answer)
                except Exception as exc:
                    print(f"[pai]   framing failed for {q[:40]}: {exc}")
                    continue
                if framing is None:
                    continue
                framings.append(framing)
                shares["baseline"].append(agency_share(framing["baseline"]))
                shares["sourced"].append(agency_share(framing["sourced"]))
            members[role] = {
                "query": q,
                "honest_failure_rate": mean_or_none(
                    [1.0 if r.tier_mix.get("honestFailure") else 0.0 for r in samples[q]]
                ),
                "agency_share": {
                    "baseline": mean_or_none(shares["baseline"]),
                    "sourced": mean_or_none(shares["sourced"]),
                },
                "example_framing": framings[0] if framings else None,
            }
        parity_rows.append(
            {
                "name": pair["name"],
                "phrasing": pair["phrasing"],
                "template": pair["template"],
                "community": members["community"],
                "control": members["control"],
                # gap > 0: the control group is framed as more present-tense /
                # agentive than the community on that path.
                "agency_gap": {
                    path: gap_or_none(
                        members["control"]["agency_share"][path],
                        members["community"]["agency_share"][path],
                    )
                    for path in ("baseline", "sourced")
                },
            }
        )

    return {
        "method": (
            "Text-level estimates: verbalized confidence + LLM-judged labels "
            "(no token logprobs), Voyage embedding distances, k-sample "
            "disagreement. See specs/slice-5-eval-metrics.md."
        ),
        "elicit_model": ELICIT_MODEL,
        "judge_model": JUDGE_MODEL,
        "embed_model": EMBED_MODEL,
        "calibration": calibration,
        "claims": claim_rows,
        "self_consistency": {
            "k": k,
            "queries": self_consistency,
            "aggregate": sc_aggregate,
        },
        "parity": parity_rows,
    }
