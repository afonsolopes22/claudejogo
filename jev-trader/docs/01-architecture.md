# Phase 2 - Architecture  (gate: operator approves before plan)

```
                  ┌────────────────────────── BRAIN (Claude Opus 5.5, slow) ──────────────────────────┐
                  │  docs/03-research.md  →  config/setups.yaml  →  schema.compile_questions()         │
                  │  escalation.ClaudeEscalator (resume|pause|reduce|flatten only)                     │
                  │  review/nightly.py  →  data/review-*.md + data/setups.proposed.yaml  → approval    │
                  └───────────────────────────────────────┬─────────────────────────────────────────────┘
                                                          │ typed schema (versioned)
  feed ──► state_engine.StateEngine ──► Snapshot[] ──► jev_client.Judge (ONE call) ──► Verdict[]
  (L2, trades,   causal ts enforced       <400 tok        REFLEX: TypeSafe Jev ~100ms
   funding)      numeric only                                      │
                                                                   ▼
                                           policy.Policy  (gates + quarter-Kelly, all thresholds in code)
                                                                   │ Intent
                                                                   ▼
                                           risk.RiskEngine (kill switch, latch, DD, daily, caps)  ── RiskApproval(hash)
                                                                   │
                                                                   ▼
                                           execution.*  (refuses orders without matching approval)
                                                                   │ Fill
                                                                   ▼
                                           loop: positions, equity curve, journal.jsonl
```

## Modules and exact paths
| Path | Responsibility | Model involvement |
|---|---|---|
| `jev_trader/types.py` | frozen pydantic domain types (Snapshot, Verdict, Intent, RiskApproval, Fill, Position, BrainVerdict) | none |
| `jev_trader/state_engine.py` | book/trade/funding ingestion, causality checks, snapshot math, token budget, `EquityTracker` | none |
| `jev_trader/schema.py` | `SetupBook` (YAML) → Jev questions; version hash; `parse_verdicts` | compiled *for* Jev |
| `jev_trader/jev_client.py` | `Judge` protocol; `TypeSafeJudge` (official SDK, 1 attempt, 1.5 s timeout); `StubJudge` | Reflex |
| `jev_trader/policy.py` | `Gates`, `kelly_fraction`, entries/exits/escalation triggers | consumes verdicts |
| `jev_trader/risk.py` | `RiskLimits`, `RiskEngine.check/verify`, kill switch + HALTED latch | none, by construction |
| `jev_trader/escalation.py` | `EscalationRequest` → `BrainVerdict`; `ClaudeEscalator`, `NullEscalator`, `EscalationGovernor` | Brain |
| `jev_trader/execution/{base,paper,replay,hyperliquid}.py` | adapters; paper cost model; feeds; read-only HL data | none |
| `jev_trader/journal.py` | JSONL | none |
| `jev_trader/loop.py` | the tick | orchestrates |
| `jev_trader/review/{brier,nightly}.py` | calibration + revision proposal | Brain-reviewable |
| `config/setups.yaml`, `config/risk.yaml` | code-owned numbers | none |
| `scripts/run_paper.py`, `scripts/nightly_review.py`, `scripts/killswitch.py` | operator entry points | - |

## Key design decisions
1. **Approval-by-hash.** `RiskEngine.check` is the only minter of `RiskApproval`; `PaperExchange.submit` (and any live adapter) calls `RiskEngine.verify` first. A policy bug cannot bypass risk; a model cannot bypass risk.
2. **One Jev call per candle for all finalists.** Questions are namespaced `SYMBOL.field`; the state carries all snapshots. Cost ≈ (8 snapshots × ~120 tok) + question text per call; latency is one round trip.
3. **Jev sees only numbers.** No news, no text, no prices from the future. Thesis text lives in the *question instructions*, which are static per schema version (so calibration is measurable per version).
4. **Brain answers are an enum.** `BrainVerdict.action ∈ {resume, pause, reduce, flatten}` via structured output; "size up" is unrepresentable.
5. **Latch, not reset.** Drawdown/daily-loss breaches write `data/HALTED`; recovery of equity does not clear it. A human does.
6. **Schema versioning.** `schema_version = setups.version + sha256(questions)[:10]`; every verdict carries it so the nightly review can compare calibration across revisions.

## Failure modes and the designed response
| Failure | Response |
|---|---|
| Jev timeout / 5xx | hold; exits (stop/target/time) still run; escalate if in a position |
| Brain unavailable | `pause` entries 30 min |
| Feed gap / out-of-order | `CausalityError` → tick aborted, logged; no stale snapshot is scored |
| Exchange rejects / no fill | logged `no_fill`; position unchanged |
| Operator panic | `scripts/killswitch.py arm` → every subsequent order denied before reaching the adapter |
