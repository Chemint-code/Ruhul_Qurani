/* uji-v270.cjs — v2.70 ALUR MAHKAMAH · MEJA MAJELIS · BILAH LENGKET · PELANTIKAN · GERAK SIDANG · KELALAIAN
 *
 *   npm run bangun:uji && npm i --no-save html2pdf.js@0.10.1 && node uji/uji-v270.cjs
 *
 * Harness & RPC tiruan sama dengan uji-v269 (ditambah tim_pendidik_rpc tiruan, opsi gerak/viewport).
 * A · berkas: VERSI, ikon dalam subset, tanpa onerror sebaris.
 * B · Ruang Sidang (sumber & build):
 *     tata letak — Meja Majelis di atas kelompok (bukan di Rekap), kursi membuka isian yang tepat,
 *       kelompok & penghitung formulir, Pembimbing dari Para Pendidik + foto, M & /, Bilah Majelis
 *       lengket + lompat P, satu-satunya [data-aksi="mulai"], Rekap tidak terpotong (1361×656),
 *       bilah jempol HP;
 *     gerak — Pelantikan sekali per sesi (gerak & diam), Enter beruntun tanpa ketukan ganda,
 *       berkas diserahkan, kartu FLIP, lewati disisihkan, cap apresiasi, Disahkan OSDA, penutupan.
 * C · Kelalaian: selebar penuh tanpa gulir mendatar, Per bulan sebelum tabel, gerak sekali.
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
    tim_pendidik_rpc: () => { S.panggil.push(['pendidik']); return r({ hari: '2026-11-06', pendidik: [
      { id: 'g1', nama: 'Ust. Pembimbing Uji, S.Pd.', role: 'Guru', foto: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==' },
      { id: 'g2', nama: 'Ustz. Musyrifah Dua', role: 'Guru', foto: null }, { id: 'g3', nama: 'Ust. Musyrif Satu', role: 'Guru', foto: null }] }); },
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
  const ctx = await browser.newContext({ viewport: o.vp || (o.hp ? { width: 390, height: 844 } : { width: 1366, height: 860 }),
    deviceScaleFactor: o.hp ? 2 : 1, isMobile: !!o.hp, hasTouch: !!o.hp, serviceWorkers: 'block', reducedMotion: o.gerak ? 'no-preference' : 'reduce', acceptDownloads: true });
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
    try { localStorage.setItem('rq-efek-pilih', o.gerak ? 'penuh' : 'hemat'); localStorage.setItem('rq.tur.v1.u-admin', '{"t":0}'); localStorage.setItem('rq-sidang-bunyi', 'mati'); } catch (e) {}
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


const tutupSwal = (p) => p.evaluate(() => { const b = document.querySelector('.swal2-cancel'); if (b) b.click(); });
async function majelisLengkap(p) {
  await p.click('#sdMejaMj [data-aksi="majelis"]');
  await p.waitForSelector('.swal2-popup .sd-mj input[data-mj]');
  await isiMajelisLengkap(p);
  await p.click('.swal2-confirm');
}

(async () => {
  console.log('\nA · Berkas');
  const sd = baca('sidang.js'), css = baca('gaya.css'), app = baca('app.js');
  cek('A1 sw.js: VERSI rq-v2.70+', /VERSI\s+=\s+'rq-v2\.([7-9]\d)(\.\d+)?'/.test(baca('sw.js')));
  cek('A2 app.js: APP.versi rq-v2.70', /APP\.versi = 'rq-v2\.70'/.test(app));
  const daftar = JSON.parse(baca('ikon', 'daftar.json')).ikon;
  const dipakai = [...new Set([...sd.matchAll(/fa-[a-z][a-z-]+/g)].map(m => m[0]).filter(x => !/^fa-(solid|regular|brands|spin)$/.test(x)))];
  const hilang = dipakai.filter(x => !daftar.includes(x));
  cek('A3 sidang.js: semua ikon ada di subset', !hilang.length, hilang);
  cek('A4 sidang.js: tanpa onerror sebaris; Pembimbing lewat tim_pendidik_rpc', !/onerror=/.test(sd) && sd.includes("'tim_pendidik_rpc'"));
  cek('A5 gaya.css: blok v2.70 + kurangi gerak', /v2\.70 — ALUR MAHKAMAH/.test(css) && /\.sd-lantik\.diam|:not\(\.diam\)/.test(css));

  const sSumber = await layani(AKAR, 4701), sBuild = await layani(path.join(AKAR, 'dist-uji'), 4702);
  const URL_ = { sumber: 'http://127.0.0.1:4701/', build: 'http://127.0.0.1:4702/' };
  const browser = await chromium.launch();

  for (const v of ['sumber', 'build']) {
    console.log(`\nB · ${v} · tata letak (gerak dikurangi)`);
    {
      const s = await masuk(browser, URL_[v], { peran: 'Osis', korps: 'Osis Putra', vp: { width: 1361, height: 656 } });
      const p = s.page;
      await bukaSidang(p);
      cek('B1 Meja Majelis di kolom utama, di atas kelompok P; tidak lagi di Rekap', await p.evaluate(() => {
        const m = document.querySelector('.sd-utama > #sdMejaMj.sd-mj-ringkas'), k = document.querySelector('.sd-utama > .sd-kelompok');
        return !!m && !!k && !!(m.compareDocumentPosition(k) & Node.DOCUMENT_POSITION_FOLLOWING) && !document.querySelector('.sd-rekap .sd-mj-ringkas');
      }));
      cek('B2 kursi: 5 inti + 4 PJ, ketua pertama, kosong bertanda "belum diisi"', await p.evaluate(() => {
        const k = [...document.querySelectorAll('#sdMejaMj button.sd-mjk')];
        return k.length === 9 && k[0].classList.contains('ketua') && k.every(x => x.classList.contains('kosong')) && /belum diisi/.test(document.querySelector('#sdMejaMj').textContent);
      }));
      cek('B3 satu-satunya [data-aksi="mulai"]; bilah memakai mulai-bilah', await p.evaluate(() => document.querySelectorAll('[data-aksi="mulai"]').length === 1 && !!document.querySelector('#sdBilah [data-aksi="mulai-bilah"]')));
      cek('B4 Bilah Majelis tersembunyi sebelum menggulir', await p.evaluate(() => !document.querySelector('#sdBilah').classList.contains('tampak') && document.querySelector('#sdBilah').inert));
      await p.click('#sdMejaMj button.sd-mjk[data-nilai="panitera"]');
      await p.waitForSelector('.swal2-popup .sd-mj input[data-mj]');
      await p.waitForTimeout(250);
      cek('B5 klik kursi Panitera → formulir terbuka di isian Panitera', await p.evaluate(() => document.activeElement?.id === 'sdMj-panitera'));
      cek('B6 formulir: kelompok jabatan + penghitung 0/9; baris pertama tetap Hakim Ketua 15 poin', await p.evaluate(() =>
        document.querySelectorAll('.sd-mj-judul').length >= 4 && /0\/9 kursi wajib/.test(document.querySelector('.sd-mj-hitung').textContent)
        && /15 poin/.test(document.querySelector('.sd-mj-baris').textContent)));
      await pilihCalon(p, 'ketua', 'Hakim Uji 0');
      await p.waitForTimeout(80);
      cek('B7 penghitung naik saat kursi diisi', await p.evaluate(() => /1\/9/.test(document.querySelector('.sd-mj-hitung').textContent)));
      await p.focus('#sdMj-pembimbing');
      await p.waitForSelector('.sd-calon-guru:not([hidden]) button[data-guru]', { timeout: 8000 });
      cek('B8 Pembimbing: saran Para Pendidik dengan foto', await p.evaluate(() => {
        const b = document.querySelector('.sd-calon-guru button[data-guru="Ust. Pembimbing Uji, S.Pd."]'); return !!b && !!b.querySelector('.sd-guru-foto img');
      }));
      await tutupSwal(p); await p.waitForTimeout(300);
      await p.keyboard.press('m'); await p.waitForTimeout(250);
      cek('B9 tombol M di daftar membuka Susunan majelis', await p.evaluate(() => !!document.querySelector('.swal2-popup .sd-mj')));
      await tutupSwal(p); await p.waitForTimeout(300);
      await p.keyboard.press('/'); await p.waitForTimeout(150);
      cek('B10 tombol / memfokuskan pencarian', await p.evaluate(() => document.activeElement?.id === 'sdCari'));
      await p.evaluate(() => document.activeElement.blur());
      await p.evaluate(() => { const g = document.getElementById('sdGulir'); g.scrollTop = g.scrollHeight; });
      await p.waitForTimeout(450);
      cek('B11 sesudah menggulir: Bilah Majelis tampak (titik kursi, lompat P, cari, Mulai)', await p.evaluate(() => {
        const b = document.querySelector('#sdBilah'); return b.classList.contains('tampak') && !b.inert && b.querySelectorAll('.sd-bm-p').length >= 2
          && !!b.querySelector('.sd-bm-mj') && !!b.querySelector('[data-aksi="fokus-cari"]') && b.querySelector('.sd-bilah-isi').getBoundingClientRect().top >= 0;
      }));
      cek('B12 Rekap tidak terpotong pada 1361×656', await p.evaluate(() => { const r = document.querySelector('.sd-rekap').getBoundingClientRect(); return r.bottom <= innerHeight + 1 && r.top >= 0; }));
      await p.click('#sdBilah .sd-bm-p.p2');
      await p.waitForTimeout(700);
      cek('B13 lompat P2 → kelompok P2 di bawah bilah', await p.evaluate(() => {
        const h = document.querySelector('.sd-grup[data-p="2"]').getBoundingClientRect(), g = document.getElementById('sdGulir').getBoundingClientRect();
        return h.top - g.top >= 40 && h.top - g.top <= 140;
      }));
      await p.click('#sdBilah [data-aksi="ke-atas"]'); await p.waitForTimeout(500);
      cek('B14 kembali ke atas → bilah tersembunyi lagi', await p.evaluate(() => document.getElementById('sdGulir').scrollTop < 5 && !document.querySelector('#sdBilah').classList.contains('tampak')));
      await majelisLengkap(p);
      await p.waitForSelector('#ruangSidang .sd-lantik', { timeout: 8000 });
      cek('B15 Pelantikan (diam): nama, jabatan, +15, Pembimbing; Cap Majelis Sah', await p.evaluate(() => {
        const l = document.querySelector('.sd-lantik'); return l.classList.contains('diam') && l.querySelectorAll('.sd-lt-kursi').length === 9
          && /Hakim Uji 0/.test(l.querySelector('.sd-lt-kursi.ketua').textContent) && /\+15/.test(l.querySelector('.sd-lt-kursi.ketua').textContent)
          && /Ust\. Pembimbing Uji/.test(l.querySelector('.sd-lt-pembimbing').textContent) && !!l.querySelector('.sd-lt-cap');
      }));
      await p.waitForTimeout(300);
      await p.keyboard.press('Enter'); await p.waitForTimeout(400);
      cek('B16 Enter menutup Pelantikan tanpa memulai sidang', await p.evaluate(() => !document.querySelector('.sd-lantik') && !document.querySelector('#sdAntre')));
      cek('B17 Meja Majelis lengkap + foto Pembimbing', await p.evaluate(() => { const m = document.querySelector('#sdMejaMj');
        return m.classList.contains('lengkap') && /Lengkap/.test(m.textContent) && !!m.querySelector('.sd-mejamj-pembimbing .sd-guru-foto img') && m.querySelectorAll('.sd-mjk.isi').length === 9; }));
      await p.click('#sdMejaMj [data-aksi="majelis"]'); await p.waitForSelector('.swal2-popup .sd-mj'); await p.click('.swal2-confirm');
      await p.waitForTimeout(900);
      cek('B18 simpan ulang di sesi yang sama: tanpa Pelantikan kedua', await p.evaluate(() => !document.querySelector('.sd-lantik') && !window.RQSidang._uji.S.lantik));
      cek('B19 tanpa galat halaman', !s.galat.length, s.galat);
      await s.ctx.close();
    }

    console.log(`\nB · ${v} · gerak menyala`);
    {
      const s = await masuk(browser, URL_[v], { peran: 'Osis', korps: 'Osis Putra', gerak: true });
      const p = s.page;
      await bukaSidang(p);
      await p.waitForTimeout(1600);
      await majelisLengkap(p);
      await p.waitForSelector('#ruangSidang .sd-lantik.tayang', { timeout: 8000 });
      await p.waitForTimeout(500);
      cek('B20 Pelantikan bergerak: benang dijahit dengan jalur, kursi berjadwal', await p.evaluate(() => {
        const l = document.querySelector('.sd-lantik'); const d = l.querySelector('.sd-lt-garis').getAttribute('d') || '';
        return !l.classList.contains('diam') && /^M[\d.]+ [\d.]+( (M[\d. ]+ )?Q[\d. ]+){8}$/.test(d) && l.querySelector('.sd-lt-kursi.ketua').style.getPropertyValue('--t') === '380ms'
          && l.getAnimations({ subtree: true }).length > 0;
      }));
      await p.mouse.click(30, 30); await p.waitForTimeout(450);
      cek('B21 ketuk menutup Pelantikan', await p.evaluate(() => !document.querySelector('.sd-lantik')));
      await p.click('[data-aksi="mulai"]');
      await p.waitForSelector('#sdAntre .sd-kartu');
      await p.waitForTimeout(400);
      const pertama = await kartuNama(p);
      await tekan(p, 'Enter');
      cek('B22 ketuk palu: berkas dilipat & sampul "diserahkan" muncul', await p.evaluate(() => document.querySelector('#sdAntre').classList.contains('ev-putus') && !!document.querySelector('#sdAntre .sd-sampul')));
      await tekan(p, 'Enter');
      cek('B23 Enter beruntun memotong gerak: santri berikutnya, tanpa ketukan ganda', (await kartuNama(p)) !== pertama
        && (await p.evaluate(() => window.__V269.panggil.filter(x => x[0] === 'putus').length)) <= 1);
      cek('B24 kartu baru datang dari daftar "Berikutnya" (FLIP)', await p.evaluate(() => document.querySelector('#sdAntre').classList.contains('flip')
        && document.querySelector('#sdAntre .sd-kartu').getAnimations().length > 0));
      await p.waitForTimeout(1200);
      cek('B25 palu pertama tersimpan → kursi majelis berkilau "apresiasi tercatat"', await p.evaluate(() => /apresiasi tercatat/.test(document.querySelector('#sdAntreMj')?.textContent || '')
        && window.RQSidang._uji.S.data.panitia.kredit === true));
      cek('B26 putusan tersimpan sekali untuk santri pertama', (await panggil(p, 'putus')).length === 1);
      await tekan(p, ' ');
      cek('B27 lewati: kartu lama disisihkan (salinan sementara)', await p.evaluate(() => !!document.querySelector('#ruangSidang > .sd-kartu-hantu') && document.querySelector('#sdAntre').classList.contains('ev-lewati')));
      await p.waitForTimeout(800);
      cek('B28 salinan kartu dibersihkan', await p.evaluate(() => !document.querySelector('.sd-kartu-hantu')));
      await tekan(p, 'ArrowDown');
      cek('B29 banding: stempel + timbangan berayun di penghitung', await p.evaluate(() => document.querySelector('#sdAntre').classList.contains('ev-banding') && !!document.querySelector('#sdAntre .h-banding i')));
      // Disahkan OSDA: santri yang masih menunggu dan punya pembinaan dari sidang sebelumnya
      const kSah = await p.evaluate(() => { const U = window.RQSidang._uji; return U.daftarAntre().find(x => x.keadaan === 'dipanggil' && U.siapSah(x).length)?.kunci; });
      cek('B29b ada santri siap disahkan di antrean uji', !!kSah);
      await p.evaluate((k) => window.RQSidang._uji.bukaAntre(k), kSah);
      await p.waitForTimeout(300);
      await p.keyboard.press('s');
      await p.waitForSelector('.swal2-popup .sd-sah-daftar input');
      await p.check('.sd-sah-daftar input');
      await p.click('.swal2-confirm');
      await p.waitForSelector('#sdAntre .sd-cap-sah', { timeout: 8000 });
      cek('B30 S: cap ungu "Disahkan OSDA" dengan nama pembinaan', await p.evaluate(() => { const c = document.querySelector('#sdAntre .sd-cap-sah'); return /Disahkan/.test(c.textContent) && c.querySelectorAll('li').length === 1; }));
      // tuntaskan antrean → penutupan
      await p.keyboard.press('Escape'); await p.waitForTimeout(400);
      await p.evaluate(() => window.RQSidang._uji.bukaAntre());
      await p.waitForTimeout(300);
      for (let i = 0; i < 40; i++) {
        const st = await p.evaluate(() => ({ akhir: !!document.querySelector('#sdAntre .sd-akhir'), lewati: window.RQSidang._uji.hitungSesi().lewati }));
        if (st.akhir && !st.lewati) break;
        await tekan(p, 'Enter'); await p.waitForTimeout(60);
      }
      await p.waitForTimeout(200);
      cek('B31 penutupan: sapuan emas, angka berguling, "Sidang ditutup"', await p.evaluate(() => {
        const a = document.querySelector('#sdAntre'); return a.classList.contains('ev-tutup') && !!a.querySelector('.sd-akhir.tutup .kk-i')
          && /Barakallahu fikum/.test(a.querySelector('.sd-bicara').textContent) && /sidang ditutup/i.test(a.querySelector('.sd-akhir > b').textContent);
      }));
      cek('B32 tanpa galat halaman', !s.galat.length, s.galat);
      await s.ctx.close();
    }

    console.log(`\nB · ${v} · HP`);
    {
      const s = await masuk(browser, URL_[v], { peran: 'Osis', korps: 'Osis Putra', hp: true });
      const p = s.page;
      await bukaSidang(p);
      cek('B33 HP: bilah jempol di dasar layar (Majelis n/9 + Mulai)', await p.evaluate(() => {
        const j = document.getElementById('sdJempol'), r = j.getBoundingClientRect();
        return getComputedStyle(j).display === 'flex' && Math.abs(r.bottom - innerHeight) < 2 && /Majelis 0\/9/.test(j.textContent) && !!j.querySelector('[data-aksi="mulai-bilah"]');
      }));
      cek('B34 HP: Meja Majelis tampak di layar pertama sesudah panggung', await p.evaluate(() => document.querySelector('#sdMejaMj').getBoundingClientRect().top < innerHeight * 1.05));
      await p.click('#sdJempol [data-aksi="majelis"]');
      await p.waitForTimeout(300);
      cek('B35 HP: jempol membuka Susunan majelis', await p.evaluate(() => !!document.querySelector('.swal2-popup .sd-mj')));
      cek('B36 tanpa galat halaman', !s.galat.length, s.galat);
      await s.ctx.close();
    }
  }

  console.log('\nC · Kelalaian (build)');
  {
    const s = await masuk(browser, URL_.build, { peran: 'Admin', super: true, gerak: true, vp: { width: 1361, height: 656 } });
    const p = s.page;
    await p.evaluate(() => navigateTo('kelalaian'));
    await p.waitForSelector('.kl-tabel tbody tr', { timeout: 20000 });
    cek('C1 gerak sekali per kunjungan: kl-gerak aktif lalu dilepas', await p.evaluate(() => !!document.querySelector('.kl-gerak')));
    await p.waitForTimeout(2400);
    cek('C2 kl-gerak dilepas; angka tetap angka akhir', await p.evaluate(() => !document.querySelector('.kl-gerak') && /32/.test(document.querySelector('.kl-angka').textContent)));
    cek('C3 tabel selebar penuh: 9 kolom tanpa gulir mendatar', await p.evaluate(() => {
      const t = document.querySelector('.kl-tabel'), w = t.closest('.table-wrap') || t.parentElement;
      return t.querySelectorAll('thead th').length === 9 && w.scrollWidth <= w.clientWidth + 1;
    }));
    cek('C4 Per bulan sebelum tabel; gembok pada bulan terkunci', await p.evaluate(() => {
      const b = document.querySelector('.kl-bulan'), t = document.querySelector('.kl-tabel');
      return !!(b.compareDocumentPosition(t) & Node.DOCUMENT_POSITION_FOLLOWING) && !!b.querySelector('.kl-gembok');
    }));
    cek('C5 tanpa galat halaman', !s.galat.length, s.galat);
    await s.ctx.close();
  }

  await browser.close(); sSumber.close(); sBuild.close();
  console.log(`\n${lulus} lulus, ${gagal} gagal`);
  process.exit(gagal ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
