/* rekam-v254.js — video pratinjau Para Pendidik (desktop & HP).
 *   RQDIR=<repo> NODE_PATH=/tmp/cdn/node_modules RQVIDEO=<folder> node uji/rekam-v254.js
 * Memakai data tiruan dan potret sintetis dari render-v254.js.
 */
process.env.RQREKAM = '1';
const H = require('./harness.js');
const fs = require('fs'), path = require('path');
const OUT = process.env.RQVIDEO || '/tmp/rekam-v254';
fs.mkdirSync(OUT, { recursive: true });
const { buka } = require('./render-v254.js');

async function rekam(browser, url, port, nama, o, langkah) {
  const asli = browser.newContext.bind(browser);
  browser.newContext = (opsi) => asli({ ...opsi, recordVideo: { dir: OUT, size: o.viewport } });
  const t0 = Date.now();
  const { ctx, page } = await buka(browser, url, port, o);
  browser.newContext = asli;
  const mulai = (Date.now() - t0) / 1000;
  await langkah(page);
  const v = page.video();
  await ctx.close();
  const p = await v.path();
  fs.renameSync(p, path.join(OUT, nama + '.webm'));
  fs.writeFileSync(path.join(OUT, nama + '.mulai'), String(Math.max(0, mulai - .3)));
}

(async () => {
  H.server.listen(0, '127.0.0.1');
  await new Promise(r => H.server.once('listening', r));
  const port = H.server.address().port, url = `http://127.0.0.1:${port}/`;
  const browser = await H.chromium.launch({ executablePath: process.env.RQCHROME || undefined });

  await rekam(browser, url, port, 'pratinjau-asatidz-desktop', { viewport: { width: 1280, height: 800 } }, async (page) => {
    await page.evaluate(() => navigateTo('asatidz'));
    await page.waitForTimeout(2600);
    await page.mouse.wheel(0, 640); await page.waitForTimeout(1300);
    const w = await page.$('.as-kisi .as-wajah:nth-child(3)');
    const b = await w.boundingBox();
    for (let i = 0; i <= 24; i++) { await page.mouse.move(b.x + b.width * (.15 + i * .03), b.y + b.height * (.2 + Math.sin(i / 4) * .25)); await page.waitForTimeout(40); }
    await page.waitForTimeout(500);
    await w.click();
    await page.waitForTimeout(3200);
    await page.mouse.wheel(0, 760); await page.waitForTimeout(2000);
    await page.mouse.wheel(0, 900); await page.waitForTimeout(2200);
    await page.mouse.wheel(0, -4000); await page.waitForTimeout(900);
    await page.click('[data-as-kembali]');
    await page.waitForTimeout(1800);
  });
  await rekam(browser, url, port, 'pratinjau-asatidz-hp', { viewport: { width: 390, height: 844 }, mobile: true }, async (page) => {
    await page.evaluate(() => navigateTo('asatidz'));
    await page.waitForTimeout(2600);
    await page.mouse.wheel(0, 700); await page.waitForTimeout(1400);
    await page.tap('.as-kisi .as-wajah:nth-child(2)');
    await page.waitForTimeout(3000);
    await page.mouse.wheel(0, 800); await page.waitForTimeout(2000);
  });
  await browser.close(); H.server.close();
  console.log('video di', OUT);
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
