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

  /* ---- 1 · Pimpinan desktop: tanpa tokoh, data beraksi ≤ 1,6 dtk ---- */
  {
    console.log('\n[Pimpinan desktop · gerbang]');
    const { ctx, page } = await buka(browser, url, { viewport: { width: 1280, height: 860 } });
    page.on('request', r => minta.push(r.url()));
    await page.evaluate(PENCATAT);
    // Halaman sudah tampil di sini; tunggu tirai muat pertama lepas lalu ukur pentasnya.
    await page.waitForFunction(() => !layarTertutup() && !(TIRAI_NY.el && !TIRAI_NY.el.classList.contains('tutup')), null, { timeout: 15000 });
    const t0 = await page.evaluate(() => performance.now());
    const awal = await page.evaluate(() => ({
      tahan: document.querySelectorAll('.mz-tahan, .mj-tahan').length, kanvas: !!document.querySelector('.mj-kanvas'), meja: !!window.RQMeja,
      aria: RQ_MEJA.mizan.svg().getAttribute('aria-label'), kk: document.querySelectorAll('.mz-vonis .kk').length,
      sorot: document.querySelector('.mz-vonis .benang-sorot')?.textContent, u: !!document.querySelector('.mz-vonis .benang-u'),
      vonis: document.querySelector('.mz-vonis').textContent
    }));
    cek('tanpa tokoh: meja.js tidak dimuat, tanpa kanvas aktor, tanpa tahanan .mz-tahan', !awal.meja && !awal.kanvas && awal.tahan === 0, awal);
    cek('vonis dipecah per kata, teks tetap utuh; subjek "Angkatan VIII" bergaris benang', awal.kk >= 6 && awal.sorot === 'Angkatan VIII' && awal.u
      && /^Bulan pertama yang tercatat penuh\. Angkatan VIII perlu dibicarakan\.$/.test(awal.vonis.trim()), awal);
    cek('angka asli tersedia sejak awal (aria-label timbangan)', /70 catatan kebaikan, 1\.320 catatan pelanggaran/.test(awal.aria), awal.aria);
    // Sampel di tengah pentas → benar-benar bergerak
    await page.waitForTimeout(450);
    const tengah = await page.evaluate(() => ({ sudut: Number(RQ_MEJA.mizan.svg().dataset.sudut), harus: RQ_MEJA.mizan.sudutAkhir(), jalan: document.getAnimations().filter(a => a.playState === 'running').length }));
    cek('pentas berjalan (balok sedang menuju sudutnya, animasi aktif)', tengah.jalan > 0 && tengah.sudut !== tengah.harus, tengah);
    await foto(page, 'pimpinan-tengah');
    // Selesai: tunggu sampai tidak ada animasi di #viewRoot & sudut final
    await page.waitForFunction((f) => (new Function('return ' + f))()() === 0 && Number(RQ_MEJA.mizan.svg().dataset.sudut) === RQ_MEJA.mizan.sudutAkhir(),
      animJalan.toString(), { timeout: 6000, polling: 30 }).catch(() => {});
    const t1 = await page.evaluate(() => performance.now());
    const akhir = await page.evaluate(() => {
      const svg = RQ_MEJA.mizan.svg();
      return { sudut: Number(svg.dataset.sudut), harus: RQ_MEJA.mizan.sudutAkhir(),
        nilai: [...svg.querySelectorAll('.mz-nilai')].map(t => t.textContent + '/' + t.dataset.akhir),
        vital: [...document.querySelectorAll('[data-mz-angka]')].map(t => t.textContent),
        kataTampak: [...document.querySelectorAll('.mz-vonis .kk-i')].every(k => getComputedStyle(k).opacity === '1' && getComputedStyle(k).transform === 'none'),
        garis: getComputedStyle(document.querySelector('.mz-vonis .benang-u')).transform,
        siaga: document.querySelectorAll('#mzKartu.mz-siaga, .pentas-siaga').length,
        wTampak: [...svg.querySelectorAll('.mz-w')].every(w => getComputedStyle(w).opacity === '1'),
        cap: getComputedStyle(document.getElementById('mzCap')).opacity };
    });
    const durasi = Math.round(t1 - t0);
    cek(`Mizan + vonis + tanda vital tuntas ≤ 1.700 ms sejak layar bersih (${durasi} ms)`, durasi <= 1700, durasi);
    cek('akhir: sudut, angka timbangan, tanda vital persis data asli', Math.abs(akhir.sudut - akhir.harus) < .001
      && akhir.nilai.every(v => { const [a, b] = v.split('/'); return a.replace(/\./g, '') === b; })
      && JSON.stringify(akhir.vital) === JSON.stringify(['1.100', '75%', '48,3%']), akhir);
    cek('akhir: semua kata, pemberat, dan kalimat timbangan tampak; garis benang utuh', akhir.kataTampak && akhir.wTampak && akhir.cap === '1'
      && (akhir.garis === 'none' || /^matrix\(1, 0, 0, 1/.test(akhir.garis)) && akhir.siaga === 0, akhir);
    // Angkatan di bawah lipatan: menunggu, lalu dijahit saat digulir
    const ang0 = await page.evaluate(() => ({ tunggu: document.getElementById('mzAngkatan').classList.contains('pentas-tunggu'), top: Math.round(document.getElementById('mzAngkatan').getBoundingClientRect().top) }));
    await page.evaluate(() => document.getElementById('mzAngkatan').scrollIntoView({ block: 'center' }));
    await page.waitForTimeout(250);
    const angJalan = await page.evaluate(() => document.getAnimations().filter(a => a.effect?.pseudoElement === '::after' && a.effect.target.closest('#mzAngkatan')).length);
    await page.waitForTimeout(1600);
    const ang1 = await page.evaluate(() => ({ tunggu: document.getElementById('mzAngkatan').classList.contains('pentas-tunggu'),
      batang: [...document.querySelectorAll('#mzAngkatan .mz-ang-tr i')].every(i => getComputedStyle(i).transform === 'none') }));
    cek('grafik angkatan: menunggu di luar layar, tumbuh + garis rata-rata dijahit saat terlihat', (ang0.top < 860 || ang0.tunggu) && angJalan > 0 && !ang1.tunggu && ang1.batang, { ang0, angJalan, ang1 });
    await page.evaluate(() => scrollTo(0, 0));
    await foto(page, 'pimpinan-akhir');

    // Putar ulang
    await page.click('.mz-ulang');
    await page.waitForTimeout(250);
    const ulang = await page.evaluate(() => ({ jalan: document.getAnimations().filter(a => a.playState === 'running').length, meja: !!window.RQMeja }));
    cek('tombol Putar memutar ulang pentas data (tanpa tokoh)', ulang.jalan > 0 && !ulang.meja, ulang);
    await page.waitForTimeout(1800);

    /* ---- Cap "Tercatat" ---- */
    await page.mouse.click(700, 520);
    await page.evaluate(() => { window.__GETAR = []; toast('success', 'Tersimpan. Poin bulan ini: 15'); });
    await page.waitForTimeout(240);
    const c1 = await page.evaluate(() => {
      const c = document.querySelector('.cap-tekan'); const r = c && c.getBoundingClientRect();
      return { ada: !!c, x: r && Math.round(r.left + r.width / 2), y: r && Math.round(r.top + r.height / 2), kata: c?.querySelector('.cap-kata')?.textContent,
        tinta: c && getComputedStyle(c).color, getar: window.__GETAR.slice() };
    });
    cek('cap besar ditekan di titik asal aksi, berkata TERCATAT, tinta ungu', c1.ada && Math.abs(c1.x - 700) < 60 && Math.abs(c1.y - 520) < 60 && c1.kata === 'TERCATAT', c1);
    await foto(page, 'cap-tekan');
    await page.waitForTimeout(500);
    const c2 = await page.evaluate(() => ({ jahit: !!document.querySelector('.benang-jahit'), getar: window.__GETAR.slice() }));
    await page.waitForTimeout(1200);
    const c3 = await page.evaluate(() => {
      const m = document.querySelector('.terima .cap-mini');
      return { tekan: document.querySelectorAll('.cap-tekan').length, mini: !!m, op: m && getComputedStyle(m).opacity, kata: m?.querySelector('.cap-kata')?.textContent,
        centang: document.querySelectorAll('.terima .centang').length, jahit: document.querySelectorAll('.benang-jahit').length };
    });
    cek('getar sekali (12 ms) tepat saat cap menekan', JSON.stringify(c2.getar) === '[12]', c2.getar);
    cek('benang menjahit cap ke tanda terima; cap besar pergi, cap kecil menetap di kartu', c2.jahit && c3.tekan === 0 && c3.mini && c3.op === '1' && c3.kata === 'TERCATAT' && c3.centang === 0, { c2, c3 });
    // Dua kabar beruntun: yang kedua hanya cap kecil (tidak menumpuk)
    await page.evaluate(() => { toast('success', 'Apresiasi +5 untuk Santri 1'); setTimeout(() => toast('success', 'Data tersimpan'), 200); });
    await page.waitForTimeout(450);
    const c4 = await page.evaluate(() => ({ tekan: [...document.querySelectorAll('.cap-tekan .cap-kata')].map(k => k.textContent),
      mini: [...document.querySelectorAll('.terima .cap-mini .cap-kata')].map(k => k.textContent) }));
    cek('kabar beruntun: hanya satu cap besar (APRESIASI, tinta emas); yang kedua cap kecil saja', c4.tekan.length === 1 && c4.tekan[0] === 'APRESIASI' && c4.mini.includes('TERSIMPAN'), c4);
    await page.waitForTimeout(1500);

    /* ---- Jejak halaman ---- */
    const nav = page.evaluate(() => navigateTo('keterlibatan'));
    await page.waitForTimeout(60);
    const b1 = await page.evaluate(() => { const b = document.querySelector('.topbar > .benang-halaman'); return { ada: !!b, anim: b ? b.getAnimations().length : 0 }; });
    await nav; await page.waitForTimeout(900);
    const b2 = await page.evaluate(() => getComputedStyle(document.querySelector('.topbar > .benang-halaman')).opacity);
    cek('jejak benang di bawah bilah atas berjalan saat pindah halaman, lalu tuntas & pudar', b1.ada && b1.anim > 0 && Number(b2) === 0, { b1, b2 });
    await ctx.close();
  }
  cek('meja.js & panggung.js tidak pernah diminta dalam mode gerbang', !minta.some(u => /\/(meja|panggung)\.js/.test(u)), minta.filter(u => /\.js/.test(u)).map(u => u.split('/').pop()));

  /* ---- 2 · Pimpinan HP hemat: timbangan di bawah lipatan menunggu, lalu bergerak ---- */
  {
    console.log('\n[Pimpinan HP hemat · gerbang]');
    const { ctx, page } = await buka(browser, url, { viewport: { width: 390, height: 844 }, mobile: true, hemat: true });
    await page.waitForFunction(() => !layarTertutup() && !(TIRAI_NY.el && !TIRAI_NY.el.classList.contains('tutup')), null, { timeout: 15000 });
    await page.waitForTimeout(300);
    const a = await page.evaluate(() => ({ siaga: document.getElementById('mzKartu').classList.contains('mz-siaga'), top: Math.round(document.getElementById('mzKartu').getBoundingClientRect().top),
      sudut: Number(RQ_MEJA.mizan.svg().dataset.sudut) }));
    await page.evaluate(() => scrollBy({ top: document.getElementById('mzKartu').getBoundingClientRect().top - 120 }));
    await page.waitForTimeout(1700);
    const b = await page.evaluate(() => ({ siaga: document.getElementById('mzKartu').classList.contains('mz-siaga'), sudut: Number(RQ_MEJA.mizan.svg().dataset.sudut), harus: RQ_MEJA.mizan.sudutAkhir(),
      nilai: [...RQ_MEJA.mizan.svg().querySelectorAll('.mz-nilai')].map(t => t.textContent) }));
    cek('HP: timbangan di luar layar menunggu (siaga), tergulir → bergerak & tuntas pada data asli', (a.top > 844 ? a.siaga && a.sudut === 0 : true) && !b.siaga && b.sudut === b.harus && b.nilai.join() === '70,1.320', { a, b });
    await foto(page, 'pimpinan-hp');
    await ctx.close();
  }

  /* ---- 3 · Kurangi gerak: semuanya diam, data langsung utuh ---- */
  {
    console.log('\n[Pimpinan · reduced-motion]');
    const { ctx, page } = await buka(browser, url, { viewport: { width: 1280, height: 860 }, reduced: true });
    await page.waitForTimeout(800);
    const r = await page.evaluate(() => ({ siaga: document.querySelectorAll('.mz-siaga, .pentas-siaga, .pentas-tunggu').length, jalan: document.getAnimations().filter(a => a.playState === 'running' && document.getElementById('viewRoot').contains(a.effect?.target)).length,
      sudut: Number(RQ_MEJA.mizan.svg().dataset.sudut), harus: RQ_MEJA.mizan.sudutAkhir(), u: !!document.querySelector('.mz-vonis .benang-u') }));
    cek('reduced-motion: tanpa siaga, tanpa animasi, sudut langsung final, garis benang tetap ada (statis)', r.siaga === 0 && r.jalan === 0 && r.sudut === r.harus && r.u, r);
    await page.mouse.click(600, 500);
    await page.evaluate(() => toast('success', 'Tersimpan. Poin bulan ini: 15'));
    await page.waitForTimeout(200);
    const c = await page.evaluate(() => ({ tekan: document.querySelectorAll('.cap-tekan').length, mini: !!document.querySelector('.terima .cap-mini') }));
    cek('reduced-motion: tanpa cap besar terbang; cap kecil tetap di tanda terima', c.tekan === 0 && c.mini, c);
    await ctx.close();
  }

  /* ---- 4 · Meja BK: kartu berdatangan cepat; kirim → benang + cap DIPANGGIL ---- */
  {
    console.log('\n[Meja BK desktop · gerbang]');
    const { ctx, page } = await buka(browser, url, { viewport: { width: 1280, height: 860 }, peran: 'Guru BK' });
    await page.waitForFunction(() => !layarTertutup() && !(TIRAI_NY.el && !TIRAI_NY.el.classList.contains('tutup')), null, { timeout: 15000 });
    await page.waitForTimeout(950);
    const r = await page.evaluate(() => ({ meja: !!window.RQMeja, tahan: document.querySelectorAll('.mj-tahan').length,
      redup: [...document.querySelectorAll('.mj-kartu')].filter(k => Number(getComputedStyle(k).opacity) < .99).length,
      kk: document.querySelectorAll('.mj-atas h2 .kk').length, judul: document.querySelector('.mj-atas h2').textContent.trim() }));
    cek('BK: tanpa meja.js/tahanan; semua kartu sudah tampak ≤ 950 ms; judul dipecah per kata', !r.meja && r.tahan === 0 && r.redup === 0 && r.kk === 2 && r.judul === 'Meja Pendampingan', r);
    await page.waitForTimeout(500);
    const u = await page.evaluate(() => ({ teks: document.querySelector('.mj-lajur[data-lajur="panggil"] .benang-sorot')?.textContent.trim(),
      pertama: document.querySelector('.mj-lajur[data-lajur="panggil"] .mj-kartu header .btn-link')?.textContent.trim() }));
    cek('benang menggaris bawahi santri pertama yang perlu dipanggil', !!u.teks && u.teks === u.pertama, u);
    await foto(page, 'bk-desktop');
    const n0 = await page.evaluate(() => document.querySelector('.mj-lajur[data-lajur="panggil"] [data-bk-kirim]').dataset.bkKirim);
    await page.evaluate((n) => document.querySelector(`.mj-lajur[data-lajur="panggil"] [data-bk-kirim="${n}"]`).click(), n0);
    await page.waitForSelector('#pbIsi', { timeout: 6000 });
    await page.click('.swal2-confirm');
    let k = { jahit: false, cap: '', tekan: 0 };
    for (let i = 0; i < 22; i++) {
      await page.waitForTimeout(110);
      const x = await page.evaluate((n) => ({ jahit: !!document.querySelector('.benang-jahit'), cap: document.querySelector('.cap-kartu .cap-kata')?.textContent || '',
        tekan: document.querySelectorAll('.cap-tekan').length, lajur: document.querySelector(`.mj-kartu[data-mj-nisn="${n}"]`)?.closest('.mj-lajur')?.dataset.lajur,
        mini: document.querySelector('.terima .cap-mini .cap-kata')?.textContent || '' }), n0);
      k = { jahit: k.jahit || x.jahit, cap: k.cap || x.cap, tekan: Math.max(k.tekan, x.tekan), lajur: x.lajur, mini: k.mini || x.mini };
      if (i === 9) await foto(page, 'bk-kirim');
    }
    cek('kirim pesan: kartu pindah ke "Dipanggil", benang menjahit jejaknya, cap DIPANGGIL di kartu; tanpa cap besar ganda', k.lajur === 'dipanggil' && k.jahit && k.cap === 'DIPANGGIL' && k.tekan === 0 && k.mini === 'TERKIRIM', k);
    await page.waitForTimeout(2000);
    const sisa = await page.evaluate(() => document.querySelectorAll('.cap-kartu, .benang-jahit').length);
    cek('cap kartu & jahitan pudar sendiri', sisa === 0, sisa);
    await ctx.close();
  }

  /* ---- 5 · Ringkasan (Admin): tanpa panggung bertokoh; grafik tumbuh di atas benang alas ---- */
  {
    console.log('\n[Ringkasan · gerbang]');
    const { ctx, page } = await buka(browser, url, { viewport: { width: 1280, height: 860 }, peran: 'Admin' }).catch(async (e) => { throw e; });
    await page.waitForFunction(() => APP.view === 'dashboard', null, { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(1500);
    const r = await page.evaluate(() => ({ view: APP.view, pentas: window.RQPanggung && !window.RQPanggung._S && typeof window.RQPanggung.daftar === 'function',
      kanvas: document.querySelectorAll('canvas.pg-kanvas, .mj-kanvas').length,
      hias: [...document.querySelectorAll('.kerubung, #pbarMon, .mon-hinggap, .sapa-mon-jalan, .penghuni, .pg-tabir')].filter(e => getComputedStyle(e).display !== 'none' && !e.hidden).length,
      nama: document.querySelectorAll('.nama-dikerubungi').length }));
    cek('Ringkasan: penggerak data (bukan panggung.js); tanpa monster di sapaan, bilah profil, grafik, dan nama 10 besar', r.view === 'dashboard' && r.pentas && r.kanvas === 0 && r.hias === 0 && r.nama === 0, r);
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
