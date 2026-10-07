// Uso: npm i --no-save playwright-core && node tests/run-physics.js  (devolve código 1 se algum teste falhar; EDGE=caminho do browser para mudar de executável)
const { chromium } = require('playwright-core');
(async () => {
  const br = await chromium.launch({ executablePath: process.env.EDGE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true, args: ['--allow-file-access-from-files'] });
  const page = await (await br.newContext({ viewport: { width: 900, height: 700 } })).newPage(); const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  await page.goto('' + require('url').pathToFileURL(require('path').join(__dirname, 'physics.html')).href + '');
  try { await page.waitForFunction(() => window.__summary || /ERRO|não encontrado/.test(document.getElementById('sum').textContent), null, { timeout: 120000 }); } catch (e) { console.log('timeout'); }
  console.log(await page.evaluate(() => document.getElementById('sum').textContent));
  const r = await page.evaluate(() => window.__results || []);
  r.forEach((t, i) => console.log((t.ok ? 'PASS' : 'FAIL') + ' ' + (i + 1) + ' ' + t.name + '  ->  ' + t.detail));
  if (errs.length) console.log('erros', errs);
  process.exitCode = (!r.length || r.some(t => !t.ok) || errs.length) ? 1 : 0;
  await br.close();
})();
