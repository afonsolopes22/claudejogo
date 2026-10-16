# Market research and finalists - as of 2026-10-16

**How to read labels.** `[VERIFIED]` = reported by a dated secondary source I retrieved today (URL in Sources); `[ESTIMATE]` = my arithmetic on verified inputs; `[UNVERIFIED]` = a single or low-quality source; `[SPECULATION]` = my judgement. I could not reach exchange or aggregator APIs (Binance, CoinGecko, Hyperliquid, DefiLlama API) from the build environment, so **no number here is a live primary print**. Every number must be re-checked against a live feed before any gate is approved. Nothing below is investment advice; it is the input to a machine-scored schema.

## 1. Regime
| Signal | Reading | Label / source |
|---|---|---|
| BTC | ~$82.6k on 16-Oct; 52-week high $123.7k (9-Oct-2025); fell below $81k after hot Sept CPI | [VERIFIED] Fortune 16-Oct, CoinDesk 15-Oct |
| ETH | ~$2,450-2,500; down 5.9% on 15-Oct | [VERIFIED] Fortune, Crypto Times 16-Oct |
| BTC dominance | 57.7%-60.4% depending on source; Altcoin Season Index ~30 | [VERIFIED, sources conflict] CoinGecko-based 14-Oct, TradingView 13-Oct |
| ETH/BTC | ~0.0296 (15-Oct); June low ~0.027 | [VERIFIED] CoinGecko table |
| Stablecoins | USD-pegged total $303-315B; USDT ~60%, USDC ~24%; Q3 net +$2.2B (+0.7%) | [VERIFIED] Crypto Briefing, Au79, Crystal Intelligence |
| Funding / OI | BTC perp OI ~$67.7B, funding ~+0.0029%/8h; aggregate OI "wiped" mid-Oct, funding neutral-to-slightly negative | [UNVERIFIED] single Substack source |
| Macro | Fed funds 3.75-4.00%; FOMC 27-28 Oct, hike odds 16-30% after hot CPI; 2y 4.92% / 10y 5.31% | [VERIFIED odds range; yields UNVERIFIED] Admiral Markets, CoinDesk, Au79 |
| ETF flows | BTC spot ETF -$150.5M on 14-Oct; ETH spot ETFs -$715M 1-13 Oct, 11-session outflow streak; SOL ETFs 8 straight outflow days | [VERIFIED] CoinDesk, SoSoValue via Phemex, Invezz |
| Narrative | BTC-led risk-off; perp-DEX revenue (Hyperliquid) and fee-switch/buyback tokens are the only "real yield" narrative with data; RWA/AI narratives have no fresh October flow data | [SPECULATION on rotation] |

**Regime call [SPECULATION]:** `high_vol` tilting `crisis`-adjacent for alts, `trending`-down for ETH/BTC. Stablecoin supply is flat-to-up, so this is a rotation out of alts into BTC/stables, not a liquidity drain. The 28-Oct FOMC is the binary. Implication for code: keep `max_gross_exposure_pct` at 60% and let Jev's `regime` gate do its job; expect few entries until after FOMC.

## 2. Finalists (8 symbols in the state; 7 tradable)

### HYPE (Hyperliquid) - LONG bias
- **Thesis.** Fee-funded buybacks are organic value accrual: >$1.4B cumulative revenue, >$1.26B of buybacks, ~95% of fees routed to buybacks; since Oct-2026 ~90% of USDC-reserve earnings (first ~14.58M USDC) also buy HYPE. [VERIFIED] Castle Labs via Pluang/Hokanews 8-Oct, CryptoTicker.
- **Price.** ~$80 on 14-Oct, ATH ~$98, mcap ~$18.1B, FDV ~$77.9B. [VERIFIED] 247WallSt 14-Oct.
- **Catalysts.** Confirmed: reserve-earnings buybacks (running). Speculative: HIP-3, builder codes.
- **Supply.** Core contributors 23.8% of supply, 1-yr cliff then 24-month linear; unlocks on the 6th monthly; Tokenomist shows ~9.9M HYPE (~$830M) on 6-Oct-2026. [VERIFIED, amounts conflict across trackers].
- **Value accrual.** Yes, directly (open-market buybacks). Edge is organic (fees), not incentive-driven.
- **Bear case.** 167x FDV/revenue, 39x mcap/revenue (Jul-2026) [VERIFIED older]; buybacks are pro-cyclical; ~$0.8B/month of insider supply; OI reportedly falling [UNVERIFIED]; one chain, one team, one venue.
- **Invalidation.** Weekly revenue -40% vs trailing; buyback paused; loss of the post-unlock range low on volume; OI collapse with negative funding >3 days.
- **Costs.** Deep book on its own venue; target 800 bps vs ~5 bps round trip is fine.

### MON (Monad) - SHORT bias, window 16-Oct → 24-Nov
- **Thesis.** 24-Nov-2026 cliff: ~10.7B team tokens (~90% of 11.8B circulating) and up to 16.6-16.8B total unlock; price ~$0.0228, mcap ~$269M (16-Oct). [VERIFIED] TradingView/CoinMarketCal, Tokenomics.com, MetaMask price page.
- **Fundamentals.** None that support the price: the token is a year-old L1 with no fee data I could verify. [SPECULATION]
- **Bear case for the short.** Priced in (every tracker lists it); perps showed -0.0248% funding on a +22.8% day, i.e., crowded shorts squeeze [VERIFIED OKX insight]; team may re-lock/stake; perp OI only tens-to-low-hundreds of $M aggregate → thin, slippage-prone.
- **Invalidation.** Re-lock announcement; funding persistently negative with OI rising; break above the October range high on spot volume.
- **Costs.** Wide stop (600 bps) because of squeeze risk; `max_notional_pct` 8; expect poor fills.

### SOL (Solana) - NEUTRAL, event window 16-31 Oct
- **Catalyst [VERIFIED].** Alpenglow mainnet 21-Oct-2026 (~14:50-15:00 UTC, epoch 1064); ~150 ms finality; votes move off-chain; new 0.8 SOL/epoch validator fee burned. Decrypt, CoinDesk via KuCoin, Blockonomi.
- **Flows.** ~$103-107; US spot SOL ETFs -$24.8M week to 9-Oct, 8 straight outflow days; HK listed a second SOL ETF 13-Oct. [VERIFIED]
- **Bear case.** Public date = priced; ETH fell after 2 of its last 3 upgrades; headline TPS drops on activation. Direction genuinely unknown → bias neutral, let the tape decide, small size.
- **Invalidation.** Delay/halt; ETF outflows >$50M/day for 3 days.

### ETH - SHORT bias (risk-off regimes only)
- **Thesis.** -$715M ETF outflows 1-13 Oct; ETH/BTC ~0.0296 near cycle lows; issuance ~1.1M ETH/yr with burn covering a small share as activity sits on L2s; ETF AUM $23.6B vs BTC $97.2B. [VERIFIED] Phemex/SoSoValue, Datawallet, CoinCentral.
- **Bear case for the short.** Most crowded macro short; a 28-Oct Fed hold squeezes it; ~36% of supply staked (~43.7M ETH) [VERIFIED]; ETH/BTC at cycle lows is where reversals start; Tom Lee-style H2 bull calls exist.
- **Invalidation.** ETF inflows >$200M/week; ETH/BTC >0.032 for a week; BTC dominance -2 pts in a week.

### UNI (Uniswap) - LONG bias (low conviction)
- **Thesis.** Fee switch live via UNIfication (Dec-2025 vote): v2 + selected v3 pool fees → buy-and-burn; 100M UNI retro burn (~$596M). 30d fees ~$123.8M, protocol revenue ~$9.76M, TVL ~$3.9B; price ~$7.1-7.4, mcap ~$4.4-4.6B. [VERIFIED] DefiLlama page, MetaMask 13-Oct, Startup Fortune.
- **Value accrual.** Yes now (burn). [ESTIMATE] ~$117M/yr protocol revenue → ~38x mcap/revenue.
- **Bear case.** Fell to a cycle low in Aug-2026 *after* burns began; activation dates and burn run-rate conflict across sources (Jul/Aug 2026, $26M-$250M/yr); DEX fee compression; perp-DEX rotation.
- **Invalidation.** 30d protocol revenue <$5M; governance cuts the share; break of the Aug low.

### ENA (Ethena) - SHORT bias
- **Thesis.** USDe supply ~$4.9B, down >65% from ~$15B peak; sUSDe ~5% as funding is neutral; incentives ended 1-Oct; last investor tranche (1.41B, ~14%) unlocked 5-Oct; ~3B ENA at StablecoinX (disposal needs foundation approval); buyback needs USDe ≥ $7.5B; fees ~$1.1M/day vs ~$2.8B mcap. [VERIFIED] TokenPost, DefiLlama ranking, MetaMask 8-Oct ($0.22).
- **Value accrual.** Promised but gated behind a milestone far from current supply → no.
- **Bear case for the short.** The basis trade re-ignites fast in risk-on (funding spike → yield → supply); one report cites a 20x squeeze from Sept lows [UNVERIFIED]; the StablecoinX overhang may never hit market.
- **Invalidation.** USDe +15% in two weeks; BTC/ETH funding >+0.03%/8h for a week; milestone reached/lowered.

### AAVE - LONG bias
- **Thesis.** TVL ~$18.2B; 30d fees ~$38.5M / protocol revenue ~$5.0M; Aavenomics 3.0 automated buybacks live 27-Jun-2026; burn under consideration (Kulechov, 29-Sep); price ~$158-167, mcap ~$2.4-2.6B. [VERIFIED] DefiLlama page, The Defiant, KuCoin flash.
- **Value accrual.** Yes (buybacks to reserve; burn not yet).
- **Bear case.** Buyback budget was *cut* $50M→$30M (Mar-2026) [VERIFIED]; [ESTIMATE] ~$60M/yr protocol revenue is thin vs TVL; AAVE is the backstop asset (Umbrella) in a bad-debt event; already +60% from June on headlines.
- **Invalidation.** Bad debt >$20M; buyback paused; 30d protocol revenue <$3M.

### BTC - anchor only (not tradable)
In the state so Jev reads the macro tape when judging the others.

### Rejected candidates
ALLO / HUMA / STABLE / KITE (Nov unlocks): venues too thin to short safely [SPECULATION]. Prediction-market, RWA and AI-agent tokens: no October flow data retrieved; would be narrative trades, which this system is not built to score.

## 3. Final check against the brief
- **Organic vs incentive-driven edge?** HYPE, UNI, AAVE edges are fee-driven (organic). MON/ENA shorts are supply/structure trades. SOL is an event trade. ETH is a flow trade.
- **Catalyst priced in?** Every catalyst here is public. The system does *not* rely on the catalyst; it relies on Jev scoring the tape around it and on asymmetric stop/target geometry. That is the honest claim.
- **Value accrual?** Yes: HYPE, UNI, AAVE. No: MON, ENA (which is why they are shorts). N/A: SOL, ETH.
- **Survives costs?** Targets are 500-1200 bps against ~5-15 bps round-trip costs plus modelled impact. The nightly review flags any setup where avg slippage > 30% of target.
- **Any hard limit delegated to a model?** No. `risk_state` from Jev is a *gate input*; the limits themselves are in `config/risk.yaml` and enforced by `RiskEngine` with approval-by-hash. The Brain's action set cannot increase risk.

## Sources (retrieved 2026-10-16 via web search; secondary unless noted)
- Fortune BTC price pages 13/16-Oct: https://fortune.com/article/price-of-bitcoin-10-16-2026/
- CoinDesk 15-Oct BTC <$81k, Fed uncertainty: https://www.coindesk.com/markets/2026/10/15/bitcoin-is-back-below-usd81-000-as-fed-rate-uncertainty-weighs
- Crypto Times 16-Oct recovery after CPI: https://cryptotimes.io/2026/10/16/crypto-price-today-bitcoin-and-ethereum-recover-modestly-after-inflation-driven-dip
- Bitcoin dominance 60% / altseason index: https://bitcoinfoundation.org/news/bitcoin/bitcoin-dominance-hits-60-as-crypto-sell-off-hammers-altcoins/ ; https://www.tv-hub.org/guide/bitcoin-dominance
- Stablecoins: https://cryptobriefing.com/usd-stablecoin-market-cap-303-billion/ ; https://crystalintelligence.com/stablecoin/who-moved-stablecoins-in-q3/ ; https://martyau79.substack.com/p/14oct2026-crypto-and-macro-liquidity (UNVERIFIED derivatives data)
- Fed: https://admiralmarkets.com/analytics/traders-blog/fed-rate-decision-october-2026 ; https://en.cryptonomist.ch/2026/10/15/bitcoin-fed-rate-uncertainty/
- Hyperliquid: https://247wallst.com/investing/cryptocurrency/2026/10/14/hyperliquid-has-bought-back-1-26-billion-of-its-own-token-ethereum-burns-its-fees-instead-which-one-holds-its-price-better/ ; https://cryptoticker.io/en/hyperliquid-buyback-usdc-earnings/ ; https://coinshares.com/insights/research-data/hyperliquid-primer-and-5-year-valuation-framework/ ; https://tokenomist.ai/hyperliquid
- Monad: https://www.tradingview.com/news/coinmarketcal:91bdeaee6094b:0-monad-mon-16-8b-token-unlock-24-nov-2026/ ; https://app.tokenomics.com/tokenomics/monad/unlocks ; https://cryptoticker.io/en/monad-mon-unlock-lock-up-expiry/ ; https://metamask.io/price/monad ; https://www.okx.com/en-us/orbit/insight/88842973815328
- Solana: https://decrypt.co/380974/solana-alpenglow-upgrade-date ; https://cryptobriefing.com/solanas-alpenglow-upgrade-targets-october-21-for-150ms-finality/ ; https://blockonomi.com/solana-alpenglow-upgrade-set-for-october-21-mainnet-launch ; https://invezz.com/news/2026/10/15/solana-has-lost-13-in-october-as-etf-outflows-hit-8-days-will-100-hold/
- Ethereum: https://phemex.com/blogs/ethereum-price-analysis-2026-eth-etf-staking-glamsterdam-upgrade ; https://www.datawallet.com/crypto/ethereum-staking-statistics-and-trends ; https://coincentral.com/crypto-etf-statistics-2026-aum-flows-and-market-rankings ; https://www.coingecko.com/en/coins/ethereum/btc
- Uniswap: https://defillama.com/protocol/uniswap ; https://startupfortune.com/uniswap-turned-on-real-fee-burns-and-uni-fell-to-a-cycle-low-anyway/ ; https://metamask.io/price/uniswap
- Ethena: https://www.tokenpost.com/news/business/24933 ; https://defillama.com/revenue ; https://metamask.io/price/ethena ; https://cryptorank.io/news/feed/045c3-standard-chartered-ena-usde-2028-target
- Aave: https://defillama.com/protocol/aave ; https://thedefiant.io/news/defi/aave-confirms-aavenomics-3-0-live-buybacks-dao-spending-cut ; https://www.kucoin.com/news/flash/aave-considers-token-burn-pump-continues-buybacks-where-do-repurchased-tokens-go
- Q4 unlock calendar: https://www.kucoin.com/news/flash/cryptorank-q4-sees-major-token-unlocks-for-multiple-projects-mon-leads-with-521m-value
- Jev / TypeSafe: https://openrouter.ai/typesafe/jev-1.13 ; https://infoq.com/news/2026/10/typesafe-ai-jev-released ; typesafe-sdk 0.7.5 on PyPI (inspected directly)
