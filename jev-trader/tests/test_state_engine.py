import math

import pytest

from jev_trader.state_engine import TOKEN_BUDGET, CausalityError, EquityTracker, Funding, StateEngine, Trade, build_state, estimate_tokens
from jev_trader.types import Position
from tests.conftest import make_book


def test_snapshot_fields_and_token_budget():
    se = StateEngine(short_window=3, long_window=6)
    eq = EquityTracker(10_000)
    pos = Position(symbol="X")
    snap = None
    for i in range(8):
        snap = se.update(make_book("X", 1_000 + i * 60_000, 100 * math.exp(0.001 * i), spread_bps=5, skew=0.2), pos, eq)
    assert snap.mid > 100
    assert abs(snap.spread_bps - 5) < 1e-6
    assert snap.imbalance > 0  # bid-heavy book
    assert snap.rv_short > 0 and snap.rv_long > 0
    assert snap.ret_long_bps > 0
    assert estimate_tokens(snap.compact()) <= TOKEN_BUDGET
    assert estimate_tokens(build_state([snap])) <= TOKEN_BUDGET


def test_rejects_out_of_order_books():
    se = StateEngine(short_window=2, long_window=4)
    eq, pos = EquityTracker(1), Position(symbol="X")
    se.update(make_book("X", 2_000, 100), pos, eq)
    with pytest.raises(CausalityError):
        se.update(make_book("X", 2_000, 100), pos, eq)
    with pytest.raises(CausalityError):
        se.update(make_book("X", 1_000, 100), pos, eq)


def test_future_trade_leak_is_rejected_and_future_funding_hidden():
    se = StateEngine(short_window=2, long_window=4)
    eq, pos = EquityTracker(1), Position(symbol="X")
    se.ingest_trades([Trade("X", 5_000, 100, 1, True)])
    with pytest.raises(CausalityError):
        se.update(make_book("X", 4_000, 100), pos, eq)
    se2 = StateEngine(short_window=2, long_window=4)
    se2.ingest_funding(Funding("X", 8_500, 2.5))
    snap = se2.update(make_book("X", 8_000, 100), pos, eq)
    assert snap.funding_bps_8h is None  # funding print is from the future relative to this snapshot
    snap = se2.update(make_book("X", 9_000, 100), pos, eq)
    assert snap.funding_bps_8h == 2.5
    with pytest.raises(CausalityError):
        se2.ingest_funding(Funding("X", 8_000, 1.0))  # out-of-order funding is rejected


def test_trade_flow_sign_and_inventory_metrics():
    se = StateEngine(short_window=2, long_window=4)
    eq = EquityTracker(10_000)
    pos = Position(symbol="X", qty=10, avg_price=90, bars_held=3)
    se.ingest_trades([Trade("X", 1_000, 100, 3, True), Trade("X", 1_500, 100, 1, False)])
    snap = se.update(make_book("X", 2_000, 100), pos, eq)
    assert snap.trade_flow == pytest.approx(0.5)
    assert snap.inventory == 10
    assert snap.inventory_pct == pytest.approx(10.0)
    assert snap.unrealized_pnl_pct == pytest.approx(1.0)
    assert snap.bars_held == 3


def test_equity_tracker_drawdown_and_daily():
    eq = EquityTracker(1000)
    eq.mark(1100, 0)
    eq.mark(990, 1)
    assert eq.drawdown_pct == pytest.approx(10.0)
    assert eq.daily_pnl_pct == pytest.approx(-1.0)
    eq.mark(990, 86_400_000)  # new day resets daily base
    assert eq.daily_pnl_pct == pytest.approx(0.0)
