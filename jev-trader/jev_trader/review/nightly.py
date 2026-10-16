"""Nightly review: read the journal, label every verdict with what actually happened, score calibration (Brier),
and PROPOSE a schema/gate revision. The proposal is written to a file; a human approves it (or the Brain, if the
operator has delegated that gate) before it replaces config/setups.yaml. Nothing here trades."""
from __future__ import annotations

import datetime as dt
import json
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

import yaml

from ..journal import Journal
from ..schema import SetupBook
from .brier import Calibration, calibration


@dataclass
class SymbolReview:
    symbol: str
    n_verdicts: int = 0
    n_fills: int = 0
    n_entries: int = 0
    realized_pnl_usd: float = 0.0
    fees_usd: float = 0.0
    avg_slippage_bps: float = 0.0
    avg_latency_ms: float = 0.0
    direction_cal: Optional[Calibration] = None  # P(long) vs. forward return > 0
    toxic_cal: Optional[Calibration] = None      # P(toxic) vs. adverse move after a fill
    quality_cal: Optional[Calibration] = None    # P(score>=2) vs. forward move hit target before stop
    blocked_reasons: dict[str, int] = field(default_factory=dict)
    misses: int = 0  # gated-out entries that would have hit target before stop


def _forward_outcomes(mids: list[tuple[int, float]], i: int, horizon: int, stop_bps: float, target_bps: float) -> tuple[Optional[int], Optional[int], Optional[int]]:
    """Return (up, long_hit, short_hit) for verdict at index i using only later snapshots."""
    if i + 1 >= len(mids):
        return None, None, None
    p0 = mids[i][1]
    path = [m for _, m in mids[i + 1 : i + 1 + horizon]]
    if not path:
        return None, None, None
    up = 1 if path[-1] > p0 else 0
    long_hit, short_hit = 0, 0
    for m in path:
        r = (m / p0 - 1) * 1e4
        if long_hit == 0 and short_hit == 0:
            if r >= target_bps:
                long_hit = 1
                break
            if r <= -stop_bps:
                break
    for m in path:
        r = (m / p0 - 1) * 1e4
        if r <= -target_bps:
            short_hit = 1
            break
        if r >= stop_bps:
            break
    return up, long_hit, short_hit


def review(journal_path: str | Path, book: SetupBook) -> dict[str, SymbolReview]:
    recs = list(Journal.read(journal_path))
    setups = book.by_symbol()
    mids: dict[str, list[tuple[int, float]]] = defaultdict(list)
    verdicts: dict[str, list[dict]] = defaultdict(list)
    fills: dict[str, list[dict]] = defaultdict(list)
    blocked: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    for r in recs:
        k = r["kind"]
        if k == "snapshot":
            mids[r["symbol"]].append((r["ts"], r["snapshot"]["mid"]))
        elif k == "verdict":
            verdicts[r["symbol"]].append(r["verdict"])
        elif k == "fill":
            fills[r["symbol"]].append(r["fill"])
        elif k == "tick":
            for sym, why in r.get("blocked", {}).items():
                blocked[sym][why] += 1

    out: dict[str, SymbolReview] = {}
    for sym, setup in setups.items():
        sr = SymbolReview(symbol=sym)
        ms = mids[sym]
        ts_index = {ts: i for i, (ts, _) in enumerate(ms)}
        vs = verdicts[sym]
        sr.n_verdicts = len(vs)
        if vs:
            sr.avg_latency_ms = sum(v["latency_ms"] for v in vs) / len(vs)
        p_long, y_up, p_q, y_q = [], [], [], []
        for v in vs:
            i = ts_index.get(v["ts"])
            if i is None:
                continue
            up, lh, sh = _forward_outcomes(ms, i, setup.horizon_bars, setup.stop_bps, setup.target_bps)
            if up is None:
                continue
            p_long.append(v["direction_probs"].get("long", 0.0))
            y_up.append(up)
            pq = sum(p for k, p in v["setup_quality_probs"].items() if int(k) >= 2)
            hit = lh if setup.bias == "long" else sh if setup.bias == "short" else (lh if v["direction"] == "long" else sh)
            p_q.append(pq)
            y_q.append(hit)
            gated = v["setup_quality"] < 2.0 or v["direction_conf"] <= 0.80 or v["risk_state"] != "safe"
            if gated and hit == 1:
                sr.misses += 1
        if p_long:
            sr.direction_cal = calibration(p_long, y_up)
            sr.quality_cal = calibration(p_q, y_q)
        fs = fills[sym]
        sr.n_fills = len(fs)
        sr.n_entries = sum(1 for f in fs if f["reason"] == "entry")
        sr.fees_usd = sum(f["fee_usd"] for f in fs)
        if fs:
            sr.avg_slippage_bps = sum(f["slippage_bps"] for f in fs) / len(fs)
        # toxic flow: did price move against the fill by > slippage within 3 bars?
        p_t, y_t = [], []
        vmap = {v["ts"]: v for v in vs}
        for f in fs:
            v = vmap.get(f["ts"])
            i = ts_index.get(f["ts"])
            if v is None or i is None or i + 3 >= len(ms):
                continue
            sign = 1 if f["side"] == "buy" else -1
            adverse = any(((m / f["price"]) - 1) * 1e4 * sign < -f["slippage_bps"] for _, m in ms[i + 1 : i + 4])
            p_t.append(v["toxic_flow_p"])
            y_t.append(1 if adverse else 0)
        if p_t:
            sr.toxic_cal = calibration(p_t, y_t)
        sr.blocked_reasons = dict(blocked[sym])
        out[sym] = sr
    return out


def propose_revision(reviews: dict[str, SymbolReview], book: SetupBook, today: dt.date) -> dict:
    """Mechanical proposals. Conservative by construction: can tighten or disable, never loosen below defaults."""
    proposals: list[dict] = []
    new_book = book.model_dump(mode="json")
    for s in new_book["setups"]:
        r = reviews.get(s["symbol"])
        if r is None:
            continue
        if r.direction_cal and r.direction_cal.n >= 30 and r.direction_cal.skill < 0:
            s["tradable"] = False
            proposals.append({"symbol": s["symbol"], "change": "disable", "why": f"direction skill {r.direction_cal.skill:.2f} < 0 over n={r.direction_cal.n}"})
        if r.quality_cal and r.quality_cal.n >= 30 and r.quality_cal.ece > 0.15:
            proposals.append({"symbol": s["symbol"], "change": "rewrite_setup_quality_rubric", "why": f"setup_quality ECE {r.quality_cal.ece:.2f}; rubric is not separating good from bad entries"})
        if r.toxic_cal and r.toxic_cal.n >= 20 and r.toxic_cal.skill < 0:
            proposals.append({"symbol": s["symbol"], "change": "tighten_max_toxic_flow", "why": f"toxic_flow has no skill (skill={r.toxic_cal.skill:.2f}); lower the gate or drop it"})
        if r.n_entries >= 10 and r.realized_pnl_usd - r.fees_usd < 0 and r.avg_slippage_bps > 0.3 * s["target_bps"]:
            proposals.append({"symbol": s["symbol"], "change": "raise_target_or_drop", "why": f"avg slippage {r.avg_slippage_bps:.1f}bps vs target {s['target_bps']}bps: costs eat the edge"})
    major, minor, *_ = (book.version.lstrip("v").split("+")[0].split(".") + ["0", "0"])
    new_book["version"] = f"v{major}.{int(minor) + 1}"
    new_book["as_of"] = today.isoformat()
    return {"proposed_book": new_book, "proposals": proposals}


def write_report(path: str | Path, reviews: dict[str, SymbolReview], proposal: dict, today: dt.date) -> str:
    lines = [f"# Nightly review {today.isoformat()}", ""]
    for sym, r in reviews.items():
        lines.append(f"## {sym}")
        lines.append(f"- verdicts: {r.n_verdicts}, fills: {r.n_fills} (entries {r.n_entries}), fees ${r.fees_usd:.2f}, avg slippage {r.avg_slippage_bps:.2f}bps, avg Jev latency {r.avg_latency_ms:.0f}ms")
        for name, c in (("direction P(long)", r.direction_cal), ("setup_quality P(>=2)", r.quality_cal), ("toxic_flow", r.toxic_cal)):
            if c and c.n:
                lines.append(f"- {name}: n={c.n} Brier={c.brier:.3f} (climatology {c.brier_climatology:.3f}) skill={c.skill:+.2f} ECE={c.ece:.3f}")
        if r.blocked_reasons:
            lines.append(f"- gated-out entries: {json.dumps(r.blocked_reasons)}; misses (gated but would have hit target): {r.misses}")
        lines.append("")
    lines.append("## Proposed revision (requires approval)")
    if not proposal["proposals"]:
        lines.append("- none: keep schema as is")
    for p in proposal["proposals"]:
        lines.append(f"- {p['symbol']}: {p['change']} - {p['why']}")
    text = "\n".join(lines) + "\n"
    Path(path).write_text(text)
    return text


def write_proposed_book(path: str | Path, proposal: dict) -> None:
    Path(path).write_text(yaml.safe_dump(proposal["proposed_book"], sort_keys=False))
