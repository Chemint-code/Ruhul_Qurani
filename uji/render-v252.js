/* render-v252.js — DUA MEJA: Lembar Mizan (Pimpinan) · Meja Pendampingan (BK) · Keterlibatan · gerak meja.js
 *   RQDIR=<repo> NODE_PATH=/tmp/cdn/node_modules RQCHROME=<chrome> node uji/render-v252.js
 *   RQVIDEO=<folder> → rekam video (Pimpinan desktop, Pimpinan HP hemat, BK desktop).
 *   RQSHOT=<folder>  → simpan tangkapan layar.
 */
const H = require('./harness.js');
const { chromium, cek, semuaGalat } = H;
const fs = require('fs'), path = require('path');
const VIDEO = process.env.RQVIDEO || '', SHOT = process.env.RQSHOT || '';
const HANYA = process.env.RQHANYA || '';

// Data tiruan: pencatatan dimulai 12 Agustus (seperti data live), September penuh, Oktober sedikit.
const MOCK = H.MOCK
  .replace(/detail_data: Array\.from\(\{length:1250\}[^\n]+\n/, `detail_data: Array.from({length:1400},(_,i)=>{
      const b = i < 40 ? '08' : i < 1360 ? '09' : '10';
      const hari = b === '08' ? 12 + i % 19 : b === '09' ? 1 + (i * 7) % 30 : 1 + i % 2;
      const s = i % 3 === 0 ? 1 + 8 * ((i * 5) % 15) : (i * 13) % 120;
      const ang = KELAS[s % 8].split('-')[0];
      const kat = (i % 97 === 0) ? 'Berat' : (ang === 'VIII' && i % 2) ? 'Sedang' : ['Ringan','Sedang','Ringan'][i % 3];
      return { id_log:'L'+n(i,5), nisn:'24'+n(ang === 'VIII' || i % 3 ? s : (s + 1) % 120, 6), nama_siswa:'Santri '+s, kelas:KELAS[s % 8],
        tanggal:'2026-'+b+'-'+n(hari,2), kategori:kat, nama_pelanggaran:['Terlambat jamaah','Keluar kamar malam','Tidak berseragam','Membawa ponsel','Ribut saat halaqah'][i%5],
        judul:'Uji', kode_pelanggaran:'K'+(i%5), bidang:['Ibadah','Kedisiplinan','Akhlak','Kebersihan','Bahasa'][i%5],
        bobot_pelanggaran:kat === 'Berat' ? 50 : kat === 'Sedang' ? 10 : 5, poin:5, status:'Active', updated_at:'2026-09-02T00:00:00Z' }; }),
    log_prestasi: Array.from({length:30},(_,i)=>({ id:i+1, nisn:'24'+n((i*11)%120,6), nama_siswa:'Santri '+((i*11)%120), kelas:KELAS[((i*11)%120)%8],
      tanggal:'2026-09-'+n(1+i%28,2), judul:'Apresiasi', kategori:['Emas','Perak','Perunggu'][i%3], poin:5, status:'Active' })),
    pesan_bk: [
      { id:1, utas:'240000003|u-admin|11111111-1111-1111-1111-111111111111', nisn:'24000003', nama_santri:'Santri 3', kelas:'X-C', tier:'Tier 3',
        pengirim_id:'u-admin', pengirim_nama:'Guru BK Uji', pengirim_role:'Guru BK', penerima_id:'11111111-1111-1111-1111-111111111111', penerima_nama:'Ust. Musyrif Satu', penerima_role:'Guru',
        isi:'Mohon ananda menemui BK', status:'Terkirim', dibaca_pada:null, created_at:'2026-09-29T03:00:00Z', jenis:'bk' },
      { id:2, utas:'240000011|u-admin|22222222-2222-2222-2222-222222222222', nisn:'24000011', nama_santri:'Santri 11', kelas:'XII-D', tier:'Tier 3',
        pengirim_id:'u-admin', pengirim_nama:'Guru BK Uji', pengirim_role:'Guru BK', penerima_id:'22222222-2222-2222-2222-222222222222', penerima_nama:'Ustz. Musyrifah Dua', penerima_role:'Guru',
        isi:'Mohon ananda menemui BK', status:'Dibaca', dibaca_pada:'2026-09-30T03:00:00Z', created_at:'2026-09-29T04:00:00Z', jenis:'bk' },
      { id:3, utas:'240000011|u-admin|22222222-2222-2222-2222-222222222222', nisn:'24000011', nama_santri:'Santri 11', kelas:'XII-D', tier:'Tier 3',
        pengirim_id:'22222222-2222-2222-2222-222222222222', pengirim_nama:'Ustz. Musyrifah Dua', pengirim_role:'Guru', penerima_id:'u-admin', penerima_nama:'Guru BK Uji', penerima_role:'Guru BK',
        isi:'Ananda sudah diminta ke ruang BK setelah Asar.', status:'Terkirim', dibaca_pada:null, created_at:'2026-10-01T05:00:00Z', jenis:'bk' },
      { id:4, utas:'240000019|u-admin|11111111-1111-1111-1111-111111111111', nisn:'24000019', nama_santri:'Santri 19', kelas:'XII-D', tier:'Tier 3',
        pengirim_id:'u-admin', pengirim_nama:'Guru BK Uji', pengirim_role:'Guru BK', penerima_id:'11111111-1111-1111-1111-111111111111', penerima_nama:'Ust. Musyrif Satu', penerima_role:'Guru',
        isi:'Mohon ananda menemui BK', status:'Selesai', dibaca_pada:'2026-09-26T03:00:00Z', created_at:'2026-09-25T03:00:00Z', jenis:'bk' }
    ],\n`)
  .replace(/log_pembinaan: Array\.from\(\{length:1100\}[^\n]+\n/, `log_pembinaan: Array.from({length:500},(_,i)=>({ id_pembinaan:'PBN'+n(i,5), nisn:'24'+n((i*7)%120,6),
      tanggal_pembinaan:(i%9===0?'2026-10-01':'2026-09-'+n(1+i%28,2)), kategori:['Ringan','Sedang'][i%2], pengulangan_ke:1+i%3,
      bentuk_pembinaan:'Nasihat', status_pembinaan:(i%3===0?'Dalam Proses':'Selesai'), status_record:'Active', mode_pembinaan:'Otomatis',
      id_log_pelanggaran:'L'+n(i,5), dibuat_pada:null, updated_at:'2026-10-02T00:00:00Z' })),\n`)
  .replace("insert(){ ubah='insert'; return b; }", "insert(r){ ubah='insert'; (T[tabel]=T[tabel]||[]).push(...[].concat(r).map(x=>({ id:Math.random(), created_at:new Date().toISOString(), dibaca_pada:null, jenis:'bk', ...x }))); return b; }")
  .replace("total_poin_pelanggaran:i*2, updated_at:", "total_poin_pelanggaran:i*2, poin_bulan_ini:(i%7)*5, poin_bulan:'2026-10-01', nomor_kamar:1+i%30, updated_at:")
  .replace("if (nama === 'kehadiran_analisis') {", `if (nama === 'bulan_terkunci') {
        return new Promise(r=>setTimeout(()=>r({ data:[{ bulan:'2026-09', ditutup_pada:'2026-10-01T18:34:20Z', terkunci:true }], error:null }),30));
      }
      if (nama === 'dashboard_kinerja_guru_rpc') {
        const rk = T.profiles.map((p,i)=>({ guru_id:p.id, nama:p.nama, role:p.role, kelas_binaan:p.kelas_binaan||[], aktif:true,
          total_aktivitas: i===1 ? 0 : i===2 ? 4 : 20, hari_aktif: i===1 ? 0 : 3, aktivitas_terakhir: i===1 ? null : i===2 ? '2026-09-20' : '2026-10-01' }));
        return new Promise(r=>setTimeout(()=>r({ data:{ ranking: rk, ringkasan:{} }, error:null }),30));
      }
      if (nama === 'kehadiran_analisis') {`);
if (MOCK === H.MOCK || !MOCK.includes('pesan_bk:') || !MOCK.includes('bulan_terkunci') || !MOCK.includes('nomor_kamar')) throw new Error('MOCK tidak tersuntik');
H.MOCK = MOCK;

async function buka(browser, url, o = {}) {
  const { viewport = { width: 1280, height: 800 }, hemat = false, mobile = false, reduced = false, video = '', waktu = '2026-10-02T09:00:00+07:00' } = o;
  const ctx = await browser.newContext({ viewport, serviceWorkers: 'block', reducedMotion: reduced ? 'reduce' : 'no-preference',
    isMobile: mobile, hasTouch: mobile, ...(video ? { recordVideo: { dir: video, size: viewport } } : {}) });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, async (route) => {
    const u = route.request().url();
    if (u.includes('supabase-js')) return route.fulfill({ contentType: 'application/javascript', body: MOCK });
    if (u.includes('sweetalert2')) return route.fulfill({ contentType: 'application/javascript', path: H.CDN + '/sweetalert2/dist/sweetalert2.all.min.js' });
    if (u.includes('chart.js')) return route.fulfill({ contentType: 'application/javascript', path: H.CDN + '/chart.js/dist/chart.umd.min.js' });
    if (u.includes('html2pdf')) return route.fulfill({ contentType: 'application/javascript', body: 'window.html2pdf=function(){}' });
    return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
  });
  if (o.tanpaMeja) await ctx.route(/\/meja\.js/, r => r.fulfill({ status: 404, body: '' }));
  const page = await ctx.newPage();
  page.on('pageerror', e => semuaGalat.push('pageerror: ' + e.message + ' @ ' + String(e.stack).split('\n').slice(1, 3).join(' | ')));
  page.on('console', m => { if (m.type() === 'error') semuaGalat.push('console: ' + m.text()); });
  await page.clock.install({ time: new Date(waktu) });
  await page.addInitScript((a) => {
    Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 });
    try { localStorage.setItem('rq-efek-pilih', a.hemat ? 'hemat' : 'penuh'); localStorage.setItem('rq.tur.v1.u-admin', '{"t":0}');
          localStorage.setItem('rq-singgah', 'mati'); localStorage.setItem('rq_lembar_umum', '2026-10'); } catch (e) {}
    window.__PERAN = a.peran || 'Pimpinan';
  }, { hemat, peran: o.peran });
  await page.goto(url);
  if (!mobile) await page.mouse.move(viewport.width - 40, viewport.height - 40);
  await page.waitForFunction(() => typeof APP !== 'undefined' && APP.profil && document.querySelector('#viewRoot .mz-surat, #viewRoot .mj-meja, #viewRoot .stats'), null, { timeout: 25000 });
  return { ctx, page };
}
module.exports = { buka, H };
const foto = async (page, nama, full = true) => { if (SHOT) { fs.mkdirSync(SHOT, { recursive: true }); await page.screenshot({ path: path.join(SHOT, nama + '.png'), fullPage: full }); } };

if (require.main === module) (async () => {
  H.server.listen(0, '127.0.0.1');
  await new Promise(r => H.server.once('listening', r));
  const url = `http://127.0.0.1:${H.server.address().port}/`;
  const browser = await chromium.launch({ executablePath: process.env.RQCHROME || undefined });
  if (VIDEO) fs.mkdirSync(VIDEO, { recursive: true });

  /* ---- 1 · Lembar Mizan, hari ke-2: kabar September, tanpa alarm palsu ---- */
  if (!HANYA || HANYA === 'pim') for (const [nama, o] of [
    ['Pimpinan desktop', { viewport: { width: 1280, height: 860 } }],
    ['Pimpinan HP hemat', { viewport: { width: 390, height: 844 }, mobile: true, hemat: true }]
  ]) {
    console.log(`\n[${nama}]`);
    const dirV = VIDEO ? path.join(VIDEO, nama.replace(/\s+/g, '-')) : '';
    const { ctx, page } = await buka(browser, url, { ...o, video: dirV });
    const r = await page.evaluate(() => ({
      view: APP.view, bulan: MZ.data?.bulan, vonis: document.querySelector('.mz-vonis')?.textContent.trim(),
      persen: /%/.test(document.querySelector('.mz-vonis')?.textContent || ''),
      kartuLama: document.querySelectorAll('#viewRoot .stats.six, #viewRoot .exec, #konsultanBox, #brkPrio, #kgWrap').length,
      donat: document.querySelectorAll('#viewRoot canvas').length,
      vital: document.querySelectorAll('.mz-vital').length, dec: document.querySelectorAll('.mz-dec').length,
      tangga: /Kritis|Perhatian Tinggi|Observasi/.test(document.querySelector('#viewRoot').innerText),
      ai: document.querySelectorAll('#viewRoot [data-ai]').length,
      st: document.querySelector('.mz-vital .mz-st')?.textContent.trim()
    }));
    cek(`${nama}: rumah Pimpinan = Lembar Mizan, hari 2 → kabar September`, r.view === 'pimpinan' && r.bulan === '2026-09', r);
    cek(`${nama}: vonis tanpa persen palsu ("Bulan pertama yang tercatat penuh")`, /^Bulan pertama yang tercatat penuh\./.test(r.vonis || '') && !r.persen, r.vonis);
    cek(`${nama}: blok lama hilang (6 kartu, analisis eksekutif, konsultan, prioritas, kinerja, donat, tombol AI, tangga lama)`,
      r.kartuLama === 0 && r.donat === 0 && r.ai === 0 && !r.tangga, r);
    cek(`${nama}: 3 tanda vital + 1–3 keputusan; kedisiplinan "pembanding belum ada"`, r.vital === 3 && r.dec >= 1 && r.dec <= 3 && /Pembanding/i.test(r.st || ''), r);
    if (o.mobile) { await page.waitForTimeout(1500); await page.evaluate(() => scrollBy({ top: RQ_MEJA.mizan.svg().getBoundingClientRect().top - 140, behavior: 'smooth' })); }
    await page.waitForFunction(() => window.RQMeja && document.querySelector('.mj-kanvas'), null, { timeout: 7000 }).catch(() => {});
    const awal = await page.evaluate(() => ({ tahan: !!document.querySelector('#mzKartu.mz-tahan'), sudut: Number(RQ_MEJA.mizan.svg()?.dataset.sudut), kanvas: !!document.querySelector('.mj-kanvas') }));
    cek(`${nama}: gerak meja.js dimulai (timbangan ditahan datar, kanvas aktor)`, awal.kanvas && (awal.tahan || Math.abs(awal.sudut) < 15), awal);
    const adegan = new Set();
    for (let i = 0; i < 110; i++) { const a = await page.evaluate(() => window.RQMeja && RQMeja._S.adegan); if (a) adegan.add(a); await page.waitForTimeout(150); if (i === 30) await foto(page, nama + '-tengah', false); }
    await page.waitForFunction(() => !document.querySelector('.mz-tahan') && !(window.RQMeja && RQMeja._S.adegan), null, { timeout: 9000 }).catch(() => {});
    await page.waitForTimeout(600);
    const akhir = await page.evaluate(() => {
      const svg = RQ_MEJA.mizan.svg();
      return { sudut: Number(svg.dataset.sudut), harus: RQ_MEJA.mizan.sudutAkhir(),
        nilai: [...svg.querySelectorAll('.mz-nilai')].map(t => t.textContent + '/' + t.dataset.akhir),
        sembunyi: svg.querySelectorAll('.mz-w:not(.mz-w-tampak)').length && !!document.querySelector('#mzKartu.mz-tahan'),
        tahan: document.querySelectorAll('.mz-tahan').length, kanvas: !!document.querySelector('.mj-kanvas'),
        batang: [...document.querySelectorAll('.mz-ang-tr i')].every(i => i.getBoundingClientRect().width > 0 || getComputedStyle(i).getPropertyValue('--p').trim() === '0.0%') };
    });
    cek(`${nama}: adegan meja — masuk, loncat, sihir, hujan, gelincir, sorot`, ['masuk', 'loncat', 'sihir', 'hujan', 'gelincir'].every(a => adegan.has(a)), [...adegan]);
    cek(`${nama}: akhir pertunjukan → data utuh (sudut akhir, angka asli, batang angkatan penuh)`,
      Math.abs(akhir.sudut - akhir.harus) < .05 && akhir.nilai.every(v => { const [a, b] = v.split('/'); return a.replace(/\./g, '') === b; }) && !akhir.sembunyi && akhir.tahan === 0 && akhir.batang, akhir);
    await foto(page, nama);
    // pita lembar berjalan → Oktober
    await page.click('.mz-pita');
    await page.waitForFunction(() => MZ.data && MZ.data.bulan === '2026-10' && document.querySelector('.mz-vonis'), null, { timeout: 10000 });
    const okt = await page.evaluate(() => ({ vonis: document.querySelector('.mz-vonis').textContent, ket: document.querySelector('.mz-tgl').textContent }));
    cek(`${nama}: pita → lembar Oktober berjalan`, /hari ke-2/.test(okt.ket), okt);
    await page.evaluate(() => { MZ.bulan = ''; });
    await ctx.close();
  }

  /* ---- 2 · Laci, keputusan, modal (Pimpinan) ---- */
  if (!HANYA || HANYA === 'pim') {
    const { ctx, page } = await buka(browser, url, { viewport: { width: 1280, height: 860 }, reduced: true });
    const r0 = await page.evaluate(() => ({ kanvas: !!document.querySelector('.mj-kanvas'), tahan: document.querySelectorAll('.mz-tahan').length,
      sudut: Number(RQ_MEJA.mizan.svg().dataset.sudut), harus: RQ_MEJA.mizan.sudutAkhir() }));
    cek('reduced-motion: tanpa kanvas, tanpa tahanan, timbangan langsung pada sudut akhir', !r0.kanvas && r0.tahan === 0 && r0.sudut === r0.harus, r0);
    await page.click('#mzLaci > summary');
    await page.waitForFunction(() => document.querySelector('#mzLaciIsi canvas#mzWeek') && document.querySelector('#blokSebaran .card'), null, { timeout: 15000 });
    const laci = await page.evaluate(() => ({ grafik: document.querySelectorAll('#mzLaciIsi canvas').length, ai: document.querySelectorAll('#mzLaciIsi [data-ai]').length,
      ipp: /Indeks Peringatan/.test(document.querySelector('#mzLaciIsi').innerText) }));
    cek('laci "Analisis rinci" dimuat saat dibuka (grafik + peta perkembangan), tanpa tombol AI untuk Pimpinan', laci.grafik >= 2 && laci.ai === 0 && !laci.ipp, laci);
    const dec = await page.evaluate(() => [...document.querySelectorAll('.mz-dec p')].map(p => p.firstChild.textContent.trim()));
    cek('keputusan menyebut angkatan yang menjauh dari rata-rata', dec.some(t => /^Angkatan VIII/.test(t)), dec);
    await page.click('.mz-ang.hi');
    await page.waitForSelector('.swal2-popup .tbl', { timeout: 5000 });
    const mod = await page.evaluate(() => document.querySelector('.swal2-title').textContent);
    cek('ketuk batang angkatan → rincian per kelas', /Angkatan VIII/.test(mod), mod);
    await page.keyboard.press('Escape'); await page.waitForTimeout(400);
    await page.click('[data-mz="tier"]');
    await page.waitForSelector('.swal2-popup .ipp', { timeout: 5000 });
    cek('"Lihat daftar" Tier → daftar IPP', true);
    await page.keyboard.press('Escape'); await page.waitForTimeout(400);
    await page.click('.mz-ke-kt');
    await page.waitForSelector('.kt-grid', { timeout: 10000 });
    const kt = await page.evaluate(() => ({ view: APP.view, vonis: document.querySelector('.mz-vonis').textContent, diam: document.querySelector('.kt-kel.diam em').textContent,
      medali: document.querySelectorAll('.kg-rank, .kg-skor').length }));
    cek('Keterlibatan Pencatat: tanpa peringkat, menyebut yang belum mencatat', kt.view === 'keterlibatan' && /belum mencatat/.test(kt.vonis) && kt.diam === '1' && kt.medali === 0, kt);
    await foto(page, 'keterlibatan');
    await ctx.close();
  }

  /* ---- 3 · Meja Pendampingan (Guru BK) ---- */
  if (!HANYA || HANYA === 'bk') for (const [nama, o] of [
    ['BK desktop', { viewport: { width: 1280, height: 860 } }],
    ['BK HP hemat', { viewport: { width: 390, height: 844 }, mobile: true, hemat: true }]
  ]) {
    console.log(`\n[${nama}]`);
    const dirV = VIDEO ? path.join(VIDEO, nama.replace(/\s+/g, '-')) : '';
    const { ctx, page } = await buka(browser, url, { ...o, peran: 'Guru BK', video: dirV });
    const r = await page.evaluate(() => ({
      view: APP.view, lajur: [...document.querySelectorAll('.mj-lajur')].map(l => l.dataset.lajur + ':' + l.querySelector('[data-mj-jml]').textContent),
      grafik: document.querySelectorAll('#viewRoot canvas').length, lama: document.querySelectorAll('#bkPesanWrap, .stats.six, #konsultanBox').length,
      d: [...document.querySelectorAll('.mj-lajur[data-lajur="dipanggil"] .mj-kartu')].map(k => k.dataset.mjNisn),
      dm: [...document.querySelectorAll('.mj-lajur[data-lajur="damping"] .mj-kartu, .mj-lajur[data-lajur="tuntas"] .mj-kartu')].map(k => k.dataset.mjNisn),
      kirim: [...document.querySelectorAll('.mj-lajur[data-lajur="panggil"] [data-bk-kirim]')].slice(0, 1).map(b => b.textContent.trim())
    }));
    cek(`${nama}: rumah Guru BK = Meja Pendampingan berlajur, tanpa grafik/kartu lama`, r.view === 'bk' && r.lajur.length === 4 && r.grafik === 0 && r.lama === 0, r);
    cek(`${nama}: lajur dari utas pesan_bk (terkirim → Dipanggil; diantar → Didampingi/Tuntas)`, r.d.includes('24000003') && r.d.includes('24000011') && r.dm.includes('24000019'), r);
    cek(`${nama}: tombol menyebut guru pembina`, /^Kirim pesan ke /.test(r.kirim[0] || ''), r.kirim);
    const adegan = new Set();
    for (let i = 0; i < 70; i++) { const a = await page.evaluate(() => window.RQMeja && RQMeja._S.adegan); if (a) adegan.add(a); await page.waitForTimeout(150); if (i === 18) await foto(page, nama + '-tengah', false); }
    await page.waitForFunction(() => !document.querySelector('.mj-tahan') && !(window.RQMeja && RQMeja._S.adegan), null, { timeout: 9000 }).catch(() => {});
    const ak = await page.evaluate(() => ({ tahan: !!document.querySelector('.mj-tahan'), sembunyi: [...document.querySelectorAll('.mj-kartu')].filter(k => getComputedStyle(k).opacity < .8).length }));
    cek(`${nama}: gerak meja BK — masuk, ketuk lajur, pesawat; semua kartu tampil di akhir`, ['masuk', 'ketuk'].every(a => adegan.has(a)) && !ak.tahan && ak.sembunyi === 0, { adegan: [...adegan], ...ak });
    await foto(page, nama);
    if (nama === 'BK desktop') {
      // kirim pesan → kartu pindah ke "Dipanggil" (FLIP + kurir)
      const n0 = await page.evaluate(() => document.querySelector('.mj-lajur[data-lajur="panggil"] [data-bk-kirim]').dataset.bkKirim);
      await page.mouse.move(1200, 700);
      await page.evaluate((n) => document.querySelector(`.mj-lajur[data-lajur="panggil"] [data-bk-kirim="${n}"]`).click(), n0);
      await page.waitForSelector('#pbIsi', { timeout: 6000 });
      const isi = await page.evaluate(() => $('pbIsi').value);
      cek('naskah pesan memakai alasan IPP (Tier & sebab), bukan 90 hari', /Tier 3 pada Indeks Peringatan Pembinaan/.test(isi) && !/90 hari/.test(isi), isi.slice(0, 220));
      await page.click('.swal2-confirm');
      let kur = {};
      for (let i = 0; i < 20; i++) {
        await page.waitForTimeout(150);
        const k = await page.evaluate((n) => ({ adegan: window.RQMeja && RQMeja._S.adeganTerakhir, toast: document.querySelector('.swal2-toast')?.textContent || '',
          lajur: document.querySelector(`.mj-kartu[data-mj-nisn="${n}"]`)?.closest('.mj-lajur')?.dataset.lajur }), n0);
        kur = { ...kur, ...k, toast: kur.toast || k.toast, adegan: k.adegan === 'antar' ? 'antar' : (kur.adegan || k.adegan) };
      }
      cek('kirim pesan → kartu pindah ke "Dipanggil", Si Peci mengantar', kur.lajur === 'dipanggil' && kur.adegan === 'antar', kur);
    }
    await ctx.close();
  }

  const galat = semuaGalat.filter(g => !/favicon|net::ERR|Failed to load resource|at gambarKinerjaGuru/.test(g));
  cek('nol galat halaman/konsol', galat.length === 0, galat.slice(0, 8));
  H.ringkas();
  await browser.close(); H.server.close();
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
