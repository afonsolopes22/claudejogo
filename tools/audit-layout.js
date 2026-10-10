// Auditoria de layout (texto cortado, sobreposição, alvos de toque, PT por traduzir em EN) em 4 tamanhos. Correr: node tools/audit-layout.js   (LEFTY=1 para modo canhoto, LANGS=pt,en, SIZES=844x390,...)
const { chromium } = require('playwright-core');
const fs = require('fs');
const SIZES = (process.env.SIZES || '844x390,932x430,740x360,1180x820').split(',').map(x => x.split('x').map(Number));
const LANGS = (process.env.LANGS || 'pt,en').split(',');
const SHOTS = process.env.SHOTS === '1';
const LEFTY = process.env.LEFTY === '1';
const url = l => require("url").pathToFileURL(require("path").join(__dirname, "..", "index.html")).href + '?debug&lang=' + l;

// ---- corre dentro da página: devolve problemas de layout do ecrã visível ----
const auditFn = (opts) => {
  const vw = innerWidth, vh = innerHeight, issues = [];
  const cs = el => getComputedStyle(el);
  const vis = el => { const r = el.getBoundingClientRect(), c = cs(el); return r.width > 0 && r.height > 0 && c.visibility !== 'hidden' && c.display !== 'none' && parseFloat(c.opacity) > 0.05; };
  const ovs = [...document.querySelectorAll('.overlay.show')].filter(o => o.id !== 'adov' || true);
  const root = opts.root ? document.querySelector(opts.root) : (ovs.length ? ovs[ovs.length - 1] : document.getElementById('app'));
  const scrollable = root.classList.contains('overlay') && root.scrollHeight > root.clientHeight + 1;
  const name = el => (el.id ? '#' + el.id : el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : '')) + ' "' + (el.textContent || '').trim().slice(0, 22) + '"';
  const els = [...root.querySelectorAll('*')].filter(e => vis(e) && !e.closest('svg') && !e.closest('#fx') && e.tagName !== 'CANVAS' && e.id !== 'toast');
  // 1) fora do ecrã
  for (const e of els) {
    const r = e.getBoundingClientRect(), fixed = cs(e).position === 'fixed';
    if (r.left < -1 || r.right > vw + 1) issues.push({ t: 'fora-do-ecrã (horizontal)', e: name(e), d: `${Math.round(r.left)}..${Math.round(r.right)} de ${vw}` });
    if (!scrollable && (r.top < -1 || r.bottom > vh + 1)) issues.push({ t: 'fora-do-ecrã (vertical)', e: name(e), d: `${Math.round(r.top)}..${Math.round(r.bottom)} de ${vh}` });
  }
  // 2) texto cortado / a sair da caixa
  for (const e of els) {
    const direct = [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
    if (!direct) continue;
    const c = cs(e), r = e.getBoundingClientRect(), rg = document.createRange(); rg.selectNodeContents(e); const tr = rg.getBoundingClientRect();
    if ((c.overflow === 'hidden' || c.overflowX === 'hidden') && e.scrollWidth > e.clientWidth + 1) issues.push({ t: 'texto cortado', e: name(e), d: `${e.scrollWidth}>${e.clientWidth}` });
    else if (tr.right > r.right + 1.5 || tr.left < r.left - 1.5) issues.push({ t: 'texto a sair da caixa', e: name(e), d: `${Math.round(tr.left)}..${Math.round(tr.right)} vs ${Math.round(r.left)}..${Math.round(r.right)}` });
    if ((c.overflow === 'hidden' || c.overflowY === 'hidden') && e.scrollHeight > e.clientHeight + 2) issues.push({ t: 'texto cortado (altura)', e: name(e), d: `${e.scrollHeight}>${e.clientHeight}` });
  }
  // 3) sobreposição de botões / controlos
  const ctr = [...root.querySelectorAll('button, #spin, #power')].filter(vis);
  for (let i = 0; i < ctr.length; i++) for (let j = i + 1; j < ctr.length; j++) {
    const a = ctr[i].getBoundingClientRect(), b = ctr[j].getBoundingClientRect();
    const w = Math.min(a.right, b.right) - Math.max(a.left, b.left), h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    if (w > 2 && h > 2 && !ctr[i].contains(ctr[j]) && !ctr[j].contains(ctr[i])) issues.push({ t: 'sobreposição', e: name(ctr[i]) + ' × ' + name(ctr[j]), d: `${Math.round(w)}x${Math.round(h)}` });
  }
  // 3b) botão "voltar" por cima de texto/cartões
  const back = root.querySelector('.back');
  if (back && vis(back)) {
    const b = back.getBoundingClientRect();
    for (const e of root.querySelectorAll('h1, p, .tabs, .card, .grid, .cgrid, .dgrid')) {
      if (!vis(e)) continue; const a = e.getBoundingClientRect();
      const w = Math.min(a.right, b.right) - Math.max(a.left, b.left), h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (w > 2 && h > 2) issues.push({ t: 'voltar sobreposto', e: name(e), d: `${Math.round(w)}x${Math.round(h)}` });
    }
  }
  // 4) alvos de toque < 44 px
  for (const e of root.querySelectorAll('button, #spin, #power')) {
    if (!vis(e)) continue; const r = e.getBoundingClientRect(); if (Math.min(r.width, r.height) < 43.5) issues.push({ t: 'alvo de toque pequeno', e: name(e), d: `${Math.round(r.width)}x${Math.round(r.height)}` });
  }
  // 5) português por traduzir (só em EN)
  const leaks = [];
  if (opts.lang === 'en') {
    const re = /[áàâãéêíóôõúç]|\b(de|do|da|dos|das|em|para|um|uma|com|sem|ou|que|não|já|tem|ver|vê|abandonar|continuar|jogar|voltar|tacadas?|moedas?|nível|prémio|entrada|sala|mesa|mesas|taco|tacos|pano|panos|loja|torneio|desafios?|baú|grátis|falta|vez|ganhaste|perdeste|diário|missões|conquistas|fechar|saltar|seguinte|níveis|repetir|bola|bolas)\b/i;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let n; while ((n = walker.nextNode())) { const el = n.parentElement, tx = n.textContent.trim(); if (!tx || !el || !vis(el) || el.closest('svg') || el.closest('style')) continue; if (tx !== 'Português' && re.test(tx)) leaks.push(tx.slice(0, 60)); }
    root.querySelectorAll('[aria-label]').forEach(e => { if (re.test(e.getAttribute('aria-label'))) leaks.push('aria: ' + e.getAttribute('aria-label')); });
  }
  return { issues, leaks, scrollable };
};

(async () => {
  const br = await chromium.launch({ executablePath: process.env.EDGE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  const report = {}; let total = 0;
  for (const lang of LANGS) for (const [w, h] of SIZES) {
    const ctx = await br.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
    const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(String(e))); page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); }); page.on('dialog', d => d.accept());
    await page.goto(url(lang)); await page.waitForTimeout(2500);
    const ev = (f, a) => page.evaluate(f, a);
    await ev((L) => { const s = window.__pool.save; s.lefty = L; document.body.classList.toggle('lefty', L); s.tutDone = true; s.firstDone = true; s.coins = 12340; s.xp = 9000; s.matches = 20; s.offerSeen = false; s.starter = false; s.cues = [0, 1, 2, 3, 4, 5, 6, 7]; s.cloths = [0, 1, 2, 3, 4, 5, 6, 7]; s.tables = [0, 1, 2]; s.noAds = false; window.__pool.Snd.setMuted(true); }, LEFTY);
    const closeAll = () => ev(() => { document.querySelectorAll('.overlay').forEach(o => o.classList.remove('show')); });
    const screens = [];
    const add = (name, fn, o = {}) => screens.push({ name, fn, o });
    add('menu', async () => { await ev(() => window.__pool.toMenu()); });
    add('rooms', async () => { await ev(() => window.__pool.toMenu()); await ev(() => document.getElementById('btnCpu').click()); });
    add('definicoes', async () => { await ev(() => { window.__pool.toMenu(); document.getElementById('btnSettings').click(); }); });
    add('modos', async () => { await ev(() => { window.__pool.toMenu(); document.getElementById('btnModes').click(); }); });
    add('p2setup', async () => { await ev(() => { window.__pool.toMenu(); document.getElementById('btnModes').click(); document.getElementById('btnM2p').click(); }); });
    add('treino', async () => { await ev(() => { window.__pool.toMenu(); window.__pool.startTrain(); }); await page.waitForTimeout(900); }, { root: '#app' });
    add('replay-barra', async () => { await ev(() => { const P = window.__pool; P.toMenu(); P.newGame('2p'); P.firstBreak = false; P.speed = 8; P.fire(0.01, 0.8); }); for (let i = 0; i < 200; i++) { if (await ev(() => window.__pool.state === 'aim')) break; await page.waitForTimeout(50); } await ev(() => { window.__pool.speed = 1; window.__pool.startReplay('pause'); }); await page.waitForTimeout(300); }, { root: '#rpBar' });
    add('perfil', async () => { await ev(() => window.__pool.toMenu()); await ev(() => document.getElementById('btnProf').click()); });
    add('conquistas', async () => { await ev(() => { window.__pool.toMenu(); document.getElementById('btnProf').click(); document.getElementById('btnAch').click(); }); });
    add('diario', async () => { await ev(() => { window.__pool.toMenu(); document.getElementById('btnDaily').click(); }); });
    add('desafios', async () => { await ev(() => { window.__pool.save.chal = { 0: 3, 1: 2, 2: 1 }; window.__pool.toMenu(); document.getElementById('btnChal').click(); }); });
    add('torneio', async () => { await ev(() => { window.__pool.toMenu(); document.getElementById('btnTour').click(); }); });
    for (const tab of ['cues', 'cloth', 'tables', 'coins']) add('loja-' + tab, async () => { await ev(t => { window.__pool.toMenu(); document.getElementById('btnShop').click(); document.querySelector(`#shopTabs [data-t=${t}]`).click(); }, tab); });
    add('bau', async () => { await ev(() => { window.__pool.save.chestAt = 0; window.__pool.toMenu(); document.getElementById('btnChest').click(); }); });
    add('oferta', async () => { await ev(() => { window.__pool.toMenu(); window.__pool.save.offerSeen = false; window.__pool.save.starter = false; window.__pool.maybeOffer(); }); await page.waitForTimeout(100); });
    add('pausa', async () => { await ev(() => { window.__pool.newGame('cpu', window.__pool.rooms[1]); document.getElementById('menuBtn').click(); }); });
    add('fim-vitoria', async () => { await ev(() => { const P = window.__pool; P.newGame('cpu', P.rooms[1]); P.firstBreak = false; P.groups[0] = 'solid'; P.groups[1] = 'stripe'; const b = P.balls; b.forEach((x, i) => { if (i > 0 && x.n !== 8) x.alive = false; }); const e = b.find(x => x.n === 8); e.x = 640; e.y = 90; b[0].x = 560; b[0].y = 150; P.speed = 4; P.fire(Math.atan2(-60, -80) + Math.PI, 0.5); }); for (let i = 0; i < 200; i++) { if (await ev(() => document.getElementById('over').classList.contains('show'))) break; await page.waitForTimeout(60); } await page.waitForTimeout(1400); await ev(() => { window.__pool.speed = 1; }); });
    add('fim-desafio-falha', async () => { await ev(() => { window.__pool.startChal(0); }); for (let i = 0; i < 3; i++) { await ev(() => { window.__pool.speed = 6; window.__pool.fire(Math.PI, 0.2); }); for (let k = 0; k < 150; k++) { await page.waitForTimeout(40); const st = await ev(() => window.__pool.state); if (st !== 'moving' && st !== 'resolving') break; } await page.waitForTimeout(60); } await page.waitForTimeout(1200); await ev(() => { window.__pool.speed = 1; }); });
    add('anuncio', async () => { await ev(() => { window.__pool.toMenu(); window.__pool.Monet.rewarded(); }); await page.waitForTimeout(200); }, { root: '#adov' });
    add('jogo', async () => { await ev(() => { window.__pool.newGame('2p'); }); await page.waitForTimeout(500); }, { root: '#app' });
    add('jogo-desafio', async () => { await ev(() => { window.__pool.startChal(16); }); await page.waitForTimeout(500); }, { root: '#app' });
    for (let st = 0; st < 4; st++) add('tutorial-' + (st + 1), async () => { await ev(() => { const s = window.__pool.save; s.tutDone = false; window.__pool.newGame('2p'); }); await page.waitForTimeout(300); for (let k = 0; k < st; k++) await ev(() => document.getElementById('coachOk').click()); await page.waitForTimeout(200); await ev(() => { window.__pool.save.tutDone = true; }); }, { root: '#app' });
    for (const sc of screens) {
      await closeAll(); await ev(() => { window.__pool.speed = 1; });
      await sc.fn(); await page.waitForTimeout(sc.name.startsWith('tutorial') || sc.name.startsWith('jogo') ? 100 : 400);
      const r = await ev(auditFn, Object.assign({ lang }, sc.o));
      const key = `${lang} ${w}x${h} ${sc.name}`;
      if (SHOTS) await page.screenshot({ path: `a65_${lang}_${w}x${h}_${sc.name}.png` });
      if (r.issues.length || r.leaks.length) { report[key] = r; total += r.issues.length + r.leaks.length; }
    }
    // estabilidade: nada salta depois de a animação acabar (menu e loja)
    const pos = () => ev(() => [...document.querySelectorAll('.overlay.show h1, .overlay.show .tabs, .overlay.show button')].map(e => { const r = e.getBoundingClientRect(); return Math.round(r.left) + ',' + Math.round(r.top); }));
    await closeAll(); await ev(() => { window.__pool.toMenu(); }); await page.waitForTimeout(320); const m1 = await pos(); await page.waitForTimeout(500); const m2 = await pos();
    const jump = m1.filter((v, i) => v !== m2[i]).length;
    await closeAll(); await ev(() => { window.__pool.toMenu(); document.getElementById('btnShop').click(); }); await page.waitForTimeout(400); const s1 = await ev(() => { const r = document.querySelector('#shop h1').getBoundingClientRect(), t = document.querySelector('#shopTabs').getBoundingClientRect(); return [Math.round(r.top), Math.round(t.top)]; });
    const jt = [];
    for (const tab of ['cloth', 'tables', 'coins', 'cues']) { await ev(t => document.querySelector(`#shopTabs [data-t=${t}]`).click(), tab); await page.waitForTimeout(150); jt.push(await ev(() => { const r = document.querySelector('#shop h1').getBoundingClientRect(), t = document.querySelector('#shopTabs').getBoundingClientRect(); return [Math.round(r.top), Math.round(t.top)]; })); }
    const shopJump = jt.filter(x => x[0] !== s1[0] || x[1] !== s1[1]).length;
    if (jump || shopJump) { report[`${lang} ${w}x${h} estabilidade`] = { issues: [{ t: 'elementos a saltar', e: `menu:${jump} loja(separadores):${shopJump}`, d: '' }], leaks: [] }; total++; }
    if (errs.length) { report[`${lang} ${w}x${h} consola`] = { issues: errs.slice(0, 3).map(x => ({ t: 'erro de consola', e: x.slice(0, 120), d: '' })), leaks: [] }; total += errs.length; }
    await ctx.close();
  }
  // vertical: ecrã "Roda o telemóvel"
  { const ctx = await br.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }); const page = await ctx.newPage(); await page.goto(url('pt')); await page.waitForTimeout(2500);
    const r = await page.evaluate(() => { const e = document.getElementById('rotate'), r = e.getBoundingClientRect(); return { vis: getComputedStyle(e).display, w: Math.round(r.width), h: Math.round(r.height), txt: e.innerText.replace(/\n/g, ' | ') }; });
    console.log('vertical (390x844):', JSON.stringify(r)); if (SHOTS) await page.screenshot({ path: 'a65_vertical.png' }); await ctx.close(); }
  console.log('\nTOTAL de problemas:', total);
  for (const [k, v] of Object.entries(report)) { console.log('\n' + k); v.issues.forEach(i => console.log('   - ' + i.t + ': ' + i.e + ' ' + i.d)); v.leaks.forEach(l => console.log('   - PT por traduzir: ' + l)); }
  /* relatório completo só no ecrã */
  await br.close();
})();
