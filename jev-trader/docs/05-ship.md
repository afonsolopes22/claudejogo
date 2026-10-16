# Phase 6 - Ship runbook  (gate: operator signs each rung)

## Install
```bash
cd jev-trader
pip install -e ".[dev]"
cp .env.example .env   # fill TYPESAFE_API_KEY (console.typesafe.ai) and ANTHROPIC_API_KEY
pytest                 # must be green
```

## Rung 0 - plumbing (no network)
```bash
python scripts/run_paper.py --bars 300
python scripts/nightly_review.py && cat data/review-$(date -u +%F).md
python scripts/killswitch.py arm && python scripts/run_paper.py --bars 20   # expect zero fills
python scripts/killswitch.py disarm
```

## Rung 1 - paper with the real Reflex
```bash
python scripts/run_paper.py --bars 500 --jev          # watch latency; verdicts land in data/journal.jsonl
python scripts/run_paper.py --bars 500 --jev --brain  # escalations go to Claude Opus 5.5
```
Exit criteria (≥ 2 weeks of hourly candles on a recorded/replayed feed): direction skill > 0 and quality ECE < 0.15 on at least two tradable setups with n ≥ 100; nightly proposals reviewed daily.

## Rung 2 - shadow
Feed real L2 books (write a `Feed` that polls `execution/hyperliquid.HyperliquidData.l2_book` once per candle and records to JSONL), keep `PaperExchange`. Compare paper fills to the venue's printed trades to calibrate `taker_fee_bps` and `impact_bps_per_sqrt_usd`.

## Rung 3 - micro-size live
1. Implement `HyperliquidExchange.submit` with `hyperliquid-python-sdk`, keeping the `RiskEngine.verify` call as the first line.
2. Add position reconciliation on start and after each fill.
3. `config/risk.yaml`: `max_position_notional_pct: 2`, `max_gross_exposure_pct: 5`.
4. Kill-switch drill: arm during a live position; confirm no order leaves; flatten manually; disarm.

## Rung 4 - live at configured limits
- Nightly: cron `10 0 * * * cd jev-trader && python scripts/nightly_review.py` and a human (or delegated Brain) runs `--approve`.
- Weekly: kill-switch drill; review `data/HALTED` events.
- Any `CausalityError` in logs is a feed bug: stop, fix, replay.

## Rollback
`scripts/killswitch.py arm` → flatten manually → `git checkout <previous tag> -- config/setups.yaml` → `scripts/killswitch.py disarm`.
