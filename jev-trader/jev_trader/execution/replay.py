"""Feeds: JSONL replay of recorded books, and a synthetic random-walk feed for smoke tests and paper runs."""
from __future__ import annotations

import json
import math
import random
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterator, Optional

from ..state_engine import BookLevel, Funding, L2Book, Trade


@dataclass
class JsonlFeed:
    """Each line: {"symbol":..,"ts":..,"bids":[[px,qty],..],"asks":[[px,qty],..],"trades":[[ts,px,qty,is_buy],..],"funding_bps_8h":x|null}"""

    path: str | Path

    def __iter__(self) -> Iterator[tuple[L2Book, list[Trade], Optional[Funding]]]:
        with open(self.path) as f:
            for line in f:
                if not line.strip():
                    continue
                r = json.loads(line)
                book = L2Book(
                    symbol=r["symbol"],
                    ts=int(r["ts"]),
                    bids=[BookLevel(float(p), float(q)) for p, q in r["bids"]],
                    asks=[BookLevel(float(p), float(q)) for p, q in r["asks"]],
                )
                trades = [Trade(r["symbol"], int(t[0]), float(t[1]), float(t[2]), bool(t[3])) for t in r.get("trades", [])]
                fund = Funding(r["symbol"], int(r["ts"]), float(r["funding_bps_8h"])) if r.get("funding_bps_8h") is not None else None
                yield book, trades, fund


@dataclass
class SyntheticFeed:
    """Random-walk books for N symbols. Deterministic given seed. Not a market model; a plumbing test."""

    symbols: list[str]
    start_ts: int
    n_bars: int
    bar_ms: int = 60_000
    seed: int = 7
    vol_bps: float = 25.0
    spread_bps: float = 4.0
    depth_usd: float = 2_000_000.0
    drift_bps: float = 0.0
    prices: dict[str, float] = field(default_factory=dict)

    def __iter__(self) -> Iterator[tuple[L2Book, list[Trade], Optional[Funding]]]:
        rng = random.Random(self.seed)
        px = {s: self.prices.get(s, 100.0) for s in self.symbols}
        for i in range(self.n_bars):
            ts = self.start_ts + i * self.bar_ms
            for s in self.symbols:
                # intra-bar random walk: n_trades steps, each a trade; the bar closes at the last step
                n = 24
                p = px[s]
                trades = []
                for j in range(n):
                    p *= math.exp(rng.gauss(self.drift_bps / n, self.vol_bps / math.sqrt(n)) / 1e4)
                    trades.append(Trade(s, ts - self.bar_ms + (j + 1) * (self.bar_ms // (n + 1)), p, max(1e-9, rng.lognormvariate(0, 1)) * self.depth_usd / 5 / p * 0.05, rng.random() < 0.5))
                px[s] = mid = p
                h = mid * self.spread_bps / 2e4
                lvl_q = self.depth_usd / 5 / mid
                bids = [BookLevel(mid - h - k * h, lvl_q) for k in range(5)]
                asks = [BookLevel(mid + h + k * h, lvl_q) for k in range(5)]
                yield L2Book(s, ts, bids, asks), trades, None
