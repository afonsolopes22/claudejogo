"""Typed domain objects shared by every layer. Pure data; no I/O."""
from __future__ import annotations

from enum import Enum
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


class Regime(str, Enum):
    trending = "trending"
    mean_reverting = "mean_reverting"
    high_vol = "high_vol"
    crisis = "crisis"


class Direction(str, Enum):
    long = "long"
    short = "short"
    neutral = "neutral"


class RiskState(str, Enum):
    safe = "safe"
    near_limit = "near_limit"
    reduce = "reduce"


class Side(str, Enum):
    buy = "buy"
    sell = "sell"


class Frozen(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")


class Snapshot(Frozen):
    """The ONLY thing Jev sees for a symbol. Every field is computed in code from data
    with event timestamps <= `ts` (enforced by the state engine)."""

    symbol: str
    ts: int = Field(description="snapshot time, unix ms; nothing newer than this leaked in")
    mid: float
    spread_bps: float
    imbalance: float = Field(ge=-1.0, le=1.0, description="(bid_depth - ask_depth)/(bid+ask) over top-k levels")
    depth_usd: float = Field(ge=0, description="top-k depth both sides, USD")
    rv_short: float = Field(ge=0, description="realized vol of log mid returns, short window, per-period stdev in bps")
    rv_long: float = Field(ge=0, description="realized vol, long window, bps")
    ret_short_bps: float
    ret_long_bps: float
    trade_flow: float = Field(ge=-1.0, le=1.0, description="signed taker volume share over window, -1..1")
    inventory: float = Field(description="signed position in units (+long/-short)")
    inventory_pct: float = Field(description="|position notional| / equity, %")
    unrealized_pnl_pct: float
    drawdown_pct: float = Field(ge=0, description="peak-to-now equity drawdown, %")
    daily_pnl_pct: float
    funding_bps_8h: Optional[float] = Field(default=None, description="latest funding rate (bps/8h) with event ts <= ts, else None")
    bars_held: int = Field(ge=0)

    def compact(self) -> dict:
        """Numeric-only, rounded. Token budget enforced in state_engine.estimate_tokens."""
        d = {
            "sym": self.symbol,
            "ts": self.ts,
            "mid": round(self.mid, 6),
            "spr": round(self.spread_bps, 2),
            "imb": round(self.imbalance, 3),
            "dep": round(self.depth_usd, 0),
            "rvS": round(self.rv_short, 1),
            "rvL": round(self.rv_long, 1),
            "rS": round(self.ret_short_bps, 1),
            "rL": round(self.ret_long_bps, 1),
            "flow": round(self.trade_flow, 3),
            "inv": round(self.inventory, 6),
            "invPct": round(self.inventory_pct, 2),
            "uPnl": round(self.unrealized_pnl_pct, 2),
            "dd": round(self.drawdown_pct, 2),
            "dPnl": round(self.daily_pnl_pct, 2),
            "held": self.bars_held,
        }
        if self.funding_bps_8h is not None:
            d["fund"] = round(self.funding_bps_8h, 2)
        return d


class Verdict(Frozen):
    """Jev's typed answer for one setup. Probabilities are Jev's calibrated outputs; nothing here is a decision."""

    symbol: str
    ts: int
    schema_version: str
    regime: Regime
    regime_conf: float = Field(ge=0, le=1)
    regime_probs: dict[str, float]
    direction: Direction
    direction_conf: float = Field(ge=0, le=1)
    direction_probs: dict[str, float]
    toxic_flow_p: float = Field(ge=0, le=1)
    setup_quality: float = Field(ge=0, le=3, description="expected score 0..3")
    setup_quality_conf: float = Field(ge=0, le=1)
    setup_quality_probs: dict[str, float]
    risk_state: RiskState
    risk_state_conf: float = Field(ge=0, le=1)
    latency_ms: float = Field(ge=0)
    model: str


class Intent(Frozen):
    """What the policy wants to do. Not an order until the risk layer approves it."""

    symbol: str
    ts: int
    side: Side
    qty: float = Field(gt=0)
    ref_price: float = Field(gt=0)
    notional_usd: float = Field(gt=0)
    reason: Literal["entry", "exit_signal", "stop_loss", "take_profit", "time_stop", "risk_reduce", "flatten"]
    p_win: Optional[float] = None
    kelly_fraction: Optional[float] = None


class RiskApproval(Frozen):
    """Issued by RiskEngine only. Executors refuse any order not carrying a matching approval."""

    intent_hash: str
    issued_ts: int
    limits_version: str


class Fill(Frozen):
    symbol: str
    ts: int
    side: Side
    qty: float
    price: float
    fee_usd: float
    slippage_bps: float
    reason: str


class Position(BaseModel):
    model_config = ConfigDict(extra="forbid")
    symbol: str
    qty: float = 0.0
    avg_price: float = 0.0
    opened_ts: Optional[int] = None
    bars_held: int = 0
    realized_pnl_usd: float = 0.0

    @property
    def side(self) -> Optional[Side]:
        if self.qty > 0:
            return Side.buy
        if self.qty < 0:
            return Side.sell
        return None

    def unrealized(self, mid: float) -> float:
        return (mid - self.avg_price) * self.qty


class EscalationRequest(Frozen):
    ts: int
    symbol: str
    trigger: Literal["low_confidence", "crisis_regime", "risk_near_limit", "judge_unavailable"]
    verdict: Optional[Verdict]
    snapshot: Snapshot
    position_qty: float


class BrainVerdict(BaseModel):
    """What the Brain may answer. Deliberately cannot say 'size up' or 'override risk'."""

    model_config = ConfigDict(extra="forbid")
    action: Literal["resume", "pause", "reduce", "flatten"]
    rationale: str
    cooldown_minutes: int = Field(ge=1, le=1440, default=30)
