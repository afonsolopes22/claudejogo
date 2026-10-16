from pathlib import Path

import pytest

from jev_trader.execution.paper import PaperExchange, UnapprovedOrder
from jev_trader.risk import RiskEngine, intent_hash
from jev_trader.state_engine import EquityTracker
from jev_trader.types import Intent, Position, RiskApproval, Side
from tests.conftest import make_book


def intent(side=Side.buy, qty=10.0, px=100.0, reason="entry", sym="HYPE") -> Intent:
    return Intent(symbol=sym, ts=1, side=side, qty=qty, ref_price=px, notional_usd=qty * px, reason=reason)


def engine(limits, equity=10_000, positions=None):
    eq = EquityTracker(equity)
    return RiskEngine(limits, eq, positions or {"HYPE": Position(symbol="HYPE")}), eq


def test_kill_switch_blocks_everything_even_exits(limits):
    re, _ = engine(limits, positions={"HYPE": Position(symbol="HYPE", qty=10, avg_price=100)})
    Path(limits.kill_switch_path).write_text("x")
    assert re.check(intent(Side.sell, 10), {"HYPE": 100}).reason == "kill_switch_armed"
    assert re.check(intent(Side.buy, 1), {"HYPE": 100}).reason == "kill_switch_armed"


def test_drawdown_latches_and_allows_only_reducing(limits):
    re, eq = engine(limits, positions={"HYPE": Position(symbol="HYPE", qty=10, avg_price=100)})
    eq.mark(10_000, 0)
    eq.mark(8_400, 1)  # -16%
    d = re.check(intent(Side.buy, 1), {"HYPE": 84})
    assert not d.allowed and d.reason == "max_drawdown"
    assert Path(limits.halt_latch_path).exists()
    d2 = re.check(intent(Side.sell, 10, 84, "flatten"), {"HYPE": 84})
    assert d2.allowed and d2.approval is not None
    # over-reducing (flipping) is not "reducing"
    d3 = re.check(intent(Side.sell, 11, 84, "flatten"), {"HYPE": 84})
    assert not d3.allowed and d3.reason == "halted_latch"
    eq.mark(10_000, 2)  # recovered, but latch persists until operator clears it
    assert re.check(intent(Side.buy, 1), {"HYPE": 100}).reason == "halted_latch"


def test_daily_loss_latch(limits):
    re, eq = engine(limits)
    eq.mark(10_000, 0)
    eq.mark(9_690, 1)  # -3.1% today, dd 3.1%
    assert re.check(intent(), {"HYPE": 100}).reason == "max_daily_loss"


def test_position_and_gross_caps(limits):
    mon = Position(symbol="MON", qty=3000, avg_price=1.0)
    re, _ = engine(limits, positions={"HYPE": Position(symbol="HYPE"), "MON": mon})
    # per-symbol: 20% of 10k = 2000
    assert re.check(intent(qty=21, px=100), {"HYPE": 100, "MON": 1}).reason == "max_position_notional"
    assert re.check(intent(qty=19, px=100), {"HYPE": 100, "MON": 1}).allowed
    # gross: 60% = 6000; MON at 5000 -> HYPE 1500 blocked even though it passes the per-symbol cap
    mon.qty = 5000
    assert re.check(intent(qty=15, px=100), {"HYPE": 100, "MON": 1}).reason == "max_gross_exposure"
    assert re.check(intent(qty=0.005, px=100), {"HYPE": 100}).reason == "below_min_order"


def test_approval_binds_to_intent_and_paper_exchange_refuses_mismatch(limits):
    re, _ = engine(limits)
    i1 = intent(qty=5)
    d = re.check(i1, {"HYPE": 100})
    assert d.allowed and RiskEngine.verify(i1, d.approval)
    i2 = intent(qty=6)
    assert not RiskEngine.verify(i2, d.approval)
    ex = PaperExchange()
    with pytest.raises(UnapprovedOrder):
        ex.submit(i2, d.approval, make_book("HYPE", 1, 100))
    fill = ex.submit(i1, d.approval, make_book("HYPE", 1, 100, spread_bps=4))
    assert fill.side == Side.buy and fill.price > 100 and fill.fee_usd > 0 and fill.slippage_bps >= 2.0
    assert ex.submit(i1, d.approval, make_book("HYPE", 1, 100, spread_bps=500)) is None
    assert intent_hash(i1) != intent_hash(i2)
    bogus = RiskApproval(intent_hash="00", issued_ts=1, limits_version="x")
    with pytest.raises(UnapprovedOrder):
        ex.submit(i1, bogus, make_book("HYPE", 1, 100))
