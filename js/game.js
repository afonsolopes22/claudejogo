'use strict';
// Áudio sintetizado, bolas, início de jogo, regras, desafios e torneio.

// ---------- Áudio (tudo sintetizado) ----------
const Snd = {
  ac: null, master: null, noise: null, muted: !!save.mute, n: 0,
  init() {
    if (this.ac) { if (this.ac.state === 'suspended') this.ac.resume(); return; }
    try {
      const ac = new (window.AudioContext || window.webkitAudioContext)(); this.ac = ac;
      const comp = ac.createDynamicsCompressor(); this.master = ac.createGain(); this.master.gain.value = this.muted ? 0 : 0.9;
      this.master.connect(comp); comp.connect(ac.destination);
      const buf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      this.noise = buf;
    } catch (e) { this.ac = null; }
  },
  setMuted(m) { this.muted = m; save.mute = m; persist(); if (this.master) this.master.gain.value = m ? 0 : 0.9; },
  ok(force) { return !!this.ac && this.ac.state === 'running' && !this.muted && !SIM && (force || this.n++ < 10); },   // limite de vozes por frame
  burst(f, q, dur, vol, type, delay) {
    const ac = this.ac, t = ac.currentTime + (delay || 0), s = ac.createBufferSource(), fl = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = this.noise; fl.type = type || 'bandpass'; fl.frequency.value = f; fl.Q.value = q;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(fl); fl.connect(g); g.connect(this.master); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
  },
  tone(f0, f1, dur, vol, type, delay) {
    const ac = this.ac, t = ac.currentTime + (delay || 0), o = ac.createOscillator(), g = ac.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.02);
  },
  click(v) { if (!this.ok()) return; const k = Math.min(1, v / 1400), vol = 0.08 + 0.5 * k; this.burst(2600 + Math.random() * 1200 + k * 800, 2.2, 0.05, vol); this.tone(1500 + Math.random() * 300, 800, 0.045, vol * 0.35); },
  thud(v) { if (!this.ok()) return; const k = Math.min(1, v / 1400), vol = 0.06 + 0.45 * k; this.tone(150 - k * 25, 65, 0.14, vol); this.burst(320, 1, 0.08, vol * 0.5, 'lowpass'); },
  tunk(v) { if (!this.ok(true)) return; const k = Math.min(1, v / 1200); this.tone(100, 42, 0.3, 0.35 + 0.35 * k); this.burst(240, 1, 0.22, 0.25 + 0.2 * k, 'lowpass'); this.tone(520, 300, 0.05, 0.1, 'sine', 0.13); },
  cue(pw) { if (!this.ok()) return; this.burst(1800, 1.5, 0.045, 0.2 + pw * 0.5); this.tone(210, 120, 0.09, 0.25 + pw * 0.3, 'triangle'); },
  win() { if (!this.ac || this.muted) return; [523, 659, 784, 1047].forEach((f, i) => this.tone(f, f * 1.01, 0.35, 0.25, 'triangle', i * 0.12)); },
  lose() { if (!this.ac || this.muted) return; [330, 262, 196].forEach((f, i) => this.tone(f, f * 0.98, 0.4, 0.22, 'triangle', i * 0.18)); },
  foul() { if (!this.ok(true)) return; this.tone(180, 110, 0.22, 0.3, 'sawtooth'); },
};
const audio = () => Snd.init();
const sndHit = v => Snd.click(v), sndRail = v => Snd.thud(v);
const vib = p => {                      // háptica nativa (Capacitor Haptics) ou navigator.vibrate; desligável nas definições
  if (SIM || save.vib === false) return;
  const Hp = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Haptics;
  if (Hp) { try { if (Array.isArray(p)) Hp.notification({ type: p.length > 3 ? 'SUCCESS' : 'WARNING' }); else Hp.impact({ style: p > 40 ? 'HEAVY' : p > 25 ? 'MEDIUM' : 'LIGHT' }); } catch (e) {} return; }
  if (navigator.vibrate) try { navigator.vibrate(p); } catch (e) {}
};
function addFloat(x, y, txt, col, size) { floats.push({ x, y, txt, col, size: size || 1, t: 0 }); }

// ---------- Bolas ----------
const IDENT = [1, 0, 0, 0, 1, 0, 0, 0, 1];
function mk(n, x, y) { return { n, x, y, vx: 0, vy: 0, wx: 0, wy: 0, wz: 0, alive: true, px: x, py: y, M: IDENT.slice(), dirty: true }; }
const isSolid = n => n >= 1 && n <= 7;
const isStripe = n => n >= 9;
const groupOf = n => n === 8 ? 'eight' : (isSolid(n) ? 'solid' : 'stripe');

function newCue(x, y) { const c = mk(0, x, y); c.top = 0; c.side = 0; c.touched = false; c.dx = 1; c.dy = 0; return c; }
function rack() {
  balls = [];
  cue = newCue(HEAD_X, H / 2);
  balls.push(cue);
  const rest = [1,2,3,4,5,6,7,9,10,11,12,13,14,15];
  for (let i = rest.length - 1; i > 0; i--) { const j = rnd() * (i + 1) | 0; [rest[i], rest[j]] = [rest[j], rest[i]]; }
  const slots = new Array(15);
  slots[4] = 8;                                   // 8 no centro da 3.ª fila
  const solid = rest.find(n => isSolid(n)), stripe = rest.find(n => isStripe(n));
  slots[10] = solid; slots[14] = stripe;          // cantos de trás: uma lisa e uma riscada
  const others = rest.filter(n => n !== solid && n !== stripe);
  for (let i = 0, k = 0; i < 15; i++) if (slots[i] == null) slots[i] = others[k++];
  const dx = BR * 2 * 1.002;
  let idx = 0;
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c <= r; c++) balls.push(mk(slots[idx++], APEX_X + r * RACK_DX, H / 2 + (c - r / 2) * dx));
  }
}

// ---------- Início de jogo ----------
function newGame(m, rm) {
  wake();
  if (tutForce) { p2cfg = null; series = null; }
  REC.last = null;
  mode = m; gameId++; paused = false; cpuS = null; strike = null; slow = 0; sinks = []; floats = [];
  easyCpu = m === 'cpu' && !save.firstDone;           // 1.ª partida: sala Bairro, grátis e CPU fraco
  if (m === 'cpu') { room = easyCpu ? ROOMS[0] : (rm || room); if (!easyCpu) save.coins -= room.fee; persist(); }
  rack();
  fMul = curCloth().fr;
  turn = m === '2p' && series ? series.games % 2 : 0; groups = [null, null]; ballInHand = false; firstBreak = m !== 'train'; mstat = { pots: 0, run: 0, maxRun: 0, opp: 0 };
  aimAngle = 0; power = 0; shot = null; pre = null;
  aiPersona = ['bal', 'bal']; cpuSpin = { top: 0, side: 0 };
  if (m === 'cpu' && !easyCpu) { aiPersona[1] = pickPersona(); if (autoPlay) aiPersona[0] = pickPersona(); }
  $('n0').textContent = m === 'cpu' ? tr('ui.you') : (m === '2p' && p2cfg ? p2cfg.names[0] : tr('ui.p1'));
  $('n1').textContent = m === 'cpu' ? tr('ui.cpu') : (m === '2p' && p2cfg ? p2cfg.names[1] : tr('ui.p2'));
  document.querySelectorAll('.overlay').forEach(o => { if (o.id !== 'adov') o.classList.remove('show'); });
  state = 'aim';
  updateHud(); Monet.banner(false);
  startTurn(m === 'train' ? tr('train.hint') : tr('g.open'));
  if (m === 'train') setTimeout(() => { if (mode === 'train' && state === 'aim') { updateSuggestion(); wake(); } }, 80);
  tut = null; if (!save.tutDone || tutForce) startTut(); tutForce = false;
  if (m === 'cpu' && !easyCpu && !autoPlay) { const g = gameId; setTimeout(() => { if (g === gameId && mode === 'cpu' && state !== 'over' && !tut) toast(tr('ai.style', { s: tr('ai.' + aiPersona[1]) })); }, 2200); }   // o estilo do adversário
}

const isCpuTurn = () => mode === 'cpu' && (turn === 1 || autoPlay);

function startTurn(msg) {
  aimFxUntil = performance.now() + 2500;
  wake();
  state = 'aim'; power = 0; setPower(0);
  spin = { x: 0, y: 0 }; renderSpin();
  called = null; calledManual = false;
  if (msg) toast(msg);
  const human = !isCpuTurn();
  powerEl.classList.toggle('disabled', !human);
  spinEl.classList.toggle('disabled', !human);
  nudgeEl.classList.toggle('disabled', !human);
  cpuS = human ? null : { ph: 'wait', t: 0 };
  if (tut && tut.step === 3 && tut.wait && human && cue.alive) { tut.wait = false; ballInHand = true; showCoach(3); }
  updateHud();
}

// ---------- Regras ----------
const remaining = g => balls.filter(b => b.alive && b.n && groupOf(b.n) === g).length;
function ownCleared(p) { return !!groups[p] && remaining(groups[p]) === 0; }
function legalTargets(p) {
  const alive = balls.filter(b => b.alive && b.n);
  if (!groups[p]) return alive.filter(b => b.n !== 8);
  if (ownCleared(p)) return alive.filter(b => b.n === 8);
  return alive.filter(b => groupOf(b.n) === groups[p]);
}
const needsCall = p => ownCleared(p) && cue.alive;
const newShot = () => ({ first: null, pocketed: [], scratch: false, railAfter: false, railBalls: [], pkIdx: {} });
function makePre(p, call) {
  return { legal: legalTargets(p).map(b => b.n), cleared: ownCleared(p), hadGroup: !!groups[p], breakShot: firstBreak, called: call == null ? null : call };
}

// Avalia uma tacada sem efeitos secundários (usado pelo jogo e pela IA).
function judge(p, sh, pr) {
  const sunk = sh.pocketed, res = { foul: false, why: '', end: null, assign: null, keep: false, respot8: false, rerack: false };
  if (sh.scratch) { res.foul = true; res.why = 'j.scratch'; }
  if (sh.first == null) { if (!res.foul) { res.foul = true; res.why = 'j.none'; } }
  else if (!pr.breakShot && !pr.legal.includes(sh.first)) { if (!res.foul) { res.foul = true; res.why = 'j.wrong'; } }

  if (pr.breakShot) {
    const non8 = sunk.filter(n => n !== 8);
    if (sunk.includes(8)) res.respot8 = true;                    // 8 na abertura: volta à mesa
    if (!res.foul && !non8.length && sh.railBalls.length < 4) res.rerack = true;
    res.keep = !res.foul && non8.length > 0;                      // mesa continua aberta após a abertura
    return res;
  }
  if (!res.foul && !sh.railAfter && !sunk.length) { res.foul = true; res.why = 'j.norail'; }

  if (sunk.includes(8)) {
    const wrongPocket = pr.called != null && sh.pkIdx[8] !== pr.called;
    if (res.foul) res.end = { winner: 1 - p, why: 'j.eightFoul' };
    else if (!pr.cleared) res.end = { winner: 1 - p, why: 'j.eightEarly' };
    else if (wrongPocket) res.end = { winner: 1 - p, why: 'j.eightPocket' };
    else res.end = { winner: p, why: 'j.eightWin' };
    return res;
  }
  if (!pr.hadGroup && !res.foul && sunk.length) res.assign = groupOf(sunk[0]);
  if (!res.foul) res.keep = pr.hadGroup ? sunk.some(n => groupOf(n) === groups[p]) : sunk.length > 0;
  return res;
}

function resolveShot() {
  recStop();
  if (mode === 'train') return resolveTrain();
  if (mode === 'chal') return resolveChal();
  const p = turn, opp = 1 - p;
  const res = judge(p, shot, pre);
  if (mode === 'cpu') {
    const n = shot.pocketed.length;
    if (p === 0) {
      if (n) { save.pots += n; bump('pot', n); }
      const nb = shot.pocketed.filter(x => x !== 8).length;
      if (!res.foul && nb > save.bestShot) save.bestShot = nb;
      if (!res.foul && res.keep && n) { mstat.run++; mstat.maxRun = Math.max(mstat.maxRun, mstat.run); } else mstat.run = 0;
      mstat.pots += n;
    } else mstat.opp += n;
  }
  if (res.end) return endGame(res.end.winner, res.end.why);
  if (res.respot8) {
    const e = balls.find(b => b.n === 8), sp = nearestFree(APEX_X + 2 * RACK_DX, H / 2);
    e.alive = true; e.x = sp.x; e.y = sp.y; e.vx = e.vy = 0;
  }
  if (res.rerack) {
    rack(); firstBreak = true; ballInHand = false; fMul = curCloth().fr;
    return startTurn(tr('g.rerack', { p: pName(p) }));
  }
  if (res.assign) {
    groups[p] = res.assign; groups[opp] = res.assign === 'solid' ? 'stripe' : 'solid';
    toast(tr(res.assign === 'solid' ? 'g.solids' : 'g.stripes', { p: pName(p) }));
  }
  updateHud();
  if (res.foul) { addFloat(W / 2, H * 0.42, tr('f.foul'), '#ff6a5a', 1.5); Snd.foul(); vib([30, 40, 30]); }
  else if (res.keep && shot.pocketed.length) {
    const n = shot.pocketed.filter(x => x !== 8).length;
    addFloat(W / 2, H * 0.42, tr(n >= 3 ? 'f.triple' : n === 2 ? 'f.double' : 'f.good'), '#ffd54a', n >= 2 ? 1.6 : 1.3);
  }
  if (res.foul) {
    if (shot.scratch) { const sp = nearestFree(HEAD_X, H / 2); cue.alive = true; cue.x = sp.x; cue.y = sp.y; cue.vx = cue.vy = 0; }
    ballInHand = true; turn = opp;
    startTurn(tr(res.why) + tr('g.inHand', { p: pName(turn) }));
  } else if (res.keep) {
    ballInHand = false;
    startTurn(tr('g.keeps', { p: pName(p) }));
  } else {
    ballInHand = false; turn = opp;
    startTurn(tr('g.turn', { p: pName(turn) }));
  }
}
const pName = p => $('n' + p).textContent;

let lastPrize = 0;
function scheduleOver(won, prize, canDouble) {
  lastPrize = canDouble ? prize : 0;
  $('btnDouble').style.display = canDouble && prize ? '' : 'none';
  if (mode !== 'chal') $('btnRetryAd').style.display = 'none';
  const id = gameId;
  $('btnOverReplay').style.display = REC.last ? '' : 'none';
  setTimeout(() => {
    if (id !== gameId || state !== 'over') return;
    $('prizeCnt').textContent = '';
    $('over').classList.add('show');
    if (won) { confettiBurst(); Snd.win(); vib([40, 60, 40, 60, 90]); } else Snd.lose();
    if (prize) countUp($('prizeCnt'), prize, 1100, '🪙 +');
  }, 700);
}
function settleCpu(winner) {   // economia de uma partida contra o CPU (usada pelo jogo e pela simulação de economia)
  let prize = 0, extra = '';
  const ri = Math.max(0, ROOMS.indexOf(room));
  save.firstDone = true;
  bump('play');
  if (winner === 0) {
    prize = room.prize; save.coins += prize; save.wins++; save.winStreak++; save.bestStreak = Math.max(save.bestStreak, save.winStreak);
    if (!easyCpu && mstat.opp === 0) save.perfect++;
    bump('win'); extra = addXp((room.xp || 40 + 20 * ri) + 3 * mstat.pots + 5 * mstat.maxRun);
  } else { save.losses++; save.winStreak = 0; extra = addXp(10 + 2 * mstat.pots); }
  if (room.tour && save.tour) {
    save.tour.live = false;
    if (winner === 0) {
      save.tour.round++;
      if (save.tour.round >= TOUR.rounds.length) { save.tour = null; save.tourWins++; extra += tr('tour.champ'); }
      else { extra += tr('tour.next'); }
    } else { save.tour = null; extra += tr('tour.out'); }
  }
  save.matches++; Monet.noteMatch(); persist();
  return { prize, extra };
}
function endGame(winner, why) {
  state = 'over'; cpuS = null; strike = null; Monet.banner(true);
  if (tut) finishTut();
  updateHud();
  $('overTitle').textContent = mode === 'cpu' ? (winner === 0 ? tr('over.win') : tr('over.lose')) : tr('over.winner', { p: pName(winner) });
  $('btnAgain').textContent = tr('ui.again'); $('btnMenu').textContent = tr('ui.menu');
  let prize = 0, extra = '';
  if (mode === 'cpu') { const r = settleCpu(winner); prize = r.prize; extra = r.extra; if (room.tour && save.tour) $('btnAgain').textContent = tr('ui.nextRound'); }
  $('overMsg').textContent = tr(why) + (prize ? tr('over.won', { n: prize }) : '') + extra;
  if (mode === '2p') {
    const sr = p2EndGame(winner);
    if (sr && sr.len > 1) {
      $('overMsg').textContent = tr(why) + ' ' + tr('p2.series', { a: pName(0), x: sr.w[0], y: sr.w[1], b: pName(1) });
      if (sr.done) $('overTitle').textContent = tr('p2.seriesWin', { p: pName(winner) });
      $('btnAgain').textContent = sr.done ? tr('p2.newSeries') : tr('p2.next');
    }
  }
  scheduleOver(mode === 'cpu' ? winner === 0 : true, prize, true);
  if ((mode === 'cpu' ? winner === 0 : true) && !lowFx()) { FX.winT = 0; FX.winPk = shot && shot.pkIdx && shot.pkIdx[8] != null ? shot.pkIdx[8] : null; wake(); }
}
function countUp(el, target, ms, prefix) {
  const t0 = performance.now();
  (function s(now) { const k = Math.min(1, (now - t0) / ms); el.textContent = prefix + Math.round(target * (1 - Math.pow(1 - k, 3))); if (k < 1) requestAnimationFrame(s); })(t0);
}

// confetes (canvas por cima de tudo, só corre enquanto há partículas)
const fx = $('fx'), fctx = fx.getContext('2d');
let confetti = [], fxRun = false;
function confettiBurst() {
  const dpr = window.devicePixelRatio || 1;
  fx.width = Math.round(innerWidth * dpr); fx.height = Math.round(innerHeight * dpr);
  const cols = ['#ffd54a', '#ffe27a', '#ffb02e', '#fff3b0', '#e6a817', '#ffffff'];   // confetes dourados
  for (let i = 0; i < (save.lowFx ? 60 : 140); i++) confetti.push({ x: Math.random() * innerWidth, y: -10 - Math.random() * 120, vx: (Math.random() - 0.5) * 220, vy: 120 + Math.random() * 260, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 12, w: 5 + Math.random() * 6, h: 3 + Math.random() * 4, c: cols[i % cols.length] });
  if (!fxRun) { fxRun = true; let lastT = performance.now(); requestAnimationFrame(function tick(now) {
    const dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
    const dpr2 = window.devicePixelRatio || 1;
    fctx.setTransform(dpr2, 0, 0, dpr2, 0, 0); fctx.clearRect(0, 0, innerWidth, innerHeight);
    confetti = confetti.filter(p => p.y < innerHeight + 20);
    for (const p of confetti) {
      p.vy += 380 * dt; p.vx *= 0.995; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
      fctx.save(); fctx.translate(p.x, p.y); fctx.rotate(p.rot); fctx.fillStyle = p.c; fctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); fctx.restore();
    }
    if (confetti.length) requestAnimationFrame(tick); else fxRun = false;
  }); }
}

// ---------- Desafios ----------
function chalText(L) {
  const g = L.goal, all = L.balls.every(b => g.includes(b[0]));
  let t = g.length === 1 ? tr('chal.one', { n: g[0] }) : all ? tr('chal.all') : tr('chal.many', { list: g.slice(0, -1).join(', '), last: g[g.length - 1] });
  t += tr('chal.in', { n: L.max });
  if (L.avoid && L.avoid.length) t += tr('chal.avoid', { list: L.avoid.join(', ') });
  return t;
}
function startChal(i, override) {
  wake();
  REC.last = null;
  const L = override || CHALLENGES[i]; chalCur = L; chalIdx = i; chalShots = 0; chalSecond = false; $('btnRetryAd').style.display = 'none';
  mode = 'chal'; gameId++; paused = false; cpuS = null; strike = null; slow = 0; sinks = []; floats = []; easyCpu = false; tut = null; hideCoach();
  balls = []; cue = newCue(L.cue[0], L.cue[1]); balls.push(cue);
  L.balls.forEach(b => balls.push(mk(b[0], b[1], b[2])));
  fMul = curCloth().fr; turn = 0; groups = [null, null]; ballInHand = false; firstBreak = false; shot = null; pre = null;
  const g = balls.find(b => b.n === L.goal[0]); aimAngle = g ? Math.atan2(g.y - cue.y, g.x - cue.x) : 0; power = 0;
  document.querySelectorAll('.overlay').forEach(o => { if (o.id !== 'adov') o.classList.remove('show'); });
  state = 'aim'; Monet.banner(false);
  startTurn(chalText(L));
}
function resolveChal() {
  const L = chalCur; chalShots++;
  if (shot.scratch) { const sp = nearestFree(L.cue[0], L.cue[1]); cue.alive = true; cue.x = sp.x; cue.y = sp.y; cue.vx = cue.vy = 0; addFloat(W / 2, H * 0.42, tr('f.foul'), '#ff6a5a', 1.5); Snd.foul(); }
  if (L.avoid && shot.pocketed.some(n => L.avoid.includes(n))) return chalEnd(false, 0, 'chal.forbidden');
  if (L.goal.every(n => { const b = balls.find(x => x.n === n); return !b || !b.alive; })) return chalEnd(true, chalShots <= L.par ? 3 : chalShots <= L.par + 1 ? 2 : 1);
  if (chalShots >= L.max) return chalEnd(false, 0, 'chal.noShots');
  updateHud(); startTurn(tr('hud.shot', { a: chalShots + 1, b: L.max }));
}
function settleChal(idx, stars) {   // economia de um desafio concluído (jogo + simulação)
  const prev = save.chal[idx] || 0; let coins = 0, extra = '';
  if (stars > prev) { coins = (stars - prev) * 25 + (prev === 0 ? 25 : 0); save.coins += coins; save.chal[idx] = stars; extra = addXp(10 * (stars - prev)); }
  return { coins, extra };
}
function chalEnd(win, stars, why) {
  state = 'over'; cpuS = null; strike = null; Monet.banner(true);
  updateHud();
  let coins = 0, extra = '';
  if (win) {
    const r = chalIdx === -2 ? settleWeekly(stars) : settleChal(chalIdx, stars); coins = r.coins; extra = r.extra;
    $('overTitle').textContent = '⭐'.repeat(stars) + '☆'.repeat(3 - stars) + ' ' + (chalIdx === -2 ? tr('week.title') : tr('chal.level', { n: chalIdx + 1 }));
    $('overMsg').textContent = tr('chal.done', { n: chalShots, p: chalCur.par }) + extra;
  } else {
    $('overTitle').textContent = tr('chal.fail');
    $('overMsg').textContent = tr(why) + tr('chal.retryMsg') + extra;
  }
  overNext = win && chalIdx >= 0 && chalIdx < CHALLENGES.length - 1 ? chalIdx + 1 : chalIdx;
  $('btnAgain').textContent = win && chalIdx >= 0 && chalIdx < CHALLENGES.length - 1 ? tr('ui.nextLevel') : tr('ui.repeat');
  $('btnMenu').textContent = chalIdx === -2 ? tr('ui.menu') : tr('ui.levels');
  persist();
  const retry = !win && why === 'chal.noShots' && !chalSecond;
  chalCountPending = retry; if (!retry) Monet.noteMatch();   // com segunda oportunidade pendente, só conta se o jogador a recusar
  $('btnRetryAd').style.display = retry ? '' : 'none';
  scheduleOver(win, coins, win && coins > 0);
}
function renderChal() {
  const g = $('chalGrid'); g.innerHTML = '';
  CHALLENGES.forEach((L, i) => {
    const st = save.chal[i] || 0, locked = i > 0 && !(save.chal[i - 1] > 0);
    const b = document.createElement('button'); b.className = 'lv'; b.disabled = locked;
    b.innerHTML = `${locked ? '🔒' : i + 1}<small>${'★'.repeat(st)}${'☆'.repeat(3 - st)}</small>`;
    b.onclick = () => startChal(i);
    g.appendChild(b);
  });
  $('chalSum').textContent = tr('chal.sum', { s: totalStars(), t: CHALLENGES.length * 3, d: chalDone(), n: CHALLENGES.length });
}

// ---------- Torneio ----------
const tourOk = () => save.firstDone && lvlInfo().l >= TOUR.lvl;
function renderTour() {
  const r = save.tour ? save.tour.round : -1, ok = tourOk(), box = $('tourList'); box.innerHTML = '';
  $('tourMsg').textContent = !ok ? tr('tour.locked', { l: TOUR.lvl }) : save.tour ? tr('tour.running', { r: r + 1, n: TOUR.rounds.length }) : tr('tour.intro', { f: TOUR.fee, p: TOUR.rounds[2].prize });
  TOUR.rounds.forEach((t, i) => {
    const d = document.createElement('div'); d.className = 'card';
    d.innerHTML = `<div class="t"><b>${i < r ? '✔' : i === r ? '▶' : '🔒'} ${t.name}</b><small>${tr('tour.round', { n: t.ai, p: t.prize })}</small></div>`;
    box.appendChild(d);
  });
  $('btnTourGo').disabled = !ok; $('btnTourGo').textContent = !ok ? '🔒' : save.tour ? tr('tour.cont') : tr('tour.enter', { f: TOUR.fee });
}
function playTourRound() {
  const t = TOUR.rounds[save.tour.round];
  save.tour.live = true; persist();
  newGame('cpu', { name: t.name, fee: 0, prize: t.prize, noise: t.noise, ai: t.ai, aim: t.aim, xp: t.xp, lvl: 1, tour: true });
}
