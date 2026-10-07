// Solver robusto dos desafios (usado pelos testes e pelo gerador de mesas semanais). Correr: node tools/solver.js [niveis] [janela mínima]
// Solver robusto dos desafios: procura uma sequência (<= par tacadas) em que CADA tacada tem janela de acerto >= req (rad).
// Uso: node rob30.js [niveis separados por vírgula] [reqOverride]
const { chromium } = require('playwright-core');

const solveRobust = (idx, req, tmax) => {
  const P = window.__pool, sb = P.sb, BR = 11, L = 28, Rr = 708, T = 28, B = 368, MIDX = 368;
  const POCK = [[L, T], [MIDX, T], [Rr, T], [L, B], [MIDX, B], [Rr, B]];
  const Lv = P.CHALLENGES[idx];
  P.startChal(idx);
  const goalsLeft = () => Lv.goal.filter(n => { const b = P.balls.find(x => x.n === n); return b && b.alive; }).length;
  const t0 = performance.now();
  function candidates() {
    const cue = sb.cue, out = [], alive = P.balls.filter(b => b.alive && b.n), goals = alive.filter(b => Lv.goal.includes(b.n));
    for (const b of goals) {
      out.push({ a: Math.atan2(b.y - cue.y, b.x - cue.x), pw: 0.5 }, { a: Math.atan2(b.y - cue.y, b.x - cue.x), pw: 0.9 });
      POCK.forEach(pk => {
        let ux = pk[0] - b.x, uy = pk[1] - b.y; const ul = Math.hypot(ux, uy); ux /= ul; uy /= ul;
        const gx = b.x - ux * 2 * BR, gy = b.y - uy * 2 * BR;
        if (gx < L + BR || gx > Rr - BR || gy < T + BR || gy > B - BR) return;
        const vx = gx - cue.x, vy = gy - cue.y, d = Math.hypot(vx, vy); if (d < 1) return;
        if ((vx * ux + vy * uy) / d < 0.25) return;
        const a0 = Math.atan2(vy, vx);
        for (const pw of [0.3, 0.5, 0.75, 1]) for (const j of [0, 0.01, -0.01, 0.02, -0.02, 0.035, -0.035]) out.push({ a: a0 + j, pw });
      });
    }
    return out;
  }
  // janela de acerto à volta de a (contígua), com o ângulo central corrigido
  function findWindow(s0, c, G) {
    const ok = d => { sb.restoreSnap(s0); const r = sb.runSim(c.a + d, c.pw); return !r.scratch && G.every(n => r.pocketed.includes(n)) && !r.pocketed.some(n => Lv.avoid.includes(n)); };
    if (!ok(0)) return null;
    let lo = 0, hi = 0; while (lo > -0.25 && ok(lo - 0.002)) lo -= 0.002; while (hi < 0.25 && ok(hi + 0.002)) hi += 0.002;
    return { a: c.a + (lo + hi) / 2, pw: c.pw, w: hi - lo + 0.002 };
  }
  function dfs(depth) {
    if (goalsLeft() === 0) return [];
    if (depth === 0 || performance.now() - t0 > tmax) return null;
    const s0 = sb.snap(), before = goalsLeft(), good = [];
    for (const c of candidates()) {
      sb.restoreSnap(s0); const r = sb.runSim(c.a, c.pw);
      if (r.scratch || r.pocketed.some(n => Lv.avoid.includes(n))) continue;
      const prog = before - goalsLeft(); if (prog >= 1) good.push({ c, prog, G: r.pocketed.slice() });
    }
    good.sort((x, y) => y.prog - x.prog);
    const seen = [], opts = [];
    for (const g of good) {                                  // um representante por (pw, ângulo aproximado)
      const key = g.c.pw + ':' + Math.round(g.c.a / 0.03); if (seen.includes(key)) continue; seen.push(key);
      if (opts.length >= 14 || performance.now() - t0 > tmax) break;
      const w = findWindow(s0, g.c, g.G); if (w && w.w >= req) opts.push({ w, G: g.G });
    }
    opts.sort((x, y) => y.w.w - x.w.w);
    for (const o of opts.slice(0, 3)) {
      sb.restoreSnap(s0); sb.runSim(o.w.a, o.w.pw);
      const rest = dfs(depth - 1); sb.restoreSnap(s0);
      if (rest) return [{ a: o.w.a, pw: o.w.pw, w: o.w.w }, ...rest];
    }
    sb.restoreSnap(s0); return null;
  }
  const s0 = sb.snap();
  for (let d = 1; d <= Lv.par; d++) { sb.restoreSnap(s0); const sol = dfs(d); sb.restoreSnap(s0); if (sol) return { idx, par: Lv.par, seq: sol }; }
  sb.restoreSnap(s0); return { idx, par: Lv.par, seq: null };
};

module.exports = { solveRobust };

if (require.main === module) (async () => {
  const br = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  const page = await (await br.newContext({ viewport: { width: 844, height: 390 } })).newPage();
  await page.goto(require("url").pathToFileURL(require("path").join(__dirname, "..", "index.html")).href + '?debug'); await page.waitForTimeout(500);
  await page.evaluate(() => { const s = window.__pool.save; s.tutDone = true; s.firstDone = true; });
  const only = process.argv[2] && process.argv[2] !== 'all' ? process.argv[2].split(',').map(Number) : null;
  const reqOverride = process.argv[3] ? +process.argv[3] : null;
  const src = solveRobust.toString();
  for (let i = 0; i < 30; i++) {
    if (only && !only.includes(i + 1)) continue;
    const need = i < 5 ? 0.05 : i < 15 ? 0.03 : 0.02, req = reqOverride || need;
    const t = Date.now();
    const r = await page.evaluate(([src, idx, req]) => eval("(" + src + ")")(idx, req, 45000), [src, i, req]);
    const wins = r.seq ? r.seq.map(s => +s.w.toFixed(3)) : null;
    console.log((i + 1) + ': par ' + r.par + ' req ' + req + ' -> ' + (r.seq ? 'OK ' + r.seq.length + ' tacada(s) janelas ' + JSON.stringify(wins) : 'SEM SOLUÇÃO') + ' (' + ((Date.now() - t) / 1000).toFixed(0) + 's)');
  }
  await br.close();
})();
