/* uji-v241.js — ukuran kertas A4/F4 + log cetak laporan.
 *
 * Aplikasi UTUH (app.js + index.html asli), Supabase tiruan (MOCK harness.js),
 * html2pdf.js 0.10.1 ASLI dari npm — bukan tiruan — supaya paginasi yang diuji
 * adalah paginasi yang benar-benar dipakai pengguna.
 *
 *   node uji-v241.js            (RQDIR=folder berisi app.js & index.html)
 *   RQASLI=/folder/v2.40 node uji-v241.js   → sekaligus bandingkan A4 dgn v2.40
 *
 * Pemeriksaan paginasi TIDAK memakai rumus rapikanHalamanKlon(). Posisi blok
 * diukur di salinan dokumen (sesudah dirapikan), lalu dibandingkan dengan
 * pemotong halaman html2pdf yang sebenarnya:
 *     pxPageHeight = floor(canvas.width × pageSize.inner.ratio)
 * (dibaca dari objek pekerja html2pdf setelah PDF jadi). Jadi bila rasio di
 * app.js tidak cocok dengan format jsPDF yang terpilih, uji ini gagal.
 */
const H = require('./harness.js');
const { chromium, fs, path, cek, CDN } = H;
const http = require('http');

const DIR  = process.env.RQDIR  || __dirname;
const ASLI = process.env.RQASLI || '';
const KELUAR = process.env.RQKELUAR || path.join(__dirname, 'keluaran-v241');
fs.mkdirSync(KELUAR, { recursive: true });

/* ---------- Supabase tiruan: + laporan_santri_aman, catat_cetak_laporan, log_cetak_laporan ---------- */
const MOCK = H.MOCK
  .replace("wa_log: [],", "wa_log: [], log_cetak_laporan: (window.__LOGCETAK || []),")
  .replace("if (nama === 'kehadiran_analisis') {", `if (nama === 'laporan_santri_aman') {
        const N = window.__BARIS || 14;
        const JUDUL = ['Terlambat shalat berjamaah di masjid','Tidak mengikuti halaqah subuh tanpa izin',
          'Keluar kamar setelah jam malam','Membawa telepon genggam ke asrama','Tidak memakai seragam lengkap',
          'Berbicara saat muhadharah berlangsung dan mengganggu teman di sebelahnya'];
        const perkembangan = Array.from({length:N},(_,i)=>({ poin:[5,10,15][i%3], judul:JUDUL[i%JUDUL.length],
          bidang:['Ibadah','Kedisiplinan','Akhlak'][i%3], sumber:'pelanggaran', catatan:i%4?'':'Sudah dinasihati musyrif kamar.',
          tanggal:'2026-0'+(1+Math.floor(i/28))+'-'+String(1+i%28).padStart(2,'0'), kategori:['Ringan','Sedang','Berat'][i%3], penindak:'Ust. Musyrif Satu' }));
        const pembinaan = perkembangan.slice(0, Math.ceil(N/2)).map((p,i)=>({ nisn:'UJI0000001', pembina:'Ust. Musyrif Satu', kategori:p.kategori,
          id_aturan:'A'+i, pembina_id:null, updated_at:'2026-09-01T00:00:00Z', dipicu_oleh:'otomatis', id_pembinaan:'PBN-U'+i,
          mode_pembinaan:'Individu', pengulangan_ke:1+(i%3), bentuk_pembinaan:'Nasihat dan membaca surat Yasin', status_pembinaan:'Selesai',
          catatan_pembinaan:'', diselesaikan_pada:null, tanggal_pembinaan:p.tanggal, id_log_pelanggaran:'L'+i, deskripsi_pelanggaran:p.judul }));
        const siswa = { nisn:'UJI0000001', kelas:'X-C', asrama:'Asrama Putra 1', jenjang:'MA', created_at:'2026-07-01T00:00:00Z',
          nama_siswa:'Muhammad Fadhil Uji Kertas', updated_at:'2026-09-01T00:00:00Z', nomor_kamar:12, peran_kamar:null, unit_gender:'putra',
          jenis_kelamin:'L', status_santri:'Aktif', email_orang_tua:null, no_hp_orang_tua:null, status_keberadaan:'Hadir', total_poin_pelanggaran:N*10 };
        return new Promise(r=>setTimeout(()=>r({ data:{ siswa, perkembangan, pembinaan, perizinan:[], presensi:[], rekap:[] }, error:null }),30));
      }
      if (nama === 'catat_cetak_laporan') {
        window.__CATAT = (window.__CATAT||[]).concat([arg]);
        const m = window.__CATAT_MODE || 'ok';
        if (m === 'gantung')  return new Promise(()=>{});
        if (m === 'jaringan') return Promise.reject(new TypeError('Failed to fetch'));
        if (m === 'fungsi')   return Promise.resolve({ data:null, error:{ code:'PGRST202', message:'Could not find the function public.catat_cetak_laporan' } });
        return new Promise(r=>setTimeout(()=>r({ data:(window.__CATAT.length), error:null }),30));
      }
      if (nama === 'kehadiran_analisis') {`);

function layani(dir) {
  const JENIS = { '.html':'text/html', '.js':'application/javascript', '.css':'text/css', '.webmanifest':'application/json', '.png':'image/png' };
  return http.createServer((req, res) => {
    const p = decodeURIComponent(req.url.split('?')[0]);
    const f = path.join(dir, p === '/' ? 'index.html' : p);
    if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': JENIS[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  });
}

const galat = [];
async function buka(browser, url, o = {}) {
  const ctx = await browser.newContext({ viewport: o.viewport || { width: 1280, height: 860 }, serviceWorkers: 'block',
    acceptDownloads: true, isMobile: !!o.mobile, hasTouch: !!o.mobile, reducedMotion: 'reduce' });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, async (route) => {
    const u = route.request().url();
    if (u.includes('supabase-js')) return route.fulfill({ contentType: 'application/javascript', body: MOCK });
    if (u.includes('sweetalert2')) return route.fulfill({ contentType: 'application/javascript', path: CDN + '/sweetalert2/dist/sweetalert2.all.min.js' });
    if (u.includes('chart.js'))    return route.fulfill({ contentType: 'application/javascript', path: CDN + '/chart.js/dist/chart.umd.min.js' });
    if (u.includes('html2pdf'))    return route.fulfill({ contentType: 'application/javascript', path: CDN + '/html2pdf.js/dist/html2pdf.bundle.min.js' });
    return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
  });
  const page = await ctx.newPage();
  page.on('pageerror', e => galat.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') galat.push('console: ' + m.text()); });
  await page.addInitScript((a) => {
    try { localStorage.setItem('rq-efek-pilih', 'hemat'); localStorage.setItem('rq.tur.v1.u-admin', '{"t":0}');
          if (a.kertas) localStorage.setItem('rq_kertas_laporan', a.kertas); } catch (e) {}
    if (a.peran) window.__PERAN = a.peran;
    if (a.logCetak) window.__LOGCETAK = a.logCetak;
  }, { peran: o.peran || null, logCetak: o.logCetak || null, kertas: o.kertas || null });
  await page.goto(url);
  await page.waitForFunction(() => typeof APP !== 'undefined' && APP.profil && document.querySelector('#viewRoot .stats, #viewRoot .card'), null, { timeout: 25000 });
  // Pasang pengukur: html2pdf asli dimuat dulu, lalu dibungkus agar pekerjanya bisa dibaca.
  await page.evaluate(async () => {
    await muatHtml2pdf();
    const asli = window.html2pdf;
    window.html2pdf = function () { const w = asli.apply(this, arguments); window.__pekerja = w; return w; };
    const siapkan = window.siapkanKlonPdf;
    window.siapkanKlonPdf = function (doc) {
      siapkan(doc);
      const akar = doc.querySelector('.laporan'); const a = akar.getBoundingClientRect();
      window.__ukur = {
        blok: [...akar.querySelectorAll('.blok-utuh')].map(el => { const r = el.getBoundingClientRect(); return { atas: r.top - a.top, bawah: r.bottom - a.top }; }),
        judul: [...akar.querySelectorAll('h3')].map(el => { const r = el.getBoundingClientRect(); return { teks: el.textContent.trim().slice(0, 40), atas: r.top - a.top, bawah: r.bottom - a.top }; }),
        ganjal: akar.querySelectorAll('[data-ganjal]').length, lebar: a.width, tinggi: a.height
      };
    };
  });
  return { ctx, page };
}

/** Satu unduhan PDF + pengukuran paginasi terhadap pemotong html2pdf yang sesungguhnya. */
async function unduh(page, baris, kertas, simpan) {
  await page.evaluate((n) => { window.__BARIS = n; window.__ukur = null; window.__pekerja = null; window.__CATAT = []; }, baris);
  const [dl] = await Promise.all([
    page.waitForEvent('download', { timeout: 90000 }),
    page.evaluate((k) => unduhLaporanPdf('UJI0000001', k), kertas)
  ]);
  const berkas = path.join(KELUAR, `uji-${kertas}-${baris}.pdf`);
  await dl.saveAs(berkas);
  const hasil = await page.evaluate(async () => {
    const w = window.__pekerja;
    const canvas = await w.get('canvas');
    const pdf = await w.get('pdf');
    const ps = w.prop.pageSize;
    const H = Math.floor(canvas.width * ps.inner.ratio);          // pemotong html2pdf
    const skala = _halamanPdf.skala;
    const u = window.__ukur;
    const blok = u.blok.map(b => {
      const atas = b.atas * skala, bawah = b.bawah * skala;
      const hal = Math.floor(atas / H), halBawah = Math.floor((bawah - 1) / H);
      return { utuh: hal === halBawah, hal: hal + 1, sisaBawahPx: Math.round(((hal + 1) * H - bawah) / skala), tinggi: Math.round(b.bawah - b.atas) };
    });
    // Toleransi 2 px: judul yang atasnya hanya 0,1 px di atas garis potong (sisa
    // pembulatan) sebenarnya tampil di puncak halaman berikut, bukan terbelah.
    const judulYatim = u.judul.filter(j => {
      const atas = (j.atas + 2) * skala; const hal = Math.floor(atas / H);
      return ((hal + 1) * H - j.bawah * skala) / skala < 40;       // judul tanpa ruang di bawahnya
    });
    const judulYatimRinci = judulYatim.map(j => ({ teks: j.teks, sisaPx: Math.round((Math.floor((j.atas + 2) * skala / H) + 1) * H / skala - j.bawah) }));
    return { halaman: pdf.internal.getNumberOfPages(), lebarMm: +pdf.internal.pageSize.getWidth().toFixed(2),
             tinggiMm: +pdf.internal.pageSize.getHeight().toFixed(2), margin: w.opt.margin, rasio: ps.inner.ratio,
             rasioApp: _halamanPdf.rasio, lebarPanggung: u.lebar, tinggiLaporan: Math.round(u.tinggi),
             kanvasLebar: canvas.width, H, skala, ganjal: u.ganjal, blok, judulYatim: judulYatim.length, judulYatimRinci, catat: window.__CATAT };
  });
  if (!simpan) fs.unlinkSync(berkas); else hasil.berkas = berkas;
  return hasil;
}


module.exports={buka,layani,galat,MOCK};
