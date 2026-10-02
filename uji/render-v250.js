/* render-v250.js — LEMBAR BARU di aplikasi UTUH (Supabase tiruan harness.js).
 *   RQDIR=<repo> NODE_PATH=/tmp/cdn/node_modules node uji/render-v250.js
 */
const H = require('./harness.js');
const { chromium, cek, semuaGalat } = H;

const BULAN = new Date().toISOString().slice(0, 7);          // bulan berjalan menurut jam uji
const MOCK = H.MOCK
  // siswa: poin bulan ini berbeda dari total, supaya ketahuan mana yang tampil
  .replace("total_poin_pelanggaran:i*2, updated_at:", `total_poin_pelanggaran:i*2+100, poin_bulan_ini:(i%7)*5, poin_bulan:'${BULAN}-01', updated_at:`)
  .replace("wa_log: [],", `wa_log: [],
    rekap_bulanan_santri: Array.from({length:30},(_,i)=>({ periode:'2026-09-01', nisn:'24'+n(i,6), unit_gender:'putra', kelas:KELAS[i%8],
      plg_ringan:i%4, plg_sedang:i%2, plg_berat:0, plg_lain:0, plg_poin:(i%4)*5+(i%2)*10, pbn_total:i%3, pbn_selesai:i%2,
      izin_total:0, izin_sakit:0, izin_keperluan:0, izin_pemberitahuan:0, izin_hari:0, izin_sesuai_waktu:0, izin_telat_balik:0, izin_pending:0,
      prestasi_total:0, prestasi_emas:0, prestasi_perak:0, prestasi_perunggu:0, prestasi_poin:0, tahfiz_setoran:0, tahfiz_ziyadah_hal:0,
      tahfiz_murajaah_hal:0, tahfiz_juz_terakhir:null, tahfiz_kelancaran_terakhir:null, tahfiz_target_hal:null, disusun_pada:'2026-10-01T00:00:00Z' })),`)
  .replace("if (nama === 'kehadiran_analisis') {", `if (nama === 'status_tutup_buku') {
        return new Promise(r=>setTimeout(()=>r({ data:[{ periode:'2026-09-01', ditutup_pada:'2026-10-01T18:34:20Z', berubah:!!window.__BERUBAH,
          path_arsip:'2026/09/', diarsipkan_pada:'2026-10-01T18:34:31Z', jml_pelanggaran:1713, jml_pembinaan:1694, jml_pembinaan_terbuka:634,
          jml_izin:199, jml_prestasi:84, jml_tahfiz:50, audit_hidup:10, audit_ditandai:0 }], error:null }),30));
      }
      if (nama === 'laporan_santri_aman') {
        window.__DETAIL = (window.__DETAIL||[]).concat([arg]);
        const perkembangan = [
          { poin:10, judul:'Terlambat shalat', bidang:'Ibadah', tanggal:'2026-09-12', kategori:'Ringan', penindak:'Ust. A' },
          { poin:15, judul:'Keluar kamar malam', bidang:'Kedisiplinan', tanggal:'2026-09-20', kategori:'Sedang', penindak:'Ust. A' },
          { poin:5,  judul:'Seragam tidak lengkap', bidang:'Kedisiplinan', tanggal:'${BULAN}-01', kategori:'Ringan', penindak:'Ust. A' }];
        const siswa = { nisn:arg.p_nisn, kelas:'X-C', nama_siswa:'Santri Uji Lembar', unit_gender:'putra', status_santri:'Aktif',
          status_keberadaan:'Hadir', total_poin_pelanggaran:30, poin_bulan_ini:5, poin_bulan:'${BULAN}-01' };
        return new Promise(r=>setTimeout(()=>r({ data:{ siswa, perkembangan, pembinaan:[], perizinan:[], presensi:[], rekap:[] }, error:null }),30));
      }
      if (nama === 'kehadiran_analisis') {`);
H.MOCK = MOCK;

(async () => {
  H.server.listen(0, '127.0.0.1');
  await new Promise(r => H.server.once('listening', r));
  const url = `http://127.0.0.1:${H.server.address().port}/`;
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' }).catch(() => chromium.launch());

  // harness memakai MOCK modul; ganti rute supabase-js dengan MOCK versi ini
  const buka = async (o = {}) => {
    const r = await H.bukaHalaman(browser, url, { turSudah: true, ...o, init: "try{localStorage.setItem('rq-singgah','mati')}catch(e){};" + (o.init || '') });
    return r;
  };
  const kePage = async (page, view) => { await page.evaluate(v => navigateTo(v), view); await page.waitForTimeout(900); };

  /* ---- 1 · Admin desktop: Data Santri memakai poin bulan ini ---- */
  {
    const { ctx, page } = await buka();
    await page.waitForTimeout(2500);
    const umum = await page.evaluate(() => ({ ls: localStorage.getItem('rq_lembar_umum'), toast: document.querySelector('.swal2-toast')?.textContent || '' }));
    cek('pengumuman lembar baru tampil sekali & tercatat per bulan', umum.ls && /Lembar baru/.test(umum.toast), umum);

    await kePage(page, 'siswa');
    await page.waitForSelector('#tbSiswa tr td.num');
    const s = await page.evaluate(() => {
      const th = [...document.querySelectorAll('th')].find(t => /Poin/.test(t.textContent))?.textContent || '';
      const baris = [...document.querySelectorAll('#tbSiswa tr')].slice(0, 12).map(tr => ({ nisn: tr.cells[0].textContent.trim(), poin: Number(tr.querySelector('td.num').textContent), title: tr.querySelector('td.num').title }));
      const peta = Object.fromEntries((CACHE.siswa?.v || []).map(x => [x.nisn, x]));
      return { th, cocok: baris.every(b => b.poin === peta[b.nisn].poin_bulan_ini), contoh: baris[0], bukanTotal: baris.some(b => b.poin !== peta[b.nisn].total_poin_pelanggaran) };
    });
    cek('kepala kolom: "Poin bulan ini"', /bulan ini/.test(s.th), s.th);
    cek('sel Poin = poin_bulan_ini (bukan total)', s.cocok && s.bukanTotal, s.contoh);
    cek('title sel menyebut seluruh riwayat', /Seluruh riwayat: \d+ poin/.test(s.contoh.title), s.contoh.title);

    // rincian dari Data Santri → bawaan lembar bulan berjalan
    await page.click('#tbSiswa [data-detail]');
    await page.waitForSelector('.swal2-popup .detail-lembar');
    const d = await page.evaluate(() => ({ on: document.querySelector('.detail-lembar').classList.contains('on'), teks: document.querySelector('.detail-lembar').textContent.replace(/\s+/g, ' ').trim(), poin: document.querySelector('.poin-badge .v').textContent, pita: !!document.querySelector('.detail-arsip') }));
    cek('rincian Data Santri dibuka pada lembar bulan berjalan', d.on && d.poin === '5' && !d.pita, d);
    await page.keyboard.press('Escape'); await page.waitForTimeout(400);

    /* ---- 2 · Tutup Buku: Detail per santri ---- */
    await kePage(page, 'tutupbuku');
    await page.waitForSelector('#tbBody [data-tb-detail]');
    const n = await page.evaluate(() => ({ tombol: document.querySelectorAll('#tbBody .tb-rinci [data-tb-detail]').length, nama: document.querySelectorAll('#tbBody .tb-nama').length, kolom: document.querySelectorAll('#tbBody tr:first-child td').length, th: document.querySelectorAll('.tb-rinci').length }));
    cek('setiap baris rekap punya tombol Detail & nama bisa diklik', n.tombol === 30 && n.nama === 30 && n.kolom === 15, n);

    await page.click('#tbBody tr:first-child .tb-rinci [data-tb-detail]');
    await page.waitForSelector('.swal2-popup .detail-arsip');
    const a = await page.evaluate(() => ({ pita: document.querySelector('.detail-arsip').textContent.replace(/\s+/g, ' ').trim(), berubah: document.querySelector('.detail-arsip').classList.contains('berubah'), lembar: document.querySelector('.detail-lembar').textContent.replace(/\s+/g, ' '), poin: document.querySelector('.poin-badge .v').textContent, arg: window.__DETAIL.at(-1) }));
    cek('Detail membuka lembar September 2026 dengan pita "ditutup"', /September 2026/.test(a.pita) && /ditutup/.test(a.pita) && /September 2026/.test(a.lembar) && !a.berubah, a.pita);
    cek('poin di rincian = poin catatan September saja (10+15)', a.poin === '25', a.poin);

    // pindah ke "Seluruh riwayat" lalu kembali ke lembar September: pita tetap ada
    await page.click('.swal2-popup [data-dl="semua"]'); await page.waitForTimeout(900);
    await page.waitForSelector('.swal2-popup .detail-lembar');
    const semua = await page.evaluate(() => ({ pita: !!document.querySelector('.detail-arsip'), poin: document.querySelector('.poin-badge .v').textContent }));
    cek('seluruh riwayat: tanpa pita, poin = total tersimpan', !semua.pita && semua.poin === '30', semua);
    await page.click('.swal2-popup .cm-santri [data-dl="2026-09"]'); await page.waitForTimeout(900);
    await page.waitForSelector('.swal2-popup .detail-arsip');
    cek('kembali ke lembar September dari Cermin: pita muncul lagi', true);
    await page.keyboard.press('Escape'); await page.waitForTimeout(400);

    // klik nama juga membuka rincian
    await page.click('#tbBody tr:nth-child(2) .tb-nama');
    await page.waitForSelector('.swal2-popup .detail-arsip');
    cek('klik nama santri membuka rincian', true);
    await page.keyboard.press('Escape');
    await ctx.close();
  }

  /* ---- 3 · Bulan berubah: peringatan + Susun ulang (Admin) ---- */
  {
    const { ctx, page } = await buka({ init: 'window.__BERUBAH = true;' });
    await kePage(page, 'tutupbuku');
    await page.waitForSelector('#tbBody [data-tb-detail]');
    await page.click('#tbBody tr:first-child .tb-rinci [data-tb-detail]');
    await page.waitForSelector('.swal2-popup .detail-arsip');
    const b = await page.evaluate(() => ({ berubah: document.querySelector('.detail-arsip').classList.contains('berubah'), teks: document.querySelector('.detail-arsip').textContent, susun: !!document.querySelector('[data-arsip-susun="2026-09"]') }));
    cek('status Berubah: kalimat peringatan + tautan Susun ulang untuk Admin', b.berubah && /berubah sesudah buku ditutup/.test(b.teks) && b.susun, b);
    await ctx.close();
  }

  /* ---- 4 · Pimpinan: boleh lihat rincian, tanpa Susun ulang ---- */
  {
    const { ctx, page } = await buka({ peran: 'Pimpinan', init: 'window.__BERUBAH = true;' });
    await kePage(page, 'tutupbuku');
    await page.waitForSelector('#tbBody [data-tb-detail]');
    await page.click('#tbBody tr:first-child .tb-rinci [data-tb-detail]');
    await page.waitForSelector('.swal2-popup .detail-arsip');
    const p = await page.evaluate(() => ({ susun: !!document.querySelector('[data-arsip-susun]'), tutup: !!document.querySelector('#tbTutup') }));
    cek('Pimpinan: rincian terbuka, tanpa Susun ulang / Tutup Buku', !p.susun && !p.tutup, p);
    await ctx.close();
  }

  /* ---- 5 · HP 390 px: tombol Detail tetap terjangkau saat tabel lebar ---- */
  {
    const { ctx, page } = await buka({ viewport: { width: 390, height: 844 }, mobile: true });
    await kePage(page, 'tutupbuku');
    await page.waitForSelector('#tbBody [data-tb-detail]');
    const m = await page.evaluate(() => {
      const td = document.querySelector('#tbBody tr:first-child td.tb-rinci');
      const r = td.getBoundingClientRect();
      const wadah = td.closest('.tbl'), rw = wadah.getBoundingClientRect();
      return { posisi: getComputedStyle(td).position, kanan: Math.round(r.right), wadahKanan: Math.round(rw.right), lebarTabel: wadah.scrollWidth, lebarWadah: wadah.clientWidth, bodyLuap: document.documentElement.scrollWidth > innerWidth + 1 };
    });
    cek('390 px: tombol Detail di dalam layar tanpa digeser (lengket bila tabel lebih lebar)', m.kanan <= Math.min(390, m.wadahKanan + 1) && (m.lebarTabel <= m.lebarWadah || m.posisi === 'sticky'), m);
    cek('390 px: halaman tidak meluap ke samping', !m.bodyLuap, m);
    await page.click('#tbBody tr:first-child .tb-rinci [data-tb-detail]');
    await page.waitForSelector('.swal2-popup .detail-arsip');
    cek('390 px: rincian terbuka dari tombol Detail', true);
    await ctx.close();
  }

  // gambarKinerjaGuru: galat bawaan v2.48.1 (berpindah dari Dashboard Pimpinan sebelum panel selesai) — terbukti juga di f0adeca, bukan dari v2.50
  const galat = semuaGalat.filter(g => !/favicon|net::ERR|Failed to load resource|at gambarKinerjaGuru/.test(g));
  cek('nol galat halaman/konsol', galat.length === 0, galat.slice(0, 5));
  H.ringkas();
  await browser.close(); H.server.close();
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
