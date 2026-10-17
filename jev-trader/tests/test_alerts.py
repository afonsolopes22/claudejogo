import pytest

from jev_trader.alerts import AlertConfig, AlertManager, MemorySink, TelegramSink, WebhookSink, sinks_from_env
from jev_trader.execution import PaperExchange, SyntheticFeed
from jev_trader.jev_client import StubJudge
from jev_trader.journal import Journal
from jev_trader.loop import TradingLoop
from jev_trader.policy import Gates, Policy
from jev_trader.state_engine import EquityTracker
from jev_trader.types import Direction, Position, RiskState
from tests.test_loop import bullish_hype
from tests.test_policy import snap, verdict


def mgr(**cfg):
    sink = MemorySink()
    return AlertManager(policy=Policy(Gates()), sinks=[sink], config=AlertConfig(**cfg)), sink


def test_setup_alert_fires_once_and_rearms(mini_book):
    m, sink = mgr(rearm_bars=2)
    setup, eq, pos = mini_book.setups[0], EquityTracker(10_000), Position(symbol="HYPE")
    a = m.on_verdict(snap(), verdict(), pos, eq, setup)
    assert len(a) == 1 and a[0].level == "setup" and a[0].direction == "long" and "SETUP LONG HYPE" in a[0].title and "tamanho" in a[0].body
    assert m.on_verdict(snap(ts=2), verdict(), pos, eq, setup) == []  # still active: no repeat
    # drops out for one bar then back: not yet re-armed
    assert m.on_verdict(snap(ts=3), verdict(setup_quality=1.0), pos, eq, setup) == []
    assert m.on_verdict(snap(ts=4), verdict(), pos, eq, setup) == []
    # out for two bars -> re-armed
    m.on_verdict(snap(ts=5), verdict(setup_quality=1.0), pos, eq, setup)
    m.on_verdict(snap(ts=6), verdict(setup_quality=1.0), pos, eq, setup)
    again = m.on_verdict(snap(ts=7), verdict(), pos, eq, setup)
    assert len(again) == 1 and again[0].level == "setup"
    assert len(sink.items) == 2


def test_watch_alert_when_gate_blocks_and_short_direction(mini_book):
    m, sink = mgr()
    setup, eq, pos = mini_book.setups[1], EquityTracker(10_000), Position(symbol="MON")  # MON short bias
    v = verdict(symbol="MON", direction=Direction.short, direction_conf=0.75, direction_probs={"short": 0.75, "long": 0.2, "neutral": 0.05})
    a = m.on_verdict(snap(symbol="MON"), v, pos, eq, setup)
    assert len(a) == 1 and a[0].level == "watch" and a[0].direction == "short" and "direction_conf_low" in a[0].body
    v2 = v.model_copy(update={"direction_conf": 0.9, "direction_probs": {"short": 0.9, "long": 0.05, "neutral": 0.05}})
    a2 = m.on_verdict(snap(symbol="MON", ts=2), v2, pos, eq, setup)
    assert [x.level for x in a2] == ["setup"] and "SETUP SHORT MON" in a2[0].title


def test_levels_filter_and_neutral_resets(mini_book):
    m, sink = mgr(levels=frozenset({"fill"}))
    setup, eq, pos = mini_book.setups[0], EquityTracker(10_000), Position(symbol="HYPE")
    assert m.on_verdict(snap(), verdict(), pos, eq, setup) == []
    assert m.on_risk(1, "HYPE", "X", "y") is None
    m2, _ = mgr(rearm_bars=1)
    assert len(m2.on_verdict(snap(), verdict(), pos, eq, setup)) == 1
    m2.on_verdict(snap(ts=2), verdict(direction=Direction.neutral), pos, eq, setup)
    assert len(m2.on_verdict(snap(ts=3), verdict(), pos, eq, setup)) == 1


def test_http_sinks_never_raise_and_env_wiring(monkeypatch):
    import jev_trader.alerts as A

    calls = []

    class FakeResp:
        status_code = 200

    class FakeHttpx:
        @staticmethod
        def post(url, json, timeout):
            calls.append((url, json))
            return FakeResp()

    monkeypatch.setitem(__import__("sys").modules, "httpx2", FakeHttpx)
    m, _ = mgr()
    t = TelegramSink("tok", "123")
    w = WebhookSink("https://hook.example/x")
    m.sinks += [t, w]
    a = m.test_alert()
    import time

    for _ in range(50):
        if len(calls) == 2:
            break
        time.sleep(0.02)
    urls = sorted(u for u, _ in calls)
    assert urls == ["https://api.telegram.org/bottok/sendMessage", "https://hook.example/x"]
    tg = [j for u, j in calls if "telegram" in u][0]
    assert tg["chat_id"] == "123" and "SETUP LONG TEST" in tg["text"]
    assert sinks_from_env({}) == []
    s = sinks_from_env({"TELEGRAM_BOT_TOKEN": "a", "TELEGRAM_CHAT_ID": "b", "JEV_WEBHOOK_URL": "https://x"})
    assert [type(x).__name__ for x in s] == ["TelegramSink", "WebhookSink"]


def test_loop_emits_setup_fill_and_journal_alerts(mini_book, limits, tmp_path):
    sink = MemorySink()
    journal = Journal(tmp_path / "j.jsonl")
    am = AlertManager(policy=Policy(Gates()), sinks=[sink], config=AlertConfig())
    loop = TradingLoop(book=mini_book, judge=StubJudge(scripted=bullish_hype), exchange=PaperExchange(), journal=journal, limits=limits, alerts=am)
    for ev in SyntheticFeed(symbols=["HYPE", "MON"], start_ts=1_700_000_000_000, n_bars=30, vol_bps=5, prices={"HYPE": 80, "MON": 0.02}):
        loop.on_event(*ev)
    levels = [a.level for a in sink.items]
    assert "setup" in levels and "fill" in levels
    first_setup = [a for a in sink.items if a.level == "setup"][-1]
    assert first_setup.symbol == "HYPE" and first_setup.direction == "long"
    fills = [a for a in sink.items if a.level == "fill"]
    assert any("ENTRADA" in a.title for a in fills) and any("SAÍDA" in a.title or "STOP" in a.title or "ALVO" in a.title for a in fills)
    assert sink.since(0) and sink.since(10**9) == []


def test_risk_alerts_are_rate_limited_per_symbol_and_kind():
    m, sink = mgr(risk_cooldown_ms=1000)
    assert m.on_risk(0, "HYPE", "HALT", "a") is not None
    assert m.on_risk(500, "HYPE", "HALT", "a") is None          # same kind within cooldown
    assert m.on_risk(500, "HYPE", "KILL", "b") is not None      # different kind
    assert m.on_risk(500, "MON", "HALT", "c") is not None       # different symbol
    assert m.on_risk(1000, "HYPE", "HALT", "a") is not None     # cooldown elapsed
    assert len(sink.items) == 4
