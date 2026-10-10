// Testes da Fase 12 (consentimento UMP + ATT) com um AdMob simulado. Correr: node tools/test-fase12.js
const { chromium } = require('playwright-core');
const url = require('url').pathToFileURL(require('path').join(__dirname, '..', 'index.html')).href + '?debug&lang=pt';
const results = []; const ok = (name, cond, d) => { results.push([name, !!cond, d]); console.log((cond ? 'PASS ' : 'FAIL ') + name + (d ? '  -> ' + d : '')); };

// plugin AdMob simulado: regista cada chamada (nome + opções) e responde conforme window.__cfg
const MOCK = (cfg, noPriv) => `
window.__cfg = ${JSON.stringify(cfg)}; window.__calls = [];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const rec = (n, a) => { window.__calls.push({ n, a: a || null, t: Date.now() }); };
const __ad = { isNativePlatform: () => true, Plugins: { AdMob: {
  async requestConsentInfo(o) { rec('requestConsentInfo', o); if (__cfg.hang) return new Promise(() => {}); if (__cfg.throwUmp) throw new Error('offline'); const got = window.__got; const st = got ? 'OBTAINED' : __cfg.ump; return { status: st, isConsentFormAvailable: !!__cfg.form, canRequestAds: st !== 'REQUIRED', privacyOptionsRequirementStatus: (st === 'OBTAINED' || __cfg.privOpts) ? 'REQUIRED' : 'NOT_REQUIRED' }; },
  async showPrivacyOptionsForm() { rec('showPrivacyOptionsForm'); await sleep(50); },
  async showConsentForm() { rec('showConsentForm'); await sleep(__cfg.formMs || 0); window.__got = !__cfg.refuse; return { status: 'OBTAINED', isConsentFormAvailable: true, canRequestAds: !__cfg.refuse }; },
  async resetConsentInfo() { rec('resetConsentInfo'); window.__got = false; },
  async trackingAuthorizationStatus() { rec('trackingAuthorizationStatus'); if (__cfg.noAtt) throw new Error('unimplemented'); return { status: __cfg.att || 'notDetermined' }; },
  async requestTrackingAuthorization() { rec('requestTrackingAuthorization'); return { status: __cfg.attAnswer || 'authorized' }; },
  async initialize(o) { rec('initialize', o); await sleep(__cfg.initMs || 0); rec('initialized'); },
  async showBanner(o) { rec('showBanner', o); }, async resumeBanner() { rec('resumeBanner'); }, async hideBanner() { rec('hideBanner'); }, async removeBanner() { rec('removeBanner'); },
  async prepareInterstitial(o) { rec('prepareInterstitial', o); }, async showInterstitial() { rec('showInterstitial'); },
  async prepareRewardVideoAd(o) { rec('prepareRewardVideoAd', o); }, async showRewardVideoAd() { rec('showRewardVideoAd'); return { amount: 1 }; }
} } };
if (${!!noPriv}) delete __ad.Plugins.AdMob.showPrivacyOptionsForm; window.Capacitor = __ad;`;

(async () => {
  const br = await chromium.launch({ executablePath: process.env.EDGE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  const mk = async (cfg, size = { width: 844, height: 390 }, noPriv) => {
    const ctx = await br.newContext({ viewport: size, hasTouch: true, isMobile: true });
    const page = await ctx.newPage(); page.errs = []; page.on('pageerror', e => page.errs.push(String(e))); page.on('console', m => { if (m.type() === 'error') page.errs.push(m.text()); });
    if (cfg) await page.addInitScript(MOCK(cfg, noPriv));
    await page.goto(url); return { ctx, page };
  };
  const calls = page => page.evaluate(() => window.__calls.map(c => c.n));
  const names = async page => (await calls(page)).join(',');

  // A) UE: formulário UMP, depois ATT, depois AdMob — e nada antes de a resposta chegar
  let { ctx, page } = await mk({ ump: 'REQUIRED', form: true, formMs: 1500, att: 'notDetermined', attAnswer: 'authorized' });
  await page.waitForTimeout(1300);
  let n = await names(page);
  ok('A: com o formulário aberto ainda não há ATT, initialize nem banner', n === 'requestConsentInfo,showConsentForm', n);
  await page.waitForTimeout(2200);
  n = await names(page);
  ok('A: ordem UMP → ATT → initialize → banner', n === 'requestConsentInfo,showConsentForm,trackingAuthorizationStatus,requestTrackingAuthorization,initialize,initialized,showBanner', n);
  let st = await page.evaluate(() => ({ canAds: __pool.Consent.canAds, npa: __pool.Consent.npa, banner: __calls.find(c => c.n === 'showBanner').a, init: __calls.find(c => c.n === 'initialize').a }));
  ok('A: consentimento obtido + ATT autorizado → anúncios personalizados (npa=false)', st.canAds && !st.npa && st.banner.npa === false && st.init.initializeForTesting === true && st.init.requestTrackingAuthorization === false, JSON.stringify(st));
  ok('A: sem erros', page.errs.length === 0, page.errs.join('|'));
  // anúncios a pedido levam o npa
  await page.evaluate(() => { __pool.save.noAds = false; __pool.save.playSec = 9999; __pool.save.adCount = 9; __pool.save.lastAdAt = 0; });
  await page.evaluate(() => __pool.Monet.interstitial());
  const adCalls = await page.evaluate(() => __calls.filter(c => c.n === 'prepareInterstitial').map(c => c.a.npa));
  ok('A: intersticial pedido com npa=false', adCalls.length === 1 && adCalls[0] === false, JSON.stringify(adCalls));
  await ctx.close();

  // B) ATT recusado → anúncios não personalizados
  ({ ctx, page } = await mk({ ump: 'NOT_REQUIRED', form: false, att: 'notDetermined', attAnswer: 'denied' }));
  await page.waitForTimeout(2500);
  n = await names(page);
  ok('B: fora da UE não há formulário UMP; ATT é pedido', n === 'requestConsentInfo,trackingAuthorizationStatus,requestTrackingAuthorization,initialize,initialized,showBanner', n);
  st = await page.evaluate(() => ({ npa: __pool.Consent.npa, banner: __calls.find(c => c.n === 'showBanner').a.npa, label: __pool.Consent.label() }));
  ok('B: ATT recusado → npa=true no banner e rótulo "não personalizados"', st.npa && st.banner === true && st.label === 'priv.npa', JSON.stringify(st));
  await page.evaluate(() => { __pool.save.noAds = false; return __pool.Monet.rewarded(); });
  const rw = await page.evaluate(() => __calls.filter(c => c.n === 'prepareRewardVideoAd').map(c => c.a.npa));
  ok('B: vídeo recompensado pedido com npa=true', rw.length === 1 && rw[0] === true, JSON.stringify(rw));
  await ctx.close();

  // B2) ATT já decidido antes: não volta a perguntar
  ({ ctx, page } = await mk({ ump: 'NOT_REQUIRED', att: 'authorized' }));
  await page.waitForTimeout(2200);
  n = await names(page);
  ok('B2: ATT já autorizado → não repete o pedido', n === 'requestConsentInfo,trackingAuthorizationStatus,initialize,initialized,showBanner', n);
  await ctx.close();

  // C) o jogador recusa o consentimento → zero anúncios
  ({ ctx, page } = await mk({ ump: 'REQUIRED', form: true, refuse: true }));
  await page.waitForTimeout(2300);
  n = await names(page);
  ok('C: consentimento recusado → sem ATT, sem initialize, sem banner', n === 'requestConsentInfo,showConsentForm', n);
  const c1 = await page.evaluate(async () => { __pool.save.noAds = false; __pool.save.playSec = 9999; __pool.save.adCount = 9; __pool.save.lastAdAt = 0; await __pool.Monet.interstitial(); const r = await __pool.Monet.rewarded(); const coins0 = __pool.save.coins; await __pool.Monet.watchCoins(); return { r, coinsSame: __pool.save.coins === coins0, calls: __calls.map(c => c.n), label: __pool.Consent.label() }; });
  ok('C: intersticial e vídeo não pedem anúncios nem dão moedas; rótulo "sem anúncios"', c1.r === false && c1.coinsSame && !c1.calls.some(x => /prepare|show(Interstitial|RewardVideo)|initialize|showBanner/.test(x)) && c1.label === 'priv.none', JSON.stringify(c1));
  await page.evaluate(() => { __pool.Monet.banner(true); __pool.Monet.banner(false); });
  ok('C: banner(on/off) não toca no AdMob sem consentimento', !(await names(page)).includes('resumeBanner') && !(await names(page)).includes('hideBanner'));
  ok('C: sem erros', page.errs.length === 0, page.errs.join('|'));
  await ctx.close();

  // D) sem rede (UMP falha): sem anúncios, jogo ok, e volta a tentar ao fim de 1 min
  ({ ctx, page } = await mk({ throwUmp: true }));
  await page.waitForTimeout(2200);
  st = await page.evaluate(() => ({ s: __pool.Consent.status, c: __pool.Consent.canAds, n: __calls.map(c => c.n).join() }));
  ok('D: erro do UMP → sem anúncios, sem initialize, sem rebentar', st.s === 'ERROR' && !st.c && st.n === 'requestConsentInfo' && page.errs.length === 0, JSON.stringify(st));
  await page.evaluate(() => { __cfg.throwUmp = false; __cfg.ump = 'NOT_REQUIRED'; __cfg.att = 'authorized'; });
  await page.evaluate(() => __pool.Monet.rewarded());   // dentro de 1 min: não volta a tentar
  ok('D: antes de 1 min não repete o pedido', (await page.evaluate(() => __calls.filter(c => c.n === 'requestConsentInfo').length)) === 1);
  await page.evaluate(() => { __pool.Consent._t -= 61000; });
  await page.evaluate(() => __pool.Monet.rewarded());
  st = await page.evaluate(() => ({ c: __pool.Consent.canAds, prep: __calls.filter(c => c.n === 'prepareRewardVideoAd').length }));
  ok('D: passado 1 min repete o pedido e, já com consentimento, o vídeo passa a funcionar', st.c && st.prep === 1, JSON.stringify(st));
  await ctx.close();

  // E) plugin sem ATT (Android/versão antiga): UMP funciona e anúncios iniciam sem ATT
  ({ ctx, page } = await mk({ ump: 'NOT_REQUIRED', noAtt: true }));
  await page.waitForTimeout(2200);
  n = await names(page);
  ok('E: sem API de ATT → segue para initialize/banner, npa=false', n === 'requestConsentInfo,trackingAuthorizationStatus,initialize,initialized,showBanner' && !(await page.evaluate(() => __pool.Consent.npa)) && page.errs.length === 0, n);
  await ctx.close();

  // F) web: nada de consentimento, botão escondido, anúncios simulados intactos
  ({ ctx, page } = await mk(null));
  await page.waitForTimeout(1800);
  await page.evaluate(() => document.getElementById('btnSettings').click()); await page.waitForTimeout(300);
  st = await page.evaluate(() => ({ hid: getComputedStyle(document.getElementById('setPriv')).display, canAds: __pool.Consent.canAds, nat: __pool.Monet.native }));
  ok('F: na web o botão de privacidade está escondido e não há consentimento', st.hid === 'none' && !st.canAds && !st.nat && page.errs.length === 0, JSON.stringify(st));
  await ctx.close();

  // G) Definições: botão visível na app, volta a perguntar, e cabe em todos os tamanhos / idiomas
  ({ ctx, page } = await mk({ ump: 'REQUIRED', form: true, att: 'denied' }));
  await page.waitForTimeout(2300);
  await page.evaluate(() => document.getElementById('btnSettings').click()); await page.waitForTimeout(300);
  const lab = await page.evaluate(() => document.getElementById('setPriv').textContent);
  ok('G: botão visível na app com o estado atual', /Anúncios: não personalizados/.test(lab), lab);
  await page.evaluate(() => { __calls.length = 0; document.getElementById('setPriv').click(); }); await page.waitForTimeout(900);
  n = await names(page);
  ok('G: carregar no botão abre o formulário de opções de privacidade (sem apagar a escolha) e volta a ler o estado', n.startsWith('requestConsentInfo,showPrivacyOptionsForm,removeBanner,requestConsentInfo') && n.endsWith('showBanner') && !n.includes('resetConsentInfo'), n);
  const toastTxt = await page.evaluate(() => document.getElementById('toast') ? document.getElementById('toast').textContent : '');
  ok('G: depois de o formulário aparecer o aviso diz "Escolha guardada"', /Escolha guardada/.test(toastTxt), toastTxt);
  await ctx.close();
  // G2) fora da UE: nada a rever → não reabre nada, avisa (e, com ATT recusado, diz onde mudar)
  ({ ctx, page } = await mk({ ump: 'NOT_REQUIRED', att: 'denied' }));
  await page.waitForTimeout(2200);
  await page.evaluate(() => { __calls.length = 0; document.getElementById('btnSettings').click(); document.getElementById('setPriv').click(); }); await page.waitForTimeout(500);
  n = await names(page);
  ok('G2: sem opções de privacidade → não mostra formulário nem apaga consentimento', !/showPrivacyOptionsForm|resetConsentInfo|showConsentForm/.test(n), n);
  ok('G2: ATT recusado → aviso aponta para as Definições do iPhone', /Rastreio/.test(await page.evaluate(() => document.getElementById('toast').textContent)));
  await ctx.close();
  // G3) plugin sem showPrivacyOptionsForm (versão antiga): volta a perguntar com reset, só se havia consentimento a rever
  ({ ctx, page } = await mk({ ump: 'REQUIRED', form: true, att: 'authorized' }, undefined, true));
  await page.waitForTimeout(2300);
  await page.evaluate(() => { __calls.length = 0; document.getElementById('btnSettings').click(); document.getElementById('setPriv').click(); }); await page.waitForTimeout(700);
  n = await names(page);
  ok('G3: sem API oficial → reset + nova pergunta', n.startsWith('resetConsentInfo,removeBanner,requestConsentInfo,showConsentForm'), n);
  await ctx.close();
  // H) primeiro anúncio logo a seguir ao consentimento espera pelo initialize
  ({ ctx, page } = await mk({ ump: 'NOT_REQUIRED', att: 'authorized', initMs: 1200 }));
  await page.waitForTimeout(1300);
  await page.evaluate(() => { __pool.save.noAds = false; __pool._r = __pool.Monet.rewarded(); });
  await page.waitForTimeout(2600);
  n = await names(page);
  ok('H: vídeo pedido durante a inicialização só avança depois de initialized', n.indexOf('initialized') > -1 && n.indexOf('initialized') < n.indexOf('prepareRewardVideoAd'), n);
  await ctx.close();
  // I) banner criado mais tarde se o consentimento chegou fora do menu; e removido ao rever
  ({ ctx, page } = await mk({ ump: 'NOT_REQUIRED', att: 'authorized' }));
  await page.waitForTimeout(2200);
  await page.evaluate(() => { __pool.save.noAds = false; __calls.length = 0; __pool.Monet.bannerReset(); __pool.Monet.banner(true); });
  n = await names(page);
  ok('I: bannerReset remove e banner(true) cria de novo com as opções atuais', n === 'removeBanner,showBanner', n);
  await ctx.close();
  // J) plugin que nunca responde: não prende os anúncios nem o jogo
  ({ ctx, page } = await mk({ hang: true }));
  await page.waitForTimeout(1200);
  const t0 = Date.now();
  const jr = await page.evaluate(async () => { __pool.save.noAds = false; const r = await __pool.Monet.rewarded(); return { r, st: __pool.Consent.status, busy: __pool.Monet._adBusy }; });
  ok('J: requestConsentInfo pendurado → passados ~10 s dá erro tratado e liberta _adBusy', jr.r === false && jr.st === 'ERROR' && !jr.busy && Date.now() - t0 < 14000 && page.errs.length === 0, JSON.stringify(jr) + ' ' + (Date.now() - t0) + 'ms');
  await ctx.close();
  for (const [w, h] of [[844, 390], [932, 430], [740, 360], [1180, 820]]) for (const lang of ['pt', 'en']) for (const lefty of [false, true]) {
    ({ ctx, page } = await mk({ ump: 'NOT_REQUIRED', att: 'denied' }, { width: w, height: h }));
    await page.waitForTimeout(1500);
    const r = await page.evaluate(({ lang, lefty }) => {
      __pool.save.lefty = lefty; document.body.classList.toggle('lefty', lefty); document.querySelector('#setLang [data-lang=' + lang + ']').click ? 0 : 0;
      document.getElementById('btnSettings').click();
      document.querySelector('#setLang [data-lang=' + lang + ']').click();
      const bt = document.getElementById('setPriv'), ov = document.getElementById('settings'), ovc = ov.querySelector('.ovc'), out = [];
      const b = bt.getBoundingClientRect(), sc = bt.scrollHeight > bt.clientHeight + 1 || bt.scrollWidth > bt.clientWidth + 1;
      if (sc) out.push('texto cortado');
      if (b.width < 40 || b.height < 40) out.push('botão pequeno ' + b.width + 'x' + b.height);
      // sobreposição com outros botões da lista
      for (const o of document.querySelectorAll('#settings .setlist button')) if (o !== bt && getComputedStyle(o).display !== 'none') { const q = o.getBoundingClientRect(); if (b.left < q.right - 1 && q.left < b.right - 1 && b.top < q.bottom - 1 && q.top < b.bottom - 1) out.push('sobrepõe ' + o.id); }
      // dentro da área rolável: alcançável por scroll
      ovc.scrollTop = ovc.scrollHeight; const b2 = bt.getBoundingClientRect(); if (b2.bottom > innerHeight + 1 || b2.right > innerWidth + 1 || b2.left < -1) out.push('fora do ecrã mesmo a rolar');
      return out;
    }, { lang, lefty });
    ok(`G: layout ${w}x${h} ${lang}${lefty ? ' canhoto' : ''} sem problemas`, r.length === 0 && page.errs.length === 0, r.join('; ') + page.errs.join('|'));
    await ctx.close();
  }

  const fails = results.filter(r => !r[1]).length;
  console.log('\n' + (fails ? 'HÁ FALHAS: ' + fails : 'TUDO PASS') + ' (' + results.length + ' testes)');
  await br.close(); process.exitCode = fails ? 1 : 0;
})();
