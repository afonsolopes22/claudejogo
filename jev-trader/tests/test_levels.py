import math

import pytest

from jev_trader.levels import Bar, LevelEngine, value_area
from jev_trader.state_engine import Trade

H = 3_600_000
DAY = 24 * H


def trades_at(sym, ts, prices, qty=1.0):
    return [Trade(sym, ts - H + (i + 1) * 1000, p, qty, True) for i, p in enumerate(prices)]


def test_value_area_poc_and_70pct():
    # buckets 0..4 with volumes; POC is bucket 2; VA expands to >=70% of 100
    b = {0: 5.0, 1: 15.0, 2: 40.0, 3: 30.0, 4: 10.0}
    poc, vah, val = value_area(b, width=1.0, base=100.0, pct=0.70)
    assert poc == pytest.approx(102.5)           # centre of bucket 2
    assert val == pytest.approx(102.0) and vah == pytest.approx(104.0)  # buckets 2..3 = exactly 70%; the heavier neighbour (30) is taken first
    with pytest.raises(ValueError):
        value_area({}, 1.0, 0.0, 0.7)


def test_session_profile_rolls_daily_and_tracks_naked_poc():
    le = LevelEngine(bucket_bps=10)
    sym = "X"
    t0 = 1_700_000_000_000 - (1_700_000_000_000 % DAY)  # session open at UTC midnight
    # Day 1: heavy trading at 100, lighter at 101 and 99
    for i in range(24):
        ts = t0 + i * H
        ctx = le.on_candle(sym, ts, trades_at(sym, ts, [100.0] * 6 + [101.0] * 2 + [99.0] * 2), 100.0)
    assert abs(ctx.poc_bps) < 15 and ctx.va_pos == 0 and ctx.session_bar == 24
    assert ctx.prev_poc_bps is None and ctx.naked_poc_bps is None
    # Day 2 opens far above: previous POC (~100) becomes a naked POC below
    ts = t0 + DAY
    ctx = le.on_candle(sym, ts, trades_at(sym, ts, [105.0] * 10), 105.0)
    assert len(le.profiles(sym)) == 1 and le.profiles(sym)[0].session == t0 // DAY
    assert ctx.prev_poc_bps is not None and ctx.prev_poc_bps < -400
    assert ctx.naked_poc_bps is not None and ctx.naked_poc_bps == pytest.approx(ctx.prev_poc_bps)
    assert ctx.session_bar == 1
    # Price trades back through ~100: the POC is tested and stops being naked
    ts += H
    ctx = le.on_candle(sym, ts, trades_at(sym, ts, [104.0, 101.0, 99.5, 100.5]), 100.5)
    assert ctx.naked_poc_bps is None


def test_swings_equal_highs_liquidity_and_sweep():
    le = LevelEngine(swing_k=2, atr_window=5, equal_tol_atr=0.5, bucket_bps=10)
    sym = "X"
    t0 = 1_700_000_000_000 - (1_700_000_000_000 % DAY)
    # path: two swing highs at ~110 (equal highs), then price below, then a bar that spikes above 110 and closes back below
    path = [100, 103, 110, 104, 101, 102, 110, 103, 100, 99, 100]
    ctx = None
    for i, c in enumerate(path):
        ts = t0 + i * H
        hi = c + 0.5
        ctx = le.on_candle(sym, ts, trades_at(sym, ts, [c - 0.5, hi, c]), float(c))
    kinds = [lv.kind for lv in le._st(sym).swings]
    assert kinds.count("equal_high") == 2  # the two ~110.5 highs were clustered as equal highs
    # nearest level above the 100 close is the broken swing low at 100.5 (a swing low above price is still a level)
    assert ctx.liq_above_bps == pytest.approx(50.0) and ctx.liq_above_kind == 1
    assert ctx.sweep == 0
    ts = t0 + len(path) * H
    ctx = le.on_candle(sym, ts, trades_at(sym, ts, [100.0, 111.5, 104.0]), 104.0)  # spike through 110.5, close below
    assert ctx.sweep == 1 and ctx.sweep_age == 0
    ts += H
    ctx = le.on_candle(sym, ts, trades_at(sym, ts, [104.0, 103.0]), 103.0)
    assert ctx.sweep == 1 and ctx.sweep_age == 1


def test_breakout_away_retest_state_machine():
    le = LevelEngine(swing_k=1, atr_window=3, retest_tol_atr=0.3, retest_away_atr=1.0, bucket_bps=10)
    sym = "X"
    t0 = 1_700_000_000_000 - (1_700_000_000_000 % DAY)
    # build a swing high at 105 (bars 1 high 105 with lower neighbours), ATR ~ 2
    bars = [(100, 101, 99), (103, 105, 102), (101, 102, 100), (101, 102, 100)]  # (close, high, low)
    i = 0
    for c, h, l in bars:
        ts = t0 + i * H; i += 1
        ctx = le.on_candle(sym, ts, trades_at(sym, ts, [l, h, c]), float(c))
    assert ctx.liq_above_kind == 1 and ctx.retest == 0
    # breakout above 105, move away >= 1 ATR, then come back to touch 105 and hold -> retest as support
    for c, h, l in [(106, 106.5, 101), (109, 110, 105.5), (106, 109, 105.1)]:
        ts = t0 + i * H; i += 1
        ctx = le.on_candle(sym, ts, trades_at(sym, ts, [l, h, c]), float(c))
    assert ctx.retest == 1 and ctx.retest_bps is not None and ctx.retest_bps < 0
    # lose the level decisively -> retest cleared
    ts = t0 + i * H
    ctx = le.on_candle(sym, ts, trades_at(sym, ts, [105, 105.2, 101]), 101.0)
    assert ctx.retest == 0


def test_context_is_compact_and_within_token_budget():
    from jev_trader.state_engine import TOKEN_BUDGET, EquityTracker, StateEngine, estimate_tokens
    from jev_trader.types import Position
    from tests.conftest import make_book

    le = LevelEngine(swing_k=2, bucket_bps=10)
    se = StateEngine(short_window=3, long_window=6)
    eq, pos = EquityTracker(10_000), Position(symbol="X")
    t0 = 1_700_000_000_000 - (1_700_000_000_000 % DAY)
    snap = None
    for i in range(60):
        ts = t0 + i * H
        px = 100 + 3 * math.sin(i / 4)
        ctx = le.on_candle("X", ts, trades_at("X", ts, [px - 0.3, px + 0.4, px]), px)
        snap = se.update(make_book("X", ts, px), pos, eq, levels=ctx.compact())
    assert snap.levels and "poc" in snap.levels and "cPoc" in snap.levels  # 2+ closed sessions -> composite present
    assert estimate_tokens(snap.compact()) <= TOKEN_BUDGET, estimate_tokens(snap.compact())
    assert all(v is not None for v in snap.levels.values())
