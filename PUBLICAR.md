# Tudo o que falta para publicar na App Store

Ordem recomendada. Marca cada caixa quando estiver feito.

---

> ⚠️ **Antes de publicares a política de privacidade:** preenche os campos `[…]` do `privacy.html` (nome do programador, data, email). O consentimento GDPR (UMP) e o pedido ATT já estão implementados no código (`Consent` em `js/core.js`), mas **só foram testados com um AdMob simulado**: falta confirmá-los num iPhone real (ponto 7).

## 0. Guardar o trabalho (agora, no teu PC)
- [ ] `git push origin mega-jogo`
- [ ] `git checkout main` → `git merge mega-jogo` → `git push origin main` → `git checkout mega-jogo`
- [ ] Confirmar que `afonsolopes22.github.io/claudejogo/` mostra a versão nova (o jogo agora tem `index.html` + `css/` + `js/`; o GitHub Pages serve tudo)

## 1. Nome do jogo (feito: Cue Legends)
"8 Ball Pool" é marca registada da Miniclip, por isso o jogo chama-se **Cue Legends**.
- [x] Nome trocado em `index.html`, `js/i18n.js`, `manifest.json`, `capacitor.config.json` (`appName`), `package.json` e `privacy.html`
- [x] `appId` = `com.afonsolopes.cuelegends` (depois de publicado não se pode mudar)
- [ ] Pesquisar "Cue Legends" na App Store para confirmar que o nome está livre
- [ ] Em `privacy.html` preencher `[NOME DO PROGRAMADOR]` e `[DATA]`
- Nota técnica: as chaves internas `pool8_save_v1` e `pool8_debug` mantêm-se para não apagar os progressos já guardados.

## 2. Evitar a classificação de "jogo de azar"
Inscrições e recompensas em moedas podiam ser classificadas como "jogo de azar simulado".
Isso sobe a idade mínima e afasta jogadores.
- [x] Botão "Jogar a dinheiro" → "Jogar"
- [x] Sem palavras de casino/aposta nos textos ("Entrada/Prémio" → "Inscrição/Recompensa"; "Vermelho Casino" → "Vermelho Rubi")
- [ ] As moedas nunca podem ser trocadas por dinheiro real (já é assim)

## 3. Testar num telemóvel real
- [ ] A mira e a barra de força respondem bem ao dedo
- [ ] Corre fluido, sem engasgos
- [ ] Há som (no iPhone, tira o modo silencioso)
- [ ] Nada fica escondido pelo entalhe do ecrã nem pela barra de baixo
- [ ] O tutorial, uma partida, um desafio, a loja e a pausa funcionam
- [ ] "Adicionar ao ecrã principal" funciona e o jogo abre sem internet

## 4. Estado do código
- [x] Ícone 1024 sem moldura quadrada; imagens da loja em paisagem 2796×1290 (capturas reais do jogo, sem legendas que prometam o que não se vê)
- [x] Scripts em `tools/` (ícones, imagens da loja, mesas semanais, solver, testes) e `tests/physics.html` (33 testes de física)
- [ ] **Remover o bloco de depuração do build nativo**: em `js/main.js`, o objeto `window.__pool = {...}` só existe com `?debug` ou `localStorage.pool8_debug`. No build para a loja apaga esse bloco (ou garante que nunca há `?debug`).
- [x] Consentimento GDPR (UMP) e pedido ATT: **implementados** (`Consent`, `js/core.js`). Falta criar a mensagem GDPR no AdMob e confirmar o fluxo num iPhone real (ver ponto 7).
- [ ] Antes de cada publicação web, muda `CACHE` em `sw.js` (agora `cuelegends-v7`) e, se criares ficheiros novos, acrescenta-os a `ASSETS`.

## 5. Contas (só tu podes criar)
- [ ] **Apple Developer Program**: developer.apple.com/programs, 99 $/ano. Como particular basta o Apple ID com verificação em 2 passos.
- [ ] **App Store Connect**: em "Acordos, impostos e banca", aceitar o acordo de **Apps pagas** e preencher dados bancários e fiscais. Sem isto as compras não funcionam e não recebes dinheiro.
- [ ] **AdMob**: admob.google.com, com a mesma conta Google. Preencher dados de pagamento e fiscais.
- [ ] (Opcional) **Google Play Console**: 25 $ uma vez, para Android também.

## 6. Mac (obrigatório para iOS)
Precisas de um Mac (pode ser emprestado ou alugado na nuvem, ex. MacinCloud).
- [ ] Instalar Xcode (App Store do Mac), Node.js e Git
- [ ] No Terminal:
  ```
  git clone https://github.com/afonsolopes22/claudejogo
  cd claudejogo
  npm install          # inclui @capacitor/haptics (vibração nativa no iPhone)
  npx cap add ios
  npm run ios          # copia index.html, css/, js/, icons/ para www/ e abre o Xcode
  ```
  (`npm run build` usa `mkdir`/`cp`: corre num Mac/Linux.)
- [ ] No Xcode: em Signing & Capabilities, escolher a tua equipa (conta Apple Developer)
- [ ] Adicionar a capability **In-App Purchase**
- [ ] Em Deployment Info: só **iPhone** e só **Landscape** (no Xcode marcar apenas **Landscape Left** e **Landscape Right**; desmarcar Portrait e Upside Down)
- [ ] No `Info.plist`, acrescentar:
  - `GADApplicationIdentifier`: o ID da APP no AdMob (`ca-app-pub-XXXX~YYYY`)
  - `NSUserTrackingUsageDescription`: "Usamos este identificador para mostrar anúncios mais relevantes e manter o jogo gratuito."
  - `SKAdNetworkItems`: a lista da Google (developers.google.com/admob/ios/ios14)

## 7. AdMob a sério
- [ ] Criar a app iOS no AdMob e 3 blocos de anúncios: Banner, Intersticial e Recompensa
- [ ] Trocar os IDs de **teste** em `Monet.ids` (`js/core.js`) pelos reais **e** pôr `ADS_TEST = false` (mesmo ficheiro), **só no build que vai para a loja**
- [ ] **Consentimento GDPR (obrigatório em Portugal e na UE)**: no AdMob, Privacidade e mensagens, **criar a mensagem GDPR** (sem ela o formulário não aparece). A app já a pede antes de qualquer anúncio (`requestConsentInfo` / `showConsentForm`) e, sem consentimento válido, não pede anúncios nem dá moedas por vídeo. O botão **Definições › Privacidade e anúncios** deixa o jogador rever a escolha.
- [ ] Mensagem ATT da Apple: **já é pedida no código**, depois do UMP e só se o consentimento permitir anúncios; se o jogador recusar, os anúncios saem não personalizados (`npa`). Confirmar num iPhone real que aparece com o texto de `NSUserTrackingUsageDescription`.
- [ ] **Nunca clicar nos teus anúncios reais.** Para testar, usa IDs de teste ou regista o teu iPhone como dispositivo de teste.

## 8. Produtos de compra (App Store Connect → a tua app → Compras na app)
| ID do produto | Tipo | Preço |
|---|---|---|
| `coins_1000` | Consumível | 0,99 € |
| `coins_6000` | Consumível | 4,99 € |
| `coins_15000` | Consumível | 9,99 € |
| `starter_pack` | **Não consumível** (oferta única no jogo) | 0,99 € |
| `remove_ads` | Não consumível | 2,99 € |

Confirma os IDs exatos no `MONETIZACAO.md` atualizado. Os do jogo e os da loja têm de ser iguais.
- [ ] Cada produto precisa de nome, descrição e uma captura de ecrã da loja do jogo (para a revisão)
- [ ] Criar uma conta **Sandbox** (Utilizadores e acesso → Sandbox) para testar compras sem pagar

## 9. Ficha da App Store
Ver `LOJA-TEXTOS.md` para os textos prontos.
- [ ] Nome, subtítulo, descrição, palavras-chave
- [ ] Categoria: **Jogos → Desporto** (secundária: Casual)
- [ ] Capturas de ecrã em **paisagem** 2796×1290 (6,9"/6,7"): já existem em `store-assets/screenshot-1..5.png`; refaz com `node tools/gen_promos.js` se mudares o visual
- [ ] Ícone 1024x1024 (já existe)
- [ ] **URL da política de privacidade**: `https://afonsolopes22.github.io/claudejogo/privacy.html` (preencher primeiro os campos entre [ ] no ficheiro)
- [ ] **URL de suporte**: pode ser a mesma página, ou um email de contacto
- [ ] **Questionário de classificação etária**: violência nenhuma; "jogo de azar simulado" responder com sinceridade (se seguiste o ponto 2, deve ser "Nenhum")
- [ ] **Privacidade da app (rótulos de dados)**, com AdMob:
  - Dados usados para rastrear: **Identificadores (ID do dispositivo/IDFA)**, **Dados de utilização (interação com anúncios)**
  - Dados não associados a ti: **Diagnóstico**, **Dados de compras**
  - (Confirmar com a página da Google: "AdMob - Apple privacy details")

## 10. Testar e submeter
- [ ] No Xcode: Product → Archive → Distribute App → App Store Connect
- [ ] **TestFlight**: instalar no teu iPhone e testar:
  - [ ] Anúncios aparecem (com dispositivo de teste)
  - [ ] Mensagens GDPR e ATT aparecem antes dos anúncios
  - [ ] Compras sandbox funcionam e dão as moedas
  - [ ] "Remover anúncios" remove o banner e os intersticiais
  - [ ] "Restaurar compras" devolve o "Remover anúncios" depois de reinstalar
- [ ] Submeter para revisão (demora normalmente 1 a 3 dias)

### Motivos comuns de rejeição
- Nome ou ícone parecido com outro jogo (ver ponto 1)
- Botão "Restaurar compras" em falta (já existe)
- Compras que não funcionam durante a revisão (acordo de Apps pagas por assinar)
- Política de privacidade em falta ou incompleta
- Anúncios antes do pedido ATT
- App que parece só um site embrulhado: o jogo funciona offline, e isso ajuda

### Verificar num iPhone real (nada disto foi testado em dispositivo)
- [ ] Vibração (Capacitor Haptics): tacada, caçapa, falta, vitória; e o interruptor em Definições
- [ ] Partilhar GIF do replay (Web Share de ficheiros no WKWebView). Se não abrir a folha de partilha, usa o plugin **@capacitor/share** + **@capacitor/filesystem**
- [ ] Bloqueio em paisagem, entalhe/safe-area nos dois lados, modo canhoto
- [ ] Idioma: segue o do telemóvel (PT/EN) e muda em Definições
- [ ] Desempenho (60 fps) com a mesa Neon/Lendária e "Reduzir efeitos" ligado e desligado

## 11. Depois de publicar
- [ ] **Analytics** (Firebase): saber onde os jogadores desistem
- [ ] Ler as avaliações e corrigir depressa o que se queixam
- [ ] Atualizações regulares (novos desafios, tacos, eventos)
- [ ] Divulgar: TikTok/Reels com tacadas incríveis, grupos, amigos. Sem divulgação quase ninguém encontra a app.
- [ ] Versão Android no Google Play: mesmo código (`npx cap add android`)
- [ ] Mais tarde: multijogador online (precisa de servidor, com custos)

## Custos
| Item | Custo |
|---|---|
| Apple Developer | 99 $/ano |
| Mac (se não tiveres) | emprestado, ou ~20–30 $/mês na nuvem |
| Google Play (opcional) | 25 $ uma vez |
| AdMob, GitHub Pages | grátis |
| A Apple fica com | 15% das compras (programa para pequenas empresas, até 1 M$/ano) |
