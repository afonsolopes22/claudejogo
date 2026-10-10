// Gera as 52 mesas semanais (WEEKS em js/modes.js) com validação pelo solver. Saída: weeks.json
// Gera 52 mesas semanais (por semente) e valida cada uma com o solver robusto (janelas >= 0,03 rad em todas as tacadas).
// Saída: weeks.json = [{cue:[x,y], goal:[n], avoid:[n], par, max, balls:[[n,x,y],...]}, ...]
const { chromium } = require('playwright-core');
const fs = require('fs');
const { solveRobust } = require('./solver.js');

const makeAndSolve = (src, week, tmaxLevel, seedOff) => {
  const P = window.__pool, BR = 11, solve = eval('(' + src + ')');
  const pk = [[28, 28], [368, 28], [708, 28], [28, 368], [368, 368], [708, 368]];
  const mk = (s => () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; })(7919 * (week + 1 + seedOff * 977));
  const rnd = mk;
  const nGoal = week % 3 === 2 ? 2 : 1, nOther = 2 + (week % 4), avoid8 = week % 5 === 4;
  const solids = [1, 2, 3, 4, 5, 6, 7], stripes = [9, 10, 11, 12, 13, 14, 15];
  const t0 = performance.now();
  P.CHALLENGES.length = 30;
  for (let k = 0; performance.now() - t0 < tmaxLevel; k++) {
    const pool = (week % 2 ? stripes : solids).slice(); const pick = () => pool.splice((rnd() * pool.length) | 0, 1)[0];
    const goals = []; for (let i = 0; i < nGoal; i++) goals.push(pick());
    const others = []; for (let i = 0; i < nOther; i++) others.push(pick());
    const nums = [...goals, ...others]; if (avoid8) nums.push(8);
    const pts = [];
    let ok = true;
    for (let i = 0; i < nums.length + 1 && ok; i++) {
      let placed = false;
      for (let tries = 0; tries < 60 && !placed; tries++) {
        const x = i === 0 ? 60 + rnd() * 260 : 60 + rnd() * 620, y = 56 + rnd() * 290;
        if (pk.some(q => Math.hypot(x - q[0], y - q[1]) < 60)) continue;
        if (pts.some(q => Math.hypot(x - q[0], y - q[1]) < 28)) continue;
        pts.push([x, y]); placed = true;
      }
      if (!placed) ok = false;
    }
    if (!ok) continue;
    const Lv = { cue: [Math.round(pts[0][0]), Math.round(pts[0][1])], goal: goals, avoid: avoid8 ? [8] : [], par: nGoal + 1 + (week % 2), max: 0, balls: nums.map((n, i) => [n, Math.round(pts[i + 1][0]), Math.round(pts[i + 1][1])]) };
    Lv.max = Lv.par + 2;
    P.CHALLENGES[30] = Lv;
    const r = solve(30, 0.03, 4000);
    if (r.seq && r.seq.length >= nGoal) { Lv.par = r.seq.length; Lv.max = Lv.par + 2; return { ok: true, tries: k + 1, lv: Lv, wins: r.seq.map(s => +s.w.toFixed(3)) }; }
  }
  return { ok: false };
};

(async () => {
  const br = await chromium.launch({ executablePath: process.env.EDGE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  const page = await (await br.newContext({ viewport: { width: 844, height: 390 } })).newPage();
  await page.goto(require("url").pathToFileURL(require("path").join(__dirname, "..", "index.html")).href + '?debug'); await page.waitForTimeout(600);
  await page.evaluate(() => { const s = window.__pool.save; s.tutDone = true; s.firstDone = true; });
  const out = []; const src = solveRobust.toString();
  for (let w = 0, off = 0; w < 52; w++) {
    const r = await page.evaluate(([f, src2, w, off]) => eval('(' + f + ')')(src2, w, 90000, off), [makeAndSolve.toString(), src, w, off]);
    console.log('semana ' + (w + 1) + ': ' + (r.ok ? 'OK (' + r.tries + ' tent.) par ' + r.lv.par + ' janelas ' + JSON.stringify(r.wins) : 'FALHOU'));
    if (!r.ok) { w--; off++; continue; }
    off = 0; out.push(r.lv); fs.writeFileSync('weeks.json', JSON.stringify(out));
  }
  await br.close();
})();
