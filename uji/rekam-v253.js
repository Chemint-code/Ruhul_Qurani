/* rekam-v253.js — video pratinjau v2.53 (webm → mp4 dengan ffmpeg).
 *   RQDIR=<repo> NODE_PATH=/tmp/cdn/node_modules RQVIDEO=<folder> node uji/rekam-v253.js */
const { buka, H } = require('./render-v252.js');
const fs = require('fs'), path = require('path');
const OUT = process.env.RQVIDEO || '/tmp/rekam53';
const bersih = (page) => page.waitForFunction(() => !layarTertutup() && !(TIRAI_NY.el && !TIRAI_NY.el.classList.contains('tutup')), null, { timeout: 15000 });
(async () => {
  H.server.listen(0, '127.0.0.1'); await new Promise(r => H.server.once('listening', r));
  const url = `http://127.0.0.1:${H.server.address().port}/`;
  const browser = await H.chromium.launch({ executablePath: process.env.RQCHROME || undefined });
  const ADEGAN = [
    ['pimpinan-desktop', { viewport: { width: 1280, height: 800 } }, async (page) => {
      await bersih(page); await page.waitForTimeout(2600);
      await page.evaluate(() => document.getElementById('mzAngkatan').scrollIntoView({ behavior: 'smooth', block: 'center' }));
      await page.waitForTimeout(2600);
      await page.evaluate(() => scrollTo({ top: 0, behavior: 'smooth' })); await page.waitForTimeout(900);
      await page.click('.mz-ulang'); await page.waitForTimeout(2200);
      await page.mouse.move(980, 540); await page.mouse.down(); await page.mouse.up();
      await page.evaluate(() => toast('success', 'Tersimpan. Poin bulan ini: 15')); await page.waitForTimeout(2400);
      await page.mouse.move(560, 420); await page.mouse.down(); await page.mouse.up();
      await page.evaluate(() => toast('success', 'Apresiasi +5 untuk Santri 1')); await page.waitForTimeout(2600);
      await page.evaluate(() => navigateTo('keterlibatan')); await page.waitForTimeout(1600);
    }],
    ['pimpinan-hp', { viewport: { width: 390, height: 844 }, mobile: true, hemat: true }, async (page) => {
      await bersih(page); await page.waitForTimeout(2200);
      await page.evaluate(() => scrollBy({ top: document.getElementById('mzKartu').getBoundingClientRect().top - 110, behavior: 'smooth' }));
      await page.waitForTimeout(2600);
      await page.evaluate(() => scrollBy({ top: document.getElementById('mzAngkatan').getBoundingClientRect().top - 140, behavior: 'smooth' }));
      await page.waitForTimeout(2600);
    }],
    ['bk-desktop', { viewport: { width: 1280, height: 800 }, peran: 'Guru BK' }, async (page) => {
      await bersih(page); await page.waitForTimeout(2600);
      const n0 = await page.evaluate(() => document.querySelector('.mj-lajur[data-lajur="panggil"] [data-bk-kirim]').dataset.bkKirim);
      const b = await page.$(`.mj-lajur[data-lajur="panggil"] [data-bk-kirim="${n0}"]`); await b.click();
      await page.waitForSelector('#pbIsi'); await page.waitForTimeout(1200);
      await page.click('.swal2-confirm'); await page.waitForTimeout(4200);
    }],
    ['ringkasan-desktop', { viewport: { width: 1280, height: 800 }, peran: 'Admin' }, async (page) => {
      await bersih(page); await page.waitForTimeout(1800);
      for (let i = 0; i < 6; i++) { await page.evaluate(() => scrollBy({ top: 460, behavior: 'smooth' })); await page.waitForTimeout(1500); }
    }]
  ];
  for (const [nama, o, jalan] of ADEGAN) {
    const dir = path.join(OUT, nama); fs.mkdirSync(dir, { recursive: true });
    const { ctx, page } = await buka(browser, url, { ...o, video: dir });
    await jalan(page);
    await ctx.close();
    console.log('direkam', nama);
  }
  await browser.close(); H.server.close(); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
