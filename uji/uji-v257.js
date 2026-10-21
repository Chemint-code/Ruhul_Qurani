/* uji-v257.js — Langit Meulaboh: pilihan langit, jam, theme-color, hemat, panel Tampilan.
 *   node uji/uji-v257.js */
const A = require('./alat-v255.js');
(async () => {
  const srv = A.layani().listen(0); await new Promise(r => srv.on('listening', r)); const port = srv.address().port;
  const browser = await A.chromium.launch();
  const baca = (page) => page.evaluate(() => ({
    langit: document.documentElement.dataset.langit,
    warna: document.querySelector('meta[name="theme-color"]').content,
    anim: getComputedStyle(document.querySelector('.pbar'), '::before').animationName,
    langitBilah: getComputedStyle(document.querySelector('.pbar'), '::before').backgroundImage.slice(0, 15),
    lembarAtas: (() => { const l = document.querySelector('.lembar'); return l ? getComputedStyle(l).borderImageSource.slice(0, 15) : null; })()
  }));

  // 1 · Bawaan tanpa pilihan tersimpan = senja, apa pun jamnya
  let { ctx, page } = await A.buka(browser, port, { jam: '2026-10-20T10:00:00+07:00' });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  let s = await baca(page);
  A.cek('bawaan: senja pada pukul 10', s.langit === 'senja' && s.warna === '#22234F', s);
  A.cek('bawaan: bilah atas bergradien & bergerak (mode penuh)', s.langitBilah.startsWith('radial-gradient') && s.anim === 'langitHanyut', s);
  A.cek('lembar: tepi atas bergradien langit', String(s.lembarAtas).startsWith('linear-gradient'), s.lembarAtas);
  // hemat → diam
  await page.evaluate(() => terapkanHemat(true)); s = await baca(page);
  A.cek('hemat: langit diam', s.anim === 'none', s.anim);
  await page.evaluate(() => terapkanHemat(false));
  // klasik → aturan langit tidak berlaku
  await page.evaluate(() => gantiLangit('klasik')); s = await baca(page);
  A.cek('klasik: navy lama & theme-color #0B2B45', s.langit === 'klasik' && s.warna === '#0B2B45' && !s.langitBilah.startsWith('radial'), s);
  await page.evaluate(() => gantiLangit('senja'));
  A.cek('senja disimpan sebagai bawaan (kunci dihapus)', await page.evaluate(() => localStorage.getItem('rq-langit')) === null);
  // panel Tampilan
  await page.click('#btnEfek'); await page.waitForSelector('.tp-panel');
  await page.click('.tp-opsi[data-k="waktu"]'); await page.waitForTimeout(150);
  s = await baca(page);
  A.cek('panel: pilih "Ikut waktu" pukul 10 → siang', s.langit === 'siang' && s.warna === '#0D4FB0', s);
  await page.click('.tp-opsi[data-k="hemat"]'); await page.waitForTimeout(150);
  A.cek('panel: pilih gerak Hemat berlaku', await page.evaluate(() => modeHemat() && localStorage.getItem('rq-efek-pilih') === 'hemat'));
  A.cek('panel: hanya satu opsi menyala per grup', await page.evaluate(() =>
    document.querySelectorAll('.tp-opsi.on[data-grup="langit"]').length === 1 && document.querySelectorAll('.tp-opsi.on[data-grup="gerak"]').length === 1));
  await ctx.close();

  // 2 · Ikut waktu pada empat jam (dipasang skrip <head> sebelum app.js)
  for (const [jam, harap] of [['03:30', 'malam'], ['05:40', 'fajar'], ['12:00', 'siang'], ['17:10', 'senja'], ['19:05', 'malam']]) {
    ({ ctx, page } = await A.buka(browser, port, { jam: `2026-10-20T${jam}:00+07:00`, init: () => { try { localStorage.setItem('rq-langit', 'waktu'); } catch (e) {} } }));
    s = await baca(page);
    A.cek(`ikut waktu ${jam} → ${harap}`, s.langit === harap, s.langit);
    await ctx.close();
  }
  A.cek('tidak ada galat halaman', A.galat.length === 0, A.galat.slice(0, 3));
  const h = A.hasil(); console.log(`${h.lulus} lulus, ${h.gagal} gagal`);
  await browser.close(); srv.close(); process.exit(h.gagal ? 1 : 0);
})();
