/* uji-v257.js — Langit Meulaboh: langit malam (bawaan) & klasik, theme-color, hemat, panel Tampilan.
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

  for (const jam of ['06:00', '12:00', '17:30', '21:00']) {
    const { ctx, page } = await A.buka(browser, port, { jam: `2026-10-20T${jam}:00+07:00` });
    const s = await baca(page);
    A.cek(`bawaan pukul ${jam}: langit malam`, s.langit === 'malam' && s.warna === '#0B1435', s.langit);
    await ctx.close();
  }
  // Pilihan lama dari pratinjau (senja/waktu) jatuh ke malam
  let { ctx, page } = await A.buka(browser, port, { init: () => { try { localStorage.setItem('rq-langit', 'senja'); } catch (e) {} } });
  A.cek('pilihan lama "senja" → malam', (await baca(page)).langit === 'malam');
  await ctx.close();

  ({ ctx, page } = await A.buka(browser, port, {}));
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  let s = await baca(page);
  A.cek('bilah atas bergradien & bergerak (mode penuh)', s.langitBilah.startsWith('radial-gradient') && s.anim === 'langitHanyut', s);
  A.cek('lembar: tepi atas bergradien langit', String(s.lembarAtas).startsWith('linear-gradient'), s.lembarAtas);
  await page.evaluate(() => terapkanHemat(true)); s = await baca(page);
  A.cek('hemat: langit diam', s.anim === 'none', s.anim);
  await page.evaluate(() => terapkanHemat(false));

  await page.click('#btnEfek'); await page.waitForSelector('.tp-panel');
  A.cek('panel: hanya dua pilihan langit, "Langit malam" menyala', await page.evaluate(() => {
    const o = [...document.querySelectorAll('.tp-opsi[data-grup="langit"]')].map(x => x.dataset.k);
    return o.join() === 'malam,klasik' && document.querySelector('.tp-opsi.on[data-grup="langit"]').dataset.k === 'malam';
  }));
  await page.click('.tp-opsi[data-k="klasik"]'); await page.waitForTimeout(150); s = await baca(page);
  A.cek('klasik: navy lama & theme-color #0B2B45 & tersimpan', s.langit === 'klasik' && s.warna === '#0B2B45' && !s.langitBilah.startsWith('radial')
    && await page.evaluate(() => localStorage.getItem('rq-langit')) === 'klasik', s);
  await page.click('.tp-opsi[data-k="malam"]'); await page.waitForTimeout(150); s = await baca(page);
  A.cek('kembali ke malam: kunci dihapus', s.langit === 'malam' && await page.evaluate(() => localStorage.getItem('rq-langit')) === null, s);
  await page.click('.tp-opsi[data-k="hemat"]'); await page.waitForTimeout(150);
  A.cek('panel: gerak Hemat berlaku', await page.evaluate(() => modeHemat() && localStorage.getItem('rq-efek-pilih') === 'hemat'));
  await ctx.close();

  // Klasik bertahan setelah dibuka ulang (dipasang skrip <head>)
  ({ ctx, page } = await A.buka(browser, port, { init: () => { try { localStorage.setItem('rq-langit', 'klasik'); } catch (e) {} } }));
  A.cek('klasik bertahan saat dibuka ulang', (await baca(page)).langit === 'klasik');
  await ctx.close();

  A.cek('tidak ada galat halaman', A.galat.length === 0, A.galat.slice(0, 3));
  const h = A.hasil(); console.log(`${h.lulus} lulus, ${h.gagal} gagal`);
  await browser.close(); srv.close(); process.exit(h.gagal ? 1 : 0);
})();
