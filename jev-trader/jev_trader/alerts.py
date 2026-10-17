"""Alerts: notify humans when a LONG or SHORT setup fires, when fills happen, and when risk intervenes.

Levels
  setup  - a symbol passes EVERY entry gate this candle (quality>=2, conf>0.80, risk safe, no crisis, flow ok, bias ok)
  watch  - Jev leans long/short with quality>=2 and conf>=watch_conf but some gate still blocks (early heads-up)
  fill   - an order filled (entry / exit / stop / target / reduce)
  risk   - HALTED latch set, kill switch armed, Brain says reduce/flatten, judge unavailable while in a position

Deduplication: an alert fires on the transition inactive->active for (symbol, direction, level) and re-arms only after
`rearm_bars` consecutive inactive candles. Sends never block the trading tick (network sinks run in a thread).
"""
from __future__ import annotations

import datetime as dt
import itertools
import json
import os
import threading
from collections import deque
from dataclasses import dataclass, field
from typing import Literal, Optional, Protocol

from pydantic import BaseModel, ConfigDict

from .policy import Policy
from .schema import SetupSpec
from .state_engine import EquityTracker
from .types import Direction, Fill, Position, Snapshot, Verdict

Level = Literal["setup", "watch", "fill", "risk"]


class Alert(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")
    id: int
    ts: int
    level: Level
    symbol: str
    direction: Optional[Literal["long", "short"]] = None
    title: str
    body: str
    data: dict = {}

    def text(self) -> str:
        return f"{self.title}\n{self.body}"


class AlertSink(Protocol):
    def send(self, alert: Alert) -> None: ...


# ---- sinks -------------------------------------------------------------------


@dataclass
class MemorySink:
    """Ring buffer the UI polls."""

    maxlen: int = 500
    items: deque = field(default_factory=lambda: deque(maxlen=500))

    def send(self, alert: Alert) -> None:
        self.items.appendleft(alert)

    def since(self, last_id: int) -> list[Alert]:
        return [a for a in self.items if a.id > last_id]


@dataclass
class JournalSink:
    journal: object  # jev_trader.journal.Journal

    def send(self, alert: Alert) -> None:
        self.journal.write("alert", alert.ts, {"alert": alert})


class _HttpSink:
    """Fire-and-forget HTTP POST on a daemon thread; failures are counted, never raised into the tick."""

    def __init__(self, timeout_s: float = 5.0):
        self.timeout_s = timeout_s
        self.failures = 0
        self.sent = 0
        self._lock = threading.Lock()

    def _post(self, url: str, payload: dict) -> None:
        def run() -> None:
            try:
                import httpx2

                r = httpx2.post(url, json=payload, timeout=self.timeout_s)
                with self._lock:
                    if 200 <= r.status_code < 300:
                        self.sent += 1
                    else:
                        self.failures += 1
            except Exception:
                with self._lock:
                    self.failures += 1

        threading.Thread(target=run, daemon=True).start()


class TelegramSink(_HttpSink):
    """Telegram bot. TELEGRAM_BOT_TOKEN from @BotFather; TELEGRAM_CHAT_ID from https://api.telegram.org/bot<token>/getUpdates."""

    def __init__(self, token: str, chat_id: str, timeout_s: float = 5.0):
        super().__init__(timeout_s)
        self.url = f"https://api.telegram.org/bot{token}/sendMessage"
        self.chat_id = chat_id

    def send(self, alert: Alert) -> None:
        self._post(self.url, {"chat_id": self.chat_id, "text": alert.text(), "disable_web_page_preview": True})


class WebhookSink(_HttpSink):
    """Generic JSON webhook. Discord and Slack incoming webhooks accept the `content`/`text` keys sent here."""

    def __init__(self, url: str, timeout_s: float = 5.0):
        super().__init__(timeout_s)
        self.url = url

    def send(self, alert: Alert) -> None:
        self._post(self.url, {"content": alert.text(), "text": alert.text(), "alert": alert.model_dump(mode="json")})


def sinks_from_env(env: Optional[dict] = None) -> list[AlertSink]:
    e = os.environ if env is None else env
    out: list[AlertSink] = []
    if e.get("TELEGRAM_BOT_TOKEN") and e.get("TELEGRAM_CHAT_ID"):
        out.append(TelegramSink(e["TELEGRAM_BOT_TOKEN"], e["TELEGRAM_CHAT_ID"]))
    if e.get("JEV_WEBHOOK_URL"):
        out.append(WebhookSink(e["JEV_WEBHOOK_URL"]))
    return out


# ---- manager -------------------------------------------------------------------

_ICON = {"long": "🟢", "short": "🔴"}


@dataclass
class AlertConfig:
    levels: frozenset = frozenset({"setup", "watch", "fill", "risk"})
    watch_conf: float = 0.70
    rearm_bars: int = 3
    risk_cooldown_ms: int = 4 * 3_600_000  # identical risk alerts for a symbol are suppressed within this window
    locale: str = "pt"


@dataclass
class AlertManager:
    policy: Policy
    sinks: list[AlertSink]
    config: AlertConfig = field(default_factory=AlertConfig)
    _ids: itertools.count = field(default_factory=lambda: itertools.count(1))
    _active: dict[tuple[str, str, str], int] = field(default_factory=dict)  # key -> inactive streak (0 = active)
    _last_risk: dict[tuple[str, str], int] = field(default_factory=dict)
    _lock: threading.Lock = field(default_factory=threading.Lock)

    # -- emission ---------------------------------------------------------------
    def emit(self, ts: int, level: Level, symbol: str, title: str, body: str, direction: Optional[str] = None, data: Optional[dict] = None) -> Optional[Alert]:
        if level not in self.config.levels:
            return None
        a = Alert(id=next(self._ids), ts=ts, level=level, symbol=symbol, direction=direction, title=title, body=body, data=data or {})
        for s in self.sinks:
            try:
                s.send(a)
            except Exception:
                pass  # a broken sink must never break the tick
        return a

    def _transition(self, key: tuple[str, str, str], active: bool) -> bool:
        """Return True exactly when `key` goes inactive->active (respecting the re-arm window)."""
        with self._lock:
            streak = self._active.get(key)
            if active:
                fire = streak is None or streak >= self.config.rearm_bars
                self._active[key] = 0
                return fire
            if streak is not None:
                self._active[key] = streak + 1
            return False

    # -- per-candle evaluation ------------------------------------------------------
    def on_verdict(self, snap: Snapshot, v: Verdict, pos: Position, equity: EquityTracker, setup: SetupSpec) -> list[Alert]:
        out: list[Alert] = []
        if v.direction == Direction.neutral:
            for d in ("long", "short"):
                self._transition((snap.symbol, d, "setup"), False)
                self._transition((snap.symbol, d, "watch"), False)
            return out
        d = v.direction.value
        blocked = self.policy.entry_blocked_reason(snap, v, setup)
        is_setup = blocked is None
        is_watch = (not is_setup) and v.setup_quality >= self.policy.g.min_setup_quality and v.direction_conf >= self.config.watch_conf and v.regime.value != "crisis"
        other = "short" if d == "long" else "long"
        self._transition((snap.symbol, other, "setup"), False)
        self._transition((snap.symbol, other, "watch"), False)
        if self._transition((snap.symbol, d, "setup"), is_setup) and is_setup:
            intent = self.policy.entry_intent(snap, v, Position(symbol=snap.symbol), equity, setup)
            size = f" · tamanho {intent.notional_usd:,.0f} USD (¼ Kelly, p={intent.p_win:.2f})" if intent else ""
            lv = snap.levels or {}
            struct = []
            if lv.get("swp"):
                struct.append(("sweep de mínimo (bullish)" if lv["swp"] == -1 else "sweep de máximo (bearish)") + f" há {lv.get('swpAge', 0)} velas")
            if lv.get("rt"):
                struct.append(("retest como suporte" if lv["rt"] == 1 else "retest como resistência") + f" a {lv.get('rtBps', 0):+.0f} bps")
            if "va" in lv:
                struct.append({-1: "abaixo da área de valor", 0: "dentro da área de valor", 1: "acima da área de valor"}[lv["va"]] + f" (POC {lv.get('poc', 0):+.0f} bps)")
            if lv.get("liqA") is not None and lv.get("liqB") is not None:
                struct.append(f"liquidez {lv['liqA']:+.0f}/{lv['liqB']:+.0f} bps")
            structure = (" · " + " · ".join(struct)) if struct else ""
            out.append(self.emit(snap.ts, "setup", snap.symbol, f"{_ICON[d]} SETUP {d.upper()} {snap.symbol} @ {snap.mid:g}",
                f"qualidade {v.setup_quality:.2f}/3 · confiança {v.direction_conf:.0%} · regime {v.regime.value} · P(tóxico) {v.toxic_flow_p:.0%}"
                f" · stop {setup.stop_bps:g} bps / alvo {setup.target_bps:g} bps{size}{structure}" + (" · já em posição" if pos.qty else ""),
                direction=d, data={"verdict": v.model_dump(mode="json"), "mid": snap.mid}))
        if self._transition((snap.symbol, d, "watch"), is_watch) and is_watch:
            out.append(self.emit(snap.ts, "watch", snap.symbol, f"👀 A FORMAR {d.upper()} {snap.symbol} @ {snap.mid:g}",
                f"qualidade {v.setup_quality:.2f}/3 · confiança {v.direction_conf:.0%} · bloqueado por: {blocked}", direction=d, data={"blocked": blocked}))
        return [a for a in out if a]

    def on_judge_missing(self, symbol: str) -> None:
        for d in ("long", "short"):
            self._transition((symbol, d, "setup"), False)
            self._transition((symbol, d, "watch"), False)

    def on_fill(self, f: Fill) -> Optional[Alert]:
        d = "long" if f.side.value == "buy" else "short"
        kind = {"entry": "ENTRADA", "exit_signal": "SAÍDA (sinal)", "stop_loss": "STOP LOSS", "take_profit": "ALVO ATINGIDO", "time_stop": "SAÍDA (tempo)", "risk_reduce": "REDUÇÃO DE RISCO", "flatten": "POSIÇÃO FECHADA"}.get(f.reason, f.reason)
        return self.emit(f.ts, "fill", f.symbol, f"{'🟢' if f.side.value == 'buy' else '🔴'} FILL {kind} {f.symbol}",
            f"{f.side.value} {f.qty:g} @ {f.price:g} · slippage {f.slippage_bps:.1f} bps · fee {f.fee_usd:.2f} USD", direction=d, data={"fill": f.model_dump(mode="json")})

    def on_risk(self, ts: int, symbol: str, what: str, detail: str) -> Optional[Alert]:
        key = (symbol, what)
        with self._lock:
            last = self._last_risk.get(key)
            if last is not None and ts - last < self.config.risk_cooldown_ms:
                return None
            self._last_risk[key] = ts
        return self.emit(ts, "risk", symbol, f"⚠️ RISCO {what} {symbol}".rstrip(), detail)

    def test_alert(self) -> Alert:
        now = int(dt.datetime.now(dt.timezone.utc).timestamp() * 1000)
        a = Alert(id=next(self._ids), ts=now, level="setup", symbol="TEST", direction="long", title="🟢 SETUP LONG TEST @ 100", body="alerta de teste enviado pelo painel")
        for s in self.sinks:
            try:
                s.send(a)
            except Exception:
                pass
        return a
