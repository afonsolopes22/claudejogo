"""Compile finalist setups into a typed Jev decision schema and parse the answers back into Verdicts.

One system_one call per candle carries ALL setups (questions are namespaced `<SYMBOL>.<field>`), so every
finalist is evaluated in parallel in a single ~100ms round trip.
"""
from __future__ import annotations

import datetime as dt
import hashlib
import json
from pathlib import Path
from typing import Literal, Optional

from . import _yaml
from pydantic import BaseModel, ConfigDict, Field, field_validator

from .types import Direction, Regime, RiskState, Verdict

FIELDS = ("regime", "direction", "toxic_flow", "setup_quality", "risk_state")


class SetupSpec(BaseModel):
    model_config = ConfigDict(extra="forbid")
    symbol: str
    venue: str = "paper"
    bias: Literal["long", "short", "neutral"]
    tradable: bool = True
    thesis: str
    confirmed_catalysts: list[str] = Field(default_factory=list)
    speculative_catalysts: list[str] = Field(default_factory=list)
    bear_case: str
    invalidation: list[str]
    stop_bps: float = Field(gt=0)
    target_bps: float = Field(gt=0)
    horizon_bars: int = Field(gt=0, description="time stop, in candles")
    max_notional_pct: float = Field(gt=0, le=100, description="per-symbol cap as % of equity; the risk layer applies its own cap too")
    active_from: Optional[dt.date] = None
    active_to: Optional[dt.date] = None
    notes: str = ""

    @property
    def payoff_ratio(self) -> float:
        return self.target_bps / self.stop_bps

    def is_active(self, ts_ms: int) -> bool:
        d = dt.datetime.fromtimestamp(ts_ms / 1000, tz=dt.timezone.utc).date()
        if self.active_from and d < self.active_from:
            return False
        if self.active_to and d > self.active_to:
            return False
        return True


class RiskHints(BaseModel):
    """Code-owned numbers shown to Jev so `risk_state` is judged against the real limits. Jev cannot change them."""

    model_config = ConfigDict(extra="forbid")
    max_drawdown_pct: float
    max_daily_loss_pct: float
    max_position_notional_pct: float


class SetupBook(BaseModel):
    model_config = ConfigDict(extra="forbid")
    version: str
    as_of: dt.date
    setups: list[SetupSpec]

    @field_validator("setups")
    @classmethod
    def _unique(cls, v: list[SetupSpec]) -> list[SetupSpec]:
        syms = [s.symbol for s in v]
        if len(set(syms)) != len(syms):
            raise ValueError("duplicate symbols in setup book")
        return v

    def by_symbol(self) -> dict[str, SetupSpec]:
        return {s.symbol: s for s in self.setups}


def load_setups(path: str | Path) -> SetupBook:
    with open(path) as f:
        return SetupBook.model_validate(_yaml.load(f.read()))


# ---- compilation ------------------------------------------------------------

_SNAPSHOT_LEGEND = (
    "state.snapshots[] fields (all numeric, computed in code, nothing newer than ts): "
    "sym, ts(ms), mid, spr(spread bps), imb(book imbalance -1..1), dep(depth USD), rvS/rvL(realized vol bps short/long), "
    "rS/rL(return bps short/long), flow(signed taker flow -1..1), inv(position units), invPct(|notional|/equity %), "
    "uPnl(unrealized %), dd(drawdown %), dPnl(today %), held(bars in position), fund(funding bps/8h, if known). "
    "lv = market structure, all distances in bps from mid (positive = above mid): atr(ATR bps), poc/vah/val(current daily-session "
    "volume profile), va(-1 below value area, 0 inside, +1 above), pPoc(previous session POC), nPoc(nearest naked/untested prior "
    "POC), cPoc/cVah/cVal(5-session composite profile), liqA/liqB(nearest liquidity pool above/below) with liqAk/liqBk kind "
    "(1 swing high/low, 2 equal highs/lows, 3 prior-session extreme, 4 composite VA edge), swp(+1 swept a high and closed back "
    "below = bearish sweep, -1 swept a low and closed back above = bullish sweep, 0 none) with swpAge(bars ago), rt(+1 retesting a "
    "broken level from above as support, -1 from below as resistance, 0 none) with rtBps, sbar(bars since session open)."
)


def compile_questions(book: SetupBook, hints: RiskHints) -> dict[str, dict]:
    """Return the `questions` mapping for TypeSafe system_one. Plain dicts keep this importable without the SDK."""
    q: dict[str, dict] = {}
    for s in book.setups:
        p = f"{s.symbol}."
        ctx = f"Judge ONLY the snapshot with sym == '{s.symbol}'. {_SNAPSHOT_LEGEND}"
        q[p + "regime"] = {
            "type": "choice",
            "instructions": f"{ctx} Which market regime best describes this symbol right now?",
            "criteria": {
                "trending": "persistent directional drift: |rL| large relative to rvL, rS same sign as rL, flow aligned",
                "mean_reverting": "range-bound: rL small relative to rvL, rS often opposite to rL, balanced flow",
                "high_vol": "rvS well above rvL (vol expansion) without a clean direction; wide spr, thin dep",
                "crisis": "disorderly: spr multiples of normal, dep collapsing, rvS extreme, one-sided flow, |rS| extreme",
            },
        }
        bias_txt = {
            "long": "The setup is a LONG thesis; only answer 'long' if the tape supports it now, otherwise 'neutral' or 'short'.",
            "short": "The setup is a SHORT thesis; only answer 'short' if the tape supports it now, otherwise 'neutral' or 'long'.",
            "neutral": "No directional bias; answer from the tape alone.",
        }[s.bias]
        q[p + "direction"] = {
            "type": "choice",
            "instructions": (
                f"{ctx} Thesis: {s.thesis} Invalidation signs: {'; '.join(s.invalidation)}. {bias_txt} "
                f"Which direction has positive expectancy over the next {s.horizon_bars} candles, net of ~{s.stop_bps/10:.0f}bps costs? "
                "Weigh market structure: a bullish liquidity sweep (lv.swp=-1) or support retest (lv.rt=+1) favours long; a bearish "
                "sweep (lv.swp=+1) or resistance retest (lv.rt=-1) favours short; price above the value area with the composite POC "
                "far below is extended; the nearest liquidity pool is where price is drawn to."
            ),
            "criteria": {
                "long": "price more likely to rise by the target than fall to the stop",
                "short": "price more likely to fall by the target than rise to the stop",
                "neutral": "no edge, or edge smaller than costs",
            },
        }
        q[p + "toxic_flow"] = {
            "type": "noul",
            "instructions": (
                f"{ctx} Is current order flow toxic (informed/adverse), such that an order placed now would likely be "
                "adversely selected? Signs: one-sided flow with widening spr and thinning dep, rvS jumping above rvL, "
                "imb strongly against the intended side."
            ),
        }
        q[p + "setup_quality"] = {
            "type": "score",
            "instructions": f"{ctx} Thesis: {s.thesis} Bear case: {s.bear_case} Rate the quality of acting on this setup NOW.",
            "criteria": [
                "0: thesis inactive or invalidated by the tape; regime is crisis; or price is mid-range inside the value area with no structure (no sweep, no retest, far from POC/VAH/VAL and from any liquidity pool)",
                "1: weak: tape mixed or regime unfavourable; price near a level but without a completed sweep or retest; or the nearest liquidity pool sits in the way of the target (liqA for a long, liqB for a short) closer than the stop distance",
                "2: good: regime favourable and price action aligned with the thesis AT structure: a bullish sweep (swp=-1) or a retest holding as support (rt=+1) for a long, a bearish sweep (swp=+1) or a resistance retest (rt=-1) for a short, or a VAL/VAH rejection back into value, with flow confirming and costs acceptable",
                "3: excellent: all of (2) plus confluence: the level is a naked POC, composite VA edge or equal highs/lows; the sweep is fresh (swpAge<=3); the path to the target has no liquidity pool before it; deep book",
            ],
        }
        q[p + "risk_state"] = {
            "type": "choice",
            "instructions": (
                f"{ctx} Hard limits (owned by code): max drawdown {hints.max_drawdown_pct}%, max daily loss "
                f"{hints.max_daily_loss_pct}%, max position {hints.max_position_notional_pct}% of equity. "
                "Given dd, dPnl, invPct, uPnl, how close is the book to its limits?"
            ),
            "criteria": {
                "safe": "all metrics below half of their limits",
                "near_limit": "any metric between half and the full limit",
                "reduce": "any metric at/over its limit, or open loss accelerating into a limit",
            },
        }
    return q


def schema_version(book: SetupBook, questions: dict[str, dict]) -> str:
    h = hashlib.sha256(json.dumps(questions, sort_keys=True).encode()).hexdigest()[:10]
    return f"{book.version}+{h}"


# ---- parsing -----------------------------------------------------------------


class SchemaParseError(ValueError):
    pass


def parse_verdicts(
    answers: dict[str, dict], book: SetupBook, ts: int, latency_ms: float, model: str, version: str
) -> dict[str, Verdict]:
    out: dict[str, Verdict] = {}
    for s in book.setups:
        p = f"{s.symbol}."
        try:
            reg = answers[p + "regime"]
            dire = answers[p + "direction"]
            tox = answers[p + "toxic_flow"]
            sq = answers[p + "setup_quality"]
            rs = answers[p + "risk_state"]
        except KeyError as e:
            raise SchemaParseError(f"missing answer {e} for {s.symbol}") from e
        for a, t in ((reg, "choice"), (dire, "choice"), (tox, "noul"), (sq, "score"), (rs, "choice")):
            if a.get("type") != t:
                raise SchemaParseError(f"{s.symbol}: expected {t}, got {a.get('type')}")
        out[s.symbol] = Verdict(
            symbol=s.symbol,
            ts=ts,
            schema_version=version,
            regime=Regime(reg["choice"]),
            regime_conf=float(reg["confidence"]),
            regime_probs={k: float(v) for k, v in reg["probabilities"].items()},
            direction=Direction(dire["choice"]),
            direction_conf=float(dire["confidence"]),
            direction_probs={k: float(v) for k, v in dire["probabilities"].items()},
            toxic_flow_p=float(tox["noul"]),
            setup_quality=float(sq["score"]),
            setup_quality_conf=float(sq["confidence"]),
            setup_quality_probs={str(k): float(v) for k, v in sq["probabilities"].items()},
            risk_state=RiskState(rs["choice"]),
            risk_state_conf=float(rs["confidence"]),
            latency_ms=latency_ms,
            model=model,
        )
    return out
