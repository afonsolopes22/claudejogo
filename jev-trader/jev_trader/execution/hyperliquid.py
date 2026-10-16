"""Hyperliquid adapter. STATUS: read-only market data only; order placement is intentionally NOT implemented.

Live order signing requires the official SDK (`hyperliquid-python-sdk`) and an operator-approved ship gate
(docs/05-ship.md, Phase 6). Keeping `submit` unimplemented here is deliberate: nothing in this repo can send a live
order until a human wires it in and signs off. Endpoint shapes below are from the public info API:
  POST https://api.hyperliquid.xyz/info  {"type":"l2Book","coin":"BTC"}
  POST https://api.hyperliquid.xyz/info  {"type":"metaAndAssetCtxs"}   (funding, open interest)
They were NOT reachable from the build environment, so this module is untested against the live endpoint.
"""
from __future__ import annotations

from typing import Optional

import httpx2

from ..state_engine import BookLevel, Funding, L2Book
from ..types import Fill, Intent, RiskApproval

INFO_URL = "https://api.hyperliquid.xyz/info"


class HyperliquidData:
    def __init__(self, timeout_s: float = 3.0):
        self._c = httpx2.Client(timeout=timeout_s)

    def l2_book(self, coin: str, ts: int) -> L2Book:
        r = self._c.post(INFO_URL, json={"type": "l2Book", "coin": coin})
        r.raise_for_status()
        levels = r.json()["levels"]  # [bids, asks]; each {"px": str, "sz": str, "n": int}
        bids = [BookLevel(float(l["px"]), float(l["sz"])) for l in levels[0]]
        asks = [BookLevel(float(l["px"]), float(l["sz"])) for l in levels[1]]
        return L2Book(symbol=coin, ts=ts, bids=bids, asks=asks)

    def funding(self, coin: str, ts: int) -> Optional[Funding]:
        r = self._c.post(INFO_URL, json={"type": "metaAndAssetCtxs"})
        r.raise_for_status()
        meta, ctxs = r.json()
        for asset, ctx in zip(meta["universe"], ctxs):
            if asset["name"] == coin:
                # `funding` is an hourly rate as a decimal string; convert to bps per 8h.
                return Funding(coin, ts, float(ctx["funding"]) * 8 * 1e4)
        return None


class HyperliquidExchange:
    def submit(self, intent: Intent, approval: RiskApproval, book: L2Book) -> Optional[Fill]:
        raise NotImplementedError(
            "Live order placement is gated. See docs/05-ship.md Phase 6: wire hyperliquid-python-sdk, run the "
            "paper->shadow->micro-size ladder, and get operator sign-off before enabling."
        )
