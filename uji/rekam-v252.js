/* rekam-v252.js — rekam video pratinjau gerak Dua Meja (webm → mp4 dengan ffmpeg).
 *   RQDIR=<repo> NODE_PATH=/tmp/cdn/node_modules RQVIDEO=<folder> node uji/rekam-v252.js */
const { buka, H } = require('./render-v252.js');
const fs = require('fs'), path = require('path');
const OUT = process.env.RQVIDEO || '/tmp/rekam';
(async () => {
  H.server.listen(0, '127.0.0.1'); await new Promise(r => H.server.once('listening', r));
  const url = `http://127.0.0.1:${H.server.address().port}/`;
  const browser = await H.chromium.launch();
  for (const [nama, o, dur] of [
    ['pimpinan-desktop', { viewport: { width: 1280, height: 800 } }, 15000],
    ['pimpinan-hp', { viewport: { width: 390, height: 844 }, mobile: true, hemat: true, gulir: true }, 16000],
    ['bk-desktop', { viewport: { width: 1280, height: 800 }, peran: 'Guru BK', kirim: true }, 14000],
    ['bk-hp', { viewport: { width: 390, height: 844 }, mobile: true, hemat: true, peran: 'Guru BK' }, 11000]
  ]) {
    const dir = path.join(OUT, nama); fs.mkdirSync(dir, { recursive: true });
    const { ctx, page } = await buka(browser, url, { ...o, video: dir });
    if (o.gulir) { await page.waitForTimeout(2200); await page.evaluate(() => scrollBy({ top: RQ_MEJA.mizan.svg().getBoundingClientRect().top - 150, behavior: 'smooth' })); }
    await page.waitForTimeout(dur);
    if (o.kirim) {
      const n0 = await page.evaluate(() => document.querySelector('.mj-lajur[data-lajur="panggil"] [data-bk-kirim]').dataset.bkKirim);
      await page.evaluate((n) => document.querySelector(`.mj-lajur[data-lajur="panggil"] [data-bk-kirim="${n}"]`).click(), n0);
      await page.waitForSelector('#pbIsi'); await page.waitForTimeout(1200);
      await page.click('.swal2-confirm'); await page.waitForTimeout(3500);
    }
    await ctx.close();
    console.log('direkam', nama);
  }
  await browser.close(); H.server.close(); process.exit(0);
})();
