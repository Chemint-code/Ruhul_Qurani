/* uji-v269.cjs — v2.69 MAJELIS BERNAMA · APRESIASI · DISAHKAN OSDA · KELALAIAN · UTAS DITUTUP
 *
 *   npm run bangun:uji && npm i --no-save html2pdf.js@0.10.1 && node uji/uji-v269.cjs
 *
 * A · berkas: VERSI, RPC v2.69 dipanggil, migrasi aditif (bila migrasi/ ada), menu Kelalaian.
 * B · Ruang Sidang (sumber & build, RPC tiruan v2.69): gerbang majelis sebelum Mulai &
 *     berkas, formulir pilih santri XI (tanpa ketik bebas, satu orang satu jabatan, PJ
 *     sesuai kelompok bentuk), S = Disahkan OSDA, ucapan Bahasa, PJ saksi, PDF baru,
 *     super admin tanpa gerbang, galat gerbang server → formulir.
 * C · aplikasi: Pembinaan (tanda Disahkan OSDA + Sanggah), Kelalaian (super admin),
 *     utas Ditutup, label "Ucapan yang terdengar".
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
  // v2.69: kelompok bentuk, ucapan Bahasa, PJ saksi
  const KEL = { 'Ringan|2': ['bersih'], 'Ringan|3': ['hafal'], 'Ringan|4': ['pidato'], 'Sedang|1': ['bersih'], 'Sedang|2': ['hafal', 'shalat'] };
  butir.forEach(b => { const k = KEL[`${b.kategori}|${b.tahap}`]; if (k) b.kelompok = k;
    if (b.bidang === 'Bahasa') b.ucapan = 'aku mau ke kamar mandi dulu';
    if (b.status === 'diberikan') b.pj = ['Hakim Lama']; });
  const wajibKini = () => { const w = {}; butir.filter(b => b.status === 'menunggu' && !['diajukan', 'dikabulkan'].includes(b.banding)).forEach(b => (b.kelompok || []).forEach(k => { w[k] = (w[k] || 0) + 1; })); return w; };
  const LBL = { ketua: 'Hakim Ketua', anggota1: 'Hakim Anggota I', anggota2: 'Hakim Anggota II', panitera: 'Panitera', penasihat: 'Penasihat' };
  const KLBL = { bersih: 'Pembersihan', hafal: 'Hafalan', shalat: 'Shalat Sunnah', pidato: 'Pidato' };
  const CALON = Array.from({ length: 12 }, (_, i) => ({ kunci: 'k' + i, nama: 'Hakim Uji ' + i, kelas: i % 2 ? 'XI-D' : 'XI-C', kamar: 40 + i, unit: 'putra', tugas: i % 3 }));
  const statusPanitia = (P) => { const w = wajibKini(); const kurang = [...Object.keys(LBL).filter(k => !P.isi[k]).map(k => LBL[k]), ...Object.keys(w).filter(k => !P.isi.pj[k]).map(k => 'PJ ' + KLBL[k])];
    return { ...P, wajib: w, lengkap: !kurang.length, kurang }; };
  const S = window.__V269 = { butir, panggil: [], pid: 1000, snap: {}, banding, gerbang: window.__GERBANG !== false,
    panitia: { sesi: '2026-11-06', unit: 'putra', isi: { pj: {} }, pembimbing: null, kredit: false } };
  const r = (data) => ({ data, error: null });
  const salah = (m) => ({ data: null, error: { message: m } });
  const gagalkan = (n) => window.__GAGAL === n;
  const buka = window.__BUKA !== false, prat = !buka && window.__PRATINJAU === true;
  window.__RPC = {
    sidang_berkas: (a) => {
      S.panggil.push(['berkas', a]);
      const d = { hari: '2026-11-06', buka, berikut: '2026-11-07', jadwal: [1, 3, 5, 6], peran: ['Admin', 'Osis'].includes(peran) ? 'majelis' : 'pengamat',
        role: peran, nama: osis ? 'OSDA-RQ' : 'Penguji', unit: osis ? 'putra' : (a && a.p_unit) || null, unit_terkunci: osis, reses: !buka,
        pratinjau: osis && prat, sesi_berkas: buka ? '2026-11-06' : '2026-11-07', majelis: S.majelis || null, versi: 269,
        gerbang: S.gerbang, super: window.__SUPER === true, panitia: statusPanitia(S.panitia),
        banding_baru: S.banding.filter(x => x.status === 'diajukan').length, potong: '2026-11-04T09:30:00Z' };
      if (osis && !buka && !prat) return r({ ...d, butir: [], musyrif: {} });
      return r({ ...d, butir: S.butir.map(b => ({ ...b })), santri, tangga, musyrif: { 'VII-D': ['Ust. Musyrif Tujuh'], 'VIII-D': ['Ust. Musyrif Satu'] } });
    },
    sidang_putus: (a) => {
      S.panggil.push(['putus', a]);
      if (gagalkan('sidang_putus')) return salah('Sambungan terputus (uji).');
      if (S.gerbang && window.__SUPER !== true && (gagalkan('gerbang') || !statusPanitia(S.panitia).lengkap)) { if (gagalkan('gerbang')) window.__GAGAL = null;
        return salah('Susunan majelis belum lengkap: PJ Pidato. Isi dahulu "Susunan majelis".'); }
      S.panitia.kredit = true;
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
    sidang_calon_panitia: (a) => { S.panggil.push(['calon', a]); const q = String(a.p_cari || '').toLowerCase(); return r(q.length < 2 ? [] : CALON.filter(c => c.nama.toLowerCase().includes(q))); },
    sidang_panitia_simpan: (a) => { S.panggil.push(['simpan', a]);
      const isi = a.p_isi || {}; const nisn = [...Object.keys(LBL).map(k => isi[k]), ...Object.values(isi.pj || {})].filter(Boolean);
      if (new Set(nisn).size !== nisn.length) return salah('Hakim Uji 0 sudah memegang jabatan lain. Satu santri satu jabatan dalam satu sidang.');
      const nm = (k) => CALON.find(c => c.kunci === k);
      const P = { sesi: a.p_sesi, unit: 'putra', isi: { pj: {} }, pembimbing: isi.pembimbing || null, kredit: S.panitia.kredit };
      Object.keys(LBL).forEach(k => { if (isi[k]) P.isi[k] = { ...nm(isi[k]), poin: k === 'ketua' ? 15 : 10, kredit: P.kredit }; });
      Object.entries(isi.pj || {}).forEach(([k, v]) => { P.isi.pj[k] = { ...nm(v), poin: 10, kredit: P.kredit }; });
      const st = statusPanitia(P); if (!st.lengkap) return salah('Susunan majelis belum lengkap: ' + st.kurang.join(', ') + '.');
      S.panitia = P; return r(st); },
    sidang_sahkan_osda: (a) => { S.panggil.push(['sahkan', a]); let n = 0;
      a.p_ids.forEach(id => { const b = S.butir.find(x => x.id === id); if (b && b.status === 'diberikan') { b.status = 'tuntas'; b.sah_osda = true; n++; } });
      return r({ ok: true, disahkan: n, diminta: a.p_ids.length, dilewati: [] }); },
    pengesahan_osda_daftar: () => { S.panggil.push(['osda_daftar']); return r((window.__OSDA_IDS || []).map(id => ({ id, status: 'sah', sesi_putus: '2026-11-04', sesi_sah: '2026-11-06',
      disahkan_pada: '2026-11-06T03:00:00Z', oleh: 'OSDA-RQ', saksi: ['Hakim Uji 5'], tertunda_hari: 2, batas: '2026-11-09T03:00:00Z', boleh_sanggah: true }))); },
    sidang_sanggah_pengesahan: (a) => { S.panggil.push(['sanggah', a]); if (!a.p_alasan || a.p_alasan.length < 5) return salah('Tuliskan alasan sanggahan (minimal 5 huruf).'); window.__OSDA_IDS = []; return r({ ok: true, id: a.p_id }); },
    kelalaian_pengesahan: () => { S.panggil.push(['kelalaian']); if (window.__SUPER !== true) return salah('Khusus super admin.');
      return r({ musyrif: [{ nama: 'Ust. Lalai', diterima: 20, sendiri: 4, osda: 6, disanggah: 1, belum: 5, terkunci: 5, rata_hari: 3.5, tertua_hari: 6 },
                           { nama: 'Ust. Rajin', diterima: 12, sendiri: 12, osda: 0, disanggah: 0, belum: 0, terkunci: 0, rata_hari: 0.4, tertua_hari: null }],
                 bulan: [{ bulan: '2026-11', diterima: 22, sendiri: 10, osda: 6, belum: 5, terkunci: 0 }, { bulan: '2026-10', diterima: 10, sendiri: 6, osda: 0, belum: 0, terkunci: 5 }] }); },
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
    if (o.gerbang === false) window.__GERBANG = false;
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
const panggil = (p, jenis) => p.evaluate((j) => window.__V269.panggil.filter(x => x[0] === j), jenis);
const bukaSidang = async (page) => {
  await page.evaluate(() => navigateTo('sidang'));
  await page.waitForFunction(() => document.querySelector('#ruangSidang') && !document.querySelector('#sdIsi .sd-muat') && window.RQSidang?._uji?.S?.data, null, { timeout: 30000 });
  await page.waitForTimeout(300);
};
const kartuNama = (p) => p.evaluate(() => document.querySelector('#sdAntre .sd-kartu h2')?.textContent || (document.querySelector('#sdAntre .sd-akhir') ? 'AKHIR' : ''));
const tekan = async (p, k, o) => { await p.keyboard.press(k, o); await p.waitForTimeout(80); };
const tunggu = (p, fn, arg) => p.waitForFunction(fn, arg, { timeout: 8000 });

/** Isi satu baris formulir majelis: ketik, tunggu saran, klik saran yang namanya tepat. */
async function pilihCalon(p, id, nama) {
  await p.fill(`#sdMj-${id}`, nama);
  await p.waitForSelector(`.sd-mj-baris:has(#sdMj-${id}) .sd-calon:not([hidden]) button[data-nama="${nama}"]`, { timeout: 8000 });
  await p.click(`.sd-mj-baris:has(#sdMj-${id}) .sd-calon button[data-nama="${nama}"]`);
}
async function isiMajelisLengkap(p) {
  const peta = { ketua: 'Hakim Uji 0', anggota1: 'Hakim Uji 1', anggota2: 'Hakim Uji 2', panitera: 'Hakim Uji 3', penasihat: 'Hakim Uji 4',
    'pj-bersih': 'Hakim Uji 5', 'pj-hafal': 'Hakim Uji 6', 'pj-shalat': 'Hakim Uji 7', 'pj-pidato': 'Hakim Uji 8' };
  for (const [id, nama] of Object.entries(peta)) await pilihCalon(p, id, nama);
  await p.fill('#sdMj-pembimbing', 'Ust. Pembimbing Uji');
}

(async () => {
  console.log('\nA · Berkas');
  cek('A1 sw.js: VERSI rq-v2.69+', /VERSI\s+=\s+'rq-v2\.(69|[7-9]\d)(\.\d+)?'/.test(baca('sw.js')));
  const sd = baca('sidang.js'), app = baca('app.js'), ih = baca('index.html');
  cek('A2 sidang.js: memanggil RPC v2.69', ['sidang_calon_panitia', 'sidang_panitia_simpan', 'sidang_sahkan_osda'].every(f => sd.includes(`'${f}'`)));
  cek('A3 app.js: halaman Kelalaian, sanggah, daftar pengesahan; tanpa UUID super admin', ["db.rpc('kelalaian_pengesahan')", "'sidang_sanggah_pengesahan'", "'pengesahan_osda_daftar'"].every(x => app.includes(x)) && !/839511db/.test(app));
  cek('A4 index.html: menu Kelalaian Pengesahan tersembunyi bawaan', /class="nav-item hidden" data-view="kelalaian"/.test(ih));
  cek('A5 app.js: utas Ditutup tidak dibuka lagi saat dibaca & tidak menambah lencana', /\.neq\('status', 'Selesai'\)\.neq\('status', 'Ditutup'\)/.test(app) && /is\('dibaca_pada', null\)\.neq\('status', 'Ditutup'\)/.test(app));
  const mig = ada('migrasi', '20261107_v2_69_majelis_pengesahan.sql') ? baca('migrasi', '20261107_v2_69_majelis_pengesahan.sql') : '';
  if (mig) {   // migrasi/ hanya ada di repo src
    const badan = mig.slice(mig.indexOf('\nbegin;'), mig.indexOf('\ncommit;'));
    cek('A6 migrasi: aditif — tanpa policy/drop, trigger hanya yang baru', !/(alter|drop|create) policy/i.test(badan) && !/drop (table|function|trigger)/i.test(badan)
      && [...badan.matchAll(/create (?:or replace )?trigger (\w+)/gi)].map(m => m[1]).every(t => ['trg_audit_sidang_panitia', 'trg_audit_sidang_pengesahan', 'trg_tutup_buku_pesan'].includes(t)));
    cek('A7 migrasi: gerbang mati saat dipasang; bobot 10/15; fungsi bantu tertutup', /values \('gerbang', 'false'::jsonb\)/.test(badan) && /'A215'[^\n]*10\)/.test(badan) && /'A216'[^\n]*15\)/.test(badan)
      && /_panitia_kredit\(date, text\)'[^]*from public, anon, authenticated/.test(badan));
    cek('A8 rollback & langkah sesudah rilis tersedia', ada('migrasi', '20261107_v2_69_ROLLBACK.sql') && /set nilai = 'true'::jsonb/.test(baca('migrasi', '20261107_v2_69_1_setelah_rilis.sql')));
  }
  cek('A9 html2pdf tersedia untuk uji PDF', fs.existsSync(H2P));

  const sSumber = await layani(AKAR, 4691), sBuild = await layani(path.join(AKAR, 'dist-uji'), 4692);
  const URL_ = { sumber: 'http://127.0.0.1:4691/', build: 'http://127.0.0.1:4692/' };
  const browser = await chromium.launch();

  for (const v of ['sumber', 'build']) {
    console.log(`\nB · ${v}`);
    { // OSDA · gerbang majelis → antrean → S
      const s = await masuk(browser, URL_[v], { peran: 'Osis', korps: 'Osis Putra' });
      const p = s.page;
      await bukaSidang(p);
      cek('B1 rekap: susunan majelis belum diisi + papan tik S/M', await p.evaluate(() => {
        const r = document.querySelector('.sd-mj-ringkas'); return !!r && !r.classList.contains('lengkap') && /belum diisi/.test(r.textContent)
          && /sahkan pelaksanaan/.test(document.querySelector('.sd-papan').textContent); }));
      await tekan(p, 'Enter');
      await p.waitForSelector('.swal2-popup .sd-mj');
      cek('B2 Enter "Mulai sidang" → formulir majelis lebih dulu (antrean belum terbuka)', await p.evaluate(() => !document.querySelector('#sdAntre')));
      cek('B3 formulir: 5 jabatan inti + PJ per kelompok bentuk di berkas + Pembimbing', await p.evaluate(() =>
        [...document.querySelectorAll('.sd-mj input[data-mj]')].map(x => x.dataset.mj).join(',') === 'ketua,anggota1,anggota2,panitera,penasihat,pj-bersih,pj-hafal,pj-shalat,pj-pidato'
        && !!document.querySelector('#sdMj-pembimbing') && /15 poin/.test(document.querySelector('.sd-mj-baris').textContent)));
      await potret(p, `v269-majelis-kosong-${v}`);
      await p.click('.swal2-confirm');
      await p.waitForTimeout(200);
      cek('B4 simpan kosong → "Belum diisi", tanpa RPC', /Belum diisi: Hakim Ketua/.test(await p.textContent('.swal2-validation-message')) && (await panggil(p, 'simpan')).length === 0);
      await p.fill('#sdMj-ketua', 'Fulan bebas');
      await p.waitForTimeout(500);
      await p.click('.swal2-confirm'); await p.waitForTimeout(200);
      cek('B5 nama diketik bebas (tidak dipilih dari saran) ditolak', /Hakim Ketua: pilih nama dari daftar saran/.test(await p.textContent('.swal2-validation-message')));
      await pilihCalon(p, 'ketua', 'Hakim Uji 0');
      await p.fill('#sdMj-anggota1', 'Hakim Uji 0');
      await p.waitForSelector('.sd-mj-baris:has(#sdMj-anggota1) .sd-calon:not([hidden]) button[data-nama="Hakim Uji 0"]');
      cek('B6 santri yang sudah memegang jabatan tidak bisa dipilih lagi', await p.evaluate(() => {
        const b = document.querySelector('.sd-mj-baris:has(#sdMj-anggota1) .sd-calon button[data-nama="Hakim Uji 0"]'); return b.disabled && /sudah memegang jabatan/.test(b.textContent); }));
      await p.fill('#sdMj-anggota1', 'Hakim Uji 1');
      await p.waitForSelector('.sd-mj-baris:has(#sdMj-anggota1) .sd-calon:not([hidden]) button[data-nama="Hakim Uji 1"]');
      cek('B7 saran: kelas, kamar, jumlah tugas bulan ini; RPC calon tanpa NISN', await p.evaluate(() => /XI-D · Kamar 41 · bertugas 1× bulan ini/.test(document.querySelector('.sd-mj-baris:has(#sdMj-anggota1) .sd-calon button[data-nama="Hakim Uji 1"]').textContent))
        && (await panggil(p, 'calon')).every(x => !('p_nisn' in x[1])));
      await isiMajelisLengkap(p);
      await potret(p, `v269-majelis-isi-${v}`);
      await p.click('.swal2-confirm');
      await tunggu(p, () => document.querySelector('#sdAntre .sd-kartu'));
      const sm = (await panggil(p, 'simpan'))[0][1];
      cek('B8 RPC sidang_panitia_simpan: kunci per jabatan, PJ per kelompok, pembimbing, sesi berkas', sm.p_sesi === '2026-11-06' && sm.p_isi.ketua === 'k0' && sm.p_isi.penasihat === 'k4'
        && JSON.stringify(sm.p_isi.pj) === '{"bersih":"k5","hafal":"k6","shalat":"k7","pidato":"k8"}' && sm.p_isi.pembimbing === 'Ust. Pembimbing Uji', sm);
      cek('B9 sesudah tersimpan antrean langsung terbuka pada santri pertama', await kartuNama(p) === 'Ahmad Fauzan');
      await potret(p, `v269-antre-${v}`);
      await tekan(p, 'Enter'); await tekan(p, 'Enter');
      await tunggu(p, () => window.__V269.panggil.some(x => x[0] === 'putus'));
      cek('B10 ketukan palu lolos gerbang (majelis lengkap)', (await panggil(p, 'putus')).length === 1);
      // Muhammad Sepuluh → lewati → Teuku Alif (perkara di tangan musyrif sejak 4 Nov)
      await tekan(p, 'Space');
      cek('B11 santri dengan perkara di tangan musyrif: tombol "Sahkan 1", PJ saksi tampil, kalimat menyebut S', await kartuNama(p) === 'Teuku Alif' && await p.evaluate(() =>
        /Sahkan 1/.test(document.querySelector('[data-aksi="a-sahkan"]')?.textContent || '') && /PJ Hakim Lama/.test(document.querySelector('#sdAntre .sd-perkara').textContent)
        && /tekan S/.test(document.querySelector('#sdAntre .sd-bicara').textContent)));
      await tekan(p, 's');
      await p.waitForSelector('.swal2-popup .sd-sah-daftar');
      await potret(p, `v269-sahkan-${v}`);
      cek('B12 S → daftar pembinaan yang bisa disahkan (1), tanpa centang bawaan', await p.evaluate(() => document.querySelectorAll('.sd-sah-daftar input').length === 1 && !document.querySelector('.sd-sah-daftar input:checked')));
      await p.click('.swal2-confirm'); await p.waitForTimeout(200);
      cek('B13 tanpa centang → ditolak, tanpa RPC', /Centang minimal/.test(await p.textContent('.swal2-validation-message')) && (await panggil(p, 'sahkan')).length === 0);
      await p.check('.sd-sah-daftar input');
      await p.click('.swal2-confirm');
      await tunggu(p, () => window.__V269.panggil.some(x => x[0] === 'sahkan') && !document.querySelector('.swal2-popup:not(.swal2-toast)'));
      await p.waitForTimeout(250);
      cek('B14 RPC sidang_sahkan_osda id perkara; kartu berstempel "Disahkan"', JSON.stringify((await panggil(p, 'sahkan'))[0][1].p_ids) === '["a02-2"]'
        && /Disahkan/.test(await p.evaluate(() => document.querySelector('#sdAntre .sd-stempel')?.textContent || '')), await panggil(p, 'sahkan'));
      await tekan(p, 'Enter');
      cek('B15 Enter sesudah disahkan → santri berikutnya', await kartuNama(p) === 'Raihan Akbar');
      // ucapan Bahasa
      const ucapan = await p.evaluate(() => { const S = window.RQSidang._uji.S; const k = [...S.santri.values()].find(x => x.sesi.some(b => b.ucapan)); return k && k.kunci; });
      await p.evaluate((k) => window.RQSidang._uji.bukaAntre(k), ucapan);
      await p.waitForTimeout(200);
      cek('B16 perkara bidang Bahasa: "Alat bukti · ucapan tercatat" + kalimatnya', await p.evaluate(() => {
        const q = document.querySelector('#sdAntre .sd-ucapan'); return !!q && /ucapan tercatat/i.test(q.textContent) && /aku mau ke kamar mandi dulu/.test(q.textContent); }));
      await tekan(p, 'Escape');
      await p.waitForTimeout(250);
      await potret(p, `v269-daftar-${v}`);
      cek('B17 rekap: susunan lengkap & apresiasi tercatat', await p.evaluate(() => { const r = document.querySelector('.sd-mj-ringkas'); return r.classList.contains('lengkap') && /Hakim Uji 0/.test(r.textContent) && /apresiasi tercatat/.test(r.textContent); }));
      cek('B18 berita acara memuat majelis lengkap & PJ', await p.evaluate(async () => { let t = ''; const asli = navigator.clipboard.writeText; navigator.clipboard.writeText = async (x) => { t = x; };
        document.querySelector('[data-aksi="berita-acara"]').click(); await new Promise(r => setTimeout(r, 200)); navigator.clipboard.writeText = asli;
        return /Penasihat Hakim Uji 4/.test(t) && /PJ eksekusi: Pembersihan Hakim Uji 5/.test(t) && /Disahkan OSDA[^\n]*1 perkara/.test(t) && /Pembimbing: Ust\. Pembimbing Uji/.test(t); }));
      cek('B19 tanpa galat halaman', s.galat.length === 0, s.galat.slice(0, 4));
      await s.ctx.close();
    }
    { // OSDA · berkas PDF: gerbang lalu PDF dengan PJ & siap disahkan
      const s = await masuk(browser, URL_[v], { peran: 'Osis', korps: 'Osis Putra' });
      const p = s.page;
      await bukaSidang(p);
      await p.click('.sd-atas [data-aksi="berkas"]');
      await p.waitForSelector('.swal2-popup .sd-mj');
      cek('B20 unduh berkas → formulir majelis lebih dulu', await p.evaluate(() => /sebelum berkas diunduh/.test(document.querySelector('.sd-mj').textContent)));
      await isiMajelisLengkap(p);
      await p.click('.swal2-confirm');
      await p.waitForSelector('.swal2-popup .sd-berkas-form');
      cek('B21 jendela berkas: majelis tampil sebagai nama terpilih (bukan isian ketik)', await p.evaluate(() => !document.querySelector('#sdM-ketua') && /Hakim Ketua Hakim Uji 0/.test(document.querySelector('.sd-mj-baca').textContent)));
      await p.evaluate(() => {
        const asli = window.RQ_SIDANG.pdfBaru;
        window.RQ_SIDANG.pdfBaru = async (k) => { const r = await asli(k); const t = r.pdf.text.bind(r.pdf); window.__TEKS = [];
          r.pdf.text = (x, ...a) => { window.__TEKS.push(...[].concat(x)); return t(x, ...a); }; return r; };
      });
      const [unduh] = await Promise.all([p.waitForEvent('download', { timeout: 30000 }), p.click('.swal2-confirm')]);
      const berkas = path.join(KELUAR, `v269-berkas-${v}.pdf`);
      await unduh.saveAs(berkas);
      const T = (await p.evaluate(() => window.__TEKS)).join('\n');
      const harap22 = ['II. PENANGGUNG JAWAB EKSEKUSI', 'PJ Pembersihan: Hakim Uji 5', 'III. PERKARA SIAP DISAHKAN', 'Teuku Alif', 'IV. MAJELIS SIDANG', 'Penasihat', 'Hakim Uji 4', 'Ucapan tercatat: "aku mau ke kamar mandi dulu"', 'Pembimbing - Ust. Pembimbing Uji'];
      cek('B22 PDF: II PJ eksekusi, III siap disahkan, IV majelis 5 kolom (Penasihat), ucapan tercatat', fs.readFileSync(berkas).slice(0, 4).toString() === '%PDF'
        && harap22.every(x => T.replace(/\n/g, ' ').includes(x)), harap22.filter(x => !T.replace(/\n/g, ' ').includes(x)));
      cek('B23 PDF tetap Latin-1', !/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/.test(T));
      if (POTRET && v === 'sumber') try { require('child_process').execFileSync('pdftoppm', ['-png', '-r', '70', berkas, path.join(KELUAR, 'v269-berkas-hal')]); } catch (e) {}
      cek('B24 tanpa galat halaman', s.galat.length === 0, s.galat.slice(0, 4));
      await s.ctx.close();
    }
    { // super admin: tanpa gerbang
      const s = await masuk(browser, URL_[v], { peran: 'Admin', super: true });
      const p = s.page;
      await bukaSidang(p);
      await p.click('[data-aksi="mulai"]');
      await tunggu(p, () => document.querySelector('#sdAntre .sd-kartu'));
      cek('B25 super admin: Mulai sidang langsung ke antrean (tanpa formulir majelis)', !(await p.$('.swal2-popup .sd-mj')));
      await tekan(p, 'Enter');
      await tunggu(p, () => window.__V269.panggil.some(x => x[0] === 'putus'));
      cek('B26 super admin: palu diketuk tanpa susunan majelis', (await panggil(p, 'simpan')).length === 0);
      cek('B27 tanpa galat halaman', s.galat.length === 0, s.galat.slice(0, 4));
      await s.ctx.close();
    }
    { // galat gerbang dari server di tengah sidang (kelompok baru) → tanda + muat ulang
      const s = await masuk(browser, URL_[v], { peran: 'Osis', korps: 'Osis Putra' });
      const p = s.page;
      await bukaSidang(p);
      await tekan(p, 'Enter');
      await p.waitForSelector('.swal2-popup .sd-mj');
      await isiMajelisLengkap(p);
      await p.click('.swal2-confirm');
      await tunggu(p, () => document.querySelector('#sdAntre .sd-kartu'));
      await p.evaluate(() => { window.__GAGAL = 'gerbang'; });
      const nBerkas = (await panggil(p, 'berkas')).length;
      await tekan(p, 'Enter');
      await tunggu(p, () => document.querySelector('#sdAntre .sd-izin.gagal'));
      await p.waitForTimeout(700);
      const t28 = await p.evaluate(() => document.querySelector('#sdAntre .sd-izin.gagal')?.textContent || '');
      cek('B28 server menolak (majelis belum lengkap) → kartu "belum tersimpan" berisi alasannya, berkas dimuat ulang', /PJ Pidato/.test(t28)
        && (await panggil(p, 'berkas')).length > nBerkas, [t28, (await panggil(p, 'berkas')).length, nBerkas]);
      cek('B29 tanpa galat halaman', s.galat.length === 0, s.galat.slice(0, 4));
      await s.ctx.close();
    }

    console.log(`\nC · ${v}`);
    { // super admin: Pembinaan, Kelalaian, utas, label ucapan
      const s = await masuk(browser, URL_[v], { peran: 'Admin', super: true });
      const p = s.page;
      await p.waitForTimeout(500);
      cek('C1 super admin: menu Kelalaian Pengesahan tampil', await p.evaluate(() => !document.querySelector('#navMenu [data-view="kelalaian"]').classList.contains('hidden')));
      await p.evaluate(() => navigateTo('kelalaian'));
      await tunggu(p, () => document.querySelector('.kl-tabel'));
      cek('C2 Kelalaian: ringkasan + per musyrif (yang lalai di atas, bertanda merah) + per bulan + catatan Tutup Buku', await p.evaluate(() => {
        const b = document.querySelectorAll('.kl-tabel tbody tr');
        return b.length === 2 && /Ust\. Lalai/.test(b[0].textContent) && b[0].classList.contains('kl-merah') && b[1].classList.contains('kl-hijau')
          && /Oktober 2026/.test(document.querySelector('.kl-bulan').textContent) && /5 terkunci/.test(document.querySelector('.kl-bulan').textContent)
          && /32/.test(document.querySelector('.kl-angka').textContent) && /Tutup Buku/.test(document.querySelector('.kl-catatan').textContent); }));
      await potret(p, `v269-kelalaian-${v}`);
      // Pembinaan: tanda Disahkan OSDA + Sanggah
      await p.evaluate(() => navigateTo('pembinaan'));
      await tunggu(p, () => document.querySelector('#pbBulan'));
      await p.selectOption('#pbBulan', '*');
      await tunggu(p, () => document.querySelector('#tbBina tr[data-bina-id] [data-pbn$="|Dalam Proses"]'));
      const idb = await p.evaluate(() => document.querySelector('#tbBina tr[data-bina-id]:has([data-pbn$="|Dalam Proses"])').dataset.binaId);
      await p.evaluate((id) => { window.__OSDA_IDS = [id]; OSDA_BINA.waktu = 0; return gambarBina(); }, idb);
      await tunggu(p, (id) => document.querySelector(`#tbBina tr[data-bina-id="${id}"] [data-sanggah-osda]`), idb);
      cek('C3 Pembinaan: tanda "Disahkan OSDA" (sidang, saksi, lama tertunda) dan "Buka Lagi" diganti "Sanggah OSDA"', await p.evaluate((id) => {
        const tr = document.querySelector(`#tbBina tr[data-bina-id="${id}"]`);
        return /Disahkan OSDA · sidang[^]*saksi Hakim Uji 5[^]*2 hari/.test(tr.querySelector('.jejak-sah.osda')?.textContent || '') && !tr.querySelector('[data-pbn$="|Dalam Proses"]'); }, idb));
      await p.evaluate((id) => document.querySelector(`#tbBina tr[data-bina-id="${id}"]`).scrollIntoView({ block: 'center' }), idb);
      await potret(p, `v269-pembinaan-osda-${v}`);
      await p.click(`#tbBina tr[data-bina-id="${idb}"] [data-sanggah-osda]`);
      await p.waitForSelector('.swal2-popup #sgAlasan');
      await p.fill('#sgAlasan', 'blm');
      await p.click('.swal2-confirm'); await p.waitForTimeout(200);
      cek('C4 sanggah: alasan pendek ditolak tanpa RPC', /minimal 5 huruf/.test(await p.textContent('.swal2-validation-message')) && (await panggil(p, 'sanggah')).length === 0);
      await p.fill('#sgAlasan', 'Ananda belum membersihkan kamar mandi.');
      await p.click('.swal2-confirm');
      await tunggu(p, () => window.__V269.panggil.some(x => x[0] === 'sanggah'));
      cek('C5 RPC sidang_sanggah_pengesahan(id, alasan)', JSON.stringify((await panggil(p, 'sanggah'))[0][1]) === JSON.stringify({ p_id: idb, p_alasan: 'Ananda belum membersihkan kamar mandi.' }));
      // utas Ditutup
      cek('C6 utas pembinaan berstatus Ditutup: dianggap tertutup, tanpa "baru", berlabel Tutup Buku, tanpa kotak balas', await p.evaluate(() => {
        const uid = idSaya();
        const u = kelompokUtas([{ utas: 'bina:X1|a|b', jenis: 'pembinaan', id_pembinaan: 'X1', status: 'Ditutup', penerima_id: uid, pengirim_id: 'z', pengirim_nama: 'OSDA', pengirim_role: 'Osis', penerima_nama: 'Saya', penerima_role: 'Admin', dibaca_pada: null, isi: 'Laporan', created_at: '2026-10-20T03:00:00Z', nama_santri: 'Santri X' }])[0];
        if (!(u.ditutup && u.selesai && u.belum === 0 && u.status === 'Ditutup')) return false;
        const lama = stPesan.utas; stPesan.utas = [u]; stPesan.aktif = u.utas;
        const wadah = document.createElement('div'); wadah.innerHTML = '<div id="msgList"></div><div id="msgPanel"></div>'; document.body.appendChild(wadah);
        gambarDaftarUtas(); gambarUtas();
        const ok = /Ditutup · Tutup Buku/.test(document.getElementById('msgList').textContent) && !document.getElementById('msgIsi') && /Tutup Buku/.test(document.querySelector('.msg-ditutup').textContent);
        wadah.remove(); stPesan.utas = lama; stPesan.aktif = null; return ok; }));
      // label ucapan
      cek('C7 catat pelanggaran bidang Bahasa: label "Ucapan yang terdengar" + petunjuk; bidang lain kembali semula', await p.evaluate(() => {
        const w = document.createElement('div');
        w.innerHTML = '<input id="fKode"><div class="field"><label class="label">Catatan</label><input id="fCatatan" placeholder="opsional"></div>';
        document.body.appendChild(w);
        terapkanLabelUcapan(document.getElementById('fKode'), { bidang: 'Bahasa' });
        const a = w.querySelector('.field .label').textContent === 'Ucapan yang terdengar' && !!document.querySelector('.ucapan-hint') && /persis/.test(document.getElementById('fCatatan').placeholder);
        terapkanLabelUcapan(document.getElementById('fKode'), { bidang: 'Ubudiyah' });
        const b = w.querySelector('.field .label').textContent === 'Catatan' && !document.querySelector('.ucapan-hint') && document.getElementById('fCatatan').placeholder === 'opsional';
        w.remove(); return a && b; }));
      cek('C8 tanpa galat halaman', s.galat.length === 0, s.galat.slice(0, 4));
      await s.ctx.close();
    }
    { // Admin lain: Kelalaian tertutup
      const s = await masuk(browser, URL_[v], { peran: 'Admin' });
      const p = s.page;
      await p.waitForTimeout(500);
      cek('C9 Admin lain: menu Kelalaian tersembunyi; dibuka paksa → "Khusus super admin" tanpa RPC', await p.evaluate(() => document.querySelector('#navMenu [data-view="kelalaian"]').classList.contains('hidden'))
        && await (async () => { await p.evaluate(() => navigateTo('kelalaian')); await p.waitForTimeout(800); return p.evaluate(() => /Khusus super admin/.test(document.getElementById('viewRoot').textContent)); })()
        && (await panggil(p, 'kelalaian')).length === 0);
      cek('C10 tanpa galat halaman', s.galat.length === 0, s.galat.slice(0, 4));
      await s.ctx.close();
    }
  }
  await browser.close(); sSumber.close(); sBuild.close();
  console.log(`\n${lulus} lulus, ${gagal} gagal`);
  process.exit(gagal ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
