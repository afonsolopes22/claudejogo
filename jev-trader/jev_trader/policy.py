"""Policy: turns (snapshot, verdict, position) into an Intent. Every threshold lives here, in code.

Gate (all must hold to ENTER):   setup_quality >= 2.0  AND  direction_conf > 0.80  AND  risk_state == safe
                                 AND regime != crisis  AND  toxic_flow_p <= max_toxic_flow  AND direction matches bias
Sizing:                          f* = Kelly(p = Jev's calibrated P(direction), b = target/stop);  size = min(kelly_cap * f*, kelly_cap) * equity
Exits (code-owned, verdict optional): stop-loss, take-profit, time-stop; signal flip; risk_state == reduce.
"""
from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, ConfigDict, Field

from .schema import SetupSpec
from .state_engine import EquityTracker
from .types import Direction, Intent, Position, Regime, RiskState, Side, Snapshot, Verdict


class Gates(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")
    min_setup_quality: float = 2.0
    min_direction_conf: float = 0.80
    max_toxic_flow: float = 0.50
    kelly_cap: float = Field(default=0.25, description="fraction of full Kelly; also the absolute cap on equity fraction")
    exit_flip_conf: float = 0.60
    escalate_below_conf: float = 0.60
    min_depth_multiple: float = Field(default=20.0, description="book depth must be >= this multiple of order notional")
    max_spread_bps: float = 25.0


def kelly_fraction(p: float, b: float) -> float:
    """Full-Kelly fraction for a bet paying b:1 with win prob p. Clamped at 0 (never bet a negative edge)."""
    if b <= 0:
        return 0.0
    f = (p * b - (1.0 - p)) / b
    return max(0.0, f)


def _dir_to_side(d: Direction) -> Side:
    return Side.buy if d == Direction.long else Side.sell


def _side_of(position: Position) -> Optional[Direction]:
    if position.qty > 0:
        return Direction.long
    if position.qty < 0:
        return Direction.short
    return None


class Policy:
    def __init__(self, gates: Gates):
        self.g = gates

    # ---- exits ----------------------------------------------------------------
    def exit_intent(self, snap: Snapshot, pos: Position, setup: SetupSpec, verdict: Optional[Verdict]) -> Optional[Intent]:
        held = _side_of(pos)
        if held is None:
            return None
        sign = 1.0 if held == Direction.long else -1.0
        move_bps = (snap.mid / pos.avg_price - 1.0) * 1e4 * sign
        close_side = Side.sell if held == Direction.long else Side.buy
        qty = abs(pos.qty)
        base = dict(symbol=snap.symbol, ts=snap.ts, side=close_side, qty=qty, ref_price=snap.mid, notional_usd=qty * snap.mid)
        if move_bps <= -setup.stop_bps:
            return Intent(reason="stop_loss", **base)
        if move_bps >= setup.target_bps:
            return Intent(reason="take_profit", **base)
        if pos.bars_held >= setup.horizon_bars:
            return Intent(reason="time_stop", **base)
        if verdict is not None:
            if verdict.risk_state == RiskState.reduce:
                return Intent(reason="risk_reduce", **base)
            if verdict.direction != held and verdict.direction != Direction.neutral and verdict.direction_conf >= self.g.exit_flip_conf:
                return Intent(reason="exit_signal", **base)
            if verdict.regime == Regime.crisis and verdict.regime_conf >= self.g.exit_flip_conf:
                return Intent(reason="risk_reduce", **base)
        return None

    # ---- entries --------------------------------------------------------------
    def entry_blocked_reason(self, snap: Snapshot, v: Verdict, setup: SetupSpec) -> Optional[str]:
        if not setup.tradable:
            return "setup_not_tradable"
        if not setup.is_active(snap.ts):
            return "setup_inactive_window"
        if v.regime == Regime.crisis:
            return "regime_crisis"
        if v.risk_state != RiskState.safe:
            return f"risk_state_{v.risk_state.value}"
        if v.setup_quality < self.g.min_setup_quality:
            return "setup_quality_low"
        if v.direction == Direction.neutral:
            return "direction_neutral"
        if v.direction_conf <= self.g.min_direction_conf:
            return "direction_conf_low"
        if setup.bias != "neutral" and v.direction.value != setup.bias:
            return "direction_against_bias"
        if v.toxic_flow_p > self.g.max_toxic_flow:
            return "toxic_flow"
        if snap.spread_bps > self.g.max_spread_bps:
            return "spread_wide"
        return None

    def entry_intent(self, snap: Snapshot, v: Verdict, pos: Position, equity: EquityTracker, setup: SetupSpec) -> Optional[Intent]:
        if pos.qty != 0:
            return None  # one position per symbol; pyramiding is not allowed
        if self.entry_blocked_reason(snap, v, setup) is not None:
            return None
        p = v.direction_probs.get(v.direction.value, v.direction_conf)
        f_full = kelly_fraction(p, setup.payoff_ratio)
        frac = min(self.g.kelly_cap * f_full, self.g.kelly_cap)
        if frac <= 0:
            return None
        notional = min(frac * equity.equity, setup.max_notional_pct / 100.0 * equity.equity)
        if notional * self.g.min_depth_multiple > snap.depth_usd:
            notional = snap.depth_usd / self.g.min_depth_multiple  # never be more than 1/N of visible depth
        if notional <= 0 or snap.mid <= 0:
            return None
        qty = notional / snap.mid
        return Intent(
            symbol=snap.symbol,
            ts=snap.ts,
            side=_dir_to_side(v.direction),
            qty=qty,
            ref_price=snap.mid,
            notional_usd=notional,
            reason="entry",
            p_win=p,
            kelly_fraction=frac,
        )

    def decide(self, snap: Snapshot, v: Optional[Verdict], pos: Position, equity: EquityTracker, setup: SetupSpec) -> Optional[Intent]:
        ex = self.exit_intent(snap, pos, setup, v)
        if ex is not None:
            return ex
        if v is None:
            return None  # no judge, no new risk
        return self.entry_intent(snap, v, pos, equity, setup)

    def should_escalate(self, v: Optional[Verdict], pos: Position) -> Optional[str]:
        if v is None:
            return "judge_unavailable" if pos.qty != 0 else None
        if v.regime == Regime.crisis:
            return "crisis_regime"
        if pos.qty != 0 and v.direction_conf < self.g.escalate_below_conf:
            return "low_confidence"
        if v.risk_state == RiskState.near_limit and pos.qty != 0:
            return "risk_near_limit"
        return None
