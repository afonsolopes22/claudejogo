# Phase 3 - Plan  (gate: operator approves before build)

Six phases, each with an explicit approval gate. The gate is a human action: a reply/commit saying "approved: phase N".

| Phase | Deliverable | Files | Gate |
|---|---|---|---|
| 1 Spec | requirements | `docs/00-spec.md` | approved? |
| 2 Architecture | layering, approval-by-hash, failure modes | `docs/01-architecture.md` | approved? |
| 3 Plan | this file + research + compiled setups | `docs/02-plan.md`, `docs/03-research.md`, `config/setups.yaml` | approved? |
| 4 Build (test-first) | package + tests | `jev_trader/**`, `tests/**` | `pytest` green |
| 5 Review | adversarial checklist | `docs/04-review.md` | all boxes ticked |
| 6 Ship | runbook: paper → shadow → micro-size → live | `docs/05-ship.md` | operator sign-off per rung |

## Build order (Phase 4), test-first
1. `tests/test_state_engine.py` → `jev_trader/state_engine.py` (causality, token budget)
2. `tests/test_schema.py` → `jev_trader/schema.py` (validated against the real `typesafe_sdk` wire models)
3. `tests/test_policy.py` → `jev_trader/policy.py` (every gate has a test that it blocks)
4. `tests/test_risk.py` → `jev_trader/risk.py` + `execution/paper.py` (kill switch, latch, caps, approval-by-hash)
5. `tests/test_jev_client.py` → `jev_trader/jev_client.py` (SDK response conversion, outage → `JudgeUnavailable`)
6. `tests/test_loop.py` → `jev_trader/loop.py` + `escalation.py` (entry→exit cycle, outage, crisis, kill switch, PnL identity)
7. `tests/test_review.py` → `review/brier.py`, `review/nightly.py` (Brier, proposal round-trips through the validator)

## Nightly loop (self-improvement), every day at 00:10 UTC
```
scripts/nightly_review.py                 # report + data/setups.proposed.yaml  (Brain may be asked to annotate)
<operator or delegated Brain gate reads report>
scripts/nightly_review.py --approve       # replaces config/setups.yaml; next loop start picks the new schema_version
```
Run via cron/systemd timer on the host. The review never trades.

## Ship ladder (Phase 6)
1. **Paper** with StubJudge (plumbing) → **Paper with real Jev** (`--jev`) for ≥ 2 weeks; require direction skill > 0 on ≥ 2 setups with n ≥ 100.
2. **Shadow**: live feed, real Jev, orders logged but not sent (PaperExchange on live books).
3. **Micro-size**: live adapter wired, `max_position_notional_pct: 2`, `max_gross_exposure_pct: 5`, kill switch drill performed.
4. **Live**: limits from `config/risk.yaml`; nightly review mandatory; kill switch drill weekly.
