/* uji-v265.cjs — v2.65 BERKAS PERKARA · KRITIK & SARAN · GELEMBUNG PESAN
 *
 *   npm run bangun:uji && npm i --no-save html2pdf.js@0.10.1 && node uji/uji-v265.cjs
 *   (RQ_POTRET=1 → tangkapan layar + PDF contoh ke uji/keluaran/)
 *
 * A · berkas: VERSI, menu, migrasi (bila ada di repo src) aditif & tanpa ubah RLS lama.
 * B · aplikasi utuh (sumber & build, Supabase tiruan, RPC v2.65 tiruan):
 *     OSDA hari sidang: tombol berkas → majelis wajib Ketua → RPC simpan majelis → PDF
 *       terunduh (A4/F4, beberapa halaman, isi: daftar panggil, rincian, majelis);
 *     OSDA persiapan (malam sebelum sidang): berkas terbuka, tanpa tombol putusan;
 *     OSDA reses: tanpa tombol berkas; Ringkasan OSDA: gelembung pesan, "dipahami";
 *     Kritik & Saran: kirim (nama kosong → null), riwayat + jawaban;
 *     super admin: menu + lencana, kotak masuk, tandai dibaca, jawab, tarik;
 *     Admin lain: menu tersembunyi & halaman tertutup; Guru: tanpa menu saran.
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
const cek = (j, ok, info) => { ok ? lulus++ : gagal++; console.log(`${ok ? '  ok  ' : ' GAGAL'} ${j}${info !== undefined ? '  · ' + JSON.stringify(info) : ''}`); };
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

/* RPC tiruan — meniru bentuk jawaban migrasi v2.64 + v2.65. */
function pasangRpc(o) {
  const KELAS = ['VII-D', 'VIII-D', 'IX-F', 'X-C'];
  const BENTUK = { Ringan: ['Nasehat', 'Nasehat + Teguran', 'Membersihkan kamar mandi asrama'], Sedang: ['Menghafal 1 halaman mufradat', 'Berdiri di lapangan saat apel'] };
  const NAMA = ['Ahmad Fauzan', 'Muhammad Rizki', 'Teuku Alif', 'Zulfikar Hasan', 'Raihan Akbar', 'Fathurrahman', 'Ilham Maulana', 'Muhammad Ridha'];
  const butir = Array.from({ length: 90 }, (_, i) => {
    const kat = i % 5 === 0 ? 'Sedang' : 'Ringan', tahap = 1 + (i % 3) % (kat === 'Sedang' ? 2 : 3);
    return { id: 'PBN-' + String(i).padStart(3, '0'), nama: NAMA[i % 8] + ' ' + (1 + (i % 37)),
      kelas: KELAS[i % 4], angkatan: KELAS[i % 4].split('-')[0], unit: 'putra', kamar: 10 + (i % 9), hadir: i % 11 === 3 ? 'Izin Keluar' : i % 13 === 5 ? 'Sakit' : 'Hadir',
      kategori: kat, tahap, bentuk: BENTUK[kat][tahap - 1] || BENTUK[kat][0], ket: tahap === 2 ? "Dilaksanakan ba'da Ashar, didampingi pengurus bagian." : undefined,
      pelanggaran: ['Telat keluar dari asrama (pagi/sore)', 'Tidak ikut shalat berjamaah – "Subuh"', 'Berbahasa Indonesia di asrama', 'Kamar tidak rapi saat pemeriksaan kamar mingguan oleh mudabbir'][i % 4],
      bidang: ['Mudabbir', 'Mudabbir', 'Ubudiyah', 'Bahasa'][i % 4], tanggal: '2026-10-' + String(1 + (i % 26)).padStart(2, '0'),
      status: i % 17 === 0 ? 'tuntas' : i % 19 === 0 ? 'diberikan' : 'menunggu' };
  });
  const peran = window.__PERAN || 'Admin';
  const S = window.__V265 = { butir, panggil: [], majelis: null,
    saran: [
      { id: 2, unit: 'putra', jenis: 'Kritik', isi: 'Jadwal sidang hari Sabtu bentrok dengan muhadharah.', nama: null, dikirim_pada: '2026-10-30T12:00:00Z', dibaca_pada: null },
      { id: 1, unit: 'putra', jenis: 'Saran', isi: 'Mohon disediakan papan pengumuman putusan di asrama.', nama: 'Fulan', dikirim_pada: '2026-10-29T08:00:00Z', dibaca_pada: '2026-10-29T09:00:00Z',
        jawaban: 'Baik, insyaAllah pekan depan.', jawaban_id: 9, dijawab_pada: '2026-10-29T10:00:00Z' }],
    pesan: [{ id: 9, isi: 'Sidang Senin dimulai ba\'da Ashar. Cetak daftar panggil sebelum Maghrib.', tujuan: 'semua', dikirim_pada: '2026-10-31T11:00:00Z', tampil_sampai: '2026-11-07T11:00:00Z',
      pengirim: 'Nyak Al Azwansyah, S.Sos.', menjawab_isi: 'Mohon disediakan papan pengumuman putusan di asrama.', menjawab_jenis: 'Saran' }] };
  const r = (data) => ({ data, error: null });
  window.__RPC = {
    sidang_berkas: (a) => {
      S.panggil.push(['berkas', a]);
      const osis = peran === 'Osis', buka = window.__BUKA !== false, prat = !buka && window.__PRATINJAU === true;
      const d = { hari: '2026-11-01', buka, berikut: '2026-11-02', jadwal: [1, 3, 5, 6], peran: ['Admin', 'Osis'].includes(peran) ? 'majelis' : 'pengamat',
        role: peran, nama: osis ? 'OSDA-RQ' : 'Penguji', unit: osis ? 'putra' : (a && a.p_unit) || null, unit_terkunci: osis, reses: !buka,
        pratinjau: osis && prat, sesi_berkas: buka ? '2026-11-01' : '2026-11-02', majelis: S.majelis };
      if (osis && !buka && !prat) return r({ ...d, butir: [], musyrif: {} });
      return r({ ...d, butir: butir.map(b => ({ ...b })), musyrif: Object.fromEntries(KELAS.map((k, i) => [k, ['Ust. Musyrif ' + (i + 1)]])) });
    },
    sidang_majelis_simpan: (a) => {
      S.panggil.push(['majelis', a]);
      S.majelis = { sesi: a.p_sesi, unit: 'putra', ketua: a.p_ketua, anggota1: a.p_anggota1, anggota2: a.p_anggota2, panitera: a.p_panitera, diisi_nama: 'OSDA-RQ' };
      return r(S.majelis);
    },
    adalah_super_admin: () => { S.panggil.push(['super']); return r(window.__SUPER === true); },
    saran_hitung_baru: () => r(window.__SUPER ? S.saran.filter(x => !x.dibaca_pada).length : 0),
    saran_milik_saya: () => r(peran === 'Osis' ? S.saran.map(x => ({ ...x })) : []),
    saran_kirim: (a) => { S.panggil.push(['kirim', a]); S.saran.unshift({ id: 3, unit: 'putra', jenis: a.p_jenis, isi: a.p_isi, nama: a.p_nama, dikirim_pada: new Date().toISOString(), dibaca_pada: null }); return r({ ok: true, id: 3 }); },
    saran_kotak: () => { S.panggil.push(['kotak']); if (!window.__SUPER) return { data: null, error: { message: 'Kotak Saran OSDA hanya untuk super admin.' } };
      return r({ belum_dibaca: S.saran.filter(x => !x.dibaca_pada).length, saran: S.saran.map(x => ({ ...x })),
        pesan: S.pesan.map(p => ({ ...p, aktif: !p.ditarik_pada, dipahami_putra: p.dipahami_pada || null })) }); },
    saran_tandai_dibaca: (a) => { S.panggil.push(['tandai', a]); let n = 0; S.saran.forEach(x => { if (a.p_ids.includes(x.id) && !x.dibaca_pada) { x.dibaca_pada = new Date().toISOString(); n++; } }); return r(n); },
    pesan_kirim: (a) => { S.panggil.push(['pesan', a]); S.pesan.unshift({ id: 10 + S.pesan.length, isi: a.p_isi, tujuan: a.p_tujuan, dikirim_pada: new Date().toISOString(), tampil_sampai: '2026-11-30T00:00:00Z', pengirim: 'Nyak Al Azwansyah, S.Sos.' }); return r({ ok: true }); },
    pesan_tarik: (a) => { S.panggil.push(['tarik', a]); const p = S.pesan.find(x => x.id === a.p_id); if (p) p.ditarik_pada = new Date().toISOString(); return r(true); },
    pesan_untuk_osda: () => r(peran === 'Osis' ? S.pesan.filter(p => !p.ditarik_pada).map(p => ({ ...p })) : []),
    pesan_dipahami: (a) => { S.panggil.push(['paham', a]); const p = S.pesan.find(x => x.id === a.p_id); if (p) p.dipahami_pada = new Date().toISOString(); return r(true); }
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
  }})(${JSON.stringify(o)}); (${pasangRpc.toString()})(${JSON.stringify(o)});`);
  await page.goto(url, { waitUntil: 'commit' });
  await page.waitForFunction(() => { const b = document.getElementById('btnLogin'); return typeof APP !== 'undefined' && b && b.offsetParent && !b.disabled; }, null, { timeout: 120000 });
  await page.click('#btnLogin');
  await page.waitForFunction(() => typeof APP !== 'undefined' && APP.profil && document.querySelector('#viewRoot') && document.querySelector('#viewRoot').children.length, null, { timeout: 120000 });
  await page.waitForTimeout(1500);
  return { ctx, page, galat };
}
const potret = async (page, nama) => { if (POTRET) await page.screenshot({ path: path.join(KELUAR, nama + '.png') }); };
const panggil = (p, jenis) => p.evaluate((j) => window.__V265.panggil.filter(x => x[0] === j), jenis);
const bukaSidang = async (page) => {
  await page.evaluate(() => navigateTo('sidang'));
  await page.waitForFunction(() => document.querySelector('#ruangSidang') && !document.querySelector('#sdIsi .sd-muat'), null, { timeout: 30000 });
  await page.waitForTimeout(400);
};

(async () => {
  console.log('\nA · Berkas');
  const sw = baca('sw.js');
  cek('A1 sw.js: VERSI rq-v2.65+', /VERSI\s+=\s+'rq-v2\.(6[5-9]|[7-9]\d)(\.\d+)?'/.test(sw));
  const ih = baca('index.html');
  cek('A2 index.html: menu Kritik & Saran + Kotak Saran OSDA (tersembunyi bawaan) + lencana', ih.includes('data-view="saran"')
    && /class="nav-item hidden" data-view="kotaksaran"/.test(ih) && ih.includes('id="badgeSaran"'));
  const app = baca('app.js');
  cek('A3 app.js: super admin ditanyakan ke database, bukan UUID/nama tertanam', app.includes("db.rpc('adalah_super_admin')") && !/839511db/.test(app) && !/superAdmin\s*=.*Nyak/.test(app));
  const mig = ada('migrasi', '20261031_v2_65_berkas_saran.sql') ? baca('migrasi', '20261031_v2_65_berkas_saran.sql') : null;
  if (mig) {
    cek('A4 migrasi: aditif, RLS tabel baru tertutup, tanpa ubah policy lama', /enable row level security/.test(mig) && !/(alter|drop|create) policy/i.test(mig)
      && /revoke all on table public\.sidang_majelis, public\.osda_saran, public\.osda_pesan from anon, authenticated/.test(mig)
      && (mig.match(/create table public\./g) || []).length === 3);
    cek('A5 migrasi: semua RPC v2.65 dicabut dari anon', /revoke all on function %s from public, anon/.test(mig) && /'public\.pesan_dipahami\(bigint\)'\]/.test(mig));
  }
  cek('A6 html2pdf tersedia untuk uji PDF', fs.existsSync(H2P));

  const sSumber = await layani(AKAR, 4651), sBuild = await layani(path.join(AKAR, 'dist-uji'), 4652);
  const URL_ = { sumber: 'http://127.0.0.1:4651/', build: 'http://127.0.0.1:4652/' };
  const browser = await chromium.launch();

  for (const v of ['sumber', 'build']) {
    console.log(`\nB · ${v}`);
    { // OSDA · HP · hari sidang · berkas perkara
      const s = await masuk(browser, URL_[v], { hp: true, peran: 'Osis', korps: 'Osis Putra' });
      const p = s.page;
      cek('B1 Ringkasan OSDA: gelembung pesan di paling atas, terbuka, berisi kutipan', await p.evaluate(() => {
        const g = document.getElementById('gelembungOsda');
        return !!g && document.getElementById('viewRoot').firstElementChild === g && g.classList.contains('buka')
          && /Ustadz Nyak Al Azwansyah/.test(g.textContent) && !!g.querySelector('.go-kutip') && !!g.querySelector('[data-go="paham"]');
      }));
      await potret(p, `v265-hp-gelembung-${v}`);
      await p.click('#gelembungOsda [data-go="paham"]');
      await p.waitForFunction(() => document.querySelector('#gelembungOsda.kecil'), null, { timeout: 8000 });
      cek('B2 "InsyaAllah, dipahami" → RPC pesan_dipahami, gelembung mengecil', (await panggil(p, 'paham')).length === 1);
      await potret(p, `v265-hp-gelembung-kecil-${v}`);
      cek('B3 menu: Kritik & Saran tampil, Kotak Saran tidak', await p.evaluate(() =>
        !document.querySelector('#navMenu [data-view="saran"]').classList.contains('hidden')
        && document.querySelector('#navMenu [data-view="kotaksaran"]').classList.contains('hidden')));

      await bukaSidang(p);
      cek('B4 Ruang Sidang: tombol berkas di bilah atas & kartu rekap', (await p.$$('[data-aksi="berkas"]')).length === 2);
      await p.click('.sd-atas [data-aksi="berkas"]');
      await p.waitForSelector('.swal2-popup .sd-berkas-form');
      cek('B5 jendela berkas: 4 isian majelis, cakupan, kertas A4/F4', await p.evaluate(() =>
        document.querySelectorAll('.sd-majelis-isian input').length === 4 && document.querySelectorAll('input[name="sdCakupan"]').length >= 1
        && document.querySelectorAll('input[name="sdKertas"]').length === 2));
      await potret(p, `v265-hp-jendela-berkas-${v}`);
      await p.click('.swal2-confirm');
      await p.waitForSelector('.swal2-validation-message', { state: 'visible' });
      cek('B6 Hakim Ketua kosong → ditolak, tanpa RPC', /Hakim Ketua/.test(await p.textContent('.swal2-validation-message')) && (await panggil(p, 'majelis')).length === 0);
      await p.fill('#sdM-ketua', '  Muhammad   Haikal ');
      await p.fill('#sdM-anggota1', 'Teuku Raihan');
      await p.fill('#sdM-panitera', 'Zikri Alfarisi');
      await p.click('.sd-opsi:has(input[name="sdKertas"][value="F4"])');
      cek('B6b memilih kertas lewat label menandai pilihan', await p.evaluate(() => document.querySelector('input[name="sdKertas"][value="F4"]').checked
        && document.querySelector('.sd-opsi:has(input[value="F4"])').classList.contains('on')));
      // tangkap teks yang digambar ke PDF
      await p.evaluate(() => {
        const asli = window.RQ_SIDANG.pdfBaru;
        window.RQ_SIDANG.pdfBaru = async (k) => { const r = await asli(k); const t = r.pdf.text.bind(r.pdf); window.__TEKS = [];
          r.pdf.text = (x, ...a) => { window.__TEKS.push(...[].concat(x)); return t(x, ...a); }; window.__PDF = r; return r; };
      });
      const [unduh] = await Promise.all([p.waitForEvent('download', { timeout: 30000 }), p.click('.swal2-confirm')]);
      const berkas = path.join(KELUAR, `v265-berkas-${v}.pdf`);
      await unduh.saveAs(berkas);
      const buf = fs.readFileSync(berkas);
      const mj = await panggil(p, 'majelis');
      cek('B7 RPC sidang_majelis_simpan: nama dirapikan, sesi = sesi berkas', mj.length === 1 && mj[0][1].p_ketua === 'Muhammad Haikal' && mj[0][1].p_anggota2 === null && mj[0][1].p_sesi === '2026-11-01', mj[0] && mj[0][1]);
      const info = await p.evaluate(() => ({ hal: window.__PDF.pdf.internal.getNumberOfPages(), w: Math.round(window.__PDF.pdf.internal.pageSize.getWidth()), h: Math.round(window.__PDF.pdf.internal.pageSize.getHeight()), teks: window.__TEKS }));
      cek('B8 PDF terunduh: %PDF, kertas F4 215×330, ≥2 halaman, nama berkas', buf.slice(0, 4).toString() === '%PDF' && info.w === 215 && info.h === 330 && info.hal >= 2
        && /^Berkas Sidang Tadib OSDA Putra 2026-11-01\.pdf$/.test(unduh.suggestedFilename()), { hal: info.hal, ukuran: buf.length, nama: unduh.suggestedFilename() });
      const T = info.teks.join('\n');
      cek('B9 isi PDF: kop, judul, tiga bagian, kolom majelis bernama', ['DAYAH RUHUL QURANI', "BERKAS PERKARA SIDANG TA'DIB", 'I. DAFTAR PANGGIL', 'II. RINCIAN PERKARA', 'III. MAJELIS SIDANG',
        'Hakim Ketua', 'Muhammad Haikal', 'Teuku Raihan', 'Zikri Alfarisi', 'Kelas VII-D', 'Bidang Mudabbir'].every(x => T.includes(x)));
      cek('B10 teks PDF aman Latin-1 (tanda pisah/kutip lengkung dirapikan)', !/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/.test(T) && T.includes('Tidak ikut shalat berjamaah - "Subuh"'));
      const st = await p.evaluate(() => { const U = window.RQSidang._uji; const l = U.S.data.butir.filter(b => b.status === 'menunggu');
        const isi = U.isiBerkas(l, {}, 'x'); return { n: l.length, santri: isi.nSantri, unik: new Set(l.map(b => b.nama + '|' + b.kelas)).size,
          panggil: isi.panggil.reduce((a, g) => a + g.santri.length, 0), rinci: isi.rincian.reduce((a, r) => a + r.sub.reduce((b, s) => b + s.baris.length, 0), 0) }; });
      cek('B11 daftar panggil satu baris per santri; rincian memuat semua perkara menunggu', st.santri === st.unik && st.panggil === st.unik && st.rinci === st.n, st);
      await p.waitForTimeout(400);
      cek('B12 majelis tersimpan → berita acara & isian berikutnya terisi dari server', await p.evaluate(() => window.RQSidang._uji.S.data.majelis?.ketua === 'Muhammad Haikal'));
      if (POTRET && v === 'sumber') try { require('child_process').execFileSync('pdftoppm', ['-png', '-r', '60', '-f', '1', '-l', '3', berkas, path.join(KELUAR, 'v265-berkas-hal')]); } catch (e) {}
      cek('B13 tanpa galat halaman', s.galat.length === 0, s.galat.slice(0, 4));
      await s.ctx.close();
    }
    { // OSDA · persiapan malam sebelum sidang
      const s = await masuk(browser, URL_[v], { hp: true, peran: 'Osis', korps: 'Osis Putra', buka: false, pratinjau: true });
      const p = s.page;
      await bukaSidang(p);
      cek('B14 persiapan: bukan reses, status "Persiapan", catatan persiapan, tombol berkas ada', await p.evaluate(() =>
        !document.querySelector('.sd-reses') && !!document.querySelector('.sd-status.persiapan') && !!document.querySelector('.sd-catatan-persiapan')
        && !!document.querySelector('.sd-atas [data-aksi="berkas"]')));
      await p.click('[data-aksi="bidang"]'); await p.waitForTimeout(300);
      cek('B15 persiapan: daftar bisa dilihat, tanpa kotak pilih & tanpa bilah putusan', await p.evaluate(() =>
        document.querySelectorAll('.sd-santri').length > 0 && !document.querySelector('input[data-aksi="pilih"]') && document.getElementById('sdAksi').hidden));
      await p.click('.sd-atas [data-aksi="berkas"]');
      await p.waitForSelector('.swal2-popup .sd-berkas-form');
      cek('B16 jendela berkas menandai persiapan & sesi besok; cakupan bidang tersedia', await p.evaluate(() =>
        /persiapan/i.test(document.querySelector('.sd-berkas-sesi').textContent) && /2 November/.test(document.querySelector('.sd-berkas-sesi').textContent)
        && !!document.querySelector('input[name="sdCakupan"][value="bidang"]')));
      await potret(p, `v265-hp-persiapan-berkas-${v}`);
      await p.click('.swal2-cancel');
      cek('B17 tanpa galat halaman', s.galat.length === 0, s.galat.slice(0, 4));
      await s.ctx.close();
    }
    { // OSDA · reses
      const s = await masuk(browser, URL_[v], { hp: true, peran: 'Osis', korps: 'Osis Putra', buka: false });
      await bukaSidang(s.page);
      cek('B18 reses: tanpa tombol berkas', await s.page.evaluate(() => !!document.querySelector('.sd-reses') && !document.querySelector('[data-aksi="berkas"]')));
      await s.ctx.close();
    }
    { // OSDA · Kritik & Saran
      const s = await masuk(browser, URL_[v], { hp: true, peran: 'Osis', korps: 'Osis Putra' });
      const p = s.page;
      await p.evaluate(() => navigateTo('saran'));
      await p.waitForSelector('#saranForm');
      await p.waitForTimeout(300);
      cek('B19 halaman saran: riwayat dengan status & jawaban', await p.evaluate(() =>
        document.querySelectorAll('.saran-butir').length === 2 && !!document.querySelector('.saran-status.st-dijawab') && !!document.querySelector('.saran-jawab')
        && /Anggota OSDA/.test(document.querySelector('.saran-daftar').textContent)));
      await potret(p, `v265-hp-saran-${v}`);
      await p.click('.saran-kirim');
      await p.waitForTimeout(300);
      cek('B20 isi kosong → tidak terkirim', (await panggil(p, 'kirim')).length === 0);
      await p.click('.saran-pilih label:has(input[value="Kritik"])');
      await p.fill('#saranIsi', 'Ruang sidang terlalu panas siang hari.');
      await p.click('.saran-kirim');
      await p.waitForFunction(() => window.__V265.panggil.some(x => x[0] === 'kirim'), null, { timeout: 8000 });
      const k = (await panggil(p, 'kirim'))[0][1];
      cek('B21 kirim kritik: jenis Kritik, nama kosong → null', k.p_jenis === 'Kritik' && k.p_nama === null && /panas/.test(k.p_isi), k);
      await p.waitForFunction(() => document.querySelectorAll('.saran-butir').length === 3, null, { timeout: 8000 });
      cek('B22 riwayat bertambah setelah kirim', true);
      cek('B23 tanpa galat halaman', s.galat.length === 0, s.galat.slice(0, 4));
      await s.ctx.close();
    }
    { // super admin · desktop
      const s = await masuk(browser, URL_[v], { peran: 'Admin', super: true });
      const p = s.page;
      await p.waitForFunction(() => !document.querySelector('#navMenu [data-view="kotaksaran"]').classList.contains('hidden'), null, { timeout: 8000 });
      await p.waitForFunction(() => !document.getElementById('badgeSaran').classList.contains('hidden'), null, { timeout: 8000 });
      cek('B24 super admin: menu Kotak Saran tampil + lencana 1', await p.evaluate(() => document.getElementById('badgeSaran').textContent === '1'));
      await p.evaluate(() => navigateTo('kotaksaran'));
      await p.waitForSelector('.ks-kisi');
      await p.waitForTimeout(500);
      cek('B25 kotak masuk: 2 kiriman, 1 bertanda Baru; pesan terkirim tampil', await p.evaluate(() =>
        document.querySelectorAll('.ks-butir').length === 2 && document.querySelectorAll('.ks-butir.baru').length === 1 && document.querySelectorAll('.ks-pesan').length === 1));
      const td = await panggil(p, 'tandai');
      cek('B26 dibuka = dibaca: RPC saran_tandai_dibaca untuk yang baru', td.length === 1 && JSON.stringify(td[0][1].p_ids) === '[2]');
      await potret(p, `v265-desktop-kotak-${v}`);
      await p.click('[data-ks-jawab="2"]');
      await p.waitForSelector('.swal2-popup .ks-swal');
      await p.fill('#ksJawab', 'Jazakumullah. Sidang Sabtu digeser ba\'da Ashar.');
      await potret(p, `v265-desktop-jawab-${v}`);
      await p.click('.swal2-confirm');
      await p.waitForFunction(() => window.__V265.panggil.some(x => x[0] === 'pesan'), null, { timeout: 8000 });
      const pk = (await panggil(p, 'pesan'))[0][1];
      cek('B27 jawab → RPC pesan_kirim dengan p_menjawab & tujuan unit pengirim', pk.p_menjawab === 2 && pk.p_tujuan === 'putra' && pk.p_hari === 7, pk);
      await p.waitForSelector('.ks-kisi');
      await p.waitForTimeout(500);
      await p.fill('#ksIsi', 'Pengumuman: rapat OSDA Kamis malam.');
      await p.click('.ks-tujuan label:has(input[value="putri"])');
      await p.selectOption('#ksTujuanHari', '3');
      await p.click('#ksForm .saran-kirim');
      await p.waitForFunction(() => window.__V265.panggil.filter(x => x[0] === 'pesan').length === 2, null, { timeout: 8000 });
      const pk2 = (await panggil(p, 'pesan'))[1][1];
      cek('B28 kirim pesan baru: tujuan putri, 3 hari, tanpa p_menjawab', pk2.p_tujuan === 'putri' && pk2.p_hari === 3 && pk2.p_menjawab === null, pk2);
      await p.waitForFunction(() => document.querySelectorAll('.ks-pesan').length === 3 && !document.querySelector('.swal2-container:not(.swal2-toast-shown) .swal2-popup:not(.swal2-toast)'), null, { timeout: 8000 });
      await p.waitForTimeout(300);
      await p.click('[data-ks-tarik]');
      await p.click('.swal2-confirm');
      await p.waitForFunction(() => window.__V265.panggil.some(x => x[0] === 'tarik'), null, { timeout: 8000 });
      cek('B29 tarik pesan → RPC pesan_tarik', true);
      cek('B30 tanpa galat halaman', s.galat.length === 0, s.galat.slice(0, 4));
      await s.ctx.close();
    }
    { // Admin lain
      const s = await masuk(browser, URL_[v], { peran: 'Admin' });
      const p = s.page;
      await p.waitForTimeout(500);
      cek('B31 Admin lain: menu Kotak Saran tersembunyi', await p.evaluate(() => document.querySelector('#navMenu [data-view="kotaksaran"]').classList.contains('hidden')));
      await p.evaluate(() => navigateTo('kotaksaran'));
      await p.waitForTimeout(800);
      cek('B32 Admin lain membuka paksa: "Khusus super admin", tanpa RPC saran_kotak', await p.evaluate(() =>
        /Khusus super admin/.test(document.getElementById('viewRoot').textContent)) && (await panggil(p, 'kotak')).length === 0);
      cek('B33 Admin: menu Kritik & Saran (OSDA) tidak tampil', await p.evaluate(() => document.querySelector('#navMenu [data-view="saran"]').classList.contains('hidden')));
      cek('B34 tanpa galat halaman', s.galat.length === 0, s.galat.slice(0, 4));
      await s.ctx.close();
    }
    { // Guru
      const s = await masuk(browser, URL_[v], { peran: 'Guru', kelas: ['VIII-D'] });
      cek('B35 Guru: tanpa menu saran & kotak saran, tanpa tanya super admin', await s.page.evaluate(() =>
        document.querySelector('#navMenu [data-view="saran"]').classList.contains('hidden') && document.querySelector('#navMenu [data-view="kotaksaran"]').classList.contains('hidden'))
        && (await panggil(s.page, 'super')).length === 0);
      await s.ctx.close();
    }
  }
  await browser.close(); sSumber.close(); sBuild.close();
  console.log(`\n${lulus} lulus, ${gagal} gagal`);
  process.exit(gagal ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
