const { chromium } = require('playwright-core');
const fs = require('fs');
const { pngRGB } = require('./png.js');
const L = require('./logo.js');
const ROOT = 'C:/Users/Utilizador 1/claudejogo';
const page_html = (S, k) => `<html><body style="margin:0;width:${S}px;height:${S}px;overflow:hidden;background:radial-gradient(circle at 50% 38%,#34b873 0,#178046 55%,#07281a 100%)">
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${S}" height="${S}" style="display:block"><g transform="translate(50 50) scale(${k}) translate(-50 -50)">${L.inner('i')}</g></svg></body></html>`;
(async () => {
  const br = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  const page = await (await br.newContext({ viewport: { width: 1024, height: 1024 } })).newPage();
  const work = await (await br.newContext()).newPage(); await work.goto('about:blank');
  const toRGB = async buf => { const r = await work.evaluate(async b64 => { const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode(); const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight; const g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0); const d = g.getImageData(0, 0, c.width, c.height).data, rgb = new Uint8Array(c.width * c.height * 3); for (let i = 0, j = 0; i < d.length; i += 4, j += 3) { rgb[j] = d[i]; rgb[j + 1] = d[i + 1]; rgb[j + 2] = d[i + 2]; } let bin = ''; for (let i = 0; i < rgb.length; i += 32768) bin += String.fromCharCode.apply(null, rgb.subarray(i, i + 32768)); return { w: c.width, h: c.height, b64: btoa(bin) }; }, buf.toString('base64')); return pngRGB(r.w, r.h, Buffer.from(r.b64, 'base64')); };
  const jobs = [['store-assets/icon-1024.png', 1024, .98], ['icons/icon-512.png', 512, .98], ['icons/icon-192.png', 192, .98], ['icons/apple-touch-icon.png', 180, .98], ['icons/icon-maskable-512.png', 512, .86]];
  for (const [f, S, k] of jobs) { await page.setViewportSize({ width: S, height: S }); await page.setContent(page_html(S, k)); await page.waitForTimeout(100); fs.writeFileSync(ROOT + '/' + f, await toRGB(await page.screenshot({ type: 'png' }))); console.log(f, S); }
  fs.writeFileSync(ROOT + '/icons/logo.svg', L.svg('l'));
  await br.close();
})();
