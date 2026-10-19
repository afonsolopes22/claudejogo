"""Hard deterministic risk layer. The model can never override it: executors require a RiskApproval that only
this module can mint, and the approval is bound to the exact intent by hash.

Order of checks for every intent:
  1. kill switch armed  -> deny everything (operator flattens manually via scripts/killswitch.py)
  2. halt latch set     -> allow only exposure-reducing orders
  3. drawdown >= max    -> set latch, deny (reducing orders allowed)
  4. daily loss >= max  -> set latch, deny (reducing orders allowed)
  5. per-symbol notional cap, gross exposure cap, min order size
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Optional

from . import _yaml
from pydantic import BaseModel, ConfigDict, Field

from .state_engine import EquityTracker
from .types import Intent, Position, RiskApproval, Side


class RiskLimits(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")
    version: str = "risk-v1"
    max_drawdown_pct: float = Field(default=15.0, gt=0, le=100)
    max_daily_loss_pct: float = Field(default=3.0, gt=0, le=100)
    max_position_notional_pct: float = Field(default=20.0, gt=0, le=100)
    max_gross_exposure_pct: float = Field(default=60.0, gt=0, le=300)
    min_order_notional_usd: float = Field(default=10.0, ge=0)
    kill_switch_path: str = "data/KILL"
    halt_latch_path: str = "data/HALTED"


def load_limits(path: str | Path) -> RiskLimits:
    with open(path) as f:
        return RiskLimits.model_validate(_yaml.load(f.read()))


class RiskDecision(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")
    allowed: bool
    reason: str
    approval: Optional[RiskApproval] = None


def intent_hash(intent: Intent) -> str:
    return hashlib.sha256(json.dumps(intent.model_dump(mode="json"), sort_keys=True).encode()).hexdigest()


class RiskEngine:
    def __init__(self, limits: RiskLimits, equity: EquityTracker, positions: dict[str, Position]):
        self.limits = limits
        self.equity = equity
        self.positions = positions

    # ---- operator switches ----------------------------------------------------
    def kill_switch_armed(self) -> bool:
        return Path(self.limits.kill_switch_path).exists()

    def halted(self) -> bool:
        return Path(self.limits.halt_latch_path).exists()

    def _latch(self, why: str) -> None:
        p = Path(self.limits.halt_latch_path)
        p.parent.mkdir(parents=True, exist_ok=True)
        if not p.exists():
            p.write_text(why + "\n")

    # ---- helpers --------------------------------------------------------------
    def _reduces_exposure(self, intent: Intent) -> bool:
        pos = self.positions.get(intent.symbol)
        if pos is None or pos.qty == 0:
            return False
        if pos.qty > 0 and intent.side == Side.sell and intent.qty <= abs(pos.qty) + 1e-12:
            return True
        if pos.qty < 0 and intent.side == Side.buy and intent.qty <= abs(pos.qty) + 1e-12:
            return True
        return False

    def gross_exposure_usd(self, marks: dict[str, float]) -> float:
        return sum(abs(p.qty) * marks.get(sym, p.avg_price) for sym, p in self.positions.items())

    # ---- the check ------------------------------------------------------------
    def check(self, intent: Intent, marks: dict[str, float]) -> RiskDecision:
        L = self.limits
        reducing = self._reduces_exposure(intent)
        if self.kill_switch_armed():
            return RiskDecision(allowed=False, reason="kill_switch_armed")
        if self.halted() and not reducing:
            return RiskDecision(allowed=False, reason="halted_latch")
        if self.equity.drawdown_pct >= L.max_drawdown_pct:
            self._latch(f"max_drawdown {self.equity.drawdown_pct:.2f}% >= {L.max_drawdown_pct}%")
            if not reducing:
                return RiskDecision(allowed=False, reason="max_drawdown")
        if -self.equity.daily_pnl_pct >= L.max_daily_loss_pct:
            self._latch(f"max_daily_loss {self.equity.daily_pnl_pct:.2f}% <= -{L.max_daily_loss_pct}%")
            if not reducing:
                return RiskDecision(allowed=False, reason="max_daily_loss")
        if not reducing:
            if intent.notional_usd < L.min_order_notional_usd:
                return RiskDecision(allowed=False, reason="below_min_order")
            eq = self.equity.equity
            pos = self.positions.get(intent.symbol)
            cur = abs(pos.qty) * marks.get(intent.symbol, intent.ref_price) if pos else 0.0
            if cur + intent.notional_usd > L.max_position_notional_pct / 100.0 * eq:
                return RiskDecision(allowed=False, reason="max_position_notional")
            if self.gross_exposure_usd(marks) + intent.notional_usd > L.max_gross_exposure_pct / 100.0 * eq:
                return RiskDecision(allowed=False, reason="max_gross_exposure")
        approval = RiskApproval(intent_hash=intent_hash(intent), issued_ts=intent.ts, limits_version=L.version)
        return RiskDecision(allowed=True, reason="ok", approval=approval)

    @staticmethod
    def verify(intent: Intent, approval: RiskApproval) -> bool:
        return approval.intent_hash == intent_hash(intent)
