/* uji-v283.cjs — v2.83 "SATU BAHASA" · komponen kb-, Mode Mentor, Sarpras Kamar, gerak global, pemangkasan teks
 *
 *   npm i --no-save playwright@1.63.0 html2pdf.js@0.10.1   (sekali)
 *   node uji/uji-v283.cjs          (RQ_BAGIAN=A,B untuk sebagian; RQ_POTRET=1 → potret ke uji/keluaran/)
 *
 * Berkas SUMBER dilayani apa adanya (tanpa build); harness & tiruan dari uji-v280.
 * A · RQKb murni + token gerak   B · Mode Mentor   C · Sarpras Kamar   D · gerak global   E · teks penjelasan
 */
const fs = require('fs'), path = require('path'), http = require('http'), { execFileSync } = require('child_process');
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

/* Tiruan: tabel tambahan disuntik, dan .or() dibuat paham is.null / gte / lte (dipakai sarpras.js). */
let MOCK74 = MOCK.replace('wa_kontak: [], wa_log: [], audit_log: []', 'wa_kontak: [], wa_log: [], audit_log: [], ...(window.__TABEL || {})');
const a = MOCK74.indexOf('or(s){'), z = MOCK74.indexOf('return b; },', a) + 'return b; },'.length;
if (MOCK74 === MOCK || a < 0) throw new Error('mock.cjs berubah: titik suntik tidak ditemukan');
MOCK74 = MOCK74.slice(0, a) + `or(s){ const parts=s.split(',').map(p=>{ const i=p.indexOf('.'), j=p.indexOf('.', i+1); const c=p.slice(0,i), op=p.slice(i+1,j), v=p.slice(j+1);
  if(op==='is' && v==='null') return r=>(r[c]??null)===null; if(op==='gte') return r=>r[c]!=null && String(r[c])>=v; if(op==='lte') return r=>r[c]!=null && String(r[c])<=v;
  const t=v.replace(/[*%]/g,'').toLowerCase(); return r=>String(r[c]??'').toLowerCase().includes(t); }); f.push(r=>parts.some(fn=>fn(r))); return b; },` + MOCK74.slice(z);

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
  const hari = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' }); };
  const ts = (n) => hari(n) + 'T03:00:00+00:00';
  window.__HARI = hari;
  const zona = (kode, nama, akses, tingkat, urutan, ikon) => ({ kode, nama, ikon, frekuensi_hari: akses === 'binaan' ? 30 : 7, berpenghuni: akses === 'binaan', label_tingkat: tingkat, urutan, aktif: true, bawaan: true, akses });
  window.__TABEL = {
    sarpras_setelan: [
      set('aktif', window.__AKTIF !== false), set('lembaga', { nama: 'Lembaga Uji', alamat: 'Jl. Uji No. 1', kota: 'Kota Uji' }), set('penerima', { nama: 'Bagian Sarana' }),
      set('penandatangan', [{ jabatan: 'Ketua Rayon Uji', nama: 'Ust. Penanda Tangan, S.Pd.' }, { jabatan: 'Direktur Uji', nama: 'Ust. Mengetahui' }]), set('pengelola', []),
      set('istilah', { kamar: 'Kamar', asrama: 'Asrama', musyrif: 'Musyrif', sayap: 'Sayap', bilik: 'Bilik', titik: 'Titik', butir: 'Barang', unit: 'Unit', gedung: 'Gedung', lantai: 'Lantai', penghuni: 'Santri', lembaga: 'Lembaga' }),
      set('penyebab', [{ kode: 'wajar', label: 'Pemakaian wajar/usang' }, { kode: 'lalai', label: 'Kelalaian' }, { kode: 'rusak', label: 'Perusakan' }, { kode: 'tidak_tahu', label: 'Tidak diketahui' }]),
      set('kelompok_pelanggaran', [{ kode: 'perusakan', nama: 'Perusakan fasilitas', ikon: 'fa-triangle-exclamation', pelanggaran: ['K01'] }, { kode: 'cctv', nama: 'CCTV', ikon: 'fa-eye', pelanggaran: ['K05'] },
        { kode: 'piket', nama: 'Piket kamar', ikon: 'fa-bed', pelanggaran: ['K02'] }, { kode: 'koridor', nama: 'Piket koridor', ikon: 'fa-stairs', pelanggaran: ['K03'] },
        { kode: 'kebersihan', nama: 'Kebersihan kamar', ikon: 'fa-leaf', pelanggaran: ['K04', 'K06'] }]),
      set('peran_kamar', [{ kode: 'mudabbir', label: 'Mudabbir', keluar_statistik: true }]),
      set('laporan', { awal_pekan: 1, semester: [{ nama: 'Ganjil', mulai: '07-01', sampai: '12-31' }, { nama: 'Genap', mulai: '01-01', sampai: '06-30' }] }),
      set('peran_tanpa_tugas', ['Osis', 'Klinik', 'Pimpinan', 'Walas']),
      set('peta', { ambang_perusakan: 2, kelompok_perusakan: 'perusakan', penyebab_waspada: ['lalai', 'rusak'] })
    ],
    sarpras_unit: [{ id: 'u1', nama: 'Asrama Uji', kunci_siswa: 'putra', urutan: 1, aktif: true }],
    sarpras_zona: [zona('kamar', 'Kamar', 'binaan', ['Kamar'], 1, 'fa-bed'), zona('asrama_umum', 'Asrama Umum', 'penunjukan', ['Titik'], 2, 'fa-stairs'),
                   zona('kamar_mandi', 'Kamar Mandi', 'semua_musyrif', ['Sayap', 'Bilik'], 3, 'fa-layer-group'), zona('kamar_musyrif', 'Kamar Musyrif', 'penunjukan', ['Kamar'], 4, 'fa-user-tie')],
    sarpras_lokasi: [
      { id: 'l1', unit_id: 'u1', induk_id: null, zona: 'kamar', nama: 'Kamar 1', nomor: 1, gedung: null, lantai: '1', kapasitas: 16, titik_periksa: true, urutan: 0, aktif: true, pelapor: [] },
      { id: 'l2', unit_id: 'u1', induk_id: null, zona: 'kamar', nama: 'Kamar 2', nomor: 2, gedung: null, lantai: null, kapasitas: 16, titik_periksa: true, urutan: 0, aktif: true, pelapor: [] },
      { id: 'l3', unit_id: 'u1', induk_id: null, zona: 'kamar', nama: 'Kamar 3', nomor: 3, gedung: null, lantai: '2', kapasitas: 24, titik_periksa: true, urutan: 0, aktif: true, pelapor: [] },
      { id: 'l4', unit_id: 'u1', induk_id: null, zona: 'kamar', nama: 'Kamar 4', nomor: 4, gedung: null, lantai: '1', kapasitas: 16, titik_periksa: true, urutan: 0, aktif: true, pelapor: [] },
      { id: 'l5', unit_id: 'u1', induk_id: null, zona: 'kamar', nama: 'Kamar 5', nomor: 5, gedung: null, lantai: '1', kapasitas: null, titik_periksa: true, urutan: 0, aktif: true, pelapor: [] },
      { id: 'l6', unit_id: 'u1', induk_id: null, zona: 'kamar', nama: 'Kamar 6', nomor: 6, gedung: null, lantai: '2', kapasitas: 16, titik_periksa: true, urutan: 0, aktif: true, pelapor: [] },
      { id: 'l7', unit_id: 'u1', induk_id: null, zona: 'kamar', nama: 'Kamar 7', nomor: 7, gedung: null, lantai: '2', kapasitas: 16, titik_periksa: true, urutan: 0, aktif: true, pelapor: [] },
      { id: 's1', unit_id: 'u1', induk_id: null, zona: 'kamar_mandi', nama: 'Sayap Uji', nomor: null, gedung: null, lantai: '1', kapasitas: null, titik_periksa: true, urutan: 0, aktif: true, pelapor: [] },
      { id: 'b1', unit_id: 'u1', induk_id: 's1', zona: 'kamar_mandi', nama: 'Bilik Satu', nomor: null, gedung: null, lantai: null, kapasitas: null, titik_periksa: false, urutan: 0, aktif: true, pelapor: [] },
      { id: 'a1', unit_id: 'u1', induk_id: null, zona: 'asrama_umum', nama: 'Koridor Uji', nomor: null, gedung: null, lantai: '1', kapasitas: null, titik_periksa: true, urutan: 0, aktif: true, pelapor: ['11111111-1111-1111-1111-111111111111'] }],
    sarpras_butir: [
      { id: 'bt-ranjang', nama: 'Ranjang besi', kategori: 'Perabot', satuan: 'unit', zona: ['kamar'], ditanggung: true, urutan: 10, aktif: true, per_anak: true, jumlah_tetap: null, masalah_umum: ['Rangka patah', 'Goyang'], ikon: 'ranjang' },
      { id: 'bt-lemari', nama: 'Lemari', kategori: 'Perabot', satuan: 'unit', zona: ['kamar'], ditanggung: true, urutan: 20, aktif: true, per_anak: true, jumlah_tetap: null, masalah_umum: ['Pintu rusak', 'Engsel lepas'], ikon: 'lemari' },
      { id: 'bt-ac', nama: 'AC', kategori: 'Elektronik', satuan: 'unit', zona: ['kamar'], ditanggung: true, urutan: 40, aktif: true, per_anak: false, jumlah_tetap: 2, masalah_umum: ['Tidak dingin', 'Bocor air', 'Mati total'], ikon: 'ac' },
      { id: 'bt-wc', nama: 'WC / Toilet', kategori: 'Plumbing', satuan: 'unit', zona: ['kamar_mandi'], ditanggung: true, urutan: 140, aktif: true, per_anak: false, jumlah_tetap: null, masalah_umum: ['Mampet', 'Bocor'], ikon: 'wc' },
      { id: 'bt-meja', nama: 'Meja', kategori: 'Perabot', satuan: 'unit', zona: [], ditanggung: true, urutan: 80, aktif: true, per_anak: false, jumlah_tetap: null, masalah_umum: [], ikon: 'meja' }],
    sarpras_standar: [{ lokasi_id: 'l3', butir_id: 'bt-ac', jumlah: 3, berlaku_sampai: null }],
    sarpras_masalah: [
      { id: 101, lokasi_id: 'l1', butir_id: 'bt-ac', butir_lain: null, masalah: 'Tidak dingin', jumlah: 1, penyebab: 'wajar', catatan: null, pelapor: 'u-admin', pelapor_nama: 'Ust. Uji', dilaporkan_pada: ts(-7), selesai_pada: null, batal: false },
      { id: 102, lokasi_id: 'l1', butir_id: null, butir_lain: 'Kipas', masalah: 'Mati', jumlah: 1, penyebab: 'rusak', catatan: 'baling patah', pelapor: 'u-admin', pelapor_nama: 'Ust. Uji', dilaporkan_pada: ts(0), selesai_pada: null, batal: false },
      { id: 103, lokasi_id: 'l1', butir_id: 'bt-lemari', butir_lain: null, masalah: 'Pintu rusak', jumlah: 2, penyebab: null, catatan: null, pelapor: 'u-admin', pelapor_nama: 'Ust. Uji', dilaporkan_pada: ts(-20), selesai_pada: ts(-3), batal: false },
      { id: 104, lokasi_id: 's1', butir_id: 'bt-wc', butir_lain: null, masalah: 'Mampet', jumlah: 1, penyebab: null, catatan: null, pelapor: 'u-admin', pelapor_nama: 'Ust. Uji', dilaporkan_pada: ts(-40), selesai_pada: null, batal: false }],
    sarpras_cek: [{ lokasi_id: 's1', tanggal: hari(-2), oleh: 'u-admin' }]
  };
  const B = (kode, nama, kel, n) => ({ kode, nama, kel, n, terakhir: hari(-1) });
  const PETA_BAWAAN = window.__PETA_BAWAAN = {
    kamar: [
      { lokasi_id: 'l1', santri: [
        { nisn: 'x1', nama: 'Santri Satu', kelas: 'VII-D', peran: null, keluar: false, kel: { perusakan: 2, piket: 1 }, butir: [B('K01', 'Merusak fasilitas kamar', 'perusakan', 2), B('K02', 'Tidak piket kamar sesuai jadwal', 'piket', 1)] },
        { nisn: 'x2', nama: 'Santri Dua', kelas: 'VII-D', peran: null, keluar: false, kel: {}, butir: [] },
        { nisn: 'x3', nama: 'Santri Tiga', kelas: 'VII-D', peran: null, keluar: false, kel: { piket: 2 }, butir: [B('K02', 'Tidak piket kamar sesuai jadwal', 'piket', 2)] },
        { nisn: 'x4', nama: 'Mudabbir Uji', kelas: 'XI-D', peran: 'mudabbir', keluar: true, kel: { perusakan: 1 }, butir: [B('K01', 'Merusak fasilitas kamar', 'perusakan', 1)] }] },
      { lokasi_id: 'l2', santri: [{ nisn: 'x5', nama: 'Santri Lima', kelas: 'VIII-D', peran: null, keluar: false, kel: { piket: 1 }, butir: [B('K02', 'Tidak piket kamar sesuai jadwal', 'piket', 1)] }] },
      { lokasi_id: 'l3', santri: [
        { nisn: 'x6', nama: 'Muhammad Fadhil Rahmatullah Al-Asyi bin Teuku Abdurrahman Syah Putra Meulaboh', kelas: 'IX-D', peran: null, keluar: false,
          kel: { kebersihan: 6, piket: 2, koridor: 1, cctv: 1, perusakan: 1 },
          butir: [B('K04', 'Tidak menggunakan seprei kasur', 'kebersihan', 4), B('K06', 'Barang pribadi berserakan', 'kebersihan', 2), B('K02', 'Tidak piket kamar sesuai jadwal', 'piket', 2),
                  B('K03', 'Tidak piket koridor sesuai jadwal', 'koridor', 1), B('K05', 'Menutup CCTV', 'cctv', 1), B('K01', 'Merusak fasilitas kamar', 'perusakan', 1)] },
        { nisn: 'x7', nama: 'Santri Tujuh', kelas: 'IX-D', peran: null, keluar: false, kel: { kebersihan: 2 }, butir: [B('K04', 'Tidak menggunakan seprei kasur', 'kebersihan', 2)] },
        { nisn: 'x8', nama: 'Santri Delapan', kelas: 'IX-D', peran: null, keluar: false, kel: {}, butir: [] }] },
      { lokasi_id: 'l6', santri: [
        { nisn: 'x9', nama: 'Santri Sembilan', kelas: 'X-C', peran: null, keluar: false, kel: { piket: 1 }, butir: [B('K02', 'Tidak piket kamar sesuai jadwal', 'piket', 1)] },
        { nisn: 'x10', nama: 'Santri Sepuluh', kelas: 'X-C', peran: null, keluar: false, kel: {}, butir: [] },
        { nisn: 'x11', nama: 'Santri Sebelas', kelas: 'X-C', peran: null, keluar: false, kel: {}, butir: [] }] },
      { lokasi_id: 'l7', santri: [] }],
    belum: { santri: 7, tanpa_kamar: 6, kel: { piket: 3 } } };
  const r = (data) => ({ data, error: null });
  /* ---- v2.79 · tiruan mentor ---- */
  const M = window.__MENTOR || null;   // null = bukan mentor
  window.__AGENDA = window.__AGENDA || [];
  const STD = [['Lemari', 'Semua lemari harus selalu dalam keadaan rapi.', 'kamar'], ['Lemari', 'Tidak boleh ada kain atau barang apa pun di atas lemari maupun di pintu lemari.', 'kamar'],
    ['Lemari', 'Tidak boleh ada tempelan apa pun di bagian kanan, kiri, depan, maupun belakang lemari.', 'kamar'], ['Ranjang dan Kasur', 'Semua ranjang wajib dalam keadaan rapi.', 'kamar'],
    ['Ranjang dan Kasur', 'Setiap kasur wajib menggunakan sprei.', 'kamar'], ['Ranjang dan Kasur', 'Di atas kasur hanya boleh ada bantal tidur, guling, dan selimut. Semuanya harus ditata dengan rapi.', 'kamar'],
    ['Ranjang dan Kasur', 'Tidak boleh ada ranjang yang ditutupi dengan kain dalam bentuk apa pun.', 'kamar'], ['Gantungan', 'Tidak diperbolehkan memasang gantungan dalam bentuk apa pun di dalam kamar.', 'kamar'],
    ['Gantungan', 'Gantungan hanya diperbolehkan berada di dalam lemari.', 'kamar'], ['Kotak dan Barang', 'Kotak, box, maupun kotak bekas air mineral (Aqua) tidak boleh diletakkan di luar lemari.', 'umum'],
    ['Kotak dan Barang', 'Semua barang harus disimpan di tempat yang sudah ditentukan dan tidak boleh berserakan.', 'umum'], ['Pakaian', 'Baju bersih maupun baju kotor tidak boleh diletakkan di luar laci atau lemari.', 'kamar'],
    ['Pakaian', 'Baju kotor wajib dimasukkan ke dalam tas laundry dan diletakkan dengan rapi.', 'kamar'], ['Pakaian', 'Keranjang pakaian kotor tidak diperbolehkan berada di dalam kamar.', 'kamar'],
    ['Sepatu dan Sandal', 'Semua sepatu dan sandal wajib diletakkan di tempat yang telah ditentukan.', 'umum'], ['Sepatu dan Sandal', 'Susun dengan rapi dan jangan sampai berserakan.', 'umum']]
    .map(([kelompok, butir, sasaran], i) => ({ id: 'st' + i, kelompok, butir, sasaran, urutan: i, aktif: true }));
  window.__STANDAR = window.__STANDAR || STD;
  const PL = (id, tgl, nisn, nama, kelas, ang, kode, pel, bidang) => ({ id_log: id, tanggal: hari(tgl), nisn, nama, kelas, angkatan: ang, kode, pelanggaran: pel, bidang, kategori: 'Ringan', catatan: null, penindak: 'Ust. Uji' });
  window.__PELANGGARAN_MENTOR = window.__PELANGGARAN_MENTOR || [
    PL('a1', 0, 'n1', 'Santri Tujuh A', 'VII-D', 'VII', 'K04', 'Tidak menggunakan seprei kasur', 'Kebersihan'),
    PL('a2', -1, 'n2', 'Santri Delapan B', 'VIII-E', 'VIII', 'K04', 'Tidak menggunakan seprei kasur', 'Kebersihan'),
    PL('a3', -1, 'n3', 'Santri Sebelas C', 'XI-C', 'XI', 'K02', 'Tidak piket kamar sesuai jadwal', 'Kebersihan'),
    PL('a4', -2, 'n3', 'Santri Sebelas C', 'XI-C', 'XI', 'K02', 'Tidak piket kamar sesuai jadwal', 'Kebersihan'),
    PL('a5', -2, 'n3', 'Santri Sebelas C', 'XI-C', 'XI', 'K04', 'Tidak menggunakan seprei kasur', 'Kebersihan'),
    PL('a6', -2, 'n4', 'Santri Duabelas D', 'XII-D', 'XII', 'B01', 'Berbahasa daerah', 'Bahasa'),
    PL('a7', -3, 'n5', 'Santri Sembilan E', 'IX-F', 'IX', 'K06', 'Barang pribadi berserakan', 'Kebersihan'),
    PL('a8', -4, 'n6', 'Santri Sepuluh F', 'X-C', 'X', 'K04', 'Tidak menggunakan seprei kasur', 'Kebersihan')];
  window.__KAMAR_MENTOR = window.__KAMAR_MENTOR || [
    { id: 'kor1', nama: 'Koridor Lantai 1', nomor: null, lantai: '1', zona: 'koridor', penghuni: 0, inspeksi: null, sitaan_aktif: 0 },
    { id: 'l1', nama: 'Kamar 1', nomor: 1, lantai: '1', zona: 'kamar', kapasitas: 16, penghuni: 3, inspeksi: { id: 'i0', tanggal: hari(-7), skor: 62 }, sitaan_aktif: 2 },
    { id: 'l3', nama: 'Kamar 3', nomor: 3, lantai: '2', zona: 'kamar', kapasitas: 24, penghuni: 2, inspeksi: { id: 'i1', tanggal: hari(-2), skor: 94 }, sitaan_aktif: 0 },
    { id: 'l4', nama: 'Kamar 4', nomor: 4, lantai: '1', zona: 'kamar', kapasitas: 16, penghuni: 0, inspeksi: null, sitaan_aktif: 0 }];
  window.__SITAAN = window.__SITAAN || [
    { id: 101, lokasi_id: 'l1', lokasi: 'Kamar 1', nomor: 1, nisn: null, nama: null, kelas: null, barang: 'Kardus air mineral', jumlah: 2, kode: null, id_log: null, status: 'disita', disita_pada: ts(-1), disita_nama: 'Ust. Uji', ke: null },
    { id: 102, lokasi_id: 'l1', lokasi: 'Kamar 1', nomor: 1, nisn: 'p1', nama: 'Santri Penghuni', kelas: 'VIII-D', barang: 'Gantungan baju', jumlah: 1, kode: 'K04', id_log: 'PLG-1', status: 'disita', disita_pada: ts(-1), disita_nama: 'Ust. Uji', ke: 3 },
    { id: 103, lokasi_id: 'l3', lokasi: 'Kamar 3', nomor: 3, nisn: 'p2', nama: 'Santri Kedua', kelas: 'XI-C', barang: 'Keranjang baju', jumlah: 1, kode: null, id_log: null, status: 'diserahkan', diserahkan_lewat: 'mentor', disita_pada: ts(-5), disita_nama: 'Ust. Uji', ke: 1 }];
  window.__TABEL.siswa = [
    { nisn: 'p1', nama_siswa: 'Santri Penghuni', kelas: 'VIII-D', nomor_kamar: 3, unit_gender: 'putra', status_santri: 'Aktif' },
    { nisn: 'p3', nama_siswa: 'Santri Ketiga', kelas: 'VIII-D', nomor_kamar: 3, unit_gender: 'putra', status_santri: 'Aktif' },
    { nisn: 'p9', nama_siswa: 'Santri Lain Kamar', kelas: 'IX-F', nomor_kamar: 1, unit_gender: 'putra', status_santri: 'Aktif' }];
  window.__TABEL.master_pelanggaran = [
    { kode_pelanggaran: 'K04', nama_pelanggaran: 'Tidak menggunakan seprei kasur', bidang: 'Kebersihan', unit_gender: 'putra', kategori: 'Ringan' },
    { kode_pelanggaran: 'K06', nama_pelanggaran: 'Barang pribadi berserakan', bidang: 'Kebersihan', unit_gender: 'putra', kategori: 'Ringan' },
    { kode_pelanggaran: 'B01', nama_pelanggaran: 'Berbahasa daerah', bidang: 'Bahasa', unit_gender: 'putra', kategori: 'Ringan' }];
  window.__RPC = Object.assign(window.__RPC || {}, {
    mentor_saya: () => r({ super: !!window.__SUPER, mentor: !!(M || window.__SUPER), bidang: M || [] }),
    mentor_daftar: () => r({ musyrif: [{ id: 'mus1', nama: 'Ust. Musyrif Satu', korps: 'Musyrif Asrama Uji', role: 'Guru' }, { id: 'mus2', nama: 'Ust. Musyrif Dua', korps: 'Musyrif Asrama Uji', role: 'Admin' }],
      bidang: [{ id_bidang: 'BDG-KBR', nama: 'Kebersihan' }, { id_bidang: 'BDG-UBD', nama: 'Ubudiyah' }, { id_bidang: 'BDG-BHS', nama: 'Bahasa' }],
      tetap: [{ profil_id: 'mus1', id_bidang: 'BDG-KBR', unit: 'putra' }] }),
    mentor_tetapkan: (a) => r({ ...a.p }),
    bidang_standar_daftar: () => r(window.__STANDAR),
    bidang_standar_simpan: (a) => { window.__STANDAR.push({ id: 'stb', urutan: 99, aktif: true, sasaran: 'kamar', ...a.p }); return r({ id: 'stb' }); },
    bidang_agenda_daftar: (a) => r(window.__AGENDA.filter(x => x.minggu === a.p_minggu)),
    bidang_agenda_simpan: (a) => { const p = a.p; if (p.id) { const x = window.__AGENDA.find(y => y.id === p.id); Object.assign(x, p); return r({ id: p.id }); }
      const id = 'ag' + (window.__AGENDA.length + 1); window.__AGENDA.push({ id, terlaksana: false, oleh_nama: 'Ust. Uji', ...p }); return r({ id }); },
    bidang_agenda_hapus: (a) => { window.__AGENDA = window.__AGENDA.filter(x => x.id !== a.p_id); return r({ hapus: true }); },
    /* ---- v2.80 · tiruan inspeksi & sitaan ---- */
    mentor_kamar: () => r(window.__KAMAR_MENTOR),
    inspeksi_simpan: (a) => { const n = a.p.hasil.length, ok = a.p.hasil.filter(h => h.sesuai).length; const skor = Math.round(100 * ok / n);
      const k = window.__KAMAR_MENTOR.find(x => x.id === a.p.lokasi_id); if (k) k.inspeksi = { id: 'ins1', tanggal: hari(0), skor }; return r({ id: 'ins1', skor, tanggal: hari(0) }); },
    sitaan_catat: (a) => { const id = window.__SITAAN.length + 1; const ke = a.p.nisn ? window.__SITAAN.filter(x => x.nisn === a.p.nisn).length + 1 : null;
      window.__SITAAN.unshift({ id, lokasi_id: a.p.lokasi_id, lokasi: 'Kamar 3', nomor: 3, nisn: a.p.nisn || null, nama: a.p.nisn ? 'Santri Penghuni' : null, kelas: a.p.nisn ? 'VIII-D' : null,
        barang: a.p.barang, jumlah: a.p.jumlah || 1, kode: a.p.kode || null, id_log: a.p.kode ? 'PLG-X' : null, status: 'disita', disita_pada: ts(0), disita_nama: 'Ust. Uji', ke });
      return r({ id, id_log: a.p.kode ? 'PLG-X' : null, ke }); },
    sitaan_daftar: () => r({ ambang: window.__AMBANG ?? null, mentor: true, baris: window.__SITAAN }),
    sitaan_tautkan: (a) => { const x = window.__SITAAN.find(y => y.id === a.p_id); x.nisn = a.p_nisn; x.nama = 'Santri Penghuni'; x.kelas = 'VIII-D'; x.ke = 1; return r({ id: a.p_id, id_log: a.p_kode ? 'PLG-Y' : null, ke: 1 }); },
    sitaan_serahkan: (a) => { a.p_ids.forEach(id => { const x = window.__SITAAN.find(y => y.id === id); if (x && x.status === 'disita') { x.status = 'diserahkan'; x.diserahkan_lewat = a.p_lewat; } }); return r({ diserahkan: a.p_ids.length }); },
    sitaan_status: (a) => { const x = window.__SITAAN.find(y => y.id === a.p_id); x.status = a.p_status; return r({ id: a.p_id, status: a.p_status }); },
    sitaan_sidang: () => r(window.__SITAAN_SIDANG || []),
    sitaan_serahkan_sidang: (a) => r({ diserahkan: (a.p_ids || []).length }),
    peta_kebersihan: () => r(window.__PETA_KBR || []),
    mentor_pelanggaran: (a) => r(window.__PELANGGARAN_MENTOR.filter(x => !a.p_bidang || x.bidang === ({ 'BDG-KBR': 'Kebersihan', 'BDG-BHS': 'Bahasa', 'BDG-UBD': 'Ubudiyah' })[a.p_bidang]))
  });
  window.__RPC = Object.assign(window.__RPC || {}, {
    adalah_super_admin: () => r(!!window.__SUPER),
    sarpras_saya: () => r({ pengelola: !!window.__PENGELOLA, admin: window.__PERAN === 'Admin', pimpinan: window.__PERAN === 'Pimpinan',
      musyrif: !!window.__KORPS, aktif: window.__AKTIF !== false, tugas: (window.__MILIK || []).length }),
    sarpras_lokasi_saya: () => r(window.__PENGELOLA ? window.__TABEL.sarpras_lokasi.map(l => l.id) : (window.__MILIK || [])),
    sarpras_masalah_lapor: () => r({ id: 999, ada: false }),
    sarpras_masalah_baik: (a) => r({ ditutup: (a.p_ids || []).length, dilewati: 0, ditolak: 0 }),
    sarpras_masalah_batal: () => r({ batal: true }),
    sarpras_cek_catat: (a) => r({ lokasi_id: a.p_lokasi, tanggal: hari(0) }),
    sarpras_lantai_atur: (a) => r({ diubah: a.p_lokasi.length }),
    sarpras_kapasitas_atur: (a) => r({ diubah: a.p_lokasi.length }),
    sarpras_isi_simpan: () => r({ baru: 1, ubah: 0, hapus: 0, lewati: 0 }),
    sarpras_butir_simpan: () => r({ id: 'bt-ac' }),
    sarpras_pelapor_simpan: (a) => r({ diubah: a.p_lokasi.length, pelapor: a.p_profil.length }),
    sarpras_setelan_simpan: (a) => r({ kunci: a.p_kunci, nilai: a.p_nilai }),
    sarpras_peta_kamar: (a) => { (window.__PANGGIL = window.__PANGGIL || []).push(a); const P = window.__PETA || PETA_BAWAAN; return r({ dari: a.p_dari, sampai: a.p_sampai,
      kelompok: window.__TABEL.sarpras_setelan.find(s => s.kunci === 'kelompok_pelanggaran').nilai, kamar: P.kamar, belum: P.belum }); }
  });
}

async function masuk(browser, url, o = {}) {
  const ctx = await browser.newContext({ viewport: o.vp || (o.hp ? { width: 390, height: 844 } : { width: 1366, height: 860 }), acceptDownloads: true,
    deviceScaleFactor: 1, isMobile: !!o.hp, hasTouch: !!o.hp, serviceWorkers: 'block', reducedMotion: o.gerak ? 'no-preference' : 'reduce' });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, async (route) => {
    const u = route.request().url();
    if (u.includes('supabase-js')) return route.fulfill({ contentType: 'application/javascript', body: MOCK74 });
    if (u.includes('sweetalert2')) return route.fulfill({ contentType: 'application/javascript', path: NM + '/sweetalert2/dist/sweetalert2.all.min.js' });
    if (u.includes('html2pdf') && fs.existsSync(NM + '/html2pdf.js/dist/html2pdf.bundle.min.js')) return route.fulfill({ contentType: 'application/javascript', path: NM + '/html2pdf.js/dist/html2pdf.bundle.min.js' });
    if (u.includes('xlsx') && fs.existsSync(NM + '/xlsx/dist/xlsx.full.min.js')) return route.fulfill({ contentType: 'application/javascript', path: NM + '/xlsx/dist/xlsx.full.min.js' });
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
    window.__PERAN = o.peran || 'Admin'; if (o.mentor) window.__MENTOR = o.mentor; window.__KELAS = o.kelas || []; window.__KORPS = o.korps || null;
    window.__MILIK = o.milik || []; if (o.aktif === false) window.__AKTIF = false;
    if (o.super) window.__SUPER = true;
    if (o.pengelola) window.__PENGELOLA = true;
    try { localStorage.setItem('rq-efek-pilih', o.gerak ? 'penuh' : 'hemat'); localStorage.setItem('rq.tur.v1.u-admin', '{"t":0}'); } catch (e) {}
  }})(${JSON.stringify(o)}); (${pasangSarpras.toString()})();`);
  await page.goto(url, { waitUntil: 'commit' });
  await page.waitForFunction(() => { const b = document.getElementById('btnLogin'); return typeof APP !== 'undefined' && b && b.offsetParent && !b.disabled; }, null, { timeout: 120000 });
  await page.click('#btnLogin');
  await page.waitForFunction(() => typeof APP !== 'undefined' && APP.profil && document.querySelector('#viewRoot') && document.querySelector('#viewRoot').children.length, null, { timeout: 120000 });
  await page.waitForTimeout(900);
  return { ctx, page, galat };
}
const potret = async (page, nama) => { if (POTRET) await page.screenshot({ path: path.join(KELUAR, nama + '.png'), fullPage: true }); };
const rpcLog = (p, nama) => p.evaluate((n) => (window.__LOG || []).filter(x => x.t === 'rpc:' + n).map(x => x.arg), nama);
const kosongkanLog = (p) => p.evaluate(() => { window.__LOG.length = 0; });
async function buka(page, view, siap) {
  await page.evaluate((v) => navigateTo(v), view);
  await page.waitForFunction((s) => document.querySelector(s) && !document.querySelector('.sp-muat'), siap, { timeout: 15000 });
  await page.waitForTimeout(250);
}
const tutupSwal = async (p) => { if (await p.$('.swal2-container')) { await p.keyboard.press('Escape'); await p.waitForTimeout(350); } };
const tampak = (p, sel) => p.evaluate((s) => { const b = document.querySelector(s); return !!b && !b.classList.contains('hidden'); }, sel);
const lebar = (p) => p.evaluate(() => document.documentElement.scrollWidth);
async function unduh(page, klik) {
  const [d] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), klik()]);
  const f = path.join(KELUAR, d.suggestedFilename());
  await d.saveAs(f);
  return f;
}



const BAGIAN = (process.env.RQ_BAGIAN || 'A,B,C,D,E,F').split(',');
const ikut = (b) => BAGIAN.includes(b);
const KBR = [{ id_bidang: 'BDG-KBR', nama: 'Kebersihan', unit: 'putra' }];
const MUSYRIF = { peran: 'Guru', kelas: ['VII-D'], korps: 'Musyrif Asrama Uji' };
const MENTOR = { ...MUSYRIF, mentor: KBR };
async function bukaMeja(page, tab) {
  await page.waitForSelector('#chipMode', { state: 'visible', timeout: 6000 }).catch(() => {});
  await page.click('#chipMode'); await page.waitForSelector('.mn-akar .kb-tab, .mn-akar .mn-tab', { timeout: 8000 });
  if (tab) { await page.click(`[data-mn="tab"][data-v="${tab}"]`).catch(() => {}); await page.waitForTimeout(600); }
}

(async () => {
  const chrome = process.env.RQ_CHROME || (fs.existsSync('/usr/bin/google-chrome') ? '/usr/bin/google-chrome' : undefined);
  const browser = await pw.chromium.launch(chrome && !process.env.RQ_PW_BAWAAN ? { executablePath: chrome } : {});
  const server = await layani(AKAR, 4783);
  const URL = 'http://127.0.0.1:4783/';
  try {
    if (ikut('A')) {
      console.log('\nA · RQKb murni + token gerak');
      const css = baca('gaya.css');
      cek('A1 token --g-lambat:460ms ada', /--g-lambat:\s*460ms/.test(css));
      cek('A0 sw.js VERSI rq-v2.83', /const VERSI = 'rq-v2\.83(\.\d+)?'/.test(baca('sw.js')));
      cek('A0 app.js APP.versi terakhir rq-v2.83', (baca('app.js').match(/APP\.versi = '([^']+)'/g) || []).pop() === "APP.versi = 'rq-v2.83'");
      if (fs.existsSync(path.join(AKAR, 'migrasi')))   // migrasi/ hanya ada di repo src, tidak di repo rilis
        cek('A0 migrasi v2.83 + ROLLBACK + uji SQL ada', ['migrasi/20261122_v2_83_batas_apresiasi.sql', 'migrasi/20261122_v2_83_ROLLBACK.sql', 'uji/sql/v283-batas.sql'].every(f => fs.existsSync(path.join(AKAR, f))));
      cek('A2 hemat gerak menyetel --g-lambat:0.01ms', /html\.hemat[^{]*\{[^}]*--g-lambat:\s*0\.01ms/.test(css));
      const { ctx, page, galat } = await masuk(browser, URL, { super: true });
      const h = await page.evaluate(() => {
        const K = window.RQKb; if (!K) return null;
        const tab = K.tab([['a', 'A', 'fa-a'], ['b', 'B', 'fa-b', 3], ['c', 'C', 'fa-c']], 'b', 'data-x', 'Uji');
        const d = document.createElement('div'); d.innerHTML = tab;
        return { m: [0, 1, 3, 4, 8, 9, 14, 15, 40].map(K.tingkatMasalah), s: [100, 90, 89, 80, 79, 70, 69, 50, 49, null].map(K.tingkatSkor),
          terpilih: d.querySelectorAll('[aria-selected="true"]').length, garis: !!d.querySelector('.kb-tab-garis'), lencana: d.querySelector('[data-x="b"] .kb-tab-n')?.textContent,
          kepala: (() => { const e = document.createElement('div'); e.innerHTML = K.kepala({ alis: 'Al', judul: 'Ju', angka: [{ n: 3, l: 'x' }, { n: 0, l: 'y', merah: true }] }); return { h: !!e.querySelector('header.kb-kepala'), n: e.querySelectorAll('[data-kb-n]').length, p: e.querySelectorAll('p').length }; })(),
          hemat: K.hemat() };
      });
      cek('A3 RQKb tersedia', !!h, h);
      if (h) {
        cek('A4 tingkatMasalah 0/1–3/4–8/9–14/≥15', JSON.stringify(h.m) === JSON.stringify([0, 1, 1, 2, 2, 3, 3, 4, 4]), h.m);
        cek('A5 tingkatSkor ≥90/80/70/50/<50/belum', JSON.stringify(h.s) === JSON.stringify([0, 0, 1, 1, 2, 2, 3, 3, 4, 'belum']), h.s);
        cek('A6 tab: tepat satu terpilih + garis + lencana', h.terpilih === 1 && h.garis && h.lencana === '3', h);
        cek('A7 kepala: header.kb-kepala, 2 angka, tanpa <p>', h.kepala.h && h.kepala.n === 2 && h.kepala.p === 0, h.kepala);
        cek('A8 hemat() benar saat reducedMotion=reduce', h.hemat === true, h.hemat);
      }
      cek('A9 tanpa galat halaman', !galat.length, galat);
      await ctx.close();
    }
    if (ikut('B')) {
      console.log('\nB · Mode Mentor');
      const BANYAK = { ...MUSYRIF, mentor: [
        { id_bidang: 'BDG-KBR', nama: 'Kebersihan', unit: 'putra' }, { id_bidang: 'BDG-KBR', nama: 'Kebersihan', unit: 'putri' },
        { id_bidang: 'BDG-BHS', nama: 'Bahasa', unit: 'putra' }, { id_bidang: 'BDG-BHS', nama: 'Bahasa', unit: 'putri' },
        { id_bidang: 'BDG-UBD', nama: 'Ubudiyah', unit: 'putra' }] };
      {
        const { ctx, page, galat } = await masuk(browser, URL, BANYAK);
        await bukaMeja(page); await page.waitForSelector('.mn-ang', { timeout: 8000 }).catch(() => {});
        const k = await page.evaluate(() => {
          const kp = document.querySelector('.mn-akar .kb-kepala');
          const g = document.querySelector('.mn-akar .kb-tab .kb-tab-garis'), on = document.querySelector('.mn-akar .kb-tab [aria-selected="true"]');
          const xii = document.querySelector('.mn-ang[data-angkatan="XII"]');
          return { pil: document.querySelectorAll('.mn-akar .mn-pil').length, lama: document.querySelectorAll('.mn-kepala').length, sak: document.querySelectorAll('.mn-akar .kb-sakelar').length,
            label: document.querySelector('.kb-sakelar-b')?.textContent.trim(), tinggi: kp ? kp.getBoundingClientRect().height : 999, p: kp ? kp.querySelectorAll('p').length : -1,
            judul: kp?.querySelector('h2')?.textContent, garis: g && on ? Math.abs(g.getBoundingClientRect().left - on.getBoundingClientRect().left) < 2 && g.getBoundingClientRect().width > 10 : false,
            xii: xii ? { kosong: xii.classList.contains('kosong'), h: xii.querySelector('.mn-batang i')?.getBoundingClientRect().height ?? 99 } : null,
            lencana: [...document.querySelectorAll('.mn-berulang .kb-lencana, .mn-berulang header span')].map(e => e.textContent.trim()) };
        });
        cek('B1 tanpa 14 tombol bidang (.mn-pil) & tanpa kepala navy lama', k.pil === 0 && k.lama === 0, k);
        cek('B2 satu sakelar "Kebersihan · Putra"', k.sak === 1 && k.label === 'Kebersihan · Putra', k);
        cek('B3 kepala ringkas ≤ 96 px, tanpa paragraf', k.tinggi <= 96 && k.p === 0, k);
        cek('B4 garis tab tepat di bawah tab terpilih', k.garis, k);
        cek('B5 angkatan bernilai 0: garis dasar tipis (kelas kosong, ≤ 4 px)', !!k.xii && k.xii.kosong && k.xii.h <= 4, k.xii);
        cek('B6 "tiga catatan atau lebih" menjadi lencana ≥3', k.lencana.includes('≥3') && !k.lencana.some(t => /tiga catatan/.test(t)), k.lencana);
        await potret(page, 'v283-mentor-ringkasan');
        await page.click('.kb-sakelar-b'); await page.waitForSelector('.kb-sakelar-panel:not([hidden])', { timeout: 3000 }).catch(() => {});
        const d1 = await page.evaluate(() => [...document.querySelectorAll('.kb-sakelar-i')].map(b => [b.textContent.trim(), b.disabled]));
        await page.click('.kb-segmen [data-kb-seg="putri"]');
        const d2 = await page.evaluate(() => [...document.querySelectorAll('.kb-sakelar-i')].map(b => [b.textContent.trim(), b.disabled]));
        cek('B7 segmen Putri menonaktifkan bidang yang tidak ada di unit putri (Ubudiyah)', JSON.stringify(d2.find(x => x[0] === 'Ubudiyah')) === '["Ubudiyah",true]' && !d1.find(x => x[0] === 'Ubudiyah')[1], { d1, d2 });
        await page.click('.kb-sakelar-i[data-kb-v="BDG-BHS"]'); await page.waitForTimeout(900);
        const s = await page.evaluate(() => ({ judul: document.querySelector('.mn-akar .kb-kepala h2')?.textContent, label: document.querySelector('.kb-sakelar-b')?.textContent.trim(),
          unit: window.RQMentor._S.pilih.unit, panel: document.querySelector('.kb-sakelar-panel')?.hidden, nav: performance.getEntriesByType('navigation').length }));
        cek('B8 pilih Bahasa · Putri: judul & label berganti tanpa muat ulang', s.judul === 'Bahasa' && s.label === 'Bahasa · Putri' && s.unit === 'putri' && s.panel !== false, s);
        await page.click('.kb-sakelar-b'); await page.keyboard.press('Escape'); await page.waitForTimeout(200);
        cek('B9 Esc menutup sakelar', await page.evaluate(() => document.querySelector('.kb-sakelar-panel').hidden));
        cek('B10 tanpa galat', !galat.length, galat);
        await ctx.close();
      }
      {
        const { ctx, page, galat } = await masuk(browser, URL, MENTOR);
        await bukaMeja(page, 'inspeksi'); await page.waitForSelector('.mn-lok[data-id="l3"]', { timeout: 6000 }).catch(() => {});
        const t = await page.$$eval('.mn-lok', L => L.map(l => [l.dataset.id, l.dataset.tingkat, l.classList.contains('kb-kamar')]));
        const f = (id) => (t.find(x => x[0] === id) || [])[1];
        cek('B11 inspeksi: kartu kb-kamar bertingkat (94→0, 62→3, tanpa skor→belum)', t.every(x => x[2]) && f('l3') === '0' && f('l1') === '3' && f('l4') === 'belum', t);
        await potret(page, 'v283-mentor-inspeksi');
        cek('B12 tanpa galat (inspeksi)', !galat.length, galat);
        await ctx.close();
      }
      {
        const h = await masuk(browser, URL, { ...BANYAK, hp: true, vp: { width: 360, height: 760 } });
        await bukaMeja(h.page); await h.page.waitForSelector('.kb-sakelar-b', { timeout: 6000 }).catch(() => {});
        await h.page.click('.kb-sakelar-b'); await h.page.waitForTimeout(400);
        const r = await h.page.evaluate(() => ({ lembar: !!document.querySelector('.kb-sakelar-panel.kb-sakelar-lembar:not([hidden])'), tirai: !!document.querySelector('.kb-tirai'),
          lebar: document.documentElement.scrollWidth, klien: document.documentElement.clientWidth }));
        await potret(h.page, 'v283-mentor-hp-sakelar');
        cek('B13 360 px: sakelar terbuka sebagai lembar bawah, tanpa gulir mendatar', r.lembar && r.tirai && r.lebar <= r.klien, r);
        cek('B14 tanpa galat (HP)', !h.galat.length, h.galat);
        await h.ctx.close();
      }
    }
    if (ikut('C')) {
      console.log('\nC · Sarpras Kamar');
      const SARPRAS = { super: true, pengelola: true };
      const tambahMasalah = (page) => page.evaluate(() => {
        const ts = window.__HARI(-1) + 'T03:00:00+00:00'; let id = 500;
        const isi = (lok, n) => { for (let i = 0; i < n; i++) window.__TABEL.sarpras_masalah.push({ id: id++, lokasi_id: lok, butir_id: 'bt-ac', butir_lain: null, masalah: 'Tidak dingin', jumlah: 1,
          penyebab: 'wajar', catatan: null, pelapor: 'u-admin', pelapor_nama: 'Ust. Uji', dilaporkan_pada: ts, selesai_pada: null, batal: false }); };
        isi('l2', 17); isi('l4', 5); isi('l5', 10);
      });
      const bukaKamar = async (page) => {
        await tambahMasalah(page);
        await buka(page, 'sarpras', '.sp-lapor');
        if (await page.$('[data-sp-tab="kamar"][aria-selected="false"]')) { await page.click('[data-sp-tab="kamar"]'); }
        await page.waitForSelector('.sp-lk[data-id="l1"]', { timeout: 6000 });
        await page.waitForTimeout(300);
      };
      {
        const { ctx, page, galat } = await masuk(browser, URL, SARPRAS);
        await bukaKamar(page);
        const k = await page.evaluate(() => {
          const kp = document.querySelector('.sp-lapor .kb-kepala');
          const t = (id) => document.querySelector(`.sp-lk[data-id="${id}"]`)?.dataset.tingkat;
          const n = document.querySelector('[data-sp-tab="kamar"] .kb-tab-n');
          return { hero: document.querySelectorAll('.sp-hero, .sp-hero-ket').length, kepala: !!kp, angka: kp ? kp.querySelectorAll('[data-kb-n]').length : 0,
            judul: kp?.querySelector('h2')?.textContent, tab: !!document.querySelector('.sp-lapor .kb-tab'), merah: n ? n.classList.contains('merah') : null,
            t: { l2: t('l2'), l5: t('l5'), l4: t('l4'), l1: t('l1'), l3: t('l3') },
            urut: window.RQSarpras._uji.urutLokasi ? window.RQSarpras._uji.urutLokasi(window.RQSarpras._uji.SP.data.lokasi.filter(l => l.zona === 'kamar'), 'masalah').map(l => l.id).slice(0, 3) : null };
        });
        cek('C1 tanpa kartu "Amanah sarana" & kalimat penjelas', k.hero === 0, k);
        cek('C2 kepala kb-kepala "Sarpras" dengan 3 angka kunci', k.kepala && k.judul === 'Sarpras' && k.angka === 3, k);
        cek('C3 tab bergaris; lencana masalah terbuka berwarna merah', k.tab && k.merah === true, k);
        cek('C4 tingkat kartu: 17→4, 10→3, 5→2, 2→1, belum pernah dicek→belum', JSON.stringify(k.t) === JSON.stringify({ l2: '4', l5: '3', l4: '2', l1: '1', l3: 'belum' }), k.t);
        cek('C5 urutLokasi "masalah": terbanyak dulu (l2, l5, l4)', JSON.stringify(k.urut) === '["l2","l5","l4"]', k.urut);
        await page.click('[data-sp="urut"]'); await page.waitForTimeout(250);
        const u = await page.evaluate(() => ({ simpan: localStorage.getItem('rq:sp-urut'), pertama: document.querySelector('.sp-lk-kisi .sp-lk')?.dataset.id, tekan: document.querySelector('[data-sp="urut"]')?.getAttribute('aria-pressed') }));
        cek('C6 tombol urut: "Terbanyak dulu" tersimpan & kartu paling bermasalah di depan', u.simpan === 'masalah' && u.tekan === 'true' && ['l2', 'l5'].includes(u.pertama), u);
        await page.click('[data-sp="urut"]'); await page.waitForTimeout(150);
        await potret(page, 'v283-sarpras-kamar');
        await page.click('.sp-lk[data-id="l1"]'); await page.waitForSelector('.sp-detail', { timeout: 5000 });
        await page.waitForTimeout(300);
        const d = await page.evaluate(() => ({ baris: document.querySelectorAll('.sp-buka .kb-baris').length,
          ceklis: document.querySelectorAll('.sp-buka .kb-baris .kb-aksi-ikon[aria-label="Sudah baik"]').length,
          batalTampak: [...document.querySelectorAll('.sp-buka [data-sp="batal"]')].some(b => b.checkVisibility({ contentVisibilityAuto: true, visibilityProperty: true })),
          aman: document.querySelector('.sp-aman')?.classList.contains('btn-primary') }));
        cek('C7 rincian: baris padat sejumlah masalah terbuka (2), tombol ✓ "Sudah baik"', d.baris === 2 && d.ceklis === 2, d);
        cek('C8 "Batal" tersembunyi di menu ⋯; "Sudah dicek, aman" tombol utama', !d.batalTampak && d.aman, d);
        await potret(page, 'v283-sarpras-rincian');
        await kosongkanLog(page);
        await page.click('.sp-buka .kb-baris[data-msl="101"] [data-sp="baik"]'); await page.waitForTimeout(200);
        const p1 = await page.evaluate(() => ({ pergi: document.querySelector('.sp-msl[data-msl="101"]')?.classList.contains('pergi'), urung: !!document.querySelector('.kb-urung') }));
        cek('C9 ✓: baris memudar & cip Urungkan tampil', p1.pergi && p1.urung, p1);
        await page.click('.kb-urung button'); await page.waitForTimeout(400);
        const p2 = await page.evaluate(() => ({ pergi: document.querySelector('.sp-msl[data-msl="101"]')?.classList.contains('pergi') }));
        cek('C10 Urungkan: RPC tidak dipanggil & baris kembali', (await rpcLog(page, 'sarpras_masalah_baik')).length === 0 && p2.pergi === false, p2);
        await page.click('.sp-buka .kb-baris[data-msl="101"] [data-sp="baik"]'); await page.waitForTimeout(200);
        await page.evaluate(() => navigateTo('ringkasan')); await page.waitForTimeout(600);
        const log = await rpcLog(page, 'sarpras_masalah_baik');
        cek('C11 pindah halaman sebelum jeda habis: RPC terkirim tepat sekali', log.length === 1 && JSON.stringify(log[0]?.p_ids) === '[101]', log);
        cek('C12 tanpa galat', !galat.length, galat);
        await ctx.close();
      }
      for (const gerak of [false, true]) {
        const { ctx, page } = await masuk(browser, URL, { ...SARPRAS, gerak });
        await bukaKamar(page);
        await page.evaluate(() => { window.__VT = 0; const asli = document.startViewTransition?.bind(document); document.startViewTransition = (fn) => { window.__VT++; return asli ? asli(fn) : (fn(), { updateCallbackDone: Promise.resolve() }); }; });
        await page.click('.sp-lk[data-id="l1"]'); await page.waitForSelector('.sp-detail', { timeout: 5000 });
        const vt = await page.evaluate(() => window.__VT);
        cek(gerak ? 'C13 gerak penuh: rincian berkembang lewat View Transition' : 'C14 hemat gerak: rincian langsung tampil tanpa View Transition', gerak ? vt === 1 : vt === 0, vt);
        await ctx.close();
      }
      {
        const h = await masuk(browser, URL, { ...SARPRAS, hp: true, vp: { width: 360, height: 760 } });
        await bukaKamar(h.page); const w1 = await lebar(h.page); await potret(h.page, 'v283-sarpras-hp');
        await h.page.click('.sp-lk[data-id="l1"]'); await h.page.waitForSelector('.sp-detail'); await h.page.waitForTimeout(300); const w2 = await lebar(h.page); await potret(h.page, 'v283-sarpras-hp-rincian');
        cek('C15 360 px: daftar & rincian tanpa gulir mendatar', w1 <= 361 && w2 <= 361, [w1, w2]);
        cek('C16 tanpa galat (HP)', !h.galat.length, h.galat);
        await h.ctx.close();
      }
    }
    if (ikut('D')) {
      console.log('\nD · gerak global');
      const css = baca('gaya.css');
      {
        const { ctx, page, galat } = await masuk(browser, URL, { super: true, pengelola: true, gerak: true });
        await page.evaluate(() => navigateTo('sarpras')); await page.waitForSelector('.sp-lapor', { timeout: 8000 });
        const a = await page.evaluate(() => { const e = document.querySelector('#viewRoot > *'); const c = getComputedStyle(e); return { d: c.animationDuration, f: c.animationTimingFunction, n: c.animationName }; });
        cek('D1 masuk halaman memakai irama token (0,28 dtk, kurva keluar)', a.d === '0.28s' && /cubic-bezier\(0\.2, 0\.8, 0\.2, 1\)/.test(a.f), a);
        await page.waitForTimeout(900);   // transisi halaman (view-transition "isi") selesai dulu
        const kotak = await page.$eval('.kb-urut, [data-sp-tab="riwayat"]', e => { const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
        await page.mouse.move(kotak.x, kotak.y); await page.mouse.down(); await page.waitForTimeout(220);
        const t = await page.evaluate(() => getComputedStyle(document.querySelector('.kb-urut, [data-sp-tab="riwayat"]')).transform);
        await page.mouse.up();
        cek('D2 komponen kb- ikut tekan-susut 0,97', /matrix\(0\.97, 0, 0, 0\.97/.test(t), t);
        cek('D3 tanpa galat', !galat.length, galat);
        await ctx.close();
      }
      {
        const { ctx, page } = await masuk(browser, URL, { super: true, pengelola: true });
        await page.evaluate(() => navigateTo('sarpras')); await page.waitForSelector('.sp-lapor', { timeout: 8000 });
        const d = await page.evaluate(() => getComputedStyle(document.querySelector('#viewRoot > *')).animationDuration);
        cek('D4 hemat/kurangi gerak: masuk halaman tidak lebih lambat dari 0,2 dtk', d === '0s' || parseFloat(d) <= 0.2, d);
        await ctx.close();
      }
      cek('D5 cincin fokus kuningan seragam untuk tombol & komponen kb-', /:where\([^)]*\.btn[^)]*\.kb-tab-b[^)]*\):focus-visible\s*\{[^}]*outline:\s*2px solid var\(--brass\)/.test(css));
    }
    if (ikut('E')) {
      console.log('\nE · teks penjelasan');
      const { spawnSync } = require('child_process');
      const r = spawnSync(process.execPath, [path.join(AKAR, 'alat', 'periksa-teks-v283.cjs'), '--json'], { encoding: 'utf8' });
      let sisa = null; try { sisa = JSON.parse(r.stdout || 'null'); } catch (e) { sisa = r.stdout; }
      cek('E1 pemindai teks penjelas: 0 sisa', r.status === 0 && Array.isArray(sisa) && sisa.length === 0, Array.isArray(sisa) ? sisa.slice(0, 5) : sisa);
      const sd = baca('sidang.js'), app = baca('app.js');
      cek('E2 Ruang Sidang tanpa kalimat bobot apresiasi & hak super admin', !/15 poin, lainnya 10 poin/.test(sd) && !/Super admin boleh bersidang/.test(sd));
      cek('E3 halaman Prestasi tanpa subjudul penjelas', !/Peringkat poin apresiasi pada periode aktif/.test(app) && !/Bidang mana yang paling sering/.test(app));
      const cekSintaks = ['app.js', 'sidang.js', 'mentor.js', 'sarpras.js', 'penempatan.js', 'meja.js', 'sw.js'].filter(f => spawnSync(process.execPath, ['--check', path.join(AKAR, f)]).status !== 0);
      cek('E4 node --check semua berkas JS', cekSintaks.length === 0, cekSintaks);
    }
    if (ikut('F')) {
      console.log('\nF · perbaikan tinjauan akhir');
      {   // Important 2 · poin majelis = poin yang benar-benar diterima (server), bukan bobot tetap
        const { ctx, page, galat } = await masuk(browser, URL, { super: true, pengelola: true });
        await page.addScriptTag({ url: URL + 'sidang.js' }); await page.waitForFunction(() => !!window.RQSidang?._uji, null, { timeout: 8000 });
        const r = await page.evaluate(() => {
          const U = window.RQSidang._uji; if (!U.kursiMajelis) return null;
          U.S.data = Object.assign(U.S.data || {}, { panitia: { wajib: {}, bobot: { ketua: 15, lain: 10 }, isi: { ketua: { nama: 'Ketua Uji', poin: 5, kredit: true },
            anggota1: { nama: 'Anggota Penuh', poin: 0, kredit: true }, anggota2: { nama: 'Belum Diketuk', poin: 0, perkiraan: 5 }, panitera: { nama: 'Tanpa Perkiraan' }, pj: {} } } });
          const k = U.kursiMajelis(); const f = (id) => k.find(x => x.id === id);
          return { ketua: f('ketua').poin, a1: f('anggota1').poin, a2: f('anggota2').poin, pt: f('panitera').poin, bK: f('ketua').bobot, bP: f('penasihat').bobot };
        });
        cek('F1 kursi majelis: poin tercatat sesudah palu (5/0), perkiraan server sebelum palu (5), tanpa angka bila tak ada; bobot jabatan dari server',
            !!r && r.ketua === 5 && r.a1 === 0 && r.a2 === 5 && r.pt == null && r.bK === 15 && r.bP === 10, r);
        cek('F1 tidak ada lagi bobot 15/10 tertanam di sidang.js', !/poin: k === 'ketua' \? 15 : 10/.test(baca('sidang.js')) && !/`\$\{k\.poin\} poin`/.test(baca('sidang.js')));
        cek('F1 tanpa galat', !galat.length, galat);
        await ctx.close();
      }
      {   // Important 1 · ✓ lalu muat ulang dalam jeda Urungkan → tetap terkirim sesudah halaman dibuka lagi
        const { ctx, page } = await masuk(browser, URL, { super: true, pengelola: true });
        await buka(page, 'sarpras', '.sp-lapor');
        if (await page.$('[data-sp-tab="kamar"][aria-selected="false"]')) await page.click('[data-sp-tab="kamar"]');
        await page.waitForSelector('.sp-lk[data-id="l1"]');
        const nama = await page.evaluate(() => [...document.querySelectorAll('.sp-lk')].filter(e => getComputedStyle(e).viewTransitionName !== 'none').length);
        cek('F2 kartu kamar tanpa view-transition-name tetap (hanya kartu yang ditekan)', nama === 0, nama);
        await page.click('.sp-lk[data-id="l1"]'); await page.waitForSelector('.sp-detail');
        await page.click('.sp-buka .kb-baris[data-msl="101"] [data-sp="baik"]'); await page.waitForTimeout(150);
        await page.reload({ waitUntil: 'commit' });
        await page.waitForFunction(() => { const b = document.getElementById('btnLogin'); return typeof APP !== 'undefined' && b && b.offsetParent && !b.disabled; }, null, { timeout: 120000 });
        await page.click('#btnLogin');
        await page.waitForFunction(() => typeof APP !== 'undefined' && APP.profil && document.querySelector('#viewRoot')?.children.length, null, { timeout: 120000 });
        await buka(page, 'sarpras', '.sp-lapor'); await page.waitForTimeout(500);
        const log = await rpcLog(page, 'sarpras_masalah_baik');
        const sisa = await page.evaluate(() => localStorage.getItem('rq:sp-tunda'));
        cek('F3 muat ulang dalam jeda Urungkan: "Sudah baik" terkirim sekali sesudah dibuka lagi', log.length === 1 && JSON.stringify(log[0]?.p_ids) === '[101]' && (!sisa || sisa === '[]'), { log, sisa });
        await ctx.close();
      }
    }
    //@@BAGIAN@@
  } finally { await browser.close(); server.close(); }
  console.log(`\n${lulus} lulus, ${gagal} gagal`);
  process.exit(gagal ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
