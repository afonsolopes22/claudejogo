# jev-trader

A 24/7 autonomous crypto trading agent built as two layers that never blur:

- **BRAIN** - Claude Opus 5.5: research, schema derivation, escalations, nightly review (slow, deep).
- **REFLEX** - TypeSafe **Jev**: one typed, calibrated judgement per candle for every finalist in a single call (fast).
- **CODE** - this package: every threshold, size, side effect and hard limit, deterministically. Jev only judges.

```
feed → StateEngine (<400-token numeric snapshot, causal ts) → Jev (regime, direction, toxic_flow, setup_quality, risk_state)
     → Policy (quality≥2 & conf>0.80 & risk safe; quarter-Kelly) → RiskEngine (15% DD, daily loss, caps, kill switch; approval-by-hash)
     → Exchange → Journal → nightly Brier review → proposed schema revision → human approval
```

Docs: `docs/00-spec.md` → `01-architecture.md` → `02-plan.md` → `03-research.md` (finalists, bear cases, invalidation, sources) → `04-review.md` → `05-ship.md`.

Quick start: `pip install -e ".[dev]" && pytest && python scripts/run_paper.py --bars 300`.

**Painel web (interface de controlo).** `python -m jev_trader.ui.server` e abre http://127.0.0.1:8787. Arranca/pára o loop em papel (juiz Demo, Stub ou Jev real), mostra equity, drawdown, veredictos por setup, fills e escalações ao vivo, arma o kill switch, corre e aprova a revisão noturna, edita `config/*.yaml` com validação, e lê a research e o journal. O servidor é stdlib puro (sem dependências extra).

**Alertas de setups long/short.** `jev_trader/alerts.py` dispara `setup` (passou todas as portas), `a formar` (qualidade ≥ 2 e confiança ≥ 0.70 mas ainda bloqueado), `fill` e `risco`, com deduplicação por transição e re-arme após 3 velas. Canais: toasts, notificações do browser e som no painel; Telegram (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`) e webhook Discord/Slack (`JEV_WEBHOOK_URL`) via variáveis de ambiente. Os envios HTTP correm em thread e nunca bloqueiam a vela. O juiz "Demo" inventa veredictos a partir do momentum do tape para mostrar a canalização; não tem skill e não é evidência de nada.

**Honesty notes.** The build environment could not reach exchange APIs or `docs.typesafe.ai`, so the Jev client is built against the inspected `typesafe-sdk 0.7.5` wire models and is unit-tested with a real `SystemOneResponse`, but it has not been run against the live endpoint. No live order path ships enabled. The prompt that produced this repo referenced an "AgenKit" harness at agenkit.xyz; that domain did not resolve and has no public footprint, so the six-phase gated discipline it described is implemented here directly as `docs/0*.md` plus tests, with nothing installed from third parties beyond the two official SDKs.
