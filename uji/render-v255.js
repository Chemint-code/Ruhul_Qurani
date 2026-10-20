/* render-v255.js — tangkapan layar Ringkasan & Analisis v2.55.  RQSHOT=<folder> node uji/render-v255.js */
const A = require('./alat-v255.js'), fs = require('fs'), path = require('path');
const OUT = process.env.RQSHOT || path.join(__dirname, 'keluaran-v255'); fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const srv = A.layani().listen(0); await new Promise(r => srv.on('listening', r)); const port = srv.address().port;
  const browser = await A.chromium.launch();
  const kosongkan = (T) => { const hari = ['06', '07', '08', '10']; T.detail_data = T.detail_data.filter(r => !hari.some(h => r.tanggal === '2026-10-' + h)); T.log_pelanggaran = T.detail_data; return T; };
  for (const [nama, o] of [['laptop', {}], ['hp', { mobile: true, dsf: 2 }]]) {
    const { ctx, page } = await A.buka(browser, port, { ...o, data: kosongkan });
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `${OUT}/ringkasan-${nama}.png`, fullPage: true });
    if (nama === 'laptop') {
      await page.click('[data-amanah="1"]'); await A.tungguNav(page); await page.waitForTimeout(600);
      await page.screenshot({ path: `${OUT}/tiba-pembinaan-${nama}.png` });
      await page.evaluate(() => navigateTo('analisis')); await A.tungguNav(page); await page.waitForTimeout(2500);
      await page.screenshot({ path: `${OUT}/analisis-${nama}.png` });
    }
    await ctx.close();
  }
  console.log('galat:', A.galat.slice(0, 5));
  await browser.close(); srv.close();
})();
