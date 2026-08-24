/* =====================================================================
   SISTEM INFORMASI PENGEMBANGAN SANTRI — APLIKASI WEB MANDIRI
   Supabase (PostgreSQL + Auth + RLS + Realtime) · tanpa Apps Script

   Versi ini memuat hasil PORTING dari project Apps Script lama:
   - Konteks operasional Pengasuhan / Madrasah MTs / Madrasah MA
   - Rekap pelanggaran dengan kaskade konversi 5x Ringan -> 1 Sedang, dst.
   - Modul Pembinaan (KPI, filter, ubah status) + Rekap Pembinaan per santri
   - Master Bidang (divisi) berdampingan dengan Master Pelanggaran
   - Dashboard Pimpinan (analisis eksekutif, tier santri prioritas)
   - Laporan terpadu: cetak + unduh PDF (html2pdf)
   - RBAC klien: Admin/Guru/Walas/Guru BK/Guru Piket/Ustadz GEN-Z/Osis/Pimpinan
   - Indikator sinkronisasi saat proses input

   Semua agregasi dihitung DI BROWSER dari tabel yang sudah ada.
   Tidak ada perubahan skema maupun RPC baru di backend.
   ===================================================================== */

// ---------------------------------------------------------------------
// 0. KONFIGURASI
// ---------------------------------------------------------------------
const SUPABASE_URL      = 'https://tuthhfdpcknocebliuhq.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR1dGhoZmRwY2tub2NlYmxpdWhxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY4NDY2NzUsImV4cCI6MjEwMjQyMjY3NX0.E3Jq7I5YWdO7zzZvRH6l4F0o-wV-hfCDJbRGHtYOrUk';

// Username tanpa "@" dilengkapi domain ini saat login.
const DOMAIN_INTERNAL = 'ruhulqurani.local';

// Aset opsional untuk layar login. Kosongkan bila belum ada.
const ASET = { logo: '', foto: '' };

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true }
});

const APP = {
  profil: null,
  view: 'dashboard',
  charts: {},
  channel: null,
  onKlik: null,
  ctx: { unit: 'Semua', jenjang: 'Semua' }
};

// ---------------------------------------------------------------------
// 1. UTILITAS DASAR
// ---------------------------------------------------------------------
const $ = (id) => document.getElementById(id);

function esc(s) {
  if (s === null || s === undefined) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
                  .replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}

function angka(n) { return Number(n || 0).toLocaleString('id-ID'); }

/** Normalisasi tanggal apa pun menjadi 'yyyy-MM-dd'. */
function kunciTgl(v) {
  if (!v) return '';
  if (v instanceof Date && !isNaN(v)) {
    return `${v.getFullYear()}-${String(v.getMonth()+1).padStart(2,'0')}-${String(v.getDate()).padStart(2,'0')}`;
  }
  const t = String(v).trim();
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;
  m = t.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  const d = new Date(t);
  return isNaN(d) ? '' : kunciTgl(d);
}

function tglDari(kunci) {
  const p = String(kunci || '').split('-').map(Number);
  if (p.length !== 3 || !p[0]) return null;
  const d = new Date(p[0], p[1] - 1, p[2]);
  return isNaN(d) ? null : d;
}

function tgl(v) {
  const k = kunciTgl(v);
  if (!k) return '-';
  const d = tglDari(k);
  if (!d) return String(v);
  return d.toLocaleDateString('id-ID', { day:'2-digit', month:'short', year:'numeric' });
}

function hariIni() { return kunciTgl(new Date()); }
function tambahHari(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function awalPekan(d) {
  const x = new Date(d); x.setHours(0,0,0,0);
  const h = x.getDay();
  x.setDate(x.getDate() + (h === 0 ? -6 : 1 - h));
  return x;
}
function labelPekan(kunci) {
  const s = tglDari(kunci); if (!s) return kunci;
  const e = tambahHari(s, 6);
  const bl = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
  return s.getMonth() === e.getMonth()
    ? `${s.getDate()}–${e.getDate()} ${bl[e.getMonth()]}`
    : `${s.getDate()} ${bl[s.getMonth()]}–${e.getDate()} ${bl[e.getMonth()]}`;
}

function loading(on) { $('bar').classList.toggle('hidden', !on); }

function toast(icon, title) {
  Swal.mixin({ toast:true, position:'top-end', showConfirmButton:false,
               timer:2600, timerProgressBar:true }).fire({ icon, title });
}

function fireError(err) {
  const msg = err?.message || String(err);
  console.error(err);
  Swal.fire({ icon:'error', title:'Terjadi Kesalahan', text:msg, confirmButtonColor:'#14618B' });
}

function debounce(fn, ms) {
  let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

/** Bungkus query supaya waktu eksekusi tampil di header. */
async function q(promise, label) {
  const t0 = performance.now();
  const res = await promise;
  const ms = Math.round(performance.now() - t0);
  $('queryTime').textContent = `${label || 'query'} · ${ms} ms`;
  if (res.error) throw res.error;
  return res;
}

// ---------------------------------------------------------------------
// 1b. INDIKATOR SINKRONISASI (port dari fast-sync Apps Script)
// ---------------------------------------------------------------------
const SYNC = { pending: 0, timer: null };

function sync(status, teks) {
  const el = $('syncDot'), lb = $('syncText');
  if (!el) return;
  clearTimeout(SYNC.timer);
  el.classList.add('on');
  el.classList.remove('save','done','warn');
  el.classList.add(status === 'saving' ? 'save' : status === 'warn' ? 'warn' : 'done');
  lb.textContent = teks || (status === 'saving' ? 'Menyimpan…' : status === 'warn' ? 'Tertunda' : 'Tersimpan');
  if (status !== 'saving') SYNC.timer = setTimeout(() => el.classList.remove('on'), 2200);
}

/** Kunci tombol saat menyimpan, sekaligus mencegah klik ganda. */
function mulaiSimpan(btn, label) {
  SYNC.pending++;
  sync('saving', label || 'Menyimpan…');
  if (!btn) return null;
  const asli = { html: btn.innerHTML, disabled: btn.disabled };
  btn.disabled = true;
  btn.classList.add('btn-loading');
  btn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i><span>${esc(label || 'Menyimpan…')}</span>`;
  return asli;
}

function selesaiSimpan(btn, asli, sukses, teks) {
  SYNC.pending = Math.max(0, SYNC.pending - 1);
  if (btn && asli) {
    btn.disabled = asli.disabled;
    btn.classList.remove('btn-loading');
    btn.innerHTML = asli.html;
  }
  if (!sukses) return sync('warn', teks || 'Gagal menyimpan');
  if (SYNC.pending > 0) sync('saving', `${SYNC.pending} proses berjalan`);
  else sync('done', teks || 'Tersimpan');
}

// ---------------------------------------------------------------------
// 2. RBAC KLIEN (mengikuti aturan Code.gs lama)
// ---------------------------------------------------------------------
const role = () => APP.profil?.role || '';

const SEMUA_ROLE = ['Admin','Guru','Walas','Guru BK','Guru Piket','Ustadz GEN-Z','Osis','Pimpinan','Klinik'];

const isAdmin        = () => role() === 'Admin';
const hanyaBaca      = () => role() === 'Guru Piket';                 // Guru Piket read-only di modul umum
const bolehTulis     = () => !hanyaBaca() && ['Admin','Guru','Walas','Guru BK','Ustadz GEN-Z','Osis'].includes(role());
const bolehPerizinan = () => ['Admin','Guru','Guru Piket'].includes(role());
const bolehCetak     = () => !['Guru Piket','Ustadz GEN-Z','Walas','Osis'].includes(role());
const bolehPdf       = () => !['Guru Piket','Ustadz GEN-Z','Guru BK','Walas','Osis'].includes(role());
const bolehMaster    = () => !['Ustadz GEN-Z'].includes(role());
const bolehPembinaan = () => !['Osis','Guru Piket','Ustadz GEN-Z','Guru BK','Walas'].includes(role());
const perluFilterKelas = () => ['Guru','Guru BK','Walas'].includes(role());

/** Guru/Walas/Guru BK hanya melihat kelas binaannya. */
function filterBinaan(rows, field = 'kelas') {
  if (!perluFilterKelas()) return rows;
  const kb = APP.profil?.kelas_binaan || [];
  return rows.filter(r => kb.includes(r[field]));
}

const MENU_ROLE = {
  dashboard:   ['Admin','Guru','Walas','Guru BK','Guru Piket','Ustadz GEN-Z','Osis'],
  pimpinan:    ['Admin','Pimpinan'],
  siswa:       ['Admin','Guru','Walas','Guru BK','Guru Piket','Ustadz GEN-Z','Osis'],
  pelanggaran: ['Admin'],
  rekap:       ['Admin'],
  pengasuhan:  ['Admin','Guru','Walas','Guru BK','Guru Piket','Ustadz GEN-Z','Osis'], 
  madrasah:    ['Admin','Guru','Walas','Guru BK','Guru Piket','Osis'],
  perizinan:   ['Admin','Guru','Guru Piket'],
  pembinaan:   ['Admin','Guru','Walas','Guru BK','Guru Piket','Ustadz GEN-Z'],
  rekapbina:   ['Admin','Guru','Walas','Guru BK','Guru Piket','Ustadz GEN-Z'],
  master:      ['Admin','Guru','Walas','Guru BK','Guru Piket'],
  pengguna:    ['Admin']
};

const JUDUL = {
  dashboard:  { lat:'Ringkasan',           ar:'الملخّص',            teks:'Ringkasan' },
  pimpinan:   { lat:'Pimpinan',            ar:'لوحة القيادة',       teks:'Dashboard Pimpinan' },
  siswa:      { lat:'Santri',              ar:'بيانات الطلاب',      teks:'Profil Santri' },
  pelanggaran:{ lat:'Pelanggaran',         ar:'المخالفات',          teks:'Catatan Pelanggaran' },
  rekap:      { lat:'Rekap',               ar:'حصر المخالفات',      teks:'Rekap Pelanggaran' },
   pengasuhan: { lat:'Pengasuhan', ar:'التربية والانضباط', teks:'Unit Pengasuhan' }, 
  madrasah:   { lat:'Madrasah',            ar:'المدرسة',            teks:'Modul Madrasah' },
  perizinan:  { lat:'Perizinan',           ar:'الاستئذان',          teks:'Pusat Perizinan' },
  pembinaan:  { lat:'Pembinaan',           ar:'التوجيه',            teks:'Pembinaan' },
  rekapbina:  { lat:'Rekap Pembinaan',     ar:'حصر التوجيه',        teks:'Rekap Pembinaan' },
  master:     { lat:'Master',              ar:'دليل المخالفات',     teks:'Master Pelanggaran & Bidang' },
  pengguna:   { lat:'Pengguna',            ar:'المستخدمون',         teks:'Manajemen Pengguna' }
};

// ---------------------------------------------------------------------
// 3. LAPISAN DATA (cache ringan + pagination PostgREST)
// ---------------------------------------------------------------------
const CACHE = {};
const TTL = 90_000;

function cacheGet(k) { const c = CACHE[k]; return (c && Date.now() - c.at < TTL) ? c.v : null; }
function cacheSet(k, v) { CACHE[k] = { v, at: Date.now() }; return v; }
function cacheHapus(...ks) {
  ks.forEach(k => {
    delete CACHE[k];
    if (k === 'siswa') { delete CACHE.petaSiswa; delete CACHE.kelas; }
  });
}

/** PostgREST membatasi 1000 baris per request; ambil bertahap. */
async function ambilSemua(tabel, select, atur) {
  const hasil = [], step = 1000;
  for (let from = 0; from < 40000; from += step) {
    let query = db.from(tabel).select(select).range(from, from + step - 1);
    if (atur?.order) query = query.order(atur.order, { ascending: atur.asc !== false });
    const { data, error } = await query;
    if (error) throw error;
    hasil.push(...(data || []));
    if (!data || data.length < step) break;
  }
  return hasil;
}

async function muatSiswa() {
  return cacheGet('siswa') || cacheSet('siswa',
    await ambilSemua('siswa', '*', { order: 'nama_siswa' }));
}

/** Peta NISN -> baris siswa, untuk menggabungkan data tanpa relasi PostgREST. */
async function petaSiswa() {
  const c = cacheGet('petaSiswa'); if (c) return c;
  const s = await muatSiswa();
  return cacheSet('petaSiswa', Object.fromEntries(s.map(x => [String(x.nisn), x])));
}

/**
 * Lengkapi kolom `siswa` di sisi klien.
 * Dipakai untuk tabel yang belum memiliki foreign key ke `siswa`,
 * sehingga PostgREST tidak bisa melakukan embed otomatis.
 */
async function lengkapiSiswa(rows) {
  if (!rows?.length || rows[0].siswa) return rows;
  const peta = await petaSiswa();
  return rows.map(r => ({ ...r, siswa: peta[String(r.nisn)] || null }));
}

/**
 * Coba ambil dengan relasi; bila relasi belum ada di skema, ulangi tanpa embed.
 * Membuat aplikasi tetap hidup meski FK belum dipasang di database.
 */
async function ambilDenganRelasi(tabel, selectRelasi, atur) {
  try {
    return await lengkapiSiswa(await ambilSemua(tabel, selectRelasi, atur));
  } catch (e) {
    if (!/relationship|schema cache/i.test(e.message || '')) throw e;
    console.warn(`[${tabel}] relasi ke siswa belum ada — digabungkan di sisi klien.`);
    return lengkapiSiswa(await ambilSemua(tabel, '*', atur));
  }
}

/** Jalankan loader; bila tabelnya belum ada, kembalikan array kosong. */
async function amanKosong(fn, nama) {
  try { return await fn(); }
  catch (e) { console.warn(`Data ${nama} tidak dapat dibaca:`, e.message); return []; }
}
async function muatDetail() {
  return cacheGet('detail') || cacheSet('detail',
    await ambilSemua('detail_data', '*', { order: 'tanggal', asc: false }));
}
async function muatIzin() {
  return cacheGet('izin') || cacheSet('izin',
    await ambilDenganRelasi('log_perizinan', '*, siswa(nama_siswa,kelas,jenjang)',
      { order: 'tanggal_mulai', asc: false }));
}
async function muatPembinaan() {
  return cacheGet('pembinaan') || cacheSet('pembinaan',
    await ambilDenganRelasi('log_pembinaan', '*, siswa(nama_siswa,kelas,jenjang)',
      { order: 'tanggal_pembinaan', asc: false }));
}
async function muatMaster() {
  return cacheGet('master') || cacheSet('master',
    await ambilSemua('master_pelanggaran', '*', { order: 'kode_pelanggaran' }));
}
async function muatBidang() {
  try {
    return cacheGet('bidang') || cacheSet('bidang',
      await ambilSemua('master_bidang', '*', { order: 'nama_bidang' }));
  } catch (e) { console.warn('master_bidang belum tersedia:', e.message); return cacheSet('bidang', []); }
}
async function muatDaftarKelas() {
  const c = cacheGet('kelas'); if (c) return c;
  const siswa = await muatSiswa();
  return cacheSet('kelas', [...new Set(siswa.map(s => s.kelas).filter(Boolean))].sort());
}

const aktifDetail = (r) => String(r.status || '').trim().toLowerCase() !== 'archived';
const aktifPembinaan = (r) => String(r.status_record || 'Active').trim().toLowerCase() !== 'archived';
const aktifSantri = (s) => !['nonaktif','inactive','archived']
  .includes(String(s.status_santri || 'Aktif').trim().toLowerCase());

// ---------------------------------------------------------------------
// 4. KONTEKS OPERASIONAL (Pengasuhan / Madrasah MTs / MA)
// ---------------------------------------------------------------------
function normalKonteks(unit, jenjang) {
  let u = ['Semua','Pengasuhan','Madrasah'].includes(unit) ? unit : 'Semua';
  let j = ['Semua','MTs','MA'].includes(jenjang) ? jenjang : 'Semua';
  if (u !== 'Madrasah') j = 'Semua';
  return { unit: u, jenjang: j };
}

function labelKonteks() {
  const { unit, jenjang } = APP.ctx;
  if (unit === 'Pengasuhan') return 'Pengasuhan';
  if (unit === 'Madrasah') return jenjang === 'Semua' ? 'Madrasah' : `Madrasah ${jenjang}`;
  return 'Semua Unit';
}

/** Akun dengan unit_akses/jenjang_akses terbatas tidak boleh pindah unit lain. */
function bolehKonteks(unit, jenjang) {
  const ua = APP.profil?.unit_akses || 'Semua';
  const ja = APP.profil?.jenjang_akses || 'Semua';
  if (ua !== 'Semua' && unit !== 'Semua' && ua !== unit) return false;
  if (unit === 'Madrasah' && ja !== 'Semua' && jenjang !== 'Semua' && ja !== jenjang) return false;
  return true;
}

function setKonteks(unit, jenjang, pindah) {
  const ctx = normalKonteks(unit, jenjang);
  if (!bolehKonteks(ctx.unit, ctx.jenjang)) {
    return toast('error', `Akun Anda tidak memiliki akses ke ${ctx.unit === 'Madrasah' ? labelKonteks() : ctx.unit}.`);
  }
  APP.ctx = ctx;
  try { sessionStorage.setItem('rq_ctx', JSON.stringify(ctx)); } catch (e) {}
  gambarBadgeKonteks();
  if (pindah) navigateTo(pindah); else navigateTo(APP.view);
}

function pulihkanKonteks() {
  try {
    const raw = sessionStorage.getItem('rq_ctx');
    if (raw) { const p = JSON.parse(raw); APP.ctx = normalKonteks(p.unit, p.jenjang); }
  } catch (e) { APP.ctx = { unit:'Semua', jenjang:'Semua' }; }
  const ua = APP.profil?.unit_akses || 'Semua';
  if (APP.ctx.unit === 'Semua' && ua !== 'Semua') {
    APP.ctx = normalKonteks(ua, APP.profil?.jenjang_akses || 'Semua');
  }
  if (!bolehKonteks(APP.ctx.unit, APP.ctx.jenjang)) APP.ctx = { unit:'Semua', jenjang:'Semua' };
  gambarBadgeKonteks();
}

function gambarBadgeKonteks() {
  const el = $('ctxLabel'); if (el) el.textContent = labelKonteks();
  $('ctxBadge').title = 'Unit operasional aktif: ' + labelKonteks();
}

/** Terapkan konteks + kelas binaan pada baris detail_data. */
function lingkupDetail(rows) {
  let out = (rows || []).filter(aktifDetail);
  const { unit, jenjang } = APP.ctx;
  if (unit === 'Pengasuhan') out = out.filter(r => String(r.sumber || '').trim() === 'Pengasuhan');
  if (unit === 'Madrasah') {
    out = out.filter(r => String(r.sumber || '').trim() === 'Madrasah');
    if (jenjang !== 'Semua') out = out.filter(r => String(r.jenjang || '').trim() === jenjang);
  }
  return filterBinaan(out, 'kelas');
}

/** Master pelanggaran yang relevan dengan konteks aktif. */
function lingkupMaster(rows) {
  let out = rows || [];
  const { unit, jenjang } = APP.ctx;
  if (unit !== 'Semua') out = out.filter(m => String(m.sumber || 'Pengasuhan').trim() === unit);
  if (unit === 'Madrasah' && jenjang !== 'Semua') {
    out = out.filter(m => { const j = String(m.jenjang || 'Semua').trim(); return !j || j === 'Semua' || j === jenjang; });
  }
  return out;
}

// ---------------------------------------------------------------------
// 5. LOGIKA PORTING: KASKADE KONVERSI & ANGKATAN
// ---------------------------------------------------------------------
/**
 * Konversi berjenjang yang dipakai buku peraturan dayah:
 * 5x pelanggaran Ringan sejenis -> 1x Sedang, 5x Sedang sejenis -> 1x Berat.
 * Sisa yang belum genap tetap ditampilkan pada kategori aslinya.
 */
function kaskadeKonversi(perKode) {
  const ringan = [], sedang = [], berat = [];
  perKode.forEach(v => {
    const c = { ...v };
    if (v.kategori === 'Ringan') ringan.push(c);
    else if (v.kategori === 'Sedang') sedang.push(c);
    else berat.push(c);
  });

  const hasilRingan = [];
  ringan.forEach(v => {
    const j = Number(v.jumlah) || 0, naik = Math.floor(j / 5), sisa = j % 5;
    if (sisa > 0) hasilRingan.push({ kategori:'Ringan', deskripsi:v.deskripsi, jumlah:sisa });
    if (naik > 0) sedang.push({ kategori:'Sedang', deskripsi:`Mengulangi 5 kali pelanggaran "${v.deskripsi}"`, jumlah:naik });
  });

  const hasilSedang = [];
  sedang.forEach(v => {
    const j = Number(v.jumlah) || 0, naik = Math.floor(j / 5), sisa = j % 5;
    if (sisa > 0) hasilSedang.push({ kategori:'Sedang', deskripsi:v.deskripsi, jumlah:sisa });
    if (naik > 0) berat.push({ kategori:'Berat', deskripsi:`Mengulangi 5 kali pelanggaran "${v.deskripsi}"`, jumlah:naik });
  });

  const hasilBerat = berat
    .map(v => ({ kategori: v.kategori || 'Berat', deskripsi: v.deskripsi || '-', jumlah: Number(v.jumlah) || 0 }))
    .filter(v => v.jumlah > 0);

  return hasilRingan.concat(hasilSedang, hasilBerat);
}

/** Rekap per santri dari baris detail_data. */
function rekapPerSantri(rows) {
  const peta = new Map();
  rows.forEach(r => {
    const nisn = String(r.nisn || '').trim(); if (!nisn) return;
    if (!peta.has(nisn)) peta.set(nisn, {
      nisn, nama: r.nama_siswa || '', kelas: r.kelas || '-', perKode: new Map()
    });
    const e = peta.get(nisn);
    const kode = String(r.kode_pelanggaran || r.nama_pelanggaran || '').trim(); if (!kode) return;
    if (!e.perKode.has(kode)) e.perKode.set(kode, {
      kategori: r.kategori || '-', deskripsi: r.nama_pelanggaran || kode, jumlah: 0
    });
    e.perKode.get(kode).jumlah++;
  });

  const out = [];
  peta.forEach(e => {
    const daftar = kaskadeKonversi(e.perKode);
    if (daftar.length) out.push({ nisn:e.nisn, nama:e.nama, kelas:e.kelas, daftar });
  });
  out.sort((a, b) =>
    b.daftar.reduce((s,x)=>s+x.jumlah,0) - a.daftar.reduce((s,x)=>s+x.jumlah,0));
  return out;
}

/** Tentukan angkatan (VII–XII) dari nama kelas. */
function angkatanDariKelas(kelas) {
  const raw = String(kelas || '').trim().toUpperCase().replace(/[._\-\/]+/g,' ').replace(/\s+/g,' ');
  if (!raw) return '';
  const rom = raw.match(/^(VII|VIII|IX|XII|XI|X)(?:\b|\s)/);
  if (rom) return rom[1];
  const num = raw.match(/^(7|8|9|10|11|12)(?:\b|\s)/);
  if (!num) return '';
  return { '7':'VII','8':'VIII','9':'IX','10':'X','11':'XI','12':'XII' }[num[1]] || '';
}

/** Rentang 3 bulan terakhir. */
function rentang3Bulan() {
  const akhir = new Date(); akhir.setHours(23,59,59,999);
  const mulai = new Date(); mulai.setHours(0,0,0,0); mulai.setMonth(mulai.getMonth() - 3);
  return { mulai, akhir };
}

// ---------------------------------------------------------------------
// 6. MESIN PANEL SARAN / AUTOCOMPLETE
//     Menggantikan <datalist> bawaan browser dengan panel kartu bertema.
// ---------------------------------------------------------------------
function cariLokal(list, kata, fields, limit = 30) {
  const s = (kata || '').trim().toLowerCase();
  const hasil = !s ? list : list.filter(it => fields.some(f => String(it[f] || '').toLowerCase().includes(s)));
  return hasil.slice(0, limit);
}

function lampirkanSaran(input, opsi) {
  const { ambil, keItem, keTeks, onPilih, minKetik = 0, kosong = 'Tidak ditemukan.' } = opsi;

  const wrap = document.createElement('div');
  wrap.className = 'ac-wrap';
  input.parentNode.insertBefore(wrap, input);
  wrap.appendChild(input);

  const panel = document.createElement('div');
  panel.className = 'ac-panel hidden';
  wrap.appendChild(panel);

  let items = [], aktif = -1;

  const tutup = () => { panel.classList.add('hidden'); panel.innerHTML = ''; aktif = -1; };

  function tandai() {
    panel.querySelectorAll('.ac-item').forEach(el =>
      el.classList.toggle('active', Number(el.dataset.i) === aktif));
    panel.querySelector('.ac-item.active')?.scrollIntoView({ block:'nearest' });
  }

  function pilih(item) {
    input.value = keTeks(item);
    tutup();
    onPilih?.(item);
  }

  function render(list) {
    items = list; aktif = -1;
    if (!list.length) {
      panel.innerHTML = `<div class="ac-empty"><i class="fa-solid fa-magnifying-glass"></i> ${esc(kosong)}</div>`;
      panel.classList.remove('hidden'); return;
    }
    panel.innerHTML = list.map((it, i) => {
      const v = keItem(it);
      return `<div class="ac-item" data-i="${i}">
        <div class="ac-avatar${v.warna ? ' ' + v.warna : ''}">${v.huruf}</div>
        <div class="ac-body">
          <div class="ac-name">${v.judul}</div>
          ${v.sub ? `<div class="ac-meta">${v.sub}</div>` : ''}
        </div>
        <i class="fa-solid fa-chevron-right"></i>
      </div>`;
    }).join('');
    panel.classList.remove('hidden');
  }

  const proses = debounce(async () => {
    const s = input.value.trim();
    if (s.length < minKetik) return tutup();
    panel.innerHTML = '<div class="ac-loading"><i class="fa-solid fa-circle-notch fa-spin"></i>Mencari…</div>';
    panel.classList.remove('hidden');
    try { render(await ambil(s)); }
    catch (e) { panel.innerHTML = '<div class="ac-empty">Gagal memuat data.</div>'; }
  }, 200);

  input.addEventListener('input', () => { delete input.dataset.picked; delete input.dataset.kode; proses(); });
  input.addEventListener('focus', proses);
  input.addEventListener('keydown', (e) => {
    if (panel.classList.contains('hidden') || !items.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); aktif = Math.min(aktif + 1, items.length - 1); tandai(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); aktif = Math.max(aktif - 1, 0); tandai(); }
    else if (e.key === 'Enter' && aktif >= 0) { e.preventDefault(); pilih(items[aktif]); }
    else if (e.key === 'Escape') tutup();
  });
  panel.addEventListener('mousedown', (e) => {
    const it = e.target.closest('.ac-item'); if (!it) return;
    e.preventDefault(); pilih(items[Number(it.dataset.i)]);
  });

  // Satu listener global saja; panel yang sudah lepas dari DOM diabaikan.
  SARAN.push({ wrap, tutup });
}

const SARAN = [];
document.addEventListener('click', (e) => {
  for (let i = SARAN.length - 1; i >= 0; i--) {
    const s = SARAN[i];
    if (!document.contains(s.wrap)) { SARAN.splice(i, 1); continue; }
    if (!s.wrap.contains(e.target)) s.tutup();
  }
}, true);

/** Cari santri langsung ke Supabase (dipakai di form input). */
async function cariSantriRingkas(s) {
  const bersih = s.trim().replace(/[%,()]/g, '');
  if (bersih.length < 2) return [];
  const { data } = await db.from('siswa')
    .select('nisn,nama_siswa,kelas,jenjang')
    .or(`nama_siswa.ilike.%${bersih}%,nisn.ilike.%${bersih}%`)
    .limit(15);
  return filterBinaan(data || [], 'kelas');
}

function saranSantri(input, onPilih) {
  lampirkanSaran(input, {
    ambil: cariSantriRingkas,
    minKetik: 2,
    kosong: 'Santri tidak ditemukan.',
    keItem: (it) => ({
      huruf: esc((it.nama_siswa || '?').charAt(0).toUpperCase()),
      judul: esc(it.nama_siswa),
      sub: `${esc(it.nisn)} · ${esc(it.kelas || '-')}${it.jenjang ? ' · ' + esc(it.jenjang) : ''}`
    }),
    keTeks: (it) => `${it.nisn} - ${it.nama_siswa}`,
    onPilih: (it) => { input.dataset.picked = it.nisn; onPilih?.(it); }
  });
}

function saranPelanggaran(input, onPilih) {
  const warna = (k) => k === 'Ringan' ? 'kat-ringan' : k === 'Sedang' ? 'kat-sedang' : 'kat-berat';
  lampirkanSaran(input, {
    ambil: async (kata) => cariLokal(lingkupMaster(await muatMaster()), kata,
      ['kode_pelanggaran','nama_pelanggaran','kategori','bidang'], 40),
    minKetik: 0,
    kosong: 'Jenis pelanggaran tidak ditemukan pada unit ini.',
    keItem: (m) => ({
      huruf: esc((m.kategori || '?').charAt(0)),
      warna: warna(m.kategori),
      judul: `${esc(m.kode_pelanggaran)} — ${esc(m.nama_pelanggaran)}`,
      sub: `${esc(m.kategori)} · ${m.bobot_poin} poin · ${esc(m.bidang || '-')} · ${esc(m.jenjang || 'Semua')}`
    }),
    keTeks: (m) => `${m.kode_pelanggaran} — ${m.nama_pelanggaran}`,
    onPilih: (m) => { input.dataset.kode = m.kode_pelanggaran; onPilih?.(m); }
  });
}

function saranBidang(input, onPilih) {
  lampirkanSaran(input, {
    ambil: async (kata) => {
      let list = (await muatBidang()).filter(b =>
        String(b.aktif || 'Ya').toLowerCase() !== 'tidak');
      if (APP.ctx.unit !== 'Semua') list = list.filter(b => String(b.sumber || '') === APP.ctx.unit);
      return cariLokal(list, kata, ['nama_bidang','kata_kunci','deskripsi'], 30);
    },
    minKetik: 0,
    kosong: 'Bidang tidak ditemukan.',
    keItem: (b) => ({
      huruf: esc((b.nama_bidang || '?').charAt(0).toUpperCase()),
      judul: esc(b.nama_bidang),
      sub: `${esc(b.sumber || '-')} · ${esc(b.jenjang || 'Semua')}${b.kata_kunci ? ' · ' + esc(b.kata_kunci) : ''}`
    }),
    keTeks: (b) => b.nama_bidang,
    onPilih: (b) => { input.dataset.picked = b.nama_bidang; onPilih?.(b); }
  });
}

function saranKelas(input, onPilih) {
  lampirkanSaran(input, {
    ambil: async (kata) => {
      const semua = await muatDaftarKelas();
      const daftar = [{ nilai:'', label:'Semua Kelas' }, ...semua.map(k => ({ nilai:k, label:k }))];
      return cariLokal(daftar, kata, ['label'], 40);
    },
    minKetik: 0,
    kosong: 'Kelas tidak ditemukan.',
    keItem: (k) => ({ huruf: k.nilai ? esc(k.nilai.charAt(0).toUpperCase()) : '∗', judul: esc(k.label) }),
    keTeks: (k) => k.label,
    onPilih: (k) => onPilih?.(k.nilai)
  });
}

// ---------------------------------------------------------------------
// 7. AUTENTIKASI
// ---------------------------------------------------------------------
$('formLogin').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('btnLogin');
  const u = $('loginUsername').value.trim();
  const p = $('loginPassword').value;
  const email = u.includes('@') ? u : `${u}@${DOMAIN_INTERNAL}`;

  const asli = { html: btn.innerHTML, disabled: false };
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i><span>Memproses…</span>';
  try {
    const { error } = await db.auth.signInWithPassword({ email, password: p });
    if (error) throw new Error('Username atau password salah.');
    await masukAplikasi();
  } catch (err) {
    toast('error', err.message);
  } finally {
    btn.disabled = asli.disabled;
    btn.innerHTML = asli.html;
  }
});

$('btnLogout').addEventListener('click', async () => {
  const r = await Swal.fire({ icon:'question', title:'Keluar dari aplikasi?',
    showCancelButton:true, confirmButtonText:'Ya, keluar', cancelButtonText:'Batal',
    confirmButtonColor:'#9F1239' });
  if (!r.isConfirmed) return;
  if (APP.channel) db.removeChannel(APP.channel);
  try { sessionStorage.removeItem('rq_ctx'); } catch (e) {}
  await db.auth.signOut();
  location.reload();
});

async function masukAplikasi() {
  const { data: { user } } = await db.auth.getUser();
  if (!user) return;

  const { data: profil, error } = await db.from('profiles').select('*').eq('id', user.id).single();
  if (error || !profil) {
    await db.auth.signOut();
    return fireError(new Error('Profil pengguna belum dibuat. Hubungi Admin.'));
  }
  if (!profil.aktif) {
    await db.auth.signOut();
    return fireError(new Error('Akun ini dinonaktifkan.'));
  }

  APP.profil = profil;

  $('loginScreen').classList.add('hidden');
  $('appShell').classList.remove('hidden');
  $('profileName').textContent = profil.nama;
  $('profileRole').textContent = profil.role +
    (profil.kelas_binaan?.length ? ' · ' + profil.kelas_binaan.join(', ') : '');
  $('profileInitial').textContent = (profil.nama || '?').charAt(0).toUpperCase();

  document.querySelectorAll('.nav-item[data-view]').forEach(b => {
    b.classList.toggle('hidden', !(MENU_ROLE[b.dataset.view] || []).includes(profil.role));
  });

  // Pimpinan: shell disederhanakan, hanya dashboard eksekutif.
  if (role() === 'Pimpinan') {
    document.querySelectorAll('#navMenu .sb-group').forEach(p => p.classList.add('hidden'));
    $('ctxBadge').classList.add('hidden');
  }

  pulihkanKonteks();
  aktifkanRealtime();
  refreshBadgePending();
  navigateTo(role() === 'Pimpinan' ? 'pimpinan' : 'dashboard');
}

db.auth.onAuthStateChange((event) => {
  if (event === 'SIGNED_OUT' && APP.profil) location.reload();
});

// Visual login opsional
(function visualLogin() {
  if (ASET.foto) {
    const art = $('loginArt');
    art.style.setProperty('--photo', `url("${ASET.foto.replace(/"/g,'\\"')}")`);
    art.classList.add('ready');
  }
  if (ASET.logo) {
    const img = $('loginLogo');
    img.src = ASET.logo;
    img.onload = () => img.classList.add('ready');
  }
})();

// ---------------------------------------------------------------------
// 8. NAVIGASI & ROUTER KLIK TUNGGAL
// ---------------------------------------------------------------------
$('navMenu').addEventListener('click', (e) => {
  const btn = e.target.closest('.nav-item[data-view]');
  if (!btn) return;
  navigateTo(btn.dataset.view);
  tutupSidebar();
});

$('btnBurger').addEventListener('click', () => {
  $('sidebar').classList.toggle('open');
  $('scrim').classList.toggle('hidden');
});
$('scrim').addEventListener('click', tutupSidebar);
document.addEventListener('keydown', e => { if (e.key === 'Escape') tutupSidebar(); });
function tutupSidebar() {
  $('sidebar').classList.remove('open');
  $('scrim').classList.add('hidden');
}

/**
 * Satu listener klik untuk seluruh area konten.
 * Setiap view mendaftarkan handler-nya sendiri lewat onKlik(),
 * sehingga listener tidak menumpuk setiap kali tabel dirender ulang.
 */
$('viewRoot').addEventListener('click', (e) => { APP.onKlik?.(e); });
function onKlik(fn) { APP.onKlik = fn; }

async function navigateTo(view) {
  if (!(MENU_ROLE[view] || []).includes(role())) {
    toast('error', `Role ${role()} tidak memiliki akses ke menu ini.`);
    view = role() === 'Pimpinan' ? 'pimpinan' : 'dashboard';
  }
  APP.view = view;
  APP.onKlik = null;

  const j = JUDUL[view] || { lat:view, ar:'', teks:view };
  $('pageTitle').textContent = j.teks;
  $('pageEyebrow').querySelector('.ar').textContent = j.ar;
  $('pageEyebrow').querySelector('.lat').textContent = j.lat;

  document.querySelectorAll('.nav-item[data-view]').forEach(b =>
    b.classList.toggle('active', b.dataset.view === view));

  Object.values(APP.charts).forEach(c => { try { c.destroy(); } catch(e){} });
  APP.charts = {};

  loading(true);
  try {
    if (view === 'dashboard')        await viewDashboard();
    else if (view === 'pimpinan')    await viewPimpinan();
    else if (view === 'siswa')       await viewSiswa();
    else if (view === 'pelanggaran') await viewPelanggaran();
    else if (view === 'rekap')       await viewRekap();
    else if (view === 'pengasuhan') await viewPengasuhan();
    else if (view === 'madrasah')    await viewMadrasah();     // <— baris baru
    else if (view === 'perizinan')   await viewPerizinan();
    else if (view === 'pembinaan')   await viewPembinaan();
    else if (view === 'rekapbina')   await viewRekapPembinaan();
    else if (view === 'master')      await viewMaster();
    else if (view === 'pengguna')    await viewPengguna();
    tandaiTabelBisaGeser();
  } catch (err) { fireError(err); }
  finally { loading(false); }
}

/** Petunjuk geser untuk tabel lebar di layar kecil. */
function tandaiTabelBisaGeser() {
  requestAnimationFrame(() => {
    document.querySelectorAll('.tbl').forEach(w => {
      const hint = w.parentElement?.querySelector('.scroll-hint');
      if (hint) hint.classList.toggle('on', w.scrollWidth > w.clientWidth + 4);
    });
  });
}

// ---------------------------------------------------------------------
// 9. KOMPONEN BERSAMA
// ---------------------------------------------------------------------
const tagKategori = (k) => k === 'Ringan' ? 'tag-ringan' : k === 'Sedang' ? 'tag-sedang' : 'tag-berat';
const tagIzin = (s) => s === 'Sesuai Waktu' ? 'tag-ok' : s === 'Telat Balik' ? 'tag-berat' : 'tag-wait';

function stat(label, nilai, ikon, warna, aksen, kaki) {
  return `<div class="stat rise" style="--accent:${aksen}">
    <div class="ico" style="${warna}"><i class="${ikon}"></i></div>
    <p class="k">${esc(label)}</p>
    <p class="v">${nilai}</p>
    ${kaki ? `<p class="f">${kaki}</p>` : ''}
  </div>`;
}

function kartu(judul, isi, aksi, sub) {
  return `<section class="card">
    <div class="card-head">
      <div><h3>${esc(judul)}</h3>${sub ? `<p class="sub">${esc(sub)}</p>` : ''}</div>
      <div class="actions">${aksi || ''}</div>
    </div>${isi}</section>`;
}

function kosong(judul, sub, ikon) {
  return `<div class="empty"><i class="fa-solid ${ikon || 'fa-inbox'}"></i>
    <p>${esc(judul)}</p><small>${esc(sub || '')}</small></div>`;
}

function barisKosong(kolom, judul, sub) {
  return `<tr><td colspan="${kolom}" style="padding:0">${kosong(judul, sub)}</td></tr>`;
}

function pager(id, page, total, size) {
  const pages = Math.max(1, Math.ceil(total / size));
  return `<div class="pager">
    <span class="info">Halaman ${page} / ${pages} · ${angka(total)} data</span>
    <span class="btns">
      <button class="btn btn-ghost btn-sm" ${page<=1?'disabled':''} data-pg="${id}:${page-1}">
        <i class="fa-solid fa-chevron-left"></i>Sebelumnya</button>
      <button class="btn btn-ghost btn-sm" ${page>=pages?'disabled':''} data-pg="${id}:${page+1}">
        Berikutnya<i class="fa-solid fa-chevron-right"></i></button>
    </span></div>`;
}

function chartBox(id, tinggi) {
  return `<div class="card-body"><div class="chart-box${tinggi ? ' tall' : ''}"><canvas id="${id}"></canvas></div></div>`;
}

const PALET = ['#14618B','#0F766E','#B45309','#9F1239','#5B21B6','#C9A227','#1B7AAD','#0B2B45'];

function buatChart(key, canvasId, config) {
  const el = $(canvasId); if (!el) return;
  try { APP.charts[key]?.destroy(); } catch (e) {}
  Chart.defaults.font.family = "'Inter Tight', system-ui, sans-serif";
  Chart.defaults.color = '#4A6076';
  APP.charts[key] = new Chart(el, config);
}

/** Unduh CSV (pemisah titik koma agar langsung rapi di Excel Indonesia). */
function unduhCsv(nama, baris) {
  const sel = v => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[";\n]/.test(s) ? '"' + s.replace(/"/g,'""') + '"' : s;
  };
  const isi = '\uFEFF' + baris.map(r => r.map(sel).join(';')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([isi], { type:'text/csv;charset=utf-8;' }));
  a.download = nama; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
  toast('success', 'Berkas CSV diunduh');
}

// ---------------------------------------------------------------------
// 10. DASHBOARD
// ---------------------------------------------------------------------
function kartuUnit() {
  if (role() === 'Pimpinan') return '';
  const daftar = [
    { unit:'Pengasuhan', jenjang:'Semua', kelas:'', ar:'التربية والانضباط', judul:'Pengasuhan',
      sub:'Ubudiyah · Bahasa · Kebersihan · Keamanan', ikon:'fa-mosque' },
    { unit:'Madrasah', jenjang:'MTs', kelas:'mts', ar:'التعليم والتعلّم', judul:'Madrasah MTs',
      sub:'Atribut · Kedisiplinan · Pelanggaran sekolah', ikon:'fa-school' },
    { unit:'Madrasah', jenjang:'MA', kelas:'ma', ar:'التعليم والتعلّم', judul:'Madrasah MA',
      sub:'Atribut · Kedisiplinan · Pelanggaran sekolah', ikon:'fa-graduation-cap' }
  ].filter(c => bolehKonteks(c.unit, c.jenjang));

  if (!daftar.length) return '';

  return `<div class="unit-wrap">
    <div class="unit-head">
      <div>
        <div class="eyebrow"><span class="ar">اختر القسم</span><span class="rule"></span>
          <span class="lat">Bidang Pencatatan</span></div>
        <h3>Pilih unit yang sedang Anda kerjakan</h3>
        <p>Pengasuhan dan Madrasah dipisahkan saat input, namun tetap digabung
           pada laporan perkembangan santri.</p>
      </div>
      <button class="btn btn-ghost btn-sm" data-ctx="Semua|Semua">
        <i class="fa-solid fa-layer-group"></i>Semua Unit</button>
    </div>
    <div class="unit-grid">
      ${daftar.map(c => {
        const on = APP.ctx.unit === c.unit && (c.unit !== 'Madrasah' || APP.ctx.jenjang === c.jenjang);
        return `<button class="unit-card ${c.kelas}${on ? ' on' : ''}" data-ctx="${c.unit}|${c.jenjang}">
          <div class="ico"><i class="fa-solid ${c.ikon}"></i></div>
          <span class="ar">${c.ar}</span>
          <b>${c.judul}</b>
          <small>${c.sub}</small>
          <span class="go">${on ? 'Sedang aktif' : 'Aktifkan unit'} <i class="fa-solid fa-arrow-right"></i></span>
        </button>`;
      }).join('')}
    </div></div>`;
}

async function viewDashboard() {
  const [siswaAll, detailAll, izinAll, pembinaanAll] = await Promise.all([
    amanKosong(muatSiswa, 'santri'),
    amanKosong(muatDetail, 'pelanggaran'),
    amanKosong(muatIzin, 'perizinan'),
    amanKosong(muatPembinaan, 'pembinaan')
  ]);

  const siswa = filterBinaan(siswaAll.filter(aktifSantri), 'kelas');
  const detail = lingkupDetail(detailAll);
  const nisnBoleh = new Set(siswa.map(s => String(s.nisn)));
  const izin = perluFilterKelas() ? izinAll.filter(z => nisnBoleh.has(String(z.nisn))) : izinAll;
  const pembinaan = filterBinaan(
    pembinaanAll.filter(aktifPembinaan).map(p => ({ ...p, kelas: p.siswa?.kelas || '' })), 'kelas');

  const izinPending = izin.filter(z => z.status_persetujuan === 'Pending').length;
  const izinSesuai  = izin.filter(z => z.status_persetujuan === 'Sesuai Waktu').length;
  const izinTelat   = izin.filter(z => z.status_persetujuan === 'Telat Balik').length;
  const binaProses  = pembinaan.filter(p => p.status_pembinaan !== 'Selesai').length;

  // ---- Agregasi 3 bulan ----
  const { mulai, akhir } = rentang3Bulan();
  const angkatanList = ['VII','VIII','IX','X','XI','XII'];
  const pekanPeta = {}, pekanKunci = [];
  for (let c = awalPekan(mulai); c <= awalPekan(akhir); c = tambahHari(c, 7)) {
    const k = kunciTgl(c); pekanKunci.push(k); pekanPeta[k] = 0;
  }
  const perKategori = { Ringan:0, Sedang:0, Berat:0 };
  const perBidang = {}, perJenis = {}, angkatanPekan = {};
  angkatanList.forEach(a => angkatanPekan[a] = Object.fromEntries(pekanKunci.map(k => [k, 0])));

  detail.forEach(r => {
    const d = tglDari(kunciTgl(r.tanggal));
    if (!d || d < mulai || d > akhir) return;
    const wk = kunciTgl(awalPekan(d));
    if (wk in pekanPeta) pekanPeta[wk]++;
    const kat = r.kategori;
    if (kat in perKategori) perKategori[kat]++;
    const bid = String(r.bidang || 'Belum Dipetakan').trim() || 'Belum Dipetakan';
    perBidang[bid] = (perBidang[bid] || 0) + 1;
    const jenis = String(r.nama_pelanggaran || r.kode_pelanggaran || '-').trim();
    perJenis[jenis] = (perJenis[jenis] || 0) + 1;
    const ang = angkatanDariKelas(r.kelas);
    if (angkatanPekan[ang] && (wk in angkatanPekan[ang])) angkatanPekan[ang][wk]++;
  });

  const bidangUrut = Object.entries(perBidang).sort((a,b) => b[1]-a[1]).slice(0, 8);
  const topJenis = Object.entries(perJenis).sort((a,b) => b[1]-a[1]).slice(0, 5);

  // Trend izin 14 hari berdasarkan tanggal_mulai (santri unik per hari)
  const hari14 = [], petaIzinHari = {};
  for (let i = 13; i >= 0; i--) { const k = kunciTgl(tambahHari(new Date(), -i)); hari14.push(k); petaIzinHari[k] = new Set(); }
  izin.forEach(z => { const k = kunciTgl(z.tanggal_mulai); if (petaIzinHari[k]) petaIzinHari[k].add(String(z.nisn)); });

  $('viewRoot').innerHTML = `
    ${kartuUnit()}

    <div class="stats">
      ${stat('Santri Aktif', angka(siswa.length), 'fa-solid fa-user-group',
        'background:#E7F1F7;color:var(--sea)', 'var(--sea)',
        perluFilterKelas() ? 'Kelas binaan Anda' : 'Seluruh dayah')}
      ${stat('Pelanggaran', angka(detail.length), 'fa-solid fa-scale-balanced',
        'background:var(--maroon-bg);color:var(--maroon)', 'var(--maroon)', labelKonteks())}
      ${stat('Izin Menunggu', angka(izinPending), 'fa-solid fa-clock',
        'background:var(--amber-bg);color:var(--amber)', 'var(--amber)', 'Belum ada keterangan balik')}
      ${stat('Pembinaan Proses', angka(binaProses), 'fa-solid fa-hands-holding-child',
        'background:var(--violet-bg);color:var(--violet)', 'var(--violet)', `${angka(pembinaan.length)} total instruksi`)}
    </div>

    <div class="grid-2">
      ${kartu('Gelombang Pelanggaran Mingguan', chartBox('chPekan'),
        `<span class="tag tag-sea">3 bulan terakhir</span>`,
        'Akumulasi Senin–Minggu untuk melihat momentum kenaikan atau penurunan.')}
      ${kartu('Proporsi Kategori', chartBox('chKategori'), '',
        'Ringan · Sedang · Berat')}
    </div>

    <div class="grid-2">
      ${kartu('Tren per Angkatan', chartBox('chAngkatan'), '',
        'Perbandingan VII–XII sepanjang 3 bulan terakhir.')}
      ${kartu('5 Pelanggaran Terbanyak', `<div class="card-body">
        ${topJenis.map(([nama, jml], i) => `<div class="rank">
          <span class="n">${String(i+1).padStart(2,'0')}</span>
          <span class="t">${esc(nama)}</span>
          <span class="c">${jml}x</span></div>`).join('')
          || '<p style="color:var(--text-3);text-align:center;padding:20px 0">Belum ada data.</p>'}
      </div>`)}
    </div>

    <div class="grid-2">
      ${kartu('Pelanggaran per Bidang', chartBox('chBidang'), '',
        'Konsentrasi kasus per divisi peraturan.')}
      ${kartu('Kedisiplinan Perizinan', `
        <div class="minis" style="padding-bottom:16px">
          <div class="mini t"><span>Sesuai Waktu</span><b>${angka(izinSesuai)}</b></div>
          <div class="mini m"><span>Telat Balik</span><b>${angka(izinTelat)}</b></div>
          <div class="mini a"><span>Menunggu</span><b>${angka(izinPending)}</b></div>
          <div class="mini s"><span>Total Izin</span><b>${angka(izin.length)}</b></div>
        </div>
        ${chartBox('chIzin')}`, '', 'Santri unik yang mulai izin, 14 hari terakhir.')}
    </div>`;

  onKlik(async (e) => {
    const c = e.target.closest('[data-ctx]');
    if (c) {
      const [u, j] = c.dataset.ctx.split('|');
      setKonteks(u, j, u === 'Pengasuhan' ? 'pengasuhan' : u === 'Madrasah' ? 'madrasah' : null);
    }
  });

  // ---- Charts ----
  buatChart('pekan', 'chPekan', {
    type:'line',
    data:{ labels: pekanKunci.map(labelPekan), datasets:[{
      label:'Pelanggaran / minggu', data: pekanKunci.map(k => pekanPeta[k]),
      borderColor:'#14618B', backgroundColor:'rgba(20,97,139,.12)',
      tension:.38, fill:true, pointRadius:3, borderWidth:2.5, cubicInterpolationMode:'monotone' }]},
    options:{ responsive:true, maintainAspectRatio:false,
      plugins:{legend:{display:false}},
      scales:{ x:{ grid:{display:false}, ticks:{ maxTicksLimit: window.innerWidth < 640 ? 5 : 9, maxRotation:0 } },
               y:{ beginAtZero:true, ticks:{precision:0} } } }
  });

  buatChart('kategori', 'chKategori', {
    type:'doughnut',
    data:{ labels:['Ringan','Sedang','Berat'],
      datasets:[{ data:[perKategori.Ringan, perKategori.Sedang, perKategori.Berat],
        backgroundColor:['#0F766E','#B45309','#9F1239'], borderWidth:0 }]},
    options:{ responsive:true, maintainAspectRatio:false, cutout:'64%',
      plugins:{legend:{position:'bottom', labels:{usePointStyle:true, boxWidth:9}}} }
  });

  buatChart('angkatan', 'chAngkatan', {
    type:'line',
    data:{ labels: pekanKunci.map(labelPekan),
      datasets: angkatanList.map((a, i) => ({
        label:'Angkatan ' + a, data: pekanKunci.map(k => angkatanPekan[a][k]),
        borderColor: PALET[i % PALET.length], backgroundColor: PALET[i % PALET.length] + '20',
        borderWidth:2, tension:.35, pointRadius:0, pointHoverRadius:4, spanGaps:true })) },
    options:{ responsive:true, maintainAspectRatio:false,
      interaction:{ mode:'index', intersect:false },
      plugins:{legend:{position:'bottom', labels:{usePointStyle:true, boxWidth:8, padding:12}}},
      scales:{ x:{ grid:{display:false}, ticks:{maxTicksLimit:6, maxRotation:0} },
               y:{ beginAtZero:true, ticks:{precision:0} } } }
  });

  buatChart('bidang', 'chBidang', {
    type:'bar',
    data:{ labels: bidangUrut.map(b => b[0]),
      datasets:[{ label:'Kasus', data: bidangUrut.map(b => b[1]),
        backgroundColor:'#1B7AAD', borderRadius:6 }]},
    options:{ indexAxis:'y', responsive:true, maintainAspectRatio:false,
      plugins:{legend:{display:false}}, scales:{ x:{beginAtZero:true, ticks:{precision:0}},
      y:{grid:{display:false}} } }
  });

  buatChart('izin', 'chIzin', {
    type:'bar',
    data:{ labels: hari14.map(k => k.slice(8) + '/' + k.slice(5,7)),
      datasets:[{ label:'Santri mulai izin', data: hari14.map(k => petaIzinHari[k].size),
        backgroundColor:'#0F766E', borderRadius:5 }]},
    options:{ responsive:true, maintainAspectRatio:false,
      plugins:{legend:{display:false}},
      scales:{ x:{grid:{display:false}}, y:{beginAtZero:true, ticks:{precision:0}} } }
  });
}

// ---------------------------------------------------------------------
// 11. DASHBOARD PIMPINAN (port dari HAL.gs — dihitung di browser)
// ---------------------------------------------------------------------
function analisisEksekutif({ detail30, detailPrev30, bidangUrut, angkatan, izinStat, binaStat, kritis, perhatian }) {
  const catatan = [];
  const ubah = detailPrev30 === 0
    ? (detail30 === 0 ? 0 : null)
    : Math.round(((detail30 - detailPrev30) / detailPrev30) * 1000) / 10;

  if (ubah === null) {
    catatan.push({ level:'warn', judul:'Tren pelanggaran 30 hari',
      teks:'Belum ada basis 30 hari sebelumnya yang cukup untuk menghitung perubahan.',
      rek:'Gunakan pemantauan mingguan sampai basis pembanding terbentuk.' });
  } else if (ubah > 10) {
    catatan.push({ level:'danger', judul:'Pelanggaran meningkat',
      teks:`Jumlah pelanggaran 30 hari terakhir naik ${Math.abs(ubah)}% dibanding 30 hari sebelumnya.`,
      rek:'Prioritaskan evaluasi angkatan dan bidang paling dominan pada rapat pengasuhan terdekat.' });
  } else if (ubah < -10) {
    catatan.push({ level:'ok', judul:'Pelanggaran menurun',
      teks:`Jumlah pelanggaran 30 hari terakhir turun ${Math.abs(ubah)}% dibanding periode sebelumnya.`,
      rek:'Pertahankan pola pengawasan dan pembinaan yang sedang berjalan.' });
  } else {
    catatan.push({ level:'info', judul:'Tren relatif stabil',
      teks:`Perubahan berada pada kisaran ${ubah >= 0 ? '+' : ''}${ubah}% dibanding periode sebelumnya.`,
      rek:'Fokuskan intervensi pada bidang dan angkatan dengan konsentrasi kasus tertinggi.' });
  }

  const dom = bidangUrut[0];
  if (dom) {
    catatan.push({ level: dom.persen >= 30 ? 'warn' : 'info', judul:'Bidang dominan: ' + dom.nama,
      teks:`${dom.nama} menyumbang ${dom.persen}% dari pelanggaran periode ini (${dom.jumlah} kasus).`,
      rek:'Evaluasi aturan, pola pengawasan, dan waktu kejadian khusus pada bidang ini.' });
  }

  const topAng = angkatan.filter(a => a.jumlahSantri > 0 && a.kasus > 0)
    .sort((a,b) => b.per100 - a.per100)[0];
  if (topAng) {
    catatan.push({ level:'warn', judul:'Angkatan perlu perhatian: ' + topAng.angkatan,
      teks:`Angkatan ${topAng.angkatan} mencatat ${topAng.per100} kasus per 100 santri — tertinggi secara relatif.`,
      rek:'Periksa kelas penyumbang utama dan koordinasikan pembinaan bersama wali kelas/wali asuh.' });
  }

  if (izinStat.telat > 0) {
    catatan.push({ level: izinStat.rate >= 20 ? 'danger' : 'warn', judul:'Kedisiplinan kembali dari izin',
      teks:`${izinStat.telat} izin tercatat Telat Balik (${izinStat.rate}% dari izin yang sudah memiliki keterangan balik).`,
      rek:'Evaluasi pola pemberian izin dan santri yang berulang kali terlambat kembali.' });
  }

  if (binaStat.proses > 0) {
    catatan.push({ level:'info', judul:'Pembinaan masih berjalan',
      teks:`${binaStat.proses} catatan pembinaan berstatus Dalam Proses.`,
      rek:'Pastikan setiap pembinaan memiliki tindak lanjut dan penutupan status setelah evaluasi.' });
  }

  if (kritis > 0 || perhatian > 0) {
    catatan.push({ level: kritis > 0 ? 'danger' : 'warn', judul:'Santri prioritas pembinaan',
      teks:`${kritis} santri tier Kritis dan ${perhatian} santri tier Perhatian Tinggi.`,
      rek:'Tinjau daftar prioritas bersama pengasuhan, madrasah, dan BK, lalu tentukan tindak lanjut per santri.' });
  }

  return { catatan, ubah };
}

async function viewPimpinan() {
  const [siswaAll, detailAll, izinAll, pembinaanAll] = await Promise.all([
    amanKosong(muatSiswa, 'santri'),
    amanKosong(muatDetail, 'pelanggaran'),
    amanKosong(muatIzin, 'perizinan'),
    amanKosong(muatPembinaan, 'pembinaan')
  ]);

  const siswa = siswaAll.filter(aktifSantri);
  const mapSiswa = Object.fromEntries(siswa.map(s => [String(s.nisn), s]));
  const detailAktif = detailAll.filter(aktifDetail);

  const akhir = new Date(); akhir.setHours(23,59,59,999);
  const mulai90 = tambahHari(akhir, -89); mulai90.setHours(0,0,0,0);
  const mulai30 = tambahHari(akhir, -29); mulai30.setHours(0,0,0,0);
  const prevMulai = tambahHari(mulai30, -30);
  const prevAkhir = tambahHari(mulai30, -1); prevAkhir.setHours(23,59,59,999);

  const d90 = [], d30 = [], dPrev = [];
  detailAktif.forEach(r => {
    const d = tglDari(kunciTgl(r.tanggal)); if (!d) return;
    if (d >= mulai90 && d <= akhir) d90.push(r);
    if (d >= mulai30 && d <= akhir) d30.push(r);
    if (d >= prevMulai && d <= prevAkhir) dPrev.push(r);
  });

  // Kategori / bidang / jenis
  const kat = { Ringan:0, Sedang:0, Berat:0, Lainnya:0 };
  const bidang = {}, jenis = {}; let poin90 = 0; const terlibat = new Set();
  d90.forEach(r => {
    const k = ['Ringan','Sedang','Berat'].includes(r.kategori) ? r.kategori : 'Lainnya';
    kat[k]++;
    const b = String(r.bidang || 'Belum Dipetakan').trim() || 'Belum Dipetakan';
    bidang[b] = (bidang[b] || 0) + 1;
    const j = String(r.nama_pelanggaran || r.kode_pelanggaran || '-').trim();
    jenis[j] = (jenis[j] || 0) + 1;
    poin90 += Number(r.bobot_pelanggaran) || 0;
    if (r.nisn) terlibat.add(String(r.nisn));
  });
  const bidangUrut = Object.entries(bidang).sort((a,b) => b[1]-a[1])
    .map(([nama, jumlah]) => ({ nama, jumlah, persen: d90.length ? Math.round(jumlah/d90.length*1000)/10 : 0 }));
  const topJenis = Object.entries(jenis).sort((a,b) => b[1]-a[1]).slice(0, 8);

  // Mingguan 90 hari
  const wkKunci = [], wkPeta = {};
  for (let c = awalPekan(mulai90); c <= awalPekan(akhir); c = tambahHari(c, 7)) {
    const k = kunciTgl(c); wkKunci.push(k); wkPeta[k] = 0;
  }
  d90.forEach(r => { const d = tglDari(kunciTgl(r.tanggal)); if (!d) return;
    const k = kunciTgl(awalPekan(d)); if (k in wkPeta) wkPeta[k]++; });

  // Angkatan
  const urutAng = ['VII','VIII','IX','X','XI','XII'];
  const angPeta = Object.fromEntries(urutAng.map(a => [a, { angkatan:a, jumlahSantri:0, kasus:0, poin:0, berat:0, terlibat:new Set() }]));
  siswa.forEach(s => { const a = angkatanDariKelas(s.kelas); if (angPeta[a]) angPeta[a].jumlahSantri++; });
  d90.forEach(r => {
    const a = angkatanDariKelas(r.kelas); if (!angPeta[a]) return;
    const it = angPeta[a];
    it.kasus++; it.poin += Number(r.bobot_pelanggaran) || 0;
    if (r.nisn) it.terlibat.add(String(r.nisn));
    if (r.kategori === 'Berat') it.berat++;
  });
  const angkatan = urutAng.map(a => {
    const it = angPeta[a];
    return { ...it, terlibat: it.terlibat.size,
      per100: it.jumlahSantri ? Math.round(it.kasus / it.jumlahSantri * 1000) / 10 : 0 };
  });

  // Izin 90 hari
  const izin90 = izinAll.filter(z => { const d = tglDari(kunciTgl(z.tanggal_mulai)); return d && d >= mulai90 && d <= akhir; });
  const telatPer = {};
  const izinStat = { sesuai:0, telat:0, pending:0 };
  izin90.forEach(z => {
    const s = String(z.status_persetujuan || '').trim();
    if (s === 'Sesuai Waktu') izinStat.sesuai++;
    else if (s === 'Telat Balik') { izinStat.telat++; telatPer[String(z.nisn)] = (telatPer[String(z.nisn)] || 0) + 1; }
    else if (s === 'Pending') izinStat.pending++;
  });
  const selesaiIzin = izinStat.sesuai + izinStat.telat;
  izinStat.rate = selesaiIzin ? Math.round(izinStat.telat / selesaiIzin * 1000) / 10 : 0;

  // Pembinaan
  const pbnAktif = pembinaanAll.filter(aktifPembinaan);
  const binaPer = {};
  const binaStat = { total: pbnAktif.length, selesai:0, proses:0 };
  pbnAktif.forEach(p => {
    if (String(p.status_pembinaan) === 'Selesai') binaStat.selesai++;
    else { binaStat.proses++; binaPer[String(p.nisn)] = (binaPer[String(p.nisn)] || 0) + 1; }
  });

  // Santri prioritas + tier
  const prio = {};
  const entri = (nisn) => {
    if (!prio[nisn]) {
      const s = mapSiswa[nisn] || {};
      prio[nisn] = { nisn, nama: s.nama_siswa || '(tidak ditemukan)', kelas: s.kelas || '-',
        kasus90:0, kasus30:0, poin90:0, ringan:0, sedang:0, berat:0, bidang:{},
        telat: telatPer[nisn] || 0, bina: binaPer[nisn] || 0 };
    }
    return prio[nisn];
  };
  d90.forEach(r => {
    const n = String(r.nisn || ''); if (!n) return;
    const it = entri(n);
    it.kasus90++; it.poin90 += Number(r.bobot_pelanggaran) || 0;
    if (r.kategori === 'Ringan') it.ringan++;
    if (r.kategori === 'Sedang') it.sedang++;
    if (r.kategori === 'Berat') it.berat++;
    const b = String(r.bidang || 'Belum Dipetakan').trim();
    it.bidang[b] = (it.bidang[b] || 0) + 1;
  });
  d30.forEach(r => { const n = String(r.nisn || ''); if (n) entri(n).kasus30++; });
  Object.keys(telatPer).forEach(entri);
  Object.keys(binaPer).forEach(entri);

  const daftarPrio = Object.values(prio).map(it => {
    const dom = Object.entries(it.bidang).sort((a,b) => b[1]-a[1])[0];
    it.bidangDominan = dom ? dom[0] : '-';
    if (it.poin90 >= 100 || it.berat >= 2) it.tier = 'Kritis';
    else if (it.poin90 >= 50 || it.berat >= 1 || it.kasus30 >= 5) it.tier = 'Perhatian Tinggi';
    else if (it.kasus30 >= 3 || it.telat >= 2 || it.bina >= 1) it.tier = 'Monitor';
    else it.tier = 'Observasi';

    const alasan = [];
    if (it.berat) alasan.push(`${it.berat} pelanggaran berat`);
    if (it.kasus30 >= 3) alasan.push(`${it.kasus30} kasus dalam 30 hari`);
    if (it.telat) alasan.push(`${it.telat} kali telat balik`);
    if (it.bina) alasan.push(`${it.bina} pembinaan berjalan`);
    if (!alasan.length && it.poin90) alasan.push(`${it.poin90} poin dalam 90 hari`);
    it.alasan = alasan.join(' · ') || 'Perlu observasi berkala';
    return it;
  }).filter(it => it.kasus90 > 0 || it.telat > 0 || it.bina > 0);

  const peringkat = { 'Kritis':4, 'Perhatian Tinggi':3, 'Monitor':2, 'Observasi':1 };
  daftarPrio.sort((a,b) => (peringkat[b.tier]-peringkat[a.tier]) || (b.poin90-a.poin90) || (b.kasus30-a.kasus30));
  const kritis = daftarPrio.filter(x => x.tier === 'Kritis').length;
  const perhatian = daftarPrio.filter(x => x.tier === 'Perhatian Tinggi').length;

  const { catatan, ubah } = analisisEksekutif({
    detail30: d30.length, detailPrev30: dPrev.length, bidangUrut, angkatan, izinStat, binaStat, kritis, perhatian });

  // Kondisi eksekutif
  const rasioKritis = siswa.length ? Math.round(kritis / siswa.length * 1000) / 10 : 0;
  let kondisi = { kode:'ok', label:'Relatif Terkendali',
    desc:'Tidak ada indikator utama yang menunjukkan lonjakan besar pada periode analisis.' };
  if ((ubah !== null && ubah > 20) || rasioKritis >= 3 || kat.Berat >= 10) {
    kondisi = { kode:'danger', label:'Perlu Perhatian Pimpinan',
      desc:'Terdapat indikator yang membutuhkan evaluasi dan tindak lanjut lintas bagian.' };
  } else if ((ubah !== null && ubah > 5) || kritis > 0 || perhatian >= 5 || izinStat.rate >= 20) {
    kondisi = { kode:'warn', label:'Perlu Penguatan Pengawasan',
      desc:'Kondisi masih dapat dikendalikan, namun beberapa indikator perlu dipantau lebih dekat.' };
  }

  const tierTag = (t) => t === 'Kritis' ? 'tag-berat' : t === 'Perhatian Tinggi' ? 'tag-sedang'
    : t === 'Monitor' ? 'tag-sea' : 'tag-off';

  $('viewRoot').innerHTML = `
    <section class="hero">
      <div class="eyebrow"><span class="ar">لوحة القيادة</span><span class="rule"></span>
        <span class="lat">Executive · Read Only</span></div>
      <span class="ar" style="font-size:19px;color:#F2E5B8">تقرير حال الدايه</span>
      <h2>Analisis kondisi dayah<br>berbasis data.</h2>
      <p>Ringkasan untuk membantu pimpinan melihat kedisiplinan, pola pelanggaran,
         perizinan, pembinaan, dan santri yang membutuhkan perhatian — tanpa masuk
         ke aktivitas input operasional.</p>
      <div class="meta">
        <span><i class="fa-solid fa-user-tie"></i>${esc(APP.profil?.nama || '')}</span>
        <span><i class="fa-solid fa-calendar-days"></i>${tgl(kunciTgl(mulai90))} – ${tgl(kunciTgl(akhir))}</span>
        <span><i class="fa-solid fa-clock-rotate-left"></i>Diperbarui ${new Date().toLocaleString('id-ID')}</span>
      </div>
    </section>

    <div class="stats six">
      ${stat('Santri Aktif', angka(siswa.length), 'fa-solid fa-users', 'background:#E7F1F7;color:var(--sea)', 'var(--sea)')}
      ${stat('Pelanggaran 90h', angka(d90.length), 'fa-solid fa-triangle-exclamation', 'background:var(--maroon-bg);color:var(--maroon)', 'var(--maroon)', `${angka(poin90)} poin`)}
      ${stat('Santri Terlibat', angka(terlibat.size), 'fa-solid fa-user-shield', 'background:var(--violet-bg);color:var(--violet)', 'var(--violet)',
        `${siswa.length ? Math.round(terlibat.size/siswa.length*1000)/10 : 0}% dari santri aktif`)}
      ${stat('Pembinaan Berjalan', angka(binaStat.proses), 'fa-solid fa-person-chalkboard', 'background:var(--amber-bg);color:var(--amber)', 'var(--amber)', 'Status Dalam Proses')}
      ${stat('Izin Telat Balik', angka(izinStat.telat), 'fa-solid fa-clock-rotate-left', 'background:var(--maroon-bg);color:var(--maroon)', 'var(--maroon)', `${izinStat.rate}% dari izin selesai`)}
      ${stat('Perubahan 30 Hari', ubah === null ? 'Baru' : `${ubah > 0 ? '+' : ''}${ubah}%`, 'fa-solid fa-chart-line',
        'background:var(--teal-bg);color:var(--teal)', 'var(--teal)', 'Vs 30 hari sebelumnya')}
    </div>

    <section class="exec">
      <div class="exec-score ${kondisi.kode}">
        <small>Indikator Kondisi</small>
        <strong>${esc(kondisi.label)}</strong>
        <span>${esc(kondisi.desc)}</span>
      </div>
      <div>
        <div class="eyebrow"><span class="ar">تحليل</span><span class="rule"></span>
          <span class="lat">Analisis Eksekutif</span></div>
        <h3 style="margin:2px 0 0;font-size:15px">Hal yang perlu diperhatikan</h3>
        <div class="notes">
          ${catatan.map(c => `<article class="note ${c.level}">
            <b>${esc(c.judul)}</b><p>${esc(c.teks)}</p>
            <div class="rec"><i class="fa-solid fa-arrow-turn-up fa-rotate-90"></i> ${esc(c.rek)}</div>
          </article>`).join('')}
        </div>
      </div>
    </section>

    <div class="grid-2">
      ${kartu('Gelombang Pelanggaran Mingguan', chartBox('pWeek'), '', '90 hari terakhir')}
      ${kartu('Risiko Relatif per Angkatan', chartBox('pAng'), '', 'Kasus per 100 santri')}
    </div>

    <div class="grid-half">
      ${kartu('Bidang Dominan', chartBox('pBidang'))}
      ${kartu('Distribusi Kategori', chartBox('pKat'))}
    </div>

    <div class="grid-half">
      ${kartu('Status Keterangan Balik', chartBox('pIzin'))}
      ${kartu('Kondisi Pembinaan', chartBox('pBina'))}
    </div>

    ${kartu('Santri Membutuhkan Perhatian', `
      <div class="tbl"><table>
        <thead><tr><th>Santri</th><th>Kelas</th><th>Tier</th><th class="center">Kasus 90h</th>
          <th class="center">Kasus 30h</th><th class="center">Poin</th><th>Bidang Dominan</th>
          <th class="center">Telat</th><th class="center">Bina</th><th>Alasan</th></tr></thead>
        <tbody>${daftarPrio.slice(0, 20).map(r => `<tr>
          <td><div class="primary">${esc(r.nama)}</div><div class="secondary">${esc(r.nisn)}</div></td>
          <td class="nowrap">${esc(r.kelas)}</td>
          <td><span class="tag ${tierTag(r.tier)}">${esc(r.tier)}</span></td>
          <td class="num center">${r.kasus90}</td>
          <td class="num center">${r.kasus30}</td>
          <td class="num center">${r.poin90}</td>
          <td>${esc(r.bidangDominan)}</td>
          <td class="num center">${r.telat}</td>
          <td class="num center">${r.bina}</td>
          <td style="min-width:220px;font-size:12.5px;color:var(--text-2)">${esc(r.alasan)}</td>
        </tr>`).join('') || barisKosong(10,'Belum ada santri pada indikator prioritas.','Data akan muncul seiring pencatatan berjalan.')}
        </tbody></table></div>
      <div class="scroll-hint"><i class="fa-solid fa-arrows-left-right"></i>Geser ke samping untuk kolom lainnya.</div>`,
      `<span class="tag tag-berat">${kritis} Kritis</span><span class="tag tag-sedang">${perhatian} Perhatian</span>`,
      'Ranking indikator, bukan keputusan hukuman otomatis.')}

    ${kartu('Jenis Pelanggaran Terbanyak', `<div class="card-body">
      ${topJenis.map(([nama, jml], i) => `<div class="rank">
        <span class="n">${String(i+1).padStart(2,'0')}</span>
        <span class="t">${esc(nama)}</span><span class="c">${jml}x</span></div>`).join('')
        || '<p style="color:var(--text-3);text-align:center;padding:20px 0">Belum ada data.</p>'}
    </div>`)}`;

  buatChart('pWeek','pWeek',{ type:'line',
    data:{ labels: wkKunci.map(labelPekan), datasets:[{ label:'Pelanggaran', data: wkKunci.map(k => wkPeta[k]),
      borderColor:'#14618B', backgroundColor:'rgba(20,97,139,.14)', tension:.35, fill:true, borderWidth:2.5, pointRadius:3 }]},
    options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}},
      scales:{x:{grid:{display:false},ticks:{maxTicksLimit:8,maxRotation:0}},y:{beginAtZero:true,ticks:{precision:0}}} }});

  buatChart('pAng','pAng',{ type:'bar',
    data:{ labels: angkatan.map(a => a.angkatan), datasets:[{ label:'Kasus / 100 santri',
      data: angkatan.map(a => a.per100), backgroundColor: PALET, borderRadius:7 }]},
    options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false},
      tooltip:{callbacks:{afterLabel:(c)=>{const r=angkatan[c.dataIndex];
        return [`Kasus: ${r.kasus}`,`Santri: ${r.jumlahSantri}`,`Terlibat: ${r.terlibat}`,`Berat: ${r.berat}`];}}}},
      scales:{x:{grid:{display:false}},y:{beginAtZero:true}} }});

  buatChart('pBidang','pBidang',{ type:'bar',
    data:{ labels: bidangUrut.slice(0,7).map(b => b.nama),
      datasets:[{ label:'Kasus', data: bidangUrut.slice(0,7).map(b => b.jumlah), backgroundColor:'#1B7AAD', borderRadius:6 }]},
    options:{ indexAxis:'y', responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}},
      scales:{x:{beginAtZero:true,ticks:{precision:0}},y:{grid:{display:false}}} }});

  buatChart('pKat','pKat',{ type:'doughnut',
    data:{ labels:['Ringan','Sedang','Berat','Lainnya'],
      datasets:[{ data:[kat.Ringan,kat.Sedang,kat.Berat,kat.Lainnya],
        backgroundColor:['#0F766E','#B45309','#9F1239','#8298AC'], borderWidth:0 }]},
    options:{ responsive:true, maintainAspectRatio:false, cutout:'66%',
      plugins:{legend:{position:'bottom',labels:{usePointStyle:true,boxWidth:9}}} }});

  buatChart('pIzin','pIzin',{ type:'doughnut',
    data:{ labels:['Sesuai Waktu','Telat Balik','Menunggu'],
      datasets:[{ data:[izinStat.sesuai,izinStat.telat,izinStat.pending],
        backgroundColor:['#0F766E','#9F1239','#B45309'], borderWidth:0 }]},
    options:{ responsive:true, maintainAspectRatio:false, cutout:'66%',
      plugins:{legend:{position:'bottom',labels:{usePointStyle:true,boxWidth:9}}} }});

  buatChart('pBina','pBina',{ type:'doughnut',
    data:{ labels:['Selesai','Dalam Proses'],
      datasets:[{ data:[binaStat.selesai,binaStat.proses],
        backgroundColor:['#0F766E','#B45309'], borderWidth:0 }]},
    options:{ responsive:true, maintainAspectRatio:false, cutout:'66%',
      plugins:{legend:{position:'bottom',labels:{usePointStyle:true,boxWidth:9}}} }});
   
     await panelKinerjaGuru();
}

// ---------------------------------------------------------------------
// 12. PROFIL SANTRI
// ---------------------------------------------------------------------
const stSiswa = { page:1, size:30, cari:'', kelas:'', jenjang:'' };

async function viewSiswa() {
  $('viewRoot').innerHTML = kartu('Daftar Santri', `
    <div class="filters">
      <input id="cariSiswa" class="input grow" placeholder="Cari nama atau NISN…" value="${esc(stSiswa.cari)}">
      <input id="filterKelas" class="input" autocomplete="off" placeholder="Semua kelas" value="${esc(stSiswa.kelas)}">
      <select id="filterJenjang" class="input">
        <option value="">Semua Jenjang</option>
        ${['MTs','MA'].map(j => `<option ${j===stSiswa.jenjang?'selected':''}>${j}</option>`).join('')}
      </select>
      <span class="sep"></span>
      <button class="btn btn-ghost btn-sm" id="resetSiswa"><i class="fa-solid fa-rotate-left"></i>Reset</button>
    </div>
    <div class="tbl"><table>
      <thead><tr><th>NISN</th><th>Nama Santri</th><th>Kelas</th><th>Status</th>
        <th class="center">Poin</th><th class="right">Aksi</th></tr></thead>
      <tbody id="tbSiswa"><tr><td colspan="6" style="padding:26px;text-align:center;color:var(--text-3)">Memuat…</td></tr></tbody>
    </table></div>
    <div class="scroll-hint"><i class="fa-solid fa-arrows-left-right"></i>Geser ke samping untuk kolom lainnya.</div>
    <div id="pgSiswa"></div>`,
    bolehCetak() ? `<button class="btn btn-ghost btn-sm" id="csvSiswa"><i class="fa-solid fa-file-csv"></i>Ekspor CSV</button>` : '');

  $('cariSiswa').addEventListener('input', debounce(e => {
    stSiswa.cari = e.target.value.trim(); stSiswa.page = 1; muatTabelSiswa();
  }, 280));
  $('filterJenjang').addEventListener('change', e => {
    stSiswa.jenjang = e.target.value; stSiswa.page = 1; muatTabelSiswa();
  });
  saranKelas($('filterKelas'), (nilai) => { stSiswa.kelas = nilai; stSiswa.page = 1; muatTabelSiswa(); });
  $('resetSiswa').addEventListener('click', () => {
    Object.assign(stSiswa, { page:1, cari:'', kelas:'', jenjang:'' });
    $('cariSiswa').value = ''; $('filterKelas').value = ''; $('filterJenjang').value = '';
    muatTabelSiswa();
  });
  $('csvSiswa')?.addEventListener('click', async () => {
    const rows = saringSiswa(await muatSiswa());
    unduhCsv(`santri-${hariIni()}.csv`, [
      ['NISN','Nama','Kelas','Jenjang','Asrama','Status Keberadaan','Total Poin'],
      ...rows.map(s => [s.nisn, s.nama_siswa, s.kelas, s.jenjang, s.asrama, s.status_keberadaan, s.total_poin_pelanggaran])
    ]);
  });

  onKlik(async (e) => {
    const d = e.target.closest('[data-detail]');
    if (d) return bukaDetailSantri(d.dataset.detail);
    const p = e.target.closest('[data-pg]');
    if (p && p.dataset.pg.startsWith('siswa:')) {
      stSiswa.page = Number(p.dataset.pg.split(':')[1]); muatTabelSiswa();
    }
  });

  await muatTabelSiswa();
}

function saringSiswa(all) {
  let rows = filterBinaan(all.filter(aktifSantri), 'kelas');
  if (stSiswa.kelas)   rows = rows.filter(s => s.kelas === stSiswa.kelas);
  if (stSiswa.jenjang) rows = rows.filter(s => (s.jenjang || angkatanJenjang(s.kelas)) === stSiswa.jenjang);
  if (stSiswa.cari) {
    const k = stSiswa.cari.toLowerCase();
    rows = rows.filter(s => String(s.nama_siswa||'').toLowerCase().includes(k) ||
                            String(s.nisn||'').toLowerCase().includes(k));
  }
  return rows;
}

function angkatanJenjang(kelas) {
  const a = angkatanDariKelas(kelas);
  if (['VII','VIII','IX'].includes(a)) return 'MTs';
  if (['X','XI','XII'].includes(a)) return 'MA';
  return '';
}

async function muatTabelSiswa() {
  const all = await muatSiswa();
  const rows = saringSiswa(all);
  const pages = Math.max(1, Math.ceil(rows.length / stSiswa.size));
  if (stSiswa.page > pages) stSiswa.page = pages;
  const from = (stSiswa.page - 1) * stSiswa.size;
  const hal = rows.slice(from, from + stSiswa.size);
  $('queryTime').textContent = `santri · ${angka(rows.length)} baris`;

  $('tbSiswa').innerHTML = hal.map(s => `<tr>
    <td class="secondary nowrap" style="padding-top:14px">${esc(s.nisn)}</td>
    <td><div class="primary">${esc(s.nama_siswa)}</div></td>
    <td>${esc(s.kelas||'-')}${s.jenjang || s.asrama
      ? `<div class="secondary">${esc(s.jenjang||'')}${s.asrama ? ' · '+esc(s.asrama) : ''}</div>` : ''}</td>
    <td><span class="tag ${s.status_keberadaan==='Hadir'?'tag-ok':'tag-wait'}">${esc(s.status_keberadaan||'Hadir')}</span></td>
    <td class="num center" style="color:${Number(s.total_poin_pelanggaran)>=50?'var(--maroon)':'var(--text)'}">${s.total_poin_pelanggaran||0}</td>
    <td class="right"><button class="btn-link" data-detail="${esc(s.nisn)}">
      <i class="fa-solid fa-eye"></i> Detail</button></td>
  </tr>`).join('') || barisKosong(6, 'Tidak ada santri yang cocok.', 'Ubah kata kunci atau reset filter.');

  $('pgSiswa').innerHTML = pager('siswa', stSiswa.page, rows.length, stSiswa.size);
  tandaiTabelBisaGeser();
}

async function bukaDetailSantri(nisn) {
  loading(true);
  try {
    const { data } = await q(db.rpc('laporan_santri', { p_nisn: nisn }), 'laporan_santri');
    const s = data.siswa || {};
    const riwayat = data.perkembangan || [];
    const izin = data.perizinan || [];
    const bina = data.pembinaan || [];

    // Timeline gabungan, urut dari yang terbaru
    const timeline = [
      ...riwayat.map(r => ({ tipe:'plg', kunci: kunciTgl(r.tanggal), r })),
      ...izin.map(z => ({ tipe:'izin', kunci: kunciTgl(z.tanggal_mulai), r:z })),
      ...bina.map(b => ({ tipe:'bina', kunci: kunciTgl(b.tanggal_pembinaan), r:b }))
    ].sort((a, b) => String(b.kunci).localeCompare(String(a.kunci)));

    const item = (t) => {
      if (t.tipe === 'plg') { const r = t.r; return `
        <div class="tl-item">
          <div class="mark" style="background:var(--maroon-bg);color:var(--maroon)">
            <i class="fa-solid fa-triangle-exclamation"></i></div>
          <div class="body">
            <div class="row1"><p class="ttl" style="margin:0">${esc(r.judul)}</p>
              <span class="tag ${tagKategori(r.kategori)}">${esc(r.kategori)} · ${r.poin}</span></div>
            <div class="when">${tgl(r.tanggal)} · ${esc(r.bidang||'-')} · ${esc(r.penindak||'-')}</div>
            ${r.catatan ? `<div class="note">${esc(r.catatan)}</div>` : ''}
          </div></div>`; }
      if (t.tipe === 'izin') { const z = t.r; return `
        <div class="tl-item">
          <div class="mark" style="background:var(--teal-bg);color:var(--teal)">
            <i class="fa-solid fa-door-open"></i></div>
          <div class="body">
            <div class="row1"><p class="ttl" style="margin:0">Izin ${esc(z.jenis_izin)}</p>
              <span class="tag ${tagIzin(z.status_persetujuan)}">${esc(z.status_persetujuan)}</span></div>
            <div class="when">${tgl(z.tanggal_mulai)} s/d ${tgl(z.tanggal_selesai)}</div>
            <div class="note">${esc(z.alasan||'-')}</div>
          </div></div>`; }
      const b = t.r; return `
        <div class="tl-item">
          <div class="mark" style="background:var(--violet-bg);color:var(--violet)">
            <i class="fa-solid fa-hands-praying"></i></div>
          <div class="body">
            <div class="row1"><p class="ttl" style="margin:0">${esc(b.bentuk_pembinaan||'Pembinaan')}</p>
              <span class="tag ${b.status_pembinaan==='Selesai'?'tag-ok':'tag-wait'}">${esc(b.status_pembinaan||'-')}</span></div>
            <div class="when">${tgl(b.tanggal_pembinaan)}${b.pengulangan_ke ? ' · Tahap ke-'+b.pengulangan_ke : ''}${b.kategori ? ' · '+esc(b.kategori) : ''}</div>
          </div></div>`;
    };

    await Swal.fire({
      width: 800, showConfirmButton:false, showCloseButton:true,
      html: `<div style="text-align:left">
        <div class="santri-head">
          <div>
            <p class="nm">${esc(s.nama_siswa)}</p>
            <p class="id">NISN ${esc(s.nisn)} · Kelas ${esc(s.kelas||'-')}${s.jenjang?' · '+esc(s.jenjang):''}${s.asrama?' · Asrama '+esc(s.asrama):''}</p>
          </div>
          <div class="poin-badge">
            <p class="v" style="color:${Number(s.total_poin_pelanggaran)>=50?'var(--maroon)':'var(--text)'}">${s.total_poin_pelanggaran||0}</p>
            <p class="k">Total Poin</p>
          </div>
        </div>

        <div class="detail-acts">
          ${bolehCetak() ? `<button class="btn btn-primary btn-sm" id="dCetak"><i class="fa-solid fa-print"></i>Cetak Laporan</button>` : ''}
          ${bolehPdf() ? `<button class="btn btn-ghost btn-sm" id="dPdf"><i class="fa-solid fa-file-pdf"></i>Unduh PDF</button>` : ''}
          ${bolehTulis() ? `<button class="btn btn-ghost btn-sm" id="dReset"><i class="fa-solid fa-rotate-left"></i>Reset ke Hadir</button>` : ''}
        </div>

        <div class="tl">
          ${timeline.map(item).join('') ||
            '<p style="text-align:center;color:var(--text-3);padding:28px 0">Belum ada riwayat.</p>'}
        </div></div>`,
      didOpen: () => {
        $('dCetak')?.addEventListener('click', () => cetakLaporan(nisn));
        $('dPdf')?.addEventListener('click', () => unduhLaporanPdf(nisn));
        $('dReset')?.addEventListener('click', () => resetStatus(nisn));
      }
    });
  } catch (err) { fireError(err); }
  finally { loading(false); }
}

async function resetStatus(nisn) {
  try {
    await q(db.rpc('reset_status_keberadaan', { p_nisn: nisn }), 'reset_status');
    Swal.close();
    cacheHapus('siswa');
    toast('success', 'Status dikembalikan ke Hadir');
    if (APP.view === 'siswa') muatTabelSiswa();
  } catch (err) { fireError(err); }
}

// ---------------------------------------------------------------------
// 13. CATATAN PELANGGARAN
// ---------------------------------------------------------------------
const stPlg = { page:1, size:30, cari:'', kategori:'', bidang:'', kelas:'', dari:'', sampai:'' };

async function viewPelanggaran() {
  $('viewRoot').innerHTML = kartu('Catatan Pelanggaran', `
    <div class="card-note"><i class="fa-solid fa-circle-info"></i>
      Unit aktif: <b>${esc(labelKonteks())}</b>. Daftar dan pilihan jenis pelanggaran
      otomatis mengikuti unit ini.</div>
    <div class="filters">
      <input id="plgCari" class="input grow" placeholder="Cari santri / jenis pelanggaran…" value="${esc(stPlg.cari)}">
      <select id="plgKategori" class="input">
        <option value="">Semua Kategori</option>
        ${['Ringan','Sedang','Berat'].map(k => `<option ${k===stPlg.kategori?'selected':''}>${k}</option>`).join('')}
      </select>
      <input id="plgBidang" class="input" autocomplete="off" placeholder="Semua bidang" value="${esc(stPlg.bidang)}">
      <input id="plgKelas" class="input" autocomplete="off" placeholder="Semua kelas" value="${esc(stPlg.kelas)}">
      <input id="plgDari" type="date" class="input" value="${stPlg.dari}" title="Tanggal mulai">
      <input id="plgSampai" type="date" class="input" value="${stPlg.sampai}" title="Tanggal akhir">
      <span class="sep"></span>
      <button class="btn btn-ghost btn-sm" id="plgReset"><i class="fa-solid fa-rotate-left"></i>Reset</button>
    </div>
    <div class="tbl"><table>
      <thead><tr><th>Tanggal</th><th>Santri</th><th>Pelanggaran</th><th>Kategori</th>
        <th class="center">Poin</th><th>Bidang</th><th>Penindak</th><th class="right">Aksi</th></tr></thead>
      <tbody id="tbPlg"><tr><td colspan="8" style="padding:26px;text-align:center;color:var(--text-3)">Memuat…</td></tr></tbody>
    </table></div>
    <div class="scroll-hint"><i class="fa-solid fa-arrows-left-right"></i>Geser ke samping untuk kolom lainnya.</div>
    <div id="pgPlg"></div>`,
    `${bolehCetak() ? `<button class="btn btn-ghost btn-sm" id="plgCsv"><i class="fa-solid fa-file-csv"></i>Ekspor CSV</button>` : ''}
     ${bolehTulis() ? `<button class="btn btn-primary btn-sm" id="btnAddPlg"><i class="fa-solid fa-plus"></i>Catat Pelanggaran</button>` : ''}`);

  $('plgCari').addEventListener('input', debounce(e => {
    stPlg.cari = e.target.value.trim(); stPlg.page = 1; muatTabelPlg(); }, 280));
  ['plgKategori','plgDari','plgSampai'].forEach(id => $(id).addEventListener('change', e => {
    stPlg[{plgKategori:'kategori', plgDari:'dari', plgSampai:'sampai'}[id]] = e.target.value;
    stPlg.page = 1; muatTabelPlg();
  }));
  saranKelas($('plgKelas'), v => { stPlg.kelas = v; stPlg.page = 1; muatTabelPlg(); });
  saranBidang($('plgBidang'), b => { stPlg.bidang = b.nama_bidang; stPlg.page = 1; muatTabelPlg(); });
  $('plgBidang').addEventListener('input', debounce(e => {
    if (!e.target.value.trim()) { stPlg.bidang = ''; stPlg.page = 1; muatTabelPlg(); } }, 300));
  $('plgReset').addEventListener('click', () => {
    Object.assign(stPlg, { page:1, cari:'', kategori:'', bidang:'', kelas:'', dari:'', sampai:'' });
    ['plgCari','plgBidang','plgKelas','plgDari','plgSampai'].forEach(i => $(i).value = '');
    $('plgKategori').value = ''; muatTabelPlg();
  });
  $('btnAddPlg')?.addEventListener('click', () => modalCatatPelanggaran());
  $('plgCsv')?.addEventListener('click', async () => {
    const rows = saringPlg(await muatDetail());
    unduhCsv(`pelanggaran-${hariIni()}.csv`, [
      ['Tanggal','NISN','Nama','Kelas','Jenjang','Kode','Pelanggaran','Kategori','Poin','Sumber','Bidang','Penindak','Catatan'],
      ...rows.map(r => [kunciTgl(r.tanggal), r.nisn, r.nama_siswa, r.kelas, r.jenjang, r.kode_pelanggaran,
        r.nama_pelanggaran, r.kategori, r.bobot_pelanggaran, r.sumber, r.bidang, r.penindak, r.catatan])
    ]);
  });

  onKlik(async (e) => {
    const a = e.target.closest('[data-arsip]');
    if (a) return arsipkanPelanggaran(a.dataset.arsip);
    const p = e.target.closest('[data-pg]');
    if (p && p.dataset.pg.startsWith('plg:')) { stPlg.page = Number(p.dataset.pg.split(':')[1]); muatTabelPlg(); }
  });

  await muatTabelPlg();
}

function saringPlg(all) {
  let rows = lingkupDetail(all);
  if (stPlg.kategori) rows = rows.filter(r => r.kategori === stPlg.kategori);
  if (stPlg.bidang)   rows = rows.filter(r => String(r.bidang||'') === stPlg.bidang);
  if (stPlg.kelas)    rows = rows.filter(r => r.kelas === stPlg.kelas);
  if (stPlg.dari)     rows = rows.filter(r => kunciTgl(r.tanggal) >= stPlg.dari);
  if (stPlg.sampai)   rows = rows.filter(r => kunciTgl(r.tanggal) <= stPlg.sampai);
  if (stPlg.cari) {
    const k = stPlg.cari.toLowerCase();
    rows = rows.filter(r => [r.nama_siswa, r.nisn, r.nama_pelanggaran, r.kode_pelanggaran]
      .some(v => String(v||'').toLowerCase().includes(k)));
  }
  return rows.sort((a,b) => String(kunciTgl(b.tanggal)).localeCompare(String(kunciTgl(a.tanggal))));
}

async function muatTabelPlg() {
  const rows = saringPlg(await muatDetail());
  const pages = Math.max(1, Math.ceil(rows.length / stPlg.size));
  if (stPlg.page > pages) stPlg.page = pages;
  const from = (stPlg.page - 1) * stPlg.size;
  const hal = rows.slice(from, from + stPlg.size);
  $('queryTime').textContent = `pelanggaran · ${angka(rows.length)} baris`;

  $('tbPlg').innerHTML = hal.map(r => `<tr>
    <td class="secondary nowrap" style="padding-top:14px">${tgl(r.tanggal)}</td>
    <td><div class="primary">${esc(r.nama_siswa)}</div>
        <div class="secondary">${esc(r.nisn)} · ${esc(r.kelas||'-')}</div></td>
    <td>${esc(r.nama_pelanggaran)}<div class="secondary">${esc(r.kode_pelanggaran)}</div></td>
    <td><span class="tag ${tagKategori(r.kategori)}">${esc(r.kategori)}</span></td>
    <td class="num center" style="color:var(--maroon)">${r.bobot_pelanggaran}</td>
    <td><span class="tag tag-sea">${esc(r.bidang||'-')}</span>
        <div class="secondary">${esc(r.sumber||'-')}</div></td>
    <td style="font-size:12.5px;color:var(--text-2)">${esc(r.penindak||'-')}</td>
    <td class="right">${bolehTulis()
      ? `<button class="btn btn-danger btn-sm" data-arsip="${esc(r.id_log)}">
          <i class="fa-solid fa-box-archive"></i>Arsip</button>` : '<span class="tag tag-off">Hanya baca</span>'}</td>
  </tr>`).join('') || barisKosong(8, 'Tidak ada catatan pada filter ini.', 'Coba ubah unit, rentang tanggal, atau kata kunci.');

  $('pgPlg').innerHTML = pager('plg', stPlg.page, rows.length, stPlg.size);
  tandaiTabelBisaGeser();
}

async function modalCatatPelanggaran(prefill) {
  if (APP.ctx.unit === 'Semua') {
    const r = await Swal.fire({ icon:'info', title:'Pilih unit terlebih dahulu',
      text:'Tentukan Pengasuhan, Madrasah MTs, atau Madrasah MA agar jenis pelanggaran yang muncul sesuai.',
      showCancelButton:true, confirmButtonText:'Ke pemilih unit', cancelButtonText:'Tetap lanjut',
      confirmButtonColor:'#14618B' });
    if (r.isConfirmed) return navigateTo('dashboard');
  }

  const p = prefill || {};
  const res = await Swal.fire({
    title:'Catat Pelanggaran', width: 580, showCancelButton:true,
    confirmButtonText:'Simpan', cancelButtonText:'Batal', confirmButtonColor:'#14618B',
    showLoaderOnConfirm:true, allowOutsideClick:() => !Swal.isLoading(),
    html: `<div class="stack">
      <div class="ctx-note"><i class="fa-solid fa-layer-group"></i>
        Input untuk unit <b>&nbsp;${esc(labelKonteks())}</b></div>
      <div class="field">
        <label class="label">Santri</label>
        <input id="fNisn" class="input" autocomplete="off"
               placeholder="Ketik nama atau NISN (min. 2 huruf)…" value="${esc(p.labelSantri||'')}">
        <p class="hint">Pilih dari daftar saran agar NISN terbaca dengan benar.</p>
      </div>
      <div class="field">
        <label class="label">Jenis Pelanggaran</label>
        <input id="fKode" class="input" autocomplete="off"
               placeholder="Ketik kode, nama, kategori, atau bidang…" value="${esc(p.labelKode||'')}">
        <div id="fKodeInfo" class="hint"></div>
      </div>
      <div class="duo">
        <div class="field"><label class="label">Tanggal</label>
          <input id="fTanggal" type="date" class="input" value="${p.tanggal||hariIni()}"></div>
        <div class="field"><label class="label">Catatan</label>
          <input id="fCatatan" class="input" placeholder="opsional" value="${esc(p.catatan||'')}"></div>
      </div></div>`,
    didOpen: () => {
      const fNisn = $('fNisn'), fKode = $('fKode');
      if (p.nisn) fNisn.dataset.picked = p.nisn;
      if (p.kode) fKode.dataset.kode = p.kode;
      saranSantri(fNisn);
      saranPelanggaran(fKode, (m) => {
        $('fKodeInfo').innerHTML =
          `<span class="tag ${tagKategori(m.kategori)}">${esc(m.kategori)}</span>
           <b>${m.bobot_poin} poin</b> · ${esc(m.bidang||'-')} · ${esc(m.sumber||'-')} · ${esc(m.jenjang||'Semua')}`;
      });
      setTimeout(() => fNisn.focus(), 120);
    },
    preConfirm: async () => {
      const fNisn = $('fNisn'), fKode = $('fKode');
      const nisn = fNisn.dataset.picked || fNisn.value.split(' - ')[0].trim();
      const kode = fKode.dataset.kode || fKode.value.split('—')[0].trim();
      if (!nisn) { Swal.showValidationMessage('Santri belum dipilih dari daftar saran.'); return false; }
      if (!kode) { Swal.showValidationMessage('Jenis pelanggaran belum dipilih dari daftar saran.'); return false; }
      const payload = {
        p_nisn: nisn, p_kode: kode,
        p_tanggal: $('fTanggal').value,
        p_catatan: $('fCatatan').value.trim(),
        p_force: !!p.force
      };
      const { data, error } = await db.rpc('catat_pelanggaran', payload);
      if (error) { Swal.showValidationMessage(error.message); return false; }
      return { hasil: data, payload, labelSantri: fNisn.value, labelKode: fKode.value };
    }
  });

  if (!res.isConfirmed) return;
  const { hasil, payload, labelSantri, labelKode } = res.value;

  // Cross-check izin: minta penegasan sebelum menimpa izin yang sudah sesuai waktu.
  if (hasil?.conflict) {
    if (role() === 'Osis') {
      return Swal.fire({ icon:'error', title:'Tidak berwenang',
        text:'Osis tidak dapat menimpa izin yang sudah berstatus Sesuai Waktu. Hubungi Admin/Guru.',
        confirmButtonColor:'#9F1239' });
    }
    const konf = await Swal.fire({
      icon:'warning', title:'Terdeteksi izin yang sesuai waktu',
      html:`<p style="text-align:left;font-size:13.5px">${esc(hasil.message)}</p>`,
      showCancelButton:true, confirmButtonText:'Tetap catat pelanggaran',
      cancelButtonText:'Batalkan', confirmButtonColor:'#9F1239'
    });
    if (konf.isConfirmed) {
      return modalCatatPelanggaran({
        labelSantri, labelKode, nisn: payload.p_nisn, kode: payload.p_kode,
        tanggal: payload.p_tanggal, catatan: payload.p_catatan, force: true
      });
    }
    return;
  }

  sync('done', 'Pelanggaran tersimpan');
  cacheHapus('detail','siswa','pembinaan');
  toast('success', `Tersimpan. Total poin santri: ${hasil?.poin_baru ?? '-'}`);
  if (APP.view === 'pelanggaran') muatTabelPlg();
}

async function arsipkanPelanggaran(idLog) {
  const r = await Swal.fire({ icon:'warning', title:'Arsipkan catatan ini?',
    text:'Poin santri akan dikurangi kembali secara otomatis.',
    showCancelButton:true, confirmButtonText:'Ya, arsipkan', cancelButtonText:'Batal',
    confirmButtonColor:'#9F1239' });
  if (!r.isConfirmed) return;
  sync('saving', 'Mengarsipkan…');
  try {
    const { data } = await q(db.rpc('arsipkan_pelanggaran', { p_id_log: idLog }), 'arsip');
    cacheHapus('detail','siswa','pembinaan');
    sync('done', 'Catatan diarsipkan');
    toast('success', `Diarsipkan. Poin sekarang: ${data?.poin_baru ?? '-'}`);
    muatTabelPlg();
  } catch (err) { sync('warn', 'Gagal mengarsipkan'); fireError(err); }
}

// ---------------------------------------------------------------------
// 14. REKAP PELANGGARAN (kaskade konversi) — port FilterPelanggaranView
// ---------------------------------------------------------------------
const stRekap = { kategori:'Semua', kelas:'', cari:'', page:1, size:30 };

async function viewRekap() {
  const kelasList = await muatDaftarKelas();

  $('viewRoot').innerHTML = kartu('Rekap Pelanggaran per Santri', `
    <div class="card-note"><i class="fa-solid fa-circle-info"></i>
      Rekap memakai kaskade konversi buku peraturan: <b>5x Ringan sejenis → 1x Sedang</b>,
      <b>5x Sedang sejenis → 1x Berat</b>. Sisa yang belum genap tetap pada kategori aslinya.</div>
    <div class="filters">
      <input id="rkCari" class="input grow" placeholder="Cari nama atau NISN santri…" value="${esc(stRekap.cari)}">
      <select id="rkKategori" class="input">
        ${['Semua','Ringan','Sedang','Berat'].map(k => `<option ${k===stRekap.kategori?'selected':''}>${k}</option>`).join('')}
      </select>
      <select id="rkKelas" class="input">
        <option value="">Semua Kelas</option>
        ${kelasList.map(k => `<option ${k===stRekap.kelas?'selected':''}>${esc(k)}</option>`).join('')}
      </select>
      <span class="sep"></span>
      <button class="btn btn-ghost btn-sm" id="rkCsv"><i class="fa-solid fa-file-csv"></i>Ekspor CSV</button>
    </div>
    <div id="rkHasil"><div style="padding:26px;text-align:center;color:var(--text-3)">Memuat…</div></div>
    <div id="pgRk"></div>`,
    `<span class="tag tag-sea">${esc(labelKonteks())}</span>`);

  $('rkCari').addEventListener('input', debounce(e => {
    stRekap.cari = e.target.value.trim(); stRekap.page = 1; gambarRekap(); }, 250));
  $('rkKategori').addEventListener('change', e => { stRekap.kategori = e.target.value; stRekap.page = 1; gambarRekap(); });
  $('rkKelas').addEventListener('change', e => { stRekap.kelas = e.target.value; stRekap.page = 1; gambarRekap(); });
  $('rkCsv').addEventListener('click', async () => {
    const rows = await hitungRekap();
    const baris = [['NISN','Nama','Kelas','Kategori','Catatan','Jumlah']];
    rows.forEach(s => s.daftar.forEach(d => baris.push([s.nisn, s.nama, s.kelas, d.kategori, d.deskripsi, d.jumlah])));
    unduhCsv(`rekap-pelanggaran-${hariIni()}.csv`, baris);
  });

  onKlik((e) => {
    const d = e.target.closest('[data-detail]');
    if (d) return bukaDetailSantri(d.dataset.detail);
    const p = e.target.closest('[data-pg]');
    if (p && p.dataset.pg.startsWith('rk:')) {
      stRekap.page = Number(p.dataset.pg.split(':')[1]); gambarRekap();
      $('rkHasil').scrollIntoView({ block:'start', behavior:'smooth' });
    }
  });

  await gambarRekap();
}

async function hitungRekap() {
  const rows = rekapPerSantri(lingkupDetail(await muatDetail()));
  const k = stRekap.cari.toLowerCase();
  return rows
    .filter(s => !stRekap.kelas || s.kelas === stRekap.kelas)
    .filter(s => !k || String(s.nama).toLowerCase().includes(k) || String(s.nisn).toLowerCase().includes(k))
    .map(s => {
      const daftar = s.daftar.filter(d => stRekap.kategori === 'Semua' || d.kategori === stRekap.kategori);
      return daftar.length ? { ...s, daftar } : null;
    })
    .filter(Boolean);
}

async function gambarRekap() {
  const rows = await hitungRekap();
  const pages = Math.max(1, Math.ceil(rows.length / stRekap.size));
  if (stRekap.page > pages) stRekap.page = pages;
  const from = (stRekap.page - 1) * stRekap.size;
  const hal = rows.slice(from, from + stRekap.size);

  $('queryTime').textContent = `rekap · ${angka(rows.length)} santri`;

  if (!rows.length) {
    $('rkHasil').innerHTML = kosong('Tidak ditemukan santri dengan kriteria ini.',
      'Ubah kategori, kelas, atau kata kunci pencarian.', 'fa-layer-group');
    $('pgRk').innerHTML = '';
    return;
  }

  $('rkHasil').innerHTML = hal.map(s => {
    const total = s.daftar.reduce((a,d) => a + d.jumlah, 0);
    return `<div class="rekap-item">
      <div class="hd">
        <div style="min-width:0">
          <b>${esc(s.nama)}</b>
          <span class="id">${esc(s.nisn)} · ${esc(s.kelas)}</span>
        </div>
        <div style="display:flex;gap:8px;align-items:center;flex:none">
          <span class="tag tag-off">Total ${total}x</span>
          <button class="btn-link" data-detail="${esc(s.nisn)}">Detail</button>
        </div>
      </div>
      <ul>${s.daftar.map(d => `<li>
        ${stRekap.kategori === 'Semua' ? `<span class="tag ${tagKategori(d.kategori)}">${esc(d.kategori)}</span>` : ''}
        <span class="txt">${esc(d.deskripsi)}</span>
        <span class="qty">${d.jumlah}x</span></li>`).join('')}</ul>
    </div>`;
  }).join('');

  $('pgRk').innerHTML = pager('rk', stRekap.page, rows.length, stRekap.size);
}

// ---------------------------------------------------------------------
const stIzin = { filter:'Semua', cari:'', page:1, size:30 };

async function viewPerizinan() {
  $('viewRoot').innerHTML = kartu('Pusat Perizinan', `
    <div class="chips" id="izinChips">
      ${['Semua','Pending','Sesuai Waktu','Telat Balik'].map(f =>
        `<button class="chip ${f===stIzin.filter?'on':''}" data-filter="${f}">${f}</button>`).join('')}
    </div>
    <div class="filters">
      <input id="izCari" class="input grow" placeholder="Cari santri, kelas, atau alasan…" value="${esc(stIzin.cari)}">
    </div>
    <div id="izinGrid" class="izin-grid"><div style="padding:20px;color:var(--text-3)">Memuat…</div></div>
    <div id="pgIzin"></div>`,
    bolehTulis() && bolehPerizinan()
      ? `<button class="btn btn-primary btn-sm" id="btnAddIzin"><i class="fa-solid fa-plus"></i>Ajukan Izin</button>` : '');

  $('izCari').addEventListener('input', debounce(e => {
    stIzin.cari = e.target.value.trim(); stIzin.page = 1; gambarIzin(); }, 250));
  $('btnAddIzin')?.addEventListener('click', modalAjukanIzin);

  onKlik(async (e) => {
    const f = e.target.closest('[data-filter]');
    if (f) {
      stIzin.filter = f.dataset.filter; stIzin.page = 1;
      document.querySelectorAll('#izinChips .chip').forEach(c => c.classList.toggle('on', c === f));
      return gambarIzin();
    }
    const p = e.target.closest('[data-pg]');
    if (p && p.dataset.pg.startsWith('izin:')) {
      stIzin.page = Number(p.dataset.pg.split(':')[1]);
      gambarIzin();
      $('izinGrid').scrollIntoView({ block:'start', behavior:'smooth' });
      return;
    }
    const i = e.target.closest('[data-izin]');
    if (i) return prosesIzin(...i.dataset.izin.split('|'));
  });

  await gambarIzin();
}

async function gambarIzin() {
  const semua = await muatIzin();
  const nisnBoleh = perluFilterKelas()
    ? new Set(filterBinaan(await muatSiswa(), 'kelas').map(s => String(s.nisn))) : null;

  let rows = semua.filter(p => stIzin.filter === 'Semua' || p.status_persetujuan === stIzin.filter);
  if (nisnBoleh) rows = rows.filter(p => nisnBoleh.has(String(p.nisn)));
  if (stIzin.cari) {
    const k = stIzin.cari.toLowerCase();
    rows = rows.filter(p => [p.siswa?.nama_siswa, p.siswa?.kelas, p.alasan, p.nisn, p.pemberi_izin]
      .some(v => String(v||'').toLowerCase().includes(k)));
  }

  const pages = Math.max(1, Math.ceil(rows.length / stIzin.size));
  if (stIzin.page > pages) stIzin.page = pages;
  const from = (stIzin.page - 1) * stIzin.size;
  const hal = rows.slice(from, from + stIzin.size);

  $('queryTime').textContent = `perizinan · ${angka(rows.length)} kartu`;

  $('izinGrid').innerHTML = hal.map(p => `
    <div class="izin">
      <div class="top">
        <div style="min-width:0">
          <p style="margin:0;font-weight:700;font-size:13.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
            ${esc(p.siswa?.nama_siswa || '(tidak ditemukan)')}</p>
          <p style="margin:2px 0 0;font-size:11.5px;color:var(--text-3)" class="mono">
            ${esc(p.nisn)} · ${esc(p.siswa?.kelas || '-')}</p>
        </div>
        <span class="tag ${tagIzin(p.status_persetujuan)}">${esc(p.status_persetujuan)}</span>
      </div>
      <div class="lines">
        <span><i class="fa-regular fa-calendar-days"></i>${tgl(p.tanggal_mulai)} s/d ${tgl(p.tanggal_selesai)}</span>
        <span><i class="fa-regular fa-bookmark"></i>${esc(p.jenis_izin || '-')}</span>
        <span><i class="fa-regular fa-comment-dots"></i>${esc(p.alasan || '-')}</span>
        <span><i class="fa-regular fa-user"></i>Diajukan oleh ${esc(p.pemberi_izin || '-')}</span>
      </div>
      ${p.status_persetujuan === 'Pending' && bolehPerizinan() && !hanyaBaca() ? `
        <div class="acts">
          <button class="btn btn-danger btn-sm" data-izin="${esc(p.id_izin)}|Telat Balik">
            <i class="fa-solid fa-clock-rotate-left"></i>Telat Balik</button>
          <button class="btn btn-ok btn-sm" data-izin="${esc(p.id_izin)}|Sesuai Waktu">
            <i class="fa-solid fa-check"></i>Sesuai Waktu</button>
        </div>` : ''}
    </div>`).join('') || kosong('Tidak ada data perizinan.', 'Ubah filter status atau kata kunci.', 'fa-door-open');

  $('pgIzin').innerHTML = rows.length ? pager('izin', stIzin.page, rows.length, stIzin.size) : '';
}

async function modalAjukanIzin() {
  const res = await Swal.fire({
    title:'Ajukan Perizinan', width: 540, showCancelButton:true,
    confirmButtonText:'Simpan', cancelButtonText:'Batal', confirmButtonColor:'#14618B',
    showLoaderOnConfirm:true, allowOutsideClick:() => !Swal.isLoading(),
    html:`<div class="stack">
      <div class="field"><label class="label">Santri</label>
        <input id="zNisn" class="input" autocomplete="off" placeholder="Ketik nama atau NISN…">
        <p class="hint">Pilih dari daftar saran agar NISN terbaca dengan benar.</p></div>
      <div class="duo">
        <div class="field"><label class="label">Tanggal Mulai</label>
          <input id="zMulai" type="date" class="input" value="${hariIni()}"></div>
        <div class="field"><label class="label">Tanggal Selesai</label>
          <input id="zSelesai" type="date" class="input" value="${hariIni()}"></div>
      </div>
      <div class="field"><label class="label">Jenis Izin</label>
        <select id="zJenis" class="input">
          <option>Keperluan</option><option>Sakit</option><option>Pemberitahuan</option>
        </select></div>
      <div class="field"><label class="label">Alasan</label>
        <textarea id="zAlasan" class="input" rows="2" placeholder="Contoh: dijemput orang tua untuk keperluan keluarga."></textarea></div>
    </div>`,
    didOpen: () => { saranSantri($('zNisn')); setTimeout(() => $('zNisn').focus(), 120); },
    preConfirm: async () => {
      const zNisn = $('zNisn');
      const nisn = zNisn.dataset.picked || zNisn.value.split(' - ')[0].trim();
      if (!nisn) { Swal.showValidationMessage('Santri belum dipilih.'); return false; }
      const mulai = $('zMulai').value, selesai = $('zSelesai').value;
      if (!mulai || !selesai) { Swal.showValidationMessage('Tanggal mulai dan selesai wajib diisi.'); return false; }
      if (selesai < mulai) { Swal.showValidationMessage('Tanggal selesai tidak boleh lebih awal dari tanggal mulai.'); return false; }
      const { error } = await db.rpc('ajukan_perizinan', {
        p_nisn: nisn, p_mulai: mulai, p_selesai: selesai,
        p_jenis: $('zJenis').value, p_alasan: $('zAlasan').value.trim()
      });
      if (error) { Swal.showValidationMessage(error.message); return false; }
      return true;
    }
  });
  if (res.isConfirmed) {
    cacheHapus('izin');
    sync('done', 'Izin tersimpan');
    toast('success','Permohonan izin tersimpan');
    gambarIzin(); refreshBadgePending();
  }
}

async function refreshBadgePending() {
  if (!bolehPerizinan()) return;
  const { count } = await db.from('log_perizinan')
    .select('id_izin', { count:'exact', head:true }).eq('status_persetujuan','Pending');
  const b = $('badgePending');
  b.textContent = count > 99 ? '99+' : String(count || 0);
  b.classList.toggle('hidden', !count);
  b.title = count ? `${count} izin menunggu keterangan balik` : '';
}

async function prosesIzin(idIzin, keputusan) {
  const r = await Swal.fire({ icon:'question', title:`Tandai "${keputusan}"?`,
    showCancelButton:true, confirmButtonText:'Ya, simpan', cancelButtonText:'Batal',
    confirmButtonColor: keputusan === 'Sesuai Waktu' ? '#0F766E' : '#9F1239' });
  if (!r.isConfirmed) return;
  sync('saving', 'Memproses izin…');
  try {
    await q(db.rpc('proses_perizinan', { p_id_izin: idIzin, p_keputusan: keputusan }), 'proses_izin');
    cacheHapus('izin', 'siswa');
    sync('done', 'Izin diperbarui');
    toast('success', 'Status izin: ' + keputusan);
    gambarIzin(); refreshBadgePending();
  } catch (err) { sync('warn', 'Gagal memproses'); fireError(err); }
}


const stBina = { cari:'', kategori:'', status:'', mode:'', page:1, size:30 };

function tahapBina(r) { const t = Number(r.pengulangan_ke) || 0; return t > 0 ? t : null; }
function bentukBina(r) { return r.instrumen_pembinaan || r.bentuk_pembinaan || '-'; }

async function viewPembinaan() {
  $('viewRoot').innerHTML = `
    <div class="stats" id="binaKpi"></div>
    ${kartu('Instruksi Pembinaan', `
      <div class="filters">
        <input id="pbCari" class="input grow" placeholder="Cari santri, instrumen, atau pemicu…" value="${esc(stBina.cari)}">
        <select id="pbKategori" class="input"><option value="">Semua Kategori</option>
          ${['Ringan','Sedang','Berat'].map(k => `<option ${k===stBina.kategori?'selected':''}>${k}</option>`).join('')}</select>
        <select id="pbStatus" class="input"><option value="">Semua Status</option>
          ${['Dalam Proses','Selesai'].map(k => `<option ${k===stBina.status?'selected':''}>${k}</option>`).join('')}</select>
        <select id="pbMode" class="input"><option value="">Semua Mode</option>
          ${['Otomatis','Manual'].map(k => `<option ${k===stBina.mode?'selected':''}>${k}</option>`).join('')}</select>
        <span class="sep"></span>
        <span class="tag tag-off" id="pbCount">0 data</span>
      </div>
      <div class="tbl"><table>
        <thead><tr><th>Tanggal</th><th>Santri</th><th>Kategori</th><th class="center">Tahap</th>
          <th>Bentuk Pembinaan</th><th>Pemicu</th><th>Mode</th><th>Status</th><th class="right">Aksi</th></tr></thead>
        <tbody id="tbBina"><tr><td colspan="9" style="padding:26px;text-align:center;color:var(--text-3)">Memuat…</td></tr></tbody>
      </table></div>
      <div class="scroll-hint"><i class="fa-solid fa-arrows-left-right"></i>Geser ke samping untuk kolom lainnya.</div>
      <div id="pgBina"></div>`,
      `<button class="btn btn-ghost btn-sm" id="pbRefresh"><i class="fa-solid fa-rotate"></i>Muat Ulang</button>`,
      'Instrumen ditentukan otomatis oleh aturan Master Pembinaan di backend.')}`;

  ['pbKategori','pbStatus','pbMode'].forEach(id => $(id).addEventListener('change', e => {
    stBina[{pbKategori:'kategori', pbStatus:'status', pbMode:'mode'}[id]] = e.target.value;
    stBina.page = 1; gambarBina();
  }));
  $('pbCari').addEventListener('input', debounce(e => {
    stBina.cari = e.target.value.trim(); stBina.page = 1; gambarBina(); }, 220));
  $('pbRefresh').addEventListener('click', async () => {
    cacheHapus('pembinaan'); await gambarBina(); toast('success','Data dimuat ulang'); });

  onKlik(async (e) => {
    const p = e.target.closest('[data-pg]');
    if (p && p.dataset.pg.startsWith('bina:')) {
      stBina.page = Number(p.dataset.pg.split(':')[1]);
      await gambarBina();
      $('tbBina').scrollIntoView({ block:'start', behavior:'smooth' });
      return;
    }
    const b = e.target.closest('[data-pbn]');
    if (!b) return;
    const [id, status] = b.dataset.pbn.split('|');
    ubahStatusPembinaan(id, status, b);
  });

  await gambarBina();
}

async function bahanBina() {
  const rows = (await muatPembinaan()).filter(aktifPembinaan).map(r => ({
    ...r,
    nama_siswa: r.siswa?.nama_siswa || '(tidak ditemukan)',
    kelas: r.siswa?.kelas || '-'
  }));
  return filterBinaan(rows, 'kelas');
}

async function gambarBina() {
  const semua = await bahanBina();

  const total = semua.length;
  const proses = semua.filter(r => r.status_pembinaan !== 'Selesai').length;
  const otomatis = semua.filter(r => String(r.mode_pembinaan) === 'Otomatis').length;
  $('binaKpi').innerHTML =
    stat('Total Instruksi', angka(total), 'fa-solid fa-list', 'background:#EFF3F6;color:var(--text-2)', 'var(--text-3)') +
    stat('Dalam Proses', angka(proses), 'fa-solid fa-hourglass-half', 'background:var(--amber-bg);color:var(--amber)', 'var(--amber)') +
    stat('Selesai', angka(total - proses), 'fa-solid fa-circle-check', 'background:var(--teal-bg);color:var(--teal)', 'var(--teal)') +
    stat('Dibuat Otomatis', angka(otomatis), 'fa-solid fa-robot', 'background:#E7F1F7;color:var(--sea)', 'var(--sea)');

  const k = stBina.cari.toLowerCase();
  const rows = semua.filter(r => {
    if (stBina.kategori && r.kategori !== stBina.kategori) return false;
    if (stBina.status && String(r.status_pembinaan || 'Dalam Proses') !== stBina.status) return false;
    if (stBina.mode && String(r.mode_pembinaan || 'Manual') !== stBina.mode) return false;
    if (!k) return true;
    return [r.nisn, r.nama_siswa, r.kelas, r.kategori, bentukBina(r),
            r.deskripsi_pelanggaran, r.catatan_pembinaan, r.id_aturan, r.mode_pembinaan]
      .some(v => String(v||'').toLowerCase().includes(k));
  });

  const pages = Math.max(1, Math.ceil(rows.length / stBina.size));
  if (stBina.page > pages) stBina.page = pages;
  const from = (stBina.page - 1) * stBina.size;
  const hal = rows.slice(from, from + stBina.size);

  $('pbCount').textContent = `${angka(rows.length)} dari ${angka(semua.length)} data`;
  $('queryTime').textContent = `pembinaan · ${angka(rows.length)} baris`;

  const editable = bolehPembinaan() && !hanyaBaca();
  $('tbBina').innerHTML = hal.map(r => {
    const selesai = String(r.status_pembinaan) === 'Selesai';
    const tahap = tahapBina(r);
    const catatan = String(r.catatan_pembinaan || '').trim();
    const tampilCatatan = catatan && !/^Pembinaan otomatis kategori /i.test(catatan);
    return `<tr>
      <td class="nowrap"><div class="secondary" style="margin:0">${tgl(r.tanggal_pembinaan)}</div>
        <div class="secondary" style="font-size:10px">${esc(r.id_pembinaan||'')}</div></td>
      <td><div class="primary">${esc(r.nama_siswa)}</div>
          <div class="secondary">${esc(r.nisn)} · ${esc(r.kelas)}</div></td>
      <td><span class="tag ${tagKategori(r.kategori)}">${esc(r.kategori||'-')}</span></td>
      <td class="center">${tahap ? `<span class="tag tag-sea">Ke-${tahap}</span>` : '<span class="tag tag-off">—</span>'}</td>
      <td><div class="primary">${esc(bentukBina(r))}</div>
        ${r.id_aturan ? `<div class="secondary">${esc(r.id_aturan)}</div>` : ''}
        ${tampilCatatan ? `<div style="font-size:11.5px;color:var(--text-3);margin-top:5px">${esc(catatan)}</div>` : ''}</td>
      <td style="font-size:12.5px;color:var(--text-2);max-width:240px">${esc(r.deskripsi_pelanggaran||'-')}</td>
      <td><span class="tag ${String(r.mode_pembinaan)==='Otomatis'?'tag-sea':'tag-off'}">${esc(r.mode_pembinaan||'Manual')}</span></td>
      <td><span class="tag ${selesai?'tag-ok':'tag-wait'}">${esc(r.status_pembinaan||'Dalam Proses')}</span></td>
      <td class="right">${editable
        ? `<button class="btn ${selesai?'btn-ghost':'btn-ok'} btn-sm" data-pbn="${esc(r.id_pembinaan)}|${selesai?'Dalam Proses':'Selesai'}">
            <i class="fa-solid ${selesai?'fa-arrow-rotate-left':'fa-circle-check'}"></i>${selesai?'Buka Lagi':'Selesaikan'}</button>`
        : '<span class="tag tag-off">Hanya baca</span>'}</td>
    </tr>`;
  }).join('') || barisKosong(9, 'Belum ada instruksi pembinaan.', 'Pembinaan otomatis terbentuk setelah pelanggaran dicatat.');

  $('pgBina').innerHTML = rows.length ? pager('bina', stBina.page, rows.length, stBina.size) : '';
  tandaiTabelBisaGeser();
}

async function ubahStatusPembinaan(id, status, btn) {
  const selesai = status === 'Selesai';
  const konf = await Swal.fire({
    icon: selesai ? 'question' : 'warning',
    title: selesai ? 'Tandai pembinaan selesai?' : 'Buka kembali pembinaan?',
    text: `Status akan menjadi "${status}".`,
    showCancelButton:true, confirmButtonText: selesai ? 'Ya, selesai' : 'Ya, buka lagi',
    cancelButtonText:'Batal', confirmButtonColor: selesai ? '#0F766E' : '#B45309' });
  if (!konf.isConfirmed) return;

  const asli = mulaiSimpan(btn, 'Menyimpan…');
  try {
    await q(db.rpc('ubah_status_pembinaan', { p_id:id, p_status:status }), 'pembinaan');
    cacheHapus('pembinaan');
    selesaiSimpan(btn, asli, true, 'Status diperbarui');
    toast('success', 'Status pembinaan: ' + status);
    await gambarBina();
  } catch (err) { selesaiSimpan(btn, asli, false); fireError(err); }
}

function rekapPembinaanPerSantri(rows) {
  const peta = new Map();
  rows.forEach(r => {
    const nisn = String(r.nisn || '').trim(); if (!nisn) return;
    if (!peta.has(nisn)) peta.set(nisn, {
      nisn, nama: r.nama_siswa, kelas: r.kelas,
      Ringan:0, Sedang:0, Berat:0, proses:0, selesai:0, total:0,
      tahap:null, katAkhir:'-', bentukAkhir:'-', tglAkhir:'', mode:'' });
    const o = peta.get(nisn);
    if (['Ringan','Sedang','Berat'].includes(r.kategori)) o[r.kategori]++;
    if (String(r.status_pembinaan) === 'Selesai') o.selesai++; else o.proses++;
    o.total++;
    const cur = kunciTgl(r.tanggal_pembinaan);
    if (!o.tglAkhir || cur >= o.tglAkhir) {
      o.tglAkhir = cur; o.tahap = tahapBina(r); o.katAkhir = r.kategori || '-';
      o.bentukAkhir = bentukBina(r); o.mode = r.mode_pembinaan || 'Manual';
    }
  });
  return [...peta.values()].sort((a,b) => (b.proses - a.proses) || (b.total - a.total));
}

// ---------------------------------------------------------------------
// 17. REKAP PEMBINAAN PER SANTRI
// ---------------------------------------------------------------------
const stRb = { cari:'', kelas:'', status:'', page:1, size:30 };

async function viewRekapPembinaan() {
  const kelasList = await muatDaftarKelas();

  $('viewRoot').innerHTML = `
    <div class="stats" id="rbKpi"></div>
    ${kartu('Rekap Pembinaan per Santri', `
      <div class="filters">
        <input id="rbCari" class="input grow" placeholder="Cari santri, kelas, atau instrumen…" value="${esc(stRb.cari)}">
        <select id="rbKelas" class="input"><option value="">Semua Kelas</option>
          ${kelasList.map(k => `<option ${k===stRb.kelas?'selected':''}>${esc(k)}</option>`).join('')}</select>
        <select id="rbStatus" class="input"><option value="">Semua Kondisi</option>
          <option ${stRb.status==='Dalam Proses'?'selected':''}>Dalam Proses</option>
          <option ${stRb.status==='Selesai'?'selected':''}>Selesai</option></select>
        <span class="sep"></span>
        <span class="tag tag-off" id="rbCount">0 santri</span>
      </div>
      <div class="tbl"><table>
        <thead><tr><th>Santri</th><th>Kelas</th><th class="center">Ringan</th><th class="center">Sedang</th>
          <th class="center">Berat</th><th class="center">Proses</th><th class="center">Selesai</th>
          <th>Instrumen Terakhir</th></tr></thead>
        <tbody id="tbRb"><tr><td colspan="8" style="padding:26px;text-align:center;color:var(--text-3)">Memuat…</td></tr></tbody>
      </table></div>
      <div class="scroll-hint"><i class="fa-solid fa-arrows-left-right"></i>Geser ke samping untuk kolom lainnya.</div>
      <div id="pgRb"></div>`)}`;

  $('rbCari').addEventListener('input', debounce(e => {
    stRb.cari = e.target.value.trim(); stRb.page = 1; gambarRb(); }, 220));
  $('rbKelas').addEventListener('change', e => { stRb.kelas = e.target.value; stRb.page = 1; gambarRb(); });
  $('rbStatus').addEventListener('change', e => { stRb.status = e.target.value; stRb.page = 1; gambarRb(); });

  onKlik(e => {
    const p = e.target.closest('[data-pg]');
    if (p && p.dataset.pg.startsWith('rb:')) {
      stRb.page = Number(p.dataset.pg.split(':')[1]);
      gambarRb();
      $('tbRb').scrollIntoView({ block:'start', behavior:'smooth' });
      return;
    }
    const d = e.target.closest('[data-detail]');
    if (d) bukaDetailSantri(d.dataset.detail);
  });

  await gambarRb();
}

async function gambarRb() {
  const semua = await bahanBina();
  const rekap = rekapPembinaanPerSantri(semua);

  $('rbKpi').innerHTML =
    stat('Santri Dibina', angka(rekap.length), 'fa-solid fa-user-group', 'background:#E7F1F7;color:var(--sea)', 'var(--sea)') +
    stat('Kategori Ringan', angka(semua.filter(r => r.kategori==='Ringan').length), 'fa-solid fa-leaf', 'background:var(--teal-bg);color:var(--teal)', 'var(--teal)') +
    stat('Kategori Sedang', angka(semua.filter(r => r.kategori==='Sedang').length), 'fa-solid fa-triangle-exclamation', 'background:var(--amber-bg);color:var(--amber)', 'var(--amber)') +
    stat('Kategori Berat', angka(semua.filter(r => r.kategori==='Berat').length), 'fa-solid fa-circle-exclamation', 'background:var(--maroon-bg);color:var(--maroon)', 'var(--maroon)');

  const k = stRb.cari.toLowerCase();
  const rows = rekap.filter(r => {
    if (stRb.kelas && r.kelas !== stRb.kelas) return false;
    if (stRb.status === 'Dalam Proses' && r.proses < 1) return false;
    if (stRb.status === 'Selesai' && r.proses > 0) return false;
    if (!k) return true;
    return [r.nisn, r.nama, r.kelas, r.bentukAkhir, r.katAkhir]
      .some(v => String(v||'').toLowerCase().includes(k));
  });

  const pages = Math.max(1, Math.ceil(rows.length / stRb.size));
  if (stRb.page > pages) stRb.page = pages;
  const from = (stRb.page - 1) * stRb.size;
  const hal = rows.slice(from, from + stRb.size);

  $('rbCount').textContent = `${angka(rows.length)} santri`;
  $('tbRb').innerHTML = hal.map(r => `<tr>
    <td><div class="primary">${esc(r.nama)}</div>
        <div class="secondary">${esc(r.nisn)}</div></td>
    <td class="nowrap">${esc(r.kelas)}</td>
    <td class="num center" style="color:var(--teal)">${r.Ringan}</td>
    <td class="num center" style="color:var(--amber)">${r.Sedang}</td>
    <td class="num center" style="color:var(--maroon)">${r.Berat}</td>
    <td class="num center" style="color:var(--amber)">${r.proses}</td>
    <td class="num center" style="color:var(--teal)">${r.selesai}</td>
    <td style="min-width:250px">
      <div style="display:flex;gap:7px;align-items:center;flex-wrap:wrap;margin-bottom:5px">
        <span class="tag ${tagKategori(r.katAkhir)}">${esc(r.katAkhir)}</span>
        ${r.tahap ? `<span class="tag tag-sea">Tahap ke-${r.tahap}</span>` : `<span class="tag tag-off">Legacy</span>`}
      </div>
      <div class="primary" style="font-size:12.5px">${esc(r.bentukAkhir)}</div>
      <div class="secondary">${tgl(r.tglAkhir)}</div>
      <button class="btn-link" data-detail="${esc(r.nisn)}" style="margin-top:5px">Lihat riwayat santri</button>
    </td>
  </tr>`).join('') || barisKosong(8, 'Belum ada rekap pembinaan.', 'Rekap terbentuk otomatis dari instruksi pembinaan.');

  $('pgRb').innerHTML = rows.length ? pager('rb', stRb.page, rows.length, stRb.size) : '';
  tandaiTabelBisaGeser();
}

// ---------------------------------------------------------------------
// 18. MASTER PELANGGARAN & MASTER BIDANG
// ---------------------------------------------------------------------
const stMaster = { cari:'' };

async function viewMaster() {
  if (!bolehMaster()) { $('viewRoot').innerHTML = kosong('Akses dibatasi.',
    `Role ${role()} tidak memiliki akses ke Master Pelanggaran.`, 'fa-lock'); return; }

  cacheHapus('master','bidang');
  const [master, bidang] = await Promise.all([muatMaster(), muatBidang()]);

  $('viewRoot').innerHTML = `
    ${kartu('Master Pelanggaran', `
      <div class="filters">
        <input id="msCari" class="input grow" placeholder="Cari kode, nama, kategori, atau bidang…" value="${esc(stMaster.cari)}">
        <span class="sep"></span>
        <span class="tag tag-off" id="msCount"></span>
      </div>
      <div class="tbl"><table>
        <thead><tr><th>Kode</th><th>Nama Pelanggaran</th><th>Kategori</th><th class="center">Bobot</th>
          <th>Sumber</th><th>Bidang</th><th>Jenjang</th><th class="right">Aksi</th></tr></thead>
        <tbody id="tbMaster"></tbody>
      </table></div>
      <div class="scroll-hint"><i class="fa-solid fa-arrows-left-right"></i>Geser ke samping untuk kolom lainnya.</div>`,
      isAdmin() ? `<button class="btn btn-primary btn-sm" id="btnAddMaster"><i class="fa-solid fa-plus"></i>Tambah Jenis</button>` : '',
      `Menampilkan referensi untuk unit: ${labelKonteks()}`)}

    ${kartu('Master Bidang', `
      <div class="card-note"><i class="fa-solid fa-circle-info"></i>
        Bidang/divisi menjadi dasar pengelompokan laporan. Nama, kata kunci, dan status aktif
        dapat diperbarui tanpa mengubah kode aplikasi.</div>
      <div class="tbl"><table>
        <thead><tr><th>Bidang</th><th>Deskripsi</th><th>Kata Kunci</th><th>Sumber</th>
          <th>Jenjang</th><th>Status</th><th class="right">Aksi</th></tr></thead>
        <tbody id="tbBidang"></tbody>
      </table></div>`,
      isAdmin() ? `<button class="btn btn-primary btn-sm" id="btnAddBidang"><i class="fa-solid fa-plus"></i>Tambah Bidang</button>` : '')}`;

  $('msCari').addEventListener('input', debounce(e => { stMaster.cari = e.target.value.trim(); gambarMaster(); }, 220));
  $('btnAddMaster')?.addEventListener('click', () => modalMaster(null));
  $('btnAddBidang')?.addEventListener('click', () => modalBidang(null));

  onKlik(async (e) => {
    const m = e.target.closest('[data-master]');
    if (m) return modalMaster((await muatMaster()).find(x => x.kode_pelanggaran === m.dataset.master));
    const b = e.target.closest('[data-bidang]');
    if (b) return modalBidang((await muatBidang()).find(x => String(x.id_bidang) === b.dataset.bidang));
  });

  gambarMaster();
  gambarBidang(bidang);
}

async function gambarMaster() {
  const rows = cariLokal(lingkupMaster(await muatMaster()), stMaster.cari,
    ['kode_pelanggaran','nama_pelanggaran','kategori','bidang','sumber','jenjang'], 999);
  $('msCount').textContent = `${angka(rows.length)} jenis`;
  $('tbMaster').innerHTML = rows.map(m => `<tr>
    <td class="secondary nowrap" style="padding-top:14px">${esc(m.kode_pelanggaran)}</td>
    <td><div class="primary">${esc(m.nama_pelanggaran)}</div></td>
    <td><span class="tag ${tagKategori(m.kategori)}">${esc(m.kategori)}</span></td>
    <td class="num center">${m.bobot_poin}</td>
    <td>${esc(m.sumber||'-')}</td>
    <td><span class="tag tag-sea">${esc(m.bidang||'Belum Dipetakan')}</span></td>
    <td>${esc(m.jenjang||'Semua')}</td>
    <td class="right">${isAdmin()
      ? `<button class="btn-link" data-master="${esc(m.kode_pelanggaran)}"><i class="fa-solid fa-pen-to-square"></i> Ubah</button>`
      : '<span class="tag tag-off">Hanya baca</span>'}</td>
  </tr>`).join('') || barisKosong(8, 'Belum ada master pelanggaran pada unit ini.', 'Tambahkan jenis baru atau ganti unit aktif.');
  tandaiTabelBisaGeser();
}

function gambarBidang(list) {
  let rows = list || [];
  if (APP.ctx.unit !== 'Semua') rows = rows.filter(b => String(b.sumber||'') === APP.ctx.unit);
  $('tbBidang').innerHTML = rows.map(b => {
    const aktif = String(b.aktif ?? 'Ya').toLowerCase() !== 'tidak';
    return `<tr>
      <td><div class="primary">${esc(b.nama_bidang||'-')}</div></td>
      <td style="font-size:12.5px;color:var(--text-2);max-width:280px">${esc(b.deskripsi||'-')}</td>
      <td class="secondary" style="padding-top:14px">${esc(b.kata_kunci||'-')}</td>
      <td>${esc(b.sumber||'-')}</td>
      <td>${esc(b.jenjang||'Semua')}</td>
      <td><span class="tag ${aktif?'tag-ok':'tag-off'}">${aktif?'Aktif':'Nonaktif'}</span></td>
      <td class="right">${isAdmin()
        ? `<button class="btn-link" data-bidang="${esc(b.id_bidang||'')}"><i class="fa-solid fa-pen-to-square"></i> Ubah</button>`
        : '<span class="tag tag-off">Hanya baca</span>'}</td>
    </tr>`;
  }).join('') || barisKosong(7, 'Belum ada Master Bidang.', 'Tambahkan bidang agar laporan per divisi lebih rapi.');
}

async function modalMaster(existing) {
  const bidang = await muatBidang();
  const ubah = !!existing;
  const m = existing || {};
  const res = await Swal.fire({
    title: ubah ? 'Ubah Jenis Pelanggaran' : 'Tambah Jenis Pelanggaran',
    width: 600, showCancelButton:true, confirmButtonText:'Simpan', cancelButtonText:'Batal',
    confirmButtonColor:'#14618B', showLoaderOnConfirm:true, allowOutsideClick:() => !Swal.isLoading(),
    html:`<div class="stack">
      <div class="duo">
        <div class="field"><label class="label">Kode</label>
          <input id="mKode" class="input mono" value="${esc(m.kode_pelanggaran||'')}" ${ubah?'readonly':''}
                 placeholder="PG001 / MD001"></div>
        <div class="field"><label class="label">Bobot Poin</label>
          <input id="mBobot" type="number" min="0" class="input" value="${m.bobot_poin ?? 5}"></div>
      </div>
      <div class="field"><label class="label">Nama Pelanggaran</label>
        <input id="mNama" class="input" value="${esc(m.nama_pelanggaran||'')}"
               placeholder="Contoh: Terlambat shalat berjamaah"></div>
      <div class="trio">
        <div class="field"><label class="label">Kategori</label>
          <select id="mKategori" class="input">${['Ringan','Sedang','Berat']
            .map(k => `<option ${k===m.kategori?'selected':''}>${k}</option>`).join('')}</select></div>
        <div class="field"><label class="label">Sumber</label>
          <select id="mSumber" class="input">${['Pengasuhan','Madrasah']
            .map(k => `<option ${k===(m.sumber||(APP.ctx.unit!=='Semua'?APP.ctx.unit:'Pengasuhan'))?'selected':''}>${k}</option>`).join('')}</select></div>
        <div class="field"><label class="label">Jenjang</label>
          <select id="mJenjang" class="input">${['Semua','MTs','MA']
            .map(k => `<option ${k===(m.jenjang||(APP.ctx.jenjang!=='Semua'?APP.ctx.jenjang:'Semua'))?'selected':''}>${k}</option>`).join('')}</select></div>
      </div>
      <div class="field"><label class="label">Bidang</label>
        <input id="mBidang" class="input" autocomplete="off" value="${esc(m.bidang||'')}"
               placeholder="Ketik: ubu, bahasa, atribut…">
        <p class="hint">Dipilih dari Master Bidang. ${bidang.length ? '' : 'Master Bidang masih kosong — isi terlebih dahulu.'}</p></div>
    </div>`,
    didOpen: () => saranBidang($('mBidang')),
    preConfirm: async () => {
      const payload = {
        kode_pelanggaran: $('mKode').value.trim(),
        nama_pelanggaran: $('mNama').value.trim(),
        kategori: $('mKategori').value,
        bobot_poin: Number($('mBobot').value) || 0,
        sumber: $('mSumber').value,
        bidang: $('mBidang').value.trim(),
        jenjang: $('mJenjang').value
      };
      if (!payload.kode_pelanggaran || !payload.nama_pelanggaran) {
        Swal.showValidationMessage('Kode dan nama pelanggaran wajib diisi.'); return false;
      }
      if (!payload.bidang) { Swal.showValidationMessage('Bidang wajib dipilih.'); return false; }
      const { error } = ubah
        ? await db.from('master_pelanggaran').update(payload).eq('kode_pelanggaran', payload.kode_pelanggaran)
        : await db.from('master_pelanggaran').insert(payload);
      if (error) { Swal.showValidationMessage(error.message); return false; }
      return true;
    }
  });
  if (res.isConfirmed) {
    cacheHapus('master');
    sync('done', 'Master tersimpan');
    toast('success', ubah ? 'Jenis pelanggaran diperbarui' : 'Jenis pelanggaran ditambahkan');
    gambarMaster();
  }
}

async function modalBidang(existing) {
  const ubah = !!existing;
  const b = existing || {};
  const res = await Swal.fire({
    title: ubah ? 'Ubah Master Bidang' : 'Tambah Master Bidang',
    width: 620, showCancelButton:true, confirmButtonText:'Simpan', cancelButtonText:'Batal',
    confirmButtonColor:'#14618B', showLoaderOnConfirm:true, allowOutsideClick:() => !Swal.isLoading(),
    html:`<div class="stack">
      <div class="field"><label class="label">Nama Bidang</label>
        <input id="bNama" class="input" value="${esc(b.nama_bidang||'')}" placeholder="Ubudiyah / Bahasa / Atribut"></div>
      <div class="field"><label class="label">Deskripsi</label>
        <textarea id="bDesk" class="input" rows="2">${esc(b.deskripsi||'')}</textarea></div>
      <div class="field"><label class="label">Kata Kunci</label>
        <input id="bKunci" class="input" value="${esc(b.kata_kunci||'')}" placeholder="ubu,ubud,ibadah,shalat">
        <p class="hint">Dipisah koma. Membantu pencarian cepat saat mengisi Master Pelanggaran.</p></div>
      <div class="trio">
        <div class="field"><label class="label">Sumber</label>
          <select id="bSumber" class="input">${['Pengasuhan','Madrasah']
            .map(k => `<option ${k===(b.sumber||'Pengasuhan')?'selected':''}>${k}</option>`).join('')}</select></div>
        <div class="field"><label class="label">Jenjang</label>
          <select id="bJenjang" class="input">${['Semua','MTs','MA']
            .map(k => `<option ${k===(b.jenjang||'Semua')?'selected':''}>${k}</option>`).join('')}</select></div>
        <div class="field"><label class="label">Status</label>
          <select id="bAktif" class="input">
            <option value="Ya" ${String(b.aktif??'Ya').toLowerCase()!=='tidak'?'selected':''}>Aktif</option>
            <option value="Tidak" ${String(b.aktif??'').toLowerCase()==='tidak'?'selected':''}>Nonaktif</option>
          </select></div>
      </div>
    </div>`,
    preConfirm: async () => {
      const payload = {
        nama_bidang: $('bNama').value.trim(),
        deskripsi: $('bDesk').value.trim(),
        kata_kunci: $('bKunci').value.trim(),
        sumber: $('bSumber').value,
        jenjang: $('bJenjang').value,
        aktif: $('bAktif').value
      };
      if (!payload.nama_bidang) { Swal.showValidationMessage('Nama bidang wajib diisi.'); return false; }
      const { error } = ubah
        ? await db.from('master_bidang').update(payload).eq('id_bidang', b.id_bidang)
        : await db.from('master_bidang').insert(payload);
      if (error) { Swal.showValidationMessage(error.message); return false; }
      return true;
    }
  });
  if (res.isConfirmed) {
    cacheHapus('bidang');
    sync('done', 'Bidang tersimpan');
    toast('success', ubah ? 'Master Bidang diperbarui' : 'Master Bidang ditambahkan');
    gambarBidang(await muatBidang());
  }
}

// ---------------------------------------------------------------------
// 19. MANAJEMEN PENGGUNA
// ---------------------------------------------------------------------
async function viewPengguna() {
  const { data } = await q(db.from('profiles').select('*').order('nama'), 'profiles');

  $('viewRoot').innerHTML = kartu('Manajemen Pengguna', `
    <div class="card-note"><i class="fa-solid fa-circle-info"></i>
      Akun baru dibuat di <b>Dashboard Supabase &gt; Authentication &gt; Users</b>,
      lalu peran, kelas binaan, dan cakupan unitnya diatur di sini.</div>
    <div class="tbl"><table>
      <thead><tr><th>Username</th><th>Nama</th><th>Peran</th><th>Kelas Binaan</th>
        <th>Cakupan</th><th>Status</th><th class="right">Aksi</th></tr></thead>
      <tbody>${(data||[]).map(u => `<tr>
        <td class="secondary nowrap" style="padding-top:14px">${esc(u.username)}</td>
        <td><div class="primary">${esc(u.nama)}</div></td>
        <td><span class="tag ${u.role==='Admin'?'tag-ok':u.role==='Pimpinan'?'tag-violet':'tag-sea'}">${esc(u.role)}</span></td>
        <td style="font-size:12.5px">${esc((u.kelas_binaan||[]).join(', ') || '-')}</td>
        <td style="font-size:12.5px">${esc(u.unit_akses||'Semua')}${u.jenjang_akses && u.jenjang_akses!=='Semua'?' · '+esc(u.jenjang_akses):''}</td>
        <td><span class="tag ${u.aktif?'tag-ok':'tag-off'}">${u.aktif?'Aktif':'Nonaktif'}</span></td>
        <td class="right"><button class="btn-link" data-edit="${esc(u.id)}">
          <i class="fa-solid fa-pen-to-square"></i> Ubah</button></td>
      </tr>`).join('') || barisKosong(7,'Belum ada pengguna.','Buat akun terlebih dahulu di dashboard Supabase.')}
      </tbody></table></div>
    <div class="scroll-hint"><i class="fa-solid fa-arrows-left-right"></i>Geser ke samping untuk kolom lainnya.</div>`);

  onKlik(async (e) => {
    const b = e.target.closest('[data-edit]'); if (!b) return;
    const u = (data||[]).find(x => x.id === b.dataset.edit);
    const res = await Swal.fire({
      title:'Ubah Pengguna', width: 560, showCancelButton:true,
      confirmButtonText:'Simpan', cancelButtonText:'Batal', confirmButtonColor:'#14618B',
      showLoaderOnConfirm:true, allowOutsideClick:() => !Swal.isLoading(),
      html:`<div class="stack">
        <div class="field"><label class="label">Nama</label>
          <input id="uNama" class="input" value="${esc(u.nama)}"></div>
        <div class="field"><label class="label">Peran</label>
          <select id="uRole" class="input">${SEMUA_ROLE
            .map(r => `<option ${r===u.role?'selected':''}>${r}</option>`).join('')}</select>
          <p class="hint">Guru, Guru BK, dan Walas wajib memiliki kelas binaan.</p></div>
        <div class="field"><label class="label">Kelas Binaan (pisahkan koma)</label>
          <input id="uKelas" class="input" value="${esc((u.kelas_binaan||[]).join(', '))}" placeholder="X-A, X-B"></div>
        <div class="trio">
          <div class="field"><label class="label">Unit Akses</label>
            <select id="uUnit" class="input">${['Semua','Pengasuhan','Madrasah']
              .map(x => `<option ${x===u.unit_akses?'selected':''}>${x}</option>`).join('')}</select></div>
          <div class="field"><label class="label">Jenjang Akses</label>
            <select id="uJenjang" class="input">${['Semua','MTs','MA']
              .map(x => `<option ${x===(u.jenjang_akses||'Semua')?'selected':''}>${x}</option>`).join('')}</select></div>
          <div class="field"><label class="label">Status</label>
            <select id="uAktif" class="input">
              <option value="true" ${u.aktif?'selected':''}>Aktif</option>
              <option value="false" ${!u.aktif?'selected':''}>Nonaktif</option>
            </select></div>
        </div></div>`,
      preConfirm: async () => {
        const peran = $('uRole').value;
        const kelas = $('uKelas').value.split(',').map(x => x.trim()).filter(Boolean);
        if (['Guru','Guru BK','Walas'].includes(peran) && !kelas.length) {
          Swal.showValidationMessage(`${peran} wajib memiliki minimal satu kelas binaan.`); return false;
        }
        const { error } = await db.from('profiles').update({
          nama: $('uNama').value.trim(), role: peran, kelas_binaan: kelas,
          unit_akses: $('uUnit').value, jenjang_akses: $('uJenjang').value,
          aktif: $('uAktif').value === 'true'
        }).eq('id', u.id);
        if (error) { Swal.showValidationMessage(error.message); return false; }
        return true;
      }
    });
    if (res.isConfirmed) { sync('done','Pengguna diperbarui'); toast('success','Pengguna diperbarui'); viewPengguna(); }
  });
}

// ---------------------------------------------------------------------
// 20. LAPORAN TERPADU: CETAK & UNDUH PDF
// ---------------------------------------------------------------------
/**
 * Hitung pengulangan NYATA per kategori dari riwayat perkembangan santri.
 *
 * Penting: fungsi ini TIDAK memakai kaskade konversi (5x Ringan -> 1 Sedang).
 * Angka "ke-N" di sini adalah jumlah sebenarnya pelanggaran pada kategori
 * tersebut, diurutkan dari tanggal terlama, sehingga selalu sinkron dengan
 * bagian "3. Riwayat Perkembangan" pada lembar cetak yang sama.
 */
function urutanPengulanganKategori(perkembangan) {
  const urut = (perkembangan || []).slice().sort((a, b) =>
    String(kunciTgl(a.tanggal)).localeCompare(String(kunciTgl(b.tanggal))));

  const total = { Ringan:0, Sedang:0, Berat:0 };
  const peta  = { Ringan:new Map(), Sedang:new Map(), Berat:new Map() };

  urut.forEach(p => {
    const kat = ['Ringan','Sedang','Berat'].includes(p.kategori) ? p.kategori : null;
    if (!kat) return;
    total[kat]++;
    peta[kat].set(total[kat], {
      tanggal: kunciTgl(p.tanggal),
      judul: p.judul || p.nama_pelanggaran || '-'
    });
  });

  return { total, peta };
}

/**
 * Susun instrumen pembinaan untuk lembar cetak.
 *
 * Aturan tampilan per kategori:
 *   1. Nomor pengulangan diambil dari kolom pengulangan_ke; bila kosong
 *      (data lama), nomor dihitung ulang dari urutan tanggal pembinaan.
 *   2. Yang dicetak hanya: pembinaan TERAKHIR yang berstatus Selesai,
 *      lalu SELURUH pembinaan yang belum diselesaikan.
 *   3. Sisanya (pembinaan lama yang sudah tertutup) tidak ikut dicetak.
 * Contoh: Ringan 10 kali, selesai s/d ke-7 -> tercetak ke-7, 8, 9, 10.
 */
function susunPembinaanCetak(pembinaan, perkembangan) {
  const KAT = ['Ringan','Sedang','Berat'];
  const { total, peta } = urutanPengulanganKategori(perkembangan);

  const bucket = new Map();
  KAT.forEach(k => bucket.set(k, []));
  (pembinaan || []).forEach(b => {
    const k = String(b.kategori || '').trim();
    const kunci = KAT.includes(k) ? k : 'Tanpa Kategori';
    if (!bucket.has(kunci)) bucket.set(kunci, []);
    bucket.get(kunci).push(b);
  });

  const hasil = [];

  bucket.forEach((list, kat) => {
    const jumlahPelanggaran = total[kat] || 0;
    if (!list.length && !jumlahPelanggaran) return;

    // Urutkan: nomor pengulangan dulu, baru tanggal.
    const urut = list.slice().sort((a, b) => {
      const ua = Number(a.pengulangan_ke) || 0, ub = Number(b.pengulangan_ke) || 0;
      if (ua && ub && ua !== ub) return ua - ub;
      return String(kunciTgl(a.tanggal_pembinaan)).localeCompare(String(kunciTgl(b.tanggal_pembinaan)));
    });

    let jalan = 0;
    const bernomor = urut.map(b => {
      const p = Number(b.pengulangan_ke) || 0;
      jalan = p > 0 ? p : jalan + 1;
      return { ...b, urutan: jalan, selesai: String(b.status_pembinaan || '').trim() === 'Selesai' };
    });

    // Satu nomor pengulangan = satu baris; catatan berstatus Selesai diutamakan.
    const unik = new Map();
    bernomor.forEach(b => {
      const ada = unik.get(b.urutan);
      if (!ada || (b.selesai && !ada.selesai)) unik.set(b.urutan, b);
    });
    const semua = [...unik.values()].sort((a, b) => a.urutan - b.urutan);

    const selesai = semua.filter(b => b.selesai);
    const terakhirSelesai = selesai.length ? selesai[selesai.length - 1] : null;

    const tampil = [];
    if (terakhirSelesai) tampil.push(terakhirSelesai);
    semua.filter(b => !b.selesai).forEach(b => { if (!tampil.includes(b)) tampil.push(b); });
    tampil.sort((a, b) => a.urutan - b.urutan);

    hasil.push({
      kategori: kat,
      totalPelanggaran: jumlahPelanggaran,
      tercatat: semua.length ? semua[semua.length - 1].urutan : 0,
      belum: semua.filter(b => !b.selesai).length,
      baris: tampil.map(b => ({
        urutan: b.urutan,
        tanggal: b.tanggal_pembinaan,
        bentuk: b.instrumen_pembinaan || b.bentuk_pembinaan || '-',
        status: b.selesai ? 'Selesai' : (b.status_pembinaan || 'Dalam Proses'),
        pemicu: (peta[kat] && peta[kat].get(b.urutan) ? peta[kat].get(b.urutan).judul : '-')
      }))
    });
  });

  const bobot = { Ringan:1, Sedang:2, Berat:3, 'Tanpa Kategori':4 };
  return hasil.sort((a, b) => (bobot[a.kategori] || 9) - (bobot[b.kategori] || 9));
}

/** Render bagian 5 laporan cetak. */
function bagianPembinaanCetak(pembinaan, perkembangan) {
  const th = (t) => `<th style="border:1px solid #cbd5e1;padding:5px;background:#f1f5f9;">${esc(t)}</th>`;
  const td = (t, c) => `<td style="border:1px solid #cbd5e1;padding:5px;${c||''}">${esc(t)}</td>`;

  const blok = susunPembinaanCetak(pembinaan, perkembangan);
  if (!blok.length) {
    return `<p style="font-size:11px;color:#94a3b8;text-align:center;padding:10px 0;">
      Belum ada instrumen pembinaan.</p>`;
  }

  return blok.map(g => {
    const ket = g.kategori === 'Tanpa Kategori'
      ? 'Tanpa kategori'
      : `${g.kategori} · ${g.totalPelanggaran} pelanggaran · sampai ke-${g.tercatat || 0}`
        + (g.belum ? ` · ${g.belum} belum selesai` : '');

    const isi = g.baris.length
      ? g.baris.map(r => `<tr>
          ${td('Ke-' + r.urutan, 'text-align:center;font-weight:bold')}
          ${td(tgl(r.tanggal))}
          ${td(r.pemicu)}
          ${td(r.bentuk)}
          ${td(r.status, r.status === 'Selesai' ? '' : 'font-weight:bold')}
        </tr>`).join('')
      : `<tr><td colspan="5" style="border:1px solid #cbd5e1;text-align:center;padding:8px;color:#94a3b8;">
          Belum ada instrumen pembinaan yang tercatat untuk kategori ini.</td></tr>`;

    return `
      <p style="font-size:11px;margin:0 0 4px;color:#475569;">${ket}</p>
      <table style="width:100%;font-size:11px;border-collapse:collapse;margin-bottom:14px;">
        <thead><tr>${['Pengulangan','Tanggal Pembinaan','Pemicu (Pelanggaran)','Bentuk / Instrumen','Status'].map(th).join('')}</tr></thead>
        <tbody>${isi}</tbody>
      </table>`;
  }).join('');
}

function bangunLaporanHTML(data) {
  const s = data.siswa || {};
  const dicetak = new Date().toLocaleDateString('id-ID', { day:'2-digit', month:'long', year:'numeric' });

  const th = (t) => `<th style="border:1px solid #cbd5e1;padding:5px;background:#f1f5f9;">${esc(t)}</th>`;
  const td = (t, c) => `<td style="border:1px solid #cbd5e1;padding:5px;${c||''}">${esc(t)}</td>`;
  const baris = (arr, kolom, kosongTeks, span) => arr && arr.length
    ? arr.map(kolom).join('')
    : `<tr><td colspan="${span}" style="text-align:center;padding:10px;color:#94a3b8;">${esc(kosongTeks)}</td></tr>`;

  const perkembangan = (data.perkembangan || []).slice()
    .sort((a,b) => String(kunciTgl(a.tanggal)).localeCompare(String(kunciTgl(b.tanggal))));

  // Akumulasi terpadu: pakai data.rekap bila ada, kalau tidak hitung kaskade di browser.
  let rekap = data.rekap;
  if (!rekap || !rekap.length) {
    const perKode = new Map();
    perkembangan.forEach(p => {
      const kunci = String(p.judul || '-').trim();
      if (!perKode.has(kunci)) perKode.set(kunci, { kategori: p.kategori || '-', deskripsi: kunci, jumlah: 0 });
      perKode.get(kunci).jumlah++;
    });
    rekap = kaskadeKonversi(perKode);
  }

  return `
  <div class="laporan" style="font-family:Arial,sans-serif;color:#1e293b;padding:18px;">
    <div style="text-align:center;border-bottom:2px solid #1e293b;padding-bottom:12px;margin-bottom:16px;">
      <h1 style="font-size:17px;margin:0;letter-spacing:.3px;">LAPORAN PERKEMBANGAN SANTRI</h1>
      <p style="font-size:11px;margin:4px 0 0;color:#64748b;">Dayah Ruhul Qurani · Dicetak ${dicetak}</p>
    </div>

    <table style="width:100%;font-size:12px;margin-bottom:16px;">
      <tr><td style="width:170px;padding:2px 0;"><b>Nama Santri</b></td><td>: ${esc(s.nama_siswa)}</td></tr>
      <tr><td style="padding:2px 0;"><b>NISN</b></td><td>: ${esc(s.nisn)}</td></tr>
      <tr><td style="padding:2px 0;"><b>Jenjang / Kelas</b></td><td>: ${esc(s.jenjang||'-')} / ${esc(s.kelas||'-')}</td></tr>
      <tr><td style="padding:2px 0;"><b>Asrama</b></td><td>: ${esc(s.asrama||'-')}</td></tr>
      <tr><td style="padding:2px 0;"><b>Total Poin</b></td><td>: ${s.total_poin_pelanggaran||0}</td></tr>
      <tr><td style="padding:2px 0;"><b>Status Saat Ini</b></td><td>: ${esc(s.status_keberadaan||'Hadir')}</td></tr>
    </table>

    <h3 style="font-size:13px;border-bottom:1px solid #cbd5e1;padding-bottom:4px;">1. Presensi Madrasah</h3>
    <table style="width:100%;font-size:11px;border-collapse:collapse;margin-bottom:16px;">
      <thead><tr>${['Bulan','Hadir','Izin','Sakit','Alpa'].map(th).join('')}</tr></thead>
      <tbody>${baris(data.presensi, p =>
        `<tr>${td(p.bulan)}${td(p.hadir,'text-align:center')}${td(p.izin,'text-align:center')}${td(p.sakit,'text-align:center')}${td(p.alpa,'text-align:center')}</tr>`,
        'Belum ada data presensi.', 5)}</tbody>
    </table>

    <h3 style="font-size:13px;border-bottom:1px solid #cbd5e1;padding-bottom:4px;">2. Akumulasi Perkembangan</h3>
    <table style="width:100%;font-size:11px;border-collapse:collapse;margin-bottom:16px;">
      <thead><tr>${['Kategori','Catatan / Perkembangan','Jumlah'].map(th).join('')}</tr></thead>
      <tbody>${baris(rekap, r =>
        `<tr>${td(r.kategori)}${td(r.deskripsi)}${td(r.jumlah,'text-align:center')}</tr>`,
        'Tidak ada akumulasi.', 3)}</tbody>
    </table>

    <h3 style="font-size:13px;border-bottom:1px solid #cbd5e1;padding-bottom:4px;">3. Riwayat Perkembangan</h3>
    <table style="width:100%;font-size:10.5px;border-collapse:collapse;margin-bottom:16px;">
      <thead><tr>${['Tanggal','Bidang','Catatan','Kategori','Poin','Petugas','Keterangan'].map(th).join('')}</tr></thead>
      <tbody>${baris(perkembangan, p =>
        `<tr>${td(tgl(p.tanggal))}${td(p.bidang||'-')}${td(p.judul)}${td(p.kategori)}${td(p.poin,'text-align:center')}${td(p.penindak||'-')}${td(p.catatan||'-')}</tr>`,
        'Tidak ada catatan perkembangan.', 7)}</tbody>
    </table>

    <h3 style="font-size:13px;border-bottom:1px solid #cbd5e1;padding-bottom:4px;">4. Riwayat Perizinan</h3>
    <table style="width:100%;font-size:11px;border-collapse:collapse;margin-bottom:16px;">
      <thead><tr>${['Mulai','Selesai','Jenis','Alasan','Status'].map(th).join('')}</tr></thead>
      <tbody>${baris(data.perizinan, z =>
        `<tr>${td(tgl(z.tanggal_mulai))}${td(tgl(z.tanggal_selesai))}${td(z.jenis_izin)}${td(z.alasan||'-')}${td(z.status_persetujuan)}</tr>`,
        'Tidak ada perizinan.', 5)}</tbody>
    </table>

    <h3 style="font-size:13px;border-bottom:1px solid #cbd5e1;padding-bottom:4px;">5. Instrumen Pembinaan</h3>
    <div style="margin-bottom:24px;">
      ${bagianPembinaanCetak(data.pembinaan, perkembangan)}
    </div>

    <table style="width:100%;font-size:12px;margin-top:36px;page-break-inside:avoid;break-inside:avoid;">
      <tr><td style="width:50%;text-align:center;">Musyrif Asrama</td>
          <td style="width:50%;text-align:center;">Wali Santri</td></tr>
      <tr><td style="height:58px;"></td><td></td></tr>
      <tr><td style="text-align:center;">(________________________)</td>
          <td style="text-align:center;">(________________________)</td></tr>
    </table>
  </div>`;
}

/** Agregasi data_presensi mingguan → baris bulanan untuk lembar cetak. */
function agregatPresensiCetak(rows) {
  const namaBulan = ['Januari','Februari','Maret','April','Mei','Juni',
                     'Juli','Agustus','September','Oktober','November','Desember'];
  const peta = new Map();
  (rows || []).forEach(r => {
    const b = Number(r.bulan) || 0;
    const th = Number(r.tahun) || 0;
    if (!b || !th) return;
    const kunci = `${th}-${String(b).padStart(2, '0')}`;
    if (!peta.has(kunci)) {
      peta.set(kunci, {
        bulan: `${namaBulan[b - 1] || b} ${th}`,
        hadir: 0, izin: 0, sakit: 0, alpa: 0
      });
    }
    const o = peta.get(kunci);
    o.hadir += Number(r.hadir) || 0;
    o.izin  += Number(r.izin)  || 0;
    o.sakit += Number(r.sakit) || 0;
    o.alpa  += Number(r.alpa)  || 0;
  });
  return [...peta.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([, v]) => v);
}

async function ambilLaporan(nisn) {
  const { data } = await q(db.rpc('laporan_santri', { p_nisn: nisn }), 'laporan_santri');
  if (!data || !data.siswa) throw new Error('Data laporan santri tidak ditemukan.');

  // RPC lama belum mengembalikan data_presensi — ambil langsung dari tabel bila ada.
  if (!data.presensi || !data.presensi.length) {
    try {
      const { data: rows, error } = await db.from('data_presensi')
        .select('tahun,bulan,hadir,izin,sakit,alpa,semester')
        .eq('nisn', String(nisn));
      if (!error && rows?.length) data.presensi = agregatPresensiCetak(rows);
    } catch (e) {
      console.warn('Presensi cetak tidak tersedia:', e?.message || e);
    }
  }
  return data;
}

async function cetakLaporan(nisn) {
  if (!bolehCetak()) return toast('error', `Role ${role()} tidak memiliki izin cetak.`);
  loading(true);
  try {
    const data = await ambilLaporan(nisn);
    $('printArea').innerHTML = bangunLaporanHTML(data);
    window.print();
  } catch (err) { fireError(err); }
  finally { loading(false); }
}

window.addEventListener('afterprint', () => { $('printArea').innerHTML = ''; });

/**
 * Unduh PDF memakai panggung render terpisah (#pdfStage), bukan #printArea.
 * html2canvas berjalan pada media screen sehingga elemen harus benar-benar
 * memiliki layout di viewport, kalau tidak hasilnya halaman putih.
 */
async function unduhLaporanPdf(nisn) {
  if (!bolehPdf()) return toast('error', `Role ${role()} tidak memiliki izin unduh PDF.`);
  if (typeof window.html2pdf !== 'function') {
    return fireError(new Error('Pustaka html2pdf belum termuat. Pastikan index.html versi terbaru sudah dipasang.'));
  }

  const stage = $('pdfStage'), mask = $('pdfMask');
  loading(true);
  try {
    const data = await ambilLaporan(nisn);
    stage.innerHTML = bangunLaporanHTML(data);
    stage.classList.add('on');
    mask.classList.add('on');

    if (document.fonts?.ready) { try { await document.fonts.ready; } catch (e) {} }
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

    const root = stage.querySelector('.laporan') || stage;
    const rect = root.getBoundingClientRect();
    const panjang = String(root.innerText || '').trim().length;
    if (rect.width < 300 || rect.height < 200 || panjang < 20) {
      throw new Error(`Area PDF belum siap dirender (${Math.round(rect.width)}×${Math.round(rect.height)}, ${panjang} karakter).`);
    }

    const nama = 'Laporan_' + String(data.siswa.nama_siswa || 'Santri')
      .trim().replace(/[\\/:*?"<>|]+/g,'').replace(/\s+/g,'_') + '.pdf';

    await window.html2pdf().set({
      margin: [8,8,8,8], filename: nama,
      image: { type:'jpeg', quality:0.98 },
      html2canvas: { scale:2, useCORS:true, backgroundColor:'#ffffff', logging:false, scrollX:0, scrollY:0 },
      jsPDF: { unit:'mm', format:'a4', orientation:'portrait' },
      pagebreak: { mode:['css','legacy'], avoid:['tr','h3'] }
    }).from(root).save();

    toast('success', 'PDF berhasil diunduh.');
  } catch (err) { fireError(err); }
  finally {
    stage.classList.remove('on'); stage.innerHTML = '';
    mask.classList.remove('on');
    loading(false);
  }
}

// ---------------------------------------------------------------------
// 21. REALTIME
// ---------------------------------------------------------------------
const segarkan = debounce(async (tabel) => {
  if (tabel === 'log_perizinan') {
    cacheHapus('izin'); refreshBadgePending();
    if (APP.view === 'perizinan') gambarIzin();
    if (['dashboard','pimpinan','pengasuhan'].includes(APP.view)) navigateTo(APP.view);
  } else if (tabel === 'log_pelanggaran' || tabel === 'detail_data') {
    cacheHapus('detail','siswa');
    if (APP.view === 'pelanggaran') muatTabelPlg();
    else if (APP.view === 'rekap') gambarRekap();
    else if (['dashboard','pimpinan','pengasuhan'].includes(APP.view)) navigateTo(APP.view);
  } else if (tabel === 'log_pembinaan') {
    cacheHapus('pembinaan');
    if (APP.view === 'pembinaan') gambarBina();
    else if (APP.view === 'rekapbina') gambarRb();
  }
}, 700);

function aktifkanRealtime() {
  APP.channel = db.channel('rq-live')
    .on('postgres_changes', { event:'*', schema:'public', table:'log_perizinan' }, () => segarkan('log_perizinan'))
    .on('postgres_changes', { event:'*', schema:'public', table:'log_pelanggaran' }, () => segarkan('log_pelanggaran'))
    .on('postgres_changes', { event:'*', schema:'public', table:'log_pembinaan' }, () => segarkan('log_pembinaan'))
    .subscribe((status) => {
      $('liveDot').classList.toggle('on', status === 'SUBSCRIBED');
    });
}

// Perbarui badge izin saat pengguna kembali ke tab.
window.addEventListener('focus', () => refreshBadgePending());
setInterval(() => { if (APP.profil) refreshBadgePending(); }, 60_000);

// ---------------------------------------------------------------------
// 23. MODUL MADRASAH — Pemeriksaan Atribut · Pelanggaran · Presensi
//     Port dari View Madrasah Apps Script, dijalankan di atas Supabase
//     tanpa menambah tabel maupun RPC baru.
// ---------------------------------------------------------------------
const ATRIBUT_MADRASAH = [
  'Baju tidak dimasukkan',
  'Tidak memakai ikat pinggang',
  'Tidak memakai kopiah / jilbab',
  'Tidak memakai sepatu hitam',
  'Tidak memakai kaos kaki',
  'Seragam tidak sesuai jadwal',
  'Tidak memakai badge / lokasi',
  'Rambut tidak rapi',
  'Kuku panjang',
  'Tidak membawa buku peraturan'
];

const BULAN_ID = ['Januari','Februari','Maret','April','Mei','Juni',
                  'Juli','Agustus','September','Oktober','November','Desember'];
const bulanSemester = (s) => s === 'Genap' ? [1,2,3,4,5,6] : [7,8,9,10,11,12];

const SQL_PRESENSI = `create table public.data_presensi (
  id         bigserial primary key,
  nisn       text    not null,
  nama_siswa text,
  kelas      text,
  jenjang    text,
  semester   text    not null,
  tahun      int     not null,
  bulan      int     not null,
  minggu     int     not null,
  hadir      int     default 0,
  izin       int     default 0,
  sakit      int     default 0,
  alpa       int     default 0,
  diperbarui timestamptz default now()
);

create index data_presensi_periode_idx
  on public.data_presensi (kelas, semester, tahun, bulan, minggu);

alter table public.data_presensi enable row level security;

create policy "presensi baca"  on public.data_presensi
  for select to authenticated using (true);
create policy "presensi tulis" on public.data_presensi
  for all    to authenticated using (true) with check (true);`;

/** Data pendukung tampilan Madrasah untuk render ulang panel. */
const MDS = { kelas:[], atribut:null, siapPresensi:false, hari:'', rekap:null };
const stMd = { panel:'atribut', santriAtr:null, santriPlg:null, masterPlg:null };

/** Santri pada jenjang madrasah yang sedang aktif (ikut kelas binaan). */
async function siswaMadrasah() {
  const j = APP.ctx.jenjang;
  const rows = filterBinaan((await muatSiswa()).filter(aktifSantri), 'kelas');
  if (!['MTs','MA'].includes(j)) return rows;
  return rows.filter(s => (s.jenjang || angkatanJenjang(s.kelas)) === j);
}

/** Cari master pelanggaran untuk pemeriksaan atribut (P220 atau bernama atribut). */
function masterAtributAktif(list) {
  return list.find(m => /220/.test(String(m.kode_pelanggaran || ''))) ||
         list.find(m => /atribut/i.test(String(m.nama_pelanggaran || ''))) || null;
}

/** Tabel data_presensi bersifat opsional; keberadaannya diperiksa sekali saja. */
let PRESENSI_SIAP = null;
async function cekTabelPresensi() {
  if (PRESENSI_SIAP !== null) return PRESENSI_SIAP;
  try {
    const { error } = await db.from('data_presensi').select('nisn').limit(1);
    PRESENSI_SIAP = !error;
  } catch (e) { PRESENSI_SIAP = false; }
  return PRESENSI_SIAP;
}

/** Panel saran santri, dibatasi pada jenjang madrasah yang aktif. */
function mdSaranSantri(input, onPilih) {
  lampirkanSaran(input, {
    ambil: async (kata) => cariLokal(await siswaMadrasah(), kata,
      ['nama_siswa','nisn','kelas'], 25),
    minKetik: 2,
    kosong: 'Santri tidak ditemukan pada jenjang ini.',
    keItem: (it) => ({
      huruf: esc((it.nama_siswa || '?').charAt(0).toUpperCase()),
      judul: esc(it.nama_siswa),
      sub: `${esc(it.nisn)} · ${esc(it.kelas || '-')}`
    }),
    keTeks: (it) => `${it.nisn} - ${it.nama_siswa}`,
    onPilih: (it) => { input.dataset.picked = it.nisn; onPilih?.(it); }
  });
}

function kartuPick(judul, isi) {
  return `<div class="ico"><i class="fa-solid fa-user-graduate"></i></div>
    <div><small>${esc(judul)}</small><b>${esc(isi)}</b></div>`;
}

// ---------- Tampilan utama ----------
async function viewMadrasah() {
  if (APP.ctx.unit !== 'Madrasah' || !['MTs','MA'].includes(APP.ctx.jenjang)) {
    $('viewRoot').innerHTML = kartu('Pilih jenjang madrasah', `
      <div class="card-note"><i class="fa-solid fa-circle-info"></i>
        Modul ini bekerja pada satu jenjang. Pilih MTs atau MA agar daftar santri,
        kelas, dan master pelanggaran yang tampil sudah tersaring.</div>
      <div class="card-body">
        <div class="unit-grid">
          <button class="unit-card mts" data-ctx="Madrasah|MTs">
            <div class="ico"><i class="fa-solid fa-school"></i></div>
            <span class="ar">التعليم والتعلّم</span><b>Madrasah MTs</b>
            <small>Atribut · Pelanggaran · Presensi kelas</small>
            <span class="go">Aktifkan unit <i class="fa-solid fa-arrow-right"></i></span>
          </button>
          <button class="unit-card ma" data-ctx="Madrasah|MA">
            <div class="ico"><i class="fa-solid fa-graduation-cap"></i></div>
            <span class="ar">التعليم والتعلّم</span><b>Madrasah MA</b>
            <small>Atribut · Pelanggaran · Presensi kelas</small>
            <span class="go">Aktifkan unit <i class="fa-solid fa-arrow-right"></i></span>
          </button>
        </div>
      </div>`);
    onKlik((e) => {
      const c = e.target.closest('[data-ctx]');
      if (c) { const [u, j] = c.dataset.ctx.split('|'); setKonteks(u, j, 'madrasah'); }
    });
    return;
  }

  const [siswa, detailAll, masterAll, siapPresensi] = await Promise.all([
    siswaMadrasah(),
    amanKosong(muatDetail, 'pelanggaran'),
    amanKosong(muatMaster, 'master pelanggaran'),
    cekTabelPresensi()
  ]);

  const detail = lingkupDetail(detailAll);
  const master = lingkupMaster(masterAll);
  const hari = hariIni();

  MDS.hari = hari;
  MDS.kelas = [...new Set(siswa.map(s => s.kelas).filter(Boolean))].sort();
  MDS.atribut = masterAtributAktif(master);
  MDS.siapPresensi = siapPresensi;

  const plgHari = detail.filter(r => kunciTgl(r.tanggal) === hari).length;
  const lawan = APP.ctx.jenjang === 'MTs' ? 'MA' : 'MTs';

  $('viewRoot').innerHTML = `
    <section class="hero" style="padding:24px">
      <div class="eyebrow"><span class="ar">المدرسة</span><span class="rule"></span>
        <span class="lat">Unit Madrasah</span></div>
      <h2 style="font-size:clamp(24px,3vw,32px)">Madrasah ${esc(APP.ctx.jenjang)}</h2>
      <p>Pemeriksaan atribut, pencatatan pelanggaran, dan rekap presensi kelas
         dalam satu basis data yang sama dengan laporan perkembangan santri.</p>
      <div class="meta">
        <span><i class="fa-solid fa-user-tie"></i>${esc(APP.profil?.nama || '')}</span>
        <span><i class="fa-solid fa-id-badge"></i>${esc(role())}</span>
        <span><i class="fa-regular fa-calendar"></i>${tgl(hari)}</span>
        ${bolehKonteks('Madrasah', lawan)
          ? `<span style="cursor:pointer" data-ctx="Madrasah|${lawan}">
               <i class="fa-solid fa-right-left"></i>Pindah ke ${lawan}</span>` : ''}
      </div>
    </section>

    <div class="stats">
      ${stat('Santri Jenjang Ini', angka(siswa.length), 'fa-solid fa-user-group',
        'background:#E7F1F7;color:var(--sea)', 'var(--sea)',
        perluFilterKelas() ? 'Kelas binaan Anda' : `Madrasah ${APP.ctx.jenjang}`)}
      ${stat('Kelas Terdata', angka(MDS.kelas.length), 'fa-solid fa-chalkboard',
        'background:var(--violet-bg);color:var(--violet)', 'var(--violet)', 'Sumber: data santri')}
      ${stat('Pelanggaran Hari Ini', angka(plgHari), 'fa-solid fa-triangle-exclamation',
        'background:var(--maroon-bg);color:var(--maroon)', 'var(--maroon)', tgl(hari))}
      ${stat('Jenis Pelanggaran', angka(master.length), 'fa-solid fa-book-open',
        'background:var(--amber-bg);color:var(--amber)', 'var(--amber)', 'Master unit ini')}
    </div>

    <div class="mod-grid">
      <button class="mod-card ${stMd.panel==='atribut'?'on':''}" data-mdpanel="atribut">
        <div class="ico" style="background:#E7F1F7;color:var(--sea)"><i class="fa-solid fa-shirt"></i></div>
        <div class="k">Pemeriksaan</div><b>Atribut Santri</b>
        <p>Centang atribut yang tidak lengkap; tersimpan sebagai satu catatan pelanggaran.</p>
        <span class="go">Buka panel <i class="fa-solid fa-arrow-right"></i></span>
      </button>
      <button class="mod-card ${stMd.panel==='pelanggaran'?'on':''}" data-mdpanel="pelanggaran">
        <div class="ico" style="background:var(--maroon-bg);color:var(--maroon)"><i class="fa-solid fa-file-circle-plus"></i></div>
        <div class="k">Pencatatan</div><b>Tambah Pelanggaran</b>
        <p>Cari jenis pelanggaran dari Master Pelanggaran madrasah, lengkap dengan catatan.</p>
        <span class="go">Buka panel <i class="fa-solid fa-arrow-right"></i></span>
      </button>
      <button class="mod-card ${stMd.panel==='presensi'?'on':''}" data-mdpanel="presensi">
        <div class="ico" style="background:var(--teal-bg);color:var(--teal)"><i class="fa-solid fa-calendar-check"></i></div>
        <div class="k">Kehadiran</div><b>Rekap Presensi Kelas</b>
        <p>Input mingguan H/I/S/A dan rekapitulasi bulanan satu semester.</p>
        <span class="go">Buka panel <i class="fa-solid fa-arrow-right"></i></span>
      </button>
    </div>

    <div id="mdPanel"></div>`;

  onKlik((e) => {
    const p = e.target.closest('[data-mdpanel]');
    if (p) {
      stMd.panel = p.dataset.mdpanel;
      document.querySelectorAll('[data-mdpanel]').forEach(b =>
        b.classList.toggle('on', b.dataset.mdpanel === stMd.panel));
      return mdGambarPanel();
    }
    const c = e.target.closest('[data-ctx]');
    if (c) { const [u, j] = c.dataset.ctx.split('|'); setKonteks(u, j, 'madrasah'); }
  });

  mdGambarPanel();
}

function mdGambarPanel() {
  const el = $('mdPanel'); if (!el) return;
  if (stMd.panel === 'pelanggaran') { el.innerHTML = mdPanelPelanggaran(); mdPasangPelanggaran(); }
  else if (stMd.panel === 'presensi') { el.innerHTML = mdPanelPresensi(); mdPasangPresensi(); }
  else { el.innerHTML = mdPanelAtribut(); mdPasangAtribut(); }
  tandaiTabelBisaGeser();
}

/** Simpan pelanggaran lewat RPC catat_pelanggaran + alur konfirmasi izin. */
async function mdSimpanPelanggaran(payload, btn, label) {
  const asli = mulaiSimpan(btn, label);
  try {
    let { data, error } = await db.rpc('catat_pelanggaran', payload);
    if (error) throw error;

    if (data?.conflict) {
      selesaiSimpan(btn, asli, true, 'Menunggu konfirmasi');
      if (role() === 'Osis') {
        await Swal.fire({ icon:'error', title:'Tidak berwenang',
          text:'Osis tidak dapat menimpa izin yang sudah berstatus Sesuai Waktu. Hubungi Admin/Guru.',
          confirmButtonColor:'#9F1239' });
        return null;
      }
      const konf = await Swal.fire({
        icon:'warning', title:'Terdeteksi izin yang sesuai waktu',
        html:`<p style="text-align:left;font-size:13.5px">${esc(data.message || '')}</p>`,
        showCancelButton:true, confirmButtonText:'Tetap catat pelanggaran',
        cancelButtonText:'Batalkan', confirmButtonColor:'#9F1239' });
      if (!konf.isConfirmed) return null;

      const ulang = mulaiSimpan(btn, label);
      const r2 = await db.rpc('catat_pelanggaran', { ...payload, p_force: true });
      if (r2.error) { selesaiSimpan(btn, ulang, false, 'Gagal menyimpan'); throw r2.error; }
      selesaiSimpan(btn, ulang, true, 'Pelanggaran tersimpan');
      data = r2.data;
    } else {
      selesaiSimpan(btn, asli, true, 'Pelanggaran tersimpan');
    }

    cacheHapus('detail','siswa','pembinaan');
    return data || {};
  } catch (err) {
    selesaiSimpan(btn, asli, false, 'Gagal menyimpan');
    fireError(err);
    return null;
  }
}

// ---------- Panel 1: pemeriksaan atribut ----------
function mdPanelAtribut() {
  const m = MDS.atribut;
  const bisa = bolehTulis();

  return kartu('Pemeriksaan Atribut Santri', `
    ${m
      ? `<div class="card-note"><i class="fa-solid fa-circle-info"></i>
          Memakai master <b>${esc(m.kode_pelanggaran)} — ${esc(m.nama_pelanggaran)}</b>
          (${esc(m.kategori)} · ${m.bobot_poin} poin · ${esc(m.bidang || '-')}).
          Atribut yang dicentang ditulis pada kolom catatan.</div>`
      : `<div class="card-note"><i class="fa-solid fa-triangle-exclamation"></i>
          Belum ada jenis pelanggaran atribut (kode <b>P220</b> atau nama mengandung
          “atribut”) pada Master Pelanggaran unit ini. Tambahkan lebih dulu di
          menu <b>Master &amp; Bidang</b>.</div>`}

    <div class="md-form">
      <div class="field"><label class="label">Tanggal Pemeriksaan</label>
        <input id="atrTanggal" type="date" class="input" value="${MDS.hari}"></div>
      <div class="field"><label class="label">Cari Santri</label>
        <input id="atrSantri" class="input" autocomplete="off"
               placeholder="Nama atau NISN (min. 2 huruf)…">
        <p class="hint">Pilih dari daftar saran agar NISN terbaca dengan benar.</p></div>
    </div>

    <div class="pick" id="atrPick">${kartuPick('Santri Terpilih','Belum ada santri dipilih')}</div>

    <div class="atr-grid">
      ${ATRIBUT_MADRASAH.map(a => `<label class="atr-item">
        <input type="checkbox" value="${esc(a)}"><span>${esc(a)}</span></label>`).join('')}
    </div>

    <div class="md-bar">
      <span class="note-min"><i class="fa-solid fa-shield-halved"></i>
        Penindak dan poin diproses otomatis oleh sistem.</span>
      ${bisa && m
        ? `<button class="btn btn-primary btn-sm" id="atrSimpan">
             <i class="fa-solid fa-floppy-disk"></i>Simpan Pemeriksaan</button>`
        : `<span class="tag tag-off">Hanya baca</span>`}
    </div>`,
    `<span class="tag tag-sea">${esc(labelKonteks())}</span>`,
    'Satu kali simpan menghasilkan satu catatan pelanggaran.');
}

function mdPasangAtribut() {
  stMd.santriAtr = null;
  const inp = $('atrSantri'); if (!inp) return;

  mdSaranSantri(inp, (s) => {
    stMd.santriAtr = s;
    $('atrPick').innerHTML = kartuPick('Santri Terpilih',
      `${s.nama_siswa} · ${s.kelas || '-'} · ${s.nisn}`);
  });

  document.querySelectorAll('.atr-item input').forEach(c =>
    c.addEventListener('change', () => c.closest('.atr-item').classList.toggle('on', c.checked)));

  $('atrSimpan')?.addEventListener('click', mdSimpanAtribut);
}

async function mdSimpanAtribut() {
  const m = MDS.atribut;
  if (!m) return toast('error', 'Master pelanggaran atribut belum tersedia.');
  if (!stMd.santriAtr) return toast('error', 'Pilih santri terlebih dahulu.');

  const attrs = [...document.querySelectorAll('.atr-item input:checked')].map(x => x.value);
  if (!attrs.length) return toast('error', 'Centang minimal satu atribut yang tidak lengkap.');

  const hasil = await mdSimpanPelanggaran({
    p_nisn: stMd.santriAtr.nisn,
    p_kode: m.kode_pelanggaran,
    p_tanggal: $('atrTanggal').value || hariIni(),
    p_catatan: 'Atribut tidak lengkap: ' + attrs.join(', '),
    p_force: false
  }, $('atrSimpan'), 'Menyimpan Pemeriksaan…');

  if (!hasil) return;
  toast('success', `Pemeriksaan tersimpan. Total poin santri: ${hasil.poin_baru ?? '-'}`);
  navigateTo('madrasah');
}

// ---------- Panel 2: tambah pelanggaran ----------
function mdPanelPelanggaran() {
  const bisa = bolehTulis();

  return kartu('Tambah Pelanggaran Santri', `
    <div class="card-note"><i class="fa-solid fa-circle-info"></i>
      Jenis pelanggaran diambil dari Master Pelanggaran unit <b>${esc(labelKonteks())}</b>.
      Ketik kode, nama, kategori, atau bidang untuk mencari.</div>

    <div class="step"><span>01</span>
      <div><b>Identitas kejadian</b><small>Tentukan tanggal dan santri yang dicatat.</small></div></div>
    <div class="md-form">
      <div class="field"><label class="label">Tanggal Kejadian</label>
        <input id="mpTanggal" type="date" class="input" value="${MDS.hari}"></div>
      <div class="field"><label class="label">Cari Santri</label>
        <input id="mpSantri" class="input" autocomplete="off" placeholder="Nama atau NISN…"></div>
    </div>
    <div class="pick" id="mpPick">${kartuPick('Santri Terpilih','Belum ada santri dipilih')}</div>

    <div class="step"><span>02</span>
      <div><b>Jenis pelanggaran</b><small>Pilih dari daftar saran agar kode terbaca.</small></div></div>
    <div class="md-form">
      <div class="field wide"><label class="label">Kode / Nama Pelanggaran</label>
        <input id="mpKode" class="input" autocomplete="off"
               placeholder="Contoh: P220, atribut, terlambat, bahasa…">
        <div id="mpInfo" class="hint">Belum ada jenis pelanggaran dipilih.</div></div>
    </div>

    <div class="step"><span>03</span>
      <div><b>Catatan kejadian</b><small>Opsional, maksimal 500 karakter.</small></div></div>
    <div class="md-form">
      <div class="field wide">
        <textarea id="mpCatatan" class="input" rows="3" maxlength="500"
          placeholder="Contoh: santri terlambat masuk kelas setelah jam istirahat."></textarea>
        <div style="display:flex;justify-content:space-between;gap:10px">
          <span class="hint">Poin mengikuti Master Pelanggaran.</span>
          <span class="hint mono" id="mpHitung">0 / 500</span>
        </div></div>
    </div>

    <div class="md-bar">
      <span class="note-min"><i class="fa-solid fa-user-shield"></i>
        Penindak: ${esc(APP.profil?.nama || '-')}</span>
      ${bisa
        ? `<button class="btn btn-primary btn-sm" id="mpSimpan">
             <i class="fa-solid fa-floppy-disk"></i>Simpan Pelanggaran</button>`
        : `<span class="tag tag-off">Hanya baca</span>`}
    </div>`,
    `<span class="tag tag-sea">${esc(labelKonteks())}</span>`);
}

function mdPasangPelanggaran() {
  stMd.santriPlg = null; stMd.masterPlg = null;
  const inp = $('mpSantri'); if (!inp) return;

  mdSaranSantri(inp, (s) => {
    stMd.santriPlg = s;
    $('mpPick').innerHTML = kartuPick('Santri Terpilih',
      `${s.nama_siswa} · ${s.kelas || '-'} · ${s.nisn}`);
  });

  saranPelanggaran($('mpKode'), (m) => {
    stMd.masterPlg = m;
    $('mpInfo').innerHTML =
      `<span class="tag ${tagKategori(m.kategori)}">${esc(m.kategori)}</span>
       <b>${m.bobot_poin} poin</b> · ${esc(m.bidang || '-')} · ${esc(m.jenjang || 'Semua')}`;
  });
  $('mpKode').addEventListener('input', () => {
    if (!$('mpKode').dataset.kode) {
      stMd.masterPlg = null;
      $('mpInfo').textContent = 'Belum ada jenis pelanggaran dipilih.';
    }
  });

  $('mpCatatan').addEventListener('input', (e) => {
    $('mpHitung').textContent = `${e.target.value.length} / 500`;
  });

  $('mpSimpan')?.addEventListener('click', mdSimpanPelanggaranUmum);
}

async function mdSimpanPelanggaranUmum() {
  if (!stMd.santriPlg) return toast('error', 'Pilih santri terlebih dahulu.');
  if (!stMd.masterPlg) {
    $('mpKode').focus();
    return toast('error', 'Pilih jenis pelanggaran dari daftar saran.');
  }

  const hasil = await mdSimpanPelanggaran({
    p_nisn: stMd.santriPlg.nisn,
    p_kode: stMd.masterPlg.kode_pelanggaran,
    p_tanggal: $('mpTanggal').value || hariIni(),
    p_catatan: $('mpCatatan').value.trim(),
    p_force: false
  }, $('mpSimpan'), 'Menyimpan Pelanggaran…');

  if (!hasil) return;
  toast('success', `Tersimpan. Total poin santri: ${hasil.poin_baru ?? '-'}`);
  navigateTo('madrasah');
}

// ---------- Panel 3: presensi kelas ----------
function mdPanelPresensi() {
  if (!MDS.siapPresensi) {
    return kartu('Rekap Presensi Kelas', `
      <div class="card-note"><i class="fa-solid fa-triangle-exclamation"></i>
        Tabel <b>data_presensi</b> belum tersedia di Supabase, jadi input dan rekap
        presensi belum bisa dijalankan. Modul lain tetap berjalan normal.</div>
      <div class="card-body">
        <p style="margin:0 0 11px;font-size:12.5px;color:var(--text-2)">
          Bila nanti hendak diaktifkan, jalankan skrip berikut di
          <b>SQL Editor Supabase</b>. Struktur inilah yang dibaca aplikasi —
          tidak ada perubahan lain di sisi kode.</p>
        <div class="sql-note">${esc(SQL_PRESENSI)}</div>
      </div>`,
      '<span class="tag tag-off">Belum aktif</span>');
  }

  const th = new Date().getFullYear();
  const smt = (new Date().getMonth() + 1) >= 7 ? 'Ganjil' : 'Genap';
  const opsiKelas = (id) => `<select id="${id}" class="input">
      <option value="">— Pilih Kelas —</option>
      ${MDS.kelas.map(k => `<option>${esc(k)}</option>`).join('')}</select>`;
  const opsiTahun = (id) => `<select id="${id}" class="input">
      ${[th-1, th, th+1].map(y => `<option ${y===th?'selected':''}>${y}</option>`).join('')}</select>`;
  const opsiSmt = (id) => `<select id="${id}" class="input">
      <option ${smt==='Ganjil'?'selected':''}>Ganjil</option>
      <option ${smt==='Genap'?'selected':''}>Genap</option></select>`;

  return `
    ${kartu('Input Presensi Mingguan', `
      <div class="md-form">
        <div class="field"><label class="label">Kelas</label>${opsiKelas('prKelas')}</div>
        <div class="field"><label class="label">Semester</label>${opsiSmt('prSemester')}</div>
        <div class="field"><label class="label">Tahun</label>${opsiTahun('prTahun')}</div>
        <div class="field"><label class="label">Bulan</label><select id="prBulan" class="input"></select></div>
        <div class="field"><label class="label">Minggu Ke</label>
          <select id="prMinggu" class="input">
            ${[1,2,3,4,5].map(m => `<option value="${m}">Minggu ke-${m}</option>`).join('')}</select></div>
        <div class="field"><label class="label">&nbsp;</label>
          <button class="btn btn-ghost btn-sm" id="prMuat">
            <i class="fa-solid fa-list-check"></i>Muat Siswa</button></div>
      </div>

      <div class="minis">
        <div class="mini t"><span>Hadir</span><b id="prH">0</b></div>
        <div class="mini s"><span>Izin</span><b id="prI">0</b></div>
        <div class="mini a"><span>Sakit</span><b id="prS">0</b></div>
        <div class="mini m"><span>Alpa</span><b id="prA">0</b></div>
      </div>

      <div class="tbl" style="margin-top:16px"><table>
        <thead><tr><th>Nama Santri</th><th class="center">Hadir</th><th class="center">Izin</th>
          <th class="center">Sakit</th><th class="center">Alpa</th></tr></thead>
        <tbody id="prBody">${barisKosong(5, 'Belum ada daftar santri.',
          'Pilih kelas dan periode, lalu tekan “Muat Siswa”.')}</tbody>
      </table></div>
      <div class="scroll-hint"><i class="fa-solid fa-arrows-left-right"></i>Geser ke samping untuk kolom lainnya.</div>

      <div class="md-bar">
        <span class="note-min"><i class="fa-solid fa-circle-info"></i>
          Menyimpan ulang periode yang sama akan memperbarui data lama.</span>
        ${bolehTulis()
          ? `<button class="btn btn-primary btn-sm" id="prSimpan">
               <i class="fa-solid fa-floppy-disk"></i>Simpan Presensi Minggu Ini</button>`
          : `<span class="tag tag-off">Hanya baca</span>`}
      </div>`,
      `<span class="tag tag-ok" id="prBadge">Periode baru</span>`,
      'Isi total Hadir, Izin, Sakit, dan Alpa setiap santri pada minggu terpilih.')}

    ${kartu('Rekap Bulanan Satu Semester', `
      <div class="md-form">
        <div class="field"><label class="label">Kelas</label>${opsiKelas('rpKelas')}</div>
        <div class="field"><label class="label">Semester</label>${opsiSmt('rpSemester')}</div>
        <div class="field"><label class="label">Tahun</label>${opsiTahun('rpTahun')}</div>
        <div class="field"><label class="label">&nbsp;</label>
          <button class="btn btn-ghost btn-sm" id="rpTampil">
            <i class="fa-solid fa-table"></i>Tampilkan Rekap</button></div>
      </div>
      <div id="rpSummary"></div>
      <div class="tbl"><table>
        <thead id="rpHead"></thead>
        <tbody id="rpBody">${barisKosong(3, 'Rekap belum ditampilkan.',
          'Pilih kelas, semester, dan tahun.')}</tbody>
      </table></div>
      <div class="scroll-hint"><i class="fa-solid fa-arrows-left-right"></i>Geser ke samping untuk kolom lainnya.</div>`,
      `<button class="btn btn-ghost btn-sm" id="rpCsv"><i class="fa-solid fa-file-csv"></i>Ekspor CSV</button>`,
      'Setiap kolom bulan berisi ringkasan H/I/S/A dari seluruh minggu yang sudah diinput.')}`;
}

function mdPasangPresensi() {
  if (!MDS.siapPresensi) return;

  const isiBulan = () => {
    const bulan = bulanSemester($('prSemester').value);
    const kini = new Date().getMonth() + 1;
    $('prBulan').innerHTML = bulan.map(b =>
      `<option value="${b}" ${b===kini?'selected':''}>${BULAN_ID[b-1]}</option>`).join('');
  };
  isiBulan();
  $('prSemester').addEventListener('change', isiBulan);

  $('prMuat').addEventListener('click', mdMuatPresensi);
  $('prSimpan')?.addEventListener('click', mdSimpanPresensi);
  $('rpTampil').addEventListener('click', mdTampilkanRekapPresensi);
  $('rpCsv').addEventListener('click', mdEksporRekapPresensi);
}

function mdPeriodePresensi() {
  return {
    kelas: $('prKelas').value,
    semester: $('prSemester').value,
    tahun: Number($('prTahun').value),
    bulan: Number($('prBulan').value),
    minggu: Number($('prMinggu').value)
  };
}

function mdTotalPresensi() {
  const jml = { hadir:0, izin:0, sakit:0, alpa:0 };
  document.querySelectorAll('#prBody tr[data-nisn]').forEach(tr => {
    ['hadir','izin','sakit','alpa'].forEach(k => {
      jml[k] += Number(tr.querySelector('.pr-' + k).value) || 0;
    });
  });
  $('prH').textContent = angka(jml.hadir);
  $('prI').textContent = angka(jml.izin);
  $('prS').textContent = angka(jml.sakit);
  $('prA').textContent = angka(jml.alpa);
}

async function mdMuatPresensi() {
  const p = mdPeriodePresensi();
  if (!p.kelas) return toast('error', 'Pilih kelas terlebih dahulu.');

  loading(true);
  try {
    const siswa = (await siswaMadrasah()).filter(s => s.kelas === p.kelas);
    const { data, error } = await q(db.from('data_presensi').select('*')
      .eq('kelas', p.kelas).eq('semester', p.semester).eq('tahun', p.tahun)
      .eq('bulan', p.bulan).eq('minggu', p.minggu), 'presensi');
    if (error) throw error;

    const peta = Object.fromEntries((data || []).map(r => [String(r.nisn), r]));
    const ada = (data || []).length > 0;
    $('prBadge').textContent = ada ? 'Data tersimpan · mode perbarui' : 'Periode baru';
    $('prBadge').className = 'tag ' + (ada ? 'tag-sea' : 'tag-ok');

    $('prBody').innerHTML = siswa.map((s, i) => {
      const r = peta[String(s.nisn)] || {};
      return `<tr data-nisn="${esc(s.nisn)}" data-nama="${esc(s.nama_siswa)}">
        <td><div class="primary">${i+1}. ${esc(s.nama_siswa)}</div>
            <div class="secondary">${esc(s.nisn)} · ${esc(s.kelas || '-')}</div></td>
        ${['hadir','izin','sakit','alpa'].map(k =>
          `<td class="center"><input class="num-in pr-${k}" type="number" min="0"
             value="${Number(r[k] || 0)}"></td>`).join('')}
      </tr>`;
    }).join('') || barisKosong(5, 'Tidak ada santri pada kelas ini.',
      'Periksa data santri atau cakupan kelas binaan Anda.');

    document.querySelectorAll('#prBody .num-in')
      .forEach(i => i.addEventListener('input', mdTotalPresensi));
    mdTotalPresensi();
    tandaiTabelBisaGeser();
  } catch (err) { fireError(err); }
  finally { loading(false); }
}

async function mdSimpanPresensi() {
  const p = mdPeriodePresensi();
  const baris = [...document.querySelectorAll('#prBody tr[data-nisn]')];
  if (!p.kelas || !baris.length) return toast('error', 'Muat daftar santri terlebih dahulu.');

  const rows = baris.map(tr => ({
    nisn: tr.dataset.nisn,
    nama_siswa: tr.dataset.nama,
    kelas: p.kelas,
    jenjang: APP.ctx.jenjang,
    semester: p.semester,
    tahun: p.tahun,
    bulan: p.bulan,
    minggu: p.minggu,
    hadir: Number(tr.querySelector('.pr-hadir').value) || 0,
    izin:  Number(tr.querySelector('.pr-izin').value)  || 0,
    sakit: Number(tr.querySelector('.pr-sakit').value) || 0,
    alpa:  Number(tr.querySelector('.pr-alpa').value)  || 0
  }));

  const btn = $('prSimpan');
  const asli = mulaiSimpan(btn, 'Menyimpan Presensi…');
  try {
    // Periode ditulis ulang seluruhnya agar tidak ada baris ganda.
    const hapus = await db.from('data_presensi').delete()
      .eq('kelas', p.kelas).eq('semester', p.semester).eq('tahun', p.tahun)
      .eq('bulan', p.bulan).eq('minggu', p.minggu);
    if (hapus.error) throw hapus.error;

    const { error } = await db.from('data_presensi').insert(rows);
    if (error) throw error;

    selesaiSimpan(btn, asli, true, 'Presensi tersimpan');
    toast('success', `Presensi ${p.kelas} · ${BULAN_ID[p.bulan-1]} minggu ke-${p.minggu} tersimpan.`);
    $('prBadge').textContent = 'Data tersimpan · mode perbarui';
    $('prBadge').className = 'tag tag-sea';
  } catch (err) {
    selesaiSimpan(btn, asli, false, 'Gagal menyimpan');
    fireError(err);
  }
}

async function mdTampilkanRekapPresensi() {
  const kelas = $('rpKelas').value;
  const semester = $('rpSemester').value;
  const tahun = Number($('rpTahun').value);
  if (!kelas) return toast('error', 'Pilih kelas untuk rekap.');

  loading(true);
  try {
    const { data, error } = await q(db.from('data_presensi').select('*')
      .eq('kelas', kelas).eq('semester', semester).eq('tahun', tahun), 'rekap presensi');
    if (error) throw error;

    const bulan = bulanSemester(semester);
    const peta = new Map();
    (data || []).forEach(r => {
      const k = String(r.nisn);
      if (!peta.has(k)) peta.set(k, {
        nisn: k, nama: r.nama_siswa || '(tidak ditemukan)',
        bulan: {}, total: { hadir:0, izin:0, sakit:0, alpa:0 }
      });
      const o = peta.get(k);
      const b = Number(r.bulan);
      o.bulan[b] = o.bulan[b] || { hadir:0, izin:0, sakit:0, alpa:0 };
      ['hadir','izin','sakit','alpa'].forEach(x => {
        const v = Number(r[x]) || 0;
        o.bulan[b][x] += v;
        o.total[x] += v;
      });
    });

    const rows = [...peta.values()].sort((a, b) => a.nama.localeCompare(b.nama));
    MDS.rekap = { kelas, semester, tahun, bulan, rows };

    const sel = (t) => `<span class="md-cell">
      <i style="color:var(--teal)">H</i>${t.hadir||0}
      <i style="color:var(--sea)">I</i>${t.izin||0}
      <i style="color:var(--amber)">S</i>${t.sakit||0}
      <i style="color:var(--maroon)">A</i>${t.alpa||0}</span>`;

    $('rpHead').innerHTML = `<tr><th>Nama Santri</th>
      ${bulan.map(b => `<th>${BULAN_ID[b-1]}</th>`).join('')}
      <th>Total Semester</th></tr>`;

    $('rpBody').innerHTML = rows.map((r, i) => `<tr>
      <td><div class="primary">${i+1}. ${esc(r.nama)}</div>
          <div class="secondary">${esc(r.nisn)}</div></td>
      ${bulan.map(b => `<td>${sel(r.bulan[b] || {})}</td>`).join('')}
      <td>${sel(r.total)}</td>
    </tr>`).join('') || barisKosong(bulan.length + 2, 'Belum ada data presensi.',
      'Isi presensi mingguan terlebih dahulu pada periode ini.');

    const jml = rows.reduce((a, r) => {
      ['hadir','izin','sakit','alpa'].forEach(x => a[x] += r.total[x]); return a;
    }, { hadir:0, izin:0, sakit:0, alpa:0 });

    $('rpSummary').innerHTML = `<div class="minis" style="padding:0 20px 6px">
      <div class="mini t"><span>Total Hadir</span><b>${angka(jml.hadir)}</b></div>
      <div class="mini s"><span>Total Izin</span><b>${angka(jml.izin)}</b></div>
      <div class="mini a"><span>Total Sakit</span><b>${angka(jml.sakit)}</b></div>
      <div class="mini m"><span>Total Alpa</span><b>${angka(jml.alpa)}</b></div></div>`;

    tandaiTabelBisaGeser();
  } catch (err) { fireError(err); }
  finally { loading(false); }
}

function mdEksporRekapPresensi() {
  const r = MDS.rekap;
  if (!r || !r.rows.length) return toast('error', 'Tampilkan rekap terlebih dahulu.');

  const kepala = ['NISN','Nama'];
  r.bulan.forEach(b => kepala.push(
    `${BULAN_ID[b-1]} H`, `${BULAN_ID[b-1]} I`, `${BULAN_ID[b-1]} S`, `${BULAN_ID[b-1]} A`));
  kepala.push('Total H','Total I','Total S','Total A');

  const baris = r.rows.map(x => {
    const kolom = [x.nisn, x.nama];
    r.bulan.forEach(b => {
      const t = x.bulan[b] || {};
      kolom.push(t.hadir||0, t.izin||0, t.sakit||0, t.alpa||0);
    });
    kolom.push(x.total.hadir, x.total.izin, x.total.sakit, x.total.alpa);
    return kolom;
  });

  unduhCsv(`presensi-${r.kelas}-${r.semester}-${r.tahun}.csv`, [kepala, ...baris]);
}


// ---------------------------------------------------------------------
// 24. PANEL KINERJA GURU — pelengkap Dashboard Pimpinan
//
//     CARA PASANG (2 langkah):
//
//     1) Tempel SELURUH isi berkas ini di bagian bawah app.js,
//        tepat SEBELUM blok "22. START".
//
//     2) Di dalam fungsi viewPimpinan(), tambahkan satu baris di
//        paling akhir (setelah buatChart('pBina', ...)):
//
//            await panelKinerjaGuru();
//
//     Panel menempel sendiri ke #viewRoot, jadi template HTML besar
//     di viewPimpinan() tidak perlu disentuh sama sekali.
// ---------------------------------------------------------------------

const stKg = { dari: '', sampai: '', role: '', cari: '', data: null };

/** Rentang bawaan: 90 hari terakhir, sejalan dengan dashboard pimpinan. */
function rentangKg() {
  const akhir = new Date();
  return { dari: kunciTgl(tambahHari(akhir, -89)), sampai: kunciTgl(akhir) };
}

async function panelKinerjaGuru() {
  if (!stKg.dari) Object.assign(stKg, rentangKg());
  const root = $('viewRoot'); if (!root) return;
  if (!$('kgWrap')) root.insertAdjacentHTML('beforeend', '<div id="kgWrap"></div>');
  await muatKinerjaGuru();
}

async function muatKinerjaGuru() {
  const wrap = $('kgWrap'); if (!wrap) return;
  wrap.innerHTML = `<section class="card"><div class="card-body"
    style="text-align:center;color:var(--text-3);padding:34px">
    <i class="fa-solid fa-circle-notch fa-spin"></i> Menghitung kinerja guru…
  </div></section>`;

  try {
    const { data } = await q(db.rpc('dashboard_kinerja_guru_rpc', {
      p_dari:    stKg.dari,
      p_sampai:  stKg.sampai,
      p_role:    stKg.role || null,
      p_jenjang: 'Semua',
      p_cari:    stKg.cari || null
    }), 'kinerja_guru');

    stKg.data = data;
    gambarKinerjaGuru();
  } catch (err) {
    console.error('[kinerja guru]', err);
    wrap.innerHTML = kartu('Aktivitas & Kinerja Guru', `
      <div class="card-note"><i class="fa-solid fa-triangle-exclamation"></i>
        Data kinerja guru tidak dapat dimuat: <b>${esc(err?.message || String(err))}</b></div>
      <div class="card-body">
        <p style="margin:0;font-size:12.5px;color:var(--text-2)">
          Pastikan berkas <b>monitoring_kinerja_guru.sql</b> sudah dijalankan di
          Supabase, dan akun yang dipakai ber-role <b>Admin</b> atau
          <b>Pimpinan</b>.</p>
      </div>`);
  }
}

function gambarKinerjaGuru() {
  const d = stKg.data || {};
  const r = d.ringkasan || {};
  const rank = d.ranking || [];
  const belum = Number(d.belum_terpetakan || 0);
  const b = d.bobot || {};
  const maks = Math.max(1, ...rank.map(g => Number(g.skor_kinerja) || 0));

  const ROLE = ['Semua','Admin','Guru','Walas','Guru BK','Guru Piket','Ustadz GEN-Z','Osis'];
  const num = (v, warna) => `<td class="kg-num ${v ? '' : 'nol'}"
    ${v && warna ? `style="color:${warna}"` : ''}>${angka(v)}</td>`;

  const baris = rank.map(g => {
    const skor = Number(g.skor_kinerja) || 0;
    const kelas = [g.peringkat <= 3 && skor > 0 ? 'top' : '',
                   g.total_aktivitas ? '' : 'pasif'].filter(Boolean).join(' ');
    return `<tr class="${kelas}">
      <td class="center" style="width:58px">
        <span class="kg-rank ${skor > 0 && g.peringkat <= 3 ? 'g' + g.peringkat : ''}">${g.peringkat}</span></td>
      <td><div class="kg-guru">
        <div class="kg-av">${esc((g.nama || '?').charAt(0).toUpperCase())}</div>
        <div class="kg-nm">${esc(g.nama)}</div></div></td>
      <td><span class="tag ${g.role === 'Admin' ? 'tag-ok'
        : g.role === 'Pimpinan' ? 'tag-violet' : 'tag-sea'}">${esc(g.role)}</span></td>
      ${num(g.pelanggaran_dicatat, 'var(--maroon)')}
      ${num(g.pembinaan_selesai, 'var(--violet)')}
      ${num(g.perizinan_diajukan + g.perizinan_diproses, 'var(--teal)')}
      ${num(g.hari_aktif)}
      <td><div class="kg-skor"><b>${angka(skor)}</b>
        <span class="kg-bar"><i style="width:${Math.round(skor / maks * 100)}%"></i></span></div></td>
      <td class="secondary nowrap">${g.aktivitas_terakhir ? tgl(g.aktivitas_terakhir) : '—'}</td>
      <td class="right"><button class="btn-link" data-kg="${esc(g.guru_id)}">
        <i class="fa-solid fa-eye"></i> Detail</button></td>
    </tr>`;
  }).join('') || barisKosong(10, 'Belum ada aktivitas pada rentang ini.',
    'Ubah rentang tanggal, peran, atau kata kunci pencarian.');

  $('kgWrap').innerHTML = `
    <div class="stats" style="margin-top:4px">
      ${stat('Guru Beraktivitas', angka(r.guru_beraktivitas || 0), 'fa-solid fa-chalkboard-user',
        'background:#E7F1F7;color:var(--sea)', 'var(--sea)',
        `${angka(r.guru_pasif || 0)} akun tanpa aktivitas`)}
      ${stat('Total Aktivitas', angka(r.total_aktivitas || 0), 'fa-solid fa-bolt',
        'background:var(--amber-bg);color:var(--amber)', 'var(--amber)',
        `${angka(r.total_pembinaan_selesai || 0)} pembinaan diselesaikan`)}
      ${stat('Pelanggaran Dicatat', angka(r.total_pelanggaran || 0), 'fa-solid fa-pen-to-square',
        'background:var(--maroon-bg);color:var(--maroon)', 'var(--maroon)',
        `${angka(r.total_perizinan || 0)} transaksi perizinan`)}
      ${stat('Skor Rata-rata', angka(r.skor_rata2 || 0), 'fa-solid fa-ranking-star',
        'background:var(--teal-bg);color:var(--teal)', 'var(--teal)',
        `Tertinggi ${angka(r.skor_tertinggi || 0)}`)}
    </div>

    ${kartu('Aktivitas & Kinerja Guru', `
      ${belum ? `<div class="card-note"><i class="fa-solid fa-triangle-exclamation"></i>
        <b>${angka(belum)}</b> aktivitas pada rentang ini belum terpetakan ke akun guru
        mana pun — biasanya data impor lama tanpa nama penindak.</div>` : ''}
      <div class="kg-roles" id="kgRoles">
        ${ROLE.map(x => `<button class="chip ${
          (stKg.role || 'Semua') === x ? 'on' : ''}" data-kgrole="${x}">${x}</button>`).join('')}
      </div>
      <div class="filters">
        <input id="kgCari" class="input grow" placeholder="Cari nama guru…" value="${esc(stKg.cari)}">
        <input id="kgDari" type="date" class="input" value="${stKg.dari}" title="Tanggal mulai">
        <input id="kgSampai" type="date" class="input" value="${stKg.sampai}" title="Tanggal akhir">
        <span class="sep"></span>
        <span class="tag tag-off">${angka(rank.length)} guru</span>
        <button class="btn btn-ghost btn-sm" id="kgReset">
          <i class="fa-solid fa-rotate-left"></i>90 Hari</button>
      </div>
      <div class="tbl"><table class="kg-tbl">
        <thead><tr><th class="center">#</th><th>Guru</th><th>Peran</th>
          <th class="center">Pelanggaran</th><th class="center">Pembinaan</th>
          <th class="center">Perizinan</th><th class="center">Hari Aktif</th>
          <th>Skor</th><th>Terakhir</th><th class="right">Aksi</th></tr></thead>
        <tbody>${baris}</tbody>
      </table></div>
      <div class="scroll-hint"><i class="fa-solid fa-arrows-left-right"></i>Geser ke samping untuk kolom lainnya.</div>
      <div class="kg-formula">
        <span>Formula skor:</span>
        <b><i class="fa-solid fa-hands-praying" style="color:var(--violet)"></i>Pembinaan selesai ×${b.pembinaan_selesai ?? 10}</b>
        <b><i class="fa-solid fa-scale-balanced" style="color:var(--maroon)"></i>Pelanggaran ×${b.pelanggaran_dicatat ?? 3}</b>
        <b><i class="fa-solid fa-door-open" style="color:var(--teal)"></i>Perizinan ×${b.perizinan_diajukan ?? 2}</b>
        <span style="flex:1"></span>
        <span>Ranking aktivitas, bukan penilaian mutu kerja.</span>
      </div>`,
      `<button class="btn btn-ghost btn-sm" id="kgCsv"><i class="fa-solid fa-file-csv"></i>Ekspor CSV</button>`,
      `Periode ${tgl(stKg.dari)} – ${tgl(stKg.sampai)}`)}`;

  pasangKinerjaGuru();
  tandaiTabelBisaGeser();
}

function pasangKinerjaGuru() {
  $('kgCari').addEventListener('input', debounce(e => {
    stKg.cari = e.target.value.trim(); muatKinerjaGuru();
  }, 320));
  $('kgDari').addEventListener('change', e => { stKg.dari = e.target.value; muatKinerjaGuru(); });
  $('kgSampai').addEventListener('change', e => { stKg.sampai = e.target.value; muatKinerjaGuru(); });
  $('kgReset').addEventListener('click', () => {
    Object.assign(stKg, rentangKg(), { role: '', cari: '' }); muatKinerjaGuru();
  });

  $('kgCsv').addEventListener('click', () => {
    const rows = (stKg.data?.ranking) || [];
    if (!rows.length) return toast('error', 'Belum ada data untuk diekspor.');
    unduhCsv(`kinerja-guru-${stKg.dari}_sd_${stKg.sampai}.csv`, [
      ['Peringkat','Nama','Peran','Pelanggaran Dicatat','Pembinaan Selesai',
       'Perizinan Diajukan','Perizinan Diproses','Total Aktivitas',
       'Santri Ditangani','Hari Aktif','Skor','Aktivitas Terakhir'],
      ...rows.map(g => [g.peringkat, g.nama, g.role, g.pelanggaran_dicatat,
        g.pembinaan_selesai, g.perizinan_diajukan, g.perizinan_diproses,
        g.total_aktivitas, g.santri_ditangani, g.hari_aktif, g.skor_kinerja,
        g.aktivitas_terakhir || ''])
    ]);
  });

  $('kgWrap').addEventListener('click', (e) => {
    const c = e.target.closest('[data-kgrole]');
    if (c) {
      const v = c.dataset.kgrole;
      stKg.role = v === 'Semua' ? '' : v;
      document.querySelectorAll('#kgRoles .chip').forEach(x => x.classList.toggle('on', x === c));
      return muatKinerjaGuru();
    }
    const b = e.target.closest('[data-kg]');
    if (b) bukaDetailKinerjaGuru(b.dataset.kg);
  });
}

async function bukaDetailKinerjaGuru(guruId) {
  loading(true);
  try {
    const { data } = await q(db.rpc('detail_aktivitas_guru', {
      p_guru_id: guruId, p_dari: stKg.dari, p_sampai: stKg.sampai
    }), 'detail_guru');

    const g = data.guru || {};
    const r = data.ringkasan || {};

    const item = (mark, warna, judul, tag, when, catatan) => `
      <div class="tl-item">
        <div class="mark" style="${warna}"><i class="fa-solid ${mark}"></i></div>
        <div class="body">
          <div class="row1"><p class="ttl" style="margin:0">${judul}</p>${tag || ''}</div>
          <div class="when">${when}</div>
          ${catatan ? `<div class="note">${catatan}</div>` : ''}
        </div></div>`;

    const daftar = {
      pembinaan: (data.pembinaan || []).map(b => item(
        'fa-hands-praying', 'background:var(--violet-bg);color:var(--violet)',
        esc(b.bentuk || 'Pembinaan'),
        `<span class="tag ${b.status_pembinaan === 'Selesai' ? 'tag-ok' : 'tag-wait'}">${esc(b.status_pembinaan)}</span>`,
        `${tgl(b.tanggal)} · ${esc(b.nama_siswa)} · ${esc(b.kelas)}`,
        esc(b.deskripsi_pelanggaran || ''))).join(''),

      pelanggaran: (data.pelanggaran || []).map(p => item(
        'fa-triangle-exclamation', 'background:var(--maroon-bg);color:var(--maroon)',
        esc(p.nama_pelanggaran),
        `<span class="tag ${tagKategori(p.kategori)}">${esc(p.kategori)} · ${p.bobot_pelanggaran}</span>`,
        `${tgl(p.tanggal)} · ${esc(p.nama_siswa)} · ${esc(p.kelas)}`,
        esc(p.catatan || ''))).join(''),

      perizinan: (data.perizinan || []).map(z => item(
        'fa-door-open', 'background:var(--teal-bg);color:var(--teal)',
        `Izin ${esc(z.jenis_izin || '-')}`,
        `<span class="tag ${tagIzin(z.status_persetujuan)}">${esc(z.status_persetujuan)}</span>`,
        `${tgl(z.tanggal)} · ${esc(z.nama_siswa)} · ${esc(z.peran)}`,
        esc(z.alasan || ''))).join('')
    };

    const kosongTeks = '<p style="text-align:center;color:var(--text-3);padding:28px 0">Belum ada catatan pada rentang ini.</p>';

    await Swal.fire({
      width: 820, showConfirmButton: false, showCloseButton: true,
      html: `<div style="text-align:left">
        <div class="santri-head">
          <div>
            <p class="nm">${esc(g.nama || '-')}</p>
            <p class="id">${esc(g.username || '-')} · ${esc(g.role || '-')}${
              (g.kelas_binaan || []).length ? ' · ' + esc(g.kelas_binaan.join(', ')) : ''}</p>
          </div>
          <div class="poin-badge">
            <p class="v">${angka(r.total_aktivitas || 0)}</p>
            <p class="k">Aktivitas</p>
          </div>
        </div>

        <div class="minis" style="padding:16px 0 4px">
          <div class="mini m"><span>Pelanggaran</span><b>${angka(r.pelanggaran_dicatat || 0)}</b></div>
          <div class="mini v"><span>Pembinaan</span><b>${angka(r.pembinaan_selesai || 0)}</b></div>
          <div class="mini t"><span>Perizinan</span><b>${angka((r.perizinan_diajukan || 0) + (r.perizinan_diproses || 0))}</b></div>
          <div class="mini s"><span>Hari Aktif</span><b>${angka(r.hari_aktif || 0)}</b></div>
        </div>

        <div class="chips" style="padding:14px 0;border:none">
          <button class="chip on" data-tab="pembinaan">Pembinaan</button>
          <button class="chip" data-tab="pelanggaran">Pelanggaran</button>
          <button class="chip" data-tab="perizinan">Perizinan</button>
        </div>

        <div class="tl" id="kgTl">${daftar.pembinaan || kosongTeks}</div>
      </div>`,
      didOpen: () => {
        document.querySelectorAll('[data-tab]').forEach(c =>
          c.addEventListener('click', () => {
            document.querySelectorAll('[data-tab]').forEach(x => x.classList.toggle('on', x === c));
            $('kgTl').innerHTML = daftar[c.dataset.tab] || kosongTeks;
          }));
      }
    });
  } catch (err) { fireError(err); }
  finally { loading(false); }
}

// ---------------------------------------------------------------------
// 25. MODUL PENGASUHAN — Catat Pelanggaran · Rekap · Perizinan
//
//     CARA PASANG (4 langkah, lihat PETUNJUK-PASANG.md):
//     1) Tempel seluruh isi berkas ini di app.js, tepat SEBELUM blok
//        "22. START — pulihkan sesi bila masih berlaku".
//     2) Tambahkan 'pengasuhan' pada MENU_ROLE dan JUDUL.
//     3) Tambahkan satu baris rute di navigateTo().
//     4) Tambahkan tombol menu di index.html + tempel pengasuhan.css.
//
//     Modul ini tidak menambah tabel maupun RPC baru: semuanya berjalan
//     di atas catat_pelanggaran, ajukan_perizinan, dan proses_perizinan
//     yang sudah dipakai modul lain.
// ---------------------------------------------------------------------

const PGS = {
  panel: 'catat',
  hari: '',
  master: [],
  cepat: [],
  recent: [],
  izinData: [],
  santri: null,
  pilih: null,
  rk: { cari: '', kategori: 'Semua', kelas: '', page: 1, size: 20 },
  iz: { filter: 'Semua', cari: '', page: 1, size: 12 }
};

/** Tiga gerbang layanan pengasuhan. Urutan = alur kerja musyrif harian. */
const PGS_FITUR = [
  { id:'catat', rum:'I', ikon:'fa-feather-pointed', ar:'تسجيل المخالفة',
    judul:'Catat Pelanggaran',
    sub:'Rekam kejadian santri lengkap dengan bidang, bobot poin, dan catatan penindak.' },
  { id:'rekap', rum:'II', ikon:'fa-layer-group', ar:'حصر المخالفات',
    judul:'Rekap Pelanggaran',
    sub:'Akumulasi berjenjang sesuai buku peraturan dayah, per santri dan siap diekspor.' },
  { id:'izin', rum:'III', ikon:'fa-door-open', ar:'الاستئذان',
    judul:'Perizinan Santri',
    sub:'Ajukan izin, pantau santri yang sedang di luar, dan tutup dengan keterangan balik.' }
];

/** Modul selalu bekerja pada unit Pengasuhan; konteks disetel otomatis. */
function pgsSetelKonteks() {
  if (APP.ctx.unit === 'Pengasuhan') return true;
  if (!bolehKonteks('Pengasuhan', 'Semua')) return false;
  APP.ctx = { unit: 'Pengasuhan', jenjang: 'Semua' };
  try { sessionStorage.setItem('rq_ctx', JSON.stringify(APP.ctx)); } catch (e) {}
  gambarBadgeKonteks();
  return true;
}

/** Santri aktif pada cakupan pengguna. */
async function pgsSantri() {
  return filterBinaan((await muatSiswa()).filter(aktifSantri), 'kelas');
}

/** Perizinan pada cakupan pengguna. */
async function pgsAmbilIzin() {
  const semua = await amanKosong(muatIzin, 'perizinan');
  if (!perluFilterKelas()) return semua;
  const boleh = new Set((await pgsSantri()).map(s => String(s.nisn)));
  return semua.filter(z => boleh.has(String(z.nisn)));
}

/** Enam jenis pelanggaran yang paling sering dicatat 30 hari terakhir. */
function pgsJenisCepat(detail, master) {
  const batas = kunciTgl(tambahHari(new Date(), -30));
  const hitung = {};
  detail.forEach(r => {
    const k = kunciTgl(r.tanggal);
    if (k < batas) return;
    const kode = String(r.kode_pelanggaran || '').trim();
    if (kode) hitung[kode] = (hitung[kode] || 0) + 1;
  });
  const urut = Object.entries(hitung).sort((a, b) => b[1] - a[1]).map(x => x[0]);
  const peta = Object.fromEntries(master.map(m => [String(m.kode_pelanggaran), m]));
  const out = urut.map(k => peta[k]).filter(Boolean).slice(0, 6);
  if (out.length < 6) {
    master.forEach(m => { if (out.length < 6 && !out.includes(m)) out.push(m); });
  }
  return out;
}

// ---------- Tampilan utama ----------
async function viewPengasuhan() {
  if (!pgsSetelKonteks()) {
    $('viewRoot').innerHTML = kartu('Unit Pengasuhan', `
      <div class="card-note"><i class="fa-solid fa-lock"></i>
        Akun Anda dibatasi pada unit <b>${esc(APP.profil?.unit_akses || 'Semua')}</b>,
        sehingga modul Pengasuhan tidak dapat dibuka. Hubungi Admin bila cakupan
        akun perlu diperluas.</div>`);
    return;
  }

  const [siswa, detailAll, masterAll, izin] = await Promise.all([
    pgsSantri(),
    amanKosong(muatDetail, 'pelanggaran'),
    amanKosong(muatMaster, 'master pelanggaran'),
    pgsAmbilIzin()
  ]);

  const detail = lingkupDetail(detailAll);
  const master = lingkupMaster(masterAll);

  PGS.hari = hariIni();
  PGS.master = master;
  PGS.cepat = pgsJenisCepat(detail, master);
  PGS.izinData = izin;
  PGS.recent = detail.slice(0, 8);

  const pekan = kunciTgl(tambahHari(new Date(), -6));
  const plgHari = detail.filter(r => kunciTgl(r.tanggal) === PGS.hari).length;
  const plgPekan = detail.filter(r => kunciTgl(r.tanggal) >= pekan).length;
  const izinPending = izin.filter(z => z.status_persetujuan === 'Pending').length;

  $('viewRoot').innerHTML = `
    <section class="pgs-hero">
      <div class="eyebrow"><span class="ar">التربية والانضباط</span><span class="rule"></span>
        <span class="lat">Unit Pengasuhan</span></div>
      <span class="ar pgs-ayat">وَأْمُرْ أَهْلَكَ بِالصَّلَاةِ وَاصْطَبِرْ عَلَيْهَا</span>
      <h2>Pengasuhan Santri</h2>
      <p>Ubudiyah, bahasa, kebersihan, dan keamanan asrama dicatat di satu tempat.
         Tiga layanan di bawah ini memakai basis data yang sama dengan laporan
         perkembangan santri, sehingga hasil catatan hari ini langsung terbaca
         pada rapor pembinaan.</p>
      <div class="meta">
        <span><i class="fa-solid fa-user-tie"></i>${esc(APP.profil?.nama || '')}</span>
        <span><i class="fa-solid fa-id-badge"></i>${esc(role())}</span>
        <span><i class="fa-regular fa-calendar"></i>${tgl(PGS.hari)}</span>
        ${bolehKonteks('Madrasah', 'Semua')
          ? `<span class="link" data-pgsgo="madrasah">
               <i class="fa-solid fa-right-left"></i>Pindah ke Madrasah</span>` : ''}
      </div>
    </section>

    <div class="stats">
      ${stat('Santri Diasuh', angka(siswa.length), 'fa-solid fa-user-group',
        'background:#E7F1F7;color:var(--sea)', 'var(--sea)',
        perluFilterKelas() ? 'Kelas binaan Anda' : 'Seluruh dayah')}
      ${stat('Dicatat Hari Ini', angka(plgHari), 'fa-solid fa-feather-pointed',
        'background:var(--maroon-bg);color:var(--maroon)', 'var(--maroon)', tgl(PGS.hari))}
      ${stat('Sepekan Terakhir', angka(plgPekan), 'fa-solid fa-chart-simple',
        'background:var(--amber-bg);color:var(--amber)', 'var(--amber)', '7 hari ke belakang')}
      ${stat('Izin Menunggu', angka(izinPending), 'fa-solid fa-hourglass-half',
        'background:var(--teal-bg);color:var(--teal)', 'var(--teal)', 'Belum ada keterangan balik')}
    </div>

    <div class="pgs-rail" id="pgsRail">${pgsRail()}</div>
    <div id="pgsPanel" class="pgs-panel"></div>`;

  onKlik(async (e) => {
    const go = e.target.closest('[data-pgsgo]');
    if (go) return setKonteks('Madrasah', 'MTs', 'madrasah');

    const p = e.target.closest('[data-pgs]');
    if (p) {
      PGS.panel = p.dataset.pgs;
      $('pgsRail').innerHTML = pgsRail();
      $('pgsPanel').scrollIntoView({ block: 'start', behavior: 'smooth' });
      return pgsGambarPanel();
    }

    const q = e.target.closest('[data-pgquick]');
    if (q) return pgsPilihCepat(q.dataset.pgquick);

    const d = e.target.closest('[data-detail]');
    if (d) return bukaDetailSantri(d.dataset.detail);

    const f = e.target.closest('[data-pgizfilter]');
    if (f) {
      PGS.iz.filter = f.dataset.pgizfilter; PGS.iz.page = 1;
      document.querySelectorAll('[data-pgizfilter]').forEach(c => c.classList.toggle('on', c === f));
      return pgsGambarIzin();
    }

    const z = e.target.closest('[data-pgizin]');
    if (z) return pgsProsesIzin(...z.dataset.pgizin.split('|'));

    const g = e.target.closest('[data-pg]');
    if (!g) return;
    const [tanda, hal] = g.dataset.pg.split(':');
    if (tanda === 'pgrk') { PGS.rk.page = Number(hal); pgsGambarRekap(); }
    if (tanda === 'pgiz') { PGS.iz.page = Number(hal); pgsGambarIzin(); }
  });

  pgsGambarPanel();
}

function pgsRail() {
  return PGS_FITUR.map(f => {
    const on = PGS.panel === f.id;
    return `<button class="pgs-portal${on ? ' on' : ''}" data-pgs="${f.id}"
              aria-pressed="${on}">
      <span class="rum">${f.rum}</span>
      <span class="seal"><i class="fa-solid ${f.ikon}"></i></span>
      <span class="ar">${f.ar}</span>
      <b>${esc(f.judul)}</b>
      <small>${esc(f.sub)}</small>
      <span class="go">${on ? 'Sedang dibuka' : 'Buka layanan'}
        <i class="fa-solid ${on ? 'fa-circle-dot' : 'fa-arrow-right'}"></i></span>
    </button>`;
  }).join('');
}

function pgsGambarPanel() {
  const el = $('pgsPanel'); if (!el) return;
  if (PGS.panel === 'rekap') { el.innerHTML = pgsPanelRekap(); pgsPasangRekap(); }
  else if (PGS.panel === 'izin') { el.innerHTML = pgsPanelIzin(); pgsPasangIzin(); }
  else { el.innerHTML = pgsPanelCatat(); pgsPasangCatat(); }
  tandaiTabelBisaGeser();
}

// ---------- Layanan I: catat pelanggaran ----------
function pgsPanelCatat() {
  const bisa = bolehTulis();
  const cepat = PGS.cepat || [];

  return kartu('Catat Pelanggaran Santri', `
    <div class="card-note"><i class="fa-solid fa-circle-info"></i>
      Jenis pelanggaran diambil dari Master Pelanggaran unit <b>Pengasuhan</b>.
      Poin, bidang, dan instruksi pembinaan diproses otomatis setelah disimpan.</div>

    ${cepat.length ? `<div class="pgs-quick">
      <span class="lbl"><i class="fa-solid fa-bolt"></i>Sering dicatat</span>
      ${cepat.map(m => `<button class="pgs-chip" data-pgquick="${esc(m.kode_pelanggaran)}"
          title="${esc(m.nama_pelanggaran)}">
        <span class="dot ${m.kategori === 'Ringan' ? 'r' : m.kategori === 'Sedang' ? 's' : 'b'}"></span>
        ${esc(m.nama_pelanggaran)}<b>${m.bobot_poin}</b></button>`).join('')}
    </div>` : ''}

    <div class="pgs-form">
      <div class="field"><label class="label">Tanggal Kejadian</label>
        <input id="pgTanggal" type="date" class="input" value="${PGS.hari}"></div>
      <div class="field"><label class="label">Cari Santri</label>
        <input id="pgSantri" class="input" autocomplete="off"
               placeholder="Nama atau NISN (min. 2 huruf)…">
        <p class="hint">Pilih dari daftar saran agar NISN terbaca dengan benar.</p></div>
    </div>

    <div class="pgs-pick" id="pgPick">
      <div class="ico"><i class="fa-solid fa-user-graduate"></i></div>
      <div><small>Santri Terpilih</small><b>Belum ada santri dipilih</b></div>
    </div>

    <div class="pgs-form">
      <div class="field wide"><label class="label">Jenis Pelanggaran</label>
        <input id="pgKode" class="input" autocomplete="off"
               placeholder="Ketik kode, nama, kategori, atau bidang…">
        <div id="pgInfo" class="hint">Belum ada jenis pelanggaran dipilih.</div></div>
      <div class="field wide"><label class="label">Catatan Kejadian</label>
        <textarea id="pgCatatan" class="input" rows="3" maxlength="500"
          placeholder="Contoh: tidak ikut shalat berjamaah subuh tanpa keterangan."></textarea>
        <div class="pgs-meter"><span class="hint">Opsional — membantu wali kelas memahami konteks.</span>
          <span class="hint mono" id="pgHitung">0 / 500</span></div></div>
    </div>

    <div class="pgs-bar">
      <span class="note"><i class="fa-solid fa-user-shield"></i>
        Penindak: ${esc(APP.profil?.nama || '-')}</span>
      ${bisa
        ? `<button class="btn btn-primary btn-sm" id="pgSimpan">
             <i class="fa-solid fa-floppy-disk"></i>Simpan Pelanggaran</button>`
        : `<span class="tag tag-off">Hanya baca</span>`}
    </div>`,
    `<span class="tag tag-sea">${angka(PGS.master.length)} jenis aktif</span>`,
    'Satu kali simpan menghasilkan satu catatan perkembangan santri.')

  + kartu('Catatan Terakhir di Pengasuhan', `
    <div class="tbl"><table>
      <thead><tr><th>Tanggal</th><th>Santri</th><th>Pelanggaran</th>
        <th>Kategori</th><th class="center">Poin</th><th class="right">Aksi</th></tr></thead>
      <tbody>${PGS.recent.map(r => `<tr>
        <td class="secondary nowrap" style="padding-top:14px">${tgl(r.tanggal)}</td>
        <td><div class="primary">${esc(r.nama_siswa)}</div>
            <div class="secondary">${esc(r.nisn)} · ${esc(r.kelas || '-')}</div></td>
        <td>${esc(r.nama_pelanggaran)}<div class="secondary">${esc(r.bidang || '-')}</div></td>
        <td><span class="tag ${tagKategori(r.kategori)}">${esc(r.kategori)}</span></td>
        <td class="num center" style="color:var(--maroon)">${r.bobot_pelanggaran}</td>
        <td class="right"><button class="btn-link" data-detail="${esc(r.nisn)}">
          <i class="fa-solid fa-eye"></i> Riwayat</button></td>
      </tr>`).join('') || barisKosong(6, 'Belum ada catatan pengasuhan.',
        'Catatan pertama akan muncul di sini setelah disimpan.')}
      </tbody></table></div>
    <div class="scroll-hint"><i class="fa-solid fa-arrows-left-right"></i>Geser ke samping untuk kolom lainnya.</div>`,
    '', 'Delapan catatan terbaru pada cakupan Anda.');
}

function pgsPasangCatat() {
  PGS.santri = null; PGS.pilih = null;
  const inp = $('pgSantri'); if (!inp) return;

  saranSantri(inp, (s) => {
    PGS.santri = s;
    $('pgPick').classList.add('on');
    $('pgPick').innerHTML = `
      <div class="ico"><i class="fa-solid fa-user-graduate"></i></div>
      <div><small>Santri Terpilih</small>
        <b>${esc(s.nama_siswa)} · ${esc(s.kelas || '-')} · ${esc(s.nisn)}</b></div>`;
  });

  saranPelanggaran($('pgKode'), (m) => pgsPasangMaster(m));
  $('pgKode').addEventListener('input', () => {
    if (!$('pgKode').dataset.kode) {
      PGS.pilih = null;
      $('pgInfo').textContent = 'Belum ada jenis pelanggaran dipilih.';
    }
  });

  $('pgCatatan').addEventListener('input', (e) => {
    $('pgHitung').textContent = `${e.target.value.length} / 500`;
  });

  $('pgSimpan')?.addEventListener('click', pgsSimpan);
}

function pgsPasangMaster(m) {
  PGS.pilih = m;
  const inp = $('pgKode');
  if (inp) { inp.value = `${m.kode_pelanggaran} — ${m.nama_pelanggaran}`; inp.dataset.kode = m.kode_pelanggaran; }
  $('pgInfo').innerHTML =
    `<span class="tag ${tagKategori(m.kategori)}">${esc(m.kategori)}</span>
     <b>${m.bobot_poin} poin</b> · ${esc(m.bidang || '-')} · ${esc(m.jenjang || 'Semua')}`;
}

function pgsPilihCepat(kode) {
  const m = (PGS.master || []).find(x => String(x.kode_pelanggaran) === String(kode));
  if (!m) return;
  if (PGS.panel !== 'catat') { PGS.panel = 'catat'; $('pgsRail').innerHTML = pgsRail(); pgsGambarPanel(); }
  pgsPasangMaster(m);
  document.querySelectorAll('[data-pgquick]').forEach(c =>
    c.classList.toggle('on', c.dataset.pgquick === String(kode)));
  $('pgSantri')?.focus();
}

async function pgsSimpan() {
  if (!PGS.santri) { $('pgSantri')?.focus(); return toast('error', 'Pilih santri terlebih dahulu.'); }
  const kode = PGS.pilih?.kode_pelanggaran || $('pgKode')?.dataset.kode || '';
  if (!kode) { $('pgKode')?.focus(); return toast('error', 'Pilih jenis pelanggaran dari daftar saran.'); }

  const hasil = await mdSimpanPelanggaran({
    p_nisn: PGS.santri.nisn,
    p_kode: kode,
    p_tanggal: $('pgTanggal').value || hariIni(),
    p_catatan: $('pgCatatan').value.trim(),
    p_force: false
  }, $('pgSimpan'), 'Menyimpan Pelanggaran…');

  if (!hasil) return;
  toast('success', `Tersimpan. Total poin santri: ${hasil.poin_baru ?? '-'}`);
  navigateTo('pengasuhan');
}

// ---------- Layanan II: rekap pelanggaran ----------
function pgsPanelRekap() {
  return kartu('Rekap Pelanggaran per Santri', `
    <div class="card-note"><i class="fa-solid fa-circle-info"></i>
      Rekap memakai kaskade buku peraturan: <b>5× ringan sejenis menjadi 1× sedang</b>,
      <b>5× sedang sejenis menjadi 1× berat</b>. Sisa yang belum genap tetap pada
      kategori aslinya.</div>
    <div class="filters">
      <input id="pgRkCari" class="input grow" placeholder="Cari nama atau NISN santri…"
             value="${esc(PGS.rk.cari)}">
      <select id="pgRkKategori" class="input">
        ${['Semua','Ringan','Sedang','Berat']
          .map(k => `<option ${k === PGS.rk.kategori ? 'selected' : ''}>${k}</option>`).join('')}
      </select>
      <select id="pgRkKelas" class="input"><option value="">Semua Kelas</option></select>
      <span class="sep"></span>
      <span class="tag tag-off" id="pgRkCount">0 santri</span>
      <button class="btn btn-ghost btn-sm" id="pgRkCsv">
        <i class="fa-solid fa-file-csv"></i>Ekspor CSV</button>
    </div>
    <div id="pgRkHasil"><div style="padding:26px;text-align:center;color:var(--text-3)">Memuat…</div></div>
    <div id="pgRkPager"></div>`,
    `<span class="tag tag-sea">Pengasuhan</span>`,
    'Angka yang muncul di sini sama dengan bagian akumulasi pada laporan cetak.');
}

async function pgsPasangRekap() {
  const sel = $('pgRkKelas');
  const kelas = await muatDaftarKelas();
  sel.innerHTML = `<option value="">Semua Kelas</option>` +
    kelas.map(k => `<option ${k === PGS.rk.kelas ? 'selected' : ''}>${esc(k)}</option>`).join('');

  $('pgRkCari').addEventListener('input', debounce(e => {
    PGS.rk.cari = e.target.value.trim(); PGS.rk.page = 1; pgsGambarRekap();
  }, 250));
  $('pgRkKategori').addEventListener('change', e => {
    PGS.rk.kategori = e.target.value; PGS.rk.page = 1; pgsGambarRekap();
  });
  sel.addEventListener('change', e => {
    PGS.rk.kelas = e.target.value; PGS.rk.page = 1; pgsGambarRekap();
  });
  $('pgRkCsv').addEventListener('click', async () => {
    const rows = await pgsHitungRekap();
    if (!rows.length) return toast('error', 'Belum ada data untuk diekspor.');
    const baris = [['NISN','Nama','Kelas','Kategori','Catatan','Jumlah']];
    rows.forEach(s => s.daftar.forEach(d =>
      baris.push([s.nisn, s.nama, s.kelas, d.kategori, d.deskripsi, d.jumlah])));
    unduhCsv(`rekap-pengasuhan-${hariIni()}.csv`, baris);
  });

  await pgsGambarRekap();
}

async function pgsHitungRekap() {
  const rows = rekapPerSantri(lingkupDetail(await muatDetail()));
  const k = PGS.rk.cari.toLowerCase();
  return rows
    .filter(s => !PGS.rk.kelas || s.kelas === PGS.rk.kelas)
    .filter(s => !k || String(s.nama).toLowerCase().includes(k) ||
                       String(s.nisn).toLowerCase().includes(k))
    .map(s => {
      const daftar = s.daftar.filter(d => PGS.rk.kategori === 'Semua' || d.kategori === PGS.rk.kategori);
      return daftar.length ? { ...s, daftar } : null;
    })
    .filter(Boolean);
}

async function pgsGambarRekap() {
  const rows = await pgsHitungRekap();
  const pages = Math.max(1, Math.ceil(rows.length / PGS.rk.size));
  if (PGS.rk.page > pages) PGS.rk.page = pages;
  const from = (PGS.rk.page - 1) * PGS.rk.size;
  const hal = rows.slice(from, from + PGS.rk.size);

  $('pgRkCount').textContent = `${angka(rows.length)} santri`;
  $('queryTime').textContent = `rekap pengasuhan · ${angka(rows.length)} santri`;

  if (!rows.length) {
    $('pgRkHasil').innerHTML = kosong('Tidak ditemukan santri dengan kriteria ini.',
      'Ubah kategori, kelas, atau kata kunci pencarian.', 'fa-layer-group');
    $('pgRkPager').innerHTML = '';
    return;
  }

  $('pgRkHasil').innerHTML = hal.map((s, i) => {
    const total = s.daftar.reduce((a, d) => a + d.jumlah, 0);
    return `<article class="pgs-rk">
      <div class="hd">
        <span class="no">${String(from + i + 1).padStart(2, '0')}</span>
        <div class="who">
          <b>${esc(s.nama)}</b>
          <span>${esc(s.nisn)} · ${esc(s.kelas)}</span>
        </div>
        <span class="tag tag-off">${total}× tercatat</span>
        <button class="btn-link" data-detail="${esc(s.nisn)}">Riwayat</button>
      </div>
      <ul>${s.daftar.map(d => `<li>
        <span class="tag ${tagKategori(d.kategori)}">${esc(d.kategori)}</span>
        <span class="txt">${esc(d.deskripsi)}</span>
        <span class="qty">${d.jumlah}×</span></li>`).join('')}</ul>
    </article>`;
  }).join('');

  $('pgRkPager').innerHTML = pager('pgrk', PGS.rk.page, rows.length, PGS.rk.size);
}

// ---------- Layanan III: perizinan ----------
function pgsPanelIzin() {
  const bisa = bolehTulis() && bolehPerizinan();
  return kartu('Perizinan Santri', `
    <div class="minis" style="padding-bottom:6px" id="pgIzMini"></div>
    <div class="chips">
      ${['Semua','Pending','Sesuai Waktu','Telat Balik'].map(f =>
        `<button class="chip ${f === PGS.iz.filter ? 'on' : ''}" data-pgizfilter="${f}">${f}</button>`).join('')}
    </div>
    <div class="filters">
      <input id="pgIzCari" class="input grow" placeholder="Cari santri, kelas, atau alasan…"
             value="${esc(PGS.iz.cari)}">
      <span class="sep"></span>
      <span class="tag tag-off" id="pgIzCount">0 kartu</span>
    </div>
    <div id="pgIzGrid" class="izin-grid"></div>
    <div id="pgIzPager"></div>`,
    bisa ? `<button class="btn btn-primary btn-sm" id="pgIzTambah">
             <i class="fa-solid fa-plus"></i>Ajukan Izin</button>` : '',
    'Izin yang belum ditutup akan menahan pencatatan pelanggaran pada tanggal yang sama.');
}

function pgsPasangIzin() {
  $('pgIzCari').addEventListener('input', debounce(e => {
    PGS.iz.cari = e.target.value.trim(); PGS.iz.page = 1; pgsGambarIzin();
  }, 250));
  $('pgIzTambah')?.addEventListener('click', pgsModalIzin);
  pgsGambarIzin();
}

function pgsGambarIzin() {
  const semua = PGS.izinData || [];
  let rows = semua.filter(z => PGS.iz.filter === 'Semua' || z.status_persetujuan === PGS.iz.filter);
  if (PGS.iz.cari) {
    const k = PGS.iz.cari.toLowerCase();
    rows = rows.filter(z => [z.siswa?.nama_siswa, z.siswa?.kelas, z.alasan, z.nisn, z.pemberi_izin]
      .some(v => String(v || '').toLowerCase().includes(k)));
  }

  const hit = (s) => semua.filter(z => z.status_persetujuan === s).length;
  $('pgIzMini').innerHTML = `
    <div class="mini a"><span>Menunggu</span><b>${angka(hit('Pending'))}</b></div>
    <div class="mini t"><span>Sesuai Waktu</span><b>${angka(hit('Sesuai Waktu'))}</b></div>
    <div class="mini m"><span>Telat Balik</span><b>${angka(hit('Telat Balik'))}</b></div>
    <div class="mini s"><span>Total Izin</span><b>${angka(semua.length)}</b></div>`;

  const pages = Math.max(1, Math.ceil(rows.length / PGS.iz.size));
  if (PGS.iz.page > pages) PGS.iz.page = pages;
  const from = (PGS.iz.page - 1) * PGS.iz.size;
  const hal = rows.slice(from, from + PGS.iz.size);

  $('pgIzCount').textContent = `${angka(rows.length)} kartu`;
  $('queryTime').textContent = `perizinan pengasuhan · ${angka(rows.length)} kartu`;

  $('pgIzGrid').innerHTML = hal.map(z => `
    <div class="izin">
      <div class="top">
        <div style="min-width:0">
          <p style="margin:0;font-weight:700;font-size:13.5px;overflow:hidden;
                    text-overflow:ellipsis;white-space:nowrap">
            ${esc(z.siswa?.nama_siswa || '(tidak ditemukan)')}</p>
          <p style="margin:2px 0 0;font-size:11.5px;color:var(--text-3)" class="mono">
            ${esc(z.nisn)} · ${esc(z.siswa?.kelas || '-')}</p>
        </div>
        <span class="tag ${tagIzin(z.status_persetujuan)}">${esc(z.status_persetujuan)}</span>
      </div>
      <div class="lines">
        <span><i class="fa-regular fa-calendar-days"></i>${tgl(z.tanggal_mulai)} s/d ${tgl(z.tanggal_selesai)}</span>
        <span><i class="fa-regular fa-bookmark"></i>${esc(z.jenis_izin || '-')}</span>
        <span><i class="fa-regular fa-comment-dots"></i>${esc(z.alasan || '-')}</span>
        <span><i class="fa-regular fa-user"></i>Diajukan oleh ${esc(z.pemberi_izin || '-')}</span>
      </div>
      ${z.status_persetujuan === 'Pending' && bolehPerizinan() && !hanyaBaca() ? `
        <div class="acts">
          <button class="btn btn-danger btn-sm" data-pgizin="${esc(z.id_izin)}|Telat Balik">
            <i class="fa-solid fa-clock-rotate-left"></i>Telat Balik</button>
          <button class="btn btn-ok btn-sm" data-pgizin="${esc(z.id_izin)}|Sesuai Waktu">
            <i class="fa-solid fa-check"></i>Sesuai Waktu</button>
        </div>` : ''}
    </div>`).join('') || kosong('Tidak ada data perizinan.',
      'Ubah filter status atau ajukan izin baru.', 'fa-door-open');

  $('pgIzPager').innerHTML = rows.length
    ? pager('pgiz', PGS.iz.page, rows.length, PGS.iz.size) : '';
}

async function pgsMuatUlangIzin() {
  cacheHapus('izin');
  PGS.izinData = await pgsAmbilIzin();
  pgsGambarIzin();
  refreshBadgePending();
}

async function pgsModalIzin() {
   if (CURRENT_USER?.role?.toLowerCase() === 'osis') {
    return toast('error', 'OSDA-RQ tidak diizinkan mengajukan perizinan.');
  }
  const res = await Swal.fire({
    title: 'Ajukan Perizinan', width: 540, showCancelButton: true,
    confirmButtonText: 'Simpan', cancelButtonText: 'Batal', confirmButtonColor: '#14618B',
    showLoaderOnConfirm: true, allowOutsideClick: () => !Swal.isLoading(),
    html: `<div class="stack">
      <div class="field"><label class="label">Santri</label>
        <input id="pzNisn" class="input" autocomplete="off" placeholder="Ketik nama atau NISN…">
        <p class="hint">Pilih dari daftar saran agar NISN terbaca dengan benar.</p></div>
      <div class="duo">
        <div class="field"><label class="label">Tanggal Mulai</label>
          <input id="pzMulai" type="date" class="input" value="${hariIni()}"></div>
        <div class="field"><label class="label">Tanggal Selesai</label>
          <input id="pzSelesai" type="date" class="input" value="${hariIni()}"></div>
      </div>
      <div class="field"><label class="label">Jenis Izin</label>
        <select id="pzJenis" class="input">
          <option>Keperluan</option><option>Sakit</option><option>Pemberitahuan</option>
        </select></div>
      <div class="field"><label class="label">Alasan</label>
        <textarea id="pzAlasan" class="input" rows="2"
          placeholder="Contoh: dijemput orang tua untuk keperluan keluarga."></textarea></div>
    </div>`,
    didOpen: () => { saranSantri($('pzNisn')); setTimeout(() => $('pzNisn').focus(), 120); },
    preConfirm: async () => {
      const el = $('pzNisn');
      const nisn = el.dataset.picked || el.value.split(' - ')[0].trim();
      if (!nisn) { Swal.showValidationMessage('Santri belum dipilih.'); return false; }
      const mulai = $('pzMulai').value, selesai = $('pzSelesai').value;
      if (!mulai || !selesai) { Swal.showValidationMessage('Tanggal mulai dan selesai wajib diisi.'); return false; }
      if (selesai < mulai) { Swal.showValidationMessage('Tanggal selesai tidak boleh lebih awal dari tanggal mulai.'); return false; }
      const { error } = await db.rpc('ajukan_perizinan', {
        p_nisn: nisn, p_mulai: mulai, p_selesai: selesai,
        p_jenis: $('pzJenis').value, p_alasan: $('pzAlasan').value.trim()
      });
      if (error) { Swal.showValidationMessage(error.message); return false; }
      return true;
    }
  });
  if (!res.isConfirmed) return;
  sync('done', 'Izin tersimpan');
  toast('success', 'Permohonan izin tersimpan');
  await pgsMuatUlangIzin();
}

async function pgsProsesIzin(idIzin, keputusan) {
  const r = await Swal.fire({
    icon: 'question', title: `Tandai "${keputusan}"?`,
    showCancelButton: true, confirmButtonText: 'Ya, simpan', cancelButtonText: 'Batal',
    confirmButtonColor: keputusan === 'Sesuai Waktu' ? '#0F766E' : '#9F1239'
  });
  if (!r.isConfirmed) return;
  sync('saving', 'Memproses izin…');
  try {
    await q(db.rpc('proses_perizinan', { p_id_izin: idIzin, p_keputusan: keputusan }), 'proses_izin');
    cacheHapus('izin', 'siswa');
    sync('done', 'Izin diperbarui');
    toast('success', 'Status izin: ' + keputusan);
    await pgsMuatUlangIzin();
  } catch (err) { sync('warn', 'Gagal memproses'); fireError(err); }
}

// ---------------------------------------------------------------------
// 22. START — pulihkan sesi bila masih berlaku
// ---------------------------------------------------------------------
(async function start() {
  const { data: { session } } = await db.auth.getSession();
  if (session) await masukAplikasi();
})();
