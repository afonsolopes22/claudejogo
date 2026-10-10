'use strict';
// CPU: planeamento, efeito, segurança, erros naturais e personalidades.

// ---------- CPU ----------
// Perfis por nível de sala (0 Bairro … 3 Mestre): quantas tacadas avalia, tempo de pensamento, efeito, planeamento, segurança e lapsos.
const AI_LV = [
  { N: 0,  ms: 0,   spin: 0, plan: 0, safe: 0,   lapse: 0.14 },
  { N: 6,  ms: 110, spin: 0, plan: 0, safe: 0.5, lapse: 0.07 },
  { N: 10, ms: 170, spin: 1, plan: 1, safe: 1,   lapse: 0.03 },
  { N: 12, ms: 230, spin: 2, plan: 2, safe: 1.2, lapse: 0.01 },
];
// Personalidades (sorteadas por partida): risco = valor da posição para a tacada seguinte; safe = peso das tacadas de segurança; pw = força; err = erro de execução
const PERSONAS = { bal: { risk: 1, safe: 1, pw: 1, err: 1 }, agg: { risk: 1.3, safe: 0.5, pw: 1.12, err: 1.15 }, def: { risk: 0.8, safe: 1.7, pw: 0.92, err: 0.88 } };
let aiPersona = ['bal', 'bal'], aiTimes = [];
const pickPersona = () => { const r = rnd(); return r < 0.34 ? 'agg' : r < 0.67 ? 'def' : 'bal'; };
const gauss = () => { let u = 0; while (!u) u = rnd(); return Math.max(-2.5, Math.min(2.5, Math.sqrt(-2 * Math.log(u)) * Math.cos(6.2831853 * rnd()))); };
let cpuSpin = { top: 0, side: 0 };

function segDist(px, py, ax, ay, bx, by) {
  const abx = bx - ax, aby = by - ay, l2 = abx * abx + aby * aby;
  let t = l2 ? ((px - ax) * abx + (py - ay) * aby) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + abx * t), py - (ay + aby * t));
}
function geoCands(me) {                         // tacadas diretas (bola -> caçapa) com a branca onde está
  const out = [];
  for (const b of legalTargets(me)) {
    POCKETS.forEach((pk, pi) => {
      let ux = pk.x - b.x, uy = pk.y - b.y; const ul = Math.hypot(ux, uy); ux /= ul; uy /= ul;
      const gx = b.x - ux * BR * 2, gy = b.y - uy * BR * 2;
      if (gx < L + BR || gx > Rr - BR || gy < T + BR || gy > B - BR) return;
      let vx = gx - cue.x, vy = gy - cue.y; const d = Math.hypot(vx, vy);
      if (d < 1) return; vx /= d; vy /= d;
      const dot = vx * ux + vy * uy;
      if (dot < 0.3) return;
      for (const o of balls) {
        if (!o.alive || o === cue || o === b) continue;
        if (segDist(o.x, o.y, cue.x, cue.y, gx, gy) < BR * 1.9) return;
        if (segDist(o.x, o.y, b.x, b.y, pk.x, pk.y) < BR * 1.9) return;
      }
      out.push({ score: d + (1 - dot) * 500 + ul * 0.6, ang: Math.atan2(vy, vx), pw: Math.min(0.9, Math.max(0.35, 0.3 + (d + ul) / 1100)), pi, cut: 1 - dot, d, ul, n: b.n });
    });
  }
  return out.sort((a, b) => a.score - b.score);
}
function snap() { return [balls.map(b => [b.x, b.y, b.vx, b.vy, b.alive, b.wx, b.wy, b.wz]), [cue.top, cue.side, cue.touched, cue.dx, cue.dy]]; }
function restoreSnap(s) { balls.forEach((b, i) => { [b.x, b.y, b.vx, b.vy, b.alive, b.wx, b.wy, b.wz] = s[0][i]; }); [cue.top, cue.side, cue.touched, cue.dx, cue.dy] = s[1]; }

// qualidade (0..1) da melhor tacada direta que sobra a quem joga a seguir
const qOf = g => g.length ? Math.max(0, Math.min(1, (900 - g[0].score) / 900)) : 0;
// Planeamento: valor da posição em que a branca fica. Se continuo a jogar: quão boa é a próxima tacada (2.ª tacada simulada de verdade no nível Mestre).
// Se passo a vez: quão fácil deixo a vida ao adversário (segurança).
function lookahead(me, sh, res, pr, opt) {
  const sg0 = groups[0], sg1 = groups[1];
  if (res.assign && !pr.hadGroup) { groups[me] = res.assign; groups[1 - me] = res.assign === 'solid' ? 'stripe' : 'solid'; }
  let out = 0;
  if (res.keep && !res.foul) {
    if (cue.alive) {
      const g = geoCands(me); out += 110 * qOf(g) * (opt.risk || 1);
      if (opt.deep && g.length) {
        const pr2 = makePre(me, null); let b2 = -1e9;
        for (const c of g.slice(0, 2)) b2 = Math.max(b2, simulate(me, c.ang, c.pw, { ...pr2, called: needsCall(me) ? c.pi : null }));
        out += 0.4 * Math.max(-300, Math.min(300, b2));
      }
    }
  } else if (!res.foul) {
    out -= 150 * (cue.alive ? qOf(geoCands(1 - me)) : 1) * (opt.safe == null ? 1 : opt.safe);
  }
  groups[0] = sg0; groups[1] = sg1;
  return out;
}

// Simula a tacada (sem som) e devolve uma pontuação do ponto de vista de `me`. opt: { top, side, plan, deep, risk, safe }
function simulate(me, ang, pw, pr, opt) {
  opt = opt || {};
  const s = snap(), savedShot = shot, savedAuto = autoPlay;
  SIM = true; shot = newShot();
  launch(ang, pw, 1, opt.top || 0, opt.side || 0, 0);
  let n = 0;
  do { step(SUB); } while (++n < 2400 && anyMoving());
  const sh = shot, res = judge(me, sh, pr);
  let sc = 0;
  if (res.end) sc = res.end.winner === me ? 10000 : -10000;
  else {
    const own = pr.hadGroup ? sh.pocketed.filter(n => groupOf(n) === groups[me]).length : sh.pocketed.length;
    sc += own * 120 - (sh.pocketed.length - own) * 70;
    if (res.foul) sc -= 400;
    if (sh.scratch) sc -= 150;
    if (res.keep) sc += 100;
    if (res.rerack) sc -= 50;
    sc -= pw * 5;
    if (opt.plan) sc += lookahead(me, sh, res, pr, opt);
  }
  SIM = false; shot = savedShot; autoPlay = savedAuto; restoreSnap(s);
  return sc;
}

// Escolhe a tacada (sem erro de execução): candidatos diretos, segurança e efeito, avaliados por simulação conforme o nível
function planShot(me, lvl, pers, lapse) {
  const LV = AI_LV[lvl];
  const cands = geoCands(me), targets = legalTargets(me), call = needsCall(me);
  let best = null;
  const nearest = [...targets].sort((a, b) => Math.hypot(a.x - cue.x, a.y - cue.y) - Math.hypot(b.x - cue.x, b.y - cue.y));
  if (lvl === 0) {
    if (cands.length) best = cands[0];
    if (best && rnd() < lapse) best = cands[Math.min(cands.length - 1, 1 + (rnd() * 2 | 0))];       // lapso: não escolhe a melhor
  } else if (!firstBreak) {
    const prBase = makePre(me, null), direct = [], safeL = [], spinL = [];
    const pwK = pers.pw;
    for (const c of cands.slice(0, LV.N)) {
      const pws = lvl === 1 ? [c.pw] : lvl === 2 ? [c.pw, Math.min(1, c.pw * 1.25)] : [c.pw * 0.8, c.pw, Math.min(1, c.pw * 1.25)];
      for (const pw of pws) direct.push({ ang: c.ang, pw: Math.max(0.2, Math.min(1, pw * pwK)), pi: c.pi, cut: c.cut, d: c.d, ul: c.ul });
    }
    for (const b of nearest.slice(0, 3)) {                                  // tacadas de segurança: toca suavemente numa bola legal
      const a = Math.atan2(b.y - cue.y, b.x - cue.x);
      for (const pw of [0.25, 0.4, 0.55]) safeL.push({ ang: a, pw, pi: null, cut: 0, d: Math.hypot(b.x - cue.x, b.y - cue.y), ul: 200, safe: true });
    }
    if (LV.spin >= 1) for (const c of cands.slice(0, 3)) for (const top of [0.7, -0.7]) spinL.push({ ang: c.ang, pw: Math.min(1, c.pw * pwK), pi: c.pi, cut: c.cut, d: c.d, ul: c.ul, top, side: 0 });
    if (LV.spin >= 2) for (const c of cands.slice(0, 2)) for (const side of [0.5, -0.5]) spinL.push({ ang: c.ang, pw: Math.min(1, c.pw * pwK), pi: c.pi, cut: c.cut, d: c.d, ul: c.ul, top: 0, side });
    const list = [];                                                         // intercala para que segurança e efeito também sejam avaliados se o tempo acabar cedo
    for (let i = 0; i < Math.max(direct.length, safeL.length, spinL.length); i++) for (const L2 of [direct, safeL, spinL]) if (i < L2.length) list.push(L2[i]);
    const t0 = performance.now(), scored = [];
    const opt = (c, deep) => ({ top: c.top || 0, side: c.side || 0, plan: LV.plan >= 1, deep, risk: pers.risk, safe: LV.safe * pers.safe });
    for (const c of list) {
      if (performance.now() - t0 > LV.ms) break;
      scored.push({ c, sc: simulate(me, c.ang, c.pw, { ...prBase, called: call ? c.pi : null }, opt(c, false)) });
    }
    scored.sort((a, b) => b.sc - a.sc);
    if (LV.plan >= 2) {                                                     // Mestre: reavalia as 3 melhores com a 2.ª tacada simulada
      for (const e of scored.slice(0, 3)) { if (performance.now() - t0 > LV.ms * 1.4) break; e.sc = simulate(me, e.c.ang, e.c.pw, { ...prBase, called: call ? e.c.pi : null }, opt(e.c, true)); }
      scored.sort((a, b) => b.sc - a.sc);
    }
    if (scored.length) {
      best = scored[0].c;
      if (rnd() < lapse) {                                                  // lapso: escolhe outra opção razoável (nunca uma derrota/falta clara)
        const alt = scored.slice(1).filter(e => e.sc > scored[0].sc - 250 && e.sc > -5000 && Math.abs(wrapA(e.c.ang - best.ang)) > 0.01);
        if (alt.length) best = alt[rnd() * Math.min(2, alt.length) | 0].c;
      }
    }
  }
  return { best, call, nearest };
}
function cpuDecide() {
  const t00 = performance.now();
  const me = turn, sk = autoPlay && me === 0 && humanSkill ? humanSkill : null, lvl = sk ? sk.ai : easyCpu ? 0 : room.ai;
  const LV = AI_LV[lvl], pers = PERSONAS[aiPersona[me]] || PERSONAS.bal;
  const noise = sk ? (sk.noise != null ? sk.noise : 0.04) : easyCpu ? 0.3 : room.noise, lapse = (sk && sk.lapse != null ? sk.lapse : room && room.lapse != null && !sk ? room.lapse : LV.lapse) * pers.err;
  if (ballInHand) {
    let bestSpot = null, bs = 1e9;
    const K = lvl === 0 ? 1 : [0, 8, 14, 24][lvl];
    for (let k = 0, tries = 0; k < K && tries < 200; tries++) {
      const x = L + 40 + rnd() * ((lvl === 0 ? 316 : 556) - (L + 40)), y = T + 40 + rnd() * (B - T - 80);   // bola na mão: zona de trás da linha de cabeça (nível 0) ou quase toda a mesa
      if (!freeSpot(x, y)) continue;
      k++; cue.x = x; cue.y = y;
      const g = lvl === 0 ? [] : geoCands(me), sc = g.length ? g[0].score - (lvl >= 2 ? 40 * Math.min(3, g.length - 1) : 0) : 5000;
      if (sc < bs) { bs = sc; bestSpot = { x, y }; }
    }
    if (bestSpot) { cue.x = bestSpot.x; cue.y = bestSpot.y; } else { const sp = nearestFree(HEAD_X, H / 2); cue.x = sp.x; cue.y = sp.y; }
    ballInHand = false;
  }
  const plan = planShot(me, lvl, pers, lapse); let best = plan.best; const call = plan.call, nearest = plan.nearest;
  if (firstBreak) { const hb = balls.find(b => b.alive && b.n > 0 && b.x > APEX_X - 1 && b.x < APEX_X + 1); if (hb) best = { ang: Math.atan2(hb.y - cue.y, hb.x - cue.x), pw: 1, pi: null }; }   // abertura: força máxima na bola da frente
  if (!best) {                                  // sem tacada limpa: bate na bola legal mais próxima
    const nb = nearest[0];
    best = { ang: nb ? Math.atan2(nb.y - cue.y, nb.x - cue.x) : 0, pw: 0.55, pi: null, safe: true };
  }
  // erro de execução humano: cresce com o corte, a distância e a pressão (bola 8)
  const cut = best.cut || 0, dist = ((best.d || 300) + (best.ul || 200)) / 1200, pressure = call ? (lvl >= 3 ? 1.1 : 1.25) : 1;
  const sigma = noise * 0.58 * (0.5 + 1.2 * cut + 0.8 * dist) * pers.err * pressure;
  let ang = best.ang + gauss() * sigma;
  let pw = Math.max(0.12, Math.min(1, best.pw * (1 + gauss() * (0.02 + noise * 0.5))));
  if (firstBreak) pw = 0.97 + rnd() * 0.03;
  if (easyCpu && rnd() < 0.65) { ang += (rnd() - 0.5) * 1.4; pw = 0.2 + rnd() * 0.6; }   // falha de propósito
  let da = ang - aimAngle; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
  cpuSpin = { top: best.top || 0, side: best.side || 0 };
  cpuS = { ph: 'aim', t: 0, from: aimAngle, da, pw, call: call ? best.pi : null };
  if (call) called = best.pi;
  aiTimes.push(performance.now() - t00); if (aiTimes.length > 400) aiTimes.shift();
}
function cpuTick(dt) {
  const s = cpuS; if (!s) return;
  s.t += dt;
  if (s.ph === 'wait') { if (s.t >= 0.9) cpuDecide(); }
  else if (s.ph === 'aim') {
    const k = Math.min(1, s.t / 0.7);
    aimAngle = s.from + s.da * (k * (2 - k));
    setPower(s.pw * Math.min(1, Math.max(0, (k - 0.4) / 0.6)));
    if (k >= 1) { s.ph = 'hold'; s.t = 0; }
  } else if (s.ph === 'hold' && s.t >= 0.25) {
    cpuS = null; setPower(0); fire(aimAngle, s.pw, s.call);
  }
}
function nearestFree(x, y) {
  if (freeSpot(x, y)) return { x, y };
  for (let r = 6; r < 400; r += 6) for (let a = 0; a < 6.28; a += 0.4) {
    const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
    if (freeSpot(px, py)) return { x: px, y: py };
  }
  return { x, y };
}
function freeSpot(x, y) {
  if (x < L + BR || x > Rr - BR || y < T + BR || y > B - BR) return false;
  if (POCKETS.some(pk => Math.hypot(x - pk.x, y - pk.y) < pk.r + BR)) return false;
  return !balls.some(b => b !== cue && b.alive && Math.hypot(b.x - x, b.y - y) < BR * 2.1);
}
