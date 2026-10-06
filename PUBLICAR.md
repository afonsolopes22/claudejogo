# Tudo o que falta para publicar na App Store

Ordem recomendada. Marca cada caixa quando estiver feito.

---

## 0. Guardar o trabalho (agora, no teu PC)
- [ ] `git push -u origin mega-jogo`
- [ ] `git checkout main` → `git merge mega-jogo` → `git push origin main` → `git checkout mega-jogo`
- [ ] Confirmar que `afonsolopes22.github.io/claudejogo/` mostra a versão nova

## 1. Nome do jogo (feito: Cue Legends)
"8 Ball Pool" é marca registada da Miniclip, por isso o jogo chama-se **Cue Legends**.
- [x] Nome trocado em `index.html`, `manifest.json`, `capacitor.config.json` (`appName`), `package.json` e `privacy.html`
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

## 4. Correções de código (colar no Claude Code)
```
Correções antes de publicar:
1. Remove o bloco window.__pool / modo debug do build de produção.
2. Corrige a imagem promocional da loja (lista cortada a meio de um cartão)
   e a legenda "Mesa Neon" para não prometer o que não mostra.
3. Ícone 1024 sem moldura quadrada fina (o iOS arredonda os cantos).
4. Guarda em tools/ os scripts que geram ícones e capturas.
Commit e pára.
```

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
  npm install
  npx cap add ios
  npm run ios
  ```
- [ ] No Xcode: em Signing & Capabilities, escolher a tua equipa (conta Apple Developer)
- [ ] Adicionar a capability **In-App Purchase**
- [ ] Em Deployment Info: só **iPhone** e só **Landscape** (no Xcode marcar apenas **Landscape Left** e **Landscape Right**; desmarcar Portrait e Upside Down)
- [ ] No `Info.plist`, acrescentar:
  - `GADApplicationIdentifier`: o ID da APP no AdMob (`ca-app-pub-XXXX~YYYY`)
  - `NSUserTrackingUsageDescription`: "Usamos este identificador para mostrar anúncios mais relevantes e manter o jogo gratuito."
  - `SKAdNetworkItems`: a lista da Google (developers.google.com/admob/ios/ios14)

## 7. AdMob a sério
- [ ] Criar a app iOS no AdMob e 3 blocos de anúncios: Banner, Intersticial e Recompensa
- [ ] Trocar os IDs de **teste** em `Monet.ids` (`index.html`) pelos reais, **só no build que vai para a loja**
- [ ] **Consentimento GDPR (obrigatório em Portugal e na UE)**: no AdMob, Privacidade e mensagens, criar uma mensagem GDPR. A app tem de a mostrar antes dos anúncios (o plugin AdMob do Capacitor suporta-o com `requestConsentInfo` / `showConsentForm`).
- [ ] Mensagem ATT da Apple (pedido de rastreio) antes de carregar anúncios (`AdMob.trackingAuthorizationStatus` / `requestTrackingAuthorization`)
- [ ] **Nunca clicar nos teus anúncios reais.** Para testar, usa IDs de teste ou regista o teu iPhone como dispositivo de teste.

## 8. Produtos de compra (App Store Connect → a tua app → Compras na app)
| ID do produto | Tipo | Preço |
|---|---|---|
| `coins_1000` | Consumível | 0,99 € |
| `coins_6000` | Consumível | 4,99 € |
| `coins_15000` | Consumível | 9,99 € |
| `starter_pack` | Consumível (oferta única no jogo) | 0,99 € |
| `remove_ads` | Não consumível | 2,99 € |

Confirma os IDs exatos no `MONETIZACAO.md` atualizado. Os do jogo e os da loja têm de ser iguais.
- [ ] Cada produto precisa de nome, descrição e uma captura de ecrã da loja do jogo (para a revisão)
- [ ] Criar uma conta **Sandbox** (Utilizadores e acesso → Sandbox) para testar compras sem pagar

## 9. Ficha da App Store
Ver `LOJA-TEXTOS.md` para os textos prontos.
- [ ] Nome, subtítulo, descrição, palavras-chave
- [ ] Categoria: **Jogos → Desporto** (secundária: Casual)
- [ ] Capturas de ecrã 6,7" (já existem em `store-assets/`, mas refazer se mudares o nome)
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
