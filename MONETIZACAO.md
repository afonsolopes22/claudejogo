# Monetização e publicação (8 Ball Pool)

Este documento descreve como a monetização funciona **no código atual** e o que falta fazer para publicar na App Store.
Tudo o que decide anúncios e compras está concentrado no objeto `Monet` em `index.html`.
Na web os anúncios e as compras são **simulados**; dentro da app (Capacitor) usam AdMob e compras Apple.

> **Moedas são só virtuais.** Não há dinheiro real em prémios, e convém manter assim (evita as regras de jogo a dinheiro).

---

## 1. O que está implementado

### Anúncios (`Monet.AD`, em `index.html`)
| Regra | Valor | Onde |
|---|---|---|
| Intersticial: tempo de jogo mínimo | 5 min acumulados (`save.playSec`) | `Monet.AD.minPlaySec` |
| Intersticial: frequência | no máximo 1 a cada 3 partidas/desafios | `Monet.AD.everyMatches` |
| Intervalo mínimo entre anúncios | 90 s (um vídeo recompensado também conta) | `Monet.AD.minGapMs` |
| Quando aparece | **só** nos botões do ecrã final (nunca a meio de partida, na pausa, no 2 jogadores nem a meio de um torneio) | `afterMatch()` → `Monet.maybeInterstitial()` |
| Quem não vê anúncios | quem comprou "Remover anúncios" | `save.noAds` |
| Vídeos de +150 moedas | 6 por dia (janela de 24 h) | `Monet.AD.videosPerDay` |
| Prémio dobrado | bónus máximo +500, 8 por dia | `Monet.AD.doubleCap`, `doublesPerDay` |

Vídeos com recompensa (a fonte principal): dobrar prémio no fim da partida/desafio, +150 moedas, **segunda oportunidade**
num desafio (+2 tacadas, uma vez por tentativa) e **baú grátis** de 4 em 4 horas (média ≈ 320 moedas), aberto com um vídeo.

### Produtos de compra (App Store Connect)
| ID do produto | Tipo | Preço no jogo | O que dá |
|---|---|---|---|
| `coins_1000` | Consumível | 0,99 € | 1000 moedas |
| `coins_6000` | Consumível | 4,99 € | 6000 moedas |
| `coins_15000` | Consumível | 9,99 € | 15000 moedas |
| `remove_ads` | Não consumível | 2,99 € | Sem banners nem intersticiais |
| `starter_pack` | Não consumível | 0,99 € | 2500 moedas + Taco Carbono + pano Turquesa (oferta única, mostrada depois da 3.ª partida) |

- Cada compra passa por `Monet.purchase(id)`: uma de cada vez e os não consumíveis não se repetem.
- "Restaurar compras" (`Monet.restore`) volta a ativar `remove_ads` e o `starter_pack` (sem repetir as moedas).
- Os preços exibidos são texto no código (`COIN_PACKS`, loja); o preço real vem da App Store Connect. **O ID `starter_pack` é novo e tem de ser criado.**

### Equilíbrio da economia (resumo da simulação)
Medido com 96 jogos reais (taxas de vitória por perfil e sala) + 300 jogadores simulados × 7 dias em 12 cenários, com o código real do jogo.
Mediana de moedas, jogador que **não paga** e **não vê vídeos**, 12 partidas/dia:

| Perfil | Fim do dia 1 | Fim do dia 7 |
|---|---|---|
| Novato (38% de vitórias no Bairro) | ≈ 1 550 | ≈ 1 950 |
| Médio (63%) | ≈ 3 250 | ≈ 4 600 |
| Bom (75%) | ≈ 2 800 | ≈ 12 000 |

Com vídeos (3 de +150, 2 baús e dobrar 50% das vitórias) o jogador médio chega a ≈ 5 700 no dia 1 e ≈ 9 100 no dia 7.
As entradas das salas funcionam como sumidouro de moedas; diário, missões e desafios são o rendimento grátis (≈ 0,5–1,3 mil/dia).
Os "jogadores" simulados são IA, não pessoas e estes números são **aproximados**: **volta a medir com jogadores reais** depois do lançamento.
Números ajustáveis: `MISSIONS`, `DAILY`, `CHEST`, `levelBonus()`, `lvlNeed()`, `ROOMS`, `TOUR`, `Monet.AD`.

---

## 2. Ficheiros do projeto
- `index.html` — o jogo (um só ficheiro). `manifest.json` + `sw.js` + `icons/` — PWA (instalável e offline na web).
- `store-assets/icon-1024.png` — ícone da App Store (1024×1024, RGB, **sem canal alfa**).
- `store-assets/screenshot-1..5.png` — 5 imagens promocionais 1290×2796 (iPhone 6,7"): capturas do jogo real, com legenda, em PNG RGB sem alfa. Revê-as antes de submeter: a Apple exige que a legenda corresponda ao que o ecrã mostra.
- `package.json` / `capacitor.config.json` — Capacitor. `npm run build` copia `index.html`, `manifest.json`, `sw.js` e `icons/` para `www/` (usa `mkdir`/`cp`, por isso corre num Mac/Linux, não no `cmd` do Windows).

---

## 3. O que só tu podes fazer
1. **Mac com Xcode** + conta **Apple Developer** (99 $/ano).
2. `npm install`, muda o `appId` em `capacitor.config.json` (hoje `com.TEUNOME.pool8`), `npx cap add ios`.
3. **AdMob** (admob.google.com): cria a app e 3 blocos (banner, intersticial, recompensa).
   Troca os IDs de **TESTE** em `Monet.ids` (`index.html`) pelos teus e acrescenta o `GADApplicationIdentifier` (ID da app AdMob) ao `Info.plist`.
   Nunca cliques nos teus próprios anúncios reais: dá ban.
4. **App Store Connect**: cria os 5 produtos da tabela acima (IDs exatamente iguais) e preenche contrato de apps pagas + dados bancários e fiscais.
5. Ícone: arrasta `store-assets/icon-1024.png` para o AppIcon do Xcode. Orientação: só horizontal — `UISupportedInterfaceOrientations` com `UIInterfaceOrientationLandscapeLeft` e `UIInterfaceOrientationLandscapeRight`.
6. `npm run ios`, testa com sandbox/TestFlight (compras, restaurar, anúncios de teste) e submete para revisão.

## 4. Checklist final de publicação
**Código e build**
- [ ] IDs de anúncios de teste trocados pelos reais (`Monet.ids`) — e só no build de produção.
- [ ] Os 5 produtos criados na App Store Connect (`coins_1000`, `coins_6000`, `coins_15000`, `remove_ads`, `starter_pack`) e aprovados/“Ready to Submit”.
- [ ] `appId` real e *bundle id* coerente com o Xcode.
- [ ] Hooks de teste desligados: `window.__pool` só existe com `?debug` no URL ou `localStorage.pool8_debug`. Confirma que o build nativo não os ativa (idealmente remove o bloco `window.__pool = {...}`).
- [ ] `sw.js`: o service worker não é registado no app nativo (só em `http(s)` na web). Muda `CACHE` (`pool8-v1`) quando publicares uma nova versão web.

**Privacidade e legal (exigido pela Apple)**
- [ ] Política de privacidade com URL público.
- [ ] Declaração de privacidade na App Store Connect (os anúncios recolhem identificadores/dados de uso).
- [ ] Pedido ATT: `NSUserTrackingUsageDescription` no `Info.plist` + chamada de autorização antes de personalizar anúncios.
- [ ] Consentimento (UMP/GDPR) para utilizadores no EEE/Reino Unido, se usares anúncios personalizados.
- [ ] `SKAdNetworkItems` no `Info.plist` (lista do AdMob).
- [ ] Classificação etária: responde com atenção às perguntas sobre jogos de azar simulados — o jogo tem entradas e prémios em moedas **virtuais**; confirma nas diretrizes da Apple (5.3) como se aplica.
- [ ] Botão "Restaurar compras" visível (já existe, na loja → Moedas).

**Loja**
- [ ] Ícone 1024×1024 sem transparência (`store-assets/icon-1024.png`).
- [ ] Capturas de ecrã: 5 de 1290×2796 já prontas. Se a app correr em iPad, faltam as de 12,9" (2048×2732) — ou limita a app a iPhone.
- [ ] Nome, subtítulo, descrição, palavras-chave, categoria (Jogos › Desporto/Cartas e Tabuleiro) e notas para a revisão.
- [ ] Testa num iPhone real: toque, áudio (sintetizado), vibração, orientação, notch/safe-area, 60 fps.

## 5. Ainda não foi testado
- Anúncios e compras **nativos** em dispositivo real (AdMob, `cordova-plugin-purchase`, `owned()` no restaurar).
- Áudio e vibração (os testes automáticos não têm som nem motor háptico).
- Desempenho em telemóvel real (medido só em emulação: ≈ 1,3–1,6 ms de JS por frame; o loop pára quando nada se mexe).

## Expectativas
Mais anúncios não é mais dinheiro: demasiados intersticiais baixam as notas e a retenção, e a Apple rejeita apps agressivas.
Receita real depende de milhares de jogadores por dia, por isso conta com marketing.
