/* uji-v264.cjs — v2.64 RUANG SIDANG TA'DIB (OSDA)
 *
 *   npm run bangun:uji && node uji/uji-v264.cjs        (RQ_POTRET=1 → tangkapan layar ke uji/keluaran/)
 *
 * A · berkas: sidang.js ikut INTI sw.js, build Vite, rilis, migrasi menegakkan batas.
 * B · aplikasi utuh (sumber & build, Supabase tiruan, RPC sidang_* tiruan):
 *     OSDA: pintu sidang di Ringkasan, tab Sidang, ruang layar penuh, berkas per santri →
 *     antrean panggil (v2.68): ketuk palu → sidang_putus, berikutnya, lewati, Del → urungkan;
 *     OSDA di luar hari sidang: reses; pengamat (Guru): mode lihat, tanpa tombol putus;
 *     Admin putri: hakim berjilbab; Klinik: menu tidak tampil; keluar → kerangka kembali.
 *   v2.68: alur lama (bidang → kategori → tahap → centang → Bacakan → Sudah diberikan)
 *   dihapus; B5–B13, B20, B23–B24 diperbarui ke antrean panggil. Uji rinci: uji-v268.cjs.
 */
const fs = require('fs'), path = require('path'), http = require('http');
const { chromium } = require('playwright');
const { MOCK } = require('./mock.cjs');

const AKAR = path.resolve(__dirname, '..');
const NM = path.join(AKAR, 'node_modules');
const KELUAR = path.join(__dirname, 'keluaran'); fs.mkdirSync(KELUAR, { recursive: true });
const POTRET = process.env.RQ_POTRET === '1';
const JENIS = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.woff2': 'font/woff2' };

let lulus = 0, gagal = 0;
const cek = (j, ok, info) => { ok ? lulus++ : gagal++; console.log(`${ok ? '  ok  ' : ' GAGAL'} ${j}${info !== undefined ? '  · ' + JSON.stringify(info) : ''}`); };
const baca = (...p) => fs.readFileSync(path.join(AKAR, ...p), 'utf8');

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

/* RPC sidang_* tiruan — meniru bentuk jawaban migrasi v2.64 (+ v2.68: versi 268 & antrean). */
function pasangRpc(o) {
  const BIDANG = ['Mudabbir', 'Mudabbir', 'Mudabbir', 'Ubudiyah', 'Ubudiyah', 'Bahasa'];
  const KELAS = o.unit === 'putri' ? ['VII-C', 'VIII-A', 'X-A'] : ['VII-D', 'VIII-D', 'IX-F', 'X-C'];
  const BENTUK = { Ringan: ['Nasehat', 'Nasehat + Teguran', 'Membersihkan kamar mandi asrama'], Sedang: ['Menghafal 1 halaman mufradat', 'Berdiri di lapangan saat apel'] };
  const butir = Array.from({ length: 64 }, (_, i) => {
    const kat = i % 5 === 0 ? 'Sedang' : 'Ringan', tahap = 1 + (i % 3) % (kat === 'Sedang' ? 2 : 3);
    return { id: 'PBN-' + String(i).padStart(3, '0'), nama: ['Ahmad Fauzan', 'Muhammad Rizki', 'Teuku Alif', 'Cut Nyak Dhien', 'Zulfikar Hasan', 'Raihan Akbar', 'Fathurrahman', 'Ilham Maulana'][i % 8] + ' ' + (i + 1),
      kelas: KELAS[i % KELAS.length], angkatan: KELAS[i % KELAS.length].split('-')[0], unit: o.unit || 'putra', kamar: 10 + (i % 9), hadir: i % 11 === 3 ? 'Izin Keluar' : i % 13 === 5 ? 'Sakit' : 'Hadir',
      kategori: kat, tahap, bentuk: BENTUK[kat][tahap - 1] || BENTUK[kat][0], ket: tahap === 2 ? 'Dilaksanakan ba\'da Ashar, didampingi pengurus bagian.' : undefined,
      pelanggaran: ['Telat keluar dari asrama (pagi/sore)', 'Tidak ikut shalat berjamaah', 'Berbahasa Indonesia di asrama', 'Kamar tidak rapi saat pemeriksaan'][i % 4],
      bidang: BIDANG[i % BIDANG.length], tanggal: '2026-10-' + String(1 + (i % 26)).padStart(2, '0'),
      status: i % 17 === 0 ? 'tuntas' : i % 19 === 0 ? 'diberikan' : 'menunggu' };
  });
  const musyrif = Object.fromEntries(KELAS.map((k, i) => [k, [o.unit === 'putri' ? 'Ustz. Musyrifah ' + (i + 1) : 'Ust. Musyrif ' + (i + 1)]]));
  window.__SIDANG = { butir, panggil: [] };
  const peran = window.__PERAN || 'Admin';
  window.__RPC = {
    sidang_berkas: (a) => {
      window.__SIDANG.panggil.push(['berkas', a]);
      const osis = peran === 'Osis', buka = window.__BUKA !== false;
      const unit = osis ? 'putra' : (a && a.p_unit) || null;
      const d = { hari: '2026-10-28', buka, berikut: '2026-10-30', jadwal: [1, 3, 5, 6], peran: ['Admin', 'Osis'].includes(peran) ? 'majelis' : 'pengamat',
        role: peran, nama: osis ? 'OSDA-RQ' : 'Penguji', unit, unit_terkunci: osis, reses: !buka,
        versi: 268, sesi_berkas: buka ? '2026-10-28' : '2026-10-30', banding_baru: 0, potong: '2026-10-26T15:00:00Z', santri: {}, tangga: {} };
      if (osis && !buka) return { data: { ...d, butir: [], musyrif: {} }, error: null };
      const l = window.__SIDANG.butir.filter(b => !unit || b.unit === unit).filter(b => peran !== 'Guru' || b.kelas === 'VIII-D')
        .map(b => { const x = { ...b }; if (osis) delete x.nisn; else x.nisn = '00' + b.id.slice(-3); return x; });
      return { data: { ...d, butir: l, musyrif }, error: null };
    },
    sidang_bacakan: (a) => {
      window.__SIDANG.panggil.push(['bacakan', a]);
      let n = 0; window.__SIDANG.butir.forEach(b => { if (a.p_ids.includes(b.id) && b.status === 'menunggu') { b.status = 'dibacakan'; b.sesi = '2026-10-28'; b.dibacakan_nama = 'OSDA-RQ'; n++; } });
      return { data: { ok: true, dibacakan: n, diminta: a.p_ids.length, dilewati: a.p_ids.length - n }, error: null };
    },
    sidang_serahkan: (a) => {
      window.__SIDANG.panggil.push(['serahkan', a]);
      let n = 0; window.__SIDANG.butir.forEach(b => { if (a.p_ids.includes(b.id) && b.status === 'dibacakan') { b.status = 'diberikan'; b.diberikan_pada = '2026-10-28T09:15:00+07:00'; b.penerima = musyrif[b.kelas]; n++; } });
      return { data: { ok: true, diberikan: n, pesan: n, diminta: a.p_ids.length, dilewati: [] }, error: null };
    },
    sidang_putus: (a) => {
      const pid = 500 + window.__SIDANG.panggil.length; window.__SIDANG.panggil.push(['putus', a]);
      window.__SIDANG.snap = window.__SIDANG.snap || {}; window.__SIDANG.snap[pid] = a.p_ids.map(id => ({ ...window.__SIDANG.butir.find(b => b.id === id) }));
      a.p_ids.forEach(id => { const b = window.__SIDANG.butir.find(x => x.id === id); b.status = 'diberikan'; b.hari_ini = 'putus'; b.panggilan = pid; b.penerima = musyrif[b.kelas]; });
      return { data: { ok: true, panggilan: pid, dibacakan: a.p_ids.length, diberikan: a.p_ids.length, ulang: 0, pengingat: 0, dilewati: [], penerima: musyrif[window.__SIDANG.butir.find(b => b.id === a.p_ids[0]).kelas] }, error: null };
    },
    sidang_lewati: (a) => {
      const pid = 500 + window.__SIDANG.panggil.length; window.__SIDANG.panggil.push(['lewati', a]);
      window.__SIDANG.snap = window.__SIDANG.snap || {}; window.__SIDANG.snap[pid] = a.p_ids.map(id => ({ ...window.__SIDANG.butir.find(b => b.id === id) }));
      a.p_ids.forEach(id => { const b = window.__SIDANG.butir.find(x => x.id === id); b.hari_ini = 'lewati'; b.panggilan = pid; });
      return { data: { ok: true, panggilan: pid, dilewati: a.p_ids.length }, error: null };
    },
    sidang_urungkan: (a) => {
      window.__SIDANG.panggil.push(['urung', a]);
      ((window.__SIDANG.snap || {})[a.p_id] || []).forEach(x => { const i = window.__SIDANG.butir.findIndex(b => b.id === x.id); if (i >= 0) window.__SIDANG.butir[i] = x; });
      return { data: { ok: true, aksi: 'x', pesan_ditarik: 0 }, error: null };
    },
    sidang_batal: (a) => { window.__SIDANG.panggil.push(['batal', a]); const b = window.__SIDANG.butir.find(x => x.id === a.p_id); if (b) b.status = 'menunggu'; return { data: { ok: true }, error: null }; }
  };
}

async function masuk(browser, url, o = {}) {
  const ctx = await browser.newContext({ viewport: o.hp ? { width: 390, height: 844 } : { width: 1366, height: 860 },
    deviceScaleFactor: o.hp ? 2 : 1, isMobile: !!o.hp, hasTouch: !!o.hp, serviceWorkers: 'block', reducedMotion: o.gerak ? 'no-preference' : 'reduce' });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, async (route) => {
    const u = route.request().url();
    if (u.includes('supabase-js')) return route.fulfill({ contentType: 'application/javascript', body: MOCK });
    if (u.includes('sweetalert2')) return route.fulfill({ contentType: 'application/javascript', path: NM + '/sweetalert2/dist/sweetalert2.all.min.js' });
    if (u.includes('chart.js@')) return route.fulfill({ contentType: 'application/javascript', path: NM + '/chart.js/dist/chart.umd.min.js' });
    if (u.includes('echarts@')) return route.fulfill({ contentType: 'application/javascript', path: NM + '/echarts/dist/echarts.min.js' });
    return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
  });
  const page = await ctx.newPage();
  const galat = [];
  page.on('pageerror', e => galat.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_CONNECTION_REFUSED/.test(m.text())) galat.push('console: ' + m.text()); });
  await page.addInitScript(`(${(o) => {
    window.__PERAN = o.peran || 'Admin'; window.__KELAS = o.kelas || []; window.__KORPS = o.korps || null;
    if (o.buka === false) window.__BUKA = false;
    try { localStorage.setItem('rq-efek-pilih', 'hemat'); localStorage.setItem('rq.tur.v1.u-admin', '{"t":0}'); localStorage.setItem('rq-sidang-bunyi', 'mati'); } catch (e) {}
  }})(${JSON.stringify(o)}); (${pasangRpc.toString()})(${JSON.stringify(o)});`);
  await page.goto(url, { waitUntil: 'commit' });
  await page.waitForFunction(() => { const b = document.getElementById('btnLogin'); return typeof APP !== 'undefined' && b && b.offsetParent && !b.disabled; }, null, { timeout: 120000 });
  await page.click('#btnLogin');
  await page.waitForFunction(() => typeof APP !== 'undefined' && APP.profil && document.querySelector('#viewRoot') && document.querySelector('#viewRoot').children.length, null, { timeout: 120000 });
  await page.waitForTimeout(1500);
  return { ctx, page, galat };
}
const potret = async (page, nama) => { if (POTRET) await page.screenshot({ path: path.join(KELUAR, nama + '.png') }); };
const bukaSidang = async (page) => {
  await page.evaluate(() => navigateTo('sidang'));
  await page.waitForFunction(() => document.querySelector('#ruangSidang') && !document.querySelector('#sdIsi .sd-muat'), null, { timeout: 30000 });
  await page.waitForTimeout(500);
};
const kartuNama = (p) => p.evaluate(() => document.querySelector('#sdAntre .sd-kartu h2')?.textContent || (document.querySelector('#sdAntre .sd-akhir') ? 'AKHIR' : ''));
const panggilan = (p, j) => p.evaluate((j) => window.__SIDANG.panggil.filter(x => x[0] === j), j);
const tungguRpc = (p, j, n = 1) => p.waitForFunction(([j, n]) => window.__SIDANG.panggil.filter(x => x[0] === j).length >= n, [j, n], { timeout: 15000 });

(async () => {
  console.log('\nA · Berkas');
  const sw = baca('sw.js');
  cek('A1 sw.js: VERSI rq-v2.64+, sidang.js di INTI & POLA_INTI', /VERSI\s+=\s+'rq-v2\.(6[4-9]|[7-9]\d)(\.\d+)?'/.test(sw) && sw.includes("'./sidang.js'") && /sidang\\\.js\$/.test(sw));
  // chemint-repo.sh & migrasi/ hanya ada di repo src (tidak ikut repo publik tempat CI berjalan).
  const ada = (...p) => fs.existsSync(path.join(AKAR, ...p));
  cek('A2 vite KLASIK (& skrip rilis bila ada) memuat sidang.js', /KLASIK = \[[^\]]*'sidang\.js'/.test(baca('vite.config.mjs'))
    && (!ada('chemint-repo.sh') || /\bsidang\.js\b/.test(baca('chemint-repo.sh'))));
  cek('A3 build: sidang.js terbit & dipadatkan, sw build memuat sidang.js', fs.existsSync(path.join(AKAR, 'dist-uji', 'sidang.js'))
    && fs.statSync(path.join(AKAR, 'dist-uji', 'sidang.js')).size < fs.statSync(path.join(AKAR, 'sidang.js')).size && baca('dist-uji', 'sw.js').includes("'./sidang.js'"));
  const mig = ada('migrasi', '20261028_v2_64_sidang_tadib.sql') ? baca('migrasi', '20261028_v2_64_sidang_tadib.sql') : null;
  if (mig) cek('A4 migrasi: batas Ringan/Sedang, VII–X, hari 1/3/5/6, tanpa ubah RLS lama', mig.includes("b.kategori in ('Ringan', 'Sedang')")
    && mig.includes("in ('VII', 'VIII', 'IX', 'X')") && mig.includes('array[1, 3, 5, 6]') && !/alter policy|drop policy|create policy p_pbn/i.test(mig)
    && /revoke all on function public\._sidang_dasar\(\) from public, anon, authenticated/.test(mig));
  cek('A5 index.html: menu Ruang Sidang', baca('index.html').includes('data-view="sidang"'));

  const sSumber = await layani(AKAR, 4641), sBuild = await layani(path.join(AKAR, 'dist-uji'), 4642);
  const URL_ = { sumber: 'http://127.0.0.1:4641/', build: 'http://127.0.0.1:4642/' };
  const browser = await chromium.launch();

  for (const v of ['sumber', 'build']) {
    console.log(`\nB · ${v}`);
    { // OSDA · HP · hari sidang
      const s = await masuk(browser, URL_[v], { hp: true, peran: 'Osis', korps: 'Osis Putra', gerak: v === 'sumber' });
      const p = s.page;
      cek('B1 Ringkasan OSDA: pintu sidang "hari ini" (bila hari sidang) atau reses', await p.$('#pintuSidang') !== null);
      cek('B2 tab bawah "Sidang" tampil untuk OSDA, Catat tetap di tengah', await p.evaluate(() => {
        const t = document.querySelector('#tabBar .tab-sidang'), c = document.getElementById('tabCatat');
        if (!t || t.classList.contains('hidden')) return false;
        if (!c || c.classList.contains('hidden')) return true;
        const r = c.getBoundingClientRect(); return Math.abs(r.left + r.width / 2 - innerWidth / 2) < 3;
      }));
      await p.click('#tabBar .tab-sidang');
      await p.waitForFunction(() => document.querySelector('#ruangSidang') && !document.querySelector('#sdIsi .sd-muat'), null, { timeout: 30000 });
      await p.waitForTimeout(v === 'sumber' ? 1700 : 400);
      cek('B3 ruang layar penuh: kerangka aplikasi & tab bawah tersembunyi', await p.evaluate(() =>
        document.body.classList.contains('di-sidang') && getComputedStyle(document.getElementById('appShell')).display === 'none'
        && getComputedStyle(document.getElementById('ruangSidang')).position === 'fixed'));
      cek('B4 hakim putra (berpeci) besar & landasan palu tampak', await p.evaluate(() => {
        const h = document.querySelector('#sdPanggung .sd-hakim.besar'); return !!h && h.dataset.unit === 'putra' && h.getBoundingClientRect().width >= 220;
      }));
      cek('B5 berkas per santri: kelompok kode jumlah perkara & tombol "Mulai sidang"', await p.evaluate(() =>
        document.querySelectorAll('.sd-kel').length >= 1 && document.querySelectorAll('.sd-baris').length > 0 && /Mulai sidang/.test(document.querySelector('[data-aksi="mulai"]')?.textContent || '')));
      cek('B6 OSDA tidak menerima NISN', await p.evaluate(() => window.RQSidang._uji.S.data.butir.every(b => !('nisn' in b))));
      await potret(p, `v264-hp-panggung-${v}`);
      await p.click('[data-aksi="mulai"]');
      await p.waitForFunction(() => document.querySelector('#sdAntre .sd-kartu'), null, { timeout: 15000 });
      const nama1 = await kartuNama(p);
      cek('B7 Mulai sidang → antrean: kartu santri pertama & empat tombol layar', !!nama1 && await p.evaluate(() =>
        [...document.querySelectorAll('.sd-antre-tombol .sd-kunci')].filter(b => b.offsetWidth > 60).length === 4), nama1);
      cek('B8 kartu memuat perkara santri itu', await p.evaluate(() => document.querySelectorAll('#sdAntre .sd-pk').length >= 1));
      await potret(p, `v264-hp-antre-${v}`);
      await p.click('[data-aksi="a-enter"]');
      cek('B9 ketuk palu → stempel "Diputus" seketika', await p.evaluate(() => /Diputus/.test(document.querySelector('#sdAntre .sd-stempel')?.textContent || '')));
      await tungguRpc(p, 'putus');
      const pu = await panggilan(p, 'putus');
      cek('B10 satu RPC sidang_putus, hanya perkara santri yang dipanggil', pu.length === 1 && await p.evaluate((ids) =>
        new Set(ids.map(id => { const b = window.__SIDANG.butir.find(x => x.id === id); return b.nama + '|' + b.kelas; })).size === 1, pu[0][1].p_ids), pu.map(x => x[1].p_ids));
      await p.click('[data-aksi="a-enter"]');
      const nama2 = await kartuNama(p);
      cek('B11 Enter kedua → santri berikutnya', !!nama2 && nama2 !== nama1, [nama1, nama2]);
      await p.click('[data-aksi="a-lewati"]');
      await tungguRpc(p, 'lewati');
      cek('B11b Lewati → RPC sidang_lewati, langsung ke santri berikutnya', (await kartuNama(p)) !== nama2);
      await p.click('[data-aksi="a-del"]');
      await p.waitForTimeout(150);
      cek('B12 Del (belum diketuk) → mundur ke santri sebelumnya, stempel "Dilewati"', (await kartuNama(p)) === nama2
        && await p.evaluate(() => /Dilewati/.test(document.querySelector('#sdAntre .sd-stempel')?.textContent || '')));
      await p.click('[data-aksi="a-del"]');
      await tungguRpc(p, 'urung');
      cek('B12b Del lagi → RPC sidang_urungkan, stempel hilang', await p.evaluate(() => !document.querySelector('#sdAntre .sd-stempel')));
      await p.click('[data-aksi="antre-tutup"]');
      await p.waitForTimeout(500);
      cek('B13 tutup antrean → kembali ke daftar; santri yang diputus bertanda', await p.evaluate(() =>
        !document.querySelector('#sdAntre') && document.querySelectorAll('.sd-baris.k-putus').length === 1));
      await potret(p, `v264-hp-setelah-${v}`);
      await p.click('[data-aksi="keluar"]');
      await p.waitForTimeout(700);
      cek('B14 keluar → ruang sidang ditutup, kerangka aplikasi kembali', await p.evaluate(() =>
        !document.querySelector('#ruangSidang') && !document.body.classList.contains('di-sidang') && APP.view !== 'sidang'));
      cek('B15 tanpa galat halaman', s.galat.length === 0, s.galat.slice(0, 4));
      await s.ctx.close();
    }
    { // OSDA · bukan hari sidang
      const s = await masuk(browser, URL_[v], { hp: true, peran: 'Osis', korps: 'Osis Putra', buka: false });
      const p = s.page;
      await bukaSidang(p);
      cek('B16 reses: tanpa berkas, hakim tertidur, tanpa tombol putusan', await p.evaluate(() =>
        !!document.querySelector('.sd-reses') && !document.querySelector('[data-aksi="mulai"]') && !document.querySelector('.sd-baris')
        && document.querySelector('.sd-hakim').dataset.ekspresi === 'tidur'));
      await potret(p, `v264-hp-reses-${v}`);
      cek('B17 tanpa galat halaman', s.galat.length === 0, s.galat.slice(0, 4));
      await s.ctx.close();
    }
    { // Guru (musyrif) · desktop · pengamat
      const s = await masuk(browser, URL_[v], { peran: 'Guru', kelas: ['VIII-D'] });
      const p = s.page;
      cek('B18 menu Ruang Sidang tampil untuk musyrif', await p.evaluate(() => !document.querySelector('#navMenu [data-view="sidang"]').classList.contains('hidden')));
      cek('B19 tab Sidang TIDAK tampil untuk selain OSDA', await p.evaluate(() => document.querySelector('#tabBar .tab-sidang').classList.contains('hidden')));
      await bukaSidang(p);
      await p.click('[data-aksi="mulai"]');
      await p.waitForFunction(() => document.querySelector('#sdAntre .sd-kartu'), null, { timeout: 15000 });
      await p.keyboard.press('Enter'); await p.keyboard.press('Space'); await p.keyboard.press('ArrowDown');
      await p.waitForTimeout(300);
      cek('B20 pengamat: mode lihat — daftar & kartu terbuka, tanpa RPC putus/lewati/banding', await p.evaluate(() =>
        !window.__SIDANG.panggil.some(x => ['putus', 'lewati', 'banding'].includes(x[0])) && !!document.querySelector('[data-aksi="a-kanan"]')));
      await p.keyboard.press('Escape'); await p.waitForTimeout(300);
      await potret(p, `v264-desktop-pengamat-${v}`);
      cek('B21 tanpa galat halaman', s.galat.length === 0, s.galat.slice(0, 4));
      await s.ctx.close();
    }
    { // Admin · desktop · putri
      const s = await masuk(browser, URL_[v], { peran: 'Admin', unit: 'putri' });
      const p = s.page;
      await bukaSidang(p);
      await p.click('[data-aksi="unit"][data-nilai="putri"]');
      await p.waitForFunction(() => window.RQSidang._uji.S.data?.unit === 'putri' && document.querySelector('.sd-baris'), null, { timeout: 15000 });
      await p.waitForTimeout(300);
      cek('B22 Admin memilih unit putri → hakim berjilbab', await p.evaluate(() => document.querySelector('#sdPanggung .sd-hakim').dataset.unit === 'putri'));
      await potret(p, `v264-desktop-putri-${v}`);
      await p.click('[data-aksi="mulai"]');
      await p.waitForFunction(() => document.querySelector('#sdAntre .sd-kartu'), null, { timeout: 15000 });
      cek('B23 Admin (desktop): antrean terbuka, hakim di mimbar berjilbab', await p.evaluate(() =>
        !!document.querySelector('#sdAntre .sd-kartu h2') && document.querySelector('#sdAntre .sd-hakim')?.dataset.unit === 'putri'));
      await potret(p, `v264-desktop-antre-${v}`);
      await p.keyboard.press('Escape');
      await p.waitForTimeout(400);
      cek('B24 Esc menutup antrean tanpa RPC putusan', await p.evaluate(() => !document.querySelector('#sdAntre')
        && !window.__SIDANG.panggil.some(x => ['putus', 'lewati', 'banding', 'bacakan'].includes(x[0]))));
      cek('B25 tanpa galat halaman', s.galat.length === 0, s.galat.slice(0, 4));
      await s.ctx.close();
    }
    { // Klinik
      const s = await masuk(browser, URL_[v], { peran: 'Klinik' });
      cek('B26 Klinik: menu Ruang Sidang tidak tampil', await s.page.evaluate(() => document.querySelector('#navMenu [data-view="sidang"]').classList.contains('hidden')));
      await s.ctx.close();
    }
    if (v === 'sumber') { // desktop OSDA untuk potret panggung
      const s = await masuk(browser, URL_[v], { peran: 'Osis', korps: 'Osis Putra' });
      await bukaSidang(s.page);
      await s.page.evaluate(() => document.getElementById('sdGulir').scrollTo(0, 0));
      await potret(s.page, 'v264-desktop-osda-sumber');
      await s.ctx.close();
    }
  }
  await browser.close(); sSumber.close(); sBuild.close();
  console.log(`\n${lulus} lulus, ${gagal} gagal`);
  process.exit(gagal ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
