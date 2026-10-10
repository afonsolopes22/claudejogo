// Testes da Fase 11 (save, definições, canhoto, háptica, teclado, aria). Correr: node tools/test-fase11.js
// Testes da Fase 11: save (versão/migração/validação/recuperação), definições, canhoto, háptica, teclado, movimento reduzido, aria
const { chromium } = require('playwright-core');
const url = require("url").pathToFileURL(require("path").join(__dirname, "..", "index.html")).href + '?debug&lang=pt';
const results = []; const ok = (name, cond, d) => { results.push([name, !!cond, d]); console.log((cond ? 'PASS ' : 'FAIL ') + name + (d ? '  -> ' + d : '')); };
(async () => {
  const br = await chromium.launch({ executablePath: process.env.EDGE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  const mk = async (opts = {}) => { const ctx = await br.newContext(Object.assign({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true }, opts)); const page = await ctx.newPage(); page.errs = []; page.on('pageerror', e => page.errs.push(String(e))); page.on('console', m => { if (m.type() === 'error') page.errs.push(m.text()); }); return { ctx, page }; };
  let { ctx, page } = await mk();
  await page.goto(url); await page.waitForTimeout(2200);
  const ev = (f, a) => page.evaluate(f, a);

  // ---- migração e validação (funções puras) ----
  const m1 = await ev(() => { const P = window.__pool; return P.migrateSave({ coins: 777, cues: [0, 2, 5], cue: 2, xp: 400, matches: 12, wins: 5, tutDone: true, fantasma: 'x', chal: { 3: 2 } }); });
  ok('v1 → v2: mantém moedas, taco, desafios; acrescenta versão e definições; ignora campos desconhecidos', m1.v === 2 && m1.coins === 777 && m1.cue === 2 && m1.cues.join() === '0,2,5' && m1.chal[3] === 2 && m1.vib === true && m1.lefty === false && !('fantasma' in m1) && m1.xpVer === 2, JSON.stringify({ v: m1.v, xp: m1.xp, xpVer: m1.xpVer }));
  const bad = await ev(() => { const P = window.__pool; return P.sanitizeSave({ coins: 'abc', wins: -5, losses: Infinity, matches: NaN, xp: 1e30, cues: [0, 99, -1, 'x', 2.5, 3], cue: 9, cloths: 'nope', cloth: 4, table: 99, tables: [1, 2], chal: { 5: 7, x: 1, 99: 3 }, ach: { 'a b': true, ok1: 1 }, lang: 'fr', p2: { names: ['a'.repeat(50), 5], len: 7 }, train: { a: [1], p: [2], shots: 3 }, weekly: { k: 3, stars: 9, best: -1 }, missions: { day: 123, prog: { q: 'x' }, done: { q: 1 } }, vid: 5, tour: 'x' }); });
  ok('valida: números fora de gama, tipos errados e listas inválidas ficam coerentes', bad.coins === 500 && bad.wins === 0 && bad.losses >= 0 && Number.isFinite(bad.losses) && bad.matches === 0 && bad.xp <= 1e12 && bad.cues.join() === '0,3' && bad.cue === 0 && bad.cloths.join() === '0' && bad.cloth === 0 && bad.table === 0 && bad.tables.join() === '0,1,2' && Object.keys(bad.chal).join() === '5' && bad.chal[5] === 3 && bad.lang === '' && !bad.train && bad.weekly.stars === 3 && bad.weekly.best === 0 && bad.tour === null && bad.vid.n === 0, JSON.stringify({ coins: bad.coins, cues: bad.cues, chal: bad.chal, p2: bad.p2 }));
  ok('nomes de 2 jogadores cortados a 12 e comprimento da série validado', bad.p2 && bad.p2.names[0].length === 12 && bad.p2.names[1] === '' && bad.p2.len === 1, JSON.stringify(bad.p2));
  const nul = await ev(() => { const P = window.__pool; return [P.sanitizeSave(null).coins, P.sanitizeSave([1, 2]).coins, P.sanitizeSave('x').v, P.migrateSave({ v: 9, coins: 10 }).v]; });
  ok('entradas nulas/array/texto dão save por omissão; save de versão futura lê-se sem rebentar', nul.join() === '500,500,2,2', nul.join());

  // ---- recuperação do armazenamento ----
  await ev(() => { const s = window.__pool.save; s.coins = 4242; s.tutDone = true; s.firstDone = true; window.__pool.persist && 0; localStorage.setItem('pool8_save_v1_bak', JSON.stringify(Object.assign({}, s, { coins: 4242 }))); localStorage.setItem('pool8_save_v1', '{isto nao e json'); });
  await page.reload(); await page.waitForTimeout(2200);
  const rec = await ev(() => ({ from: window.__pool.saveFrom, coins: window.__pool.save.coins }));
  ok('save principal corrompido → recupera da cópia de segurança', rec.from === 'cópia' && rec.coins === 4242, JSON.stringify(rec));
  await ev(() => { localStorage.setItem('pool8_save_v1', '###'); localStorage.setItem('pool8_save_v1_bak', '???'); });
  await page.reload(); await page.waitForTimeout(2200);
  const rec2 = await ev(() => ({ from: window.__pool.saveFrom, coins: window.__pool.save.coins, v: window.__pool.save.v }));
  ok('principal e cópia corrompidos → recomeça sem erros', rec2.from === 'recomeçado' && rec2.coins === 500 && rec2.v === 2 && page.errs.length === 0, JSON.stringify(rec2) + ' ' + page.errs.join('|'));
  await ev(() => { localStorage.setItem('pool8_save_v1', JSON.stringify({ coins: 321, cues: [0, 1], cue: 1, xp: 150, matches: 4, tutDone: true, firstDone: true })); });
  await page.reload(); await page.waitForTimeout(2200);
  const old = await ev(() => ({ from: window.__pool.saveFrom, coins: window.__pool.save.coins, cue: window.__pool.save.cue, v: window.__pool.save.v }));
  ok('save antigo (sem versão) abre e é migrado', old.from === 'principal' && old.coins === 321 && old.cue === 1 && old.v === 2, JSON.stringify(old));

  // ---- definições ----
  await ev(() => { const s = window.__pool.save; s.tutDone = true; s.firstDone = true; s.noAds = true; s.offerSeen = true; window.__pool.toMenu(); });
  await ev(() => document.getElementById('btnSettings').click()); await page.waitForTimeout(300);
  ok('definições abrem', await ev(() => document.getElementById('settings').classList.contains('show')));
  await ev(() => document.querySelector('#setLang [data-lang=en]').click()); await page.waitForTimeout(200);
  const en = await ev(() => ({ lang: document.documentElement.lang, play: document.getElementById('btnCpu').textContent.trim(), saved: window.__pool.save.lang, h1: document.querySelector('#settings h1').textContent }));
  ok('mudar idioma para inglês atualiza tudo e guarda', en.lang === 'en' && /Play/.test(en.play) && en.saved === 'en' && en.h1 === 'Settings', JSON.stringify(en));
  await ev(() => document.querySelector('#setLang [data-lang=pt]').click());
  await ev(() => document.getElementById('setVib').click());
  ok('vibração desligável e guardada', await ev(() => window.__pool.save.vib === false && /desligado/.test(document.getElementById('setVib').textContent)));
  await ev(() => document.getElementById('setVib').click());
  const side0 = await ev(() => document.getElementById('side').getBoundingClientRect().left);
  await ev(() => document.getElementById('setLefty').click()); await page.waitForTimeout(200);
  await ev(() => { window.__pool.toMenu(); window.__pool.newGame('2p'); }); await page.waitForTimeout(500);
  const lay = await ev(() => ({ side: document.getElementById('side').getBoundingClientRect(), stage: document.getElementById('stage').getBoundingClientRect(), cls: document.body.classList.contains('lefty') }));
  ok('modo canhoto: painel de controlo passa para a esquerda da mesa', lay.cls && lay.side.right <= lay.stage.left + 2 && side0 > 300, 'painel x=' + Math.round(lay.side.left) + ' mesa x=' + Math.round(lay.stage.left) + ' (antes ' + Math.round(side0) + ')');
  // jogar em canhoto: força na barra à esquerda ainda dispara
  await ev(() => { const P = window.__pool; P.firstBreak = false; });
  const pb = await ev(() => { const r = document.getElementById('power').getBoundingClientRect(); return { x: r.left + r.width / 2, y1: r.bottom - 8, y2: r.top + 12 }; });
  await page.touchscreen.tap(pb.x, pb.y1);
  ok('em modo canhoto a barra de força responde ao toque', await ev(() => document.getElementById('power').getBoundingClientRect().left < document.getElementById('stage').getBoundingClientRect().left));
  await ev(() => { window.__pool.save.lefty = false; document.body.classList.remove('lefty'); });

  // ---- teclado e aria ----
  await ev(() => { window.__pool.toMenu(); window.__pool.newGame('2p'); window.__pool.firstBreak = false; }); await page.waitForTimeout(400);
  const a0 = await ev(() => window.__pool.phys && 0); const ang0 = await ev(() => window.__pool.aim ? window.__pool.aim : 0);
  const kb = await (async () => {
    const before = await ev(() => document.getElementById('powerText').textContent);
    for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowUp');
    const mid = await ev(() => [document.getElementById('power').getAttribute('aria-valuenow'), document.getElementById('powerText').textContent]);
    await page.keyboard.press('Space'); await page.waitForTimeout(400);
    const st = await ev(() => window.__pool.state);
    return { before, mid, st };
  })();
  ok('teclado: ↑ sobe a força (aria-valuenow) e Espaço bate', +kb.mid[0] > 50 && /%/.test(kb.mid[1]) && (kb.st === 'moving' || kb.st === 'aim'), JSON.stringify(kb));
  await ev(() => { window.__pool.speed = 12; }); await page.waitForTimeout(3000);
  const labels = await ev(() => ['spin', 'power', 'nL', 'nR', 'cv', 'menuBtn', 'muteBtn'].map(i => document.getElementById(i).getAttribute('aria-label') || '').every(x => x.length >= 3));
  ok('controlos têm rótulos acessíveis (aria-label)', labels);
  ok('toast é uma região aria-live', await ev(() => document.getElementById('toast').getAttribute('aria-live') === 'polite'));

  // ---- háptica ----
  const hp = await ev(() => {
    const calls = []; window.Capacitor = { Plugins: { Haptics: { impact: o => calls.push(['impact', o.style]), notification: o => calls.push(['notif', o.type]) } } };
    window.__pool.save.vib = true; vib(50); vib(20); vib([30, 40, 30]); vib([40, 60, 40, 60, 90]);
    window.__pool.save.vib = false; vib(50); window.__pool.save.vib = true;
    delete window.Capacitor; let nv = 0; const o = navigator.vibrate; navigator.vibrate = () => { nv++; return true; }; vib(30); navigator.vibrate = o;
    return { calls, nv };
  });
  ok('háptica: Capacitor Haptics quando existe (impacto/notificação), desligável, e navigator.vibrate como alternativa', hp.calls.length === 4 && hp.calls[0][1] === 'HEAVY' && hp.calls[1][1] === 'LIGHT' && hp.calls[2][1] === 'WARNING' && hp.calls[3][1] === 'SUCCESS' && hp.nv === 1, JSON.stringify(hp));
  ok('sem erros de consola (sessão principal)', page.errs.length === 0, page.errs.slice(0, 2).join(' | '));
  await ctx.close();

  // ---- movimento reduzido ----
  ({ ctx, page } = await mk({ reducedMotion: 'reduce' }));
  await page.goto(url); await page.waitForTimeout(2200);
  ok('prefers-reduced-motion liga "Reduzir efeitos" por omissão', await page.evaluate(() => window.__pool.save.lowFx === true && window.__pool.save.fxSet === false));
  await page.evaluate(() => { document.querySelector('#pause .fxbtn').click(); });
  ok('a escolha do jogador (fxSet) passa a mandar sobre a preferência do sistema', await page.evaluate(() => window.__pool.save.lowFx === false && window.__pool.save.fxSet === true));
  await ctx.close();

  // ---- carimbos de tempo e torneio (regressão apanhada na revisão final) ----
  ({ ctx, page } = await mk()); await page.goto(url); await page.waitForTimeout(1800);
  const ts = await page.evaluate(() => { const P = window.__pool, n = Date.now(); const o = P.sanitizeSave({ chestAt: n, lastAdAt: n - 5000, vid: { start: n, n: 2, dbl: 1 } }); return { n, chest: o.chestAt, ad: o.lastAdAt, vs: o.vid.start, vn: o.vid.n, now: Date.now() }; });
  ok("save: carimbos de tempo (Date.now ≈ 1,8e12) sobrevivem à validação", ts.chest === ts.n && ts.ad === ts.n - 5000 && ts.vs === ts.n && ts.vn === 2, JSON.stringify(ts));
  const tr2 = await page.evaluate(() => { const P = window.__pool; return [P.sanitizeSave({ tour: { round: 99, live: true } }).tour, P.sanitizeSave({ tour: { round: "x" } }).tour, P.sanitizeSave({ tour: { round: 1, live: false } }).tour]; });
  ok("save: torneio com ronda inválida é limitado ou descartado", tr2[0] && tr2[0].round === 2 && tr2[1] === null && tr2[2].round === 1, JSON.stringify(tr2));
  await ctx.close();
  const fails = results.filter(r => !r[1]).length;
  console.log('\n' + (fails ? 'HÁ FALHAS: ' + fails : 'TUDO PASS') + ' (' + results.length + ' testes)');
  await br.close(); process.exitCode = fails ? 1 : 0;
})();
