/* uji-v255.js — Ringkasan "Satu Lembar" (aplikasi UTUH, Supabase tiruan).
 *   RQDIR=<folder app.js> node uji/uji-v255.js   (BAGIAN=1,3,4 untuk sebagian)
 */
const A = require('./alat-v255.js');
const { cek, buka, tungguNav } = A;
const BAGIAN = (process.env.BAGIAN || '1,3,4').split(',');
const analisis = (page) => page.evaluate(() => (MENU_ROLE.analisis ? 'analisis' : 'dashboard'));

(async () => {
  const srv = A.layani().listen(0); await new Promise(r => srv.on('listening', r));
  const port = srv.address().port;
  const browser = await A.chromium.launch();
  try {
    /* ---------------- 1 · sapaan & jendela bulan ---------------- */
    if (BAGIAN.includes('1')) {
      console.log('1 · sapaan & jendela bulan berdata');
      const { ctx, page } = await buka(browser, port);
      cek('salamWaktu() tanpa argumen pukul 10.00 = Selamat pagi', await page.evaluate(() => salamWaktu()) === 'Selamat pagi');
      cek('bilah atas tidak lagi "Selamat malam" pukul 10.00', await page.evaluate(() => document.getElementById('pbarSalam')?.textContent) !== 'Selamat malam');
      cek('salamWaktu(20) = Selamat malam', await page.evaluate(() => salamWaktu(20)) === 'Selamat malam');
      const j = await page.evaluate(() => typeof jendelaBerdata === 'function' ? jendelaBerdata(bulanMundur('2026-10', 6)) : null);
      cek('jendelaBerdata membuang Mei–Juli', JSON.stringify(j) === JSON.stringify(['2026-08', '2026-09', '2026-10']), j);
      cek('bulanUtuh tanpa bulan berjalan', JSON.stringify(await page.evaluate(() => bulanUtuh(['2026-08', '2026-09', '2026-10']))) === '["2026-08","2026-09"]');
      cek('labelJendela memotong → "sejak Agustus 2026"', await page.evaluate(() => labelJendela(['2026-08', '2026-09', '2026-10'])) === 'sejak Agustus 2026');
      await page.evaluate(async (v) => navigateTo(v), await analisis(page)); await tungguNav(page);
      await page.waitForFunction(() => document.querySelector('#blokSebaran .sb-tbl, #blokSebaran table, #blokSebaran .card'), null, { timeout: 20000 }).catch(() => {});
      const cermin = await page.evaluate(() => [...document.querySelectorAll('.cm-tbl tbody tr td:first-child b')].map(b => b.textContent));
      cek('Cermin Muhasabah tanpa Juli/Juni/Mei', cermin.length === 3 && !cermin.some(t => /Juli|Juni|Mei/.test(t)), cermin);
      const tren = await page.evaluate(() => ({ angka: document.querySelectorAll('#blokSebaran .tren-buruk, #blokSebaran .tren-baik').length,
        belum: [...document.querySelectorAll('#blokSebaran .tren-x')].filter(e => /belum cukup/.test(e.textContent)).length }));
      cek('tren /bln tidak dihitung dari 2 bulan utuh', tren.angka === 0 && tren.belum > 0, tren);
      cek('label panel "sejak Agustus 2026"', await page.evaluate(() => /sejak Agustus 2026/.test(document.getElementById('blokSebaran')?.textContent || '')));
      await ctx.close();
    }

    /* ---------------- 3 · kabar wali & saringan Pembinaan ---------------- */
    if (BAGIAN.includes('3')) {
      console.log('3 · kabar wali & saringan Pembinaan');
      const { ctx, page } = await buka(browser, port);
      // angka acuan: hitung langsung dari bahan yang sama
      const acuan = await page.evaluate(async () => {
        const { penuh } = await bahanBinaPenuh(); const peta = await muatKabarWali();
        const per = {}; filterBinaanUnit(penuh, 'kelas').filter(r => perluKabarWaliTerbuka(r, peta))
          .forEach(r => { const b = bulanDari(kunciTgl(r.tanggal_pembinaan)); per[b] = (per[b] || 0) + 1; });
        return per;
      });
      cek('ada butir wali di Oktober & September (data uji)', acuan['2026-10'] > 0 && acuan['2026-09'] > 0, acuan);
      await page.evaluate(() => { stBina.saringBerikut = { bulan: '2026-10', status: 'terbuka', wali: 'perlu', asal: { judul: 'uji', sub: '' } }; return navigateTo('pembinaan'); });
      await tungguNav(page);
      const n10 = await page.evaluate(() => Number((document.getElementById('pbCount')?.textContent || '').split(' ')[0].replace(/\./g, '')));
      cek('saringan wali Oktober: jumlah baris = angka acuan', n10 === acuan['2026-10'], { n10, acuan: acuan['2026-10'] });
      cek('pita jembatan tampil', await page.evaluate(() => !!document.querySelector('.bina-jembatan')));
      // periode global aktif Agustus + saringBerikut September
      await page.evaluate(() => { APP.periode.aktif = true; APP.periode.bulan = '2026-08';
        stBina.saringBerikut = { bulan: '2026-09', status: 'terbuka', wali: 'perlu', asal: { judul: 'uji', sub: '' } }; return navigateTo('pembinaan'); });
      await tungguNav(page);
      const s = await page.evaluate(() => ({ bulan: document.getElementById('pbBulan')?.value, n: Number((document.getElementById('pbCount')?.textContent || '').split(' ')[0].replace(/\./g, '')) }));
      cek('periode global Agustus tidak menimpa tujuan September', s.bulan === '2026-09' && s.n === acuan['2026-09'], { s, acuan: acuan['2026-09'] });
      // Tampilkan semua → saringan dilepas
      await page.click('[data-bina-lepas]'); await page.waitForTimeout(800);
      cek('"Tampilkan semua pembinaan" melepas saringan', await page.evaluate(() => !document.querySelector('.bina-jembatan') && !stBina.wali && !stBina.asal));
      await page.evaluate(() => { APP.periode.aktif = false; APP.periode.bulan = ''; });
      // catat kabar wali
      await page.evaluate(() => { stBina.saringBerikut = { bulan: '2026-10', status: 'terbuka', wali: 'perlu', asal: { judul: 'uji', sub: '' } }; return navigateTo('pembinaan'); });
      await tungguNav(page);
      await page.evaluate(() => { window.open = () => null; });
      const id = await page.evaluate(() => document.querySelector('#tbBina [data-wa-wali]')?.dataset.waWali);
      await page.click(`#tbBina [data-wa-wali="${id}"]`);
      await page.waitForSelector('.swal2-confirm', { timeout: 8000 }); await page.click('.swal2-confirm');
      await page.waitForTimeout(1500);
      cek('RPC catat_kabar_wali dipanggil dengan id baris', await page.evaluate((id) => window.__KABAR.some(k => k.id === id), id), id);
      const n10b = await page.evaluate(() => Number((document.getElementById('pbCount')?.textContent || '').split(' ')[0].replace(/\./g, '')));
      cek('baris yang sudah dikabari keluar dari saringan "perlu"', n10b === acuan['2026-10'] - 1, { n10b });
      await page.evaluate((id) => { stBina.wali = ''; stBina.status = ''; stBina.asal = null; stBina.cari = id.toLowerCase(); return gambarBina(); }, id);
      cek('baris bertanda "Wali dikabari"', await page.evaluate((id) => /Wali dikabari/.test(document.querySelector(`#tbBina [data-wa-wali="${id}"]`)?.closest('tr')?.textContent || ''), id));
      await ctx.close();

      const h = await buka(browser, port, { rpcKabar: 'hilang' });
      await h.page.evaluate(() => navigateTo('pembinaan')); await tungguNav(h.page);
      cek('RPC kabar wali belum terpasang → Pembinaan tetap tampil', await h.page.evaluate(() => !!document.querySelector('#tbBina tr')));
      await h.ctx.close();
    }

    /* ---------------- 4 · lembar Ringkasan & Analisis ---------------- */
    if (BAGIAN.includes('4')) {
      console.log('4 · lembar Ringkasan & halaman Analisis');
      for (const mobile of [false, true]) {
        const { ctx, page } = await buka(browser, port, { mobile });
        const vpH = mobile ? 844 : 800, nama = mobile ? 'HP' : 'laptop';
        await page.waitForTimeout(1200);
        const tinggi = await page.evaluate(() => document.documentElement.scrollHeight);
        cek(`Ringkasan ${nama} ≤ ${mobile ? 3 : 1.5} layar`, tinggi <= vpH * (mobile ? 3 : 1.5), tinggi);
        const tab = await page.evaluate(() => [...document.querySelectorAll('.lembar-tab')].map(t => t.dataset.lembarTab));
        cek(`tab lembar hanya Agt/Sep/Okt (${nama})`, JSON.stringify(tab) === '["2026-08","2026-09","2026-10"]', tab);
        if (!mobile) {
          const pita = await page.evaluate(() => ({ kolom: document.querySelectorAll('.pita-hari').length, kini: document.querySelectorAll('.pita-hari.kini').length,
            kosong: [...document.querySelectorAll('.pita-hari.kosong')].map(e => e.dataset.d) }));
          cek('pita 31 hari, satu Benang Emas', pita.kolom === 31 && pita.kini === 1, pita);
          // setiap butir amanah: ketuk → jumlah baris tujuan = angka butir
          const butir = await page.evaluate(() => [...document.querySelectorAll('[data-amanah]')].map(b => ({ i: b.dataset.amanah, n: Number(b.dataset.jumlah), view: b.dataset.view })));
          cek('ada butir amanah', butir.length >= 3, butir);
          for (const b of butir) {
            await page.evaluate(() => navigateTo('dashboard')); await tungguNav(page);
            await page.click(`[data-amanah="${b.i}"]`); await tungguNav(page);
            const tampil = await page.evaluate((v) => {
              if (v === 'perizinan') return document.querySelectorAll('#izinGrid [data-izin], #izinGrid .izin-card, #izinGrid > .ic').length && Number((document.querySelector('#izinChips .chip.on')?.textContent || '').match(/\d+/)?.[0] || NaN);
              if (v === 'pembinaan') return Number((document.getElementById('pbCount')?.textContent || '').split(' ')[0].replace(/\./g, ''));
              return null;
            }, b.view);
            if (b.view === 'perizinan') {
              const n = await page.evaluate(() => ({ chip: document.querySelector('#izinChips .chip.on')?.dataset.filter, total: stIzin.filter }));
              cek(`butir ${b.i} → perizinan tersaring Pending`, n.chip === 'Pending', n);
            } else if (b.view === 'pembinaan') cek(`butir ${b.i} → ${b.n} baris di Pembinaan`, tampil === b.n, { tampil, n: b.n });
          }
        }
        await page.evaluate(() => navigateTo('analisis')); await tungguNav(page);
        await page.waitForFunction(() => document.querySelector('#blokSebaran > *'), null, { timeout: 20000 }).catch(() => {});
        const isi = await page.evaluate(() => ({ grafik: ['chPekan', 'chKategori', 'chAngkatan', 'chBidang', 'chIzin'].filter(id => document.getElementById(id)).length,
          ipp: /Indeks Peringatan/.test(document.getElementById('viewRoot').textContent), sapa: !!document.querySelector('#viewRoot .sapa') }));
        cek(`Analisis memuat grafik & IPP, tanpa sapaan (${nama})`, isi.grafik === 5 && isi.ipp && !isi.sapa, isi);
        await ctx.close();
      }
      for (const peran of ['Osis', 'Guru Piket', 'Ustadz GEN-Z']) {
        const { ctx, page } = await buka(browser, port, { peran, kelas: ['VIII-D', 'X-C'] });
        const ok = await page.evaluate(() => ({ lembar: !!document.querySelector('.lembar'), view: APP.view }));
        cek(`peran ${peran}: lembar tampil tanpa galat`, ok.lembar && ok.view === 'dashboard', ok);
        await ctx.close();
      }
    }
    /* ---------------- 5 · tepi: tanggal 1 & lembar bulan lampau ---------------- */
    if (BAGIAN.includes('5') || BAGIAN.includes('4')) {
      console.log('5 · tanggal 1 & lembar bulan lampau');
      const { ctx, page } = await buka(browser, port, { jam: '2026-10-01T08:00:00+07:00' });
      const a = await page.evaluate(() => ({ kini: document.querySelectorAll('.pita-hari.kini').length, nanti: document.querySelectorAll('.pita-hari.nanti').length,
        kalimat: document.querySelector('.lb-kalimat')?.textContent || '' }));
      cek('tanggal 1: Benang Emas di tanggal 1, 30 hari belum tiba', a.kini === 1 && a.nanti === 30, a);
      cek('tanggal 1: kalimat menyebut hari pertama', /hari pertama|Belum ada catatan/.test(a.kalimat), a.kalimat);
      await ctx.close();
      const h = await buka(browser, port);
      await h.page.click('[data-lembar-tab="2026-09"]'); await tungguNav(h.page);
      const b = await h.page.evaluate(() => ({ judul: document.querySelector('.lembar-judul h2')?.textContent, kini: document.querySelectorAll('.pita-hari.kini').length,
        aktif: document.querySelector('.lembar-tab.on')?.dataset.lembarTab, amanah: document.querySelectorAll('.lk-butir').length }));
      cek('tab September: lembar September tanpa Benang Emas, amanah tetap', b.judul === 'September 2026' && b.kini === 0 && b.aktif === '2026-09' && b.amanah > 0, b);
      await h.page.click('[data-lembar-tab="2026-10"]'); await tungguNav(h.page);
      cek('tab Oktober: kembali ke bulan berjalan, pemilih periode dilepas', await h.page.evaluate(() => !APP.periode.aktif && document.querySelector('.lembar-tab.on')?.dataset.lembarTab === '2026-10'));
      await h.ctx.close();
    }
  } catch (e) { cek('uji berjalan tanpa pengecualian', false, e.message); }
  cek('tidak ada galat halaman', A.galat.length === 0, A.galat.slice(0, 6));
  const h = A.hasil(); console.log(`${h.lulus} lulus, ${h.gagal} gagal`);
  await browser.close(); srv.close(); process.exit(h.gagal ? 1 : 0);
})();
