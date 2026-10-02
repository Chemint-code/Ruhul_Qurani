/* render-v251.js — PANGGUNG GRAFIK · SAKURA · KUNCI BULAN · AMANAH (aplikasi utuh, Supabase tiruan).
 *   RQDIR=<repo> NODE_PATH=/tmp/cdn/node_modules RQCHROME=<chrome> node uji/render-v251.js
 *   RQVIDEO=<folder> → rekam video (desktop penuh, desktop hemat, HP hemat).
 */
const H = require('./harness.js');
const { chromium, cek, semuaGalat } = H;
const fs = require('fs'), path = require('path');
const VIDEO = process.env.RQVIDEO || '';
const WAKTU = '2026-10-20T09:00:00+07:00';      // tanggal 20: bulan berjalan sudah berisi

// Data tiruan: pelanggaran tersebar September & Oktober (1–20), pembinaan dua bulan.
const MOCK = H.MOCK
  .replace(/detail_data: Array\.from\(\{length:1250\}[^\n]+\n/, `detail_data: Array.from({length:900},(_,i)=>{ const okt = i%3!==0; const hari = okt ? 1+(i*7)%20 : 1+(i*5)%30;
      return { id_log:'L'+n(i,5), nisn:'24'+n(i%120,6), nama_siswa:'Santri '+(i%120), kelas:KELAS[(i%120)%8], tanggal:(okt?'2026-10-':'2026-09-')+n(hari,2),
        kategori:['Ringan','Sedang','Berat'][i%3], nama_pelanggaran:['Terlambat jamaah','Keluar kamar malam','Tidak berseragam','Membawa ponsel','Ribut saat halaqah'][i%5],
        judul:['Terlambat jamaah','Keluar kamar malam','Tidak berseragam','Membawa ponsel','Ribut saat halaqah'][i%5], kode_pelanggaran:'K'+(i%5),
        bidang:['Ibadah','Kedisiplinan','Akhlak','Kebersihan','Bahasa'][i%5], bobot_pelanggaran:[5,10,15][i%3], poin:[5,10,15][i%3],
        status:'Active', updated_at:new Date(Date.UTC(2026,8,2)+i*60000).toISOString() }; }),\n`)
  .replace(/log_pembinaan: Array\.from\(\{length:1100\}[^\n]+\n/, `log_pembinaan: Array.from({length:300},(_,i)=>({ id_pembinaan:'PBN'+n(i,5), nisn:'24'+n(i%120,6),
      tanggal_pembinaan:(i%2?'2026-10-':'2026-09-')+n(1+i%19,2), kategori:['Ringan','Sedang'][i%2], pengulangan_ke:1+i%3,
      bentuk_pembinaan:'Nasihat & istighfar', status_pembinaan:(i%5===0?'Selesai':'Dalam Proses'), status_record:'Active', mode_pembinaan:'Otomatis',
      id_log_pelanggaran:'L'+n(i,5), dibuat_pada:null, updated_at:'2026-10-02T00:00:00Z' })),\n`)
  .replace("total_poin_pelanggaran:i*2, updated_at:", "total_poin_pelanggaran:i*2, poin_bulan_ini:(i%7)*5, poin_bulan:'2026-10-01', updated_at:")
  .replace("if (nama === 'kehadiran_analisis') {", `if (nama === 'status_tutup_buku') {
        return new Promise(r=>setTimeout(()=>r({ data:[{ periode:'2026-09-01', ditutup_pada:'2026-10-01T18:34:20Z', berubah:false, path_arsip:'2026/09/',
          diarsipkan_pada:'2026-10-01T18:34:31Z', jml_pelanggaran:300, jml_pembinaan:150, jml_pembinaan_terbuka:120, jml_izin:20, jml_prestasi:0, jml_tahfiz:0, audit_hidup:5, audit_ditandai:0 }], error:null }),30));
      }
      if (nama === 'bulan_terkunci') {
        return new Promise(r=>setTimeout(()=>r({ data:[{ bulan:'2026-09', ditutup_pada:'2026-10-01T18:34:20Z', terkunci:true }], error:null }),30));
      }
      if (nama === 'kehadiran_analisis') {`);
if (MOCK === H.MOCK || !MOCK.includes('okt = i%3') || !MOCK.includes('bulan_terkunci') || !MOCK.includes("dibuat_pada:null")) throw new Error('MOCK tidak tersuntik');
H.MOCK = MOCK;

async function buka(browser, url, o = {}) {
  const { viewport = { width: 1280, height: 800 }, hemat = false, mobile = false, reduced = false, video = '' } = o;
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
  const page = await ctx.newPage();
  page.on('pageerror', e => semuaGalat.push('pageerror: ' + e.message + ' @ ' + String(e.stack).split('\n').slice(1, 3).join(' | ')));
  page.on('console', m => { if (m.type() === 'error') semuaGalat.push('console: ' + m.text()); });
  await page.clock.install({ time: new Date(WAKTU) });
  await page.addInitScript((a) => {
    Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 });
    try { localStorage.setItem('rq-efek-pilih', a.hemat ? 'hemat' : 'penuh'); localStorage.setItem('rq.tur.v1.u-admin', '{"t":0}');
          localStorage.setItem('rq-singgah', 'mati'); localStorage.setItem('rq_lembar_umum', '2026-10'); } catch (e) {}
    window.__PERAN = a.peran || 'Admin';
  }, { hemat, peran: o.peran });
  await page.goto(url);
  await page.waitForFunction(() => typeof APP !== 'undefined' && APP.profil && document.querySelector('#viewRoot .stats'), null, { timeout: 25000 });
  return { ctx, page };
}

/** Gulir perlahan sampai dasar halaman sambil mencatat aksi panggung. */
async function tontonPanggung(page, langkahMs = 1700) {
  const aksi = new Set();
  const catat = async () => { const j = await page.evaluate(() => window.RQPanggung && RQPanggung._S.aksi && RQPanggung._S.aksi.jenis); if (j) aksi.add(j); };
  for (let i = 0; i < 40; i++) {
    for (let k = 0; k < Math.ceil(langkahMs / 150); k++) { await catat(); await page.waitForTimeout(150); }
    const sisa = await page.evaluate(() => {
      const tahan = PGR.items.filter(it => it.status !== 'selesai');
      const dasar = scrollY + innerHeight >= document.documentElement.scrollHeight - 4;
      if (!tahan.length && dasar) return 0;
      const it = tahan.find(x => x.chart);
      const r = it ? it.chart.canvas.getBoundingClientRect() : null;
      const geser = r && r.top > innerHeight * .65 ? r.top - innerHeight * .35 : innerHeight * .45;
      window.scrollBy({ top: Math.max(120, geser), behavior: 'smooth' });
      return tahan.length + (dasar ? 0 : 1);
    });
    if (!sisa) break;
  }
  await page.waitForTimeout(1500);
  return [...aksi];
}

const RQ_PANGGUNG_N = (a) => a.dibangun;
(async () => {
  H.server.listen(0, '127.0.0.1');
  await new Promise(r => H.server.once('listening', r));
  const url = `http://127.0.0.1:${H.server.address().port}/`;
  const browser = await chromium.launch({ executablePath: process.env.RQCHROME || undefined });
  if (VIDEO) fs.mkdirSync(VIDEO, { recursive: true });

  for (const [nama, o] of [
    ['desktop penuh', { viewport: { width: 1280, height: 800 } }],
    ['desktop hemat', { viewport: { width: 1280, height: 800 }, hemat: true }],
    ['HP hemat', { viewport: { width: 390, height: 844 }, mobile: true, hemat: true }]
  ]) {
    console.log(`\n[${nama}]`);
    const dirV = VIDEO ? path.join(VIDEO, nama.replace(/\s+/g, '-')) : '';
    const { ctx, page } = await buka(browser, url, { ...o, video: dirV });
    await page.waitForTimeout(400);
    const awal = await page.evaluate(() => ({
      n: PGR.items.length,
      nol: RQ_PANGGUNG.items().every(it => it.mode === 'putar' ? it.chart.options.circumference < 1 : it.chart.data.datasets.every(d => d.data.every(v => !v))),
      tabir: document.querySelectorAll('.pg-tabir').length, dibangun: RQ_PANGGUNG.items().length,
      hujan: !!document.querySelector('.hujan-mon, .hujan-kanvas'),
      penghuni: document.querySelectorAll('#viewRoot .penghuni').length
    }));
    cek(`${nama}: grafik Ringkasan ditahan di dasar & kelabu`, awal.n >= 4 && awal.nol && awal.tabir >= RQ_PANGGUNG_N(awal), awal);
    cek(`${nama}: tanpa hujan/guguran monster & tanpa monster penghuni grafik`, !awal.hujan && awal.penghuni === 0, awal);
    await page.waitForFunction(() => window.RQPanggung && document.querySelector('.pg-kanvas'), null, { timeout: 5000 }).catch(() => {});
    const aksi = await tontonPanggung(page);
    const akhir = await page.evaluate(() => {
      const items = PGR.items;
      const utuh = items.every(it => it.mode === 'putar' ? Math.abs(it.chart.options.circumference - it.lingkar) < .01
        : it.chart.data.datasets.every((d, i) => JSON.stringify(d.data) === JSON.stringify(it.asli[i])));
      return { n: items.length, selesai: items.filter(it => it.status === 'selesai').length, utuh,
        tabir: document.querySelectorAll('.pg-tabir:not(.pudar)').length,
        tooltip: items.every(it => it.chart.options.plugins.tooltip.enabled !== false),
        sakura: !!document.querySelector('.sakura-kanvas') || (window.SAKURA && SAKURA.kelopak && SAKURA.kelopak.length > 0) || Object.keys(SAKURA.terakhir).length > 0,
        temaSakura: !!document.documentElement.dataset.sakura };
    });
    cek(`${nama}: aksi panggung — lari masuk, tarik, loncat, gelincir`, ['masuk', 'tarik', 'loncat', 'gelincir'].every(a => aksi.includes(a)) || (aksi.includes('masuk') && aksi.includes('tarik') && aksi.includes('loncat')), aksi);
    cek(`${nama}: semua grafik akhirnya utuh, berwarna, tooltip kembali`, akhir.selesai === akhir.n && akhir.utuh && akhir.tabir === 0 && akhir.tooltip, akhir);
    cek(`${nama}: kelopak sakura untuk akun putra (tanpa tema sakura)`, akhir.sakura && !akhir.temaSakura, akhir);
    await ctx.close();
  }

  /* ---- gerak dikurangi: tidak ada penahanan sama sekali ---- */
  {
    const { ctx, page } = await buka(browser, url, { reduced: true });
    await page.waitForTimeout(800);
    const r = await page.evaluate(() => ({ items: RQ_PANGGUNG.items().length, kanvas: !!document.querySelector('.pg-kanvas'), tabir: document.querySelectorAll('.pg-tabir').length }));
    cek('prefers-reduced-motion: grafik langsung utuh, panggung tidak dimuat', r.items === 0 && !r.kanvas && r.tabir === 0, r);
    await ctx.close();
  }


  /* ---- Amanah & Pembinaan ---- */
  {
    const { ctx, page } = await buka(browser, url, { viewport: { width: 1280, height: 800 } });
    const am = await page.evaluate(() => [...document.querySelectorAll('.sapa .amanah')].map(b => ({ teks: b.innerText.replace(/\s+/g, ' ').trim(), bulan: b.dataset.binaBulan || '' })));
    const eva = am.find(a => /tidak diselesaikan/.test(a.teks)), ini = am.find(a => /masih berjalan/.test(a.teks));
    cek('amanah: "Oktober masih berjalan" + "September tidak diselesaikan · bahan evaluasi"', !!eva && !!ini && eva.bulan === '2026-09' && ini.bulan === '2026-10' && /Oktober/.test(ini.teks) && /September/.test(eva.teks), am);
    await page.click('.sapa .amanah[data-bina-bulan="2026-09"]');
    await page.waitForSelector('#tbBina tr td', { timeout: 10000 });
    await page.waitForTimeout(600);
    const sep = await page.evaluate(() => ({
      pilih: $('pbBulan').value, opsi: [...$('pbBulan').options].map(o => o.text),
      baris: document.querySelectorAll('#tbBina tr').length,
      kunci: document.querySelectorAll('#tbBina tr.terkunci').length,
      tombol: document.querySelectorAll('#tbBina [data-pbn]').length,
      tag: document.querySelectorAll('#tbBina .tag-kunci').length
    }));
    cek('dari amanah evaluasi → Pembinaan September, semua baris terkunci tanpa tombol ubah', sep.pilih === '2026-09' && sep.kunci > 0 && sep.kunci === sep.baris && sep.tombol === 0 && sep.tag === sep.baris, sep);
    cek('pilihan bulan menandai September terkunci & Oktober berjalan', sep.opsi.some(t => /September 2026.*terkunci/.test(t)) && sep.opsi.some(t => /Oktober 2026.*berjalan/.test(t)) && sep.opsi.includes('Semua bulan'), sep.opsi);
    await page.evaluate(() => navigateTo('dashboard'));
    await page.waitForTimeout(500);
    await page.evaluate(() => navigateTo('pembinaan'));
    await page.waitForSelector('#tbBina tr td', { timeout: 10000 });
    await page.waitForTimeout(600);
    const okt = await page.evaluate(() => ({
      pilih: $('pbBulan').value,
      tanggal: [...document.querySelectorAll('#tbBina tr td.nowrap .secondary:first-child')].map(e => e.textContent.trim()).slice(0, 5),
      kunci: document.querySelectorAll('#tbBina tr.terkunci').length,
      tombol: document.querySelectorAll('#tbBina [data-pbn]').length,
      kpi: $('binaKpi').innerText.replace(/\s+/g, ' ').slice(0, 120)
    }));
    cek('menu Pembinaan → bawaan bulan berjalan (Oktober), bisa diselesaikan', okt.pilih === '2026-10' && okt.kunci === 0 && okt.tombol > 0 && /Oktober 2026/.test(okt.kpi), okt);
    // Tutup Buku: status kunci & tombol buka kunci
    await page.evaluate(() => navigateTo('tutupbuku'));
    await page.waitForTimeout(1200);
    const tb = await page.evaluate(() => ({ tag: document.querySelectorAll('#tbStatus .tag-kunci').length, buka: !!document.querySelector('[data-tb="bukakunci:2026-09"]') }));
    cek('Tutup Buku: September "Pembinaan terkunci" + tombol Buka kunci (Admin)', tb.tag >= 1 && tb.buka, tb);
    await ctx.close();
  }

  const galat = semuaGalat.filter(g => !/favicon|net::ERR|Failed to load resource|at gambarKinerjaGuru/.test(g));
  cek('nol galat halaman/konsol', galat.length === 0, galat.slice(0, 6));
  H.ringkas();
  await browser.close(); H.server.close();
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
