const { chromium } = require('playwright-core');
const fs = require('fs'), path = require('path');
const { pngRGB, pngInfo } = require('./png.js');
const ROOT = 'C:/Users/Utilizador 1/claudejogo';
const URL = 'file:///C:/Users/Utilizador%201/claudejogo/index.html?debug';

const prep = () => {   // estado "bonito": sem banner, tudo desbloqueado
  const P = window.__pool, s = P.save;
  s.tutDone = true; s.firstDone = true; s.noAds = true; s.offerSeen = true; s.matches = 14; s.wins = 9; s.losses = 5; s.pots = 120; s.bestStreak = 4;
  s.coins = 12840; s.xp = 7600; s.cues = P.CUES.map((_, i) => i); s.cloths = P.CLOTHS.map((_, i) => i); s.tables = [0, 1, 2];
  document.getElementById('banner').classList.add('hide'); window.dispatchEvent(new Event('resize'));
  const t = document.getElementById('toast'); t.style.transition = 'none'; t.style.opacity = '0'; document.getElementById('achToast').style.display = 'none';
};
const waitState = async (page, st, n = 300) => { for (let i = 0; i < n; i++) { if ((await page.evaluate(() => window.__pool.state)) === st) return true; await page.waitForTimeout(60); } return false; };
const hideToast = page => page.evaluate(() => { const t = document.getElementById('toast'); t.classList.remove('show'); t.style.opacity = '0'; });

const scenes = [
  { cap: 'Sinuca de bolso realista', sub: 'Física precisa, efeito na bola e mira fina', setup: async page => {
    await page.evaluate(() => { const P = window.__pool, s = P.save; s.cue = P.CUES.findIndex(c => c.name === 'Taco Dourado'); s.table = 0; s.cloth = 0; P.speed = 6; P.newGame('2p'); P.fire(0.04, 1); });
    await waitState(page, 'aim'); await page.evaluate(() => { window.__pool.speed = 1; }); await page.waitForTimeout(500); await hideToast(page); } },
  { cap: '30 desafios', sub: 'Resolve cada mesa e conquista 3 estrelas', setup: async page => {
    await page.evaluate(() => { const P = window.__pool; P.save.cue = P.CUES.findIndex(c => c.name === 'Taco Cristal'); P.save.table = 0; P.save.cloth = 1; P.startChal(17); });
    await page.waitForTimeout(700); await hideToast(page); } },
  { cap: 'Tacos e panos raros', sub: 'Personaliza o teu jogo com raridades', setup: async page => {
    await page.evaluate(() => { document.querySelectorAll('.overlay').forEach(o => o.classList.remove('show')); document.getElementById('btnShop').click(); document.querySelector('#shopTabs [data-t=cues]').click(); });
    await page.waitForTimeout(700); } },
  { cap: 'Ganha moedas e sobe de nível', sub: 'Torneios, missões e recompensas diárias', setup: async page => {
    await page.evaluate(() => { const P = window.__pool, s = P.save; s.cue = 0; s.table = 0; s.cloth = 0; P.speed = 1; P.newGame('cpu', P.rooms[2]); P.firstBreak = false; P.groups[0] = 'solid'; P.groups[1] = 'stripe';
      const b = P.balls; b.forEach((x, i) => { if (i > 0 && x.n !== 8) x.alive = false; }); const e = b.find(x => x.n === 8); e.x = 640; e.y = 90; b[0].x = 560; b[0].y = 150; P.fire(Math.atan2(-60, 80), 0.5); });
    for (let i = 0; i < 200; i++) { if (await page.evaluate(() => document.getElementById('over').classList.contains('show'))) break; await page.waitForTimeout(60); }
    for (let i = 0; i < 80; i++) { if ((await page.evaluate(() => document.getElementById('prizeCnt').textContent)).endsWith('2000')) break; await page.waitForTimeout(60); }
    await page.evaluate(() => { document.getElementById('fx').getContext('2d').clearRect(0, 0, 4000, 4000); window.__pool.confettiBurst(); }); await page.waitForTimeout(420); } },
  { cap: 'Mesa Neon', sub: 'E mais mesas temáticas na loja', setup: async page => {
    await page.evaluate(() => { const P = window.__pool, s = P.save; s.cue = P.CUES.findIndex(c => c.name === 'Taco Lendário'); s.table = 2; s.cloth = P.CLOTHS.findIndex(c => c.name === 'Magenta Neon'); P.speed = 6; P.newGame('2p'); P.fire(-0.05, 1); });
    await waitState(page, 'aim'); await page.evaluate(() => { window.__pool.speed = 1; }); await page.waitForTimeout(500); await hideToast(page); } },
];

(async () => {
  const br = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  const work = await (await br.newContext()).newPage(); await work.goto('about:blank');
  const toRGB = async buf => { const b64 = buf.toString('base64'); const r = await work.evaluate(async b64 => { const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode(); const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight; const g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0); const d = g.getImageData(0, 0, c.width, c.height).data, rgb = new Uint8Array(c.width * c.height * 3); for (let i = 0, j = 0; i < d.length; i += 4, j += 3) { rgb[j] = d[i]; rgb[j + 1] = d[i + 1]; rgb[j + 2] = d[i + 2]; } let bin = ''; for (let i = 0; i < rgb.length; i += 32768) bin += String.fromCharCode.apply(null, rgb.subarray(i, i + 32768)); return { w: c.width, h: c.height, b64: btoa(bin) }; }, b64); return pngRGB(r.w, r.h, Buffer.from(r.b64, 'base64')); };
  fs.mkdirSync(path.join(ROOT, 'store-assets'), { recursive: true });
  for (let i = 0; i < scenes.length; i++) {
    const sc = scenes[i];
    const ctx = await br.newContext({ viewport: { width: 932, height: 430 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
    const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(String(e)));
    await page.goto(URL); await page.waitForTimeout(2600); await page.evaluate(prep); await page.waitForTimeout(300);
    await sc.setup(page);
    const out = await page.screenshot({ type: "png" });
    const rgb = await toRGB(out);
    const file = path.join(ROOT, 'store-assets', `screenshot-${i + 1}.png`); fs.writeFileSync(file, rgb);
    console.log(path.basename(file), JSON.stringify(pngInfo(rgb)), (rgb.length / 1024 / 1024).toFixed(1) + ' MB', errs.length ? errs : '');
    await ctx.close();
  }
  await br.close();
})();
