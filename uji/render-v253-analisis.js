/* render-v253.js — BENANG EMAS · TOKOH DI GERBANG · MIZAN DATA BERAKSI · CAP TERCATAT
 *   RQDIR=<repo> NODE_PATH=/tmp/cdn/node_modules RQCHROME=<chrome> node uji/render-v253.js
 *   RQSHOT=<folder> → simpan tangkapan layar.
 *   Regresi pertunjukan bertokoh lama: RQTOKOH=meja node uji/render-v252.js  (dan render-v251.js)
 */
const { buka, H } = require('./render-v252.js');
const { cek, semuaGalat } = H;
const fs = require('fs'), path = require('path');
const SHOT = process.env.RQSHOT || '';
const foto = async (page, nama, full = false) => { if (SHOT) { fs.mkdirSync(SHOT, { recursive: true }); await page.screenshot({ path: path.join(SHOT, nama + '.png'), fullPage: full }); } };

/** Pasang pencatat: kapan .mz-surat / .mj-meja pertama muncul, dan berkas gerak mana yang diminta. */
const PENCATAT = () => {
  window.__T = {};
  new MutationObserver(() => {
    if (!window.__T.surat && document.querySelector('#viewRoot .mz-surat')) window.__T.surat = performance.now();
    if (!window.__T.meja && document.querySelector('#viewRoot .mj-meja')) window.__T.meja = performance.now();
  }).observe(document.documentElement, { childList: true, subtree: true });
};
/** Animasi yang masih berjalan di halaman (bukan benang halaman / sakura). */
const animJalan = () => document.getAnimations().filter(a => a.playState === 'running' && a.effect && a.effect.target
  && document.getElementById('viewRoot').contains(a.effect.target)).length;

(async () => {
  H.server.listen(0, '127.0.0.1');
  await new Promise(r => H.server.once('listening', r));
  const url = `http://127.0.0.1:${H.server.address().port}/`;
  const browser = await H.chromium.launch({ executablePath: process.env.RQCHROME || undefined });
  const minta = [];

  /* ---- 5 · Ringkasan (Admin): tanpa panggung bertokoh; grafik tumbuh di atas benang alas ---- */
  {
    console.log('\n[Analisis (grafik Ringkasan lama) · gerbang]');
    const { ctx, page } = await buka(browser, url, { viewport: { width: 1280, height: 860 }, peran: 'Admin' }).catch(async (e) => { throw e; });
    await page.waitForFunction(() => APP.view === 'dashboard' && !APP.navSibuk, null, { timeout: 15000 }).catch(() => {});
    await page.evaluate(() => navigateTo('analisis'));
    await page.waitForFunction(() => APP.view === 'analisis' && !APP.navSibuk, null, { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(1500);
    const r = await page.evaluate(() => ({ view: APP.view, pentas: window.RQPanggung && !window.RQPanggung._S && typeof window.RQPanggung.daftar === 'function',
      kanvas: document.querySelectorAll('canvas.pg-kanvas, .mj-kanvas').length,
      hias: [...document.querySelectorAll('.kerubung, #pbarMon, .mon-hinggap, .sapa-mon-jalan, .penghuni, .pg-tabir')].filter(e => getComputedStyle(e).display !== 'none' && !e.hidden).length,
      nama: document.querySelectorAll('.nama-dikerubungi').length }));
    cek('Ringkasan: penggerak data (bukan panggung.js); tanpa monster di sapaan, bilah profil, grafik, dan nama 10 besar', r.view === 'analisis' && r.pentas && r.kanvas === 0 && r.hias === 0 && r.nama === 0, r);
    const alas = [];
    for (let y = 0; y < 6; y++) {
      await page.evaluate(() => scrollBy({ top: 520 }));
      for (let i = 0; i < 6; i++) { await page.waitForTimeout(120); alas.push(await page.evaluate(() => document.querySelectorAll('.benang-alas').length)); }
    }
    await page.waitForTimeout(1800);
    const g = await page.evaluate(() => {
      const it = RQ_PANGGUNG.items();
      const tampakBelum = it.filter(x => x.status !== 'selesai' && x.chart.canvas.getBoundingClientRect().top < innerHeight);
      return { jml: it.length, selesai: it.filter(x => x.status === 'selesai').length, belumTampak: tampakBelum.length,
        utuh: it.filter(x => x.status === 'selesai').every(x => x.chart.data.datasets.every((d, i) => JSON.stringify(d.data) === JSON.stringify(x.asli[i]))) };
    });
    cek('grafik Ringkasan tumbuh saat terlihat di atas benang alas; data akhir persis asli', Math.max(...alas) > 0 && g.belumTampak === 0 && g.utuh, { alasMaks: Math.max(...alas), ...g });
    await foto(page, 'ringkasan');
    await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
    const cetak = await page.evaluate(() => RQ_PANGGUNG.items().every(x => x.status === 'selesai'));
    cek('cetak: semua grafik dilepas utuh', cetak, cetak);
    await ctx.close();
  }

  /* ---- 6 · Sakelar tokoh: pertunjukan lama kembali utuh ---- */
  {
    console.log('\n[Sakelar "tokoh di meja kerja"]');
    const { ctx, page } = await buka(browser, url, { viewport: { width: 1280, height: 860 }, tokoh: 'meja' });
    await page.waitForFunction(() => window.RQMeja && document.querySelector('.mj-kanvas'), null, { timeout: 9000 }).catch(() => {});
    const r = await page.evaluate(() => ({ meja: !!window.RQMeja, kanvas: !!document.querySelector('.mj-kanvas'), atr: document.documentElement.dataset.tokoh }));
    cek('rq-tokoh=meja → meja.js memutar pertunjukan Si Peci & Si Payung seperti v2.52', r.meja && r.kanvas && r.atr === 'meja', r);
    await page.waitForTimeout(400);
    await page.click('#btnBantuan');
    await page.waitForSelector('#bnTokoh', { timeout: 5000 });
    const tercentang = await page.evaluate(() => document.getElementById('bnTokoh').checked);
    await page.click('#bnTokoh');
    const s = await page.evaluate(() => ({ ls: localStorage.getItem('rq-tokoh'), atr: document.documentElement.dataset.tokoh }));
    cek('Bantuan: sakelar tercentang sesuai pilihan; dimatikan → kembali ke gerbang', tercentang && s.ls === null && s.atr === 'gerbang', { tercentang, ...s });
    await ctx.close();
  }

  const galat = semuaGalat.filter(g => !/favicon|net::ERR|Failed to load resource|at gambarKinerjaGuru/.test(g));
  cek('nol galat halaman/konsol', galat.length === 0, galat.slice(0, 8));
  H.ringkas();
  await browser.close(); H.server.close();
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
