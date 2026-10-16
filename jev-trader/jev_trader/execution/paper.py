"""Paper exchange with an explicit cost model. Refuses any order whose approval does not match the intent."""
from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Optional

from ..risk import RiskEngine
from ..state_engine import L2Book
from ..types import Fill, Intent, RiskApproval, Side


class UnapprovedOrder(PermissionError):
    pass


@dataclass
class PaperExchange:
    taker_fee_bps: float = 4.5           # Hyperliquid-like taker fee; override per venue
    impact_bps_per_sqrt_usd: float = 0.02  # slippage ~ k * sqrt(notional); 0.02*sqrt(10_000)=2bps
    reject_if_spread_bps_over: float = 100.0

    def submit(self, intent: Intent, approval: RiskApproval, book: L2Book) -> Optional[Fill]:
        if not RiskEngine.verify(intent, approval):
            raise UnapprovedOrder("intent/approval hash mismatch")
        if book.symbol != intent.symbol:
            raise ValueError("book/intent symbol mismatch")
        mid = book.mid()
        spread_bps = (book.asks[0].price - book.bids[0].price) / mid * 1e4
        if spread_bps > self.reject_if_spread_bps_over:
            return None
        half = spread_bps / 2.0
        impact = self.impact_bps_per_sqrt_usd * math.sqrt(max(intent.notional_usd, 0.0))
        slip = half + impact
        px = mid * (1 + slip / 1e4) if intent.side == Side.buy else mid * (1 - slip / 1e4)
        fee = intent.qty * px * self.taker_fee_bps / 1e4
        return Fill(symbol=intent.symbol, ts=book.ts, side=intent.side, qty=intent.qty, price=px, fee_usd=fee, slippage_bps=slip, reason=intent.reason)
