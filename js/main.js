'use strict';
// Arranque, baú, oferta inicial, menus e hooks de depuração (?debug).

// ---------- Arranque ----------
(() => {
  const lt = $('lgTitle');
  tr('app.name').toUpperCase().split('').forEach((c, i) => { const sp = document.createElement('span'); sp.textContent = c === ' ' ? '\u00a0' : c; sp.style.animationDelay = (0.5 + i * 0.06) + 's'; lt.appendChild(sp); });
  let done = false;
  const hide = () => { if (done) return; done = true; $('splash').classList.add('out'); setTimeout(() => $('splash').remove(), 400); };
  setTimeout(hide, 1900);
  $('splash').addEventListener('pointerdown', () => { audio(); hide(); });
})();

// ---------- Baú grátis (de 4 em 4 h, aberto com vídeo) ----------
const chestLeft = () => Math.max(0, Math.min(save.chestAt - Date.now(), CHEST_MS));   // se o relógio recuar, nunca passa de 4 h
const fmtMs = ms => { const t = Math.ceil(ms / 1000), h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60), sc = t % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(sc).padStart(2, '0'); };
function updateChest() {
  const left = chestLeft();
  $('btnChest').classList.toggle('ready', left === 0);
  if ($('chest').classList.contains('show')) {
    $('chestBox').classList.toggle('shake', left === 0);
    if (!$('chestPrize').textContent) $('chestMsg').textContent = left ? tr('chest.next', { t: fmtMs(left) }) : tr('chest.ready');
    $('btnChestOpen').disabled = left > 0;
  }
}
function rollChest() {
  let r = Math.random() * CHEST.reduce((a, c) => a + c.w, 0);
  for (const c of CHEST) { if ((r -= c.w) < 0) return c.min + Math.floor(Math.random() * (c.max - c.min + 1)); }
  return CHEST[0].min;
}
$('btnChest').onclick = () => { $('chestPrize').textContent = ''; open('chest'); updateChest(); };
$('btnChestOpen').onclick = async () => {
  if (chestLeft() > 0) return;
  if (!(await Monet.rewarded())) return Monet.native && !Consent.canAds ? 0 : toast(tr('chest.notDone'));
  if (chestLeft() > 0) return;
  const amt = rollChest(); save.coins += amt; save.chestAt = Date.now() + CHEST_MS; persist();
  $('chestMsg').textContent = tr('chest.got'); countUp($('chestPrize'), amt, 900, '🪙 +'); confettiBurst(); Snd.win(); updateChest();
};
setInterval(updateChest, 1000);
$('btnRetryAd').onclick = async () => {   // segunda oportunidade num desafio: +2 tacadas, uma vez por tentativa
  if (mode !== 'chal' || chalSecond || state !== 'over' || chalAdBusy) return;
  chalAdBusy = true; const id = gameId;
  try { if (!(await Monet.rewarded())) return; } finally { chalAdBusy = false; }
  if (id !== gameId || state !== 'over' || mode !== 'chal' || chalSecond) return;   // saiu do desafio durante o anúncio
  chalCountPending = false; chalSecond = true; chalCur = Object.assign({}, chalCur, { max: chalCur.max + 2 });
  $('btnRetryAd').style.display = 'none'; $('over').classList.remove('show');
  state = 'aim'; Monet.banner(false); updateHud(); startTurn(tr('chal.plus2', { a: chalShots + 1, b: chalCur.max }));
};

// ---------- Pacote inicial (oferta única, depois da 3.ª partida) ----------
function applyStarter(withCoins = true) {
  if (withCoins) save.coins += 2500;
  const ki = CUES.findIndex(x => x.id === 'carbon'); if (ki >= 0 && !save.cues.includes(ki)) save.cues.push(ki);
  const ci = CLOTHS.findIndex(x => x.id === 'turquoise'); if (ci >= 0 && !save.cloths.includes(ci)) save.cloths.push(ci);
  save.starter = true; toast(tr(withCoins ? 'offer.got' : 'offer.restored'));
}
function renderOffer() { $('offerItems').textContent = tr('offer.items', { cue: CUES.find(c => c.id === 'carbon').name, cloth: CLOTHS.find(c => c.id === 'turquoise').name, r: tr('rar.rare') }); }
function maybeOffer() {
  if (state !== 'menu' || save.starter || save.offerSeen || save.matches < 3 || !$('menu').classList.contains('show')) return;
  save.offerSeen = true; persist(); renderOffer(); open('offer');
}
$('btnOfferBuy').onclick = async () => { if (await Monet.purchase(STARTER_ID)) open('menu'); };
$('btnOfferNo').onclick = () => open('menu');

// ---------- Menus ----------
$('btnCpu').onclick = () => { audio(); renderRooms(); open('rooms'); };
$('btnTut').onclick = () => { audio(); tutForce = true; newGame('2p'); };
$('btnProf').onclick = () => { renderProfile(); open('prof'); };
$('btnShop').onclick = () => { renderShop(); open('shop'); };
$('btnDaily').onclick = () => { renderDaily(); open('daily'); };
$('btnClaim').onclick = claimDaily;
$('btnChal').onclick = () => { audio(); renderChal(); open('chal'); };
$('btnTour').onclick = () => { audio(); renderTour(); open('tour'); };
$('btnAch').onclick = () => { renderAch(); open('ach'); };
$('achBack').onclick = () => { renderProfile(); open('prof'); };
$('btnTourGo').onclick = () => {
  if (!tourOk()) return;
  if (!save.tour) {
    if (save.coins < TOUR.fee) return toast(tr('tour.noCoins'));
    save.coins -= TOUR.fee; save.tour = { round: 0 }; persist();
  }
  playTourRound();
};
$('btnVideo').onclick = watchForCoins;
$('btnDouble').onclick = async () => {
  if (!lastPrize) return;
  if (Monet.doublesLeft() <= 0) return toast(tr('over.dblLimit'));
  const b = Monet.doubleBonus(lastPrize);
  if (!(await Monet.rewarded()) || !lastPrize) return;
  save.vid.dbl = (save.vid.dbl || 0) + 1; save.coins += b; persist(); $('btnDouble').style.display = 'none'; toast(tr('over.doubled', { n: b })); lastPrize = 0;
};
// intersticial a cada 3 partidas contra o CPU
const afterMatch = async fn => { if (chalCountPending) { chalCountPending = false; Monet.noteMatch(); } await Monet.maybeInterstitial(); fn(); };
const toMenu = () => { p2cfg = null; series = null; sug = null; RP.active = false; $('rpBar').classList.remove('show'); if (tut) { tut = null; hideCoach(); } gameId++; cpuS = null; strike = null; slow = 0; sinks = []; floats = []; paused = false; state = 'menu'; Monet.banner(true); open('menu'); updateHud(); wake(); setTimeout(maybeOffer, 600); };
function overAgain() {
  if (mode === 'chal') return chalIdx === -2 ? startWeekly() : startChal(overNext);
  if (mode === '2p' && series) { if (series.done) series = { len: series.len, w: [0, 0], games: 0, done: false }; return newGame('2p'); }
  if (mode === 'cpu' && room.tour && save.tour) return playTourRound();
  if (mode === 'cpu') { renderRooms(); open('rooms'); } else newGame(mode);
}
$('btnAgain').onclick = () => afterMatch(overAgain);
$('btnMenu').onclick = () => afterMatch(() => { const wasChal = mode === 'chal', wk = chalIdx === -2; toMenu(); if (wasChal) { if (wk) { renderModes(); open('modes'); } else { renderChal(); open('chal'); } } });

// pausa / abandonar
$('menuBtn').onclick = () => {
  if (RP.active) return;
  if (state === 'menu' || state === 'over') return open('menu');
  paused = true;
  $('btnReplay').style.display = REC.last ? '' : 'none'; $('btnHeat').style.display = mode === 'train' ? '' : 'none'; $('btnHeat').textContent = tr('train.heat') + ': ' + tr(heatOn ? 'fx.on' : 'fx.off');
  $('pauseMsg').textContent = mode === 'train' ? tr('pause.train') : mode === 'chal' ? tr('pause.chal') : mode === 'cpu' && room.tour ? tr('pause.tour') : mode === 'cpu' ? (easyCpu ? tr('pause.free') : tr('pause.cpu', { f: room.fee })) : tr('pause.p2');
  open('pause');
};
$('btnResume').onclick = () => { paused = false; $('pause').classList.remove('show'); wake(); };
const updateMuteBtn = () => { $('muteBtn').innerHTML = `<svg class="ic"><use href="#i-${Snd.muted ? 'mute' : 'sound'}"/></svg>`; };
$('muteBtn').onclick = () => { Snd.init(); Snd.setMuted(!Snd.muted); updateMuteBtn(); renderSettings(); };
updateMuteBtn();

// ---------- Definições: idioma, som, vibração, efeitos e modo canhoto ----------
function setLang(l) {
  if (!I18N[l]) return; LANG = l; save.lang = l; persist(); applyI18n(); renderOffer(); updateHud(); refreshCoins(); updateMuteBtn(); renderSettings();
  if ($('lvlInfo')) refreshCoins();
}
function applySettings() { document.body.classList.toggle('lefty', !!save.lefty); resize(); }
function renderSettings() {
  document.querySelectorAll('#setLang button').forEach(b => b.classList.toggle('on', b.dataset.lang === LANG));
  const onoff = v => tr(v ? 'fx.on' : 'fx.off');
  $('setSound').textContent = tr('set.sound', { v: onoff(!Snd.muted) });
  $('setVib').textContent = tr('set.vib', { v: onoff(save.vib !== false) });
  $('setLefty').textContent = tr('set.lefty', { v: onoff(!!save.lefty) });
  $('setPriv').hidden = !Monet.native;   // só existe consentimento dentro da app
  $('setPriv').textContent = tr('set.priv', { v: tr(Consent.label()) });
  updateFxBtns();
}
document.querySelectorAll('#setLang button').forEach(b => b.onclick = () => setLang(b.dataset.lang));
$('setSound').onclick = () => { Snd.init(); Snd.setMuted(!Snd.muted); updateMuteBtn(); renderSettings(); };
$('setVib').onclick = () => { save.vib = save.vib === false; persist(); if (save.vib) vib(30); renderSettings(); };
$('setLefty').onclick = () => { save.lefty = !save.lefty; persist(); applySettings(); renderSettings(); };
$('setPriv').onclick = async () => {
  if (Consent.busy) return; Consent.busy = true;
  try { const r = await Consent.revisit(); renderSettings(); toast(tr(r === 'form' ? 'priv.done' : Consent.att === 'denied' ? 'priv.ios' : 'priv.nothing')); } finally { Consent.busy = false; }
};
$('btnSettings').onclick = () => { audio(); renderSettings(); open('settings'); };
if (!save.fxSet && window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) save.lowFx = true;   // respeita a preferência do sistema até o jogador decidir
applySettings();
$('btnQuit').onclick = () => {
  const wasChal = mode === 'chal', wasTrain = mode === 'train', wasWk = chalIdx === -2;
  if (mode === 'cpu' && !easyCpu) { save.losses++; save.matches++; save.winStreak = 0; bump('play'); if (room.tour) save.tour = null; persist(); }
  toMenu();
  if (wasTrain || (wasChal && wasWk)) { renderModes(); open('modes'); } else if (wasChal) { renderChal(); open('chal'); }
};
document.addEventListener('touchmove', e => { if (!e.target.closest('.grid, .overlay')) e.preventDefault(); }, { passive: false });
document.addEventListener('contextmenu', e => e.preventDefault());
try { if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {}); } catch (e) {}

applyI18n(); renderOffer(); $('n0').textContent = tr('ui.you'); $('n1').textContent = tr('ui.cpu');
rack(); resize(); updateHud(); refreshCoins(); hideBannerIfPaid(); Monet.init();
if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol) && !Monet.native) navigator.serviceWorker.register('sw.js').catch(() => {});
requestAnimationFrame(frame);
if (/[?&]debug\b/.test(location.search) || (() => { try { return !!localStorage.getItem('pool8_debug'); } catch (e) { return false; } })()) window.__pool = {
  get state() { return state; }, get balls() { return balls; }, get turn() { return turn; }, get groups() { return groups; },
  toMenu, open, tr, setLang, SAVE_VER, sanitizeSave, migrateSave, loadSave, get saveFrom() { return saveFrom; }, I18N,
  fire, newGame, judge, simulate, rooms: ROOMS, save, Snd, CUES, CLOTHS, TABLES, maybeOffer, aimMax, confettiBurst, startChal, CHALLENGES, TOUR, ACH, lvlInfo,
  get aiTimes() { return aiTimes; }, set aiPersonaKey(k) { aiPersona = [k, k]; }, get aiPersonaKey() { return aiPersona.slice(); }, AI_LV, PERSONAS,
  REC, RP, WEEKS, weekNo, startReplay, stopReplay, makeReplayGif, gifEncode, startTrain, startWeekly, startP2, planShot, get series() { return series; }, get sug() { return sug; }, get assist() { return assistOn; }, set heat(v) { heatOn = !!v; },
  get seed() { return rngS; }, set seed(v) { rngS = v >>> 0; }, rnd,
  drawTableDbg(g, i) { drawTable(g, TABLES[i], CLOTHS[0]); },
  phys: { PH, BR, L, Rr, T, B, MIDX, POCKETS, JAWS, SUB, MAX_SPEED, GRAV, get balls() { return balls; },
    setup(list) { balls = list.map(o => Object.assign(o.n === 0 ? newCue(o.x, o.y) : mk(o.n, o.x, o.y), o)); cue = balls.find(b => b.n === 0) || null; shot = newShot(); fMul = 1; return balls; },
    hit(ang, pw, top, side, elev) { launch(ang, pw, 1, top || 0, side || 0, elev || 0); },
    run(sec, onStep) { SIM = true; const N = Math.round(sec / SUB); let i = 0; try { for (; i < N; i++) { step(SUB); if (onStep && onStep(i * SUB) === false) { i++; break; } if (!anyMoving()) { i++; break; } } } finally { SIM = false; } return i * SUB; },
    steps(n) { SIM = true; try { for (let i = 0; i < n; i++) step(SUB); } finally { SIM = false; } },
    get shot() { return shot; }, anyMoving },
  sb: { snap, restoreSnap, get cue() { return cue; }, runSim(ang, pw) { const sv = shot; SIM = true; shot = newShot(); launch(ang, pw, 1, 0, 0); let n = 0; do { step(SUB); } while (++n < 2400 && anyMoving()); const r = shot; shot = sv; SIM = false; return r; } },
  get mode() { return mode; }, get chalShots() { return chalShots; }, get tour() { return save.tour; },
  get sinks() { return sinks.length; }, get floats() { return floats.map(f => f.txt); }, get confetti() { return confetti.length; }, get slow() { return slow; },
  get shots() { return shotCount; }, get pots() { return potCount; }, get tut() { return tut && tut.step; }, get ballInHand() { return ballInHand; }, get easy() { return easyCpu; }, get firstBreak() { return firstBreak; }, set firstBreak(v) { firstBreak = !!v; },
  set auto(v) { autoPlay = !!v; },
  econ: {   // simulação de economia: usa as mesmas funções do jogo
    set on(v) { econSim = !!v; },
    match(ri, win, ms, easy, tourRoom) { mode = 'cpu'; room = tourRoom || ROOMS[ri]; easyCpu = !!easy; mstat = ms; if (!easy && !tourRoom) save.coins -= room.fee; return settleCpu(win ? 0 : 1); },
    chal: (i, stars) => settleChal(i, stars),
    addXp, ensureMissions, bump, claimDaily, dailyInfo, lvlInfo, settleCpu,
    resetClock() { save.vid = { day: '', n: 0 }; save.missions = { day: '', prog: {}, done: {} }; },
  }, set skill(v) { humanSkill = v; }, Monet, CHEST, CHEST_MS, DAILY, MISSIONS, rollChest, chestLeft, Consent, set speed(v) { TS = v; }, get room() { return room; }, set room(r) { room = r; },
};
