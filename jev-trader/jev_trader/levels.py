"""Market-structure levels, computed in code from trades: daily-session volume profile (POC / VAH / VAL), a rolling
composite profile for swing context, naked POCs, liquidity pools (swing highs/lows, equal highs/lows, prior session
extremes), liquidity sweeps, and a breakout -> move-away -> retest state machine.

Everything here is deterministic arithmetic over bars built from trades with event ts <= the candle ts. The output is a
LevelsContext of small numbers that the state engine folds into the Snapshot the Reflex sees. No model is involved.
"""
from __future__ import annotations

import math
from collections import defaultdict, deque
from dataclasses import dataclass, field
from typing import Deque, Iterable, Literal, Optional

from .state_engine import Trade


@dataclass(frozen=True)
class Bar:
    ts: int
    open: float
    high: float
    low: float
    close: float
    volume: float


@dataclass(frozen=True)
class Profile:
    session: int
    poc: float
    vah: float
    val: float
    high: float
    low: float
    volume: float


@dataclass
class _Level:
    price: float
    kind: Literal["swing_high", "swing_low", "equal_high", "equal_low", "prev_high", "prev_low", "poc", "vah", "val", "comp_vah", "comp_val"]
    ts: int
    tested: bool = False  # for naked POCs


@dataclass
class _Retest:
    level: float
    kind: str
    direction: int  # +1 broke up (level is now support); -1 broke down (level is now resistance)
    away: bool = False
    state: Literal["broke", "away", "retest"] = "broke"
    age: int = 0


@dataclass(frozen=True)
class LevelsContext:
    atr_bps: float
    poc_bps: float            # (poc - mid)/mid bps for the current session
    vah_bps: float
    val_bps: float
    va_pos: int               # -1 below value area, 0 inside, +1 above
    prev_poc_bps: Optional[float]
    naked_poc_bps: Optional[float]   # nearest untested prior-session POC
    comp_poc_bps: Optional[float]    # composite (last N sessions)
    comp_vah_bps: Optional[float]
    comp_val_bps: Optional[float]
    liq_above_bps: Optional[float]
    liq_above_kind: int       # 0 none, 1 swing, 2 equal highs/lows, 3 prev session extreme, 4 composite VA edge
    liq_below_bps: Optional[float]
    liq_below_kind: int
    sweep: int                # +1 swept a high and closed back below, -1 swept a low and closed back above, 0 none
    sweep_age: int            # bars since the sweep (0 = this bar), -1 none
    retest: int               # +1 retesting a broken level from above (support), -1 from below (resistance), 0 none
    retest_bps: Optional[float]
    session_bar: int          # bars since session open

    def compact(self) -> dict:
        d = {
            "atr": round(self.atr_bps, 1),
            "poc": round(self.poc_bps, 1), "vah": round(self.vah_bps, 1), "val": round(self.val_bps, 1), "va": self.va_pos,
            "liqA": None if self.liq_above_bps is None else round(self.liq_above_bps, 1), "liqAk": self.liq_above_kind,
            "liqB": None if self.liq_below_bps is None else round(self.liq_below_bps, 1), "liqBk": self.liq_below_kind,
            "swp": self.sweep, "swpAge": self.sweep_age, "rt": self.retest, "sbar": self.session_bar,
        }
        for k, v in (("pPoc", self.prev_poc_bps), ("nPoc", self.naked_poc_bps), ("cPoc", self.comp_poc_bps), ("cVah", self.comp_vah_bps), ("cVal", self.comp_val_bps), ("rtBps", self.retest_bps)):
            if v is not None:
                d[k] = round(v, 1)
        return {k: v for k, v in d.items() if v is not None}


_KIND_CODE = {"swing_high": 1, "swing_low": 1, "equal_high": 2, "equal_low": 2, "prev_high": 3, "prev_low": 3, "comp_vah": 4, "comp_val": 4, "poc": 0, "vah": 0, "val": 0}


def value_area(buckets: dict[int, float], width: float, base: float, pct: float) -> tuple[float, float, float]:
    """Classic TPO/volume value area: start at the POC bucket, expand toward the heavier neighbour until pct of volume."""
    if not buckets:
        raise ValueError("empty profile")
    total = sum(buckets.values())
    poc_i = max(buckets, key=lambda i: (buckets[i], -abs(i)))
    lo = hi = poc_i
    acc = buckets[poc_i]
    while acc < pct * total:
        up = buckets.get(hi + 1, 0.0)
        dn = buckets.get(lo - 1, 0.0)
        if up == 0.0 and dn == 0.0:
            break
        if up >= dn:
            hi += 1
            acc += up
        else:
            lo -= 1
            acc += dn
    price = lambda i: base + (i + 0.5) * width  # bucket centre
    return price(poc_i), base + (hi + 1) * width, base + lo * width


@dataclass
class _SymbolLevels:
    bars: Deque[Bar]
    session: Optional[int] = None
    session_base: float = 0.0
    session_width: float = 0.0
    session_buckets: dict = field(default_factory=lambda: defaultdict(float))
    session_high: float = -math.inf
    session_low: float = math.inf
    session_bar: int = 0
    profiles: Deque[Profile] = field(default_factory=lambda: deque(maxlen=30))
    naked: list = field(default_factory=list)  # _Level kind poc
    swings: Deque[_Level] = field(default_factory=lambda: deque(maxlen=60))
    retests: list = field(default_factory=list)
    last_sweep: Optional[tuple[int, int]] = None  # (direction, bar_index)
    bar_index: int = 0
    atr: float = 0.0


class LevelEngine:
    def __init__(
        self,
        session_ms: int = 86_400_000,
        session_start_utc_hour: int = 0,
        value_area_pct: float = 0.70,
        bucket_bps: float = 10.0,
        composite_sessions: int = 5,
        swing_k: int = 3,
        atr_window: int = 14,
        equal_tol_atr: float = 0.15,
        sweep_lookback: int = 24,
        retest_tol_atr: float = 0.25,
        retest_away_atr: float = 1.0,
        retest_max_age: int = 72,
    ):
        self.session_ms = session_ms
        self.session_offset = session_start_utc_hour * 3_600_000
        self.va_pct = value_area_pct
        self.bucket_bps = bucket_bps
        self.composite_sessions = composite_sessions
        self.k = swing_k
        self.atr_window = atr_window
        self.equal_tol_atr = equal_tol_atr
        self.sweep_lookback = sweep_lookback
        self.retest_tol_atr = retest_tol_atr
        self.retest_away_atr = retest_away_atr
        self.retest_max_age = retest_max_age
        self._s: dict[str, _SymbolLevels] = {}

    def _st(self, sym: str) -> _SymbolLevels:
        if sym not in self._s:
            self._s[sym] = _SymbolLevels(bars=deque(maxlen=max(400, self.atr_window * 4)))
        return self._s[sym]

    # ---- public ------------------------------------------------------------------
    def on_candle(self, symbol: str, ts: int, trades: Iterable[Trade], mid: float) -> LevelsContext:
        st = self._st(symbol)
        tr = [t for t in trades if t.ts <= ts]
        bar = _bar_from_trades(ts, tr, mid)
        self._roll_session(st, ts, bar)
        self._profile_add(st, tr, bar)
        st.bars.append(bar)
        st.bar_index += 1
        st.session_bar += 1
        st.session_high = max(st.session_high, bar.high)
        st.session_low = min(st.session_low, bar.low)
        self._update_atr(st)
        self._update_naked(st, bar)
        self._update_swings(st)
        self._detect_sweep(st, bar)
        self._update_retests(st, bar)
        return self._context(st, mid)

    def profiles(self, symbol: str) -> list[Profile]:
        return list(self._st(symbol).profiles)

    # ---- sessions & profile ----------------------------------------------------------
    def _session_key(self, ts: int) -> int:
        return (ts - self.session_offset) // self.session_ms

    def _roll_session(self, st: _SymbolLevels, ts: int, bar: Bar) -> None:
        key = self._session_key(ts)
        if st.session is None:
            st.session = key
            st.session_base = bar.open
            st.session_width = bar.open * self.bucket_bps / 1e4
            return
        if key != st.session:
            if st.session_buckets:
                poc, vah, val = value_area(st.session_buckets, st.session_width, st.session_base, self.va_pct)
                vol = sum(st.session_buckets.values())
                st.profiles.append(Profile(st.session, poc, vah, val, st.session_high, st.session_low, vol))
                st.naked.append(_Level(poc, "poc", ts))
                st.naked = st.naked[-20:]
            st.session = key
            st.session_base = bar.open
            st.session_width = bar.open * self.bucket_bps / 1e4
            st.session_buckets = defaultdict(float)
            st.session_high, st.session_low, st.session_bar = -math.inf, math.inf, 0

    def _profile_add(self, st: _SymbolLevels, trades: list[Trade], bar: Bar) -> None:
        w = st.session_width or (bar.close * self.bucket_bps / 1e4)
        if trades:
            for t in trades:
                st.session_buckets[int(math.floor((t.price - st.session_base) / w))] += t.qty * t.price
        else:
            st.session_buckets[int(math.floor((bar.close - st.session_base) / w))] += 1e-9  # keep the profile non-empty

    def _current_profile(self, st: _SymbolLevels) -> tuple[float, float, float]:
        return value_area(st.session_buckets, st.session_width, st.session_base, self.va_pct)

    def _composite(self, st: _SymbolLevels) -> Optional[tuple[float, float, float]]:
        profs = list(st.profiles)[-self.composite_sessions:]
        if len(profs) < 2:
            return None
        # Re-bucket the closed sessions' value areas by volume weight (cheap composite; exact would need raw buckets).
        base = min(p.low for p in profs)
        w = base * self.bucket_bps / 1e4
        buckets: dict[int, float] = defaultdict(float)
        for p in profs:
            lo, hi = int((p.val - base) // w), int((p.vah - base) // w)
            if hi < lo:
                lo, hi = hi, lo
            per = p.volume / max(1, hi - lo + 1)
            for i in range(lo, hi + 1):
                buckets[i] += per
            buckets[int((p.poc - base) // w)] += p.volume * 0.5  # weight the POC
        return value_area(buckets, w, base, self.va_pct)

    # ---- ATR, naked POCs, swings --------------------------------------------------------
    def _update_atr(self, st: _SymbolLevels) -> None:
        b = list(st.bars)
        if len(b) < 2:
            st.atr = (b[-1].high - b[-1].low) if b else 0.0
            return
        trs = []
        for prev, cur in zip(b[-(self.atr_window + 1):-1], b[-self.atr_window:]):
            trs.append(max(cur.high - cur.low, abs(cur.high - prev.close), abs(cur.low - prev.close)))
        st.atr = sum(trs) / len(trs) if trs else 0.0

    def _update_naked(self, st: _SymbolLevels, bar: Bar) -> None:
        for lv in st.naked:
            if not lv.tested and bar.low <= lv.price <= bar.high:
                lv.tested = True

    def _update_swings(self, st: _SymbolLevels) -> None:
        b = list(st.bars)
        k = self.k
        if len(b) < 2 * k + 1:
            return
        c = b[-k - 1]
        left, right = b[-2 * k - 1:-k - 1], b[-k:]
        if all(c.high > x.high for x in left) and all(c.high >= x.high for x in right):
            self._add_swing(st, _Level(c.high, "swing_high", c.ts))
        if all(c.low < x.low for x in left) and all(c.low <= x.low for x in right):
            self._add_swing(st, _Level(c.low, "swing_low", c.ts))

    def _add_swing(self, st: _SymbolLevels, lv: _Level) -> None:
        tol = self.equal_tol_atr * st.atr
        side = "high" if lv.kind == "swing_high" else "low"
        for other in st.swings:
            if other.kind.endswith(side) and abs(other.price - lv.price) <= tol:
                other.kind = f"equal_{side}"  # type: ignore[assignment]
                lv.kind = f"equal_{side}"  # type: ignore[assignment]
        st.swings.append(lv)

    # ---- liquidity, sweeps, retests ------------------------------------------------------
    def _liquidity_levels(self, st: _SymbolLevels) -> list[_Level]:
        out = list(st.swings)
        if st.profiles:
            p = st.profiles[-1]
            out += [_Level(p.high, "prev_high", 0), _Level(p.low, "prev_low", 0)]
        comp = self._composite(st)
        if comp:
            out += [_Level(comp[1], "comp_vah", 0), _Level(comp[2], "comp_val", 0)]
        return out

    def _detect_sweep(self, st: _SymbolLevels, bar: Bar) -> None:
        if len(st.bars) < 2:
            return
        prev_close = st.bars[-2].close
        for lv in self._liquidity_levels(st):
            if lv.ts >= bar.ts:
                continue
            if lv.kind.endswith("high") and prev_close < lv.price and bar.high > lv.price and bar.close < lv.price:
                st.last_sweep = (1, st.bar_index)
            if lv.kind.endswith("low") and prev_close > lv.price and bar.low < lv.price and bar.close > lv.price:
                st.last_sweep = (-1, st.bar_index)

    def _update_retests(self, st: _SymbolLevels, bar: Bar) -> None:
        if len(st.bars) < 2 or st.atr <= 0:
            return
        prev = st.bars[-2]
        tol = self.retest_tol_atr * st.atr
        # 1. new breakouts of structural levels
        structural: list[tuple[float, str]] = []
        if st.profiles:
            p = st.profiles[-1]
            structural += [(p.vah, "prev_vah"), (p.val, "prev_val"), (p.poc, "prev_poc"), (p.high, "prev_high"), (p.low, "prev_low")]
        comp = self._composite(st)
        if comp:
            structural += [(comp[1], "comp_vah"), (comp[2], "comp_val")]
        for lv in st.swings:
            structural.append((lv.price, lv.kind))
        tracked = {(round(r.level, 10), r.direction) for r in st.retests}
        for price, kind in structural:
            if prev.close <= price < bar.close and (round(price, 10), 1) not in tracked:
                st.retests.append(_Retest(price, kind, +1))
            elif prev.close >= price > bar.close and (round(price, 10), -1) not in tracked:
                st.retests.append(_Retest(price, kind, -1))
        # 2. advance the state machines
        keep: list[_Retest] = []
        for r in st.retests:
            r.age += 1
            if r.age > self.retest_max_age:
                continue
            if r.direction == +1:
                if bar.close < r.level - tol:
                    continue  # failed: lost the level
                if not r.away and bar.high >= r.level + self.retest_away_atr * st.atr:
                    r.away, r.state = True, "away"
                if r.away and bar.low <= r.level + tol and bar.close >= r.level:
                    r.state = "retest"
                elif r.away and r.state == "retest" and bar.low > r.level + tol:
                    r.state = "away"
            else:
                if bar.close > r.level + tol:
                    continue
                if not r.away and bar.low <= r.level - self.retest_away_atr * st.atr:
                    r.away, r.state = True, "away"
                if r.away and bar.high >= r.level - tol and bar.close <= r.level:
                    r.state = "retest"
                elif r.away and r.state == "retest" and bar.high < r.level - tol:
                    r.state = "away"
            keep.append(r)
        st.retests = keep[-12:]

    # ---- context -------------------------------------------------------------------------
    def _context(self, st: _SymbolLevels, mid: float) -> LevelsContext:
        bps = lambda p: (p - mid) / mid * 1e4
        poc, vah, val = self._current_profile(st)
        va_pos = 0 if val <= mid <= vah else (1 if mid > vah else -1)
        prev_poc = bps(st.profiles[-1].poc) if st.profiles else None
        naked = [lv for lv in st.naked if not lv.tested]
        naked_bps = bps(min(naked, key=lambda l: abs(l.price - mid)).price) if naked else None
        comp = self._composite(st)
        comp_poc, comp_vah, comp_val = (bps(comp[0]), bps(comp[1]), bps(comp[2])) if comp else (None, None, None)
        above = [lv for lv in self._liquidity_levels(st) if lv.price > mid]
        below = [lv for lv in self._liquidity_levels(st) if lv.price < mid]
        la = min(above, key=lambda l: l.price) if above else None
        lb = max(below, key=lambda l: l.price) if below else None
        sweep, age = 0, -1
        if st.last_sweep and st.bar_index - st.last_sweep[1] <= self.sweep_lookback:
            sweep, age = st.last_sweep[0], st.bar_index - st.last_sweep[1]
        rt = [r for r in st.retests if r.state == "retest"]
        rt_best = min(rt, key=lambda r: abs(r.level - mid)) if rt else None
        return LevelsContext(
            atr_bps=st.atr / mid * 1e4 if mid else 0.0,
            poc_bps=bps(poc), vah_bps=bps(vah), val_bps=bps(val), va_pos=va_pos,
            prev_poc_bps=prev_poc, naked_poc_bps=naked_bps,
            comp_poc_bps=comp_poc, comp_vah_bps=comp_vah, comp_val_bps=comp_val,
            liq_above_bps=bps(la.price) if la else None, liq_above_kind=_KIND_CODE[la.kind] if la else 0,
            liq_below_bps=bps(lb.price) if lb else None, liq_below_kind=_KIND_CODE[lb.kind] if lb else 0,
            sweep=sweep, sweep_age=age,
            retest=rt_best.direction if rt_best else 0, retest_bps=bps(rt_best.level) if rt_best else None,
            session_bar=st.session_bar,
        )


def _bar_from_trades(ts: int, trades: list[Trade], mid: float) -> Bar:
    if not trades:
        return Bar(ts, mid, mid, mid, mid, 0.0)
    ps = [t.price for t in trades]
    return Bar(ts, trades[0].price, max(ps + [mid]), min(ps + [mid]), mid, sum(t.qty for t in trades))
