'use strict';
// Entrada (toque/rato), barra de força, efeito, HUD e dimensionamento.

// ---------- Entrada ----------
const humanAim = () => state === 'aim' && !isCpuTurn() && !paused;
let dragging = null, prevA = 0;
const wrapA = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
function toLogical(e) {
  const r = cv.getBoundingClientRect();
  return { x: (e.clientX - r.left - view.ox) / view.s, y: (e.clientY - r.top - view.oy) / view.s };
}
cv.addEventListener('pointerdown', e => {
  audio();
  if (!humanAim()) return;
  cv.setPointerCapture(e.pointerId);
  const p = toLogical(e);
  if (needsCall(turn)) {                         // toque numa caçapa = marca-a para a bola 8
    const k = POCKETS.findIndex(pk => Math.hypot(p.x - pk.x, p.y - pk.y) < pk.r + 14);
    if (k >= 0) { called = k; calledManual = true; toast(tr('g.call')); return; }
  }
  if (ballInHand && Math.hypot(p.x - cue.x, p.y - cue.y) < 34) dragging = 'cue';
  else {
    dragging = 'aim';
    if (Math.hypot(p.x - cue.x, p.y - cue.y) >= 6) { aimAngle = Math.atan2(p.y - cue.y, p.x - cue.x); prevA = aimAngle; tutCheckAim(); }
    else prevA = null;
  }
});
cv.addEventListener('pointermove', e => {
  if (!dragging) return;
  const p = toLogical(e);
  if (dragging === 'cue') {
    if (freeSpot(p.x, p.y)) { cue.x = p.x; cue.y = p.y; } else {
      const nx = Math.max(L + BR, Math.min(Rr - BR, p.x)), ny = Math.max(T + BR, Math.min(B - BR, p.y));
      if (freeSpot(nx, ny)) { cue.x = nx; cue.y = ny; }
    }
    if (tut && tut.step === 3 && !tut.wait && Math.hypot(cue.x - tut.cx, cue.y - tut.cy) > 25) finishTut(tr('tut.done'));
  } else {                                       // arrasto relativo: devagar = ajuste fino, depressa = rotação normal
    if (Math.hypot(p.x - cue.x, p.y - cue.y) < 12) return;
    const a = Math.atan2(p.y - cue.y, p.x - cue.x);
    if (prevA == null) { aimAngle = a; prevA = a; return; }
    const da = wrapA(a - prevA); prevA = a;
    aimAngle += da * (Math.abs(da) > 0.06 ? 1 : 0.38);
    tutCheckAim();
  }
});
const endDrag = () => { dragging = null; };
cv.addEventListener('pointerup', endDrag); cv.addEventListener('pointercancel', endDrag);

// botões de ajuste fino (◀ ▶)
function nudge(btn, dir) {
  let iv = 0;
  const go = () => { if (humanAim()) { aimAngle += dir * 0.0025; tutCheckAim(); } };
  let held = false;
  btn.addEventListener('pointerdown', e => { audio(); go(); clearInterval(iv); iv = setInterval(go, 35); if (!held) { held = true; holdN++; } try { btn.setPointerCapture(e.pointerId); } catch (_) {} });
  ['pointerup', 'pointercancel'].forEach(ev => btn.addEventListener(ev, () => { clearInterval(iv); if (held) { held = false; holdN--; } }));
}
nudge($('nL'), -1); nudge($('nR'), 1);
// teclado (web/desktop, leitores de ecrã com teclado): ← → mira (Shift = fino), ↑ ↓ força, Espaço/Enter bate
let kbPow = 0.5;
document.addEventListener('keydown', e => {
  if (e.ctrlKey || e.metaKey || e.altKey || (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) || !humanAim()) return;
  const k = e.key;
  if (k === 'ArrowLeft' || k === 'ArrowRight') { aimAngle += (k === 'ArrowRight' ? 1 : -1) * (e.shiftKey ? 0.002 : 0.012); tutCheckAim(); wake(); e.preventDefault(); }
  else if (k === 'ArrowUp' || k === 'ArrowDown') { kbPow = Math.max(0.05, Math.min(1, kbPow + (k === 'ArrowUp' ? 0.05 : -0.05))); setPower(kbPow); wake(); e.preventDefault(); }
  else if ((k === ' ' || k === 'Enter') && !(document.activeElement && document.activeElement.tagName === 'BUTTON')) { e.preventDefault(); const p = power > 0.06 ? power : kbPow; setPower(0); fire(aimAngle, p); }
});

// efeito (spin) na bola branca
let spinDrag = false;
function renderSpin() { const R = Math.max(10, spinEl.clientWidth / 2 - 8); spinDot.style.transform = `translate(${spin.x * R}px, ${-spin.y * R}px)`; }
function setSpinFrom(e) {
  const r = spinEl.getBoundingClientRect();
  let x = (e.clientX - r.left) / r.width * 2 - 1, y = (e.clientY - r.top) / r.height * 2 - 1;
  const l = Math.hypot(x, y);
  if (l > 0.85) { x *= 0.85 / l; y *= 0.85 / l; }
  if (l < 0.12) { x = 0; y = 0; }
  spin = { x, y: -y }; renderSpin();
  if (tut && tut.step === 1 && Math.hypot(spin.x, spin.y) > 0.3) showCoach(2);
}
spinEl.addEventListener('pointerdown', e => { audio(); if (!humanAim()) return; spinEl.setPointerCapture(e.pointerId); spinDrag = true; setSpinFrom(e); });
spinEl.addEventListener('pointermove', e => { if (spinDrag) setSpinFrom(e); });
spinEl.addEventListener('pointerup', () => { spinDrag = false; }); spinEl.addEventListener('pointercancel', () => { spinDrag = false; });

// barra de força: só dispara depois de arrastar (um toque não bate)
let powDrag = false, powArmed = false, powY0 = 0;
function powFromEvent(e) {
  const r = powerEl.getBoundingClientRect();
  return Math.max(0, Math.min(1, 1 - (e.clientY - r.top) / r.height));
}
powerEl.addEventListener('pointerdown', e => {
  audio();
  if (!humanAim()) return;
  powerEl.setPointerCapture(e.pointerId); powDrag = true; powArmed = false; powY0 = e.clientY; setPower(0);
});
powerEl.addEventListener('pointermove', e => {
  if (!powDrag) return;
  if (!powArmed && Math.abs(e.clientY - powY0) > 12) powArmed = true;
  if (powArmed) setPower(powFromEvent(e));
});
const powUp = () => {
  if (!powDrag) return; powDrag = false;
  if (powArmed && power > 0.06 && humanAim()) { const p = power; setPower(0); fire(aimAngle, p); }
  else setPower(0);
  powArmed = false;
};
powerEl.addEventListener('pointerup', powUp); powerEl.addEventListener('pointercancel', () => { powDrag = false; powArmed = false; setPower(0); });

function setPower(v) {
  power = v; powerEl.setAttribute('aria-valuenow', Math.round(v * 100));
  powerFill.style.height = (v * 100) + '%';
  powerText.classList.toggle('pct', v > 0.02);
  powerText.textContent = v > 0.02 ? Math.round(v * 100) + '%' : tr('hud.force');
}

// ---------- HUD ----------
function toast(msg) {
  toastEl.textContent = msg; toastEl.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2600);
}
function dotEl(b) {
  const d = document.createElement('div');
  d.className = 'dot' + (isStripe(b.n) ? ' stripe' : '');
  d.style.background = isStripe(b.n) ? '#fff' : COLORS[b.n];
  if (isStripe(b.n)) d.innerHTML = `<i style="position:absolute;left:0;right:0;top:3px;bottom:3px;background:${COLORS[b.n - 8]}"></i>`;
  if (!b.alive) d.style.opacity = '.18';
  return d;
}
function hudChal() {
  const L = chalCur;
  $('p0').classList.toggle('active', state === 'aim'); $('p1').classList.remove('active');
  $('n0').textContent = chalIdx === -2 ? tr('hud.week', { n: weekNo() % 52 + 1 }) : tr('hud.challenge', { n: chalIdx + 1 }); $('g0').textContent = tr('hud.shot', { a: Math.min(chalShots + 1, L.max), b: L.max }); $('d0').innerHTML = '';
  $('n1').textContent = tr('hud.goal'); $('g1').textContent = tr('hud.par', { n: L.par });
  const box = $('d1'); box.innerHTML = '';
  L.goal.forEach(n => { const b = balls.find(x => x.n === n); if (b) box.appendChild(dotEl(b)); });
}
function updateHud() {
  if (mode === 'train') return hudTrain();
  if (mode === 'chal' && chalCur) return hudChal();
  for (let p = 0; p < 2; p++) {
    $('p' + p).classList.toggle('active', state !== 'menu' && state !== 'over' && turn === p);
    const g = groups[p];
    $('g' + p).textContent = (g ? (g === 'solid' ? tr('hud.solids') : tr('hud.stripes')) : tr('hud.open')) + (mode === '2p' && series && series.len > 1 ? ' · ' + series.w[p] + '🏆' : '');
    const box = $('d' + p); box.innerHTML = '';
    if (!g) continue;
    const list = balls.filter(b => b.n && groupOf(b.n) === g).sort((a, b) => a.n - b.n);
    for (const b of list) box.appendChild(dotEl(b));
    if (ownCleared(p)) { const e = document.createElement('div'); e.className = 'dot'; e.style.background = COLORS[8]; box.appendChild(e); }
  }
}
