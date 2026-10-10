'use strict';
// Tacada, física de referência (rolamento/deslize, efeito, tabelas, caçapas) e previsão da mira.

// ---------- Tacada e física ----------
// ---------- Física (modelo de referência) ----------
// Cada bola tem velocidade (vx,vy) e rotação (wx,wy,wz): wx,wy = rolamento/topspin/backspin (eixos horizontais), wz = efeito lateral (eixo vertical).
// Velocidade do ponto de contacto com o pano: u = (vx - R·wy, vy + R·wx). u = 0 -> rola; u != 0 -> desliza (atrito de deslizamento).
// Unidades: px, s. 1 m ~ 312 px, logo g ~ 3058 px/s².
// parâmetros afináveis do modelo (ver tests/physics.html); expostos em __pool.phys.PH só em debug
const PH = { slide: 0.12, cushE0: 0.95, cushK: 0.00012, cushMin: 0.6, ballE: 0.96, rollA: 35, rollB: 0.18 };
const GRAV = 3058, MU_BALL = 0.06, MU_CUSH = 0.16, SPIN_DECAY = 5 * 0.044 * GRAV / (2 * BR);
const SLIDE_EPS = 3, CUSH_H = 0.25 * BR, JAW_R = 3.5, JAW_P = 2, JAW_E = 0.5, MOUTH_C = 33, MOUTH_S = 27, SQUIRT = 0.07, MAX_OFF = 0.5;
const MAX_STEP_PX = 5;                            // deslocamento máximo por sub-passo (colisão contínua: nunca atravessa uma bola)
const JAWS = (() => {                             // pontas (narizes) das tabelas à boca de cada caçapa: arredondadas e a sobressair JAW_P px da face
  const j = [], o = JAW_R - JAW_P;                // centro do nariz fica "dentro" da tabela, a sobressair JAW_P para a mesa
  for (const p of POCKETS) {
    if (p.x === MIDX) { const sy = p.y === T ? -1 : 1; j.push({ x: p.x - MOUTH_S, y: p.y + sy * o }, { x: p.x + MOUTH_S, y: p.y + sy * o }); }
    else { const sx = p.x === L ? 1 : -1, sy = p.y === T ? 1 : -1; j.push({ x: p.x + sx * MOUTH_C, y: p.y - sy * o }, { x: p.x - sx * o, y: p.y + sy * MOUTH_C }); }
  }
  return j;
})();



// gerador pseudo-aleatório com semente (mulberry32): usado em tudo o que afeta o jogo (baralhar bolas, CPU, bola na mão)
let rngS = (Date.now() ^ 0x9e3779b9) >>> 0;
function rnd() { rngS = (rngS + 0x6D2B79F5) >>> 0; let t = rngS; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }

// Tacada: o taco bate a distância (side, top) do centro (em raios, via cue.spin) e eventualmente elevado (massé).
function launch(angle, pw, pmul, top, side, elev) {
  elev = elev || 0;
  const v = MAX_SPEED * pw * pmul, a = Math.max(-MAX_OFF, Math.min(MAX_OFF, side * 0.4)), b = Math.max(-MAX_OFF, Math.min(MAX_OFF, top * 0.4));
  const c = Math.cos(angle), s = Math.sin(angle), rx = -s, ry = c;     // frente e direita (y para baixo)
  const sq = SQUIRT * a * Math.cos(elev);                              // squirt: a bola desvia-se para o lado oposto ao efeito
  let fx = c - sq * rx, fy = s - sq * ry; const fl = Math.hypot(fx, fy); fx /= fl; fy /= fl;
  const vh = v * Math.cos(elev);
  cue.vx = fx * vh; cue.vy = fy * vh;
  const k = 2.5 * vh / BR;                                             // 5/(2R²)·impulso
  cue.wz = -k * a;                                                    // efeito lateral
  const kt = k * b;                                                    // rolamento extra (top/back): b = 0.4R rola logo sem deslizar
  cue.wx = -fy * kt; cue.wy = fx * kt;
  if (elev > 0) {                                                      // massé: componente vertical do impulso com offset lateral roda a bola em torno do eixo da tacada
    const kf = -2.5 * a * v * Math.sin(elev) / BR;
    cue.wx += fx * kf; cue.wy += fy * kf;
  }
  cue.dx = c; cue.dy = s; cue.touched = false; cue.top = top; cue.side = side;
}
function fire(angle, pw, call) {
  wake();
  if (mode === 'train') trainCell = heatCell(cue.x, cue.y);
  audio();
  if (tut && !isCpuTurn()) { if (tut.step < 3) { tut.step = 3; tut.wait = true; hideCoach(); } else finishTut(); }
  if (call === undefined) call = needsCall(turn) ? (calledManual ? called : autoCall(angle)) : null;
  pre = makePre(turn, call);
  shot = newShot();
  state = 'moving'; cpuS = null;
  powerEl.classList.add('disabled'); spinEl.classList.add('disabled'); nudgeEl.classList.add('disabled');
  const cpu = isCpuTurn(), sp = cpu ? 0 : curCue().spin;
  // o ponto de impacto vem do círculo de efeito: até 70% do raio é efeito normal; o anel exterior eleva o taco (massé)
  const r = Math.hypot(spin.x, spin.y), rr = Math.min(r, 0.7) / 0.7, elev = r > 0.7 ? Math.min(1, (r - 0.7) / 0.15) * 0.9 : 0;
  const top = cpu ? cpuSpin.top : !r ? 0 : spin.y / r * rr * sp, side = cpu ? cpuSpin.side : !r ? 0 : spin.x / r * rr * sp;
  // o taco recua (já mostrado pela barra), avança depressa e só no impacto a bola sai (ver frame())
  strike = { ang: angle, pw, pull0: 14 + pw * 70, t: 0, dur: 0.14 - 0.06 * pw, launched: false, fade: 0, cx: cue.x, cy: cue.y,
    args: [angle, pw, cpu ? 1 : curCue().power, top, side, cpu ? 0 : elev] };
  shotPw = pw; shotCount++;
  ballInHand = false;
  firstBreak = false;
}

// Tabela: n = normal virada para fora. Restituição depende da velocidade normal (e portanto do ângulo); atrito tangencial usa o efeito lateral.
function rail(b, nx, ny) {
  const vn = b.vx * nx + b.vy * ny;
  if (vn <= 0) return 0;
  sndRail(vn);
  if (!SIM && vn > 900 && !lowFx()) FX.shake = Math.max(FX.shake, 0.08);
  const e = Math.max(PH.cushMin, PH.cushE0 - PH.cushK * vn), jn = (1 + e) * vn;
  const tx = -ny, ty = nx, st = b.vx * tx + b.vy * ty + BR * b.wz - CUSH_H * (b.wx * nx + b.wy * ny);
  let jt = -st / 3.5; const lim = MU_CUSH * jn; if (jt > lim) jt = lim; else if (jt < -lim) jt = -lim;
  b.vx += -jn * nx + jt * tx; b.vy += -jn * ny + jt * ty;
  b.wz += 2.5 * jt / BR;
  const kh = 2.5 * CUSH_H * jn / (BR * BR);                  // a altura de contacto converte parte do rolamento (topspin/backspin) em efeito
  b.wx += kh * ny; b.wy += -kh * nx;
  if (shot) {
    if (shot.first != null) shot.railAfter = true;
    if (b.n > 0 && !shot.railBalls.includes(b.n)) shot.railBalls.push(b.n);
  }
  return vn;
}

function slideRoll(b, dt) {                        // atrito com o pano: desliza até u = 0, depois rola com resistência
  const fm = fMul;
  let ux = b.vx - BR * b.wy, uy = b.vy + BR * b.wx, ul = Math.hypot(ux, uy), rem = dt;
  if (ul > SLIDE_EPS) {
    const a = PH.slide * GRAV * fm, h = Math.min(dt, ul / (3.5 * a)), ex = ux / ul, ey = uy / ul, al = 5 * a / (2 * BR);
    b.vx -= a * ex * h; b.vy -= a * ey * h;
    b.wx -= al * ey * h; b.wy += al * ex * h;
    rem = dt - h;
    if (rem > 1e-9) { b.wy = b.vx / BR; b.wx = -b.vy / BR; }   // acabou de deslizar: rola
    else rem = 0;
  } else { b.wy = b.vx / BR; b.wx = -b.vy / BR; }
  if (rem > 0) {
    const sp = Math.hypot(b.vx, b.vy);
    if (sp > 0) {
      const ns = Math.max(0, sp - (PH.rollA + sp * PH.rollB) * fm * rem);
      const k = ns / sp; b.vx *= k; b.vy *= k; b.wy = b.vx / BR; b.wx = -b.vy / BR;
      if (ns < 6) { b.vx = 0; b.vy = 0; b.wx = 0; b.wy = 0; }
    }
  }
  if (b.wz) { const d = SPIN_DECAY * dt; b.wz = Math.abs(b.wz) <= d ? 0 : b.wz - Math.sign(b.wz) * d; }
  if (!b.vx && !b.vy && Math.abs(b.wx) + Math.abs(b.wy) < 0.5) { b.wx = b.wy = 0; b.wz = 0; }
}

function step(dt) {
  let vm = 0;
  for (const b of balls) if (b.alive) { const v = Math.abs(b.vx) + Math.abs(b.vy); if (v > vm) vm = v; }
  const n = Math.max(1, Math.ceil(vm * dt / MAX_STEP_PX));
  for (let i = 0; i < n; i++) stepCore(dt / n);
}

function stepCore(dt) {
  const bs = balls;
  for (const b of bs) {
    if (!b.alive) continue;
    b.x += b.vx * dt; b.y += b.vy * dt;
    slideRoll(b, dt);
    // caçapas
    for (let k = 0; k < POCKETS.length; k++) {
      const pk = POCKETS[k];
      if (Math.hypot(b.x - pk.x, b.y - pk.y) < pk.r) { pocket(b, k); break; }
    }
    if (!b.alive) continue;
    // pontas das tabelas (jaws)
    if (b.x < L + BR + 2 || b.x > Rr - BR - 2 || b.y < T + BR + 2 || b.y > B - BR - 2) for (const j of JAWS) {
      const dx = b.x - j.x, dy = b.y - j.y, d2 = dx * dx + dy * dy, md = BR + JAW_R;
      if (d2 >= md * md || d2 === 0) continue;
      const d = Math.sqrt(d2), nx = dx / d, ny = dy / d, vn = b.vx * nx + b.vy * ny;
      b.x = j.x + nx * md; b.y = j.y + ny * md;
      if (vn < 0) {
        b.vx -= (1 + JAW_E) * vn * nx; b.vy -= (1 + JAW_E) * vn * ny; if (vn < -40) sndRail(-vn);
        if (shot) { if (shot.first != null) shot.railAfter = true; if (b.n > 0 && !shot.railBalls.includes(b.n)) shot.railBalls.push(b.n); }
      }
    }
    // tabelas (colisão contínua: recua até ao instante do contacto e avança com a velocidade nova). À boca das caçapas não há tabela.
    const inX = b.x > L + MOUTH_C && b.x < Rr - MOUTH_C && Math.abs(b.x - MIDX) > MOUTH_S, inY = b.y > T + MOUTH_C && b.y < B - MOUTH_C;
    if (b.x < L + BR && inY)  { const t = Math.min(dt, (L + BR - b.x) / Math.max(1, -b.vx)); b.x = L + BR;  if (rail(b, -1, 0)) b.x += b.vx * t; }
    if (b.x > Rr - BR && inY) { const t = Math.min(dt, (b.x - (Rr - BR)) / Math.max(1, b.vx)); b.x = Rr - BR; if (rail(b, 1, 0)) b.x += b.vx * t; }
    if (b.y < T + BR && inX)  { const t = Math.min(dt, (T + BR - b.y) / Math.max(1, -b.vy)); b.y = T + BR;  if (rail(b, 0, -1)) b.y += b.vy * t; }
    if (b.y > B - BR && inX)  { const t = Math.min(dt, (b.y - (B - BR)) / Math.max(1, b.vy)); b.y = B - BR; if (rail(b, 0, 1)) b.y += b.vy * t; }
    if (b.x < L - 2 * BR || b.x > Rr + 2 * BR || b.y < T - 2 * BR || b.y > B + 2 * BR) { b.x = Math.min(Rr - BR, Math.max(L + BR, b.x)); b.y = Math.min(B - BR, Math.max(T + BR, b.y)); }   // rede de segurança: nunca sair da mesa
  }
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < bs.length; i++) {
      const a = bs[i]; if (!a.alive) continue;
      for (let j = i + 1; j < bs.length; j++) {
        const c = bs[j]; if (!c.alive) continue;
        let px = c.x - a.x, py = c.y - a.y;
        const d2 = px * px + py * py, md = BR * 2;
        if (d2 >= md * md) continue;
        const wxr = c.vx - a.vx, wyr = c.vy - a.vy, w2 = wxr * wxr + wyr * wyr, pw = px * wxr + py * wyr;
        if (pass === 0 && pw < 0 && w2 > 1e-6) {               // a aproximar-se: recuar até ao instante exato do contacto
          let tau = (pw + Math.sqrt(pw * pw + w2 * (md * md - d2))) / w2;
          if (tau > dt) tau = dt; if (tau < 0) tau = 0;
          a.x -= a.vx * tau; a.y -= a.vy * tau; c.x -= c.vx * tau; c.y -= c.vy * tau;
          px = c.x - a.x; py = c.y - a.y;
          const d = Math.hypot(px, py) || md, nx = px / d, ny = py / d;
          collide(a, c, nx, ny);
          a.x += a.vx * tau; a.y += a.vy * tau; c.x += c.vx * tau; c.y += c.vy * tau;
          const q = Math.hypot(c.x - a.x, c.y - a.y);
          if (q < md && q > 0) { const o = (md - q) / 2, ux = (c.x - a.x) / q, uy = (c.y - a.y) / q; a.x -= ux * o; a.y -= uy * o; c.x += ux * o; c.y += uy * o; }
        } else {                                                // sobreposição residual: só separar (sem tremor)
          const d = Math.sqrt(d2) || 1e-6, nx = d2 === 0 ? 1 : px / d, ny = d2 === 0 ? 0 : py / d, ov = (md - d) / 2;
          if (ov > 1e-4) { a.x -= nx * ov; a.y -= ny * ov; c.x += nx * ov; c.y += ny * ov; }
          if (pass === 0 && pw < 0) collide(a, c, nx, ny);
        }
      }
    }
  }
}

// Colisão bola-bola: impulso normal (restituição) + impulso tangencial de atrito (throw e transferência de efeito lateral).
function collide(a, c, nx, ny) {
  const vr = (a.vx - c.vx) * nx + (a.vy - c.vy) * ny;
  if (vr <= 0) return;
  const jn = vr * (1 + PH.ballE) / 2;
  a.vx -= jn * nx; a.vy -= jn * ny; c.vx += jn * nx; c.vy += jn * ny;
  const tx = -ny, ty = nx, s = (a.vx - c.vx) * tx + (a.vy - c.vy) * ty + BR * (a.wz + c.wz);
  let jt = -s / 7; const lim = MU_BALL * jn; if (jt > lim) jt = lim; else if (jt < -lim) jt = -lim;
  a.vx += jt * tx; a.vy += jt * ty; c.vx -= jt * tx; c.vy -= jt * ty;
  a.wz += 2.5 * jt / BR; c.wz += 2.5 * jt / BR;
  if (vr > 20) sndHit(vr);
  fxHit(a, c, vr);
  if (shot && shot.first == null && (a === cue || c === cue)) shot.first = (a === cue ? c : a).n;
}

function pocket(b, k) {
  const sp = Math.hypot(b.vx, b.vy);
  b.alive = false; b.vx = b.vy = 0;
  if (b === cue) { if (shot) shot.scratch = true; }
  else if (shot) { shot.pocketed.push(b.n); shot.pkIdx[b.n] = k; shot.railAfter = true; }
  if (SIM) return;
  const pk = POCKETS[k]; fxPocket(pk, b);
  sinks.push({ b, x: b.x, y: b.y, k, t: 0 }); if (b !== cue) potCount++;
  Snd.tunk(sp); vib(Math.round(15 + shotPw * 45));
  if (b !== cue) addFloat(pk.x + Math.sign(W / 2 - pk.x) * 24, pk.y + Math.sign(H / 2 - pk.y) * 22, '+1', '#fff', 0.9);
  if (b.n === 8 && pre && pre.cleared && !pre.breakShot) { slow = 1.6; cam.fx = pk.x; cam.fy = pk.y; }   // última bola: câmara lenta
  updateHud();
}

function anyMoving() { return balls.some(b => b.alive && (b.vx || b.vy || Math.abs(b.wx) + Math.abs(b.wy) > 0.5)); }

// ---------- Mira / previsão ----------
function predict(angle) {
  const dx = Math.cos(angle), dy = Math.sin(angle);
  let best = { t: 1e9, hit: null, axis: null };
  if (dx > 0) best = minT(best, (Rr - BR - cue.x) / dx, null, 'x');
  if (dx < 0) best = minT(best, (L + BR - cue.x) / dx, null, 'x');
  if (dy > 0) best = minT(best, (B - BR - cue.y) / dy, null, 'y');
  if (dy < 0) best = minT(best, (T + BR - cue.y) / dy, null, 'y');
  for (const b of balls) {
    if (b === cue || !b.alive) continue;
    const fx = cue.x - b.x, fy = cue.y - b.y;
    const bb = fx * dx + fy * dy, cc = fx * fx + fy * fy - 4 * BR * BR;
    const disc = bb * bb - cc;
    if (disc < 0) continue;
    const t = -bb - Math.sqrt(disc);
    if (t > 0) best = minT(best, t, b, null);
  }
  return { gx: cue.x + dx * best.t, gy: cue.y + dy * best.t, hit: best.hit, axis: best.axis };
}
function minT(best, t, hit, axis) { return t > 0 && t < best.t ? { t, hit, axis } : best; }

// caçapa mais provável para a bola 8 na direção da mira
function autoCall(angle) {
  const p = predict(angle);
  if (!p.hit || p.hit.n !== 8) return null;
  let nx = p.hit.x - p.gx, ny = p.hit.y - p.gy; const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
  let bi = null, bs = -2;
  POCKETS.forEach((pk, i) => {
    const ux = pk.x - p.hit.x, uy = pk.y - p.hit.y, ul = Math.hypot(ux, uy) || 1;
    const s = (nx * ux + ny * uy) / ul - ul * 0.0004;
    if (s > bs) { bs = s; bi = i; }
  });
  return bi;
}
