# Publicar na App Store e ganhar dinheiro

O jogo (`index.html`) já tem moedas, salas, loja de tacos/panos, prémio diário, vídeos com recompensa,
intersticial a cada 3 partidas, banner, compra "Remover anúncios", pacotes de moedas e "Restaurar compras".
Na web os anúncios/compras são **simulados**. Dentro da app usam AdMob + compras Apple.

## O que só tu podes fazer
1. **Mac com Xcode** + conta **Apple Developer** (99 $/ano).
2. `npm install && npx cap add ios` (muda `appId` em `capacitor.config.json`).
3. **AdMob** (admob.google.com): cria a app e 3 blocos (banner, intersticial, recompensa).
   Troca os IDs de TESTE em `Monet.ids` (`index.html`) pelos teus e põe o `GADApplicationIdentifier`
   no `Info.plist`. Nunca cliques nos teus próprios anúncios reais: dá ban.
4. **App Store Connect**: cria os produtos `coins_1000`, `coins_6000`, `coins_15000` (consumíveis)
   e `remove_ads` (não consumível); contrato de apps pagas + dados bancários/fiscais.
5. `npm run ios`, testa com sandbox/TestFlight, submete para revisão.
6. Exigido pela Apple: política de privacidade (URL), declaração de privacidade (anúncios usam
   dados), pedido ATT (`NSUserTrackingUsageDescription`), botão Restaurar compras (já existe),
   classificação etária. Anúncios/compras nativos ainda não foram testados em dispositivo real.

## Expectativas
Mais anúncios não é mais dinheiro: demasiados intersticiais baixam notas e retenção, e a Apple
rejeita apps spammy. Receita real depende de milhares de jogadores/dia, por isso conta com
marketing. Moedas aqui são só virtuais (sem dinheiro real em prémios) — manter assim evita
regras de jogo a dinheiro.
