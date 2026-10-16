"""Background runner: owns one TradingLoop at a time and keeps an in-memory view for the UI.
The loop itself is untouched; this only feeds it and records what it emits."""
from __future__ import annotations

import threading
import time
import traceback
from collections import deque
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

from ..escalation import NullEscalator
from ..execution import JsonlFeed, PaperExchange, SyntheticFeed
from ..jev_client import StubJudge
from ..journal import Journal
from ..loop import TradingLoop
from ..risk import load_limits
from ..schema import load_setups

DEFAULT_PRICES = {"BTC": 82_600, "ETH": 2_480, "SOL": 105, "HYPE": 80, "MON": 0.0228, "UNI": 7.1, "ENA": 0.22, "AAVE": 158}


@dataclass
class RunConfig:
    judge: str = "stub"          # stub | jev
    brain: bool = False
    bars: int = 300
    delay_ms: int = 400          # wall-clock pause between candles so the UI reads as live
    equity: float = 10_000.0
    vol_bps: float = 40.0
    replay: Optional[str] = None
    setups: str = "config/setups.yaml"
    risk: str = "config/risk.yaml"
    journal: str = "data/journal.jsonl"


@dataclass
class RunnerState:
    running: bool = False
    config: Optional[RunConfig] = None
    started_wall: Optional[float] = None
    ticks: int = 0
    schema_version: str = ""
    error: Optional[str] = None
    equity_series: deque = field(default_factory=lambda: deque(maxlen=5000))   # (ts, equity, dd, daily)
    latest: dict = field(default_factory=dict)                                  # symbol -> {snapshot, verdict, blocked}
    fills: deque = field(default_factory=lambda: deque(maxlen=500))
    escalations: deque = field(default_factory=lambda: deque(maxlen=200))
    judge_failures: int = 0


class Runner:
    def __init__(self, root: Path):
        self.root = root
        self.state = RunnerState()
        self.loop: Optional[TradingLoop] = None
        self._thread: Optional[threading.Thread] = None
        self._stop = threading.Event()
        self._lock = threading.Lock()

    # ---- lifecycle -------------------------------------------------------
    def start(self, cfg: RunConfig) -> None:
        with self._lock:
            if self.state.running:
                raise RuntimeError("already running")
            self.state = RunnerState(running=True, config=cfg, started_wall=time.time())
            self._stop.clear()
            self._thread = threading.Thread(target=self._run, args=(cfg,), daemon=True)
            self._thread.start()

    def stop(self) -> None:
        self._stop.set()

    def _build_loop(self, cfg: RunConfig) -> TradingLoop:
        book = load_setups(self.root / cfg.setups)
        limits = load_limits(self.root / cfg.risk)
        if cfg.judge == "jev":
            from ..jev_client import TypeSafeJudge

            judge = TypeSafeJudge()
        elif cfg.judge == "demo":
            from ..jev_client import DemoJudge

            judge = DemoJudge()
        else:
            judge = StubJudge()
        escalator = NullEscalator()
        if cfg.brain:
            from ..escalation import ClaudeEscalator

            escalator = ClaudeEscalator()
        return TradingLoop(book=book, judge=judge, exchange=PaperExchange(), journal=Journal(self.root / cfg.journal), limits=limits, escalator=escalator, starting_equity=cfg.equity)

    def _run(self, cfg: RunConfig) -> None:
        try:
            loop = self._build_loop(cfg)
            self.loop = loop
            self.state.schema_version = loop.version
            syms = [s.symbol for s in loop.book.setups]
            if cfg.replay:
                feed = JsonlFeed(self.root / cfg.replay)
            else:
                start = int(time.time() * 1000) // 3_600_000 * 3_600_000 - cfg.bars * 3_600_000
                feed = SyntheticFeed(symbols=syms, start_ts=start, n_bars=cfg.bars, bar_ms=3_600_000, vol_bps=cfg.vol_bps, prices=DEFAULT_PRICES, seed=int(time.time()) % 10_000)
            for book, trades, funding in feed:
                if self._stop.is_set():
                    break
                r = loop.on_event(book, trades, funding)
                if r is None:
                    continue
                self._record(loop, r)
                if cfg.delay_ms > 0:
                    time.sleep(cfg.delay_ms / 1000.0)
        except Exception:  # surface to the UI rather than dying silently
            self.state.error = traceback.format_exc(limit=3)
        finally:
            self.state.running = False

    def _record(self, loop: TradingLoop, r) -> None:
        st = self.state
        st.ticks += 1
        if not r.judge_ok:
            st.judge_failures += 1
        st.equity_series.append((r.ts, round(loop.equity.equity, 2), round(loop.equity.drawdown_pct, 3), round(loop.equity.daily_pnl_pct, 3)))
        for sym, snap in r.snapshots.items():
            v = r.verdicts.get(sym)
            pos = loop.positions[sym]
            st.latest[sym] = {
                "snapshot": snap.compact(),
                "verdict": v.model_dump(mode="json") if v else None,
                "blocked": r.blocked.get(sym),
                "position": {"qty": pos.qty, "avg_price": pos.avg_price, "bars_held": pos.bars_held, "unrealized_usd": pos.unrealized(snap.mid), "realized_usd": pos.realized_pnl_usd},
            }
        for f in r.fills:
            st.fills.appendleft(f.model_dump(mode="json"))
        for e in r.escalations:
            st.escalations.appendleft({"ts": r.ts, "text": e})

    # ---- view ----------------------------------------------------------------
    def snapshot(self) -> dict:
        st = self.state
        loop = self.loop
        return {
            "running": st.running,
            "config": st.config.__dict__ if st.config else None,
            "ticks": st.ticks,
            "schema_version": st.schema_version,
            "error": st.error,
            "judge_failures": st.judge_failures,
            "equity": loop.equity.equity if loop else None,
            "drawdown_pct": loop.equity.drawdown_pct if loop else None,
            "daily_pnl_pct": loop.equity.daily_pnl_pct if loop else None,
            "starting_equity": loop.starting_equity if loop else None,
            "equity_series": list(st.equity_series),
            "latest": st.latest,
            "fills": list(st.fills)[:100],
            "escalations": list(st.escalations)[:50],
            "gates": loop.gates.model_dump() if loop else None,
        }
