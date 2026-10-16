#!/usr/bin/env python3
"""Run the loop in paper mode on a synthetic or recorded feed.

  python scripts/run_paper.py --bars 300                 # synthetic feed, StubJudge (no network)
  python scripts/run_paper.py --bars 300 --jev           # synthetic feed, real Jev (needs TYPESAFE_API_KEY)
  python scripts/run_paper.py --replay data/books.jsonl  # recorded books
"""
from __future__ import annotations

import argparse
import os
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from jev_trader.escalation import NullEscalator
from jev_trader.execution import JsonlFeed, PaperExchange, SyntheticFeed
from jev_trader.jev_client import StubJudge, TypeSafeJudge
from jev_trader.journal import Journal
from jev_trader.loop import TradingLoop
from jev_trader.risk import load_limits
from jev_trader.schema import load_setups


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--setups", default="config/setups.yaml")
    ap.add_argument("--risk", default="config/risk.yaml")
    ap.add_argument("--journal", default=os.environ.get("JEV_TRADER_JOURNAL", "data/journal.jsonl"))
    ap.add_argument("--equity", type=float, default=float(os.environ.get("JEV_TRADER_EQUITY_USD", "10000")))
    ap.add_argument("--bars", type=int, default=200)
    ap.add_argument("--replay", default=None)
    ap.add_argument("--jev", action="store_true", help="use the real TypeSafe Jev judge")
    ap.add_argument("--brain", action="store_true", help="use Claude Opus 5.5 for escalations (needs ANTHROPIC_API_KEY)")
    a = ap.parse_args()

    book = load_setups(a.setups)
    limits = load_limits(a.risk)
    judge = TypeSafeJudge() if a.jev else StubJudge()
    escalator = NullEscalator()
    if a.brain:
        from jev_trader.escalation import ClaudeEscalator

        escalator = ClaudeEscalator()
    loop = TradingLoop(book=book, judge=judge, exchange=PaperExchange(), journal=Journal(a.journal), limits=limits, escalator=escalator, starting_equity=a.equity)
    syms = [s.symbol for s in book.setups]
    feed = JsonlFeed(a.replay) if a.replay else SyntheticFeed(symbols=syms, start_ts=int(time.time() * 1000) // 3_600_000 * 3_600_000 - a.bars * 3_600_000, n_bars=a.bars, bar_ms=3_600_000, prices={"BTC": 82_600, "ETH": 2_480, "SOL": 105, "HYPE": 80, "MON": 0.0228, "UNI": 7.1, "ENA": 0.22, "AAVE": 158})
    ticks = 0
    for book_, trades, funding in feed:
        r = loop.on_event(book_, trades, funding)
        if r:
            ticks += 1
            if r.fills or r.escalations:
                print(f"{r.ts} fills={[(f.symbol, f.side.value, round(f.qty, 4), round(f.price, 4), f.reason) for f in r.fills]} esc={r.escalations}")
    print(f"ticks={ticks} equity={loop.equity.equity:.2f} dd={loop.equity.drawdown_pct:.2f}% journal={a.journal} schema={loop.version}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
