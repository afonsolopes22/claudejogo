'use strict';
// Constantes da mesa, elementos, dados guardados (save), monetização, nível/XP/missões e estado global.

// ---------- Constantes da mesa ----------
const W = 736, H = 396, RAIL = 28;           // mesa horizontal (paisagem): mais larga que alta
const L = RAIL, Rr = W - RAIL, T = RAIL, B = H - RAIL;
const BR = 11;                      // raio da bola
const MIDX = (L + Rr) / 2;          // caçapas do meio ficam nas tabelas de cima e de baixo
const POCKETS = [
  { x: L,    y: T, r: 25, vr: 21 }, { x: MIDX, y: T, r: 20, vr: 17 }, { x: Rr, y: T, r: 25, vr: 21 },
  { x: L,    y: B, r: 25, vr: 21 }, { x: MIDX, y: B, r: 20, vr: 17 }, { x: Rr, y: B, r: 25, vr: 21 },
];
const COLORS = ['#f4f4f4','#f5c518','#1e50c8','#d92b2b','#6a2fa0','#f57c1f','#1f8a3c','#7a1f1f','#111'];
const MAX_SPEED = 1900;
const SUB = 1 / 240;
const APEX_X = W - 250, HEAD_X = W - 540;   // triângulo à direita (vértice virado para a branca) e bola branca à esquerda
const RACK_DX = Math.sqrt(3) * BR * 1.002;

// ---------- Elementos ----------
const cv = document.getElementById('cv'), ctx = cv.getContext('2d');
const $ = id => document.getElementById(id);
const powerEl = $('power'), powerFill = $('powerFill'), powerText = $('powerText');
const toastEl = $('toast');
const spinEl = $('spin'), spinDot = $('spinDot'), nudgeEl = $('nudge');


// ---------- Economia / dados guardados ----------
// Tacos: vantagens pequenas (efeito, mira mais longa nas salas de linha curta) ou só aspeto. rar = raridade.
const RARITY = { common: { c: '#9aa7a0', r: 0 }, rare: { c: '#4aa3ff', r: 1 }, epic: { c: '#c78bff', r: 2 }, legendary: { c: '#ffb02e', r: 3 } };
Object.keys(RARITY).forEach(k => Object.defineProperty(RARITY[k], 'n', { get: () => tr('rar.' + k) }));
const nameGetter = (arr, ns) => arr.forEach(o => Object.defineProperty(o, 'name', { get: () => tr(ns + '.' + o.id) }));
const CUES = [
  { id:'classic', color:'#d9b27a', butt:'#3a2412', ring:'#c9a24a', price:0,     power:1.00, spin:1.0, aim:0,    lvl:1,  rar:'common' },
  { id:'blue',     color:'#4aa3ff', butt:'#1c3a66', ring:'#cfe8ff', price:600,   power:1.00, spin:1.1, aim:0,    lvl:2,  rar:'common' },
  { id:'neon',     color:'#3df0b0', butt:'#0c3a30', ring:'#eafff7', price:1500,  power:1.00, spin:1.2, aim:0.10, lvl:4,  rar:'rare', glow:'#3df0b0' },
  { id:'dragon',   color:'#e5483b', butt:'#3a0f0c', ring:'#ffd54a', price:2500,  power:1.03, spin:1.2, aim:0.10, lvl:6,  rar:'rare' },
  { id:'gold',  color:'#ffd54a', butt:'#4a3410', ring:'#fff3b0', price:8000,  power:1.05, spin:1.3, aim:0.20, lvl:9,  rar:'epic', glow:'#ffd54a' },
  { id:'legend', color:'#c78bff', butt:'#2a1450', ring:'#ffe27a', price:15000, power:1.06, spin:1.4, aim:0.30, lvl:12, rar:'legendary', glow:'#ffb02e' },
  { id:'carbon',  color:'#8a96a3', butt:'#15181d', ring:'#ffffff', price:3500,  power:1.00, spin:1.0, aim:0,    lvl:7,  rar:'rare' },
  { id:'crystal',  color:'#bdf3ff', butt:'#1a3b4a', ring:'#7fe7ff', price:6000,  power:1.00, spin:1.0, aim:0,    lvl:8,  rar:'epic', glow:'#7fe7ff' },
];
nameGetter(CUES, 'cue');
// fr = multiplicador de atrito (menor = bolas rolam mais)
const CLOTHS = [
  { id:'green', c1:'#1f9a57', c2:'#126a3a', price:0,    fr:1.00, rar:'common' },
  { id:'ocean',    c1:'#2a7fd0', c2:'#14487f', price:400,  fr:0.93, rar:'common' },
  { id:'casino',c1:'#c23a3a', c2:'#7a1c1c', price:900,  fr:1.10, rar:'rare' },
  { id:'neon',      c1:'#8a4fd6', c2:'#47208a', price:1500, fr:0.86, rar:'rare' },
  { id:'elite',    c1:'#3a3f4a', c2:'#15181f', price:3000, fr:0.90, rar:'epic' },
  { id:'royal',   c1:'#d1a73c', c2:'#7a5a14', price:6000, fr:0.80, rar:'legendary' },
  { id:'turquoise',       c1:'#27b5b0', c2:'#136d6c', price:1200, fr:0.97, rar:'rare' },
  { id:'magenta',   c1:'#b0309c', c2:'#4d1060', price:2500, fr:0.90, rar:'epic' },
];
nameGetter(CLOTHS, 'cloth');
// Decorações das mesas (declaradas aqui porque TABLES as referencia ao carregar; desenham-se mais tarde, em render.js)
function decoBeach(c) {                          // ondas na moldura + areia
  c.save(); c.strokeStyle = 'rgba(30,150,155,.55)'; c.lineWidth = 1.8;
  for (const x0 of [8, W - 8]) { c.beginPath(); for (let y = 24; y <= H - 24; y += 3) { const x = x0 + Math.sin(y / 8) * 2.6; if (y === 24) c.moveTo(x, y); else c.lineTo(x, y); } c.stroke(); }
  for (const y0 of [8, H - 8]) { c.beginPath(); for (let x = 24; x <= W - 24; x += 3) { const y = y0 + Math.sin(x / 8) * 2.6; if (x === 24) c.moveTo(x, y); else c.lineTo(x, y); } c.stroke(); }
  const r = mkRng(7); c.fillStyle = 'rgba(120,80,30,.28)';
  for (let i = 0; i < 170; i++) { const x = r() * W, y = r() * H; if (x > L - 14 && x < Rr + 14 && y > T - 14 && y < B + 14) continue; c.fillRect(x, y, 1.5, 1.5); }
  c.restore();
}
function decoNeon(c) {                           // linhas neon na moldura e nas tabelas, com brilho
  c.save(); c.lineJoin = 'round';
  c.shadowColor = '#25f4ff'; c.shadowBlur = 12; c.strokeStyle = '#25f4ff'; c.lineWidth = 2.4;
  roundRect(c, 5, 5, W - 10, H - 10, 18); c.stroke();
  c.shadowColor = '#ff2bd6'; c.strokeStyle = '#ff2bd6'; c.lineWidth = 2;
  c.beginPath(); c.rect(L - 12, T - 12, Rr - L + 24, B - T + 24); c.stroke();
  c.restore();
}
function decoLegend(c) {                         // filete dourado e brilhos
  c.save(); c.strokeStyle = 'rgba(255,240,170,.75)'; c.lineWidth = 1.4;
  roundRect(c, 6, 6, W - 12, H - 12, 17); c.stroke();
  c.strokeStyle = 'rgba(80,50,6,.6)'; roundRect(c, 9, 9, W - 18, H - 18, 15); c.stroke();
  const r = mkRng(21);
  for (let i = 0; i < 26; i++) {                                     // brilhos estrelados na moldura
    let x = r() * W, y = r() * H; if (x > L - 12 && x < Rr + 12 && y > T - 12 && y < B + 12) continue;
    c.fillStyle = 'rgba(255,250,210,.85)'; c.beginPath(); c.moveTo(x, y - 3.4); c.lineTo(x + 0.8, y - 0.8); c.lineTo(x + 3.4, y); c.lineTo(x + 0.8, y + 0.8); c.lineTo(x, y + 3.4); c.lineTo(x - 0.8, y + 0.8); c.lineTo(x - 3.4, y); c.lineTo(x - 0.8, y - 0.8); c.closePath(); c.fill();
  }
  c.restore();
}
// Mesas temáticas (moldura, tabelas, diamantes e decoração)
const TABLES = [
  { id:'classic', rar:'common', price:0,    lvl:1, frame:['#6b3d1c','#8a5428','#5a3216'], rail:'#0c5a30', dia:'#e8d9a8' },
  { id:'beach',    rar:'rare',   price:3500, lvl:3, frame:['#e7cb97','#c99a5c','#f0dcb0'], rail:'#1e8a8f', dia:'#ffffff', deco: decoBeach },
  { id:'neon',     rar:'epic',   price:6000, lvl:5, frame:['#0d0d1a','#1b1b33','#08080f'], rail:'#14143a', dia:'#25f4ff', deco: decoNeon },
  { id:'legend',   rar:'legendary', price:15000, lvl:10, frame:['#7a5514','#e9c460','#8a5f10'], rail:'#1a1408', dia:'#fff6d0', deco: decoLegend },
];
nameGetter(TABLES, 'table');
// ai: 0 = heurística simples, 1..3 = simula tacadas candidatas (mais candidatas = mais forte)
const ROOMS = [
  { id:'bairro', fee:50,   prize:100,   noise:0.075, ai:0, aim:1200, lvl:1 },
  { id:'club',  fee:250,  prize:500,   noise:0.04,  ai:1, aim:600, lvl:3 },
  { id:'pro', fee:1000, prize:2000, noise:0.015, ai:2, aim:380, lvl:6 },
  { id:'master', fee:5000, prize:10000, noise:0.005, ai:3, aim:240, lvl:10 },
];
nameGetter(ROOMS, 'room');
const ADS_TEST = true;   // ver Monet.init
const COIN_PACKS = [
  { id:'coins_1000',  coins:1000,  price:'0,99 €' },
  { id:'coins_6000',  coins:6000,  price:'4,99 €' },
  { id:'coins_15000', coins:15000, price:'9,99 €' },
];
const MISSIONS = [
  { id:'play', key:'play', goal:3,  reward:100 },
  { id:'win',  key:'win',  goal:2,  reward:150 },
  { id:'pot',  key:'pot',  goal:15, reward:150 },
];
MISSIONS.forEach(m => Object.defineProperty(m, 'txt', { get: () => tr('mis.' + m.id) }));
const DAILY = [100, 150, 200, 300, 400, 500, 1500];   // calendário de 7 dias; o 7.º é o prémio grande
const TOUR = { fee: 500, lvl: 4, rounds: [
  { id: 'r1', ai: 1, noise: 0.04,  aim: 600, prize: 150,  xp: 60 },
  { id: 'r2',     ai: 2, noise: 0.02,  aim: 380, prize: 350,  xp: 90 },
  { id: 'r3',            ai: 3, noise: 0.005, aim: 240, prize: 1500, xp: 150 },
] };
TOUR.rounds.forEach(r => Object.defineProperty(r, 'name', { get: () => tr('tour.' + r.id) }));
// Desafios: disposições fixas na mesa horizontal (736x396). cue = [x,y]; balls = [[número,x,y],...]; goal = bolas a meter; avoid = bolas proibidas;
// par = tacadas para 3 estrelas (par+1 = 2 estrelas); max = tacadas permitidas. Fácil de editar à mão.
const CHALLENGES = [
/*CHAL_START*/
  { cue:[259,224], goal:[7], avoid:[], par:1, max:3, balls:[[7,82,316]] },   // 1
  { cue:[303,132], goal:[3], avoid:[], par:1, max:3, balls:[[3,266,173]] },   // 2
  { cue:[194,229], goal:[11], avoid:[], par:1, max:3, balls:[[11,304,133]] },   // 3
  { cue:[294,179], goal:[5], avoid:[], par:1, max:3, balls:[[5,337,192]] },   // 4
  { cue:[138,192], goal:[11], avoid:[], par:1, max:3, balls:[[11,180,107]] },   // 5
  { cue:[257,284], goal:[2,3], avoid:[], par:2, max:4, balls:[[2,641,321],[3,573,136]] },   // 6
  { cue:[323,71], goal:[15,6], avoid:[], par:2, max:4, balls:[[15,349,118],[6,94,209]] },   // 7
  { cue:[126,294], goal:[2,9], avoid:[], par:2, max:4, balls:[[2,535,86],[9,324,131]] },   // 8
  { cue:[244,294], goal:[2,1], avoid:[], par:2, max:4, balls:[[2,332,185],[1,665,275],[4,557,292]] },   // 9
  { cue:[208,109], goal:[14,10], avoid:[], par:2, max:4, balls:[[14,636,158],[10,142,117],[5,446,134]] },   // 10
  { cue:[303,219], goal:[1], avoid:[], par:1, max:3, balls:[[1,327,199],[5,535,193],[7,341,266],[10,245,181]] },   // 11
  { cue:[130,147], goal:[14], avoid:[], par:1, max:3, balls:[[14,100,112],[6,432,234],[9,469,230],[3,364,274]] },   // 12
  { cue:[280,240], goal:[14], avoid:[], par:1, max:3, balls:[[14,392,215],[5,312,238],[4,488,224],[10,593,306]] },   // 13
  { cue:[229,146], goal:[13,12], avoid:[], par:2, max:4, balls:[[13,363,256],[12,553,349],[7,446,286],[4,515,295],[14,402,229]] },   // 14
  { cue:[264,93], goal:[10,15], avoid:[], par:2, max:4, balls:[[10,370,148],[15,415,180],[6,256,133],[2,438,267],[3,313,114]] },   // 15
  { cue:[216,272], goal:[15,1,10], avoid:[], par:3, max:5, balls:[[15,68,245],[1,546,329],[10,359,244],[6,503,121]] },   // 16
  { cue:[268,87], goal:[6,11,15], avoid:[], par:3, max:5, balls:[[6,214,97],[11,564,246],[15,396,270],[1,137,269]] },   // 17
  { cue:[183,81], goal:[9,4,2], avoid:[], par:3, max:5, balls:[[9,374,205],[4,78,251],[2,422,176],[5,478,172]] },   // 18
  { cue:[161,196], goal:[1,13,2], avoid:[], par:3, max:5, balls:[[1,348,273],[13,674,169],[2,124,51],[6,554,204],[11,497,192]] },   // 19
  { cue:[246,105], goal:[14,1,4], avoid:[], par:3, max:5, balls:[[14,335,233],[1,530,61],[4,176,216],[6,456,78],[15,314,205]] },   // 20
  { cue:[237,124], goal:[2,4,5,6], avoid:[], par:4, max:6, balls:[[2,127,324],[4,638,214],[5,555,240],[6,304,212]] },   // 21
  { cue:[313,293], goal:[2,6,1,4], avoid:[], par:4, max:6, balls:[[2,157,336],[6,171,308],[1,152,258],[4,140,183]] },   // 22
  { cue:[219,257], goal:[1,2,12,6], avoid:[8], par:4, max:6, balls:[[1,138,275],[2,344,125],[12,165,144],[6,210,97],[8,215,66]] },   // 23
  { cue:[280,202], goal:[7,6,13,11], avoid:[8], par:4, max:6, balls:[[7,398,141],[6,195,229],[13,627,304],[11,221,74],[8,221,265]] },   // 24
  { cue:[255,246], goal:[10,9,2,5], avoid:[8], par:4, max:6, balls:[[10,395,251],[9,409,166],[2,665,268],[5,74,219],[8,517,244]] },   // 25
  { cue:[369,219], goal:[1,15,4], avoid:[8], par:3, max:5, balls:[[1,142,305],[15,203,126],[4,416,131],[5,167,214],[12,279,130],[10,566,197],[8,612,217]] },   // 26
  { cue:[300,216], goal:[7,5,14], avoid:[8], par:3, max:5, balls:[[7,393,140],[5,516,300],[14,202,312],[12,653,167],[15,666,247],[10,284,150],[8,312,163]] },   // 27
  { cue:[163,116], goal:[12,5,11], avoid:[8], par:3, max:5, balls:[[12,350,165],[5,613,299],[11,401,218],[1,109,318],[2,323,175],[4,276,137],[8,429,177]] },   // 28
  { cue:[264,234], goal:[11,12,7,3], avoid:[8], par:4, max:6, balls:[[11,252,291],[12,418,224],[7,619,101],[3,122,210],[10,574,75],[9,625,303],[14,371,268],[8,370,120]] },   // 29
  { cue:[328,228], goal:[5,4,12,6], avoid:[8], par:3, max:5, balls:[[5,61,137],[4,219,109],[12,337,257],[6,382,147],[10,199,215],[11,249,142],[9,534,209],[8,284,330]] },   // 30
/*CHAL_END*/
];
const CHEST_MS = 4 * 3600 * 1000;      // baú grátis de 4 em 4 horas (aberto com vídeo)
const CHEST = [ { w: 60, min: 120, max: 240 }, { w: 28, min: 250, max: 450 }, { w: 10, min: 600, max: 900 }, { w: 2, min: 2000, max: 2000 } ];
const NOADS_ID = 'remove_ads';
const STARTER_ID = 'starter_pack';   // oferta única (novo produto; criar na App Store Connect)
const SAVE_KEY = 'pool8_save_v1';
// Versões do save: 1 = tudo até à Fase 10 (sem campo "v"); 2 = Fase 11 (versão, definições, validação).
const SAVE_VER = 2;
const SAVE_DEFAULTS = () => ({ v: SAVE_VER, lowFx:false, fxSet:false, vib:true, lefty:false, lang:'', coins:500, wins:0, losses:0, cues:[0], cue:0, cloths:[0], cloth:0, noAds:false, lastDaily:'', streak:0, matches:0,
  xp:0, pots:0, winStreak:0, bestStreak:0, missions:{ day:'', prog:{}, done:{} }, mute:false, tutDone:false, firstDone:false,
  chal:{}, tour:null, ach:{}, dailyBest:0, bestShot:0, tourWins:0, perfect:0,
  tables:[0], table:0, offerSeen:false, starter:false,
  playSec:0, adCount:0, lastAdAt:0, vid:{ start:0, n:0, dbl:0 }, chestAt:0, xpVer:0, p2g:0, p2s:0, weeklyStars:0 });
// Validação: aceita qualquer coisa vinda do armazenamento (corrompida, editada, de versões antigas) e devolve um save coerente.
function sanitizeSave(o) {
  const d = SAVE_DEFAULTS(); if (!o || typeof o !== 'object' || Array.isArray(o)) return d;
  const I = (v, def, lo = 0, hi = 1e12) => { v = +v; return Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : def; };
  const Bo = (v, def) => typeof v === 'boolean' ? v : def;
  const St = (v, def, n = 40) => typeof v === 'string' ? v.slice(0, n) : def;
  const own = (a, max) => { const s = new Set([0]); if (Array.isArray(a)) a.forEach(i => { i = +i; if (Number.isInteger(i) && i >= 0 && i < max) s.add(i); }); return [...s].sort((x, y) => x - y); };
  const obj = v => v && typeof v === 'object' && !Array.isArray(v);
  const out = d;
  for (const k of ['wins', 'losses', 'matches', 'xp', 'pots', 'winStreak', 'bestStreak', 'streak', 'dailyBest', 'bestShot', 'tourWins', 'perfect', 'playSec', 'adCount', 'xpVer', 'p2g', 'p2s', 'weeklyStars']) out[k] = I(o[k], d[k]);
  const TS = 8.64e15;                                   // limite de uma Date (carimbos de tempo em ms: Date.now() ≈ 1,8e12)
  out.lastAdAt = I(o.lastAdAt, 0, 0, TS); out.chestAt = I(o.chestAt, 0, 0, TS);
  out.coins = I(o.coins, d.coins, 0, 1e9);
  for (const k of ['lowFx', 'fxSet', 'vib', 'lefty', 'noAds', 'mute', 'tutDone', 'firstDone', 'offerSeen', 'starter']) out[k] = Bo(o[k], d[k]);
  out.lastDaily = St(o.lastDaily, '', 20); out.lang = o.lang === 'pt' || o.lang === 'en' ? o.lang : '';
  out.cues = own(o.cues, CUES.length); out.cloths = own(o.cloths, CLOTHS.length); out.tables = own(o.tables, TABLES.length);
  out.cue = out.cues.includes(+o.cue) ? +o.cue : 0; out.cloth = out.cloths.includes(+o.cloth) ? +o.cloth : 0; out.table = out.tables.includes(+o.table) ? +o.table : 0;
  out.chal = {}; if (obj(o.chal)) for (const k in o.chal) { const i = +k; if (Number.isInteger(i) && i >= 0 && i < 30) out.chal[i] = I(o.chal[k], 0, 0, 3); }
  out.ach = {}; if (obj(o.ach)) for (const k in o.ach) if (/^[a-z0-9_]{1,24}$/i.test(k) && o.ach[k]) out.ach[k] = true;
  if (obj(o.missions)) { out.missions = { day: St(o.missions.day, '', 12), prog: {}, done: {} }; for (const k of ['prog', 'done']) if (obj(o.missions[k])) for (const q in o.missions[k]) if (/^[a-z0-9_]{1,16}$/i.test(q)) out.missions[k][q] = k === 'done' ? !!o.missions[k][q] : I(o.missions[k][q], 0); }
  out.tour = obj(o.tour) && Number.isFinite(+o.tour.round) ? Object.assign({}, o.tour, { round: I(o.tour.round, 0, 0, 2), live: !!o.tour.live }) : null;
  if (obj(o.vid)) out.vid = { start: I(o.vid.start, 0, 0, TS), n: I(o.vid.n, 0), dbl: I(o.vid.dbl, 0) };
  if (obj(o.p2) && Array.isArray(o.p2.names)) out.p2 = { names: [St(o.p2.names[0], '', 12), St(o.p2.names[1], '', 12)], len: [1, 3, 5].includes(+o.p2.len) ? +o.p2.len : 1 };
  if (obj(o.train) && Array.isArray(o.train.a) && Array.isArray(o.train.p) && o.train.a.length === 72 && o.train.p.length === 72) out.train = { shots: I(o.train.shots, 0), pots: I(o.train.pots, 0), a: o.train.a.map(x => I(x, 0, 0, 1e6)), p: o.train.p.map(x => I(x, 0, 0, 1e6)) };
  if (obj(o.weekly)) out.weekly = { k: I(o.weekly.k, 0), stars: I(o.weekly.stars, 0, 0, 3), best: I(o.weekly.best, 0, 0, 99) };
  return out;
}
// Migração: converte saves antigos (v1) para o formato atual antes de validar.
function migrateSave(raw) {
  const o = Object.assign({}, raw), ver = +o.v || 1;
  if (!o.xpVer) {   // v1: converte o XP guardado para a nova curva mantendo nível e progresso
    let l = 1, x = +o.xp || 0; while (x >= 100 + 50 * (l - 1)) { x -= 100 + 50 * (l - 1); l++; }
    let nx = 0; for (let i = 1; i < l; i++) nx += 150 + 75 * (i - 1);
    o.xp = Math.round(nx + x / (100 + 50 * (l - 1)) * (150 + 75 * (l - 1))); o.xpVer = 2;
  }
  if (ver > SAVE_VER) console.warn('save de uma versão mais recente (' + ver + '); a ler apenas o que se conhece');
  const s = sanitizeSave(o); s.v = SAVE_VER; return s;
}
let saveFrom = 'novo';
function loadSave() {                       // lê o save; se estiver corrompido usa a cópia de segurança; senão começa de novo
  const rd2 = k => { try { const r = localStorage.getItem(k); return r === null ? null : JSON.parse(r); } catch (e) { return undefined; } };
  let raw = rd2(SAVE_KEY);
  const okObj = v => v && typeof v === 'object' && !Array.isArray(v);
  if (okObj(raw)) saveFrom = 'principal';
  else { const bak = rd2(SAVE_KEY + '_bak'); if (okObj(bak)) { raw = bak; saveFrom = 'cópia'; } else { saveFrom = raw === null && bak === null ? 'novo' : 'recomeçado'; raw = {}; } }
  return migrateSave(raw);
}
let save = loadSave();
if (save.matches > 0) save.firstDone = save.tutDone = true;
if (save.tour && save.tour.live) { save.tour = null; save.losses++; save.matches++; save.winStreak = 0; }   // recarregou a meio de uma ronda = abandono   // saves antigos: já jogou
if (!save.chal || typeof save.chal !== 'object') save.chal = {};
if (!save.ach || typeof save.ach !== 'object') save.ach = {};
if (!save.missions || typeof save.missions !== 'object') save.missions = { day:'', prog:{}, done:{} };
let lastBak = 0;
const persist = () => {
  try {
    const js = JSON.stringify(save);
    if (Date.now() - lastBak > 60000) { const prev = localStorage.getItem(SAVE_KEY); if (prev) localStorage.setItem(SAVE_KEY + '_bak', prev); lastBak = Date.now(); }   // cópia do estado anterior (no máx. 1 por minuto)
    localStorage.setItem(SAVE_KEY, js);
  } catch (e) {}
  refreshCoins(); checkAch();
};
const curCue = () => CUES[save.cue] || CUES[0], curCloth = () => CLOTHS[save.cloth] || CLOTHS[0], curTable = () => TABLES[save.table] || TABLES[0];
if (!Array.isArray(save.tables)) save.tables = [0];
if (!save.vid || typeof save.vid !== 'object') save.vid = { day: '', n: 0 };

// ---------- Monetização (anúncios + compras) ----------
// Na web usa simulação. Dentro da app (Capacitor) usa AdMob e compras nativas.
// IDs abaixo são os de TESTE da Google — trocar pelos teus antes de publicar (ver MONETIZACAO.md).
const Monet = {
  native: !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()),
  ids: { interstitial:'ca-app-pub-3940256099942544/4411468910', rewarded:'ca-app-pub-3940256099942544/1712485313', banner:'ca-app-pub-3940256099942544/2934735716' },
  fake(label, secs) {
    return new Promise(res => {
      const ov = $('adov'), btn = $('adClose'); let t = secs;
      ov.classList.add('show'); btn.disabled = true;
      const tick = () => { $('adTxt').textContent = label + (t > 0 ? ' — ' + t + 's' : ''); if (t-- > 0) setTimeout(tick, 1000); else { btn.disabled = false; } };
      tick(); btn.onclick = () => { ov.classList.remove('show'); res(true); };
    });
  },
  async init() {
    if (!this.native) return;   // ADS_TEST: true = anúncios de teste do AdMob (IDs de teste). Pôr false SÓ no build de produção, junto com os IDs reais (ver PUBLICAR.md ponto 7)
    try { const A = window.Capacitor.Plugins.AdMob; await A.initialize({ initializeForTesting: ADS_TEST }); if (!save.noAds) A.showBanner({ adId:this.ids.banner, position:'BOTTOM_CENTER', margin:0 }); } catch (e) {}
    try { window.CdvPurchase.store.when().approved(t => { try { t.finish(); } catch (e) {} }); } catch (e) {}   // sem finish() a transação volta em cada arranque
    try { window.CdvPurchase.store.register([{ id:NOADS_ID, type:CdvPurchase.ProductType.NON_CONSUMABLE, platform:CdvPurchase.Platform.APPLE_APPSTORE }, { id:STARTER_ID, type:CdvPurchase.ProductType.NON_CONSUMABLE, platform:CdvPurchase.Platform.APPLE_APPSTORE }, ...COIN_PACKS.map(p => ({ id:p.id, type:CdvPurchase.ProductType.CONSUMABLE, platform:CdvPurchase.Platform.APPLE_APPSTORE }))]); await CdvPurchase.store.initialize(); } catch (e) {}
  },
  // ---- política de anúncios (tudo o que decide quando mostrar anúncios está aqui) ----
  AD: { minPlaySec: 300, everyMatches: 3, minGapMs: 90000, videosPerDay: 6, doublesPerDay: 8, doubleCap: 500 },
  noteMatch() { save.adCount = (save.adCount || 0) + 1; },
  canInterstitial() {   // nunca nos primeiros 5 min de jogo, no máximo 1 a cada 3 partidas, nunca a meio de uma partida/torneio
    return !save.noAds && mode !== '2p' && !save.tour && (save.playSec || 0) >= this.AD.minPlaySec
      && (save.adCount || 0) >= this.AD.everyMatches && Date.now() - (save.lastAdAt || 0) >= this.AD.minGapMs;
  },
  async maybeInterstitial() {   // só chamado a partir dos botões do ecrã final
    if (!this.canInterstitial()) return false;
    await this.interstitial(); save.lastAdAt = Date.now(); save.adCount = 0; persist(); return true;
  },
  videosLeft() { const now = Date.now(); if (!save.vid.start || now - save.vid.start >= 864e5) save.vid = { start: now, n: 0, dbl: 0 }; return Math.max(0, this.AD.videosPerDay - save.vid.n); },
  doublesLeft() { this.videosLeft(); return Math.max(0, this.AD.doublesPerDay - (save.vid.dbl || 0)); },
  doubleBonus(prize) { return Math.min(prize, this.AD.doubleCap); },
  async watchCoins() {   // vídeo -> +150 moedas, limite diário
    if (this.videosLeft() <= 0) { toast(tr('ad.limit')); return false; }
    if (!(await this.rewarded())) return false;
    save.vid.n++; save.coins += 150; persist(); toast(tr('ad.coins', { n: this.videosLeft() })); return true;
  },
  // ---- compras: cada produto sabe o que concede; uma de cada vez; não-consumíveis não se repetem ----
  grants: {},
  async purchase(id) {
    const g = this.grants[id]; if (!g || (g.once && g.has())) return false;
    if (!(await this.buy(id))) return false;
    if (g.once && g.has()) return false;   // outra chamada já concedeu enquanto esperávamos
    g.apply(); persist(); return true;
  },
  _adBusy: false,
  async interstitial() {
    if (save.noAds || this._adBusy) return;
    this._adBusy = true;
    try {
      if (!this.native) return await this.fake(tr('ad.interstitial'), 3);
      try { const A = window.Capacitor.Plugins.AdMob; await A.prepareInterstitial({ adId:this.ids.interstitial }); await A.showInterstitial(); } catch (e) {}
    } finally { this._adBusy = false; }
  },
  async rewarded() { // devolve true se o utilizador viu o vídeo até ao fim
    if (this._adBusy) return false;
    this._adBusy = true;
    try {
      let ok = false;
      if (!this.native) ok = await this.fake(tr('ad.rewarded'), 5);
      else { try { const A = window.Capacitor.Plugins.AdMob; await A.prepareRewardVideoAd({ adId:this.ids.rewarded }); ok = !!(await A.showRewardVideoAd()); } catch (e) { ok = false; } }
      if (ok) save.lastAdAt = Date.now();   // acabou de ver um anúncio: não mostrar um intersticial logo a seguir
      return ok;
    } finally { this._adBusy = false; }
  },
  banner(on) {   // chamado quando se entra/sai de uma partida; o banner web é só um espaço reservado e está sempre escondido
    if (!this.native || save.noAds) return;
    try { const A = window.Capacitor.Plugins.AdMob; if (on) A.resumeBanner(); else A.hideBanner(); } catch (e) {}
  },
  busy: false,
  async buy(id) { // devolve true se a compra foi concluída (uma de cada vez)
    if (this.busy) return false;
    this.busy = true;
    try {
      if (!this.native) return confirm(tr('buy.sim', { id }));
      const st = window.CdvPurchase.store, offer = st.get(id).getOffer();
      const err = await offer.order(); return !err;
    } catch (e) { return false; } finally { this.busy = false; }
  },
  async restore() {
    if (!this.native) return toast(tr('buy.restoredSim'));
    try {
      const st = window.CdvPurchase.store; await st.restorePurchases();
      const owns = id => { try { return !!(st.owned ? st.owned(id) : st.get(id).owned); } catch (e) { return false; } };
      if (owns(NOADS_ID) && !save.noAds) { save.noAds = true; hideBannerIfPaid(); }
      if (owns(STARTER_ID) && !save.starter) applyStarter(false);
      persist(); toast(tr('buy.restored'));
    } catch (e) { toast(tr('buy.restoreFail')); }
  },
};
COIN_PACKS.forEach(pk => { Monet.grants[pk.id] = { apply: () => { save.coins += pk.coins; toast(tr('buy.done')); } }; });
Monet.grants[NOADS_ID] = { once: true, has: () => save.noAds, apply: () => { save.noAds = true; hideBannerIfPaid(); } };
Monet.grants[STARTER_ID] = { once: true, has: () => save.starter, apply: () => applyStarter() };
function hideBannerIfPaid() { $('banner').classList.toggle('hide', save.noAds); resize(); if (save.noAds && Monet.native) try { window.Capacitor.Plugins.AdMob.removeBanner(); } catch (e) {} }

// ---------- Nível, XP e missões ----------
const dayKey = (d = new Date()) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const lvlNeed = l => 150 + 75 * (l - 1);            // XP para passar do nível l ao l+1 (níveis mais lentos = desbloqueios duram mais)
const levelBonus = l => Math.min(600, 100 + 25 * (l - 1));   // moedas ao chegar ao nível l (limitado para não inflacionar)
function lvlInfo() { let l = 1, x = save.xp; while (x >= lvlNeed(l)) { x -= lvlNeed(l); l++; } return { l, x, need: lvlNeed(l) }; }
const titleOf = l => tr('title.' + Math.min(5, Math.floor((l - 1) / 3)));
function addXp(n) { // devolve texto se subiu de nível
  const before = lvlInfo().l; save.xp += n; const after = lvlInfo().l;
  if (after <= before) return '';
  let bonus = 0; for (let l = before + 1; l <= after; l++) bonus += levelBonus(l);
  save.coins += bonus;
  const unl = [...ROOMS.filter(r => r.lvl > before && r.lvl <= after).map(r => tr('lvl.room', { name: r.name })), ...CUES.filter(c => c.lvl > before && c.lvl <= after).map(c => c.name)];
  if (TOUR.lvl > before && TOUR.lvl <= after) unl.push(tr('lvl.tour'));
  return tr('lvl.up', { l: after, title: titleOf(after), b: bonus }) + (unl.length ? tr('lvl.unlocked', { list: unl.join(', ') }) : '');
}
const totalStars = () => Object.values(save.chal).reduce((a, b) => a + b, 0);
const chalDone = () => Object.values(save.chal).filter(v => v > 0).length;
const ACH = [
  { id: 'first_win', r: 50,   prog: () => [save.wins, 1] },
  { id: 'wins10',    r: 150,  prog: () => [save.wins, 10] },
  { id: 'wins50',    r: 500,  prog: () => [save.wins, 50] },
  { id: 'pots25',    r: 50,   prog: () => [save.pots, 25] },
  { id: 'pots250',   r: 300,  prog: () => [save.pots, 250] },
  { id: 'streak3',   r: 100,  prog: () => [save.bestStreak, 3] },
  { id: 'streak7',   r: 400,  prog: () => [save.bestStreak, 7] },
  { id: 'shot3',     r: 150,  prog: () => [save.bestShot, 3] },
  { id: 'lvl5',      r: 100,  prog: () => [lvlInfo().l, 5] },
  { id: 'lvl10',     r: 300,  prog: () => [lvlInfo().l, 10] },
  { id: 'cue2',      r: 50,   prog: () => [save.cues.length, 2] },
  { id: 'cuesAll',   r: 500,  prog: () => [save.cues.length, CUES.length] },
  { id: 'cloth3',    r: 100,  prog: () => [save.cloths.length, 3] },
  { id: 'daily7',    r: 200,  prog: () => [save.dailyBest, 7] },
  { id: 'chal1',     r: 50,   prog: () => [chalDone(), 1] },
  { id: 'chal10',    r: 200,  prog: () => [chalDone(), 10] },
  { id: 'stars30',   r: 400,  prog: () => [totalStars(), 30] },
  { id: 'stars60',   r: 800,  prog: () => [totalStars(), 60] },
  { id: 'tour',      r: 600,  prog: () => [save.tourWins, 1] },
  { id: 'perfect',   r: 300, prog: () => [save.perfect, 1] },
  { id: 'rich',      r: 100,  prog: () => [save.coins, 10000] },
];
ACH.forEach(a => { Object.defineProperty(a, 'name', { get: () => tr('ach.' + a.id + '.n') }); Object.defineProperty(a, 'desc', { get: () => tr('ach.' + a.id + '.d') }); });
let achQueue = [], achBusy = false;
function showAch() {
  if (achBusy || !achQueue.length) return;
  achBusy = true; const a = achQueue.shift(), el = $('achToast');
  el.textContent = tr('ach.toast', { name: a.name, r: a.r }); el.classList.add('show'); Snd.win();
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => { achBusy = false; showAch(); }, 350); }, 2800);
}
function checkAch() {
  const got = [];
  for (const a of ACH) { if (save.ach[a.id]) continue; const [c, g] = a.prog(); if (c >= g) { save.ach[a.id] = 1; save.coins += a.r; got.push(a); } }
  const n = got.length;
  if (n > 2) achQueue.push({ name: tr('ach.batch', { n }), r: got.reduce((x, a) => x + a.r, 0) }); else achQueue.push(...got);
  if (econSim) achQueue.length = 0;
  if (n) { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) {} refreshCoins(); showAch(); }
}
function ensureMissions() { const d = dayKey(); if (save.missions.day !== d) save.missions = { day: d, prog: {}, done: {} }; }
function bump(key, n = 1) { ensureMissions(); save.missions.prog[key] = (save.missions.prog[key] || 0) + n; }

function refreshCoins() {
  try { $('btnVideo').innerHTML = `<svg class="ic"><use href="#i-video"/></svg> ${tr('menu.video', { n: Monet.videosLeft() })}`; } catch (e) {}
  if (typeof updateChest === 'function' && $('btnChest')) try { updateChest(); } catch (e) {}
  const li = lvlInfo();
  $('coinN').textContent = save.coins; $('hudCoinN').textContent = save.coins;
  $('lvlInfo').textContent = tr('menu.lvl', { l: li.l, title: titleOf(li.l), w: save.wins, d: save.losses });
}
const open = id => { document.querySelectorAll('.overlay').forEach(o => { if (o.id !== 'adov') o.classList.remove('show'); }); $(id).classList.add('show'); refreshCoins(); wake(); };
document.querySelectorAll('[data-close]').forEach(b => b.onclick = () => open('menu'));

function renderProfile() {
  ensureMissions();
  const li = lvlInfo();
  $('profInfo').innerHTML = `<div class="t"><b>${tr('prof.rank', { title: titleOf(li.l), l: li.l })}</b><div class="xp"><i style="width:${Math.round(li.x / li.need * 100)}%"></i></div><small>${tr('prof.xp', { x: li.x, n: li.need })}</small><small>${tr('prof.s1', { w: save.wins, p: save.wins + save.losses ? Math.round(save.wins / (save.wins + save.losses) * 100) : 0, l: save.losses })}</small><small>${tr('prof.s2', { a: save.bestStreak, b: save.pots, c: save.bestShot })}</small><small>${tr('prof.s3', { s: totalStars(), t: CHALLENGES.length * 3, a: Object.keys(save.ach).length, n: ACH.length })}</small></div>`;
  const box = $('missionList'); box.innerHTML = '';
  MISSIONS.forEach(m => {
    const prog = Math.min(m.goal, save.missions.prog[m.key] || 0), done = !!save.missions.done[m.id], ready = prog >= m.goal && !done;
    const d = document.createElement('div'); d.className = 'card';
    d.innerHTML = `<div class="t"><b>${m.txt}</b><small>${tr('mis.sub', { p: prog, g: m.goal })}</small></div><button ${ready ? '' : 'disabled'}>${done ? tr('mis.claimed') : ready ? '🪙' + m.reward : '🔒'}</button>`;
    d.querySelector('button').onclick = () => { save.missions.done[m.id] = true; save.coins += m.reward; persist(); toast(tr('mis.toast', { n: m.reward })); renderProfile(); };
    box.appendChild(d);
  });
}

function renderAch() {
  const box = $('achList'); box.innerHTML = ''; let n = 0;
  ACH.forEach(a => {
    const [c, g] = a.prog(), done = !!save.ach[a.id]; if (done) n++;
    const d = document.createElement('div'); d.className = 'card';
    d.innerHTML = `<div class="t"><b>${done ? '🏆' : '🔒'} ${a.name}</b><small>${a.desc} · ${done ? tr('ach.done') : Math.min(c, g) + '/' + g}</small></div><span>🪙${a.r}</span>`;
    box.appendChild(d);
  });
  $('achSum').textContent = tr('ach.sum', { n, t: ACH.length });
}
function dailyInfo() {
  const today = dayKey(), yd = new Date();
  yd.setDate(yd.getDate() - 1);
  const y = dayKey(yd);
  if (save.lastDaily >= today) return { done: save.streak, next: null };
  if (save.lastDaily === y) return save.streak >= 7 ? { done: 0, next: 1 } : { done: save.streak, next: save.streak + 1 };
  return { done: 0, next: 1 };
}
function renderDaily() {
  const d = dailyInfo(), g = $('dailyGrid'); g.innerHTML = '';
  DAILY.forEach((amt, i) => {
    const day = i + 1, c = document.createElement('div');
    c.className = 'dcell' + (day <= d.done ? ' done' : '') + (day === d.next ? ' today' : '') + (day === 7 ? ' big' : '');
    c.innerHTML = `<small>${tr('daily.day', { n: day })}</small><b>${day === 7 ? '🎁' : '🪙'}${amt}</b>${day <= d.done ? '<i>✔</i>' : ''}`;
    g.appendChild(c);
  });
  $('btnClaim').disabled = !d.next; $('btnClaim').textContent = d.next ? tr('daily.claim', { n: DAILY[d.next - 1] }) : tr('daily.tomorrow');
  $('dailyMsg').textContent = d.next ? (d.next === 1 ? tr('daily.start') : tr('daily.streak', { d: d.done, n: d.next })) : tr('daily.wait', { d: save.streak });
}
function renderRooms() {
  const box = $('roomList'); box.innerHTML = '';
  const first = !save.firstDone;
  ROOMS.forEach((r, i) => {
    const lv = lvlInfo().l, locked = (first && i > 0) || lv < r.lvl, free = first && i === 0;
    const d = document.createElement('div'); d.className = 'card';
    d.innerHTML = `<div class="t"><b>${r.name}</b><small>${free ? tr('rooms.free', { p: r.prize }) : locked ? (first ? tr('rooms.unlock1') : tr('rooms.unlockLv', { n: r.lvl })) : tr('rooms.info', { f: r.fee, p: r.prize })}</small></div><button ${locked ? 'disabled' : ''}>${locked ? '🔒' : tr('rooms.play')}</button>`;
    d.querySelector('button').onclick = async () => {
      if (locked) return;
      if (!free && save.coins < r.fee) { if (confirm(tr('rooms.noCoins'))) await watchForCoins(); return; }
      newGame('cpu', r);
    };
    box.appendChild(d);
  });
}
let shopTab = 'cues';
function pvCanvas(w, h, draw) {
  const cv2 = document.createElement('canvas'), dpr = 2; cv2.width = w * dpr; cv2.height = h * dpr; cv2.style.width = w + 'px'; cv2.style.height = h + 'px';
  const g = cv2.getContext('2d'); g.scale(dpr, dpr); draw(g); return cv2;
}
const cuePerks = c => { const a = []; if (c.spin > 1) a.push(tr('perk.spin', { v: c.spin.toFixed(1) })); if (c.aim > 0) a.push(tr('perk.aim', { p: Math.round(c.aim * 100) })); if (c.power > 1) a.push(tr('perk.power', { p: Math.round((c.power - 1) * 100) })); return a.length ? a.join(' · ') : tr('perk.cosmetic'); };
const byRarity = list => list.map((x, i) => i).sort((a, b) => RARITY[list[a].rar].r - RARITY[list[b].rar].r || list[a].price - list[b].price);
function renderShop() {
  const box = $('shopList'); box.innerHTML = '';
  document.querySelectorAll('#shopTabs button').forEach(b => b.classList.toggle('on', b.dataset.t === shopTab));
  const lv = lvlInfo().l;
  const card = (sw, title, sub, label, fn, dis) => { const d = document.createElement('div'); d.className = 'card'; d.innerHTML = `${sw ? `<div class="sw" style="background:${sw}"></div>` : ''}<div class="t"><b>${title}</b><small>${sub}</small></div><button ${dis ? 'disabled' : ''}>${label}</button>`; d.querySelector('button').onclick = fn; box.appendChild(d); };
  const item = o => {
    const R = RARITY[o.rar], d = document.createElement('div'); d.className = 'card shopc'; d.style.setProperty('--rc', R.c);
    d.innerHTML = `<div class="pvw"></div><div class="t"><span class="tag" style="color:${R.c}">${R.n}</span><b>${o.title}</b><small>${o.sub}</small></div><button ${o.dis ? 'disabled' : ''}>${o.label}</button>`;
    d.querySelector('.pvw').appendChild(o.pv); d.querySelector('button').onclick = o.fn; box.appendChild(d);
  };
  const lab = (own, using, lock, lvl, price) => own ? (using ? tr('ui.using') : tr('ui.use')) : lock ? tr('shop.lockLv', { n: lvl }) : '🪙' + price;
  if (shopTab === 'cues') byRarity(CUES).forEach(i => {
    const c = CUES[i], own = save.cues.includes(i), lock = !own && c.lvl > lv, using = own && save.cue === i;
    item({ rar: c.rar, title: c.name, sub: cuePerks(c) + (lock ? ' · ' + tr('shop.level', { n: c.lvl }) : ''), label: lab(own, using, lock, c.lvl, c.price), dis: using || lock,
      pv: pvCanvas(96, 26, g => { g.translate(0, 13); drawCueShape(g, 92, 0, 1, 0, 90, c, 1, 0.62); }),
      fn: () => { if (lock) return; if (own) save.cue = i; else if (save.coins >= c.price) { save.coins -= c.price; save.cues.push(i); save.cue = i; } else return toast(tr('shop.noCoins')); persist(); renderShop(); } });
  });
  if (shopTab === 'cloth') byRarity(CLOTHS).forEach(i => {
    const c = CLOTHS[i], own = save.cloths.includes(i), using = own && save.cloth === i, sp = Math.round((1 / c.fr - 1) * 100);
    item({ rar: c.rar, title: c.name, sub: sp === 0 ? tr('cloth.normal') : sp > 0 ? tr('cloth.faster', { p: sp }) : tr('cloth.slower', { p: sp }), label: lab(own, using, false, 0, c.price), dis: using,
      pv: pvCanvas(80, 44, g => { g.scale(80 / W, 44 / H); drawTable(g, TABLES[0], c); }),
      fn: () => { if (own) save.cloth = i; else if (save.coins >= c.price) { save.coins -= c.price; save.cloths.push(i); save.cloth = i; } else return toast(tr('shop.noCoins')); persist(); renderShop(); } });
  });
  if (shopTab === 'tables') byRarity(TABLES).forEach(i => {
    const t = TABLES[i], own = save.tables.includes(i), lock = !own && t.lvl > lv, using = own && save.table === i;
    item({ rar: t.rar, title: tr('shop.table', { name: t.name }), sub: tr('perk.cosmetic') + (lock ? ' · ' + tr('shop.level', { n: t.lvl }) : ''), label: lab(own, using, lock, t.lvl, t.price), dis: using || lock,
      pv: pvCanvas(80, 44, g => { g.scale(80 / W, 44 / H); drawTable(g, t, curCloth()); }),
      fn: () => { if (lock) return; if (own) save.table = i; else if (save.coins >= t.price) { save.coins -= t.price; save.tables.push(i); save.table = i; } else return toast(tr('shop.noCoins')); persist(); renderShop(); } });
  });
  if (shopTab === 'coins') {
    if (!save.starter && (save.offerSeen || save.matches >= 3)) card('#ffb02e', tr('shop.starter'), tr('shop.starterSub', { cue: CUES.find(c => c.id === 'carbon').name, cloth: CLOTHS.find(c => c.id === 'turquoise').name }), '0,99 €', async () => { if (await Monet.purchase(STARTER_ID)) renderShop(); });
    COIN_PACKS.forEach(p => card('#ffd54a', `🪙 ${p.coins}`, tr('shop.pack'), p.price, async () => { await Monet.purchase(p.id); }));
    card('#fff', tr('shop.noads'), tr('shop.noadsSub'), save.noAds ? tr('shop.bought') : '2,99 €', async () => { if (await Monet.purchase(NOADS_ID)) renderShop(); }, save.noAds);
    card(null, tr('shop.restore'), tr('shop.restoreSub'), tr('shop.restoreBtn'), () => Monet.restore());
  }
}
document.querySelectorAll('#shopTabs button').forEach(b => b.onclick = () => { shopTab = b.dataset.t; renderShop(); });
const watchForCoins = () => Monet.watchCoins();
function claimDaily() {
  const d = dailyInfo();
  if (!d.next) return toast(tr('daily.already'));
  save.streak = d.next; save.lastDaily = dayKey(); save.dailyBest = Math.max(save.dailyBest, d.next);
  const amt = DAILY[d.next - 1]; save.coins += amt; persist();
  toast(tr('daily.got', { n: d.next, a: amt })); renderDaily();
}

// ---------- Estado ----------
let balls = [], cue = null;
let mode = 'cpu', room = ROOMS[0];           // 'cpu' | '2p'
let state = 'menu';         // menu | aim | moving | resolving | over
let turn = 0;               // 0 ou 1
let groups = [null, null];  // 'solid' | 'stripe'
let ballInHand = false;
let aimAngle = 0;
let power = 0;
let shot = null, pre = null;
let firstBreak = true;
let cpuS = null;            // máquina de estados do CPU: { ph:'wait'|'aim'|'hold', t, ... }
let view = { s: 1, ox: 0, oy: 0 };
let toastTimer = 0;
let spin = { x: 0, y: 0 };  // efeito: y>0 = bola corrida (follow), y<0 = bola travada (draw)
let called = null, calledManual = false;   // caçapa marcada para a bola 8
let paused = false, gameId = 0, fMul = 1, SIM = false, TS = 1, autoPlay = false;
let strike = null;          // animação do taco: recua, avança e só então a bola sai
let slow = 0, cam = { t: 0, fx: W / 2, fy: H / 2 };   // câmara lenta + zoom na última bola
let shotPw = 0;
let chalSecond = false, humanSkill = null, econSim = false, chalCountPending = false, chalAdBusy = false;
let loopOn = true, idleN = 0, holdN = 0;   // loop de desenho: pára quando nada se mexe (ver loopActive/wake)
let p2cfg = null, series = null;
let mstat = { pots: 0, run: 0, maxRun: 0, opp: 0 }, chalIdx = 0, chalShots = 0, chalCur = null, overNext = 0;
let shotCount = 0, potCount = 0, easyCpu = false, tut = null, tutForce = false;   // 1.ª partida fácil; tutorial
let sinks = [], floats = [];  // bolas a afundar e textos flutuantes
