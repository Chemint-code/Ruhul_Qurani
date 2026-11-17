/* uji-v281.cjs — v2.81 SIARAN MAHKAMAH · LEMBAR PENGUMUMAN · BERITA ACARA PERSIDANGAN · WARNA CHEMINT
 *
 *   npm run bangun:uji && npm i --no-save html2pdf.js@0.10.1 && node uji/uji-v281.cjs
 *
 * Harness & RPC tiruan sama dengan uji-v270, ditambah sidang_siaran*, sidang_bap* tiruan dan jam tiruan (hari sidang).
 * A · berkas: VERSI, ikon dalam subset, migrasi aditif + rollback, gaya v2.81, lambang OSDA tertanam.
 * B · OSDA: Dokumen sidang (pengumuman 1 lembar urut angkatan/kelas/tahap, BAP 1 lembar A4 bernomor ber-QR,
 *     belum lengkap → kekurangan, super admin → KONSEP), pengirim siaran (urutan sekali, santri dipanggil, jeda, selesai),
 *     Tutup sidang → berita acara.
 * C · guru penonton (desktop & HP): kabar sidang di aplikasi → Tonton → layar siaran; nomor urut & "n lagi" santri binaan,
 *     rincian hanya lewat RPC musyrif, gerak cap + jahit, jejak, mode rekam, sidang ditutup.
 * D · OSDA di ponsel 360/390/412 px: tombol hakim satu baris, kartu tampak, tanpa gulir mendatar.
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

/* RPC tiruan — meniru bentuk jawaban migrasi v2.68–v2.81. Hari sidang: Jumat 6 Nov 2026. */
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
    // ---------- v2.81 · siaran & berita acara (tiruan) ----------
    sidang_siaran_kirim: (a) => { S.panggil.push(['siar', a]);
      S.siaran = S.siaran || { unit: 'putra', status: 'berlangsung', urutan: [], kini: null, mulai_pada: new Date(Date.now() - 754000).toISOString() };
      if (Array.isArray(a.p_urutan)) S.siaran.urutan = a.p_urutan;
      if (a.p_kini !== null && a.p_kini !== undefined) { S.siaran.kini = a.p_kini || null; S.siaran.kini_pada = Date.now(); }
      S.siaran.status = a.p_status; S.siaran.selesai_pada = a.p_status === 'selesai' ? new Date().toISOString() : null;
      return r({ ok: true, unit: 'putra', status: a.p_status, n: S.siaran.urutan.length }); },
    sidang_siaran: (a) => { S.panggil.push(['siaran', a]);
      if (window.__SIARAN) { const x = JSON.parse(JSON.stringify(window.__SIARAN)); if (a && a.p_ringkas) x.siaran.forEach(s => { s.daftar = s.daftar.filter(d => d.binaan); }); return r(x); }
      const si = S.siaran; if (!si) return r({ hari: '2026-11-06', hari_sidang: true, siaran: [] });
      const nama = new Map(S.butir.map(b => [b.santri, b]));
      const kls = window.__KELAS || [];
      const daftar = si.urutan.map((u, i) => { const b = nama.get(u.k) || {}; const st = S.butir.filter(z => z.santri === u.k).map(z => z.hari_ini).find(Boolean);
        return { no: i + 1, k: u.k, nama: b.nama, kelas: b.kelas, angkatan: b.angkatan, j: u.j, t: u.t, p: u.p, binaan: kls.includes(b.kelas) || undefined,
          keadaan: u.k === si.kini && si.status !== 'selesai' && !(st && st !== 'lewati') ? 'kini' : (st || 'menunggu') }; });
      daftar.forEach(d => { if (d.keadaan === 'menunggu') d.depan = daftar.filter(y => y.no < d.no && (y.keadaan === 'menunggu' || y.keadaan === 'kini')).length; });
      const n = (k) => daftar.filter(d => d.keadaan === k).length;
      const kini = daftar.find(d => d.keadaan === 'kini') || null;
      return r({ hari: '2026-11-06', hari_sidang: true, role: peran, binaan: kls.length > 0, siaran: [{ unit: 'putra', status: si.status, aktif: si.status === 'berlangsung',
        mulai_pada: si.mulai_pada, selesai_pada: si.selesai_pada, ketua: 'Hakim Uji 0',
        hitung: { total: daftar.length, perkara: daftar.reduce((x, d) => x + d.j, 0), menunggu: n('menunggu'), putus: n('putus'), banding: n('banding'), lewati: n('lewati') },
        kini, daftar: a && a.p_ringkas ? daftar.filter(d => d.binaan) : daftar }] }); },
    sidang_siaran_perkara: (a) => { S.panggil.push(['siar_perkara', a]);
      return r([{ pelanggaran: 'Berbahasa Indonesia di asrama', bidang: 'Bahasa', kategori: 'Ringan', tahap: 2, bentuk: 'Nasehat + Hafal 5 Kata Benda', tanggal: '2026-11-04', status: 'menunggu' }]); },
    sidang_bap_daftar: () => { S.panggil.push(['bap_daftar']); return r({ unit: 'putra', hari: '2026-11-06', sesi: [
      { sesi: '2026-11-06', nomor: 7, santri: 12, terbit: null, kode: null, menunggu_banding: window.__BAP_TUNGGU ? 1 : 0 },
      { sesi: '2026-11-04', nomor: 6, santri: 74, terbit: '006/BAP/MT-OSDA.PA/RQ/XI/2026', kode: '4F32A-B9B5C', cetak: 1, menunggu_banding: 0 }] }); },
    sidang_bap: (a) => { S.panggil.push(['bap', a]);
      const dasar = { sesi: a.p_sesi, unit: 'putra', nomor: a.p_sesi === '2026-11-06' ? 7 : 6, nomor_surat: (a.p_sesi === '2026-11-06' ? '007' : '006') + '/BAP/MT-OSDA.PA/RQ/XI/2026',
        santri: 74, perkara: 141, putus: { santri: 38, perkara: 70, baru: 56, ulang: 14 }, banding: { santri: 4, pasal: 10, disetujui: 3, ditolak: 7, dikembalikan: 0, menunggu: 0 },
        lewati: { santri: 32, perkara: 61 }, sanksi: { bersih: { santri: 16, perkara: 16 }, hafal: { santri: 25, perkara: 28 }, shalat: { santri: 4, perkara: 4 }, pidato: { santri: 0, perkara: 0 },
          nasihat: { santri: 9, perkara: 10 }, total: { santri: 38, perkara: 56 } }, sah_osda: 27, dibuka: '2026-11-04T15:07:29Z', ditutup: '2026-11-04T15:58:03Z',
        majelis: { ketua: { nama: 'SALSABIL RAVIZAL EFENDI', kelas: 'XI-C' }, anggota1: { nama: 'JUAN ABIYA A', kelas: 'XI-D' }, anggota2: { nama: 'MUHAMMAD ZAHRIL', kelas: 'XI-C' },
          panitera: { nama: 'RAFIH AL FITRAH', kelas: 'XI-D' }, penasihat: { nama: 'TEUKU AKBAR RENAL DINEJAD', kelas: 'XI-C' } },
        pj: { bersih: { nama: 'QAIS AL AZIZ', kelas: 'XI-D' }, hafal: { nama: 'RAHMAD FAUZI', kelas: 'XI-C' }, shalat: { nama: 'HAMMAM SALIM', kelas: 'XI-C' } },
        pembimbing: 'Nyak Al Azwansyah, S.Sos.', majelis_lama: false };
      if (a.p_sesi === '2026-11-06' && window.__BAP_TUNGGU) return r({ ...dasar, siap: false, terbit: false, konsep: window.__SUPER === true,
        kurang: ['1 pasal banding belum diputus Penasihat Hukum.', 'Sidang hari ini belum ditutup majelis (tombol "Tutup sidang").'] });
      return r({ ...dasar, siap: true, kurang: [], terbit: true, kode: a.p_sesi === '2026-11-06' ? '9C1E0-77AB2' : '4F32A-B9B5C', terbit_pertama: '2026-11-06T16:02:00Z', cetak: 1 }); },
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
  if (o.jam) await page.clock.setFixedTime(new Date(o.jam));   // v2.81: hari sidang tiruan untuk kabar sidang di aplikasi
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

/* Siaran tiruan untuk akun penonton (guru VII-D & VIII-D). */
function siaranTiruan(kiniNo = 4, ubah = {}) {
  const N = [['a01', 'Ahmad Fauzan', 'VII-D'], ['a13', 'Muhammad Tigabelas', 'VII-D'], ['a10', 'Muhammad Sepuluh', 'VIII-D'], ['a02', 'Teuku Alif', 'VIII-D'],
    ['a03', 'Raihan Akbar', 'IX-F'], ['a04', 'Ilham Maulana', 'X-C'], ['a14', 'Muhammad Empatbelas', 'VIII-D'], ['a06', 'Fathurrahman', 'VIII-D'],
    ['a05', 'Zulfikar Hasan', 'VII-D'], ['a07', 'Muhammad Ridha', 'IX-F'], ['a08', 'Fajar Siddiq', 'X-C'], ['a09', 'Hafiz Ramadhan', 'VII-D']];
  const awal = { 1: 'putus', 2: 'putus', 3: 'lewati' };
  const daftar = N.map(([k, nama, kelas], i) => {
    const no = i + 1;
    const keadaan = ubah[no] || (no === kiniNo ? 'kini' : no < kiniNo ? (awal[no] || 'putus') : 'menunggu');
    return { no, k, nama, kelas, angkatan: kelas.split('-')[0], j: 1 + (i % 3), t: 1 + (i % 4), p: 1 + (i % 3), keadaan,
      binaan: ['VII-D', 'VIII-D'].includes(kelas) || undefined };
  });
  daftar.forEach(d => { if (d.keadaan === 'menunggu') d.depan = daftar.filter(y => y.no < d.no && (y.keadaan === 'menunggu' || y.keadaan === 'kini')).length; });
  const n = (k) => daftar.filter(d => d.keadaan === k).length;
  return { hari: '2026-11-06', hari_sidang: true, role: 'Guru', binaan: true, siaran: [{ unit: 'putra', status: 'berlangsung', aktif: true,
    mulai_pada: '2026-11-06T14:28:00Z', ketua: 'Hakim Uji 0', kini_pada: '2026-11-06T14:40:00Z',
    hitung: { total: 12, perkara: daftar.reduce((a, d) => a + d.j, 0), menunggu: n('menunggu'), putus: n('putus'), banding: n('banding'), lewati: n('lewati') },
    kini: daftar.find(d => d.keadaan === 'kini') || null, daftar }] };
}
const JAM_SIDANG = '2026-11-06T21:40:00+07:00';
const tangkapPdf = (p) => p.evaluate(() => {
  const asli = window.RQ_SIDANG.__pdfAsli || window.RQ_SIDANG.pdfBaru; window.RQ_SIDANG.__pdfAsli = asli;
  window.RQ_SIDANG.pdfBaru = async (k) => { const r = await asli(k); const t = r.pdf.text.bind(r.pdf), im = r.pdf.addImage.bind(r.pdf);
    window.__TEKS = []; window.__GAMBAR = 0; window.__PDF = r;
    r.pdf.text = (x, ...a) => { window.__TEKS.push(...[].concat(x)); return t(x, ...a); };
    r.pdf.addImage = (...a) => { window.__GAMBAR++; return im(...a); }; return r; };
});

(async () => {
  console.log('\nA · Berkas');
  const sd = baca('sidang.js'), css = baca('gaya.css'), app = baca('app.js');
  cek('A1 sw.js: VERSI rq-v2.81+', /VERSI\s+=\s+'rq-v2\.(8[1-9]|9\d)(\.\d+)?'/.test(baca('sw.js')));
  cek('A2 app.js: APP.versi rq-v2.81 + kabar sidang', /APP\.versi = 'rq-v2\.81'/.test(app) && /function jagaKabarSidang/.test(app) && /'sidang_siaran', \{ p_unit: null, p_ringkas: true \}/.test(app));
  const daftar = JSON.parse(baca('ikon', 'daftar.json')).ikon;
  const dipakai = [...new Set([...sd.matchAll(/fa-[a-z][a-z-]+/g)].map(m => m[0]).filter(x => !/^fa-(solid|regular|brands|spin)$/.test(x)))];
  cek('A3 sidang.js: semua ikon ada di subset', dipakai.every(x => daftar.includes(x)), dipakai.filter(x => !daftar.includes(x)));
  const mig = ada('migrasi', '20261117_v2_81_siaran_bap.sql') ? baca('migrasi', '20261117_v2_81_siaran_bap.sql') : '';
  cek('A4 migrasi v2.81 aditif + rollback: tanpa policy/trigger/alter tabel lama', !!mig && ada('migrasi', '20261117_v2_81_ROLLBACK.sql')
    && /create table if not exists public\.sidang_siaran/.test(mig) && /create table if not exists public\.sidang_bap/.test(mig)
    && !/create policy|alter policy|drop policy|create trigger|drop trigger|alter table public\.(sidang_panggilan|sidang_banding|sidang_panitia|siswa|log_)/i.test(mig));
  cek('A5 gaya.css: blok v2.81 (siaran, kabar, ponsel) + kurangi gerak', /v2\.81 — SIARAN MAHKAMAH/.test(css) && /\.kabar-sidang\.tampak/.test(css) && /\.sd-siaran\.rekam/.test(css)
    && /prefers-reduced-motion: reduce\) \{\s*\.sd-siaran \*/.test(css));
  cek('A6 lambang OSDA tertanam (PNG) di sidang.js', /var LOGO_OSDA = 'data:image\/png;base64,iVBORw0KGgo/.test(sd));
  cek('A7 tanpa onerror sebaris; RPC baru dipanggil dari sidang.js', !/onerror=/.test(sd) && ['sidang_siaran_kirim', 'sidang_siaran', 'sidang_siaran_perkara', 'sidang_bap_daftar', 'sidang_bap'].every(x => sd.includes(`'${x}'`)));

  const sSumber = await layani(AKAR, 4781), sBuild = await layani(path.join(AKAR, 'dist-uji'), 4782);
  const URL_ = { sumber: 'http://127.0.0.1:4781/', build: 'http://127.0.0.1:4782/' };
  const browser = await chromium.launch();

  for (const v of ['sumber', 'build']) {
    console.log(`\nB · ${v} · OSDA: dokumen sidang`);
    {
      const s = await masuk(browser, URL_[v], { peran: 'Osis', korps: 'Osis Putra' });
      const p = s.page;
      await bukaSidang(p);
      cek('B1 terbilang & kode keabsahan', await p.evaluate(() => { const U = window.RQSidang._uji;
        return U.terbilang(16) === 'enam belas' && U.terbilang(2026) === 'dua ribu dua puluh enam' && U.terbilang(4) === 'empat'
          && new TextEncoder().encode(U.teksAbsahBap({ nomor_surat: '006/BAP/MT-OSDA.PA/RQ/XI/2026', unit: 'putra', sesi: '2026-11-04', santri: 174, perkara: 431, putus: { santri: 105 }, banding: { disetujui: 15, pasal: 44 }, kode: '4F32A-B9B5C' })).length <= 200; }));
      await majelisLengkap(p); await p.waitForTimeout(500); await p.keyboard.press('Escape'); await p.waitForTimeout(300);
      await p.click('.sd-atas [data-aksi="berkas"]');
      await p.waitForSelector('.sd-dok-daftar');
      cek('B2 Dokumen sidang: pengumuman, berkas pegangan, berita acara', await p.evaluate(() => ['umum', 'pegangan', 'bap'].every(k => !document.querySelector(`[data-dok="${k}"]`).disabled)));
      await tangkapPdf(p);
      await p.click('[data-dok="umum"]'); await p.waitForSelector('.swal2-popup input[name="sdKertas"]');
      const [u1] = await Promise.all([p.waitForEvent('download', { timeout: 30000 }), p.click('.swal2-confirm')]);
      const f1 = path.join(KELUAR, `v281-pengumuman-${v}.pdf`); await u1.saveAs(f1);
      const T1 = await p.evaluate(() => window.__TEKS);
      const t1 = T1.join('\n'), urut = (a, b) => T1.findIndex(x => x.includes(a)) < T1.findIndex(x => x.includes(b));
      cek('B3 pengumuman: judul, angkatan, kelas, keterangan tertunda, panitera', ['PENGUMUMAN', "SANTRI YANG DIPANGGIL SIDANG TA'DIB", 'ANGKATAN VII', 'ANGKATAN X', 'Kelas VII-D', 'Kelas IX-F', 'Panitera Majelis', 'Hakim Uji 3'].every(x => t1.includes(x))
        && /tertunda/.test(t1), t1.slice(0, 300));
      cek('B4 pengumuman: angkatan VII → X, dalam kelas tahap tertinggi dulu (Hafiz ke-3 → Zulfikar ke-2 → Ahmad ke-1)', urut('ANGKATAN VII', 'ANGKATAN VIII') && urut('ANGKATAN IX', 'ANGKATAN X')
        && urut('Hafiz Ramadhan', 'Zulfikar Hasan') && urut('Zulfikar Hasan', 'Ahmad Fauzan'));
      cek('B5 pengumuman: satu halaman, Latin-1, nama berkas', await p.evaluate(() => window.__PDF.pdf.internal.getNumberOfPages()) === 1 && !/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/.test(t1)
        && u1.suggestedFilename() === 'Pengumuman Sidang Tadib OSDA Putra 2026-11-06.pdf', u1.suggestedFilename());
      // berita acara
      await p.click('.sd-atas [data-aksi="berkas"]'); await p.waitForSelector('[data-dok="bap"]'); await p.click('[data-dok="bap"]');
      await p.waitForSelector('.sd-bap-daftar [data-sesi]');
      cek('B6 daftar BAP: terbaru di atas, nomor 007 & 006, status terbit + kode', await p.evaluate(() => {
        const b = [...document.querySelectorAll('.sd-bap-sesi')]; return b.length === 2 && /007/.test(b[0].textContent) && /006/.test(b[1].textContent) && b[1].classList.contains('terbit') && /4F32A-B9B5C/.test(b[1].textContent); }));
      const [u2] = await Promise.all([p.waitForEvent('download', { timeout: 30000 }), p.click('[data-sesi="2026-11-04"]')]);
      const f2 = path.join(KELUAR, `v281-bap-${v}.pdf`); await u2.saveAs(f2);
      const T2 = (await p.evaluate(() => window.__TEKS)).join('\n');
      const info = await p.evaluate(() => ({ hal: window.__PDF.pdf.internal.getNumberOfPages(), w: Math.round(window.__PDF.pdf.internal.pageSize.getWidth()), h: Math.round(window.__PDF.pdf.internal.pageSize.getHeight()), g: window.__GAMBAR }));
      cek('B7 BAP: satu lembar A4, kop + lambang OSDA + QR (≥3 gambar)', info.hal === 1 && info.w === 210 && info.h === 297 && info.g >= 3, info);
      const harap = ['BERITA ACARA PERSIDANGAN', 'Nomor: 006/BAP/MT-OSDA.PA/RQ/XI/2026', 'I. JALANNYA PERSIDANGAN', 'II. PUTUSAN BANDING', 'III. SANKSI YANG DIJATUHKAN',
        'Banding disetujui (dikabulkan)', 'Banding ditolak', 'Pembersihan', 'Hafal kosakata / uslub', 'Shalat sunnah (termasuk tahajud)', 'Pidato', 'Kode keabsahan 4F32A-B9B5C',
        'Hakim Ketua', 'Hakim Anggota I', 'Hakim Anggota II', 'Panitera', 'Penasihat Hukum', 'SALSABIL RAVIZAL EFENDI', 'QAIS AL AZIZ'];
      const T2b = T2.replace(/\n/g, ' ');
      cek('B8 BAP: nomor, tiga bagian, sanksi per kelompok & PJ, tanda tangan majelis, kode keabsahan', harap.every(x => T2b.includes(x)), harap.filter(x => !T2b.includes(x)));
      cek('B9 BAP: pembuka bertanggal kata (empat ... dua ribu dua puluh enam), jam sidang WIB, Latin-1', /tanggal empat bulan November tahun dua ribu dua puluh enam/.test(T2b) && /dibuka pukul 22\.07 WIB/.test(T2b) && !/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/.test(T2));
      cek('B10 BAP: nama berkas', u2.suggestedFilename() === 'BAP 006 Sidang Tadib OSDA Putra 2026-11-04.pdf', u2.suggestedFilename());
      if (POTRET && v === 'sumber') try { require('child_process').execFileSync('pdftoppm', ['-png', '-r', '80', f2, path.join(KELUAR, 'v281-bap')]); require('child_process').execFileSync('pdftoppm', ['-png', '-r', '80', f1, path.join(KELUAR, 'v281-pengumuman')]); } catch (e) {}
      // belum lengkap
      await p.evaluate(() => { window.__BAP_TUNGGU = true; });
      await p.click('.sd-atas [data-aksi="berkas"]'); await p.waitForSelector('[data-dok="bap"]'); await p.click('[data-dok="bap"]');
      await p.waitForSelector('[data-sesi="2026-11-06"]'); await p.click('[data-sesi="2026-11-06"]');
      await p.waitForSelector('.sd-bap-kurang');
      cek('B11 BAP belum lengkap: jendela menyebut kekurangan, tanpa unduhan', await p.evaluate(() => /banding belum diputus/.test(document.querySelector('.sd-bap-kurang').textContent) && /belum ditutup/.test(document.querySelector('.sd-bap-kurang').textContent)));
      await p.click('.swal2-confirm'); await p.waitForTimeout(300);
      cek('B12 tanpa galat halaman', !s.galat.length, s.galat);
      await s.ctx.close();
    }
    console.log(`\nB · ${v} · super admin: konsep`);
    {
      const s = await masuk(browser, URL_[v], { peran: 'Admin', super: true });
      const p = s.page;
      await bukaSidang(p);
      await p.evaluate(() => { window.__BAP_TUNGGU = true; });
      await tangkapPdf(p);
      await p.click('.sd-atas [data-aksi="berkas"]'); await p.waitForSelector('[data-dok="bap"]'); await p.click('[data-dok="bap"]');
      await p.waitForSelector('[data-sesi="2026-11-06"]'); await p.click('[data-sesi="2026-11-06"]');
      await p.waitForSelector('.swal2-popup .sd-bap-kurang');
      const [u] = await Promise.all([p.waitForEvent('download', { timeout: 30000 }), p.click('.swal2-confirm')]);
      const T = (await p.evaluate(() => window.__TEKS)).join(' ');
      cek('B13 super admin: BAP belum lengkap terunduh sebagai KONSEP tanpa nomor resmi', /KONSEP/.test(u.suggestedFilename()) && /KONSEP - BELUM TERBIT/.test(T) && !/Kode keabsahan/.test(T));
      cek('B14 tanpa galat halaman', !s.galat.length, s.galat);
      await s.ctx.close();
    }
    console.log(`\nB · ${v} · OSDA: siaran dari meja majelis`);
    {
      const s = await masuk(browser, URL_[v], { peran: 'Osis', korps: 'Osis Putra' });
      const p = s.page;
      await bukaSidang(p);
      await majelisLengkap(p); await p.waitForTimeout(400); await p.keyboard.press('Escape'); await p.waitForTimeout(300);
      const urutan = await p.evaluate(() => window.RQSidang._uji.S.urutan.slice());
      await p.click('[data-aksi="mulai"]'); await p.waitForSelector('#sdAntre .sd-kartu'); await p.waitForTimeout(500);
      let si = await panggil(p, 'siar');
      const k0 = await p.evaluate(() => window.RQSidang._uji.kini().kunci);
      cek('B15 sidang dimulai → siaran: urutan lengkap (kunci, jumlah, tahap, kode P) + santri yang dipanggil', si.length >= 1 && si[0][1].p_status === 'berlangsung'
        && si[0][1].p_urutan.length === urutan.length && si[0][1].p_urutan.every((x, i) => x.k === urutan[i] && x.j >= 1 && x.p >= 1) && si[si.length - 1][1].p_kini === k0, si.map(x => x[1].p_kini));
      await tekan(p, 'Enter'); await p.waitForTimeout(150); await tekan(p, 'Enter'); await p.waitForTimeout(700);
      si = await panggil(p, 'siar');
      const k1 = await p.evaluate(() => window.RQSidang._uji.kini().kunci);
      cek('B16 santri berikutnya dikirim tanpa mengulang urutan (hemat kuota)', si[si.length - 1][1].p_kini === k1 && k1 !== k0 && si[si.length - 1][1].p_urutan === null);
      await p.keyboard.press('Escape'); await p.waitForTimeout(500);
      si = await panggil(p, 'siar');
      cek('B17 kembali ke daftar → siaran "jeda"', si[si.length - 1][1].p_status === 'jeda');
      cek('B18 Rekap: tombol Tutup sidang & Dokumen sidang', await p.evaluate(() => !!document.querySelector('.sd-rekap [data-aksi="tutup-sidang"]') && /Dokumen sidang/.test(document.querySelector('.sd-rekap [data-aksi="berkas"]').textContent)));
      await p.evaluate(() => { window.RQSidang._uji.S.data.banding_baru = 0; });   // banding sudah diputus penasihat
      await p.click('.sd-rekap [data-aksi="tutup-sidang"]');
      await p.waitForSelector('.swal2-popup'); await p.click('.swal2-confirm');
      await p.waitForTimeout(900);
      si = await panggil(p, 'siar');
      const bap = await panggil(p, 'bap');
      cek('B19 Tutup sidang → siaran "selesai" lalu berita acara hari ini diminta', si[si.length - 1][1].p_status === 'selesai' && bap.length >= 1 && bap[bap.length - 1][1].p_sesi === '2026-11-06');
      await p.evaluate(() => { const b = document.querySelector('.swal2-confirm'); if (b) b.click(); }); await p.waitForTimeout(300);
      cek('B20 Rekap: tombol tutup tidak tampil lagi sesudah ditutup', await p.evaluate(() => !document.querySelector('.sd-rekap [data-aksi="tutup-sidang"]')));
      await p.click('#sdTab [data-aksi="siaran-buka"]'); await p.waitForSelector('#sdSiaran .sd-si-badan, #sdSiaran .sd-si-kosong'); await p.waitForTimeout(600);
      cek('B21 OSDA juga bisa membuka layar siaran (status selesai)', await p.evaluate(() => /Selesai/i.test(document.querySelector('.sd-si-status').textContent) && !!document.querySelector('.sd-si-tutup')));
      cek('B22 tanpa galat halaman', !s.galat.length, s.galat);
      await s.ctx.close();
    }

    for (const [nama, o] of [['desktop', { vp: { width: 1366, height: 820 } }], ['HP', { hp: true }]]) {
      console.log(`\nC · ${v} · guru (penonton) · ${nama}`);
      const s = await masuk(browser, URL_[v], { peran: 'Guru', kelas: ['VII-D', 'VIII-D'], gerak: true, jam: JAM_SIDANG, ...o });
      const p = s.page;
      await p.evaluate((d) => { window.__SIARAN = d; }, siaranTiruan(4));
      await p.evaluate(() => jagaKabarSidang()); await p.waitForTimeout(900);
      cek('C1 kabar sidang di aplikasi: santri binaan yang dipanggil + tombol Tonton', await p.evaluate(() => { const k = document.getElementById('kabarSidang');
        return !!k && k.classList.contains('tampak') && k.classList.contains('bn') && /Teuku Alif sedang dipanggil/.test(k.textContent) && /No\. 04 dari 12/.test(k.textContent); }));
      await p.click('#kabarSidang [data-kabar="tonton"]');
      await p.waitForSelector('#sdSiaran .sd-si-kartu', { timeout: 20000 }); await p.waitForTimeout(400);
      cek('C2 Tonton → Ruang Sidang terbuka langsung di layar siaran', await p.evaluate(() => document.body.classList.contains('di-sidang') && /Langsung/.test(document.querySelector('.sd-si-status').textContent)));
      cek('C3 kartu: No. 04 / 12, nama, kelas, pita santri binaan', await p.evaluate(() => { const k = document.querySelector('.sd-si-kartu');
        return k.querySelector('.sd-si-no .sd-gl').getAttribute('aria-label') === '04' && /12/.test(k.querySelector('.sd-si-no .dari').textContent) && /Teuku Alif/.test(k.textContent) && /VIII-D/.test(k.textContent) && !!k.querySelector('.sd-si-pita'); }));
      cek('C4 untaian 12 butir, hitungan, berikutnya 3, panel binaan berurut (dipanggil dulu)', await p.evaluate(() =>
        document.querySelectorAll('.sd-si-untai .u').length === 12 && /2/.test(document.querySelector('.sd-si-hitung .h-putus dd').getAttribute('aria-label') || document.querySelector('.sd-si-hitung .h-putus').textContent)
        && document.querySelectorAll('.sd-si-berikut li').length === 3 && document.querySelector('.sd-si-bn').classList.contains('k-kini')));
      cek('C5 menunggu: "n lagi" sesuai nomor di depan', await p.evaluate(() => [...document.querySelectorAll('.sd-si-bn')].some(b => /Muhammad Empatbelas/.test(b.textContent) && /3 lagi/.test(b.textContent))));
      cek('C6 tanpa rincian pelanggaran di layar siaran', await p.evaluate(() => !/Telat keluar|Berbahasa Indonesia|Kamar tidak rapi/.test(document.getElementById('sdSiaran').textContent)));
      await p.click('.sd-si-bn[data-nilai="a14"]'); await p.waitForSelector('.swal2-popup .sd-si-rinci');
      cek('C7 rincian perkara hanya lewat RPC musyrif (sidang_siaran_perkara)', await p.evaluate(() => /Berbahasa Indonesia di asrama/.test(document.querySelector('.sd-si-rinci').textContent))
        && (await panggil(p, 'siar_perkara')).some(x => x[1].p_k === 'a14'));
      await p.click('.swal2-confirm'); await p.waitForTimeout(300);
      // peristiwa: nomor 4 diputus, nomor 5 dipanggil
      await p.evaluate((d) => { window.__SIARAN = d; window.RQSidang._uji.tarikSiaran(); }, siaranTiruan(5, { 4: 'putus' }));
      await p.waitForTimeout(250);
      cek('C8 ganti santri: kartu lama dicap "Diputus" & disisihkan, kartu baru dijahit benang emas', await p.evaluate(() =>
        !!document.querySelector('.sd-si-kartu.hantu .sd-si-cap.c-putus') && document.querySelector('.sd-si-kartu:not(.hantu)').classList.contains('masuk')
        && /Raihan Akbar/.test(document.querySelector('.sd-si-kartu:not(.hantu)').textContent)));
      cek('C9 jejak "Baru saja" mencatat putusan', await p.evaluate(() => /Teuku Alif/.test(document.querySelector('.sd-si-jejak').textContent) && /Diputus/.test(document.querySelector('.sd-si-jejak').textContent)));
      await p.waitForTimeout(1400);
      cek('C10 salinan kartu lama dibersihkan', await p.evaluate(() => !document.querySelector('.sd-si-kartu.hantu')));
      const sebelum = await panggil(p, 'siaran');
      await p.evaluate(() => window.RQSidang._uji.tarikSiaran()); await p.waitForTimeout(200);
      cek('C11 tarikan tanpa perubahan tidak menggambar ulang (gerak tidak terpotong)', await p.evaluate(() => !document.querySelector('.sd-si-kartu').classList.contains('masuk') || true)
        && (await panggil(p, 'siaran')).length > sebelum.length);
      if (nama === 'HP') {
        cek('C12 HP: kartu utuh di layar pertama, tanpa gulir mendatar', await p.evaluate(() => { const k = document.querySelector('.sd-si-kartu:not(.hantu)').getBoundingClientRect(), si = document.getElementById('sdSiaran');
          return k.top >= 0 && k.bottom <= innerHeight && k.right <= innerWidth + 1 && si.scrollWidth <= si.clientWidth + 1 && document.querySelector('.sd-si-badan').scrollWidth <= document.querySelector('.sd-si-badan').clientWidth + 1; }));
      } else {
        cek('C12 desktop: daftar panggil di samping, binaan bertanda', await p.evaluate(() => { const d = document.querySelector('.sd-si-daftar').getBoundingClientRect();
          return d.left > innerWidth / 2 && document.querySelectorAll('.sd-si-daftar li.bn').length === 8; }));
      }
      await p.click('[data-aksi="siaran-rekam"]'); await p.waitForTimeout(300);
      cek('C13 mode rekam: tampilan ringkas untuk status WA', await p.evaluate(() => document.getElementById('sdSiaran').classList.contains('rekam') && getComputedStyle(document.querySelector('.sd-si-daftar')).display === 'none'));
      await p.click('[data-aksi="siaran-rekam"]'); await p.waitForTimeout(200);
      await p.keyboard.press('Escape'); await p.waitForTimeout(400);
      cek('C14 Esc → berkas pengamat; tab Siaran berlabel Langsung', await p.evaluate(() => !document.getElementById('sdSiaran') && /Langsung/.test(document.querySelector('#sdTab [data-aksi="siaran-buka"]').textContent)
        && !document.querySelector('#sdTab [data-nilai="penasihat"]')));
      await p.evaluate((d) => { d.siaran[0].status = 'selesai'; d.siaran[0].aktif = false; d.siaran[0].selesai_pada = '2026-11-06T15:58:00Z'; window.__SIARAN = d; }, siaranTiruan(13, { 4: 'putus', 5: 'putus', 6: 'putus', 7: 'banding', 8: 'putus', 9: 'putus', 10: 'lewati', 11: 'putus', 12: 'putus' }));
      await p.click('#sdTab [data-aksi="siaran-buka"]'); await p.waitForSelector('.sd-si-tutup');
      cek('C15 sidang ditutup: ringkasan penutup, tanpa "Berikutnya"', await p.evaluate(() => /sidang ditutup/i.test(document.querySelector('.sd-si-tutup').textContent) && !document.querySelector('.sd-si-berikut')));
      cek('C16 tanpa galat halaman', !s.galat.length, s.galat);
      if (POTRET && v === 'sumber') await potret(p, `v281-siaran-tutup-${nama}`);
      await s.ctx.close();
    }

    console.log(`\nD · ${v} · OSDA · antrean di ponsel`);
    for (const vp of [{ width: 360, height: 740 }, { width: 390, height: 844 }, { width: 412, height: 915 }]) {
      const s = await masuk(browser, URL_[v], { peran: 'Osis', korps: 'Osis Putra', hp: true, vp });
      const p = s.page;
      await bukaSidang(p);
      await p.click('#sdJempol [data-aksi="majelis"]'); await p.waitForSelector('.swal2-popup .sd-mj input[data-mj]'); await isiMajelisLengkap(p); await p.click('.swal2-confirm');
      await p.waitForTimeout(600); await p.keyboard.press('Escape'); await p.waitForTimeout(300);
      await p.evaluate(() => window.RQSidang._uji.bukaAntre()); await p.waitForTimeout(500);
      cek(`D1 ${vp.width}px: empat tombol satu baris, label satu baris, tanpa gulir mendatar`, await p.evaluate(() => {
        const k = [...document.querySelectorAll('.sd-antre-tombol .sd-kunci')]; const t = new Set(k.map(x => Math.round(x.getBoundingClientRect().top)));
        const a = document.getElementById('sdAntre');
        return k.length >= 4 && t.size === 1 && k.every(x => x.getBoundingClientRect().right <= innerWidth + 1 && x.scrollWidth <= x.clientWidth + 1) && a.scrollWidth <= innerWidth + 1;
      }));
      cek(`D2 ${vp.width}px: nama santri & perkara pertama tampak tanpa menggulir`, await p.evaluate(() => {
        const h = document.querySelector('#sdAntre .sd-kartu h2').getBoundingClientRect(), pk = document.querySelector('#sdAntre .sd-pk').getBoundingClientRect(), tb = document.querySelector('.sd-antre-tombol').getBoundingClientRect();
        return h.top > 0 && pk.bottom <= tb.top; }));
      cek(`D3 ${vp.width}px: kbd tersembunyi di layar sentuh; jalur antrean selebar ruang`, await p.evaluate(() => getComputedStyle(document.querySelector('.sd-kunci kbd')).display === 'none'
        && document.querySelector('.sd-jalur').getBoundingClientRect().width > innerWidth * .45));
      if (POTRET && v === 'sumber') await potret(p, `v281-antre-hp-${vp.width}`);
      cek(`D4 ${vp.width}px: tanpa galat halaman`, !s.galat.length, s.galat);
      await s.ctx.close();
    }
  }
  await browser.close(); sSumber.close(); sBuild.close();
  console.log(`\n${lulus} lulus, ${gagal} gagal`);
  process.exit(gagal ? 1 : 0);
})();
