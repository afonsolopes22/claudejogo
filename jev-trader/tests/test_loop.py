from pathlib import Path

import pytest

from jev_trader.escalation import NullEscalator
from jev_trader.execution import PaperExchange, SyntheticFeed
from jev_trader.jev_client import StubJudge, neutral_answers
from jev_trader.journal import Journal
from jev_trader.loop import TradingLoop
from jev_trader.types import Side


def bullish_hype(state, q):
    a = neutral_answers(q)
    a["HYPE.regime"] = {"type": "choice", "choice": "trending", "confidence": 0.9, "probabilities": {"trending": 0.9, "mean_reverting": 0.05, "high_vol": 0.05, "crisis": 0.0}}
    a["HYPE.direction"] = {"type": "choice", "choice": "long", "confidence": 0.9, "probabilities": {"long": 0.9, "short": 0.05, "neutral": 0.05}}
    a["HYPE.setup_quality"] = {"type": "score", "score": 2.5, "confidence": 0.8, "probabilities": {"0": 0.0, "1": 0.1, "2": 0.3, "3": 0.6}}
    return a


def crisis_all(state, q):
    a = neutral_answers(q)
    for name in q:
        if name.endswith(".regime"):
            a[name] = {"type": "choice", "choice": "crisis", "confidence": 0.95, "probabilities": {"trending": 0, "mean_reverting": 0, "high_vol": 0.05, "crisis": 0.95}}
    return a


def run(mini_book, limits, tmp_path, judge, bars=40, vol=5.0, escalator=None):
    loop = TradingLoop(book=mini_book, judge=judge, exchange=PaperExchange(), journal=Journal(tmp_path / "j.jsonl"), limits=limits, escalator=escalator or NullEscalator(), starting_equity=10_000)
    feed = SyntheticFeed(symbols=["HYPE", "MON"], start_ts=1_700_000_000_000, n_bars=bars, vol_bps=vol, prices={"HYPE": 80, "MON": 0.02})
    results = [r for r in (loop.on_event(*ev) for ev in feed) if r]
    return loop, results


def test_entry_then_exit_cycle_and_journal(mini_book, limits, tmp_path):
    loop, results = run(mini_book, limits, tmp_path, StubJudge(scripted=bullish_hype))
    fills = [f for r in results for f in r.fills]
    assert fills and fills[0].symbol == "HYPE" and fills[0].side == Side.buy and fills[0].reason == "entry"
    exits = [f for f in fills if f.reason in ("stop_loss", "take_profit", "time_stop")]
    assert exits, "time stop (horizon 10) must close the position"
    assert all(r.blocked.get("MON") == "setup_quality_low" for r in results if "MON" in r.blocked)
    kinds = {rec["kind"] for rec in Journal.read(tmp_path / "j.jsonl")}
    assert {"session_start", "snapshot", "verdict", "intent", "risk", "fill", "tick"} <= kinds
    # quarter-Kelly sizing honoured: p=0.9, b=2 -> f*=0.85 -> 0.2125 of equity, under 20% cap => 20%
    assert fills[0].qty * fills[0].price <= 0.2 * 10_000 * 1.01


def test_judge_outage_means_hold_and_escalation_only_with_position(mini_book, limits, tmp_path):
    judge = StubJudge(scripted=bullish_hype)
    loop, results = run(mini_book, limits, tmp_path, judge, bars=3)
    judge.fail_next = 10
    esc = NullEscalator()
    loop.escalator = esc
    feed = SyntheticFeed(symbols=["HYPE", "MON"], start_ts=1_700_000_000_000 + 3 * 60_000, n_bars=2, vol_bps=1, prices={"HYPE": 80, "MON": 0.02})
    rs = [r for r in (loop.on_event(*ev) for ev in feed) if r]
    assert all(not r.judge_ok for r in rs)
    assert all(not any(f.reason == "entry" for f in r.fills) for r in rs)
    assert esc.calls >= 1 and any("judge_unavailable" in e for r in rs for e in r.escalations)


def test_crisis_escalates_and_reduces(mini_book, limits, tmp_path):
    judge = StubJudge(scripted=bullish_hype)
    loop, results = run(mini_book, limits, tmp_path, judge, bars=3, vol=1)
    assert loop.positions["HYPE"].qty > 0
    judge.scripted = crisis_all
    esc = NullEscalator()
    loop.escalator = esc
    feed = SyntheticFeed(symbols=["HYPE", "MON"], start_ts=1_700_000_000_000 + 3 * 60_000, n_bars=1, vol_bps=1, prices={"HYPE": 80, "MON": 0.02})
    r = [r for r in (loop.on_event(*ev) for ev in feed) if r][0]
    assert esc.calls >= 1 and any(e.endswith(":reduce") for e in r.escalations)
    assert any(f.reason == "risk_reduce" and f.side == Side.sell for f in r.fills)
    assert not any(f.reason == "entry" for f in r.fills)


def test_kill_switch_blocks_all_orders(mini_book, limits, tmp_path):
    Path(limits.kill_switch_path).write_text("armed")
    loop, results = run(mini_book, limits, tmp_path, StubJudge(scripted=bullish_hype), bars=10)
    assert not any(r.fills for r in results)
    assert all(p.qty == 0 for p in loop.positions.values())
    risk_recs = [rec for rec in Journal.read(tmp_path / "j.jsonl") if rec["kind"] == "risk"]
    assert risk_recs and all(rec["reason"] == "kill_switch_armed" for rec in risk_recs)


def test_pnl_accounting_matches_fills(mini_book, limits, tmp_path):
    loop, results = run(mini_book, limits, tmp_path, StubJudge(scripted=bullish_hype), bars=60, vol=10)
    fills = [f for r in results for f in r.fills]
    fees = sum(f.fee_usd for f in fills)
    realized = sum(p.realized_pnl_usd for p in loop.positions.values())
    unreal = sum(p.unrealized(loop._marks[s]) for s, p in loop.positions.items())
    assert loop.equity.equity == pytest.approx(10_000 + realized - fees + unreal, abs=1e-6)
