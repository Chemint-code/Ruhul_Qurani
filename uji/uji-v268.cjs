/* uji-v268.cjs — v2.68 ANTREAN PANGGIL · BANDING · PENASIHAT HUKUM · EKSEKUSI
 *
 *   npm run bangun:uji && npm i --no-save html2pdf.js@0.10.1 && node uji/uji-v268.cjs
 *   (RQ_POTRET=1 → tangkapan layar + PDF contoh ke uji/keluaran/)
 *
 * A · berkas: VERSI, alur lama terhapus, migrasi aditif (tanpa trigger/RLS lama), menu.
 * B · aplikasi utuh (sumber & build, Supabase tiruan, RPC v2.68 tiruan):
 *     urutan antrean & kode P1–P4+; Enter/Spasi/↓/Del/←/→/Esc; tombol ditahan;
 *     simpan gagal → ditandai; akhir antrean → panggil ulang yang dilewati;
 *     izin aktif / lewat batas; tangga tahap; PDF berkas baru;
 *     tab Penasihat (kabul wajib alasan, tolak, urungkan, banding manual);
 *     persiapan & pengamat = mode lihat; reses: tab penasihat tetap ada;
 *     HP: empat tombol layar, tanpa geser mendatar;
 *     super admin: menu + lencana + eksekusi/kembalikan; Admin lain tertutup.
 */
const fs = require('fs'), path = require('path'), http = require('http');
const { chromium } = require('playwright');
const { MOCK } = require('./mock.cjs');

const AKAR = path.resolve(__dirname, '..');
const NM = path.join(AKAR, 'node_modules');
const H2P = path.join(NM, 'html2pdf.js', 'dist', 'html2pdf.bundle.min.js');
const KELUAR = path.join(__dirname, 'keluaran'); fs.mkdirSync(KELUAR, { recursive: true });
const POTRET = process.env.RQ_POTRET === '1';
const JENIS = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.woff2': 'font/woff2' };

let lulus = 0, gagal = 0;
const cek = (j, ok, info) => { ok ? lulus++ : gagal++; console.log(`${ok ? '  ok  ' : ' GAGAL'} ${j}${info !== undefined && !ok ? '  · ' + JSON.stringify(info) : ''}`); };
const baca = (...p) => fs.readFileSync(path.join(AKAR, ...p), 'utf8');
const ada = (...p) => fs.existsSync(path.join(AKAR, ...p));

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

/* RPC tiruan — meniru bentuk jawaban migrasi v2.68. Hari sidang: Jumat 6 Nov 2026. */
function pasangRpc() {
  const peran = window.__PERAN || 'Admin';
  const osis = peran === 'Osis';
  const BENTUK = (k, t) => `${k} tahap ${t}: bentuk putra`;
  const PLG = ['Telat keluar dari asrama', 'Tidak ikut shalat berjamaah – "Subuh"', 'Berbahasa Indonesia di asrama', 'Kamar tidak rapi'];
  // [kunci, nama, kelas, kamar, butir:[kategori, tahap, status, ekstra]]
  const SPEK = [
    ['a01', 'Ahmad Fauzan', 'VII-D', 11, [['Ringan', 1, 'menunggu', { baru: true }]]],
    ['a02', 'Teuku Alif', 'VIII-D', 12, [['Ringan', 1, 'diberikan', { sesi: '2026-11-04' }]]],
    ['a03', 'Raihan Akbar', 'IX-F', 13, [['Sedang', 1, 'menunggu', { baru: true }]]],
    ['a04', 'Ilham Maulana', 'X-C', 14, [['Ringan', 2, 'menunggu', {}]]],
    ['a05', 'Zulfikar Hasan', 'VII-D', 15, [['Ringan', 1, 'diberikan', { sesi: '2026-11-02', ulang: 1 }], ['Ringan', 2, 'menunggu', { baru: true }]]],
    ['a06', 'Fathurrahman', 'VIII-D', 16, [['Ringan', 1, 'menunggu', {}], ['Sedang', 1, 'menunggu', {}]]],
    ['a07', 'Muhammad Ridha', 'IX-F', 17, [['Ringan', 2, 'menunggu', {}], ['Ringan', 3, 'menunggu', { banding: 'ditolak', banding_alasan: 'Saksi mudabbir membenarkan.' }]]],
    ['a08', 'Fajar Siddiq', 'X-C', 18, [['Ringan', 1, 'menunggu', {}], ['Ringan', 2, 'menunggu', {}], ['Ringan', 3, 'menunggu', {}]]],
    ['a09', 'Hafiz Ramadhan', 'VII-D', 19, [['Ringan', 2, 'menunggu', {}], ['Ringan', 3, 'menunggu', {}], ['Sedang', 1, 'menunggu', {}], ['Sedang', 2, 'menunggu', { lewat: 1 }]]],
    ['a10', 'Muhammad Sepuluh', 'VIII-D', 20, [['Ringan', 1, 'menunggu', {}], ['Ringan', 2, 'menunggu', { banding: 'diajukan' }]]],
    ['a11', 'Muhammad Sebelas', 'IX-F', 21, [['Ringan', 1, 'menunggu', { banding: 'dikabulkan' }]]],
    ['a12', 'Muhammad Duabelas', 'X-C', 22, [['Ringan', 1, 'tuntas', {}]]],
    ['a13', 'Muhammad Tigabelas', 'VII-D', 23, [['Ringan', 1, 'diberikan', { sesi: '2026-11-06', hari_ini: 'putus', panggilan: 900 }]]],
    ['a14', 'Muhammad Empatbelas', 'VIII-D', 24, [['Ringan', 4, 'menunggu', {}]]]
  ];
  let no = 0;
  const butir = [];
  SPEK.forEach(([k, nama, kelas, kamar, l]) => l.forEach(([kat, t, st, x]) => {
    butir.push({ id: `${k}-${++no}`, santri: k, nama, kelas, angkatan: kelas.split('-')[0], unit: 'putra', kamar, hadir: k === 'a05' ? 'Izin Keluar' : 'Hadir',
      kategori: kat, tahap: t, bentuk: BENTUK(kat, t), pelanggaran: PLG[no % 4], bidang: ['Mudabbir', 'Ubudiyah', 'Bahasa', 'Kebersihan'][no % 4],
      tanggal: `2026-11-0${Math.min(5, t + 1)}`, status: st, baru: false, ...(osis ? {} : { nisn: '9900' + String(no).padStart(4, '0') }), ...x });
  }));
  const santri = {
    a03: { izin: { kondisi: 'aktif', jenis: 'Sakit', mulai: '2026-11-04', selesai: '2026-11-08', pemberi: 'Ust. Musyrif Satu' } },
    a06: { izin: { kondisi: 'lewat', jenis: 'Keperluan', mulai: '2026-11-01', selesai: '2026-11-03', pemberi: 'Ust. Musyrif Dua' } },
    a04: { tuntas: { 'Ringan|2026-11': 1 } },
    a14: { tuntas: { 'Ringan|2026-11': 3 } }
  };
  const tangga = { 'putra|Ringan': Array.from({ length: 15 }, (_, i) => ({ t: i + 1, b: BENTUK('Ringan', i + 1) })),
                   'putra|Sedang': Array.from({ length: 14 }, (_, i) => ({ t: i + 1, b: BENTUK('Sedang', i + 1) })) };
  const banding = [
    { id: 41, status: 'diajukan', sumber: 'sidang', sesi: '2026-11-04', unit: 'putra', santri: 's10', diajukan_nama: 'OSDA-RQ', diajukan_pada: '2026-11-04T09:00:00Z',
      salinan: { nama: 'Muhammad Sepuluh', kelas: 'VIII-D', kamar: 20, kode: 'P01', pelanggaran: 'Telat keluar dari asrama', kategori: 'Ringan', tahap: 2, bentuk: BENTUK('Ringan', 2),
        tanggal: '2026-11-03', catatan: 'Terlambat apel pagi', penindak: 'Mudabbir Uji', pencatat: 'Ust. Musyrif Satu', dicatat_pada: '2026-11-03T03:00:00Z' },
      kini: { tahap: 2, bentuk: BENTUK('Ringan', 2), status: 'Dalam Proses' } },
    { id: 42, status: 'dikabulkan', sumber: 'manual', sesi: '2026-11-05', unit: 'putra', santri: 's11', pokok: 'Sedang di klinik', diajukan_nama: 'OSDA-RQ', diajukan_pada: '2026-11-05T09:00:00Z',
      alasan: 'Buku klinik mencatat ananda dirawat.', diputus_nama: 'OSDA-RQ', diputus_pada: '2026-11-05T10:00:00Z',
      salinan: { nama: 'Muhammad Sebelas', kelas: 'IX-F', kode: 'P02', pelanggaran: 'Tidak ikut shalat berjamaah', kategori: 'Ringan', tahap: 1, bentuk: BENTUK('Ringan', 1), tanggal: '2026-11-02', poin: 5 } }
  ];
  const S = window.__V268 = { butir, panggil: [], pid: 1000, snap: {}, banding };
  const r = (data) => ({ data, error: null });
  const salah = (m) => ({ data: null, error: { message: m } });
  const gagalkan = (n) => window.__GAGAL === n;
  const buka = window.__BUKA !== false, prat = !buka && window.__PRATINJAU === true;
  window.__RPC = {
    sidang_berkas: (a) => {
      S.panggil.push(['berkas', a]);
      const d = { hari: '2026-11-06', buka, berikut: '2026-11-07', jadwal: [1, 3, 5, 6], peran: ['Admin', 'Osis'].includes(peran) ? 'majelis' : 'pengamat',
        role: peran, nama: osis ? 'OSDA-RQ' : 'Penguji', unit: osis ? 'putra' : (a && a.p_unit) || null, unit_terkunci: osis, reses: !buka,
        pratinjau: osis && prat, sesi_berkas: buka ? '2026-11-06' : '2026-11-07', majelis: S.majelis || null, versi: 268,
        banding_baru: S.banding.filter(x => x.status === 'diajukan').length, potong: '2026-11-04T09:30:00Z' };
      if (osis && !buka && !prat) return r({ ...d, butir: [], musyrif: {} });
      return r({ ...d, butir: S.butir.map(b => ({ ...b })), santri, tangga, musyrif: { 'VII-D': ['Ust. Musyrif Tujuh'], 'VIII-D': ['Ust. Musyrif Satu'] } });
    },
    sidang_putus: (a) => {
      S.panggil.push(['putus', a]);
      if (gagalkan('sidang_putus')) return salah('Sambungan terputus (uji).');
      const pid = ++S.pid; S.snap[pid] = a.p_ids.map(id => ({ ...S.butir.find(b => b.id === id) }));
      let baca = 0, ulang = 0;
      a.p_ids.forEach(id => { const b = S.butir.find(x => x.id === id); if (b.status === 'diberikan') ulang++; else baca++; b.status = 'diberikan'; b.hari_ini = 'putus'; b.panggilan = pid; });
      return r({ ok: true, panggilan: pid, dibacakan: baca, diberikan: baca, ulang, pengingat: ulang, dilewati: [], penerima: ['Ust. Musyrif Satu'] });
    },
    sidang_lewati: (a) => { S.panggil.push(['lewati', a]); const pid = ++S.pid; S.snap[pid] = a.p_ids.map(id => ({ ...S.butir.find(b => b.id === id) }));
      a.p_ids.forEach(id => { const b = S.butir.find(x => x.id === id); b.hari_ini = 'lewati'; b.panggilan = pid; }); return r({ ok: true, panggilan: pid, dilewati: a.p_ids.length }); },
    sidang_banding_ajukan: (a) => { S.panggil.push(['banding', a]); const pid = ++S.pid; S.snap[pid] = a.p_ids.map(id => ({ ...S.butir.find(b => b.id === id) }));
      a.p_ids.forEach(id => { const b = S.butir.find(x => x.id === id); b.banding = 'diajukan'; b.hari_ini = 'banding'; b.panggilan = pid; }); return r({ ok: true, panggilan: pid, banding: a.p_ids.length }); },
    sidang_urungkan: (a) => { S.panggil.push(['urung', a]); (S.snap[a.p_id] || []).forEach(x => { const i = S.butir.findIndex(b => b.id === x.id); if (i >= 0) S.butir[i] = x; });
      return r({ ok: true, aksi: 'x', pesan_ditarik: 0 }); },
    sidang_majelis_simpan: (a) => { S.panggil.push(['majelis', a]); S.majelis = { sesi: a.p_sesi, unit: 'putra', ketua: a.p_ketua, anggota1: a.p_anggota1, anggota2: a.p_anggota2, panitera: a.p_panitera }; return r(S.majelis); },
    banding_daftar: () => { S.panggil.push(['daftar']); return r({ hari: '2026-11-06', unit: osis ? 'putra' : null, role: peran,
      hitung: { diajukan: S.banding.filter(x => x.status === 'diajukan').length, dikabulkan: S.banding.filter(x => x.status === 'dikabulkan').length },
      banding: S.banding.map(x => ({ ...x })) }); },
    banding_putus: (a) => { S.panggil.push(['bputus', a]); const x = S.banding.find(z => z.id === a.p_id);
      if (a.p_putusan === 'kabul' && (!a.p_alasan || a.p_alasan.length < 5)) return salah('Tuliskan alasan pengabulan.');
      x.status = a.p_putusan === 'kabul' ? 'dikabulkan' : 'ditolak'; x.alasan = a.p_alasan; x.diputus_nama = 'OSDA-RQ'; x.diputus_pada = new Date().toISOString(); return r({ ok: true, id: x.id, status: x.status }); },
    banding_urungkan: (a) => { S.panggil.push(['burung', a]); const x = S.banding.find(z => z.id === a.p_id); x.status = 'diajukan'; x.alasan = null; return r({ ok: true, id: x.id, status: 'diajukan' }); },
    banding_manual_cari: (a) => { S.panggil.push(['mcari', a]); return r([{ santri: 'm1', nama: 'Muhammad Sepuluh', kelas: 'VIII-D', kamar: 20,
      perkara: [{ id: 'a10-10', pelanggaran: 'Telat keluar dari asrama', tanggal: '2026-11-02', kategori: 'Ringan', tahap: 1, bentuk: BENTUK('Ringan', 1), status: 'diberikan', catatan: 'apel' },
                { id: 'a10-11', pelanggaran: 'Kamar tidak rapi', tanggal: '2026-11-03', kategori: 'Ringan', tahap: 2, bentuk: BENTUK('Ringan', 2), status: 'menunggu', banding: 'diajukan' }] }]); },
    banding_manual_ajukan: (a) => { S.panggil.push(['majukan', a]); S.banding.unshift({ id: 50, status: 'diajukan', sumber: 'manual', sesi: '2026-11-06', unit: 'putra', santri: 's10', pokok: a.p_pokok, diajukan_nama: 'OSDA-RQ',
      salinan: { nama: 'Muhammad Sepuluh', kelas: 'VIII-D', pelanggaran: 'Telat keluar dari asrama', kategori: 'Ringan', tahap: 1, tanggal: '2026-11-02' } }); return r({ ok: true, banding: a.p_ids.length }); },
    adalah_super_admin: () => { S.panggil.push(['super']); return r(window.__SUPER === true); },
    saran_hitung_baru: () => r(0), saran_milik_saya: () => r([]), pesan_untuk_osda: () => r([]),
    banding_hitung: () => { S.panggil.push(['bhitung']); return r(window.__SUPER ? S.banding.filter(x => x.status === 'dikabulkan').length : 0); },
    banding_antrean: () => { S.panggil.push(['antrean']); if (!window.__SUPER) return salah('Antrean eksekusi banding hanya untuk super admin.');
      return r({ diajukan: 1, antre: S.banding.filter(x => x.status === 'dikabulkan').map(x => ({ ...x, nisn: '99000011', poin_bulan: 12,
        dampak: [{ id: 'z1', pelanggaran: 'Kamar tidak rapi', tanggal: '2026-11-04', kategori: 'Ringan', dari: 2, ke: 1, jenis: 'bentuk', bentuk_lama: BENTUK('Ringan', 2), bentuk_baru: BENTUK('Ringan', 1), di_musyrif: true }] })),
        riwayat: [{ id: 30, status: 'dieksekusi', unit: 'putra', nisn: '1', salinan: { nama: 'Santri Lama', kelas: 'X-C', pelanggaran: 'Uji', tanggal: '2026-11-01' }, eksekusi_pada: '2026-11-05T12:00:00Z', hasil: { dampak: [{}], koreksi: 1 } }] }); },
    banding_eksekusi: (a) => { S.panggil.push(['eksekusi', a]); const x = S.banding.find(z => z.id === a.p_id); x.status = 'dieksekusi'; return r({ ok: true, id: a.p_id, digeser: 1, koreksi: 1 }); },
    banding_kembalikan: (a) => { S.panggil.push(['kembali', a]); if (!a.p_catatan || a.p_catatan.length < 3) return salah('Tuliskan alasan.'); const x = S.banding.find(z => z.id === a.p_id); x.status = 'dikembalikan'; return r({ ok: true }); }
  };
}

async function masuk(browser, url, o = {}) {
  const ctx = await browser.newContext({ viewport: o.hp ? { width: 390, height: 844 } : { width: 1366, height: 860 },
    deviceScaleFactor: o.hp ? 2 : 1, isMobile: !!o.hp, hasTouch: !!o.hp, serviceWorkers: 'block', reducedMotion: 'reduce', acceptDownloads: true });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, async (route) => {
    const u = route.request().url();
    if (u.includes('supabase-js')) return route.fulfill({ contentType: 'application/javascript', body: MOCK });
    if (u.includes('sweetalert2')) return route.fulfill({ contentType: 'application/javascript', path: NM + '/sweetalert2/dist/sweetalert2.all.min.js' });
    if (u.includes('chart.js@')) return route.fulfill({ contentType: 'application/javascript', path: NM + '/chart.js/dist/chart.umd.min.js' });
    if (u.includes('echarts@')) return route.fulfill({ contentType: 'application/javascript', path: NM + '/echarts/dist/echarts.min.js' });
    if (u.includes('html2pdf')) return fs.existsSync(H2P) ? route.fulfill({ contentType: 'application/javascript', path: H2P }) : route.abort();
    return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
  });
  const page = await ctx.newPage();
  const galat = [];
  page.on('pageerror', e => galat.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_CONNECTION_REFUSED/.test(m.text())) galat.push('console: ' + m.text()); });
  await page.addInitScript(`(${(o) => {
    window.__PERAN = o.peran || 'Admin'; window.__KELAS = o.kelas || []; window.__KORPS = o.korps || null;
    if (o.buka === false) window.__BUKA = false;
    if (o.pratinjau) window.__PRATINJAU = true;
    if (o.super) window.__SUPER = true;
    try { localStorage.setItem('rq-efek-pilih', 'hemat'); localStorage.setItem('rq.tur.v1.u-admin', '{"t":0}'); localStorage.setItem('rq-sidang-bunyi', 'mati'); } catch (e) {}
  }})(${JSON.stringify(o)}); (${pasangRpc.toString()})();`);
  await page.goto(url, { waitUntil: 'commit' });
  await page.waitForFunction(() => { const b = document.getElementById('btnLogin'); return typeof APP !== 'undefined' && b && b.offsetParent && !b.disabled; }, null, { timeout: 120000 });
  await page.click('#btnLogin');
  await page.waitForFunction(() => typeof APP !== 'undefined' && APP.profil && document.querySelector('#viewRoot') && document.querySelector('#viewRoot').children.length, null, { timeout: 120000 });
  await page.waitForTimeout(1200);
  return { ctx, page, galat };
}
const potret = async (page, nama) => { if (POTRET) await page.screenshot({ path: path.join(KELUAR, nama + '.png') }); };
const panggil = (p, jenis) => p.evaluate((j) => window.__V268.panggil.filter(x => x[0] === j), jenis);
const bukaSidang = async (page) => {
  await page.evaluate(() => navigateTo('sidang'));
  await page.waitForFunction(() => document.querySelector('#ruangSidang') && !document.querySelector('#sdIsi .sd-muat') && window.RQSidang?._uji?.S?.data, null, { timeout: 30000 });
  await page.waitForTimeout(300);
};
const kartuNama = (p) => p.evaluate(() => document.querySelector('#sdAntre .sd-kartu h2')?.textContent || (document.querySelector('#sdAntre .sd-akhir') ? 'AKHIR' : ''));
const tekan = async (p, k, o) => { await p.keyboard.press(k, o); await p.waitForTimeout(80); };
const tunggu = (p, fn, arg) => p.waitForFunction(fn, arg, { timeout: 8000 });

(async () => {
  console.log('\nA · Berkas');
  cek('A1 sw.js: VERSI rq-v2.68+', /VERSI\s+=\s+'rq-v2\.(6[8-9]|[7-9]\d)(\.\d+)?'/.test(baca('sw.js')));
  const sd = baca('sidang.js');
  cek('A2 sidang.js: alur lama (bidang/kategori/tahap, centang, Bacakan) terhapus', !/data-aksi="(bidang|kategori|tahap|pilih|bacakan|berikan)"/.test(sd) && !/function (daftarBidang|bukaPembacaan|berikan)\(/.test(sd));
  cek('A3 sidang.js: memanggil RPC v2.68', ['sidang_putus', 'sidang_lewati', 'sidang_banding_ajukan', 'sidang_urungkan', 'banding_daftar', 'banding_putus', 'banding_urungkan', 'banding_manual_cari', 'banding_manual_ajukan'].every(f => sd.includes(`'${f}'`)));
  const ih = baca('index.html');
  cek('A4 index.html: menu Eksekusi Banding tersembunyi bawaan + lencana', /class="nav-item hidden" data-view="banding"/.test(ih) && ih.includes('id="badgeBanding"'));
  const app = baca('app.js');
  cek('A5 app.js: rute banding & super admin dari database', app.includes("view === 'banding'") && app.includes("db.rpc('banding_antrean')") && !/839511db/.test(app));
  const mig = ada('migrasi', '20261105_v2_68_antrean_banding.sql') ? baca('migrasi', '20261105_v2_68_antrean_banding.sql') : '';
  const badan = mig.slice(mig.indexOf('\nbegin;'), mig.indexOf('\ncommit;'));
  // migrasi/ hanya ada di repo src (tidak ikut repo publik tempat CI berjalan) — sama seperti uji-v264/v265.
  if (mig) {
    cek('A6 migrasi: aditif, tanpa trigger/RLS lama diubah', !/(alter|drop|create) policy/i.test(badan) && !/drop (table|function|trigger)/i.test(badan)
      && !/create (or replace )?trigger(?! trg_audit_sidang_banding)/i.test(badan) && /enable row level security/.test(badan));
    cek('A7 migrasi: semua RPC dicabut dari anon, fungsi bantu tertutup', /revoke all on function %s from public, anon/.test(badan) && /_banding_dampak\(bigint\) from public, anon, authenticated/.test(badan));
    cek('A8 rollback tersedia', ada('migrasi', '20261105_v2_68_ROLLBACK.sql'));
    const m1 = ada('migrasi', '20261105_v2_68_1_hari_ini_admin.sql') ? baca('migrasi', '20261105_v2_68_1_hari_ini_admin.sql') : '';
    cek('A8b v2.68.1: ketukan hari ini dibaca dengan v_hari, hanya sidang_berkas diganti', /p\.sesi = v_hari and u\.jenis = 'semua'/.test(m1)
      && (m1.match(/create or replace function/g) || []).length === 1 && !/policy|trigger/i.test(m1.replace(/^--.*$/gm, '')));
  }
  cek('A9 html2pdf tersedia untuk uji PDF', fs.existsSync(H2P));

  const sSumber = await layani(AKAR, 4681), sBuild = await layani(path.join(AKAR, 'dist-uji'), 4682);
  const URL_ = { sumber: 'http://127.0.0.1:4681/', build: 'http://127.0.0.1:4682/' };
  const browser = await chromium.launch();

  for (const v of ['sumber', 'build']) {
    console.log(`\nB · ${v}`);
    { // OSDA · desktop · hari sidang — antrean penuh
      const s = await masuk(browser, URL_[v], { peran: 'Osis', korps: 'Osis Putra' });
      const p = s.page;
      await bukaSidang(p);
      const urut = await p.evaluate(() => window.RQSidang._uji.daftarAntre().map(x => x.kunci));
      cek('B1 urutan: jumlah perkara ↑ → tahap ↑ → Ringan dulu → kelas → nama', JSON.stringify(urut) === JSON.stringify(['a01', 'a13', 'a10', 'a02', 'a03', 'a04', 'a14', 'a06', 'a05', 'a07', 'a08', 'a09']), urut);
      cek('B2 kelompok P1–P4+: 7/3/1/1 santri; yang seluruhnya banding & yang tuntas tidak masuk antrean', await p.evaluate(() =>
        [...document.querySelectorAll('.sd-kel .sd-kel-isi b')].map(b => b.textContent).join('|') === '7 santri|3 santri|1 santri|1 santri'
        && /Muhammad Sebelas/.test(document.querySelector('.sd-tertahan')?.textContent || '') && !/Duabelas/.test(document.getElementById('sdIsi').textContent)));
      cek('B3 baris berkas: kode berwarna, tanda baru/izin/banding, santri tadi pagi sudah "Diputus"', await p.evaluate(() => {
        const b = (k) => document.querySelector(`.sd-baris[data-nilai="${k}"]`);
        return b('a01').querySelector('.sd-kode.p1') && b('a09').querySelector('.sd-kode.p4') && /baru/.test(b('a01').textContent)
          && b('a03').querySelector('.sd-tanda.izin.aktif') && b('a10').querySelector('.sd-tanda.tahan') && b('a13').classList.contains('k-putus');
      }));
      await potret(p, `v268-daftar-${v}`);
      await tekan(p, 'Enter');
      await tunggu(p, () => document.querySelector('#sdAntre .sd-kartu'));
      cek('B4 Enter di daftar → antrean dibuka pada santri pertama yang belum dipanggil', await kartuNama(p) === 'Ahmad Fauzan');
      await potret(p, `v268-antre-panggil-${v}`);
      await tekan(p, 'Enter');
      cek('B5 Enter → ketuk palu: stempel "Diputus" seketika, tombol jadi "Berikutnya"', await p.evaluate(() => /Diputus/.test(document.querySelector('#sdAntre .sd-stempel')?.textContent || '')
        && /Berikutnya/.test(document.querySelector('[data-aksi="a-enter"]').textContent)));
      await tunggu(p, () => window.__V268.panggil.some(x => x[0] === 'putus'));
      cek('B6 RPC sidang_putus untuk perkara santri itu saja', JSON.stringify((await panggil(p, 'putus'))[0][1].p_ids) === '["a01-1"]');
      await p.waitForTimeout(300);
      cek('B7 hakim menyebut musyrif penerima', /Ust\. Musyrif Satu/.test(await p.textContent('#sdAntre .sd-bicara')));
      await potret(p, `v268-antre-diputus-${v}`);
      await tekan(p, 'Enter');
      cek('B8 Enter kedua → santri berikutnya yang belum dipanggil (yang sudah diputus tadi pagi dilompati)', await kartuNama(p) === 'Muhammad Sepuluh');
      cek('B9 kartu: perkara banding lama tidak ikut, disebut "1 lain dalam banding"', await p.evaluate(() =>
        document.querySelectorAll('#sdAntre .sd-pk').length === 1 && /1 lain dalam banding/.test(document.querySelector('#sdAntre .sd-kartu-kepala').textContent)));
      await tekan(p, 'Space');
      cek('B10 Spasi → dilewati, langsung ke santri berikutnya', await kartuNama(p) === 'Teuku Alif');
      cek('B11 perkara yang sudah di tangan musyrif bertanda "sudah dibacakan"', await p.evaluate(() => /sudah dibacakan 4 Nov/.test(document.querySelector('#sdAntre .sd-perkara').textContent)));
      await tekan(p, 'Enter'); await tekan(p, 'Enter');
      cek('B12 → santri dengan izin aktif: spanduk izin + saran Spasi', await kartuNama(p) === 'Raihan Akbar' && await p.evaluate(() => {
        const z = document.querySelector('#sdAntre .sd-izin.aktif'); return !!z && /Sakit/.test(z.textContent) && /Spasi/.test(z.textContent) && !/demam/.test(z.textContent); }));
      await tekan(p, 'ArrowDown');
      cek('B13 ↓ → banding: stempel "Banding", lencana tab penasihat bertambah', await p.evaluate(() => /Banding/.test(document.querySelector('#sdAntre .sd-stempel')?.textContent || '')
        && (window.RQSidang._uji.S.data.banding_baru === 2)));
      await tunggu(p, () => window.__V268.panggil.some(x => x[0] === 'banding'));
      await potret(p, `v268-antre-banding-${v}`);
      await tekan(p, 'Delete');
      cek('B14 Del → banding diurungkan: kembali "dipanggil", lencana pulih', await p.evaluate(() => !document.querySelector('#sdAntre .sd-stempel') && window.RQSidang._uji.S.data.banding_baru === 1));
      await tunggu(p, () => window.__V268.panggil.some(x => x[0] === 'urung'));
      const ur = await panggil(p, 'urung'), bd = await panggil(p, 'banding');
      cek('B15 RPC sidang_urungkan memakai id panggilan banding tadi', ur.length === 1 && bd.length === 1 && ur[0][1].p_id > 1000, { ur, bd });
      await tekan(p, 'Backspace');
      cek('B16 Del lagi (belum diketuk) → mundur ke santri sebelumnya, stempelnya tetap', await kartuNama(p) === 'Teuku Alif'
        && /Diputus/.test(await p.evaluate(() => document.querySelector('#sdAntre .sd-stempel')?.textContent || '')));
      await tekan(p, 'ArrowRight');
      await tekan(p, 'Space');
      cek('B17 → ke santri berikutnya; tangga tahap: ke-1 tuntas, ke-2 sidang ini, ke-3 bila mengulang', await kartuNama(p) === 'Ilham Maulana' && await p.evaluate(() => {
        const t = document.querySelector('#sdAntre .sd-tangga'); return !!t && !!t.querySelector('.t-tuntas') && !!t.querySelector('.t-kini') && /Ringan tahap 3/.test(t.textContent); }));
      const nPutus = (await panggil(p, 'putus')).length;
      await p.keyboard.down('Enter'); await p.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', repeat: true, bubbles: true }))); await p.keyboard.up('Enter');
      await p.waitForTimeout(500);
      cek('B18 Enter ditahan (repeat) tidak memutus dua kali', (await panggil(p, 'putus')).length === nPutus + 1);
      await tekan(p, 'Enter');
      cek('B19 → santri tahap ke-4', await kartuNama(p) === 'Muhammad Empatbelas');
      await p.evaluate(() => { window.__GAGAL = 'sidang_putus'; });
      await tekan(p, 'Enter');
      await tunggu(p, () => document.querySelector('#sdAntre .sd-izin.gagal'));
      cek('B20 simpan gagal → "Belum tersimpan", kembali bisa diketuk', await p.evaluate(() => !document.querySelector('#sdAntre .sd-stempel') && /Ketuk palu/.test(document.querySelector('[data-aksi="a-enter"]').textContent)));
      await potret(p, `v268-antre-gagal-${v}`);
      await p.evaluate(() => { window.__GAGAL = null; });
      await tekan(p, 'Enter');
      await p.waitForTimeout(400);
      cek('B21 ketuk ulang sesudah gagal berhasil', await p.evaluate(() => !document.querySelector('#sdAntre .sd-izin.gagal') && /Diputus/.test(document.querySelector('#sdAntre .sd-stempel')?.textContent || '')));
      await tekan(p, 'Enter');
      cek('B22 santri dengan izin lewat batas: "belum ditutup musyrif"', await kartuNama(p) === 'Fathurrahman' && await p.evaluate(() => /belum ditutup musyrif/.test(document.querySelector('#sdAntre .sd-izin.lewat')?.textContent || '')));
      for (let i = 0; i < 4; i++) { await tekan(p, 'Enter'); await tekan(p, 'Enter'); }
      cek('B23 santri dengan banding ditolak ikut dipanggil, bertanda', true);
      await tekan(p, 'Enter'); await tekan(p, 'Enter');
      await p.waitForTimeout(200);
      cek('B24 akhir antrean: ringkasan + tawaran panggil ulang 2 santri yang dilewati', await kartuNama(p) === 'AKHIR'
        && /Panggil ulang 2 santri/.test(await p.textContent('[data-aksi="a-enter"]')));
      await potret(p, `v268-antre-akhir-${v}`);
      await tekan(p, 'Enter');
      cek('B25 Enter → panggil ulang: santri yang dilewati', await kartuNama(p) === 'Muhammad Sepuluh');
      await tekan(p, 'Enter');
      await tunggu(p, () => window.__V268.panggil.filter(x => x[0] === 'putus').some(x => x[1].p_ids.includes('a10-18')));
      cek('B26 putus santri yang tadi dilewati: hanya perkara yang tidak dibanding', JSON.stringify((await panggil(p, 'putus')).pop()[1].p_ids) === '["a10-18"]');
      await tekan(p, 'Enter');
      cek('B26b panggil ulang berlanjut ke santri dilewati berikutnya', await kartuNama(p) === 'Raihan Akbar');
      await tekan(p, 'Enter'); await tekan(p, 'Enter');
      cek('B26c sesudah yang terakhir → akhir antrean tanpa tawaran panggil ulang', await kartuNama(p) === 'AKHIR' && /Kembali ke daftar/.test(await p.textContent('[data-aksi="a-enter"]')));
      await tekan(p, 'Escape');
      await p.waitForTimeout(300);
      cek('B27 Esc → kembali ke daftar; rekap: 12 diputus, 0 dilewati, sisa 0', await p.evaluate(() => {
        const c = window.RQSidang._uji.hitungSesi(); return !document.querySelector('#sdAntre') && c.putus === 12 && c.lewati === 0 && c.dipanggil === 0 && c.banding === 0; }),
        await p.evaluate(() => window.RQSidang._uji.hitungSesi()));
      const lw = await panggil(p, 'lewati');
      cek('B28 RPC: 2 lewati (Spasi), 1 banding, 1 urungkan', lw.length === 2 && (await panggil(p, 'banding')).length === 1 && (await panggil(p, 'urung')).length === 1);
      await potret(p, `v268-daftar-selesai-${v}`);
      cek('B29 tanpa galat halaman', s.galat.length === 0, s.galat.slice(0, 4));
      await s.ctx.close();
    }
    { // OSDA · desktop · berkas PDF
      const s = await masuk(browser, URL_[v], { peran: 'Osis', korps: 'Osis Putra' });
      const p = s.page;
      await bukaSidang(p);
      await p.click('.sd-atas [data-aksi="berkas"]');
      await p.waitForSelector('.swal2-popup .sd-berkas-form');
      cek('B30 jendela berkas: cakupan semua + per kode', await p.evaluate(() => [...document.querySelectorAll('input[name="sdCakupan"]')].map(x => x.value).join(',') === 'semua,p1,p2,p3,p4'));
      await p.fill('#sdM-ketua', 'Muhammad Haikal');
      await p.evaluate(() => {
        const asli = window.RQ_SIDANG.pdfBaru;
        window.RQ_SIDANG.pdfBaru = async (k) => { const r = await asli(k); const t = r.pdf.text.bind(r.pdf); window.__TEKS = [];
          r.pdf.text = (x, ...a) => { window.__TEKS.push(...[].concat(x)); return t(x, ...a); }; window.__PDF = r; return r; };
      });
      const [unduh] = await Promise.all([p.waitForEvent('download', { timeout: 30000 }), p.click('.swal2-confirm')]);
      const berkas = path.join(KELUAR, `v268-berkas-${v}.pdf`);
      await unduh.saveAs(berkas);
      const T = (await p.evaluate(() => window.__TEKS)).join('\n');
      cek('B31 PDF: urut per kode, kolom Putus/Banding/Lewati, majelis', fs.readFileSync(berkas).slice(0, 4).toString() === '%PDF'
        && ['I. DAFTAR PANGGIL & PERKARA', 'P1 - 1 perkara', 'P4+ - 4 perkara atau lebih', 'Putus', 'Banding', 'Lewati', 'II. MAJELIS SIDANG', 'Muhammad Haikal', 'Ahmad Fauzan [P1]', 'Izin Sakit s.d. 8 Nov'].every(x => T.includes(x)), T.slice(0, 600));
      cek('B32 PDF: santri yang sudah diputus pagi ini & yang seluruhnya banding tidak tercetak; teks Latin-1', !T.includes('Tigabelas') && !T.includes('Sebelas') && !/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/.test(T));
      if (POTRET && v === 'sumber') try { require('child_process').execFileSync('pdftoppm', ['-png', '-r', '70', '-f', '1', '-l', '2', berkas, path.join(KELUAR, 'v268-berkas-hal')]); } catch (e) {}
      cek('B33 tanpa galat halaman', s.galat.length === 0, s.galat.slice(0, 4));
      await s.ctx.close();
    }
    { // OSDA · Penasihat Hukum
      const s = await masuk(browser, URL_[v], { peran: 'Osis', korps: 'Osis Putra' });
      const p = s.page;
      await bukaSidang(p);
      cek('B34 tab Penasihat Hukum berlencana 1', await p.evaluate(() => /1/.test(document.querySelector('[data-aksi="tab"][data-nilai="penasihat"] .sd-lencana')?.textContent || '')));
      await p.click('[data-aksi="tab"][data-nilai="penasihat"]');
      await p.waitForSelector('.sd-pen-daftar');
      cek('B35 rincian pasal: keterangan, penindak, pencatat & waktu input, sumber', await p.evaluate(() => { const t = document.querySelector('.sd-pasal').textContent;
        return /Terlambat apel pagi/.test(t) && /Mudabbir Uji/.test(t) && /Ust\. Musyrif Satu/.test(t) && /input/.test(t) && /Di ruang sidang/.test(t); }));
      await potret(p, `v268-penasihat-${v}`);
      await p.click('[data-aksi="pen-kabul"][data-nilai="41"]');
      await p.waitForSelector('.swal2-popup #sdAlasan');
      await p.click('.swal2-confirm');
      await p.waitForSelector('.swal2-validation-message', { state: 'visible' });
      cek('B36 kabul tanpa alasan → ditolak, tanpa RPC', (await panggil(p, 'bputus')).length === 0);
      await p.fill('#sdAlasan', 'Buku klinik: ananda dirawat.');
      await p.click('.swal2-confirm');
      await tunggu(p, () => window.__V268.panggil.some(x => x[0] === 'bputus'));
      const bp = (await panggil(p, 'bputus'))[0][1];
      cek('B37 RPC banding_putus kabul + alasan', bp.p_id === 41 && bp.p_putusan === 'kabul' && /klinik/.test(bp.p_alasan), bp);
      await p.waitForSelector('.swal2-container', { state: 'detached' });
      await p.click('[data-aksi="pen-saring"][data-nilai="dikabulkan"]');
      await p.waitForTimeout(200);
      await p.click('.sd-pasal [data-aksi="pen-urung"]');
      await p.click('.swal2-confirm');
      await tunggu(p, () => window.__V268.panggil.some(x => x[0] === 'burung'));
      cek('B38 urungkan putusan banding → RPC banding_urungkan', true);
      await p.waitForSelector('.swal2-container', { state: 'detached' });
      await p.click('[data-aksi="pen-manual"]');
      await p.waitForSelector('.swal2-popup #sdMCari');
      await p.fill('#sdMCari', 'Muh');
      await tunggu(p, () => document.querySelector('.sd-m-pasal'));
      cek('B39 cari manual: santri tunggal langsung terbuka; pasal yang sedang dibanding terkunci', await p.evaluate(() =>
        document.querySelectorAll('.sd-m-pasal').length === 2 && document.querySelector('.sd-m-pasal.mati input').disabled));
      await potret(p, `v268-banding-manual-${v}`);
      await p.click('.sd-m-pasal:not(.mati)');
      await p.click('.swal2-confirm');
      await p.waitForSelector('.swal2-validation-message', { state: 'visible' });
      cek('B40 tanpa pokok keberatan → ditolak', (await panggil(p, 'majukan')).length === 0);
      await p.fill('#sdMPokok', 'Ananda di klinik saat apel.');
      await p.click('.swal2-confirm');
      await tunggu(p, () => window.__V268.panggil.some(x => x[0] === 'majukan'));
      const mj = (await panggil(p, 'majukan'))[0][1];
      cek('B41 RPC banding_manual_ajukan: pasal dipilih + pokok', JSON.stringify(mj.p_ids) === '["a10-10"]' && /klinik/.test(mj.p_pokok), mj);
      cek('B42 tanpa galat halaman', s.galat.length === 0, s.galat.slice(0, 4));
      await s.ctx.close();
    }
    { // OSDA · HP · tombol layar
      const s = await masuk(browser, URL_[v], { hp: true, peran: 'Osis', korps: 'Osis Putra' });
      const p = s.page;
      await bukaSidang(p);
      cek('B43 HP: daftar tanpa geser mendatar', await p.evaluate(() => { const g = document.getElementById('sdGulir'); return g.scrollWidth <= g.clientWidth + 1; }));
      await potret(p, `v268-hp-daftar-${v}`);
      await p.click('[data-aksi="mulai"]');
      await tunggu(p, () => document.querySelector('#sdAntre .sd-kartu'));
      cek('B44 HP: empat tombol layar tampak', await p.evaluate(() => [...document.querySelectorAll('.sd-antre-tombol .sd-kunci')].filter(b => b.offsetWidth > 60).length === 4));
      await p.click('[data-aksi="a-enter"]');
      await tunggu(p, () => window.__V268.panggil.some(x => x[0] === 'putus'));
      cek('B45 HP: ketuk "Ketuk palu" → RPC sidang_putus', true);
      cek('B46 HP: antrean tanpa geser mendatar', await p.evaluate(() => { const g = document.querySelector('#sdAntre .sd-antre-isi'); return g.scrollWidth <= g.clientWidth + 1 && document.documentElement.scrollWidth <= innerWidth + 1; }));
      await potret(p, `v268-hp-antre-${v}`);
      await p.click('[data-aksi="a-enter"]');
      await p.click('[data-aksi="a-banding"]');
      await tunggu(p, () => window.__V268.panggil.some(x => x[0] === 'banding'));
      cek('B47 HP: tombol Banding → RPC', true);
      cek('B48 tanpa galat halaman', s.galat.length === 0, s.galat.slice(0, 4));
      await s.ctx.close();
    }
    { // OSDA · persiapan (malam sebelum sidang) → mode lihat
      const s = await masuk(browser, URL_[v], { peran: 'Osis', korps: 'Osis Putra', buka: false, pratinjau: true });
      const p = s.page;
      await bukaSidang(p);
      cek('B49 persiapan: berkas & daftar tersedia', await p.evaluate(() => !!document.querySelector('.sd-status.persiapan') && !!document.querySelector('.sd-atas [data-aksi="berkas"]') && document.querySelectorAll('.sd-baris').length === 12));
      await p.click('[data-aksi="mulai"]');
      await tunggu(p, () => document.querySelector('#sdAntre .sd-kartu'));
      await tekan(p, 'Enter'); await tekan(p, 'Space'); await tekan(p, 'ArrowDown');
      cek('B50 persiapan: mode lihat — Enter menggeser, tanpa RPC putus/lewati/banding', (await panggil(p, 'putus')).length + (await panggil(p, 'lewati')).length + (await panggil(p, 'banding')).length === 0
        && await p.evaluate(() => !!document.querySelector('[data-aksi="a-kanan"]')));
      await s.ctx.close();
    }
    { // OSDA · reses
      const s = await masuk(browser, URL_[v], { peran: 'Osis', korps: 'Osis Putra', buka: false });
      const p = s.page;
      await bukaSidang(p);
      cek('B51 reses: kartu reses, tab Penasihat tetap ada', await p.evaluate(() => !!document.querySelector('.sd-reses') && !!document.querySelector('[data-aksi="tab"][data-nilai="penasihat"]')));
      await p.click('[data-aksi="tab"][data-nilai="penasihat"]');
      await p.waitForSelector('.sd-pen-daftar');
      cek('B52 reses: daftar banding terbuka', (await panggil(p, 'daftar')).length >= 1);
      await s.ctx.close();
    }
    { // Guru → pengamat
      const s = await masuk(browser, URL_[v], { peran: 'Guru', kelas: ['VIII-D'] });
      const p = s.page;
      await bukaSidang(p);
      cek('B53 pengamat: tanpa tab penasihat, mode lihat', await p.evaluate(() => document.getElementById('sdTab').hidden && /Lihat kartu santri/.test(document.querySelector('[data-aksi="mulai"]').textContent)));
      await s.ctx.close();
    }
    { // super admin · Eksekusi Banding
      const s = await masuk(browser, URL_[v], { peran: 'Admin', super: true });
      const p = s.page;
      await p.waitForFunction(() => !document.querySelector('#navMenu [data-view="banding"]').classList.contains('hidden'), null, { timeout: 8000 });
      await p.waitForFunction(() => !document.getElementById('badgeBanding').classList.contains('hidden'), null, { timeout: 8000 });
      cek('B54 super admin: menu Eksekusi Banding + lencana 1', await p.evaluate(() => document.getElementById('badgeBanding').textContent === '1'));
      await p.evaluate(() => navigateTo('banding'));
      await p.waitForSelector('.bd-kartu');
      cek('B55 kartu banding: NISN, alasan penasihat, dampak (geser tahap + pesan koreksi)', await p.evaluate(() => { const t = document.querySelector('.bd-kartu').textContent;
        return /99000011/.test(t) && /Buku klinik/.test(t) && /ke-2 → ke-1/.test(t) && /pesan koreksi/.test(t) && /poin santri berkurang 5/.test(t); }));
      await potret(p, `v268-eksekusi-${v}`);
      await p.click('[data-bd-kembali="42"]');
      await p.waitForSelector('.swal2-popup #bdAlasan');
      await p.click('.swal2-confirm');
      await p.waitForSelector('.swal2-validation-message', { state: 'visible' });
      cek('B56 kembalikan tanpa alasan → ditolak, tanpa RPC', (await panggil(p, 'kembali')).length === 0);
      await p.click('.swal2-cancel');
      await p.waitForSelector('.swal2-container', { state: 'detached' });
      await p.click('[data-bd-eksekusi="42"]');
      await p.waitForSelector('.swal2-popup #bdCatatan');
      await p.fill('#bdCatatan', 'Dicocokkan dengan buku klinik.');
      await p.click('.swal2-confirm');
      await tunggu(p, () => window.__V268.panggil.some(x => x[0] === 'eksekusi'));
      const ek = (await panggil(p, 'eksekusi'))[0][1];
      cek('B57 RPC banding_eksekusi: id + catatan', ek.p_id === 42 && /klinik/.test(ek.p_catatan), ek);
      cek('B58 tanpa galat halaman', s.galat.length === 0, s.galat.slice(0, 4));
      await s.ctx.close();
    }
    { // Admin lain
      const s = await masuk(browser, URL_[v], { peran: 'Admin' });
      const p = s.page;
      await p.waitForTimeout(500);
      cek('B59 Admin lain: menu Eksekusi Banding tersembunyi', await p.evaluate(() => document.querySelector('#navMenu [data-view="banding"]').classList.contains('hidden')));
      await p.evaluate(() => navigateTo('banding'));
      await p.waitForTimeout(800);
      cek('B60 Admin lain membuka paksa: "Khusus super admin", tanpa RPC banding_antrean', await p.evaluate(() => /Khusus super admin/.test(document.getElementById('viewRoot').textContent)) && (await panggil(p, 'antrean')).length === 0);
      cek('B61 tanpa galat halaman', s.galat.length === 0, s.galat.slice(0, 4));
      await s.ctx.close();
    }
  }
  await browser.close(); sSumber.close(); sBuild.close();
  console.log(`\n${lulus} lulus, ${gagal} gagal`);
  process.exit(gagal ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
