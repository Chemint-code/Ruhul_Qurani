/* uji-v246.js — Catat Kilat dan Lasso (aplikasi UTUH, Supabase tiruan).
 *   RQDIR=<app> [RQBAGIAN=1,2] node uji-v246.js */
const H = require('./harness.js');
const D = require('./dasar-uji.js');
const { chromium, path, fs, CDN } = H;
const DIR = process.env.RQDIR || path.join(process.env.HOME, 'Ruhul_Qurani');
const KELUAR = path.join(__dirname, 'keluaran-v246'); fs.mkdirSync(KELUAR, { recursive: true });
const KINI = '2026-09-28T09:00:00+07:00';

function ganti(s, a, b) { if (!s.includes(a)) throw new Error('MOCK: pola tidak ditemukan: ' + a.slice(0, 50)); return s.replace(a, b); }
let MOCK = H.MOCK;
MOCK = ganti(MOCK, "const f=[]; let urut=[]", "const f=[]; let isi=null; let urut=[]");
MOCK = ganti(MOCK, "insert(){ ubah='insert'; return b; }", "insert(v){ ubah='insert'; isi=v; return b; }");
MOCK = ganti(MOCK, 'then(ok,gagal){', `then(ok,gagal){
        if ((window.__GAGAL||[]).includes(tabel)) return new Promise(r=>setTimeout(()=>r({ data:null, error:{ message:'uji: '+tabel+' gagal' }, count:null }),JEDA)).then(ok,gagal);
        if (ubah === 'insert') {
          if (isi && (window.__GAGAL_NISN||[]).includes(String(isi.nisn))) return new Promise(r=>setTimeout(()=>r({ data:null, error:{ message:'Ditolak: uji '+isi.nisn }, count:null }),JEDA)).then(ok,gagal);
          (window.__SISIP = window.__SISIP || []).push({ tabel, isi });
        }`);
MOCK = ganti(MOCK, "wa_log: [],", `wa_log: [],
    master_pelanggaran: [
      { kode_pelanggaran:'P01', nama_pelanggaran:'Terlambat jamaah', kategori:'Ringan', bobot_poin:5,  bidang:'Ibadah', sumber:'Pengasuhan', jenjang:'Semua', unit_gender:'putra' },
      { kode_pelanggaran:'P02', nama_pelanggaran:'Tidak ikut halaqah', kategori:'Sedang', bobot_poin:10, bidang:'Ibadah', sumber:'Pengasuhan', jenjang:'Semua', unit_gender:'putra' },
      { kode_pelanggaran:'P03', nama_pelanggaran:'Keluar kamar malam', kategori:'Berat', bobot_poin:15, bidang:'Keamanan', sumber:'Pengasuhan', jenjang:'Semua', unit_gender:'putra' },
      { kode_pelanggaran:'P04', nama_pelanggaran:'Seragam tidak lengkap', kategori:'Ringan', bobot_poin:5, bidang:'Atribut', sumber:'Madrasah', jenjang:'MTs', unit_gender:'putra' },
      { kode_pelanggaran:'P05', nama_pelanggaran:'Bolos pelajaran', kategori:'Sedang', bobot_poin:10, bidang:'Kedisiplinan', sumber:'Madrasah', jenjang:'MA', unit_gender:'putra' },
      { kode_pelanggaran:'P06', nama_pelanggaran:'Terlambat jamaah', kategori:'Ringan', bobot_poin:5, bidang:'Ibadah', sumber:'Pengasuhan', jenjang:'Semua', unit_gender:'putri' },
      { kode_pelanggaran:'P07', nama_pelanggaran:'Membawa HP', kategori:'Berat', bobot_poin:20, bidang:'Keamanan', sumber:'Pengasuhan', jenjang:'Semua', unit_gender:'putri' },
      { kode_pelanggaran:'P08', nama_pelanggaran:'Rambut tidak rapi', kategori:'Ringan', bobot_poin:5, bidang:'Kebersihan', sumber:'Pengasuhan', jenjang:'Semua', unit_gender:'putra' }
    ],
    master_prestasi: [
      { kode_prestasi:'A01', nama_prestasi:'Adzan subuh', kategori:'Perunggu', bobot_poin:5, bidang:'Ibadah', aktif:true },
      { kode_prestasi:'A02', nama_prestasi:'Bantu teman', kategori:'Perunggu', bobot_poin:5, bidang:'Akhlak', aktif:true },
      { kode_prestasi:'A03', nama_prestasi:'Juara lomba', kategori:'Emas', bobot_poin:20, bidang:'Prestasi', aktif:true }
    ],`);
MOCK = ganti(MOCK, "if (nama === 'kehadiran_analisis') {", `if (nama === 'catat_pelanggaran') {
        window.__RPC_PLG = (window.__RPC_PLG||[]).concat([arg]);
        const m = window.__PLG_MODE || 'ok';
        if (m === 'jaringan') return Promise.reject(new TypeError('Failed to fetch'));
        if (m === 'galat') return new Promise(r=>setTimeout(()=>r({ data:null, error:{ message:'Ditolak: uji server' } }),JEDA));
        if (m === 'konflik' && !arg.p_force) return new Promise(r=>setTimeout(()=>r({ data:{ conflict:true, message:'Santri sedang izin (uji).' }, error:null }),JEDA));
        return new Promise(r=>setTimeout(()=>r({ data:{ poin_baru: 25 }, error:null }),JEDA));
      }
      if (nama === 'kehadiran_analisis') {`);

let lulus = 0, gagal = 0;
const cek = (j, ok, info) => { ok ? lulus++ : gagal++; console.log(`${ok ? '  ok  ' : ' GAGAL'} ${j}${info !== undefined ? '  · ' + JSON.stringify(info) : ''}`); };
const BAGIAN = (process.env.RQBAGIAN || '').split(',').filter(Boolean);
const jalan = (n) => !BAGIAN.length || BAGIAN.includes(String(n));
const NISN = '24000041';   // Santri 41: VIII-D, putra, jenjang MA, tier 2 pada data tiruan

(async () => {
  const srv = D.layani(DIR).listen(0);
  const URL = `http://127.0.0.1:${srv.address().port}/`;
  const browser = await chromium.launch({ executablePath: process.env.RQCHROME || undefined });
  const galat = [];
  async function buka(url, peran, o = {}) {
    const ctx = await browser.newContext({ viewport: o.viewport || { width: 1366, height: 860 }, serviceWorkers: 'block',
      reducedMotion: o.gerak ? 'no-preference' : 'reduce', isMobile: !!o.mobile, hasTouch: !!o.mobile });
    await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, async (route) => {
      const u = route.request().url();
      if (u.includes('supabase-js')) return route.fulfill({ contentType: 'application/javascript', body: MOCK });
      if (u.includes('sweetalert2')) return route.fulfill({ contentType: 'application/javascript', path: CDN + '/sweetalert2/dist/sweetalert2.all.min.js' });
      if (u.includes('chart.js'))    return route.fulfill({ contentType: 'application/javascript', path: CDN + '/chart.js/dist/chart.umd.min.js' });
      if (u.includes('html2pdf'))    return route.fulfill({ contentType: 'application/javascript', path: CDN + '/html2pdf.js/dist/html2pdf.bundle.min.js' });
      return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
    });
    const page = await ctx.newPage();
    // Jam digeser ke KINI tetapi tetap berjalan; pewaktu tidak disentuh (lihat uji-v245).
    await page.addInitScript((t) => { const Asli = Date, geser = t - Asli.now();
      class DateGeser extends Asli { constructor(...a) { super(...(a.length ? a : [Asli.now() + geser])); } static now() { return Asli.now() + geser; } }
      window.Date = DateGeser; }, new Date(KINI).getTime());
    page.on('pageerror', e => galat.push(peran + ' pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') galat.push(peran + ' console: ' + m.text()); });
    await page.addInitScript((a) => {
      Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 });
      try { localStorage.setItem('rq-efek-pilih', a.gerak ? 'penuh' : 'hemat'); localStorage.setItem('rq.tur.v1.u-admin', '{"t":0}'); } catch (e) {}
      window.__PERAN = a.peran; if (a.kelas) window.__KELAS = a.kelas; if (a.gagal) window.__GAGAL = a.gagal;
    }, { peran, kelas: o.kelas || null, gagal: o.gagal || null, gerak: !!o.gerak });
    if (o.init) await page.addInitScript(o.init);
    await page.goto(url);
    await page.waitForFunction(() => typeof APP !== 'undefined' && APP.profil && document.querySelector('#viewRoot .stats, #viewRoot .card'), null, { timeout: 25000 });
    return { ctx, page };
  }
  const jeda = (p, ms = 800) => p.waitForTimeout(ms);
  const klik = (p, sel) => p.$eval(sel, el => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })));
  const bukaRadar = async (p) => { await p.evaluate(() => navigateTo('radar')); await p.waitForSelector('.radar-layar .radar-svg', { timeout: 20000 }); };
  const bukaLembar = async (p, nisn) => { await klik(p, `#radarDaftar .radar-baris[data-nisn="${nisn}"]`); await p.waitForSelector(`.radar-lembar[data-nisn="${nisn}"]`); };
  const swalYa = async (p) => { await p.waitForSelector('.swal2-confirm', { state: 'visible', timeout: 10000 }); await klik(p, '.swal2-confirm'); };
  const rpc = (p) => p.evaluate(() => (window.__RPC_PLG || []).length);

  if (jalan(1)) {
    console.log('\n[1] simpanPelanggaranAman');
    const { ctx, page } = await buka(URL, 'Admin');
    const P = { p_nisn: NISN, p_kode: 'P01', p_tanggal: '2026-09-28', p_catatan: '' };
    const a = await page.evaluate(async (P) => { window.__RPC_PLG = []; const h = await simpanPelanggaranAman(P, { lewatiDuplikat: true }); return { h, n: window.__RPC_PLG.length }; }, P);
    cek('ok → { ok:true, data } dan tepat satu RPC', a.h.ok === true && a.h.data.poin_baru === 25 && a.n === 1, a);
    await page.evaluate((P) => { window.__RPC_PLG = []; window.__PLG_MODE = 'konflik'; window.__h = simpanPelanggaranAman(P, { lewatiDuplikat: true }); }, P);
    await swalYa(page);
    const b = await page.evaluate(async () => { const h = await window.__h; return { h, force: window.__RPC_PLG.map(x => !!x.p_force) }; });
    cek('Konflik izin + setuju → kirim ulang dengan p_force', b.h.ok && JSON.stringify(b.force) === '[false,true]', b);
    await page.evaluate((P) => { window.__RPC_PLG = []; window.__h = simpanPelanggaranAman(P, { lewatiDuplikat: true }); }, P);
    await page.waitForSelector('.swal2-cancel', { state: 'visible' }); await klik(page, '.swal2-cancel');
    const c = await page.evaluate(async () => { const h = await window.__h; return { h, n: window.__RPC_PLG.length }; });
    cek('Konflik izin + batal → { batal:true }, satu RPC saja', c.h.batal === true && c.n === 1, c);
    const d = await page.evaluate(async (P) => { window.__PLG_MODE = 'jaringan'; const h = await simpanPelanggaranAman(P, { lewatiDuplikat: true }); return { ok: h.ok, pesan: String(h.galat?.message || '') }; }, P);
    cek('Jaringan putus → { ok:false, galat }', d.ok === false && /fetch/i.test(d.pesan), d);
    const e = await page.evaluate(async (P) => { window.__PLG_MODE = 'ok'; window.__RPC_PLG = []; cariDuplikatPelanggaran = async () => null;
      const data = await mdSimpanPelanggaran(P, null, 'Menyimpan…'); return { data, n: window.__RPC_PLG.length }; }, P);
    cek('Regresi: mdSimpanPelanggaran memakai jalur bersama (satu RPC, data dikembalikan)', e.data?.poin_baru === 25 && e.n === 1, e);
    await ctx.close();
  }

  if (jalan(2)) {
    console.log('\n[2] Pemilihan butir');
    const { ctx, page } = await buka(URL, 'Admin');
    const r = await page.evaluate(() => {
      const M = [
        { kode_pelanggaran:'P01', nama_pelanggaran:'Terlambat jamaah', sumber:'Pengasuhan', jenjang:'Semua', unit_gender:'putra' },
        { kode_pelanggaran:'P02', nama_pelanggaran:'Tidak ikut halaqah', sumber:'Pengasuhan', jenjang:'Semua', unit_gender:'putra' },
        { kode_pelanggaran:'P04', nama_pelanggaran:'Seragam tidak lengkap', sumber:'Madrasah', jenjang:'MTs', unit_gender:'putra' },
        { kode_pelanggaran:'P05', nama_pelanggaran:'Bolos pelajaran', sumber:'Madrasah', jenjang:'MA', unit_gender:'putra' },
        { kode_pelanggaran:'P06', nama_pelanggaran:'Terlambat jamaah', sumber:'Pengasuhan', jenjang:'Semua', unit_gender:'putri' },
        { kode_pelanggaran:'P07', nama_pelanggaran:'Membawa HP', sumber:'Pengasuhan', jenjang:'Semua', unit_gender:'putri' } ];
      const Pr = [{ kode_prestasi:'A01', aktif:true }, { kode_prestasi:'A09', aktif:false }];
      const kode = (a) => a.map(m => m.kode_pelanggaran).join(',');
      const putraMA = { nisn:'1', kelas:'X-C', jenjang:'MA', unit_gender:'putra' };
      const putriMTs = { nisn:'2', kelas:'VII-A', jenjang:'', unit_gender:'putri' };
      return {
        semuaMA: kode(kandidatKilat(putraMA, M, Pr, 'Semua').plg),
        pengasuhan: kode(kandidatKilat(putraMA, M, Pr, 'Pengasuhan').plg),
        putri: kode(kandidatKilat(putriMTs, M, Pr, 'Semua').plg),
        prs: kandidatKilat(putraMA, M, Pr, 'Semua').prs.map(m => m.kode_prestasi).join(','),
        jenjangDariKelas: jenjangSantri({ kelas:'VIII-D', jenjang:'' }) + '/' + jenjangSantri({ kelas:'XI-C' }),
        urutRiwayat: urutKilat(M, 'kode_pelanggaran', { P02:{ n:3, t:1 }, P05:{ n:3, t:9 }, P01:{ n:1, t:5 } }, {}, 4).map(m => m.kode_pelanggaran).join(','),
        urutFrek: urutKilat(M, 'kode_pelanggaran', { P07:{ n:1, t:1 } }, { P04:7, P07:9, P01:2 }, 4).map(m => m.kode_pelanggaran).join(','),
        urutKatalog: urutKilat(M, 'kode_pelanggaran', {}, {}, 3).map(m => m.kode_pelanggaran).join(','),
        urutSedikit: urutKilat(M.slice(0, 2), 'kode_pelanggaran', {}, {}, 4).length
      };
    });
    cek('Santri putra MA, Semua Unit: P01,P02,P05 (tanpa P04 khusus MTs, tanpa katalog putri)', r.semuaMA === 'P01,P02,P05', r.semuaMA);
    cek('Unit aktif Pengasuhan: hanya P01,P02', r.pengasuhan === 'P01,P02', r.pengasuhan);
    cek('Santri putri MTs: katalog putri + butir putra yang namanya tidak dimiliki putri', r.putri === 'P02,P04,P06,P07', r.putri);
    cek('Apresiasi nonaktif tidak ikut', r.prs === 'A01', r.prs);
    cek('Jenjang dari kelas bila kolom jenjang kosong', r.jenjangDariKelas === 'MTs/MA', r.jenjangDariKelas);
    cek('Urutan riwayat: jumlah lalu waktu terakhir', r.urutRiwayat === 'P05,P02,P01,P04', r.urutRiwayat);
    cek('Riwayat pendek diisi frekuensi lingkup tanpa duplikat, lalu katalog', r.urutFrek === 'P07,P04,P01,P02', r.urutFrek);
    cek('Tanpa riwayat dan frekuensi → urutan katalog; butir sedikit → tombol sedikit', r.urutKatalog === 'P01,P02,P04' && r.urutSedikit === 2, r);
    const rw = await page.evaluate(() => { localStorage.removeItem('rq.kilat.v1.' + idSaya());
      catatRiwayatKilat('plg', 'P01', 100); catatRiwayatKilat('plg', 'P01', 200); catatRiwayatKilat('prs', 'A01', 300);
      const a = bacaRiwayatKilat();
      const f = frekuensiKilat({ detail6: [{ kode_pelanggaran:'P01', tanggal:'2026-09-20' }, { kode_pelanggaran:'P01', tanggal:'2026-06-01' }, { kode_pelanggaran:'P02', tanggal:'2026-09-01' }],
        prestasi: [{ kode_prestasi:'A01', tanggal:'2026-09-27' }] }, new Date(2026, 8, 28));
      const asli = Storage.prototype.getItem; Storage.prototype.getItem = () => { throw new Error('diblokir'); };
      const b = bacaRiwayatKilat(); Storage.prototype.getItem = asli;
      return { a, f, b };
    });
    cek('Riwayat: n dan t terakhir tersimpan per jenis', rw.a.plg.P01.n === 2 && rw.a.plg.P01.t === 200 && rw.a.prs.A01.n === 1, rw.a);
    cek('Frekuensi lingkup 60 hari (catatan Juni tidak dihitung)', JSON.stringify(rw.f) === '{"plg":{"P01":1,"P02":1},"prs":{"A01":1}}', rw.f);
    cek('localStorage terblokir → riwayat kosong, tanpa galat', JSON.stringify(rw.b) === '{"plg":{},"prs":{}}', rw.b);
    await ctx.close();
  }

  if (jalan(3)) {
    console.log('\n[3] Tombol cepat');
    { const { ctx, page } = await buka(URL, 'Admin');
      await bukaRadar(page); await bukaLembar(page, NISN);
      const r = await page.evaluate(() => { const l = document.querySelector('.radar-lembar');
        return { plg: [...l.querySelectorAll('[data-kilat="plg"]')].map(b => b.dataset.kode).join(','),
          prs: [...l.querySelectorAll('[data-kilat="prs"]')].map(b => b.dataset.kode).join(','),
          lainnya: !!l.querySelector('[data-kilat-lainnya]'), nonaktif: l.querySelectorAll('[data-kilat]:disabled').length }; });
      cek('Lembar: 4 pelanggaran cocok (putra MA, Semua Unit) + 2 apresiasi + Lainnya…', r.plg === 'P01,P02,P03,P05' && r.prs === 'A01,A02' && r.lainnya && r.nonaktif === 0, r);
      await page.evaluate(() => { window.__prefill = null; const asli = modalCatatPelanggaran; modalCatatPelanggaran = (p) => { window.__prefill = p; }; window.__pulih = () => { modalCatatPelanggaran = asli; }; });
      await klik(page, '[data-kilat-lainnya]');
      const pf = await page.evaluate(() => { window.__pulih(); return window.__prefill; });
      cek('Lainnya… → formulir lengkap dengan santri terisi', pf?.nisn === '24000041' && /Santri 41/.test(pf?.labelSantri || ''), pf);
      await ctx.setOffline(true);
      await bukaRadar(page); await bukaLembar(page, NISN);
      const off = await page.evaluate(() => ({ plgNonaktif: [...document.querySelectorAll('.radar-lembar [data-kilat="plg"]')].every(b => b.disabled),
        prsAktif: [...document.querySelectorAll('.radar-lembar [data-kilat="prs"]')].every(b => !b.disabled),
        teks: document.querySelector('.radar-lembar .kilat').innerText }));
      cek('Luring: tombol pelanggaran nonaktif ("Perlu koneksi"), apresiasi aktif', off.plgNonaktif && off.prsAktif && off.teks.includes('perlu koneksi'), off);
      await ctx.close(); }
    { const { ctx, page } = await buka(URL, 'Admin', { init: () => { const asli = Storage.prototype.getItem;
        Storage.prototype.getItem = function (k) { if (String(k).startsWith('rq.kilat.')) throw new Error('diblokir'); return asli.apply(this, arguments); }; } });
      await bukaRadar(page); await bukaLembar(page, NISN);
      cek('localStorage terblokir → tombol cepat tetap muncul', await page.evaluate(() => document.querySelectorAll('.radar-lembar [data-kilat]').length === 6));
      const kosongKat = await page.evaluate(() => { const asli = RADAR.data.master; RADAR.data.master = { plg: [], prs: [] };
        const h = htmlKilat('24000041'); RADAR.data.master = asli; return h; });
      cek('Tanpa butir yang cocok → "Belum ada jenis yang cocok" + Lainnya…', kosongKat.includes('Belum ada jenis yang cocok untuk santri ini.') && kosongKat.includes('data-kilat-lainnya'));
      // hanyaBaca adalah const; gerbang yang sama (bolehKilatPlg/Prs) diuji lewat HAK.
      await page.evaluate(() => { HAK['plg.catat'] = []; HAK['prestasi.catat'] = []; }); await bukaRadar(page); await bukaLembar(page, NISN);
      cek('Tanpa izin catat (gerbang yang sama dengan hanyaBaca) → tanpa bagian Catat Kilat', await page.evaluate(() => !document.querySelector('.radar-lembar .kilat')));
      await ctx.close(); }
  }

  if (jalan(4)) {
    console.log('\n[4] Hitung mundur dan kirim');
    const siapkan = async (o = {}) => { const b = await buka(URL, 'Admin', o); await bukaRadar(b.page); await bukaLembar(b.page, NISN);
      await b.page.evaluate(() => { window.__RPC_PLG = []; window.__SISIP = []; localStorage.removeItem('rq.kilat.v1.' + idSaya()); }); return b; };
    { const { ctx, page } = await siapkan();
      await klik(page, '.radar-lembar [data-kilat="plg"][data-kode="P01"]');
      await page.waitForSelector('#kilatBilah');
      const awal = await page.evaluate(() => ({ teks: $('kilatBilah').innerText, live: $('kilatBilah').getAttribute('aria-live'), n: (window.__RPC_PLG || []).length }));
      cek('Bilah hitung mundur tampil, aria-live, belum ada RPC', /Mencatat "Terlambat jamaah" untuk Santri 41/.test(awal.teks) && /Urungkan \(5\)/.test(awal.teks) && awal.live === 'polite' && awal.n === 0, awal);
      await jeda(page, 2200);
      cek('Angka turun tiap detik', await page.evaluate(() => /Urungkan \([23]\)/.test($('kilatBilah').innerText)));
      await page.evaluate(() => navigateTo('radar'));   // penyegaran otomatis di tengah hitung mundur (Review Focus 1)
      await jeda(page, 4000);
      const r = await page.evaluate(() => ({ rpc: window.__RPC_PLG, bilah: !!$('kilatBilah'),
        riwayat: JSON.parse(localStorage.getItem('rq.kilat.v1.' + idSaya()) || '{}'), lembar: !!document.querySelector('.radar-lembar[data-nisn="24000041"]') }));
      cek('Setelah 5 detik: tepat satu RPC dengan payload benar (walau Radar disegarkan)', r.rpc.length === 1 && r.rpc[0].p_nisn === '24000041' && r.rpc[0].p_kode === 'P01' && r.rpc[0].p_tanggal === '2026-09-28' && r.rpc[0].p_catatan === '', r.rpc);
      cek('Riwayat +1, bilah hilang, lembar titik tetap terbuka', r.riwayat.plg?.P01?.n === 1 && !r.bilah && r.lembar, r);
      await ctx.close(); }
    { const { ctx, page } = await siapkan();
      await klik(page, '.radar-lembar [data-kilat="plg"][data-kode="P02"]'); await page.waitForSelector('#kilatBilah');
      await klik(page, '#kilatBilah [data-kilat-urung]'); await jeda(page, 6000);
      cek('Urungkan → nol RPC, bilah hilang', await rpc(page) === 0 && await page.evaluate(() => !$('kilatBilah')));
      await klik(page, '.radar-lembar [data-kilat="plg"][data-kode="P02"]'); await page.waitForSelector('#kilatBilah');
      await page.keyboard.press('Escape'); await jeda(page, 6000);
      cek('Escape → nol RPC', await rpc(page) === 0);
      await ctx.close(); }
    { const { ctx, page } = await siapkan();
      await page.evaluate(() => { cariDuplikatPelanggaran = async () => ({ tanggal: '2026-09-28', nama_pelanggaran: 'Terlambat jamaah', penindak: 'Ust. Uji' }); });
      await klik(page, '.radar-lembar [data-kilat="plg"][data-kode="P01"]');
      await page.waitForSelector('.swal2-cancel', { state: 'visible' }); await klik(page, '.swal2-cancel'); await jeda(page, 6000);
      cek('Duplikat → dialog; batal → tanpa hitung mundur, tanpa RPC', await rpc(page) === 0 && await page.evaluate(() => !$('kilatBilah')));
      await ctx.close(); }
    { const { ctx, page } = await siapkan();
      await page.evaluate(() => { window.__PLG_MODE = 'konflik'; });
      await klik(page, '.radar-lembar [data-kilat="plg"][data-kode="P01"]'); await jeda(page, 5600);
      await swalYa(page); await jeda(page, 1500);
      cek('Konflik izin → konfirmasi → dikirim ulang dengan p_force', await page.evaluate(() => JSON.stringify(window.__RPC_PLG.map(x => !!x.p_force)) === '[false,true]'));
      await ctx.close(); }
    { const { ctx, page } = await siapkan();
      await klik(page, '.radar-lembar [data-kilat="plg"][data-kode="P01"]'); await page.waitForSelector('#kilatBilah');
      await klik(page, '.radar-lembar [data-kilat="plg"][data-kode="P01"]'); await jeda(page, 300);   // ketuk ulang tombol sama → kembali ke 5
      cek('Ketuk ulang tombol yang sama → hitung mundur kembali ke 5, satu hitung mundur', await page.evaluate(() => /Urungkan \(5\)/.test($('kilatBilah').innerText)) && await rpc(page) === 0);
      await jeda(page, 1200);
      await klik(page, '.radar-lembar [data-kilat="plg"][data-kode="P02"]'); await jeda(page, 800);
      const r1 = await page.evaluate(() => window.__RPC_PLG.map(x => x.p_kode));
      await jeda(page, 5500);
      const r2 = await page.evaluate(() => window.__RPC_PLG.map(x => x.p_kode));
      cek('Ketuk tombol lain → yang pertama segera terkirim, lalu yang kedua setelah hitung mundur', JSON.stringify(r1) === '["P01"]' && JSON.stringify(r2) === '["P01","P02"]', [r1, r2]);
      await ctx.close(); }
    { const { ctx, page } = await siapkan();
      await page.evaluate(() => { const asli = cariDuplikatPelanggaran; cariDuplikatPelanggaran = async (...a) => { await new Promise(r => setTimeout(r, 600)); return asli(...a); }; });
      await klik(page, '.radar-lembar [data-kilat="plg"][data-kode="P03"]'); await klik(page, '.radar-lembar [data-kilat="plg"][data-kode="P03"]');   // Review Focus 2
      await jeda(page, 7000);
      cek('Ketukan ganda cepat saat cek duplikat → tepat satu RPC', await rpc(page) === 1, await rpc(page));
      await klik(page, '.radar-lembar [data-kilat="plg"][data-kode="P01"]'); await page.waitForSelector('#kilatBilah');
      await page.evaluate(() => navigateTo('siswa')); await jeda(page, 1200);
      cek('Pindah ke halaman lain saat hitung mundur → segera terkirim', await rpc(page) === 2);
      await bukaRadar(page); await bukaLembar(page, NISN);
      await klik(page, '.radar-lembar [data-kilat="plg"][data-kode="P02"]'); await page.waitForSelector('#kilatBilah');
      await page.evaluate(() => { Object.defineProperty(document, 'hidden', { value: true, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
      await jeda(page, 1200);
      cek('visibilitychange → hidden saat hitung mundur → segera terkirim', await rpc(page) === 3);
      await page.evaluate(() => { Object.defineProperty(document, 'hidden', { value: false, configurable: true }); });
      await ctx.close(); }
    { const { ctx, page } = await siapkan();
      await page.evaluate(() => { window.__PLG_MODE = 'jaringan'; });
      await klik(page, '.radar-lembar [data-kilat="plg"][data-kode="P01"]'); await jeda(page, 6000);
      const r = await page.evaluate(() => ({ teks: document.querySelector('.swal2-popup')?.innerText || '', coba: !!document.querySelector('.swal2-confirm'), form: !!document.querySelector('.swal2-deny'),
        riwayat: JSON.parse(localStorage.getItem('rq.kilat.v1.' + idSaya()) || '{}') }));
      cek('Koneksi putus saat kirim → "belum tercatat" + Coba lagi + Buka formulir lengkap, riwayat tidak bertambah', r.teks.includes('Pelanggaran belum tercatat: koneksi terputus.') && r.coba && r.form && !r.riwayat.plg?.P01, r);
      await page.evaluate(() => { window.__prefill = null; modalCatatPelanggaran = (p) => { window.__prefill = p; }; });
      await klik(page, '.swal2-deny'); await jeda(page, 500);
      cek('Buka formulir lengkap → santri dan butir terisi', await page.evaluate(() => window.__prefill?.nisn === '24000041' && window.__prefill?.kode === 'P01'));
      await ctx.close(); }
    { const { ctx, page } = await siapkan();
      await page.evaluate(() => { window.__PLG_MODE = 'galat'; });
      await klik(page, '.radar-lembar [data-kilat="plg"][data-kode="P01"]'); await jeda(page, 6000);
      const r = await page.evaluate(() => document.querySelector('.swal2-popup')?.innerText || '');
      cek('Server menolak → pesan sistem ditampilkan utuh + Coba lagi', r.includes('Pelanggaran belum tercatat. Pesan sistem: Ditolak: uji server') && r.includes('Coba lagi'), r.slice(0, 160));
      await klik(page, '.swal2-cancel'); await jeda(page, 300);
      await page.evaluate(() => { window.__PLG_MODE = 'ok'; window.__RPC_PLG = []; muatDetail = async () => { throw new Error('uji: data pelanggaran tak terbaca'); }; });
      await klik(page, '.radar-lembar [data-kilat="plg"][data-kode="P02"]'); await jeda(page, 6500);
      const r2 = await page.evaluate(() => ({ n: window.__RPC_PLG.length, bilah: !!$('kilatBilah'), teks: document.querySelector('.swal2-popup')?.innerText || '' }));
      cek('Cek duplikat gagal (data pelanggaran tak terbaca) → tanpa hitung mundur, tanpa RPC, tawaran ulang', r2.n === 0 && !r2.bilah && r2.teks.includes('belum tercatat'), r2);
      await ctx.close(); }
    { const { ctx, page } = await siapkan();
      await klik(page, '.radar-lembar [data-kilat="prs"][data-kode="A01"]'); await jeda(page, 6000);
      const r = await page.evaluate(() => ({ s: window.__SISIP, riwayat: JSON.parse(localStorage.getItem('rq.kilat.v1.' + idSaya()) || '{}') }));
      const isi = r.s[0]?.isi || {};
      cek('Apresiasi → satu sisipan log_prestasi dengan payload formulir Prestasi', r.s.length === 1 && r.s[0].tabel === 'log_prestasi' && isi.nisn === '24000041' && isi.kode_prestasi === 'A01'
        && isi.judul === 'Adzan subuh' && isi.poin === 5 && isi.sumber === 'Pengasuhan' && isi.pencatat_id === 'u-admin' && isi.tanggal === '2026-09-28', isi);
      cek('Riwayat apresiasi +1', r.riwayat.prs?.A01?.n === 1);
      await ctx.setOffline(true);
      await bukaRadar(page); await bukaLembar(page, NISN);
      await klik(page, '.radar-lembar [data-kilat="prs"][data-kode="A02"]'); await jeda(page, 6000);
      const q = await page.evaluate(() => JSON.parse(localStorage.getItem('rq_antrean_v1') || '[]'));
      cek('Luring: apresiasi masuk antrean rq_antrean_v1', q.length === 1 && q[0].tabel === 'log_prestasi' && q[0].payload.kode_prestasi === 'A02', q);
      await ctx.close(); }
  }

  if (jalan(5)) {
    console.log('\n[5] Geometri lasso');
    const { ctx, page } = await buka(URL, 'Admin');
    const r = await page.evaluate(() => {
      const kotak = [[10, 10], [50, 10], [50, 50], [10, 50]];
      const tata = { titik: [{ nisn:'a', x:20, y:20 }, { nisn:'b', x:60, y:20 }, { nisn:'c', x:49, y:49 }],
        gumpal: [{ nisn:['g1','g2'], x:30, y:30 }, { nisn:['h1'], x:80, y:80 }] };
      return { dalam: titikDalamPoligon(30, 30, kotak), luar: titikDalamPoligon(60, 30, kotak),
        tepiKiri: titikDalamPoligon(10, 30, kotak), tepiKanan: titikDalamPoligon(50, 30, kotak),
        luas: Math.abs(luasPoligon(kotak)),
        pilih: [...(pilihDalamLasso(tata, kotak) || [])].sort().join(','),
        pendek: pilihDalamLasso(tata, [[1, 1], [2, 2]]), kecil: pilihDalamLasso(tata, [[1, 1], [2, 1], [1, 2]]) };
    });
    cek('Titik di dalam / di luar poligon', r.dalam === true && r.luar === false, r);
    cek('Tepi: aturan ray casting setengah terbuka (tepi kiri masuk, tepi kanan tidak)', r.tepiKiri === true && r.tepiKanan === false, r);
    cek('Luas kotak 40×40 = 1600', r.luas === 1600, r.luas);
    cek('Lasso memilih titik di dalam + seluruh anggota gumpalan di dalam', r.pilih === 'a,c,g1,g2', r.pilih);
    cek('Sapuan < 3 titik atau luas < 4 → null (dianggap ketukan)', r.pendek === null && r.kecil === null, r);
    await ctx.close();
  }

  if (jalan(6)) {
    console.log('\n[6] Mode pilih dan lasso');
    const { ctx, page } = await buka(URL, 'Admin');
    await bukaRadar(page);
    const awal = await page.evaluate(() => ({ tekan: document.querySelector('[data-radar-pilih]')?.getAttribute('aria-pressed'),
      sentuh: getComputedStyle(document.querySelector('.radar-layar .radar-svg')).touchAction }));
    cek('Tombol "Pilih beberapa" (aria-pressed=false), radar masih bisa digulir', awal.tekan === 'false' && awal.sentuh !== 'none', awal);
    await klik(page, '[data-radar-pilih]');
    const aktif = await page.evaluate(() => ({ tekan: document.querySelector('[data-radar-pilih]').getAttribute('aria-pressed'),
      sentuh: getComputedStyle(document.querySelector('.radar-layar .radar-svg')).touchAction, bar: $('lassoAksi')?.innerText || '', centang: document.querySelectorAll('#radarDaftar [data-pilih-nisn]').length }));
    cek('Mode aktif: aria-pressed=true, touch-action none, bilah tindakan, kotak centang di daftar', aktif.tekan === 'true' && aktif.sentuh === 'none' && /0 santri dipilih/.test(aktif.bar) && aktif.centang > 0, aktif);
    // lasso: lingkaran di sekitar pusat radar (pita tier 2 dan 3), dimulai di atas sebuah titik (Review Focus 3)
    const hasil = await page.evaluate(() => {
      const svg = document.querySelector('.radar-layar .radar-svg'), R = svg.getBoundingClientRect(), sk = R.width / 200;
      const awalTitik = [...svg.querySelectorAll('.radar-titik[data-nisn]')].map(c => ({ n: c.dataset.nisn, x: c.cx.baseVal.value, y: c.cy.baseVal.value }))
        .find(p => Math.hypot(p.x - 100, p.y - 100) < 55);
      const poli = []; const r0 = Math.hypot(awalTitik.x - 100, awalTitik.y - 100) + 1, a0 = Math.atan2(awalTitik.y - 100, awalTitik.x - 100);
      for (let i = 0; i <= 24; i++) { const a = a0 + i * Math.PI / 12; poli.push([100 + r0 * Math.cos(a), 100 + r0 * Math.sin(a)]); }
      poli[0] = [awalTitik.x, awalTitik.y];
      const harap = [...(pilihDalamLasso(RADAR.tata, poli) || [])].sort();
      return { layar: poli.map(([x, y]) => [R.left + x * sk, R.top + y * sk]), harap, mulai: awalTitik.n };
    });
    await page.mouse.move(...hasil.layar[0]); await page.mouse.down();
    for (const p of hasil.layar.slice(1)) await page.mouse.move(...p, { steps: 2 });
    await page.mouse.up(); await jeda(page, 300);
    const pilih = await page.evaluate(() => [...RADAR.pilih].sort());
    const tepat = await page.evaluate(() => [...(pilihDalamLasso(RADAR.tata, RADAR.lassoTerakhir) || [])].sort());
    cek('Lasso yang dimulai di atas titik → pilihan = isi jejak sapuan, tidak diubah klik susulan', pilih.length > 0 && JSON.stringify(pilih) === JSON.stringify(tepat), { n: pilih.length, tepat: tepat.length, kiraKira: hasil.harap.length });
    const kelompok = await page.evaluate(() => { const s0 = new Set(RADAR.pilih); RADAR.pilih = new Set(['x1']);
      togglePilih(['x1', 'x2']); const a = [...RADAR.pilih].sort().join(','); togglePilih(['x1', 'x2']); const b = RADAR.pilih.size; RADAR.pilih = s0; perbaruiPilihan(); return { a, b }; });
    cek('Pilih kelompok (dipakai ketuk gumpalan): sebagian terpilih → semua; semua terpilih → lepas semua', kelompok.a === 'x1,x2' && kelompok.b === 0, kelompok);
    const satu = await page.evaluate(() => [...document.querySelectorAll('.radar-layar .radar-titik[data-nisn]')].find(c => !RADAR.pilih.has(c.dataset.nisn)).dataset.nisn);
    await klik(page, `.radar-layar .radar-titik[data-nisn="${satu}"]`);
    const t1 = await page.evaluate((n) => RADAR.pilih.has(n) && document.querySelector(`.radar-titik[data-nisn="${n}"]`).classList.contains('terpilih'), satu);
    await klik(page, `.radar-layar .radar-titik[data-nisn="${satu}"]`);
    const t2 = await page.evaluate((n) => !RADAR.pilih.has(n), satu);
    cek('Ketuk titik dalam mode pilih → tambah, ketuk lagi → lepas; lembar tidak terbuka', t1 && t2 && await page.evaluate(() => !document.querySelector('.radar-lembar')), [t1, t2]);
    await page.evaluate(() => navigateTo('radar')); await page.waitForSelector('.radar-layar .radar-svg'); await jeda(page, 800);
    cek('Penyegaran otomatis → mode dan pilihan bertahan', await page.evaluate((n) => RADAR.pilihMode && RADAR.pilih.size === n, pilih.length));
    await klik(page, '[data-lasso-batal]');
    cek('Batal → mode mati, pilihan kosong', await page.evaluate(() => !RADAR.pilihMode && RADAR.pilih.size === 0 && !$('lassoAksi')));
    await klik(page, '[data-radar-pilih]');
    const lab = await page.evaluate(() => document.querySelector('.radar-label').dataset.sektor);
    await klik(page, `.radar-label[data-sektor="${lab}"]`);
    await klik(page, '[data-pilih-semua]');
    const ps = await page.evaluate((l) => ({ semuaKelas: [...RADAR.pilih].every(n => RADAR.data.siswaPeta.get(n).kelas === l),
      n: RADAR.pilih.size, daftar: daftarTersaring().length }), lab);
    cek('"Pilih semua di daftar" setelah menyaring kelas → tepat daftar kelas itu', ps.semuaKelas && ps.n === ps.daftar && ps.n > 0, ps);
    await page.evaluate(() => navigateTo('siswa')); await jeda(page, 800); await bukaRadar(page);
    cek('Keluar dari Radar lalu masuk lagi → mode mati, pilihan kosong', await page.evaluate(() => !RADAR.pilihMode && RADAR.pilih.size === 0));
    await ctx.close();
  }

  if (jalan(7)) {
    console.log('\n[7] Tindakan kelompok');
    const { ctx, page } = await buka(URL, 'Admin');
    await page.evaluate(() => { window.__m = modalMassalPelanggaran(); });
    await page.waitForSelector('#msChips');
    cek('Regresi: modalMassalPelanggaran() tanpa argumen → keping kosong', await page.evaluate(() => MASSAL.pilih.length === 0 && /Belum ada santri dipilih/.test($('msChips').innerText)));
    await klik(page, '.swal2-cancel'); await jeda(page, 400);
    await bukaRadar(page); await klik(page, '[data-radar-pilih]');
    const tiga = await page.evaluate(() => [...document.querySelectorAll('#radarDaftar [data-pilih-nisn]')].slice(0, 3).map(c => c.dataset.pilihNisn));
    await klik(page, `#radarDaftar [data-pilih-nisn="${tiga[0]}"]`);
    cek('Satu santri → "Catat pelanggaran sekaligus" nonaktif (minimal 2)', await page.evaluate(() => $('lassoAksi').querySelector('[data-lasso-plg]').disabled));
    for (const n of tiga.slice(1)) await klik(page, `#radarDaftar [data-pilih-nisn="${n}"]`);
    await klik(page, '[data-lasso-plg]'); await page.waitForSelector('#msChips .mchip');
    cek('Pelanggaran sekaligus → dialog lama terbuka dengan 3 santri terpilih', await page.evaluate((t) => JSON.stringify(MASSAL.pilih.map(s => String(s.nisn)).sort()) === JSON.stringify(t.slice().sort()) && document.querySelectorAll('#msChips .mchip').length === 3, tiga));
    await klik(page, '.swal2-cancel'); await jeda(page, 400);
    // Apresiasi sekaligus: satu santri dikeluarkan dari keping (Review Focus 4), satu dipaksa gagal
    await page.evaluate((t) => { window.__SISIP = []; window.__GAGAL_NISN = [t[1]]; }, tiga);
    await klik(page, '[data-lasso-prs]'); await page.waitForSelector('#apsChips .mchip');
    await klik(page, `#apsChips [data-hapus="${tiga[2]}"]`);
    await page.focus('#apsJenis'); await page.waitForSelector('.ac-item');
    await page.$eval('.ac-item', el => el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })));
    await page.fill('#apsCatatan', 'Kerja bakti kamar');
    cek('Tombol simpan menyebut jumlah santri tersisa', await page.evaluate(() => /Simpan 2 apresiasi/.test(Swal.getConfirmButton().textContent)));
    await klik(page, '.swal2-confirm');
    await page.waitForFunction(() => /tersimpan di perangkat/.test(document.querySelector('.swal2-popup')?.innerText || ''), null, { timeout: 10000 });
    const r = await page.evaluate(() => ({ teks: document.querySelector('.swal2-popup').innerText, s: window.__SISIP }));
    cek('Hanya santri yang tersisa disimpan; ringkasan "1 tersimpan · 0 tersimpan di perangkat · 1 gagal"', r.s.length === 1 && r.s[0].isi.nisn === tiga[0]
      && r.s[0].isi.catatan === 'Kerja bakti kamar' && r.teks.includes('1 tersimpan · 0 tersimpan di perangkat · 1 gagal'), r);
    await klik(page, '.swal2-confirm'); await jeda(page, 1500);
    cek('Yang gagal tetap terpilih, yang berhasil dilepas', await page.evaluate((t) => RADAR.pilihMode && JSON.stringify([...RADAR.pilih]) === JSON.stringify([t[1]]), tiga));
    await ctx.setOffline(true); await bukaRadar(page);
    cek('Luring → "Catat pelanggaran sekaligus" nonaktif', await page.evaluate(() => !RADAR.pilihMode || $('lassoAksi').querySelector('[data-lasso-plg]').disabled));
    await ctx.close();
  }

  if (jalan(8)) {
    console.log('\n[8] HP dan bahasa');
    { const { ctx, page } = await buka(URL, 'Admin', { viewport: { width: 390, height: 844 }, mobile: true });
      await bukaRadar(page); await bukaLembar(page, NISN);
      const u = await page.evaluate(() => ({ body: document.documentElement.scrollWidth,
        kisi: [...document.querySelectorAll('.radar-lembar .kilat-btn')].every(b => b.getBoundingClientRect().right <= 390 && b.getBoundingClientRect().height >= 44) }));
      cek('HP 390 px: tombol cepat muat, tinggi ≥ 44 px, tanpa luapan', u.body <= 390 && u.kisi, u);
      await page.screenshot({ path: path.join(KELUAR, 'render-v246-1-tombol-cepat-hp.png') });
      await klik(page, '.radar-lembar [data-kilat="prs"][data-kode="A01"]'); await page.waitForSelector('#kilatBilah');
      const b = await page.evaluate(() => { const r = $('kilatBilah').getBoundingClientRect();
        const tabrak = [...document.querySelectorAll('.radar-lembar .kilat-btn')].some(k => { const q = k.getBoundingClientRect();
          return !(q.right <= r.left || q.left >= r.right || q.bottom <= r.top || q.top >= r.bottom); });
        return { kiri: r.left >= 0, kanan: r.right <= 390, lebar: Math.round(r.width), tabrak }; });
      cek('HP 390 px: bilah hitung mundur di dalam layar, lebar ≥ 300 px, tidak menutupi tombol cepat', b.kiri && b.kanan && b.lebar >= 300 && !b.tabrak, b);
      await page.screenshot({ path: path.join(KELUAR, 'render-v246-2-hitung-mundur-hp.png') });
      await klik(page, '#kilatBilah [data-kilat-urung]');
      await page.evaluate(() => tutupLembarRadar()); await klik(page, '[data-radar-pilih]'); await klik(page, '[data-pilih-semua]');
      const a = await page.evaluate(() => { const r = $('lassoAksi').getBoundingClientRect();
        return { kiri: r.left >= 0, kanan: r.right <= 390, lebar: Math.round(r.width), body: document.documentElement.scrollWidth,
          n: RADAR.pilih.size, plgNonaktif: $('lassoAksi').querySelector('[data-lasso-plg]').disabled, teks: $('lassoAksi').innerText }; });
      cek('HP 390 px: bilah tindakan lasso di dalam layar, lebar ≥ 300 px', a.kiri && a.kanan && a.lebar >= 300 && a.body <= 390, a);
      cek('Lebih dari 50 santri terpilih → pelanggaran sekaligus nonaktif + keterangan batas (tidak dipotong diam-diam)', a.n > 50 && a.plgNonaktif && a.teks.includes('Maksimal 50 santri'), a);
      await page.screenshot({ path: path.join(KELUAR, 'render-v246-3-lasso-hp.png') });
      await ctx.close(); }
    { const { ctx, page } = await buka(URL, 'Admin');
      await bukaRadar(page); await bukaLembar(page, NISN);
      await page.screenshot({ path: path.join(KELUAR, 'render-v246-4-lembar-desktop.png') });
      const t = await page.evaluate(() => document.querySelector('.radar-lembar').innerText + '\n' + document.getElementById('viewRoot').innerText);
      const temuan = t.split('\n').flatMap(b => b.split('\t')).filter(b => /\S\s—\s\S/.test(b) && !/^[A-Z]{1,3}-?\d{2,4} — /.test(b.trim()));
      cek('Tanpa " — " dalam kalimat di Radar dan lembar Catat Kilat', temuan.length === 0, temuan);
      await ctx.close(); }
  }

  // ==== BAGIAN UJI DITAMBAHKAN OLEH TASK 1–8 DI SINI ====

  if (jalan(9)) {
    console.log('\n[9] Temuan tinjauan akhir');
    const siapkan9 = async (o = {}) => { const b = await buka(URL, 'Admin', o); await bukaRadar(b.page); await bukaLembar(b.page, NISN);
      await b.page.evaluate(() => { window.__RPC_PLG = []; window.__SISIP = []; }); return b; };
    const bilahAda = (p) => p.evaluate(() => !!$('kilatBilah'));
    // K1 — Urungkan ditekan melintasi detak detik (mouse sungguhan)
    { const { ctx, page } = await siapkan9();
      await klik(page, '.radar-lembar [data-kilat="plg"][data-kode="P01"]'); await page.waitForSelector('#kilatBilah');
      const t = await page.$eval('#kilatBilah [data-kilat-urung]', el => { const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
      await page.mouse.move(t.x, t.y); await page.mouse.down(); await jeda(page, 1200); await page.mouse.up(); await jeda(page, 6000);
      cek('K1: Urungkan ditekan melintasi detak (mouse sungguhan) → tetap batal, nol RPC', await rpc(page) === 0 && !(await bilahAda(page)), await rpc(page));
      await ctx.close(); }
    // P2 — mode pilih dengan mouse sungguhan
    { const { ctx, page } = await buka(URL, 'Admin'); await bukaRadar(page); await klik(page, '[data-radar-pilih]');
      const d = await page.evaluate(() => { const c = [...document.querySelectorAll('.radar-layar .radar-titik[data-nisn]')].find(c => { const r = c.getBoundingClientRect();
        return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) === c; }); const r = c.getBoundingClientRect(); return { n: c.dataset.nisn, x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
      await page.mouse.click(d.x, d.y); await jeda(page, 300);
      const a1 = await page.evaluate((n) => RADAR.pilih.has(n), d.n);
      await page.mouse.click(d.x, d.y); await jeda(page, 300);
      const a2 = await page.evaluate((n) => !RADAR.pilih.has(n), d.n);
      const l = await page.evaluate(() => { const e = document.querySelector('.radar-label'); const r = e.getBoundingClientRect(); return { s: e.dataset.sektor, x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
      await page.mouse.click(l.x, l.y); await jeda(page, 300);
      cek('P2: mode pilih, klik mouse sungguhan pada titik → tambah lalu lepas; pada label → saring kelas', a1 && a2 && await page.evaluate((s) => RADAR.kelas === s, l.s), [a1, a2]);
      await ctx.close(); }
    // P3 — hitung mundur tidak menutup dialog yang terbuka
    { const { ctx, page } = await siapkan9();
      await klik(page, '.radar-lembar [data-kilat="plg"][data-kode="P01"]'); await page.waitForSelector('#kilatBilah');
      await klik(page, '.radar-lembar [data-kilat-lainnya]'); await jeda(page, 800);
      const segera = await rpc(page);
      // Pada "Semua Unit" formulir lama bertanya unit lebih dulu (perilaku lama); pilih "Tetap lanjut".
      if (await page.evaluate(() => /Pilih unit terlebih dahulu/.test(document.querySelector('.swal2-title')?.textContent || ''))) {
        await klik(page, '.swal2-cancel'); await page.waitForSelector('#fNisn'); }
      await jeda(page, 6000);
      cek('P3a: Lainnya… saat hitung mundur → catatan pertama segera terkirim, formulir lengkap tetap terbuka', segera === 1 && await page.evaluate(() => !!document.getElementById('fNisn') && Swal.isVisible()), segera);
      await ctx.close(); }
    { const { ctx, page } = await siapkan9();
      await klik(page, '.radar-lembar [data-kilat="plg"][data-kode="P01"]'); await page.waitForSelector('#kilatBilah');
      await page.evaluate(() => { const asli = cariDuplikatPelanggaran; cariDuplikatPelanggaran = async (n, k, t) => k === 'P02' ? { tanggal: t, nama_pelanggaran: 'Tidak ikut halaqah' } : asli(n, k, t); });
      await klik(page, '.radar-lembar [data-kilat="plg"][data-kode="P02"]'); await jeda(page, 2500);
      const r = await page.evaluate(() => ({ n: window.__RPC_PLG.length, dialog: /Sudah tercatat hari ini/.test(document.querySelector('.swal2-popup')?.innerText || '') }));
      cek('P3b: ketuk butir kedua (duplikat) saat hitung mundur → yang pertama terkirim lebih dulu, dialog duplikat tetap terbuka', r.n === 1 && r.dialog, r);
      await ctx.close(); }
    // P4 — nama santri di toast di-escape
    { const { ctx, page } = await siapkan9();
      await page.evaluate(() => { RADAR.data.siswaPeta.get('24000041').nama_siswa = '<img id="xss9" src="x">'; });
      await klik(page, '.radar-lembar [data-kilat="plg"][data-kode="P01"]'); await jeda(page, 6500);
      cek('P4: nama santri pada toast sukses di-escape (tanpa elemen tersisip)', await rpc(page) === 1 && await page.evaluate(() => !document.getElementById('xss9')));
      await ctx.close(); }
    // P5 — Coba lagi menjalankan cek duplikat lagi
    { const { ctx, page } = await siapkan9();
      await page.evaluate(() => { window.__PLG_MODE = 'jaringan'; });
      await klik(page, '.radar-lembar [data-kilat="plg"][data-kode="P01"]'); await jeda(page, 6000);
      await page.evaluate(() => { window.__PLG_MODE = 'ok'; cariDuplikatPelanggaran = async (n, k, t) => ({ tanggal: t, nama_pelanggaran: 'Terlambat jamaah' }); });
      await swalYa(page); await jeda(page, 800);
      const dialog = await page.evaluate(() => /Sudah tercatat hari ini/.test(document.querySelector('.swal2-popup')?.innerText || ''));
      await klik(page, '.swal2-cancel'); await jeda(page, 6000);
      cek('P5: Coba lagi setelah jaringan putus → cek duplikat dijalankan lagi; batal → tidak ada kiriman kedua', dialog && await rpc(page) === 1, [dialog, await rpc(page)]);
      await ctx.close(); }
    // P6 — keluar / segarkan saat hitung mundur
    { const { ctx, page } = await siapkan9();
      await klik(page, '.radar-lembar [data-kilat="plg"][data-kode="P01"]'); await page.waitForSelector('#kilatBilah');
      await klik(page, '#btnLogout'); await jeda(page, 800);
      const n1 = await rpc(page); await klik(page, '.swal2-cancel'); await jeda(page, 400);
      await bukaLembar(page, NISN).catch(() => {});
      await klik(page, '.radar-lembar [data-kilat="plg"][data-kode="P02"]'); await page.waitForSelector('#kilatBilah');
      await klik(page, '#btnSegarkan'); await jeda(page, 800);
      const n2 = await rpc(page); await klik(page, '.swal2-cancel');
      cek('P6: tombol Keluar / Segarkan saat hitung mundur → catatan dikirim lebih dulu', n1 === 1 && n2 === 2, [n1, n2]);
      await ctx.close(); }
    // P7 — apresiasi sekaligus menampilkan proses menyimpan
    { const { ctx, page } = await buka(URL, 'Admin'); await bukaRadar(page); await klik(page, '[data-radar-pilih]');
      const dua = await page.evaluate(() => [...document.querySelectorAll('#radarDaftar [data-pilih-nisn]')].slice(0, 2).map(c => c.dataset.pilihNisn));
      for (const n of dua) await klik(page, `#radarDaftar [data-pilih-nisn="${n}"]`);
      await klik(page, '[data-lasso-prs]'); await page.waitForSelector('#apsChips .mchip');
      await page.focus('#apsJenis'); await page.waitForSelector('.ac-item');
      await page.$eval('.ac-item', el => el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })));
      await klik(page, '.swal2-confirm');
      const proses = await page.waitForFunction(() => /Menyimpan/.test(document.querySelector('.swal2-popup')?.innerText || '') && !!document.querySelector('.swal2-popup .swal2-loader, .swal2-loading'), null, { timeout: 2000 }).then(() => true).catch(() => false);
      cek('P7: apresiasi sekaligus → dialog "Menyimpan…" (layar terkunci) selama proses', proses);
      await ctx.close(); }
  }

  cek('Nol galat JS', galat.length === 0, galat.slice(0, 4));
  console.log(`\n${lulus} lulus, ${gagal} gagal`);
  await browser.close(); srv.close();
  process.exit(gagal ? 1 : 0);
})();
