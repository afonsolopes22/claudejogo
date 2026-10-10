'use strict';
// Orientação, tutorial, evento da semana, 2 jogadores, replay/GIF e treino.

// ---------- Orientação: paisagem é o modo oficial ----------
let orientPaused = false;
const isPortrait = () => innerHeight > innerWidth;
function checkOrient() {   // na vertical aparece "Roda o telemóvel" e a partida fica em pausa
  if (isPortrait()) { if (!paused && (state === 'aim' || state === 'moving')) { paused = true; orientPaused = true; } }
  else if (orientPaused) { orientPaused = false; if (!$('pause').classList.contains('show')) paused = false; }
  wake();
}
window.addEventListener('resize', checkOrient); window.addEventListener('orientationchange', checkOrient);
const lockLandscape = () => { try { if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {}); } catch (e) {} };
document.addEventListener('pointerdown', lockLandscape, { once: true });
// tempo de jogo real (para a regra dos 5 min sem anúncios): por relógio, porque o loop pára quando o jogador está a pensar
setInterval(() => { if (!paused && (state === 'aim' || state === 'moving') && document.visibilityState !== 'hidden') save.playSec += 1; }, 1000);

// ---------- Tutorial interativo (1.ª vez) ----------
const TUT = [
  { hl: ['stage', 'nudge'] },
  { hl: ['spin'] },
  { hl: ['power'] },
  { hl: ['stage'] },
];
const HL_IDS = ['stage', 'nudge', 'spin', 'power'];
const clearHl = () => HL_IDS.forEach(id => $(id).classList.remove('hl'));
function hideCoach() { $('coach').classList.remove('show'); document.body.classList.remove('coachOn'); clearHl(); }
function startTut() { tut = { step: 0, wait: false }; showCoach(0); }
function showCoach(i) {
  tut.step = i;
  $('coachTxt').innerHTML = tr('tut.' + (i + 1)); $('coach').classList.add('show'); document.body.classList.add('coachOn');
  clearHl(); TUT[i].hl.forEach(id => $(id).classList.add('hl'));
  tut.a0 = aimAngle; tut.cx = cue.x; tut.cy = cue.y;
  $('coachOk').style.display = i >= 2 ? 'none' : '';
}
function finishTut(msg) { tut = null; hideCoach(); save.tutDone = true; persist(); if (msg) toast(msg); }
function tutCheckAim() { if (tut && tut.step === 0 && Math.abs(wrapA(aimAngle - tut.a0)) > 0.1) showCoach(1); }
$('coachSkip').onclick = () => finishTut();
$('coachOk').onclick = () => { if (tut && tut.step < 2) showCoach(tut.step + 1); };

// ---------- Evento da semana: 52 mesas geradas por semente e validadas (janelas de acerto >= 0,03 rad) ----------
const WEEKS = [{"cue":[150,209],"goal":[1],"avoid":[],"par":1,"max":3,"balls":[[1,228,192],[3,288,60],[5,529,242]]},
  {"cue":[120,92],"goal":[15],"avoid":[],"par":1,"max":3,"balls":[[15,245,79],[14,418,220],[10,271,159],[12,540,115]]},
  {"cue":[202,188],"goal":[2,4],"avoid":[],"par":2,"max":4,"balls":[[2,300,225],[4,242,173],[1,566,261],[6,471,111],[3,605,329],[5,331,199]]},
  {"cue":[217,200],"goal":[14],"avoid":[],"par":1,"max":3,"balls":[[14,128,172],[10,655,84],[15,229,336],[12,659,130],[13,617,298],[11,84,236]]},
  {"cue":[115,153],"goal":[3],"avoid":[8],"par":1,"max":3,"balls":[[3,174,189],[7,140,286],[2,478,60],[8,102,181]]},
  {"cue":[310,270],"goal":[15,11],"avoid":[],"par":2,"max":4,"balls":[[15,373,234],[11,360,306],[12,268,97],[14,203,136],[13,493,98]]},
  {"cue":[276,162],"goal":[3],"avoid":[],"par":1,"max":3,"balls":[[3,145,76],[5,136,304],[2,497,163],[1,461,255],[7,623,273]]},
  {"cue":[266,209],"goal":[10],"avoid":[],"par":1,"max":3,"balls":[[10,325,266],[9,563,197],[14,509,64],[12,390,154],[15,105,229],[13,366,280]]},
  {"cue":[245,221],"goal":[7,5],"avoid":[],"par":2,"max":4,"balls":[[7,126,73],[5,64,93],[4,308,151],[1,238,110]]},
  {"cue":[191,85],"goal":[12],"avoid":[8],"par":1,"max":3,"balls":[[12,105,67],[13,640,214],[14,437,294],[15,586,260],[8,656,162]]},
  {"cue":[231,254],"goal":[1],"avoid":[],"par":1,"max":3,"balls":[[1,164,123],[2,271,340],[4,192,290],[6,456,152],[7,318,114]]},
  {"cue":[197,248],"goal":[11,15],"avoid":[],"par":2,"max":4,"balls":[[11,462,310],[15,267,206],[14,555,231],[13,674,132],[10,628,207],[9,463,61],[12,83,236]]},
  {"cue":[243,73],"goal":[7],"avoid":[],"par":1,"max":3,"balls":[[7,335,252],[5,622,310],[2,292,228]]},
  {"cue":[163,257],"goal":[10],"avoid":[],"par":1,"max":3,"balls":[[10,197,180],[11,392,294],[9,532,225],[15,526,113]]},
  {"cue":[194,280],"goal":[1,4],"avoid":[8],"par":2,"max":4,"balls":[[1,280,182],[4,424,345],[3,529,184],[7,166,270],[5,530,105],[6,168,85],[8,203,164]]},
  {"cue":[120,165],"goal":[14],"avoid":[],"par":1,"max":3,"balls":[[14,229,135],[13,517,105],[15,74,133],[12,593,160],[10,426,208],[11,233,185]]},
  {"cue":[194,161],"goal":[1],"avoid":[],"par":1,"max":3,"balls":[[1,276,240],[6,126,308],[3,403,96]]},
  {"cue":[237,182],"goal":[15,12],"avoid":[],"par":2,"max":4,"balls":[[15,264,173],[12,133,267],[11,472,206],[9,228,289],[13,474,246]]},
  {"cue":[301,328],"goal":[6],"avoid":[],"par":1,"max":3,"balls":[[6,321,254],[2,127,84],[5,597,212],[7,269,314],[4,178,262]]},
  {"cue":[249,144],"goal":[11],"avoid":[8],"par":1,"max":3,"balls":[[11,269,164],[15,507,214],[10,317,180],[14,433,344],[13,672,172],[9,530,246],[8,469,291]]},
  {"cue":[177,291],"goal":[7,1],"avoid":[],"par":2,"max":4,"balls":[[7,257,216],[1,456,191],[2,153,251],[4,406,185]]},
  {"cue":[139,67],"goal":[13],"avoid":[],"par":1,"max":3,"balls":[[13,73,217],[14,362,151],[15,454,120],[9,283,68]]},
  {"cue":[291,246],"goal":[5],"avoid":[],"par":1,"max":3,"balls":[[5,342,149],[2,655,96],[7,626,146],[3,190,333],[6,655,303]]},
  {"cue":[265,100],"goal":[13,14],"avoid":[],"par":2,"max":4,"balls":[[13,423,123],[14,341,132],[10,150,167],[9,578,159],[15,643,276],[11,219,75],[12,637,226]]},
  {"cue":[63,170],"goal":[1],"avoid":[8],"par":1,"max":3,"balls":[[1,119,141],[7,185,310],[5,429,326],[8,448,215]]},
  {"cue":[260,314],"goal":[10],"avoid":[],"par":1,"max":3,"balls":[[10,353,177],[15,274,133],[12,226,193],[14,117,72]]},
  {"cue":[149,261],"goal":[7,3],"avoid":[],"par":2,"max":4,"balls":[[7,227,174],[3,314,205],[4,147,83],[5,79,186],[1,621,290],[2,196,335]]},
  {"cue":[204,188],"goal":[9],"avoid":[],"par":1,"max":3,"balls":[[9,77,68],[11,510,214],[14,165,195],[10,580,63],[12,342,231],[15,126,178]]},
  {"cue":[249,130],"goal":[2],"avoid":[],"par":1,"max":3,"balls":[[2,283,260],[4,520,192],[3,471,62]]},
  {"cue":[126,297],"goal":[9,12],"avoid":[8],"par":2,"max":4,"balls":[[9,451,270],[12,204,228],[10,108,144],[11,186,72],[14,357,171],[8,487,125]]},
  {"cue":[90,207],"goal":[6],"avoid":[],"par":1,"max":3,"balls":[[6,184,169],[5,312,320],[4,205,324],[7,462,98],[1,496,249]]},
  {"cue":[210,319],"goal":[15],"avoid":[],"par":1,"max":3,"balls":[[15,96,87],[12,353,209],[13,272,248],[9,315,322],[10,169,308],[14,131,315]]},
  {"cue":[185,258],"goal":[2,6],"avoid":[],"par":2,"max":4,"balls":[[2,290,150],[6,399,241],[4,429,248],[3,388,307]]},
  {"cue":[236,190],"goal":[15],"avoid":[],"par":1,"max":3,"balls":[[15,60,302],[13,619,171],[10,411,103],[11,207,206]]},
  {"cue":[282,312],"goal":[4],"avoid":[8],"par":1,"max":3,"balls":[[4,150,188],[2,391,145],[7,555,204],[6,481,164],[3,608,180],[8,593,281]]},
  {"cue":[156,159],"goal":[14,11],"avoid":[],"par":2,"max":4,"balls":[[14,67,168],[11,286,300],[12,416,289],[13,573,225],[15,409,103],[9,273,148],[10,131,80]]},
  {"cue":[268,317],"goal":[7],"avoid":[],"par":1,"max":3,"balls":[[7,166,172],[1,441,163],[6,658,132]]},
  {"cue":[166,300],"goal":[11],"avoid":[],"par":1,"max":3,"balls":[[11,75,314],[9,425,68],[12,433,190],[13,572,251]]},
  {"cue":[155,346],"goal":[4,3],"avoid":[],"par":2,"max":4,"balls":[[4,301,148],[3,426,240],[1,372,133],[2,668,294],[6,163,197],[7,187,108]]},
  {"cue":[172,234],"goal":[15],"avoid":[8],"par":1,"max":3,"balls":[[15,222,201],[12,678,206],[13,460,268],[10,325,123],[9,321,194],[14,75,191],[8,409,164]]},
  {"cue":[161,85],"goal":[6],"avoid":[],"par":1,"max":3,"balls":[[6,154,157],[7,303,331],[3,334,94]]},
  {"cue":[315,338],"goal":[14,12],"avoid":[],"par":2,"max":4,"balls":[[14,122,183],[12,172,321],[11,607,317],[13,445,73],[15,555,177]]},
  {"cue":[213,190],"goal":[1],"avoid":[],"par":1,"max":3,"balls":[[1,78,66],[3,573,227],[7,670,215],[4,81,268],[2,483,155]]},
  {"cue":[167,302],"goal":[9],"avoid":[],"par":1,"max":3,"balls":[[9,146,174],[10,211,256],[14,562,138],[12,341,108],[15,295,334],[11,507,291]]},
  {"cue":[218,202],"goal":[6,3],"avoid":[8],"par":2,"max":4,"balls":[[6,317,75],[3,243,97],[1,442,124],[7,438,207],[8,521,318]]},
  {"cue":[276,185],"goal":[15],"avoid":[],"par":1,"max":3,"balls":[[15,164,220],[14,290,276],[9,236,342],[12,630,118]]},
  {"cue":[224,95],"goal":[4],"avoid":[],"par":1,"max":3,"balls":[[4,63,311],[5,229,152],[2,337,235],[6,326,149],[3,132,150]]},
  {"cue":[188,336],"goal":[15,12],"avoid":[],"par":2,"max":4,"balls":[[15,505,243],[12,178,178],[13,217,190],[11,334,185],[9,479,277],[10,462,311],[14,624,253]]},
  {"cue":[132,210],"goal":[6],"avoid":[],"par":1,"max":3,"balls":[[6,75,163],[2,646,188],[3,362,204]]},
  {"cue":[264,68],"goal":[12],"avoid":[8],"par":1,"max":3,"balls":[[12,205,225],[10,147,58],[14,615,96],[11,260,325],[8,209,135]]},
  {"cue":[170,114],"goal":[5,1],"avoid":[],"par":2,"max":4,"balls":[[5,78,328],[1,284,215],[6,436,344],[3,459,298],[7,120,138],[4,535,280]]},
  {"cue":[185,203],"goal":[12],"avoid":[],"par":1,"max":3,"balls":[[12,279,321],[9,652,167],[15,615,341],[11,321,276],[13,126,345],[10,75,112]]}];
// ================= Fase 10: modos extra =================
// ---------- 2 Jogadores: nomes, séries (melhor de 1/3/5) e placar ----------
function startP2() {
  let n0 = ($('p2n0').value.trim() || tr('ui.p1')).slice(0, 12), n1 = ($('p2n1').value.trim() || tr('ui.p2')).slice(0, 12);
  if (n1 === n0) n1 = (n1.slice(0, 10) + ' 2');
  const len = +(document.querySelector('#p2len .on') || { dataset: { len: 1 } }).dataset.len;
  save.p2 = { names: [$('p2n0').value.trim(), $('p2n1').value.trim()], len }; persist();
  p2cfg = { names: [n0, n1] }; series = { len, w: [0, 0], games: 0, done: false };
  newGame('2p');
}
function renderP2Setup() {
  const p = save.p2 || { names: ['', ''], len: 1 };
  $('p2n0').value = p.names[0] || ''; $('p2n1').value = p.names[1] || '';
  $('p2n0').placeholder = tr('ui.p1'); $('p2n1').placeholder = tr('ui.p2');
  document.querySelectorAll('#p2len button').forEach(b => b.classList.toggle('on', +b.dataset.len === p.len));
  $('p2stat').textContent = tr('p2.stat', { g: save.p2g || 0, s: save.p2s || 0 });
}
function p2EndGame(winner) {                       // chamado em endGame no modo 2 jogadores
  if (!p2cfg) return null;                         // tutorial ou jogo sem configuração: não conta
  save.p2g = (save.p2g || 0) + 1;
  if (!series) return null;
  series.games++; series.w[winner]++;
  const need = Math.ceil(series.len / 2);
  series.done = series.len === 1 || series.w[winner] >= need;
  if (series.done && series.len > 1) save.p2s = (save.p2s || 0) + 1;
  persist();
  return series;
}

// ---------- Replay da última tacada ----------
const REC = { on: false, k: 0, frames: [], init: null, M: null, last: null };
const RP = { active: false, f: 0, acc: 0, sp: 1, from: null, rb: [], sinks: [], hold: 0, busy: false };
function recStart() { REC.on = true; REC.k = 0; REC.frames = []; REC.init = balls.map(b => [b.n, b.x, b.y, b.alive ? 1 : 0]); REC.M = balls.map(b => b.M.slice()); }
function recTick() {
  if (!REC.on || (++REC.k & 3) || REC.frames.length >= 900) return;           // 60 Hz de tempo de simulação, no máximo 15 s
  const a = new Float32Array(balls.length * 3);
  for (let i = 0; i < balls.length; i++) { const b = balls[i]; a[i * 3] = b.x; a[i * 3 + 1] = b.y; a[i * 3 + 2] = b.alive ? 1 : 0; }
  REC.frames.push(a);
}
function recStop() { if (!REC.on) return; REC.on = false; if (REC.frames.length > 8) REC.last = { init: REC.init, M: REC.M, frames: REC.frames }; }
function rpReset() {
  const L = REC.last; RP.f = 0; RP.acc = 0; RP.hold = 0; RP.sinks = [];
  RP.rb = L.init.map((q, i) => ({ n: q[0], x: q[1], y: q[2], px: q[1], py: q[2], vx: 0, vy: 0, alive: q[3] === 1, M: L.M[i].slice(), dirty: true, cv: null }));
}
function rpApply(f) {                              // coloca as bolas na frame f (a rodar de acordo com o deslocamento)
  const fr = REC.last.frames[f];
  for (let i = 0; i < RP.rb.length; i++) {
    const b = RP.rb[i], nx = fr[i * 3], ny = fr[i * 3 + 1], al = fr[i * 3 + 2] === 1;
    if (b.alive && al) { const dx = nx - b.x, dy = ny - b.y, d = Math.hypot(dx, dy); b.vx = dx * 60; b.vy = dy * 60; if (d > 0.02 && d < 80) roll(b, dx, dy, d); } else { b.vx = b.vy = 0; }
    if (b.alive && !al) { let k = 0, bd = 1e9; POCKETS.forEach((pk, j) => { const dd = Math.hypot(pk.x - b.x, pk.y - b.y); if (dd < bd) { bd = dd; k = j; } }); RP.sinks.push({ b, x: b.x, y: b.y, k, t: 0 }); }
    b.x = nx; b.y = ny; b.alive = al;
  }
}
function startReplay(from) {
  if (!REC.last) { toast(tr('rp.none')); return; }
  RP.active = true; RP.from = from; RP.sp = 1; rpReset(); rpApply(0);
  document.querySelectorAll('.overlay').forEach(o => { if (o.id !== 'adov') o.classList.remove('show'); });
  $('rpBar').classList.add('show'); $('rpSlow').classList.remove('on'); $('rpMsg').textContent = ''; wake();
}
function stopReplay() {
  if (RP.busy) return;
  RP.active = false; $('rpBar').classList.remove('show');
  if (RP.from === 'pause') open('pause'); else if (RP.from === 'over') open('over');
  wake();
}
function replayStep(dt) {
  if (RP.busy) return;                             // a captar o GIF: o estado do replay é só da captura
  const n = REC.last.frames.length;
  if (RP.f >= n - 1) { RP.hold += dt; if (RP.hold > 1.1) { rpReset(); rpApply(0); } }
  else { RP.acc += dt * 60 * RP.sp; while (RP.acc >= 1 && RP.f < n - 1) { RP.acc -= 1; RP.f++; rpApply(RP.f); } }
  for (const s of RP.sinks) s.t += dt; if (RP.sinks.length) RP.sinks = RP.sinks.filter(s => s.t < 0.3);
}
function paintReplayScene(now) {
  ctx.drawImage(tableCv, 0, 0, W, H);
  for (const b of RP.rb) if (b.alive) drawBallShadow(b);
  drawSinks(RP.sinks);
  for (const b of RP.rb) if (b.alive && b.n) { drawTrail(b); drawBall(b, b.x, b.y, BR); }
  const c = RP.rb[0]; if (c && c.alive) { drawTrail(c); drawBall(c, c.x, c.y, BR); }
}
$('rpClose').onclick = () => stopReplay();
$('rpSlow').onclick = () => { RP.sp = RP.sp === 1 ? 0.35 : 1; $('rpSlow').classList.toggle('on', RP.sp !== 1); };

// ---------- GIF animado (codificador próprio, sem bibliotecas) ----------
const GIF_BAY = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
function gifQuant(d, w, h) {                       // paleta fixa 6x6x6 + cinzas, com tramado ordenado
  const o = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4, t = (GIF_BAY[(y & 3) * 4 + (x & 3)] - 7.5) * 2.4;
    const r = Math.min(5, Math.max(0, Math.round((d[i] + t) / 51))), g = Math.min(5, Math.max(0, Math.round((d[i + 1] + t) / 51))), b = Math.min(5, Math.max(0, Math.round((d[i + 2] + t) / 51)));
    o[y * w + x] = r * 36 + g * 6 + b;
  }
  return o;
}
function gifLZW(px) {                              // LZW do GIF (código mínimo 8)
  const MIN = 8, CLEAR = 256, EOI = 257, out = []; let size = MIN + 1, next = EOI + 1, maxc = (1 << size) - 1, cur = 0, bits = 0;
  const emit = c => { cur |= c << bits; bits += size; while (bits >= 8) { out.push(cur & 255); cur >>>= 8; bits -= 8; } };
  const dict = new Map(); emit(CLEAR);
  let pre = px[0];
  for (let i = 1; i < px.length; i++) {
    const k = px[i], key = (pre << 8) | k, v = dict.get(key);
    if (v !== undefined) { pre = v; continue; }
    emit(pre);
    if (next > maxc && next < 4096) { size++; maxc = (1 << size) - 1; }
    if (next < 4096) dict.set(key, next++);
    else { emit(CLEAR); dict.clear(); size = MIN + 1; next = EOI + 1; maxc = (1 << size) - 1; }
    pre = k;
  }
  emit(pre); emit(EOI); if (bits > 0) out.push(cur & 255);
  return out;
}
function gifEncode(frames, w, h) {                 // frames: [{px: Uint8Array, delay: cs}]
  const b = [], u16 = v => b.push(v & 255, (v >> 8) & 255);
  for (const c of 'GIF89a') b.push(c.charCodeAt(0));
  u16(w); u16(h); b.push(0xF7, 0, 0);
  for (let i = 0; i < 256; i++) { if (i < 216) b.push(Math.floor(i / 36) * 51, Math.floor(i / 6) % 6 * 51, (i % 6) * 51); else { const g = Math.round((i - 216) * 255 / 39); b.push(g, g, g); } }
  b.push(0x21, 0xFF, 11); for (const c of 'NETSCAPE2.0') b.push(c.charCodeAt(0)); b.push(3, 1, 0, 0, 0);
  for (const f of frames) {
    b.push(0x21, 0xF9, 4, 0x00); u16(f.delay); b.push(0, 0);
    b.push(0x2C); u16(0); u16(0); u16(w); u16(h); b.push(0, 8);
    const data = gifLZW(f.px);
    for (let i = 0; i < data.length; i += 255) { const n = Math.min(255, data.length - i); b.push(n); for (let j = 0; j < n; j++) b.push(data[i + j]); }
    b.push(0);
  }
  b.push(0x3B);
  return new Uint8Array(b);
}
async function makeReplayGif(onProgress) {         // repete a tacada fora do tempo real, capta o canvas e codifica
  const L = REC.last, n = L.frames.length, stride = Math.max(4, Math.ceil(n / 90)), gw = 320, gh = 172;
  const cap = document.createElement('canvas'); cap.width = gw; cap.height = gh; const g = cap.getContext('2d', { willReadFrequently: true });
  const dpr = view.dpr || 1, sx = view.ox * dpr, sy = view.oy * dpr, sw = W * view.s * dpr, sh = H * view.s * dpr;
  const frames = [], delay = Math.max(2, Math.round(stride * 100 / 60));
  rpReset(); rpApply(0);
  const idxs = []; for (let f = 0; f < n; f += stride) idxs.push(f); if (idxs[idxs.length - 1] !== n - 1) idxs.push(n - 1);
  let k = 0;
  for (const f of idxs) {
    while (RP.f < f) { RP.f++; rpApply(RP.f); }
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height); ctx.setTransform(dpr * view.s, 0, 0, dpr * view.s, dpr * view.ox, dpr * view.oy);
    for (const s of RP.sinks) s.t = 0.05; paintReplayScene(0);
    g.drawImage(cv, sx, sy, sw, sh, 0, 0, gw, gh);
    frames.push({ px: gifQuant(g.getImageData(0, 0, gw, gh).data, gw, gh), delay: f === n - 1 ? 110 : delay });
    if (++k % 3 === 0) { if (onProgress) onProgress(Math.round(100 * k / idxs.length)); await new Promise(r => setTimeout(r, 0)); }
  }
  rpReset(); rpApply(0);
  return new Blob([gifEncode(frames, gw, gh)], { type: 'image/gif' });
}
$('rpGif').onclick = async () => {
  if (RP.busy || !REC.last) return;
  RP.busy = true; $('rpGif').disabled = true;
  try {
    const blob = await makeReplayGif(p => { $('rpMsg').textContent = tr('rp.making', { p }); });
    const file = new File([blob], 'cue-legends-replay.gif', { type: 'image/gif' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file], title: 'Cue Legends' }); } catch (e) { /* cancelado */ } $('rpMsg').textContent = ''; }
    else { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = file.name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); $('rpMsg').textContent = tr('rp.saved'); }
  } catch (e) { $('rpMsg').textContent = tr('rp.err'); }
  RP.busy = false; $('rpGif').disabled = false;
};
$('btnReplay').onclick = () => startReplay('pause');
$('btnOverReplay').onclick = () => startReplay('over');

// ---------- Treino: mesa livre com assistente e mapa de calor ----------
const HEAT_C = 12, HEAT_R = 6;
let assistOn = true, heatOn = false, sug = null, trainCell = -1;
const heatCell = (x, y) => Math.max(0, Math.min(HEAT_R - 1, Math.floor((y - T) / (B - T) * HEAT_R))) * HEAT_C + Math.max(0, Math.min(HEAT_C - 1, Math.floor((x - L) / (Rr - L) * HEAT_C)));
function trainSave() { if (!save.train) save.train = { shots: 0, pots: 0, a: new Array(HEAT_C * HEAT_R).fill(0), p: new Array(HEAT_C * HEAT_R).fill(0) }; return save.train; }
function startTrain() {
  trainSave(); sug = null; assistOn = true; heatOn = false;
  newGame('train');
}
function hudTrain() {
  const t = trainSave();
  $('p0').classList.toggle('active', false); $('p1').classList.toggle('active', assistOn);
  $('n0').textContent = tr('train.name'); $('g0').textContent = tr('train.stats', { s: t.shots, p: t.pots }); $('d0').innerHTML = '';
  $('n1').textContent = tr('train.assist'); $('g1').textContent = tr(assistOn ? 'fx.on' : 'fx.off'); $('d1').innerHTML = '';
}
function updateSuggestion() {                      // a mesma IA do nível Mestre (sem erro) escolhe a melhor tacada
  sug = null; $('powSug').style.display = 'none';
  if (!assistOn || mode !== 'train' || state !== 'aim' || !cue.alive) return;
  const gSave = groups.slice(); groups[0] = null;
  let r = null; try { r = planShot(0, 3, PERSONAS.bal, 0); } catch (e) { r = null; }
  groups[0] = gSave[0];
  const rackFull = balls.filter(b => b.alive && b.n).length === 15 && balls.every(b => !b.n || b.x > APEX_X - 2);        // mesa por abrir: sugere a abertura
  if (rackFull) { const hb = balls.find(b => b.alive && b.n && b.x < APEX_X + 1); r = hb ? { best: { ang: Math.atan2(hb.y - cue.y, hb.x - cue.x), pw: 0.85, pi: null } } : null; }
  if (r && r.best) { sug = { ang: r.best.ang, pw: r.best.pw, pi: r.best.pi, safe: !!r.best.safe }; aimAngle = sug.ang; $('powSug').style.display = 'block'; $('powSug').style.bottom = (Math.round(sug.pw * 100)) + '%'; }
}
function drawSuggestion(now) {
  if (!sug || !assistOn) return;
  const dx = Math.cos(sug.ang), dy = Math.sin(sug.ang), p = predict(sug.ang), pulse = lowFx() ? 0.5 : Math.sin(now / 260) * 0.5 + 0.5;
  ctx.save(); ctx.lineCap = 'round'; ctx.strokeStyle = 'rgba(255,213,74,' + (0.55 + 0.3 * pulse).toFixed(2) + ')'; ctx.lineWidth = 2; ctx.setLineDash([6, 6]);
  ctx.beginPath(); ctx.moveTo(cue.x + dx * BR, cue.y + dy * BR); ctx.lineTo(p.gx, p.gy); ctx.stroke(); ctx.setLineDash([]);
  if (sug.pi != null) { const pk = POCKETS[sug.pi]; ctx.shadowColor = '#ffd54a'; ctx.shadowBlur = lowFx() ? 0 : 10; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.arc(pk.x, pk.y, pk.r + 2 + pulse * 2, 0, 7); ctx.stroke(); }
  ctx.restore();
}
function drawHeat() {
  const t = save.train; if (!t) return;
  const cw = (Rr - L) / HEAT_C, ch = (B - T) / HEAT_R;
  ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '700 9px sans-serif';
  for (let r = 0; r < HEAT_R; r++) for (let c = 0; c < HEAT_C; c++) {
    const i = r * HEAT_C + c, a = t.a[i]; if (!a) continue;
    const rate = t.p[i] / a;
    ctx.fillStyle = 'hsla(' + Math.round(120 * rate) + ',85%,50%,' + Math.min(0.55, 0.18 + a * 0.05).toFixed(2) + ')';
    ctx.fillRect(L + c * cw + 1, T + r * ch + 1, cw - 2, ch - 2);
    ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.fillText(Math.round(rate * 100) + '%', L + (c + 0.5) * cw, T + (r + 0.5) * ch);
  }
  ctx.restore();
}
function resolveTrain() {
  const t = trainSave(), n = shot.pocketed.length;
  t.shots++; t.pots += n;
  if (trainCell >= 0) { t.a[trainCell]++; if (n) t.p[trainCell]++; }
  trainCell = -1;
  let msg = '';
  if (shot.scratch) { const sp = nearestFree(HEAD_X, H / 2); cue.alive = true; cue.x = sp.x; cue.y = sp.y; cue.vx = cue.vy = 0; addFloat(W / 2, H * 0.42, tr('f.foul'), '#ff6a5a', 1.5); Snd.foul(); }
  else if (n) addFloat(W / 2, H * 0.42, tr(n >= 3 ? 'f.triple' : n === 2 ? 'f.double' : 'f.good'), '#ffd54a', n >= 2 ? 1.6 : 1.3);
  if (!balls.some(b => b.alive && b.n && b.n !== 8)) { rack(); firstBreak = false; fMul = curCloth().fr; msg = tr('train.newTable'); }
  persist(); updateHud(); startTurn(msg);
  setTimeout(() => { if (mode === 'train' && state === 'aim') { updateSuggestion(); wake(); } }, 60);
}

// ---------- Evento da semana (mesa por semente, igual para todos, só local) ----------
const WEEK0 = Date.UTC(2024, 0, 1);               // 2024-01-01 (segunda-feira)
const weekNo = () => { const d = new Date(); return Math.max(0, Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - WEEK0) / 86400000 / 7)); };
let weekPlaying = 0;
const weekLevel = (k) => { const L0 = WEEKS[(k == null ? weekNo() : k) % WEEKS.length]; return { cue: L0.cue.slice(), goal: L0.goal.slice(), avoid: L0.avoid.slice(), par: L0.par, max: L0.max, balls: L0.balls.map(b => b.slice()) }; };
function weekState(k) { k = k == null ? weekNo() : k; if (!save.weekly || save.weekly.k !== k) save.weekly = { k, stars: 0, best: 0 }; return save.weekly; }
function weekLeft() { const d = new Date(), dn = Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - WEEK0) / 86400000); return 7 - dn % 7; }
function weekSubText() {
  const w = weekState(), dl = weekLeft();
  return tr('week.sub', { n: weekNo() % 52 + 1, s: w.stars ? '⭐'.repeat(w.stars) : '☆☆☆', d: dl });
}
function startWeekly() { weekPlaying = weekNo(); weekState(weekPlaying); startChal(-2, weekLevel(weekPlaying)); }
function settleWeekly(stars) {                     // recompensa só quando melhora as estrelas da semana em que a mesa começou
  const w = weekState(weekPlaying); let coins = 0, extra = '';
  if (stars > w.stars) { coins = (stars - w.stars) * 40 + (w.stars === 0 ? 40 : 0); save.coins += coins; extra = addXp(15 * (stars - w.stars)); w.stars = stars; w.best = chalShots; save.weeklyStars = (save.weeklyStars || 0) + 1; }
  return { coins, extra };
}
function renderModes() { $('weekSub').textContent = weekSubText(); }
$('btnModes').onclick = () => { audio(); renderModes(); open('modes'); };
$('btnM2p').onclick = () => { audio(); renderP2Setup(); open('p2setup'); };
$('btnMTrain').onclick = () => { audio(); startTrain(); };
$('btnMWeek').onclick = () => { audio(); startWeekly(); };
$('p2back').onclick = () => { renderModes(); open('modes'); };
document.querySelectorAll('#p2len button').forEach(b => b.onclick = () => { document.querySelectorAll('#p2len button').forEach(x => x.classList.toggle('on', x === b)); });
$('btnP2go').onclick = () => { audio(); startP2(); };
$('p1').addEventListener('click', () => { if (mode !== 'train') return; assistOn = !assistOn; if (assistOn) updateSuggestion(); else { sug = null; $('powSug').style.display = 'none'; } updateHud(); toast(tr('train.assist') + ': ' + tr(assistOn ? 'fx.on' : 'fx.off')); wake(); });
$('p0').addEventListener('click', () => { if (mode !== 'train') return; heatOn = !heatOn; toast(heatOn ? tr('train.heatHint') : tr('train.heat') + ': ' + tr('fx.off')); wake(); });
$('btnHeat').onclick = () => { heatOn = !heatOn; $('btnHeat').textContent = tr('train.heat') + ': ' + tr(heatOn ? 'fx.on' : 'fx.off'); wake(); };
