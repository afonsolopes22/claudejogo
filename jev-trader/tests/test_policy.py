import pytest

from jev_trader.policy import Gates, Policy, kelly_fraction
from jev_trader.state_engine import EquityTracker
from jev_trader.types import Direction, Position, Regime, RiskState, Side, Snapshot, Verdict


def snap(**kw) -> Snapshot:
    base = dict(symbol="HYPE", ts=1, mid=100.0, spread_bps=4, imbalance=0, depth_usd=5_000_000, rv_short=20, rv_long=20, ret_short_bps=0, ret_long_bps=0, trade_flow=0, inventory=0, inventory_pct=0, unrealized_pnl_pct=0, drawdown_pct=0, daily_pnl_pct=0, bars_held=0)
    base.update(kw)
    return Snapshot(**base)


def verdict(**kw) -> Verdict:
    base = dict(symbol="HYPE", ts=1, schema_version="v", regime=Regime.trending, regime_conf=0.9, regime_probs={}, direction=Direction.long, direction_conf=0.9, direction_probs={"long": 0.9, "short": 0.05, "neutral": 0.05}, toxic_flow_p=0.1, setup_quality=2.4, setup_quality_conf=0.8, setup_quality_probs={}, risk_state=RiskState.safe, risk_state_conf=0.9, latency_ms=80, model="stub")
    base.update(kw)
    return Verdict(**base)


def test_kelly():
    assert kelly_fraction(0.5, 1.0) == 0.0
    assert kelly_fraction(0.6, 1.0) == pytest.approx(0.2)
    assert kelly_fraction(0.9, 2.0) == pytest.approx((0.9 * 2 - 0.1) / 2)
    assert kelly_fraction(0.1, 2.0) == 0.0
    assert kelly_fraction(0.9, 0.0) == 0.0


def test_entry_fires_with_quarter_kelly_and_caps(mini_book):
    setup = mini_book.setups[0]  # HYPE long, b=2
    pol = Policy(Gates())
    eq = EquityTracker(10_000)
    it = pol.entry_intent(snap(), verdict(), Position(symbol="HYPE"), eq, setup)
    assert it is not None and it.side == Side.buy and it.reason == "entry"
    f_full = kelly_fraction(0.9, 2.0)
    assert it.kelly_fraction == pytest.approx(min(0.25 * f_full, 0.25))
    assert it.notional_usd == pytest.approx(min(it.kelly_fraction, setup.max_notional_pct / 100) * 10_000)
    # smaller edge -> smaller size, strictly below the per-symbol cap
    it_small = pol.entry_intent(snap(), verdict(direction_probs={"long": 0.82, "short": 0.1, "neutral": 0.08}), Position(symbol="HYPE"), eq, setup)
    assert it_small.kelly_fraction == pytest.approx(0.25 * kelly_fraction(0.82, 2.0)) and it_small.notional_usd < 2_000
    # depth cap: never more than 1/20 of visible depth
    it2 = pol.entry_intent(snap(depth_usd=10_000), verdict(), Position(symbol="HYPE"), eq, setup)
    assert it2.notional_usd == pytest.approx(500)


@pytest.mark.parametrize(
    "v_kw,s_kw,reason",
    [
        (dict(setup_quality=1.9), {}, "setup_quality_low"),
        (dict(direction_conf=0.80), {}, "direction_conf_low"),
        (dict(risk_state=RiskState.near_limit), {}, "risk_state_near_limit"),
        (dict(regime=Regime.crisis), {}, "regime_crisis"),
        (dict(direction=Direction.neutral), {}, "direction_neutral"),
        (dict(direction=Direction.short, direction_probs={"short": 0.9}), {}, "direction_against_bias"),
        (dict(toxic_flow_p=0.6), {}, "toxic_flow"),
        ({}, dict(spread_bps=30), "spread_wide"),
    ],
)
def test_each_gate_blocks(mini_book, v_kw, s_kw, reason):
    pol = Policy(Gates())
    setup = mini_book.setups[0]
    assert pol.entry_blocked_reason(snap(**s_kw), verdict(**v_kw), setup) == reason
    assert pol.entry_intent(snap(**s_kw), verdict(**v_kw), Position(symbol="HYPE"), EquityTracker(1e4), setup) is None


def test_no_pyramiding_and_untradable(mini_book):
    pol = Policy(Gates())
    setup = mini_book.setups[0]
    assert pol.entry_intent(snap(), verdict(), Position(symbol="HYPE", qty=1, avg_price=100), EquityTracker(1e4), setup) is None
    assert pol.entry_blocked_reason(snap(), verdict(), setup.model_copy(update={"tradable": False})) == "setup_not_tradable"


def test_code_owned_exits(mini_book):
    pol = Policy(Gates())
    setup = mini_book.setups[0]  # stop 300, target 600, horizon 10
    pos = Position(symbol="HYPE", qty=2, avg_price=100, bars_held=1)
    assert pol.exit_intent(snap(mid=96.9), pos, setup, None).reason == "stop_loss"
    assert pol.exit_intent(snap(mid=106.1), pos, setup, None).reason == "take_profit"
    assert pol.exit_intent(snap(mid=100), Position(symbol="HYPE", qty=2, avg_price=100, bars_held=10), setup, None).reason == "time_stop"
    assert pol.exit_intent(snap(mid=100), pos, setup, None) is None
    # signal flip and risk reduce need a verdict
    assert pol.exit_intent(snap(), pos, setup, verdict(direction=Direction.short, direction_conf=0.7)).reason == "exit_signal"
    assert pol.exit_intent(snap(), pos, setup, verdict(direction=Direction.short, direction_conf=0.5)) is None
    assert pol.exit_intent(snap(), pos, setup, verdict(risk_state=RiskState.reduce)).reason == "risk_reduce"
    ex = pol.exit_intent(snap(), pos, setup, verdict(regime=Regime.crisis, regime_conf=0.8))
    assert ex.reason == "risk_reduce" and ex.side == Side.sell and ex.qty == 2


def test_escalation_triggers(mini_book):
    pol = Policy(Gates())
    flat, held = Position(symbol="HYPE"), Position(symbol="HYPE", qty=1, avg_price=1)
    assert pol.should_escalate(None, flat) is None
    assert pol.should_escalate(None, held) == "judge_unavailable"
    assert pol.should_escalate(verdict(regime=Regime.crisis), flat) == "crisis_regime"
    assert pol.should_escalate(verdict(direction_conf=0.59), held) == "low_confidence"
    assert pol.should_escalate(verdict(direction_conf=0.59), flat) is None
    assert pol.should_escalate(verdict(risk_state=RiskState.near_limit), held) == "risk_near_limit"
