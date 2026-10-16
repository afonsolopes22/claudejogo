"""The live loop. One tick per candle-close bundle:

  feed -> StateEngine (code) -> Snapshot(s) -> Jev (one call, all setups) -> Verdicts
       -> Policy (gates+Kelly, code) -> RiskEngine (hard limits, code) -> Exchange -> fills -> equity -> Journal
       -> Escalation to the Brain when the Reflex is unsure or sees crisis.

Nothing in this file lets a model decide a threshold, a size, or a side effect.
"""
from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Optional

from .escalation import EscalationGovernor, Escalator, NullEscalator
from .execution.base import ExchangeAdapter
from .jev_client import Judge, JudgeUnavailable
from .journal import Journal
from .policy import Gates, Policy
from .risk import RiskEngine, RiskLimits
from .schema import RiskHints, SetupBook, compile_questions, parse_verdicts, schema_version
from .state_engine import EquityTracker, Funding, L2Book, StateEngine, Trade, build_state
from .types import EscalationRequest, Fill, Intent, Position, Side, Snapshot, Verdict


@dataclass
class TickResult:
    ts: int
    snapshots: dict[str, Snapshot]
    verdicts: dict[str, Verdict]
    intents: list[Intent]
    fills: list[Fill]
    blocked: dict[str, str]
    escalations: list[str]
    judge_ok: bool


@dataclass
class TradingLoop:
    book: SetupBook
    judge: Judge
    exchange: ExchangeAdapter
    journal: Journal
    limits: RiskLimits
    gates: Gates = field(default_factory=Gates)
    escalator: Escalator = field(default_factory=NullEscalator)
    starting_equity: float = 10_000.0
    state_engine: StateEngine = field(default_factory=StateEngine)

    def __post_init__(self) -> None:
        self.equity = EquityTracker(self.starting_equity)
        self.positions: dict[str, Position] = {s.symbol: Position(symbol=s.symbol) for s in self.book.setups}
        self.risk = RiskEngine(self.limits, self.equity, self.positions)
        self.policy = Policy(self.gates)
        self.governor = EscalationGovernor()
        hints = RiskHints(
            max_drawdown_pct=self.limits.max_drawdown_pct,
            max_daily_loss_pct=self.limits.max_daily_loss_pct,
            max_position_notional_pct=self.limits.max_position_notional_pct,
        )
        self.questions = compile_questions(self.book, hints)
        self.version = schema_version(self.book, self.questions)
        self.setups = self.book.by_symbol()
        self._pending: dict[str, tuple[L2Book, list[Trade], Optional[Funding]]] = {}
        self._marks: dict[str, float] = {}
        self.journal.write("session_start", int(time.time() * 1000), {"schema_version": self.version, "limits": self.limits, "gates": self.gates})

    # ---- public --------------------------------------------------------------
    def on_event(self, book: L2Book, trades: list[Trade], funding: Optional[Funding]) -> Optional[TickResult]:
        """Buffer per-symbol bundles; when every tradable symbol has reported for this ts, run one tick."""
        if book.symbol not in self.setups:
            return None
        self._pending[book.symbol] = (book, trades, funding)
        if len(self._pending) < len(self.setups):
            return None
        ts = max(b.ts for b, _, _ in self._pending.values())
        bundle, self._pending = self._pending, {}
        return self.tick(ts, bundle)

    def tick(self, ts: int, bundle: dict[str, tuple[L2Book, list[Trade], Optional[Funding]]]) -> TickResult:
        snaps: dict[str, Snapshot] = {}
        books: dict[str, L2Book] = {}
        # 1. state (code)
        for sym, (book, trades, funding) in bundle.items():
            self.state_engine.ingest_trades(trades)
            if funding is not None:
                self.state_engine.ingest_funding(funding)
            pos = self.positions[sym]
            self._marks[sym] = book.mid()
            self._mark_equity(ts)
            snaps[sym] = self.state_engine.update(book, pos, self.equity)
            books[sym] = book
            self.journal.write("snapshot", ts, {"symbol": sym, "snapshot": snaps[sym].compact()})

        # 2. reflex (one call, all setups)
        verdicts: dict[str, Verdict] = {}
        judge_ok = True
        try:
            res = self.judge.judge(build_state(list(snaps.values())), self.questions)
            verdicts = parse_verdicts(res.answers, self.book, ts, res.latency_ms, res.model, self.version)
            for v in verdicts.values():
                self.journal.write("verdict", ts, {"symbol": v.symbol, "verdict": v})
        except JudgeUnavailable as e:
            judge_ok = False
            self.journal.write("judge_unavailable", ts, {"error": str(e)})

        # 3. policy -> 4. risk -> 5. execution
        intents: list[Intent] = []
        fills: list[Fill] = []
        blocked: dict[str, str] = {}
        escalations: list[str] = []
        for sym, snap in snaps.items():
            setup = self.setups[sym]
            pos = self.positions[sym]
            v = verdicts.get(sym)

            # escalation (Brain) - may pause entries / reduce / flatten
            trig = self.policy.should_escalate(v, pos)
            if trig and self.governor.may_escalate(sym, ts):
                req = EscalationRequest(ts=ts, symbol=sym, trigger=trig, verdict=v, snapshot=snap, position_qty=pos.qty)
                bv = self.escalator.escalate(req, {"thesis": setup.thesis, "invalidation": setup.invalidation, "bias": setup.bias})
                self.governor.record(sym, ts, bv)
                self.journal.write("escalation", ts, {"symbol": sym, "trigger": trig, "brain": bv})
                escalations.append(f"{sym}:{trig}:{bv.action}")
                if bv.action in ("reduce", "flatten") and pos.qty != 0:
                    frac = 0.5 if bv.action == "reduce" else 1.0
                    qty = abs(pos.qty) * frac
                    side = Side.sell if pos.qty > 0 else Side.buy
                    intent = Intent(symbol=sym, ts=ts, side=side, qty=qty, ref_price=snap.mid, notional_usd=qty * snap.mid, reason="risk_reduce" if frac < 1 else "flatten")
                    fill = self._route(intent, books[sym], ts)
                    intents.append(intent)
                    if fill:
                        fills.append(fill)
                    continue

            intent = self.policy.decide(snap, v, pos, self.equity, setup)
            if intent is None:
                if v is not None and pos.qty == 0:
                    r = self.policy.entry_blocked_reason(snap, v, setup)
                    if r:
                        blocked[sym] = r
                continue
            if intent.reason == "entry" and self.governor.entries_paused(sym, ts):
                blocked[sym] = "paused_by_brain"
                continue
            intents.append(intent)
            fill = self._route(intent, books[sym], ts)
            if fill:
                fills.append(fill)

        # bars held
        for p in self.positions.values():
            if p.qty != 0:
                p.bars_held += 1
        self._mark_equity(ts)
        self.journal.write("tick", ts, {"equity": self.equity.equity, "dd": self.equity.drawdown_pct, "blocked": blocked, "judge_ok": judge_ok})
        return TickResult(ts, snaps, verdicts, intents, fills, blocked, escalations, judge_ok)

    # ---- internals -----------------------------------------------------------
    def _route(self, intent: Intent, book: L2Book, ts: int) -> Optional[Fill]:
        self.journal.write("intent", ts, {"symbol": intent.symbol, "intent": intent})
        dec = self.risk.check(intent, self._marks)
        self.journal.write("risk", ts, {"symbol": intent.symbol, "allowed": dec.allowed, "reason": dec.reason})
        if not dec.allowed or dec.approval is None:
            return None
        fill = self.exchange.submit(intent, dec.approval, book)
        if fill is None:
            self.journal.write("no_fill", ts, {"symbol": intent.symbol})
            return None
        self._apply_fill(fill)
        self.journal.write("fill", ts, {"symbol": fill.symbol, "fill": fill})
        return fill

    def _apply_fill(self, f: Fill) -> None:
        p = self.positions[f.symbol]
        signed = f.qty if f.side == Side.buy else -f.qty
        realized = 0.0
        if p.qty != 0 and (p.qty > 0) != (signed > 0):
            closing = min(abs(p.qty), abs(signed))
            realized = (f.price - p.avg_price) * closing * (1 if p.qty > 0 else -1)
            p.realized_pnl_usd += realized
        new_qty = p.qty + signed
        if p.qty == 0 or (p.qty > 0) == (signed > 0):
            # opening/adding: weighted average
            p.avg_price = (p.avg_price * abs(p.qty) + f.price * abs(signed)) / abs(new_qty) if new_qty != 0 else 0.0
        elif abs(signed) > abs(p.qty):
            p.avg_price = f.price  # flipped
        if p.qty == 0 and new_qty != 0:
            p.opened_ts = f.ts
            p.bars_held = 0
        p.qty = new_qty
        if abs(p.qty) < 1e-12:
            p.qty = 0.0
            p.avg_price = 0.0
            p.opened_ts = None
            p.bars_held = 0
        self._cash_delta = getattr(self, "_cash_delta", 0.0) + realized - f.fee_usd

    def _mark_equity(self, ts: int) -> None:
        cash_delta = getattr(self, "_cash_delta", 0.0)
        unreal = sum(p.unrealized(self._marks.get(s, p.avg_price)) for s, p in self.positions.items())
        self.equity.mark(self.starting_equity + cash_delta + unreal, ts)
