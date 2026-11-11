/* uji-v273.cjs — v2.73 SARPRAS ASRAMA · PENGATURAN (master, standar, penugasan, kelompok, setelan, impor)
 *
 *   npm i --no-save playwright-core sweetalert2@11.26.25   (sekali)
 *   node uji/uji-v273.cjs                 (RQ_CHROME=/jalur/chrome bila Playwright tanpa peramban bawaan)
 *   RQ_POTRET=1 node uji/uji-v273.cjs     → potret HP & desktop ke uji/keluaran/
 *
 * Berkas SUMBER dilayani apa adanya (tanpa build); CDN dicegat ke berkas lokal / Supabase tiruan.
 * A · berkas: VERSI & APP.versi, sarpras.js di INTI & KLASIK, ikon dalam subset, tanpa konstanta lembaga.
 * B · Pengaturan Sarpras: tujuh tab, tambah lokasi, hapus butir berdampak, induk nonaktif, CSV titik-koma,
 *     lebar 360 px, Guru tanpa menu, Admin bukan pengelola hanya-baca.
 * C · regresi: Ringkasan, Profil Santri, modal Catat tanpa galat.
 */
const fs = require('fs'), path = require('path'), http = require('http');
let pw; try { pw = require('playwright'); } catch (e) { pw = require('playwright-core'); }
const { MOCK } = require('./mock.cjs');

const AKAR = path.resolve(__dirname, '..');
const NM = path.join(AKAR, 'node_modules');
const KELUAR = path.join(__dirname, 'keluaran'); fs.mkdirSync(KELUAR, { recursive: true });
const POTRET = process.env.RQ_POTRET === '1';
const JENIS = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.csv': 'text/csv; charset=utf-8',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.woff2': 'font/woff2' };

let lulus = 0, gagal = 0;
const cek = (j, ok, info) => { ok ? lulus++ : gagal++; console.log(`${ok ? '  ok  ' : ' GAGAL'} ${j}${info !== undefined && !ok ? '  · ' + JSON.stringify(info) : ''}`); };
const baca = (...p) => fs.readFileSync(path.join(AKAR, ...p), 'utf8');

/* Tabel tiruan tambahan: disuntikkan ke T milik mock.cjs. */
const MOCK_SARPRAS = MOCK.replace('wa_kontak: [], wa_log: [], audit_log: []', 'wa_kontak: [], wa_log: [], audit_log: [], ...(window.__TABEL || {})');
if (MOCK_SARPRAS === MOCK) throw new Error('mock.cjs berubah: titik suntik tabel tidak ditemukan');

function layani(dir, port) {
  return new Promise(ok => {
    const s = http.createServer((req, res) => {
      const p = decodeURIComponent(req.url.split('?')[0]);
      const f = path.join(dir, p === '/' ? 'index.html' : p);
      if (!f.startsWith(dir) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'Content-Type': JENIS[path.extname(f)] || 'application/octet-stream' });
      res.end(fs.readFileSync(f));
    }).listen(port, '127.0.0.1', () => ok(s));
  });
}

/* Data & RPC tiruan untuk modul Sarpras (dijalankan di halaman). */
function pasangSarpras() {
  const set = (kunci, nilai) => ({ kunci, nilai });
  window.__TABEL = {
    sarpras_setelan: [
      set('aktif', true), set('lembaga', { nama: 'Lembaga Uji', alamat: 'Jl. Uji' }), set('penerima', { nama: 'Bagian Sarana' }),
      set('penandatangan', [{ jabatan: 'Pengelola', nama: 'Ust. Uji' }]), set('pengelola', []),
      set('istilah', { kamar: 'Kamar', asrama: 'Asrama', musyrif: 'Musyrif', sayap: 'Sayap', bilik: 'Bilik', titik: 'Titik', butir: 'Butir', ditanggung: 'Ditanggung lembaga', unit: 'Unit', gedung: 'Gedung', lantai: 'Lantai', penghuni: 'Penghuni', lembaga: 'Lembaga' }),
      set('skala', [{ kode: 'baik', label: 'Baik', bobot: 0 }, { kode: 'ringan', label: 'Rusak Ringan', bobot: 1 }, { kode: 'berat', label: 'Rusak Berat', bobot: 3 }, { kode: 'hilang', label: 'Hilang', bobot: 3 }]),
      set('penyebab', [{ kode: 'wajar', label: 'Pemakaian wajar/usang' }, { kode: 'lalai', label: 'Kelalaian' }, { kode: 'rusak', label: 'Perusakan' }, { kode: 'tidak_tahu', label: 'Tidak diketahui' }]),
      set('kelompok_pelanggaran', [{ kode: 'cctv', nama: 'CCTV', ikon: 'fa-eye', pelanggaran: ['K01'] }]),
      set('kode_pelanggaran_rusak', {}), set('peran_kamar', []),
      set('aturan_penempatan', { aktif: false, pengawas: { peran: null, angkatan_asal: [], angkatan_dijaga: [] }, satu_angkatan: [] }),
      set('laporan', { awal_pekan: 1, perbaikan_besar_hari: 30, semester: [{ nama: 'Ganjil', mulai: '07-01', sampai: '12-31' }, { nama: 'Genap', mulai: '01-01', sampai: '06-30' }] }),
      set('evaluasi', { berulang_kali: 2, berulang_hari: 60, arah_ambang: 0.6 }),
      set('peran_tanpa_tugas', ['Osis', 'Klinik', 'Pimpinan', 'Walas']), set('foto', { sisi: 1280, kb: 200, maks: 2 })
    ],
    sarpras_unit: [{ id: 'u1', nama: 'Unit Uji Satu', kunci_siswa: 'x1', urutan: 1, aktif: true }, { id: 'u2', nama: 'Unit Uji Dua', kunci_siswa: null, urutan: 2, aktif: true }],
    sarpras_zona: [
      { kode: 'kamar', nama: 'Kamar', ikon: 'fa-bed', frekuensi_hari: 30, berpenghuni: true, label_tingkat: ['Kamar'], urutan: 1, aktif: true, bawaan: true },
      { kode: 'asrama_umum', nama: 'Asrama Umum', ikon: 'fa-stairs', frekuensi_hari: 7, berpenghuni: false, label_tingkat: ['Titik'], urutan: 2, aktif: true, bawaan: true },
      { kode: 'kamar_mandi', nama: 'Kamar Mandi', ikon: 'fa-layer-group', frekuensi_hari: 7, berpenghuni: false, label_tingkat: ['Sayap', 'Bilik'], urutan: 3, aktif: true, bawaan: true }],
    sarpras_lokasi: [
      { id: 'l1', unit_id: 'u1', induk_id: null, zona: 'kamar', nama: 'Kamar Satu', nomor: 1, gedung: 'Gedung A', lantai: '1', kapasitas: 8, titik_periksa: true, urutan: 1, aktif: true },
      { id: 'l2', unit_id: 'u1', induk_id: null, zona: 'kamar', nama: 'Kamar Dua', nomor: 2, gedung: 'Gedung A', lantai: '2', kapasitas: 8, titik_periksa: true, urutan: 2, aktif: true },
      { id: 's1', unit_id: 'u1', induk_id: null, zona: 'kamar_mandi', nama: 'Sayap Barat', nomor: null, gedung: null, lantai: '1', kapasitas: null, titik_periksa: true, urutan: 0, aktif: false },
      { id: 'b1', unit_id: 'u1', induk_id: 's1', zona: 'kamar_mandi', nama: 'Bilik Satu', nomor: null, gedung: null, lantai: null, kapasitas: null, titik_periksa: false, urutan: 0, aktif: true }],
    sarpras_butir: [
      { id: 'bt1', nama: 'Lampu', kategori: 'Listrik', satuan: 'titik', zona: [], ditanggung: true, urutan: 1, aktif: true },
      { id: 'bt2', nama: 'Kloset', kategori: 'Plumbing', satuan: 'unit', zona: ['kamar_mandi'], ditanggung: true, urutan: 2, aktif: true }],
    sarpras_standar: [{ id: 1, lokasi_id: 'l1', butir_id: 'bt1', jumlah: 2, spesifikasi: 'LED', ditanggung_khusus: null, berlaku_mulai: '2026-11-01', berlaku_sampai: null }],
    sarpras_tugas: [],
    master_pelanggaran: [{ kode_pelanggaran: 'K01', nama_pelanggaran: 'Merusak kamera', kategori: 'Berat', bidang: 'Asrama', unit_gender: 'x1' },
                         { kode_pelanggaran: 'K02', nama_pelanggaran: 'Tidak piket', kategori: 'Ringan', bidang: 'Kebersihan', unit_gender: 'x1' }]
  };
  const r = (data) => ({ data, error: null });
  window.__RPC = Object.assign(window.__RPC || {}, {
    adalah_super_admin: () => r(!!window.__SUPER),
    sarpras_saya: () => r({ pengelola: !!window.__PENGELOLA, admin: true, tugas: 0 }),
    sarpras_lokasi_simpan: () => r({ id: 'baru' }),
    sarpras_butir_dampak: () => r({ standar: 3, lokasi: 2, kasus: 14, laporan: 2 }),
    sarpras_butir_hapus: () => r({ aksi: 'nonaktif', standar: 3, lokasi: 2, kasus: 14, laporan: 2 }),
    sarpras_impor: (a) => r({ ok: true, kering: !!a.p_kering, jumlah: (a.p_baris || []).length, baru: (a.p_baris || []).length, ubah: 0, salah: [] })
  });
}

async function masuk(browser, url, o = {}) {
  const ctx = await browser.newContext({ viewport: o.vp || (o.hp ? { width: 390, height: 844 } : { width: 1366, height: 860 }),
    deviceScaleFactor: 1, isMobile: !!o.hp, hasTouch: !!o.hp, serviceWorkers: 'block', reducedMotion: 'reduce' });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, async (route) => {
    const u = route.request().url();
    if (u.includes('supabase-js')) return route.fulfill({ contentType: 'application/javascript', body: MOCK_SARPRAS });
    if (u.includes('sweetalert2')) return route.fulfill({ contentType: 'application/javascript', path: NM + '/sweetalert2/dist/sweetalert2.all.min.js' });
    if (u.includes('chart.js@') && fs.existsSync(NM + '/chart.js/dist/chart.umd.min.js')) return route.fulfill({ contentType: 'application/javascript', path: NM + '/chart.js/dist/chart.umd.min.js' });
    if (u.includes('echarts@') && fs.existsSync(NM + '/echarts/dist/echarts.min.js')) return route.fulfill({ contentType: 'application/javascript', path: NM + '/echarts/dist/echarts.min.js' });
    if (/\.js(\?|$)/.test(u)) return route.fulfill({ contentType: 'application/javascript', body: '' });
    return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
  });
  const page = await ctx.newPage();
  const galat = [];
  page.on('pageerror', e => galat.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_|net::/.test(m.text())) galat.push('console: ' + m.text()); });
  await page.addInitScript(`(${(o) => {
    window.__PERAN = o.peran || 'Admin'; window.__KELAS = o.kelas || []; window.__KORPS = o.korps || null;
    if (o.super) window.__SUPER = true;
    if (o.pengelola) window.__PENGELOLA = true;
    try { localStorage.setItem('rq-efek-pilih', 'hemat'); localStorage.setItem('rq.tur.v1.u-admin', '{"t":0}'); } catch (e) {}
  }})(${JSON.stringify(o)}); (${pasangSarpras.toString()})();`);
  await page.goto(url, { waitUntil: 'commit' });
  await page.waitForFunction(() => { const b = document.getElementById('btnLogin'); return typeof APP !== 'undefined' && b && b.offsetParent && !b.disabled; }, null, { timeout: 120000 });
  await page.click('#btnLogin');
  await page.waitForFunction(() => typeof APP !== 'undefined' && APP.profil && document.querySelector('#viewRoot') && document.querySelector('#viewRoot').children.length, null, { timeout: 120000 });
  await page.waitForTimeout(800);
  return { ctx, page, galat };
}
const potret = async (page, nama) => { if (POTRET) await page.screenshot({ path: path.join(KELUAR, nama + '.png'), fullPage: true }); };
const rpcLog = (p, nama) => p.evaluate((n) => (window.__LOG || []).filter(x => x.t === 'rpc:' + n).map(x => x.arg), nama);
async function bukaAtur(page, tab) {
  await page.evaluate(() => navigateTo('sarprasatur'));
  await page.waitForFunction(() => document.querySelector('.sp-atur [data-sp-tab]') && !document.querySelector('.sp-muat'), null, { timeout: 15000 });
  if (tab) await klikTab(page, tab);
}
async function klikTab(page, tab) {
  await page.click(`[data-sp-tab="${tab}"]`); await page.waitForTimeout(250);
}
const tutupSwal = async (p) => { if (await p.$('.swal2-container')) { await p.keyboard.press('Escape'); await p.waitForTimeout(300); } };

(async () => {
  // ---------------- A · berkas
  const app = baca('app.js'), sw = baca('sw.js'), vite = baca('vite.config.mjs'), idx = baca('index.html');
  const ada = fs.existsSync(path.join(AKAR, 'sarpras.js'));
  const sp = ada ? baca('sarpras.js') : '';
  cek('A1 sw.js VERSI rq-v2.73', /const VERSI\s*=\s*'rq-v2\.73'/.test(sw));
  cek('A1 app.js APP.versi rq-v2.73', /APP\.versi = 'rq-v2\.73'/.test(app));
  cek('A1 sarpras.js ada, di INTI sw.js & KLASIK vite', ada && /'\.\/sarpras\.js'/.test(sw) && /KLASIK = \[[^\]]*'sarpras\.js'/.test(vite));
  cek('A1 index.html: menu Pengaturan Sarpras', /data-view="sarprasatur"/.test(idx));
  const subset = new Set((baca('ikon', 'fa-subset.css').match(/\.fa-[a-z0-9-]+/g) || []).map(s => s.slice(1)));
  const ikon = [...new Set((sp.match(/fa-[a-z0-9-]+/g) || []))].filter(k => !['fa-solid', 'fa-regular', 'fa-brands', 'fa-spin', 'fa-fw'].includes(k));
  const luar = ikon.filter(k => !subset.has(k));
  cek('A2 semua ikon sarpras.js ada di subset', ada && luar.length === 0, luar);
  const tertanam = (sp.match(/Ruhul|Qurani|\bputra\b|\bputri\b|Kamar\s+\d|Sayap\s+(Timur|Barat|Utara|Selatan)/gi) || []);
  cek('A3 tanpa konstanta lembaga di sarpras.js', ada && tertanam.length === 0, tertanam);

  const chrome = process.env.RQ_CHROME || (fs.existsSync('/usr/bin/google-chrome') ? '/usr/bin/google-chrome' : undefined);
  const browser = await pw.chromium.launch(chrome && !process.env.RQ_PW_BAWAAN ? { executablePath: chrome } : {});
  const server = await layani(AKAR, 4733);
  const URL = 'http://127.0.0.1:4733/';
  try {
    // ---------------- B · super admin (pengelola)
    {
      const { ctx, page, galat } = await masuk(browser, URL, { super: true, pengelola: true });
      const menu = await page.evaluate(() => { const b = document.querySelector('#navMenu [data-view="sarprasatur"]'); return b && !b.classList.contains('hidden'); });
      cek('B1 menu Pengaturan Sarpras tampil untuk Admin', menu);
      await bukaAtur(page);
      const tab = await page.$$eval('[data-sp-tab]', b => b.map(x => x.dataset.spTab));
      cek('B1 tujuh tab', tab.join(',') === 'lokasi,butir,standar,tugas,kelompok,setelan,impor', tab);
      cek('B1 tab Lokasi aktif & daftar lokasi tampil', await page.$$eval('.sp-lok[data-id]', l => l.length) >= 4);
      await potret(page, 'v273-1-lokasi-desktop');

      // B4 induk nonaktif → anak "ikut nonaktif"
      const anak = await page.$eval('.sp-lok[data-id="b1"]', el => ({ kelas: el.className, teks: el.textContent }));
      cek('B4 anak dari induk nonaktif bertanda "ikut nonaktif"', /sp-ikut-nonaktif/.test(anak.kelas) && /ikut nonaktif/i.test(anak.teks), anak);

      // B2 tambah lokasi
      await page.click('[data-sp="lok-tambah"][data-unit="u1"][data-zona="kamar"]');
      await page.waitForSelector('#spLokNama');
      await page.fill('#spLokNama', 'Kamar Tiga Puluh Satu'); await page.fill('#spLokNomor', '31'); await page.fill('#spLokLantai', '2');
      await page.click('.swal2-confirm'); await page.waitForTimeout(600);
      const simpan = await rpcLog(page, 'sarpras_lokasi_simpan');
      const p = simpan[0] && simpan[0].p;
      cek('B2 tambah lokasi memanggil sarpras_lokasi_simpan dengan isian benar',
          p && p.unit_id === 'u1' && p.zona === 'kamar' && p.nama === 'Kamar Tiga Puluh Satu' && p.nomor === 31 && p.lantai === '2' && !p.induk_id, simpan);
      await tutupSwal(page);

      // B3 hapus butir berdampak
      await klikTab(page, 'butir');
      await page.click('[data-sp="butir-hapus"][data-id="bt1"]');
      await page.waitForSelector('.swal2-popup', { timeout: 5000 });
      const dlg = await page.evaluate(() => ({ teks: document.querySelector('.swal2-html-container')?.textContent || '', tombol: document.querySelector('.swal2-confirm')?.textContent || '' }));
      cek('B3 dialog hapus butir menyebut 14 riwayat dan tombolnya "Nonaktifkan"', /14/.test(dlg.teks) && /Nonaktifkan/.test(dlg.tombol), dlg);
      await tutupSwal(page);

      // B5 CSV titik-koma + BOM + kutip
      await klikTab(page, 'impor');
      await page.selectOption('#spImporJenis', 'butir');
      const csv = '﻿nama;kategori;satuan;zona;ditanggung\r\nKursi;Perabot;unit;kamar;ya\r\n"Meja; lipat";Perabot;unit;;tidak\r\n"Rak ""besar""";Perabot;unit;kamar|asrama_umum;ya\r\n';
      await page.setInputFiles('#spImporBerkas', { name: 'butir.csv', mimeType: 'text/csv', buffer: Buffer.from(csv, 'utf8') });
      await page.waitForFunction(() => document.querySelectorAll('.sp-pratinjau tbody tr').length >= 3, null, { timeout: 5000 }).catch(() => {});
      await page.click('#spImporPeriksa'); await page.waitForTimeout(600);
      const imp = (await rpcLog(page, 'sarpras_impor'))[0] || {};
      const br = imp.p_baris || [];
      cek('B5 CSV titik-koma + BOM: 3 baris, kutip terbaca, uji-kering',
          imp.p_jenis === 'butir' && imp.p_kering === true && br.length === 3 && br[0].nama === 'Kursi' && br[1].nama === 'Meja; lipat' && br[2].nama === 'Rak "besar"' && br[2].zona === 'kamar|asrama_umum', imp);
      const tetap = await page.evaluate(() => document.querySelector('.sp-tetap')?.textContent || '');
      cek('B5 kolom yang tidak ada di berkas disebut "tidak diubah" (urutan)', /tidak diubah/i.test(tetap) && /urutan/.test(tetap), tetap);

      // tab lain terbuka tanpa galat
      for (const t of ['standar', 'tugas', 'kelompok', 'setelan']) { await page.click(`[data-sp-tab="${t}"]`); await page.waitForTimeout(350); }
      await potret(page, 'v273-2-setelan-desktop');
      // C2 panel denyut yang tertutup tidak boleh menangkap klik (dulu display:flex walau ber-hidden)
      const dp = await page.evaluate(() => { const p = document.getElementById('denyutPanel'); return p ? { hidden: p.hidden, display: getComputedStyle(p).display } : null; });
      cek('C2 panel denyut tertutup tidak dirender (tidak menghalangi klik)', dp && dp.hidden && dp.display === 'none', dp);
      cek('B tanpa galat halaman (super admin)', galat.length === 0, galat);
      await ctx.close();
    }
    // ---------------- B6 · HP 360 px
    {
      const { ctx, page, galat } = await masuk(browser, URL, { super: true, pengelola: true, hp: true, vp: { width: 360, height: 760 } });
      await bukaAtur(page);
      const lebar = async () => page.evaluate(() => document.documentElement.scrollWidth);
      const w1 = await lebar(); await potret(page, 'v273-3-lokasi-hp');
      await klikTab(page, 'standar'); const w2 = await lebar();
      await klikTab(page, 'setelan'); const w3 = await lebar(); await potret(page, 'v273-4-setelan-hp');
      cek('B6 lebar 360 px tanpa gulir mendatar (lokasi, standar, setelan)', w1 <= 361 && w2 <= 361 && w3 <= 361, [w1, w2, w3]);
      cek('B6 tanpa galat halaman (HP)', galat.length === 0, galat);
      await ctx.close();
    }
    // ---------------- B7 · Guru tanpa menu
    {
      const { ctx, page } = await masuk(browser, URL, { peran: 'Guru', kelas: ['VIII-D'] });
      const tersembunyi = await page.evaluate(() => { const b = document.querySelector('#navMenu [data-view="sarprasatur"]'); return !b || b.classList.contains('hidden'); });
      cek('B7 Guru: menu Pengaturan Sarpras tersembunyi', tersembunyi);
      await ctx.close();
    }
    // ---------------- B8 · Admin bukan pengelola: hanya-baca
    {
      const { ctx, page, galat } = await masuk(browser, URL, { peran: 'Admin' });
      await bukaAtur(page);
      const r1 = await page.evaluate(() => ({ baca: !!document.querySelector('.sp-baca'), tulis: document.querySelectorAll('[data-sp-tulis]').length }));
      await klikTab(page, 'setelan');
      const r2 = await page.evaluate(() => document.querySelectorAll('[data-sp-tulis]').length);
      cek('B8 Admin bukan pengelola: hanya-baca, tanpa tombol tulis', r1.baca && r1.tulis === 0 && r2 === 0, { r1, r2 });
      cek('B8 tanpa galat halaman', galat.length === 0, galat);
      await ctx.close();
    }
    // ---------------- C1 · regresi
    {
      const { ctx, page, galat } = await masuk(browser, URL, { super: true, pengelola: true });
      await page.evaluate(() => navigateTo('siswa')); await page.waitForTimeout(1200);
      await page.evaluate(() => { try { catatDariMana(null); } catch (e) { window.__GALAT_CATAT = e.message; } });
      await page.waitForSelector('#fNisn', { timeout: 6000 }).catch(() => {});
      const catat = await page.evaluate(() => !!document.querySelector('#fNisn') && !window.__GALAT_CATAT);
      await tutupSwal(page);
      await page.evaluate(() => navigateTo('dashboard')); await page.waitForTimeout(1200);
      cek('C1 regresi: Profil Santri, modal Catat, Ringkasan tanpa galat', catat && galat.length === 0, { catat, galat });
      await ctx.close();
    }
  } finally { await browser.close(); server.close(); }
  console.log(`\n${lulus} lulus, ${gagal} gagal`);
  process.exit(gagal ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
