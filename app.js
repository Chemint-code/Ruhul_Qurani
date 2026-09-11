/* =====================================================================
   SISTEM INFORMASI PENGEMBANGAN SANTRI — APLIKASI WEB MANDIRI
   Supabase (PostgreSQL + Auth + RLS + Realtime) · tanpa Apps Script

   Versi ini memuat hasil PORTING dari project Apps Script lama:
   - Konteks operasional Pengasuhan / Madrasah MTs / Madrasah MA
   - Rekap pelanggaran dengan kaskade konversi 5x Ringan -> 1 Sedang, dst.
   - Modul Pembinaan (KPI, filter, ubah status) + Rekap Pembinaan per santri
   - Master Bidang (divisi) berdampingan dengan Master Pelanggaran
   - Dashboard Pimpinan (analisis eksekutif, tier santri prioritas)
   - Laporan terpadu: cetak + unduh PDF (html2pdf) — MENGIKUTI PERIODE AKTIF
   - RBAC klien: Admin/Guru/Walas/Guru BK/Guru Piket/Ustadz GEN-Z/Osis/Pimpinan
   - Indikator sinkronisasi saat proses input
   - v2.12: Laporan pembinaan Ustadz GEN-Z → pengesahan guru kelas
     binaan (modul 28e); pengesah dikunci di database lewat
     boleh_sahkan_pembinaan()

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

// Aset opsional untuk layar login (diisi otomatis dari tabel foto_aset
// oleh visualLogin() di bagian bawah berkas ini — lihat modul FOTO PROFIL).
const ASET = { logo: '', foto: '', korps: '' };

// Bucket Supabase Storage tempat seluruh foto (profil guru & identitas
// dayah) disimpan — sesuai bucket yang sudah ada: Storage > Buckets > foto.
// Di dalamnya otomatis terbentuk folder per kategori (mis. profil_guru/,
// identitas_logo/, identitas_latar/), lalu per user di bawah profil_guru/.
// Tabel foto_aset (kategori, relasi_id, url_publik, nama_file, ukuran_px,
// is_aktif, tanggal_upload) & bucket ini perlu policy INSERT/UPDATE untuk
// role authenticated — lihat catatan penyiapan yang dikirim bersama berkas ini.
const BUCKET_FOTO = 'foto';
const FOTO_MAKS_MB = 4;

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true }
});

const APP = {
  profil: null,
  view: 'dashboard',
  charts: {},
  channel: null,
  onKlik: null,
  // `gender` (v2.10): 'Semua' | 'putra' | 'putri'. Hanya berlaku untuk
  // akun yang tidak terkunci pada satu unit — lihat unitGuru().
  ctx: { unit: 'Semua', jenjang: 'Semua', gender: 'Semua' },
  // Foto milik user yang sedang login (diisi setupProfilUserLogin)
  fotoSaya: null,
  // Identitas visual dayah: { identitas_logo, identitas_latar } — dipakai
  // bilah profil atas (gaya Path) sekaligus layar login.
  identitas: {}
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
// 2. RBAC KLIEN — SATU SUMBER KEBENARAN
//
//     Aturan ditulis per KEMAMPUAN (capability), bukan per peran.
//     Menambah peran baru cukup menyisipkan namanya pada baris yang
//     relevan di HAK; tidak perlu lagi menulis `if (role() === '...')`
//     di dalam view mana pun.
// ---------------------------------------------------------------------
const role = () => APP.profil?.role || '';

const SEMUA_ROLE = ['Admin','Guru','Walas','Guru BK','Guru Piket',
                    'Ustadz GEN-Z','Osis','Pimpinan','Klinik'];

const HAK = {
  // --- Pelanggaran -------------------------------------------------
  'plg.catat'       : ['Admin','Guru','Walas','Guru BK','Ustadz GEN-Z','Osis'],
  'plg.arsip'       : ['Admin','Guru','Walas','Guru BK','Ustadz GEN-Z','Osis'],

  // --- Perizinan ---------------------------------------------------
  'izin.lihat'      : ['Admin','Guru','Guru Piket','Klinik'],
  'izin.ajukan'     : ['Admin','Guru','Klinik'],
  'izin.proses'     : ['Admin','Guru'],
  'izin.perpanjang' : ['Admin','Guru','Klinik'],

  // --- Presensi Madrasah -------------------------------------------
  'presensi.lihat'  : ['Admin','Guru','Walas','Guru BK'],
  'presensi.isi'    : ['Admin','Guru','Walas'],

  // --- Pembinaan & Master ------------------------------------------
  // v2.12 — Legalitas pembinaan ada pada guru kelas binaan (dan Admin).
  // Pimpinan dikeluarkan karena database memang tidak pernah
  // mengizinkannya (tombolnya tampil tetapi selalu "Akses ditolak").
  // Batas sesungguhnya: fungsi boleh_sahkan_pembinaan() di Supabase.
  'bina.ubah'       : ['Admin','Guru'],
  // Ustadz GEN-Z = perpanjangan tangan musyrif asrama: melaksanakan dan
  // MELAPORKAN pembinaan kepada guru kelas binaan, tidak mengesahkan.
  'bina.lapor'      : ['Ustadz GEN-Z'],
  // Memberi tahu wali santri lewat WhatsApp. Sengaja lebih luas daripada
  // 'bina.ubah': wali kelas dan Guru BK adalah pihak yang paling sering
  // berhubungan dengan orang tua, walaupun tidak berwenang mengubah
  // status pembinaan.
  'wali.kabar'      : ['Admin','Guru','Walas','Guru BK','Pimpinan'],
  'master.lihat'    : ['Admin','Guru','Walas','Guru BK','Guru Piket'],
  'master.kelola'   : ['Admin'],

  // --- Laporan ------------------------------------------------------
  'cetak'           : ['Admin','Guru','Guru BK','Pimpinan'],
  'pdf'             : ['Admin','Guru','Pimpinan'],

  // --- Pesan tindak lanjut BK ---------------------------------------
  'pesan.lihat'     : ['Admin','Guru','Walas','Guru BK','Guru Piket','Ustadz GEN-Z','Pimpinan'],
  'pesan.mulai'     : ['Admin','Guru BK'],   // hanya BK yang memulai utas baru

  // --- Prestasi & apresiasi (poin positif) ---------------------------
  'prestasi.lihat'  : ['Admin','Guru','Walas','Guru BK','Guru Piket','Ustadz GEN-Z','Osis','Pimpinan'],
  'prestasi.catat'  : ['Admin','Guru','Walas','Guru BK','Ustadz GEN-Z'],
  'prestasi.arsip'  : ['Admin','Guru BK'],

  // --- Tahfiz Al-Qur'an ---------------------------------------------
  'tahfiz.lihat'    : ['Admin','Guru','Walas','Guru BK','Guru Piket','Ustadz GEN-Z','Pimpinan'],
  'tahfiz.setor'    : ['Admin','Guru','Walas','Ustadz GEN-Z'],
  'tahfiz.target'   : ['Admin','Guru','Walas','Ustadz GEN-Z'],

  // --- Target pembinaan (goal) --------------------------------------
  'goal.lihat'      : ['Admin','Guru','Walas','Guru BK','Guru Piket','Ustadz GEN-Z','Pimpinan'],
  'goal.tulis'      : ['Admin','Guru','Walas','Guru BK','Ustadz GEN-Z'],

  // --- Jejak audit ---------------------------------------------------
  'audit.lihat'     : ['Admin','Pimpinan'],

  // --- Batasan lingkup ----------------------------------------------
  'lingkup.kelas'   : ['Guru','Guru BK','Walas']   // hanya kelas binaan
};

/** Satu-satunya cara memeriksa wewenang di seluruh aplikasi. */
const bisa = (k) => (HAK[k] || []).includes(role());

/** Klinik dibatasi pada izin sakit saja. */
const KLINIK_SAKIT_SAJA = true;
const izinSakit = (z) => String(z?.jenis_izin || '').trim().toLowerCase() === 'sakit';

const isAdmin        = () => role() === 'Admin';
const hanyaBaca      = () => role() === 'Guru Piket';
const bolehTulis     = () => bisa('plg.catat');
const bolehPerizinan = () => bisa('izin.lihat');
const bolehCetak     = () => bisa('cetak');
const bolehPdf       = () => bisa('pdf');
const bolehMaster    = () => bisa('master.lihat');
const bolehPembinaan = () => bisa('bina.ubah');
const bolehKabarWali = () => bisa('wali.kabar') && !hanyaBaca();
const bolehLaporBina = () => bisa('bina.lapor') && !hanyaBaca();
const perluFilterKelas = () => bisa('lingkup.kelas');

/** Pengajuan izin: dipakai bersama oleh Perizinan & Pengasuhan. */
const bolehAjukanIzin = () => bisa('izin.ajukan') && !hanyaBaca();

/** Guru/Walas/Guru BK hanya melihat kelas binaannya. */
function filterBinaan(rows, field = 'kelas') {
  if (!perluFilterKelas()) return rows;
  const kb = APP.profil?.kelas_binaan || [];
  return rows.filter(r => kb.includes(r[field]));
}

/* =====================================================================
 * 3b. UNIT ASRAMA — PUTRA / PUTRI   (v2.10)
 * =====================================================================
 * Satu atap, satu database. Yang dipisahkan hanya KATALOG aturan
 * (master_pelanggaran & master_pembinaan) dan tampilan data santri,
 * bukan tabelnya.
 *
 * Penanda unit dibaca berlapis, dari yang paling tegas ke yang paling
 * bisa disimpulkan:
 *   1. kolom `unit_gender` (ada sejak migration v2.10);
 *   2. kolom `unit_gender` pada baris `siswa` yang tertanam lewat relasi;
 *   3. turunan dari NAMA KELAS, menurut ketetapan dayah.
 *
 * Lapis ketiga penting: ia membuat seluruh modul berjalan benar tanpa
 * mengubah view `detail_data` — baris pelanggaran sudah membawa `kelas`,
 * jadi unitnya bisa disimpulkan tanpa satu pun perubahan di database.
 *
 * Baris yang unitnya TIDAK bisa ditentukan sengaja TIDAK disembunyikan.
 * Menyembunyikan data karena ragu lebih berbahaya daripada menampilkan
 * data yang unitnya belum jelas.
 * ===================================================================== */
const UNIT_PUTRA = 'putra';
const UNIT_PUTRI = 'putri';

/**
 * Ketetapan dayah tentang penamaan kelas:
 *   MTs (VII, VIII, IX) -> putri memakai sufiks A, B, C
 *   MA  (X, XI, XII)    -> putri memakai sufiks A, B
 * Selebihnya putra. Perhatikan bahwa sufiks "C" berarti PUTRI di MTs
 * tetapi PUTRA di MA — jadi aturannya memang bergantung tingkat, dan
 * tidak boleh disederhanakan menjadi satu daftar huruf.
 */
const SUFIKS_PUTRI = { MTs: ['A','B','C'], MA: ['A','B'] };
const TINGKAT_MTS = ['VII','VIII','IX'];
const TINGKAT_MA  = ['X','XI','XII'];

/** Pecah 'VIII-E' / 'x - c' menjadi { tingkat:'VIII', sufiks:'E' }. */
function pecahKelas(kelas) {
  const m = String(kelas ?? '').trim().toUpperCase().match(/^([IVX]+)\s*-\s*([A-Z])\b/);
  return m ? { tingkat: m[1], sufiks: m[2] } : null;
}

/** Unit asrama menurut nama kelas. null bila pola kelas tidak dikenali. */
function unitDariKelas(kelas) {
  const p = pecahKelas(kelas);
  if (!p) return null;
  if (TINGKAT_MTS.includes(p.tingkat)) {
    return SUFIKS_PUTRI.MTs.includes(p.sufiks) ? UNIT_PUTRI : UNIT_PUTRA;
  }
  if (TINGKAT_MA.includes(p.tingkat)) {
    return SUFIKS_PUTRI.MA.includes(p.sufiks) ? UNIT_PUTRI : UNIT_PUTRA;
  }
  return null;
}

/** Normalisasi nilai kolom unit_gender. null bila kosong/tak dikenal. */
function normalUnit(v) {
  const s = String(v ?? '').trim().toLowerCase();
  if (s === UNIT_PUTRI) return UNIT_PUTRI;
  if (s === UNIT_PUTRA) return UNIT_PUTRA;
  return null;
}

/**
 * Unit satu baris MASTER (pelanggaran / pembinaan).
 * Baris tanpa kolom unit_gender dianggap PUTRA — itulah keadaan seluruh
 * 310 + 35 baris yang sudah ada, dan juga keadaan aplikasi bila
 * migration belum dijalankan. Dengan begitu jalur putra tidak pernah
 * kehilangan satu baris pun.
 */
function unitMaster(r) {
  return normalUnit(r?.unit_gender) || UNIT_PUTRA;
}

/**
 * Unit satu baris yang membawa identitas santri (siswa, detail_data,
 * log_pembinaan, prestasi, tahfiz, …). null bila tidak bisa ditentukan.
 */
function unitBaris(r) {
  if (!r) return null;
  return normalUnit(r.unit_gender)
      || normalUnit(r.siswa?.unit_gender)
      || unitDariKelas(r.kelas)
      || unitDariKelas(r.siswa?.kelas);
}

/** Unit yang tersirat dari nama korps. null bila tidak menyebut unit. */
function unitDariKorps(korps) {
  const k = String(korps ?? '');
  if (/putri|banat/i.test(k)) return UNIT_PUTRI;
  if (/putra|banin/i.test(k)) return UNIT_PUTRA;
  return null;
}

/**
 * Role yang memang bertugas melihat kedua unit. Keduanya tidak pernah
 * dikunci otomatis; pemisahannya mereka atur sendiri lewat pemilih unit
 * pada bilah konteks. Tanpa pengecualian ini, dua akun Admin yang
 * korps-nya 'Musyrif Asrama Putra' akan terkunci ke putra dan tidak bisa
 * mengunggah data putri sama sekali.
 */
const ROLE_DUA_UNIT = ['Admin','Pimpinan'];

/**
 * Unit asrama yang diampu akun yang sedang masuk.
 *   'putra' | 'putri' -> terkunci pada satu unit
 *   null              -> tidak terkunci (melihat kedua unit)
 *
 * Sumber utama adalah UNIT KELAS BINAAN, bukan korps: kelas binaan
 * adalah fakta penugasan yang sudah dipakai filterBinaan() dan sudah
 * terisi pada 17 dari 21 akun, sedangkan `korps` menurut keterangannya
 * sendiri "tidak memengaruhi hak akses". Korps hanya dipakai sebagai
 * cadangan untuk akun tanpa kelas binaan — dan itulah cara mengunci
 * akun Osis, yang strukturnya memang terpisah antara putra dan putri.
 */
function unitGuru(profil) {
  const p = profil || APP.profil;
  if (!p) return null;
  if (ROLE_DUA_UNIT.includes(p.role)) return null;

  const unitKelas = [...new Set((p.kelas_binaan || []).map(unitDariKelas).filter(Boolean))];
  if (unitKelas.length === 1) return unitKelas[0];
  if (unitKelas.length > 1)  return null;      // membina kelas di kedua unit

  return unitDariKorps(p.korps);               // cadangan: Osis & sejenisnya
}

/**
 * Unit yang sedang berlaku untuk penyaringan.
 * Akun terkunci selalu memakai unitnya sendiri — pemilih konteks tidak
 * bisa menembusnya. Akun dua unit memakai pilihan pada bilah konteks.
 */
function unitAktif() {
  return unitGuru() || normalUnit(APP.ctx.gender);
}

/** Apakah akun ini perlu melihat pemilih unit di bilah konteks? */
function bolehPilihUnit() { return !unitGuru(); }

/** Saring baris MASTER menurut unit aktif. Tanpa unit aktif, lewat utuh. */
function lingkupUnitMaster(rows) {
  const u = unitAktif();
  if (!u) return rows || [];
  return (rows || []).filter(r => unitMaster(r) === u);
}

/**
 * Saring baris bersantri menurut unit aktif. Baris yang unitnya tidak
 * bisa ditentukan tetap ditampilkan (lihat catatan di kepala bagian).
 */
function lingkupUnitSantri(rows) {
  const u = unitAktif();
  if (!u) return rows || [];
  return (rows || []).filter(r => { const x = unitBaris(r); return !x || x === u; });
}

/**
 * Pembungkus filterBinaan() yang juga menyaring unit asrama.
 * filterBinaan() sendiri TIDAK diubah satu karakter pun: jalur putra
 * yang sudah berjalan tetap memakai logika kelas binaan yang sama, dan
 * penyaringan unit hanya ditambahkan sebagai lapis di atasnya.
 */
function filterBinaanUnit(rows, field = 'kelas') {
  return lingkupUnitSantri(filterBinaan(rows, field));
}

const MENU_ROLE = {
  dashboard:   ['Admin','Guru','Walas','Guru BK','Guru Piket','Ustadz GEN-Z','Osis'],
  pimpinan:    ['Admin','Pimpinan'],
  bk:          ['Admin','Guru BK'],
  pesan:       ['Admin','Guru','Walas','Guru BK','Guru Piket','Ustadz GEN-Z','Pimpinan'],
  siswa:       ['Admin','Guru','Walas','Guru BK','Guru Piket','Ustadz GEN-Z','Osis'],
  pelanggaran: ['Admin'],
  prestasi:    ['Admin','Guru','Walas','Guru BK','Guru Piket','Ustadz GEN-Z','Osis','Pimpinan'],
  tahfiz:      ['Admin','Guru','Walas','Guru BK','Guru Piket','Ustadz GEN-Z','Pimpinan'],
  audit:       ['Admin','Pimpinan'],
  rekap:       ['Admin'],
  bidang:      ['Admin','Guru','Walas','Guru BK','Guru Piket','Pimpinan'],
  pengasuhan:  ['Admin','Guru','Walas','Guru BK','Guru Piket','Ustadz GEN-Z','Osis'],
  madrasah:    ['Admin','Guru','Walas','Guru BK','Guru Piket','Osis','Ustadz GEN-Z'],
  perizinan:   ['Admin','Guru','Guru Piket','Klinik'],
  pembinaan:   ['Admin','Guru','Walas','Guru BK','Guru Piket','Ustadz GEN-Z'],
  rekapbina:   ['Admin','Guru','Walas','Guru BK','Guru Piket','Ustadz GEN-Z'],
  master:      ['Admin','Guru','Walas','Guru BK','Guru Piket'],
  pengguna:    ['Admin']
};

const JUDUL = {
  dashboard:  { lat:'Ringkasan',       ar:'الملخّص',            teks:'Ringkasan' },
  pimpinan:   { lat:'Pimpinan',        ar:'لوحة القيادة',       teks:'Dashboard Pimpinan' },
  bk:         { lat:'Bimbingan',       ar:'لوحة الإرشاد',       teks:'Dashboard Guru BK' },
  pesan:      { lat:'Pesan',           ar:'الرسائل',            teks:'Pesan Tindak Lanjut' },
  siswa:      { lat:'Santri',          ar:'بيانات الطلاب',      teks:'Profil Santri' },
  pelanggaran:{ lat:'Pelanggaran',     ar:'المخالفات',          teks:'Catatan Pelanggaran' },
  prestasi:   { lat:'Prestasi',        ar:'الإنجازات',          teks:'Prestasi & Apresiasi' },
  tahfiz:     { lat:'Tahfiz',          ar:'تحفيظ القرآن',       teks:'Tahfiz Al-Qur\'an' },
  audit:      { lat:'Jejak Audit',     ar:'سجل التغييرات',      teks:'Jejak Audit Sistem' },
  rekap:      { lat:'Rekap',           ar:'حصر المخالفات',      teks:'Rekap Pelanggaran' },
  bidang:     { lat:'Evaluasi Bidang', ar:'تقويم المجالات',     teks:'Evaluasi Bidang Pelanggaran' },
  pengasuhan: { lat:'Pengasuhan',      ar:'التربية والانضباط',  teks:'Unit Pengasuhan' },
  madrasah:   { lat:'Madrasah',        ar:'المدرسة',            teks:'Modul Madrasah' },
  perizinan:  { lat:'Perizinan',       ar:'الاستئذان',          teks:'Pusat Perizinan' },
  pembinaan:  { lat:'Pembinaan',       ar:'التوجيه',            teks:'Pembinaan' },
  rekapbina:  { lat:'Rekap Pembinaan', ar:'حصر التوجيه',        teks:'Rekap Pembinaan' },
  master:     { lat:'Master',          ar:'دليل المخالفات',     teks:'Master Pelanggaran & Bidang' },
  pengguna:   { lat:'Pengguna',        ar:'المستخدمون',         teks:'Manajemen Pengguna' }
};

/** Halaman awal tiap peran — dipakai login maupun fallback navigasi. */
const RUMAH_ROLE = { Pimpinan:'pimpinan', Klinik:'perizinan', 'Guru BK':'bk' };
const rumah = () => RUMAH_ROLE[role()] || 'dashboard';

/* =====================================================================
 * KORPS MUSYRIF ASRAMA PUTRA — lambang kebanggaan unit
 * =====================================================================
 * Lambang ini BUKAN logo dayah. Logo dayah tetap menempati slot
 * identitas (#loginLogo, #pbarLogoImg) dan tetap menjadi kop laporan
 * yang diterima wali santri. Yang di bawah ini identitas UNIT, jadi ia
 * hanya muncul bagi akun yang memang bertugas di asrama putra —
 * justru pembatasan itulah yang membuatnya terbaca sebagai lencana.
 *
 * Gambarnya sendiri tidak disimpan di sini: ia tertanam di index.html
 * sebagai mask CSS (--korps), sehingga satu aset melayani warna putih
 * di atas navy maupun navy di atas kertas, dan tetap tampil luring.
 * Satu-satunya salinan raster ada di KORPS_CAP, khusus lembar cetak —
 * html2canvas tidak merender mask CSS.
 * =================================================================== */

/** Cap lambang untuk lembar cetak (PNG navy, latar transparan). */
const KORPS_CAP = 'data:image/png;base64,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';

/**
 * Tera (watermark) lambang korps untuk lembar cetak.
 *
 * Opasitasnya (kira-kira 5,5 persen) DIPANGGANG ke dalam kanal alfa PNG,
 * bukan diatur saat menggambar. Alasannya: jsPDF menggambar berurutan
 * tanpa lapisan, jadi tera selalu jatuh DI ATAS teks. Pada kepekatan
 * serendah itu hasilnya tidak terbedakan dari tera yang duduk di
 * belakang — dan tidak bergantung pada dukungan GState yang tidak selalu
 * tersedia di semua versi jsPDF.
 */
const KORPS_TERA = 'data:image/png;base64,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';

/**
 * Ubah URL gambar menjadi data URI, sekali per URL.
 *
 * Logo dayah tersimpan sebagai URL publik Supabase. Menyematkannya
 * sebagai data URI lebih dulu membuat kop tetap tercetak walau CORS
 * berubah atau jaringan mati saat tombol Cetak ditekan — dan
 * html2canvas tidak perlu menunggu unduhan di tengah render.
 */
const _uriGambar = new Map();
async function dataUriGambar(url) {
  if (!url) return '';
  if (_uriGambar.has(url)) return _uriGambar.get(url);
  try {
    const res = await fetch(url, { mode:'cors', cache:'force-cache' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const blob = await res.blob();
    const uri = await new Promise((selesai, gagal) => {
      const fr = new FileReader();
      fr.onload  = () => selesai(fr.result);
      fr.onerror = () => gagal(fr.error || new Error('Gagal membaca berkas'));
      fr.readAsDataURL(blob);
    });
    _uriGambar.set(url, uri);
    return uri;
  } catch (e) {
    // Bukan alasan menggagalkan laporan: pakai URL apa adanya dan
    // biarkan html2canvas mencoba lewat useCORS.
    console.warn('[kop] Logo dayah tidak dapat disematkan:', e.message);
    _uriGambar.set(url, url);
    return url;
  }
}

/**
 * Lambang korps BERWARNA (simbol saja, latar transparan) — tertanam.
 *
 * Dipakai pada lencana bilah profil. Simbolnya saja, bukan lockup penuh:
 * pada tile 46 px, baris "MUSYRIF ASRAMA PUTRA" tingginya di bawah 2 px
 * dan hanya menjadi noda abu. Lockup penuh berwarna tetap dipakai, tetapi
 * di tempat yang ukurannya memang memadai — kop lembar cetak.
 *
 * Tertanam, bukan diambil dari Supabase, supaya lencana tetap muncul saat
 * aplikasi dibuka luring. 160 px, palet dikuantisasi ke 64 warna: 14 KB,
 * dan pada ukuran tayang (34 px) tidak terbedakan dari aslinya.
 */
const KORPS_WARNA = 'data:image/png;base64,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';

/** Akun yang dipaksa masuk korps bila aturan di bawah belum memadai. */
const KORPS_PAKSA = [];

/**
 * Apakah pemilik profil ini anggota korps musyrif asrama putra?
 *
 * Tabel `profiles` belum punya kolom korps, jadi penandanya dibaca
 * berlapis. Begitu kolom `korps` (atau `asrama`) ditambahkan, lapis
 * pertama langsung mengambil alih tanpa menyentuh kode lain — dan
 * itulah cara yang benar untuk memisahkan asrama putra dari putri.
 */
function korpsMusyrifPutra(profil) {
  const p = profil || APP.profil;
  if (!p) return false;
  if (KORPS_PAKSA.includes(p.id) || KORPS_PAKSA.includes(p.username)) return true;
  if (p.korps)  return /musyrif/i.test(p.korps)  && !/putri|banat/i.test(p.korps);
  if (p.asrama) return /putra|banin/i.test(p.asrama) && !/putri|banat/i.test(p.asrama);
  // Penanda yang tersedia hari ini: akun yang cakupannya dikunci pada
  // unit Pengasuhan adalah pembina asrama, bukan guru madrasah.
  return String(p.unit_akses || '').trim() === 'Pengasuhan';
}

/**
 * Satu saklar untuk seluruh antarmuka. Semua tampilan lambang di CSS
 * dikunci di balik `body.korps`, jadi tidak ada elemen yang perlu
 * disembunyikan satu per satu — dan tidak ada tempat yang terlewat.
 */
function terapkanKorps(aktif) {
  document.body.classList.toggle('ada-korps', !!aktif);
  // Lambang berwarna dipasang dari konstanta tertanam, bukan dari
  // Supabase: lencana harus tetap muncul saat aplikasi dibuka luring.
  const img = $('pbarKorpsImg');
  if (img && aktif && !img.src) img.src = KORPS_WARNA;
  // Diingat pada perangkat ini supaya layar login pun sudah menyambut
  // dengan lencananya sebelum nama diketik. Hanya penanda tampilan;
  // tidak ada data pribadi yang disimpan.
  try { localStorage.setItem('rq_korps', aktif ? '1' : '0'); } catch (e) {}
}

/* Pulihkan penanda sedini mungkin — sebelum layar login digambar. */
try {
  if (localStorage.getItem('rq_korps') === '1') document.body.classList.add('ada-korps');
} catch (e) {}

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

/** Data prestasi (poin positif) — pola sama dengan detail_data. */
async function muatPrestasi() {
  const c = cacheGet('prestasi'); if (c) return c;
  return cacheSet('prestasi', await amanKosong(
    () => ambilSemua('log_prestasi', '*', { order:'tanggal', asc:false }), 'prestasi'));
}
/** Data setoran tahfiz. */
async function muatTahfiz() {
  const c = cacheGet('tahfiz'); if (c) return c;
  return cacheSet('tahfiz', await amanKosong(
    () => ambilSemua('log_tahfiz', '*', { order:'tanggal', asc:false }), 'tahfiz'));
}
/** Katalog jenis prestasi. */
async function muatMasterPrestasi() {
  const c = cacheGet('masterPrestasi'); if (c) return c;
  return cacheSet('masterPrestasi', await amanKosong(
    () => ambilSemua('master_prestasi', '*', { order:'kode_prestasi' }), 'master prestasi'));
}
/** Target hafalan per santri per periode. */
async function muatTargetTahfiz() {
  const c = cacheGet('targetTahfiz'); if (c) return c;
  return cacheSet('targetTahfiz', await amanKosong(
    () => ambilSemua('target_tahfiz', '*', { order:'periode', asc:false }), 'target tahfiz'));
}

const aktifPrestasi = (r) => String(r.status || 'Active').trim().toLowerCase() !== 'archived';
const aktifTahfiz   = (r) => String(r.status || 'Active').trim().toLowerCase() !== 'archived';

/** 'yyyy-MM' satu bulan sebelumnya — dipakai loop target antar periode. */
function bulanSebelum(bulan) {
  const [th, bl] = String(bulan || '').split('-').map(Number);
  if (!th || !bl) return '';
  const d = new Date(th, bl - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

const aktifDetail = (r) => String(r.status || '').trim().toLowerCase() !== 'archived';
const aktifPembinaan = (r) => String(r.status_record || 'Active').trim().toLowerCase() !== 'archived';
const aktifSantri = (s) => !['nonaktif','inactive','archived']
  .includes(String(s.status_santri || 'Aktif').trim().toLowerCase());

// ---------------------------------------------------------------------
// 4. KONTEKS OPERASIONAL (Pengasuhan / Madrasah MTs / MA)
// ---------------------------------------------------------------------
function normalKonteks(unit, jenjang, gender) {
  let u = ['Semua','Pengasuhan','Madrasah'].includes(unit) ? unit : 'Semua';
  let j = ['Semua','MTs','MA'].includes(jenjang) ? jenjang : 'Semua';
  if (u !== 'Madrasah') j = 'Semua';
  // v2.10 — unit asrama. Argumen ketiga sengaja opsional supaya seluruh
  // pemanggil lama (yang hanya mengirim unit & jenjang) tetap sah dan
  // tidak kehilangan pilihan unit yang sedang aktif.
  let g = gender === undefined ? (APP.ctx?.gender ?? 'Semua') : gender;
  g = normalUnit(g) || 'Semua';
  if (unitGuru()) g = 'Semua';       // akun terkunci: pilihan tidak berlaku
  return { unit: u, jenjang: j, gender: g };
}

/** Label unit asrama untuk bilah konteks. '' bila tidak perlu ditampilkan. */
function labelUnitAsrama() {
  const kunci = unitGuru();
  if (kunci) return kunci === UNIT_PUTRI ? 'Putri' : 'Putra';
  const g = normalUnit(APP.ctx.gender);
  return g ? (g === UNIT_PUTRI ? 'Putri' : 'Putra') : '';
}

function labelKonteks() {
  const { unit, jenjang } = APP.ctx;
  const asrama = labelUnitAsrama();
  const imbuh = asrama ? ` · ${asrama}` : '';
  if (unit === 'Pengasuhan') return 'Pengasuhan' + imbuh;
  if (unit === 'Madrasah') return (jenjang === 'Semua' ? 'Madrasah' : `Madrasah ${jenjang}`) + imbuh;
  return (asrama ? 'Semua Unit' : 'Semua Unit') + imbuh;
}

/** Akun dengan unit_akses/jenjang_akses terbatas tidak boleh pindah unit lain. */
function bolehKonteks(unit, jenjang) {
  const ua = APP.profil?.unit_akses || 'Semua';
  const ja = APP.profil?.jenjang_akses || 'Semua';
  if (ua !== 'Semua' && unit !== 'Semua' && ua !== unit) return false;
  if (unit === 'Madrasah' && ja !== 'Semua' && jenjang !== 'Semua' && ja !== jenjang) return false;
  return true;
}

function setKonteks(unit, jenjang, pindah, gender) {
  const ctx = normalKonteks(unit, jenjang, gender);
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
    if (raw) { const p = JSON.parse(raw); APP.ctx = normalKonteks(p.unit, p.jenjang, p.gender); }
  } catch (e) { APP.ctx = { unit:'Semua', jenjang:'Semua', gender:'Semua' }; }
  const ua = APP.profil?.unit_akses || 'Semua';
  if (APP.ctx.unit === 'Semua' && ua !== 'Semua') {
    APP.ctx = normalKonteks(ua, APP.profil?.jenjang_akses || 'Semua', APP.ctx.gender);
  }
  if (!bolehKonteks(APP.ctx.unit, APP.ctx.jenjang)) {
    APP.ctx = { unit:'Semua', jenjang:'Semua', gender: APP.ctx.gender || 'Semua' };
  }
  gambarBadgeKonteks();
}

function gambarBadgeKonteks() {
  const el = $('ctxLabel'); if (el) el.textContent = labelKonteks();
  const badge = $('ctxBadge');
  if (badge) badge.title = 'Unit operasional aktif: ' + labelKonteks();
  gambarPilihUnit();
}

/**
 * Pemilih unit asrama pada bilah konteks (v2.10).
 *
 * Hanya muncul untuk akun yang TIDAK terkunci — Admin, Pimpinan, dan
 * akun tanpa penanda unit. Akun yang terkunci melihat lencana mati
 * berisi unitnya, bukan pemilih, supaya tidak ada kesan bahwa unit lain
 * bisa dibuka lewat antarmuka.
 */
function gambarPilihUnit() {
  const box = $('unitBox'); if (!box) return;
  const kunci = unitGuru();

  if (kunci) {
    box.classList.remove('hidden');
    box.innerHTML = `<i class="fa-solid fa-house-chimney-user"></i>
      <span class="unit-tetap" title="Akun Anda terkunci pada unit ini">Asrama ${
        kunci === UNIT_PUTRI ? 'Putri' : 'Putra'}</span>`;
    return;
  }

  box.classList.remove('hidden');
  const g = normalUnit(APP.ctx.gender) || 'Semua';
  box.innerHTML = `<i class="fa-solid fa-house-chimney-user"></i>
    <select id="unitPilih" class="per-in" title="Unit asrama yang sedang ditampilkan">
      <option value="Semua" ${g === 'Semua' ? 'selected' : ''}>Dua Unit</option>
      <option value="putra" ${g === UNIT_PUTRA ? 'selected' : ''}>Asrama Putra</option>
      <option value="putri" ${g === UNIT_PUTRI ? 'selected' : ''}>Asrama Putri</option>
    </select>`;

  $('unitPilih')?.addEventListener('change', (e) => {
    setKonteks(APP.ctx.unit, APP.ctx.jenjang, null, e.target.value);
  });
}

/** Terapkan konteks + kelas binaan + periode pada baris detail_data. */
function lingkupDetail(rows, pakaiPeriode = true) {
  let out = (rows || []).filter(aktifDetail);
  const { unit, jenjang } = APP.ctx;
  if (unit === 'Pengasuhan') out = out.filter(r => String(r.sumber || '').trim() === 'Pengasuhan');
  if (unit === 'Madrasah') {
    out = out.filter(r => String(r.sumber || '').trim() === 'Madrasah');
    if (jenjang !== 'Semua') out = out.filter(r => String(r.jenjang || '').trim() === jenjang);
  }
  if (pakaiPeriode) out = saringPeriode(out, 'tanggal');
  return filterBinaanUnit(out, 'kelas');
}

/** Master pelanggaran yang relevan dengan konteks aktif. */
function lingkupMaster(rows) {
  let out = rows || [];
  const { unit, jenjang } = APP.ctx;
  if (unit !== 'Semua') out = out.filter(m => String(m.sumber || 'Pengasuhan').trim() === unit);
  if (unit === 'Madrasah' && jenjang !== 'Semua') {
    out = out.filter(m => { const j = String(m.jenjang || 'Semua').trim(); return !j || j === 'Semua' || j === jenjang; });
  }
  // v2.10: katalog pelanggaran putri berbeda istilah dari putra, jadi
  // lingkup unit ikut menentukan baris mana yang boleh muncul.
  return lingkupUnitMaster(out);
}

// ---------------------------------------------------------------------
// 4b. PERIODE BULANAN
//     Pendidik melapor bulanan, jadi seluruh modul operasional bisa
//     dipersempit ke satu bulan. Basis penyaringan dapat dipilih:
//       - 'kejadian' : tanggal peristiwa (tanggal, tanggal_mulai, dst.)
//       - 'input'    : tanggal baris dibuat di database (created_at)
// ---------------------------------------------------------------------
APP.periode = { aktif:false, bulan:'', basis:'kejadian' };

/** Kolom waktu input bisa berbeda antar tabel; ambil yang pertama ada. */
const KOLOM_INPUT = ['created_at','dibuat_pada','waktu_input','inserted_at','diperbarui'];

function tglInputBaris(r, fallback) {
  for (const f of KOLOM_INPUT) if (r[f]) return kunciTgl(r[f]);
  return kunciTgl(r[fallback]);
}

const bulanDari = (k) => String(k || '').slice(0, 7);
const bulanIni  = () => bulanDari(hariIni());

function labelPeriode() {
  if (!APP.periode.aktif || !APP.periode.bulan) return 'Semua Periode';
  const [th, bl] = APP.periode.bulan.split('-');
  return `${BULAN_ID[Number(bl) - 1] || bl} ${th}`;
}

/** Label pendek untuk nama berkas ekspor. */
const berkasPeriode = () => APP.periode.aktif && APP.periode.bulan
  ? APP.periode.bulan : hariIni();

/**
 * Batas tanggal periode aktif: { bulan, awal, akhir } — atau null bila
 * periode tidak aktif. Dipakai laporan bulanan (cetak & PDF) dan
 * penyaringan perizinan yang rentangnya melintasi bulan.
 */
function batasPeriode() {
  if (!APP.periode.aktif || !APP.periode.bulan) return null;
  const [th, bl] = APP.periode.bulan.split('-').map(Number);
  if (!th || !bl) return null;
  const hariAkhir = new Date(th, bl, 0).getDate();
  return {
    bulan: APP.periode.bulan,
    awal:  `${APP.periode.bulan}-01`,
    akhir: `${APP.periode.bulan}-${String(hariAkhir).padStart(2,'0')}`
  };
}

/** Satu baris lolos periode atau tidak. `fKejadian` = nama kolom tanggalnya. */
function dalamPeriode(r, fKejadian) {
  if (!APP.periode.aktif || !APP.periode.bulan) return true;
  const k = APP.periode.basis === 'input'
    ? tglInputBaris(r, fKejadian)
    : kunciTgl(r[fKejadian]);
  return bulanDari(k) === APP.periode.bulan;
}

/**
 * Perizinan dihitung masuk periode bila RENTANGNYA BERSINGGUNGAN dengan
 * bulan aktif. Contoh: 29 Juni – 3 Juli tetap muncul pada laporan Juli.
 */
function izinDalamPeriode(z) {
  const p = batasPeriode();
  if (!p) return true;
  if (APP.periode.basis === 'input') return dalamPeriode(z, 'tanggal_mulai');
  const mulai = kunciTgl(z?.tanggal_mulai);
  const selesai = kunciTgl(z?.tanggal_selesai) || mulai;
  if (!mulai && !selesai) return false;
  const a = mulai || selesai, b = selesai || mulai;
  return a <= p.akhir && b >= p.awal;
}

/** Penyaring siap pakai untuk array. */
const saringPeriode = (rows, fKejadian) =>
  (rows || []).filter(r => dalamPeriode(r, fKejadian));

/** Penyaring perizinan berbasis persinggungan rentang. */
const saringPeriodeIzin = (rows) => (rows || []).filter(izinDalamPeriode);

function setPeriode(bulan, basis, aktif) {
  APP.periode = {
    aktif: !!aktif && !!bulan,
    bulan: bulan || bulanIni(),
    basis: ['kejadian','input'].includes(basis) ? basis : 'kejadian'
  };
  try { sessionStorage.setItem('rq_periode', JSON.stringify(APP.periode)); } catch (e) {}
  gambarBadgePeriode();
  navigateTo(APP.view);
}

function pulihkanPeriode() {
  try {
    const raw = sessionStorage.getItem('rq_periode');
    if (raw) {
      const p = JSON.parse(raw);
      APP.periode = {
        aktif: !!p.aktif,
        bulan: p.bulan || bulanIni(),
        basis: ['kejadian','input'].includes(p.basis) ? p.basis : 'kejadian'
      };
    } else {
      APP.periode = { aktif:false, bulan: bulanIni(), basis:'kejadian' };
    }
  } catch (e) { APP.periode = { aktif:false, bulan: bulanIni(), basis:'kejadian' }; }
  gambarBadgePeriode();
  pasangPeriode();
}

function gambarBadgePeriode() {
  const box = $('periodeBox'); if (!box) return;
  box.classList.toggle('on', APP.periode.aktif);
  $('perBulan').value = APP.periode.bulan || bulanIni();
  $('perBasis').value = APP.periode.basis;
  box.title = APP.periode.aktif
    ? `Menampilkan ${labelPeriode()} berdasarkan tanggal ${APP.periode.basis}`
    : 'Menampilkan seluruh periode. Pilih bulan untuk memfokuskan laporan.';
}

let PERIODE_TERPASANG = false;
function pasangPeriode() {
  if (PERIODE_TERPASANG || !$('periodeBox')) return;
  PERIODE_TERPASANG = true;
  $('perBulan').addEventListener('change', e =>
    setPeriode(e.target.value, APP.periode.basis, true));
  $('perBasis').addEventListener('change', e =>
    setPeriode(APP.periode.bulan, e.target.value, APP.periode.aktif));
  $('perReset').addEventListener('click', () =>
    setPeriode(APP.periode.bulan, APP.periode.basis, false));
}

// ---------------------------------------------------------------------

/**
 * =====================================================================
 * FOTO PROFIL & IDENTITAS DAYAH — modul bersama
 * =====================================================================
 * Dipakai oleh: avatar sidebar (foto diri sendiri), Panel Kinerja Guru,
 * Manajemen Pengguna (foto guru/pengguna lain), dan identitas visual
 * (logo + latar) halaman login.
 *
 * Skema yang dipakai (tabel `foto_aset`, sudah ada di database):
 *   kategori        text        'profil_guru' | 'identitas_logo' | 'identitas_latar'
 *   relasi_id       uuid        id user pemilik foto. Untuk identitas dayah,
 *                               diisi id admin pengunggah tapi TIDAK dipakai
 *                               sebagai filter saat membaca — identitas bersifat global.
 *   url_publik      text        URL publik hasil unggah ke Supabase Storage
 *   nama_file       text
 *   ukuran_px       text        "lebar x tinggi", dihitung otomatis saat unggah
 *   is_aktif        bool
 *   tanggal_upload  timestamptz
 *
 * Berkas disimpan di Supabase Storage, bucket BUCKET_FOTO (lihat konfigurasi
 * di bagian atas berkas ini). Bucket dan policy INSERT/UPDATE untuk role
 * authenticated pada foto_aset perlu dibuat manual bila belum ada.
 *
 * ✅ setupProfilUserLogin()  → foto milik user yang SEDANG LOGIN saja (sidebar).
 * ✅ muatFotoBanyak()        → foto BANYAK user sekaligus dalam satu query
 *                              (Panel Kinerja Guru, Manajemen Pengguna). Ini
 *                              yang sebelumnya TIDAK ADA — setupProfilUserLogin()
 *                              tidak bisa dipakai untuk menampilkan foto guru lain.
 * ✅ unggahFoto()            → satu fungsi unggah dipakai bersama oleh ketiganya.
 * =====================================================================
 */

/** Ambil dimensi gambar ("lebar x tinggi") dari sebuah File, untuk kolom ukuran_px. */
function dimensiGambar(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(`${img.naturalWidth}x${img.naturalHeight}`); };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(''); };
    img.src = url;
  });
}

/** Validasi dasar sebelum unggah: tipe gambar & ukuran berkas. */
function validasiFotoUpload(file) {
  if (!file) return 'Berkas tidak ditemukan.';
  if (!/^image\/(png|jpe?g|webp)$/i.test(file.type)) return 'Format harus JPG, PNG, atau WEBP.';
  if (file.size > FOTO_MAKS_MB * 1024 * 1024) return `Ukuran berkas maksimal ${FOTO_MAKS_MB}MB.`;
  return null;
}

/**
 * Unggah satu foto ke Storage lalu catat sebagai baris aktif di foto_aset.
 * `global:true` dipakai untuk identitas dayah (logo/latar login): foto lama
 * dinonaktifkan berdasarkan KATEGORI saja (bukan per-pengunggah), karena
 * identitas bersifat satu untuk seluruh dayah, bukan milik satu akun.
 *
 * @returns {Promise<string>} URL publik foto yang baru diunggah.
 */
async function unggahFoto(kategori, relasiId, file, { global = false } = {}) {
  const salah = validasiFotoUpload(file);
  if (salah) throw new Error(salah);

  const ukuran = await dimensiGambar(file);
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
  const aman = String(relasiId || 'dayah').replace(/[^a-zA-Z0-9_-]/g, '') || 'dayah';
  const path = `${kategori}/${aman}/${Date.now()}.${ext}`;

  const up = await db.storage.from(BUCKET_FOTO).upload(path, file, {
    upsert: true, cacheControl: '3600', contentType: file.type
  });
  if (up.error) throw new Error(`Gagal mengunggah ke penyimpanan: ${up.error.message}`);

  const { data: pub } = db.storage.from(BUCKET_FOTO).getPublicUrl(path);
  const urlPublik = pub?.publicUrl;
  if (!urlPublik) throw new Error('URL publik foto tidak diperoleh.');

  let nonaktifkan = db.from('foto_aset')
    .update({ is_aktif: false, tanggal_update: new Date().toISOString() })
    .eq('kategori', kategori).eq('is_aktif', true);
  if (!global) nonaktifkan = nonaktifkan.eq('relasi_id', relasiId);
  await nonaktifkan;

  const { error: insErr } = await db.from('foto_aset').insert({
    kategori, relasi_tabel: global ? null : 'profiles', relasi_id: relasiId || null,
    url_publik: urlPublik, storage_path: path, nama_file: file.name,
    ukuran_px: ukuran, ukuran_kb: Math.round(file.size / 1024) || null,
    mime_type: file.type, is_aktif: true
  });
  if (insErr) throw new Error(`Gagal menyimpan data foto: ${insErr.message}`);

  return urlPublik;
}

/** Ambil satu foto aktif terbaru untuk satu relasi (mis. foto diri sendiri). */
async function muatFotoSatu(kategori, relasiId) {
  if (!relasiId) return '';
  const { data, error } = await db.from('foto_aset')
    .select('url_publik').eq('kategori', kategori).eq('relasi_id', relasiId)
    .eq('is_aktif', true).order('tanggal_upload', { ascending: false }).maybeSingle();
  if (error && error.code !== 'PGRST116') console.warn('[foto]', error.message);
  return data?.url_publik || '';
}

/**
 * Ambil foto aktif untuk BANYAK relasi sekaligus dalam satu query — dipakai
 * agar Panel Kinerja Guru dan Manajemen Pengguna bisa menampilkan foto asli
 * puluhan guru tanpa query satu per satu.
 *
 * @returns {Promise<Object<string,string>>} peta { relasi_id: url_publik }
 */
async function muatFotoBanyak(kategori, ids) {
  const unik = [...new Set((ids || []).filter(Boolean).map(String))];
  if (!unik.length) return {};
  const { data, error } = await db.from('foto_aset')
    .select('relasi_id, url_publik, tanggal_upload')
    .eq('kategori', kategori).eq('is_aktif', true).in('relasi_id', unik)
    .order('tanggal_upload', { ascending: false });
  if (error) { console.warn('[foto]', error.message); return {}; }
  const peta = {};
  (data || []).forEach(r => { if (!peta[r.relasi_id]) peta[r.relasi_id] = r.url_publik; });
  return peta;
}

/** Ambil identitas visual dayah (logo + latar login) — global, tanpa filter relasi_id. */
async function muatIdentitasDayah() {
  const { data, error } = await db.from('foto_aset')
    .select('kategori, url_publik, tanggal_upload')
    .in('kategori', ['identitas_logo', 'identitas_latar', 'korps_logo']).eq('is_aktif', true)
    .order('tanggal_upload', { ascending: false });
  if (error) { console.warn('[identitas]', error.message); return {}; }
  const hasil = {};
  (data || []).forEach(r => { if (!hasil[r.kategori]) hasil[r.kategori] = r.url_publik; });
  return hasil;
}

/** Pasang fallback seragam: bila foto asli gagal dimuat, ganti ke placeholder inisial. */
function pasangFallbackFoto(scopeEl) {
  (scopeEl || document).querySelectorAll('img[data-fallback-nama]').forEach(img => {
    img.onerror = () => {
      img.onerror = null;
      img.src = generateUserAvatarPlaceholder(img.dataset.fallbackNama || '', img.dataset.fallbackRole || '');
    };
  });
}

// =====================================================================
// GLOBAL PROFIL SETUP — dipakai Admin, Guru, Walas, semua peran
// =====================================================================

/**
 * Setup profil untuk user yang SEDANG LOGIN (Admin, Guru, Walas, dll).
 * Hanya memuat foto MILIK SENDIRI — untuk daftar foto banyak guru/pengguna
 * lain sekaligus, pakai muatFotoBanyak().
 * Cukup dipanggil di viewDashboard(); otomatis bekerja untuk siapa pun yang login.
 */
async function setupProfilUserLogin() {
  try {
    const { data: authUser, error: authError } = await db.auth.getUser();
    if (authError || !authUser?.user?.id) { console.warn('[profil] Tidak ada user yang login'); return; }

    const userId = authUser.user.id;
    const namaUser = APP.profil?.nama_lengkap || APP.profil?.nama ||
                     authUser.user.email?.split('@')[0] || 'User';
    const roleUser = APP.profil?.role || 'User';
    APP.fotoSaya = { userId, nama: namaUser, role: roleUser };

    const urlFoto = await muatFotoSatu('profil_guru', userId);

    terapkanIdentitasPengguna(namaUser, roleUser, userId);
    terapkanFotoProfilUI(urlFoto, namaUser, roleUser);
    console.log(urlFoto ? '[profil] ✅ Foto loaded' : '[profil] Menggunakan placeholder avatar');
    console.log(`✅ [profil] Selesai load profil: ${namaUser} (${roleUser})`);
  } catch (e) {
    console.error('[profil] Setup error:', e.message);
  }
}

/* =====================================================================
 * BILAH PROFIL ATAS (gaya Path) — nama, peran, foto profil, latar & logo
 * =====================================================================
 * Elemen di index.html: #profileBar (#pbarAvatar, #pbarAvatarImg,
 * #pbarNama, #pbarRole, #pbarLogoImg, #pbarBtnStudio).
 * Satu sumber kebenaran untuk foto: fungsi di bawah ini memperbarui
 * sidebar DAN bilah atas sekaligus, jadi tidak pernah beda tampilan.
 * ===================================================================== */

/** Tulis nama & peran ke sidebar dan bilah profil atas sekaligus. */
function terapkanIdentitasPengguna(nama, peran, userId) {
  const namaEl = $('guru-nama'), roleEl = $('guru-role');
  if (namaEl) { namaEl.textContent = nama; if (userId) namaEl.title = `User ID: ${userId}`; }
  if (roleEl) roleEl.textContent = peran;
  const pn = $('pbarNama'), pr = $('pbarRole');
  if (pn) pn.textContent = nama;
  if (pr) pr.textContent = peran;
  const salam = $('pbarSalam');
  if (salam) salam.textContent = salamWaktu();
}

/** Sapaan mengikuti waktu setempat — sentuhan kecil yang membuat bilah terasa hidup. */
function salamWaktu() {
  const j = new Date().getHours();
  if (j < 11) return 'Selamat pagi';
  if (j < 15) return 'Selamat siang';
  if (j < 18) return 'Selamat sore';
  return 'Selamat malam';
}

/** Pasang foto profil (atau placeholder inisial) ke avatar sidebar & bilah atas. */
function terapkanFotoProfilUI(url, nama, peran) {
  const namaX = nama || APP.fotoSaya?.nama || 'User';
  const peranX = peran || APP.fotoSaya?.role || 'User';
  const cadangan = generateUserAvatarPlaceholder(namaX, peranX);
  [$('guru-avatar-img'), $('pbarAvatarImg')].forEach(img => {
    if (!img) return;
    img.dataset.fallbackNama = namaX;
    img.dataset.fallbackRole = peranX;
    img.onerror = () => { img.onerror = null; img.src = cadangan; };
    img.style.opacity = '0';
    img.onload = () => { img.style.transition = 'opacity .5s ease-in-out'; img.style.opacity = '1'; };
    img.src = url || cadangan;
    img.alt = `Profil ${namaX}`;
  });
  if (APP.fotoSaya) APP.fotoSaya.url = url || '';
}

/** Terapkan identitas dayah (logo + latar) ke bilah profil dan layar login. */
function terapkanIdentitasVisual(identitas) {
  const idn = identitas || APP.identitas || {};
  APP.identitas = idn;
  if (idn.identitas_latar) ASET.foto = idn.identitas_latar;
  if (idn.identitas_logo) ASET.logo = idn.identitas_logo;
  if (idn.korps_logo)     ASET.korps = idn.korps_logo;

  // Foto latar dipasang sekali di elemen akar sebagai properti --cover,
  // lalu diwarisi SEMUA kotak hero (bilah profil, hero ringkasan &
  // pimpinan, hero Pengasuhan, kepala arsip Administrasi). Kelas
  // 'ada-latar' menjadi saklarnya di CSS: tanpa foto, seluruh hero
  // kembali ke gradasi navy aslinya.
  const akar = document.documentElement;
  if (ASET.foto) {
    akar.style.setProperty('--cover', `url("${ASET.foto.replace(/"/g, '\\"')}")`);
    akar.classList.add('ada-latar');
  } else {
    akar.style.removeProperty('--cover');
    akar.classList.remove('ada-latar');
  }

  // Bilah profil atas memakai lapisan tersendiri agar bisa memudar masuk.
  const bar = $('profileBar');
  if (bar) bar.classList.toggle('ready', !!ASET.foto);
  const logoBar = $('pbarLogoImg');
  if (logoBar) {
    if (ASET.logo) { logoBar.src = ASET.logo; logoBar.onload = () => logoBar.classList.add('ready'); }
    else { logoBar.removeAttribute('src'); logoBar.classList.remove('ready'); }
  }

  // Layar login — foto menutup seluruh layar (termasuk di balik kartu masuk),
  // jadi properti --photo dipasang di wadah terluar, bukan di kolom kiri.
  const scr = $('loginScreen');
  if (scr) {
    if (ASET.foto) {
      scr.style.setProperty('--photo', `url("${ASET.foto.replace(/"/g, '\\"')}")`);
      scr.classList.add('ready');
    } else {
      scr.style.removeProperty('--photo');
      scr.classList.remove('ready');
    }
  }
  const logoLogin = $('loginLogo');
  if (logoLogin && ASET.logo) {
    logoLogin.src = ASET.logo;
    logoLogin.onload = () => logoLogin.classList.add('ready');
  }
}

/** Baca ulang identitas dayah dari database lalu terapkan ke seluruh antarmuka. */
async function muatDanTerapkanIdentitas() {
  try {
    terapkanIdentitasVisual(await muatIdentitasDayah());
  } catch (e) { console.warn('[identitas]', e.message); }
}

/** Klik avatar (sidebar atau bilah atas) → pilih berkas → unggah foto profil sendiri. */
function pasangUploadFotoSaya() {
  const inp = $('inpFotoSaya');
  if (!inp) return;
  [$('guru-avatar-container'), $('pbarAvatar')].forEach(btn =>
    btn?.addEventListener('click', () => inp.click()));
  $('pbarBtnStudio')?.addEventListener('click', () => bukaStudioIdentitas());

  inp.addEventListener('change', async () => {
    const file = inp.files?.[0]; inp.value = '';
    if (!file || !APP.fotoSaya?.userId) return;
    sync('saving', 'Mengunggah foto…');
    try {
      const url = await unggahFoto('profil_guru', APP.fotoSaya.userId, file);
      terapkanFotoProfilUI(url);
      sync('done', 'Foto profil diperbarui');
      toast('success', 'Foto profil diperbarui');
    } catch (e) {
      sync('warn', 'Gagal mengunggah foto');
      fireError(e);
    }
  });
}
pasangUploadFotoSaya();

/* ---------------------------------------------------------------------
 * STUDIO IDENTITAS — satu jendela untuk foto profil, foto latar, dan logo
 * ---------------------------------------------------------------------
 * Inilah antarmuka unggah latar & logo yang sebelumnya hanya tersedia di
 * menu Master & Bidang. Semua peran dapat mengganti foto profilnya;
 * slot Foto Latar dan Logo Dayah hanya tampil untuk Admin.
 * ------------------------------------------------------------------- */
function bingkaiStudio(kategori, label, url, hint) {
  return `<div class="idn-item">
    <span class="lbl">${esc(label)}</span>
    <div class="idn-frame${url ? ' filled' : ''}" data-stu="${kategori}"
         title="Klik untuk unggah / ganti" role="button" tabindex="0">
      ${url
        ? `<img src="${esc(url)}" alt="${esc(label)}">`
        : `<div class="idn-empty"><i class="fa-solid fa-image"></i>Belum ada berkas</div>`}
      <div class="idn-over"><i class="fa-solid fa-camera"></i>Ganti ${esc(label)}</div>
    </div>
    <small>${esc(hint)}</small>
  </div>`;
}

function bukaStudioIdentitas() {
  const admin = isAdmin();
  const idn = APP.identitas || {};
  const fotoSaya = APP.fotoSaya?.url || '';

  Swal.fire({
    title: 'Studio Identitas',
    width: admin ? 760 : 420,
    showConfirmButton: false,
    showCloseButton: true,
    html: `
      <p class="stu-lead">Foto ditayangkan langsung di bilah profil atas${admin ? ', sidebar, dan layar login' : ' dan sidebar'}.
        Klik bingkai untuk memilih berkas.</p>
      <div class="stu-grid${admin ? '' : ' solo'}">
        ${bingkaiStudio('profil_guru', 'Foto Profil', fotoSaya,
          'Wajah terlihat jelas, potongan persegi, minimal 400×400 piksel.')}
        ${admin ? bingkaiStudio('identitas_latar', 'Foto Latar', idn.identitas_latar,
          'Sampul bilah profil & layar login. Lanskap, minimal 1600 piksel.') : ''}
        ${admin ? bingkaiStudio('identitas_logo', 'Logo Dayah', idn.identitas_logo,
          'Tampil di bilah atas & layar login. PNG latar transparan.') : ''}
        ${admin ? bingkaiStudio('korps_logo', 'Logo Korps', idn.korps_logo,
          'Lambang Musyrif Asrama Putra pada kop lembar cetak. Berwarna, mendatar.') : ''}
      </div>
      <p class="stu-note"><i class="fa-solid fa-circle-info"></i>
        Maksimal ${FOTO_MAKS_MB} MB · format JPG, PNG, atau WEBP${admin ? '' : ' · latar & logo diatur Admin'}.</p>
      <input type="file" id="stuInput" accept="image/png,image/jpeg,image/webp" class="hidden">`,
    didOpen: () => pasangStudioIdentitas()
  });
}

function pasangStudioIdentitas() {
  const wadah = Swal.getHtmlContainer();
  const inp = wadah?.querySelector('#stuInput');
  if (!inp) return;
  let target = null;

  wadah.querySelectorAll('[data-stu]').forEach(el => {
    const buka = () => { target = el; inp.click(); };
    el.addEventListener('click', buka);
    el.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); buka(); }
    });
  });

  inp.addEventListener('change', async () => {
    const file = inp.files?.[0]; inp.value = '';
    if (!file || !target) return;
    const el = target, kategori = el.dataset.stu;
    const global = kategori !== 'profil_guru';

    el.classList.add('busy');
    sync('saving', 'Mengunggah berkas…');
    try {
      const { data: authUser } = await db.auth.getUser();
      const uid = authUser?.user?.id || APP.fotoSaya?.userId;
      if (!uid) throw new Error('Sesi tidak dikenali. Muat ulang halaman lalu coba lagi.');

      const url = await unggahFoto(kategori, uid, file, { global });

      el.classList.add('filled');
      el.innerHTML = `<img src="${esc(url)}" alt="">
        <div class="idn-over"><i class="fa-solid fa-camera"></i>Ganti</div>`;

      if (kategori === 'profil_guru') {
        terapkanFotoProfilUI(url);
        toast('success', 'Foto profil diperbarui');
      } else {
        APP.identitas = { ...(APP.identitas || {}), [kategori]: url };
        terapkanIdentitasVisual(APP.identitas);
        // Kartu Identitas Dayah di Master & Bidang ikut disegarkan bila terbuka.
        const kembar = $(kategori === 'identitas_logo' ? 'idnLogo' : 'idnLatar');
        if (kembar) {
          kembar.classList.add('filled');
          kembar.innerHTML = `<img src="${esc(url)}" alt="">
            <div class="idn-over"><i class="fa-solid fa-camera"></i>Ganti</div>`;
        }
        toast('success', kategori === 'identitas_logo'
          ? 'Logo dayah diperbarui' : 'Foto latar diperbarui');
      }
      sync('done', 'Berkas tersimpan');
    } catch (e) {
      sync('warn', 'Gagal mengunggah');
      fireError(e);
    } finally {
      el.classList.remove('busy');
    }
  });
}

// =====================================================================
// HELPER: Generate Avatar Placeholder dengan Inisial + Warna Dinamis
// =====================================================================

/**
 * Generate placeholder avatar SVG dengan inisial nama + warna berdasarkan role.
 * @returns {string} Data URI SVG avatar
 */
function generateUserAvatarPlaceholder(namaUser, roleUser) {
  const words = (namaUser || 'User').trim().split(' ');
  const initials = words.map(w => w[0]).join('').toUpperCase().slice(0, 2);
  const bgColor = getRoleColor(roleUser);
  const svg = `
    <svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 200'>
      <defs><style>@font-face{font-family:'Arial';}</style></defs>
      <circle cx='100' cy='100' r='100' fill='${bgColor}'/>
      <text x='100' y='120' font-size='60' font-weight='bold' fill='white'
        text-anchor='middle' font-family='Arial, sans-serif'>${initials}</text>
    </svg>
  `;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/** Generate inisial dari nama (versi ringkas). */
function getInitialsFromName(nama) {
  const words = (nama || 'User').trim().split(' ');
  return words.map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

/** Warna aksen per peran — dipakai placeholder avatar & elemen visual lain. */
function getRoleColor(role) {
  const roleColors = {
    'Admin': '#4F46E5',           // Indigo
    'Pimpinan': '#7C3AED',        // Violet
    'Guru': '#0891B2',            // Cyan
    'Guru BK': '#06B6D4',         // Sky
    'Guru Piket': '#3B82F6',      // Blue
    'Walas': '#10B981',           // Emerald
    'Ustadz GEN-Z': '#F59E0B',    // Amber
    'Osis': '#EC4899',            // Pink
    'Klinik': '#8B5CF6',          // Purple
  };
  return roleColors[role] || '#6366F1';
}

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
  return filterBinaanUnit(data || [], 'kelas');
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
  terapkanKorps(korpsMusyrifPutra(profil));

  $('loginScreen').classList.add('hidden');
  $('appShell').classList.remove('hidden');

  // === GANTI BAGIAN LAMA INI ===
  // Hapus: profileName, profileRole, profileInitial
  // Gunakan ID yang ada di HTML sekarang
  terapkanIdentitasPengguna(
    profil.nama || 'User',
    profil.role + (profil.kelas_binaan?.length ? ' · ' + profil.kelas_binaan.join(', ') : '')
  );
  // Slot latar & logo hanya relevan bagi Admin; peran lain tetap bisa
  // mengganti foto profilnya lewat tombol yang sama.
  $('pbarBtnStudio')?.setAttribute('title',
    isAdmin() ? 'Ganti foto profil, foto latar, dan logo dayah' : 'Ganti foto profil');
  // ============================

  document.querySelectorAll('[data-view]').forEach(b => {
    b.classList.toggle('hidden', !(MENU_ROLE[b.dataset.view] || []).includes(profil.role));
  });
  rapikanGrupNav();

  if (['Pimpinan','Klinik'].includes(role())) {
    $('ctxBadge')?.classList.add('hidden');
  }

  pulihkanKonteks();
  pulihkanPeriode();
  aktifkanRealtime();
  refreshBadgePending();
  refreshBadgePesan();

  // Load foto profil (opsional, bisa dipanggil di sini atau di dashboard)
  setupProfilUserLogin().catch(e => console.warn('[profil]', e));
  // Sampul & logo bilah profil atas — dibaca sekali, dipakai seluruh sesi.
  muatDanTerapkanIdentitas();

  // Pintasan PWA (#prestasi, #tahfiz, …) langsung membuka halamannya.
  const awal = String(location.hash || '').replace('#', '').trim();
  navigateTo(awal && MENU_ROLE[awal] ? awal : rumah());
}

db.auth.onAuthStateChange((event) => {
  if (event === 'SIGNED_OUT' && APP.profil) location.reload();
});

// Visual login: latar foto & logo Dayah, diambil dari tabel foto_aset
// (kategori identitas_latar / identitas_logo — lihat modul FOTO PROFIL
// di atas, dan kartu "Identitas Dayah" di menu Master & Bidang tempat
// Admin mengunggahnya). Dibungkus try/catch: bila tabel belum bisa
// dibaca sebelum login (RLS), layar login tetap tampil normal tanpa foto.
(async function visualLogin() {
  await muatDanTerapkanIdentitas();
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

/**
 * Sembunyikan kelompok menu yang seluruh isinya tidak boleh diakses,
 * lalu buka kelompok yang memuat halaman aktif. Dipanggil setelah login
 * dan setiap kali berpindah halaman — inilah yang membuat bilah sisi
 * tetap ramping walau jumlah modul bertambah.
 */
function rapikanGrupNav(viewAktif) {
  document.querySelectorAll('#navMenu .nav-grup').forEach(g => {
    const isi = [...g.querySelectorAll('.nav-item[data-view]')];
    const tampak = isi.filter(b => !b.classList.contains('hidden'));
    g.classList.toggle('hidden', tampak.length === 0);
    if (viewAktif && tampak.some(b => b.dataset.view === viewAktif)) g.open = true;
  });
}

/** Bilah tab bawah (ponsel) — berbagi data-view dengan bilah sisi. */
$('tabBar')?.addEventListener('click', (e) => {
  const btn = e.target.closest('.tab');
  if (!btn) return;
  if (btn.id === 'tabMenu') {
    $('sidebar').classList.add('open');
    $('scrim').classList.remove('hidden');
    return;
  }
  if (btn.dataset.view) navigateTo(btn.dataset.view);
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
    view = rumah();
  }
  APP.view = view;
  APP.onKlik = null;
  // Dipakai CSS untuk cap air korps pada halaman kosong modul Pengasuhan.
  $('viewRoot').dataset.view = view;

  const j = JUDUL[view] || { lat:view, ar:'', teks:view };
  $('pageTitle').textContent = j.teks;
  $('pageEyebrow').querySelector('.ar').textContent = j.ar;
  $('pageEyebrow').querySelector('.lat').textContent = j.lat;

  document.querySelectorAll('[data-view]').forEach(b =>
    b.classList.toggle('active', b.dataset.view === view));
  rapikanGrupNav(view);

  Object.values(APP.charts).forEach(c => { try { c.destroy(); } catch(e){} });
  APP.charts = {};
  window.scrollTo({ top: 0, behavior: 'auto' });

  loading(true);
  try {
    if (view === 'dashboard')        await viewDashboard();
    else if (view === 'pimpinan')    await viewPimpinan();
    else if (view === 'bk')          await viewBk();
    else if (view === 'pesan')       await viewPesan();
    else if (view === 'siswa')       await viewSiswa();
    else if (view === 'pelanggaran') await viewPelanggaran();
    else if (view === 'prestasi')    await viewPrestasi();
    else if (view === 'tahfiz')      await viewTahfiz();
    else if (view === 'audit')       await viewAudit();
    else if (view === 'rekap')       await viewRekap();
    else if (view === 'bidang')      await viewEvaluasiBidang();
    else if (view === 'pengasuhan')  await viewPengasuhan();
    else if (view === 'madrasah')    await viewMadrasah();
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
    siapkanTabelKartu();
    document.querySelectorAll('.tbl').forEach(w => {
      const hint = w.parentElement?.querySelector('.scroll-hint');
      if (!hint) return;
      // Di mode kartu (ponsel) tidak ada yang perlu digeser lagi.
      const modeKartu = w.hasAttribute('data-kartu') && window.matchMedia('(max-width: 760px)').matches;
      hint.classList.toggle('on', !modeKartu && w.scrollWidth > w.clientWidth + 4);
    });
  });
}

/**
 * Menyalin judul kolom dari <thead> ke atribut data-l pada setiap sel.
 *
 * Dengan begitu CSS bisa mengubah tabel apa pun menjadi kartu berlabel
 * di ponsel (lihat blok "TABEL BERUBAH MENJADI KARTU" di index.html)
 * TANPA perlu menyentuh satu pun fungsi render — berlaku otomatis untuk
 * tabel santri, pelanggaran, rekap, perizinan, pembinaan, audit, dst.
 *
 * Kolom dipetakan memakai peta okupansi supaya rowspan & colspan
 * (yang dipakai tabel rekap) tetap mendapat label kolom yang benar.
 */
function siapkanTabelKartu(akar) {
  (akar || document).querySelectorAll('.tbl table').forEach(tabel => {
    // Tabel yang tbody-nya dirender ulang (filter, halaman berikut,
    // realtime) tetap memakai elemen <table> yang sama. Penanda siap
    // saja tidak cukup: baris baru belum berlabel sehingga di mode kartu
    // ponsel judul kolomnya hilang. Periksa sel yang belum berlabel.
    if (tabel.dataset.kartuSiap === '1'
        && !tabel.querySelector(':scope > tbody > tr > td:not([data-l]):not([data-penuh])')) return;

    const kepala = tabel.tHead && tabel.tHead.rows[tabel.tHead.rows.length - 1];
    if (!kepala) return;

    const judul = [];
    Array.from(kepala.cells).forEach(sel => {
      const teks = (sel.textContent || '').trim();
      for (let k = 0; k < (sel.colSpan || 1); k++) judul.push(teks);
    });
    if (judul.length < 3) return;   // tabel sempit: biarkan apa adanya

    Array.from(tabel.tBodies).forEach(tubuh => {
      const terisi = [];            // peta okupansi untuk rowspan/colspan
      Array.from(tubuh.rows).forEach((baris, r) => {
        terisi[r] = terisi[r] || [];
        let k = 0;
        Array.from(baris.cells).forEach(sel => {
          while (terisi[r][k]) k++;
          const lebar = sel.colSpan || 1, tinggi = sel.rowSpan || 1;
          if (lebar >= judul.length) sel.setAttribute('data-penuh', '');
          else if (!sel.hasAttribute('data-l')) sel.setAttribute('data-l', judul[k] || '');
          for (let dr = 0; dr < tinggi; dr++) {
            terisi[r + dr] = terisi[r + dr] || [];
            for (let dk = 0; dk < lebar; dk++) terisi[r + dr][k + dk] = 1;
          }
          k += lebar;
        });
      });
    });

    tabel.dataset.kartuSiap = '1';
    const bungkus = tabel.closest('.tbl');
    if (bungkus) bungkus.setAttribute('data-kartu', '');
  });
}

/* Jaring pengaman: tabel yang dirender di luar alur navigasi (mis. di
   dalam jendela SweetAlert) ikut diberi label. Pengamat ini hanya
   menjadwalkan satu pekerjaan saat peramban sedang senggang, jadi tidak
   menambah beban saat pengguna sedang berinteraksi. */
(function pantauTabelBaru() {
  if (typeof MutationObserver !== 'function') return;
  const santai = window.requestIdleCallback || ((f) => setTimeout(f, 120));
  let terjadwal = false;
  const jadwalkan = () => {
    if (terjadwal) return;
    terjadwal = true;
    santai(() => { terjadwal = false; try { siapkanTabelKartu(); } catch (e) {} });
  };
  new MutationObserver(jadwalkan)
    .observe(document.documentElement, { childList: true, subtree: true });
})();

/* Perangkat kelas bawah / mode hemat data: matikan efek hias yang mahal
   (kaca buram, paralaks, kilau) lewat kelas `hemat` di elemen <html>.
   Aturan CSS-nya sudah disiapkan di index.html. */
(function tandaiPerangkatHemat() {
  try {
    const n = navigator;
    const koneksi = n.connection || n.mozConnection || n.webkitConnection;
    const lambat = !!(koneksi && (koneksi.saveData ||
                    /(^|-)2g$/.test(String(koneksi.effectiveType || ''))));
    const kecil = (n.hardwareConcurrency && n.hardwareConcurrency <= 4) ||
                  (n.deviceMemory && n.deviceMemory <= 3);
    if (lambat || kecil) document.documentElement.classList.add('hemat');
  } catch (e) {}
})();

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
// ---------------------------------------------------------------------
// 11b. SAPAAN & AMANAH HARI INI
//
//      Halaman depan sebelumnya langsung membuka dengan pemilih unit —
//      sebuah pertanyaan ("Anda mau mengerjakan apa?") yang dilontarkan
//      kepada orang yang baru saja masuk. Panel ini mendahuluinya dengan
//      hal yang lebih manusiawi: menyapa dengan nama, menyebut hari, lalu
//      menunjukkan apa yang masih menunggu — bukan grafik, bukan angka
//      total, melainkan pekerjaan yang bisa langsung diselesaikan.
//
//      Dua keputusan yang membentuknya:
//
//      (1) Yang ditampilkan hanya yang MASIH TERTUNDA. Menampilkan "0 izin
//          menunggu" mengubah kabar baik menjadi baris tabel. Bila tidak
//          ada apa pun yang tertunda, seluruh deretan diganti satu kalimat
//          — dan justru kalimat itulah imbalan membuka aplikasi.
//      (2) Setiap butir bisa diklik langsung ke halamannya. Pengingat yang
//          tidak menyediakan jalan penyelesaiannya hanya menambah beban.
// ---------------------------------------------------------------------

/** Sapaan menurut jam setempat. */
function salamWaktu(jam) {
  if (jam < 4)  return 'Selamat malam';
  if (jam < 11) return 'Selamat pagi';
  if (jam < 15) return 'Selamat siang';
  if (jam < 18) return 'Selamat sore';
  return 'Selamat malam';
}

/** Tanggal hijriah; dikembalikan kosong bila peramban tidak menyediakannya. */
function tanggalHijriah(d = new Date()) {
  try {
    // Sebagian peramban sudah membubuhkan "H" sendiri, sebagian tidak —
    // dilepas dulu supaya tidak pernah tercetak "1448 H H".
    const teks = new Intl.DateTimeFormat('id-TN-u-ca-islamic-umalqura',
      { day:'numeric', month:'long', year:'numeric' }).format(d);
    return String(teks).replace(/\s*H\.?$/i, '').trim();
  } catch { return ''; }
}

function panelSapaan(amanah) {
  const kini  = new Date();
  // Gelar akademik dilepas dan nama dipotong tiga kata: sapaan yang
  // menyebut "Nyak Al Azwansyah, S.Sos." terdengar seperti surat tugas,
  // bukan seperti orang yang sedang disapa.
  const nama  = String(APP.profil?.nama || '').split(',')[0].trim();
  const depan = nama.split(/\s+/).slice(0, 3).join(' ') || 'Ustaz';
  const hari  = kini.toLocaleDateString('id-ID',
    { weekday:'long', day:'numeric', month:'long', year:'numeric' });
  const hijri = tanggalHijriah(kini);

  const butir = (amanah || []).filter(a => a.jumlah > 0);
  const isi = butir.length
    ? `<div class="sapa-amanah">${butir.map(a => `
        <button class="amanah" data-nav="${esc(a.view)}">
          <span class="ikon"><i class="fa-solid ${a.ikon}"></i></span>
          <span class="teks"><b>${angka(a.jumlah)}</b>${esc(a.label)}</span>
          <i class="fa-solid fa-arrow-right go"></i>
        </button>`).join('')}</div>`
    : `<p class="sapa-lega"><i class="fa-solid fa-circle-check"></i>
         Tidak ada yang tertunda hari ini. Semoga tetap begitu esok.</p>`;

  return `<div class="sapa">
    <div class="sapa-teks">
      <div class="eyebrow"><span class="ar">السلام عليكم</span><span class="rule"></span>
        <span class="lat">${esc(hari)}${hijri ? ' · ' + esc(hijri) + ' H' : ''}</span></div>
      <h2>${esc(salamWaktu(kini.getHours()))}, ${esc(depan)}.</h2>
      <p>${butir.length
        ? 'Berikut amanah yang masih menunggu penyelesaian Anda.'
        : 'Seluruh catatan sudah tertangani.'}</p>
    </div>
    ${isi}
  </div>`;
}

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

   const profilePromise = setupProfilUserLogin();
  const [siswaAll, detailAll, izinAll, pembinaanAll] = await Promise.all([
    amanKosong(muatSiswa, 'santri'),
    amanKosong(muatDetail, 'pelanggaran'),
    amanKosong(muatIzin, 'perizinan'),
    amanKosong(muatPembinaan, 'pembinaan')
  ]);

  const siswa   = filterBinaanUnit(siswaAll.filter(aktifSantri), 'kelas');
  const detail  = lingkupDetail(detailAll);          // ikut periode → untuk KPI
  const detailTr = lingkupDetail(detailAll, false);  // lintas periode → untuk grafik
  const nisnBoleh = new Set(siswa.map(s => String(s.nisn)));
  const izinSemua = perluFilterKelas() ? izinAll.filter(z => nisnBoleh.has(String(z.nisn))) : izinAll;
  const izin = saringPeriodeIzin(izinSemua);
  const pembinaan = filterBinaanUnit(
    saringPeriode(pembinaanAll.filter(aktifPembinaan), 'tanggal_pembinaan')
      .map(p => ({ ...p, kelas: p.siswa?.kelas || '' })), 'kelas');

  const izinPending = izin.filter(z => z.status_persetujuan === 'Pending').length;
  const izinSesuai  = izin.filter(z => z.status_persetujuan === 'Sesuai Waktu').length;
  const izinTelat   = izin.filter(z => z.status_persetujuan === 'Telat Balik').length;
  const binaProses  = pembinaan.filter(p => p.status_pembinaan !== 'Selesai').length;
   await profilePromise;

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

  detailTr.forEach(r => {
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
  izinSemua.forEach(z => { const k = kunciTgl(z.tanggal_mulai); if (petaIzinHari[k]) petaIzinHari[k].add(String(z.nisn)); });

  // Amanah yang belum selesai — sengaja TANPA penyaringan periode: tugas
  // yang belum dikerjakan tidak berhenti menjadi tugas pada tanggal 1.
  let perluWali = 0;
  if (bolehKabarWali()) {
    try {
      const { penuh } = await bahanBinaPenuh();
      perluWali = filterBinaanUnit(penuh, 'kelas')
        .filter(r => perluKabarWali(r) && String(r.status_pembinaan) !== 'Selesai').length;
    } catch (e) { console.warn('amanah wali tidak terbaca:', e.message); }
  }

  // v2.12 — laporan pembinaan: GEN-Z diingatkan yang belum dilaporkan,
  // guru diingatkan laporan yang menunggu pengesahannya.
  let binaBelumLapor = 0, binaMenungguSah = 0;
  if (bolehLaporBina() || bolehPembinaan()) {
    try {
      const lap = await petaLaporanBina();
      const terbuka = filterBinaanUnit(dedupBina(pembinaanAll.filter(aktifPembinaan)
        .map(p => ({ ...p, kelas: p.siswa?.kelas || '' }))), 'kelas')
        .filter(p => p.status_pembinaan !== 'Selesai');
      binaMenungguSah = bolehPembinaan()
        ? terbuka.filter(p => (lap.get(String(p.id_pembinaan))?.penerima_id || []).includes(idSaya())
                              || (isAdmin() && lap.has(String(p.id_pembinaan)))).length : 0;
      binaBelumLapor = bolehLaporBina() ? terbuka.filter(p => !lap.has(String(p.id_pembinaan))).length : 0;
    } catch (e) { console.warn('amanah laporan pembinaan tidak terbaca:', e.message); }
  }

  $('viewRoot').innerHTML = `
    ${panelSapaan([
      { jumlah: izinPending, label: 'izin menunggu keputusan', ikon: 'fa-clock', view: 'perizinan' },
      { jumlah: binaMenungguSah, label: 'laporan pembinaan menunggu pengesahan Anda', ikon: 'fa-file-signature', view: 'pesan' },
      bolehLaporBina()
        ? { jumlah: binaBelumLapor, label: 'pembinaan belum dilaporkan ke guru', ikon: 'fa-paper-plane', view: 'pembinaan' }
        : { jumlah: binaProses,  label: 'pembinaan belum diselesaikan', ikon: 'fa-hands-holding-child', view: 'pembinaan' },
      { jumlah: perluWali,   label: 'wali santri perlu dikabari', ikon: 'fa-comment-dots', view: 'pembinaan' }
    ])}
    ${kartuUnit()}

    <div class="stats">
      ${stat('Santri Aktif', angka(siswa.length), 'fa-solid fa-user-group',
        'background:#E7F1F7;color:var(--sea)', 'var(--sea)',
        perluFilterKelas() ? 'Kelas binaan Anda' : 'Seluruh dayah')}
      ${stat('Pelanggaran', angka(detail.length), 'fa-solid fa-scale-balanced',
        'background:var(--maroon-bg);color:var(--maroon)', 'var(--maroon)',
        `${labelKonteks()} · ${labelPeriode()}`)}
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
    </div>

    <div id="blokSebaran"></div>`;

  onKlik(async (e) => {
    const n = e.target.closest('[data-nav]');
    if (n) return navigateTo(n.dataset.nav);
    const dt = e.target.closest('[data-detail]');
    if (dt) return bukaDetailSantri(dt.dataset.detail);
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

  // ---- Peta perkembangan (modul 38) ----------------------------------
  // Digambar setelah grafik utama supaya halaman sudah terasa hidup
  // sebelum agregasi tambahan selesai; kegagalannya tidak boleh
  // menjatuhkan dashboard yang sudah tampil.
  try {
    const sebaran = await blokSebaran({
      siswa, detail: detailTr, izin: izinSemua, pembinaan, ipp: true, batasIpp: 6 });
    const kotak = $('blokSebaran');
    if (kotak) { kotak.innerHTML = sebaran.html; sebaran.gambar(); }
  } catch (e) {
    console.warn('Peta perkembangan tidak dapat ditampilkan:', e.message);
    const kotak = $('blokSebaran');
    if (kotak) kotak.innerHTML = kosong('Peta perkembangan belum dapat dimuat.',
      'Data pendukungnya sedang tidak terbaca. Muat ulang halaman untuk mencoba lagi.',
      'fa-triangle-exclamation');
  }
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

/* Data ringkasan Dashboard Pimpinan — diisi viewPimpinan(), dibaca oleh
   jendela daftar yang dibuka dari kartu ringkas. */
const PIM = { prio: [], jenis: [], kritis: 0, perhatian: 0, monitor: 0, rentang: '' };
const stPrio = { cari: '', tier: 'Semua' };

/**
 * Dipakai dua peran dengan isi yang sama persis:
 *   - Pimpinan  : lengkap, ditutup panel Aktivitas & Kinerja Guru.
 *   - Guru BK   : sama, TANPA panel kinerja guru, ditutup panel
 *                 "Pesan Tindak Lanjut" (10 santri prioritas -> guru).
 * Semua kartu, grafik, dan jendela onclick-nya identik.
 */
async function viewPimpinan(opsi = {}) {
  const modeBk = opsi.bk === true;
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
  const semuaJenis = Object.entries(jenis).sort((a,b) => b[1]-a[1]);
  const topJenis = semuaJenis.slice(0, 8);

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
  const monitor = daftarPrio.filter(x => x.tier === 'Monitor').length;

  // Disimpan agar jendela daftar (dibuka dari kartu ringkas) tetap punya
  // datanya tanpa perlu menghitung ulang seluruh agregasi.
  PIM.prio = daftarPrio;
  PIM.jenis = semuaJenis;
  PIM.kritis = kritis; PIM.perhatian = perhatian; PIM.monitor = monitor;
  PIM.rentang = `${tgl(kunciTgl(mulai90))} – ${tgl(kunciTgl(akhir))}`;

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

  const heroBk = {
    ar1:'لوحة الإرشاد', lat:'Bimbingan & Konseling',
    ar2:'حال الطلاب المحتاجين للرعاية',
    judul:'Peta santri yang<br>membutuhkan pendampingan.',
    teks:`Isi dan seluruh jendela rinciannya sama dengan dashboard pimpinan —
          kedisiplinan, pola pelanggaran, perizinan, pembinaan, dan santri prioritas —
          diarahkan untuk kerja bimbingan, bukan untuk menilai kinerja guru.`
  };
  const heroPim = {
    ar1:'لوحة القيادة', lat:'Executive · Read Only',
    ar2:'تقرير حال الدايه',
    judul:'Analisis kondisi dayah<br>berbasis data.',
    teks:`Ringkasan untuk membantu pimpinan melihat kedisiplinan, pola pelanggaran,
          perizinan, pembinaan, dan santri yang membutuhkan perhatian — tanpa masuk
          ke aktivitas input operasional.`
  };
  const H = modeBk ? heroBk : heroPim;

  $('viewRoot').innerHTML = `
    <section class="hero">
      <div class="eyebrow"><span class="ar">${H.ar1}</span><span class="rule"></span>
        <span class="lat">${H.lat}</span></div>
      <span class="ar" style="font-size:19px;color:#F2E5B8">${H.ar2}</span>
      <h2>${H.judul}</h2>
      <p>${H.teks}</p>
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
        <div class="ai-actions">
          <button class="btn btn-ghost btn-sm" data-ai="payload-pimpinan">
            <i class="fa-solid fa-file-code"></i>Salin ringkasan untuk analisis</button>
          <button class="btn btn-ghost btn-sm" data-ai="prompt-pimpinan">
            <i class="fa-solid fa-wand-magic-sparkles"></i>Salin instruksi AI</button>
        </div>
      </div>
    </section>

    <div id="konsultanBox"></div>

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

    <div id="blokSebaran"></div>

    <div class="brankas-grid">
      <div id="brkPrio">${kartuBrankasPrioritas()}</div>
      <div id="brkJenis">${kartuBrankasJenis()}</div>
    </div>`;

  onKlik((e) => {
    const nav = e.target.closest('[data-nav]');
    if (nav) return navigateTo(nav.dataset.nav);
    if (e.target.closest('#konsultanBox .brankas')) return bukaKesimpulanKonsultan();
    if (e.target.closest('#brkPrio .brankas'))      return bukaSantriPrioritas();
    if (e.target.closest('#brkJenis .brankas'))     return bukaJenisTerbanyak();
    const d = e.target.closest('[data-detail]');
    if (d) return bukaDetailSantri(d.dataset.detail);
  });

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

  try {
    const sebaran = await blokSebaran({
      siswa, detail: detailAktif, izin: izinAll, pembinaan: pbnAktif,
      ipp: true, batasIpp: modeBk ? 15 : 10 });
    const kotak = $('blokSebaran');
    if (kotak) { kotak.innerHTML = sebaran.html; sebaran.gambar(); }
  } catch (e) {
    console.warn('Peta perkembangan tidak dapat ditampilkan:', e.message);
    const kotak = $('blokSebaran');
    if (kotak) kotak.innerHTML = kosong('Peta perkembangan belum dapat dimuat.',
      'Data pendukungnya sedang tidak terbaca. Muat ulang halaman untuk mencoba lagi.',
      'fa-triangle-exclamation');
  }

  await gambarKonsultan();

  // Pembeda satu-satunya antara kedua peran:
  //   Pimpinan -> ringkasan aktivitas & kinerja guru
  //   Guru BK  -> panel pesan tindak lanjut ke guru (tanpa kinerja guru)
  if (modeBk) await panelPesanBk();
  else        await panelKinerjaGuru();
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
  let rows = filterBinaanUnit(all.filter(aktifSantri), 'kelas');
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

    // Data modul baru (prestasi, tahfiz, target) — tidak menggagalkan
    // tampilan bila tabelnya belum dipasang di database.
    const [prestasi, tahfiz, goals] = await Promise.all([
      muatPrestasi().then(r => r.filter(aktifPrestasi).filter(x => String(x.nisn) === String(nisn))).catch(() => []),
      muatTahfiz().then(r => r.filter(aktifTahfiz).filter(x => String(x.nisn) === String(nisn))).catch(() => []),
      muatGoalSantri(nisn)
    ]);
    const poinPrestasi = prestasi.reduce((a, r) => a + (Number(r.poin) || 0), 0);
    const poinPlg = Number(s.total_poin_pelanggaran) || 0;
    const skorNet = Math.max(0, poinPlg - poinPrestasi);
    const halTahfiz = tahfiz.reduce((a, r) => a + (Number(r.capaian_halaman) || 0), 0);

    // Timeline gabungan, urut dari yang terbaru
    const timeline = [
      ...riwayat.map(r => ({ tipe:'plg', kunci: kunciTgl(r.tanggal), r })),
      ...izin.map(z => ({ tipe:'izin', kunci: kunciTgl(z.tanggal_mulai), r:z })),
      ...bina.map(b => ({ tipe:'bina', kunci: kunciTgl(b.tanggal_pembinaan), r:b })),
      ...prestasi.map(p => ({ tipe:'prestasi', kunci: kunciTgl(p.tanggal), r:p })),
      ...tahfiz.map(t => ({ tipe:'tahfiz', kunci: kunciTgl(t.tanggal), r:t }))
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
      if (t.tipe === 'prestasi') { const p = t.r; return `
        <div class="tl-item">
          <div class="mark" style="background:#f5eed8;color:#8A6D0B">
            <i class="fa-solid fa-award"></i></div>
          <div class="body">
            <div class="row1"><p class="ttl" style="margin:0">${esc(p.judul)}</p>
              <span class="tag ${tagPrestasi(p.kategori)}">${esc(p.kategori)} · +${p.poin}</span></div>
            <div class="when">${tgl(p.tanggal)} · ${esc(p.bidang||'-')} · ${esc(p.pencatat||'-')}</div>
            ${p.catatan ? `<div class="note">${esc(p.catatan)}</div>` : ''}
          </div></div>`; }
      if (t.tipe === 'tahfiz') { const h = t.r; return `
        <div class="tl-item">
          <div class="mark" style="background:var(--teal-bg);color:var(--teal)">
            <i class="fa-solid fa-book-quran"></i></div>
          <div class="body">
            <div class="row1"><p class="ttl" style="margin:0">${esc(h.jenis || 'Setoran')} —
                ${esc(h.surah || '-')}${h.ayat_dari ? ` : ${h.ayat_dari}${h.ayat_ke ? '–' + h.ayat_ke : ''}` : ''}</p>
              <span class="${kelasLancar(h.kelancaran)}">${esc(h.kelancaran || '-')}</span></div>
            <div class="when">${tgl(h.tanggal)} · ${Number(h.capaian_halaman)||0} halaman · ${esc(h.musyrif||'-')}</div>
            ${h.catatan ? `<div class="note">${esc(h.catatan)}</div>` : ''}
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

    const bolehLaporan = bolehCetak() || bolehPdf();

    await Swal.fire({
      width: 800, showConfirmButton:false, showCloseButton:true,
      html: `<div style="text-align:left">
        <div class="santri-head">
          <div>
            <p class="nm">${esc(s.nama_siswa)}</p>
            <p class="id">NISN ${esc(s.nisn)} · Kelas ${esc(s.kelas||'-')}${s.jenjang?' · '+esc(s.jenjang):''}${s.asrama?' · Asrama '+esc(s.asrama):''}</p>
          </div>
          <div style="display:flex;gap:9px;flex-wrap:wrap">
            <div class="poin-badge">
              <p class="v" style="color:${poinPlg>=50?'var(--maroon)':'var(--text)'}">${poinPlg}</p>
              <p class="k">Pelanggaran</p>
            </div>
            <div class="poin-badge" style="background:#faf6eb;
                 border-color:#eee3be">
              <p class="v" style="color:#8A6D0B">+${poinPrestasi}</p>
              <p class="k">Apresiasi</p>
            </div>
            <div class="poin-badge" style="background:var(--paper)">
              <p class="v" style="color:${skorNet>=50?'var(--maroon)':skorNet>0?'var(--amber)':'var(--teal)'}">${skorNet}</p>
              <p class="k">Skor Net</p>
            </div>
            <div class="poin-badge" style="background:var(--teal-bg);border-color:#c5dedc">
              <p class="v" style="color:var(--teal)">${juzDari(halTahfiz)}</p>
              <p class="k">Juz Hafal</p>
            </div>
          </div>
        </div>

        ${bolehLaporan ? `<div class="detail-periode${APP.periode.aktif ? ' on' : ''}">
          <i class="fa-regular fa-calendar-days"></i>
          <span>Cetak &amp; PDF mengikuti periode aktif:
            <b>${esc(labelPeriode())}</b>${APP.periode.aktif
              ? ` — pelanggaran, pembinaan, dan perizinan disaring ke bulan ini
                  (presensi tetap ditampilkan seluruhnya).`
              : ` — seluruh riwayat santri akan tercetak.`}</span>
        </div>` : ''}

        <div class="detail-acts">
          ${bolehCetak() ? `<button class="btn btn-primary btn-sm" id="dCetak"><i class="fa-solid fa-print"></i>Cetak Laporan</button>` : ''}
          ${bolehPdf() ? `<button class="btn btn-ghost btn-sm" id="dPdf"><i class="fa-solid fa-file-pdf"></i>Unduh PDF</button>` : ''}
          ${bolehTulis() ? `<button class="btn btn-ghost btn-sm" id="dReset"><i class="fa-solid fa-rotate-left"></i>Reset ke Hadir</button>` : ''}
        </div>

        ${trenPanelHTML()}

        <div id="dGoalBox">${goalPanelHTML(goals, nisn)}</div>

        <p class="label" style="margin:18px 0 8px">Linimasa Lengkap</p>
        <div class="tl">
          ${timeline.map(item).join('') ||
            '<p style="text-align:center;color:var(--text-3);padding:28px 0">Belum ada riwayat.</p>'}
        </div></div>`,
      didOpen: () => {
        $('dCetak')?.addEventListener('click', () => cetakLaporan(nisn));
        $('dPdf')?.addEventListener('click', () => unduhLaporanPdf(nisn));
        $('dReset')?.addEventListener('click', () => resetStatus(nisn));

        // Grafik tren — hanya di layar, tidak ikut tercetak.
        gambarTrenSantri(nisn).catch(e => console.warn('[tren]', e.message));

        // Target pembinaan: SweetAlert tidak bisa bertumpuk, jadi jendela
        // detail ditutup dulu, lalu dibuka kembali setelah selesai.
        Swal.getHtmlContainer()?.addEventListener('click', (ev) => {
          const baru = ev.target.closest('[data-goal-baru]');
          const eval2 = ev.target.closest('[data-goal-eval]');
          if (!baru && !eval2) return;
          ev.preventDefault();
          const kerja = baru ? () => modalGoalBaru(nisn) : () => modalGoalEvaluasi(eval2.dataset.goalEval);
          Swal.close();
          setTimeout(async () => { await kerja(); bukaDetailSantri(nisn); }, 220);
        });
      },
      willClose: () => { try { APP.charts.trenSantri?.destroy(); } catch (e) {} }
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
// 13. CATATAN PELANGGARAN — halaman administrasi (khusus Admin)
//     Tata letak eksekutif: kepala halaman berwibawa, papan indikator,
//     panel penyaring ringkas, dan tabel arsip bergaya premium.
// ---------------------------------------------------------------------
const stPlg = { page:1, size:30, cari:'', kategori:'', bidang:'', kelas:'', dari:'', sampai:'' };

async function viewPelanggaran() {
  $('viewRoot').innerHTML = `
  <div class="adm">
    <section class="adm-head">
      <div class="adm-head-main">
        <div class="eyebrow"><span class="ar">المخالفات</span><span class="rule"></span>
          <span class="lat">Administrasi · Khusus Admin</span></div>
        <h2>Catatan Pelanggaran Santri</h2>
        <p>Arsip resmi seluruh catatan kedisiplinan. Setiap baris terhubung langsung
           dengan poin santri, instruksi pembinaan, dan laporan perkembangan.</p>
        <div class="adm-meta">
          <span><i class="fa-solid fa-layer-group"></i>${esc(labelKonteks())}</span>
          <span><i class="fa-regular fa-calendar-days"></i>${esc(labelPeriode())}</span>
          <span id="admCount"><i class="fa-solid fa-database"></i>Memuat data…</span>
        </div>
      </div>
      <div class="adm-actions">
        ${bolehCetak() ? `<button class="btn btn-onnavy btn-sm" id="plgCsv">
          <i class="fa-solid fa-file-csv"></i>Ekspor CSV</button>` : ''}
        ${bolehTulis() ? `<button class="btn btn-onnavy btn-sm" data-ai="massal">
          <i class="fa-solid fa-users-rectangle"></i>Input Massal</button>` : ''}
        ${bolehTulis() ? `<button class="btn btn-brass btn-sm" id="btnAddPlg">
          <i class="fa-solid fa-plus"></i>Catat Pelanggaran</button>` : ''}
      </div>
    </section>

    <div class="stats adm-stats" id="plgStats"></div>

    ${kartu('Arsip Catatan Pelanggaran', `
      <div class="filters adm-filters">
        <input id="plgCari" class="input grow" placeholder="Cari santri, NISN, atau jenis pelanggaran…" value="${esc(stPlg.cari)}">
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
      <div class="tbl"><table class="adm-tbl">
        <thead><tr><th>Tanggal</th><th>Santri</th><th>Pelanggaran</th><th>Kategori</th>
          <th class="center">Poin</th><th>Bidang</th><th>Penindak</th><th class="right">Aksi</th></tr></thead>
        <tbody id="tbPlg"><tr><td colspan="8" style="padding:26px;text-align:center;color:var(--text-3)">Memuat…</td></tr></tbody>
      </table></div>
      <div class="scroll-hint"><i class="fa-solid fa-arrows-left-right"></i>Geser ke samping untuk kolom lainnya.</div>
      <div id="pgPlg"></div>`,
      `<span class="tag tag-sea">${esc(labelKonteks())}</span>`,
      'Pencarian, penyaringan, dan pengarsipan catatan kedisiplinan santri.')}
  </div>`;

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
    unduhCsv(`pelanggaran-${berkasPeriode()}.csv`, [
      ['Tanggal','NISN','Nama','Kelas','Jenjang','Kode','Pelanggaran','Kategori','Poin','Sumber','Bidang','Penindak','Catatan'],
      ...rows.map(r => [kunciTgl(r.tanggal), r.nisn, r.nama_siswa, r.kelas, r.jenjang, r.kode_pelanggaran,
        r.nama_pelanggaran, r.kategori, r.bobot_pelanggaran, r.sumber, r.bidang, r.penindak, r.catatan])
    ]);
  });

  onKlik(async (e) => {
    const a = e.target.closest('[data-arsip]');
    if (a) return arsipkanPelanggaran(a.dataset.arsip);
    const d = e.target.closest('[data-detail]');
    if (d) return bukaDetailSantri(d.dataset.detail);
    const p = e.target.closest('[data-pg]');
    if (p && p.dataset.pg.startsWith('plg:')) {
      stPlg.page = Number(p.dataset.pg.split(':')[1]);
      muatTabelPlg();
      $('viewRoot').scrollIntoView({ block:'start', behavior:'smooth' });
    }
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

/** Papan indikator kecil di atas tabel arsip. */
function gambarStatPlg(rows) {
  const box = $('plgStats'); if (!box) return;
  const poin  = rows.reduce((a,r) => a + (Number(r.bobot_pelanggaran) || 0), 0);
  const unik  = new Set(rows.map(r => String(r.nisn || ''))).size;
  const berat = rows.filter(r => r.kategori === 'Berat').length;
  const sedang = rows.filter(r => r.kategori === 'Sedang').length;

  box.innerHTML =
    stat('Catatan Tersaring', angka(rows.length), 'fa-solid fa-scale-balanced',
      'background:#E7F1F7;color:var(--sea)', 'var(--sea)', labelPeriode()) +
    stat('Santri Terlibat', angka(unik), 'fa-solid fa-user-group',
      'background:var(--violet-bg);color:var(--violet)', 'var(--violet)', 'NISN unik pada hasil filter') +
    stat('Akumulasi Poin', angka(poin), 'fa-solid fa-coins',
      'background:var(--amber-bg);color:var(--amber)', 'var(--amber)', `${angka(sedang)} kategori sedang`) +
    stat('Kategori Berat', angka(berat), 'fa-solid fa-circle-exclamation',
      'background:var(--maroon-bg);color:var(--maroon)', 'var(--maroon)', 'Perlu tindak lanjut pimpinan');

  const c = $('admCount');
  if (c) c.innerHTML = `<i class="fa-solid fa-database"></i>${angka(rows.length)} catatan aktif`;
}

async function muatTabelPlg() {
  const rows = saringPlg(await muatDetail());
  const pages = Math.max(1, Math.ceil(rows.length / stPlg.size));
  if (stPlg.page > pages) stPlg.page = pages;
  const from = (stPlg.page - 1) * stPlg.size;
  const hal = rows.slice(from, from + stPlg.size);
  $('queryTime').textContent = `pelanggaran · ${angka(rows.length)} baris`;

  gambarStatPlg(rows);

  const poinKelas = (n) => Number(n) >= 25 ? 'poin-pill tinggi' : Number(n) >= 10 ? 'poin-pill sedang' : 'poin-pill';

  $('tbPlg').innerHTML = hal.map(r => `<tr>
    <td class="nowrap"><div class="adm-date">${tgl(r.tanggal)}</div>
      <div class="secondary">${esc(kunciTgl(r.tanggal))}</div></td>
    <td><button class="adm-santri" data-detail="${esc(r.nisn)}" title="Lihat riwayat santri">
        <span class="av">${esc(String(r.nama_siswa||'?').charAt(0).toUpperCase())}</span>
        <span class="who"><span class="nm">${esc(r.nama_siswa)}</span>
          <span class="secondary">${esc(r.nisn)} · ${esc(r.kelas||'-')}</span></span>
      </button></td>
    <td><div class="primary">${esc(r.nama_pelanggaran)}</div>
        <div class="secondary">${esc(r.kode_pelanggaran)}</div>
        ${r.catatan ? `<div class="adm-note">${esc(r.catatan)}</div>` : ''}</td>
    <td><span class="tag ${tagKategori(r.kategori)}">${esc(r.kategori)}</span></td>
    <td class="center"><span class="${poinKelas(r.bobot_pelanggaran)}">${r.bobot_pelanggaran ?? 0}</span></td>
    <td><span class="tag tag-sea">${esc(r.bidang||'-')}</span>
        <div class="secondary">${esc(r.sumber||'-')}</div></td>
    <td style="font-size:12.5px;color:var(--text-2)">${esc(r.penindak||'-')}</td>
    <td class="right">${bolehTulis()
      ? `<button class="btn btn-danger btn-sm" data-arsip="${esc(r.id_log)}">
          <i class="fa-solid fa-box-archive"></i>Arsip</button>` : '<span class="tag tag-off">Hanya baca</span>'}</td>
  </tr>`).join('') || barisKosong(8, 'Tidak ada catatan pada filter ini.', 'Coba ubah unit, periode, rentang tanggal, atau kata kunci.');

  $('pgPlg').innerHTML = pager('plg', stPlg.page, rows.length, stPlg.size);
  tandaiTabelBisaGeser();
}

// ---------------------------------------------------------------------
// 13b. PENJAGA CATATAN GANDA
//
//      Pada data yang ada sekarang terdapat 35 pasang pelanggaran dengan
//      santri, kode, dan tanggal yang persis sama pada 32 santri berbeda —
//      pola input ganda, bukan dua kejadian terpisah. Setiap pasang itu
//      menaikkan nomor tahap satu langkah lebih cepat, dan tahap adalah
//      dasar seluruh instrumen pembinaan sampai ke surat peringatan.
//
//      Yang dipasang di sini SENGAJA bukan penolakan, melainkan satu
//      pertanyaan. Dua kejadian pada hari yang sama memang mungkin, dan
//      musyrif di lapangan yang tahu — bukan aplikasi.
//
//      BATASNYA JUJUR: pemeriksaan ini berjalan di browser, di atas cache
//      `detail_data` yang sudah dimuat. Bila dua musyrif mencatat hal yang
//      sama dari dua perangkat dalam hitungan detik, keduanya tetap lolos.
//      Pengaman yang benar-benar rapat menuntut unique index di database —
//      perubahan skema yang sengaja tidak diambil.
// ---------------------------------------------------------------------

/** Catatan aktif dengan santri + kode + tanggal yang sama, bila ada. */
async function cariDuplikatPelanggaran(nisn, kode, tanggal) {
  const rows = await amanKosong(muatDetail, 'pelanggaran');
  const kTgl = kunciTgl(tanggal);
  if (!kTgl) return null;
  return (rows || []).find(r =>
    aktifDetail(r) &&
    String(r.nisn || '').trim() === String(nisn).trim() &&
    String(r.kode_pelanggaran || '').trim() === String(kode).trim() &&
    kunciTgl(r.tanggal) === kTgl) || null;
}

/** true bila musyrif memilih tetap mencatat. */
async function konfirmasiDuplikatPelanggaran(dup, labelKode) {
  const konf = await Swal.fire({
    icon: 'warning',
    title: 'Sudah tercatat hari ini',
    html: `<div style="text-align:left;font-size:13.5px">
      <p style="margin:0 0 8px">Pelanggaran
        <b>${esc(labelKode || dup.nama_pelanggaran || '-')}</b>
        untuk santri ini sudah tercatat pada tanggal yang sama
        (${esc(tgl(dup.tanggal))}${dup.penindak ? ' · oleh ' + esc(dup.penindak) : ''}).</p>
      <p style="margin:0;color:var(--text-3);font-size:12.5px">
        Satu catatan tambahan menaikkan nomor tahap pembinaan santri ini
        satu langkah. Lanjutkan hanya bila ini memang kejadian kedua.</p>
    </div>`,
    showCancelButton: true,
    confirmButtonText: 'Tetap catat — kejadian terpisah',
    cancelButtonText: 'Batalkan',
    confirmButtonColor: '#9F1239'
  });
  return konf.isConfirmed;
}

/**
 * Penyaring untuk input massal. Bertanya SEKALI untuk seluruh angkatan
 * catatan, bukan sekali per santri — empat puluh dialog berturut-turut
 * hanya melatih orang menekan "lanjut" tanpa membaca.
 * Mengembalikan daftar panggilan yang jadi dijalankan.
 */
async function saringDuplikatMassal(panggilan) {
  const rows = await amanKosong(muatDetail, 'pelanggaran');
  const kunci = new Set((rows || []).filter(aktifDetail).map(r =>
    `${String(r.nisn || '').trim()}|${String(r.kode_pelanggaran || '').trim()}|${kunciTgl(r.tanggal)}`));

  const duplikat = [], bersih = [];
  (panggilan || []).forEach(p => {
    const k = `${String(p.params?.p_nisn || '').trim()}|`
            + `${String(p.params?.p_kode || '').trim()}|${kunciTgl(p.params?.p_tanggal)}`;
    (kunci.has(k) ? duplikat : bersih).push(p);
  });
  if (!duplikat.length) return panggilan;

  const konf = await Swal.fire({
    icon: 'warning', width: 620,
    title: `${duplikat.length} santri sudah tercatat hari ini`,
    html: `<div style="text-align:left;font-size:13px">
      <p>Pelanggaran yang sama pada tanggal yang sama sudah tersimpan untuk:</p>
      <ul style="max-height:170px;overflow:auto;margin:6px 0 0 16px">${duplikat
        .map(x => `<li>${esc(x.nama_siswa || x.params?.p_nisn)}${x.kelas ? ' (' + esc(x.kelas) + ')' : ''}</li>`)
        .join('')}</ul>
      <p style="margin:10px 0 0;color:#64748b;font-size:12.5px">
        Melewati yang duplikat menjaga nomor tahap pembinaan tetap benar.
        ${bersih.length} santri lainnya tetap dicatat.</p></div>`,
    showCancelButton: true,
    confirmButtonText: `Lewati yang duplikat (${bersih.length} dicatat)`,
    cancelButtonText: 'Catat semuanya',
    confirmButtonColor: '#0F766E',
    cancelButtonColor: '#9F1239'
  });
  return konf.isConfirmed ? bersih : panggilan;
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

      // `p.force` menandai penimpaan IZIN, bukan penimpaan duplikat —
      // dua urusan berbeda, jadi bendera duplikat berdiri sendiri.
      if (!p.dupOk) {
        const dup = await cariDuplikatPelanggaran(nisn, kode, payload.p_tanggal);
        if (dup && !(await konfirmasiDuplikatPelanggaran(dup, fKode.value))) {
          Swal.showValidationMessage('Dibatalkan — catatan hari ini sudah ada.');
          return false;
        }
      }

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
        tanggal: payload.p_tanggal, catatan: payload.p_catatan,
        force: true, dupOk: true   // duplikat sudah ditanyakan pada percobaan pertama
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
// 14. REKAP PELANGGARAN
//
//     Dua aturan khusus modul ini:
//     1. TIDAK PERNAH menyaring unit. Pendidik melihat akumulasi seluruh
//        bidang — Pengasuhan dan Madrasah digabung — karena santrinya sama.
//        Karena itu modul ini memakai lingkupRekap(), bukan lingkupDetail().
//     2. TIDAK ADA konversi berjenjang. 5x Ringan tetap 5x Ringan, bukan
//        1x Sedang. Yang dihitung adalah akumulasi per KODE pelanggaran
//        yang identik, ditambah total catatan per santri.
//
//     kaskadeKonversi() (bagian 5) tidak lagi dipanggil dari sini.
// ---------------------------------------------------------------------
const stRekap = { kategori:'Semua', kelas:'', cari:'', page:1, size:30 };

/**
 * Lingkup baris rekap: status aktif + periode + kelas binaan.
 * Sengaja TANPA penyaringan unit/jenjang, berbeda dari lingkupDetail().
 */
function lingkupRekap(rows, pakaiPeriode = true) {
  let out = (rows || []).filter(aktifDetail);
  if (pakaiPeriode) out = saringPeriode(out, 'tanggal');
  return filterBinaanUnit(out, 'kelas');
}

/**
 * Akumulasi per santri berdasarkan kode pelanggaran yang identik.
 * Setiap entri daftar: { kode, kategori, deskripsi, jumlah, poin, sumber }.
 * Baris tanpa kode dikelompokkan memakai nama pelanggarannya.
 */
function rekapUnikPerSantri(rows) {
  const peta = new Map();
  (rows || []).forEach(r => {
    const nisn = String(r.nisn || '').trim(); if (!nisn) return;
    if (!peta.has(nisn)) peta.set(nisn, {
      nisn, nama: r.nama_siswa || '', kelas: r.kelas || '-', perKode: new Map()
    });
    const e = peta.get(nisn);
    const kode = String(r.kode_pelanggaran || '').trim();
    const nama = String(r.nama_pelanggaran || '').trim();
    const kunci = kode || kunciTeks(nama);           // kunci pengelompokan
    if (!kunci) return;
    if (!e.perKode.has(kunci)) e.perKode.set(kunci, {
      kode: kode || '-', kategori: r.kategori || '-',
      deskripsi: nama || kode, jumlah: 0, poin: 0,
      sumber: String(r.sumber || '-').trim() || '-'
    });
    const it = e.perKode.get(kunci);
    it.jumlah++;
    it.poin += Number(r.bobot_pelanggaran) || 0;
  });

  const out = [];
  peta.forEach(e => {
    const daftar = [...e.perKode.values()].sort((a, b) =>
      (URUT_KAT[a.kategori] ?? 99) - (URUT_KAT[b.kategori] ?? 99) ||
      b.jumlah - a.jumlah ||
      a.deskripsi.localeCompare(b.deskripsi, 'id'));
    if (!daftar.length) return;
    out.push({
      nisn: e.nisn, nama: e.nama, kelas: e.kelas, daftar,
      total: daftar.reduce((a, d) => a + d.jumlah, 0),
      poin:  daftar.reduce((a, d) => a + d.poin, 0),
      jenis: daftar.length
    });
  });
  return out.sort((a, b) => b.total - a.total || b.poin - a.poin);
}

async function viewRekap() {
  const kelasList = await muatDaftarKelas();

  $('viewRoot').innerHTML = `
    <div class="stats" id="rkKpi"></div>
    ${kartu('Rekap Pelanggaran per Santri', `
    <div class="card-note"><i class="fa-solid fa-circle-info"></i>
      Menampilkan <b>akumulasi seluruh unit</b> — Pengasuhan dan Madrasah digabung,
      tidak mengikuti unit yang sedang aktif. Perhitungan bersifat apa adanya:
      pelanggaran dengan <b>kode yang sama</b> dijumlahkan, tanpa konversi
      antar kategori.</div>
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
      ${bolehCetak() ? `<button class="btn btn-primary btn-sm" id="rkCetak">
        <i class="fa-solid fa-print"></i>Cetak Bulanan</button>` : ''}
    </div>
    <div id="rkHasil"><div style="padding:26px;text-align:center;color:var(--text-3)">Memuat…</div></div>
    <div id="pgRk"></div>`,
    `<span class="tag tag-sea">Semua Unit</span>
     <span class="tag tag-off">${esc(labelPeriode())}</span>`)}`;

  $('rkCari').addEventListener('input', debounce(e => {
    stRekap.cari = e.target.value.trim(); stRekap.page = 1; gambarRekap(); }, 250));
  $('rkKategori').addEventListener('change', e => { stRekap.kategori = e.target.value; stRekap.page = 1; gambarRekap(); });
  $('rkKelas').addEventListener('change', e => { stRekap.kelas = e.target.value; stRekap.page = 1; gambarRekap(); });
  $('rkCsv').addEventListener('click', async () => {
    const rows = await hitungRekap();
    if (!rows.length) return toast('error', 'Belum ada data untuk diekspor.');
    const baris = [['NISN','Nama','Kelas','Kode','Pelanggaran','Kategori','Sumber','Jumlah','Poin','Total Santri']];
    rows.forEach(s => s.daftar.forEach(d =>
      baris.push([s.nisn, s.nama, s.kelas, d.kode, d.deskripsi, d.kategori,
                  d.sumber, d.jumlah, d.poin, s.total])));
    unduhCsv(`rekap-pelanggaran-${berkasPeriode()}.csv`, baris);
  });
  $('rkCetak')?.addEventListener('click', async () =>
    cetakRekapBulanan(await hitungRekap(), 'Semua Unit'));

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
  const rows = rekapUnikPerSantri(lingkupRekap(await muatDetail()));
  const k = stRekap.cari.toLowerCase();
  return rows
    .filter(s => !stRekap.kelas || s.kelas === stRekap.kelas)
    .filter(s => !k || String(s.nama).toLowerCase().includes(k) ||
                       String(s.nisn).toLowerCase().includes(k))
    .map(s => {
      // Filter kategori hanya memangkas daftar; total santri tetap utuh.
      const daftar = s.daftar.filter(d => stRekap.kategori === 'Semua' || d.kategori === stRekap.kategori);
      return daftar.length ? { ...s, daftar,
        tampil: daftar.reduce((a, d) => a + d.jumlah, 0) } : null;
    })
    .filter(Boolean);
}

async function gambarRekap() {
  const rows = await hitungRekap();
  const pages = Math.max(1, Math.ceil(rows.length / stRekap.size));
  if (stRekap.page > pages) stRekap.page = pages;
  const from = (stRekap.page - 1) * stRekap.size;
  const hal = rows.slice(from, from + stRekap.size);

  const totCatatan = rows.reduce((a, s) => a + (s.tampil ?? s.total), 0);
  const totPoin = rows.reduce((a, s) => a + s.poin, 0);
  const totJenis = rows.reduce((a, s) => a + s.daftar.length, 0);

  $('rkKpi').innerHTML =
    stat('Santri Tercatat', angka(rows.length), 'fa-solid fa-user-group',
      'background:#E7F1F7;color:var(--sea)', 'var(--sea)', labelPeriode()) +
    stat('Total Pelanggaran', angka(totCatatan), 'fa-solid fa-scale-balanced',
      'background:var(--maroon-bg);color:var(--maroon)', 'var(--maroon)', 'Seluruh unit digabung') +
    stat('Baris Akumulasi', angka(totJenis), 'fa-solid fa-layer-group',
      'background:var(--violet-bg);color:var(--violet)', 'var(--violet)', 'Kode pelanggaran unik') +
    stat('Akumulasi Poin', angka(totPoin), 'fa-solid fa-coins',
      'background:var(--amber-bg);color:var(--amber)', 'var(--amber)',
      stRekap.kategori === 'Semua' ? 'Seluruh kategori' : `Kategori ${stRekap.kategori}`);

  $('queryTime').textContent = `rekap · ${angka(rows.length)} santri`;

  if (!rows.length) {
    $('rkHasil').innerHTML = kosong('Tidak ditemukan santri dengan kriteria ini.',
      'Ubah kategori, kelas, periode, atau kata kunci pencarian.', 'fa-layer-group');
    $('pgRk').innerHTML = '';
    return;
  }

  $('rkHasil').innerHTML = hal.map(s => {
    const tampil = s.tampil ?? s.total;
    const disaring = tampil !== s.total;
    return `<div class="rekap-item">
      <div class="hd">
        <div style="min-width:0">
          <b>${esc(s.nama)}</b>
          <span class="id">${esc(s.nisn)} · ${esc(s.kelas)}</span>
        </div>
        <div style="display:flex;gap:8px;align-items:center;flex:none;flex-wrap:wrap">
          <span class="tag tag-berat">Total ${tampil}x</span>
          ${disaring ? `<span class="tag tag-off">dari ${s.total}x semua kategori</span>` : ''}
          <span class="tag tag-off">${s.daftar.length} jenis · ${angka(s.poin)} poin</span>
          <button class="btn-link" data-detail="${esc(s.nisn)}">Detail</button>
        </div>
      </div>
      <ul>${s.daftar.map(d => `<li>
        <span class="tag ${tagKategori(d.kategori)}">${esc(d.kategori)}</span>
        <span class="txt">${esc(d.deskripsi)}
          <span class="secondary" style="display:block;font-size:11px">${esc(d.kode)} · ${esc(d.sumber)} · ${angka(d.poin)} poin</span></span>
        <span class="qty">${d.jumlah}x</span></li>`).join('')}</ul>
    </div>`;
  }).join('');

  $('pgRk').innerHTML = pager('rk', stRekap.page, rows.length, stRekap.size);
}

// ---------------------------------------------------------------------
// 15. PUSAT PERIZINAN
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
    bolehAjukanIzin()
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
    const pj = e.target.closest('[data-perpanjang]');
    if (pj) { if (await modalPerpanjangIzin(pj.dataset.perpanjang)) gambarIzin(); return; }

    const i = e.target.closest('[data-izin]');
    if (i) return prosesIzin(...i.dataset.izin.split('|'));
  });

  await gambarIzin();
}

async function gambarIzin() {
  const semua = await muatIzin();
  const nisnBoleh = perluFilterKelas()
    ? new Set(filterBinaanUnit(await muatSiswa(), 'kelas').map(s => String(s.nisn))) : null;

  let rows = semua.filter(p => stIzin.filter === 'Semua' || p.status_persetujuan === stIzin.filter);
  if (nisnBoleh) rows = rows.filter(p => nisnBoleh.has(String(p.nisn)));
  rows = saringPeriodeIzin(rows);
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
      ${aksiIzin(p, 'izin', 'perpanjang')}
    </div>`).join('') || kosong('Tidak ada data perizinan.', 'Ubah filter status, periode, atau kata kunci.', 'fa-door-open');

  $('pgIzin').innerHTML = rows.length ? pager('izin', stIzin.page, rows.length, stIzin.size) : '';
}

async function modalAjukanIzin() {
  if (!bolehAjukanIzin()) {
    return toast('error', `Role ${role()} tidak berwenang mengajukan perizinan.`);
  }
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
        <select id="zJenis" class="input" ${role()==='Klinik' && KLINIK_SAKIT_SAJA ? 'disabled' : ''}>
          ${(role()==='Klinik' && KLINIK_SAKIT_SAJA ? ['Sakit'] : ['Keperluan','Sakit','Pemberitahuan'])
            .map(x => `<option>${x}</option>`).join('')}
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
      return { nisn };
    }
  });
  if (res.isConfirmed) {
    cacheHapus('izin');
    sync('done', 'Izin tersimpan');
    toast('success','Permohonan izin tersimpan');
    gambarIzin(); refreshBadgePending();
    waKirimIzinTerbaru(res.value?.nisn);
  }
}

async function refreshBadgePending() {
  if (!bolehPerizinan()) return;
  const { count } = await db.from('log_perizinan')
    .select('id_izin', { count:'exact', head:true }).eq('status_persetujuan','Pending');
  const b = $('badgePending');
  if (!b) return;
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

// ---------------------------------------------------------------------
// 15b. PERPANJANGAN IZIN
//      Tidak menambah kolom: tanggal_selesai digeser, jejak perpanjangan
//      dicatat sebagai lampiran pada kolom `alasan`.
// ---------------------------------------------------------------------

/** Boleh diperpanjang bila masih Pending dan sesuai kewenangan peran. */
function bolehPerpanjang(z) {
  if (!bisa('izin.perpanjang') || hanyaBaca()) return false;
  if (String(z?.status_persetujuan || '') !== 'Pending') return false;
  if (role() === 'Klinik' && KLINIK_SAKIT_SAJA && !izinSakit(z)) return false;
  return true;
}

/** Tombol aksi kartu izin — dipakai bersama oleh Perizinan & Pengasuhan. */
function aksiIzin(z, tandaProses, tandaPanjang) {
  const a = [];
  if (String(z.status_persetujuan) === 'Pending' && bisa('izin.proses') && !hanyaBaca()) {
    a.push(`<button class="btn btn-danger btn-sm" data-${tandaProses}="${esc(z.id_izin)}|Telat Balik">
      <i class="fa-solid fa-clock-rotate-left"></i>Telat Balik</button>`);
    a.push(`<button class="btn btn-ok btn-sm" data-${tandaProses}="${esc(z.id_izin)}|Sesuai Waktu">
      <i class="fa-solid fa-check"></i>Sesuai Waktu</button>`);
  }
  if (bolehPerpanjang(z)) {
    a.push(`<button class="btn btn-ghost btn-sm" data-${tandaPanjang}="${esc(z.id_izin)}">
      <i class="fa-solid fa-calendar-plus"></i>Perpanjang</button>`);
  }
  if (bisa('izin.lihat')) {
    a.push(`<button class="btn btn-ghost btn-sm" data-wa="${esc(z.id_izin)}">
      <i class="fa-brands fa-whatsapp"></i>Kirim ke Grup</button>`);
  }
  return a.length ? `<div class="acts">${a.join('')}</div>` : '';
}

/** Hitung selisih hari inklusif untuk ditampilkan di modal. */
function lamaHari(mulai, selesai) {
  const a = tglDari(kunciTgl(mulai)), b = tglDari(kunciTgl(selesai));
  if (!a || !b) return 0;
  return Math.round((b - a) / 86400000) + 1;
}

/** Kembalikan true bila perpanjangan tersimpan, agar pemanggil bisa refresh. */
async function modalPerpanjangIzin(idIzin) {
  const semua = await muatIzin();
  const z = semua.find(x => String(x.id_izin) === String(idIzin));
  if (!z) { toast('error', 'Data izin tidak ditemukan.'); return false; }
  if (!bolehPerpanjang(z)) {
    toast('error', role() === 'Klinik'
      ? 'Klinik hanya dapat memperpanjang izin berjenis Sakit.'
      : `Role ${role()} tidak berwenang memperpanjang izin.`);
    return false;
  }

  const lamaSelesai = kunciTgl(z.tanggal_selesai);
  const minBaru     = kunciTgl(tambahHari(tglDari(lamaSelesai), 1));

  const res = await Swal.fire({
    title: 'Perpanjang Perizinan', width: 560, showCancelButton: true,
    confirmButtonText: 'Simpan Perpanjangan', cancelButtonText: 'Batal',
    confirmButtonColor: '#14618B', showLoaderOnConfirm: true,
    allowOutsideClick: () => !Swal.isLoading(),
    html: `<div class="stack">
      <div class="ctx-note"><i class="fa-solid fa-door-open"></i>
        <b>&nbsp;${esc(z.siswa?.nama_siswa || z.nisn)}</b>&nbsp;·&nbsp;${esc(z.siswa?.kelas || '-')}</div>
      <div class="pick" style="margin:0">
        <div class="ico"><i class="fa-regular fa-calendar-days"></i></div>
        <div><small>Izin Berjalan</small>
          <b>${tgl(z.tanggal_mulai)} s/d ${tgl(lamaSelesai)} · ${esc(z.jenis_izin || '-')}
             · ${lamaHari(z.tanggal_mulai, lamaSelesai)} hari</b></div>
      </div>
      <div class="field"><label class="label">Tanggal Selesai Baru</label>
        <input id="ppTanggal" type="date" class="input" min="${minBaru}" value="${minBaru}">
        <p class="hint">Harus lebih akhir dari ${tgl(lamaSelesai)}.</p></div>
      <div class="field"><label class="label">Alasan Perpanjangan</label>
        <textarea id="ppAlasan" class="input" rows="2" maxlength="300"
          placeholder="Contoh: masih dalam perawatan, surat keterangan dokter terlampir."></textarea></div>
    </div>`,
    didOpen: () => setTimeout(() => $('ppTanggal').focus(), 120),
    preConfirm: async () => {
      const baru = $('ppTanggal').value;
      const ket  = $('ppAlasan').value.trim();
      if (!baru) { Swal.showValidationMessage('Tanggal selesai baru wajib diisi.'); return false; }
      if (baru <= lamaSelesai) {
        Swal.showValidationMessage('Tanggal baru harus lebih akhir dari tanggal selesai sekarang.');
        return false;
      }
      if (!ket) { Swal.showValidationMessage('Alasan perpanjangan wajib diisi.'); return false; }

      const jejak = `[Perpanjangan ${tgl(lamaSelesai)} → ${tgl(baru)} oleh `
                  + `${APP.profil?.nama || '-'} (${role()}) pada ${tgl(hariIni())}: ${ket}]`;
      const alasanBaru = String(z.alasan || '').trim()
        ? `${String(z.alasan).trim()}\n${jejak}` : jejak;

      const { error } = await db.from('log_perizinan')
        .update({ tanggal_selesai: baru, alasan: alasanBaru })
        .eq('id_izin', idIzin);
      if (error) { Swal.showValidationMessage(error.message); return false; }
      return { baru };
    }
  });

  if (!res.isConfirmed) return false;
  cacheHapus('izin');
  sync('done', 'Perpanjangan tersimpan');
  toast('success', `Izin diperpanjang s/d ${tgl(res.value.baru)}`);
  return true;
}

// ---------------------------------------------------------------------
// 16. PEMBINAAN
//
//     SUMBER NOMOR TAHAP
//     log_pembinaan.pengulangan_ke dihitung backend per JENIS pelanggaran,
//     sehingga dalam satu kategori nomornya bisa kembar (dua baris ke-11).
//     Aturan yang benar: pengulangan dihitung dari JUMLAH PELANGGARAN yang
//     tercatat pada KATEGORI yang sama; deskripsi pelanggaran hanya pemicu
//     yang ditampilkan, bukan dasar hitungan.
//
//     Karena skema dan trigger tidak boleh diubah, tahap dihitung ulang di
//     browser dari log_pelanggaran (detail_data), lalu dipetakan ke baris
//     pembinaan melalui id_log_pelanggaran. Bentuk pembinaan diambil dari
//     master_pembinaan berdasarkan nomor hasil hitungan itu.
// ---------------------------------------------------------------------
const stBina = { cari:'', kategori:'', status:'', mode:'', page:1, size:30, pilih: new Set() };

/** Nomor tahap yang dipakai UI: hasil hitung ulang, bukan angka database. */
function tahapBina(r) {
  const t = Number(r.tahap_hitung ?? r.pengulangan_ke) || 0;
  return t > 0 ? t : null;
}
function bentukBina(r) { return r.instrumen_pembinaan || r.bentuk_pembinaan || '-'; }

/** Normalisasi teks bentuk pembinaan agar cocok meski beda spasi/kapital. */
const kunciBentuk = (s) => String(s ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

/** Peta cadangan kategori untuk baris pembinaan yang kolom kategorinya kosong. */
function petaKatAturan(aturan) {
  const peta = { byId: new Map(), byBentuk: new Map() };
  (aturan || []).forEach(a => {
    const kat = String(a.kategori || '').trim();
    if (!kat) return;
    if (a.id_aturan) peta.byId.set(String(a.id_aturan), kat);
    const kb = kunciBentuk(a.bentuk_pembinaan);
    if (kb && !peta.byBentuk.has(kb)) peta.byBentuk.set(kb, kat);
  });
  return peta;
}

/** Kategori acuan satu baris pembinaan. */
function kategoriBina(r, peta) {
  const kat = String(r.kategori || '').trim();
  if (kat) return kat;
  if (r.id_aturan) {
    const k = peta.byId.get(String(r.id_aturan));
    if (k) return k;
  }
  const kb = kunciBentuk(r.instrumen_pembinaan || r.bentuk_pembinaan);
  if (kb) {
    const k = peta.byBentuk.get(kb);
    if (k) return k;
  }
  return '-';
}

/**
 * Jendela waktu penghitungan tahap, dalam bulan.
 *
 * Pelanggaran yang lebih tua dari jendela tidak lagi menambah nomor tahap,
 * tetapi tetap tersimpan utuh dan tetap tampil di riwayat serta laporan —
 * hanya berhenti membebani tahap aktif. Santri yang sudah setengah tahun
 * tidak mengulang tidak pantas terus memikul angka dari periode yang jauh
 * berlalu; itulah beda pembinaan dari pencatatan.
 *
 * Angka ini adalah kebijakan dayah, bukan keputusan teknis. Ganti ke 12
 * bila hitungannya ingin mengikuti tahun ajaran.
 */
const JENDELA_TAHAP_BULAN = 6;

/**
 * Kunci tanggal N bulan sebelum `kunci`, dengan pengaman akhir bulan:
 * 31 Agustus dikurangi 6 bulan jatuh pada 28/29 Februari, bukan melompat
 * ke 3 Maret sebagaimana perilaku bawaan `Date.setMonth`.
 */
function mundurBulan(kunci, bulan) {
  const d = tglDari(kunci); if (!d) return '';
  const x = new Date(d.getFullYear(), d.getMonth() - bulan, 1);
  const akhir = new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate();
  x.setDate(Math.min(d.getDate(), akhir));
  return kunciTgl(x);
}

/**
 * Penomoran resmi: urutkan pelanggaran aktif per (santri + kategori) dari
 * yang terlama, lalu beri nomor menurut JENDELA BERJALAN masing-masing
 * catatan — yaitu berapa banyak pelanggaran kategori itu yang terjadi
 * dalam JENDELA_TAHAP_BULAN bulan sebelum catatan tersebut, termasuk
 * dirinya sendiri.
 *
 * PENTING — jendelanya berlabuh pada tanggal TIAP catatan, bukan pada hari
 * ini. Jendela yang berlabuh pada hari ini akan membuat nomor tahap setiap
 * baris lama bergeser sendiri setiap hari, sehingga laporan yang dicetak
 * bulan lalu tidak lagi cocok dengan layar hari ini — dan surat peringatan
 * yang sudah diterima wali santri kehilangan dasar angkanya. Dengan
 * jendela berlabuh, nomor sebuah catatan ditetapkan sekali dan tidak
 * pernah berubah lagi.
 *
 * Setiap id_log tetap mendapat entri (nomor seumur catatan ikut dibawa
 * sebagai `nSeumur`), sehingga nomorkanBina() tidak pernah kehilangan
 * rujukan dan baris pembinaan lama tidak jatuh ke jalur perkiraan.
 *
 * Hasilnya: Map(id_log -> { n, nSeumur, kategori, nisn }).
 */
async function petaTahapPelanggaran() {
  const rows = (await amanKosong(muatDetail, 'pelanggaran')).filter(aktifDetail);

  const grup = new Map();
  rows.forEach(r => {
    const nisn = String(r.nisn || '').trim();
    const kat  = String(r.kategori || '').trim();
    const id   = String(r.id_log || '').trim();
    const k    = kunciTgl(r.tanggal);
    if (!nisn || !kat || !id || !k) return;
    const kunci = `${nisn}|${kat}`;
    if (!grup.has(kunci)) grup.set(kunci, []);
    grup.get(kunci).push({ id, k, nisn, kat });
  });

  const peta = new Map();
  grup.forEach(daftar => {
    daftar.sort((a, b) => a.k.localeCompare(b.k) || a.id.localeCompare(b.id));
    let kepala = 0;                                  // batas bawah jendela
    daftar.forEach((r, i) => {
      const batas = mundurBulan(r.k, JENDELA_TAHAP_BULAN);
      while (kepala < i && daftar[kepala].k < batas) kepala++;
      peta.set(r.id, { n: i - kepala + 1, nSeumur: i + 1, kategori: r.kat, nisn: r.nisn });
    });
  });
  return peta;
}

/**
 * Buang baris pembinaan yang terpicu lebih dari sekali oleh SATU pelanggaran
 * yang sama. Baris tanpa id_log_pelanggaran (manual/data lama) dipertahankan.
 */
function dedupBina(rows) {
  const terlihat = new Set();
  return (rows || []).filter(r => {
    const id = String(r.id_log_pelanggaran || '').trim();
    if (!id) return true;
    if (terlihat.has(id)) return false;
    terlihat.add(id);
    return true;
  });
}

/**
 * Tempelkan nomor tahap pada setiap baris pembinaan.
 *   1. Ada id_log_pelanggaran & cocok -> pakai nomor resmi dari pelanggaran.
 *   2. Tidak cocok (manual/data lama) -> lanjutkan dari nomor tertinggi yang
 *      sudah terpakai pada (santri + kategori) itu, dan ditandai perkiraan.
 */
function nomorkanBina(rows, petaTahap) {
  const maks = {};
  const sisa = [];

  (rows || []).forEach(r => {
    const id = String(r.id_log_pelanggaran || '').trim();
    const ref = id ? petaTahap.get(id) : null;
    if (ref) {
      if (ref.kategori) r.kategori_bina = ref.kategori;   // kategori ikut sumber resmi
      r.tahap_hitung = ref.n;
      r.tahap_seumur = ref.nSeumur;                       // pembanding untuk tinjauan
      r.tahap_perkiraan = false;
      const kunci = `${r.nisn}|${r.kategori_bina}`;
      maks[kunci] = Math.max(maks[kunci] || 0, ref.n);
    } else {
      sisa.push(r);
    }
  });

  sisa.sort((a, b) => {
    const t = String(kunciTgl(a.tanggal_pembinaan)).localeCompare(String(kunciTgl(b.tanggal_pembinaan)));
    if (t) return t;
    return String(a.id_pembinaan || '').localeCompare(String(b.id_pembinaan || ''));
  }).forEach(r => {
    const kunci = `${r.nisn}|${r.kategori_bina}`;
    r.tahap_hitung = (maks[kunci] = (maks[kunci] || 0) + 1);
    r.tahap_perkiraan = true;
  });

  return rows;
}

/**
 * Bentuk pembinaan menurut master_pembinaan, prioritas sama dengan lembar
 * cetak bagian 3:
 *   1. n > batas modul  -> "Sudah melebihi modul Instrumen"
 *   2. aturan master    -> tangga tertinggi yang <= n
 *   3. tidak ada aturan -> pakai apa yang tercatat di log
 */
function bentukMenurutAturan(r, instrumen) {
  // v2.10: tangga yang dipakai mengikuti unit asrama santri, bukan unit
  // yang kebetulan sedang ditampilkan di layar.
  const ins = instrumenUntuk(instrumen, unitBaris(r));
  const info = ins ? ins.get(r.kategori_bina) : null;
  const n = r.tahap_hitung || 0;
  const batas = info && info.max > 0 ? info.max : null;
  if (batas && n > batas) {
    return { bentuk_final: 'Sudah melebihi modul Instrumen', overflow: true, batas };
  }
  return { bentuk_final: bentukAturan(info, n) || bentukBina(r), overflow: false, batas };
}

// ---------- 16b. Penanda "perlu ditinjau" ----------------------------
//
//     Diperiksa langsung ke Supabase: baris log_pembinaan bermode
//     'Otomatis' dibuat oleh TRIGGER Postgres `trg_pembinaan_otomatis`
//     (AFTER INSERT pada log_pelanggaran), bukan oleh app.js. Trigger itu
//     menghitung `pengulangan_ke` dengan count(*) atas SELURUH pelanggaran
//     aktif santri pada kategori yang sama — tanpa jendela waktu, tanpa
//     penyaringan catatan ganda, dan pada urutan MASUK, bukan urutan
//     TANGGAL. Karena itu ia menyimpang dari hitungan browser pada 248 dari
//     759 baris yang ada sekarang.
//
//     Konsekuensinya jujur: app.js tidak bisa mencegat proses itu — sudah
//     selesai di database sebelum browser tahu. Yang bisa dilakukan adalah
//     menandai, bukan menghapus atau menimpa diam-diam. Keputusan akhir
//     tetap di tangan musyrif lewat `ubah_status_pembinaan` yang sudah ada.
//
//     Penandanya sengaja disempitkan pada bentuk pembinaan terberat. Dari
//     759 baris, hanya 5 yang berbentuk pembotakan / surat peringatan /
//     dikembalikan kepada orang tua, dan hanya 2 di antaranya menyimpang.
//     Dua penanda yang benar-benar dibaca jauh lebih berguna daripada 248
//     penanda yang dilewati orang.

/**
 * Bentuk pembinaan yang tidak boleh tercatat tanpa dilihat manusia.
 * Daftar ini kebijakan dayah — silakan ditambah atau dikurangi.
 */
const KATA_KUNCI_AMBANG_BERAT = [
  'pembotakan', 'dikembalikan kepada orang tua',
  'sp 1', 'sp 2', 'sp 3', 'sp1', 'sp2', 'sp3', 'surat peringatan'
];

const ambangBerat = (teks) => {
  const t = kunciBentuk(teks);
  return !!t && KATA_KUNCI_AMBANG_BERAT.some(k => t.includes(k));
};

/**
 * Baris perlu ditinjau bila bentuknya termasuk ambang berat DAN nomor
 * tahap versi trigger berbeda dari hitungan browser — pertanda tahap
 * terberat mungkin terpicu lebih cepat daripada yang semestinya.
 */
function perluDitinjau(r) {
  if (String(r?.mode_pembinaan) !== 'Otomatis') return false;
  if (!ambangBerat(bentukBina(r)) && !ambangBerat(r?.bentuk_final)) return false;
  const mentah = Number(r.pengulangan_ke) || 0;
  const hitung = Number(r.tahap_hitung) || 0;
  return mentah > 0 && hitung > 0 && mentah !== hitung;
}

/** Jendela peninjauan: memperlihatkan selisihnya, lalu menyerahkan keputusan. */
async function tinjauAmbangBerat(idPembinaan) {
  const { penuh } = await bahanBinaPenuh();
  const r = penuh.find(x => String(x.id_pembinaan) === String(idPembinaan));
  if (!r) return toast('error', 'Data pembinaan tidak ditemukan.');

  const kategori = r.kategori_bina || '-';
  const riwayat = (await amanKosong(muatDetail, 'pelanggaran'))
    .filter(aktifDetail)
    .filter(p => String(p.nisn) === String(r.nisn) &&
                 String(p.kategori || '').trim() === kategori)
    .sort((a, b) => String(kunciTgl(a.tanggal)).localeCompare(String(kunciTgl(b.tanggal))));

  const batas = riwayat.length
    ? mundurBulan(kunciTgl(r.tanggal_pembinaan) || hariIni(), JENDELA_TAHAP_BULAN) : '';
  const luar = riwayat.filter(p => kunciTgl(p.tanggal) < batas).length;

  await Swal.fire({
    icon: 'warning', width: 660, title: 'Perlu ditinjau',
    html: `<div style="text-align:left;font-size:13.5px">
      <p style="margin:0 0 9px"><b>${esc(r.nama_siswa)}</b> — tercatat otomatis sebagai
        <b>${esc(bentukBina(r))}</b>.</p>
      <table style="width:100%;border-collapse:collapse;font-size:12.5px;margin:0 0 10px">
        <tr><td style="padding:5px 0">Nomor tahap dari trigger database</td>
            <td style="padding:5px 0;text-align:right"><b>ke-${esc(r.pengulangan_ke)}</b></td></tr>
        <tr><td style="padding:5px 0">Nomor tahap hasil hitung ulang (${JENDELA_TAHAP_BULAN} bulan berjalan)</td>
            <td style="padding:5px 0;text-align:right"><b>ke-${esc(r.tahap_hitung)}</b></td></tr>
        <tr><td style="padding:5px 0;border-top:1px solid #e2e8f0">Catatan kategori ${esc(kategori)} seluruhnya</td>
            <td style="padding:5px 0;text-align:right;border-top:1px solid #e2e8f0">
              <b>${riwayat.length}</b>${luar ? ` <span style="color:#94a3b8">(${luar} di luar jendela)</span>` : ''}</td></tr>
      </table>
      <p style="margin:0 0 5px;color:var(--text-3);font-size:12.5px">
        Selisih ini berarti sebagian dasar tahap berasal dari luar periode berjalan,
        atau ada catatan ganda. Riwayat kategori ${esc(kategori)}:</p>
      <ul style="max-height:170px;overflow:auto;padding-left:18px;margin:4px 0 10px;font-size:12.5px">
        ${riwayat.map(p => `<li>${esc(tgl(p.tanggal))} — ${esc(p.nama_pelanggaran || '-')}</li>`).join('')
          || '<li>Tidak ada rincian tersedia</li>'}
      </ul>
      <p style="margin:0;color:var(--text-3);font-size:12.5px">
        Bila tahap ini dinilai belum layak, arsipkan catatan pelanggaran yang ganda
        di menu Pelanggaran, atau ubah status pembinaannya di baris ini.</p>
    </div>`,
    confirmButtonText: 'Sudah diperiksa', confirmButtonColor: '#14618B'
  });
}

/** Urutan tampil: kategori (Ringan→Sedang→Berat), lalu tahap terbesar dahulu. */
function urutkanBina(rows) {
  return (rows || []).slice().sort((a, b) => {
    const ka = URUT_KAT[a.kategori_bina] ?? 99;
    const kb = URUT_KAT[b.kategori_bina] ?? 99;
    if (ka !== kb) return ka - kb;
    const na = a.tahap_hitung || 0, nb = b.tahap_hitung || 0;
    if (na !== nb) return nb - na;
    return String(kunciTgl(b.tanggal_pembinaan)).localeCompare(String(kunciTgl(a.tanggal_pembinaan)));
  });
}

async function viewPembinaan() {
  const lapor = bolehLaporBina();
  const nKol  = lapor ? 10 : 9;
  $('viewRoot').innerHTML = `
    <div class="stats" id="binaKpi"></div>
    ${lapor ? `<div class="alur-bina rise">
      <div class="alur-langkah on"><span>1</span><div><b>Laksanakan</b><small>Pembinaan di asrama oleh Ustadz GEN-Z</small></div></div>
      <i class="fa-solid fa-chevron-right alur-panah"></i>
      <div class="alur-langkah on"><span>2</span><div><b>Laporkan</b><small>Terkirim ke guru kelas binaan santri</small></div></div>
      <i class="fa-solid fa-chevron-right alur-panah"></i>
      <div class="alur-langkah"><span>3</span><div><b>Disahkan</b><small>Guru menekan “Sahkan Selesai” — legalitas pada guru</small></div></div>
    </div>` : ''}
    ${kartu('Instruksi Pembinaan', `
      <div class="filters">
        <input id="pbCari" class="input grow" placeholder="Cari santri, instrumen, atau pemicu…" value="${esc(stBina.cari)}">
        <select id="pbKategori" class="input"><option value="">Semua Kategori</option>
          ${['Ringan','Sedang','Berat'].map(k => `<option ${k===stBina.kategori?'selected':''}>${k}</option>`).join('')}</select>
        <select id="pbStatus" class="input"><option value="">Semua Status</option>
          ${['Dalam Proses','Menunggu Pengesahan','Selesai'].map(k => `<option ${k===stBina.status?'selected':''}>${k}</option>`).join('')}</select>
        <select id="pbMode" class="input"><option value="">Semua Mode</option>
          ${['Otomatis','Manual'].map(k => `<option ${k===stBina.mode?'selected':''}>${k}</option>`).join('')}</select>
        <span class="sep"></span>
        ${lapor ? `<button class="btn btn-lapor btn-sm hidden" id="pbLaporMassal">
          <i class="fa-solid fa-paper-plane"></i><span>Laporkan terpilih (<b id="pbPilihN">0</b>)</span></button>` : ''}
        <span class="tag tag-off" id="pbCount">0 data</span>
      </div>
      <div class="tbl"><table class="tbl-bina">
        <thead><tr>${lapor ? `<th class="center pilih-kol"><input type="checkbox" id="pbPilihSemua"
            class="cek" aria-label="Pilih semua pembinaan yang bisa dilaporkan di halaman ini"></th>` : ''}
          <th>Tanggal</th><th>Santri</th><th>Kategori</th><th class="center">Tahap</th>
          <th>Bentuk Pembinaan</th><th>Pemicu</th><th>Mode</th><th>Status</th><th class="right">Aksi</th></tr></thead>
        <tbody id="tbBina"><tr><td colspan="${nKol}" style="padding:26px;text-align:center;color:var(--text-3)">Memuat…</td></tr></tbody>
      </table></div>
      <div class="scroll-hint"><i class="fa-solid fa-arrows-left-right"></i>Geser ke samping untuk kolom lainnya.</div>
      <div id="pgBina"></div>`,
      `<button class="btn btn-ghost btn-sm" id="pbRefresh"><i class="fa-solid fa-rotate"></i>Muat Ulang</button>`,
      `Tahap dihitung dari pelanggaran ${JENDELA_TAHAP_BULAN} bulan terakhir per kategori; `
      + `bentuk mengikuti Master Pembinaan.`)}`;

  ['pbKategori','pbStatus','pbMode'].forEach(id => $(id).addEventListener('change', e => {
    stBina[{pbKategori:'kategori', pbStatus:'status', pbMode:'mode'}[id]] = e.target.value;
    stBina.page = 1; gambarBina();
  }));
  $('pbCari').addEventListener('input', debounce(e => {
    stBina.cari = e.target.value.trim(); stBina.page = 1; gambarBina(); }, 220));
  $('pbRefresh').addEventListener('click', async () => {
    cacheHapus('pembinaan','aturanBina','detail','laporan_bina');
    await gambarBina(); toast('success','Data dimuat ulang'); });

  // Centang laporan massal — status pilihan disimpan di stBina.pilih
  // supaya tidak hilang ketika tabel dirender ulang oleh realtime.
  if (lapor) {
    $('tbBina').addEventListener('change', (e) => {
      const c = e.target.closest('[data-pilih]'); if (!c) return;
      c.checked ? stBina.pilih.add(c.dataset.pilih) : stBina.pilih.delete(c.dataset.pilih);
      c.closest('tr')?.classList.toggle('dipilih', c.checked);
      segarkanPilihanBina();
    });
    $('pbPilihSemua').addEventListener('change', (e) => {
      document.querySelectorAll('#tbBina [data-pilih]').forEach(c => {
        c.checked = e.target.checked;
        c.checked ? stBina.pilih.add(c.dataset.pilih) : stBina.pilih.delete(c.dataset.pilih);
        c.closest('tr')?.classList.toggle('dipilih', c.checked);
      });
      segarkanPilihanBina();
    });
  }

  onKlik(async (e) => {
    const p = e.target.closest('[data-pg]');
    if (p && p.dataset.pg.startsWith('bina:')) {
      stBina.page = Number(p.dataset.pg.split(':')[1]);
      await gambarBina();
      $('tbBina').scrollIntoView({ block:'start', behavior:'smooth' });
      return;
    }
    const t = e.target.closest('[data-tinjau]');
    if (t) return tinjauAmbangBerat(t.dataset.tinjau);
    const l = e.target.closest('[data-lapor]');
    if (l) return modalLaporBina([l.dataset.lapor]);
    if (e.target.closest('#pbLaporMassal')) return modalLaporBina([...stBina.pilih]);
    const u = e.target.closest('[data-bina-utas]');
    if (u) { stPesan.aktif = u.dataset.binaUtas; return navigateTo('pesan'); }
    const b = e.target.closest('[data-pbn]');
    if (!b) return;
    const [id, status] = b.dataset.pbn.split('|');
    ubahStatusPembinaan(id, status, b);
  });

  await gambarBina();
}

/**
 * Riwayat pembinaan PENUH — sudah bernomor tahap dan berbentuk final,
 * tetapi BELUM disaring periode maupun kelas binaan.
 *
 * Dipisahkan dari bahanBina() karena pesan WhatsApp kepada wali santri
 * (modul 27b) harus memakai seluruh riwayat: pemberitahuan tahap ke-8
 * tidak boleh berubah isinya hanya karena layar sedang menyaring bulan
 * berjalan. Peta instrumen ikut dikembalikan supaya tangga pembinaan
 * berikutnya bisa disusun tanpa memuat ulang master_pembinaan.
 */
async function bahanBinaPenuh() {
  const [aturan, mentah, petaTahap] = await Promise.all([
    muatMasterPembinaan(),
    muatPembinaan(),
    petaTahapPelanggaran()
  ]);
  const instrumen = petaInstrumenUnit(aturan);         // lihat 20a — terpisah per unit
  const petaKat = petaKatAturan(aturan);

  // 1. Riwayat PENUH (belum disaring periode) — dasar penomoran tahap.
  const penuh = dedupBina(
    (mentah || []).filter(aktifPembinaan).map(r => ({
      ...r,
      nama_siswa: r.siswa?.nama_siswa || '(tidak ditemukan)',
      kelas: r.siswa?.kelas || '-',
      kategori_bina: kategoriBina(r, petaKat)
    })));

  // 2. Nomor tahap dari log pelanggaran, lalu bentuk sesuai aturan master.
  nomorkanBina(penuh, petaTahap);
  penuh.forEach(r => Object.assign(r, bentukMenurutAturan(r, instrumen)));

  return { penuh, instrumen };
}

async function bahanBina() {
  const { penuh } = await bahanBinaPenuh();
  // 3. Baru disaring periode & kelas binaan, lalu diurutkan untuk tampilan.
  return urutkanBina(filterBinaanUnit(saringPeriode(penuh, 'tanggal_pembinaan'), 'kelas'));
}

async function gambarBina() {
  const [semua, lap] = await Promise.all([bahanBina(), petaLaporanBina()]);
  const lapor = bolehLaporBina();
  const nKol  = lapor ? 10 : 9;
  const laporanDari = (r) => lap.get(String(r.id_pembinaan)) || null;
  const menungguSah = (r) => String(r.status_pembinaan) !== 'Selesai' && !!laporanDari(r);

  const total = semua.length;
  const proses = semua.filter(r => r.status_pembinaan !== 'Selesai').length;
  const menunggu = semua.filter(menungguSah).length;
  const otomatis = semua.filter(r => String(r.mode_pembinaan) === 'Otomatis').length;
  const belumLapor = lapor ? semua.filter(r => r.status_pembinaan !== 'Selesai' && !laporanDari(r)).length : 0;
  $('binaKpi').innerHTML =
    stat('Total Instruksi', angka(total), 'fa-solid fa-list', 'background:#EFF3F6;color:var(--text-2)', 'var(--text-3)', labelPeriode()) +
    stat('Dalam Proses', angka(proses), 'fa-solid fa-hourglass-half', 'background:var(--amber-bg);color:var(--amber)', 'var(--amber)',
      lapor ? `${angka(belumLapor)} belum dilaporkan` : '') +
    stat('Menunggu Pengesahan', angka(menunggu), 'fa-solid fa-file-signature', 'background:#E7F1F7;color:var(--sea)', 'var(--sea)',
      bolehPembinaan() ? 'Laporan Ustadz GEN-Z untuk Anda' : 'Di tangan guru kelas binaan') +
    stat('Selesai', angka(total - proses), 'fa-solid fa-circle-check', 'background:var(--teal-bg);color:var(--teal)', 'var(--teal)',
      `${angka(otomatis)} dibuat otomatis`);

  const k = stBina.cari.toLowerCase();
  const rows = semua.filter(r => {
    if (stBina.kategori && r.kategori_bina !== stBina.kategori) return false;
    if (stBina.status === 'Menunggu Pengesahan') { if (!menungguSah(r)) return false; }
    else if (stBina.status && String(r.status_pembinaan || 'Dalam Proses') !== stBina.status) return false;
    if (stBina.mode && String(r.mode_pembinaan || 'Manual') !== stBina.mode) return false;
    if (!k) return true;
    const L = laporanDari(r);
    return [r.id_pembinaan, r.nisn, r.nama_siswa, r.kelas, r.kategori_bina, r.bentuk_final, bentukBina(r),
            r.deskripsi_pelanggaran, r.catatan_pembinaan, r.id_aturan, r.mode_pembinaan, r.pembina,
            L?.pelapor, ...(L?.penerima || [])]
      .some(v => String(v||'').toLowerCase().includes(k));
  });

  const pages = Math.max(1, Math.ceil(rows.length / stBina.size));
  if (stBina.page > pages) stBina.page = pages;
  const from = (stBina.page - 1) * stBina.size;
  const hal = rows.slice(from, from + stBina.size);

  // Pilihan yang sudah tidak sah (baris dilaporkan/diselesaikan orang lain) dibuang.
  if (lapor) [...stBina.pilih].forEach(id => {
    const r = semua.find(x => String(x.id_pembinaan) === id);
    if (!r || r.status_pembinaan === 'Selesai' || laporanDari(r)) stBina.pilih.delete(id);
  });

  $('pbCount').textContent = `${angka(rows.length)} dari ${angka(semua.length)} data`;
  $('queryTime').textContent = `pembinaan · ${angka(rows.length)} baris`;

  const editable = bolehPembinaan() && !hanyaBaca();
  $('tbBina').innerHTML = hal.map(r => {
    const id = String(r.id_pembinaan || '');
    const selesai = String(r.status_pembinaan) === 'Selesai';
    const L = laporanDari(r);
    const tunggu = L && !selesai;
    const bisaDipilih = lapor && !selesai && !L;
    const dipilih = bisaDipilih && stBina.pilih.has(id);
    const tahap = tahapBina(r);
    const catatan = String(r.catatan_pembinaan || '').trim();
    const tampilCatatan = catatan && !/^Pembinaan otomatis kategori /i.test(catatan);

    const aksi = [];
    if (bolehKabarWali() && perluKabarWali(r)) aksi.push(`<button class="btn btn-wa btn-sm" data-wa-wali="${esc(id)}"
         title="Beri tahu wali santri melalui WhatsApp"><i class="fa-brands fa-whatsapp"></i>Kabari Wali</button>`);
    if (lapor && bisaDipilih) aksi.push(`<button class="btn btn-lapor btn-sm" data-lapor="${esc(id)}"
         title="Kirim laporan pelaksanaan ke guru kelas binaan"><i class="fa-solid fa-paper-plane"></i>Laporkan ke Guru</button>`);
    if (L && (lapor || editable)) aksi.push(`<button class="btn btn-ghost btn-sm" data-bina-utas="${esc(L.utas[0])}"
         title="Buka percakapan laporan"><i class="fa-solid fa-comments"></i>Utas</button>`);
    if (editable) aksi.push(`<button class="btn ${selesai ? 'btn-ghost' : tunggu ? 'btn-sah' : 'btn-ok'} btn-sm"
         data-pbn="${esc(id)}|${selesai ? 'Dalam Proses' : 'Selesai'}">
         <i class="fa-solid ${selesai ? 'fa-arrow-rotate-left' : tunggu ? 'fa-file-signature' : 'fa-circle-check'}"></i>${
           selesai ? 'Buka Lagi' : tunggu ? 'Sahkan Selesai' : 'Selesaikan'}</button>`);
    if (!aksi.length) aksi.push('<span class="tag tag-off">Hanya baca</span>');

    return `<tr class="${tunggu ? 'menunggu' : ''}${dipilih ? ' dipilih' : ''}">
      ${lapor ? `<td class="center pilih-kol">${bisaDipilih
        ? `<input type="checkbox" class="cek" data-pilih="${esc(id)}" ${dipilih ? 'checked' : ''}
             aria-label="Pilih pembinaan ${esc(r.nama_siswa)}">` : ''}</td>` : ''}
      <td class="nowrap"><div class="secondary" style="margin:0">${tgl(r.tanggal_pembinaan)}</div>
        <div class="secondary" style="font-size:10px">${esc(id)}</div></td>
      <td><div class="primary">${esc(r.nama_siswa)}</div>
          <div class="secondary">${esc(r.nisn)} · ${esc(r.kelas)}</div></td>
      <td><span class="tag ${tagKategori(r.kategori_bina)}">${esc(r.kategori_bina||'-')}</span></td>
      <td class="center">${tahap
        ? `<span class="tag ${r.overflow ? 'tag-berat' : 'tag-sea'}">Ke-${tahap}</span>
           ${r.tahap_perkiraan ? `<div class="secondary" style="font-size:10px;margin-top:4px">perkiraan</div>` : ''}`
        : '<span class="tag tag-off">—</span>'}</td>
      <td><div class="primary" ${r.overflow ? 'style="color:var(--maroon)"' : ''}>${esc(r.bentuk_final)}</div>
        ${perluDitinjau(r) ? `<button class="tag tag-tinjau" data-tinjau="${esc(id)}"
            title="Nomor tahap dari database berbeda dengan hitungan periode berjalan">
            <i class="fa-solid fa-magnifying-glass"></i>Perlu ditinjau</button>` : ''}
        ${r.overflow ? `<div class="secondary">Batas modul kategori ini: ${r.batas}</div>` : ''}
        ${tampilCatatan ? `<div style="font-size:11.5px;color:var(--text-3);margin-top:5px">${esc(catatan)}</div>` : ''}</td>
      <td style="font-size:12.5px;color:var(--text-2);max-width:240px">${esc(r.deskripsi_pelanggaran||'-')}</td>
      <td><span class="tag ${String(r.mode_pembinaan)==='Otomatis'?'tag-sea':'tag-off'}">${esc(r.mode_pembinaan||'Manual')}</span></td>
      <td style="min-width:150px">
        <span class="tag ${selesai ? 'tag-ok' : tunggu ? 'tag-sah' : 'tag-wait'}">${
          selesai ? 'Selesai' : tunggu ? 'Menunggu Pengesahan' : esc(r.status_pembinaan || 'Dalam Proses')}</span>
        ${L ? `<div class="jejak-sah"><i class="fa-solid fa-user-shield"></i>Dilaksanakan ${esc(L.pelapor)}${
            L.tglLaksana ? ' · ' + esc(tgl(L.tglLaksana)) : ''}</div>` : ''}
        ${tunggu ? `<div class="jejak-sah"><i class="fa-solid fa-hourglass-half"></i>Menunggu ${esc(L.penerima.join(', ') || 'guru')}</div>` : ''}
        ${selesai && r.pembina ? `<div class="jejak-sah ok"><i class="fa-solid fa-signature"></i>Disahkan ${esc(r.pembina)}${
            r.diselesaikan_pada ? ' · ' + esc(tgl(r.diselesaikan_pada)) : ''}</div>` : ''}</td>
      <td class="right"><div class="aksi-bina">${aksi.join('')}</div></td>
    </tr>`;
  }).join('') || barisKosong(nKol, 'Belum ada instruksi pembinaan.', 'Pembinaan otomatis terbentuk setelah pelanggaran dicatat.');

  $('pgBina').innerHTML = rows.length ? pager('bina', stBina.page, rows.length, stBina.size) : '';
  if (lapor) segarkanPilihanBina();
  tandaiTabelBisaGeser();
}

async function ubahStatusPembinaan(id, status, btn) {
  const selesai = status === 'Selesai';
  const L = (await petaLaporanBina()).get(String(id));
  const konf = await Swal.fire({
    icon: selesai ? 'question' : 'warning',
    title: selesai ? (L ? 'Sahkan pembinaan ini?' : 'Tandai pembinaan selesai?') : 'Buka kembali pembinaan?',
    html: selesai && L
      ? `Pembinaan dilaksanakan oleh <b>${esc(L.pelapor)}</b>${L.tglLaksana ? ' pada ' + esc(tgl(L.tglLaksana)) : ''}.
         <br>Dengan mengesahkan, status menjadi <b>Selesai</b> atas nama Anda dan pelapor menerima konfirmasi otomatis.`
      : `Status akan menjadi "${esc(status)}".`,
    showCancelButton:true, confirmButtonText: selesai ? (L ? 'Ya, sahkan' : 'Ya, selesai') : 'Ya, buka lagi',
    cancelButtonText:'Batal', confirmButtonColor: selesai ? '#0F766E' : '#B45309' });
  if (!konf.isConfirmed) return;

  const asli = mulaiSimpan(btn, 'Menyimpan…');
  try {
    await q(db.rpc('ubah_status_pembinaan', { p_id:id, p_status:status }), 'pembinaan');
    cacheHapus('pembinaan', 'laporan_bina', 'pesan_bk');
    selesaiSimpan(btn, asli, true, 'Status diperbarui');
    toast('success', selesai && L ? 'Pembinaan disahkan selesai' : 'Status pembinaan: ' + status);
    refreshBadgePesan();
    if (APP.view === 'pembinaan') await gambarBina();
    else if (APP.view === 'pesan') await muatViewPesan();
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
    // Rekap memakai kategori acuan yang sama dengan Log Pembinaan.
    if (['Ringan','Sedang','Berat'].includes(r.kategori_bina)) o[r.kategori_bina]++;
    if (String(r.status_pembinaan) === 'Selesai') o.selesai++; else o.proses++;
    o.total++;
    const cur = kunciTgl(r.tanggal_pembinaan);
    if (!o.tglAkhir || cur >= o.tglAkhir) {
      o.tglAkhir = cur; o.tahap = tahapBina(r); o.katAkhir = r.kategori_bina || '-';
      o.bentukAkhir = r.bentuk_final || bentukBina(r); o.mode = r.mode_pembinaan || 'Manual';
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
    stat('Santri Dibina', angka(rekap.length), 'fa-solid fa-user-group', 'background:#E7F1F7;color:var(--sea)', 'var(--sea)', labelPeriode()) +
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
const stMaster = { cari:'', kategori:'Semua' };
const stMsBidang = { cari:'', status:'Semua' };


// =====================================================================
// 19c. UNGGAH CSV — PENGISIAN DATA UNIT PUTRI   (v2.10)
//
//     LETAK DI ANTARMUKA
//     Kartu unggah diletakkan di halaman "Master & Bidang", bukan di
//     "Pengguna" maupun "Studio Identitas". Alasannya lugas: dua dari
//     tiga jenis berkas yang diunggah — master pelanggaran dan master
//     pembinaan — memang ISI halaman itu, dan yang ketiga (data santri)
//     adalah data referensi sejenis. Halaman itu sudah menamai dirinya
//     "brankas referensi" dan sudah memuat tombol Tambah untuk ketiga
//     master, jadi unggah massal berdiri persis di sebelah padanan
//     manualnya. "Pengguna" mengurus akun, bukan data santri; "Studio
//     Identitas" mengurus berkas gambar.
//
//     TANPA PUSTAKA LUAR
//     Pengurai CSV ditulis sendiri, mengikuti preseden QR generator
//     v2.4. Selain menghindari ketergantungan CDN, ada alasan teknis:
//     ekspor aplikasi ini (unduhCsv) memakai pemisah TITIK KOMA, dan
//     sebagian besar pengurai siap pakai berasumsi koma. Pengurai di
//     bawah mendeteksi pemisah sendiri sehingga berkas hasil ekspor
//     aplikasi ini bisa langsung diimpor kembali.
//
//     WAJIB PRATINJAU
//     Tidak ada jalur yang mengirim data ke Supabase tanpa melewati
//     tabel pratinjau dan satu penekanan tombol konfirmasi. Baris yang
//     bermasalah ditandai beserta alasannya, dan selama masih ada baris
//     bermasalah tombol kirim tidak aktif.
// =====================================================================

/* ---------- 19c-1. Pengurai CSV --------------------------------------
 *
 * Menangani: tanda kutip ganda, kutip di dalam kutip (""), baris baru di
 * dalam sel, CRLF/CR/LF campur, dan BOM UTF-8 di awal berkas.
 */

/** Buang BOM dan seragamkan akhir baris. */
function bersihkanTeksCsv(teks) {
  return String(teks || '').replace(/^﻿/, '').replace(/\r\n?/g, '\n');
}

/**
 * Tebak pemisah kolom dari baris kepala, dengan menghitung kemunculan di
 * LUAR tanda kutip saja. Titik koma didahulukan karena itu yang dipakai
 * ekspor aplikasi ini.
 */
function deteksiPemisah(teks) {
  const baris = bersihkanTeksCsv(teks).split('\n').find(b => b.trim() !== '') || '';
  const hitung = (p) => {
    let n = 0, dalam = false;
    for (let i = 0; i < baris.length; i++) {
      const c = baris[i];
      if (c === '"') { dalam = !dalam; continue; }
      if (!dalam && c === p) n++;
    }
    return n;
  };
  const kandidat = [[';', hitung(';')], [',', hitung(',')], ['\t', hitung('\t')]];
  kandidat.sort((a, b) => b[1] - a[1]);
  return kandidat[0][1] > 0 ? kandidat[0][0] : ';';
}

/** Urai teks CSV menjadi larik-larik sel mentah. */
function uraiBarisCsv(teks, pemisah) {
  const isi = bersihkanTeksCsv(teks);
  const hasil = [];
  let baris = [], sel = '', dalam = false;

  for (let i = 0; i < isi.length; i++) {
    const c = isi[i];
    if (dalam) {
      if (c === '"') {
        if (isi[i + 1] === '"') { sel += '"'; i++; }
        else dalam = false;
      } else sel += c;
      continue;
    }
    if (c === '"') { dalam = true; continue; }
    if (c === pemisah) { baris.push(sel); sel = ''; continue; }
    if (c === '\n') { baris.push(sel); hasil.push(baris); baris = []; sel = ''; continue; }
    sel += c;
  }
  baris.push(sel);
  hasil.push(baris);

  // Buang baris yang seluruh selnya kosong (umumnya baris terakhir).
  return hasil.filter(b => b.some(x => String(x).trim() !== ''));
}

/** Samakan nama kolom: huruf kecil, spasi/strip -> garis bawah. */
const kunciKolom = (s) => String(s ?? '').trim().toLowerCase()
  .replace(/^﻿/, '').replace(/[\s\-.]+/g, '_').replace(/[^a-z0-9_]/g, '');

/**
 * Urai berkas menjadi { kolom, baris, pemisah }.
 * `baris` berisi objek berkunci nama kolom yang sudah diseragamkan,
 * beserta `__baris` (nomor baris di berkas, terhitung baris kepala).
 */
function uraiCsv(teks) {
  const pemisah = deteksiPemisah(teks);
  const mentah = uraiBarisCsv(teks, pemisah);
  if (!mentah.length) return { kolom: [], baris: [], pemisah };

  const kolom = mentah[0].map(kunciKolom);
  const baris = mentah.slice(1).map((sel, i) => {
    const o = { __baris: i + 2 };            // +2: baris 1 adalah kepala
    kolom.forEach((k, j) => { if (k) o[k] = String(sel[j] ?? '').trim(); });
    return o;
  });
  return { kolom, baris, pemisah };
}

/* ---------- 19c-2. Skema per jenis berkas ---------------------------- */

const KATEGORI_PLG = ['Ringan', 'Sedang', 'Berat', 'Khusus'];
const KATEGORI_BINA = ['Ringan', 'Sedang', 'Berat'];

/** Rapikan NISN: buang selain angka. Sepadan dengan norm_nisn() di database. */
const rapiNisn = (v) => String(v ?? '').replace(/\D/g, '');

/** Benarkah teks ini tanggal yyyy-mm-dd / dd-mm-yyyy / dd/mm/yyyy yang sah? */
function tanggalSah(v) {
  const s = String(v ?? '').trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return cekTanggal(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (m) return cekTanggal(+m[3], +m[2], +m[1]);
  return null;
}
function cekTanggal(y, b, t) {
  const d = new Date(Date.UTC(y, b - 1, t));
  if (d.getUTCFullYear() !== y || d.getUTCMonth() !== b - 1 || d.getUTCDate() !== t) return null;
  return `${y}-${String(b).padStart(2, '0')}-${String(t).padStart(2, '0')}`;
}

/**
 * Tiga skema berkas. Setiap kolom menyebut: wajib atau tidak, nilai
 * bawaan, dan pemeriksa nilainya.
 *
 * Catatan jujur soal pemeriksaan tanggal: ketiga tabel tujuan TIDAK
 * memiliki satu pun kolom tanggal yang diisi Admin — `created_at` diisi
 * database sendiri. Pemeriksa `tanggalSah()` tetap disediakan dan sudah
 * terpasang di kerangka ini supaya skema berkas berikutnya yang memang
 * memuat tanggal bisa memakainya tanpa menulis ulang apa pun, tetapi
 * pada ketiga skema di bawah ia memang belum terpakai.
 */
const SKEMA_CSV = {
  santri: {
    label: 'Data Santri Putri',
    tabel: 'siswa',
    kunci: 'nisn',
    ikon: 'fa-user-graduate',
    kolom: [
      { k:'nisn',            judul:'NISN',            wajib:true },
      { k:'nama_siswa',      judul:'Nama Santri',     wajib:true },
      { k:'kelas',           judul:'Kelas',           wajib:true },
      { k:'jenjang',         judul:'Jenjang',         wajib:false, bawaan:'' },
      { k:'jenis_kelamin',   judul:'Jenis Kelamin',   wajib:false, bawaan:'P' },
      { k:'no_hp_orang_tua', judul:'No. HP Orang Tua',wajib:false, bawaan:'' },
      { k:'email_orang_tua', judul:'Email Orang Tua', wajib:false, bawaan:'' },
      { k:'asrama',          judul:'Asrama',          wajib:false, bawaan:'' },
      { k:'status_santri',   judul:'Status Santri',   wajib:false, bawaan:'Aktif' }
    ]
  },
  pelanggaran: {
    label: 'Master Pelanggaran Putri',
    tabel: 'master_pelanggaran',
    kunci: 'kode_pelanggaran',
    ikon: 'fa-scale-balanced',
    kolom: [
      { k:'kode_pelanggaran', judul:'Kode',       wajib:true },
      { k:'nama_pelanggaran', judul:'Nama Pelanggaran', wajib:true },
      { k:'kategori',         judul:'Kategori',   wajib:true },
      { k:'bobot_poin',       judul:'Bobot Poin', wajib:true },
      { k:'bidang',           judul:'Bidang',     wajib:true },
      { k:'sumber',           judul:'Sumber',     wajib:false, bawaan:'Pengasuhan' },
      { k:'jenjang',          judul:'Jenjang',    wajib:false, bawaan:'Semua' }
    ]
  },
  pembinaan: {
    label: 'Master Pembinaan Putri',
    tabel: 'master_pembinaan',
    kunci: null,
    ikon: 'fa-hands-praying',
    kolom: [
      { k:'kategori',         judul:'Kategori',        wajib:true },
      { k:'pengulangan_ke',   judul:'Tahap Ke-',       wajib:true },
      { k:'bentuk_pembinaan', judul:'Bentuk Pembinaan',wajib:true },
      { k:'keterangan',       judul:'Keterangan',      wajib:false, bawaan:'' },
      { k:'aktif',            judul:'Aktif',           wajib:false, bawaan:'Ya' }
    ]
  }
};

/* ---------- 19c-3. Pemeriksaan isi ----------------------------------- */

/**
 * Periksa seluruh baris satu berkas.
 * Mengembalikan larik { data, masalah[], __baris } — `data` sudah siap
 * kirim (unit_gender ikut disisipkan), `masalah` kosong berarti lolos.
 *
 * `adaDb` adalah Set kunci yang SUDAH ada di database, supaya bentrok
 * kunci utama ketahuan sebelum Supabase menolaknya dengan pesan teknis.
 */
function periksaCsv(jenis, baris, adaDb) {
  const skema = SKEMA_CSV[jenis];
  const terlihat = new Map();      // kunci -> nomor baris pertama
  const pasangan = new Map();      // khusus pembinaan: kategori|tahap

  return (baris || []).map(r => {
    const masalah = [];
    const data = { unit_gender: UNIT_PUTRI };

    // 1. Kolom wajib & nilai bawaan
    skema.kolom.forEach(kol => {
      let v = String(r[kol.k] ?? '').trim();
      if (!v && kol.wajib) { masalah.push(`Kolom wajib "${kol.judul}" kosong`); return; }
      if (!v) v = kol.bawaan ?? '';
      data[kol.k] = v;
    });

    // 2. Pemeriksaan khusus per jenis
    if (jenis === 'santri') {
      const nisn = rapiNisn(data.nisn);
      if (data.nisn && !nisn) masalah.push('NISN tidak memuat satu pun angka');
      else if (nisn && nisn.length < 4) masalah.push(`NISN "${data.nisn}" terlalu pendek`);
      data.nisn = nisn;

      const unitKelas = unitDariKelas(data.kelas);
      if (data.kelas && !unitKelas) {
        masalah.push(`Kelas "${data.kelas}" tidak mengikuti pola TINGKAT-HURUF, mis. VII-A`);
      } else if (unitKelas === UNIT_PUTRA) {
        masalah.push(`Kelas "${data.kelas}" adalah kelas PUTRA menurut ketetapan dayah `
          + '(VII–IX putri = A/B/C, X–XII putri = A/B)');
      }

      const p = pecahKelas(data.kelas);
      const jenjangKelas = p ? (TINGKAT_MTS.includes(p.tingkat) ? 'MTs'
                             : TINGKAT_MA.includes(p.tingkat) ? 'MA' : '') : '';
      if (!data.jenjang) data.jenjang = jenjangKelas;
      else if (!['MTs','MA'].includes(data.jenjang)) {
        masalah.push(`Jenjang "${data.jenjang}" tidak dikenal (isi MTs atau MA, atau kosongkan)`);
      } else if (jenjangKelas && data.jenjang !== jenjangKelas) {
        masalah.push(`Jenjang "${data.jenjang}" tidak cocok dengan kelas "${data.kelas}" (seharusnya ${jenjangKelas})`);
      }

      if (data.email_orang_tua && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(data.email_orang_tua)) {
        masalah.push(`Email "${data.email_orang_tua}" tidak berbentuk alamat surel`);
      }
      if (data.no_hp_orang_tua && !/^[0-9+()\-\s]{6,}$/.test(data.no_hp_orang_tua)) {
        masalah.push(`No. HP "${data.no_hp_orang_tua}" memuat karakter yang tidak lazim`);
      }
      if (!data.jenis_kelamin) data.jenis_kelamin = 'P';
      if (!data.status_santri) data.status_santri = 'Aktif';
      // Kolom kosong dikirim sebagai null, bukan string kosong.
      ['no_hp_orang_tua','email_orang_tua','asrama','jenjang'].forEach(k => {
        if (!data[k]) data[k] = null;
      });
    }

    if (jenis === 'pelanggaran') {
      if (data.kategori && !KATEGORI_PLG.includes(data.kategori)) {
        masalah.push(`Kategori "${data.kategori}" tidak dikenal (pilih ${KATEGORI_PLG.join(' / ')})`);
      }
      const poin = Number(String(data.bobot_poin).replace(',', '.'));
      if (data.bobot_poin !== '' && (!Number.isFinite(poin) || poin < 0 || !Number.isInteger(poin))) {
        masalah.push(`Bobot poin "${data.bobot_poin}" harus bilangan bulat tidak negatif`);
      } else data.bobot_poin = poin || 0;

      if (data.sumber && !['Pengasuhan','Madrasah'].includes(data.sumber)) {
        masalah.push(`Sumber "${data.sumber}" tidak dikenal (Pengasuhan atau Madrasah)`);
      }
      if (data.jenjang && !['Semua','MTs','MA'].includes(data.jenjang)) {
        masalah.push(`Jenjang "${data.jenjang}" tidak dikenal (Semua / MTs / MA)`);
      }
    }

    if (jenis === 'pembinaan') {
      if (data.kategori && !KATEGORI_BINA.includes(data.kategori)) {
        masalah.push(`Kategori "${data.kategori}" tidak dikenal (pilih ${KATEGORI_BINA.join(' / ')})`);
      }
      const ke = Number(data.pengulangan_ke);
      if (!Number.isInteger(ke) || ke < 1) {
        masalah.push(`Tahap ke- "${data.pengulangan_ke}" harus bilangan bulat mulai dari 1`);
      } else data.pengulangan_ke = ke;

      const ya = /^(ya|y|true|1|aktif)$/i.test(String(data.aktif ?? 'Ya'));
      data.aktif = ya;

      // Penjaga yang sama dengan indeks unik di database, tetapi
      // dilaporkan dalam bahasa manusia sebelum berkas dikirim.
      if (!masalah.length && data.aktif) {
        const kunci = `${data.kategori}|${data.pengulangan_ke}`;
        if (pasangan.has(kunci)) {
          masalah.push(`Tahap "${data.kategori} ke-${data.pengulangan_ke}" sudah ada pada baris ${pasangan.get(kunci)}`);
        } else pasangan.set(kunci, r.__baris);
        if (adaDb && adaDb.has(kunci)) {
          masalah.push(`Tahap "${data.kategori} ke-${data.pengulangan_ke}" sudah terdaftar di database untuk unit putri`);
        }
      }
      if (!data.keterangan) data.keterangan = '';
    }

    // 3. Bentrok kunci utama — di dalam berkas dan terhadap database
    if (skema.kunci) {
      const nilai = String(data[skema.kunci] ?? '');
      if (nilai) {
        if (terlihat.has(nilai)) {
          masalah.push(`${skema.kunci === 'nisn' ? 'NISN' : 'Kode'} "${nilai}" ganda — sudah dipakai baris ${terlihat.get(nilai)}`);
        } else terlihat.set(nilai, r.__baris);
        if (adaDb && adaDb.has(nilai)) {
          masalah.push(`${skema.kunci === 'nisn' ? 'NISN' : 'Kode'} "${nilai}" sudah ada di database`);
        }
      }
    }

    return { __baris: r.__baris, data, masalah };
  });
}

/** Kunci yang sudah dipakai di database, untuk mendeteksi bentrok. */
async function kunciTerpakai(jenis) {
  if (jenis === 'santri') {
    return new Set((await muatSiswa()).map(s => String(s.nisn)));
  }
  if (jenis === 'pelanggaran') {
    return new Set((await muatMaster()).map(m => String(m.kode_pelanggaran)));
  }
  // pembinaan: yang bentrok adalah pasangan (kategori, tahap) pada unit putri
  return new Set((await muatMasterPembinaan())
    .filter(a => unitMaster(a) === UNIT_PUTRI && a.aktif !== false)
    .map(a => `${String(a.kategori || '').trim()}|${Number(a.pengulangan_ke) || 0}`));
}

/* ---------- 19c-4. Templat berkas ------------------------------------ */

/**
 * Contoh isi templat. Sengaja memakai kelas dan kode yang benar-benar
 * sah menurut ketetapan dayah, supaya berkas templat yang diunduh lalu
 * langsung diunggah kembali LOLOS pemeriksaan tanpa satu pun suntingan.
 */
const CONTOH_CSV = {
  santri: [
    ['0071234501','Aisyah Nur Rahmah','VII-A','MTs','P','081234567890','wali.aisyah@contoh.id','Asrama Putri 1','Aktif'],
    ['0071234502','Khadijah Az-Zahra','VIII-B','MTs','P','081234567891','','Asrama Putri 1','Aktif'],
    ['0061234503','Fatimah Salsabila','X-A','MA','P','081234567892','wali.fatimah@contoh.id','Asrama Putri 2','Aktif']
  ],
  pelanggaran: [
    ['PI-001','Terlambat mengikuti halaqah pagi','Ringan','5','Musyrifah','Pengasuhan','Semua'],
    ['PI-002','Tidak mengenakan khimar sesuai ketentuan asrama','Ringan','5','Musyrifah','Pengasuhan','Semua'],
    ['PI-003','Keluar area asrama putri tanpa izin musyrifah','Sedang','10','Musyrifah','Pengasuhan','Semua'],
    ['PI-004','Membawa alat komunikasi ke dalam kamar','Berat','25','Musyrifah','Pengasuhan','Semua']
  ],
  pembinaan: [
    ['Ringan','1','Nasihat lisan oleh musyrifah kamar','Tahap pertama, dicatat di buku kamar','Ya'],
    ['Ringan','3','Istighfar dan hafalan tambahan','Diawasi musyrifah harian','Ya'],
    ['Sedang','1','Pemanggilan dan pembinaan oleh musyrifah asrama','Disertai surat pernyataan','Ya'],
    ['Berat','1','Pemanggilan wali santri oleh pimpinan asrama putri','Dihadiri musyrifah dan wali','Ya']
  ]
};

/** Unduh templat CSV satu jenis, lengkap dengan baris contoh. */
function unduhTemplatCsv(jenis) {
  const skema = SKEMA_CSV[jenis];
  unduhCsv(`templat-${jenis}-putri.csv`,
    [skema.kolom.map(k => k.k), ...(CONTOH_CSV[jenis] || [])]);
}

/* ---------- 19c-5. Antarmuka: kartu, pratinjau, pengiriman ----------- */

/** Kartu unggah pada halaman Master & Bidang. Hanya untuk Admin. */
function kartuUnggahCsv() {
  return `<div class="brankas brk-unggah" id="brkUnggah">
    <div class="brk-top">
      <span class="brk-ico"><i class="fa-solid fa-file-arrow-up"></i></span>
      <div class="eyebrow">
        <span class="ar">رفع البيانات</span><span class="rule"></span>
        <span class="lat">Unit Putri</span>
      </div>
    </div>
    <b class="brk-nm">Unggah Berkas CSV</b>
    <p class="brk-sub">Pengisian massal data asrama putri. Setiap berkas
       ditinjau lebih dahulu sebelum masuk database.</p>
    <div class="unggah-list">
      ${Object.entries(SKEMA_CSV).map(([jenis, s]) => `
        <div class="unggah-item">
          <span class="ui-ico"><i class="fa-solid ${s.ikon}"></i></span>
          <div class="ui-teks">
            <b>${esc(s.label)}</b>
            <small>Tabel <code>${esc(s.tabel)}</code> · ${s.kolom.filter(k => k.wajib).length} kolom wajib</small>
          </div>
          <div class="ui-aksi">
            <button type="button" class="btn btn-ghost btn-sm" data-templat="${jenis}"
              title="Unduh templat beserta contoh isian"><i class="fa-solid fa-download"></i>Templat</button>
            <button type="button" class="btn btn-onnavy btn-sm" data-unggah="${jenis}">
              <i class="fa-solid fa-file-csv"></i>Pilih Berkas</button>
          </div>
        </div>`).join('')}
    </div>
    <p class="hint" style="margin:10px 2px 0">
      Kolom <b>unit_gender</b> tidak perlu ada di berkas — sistem mengisinya
      <b>putri</b> secara otomatis pada saat pengiriman.</p>
    <input type="file" id="csvInput" accept=".csv,text/csv,text/plain" class="hidden">
  </div>`;
}

/** Status modul unggah selama satu sesi pemilihan berkas. */
const stUnggah = { jenis: null };

/** Pasang seluruh penangan pada kartu unggah. */
function pasangUnggahCsv() {
  const kartu = $('brkUnggah'); if (!kartu) return;
  const input = $('csvInput');

  kartu.addEventListener('click', (e) => {
    const t = e.target.closest('[data-templat]');
    if (t) return unduhTemplatCsv(t.dataset.templat);
    const u = e.target.closest('[data-unggah]');
    if (u) { stUnggah.jenis = u.dataset.unggah; input.value = ''; input.click(); }
  });

  input.addEventListener('change', async () => {
    const berkas = input.files?.[0]; input.value = '';
    if (!berkas || !stUnggah.jenis) return;
    try {
      const teks = await bacaBerkasTeks(berkas);
      await pratinjauCsv(stUnggah.jenis, berkas.name, teks);
    } catch (err) {
      toast('error', err.message || 'Berkas gagal dibaca.');
    }
  });
}

/** Baca berkas sebagai teks UTF-8. */
function bacaBerkasTeks(berkas) {
  return new Promise((selesai, gagal) => {
    if (berkas.size > 5 * 1024 * 1024) return gagal(new Error('Berkas melebihi 5 MB.'));
    const fr = new FileReader();
    fr.onerror = () => gagal(new Error('Berkas tidak dapat dibaca.'));
    fr.onload = () => selesai(String(fr.result || ''));
    fr.readAsText(berkas, 'UTF-8');
  });
}

/**
 * Tahap pratinjau — WAJIB dilewati sebelum data menyentuh database.
 * Tombol kirim baru hidup bila tidak ada satu pun baris bermasalah,
 * supaya tidak pernah ada pengiriman sebagian yang diam-diam.
 */
async function pratinjauCsv(jenis, namaBerkas, teks) {
  const skema = SKEMA_CSV[jenis];
  const { kolom, baris, pemisah } = uraiCsv(teks);

  if (!baris.length) {
    return Swal.fire({ icon:'warning', title:'Berkas kosong',
      text:'Tidak ada baris data yang terbaca setelah baris kepala.' });
  }

  const kurang = skema.kolom.filter(k => k.wajib && !kolom.includes(k.k));
  if (kurang.length) {
    return Swal.fire({ icon:'error', width:640, title:'Kolom wajib tidak ditemukan',
      html:`<p style="text-align:left">Baris kepala berkas <b>${esc(namaBerkas)}</b>
              tidak memuat kolom berikut:</p>
            <ul style="text-align:left">${kurang.map(k =>
              `<li><code>${esc(k.k)}</code> (${esc(k.judul)})</li>`).join('')}</ul>
            <p style="text-align:left">Kolom terbaca:
              <code>${esc(kolom.filter(Boolean).join(', ')) || '—'}</code>.
              Unduh templat untuk susunan kolom yang benar.</p>` });
  }

  const adaDb = await kunciTerpakai(jenis);
  const hasil = periksaCsv(jenis, baris, adaDb);
  const rusak = hasil.filter(h => h.masalah.length);
  const bersih = hasil.filter(h => !h.masalah.length);
  const tampil = skema.kolom.slice(0, 5);

  // Baris bermasalah diangkat ke atas: pada berkas 400 baris, tiga baris
  // rusak di tengah tabel praktis tak terlihat kalau urutannya dibiarkan.
  const urut = [...rusak, ...bersih];

  const tabel = `
    <div class="dft-wrap">
      <table class="dft-tbl"><thead><tr>
        <th style="width:58px">Baris</th>
        ${tampil.map(k => `<th>${esc(k.judul)}</th>`).join('')}
        <th>Status</th>
      </tr></thead><tbody>
      ${urut.map(h => `<tr class="${h.masalah.length ? 'baris-rusak' : ''}">
        <td class="secondary center">${h.__baris}</td>
        ${tampil.map(k => `<td>${esc(h.data[k.k] ?? '')}</td>`).join('')}
        <td>${h.masalah.length
          ? `<span class="tag tag-berat">Bermasalah</span>
             <div class="masalah-teks">${h.masalah.map(esc).join('<br>')}</div>`
          : '<span class="tag tag-ok">Siap</span>'}</td>
      </tr>`).join('')}
      </tbody></table>
    </div>`;

  const res = await Swal.fire({
    title: `Pratinjau — ${skema.label}`,
    width: 1040,
    showCancelButton: true,
    cancelButtonText: 'Batal',
    confirmButtonText: `Kirim ${angka(bersih.length)} baris ke database`,
    confirmButtonColor: '#14618B',
    showLoaderOnConfirm: true,
    allowOutsideClick: () => !Swal.isLoading(),
    html: `
      <div class="stack" style="text-align:left">
        <div class="pra-ring">
          <span class="tag tag-sea"><i class="fa-solid fa-file-csv"></i> ${esc(namaBerkas)}</span>
          <span class="tag tag-off">Pemisah: ${pemisah === '\t' ? 'Tab' : esc(pemisah)}</span>
          <span class="tag tag-ok">${angka(bersih.length)} siap</span>
          ${rusak.length ? `<span class="tag tag-berat">${angka(rusak.length)} bermasalah</span>` : ''}
          <span class="tag tag-violet">unit_gender = putri</span>
        </div>
        ${rusak.length ? `<div class="pra-peringatan">
          <i class="fa-solid fa-triangle-exclamation"></i>
          Selama masih ada baris bermasalah, tidak ada satu baris pun yang dikirim.
          Perbaiki berkas lalu unggah ulang.</div>` : ''}
        ${tabel}
      </div>`,
    didOpen: () => {
      const ok = Swal.getConfirmButton();
      if (!ok) return;
      if (rusak.length || !bersih.length) {
        ok.disabled = true;
        ok.textContent = rusak.length ? 'Perbaiki berkas terlebih dahulu' : 'Tidak ada baris untuk dikirim';
      }
    },
    preConfirm: async () => {
      try {
        const n = await kirimCsv(jenis, bersih.map(h => h.data));
        return n;
      } catch (err) {
        Swal.showValidationMessage(err.message || 'Pengiriman gagal.');
        return false;
      }
    }
  });

  if (res.isConfirmed && res.value) {
    toast('success', `${angka(res.value)} baris ${skema.label} tersimpan`);
    sync('done', 'Unggahan tersimpan');
  }
}

/**
 * Kirim baris yang sudah bersih ke Supabase.
 *
 * PILIHAN JALUR: client Supabase langsung, BUKAN RPC batch.
 *   1. Tidak ada satu pun RPC batch di database ini, jadi jalur RPC
 *      berarti membuat fungsi SECURITY DEFINER baru — menambah kode yang
 *      berjalan dengan hak penuh dan melewati RLS, padahal tidak ada
 *      yang perlu dilewati.
 *   2. RLS yang ada sudah tepat: `p_siswa_insert` (WITH CHECK is_admin())
 *      dan `p_mp_write` / `p_mpb_write` (ALL, is_admin()) sudah
 *      mengizinkan Admin menyisipkan baris ke ketiga tabel. Jalur biasa
 *      cukup, dan penolakan datang dari RLS — bukan dari pemeriksaan
 *      yang kita tulis sendiri.
 *   3. Trigger `rekam_audit` tetap mencatat setiap baris beserta
 *      pelakunya, persis seperti input manual. Jejak audit tidak hilang.
 *
 * KEUTUHAN: seluruh baris dikirim dalam SATU pernyataan INSERT selama
 * jumlahnya wajar, sehingga PostgREST membungkusnya dalam satu
 * transaksi — gagal berarti tidak ada satu baris pun yang masuk. Untuk
 * berkas sangat besar, pengiriman dipecah dan bila satu potongan gagal,
 * jumlah baris yang TERLANJUR masuk dilaporkan apa adanya.
 */
const CSV_MAKS_SEKALI = 500;

async function kirimCsv(jenis, rows) {
  const skema = SKEMA_CSV[jenis];
  if (!rows.length) throw new Error('Tidak ada baris untuk dikirim.');

  sync('save', 'Mengirim berkas…');

  if (rows.length <= CSV_MAKS_SEKALI) {
    const { error } = await db.from(skema.tabel).insert(rows);
    if (error) throw new Error(pesanKirim(error));
    segarkanSetelahUnggah(jenis);
    return rows.length;
  }

  let masuk = 0;
  for (let i = 0; i < rows.length; i += CSV_MAKS_SEKALI) {
    const potong = rows.slice(i, i + CSV_MAKS_SEKALI);
    const { error } = await db.from(skema.tabel).insert(potong);
    if (error) {
      segarkanSetelahUnggah(jenis);
      throw new Error(`${pesanKirim(error)} — ${angka(masuk)} baris sudah masuk sebelum kegagalan `
        + `(baris berkas 2–${masuk + 1}). Hapus baris yang sudah masuk dari berkas sebelum mengulang.`);
    }
    masuk += potong.length;
  }
  segarkanSetelahUnggah(jenis);
  return masuk;
}

/** Terjemahkan galat Postgres menjadi kalimat yang bisa ditindaklanjuti. */
function pesanKirim(error) {
  const m = String(error?.message || 'Galat tidak dikenal');
  if (/duplicate key|already exists/i.test(m)) {
    return 'Ditolak database: ada kunci yang sudah terpakai. '
      + 'Kemungkinan data sudah diunggah sebelumnya.';
  }
  if (/violates row-level security|permission denied/i.test(m)) {
    return 'Ditolak database: hanya Admin yang boleh mengisi tabel ini.';
  }
  if (/violates check constraint/i.test(m)) {
    return `Ditolak database: nilai kolom di luar yang diizinkan (${m}).`;
  }
  if (/column .* does not exist/i.test(m)) {
    return 'Ditolak database: kolom unit_gender belum ada. '
      + 'Jalankan migration v2.10 terlebih dahulu.';
  }
  return `Ditolak database: ${m}`;
}

/** Bersihkan singgahan agar data baru langsung terlihat. */
function segarkanSetelahUnggah(jenis) {
  if (jenis === 'santri') cacheHapus('siswa', 'petaSiswa', 'kelas', 'detail');
  if (jenis === 'pelanggaran') cacheHapus('master');
  if (jenis === 'pembinaan') cacheHapus('aturanBina');
}


async function viewMaster() {
  if (!bolehMaster()) { $('viewRoot').innerHTML = kosong('Akses dibatasi.',
    `Role ${role()} tidak memiliki akses ke Master Pelanggaran.`, 'fa-lock'); return; }

  cacheHapus('master','bidang','masterPrestasi');
  const [master, bidang, prestasi, identitas] = await Promise.all([
    muatMaster(), muatBidang(), muatMasterPrestasi(),
    isAdmin() ? muatIdentitasDayah() : Promise.resolve({})
  ]);

  $('viewRoot').innerHTML = `
    <div class="brankas-grid" id="brankasGrid">
      <div id="brkMaster">${kartuBrankasMaster(master)}</div>
      <div id="brkBidang">${kartuBrankasBidang(bidang)}</div>
      <div id="brkPrestasi">${kartuBrankasPrestasi(prestasi)}</div>
      ${isAdmin() ? `<div id="brkUnggahWrap">${kartuUnggahCsv()}</div>` : ''}
    </div>
    ${isAdmin() ? kartuIdentitasDayah(identitas) : ''}`;

  onKlik(async (e) => {
    if (e.target.closest('#brkAddMaster')) return tambahLaluBukaMaster();
    if (e.target.closest('#brkAddBidang')) return tambahLaluBukaBidang();
    if (e.target.closest('#brkAddPrestasi')) return modalMasterPrestasi(null);
    if (e.target.closest('#brkMaster .brankas')) return bukaDaftarMaster();
    if (e.target.closest('#brkBidang .brankas')) return bukaDaftarBidang();
    if (e.target.closest('#brkPrestasi .brankas')) return bukaDaftarPrestasi();
  });

  if (isAdmin()) { pasangIdentitasDayah(); pasangUnggahCsv(); }
}

/* =====================================================================
 * BRANKAS REFERENSI — ringkasan padat, daftar lengkap dibuka di jendela
 * =====================================================================
 * Master pelanggaran bisa berisi ratusan baris. Menampilkannya langsung
 * di halaman memaksa pengguna menggulir jauh hanya untuk mencapai kartu
 * berikutnya, jadi halaman hanya memuat ringkasan yang bisa dibaca
 * sekilas; daftar utuh (beserta pencarian & penyaring) dibuka sebagai
 * jendela bertumpuk yang bergulir di dalam dirinya sendiri.
 * ===================================================================== */

/** Kartu ringkas Master Pelanggaran: jumlah jenis + sebaran kategori. */
function kartuBrankasMaster(list) {
  const rows = lingkupMaster(list || []);
  const n = (k) => rows.filter(m => m.kategori === k).length;
  const poin = rows.reduce((a, m) => a + (Number(m.bobot_poin) || 0), 0);
  const bidangUnik = new Set(rows.map(m => m.bidang).filter(Boolean)).size;
  return `<button type="button" class="brankas" title="Klik untuk membuka daftar lengkap">
    <div class="brk-top">
      <span class="brk-ico"><i class="fa-solid fa-scale-balanced"></i></span>
      <div class="eyebrow">
        <span class="ar">قائمة المخالفات</span><span class="rule"></span>
        <span class="lat">Referensi</span>
      </div>
    </div>
    <b class="brk-nm">Master Pelanggaran</b>
    <p class="brk-sub">Unit aktif: ${esc(labelKonteks())}</p>
    <div class="brk-angka">
      <span class="brk-v">${angka(rows.length)}</span>
      <span class="brk-k">jenis pelanggaran</span>
    </div>
    <div class="brk-chips">
      <span class="tag tag-ringan">Ringan ${angka(n('Ringan'))}</span>
      <span class="tag tag-sedang">Sedang ${angka(n('Sedang'))}</span>
      <span class="tag tag-berat">Berat ${angka(n('Berat'))}</span>
      <span class="tag tag-sea">${angka(bidangUnik)} bidang</span>
      <span class="tag tag-off">${angka(poin)} total poin</span>
    </div>
    <span class="brk-go">
      <i class="fa-solid fa-list-ul"></i>Buka daftar lengkap
      <i class="fa-solid fa-arrow-right brk-arrow"></i>
    </span>
    ${isAdmin() ? `<span class="brk-add" id="brkAddMaster" role="button" tabindex="0"
        title="Tambah jenis pelanggaran"><i class="fa-solid fa-plus"></i>Tambah</span>` : ''}
  </button>`;
}

/** Kartu ringkas Master Bidang: jumlah bidang aktif & nonaktif. */
function kartuBrankasBidang(list) {
  const rows = lingkupBidang(list || []);
  const aktif = rows.filter(b => String(b.aktif ?? 'Ya').toLowerCase() !== 'tidak').length;
  const contoh = rows.slice(0, 4).map(b => b.nama_bidang).filter(Boolean);
  return `<button type="button" class="brankas alt" title="Klik untuk membuka daftar lengkap">
    <div class="brk-top">
      <span class="brk-ico"><i class="fa-solid fa-diagram-project"></i></span>
      <div class="eyebrow">
        <span class="ar">الأقسام</span><span class="rule"></span>
        <span class="lat">Divisi</span>
      </div>
    </div>
    <b class="brk-nm">Master Bidang</b>
    <p class="brk-sub">Dasar pengelompokan seluruh laporan per divisi.</p>
    <div class="brk-angka">
      <span class="brk-v">${angka(rows.length)}</span>
      <span class="brk-k">bidang terdaftar</span>
    </div>
    <div class="brk-chips">
      <span class="tag tag-ok">Aktif ${angka(aktif)}</span>
      <span class="tag tag-off">Nonaktif ${angka(rows.length - aktif)}</span>
      ${contoh.map(c => `<span class="tag tag-sea">${esc(c)}</span>`).join('')}
    </div>
    <span class="brk-go">
      <i class="fa-solid fa-list-ul"></i>Buka daftar lengkap
      <i class="fa-solid fa-arrow-right brk-arrow"></i>
    </span>
    ${isAdmin() ? `<span class="brk-add" id="brkAddBidang" role="button" tabindex="0"
        title="Tambah bidang"><i class="fa-solid fa-plus"></i>Tambah</span>` : ''}
  </button>`;
}

/** Bidang mengikuti unit operasional aktif, sama seperti lingkupMaster. */
function lingkupBidang(list) {
  let rows = list || [];
  if (APP.ctx.unit !== 'Semua') rows = rows.filter(b => String(b.sumber || '') === APP.ctx.unit);
  return rows;
}

/** Segarkan kedua kartu ringkas setelah ada perubahan data. */
async function perbaruiBrankas() {
  const m = $('brkMaster'), b = $('brkBidang');
  if (m) m.innerHTML = kartuBrankasMaster(await muatMaster());
  if (b) b.innerHTML = kartuBrankasBidang(await muatBidang());
}

/* ---------- Jendela daftar Master Pelanggaran ---------- */
async function bukaDaftarMaster() {
  await Swal.fire({
    title: 'Master Pelanggaran',
    width: 1060,
    showConfirmButton: false,
    showCloseButton: true,
    customClass: { popup: 'dft-popup' },
    html: `<div class="dft">
      <div class="dft-bar">
        <input id="msCari" class="input grow" autocomplete="off"
               placeholder="Cari kode, nama, kategori, atau bidang…" value="${esc(stMaster.cari)}">
        <span class="tag tag-off" id="msCount">—</span>
        ${isAdmin() ? `<button class="btn btn-primary btn-sm" id="btnAddMaster">
          <i class="fa-solid fa-plus"></i>Tambah Jenis</button>` : ''}
      </div>
      <div class="dft-chips" id="msChips">
        ${['Semua','Ringan','Sedang','Berat'].map(k =>
          `<button class="chip${stMaster.kategori === k ? ' on' : ''}" data-kat="${k}">${k}</button>`).join('')}
        <span class="dft-note"><i class="fa-solid fa-circle-info"></i>
          Unit aktif: ${esc(labelKonteks())}</span>
      </div>
      <div class="dft-wrap"><table class="dft-tbl">
        <thead><tr><th>Kode</th><th>Nama Pelanggaran</th><th>Kategori</th><th class="center">Bobot</th>
          <th>Sumber</th><th>Bidang</th><th>Jenjang</th><th class="right">Aksi</th></tr></thead>
        <tbody id="tbMaster"></tbody>
      </table></div>
    </div>`,
    didOpen: () => {
      gambarMaster();
      $('msCari')?.addEventListener('input', debounce(e => {
        stMaster.cari = e.target.value.trim(); gambarMaster();
      }, 200));
      $('msChips')?.addEventListener('click', (e) => {
        const c = e.target.closest('[data-kat]'); if (!c) return;
        stMaster.kategori = c.dataset.kat;
        $('msChips').querySelectorAll('.chip').forEach(x => x.classList.toggle('on', x === c));
        gambarMaster();
      });
      $('btnAddMaster')?.addEventListener('click', () => tambahLaluBukaMaster());
      Swal.getHtmlContainer()?.addEventListener('click', async (e) => {
        const t = e.target.closest('[data-master]'); if (!t) return;
        const item = (await muatMaster()).find(x => x.kode_pelanggaran === t.dataset.master);
        Swal.close();
        await modalMaster(item);
        await perbaruiBrankas();
        bukaDaftarMaster();
      });
    }
  });
}

/** Tambah jenis dari dalam jendela daftar, lalu daftar dibuka kembali. */
async function tambahLaluBukaMaster() {
  const dariDaftar = !!$('tbMaster');
  if (dariDaftar) Swal.close();
  await modalMaster(null);
  await perbaruiBrankas();
  bukaDaftarMaster();
}

/* ---------- Jendela daftar Master Bidang ---------- */
async function bukaDaftarBidang() {
  await Swal.fire({
    title: 'Master Bidang',
    width: 940,
    showConfirmButton: false,
    showCloseButton: true,
    customClass: { popup: 'dft-popup' },
    html: `<div class="dft">
      <div class="dft-bar">
        <input id="bdCari" class="input grow" autocomplete="off"
               placeholder="Cari nama bidang, deskripsi, atau kata kunci…" value="${esc(stMsBidang.cari)}">
        <span class="tag tag-off" id="bdCount">—</span>
        ${isAdmin() ? `<button class="btn btn-primary btn-sm" id="btnAddBidang">
          <i class="fa-solid fa-plus"></i>Tambah Bidang</button>` : ''}
      </div>
      <div class="dft-chips" id="bdChips">
        ${['Semua','Aktif','Nonaktif'].map(k =>
          `<button class="chip${stMsBidang.status === k ? ' on' : ''}" data-st="${k}">${k}</button>`).join('')}
        <span class="dft-note"><i class="fa-solid fa-circle-info"></i>
          Nama, kata kunci, dan status dapat diubah tanpa menyentuh kode aplikasi.</span>
      </div>
      <div class="dft-wrap"><table class="dft-tbl">
        <thead><tr><th>Bidang</th><th>Deskripsi</th><th>Kata Kunci</th><th>Sumber</th>
          <th>Jenjang</th><th>Status</th><th class="right">Aksi</th></tr></thead>
        <tbody id="tbBidang"></tbody>
      </table></div>
    </div>`,
    didOpen: async () => {
      gambarBidang(await muatBidang());
      $('bdCari')?.addEventListener('input', debounce(async e => {
        stMsBidang.cari = e.target.value.trim(); gambarBidang(await muatBidang());
      }, 200));
      $('bdChips')?.addEventListener('click', async (e) => {
        const c = e.target.closest('[data-st]'); if (!c) return;
        stMsBidang.status = c.dataset.st;
        $('bdChips').querySelectorAll('.chip').forEach(x => x.classList.toggle('on', x === c));
        gambarBidang(await muatBidang());
      });
      $('btnAddBidang')?.addEventListener('click', () => tambahLaluBukaBidang());
      Swal.getHtmlContainer()?.addEventListener('click', async (e) => {
        const t = e.target.closest('[data-bidang]'); if (!t) return;
        const item = (await muatBidang()).find(x => String(x.id_bidang) === t.dataset.bidang);
        Swal.close();
        await modalBidang(item);
        await perbaruiBrankas();
        bukaDaftarBidang();
      });
    }
  });
}

async function tambahLaluBukaBidang() {
  const dariDaftar = !!$('tbBidang');
  if (dariDaftar) Swal.close();
  await modalBidang(null);
  await perbaruiBrankas();
  bukaDaftarBidang();
}

/** Kartu "Identitas Dayah" — logo & foto latar layar login, khusus Admin. */
function kartuIdentitasDayah(identitas) {
  const frame = (id, label, url, hint) => `
    <div class="idn-item">
      <span class="lbl">${esc(label)}</span>
      <div class="idn-frame${url ? ' filled' : ''}" id="${id}" title="Klik untuk unggah / ganti">
        ${url
          ? `<img src="${esc(url)}" alt="${esc(label)}">`
          : `<div class="idn-empty"><i class="fa-solid fa-image"></i>Belum ada berkas</div>`}
        <div class="idn-over"><i class="fa-solid fa-camera"></i>Ganti ${esc(label)}</div>
      </div>
      <small>${esc(hint)}</small>
    </div>`;
  return kartu('Identitas Dayah', `
    <div class="card-note"><i class="fa-solid fa-circle-info"></i>
      Logo dan foto latar ini tampil di bilah profil atas dan layar login, dan
      langsung berubah begitu berkas terunggah. Pintasan cepat: tombol
      <b>Identitas</b> di bilah profil paling atas.</div>
    <div class="idn-grid">
      ${frame('idnLogo', 'Logo Dayah', identitas?.identitas_logo,
        'Disarankan gambar persegi, latar transparan (PNG).')}
      ${frame('idnLatar', 'Foto Latar Login', identitas?.identitas_latar,
        'Disarankan foto lanskap beresolusi tinggi (JPG/WEBP).')}
    </div>
    <input type="file" id="idnInput" accept="image/png,image/jpeg,image/webp" class="hidden">`,
    '', 'Tampil di layar login — hanya Admin yang dapat mengubah');
}

/** Klik salah satu bingkai Identitas Dayah → pilih berkas → unggah sebagai identitas global. */
function pasangIdentitasDayah() {
  const inp = $('idnInput'); if (!inp) return;
  let target = null;
  const buka = (kategori, el) => { target = { kategori, el }; inp.click(); };
  $('idnLogo')?.addEventListener('click', () => buka('identitas_logo', $('idnLogo')));
  $('idnLatar')?.addEventListener('click', () => buka('identitas_latar', $('idnLatar')));
  inp.addEventListener('change', async () => {
    const file = inp.files?.[0]; inp.value = '';
    if (!file || !target) return;
    const { el, kategori } = target;
    sync('saving', 'Mengunggah identitas…');
    try {
      const { data: authUser } = await db.auth.getUser();
      const url = await unggahFoto(kategori, authUser?.user?.id, file, { global: true });
      el.classList.add('filled');
      el.innerHTML = `<img src="${esc(url)}" alt="">
        <div class="idn-over"><i class="fa-solid fa-camera"></i>Ganti</div>`;
      APP.identitas = { ...(APP.identitas || {}), [kategori]: url };
      terapkanIdentitasVisual(APP.identitas);
      sync('done', 'Identitas dayah diperbarui');
      toast('success', 'Tersimpan — bilah profil & layar login langsung diperbarui');
    } catch (e) {
      sync('warn', 'Gagal mengunggah');
      fireError(e);
    }
  });
}

async function gambarMaster() {
  const tb = $('tbMaster');
  if (!tb) return;                       // jendela daftar sedang tertutup
  let dasar = lingkupMaster(await muatMaster());
  if (stMaster.kategori !== 'Semua') dasar = dasar.filter(m => m.kategori === stMaster.kategori);
  const rows = cariLokal(dasar, stMaster.cari,
    ['kode_pelanggaran','nama_pelanggaran','kategori','bidang','sumber','jenjang'], 999);
  const cnt = $('msCount');
  if (cnt) cnt.textContent = `${angka(rows.length)} jenis`;
  tb.innerHTML = rows.map(m => `<tr>
    <td class="secondary nowrap">${esc(m.kode_pelanggaran)}</td>
    <td><div class="primary">${esc(m.nama_pelanggaran)}</div></td>
    <td><span class="tag ${tagKategori(m.kategori)}">${esc(m.kategori)}</span></td>
    <td class="num center">${m.bobot_poin}</td>
    <td>${esc(m.sumber||'-')}<br>
      <span class="tag ${unitMaster(m) === UNIT_PUTRI ? 'tag-violet' : 'tag-off'}">${
        unitMaster(m) === UNIT_PUTRI ? 'Putri' : 'Putra'}</span></td>
    <td><span class="tag tag-sea">${esc(m.bidang||'Belum Dipetakan')}</span></td>
    <td>${esc(m.jenjang||'Semua')}</td>
    <td class="right">${isAdmin()
      ? `<button class="btn-link" data-master="${esc(m.kode_pelanggaran)}"><i class="fa-solid fa-pen-to-square"></i> Ubah</button>`
      : '<span class="tag tag-off">Hanya baca</span>'}</td>
  </tr>`).join('') || barisKosong(8, 'Tidak ada jenis yang cocok.', 'Ubah kata kunci, kategori, atau unit aktif.');
}

function gambarBidang(list) {
  const tb = $('tbBidang');
  if (!tb) return;                       // jendela daftar sedang tertutup
  let rows = lingkupBidang(list);
  if (stMsBidang.status !== 'Semua') {
    const mauAktif = stMsBidang.status === 'Aktif';
    rows = rows.filter(b => (String(b.aktif ?? 'Ya').toLowerCase() !== 'tidak') === mauAktif);
  }
  rows = cariLokal(rows, stMsBidang.cari,
    ['nama_bidang','deskripsi','kata_kunci','sumber','jenjang'], 999);
  const cnt = $('bdCount');
  if (cnt) cnt.textContent = `${angka(rows.length)} bidang`;
  tb.innerHTML = rows.map(b => {
    const aktif = String(b.aktif ?? 'Ya').toLowerCase() !== 'tidak';
    return `<tr>
      <td><div class="primary">${esc(b.nama_bidang||'-')}</div></td>
      <td style="font-size:12.5px;color:var(--text-2);max-width:280px">${esc(b.deskripsi||'-')}</td>
      <td class="secondary">${esc(b.kata_kunci||'-')}</td>
      <td>${esc(b.sumber||'-')}</td>
      <td>${esc(b.jenjang||'Semua')}</td>
      <td><span class="tag ${aktif?'tag-ok':'tag-off'}">${aktif?'Aktif':'Nonaktif'}</span></td>
      <td class="right">${isAdmin()
        ? `<button class="btn-link" data-bidang="${esc(b.id_bidang||'')}"><i class="fa-solid fa-pen-to-square"></i> Ubah</button>`
        : '<span class="tag tag-off">Hanya baca</span>'}</td>
    </tr>`;
  }).join('') || barisKosong(7, 'Tidak ada bidang yang cocok.', 'Ubah kata kunci atau penyaring status.');
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
      <div class="field"><label class="label">Unit Asrama</label>
        <select id="mUnit" class="input">${
          [[UNIT_PUTRA,'Asrama Putra'],[UNIT_PUTRI,'Asrama Putri']]
            .map(([v,t]) => `<option value="${v}" ${
              v === (normalUnit(m.unit_gender) || unitAktif() || UNIT_PUTRA) ? 'selected' : ''
            }>${t}</option>`).join('')}</select>
        <p class="hint">Katalog putra dan putri berdiri sendiri. Kode pelanggaran
           tidak boleh sama antar unit karena kode adalah kunci utama tabel.</p></div>
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
        jenjang: $('mJenjang').value,
        unit_gender: $('mUnit').value
      };
      if (!payload.kode_pelanggaran || !payload.nama_pelanggaran) {
        Swal.showValidationMessage('Kode dan nama pelanggaran wajib diisi.'); return false;
      }
      if (!payload.bidang) { Swal.showValidationMessage('Bidang wajib dipilih.'); return false; }
      // v2.10 — urutan pemasangan tidak boleh menjadi jebakan. Bila
      // berkas ini sudah dipasang tetapi migration belum dijalankan,
      // kolom unit_gender belum ada dan database akan menolak seluruh
      // penyimpanan. Daripada menggagalkan pekerjaan Admin, kirim ulang
      // tanpa kolom itu dan beri tahu apa yang belum lengkap.
      const simpan = async (isi) => ubah
        ? db.from('master_pelanggaran').update(isi).eq('kode_pelanggaran', isi.kode_pelanggaran)
        : db.from('master_pelanggaran').insert(isi);

      let { error } = await simpan(payload);
      if (error && /unit_gender/.test(error.message || '')
                && /does not exist|schema cache/i.test(error.message || '')) {
        const { unit_gender, ...tanpaUnit } = payload;
        ({ error } = await simpan(tanpaUnit));
        if (!error) toast('info', 'Tersimpan tanpa penanda unit — migration v2.10 belum dijalankan.');
      }
      if (error) { Swal.showValidationMessage(error.message); return false; }
      return true;
    }
  });
  if (res.isConfirmed) {
    cacheHapus('master');
    sync('done', 'Master tersimpan');
    toast('success', ubah ? 'Jenis pelanggaran diperbarui' : 'Jenis pelanggaran ditambahkan');
    gambarMaster();
    perbaruiBrankas();
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
    perbaruiBrankas();
  }
}

// ---------------------------------------------------------------------
// 19. MANAJEMEN PENGGUNA
// ---------------------------------------------------------------------
let PENGGUNA_DATA = [];

async function viewPengguna() {
  const { data } = await q(db.from('profiles').select('*').order('nama'), 'profiles');
  PENGGUNA_DATA = data || [];

  // Foto guru/pengguna lain — satu query untuk semua baris sekaligus
  // (lihat muatFotoBanyak di modul FOTO PROFIL & IDENTITAS DAYAH).
  const petaFoto = await muatFotoBanyak('profil_guru', PENGGUNA_DATA.map(u => u.id));
  PENGGUNA_DATA.forEach(u => { u._foto = petaFoto[u.id] || ''; });

  $('viewRoot').innerHTML = kartu('Manajemen Pengguna', `
    <div class="card-note"><i class="fa-solid fa-circle-info"></i>
      Akun baru dibuat di <b>Dashboard Supabase &gt; Authentication &gt; Users</b>,
      lalu peran, kelas binaan, cakupan unit, dan foto profilnya diatur di sini.</div>
    <div class="pgu-list" id="pguList"></div>`,
    '', `${angka(PENGGUNA_DATA.length)} akun terdaftar`);

  gambarPengguna();

  onKlik(async (e) => {
    const b = e.target.closest('[data-edit]'); if (!b) return;
    const u = PENGGUNA_DATA.find(x => x.id === b.dataset.edit);
    if (u) await modalPengguna(u);
  });
}

function gambarPengguna() {
  const wrap = $('pguList'); if (!wrap) return;
  wrap.innerHTML = PENGGUNA_DATA.map(u => `
    <div class="pgu-card">
      <div class="pgu-av${u.aktif ? '' : ' nonaktif'}" data-uid="${esc(u.id)}">
        ${u._foto
          ? `<img src="${esc(u._foto)}" alt="${esc(u.nama)}"
               data-fallback-nama="${esc(u.nama)}" data-fallback-role="${esc(u.role)}">`
          : esc(getInitialsFromName(u.nama))}
      </div>
      <div class="pgu-body">
        <div class="pgu-top">
          <span class="pgu-nama">${esc(u.nama)}</span>
          <span class="tag ${u.role==='Admin'?'tag-ok':u.role==='Pimpinan'?'tag-violet':'tag-sea'}">${esc(u.role)}</span>
          <span class="tag ${u.aktif?'tag-ok':'tag-off'}">${u.aktif?'Aktif':'Nonaktif'}</span>
        </div>
        <div class="pgu-meta">
          <span class="pgu-user"><i class="fa-solid fa-at"></i> ${esc(u.username)}</span>
          ${(u.kelas_binaan||[]).length ? `<span><i class="fa-solid fa-chalkboard"></i> ${esc((u.kelas_binaan||[]).join(', '))}</span>` : ''}
          <span><i class="fa-solid fa-layer-group"></i> ${esc(u.unit_akses||'Semua')}${u.jenjang_akses && u.jenjang_akses!=='Semua' ? ' · '+esc(u.jenjang_akses) : ''}</span>
          ${u.korps ? `<span><i class="fa-solid fa-shield-halved"></i> ${esc(u.korps)}</span>` : ''}
        </div>
      </div>
      <div class="pgu-acts">
        <button class="btn-link" data-edit="${esc(u.id)}"><i class="fa-solid fa-pen-to-square"></i> Ubah</button>
      </div>
    </div>`).join('') || kosong('Belum ada pengguna.', 'Buat akun terlebih dahulu di dashboard Supabase.', 'fa-users');
  pasangFallbackFoto(wrap);
}

async function modalPengguna(u) {
  const res = await Swal.fire({
    title:'Ubah Pengguna', width: 560, showCancelButton:true,
    confirmButtonText:'Simpan', cancelButtonText:'Batal', confirmButtonColor:'#14618B',
    showLoaderOnConfirm:true, allowOutsideClick:() => !Swal.isLoading(),
    html:`<div class="stack">
      <div class="fu-wrap">
        <div class="fu-preview" id="fuPrev" title="Klik untuk ganti foto">
          ${u._foto ? `<img src="${esc(u._foto)}" alt="">` : esc(getInitialsFromName(u.nama))}
          <span class="fu-cam"><i class="fa-solid fa-camera"></i></span>
        </div>
        <div class="fu-info">
          <b>Foto Profil</b>
          <small>Klik gambar untuk mengganti. JPG/PNG/WEBP, maksimal ${FOTO_MAKS_MB}MB.</small>
          <div class="fu-status" id="fuStat"></div>
        </div>
        <input type="file" id="fuInput" accept="image/png,image/jpeg,image/webp" class="hidden">
      </div>
      <div class="field"><label class="label">Nama</label>
        <input id="uNama" class="input" value="${esc(u.nama)}"></div>
      <div class="field"><label class="label">Peran</label>
        <select id="uRole" class="input">${SEMUA_ROLE
          .map(r => `<option ${r===u.role?'selected':''}>${r}</option>`).join('')}</select>
        <p class="hint">Guru, Guru BK, dan Walas wajib memiliki kelas binaan.</p></div>
      <div class="field"><label class="label">Kelas Binaan (pisahkan koma)</label>
        <input id="uKelas" class="input" value="${esc((u.kelas_binaan||[]).join(', '))}" placeholder="X-A, X-B"></div>
      <div class="field"><label class="label">Korps</label>
        <select id="uKorps" class="input">${(() => {
          // Daftar baku + nilai yang sedang tersimpan bila belum terdaftar.
          // Tanpa penambahan itu, akun ber-korps 'Musyrif Asrama Putri'
          // (ejaan lama yang sudah ada di database) akan terhapus diam-diam
          // begitu Admin menekan Simpan tanpa menyentuh kolom ini.
          const baku = ['', 'Musyrif Asrama Putra', 'Musyrifah Asrama Putri',
                        'Osis Putra', 'Osis Putri'];
          const kini = u.korps || '';
          const opsi = baku.includes(kini) ? baku : [...baku, kini];
          return opsi.map(x => `<option value="${esc(x)}" ${x === kini ? 'selected' : ''}>${
            x || '— Tidak tergabung —'}</option>`).join('');
        })()}</select>
        <p class="hint">Menentukan lambang korps pada bilah profil, layar masuk,
           dan lembar cetak. Untuk akun <b>tanpa kelas binaan</b> — misalnya Osis —
           nilai ini juga mengunci unit asrama yang boleh dilihat, karena Osis putra
           dan Osis putri punya struktur sendiri. Akun yang sudah punya kelas binaan
           selalu mengikuti unit kelasnya, bukan korps.</p></div>
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
    didOpen: () => {
      const prev = $('fuPrev'), inp = $('fuInput'), stat = $('fuStat');
      prev.addEventListener('click', () => inp.click());
      inp.addEventListener('change', async () => {
        const file = inp.files?.[0]; inp.value = '';
        if (!file) return;
        stat.className = 'fu-status busy'; stat.textContent = 'Mengunggah…';
        try {
          const url = await unggahFoto('profil_guru', u.id, file);
          u._foto = url;
          prev.innerHTML = `<img src="${esc(url)}" alt=""><span class="fu-cam"><i class="fa-solid fa-camera"></i></span>`;
          stat.className = 'fu-status ok'; stat.textContent = 'Foto tersimpan.';
          const kartuAv = document.querySelector(`.pgu-av[data-uid="${u.id}"]`);
          if (kartuAv) kartuAv.innerHTML = `<img src="${esc(url)}" alt="${esc(u.nama)}">`;
        } catch (e) {
          stat.className = 'fu-status err'; stat.textContent = e.message || 'Gagal mengunggah.';
        }
      });
    },
    preConfirm: async () => {
      const peran = $('uRole').value;
      const kelas = $('uKelas').value.split(',').map(x => x.trim()).filter(Boolean);
      if (['Guru','Guru BK','Walas'].includes(peran) && !kelas.length) {
        Swal.showValidationMessage(`${peran} wajib memiliki minimal satu kelas binaan.`); return false;
      }
      const { error } = await db.from('profiles').update({
        nama: $('uNama').value.trim(), role: peran, kelas_binaan: kelas,
        unit_akses: $('uUnit').value, jenjang_akses: $('uJenjang').value,
        korps: $('uKorps').value || null,
        aktif: $('uAktif').value === 'true'
      }).eq('id', u.id);
      if (error) { Swal.showValidationMessage(error.message); return false; }
      return true;
    }
  });
  if (res.isConfirmed) { sync('done','Pengguna diperbarui'); toast('success','Pengguna diperbarui'); viewPengguna(); }
}

// ---------------------------------------------------------------------
// 20. LAPORAN TERPADU: CETAK & UNDUH PDF  (revisi v2)
//     Seluruh laporan santri MENGIKUTI PERIODE AKTIF:
//       - Pelanggaran  : hanya bulan terpilih
//       - Pembinaan    : hanya bulan terpilih
//       - Perizinan    : seluruh izin yang rentangnya bersinggungan
//       - Presensi     : TIDAK disaring (rekap penuh dari backend)
//       - Rekap & poin : dihitung ulang dari pelanggaran bulan tersebut
//
//     Perubahan v2 dibanding versi sebelumnya:
//       Bagian 2 : akumulasi UNIK per (kategori + catatan). Tidak ada
//                  kaskade 5x Ringan -> 1 Sedang. kaskadeKonversi() tetap
//                  hidup dan tetap dipakai modul Rekap (§14) & Pengasuhan (§25).
//       Bagian 3 : diurutkan kategori (Ringan -> Sedang -> Berat) lalu
//                  tanggal ascending; kolom KETERANGAN diganti BENTUK
//                  PEMBINAAN; baris yang melewati batas modul instrumen
//                  ditandai "Sudah melebihi modul Instrumen".
//       Bagian 5 : "Instrumen Pembinaan" diganti "Kesimpulan Sementara"
//                  (konteks jenjang & angkatan, tier, box catatan manual).
//
//     Batas modul instrumen dibaca dari master_pembinaan:
//       maxFrequency  = MAX(pengulangan_ke) per kategori
//       daftar bentuk = bentuk_pembinaan per pengulangan_ke
//     Tidak ada tabel baru dan tidak ada RPC baru.
// ---------------------------------------------------------------------

const NA_DATA  = 'Data tidak tersedia';
const URUT_KAT = { Ringan: 1, Sedang: 2, Berat: 3 };
const kunciTeks = (s) => String(s ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

// ---------- 20a. Master instrumen (dari master_pembinaan) -------------

async function muatMasterPembinaan() {
  try {
    return cacheGet('aturanBina') || cacheSet('aturanBina',
      await ambilSemua('master_pembinaan', '*', { order: 'kategori' }));
  } catch (e) {
    console.warn('master_pembinaan tidak terbaca:', e.message);
    return cacheSet('aturanBina', []);
  }
}

/**
 * Peta instrumen per kategori.
 *   max    : pengulangan_ke tertinggi yang terdaftar (= maxFrequency)
 *   bentuk : Map(pengulangan_ke -> bentuk_pembinaan) dari aturan AKTIF saja
 *
 * Catatan: `max` sengaja TIDAK memfilter kolom `aktif`. Menonaktifkan satu
 * aturan sementara tidak boleh menurunkan batas modul, karena itu akan
 * membuat santri lama mendadak tercetak "melebihi modul".
 */
function petaInstrumen(rows) {
  const peta = new Map();
  (rows || []).forEach(r => {
    const kat = String(r.kategori || '').trim();
    const n = Number(r.pengulangan_ke) || 0;
    if (!kat || n < 1) return;
    if (!peta.has(kat)) peta.set(kat, { max: 0, bentuk: new Map() });
    const o = peta.get(kat);
    o.max = Math.max(o.max, n);
    if (r.aktif !== false) o.bentuk.set(n, r.bentuk_pembinaan || '-');
  });
  return peta;
}

/**
 * Peta instrumen TERPISAH per unit asrama (v2.10).
 *
 * Sengaja tidak menyaring `aturan` lebih dulu lalu memanggil
 * petaInstrumen() sekali. Alasannya: Admin dan Pimpinan melihat kedua
 * unit sekaligus, dan bila kedua tangga digabung dalam satu Map,
 * `bentuk` yang berkunci `pengulangan_ke` akan saling menimpa — tahap
 * ke-3 putri menghapus tahap ke-3 putra tanpa jejak. Dua peta terpisah
 * membuat setiap baris pembinaan dinilai dengan tangga unitnya sendiri,
 * berapa pun unit yang sedang ditampilkan.
 *
 * petaInstrumen() sendiri tidak diubah sama sekali.
 */
function petaInstrumenUnit(rows) {
  const out = { __perUnit: true };
  out[UNIT_PUTRA] = petaInstrumen((rows || []).filter(r => unitMaster(r) === UNIT_PUTRA));
  out[UNIT_PUTRI] = petaInstrumen((rows || []).filter(r => unitMaster(r) === UNIT_PUTRI));
  return out;
}

/**
 * Ambil peta instrumen yang berlaku untuk satu unit.
 * Menerima juga bentuk LAMA (Map kategori langsung) supaya pemanggil
 * yang belum diperbarui — atau data tersimpan dari versi sebelumnya —
 * tidak pecah.
 */
function instrumenUntuk(ins, unit) {
  if (!ins) return null;
  if (ins.__perUnit) return ins[unit === UNIT_PUTRI ? UNIT_PUTRI : UNIT_PUTRA] || new Map();
  return ins;
}

/** Aturan yang berlaku untuk pengulangan ke-n: tangga tertinggi yang <= n. */
function bentukAturan(info, n) {
  if (!info) return null;
  let pilih = null;
  info.bentuk.forEach((v, k) => { if (k <= n && (!pilih || k > pilih.k)) pilih = { k, v }; });
  return pilih ? pilih.v : null;
}

// ---------- 20b. Bagian 2: akumulasi unik ----------------------------

/**
 * Hitung pelanggaran unik per (kategori + catatan). Tanpa konversi:
 * 5x Ringan tetap tercatat 5x Ringan, bukan 1x Sedang.
 */
function akumulasiUnik(perkembangan) {
  const peta = new Map();
  (perkembangan || []).forEach(p => {
    const kategori = String(p.kategori || '-').trim();
    const teks = String(p.judul || p.nama_pelanggaran || '-').trim();
    const k = `${kategori}|${kunciTeks(teks)}`;
    if (!peta.has(k)) peta.set(k, { kategori, deskripsi: teks, jumlah: 0 });
    peta.get(k).jumlah++;
  });
  return [...peta.values()].sort((a, b) =>
    (URUT_KAT[a.kategori] ?? 99) - (URUT_KAT[b.kategori] ?? 99) ||
    b.jumlah - a.jumlah ||
    a.deskripsi.localeCompare(b.deskripsi, 'id'));
}

// ---------- 20c. Bagian 3: riwayat terurut + validasi overflow --------

/** Bentuk pembinaan yang benar-benar tercatat: "kategori|pengulangan_ke". */
function petaBentukTercatat(pembinaan) {
  const peta = new Map(), jalan = {};
  (pembinaan || []).slice().sort((a, b) =>
    String(kunciTgl(a.tanggal_pembinaan)).localeCompare(String(kunciTgl(b.tanggal_pembinaan))))
    .forEach(b => {
      const kat = String(b.kategori || '').trim(); if (!kat) return;
      const n = Number(b.pengulangan_ke) || ((jalan[kat] = (jalan[kat] || 0) + 1));
      jalan[kat] = Math.max(jalan[kat] || 0, n);
      const teks = b.instrumen_pembinaan || b.bentuk_pembinaan;
      if (teks) peta.set(`${kat}|${n}`, teks);
    });
  return peta;
}

/**
 * Susun baris bagian 3.
 * Nomor ke-N dihitung dari riwayat PENUH supaya "ke-16" tetap benar
 * walaupun lembar cetak hanya memuat satu bulan.
 *
 * Prioritas isi kolom Bentuk Pembinaan:
 *   1. n > maxFrequency        -> "Sudah melebihi modul Instrumen"
 *   2. log_pembinaan tercatat  -> apa yang benar-benar dijalankan
 *   3. master_pembinaan        -> aturan yang seharusnya berlaku
 *   4. tidak ada rujukan       -> "Data tidak tersedia"
 */
function riwayatCetak(tampil, penuh, pembinaan, instrumen) {
  const tercatat = petaBentukTercatat(pembinaan);
  const urut = (arr) => (arr || []).slice().sort((a, b) =>
    (URUT_KAT[a.kategori] ?? 99) - (URUT_KAT[b.kategori] ?? 99) ||
    String(kunciTgl(a.tanggal)).localeCompare(String(kunciTgl(b.tanggal))));

  const hitung = {};
  urut(penuh && penuh.length ? penuh : tampil).forEach(p => {
    const kat = String(p.kategori || '-').trim();
    p.__n = (hitung[kat] = (hitung[kat] || 0) + 1);
  });

  return urut(tampil).map(p => {
    const kategori = String(p.kategori || '-').trim();
    const n = p.__n || 0;
    // v2.10: baris pelanggaran membawa `kelas`, jadi unitnya bisa
    // ditentukan tanpa mengubah view detail_data.
    const ins = instrumenUntuk(instrumen, unitBaris(p));
    const info = ins ? ins.get(kategori) : null;
    const batas = info && info.max > 0 ? info.max : null;
    const overflow = isNum(batas) && n > batas;
    return { ...p, kategori, urutanKategori: n, batas, overflow,
      bentukPembinaan: overflow
        ? 'Sudah melebihi modul Instrumen'
        : (tercatat.get(`${kategori}|${n}`) || bentukAturan(info, n) || NA_DATA) };
  });
}

// ---------- 20d. Bagian 5: agregasi, tier, kesimpulan -----------------

/**
 * Konteks santri dalam jenjang & angkatan, dihitung di browser dari
 * detail_data. Sengaja TIDAK memakai lingkupDetail(): laporan santri
 * mencakup Pengasuhan + Madrasah sekaligus, dan pembandingnya harus
 * seluruh santri, bukan hanya kelas binaan pengguna.
 */
async function hitungAgregasiSantri(siswa) {
  const jenjang  = String(siswa?.jenjang || angkatanJenjang(siswa?.kelas) || '').trim();
  const angkatan = angkatanDariKelas(siswa?.kelas);
  const kosong = { jenjang, angkatan, totalPerJenjang: null, totalPerAngkatan: null, santriData: [] };

  try {
    const rows = saringPeriode((await muatDetail()).filter(aktifDetail), 'tanggal');
    if (!rows.length) return kosong;
    const peta = await petaSiswa();
    const poin = new Map();
    let tJenjang = 0, tAngkatan = 0;

    rows.forEach(r => {
      const s = peta[String(r.nisn)] || {};
      const kls = r.kelas || s.kelas;
      const j = String(r.jenjang || s.jenjang || angkatanJenjang(kls) || '').trim();
      if (jenjang && j === jenjang) tJenjang++;
      if (angkatan && angkatanDariKelas(kls) === angkatan) tAngkatan++;
      const n = String(r.nisn || ''); if (!n) return;
      poin.set(n, (poin.get(n) || 0) + (Number(r.bobot_pelanggaran) || 0));
    });

    // Poin prestasi seluruh santri pada periode yang sama — dipakai agar
    // ambang tier dihitung dari SKOR NET, bukan dari pelanggaran saja.
    const prestasi = new Map();
    try {
      saringPeriode((await muatPrestasi()).filter(aktifPrestasi), 'tanggal')
        .forEach(r => {
          const n = String(r.nisn || ''); if (!n) return;
          prestasi.set(n, (prestasi.get(n) || 0) + (Number(r.poin) || 0));
        });
    } catch (e) { console.warn('poin prestasi tidak terbaca:', e.message); }

    const kunci = new Set([...poin.keys(), ...prestasi.keys()]);
    const santriData = [...kunci].map(nisn => {
      const totalPoin = poin.get(nisn) || 0;
      const poinPrestasi = prestasi.get(nisn) || 0;
      return { nisn, totalPoin, poinPrestasi, net: Math.max(0, totalPoin - poinPrestasi) };
    });

    return { jenjang, angkatan,
      totalPerJenjang:  jenjang  ? tJenjang  : null,
      totalPerAngkatan: angkatan ? tAngkatan : null,
      santriData };
  } catch (e) {
    console.warn('agregasi laporan tidak tersedia:', e.message);
    return kosong;
  }
}

/**
 * Tier prioritas. Ambang diambil dari sebaran poin santri lain bila
 * datanya cukup (>= 5 santri); selain itu memakai ambang tetap.
 */
function tierSantri(poin, santriData) {
  const semua = (santriData || [])
    .map(s => isNum(s.net) ? s.net : s.totalPoin).filter(isNum).sort((a, b) => a - b);
  const q = (f) => semua[Math.min(semua.length - 1, Math.floor(semua.length * f))];
  const dinamis = semua.length >= 5;
  const amb = dinamis ? { baik: q(0.50), perhatian: q(0.80) } : { baik: 20, perhatian: 50 };
  const nama = poin <= amb.baik ? 'Baik'
             : poin <= amb.perhatian ? 'Perlu Perhatian'
             : 'Butuh Intervensi';
  return { nama, dinamis, amb };
}

function kesimpulanSementara(data, akumulasi) {
  const s  = data.siswa || {};
  const ag = data.agregasi || {};
  const Z  = (data.perkembangan || []).length;
  const poin = data.periodeAktif ? (data.poinPeriode || 0) : (s.total_poin_pelanggaran || 0);
  const pct = (a, b) => (isNum(b) && b > 0 ? `${Math.round(a / b * 1000) / 10}%` : NA_DATA);

  const perKat = {};
  (akumulasi || []).forEach(r => perKat[r.kategori] = (perKat[r.kategori] || 0) + r.jumlah);
  const katDominan = Object.entries(perKat).sort((a, b) => b[1] - a[1])[0]?.[0] || NA_DATA;

  const perBidang = {};
  (data.perkembangan || []).forEach(p => {
    const b = String(p.bidang || '').trim();
    if (b) perBidang[b] = (perBidang[b] || 0) + 1;
  });
  const areaFokus = Object.entries(perBidang).sort((a, b) => b[1] - a[1])[0]?.[0] || NA_DATA;

  // --- Skor net: poin pelanggaran dikurangi poin prestasi ---------------
  const prestasi = data.prestasi || [];
  const poinPrestasi = prestasi.reduce((a, r) => a + (Number(r.poin) || 0), 0);
  const net = Math.max(0, poin - poinPrestasi);
  const perApresiasi = {};
  prestasi.forEach(r => {
    const k = String(r.kategori || 'Perunggu').trim();
    perApresiasi[k] = (perApresiasi[k] || 0) + 1;
  });
  const bidangPrestasi = {};
  prestasi.forEach(r => {
    const b = String(r.bidang || '').trim();
    if (b) bidangPrestasi[b] = (bidangPrestasi[b] || 0) + 1;
  });
  const areaKuat = Object.entries(bidangPrestasi).sort((a, b) => b[1] - a[1])[0]?.[0] || NA_DATA;

  return { Z, poin, perKat, katDominan, areaFokus,
    poinPrestasi, net, jumlahPrestasi: prestasi.length, perApresiasi, areaKuat,
    tier: tierSantri(net, ag.santriData),
    jenjang:  ag.jenjang  || NA_DATA,
    angkatan: ag.angkatan || NA_DATA,
    X: isNum(ag.totalPerJenjang)  ? ag.totalPerJenjang  : NA_DATA,
    Y: isNum(ag.totalPerAngkatan) ? ag.totalPerAngkatan : NA_DATA,
    pctJenjang:  pct(Z, ag.totalPerJenjang),
    pctAngkatan: pct(Z, ag.totalPerAngkatan) };
}

/** Render bagian 5 lembar cetak, termasuk box catatan manual musyrif. */
function bagianKesimpulanCetak(k) {
  const warna = k.tier.nama === 'Baik' ? '#0F766E'
              : k.tier.nama === 'Perlu Perhatian' ? '#B45309' : '#9F1239';
  const sel = (a, b) =>
    `<td style="border:1px solid #cbd5e1;padding:5px;">${esc(a)}</td>
     <td style="border:1px solid #cbd5e1;padding:5px;text-align:right;font-weight:bold;">${esc(b)}</td>`;
  const rincian = Object.entries(k.perKat)
    .sort((a, b) => (URUT_KAT[a[0]] ?? 99) - (URUT_KAT[b[0]] ?? 99))
    .map(([kat, n]) => `${kat} ${n}`).join(' · ') || NA_DATA;

  return `
    <table style="width:100%;font-size:11px;border-collapse:collapse;margin-bottom:12px;">
      <tbody>
        <tr>${sel(`Total pelanggaran jenjang ${k.jenjang}`, k.X)}</tr>
        <tr>${sel(`Total pelanggaran angkatan ${k.angkatan}`, k.Y)}</tr>
        <tr>${sel('Pelanggaran santri ini', `${k.Z} (${rincian})`)}</tr>
        <tr>${sel('Kontribusi terhadap jenjang', k.pctJenjang)}</tr>
        <tr>${sel('Kontribusi terhadap angkatan', k.pctAngkatan)}</tr>
        <tr>${sel('Poin pelanggaran', k.poin)}</tr>
        <tr>${sel(`Poin apresiasi — ${k.jumlahPrestasi} catatan`, k.poinPrestasi)}</tr>
        <tr style="background:#f8fafc;">${sel('Skor Net', k.net)}</tr>
      </tbody>
    </table>

    <p style="font-size:11.5px;line-height:1.6;margin:0 0 6px;">
      Santri ini mencatat <b>${k.Z}</b> pelanggaran dari <b>${esc(String(k.X))}</b> total di
      jenjang ${esc(k.jenjang)} (${esc(k.pctJenjang)}), dan ${esc(k.pctAngkatan)} dari angkatan
      ${esc(k.angkatan)}. Mayoritas pada kategori <b>${esc(k.katDominan)}</b>.
      Pada periode yang sama tercatat <b>${k.jumlahPrestasi}</b> apresiasi
      senilai <b>${k.poinPrestasi}</b> poin${k.areaKuat && k.areaKuat !== NA_DATA
        ? `, terkuat pada bidang <b>${esc(k.areaKuat)}</b>` : ''},
      sehingga skor net menjadi <b>${k.net}</b>.
      Status: <b style="color:${warna};">${esc(k.tier.nama)}</b>.
      Memerlukan fokus pada bidang <b>${esc(k.areaFokus)}</b>.
    </p>`;
  // Kotak catatan & tanda tangan tidak lagi dibuat di sini — keduanya
  // disatukan pada blokPenutupCetak() supaya tidak pernah terbelah halaman.
}

/* =====================================================================
   20f-0. PENANGGUNG JAWAB LAPORAN (musyrif penanda tangan)
   =====================================================================
   Setiap lembar laporan membawa nama musyrif yang menerbitkannya —
   bukan sekadar garis tanda tangan kosong. Tujuannya sederhana: laporan
   menjadi tanggung jawab seseorang yang jelas, bukan dokumen tanpa
   pemilik.

   Sejak v2.4 jejak itu berupa KODE QR, bukan pas foto.

   Alasannya bukan selera. Pas foto adalah sebuah bitmap berwarna yang
   ikut diraster bersama seluruh halaman, dan pada 400 santri biayanya
   menumpuk sampai ratusan megabita. Kode QR hanya hitam-putih, terbentuk
   dari beberapa ratus persegi — praktis gratis di dalam raster, dan
   justru lebih berguna: dipindai kamera HP mana pun, ia langsung
   menampilkan nama lengkap, jabatan, dan tanggal terbit tanpa perlu
   jaringan, tanpa akun, dan tanpa memasang apa pun.
   ===================================================================== */

/* =====================================================================
   QR CODE MANDIRI — mode bita, versi 1-10, koreksi galat L/M

   Ditulis sendiri, bukan diambil dari CDN. Alasannya satu: lembar
   laporan harus tetap terbit ketika dayah sedang tanpa jaringan, dan
   service worker hanya menyimpan berkas inti aplikasi. Pustaka QR dari
   CDN akan menjadi titik gagal yang tidak terlihat sampai listrik atau
   internet padam — tepat pada saat laporan paling dibutuhkan.

   Cakupannya sengaja dibatasi pada yang benar-benar dipakai:
   mode bita (teks Latin), versi 1 sampai 10, koreksi galat L dan M.
   Itu sudah memuat ±150 karakter, jauh di atas kebutuhan panel tanda
   tangan.
   ===================================================================== */

// ---------- Aritmetika lapangan Galois GF(256), polinom 0x11D --------
const QR_EXP = new Uint8Array(512);
const QR_LOG = new Uint8Array(256);
(function () {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    QR_EXP[i] = x;
    QR_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11D;
  }
  for (let i = 255; i < 512; i++) QR_EXP[i] = QR_EXP[i - 255];
})();

const qrKali = (a, b) => (a === 0 || b === 0) ? 0 : QR_EXP[QR_LOG[a] + QR_LOG[b]];

/** Polinom pembangkit Reed-Solomon berderajat n. */
function qrPolinom(n) {
  let poly = [1];
  for (let i = 0; i < n; i++) {
    const baru = new Array(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      baru[j] ^= poly[j];
      baru[j + 1] ^= qrKali(poly[j], QR_EXP[i]);
    }
    poly = baru;
  }
  return poly;
}

/** Kata koreksi galat untuk satu blok data. */
function qrKoreksi(data, panjangEc) {
  const gen = qrPolinom(panjangEc);
  const sisa = new Uint8Array(data.length + panjangEc);
  sisa.set(data, 0);
  for (let i = 0; i < data.length; i++) {
    const c = sisa[i];
    if (!c) continue;
    for (let j = 1; j < gen.length; j++) sisa[i + j] ^= qrKali(gen[j], c);
  }
  return sisa.slice(data.length);
}

/* Tabel blok per versi: [ecPerBlok, blokG1, dataG1, blokG2, dataG2].
   Hanya versi 1-10 untuk tingkat L dan M. */
const QR_BLOK = {
  L: [
    [7, 1, 19, 0, 0], [10, 1, 34, 0, 0], [15, 1, 55, 0, 0], [20, 1, 80, 0, 0],
    [26, 1, 108, 0, 0], [18, 2, 68, 0, 0], [20, 2, 78, 0, 0], [24, 2, 97, 0, 0],
    [30, 2, 116, 0, 0], [18, 2, 68, 2, 69]
  ],
  M: [
    [10, 1, 16, 0, 0], [16, 1, 28, 0, 0], [26, 1, 44, 0, 0], [18, 2, 32, 0, 0],
    [24, 2, 43, 0, 0], [16, 4, 27, 0, 0], [18, 4, 31, 0, 0], [22, 2, 38, 2, 39],
    [22, 3, 36, 2, 37], [26, 4, 43, 1, 44]
  ]
};

/* Titik tengah pola perataan per versi (versi 1 tidak punya). */
const QR_RATA = [
  [], [6, 18], [6, 22], [6, 26], [6, 30],
  [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]
];

const QR_BIT_ECL = { L: 1, M: 0, Q: 3, H: 2 };

/** 15 bit informasi format (BCH 15,5) — sudah termasuk masker 0x5412. */
function qrBitFormat(ecl, mask) {
  const data = (QR_BIT_ECL[ecl] << 3) | mask;
  let sisa = data;
  for (let i = 0; i < 10; i++) sisa = (sisa << 1) ^ ((sisa >> 9) * 0x537);
  return ((data << 10) | sisa) ^ 0x5412;
}

/** 18 bit informasi versi (BCH 18,6) — hanya dipakai versi >= 7. */
function qrBitVersi(v) {
  let sisa = v;
  for (let i = 0; i < 12; i++) sisa = (sisa << 1) ^ ((sisa >> 11) * 0x1F25);
  return (v << 12) | sisa;
}

const QR_MASK = [
  (i, j) => (i + j) % 2 === 0,
  (i) => i % 2 === 0,
  (i, j) => j % 3 === 0,
  (i, j) => (i + j) % 3 === 0,
  (i, j) => (((i / 2) | 0) + ((j / 3) | 0)) % 2 === 0,
  (i, j) => ((i * j) % 2) + ((i * j) % 3) === 0,
  (i, j) => (((i * j) % 2) + ((i * j) % 3)) % 2 === 0,
  (i, j) => (((i + j) % 2) + ((i * j) % 3)) % 2 === 0
];

/** Ubah teks menjadi bita UTF-8. */
function qrKeBita(teks) {
  if (typeof TextEncoder === 'function') return Array.from(new TextEncoder().encode(teks));
  const out = [];
  for (const ch of String(teks)) {
    let c = ch.codePointAt(0);
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xC0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xF0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return out;
}

/**
 * Matriks QR untuk sebuah teks.
 * @returns {{ukuran:number, modul:Uint8Array}} modul bernilai 1 = gelap.
 */
function qrMatriks(teks, ecl = 'M') {
  const bita = qrKeBita(teks);
  const tabel = QR_BLOK[ecl] || QR_BLOK.M;

  // --- Pilih versi terkecil yang memuat data ---------------------------
  let versi = 0, spek = null, totalData = 0;
  for (let v = 1; v <= tabel.length; v++) {
    const t = tabel[v - 1];
    const kapasitas = t[1] * t[2] + t[3] * t[4];
    const bitHitung = v <= 9 ? 8 : 16;
    if (4 + bitHitung + bita.length * 8 <= kapasitas * 8) {
      versi = v; spek = t; totalData = kapasitas; break;
    }
  }
  if (!versi) throw new Error('Teks terlalu panjang untuk QR versi 10.');

  const [ecPerBlok, blokG1, dataG1, blokG2, dataG2] = spek;
  const bitHitung = versi <= 9 ? 8 : 16;

  // --- Rangkai aliran bit ----------------------------------------------
  const bit = [];
  const tulis = (nilai, panjang) => {
    for (let i = panjang - 1; i >= 0; i--) bit.push((nilai >> i) & 1);
  };
  tulis(0b0100, 4);                 // penanda mode bita
  tulis(bita.length, bitHitung);
  bita.forEach(b => tulis(b, 8));

  const kapasitasBit = totalData * 8;
  for (let i = 0; i < 4 && bit.length < kapasitasBit; i++) bit.push(0);   // terminator
  while (bit.length % 8) bit.push(0);                                     // rapatkan ke bita

  const kata = [];
  for (let i = 0; i < bit.length; i += 8) {
    let b = 0;
    for (let j = 0; j < 8; j++) b = (b << 1) | bit[i + j];
    kata.push(b);
  }
  const isian = [0xEC, 0x11];
  for (let i = 0; kata.length < totalData; i++) kata.push(isian[i % 2]);

  // --- Bagi per blok, hitung koreksi galat, lalu jalin -----------------
  const blokData = [], blokEc = [];
  let pos = 0;
  for (let i = 0; i < blokG1 + blokG2; i++) {
    const n = i < blokG1 ? dataG1 : dataG2;
    const d = Uint8Array.from(kata.slice(pos, pos + n));
    pos += n;
    blokData.push(d);
    blokEc.push(qrKoreksi(d, ecPerBlok));
  }

  const akhir = [];
  const maksData = Math.max(dataG1, dataG2);
  for (let i = 0; i < maksData; i++) {
    for (const d of blokData) if (i < d.length) akhir.push(d[i]);
  }
  for (let i = 0; i < ecPerBlok; i++) {
    for (const e of blokEc) akhir.push(e[i]);
  }

  // --- Siapkan matriks dan modul fungsi --------------------------------
  const ukuran = versi * 4 + 17;
  const modul = new Uint8Array(ukuran * ukuran);
  const kunci = new Uint8Array(ukuran * ukuran);   // 1 = modul fungsi, tak boleh ditimpa
  const idx = (r, c) => r * ukuran + c;
  const set = (r, c, v) => {
    if (r < 0 || c < 0 || r >= ukuran || c >= ukuran) return;
    modul[idx(r, c)] = v ? 1 : 0;
    kunci[idx(r, c)] = 1;
  };

  // Pola pencari + pemisahnya, di tiga sudut
  const pencari = (br, bc) => {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const rr = br + r, cc = bc + c;
        if (rr < 0 || cc < 0 || rr >= ukuran || cc >= ukuran) continue;
        const di = Math.max(Math.abs(r - 3), Math.abs(c - 3));
        set(rr, cc, di !== 2 && di <= 3);
      }
    }
  };
  pencari(0, 0); pencari(0, ukuran - 7); pencari(ukuran - 7, 0);

  // Pola waktu
  for (let i = 8; i < ukuran - 8; i++) {
    set(6, i, i % 2 === 0);
    set(i, 6, i % 2 === 0);
  }

  // Pola perataan
  const titik = QR_RATA[versi - 1];
  for (const r of titik) {
    for (const c of titik) {
      if ((r === 6 && c === 6) || (r === 6 && c === ukuran - 7) || (r === ukuran - 7 && c === 6)) continue;
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          set(r + dr, c + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1);
        }
      }
    }
  }

  /* Ruang informasi format. Nilainya diisi belakangan (setelah masker
     dipilih), di sini hanya dipesan. Indeks 6 sengaja dilewati: baris
     dan kolom ke-6 milik pola waktu, dan menimpanya membuat pemindai
     kehilangan acuan koordinat. */
  for (let i = 0; i <= 8; i++) {
    if (i !== 6) { set(8, i, 0); set(i, 8, 0); }
  }
  for (let i = 0; i < 8; i++) { set(8, ukuran - 1 - i, 0); set(ukuran - 1 - i, 8, 0); }
  set(ukuran - 8, 8, 1);            // modul gelap tetap

  // Ruang informasi versi
  if (versi >= 7) {
    for (let i = 0; i < 18; i++) {
      set((i / 3) | 0, ukuran - 11 + (i % 3), 0);
      set(ukuran - 11 + (i % 3), (i / 3) | 0, 0);
    }
  }

  // --- Tempatkan data secara zigzag ------------------------------------
  const dataBit = [];
  akhir.forEach(b => { for (let i = 7; i >= 0; i--) dataBit.push((b >> i) & 1); });

  let p = 0, naik = true;
  for (let kanan = ukuran - 1; kanan > 0; kanan -= 2) {
    if (kanan === 6) kanan = 5;                    // lewati kolom pola waktu
    for (let v = 0; v < ukuran; v++) {
      const r = naik ? ukuran - 1 - v : v;
      for (let s = 0; s < 2; s++) {
        const c = kanan - s;
        if (kunci[idx(r, c)]) continue;
        modul[idx(r, c)] = p < dataBit.length ? dataBit[p] : 0;
        p++;
      }
    }
    naik = !naik;
  }

  // --- Pilih masker dengan denda terkecil ------------------------------
  let terbaik = null, dendaTerbaik = Infinity;
  for (let m = 0; m < 8; m++) {
    const uji = Uint8Array.from(modul);
    for (let r = 0; r < ukuran; r++) {
      for (let c = 0; c < ukuran; c++) {
        if (!kunci[idx(r, c)] && QR_MASK[m](r, c)) uji[idx(r, c)] ^= 1;
      }
    }
    qrTulisFormat(uji, ukuran, ecl, m, versi);
    const d = qrDenda(uji, ukuran);
    if (d < dendaTerbaik) { dendaTerbaik = d; terbaik = uji; }
  }

  return { ukuran, modul: terbaik, versi };
}

/**
 * Tuliskan informasi format (dan versi) ke dalam matriks.
 *
 * Kedua salinan informasi format memakai penempatan baku: satu menyusuri
 * kolom 8 dari atas, satu lagi menyusuri baris 8 dari kanan. Loncatan
 * indeks pada i = 6 dan i = 8 bukan kekeliruan — di situlah pola waktu
 * memotong jalur, dan modulnya harus dilewati.
 */
function qrTulisFormat(mat, ukuran, ecl, mask, versi) {
  const f = qrBitFormat(ecl, mask);
  const amb = (i) => (f >> i) & 1;
  const taruh = (r, c, v) => { mat[r * ukuran + c] = v; };

  // Salinan 1 — menurun pada kolom 8, lalu mendatar pada baris 8
  for (let i = 0; i < 15; i++) {
    const b = amb(i);
    if (i < 6)      taruh(i, 8, b);
    else if (i < 8) taruh(i + 1, 8, b);
    else            taruh(ukuran - 15 + i, 8, b);
  }
  // Salinan 2 — mendatar pada baris 8 dari kanan, lalu kembali ke kiri
  for (let i = 0; i < 15; i++) {
    const b = amb(i);
    if (i < 8)      taruh(8, ukuran - 1 - i, b);
    else if (i < 9) taruh(8, 7, b);
    else            taruh(8, 14 - i, b);
  }
  taruh(ukuran - 8, 8, 1);          // modul gelap tetap

  if (versi >= 7) {
    const v = qrBitVersi(versi);
    for (let i = 0; i < 18; i++) {
      const b = (v >> i) & 1;
      mat[(((i / 3) | 0)) * ukuran + (ukuran - 11 + (i % 3))] = b;
      mat[(ukuran - 11 + (i % 3)) * ukuran + (((i / 3) | 0))] = b;
    }
  }
}

/** Denda masker menurut empat aturan baku. */
function qrDenda(mat, n) {
  const at = (r, c) => mat[r * n + c];
  let denda = 0;

  // Aturan 1 — deretan lima modul sewarna atau lebih
  for (let r = 0; r < n; r++) {
    let jalanR = 1, jalanC = 1;
    for (let c = 1; c < n; c++) {
      jalanR = at(r, c) === at(r, c - 1) ? jalanR + 1 : 1;
      if (jalanR === 5) denda += 3; else if (jalanR > 5) denda += 1;
      jalanC = at(c, r) === at(c - 1, r) ? jalanC + 1 : 1;
      if (jalanC === 5) denda += 3; else if (jalanC > 5) denda += 1;
    }
  }

  // Aturan 2 — blok 2x2 sewarna
  for (let r = 0; r < n - 1; r++) {
    for (let c = 0; c < n - 1; c++) {
      const v = at(r, c);
      if (v === at(r, c + 1) && v === at(r + 1, c) && v === at(r + 1, c + 1)) denda += 3;
    }
  }

  // Aturan 3 — pola mirip pencari (1:1:3:1:1 dengan ruang kosong)
  const pola1 = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0];
  const pola2 = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1];
  const cocok = (ambil, i) => {
    let a = true, b = true;
    for (let k = 0; k < 11; k++) {
      const v = ambil(i + k);
      if (v !== pola1[k]) a = false;
      if (v !== pola2[k]) b = false;
    }
    return a || b;
  };
  for (let r = 0; r < n; r++) {
    for (let c = 0; c + 11 <= n; c++) {
      if (cocok((k) => at(r, k), c)) denda += 40;
      if (cocok((k) => at(k, r), c)) denda += 40;
    }
  }

  // Aturan 4 — ketimpangan jumlah modul gelap
  let gelap = 0;
  for (let i = 0; i < n * n; i++) gelap += mat[i];
  const persen = (gelap * 100) / (n * n);
  denda += Math.floor(Math.abs(persen - 50) / 5) * 10;

  return denda;
}

/**
 * Kode QR sebagai data URI PNG, siap dipasang pada `background-image`.
 *
 * Digambar lewat <canvas> dan bukan SVG dengan alasan yang sama seperti
 * pas foto dahulu: html2canvas tidak dapat diandalkan melukis SVG yang
 * dipakai sebagai latar, sedangkan PNG selalu berhasil.
 *
 * `pikselPerModul` sengaja 8, jauh di atas kebutuhan layar. Pada render
 * PDF 3x kotak QR menjadi sekitar 280 piksel nyata, jadi sumber yang
 * lebih besar menjaga tepi tiap modul tetap tegas alih-alih melebur saat
 * diperkecil. Tanpa zona sunyi bawaan — ruang putih halaman di
 * sekelilingnya sudah menjadi zona sunyi yang sah.
 *
 * Mengembalikan jumlah modul juga, karena penelepon perlu tahu seberapa
 * besar kotaknya harus digambar (lihat MODUL_MM di bawah).
 *
 * @returns {{uri:string, modul:number}}
 */
function qrDataUri(teks, ecl = 'M', pikselPerModul = 8) {
  try {
    const { ukuran, modul } = qrMatriks(teks, ecl);
    const kanvas = document.createElement('canvas');
    kanvas.width = kanvas.height = ukuran * pikselPerModul;
    const g = kanvas.getContext('2d');
    if (!g) return { uri: '', modul: 0 };

    g.fillStyle = '#FFFFFF';
    g.fillRect(0, 0, kanvas.width, kanvas.height);
    g.fillStyle = '#000000';        // hitam penuh — kontras terbaik di kertas
    for (let r = 0; r < ukuran; r++) {
      for (let c = 0; c < ukuran; c++) {
        if (modul[r * ukuran + c]) {
          g.fillRect(c * pikselPerModul, r * pikselPerModul, pikselPerModul, pikselPerModul);
        }
      }
    }
    return { uri: kanvas.toDataURL('image/png'), modul: ukuran };
  } catch (e) {
    console.warn('[laporan] Kode QR gagal dibuat:', e.message);
    return { uri: '', modul: 0 };   // panel tetap terbit, hanya tanpa QR
  }
}

/**
 * Lebar kotak QR dalam piksel CSS.
 *
 * Kotaknya TIDAK dipatok pada satu angka. Nama musyrif yang panjang dan
 * bergelar memaksa QR naik versi — 37 modul menjadi 45 — dan pada kotak
 * berukuran tetap, tiap modul menyusut dari 0,60 mm ke 0,49 mm. Di bawah
 * ±0,5 mm kamera ponsel mulai gagal mengunci pola, jadi kotaknya justru
 * harus ikut membesar. Angka 2,3 px per modul menjaga lebar satu modul
 * tetap di sekitar 0,6 mm di atas kertas, berapa pun panjang namanya.
 */
const qrLebarPanel = (jumlahModul) =>
  Math.min(96, Math.max(76, Math.round((jumlahModul || 37) * 2.3)));

/** Identitas musyrif yang menerbitkan laporan. */
async function ambilPenanggungJawab() {
  const nama  = APP.fotoSaya?.nama || APP.profil?.nama_lengkap || APP.profil?.nama || '—';
  const peran = APP.fotoSaya?.role || APP.profil?.role || '';
  const uid   = APP.fotoSaya?.userId || '';
  return { uid, nama, peran };
}

/** Isi kode QR pada panel tanda tangan — teks biasa, terbaca luring. */
function teksVerifikasiQr(nama, dicetak) {
  return [
    String(nama || '—'),
    'Musyrif Asrama',
    'Dayah Ruhul Qurani, Aceh Barat',
    'Diterbitkan ' + String(dicetak || '-')
  ].join('\n');
}

/**
 * Blok penutup laporan: kotak catatan musyrif + panel tanda tangan
 * berkode QR + baris keabsahan.
 *
 * Ketiganya sengaja dibungkus SATU wadah dengan `page-break-inside:avoid`
 * dan kelas `blok-utuh` (didaftarkan pada opsi pagebreak html2pdf), jadi
 * penutup laporan tidak pernah terbelah antar halaman — masalah yang
 * membuat kotak catatan sebelumnya terpotong di tengah.
 */
function blokPenutupCetak(pj, dicetak) {
  const p     = pj || {};
  const nama  = p.nama || '—';
  const qr    = qrDataUri(teksVerifikasiQr(nama, dicetak));
  const qrPx  = qrLebarPanel(qr.modul);

  const garis = (n) => Array.from({ length: n })
    .map(() => `<div style="height:21px;border-bottom:1px dashed #cbd5e1;"></div>`).join('');

  /* ---- Takaran panel tanda tangan ------------------------------------
     Kedua kolom disusun dari tumpukan tinggi yang PERSIS SAMA, sehingga
     garis tanda tangan musyrif dan wali santri jatuh pada satu ketinggian
     dan sama panjang. Sebelumnya kolom kiri memakai perataan bawah pada
     tabel foto sedangkan kolom kanan memakai pengganjal tetap — selisih
     ±16 px, dan pada dokumen resmi selisih sekecil itu langsung terlihat.
     Angka-angka di bawah ini adalah satu-satunya sumber tinggi baris;
     jangan mengubah salah satunya tanpa mengubah pasangannya. */
  const T_KET   = 'height:15px;font-size:10px;line-height:15px;color:#64748b;';
  const T_JAB   = 'height:17px;font-size:11px;line-height:17px;font-weight:bold;color:#0f172a;';
  const T_SELA  = 'height:12px;';
  /* Ruang tanda tangan dinaikkan dari 84 px ke 112 px. Bukan soal
     kelonggaran: kode QR menempati sampai 96 px paling atas, dan sisanya
     adalah zona sunyi di bawahnya. Tanpa jeda putih itu garis tanda
     tangan menempel pada modul terluar dan pemindai kehilangan tepi.
     Tetapan ini dipakai KEDUA kolom, jadi tingginya tetap setara. */
  const T_RUANG = 'height:112px;';
  const T_GARIS = 'border-top:1px solid #334155;font-size:0;line-height:0;';
  const T_NAMA  = 'height:23px;padding-top:5px;font-size:11.5px;line-height:18px;'
                + 'font-weight:bold;color:#0f172a;';
  const T_SUB   = 'font-size:9.5px;line-height:14px;color:#94a3b8;';

  return `
  <div class="blok-utuh" style="margin-top:22px;page-break-inside:avoid;break-inside:avoid;">

    <div style="border:1px solid #cbd5e1;border-radius:4px;background:#fcfdfe;
                padding:11px 14px 13px;">
      <p style="margin:0 0 9px;font-size:10px;font-weight:bold;letter-spacing:.7px;
                text-transform:uppercase;color:#334155;">
        ${korpsMusyrifPutra()
          ? `<img src="${KORPS_CAP}" alt="" style="height:13px;width:auto;
               vertical-align:-2px;margin-right:8px;">` : ''
        }Catatan &amp; Rekomendasi Musyrif Asrama</p>
      ${garis(5)}
    </div>

    <table style="width:100%;font-size:11px;margin-top:20px;border-collapse:collapse;
                  table-layout:fixed;">
      <tr>
        <!-- ================= Musyrif Asrama (penanggung jawab) ================= -->
        <td style="width:50%;vertical-align:top;padding:0 16px 0 0;text-align:center;">
          <div style="${T_KET}text-align:left;">Mengetahui dan bertanggung jawab,</div>
          <div style="${T_JAB}text-align:left;">Musyrif Asrama</div>
          <div style="${T_SELA}"></div>
          <div style="${T_RUANG}">
            ${qr.uri ? `<div style="width:${qrPx}px;height:${qrPx}px;box-sizing:border-box;
                        background-color:#FFFFFF;background-image:url('${qr.uri}');
                        background-size:100% 100%;background-repeat:no-repeat;
                        image-rendering:pixelated;"></div>` : ''}
          </div>
          <div style="${T_GARIS}">&nbsp;</div>
          <div style="${T_NAMA}">${esc(nama)}</div>
          <div style="${T_SUB}">Diterbitkan ${esc(dicetak)}</div>
        </td>

        <!-- ================= Wali Santri ================= -->
        <td style="width:50%;vertical-align:top;padding:0 0 0 16px;text-align:center;">
          <div style="${T_KET}">&nbsp;</div>
          <div style="${T_JAB}text-align:left;">Wali Santri</div>
          <div style="${T_SELA}"></div>
          <div style="${T_RUANG}"></div>
          <div style="${T_GARIS}">&nbsp;</div>
          <div style="${T_NAMA}">(&nbsp;………………………………&nbsp;)</div>
          <div style="${T_SUB}">Nama terang &amp; tanda tangan</div>
        </td>
      </tr>
    </table>

    <p style="margin:18px 0 0;padding-top:7px;border-top:1px solid #e2e8f0;
              font-size:8.5px;line-height:1.6;color:#94a3b8;">
      Diterbitkan oleh Sistem Informasi Pengembangan Santri — Dayah Ruhul Qurani,
      ${esc(dicetak)}, atas tanggung jawab ${esc(nama)}.
      Laporan dinyatakan sah setelah dibubuhi tanda tangan musyrif asrama.
    </p>
  </div>`;
}

// ---------- 20e. Penyaringan periode ----------------------------------

/**
 * Saring hasil RPC `laporan_santri` mengikuti periode aktif.
 * Selalu dipanggil sebelum bangunLaporanHTML() — baik untuk cetak
 * maupun unduh PDF — sehingga keduanya memakai data yang identik.
 *
 * PENTING: `perkembangan` dibuat dengan .filter() dari perkembanganPenuh,
 * bukan .map(), agar objeknya sama persis. riwayatCetak() menempelkan
 * nomor pengulangan pada objek riwayat penuh, dan nomor itu harus ikut
 * terbawa ke baris yang dicetak.
 */
function saringDataLaporanBulanan(mentah) {
  const data = mentah || {};
  const p = batasPeriode();

  const perkembanganPenuh = (data.perkembangan || []).slice().sort((a, b) =>
    String(kunciTgl(a.tanggal)).localeCompare(String(kunciTgl(b.tanggal))));
  const pembinaanPenuh = (data.pembinaan || []).slice();

  const prestasiPenuh = (data.prestasi || []).slice();
  const tahfizPenuh   = (data.tahfiz || []).slice();
  const goalPenuh     = (data.goal || []).slice();

  if (!p) {
    return { ...data,
      perkembangan: perkembanganPenuh,
      perkembanganPenuh,
      pembinaanPenuh,
      presensi: data.presensi || [],
      prestasi: prestasiPenuh, prestasiPenuh,
      tahfiz: tahfizPenuh, tahfizPenuh,
      goal: goalPenuh, goalPenuh,
      goalLalu: [],
      rekap: akumulasiUnik(perkembanganPenuh),
      periodeAktif: false,
      labelPeriode: 'Seluruh Periode',
      poinPeriode: perkembanganPenuh.reduce((a, r) => a + (Number(r.poin) || 0), 0) };
  }

  const diBulan = (v) => bulanDari(kunciTgl(v)) === p.bulan;
  const perkembangan = perkembanganPenuh.filter(r => diBulan(r.tanggal));
  const pembinaan = pembinaanPenuh.filter(b => diBulan(b.tanggal_pembinaan));

  // Perizinan: masuk bila rentangnya bersinggungan dengan bulan aktif.
  const perizinan = (data.perizinan || []).filter(z => {
    const mulai = kunciTgl(z.tanggal_mulai);
    const selesai = kunciTgl(z.tanggal_selesai) || mulai;
    if (!mulai && !selesai) return false;
    const a = mulai || selesai, b = selesai || mulai;
    return a <= p.akhir && b >= p.awal;
  });

  // Target/goal: periode berjalan + periode sebelumnya (untuk loop tertutup)
  const bulanLalu = bulanSebelum(p.bulan);

  return { ...data,
    perkembangan,
    perkembanganPenuh,
    pembinaan,
    pembinaanPenuh,
    perizinan,
    presensi: data.presensi || [],          // presensi TIDAK disaring
    prestasi: prestasiPenuh.filter(r => diBulan(r.tanggal)),
    prestasiPenuh,
    tahfiz: tahfizPenuh.filter(r => diBulan(r.tanggal)),
    tahfizPenuh,
    goal: goalPenuh.filter(g => String(g.periode) === p.bulan),
    goalLalu: goalPenuh.filter(g => String(g.periode) === bulanLalu),
    goalPenuh,
    rekap: akumulasiUnik(perkembangan),
    poinPeriode: perkembangan.reduce((a, r) => a + (Number(r.poin) || 0), 0),
    periodeAktif: true,
    labelPeriode: labelPeriode(),
    periodeAwal: p.awal,
    periodeAkhir: p.akhir };
}

/** Lengkapi data laporan dengan master instrumen + agregasi jenjang/angkatan. */
async function lengkapiLaporan(data) {
  const [aturan, agregasi, penanggungJawab, logoKorps] = await Promise.all([
    muatMasterPembinaan(),
    hitungAgregasiSantri(data.siswa || {}),
    ambilPenanggungJawab(),
    dataUriGambar(ASET.korps)
  ]);
  return { ...data, instrumen: petaInstrumenUnit(aturan), agregasi, penanggungJawab, logoKorps };
}

// ---------- 20f. Template lembar cetak --------------------------------

/**
 * Kop surat lembar laporan — satu lambang, berwarna.
 *
 * Lambang korps dipakai dalam warna aslinya dan menjadi satu-satunya
 * lambang pada kop, sesuai keputusan dayah. Nama lembaga tetap berdiri
 * di tengah sebagai penerbit dokumen, jadi wali santri tetap membaca
 * "ini surat dari dayah" — yang berubah hanya lambangnya.
 *
 * Sumbernya `korps_logo` pada foto_aset, disematkan sebagai data URI
 * oleh lengkapiLaporan(). Bila belum diunggah, jatuh ke lambang
 * berwarna yang tertanam (KORPS_WARNA) sehingga kop tidak pernah
 * terbit tanpa lambang.
 *
 * `max-width`/`max-height` dipakai, BUKAN `object-fit`: dukungan
 * object-fit di html2canvas tidak seragam antarversi, sedangkan batas
 * ukuran biasa menjaga rasio asli di semua jalur render.
 */
function kopLaporan(logoKorps) {
  const logo = logoKorps || KORPS_WARNA;
  const sel = 'vertical-align:middle;padding:0;';

  return `
  <div class="blok-utuh" style="page-break-inside:avoid;break-inside:avoid;">
    <table style="width:100%;border-collapse:collapse;margin:0;table-layout:fixed;">
      <tr>
        <td style="${sel}width:132px;">
          <img src="${logo}" alt=""
               style="max-width:124px;max-height:94px;display:block;">
        </td>
        <td style="${sel}text-align:center;padding:0 6px;">
          <div style="font-size:9px;letter-spacing:2.6px;text-transform:uppercase;
                      color:#64748b;line-height:1.5;">Sistem Informasi Pengembangan Santri</div>
          <div style="font-size:19px;font-weight:bold;letter-spacing:1.7px;
                      color:#0f172a;line-height:1.28;">DAYAH RUHUL QURANI</div>
          <div style="font-size:9px;color:#64748b;letter-spacing:.35px;line-height:1.5;">
            Aceh Barat, Provinsi Aceh &nbsp;·&nbsp; Pengasuhan &nbsp;·&nbsp;
            Madrasah MTs &nbsp;·&nbsp; Madrasah MA</div>
        </td>
        <!-- Kolom kanan sengaja kosong dan selebar kolom logo. Tanpa itu,
             blok teks di tengah bergeser ke kanan mengikuti sisa ruang —
             kop dengan satu logo tetap harus terbaca simetris. -->
        <td style="${sel}width:132px;"></td>
      </tr>
    </table>

    <!-- Garis ganda tebal–tipis: penanda kop resmi yang sudah baku, dan
         satu-satunya pemisah yang dibutuhkan sebelum judul laporan. -->
    <div style="border-top:2.5px solid #0f172a;margin:9px 0 0;font-size:0;line-height:0;">&nbsp;</div>
    <div style="border-top:1px solid #0f172a;margin:2px 0 0;font-size:0;line-height:0;">&nbsp;</div>
  </div>`;
}


function bangunLaporanHTML(data) {
  const s = data.siswa || {};
  const dicetak = new Date().toLocaleDateString('id-ID', { day:'2-digit', month:'long', year:'numeric' });
  const aktif = !!data.periodeAktif;
  const labelPer = data.labelPeriode || 'Seluruh Periode';

  const th = (t) => `<th style="border:1px solid #cbd5e1;padding:5px;background:#f1f5f9;">${esc(t)}</th>`;
  const td = (t, c) => `<td style="border:1px solid #cbd5e1;padding:5px;${c||''}">${esc(t)}</td>`;
  const baris = (arr, kolom, kosongTeks, span) => arr && arr.length
    ? arr.map(kolom).join('')
    : `<tr><td colspan="${span}" style="text-align:center;padding:10px;color:#94a3b8;">${esc(kosongTeks)}</td></tr>`;

  /* ---- Takaran jarak tunggal untuk seluruh lembar --------------------
     Sebelumnya tiap bagian memakai angka margin sendiri-sendiri (16, 10,
     8, 24, 28 px) sehingga jarak antarbagian terlihat naik-turun. Tiga
     tetapan di bawah ini menjadi satu-satunya sumber jarak: judul bagian
     memberi ruang di ATAS, tabel hampir tidak memberi ruang di bawah,
     jadi irama vertikalnya tetap sama dari halaman pertama sampai
     terakhir. Ini yang membuat laporan terbaca rapi, bukan hiasan. */
  const H3    = 'font-size:12.5px;font-weight:bold;color:#0f172a;letter-spacing:.2px;'
              + 'margin:21px 0 6px;padding:0 0 4px;border-bottom:1px solid #cbd5e1;';
  const TABEL = 'width:100%;border-collapse:collapse;margin:0 0 2px;';
  /* Sel tabel identitas diberi padding sebaris sendiri. Bukan kerapian
     semata: sel tanpa gaya sebaris akan mewarisi padding dari sumber yang
     berbeda antara dokumen hidup dan salinannya, dan selisih tinggi itulah
     yang dulu menggeser batas halaman. */
  const ID_K = 'padding:2px 0;vertical-align:top;';
  const ID_V = 'padding:2px 0;vertical-align:top;';

  const perkembangan = data.perkembangan || [];
  const rekap = (data.rekap && data.rekap.length) ? data.rekap : akumulasiUnik(perkembangan);
  const riwayat = riwayatCetak(perkembangan, data.perkembanganPenuh,
                               data.pembinaanPenuh || data.pembinaan, data.instrumen);
  const kesimpulan = kesimpulanSementara(data, rekap);

  // ---- Bahan bagian 4 (prestasi), 5 (tahfiz) & 7 (target) ----
  const prestasi = data.prestasi || [];
  const totalPoinPrestasi = prestasi.reduce((a, r) => a + (Number(r.poin) || 0), 0);

  const tahfiz = data.tahfiz || [];
  const tahfizPenuh = data.tahfizPenuh || tahfiz;
  const jml = (arr, f) => arr.reduce((a, r) => a + (Number(r[f]) || 0), 0);
  const thfZiyadah  = tahfiz.filter(r => /ziyadah/i.test(r.jenis || '')).length;
  const thfMurajaah = tahfiz.filter(r => /muraja/i.test(r.jenis || '')).length;
  const thfHalaman  = Math.round(jml(tahfiz, 'capaian_halaman') * 10) / 10;
  const thfJuz      = Math.round((thfHalaman / HALAMAN_PER_JUZ) * 100) / 100;
  const thfTotalHalaman = Math.round(jml(tahfizPenuh, 'capaian_halaman') * 10) / 10;
  const thfTotalJuz = Math.round((thfTotalHalaman / HALAMAN_PER_JUZ) * 100) / 100;
  const thfLancar = (() => {
    const h = {};
    tahfiz.forEach(r => { const k = String(r.kelancaran || '').trim(); if (k) h[k] = (h[k] || 0) + 1; });
    return Object.entries(h).sort((a, b) => b[1] - a[1])[0]?.[0] || NA_DATA;
  })();

  const goalGabungan = [...(data.goalLalu || []), ...(data.goal || [])];

  const poinTampil = aktif ? (data.poinPeriode || 0) : (s.total_poin_pelanggaran || 0);
  const rentangTeks = aktif && data.periodeAwal
    ? `${tgl(data.periodeAwal)} s/d ${tgl(data.periodeAkhir)}` : 'Seluruh riwayat tercatat';

  return `
  <div class="laporan" style="font-family:Arial,Helvetica,sans-serif;color:#1e293b;
              padding:0 3px 10px;font-size:11px;line-height:1.5;">
    ${kopLaporan(data.logoKorps)}

    <div style="text-align:center;padding:13px 0 12px;margin:0 0 14px;
                border-bottom:1px solid #cbd5e1;">
      <h1 style="font-size:16.5px;margin:0;letter-spacing:1.1px;color:#0f172a;">
        LAPORAN PERKEMBANGAN SANTRI</h1>
      <p style="font-size:10px;margin:5px 0 0;color:#64748b;letter-spacing:.3px;">
        PERIODE ${esc(String(labelPer).toUpperCase())}
        &nbsp;·&nbsp; DICETAK ${esc(String(dicetak).toUpperCase())}</p>
    </div>

    <table style="width:100%;font-size:11.5px;margin:0 0 4px;">
      <tr><td style="${ID_K}width:168px;"><b>Nama Santri</b></td><td style="${ID_V}">: ${esc(s.nama_siswa)}</td></tr>
      <tr><td style="${ID_K}"><b>NISN</b></td><td style="${ID_V}">: ${esc(s.nisn)}</td></tr>
      <tr><td style="${ID_K}"><b>Jenjang / Kelas</b></td><td style="${ID_V}">: ${esc(s.jenjang||'-')} / ${esc(s.kelas||'-')}</td></tr>
      <tr><td style="${ID_K}"><b>Asrama</b></td><td style="${ID_V}">: ${esc(s.asrama||'-')}</td></tr>
      <tr><td style="${ID_K}"><b>Periode Laporan</b></td><td style="${ID_V}">: ${esc(labelPer)} (${esc(rentangTeks)})</td></tr>
      <tr><td style="${ID_K}"><b>${aktif ? 'Total Poin Periode' : 'Total Poin'}</b></td>
          <td style="${ID_V}">: ${poinTampil}${aktif
            ? ` <span style="color:#64748b;font-size:10px;">(akumulasi seluruh riwayat: ${s.total_poin_pelanggaran||0})</span>`
            : ''}</td></tr>
      <tr><td style="${ID_K}"><b>Status Saat Ini</b></td><td style="${ID_V}">: ${esc(s.status_keberadaan||'Hadir')}</td></tr>
    </table>

    <h3 style="${H3}">1. Presensi Madrasah</h3>
    <table style="${TABEL}font-size:11px;">
      <thead><tr>${['Bulan','Hadir','Izin','Sakit','Alpa'].map(th).join('')}</tr></thead>
      <tbody>${baris(data.presensi, p =>
        `<tr>${td(p.bulan)}${td(p.hadir,'text-align:center')}${td(p.izin,'text-align:center')}${td(p.sakit,'text-align:center')}${td(p.alpa,'text-align:center')}</tr>`,
        'Belum ada data presensi.', 5)}</tbody>
    </table>

    <h3 style="${H3}">
      2. Akumulasi Perkembangan${aktif ? ' — ' + esc(labelPer) : ''}</h3>
    <table style="${TABEL}font-size:11px;">
      <thead><tr>${['Kategori','Catatan','Jumlah'].map(th).join('')}</tr></thead>
      <tbody>${baris(rekap, r =>
        `<tr>${td(r.kategori)}${td(r.deskripsi)}${td(r.jumlah,'text-align:center;font-weight:bold')}</tr>`,
        'Tidak ada akumulasi pada periode ini.', 3)}</tbody>
    </table>

    <h3 style="${H3}">
      3. Riwayat Perkembangan${aktif ? ' — ' + esc(labelPer) : ''}</h3>
    <table style="${TABEL}font-size:10.5px;">
      <thead><tr>${['Tanggal','Bidang','Catatan','Kategori','Poin','Bentuk Pembinaan'].map(th).join('')}</tr></thead>
      <tbody>${baris(riwayat, p => {
        const bg = p.overflow ? 'background:#fff4f4;' : '';
        const selPembinaan = p.overflow
          ? `<td style="border:1px solid #cbd5e1;padding:5px;${bg}color:#9F1239;font-weight:bold;">
               ${esc(p.bentukPembinaan)}
               <span style="display:block;font-weight:normal;font-size:9px;color:#94a3b8;">
                 (ke-${p.urutanKategori} dari batas ${p.batas})</span></td>`
          : td(p.bentukPembinaan, bg);
        return `<tr>${td(tgl(p.tanggal), bg)}${td(p.bidang||'-', bg)}${td(p.judul, bg)}`
             + `${td(p.kategori, bg)}${td(p.poin, bg + 'text-align:center')}${selPembinaan}</tr>`;
      }, 'Tidak ada catatan perkembangan pada periode ini.', 6)}</tbody>
    </table>

    <h3 style="${H3}">
      4. Prestasi &amp; Apresiasi${aktif ? ' — ' + esc(labelPer) : ''}</h3>
    <table style="${TABEL}font-size:11px;">
      <thead><tr>${['Tanggal','Kategori','Bentuk Apresiasi','Bidang','Poin'].map(th).join('')}</tr></thead>
      <tbody>${baris(prestasi, r =>
        `<tr>${td(tgl(r.tanggal))}${td(r.kategori||'-')}${td(r.judul||'-')}${td(r.bidang||'-')}`
        + `${td('+' + (Number(r.poin)||0), 'text-align:center;font-weight:bold;color:#8A6D0B')}</tr>`,
        'Belum ada catatan apresiasi pada periode ini.', 5)}
        ${prestasi.length ? `<tr><td colspan="4" style="border:1px solid #cbd5e1;padding:5px;
             text-align:right;font-weight:bold;background:#fafafa;">Total poin apresiasi</td>
           <td style="border:1px solid #cbd5e1;padding:5px;text-align:center;font-weight:bold;
             background:#fafafa;color:#8A6D0B;">+${totalPoinPrestasi}</td></tr>` : ''}
      </tbody>
    </table>

    <h3 style="${H3}">
      5. Capaian Tahfiz${aktif ? ' — ' + esc(labelPer) : ''}</h3>
    <table style="${TABEL}font-size:11px;margin-bottom:7px;">
      <tbody>
        <tr><td style="border:1px solid #cbd5e1;padding:5px;width:60%;">Setoran ziyadah (hafalan baru)</td>
            <td style="border:1px solid #cbd5e1;padding:5px;text-align:right;font-weight:bold;">${thfZiyadah} kali</td></tr>
        <tr><td style="border:1px solid #cbd5e1;padding:5px;">Murajaah (pengulangan)</td>
            <td style="border:1px solid #cbd5e1;padding:5px;text-align:right;font-weight:bold;">${thfMurajaah} kali</td></tr>
        <tr><td style="border:1px solid #cbd5e1;padding:5px;">Halaman terkumpul pada periode ini</td>
            <td style="border:1px solid #cbd5e1;padding:5px;text-align:right;font-weight:bold;">${thfHalaman} hlm (± ${thfJuz} juz)</td></tr>
        <tr><td style="border:1px solid #cbd5e1;padding:5px;">Akumulasi seluruh riwayat</td>
            <td style="border:1px solid #cbd5e1;padding:5px;text-align:right;font-weight:bold;">${thfTotalHalaman} hlm (± ${thfTotalJuz} juz)</td></tr>
        <tr><td style="border:1px solid #cbd5e1;padding:5px;">Kelancaran dominan</td>
            <td style="border:1px solid #cbd5e1;padding:5px;text-align:right;font-weight:bold;">${esc(thfLancar)}</td></tr>
      </tbody>
    </table>
    <table style="${TABEL}font-size:10.5px;">
      <thead><tr>${['Tanggal','Jenis','Surah / Ayat','Halaman','Kelancaran','Musyrif'].map(th).join('')}</tr></thead>
      <tbody>${baris(tahfiz.slice(0, 20), r =>
        `<tr>${td(tgl(r.tanggal))}${td(r.jenis||'-')}`
        + `${td(`${r.surah || '-'}${r.ayat_dari ? ` : ${r.ayat_dari}${r.ayat_ke ? '–' + r.ayat_ke : ''}` : ''}`)}`
        + `${td(Number(r.capaian_halaman)||0, 'text-align:center')}${td(r.kelancaran||'-')}${td(r.musyrif||'-')}</tr>`,
        'Belum ada setoran tahfiz pada periode ini.', 6)}</tbody>
    </table>

    <h3 style="${H3}">
      6. Riwayat Perizinan${aktif ? ' — ' + esc(labelPer) : ''}</h3>
    <table style="${TABEL}font-size:11px;">
      <thead><tr>${['Mulai','Selesai','Jenis','Alasan','Status'].map(th).join('')}</tr></thead>
      <tbody>${baris(data.perizinan, z =>
        `<tr>${td(tgl(z.tanggal_mulai))}${td(tgl(z.tanggal_selesai))}${td(z.jenis_izin)}${td(z.alasan||'-')}${td(z.status_persetujuan)}</tr>`,
        'Tidak ada perizinan pada periode ini.', 5)}</tbody>
    </table>

    <h3 style="${H3}">
      7. Target Pembinaan &amp; Tindak Lanjut</h3>
    <table style="${TABEL}font-size:10.5px;">
      <thead><tr>${['Periode','Target','Indikator Keberhasilan','Status','Evaluasi'].map(th).join('')}</tr></thead>
      <tbody>${baris(goalGabungan, g => {
        const w = /tercapai/i.test(g.status || '') && !/belum/i.test(g.status || '') ? '#0F766E'
                : /sebagian/i.test(g.status || '') ? '#B45309'
                : /belum|batal/i.test(g.status || '') ? '#9F1239' : '#14618B';
        return `<tr>${td(g.periode || '-')}${td(g.judul || '-')}${td(g.indikator || '-')}`
             + `<td style="border:1px solid #cbd5e1;padding:5px;font-weight:bold;color:${w};">
                  ${esc(g.status || 'Berjalan')}</td>`
             + `${td(g.evaluasi || '—')}</tr>`;
      }, 'Belum ada target pembinaan yang ditetapkan.', 5)}</tbody>
    </table>

    <h3 style="${H3}">
      8. Kesimpulan Sementara${aktif ? ' — ' + esc(labelPer) : ''}</h3>
    ${bagianKesimpulanCetak(kesimpulan)}

    ${blokPenutupCetak(data.penanggungJawab, dicetak)}
  </div>`;
}

// ---------- 20g. Pengambilan data & aksi cetak ------------------------

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
      peta.set(kunci, { bulan: `${namaBulan[b - 1] || b} ${th}`, hadir: 0, izin: 0, sakit: 0, alpa: 0 });
    }
    const o = peta.get(kunci);
    o.hadir += Number(r.hadir) || 0;
    o.izin  += Number(r.izin)  || 0;
    o.sakit += Number(r.sakit) || 0;
    o.alpa  += Number(r.alpa)  || 0;
  });
  return [...peta.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([, v]) => v);
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

  // Tabel baru (prestasi, tahfiz, target) belum ada di RPC lama —
  // diambil terpisah dan tidak menggagalkan laporan bila belum dipasang.
  const [prestasi, tahfiz, goal] = await Promise.all([
    amanKosong(async () => {
      const { data: r, error } = await db.from('log_prestasi').select('*')
        .eq('nisn', String(nisn)).order('tanggal', { ascending:false });
      if (error) throw error; return (r || []).filter(aktifPrestasi);
    }, 'prestasi santri'),
    amanKosong(async () => {
      const { data: r, error } = await db.from('log_tahfiz').select('*')
        .eq('nisn', String(nisn)).order('tanggal', { ascending:false });
      if (error) throw error; return (r || []).filter(aktifTahfiz);
    }, 'tahfiz santri'),
    amanKosong(async () => {
      const { data: r, error } = await db.from('goal_santri').select('*')
        .eq('nisn', String(nisn)).order('periode', { ascending:false });
      if (error) throw error; return r || [];
    }, 'target santri')
  ]);

  data.prestasi = prestasi;
  data.tahfiz = tahfiz;
  data.goal = goal;
  return data;
}

/** Nama berkas laporan: selalu membawa periode. */
function namaBerkasLaporan(namaSantri) {
  const bersih = String(namaSantri || 'Santri')
    .trim().replace(/[\\/:*?"<>|]+/g,'').replace(/\s+/g,'_');
  return `Laporan_${bersih}_${berkasPeriode()}.pdf`;
}

/**
 * Tera untuk jalur CETAK peramban.
 *
 * Sengaja BUKAN gambar: elemen ini memakai mask --korps yang sudah
 * tertanam di index.html, jadi tidak ada satu bita pun aset tambahan.
 * `position:fixed` adalah kuncinya — peramban mengulang elemen fixed
 * pada setiap halaman cetak, sehingga tera muncul di semua lembar tanpa
 * perlu tahu ada berapa halaman.
 *
 * Jalur PDF tidak bisa memakai cara ini (html2canvas merender satu
 * kanvas panjang, fixed tidak berulang), jadi di sana teranya digambar
 * per halaman oleh jsPDF — lihat unduhLaporanPdf().
 */
function teraCetakHTML() {
  return korpsMusyrifPutra() ? '<div class="tera-cetak" aria-hidden="true"></div>' : '';
}

async function cetakLaporan(nisn) {
  if (!bolehCetak()) return toast('error', `Role ${role()} tidak memiliki izin cetak.`);
  loading(true);
  try {
    pastikanGayaLembarLaporan();
    const dataMentah = await ambilLaporan(nisn);
    const data = await lengkapiLaporan(saringDataLaporanBulanan(dataMentah));
    $('printArea').innerHTML = teraCetakHTML() + bangunLaporanHTML(data);
    window.print();
  } catch (err) { fireError(err); }
  finally { loading(false); }
}

window.addEventListener('afterprint', () => { $('printArea').innerHTML = ''; });

/* =====================================================================
   20a-1. PENANGKAL GALAT WARNA PADA UNDUH PDF
   =====================================================================
   Gejala: menekan "Unduh PDF" berakhir dengan pesan semacam
     "Attempting to parse an unsupported color function 'oklab'"
   (atau 'oklch' / 'color-mix').

   Sebabnya: html2pdf memakai html2canvas, yang parser warnanya hanya
   mengenal sRGB gaya lama — #hex, rgb(), rgba(), dan nama warna.
   Sistem desain aplikasi ini memakai oklch() dan color-mix(in oklab, …);
   nilai TERHITUNG-nya di Chrome berbentuk oklab()/oklch(), sehingga
   html2canvas menyerah begitu membaca gaya apa pun yang mewarisinya.

   Penting: menimpa variabel warna di #pdfStage saja TIDAK cukup, karena
   html2pdf MEMINDAHKAN elemen laporan keluar dari #pdfStage ke wadahnya
   sendiri (.html2pdf__overlay) di dalam <body> — begitu berpindah,
   penimpaan itu tidak berlaku lagi dan seluruh gaya aplikasi kembali
   mengenai laporan. Itulah sebabnya perbaikan sebelumnya tidak mempan.

   Penyelesaiannya dua lapis, keduanya bekerja pada SALINAN dokumen
   (onclone) sehingga tampilan yang dilihat pengguna tidak berubah:

     Lapis 1 — seluruh <style> aplikasi dilepas dari salinan, diganti
       gaya cetak khusus yang hanya memakai hex. Aman sepenuhnya:
       bangunLaporanHTML() menghasilkan gaya sebaris (inline) dan satu
       kelas .laporan saja, jadi tidak ada gaya yang benar-benar hilang.

     Lapis 2 — jaring pengaman: nilai warna modern yang masih tersisa
       (mis. dari gaya sebaris) diterjemahkan sendiri ke rgb() sebelum
       html2canvas sempat membacanya.
   ===================================================================== */

/* ---------------------------------------------------------------------
   GAYA LEMBAR LAPORAN — SATU SUMBER, DIPAKAI DI DUA TEMPAT

   Ini bagian yang paling mudah diremehkan tetapi paling menentukan.

   html2pdf menghitung letak batas halaman dari dokumen HIDUP (panggung
   #pdfStage), sedangkan html2canvas melukis dari SALINAN dokumen. Bila
   kedua dokumen itu tidak menghasilkan tata letak yang sama persis,
   pembatas halaman yang sudah dihitung akan meleset — dan blok yang
   seharusnya utuh tetap terbelah. Itulah yang terjadi pada kotak
   catatan musyrif: di panggung, judul tabel memakai huruf monospace
   kapital dari gaya aplikasi; di salinan, gaya itu sudah dilepas.

   Karena itu aturan di bawah dipasang DUA KALI dengan isi identik —
   sekali pada panggung, sekali pada salinan — sehingga lembar laporan
   terlepas sepenuhnya dari sistem desain aplikasi dan tampil sama di
   layar, di kertas, dan di PDF.
   --------------------------------------------------------------------- */
function gayaLembarLaporan(lingkup) {
  return `
    ${lingkup}, ${lingkup} * {
      box-sizing:border-box;
      font-family:Arial, Helvetica, sans-serif;
      text-wrap:wrap; letter-spacing:normal; word-spacing:normal;
      animation:none; transition:none; filter:none;
      -webkit-backdrop-filter:none; backdrop-filter:none;
      text-shadow:none; box-shadow:none;
    }
    ${lingkup} { background:#FFFFFF; color:#1e293b; font-size:11px; line-height:1.5; }
    ${lingkup} table { width:100%; border-collapse:collapse; }
    ${lingkup} th, ${lingkup} td { padding:5px 6px; }
    ${lingkup} thead { display:table-header-group; }
    ${lingkup} thead th {
      text-align:left; vertical-align:middle; white-space:normal;
      font-size:9.5px; font-weight:bold; letter-spacing:.5px;
      text-transform:uppercase; color:#475569;
    }
    ${lingkup} tbody td { vertical-align:top; }
    ${lingkup} tr { break-inside:avoid; page-break-inside:avoid; }
    ${lingkup} h1, ${lingkup} h3 { break-after:avoid; page-break-after:avoid; }
    ${lingkup} img { max-width:100%; }
  `;
}

/** Pasang gaya lembar pada dokumen hidup (panggung PDF & area cetak). */
function pastikanGayaLembarLaporan() {
  if (document.getElementById('gaya-lembar-laporan')) return;
  const el = document.createElement('style');
  el.id = 'gaya-lembar-laporan';
  /* Lingkupnya `.laporan` saja — BUKAN `#pdfStage .laporan`.
     Alasannya penting: html2pdf MEMINDAHKAN elemen laporan keluar dari
     #pdfStage ke wadahnya sendiri, dan justru di wadah itulah batas
     halaman dihitung. Kalau aturannya terikat pada #pdfStage, gaya itu
     lepas tepat pada saat paling menentukan — persis penyebab kotak
     catatan tetap terbelah. Kelas .laporan hanya dipakai lembar cetak,
     jadi aman dipakai global. Tanpa @layer, selalu menang atas gaya
     aplikasi. */
  el.textContent = gayaLembarLaporan('.laporan');
  document.head.appendChild(el);
}

/** Gaya cetak hex-saja yang dipasang pada salinan dokumen. */
const GAYA_AMAN_PDF = `
  html, body {
    margin:0; padding:0; background:#FFFFFF; color:#0E2233;
    font-family:Arial, Helvetica, sans-serif;
    -webkit-print-color-adjust:exact; print-color-adjust:exact;
  }
  *, *::before, *::after {
    box-sizing:border-box;
    animation:none !important; transition:none !important;
    filter:none !important; -webkit-backdrop-filter:none !important;
    backdrop-filter:none !important; text-shadow:none !important;
    box-shadow:none !important;
  }
  .html2pdf__overlay, .html2pdf__container { background:#FFFFFF !important; }
  /* Ukuran dasar disamakan persis dengan gaya aplikasi supaya tata letak
     PDF identik dengan hasil cetak (font-size 14px, line-height 1.55). */
  body { font-size:14px; line-height:1.55; }
`;

/* Gaya lembar yang sama persis dengan panggung — inilah yang menjamin
   tata letak salinan identik dengan yang dipakai menghitung halaman. */
const GAYA_LEMBAR_PDF = gayaLembarLaporan('.laporan');

/** Properti CSS yang boleh membawa warna dan dibaca html2canvas. */
const SIFAT_WARNA_PDF = [
  'color', 'background-color', 'background-image',
  'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color',
  'outline-color', 'text-decoration-color', 'column-rule-color', 'caret-color',
  'box-shadow', 'text-shadow', 'fill', 'stroke',
  '-webkit-text-fill-color', '-webkit-text-stroke-color'
];

const RE_WARNA_MODERN = /oklch\(|oklab\(|color-mix\(|\blab\(|\blch\(|\bcolor\(/i;

let _ctxWarnaPdf;
function ctxWarnaPdf() {
  if (_ctxWarnaPdf === undefined) {
    try { _ctxWarnaPdf = document.createElement('canvas').getContext('2d'); }
    catch (e) { _ctxWarnaPdf = null; }
  }
  return _ctxWarnaPdf;
}

/** oklab → sRGB (rumus resmi CSS Color 4). */
function oklabKeRgb(L, a, b, alfa) {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b;
  const l = l_ * l_ * l_, m = m_ * m_ * m_, s = s_ * s_ * s_;

  const lurus = [
     4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
  ];
  const gamma = (c) => {
    c = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(Math.max(c, 0), 1 / 2.4) - 0.055;
    return Math.round(Math.min(1, Math.max(0, c)) * 255);
  };
  const [r, g, bi] = lurus.map(gamma);
  const a2 = (alfa == null || !isFinite(alfa)) ? 1 : Math.min(1, Math.max(0, alfa));
  return a2 >= 1 ? `rgb(${r}, ${g}, ${bi})` : `rgba(${r}, ${g}, ${bi}, ${Math.round(a2 * 1000) / 1000})`;
}

/** Warna apa pun → [r, g, b, a] dengan r/g/b 0–255. null bila gagal. */
function uraiRgba(teks) {
  let t = String(teks || '').trim().toLowerCase();
  if (!t) return null;
  if (t === 'transparent') return [0, 0, 0, 0];
  if (t === 'currentcolor' || t === 'none') return null;

  if (t[0] === '#') {
    const h = t.slice(1);
    const p = (s) => parseInt(s, 16);
    if (h.length === 3 || h.length === 4) {
      return [p(h[0] + h[0]), p(h[1] + h[1]), p(h[2] + h[2]),
              h.length === 4 ? p(h[3] + h[3]) / 255 : 1];
    }
    if (h.length === 6 || h.length === 8) {
      return [p(h.slice(0, 2)), p(h.slice(2, 4)), p(h.slice(4, 6)),
              h.length === 8 ? p(h.slice(6, 8)) / 255 : 1];
    }
    return null;
  }

  const m = /^rgba?\(([^)]*)\)$/.exec(t);
  if (m) {
    const bag = m[1].split(/[\s,/]+/).filter(Boolean);
    if (bag.length < 3) return null;
    const n = (v, skala) => v.endsWith('%') ? parseFloat(v) / 100 * skala : parseFloat(v);
    const a = bag[3] == null ? 1 : (bag[3].endsWith('%') ? parseFloat(bag[3]) / 100 : parseFloat(bag[3]));
    return [n(bag[0], 255), n(bag[1], 255), n(bag[2], 255), isFinite(a) ? a : 1];
  }

  if (RE_WARNA_MODERN.test(t)) {
    const hasil = hitungWarnaModern(t);
    return hasil ? uraiRgba(hasil) : null;
  }

  // Nama warna yang benar-benar dipakai berkas ini — dijawab langsung
  // supaya tidak bergantung pada dukungan peramban.
  const NAMA = {
    white: [255, 255, 255, 1], black: [0, 0, 0, 1],
    silver: [192, 192, 192, 1], gray: [128, 128, 128, 1], grey: [128, 128, 128, 1]
  };
  if (NAMA[t]) return NAMA[t].slice();

  // Nama warna lain — serahkan ke peramban.
  const ctx = ctxWarnaPdf();
  if (ctx) {
    try {
      ctx.fillStyle = '#010203';
      ctx.fillStyle = t;
      const hasil = ctx.fillStyle;
      if (typeof hasil === 'string' && hasil !== '#010203') return uraiRgba(hasil);
    } catch (e) {}
  }
  return null;
}

function rgbaKeTeks(r, g, b, a) {
  const k = (c) => Math.round(Math.min(255, Math.max(0, c)));
  const a2 = (a == null || !isFinite(a)) ? 1 : Math.min(1, Math.max(0, a));
  return a2 >= 1 ? `rgb(${k(r)}, ${k(g)}, ${k(b)})`
                 : `rgba(${k(r)}, ${k(g)}, ${k(b)}, ${Math.round(a2 * 1000) / 1000})`;
}

/**
 * Pengganti color-mix(). Pencampuran dilakukan di ruang sRGB dengan
 * alfa terpramultiplikasi — persis seperti aturan CSS untuk kasus yang
 * dipakai berkas ini (campuran dengan `transparent` dan dengan `white`),
 * sehingga hasilnya sama dengan yang dilihat pengguna di layar.
 */
function campurWarna(isi) {
  const bagian = [];
  let dalam = 0, kini = '';
  for (const c of isi) {
    if (c === '(') dalam++;
    if (c === ')') dalam--;
    if (c === ',' && dalam === 0) { bagian.push(kini); kini = ''; }
    else kini += c;
  }
  bagian.push(kini);
  if (bagian.length < 3) return null;

  const ambil = (teks) => {
    const t = teks.trim();
    const m = /^([\s\S]+?)\s+([\d.]+)%$/.exec(t) || /^([\d.]+)%\s+([\s\S]+)$/.exec(t);
    if (!m) return { warna: t, bagi: null };
    return /%$/.test(m[2] + '%') && /^[\d.]+$/.test(m[2])
      ? { warna: m[1].trim(), bagi: parseFloat(m[2]) / 100 }
      : { warna: m[2].trim(), bagi: parseFloat(m[1]) / 100 };
  };

  const a = ambil(bagian[1]), b = ambil(bagian[2]);
  let pa = a.bagi, pb = b.bagi;
  if (pa == null && pb == null) { pa = pb = 0.5; }
  else if (pa == null) pa = 1 - pb;
  else if (pb == null) pb = 1 - pa;
  const total = pa + pb;
  if (!total) return null;
  pa /= total; pb /= total;

  const ca = uraiRgba(a.warna), cb = uraiRgba(b.warna);
  if (!ca || !cb) return null;

  const alfa = ca[3] * pa + cb[3] * pb;
  if (alfa <= 0) return 'rgba(0, 0, 0, 0)';
  const kanal = (i) => (ca[i] * ca[3] * pa + cb[i] * cb[3] * pb) / alfa;
  return rgbaKeTeks(kanal(0), kanal(1), kanal(2), alfa);
}

/** Menghitung sendiri oklch()/oklab()/color(srgb …)/color-mix() → rgb(). */
function hitungWarnaModern(teks) {
  const m = /^\s*([a-z-]+)\(([\s\S]*)\)\s*$/i.exec(String(teks).trim());
  if (!m) return null;
  const nama = m[1].toLowerCase();
  if (nama === 'color-mix') return campurWarna(m[2]);
  const potong = m[2].split('/');
  const bagian = potong[0].trim().split(/[\s,]+/).filter(Boolean);

  let alfa = 1;
  if (potong.length > 1) {
    const t = potong[potong.length - 1].trim();
    alfa = t.endsWith('%') ? parseFloat(t) / 100 : parseFloat(t);
  }
  const angka = (t, skala) => {
    t = String(t == null ? '' : t).trim();
    if (t === 'none' || t === '') return 0;
    return t.endsWith('%') ? (parseFloat(t) / 100) * skala : parseFloat(t);
  };

  if (nama === 'oklab' || nama === 'oklch') {
    if (bagian.length < 3) return null;
    const L = angka(bagian[0], 1);
    let A, B;
    if (nama === 'oklch') {
      const C = angka(bagian[1], 0.4);
      const H = String(bagian[2]).trim();
      let sudut = parseFloat(H) || 0;
      if (/rad$/i.test(H)) sudut = sudut * 180 / Math.PI;
      else if (/turn$/i.test(H)) sudut *= 360;
      else if (/grad$/i.test(H)) sudut *= 0.9;
      const r = sudut * Math.PI / 180;
      A = C * Math.cos(r); B = C * Math.sin(r);
    } else {
      A = angka(bagian[1], 0.4); B = angka(bagian[2], 0.4);
    }
    if (![L, A, B].every(isFinite)) return null;
    return oklabKeRgb(L, A, B, alfa);
  }

  if (nama === 'color') {
    const ruang = (bagian.shift() || '').toLowerCase();
    if (!/^(srgb|srgb-linear|display-p3|a98-rgb|prophoto-rgb|rec2020)$/.test(ruang)) return null;
    if (bagian.length < 3) return null;
    let [r, g, b] = bagian.slice(0, 3).map(t => angka(t, 1));
    if (ruang === 'srgb-linear') {
      const gamma = (c) => c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(Math.max(c, 0), 1 / 2.4) - 0.055;
      r = gamma(r); g = gamma(g); b = gamma(b);
    }
    const k = (c) => Math.round(Math.min(1, Math.max(0, c)) * 255);
    const a2 = isFinite(alfa) ? Math.min(1, Math.max(0, alfa)) : 1;
    return a2 >= 1 ? `rgb(${k(r)}, ${k(g)}, ${k(b)})`
                   : `rgba(${k(r)}, ${k(g)}, ${k(b)}, ${a2})`;
  }
  return null;
}

/** Satu nilai warna apa pun → sRGB yang dimengerti html2canvas. */
function warnaKeSrgb(nilai) {
  const teks = String(nilai || '').trim();
  if (!teks) return null;

  // 1) Biarkan mesin peramban yang menghitung, bila ia mau.
  const ctx = ctxWarnaPdf();
  if (ctx) {
    try {
      ctx.fillStyle = '#010203';
      ctx.fillStyle = teks;
      const hasil = ctx.fillStyle;
      if (typeof hasil === 'string' && /^(#|rgb)/i.test(hasil) &&
          !(hasil.toLowerCase() === '#010203' && !/^#010203$/i.test(teks))) {
        return hasil;
      }
    } catch (e) { /* lanjut ke perhitungan manual */ }
  }
  // 2) Hitung sendiri.
  return hitungWarnaModern(teks);
}

/**
 * Mengganti setiap fungsi warna modern di dalam sebuah nilai CSS
 * (termasuk yang bersarang di gradasi & bayangan) dengan rgb().
 * Tanda kurung dihitung berpasangan supaya gradasi rumit tetap utuh.
 */
function gantiFungsiWarna(teks) {
  const re = /\b(color-mix|oklch|oklab|lab|lch|color)\(/gi;
  let hasil = '', i = 0, m;
  while ((m = re.exec(teks)) !== null) {
    const mulai = m.index;
    let j = re.lastIndex, dalam = 1;
    while (j < teks.length && dalam > 0) {
      const c = teks[j];
      if (c === '(') dalam++;
      else if (c === ')') dalam--;
      j++;
    }
    const potongan = teks.slice(mulai, j);
    hasil += teks.slice(i, mulai) + (warnaKeSrgb(potongan) || 'rgba(0, 0, 0, 0)');
    i = j; re.lastIndex = j;
  }
  return hasil + teks.slice(i);
}

/** Jaring pengaman: terjemahkan sisa warna modern di salinan dokumen. */
function normalisasiWarnaPdf(doc, akar) {
  const jendela = doc.defaultView || window;
  const daftar = [];
  if (doc.documentElement) daftar.push(doc.documentElement);
  if (doc.body) daftar.push(doc.body);
  const pangkal = akar || doc.body || doc.documentElement;
  if (pangkal) {
    daftar.push(pangkal);
    pangkal.querySelectorAll('*').forEach(el => daftar.push(el));
  }
  daftar.forEach(el => {
    let gaya;
    try { gaya = jendela.getComputedStyle(el); } catch (e) { return; }
    if (!gaya) return;
    for (const sifat of SIFAT_WARNA_PDF) {
      let nilai;
      try { nilai = gaya.getPropertyValue(sifat); } catch (e) { continue; }
      if (!nilai || !RE_WARNA_MODERN.test(nilai)) continue;
      try { el.style.setProperty(sifat, gantiFungsiWarna(nilai), 'important'); } catch (e) {}
    }
  });
}

/**
 * AKAR MASALAHNYA ADA DI SINI.
 *
 * Sebelum menyalin apa pun, html2canvas membaca warna latar <html> dan
 * <body> dari HALAMAN ASLI — bukan dari salinan:
 *
 *     documentBackgroundColor = parseColor(getComputedStyle(
 *         ownerDocument.documentElement).backgroundColor)
 *     bodyBackgroundColor     = parseColor(getComputedStyle(
 *         ownerDocument.body).backgroundColor)
 *
 * `body { background: var(--paper) }` bernilai oklch(98% .005 240) di
 * Chrome, dan html2canvas langsung menyerah di baris itu — jauh sebelum
 * laporan sempat disentuh. Itulah sebabnya semua percobaan menimpa warna
 * di #pdfStage tidak pernah berhasil: yang dibaca bukan #pdfStage.
 *
 * Penyelesaiannya: selama beberapa saat proses render, latar <html> dan
 * <body> asli ditulis sebagai hex sRGB, lalu dikembalikan persis seperti
 * semula. Pengguna tidak melihat apa pun berubah karena layar sedang
 * tertutup #pdfMask.
 */
function amankanLatarDokumen() {
  const el = document.documentElement, body = document.body;
  const lamaEl = el.style.backgroundColor;
  const lamaBody = body.style.backgroundColor;
  let latarBody = '#F6F9FC';
  try { latarBody = warnaKeSrgb(getComputedStyle(body).backgroundColor) || latarBody; } catch (e) {}
  el.style.backgroundColor = '#FFFFFF';
  body.style.backgroundColor = latarBody;
  return () => {
    el.style.backgroundColor = lamaEl;
    body.style.backgroundColor = lamaBody;
  };
}

/* ---------------------------------------------------------------------
   PAGINASI BLOK UTUH — DIKERJAKAN SENDIRI, DI ATAS SALINAN

   Mesin paginasi bawaan html2pdf memakai tinggi halaman
   `pageSize.inner.px.height` (dibulatkan ke bawah dari milimeter),
   sedangkan pemotong gambarnya memakai `canvas.width × rasio`. Kedua
   angka itu berbeda sekitar 0,7 px per halaman — cukup untuk membuat
   sebuah blok yang "menurut hitungan" masih muat, ternyata terpotong
   beberapa piksel di bawah garis halaman. Ditambah lagi, hitungannya
   dilakukan pada dokumen HIDUP, sementara yang benar-benar dilukis
   adalah SALINANNYA.

   Karena itu penataan blok penting (penutup laporan) dikerjakan di sini:
   pada salinan, tepat sebelum dilukis, dengan tinggi halaman yang
   dihitung dari lebar kanvas yang sesungguhnya. Ditambah kelonggaran
   beberapa piksel, blok bertanda `blok-utuh` dijamin berpindah utuh ke
   halaman berikutnya — bukan "hampir selalu", tetapi selalu.
   --------------------------------------------------------------------- */

let _halamanPdf = null;   // { skala, rasio } — diisi sebelum render

function rapikanHalamanKlon(doc) {
  const o = _halamanPdf;
  if (!o || !o.rasio || !o.skala) return;

  const akar = doc.querySelector('.laporan');
  if (!akar) return;
  const kotakAkar = akar.getBoundingClientRect();
  if (!kotakAkar.width) return;

  // Tinggi satu halaman dalam piksel CSS, dihitung persis seperti
  // pemotong gambar html2pdf: floor(lebar kanvas × rasio) ÷ skala.
  const lebarKanvas = Math.ceil(kotakAkar.width * o.skala);
  const tinggiHal = Math.floor(lebarKanvas * o.rasio) / o.skala;
  if (!(tinggiHal > 80)) return;

  const AMAN = 9;    // kelonggaran pembulatan, tak terlihat mata
  const IKUT = 112;  // ruang minimum yang harus tersisa di bawah sebuah judul

  const ganjalSebelum = (el, tinggi) => {
    if (!(tinggi > 0)) return;
    const g = doc.createElement('div');
    g.setAttribute('data-ganjal', '');
    g.style.cssText = `display:block;height:${Math.round(tinggi)}px;`;
    el.parentNode.insertBefore(g, el);
  };

  /* Judul bagian tidak boleh tertinggal sendirian di kaki halaman.
     Kalau ruang tersisa di bawahnya tidak cukup untuk menampung kepala
     tabel beserta satu barisnya, judul ikut pindah ke halaman berikut —
     aturan penyusunan huruf yang membedakan dokumen resmi dari cetakan
     seadanya. */
  akar.querySelectorAll('h3').forEach((judul) => {
    if (!judul.previousElementSibling) return;
    const atasAkar = akar.getBoundingClientRect().top;
    const atas = judul.getBoundingClientRect().top - atasAkar;
    const hal = Math.floor(atas / tinggiHal);
    const sisa = (hal + 1) * tinggiHal - atas;
    if (sisa >= IKUT) return;
    ganjalSebelum(judul, sisa + AMAN);
  });

  akar.querySelectorAll('.blok-utuh').forEach((el) => {
    const atasAkar = akar.getBoundingClientRect().top;
    const r = el.getBoundingClientRect();
    const atas = r.top - atasAkar;
    const bawah = r.bottom - atasAkar;

    if (r.height + AMAN * 2 > tinggiHal) return;          // memang lebih tinggi dari satu halaman
    const hal = Math.floor(atas / tinggiHal);
    if (bawah + AMAN <= (hal + 1) * tinggiHal) return;    // sudah utuh di halamannya

    ganjalSebelum(el, (hal + 1) * tinggiHal - atas + AMAN);
  });
}

/** Dipanggil html2canvas atas salinan dokumen, sebelum dilukis. */
function siapkanKlonPdf(doc) {
  try {
    // Lapis 1 — lepas seluruh gaya aplikasi, pasang gaya cetak hex-saja.
    doc.querySelectorAll('style').forEach(n => n.remove());
    doc.querySelectorAll('link[rel="stylesheet"]').forEach(n => {
      const href = n.getAttribute('href') || '';
      if (!/fonts\.googleapis\.com|font-?awesome/i.test(href)) n.remove();
    });
    const gaya = doc.createElement('style');
    gaya.textContent = GAYA_AMAN_PDF + GAYA_LEMBAR_PDF;
    (doc.head || doc.documentElement).appendChild(gaya);

    // Buang bagian aplikasi yang tidak ikut dicetak (mempercepat render).
    doc.querySelectorAll('#loginScreen, #appShell, #bar, #scrim, .tabbar, #pdfMask, #pdfStage, #printArea, .swal2-container')
       .forEach(n => n.remove());

    if (doc.documentElement) {
      doc.documentElement.removeAttribute('class');
      doc.documentElement.style.background = '#FFFFFF';
    }
    if (doc.body) {
      doc.body.style.background = '#FFFFFF';
      doc.body.style.color = '#0E2233';
    }

    // Lapis 2 — jaring pengaman untuk gaya sebaris yang tersisa.
    normalisasiWarnaPdf(doc, doc.querySelector('.laporan') || doc.body);

    // Lapis 3 — pastikan blok penutup tidak terbelah antar halaman.
    rapikanHalamanKlon(doc);
  } catch (e) {
    console.warn('[PDF] Penyiapan salinan gagal, lanjut apa adanya:', e);
  }
}

/* ---------------------------------------------------------------------
   Ukuran kertas A4 dan area cetaknya. Satu sumber angka untuk margin
   jsPDF, lebar panggung render, dan kaki halaman — supaya perhitungan
   batas halaman html2pdf tidak pernah lagi meleset.
   --------------------------------------------------------------------- */
const MARGIN_MM      = 13;                       // sama dengan @page pada cetak
const LEBAR_KERTAS_MM = 210;                     // A4 potret
const TINGGI_KERTAS_MM = 297;
const LEBAR_CETAK_PX  = Math.floor(
  (LEBAR_KERTAS_MM - MARGIN_MM * 2) / 25.4 * 96  // 96 dpi, seperti hitungan html2pdf
);

/**
 * Unduh PDF memakai panggung render terpisah (#pdfStage), bukan #printArea.
 * html2canvas berjalan pada media screen sehingga elemen harus benar-benar
 * memiliki layout di viewport, kalau tidak hasilnya halaman putih.
 * Data yang dipakai IDENTIK dengan hasil cetak (periode yang sama).
 */
async function unduhLaporanPdf(nisn) {
  if (!bolehPdf()) return toast('error', `Role ${role()} tidak memiliki izin unduh PDF.`);
  if (typeof window.html2pdf !== 'function') {
    return fireError(new Error('Pustaka html2pdf belum termuat. Pastikan index.html versi terbaru sudah dipasang.'));
  }

  const stage = $('pdfStage'), mask = $('pdfMask');
  let htmlLaporan = '';
  let pulihkanLatar = () => {};
  loading(true);
  try {
    pastikanGayaLembarLaporan();
    const dataMentah = await ambilLaporan(nisn);
    const data = await lengkapiLaporan(saringDataLaporanBulanan(dataMentah));
    htmlLaporan = bangunLaporanHTML(data);
    stage.innerHTML = htmlLaporan;

    /* -------------------------------------------------------------
       INI YANG MEMBUAT KOTAK CATATAN TIDAK LAGI TERPOTONG.

       html2pdf menghitung batas halaman dengan `pageSize.inner.px.height`,
       tetapi memotong gambar hasil render dengan `canvas.width × rasio`.
       Kedua angka itu hanya sama bila lebar elemen sumber PERSIS sama
       dengan lebar area cetak. Selama ini panggung dibuat 210 mm (lebar
       kertas penuh), padahal area cetaknya 210 − 2×13 mm — selisihnya
       menggeser batas halaman sekitar 88 px per halaman, sehingga
       `page-break-inside: avoid` selalu meleset dan blok mana pun bisa
       terbelah.

       Dengan menyamakan lebar panggung ke lebar area cetak, perhitungan
       html2pdf menjadi tepat dan blok yang ditandai `blok-utuh` benar-
       benar berpindah utuh ke halaman berikutnya.
       ------------------------------------------------------------- */
    stage.style.width = LEBAR_CETAK_PX + 'px';
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

    const nama = namaBerkasLaporan(data.siswa?.nama_siswa);
    const kakiSantri = `${data.siswa?.nama_siswa || 'Santri'} · ${data.siswa?.nisn || ''}`.trim();
    pulihkanLatar = amankanLatarDokumen();

    /* Ketajaman lembar ditentukan di sini, bukan oleh layar.
       Sebelumnya skala mengikuti devicePixelRatio, sehingga laptop biasa
       merender pada 1,5x — setara +-145 dpi. Itulah penyebab foto dan
       huruf terlihat kabur begitu dicetak. Sasarannya kini tetap 3x
       (+-290 dpi, setara mutu cetak), dan hanya diturunkan otomatis bila
       laporannya sangat panjang sehingga luas kanvas mendekati batas
       aman peramban. */
    const LUAS_KANVAS_MAKS = 2.4e8;
    const skala = Math.max(2, Math.min(3,
      Math.sqrt(LUAS_KANVAS_MAKS / Math.max(1, rect.width * rect.height))));
    _halamanPdf = {
      skala,
      rasio: (TINGGI_KERTAS_MM - MARGIN_MM * 2) / (LEBAR_KERTAS_MM - MARGIN_MM * 2)
    };

    const pekerja = window.html2pdf().set({
      margin: [MARGIN_MM, MARGIN_MM, MARGIN_MM, MARGIN_MM], filename: nama,
      /* 0,90 bukan 1,0. Pada halaman berisi teks dan garis tabel selisih
         keduanya tidak terlihat mata, sedangkan ukuran berkasnya berbeda
         tiga sampai empat kali lipat — dan itu yang menentukan apakah 400
         laporan muat di satu folder atau tidak. */
      image: { type:'jpeg', quality:0.90 },
      html2canvas: {
        scale: skala,
        useCORS:true, backgroundColor:'#ffffff', logging:false,
        scrollX:0, scrollY:0, imageTimeout:15000,
        onclone: siapkanKlonPdf
      },
      jsPDF: { unit:'mm', format:'a4', orientation:'portrait', compress:true },
      // Baris tabel & judul bagian ditangani mesin bawaan html2pdf;
      // blok penutup (`.blok-utuh`) ditangani rapikanHalamanKlon() yang
      // hitungannya tepat sampai piksel terakhir.
      pagebreak: { mode:['css','legacy'], avoid:['tr','h3'] }
    }).from(root).toPdf();

    // Kaki halaman resmi: identitas santri di kiri, nomor halaman di kanan.
    // Pembaca langsung tahu bila ada lembar yang hilang.
    await pekerja.get('pdf').then((pdf) => {
      try {
        const jml = pdf.internal.getNumberOfPages();
        const lebar = pdf.internal.pageSize.getWidth();
        const tinggi = pdf.internal.pageSize.getHeight();

        /* Tera lambang korps, digambar per halaman.
           Alias 'teraKorps' membuat jsPDF menyimpan bitmapnya SEKALI dan
           merujuknya ulang di halaman berikutnya — tanpa alias, berkas
           membengkak sebanyak jumlah halaman. */
        const adaTera = korpsMusyrifPutra();
        const teraL = 112;                       // mm
        const teraT = teraL * 295 / 512;         // rasio lambang

        for (let i = 1; i <= jml; i++) {
          pdf.setPage(i);
          if (adaTera) {
            try {
              pdf.addImage(KORPS_TERA, 'PNG',
                (lebar - teraL) / 2, (tinggi - teraT) / 2, teraL, teraT,
                'teraKorps', 'FAST');
            } catch (e) { console.warn('[PDF] Tera dilewati:', e.message); }
          }
          pdf.setFont('helvetica', 'normal');
          pdf.setFontSize(7.5);
          pdf.setTextColor(150, 160, 172);
          pdf.text(kakiSantri, MARGIN_MM, tinggi - 6);
          pdf.text(`Halaman ${i} dari ${jml}`, lebar - MARGIN_MM, tinggi - 6, { align: 'right' });
        }
      } catch (e) { console.warn('[PDF] Kaki halaman dilewati:', e.message); }
    });

    await pekerja.save(nama);

    toast('success', `PDF ${data.periodeAktif ? labelPeriode() : 'lengkap'} berhasil diunduh.`);
  } catch (err) {
    // Bila peramban tetap menolak (mis. versi lama tanpa dukungan warna
    // yang dipakai perangkat pengguna), laporan tidak dibiarkan hilang:
    // dialihkan ke dialog cetak, dan dari sana bisa "Simpan sebagai PDF".
    const pesan = String(err && (err.message || err));
    if (/unsupported color|color function|oklab|oklch|color-mix/i.test(pesan) && htmlLaporan) {
      console.warn('[PDF] html2canvas menolak warna, beralih ke dialog cetak:', pesan);
      toast('warning', 'Peramban menolak render warna. Dialihkan ke dialog cetak — pilih "Simpan sebagai PDF".');
      $('printArea').innerHTML = htmlLaporan;
      pulihkanLatar();
      stage.classList.remove('on'); stage.innerHTML = '';
      mask.classList.remove('on'); loading(false);
      setTimeout(() => window.print(), 220);
      return;
    }
    fireError(err);
  }
  finally {
    pulihkanLatar();
    stage.classList.remove('on'); stage.innerHTML = '';
    stage.style.removeProperty('width');
    mask.classList.remove('on');
    loading(false);
  }
}
// ---------------------------------------------------------------------
// 20b. CETAK REKAP BULANAN (laporan rutin pendidik)
// ---------------------------------------------------------------------
async function cetakRekapBulanan(rows, sumberLabel) {
  if (!bolehCetak()) return toast('error', `Role ${role()} tidak memiliki izin cetak.`);
  if (!rows.length) return toast('error', 'Tidak ada data pada periode ini.');

  const th = (t) => `<th style="border:1px solid #cbd5e1;padding:5px;background:#f1f5f9;">${esc(t)}</th>`;
  const td = (t, c) => `<td style="border:1px solid #cbd5e1;padding:5px;${c||''}">${esc(t)}</td>`;
  const totalKasus = rows.reduce((a, s) => a + s.daftar.reduce((x, d) => x + d.jumlah, 0), 0);

  let no = 0;
  const isi = rows.map(s => s.daftar.map((d, i) => `<tr>
      ${i === 0 ? `<td rowspan="${s.daftar.length}" style="border:1px solid #cbd5e1;padding:5px;text-align:center">${++no}</td>
        <td rowspan="${s.daftar.length}" style="border:1px solid #cbd5e1;padding:5px"><b>${esc(s.nama)}</b><br>
        <span style="font-size:9.5px;color:#64748b">${esc(s.nisn)}</span></td>
        <td rowspan="${s.daftar.length}" style="border:1px solid #cbd5e1;padding:5px;text-align:center">${esc(s.kelas)}</td>` : ''}
      ${td(d.kategori)}${td(d.deskripsi)}${td(d.jumlah, 'text-align:center;font-weight:bold')}
    </tr>`).join('')).join('');

  // Kop yang sama dengan laporan santri — dokumen resmi dari lembaga
  // yang sama tidak boleh berkop berbeda.
  const logoKorps = await dataUriGambar(ASET.korps);

  $('printArea').innerHTML = teraCetakHTML() + `
    <div class="laporan" style="font-family:Arial,sans-serif;color:#1e293b;padding:18px;">
      ${kopLaporan(logoKorps)}
      <div style="text-align:center;padding:13px 0 12px;margin-bottom:14px;
                  border-bottom:1px solid #cbd5e1;">
        <h1 style="font-size:16px;margin:0;letter-spacing:.3px;">LAPORAN BULANAN KEDISIPLINAN SANTRI</h1>
        <p style="font-size:11px;margin:4px 0 0;color:#64748b;">
          ${esc(sumberLabel)} · Periode ${esc(labelPeriode())}</p>
      </div>
      <table style="width:100%;font-size:11.5px;margin-bottom:12px;">
        <tr><td style="width:150px"><b>Unit Operasional</b></td><td>: ${esc(labelKonteks())}</td>
            <td style="width:130px"><b>Jumlah Santri</b></td><td>: ${rows.length}</td></tr>
        <tr><td><b>Dasar Penyaringan</b></td><td>: Tanggal ${esc(APP.periode.basis)}</td>
            <td><b>Total Catatan</b></td><td>: ${totalKasus}</td></tr>
        <tr><td><b>Disusun oleh</b></td><td>: ${esc(APP.profil?.nama || '-')} (${esc(role())})</td>
            <td><b>Dicetak</b></td><td>: ${tgl(hariIni())}</td></tr>
      </table>
      <table style="width:100%;font-size:10.5px;border-collapse:collapse;">
        <thead><tr>${['No','Nama Santri','Kelas','Kategori','Catatan / Perkembangan','Jumlah'].map(th).join('')}</tr></thead>
        <tbody>${isi}</tbody>
      </table>
      <table style="width:100%;font-size:11.5px;margin-top:34px;page-break-inside:avoid;">
        <tr><td style="width:50%;text-align:center;">Mengetahui, Pimpinan Dayah</td>
            <td style="width:50%;text-align:center;">Petugas Pencatat</td></tr>
        <tr><td style="height:56px;"></td><td></td></tr>
        <tr><td style="text-align:center;">(________________________)</td>
            <td style="text-align:center;">(________________________)</td></tr>
      </table>
    </div>`;
  window.print();
}

// ---------------------------------------------------------------------
// 21. REALTIME
// ---------------------------------------------------------------------
const segarkan = debounce(async (tabel) => {
  if (tabel === 'log_perizinan') {
    cacheHapus('izin'); refreshBadgePending();
    if (APP.view === 'perizinan') gambarIzin();
    if (['dashboard','pimpinan','bk','pengasuhan'].includes(APP.view)) navigateTo(APP.view);
  } else if (tabel === 'pesan_bk') {
    cacheHapus('laporan_bina');
    refreshBadgePesan();
    if (APP.view === 'pesan') muatViewPesan();
    else if (APP.view === 'bk') gambarPanelPesanBk();
    else if (APP.view === 'pembinaan') gambarBina();
  } else if (tabel === 'log_pelanggaran' || tabel === 'detail_data') {
    cacheHapus('detail','siswa');
    if (APP.view === 'pelanggaran') muatTabelPlg();
    else if (APP.view === 'rekap') gambarRekap();
    else if (['dashboard','pimpinan','bk','pengasuhan'].includes(APP.view)) navigateTo(APP.view);
  } else if (tabel === 'log_pembinaan') {
    cacheHapus('pembinaan', 'laporan_bina');
    if (APP.view === 'pembinaan') gambarBina();
    else if (APP.view === 'rekapbina') gambarRb();
  } else if (tabel === 'log_prestasi') {
    cacheHapus('prestasi');
    if (APP.view === 'prestasi') gambarPrestasi();
    else if (['dashboard','pimpinan','bk'].includes(APP.view)) navigateTo(APP.view);
  } else if (tabel === 'log_tahfiz') {
    cacheHapus('tahfiz');
    if (APP.view === 'tahfiz') thfGambarPanel();
  }
}, 700);

function aktifkanRealtime() {
  APP.channel = db.channel('rq-live')
    .on('postgres_changes', { event:'*', schema:'public', table:'log_perizinan' }, () => segarkan('log_perizinan'))
    .on('postgres_changes', { event:'*', schema:'public', table:'log_pelanggaran' }, () => segarkan('log_pelanggaran'))
    .on('postgres_changes', { event:'*', schema:'public', table:'log_pembinaan' }, () => segarkan('log_pembinaan'))
    .on('postgres_changes', { event:'*', schema:'public', table:'pesan_bk' }, () => segarkan('pesan_bk'))
    .on('postgres_changes', { event:'*', schema:'public', table:'log_prestasi' }, () => segarkan('log_prestasi'))
    .on('postgres_changes', { event:'*', schema:'public', table:'log_tahfiz' }, () => segarkan('log_tahfiz'))
    .subscribe((status) => {
      $('liveDot').classList.toggle('on', status === 'SUBSCRIBED');
    });
}

// Perbarui badge izin & pesan saat pengguna kembali ke tab.
window.addEventListener('focus', () => { refreshBadgePending(); refreshBadgePesan(); });
setInterval(() => { if (APP.profil) { refreshBadgePending(); refreshBadgePesan(); } }, 60_000);

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
  const rows = filterBinaanUnit((await muatSiswa()).filter(aktifSantri), 'kelas');
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
  // Penjagaan duplikat didahulukan: bertanya setelah tersimpan sudah
  // terlambat, karena trigger pembinaan berjalan di detik yang sama.
  const dup = await cariDuplikatPelanggaran(payload.p_nisn, payload.p_kode, payload.p_tanggal);
  if (dup && !(await konfirmasiDuplikatPelanggaran(dup, payload.p_kode))) return null;

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
  const bolehIsi = bolehTulis();

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
      ${bolehIsi && m
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
  const bolehIsi = bolehTulis();

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
      ${bolehIsi
        ? `<button class="btn btn-ghost btn-sm" data-ai="massal">
             <i class="fa-solid fa-users-rectangle"></i>Input Massal</button>
           <button class="btn btn-primary btn-sm" id="mpSimpan">
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
  if (!bisa('presensi.lihat')) {
    return kartu('Rekap Presensi Kelas', `
      <div class="card-note"><i class="fa-solid fa-lock"></i>
        Akses terbatas. Fitur presensi hanya untuk
        <b>${esc(HAK['presensi.lihat'].join(', '))}</b>.</div>`,
      '<span class="tag tag-off">Akses ditolak</span>');
  }

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
        ${bisa('presensi.isi')
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
  if (!MDS.siapPresensi || !$('prSemester')) return;

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
//     Panel menempel sendiri ke #viewRoot pada akhir viewPimpinan(),
//     sehingga template besar dashboard tidak perlu disentuh.
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

async function gambarKinerjaGuru() {
  const d = stKg.data || {};
  const r = d.ringkasan || {};
  const rank = d.ranking || [];
  const belum = Number(d.belum_terpetakan || 0);
  const b = d.bobot || {};
  const maks = Math.max(1, ...rank.map(g => Number(g.skor_kinerja) || 0));

  // Foto asli banyak guru sekaligus, satu query — lihat modul FOTO PROFIL.
  const petaFoto = await muatFotoBanyak('profil_guru', rank.map(g => g.guru_id));

  const ROLE = ['Semua','Admin','Guru','Walas','Guru BK','Guru Piket','Ustadz GEN-Z','Osis'];
  const num = (v, warna) => `<td class="kg-num ${v ? '' : 'nol'}"
    ${v && warna ? `style="color:${warna}"` : ''}>${angka(v)}</td>`;

  const baris = rank.map(g => {
    const skor = Number(g.skor_kinerja) || 0;
    const kelas = [g.peringkat <= 3 && skor > 0 ? 'top' : '',
                   g.total_aktivitas ? '' : 'pasif'].filter(Boolean).join(' ');
    const fotoUrl = petaFoto[g.guru_id];
    const avatarIsi = fotoUrl
      ? `<img src="${esc(fotoUrl)}" alt="${esc(g.nama || '')}"
           data-fallback-nama="${esc(g.nama || '')}" data-fallback-role="${esc(g.role || '')}">`
      : esc((g.nama || '?').charAt(0).toUpperCase());
    return `<tr class="${kelas}">
      <td class="center" style="width:58px">
        <span class="kg-rank ${skor > 0 && g.peringkat <= 3 ? 'g' + g.peringkat : ''}">${g.peringkat}</span></td>
      <td><div class="kg-guru">
        <div class="kg-av">${avatarIsi}</div>
        <div class="kg-nm">${esc(g.nama)}</div></div></td>
      <td><span class="tag ${g.role === 'Admin' ? 'tag-ok'
        : g.role === 'Pimpinan' ? 'tag-violet' : 'tag-sea'}">${esc(g.role)}</span></td>
      ${num(g.pelanggaran_dicatat, 'var(--maroon)')}
      ${num(g.pembinaan_selesai, 'var(--violet)')}
      ${num((Number(g.perizinan_diajukan) || 0) + (Number(g.perizinan_diproses) || 0), 'var(--teal)')}
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

  pasangFallbackFoto($('kgWrap'));
  pasangKinerjaGuru();
  tandaiTabelBisaGeser();
}

/**
 * Listener kartu (#kgWrap) hanya dipasang SEKALI. Tanpa penjaga ini,
 * setiap kali panel dirender ulang listener akan menumpuk dan satu klik
 * memicu banyak permintaan sekaligus.
 */
let KG_TERPASANG = false;
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

  if (KG_TERPASANG) return;
  KG_TERPASANG = true;
  document.addEventListener('click', (e) => {
    if (!$('kgWrap') || !$('kgWrap').contains(e.target)) return;
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
  // v2.10: pilihan unit asrama dipertahankan — modul ini hanya memaksa
  // unit OPERASIONAL (Pengasuhan), bukan unit asrama.
  APP.ctx = normalKonteks('Pengasuhan', 'Semua', APP.ctx.gender);
  try { sessionStorage.setItem('rq_ctx', JSON.stringify(APP.ctx)); } catch (e) {}
  gambarBadgeKonteks();
  return true;
}

/** Santri aktif pada cakupan pengguna. */
async function pgsSantri() {
  return filterBinaanUnit((await muatSiswa()).filter(aktifSantri), 'kelas');
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
  PGS.cepat = pgsJenisCepat(lingkupDetail(detailAll, false), master);
  PGS.izinData = izin;
  PGS.recent = detail.slice(0, 8);

  const pekan = kunciTgl(tambahHari(new Date(), -6));
  const plgHari = detail.filter(r => kunciTgl(r.tanggal) === PGS.hari).length;
  const plgPekan = detail.filter(r => kunciTgl(r.tanggal) >= pekan).length;
  const izinPending = saringPeriodeIzin(izin).filter(z => z.status_persetujuan === 'Pending').length;

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

    const qk = e.target.closest('[data-pgquick]');
    if (qk) return pgsPilihCepat(qk.dataset.pgquick);

    const d = e.target.closest('[data-detail]');
    if (d) return bukaDetailSantri(d.dataset.detail);

    const f = e.target.closest('[data-pgizfilter]');
    if (f) {
      PGS.iz.filter = f.dataset.pgizfilter; PGS.iz.page = 1;
      document.querySelectorAll('[data-pgizfilter]').forEach(c => c.classList.toggle('on', c === f));
      return pgsGambarIzin();
    }

    const pj = e.target.closest('[data-pgperpanjang]');
    if (pj) { if (await modalPerpanjangIzin(pj.dataset.pgperpanjang)) await pgsMuatUlangIzin(); return; }

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
  const bolehIsi = bolehTulis();
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
      ${bolehIsi
        ? `<button class="btn btn-ghost btn-sm" data-ai="massal">
             <i class="fa-solid fa-users-rectangle"></i>Input Massal</button>
           <button class="btn btn-primary btn-sm" id="pgSimpan">
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
      Menampilkan <b>akumulasi seluruh unit</b> — Pengasuhan dan Madrasah digabung.
      Pelanggaran dengan <b>kode yang sama</b> dijumlahkan apa adanya, tanpa konversi
      antar kategori.</div>
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
      ${bolehCetak() ? `<button class="btn btn-primary btn-sm" id="pgRkCetak">
        <i class="fa-solid fa-print"></i>Cetak Bulanan</button>` : ''}
    </div>
    <div id="pgRkHasil"><div style="padding:26px;text-align:center;color:var(--text-3)">Memuat…</div></div>
    <div id="pgRkPager"></div>`,
    `<span class="tag tag-sea">Semua Unit</span>
     <span class="tag tag-off">${esc(labelPeriode())}</span>`,
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
    const baris = [['NISN','Nama','Kelas','Kode','Pelanggaran','Kategori','Sumber','Jumlah','Poin','Total Santri']];
    rows.forEach(s => s.daftar.forEach(d =>
      baris.push([s.nisn, s.nama, s.kelas, d.kode, d.deskripsi, d.kategori,
                  d.sumber, d.jumlah, d.poin, s.total])));
    unduhCsv(`rekap-pengasuhan-${berkasPeriode()}.csv`, baris);
  });
  $('pgRkCetak')?.addEventListener('click', async () =>
    cetakRekapBulanan(await pgsHitungRekap(), 'Semua Unit'));

  await pgsGambarRekap();
}

async function pgsHitungRekap() {
  // Sama seperti menu Rekap: seluruh unit digabung, tanpa konversi berjenjang.
  const rows = rekapUnikPerSantri(lingkupRekap(await muatDetail()));
  const k = PGS.rk.cari.toLowerCase();
  return rows
    .filter(s => !PGS.rk.kelas || s.kelas === PGS.rk.kelas)
    .filter(s => !k || String(s.nama).toLowerCase().includes(k) ||
                       String(s.nisn).toLowerCase().includes(k))
    .map(s => {
      const daftar = s.daftar.filter(d => PGS.rk.kategori === 'Semua' || d.kategori === PGS.rk.kategori);
      return daftar.length ? { ...s, daftar,
        tampil: daftar.reduce((a, d) => a + d.jumlah, 0) } : null;
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
      'Ubah kategori, kelas, periode, atau kata kunci pencarian.', 'fa-layer-group');
    $('pgRkPager').innerHTML = '';
    return;
  }

  $('pgRkHasil').innerHTML = hal.map((s, i) => {
    const total = s.tampil ?? s.total;
    return `<article class="pgs-rk">
      <div class="hd">
        <span class="no">${String(from + i + 1).padStart(2, '0')}</span>
        <div class="who">
          <b>${esc(s.nama)}</b>
          <span>${esc(s.nisn)} · ${esc(s.kelas)}</span>
        </div>
        <span class="tag tag-off">${total}× tercatat · ${s.daftar.length} jenis · ${angka(s.poin)} poin</span>
        <button class="btn-link" data-detail="${esc(s.nisn)}">Riwayat</button>
      </div>
      <ul>${s.daftar.map(d => `<li>
        <span class="tag ${tagKategori(d.kategori)}">${esc(d.kategori)}</span>
        <span class="txt">${esc(d.deskripsi)}
          <span class="secondary" style="display:block;font-size:11px">${esc(d.kode)} · ${esc(d.sumber)} · ${angka(d.poin)} poin</span></span>
        <span class="qty">${d.jumlah}×</span></li>`).join('')}</ul>
    </article>`;
  }).join('');

  $('pgRkPager').innerHTML = pager('pgrk', PGS.rk.page, rows.length, PGS.rk.size);
}

// ---------- Layanan III: perizinan ----------
function pgsPanelIzin() {
  const bolehAjukan = bolehAjukanIzin();
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
    bolehAjukan ? `<button class="btn btn-primary btn-sm" id="pgIzTambah">
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
  rows = saringPeriodeIzin(rows);
  if (PGS.iz.cari) {
    const k = PGS.iz.cari.toLowerCase();
    rows = rows.filter(z => [z.siswa?.nama_siswa, z.siswa?.kelas, z.alasan, z.nisn, z.pemberi_izin]
      .some(v => String(v || '').toLowerCase().includes(k)));
  }

  const pages = Math.max(1, Math.ceil(rows.length / PGS.iz.size));
  if (PGS.iz.page > pages) PGS.iz.page = pages;
  const from = (PGS.iz.page - 1) * PGS.iz.size;
  const hal = rows.slice(from, from + PGS.iz.size);

  // Ringkasan mini pada cakupan periode aktif.
  const lingkup = saringPeriodeIzin(semua);
  $('pgIzMini').innerHTML = `
    <div class="mini t"><span>Sesuai Waktu</span><b>${angka(lingkup.filter(z => z.status_persetujuan === 'Sesuai Waktu').length)}</b></div>
    <div class="mini m"><span>Telat Balik</span><b>${angka(lingkup.filter(z => z.status_persetujuan === 'Telat Balik').length)}</b></div>
    <div class="mini a"><span>Menunggu</span><b>${angka(lingkup.filter(z => z.status_persetujuan === 'Pending').length)}</b></div>
    <div class="mini s"><span>Total Izin</span><b>${angka(lingkup.length)}</b></div>`;

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
      ${aksiIzin(z, 'pgizin', 'pgperpanjang')}
    </div>`).join('') || kosong('Tidak ada data perizinan.',
      'Ubah filter status, periode, atau ajukan izin baru.', 'fa-door-open');

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
  if (!bolehAjukanIzin()) {
    return toast('error', `Role ${role()} tidak berwenang mengajukan perizinan.`);
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
        <select id="pzJenis" class="input" ${role()==='Klinik' && KLINIK_SAKIT_SAJA ? 'disabled' : ''}>
          ${(role()==='Klinik' && KLINIK_SAKIT_SAJA ? ['Sakit'] : ['Keperluan','Sakit','Pemberitahuan'])
            .map(x => `<option>${x}</option>`).join('')}
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
      return { nisn };
    }
  });
  if (!res.isConfirmed) return;
  sync('done', 'Izin tersimpan');
  toast('success', 'Permohonan izin tersimpan');
  await pgsMuatUlangIzin();
  waKirimIzinTerbaru(res.value?.nisn);
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
// 24. ASISTEN AI — INPUT MASSAL PELANGGARAN & PAYLOAD ANALISIS
//     Tiga instruksi kerja diterjemahkan menjadi logika aplikasi:
//       (1) Validasi & eksekusi bulk pelanggaran  -> RPC catat_pelanggaran
//       (2) Analisis frekuensi peraturan & master -> panel di menu Master
//       (3) Ringkasan eksekutif dashboard Pimpinan-> payload siap dianalisis
//     Tidak menambah tabel, kolom, maupun RPC baru. Seluruh perhitungan
//     dilakukan di browser dari data yang sudah dimuat.
// ---------------------------------------------------------------------

/** Ambang baku yang dipakai bersama oleh modul analisis. */
const AI_AMBANG = {
  minSantri: 2,          // input massal minimal 2 santri
  maksSantri: 50,        // batas aman satu proses
  mundurHari: 90,        // tanggal kejadian tidak boleh lebih lama dari ini
  catatanMin: 10,        // panjang catatan wajib untuk kategori Sedang/Berat
  kaskade: 5,            // 5x sejenis naik satu tingkat kategori
  poinPerhatian: 50,
  poinKritis: 100
};

/** Instruksi untuk analis eksternal. Disalin apa adanya bersama payload. */
const AI_PROMPT = {
  bulk:
`Anda adalah validator dan generator parameter RPC untuk Sistem Informasi
Pengembangan Santri — Dayah Ruhul Qurani. Bahasa: Indonesia. Output: JSON murni.

FAKTA SISTEM (tidak boleh dilanggar):
1. Pelanggaran TIDAK di-INSERT ke tabel. Satu-satunya jalur adalah RPC Supabase
   catat_pelanggaran dengan lima parameter: p_nisn, p_kode, p_tanggal
   (YYYY-MM-DD), p_catatan, p_force (boolean).
2. RPC mengisi sendiri nama_pelanggaran, kategori, bobot_pelanggaran, bidang,
   sumber, jenjang, penindak, jam, serta memperbarui total poin santri.
   Jangan pernah menghasilkan kolom-kolom itu.
3. Input massal = pemanggilan RPC berulang, satu panggilan per santri.
4. Kategori hanya Ringan, Sedang, Berat. bobot_poin adalah integer bebas >= 0
   yang ditetapkan Admin per jenis. TIDAK ADA rentang bobot baku per kategori.
5. Kode pelanggaran berformat bebas (PG001, MD001, P220). Validasi kode dengan
   mencocokkan ke master_terpilih pada payload, bukan dengan regex.
6. RPC bisa membalas {conflict:true} bila santri punya izin "Sesuai Waktu" pada
   tanggal itu. Role "Osis" tidak berwenang menimpanya dengan p_force.
7. Role "Guru Piket" hanya baca.

VALIDASI (satu gagal = seluruh permintaan ditolak):
V1 konteks.boleh_tulis harus true dan role bukan "Guru Piket".
V2 nisn_list unik 2-50 NISN, hanya angka, semuanya ditemukan di array santri.
V3 master_terpilih tidak null dan kodenya sama dengan input.
V4 Bila konteks.unit != "Semua", master_terpilih.sumber harus sama.
V5 Bila unit "Madrasah" dan jenjang != "Semua", master.jenjang harus "Semua"
   atau sama dengan konteks.jenjang.
V6 Bila konteks.perlu_filter_kelas true, kelas tiap santri harus ada di
   konteks.kelas_binaan.
V7 tanggal <= hari_ini dan >= hari_ini - 90 hari.
V8 catatan wajib minimal 10 karakter bila kategori Sedang atau Berat.

PERINGATAN NON-BLOKIR (status tetap ok):
duplikat (nisn+kode+tanggal sudah ada di riwayat_90h), kaskade (jumlah kode ini
mencapai kelipatan 5 sehingga rekap naik satu tingkat), ambang poin (menembus
50 = Perhatian Tinggi atau 100 = Kritis), potensi konflik izin.

OUTPUT VALID:
{"status":"ok","message":"...","rpc":"catat_pelanggaran",
 "panggilan":[{"urutan":1,"nisn":"...","nama_siswa":"...","kelas":"...",
   "params":{"p_nisn":"...","p_kode":"...","p_tanggal":"...","p_catatan":"...","p_force":false}}],
 "ringkasan":{"total_panggilan":0,"kode_pelanggaran":"...","nama_pelanggaran":"...",
   "kategori":"...","bobot_poin":0,"bidang":"...","sumber":"...","jenjang":"...",
   "total_poin_ditambahkan":0},
 "peringatan":[{"nisn":"...","jenis":"duplikat|kaskade|ambang_poin|konflik_izin","pesan":"..."}],
 "catatan_eksekusi":"..."}

OUTPUT DITOLAK:
{"status":"error","message":"...","errors":[{"field":"...","nisn":"...","issue":"..."}]}

CRITICAL: keluarkan JSON saja, tanpa pagar markdown dan tanpa kalimat pembuka.`,

  peraturan:
`Anda adalah analis evaluasi peraturan untuk Dayah Ruhul Qurani (pesantren di
Aceh Barat). Gunakan kerangka pendidikan dan psikologi remaja.
Bahasa: Indonesia. Output: JSON murni.

FAKTA SISTEM:
1. Sumber data: master_pelanggaran (katalog aturan) dan detail_data (kejadian).
   Baris berstatus archived sudah dibuang oleh pembangun payload.
2. Bidang BUKAN daftar tetap. Bidang berasal dari master_bidang.nama_bidang dan
   berbeda antar unit. Baris tanpa bidang tercatat "Belum Dipetakan". Dilarang
   menyebut nama bidang yang tidak ada di payload.
3. Kategori hanya Ringan/Sedang/Berat. Bobot bebas per jenis; jangan menilai
   keparahan hanya dari angka bobot.
4. Kaskade buku peraturan: 5x Ringan sejenis dihitung 1 Sedang, 5x Sedang
   sejenis dihitung 1 Berat. Jenis Ringan berfrekuensi tinggi karena itu
   berdampak lebih besar daripada yang tampak dari angka mentah.
5. Master hanya boleh diubah role Admin. Sosialisasi dan penegakan dijalankan
   Guru, Walas, Guru BK, Guru Piket, Ustadz GEN-Z, dan Osis.

KERANGKA PSIKOLOGI:
- Ringan berfrekuensi tinggi  -> kesenjangan pemahaman/pembiasaan: sosialisasi
  ulang, keteladanan, pengingat terjadwal.
- Sedang berulang            -> pola perilaku menetap: pembinaan 1:1,
  kesepakatan tertulis, pelibatan wali.
- Berat frekuensi rendah     -> pelanggaran sadar atau masalah lebih dalam:
  asesmen bersama Guru BK sebelum sanksi.
- Frekuensi tinggi dengan santri_unik sedikit = masalah individu; santri_unik
  banyak = masalah sistem atau rumusan aturan.

ANALISIS YANG DIMINTA:
A. Top 10 jenis paling perlu perhatian (gabungan frekuensi, tren 30 hari, dan
   rasio santri_unik). Sertakan diagnosis individu/sistemik dan rekomendasi
   bernomor yang konkret.
B. Analisis per bidang, urut terbanyak: 3 jenis teratas, tren, dan apakah pola
   itu wajar untuk asrama/madrasah atau sinyal masalah.
C. Anomali dari deret harian: lonjakan, jenis baru, konsentrasi kelas mendadak.
   Sertakan langkah verifikasi ke Walas atau Guru Piket.
D. Kebersihan katalog: aturan yang tidak pernah terpakai dan baris
   "Belum Dipetakan" — hapus, gabung, petakan ulang, atau memang belum
   ditegakkan. Bagian ini ditujukan ke Admin.
E. Saran penyesuaian peraturan per bidang bermasalah. Bedakan akar masalah:
   sosialisasi, penegakan tidak konsisten, rumusan tidak operasional, atau
   bobot/kategori tidak proporsional. Sertakan lini masa nyata.

OUTPUT:
{"status":"ok","analisis":{"unit":"...","periode":"...","ringkasan":"...",
 "top_jenis":[{"peringkat":1,"kode_pelanggaran":"...","nama_pelanggaran":"...",
   "kategori":"...","bidang":"...","frek_total":0,"frek_30h":0,"frek_prev30":0,
   "tren_30h":"...","persen_total":"...","santri_unik":0,
   "pola":"individu|sistemik","catatan":"...","rekomendasi":"1. ... 2. ..."}],
 "per_bidang":[{"nama":"...","jumlah":0,"persen":0,"tren":"naik|stabil|turun",
   "top_3_jenis":["..."],"insight":"..."}],
 "anomali":[{"tipe":"lonjakan|pola_baru|konsentrasi_kelas","deskripsi":"...",
   "kemungkinan":"...","verifikasi":"..."}],
 "kebersihan_katalog":{"tidak_terpakai":[{"kode_pelanggaran":"...",
   "saran":"hapus|gabung|pertahankan","alasan":"..."}],
   "belum_dipetakan":{"jumlah":0,"saran":"..."}},
 "saran_penyesuaian":[{"bidang":"...","prioritas":"tinggi|sedang|rendah",
   "akar_masalah":"sosialisasi|penegakan|rumusan_aturan|bobot","usulan":"...",
   "penanggung_jawab":"Admin|Guru BK|Walas|Guru Piket","lini_masa":"..."}],
 "tinjauan_berikutnya":"YYYY-MM-DD"}}

CRITICAL: JSON saja. Setiap rekomendasi menyebut angka dari payload.`,

  pimpinan:
`Anda adalah analis senior untuk dashboard eksekutif Dayah Ruhul Qurani.
Pembaca: Pimpinan dayah, waktu baca 30 detik. Bahasa: Indonesia.
Output: JSON murni. Nada lugas, tanpa basa-basi, menghormati jenjang wewenang.

FAKTA SISTEM — samakan dengan perhitungan yang berjalan di aplikasi:
1. Jendela 90 hari (d90); pembanding 30 hari terakhir (d30) vs 30 hari
   sebelumnya (dPrev). ubah = ((d30-dPrev)/dPrev)*100, null bila dPrev = 0.
2. Kategori dihitung ke empat ember: Ringan, Sedang, Berat, Lainnya.
3. Tier santri (ambang baku, jangan diubah):
   Kritis           : poin90 >= 100 ATAU berat >= 2
   Perhatian Tinggi : poin90 >= 50 ATAU berat >= 1 ATAU kasus30 >= 5
   Monitor          : kasus30 >= 3 ATAU telat >= 2 ATAU bina >= 1
   Observasi        : selain itu
4. Label kondisi harus persis salah satu dari:
   "Perlu Perhatian Pimpinan"   bila ubah > 20 ATAU rasio_kritis >= 3
                                ATAU kategori.Berat >= 10
   "Perlu Penguatan Pengawasan" bila ubah > 5 ATAU Kritis > 0
                                ATAU Perhatian Tinggi >= 5 ATAU izin.rate >= 20
   "Relatif Terkendali"         selain itu
5. Status pembinaan HANYA "Dalam Proses" dan "Selesai". Tidak ada status
   "Belum Mulai" — jangan menyebutnya. Yang bisa disorot adalah santri tier
   tinggi yang belum punya catatan pembinaan sama sekali (tier.tanpa_pembinaan).
6. Status izin: Pending, Sesuai Waktu, Telat Balik. izin.rate = Telat Balik
   dibagi (Sesuai Waktu + Telat Balik) x 100, dipakai sebagai proksi kepatuhan.
7. Bandingkan angkatan memakai per100 (kasus per 100 santri), bukan jumlah.
8. Wewenang: Guru Piket hanya baca; Osis tidak boleh menimpa izin "Sesuai
   Waktu"; master hanya diubah Admin; pembinaan diubah Admin/Guru/Pimpinan.
   Jangan memberi saran yang melampaui wewenang sebuah peran.

LIMA PILAR DIAGNOSIS (semuanya wajib diisi):
1 disiplin_umum      volume 90 hari, arah tren, luas keterlibatan.
2 beban_kategori     komposisi Ringan:Sedang:Berat; Berat > 15% = temuan.
                     Nilai apakah beban tersebar atau terkonsentrasi.
3 fokus_bidang       bidang dominan; wajar untuk asrama atau sinyal masalah.
4 respons_pembinaan  rasio Selesai vs Dalam Proses dan tier tinggi yang belum
                     tersentuh pembinaan.
5 perilaku_sekunder  izin.rate dan angkatan dengan per100 tertinggi.

SARAN dipisah tegas per peran dan tidak boleh saling menyalin:
Guru & Wali Kelas -> tindakan lapangan pekan ini beserta metrik.
Guru BK           -> fokus asesmen, sasaran tier, bentuk pembinaan, lini masa.
Pimpinan          -> keputusan tata kelola: struktur, konsistensi, kebijakan.

OUTPUT:
{"status":"ok","kesimpulan_sementara":"[ikon] [label] — ringkasan 1-2 baris",
 "kondisi":{"kode":"ok|warn|danger","label":"..."},
 "diagnosis":{"disiplin_umum":"...","beban_kategori":"...","fokus_bidang":"...",
   "respons_pembinaan":"...","perilaku_sekunder":"..."},
 "sorotan_angka":[{"label":"...","nilai":"...","arah":"naik|turun|stabil"}],
 "saran_untuk_guru":[{"urgensi":"segera|pekan_ini|dua_pekan","aksi":"...","metrik":"..."}],
 "saran_untuk_bk":[{"urgensi":"segera|pekan_ini","sasaran":"...",
   "bentuk_pembinaan":"pendampingan individu|pembinaan kelompok|pertemuan wali|asesmen",
   "lini_masa":"..."}],
 "saran_untuk_pimpinan":[{"urgensi":"pekan_ini|dua_pekan","tinjau":"...",
   "keputusan":"...","lini_masa":"..."}],
 "santri_disorot":[{"nisn":"...","nama":"...","kelas":"...","tier":"...","alasan":"..."}],
 "catatan_batas":"...","tinjauan_berikutnya":"YYYY-MM-DD"}

Ikon: "OK" untuk kode ok, "!" untuk warn, "!!" untuk danger.
CRITICAL: JSON saja. Maksimal 6 nama pada santri_disorot. Dilarang menyebut
status pembinaan yang tidak ada di sistem atau angka di luar payload.`
};

/** Salin teks ke papan klip; sediakan jalur cadangan bila API diblokir. */
async function aiSalin(teks, label) {
  try {
    await navigator.clipboard.writeText(teks);
    toast('success', `${label || 'Teks'} tersalin ke papan klip.`);
    return true;
  } catch (e) {
    const ta = document.createElement('textarea');
    ta.value = teks;
    ta.style.cssText = 'position:fixed;left:-9999px;top:0';
    document.body.appendChild(ta); ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e2) { ok = false; }
    document.body.removeChild(ta);
    if (ok) { toast('success', `${label || 'Teks'} tersalin ke papan klip.`); return true; }
    Swal.fire({ title:'Salin manual', width:660,
      html:`<textarea class="input" rows="12" style="font-family:'IBM Plex Mono',monospace;font-size:11.5px">${esc(teks)}</textarea>`,
      confirmButtonColor:'#14618B' });
    return false;
  }
}

const aiSalinPayload = (obj, label) => aiSalin(JSON.stringify(obj, null, 2), label || 'Payload');

/** Rentang waktu standar analisis: 90 hari, 30 hari, dan 30 hari sebelumnya. */
function aiJendela(hari) {
  const n = Number(hari) || AI_AMBANG.mundurHari;
  const akhir = new Date(); akhir.setHours(23,59,59,999);
  const mulai = tambahHari(akhir, -(n - 1)); mulai.setHours(0,0,0,0);
  const mulai30 = tambahHari(akhir, -29); mulai30.setHours(0,0,0,0);
  const prevMulai = tambahHari(mulai30, -30); prevMulai.setHours(0,0,0,0);
  const prevAkhir = tambahHari(mulai30, -1); prevAkhir.setHours(23,59,59,999);
  return { akhir, mulai, mulai30, prevMulai, prevAkhir };
}

const aiBulat = (n) => Math.round(Number(n || 0) * 10) / 10;

// ---------- 24a. Input massal: penyusunan payload -------------------
async function aiPayloadBulk(opsi) {
  const o = opsi || {};
  const pilih = o.santri || [];
  const kode = String(o.kode || '').trim();
  const tanggal = kunciTgl(o.tanggal || hariIni());
  const catatan = String(o.catatan || '').trim();

  const [master, siswaAll, detailAll] = await Promise.all([
    amanKosong(muatMaster, 'master pelanggaran'),
    amanKosong(muatSiswa, 'santri'),
    amanKosong(muatDetail, 'pelanggaran')
  ]);

  const m = master.find(x => String(x.kode_pelanggaran).trim() === kode) || null;
  const petaSiswa = Object.fromEntries(
    siswaAll.filter(aktifSantri).map(s => [String(s.nisn).trim(), s]));

  const unik = [];
  pilih.forEach(s => {
    const n = String(s.nisn || '').trim();
    if (n && !unik.includes(n)) unik.push(n);
  });

  const akhir = new Date(); akhir.setHours(23,59,59,999);
  const mulai90 = tambahHari(akhir, -(AI_AMBANG.mundurHari - 1)); mulai90.setHours(0,0,0,0);
  const setUnik = new Set(unik);

  const riwayat = detailAll.filter(aktifDetail)
    .filter(r => setUnik.has(String(r.nisn).trim()))
    .filter(r => { const d = tglDari(kunciTgl(r.tanggal)); return d && d >= mulai90 && d <= akhir; })
    .map(r => ({
      nisn: String(r.nisn).trim(),
      tanggal: kunciTgl(r.tanggal),
      kode_pelanggaran: String(r.kode_pelanggaran || '').trim(),
      kategori: r.kategori || '',
      bobot_pelanggaran: Number(r.bobot_pelanggaran) || 0
    }));

  return {
    konteks: {
      unit: APP.ctx.unit,
      jenjang: APP.ctx.jenjang,
      role: role(),
      nama_petugas: APP.profil?.nama || '',
      kelas_binaan: APP.profil?.kelas_binaan || [],
      perlu_filter_kelas: perluFilterKelas(),
      boleh_tulis: bolehTulis(),
      hari_ini: hariIni()
    },
    input: { nisn_list: unik, kode_pelanggaran: kode, tanggal, catatan },
    master_terpilih: m ? {
      kode_pelanggaran: m.kode_pelanggaran,
      nama_pelanggaran: m.nama_pelanggaran,
      kategori: m.kategori,
      bobot_poin: Number(m.bobot_poin) || 0,
      bidang: m.bidang || 'Belum Dipetakan',
      sumber: m.sumber || 'Pengasuhan',
      jenjang: m.jenjang || 'Semua'
    } : null,
    santri: unik.map(n => {
      const s = petaSiswa[n] || null;
      return {
        nisn: n,
        ditemukan: !!s,
        nama_siswa: s ? s.nama_siswa : null,
        kelas: s ? (s.kelas || null) : null,
        jenjang: s ? (s.jenjang || null) : null,
        total_poin_pelanggaran: s ? (Number(s.total_poin_pelanggaran) || 0) : 0
      };
    }),
    riwayat_90h: riwayat
  };
}

// ---------- 24b. Input massal: validasi (all-or-nothing) ------------
function aiValidasiBulk(p) {
  const errors = [], peringatan = [];
  const k = p.konteks, inp = p.input, m = p.master_terpilih;
  const list = inp.nisn_list || [];

  if (!k.boleh_tulis || k.role === 'Guru Piket') {
    errors.push({ field:'wewenang', issue:`Role ${k.role} tidak berwenang mencatat pelanggaran.` });
  }
  if (!m) {
    errors.push({ field:'kode_pelanggaran',
      issue:`Jenis pelanggaran "${inp.kode_pelanggaran || '(kosong)'}" tidak ada pada Master Pelanggaran unit ini.` });
  }
  if (list.length < AI_AMBANG.minSantri) {
    errors.push({ field:'nisn_list', issue:`Minimal ${AI_AMBANG.minSantri} santri untuk input massal.` });
  }
  if (list.length > AI_AMBANG.maksSantri) {
    errors.push({ field:'nisn_list', issue:`Maksimal ${AI_AMBANG.maksSantri} santri dalam satu proses.` });
  }

  const petaS = Object.fromEntries((p.santri || []).map(s => [s.nisn, s]));
  list.forEach(n => {
    const s = petaS[n];
    if (!/^\d+$/.test(n)) errors.push({ field:'nisn_list', nisn:n, issue:`NISN ${n} bukan angka.` });
    else if (!s || !s.ditemukan) errors.push({ field:'nisn_list', nisn:n, issue:`NISN ${n} tidak ditemukan pada data santri aktif.` });
    else if (k.perlu_filter_kelas && !(k.kelas_binaan || []).includes(s.kelas)) {
      errors.push({ field:'nisn_list', nisn:n, issue:`${s.nama_siswa} (kelas ${s.kelas || '-'}) di luar kelas binaan Anda.` });
    }
  });

  if (m) {
    if (k.unit !== 'Semua' && String(m.sumber) !== k.unit) {
      errors.push({ field:'kode_pelanggaran',
        issue:`Jenis ini milik unit ${m.sumber}, sedangkan unit aktif adalah ${k.unit}.` });
    }
    if (k.unit === 'Madrasah' && k.jenjang !== 'Semua'
        && m.jenjang !== 'Semua' && m.jenjang !== k.jenjang) {
      errors.push({ field:'kode_pelanggaran',
        issue:`Jenis ini khusus jenjang ${m.jenjang}, tidak untuk ${k.jenjang}.` });
    }
    if (['Sedang','Berat'].includes(m.kategori) && inp.catatan.length < AI_AMBANG.catatanMin) {
      errors.push({ field:'catatan',
        issue:`Kategori ${m.kategori} wajib disertai catatan minimal ${AI_AMBANG.catatanMin} karakter.` });
    }
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(inp.tanggal)) {
    errors.push({ field:'tanggal', issue:'Format tanggal harus YYYY-MM-DD.' });
  } else {
    const d = tglDari(inp.tanggal), kini = tglDari(k.hari_ini);
    const batas = tambahHari(kini, -AI_AMBANG.mundurHari);
    if (!d) errors.push({ field:'tanggal', issue:'Tanggal tidak terbaca.' });
    else if (d > kini) errors.push({ field:'tanggal', issue:'Tanggal kejadian tidak boleh di masa depan.' });
    else if (d < batas) errors.push({ field:'tanggal',
      issue:`Tanggal kejadian lebih lama dari ${AI_AMBANG.mundurHari} hari. Gunakan jalur input satuan.` });
  }

  if (errors.length) {
    return { status:'error', message:`${errors.length} masalah ditemukan. Tidak ada data yang disimpan.`, errors };
  }

  // ----- peringatan non-blokir -----
  const riwayat = p.riwayat_90h || [];
  list.forEach(n => {
    const s = petaS[n];
    const milik = riwayat.filter(r => r.nisn === n);

    if (milik.some(r => r.kode_pelanggaran === m.kode_pelanggaran && r.tanggal === inp.tanggal)) {
      peringatan.push({ nisn:n, jenis:'duplikat',
        pesan:`${s.nama_siswa} sudah memiliki catatan jenis yang sama pada tanggal ${tgl(inp.tanggal)}.` });
    }

    const sejenis = milik.filter(r => r.kode_pelanggaran === m.kode_pelanggaran).length + 1;
    if (['Ringan','Sedang'].includes(m.kategori) && sejenis % AI_AMBANG.kaskade === 0) {
      const naik = m.kategori === 'Ringan' ? 'Sedang' : 'Berat';
      peringatan.push({ nisn:n, jenis:'kaskade',
        pesan:`${s.nama_siswa} mencapai ${sejenis}x jenis ini — rekap akan menaikkannya menjadi ${naik}.` });
    }

    const poinBaru = (s.total_poin_pelanggaran || 0) + m.bobot_poin;
    if (s.total_poin_pelanggaran < AI_AMBANG.poinKritis && poinBaru >= AI_AMBANG.poinKritis) {
      peringatan.push({ nisn:n, jenis:'ambang_poin',
        pesan:`${s.nama_siswa} menembus ${AI_AMBANG.poinKritis} poin — masuk tier Kritis.` });
    } else if (s.total_poin_pelanggaran < AI_AMBANG.poinPerhatian && poinBaru >= AI_AMBANG.poinPerhatian) {
      peringatan.push({ nisn:n, jenis:'ambang_poin',
        pesan:`${s.nama_siswa} menembus ${AI_AMBANG.poinPerhatian} poin — masuk tier Perhatian Tinggi.` });
    }
  });

  if (k.role === 'Osis') {
    peringatan.push({ nisn:'', jenis:'konflik_izin',
      pesan:'Bila ada santri yang sedang berizin "Sesuai Waktu", baris itu dilewati — Osis tidak berwenang menimpanya.' });
  }

  return {
    status: 'ok',
    message: `Siap dieksekusi untuk ${list.length} santri.`,
    rpc: 'catat_pelanggaran',
    panggilan: list.map((n, i) => ({
      urutan: i + 1,
      nisn: n,
      nama_siswa: petaS[n].nama_siswa,
      kelas: petaS[n].kelas || '-',
      params: {
        p_nisn: n, p_kode: m.kode_pelanggaran, p_tanggal: inp.tanggal,
        p_catatan: inp.catatan, p_force: false
      }
    })),
    ringkasan: {
      total_panggilan: list.length,
      kode_pelanggaran: m.kode_pelanggaran,
      nama_pelanggaran: m.nama_pelanggaran,
      kategori: m.kategori,
      bobot_poin: m.bobot_poin,
      bidang: m.bidang,
      sumber: m.sumber,
      jenjang: m.jenjang,
      total_poin_ditambahkan: m.bobot_poin * list.length
    },
    peringatan,
    catatan_eksekusi: 'RPC dipanggil satu per satu; baris yang mengembalikan conflict dihentikan dan dimintakan konfirmasi.'
  };
}

// ---------- 24c. Input massal: eksekusi RPC berurutan ---------------
async function aiJalankanBulk(hasil) {
  if (!bolehTulis()) return toast('error', `Role ${role()} tidak berwenang mencatat pelanggaran.`);

  // Satu pertanyaan untuk seluruh angkatan, sebelum baris pertama dikirim.
  const panggilan = await saringDuplikatMassal(hasil.panggilan);
  if (!panggilan.length) return toast('info', 'Tidak ada catatan baru untuk disimpan.');

  const total = panggilan.length;
  const laporan = { berhasil: [], konflik: [], gagal: [] };

  Swal.fire({
    title:'Menyimpan catatan…', allowOutsideClick:false, allowEscapeKey:false,
    html:`<p class="hint" style="margin:0">Memproses <b id="aiProg">0</b> dari ${total} santri.</p>`,
    didOpen: () => Swal.showLoading()
  });
  sync('saving', 'Menyimpan input massal…');

  for (let i = 0; i < total; i++) {
    const p = panggilan[i];
    try {
      const { data, error } = await db.rpc('catat_pelanggaran', p.params);
      if (error) laporan.gagal.push({ ...p, pesan: error.message });
      else if (data?.conflict) laporan.konflik.push({ ...p, pesan: data.message || 'Santri memiliki izin sesuai waktu.' });
      else laporan.berhasil.push({ ...p, poin_baru: data?.poin_baru ?? null });
    } catch (err) {
      laporan.gagal.push({ ...p, pesan: err?.message || String(err) });
    }
    const el = $('aiProg'); if (el) el.textContent = String(i + 1);
  }

  Swal.close();
  cacheHapus('detail','siswa','pembinaan');

  // Konflik izin: tawarkan penimpaan, kecuali untuk Osis.
  if (laporan.konflik.length && role() !== 'Osis') {
    const konf = await Swal.fire({
      icon:'warning', title:'Terdeteksi izin yang sesuai waktu', width:600,
      html:`<div style="text-align:left;font-size:13px">
        <p>${laporan.konflik.length} santri sedang memiliki izin berstatus <b>Sesuai Waktu</b>
           pada tanggal tersebut sehingga catatannya belum tersimpan:</p>
        <ul style="margin:6px 0 0 16px">${laporan.konflik
          .map(x => `<li>${esc(x.nama_siswa)} (${esc(x.kelas)})</li>`).join('')}</ul></div>`,
      showCancelButton:true, confirmButtonText:'Tetap catat semuanya',
      cancelButtonText:'Lewati', confirmButtonColor:'#9F1239'
    });
    if (konf.isConfirmed) {
      sync('saving', 'Menimpa izin…');
      for (const x of laporan.konflik.slice()) {
        const r2 = await db.rpc('catat_pelanggaran', { ...x.params, p_force: true });
        if (r2.error) laporan.gagal.push({ ...x, pesan: r2.error.message });
        else laporan.berhasil.push({ ...x, poin_baru: r2.data?.poin_baru ?? null, dipaksa:true });
      }
      laporan.konflik = [];
      cacheHapus('detail','siswa','pembinaan');
    }
  } else if (laporan.konflik.length) {
    await Swal.fire({ icon:'info', title:'Sebagian dilewati',
      text:'Beberapa santri sedang berizin sesuai waktu. Role Osis tidak berwenang menimpanya — laporkan ke Admin atau Guru.',
      confirmButtonColor:'#14618B' });
  }

  sync(laporan.gagal.length ? 'warn' : 'done',
       laporan.gagal.length ? 'Sebagian gagal disimpan' : 'Input massal tersimpan');

  await Swal.fire({
    icon: laporan.gagal.length ? 'warning' : 'success',
    title: 'Ringkasan Input Massal', width: 620,
    html: `<div style="text-align:left;font-size:13px">
      <p><b>${laporan.berhasil.length}</b> tersimpan ·
         <b>${laporan.konflik.length}</b> dilewati ·
         <b>${laporan.gagal.length}</b> gagal.</p>
      ${laporan.gagal.length ? `<p style="margin-top:8px"><b>Gagal:</b></p>
        <ul style="margin:4px 0 0 16px">${laporan.gagal
          .map(x => `<li>${esc(x.nama_siswa)} — ${esc(x.pesan)}</li>`).join('')}</ul>` : ''}
    </div>`,
    confirmButtonColor:'#14618B'
  });

  // Segarkan tampilan yang sedang aktif.
  if (APP.view === 'pelanggaran') muatTabelPlg();
  else if (['dashboard','pimpinan','pengasuhan','madrasah','rekap'].includes(APP.view)) navigateTo(APP.view);
}

// ---------- 24d. Input massal: antarmuka ----------------------------
const MASSAL = { pilih: [], master: null };

function aiGambarChip() {
  const el = $('msChips'); if (!el) return;
  const n = MASSAL.pilih.length;
  const info = $('msHitung');
  if (info) info.textContent = `${n} / ${AI_AMBANG.maksSantri} santri`;
  el.innerHTML = n
    ? MASSAL.pilih.map(s => `<span class="mchip">${esc(s.nama_siswa || s.nisn)}
        <span class="nis">${esc(s.kelas || '-')}</span>
        <button type="button" data-hapus="${esc(s.nisn)}" title="Keluarkan">
          <i class="fa-solid fa-xmark"></i></button></span>`).join('')
    : `<span class="mchip-kosong">Belum ada santri dipilih — minimal ${AI_AMBANG.minSantri}.</span>`;
}

async function modalMassalPelanggaran() {
  if (!bolehTulis()) {
    return Swal.fire({ icon:'error', title:'Tidak berwenang',
      text:`Role ${role()} tidak dapat mencatat pelanggaran.`, confirmButtonColor:'#9F1239' });
  }
  MASSAL.pilih = []; MASSAL.master = null;

  const res = await Swal.fire({
    title:'Input Massal Pelanggaran', width: 660, showCancelButton:true,
    confirmButtonText:'Periksa & Lanjut', cancelButtonText:'Batal',
    confirmButtonColor:'#14618B', showLoaderOnConfirm:true,
    allowOutsideClick:() => !Swal.isLoading(),
    html:`<div class="stack">
      <div class="ctx-note"><i class="fa-solid fa-layer-group"></i>
        Satu jenis pelanggaran untuk banyak santri · unit <b>&nbsp;${esc(labelKonteks())}</b></div>

      <div class="field">
        <label class="label">Jenis Pelanggaran</label>
        <input id="msKode" class="input" autocomplete="off"
               placeholder="Ketik kode, nama, kategori, atau bidang…">
        <div id="msInfo" class="hint">Belum ada jenis pelanggaran dipilih.</div>
      </div>

      <div class="field">
        <label class="label">Tambah Santri</label>
        <input id="msSantri" class="input" autocomplete="off"
               placeholder="Ketik nama atau NISN (min. 2 huruf), pilih dari saran…">
        <div class="ms-head"><span class="hint">Klik tanda silang untuk mengeluarkan santri.</span>
          <span class="hint mono" id="msHitung">0 / ${AI_AMBANG.maksSantri} santri</span></div>
        <div class="mchips" id="msChips"></div>
      </div>

      <div class="duo">
        <div class="field"><label class="label">Tanggal Kejadian</label>
          <input id="msTgl" type="date" class="input" value="${hariIni()}"></div>
        <div class="field"><label class="label">Catatan Bersama</label>
          <input id="msCatatan" class="input" maxlength="500"
                 placeholder="Wajib untuk kategori Sedang / Berat"></div>
      </div>
    </div>`,
    didOpen: () => {
      aiGambarChip();
      saranPelanggaran($('msKode'), (m) => {
        MASSAL.master = m;
        $('msInfo').innerHTML =
          `<span class="tag ${tagKategori(m.kategori)}">${esc(m.kategori)}</span>
           <b>${m.bobot_poin} poin</b> · ${esc(m.bidang || '-')} · ${esc(m.sumber || '-')} · ${esc(m.jenjang || 'Semua')}`;
      });
      saranSantri($('msSantri'), (s) => {
        const inp = $('msSantri');
        if (!MASSAL.pilih.some(x => String(x.nisn) === String(s.nisn))) {
          if (MASSAL.pilih.length >= AI_AMBANG.maksSantri) toast('error', `Maksimal ${AI_AMBANG.maksSantri} santri.`);
          else MASSAL.pilih.push(s);
        }
        inp.value = ''; delete inp.dataset.picked;
        aiGambarChip();
      });
      $('msChips').addEventListener('click', (e) => {
        const b = e.target.closest('[data-hapus]'); if (!b) return;
        MASSAL.pilih = MASSAL.pilih.filter(x => String(x.nisn) !== b.dataset.hapus);
        aiGambarChip();
      });
      setTimeout(() => $('msKode').focus(), 120);
    },
    preConfirm: async () => {
      const payload = await aiPayloadBulk({
        santri: MASSAL.pilih,
        kode: $('msKode').dataset.kode || MASSAL.master?.kode_pelanggaran || '',
        tanggal: $('msTgl').value,
        catatan: $('msCatatan').value.trim()
      });
      const hasil = aiValidasiBulk(payload);
      if (hasil.status !== 'ok') {
        Swal.showValidationMessage(hasil.errors.map(x => '• ' + x.issue).join('<br>'));
        return false;
      }
      return { payload, hasil };
    }
  });

  if (!res.isConfirmed) return;
  const { payload, hasil } = res.value;
  const r = hasil.ringkasan;

  const konf = await Swal.fire({
    title:'Konfirmasi Input Massal', width: 640,
    showCancelButton:true, showDenyButton:true,
    confirmButtonText:`Simpan ${r.total_panggilan} catatan`,
    denyButtonText:'Salin payload AI', cancelButtonText:'Batal',
    confirmButtonColor:'#14618B', denyButtonColor:'#4A6076',
    html:`<div style="text-align:left;font-size:13px">
      <p style="margin:0 0 8px"><b>${esc(r.kode_pelanggaran)} — ${esc(r.nama_pelanggaran)}</b><br>
        <span class="tag ${tagKategori(r.kategori)}">${esc(r.kategori)}</span>
        ${r.bobot_poin} poin · ${esc(r.bidang)} · ${esc(r.sumber)}</p>
      <p style="margin:0 0 8px">${r.total_panggilan} santri ·
        total ${angka(r.total_poin_ditambahkan)} poin ·
        tanggal ${tgl(payload.input.tanggal)}</p>
      ${hasil.peringatan.length ? `<div class="ai-warn">
        <b>Perlu diperhatikan (${hasil.peringatan.length})</b>
        <ul>${hasil.peringatan.map(w => `<li>${esc(w.pesan)}</li>`).join('')}</ul></div>` : ''}
    </div>`
  });

  if (konf.isDenied) return aiSalinPayload(payload, 'Payload input massal');
  if (!konf.isConfirmed) return;
  await aiJalankanBulk(hasil);
}

// ---------- 24e. Analisis peraturan & master ------------------------
async function aiPayloadPeraturan(hari) {
  const n = Number(hari) || AI_AMBANG.mundurHari;
  const { akhir, mulai, mulai30, prevMulai, prevAkhir } = aiJendela(n);

  const [master, bidangMaster, detailAll] = await Promise.all([
    amanKosong(muatMaster, 'master pelanggaran'),
    amanKosong(muatBidang, 'master bidang'),
    amanKosong(muatDetail, 'pelanggaran')
  ]);

  const rows = lingkupDetail(detailAll, false)
    .filter(r => { const d = tglDari(kunciTgl(r.tanggal)); return d && d >= mulai && d <= akhir; });

  const petaMaster = Object.fromEntries(master.map(m => [String(m.kode_pelanggaran).trim(), m]));
  const jenis = {}, bidang = {}, harian = {}, terlibat = new Set();
  let poin = 0;

  rows.forEach(r => {
    const d = tglDari(kunciTgl(r.tanggal));
    const kode = String(r.kode_pelanggaran || '-').trim() || '-';
    const nb = String(r.bidang || 'Belum Dipetakan').trim() || 'Belum Dipetakan';
    const m = petaMaster[kode] || {};

    if (!jenis[kode]) jenis[kode] = {
      kode_pelanggaran: kode,
      nama_pelanggaran: r.nama_pelanggaran || m.nama_pelanggaran || kode,
      kategori: r.kategori || m.kategori || '-',
      bobot_poin: Number(m.bobot_poin) || Number(r.bobot_pelanggaran) || 0,
      bidang: nb, sumber: r.sumber || m.sumber || '-',
      frek_total:0, frek_30h:0, frek_prev30:0, poin:0, _santri:new Set(), _kelas:{}
    };
    const j = jenis[kode];
    j.frek_total++; j.poin += Number(r.bobot_pelanggaran) || 0;
    if (r.nisn) j._santri.add(String(r.nisn));
    const kl = String(r.kelas || '-').trim() || '-';
    j._kelas[kl] = (j._kelas[kl] || 0) + 1;

    if (!bidang[nb]) bidang[nb] = { nama:nb, jumlah:0, jumlah_30h:0, jumlah_prev30:0 };
    bidang[nb].jumlah++;

    if (d >= mulai30) { j.frek_30h++; bidang[nb].jumlah_30h++; }
    else if (d >= prevMulai && d <= prevAkhir) { j.frek_prev30++; bidang[nb].jumlah_prev30++; }

    const k = kunciTgl(r.tanggal);
    harian[k] = (harian[k] || 0) + 1;
    if (r.nisn) terlibat.add(String(r.nisn));
    poin += Number(r.bobot_pelanggaran) || 0;
  });

  const perJenis = Object.values(jenis).map(j => ({
    kode_pelanggaran: j.kode_pelanggaran,
    nama_pelanggaran: j.nama_pelanggaran,
    kategori: j.kategori, bobot_poin: j.bobot_poin,
    bidang: j.bidang, sumber: j.sumber,
    frek_total: j.frek_total, frek_30h: j.frek_30h, frek_prev30: j.frek_prev30,
    poin: j.poin, santri_unik: j._santri.size,
    kelas_teratas: Object.entries(j._kelas).sort((a,b) => b[1]-a[1]).slice(0,3)
  })).sort((a,b) => b.frek_total - a.frek_total);

  const terpakai = new Set(perJenis.map(j => j.kode_pelanggaran));
  const tidakTerpakai = lingkupMaster(master)
    .filter(m => !terpakai.has(String(m.kode_pelanggaran).trim()))
    .map(m => ({
      kode_pelanggaran: m.kode_pelanggaran, nama_pelanggaran: m.nama_pelanggaran,
      kategori: m.kategori, bidang: m.bidang || 'Belum Dipetakan'
    }));

  return {
    konteks: { unit:APP.ctx.unit, jenjang:APP.ctx.jenjang, role:role(),
               hari_ini:hariIni(), rentang_hari:n },
    periode: { mulai:kunciTgl(mulai), akhir:kunciTgl(akhir), mulai_30h:kunciTgl(mulai30),
               prev_mulai:kunciTgl(prevMulai), prev_akhir:kunciTgl(prevAkhir) },
    total: { kejadian: rows.length, santri_terlibat: terlibat.size, poin },
    bidang_master: (bidangMaster || []).map(b => ({
      nama_bidang: b.nama_bidang, deskripsi: b.deskripsi || '',
      kata_kunci: b.kata_kunci || '', sumber: b.sumber || '',
      jenjang: b.jenjang || 'Semua',
      aktif: String(b.aktif == null ? 'Ya' : b.aktif).toLowerCase() !== 'tidak'
    })),
    per_jenis: perJenis,
    per_bidang: Object.values(bidang)
      .map(b => ({ ...b, persen: rows.length ? aiBulat(b.jumlah / rows.length * 100) : 0 }))
      .sort((a,b) => b.jumlah - a.jumlah),
    master_tidak_terpakai: tidakTerpakai,
    harian: Object.entries(harian).sort().map(([tanggal, jumlah]) => ({ tanggal, jumlah }))
  };
}

/** Tren 30 hari dalam bentuk teks singkat. */
function aiTren(kini, lalu) {
  if (!lalu) return kini ? 'baru' : 'kosong';
  const p = Math.round((kini - lalu) / lalu * 100);
  return `${p > 0 ? '+' : ''}${p}%`;
}

async function aiGambarAnalisisPeraturan() {
  const el = $('anaPeraturan'); if (!el) return;
  el.innerHTML = '<div class="ac-loading"><i class="fa-solid fa-circle-notch fa-spin"></i>Menghitung…</div>';
  try {
    const p = await aiPayloadPeraturan(AI_AMBANG.mundurHari);
    APP.aiPeraturan = p;

    const top = p.per_jenis.slice(0, 10);
    const belum = p.per_bidang.find(b => b.nama === 'Belum Dipetakan');

    el.innerHTML = `
      <div class="ana-grid">
        <div class="ana-box"><small>Kejadian ${p.konteks.rentang_hari} hari</small><b>${angka(p.total.kejadian)}</b></div>
        <div class="ana-box"><small>Santri terlibat</small><b>${angka(p.total.santri_terlibat)}</b></div>
        <div class="ana-box"><small>Jenis terpakai</small><b>${angka(p.per_jenis.length)}</b></div>
        <div class="ana-box"><small>Jenis belum terpakai</small><b>${angka(p.master_tidak_terpakai.length)}</b></div>
      </div>

      <div class="tbl"><table>
        <thead><tr><th>Kode</th><th>Nama Pelanggaran</th><th>Kategori</th><th>Bidang</th>
          <th class="center">Total</th><th class="center">30h</th><th class="center">Tren</th>
          <th class="center">Santri</th><th>Pola</th></tr></thead>
        <tbody>${top.map(j => {
          const pola = j.santri_unik && (j.frek_total / j.santri_unik) >= 2 ? 'Individu berulang' : 'Tersebar';
          const t = aiTren(j.frek_30h, j.frek_prev30);
          return `<tr>
            <td class="secondary nowrap" style="padding-top:14px">${esc(j.kode_pelanggaran)}</td>
            <td><div class="primary">${esc(j.nama_pelanggaran)}</div>
                <div class="secondary">${esc(j.kelas_teratas.map(k => `${k[0]} (${k[1]})`).join(' · ') || '-')}</div></td>
            <td><span class="tag ${tagKategori(j.kategori)}">${esc(j.kategori)}</span></td>
            <td><span class="tag tag-sea">${esc(j.bidang)}</span></td>
            <td class="num center">${j.frek_total}</td>
            <td class="num center">${j.frek_30h}</td>
            <td class="num center">${esc(t)}</td>
            <td class="num center">${j.santri_unik}</td>
            <td class="secondary" style="padding-top:14px">${pola}</td>
          </tr>`;
        }).join('') || barisKosong(9, 'Belum ada kejadian pada rentang ini.',
            'Ubah unit aktif atau tunggu data masuk.')}</tbody>
      </table></div>
      <div class="scroll-hint"><i class="fa-solid fa-arrows-left-right"></i>Geser ke samping untuk kolom lainnya.</div>

      ${belum ? `<div class="ai-warn" style="margin:14px 20px 0">
        <b>${angka(belum.jumlah)} kejadian tanpa bidang</b>
        <ul><li>Petakan jenis pelanggaran terkait ke Master Bidang agar laporan per divisi utuh.</li></ul>
      </div>` : ''}

      ${p.master_tidak_terpakai.length ? `<div class="ai-warn" style="margin:14px 20px 0">
        <b>${angka(p.master_tidak_terpakai.length)} jenis tidak pernah dipakai</b>
        <ul>${p.master_tidak_terpakai.slice(0, 8).map(m =>
          `<li>${esc(m.kode_pelanggaran)} — ${esc(m.nama_pelanggaran)}</li>`).join('')}
          ${p.master_tidak_terpakai.length > 8 ? `<li>… dan ${p.master_tidak_terpakai.length - 8} lainnya.</li>` : ''}</ul>
      </div>` : ''}

      <div class="ai-actions">
        <button class="btn btn-ghost btn-sm" data-ai="payload-peraturan">
          <i class="fa-solid fa-file-code"></i>Salin payload AI</button>
        <button class="btn btn-ghost btn-sm" data-ai="prompt-peraturan">
          <i class="fa-solid fa-wand-magic-sparkles"></i>Salin instruksi AI</button>
      </div>`;
    tandaiTabelBisaGeser();
  } catch (err) {
    el.innerHTML = '<div class="ac-empty">Analisis gagal dimuat.</div>';
    fireError(err);
  }
}

// ---------- 24f. Payload ringkasan eksekutif Pimpinan ---------------
async function aiPayloadPimpinan() {
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

  const wkKunci = [], wkPeta = {};
  for (let c = awalPekan(mulai90); c <= awalPekan(akhir); c = tambahHari(c, 7)) {
    const k = kunciTgl(c); wkKunci.push(k); wkPeta[k] = 0;
  }
  d90.forEach(r => {
    const d = tglDari(kunciTgl(r.tanggal)); if (!d) return;
    const k = kunciTgl(awalPekan(d)); if (k in wkPeta) wkPeta[k]++;
  });

  const urutAng = ['VII','VIII','IX','X','XI','XII'];
  const angPeta = Object.fromEntries(urutAng.map(a =>
    [a, { angkatan:a, jumlahSantri:0, kasus:0, poin:0, berat:0, terlibat:new Set() }]));
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
    return { angkatan:it.angkatan, jumlahSantri:it.jumlahSantri, kasus:it.kasus,
             poin:it.poin, berat:it.berat, terlibat:it.terlibat.size,
             per100: it.jumlahSantri ? aiBulat(it.kasus / it.jumlahSantri * 100) : 0 };
  });

  const izin90 = izinAll.filter(z => {
    const d = tglDari(kunciTgl(z.tanggal_mulai)); return d && d >= mulai90 && d <= akhir;
  });
  const telatPer = {};
  const izinStat = { sesuai:0, telat:0, pending:0, rate:0 };
  izin90.forEach(z => {
    const s = String(z.status_persetujuan || '').trim();
    if (s === 'Sesuai Waktu') izinStat.sesuai++;
    else if (s === 'Telat Balik') { izinStat.telat++; telatPer[String(z.nisn)] = (telatPer[String(z.nisn)] || 0) + 1; }
    else if (s === 'Pending') izinStat.pending++;
  });
  const selesaiIzin = izinStat.sesuai + izinStat.telat;
  izinStat.rate = selesaiIzin ? aiBulat(izinStat.telat / selesaiIzin * 100) : 0;

  const pbnAktif = pembinaanAll.filter(aktifPembinaan);
  const binaPer = {};
  const binaStat = { total: pbnAktif.length, selesai:0, proses:0 };
  pbnAktif.forEach(p => {
    if (String(p.status_pembinaan) === 'Selesai') binaStat.selesai++;
    else { binaStat.proses++; binaPer[String(p.nisn)] = (binaPer[String(p.nisn)] || 0) + 1; }
  });
  const pernahBina = new Set(pbnAktif.map(p => String(p.nisn)));

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
    if (it.poin90 >= AI_AMBANG.poinKritis || it.berat >= 2) it.tier = 'Kritis';
    else if (it.poin90 >= AI_AMBANG.poinPerhatian || it.berat >= 1 || it.kasus30 >= 5) it.tier = 'Perhatian Tinggi';
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
  daftarPrio.sort((a,b) =>
    (peringkat[b.tier]-peringkat[a.tier]) || (b.poin90-a.poin90) || (b.kasus30-a.kasus30));

  const tier = { 'Kritis':0, 'Perhatian Tinggi':0, 'Monitor':0, 'Observasi':0 };
  daftarPrio.forEach(x => { tier[x.tier]++; });
  tier.rasio_kritis = siswa.length ? aiBulat(tier['Kritis'] / siswa.length * 100) : 0;
  tier.tanpa_pembinaan = daftarPrio.filter(x =>
    ['Kritis','Perhatian Tinggi'].includes(x.tier) && !pernahBina.has(x.nisn)).length;

  const ubah = dPrev.length === 0
    ? (d30.length === 0 ? 0 : null)
    : aiBulat((d30.length - dPrev.length) / dPrev.length * 100);

  return {
    konteks: { hari_ini:hariIni(), unit:APP.ctx.unit, jenjang:APP.ctx.jenjang,
               santri_aktif: siswa.length },
    pelanggaran: {
      d90: d90.length, d30: d30.length, dPrev: dPrev.length, ubah,
      poin90, santri_terlibat: terlibat.size,
      persen_terlibat: siswa.length ? aiBulat(terlibat.size / siswa.length * 100) : 0,
      kategori: kat
    },
    bidang: Object.entries(bidang).sort((a,b) => b[1]-a[1])
      .map(([nama, jumlah]) => ({ nama, jumlah,
        persen: d90.length ? aiBulat(jumlah / d90.length * 100) : 0 })),
    top_jenis: Object.entries(jenis).sort((a,b) => b[1]-a[1]).slice(0, 8),
    mingguan: wkKunci.map(k => ({ pekan:k, jumlah: wkPeta[k] })),
    angkatan, izin: izinStat, pembinaan: binaStat, tier,
    prioritas: daftarPrio.slice(0, 20).map(x => ({
      nisn:x.nisn, nama:x.nama, kelas:x.kelas, tier:x.tier,
      kasus90:x.kasus90, kasus30:x.kasus30, poin90:x.poin90,
      ringan:x.ringan, sedang:x.sedang, berat:x.berat,
      telat:x.telat, bina:x.bina, bidangDominan:x.bidangDominan, alasan:x.alasan
    }))
  };
}

// ---------- 24g. Satu penyalur klik untuk seluruh tombol AI ---------
document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-ai]'); if (!b) return;
  e.preventDefault();
  const aksi = b.dataset.ai;
  try {
    if (aksi === 'massal') return modalMassalPelanggaran();
    if (aksi === 'analisis-peraturan') return aiGambarAnalisisPeraturan();

    if (aksi === 'prompt-bulk')      return aiSalin(AI_PROMPT.bulk, 'Instruksi input massal');
    if (aksi === 'prompt-peraturan') return aiSalin(AI_PROMPT.peraturan, 'Instruksi analisis peraturan');
    if (aksi === 'prompt-pimpinan')  return aiSalin(AI_PROMPT.pimpinan, 'Instruksi analisis eksekutif');
    if (aksi === 'salin-kesimpulan') {
      if (!APP.aiKesimpulan) return toast('error', 'Kesimpulan belum tersusun.');
      return aiSalin(kesimpulanKeTeks(APP.aiKesimpulan), 'Kesimpulan konsultan');
    }

    if (aksi === 'payload-peraturan') {
      const p = APP.aiPeraturan || await aiPayloadPeraturan(AI_AMBANG.mundurHari);
      return aiSalinPayload(p, 'Payload analisis peraturan');
    }
    if (aksi === 'payload-pimpinan') {
      const asli = mulaiSimpan(b, 'Menyusun…');
      const p = await aiPayloadPimpinan();
      selesaiSimpan(b, asli, true, 'Payload siap');
      return aiSalinPayload(p, 'Payload dashboard pimpinan');
    }
  } catch (err) { fireError(err); }
});

// ---------------------------------------------------------------------
// 25. KONSULTAN PENDIDIKAN — KESIMPULAN OTOMATIS
//     Mesin aturan yang membaca payload eksekutif lalu menyusun satu
//     kesimpulan, lima pilar diagnosis, dan saran terpisah per peran.
//     Bila AI_LLM.url diisi, narasi diambil dari layanan tersebut dan
//     mesin lokal dipakai sebagai cadangan bila layanan gagal.
// ---------------------------------------------------------------------

/**
 * Jembatan opsional ke layanan analisis (mis. Supabase Edge Function).
 * Kosongkan `url` bila ingin memakai mesin lokal saja.
 * Layanan diharapkan menerima { prompt, payload } dan membalas JSON
 * dengan skema yang sama seperti keluaran konsultanLokal().
 */
const AI_LLM = {
  url: '',                 // contoh: 'https://xxxx.supabase.co/functions/v1/konsultan'
  header: { 'Content-Type': 'application/json' },
  timeout: 25000
};

const aiPersen = (a, b) => b ? Math.round((Number(a) / Number(b)) * 1000) / 10 : 0;

/** Kesimpulan konsultan berbasis aturan — selalu tersedia tanpa jaringan. */
function konsultanLokal(p) {
  const pl = p.pelanggaran, kat = pl.kategori, t = p.tier;
  const total = pl.d90 || 0;
  const persenBerat = aiPersen(kat.Berat, total);
  const persenSedang = aiPersen(kat.Sedang, total);
  const persenRingan = aiPersen(kat.Ringan, total);
  const kasusPerSantri = pl.santri_terlibat ? Math.round(total / pl.santri_terlibat * 10) / 10 : 0;
  const dom = p.bidang[0] || null;
  const belumPeta = p.bidang.find(b => b.nama === 'Belum Dipetakan');
  const rasioSelesai = aiPersen(p.pembinaan.selesai, p.pembinaan.total);
  const angkatanTop = p.angkatan.filter(a => a.jumlahSantri > 0)
    .slice().sort((a, b) => b.per100 - a.per100)[0];
  const ubah = pl.ubah;

  // ----- kondisi (ambang identik dengan dashboard) -----
  let kondisi = { kode:'ok', label:'Relatif Terkendali', ikon:'✅' };
  if ((ubah !== null && ubah > 20) || t.rasio_kritis >= 3 || kat.Berat >= 10) {
    kondisi = { kode:'danger', label:'Perlu Perhatian Pimpinan', ikon:'🚨' };
  } else if ((ubah !== null && ubah > 5) || t['Kritis'] > 0
             || t['Perhatian Tinggi'] >= 5 || p.izin.rate >= 20) {
    kondisi = { kode:'warn', label:'Perlu Penguatan Pengawasan', ikon:'⚠' };
  }

  const arah = ubah === null ? 'belum bisa dibandingkan'
    : ubah > 5 ? `naik ${ubah}%` : ubah < -5 ? `turun ${Math.abs(ubah)}%` : 'relatif datar';

  // ----- lima pilar -----
  const diagnosis = {
    disiplin_umum:
      `${angka(total)} catatan dalam 90 hari melibatkan ${angka(pl.santri_terlibat)} santri `
      + `(${pl.persen_terlibat}% dari ${angka(p.konteks.santri_aktif)} santri aktif). `
      + `Tren 30 hari terakhir ${arah} dibanding periode sebelumnya `
      + `(${pl.d30} vs ${pl.dPrev} kasus). `
      + (ubah !== null && ubah < -5
          ? 'Penurunan ini perlu dipastikan berasal dari perbaikan perilaku, bukan dari pencatatan yang mengendur.'
          : ubah !== null && ubah > 5
            ? 'Kenaikan ini layak ditelusuri ke bidang dan angkatan penyumbang terbesar.'
            : 'Volume stabil; fokus dialihkan ke kualitas tindak lanjut.'),

    beban_kategori:
      `Komposisi Ringan ${persenRingan}% · Sedang ${persenSedang}% · Berat ${persenBerat}%. `
      + (persenBerat > 15
          ? `Porsi Berat melampaui 15% — ini temuan yang menuntut asesmen individual, bukan sekadar sanksi. `
          : `Porsi Berat masih di bawah 15%, artinya sebagian besar persoalan bersifat pembiasaan. `)
      + `Rata-rata ${kasusPerSantri} kasus per santri terlibat, sehingga beban tergolong `
      + (kasusPerSantri >= 3 ? 'terkonsentrasi pada sedikit santri yang berulang.'
                             : 'tersebar merata di banyak santri.'),

    fokus_bidang: dom
      ? `Bidang ${dom.nama} mendominasi dengan ${angka(dom.jumlah)} kasus (${dom.persen}%). `
        + (dom.persen >= 40
            ? 'Konsentrasi setinggi ini biasanya menandakan rumusan aturan yang belum operasional atau penegakan yang tidak seragam antar petugas.'
            : 'Proporsi ini masih wajar untuk lingkungan asrama; yang perlu dijaga adalah konsistensi pembiasaan harian.')
        + (belumPeta ? ` Catatan: ${angka(belumPeta.jumlah)} kejadian belum terpetakan ke bidang mana pun.` : '')
      : 'Belum ada kejadian yang cukup untuk menilai fokus bidang.',

    respons_pembinaan:
      `${angka(p.pembinaan.total)} catatan pembinaan: ${angka(p.pembinaan.selesai)} Selesai `
      + `dan ${angka(p.pembinaan.proses)} Dalam Proses (${rasioSelesai}% tuntas). `
      + (t.tanpa_pembinaan > 0
          ? `${t.tanpa_pembinaan} santri tier Kritis/Perhatian Tinggi belum memiliki catatan pembinaan sama sekali — ini celah terbesar saat ini.`
          : 'Seluruh santri tier tinggi sudah tersentuh pembinaan; tinggal memastikan penutupan status setelah evaluasi.'),

    perilaku_sekunder:
      `Izin Telat Balik ${p.izin.telat} dari ${p.izin.sesuai + p.izin.telat} izin yang sudah berketerangan `
      + `(${p.izin.rate}%). `
      + (p.izin.rate >= 20
          ? 'Angka di atas 20% menandakan pengendalian diri dan kepatuhan jadwal yang lemah, dan biasanya berkorelasi dengan pelanggaran lain.'
          : 'Angka ini masih dalam batas wajar.')
      + (angkatanTop && angkatanTop.per100 > 0
          ? ` Angkatan ${angkatanTop.angkatan} tercatat tertinggi secara relatif dengan ${angkatanTop.per100} kasus per 100 santri.`
          : '')
  };

  // ----- saran per peran -----
  const guru = [];
  if (dom && dom.persen >= 30) guru.push({
    urgensi:'pekan_ini',
    aksi:`Sosialisasi ulang aturan bidang ${dom.nama} di jam wali kelas, memakai 5 contoh kasus nyata dari catatan 30 hari terakhir.`,
    metrik:`Kasus bidang ${dom.nama} turun di bawah ${Math.max(10, dom.persen - 10)}% pada tinjauan berikutnya.` });
  if (persenRingan >= 60) guru.push({
    urgensi:'segera',
    aksi:'Perkuat pengingat rutin sebelum waktu rawan (bangun subuh, masuk kelas, tertib asrama) alih-alih menambah sanksi baru.',
    metrik:'Jumlah kasus Ringan harian turun pada dua pekan berjalan.' });
  if (angkatanTop && angkatanTop.per100 > 0) guru.push({
    urgensi:'pekan_ini',
    aksi:`Wali kelas angkatan ${angkatanTop.angkatan} memetakan kelas penyumbang terbesar dan menyepakati satu aturan kelas bersama santri.`,
    metrik:`Kasus per 100 santri angkatan ${angkatanTop.angkatan} turun dari ${angkatanTop.per100}.` });
  guru.push({
    urgensi:'dua_pekan',
    aksi:'Samakan standar pencatatan antar petugas: satu perbuatan satu kode, catatan diisi untuk kategori Sedang dan Berat.',
    metrik:'Tidak ada lagi kejadian berbidang "Belum Dipetakan" pada catatan baru.' });

  const bk = [];
  if (t['Kritis'] > 0) bk.push({
    urgensi:'segera',
    sasaran:`${t['Kritis']} santri tier Kritis`,
    bentuk_pembinaan:'pendampingan individu',
    lini_masa:'Kontak awal dalam 3 hari, asesmen tuntas dalam 2 pekan.' });
  if (t.tanpa_pembinaan > 0) bk.push({
    urgensi:'segera',
    sasaran:`${t.tanpa_pembinaan} santri tier tinggi yang belum memiliki catatan pembinaan`,
    bentuk_pembinaan:'asesmen',
    lini_masa:'Jadwalkan seluruhnya pekan ini agar tidak ada kasus berat yang menggantung.' });
  if (t['Perhatian Tinggi'] >= 5) bk.push({
    urgensi:'pekan_ini',
    sasaran:`${t['Perhatian Tinggi']} santri tier Perhatian Tinggi`,
    bentuk_pembinaan:'pembinaan kelompok',
    lini_masa:'Dua sesi dalam tiga pekan, dengan kesepakatan tertulis per santri.' });
  if (p.izin.rate >= 20) bk.push({
    urgensi:'pekan_ini',
    sasaran:'Santri yang berulang kali Telat Balik',
    bentuk_pembinaan:'pertemuan wali',
    lini_masa:'Undang wali santri dengan dua kali telat atau lebih dalam bulan berjalan.' });
  if (!bk.length) bk.push({
    urgensi:'pekan_ini',
    sasaran:'Santri tier Monitor',
    bentuk_pembinaan:'pendampingan individu',
    lini_masa:'Pemantauan ringan dua pekan sekali untuk mencegah naik tier.' });

  const pimpinan = [];
  if (ubah !== null && ubah > 20) pimpinan.push({
    urgensi:'pekan_ini',
    tinjau:`Lonjakan ${ubah}% pada 30 hari terakhir.`,
    keputusan:'Panggil rapat lintas bagian (Pengasuhan, Madrasah, BK) untuk menetapkan satu prioritas penanganan, bukan beberapa sekaligus.',
    lini_masa:'Rapat pekan ini, evaluasi 14 hari.' });
  if (persenBerat > 15) pimpinan.push({
    urgensi:'pekan_ini',
    tinjau:`Porsi pelanggaran Berat ${persenBerat}%.`,
    keputusan:'Periksa proporsionalitas kategori dan bobot pada Master Pelanggaran, serta keseragaman penegakan antar petugas.',
    lini_masa:'Tinjauan katalog selesai dalam 14 hari.' });
  if (rasioSelesai < 50 && p.pembinaan.total > 0) pimpinan.push({
    urgensi:'dua_pekan',
    tinjau:`Hanya ${rasioSelesai}% pembinaan berstatus Selesai.`,
    keputusan:'Tetapkan batas waktu penutupan pembinaan dan tambah kapasitas pembina bila beban melebihi kemampuan.',
    lini_masa:'Kebijakan berlaku awal bulan berikutnya.' });
  if (belumPeta) pimpinan.push({
    urgensi:'dua_pekan',
    tinjau:`${angka(belumPeta.jumlah)} kejadian tanpa bidang.`,
    keputusan:'Instruksikan Admin memetakan seluruh jenis pelanggaran ke Master Bidang agar laporan per divisi utuh.',
    lini_masa:'Selesai dalam 14 hari.' });
  if (!pimpinan.length) pimpinan.push({
    urgensi:'dua_pekan',
    tinjau:'Indikator utama masih terkendali.',
    keputusan:'Pertahankan intensitas pengawasan dan jadwalkan sosialisasi berkala pada bidang dominan.',
    lini_masa:'Tinjauan rutin 14 hari.' });

  const kesimpulan =
    `${kondisi.ikon} ${kondisi.label} — ${angka(total)} catatan 90 hari, tren 30 hari ${arah}; `
    + `${t['Kritis']} santri tier Kritis dan ${t['Perhatian Tinggi']} Perhatian Tinggi `
    + `(${t.rasio_kritis}% santri aktif berada di tier Kritis).`;

  const kini = tglDari(p.konteks.hari_ini) || new Date();

  return {
    status: 'ok',
    sumber: 'lokal',
    kesimpulan_sementara: kesimpulan,
    kondisi,
    diagnosis,
    sorotan_angka: [
      { label:'Santri terlibat', nilai:`${pl.persen_terlibat}%`,
        arah: pl.persen_terlibat >= 30 ? 'naik' : 'stabil' },
      { label:'Porsi kategori Berat', nilai:`${persenBerat}%`,
        arah: persenBerat > 15 ? 'naik' : 'stabil' },
      { label:'Pembinaan tuntas', nilai:`${rasioSelesai}%`,
        arah: rasioSelesai >= 60 ? 'naik' : 'turun' },
      { label:'Izin telat balik', nilai:`${p.izin.rate}%`,
        arah: p.izin.rate >= 20 ? 'naik' : 'stabil' },
      { label:'Perubahan 30 hari', nilai: ubah === null ? 'Baru' : `${ubah > 0 ? '+' : ''}${ubah}%`,
        arah: ubah === null ? 'stabil' : ubah > 5 ? 'naik' : ubah < -5 ? 'turun' : 'stabil' }
    ],
    saran_untuk_guru: guru,
    saran_untuk_bk: bk,
    saran_untuk_pimpinan: pimpinan,
    santri_disorot: p.prioritas
      .filter(x => ['Kritis','Perhatian Tinggi'].includes(x.tier))
      .slice(0, 6)
      .map(x => ({ nisn:x.nisn, nama:x.nama, kelas:x.kelas, tier:x.tier, alasan:x.alasan })),
    catatan_batas:
      'Kesimpulan ini berbasis potret 90 hari dari data yang tercatat. Angka rendah bisa berarti '
      + 'disiplin membaik atau pencatatan menurun. Untuk memahami motif santri, koordinasikan dengan Guru BK.',
    tinjauan_berikutnya: kunciTgl(tambahHari(kini, 14))
  };
}

/** Ambil kesimpulan: layanan eksternal bila tersedia, selain itu mesin lokal. */
async function aiKonsultan(payload) {
  if (!AI_LLM.url) return konsultanLokal(payload);
  try {
    const kontrol = new AbortController();
    const jam = setTimeout(() => kontrol.abort(), AI_LLM.timeout);
    const res = await fetch(AI_LLM.url, {
      method: 'POST', headers: AI_LLM.header, signal: kontrol.signal,
      body: JSON.stringify({ prompt: AI_PROMPT.pimpinan, payload })
    });
    clearTimeout(jam);
    if (!res.ok) throw new Error(`Layanan analisis membalas ${res.status}`);
    const teks = await res.text();
    const bersih = teks.replace(/```json|```/g, '').trim();
    const data = JSON.parse(bersih);
    if (!data || !data.diagnosis) throw new Error('Balasan layanan tidak lengkap.');
    return { ...konsultanLokal(payload), ...data, sumber: 'layanan' };
  } catch (e) {
    console.warn('Layanan analisis tidak terpakai:', e.message);
    return { ...konsultanLokal(payload), sumber: 'lokal (layanan gagal)' };
  }
}

const PILAR = {
  disiplin_umum:     { judul:'Disiplin Umum',        ikon:'fa-gauge-high' },
  beban_kategori:    { judul:'Beban Kategori',       ikon:'fa-scale-unbalanced' },
  fokus_bidang:      { judul:'Fokus Bidang',         ikon:'fa-compass' },
  respons_pembinaan: { judul:'Respons Pembinaan',    ikon:'fa-hands-holding-child' },
  perilaku_sekunder: { judul:'Perilaku Sekunder',    ikon:'fa-person-walking-arrow-right' }
};

const URGEN = { segera:'tag-berat', pekan_ini:'tag-sedang', dua_pekan:'tag-sea' };
const labelUrgen = (u) => u === 'segera' ? 'Segera' : u === 'pekan_ini' ? 'Pekan ini' : 'Dua pekan';

function kartuSaranKonsultan(k) {
  const guru = (k.saran_untuk_guru || []).map(s => `<li>
    <span class="tag ${URGEN[s.urgensi] || 'tag-off'}">${labelUrgen(s.urgensi)}</span>
    <p>${esc(s.aksi)}</p><small>Ukuran keberhasilan: ${esc(s.metrik || '-')}</small></li>`).join('');
  const bk = (k.saran_untuk_bk || []).map(s => `<li>
    <span class="tag ${URGEN[s.urgensi] || 'tag-off'}">${labelUrgen(s.urgensi)}</span>
    <p>${esc(s.sasaran)} — ${esc(s.bentuk_pembinaan)}</p>
    <small>${esc(s.lini_masa || '-')}</small></li>`).join('');
  const pim = (k.saran_untuk_pimpinan || []).map(s => `<li>
    <span class="tag ${URGEN[s.urgensi] || 'tag-off'}">${labelUrgen(s.urgensi)}</span>
    <p>${esc(s.tinjau)}</p><small>${esc(s.keputusan)} · ${esc(s.lini_masa || '-')}</small></li>`).join('');

  return `<div class="kons-saran">
    <div class="kons-kolom"><h4><i class="fa-solid fa-chalkboard-user"></i>Guru &amp; Wali Kelas</h4>
      <ul>${guru || '<li><p>Tidak ada tindakan mendesak.</p></li>'}</ul></div>
    <div class="kons-kolom"><h4><i class="fa-solid fa-user-doctor"></i>Guru BK</h4>
      <ul>${bk || '<li><p>Tidak ada tindakan mendesak.</p></li>'}</ul></div>
    <div class="kons-kolom"><h4><i class="fa-solid fa-landmark"></i>Pimpinan</h4>
      <ul>${pim || '<li><p>Tidak ada keputusan yang tertunda.</p></li>'}</ul></div>
  </div>`;
}

async function gambarKonsultan() {
  const el = $('konsultanBox'); if (!el) return;
  el.innerHTML = `<div class="card"><div class="ac-loading">
    <i class="fa-solid fa-circle-notch fa-spin"></i>Menyusun kesimpulan konsultan…</div></div>`;
  try {
    const payload = APP.aiPimpinan || await aiPayloadPimpinan();
    APP.aiPimpinan = payload;
    const k = await aiKonsultan(payload);
    APP.aiKesimpulan = k;

    el.innerHTML = kartuBrankasKonsultan(k);
  } catch (err) {
    el.innerHTML = `<div class="card"><div class="ac-empty">Kesimpulan gagal disusun.</div></div>`;
    console.warn(err);
  }
}

/* =====================================================================
 * DASHBOARD PIMPINAN — tiga panel berat dibungkus jadi kartu ringkas
 * =====================================================================
 * Kesimpulan konsultan, daftar santri prioritas, dan peringkat jenis
 * pelanggaran adalah blok terpanjang di halaman ini. Ketiganya kini
 * hanya menampilkan ringkasan yang terbaca sekilas; isi lengkapnya
 * dibuka sebagai jendela yang bergulir di dalam dirinya sendiri.
 * ===================================================================== */

/** Isi lengkap kesimpulan konsultan — dipakai di dalam jendela. */
function htmlKesimpulanLengkap(k) {
  return `
      <div class="kons-head ${k.kondisi.kode}">
        <div class="kons-ikon"><i class="fa-solid fa-user-tie"></i></div>
        <div>
          <small>Kesimpulan menyeluruh · ${esc(k.kondisi.label)}</small>
          <p>${esc(k.kesimpulan_sementara)}</p>
        </div>
      </div>

      <div class="kons-angka">
        ${(k.sorotan_angka || []).map(s => `<div class="ana-box">
          <small>${esc(s.label)}</small><b>${esc(s.nilai)}</b>
          <span class="arah ${esc(s.arah)}">${s.arah === 'naik' ? '▲' : s.arah === 'turun' ? '▼' : '■'} ${esc(s.arah)}</span>
        </div>`).join('')}
      </div>

      <div class="kons-pilar">
        ${Object.keys(PILAR).map(key => `<article>
          <h4><i class="fa-solid ${PILAR[key].ikon}"></i>${PILAR[key].judul}</h4>
          <p>${esc(k.diagnosis[key] || '-')}</p>
        </article>`).join('')}
      </div>

      ${kartuSaranKonsultan(k)}

      ${(k.santri_disorot || []).length ? `<div class="kons-sorot">
        <h4><i class="fa-solid fa-user-shield"></i>Santri yang disorot</h4>
        <div class="kons-chips">${k.santri_disorot.map(s => `<button class="mchip"
          data-detail="${esc(s.nisn)}" title="${esc(s.alasan)}">
          ${esc(s.nama)} <span class="nis">${esc(s.kelas)} · ${esc(s.tier)}</span></button>`).join('')}</div>
      </div>` : ''}

      <div class="kons-catatan"><i class="fa-solid fa-circle-info"></i>${esc(k.catatan_batas)}</div>

      <div class="ai-actions">
        <button class="btn btn-ghost btn-sm" data-ai="salin-kesimpulan">
          <i class="fa-solid fa-copy"></i>Salin kesimpulan</button>
        <button class="btn btn-ghost btn-sm" data-ai="payload-pimpinan">
          <i class="fa-solid fa-file-code"></i>Salin data mentah</button>
        <button class="btn btn-ghost btn-sm" data-ai="prompt-pimpinan">
          <i class="fa-solid fa-wand-magic-sparkles"></i>Salin instruksi AI</button>
      </div>

      <p class="kons-sumber">Sumber analisis: ${esc(k.sumber)} · tinjauan berikutnya
        ${tgl(k.tinjauan_berikutnya)}</p>`;
}

/** Kartu ringkas kesimpulan konsultan (lebar penuh, di atas grafik). */
function kartuBrankasKonsultan(k) {
  const tagKondisi = k.kondisi.kode === 'danger' ? 'tag-berat'
    : k.kondisi.kode === 'warn' ? 'tag-sedang' : 'tag-ok';
  const ringkas = String(k.kesimpulan_sementara || '');
  const potong = ringkas.length > 210 ? ringkas.slice(0, 208).replace(/\s+\S*$/, '') + '…' : ringkas;
  const angka3 = (k.sorotan_angka || []).slice(0, 3);
  const disorot = (k.santri_disorot || []).length;
  const aksi = (k.saran_untuk_guru || []).length + (k.saran_untuk_bk || []).length
             + (k.saran_untuk_pimpinan || []).length;
  return `<button type="button" class="brankas wide" title="Klik untuk membaca kesimpulan lengkap">
    <div class="brk-top">
      <span class="brk-ico"><i class="fa-solid fa-user-tie"></i></span>
      <div class="eyebrow"><span class="ar">تحليل</span><span class="rule"></span>
        <span class="lat">Konsultan Pendidikan</span></div>
      <span class="tag ${tagKondisi}" style="margin-left:auto">${esc(k.kondisi.label)}</span>
    </div>
    <b class="brk-nm">Kesimpulan Konsultan Pendidikan</b>
    <p class="brk-lead">${esc(potong)}</p>
    <div class="brk-chips">
      ${angka3.map(a => `<span class="tag tag-sea">${esc(a.label)}: ${esc(a.nilai)}</span>`).join('')}
      <span class="tag tag-off">${angka(aksi)} rekomendasi</span>
      ${disorot ? `<span class="tag tag-violet">${angka(disorot)} santri disorot</span>` : ''}
    </div>
    <span class="brk-go"><i class="fa-solid fa-file-lines"></i>Baca kesimpulan lengkap
      <i class="fa-solid fa-arrow-right brk-arrow"></i></span>
  </button>`;
}

function bukaKesimpulanKonsultan() {
  const k = APP.aiKesimpulan;
  if (!k) return toast('info', 'Kesimpulan masih disusun. Coba lagi sebentar lagi.');
  Swal.fire({
    title: 'Kesimpulan Konsultan Pendidikan',
    width: 1000, showConfirmButton: false, showCloseButton: true,
    customClass: { popup: 'dft-popup' },
    html: `<div class="dft kons-modal">${htmlKesimpulanLengkap(k)}</div>`,
    didOpen: () => {
      Swal.getHtmlContainer()?.addEventListener('click', (e) => {
        const s = e.target.closest('[data-detail]'); if (!s) return;
        Swal.close();
        bukaDetailSantri(s.dataset.detail);
      });
    }
  });
}

/* ---------- Santri yang membutuhkan perhatian ---------- */
function kartuBrankasPrioritas() {
  const n = PIM.prio.length;
  const tiga = PIM.prio.slice(0, 3).map(r => r.nama);
  return `<button type="button" class="brankas" title="Klik untuk membuka daftar lengkap">
    <div class="brk-top">
      <span class="brk-ico"><i class="fa-solid fa-user-shield"></i></span>
      <div class="eyebrow"><span class="ar">المتابعة</span><span class="rule"></span>
        <span class="lat">Prioritas</span></div>
    </div>
    <b class="brk-nm">Santri Membutuhkan Perhatian</b>
    <p class="brk-sub">Ranking indikator, bukan keputusan hukuman otomatis.</p>
    <div class="brk-angka">
      <span class="brk-v">${angka(n)}</span>
      <span class="brk-k">santri pada indikator</span>
    </div>
    <div class="brk-chips">
      <span class="tag tag-berat">Kritis ${angka(PIM.kritis)}</span>
      <span class="tag tag-sedang">Perhatian ${angka(PIM.perhatian)}</span>
      <span class="tag tag-sea">Monitor ${angka(PIM.monitor)}</span>
      ${tiga.map(nm => `<span class="tag tag-off">${esc(nm)}</span>`).join('')}
    </div>
    <span class="brk-go"><i class="fa-solid fa-list-ul"></i>Buka daftar lengkap
      <i class="fa-solid fa-arrow-right brk-arrow"></i></span>
  </button>`;
}

function bukaSantriPrioritas() {
  if (!PIM.prio.length) return toast('info', 'Belum ada santri pada indikator prioritas.');
  Swal.fire({
    title: 'Santri Membutuhkan Perhatian',
    width: 1120, showConfirmButton: false, showCloseButton: true,
    customClass: { popup: 'dft-popup' },
    html: `<div class="dft">
      <div class="dft-bar">
        <input id="prCari" class="input grow" autocomplete="off"
               placeholder="Cari nama, NISN, kelas, atau bidang…" value="${esc(stPrio.cari)}">
        <span class="tag tag-off" id="prCount">—</span>
      </div>
      <div class="dft-chips" id="prChips">
        ${['Semua','Kritis','Perhatian Tinggi','Monitor','Observasi'].map(t =>
          `<button class="chip${stPrio.tier === t ? ' on' : ''}" data-tier="${esc(t)}">${t}</button>`).join('')}
        <span class="dft-note"><i class="fa-solid fa-circle-info"></i>
          ${esc(PIM.rentang || '90 hari terakhir')} · klik baris untuk membuka profil</span>
      </div>
      <div class="dft-wrap"><table class="dft-tbl">
        <thead><tr><th>Santri</th><th>Kelas</th><th>Tier</th><th class="center">Kasus 90h</th>
          <th class="center">Kasus 30h</th><th class="center">Poin</th><th>Bidang Dominan</th>
          <th class="center">Telat</th><th class="center">Bina</th><th>Alasan</th></tr></thead>
        <tbody id="tbPrio"></tbody>
      </table></div>
    </div>`,
    didOpen: () => {
      gambarPrio();
      $('prCari')?.addEventListener('input', debounce(e => {
        stPrio.cari = e.target.value.trim(); gambarPrio();
      }, 200));
      $('prChips')?.addEventListener('click', (e) => {
        const c = e.target.closest('[data-tier]'); if (!c) return;
        stPrio.tier = c.dataset.tier;
        $('prChips').querySelectorAll('.chip').forEach(x => x.classList.toggle('on', x === c));
        gambarPrio();
      });
      Swal.getHtmlContainer()?.addEventListener('click', (e) => {
        const t = e.target.closest('[data-detail]'); if (!t) return;
        Swal.close();
        bukaDetailSantri(t.dataset.detail);
      });
    }
  });
}

function gambarPrio() {
  const tb = $('tbPrio'); if (!tb) return;
  const warnaTier = (t) => t === 'Kritis' ? 'tag-berat' : t === 'Perhatian Tinggi' ? 'tag-sedang'
    : t === 'Monitor' ? 'tag-sea' : 'tag-off';
  let rows = PIM.prio;
  if (stPrio.tier !== 'Semua') rows = rows.filter(r => r.tier === stPrio.tier);
  rows = cariLokal(rows, stPrio.cari, ['nama','nisn','kelas','bidangDominan','tier','alasan'], 999);
  const cnt = $('prCount'); if (cnt) cnt.textContent = `${angka(rows.length)} santri`;
  tb.innerHTML = rows.map(r => `<tr data-detail="${esc(r.nisn)}" style="cursor:pointer">
    <td style="min-width:186px"><div class="primary">${esc(r.nama)}</div>
      <div class="secondary">${esc(r.nisn)}</div></td>
    <td class="nowrap">${esc(r.kelas)}</td>
    <td><span class="tag ${warnaTier(r.tier)}">${esc(r.tier)}</span></td>
    <td class="num center">${r.kasus90}</td>
    <td class="num center">${r.kasus30}</td>
    <td class="num center">${r.poin90}</td>
    <td>${esc(r.bidangDominan)}</td>
    <td class="num center">${r.telat}</td>
    <td class="num center">${r.bina}</td>
    <td style="min-width:210px;font-size:12.5px;color:var(--text-2)">${esc(r.alasan)}</td>
  </tr>`).join('') || barisKosong(10, 'Tidak ada santri yang cocok.',
    'Ubah kata kunci atau pilih tier lain.');
}

/* ---------- Jenis pelanggaran terbanyak ---------- */
function kartuBrankasJenis() {
  const total = PIM.jenis.reduce((a, [, n]) => a + n, 0);
  const puncak = PIM.jenis[0];
  return `<button type="button" class="brankas alt" title="Klik untuk membuka peringkat lengkap">
    <div class="brk-top">
      <span class="brk-ico"><i class="fa-solid fa-ranking-star"></i></span>
      <div class="eyebrow"><span class="ar">أكثر المخالفات</span><span class="rule"></span>
        <span class="lat">Peringkat</span></div>
    </div>
    <b class="brk-nm">Jenis Pelanggaran Terbanyak</b>
    <p class="brk-sub">${puncak ? 'Teratas: ' + esc(puncak[0]) : 'Belum ada data pada periode ini.'}</p>
    <div class="brk-angka">
      <span class="brk-v">${angka(puncak ? puncak[1] : 0)}</span>
      <span class="brk-k">kejadian pada jenis teratas</span>
    </div>
    <div class="brk-chips">
      <span class="tag tag-sea">${angka(PIM.jenis.length)} jenis tercatat</span>
      <span class="tag tag-off">${angka(total)} total kejadian</span>
      ${PIM.jenis.slice(1, 3).map(([nm, n]) =>
        `<span class="tag tag-off">${esc(nm)} ${n}x</span>`).join('')}
    </div>
    <span class="brk-go"><i class="fa-solid fa-list-ol"></i>Buka peringkat lengkap
      <i class="fa-solid fa-arrow-right brk-arrow"></i></span>
  </button>`;
}

function bukaJenisTerbanyak() {
  if (!PIM.jenis.length) return toast('info', 'Belum ada data pelanggaran pada periode ini.');
  const maks = PIM.jenis[0][1] || 1;
  const total = PIM.jenis.reduce((a, [, n]) => a + n, 0);
  Swal.fire({
    title: 'Jenis Pelanggaran Terbanyak',
    width: 720, showConfirmButton: false, showCloseButton: true,
    customClass: { popup: 'dft-popup' },
    html: `<div class="dft">
      <div class="dft-chips">
        <span class="tag tag-sea">${angka(PIM.jenis.length)} jenis</span>
        <span class="tag tag-off">${angka(total)} kejadian</span>
        <span class="dft-note"><i class="fa-solid fa-circle-info"></i>
          ${esc(PIM.rentang || '90 hari terakhir')}</span>
      </div>
      <div class="dft-wrap jns-wrap">
        ${PIM.jenis.map(([nama, jml], i) => `<div class="jns">
          <span class="jns-n">${String(i + 1).padStart(2, '0')}</span>
          <div class="jns-body">
            <div class="jns-row"><span class="jns-t">${esc(nama)}</span>
              <span class="jns-c">${angka(jml)}x</span></div>
            <div class="jns-bar"><i style="width:${Math.max(3, Math.round(jml / maks * 100))}%"></i></div>
          </div>
        </div>`).join('')}
      </div>
    </div>`
  });
}

/** Versi teks datar untuk disalin ke notula atau pesan. */
function kesimpulanKeTeks(k) {
  const baris = [];
  baris.push('KESIMPULAN KONSULTAN PENDIDIKAN — DAYAH RUHUL QURANI');
  baris.push(`Tanggal ${tgl(hariIni())} · Kondisi: ${k.kondisi.label}`);
  baris.push('');
  baris.push(k.kesimpulan_sementara);
  baris.push('');
  baris.push('DIAGNOSIS');
  Object.keys(PILAR).forEach(key => {
    baris.push(`- ${PILAR[key].judul}: ${k.diagnosis[key]}`);
  });
  baris.push('');
  baris.push('SARAN GURU & WALI KELAS');
  (k.saran_untuk_guru || []).forEach((s, i) =>
    baris.push(`${i+1}. [${labelUrgen(s.urgensi)}] ${s.aksi} (Ukuran: ${s.metrik})`));
  baris.push('');
  baris.push('SARAN GURU BK');
  (k.saran_untuk_bk || []).forEach((s, i) =>
    baris.push(`${i+1}. [${labelUrgen(s.urgensi)}] ${s.sasaran} — ${s.bentuk_pembinaan} (${s.lini_masa})`));
  baris.push('');
  baris.push('SARAN PIMPINAN');
  (k.saran_untuk_pimpinan || []).forEach((s, i) =>
    baris.push(`${i+1}. [${labelUrgen(s.urgensi)}] ${s.tinjau} → ${s.keputusan} (${s.lini_masa})`));
  if ((k.santri_disorot || []).length) {
    baris.push('');
    baris.push('SANTRI DISOROT');
    k.santri_disorot.forEach(s => baris.push(`- ${s.nama} (${s.kelas}) · ${s.tier} · ${s.alasan}`));
  }
  baris.push('');
  baris.push(k.catatan_batas);
  baris.push(`Tinjauan berikutnya: ${tgl(k.tinjauan_berikutnya)}`);
  return baris.join('\n');
}

// ---------------------------------------------------------------------
// 26. EVALUASI BIDANG PELANGGARAN (menu tersendiri)
// ---------------------------------------------------------------------
const stBidang = { pilih:'', hari: AI_AMBANG.mundurHari };

async function viewEvaluasiBidang() {
  const p = await aiPayloadPeraturan(stBidang.hari);
  APP.aiPeraturan = p;

  // Rangkum tiap bidang dari daftar jenis.
  const peta = {};
  p.per_bidang.forEach(b => {
    peta[b.nama] = { ...b, jenis: [], kategori:{ Ringan:0, Sedang:0, Berat:0 }, santri:0 };
  });
  p.per_jenis.forEach(j => {
    const b = peta[j.bidang]; if (!b) return;
    b.jenis.push(j);
    if (b.kategori[j.kategori] !== undefined) b.kategori[j.kategori] += j.frek_total;
    b.santri += j.santri_unik;
  });
  const daftar = Object.values(peta).sort((a, b) => b.jumlah - a.jumlah);
  if (stBidang.pilih && !peta[stBidang.pilih]) stBidang.pilih = '';

  const jenisTampil = stBidang.pilih
    ? p.per_jenis.filter(j => j.bidang === stBidang.pilih)
    : p.per_jenis;

  $('viewRoot').innerHTML = `
    <section class="hero" style="padding:24px">
      <div class="eyebrow"><span class="ar">تقويم المجالات</span><span class="rule"></span>
        <span class="lat">Evaluasi Bidang</span></div>
      <h2 style="font-size:clamp(24px,3vw,32px)">Evaluasi per Bidang Pelanggaran</h2>
      <p>Membaca peraturan dari sisi divisi: bidang mana yang paling banyak menyerap kejadian,
         bagaimana trennya, dan aturan mana yang belum pernah ditegakkan.</p>
      <div class="meta">
        <span><i class="fa-solid fa-layer-group"></i>${esc(labelKonteks())}</span>
        <span><i class="fa-regular fa-calendar"></i>${tgl(p.periode.mulai)} – ${tgl(p.periode.akhir)}</span>
        <span><i class="fa-solid fa-database"></i>${angka(p.total.kejadian)} kejadian</span>
      </div>
    </section>

    <div class="stats">
      ${stat('Kejadian', angka(p.total.kejadian), 'fa-solid fa-triangle-exclamation',
        'background:var(--maroon-bg);color:var(--maroon)', 'var(--maroon)', `${stBidang.hari} hari terakhir`)}
      ${stat('Bidang Aktif', angka(daftar.length), 'fa-solid fa-diagram-project',
        'background:#E7F1F7;color:var(--sea)', 'var(--sea)', 'Bidang dengan kejadian')}
      ${stat('Jenis Terpakai', angka(p.per_jenis.length), 'fa-solid fa-book-open',
        'background:var(--violet-bg);color:var(--violet)', 'var(--violet)', 'Dari Master Pelanggaran')}
      ${stat('Belum Terpakai', angka(p.master_tidak_terpakai.length), 'fa-solid fa-box-archive',
        'background:var(--amber-bg);color:var(--amber)', 'var(--amber)', 'Aturan tanpa kejadian')}
    </div>

    ${kartu('Peta Bidang', `
      <div class="card-note"><i class="fa-solid fa-hand-pointer"></i>
        Pilih satu bidang untuk menyaring tabel jenis pelanggaran di bawahnya.</div>
      <div class="bid-grid">
        ${daftar.map(b => {
          const t = aiTren(b.jumlah_30h, b.jumlah_prev30);
          const naik = b.jumlah_prev30 && b.jumlah_30h > b.jumlah_prev30;
          return `<button class="bid-card${stBidang.pilih === b.nama ? ' on' : ''}"
                    data-bidang-pilih="${esc(b.nama)}">
            <div class="bid-top"><b>${esc(b.nama)}</b>
              <span class="tag ${naik ? 'tag-berat' : 'tag-ok'}">${esc(t)}</span></div>
            <div class="bid-angka">${angka(b.jumlah)}<small>kejadian · ${b.persen}%</small></div>
            <div class="bid-bar">
              <span style="width:${b.jumlah ? b.kategori.Ringan / b.jumlah * 100 : 0}%;background:#0F766E"></span>
              <span style="width:${b.jumlah ? b.kategori.Sedang / b.jumlah * 100 : 0}%;background:#B45309"></span>
              <span style="width:${b.jumlah ? b.kategori.Berat / b.jumlah * 100 : 0}%;background:#9F1239"></span>
            </div>
            <div class="bid-kaki">R ${b.kategori.Ringan} · S ${b.kategori.Sedang} · B ${b.kategori.Berat}
              · ${b.jenis.length} jenis</div>
          </button>`;
        }).join('') || '<p style="color:var(--text-3);padding:16px">Belum ada kejadian pada rentang ini.</p>'}
      </div>`,
      stBidang.pilih ? `<button class="btn btn-ghost btn-sm" data-bidang-pilih="">
        <i class="fa-solid fa-rotate-left"></i>Tampilkan semua</button>` : '',
      'Batang warna menunjukkan komposisi Ringan · Sedang · Berat.')}

    <div class="grid-2">
      ${kartu('Sebaran Kejadian per Bidang', chartBox('bidBar'), '', `${stBidang.hari} hari terakhir`)}
      ${kartu('Pergerakan 30 Hari', chartBox('bidTren'), '', '30 hari terakhir vs 30 hari sebelumnya')}
    </div>

    ${kartu(stBidang.pilih ? `Jenis Pelanggaran — ${stBidang.pilih}` : 'Jenis Pelanggaran (semua bidang)', `
      <div class="tbl"><table>
        <thead><tr><th>Kode</th><th>Nama Pelanggaran</th><th>Kategori</th><th>Bidang</th>
          <th class="center">Total</th><th class="center">30h</th><th class="center">Tren</th>
          <th class="center">Santri</th><th>Pola</th></tr></thead>
        <tbody>${jenisTampil.slice(0, 40).map(j => {
          const pola = j.santri_unik && (j.frek_total / j.santri_unik) >= 2 ? 'Individu berulang' : 'Tersebar';
          return `<tr>
            <td class="secondary nowrap" style="padding-top:14px">${esc(j.kode_pelanggaran)}</td>
            <td><div class="primary">${esc(j.nama_pelanggaran)}</div>
                <div class="secondary">${esc(j.kelas_teratas.map(k => `${k[0]} (${k[1]})`).join(' · ') || '-')}</div></td>
            <td><span class="tag ${tagKategori(j.kategori)}">${esc(j.kategori)}</span></td>
            <td><span class="tag tag-sea">${esc(j.bidang)}</span></td>
            <td class="num center">${j.frek_total}</td>
            <td class="num center">${j.frek_30h}</td>
            <td class="num center">${esc(aiTren(j.frek_30h, j.frek_prev30))}</td>
            <td class="num center">${j.santri_unik}</td>
            <td class="secondary" style="padding-top:14px">${pola}</td>
          </tr>`;
        }).join('') || barisKosong(9, 'Belum ada kejadian pada bidang ini.',
            'Coba pilih bidang lain atau ganti unit aktif.')}</tbody>
      </table></div>
      <div class="scroll-hint"><i class="fa-solid fa-arrows-left-right"></i>Geser ke samping untuk kolom lainnya.</div>`,
      `<span class="tag tag-off">${angka(jenisTampil.length)} jenis</span>`)}

    ${kartu('Kebersihan Katalog Peraturan', `
      ${p.master_tidak_terpakai.length ? `<div class="ai-warn" style="margin:16px 20px 0">
        <b>${angka(p.master_tidak_terpakai.length)} jenis tidak pernah dipakai pada rentang ini</b>
        <ul>${p.master_tidak_terpakai.slice(0, 12).map(m =>
          `<li>${esc(m.kode_pelanggaran)} — ${esc(m.nama_pelanggaran)}
            <span class="tag ${tagKategori(m.kategori)}">${esc(m.kategori)}</span></li>`).join('')}
          ${p.master_tidak_terpakai.length > 12
            ? `<li>… dan ${p.master_tidak_terpakai.length - 12} lainnya.</li>` : ''}</ul>
      </div>` : `<div class="card-note"><i class="fa-solid fa-circle-check"></i>
        Seluruh jenis pelanggaran pada unit ini pernah ditegakkan.</div>`}
      <div class="ai-actions">
        <button class="btn btn-ghost btn-sm" data-ai="payload-peraturan">
          <i class="fa-solid fa-file-code"></i>Salin data mentah</button>
        <button class="btn btn-ghost btn-sm" data-ai="prompt-peraturan">
          <i class="fa-solid fa-wand-magic-sparkles"></i>Salin instruksi AI</button>
      </div>`,
      isAdmin() ? '<span class="tag tag-sea">Perubahan katalog: menu Master</span>' : '',
      'Aturan yang tak pernah dipakai perlu ditinjau: dihapus, digabung, atau memang belum ditegakkan.')}`;

  buatChart('bidBar','bidBar',{ type:'bar',
    data:{ labels: daftar.slice(0,8).map(b => b.nama),
      datasets:[{ label:'Kejadian', data: daftar.slice(0,8).map(b => b.jumlah),
        backgroundColor:'#1B7AAD', borderRadius:6 }]},
    options:{ indexAxis:'y', responsive:true, maintainAspectRatio:false,
      plugins:{legend:{display:false}},
      scales:{x:{beginAtZero:true,ticks:{precision:0}},y:{grid:{display:false}}} }});

  buatChart('bidTren','bidTren',{ type:'bar',
    data:{ labels: daftar.slice(0,8).map(b => b.nama),
      datasets:[
        { label:'30 hari sebelumnya', data: daftar.slice(0,8).map(b => b.jumlah_prev30),
          backgroundColor:'#8298AC', borderRadius:5 },
        { label:'30 hari terakhir', data: daftar.slice(0,8).map(b => b.jumlah_30h),
          backgroundColor:'#C9A227', borderRadius:5 }
      ]},
    options:{ responsive:true, maintainAspectRatio:false,
      plugins:{legend:{position:'bottom',labels:{usePointStyle:true,boxWidth:9}}},
      scales:{x:{grid:{display:false}},y:{beginAtZero:true,ticks:{precision:0}}} }});

  onKlik((e) => {
    const b = e.target.closest('[data-bidang-pilih]');
    if (b) { stBidang.pilih = b.dataset.bidangPilih; return viewEvaluasiBidang(); }
    const d = e.target.closest('[data-detail]');
    if (d) return bukaDetailSantri(d.dataset.detail);
  });
}

// ---------------------------------------------------------------------
// 27. NOTIFIKASI WHATSAPP — AJUAN IZIN KE GRUP
//     Aplikasi hanya mengirim ke satu webhook; pengiriman ke grup
//     dilakukan oleh layanan di luar browser (lihat panduan terpisah).
//     Bila WA.webhook kosong, tombol memakai tautan wa.me sebagai
//     jalur manual sehingga fitur tetap berguna tanpa server.
// ---------------------------------------------------------------------
const WA = {
  webhook: '',        // contoh: 'https://xxxx.supabase.co/functions/v1/wa-izin'
  kunci: '',          // dikirim sebagai header x-rq-token bila diisi
  grup: '',           // id grup WhatsApp, mis. '1203630xxxxxxxxx@g.us'
  nomorUji: ''        // nomor pribadi untuk jalur wa.me, mis. '628116xxxxxxx'
};

/** Susun pesan izin yang rapi untuk dibaca di grup. */
function waPesanIzin(z) {
  const s = z.siswa || {};
  const baris = [
    '*AJUAN IZIN SANTRI*',
    'Dayah Ruhul Qurani',
    '',
    `Nama    : ${s.nama_siswa || '-'}`,
    `NISN    : ${z.nisn || '-'}`,
    `Kelas   : ${s.kelas || '-'}${s.jenjang ? ' (' + s.jenjang + ')' : ''}`,
    `Jenis   : ${z.jenis_izin || '-'}`,
    `Tanggal : ${tgl(z.tanggal_mulai)} s/d ${tgl(z.tanggal_selesai)}`,
    `Status  : ${z.status_persetujuan || 'Pending'}`,
    `Pemberi : ${z.pemberi_izin || '-'}`,
    '',
    `Alasan  : ${String(z.alasan || '-').split('\n')[0]}`,
    '',
    `_Dikirim otomatis oleh Sistem Informasi Pengembangan Santri pada ${new Date().toLocaleString('id-ID')}._`
  ];
  return baris.join('\n');
}

/** Kirim ke webhook; bila belum dikonfigurasi, buka tautan wa.me. */
async function waKirimIzin(z, btn) {
  const pesan = waPesanIzin(z);

  if (!WA.webhook) {
    const nomor = WA.nomorUji ? WA.nomorUji.replace(/\D/g, '') : '';
    const url = `https://wa.me/${nomor}?text=${encodeURIComponent(pesan)}`;
    window.open(url, '_blank', 'noopener');
    return toast('info', 'Webhook belum disetel — pesan dibuka di WhatsApp.');
  }

  const asli = btn ? mulaiSimpan(btn, 'Mengirim…') : null;
  try {
    const res = await fetch(WA.webhook, {
      method: 'POST',
      headers: WA.kunci
        ? { 'Content-Type':'application/json', 'x-rq-token': WA.kunci }
        : { 'Content-Type':'application/json' },
      body: JSON.stringify({
        tujuan: WA.grup,
        pesan,
        izin: {
          id_izin: z.id_izin, nisn: z.nisn,
          nama_siswa: z.siswa?.nama_siswa || '', kelas: z.siswa?.kelas || '',
          jenis_izin: z.jenis_izin, tanggal_mulai: kunciTgl(z.tanggal_mulai),
          tanggal_selesai: kunciTgl(z.tanggal_selesai),
          status_persetujuan: z.status_persetujuan, pemberi_izin: z.pemberi_izin
        }
      })
    });
    if (!res.ok) throw new Error(`Layanan WhatsApp membalas ${res.status}`);
    if (btn) selesaiSimpan(btn, asli, true, 'Terkirim');
    toast('success', 'Ajuan izin dikirim ke grup WhatsApp.');
  } catch (err) {
    if (btn) selesaiSimpan(btn, asli, false, 'Gagal mengirim');
    fireError(err);
  }
}

/** Dipanggil setelah izin baru tersimpan; diam-diam tidak memblokir alur. */
async function waKirimIzinTerbaru(nisn) {
  if (!WA.webhook && !WA.nomorUji) return;
  try {
    cacheHapus('izin');
    const semua = await muatIzin();
    const z = semua.find(x => String(x.nisn) === String(nisn));
    if (z) await waKirimIzin(z, null);
  } catch (e) { console.warn('[wa] gagal mengirim otomatis:', e.message); }
}

document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-wa]'); if (!b) return;
  e.preventDefault();
  try {
    const semua = await muatIzin();
    const z = semua.find(x => String(x.id_izin) === b.dataset.wa);
    if (!z) return toast('error', 'Data izin tidak ditemukan.');
    await waKirimIzin(z, b);
  } catch (err) { fireError(err); }
});

// ---------------------------------------------------------------------
// 27b. NOTIFIKASI WHATSAPP — PEMBERITAHUAN KEPADA WALI SANTRI
//
//      Tidak setiap tahap pembinaan pantas dikabarkan kepada rumah.
//      Yang dikabarkan hanyalah tahap yang menurut Master Pembinaan
//      memang MELIBATKAN orang tua — surat peringatan dan pemberitahuan
//      resmi — plus seluruh tahap kategori Berat, yang sejak tahap
//      pertama sudah berbunyi "Pemberitahuan Orang Tua".
//
//      Isi pesan menjawab tiga pertanyaan yang selalu ditanyakan wali
//      santri, berurutan: apa saja yang sudah terjadi (riwayat kategori
//      tersebut saja), apa yang dijalankan sekarang, dan apa yang akan
//      terjadi bila terulang lagi. Pertanyaan ketiga itulah yang
//      membuat pesan ini berfungsi sebagai pembinaan, bukan sekadar
//      laporan — orang tua tahu persis apa yang bisa dicegah.
//
//      Jalurnya wa.me, bukan webhook grup: ini percakapan pribadi
//      dengan satu keluarga, dan isinya tidak boleh masuk grup musyrif.
// ---------------------------------------------------------------------

/**
 * Tahap yang memicu tombol "Kabari Wali", per kategori.
 *   Ringan  ke-11  Pemberitahuan Orang tua dan Tanda tangan seluruh musyrif
 *   Ringan  ke-13  Surat Peringatan I dan Kosekuensi Bila Melanggar Lagi
 *   Sedang  ke-8   Surat Peringatan I dan Kosekuensi Bila Melanggar Lagi
 *   Sedang  ke-12  Pemberitahuan Orang tua dan Tanda tangan seluruh musyrif
 *   Berat   semua  seluruh tahapnya melibatkan orang tua
 *
 * Daftar nomor, bukan pencocokan teks: nama bentuk pembinaan di Master
 * bisa diperbaiki ejaannya kapan saja, sedangkan nomor tahap adalah
 * tulang punggung instrumen dan tidak berubah. Bila tangga instrumen
 * diubah, cukup angka di sinilah yang perlu ikut disesuaikan.
 */
const WA_TAHAP_WALI = { Ringan: [11, 13], Sedang: [8, 12], Berat: 'semua' };

/** Apakah satu baris pembinaan termasuk yang perlu dikabarkan ke rumah? */
function perluKabarWali(r) {
  const aturan = WA_TAHAP_WALI[String(r?.kategori_bina || '').trim()];
  if (!aturan) return false;
  const n = tahapBina(r);
  if (!n) return false;
  // Baris yang sudah melewati batas modul tetap dikabarkan bila kategorinya
  // Berat — justru di titik itulah rumah paling perlu tahu.
  if (aturan === 'semua') return true;
  return aturan.includes(n);
}

/** Nomor WhatsApp Indonesia yang siap dipakai pada tautan wa.me. */
function waNomorWali(s) {
  const angka = String(s?.no_hp_orang_tua || '').replace(/\D/g, '');
  if (angka.length < 8) return '';
  if (angka.startsWith('62')) return angka;
  if (angka.startsWith('0'))  return '62' + angka.slice(1);
  if (angka.startsWith('8'))  return '62' + angka;
  return angka;
}

/** Tangga pembinaan yang MASIH tersisa di atas tahap ke-n, terurut naik. */
function waTanggaLanjutan(instrumen, kategori, n, unit) {
  // v2.11.1: sejak v2.10 `instrumen` berbentuk { putra: Map, putri: Map }
  // (petaInstrumenUnit), bukan Map tunggal. Tangga diambil dari unit
  // santri yang dikabarkan — sama seperti bentukMenurutAturan().
  const ins = instrumenUntuk(instrumen, unit);
  const info = ins ? ins.get(String(kategori || '').trim()) : null;
  if (!info) return [];
  const sisa = [];
  info.bentuk.forEach((v, k) => { if (k > n) sisa.push({ ke: k, bentuk: v }); });
  return sisa.sort((a, b) => a.ke - b.ke);
}

/**
 * Susun pesan pemberitahuan. Riwayat sengaja dibatasi pada SATU kategori:
 * wali santri yang menerima surat peringatan kategori Sedang tidak perlu
 * dibebani daftar keterlambatan ringan — dan tahap ke-8 memang dihitung
 * dari kategori itu saja, jadi daftar campuran justru menyesatkan.
 */
async function waPesanWali(r, instrumen) {
  const peta = await petaSiswa();
  const s = peta[String(r.nisn)] || {};
  const nama     = r.nama_siswa || s.nama_siswa || '-';
  const kategori = String(r.kategori_bina || '-').trim();
  const n        = tahapBina(r) || 0;
  const batas    = r.batas || null;

  const rows = (await amanKosong(muatDetail, 'pelanggaran'))
    .filter(aktifDetail)
    .filter(p => String(p.nisn) === String(r.nisn) &&
                 String(p.kategori || '').trim() === kategori)
    .sort((a, b) => String(kunciTgl(a.tanggal)).localeCompare(String(kunciTgl(b.tanggal))));

  const MAKS = 15;
  const dipotong = Math.max(0, rows.length - MAKS);
  const daftar = rows.slice(dipotong).map((p, i) => {
    const bidang = String(p.bidang || '').trim();
    const poin = Number(p.bobot_pelanggaran) || 0;
    return `${dipotong + i + 1}. ${tgl(p.tanggal)} · `
         + `${String(p.nama_pelanggaran || p.kode_pelanggaran || '-').trim()}`
         + `${bidang ? ' (' + bidang + ')' : ''} · ${poin} poin`;
  });
  if (dipotong) daftar.unshift(`(${dipotong} catatan terdahulu tidak ditampilkan)`);

  const lanjut = r.overflow ? [] : waTanggaLanjutan(instrumen, kategori, n, unitBaris(r));
  const bagianLanjut = r.overflow
    ? ['Seluruh tahapan instrumen pembinaan kategori ini telah dijalani.',
       'Penanganan berikutnya ditetapkan melalui musyawarah pimpinan dayah',
       'bersama Bapak/Ibu wali santri.']
    : (lanjut.length
        ? lanjut.map(x => `Ke-${x.ke}: ${x.bentuk}`)
        : ['Tidak ada tahap lanjutan yang terdaftar pada instrumen kategori ini.']);

  const pengirim = `${APP.profil?.nama || '-'} (${role() || '-'})`;

  const baris = [
    '*PEMBERITAHUAN PEMBINAAN SANTRI*',
    'Dayah Ruhul Qurani',
    '',
    'Assalamualaikum warahmatullahi wabarakatuh.',
    `Kepada Bapak/Ibu wali dari ananda *${nama}*, kami sampaikan perkembangan pembinaan berikut.`,
    '',
    `Nama     : ${nama}`,
    `NISN     : ${r.nisn || '-'}`,
    `Kelas    : ${s.kelas || r.kelas || '-'}${s.jenjang ? ' (' + s.jenjang + ')' : ''}`,
    `Asrama   : ${s.asrama || '-'}`,
    `Kategori : ${kategori}`,
    `Tahap    : ke-${n}${batas ? ' dari ' + batas : ''}`,
    '',
    `*RIWAYAT PELANGGARAN KATEGORI ${kategori.toUpperCase()} — ${rows.length} CATATAN*`,
    ...(daftar.length ? daftar : ['(belum ada catatan yang tersimpan)']),
    '',
    '*PEMBINAAN YANG BERLAKU SAAT INI*',
    r.bentuk_final || bentukBina(r),
    '',
    '*BILA PELANGGARAN KATEGORI INI TERULANG*',
    ...bagianLanjut,
    '',
    // Penutupnya menyesuaikan keadaan: mengajak mencegah tahap berikutnya
    // hanya masuk akal selama masih ada tahap yang bisa dicegah.
    ...(r.overflow || !lanjut.length
      ? ['Kami mohon kesediaan Bapak/Ibu hadir mendampingi ananda',
         'dalam penanganan selanjutnya.']
      : ['Kami mohon kesediaan Bapak/Ibu mendampingi dan mengingatkan ananda,',
         'agar tahapan berikutnya tidak perlu dijalankan.']),
    '',
    `Pengirim : ${pengirim}`,
    `_Dikirim melalui Sistem Informasi Pengembangan Santri pada ${new Date().toLocaleString('id-ID')}._`
  ];
  return { pesan: baris.join('\n'), nomor: waNomorWali(s), nama };
}

/** Pratinjau dulu, baru buka WhatsApp — pesan ini tidak boleh salah kirim. */
async function waKabariWali(idPembinaan, btn) {
  // Penyusunan pesan memuat ulang riwayat penuh; tombol dikunci selama itu.
  // Penguncian dilepas SEBELUM dialog pratinjau terbuka, supaya penanda
  // sinkronisasi tidak terlihat "berjalan" selama musyrif membaca.
  const asli = btn ? mulaiSimpan(btn, 'Menyusun…') : null;
  let pesan, nomor, nama;
  try {
    const { penuh, instrumen } = await bahanBinaPenuh();
    const r = penuh.find(x => String(x.id_pembinaan) === String(idPembinaan));
    if (!r) { if (btn) selesaiSimpan(btn, asli, false, 'Data tidak ditemukan');
              return toast('error', 'Data pembinaan tidak ditemukan.'); }
    ({ pesan, nomor, nama } = await waPesanWali(r, instrumen));
    if (btn) selesaiSimpan(btn, asli, true, 'Pesan siap');
  } catch (err) {
    if (btn) selesaiSimpan(btn, asli, false);
    throw err;
  }

  const konf = await Swal.fire({
    width: 640,
    title: 'Kabari wali santri?',
    html: `<div style="text-align:left">
      <p style="margin:0 0 10px;font-size:13px;color:#475569">
        ${nomor
          ? `Pesan dikirim ke <b>+${esc(nomor)}</b> (wali ananda ${esc(nama)}).`
          : `Nomor wali ananda ${esc(nama)} belum terisi di data santri —
             WhatsApp akan membuka daftar kontak agar Anda memilih tujuannya sendiri.`}
      </p>
      <textarea readonly style="width:100%;height:280px;font-family:ui-monospace,Menlo,Consolas,monospace;
        font-size:11.5px;line-height:1.55;padding:11px;border:1px solid #cbd5e1;border-radius:9px;
        background:#f8fafc;color:#0f172a;resize:vertical">${esc(pesan)}</textarea>
      <p style="margin:9px 0 0;font-size:11.5px;color:#64748b">
        Isi pesan masih dapat Anda sunting di WhatsApp sebelum menekan kirim.</p>
    </div>`,
    showCancelButton: true,
    confirmButtonText: 'Buka WhatsApp',
    cancelButtonText: 'Batal',
    confirmButtonColor: '#128C7E'
  });
  if (!konf.isConfirmed) return;

  window.open(`https://wa.me/${nomor}?text=${encodeURIComponent(pesan)}`, '_blank', 'noopener');
  if (!nomor) toast('info', 'Nomor wali belum terisi — pilih kontak di WhatsApp.');
}

document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-wa-wali]'); if (!b) return;
  e.preventDefault();
  if (!bolehKabarWali()) return toast('error', 'Akun Anda tidak berwenang mengabari wali santri.');
  try { await waKabariWali(b.dataset.waWali, b); }
  catch (err) { fireError(err); }
});

// ---------------------------------------------------------------------
// 28. DASHBOARD GURU BK & PESAN TINDAK LANJUT
//
//     Guru BK memakai SELURUH isi Dashboard Pimpinan — kartu statistik,
//     analisis eksekutif, konsultan pendidikan, keenam grafik, serta
//     kedua kartu brankas beserta jendela onclick-nya — TANPA panel
//     "Aktivitas & Kinerja Guru". Sebagai penggantinya halaman ditutup
//     panel percakapan: 10 santri prioritas teratas, lengkap dengan
//     guru pembina kelasnya dan pesan siap kirim yang meminta guru
//     tersebut menyuruh ananda menemui Guru BK.
//
//     Satu tabel Supabase baru: pesan_bk (lihat SQL_PESAN_BK.sql).
//     Utas percakapan dikenali dari kolom `utas`:
//         <nisn>|<id peserta terkecil>|<id peserta terbesar>
//     sehingga balasan dua arah otomatis menempel pada utas yang sama
//     tanpa perlu tabel kedua.
// ---------------------------------------------------------------------
const PESAN_TABEL = 'pesan_bk';
const BK_TOP      = 10;                    // 10 santri prioritas teratas
const ROLE_PENERIMA = ['Guru','Walas','Guru BK','Ustadz GEN-Z','Admin'];

const stBk    = { santri: [], guru: [], utas: [] };
const stPesan = { rows: [], utas: [], aktif: null, filter: 'Semua', cari: '' };

/** Dashboard Guru BK = dashboard pimpinan tanpa panel kinerja guru. */
async function viewBk() { await viewPimpinan({ bk: true }); }

const idSaya = () => APP.profil?.id || '';

/** Kunci utas: santri + pasangan peserta (urut, agar dua arah menyatu). */
function kunciUtas(nisn, a, b) {
  return [String(nisn || '-'), ...[String(a), String(b)].sort()].join('|');
}

function waktuPesan(iso) {
  const d = new Date(iso); if (isNaN(d)) return '-';
  const jam = d.toLocaleTimeString('id-ID', { hour:'2-digit', minute:'2-digit' });
  if (d.toDateString() === new Date().toDateString()) return jam;
  return `${d.toLocaleDateString('id-ID', { day:'2-digit', month:'short' })} ${jam}`;
}

/** Daftar guru aktif (dipakai sebagai calon penerima pesan). */
async function muatGuruAktif() {
  const c = cacheGet('guru_aktif'); if (c) return c;
  const { data } = await q(db.from('profiles')
    .select('id,nama,role,kelas_binaan,aktif')
    .eq('aktif', true).order('nama'), 'profiles_guru');
  return cacheSet('guru_aktif', data || []);
}

/** Guru yang kelas binaannya memuat kelas santri — calon penerima utama. */
function guruPembina(list, kelas) {
  const k = String(kelas || '').trim(); if (!k) return [];
  return list.filter(g => ROLE_PENERIMA.includes(g.role) && g.id !== idSaya()
    && (g.kelas_binaan || []).includes(k));
}

/** Naskah bawaan: inti pesan = minta guru menyuruh ananda menemui BK. */
function templatePesanBk(s) {
  const saya  = APP.profil?.nama || 'Guru BK';
  const butir = [];
  if (s.berat)   butir.push(`${s.berat} pelanggaran kategori Berat`);
  if (s.kasus30) butir.push(`${s.kasus30} kasus dalam 30 hari terakhir`);
  if (s.telat)   butir.push(`${s.telat} kali telat balik izin`);
  if (s.bina)    butir.push(`${s.bina} pembinaan masih berjalan`);
  const ringkas = butir.length ? butir.join(', ') : (s.alasan || 'perlu observasi berkala');

  return `Assalamu'alaikum warahmatullahi wabarakatuh.

Mohon bantuan Ustadz/Ustadzah selaku pembina kelas ${s.kelas || '-'}.

Ananda ${s.nama} (NISN ${s.nisn}) termasuk santri yang membutuhkan perhatian khusus: ${ringkas} — tercatat ${s.kasus90} pelanggaran / ${s.poin90} poin dalam 90 hari terakhir (tier ${s.tier}).

Mohon ananda disampaikan agar MENEMUI GURU BK di ruang BK pada waktu istirahat atau jam lain yang memungkinkan, untuk pendampingan lanjutan. Setelah disampaikan, mohon utas ini ditandai "Sudah diantar ke BK".

Jazakumullahu khairan katsiran.
— ${saya} (Guru BK)`;
}

// ---------- 28a. Lapisan data pesan ----------------------------------

async function muatPesanSaya() {
  const uid = idSaya(); if (!uid) return [];
  const { data } = await q(db.from(PESAN_TABEL).select('*')
    .or(`pengirim_id.eq.${uid},penerima_id.eq.${uid}`)
    .order('created_at', { ascending: true }).limit(3000), 'pesan_bk');
  return data || [];
}

/** Baris datar -> utas percakapan, terbaru di atas. */
function kelompokUtas(rows) {
  const uid = idSaya(), peta = {};
  rows.forEach(r => {
    const k = r.utas || kunciUtas(r.nisn, r.pengirim_id, r.penerima_id);
    if (!peta[k]) peta[k] = { utas:k, nisn:r.nisn, nama_santri:r.nama_santri,
      kelas:r.kelas, tier:r.tier, pesan:[], belum:0, selesai:false,
      jenis: r.jenis || 'bk', id_pembinaan: r.id_pembinaan || null };
    const u = peta[k];
    u.pesan.push(r);
    if (r.penerima_id === uid && !r.dibaca_pada) u.belum++;
    if (r.status === 'Selesai') u.selesai = true;
    if (r.nama_santri && !u.nama_santri) u.nama_santri = r.nama_santri;
    if (r.jenis === 'pembinaan') { u.jenis = 'pembinaan'; u.id_pembinaan = u.id_pembinaan || r.id_pembinaan; }
  });
  return Object.values(peta).map(u => {
    const akhir = u.pesan[u.pesan.length - 1];
    u.terakhir = akhir;
    u.waktu    = akhir.created_at;
    u.saya     = akhir.pengirim_id === uid;
    u.lawan    = akhir.pengirim_id === uid
      ? { id:akhir.penerima_id, nama:akhir.penerima_nama, role:akhir.penerima_role }
      : { id:akhir.pengirim_id, nama:akhir.pengirim_nama, role:akhir.pengirim_role };
    // Utas laporan pembinaan bisa dibuka lagi bila guru membatalkan
    // pengesahan — statusnya mengikuti baris terbaru, bukan "pernah selesai".
    if (u.jenis === 'pembinaan') u.selesai = akhir.status === 'Selesai';
    u.status   = u.selesai ? 'Selesai' : (u.belum ? 'Baru' : 'Berjalan');
    return u;
  }).sort((a, b) => String(b.waktu).localeCompare(String(a.waktu)));
}

async function sisipkanPesan(rows) {
  const { error } = await db.from(PESAN_TABEL).insert(rows);
  if (error) throw error;
  cacheHapus('pesan_bk');
}

async function tandaiDibaca(utas) {
  // Baris yang sudah "Selesai" (utas BK yang diantar, laporan pembinaan
  // yang disahkan) hanya dicap waktu bacanya — statusnya tidak boleh
  // turun kembali menjadi "Dibaca", atau utas tampak terbuka lagi.
  const kini = new Date().toISOString();
  await db.from(PESAN_TABEL)
    .update({ dibaca_pada: kini, status: 'Dibaca' })
    .eq('utas', utas).eq('penerima_id', idSaya()).is('dibaca_pada', null).neq('status', 'Selesai');
  await db.from(PESAN_TABEL)
    .update({ dibaca_pada: kini })
    .eq('utas', utas).eq('penerima_id', idSaya()).is('dibaca_pada', null);
}

async function tandaiUtasSelesai(utas) {
  const { error } = await db.from(PESAN_TABEL)
    .update({ status: 'Selesai' }).eq('utas', utas);
  if (error) throw error;
}

async function refreshBadgePesan() {
  const b = $('badgePesan'); if (!b || !APP.profil) return;
  if (!bisa('pesan.lihat')) return b.classList.add('hidden');
  try {
    const { count } = await db.from(PESAN_TABEL)
      .select('id', { count:'exact', head:true })
      .eq('penerima_id', idSaya()).is('dibaca_pada', null);
    b.textContent = count > 99 ? '99+' : String(count || 0);
    b.classList.toggle('hidden', !count);
    b.title = count ? `${count} pesan belum dibaca` : '';
  } catch (e) { b.classList.add('hidden'); }
}

// ---------- 28b. Panel tindak lanjut di Dashboard Guru BK ------------

/** Menempel sendiri ke #viewRoot pada akhir viewPimpinan({bk:true}). */
async function panelPesanBk() {
  const root = $('viewRoot'); if (!root) return;
  if (!$('bkPesanWrap')) root.insertAdjacentHTML('beforeend', '<div id="bkPesanWrap"></div>');
  await muatPanelPesanBk();
}

async function muatPanelPesanBk() {
  const wrap = $('bkPesanWrap'); if (!wrap) return;
  wrap.innerHTML = `<section class="card"><div class="card-body"
    style="text-align:center;color:var(--text-3);padding:34px">
    <i class="fa-solid fa-circle-notch fa-spin"></i> Menyiapkan daftar tindak lanjut…
  </div></section>`;
  try {
    stBk.santri = PIM.prio.slice(0, BK_TOP);
    stBk.guru   = await muatGuruAktif();
    stBk.utas   = kelompokUtas(await muatPesanSaya());
    gambarPanelPesanBk();
  } catch (err) {
    console.error('[pesan bk]', err);
    wrap.innerHTML = kartu('Pesan Tindak Lanjut ke Guru', `
      <div class="card-note"><i class="fa-solid fa-triangle-exclamation"></i>
        Daftar tindak lanjut tidak dapat dimuat: <b>${esc(err?.message || String(err))}</b></div>
      <div class="card-body"><p style="margin:0;font-size:12.5px;color:var(--text-2)">
        Pastikan berkas <b>SQL_PESAN_BK.sql</b> sudah dijalankan di Supabase
        (tabel <b>pesan_bk</b> beserta kebijakan RLS-nya).</p></div>`);
  }
}

/** Utas terakhir untuk seorang santri — dipakai menandai status baris. */
function utasSantri(nisn) {
  return stBk.utas.filter(u => String(u.nisn) === String(nisn))[0] || null;
}

function gambarPanelPesanBk() {
  const wrap = $('bkPesanWrap'); if (!wrap) return;
  const tierTag = (t) => t === 'Kritis' ? 'tag-berat' : t === 'Perhatian Tinggi' ? 'tag-sedang'
    : t === 'Monitor' ? 'tag-sea' : 'tag-off';

  const belumTotal = stBk.utas.reduce((a, u) => a + u.belum, 0);
  const terkirim   = stBk.santri.filter(s => utasSantri(s.nisn)).length;

  const baris = stBk.santri.map((s, i) => {
    const pembina = guruPembina(stBk.guru, s.kelas);
    const u = utasSantri(s.nisn);
    const statusTag = !u ? `<span class="tag tag-off">Belum dikirim</span>`
      : u.selesai ? `<span class="tag tag-ok">Sudah diantar</span>`
      : u.belum   ? `<span class="tag tag-wait">${u.belum} balasan baru</span>`
      : `<span class="tag tag-sea">Terkirim</span>`;
    return `<tr>
      <td class="center"><span class="bkp-no">${String(i + 1).padStart(2, '0')}</span></td>
      <td style="min-width:180px">
        <button class="btn-link" data-detail="${esc(s.nisn)}"
                style="font-weight:600;font-size:13.5px">${esc(s.nama)}</button>
        <div class="secondary">${esc(s.nisn)} · ${esc(s.kelas || '-')}</div></td>
      <td><span class="tag ${tierTag(s.tier)}">${esc(s.tier)}</span></td>
      <td class="num center">${s.kasus90}</td>
      <td class="num center">${s.poin90}</td>
      <td style="min-width:190px;font-size:12.5px;color:var(--text-2)">${esc(s.alasan)}</td>
      <td style="min-width:160px">${pembina.length
        ? pembina.slice(0, 3).map(g => `<span class="tag tag-off">${esc(g.nama)}</span>`).join(' ')
          + (pembina.length > 3 ? ` <span class="tag tag-off">+${pembina.length - 3}</span>` : '')
        : `<span class="tag tag-wait">Belum ada pembina kelas</span>`}</td>
      <td class="center">${statusTag}</td>
      <td class="right nowrap">
        <button class="btn btn-primary btn-sm" data-bk-kirim="${esc(s.nisn)}">
          <i class="fa-solid fa-paper-plane"></i>${u ? 'Kirim lagi' : 'Kirim pesan'}</button>
        ${u ? `<button class="btn btn-ghost btn-sm" data-bk-utas="${esc(u.utas)}"
          style="margin-left:6px"><i class="fa-solid fa-comments"></i>Utas</button>` : ''}
      </td></tr>`;
  }).join('');

  wrap.innerHTML = kartu('Pesan Tindak Lanjut ke Guru', `
    <div class="card-note"><i class="fa-solid fa-circle-info"></i>
      Sepuluh santri prioritas teratas pada periode <b>${esc(PIM.rentang || '90 hari terakhir')}</b>.
      Pesan bawaan meminta guru pembina kelas menyuruh ananda <b>menemui Guru BK</b>;
      naskahnya masih bisa disunting sebelum dikirim.</div>
    <div class="minis">
      <div class="mini m"><span>Santri prioritas</span><b>${angka(stBk.santri.length)}</b></div>
      <div class="mini s"><span>Sudah dikirimi</span><b>${angka(terkirim)}</b></div>
      <div class="mini a"><span>Balasan baru</span><b>${angka(belumTotal)}</b></div>
      <div class="mini t"><span>Utas berjalan</span><b>${angka(stBk.utas.length)}</b></div>
    </div>
    <div class="tbl" style="margin-top:14px"><table class="bkp-tbl">
      <thead><tr><th class="center">#</th><th>Santri</th><th>Tier</th>
        <th class="center">Kasus 90h</th><th class="center">Poin</th><th>Alasan</th>
        <th>Guru Pembina Kelas</th><th class="center">Status</th>
        <th class="right">Tindakan</th></tr></thead>
      <tbody>${baris || barisKosong(9, 'Belum ada santri pada indikator prioritas.',
        'Panel ini terisi setelah ada catatan pelanggaran pada periode analisis.')}</tbody>
    </table></div>
    <div class="scroll-hint"><i class="fa-solid fa-arrows-left-right"></i>Geser ke samping untuk kolom lainnya.</div>`,
    `<button class="btn btn-ghost btn-sm" id="bkKeInbox">
      <i class="fa-solid fa-inbox"></i>Buka semua percakapan</button>`,
    'Khusus Guru BK · tidak tampil pada dashboard pimpinan');

  $('bkKeInbox')?.addEventListener('click', () => navigateTo('pesan'));
  tandaiTabelBisaGeser();
}

// ---------- 28c. Jendela kirim pesan ---------------------------------

async function modalPesanBk(nisn) {
  const s = PIM.prio.find(x => String(x.nisn) === String(nisn));
  if (!s) return toast('error', 'Data santri prioritas tidak ditemukan.');

  const semua   = stBk.guru.length ? stBk.guru : await muatGuruAktif();
  const pembina = guruPembina(semua, s.kelas);
  const lain    = semua.filter(g => ROLE_PENERIMA.includes(g.role)
    && g.id !== idSaya() && !pembina.some(p => p.id === g.id));

  const opsi = (arr, label) => arr.length ? `<optgroup label="${esc(label)}">${arr.map(g =>
    `<option value="${esc(g.id)}">${esc(g.nama)} — ${esc(g.role)}${
      (g.kelas_binaan || []).length ? ' · ' + esc((g.kelas_binaan || []).join(', ')) : ''}</option>`
    ).join('')}</optgroup>` : '';

  if (!pembina.length && !lain.length)
    return toast('error', 'Belum ada guru aktif yang bisa dijadikan penerima.');

  const res = await Swal.fire({
    title: 'Kirim Pesan ke Guru', width: 660,
    showCancelButton: true, confirmButtonText: 'Kirim', cancelButtonText: 'Batal',
    confirmButtonColor: '#14618B', showLoaderOnConfirm: true,
    allowOutsideClick: () => !Swal.isLoading(),
    html: `<div class="stack">
      <div class="pgs-pick on">
        <div class="ico"><i class="fa-solid fa-user-graduate"></i></div>
        <div><small>Santri</small><b>${esc(s.nama)}</b>
          <div class="secondary">${esc(s.nisn)} · ${esc(s.kelas || '-')} · Tier ${esc(s.tier)}
            · ${s.kasus90} kasus / ${s.poin90} poin</div></div>
      </div>
      <div class="field"><label class="label">Guru Penerima</label>
        <select id="pbGuru" class="input">
          ${opsi(pembina, `Pembina kelas ${s.kelas || '-'}`)}
          ${opsi(lain, 'Guru lain')}
        </select>
        <p class="hint">${pembina.length
          ? `Terisi otomatis dengan pembina kelas ${esc(s.kelas || '-')} — boleh diganti.`
          : `Kelas ${esc(s.kelas || '-')} belum punya guru pembina terdaftar; pilih guru secara manual.`}</p>
      </div>
      ${pembina.length > 1 ? `<label class="ctx-note" style="cursor:pointer">
        <input type="checkbox" id="pbSemua" style="accent-color:var(--sea)">
        Kirim sekaligus ke semua pembina kelas ${esc(s.kelas || '-')} (${pembina.length} guru)
      </label>` : ''}
      <div class="field"><label class="label">Isi Pesan</label>
        <textarea id="pbIsi" class="input" rows="11">${esc(templatePesanBk(s))}</textarea>
        <p class="hint">Inti pesan: guru diminta menyuruh ananda menemui Guru BK.</p>
      </div>
    </div>`,
    didOpen: () => { if (pembina.length) $('pbGuru').value = pembina[0].id; },
    preConfirm: async () => {
      const isi = $('pbIsi').value.trim();
      if (isi.length < 10) { Swal.showValidationMessage('Isi pesan terlalu pendek.'); return false; }
      const semuaPembina = $('pbSemua')?.checked;
      const ids = semuaPembina ? pembina.map(g => g.id) : [$('pbGuru').value];
      if (!ids.filter(Boolean).length) { Swal.showValidationMessage('Penerima belum dipilih.'); return false; }
      const p = APP.profil;
      const rows = ids.map(id => {
        const g = semua.find(x => x.id === id) || {};
        return {
          utas: kunciUtas(s.nisn, p.id, id),
          nisn: String(s.nisn), nama_santri: s.nama, kelas: s.kelas || null, tier: s.tier || null,
          pengirim_id: p.id, pengirim_nama: p.nama, pengirim_role: p.role,
          penerima_id: id, penerima_nama: g.nama || '-', penerima_role: g.role || '-',
          isi, status: 'Terkirim'
        };
      });
      try { await sisipkanPesan(rows); return rows.length; }
      catch (e) { Swal.showValidationMessage(e.message || 'Gagal mengirim pesan.'); return false; }
    }
  });

  if (res.isConfirmed) {
    sync('done', 'Pesan terkirim');
    toast('success', `Pesan terkirim ke ${res.value} guru`);
    await muatPanelPesanBk();
  }
}

// ---------- 28d. Halaman percakapan (dua arah) -----------------------

async function viewPesan() {
  $('viewRoot').innerHTML = kartu('Pesan Tindak Lanjut', `
    <div class="card-note"><i class="fa-solid fa-circle-info"></i>
      Dua jenis percakapan: <b>pesan Guru BK</b> tentang santri yang membutuhkan perhatian
      khusus (tandai <b>“Sudah diantar ke BK”</b>), dan <b>laporan pembinaan Ustadz GEN-Z</b>
      yang menunggu <b>pengesahan guru kelas binaan</b>.</div>
    <div class="msg">
      <aside class="msg-side">
        <div class="msg-bar">
          <input id="msgCari" class="input" placeholder="Cari santri atau guru…"
                 value="${esc(stPesan.cari)}">
        </div>
        <div class="msg-chips" id="msgChips">
          ${['Semua','Belum dibaca','Pengesahan','Berjalan','Selesai'].map(f =>
            `<button class="chip${stPesan.filter === f ? ' on' : ''}" data-f="${f}">${f}</button>`).join('')}
        </div>
        <div id="msgMassal"></div>
        <div class="msg-list" id="msgList"></div>
      </aside>
      <section class="msg-panel" id="msgPanel"></section>
    </div>`,
    bisa('pesan.mulai')
      ? `<button class="btn btn-ghost btn-sm" id="msgKeBk">
           <i class="fa-solid fa-user-shield"></i>Daftar santri prioritas</button>` : '',
    'Balasan dua arah · realtime');

  $('msgKeBk')?.addEventListener('click', () => navigateTo('bk'));
  $('msgCari').addEventListener('input', debounce(e => {
    stPesan.cari = e.target.value.trim(); gambarDaftarUtas();
  }, 220));
  $('msgChips').addEventListener('click', (e) => {
    const c = e.target.closest('[data-f]'); if (!c) return;
    stPesan.filter = c.dataset.f;
    $('msgChips').querySelectorAll('.chip').forEach(x => x.classList.toggle('on', x === c));
    gambarDaftarUtas();
  });

  onKlik(async (e) => {
    const u = e.target.closest('[data-utas]');
    if (u) return bukaUtas(u.dataset.utas);
    const d = e.target.closest('[data-detail]');
    if (d) return bukaDetailSantri(d.dataset.detail);
    if (e.target.closest('#msgKirim'))  return kirimBalasan();
    if (e.target.closest('#msgSelesai')) return selesaikanUtas();
    if (e.target.closest('#msgSahkan')) return sahkanUtas();
    if (e.target.closest('#msgSahkanSemua')) return sahkanSemuaUtas();
    const kb = e.target.closest('[data-ke-bina]');
    if (kb) { stBina.cari = kb.dataset.keBina; stBina.status = ''; stBina.page = 1; return navigateTo('pembinaan'); }
  });

  await muatViewPesan();
}

async function muatViewPesan() {
  const list = $('msgList'); if (!list) return;
  list.innerHTML = `<div class="msg-kosong"><i class="fa-solid fa-circle-notch fa-spin"></i>
    Memuat percakapan…</div>`;
  try {
    stPesan.rows = await muatPesanSaya();
    stPesan.utas = kelompokUtas(stPesan.rows);
    if (stPesan.aktif && !stPesan.utas.some(u => u.utas === stPesan.aktif)) stPesan.aktif = null;
    gambarDaftarUtas();
    if (stPesan.aktif) {
      gambarUtas();
      const u = stPesan.utas.find(x => x.utas === stPesan.aktif);
      if (u?.belum) {
        try { await tandaiDibaca(u.utas); refreshBadgePesan(); } catch (e) { console.warn('[pesan]', e); }
      }
    } else gambarUtasKosong();
    $('queryTime').textContent = `pesan · ${angka(stPesan.rows.length)} baris`;
  } catch (err) {
    list.innerHTML = `<div class="msg-kosong">Gagal memuat: ${esc(err?.message || String(err))}</div>`;
  }
}

function saringUtas() {
  let rows = stPesan.utas;
  if (stPesan.filter === 'Belum dibaca') rows = rows.filter(u => u.belum > 0);
  if (stPesan.filter === 'Pengesahan')   rows = rows.filter(u => u.jenis === 'pembinaan' && !u.selesai);
  if (stPesan.filter === 'Berjalan')     rows = rows.filter(u => !u.selesai);
  if (stPesan.filter === 'Selesai')      rows = rows.filter(u => u.selesai);
  const k = stPesan.cari.toLowerCase();
  if (k) rows = rows.filter(u =>
    [u.nama_santri, u.nisn, u.kelas, u.lawan?.nama, u.terakhir?.isi, u.id_pembinaan]
      .some(v => String(v || '').toLowerCase().includes(k)));
  return rows;
}

function gambarDaftarUtas() {
  const list = $('msgList'); if (!list) return;
  const rows = saringUtas();
  const massal = $('msgMassal');
  if (massal) {
    const n = utasMenungguSaya().length;
    massal.innerHTML = n ? `<button class="btn btn-sah btn-sm msg-massal" id="msgSahkanSemua">
      <i class="fa-solid fa-file-signature"></i>Sahkan semua laporan (${angka(n)})</button>` : '';
  }
  list.innerHTML = rows.map(u => `
    <button class="msg-item${u.utas === stPesan.aktif ? ' on' : ''}${u.belum ? ' baru' : ''}${
      u.jenis === 'pembinaan' ? ' bina' : ''}"
            data-utas="${esc(u.utas)}">
      <span class="msg-av">${u.jenis === 'pembinaan'
        ? '<i class="fa-solid fa-hands-holding-child"></i>'
        : esc(getInitialsFromName(u.nama_santri || u.lawan?.nama || '?'))}</span>
      <span class="msg-body">
        <span class="msg-top">
          <b>${esc(u.nama_santri || '(tanpa santri)')}</b>
          <small>${esc(waktuPesan(u.waktu))}</small>
        </span>
        <span class="msg-who"><i class="fa-solid fa-user-tie"></i>
          ${esc(u.lawan?.nama || '-')} · ${esc(u.lawan?.role || '-')}${
            u.kelas ? ' · ' + esc(u.kelas) : ''}</span>
        <span class="msg-prev">${esc(String(u.terakhir?.isi || '').replace(/\s+/g, ' ').slice(0, 76))}…</span>
        <span class="msg-tags">
          ${u.jenis === 'pembinaan'
            ? (u.selesai ? '<span class="tag tag-ok">Disahkan</span>'
               : '<span class="tag tag-sah">Menunggu pengesahan</span>')
              + (u.belum ? ` <span class="tag tag-wait">${u.belum} baru</span>` : '')
            : u.selesai ? '<span class="tag tag-ok">Sudah diantar</span>'
            : u.belum ? `<span class="tag tag-wait">${u.belum} baru</span>`
            : '<span class="tag tag-sea">Berjalan</span>'}
          ${u.tier ? `<span class="tag tag-off">${esc(u.tier)}</span>` : ''}
        </span>
      </span>
    </button>`).join('') ||
    `<div class="msg-kosong"><i class="fa-regular fa-comments"></i>
      <p>Belum ada percakapan pada saringan ini.</p></div>`;
}

function gambarUtasKosong() {
  const p = $('msgPanel'); if (!p) return;
  p.innerHTML = `<div class="msg-kosong tengah">
    <i class="fa-regular fa-comments"></i>
    <p>Pilih satu percakapan di sebelah kiri.</p>
    <small>${bisa('pesan.mulai')
      ? 'Percakapan baru dimulai dari Dashboard Guru BK → panel Pesan Tindak Lanjut.'
      : bolehLaporBina()
      ? 'Laporan pembinaan dikirim dari menu Log Pembinaan → tombol “Laporkan ke Guru”.'
      : 'Pesan Guru BK dan laporan pembinaan Ustadz GEN-Z akan muncul di sini.'}</small></div>`;
}

async function bukaUtas(k) {
  stPesan.aktif = k;
  gambarDaftarUtas();
  gambarUtas();
  const u = stPesan.utas.find(x => x.utas === k);
  if (u?.belum) {
    try {
      await tandaiDibaca(k); refreshBadgePesan();
      u.belum = 0; gambarDaftarUtas();       // tanda "baru" langsung padam
    } catch (e) { console.warn('[pesan]', e); }
  }
}

function gambarUtas() {
  const p = $('msgPanel'); if (!p) return;
  const u = stPesan.utas.find(x => x.utas === stPesan.aktif);
  if (!u) return gambarUtasKosong();
  const uid = idSaya();

  p.innerHTML = `
    <header class="msg-head">
      <div>
        <b>${esc(u.nama_santri || '(tanpa santri)')}</b>
        <span>${u.nisn ? esc(u.nisn) + ' · ' : ''}${esc(u.kelas || '-')}${
          u.tier ? (u.jenis === 'pembinaan' ? ' · ' : ' · Tier ') + esc(u.tier) : ''}${
          u.jenis === 'pembinaan' ? ' · <i class="fa-solid fa-hands-holding-child"></i> Laporan pembinaan' : ''}</span>
      </div>
      <div class="msg-acts">
        ${u.nisn ? `<button class="btn btn-ghost btn-sm" data-detail="${esc(u.nisn)}">
          <i class="fa-solid fa-eye"></i>Profil santri</button>` : ''}
        ${u.jenis === 'pembinaan' ? `
          <button class="btn btn-ghost btn-sm" data-ke-bina="${esc(u.id_pembinaan || '')}">
            <i class="fa-solid fa-list-check"></i>Lihat di Log</button>
          ${u.selesai
            ? `<button class="btn btn-ghost btn-sm" disabled><i class="fa-solid fa-signature"></i>Disahkan</button>`
            : bolehPembinaan()
            ? `<button class="btn btn-sah btn-sm" id="msgSahkan"><i class="fa-solid fa-file-signature"></i>Sahkan Selesai</button>`
            : `<span class="tag tag-sah"><i class="fa-solid fa-hourglass-half"></i>Menunggu pengesahan guru</span>`}`
        : `<button class="btn ${u.selesai ? 'btn-ghost' : 'btn-ok'} btn-sm" id="msgSelesai"
                ${u.selesai ? 'disabled' : ''}>
          <i class="fa-solid fa-circle-check"></i>${u.selesai ? 'Sudah diantar' : 'Tandai sudah diantar ke BK'}</button>`}
      </div>
    </header>
    <div class="msg-thread" id="msgThread">
      ${u.pesan.map(r => `<article class="bub ${r.pengirim_id === uid ? 'saya' : 'dia'}">
        <div class="bub-who">${esc(r.pengirim_nama)} · ${esc(r.pengirim_role)}</div>
        <div class="bub-isi">${esc(r.isi).replace(/\n/g, '<br>')}</div>
        <div class="bub-kaki">${esc(waktuPesan(r.created_at))}${
          r.pengirim_id === uid ? (r.dibaca_pada ? ' · dibaca' : ' · terkirim') : ''}</div>
      </article>`).join('')}
    </div>
    <div class="msg-tulis">
      <textarea id="msgIsi" class="input" rows="2"
        placeholder="Tulis balasan untuk ${esc(u.lawan?.nama || 'guru')}…"></textarea>
      <button class="btn btn-primary" id="msgKirim"><i class="fa-solid fa-paper-plane"></i>Kirim</button>
    </div>`;

  const t = $('msgThread'); if (t) t.scrollTop = t.scrollHeight;
  $('msgIsi')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); kirimBalasan(); }
  });
}

async function kirimBalasan() {
  const u = stPesan.utas.find(x => x.utas === stPesan.aktif); if (!u) return;
  const box = $('msgIsi'); const isi = box?.value.trim();
  if (!isi) return toast('info', 'Isi balasan masih kosong.');
  const btn = $('msgKirim'); const asli = mulaiSimpan(btn, 'Mengirim…');
  try {
    const p = APP.profil;
    await sisipkanPesan([{
      utas: u.utas, nisn: u.nisn, nama_santri: u.nama_santri, kelas: u.kelas, tier: u.tier,
      jenis: u.jenis || 'bk', id_pembinaan: u.jenis === 'pembinaan' ? u.id_pembinaan : null,
      // Balasan pada utas yang sudah disahkan ikut berstatus Selesai agar
      // utas tidak tampak "terbuka" lagi hanya karena ucapan terima kasih.
      pengirim_id: p.id, pengirim_nama: p.nama, pengirim_role: p.role,
      penerima_id: u.lawan.id, penerima_nama: u.lawan.nama, penerima_role: u.lawan.role,
      isi, status: u.jenis === 'pembinaan' && u.selesai ? 'Selesai' : 'Terkirim'
    }]);
    box.value = '';
    selesaiSimpan(btn, asli, true, 'Balasan terkirim');
    await muatViewPesan();
  } catch (err) {
    selesaiSimpan(btn, asli, false, 'Gagal mengirim');
    fireError(err);
  }
}

async function selesaikanUtas() {
  const u = stPesan.utas.find(x => x.utas === stPesan.aktif); if (!u || u.selesai) return;
  const btn = $('msgSelesai'); const asli = mulaiSimpan(btn, 'Menyimpan…');
  try {
    await tandaiUtasSelesai(u.utas);
    selesaiSimpan(btn, asli, true, 'Ditandai selesai');
    toast('success', 'Utas ditandai: ananda sudah diantar ke BK');
    await muatViewPesan();
  } catch (err) {
    selesaiSimpan(btn, asli, false, 'Gagal menyimpan');
    fireError(err);
  }
}

// Tombol pada panel dashboard BK — satu listener global agar tetap
// bekerja walau panel dirender ulang oleh realtime.
document.addEventListener('click', (e) => {
  const kirim = e.target.closest('[data-bk-kirim]');
  if (kirim) { e.preventDefault(); return modalPesanBk(kirim.dataset.bkKirim); }
  const utas = e.target.closest('[data-bk-utas]');
  if (utas) {
    e.preventDefault();
    stPesan.aktif = utas.dataset.bkUtas;
    return navigateTo('pesan');
  }
});




// ---------- 28e. LAPORAN PEMBINAAN USTADZ GEN-Z → PENGESAHAN GURU (v2.12)
//
//     Ustadz GEN-Z adalah perpanjangan tangan musyrif asrama: ia
//     MELAKSANAKAN pembinaan dan MELAPORKANNYA. Legalitas pembinaan —
//     status "Selesai" — tetap berada pada guru yang kelas binaannya
//     memuat kelas santri (serta Admin).
//
//     Alurnya memakai tabel pesan_bk yang sama dengan pesan Guru BK,
//     dibedakan kolom `jenis = 'pembinaan'` dan `id_pembinaan`.
//     Satu pembinaan = satu utas per guru penerima, dengan kunci
//         bina:<id_pembinaan>|<id peserta terkecil>|<id peserta terbesar>
//     sehingga guru mengesahkan tiap pembinaan secara terpisah.
//
//     Pengesahan tidak ditulis app.js ke pesan_bk. Guru cukup memanggil
//     ubah_status_pembinaan(); trigger trg_pbn_tutup_laporan di database
//     yang menutup utas dan mengirim konfirmasi kepada pelapor. Dengan
//     begitu, jalur mana pun yang menyelesaikan pembinaan (halaman Log,
//     halaman Pesan, atau Admin) meninggalkan jejak yang sama.
//
//     Batas keamanan yang sesungguhnya ada di database —
//     boleh_sahkan_pembinaan(): Admin, atau Guru yang kelas binaannya
//     memuat kelas santri. Lihat migrasi 20260911_v2_12_…sql.
// ---------------------------------------------------------------------
const ROLE_PENGESAH = ['Guru'];

function kunciUtasBina(idPembinaan, a, b) {
  return `bina:${String(idPembinaan)}|` + [String(a), String(b)].sort().join('|');
}

/** Guru yang sah mengesahkan: role Guru + kelas binaan memuat kelas santri. */
function guruPengesah(list, kelas) {
  const k = String(kelas || '').trim(); if (!k) return [];
  return (list || []).filter(g => ROLE_PENGESAH.includes(g.role) && g.id !== idSaya()
    && (g.kelas_binaan || []).includes(k));
}

/**
 * Peta laporan pembinaan: Map(id_pembinaan -> { utas[], pelapor,
 * penerima[], tglLaksana, dikirim }). RLS membatasi baris pada utas
 * milik pengguna sendiri; Admin & Pimpinan melihat seluruhnya.
 */
async function petaLaporanBina() {
  if (!bisa('pesan.lihat')) return new Map();
  const c = cacheGet('laporan_bina'); if (c) return c;
  let data = [];
  try {
    const res = await db.from(PESAN_TABEL)
      .select('utas,id_pembinaan,pengirim_id,pengirim_nama,penerima_id,penerima_nama,dilaksanakan_pada,status,created_at')
      .eq('jenis', 'pembinaan').not('id_pembinaan', 'is', null)
      .order('created_at', { ascending: true }).limit(5000);
    if (res.error) throw res.error;
    data = res.data || [];
  } catch (e) {
    console.warn('[laporan pembinaan]', e?.message || e);
    return new Map();          // jangan dicache: coba lagi pada render berikutnya
  }
  // Pesan PERTAMA tiap utas adalah laporan aslinya; sisanya balasan.
  const pertama = new Map();
  data.forEach(r => { if (!pertama.has(r.utas)) pertama.set(r.utas, r); });
  const peta = new Map();
  pertama.forEach(r => {
    const id = String(r.id_pembinaan);
    if (!peta.has(id)) peta.set(id, { utas: [], pelapor: r.pengirim_nama || '-',
      pelapor_id: r.pengirim_id, penerima: [], penerima_id: [],
      tglLaksana: r.dilaksanakan_pada, dikirim: r.created_at });
    const L = peta.get(id);
    // Utas milik pengguna sendiri didahulukan agar tombol "Utas" membuka miliknya.
    (r.penerima_id === idSaya() || r.pengirim_id === idSaya()) ? L.utas.unshift(r.utas) : L.utas.push(r.utas);
    if (!L.penerima.includes(r.penerima_nama)) { L.penerima.push(r.penerima_nama); L.penerima_id.push(r.penerima_id); }
  });
  return cacheSet('laporan_bina', peta);
}

/** Tombol "Laporkan terpilih" mengikuti jumlah centang. */
function segarkanPilihanBina() {
  const n = stBina.pilih.size;
  const b = $('pbLaporMassal'); if (b) b.classList.toggle('hidden', !n);
  const s = $('pbPilihN'); if (s) s.textContent = angka(n);
  const all = $('pbPilihSemua');
  if (all) {
    const cek = [...document.querySelectorAll('#tbBina [data-pilih]')];
    const on = cek.filter(c => c.checked).length;
    all.checked = !!cek.length && on === cek.length;
    all.indeterminate = on > 0 && on < cek.length;
    all.disabled = !cek.length;
  }
}

function templateLaporBina(r, { tanggal, catatan }) {
  const saya  = APP.profil?.nama || 'Ustadz GEN-Z';
  const tahap = tahapBina(r);
  return `Assalamu'alaikum warahmatullahi wabarakatuh.

Laporan pelaksanaan pembinaan untuk Ustadz/Ustadzah selaku guru kelas binaan ${r.kelas || '-'}.

Santri: ${r.nama_siswa} (NISN ${r.nisn}) · ${r.kelas || '-'}
Kategori: ${r.kategori_bina || '-'}${tahap ? ` · tahap ke-${tahap}` : ''}
Bentuk pembinaan: ${r.bentuk_final || bentukBina(r)}
Pemicu: ${r.deskripsi_pelanggaran || '-'}
Dilaksanakan: ${tgl(tanggal)} oleh ${saya}
Catatan pelaksanaan: ${catatan}

Pembinaan di atas telah dilaksanakan di asrama. Mohon ditinjau, lalu tekan "Sahkan Selesai" agar tercatat resmi atas nama Ustadz/Ustadzah.

Jazakumullahu khairan.
— ${saya} (Ustadz GEN-Z)`;
}

/** Jendela laporan — satu baris (penerima bisa diganti) atau banyak baris sekaligus. */
async function modalLaporBina(ids) {
  ids = [...new Set((ids || []).map(String))].filter(Boolean);
  if (!ids.length) return toast('info', 'Pilih minimal satu pembinaan.');
  if (!bolehLaporBina()) return toast('error', 'Role Anda tidak melaporkan pembinaan.');

  let penuh, lap, guru;
  try {
    [{ penuh }, lap, guru] = await Promise.all([bahanBinaPenuh(), petaLaporanBina(), muatGuruAktif()]);
  } catch (err) { return fireError(err); }

  const admin = guru.filter(g => g.role === 'Admin' && g.id !== idSaya());
  const siap = [], lewat = [];
  ids.forEach(id => {
    const r = penuh.find(x => String(x.id_pembinaan) === id);
    if (!r) return lewat.push({ nama: id, sebab: 'tidak ditemukan' });
    if (String(r.status_pembinaan) === 'Selesai') return lewat.push({ nama: r.nama_siswa, sebab: 'sudah selesai' });
    if (lap.has(id)) return lewat.push({ nama: r.nama_siswa, sebab: 'sudah dilaporkan' });
    const pengesah = guruPengesah(guru, r.kelas);
    siap.push({ r, pengesah, cadangan: !pengesah.length });
  });
  if (!siap.length) return toast('info', 'Tidak ada yang bisa dilaporkan: ' +
    lewat.map(x => `${x.nama} (${x.sebab})`).join(', '));
  if (siap.some(s => s.cadangan) && !admin.length)
    return toast('error', 'Sebagian kelas belum punya guru kelas binaan, dan tidak ada Admin aktif sebagai cadangan.');

  const tunggal = siap.length === 1 ? siap[0] : null;
  const opsi = (arr, label) => arr.length ? `<optgroup label="${esc(label)}">${arr.map(g =>
    `<option value="${esc(g.id)}">${esc(g.nama)} — ${esc(g.role)}${
      (g.kelas_binaan || []).length ? ' · ' + esc(g.kelas_binaan.join(', ')) : ''}</option>`).join('')}</optgroup>` : '';
  const chipGuru = (s) => s.cadangan
    ? `<span class="tag tag-wait" title="Kelas ${esc(s.r.kelas)} belum punya guru kelas binaan">Admin (cadangan)</span>`
    : s.pengesah.map(g => `<span class="tag tag-off">${esc(g.nama)}</span>`).join(' ');

  const ringkas = tunggal ? `
      <div class="pgs-pick on">
        <div class="ico"><i class="fa-solid fa-hands-holding-child"></i></div>
        <div><small>Pembinaan</small><b>${esc(tunggal.r.nama_siswa)}</b>
          <div class="secondary">${esc(tunggal.r.nisn)} · ${esc(tunggal.r.kelas || '-')} ·
            ${esc(tunggal.r.kategori_bina || '-')}${tahapBina(tunggal.r) ? ' ke-' + tahapBina(tunggal.r) : ''}</div>
          <div class="secondary" style="color:var(--text-1);margin-top:3px">${esc(tunggal.r.bentuk_final || bentukBina(tunggal.r))}</div></div>
      </div>
      <div class="field"><label class="label">Guru Pengesah</label>
        <select id="lbGuru" class="input">
          ${opsi(tunggal.pengesah, `Guru kelas binaan ${tunggal.r.kelas || '-'}`)}
          ${opsi(admin, 'Admin')}
        </select>
        <p class="hint">${tunggal.pengesah.length
          ? `Terisi otomatis dengan guru kelas binaan ${esc(tunggal.r.kelas || '-')}.`
          : `Kelas ${esc(tunggal.r.kelas || '-')} belum punya guru kelas binaan; laporan diarahkan ke Admin.`}</p>
      </div>
      ${tunggal.pengesah.length > 1 ? `<label class="ctx-note" style="cursor:pointer">
        <input type="checkbox" id="lbSemua" checked style="accent-color:var(--sea)">
        Kirim ke semua guru kelas binaan ${esc(tunggal.r.kelas)} (${tunggal.pengesah.length} guru) — cukup satu yang mengesahkan
      </label>` : ''}`
    : `<div class="lb-daftar">
        <div class="lb-kepala"><b>${angka(siap.length)} pembinaan</b> akan dilaporkan — penerima dipilih otomatis
          dari guru kelas binaan tiap santri.</div>
        ${siap.map(s => `<div class="lb-baris">
          <div><b>${esc(s.r.nama_siswa)}</b><small>${esc(s.r.kelas || '-')} · ${esc(s.r.kategori_bina || '-')}${
            tahapBina(s.r) ? ' ke-' + tahapBina(s.r) : ''} · ${esc(s.r.bentuk_final || bentukBina(s.r))}</small></div>
          <div class="lb-guru">${chipGuru(s)}</div></div>`).join('')}
      </div>`;

  const res = await Swal.fire({
    title: tunggal ? 'Laporkan Pembinaan ke Guru' : 'Laporkan Pembinaan Terpilih',
    width: 680, showCancelButton: true,
    confirmButtonText: `<i class="fa-solid fa-paper-plane"></i> Kirim laporan`, cancelButtonText: 'Batal',
    confirmButtonColor: '#14618B', showLoaderOnConfirm: true,
    allowOutsideClick: () => !Swal.isLoading(),
    html: `<div class="stack" style="text-align:left">
      ${ringkas}
      ${lewat.length ? `<div class="ctx-note"><i class="fa-solid fa-circle-info"></i>
        Dilewati: ${lewat.map(x => `${esc(x.nama)} (${esc(x.sebab)})`).join(', ')}</div>` : ''}
      <div class="grid-half" style="gap:12px">
        <div class="field"><label class="label">Tanggal Pelaksanaan</label>
          <input id="lbTgl" type="date" class="input" value="${hariIni()}" max="${hariIni()}"></div>
        <div class="field"><label class="label">Pelaksana</label>
          <input class="input" value="${esc(APP.profil?.nama || '-')} · Ustadz GEN-Z" disabled></div>
      </div>
      <div class="field"><label class="label">Catatan Pelaksanaan</label>
        <textarea id="lbCatatan" class="input" rows="4"
          placeholder="Contoh: pembinaan dilaksanakan ba'da Isya di mushalla asrama; ananda mengakui kesalahan dan berjanji memperbaiki."></textarea>
        <p class="hint">Uraikan singkat bagaimana pembinaan dijalankan dan respons ananda — ini bahan guru sebelum mengesahkan.</p>
      </div>
    </div>`,
    didOpen: () => { if (tunggal) $('lbGuru').value = (tunggal.pengesah[0] || admin[0] || {}).id || ''; },
    preConfirm: async () => {
      const tanggal = $('lbTgl').value;
      const catatan = $('lbCatatan').value.trim();
      if (!tanggal) { Swal.showValidationMessage('Tanggal pelaksanaan belum diisi.'); return false; }
      if (tanggal > hariIni()) { Swal.showValidationMessage('Tanggal pelaksanaan tidak boleh di masa depan.'); return false; }
      if (catatan.length < 8) { Swal.showValidationMessage('Catatan pelaksanaan terlalu singkat (minimal 8 karakter).'); return false; }

      const p = APP.profil;
      const rows = [];
      siap.forEach(s => {
        let tujuan;
        if (tunggal) tujuan = $('lbSemua')?.checked ? s.pengesah.map(g => g.id) : [$('lbGuru').value];
        else tujuan = s.cadangan ? admin.map(g => g.id) : s.pengesah.map(g => g.id);
        tujuan = [...new Set(tujuan.filter(Boolean))];
        const isi = templateLaporBina(s.r, { tanggal, catatan });
        const tahap = tahapBina(s.r);
        tujuan.forEach(id => {
          const g = guru.find(x => x.id === id) || {};
          rows.push({
            utas: kunciUtasBina(s.r.id_pembinaan, p.id, id),
            jenis: 'pembinaan', id_pembinaan: String(s.r.id_pembinaan), dilaksanakan_pada: tanggal,
            nisn: String(s.r.nisn), nama_santri: s.r.nama_siswa, kelas: s.r.kelas || null,
            tier: `${s.r.kategori_bina || '-'}${tahap ? ' · ke-' + tahap : ''}`,
            pengirim_id: p.id, pengirim_nama: p.nama, pengirim_role: p.role,
            penerima_id: id, penerima_nama: g.nama || '-', penerima_role: g.role || '-',
            isi, status: 'Terkirim'
          });
        });
      });
      if (!rows.length) { Swal.showValidationMessage('Penerima belum dipilih.'); return false; }
      try { await sisipkanPesan(rows); return { laporan: siap.length, pesan: rows.length }; }
      catch (e) { Swal.showValidationMessage(e.message || 'Gagal mengirim laporan.'); return false; }
    }
  });

  if (res.isConfirmed) {
    siap.forEach(s => stBina.pilih.delete(String(s.r.id_pembinaan)));
    cacheHapus('laporan_bina', 'pesan_bk');
    sync('done', 'Laporan terkirim');
    toast('success', `${angka(res.value.laporan)} laporan terkirim ke guru kelas binaan`);
    if (APP.view === 'pembinaan') await gambarBina();
  }
}

/** Utas laporan yang menunggu pengesahan SAYA (saya penerima laporan aslinya). */
function utasMenungguSaya() {
  if (!bolehPembinaan()) return [];
  return stPesan.utas.filter(u => u.jenis === 'pembinaan' && !u.selesai
    && u.pesan[0]?.penerima_id === idSaya());
}

async function sahkanUtas() {
  const u = stPesan.utas.find(x => x.utas === stPesan.aktif);
  if (!u || u.jenis !== 'pembinaan' || u.selesai) return;
  await ubahStatusPembinaan(u.id_pembinaan, 'Selesai', $('msgSahkan'));
}

async function sahkanSemuaUtas() {
  const daftar = utasMenungguSaya();
  if (!daftar.length) return toast('info', 'Tidak ada laporan yang menunggu pengesahan.');
  const konf = await Swal.fire({
    icon: 'question', width: 600, title: `Sahkan ${daftar.length} pembinaan?`,
    html: `<div style="text-align:left;font-size:13px">
      <p style="margin:0 0 8px">Setiap pembinaan berikut akan berstatus <b>Selesai</b> atas nama Anda,
        dan pelapor menerima konfirmasi otomatis.</p>
      <ul style="max-height:220px;overflow:auto;padding-left:18px;margin:0">
        ${daftar.map(u => `<li><b>${esc(u.nama_santri || '-')}</b> — ${esc(u.kelas || '-')}${
          u.tier ? ' · ' + esc(u.tier) : ''} <span style="color:var(--text-3)">(${esc(u.pesan[0]?.pengirim_nama || '-')})</span></li>`).join('')}
      </ul>
      <p style="margin:10px 0 0;color:var(--text-3);font-size:12px">Sudah membaca setiap laporan? Pengesahan adalah tanggung jawab Anda.</p></div>`,
    showCancelButton: true, confirmButtonText: 'Ya, sahkan semua', cancelButtonText: 'Batal',
    confirmButtonColor: '#0F766E'
  });
  if (!konf.isConfirmed) return;

  const btn = $('msgSahkanSemua'); const asli = mulaiSimpan(btn, 'Mengesahkan…');
  let ok = 0; const gagal = [];
  for (const u of daftar) {
    try { await q(db.rpc('ubah_status_pembinaan', { p_id: u.id_pembinaan, p_status: 'Selesai' }), 'pembinaan'); ok++; }
    catch (e) { gagal.push(`${u.nama_santri}: ${e.message || e}`); }
  }
  cacheHapus('pembinaan', 'laporan_bina', 'pesan_bk');
  selesaiSimpan(btn, asli, !gagal.length, gagal.length ? 'Sebagian gagal' : 'Semua disahkan');
  if (gagal.length) Swal.fire({ icon: 'warning', title: `${ok} disahkan, ${gagal.length} gagal`,
    html: `<div style="text-align:left;font-size:12.5px">${gagal.map(esc).join('<br>')}</div>` });
  else toast('success', `${angka(ok)} pembinaan disahkan`);
  refreshBadgePesan();
  await muatViewPesan();
}


// =====================================================================
// 30. FITUR BARU — KONSTANTA BERSAMA
// =====================================================================

/** Mushaf standar: 20 halaman per juz (604 halaman / 30 juz ≈ 20,1). */
const HALAMAN_PER_JUZ = 20;

const KELANCARAN = ['Mumtaz','Jayyid Jiddan','Jayyid','Maqbul','Rasib'];
const kelasLancar = (v) => 'thf-lancar ' + String(v || '')
  .trim().toLowerCase().replace(/\s+/g, '-');

const KAT_PRESTASI = ['Emas','Perak','Perunggu'];
const URUT_PRESTASI = { Emas:0, Perak:1, Perunggu:2 };
const dotPrestasi = (k) => k === 'Emas' ? 'g' : k === 'Perak' ? 'p' : 'u';
const tagPrestasi = (k) => k === 'Emas' ? 'tag-emas' : k === 'Perak' ? 'tag-sea' : 'tag-ok';

/** 114 surah: nama & jumlah ayat — dipakai saran input setoran. */
const SURAH = [
  ['Al-Fatihah',7],['Al-Baqarah',286],['Ali Imran',200],['An-Nisa',176],['Al-Maidah',120],
  ['Al-Anam',165],['Al-Araf',206],['Al-Anfal',75],['At-Taubah',129],['Yunus',109],
  ['Hud',123],['Yusuf',111],['Ar-Rad',43],['Ibrahim',52],['Al-Hijr',99],
  ['An-Nahl',128],['Al-Isra',111],['Al-Kahfi',110],['Maryam',98],['Taha',135],
  ['Al-Anbiya',112],['Al-Hajj',78],['Al-Muminun',118],['An-Nur',64],['Al-Furqan',77],
  ['Asy-Syuara',227],['An-Naml',93],['Al-Qasas',88],['Al-Ankabut',69],['Ar-Rum',60],
  ['Luqman',34],['As-Sajdah',30],['Al-Ahzab',73],['Saba',54],['Fatir',45],
  ['Yasin',83],['As-Saffat',182],['Sad',88],['Az-Zumar',75],['Gafir',85],
  ['Fussilat',54],['Asy-Syura',53],['Az-Zukhruf',89],['Ad-Dukhan',59],['Al-Jasiyah',37],
  ['Al-Ahqaf',35],['Muhammad',38],['Al-Fath',29],['Al-Hujurat',18],['Qaf',45],
  ['Az-Zariyat',60],['At-Tur',49],['An-Najm',62],['Al-Qamar',55],['Ar-Rahman',78],
  ['Al-Waqiah',96],['Al-Hadid',29],['Al-Mujadilah',22],['Al-Hasyr',24],['Al-Mumtahanah',13],
  ['As-Saff',14],['Al-Jumuah',11],['Al-Munafiqun',11],['At-Tagabun',18],['At-Talaq',12],
  ['At-Tahrim',12],['Al-Mulk',30],['Al-Qalam',52],['Al-Haqqah',52],['Al-Maarij',44],
  ['Nuh',28],['Al-Jinn',28],['Al-Muzzammil',20],['Al-Muddassir',56],['Al-Qiyamah',40],
  ['Al-Insan',31],['Al-Mursalat',50],['An-Naba',40],['An-Naziat',46],['Abasa',42],
  ['At-Takwir',29],['Al-Infitar',19],['Al-Mutaffifin',36],['Al-Insyiqaq',25],['Al-Buruj',22],
  ['At-Tariq',17],['Al-Ala',19],['Al-Gasyiyah',26],['Al-Fajr',30],['Al-Balad',20],
  ['Asy-Syams',15],['Al-Lail',21],['Ad-Duha',11],['Asy-Syarh',8],['At-Tin',8],
  ['Al-Alaq',19],['Al-Qadr',5],['Al-Bayyinah',8],['Az-Zalzalah',8],['Al-Adiyat',11],
  ['Al-Qariah',11],['At-Takasur',8],['Al-Asr',3],['Al-Humazah',9],['Al-Fil',5],
  ['Quraisy',4],['Al-Maun',7],['Al-Kausar',3],['Al-Kafirun',6],['An-Nasr',3],
  ['Al-Lahab',5],['Al-Ikhlas',4],['Al-Falaq',5],['An-Nas',6]
];

function saranSurah(input, onPilih) {
  lampirkanSaran(input, {
    ambil: async (kata) => {
      const k = String(kata || '').toLowerCase();
      return SURAH.map(([nama, ayat], i) => ({ nama, ayat, no: i + 1 }))
        .filter(s => !k || s.nama.toLowerCase().includes(k) || String(s.no) === k)
        .slice(0, 30);
    },
    minKetik: 0,
    kosong: 'Nama surah tidak ditemukan.',
    keItem: (s) => ({ huruf: String(s.no), judul: esc(s.nama), sub: `${s.ayat} ayat` }),
    keTeks: (s) => s.nama,
    onPilih: (s) => { input.dataset.ayat = s.ayat; onPilih?.(s); }
  });
}

// =====================================================================
// 31. PWA — pemasangan, status luring, dan antrean tulis
//     Tujuannya sederhana: pencatatan di asrama tidak boleh gagal hanya
//     karena sinyal hilang. Simpanan yang gagal dimasukkan ke antrean
//     lokal, lalu dikirim ulang begitu koneksi pulih.
// =====================================================================
const ANTREAN_KUNCI = 'rq_antrean_v1';

function antreanBaca() {
  try { return JSON.parse(localStorage.getItem(ANTREAN_KUNCI) || '[]'); }
  catch (e) { return []; }
}
function antreanTulis(list) {
  try { localStorage.setItem(ANTREAN_KUNCI, JSON.stringify(list)); } catch (e) {}
  gambarBadgeAntrean();
}
function gambarBadgeAntrean() {
  const n = antreanBaca().length;
  const el = $('antreBadge'); if (!el) return;
  el.classList.toggle('on', n > 0);
  const t = $('antreText'); if (t) t.textContent = String(n);
  el.title = n ? `${n} perubahan menunggu koneksi` : '';
}
function gambarBadgeLuring() {
  $('luringBadge')?.classList.toggle('on', !navigator.onLine);
}

/**
 * Simpan satu baris ke Supabase; bila gagal karena jaringan, masukkan
 * antrean lokal supaya tidak hilang. Mengembalikan:
 *   { ok:true }            -> tersimpan di server
 *   { ok:true, antre:true} -> disimpan lokal, menunggu koneksi
 */
async function simpanAman(tabel, payload, opsi = {}) {
  if (navigator.onLine) {
    try {
      const { error } = await db.from(tabel).insert(payload);
      if (error) throw error;
      return { ok: true };
    } catch (err) {
      const jaringan = !navigator.onLine ||
        /fetch|network|failed to fetch|timeout/i.test(err?.message || '');
      if (!jaringan) throw err;
    }
  }
  if (opsi.wajibDaring) throw new Error('Fitur ini memerlukan koneksi internet.');
  const q = antreanBaca();
  q.push({ id: Date.now() + '-' + Math.random().toString(36).slice(2, 7), tabel, payload, pada: new Date().toISOString() });
  antreanTulis(q);
  return { ok: true, antre: true };
}

/** Kirim ulang seluruh antrean. Dipanggil otomatis saat koneksi pulih. */
async function kirasAntrean(diam) {
  const q = antreanBaca();
  if (!q.length || !navigator.onLine) return 0;
  let terkirim = 0;
  const sisa = [];
  for (const item of q) {
    try {
      const { error } = await db.from(item.tabel).insert(item.payload);
      if (error) throw error;
      terkirim++;
    } catch (e) { sisa.push(item); }
  }
  antreanTulis(sisa);
  if (terkirim) {
    cacheHapus('prestasi','tahfiz','detail','siswa','pembinaan');
    if (!diam) toast('success', `${terkirim} catatan tertunda berhasil dikirim`);
    if (APP.profil) navigateTo(APP.view);
  }
  return terkirim;
}

window.addEventListener('online',  () => { gambarBadgeLuring(); kirasAntrean(); });
window.addEventListener('offline', () => { gambarBadgeLuring(); toast('info', 'Mode luring — catatan disimpan sementara di perangkat.'); });

/** Registrasi service worker + tombol "Pasang". */
let promptPasang = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  promptPasang = e;
  $('btnPasang')?.classList.add('on');
});
$('btnPasang')?.addEventListener('click', async () => {
  if (!promptPasang) return toast('info', 'Aplikasi sudah terpasang atau belum siap dipasang.');
  promptPasang.prompt();
  const { outcome } = await promptPasang.userChoice;
  if (outcome === 'accepted') toast('success', 'Aplikasi dipasang di perangkat ini.');
  promptPasang = null;
  $('btnPasang')?.classList.remove('on');
});

/* ---------------------------------------------------------------------
 * PEMBARUAN APLIKASI  (v2.10)
 *
 * Sebelumnya pendaftaran service worker berhenti sampai "aktif". Akibatnya
 * tab yang dibiarkan terbuka seharian — kebiasaan yang wajar di meja
 * musyrif — tetap menjalankan app.js lama meski berkas di server sudah
 * diganti. Tiga penambahan di bawah menutup celah itu:
 *
 *   1. Pemeriksaan berkala: setiap kali tab kembali dilihat, dan sekali
 *      tiap 30 menit. Tanpa ini, peramban baru memeriksa sw.js saat ada
 *      navigasi baru — yang mungkin tidak pernah terjadi.
 *   2. Deteksi 'updatefound': versi baru selesai dipasang sementara
 *      halaman ini masih memakai yang lama.
 *   3. Pesan dari service worker yang baru aktif.
 *
 * Yang sengaja TIDAK dilakukan: memuat ulang halaman secara otomatis.
 * Musyrif bisa sedang mengetik catatan pembinaan, dan memuat ulang tanpa
 * permisi berarti membuang pekerjaannya. Pembaruan ditawarkan, bukan
 * dipaksakan.
 * ------------------------------------------------------------------- */
let versiBaruDitawarkan = false;

function tawarkanMuatUlang() {
  if (versiBaruDitawarkan) return;
  versiBaruDitawarkan = true;
  Swal.fire({
    toast: true, position: 'bottom-end', icon: 'info',
    title: 'Versi baru tersedia',
    text: 'Muat ulang untuk memakai pembaruan terbaru.',
    showConfirmButton: true, confirmButtonText: 'Muat Ulang',
    showCancelButton: true,  cancelButtonText: 'Nanti',
    confirmButtonColor: '#14618B',
    timer: undefined, timerProgressBar: false, allowOutsideClick: false
  }).then(r => {
    if (r.isConfirmed) {
      navigator.serviceWorker?.controller?.postMessage({ tipe: 'lewati-tunggu' });
      location.reload();
    } else {
      // Ditolak sekali bukan berarti selamanya; tawarkan lagi nanti.
      setTimeout(() => { versiBaruDitawarkan = false; }, 30 * 60 * 1000);
    }
  });
}

$('btnSegarkan')?.addEventListener('click', async () => {
  const r = await Swal.fire({
    icon: 'question', title: 'Segarkan aplikasi?',
    html: 'Singgahan di perangkat ini dibersihkan lalu halaman dimuat ulang '
        + 'dengan versi terbaru.<br><br><b>Data santri tidak terpengaruh</b> — '
        + 'seluruhnya tersimpan di server, bukan di perangkat.',
    showCancelButton: true, confirmButtonText: 'Ya, segarkan',
    cancelButtonText: 'Batal', confirmButtonColor: '#14618B'
  });
  if (r.isConfirmed) {
    toast('info', 'Membersihkan singgahan…');
    paksaSegarkanAplikasi();
  }
});

/** Jalan keluar terakhir bila satu perangkat tersangkut di versi lama. */
async function paksaSegarkanAplikasi() {
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (!reg) { location.reload(); return; }
    navigator.serviceWorker.controller?.postMessage({ tipe: 'bersihkan-singgahan' });
    await reg.update().catch(() => {});
    setTimeout(() => location.reload(), 900);
  } catch (e) { location.reload(); }
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('sw.js');
      console.info('[PWA] service worker aktif');

      const periksa = () => reg.update().catch(() => {});
      document.addEventListener('visibilitychange', () => { if (!document.hidden) periksa(); });
      window.addEventListener('online', periksa);
      setInterval(periksa, 30 * 60 * 1000);

      reg.addEventListener('updatefound', () => {
        const baru = reg.installing;
        if (!baru) return;
        baru.addEventListener('statechange', () => {
          // `controller` yang sudah ada berarti ini benar-benar PEMBARUAN,
          // bukan pemasangan pertama kali.
          if (baru.state === 'installed' && navigator.serviceWorker.controller) {
            tawarkanMuatUlang();
          }
        });
      });
    } catch (e) {
      console.warn('[PWA] service worker gagal:', e.message);
    }
  });

  navigator.serviceWorker.addEventListener('message', (e) => {
    const p = e.data;
    if (p?.tipe === 'versi-baru') tawarkanMuatUlang();
    if (p?.tipe === 'versi') console.info('[PWA] versi singgahan:', p.versi);
    if (p?.tipe === 'singgahan-bersih') console.info('[PWA] singgahan dibersihkan:', p.versi);
  });
}

gambarBadgeLuring();
gambarBadgeAntrean();
setTimeout(() => kirasAntrean(true), 4000);


// =====================================================================
// 32. MODUL PRESTASI & APRESIASI  (fitur 1 — poin positif)
//     Pasangan setara modul pelanggaran: memakai master katalog,
//     pintasan cepat, papan santri teladan, dan neraca poin.
// =====================================================================
const stPrs = { page:1, size:20, cari:'', kategori:'', bidang:'', kode:'', panel:'catat' };

/** Prestasi dalam lingkup konteks + kelas binaan + periode aktif. */
function lingkupPrestasi(rows, pakaiPeriode = true) {
  let out = (rows || []).filter(aktifPrestasi);
  const { unit, jenjang } = APP.ctx;
  if (unit === 'Pengasuhan') out = out.filter(r => String(r.sumber || 'Pengasuhan').trim() === 'Pengasuhan');
  if (unit === 'Madrasah') {
    out = out.filter(r => String(r.sumber || '').trim() === 'Madrasah');
    if (jenjang !== 'Semua') out = out.filter(r => String(r.jenjang || '').trim() === jenjang);
  }
  out = filterBinaanUnit(out, 'kelas');
  return pakaiPeriode ? saringPeriode(out, 'tanggal') : out;
}

async function viewPrestasi() {
  const master = (await muatMasterPrestasi()).filter(m => m.aktif !== false);
  const bolehCatat = bisa('prestasi.catat') && !hanyaBaca();

  $('viewRoot').innerHTML = `
    <section class="prs-hero">
      <div class="eyebrow"><span class="ar">الإنجازات</span><span class="rule"></span>
        <span class="lat">Apresiasi Santri</span></div>
      <span class="ar" style="display:block;font-size:21px;color:#F2E5B8;line-height:1.95">
        وَأَن لَّيْسَ لِلْإِنسَانِ إِلَّا مَا سَعَىٰ</span>
      <h2>Yang baik pun dicatat.</h2>
      <p>Poin apresiasi berdiri sejajar dengan catatan pelanggaran dan langsung
         mengurangi skor net santri pada laporan perkembangan. Tujuannya bukan
         menghapus kesalahan, melainkan memastikan usaha perbaikan ikut terbaca.</p>
      <div class="meta">
        <span><i class="fa-solid fa-layer-group"></i>${esc(labelKonteks())}</span>
        <span><i class="fa-regular fa-calendar-days"></i>${esc(labelPeriode())}</span>
        <span><i class="fa-solid fa-book"></i>${angka(master.length)} jenis apresiasi</span>
      </div>
    </section>

    <div class="stats" id="prsStat"></div>

    <div class="grid-2">
      <div>
        ${bolehCatat ? `
        <section class="card" id="prsKartuCatat">
          <div class="card-head">
            <div><h3>Catat Apresiasi</h3>
              <p class="sub">Pilih santri, tentukan bentuk apresiasi, simpan.</p></div>
          </div>
          <div class="prs-quick" id="prsQuick">
            <span class="lbl"><i class="fa-solid fa-bolt"></i>Pintasan</span>
            ${master.slice(0, 8).map(m => `
              <button class="prs-chip" data-kode="${esc(m.kode_prestasi)}">
                <span class="dot ${dotPrestasi(m.kategori)}"></span>
                ${esc(m.nama_prestasi.length > 34 ? m.nama_prestasi.slice(0, 33) + '…' : m.nama_prestasi)}
                <b>+${Number(m.bobot_poin) || 0}</b>
              </button>`).join('') || '<span class="hint">Master prestasi belum diisi.</span>'}
          </div>
          <div class="pgs-pick" id="prsPick">
            <div class="ico"><i class="fa-solid fa-user-graduate"></i></div>
            <div><small>Santri terpilih</small><b id="prsPickNama">Belum dipilih</b></div>
          </div>
          <div class="prs-form">
            <div class="field ac-wrap">
              <label class="label" for="prsSantri">Nama / NISN santri</label>
              <input id="prsSantri" class="input" placeholder="Ketik minimal 2 huruf…" autocomplete="off">
            </div>
            <div class="field ac-wrap">
              <label class="label" for="prsJenis">Bentuk apresiasi</label>
              <input id="prsJenis" class="input" placeholder="Pilih dari katalog…" autocomplete="off">
            </div>
            <div class="field">
              <label class="label" for="prsKategori">Kategori</label>
              <select id="prsKategori" class="input">
                ${KAT_PRESTASI.map(k => `<option${k==='Perunggu'?' selected':''}>${k}</option>`).join('')}
              </select>
            </div>
            <div class="field">
              <label class="label" for="prsPoin">Poin</label>
              <input id="prsPoin" type="number" min="1" max="100" class="input mono" value="5">
            </div>
            <div class="field">
              <label class="label" for="prsBidang">Bidang</label>
              <input id="prsBidang" class="input" placeholder="Ubudiyah / Akademik / Tahfiz…" autocomplete="off">
            </div>
            <div class="field">
              <label class="label" for="prsTanggal">Tanggal</label>
              <input id="prsTanggal" type="date" class="input" value="${hariIni()}">
            </div>
            <div class="field wide">
              <label class="label" for="prsCatatan">Catatan (opsional)</label>
              <textarea id="prsCatatan" class="input" rows="2"
                placeholder="Keterangan singkat yang membantu wali kelas memahami konteks…"></textarea>
            </div>
          </div>
          <div class="pgs-bar">
            <span class="note"><i class="fa-solid fa-circle-info"></i>
              Poin apresiasi mengurangi skor net, bukan menghapus riwayat pelanggaran.</span>
            <button class="btn btn-brass" id="prsSimpan"><i class="fa-solid fa-award"></i>Simpan Apresiasi</button>
          </div>
        </section>` : ''}

        <section class="card">
          <div class="card-head">
            <div><h3>Riwayat Apresiasi</h3><p class="sub" id="prsSub">Memuat…</p></div>
            <div class="actions">
              <button class="btn btn-ghost btn-sm" id="prsCsv"><i class="fa-solid fa-file-csv"></i>Ekspor CSV</button>
            </div>
          </div>
          <div class="filters">
            <input id="prsCari" class="input grow" placeholder="Cari nama, NISN, atau bentuk apresiasi…">
            <select id="prsFKat" class="input">
              <option value="">Semua kategori</option>
              ${KAT_PRESTASI.map(k => `<option>${k}</option>`).join('')}
            </select>
            <input id="prsFBidang" class="input" placeholder="Semua bidang" autocomplete="off">
            <span class="sep"></span>
            <button class="btn btn-ghost btn-sm" id="prsReset"><i class="fa-solid fa-rotate-left"></i>Reset</button>
          </div>
          <div class="tbl"><table>
            <thead><tr><th>Tanggal</th><th>Santri</th><th>Bentuk Apresiasi</th>
              <th>Kategori</th><th class="center">Poin</th><th class="right">Aksi</th></tr></thead>
            <tbody id="prsBody"><tr><td colspan="6" style="padding:26px;text-align:center;color:var(--text-3)">Memuat…</td></tr></tbody>
          </table></div>
          <div class="scroll-hint"><i class="fa-solid fa-arrows-left-right"></i>Geser ke samping untuk kolom lainnya.</div>
          <div id="prsPager"></div>
        </section>
      </div>

      <div>
        <section class="card">
          <div class="card-head"><div><h3>Santri Teladan</h3>
            <p class="sub">Peringkat poin apresiasi pada periode aktif.</p></div></div>
          <div class="prs-board" id="prsBoard"></div>
        </section>

        <section class="card">
          <div class="card-head"><div><h3>Neraca Poin Unit</h3>
            <p class="sub">Perbandingan beban pelanggaran dan apresiasi.</p></div></div>
          <div class="neraca" id="prsNeraca"></div>
        </section>

        <section class="card">
          <div class="card-head"><div><h3>Sebaran Bidang Apresiasi</h3>
            <p class="sub">Bidang mana yang paling sering diapresiasi.</p></div></div>
          ${chartBox('chPrsBidang')}
        </section>
      </div>
    </div>`;

  if (bolehCatat) {
    saranSantri($('prsSantri'), (s) => {
      $('prsPickNama').textContent = `${s.nama_siswa} · ${s.kelas || '-'}`;
      $('prsPick').classList.add('on');
      $('prsSantri').dataset.nama = s.nama_siswa || '';
      $('prsSantri').dataset.kelas = s.kelas || '';
      $('prsSantri').dataset.jenjang = s.jenjang || '';
    });
    prsSaranJenis($('prsJenis'));
    saranBidang($('prsBidang'));
    $('prsSimpan').addEventListener('click', prsSimpan);
    $('prsQuick').addEventListener('click', (e) => {
      const b = e.target.closest('[data-kode]'); if (!b) return;
      prsPilihCepat(b.dataset.kode, master);
      [...$('prsQuick').querySelectorAll('.prs-chip')].forEach(c => c.classList.toggle('on', c === b));
    });
  }

  $('prsCari').addEventListener('input', debounce(e => {
    stPrs.cari = e.target.value.trim(); stPrs.page = 1; gambarPrestasi();
  }, 260));
  $('prsFKat').addEventListener('change', e => { stPrs.kategori = e.target.value; stPrs.page = 1; gambarPrestasi(); });
  saranBidang($('prsFBidang'), (b) => {
    stPrs.bidang = b?.nama_bidang || ''; stPrs.page = 1; gambarPrestasi();
  });
  $('prsFBidang').addEventListener('input', debounce(e => {
    if (!e.target.value.trim()) { stPrs.bidang = ''; stPrs.page = 1; gambarPrestasi(); }
  }, 260));
  $('prsReset').addEventListener('click', () => {
    Object.assign(stPrs, { page:1, cari:'', kategori:'', bidang:'' });
    $('prsCari').value = ''; $('prsFKat').value = ''; $('prsFBidang').value = '';
    gambarPrestasi();
  });
  $('prsCsv').addEventListener('click', prsEksporCsv);

  onKlik(async (e) => {
    const d = e.target.closest('[data-detail]');
    if (d) return bukaDetailSantri(d.dataset.detail);
    const a = e.target.closest('[data-prs-arsip]');
    if (a) return prsArsipkan(a.dataset.prsArsip);
    const p = e.target.closest('[data-pg]');
    if (p && p.dataset.pg.startsWith('prs:')) {
      stPrs.page = Number(p.dataset.pg.split(':')[1]); gambarPrestasi();
    }
  });

  await gambarPrestasi();
}

function prsSaranJenis(input) {
  lampirkanSaran(input, {
    ambil: async (kata) => cariLokal(
      (await muatMasterPrestasi()).filter(m => m.aktif !== false), kata,
      ['kode_prestasi','nama_prestasi','kategori','bidang'], 40),
    minKetik: 0,
    kosong: 'Jenis apresiasi tidak ditemukan.',
    keItem: (m) => ({
      huruf: esc((m.kategori || '?').charAt(0)),
      judul: `${esc(m.kode_prestasi)} — ${esc(m.nama_prestasi)}`,
      sub: `${esc(m.kategori)} · +${m.bobot_poin} poin · ${esc(m.bidang || '-')}`
    }),
    keTeks: (m) => `${m.kode_prestasi} — ${m.nama_prestasi}`,
    onPilih: (m) => {
      input.dataset.kode = m.kode_prestasi;
      input.dataset.nama = m.nama_prestasi;
      $('prsKategori').value = m.kategori || 'Perunggu';
      $('prsPoin').value = Number(m.bobot_poin) || 5;
      if (m.bidang) $('prsBidang').value = m.bidang;
    }
  });
}

function prsPilihCepat(kode, master) {
  const m = (master || []).find(x => x.kode_prestasi === kode); if (!m) return;
  const inp = $('prsJenis');
  inp.value = `${m.kode_prestasi} — ${m.nama_prestasi}`;
  inp.dataset.kode = m.kode_prestasi;
  inp.dataset.nama = m.nama_prestasi;
  $('prsKategori').value = m.kategori || 'Perunggu';
  $('prsPoin').value = Number(m.bobot_poin) || 5;
  if (m.bidang) $('prsBidang').value = m.bidang;
}

async function prsSimpan() {
  const inpS = $('prsSantri'), inpJ = $('prsJenis');
  const nisn = inpS.dataset.picked;
  const judul = (inpJ.dataset.kode && inpJ.dataset.nama)
    ? inpJ.dataset.nama
    : inpJ.value.replace(/^[^—]*—\s*/, '').trim();
  if (!nisn)  return toast('error', 'Pilih santri terlebih dahulu.');
  if (!judul) return toast('error', 'Tentukan bentuk apresiasinya.');

  const poin = Math.max(1, Number($('prsPoin').value) || 0);
  const btn = $('prsSimpan');
  const asli = mulaiSimpan(btn, 'Menyimpan…');
  try {
    const hasil = await simpanAman('log_prestasi', {
      nisn: String(nisn),
      nama_siswa: inpS.dataset.nama || null,
      kelas: inpS.dataset.kelas || null,
      jenjang: inpS.dataset.jenjang || null,
      tanggal: $('prsTanggal').value || hariIni(),
      kode_prestasi: inpJ.dataset.kode || null,
      judul,
      kategori: $('prsKategori').value || 'Perunggu',
      bidang: $('prsBidang').value.trim() || null,
      poin,
      catatan: $('prsCatatan').value.trim() || null,
      sumber: APP.ctx.unit === 'Madrasah' ? 'Madrasah' : 'Pengasuhan',
      pencatat: APP.profil?.nama || null,
      pencatat_id: APP.profil?.id || null
    });
    selesaiSimpan(btn, asli, true, hasil.antre ? 'Tersimpan luring' : 'Apresiasi tersimpan');
    if (hasil.antre) toast('info', 'Tersimpan di perangkat — akan dikirim saat koneksi pulih.');
    else toast('success', `Apresiasi +${poin} poin dicatat.`);

    inpS.value = ''; inpS.removeAttribute('data-picked');
    inpJ.value = ''; inpJ.removeAttribute('data-kode');
    $('prsCatatan').value = '';
    $('prsPickNama').textContent = 'Belum dipilih';
    $('prsPick').classList.remove('on');
    cacheHapus('prestasi');
    await gambarPrestasi();
  } catch (err) {
    selesaiSimpan(btn, asli, false, 'Gagal menyimpan');
    fireError(err);
  }
}

async function prsArsipkan(id) {
  const konf = await Swal.fire({
    icon:'warning', title:'Arsipkan catatan ini?',
    text:'Catatan tidak dihapus, hanya dikeluarkan dari perhitungan poin.',
    showCancelButton:true, confirmButtonText:'Ya, arsipkan',
    cancelButtonText:'Batal', confirmButtonColor:'#9F1239'
  });
  if (!konf.isConfirmed) return;
  try {
    const { error } = await db.from('log_prestasi').update({ status:'archived' }).eq('id', id);
    if (error) throw error;
    cacheHapus('prestasi');
    toast('success', 'Catatan diarsipkan.');
    await gambarPrestasi();
  } catch (err) { fireError(err); }
}

function prsSaring(rows) {
  let out = rows;
  if (stPrs.kategori) out = out.filter(r => r.kategori === stPrs.kategori);
  if (stPrs.bidang)   out = out.filter(r => String(r.bidang || '') === stPrs.bidang);
  if (stPrs.cari) {
    const k = stPrs.cari.toLowerCase();
    out = out.filter(r => [r.nama_siswa, r.nisn, r.judul, r.bidang, r.pencatat]
      .some(v => String(v || '').toLowerCase().includes(k)));
  }
  return out;
}

async function gambarPrestasi() {
  if (APP.view !== 'prestasi') return;
  const [semua, peta] = await Promise.all([muatPrestasi(), petaSiswa()]);
  const lingkup = lingkupPrestasi(semua);
  const rows = prsSaring(lingkup).slice()
    .sort((a, b) => String(kunciTgl(b.tanggal)).localeCompare(String(kunciTgl(a.tanggal))));

  // ---------- papan statistik ----------
  const totalPoin = lingkup.reduce((a, r) => a + (Number(r.poin) || 0), 0);
  const santriUnik = new Set(lingkup.map(r => String(r.nisn))).size;
  const perKat = {};
  lingkup.forEach(r => { perKat[r.kategori || 'Perunggu'] = (perKat[r.kategori || 'Perunggu'] || 0) + 1; });
  const emas = perKat['Emas'] || 0;

  $('prsStat').innerHTML =
      stat('Catatan Apresiasi', angka(lingkup.length), 'fa-solid fa-award',
        'background:var(--amber-bg);color:#8A6D0B', 'var(--brass)', esc(labelPeriode()))
    + stat('Total Poin Positif', '+' + angka(totalPoin), 'fa-solid fa-plus',
        'background:var(--teal-bg);color:var(--teal)', 'var(--teal)', 'Mengurangi skor net santri')
    + stat('Santri Terapresiasi', angka(santriUnik), 'fa-solid fa-user-graduate',
        'background:#E7F1F7;color:var(--sea)', 'var(--sea)', 'Santri berbeda pada periode ini')
    + stat('Apresiasi Emas', angka(emas), 'fa-solid fa-medal',
        'background:var(--violet-bg);color:var(--violet)', 'var(--violet)', 'Kategori tertinggi');

  // ---------- tabel ----------
  const pages = Math.max(1, Math.ceil(rows.length / stPrs.size));
  if (stPrs.page > pages) stPrs.page = pages;
  const from = (stPrs.page - 1) * stPrs.size;
  const hal = rows.slice(from, from + stPrs.size);
  const bolehArsip = bisa('prestasi.arsip');

  $('prsSub').textContent = `${angka(rows.length)} catatan · ${esc(labelKonteks())} · ${labelPeriode()}`;
  $('prsBody').innerHTML = hal.map(r => {
    const s = peta[String(r.nisn)] || {};
    const nama = r.nama_siswa || s.nama_siswa || '(tanpa nama)';
    return `<tr>
      <td class="nowrap">${tgl(r.tanggal)}
        <div class="secondary">${esc(r.pencatat || '-')}</div></td>
      <td><button class="adm-santri" data-detail="${esc(r.nisn)}">
            <span class="av">${esc(String(nama).charAt(0).toUpperCase())}</span>
            <span class="who"><span class="nm">${esc(nama)}</span>
              <span class="secondary">${esc(r.nisn)} · ${esc(r.kelas || s.kelas || '-')}</span></span>
          </button></td>
      <td><div class="primary">${esc(r.judul)}</div>
        ${r.catatan ? `<div class="adm-note">${esc(r.catatan)}</div>` : ''}
        ${r.bidang ? `<div class="secondary">${esc(r.bidang)}</div>` : ''}</td>
      <td><span class="tag ${tagPrestasi(r.kategori)}">${esc(r.kategori || '-')}</span></td>
      <td class="center"><span class="poin-pill" style="background:#f6f0dc;color:#7A5F05">+${Number(r.poin)||0}</span></td>
      <td class="right">${bolehArsip
        ? `<button class="btn-link" data-prs-arsip="${r.id}" style="color:var(--maroon)">
             <i class="fa-solid fa-box-archive"></i> Arsip</button>` : '—'}</td>
    </tr>`;
  }).join('') || barisKosong(6, 'Belum ada catatan apresiasi.',
      'Catat apresiasi pertama lewat panel di samping.');
  $('prsPager').innerHTML = pager('prs', stPrs.page, rows.length, stPrs.size);

  // ---------- papan santri teladan ----------
  const board = new Map();
  lingkup.forEach(r => {
    const n = String(r.nisn);
    if (!board.has(n)) board.set(n, { nisn:n, nama: r.nama_siswa || peta[n]?.nama_siswa || n,
      kelas: r.kelas || peta[n]?.kelas || '-', poin:0, jml:0 });
    const o = board.get(n); o.poin += Number(r.poin) || 0; o.jml++;
  });
  const top = [...board.values()].sort((a, b) => b.poin - a.poin || b.jml - a.jml).slice(0, 10);
  $('prsBoard').innerHTML = top.map((t, i) => `
    <div class="prs-row">
      <div class="prs-medal">${i + 1}</div>
      <div class="prs-who">
        <b>${esc(t.nama)}</b><span>${esc(t.nisn)} · ${esc(t.kelas)}</span>
      </div>
      <div class="prs-poin"><b>+${angka(t.poin)}</b><small>${t.jml} catatan</small></div>
    </div>`).join('') || kosong('Belum ada peringkat.', 'Catatan apresiasi akan muncul di sini.', 'fa-ranking-star');

  // ---------- neraca poin ----------
  const detail = lingkupDetail(await muatDetail());
  const poinNeg = detail.reduce((a, r) => a + (Number(r.bobot_pelanggaran) || 0), 0);
  const jml = Math.max(1, poinNeg + totalPoin);
  const net = poinNeg - totalPoin;
  $('prsNeraca').innerHTML = `
    <div class="neraca-bar">
      <i class="neg" style="width:${(poinNeg / jml * 100).toFixed(1)}%"></i>
      <i class="pos" style="width:${(totalPoin / jml * 100).toFixed(1)}%"></i>
    </div>
    <div class="neraca-ket">
      <span class="kiri">Pelanggaran ${angka(poinNeg)} poin</span>
      <span class="kanan">Apresiasi ${angka(totalPoin)} poin</span>
    </div>
    <div class="neraca-net">
      <b style="color:${net > 0 ? 'var(--maroon)' : 'var(--teal)'}">${net > 0 ? '+' : ''}${angka(net)}</b>
      <small>Skor net unit</small>
    </div>
    <p class="hint" style="margin:0">${net > 0
      ? 'Beban pelanggaran masih lebih besar daripada apresiasi. Perbanyak pencatatan hal baik agar gambaran unit seimbang.'
      : 'Apresiasi sudah mengimbangi catatan pelanggaran pada periode ini.'}</p>`;

  // ---------- grafik bidang ----------
  const perBidang = {};
  lingkup.forEach(r => {
    const b = String(r.bidang || 'Belum Dipetakan').trim();
    perBidang[b] = (perBidang[b] || 0) + (Number(r.poin) || 0);
  });
  const urut = Object.entries(perBidang).sort((a, b) => b[1] - a[1]).slice(0, 7);
  buatChart('prsBidang', 'chPrsBidang', {
    type:'doughnut',
    data:{ labels: urut.map(x => x[0]),
      datasets:[{ data: urut.map(x => x[1]), backgroundColor: PALET, borderWidth:0 }] },
    options:{ responsive:true, maintainAspectRatio:false, cutout:'62%',
      plugins:{ legend:{ position:'bottom', labels:{ boxWidth:10, font:{ size:11 } } } } }
  });

  tandaiTabelBisaGeser();
}

function prsEksporCsv() {
  muatPrestasi().then(all => {
    const rows = prsSaring(lingkupPrestasi(all));
    if (!rows.length) return toast('error', 'Tidak ada data untuk diekspor.');
    unduhCsv(`prestasi-${berkasPeriode()}.csv`, [
      ['Tanggal','NISN','Nama','Kelas','Kategori','Bentuk Apresiasi','Bidang','Poin','Pencatat','Catatan'],
      ...rows.map(r => [kunciTgl(r.tanggal), r.nisn, r.nama_siswa, r.kelas, r.kategori,
        r.judul, r.bidang, r.poin, r.pencatat, r.catatan])
    ]);
  });
}


// =====================================================================
// 33. MODUL TAHFIZ AL-QUR'AN  (fitur 2)
//     Tiga pilar laporan santri kini lengkap: akademik (Madrasah),
//     akhlak (Pengasuhan), dan hafalan (modul ini).
// =====================================================================
const stThf = { page:1, size:15, cari:'', jenis:'', nisn:'', namaPilih:'' };

function lingkupTahfiz(rows, pakaiPeriode = true) {
  let out = filterBinaanUnit((rows || []).filter(aktifTahfiz), 'kelas');
  const { unit, jenjang } = APP.ctx;
  if (unit === 'Madrasah' && jenjang !== 'Semua') {
    out = out.filter(r => String(r.jenjang || '').trim() === jenjang);
  }
  return pakaiPeriode ? saringPeriode(out, 'tanggal') : out;
}

const juzDari = (hal) => Math.round((Number(hal || 0) / HALAMAN_PER_JUZ) * 100) / 100;

async function viewTahfiz() {
  const bolehSetor = bisa('tahfiz.setor') && !hanyaBaca();

  $('viewRoot').innerHTML = `
    <section class="thf-hero">
      <div class="eyebrow"><span class="ar">تحفيظ القرآن</span><span class="rule"></span>
        <span class="lat">Capaian Hafalan</span></div>
      <span class="ar">وَلَقَدْ يَسَّرْنَا الْقُرْآنَ لِلذِّكْرِ فَهَلْ مِن مُّدَّكِرٍ</span>
      <h2>Hafalan yang terukur.</h2>
      <p>Setoran ziyadah dan murajaah dicatat per santri, dijumlahkan menjadi
         halaman dan juz, lalu dibandingkan dengan target bulanan. Ringkasannya
         ikut tercetak pada Laporan Perkembangan Santri.</p>
      <div class="meta">
        <span><i class="fa-solid fa-layer-group"></i>${esc(labelKonteks())}</span>
        <span><i class="fa-regular fa-calendar-days"></i>${esc(labelPeriode())}</span>
        <span><i class="fa-solid fa-book-open"></i>1 juz ≈ ${HALAMAN_PER_JUZ} halaman</span>
      </div>
    </section>

    <div class="stats" id="thfStat"></div>

    <section class="card thf-juara">
      <div class="card-head">
        <div><h3><i class="fa-solid fa-ranking-star"></i>Peringkat Hafalan</h3>
          <p class="sub">Sepuluh penyetor terbanyak pada ${esc(labelPeriode())} —
             dihitung dari halaman yang terkumpul.</p></div>
        <span class="tag tag-emas"><i class="fa-solid fa-book-quran"></i>1 juz ≈ ${HALAMAN_PER_JUZ} halaman</span>
      </div>
      <div class="prs-board thf-board" id="thfBoard"></div>
    </section>

    <div class="grid-2">
      <div>
        ${bolehSetor ? `
        <section class="card">
          <div class="card-head">
            <div><h3>Catat Setoran</h3>
              <p class="sub">Ziyadah untuk hafalan baru, murajaah untuk pengulangan.</p></div>
          </div>
          <div class="pgs-pick" id="thfPick">
            <div class="ico"><i class="fa-solid fa-user-graduate"></i></div>
            <div><small>Santri terpilih</small><b id="thfPickNama">Belum dipilih</b></div>
          </div>
          <div class="thf-form">
            <div class="field ac-wrap wide">
              <label class="label" for="thfSantri">Nama / NISN santri</label>
              <input id="thfSantri" class="input" placeholder="Ketik minimal 2 huruf…" autocomplete="off">
            </div>
            <div class="field">
              <label class="label" for="thfJenis">Jenis setoran</label>
              <select id="thfJenis" class="input">
                <option>Ziyadah</option><option>Murajaah</option><option>Ujian</option>
              </select>
            </div>
            <div class="field">
              <label class="label" for="thfTanggal">Tanggal</label>
              <input id="thfTanggal" type="date" class="input" value="${hariIni()}">
            </div>
            <div class="field ac-wrap">
              <label class="label" for="thfSurah">Surah</label>
              <input id="thfSurah" class="input" placeholder="Ketik nama surah…" autocomplete="off">
            </div>
            <div class="field">
              <label class="label" for="thfDari">Ayat dari</label>
              <input id="thfDari" type="number" min="1" class="input mono" placeholder="1">
            </div>
            <div class="field">
              <label class="label" for="thfKe">Ayat sampai</label>
              <input id="thfKe" type="number" min="1" class="input mono" placeholder="10">
            </div>
            <div class="field">
              <label class="label" for="thfHalaman">Jumlah halaman</label>
              <input id="thfHalaman" type="number" min="0" step="0.5" class="input mono" value="1">
            </div>
            <div class="field">
              <label class="label" for="thfJuzInp">Juz ke-</label>
              <input id="thfJuzInp" type="number" min="1" max="30" class="input mono" placeholder="30">
            </div>
            <div class="field">
              <label class="label" for="thfLancar">Kelancaran</label>
              <select id="thfLancar" class="input">
                ${KELANCARAN.map(k => `<option${k==='Jayyid'?' selected':''}>${k}</option>`).join('')}
              </select>
            </div>
            <div class="field wide">
              <label class="label" for="thfCatatan">Catatan musyrif (opsional)</label>
              <textarea id="thfCatatan" class="input" rows="2"
                placeholder="Misal: makhraj huruf ḍād perlu diperbaiki…"></textarea>
            </div>
          </div>
          <div class="pgs-bar">
            <span class="note"><i class="fa-solid fa-circle-info"></i>
              Halaman boleh pecahan (0,5 = setengah halaman).</span>
            <button class="btn btn-primary" id="thfSimpan"><i class="fa-solid fa-floppy-disk"></i>Simpan Setoran</button>
          </div>
        </section>` : ''}

        <details class="card lipat" id="thfRiwayat">
          <summary class="card-head">
            <div><h3>Riwayat Setoran</h3><p class="sub" id="thfSub">Memuat…</p></div>
            <span class="lipat-tanda"><span class="teks"></span>
              <i class="fa-solid fa-chevron-down"></i></span>
          </summary>
          <div class="filters">
            <input id="thfCari" class="input grow" placeholder="Cari nama, NISN, atau surah…">
            <select id="thfFJenis" class="input">
              <option value="">Semua jenis</option>
              <option>Ziyadah</option><option>Murajaah</option><option>Ujian</option>
            </select>
            <span class="sep"></span>
            <button class="btn btn-ghost btn-sm" id="thfReset"><i class="fa-solid fa-rotate-left"></i>Reset</button>
            <button class="btn btn-ghost btn-sm" id="thfCsv"><i class="fa-solid fa-file-csv"></i>Ekspor CSV</button>
          </div>
          <div class="tbl"><table>
            <thead><tr><th>Tanggal</th><th>Santri</th><th>Bacaan</th>
              <th class="center">Hlm</th><th>Kelancaran</th><th>Jenis</th></tr></thead>
            <tbody id="thfBody"><tr><td colspan="6" style="padding:26px;text-align:center;color:var(--text-3)">Memuat…</td></tr></tbody>
          </table></div>
          <div class="scroll-hint"><i class="fa-solid fa-arrows-left-right"></i>Geser ke samping untuk kolom lainnya.</div>
          <div id="thfPager"></div>
        </details>
      </div>

      <div>
        <section class="card">
          <div class="card-head">
            <div><h3>Target Bulanan</h3><p class="sub">Pilih santri untuk melihat capaiannya.</p></div>
          </div>
          <div class="card-body" style="padding-bottom:0">
            <div class="field ac-wrap" style="margin:0">
              <label class="label" for="thfCariTarget">Santri</label>
              <input id="thfCariTarget" class="input" placeholder="Ketik nama santri…" autocomplete="off">
            </div>
          </div>
          <div id="thfTargetBox"></div>
        </section>

        <section class="card">
          <div class="card-head"><div><h3>Ritme Setoran</h3>
            <p class="sub">Halaman per pekan pada 8 pekan terakhir.</p></div></div>
          ${chartBox('chThfRitme')}
        </section>
      </div>
    </div>`;

  if (bolehSetor) {
    saranSantri($('thfSantri'), (s) => {
      $('thfPickNama').textContent = `${s.nama_siswa} · ${s.kelas || '-'}`;
      $('thfPick').classList.add('on');
      $('thfSantri').dataset.nama = s.nama_siswa || '';
      $('thfSantri').dataset.kelas = s.kelas || '';
      $('thfSantri').dataset.jenjang = s.jenjang || '';
    });
    saranSurah($('thfSurah'));
    $('thfSimpan').addEventListener('click', thfSimpan);
  }

  saranSantri($('thfCariTarget'), (s) => {
    stThf.nisn = String(s.nisn); stThf.namaPilih = s.nama_siswa || '';
    thfGambarTarget();
  });

  $('thfCari').addEventListener('input', debounce(e => {
    stThf.cari = e.target.value.trim(); stThf.page = 1; thfGambarPanel();
  }, 260));
  $('thfFJenis').addEventListener('change', e => { stThf.jenis = e.target.value; stThf.page = 1; thfGambarPanel(); });
  $('thfReset').addEventListener('click', () => {
    Object.assign(stThf, { page:1, cari:'', jenis:'' });
    $('thfCari').value = ''; $('thfFJenis').value = '';
    thfGambarPanel();
  });
  $('thfCsv').addEventListener('click', thfEksporCsv);

  // Petunjuk "geser ke samping" diukur dari lebar nyata tabel. Selama
  // panel terlipat lebarnya nol, jadi pengukurannya diulang tiap kali
  // panel dibuka — kalau tidak, petunjuknya tidak pernah muncul.
  $('thfRiwayat').addEventListener('toggle', () => {
    if ($('thfRiwayat').open) tandaiTabelBisaGeser();
  });

  onKlik(async (e) => {
    const d = e.target.closest('[data-detail]');
    if (d) return bukaDetailSantri(d.dataset.detail);
    const t = e.target.closest('[data-thf-target]');
    if (t) return thfModalTarget(t.dataset.thfTarget);
    const p = e.target.closest('[data-pg]');
    if (p && p.dataset.pg.startsWith('thf:')) {
      stThf.page = Number(p.dataset.pg.split(':')[1]); thfGambarPanel();
    }
  });

  await thfGambarPanel();
  await thfGambarTarget();
}

async function thfSimpan() {
  const inpS = $('thfSantri');
  const nisn = inpS.dataset.picked;
  if (!nisn) return toast('error', 'Pilih santri terlebih dahulu.');
  const halaman = Number($('thfHalaman').value) || 0;
  if (halaman <= 0) return toast('error', 'Jumlah halaman harus lebih dari nol.');

  const btn = $('thfSimpan');
  const asli = mulaiSimpan(btn, 'Menyimpan…');
  try {
    const hasil = await simpanAman('log_tahfiz', {
      nisn: String(nisn),
      nama_siswa: inpS.dataset.nama || null,
      kelas: inpS.dataset.kelas || null,
      jenjang: inpS.dataset.jenjang || null,
      tanggal: $('thfTanggal').value || hariIni(),
      jenis: $('thfJenis').value || 'Ziyadah',
      surah: $('thfSurah').value.trim() || null,
      ayat_dari: Number($('thfDari').value) || null,
      ayat_ke: Number($('thfKe').value) || null,
      juz: Number($('thfJuzInp').value) || null,
      capaian_halaman: halaman,
      kelancaran: $('thfLancar').value || 'Jayyid',
      musyrif: APP.profil?.nama || null,
      musyrif_id: APP.profil?.id || null,
      catatan: $('thfCatatan').value.trim() || null
    });
    selesaiSimpan(btn, asli, true, hasil.antre ? 'Tersimpan luring' : 'Setoran tersimpan');
    if (hasil.antre) toast('info', 'Tersimpan di perangkat — akan dikirim saat koneksi pulih.');
    else toast('success', 'Setoran tahfiz tercatat.');

    $('thfDari').value = ''; $('thfKe').value = ''; $('thfCatatan').value = '';
    cacheHapus('tahfiz');
    await thfGambarPanel();
    await thfGambarTarget();
  } catch (err) {
    selesaiSimpan(btn, asli, false, 'Gagal menyimpan');
    fireError(err);
  }
}

function thfSaring(rows) {
  let out = rows;
  if (stThf.jenis) out = out.filter(r => r.jenis === stThf.jenis);
  if (stThf.cari) {
    const k = stThf.cari.toLowerCase();
    out = out.filter(r => [r.nama_siswa, r.nisn, r.surah, r.musyrif]
      .some(v => String(v || '').toLowerCase().includes(k)));
  }
  return out;
}

async function thfGambarPanel() {
  if (APP.view !== 'tahfiz') return;
  const [semua, peta] = await Promise.all([muatTahfiz(), petaSiswa()]);
  const lingkup = lingkupTahfiz(semua);
  const rows = thfSaring(lingkup).slice()
    .sort((a, b) => String(kunciTgl(b.tanggal)).localeCompare(String(kunciTgl(a.tanggal))));

  const halaman = lingkup.reduce((a, r) => a + (Number(r.capaian_halaman) || 0), 0);
  const santriUnik = new Set(lingkup.map(r => String(r.nisn))).size;
  const ziyadah = lingkup.filter(r => /ziyadah/i.test(r.jenis || '')).length;
  const mumtaz = lingkup.filter(r => /mumtaz/i.test(r.kelancaran || '')).length;

  $('thfStat').innerHTML =
      stat('Total Setoran', angka(lingkup.length), 'fa-solid fa-book-quran',
        'background:var(--teal-bg);color:var(--teal)', 'var(--teal)', esc(labelPeriode()))
    + stat('Halaman Terkumpul', angka(Math.round(halaman * 10) / 10), 'fa-solid fa-file-lines',
        'background:#E7F1F7;color:var(--sea)', 'var(--sea)', `± ${juzDari(halaman)} juz`)
    + stat('Santri Menyetor', angka(santriUnik), 'fa-solid fa-user-graduate',
        'background:var(--amber-bg);color:var(--amber)', 'var(--amber)', `${ziyadah} setoran ziyadah`)
    + stat('Predikat Mumtaz', angka(mumtaz), 'fa-solid fa-star',
        'background:var(--violet-bg);color:var(--violet)', 'var(--brass)', 'Setoran berpredikat tertinggi');

  const pages = Math.max(1, Math.ceil(rows.length / stThf.size));
  if (stThf.page > pages) stThf.page = pages;
  const from = (stThf.page - 1) * stThf.size;
  const hal = rows.slice(from, from + stThf.size);

  $('thfSub').textContent = `${angka(rows.length)} setoran · ${labelPeriode()}`;
  $('thfBody').innerHTML = hal.map(r => {
    const s = peta[String(r.nisn)] || {};
    const nama = r.nama_siswa || s.nama_siswa || '(tanpa nama)';
    return `<tr>
      <td class="nowrap">${tgl(r.tanggal)}<div class="secondary">${esc(r.musyrif || '-')}</div></td>
      <td><button class="adm-santri" data-detail="${esc(r.nisn)}">
            <span class="av">${esc(String(nama).charAt(0).toUpperCase())}</span>
            <span class="who"><span class="nm">${esc(nama)}</span>
              <span class="secondary">${esc(r.kelas || s.kelas || '-')}</span></span>
          </button></td>
      <td><div class="primary">${esc(r.surah || '-')}${r.ayat_dari
            ? ` : ${r.ayat_dari}${r.ayat_ke ? '–' + r.ayat_ke : ''}` : ''}</div>
        ${r.juz ? `<div class="secondary">Juz ${esc(r.juz)}</div>` : ''}
        ${r.catatan ? `<div class="adm-note">${esc(r.catatan)}</div>` : ''}</td>
      <td class="center num">${Number(r.capaian_halaman) || 0}</td>
      <td><span class="${kelasLancar(r.kelancaran)}">${esc(r.kelancaran || '-')}</span></td>
      <td><span class="tag ${/ziyadah/i.test(r.jenis||'') ? 'tag-ok' : /ujian/i.test(r.jenis||'') ? 'tag-violet' : 'tag-sea'}">${esc(r.jenis || '-')}</span></td>
    </tr>`;
  }).join('') || barisKosong(6, 'Belum ada setoran tahfiz.',
      'Catat setoran pertama lewat panel di samping.');
  $('thfPager').innerHTML = pager('thf', stThf.page, rows.length, stThf.size);

  // ---------- peringkat hafalan ----------
  const board = new Map();
  lingkup.forEach(r => {
    const n = String(r.nisn);
    if (!board.has(n)) board.set(n, { nisn:n, nama: r.nama_siswa || peta[n]?.nama_siswa || n,
      kelas: r.kelas || peta[n]?.kelas || '-', hal:0, jml:0 });
    const o = board.get(n); o.hal += Number(r.capaian_halaman) || 0; o.jml++;
  });
  const top = [...board.values()].sort((a, b) => b.hal - a.hal || b.jml - a.jml).slice(0, 10);
  const puncak = top.length ? top[0].hal : 0;
  $('thfBoard').innerHTML = top.map((t, i) => {
    // Bilah kemajuan relatif terhadap peringkat pertama. Angka saja sulit
    // dirasakan; panjang bilah membuat jarak ke puncak terlihat sekali
    // pandang — dan jarak yang terlihat itulah yang mengundang dikejar.
    const persen = puncak > 0 ? Math.max(4, Math.round(t.hal / puncak * 100)) : 0;
    return `
    <button type="button" class="prs-row" data-detail="${esc(t.nisn)}"
            title="Buka detail ${esc(t.nama)}">
      <span class="prs-medal">${i + 1}</span>
      <span class="prs-who"><b>${esc(t.nama)}</b>
        <span>${esc(t.kelas)} · ${angka(t.jml)} setoran</span>
        <span class="prs-bar"><i style="width:${persen}%"></i></span></span>
      <span class="prs-poin"><b>${Math.round(t.hal * 10) / 10}</b><small>${juzDari(t.hal)} juz</small></span>
    </button>`;
  }).join('') || kosong('Belum ada peringkat.',
      'Papan ini terisi begitu setoran pertama dicatat.', 'fa-ranking-star');

  // ---------- ritme mingguan ----------
  const pekan = {};
  lingkupTahfiz(semua, false).forEach(r => {
    const d = tglDari(kunciTgl(r.tanggal)); if (!d) return;
    const k = kunciTgl(awalPekan(d));
    pekan[k] = (pekan[k] || 0) + (Number(r.capaian_halaman) || 0);
  });
  const kunci = Object.keys(pekan).sort().slice(-8);
  buatChart('thfRitme', 'chThfRitme', {
    type:'bar',
    data:{ labels: kunci.map(labelPekan),
      datasets:[{ label:'Halaman', data: kunci.map(k => Math.round(pekan[k] * 10) / 10),
        backgroundColor:'#0F766E', borderRadius:6, maxBarThickness:34 }] },
    options:{ responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{ display:false } },
      scales:{ y:{ beginAtZero:true, grid:{ color:'#EEF3F7' } }, x:{ grid:{ display:false } } } }
  });

  tandaiTabelBisaGeser();
}

async function thfGambarTarget() {
  const box = $('thfTargetBox'); if (!box) return;
  if (!stThf.nisn) {
    box.innerHTML = kosong('Belum ada santri dipilih.',
      'Ketik nama santri di atas untuk melihat capaian dan targetnya.', 'fa-bullseye');
    return;
  }
  const [semua, targets] = await Promise.all([muatTahfiz(), muatTargetTahfiz()]);
  const p = batasPeriode();
  const periode = p ? p.bulan : bulanIni();
  const milik = (semua || []).filter(aktifTahfiz).filter(r => String(r.nisn) === stThf.nisn);
  const bulanan = milik.filter(r => bulanDari(kunciTgl(r.tanggal)) === periode);
  const halBulan = bulanan.reduce((a, r) => a + (Number(r.capaian_halaman) || 0), 0);
  const halTotal = milik.reduce((a, r) => a + (Number(r.capaian_halaman) || 0), 0);
  const t = (targets || []).find(x => String(x.nisn) === stThf.nisn && String(x.periode) === periode);
  const target = Number(t?.target_halaman) || 0;
  const pct = target > 0 ? Math.min(100, Math.round(halBulan / target * 100)) : 0;
  const bolehTarget = bisa('tahfiz.target') && !hanyaBaca();

  box.innerHTML = `
    <div class="thf-target">
      <div class="thf-ring" style="--pct:${pct}">
        <div class="isi"><b>${pct}%</b><small>Target</small></div>
      </div>
      <div class="ket">
        <b>${esc(stThf.namaPilih || stThf.nisn)}</b>
        <p>Periode <b>${esc(periode)}</b> · tercapai
           <b>${Math.round(halBulan * 10) / 10}</b> dari
           <b>${target || '—'}</b> halaman.</p>
        <p style="margin-top:4px">Akumulasi seluruh riwayat:
           <b>${Math.round(halTotal * 10) / 10}</b> halaman (± ${juzDari(halTotal)} juz).</p>
        ${bolehTarget ? `<button class="btn btn-ghost btn-sm" data-thf-target="${esc(stThf.nisn)}"
            style="margin-top:10px"><i class="fa-solid fa-bullseye"></i>
            ${target ? 'Ubah target' : 'Tetapkan target'}</button>` : ''}
      </div>
    </div>
    <div class="thf-grid">
      <div class="thf-kartu"><small>Ziyadah</small>
        <b>${bulanan.filter(r => /ziyadah/i.test(r.jenis||'')).length}</b>
        <span class="kaki">setoran hafalan baru</span></div>
      <div class="thf-kartu"><small>Murajaah</small>
        <b>${bulanan.filter(r => /muraja/i.test(r.jenis||'')).length}</b>
        <span class="kaki">pengulangan</span></div>
      <div class="thf-kartu"><small>Juz bulan ini</small>
        <b>${juzDari(halBulan)}</b><span class="kaki">± dari halaman</span></div>
    </div>`;
}

async function thfModalTarget(nisn) {
  const p = batasPeriode();
  const periode = p ? p.bulan : bulanIni();
  const targets = await muatTargetTahfiz();
  const t = (targets || []).find(x => String(x.nisn) === String(nisn) && String(x.periode) === periode);

  const r = await Swal.fire({
    title:'Target hafalan bulanan',
    html:`<div class="stack">
      <div class="ctx-note"><i class="fa-solid fa-circle-info"></i>
        Periode ${esc(periode)} · ${esc(stThf.namaPilih || nisn)}</div>
      <div class="field">
        <label class="label">Target halaman</label>
        <input id="swTarget" type="number" min="1" step="0.5" class="input mono"
          value="${Number(t?.target_halaman) || 20}">
        <p class="hint">Setara ± ${juzDari(Number(t?.target_halaman) || 20)} juz per bulan.</p>
      </div>
      <div class="field">
        <label class="label">Catatan (opsional)</label>
        <textarea id="swTargetNote" class="input" rows="2">${esc(t?.catatan || '')}</textarea>
      </div>
    </div>`,
    showCancelButton:true, confirmButtonText:'Simpan target',
    cancelButtonText:'Batal', confirmButtonColor:'#14618B',
    preConfirm: () => {
      const v = Number(document.getElementById('swTarget').value);
      if (!v || v <= 0) { Swal.showValidationMessage('Target harus lebih dari nol.'); return false; }
      return { target: v, catatan: document.getElementById('swTargetNote').value.trim() };
    }
  });
  if (!r.isConfirmed) return;

  try {
    const { error } = await db.from('target_tahfiz').upsert({
      nisn: String(nisn), periode,
      target_halaman: r.value.target,
      catatan: r.value.catatan || null,
      dibuat_oleh: APP.profil?.nama || null,
      dibuat_oleh_id: APP.profil?.id || null
    }, { onConflict: 'nisn,periode' });
    if (error) throw error;
    cacheHapus('targetTahfiz');
    toast('success', 'Target hafalan disimpan.');
    await thfGambarTarget();
  } catch (err) { fireError(err); }
}

function thfEksporCsv() {
  muatTahfiz().then(all => {
    const rows = thfSaring(lingkupTahfiz(all));
    if (!rows.length) return toast('error', 'Tidak ada data untuk diekspor.');
    unduhCsv(`tahfiz-${berkasPeriode()}.csv`, [
      ['Tanggal','NISN','Nama','Kelas','Jenis','Surah','Ayat Dari','Ayat Ke','Juz','Halaman','Kelancaran','Musyrif','Catatan'],
      ...rows.map(r => [kunciTgl(r.tanggal), r.nisn, r.nama_siswa, r.kelas, r.jenis, r.surah,
        r.ayat_dari, r.ayat_ke, r.juz, r.capaian_halaman, r.kelancaran, r.musyrif, r.catatan])
    ]);
  });
}


// =====================================================================
// 34. JEJAK AUDIT  (fitur 5)
//     Ditulis oleh trigger SECURITY DEFINER di database, jadi tidak bisa
//     dipalsukan atau dihapus dari aplikasi. Halaman ini hanya membaca.
// =====================================================================
const stAud = { page:1, size:25, cari:'', tabel:'', aksi:'', dari:'', sampai:'', rows:null };

const TABEL_AUDIT = ['log_pelanggaran','log_pembinaan','log_perizinan','log_prestasi',
  'log_tahfiz','goal_santri','target_tahfiz','master_pelanggaran','master_prestasi',
  'master_pembinaan','master_bidang','data_presensi','siswa','profiles'];

async function viewAudit() {
  if (!bisa('audit.lihat')) { toast('error','Tidak memiliki akses.'); return navigateTo(rumah()); }

  $('viewRoot').innerHTML = `
    <section class="aud-head">
      <div>
        <div class="eyebrow"><span class="ar">سجل التغييرات</span><span class="rule"></span>
          <span class="lat">Akuntabilitas</span></div>
        <h2>Setiap catatan adalah amanah.</h2>
        <p>Seluruh penambahan, perubahan, dan penghapusan data tercatat lengkap dengan
           pelakunya. Jejak ini ditulis langsung oleh database — aplikasi hanya boleh
           membacanya, tidak bisa mengubah atau menghapusnya.</p>
      </div>
      <div class="adm-actions">
        <button class="btn btn-onnavy" id="audMuat"><i class="fa-solid fa-rotate"></i>Muat Ulang</button>
        <button class="btn btn-brass" id="audCsv"><i class="fa-solid fa-file-csv"></i>Ekspor CSV</button>
      </div>
    </section>

    <div class="stats" id="audStat"></div>

    <section class="card">
      <div class="card-head">
        <div><h3>Riwayat Perubahan</h3><p class="sub" id="audSub">Memuat…</p></div>
      </div>
      <div class="filters adm-filters">
        <input id="audCari" class="input grow" placeholder="Cari pelaku, NISN, atau ringkasan…">
        <select id="audFTabel" class="input">
          <option value="">Semua tabel</option>
          ${TABEL_AUDIT.map(t => `<option>${t}</option>`).join('')}
        </select>
        <select id="audFAksi" class="input">
          <option value="">Semua aksi</option>
          <option>INSERT</option><option>UPDATE</option><option>DELETE</option>
        </select>
        <input id="audDari" type="date" class="input" title="Dari tanggal">
        <input id="audSampai" type="date" class="input" title="Sampai tanggal">
        <span class="sep"></span>
        <button class="btn btn-ghost btn-sm" id="audReset"><i class="fa-solid fa-rotate-left"></i>Reset</button>
      </div>
      <div class="tbl"><table class="adm-tbl aud-tbl">
        <thead><tr><th>Waktu</th><th>Pelaku</th><th>Tabel</th><th>Aksi</th>
          <th>Ringkasan</th><th class="right">Rincian</th></tr></thead>
        <tbody id="audBody"><tr><td colspan="6" style="padding:26px;text-align:center;color:var(--text-3)">Memuat…</td></tr></tbody>
      </table></div>
      <div class="scroll-hint"><i class="fa-solid fa-arrows-left-right"></i>Geser ke samping untuk kolom lainnya.</div>
      <div id="audPager"></div>
    </section>`;

  $('audCari').addEventListener('input', debounce(e => {
    stAud.cari = e.target.value.trim(); stAud.page = 1; audGambar();
  }, 260));
  $('audFTabel').addEventListener('change', e => { stAud.tabel = e.target.value; stAud.page = 1; audGambar(); });
  $('audFAksi').addEventListener('change', e => { stAud.aksi = e.target.value; stAud.page = 1; audGambar(); });
  $('audDari').addEventListener('change', e => { stAud.dari = e.target.value; stAud.page = 1; audGambar(); });
  $('audSampai').addEventListener('change', e => { stAud.sampai = e.target.value; stAud.page = 1; audGambar(); });
  $('audReset').addEventListener('click', () => {
    Object.assign(stAud, { page:1, cari:'', tabel:'', aksi:'', dari:'', sampai:'' });
    ['audCari','audFTabel','audFAksi','audDari','audSampai'].forEach(id => { $(id).value = ''; });
    audGambar();
  });
  $('audMuat').addEventListener('click', async () => { stAud.rows = null; await audMuat(); await audGambar(); });
  $('audCsv').addEventListener('click', audEksporCsv);

  onKlik((e) => {
    const d = e.target.closest('[data-aud]');
    if (d) return audModalRincian(d.dataset.aud);
    const p = e.target.closest('[data-pg]');
    if (p && p.dataset.pg.startsWith('aud:')) {
      stAud.page = Number(p.dataset.pg.split(':')[1]); audGambar();
    }
  });

  await audMuat();
  await audGambar();
}

async function audMuat() {
  if (stAud.rows) return stAud.rows;
  stAud.rows = await amanKosong(async () => {
    const { data, error } = await db.from('audit_log').select('*')
      .order('waktu', { ascending:false }).limit(3000);
    if (error) throw error;
    return data || [];
  }, 'audit_log');
  return stAud.rows;
}

function audSaring(rows) {
  let out = rows || [];
  if (stAud.tabel) out = out.filter(r => r.tabel === stAud.tabel);
  if (stAud.aksi)  out = out.filter(r => r.aksi === stAud.aksi);
  if (stAud.dari)   out = out.filter(r => kunciTgl(r.waktu) >= stAud.dari);
  if (stAud.sampai) out = out.filter(r => kunciTgl(r.waktu) <= stAud.sampai);
  if (stAud.cari) {
    const k = stAud.cari.toLowerCase();
    out = out.filter(r => [r.user_nama, r.user_role, r.nisn, r.ringkas, r.tabel, r.baris_id]
      .some(v => String(v || '').toLowerCase().includes(k)));
  }
  return out;
}

async function audGambar() {
  if (APP.view !== 'audit') return;
  const semua = await audMuat();
  const rows = audSaring(semua);

  const hariIniKunci = hariIni();
  const hariIniJml = semua.filter(r => kunciTgl(r.waktu) === hariIniKunci).length;
  const pelaku = new Set(semua.map(r => r.user_nama).filter(Boolean)).size;
  const hapus = semua.filter(r => r.aksi === 'DELETE').length;

  $('audStat').innerHTML =
      stat('Jejak Tercatat', angka(semua.length), 'fa-solid fa-fingerprint',
        'background:#E7F1F7;color:var(--sea)', 'var(--sea)', 'Maksimum 3.000 terbaru')
    + stat('Perubahan Hari Ini', angka(hariIniJml), 'fa-solid fa-bolt',
        'background:var(--teal-bg);color:var(--teal)', 'var(--teal)', tgl(hariIniKunci))
    + stat('Pelaku Berbeda', angka(pelaku), 'fa-solid fa-user-shield',
        'background:var(--amber-bg);color:var(--amber)', 'var(--amber)', 'Akun yang pernah mengubah data')
    + stat('Penghapusan', angka(hapus), 'fa-solid fa-trash-can',
        'background:var(--maroon-bg);color:var(--maroon)', 'var(--maroon)', 'Perlu perhatian khusus');

  const pages = Math.max(1, Math.ceil(rows.length / stAud.size));
  if (stAud.page > pages) stAud.page = pages;
  const from = (stAud.page - 1) * stAud.size;
  const hal = rows.slice(from, from + stAud.size);

  $('audSub').textContent = `${angka(rows.length)} jejak ditampilkan`;
  $('audBody').innerHTML = hal.map(r => `
    <tr>
      <td class="aud-waktu">${waktuAudit(r.waktu)}</td>
      <td><div class="aud-user">
        <span class="av">${esc(String(r.user_nama || '?').charAt(0).toUpperCase())}</span>
        <span class="who"><b>${esc(r.user_nama || '(sistem)')}</b>
          <span>${esc(r.user_role || '-')}</span></span>
      </div></td>
      <td class="aud-tabel">${esc(r.tabel)}${r.nisn ? `<div class="secondary">NISN ${esc(r.nisn)}</div>` : ''}</td>
      <td><span class="aud-aksi ${esc(r.aksi)}">${esc(r.aksi)}</span></td>
      <td><div class="aud-ring">${esc(r.ringkas || '—')}</div></td>
      <td class="right"><button class="btn-link" data-aud="${r.id}">
        <i class="fa-solid fa-code"></i> Lihat</button></td>
    </tr>`).join('') || barisKosong(6, 'Belum ada jejak yang cocok.',
      'Jejak muncul otomatis setelah SQL_FITUR_BARU.sql dijalankan.');
  $('audPager').innerHTML = pager('aud', stAud.page, rows.length, stAud.size);
  tandaiTabelBisaGeser();
}

function waktuAudit(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return String(iso || '-');
  return d.toLocaleString('id-ID', { day:'2-digit', month:'short', year:'2-digit',
    hour:'2-digit', minute:'2-digit' });
}

/** Rincian perubahan: kolom yang berubah ditandai. */
async function audModalRincian(id) {
  const r = (await audMuat()).find(x => String(x.id) === String(id));
  if (!r) return;
  const lama = r.data_lama || {}, baru = r.data_baru || {};
  const kunci = [...new Set([...Object.keys(lama), ...Object.keys(baru)])].sort();
  const beda = (k) => JSON.stringify(lama[k]) !== JSON.stringify(baru[k]);
  const nilai = (v) => v === null || v === undefined ? '—'
    : typeof v === 'object' ? JSON.stringify(v) : String(v);

  const kolom = (obj, sisi) => kunci.map(k =>
    `<div${beda(k) ? ' class="ubah"' : ''}>${esc(k)}: ${esc(nilai(obj[k]))}</div>`).join('');

  await Swal.fire({
    width: 860, showConfirmButton:false, showCloseButton:true,
    title: `${r.aksi} · ${r.tabel}`,
    html: `<div style="text-align:left">
      <div class="ctx-note" style="margin-bottom:14px">
        <i class="fa-solid fa-user-shield"></i>
        ${esc(r.user_nama || '(sistem)')} · ${esc(r.user_role || '-')} · ${waktuAudit(r.waktu)}
        ${r.nisn ? ` · NISN ${esc(r.nisn)}` : ''}
      </div>
      <div class="aud-diff">
        <section><h5>Sebelum</h5><div class="isi">${
          r.data_lama ? kolom(lama, 'lama') : '<i>(baris baru — tidak ada data sebelumnya)</i>'}</div></section>
        <section><h5>Sesudah</h5><div class="isi">${
          r.data_baru ? kolom(baru, 'baru') : '<i>(baris dihapus)</i>'}</div></section>
      </div>
      <p class="hint" style="margin-top:12px">Baris bertanda kuning adalah kolom yang berubah.</p>
    </div>`
  });
}

function audEksporCsv() {
  const rows = audSaring(stAud.rows || []);
  if (!rows.length) return toast('error', 'Tidak ada data untuk diekspor.');
  unduhCsv(`jejak-audit-${hariIni()}.csv`, [
    ['Waktu','Pelaku','Peran','Tabel','Aksi','ID Baris','NISN','Ringkasan'],
    ...rows.map(r => [r.waktu, r.user_nama, r.user_role, r.tabel, r.aksi, r.baris_id, r.nisn, r.ringkas])
  ]);
}

// =====================================================================
// 35. TARGET PEMBINAAN PER SANTRI  (fitur 7 — loop tertutup)
// =====================================================================
const kelasGoal = (s) => {
  const t = String(s || '').toLowerCase();
  if (t.includes('tercapai') && !t.includes('belum')) return 'st-tercapai';
  if (t.includes('sebagian')) return 'st-sebagian';
  if (t.includes('belum') || t.includes('batal')) return 'st-belum';
  return 'st-berjalan';
};

async function muatGoalSantri(nisn) {
  return amanKosong(async () => {
    const { data, error } = await db.from('goal_santri').select('*')
      .eq('nisn', String(nisn)).order('periode', { ascending:false });
    if (error) throw error;
    return data || [];
  }, 'goal santri');
}

function goalPanelHTML(list, nisn) {
  const p = batasPeriode();
  const periode = p ? p.bulan : bulanIni();
  const lalu = bulanSebelum(periode);
  const kini = (list || []).filter(g => String(g.periode) === periode);
  const sebelum = (list || []).filter(g => String(g.periode) === lalu);
  const bolehTulis = bisa('goal.tulis') && !hanyaBaca();

  const kartu = (g) => `
    <div class="goal ${kelasGoal(g.status)}">
      <div class="atas">
        <b>${esc(g.judul)}</b>
        <span class="tag ${/tercapai/i.test(g.status||'') && !/belum/i.test(g.status||'') ? 'tag-ok'
          : /sebagian/i.test(g.status||'') ? 'tag-sedang'
          : /belum|batal/i.test(g.status||'') ? 'tag-berat' : 'tag-sea'}">${esc(g.status || 'Berjalan')}</span>
      </div>
      ${g.indikator ? `<p class="ind">${esc(g.indikator)}</p>` : ''}
      ${g.evaluasi ? `<div class="eval"><b>Evaluasi:</b> ${esc(g.evaluasi)}
        ${g.dievaluasi_oleh ? `<span style="color:var(--text-3)"> — ${esc(g.dievaluasi_oleh)}</span>` : ''}</div>` : ''}
      <div class="kaki">
        <span class="per"><i class="fa-regular fa-calendar"></i> ${esc(g.periode)}</span>
        ${g.bidang ? `<span>· ${esc(g.bidang)}</span>` : ''}
        ${g.dibuat_oleh ? `<span>· ${esc(g.dibuat_oleh)}</span>` : ''}
        ${bolehTulis ? `<button class="btn-link" data-goal-eval="${g.id}" style="margin-left:auto">
          <i class="fa-solid fa-clipboard-check"></i> Evaluasi</button>` : ''}
      </div>
    </div>`;

  return `
    <div class="tren-wrap" style="margin-top:16px">
      <div class="tren-head">
        <div><b>Target Pembinaan</b>
          <small>Periode berjalan ${esc(periode)} · evaluasi periode ${esc(lalu)}</small></div>
        ${bolehTulis ? `<button class="btn btn-ghost btn-sm" data-goal-baru="${esc(nisn)}">
          <i class="fa-solid fa-plus"></i>Target baru</button>` : ''}
      </div>
      <div style="padding:14px 15px">
        ${sebelum.length ? `<p class="label" style="margin-bottom:8px">Periode sebelumnya</p>
          <div class="goal-list" style="margin-bottom:14px">${sebelum.map(kartu).join('')}</div>` : ''}
        <p class="label" style="margin-bottom:8px">Periode berjalan</p>
        <div class="goal-list">${kini.map(kartu).join('')
          || `<div class="goal-kosong">Belum ada target untuk periode ini.
              ${bolehTulis ? 'Tetapkan satu target yang spesifik dan terukur.' : ''}</div>`}</div>
      </div>
    </div>`;
}

async function modalGoalBaru(nisn) {
  const p = batasPeriode();
  const periode = p ? p.bulan : bulanIni();
  const r = await Swal.fire({
    title:'Target pembinaan baru',
    html:`<div class="stack">
      <div class="ctx-note"><i class="fa-solid fa-bullseye"></i>
        Periode ${esc(periode)} · target akan dievaluasi bulan berikutnya.</div>
      <div class="field">
        <label class="label">Target (spesifik &amp; terukur)</label>
        <input id="swGoalJudul" class="input" placeholder="Misal: hadir shalat subuh berjamaah tanpa terlambat">
      </div>
      <div class="field">
        <label class="label">Indikator keberhasilan</label>
        <textarea id="swGoalInd" class="input" rows="2"
          placeholder="Misal: tidak ada catatan keterlambatan subuh selama 4 pekan"></textarea>
      </div>
      <div class="duo">
        <div class="field">
          <label class="label">Bidang</label>
          <input id="swGoalBidang" class="input" placeholder="Ubudiyah / Bahasa / Kebersihan…">
        </div>
        <div class="field">
          <label class="label">Prioritas</label>
          <select id="swGoalPrio" class="input">
            <option>Tinggi</option><option selected>Sedang</option><option>Rendah</option>
          </select>
        </div>
      </div>
    </div>`,
    showCancelButton:true, confirmButtonText:'Simpan target',
    cancelButtonText:'Batal', confirmButtonColor:'#14618B',
    preConfirm: () => {
      const j = document.getElementById('swGoalJudul').value.trim();
      if (!j) { Swal.showValidationMessage('Target belum diisi.'); return false; }
      return { judul:j,
        indikator: document.getElementById('swGoalInd').value.trim(),
        bidang: document.getElementById('swGoalBidang').value.trim(),
        prioritas: document.getElementById('swGoalPrio').value };
    }
  });
  if (!r.isConfirmed) return null;

  const hasil = await simpanAman('goal_santri', {
    nisn: String(nisn), periode,
    judul: r.value.judul,
    indikator: r.value.indikator || null,
    bidang: r.value.bidang || null,
    prioritas: r.value.prioritas,
    status: 'Berjalan',
    dibuat_oleh: APP.profil?.nama || null,
    dibuat_oleh_id: APP.profil?.id || null
  });
  toast(hasil.antre ? 'info' : 'success',
    hasil.antre ? 'Target disimpan luring — menunggu koneksi.' : 'Target pembinaan tersimpan.');
  return true;
}

async function modalGoalEvaluasi(id) {
  const { data: g } = await db.from('goal_santri').select('*').eq('id', id).single();
  if (!g) return;
  const r = await Swal.fire({
    title:'Evaluasi target',
    html:`<div class="stack">
      <div class="ctx-note"><i class="fa-solid fa-flag-checkered"></i>${esc(g.judul)}</div>
      <div class="field">
        <label class="label">Status akhir</label>
        <select id="swEvStatus" class="input">
          ${['Berjalan','Tercapai','Sebagian','Belum Tercapai','Dibatalkan']
            .map(s => `<option${s === g.status ? ' selected' : ''}>${s}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label class="label">Catatan evaluasi</label>
        <textarea id="swEvNote" class="input" rows="3"
          placeholder="Apa yang berubah, apa yang belum, dan apa langkah berikutnya…">${esc(g.evaluasi || '')}</textarea>
      </div>
    </div>`,
    showCancelButton:true, confirmButtonText:'Simpan evaluasi',
    cancelButtonText:'Batal', confirmButtonColor:'#0F766E',
    preConfirm: () => ({
      status: document.getElementById('swEvStatus').value,
      evaluasi: document.getElementById('swEvNote').value.trim()
    })
  });
  if (!r.isConfirmed) return null;

  try {
    const { error } = await db.from('goal_santri').update({
      status: r.value.status,
      evaluasi: r.value.evaluasi || null,
      dievaluasi_oleh: APP.profil?.nama || null,
      dievaluasi_oleh_id: APP.profil?.id || null,
      tanggal_evaluasi: hariIni()
    }).eq('id', id);
    if (error) throw error;
    toast('success', 'Evaluasi tersimpan.');
    return true;
  } catch (err) { fireError(err); return null; }
}

// =====================================================================
// 36. GRAFIK TREN PER SANTRI  (fitur 6)
//     Sengaja HANYA tampil di layar (detail santri). Lembar cetak &
//     PDF tidak memuat grafik ini — sesuai permintaan.
// =====================================================================
async function dataTrenSantri(nisn, jumlahBulan = 6) {
  const kini = new Date();
  const bulan = [];
  for (let i = jumlahBulan - 1; i >= 0; i--) {
    const d = new Date(kini.getFullYear(), kini.getMonth() - i, 1);
    bulan.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  const kosongPeta = () => Object.fromEntries(bulan.map(b => [b, 0]));
  const poin = kosongPeta(), apres = kosongPeta(), hafal = kosongPeta();

  const [detail, prestasi, tahfiz] = await Promise.all([
    muatDetail().catch(() => []),
    muatPrestasi().catch(() => []),
    muatTahfiz().catch(() => [])
  ]);

  (detail || []).filter(aktifDetail)
    .filter(r => String(r.nisn) === String(nisn))
    .forEach(r => {
      const b = bulanDari(kunciTgl(r.tanggal));
      if (b in poin) poin[b] += Number(r.bobot_pelanggaran) || 0;
    });
  (prestasi || []).filter(aktifPrestasi)
    .filter(r => String(r.nisn) === String(nisn))
    .forEach(r => {
      const b = bulanDari(kunciTgl(r.tanggal));
      if (b in apres) apres[b] += Number(r.poin) || 0;
    });
  (tahfiz || []).filter(aktifTahfiz)
    .filter(r => String(r.nisn) === String(nisn))
    .forEach(r => {
      const b = bulanDari(kunciTgl(r.tanggal));
      if (b in hafal) hafal[b] += Number(r.capaian_halaman) || 0;
    });

  const label = bulan.map(b => {
    const [th, bl] = b.split('-').map(Number);
    return `${['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'][bl - 1]} ${String(th).slice(2)}`;
  });
  const net = bulan.map(b => Math.max(0, poin[b] - apres[b]));
  return {
    bulan, label,
    poin: bulan.map(b => poin[b]),
    apresiasi: bulan.map(b => apres[b]),
    hafalan: bulan.map(b => Math.round(hafal[b] * 10) / 10),
    net,
    adaData: bulan.some(b => poin[b] || apres[b] || hafal[b])
  };
}

function trenPanelHTML() {
  return `
    <div class="tren-wrap">
      <div class="tren-head">
        <div><b>Tren 6 Bulan Terakhir</b>
          <small>Tampilan layar saja — tidak ikut tercetak pada laporan.</small></div>
        <div class="tren-legend">
          <span><i style="background:#9F1239"></i>Poin pelanggaran</span>
          <span><i style="background:#C9A227"></i>Poin apresiasi</span>
          <span><i style="background:#0F766E"></i>Halaman hafalan</span>
        </div>
      </div>
      <div class="tren-box"><canvas id="chTrenSantri"></canvas></div>
      <div class="tren-mini" id="trenMini"></div>
    </div>`;
}

async function gambarTrenSantri(nisn) {
  const t = await dataTrenSantri(nisn, 6);
  const box = document.getElementById('chTrenSantri');
  if (!box) return;

  if (!t.adaData) {
    box.closest('.tren-box').innerHTML =
      '<div class="tren-kosong">Belum ada data yang cukup untuk menggambar tren.</div>';
  } else {
    buatChart('trenSantri', 'chTrenSantri', {
      data: {
        labels: t.label,
        datasets: [
          { type:'bar', label:'Poin pelanggaran', data:t.poin,
            backgroundColor:'#9F1239', borderRadius:5, maxBarThickness:22, order:2 },
          { type:'bar', label:'Poin apresiasi', data:t.apresiasi,
            backgroundColor:'#C9A227', borderRadius:5, maxBarThickness:22, order:2 },
          { type:'line', label:'Skor net', data:t.net,
            borderColor:'#0B2B45', backgroundColor:'#0B2B45', borderWidth:2,
            tension:.35, pointRadius:3, order:1 },
          { type:'line', label:'Halaman hafalan', data:t.hafalan, yAxisID:'y2',
            borderColor:'#0F766E', backgroundColor:'#0F766E', borderWidth:2,
            borderDash:[5,4], tension:.35, pointRadius:3, order:1 }
        ]
      },
      options: {
        responsive:true, maintainAspectRatio:false,
        interaction:{ mode:'index', intersect:false },
        plugins:{ legend:{ display:false } },
        scales:{
          y:{ beginAtZero:true, grid:{ color:'#EEF3F7' }, title:{ display:false } },
          y2:{ beginAtZero:true, position:'right', grid:{ display:false } },
          x:{ grid:{ display:false } }
        }
      }
    });
  }

  const n = t.bulan.length - 1;
  const arah = (arr) => {
    const a = arr[n], b = arr[n - 1] ?? 0;
    if (a === b) return 'datar';
    return a > b ? 'naik' : 'turun';
  };
  const mini = document.getElementById('trenMini');
  if (mini) mini.innerHTML = `
    <div><small>Poin bulan ini</small><b style="color:var(--maroon)">${t.poin[n]}</b>
      <span class="hint">${arah(t.poin)} dari bulan lalu</span></div>
    <div><small>Apresiasi</small><b style="color:#8A6D0B">+${t.apresiasi[n]}</b>
      <span class="hint">${arah(t.apresiasi)} dari bulan lalu</span></div>
    <div><small>Skor net</small><b>${t.net[n]}</b>
      <span class="hint">${arah(t.net)} dari bulan lalu</span></div>
    <div><small>Hafalan</small><b style="color:var(--teal)">${t.hafalan[n]}</b>
      <span class="hint">halaman bulan ini</span></div>`;
}




// =====================================================================
// 37. MASTER PRESTASI — katalog apresiasi (menyatu di menu Master & Bidang)
// =====================================================================
function kartuBrankasPrestasi(list) {
  const rows = (list || []);
  const n = (k) => rows.filter(m => m.kategori === k).length;
  const poin = rows.reduce((a, m) => a + (Number(m.bobot_poin) || 0), 0);
  return `
    <button class="brankas alt" type="button">
      ${isAdmin() ? `<span class="brk-add" id="brkAddPrestasi" role="button">
        <i class="fa-solid fa-plus"></i>Tambah</span>` : ''}
      <div class="brk-top">
        <div class="brk-ico" style="background:linear-gradient(150deg,#E8CC6B,#8A6D0B);color:#2A2003">
          <i class="fa-solid fa-award"></i></div>
        <div>
          <div class="eyebrow"><span class="ar">دليل الإنجازات</span><span class="rule"></span>
            <span class="lat">Katalog</span></div>
          <span class="brk-nm">Master Prestasi</span>
        </div>
      </div>
      <p class="brk-sub">Daftar bentuk apresiasi beserta bobot poin positifnya.</p>
      <div class="brk-angka"><span class="brk-v">${angka(rows.length)}</span>
        <span class="brk-k">Jenis apresiasi</span></div>
      <div class="brk-chips">
        <span class="tag tag-emas">Emas ${n('Emas')}</span>
        <span class="tag tag-sea">Perak ${n('Perak')}</span>
        <span class="tag tag-ok">Perunggu ${n('Perunggu')}</span>
        <span class="tag tag-off">${angka(poin)} total poin</span>
      </div>
      <span class="brk-go">Buka daftar lengkap
        <i class="fa-solid fa-arrow-right brk-arrow"></i></span>
    </button>`;
}

const stDftPrs = { cari:'', kategori:'' };

async function bukaDaftarPrestasi() {
  const semua = await muatMasterPrestasi();
  const gambar = () => {
    let rows = semua;
    if (stDftPrs.kategori) rows = rows.filter(m => m.kategori === stDftPrs.kategori);
    if (stDftPrs.cari) {
      const k = stDftPrs.cari.toLowerCase();
      rows = rows.filter(m => [m.kode_prestasi, m.nama_prestasi, m.bidang]
        .some(v => String(v || '').toLowerCase().includes(k)));
    }
    rows = rows.slice().sort((a, b) =>
      (URUT_PRESTASI[a.kategori] ?? 9) - (URUT_PRESTASI[b.kategori] ?? 9) ||
      String(a.kode_prestasi).localeCompare(String(b.kode_prestasi)));

    const body = document.getElementById('dftPrsBody');
    if (!body) return;
    body.innerHTML = rows.map(m => `
      <tr>
        <td class="mono">${esc(m.kode_prestasi)}</td>
        <td><div class="primary">${esc(m.nama_prestasi)}</div>
          ${m.keterangan ? `<div class="secondary">${esc(m.keterangan)}</div>` : ''}</td>
        <td><span class="tag ${tagPrestasi(m.kategori)}">${esc(m.kategori)}</span></td>
        <td>${esc(m.bidang || '-')}</td>
        <td class="center num" style="color:#8A6D0B">+${Number(m.bobot_poin) || 0}</td>
        <td class="center">${m.aktif === false
          ? '<span class="tag tag-off">Nonaktif</span>' : '<span class="tag tag-ok">Aktif</span>'}</td>
        <td class="right">${isAdmin()
          ? `<button class="btn-link" data-prs-edit="${esc(m.kode_prestasi)}">
               <i class="fa-solid fa-pen-to-square"></i> Ubah</button>` : '—'}</td>
      </tr>`).join('') || barisKosong(7, 'Tidak ada jenis apresiasi yang cocok.', 'Ubah kata kunci atau filter.');
    const info = document.getElementById('dftPrsInfo');
    if (info) info.textContent = `${rows.length} dari ${semua.length} jenis`;
  };

  await Swal.fire({
    width: 1040, showConfirmButton:false, showCloseButton:true,
    customClass: { popup:'dft-popup' },
    title: 'Master Prestasi',
    html: `<div class="dft">
      <div class="dft-bar">
        <input id="dftPrsCari" class="input grow" placeholder="Cari kode, nama, atau bidang…">
        <select id="dftPrsKat" class="input">
          <option value="">Semua kategori</option>
          ${KAT_PRESTASI.map(k => `<option>${k}</option>`).join('')}
        </select>
        ${isAdmin() ? `<button class="btn btn-brass btn-sm" id="dftPrsTambah">
          <i class="fa-solid fa-plus"></i>Tambah</button>` : ''}
      </div>
      <div class="dft-chips">
        <span class="dft-note" id="dftPrsInfo"><i class="fa-solid fa-circle-info"></i></span>
      </div>
      <div class="dft-wrap"><table class="dft-tbl">
        <thead><tr><th>Kode</th><th>Nama Apresiasi</th><th>Kategori</th><th>Bidang</th>
          <th class="center">Poin</th><th class="center">Status</th><th class="right">Aksi</th></tr></thead>
        <tbody id="dftPrsBody"></tbody>
      </table></div>
    </div>`,
    didOpen: () => {
      gambar();
      document.getElementById('dftPrsCari').addEventListener('input',
        debounce(e => { stDftPrs.cari = e.target.value.trim(); gambar(); }, 200));
      document.getElementById('dftPrsKat').addEventListener('change',
        e => { stDftPrs.kategori = e.target.value; gambar(); });
      document.getElementById('dftPrsTambah')?.addEventListener('click', () => {
        Swal.close(); setTimeout(() => modalMasterPrestasi(null), 200);
      });
      Swal.getHtmlContainer().addEventListener('click', (e) => {
        const b = e.target.closest('[data-prs-edit]'); if (!b) return;
        const m = semua.find(x => x.kode_prestasi === b.dataset.prsEdit);
        Swal.close(); setTimeout(() => modalMasterPrestasi(m), 200);
      });
    }
  });
}

async function modalMasterPrestasi(existing) {
  if (!isAdmin()) return toast('error', 'Hanya Admin yang dapat mengubah master.');
  const m = existing || {};
  const r = await Swal.fire({
    title: existing ? 'Ubah jenis apresiasi' : 'Jenis apresiasi baru',
    width: 640,
    html: `<div class="stack">
      <div class="duo">
        <div class="field"><label class="label">Kode</label>
          <input id="mpKode" class="input mono" value="${esc(m.kode_prestasi || '')}"
            ${existing ? 'readonly' : 'placeholder="A106"'}></div>
        <div class="field"><label class="label">Kategori</label>
          <select id="mpKat" class="input">
            ${KAT_PRESTASI.map(k => `<option${k === (m.kategori || 'Perunggu') ? ' selected' : ''}>${k}</option>`).join('')}
          </select></div>
      </div>
      <div class="field"><label class="label">Nama apresiasi</label>
        <input id="mpNama" class="input" value="${esc(m.nama_prestasi || '')}"
          placeholder="Misal: Menjadi imam shalat berjamaah sepekan penuh"></div>
      <div class="duo">
        <div class="field"><label class="label">Bidang</label>
          <input id="mpBidang" class="input" value="${esc(m.bidang || '')}"
            placeholder="Ubudiyah / Akademik / Tahfiz…"></div>
        <div class="field"><label class="label">Bobot poin (positif)</label>
          <input id="mpPoin" type="number" min="1" max="100" class="input mono"
            value="${Number(m.bobot_poin) || 5}"></div>
      </div>
      <div class="field"><label class="label">Keterangan</label>
        <textarea id="mpKet" class="input" rows="2">${esc(m.keterangan || '')}</textarea></div>
      <div class="field">
        <label class="label">Status</label>
        <select id="mpAktif" class="input">
          <option value="true"${m.aktif !== false ? ' selected' : ''}>Aktif</option>
          <option value="false"${m.aktif === false ? ' selected' : ''}>Nonaktif</option>
        </select>
      </div>
    </div>`,
    showCancelButton:true, confirmButtonText:'Simpan',
    cancelButtonText:'Batal', confirmButtonColor:'#14618B',
    preConfirm: () => {
      const kode = document.getElementById('mpKode').value.trim();
      const nama = document.getElementById('mpNama').value.trim();
      if (!kode || !nama) { Swal.showValidationMessage('Kode dan nama wajib diisi.'); return false; }
      return {
        kode_prestasi: kode,
        nama_prestasi: nama,
        kategori: document.getElementById('mpKat').value,
        bidang: document.getElementById('mpBidang').value.trim() || null,
        bobot_poin: Math.max(1, Number(document.getElementById('mpPoin').value) || 1),
        keterangan: document.getElementById('mpKet').value.trim() || null,
        aktif: document.getElementById('mpAktif').value === 'true'
      };
    }
  });
  if (!r.isConfirmed) return;

  try {
    const { error } = await db.from('master_prestasi')
      .upsert(r.value, { onConflict: 'kode_prestasi' });
    if (error) throw error;
    cacheHapus('masterPrestasi');
    toast('success', 'Master prestasi tersimpan.');
    if (APP.view === 'master') navigateTo('master');
  } catch (err) { fireError(err); }
}

// ---------------------------------------------------------------------
// 22. START — pulihkan sesi bila masih berlaku

/* =====================================================================
   26. LAYAR LOGIN — INTERAKSI KURSOR

   Yang dikerjakan JavaScript di sini hanya SATU: menyediakan angka.
   Seluruh gerak, jeda, dan kurvanya tinggal di CSS. Pembagian itu
   disengaja — gerak yang ditulis di CSS dijalankan compositor tanpa
   membangunkan thread utama, sedangkan gerak yang dijalankan JS ikut
   tersendat setiap kali ada pekerjaan lain.

   Tiga angka yang dihitung:
     --mx / --my            posisi kursor untuk cahaya sekitar
     --miringX / --miringY  kemiringan kartu terhadap pusatnya
     --tarikX / --tarikY    tarikan magnet tombol saat kursor mendekat

   Semuanya dibungkus requestAnimationFrame, jadi seberapa sering pun
   pointermove menyala, penulisan gaya tetap sekali per bingkai.
   ===================================================================== */
function hidupkanLayarLogin() {
  const scr = document.getElementById('loginScreen');
  if (!scr) return;
  const kartu  = scr.querySelector('.login-card');
  const tombol = document.getElementById('btnLogin');

  /* Lepas animasi kemunculan setelah rangkaiannya tuntas (jeda
     terpanjang 0,91s + durasi 0,75s). Selama animasi masih menempel,
     nilai transform yang ditahannya mengalahkan kemiringan kursor. */
  if (kartu) setTimeout(() => kartu.classList.add('usai'), 1800);

  const kursorHalus = window.matchMedia('(pointer:fine)').matches;
  const gerakDikurangi = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!kursorHalus || gerakDikurangi) return;

  let bingkai = 0, px = 0, py = 0;
  const jepit = (v) => Math.max(-1, Math.min(1, v));

  const gambar = () => {
    bingkai = 0;
    scr.style.setProperty('--mx', px + 'px');
    scr.style.setProperty('--my', py + 'px');

    if (kartu) {
      const r = kartu.getBoundingClientRect();
      if (r.width) {
        const dx = jepit((px - (r.left + r.width  / 2)) / (r.width  / 2));
        const dy = jepit((py - (r.top  + r.height / 2)) / (r.height / 2));
        // 3,2 dan 2,4 derajat. Lebih dari itu kartu terbaca sebagai
        // mainan, bukan sebagai permukaan yang menangkap cahaya.
        kartu.style.setProperty('--miringY', (dx *  3.2).toFixed(2) + 'deg');
        kartu.style.setProperty('--miringX', (dy * -2.4).toFixed(2) + 'deg');
        kartu.style.setProperty('--kilauX', (((px - r.left) / r.width)  * 100).toFixed(1) + '%');
        kartu.style.setProperty('--kilauY', (((py - r.top)  / r.height) * 100).toFixed(1) + '%');
      }
    }

    if (tombol) {
      const r = tombol.getBoundingClientRect();
      if (r.width) {
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        const JANGKAU = 150;                       // piksel
        const jarak = Math.hypot(px - cx, py - cy);
        const tarik = jarak < JANGKAU ? 1 - jarak / JANGKAU : 0;
        tombol.style.setProperty('--tarikX', ((px - cx) * 0.14 * tarik).toFixed(2) + 'px');
        tombol.style.setProperty('--tarikY', ((py - cy) * 0.20 * tarik).toFixed(2) + 'px');
      }
    }
  };

  scr.addEventListener('pointermove', (e) => {
    px = e.clientX; py = e.clientY;
    scr.classList.add('sorot');
    if (!bingkai) bingkai = requestAnimationFrame(gambar);
  }, { passive: true });

  scr.addEventListener('pointerleave', () => {
    scr.classList.remove('sorot');
    if (kartu) {
      kartu.style.setProperty('--miringX', '0deg');
      kartu.style.setProperty('--miringY', '0deg');
    }
    if (tombol) {
      tombol.style.setProperty('--tarikX', '0px');
      tombol.style.setProperty('--tarikY', '0px');
    }
  });
}

// =====================================================================
// 38. PETA SEBARAN & INDEKS PERINGATAN PEMBINAAN  (v2.11)
//
//     Modul ini melebarkan ketiga dashboard — Ringkasan, Pimpinan, dan
//     Guru BK — dari "berapa banyak pelanggaran" menjadi "bagaimana
//     sebaran perkembangan santri". Empat panel ditambahkan, seluruhnya
//     dihitung di peramban dari tabel yang sudah ada. Tidak ada layar
//     input baru, tidak ada tabel baru, tidak ada pustaka statistik.
//
//     Dasar rancangannya (lihat berkas riset di folder Riset-Teori):
//
//     (1) Empat unsur Indeks Peringatan Pembinaan diturunkan dari empat
//         ikatan sosial Hirschi: Beban (luaran yang dipantau), Ikatan
//         (commitment & involvement), Keterputusan (involvement terbalik),
//         dan Respons (attachment yang dilembagakan).
//
//     (2) Keempatnya SENGAJA TIDAK DIJUMLAHKAN. Satu angka tunggal
//         menyembunyikan sebab, dan itu persis kelemahan skor net yang
//         sudah ada. Yang ditampilkan empat batang berdampingan, supaya
//         pertanyaan yang muncul bukan "berapa skornya" melainkan
//         "ikatan mana yang mengendur".
//
//     (3) TREN LINEAR HANYA DIHITUNG PADA TINGKAT KELOMPOK. Pada tingkat
//         santri, jumlah titik waktu per anak belum memadai untuk menaksir
//         arah perubahan; label "membaik/memburuk" per santri karena itu
//         ditahan, dan yang ditampilkan adalah status pada jendela
//         berjalan. Menuntun keputusan pembinaan atas anak yang nyata
//         dengan label yang dibangkitkan dari kebisingan tidak dapat
//         dipertanggungjawabkan.
//
//     (4) Kriteria "Ikatan nol" menangkap santri yang menarik diri —
//         tidak melanggar apa pun, tetapi juga tidak menyetor hafalan dan
//         tidak pernah tercatat berprestasi. Kriteria ini TIDUR selama
//         pengisian log_prestasi dan log_tahfiz belum merata, karena bila
//         diaktifkan pada data yang kosong ia akan menandai hampir seluruh
//         santri sekaligus — peringatan yang menandai semua orang tidak
//         memperingatkan siapa pun.
// =====================================================================

/** Jendela pengamatan IPP, dalam hari. */
const IPP_JENDELA = 60;

/** Ambang keaktifan pencatatan positif: minimal 20% santri punya satu catatan. */
const IPP_AMBANG_IKATAN = 0.20;

/** Seluruh target pembinaan (goal_santri) — untuk agregasi dashboard. */
async function muatGoalSemua() {
  const c = cacheGet('goalSemua'); if (c) return c;
  return cacheSet('goalSemua', await amanKosong(
    () => ambilSemua('goal_santri', '*', { order:'periode', asc:false }), 'target pembinaan'));
}

/**
 * Kemiringan garis regresi linear sederhana atas deret nilai berurutan.
 * Dikembalikan null bila titik waktunya kurang dari tiga — dua titik
 * selalu membentuk garis sempurna dan tidak mengandung informasi tren.
 */
function trenLinear(nilai) {
  const n = (nilai || []).length;
  if (n < 3) return null;
  const rerataX = (n - 1) / 2;
  const rerataY = nilai.reduce((a, b) => a + b, 0) / n;
  let atas = 0, bawah = 0;
  for (let i = 0; i < n; i++) {
    atas  += (i - rerataX) * (nilai[i] - rerataY);
    bawah += (i - rerataX) ** 2;
  }
  return bawah ? Math.round((atas / bawah) * 100) / 100 : 0;
}

/** Lencana arah tren kelompok. Naik = memburuk untuk pelanggaran. */
function lencanaTren(kemiringan, { naikBuruk = true } = {}) {
  if (kemiringan === null) {
    return `<span class="tren-x" title="Butuh minimal tiga bulan data">
      <i class="fa-solid fa-minus"></i>belum cukup</span>`;
  }
  const diam = Math.abs(kemiringan) < 0.5;
  if (diam) return `<span class="tren-x"><i class="fa-solid fa-equals"></i>stabil</span>`;
  const naik = kemiringan > 0;
  const buruk = naikBuruk ? naik : !naik;
  return `<span class="tren-${buruk ? 'buruk' : 'baik'}">
    <i class="fa-solid fa-arrow-trend-${naik ? 'up' : 'down'}"></i>
    ${naik ? '+' : ''}${kemiringan}/bln</span>`;
}

/** Daftar 'yyyy-MM' mundur n bulan, terurut lama → baru. */
function bulanTerakhir(n) {
  const out = [], kini = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(kini.getFullYear(), kini.getMonth() - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}

/**
 * Hitung empat unsur Indeks Peringatan Pembinaan per santri pada jendela
 * berjalan. Tidak ada penjumlahan menjadi skor tunggal — itu disengaja.
 */
function hitungIpp({ siswa, detail, prestasi, tahfiz, izin, pembinaan, hari = IPP_JENDELA }) {
  const akhir = new Date(); akhir.setHours(23, 59, 59, 999);
  const mulai = tambahHari(akhir, -(hari - 1)); mulai.setHours(0, 0, 0, 0);
  const dalam = (v) => { const d = tglDari(kunciTgl(v)); return !!d && d >= mulai && d <= akhir; };

  const peta = {};
  const ent = (nisn, s) => {
    const n = String(nisn || ''); if (!n) return null;
    if (!peta[n]) {
      const sw = s || {};
      peta[n] = { nisn: n, nama: sw.nama_siswa || '(tidak ditemukan)', kelas: sw.kelas || '-',
        beban: 0, kasus: 0, ikatan: 0, prestasi: 0, tahfiz: 0, putus: 0,
        binaTotal: 0, binaSelesai: 0 };
    }
    return peta[n];
  };
  (siswa || []).forEach(s => ent(s.nisn, s));

  (detail || []).forEach(r => {
    if (!dalam(r.tanggal)) return;
    const it = ent(r.nisn); if (!it) return;
    it.beban += Number(r.bobot_pelanggaran) || 0;
    it.kasus++;
  });
  (prestasi || []).forEach(r => {
    if (!dalam(r.tanggal)) return;
    const it = ent(r.nisn); if (!it) return;
    it.prestasi++; it.ikatan++;
  });
  (tahfiz || []).forEach(r => {
    if (!dalam(r.tanggal)) return;
    const it = ent(r.nisn); if (!it) return;
    it.tahfiz++; it.ikatan++;
  });
  (izin || []).forEach(r => {
    if (!dalam(r.tanggal_mulai)) return;
    const it = ent(r.nisn); if (!it) return;
    it.putus++;
  });
  (pembinaan || []).forEach(r => {
    if (!dalam(r.tanggal_pembinaan)) return;
    const it = ent(r.nisn); if (!it) return;
    it.binaTotal++;
    if (String(r.status_pembinaan) === 'Selesai') it.binaSelesai++;
  });

  const daftar = Object.values(peta);
  const punyaIkatan = daftar.filter(x => x.ikatan > 0).length;
  // Kriteria "Ikatan nol" hanya diaktifkan bila pencatatan positif sudah
  // cukup merata. Lihat catatan (4) di kepala modul.
  const ikatanAktif = daftar.length
    ? (punyaIkatan / daftar.length) >= IPP_AMBANG_IKATAN : false;

  daftar.forEach(it => {
    it.respons = it.binaTotal ? Math.round(it.binaSelesai / it.binaTotal * 100) : null;
    const macet = it.binaTotal >= 2 && it.respons !== null && it.respons < 50;
    if (it.beban >= 50 || macet) it.tingkat = 3;
    else if (it.beban > 0 || it.putus >= 2 || (ikatanAktif && it.ikatan === 0)) it.tingkat = 2;
    else it.tingkat = 1;

    const sebab = [];
    if (it.beban >= 50) sebab.push(`beban ${it.beban} poin`);
    else if (it.beban > 0) sebab.push(`${it.kasus} catatan · ${it.beban} poin`);
    if (macet) sebab.push(`${it.binaTotal - it.binaSelesai} pembinaan belum tuntas`);
    if (it.putus >= 2) sebab.push(`${it.putus} kali izin keluar`);
    if (ikatanAktif && it.ikatan === 0) sebab.push('tidak ada catatan positif');
    it.sebab = sebab.join(' · ') || 'Tidak ada indikasi';
  });

  const maks = {
    beban:  Math.max(1, ...daftar.map(x => x.beban)),
    ikatan: Math.max(1, ...daftar.map(x => x.ikatan)),
    putus:  Math.max(1, ...daftar.map(x => x.putus))
  };

  const urut = { 3:3, 2:2, 1:1 };
  daftar.sort((a, b) => (urut[b.tingkat] - urut[a.tingkat]) || (b.beban - a.beban) || (a.ikatan - b.ikatan));

  return {
    daftar, maks, ikatanAktif, punyaIkatan, mulai, akhir, hari,
    tier3: daftar.filter(x => x.tingkat === 3).length,
    tier2: daftar.filter(x => x.tingkat === 2).length,
    tier1: daftar.filter(x => x.tingkat === 1).length
  };
}

/**
 * Tampilan untuk data yang belum terisi. Bukan sekadar "belum ada data":
 * menyebut angkanya, menerangkan akibatnya, dan menyediakan jalan mengisi.
 * Panel yang menerangkan sebab kekosongannya lebih berguna daripada panel
 * yang menyembunyikan diri.
 */
function kartuBelumTerisi({ judul, jumlah, dariSantri, ikon, akibat, ajakan, view }) {
  // Tombol hanya dipasang bila peran yang sedang masuk memang memiliki
  // menunya. Memakai HAK saja tidak cukup: Pimpinan boleh MELIHAT prestasi
  // tetapi menu Profil Santri tidak dibuka untuknya, sehingga navigateTo()
  // hanya akan melempar pesan galat — tombol yang menolak dirinya sendiri
  // lebih buruk daripada tidak ada tombol.
  const bolehBuka = !!view && (MENU_ROLE[view] || []).includes(role());
  return `<div class="ajak">
    <i class="fa-solid ${ikon || 'fa-seedling'}"></i>
    <p>${esc(judul)}</p>
    <small>${esc(akibat)}</small>
    <div class="ajak-angka">
      <span><b>${angka(jumlah)}</b>catatan tersimpan</span>
      <span><b>${angka(dariSantri)}</b>santri aktif</span>
    </div>
    <small class="ajak-aksi">${esc(ajakan)}</small>
    ${bolehBuka ? `<button class="btn btn-ghost btn-sm" data-nav="${esc(view)}">
      <i class="fa-solid fa-pen-to-square"></i>Buka halaman pencatatan</button>` : ''}
  </div>`;
}

/* ---------------------------------------------------------------------
   Panel 1 — Prestasi & Tahfiz
   --------------------------------------------------------------------- */

function panelPositif({ siswa, prestasi, tahfiz, bulanKunci }) {
  const jmlSantri = siswa.length || 1;

  const prsBulan = Object.fromEntries(bulanKunci.map(b => [b, 0]));
  const thfBulan = Object.fromEntries(bulanKunci.map(b => [b, 0]));
  const perKat = { Emas:0, Perak:0, Perunggu:0 };
  let poinPrestasi = 0, halaman = 0;
  const santriPrestasi = new Set(), santriTahfiz = new Set();

  prestasi.forEach(r => {
    const b = bulanDari(kunciTgl(r.tanggal));
    if (b in prsBulan) prsBulan[b]++;
    if (r.kategori in perKat) perKat[r.kategori]++;
    poinPrestasi += Number(r.poin) || 0;
    if (r.nisn) santriPrestasi.add(String(r.nisn));
  });
  tahfiz.forEach(r => {
    const b = bulanDari(kunciTgl(r.tanggal));
    if (b in thfBulan) thfBulan[b]++;
    halaman += Number(r.capaian_halaman) || 0;
    if (r.nisn) santriTahfiz.add(String(r.nisn));
  });

  const trenPrs = trenLinear(bulanKunci.map(b => prsBulan[b]));
  const trenThf = trenLinear(bulanKunci.map(b => thfBulan[b]));
  const jangkauan = (n) => Math.round(n / jmlSantri * 1000) / 10;

  // Ambang tampilan kosong. Di bawah jangkauan ini, grafik bulanan
  // menggambarkan segelintir santri tetapi terbaca seolah menggambarkan
  // seluruh dayah — menyebutkan angka jangkauannya secara terbuka lebih
  // jujur daripada melukis grafik yang nyaris rata di dasar sumbu.
  const AMBANG_JANGKAUAN = 0.15;
  const prsTipis = santriPrestasi.size / jmlSantri < AMBANG_JANGKAUAN;
  const thfTipis = santriTahfiz.size / jmlSantri < AMBANG_JANGKAUAN;

  const isiPrestasi = prsTipis
    ? kartuBelumTerisi({
        judul: 'Catatan apresiasi belum terkumpul',
        jumlah: prestasi.length, dariSantri: siswa.length, ikon: 'fa-award',
        akibat: 'Selama tabel ini kosong, skor net santri sama saja dengan poin pelanggaran — sisi positifnya tidak pernah ikut dihitung.',
        ajakan: 'Satu catatan apresiasi per pekan per rayon sudah cukup untuk membuat panel ini bermakna.',
        view: 'prestasi' })
    : `<div class="minis" style="padding-bottom:14px">
        <div class="mini t"><span>Catatan</span><b>${angka(prestasi.length)}</b></div>
        <div class="mini s"><span>Santri</span><b>${angka(santriPrestasi.size)}</b></div>
        <div class="mini a"><span>Poin</span><b>${angka(poinPrestasi)}</b></div>
        <div class="mini m"><span>Jangkauan</span><b>${jangkauan(santriPrestasi.size)}%</b></div>
      </div>${chartBox('sbPrestasi')}`;

  const isiTahfiz = thfTipis
    ? kartuBelumTerisi({
        judul: 'Setoran hafalan belum terkumpul',
        jumlah: tahfiz.length, dariSantri: siswa.length, ikon: 'fa-book-quran',
        akibat: 'Konsistensi ibadah adalah satu-satunya ikatan positif yang bisa diukur dari catatan. Tanpanya, sistem hanya melihat pelanggaran.',
        ajakan: 'Setoran yang dicatat rutin membuat santri yang menarik diri terlihat sebelum ia melanggar.',
        view: 'tahfiz' })
    : `<div class="minis" style="padding-bottom:14px">
        <div class="mini t"><span>Setoran</span><b>${angka(tahfiz.length)}</b></div>
        <div class="mini s"><span>Santri</span><b>${angka(santriTahfiz.size)}</b></div>
        <div class="mini a"><span>Halaman</span><b>${angka(Math.round(halaman))}</b></div>
        <div class="mini m"><span>Jangkauan</span><b>${jangkauan(santriTahfiz.size)}%</b></div>
      </div>${chartBox('sbTahfiz')}`;

  const html = `<div class="grid-half">
    ${kartu('Apresiasi & Prestasi', isiPrestasi,
      prsTipis ? '' : lencanaTren(trenPrs, { naikBuruk:false }),
      `${bulanKunci.length} bulan terakhir · Emas ${perKat.Emas} · Perak ${perKat.Perak} · Perunggu ${perKat.Perunggu}`)}
    ${kartu('Setoran Tahfiz', isiTahfiz,
      thfTipis ? '' : lencanaTren(trenThf, { naikBuruk:false }),
      `${bulanKunci.length} bulan terakhir · konsistensi ibadah`)}
  </div>`;

  return { html, prsTipis, thfTipis, prsBulan, thfBulan, perKat };
}

function gambarPositif({ bulanKunci, prsBulan, thfBulan, prsTipis, thfTipis }) {
  const label = bulanKunci.map(b => {
    const [th, bl] = b.split('-');
    return new Date(Number(th), Number(bl) - 1, 1)
      .toLocaleDateString('id-ID', { month:'short', year:'2-digit' });
  });
  if (!prsTipis) buatChart('sbPrestasi', 'sbPrestasi', {
    type:'bar',
    data:{ labels: label, datasets:[{ label:'Catatan apresiasi',
      data: bulanKunci.map(b => prsBulan[b]), backgroundColor:'#C9A227', borderRadius:6 }]},
    options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}},
      scales:{ x:{grid:{display:false}}, y:{beginAtZero:true, ticks:{precision:0}} } }
  });
  if (!thfTipis) buatChart('sbTahfiz', 'sbTahfiz', {
    type:'line',
    data:{ labels: label, datasets:[{ label:'Setoran',
      data: bulanKunci.map(b => thfBulan[b]), borderColor:'#0F766E',
      backgroundColor:'rgba(15,118,110,.14)', tension:.35, fill:true,
      borderWidth:2.5, pointRadius:3 }]},
    options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}},
      scales:{ x:{grid:{display:false}}, y:{beginAtZero:true, ticks:{precision:0}} } }
  });
}

/* ---------------------------------------------------------------------
   Panel 2 — Peta sebaran perkembangan
   --------------------------------------------------------------------- */

/**
 * Matriks sebaran per angkatan. Setiap sel dinormalkan per 100 santri
 * supaya angkatan berukuran berbeda dapat dibandingkan — jumlah mentah
 * selalu memihak angkatan yang lebih besar.
 */
function panelSebaran({ siswa, detail, prestasi, tahfiz, izin, pembinaan, bulanKunci }) {
  const urutAng = ['VII','VIII','IX','X','XI','XII'];
  const baris = {};
  urutAng.forEach(a => baris[a] = { angkatan:a, santri:0, plg:0, poin:0, berat:0,
    prs:0, thf:0, izin:0, binaTotal:0, binaSelesai:0,
    perBulan: Object.fromEntries(bulanKunci.map(b => [b, 0])) });

  const petaKelas = {};
  siswa.forEach(s => {
    const a = angkatanDariKelas(s.kelas);
    if (baris[a]) { baris[a].santri++; petaKelas[String(s.nisn)] = a; }
  });

  const keAng = (r) => baris[angkatanDariKelas(r.kelas) || petaKelas[String(r.nisn)] || ''] || null;

  detail.forEach(r => {
    const it = keAng(r); if (!it) return;
    it.plg++; it.poin += Number(r.bobot_pelanggaran) || 0;
    if (r.kategori === 'Berat') it.berat++;
    const b = bulanDari(kunciTgl(r.tanggal)); if (b in it.perBulan) it.perBulan[b]++;
  });
  prestasi.forEach(r => { const it = keAng(r); if (it) it.prs++; });
  tahfiz.forEach(r  => { const it = keAng(r); if (it) it.thf++; });
  izin.forEach(r    => { const it = keAng(r); if (it) it.izin++; });
  pembinaan.forEach(r => {
    const it = keAng(r); if (!it) return;
    it.binaTotal++; if (String(r.status_pembinaan) === 'Selesai') it.binaSelesai++;
  });

  const isi = urutAng.map(a => baris[a]).filter(r => r.santri > 0);
  const per100 = (n, s) => s ? Math.round(n / s * 1000) / 10 : 0;
  isi.forEach(r => {
    r.plg100 = per100(r.plg, r.santri);
    r.prs100 = per100(r.prs, r.santri);
    r.thf100 = per100(r.thf, r.santri);
    r.izin100 = per100(r.izin, r.santri);
    r.tuntas = r.binaTotal ? Math.round(r.binaSelesai / r.binaTotal * 100) : null;
    r.tren = trenLinear(bulanKunci.map(b => r.perBulan[b]));
  });

  const maks = {
    plg: Math.max(1, ...isi.map(r => r.plg100)),
    prs: Math.max(1, ...isi.map(r => r.prs100)),
    thf: Math.max(1, ...isi.map(r => r.thf100)),
    izin: Math.max(1, ...isi.map(r => r.izin100))
  };
  // Warna sel: makin pekat makin tinggi. Merah untuk yang tidak diinginkan,
  // hijau untuk yang diinginkan — arah bacaannya harus langsung terasa.
  const sel = (nilai, puncak, warna) => {
    const p = puncak ? Math.min(1, nilai / puncak) : 0;
    const rgb = warna === 'merah' ? '159,18,57' : warna === 'hijau' ? '15,118,110'
      : warna === 'kuning' ? '180,83,9' : '20,97,139';
    return `<td class="sb-sel" style="background:rgba(${rgb},${(p * 0.32).toFixed(3)})">
      <b>${nilai}</b></td>`;
  };

  const tubuh = isi.map(r => `<tr>
    <td class="sb-nm"><b>Angkatan ${esc(r.angkatan)}</b><small>${angka(r.santri)} santri</small></td>
    ${sel(r.plg100, maks.plg, 'merah')}
    ${sel(r.prs100, maks.prs, 'hijau')}
    ${sel(r.thf100, maks.thf, 'hijau')}
    ${sel(r.izin100, maks.izin, 'kuning')}
    <td class="sb-sel">${r.tuntas === null
      ? '<span style="color:var(--text-3)">—</span>'
      : `<b>${r.tuntas}%</b>`}</td>
    <td class="sb-tren">${lencanaTren(r.tren)}</td>
  </tr>`).join('') || barisKosong(7, 'Belum ada santri terdata.', 'Isi data santri terlebih dahulu.');

  const html = kartu('Peta Sebaran Perkembangan per Angkatan',
    `<div class="tbl"><table class="sebar">
      <thead><tr>
        <th>Angkatan</th>
        <th>Pelanggaran</th><th>Apresiasi</th><th>Setoran</th>
        <th>Izin keluar</th><th>Pembinaan tuntas</th><th>Tren pelanggaran</th>
      </tr></thead><tbody>${tubuh}</tbody></table></div>
    <div class="scroll-hint"><i class="fa-solid fa-arrows-left-right"></i>Geser ke samping untuk kolom lainnya.</div>
    <p class="sb-kaki">Empat kolom pertama dihitung <b>per 100 santri</b> agar angkatan
      berukuran berbeda dapat dibandingkan. Kolom tren adalah kemiringan garis regresi
      linear atas jumlah pelanggaran bulanan — dihitung hanya pada tingkat kelompok,
      tempat jumlah catatannya memadai.</p>`,
    '', `${bulanKunci.length} bulan terakhir`);

  return { html, isi };
}

/* ---------------------------------------------------------------------
   Panel 3 — Target pembinaan
   --------------------------------------------------------------------- */

function panelTarget({ siswa, goals, targetTahfiz, tahfiz }) {
  const periode = (typeof batasPeriode === 'function' && batasPeriode()?.bulan) || bulanIni();
  const kini = (goals || []).filter(g => String(g.periode) === periode);

  // Setiap target digolongkan SEKALI. Urutan pemeriksaannya mengikuti
  // kelasGoal() pada modul 35: "Tercapai Sebagian" mengandung kata
  // "tercapai" sekaligus "sebagian", sehingga penyaringan terpisah akan
  // menghitungnya dua kali dan membuat sisa "berjalan" menjadi negatif.
  const golonganGoal = (g) => {
    const t = String(g.status || '').toLowerCase();
    if (t.includes('sebagian')) return 'sebagian';
    if (t.includes('belum') || t.includes('batal')) return 'meleset';
    if (t.includes('tercapai')) return 'tercapai';
    return 'berjalan';
  };
  const hitungGoal = { tercapai:0, sebagian:0, meleset:0, berjalan:0 };
  kini.forEach(g => hitungGoal[golonganGoal(g)]++);
  const { tercapai, sebagian, meleset, berjalan } = hitungGoal;
  const bersasar = new Set(kini.map(g => String(g.nisn))).size;
  const tanpaTarget = Math.max(0, siswa.length - bersasar);

  // Target hafalan: bandingkan capaian halaman periode berjalan dengan
  // target yang ditetapkan untuk periode yang sama.
  const targetPeriode = (targetTahfiz || []).filter(t => String(t.periode) === periode);
  const capai = {};
  (tahfiz || []).forEach(r => {
    if (bulanDari(kunciTgl(r.tanggal)) !== periode) return;
    const n = String(r.nisn || ''); if (!n) return;
    capai[n] = (capai[n] || 0) + (Number(r.capaian_halaman) || 0);
  });
  let thfCapai = 0, thfKurang = 0;
  targetPeriode.forEach(t => {
    const target = Number(t.target_halaman) || 0;
    if (!target) return;
    if ((capai[String(t.nisn)] || 0) >= target) thfCapai++; else thfKurang++;
  });

  const adaGoal = kini.length > 0;
  const adaTarget = targetPeriode.length > 0;

  const isiGoal = adaGoal
    ? `<div class="minis" style="padding-bottom:14px">
        <div class="mini t"><span>Tercapai</span><b>${angka(tercapai)}</b></div>
        <div class="mini a"><span>Sebagian</span><b>${angka(sebagian)}</b></div>
        <div class="mini m"><span>Belum</span><b>${angka(meleset)}</b></div>
        <div class="mini s"><span>Berjalan</span><b>${angka(berjalan)}</b></div>
      </div>
      ${chartBox('sbGoal')}
      <p class="sb-kaki"><b>${angka(bersasar)}</b> santri sudah punya target pada periode ini;
        <b>${angka(tanpaTarget)}</b> belum. Target yang tidak ditetapkan tidak dapat dievaluasi,
        dan pembinaan tanpa sasaran sulit dinilai tuntas.</p>`
    : kartuBelumTerisi({
        judul: 'Belum ada target pembinaan pada periode ini',
        jumlah: (goals || []).length, dariSantri: siswa.length, ikon: 'fa-bullseye',
        akibat: 'Pembinaan tanpa sasaran yang tertulis hanya dapat dinilai dari selesai atau tidaknya instruksi, bukan dari berubahnya perilaku.',
        ajakan: 'Target ditetapkan dari halaman Profil Santri, satu sasaran per santri per periode sudah memadai.',
        view: 'siswa' });

  const isiTahfiz = adaTarget
    ? `<div class="minis" style="padding-bottom:14px">
        <div class="mini t"><span>Memenuhi</span><b>${angka(thfCapai)}</b></div>
        <div class="mini m"><span>Belum</span><b>${angka(thfKurang)}</b></div>
        <div class="mini s"><span>Ditetapkan</span><b>${angka(targetPeriode.length)}</b></div>
        <div class="mini a"><span>Ketercapaian</span><b>${targetPeriode.length
          ? Math.round(thfCapai / targetPeriode.length * 100) : 0}%</b></div>
      </div>${chartBox('sbTargetThf')}`
    : kartuBelumTerisi({
        judul: 'Target hafalan belum ditetapkan',
        jumlah: (targetTahfiz || []).length, dariSantri: siswa.length, ikon: 'fa-book-bookmark',
        akibat: 'Tanpa target, setoran hanya terbaca sebagai kegiatan — bukan sebagai kemajuan terhadap sasaran.',
        ajakan: 'Target halaman per periode ditetapkan dari halaman Tahfiz.',
        view: 'tahfiz' });

  const html = `<div class="grid-half">
    ${kartu('Target Pembinaan', isiGoal, `<span class="tag tag-sea">${esc(periode)}</span>`,
      'Sasaran tertulis per santri dan hasil evaluasinya')}
    ${kartu('Target Hafalan', isiTahfiz, `<span class="tag tag-sea">${esc(periode)}</span>`,
      'Capaian halaman dibandingkan target periode berjalan')}
  </div>`;

  return { html, adaGoal, adaTarget, tercapai, sebagian, meleset, berjalan, thfCapai, thfKurang };
}

function gambarTarget(d) {
  if (d.adaGoal) buatChart('sbGoal', 'sbGoal', {
    type:'doughnut',
    data:{ labels:['Tercapai','Sebagian','Belum','Berjalan'],
      datasets:[{ data:[d.tercapai, d.sebagian, d.meleset, d.berjalan],
        backgroundColor:['#0F766E','#B45309','#9F1239','#14618B'], borderWidth:0 }]},
    options:{ responsive:true, maintainAspectRatio:false, cutout:'66%',
      plugins:{legend:{position:'bottom', labels:{usePointStyle:true, boxWidth:9}}} }
  });
  if (d.adaTarget) buatChart('sbTargetThf', 'sbTargetThf', {
    type:'doughnut',
    data:{ labels:['Memenuhi target','Belum memenuhi'],
      datasets:[{ data:[d.thfCapai, d.thfKurang],
        backgroundColor:['#0F766E','#B45309'], borderWidth:0 }]},
    options:{ responsive:true, maintainAspectRatio:false, cutout:'66%',
      plugins:{legend:{position:'bottom', labels:{usePointStyle:true, boxWidth:9}}} }
  });
}

/* ---------------------------------------------------------------------
   Panel 4 — Indeks Peringatan Pembinaan
   --------------------------------------------------------------------- */

function panelIpp(ipp, { batas = 10 } = {}) {
  const perhatian = ipp.daftar.filter(x => x.tingkat >= 2).slice(0, batas);

  const batang = (nilai, puncak, warna, judul) => {
    const p = puncak ? Math.min(100, Math.round(nilai / puncak * 100)) : 0;
    return `<span class="ipp-u" title="${esc(judul)}">
      <span class="ipp-bar ${warna}"><i style="width:${p}%"></i></span>
      <b>${nilai}</b></span>`;
  };

  const baris = perhatian.map(x => `
    <div class="ipp-baris t${x.tingkat}" data-detail="${esc(x.nisn)}" role="button" tabindex="0">
      <div class="ipp-nm">
        <b>${esc(x.nama)}</b>
        <small>${esc(x.kelas)} · ${esc(x.sebab)}</small>
      </div>
      <div class="ipp-unsur">
        ${batang(x.beban,  ipp.maks.beban,  'merah',  'Beban — poin pelanggaran')}
        ${batang(x.ikatan, ipp.maks.ikatan, 'hijau',  'Ikatan — apresiasi & setoran')}
        ${batang(x.putus,  ipp.maks.putus,  'kuning', 'Keterputusan — izin keluar')}
        <span class="ipp-u" title="Respons — pembinaan yang tuntas">
          <span class="ipp-bar biru"><i style="width:${x.respons === null ? 0 : x.respons}%"></i></span>
          <b>${x.respons === null ? '—' : x.respons + '%'}</b></span>
      </div>
      <span class="tag ${x.tingkat === 3 ? 'tag-berat' : 'tag-sedang'}">Tier ${x.tingkat}</span>
    </div>`).join('') || kosong('Tidak ada santri pada tier 2 atau 3.',
      'Seluruh santri berada pada dukungan umum sepanjang jendela ini.', 'fa-circle-check');

  const catatanIkatan = ipp.ikatanAktif
    ? `Kriteria <b>Ikatan nol</b> aktif — santri tanpa satu pun catatan positif ikut ditandai.`
    : `Kriteria <b>Ikatan nol</b> sedang nonaktif: baru ${angka(ipp.punyaIkatan)} dari
       ${angka(ipp.daftar.length)} santri yang memiliki catatan apresiasi atau setoran.
       Kriteria ini menyala sendiri setelah pencatatan positif mencapai
       ${Math.round(IPP_AMBANG_IKATAN * 100)}% santri.`;

  return kartu('Indeks Peringatan Pembinaan',
    `<div class="ipp-ket">
      <span><i class="ipp-dot merah"></i>Beban</span>
      <span><i class="ipp-dot hijau"></i>Ikatan</span>
      <span><i class="ipp-dot kuning"></i>Keterputusan</span>
      <span><i class="ipp-dot biru"></i>Respons</span>
    </div>
    <div class="ipp">${baris}</div>
    <p class="sb-kaki">Keempat unsur <b>sengaja tidak dijumlahkan</b> menjadi satu skor:
      satu angka tunggal menyembunyikan sebab, sedangkan empat batang berdampingan
      menunjukkan ikatan mana yang mengendur. Yang ditampilkan adalah <b>status</b> pada
      jendela ${ipp.hari} hari berjalan, bukan arah perubahan — jumlah titik waktu per
      santri belum memadai untuk menaksir tren perorangan. ${catatanIkatan}</p>`,
    `<span class="tag tag-berat">Tier 3: ${angka(ipp.tier3)}</span>
     <span class="tag tag-sedang">Tier 2: ${angka(ipp.tier2)}</span>
     <span class="tag tag-ok">Tier 1: ${angka(ipp.tier1)}</span>`,
    `${ipp.hari} hari terakhir · ${tgl(kunciTgl(ipp.mulai))} – ${tgl(kunciTgl(ipp.akhir))}`);
}

/* ---------------------------------------------------------------------
   Perakitan — dipanggil dari viewDashboard dan viewPimpinan
   --------------------------------------------------------------------- */

/**
 * Muat data tambahan lalu susun seluruh panel perluasan.
 * Mengembalikan { html, gambar } — html disisipkan ke DOM, lalu gambar()
 * dipanggil setelahnya untuk melukis grafiknya.
 */
async function blokSebaran({ siswa, detail, izin, pembinaan, ipp = true, batasIpp = 10 }) {
  const [prestasiAll, tahfizAll, goals, targetThf] = await Promise.all([
    amanKosong(muatPrestasi, 'prestasi'),
    amanKosong(muatTahfiz, 'tahfiz'),
    amanKosong(muatGoalSemua, 'target pembinaan'),
    amanKosong(muatTargetTahfiz, 'target tahfiz')
  ]);

  const nisnBoleh = new Set(siswa.map(s => String(s.nisn)));
  const saring = (rows) => rows.filter(r => nisnBoleh.has(String(r.nisn)));

  const bulanKunci = bulanTerakhir(6);
  // Seluruh panel di blok ini berlabel "6 bulan terakhir", jadi datanya
  // dipotong SEKALI di sini. Tanpa pemotongan ini, kolom per-100 santri
  // menjumlahkan seluruh riwayat sementara judulnya menjanjikan enam
  // bulan — angka yang tidak sesuai labelnya lebih berbahaya daripada
  // angka yang tidak ada.
  const jendela = new Set(bulanKunci);
  const dalamJendela = (rows, kolom) =>
    rows.filter(r => jendela.has(bulanDari(kunciTgl(r[kolom]))));

  const prestasi  = dalamJendela(saring(prestasiAll.filter(aktifPrestasi)), 'tanggal');
  const tahfiz    = dalamJendela(saring(tahfizAll.filter(aktifTahfiz)), 'tanggal');
  const detail6   = dalamJendela(detail, 'tanggal');
  const izin6     = dalamJendela(izin, 'tanggal_mulai');
  const bina6     = dalamJendela(pembinaan, 'tanggal_pembinaan');

  const pos = panelPositif({ siswa, prestasi, tahfiz, bulanKunci });
  const seb = panelSebaran({ siswa, detail: detail6, prestasi, tahfiz,
    izin: izin6, pembinaan: bina6, bulanKunci });
  const tgt = panelTarget({ siswa, goals: saring(goals), targetTahfiz: saring(targetThf), tahfiz });

  let ippHtml = '';
  if (ipp) {
    // Jendela IPP (60 hari) berada di dalam enam bulan, jadi pemotongan
    // di atas tidak menghilangkan satu pun baris yang IPP butuhkan.
    const hasil = hitungIpp({ siswa, detail: detail6, prestasi, tahfiz,
      izin: izin6, pembinaan: bina6 });
    ippHtml = panelIpp(hasil, { batas: batasIpp });
  }

  const html = `
    <div class="eyebrow sb-judul"><span class="ar">خريطة التطور</span><span class="rule"></span>
      <span class="lat">Peta Perkembangan Santri</span></div>
    ${pos.html}
    ${seb.html}
    ${tgt.html}
    ${ippHtml}`;

  return {
    html,
    gambar: () => {
      gambarPositif({ bulanKunci, prsBulan: pos.prsBulan, thfBulan: pos.thfBulan,
        prsTipis: pos.prsTipis, thfTipis: pos.thfTipis });
      gambarTarget(tgt);
      // Matriks sebaran lebih lebar daripada layar ponsel; helper ini
      // mengubahnya menjadi kartu berlabel di layar sempit dan menyalakan
      // petunjuk geser di layar lebar bila memang masih meluap.
      tandaiTabelBisaGeser();
    }
  };
}

// ---------------------------------------------------------------------
hidupkanLayarLogin();

(async function start() {
  const { data: { session } } = await db.auth.getSession();
  if (session) await masukAplikasi();
})();
