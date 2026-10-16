# Phase 1 - Spec  (gate: operator approves before architecture)

**Status:** DRAFT for approval. Nothing in Phase 4 may be enabled live until this and 01/02 are approved.

## What we are building
A 24/7 autonomous crypto trading agent with two layers that are never blurred:

| Layer | Who | Does | Does NOT |
|---|---|---|---|
| BRAIN | Claude Opus 5.5 (`claude-opus-5-5`) | market research, strategy derivation, schema compilation, escalations, nightly review | touch an order, a size, or a limit |
| REFLEX | TypeSafe Jev (`jev-latest`, POST `/v1/systemone`) | one typed, calibrated judgement per candle for every finalist in parallel (~70-500 ms end to end per vendor claims) | decide anything; it only *answers typed questions* |
| CODE | `jev_trader/` | every threshold, size, side effect and hard limit, deterministically | ask a model for permission to break a limit |

## Functional requirements
1. **State engine** turns L2 book + trades + funding into one compact numeric snapshot per symbol, < 400 tokens, with strict causal timestamps (nothing with event ts > snapshot ts can leak in). Fields: mid, spread, imbalance, depth, realized vol (2 windows), returns (2 windows), signed flow, inventory, inventory %, unrealized, drawdown, daily pnl, bars held, funding (if known).
2. **Jev schema** per finalist: `regime` ∈ {trending, mean_reverting, high_vol, crisis}; `direction` ∈ {long, short, neutral}; `toxic_flow` (noul); `setup_quality` score 0..3; `risk_state` ∈ {safe, near_limit, reduce}. All finalists in **one** call.
3. **Policy gate (code):** enter only if `setup_quality ≥ 2` AND `direction_conf > 0.80` AND `risk_state == safe` AND regime ≠ crisis AND `P(toxic) ≤ 0.5` AND direction matches the setup bias. Size = fractional Kelly from Jev's calibrated `P(direction)` with `b = target/stop`, **capped at quarter Kelly**, further capped by per-symbol and visible-depth limits.
4. **Hard risk layer (code):** max drawdown 15 %, max daily loss 3 %, max position 20 % of equity per symbol, max gross 60 %, min order size, **armed kill switch checked before every order**, HALTED latch that only an operator clears. Executors refuse any order without a risk approval bound by hash to the exact intent.
5. **Escalation:** if `direction_conf < 0.60` with an open position, or regime flips to crisis, or Jev is unavailable while in a position, ask the Brain. The Brain may only answer resume / pause / reduce / flatten. Cooldown-governed.
6. **Journal:** append-only JSONL of every snapshot, verdict, intent, risk decision, fill and escalation.
7. **Nightly review:** label each verdict with what happened (forward return, target-before-stop), compute Brier / skill / ECE, list fills and misses, propose a schema revision as a versioned YAML; a human (or a delegated Brain gate) approves before it replaces `config/setups.yaml`.
8. **Modes:** `paper` (default), `replay`, `live` (gated, no live adapter ships enabled).

## Non-functional requirements
- No model output can change a limit. Verified by tests (`tests/test_risk.py`, `tests/test_loop.py`).
- Loop must tolerate Jev outage: hold, exits still run, escalate if in a position.
- Fail safe: Brain unavailable → pause entries.
- Single process, no DB; the journal is the source of truth.

## Out of scope for v1
Multi-venue routing, options, cross-margin modelling, on-chain execution, MEV protection.

## Acceptance (what the operator checks before approving Phase 2)
- [ ] Table above matches intent: model judges, code decides.
- [ ] Limits in `config/risk.yaml` are the ones you want.
- [ ] Finalist list in `docs/03-research.md` is the universe you want Jev to score.
