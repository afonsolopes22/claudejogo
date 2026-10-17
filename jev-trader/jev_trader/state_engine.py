"""Deterministic state engine: live order book + trades -> one compact Snapshot per symbol.

Causality rules (tested):
  * Every input carries an event timestamp. update() rejects anything with ts > the snapshot ts being built,
    and rejects out-of-order books (ts <= last book ts).
  * Funding is only exposed if its event ts <= snapshot ts.
  * No model is involved. Everything here is arithmetic.
"""
from __future__ import annotations

import json
import math
from collections import deque
from dataclasses import dataclass, field
from typing import Deque, Iterable, Optional, Sequence

import numpy as np

from .types import Position, Snapshot

TOKEN_BUDGET = 400


class CausalityError(ValueError):
    pass


@dataclass(frozen=True)
class BookLevel:
    price: float
    qty: float


@dataclass(frozen=True)
class L2Book:
    symbol: str
    ts: int
    bids: Sequence[BookLevel]  # best first (descending price)
    asks: Sequence[BookLevel]  # best first (ascending price)

    def mid(self) -> float:
        if not self.bids or not self.asks:
            raise ValueError("one-sided book")
        return (self.bids[0].price + self.asks[0].price) / 2.0


@dataclass(frozen=True)
class Trade:
    symbol: str
    ts: int
    price: float
    qty: float
    taker_is_buy: bool


@dataclass(frozen=True)
class Funding:
    symbol: str
    ts: int
    rate_bps_8h: float


@dataclass
class _SymbolState:
    mids: Deque[tuple[int, float]]
    trades: Deque[Trade]
    last_book_ts: int = -1
    funding: Optional[Funding] = None


@dataclass
class EquityTracker:
    """Equity curve bookkeeping owned by code, fed by fills (via loop)."""

    starting_equity: float
    equity: float = field(init=False)
    peak: float = field(init=False)
    day_start_equity: float = field(init=False)
    day_key: Optional[int] = None

    def __post_init__(self) -> None:
        self.equity = self.starting_equity
        self.peak = self.starting_equity
        self.day_start_equity = self.starting_equity

    def roll_day(self, ts: int) -> None:
        key = ts // 86_400_000
        if self.day_key != key:
            self.day_key = key
            self.day_start_equity = self.equity

    def mark(self, equity: float, ts: int) -> None:
        self.roll_day(ts)
        self.equity = equity
        self.peak = max(self.peak, equity)

    @property
    def drawdown_pct(self) -> float:
        if self.peak <= 0:
            return 0.0
        return max(0.0, (self.peak - self.equity) / self.peak * 100.0)

    @property
    def daily_pnl_pct(self) -> float:
        if self.day_start_equity <= 0:
            return 0.0
        return (self.equity - self.day_start_equity) / self.day_start_equity * 100.0


class StateEngine:
    def __init__(self, short_window: int = 12, long_window: int = 120, depth_levels: int = 5, trade_window_ms: int = 300_000):
        if short_window < 2 or long_window <= short_window:
            raise ValueError("windows must satisfy 2 <= short < long")
        self.short_window = short_window
        self.long_window = long_window
        self.depth_levels = depth_levels
        self.trade_window_ms = trade_window_ms
        self._sym: dict[str, _SymbolState] = {}

    # ---- ingestion -------------------------------------------------------
    def _state(self, symbol: str) -> _SymbolState:
        if symbol not in self._sym:
            self._sym[symbol] = _SymbolState(mids=deque(maxlen=self.long_window + 1), trades=deque())
        return self._sym[symbol]

    def ingest_trades(self, trades: Iterable[Trade]) -> None:
        for t in trades:
            st = self._state(t.symbol)
            if st.trades and t.ts < st.trades[-1].ts:
                raise CausalityError(f"out-of-order trade for {t.symbol}: {t.ts} < {st.trades[-1].ts}")
            st.trades.append(t)

    def ingest_funding(self, f: Funding) -> None:
        st = self._state(f.symbol)
        if st.funding is not None and f.ts < st.funding.ts:
            raise CausalityError("out-of-order funding")
        st.funding = f

    def update(self, book: L2Book, position: Position, equity: EquityTracker, levels: Optional[dict] = None) -> Snapshot:
        """Ingest one book and emit the snapshot *as of book.ts*. Raises on causality violations."""
        st = self._state(book.symbol)
        if book.ts <= st.last_book_ts:
            raise CausalityError(f"book ts {book.ts} <= last {st.last_book_ts}")
        if any(t.ts > book.ts for t in st.trades):
            raise CausalityError("trade newer than snapshot ts leaked in")
        if st.funding is not None and st.funding.ts > book.ts:
            # Future funding print: do not expose it.
            funding_bps: Optional[float] = None
        else:
            funding_bps = st.funding.rate_bps_8h if st.funding else None

        mid = book.mid()
        st.last_book_ts = book.ts
        st.mids.append((book.ts, mid))

        # Drop trades outside the window.
        cutoff = book.ts - self.trade_window_ms
        while st.trades and st.trades[0].ts < cutoff:
            st.trades.popleft()

        spread_bps = (book.asks[0].price - book.bids[0].price) / mid * 1e4
        bid_depth = sum(l.price * l.qty for l in list(book.bids)[: self.depth_levels])
        ask_depth = sum(l.price * l.qty for l in list(book.asks)[: self.depth_levels])
        tot = bid_depth + ask_depth
        imbalance = (bid_depth - ask_depth) / tot if tot > 0 else 0.0

        mids = np.array([m for _, m in st.mids], dtype=float)
        rv_short = _rv_bps(mids, self.short_window)
        rv_long = _rv_bps(mids, self.long_window)
        ret_short = _ret_bps(mids, self.short_window)
        ret_long = _ret_bps(mids, self.long_window)

        buy_v = sum(t.qty for t in st.trades if t.taker_is_buy)
        sell_v = sum(t.qty for t in st.trades if not t.taker_is_buy)
        tv = buy_v + sell_v
        flow = (buy_v - sell_v) / tv if tv > 0 else 0.0

        inv_notional = abs(position.qty) * mid
        inv_pct = inv_notional / equity.equity * 100.0 if equity.equity > 0 else 0.0
        upnl_pct = position.unrealized(mid) / equity.equity * 100.0 if equity.equity > 0 else 0.0

        snap = Snapshot(
            symbol=book.symbol,
            ts=book.ts,
            mid=mid,
            spread_bps=spread_bps,
            imbalance=float(np.clip(imbalance, -1, 1)),
            depth_usd=tot,
            rv_short=rv_short,
            rv_long=rv_long,
            ret_short_bps=ret_short,
            ret_long_bps=ret_long,
            trade_flow=float(np.clip(flow, -1, 1)),
            inventory=position.qty,
            inventory_pct=inv_pct,
            unrealized_pnl_pct=upnl_pct,
            drawdown_pct=equity.drawdown_pct,
            daily_pnl_pct=equity.daily_pnl_pct,
            funding_bps_8h=funding_bps,
            bars_held=position.bars_held,
            levels=levels,
        )
        if estimate_tokens(snap.compact()) > TOKEN_BUDGET:
            raise ValueError("snapshot exceeds token budget")  # pragma: no cover - structural guarantee
        return snap


def _rv_bps(mids: np.ndarray, window: int) -> float:
    if len(mids) < 3:
        return 0.0
    w = mids[-(window + 1):]
    r = np.diff(np.log(w))
    if len(r) < 2:
        return 0.0
    return float(np.std(r, ddof=1) * 1e4)


def _ret_bps(mids: np.ndarray, window: int) -> float:
    if len(mids) < 2:
        return 0.0
    w = mids[-(window + 1):]
    return float(math.log(w[-1] / w[0]) * 1e4)


def estimate_tokens(obj: dict) -> int:
    """Conservative token estimate for compact JSON (~3.2 chars/token for numeric-heavy JSON)."""
    s = json.dumps(obj, separators=(",", ":"))
    return int(math.ceil(len(s) / 3.2))


def build_state(snapshots: Sequence[Snapshot]) -> dict:
    """The exact `state` object sent to Jev: a list of compact snapshots. Nothing else."""
    return {"snapshots": [s.compact() for s in snapshots]}
