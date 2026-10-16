# WHAT COULD I BE WRONG ABOUT?

Ordered by how badly it would hurt.

1. **Jev may not be calibrated on order-book snapshots.** Its calibration claims are for classification/routing on text and JSON. A 15-number snapshot is an unusual domain; `direction_conf > 0.80` might simply never fire, or fire on noise. The nightly Brier/skill review exists precisely to catch this; until it shows skill > 0 at n ≥ 100, the system should trade nothing.
2. **The research numbers are secondary and partly conflicting.** Dominance ranged 57.7-60.4%, UNI activation dates differ by months across sources, Monad's unlock size is quoted as 10.7B, 16.6B and 16.8B. I could not hit any primary API. Every figure in `config/setups.yaml` is narrative context for Jev's instructions, not a traded input, but a wrong fact in an instruction still biases the judge.
3. **The catalysts are all public and probably priced.** The honest edge claim is not "I know the unlock"; it is "asymmetric stop/target geometry plus a calibrated judge of the tape around the event". If Jev has no skill on the tape, there is no edge at all.
4. **Shorting thin perps (MON, ENA) is where this system dies.** Squeeze risk, borrow, and slippage are modelled only by a placeholder cost function and a wide stop. The 600 bps stops may be hit by noise. The review flags cost > 30% of target, but only after the losses.
5. **Gross exposure of 60% with correlated alts is one bet, not seven.** In a BTC-led sell-off every long loses together and the 15% drawdown latch can trip from a single day. The risk layer sees exposure per symbol, not correlation.
6. **Quarter-Kelly on a calibrated probability is still full of model risk.** Kelly assumes the payoff ratio b = target/stop is realised; with slippage and partial fills it is smaller. Sizing is therefore optimistic by the slippage share of the target.
7. **The regime read (BTC-led risk-off into FOMC) may be stale by Monday.** A Fed hold on 28-Oct could flip ETH/ENA shorts into squeezes. Those setups carry explicit invalidation conditions, but the loop only enforces price-based stops; fundamental invalidations need the nightly review or a human.
8. **Escalation to the Brain is slow and expensive by design.** A crisis can move 5% in the 30-60 s an Opus call takes. The code-owned stops run first, which is the right mitigation, but the Brain cannot save a position that gapped.
9. **"AgenKit" did not exist as far as I can verify.** If the operator expected a specific third-party harness, that expectation is unmet. The six gated phases are implemented as repo discipline (docs + tests) instead.
10. **Nothing has run against a live Jev endpoint or a live book.** The SDK wire shapes were inspected from the installed package and tests use a real `SystemOneResponse`, but latency, rate limits, and the actual quality of answers are unknown until Rung 1 of `docs/05-ship.md`.

**Survival over profit:** the defaults ship with no live adapter, a kill switch that blocks even exits, and a halt latch that only a human clears. A system that does nothing is the correct state until the calibration review earns it the right to trade.
