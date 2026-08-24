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
const bolehPerizinan = () => ['Admin','Guru','Guru Piket','Osis'].includes(role());
const bolehCetak     = () => !['Guru Piket','Ustadz GEN-Z','Walas'].includes(role());
const bolehPdf       = () => !['Guru Piket','Ustadz GEN-Z','Guru BK','Walas'].includes(role());
const bolehMaster    = () => !['Ustadz GEN-Z'].includes(role());
const bolehPembinaan = () => !['Osis','Guru Piket'].includes(role());
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
  pelanggaran: ['Admin','Guru','Walas','Guru BK','Guru Piket','Ustadz GEN-Z','Osis'],
  rekap:       ['Admin','Guru','Walas','Guru BK','Guru Piket','Ustadz GEN-Z','Osis'],
  perizinan:   ['Admin','Guru','Guru Piket','Osis'],
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
function cacheHapus(...ks) { ks.forEach(k => delete CACHE[k]); }

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
async function muatDetail() {
  return cacheGet('detail') || cacheSet('detail',
    await ambilSemua('detail_data', '*', { order: 'tanggal', asc: false }));
}
async function muatIzin() {
  return cacheGet('izin') || cacheSet('izin',
    await ambilSemua('log_perizinan', '*, siswa(nama_siswa,kelas,jenjang)', { order: 'tanggal_mulai', asc: false }));
}
async function muatPembinaan() {
  return cacheGet('pembinaan') || cacheSet('pembinaan',
    await ambilSemua('log_pembinaan', '*, siswa(nama_siswa,kelas,jenjang)', { order: 'tanggal_pembinaan', asc: false }));
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
  const [siswaAll, detailAll, izinAll, pembinaanAll] =
    await Promise.all([muatSiswa(), muatDetail(), muatIzin(), muatPembinaan()]);

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
    if (c) { const [u, j] = c.dataset.ctx.split('|'); setKonteks(u, j); }
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
  const [siswaAll, detailAll, izinAll, pembinaanAll] =
    await Promise.all([muatSiswa(), muatDetail(), muatIzin(), muatPembinaan()]);

  const siswa = siswaAll.filter(aktifSantri);
  const petaSiswa = Object.fromEntries(siswa.map(s => [String(s.nisn), s]));
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
      const s = petaSiswa[nisn] || {};
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
}

// ---------------------------------------------------------------------
// 12. PROFIL SANTRI
// ---------------------------------------------------------------------
const stSiswa = { page:1, size:25, cari:'', kelas:'', jenjang:'' };

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
const stPlg = { page:1, size:25, cari:'', kategori:'', bidang:'', kelas:'', dari:'', sampai:'' };

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
const stRekap = { kategori:'Semua', kelas:'', cari:'' };

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
    <div id="rkHasil"><div style="padding:26px;text-align:center;color:var(--text-3)">Memuat…</div></div>`,
    `<span class="tag tag-sea">${esc(labelKonteks())}</span>`);

  $('rkCari').addEventListener('input', debounce(e => { stRekap.cari = e.target.value.trim(); gambarRekap(); }, 250));
  $('rkKategori').addEventListener('change', e => { stRekap.kategori = e.target.value; gambarRekap(); });
  $('rkKelas').addEventListener('change', e => { stRekap.kelas = e.target.value; gambarRekap(); });
  $('rkCsv').addEventListener('click', async () => {
    const rows = await hitungRekap();
    const baris = [['NISN','Nama','Kelas','Kategori','Catatan','Jumlah']];
    rows.forEach(s => s.daftar.forEach(d => baris.push([s.nisn, s.nama, s.kelas, d.kategori, d.deskripsi, d.jumlah])));
    unduhCsv(`rekap-pelanggaran-${hariIni()}.csv`, baris);
  });

  onKlik((e) => {
    const d = e.target.closest('[data-detail]');
    if (d) bukaDetailSantri(d.dataset.detail);
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
  $('queryTime').textContent = `rekap · ${angka(rows.length)} santri`;
  if (!rows.length) {
    $('rkHasil').innerHTML = kosong('Tidak ditemukan santri dengan kriteria ini.',
      'Ubah kategori, kelas, atau kata kunci pencarian.', 'fa-layer-group');
    return;
  }
  $('rkHasil').innerHTML = rows.map(s => {
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
}

// ---------------------------------------------------------------------
// 15. PUSAT PERIZINAN
// ---------------------------------------------------------------------
const stIzin = { filter:'Semua', cari:'' };

async function viewPerizinan() {
  $('viewRoot').innerHTML = kartu('Pusat Perizinan', `
    <div class="chips" id="izinChips">
      ${['Semua','Pending','Sesuai Waktu','Telat Balik'].map(f =>
        `<button class="chip ${f===stIzin.filter?'on':''}" data-filter="${f}">${f}</button>`).join('')}
    </div>
    <div class="filters">
      <input id="izCari" class="input grow" placeholder="Cari santri, kelas, atau alasan…" value="${esc(stIzin.cari)}">
    </div>
    <div id="izinGrid" class="izin-grid"><div style="padding:20px;color:var(--text-3)">Memuat…</div></div>`,
    bolehTulis() && bolehPerizinan()
      ? `<button class="btn btn-primary btn-sm" id="btnAddIzin"><i class="fa-solid fa-plus"></i>Ajukan Izin</button>` : '');

  $('izCari').addEventListener('input', debounce(e => { stIzin.cari = e.target.value.trim(); gambarIzin(); }, 250));
  $('btnAddIzin')?.addEventListener('click', modalAjukanIzin);

  onKlik(async (e) => {
    const f = e.target.closest('[data-filter]');
    if (f) {
      stIzin.filter = f.dataset.filter;
      document.querySelectorAll('#izinChips .chip').forEach(c => c.classList.toggle('on', c === f));
      return gambarIzin();
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
  rows = rows.slice(0, 120);
  $('queryTime').textContent = `perizinan · ${angka(rows.length)} kartu`;

  $('izinGrid').innerHTML = rows.map(p => `
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
}

async function prosesIzin(id, keputusan) {
  const r = await Swal.fire({
    icon: keputusan === 'Sesuai Waktu' ? 'question' : 'warning',
    title: `Tandai "${keputusan}"?`,
    text: keputusan === 'Sesuai Waktu'
      ? 'Status keberadaan santri akan diperbarui otomatis.'
      : 'Catatan izin akan ditandai Telat Balik.',
    showCancelButton:true, confirmButtonText:'Ya', cancelButtonText:'Batal',
    confirmButtonColor: keputusan === 'Sesuai Waktu' ? '#14618B' : '#B45309' });
  if (!r.isConfirmed) return;
  sync('saving', 'Menyimpan status izin…');
  try {
    await q(db.rpc('proses_perizinan', { p_id_izin:id, p_keputusan:keputusan }), 'proses_izin');
    cacheHapus('izin','siswa');
    sync('done', 'Status izin tersimpan');
    toast('success', 'Status izin: ' + keputusan);
    gambarIzin(); refreshBadgePending();
  } catch (err) { sync('warn', 'Gagal menyimpan'); fireError(err); }
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

// ---------------------------------------------------------------------
// 16. PEMBINAAN
// ---------------------------------------------------------------------
const stBina = { cari:'', kategori:'', status:'', mode:'' };

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
      <div class="scroll-hint"><i class="fa-solid fa-arrows-left-right"></i>Geser ke samping untuk kolom lainnya.</div>`,
      `<button class="btn btn-ghost btn-sm" id="pbRefresh"><i class="fa-solid fa-rotate"></i>Muat Ulang</button>`,
      'Instrumen ditentukan otomatis oleh aturan Master Pembinaan di backend.')}`;

  ['pbKategori','pbStatus','pbMode'].forEach(id => $(id).addEventListener('change', e => {
    stBina[{pbKategori:'kategori', pbStatus:'status', pbMode:'mode'}[id]] = e.target.value; gambarBina();
  }));
  $('pbCari').addEventListener('input', debounce(e => { stBina.cari = e.target.value.trim(); gambarBina(); }, 220));
  $('pbRefresh').addEventListener('click', async () => { cacheHapus('pembinaan'); await gambarBina(); toast('success','Data dimuat ulang'); });

  onKlik(async (e) => {
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

  $('pbCount').textContent = `${angka(rows.length)} dari ${angka(semua.length)} data`;
  $('queryTime').textContent = `pembinaan · ${angka(rows.length)} baris`;

  const editable = bolehPembinaan() && !hanyaBaca();
  $('tbBina').innerHTML = rows.map(r => {
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

// ---------------------------------------------------------------------
// 17. REKAP PEMBINAAN PER SANTRI
// ---------------------------------------------------------------------
const stRb = { cari:'', kelas:'', status:'' };

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
      <div class="scroll-hint"><i class="fa-solid fa-arrows-left-right"></i>Geser ke samping untuk kolom lainnya.</div>`)}`;

  $('rbCari').addEventListener('input', debounce(e => { stRb.cari = e.target.value.trim(); gambarRb(); }, 220));
  $('rbKelas').addEventListener('change', e => { stRb.kelas = e.target.value; gambarRb(); });
  $('rbStatus').addEventListener('change', e => { stRb.status = e.target.value; gambarRb(); });
  onKlik(e => { const d = e.target.closest('[data-detail]'); if (d) bukaDetailSantri(d.dataset.detail); });

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

  $('rbCount').textContent = `${angka(rows.length)} santri`;
  $('tbRb').innerHTML = rows.map(r => `<tr>
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
        'Masih menunggu data presensi dari Madrasah.', 5)}</tbody>
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
    <table style="width:100%;font-size:11px;border-collapse:collapse;margin-bottom:24px;">
      <thead><tr>${['Tanggal','Kategori','Tahap','Bentuk Pembinaan','Status'].map(th).join('')}</tr></thead>
      <tbody>${baris(data.pembinaan, b =>
        `<tr>${td(tgl(b.tanggal_pembinaan))}${td(b.kategori||'-')}${td(b.pengulangan_ke?'Ke-'+b.pengulangan_ke:'-','text-align:center')}${td(b.bentuk_pembinaan||'-')}${td(b.status_pembinaan||'-')}</tr>`,
        'Belum ada instrumen pembinaan.', 5)}</tbody>
    </table>

    <table style="width:100%;font-size:12px;margin-top:36px;page-break-inside:avoid;break-inside:avoid;">
      <tr><td style="width:50%;text-align:center;">Musyrif Asrama</td>
          <td style="width:50%;text-align:center;">Wali Santri</td></tr>
      <tr><td style="height:58px;"></td><td></td></tr>
      <tr><td style="text-align:center;">(________________________)</td>
          <td style="text-align:center;">(________________________)</td></tr>
    </table>
  </div>`;
}

async function ambilLaporan(nisn) {
  const { data } = await q(db.rpc('laporan_santri', { p_nisn: nisn }), 'laporan_santri');
  if (!data || !data.siswa) throw new Error('Data laporan santri tidak ditemukan.');
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
    if (APP.view === 'dashboard' || APP.view === 'pimpinan') navigateTo(APP.view);
  } else if (tabel === 'log_pelanggaran' || tabel === 'detail_data') {
    cacheHapus('detail','siswa');
    if (APP.view === 'pelanggaran') muatTabelPlg();
    else if (APP.view === 'rekap') gambarRekap();
    else if (APP.view === 'dashboard' || APP.view === 'pimpinan') navigateTo(APP.view);
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
// 22. START — pulihkan sesi bila masih berlaku
// ---------------------------------------------------------------------
(async function start() {
  const { data: { session } } = await db.auth.getSession();
  if (session) await masukAplikasi();
})();
