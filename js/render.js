'use strict';
// Desenho: bolas 3D, mesa em cache, taco, mira, efeitos e ciclo de animação.

// ---------- Desenho ----------
function resize() {
  const r = cv.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
  cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
  const s = Math.min(r.width / W, r.height / H);
  view = { s, ox: (r.width - W * s) / 2, oy: (r.height - H * s) / 2, dpr };
  wake();
}
window.addEventListener('resize', resize);
if (window.ResizeObserver) new ResizeObserver(resize).observe($('stage'));

// ---------- Bolas 3D (sprite desenhado pixel a pixel, rodado por matriz) ----------
const SPR = 72, SPR_R = SPR / 2;
const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const BASECOL = COLORS.map(hex), WHITE = [246, 246, 242], REDDOT = [200, 40, 40];
const nrm = v => { const l = Math.hypot(...v); return v.map(c => c / l); };
const LGT = nrm([-0.42, -0.55, 0.72]), HLF = nrm([LGT[0], LGT[1], LGT[2] + 1]);
const imgBuf = new ImageData(SPR, SPR);
// por pixel da esfera: posição na esfera, sombreado e brilho (independentes da rotação) pré-calculados uma vez
const PIX = (() => {
  const out = [];
  for (let py = 0; py < SPR; py++) for (let px = 0; px < SPR; px++) {
    const x = (px + 0.5 - SPR_R) / SPR_R, y = (py + 0.5 - SPR_R) / SPR_R, r2 = x * x + y * y;
    if (r2 > 1) { out.push(null); continue; }
    const z = Math.sqrt(1 - r2), nl = Math.max(0, LGT[0] * x + LGT[1] * y + LGT[2] * z), nh = Math.max(0, HLF[0] * x + HLF[1] * y + HLF[2] * z);
    const lx = (x + 0.20) / 0.21, ly = (y + 0.60) / 0.075, lamp = z > 0.2 ? Math.max(0, 1 - (lx * lx + ly * ly)) * 130 : 0;   // reflexo alongado da lâmpada
    const bounce = Math.max(0, y) * 0.12 * z, rim = Math.pow(1 - z, 3);                                                        // luz refletida do pano e brilho da borda
    out.push({ x, y, z, sh: 0.30 + 0.80 * nl + bounce - 0.10 * rim,
      sp: Math.pow(nh, 110) * 255 + Math.pow(nh, 14) * 26 + lamp + rim * 24,
      a: r2 > 0.9 ? Math.max(0, Math.min(1, (1 - Math.sqrt(r2)) * SPR_R)) * 255 : 255 });
  }
  return out;
})();
function renderBall(b) {
  if (!b.cv) { b.cv = document.createElement('canvas'); b.cv.width = b.cv.height = SPR; b.cx = b.cv.getContext('2d'); }
  const M = b.M, d = imgBuf.data, n = b.n, stripe = isStripe(n), base = n === 0 ? WHITE : BASECOL[n <= 8 ? n : n - 8];
  const m0 = M[0], m1 = M[1], m2 = M[2], m3 = M[3], m4 = M[4], m5 = M[5], m6 = M[6], m7 = M[7], m8 = M[8];
  for (let i = 0, k = 0; k < PIX.length; k++, i += 4) {
    const P = PIX[k];
    if (P === null) { d[i + 3] = 0; continue; }
    const x = P.x, y = P.y, z = P.z;
    let c = base;
    if (n === 0) {
      const bx = Math.abs(m0 * x + m3 * y + m6 * z), by = Math.abs(m1 * x + m4 * y + m7 * z), bz = Math.abs(m2 * x + m5 * y + m8 * z);
      c = (bx > 0.972 || by > 0.972 || bz > 0.972) ? REDDOT : WHITE;
    } else {
      if (stripe && Math.abs(m1 * x + m4 * y + m7 * z) >= 0.5) c = WHITE;
      if (Math.abs(m2 * x + m5 * y + m8 * z) > 0.877) c = WHITE;
    }
    const sh = P.sh, sp = P.sp;
    d[i] = Math.min(255, c[0] * sh + sp); d[i + 1] = Math.min(255, c[1] * sh + sp); d[i + 2] = Math.min(255, c[2] * sh + sp); d[i + 3] = P.a;
  }
  const g = b.cx; g.putImageData(imgBuf, 0, 0);
  if (n > 0) {                                   // número nos dois polos da bola, deformado conforme a inclinação
    g.fillStyle = '#111'; g.font = `bold ${SPR * (n > 9 ? 0.25 : 0.3)}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const sg of [1, -1]) {
      const vx = sg * M[2], vy = sg * M[5], vz = sg * M[8];
      if (vz < 0.35) continue;
      g.save(); g.globalAlpha = Math.min(1, (vz - 0.35) * 3);
      g.translate(SPR_R + vx * SPR_R, SPR_R + vy * SPR_R);
      const al = Math.atan2(vy, vx), rot = Math.atan2(M[4], M[1]) - Math.PI / 2;
      g.rotate(al); g.scale(vz, 1); g.rotate(rot - al);
      g.fillText(String(n), 0, 1);
      g.restore();
    }
  }
  b.dirty = false;
}
function roll(b, dx, dy, d) {                    // rolar sem deslizar: eixo perpendicular ao movimento
  const th = d / BR, ax = -dy / d, ay = dx / d, c = Math.cos(th), s = Math.sin(th), t = 1 - c, M = b.M;
  const r0 = c + t * ax * ax, r1 = t * ax * ay, r2 = s * ay, r3 = t * ax * ay, r4 = c + t * ay * ay, r5 = -s * ax, r6 = -s * ay, r7 = s * ax, r8 = c;
  const m = M.slice();
  for (let j = 0; j < 3; j++) {
    M[j] = r0 * m[j] + r1 * m[3 + j] + r2 * m[6 + j];
    M[3 + j] = r3 * m[j] + r4 * m[3 + j] + r5 * m[6 + j];
    M[6 + j] = r6 * m[j] + r7 * m[3 + j] + r8 * m[6 + j];
  }
  b.dirty = true;
}
function rollBalls() {
  for (const b of balls) {
    const dx = b.x - b.px, dy = b.y - b.py; b.px = b.x; b.py = b.y;
    if (!b.alive || state !== 'moving') continue;
    const d = Math.hypot(dx, dy);
    if (d > 0.02 && d < 80) roll(b, dx, dy, d);
  }
}
function drawBall(b, x, y, r, scale) {
  if (b.dirty || !b.cv) renderBall(b);
  const k = r * (scale || 1);
  ctx.drawImage(b.cv, x - k, y - k, 2 * k, 2 * k);
}
const shadowCv = (() => {                        // sombra suave pré-desenhada
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 4, 32, 32, 30); gr.addColorStop(0, 'rgba(0,0,0,.62)'); gr.addColorStop(0.55, 'rgba(0,0,0,.30)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return c;
})();
// ---------- Mesa (desenhada uma vez numa cache) ----------
// Tudo o que é estático (madeira, pano, luz, tabelas, caçapas, diamantes, logótipo) é pintado uma vez para tableCv; o que mexe é pintado por cima em drawFrame.
const mkRng = seed => { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
const mixHex = (a, b, k) => { const A = hex(a), B2 = hex(b); return 'rgb(' + A.map((v, i) => Math.round(v + (B2[i] - v) * k)).join(',') + ')'; };
const rgba = (arr, a) => 'rgba(' + arr[0] + ',' + arr[1] + ',' + arr[2] + ',' + a + ')';

const feltPat = (() => {                         // feltro: ruído fino + fibras curtas (padrão repetível)
  const S = 128, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d'), im = g.createImageData(S, S), r = mkRng(9);
  for (let i = 0; i < im.data.length; i += 4) { const v = r(), w = v > 0.5; im.data[i] = im.data[i + 1] = im.data[i + 2] = w ? 255 : 0; im.data[i + 3] = Math.round(Math.abs(v - 0.5) * (w ? 22 : 34)); }
  g.putImageData(im, 0, 0);
  for (let i = 0; i < 520; i++) { const x = r() * S, y = r() * S, a = r() * 6.28, l = 2 + r() * 4; g.strokeStyle = r() > 0.5 ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.07)'; g.lineWidth = 0.7; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); }
  return c;
})();

// Madeiras: veio (linhas onduladas com período inteiro para repetir sem costura) + nós + ruído
const WOOD_DEF = {
  oak:   { a: '#5e3416', b: '#8a5428', c: '#6a3d1c', dark: [35, 16, 6], lite: [215, 150, 85], knots: 2, str: 150 },
  light: { a: '#d8b982', b: '#efd9a8', c: '#c99a5c', dark: [120, 80, 36], lite: [255, 244, 215], knots: 1, str: 110 },
  black: { a: '#07070c', b: '#16162a', c: '#0b0b14', dark: [0, 0, 0], lite: [110, 130, 190], knots: 0, str: 60 },
  gold:  { a: '#7a5514', b: '#e9c460', c: '#a97d22', dark: [70, 44, 6], lite: [255, 240, 170], knots: 0, str: 190 },
};
const woodCache = {};
function woodTex(kind) {
  if (woodCache[kind]) return woodCache[kind];
  const d = WOOD_DEF[kind] || WOOD_DEF.oak, W2 = 256, H2 = 160, c = document.createElement('canvas'); c.width = W2; c.height = H2;
  const g = c.getContext('2d'), r = mkRng(kind.length * 977 + 3);
  const bg = g.createLinearGradient(0, 0, 0, H2); bg.addColorStop(0, d.a); bg.addColorStop(0.5, d.b); bg.addColorStop(1, d.c);
  g.fillStyle = bg; g.fillRect(0, 0, W2, H2);
  for (let i = 0; i < d.str; i++) {                                  // veio
    const y0 = r() * H2, k = 1 + (r() * 3 | 0), amp = 0.8 + r() * 3.2, ph = r() * 6.28, dark = r() > 0.45;
    g.strokeStyle = rgba(dark ? d.dark : d.lite, 0.04 + r() * (kind === 'gold' ? 0.2 : 0.14)); g.lineWidth = 0.5 + r() * 1.7;
    g.beginPath();
    for (let x = -4; x <= W2 + 4; x += 6) { const y = y0 + Math.sin(x / W2 * 6.2832 * k + ph) * amp; if (x === -4) g.moveTo(x, y); else g.lineTo(x, y); }
    g.stroke();
  }
  for (let n = 0; n < d.knots; n++) {                                // nós
    const x = 30 + r() * 190, y = 30 + r() * 100;
    for (let k = 1; k <= 5; k++) { g.strokeStyle = rgba(d.dark, 0.10); g.lineWidth = 1; g.beginPath(); g.ellipse(x, y, 4 + k * 5, 1.6 + k * 1.5, 0, 0, 6.2832); g.stroke(); }
  }
  const im = g.getImageData(0, 0, W2, H2);                           // ruído fino
  for (let i = 0; i < im.data.length; i += 4) { const v = (r() - 0.5) * 16; im.data[i] += v; im.data[i + 1] += v; im.data[i + 2] += v; }
  g.putImageData(im, 0, 0);
  return (woodCache[kind] = c);
}

// Temas das mesas: madeira, luz, cor do pano por omissão, caçapas, diamantes
const THEMES = {
  classic: { wood: 'oak',   light: [255, 232, 184], lightA: 0.20, vign: 0.42, rim: ['#2a1a10', '#6b4426'], gem: 'pearl', chalk: true },
  beach:   { wood: 'light', light: [255, 245, 205], lightA: 0.13, vign: 0.30, rim: ['#8c6a3a', '#e8d2a2'], gem: 'pearl', chalk: true, cloth: { c1: '#2fc3bd', c2: '#14777a' } },
  neon:    { wood: 'black', light: [150, 200, 255], lightA: 0.16, vign: 0.46, rim: ['#1a1a33', '#6a6a9a'], gem: 'neon',  cloth: { c1: '#1d4aa8', c2: '#09154a' } },
  legend:  { wood: 'gold',  light: [255, 214, 120], lightA: 0.22, vign: 0.38, rim: ['#5a3d08', '#f3d77a'], gem: 'gold',  cloth: { c1: '#3a3a44', c2: '#1a1a22' } },
};

function starPath(c, cx, cy, ro, ri) { c.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? ri : ro; const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r; if (i) c.lineTo(x, y); else c.moveTo(x, y); } c.closePath(); }

const CB = 11;                                   // espessura visível da almofada
function drawGem(c, x, y, kind) {                // diamante de mira
  c.save(); c.translate(x, y); c.rotate(Math.PI / 4);
  if (kind === 'neon') { c.shadowColor = '#25f4ff'; c.shadowBlur = 7; }
  const g = c.createRadialGradient(-1, -1, 0.3, 0, 0, 4.4);
  if (kind === 'gold') { g.addColorStop(0, '#fff8d0'); g.addColorStop(0.6, '#e6c25a'); g.addColorStop(1, '#8a5f10'); }
  else if (kind === 'neon') { g.addColorStop(0, '#e9ffff'); g.addColorStop(0.6, '#25f4ff'); g.addColorStop(1, '#0a7f8a'); }
  else { g.addColorStop(0, '#ffffff'); g.addColorStop(0.55, '#e4eaec'); g.addColorStop(1, '#8e9ba1'); }
  c.fillStyle = g; c.fillRect(-3.2, -3.2, 6.4, 6.4);
  c.shadowBlur = 0; c.strokeStyle = 'rgba(0,0,0,.35)'; c.lineWidth = 0.6; c.strokeRect(-3.2, -3.2, 6.4, 6.4);
  c.fillStyle = 'rgba(255,255,255,.9)'; c.fillRect(-2.3, -2.3, 1.6, 1.6);
  c.restore();
}

function drawTable(c, tb, cl) {
  tb = tb || curTable(); cl = cl || curCloth();
  const th = THEMES[tb.id] || THEMES.classic, cc = (cl.id === 'green' && th.cloth) ? th.cloth : cl;
  const cushC = mixHex(cc.c2, '#000000', 0.18), cushL = mixHex(cc.c1, '#000000', 0.05);
  // 1) moldura de madeira com veio e luz
  c.save(); roundRect(c, 0, 0, W, H, 22); c.clip();
  c.fillStyle = c.createPattern(woodTex(th.wood), 'repeat'); c.fillRect(0, 0, W, H);
  const wl = c.createLinearGradient(0, 0, W * 0.7, H); wl.addColorStop(0, 'rgba(255,255,255,.16)'); wl.addColorStop(0.5, 'rgba(0,0,0,0)'); wl.addColorStop(1, 'rgba(0,0,0,.30)');
  c.fillStyle = wl; c.fillRect(0, 0, W, H);
  c.restore();
  // 2) pano: gradiente, feltro, cone de luz, vinheta
  c.save(); c.beginPath(); c.rect(L - 3, T - 3, Rr - L + 6, B - T + 6); c.clip();
  const f = c.createRadialGradient(MIDX, H * 0.46, 24, MIDX, H * 0.5, W * 0.6);
  f.addColorStop(0, mixHex(cc.c1, '#ffffff', 0.12)); f.addColorStop(0.45, cc.c1); f.addColorStop(1, cc.c2);
  c.fillStyle = f; c.fillRect(L - 3, T - 3, Rr - L + 6, B - T + 6);
  c.fillStyle = c.createPattern(feltPat, 'repeat'); c.fillRect(L - 3, T - 3, Rr - L + 6, B - T + 6);
  const lc = c.createRadialGradient(MIDX, H * 0.42, 10, MIDX, H * 0.44, 330);       // cone de luz da lâmpada
  lc.addColorStop(0, rgba(th.light, th.lightA * 1.5)); lc.addColorStop(0.55, rgba(th.light, th.lightA * 0.55)); lc.addColorStop(1, rgba(th.light, 0));
  c.fillStyle = lc; c.fillRect(L - 3, T - 3, Rr - L + 6, B - T + 6);
  const vg = c.createRadialGradient(MIDX, H / 2, H * 0.32, MIDX, H / 2, W * 0.64);    // cantos mais escuros
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,' + th.vign + ')');
  c.fillStyle = vg; c.fillRect(L - 3, T - 3, Rr - L + 6, B - T + 6);
  // marcas do pano: linha de cabeça, ponto do triângulo e logótipo gravado
  c.strokeStyle = 'rgba(255,255,255,.10)'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(HEAD_X + 60, T); c.lineTo(HEAD_X + 60, B); c.stroke();
  c.fillStyle = 'rgba(255,255,255,.22)'; c.beginPath(); c.arc(APEX_X, H / 2, 2.2, 0, 7); c.fill();
  c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = '900 26px "Trebuchet MS", Arial, sans-serif';
  const word = 'CUE LEGENDS', sp = 5; let wlen = 0; for (const ch of word) wlen += c.measureText(ch).width + sp; wlen -= sp;
  for (const [dy, col] of [[1.2, 'rgba(0,0,0,.20)'], [0, 'rgba(255,255,255,.075)']]) {
    let x = MIDX - wlen / 2; c.fillStyle = col;
    for (const ch of word) { const w = c.measureText(ch).width; c.textAlign = 'left'; c.fillText(ch, x, H / 2 + 22 + dy); x += w + sp; }
    starPath(c, MIDX, H / 2 - 4 + dy, 14, 6); c.fill();
  }
  // sombra das almofadas sobre o pano e das caçapas à volta
  for (const [x0, y0, x1, y1, rx, ry, rw, rh] of [[0, T, 0, T + 16, L, T, Rr - L, 16], [0, B, 0, B - 16, L, B - 16, Rr - L, 16], [L, 0, L + 16, 0, L, T, 16, B - T], [Rr, 0, Rr - 16, 0, Rr - 16, T, 16, B - T]]) {
    const sg = c.createLinearGradient(x0, y0, x1, y1); sg.addColorStop(0, 'rgba(0,0,0,.42)'); sg.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = sg; c.fillRect(rx, ry, rw, rh);
  }
  for (const p of POCKETS) { const pg = c.createRadialGradient(p.x, p.y, p.vr * 0.8, p.x, p.y, p.vr + 26); pg.addColorStop(0, 'rgba(0,0,0,.6)'); pg.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = pg; c.fillRect(p.x - 60, p.y - 60, 120, 120); }
  c.restore();
  // 3) almofadas em 3D falso (bisel, nariz iluminado, linha de contacto)
  const cush = (x0, y0, x1, y1, rx, ry, rw, rh) => {
    const g = c.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, mixHex(cc.c2, '#000000', 0.45)); g.addColorStop(0.35, cushC); g.addColorStop(0.82, cushL); g.addColorStop(0.93, mixHex(cc.c1, '#ffffff', 0.16)); g.addColorStop(1, mixHex(cc.c2, '#000000', 0.5));
    c.fillStyle = g; c.fillRect(rx, ry, rw, rh);
  };
  cush(0, T - CB, 0, T, L - CB, T - CB, Rr - L + 2 * CB, CB);
  cush(0, B + CB, 0, B, L - CB, B, Rr - L + 2 * CB, CB);
  cush(L - CB, 0, L, 0, L - CB, T, CB, B - T);
  cush(Rr + CB, 0, Rr, 0, Rr, T, CB, B - T);
  c.strokeStyle = 'rgba(255,255,255,.22)'; c.lineWidth = 0.8; c.strokeRect(L - CB + 0.4, T - CB + 0.4, Rr - L + 2 * CB - 0.8, B - T + 2 * CB - 0.8);   // brilho da aresta
  // 4) diamantes de mira
  for (let i = 1; i < 8; i++) { if (i === 4) continue; const x = L + (Rr - L) * i / 8; for (const y of [RAIL / 2 - 4, H - RAIL / 2 + 4]) drawGem(c, x, y, th.gem); }
  for (let i = 1; i < 4; i++) { const y = T + (B - T) * i / 4; for (const x of [RAIL / 2 - 4, W - RAIL / 2 + 4]) drawGem(c, x, y, th.gem); }
  // verniz: reflexo largo só sobre a moldura (fora da zona de jogo), mais bisel
  c.save(); c.beginPath(); roundRect(c, 0, 0, W, H, 22); c.rect(L - CB, T - CB, Rr - L + 2 * CB, B - T + 2 * CB); c.clip('evenodd');
  const vv = c.createLinearGradient(0, 0, W * 0.75, H); vv.addColorStop(0, 'rgba(255,255,255,0)'); vv.addColorStop(0.22, 'rgba(255,255,255,.22)'); vv.addColorStop(0.34, 'rgba(255,255,255,.05)'); vv.addColorStop(0.5, 'rgba(255,255,255,0)'); vv.addColorStop(0.78, 'rgba(255,255,255,.10)'); vv.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = vv; c.fillRect(0, 0, W, H); c.restore();
  const bv = c.createLinearGradient(0, 0, W, H); bv.addColorStop(0, 'rgba(255,255,255,.55)'); bv.addColorStop(0.5, 'rgba(255,255,255,.05)'); bv.addColorStop(1, 'rgba(0,0,0,.55)');
  c.strokeStyle = bv; c.lineWidth = 1.6; roundRect(c, 0.8, 0.8, W - 1.6, H - 1.6, 21.5); c.stroke();
  if (tb.deco) tb.deco(c);                        // decoração do tema (ondas, neon, filetes) por baixo das caçapas
  // 5) caçapas: aro de couro/metal, interior fundo e pontas das tabelas
  for (const p of POCKETS) {
    const side = p.x === MIDX, ox = side ? 0 : (p.x === L ? -1 : 1) * 1.2, oy = (p.y === T ? -1 : 1) * (side ? 3 : 1.2), px = p.x + ox, py = p.y + oy;
    const rg = c.createLinearGradient(px - p.vr, py - p.vr, px + p.vr, py + p.vr); rg.addColorStop(0, th.rim[1]); rg.addColorStop(0.5, th.rim[0]); rg.addColorStop(1, th.rim[1]);
    c.fillStyle = rg; c.beginPath(); c.arc(px, py, p.vr + 4.2, 0, 7); c.fill();
    c.strokeStyle = 'rgba(255,255,255,.25)'; c.lineWidth = 1; c.beginPath(); c.arc(px, py, p.vr + 3.8, Math.PI * 1.05, Math.PI * 1.65); c.stroke();
    const hg = c.createRadialGradient(px - p.vr * 0.25, py - p.vr * 0.3, 1, px, py, p.vr); hg.addColorStop(0, '#16110c'); hg.addColorStop(0.7, '#050403'); hg.addColorStop(1, '#000');
    c.fillStyle = hg; c.beginPath(); c.arc(px, py, p.vr, 0, 7); c.fill();
    c.strokeStyle = 'rgba(0,0,0,.65)'; c.lineWidth = 2; c.beginPath(); c.arc(px, py, p.vr + 0.5, 0, 7); c.stroke();
  }
  for (const j of JAWS) { const g = c.createRadialGradient(j.x - 1, j.y - 1, 0.4, j.x, j.y, JAW_R + 1); g.addColorStop(0, mixHex(cc.c1, '#ffffff', 0.12)); g.addColorStop(1, cushC); c.fillStyle = g; c.beginPath(); c.arc(j.x, j.y, JAW_R + 0.6, 0, 7); c.fill(); }
  // 7) giz azul no canto + detalhes do tema
  if (th.chalk) {
    const cx0 = L + 62, cy0 = 3.5, g = c.createLinearGradient(cx0, cy0, cx0, cy0 + 9); g.addColorStop(0, '#7fd0ff'); g.addColorStop(1, '#2a77b8');
    c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(cx0 + 1, cy0 + 2, 11, 9); c.fillStyle = g; c.fillRect(cx0, cy0, 11, 9);
    c.fillStyle = 'rgba(255,255,255,.35)'; c.fillRect(cx0, cy0, 11, 2.2); c.fillStyle = 'rgba(120,200,255,.12)'; c.beginPath(); c.ellipse(cx0 + 5, cy0 + 10, 7, 3, 0, 0, 7); c.fill();
  }
}
function roundRect(c, x, y, w, h, r) {
  c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}
let tableCv = null, tableKey = '', tablePrev = null, tableFade = 1;
function ensureTable() {
  const dpr = view.dpr || 1, sk = view.s + '|' + dpr, tk = save.cloth + '|' + save.table, key = sk + '|' + tk;
  if (key === tableKey) return;
  const oldSk = tableKey.split('|').slice(0, 2).join('|'), oldTk = tableKey.split('|').slice(2).join('|');
  const fade = tableCv && tableKey && oldSk === sk && oldTk !== tk && !lowFx();       // mudança de tema (não de tamanho): transição com fade
  if (fade) { if (!tablePrev) tablePrev = document.createElement('canvas'); tablePrev.width = tableCv.width; tablePrev.height = tableCv.height; tablePrev.getContext('2d').drawImage(tableCv, 0, 0); tableFade = 0; }
  tableKey = key;
  if (!tableCv) tableCv = document.createElement('canvas');
  tableCv.width = Math.max(1, Math.round(W * view.s * dpr)); tableCv.height = Math.max(1, Math.round(H * view.s * dpr));
  const t = tableCv.getContext('2d'); t.setTransform(tableCv.width / W, 0, 0, tableCv.height / H, 0, 0);
  drawTable(t);
}

// ---------- Taco (sprite cacheado por modelo: madeira, ponta de couro, virola, bainha com desenho próprio) ----------
const cueSprites = {};
function cueSprite(def) {
  if (cueSprites[def.id]) return cueSprites[def.id];
  const WS = 500, HS = 44, MID = HS / 2, c = document.createElement('canvas'); c.width = WS; c.height = HS;
  const g = c.getContext('2d'), hw = x => 5.5 + (10 - 5.5) * (1 - x / WS), poly = () => { g.beginPath(); g.moveTo(0, MID - hw(0)); g.lineTo(WS, MID - hw(WS)); g.lineTo(WS, MID + hw(WS)); g.lineTo(0, MID + hw(0)); g.closePath(); };
  const BX = WS - 0.68 * WS, r = mkRng(def.id.length * 131 + def.id.charCodeAt(0));
  if (def.glow) { g.save(); g.shadowColor = def.glow; g.shadowBlur = 10; g.fillStyle = def.glow; poly(); g.fill(); g.restore(); }
  g.save(); poly(); g.clip();
  const sg = g.createLinearGradient(WS, 0, BX, 0); sg.addColorStop(0, mixHex(def.color, '#ffffff', 0.18)); sg.addColorStop(1, def.color);
  g.fillStyle = sg; g.fillRect(BX, 0, WS - BX, HS);
  for (let i = 0; i < 26; i++) { g.strokeStyle = r() > 0.5 ? 'rgba(255,255,255,.10)' : 'rgba(0,0,0,.12)'; g.lineWidth = 0.6; const y = MID - 8 + r() * 16; g.beginPath(); g.moveTo(BX, y); g.lineTo(WS, y + (r() - 0.5) * 2); g.stroke(); }   // veio do fuste
  const bg = g.createLinearGradient(0, 0, BX, 0); bg.addColorStop(0, mixHex(def.butt, '#000000', 0.25)); bg.addColorStop(1, def.butt);
  g.fillStyle = bg; g.fillRect(0, 0, BX, HS);
  g.save(); g.beginPath(); g.rect(0, 0, BX, HS); g.clip();                    // desenho da bainha
  switch (def.id) {
    case 'classic': for (const x of [30, 52, 120]) { g.fillStyle = def.ring; g.fillRect(x, 0, 4, HS); } break;
    case 'blue': g.strokeStyle = 'rgba(255,255,255,.5)'; g.lineWidth = 3; for (let x = -10; x < BX; x += 16) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 14, HS); g.stroke(); } break;
    case 'neon': g.shadowColor = def.glow; g.shadowBlur = 7; g.fillStyle = def.glow; for (let x = 8; x < BX - 8; x += 24) g.fillRect(x, MID - 5, 12, 10); break;
    case 'dragon': g.strokeStyle = 'rgba(255,213,74,.55)'; g.lineWidth = 1.6; for (let row = 0; row < 4; row++) for (let x = (row % 2) * 7; x < BX; x += 14) { g.beginPath(); g.arc(x, 8 + row * 9, 6, 0, Math.PI); g.stroke(); } break;
    case 'gold': g.fillStyle = '#fff3b0'; for (let x = 10; x < BX; x += 18) { g.beginPath(); g.arc(x, MID - 7, 2.3, 0, 7); g.arc(x + 9, MID + 7, 2.3, 0, 7); g.fill(); } break;
    case 'legend': { const lg = g.createLinearGradient(0, 0, BX, 0); lg.addColorStop(0, 'rgba(255,226,122,.0)'); lg.addColorStop(1, 'rgba(255,226,122,.35)'); g.fillStyle = lg; g.fillRect(0, 0, BX, HS); g.fillStyle = '#ffe27a'; for (let x = 16; x < BX; x += 26) { starPath(g, x, MID, 5, 2.2); g.fill(); } break; }
    case 'carbon': g.strokeStyle = 'rgba(255,255,255,.14)'; g.lineWidth = 1.4; for (let x = -HS; x < BX; x += 8) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x + HS, HS); g.moveTo(x + HS, 0); g.lineTo(x, HS); g.stroke(); } break;
    case 'crystal': g.fillStyle = 'rgba(190,243,255,.18)'; g.fillRect(0, 0, BX, HS); g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 1; for (let i = 0; i < 14; i++) { g.beginPath(); g.arc(8 + r() * (BX - 16), MID + (r() - 0.5) * 14, 1.2 + r() * 2, 0, 7); g.stroke(); } break;
  }
  g.restore();
  for (const [x0, w] of [[BX - 6, 14], [WS * 0.07, 7]]) {                      // virola e anel final (metal)
    const mg = g.createLinearGradient(0, MID - 10, 0, MID + 10); mg.addColorStop(0, mixHex(def.ring, '#ffffff', 0.55)); mg.addColorStop(0.5, def.ring); mg.addColorStop(1, mixHex(def.ring, '#000000', 0.5));
    g.fillStyle = mg; g.fillRect(x0, 0, w, HS);
  }
  const fg = g.createLinearGradient(0, MID - 6, 0, MID + 6); fg.addColorStop(0, '#ffffff'); fg.addColorStop(0.6, '#e6e1d2'); fg.addColorStop(1, '#a9a290');
  g.fillStyle = fg; g.fillRect(WS - 26, 0, 18, HS);                                  // virola branca junto à ponta
  g.fillStyle = '#4a3326'; g.fillRect(WS - 8, 0, 8, HS);                             // ponta de couro
  g.fillStyle = '#5ac8ff'; g.globalAlpha = 0.85; g.fillRect(WS - 4, 0, 4, HS); g.globalAlpha = 1;   // giz azul
  const cyl = g.createLinearGradient(0, 0, 0, HS);                                  // sombreado cilíndrico
  cyl.addColorStop(0, 'rgba(255,255,255,.42)'); cyl.addColorStop(0.3, 'rgba(255,255,255,.08)'); cyl.addColorStop(0.55, 'rgba(0,0,0,0)'); cyl.addColorStop(1, 'rgba(0,0,0,.5)');
  g.fillStyle = cyl; g.fillRect(0, 0, WS, HS);
  g.restore();
  const sh = document.createElement('canvas'); sh.width = WS; sh.height = HS; const sg2 = sh.getContext('2d');
  sg2.drawImage(c, 0, 0); sg2.globalCompositeOperation = 'source-in'; sg2.fillStyle = 'rgba(0,0,0,.38)'; sg2.fillRect(0, 0, WS, HS);
  c.sh = sh;
  return (cueSprites[def.id] = c);
}
function drawCueShape(c, tx, ty, dx, dy, len, def, alpha, wk) {   // ponta em (tx,ty); o taco estende-se para trás
  const sp = cueSprite(def), a = Math.atan2(dy, dx), h = sp.height / 2 * wk;
  if (len >= 200) { c.save(); c.globalAlpha = alpha; c.translate(tx + 2.5, ty + 4.5); c.rotate(a); c.drawImage(sp.sh, -len, -h / 2, len, h); c.restore(); }   // sombra no pano
  c.save(); c.globalAlpha = alpha; c.translate(tx, ty); c.rotate(a); c.drawImage(sp, -len, -h / 2, len, h); c.restore();
}
function drawCue(angle, pull, alpha, cx, cy) {
  const dx = Math.cos(angle), dy = Math.sin(angle);
  drawCueShape(ctx, cx - dx * (BR + pull), cy - dy * (BR + pull), dx, dy, 250, curCue(), alpha, 1);
}
const aimMax = () => mode === 'cpu' && !easyCpu ? room.aim * (1 + curCue().aim) : 1200;   // salas fáceis: linha longa; difíceis: curta

// ---------- Mira ----------
const fade2 = (x0, y0, x1, y1, a0, a1, rgb) => { const g = ctx.createLinearGradient(x0, y0, x1, y1); g.addColorStop(0, 'rgba(' + rgb + ',' + a0 + ')'); g.addColorStop(1, 'rgba(' + rgb + ',' + a1 + ')'); return g; };
function drawAim(now) {
  const p = predict(aimAngle);
  const dx = Math.cos(aimAngle), dy = Math.sin(aimAngle);
  const am = aimMax(), cut = Math.hypot(p.gx - cue.x, p.gy - cue.y) > am, objLen = Math.max(40, Math.min(150, am * 0.22));
  const x0 = cue.x + dx * BR, y0 = cue.y + dy * BR, x1 = cut ? cue.x + dx * am : p.gx, y1 = cut ? cue.y + dy * am : p.gy;
  ctx.save(); ctx.lineCap = 'round';
  ctx.setLineDash([2.2, 7.8]); ctx.lineDashOffset = lowFx() ? 0 : -((now / 42) % 10);    // pontilhado que avança devagar
  ctx.lineWidth = 5; ctx.strokeStyle = fade2(x0, y0, x1, y1, 0.30, 0.08, '0,0,0');                          // contorno escuro: legível em panos claros
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
  ctx.lineWidth = 2.8; ctx.strokeStyle = fade2(x0, y0, x1, y1, 0.95, 0.30, '255,255,255');
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
  ctx.setLineDash([]); ctx.lineDashOffset = 0;
  if (!cut) {                                    // bola fantasma semitransparente
    ctx.globalAlpha = 0.34; drawBall(cue, p.gx, p.gy, BR); ctx.globalAlpha = 1;
    ctx.beginPath(); ctx.arc(p.gx, p.gy, BR, 0, 7); ctx.strokeStyle = 'rgba(0,0,0,.32)'; ctx.lineWidth = 3.2; ctx.stroke(); ctx.strokeStyle = 'rgba(255,255,255,.88)'; ctx.lineWidth = 1.4; ctx.stroke();
  }
  if (cut) { /* linha curta: sem previsão */ } else if (p.hit) {
    let nx = p.hit.x - p.gx, ny = p.hit.y - p.gy; const l = Math.hypot(nx, ny); nx /= l; ny /= l;
    ctx.lineWidth = 2.4; ctx.strokeStyle = fade2(p.hit.x, p.hit.y, p.hit.x + nx * objLen, p.hit.y + ny * objLen, 0.95, 0, '255,226,120');
    ctx.beginPath(); ctx.moveTo(p.hit.x, p.hit.y); ctx.lineTo(p.hit.x + nx * objLen, p.hit.y + ny * objLen); ctx.stroke();
    const dot = dx * nx + dy * ny; let tx = dx - dot * nx, ty = dy - dot * ny; const tl = Math.hypot(tx, ty);
    if (tl > 0.02) { tx /= tl; ty /= tl; const e = objLen * 0.55; ctx.lineWidth = 2; ctx.strokeStyle = fade2(p.gx, p.gy, p.gx + tx * e, p.gy + ty * e, 0.6, 0, '255,255,255'); ctx.beginPath(); ctx.moveTo(p.gx, p.gy); ctx.lineTo(p.gx + tx * e, p.gy + ty * e); ctx.stroke(); }
  } else if (p.axis) {                           // reflexo na tabela
    const rx = p.axis === 'x' ? -dx : dx, ry = p.axis === 'y' ? -dy : dy, e = Math.min(130, am * 0.25);
    ctx.setLineDash([2.2, 7.8]); ctx.lineWidth = 2.2; ctx.strokeStyle = fade2(p.gx, p.gy, p.gx + rx * e, p.gy + ry * e, 0.5, 0, '255,255,255');
    ctx.beginPath(); ctx.moveTo(p.gx, p.gy); ctx.lineTo(p.gx + rx * e, p.gy + ry * e); ctx.stroke();
  }
  ctx.restore();
  drawCue(aimAngle, 14 + power * 70, 1, cue.x, cue.y);
}
function drawCalledPocket(now) {                 // anel luminoso pulsante na caçapa escolhida
  if (!cue.alive || !needsCall(turn)) return;
  const k = isCpuTurn() ? called : (calledManual ? called : autoCall(aimAngle));
  if (k == null) return;
  const pk = POCKETS[k], pul = lowFx() ? 0.5 : Math.sin(now / 230) * 0.5 + 0.5;
  ctx.save(); ctx.strokeStyle = '#ffd54a'; ctx.lineWidth = 2.6; ctx.shadowColor = '#ffb02e'; ctx.shadowBlur = lowFx() ? 0 : 8 + pul * 8;
  ctx.beginPath(); ctx.arc(pk.x, pk.y, pk.r + 3 + pul * 2.5, 0, 7); ctx.stroke();
  ctx.shadowBlur = 0; ctx.globalAlpha = 0.35 + 0.25 * pul; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(pk.x, pk.y, pk.r + 9 + pul * 3, 0, 7); ctx.stroke(); ctx.restore();
}

// ---------- Efeitos (todos desligáveis em "Reduzir efeitos") ----------
const lowFx = () => !!save.lowFx;
function updateFxBtns() { document.querySelectorAll('.fxbtn').forEach(b => { b.textContent = tr('fx.low', { v: tr(save.lowFx ? 'fx.on' : 'fx.off') }); }); }
document.querySelectorAll('.fxbtn').forEach(b => b.addEventListener('click', () => { save.lowFx = !save.lowFx; save.fxSet = true; persist(); updateFxBtns(); if (save.lowFx) { FX.rings.length = FX.parts.length = FX.flashes.length = 0; FX.shake = 0; FX.winT = -1; } wake(); }));
const FX = { rings: [], parts: [], flashes: [], shake: 0, winT: -1, winPk: null };
const flashCv = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return c; })();
const glowCache = {};
const glowSprite = n => glowCache[n] || (glowCache[n] = (() => { const c = document.createElement('canvas'); c.width = c.height = 48; const g = c.getContext('2d'), col = n === 0 ? [255, 255, 255] : BASECOL[n <= 8 ? n : n - 8], gr = g.createRadialGradient(24, 24, 0, 24, 24, 24); gr.addColorStop(0, rgba(col, 0.9)); gr.addColorStop(1, rgba(col, 0)); g.fillStyle = gr; g.fillRect(0, 0, 48, 48); return c; })());
function fxPocket(pk, b) {                       // flash interior + onda no pano + partículas
  if (lowFx()) { FX.flashes.push({ x: pk.x, y: pk.y, t: 0 }); return; }
  FX.flashes.push({ x: pk.x, y: pk.y, t: 0 }); FX.rings.push({ x: pk.x, y: pk.y, t: 0, r0: pk.r });
  const col = b.n === 0 ? [255, 255, 255] : BASECOL[b.n <= 8 ? b.n : b.n - 8], ix = Math.sign(W / 2 - pk.x), iy = Math.sign(H / 2 - pk.y);
  for (let i = 0; i < 9; i++) { const a = Math.atan2(iy, ix) + (Math.random() - 0.5) * 2.2, v = 40 + Math.random() * 90; FX.parts.push({ x: pk.x, y: pk.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: 0, life: 0.45 + Math.random() * 0.25, col, r: 1.2 + Math.random() * 1.6 }); }
}
function fxHit(a, c, vr) { if (SIM || lowFx()) return; const f = Math.min(1, vr / 650); a.fl = Math.max(a.fl || 0, f); c.fl = Math.max(c.fl || 0, f); if (vr > 1100) FX.shake = Math.max(FX.shake, 0.08); }
function fxUpdate(dt) {
  for (const r of FX.rings) r.t += dt; if (FX.rings.length) FX.rings = FX.rings.filter(r => r.t < 0.55);
  for (const f of FX.flashes) f.t += dt; if (FX.flashes.length) FX.flashes = FX.flashes.filter(f => f.t < 0.35);
  for (const p of FX.parts) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.96; p.vy *= 0.96; } if (FX.parts.length) FX.parts = FX.parts.filter(p => p.t < p.life);
  if (FX.shake > 0) FX.shake = Math.max(0, FX.shake - dt);
  if (FX.winT >= 0) { FX.winT += dt; if (FX.winT > 3.2) FX.winT = -1; }
  for (const b of balls) if (b.fl > 0) b.fl = Math.max(0, b.fl - dt * 5);
  if (tableFade < 1) { tableFade = Math.min(1, tableFade + dt / 0.35); if (tableFade >= 1 && tablePrev) tablePrev.width = tablePrev.height = 1; }
}
const fxBusy = () => FX.rings.length > 0 || FX.parts.length > 0 || FX.flashes.length > 0 || FX.shake > 0 || FX.winT >= 0 || tableFade < 1 || balls.some(b => b.fl > 0.02);
function drawBallShadow(b) {                     // sombra de contacto elíptica; afasta-se do centro da luz e alonga-se com a velocidade
  const sp = Math.hypot(b.vx, b.vy), sx = (b.x - MIDX) * 0.03 + 1.2, sy = (b.y - H / 2) * 0.03 + 3.4, st = 1 + Math.min(0.55, sp / 2600);
  ctx.save(); ctx.translate(b.x + sx, b.y + sy); if (sp > 30) ctx.rotate(Math.atan2(b.vy, b.vx)); ctx.scale(st, 0.86);
  ctx.globalAlpha = 0.95; ctx.drawImage(shadowCv, -BR * 1.28, -BR * 1.28, BR * 2.56, BR * 2.56);
  ctx.restore();
  ctx.globalAlpha = 0.5; ctx.drawImage(shadowCv, b.x - BR * 0.95 + 0.4, b.y - BR * 0.5 + 2.4, BR * 1.9, BR * 1.3); ctx.globalAlpha = 1;   // contacto direto
}
function drawBallFx(b) {                         // brilho do impacto (sobre a bola); desligado em "Reduzir efeitos"
  if (b.fl > 0.02 && !lowFx()) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = b.fl * 0.26; ctx.drawImage(flashCv, b.x - BR * 1.7, b.y - BR * 1.7, BR * 3.4, BR * 3.4); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; }
}
function drawTrail(b) {                          // motion blur leve; no neon deixa um rasto de cor
  const sp = Math.hypot(b.vx, b.vy); if (sp < 520 || lowFx()) return;
  const neon = curTable().id === 'neon', k = Math.min(1, (sp - 520) / 900);
  for (let i = 2; i >= 1; i--) {
    ctx.globalAlpha = (neon ? 0.28 : 0.20) * k / i; const tx = b.x - b.vx * 0.0105 * i, ty = b.y - b.vy * 0.0105 * i;
    if (neon) { ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(glowSprite(b.n), tx - BR * 1.5, ty - BR * 1.5, BR * 3, BR * 3); ctx.globalCompositeOperation = 'source-over'; }
    else drawBall(b, tx, ty, BR);
  }
  ctx.globalAlpha = 1;
}
function drawFxLayer(now) {
  for (const f of FX.flashes) { const k = f.t / 0.35; ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = (1 - k) * 0.9; const r = 16 + k * 34; ctx.drawImage(flashCv, f.x - r, f.y - r, r * 2, r * 2); }
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  for (const r of FX.rings) { const k = r.t / 0.55; ctx.strokeStyle = 'rgba(255,255,255,' + (0.38 * (1 - k)).toFixed(3) + ')'; ctx.lineWidth = 2 * (1 - k) + 0.6; ctx.beginPath(); ctx.arc(r.x, r.y, r.r0 + k * 52, 0, 7); ctx.stroke(); }
  for (const p of FX.parts) { const k = p.t / p.life; ctx.fillStyle = rgba(p.col, (1 - k).toFixed(3)); ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (1 - 0.4 * k), 0, 7); ctx.fill(); }
  if (FX.winT >= 0) {                            // vitória: a luz da mesa intensifica-se e a bola 8 ganha destaque
    const k = FX.winT < 0.6 ? FX.winT / 0.6 : Math.max(0, 1 - (FX.winT - 0.6) / 2.6);
    ctx.globalCompositeOperation = 'lighter'; const g = ctx.createRadialGradient(MIDX, H * 0.44, 20, MIDX, H * 0.46, 380); g.addColorStop(0, 'rgba(255,214,110,' + (0.42 * k).toFixed(3) + ')'); g.addColorStop(1, 'rgba(255,214,110,0)');
    ctx.fillStyle = g; ctx.fillRect(L, T, Rr - L, B - T); ctx.globalCompositeOperation = 'source-over';
    if (FX.winPk != null) { const pk = POCKETS[FX.winPk]; ctx.strokeStyle = 'rgba(255,224,130,' + (0.9 * k).toFixed(3) + ')'; ctx.lineWidth = 3; ctx.shadowColor = '#ffd54a'; ctx.shadowBlur = 14; ctx.beginPath(); ctx.arc(pk.x, pk.y, pk.r + 5 + 8 * (1 - k), 0, 7); ctx.stroke(); ctx.shadowBlur = 0; }
  }
}
function drawDust(now) {                         // partículas de pó muito ténues dentro do cone de luz
  if (lowFx()) return;
  ctx.fillStyle = 'rgb(255,244,214)';
  for (let i = 0; i < 14; i++) {
    const t = now / 1000, ph = i * 2.399, x = MIDX + Math.sin(ph + t * (0.05 + (i % 4) * 0.02)) * (80 + (i * 37) % 210), y = H * 0.5 + Math.cos(ph * 1.3 + t * 0.04) * (30 + (i * 53) % 120) - ((t * (1.2 + (i % 3))) % 24);
    ctx.globalAlpha = 0.05 + 0.07 * (Math.sin(t * 0.9 + ph) * 0.5 + 0.5); ctx.beginPath(); ctx.arc(x, y, 0.8 + (i % 3) * 0.35, 0, 7); ctx.fill();
  }
  ctx.globalAlpha = 1;
}
function drawSinks(list) {                       // bola a cair na caçapa: encolhe, escurece e afunda (~250 ms)
  for (const s of (list || sinks)) {
    const pk = POCKETS[s.k], p = Math.min(1, s.t / 0.25), e = p * p * (3 - 2 * p);
    const x = s.x + (pk.x - s.x) * e * 0.85, y = s.y + (pk.y - s.y) * e * 0.85;
    ctx.save(); ctx.beginPath(); ctx.arc(pk.x, pk.y, pk.r + 5, 0, 7); ctx.clip();
    drawBall(s.b, x, y, BR, 1 - 0.5 * e);
    ctx.fillStyle = `rgba(0,0,0,${0.78 * e})`; ctx.beginPath(); ctx.arc(x, y, BR * (1 - 0.5 * e), 0, 7); ctx.fill();
    ctx.restore();
  }
}
function drawFloats() {
  ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  for (const f of floats) {
    const k = f.t / 1.1;
    ctx.globalAlpha = Math.max(0, 1 - Math.max(0, (k - 0.55) / 0.45));
    const pop = f.t < 0.12 ? 0.6 + 0.4 * f.t / 0.12 : 1;
    ctx.font = `800 ${Math.round(18 * f.size * pop)}px sans-serif`;
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,.65)'; ctx.fillStyle = f.col;
    const y = f.y - f.t * 38; ctx.strokeText(f.txt, f.x, y); ctx.fillText(f.txt, f.x, y);
  }
  ctx.restore();
}

let last = performance.now(), acc = 0, settleT = 0;
function drawFrame(now) {
  const dt = Math.min(0.033, (now - last) / 1000) * TS; last = now; Snd.n = 0;
  if (!paused) {
    if (strike) {                                // taco: avança depressa; a bola sai no impacto
      const s = strike; s.t += dt;
      if (!s.launched) { const k = Math.min(1, s.t / s.dur); s.pull = s.pull0 * (1 - k * k); if (k >= 1) { launch(...s.args); Snd.cue(s.pw); s.launched = true; s.t = 0; recStart(); } }
      else { s.fade += dt; s.pull = -4 * Math.min(1, s.fade / 0.18); if (s.fade > 0.18) strike = null; }
    }
    if (state === 'moving' && (!strike || strike.launched)) {
      acc += dt * (slow > 0 ? 0.25 : 1);
      while (acc >= SUB) { step(SUB); recTick(); acc -= SUB; }
      if (!anyMoving()) {
        settleT += dt;
        if (settleT > 0.35) { settleT = 0; acc = 0; state = 'resolving'; resolveShot(); }
      } else settleT = 0;
    } else if (state === 'aim' && isCpuTurn()) cpuTick(dt);
    slow = Math.max(0, slow - dt);
    for (const s of sinks) s.t += dt * (slow > 0 ? 0.5 : 1);
    if (sinks.length) sinks = sinks.filter(s => s.t < 0.3);
    for (const f of floats) f.t += dt;
    if (floats.length) floats = floats.filter(f => f.t < 1.1);
    fxUpdate(dt);
  }
  rollBalls();
  cam.t += ((slow > 0 ? 1 : 0) - cam.t) * Math.min(1, dt * 6);
  const dpr = view.dpr || 1;
  ensureTable();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, cv.width, cv.height);
  ctx.setTransform(dpr * view.s, 0, 0, dpr * view.s, dpr * view.ox, dpr * view.oy);
  if (RP.active) { replayStep(dt); ctx.save(); paintReplayScene(now); ctx.restore(); return; }
  ctx.save();
  if (cam.t > 0.01) { const k = 1 + 0.2 * cam.t; ctx.translate(cam.fx, cam.fy); ctx.scale(k, k); ctx.translate(-cam.fx, -cam.fy); }
  if (FX.shake > 0 && !lowFx()) { const k = FX.shake / 0.08 * 1.25; ctx.translate((Math.random() - 0.5) * 2 * k, (Math.random() - 0.5) * 2 * k); }   // micro-abanão (±2,5 px, 80 ms)
  ctx.drawImage(tableCv, 0, 0, W, H);
  if (tableFade < 1 && tablePrev) { ctx.globalAlpha = 1 - tableFade; ctx.drawImage(tablePrev, 0, 0, W, H); ctx.globalAlpha = 1; }   // fade entre temas
  if (mode === 'train' && heatOn) drawHeat();
  for (const b of balls) if (b.alive) drawBallShadow(b);
  drawSinks();
  for (const b of balls) if (b.alive && b !== cue) { drawTrail(b); drawBall(b, b.x, b.y, BR); drawBallFx(b); }
  if (cue.alive) { drawTrail(cue); drawBall(cue, cue.x, cue.y, BR); drawBallFx(cue); }
  drawDust(now);
  if (state === 'aim' && cue.alive) {
    drawAim(now); drawCalledPocket(now); if (mode === 'train') drawSuggestion(now);
    if (ballInHand && !isCpuTurn()) {
      ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 1.5; ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.arc(cue.x, cue.y, BR + 7, 0, 7); ctx.stroke(); ctx.setLineDash([]);
    }
  }
  if (strike) drawCue(strike.ang, strike.pull, strike.launched ? 1 - strike.fade / 0.18 : 1, strike.cx, strike.cy);
  drawFxLayer(now);
  drawFloats();
  ctx.restore();
}
const PERF = /[?&]perf(?![a-z])/.test(location.search);                      // ?perf regista o tempo de cada frame em window.__ft (medições)
function frame(now) {
  const t0 = PERF ? performance.now() : 0;
  try { drawFrame(now); } catch (e) { console.error(e); }
  if (PERF) (window.__ft = window.__ft || []).push([state, performance.now() - t0]);   // uma exceção num frame não pode matar o loop
  if (loopActive()) idleN = 0; else idleN++;
  if (idleN < 3) requestAnimationFrame(frame); else loopOn = false;   // nada a animar e ninguém a tocar: pára até haver um evento (wake)
}
function loopActive() {
  if (RP.active) return true;
  if (paused) return false;
  return state === 'moving' || state === 'resolving' || !!strike || sinks.length > 0 || floats.length > 0 || cam.t > 0.01 || slow > 0
    || !!cpuS || (state === 'aim' && isCpuTurn()) || !!dragging || powDrag || spinDrag || (holdN > 0 && state === 'aim')
    || fxBusy() || (state === 'aim' && !isCpuTurn() && !lowFx() && performance.now() < aimFxUntil);
}
function wake() { idleN = 0; if (!loopOn) { loopOn = true; last = performance.now(); requestAnimationFrame(frame); } }
let aimFxUntil = 0;                                                                         // a mira só anima nos 2,5 s a seguir ao último toque (depois o loop pára)
['pointerdown', 'pointermove', 'pointerup', 'pointercancel'].forEach(ev => document.addEventListener(ev, () => { if (state === 'aim') aimFxUntil = performance.now() + 2500; wake(); }, true));
document.addEventListener('visibilitychange', wake); window.addEventListener('focus', wake);
