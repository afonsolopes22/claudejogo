"""Escalation: when the Reflex is unsure (direction_conf < 0.60 with an open position) or sees crisis, the loop asks
the Brain (Claude Opus 5.5) for a deep re-read. The Brain's answer space is deliberately tiny and can only make the
book safer: resume | pause | reduce | flatten. It cannot size up, change limits, or place orders.
Cheap fast calls by default; heavy reasoning only when it matters, rate-limited by a cooldown."""
from __future__ import annotations

import json
import time
from dataclasses import dataclass, field
from typing import Optional, Protocol

from .types import BrainVerdict, EscalationRequest

BRAIN_MODEL = "claude-opus-5-5"

SYSTEM = (
    "You are the slow, deliberate risk reviewer for an autonomous crypto trading agent. A fast calibrated model (Jev) "
    "judges every candle; you are consulted only when it is unsure or sees a crisis regime. You receive the compact "
    "numeric snapshot the fast model saw, its typed verdict, the setup thesis and invalidation conditions, and the open "
    "position. Decide the SAFEST reasonable action: resume (let the fast loop continue under its gates), pause (no new "
    "entries for cooldown_minutes; exits still run), reduce (cut the open position), or flatten (close it). You may not "
    "increase risk, change limits, or trade. Prefer survival over profit. Be concrete in the rationale."
)


class Escalator(Protocol):
    def escalate(self, req: EscalationRequest, setup_context: dict) -> BrainVerdict: ...


@dataclass
class NullEscalator:
    """Deterministic fallback when no Brain is configured: pause new entries, keep exits running."""

    calls: int = 0

    def escalate(self, req: EscalationRequest, setup_context: dict) -> BrainVerdict:
        self.calls += 1
        if req.trigger == "crisis_regime":
            return BrainVerdict(action="reduce", rationale="crisis regime, no Brain configured: reduce by default", cooldown_minutes=60)
        return BrainVerdict(action="pause", rationale="no Brain configured: pause new entries", cooldown_minutes=30)


class ClaudeEscalator:
    """Production Brain. Structured output via messages.parse so the answer is always a valid BrainVerdict."""

    def __init__(self, model: str = BRAIN_MODEL, effort: str = "high", timeout_s: float = 60.0):
        import anthropic  # lazy so tests do not need the SDK

        self._client = anthropic.Anthropic(timeout=timeout_s, max_retries=1)
        self.model = model
        self.effort = effort

    def escalate(self, req: EscalationRequest, setup_context: dict) -> BrainVerdict:
        import anthropic

        payload = {
            "trigger": req.trigger,
            "snapshot": req.snapshot.compact(),
            "verdict": req.verdict.model_dump(mode="json") if req.verdict else None,
            "position_qty": req.position_qty,
            "setup": setup_context,
        }
        try:
            resp = self._client.messages.parse(
                model=self.model,
                max_tokens=4000,
                system=SYSTEM,
                output_config={"effort": self.effort},
                messages=[{"role": "user", "content": json.dumps(payload, separators=(",", ":"))}],
                output_format=BrainVerdict,
            )
        except (anthropic.RateLimitError, anthropic.APIStatusError, anthropic.APIConnectionError) as e:
            # Brain unavailable: fail safe.
            return BrainVerdict(action="pause", rationale=f"brain unavailable: {type(e).__name__}", cooldown_minutes=30)
        if resp.stop_reason == "refusal" or resp.parsed_output is None:
            return BrainVerdict(action="pause", rationale="brain gave no usable verdict", cooldown_minutes=30)
        return resp.parsed_output


@dataclass
class EscalationGovernor:
    """Rate limits escalations per symbol and remembers active pauses. Pure bookkeeping."""

    cooldown_ms: int = 5 * 60_000
    last_escalation: dict[str, int] = field(default_factory=dict)
    paused_until: dict[str, int] = field(default_factory=dict)

    def may_escalate(self, symbol: str, ts: int) -> bool:
        last = self.last_escalation.get(symbol)
        return last is None or ts - last >= self.cooldown_ms

    def record(self, symbol: str, ts: int, verdict: BrainVerdict) -> None:
        self.last_escalation[symbol] = ts
        if verdict.action in ("pause", "reduce", "flatten"):
            self.paused_until[symbol] = ts + verdict.cooldown_minutes * 60_000

    def entries_paused(self, symbol: str, ts: int) -> bool:
        return ts < self.paused_until.get(symbol, -1)
