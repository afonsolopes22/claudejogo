// Testes funcionais da Fase 10 (2 Jogadores, replay+GIF com descodificador independente, treino, evento semanal). Correr: node tools/test-fase10.js
// Testes funcionais da Fase 10 (2 Jogadores/séries, replay+GIF, treino, evento semanal)
const { chromium } = require('playwright-core');
const { solveRobust } = require('./solver.js');
const url = require("url").pathToFileURL(require("path").join(__dirname, "..", "index.html")).href + '?debug&lang=pt';
const gifDecode = (u8) => {      // descodificador GIF mínimo e independente: devolve número de frames e píxeis descodificados por frame
  let p = 6; const w = u8[p] | u8[p + 1] << 8, h = u8[p + 2] | u8[p + 3] << 8; const fl = u8[p + 4]; p += 7; if (fl & 0x80) p += 3 * (1 << ((fl & 7) + 1));
  const frames = [];
  while (p < u8.length) {
    const b = u8[p++];
    if (b === 0x3B) break;
    if (b === 0x21) { p++; let n; while ((n = u8[p++])) p += n; continue; }
    if (b !== 0x2C) throw new Error("bloco inesperado " + b + " em " + p);
    p += 8; const f2 = u8[p++]; if (f2 & 0x80) p += 3 * (1 << ((f2 & 7) + 1));
    const min = u8[p++]; const data = []; let n; while ((n = u8[p++])) { for (let i = 0; i < n; i++) data.push(u8[p + i]); p += n; }
    const clear = 1 << min, eoi = clear + 1; let size = min + 1, next = eoi + 1, bits = 0, cur = 0, di = 0; const tab = []; let prev = -1; const out = [];
    const read = () => { while (bits < size) { if (di >= data.length) return -1; cur |= data[di++] << bits; bits += 8; } const c = cur & ((1 << size) - 1); cur >>>= size; bits -= size; return c; };
    const str = c => { const r = []; while (c >= 0) { if (c < clear) { r.push(c); break; } const e = tab[c - eoi - 1]; if (!e) throw new Error("código inválido " + c); r.push(e[1]); c = e[0]; } return r.reverse(); };
    for (;;) {
      const c = read(); if (c < 0) throw new Error("dados truncados"); if (c === eoi) break;
      if (c === clear) { size = min + 1; next = eoi + 1; tab.length = 0; prev = -1; continue; }
      let s2; if (prev < 0) s2 = [c]; else if (c < next) s2 = str(c); else if (c === next) { const ps = str(prev); s2 = ps.concat(ps[0]); } else throw new Error("badcode " + c);
      for (const v of s2) out.push(v);
      if (prev >= 0 && next < 4096) { tab.push([prev, s2[0]]); next++; if (next === (1 << size) && size < 12) size++; }
      prev = c;
    }
    frames.push(out.length);
  }
  return { w, h, frames };
};
const results = []; const ok = (name, cond, d) => { results.push([name, !!cond, d]); console.log((cond ? 'PASS ' : 'FAIL ') + name + (d ? '  -> ' + d : '')); };
(async () => {
  const br = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  const page = await (await br.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true })).newPage(); const errs = [];
  page.on('pageerror', e => errs.push(String(e))); page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto(url); await page.waitForTimeout(2500);
  const ev = (f, a) => page.evaluate(f, a);
  await ev(() => { const s = window.__pool.save; s.tutDone = true; s.firstDone = true; s.noAds = true; s.offerSeen = true; window.__pool.Snd.setMuted(true); window.__pool.toMenu(); });
  const wait = async (cond, n = 300, ms = 50) => { for (let i = 0; i < n; i++) { if (await ev(cond)) return true; await page.waitForTimeout(ms); } return false; };

  // ---- menu e hub ----
  await ev(() => document.getElementById('btnModes').click()); await page.waitForTimeout(300);
  ok('hub "Mais modos" abre com 3 cartões', await ev(() => document.getElementById('modes').classList.contains('show') && document.querySelectorAll('#modes .mcard').length === 3));
  ok('cartão do evento mostra semana e estrelas', /Semana \d+ · .* · muda em \d+ dia/.test(await ev(() => document.getElementById('weekSub').textContent)), await ev(() => document.getElementById('weekSub').textContent));

  // ---- 2 jogadores: nomes + melhor de 3 ----
  await ev(() => document.getElementById('btnM2p').click()); await page.waitForTimeout(200);
  await page.fill('#p2n0', 'Ana'); await page.fill('#p2n1', 'Rui');
  await ev(() => document.querySelector('#p2len [data-len="3"]').click());
  await ev(() => document.getElementById('btnP2go').click()); await page.waitForTimeout(400);
  ok('nomes personalizados no HUD', await ev(() => document.getElementById('n0').textContent === 'Ana' && document.getElementById('n1').textContent === 'Rui'));
  const win = async (who) => ev(([who]) => {                          // fim de partida forçado: o jogador "who" mete a bola 8 depois de limpar o seu grupo
    const P = window.__pool; P.firstBreak = false; P.groups[0] = 'solid'; P.groups[1] = 'stripe';
    const b = P.balls; b.forEach(x => { if (x.n > 0 && x.n !== 8 && ((who === 0) === (x.n < 8) || true)) x.alive = false; });
    const e = b.find(x => x.n === 8); e.x = 640; e.y = 90; b[0].x = 560; b[0].y = 150; P.speed = 4; P.fire(Math.atan2(-60, 80), 0.5);
  }, [who]);
  await win(0); const over1 = await wait(() => document.getElementById('over').classList.contains('show'), 300, 60);
  const txt1 = await ev(() => document.getElementById('overMsg').textContent + ' | ' + document.getElementById('btnAgain').textContent + ' | ' + document.getElementById('overTitle').textContent);
  ok('placar da série depois da 1.ª partida', over1 && /Ana 1 – 0 Rui|Ana 0 – 1 Rui/.test(txt1) && /Próxima partida/.test(txt1), txt1);
  ok("fim de partida: botão de replay visível e replay gravado", await ev(() => window.__pool.REC.last && document.getElementById('btnOverReplay').offsetParent !== null));
  await ev(() => { window.__pool.speed = 1; document.getElementById('btnOverReplay').click(); }); await page.waitForTimeout(500);
  ok("replay a partir do ecrã final e regresso a ele", await ev(() => window.__pool.RP.active) && (await ev(() => { document.getElementById('rpClose').click(); return document.getElementById('over').classList.contains('show'); })));
  await ev(() => { document.getElementById('btnAgain').click(); }); await page.waitForTimeout(600);
  ok('segunda partida da série começa (abertura alternada)', await ev(() => window.__pool.state === 'aim' && window.__pool.series.games === 1 && window.__pool.turn === 1), await ev(() => JSON.stringify(window.__pool.series) + ' turn=' + window.__pool.turn));
  await ev(() => { const P = window.__pool; P.firstBreak = false; P.speed = 8; P.fire(0.02, 0.7); }); await wait(() => window.__pool.state === 'aim', 300, 50); await ev(() => { window.__pool.speed = 1; });
  // ---- replay desta partida ----
  ok('replay gravado da última tacada', await ev(() => window.__pool.REC.last && window.__pool.REC.last.frames.length > 8), await ev(() => window.__pool.REC.last && window.__pool.REC.last.frames.length));
  await ev(() => document.getElementById('menuBtn').click()); await page.waitForTimeout(200);
  ok('botão "Ver replay" na pausa', await ev(() => document.getElementById('btnReplay').offsetParent !== null));
  await ev(() => document.getElementById('btnReplay').click()); await page.waitForTimeout(500);
  const f0 = await ev(() => window.__pool.RP.f); await page.waitForTimeout(600); const f1 = await ev(() => window.__pool.RP.f);
  ok('replay a correr (frames avançam, barra visível)', await ev(() => window.__pool.RP.active && document.getElementById('rpBar').classList.contains('show')) && f1 > f0, f0 + '->' + f1);
  // GIF
  const gif = await ev(async () => { const b = await window.__pool.makeReplayGif(); const u = URL.createObjectURL(b); const im = new Image(); im.src = u; await im.decode(); const buf = new Uint8Array(await b.arrayBuffer()); let bin = ""; for (let i = 0; i < buf.length; i += 8192) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 8192)); return { size: b.size, head: bin.slice(0, 6), w: im.naturalWidth, h: im.naturalHeight, tail: buf[buf.length - 1], b64: btoa(bin) }; });
  let dec = null, decErr = ""; try { dec = gifDecode(Uint8Array.from(Buffer.from(gif.b64, "base64"))); } catch (e) { decErr = String(e); }
  ok("GIF: descodificador independente lê todos os píxeis de todas as frames", dec && dec.frames.length > 5 && dec.frames.every(n => n === 320 * 172), decErr || (dec && dec.frames.length + " frames x " + dec.frames[0]));
  ok('GIF válido (GIF89a, 320x172, descodificável pelo browser)', gif.head === 'GIF89a' && gif.w === 320 && gif.h === 172 && gif.tail === 0x3B && gif.size > 5000, JSON.stringify({ size: gif.size, head: gif.head, w: gif.w, h: gif.h, tail: gif.tail }));
  await ev(() => document.getElementById('rpClose').click()); await page.waitForTimeout(200);
  ok('fechar o replay volta à pausa', await ev(() => !window.__pool.RP.active && document.getElementById('pause').classList.contains('show')));
  await ev(() => document.getElementById('btnQuit').click()); await page.waitForTimeout(300);
  ok('sair do 2P reinicia a série', await ev(() => window.__pool.series === null));

  // ---- treino ----
  await ev(() => { document.getElementById('btnModes').click(); document.getElementById('btnMTrain').click(); }); await page.waitForTimeout(700);
  const haveSug = await wait(() => !!window.__pool.sug, 60, 100);
  ok('treino: assistente sugere uma tacada (linha, caçapa e força)', haveSug && await ev(() => document.getElementById('powSug').style.display === 'block'), await ev(() => JSON.stringify(window.__pool.sug)));
  ok('HUD de treino', await ev(() => /Treino/.test(document.getElementById('n0').textContent) && /Assistente/.test(document.getElementById('n1').textContent)), await ev(() => document.getElementById('n0').textContent + '/' + document.getElementById('g0').textContent));
  let potted = 0;
  for (let i = 0; i < 12; i++) {                                       // segue o assistente 12 vezes
    await ev(() => { const P = window.__pool; P.speed = 8; const s = P.sug; if (s) P.fire(s.ang, s.pw); else P.fire(0.3 * Math.random(), 0.6); });
    await wait(() => window.__pool.state === 'aim', 400, 50); await page.waitForTimeout(150);
    if (!(await wait(() => !!window.__pool.sug, 30, 100))) { /* sem sugestão: continua */ }
  }
  const tr = await ev(() => { const t = window.__pool.save.train; return { shots: t.shots, pots: t.pots, heat: t.a.reduce((x, y) => x + y, 0), hp: t.p.reduce((x, y) => x + y, 0) }; });
  ok('treino: estatísticas e mapa de calor guardados', tr.shots === 12 && tr.heat === 12 && tr.pots >= 1 && tr.hp >= 1 && tr.hp <= tr.heat, JSON.stringify(tr));
  await ev(() => { window.__pool.speed = 1; window.__pool.heat = true; }); await page.waitForTimeout(300);
  ok('treino sem erros com mapa de calor ligado', errs.length === 0, errs.slice(0, 2).join(' | '));
  await ev(() => document.getElementById('menuBtn').click()); await ev(() => document.getElementById('btnQuit').click()); await page.waitForTimeout(300);
  ok('sair do treino volta ao hub', await ev(() => document.getElementById('modes').classList.contains('show')));

  // ---- evento da semana: as 52 mesas continuam resolúveis com a física atual ----
  const src = solveRobust.toString();
  const bad = [];
  for (let w = 0; w < 52; w++) {
    const r = await ev(([src, w]) => { const P = window.__pool; P.CHALLENGES[30] = JSON.parse(JSON.stringify(P.WEEKS[w])); return eval('(' + src + ')')(30, 0.025, 12000); }, [src, w]);
    if (!r.seq) { const r2 = await ev(([src, w]) => { const P = window.__pool; P.CHALLENGES[30] = JSON.parse(JSON.stringify(P.WEEKS[w])); return eval('(' + src + ')')(30, 0.025, 40000); }, [src, w]); if (!r2.seq) bad.push(w + 1); }
  }
  ok('52 mesas semanais resolúveis (janela ≥ 0,025 rad)', bad.length === 0, bad.length ? 'falham: ' + bad.join(',') : '');
  await ev(() => { window.__pool.CHALLENGES.length = 30; });
  // jogar a mesa da semana: solução do solver aplicada com fire()
  await ev(() => { window.__pool.toMenu(); window.__pool.startWeekly(); }); await page.waitForTimeout(300);
  const seq = await ev(([src]) => { const P = window.__pool; const lv = JSON.parse(JSON.stringify(P.WEEKS[P.weekNo() % 52])); P.CHALLENGES[30] = lv; const r = eval('(' + src + ')')(30, 0.025, 8000); P.CHALLENGES.length = 30; P.startWeekly(); return r.seq; }, [src]);
  const coins0 = await ev(() => window.__pool.save.coins);
  for (const sh of seq) { await ev(([sh]) => { window.__pool.speed = 8; window.__pool.fire(sh.a, sh.pw); }, [sh]); await wait(() => window.__pool.state !== 'moving' && window.__pool.state !== 'resolving', 400, 50); await page.waitForTimeout(100); }
  await wait(() => document.getElementById('over').classList.contains('show'), 200, 60);
  const wk = await ev(() => ({ t: document.getElementById('overTitle').textContent, stars: window.__pool.save.weekly.stars, coins: window.__pool.save.coins, again: document.getElementById('btnAgain').textContent }));
  ok('evento semanal: concluído com estrelas e moedas', wk.stars >= 1 && wk.coins > coins0 && /Evento da semana/.test(wk.t), JSON.stringify(wk));
  await ev(() => { window.__pool.speed = 1; document.getElementById('btnMenu').click(); }); await page.waitForTimeout(500);
  ok('depois do evento volta ao hub', await ev(() => document.getElementById('modes').classList.contains('show')));
  ok('sem erros de consola', errs.length === 0, errs.slice(0, 3).join(' | '));
  const fails = results.filter(r => !r[1]).length;
  console.log('\n' + (fails ? 'HÁ FALHAS: ' + fails : 'TUDO PASS') + ' (' + results.length + ' testes)');
  await br.close(); process.exitCode = fails ? 1 : 0;
})();
