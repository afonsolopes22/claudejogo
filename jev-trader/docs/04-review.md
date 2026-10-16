# Phase 5 - Review checklist  (gate: every box ticked by a human before Phase 6)

## Adversarial review of the build (done by the Brain, 2026-10-16)
- [x] **Is any hard limit delegated to the model?** No. Grep `jev_trader/risk.py`: no import of schema/jev_client. `RiskLimits` is loaded from YAML; nothing writes it at runtime.
- [x] **Can an order reach an exchange without risk approval?** No. `PaperExchange.submit` raises `UnapprovedOrder` unless `RiskEngine.verify` passes; `HyperliquidExchange.submit` is `NotImplementedError`. Test: `tests/test_risk.py::test_approval_binds_to_intent_and_paper_exchange_refuses_mismatch`.
- [x] **Kill switch before every order?** `RiskEngine.check` is called for every intent, first check is the kill switch; even exits are denied. Test: `tests/test_loop.py::test_kill_switch_blocks_all_orders`.
- [x] **Can the Brain increase risk?** No. `BrainVerdict.action` is a 4-value Literal with no "increase"/"size up"; structured output enforces it.
- [x] **Future leakage into the snapshot?** Trades newer than the book ts raise; funding newer than the book ts is hidden. Tests in `tests/test_state_engine.py`.
- [x] **Snapshot < 400 tokens?** Asserted in code and tests (`estimate_tokens`).
- [x] **Gates exactly as specified?** quality ≥ 2 (`<` blocks), conf > 0.80 (`<=` blocks), risk_state == safe. Parametrized test covers each.
- [x] **Quarter-Kelly cap?** `min(0.25·f*, 0.25)` then per-symbol cap then depth cap. Tested.
- [x] **PnL identity?** equity == start + realized − fees + unrealized after a random 60-bar run. Tested.
- [x] **Jev outage?** HOLD, exits run, escalation only if in a position. Tested.
- [x] **Schema wire-compatible?** Compiled questions validated by `typesafe_sdk` `normalize_questions` and wire `Question` model; SDK response → answers conversion tested with a real `SystemOneResponse`.

## Open items the review found (not blockers for paper, blockers for live)
- [ ] `TypeSafeJudge` has never been run against the live endpoint from this environment (DNS blocked). First `--jev` run must be observed by a human; check latency distribution vs the 1.5 s timeout.
- [ ] The HALTED latch and kill switch are files. On a multi-host deployment they must be on shared storage or replaced by a small KV.
- [ ] `EquityTracker` daily roll uses UTC midnight; venue funding/day boundaries differ. Fine for limits, wrong for per-day reporting.
- [ ] The nightly `_forward_outcomes` labels use mid prices, not fills: Brier on `direction` measures *prediction* skill, not tradable PnL. Treat `quality_cal` (target-before-stop) as the economic one.
- [ ] Setup bias is fixed in YAML; if the Brain's nightly review wants to flip a bias it must go through the proposal/approval path (by design, but slow).
- [ ] Paper cost model (4.5 bps taker, `0.02·sqrt(notional)` bps impact) is a placeholder; calibrate from real fills in shadow mode.
- [ ] No position reconciliation against the venue (paper has none). Live adapter must reconcile on start and on every fill.
