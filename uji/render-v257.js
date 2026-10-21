/* render-v257.js — tangkapan Langit Senja v2.57: gerbang (login), bilah atas & Ringkasan
 * dengan langit malam (bawaan).   RQSHOT=<folder> node uji/render-v257.js          */
const A = require('./alat-v255.js'), fs = require('fs'), path = require('path');
const OUT = process.env.RQSHOT || path.join(__dirname, 'keluaran-v257'); fs.mkdirSync(OUT, { recursive: true });
const CEPAT = process.argv.includes('cepat');
(async () => {
  const srv = A.layani().listen(0); await new Promise(r => srv.on('listening', r)); const port = srv.address().port;
  const browser = await A.chromium.launch();
  // 1 · Gerbang (tanpa sesi)
  for (const [nama, vp, m] of [['laptop', { width: 1366, height: 800 }, false], ['hp', { width: 390, height: 844 }, true]]) {
    const ctx = await browser.newContext({ viewport: vp, isMobile: m, hasTouch: m, deviceScaleFactor: m ? 2 : 1, reducedMotion: 'reduce', serviceWorkers: 'block' });
    const page = await ctx.newPage();
    page.on('pageerror', e => A.galat.push('login: ' + e.message));
    await page.addInitScript(() => { window.__TANPASESI = true; try { localStorage.setItem('rq-singgah', 'mati'); } catch (e) {} });
    const H = require('./harness.js');
    await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) => {
      const u = route.request().url();
      if (u.includes('supabase-js')) return route.fulfill({ contentType: 'application/javascript', body: 'window.__T=' + JSON.stringify(require('./data-v255.js')()) + ';' + H.MOCK });
      if (u.includes('fonts.googleapis')) return route.fulfill({ contentType: 'text/css', body: '' });
      if (u.includes('font-awesome')) return route.fulfill({ contentType: 'text/css', body: '' });
      return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
    });
    await page.goto(`http://127.0.0.1:${port}/`);
    await page.waitForSelector('#loginScreen:not(.hidden)', { timeout: 20000 });
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `${OUT}/gerbang-${nama}.png` });
    await ctx.close();
  }
  // 2 · Ringkasan dengan langit malam (bawaan)
  const waktu = [['malam', '2026-10-20T10:00:00+07:00']];
  for (const [w, jam] of waktu) {
    for (const [nama, o] of [['laptop', {}], ['hp', { mobile: true, dsf: 2 }]]) {
            const { ctx, page } = await A.buka(browser, port, { ...o, jam });
      await page.waitForTimeout(1800);
      await page.screenshot({ path: `${OUT}/ringkasan-${w}-${nama}.png`, fullPage: nama === 'hp' });
      if (w === 'malam') {
        await page.click('#btnEfek'); await page.waitForSelector('.tp-panel'); await page.waitForTimeout(500);
        await page.screenshot({ path: `${OUT}/tampilan-${nama}.png` });
        await page.click('.tp-opsi[data-k="klasik"]'); await page.waitForTimeout(300);
        const k = await page.evaluate(() => [document.documentElement.dataset.langit, localStorage.getItem('rq-langit'), document.querySelector('meta[name=theme-color]').content]);
        console.log('klasik →', k.join(' · '));
        await page.click('.tp-opsi[data-k="malam"]'); await page.waitForTimeout(200);
        await page.evaluate(() => Swal.close()); await page.waitForTimeout(400);
      }
      if (nama === 'laptop') {
        await page.mouse.move(34, 330); await page.waitForTimeout(700);
        await page.screenshot({ path: `${OUT}/panel-${w}-${nama}.png`, clip: { x: 0, y: 0, width: 700, height: 800 } });
      }
      await ctx.close();
    }
  }
  console.log('galat:', A.galat.slice(0, 6));
  await browser.close(); srv.close();
})();
