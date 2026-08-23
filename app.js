/* =====================================================================
   SISTEM INFORMASI PENGEMBANGAN SANTRI — APLIKASI WEB MANDIRI
   Supabase (PostgreSQL + Auth + RLS + Realtime) · tanpa Apps Script
   ===================================================================== */

// ---------------------------------------------------------------------
// 0. KONFIGURASI — isi dua nilai ini
//    Dashboard > Project Settings > API
// ---------------------------------------------------------------------

const SUPABASE_URL      = 'https://tuthhfdpcknocebliuhq.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR1dGhoZmRwY2tub2NlYmxpdWhxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY4NDY2NzUsImV4cCI6MjEwMjQyMjY3NX0.E3Jq7I5YWdO7zzZvRH6l4F0o-wV-hfCDJbRGHtYOrUk';

// Username tanpa "@" akan dilengkapi dengan domain ini saat login.
const DOMAIN_INTERNAL = 'ruhulqurani.local';

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true }
});

const APP = {
  profile: null,
  view: 'dashboard',
  charts: {},
  channel: null,
  cache: { master: [], bidang: [], kelas: [] }
};

// ---------------------------------------------------------------------
// 1. UTILITAS
// ---------------------------------------------------------------------
const $ = (id) => document.getElementById(id);

function esc(s) {
  if (s === null || s === undefined) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
                  .replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}

function tgl(v) {
  if (!v) return '-';
  const d = new Date(v + (String(v).length === 10 ? 'T00:00:00' : ''));
  if (isNaN(d)) return v;
  return d.toLocaleDateString('id-ID', { day:'2-digit', month:'short', year:'numeric' });
}

function hariIni() { return new Date().toISOString().slice(0, 10); }

function loading(on) { $('loadingBar').classList.toggle('hidden', !on); }

function toast(icon, title) {
  Swal.mixin({ toast:true, position:'top-end', showConfirmButton:false,
               timer:2600, timerProgressBar:true }).fire({ icon, title });
}

function fireError(err) {
  const msg = err?.message || String(err);
  console.error(err);
  Swal.fire({ icon:'error', title:'Terjadi Kesalahan', text:msg, confirmButtonColor:'#0284c7' });
}

function debounce(fn, ms) {
  let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

/** Bungkus query supaya waktu eksekusi tampil di header — bahan demo. */
async function q(promise, label) {
  const t0 = performance.now();
  const res = await promise;
  const ms = Math.round(performance.now() - t0);
  $('queryTime').textContent = `${label || 'query'} · ${ms} ms`;
  if (res.error) throw res.error;
  return res;
}

const role = () => APP.profile?.role || '';
const bolehTulis = () => ['Admin','Guru','Walas','Guru BK','Ustadz GEN-Z','Osis'].includes(role());
const isAdmin = () => role() === 'Admin';
const bolehPerizinan = () => ['Admin','Guru','Guru Piket','Osis'].includes(role());
const bolehCetak = () => !['Guru Piket','Ustadz GEN-Z','Walas'].includes(role());

const MENU_ROLE = {
  dashboard:   ['Admin','Guru','Walas','Guru BK','Guru Piket','Ustadz GEN-Z','Osis','Pimpinan'],
  siswa:       ['Admin','Guru','Walas','Guru BK','Guru Piket','Ustadz GEN-Z','Osis','Pimpinan'],
  pelanggaran: ['Admin','Guru','Walas','Guru BK','Guru Piket','Ustadz GEN-Z','Osis'],
  perizinan:   ['Admin','Guru','Guru Piket','Osis'],
  pembinaan:   ['Admin','Guru','Walas','Guru BK','Guru Piket','Ustadz GEN-Z'],
  master:      ['Admin','Guru','Walas','Guru BK','Guru Piket'],
  pengguna:    ['Admin']
};

// ---------------------------------------------------------------------
// 2. AUTENTIKASI
// ---------------------------------------------------------------------
$('formLogin').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('btnLogin');
  const u = $('loginUsername').value.trim();
  const p = $('loginPassword').value;
  const email = u.includes('@') ? u : `${u}@${DOMAIN_INTERNAL}`;

  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i><span>Memproses...</span>';
  try {
    const { error } = await db.auth.signInWithPassword({ email, password: p });
    if (error) throw new Error('Username atau password salah.');
    await masukAplikasi();
  } catch (err) {
    toast('error', err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<span>Masuk ke Sistem</span><i class="fa-solid fa-arrow-right"></i>';
  }
});

$('btnLogout').addEventListener('click', async () => {
  const r = await Swal.fire({ icon:'question', title:'Keluar dari aplikasi?',
    showCancelButton:true, confirmButtonText:'Ya, keluar', cancelButtonText:'Batal',
    confirmButtonColor:'#dc2626' });
  if (!r.isConfirmed) return;
  if (APP.channel) db.removeChannel(APP.channel);
  await db.auth.signOut();
  location.reload();
});

async function masukAplikasi() {
  const { data: { user } } = await db.auth.getUser();
  if (!user) return;

  const { data: profile, error } = await db.from('profiles')
    .select('*').eq('id', user.id).single();

  if (error || !profile) {
    await db.auth.signOut();
    return fireError(new Error('Profil pengguna belum dibuat. Hubungi Admin.'));
  }
  if (!profile.aktif) {
    await db.auth.signOut();
    return fireError(new Error('Akun ini dinonaktifkan.'));
  }

  APP.profile = profile;

  $('loginScreen').classList.add('hidden');
  $('appShell').classList.remove('hidden');
  $('profileName').textContent = profile.nama;
  $('profileRole').textContent = profile.role +
    (profile.kelas_binaan?.length ? ' · ' + profile.kelas_binaan.join(', ') : '');
  $('profileInitial').textContent = (profile.nama || '?').charAt(0).toUpperCase();

  document.querySelectorAll('.nav-item[data-view]').forEach(b => {
    b.classList.toggle('hidden', !(MENU_ROLE[b.dataset.view] || []).includes(profile.role));
  });

  aktifkanRealtime();
  refreshBadgePending();
  navigateTo(role() === 'Pimpinan' ? 'dashboard' : 'dashboard');
}

// ---------------------------------------------------------------------
// 3. NAVIGASI
// ---------------------------------------------------------------------
const JUDUL = {
  dashboard:'Dashboard', siswa:'Profil Santri', pelanggaran:'Catatan Pelanggaran',
  perizinan:'Pusat Perizinan', pembinaan:'Pembinaan', master:'Master Pelanggaran',
  pengguna:'Manajemen Pengguna'
};

$('navMenu').addEventListener('click', (e) => {
  const btn = e.target.closest('.nav-item[data-view]');
  if (!btn) return;
  navigateTo(btn.dataset.view);
  tutupSidebar();
});

$('btnToggleSidebar').addEventListener('click', () => {
  $('sidebar').classList.toggle('-translate-x-full');
  $('sidebarOverlay').classList.toggle('hidden');
});
$('sidebarOverlay').addEventListener('click', tutupSidebar);
function tutupSidebar() {
  $('sidebar').classList.add('-translate-x-full');
  $('sidebarOverlay').classList.add('hidden');
}

async function navigateTo(view) {
  if (!(MENU_ROLE[view] || []).includes(role())) {
    return toast('error', `Role ${role()} tidak memiliki akses ke menu ini.`);
  }
  APP.view = view;
  $('pageTitle').textContent = JUDUL[view] || view;
  document.querySelectorAll('.nav-item[data-view]').forEach(b =>
    b.classList.toggle('active', b.dataset.view === view));

  Object.values(APP.charts).forEach(c => { try { c.destroy(); } catch(e){} });
  APP.charts = {};

  loading(true);
  try {
    if (view === 'dashboard')        await viewDashboard();
    else if (view === 'siswa')       await viewSiswa();
    else if (view === 'pelanggaran') await viewPelanggaran();
    else if (view === 'perizinan')   await viewPerizinan();
    else if (view === 'pembinaan')   await viewPembinaan();
    else if (view === 'master')      await viewMaster();
    else if (view === 'pengguna')    await viewPengguna();
  } catch (err) { fireError(err); }
  finally { loading(false); }
}

// ---------------------------------------------------------------------
// 4. KOMPONEN BERSAMA
// ---------------------------------------------------------------------
function kartuStat(label, nilai, ikon, warna) {
  return `<div class="bg-white rounded-2xl border border-slate-200 p-4">
    <div class="w-9 h-9 rounded-xl ${warna} flex items-center justify-center mb-3">
      <i class="${ikon} text-sm"></i></div>
    <p class="text-[11px] font-bold text-slate-400 uppercase tracking-wide">${esc(label)}</p>
    <p class="text-2xl font-black text-slate-800 mt-0.5">${nilai}</p></div>`;
}

function panel(judul, isi, aksi) {
  return `<section class="bg-white rounded-2xl border border-slate-200 overflow-hidden">
    <div class="px-4 sm:px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-3">
      <h3 class="font-black text-slate-800 text-sm">${esc(judul)}</h3>
      <div class="flex items-center gap-2">${aksi || ''}</div>
    </div>${isi}</section>`;
}

function pager(id, page, total, size) {
  const pages = Math.max(1, Math.ceil(total / size));
  return `<div class="px-4 py-3 border-t border-slate-100 flex items-center justify-between gap-3 text-xs">
    <span class="text-slate-400">Halaman ${page} dari ${pages} · ${total} data</span>
    <span class="flex gap-2">
      <button class="btn-ghost !py-1.5" ${page<=1?'disabled':''} data-pg="${id}:${page-1}">
        <i class="fa-solid fa-chevron-left text-[10px]"></i>Sebelumnya</button>
      <button class="btn-ghost !py-1.5" ${page>=pages?'disabled':''} data-pg="${id}:${page+1}">
        Berikutnya<i class="fa-solid fa-chevron-right text-[10px]"></i></button>
    </span></div>`;
}

const badgeKategori = (k) => k==='Ringan' ? 'badge-ringan' : k==='Sedang' ? 'badge-sedang' : 'badge-berat';
const badgeIzin = (s) => s==='Sesuai Waktu' ? 'badge-ok' : s==='Telat Balik' ? 'badge-telat' : 'badge-pending';

async function muatMaster() {
  if (APP.cache.master.length) return APP.cache.master;
  const { data } = await db.from('master_pelanggaran')
    .select('*').order('kode_pelanggaran');
  APP.cache.master = data || [];
  return APP.cache.master;
}

async function muatDaftarKelas() {
  if (APP.cache.kelas.length) return APP.cache.kelas;
  const { data } = await db.from('siswa').select('kelas').not('kelas','is',null);
  APP.cache.kelas = [...new Set((data||[]).map(r => r.kelas))].sort();
  return APP.cache.kelas;
}

// ---------------------------------------------------------------------
// 5. DASHBOARD
// ---------------------------------------------------------------------
async function viewDashboard() {
  const { data: s } = await q(db.rpc('statistik_dashboard'), 'statistik_dashboard');

  $('viewRoot').innerHTML = `
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-5">
      ${kartuStat('Santri Aktif', s.total_santri, 'fa-solid fa-user-group', 'bg-sky-50 text-sky-600')}
      ${kartuStat('Total Pelanggaran', s.total_pelanggaran, 'fa-solid fa-triangle-exclamation', 'bg-rose-50 text-rose-600')}
      ${kartuStat('Izin Pending', s.izin_pending, 'fa-solid fa-clock', 'bg-amber-50 text-amber-600')}
      ${kartuStat('Pembinaan Proses', s.pembinaan_proses, 'fa-solid fa-hands-holding-child', 'bg-violet-50 text-violet-600')}
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
      <div class="lg:col-span-2">
        ${panel('Tren Pelanggaran Mingguan (3 bulan)',
          '<div class="p-4"><div style="height:280px"><canvas id="chTrend"></canvas></div></div>')}
      </div>
      <div>${panel('Proporsi Kategori',
        '<div class="p-4"><div style="height:280px"><canvas id="chKategori"></canvas></div></div>')}</div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
      ${panel('Pelanggaran per Bidang',
        '<div class="p-4"><div style="height:260px"><canvas id="chBidang"></canvas></div></div>')}
      ${panel('5 Pelanggaran Terbanyak', `<div class="p-4 space-y-2">
        ${(s.top_pelanggaran||[]).map((t,i)=>`
          <div class="flex items-center gap-3">
            <span class="w-6 h-6 rounded-lg bg-slate-100 text-slate-500 text-[11px] font-black
                         flex items-center justify-center">${i+1}</span>
            <span class="flex-1 text-sm text-slate-700 truncate">${esc(t.nama)}</span>
            <span class="text-sm font-black text-rose-600">${t.jumlah}x</span>
          </div>`).join('') || '<p class="text-sm text-slate-400 text-center py-6">Belum ada data.</p>'}
      </div>`)}
    </div>`;

  const trend = s.trend_mingguan || [];
  APP.charts.trend = new Chart($('chTrend'), {
    type:'line',
    data:{ labels: trend.map(t => tgl(t.minggu)),
      datasets:[{ label:'Pelanggaran', data: trend.map(t => t.jumlah),
        borderColor:'#0284c7', backgroundColor:'rgba(2,132,199,.12)',
        tension:.38, fill:true, pointRadius:3, borderWidth:2.5 }]},
    options:{ responsive:true, maintainAspectRatio:false,
      plugins:{legend:{display:false}}, scales:{y:{beginAtZero:true, ticks:{precision:0}}}}
  });

  const kat = s.per_kategori || {};
  APP.charts.kategori = new Chart($('chKategori'), {
    type:'doughnut',
    data:{ labels:['Ringan','Sedang','Berat'],
      datasets:[{ data:[kat.Ringan||0, kat.Sedang||0, kat.Berat||0],
        backgroundColor:['#10b981','#f59e0b','#dc2626'] }]},
    options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{position:'bottom'}}}
  });

  const bid = s.per_bidang || [];
  APP.charts.bidang = new Chart($('chBidang'), {
    type:'bar',
    data:{ labels: bid.map(b => b.bidang),
      datasets:[{ label:'Jumlah', data: bid.map(b => b.jumlah),
        backgroundColor:'#6366f1', borderRadius:6 }]},
    options:{ indexAxis:'y', responsive:true, maintainAspectRatio:false,
      plugins:{legend:{display:false}}, scales:{x:{beginAtZero:true, ticks:{precision:0}}}}
  });
}

// ---------------------------------------------------------------------
// 6. PROFIL SANTRI
// ---------------------------------------------------------------------
const stSiswa = { page:1, size:25, cari:'', kelas:'' };

async function viewSiswa() {
  const kelasList = await muatDaftarKelas();
  const from = (stSiswa.page - 1) * stSiswa.size;

  let query = db.from('siswa')
    .select('nisn,nama_siswa,kelas,jenjang,asrama,total_poin_pelanggaran,status_keberadaan',
            { count:'exact' })
    .order('nama_siswa').range(from, from + stSiswa.size - 1);

  if (stSiswa.kelas) query = query.eq('kelas', stSiswa.kelas);
  if (stSiswa.cari) {
    const s = stSiswa.cari.replace(/[%,()]/g, '');
    query = query.or(`nama_siswa.ilike.%${s}%,nisn.ilike.%${s}%`);
  }

  const { data, count } = await q(query, 'siswa');

  $('viewRoot').innerHTML = panel('Daftar Santri', `
    <div class="p-4 flex flex-col sm:flex-row gap-2">
      <input id="cariSiswa" class="form-input sm:max-w-xs" placeholder="Cari nama atau NISN..."
             value="${esc(stSiswa.cari)}">
      <select id="filterKelas" class="form-input sm:max-w-[180px]">
        <option value="">Semua Kelas</option>
        ${kelasList.map(k => `<option ${k===stSiswa.kelas?'selected':''}>${esc(k)}</option>`).join('')}
      </select>
    </div>
    <div class="table-wrap"><table>
      <thead><tr><th>NISN</th><th>Nama Santri</th><th>Kelas</th><th>Status</th>
        <th>Poin</th><th class="text-right">Aksi</th></tr></thead>
      <tbody>${(data||[]).map(s => `
        <tr>
          <td class="td-cell font-mono text-xs text-slate-500">${esc(s.nisn)}</td>
          <td class="td-cell font-bold text-slate-700">${esc(s.nama_siswa)}</td>
          <td class="td-cell">${esc(s.kelas||'-')}
            ${s.jenjang?`<div class="text-[11px] text-slate-400">${esc(s.jenjang)}${s.asrama?' · '+esc(s.asrama):''}</div>`:''}</td>
          <td class="td-cell"><span class="badge ${s.status_keberadaan==='Hadir'?'badge-ok':'badge-pending'}">${esc(s.status_keberadaan)}</span></td>
          <td class="td-cell font-black ${s.total_poin_pelanggaran>=50?'text-rose-600':'text-slate-700'}">${s.total_poin_pelanggaran}</td>
          <td class="td-cell text-right">
            <button class="text-sky-600 font-bold text-xs" data-detail="${esc(s.nisn)}">
              <i class="fa-solid fa-eye"></i> Detail</button></td>
        </tr>`).join('') ||
        '<tr><td colspan="6" class="td-cell text-center text-slate-400 py-10">Tidak ada data.</td></tr>'}
      </tbody></table></div>
    ${pager('siswa', stSiswa.page, count||0, stSiswa.size)}`);

  $('cariSiswa').addEventListener('input', debounce(e => {
    stSiswa.cari = e.target.value.trim(); stSiswa.page = 1; viewSiswa();
  }, 300));
  $('filterKelas').addEventListener('change', e => {
    stSiswa.kelas = e.target.value; stSiswa.page = 1; viewSiswa();
  });
  $('viewRoot').addEventListener('click', e => {
    const d = e.target.closest('[data-detail]');
    if (d) return bukaDetailSantri(d.dataset.detail);
    const p = e.target.closest('[data-pg]');
    if (p) { stSiswa.page = Number(p.dataset.pg.split(':')[1]); viewSiswa(); }
  });
}

async function bukaDetailSantri(nisn) {
  loading(true);
  try {
    const { data } = await q(db.rpc('laporan_santri', { p_nisn: nisn }), 'laporan_santri');
    const s = data.siswa || {};
    const riwayat = data.perkembangan || [];
    const izin = data.perizinan || [];

    await Swal.fire({
      width: 780,
      showConfirmButton: false,
      showCloseButton: true,
      html: `<div class="text-left">
        <div class="flex items-start justify-between gap-3 pb-3 border-b border-slate-200">
          <div>
            <p class="text-lg font-black text-slate-800">${esc(s.nama_siswa)}</p>
            <p class="text-xs text-slate-400">NISN ${esc(s.nisn)} · Kelas ${esc(s.kelas||'-')}
              ${s.jenjang?' · '+esc(s.jenjang):''}${s.asrama?' · Asrama '+esc(s.asrama):''}</p>
          </div>
          <div class="text-right">
            <p class="text-2xl font-black ${s.total_poin_pelanggaran>=50?'text-rose-600':'text-slate-700'}">${s.total_poin_pelanggaran||0}</p>
            <p class="text-[10px] text-slate-400 font-bold uppercase">Total Poin</p>
          </div>
        </div>

        <div class="flex gap-2 py-3">
          ${bolehCetak() ? `<button class="btn-primary" onclick="cetakLaporan('${esc(nisn)}')">
            <i class="fa-solid fa-print"></i>Cetak Laporan</button>` : ''}
          ${bolehTulis() ? `<button class="btn-ghost" onclick="resetStatus('${esc(nisn)}')">
            <i class="fa-solid fa-rotate-left"></i>Reset ke Hadir</button>` : ''}
        </div>

        <div style="max-height:46vh;overflow:auto" class="space-y-2 pr-1">
          ${riwayat.map(r => `
            <div class="flex gap-3 p-3 rounded-xl border border-rose-100 bg-rose-50/40">
              <div class="w-8 h-8 rounded-lg bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                <i class="fa-solid fa-triangle-exclamation text-xs"></i></div>
              <div class="flex-1 min-w-0">
                <div class="flex items-start justify-between gap-2">
                  <p class="font-bold text-sm text-slate-700">${esc(r.judul)}</p>
                  <span class="badge ${badgeKategori(r.kategori)} shrink-0">${esc(r.kategori)} · ${r.poin}</span>
                </div>
                <p class="text-[11px] text-slate-400 mt-0.5">${tgl(r.tanggal)} · ${esc(r.bidang)} · ${esc(r.penindak||'-')}</p>
                ${r.catatan?`<p class="text-xs text-slate-500 mt-1">${esc(r.catatan)}</p>`:''}
              </div></div>`).join('')}
          ${izin.map(z => `
            <div class="flex gap-3 p-3 rounded-xl border border-emerald-100 bg-emerald-50/40">
              <div class="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
                <i class="fa-solid fa-door-open text-xs"></i></div>
              <div class="flex-1 min-w-0">
                <div class="flex items-start justify-between gap-2">
                  <p class="font-bold text-sm text-slate-700">Izin ${esc(z.jenis_izin)}</p>
                  <span class="badge ${badgeIzin(z.status_persetujuan)} shrink-0">${esc(z.status_persetujuan)}</span>
                </div>
                <p class="text-[11px] text-slate-400 mt-0.5">${tgl(z.tanggal_mulai)} s/d ${tgl(z.tanggal_selesai)}</p>
                <p class="text-xs text-slate-500 mt-1">${esc(z.alasan||'-')}</p>
              </div></div>`).join('')}
          ${(!riwayat.length && !izin.length)
            ? '<p class="text-sm text-slate-400 text-center py-8">Belum ada riwayat.</p>' : ''}
        </div></div>`
    });
  } catch (err) { fireError(err); }
  finally { loading(false); }
}

async function resetStatus(nisn) {
  try {
    await q(db.rpc('reset_status_keberadaan', { p_nisn: nisn }), 'reset_status');
    Swal.close(); toast('success', 'Status dikembalikan ke Hadir'); viewSiswa();
  } catch (err) { fireError(err); }
}

// ---------------------------------------------------------------------
// 7. CATATAN PELANGGARAN
// ---------------------------------------------------------------------
const stPlg = { page:1, size:25, cari:'', kategori:'', sumber:'', kelas:'', dari:'', sampai:'' };

async function viewPelanggaran() {
  const kelasList = await muatDaftarKelas();
  const from = (stPlg.page - 1) * stPlg.size;

  let query = db.from('detail_data').select('*', { count:'exact' })
    .neq('status','Archived').order('tanggal', { ascending:false })
    .range(from, from + stPlg.size - 1);

  if (stPlg.kategori) query = query.eq('kategori', stPlg.kategori);
  if (stPlg.sumber)   query = query.eq('sumber', stPlg.sumber);
  if (stPlg.kelas)    query = query.eq('kelas', stPlg.kelas);
  if (stPlg.dari)     query = query.gte('tanggal', stPlg.dari);
  if (stPlg.sampai)   query = query.lte('tanggal', stPlg.sampai);
  if (stPlg.cari) {
    const s = stPlg.cari.replace(/[%,()]/g,'');
    query = query.or(`nama_siswa.ilike.%${s}%,nisn.ilike.%${s}%,nama_pelanggaran.ilike.%${s}%`);
  }

  const { data, count } = await q(query, 'detail_data');

  $('viewRoot').innerHTML = panel('Catatan Pelanggaran', `
    <div class="p-4 grid grid-cols-2 lg:grid-cols-6 gap-2">
      <input id="plgCari" class="form-input col-span-2" placeholder="Cari santri / pelanggaran..."
             value="${esc(stPlg.cari)}">
      <select id="plgKategori" class="form-input">
        <option value="">Semua Kategori</option>
        ${['Ringan','Sedang','Berat'].map(k=>`<option ${k===stPlg.kategori?'selected':''}>${k}</option>`).join('')}
      </select>
      <select id="plgSumber" class="form-input">
        <option value="">Semua Unit</option>
        ${['Pengasuhan','Madrasah'].map(k=>`<option ${k===stPlg.sumber?'selected':''}>${k}</option>`).join('')}
      </select>
      <select id="plgKelas" class="form-input">
        <option value="">Semua Kelas</option>
        ${kelasList.map(k=>`<option ${k===stPlg.kelas?'selected':''}>${esc(k)}</option>`).join('')}
      </select>
      <div class="flex gap-1">
        <input id="plgDari" type="date" class="form-input !px-2 text-xs" value="${stPlg.dari}">
        <input id="plgSampai" type="date" class="form-input !px-2 text-xs" value="${stPlg.sampai}">
      </div>
    </div>
    <div class="table-wrap"><table>
      <thead><tr><th>Tanggal</th><th>Santri</th><th>Pelanggaran</th><th>Kategori</th>
        <th>Poin</th><th>Bidang</th><th>Penindak</th><th class="text-right">Aksi</th></tr></thead>
      <tbody>${(data||[]).map(r=>`
        <tr>
          <td class="td-cell text-xs text-slate-500 whitespace-nowrap">${tgl(r.tanggal)}</td>
          <td class="td-cell"><p class="font-bold text-slate-700">${esc(r.nama_siswa)}</p>
            <p class="text-[11px] text-slate-400">${esc(r.nisn)} · ${esc(r.kelas)}</p></td>
          <td class="td-cell text-slate-700">${esc(r.nama_pelanggaran)}</td>
          <td class="td-cell"><span class="badge ${badgeKategori(r.kategori)}">${esc(r.kategori)}</span></td>
          <td class="td-cell font-black text-rose-600">${r.bobot_pelanggaran}</td>
          <td class="td-cell text-xs text-sky-700 font-semibold">${esc(r.bidang)}</td>
          <td class="td-cell text-xs text-slate-500">${esc(r.penindak)}</td>
          <td class="td-cell text-right">${bolehTulis()?`
            <button class="text-rose-600 text-xs font-bold" data-arsip="${esc(r.id_log)}">
              <i class="fa-solid fa-box-archive"></i> Arsip</button>`:''}</td>
        </tr>`).join('') ||
        '<tr><td colspan="8" class="td-cell text-center text-slate-400 py-10">Tidak ada data.</td></tr>'}
      </tbody></table></div>
    ${pager('plg', stPlg.page, count||0, stPlg.size)}`,
    bolehTulis() ? `<button class="btn-primary" id="btnAddPlg"><i class="fa-solid fa-plus"></i>Catat Pelanggaran</button>` : ''
  );

  $('plgCari').addEventListener('input', debounce(e => {
    stPlg.cari = e.target.value.trim(); stPlg.page=1; viewPelanggaran(); }, 300));
  ['plgKategori','plgSumber','plgKelas','plgDari','plgSampai'].forEach(id => {
    $(id).addEventListener('change', e => {
      const map = { plgKategori:'kategori', plgSumber:'sumber', plgKelas:'kelas',
                    plgDari:'dari', plgSampai:'sampai' };
      stPlg[map[id]] = e.target.value; stPlg.page=1; viewPelanggaran();
    });
  });
  if ($('btnAddPlg')) $('btnAddPlg').addEventListener('click', modalCatatPelanggaran);

  $('viewRoot').addEventListener('click', e => {
    const a = e.target.closest('[data-arsip]');
    if (a) return arsipkanPelanggaran(a.dataset.arsip);
    const p = e.target.closest('[data-pg]');
    if (p) { stPlg.page = Number(p.dataset.pg.split(':')[1]); viewPelanggaran(); }
  });
}

async function modalCatatPelanggaran(prefill) {
  const master = await muatMaster();
  const p = prefill || {};

  const res = await Swal.fire({
    title: 'Catat Pelanggaran', width: 560, showCancelButton: true,
    confirmButtonText: 'Simpan', cancelButtonText: 'Batal', confirmButtonColor: '#0284c7',
    showLoaderOnConfirm: true, allowOutsideClick: () => !Swal.isLoading(),
    html: `<div class="text-left space-y-3">
      <div>
        <label class="form-label">Santri (ketik nama / NISN)</label>
        <input id="fNisn" class="form-input" list="dlSiswa" autocomplete="off"
               placeholder="Ketik minimal 2 huruf..." value="${esc(p.nisnLabel||'')}">
        <datalist id="dlSiswa"></datalist>
      </div>
      <div>
        <label class="form-label">Jenis Pelanggaran</label>
        <select id="fKode" class="form-input">
          <option value="">— pilih —</option>
          ${master.map(m => `<option value="${esc(m.kode_pelanggaran)}" ${p.kode===m.kode_pelanggaran?'selected':''}>
            ${esc(m.kode_pelanggaran)} — ${esc(m.nama_pelanggaran)} (${esc(m.kategori)}, ${m.bobot_poin} poin)
          </option>`).join('')}
        </select>
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div><label class="form-label">Tanggal</label>
          <input id="fTanggal" type="date" class="form-input" value="${p.tanggal||hariIni()}"></div>
        <div><label class="form-label">Catatan</label>
          <input id="fCatatan" class="form-input" placeholder="opsional" value="${esc(p.catatan||'')}"></div>
      </div></div>`,
    didOpen: () => {
      const input = document.getElementById('fNisn');
      const dl = document.getElementById('dlSiswa');
      input.addEventListener('input', debounce(async () => {
        const s = input.value.trim().replace(/[%,()]/g,'');
        if (s.length < 2) return;
        const { data } = await db.from('siswa')
          .select('nisn,nama_siswa,kelas')
          .or(`nama_siswa.ilike.%${s}%,nisn.ilike.%${s}%`).limit(15);
        dl.innerHTML = (data||[]).map(x =>
          `<option value="${x.nisn} - ${x.nama_siswa} (${x.kelas||'-'})">`).join('');
      }, 250));
    },
    preConfirm: async () => {
      const nisn = document.getElementById('fNisn').value.split(' - ')[0].trim();
      const kode = document.getElementById('fKode').value;
      if (!nisn) { Swal.showValidationMessage('Santri belum dipilih.'); return false; }
      if (!kode) { Swal.showValidationMessage('Jenis pelanggaran belum dipilih.'); return false; }
      const payload = {
        p_nisn: nisn, p_kode: kode,
        p_tanggal: document.getElementById('fTanggal').value,
        p_catatan: document.getElementById('fCatatan').value.trim(),
        p_force: !!(prefill && prefill.force)
      };
      const { data, error } = await db.rpc('catat_pelanggaran', payload);
      if (error) { Swal.showValidationMessage(error.message); return false; }
      return { hasil: data, payload, label: document.getElementById('fNisn').value };
    }
  });

  if (!res.isConfirmed) return;
  const { hasil, payload, label } = res.value;

  // Cross-check izin: pengguna diminta menegaskan (port dari alur lama Anda)
  if (hasil.conflict) {
    const konf = await Swal.fire({
      icon: 'warning', title: 'Terdeteksi Izin yang Sesuai Waktu',
      html: `<p class="text-sm text-left">${esc(hasil.message)}</p>`,
      showCancelButton: true, confirmButtonText: 'Tetap Catat Pelanggaran',
      cancelButtonText: 'Batalkan', confirmButtonColor: '#dc2626'
    });
    if (konf.isConfirmed) {
      return modalCatatPelanggaran({
        nisnLabel: label, kode: payload.p_kode,
        tanggal: payload.p_tanggal, catatan: payload.p_catatan, force: true
      });
    }
    return;
  }

  toast('success', `Tersimpan. Total poin santri: ${hasil.poin_baru}`);
  viewPelanggaran();
}

async function arsipkanPelanggaran(idLog) {
  const r = await Swal.fire({ icon:'warning', title:'Arsipkan catatan ini?',
    text:'Poin santri akan dikurangi kembali secara otomatis.',
    showCancelButton:true, confirmButtonText:'Ya, arsipkan', cancelButtonText:'Batal',
    confirmButtonColor:'#dc2626' });
  if (!r.isConfirmed) return;
  try {
    const { data } = await q(db.rpc('arsipkan_pelanggaran', { p_id_log: idLog }), 'arsip');
    toast('success', `Diarsipkan. Poin sekarang: ${data.poin_baru}`);
    viewPelanggaran();
  } catch (err) { fireError(err); }
}

// ---------------------------------------------------------------------
// 8. PUSAT PERIZINAN
// ---------------------------------------------------------------------
const stIzin = { filter:'Semua' };

async function viewPerizinan() {
  let query = db.from('log_perizinan')
    .select('*, siswa!inner(nama_siswa,kelas)')
    .order('tanggal_mulai', { ascending:false }).limit(60);
  if (stIzin.filter !== 'Semua') query = query.eq('status_persetujuan', stIzin.filter);

  const { data } = await q(query, 'log_perizinan');

  $('viewRoot').innerHTML = panel('Pusat Perizinan', `
    <div class="p-4 flex flex-wrap gap-2">
      ${['Semua','Pending','Sesuai Waktu','Telat Balik'].map(f => `
        <button class="${f===stIzin.filter?'btn-primary':'btn-ghost'}" data-filter="${f}">${f}</button>`).join('')}
    </div>
    <div class="p-4 pt-0 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
      ${(data||[]).map(p => `
        <div class="bg-white rounded-2xl border border-slate-200 p-4 flex flex-col gap-3">
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0">
              <p class="font-bold text-slate-800 text-sm truncate">${esc(p.siswa?.nama_siswa||'-')}</p>
              <p class="text-xs text-slate-400">${esc(p.siswa?.kelas||'-')}</p>
            </div>
            <span class="badge ${badgeIzin(p.status_persetujuan)} shrink-0">${esc(p.status_persetujuan)}</span>
          </div>
          <div class="text-xs text-slate-500 space-y-1">
            <p><i class="fa-regular fa-calendar-days w-4 text-slate-400"></i>
               ${tgl(p.tanggal_mulai)} s/d ${tgl(p.tanggal_selesai)} · ${esc(p.jenis_izin||'-')}</p>
            <p class="line-clamp-2"><i class="fa-regular fa-comment-dots w-4 text-slate-400"></i> ${esc(p.alasan||'-')}</p>
            <p><i class="fa-regular fa-user w-4 text-slate-400"></i> ${esc(p.pemberi_izin||'-')}</p>
          </div>
          ${p.status_persetujuan==='Pending' && bolehTulis() ? `
            <div class="flex gap-2 pt-2 border-t border-slate-100">
              <button class="btn-ghost flex-1 justify-center !text-rose-600 !border-rose-200"
                      data-izin="${esc(p.id_izin)}|Telat Balik">Telat Balik</button>
              <button class="btn-primary flex-1 justify-center"
                      data-izin="${esc(p.id_izin)}|Sesuai Waktu">Sesuai Waktu</button>
            </div>` : ''}
        </div>`).join('') ||
        '<p class="text-sm text-slate-400 col-span-full text-center py-10">Tidak ada data perizinan.</p>'}
    </div>`,
    bolehTulis() ? `<button class="btn-primary" id="btnAddIzin"><i class="fa-solid fa-plus"></i>Ajukan Izin</button>` : ''
  );

  $('viewRoot').addEventListener('click', async e => {
    const f = e.target.closest('[data-filter]');
    if (f) { stIzin.filter = f.dataset.filter; return viewPerizinan(); }
    const i = e.target.closest('[data-izin]');
    if (i) {
      const [id, keputusan] = i.dataset.izin.split('|');
      const r = await Swal.fire({ icon: keputusan==='Sesuai Waktu'?'question':'warning',
        title: `Tandai "${keputusan}"?`,
        text: keputusan==='Sesuai Waktu' ? 'Status keberadaan santri akan diperbarui otomatis.' : '',
        showCancelButton:true, confirmButtonText:'Ya', cancelButtonText:'Batal',
        confirmButtonColor: keputusan==='Sesuai Waktu' ? '#0284c7' : '#d97706' });
      if (!r.isConfirmed) return;
      try {
        await q(db.rpc('proses_perizinan', { p_id_izin:id, p_keputusan:keputusan }), 'proses_izin');
        toast('success', 'Status izin: ' + keputusan);
        viewPerizinan(); refreshBadgePending();
      } catch (err) { fireError(err); }
    }
  });

  if ($('btnAddIzin')) $('btnAddIzin').addEventListener('click', modalAjukanIzin);
}

async function modalAjukanIzin() {
  const res = await Swal.fire({
    title:'Ajukan Perizinan', width:520, showCancelButton:true,
    confirmButtonText:'Simpan', cancelButtonText:'Batal', confirmButtonColor:'#0284c7',
    showLoaderOnConfirm:true, allowOutsideClick:()=>!Swal.isLoading(),
    html:`<div class="text-left space-y-3">
      <div><label class="form-label">Santri</label>
        <input id="zNisn" class="form-input" list="dlIzin" autocomplete="off"
               placeholder="Ketik nama / NISN..."><datalist id="dlIzin"></datalist></div>
      <div class="grid grid-cols-2 gap-3">
        <div><label class="form-label">Tanggal Mulai</label>
          <input id="zMulai" type="date" class="form-input" value="${hariIni()}"></div>
        <div><label class="form-label">Tanggal Selesai</label>
          <input id="zSelesai" type="date" class="form-input" value="${hariIni()}"></div>
      </div>
      <div><label class="form-label">Jenis Izin</label>
        <select id="zJenis" class="form-input">
          <option>Keperluan</option><option>Sakit</option><option>Pemberitahuan</option>
        </select></div>
      <div><label class="form-label">Alasan</label>
        <textarea id="zAlasan" class="form-input" rows="2"></textarea></div>
    </div>`,
    didOpen: () => {
      const inp = document.getElementById('zNisn'), dl = document.getElementById('dlIzin');
      inp.addEventListener('input', debounce(async () => {
        const s = inp.value.trim().replace(/[%,()]/g,'');
        if (s.length < 2) return;
        const { data } = await db.from('siswa').select('nisn,nama_siswa,kelas')
          .or(`nama_siswa.ilike.%${s}%,nisn.ilike.%${s}%`).limit(15);
        dl.innerHTML = (data||[]).map(x =>
          `<option value="${x.nisn} - ${x.nama_siswa} (${x.kelas||'-'})">`).join('');
      }, 250));
    },
    preConfirm: async () => {
      const nisn = document.getElementById('zNisn').value.split(' - ')[0].trim();
      if (!nisn) { Swal.showValidationMessage('Santri belum dipilih.'); return false; }
      const { error } = await db.rpc('ajukan_perizinan', {
        p_nisn: nisn,
        p_mulai: document.getElementById('zMulai').value,
        p_selesai: document.getElementById('zSelesai').value,
        p_jenis: document.getElementById('zJenis').value,
        p_alasan: document.getElementById('zAlasan').value.trim()
      });
      if (error) { Swal.showValidationMessage(error.message); return false; }
      return true;
    }
  });
  if (res.isConfirmed) { toast('success','Permohonan izin tersimpan'); viewPerizinan(); refreshBadgePending(); }
}

async function refreshBadgePending() {
  if (!bolehPerizinan()) return;
  const { count } = await db.from('log_perizinan')
    .select('id_izin', { count:'exact', head:true }).eq('status_persetujuan','Pending');
  const b = $('badgePending');
  b.textContent = count > 99 ? '99+' : String(count || 0);
  b.classList.toggle('hidden', !count);
}

// ---------------------------------------------------------------------
// 9. PEMBINAAN
// ---------------------------------------------------------------------
async function viewPembinaan() {
  const { data } = await q(db.from('log_pembinaan')
    .select('*, siswa(nama_siswa,kelas)')
    .order('tanggal_pembinaan', { ascending:false }).limit(200), 'log_pembinaan');

  const rows = data || [];
  const proses = rows.filter(r => r.status_pembinaan !== 'Selesai').length;

  $('viewRoot').innerHTML = `
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
      ${kartuStat('Total Instruksi', rows.length, 'fa-solid fa-list', 'bg-slate-100 text-slate-600')}
      ${kartuStat('Dalam Proses', proses, 'fa-solid fa-hourglass-half', 'bg-amber-50 text-amber-600')}
      ${kartuStat('Selesai', rows.length-proses, 'fa-solid fa-circle-check', 'bg-emerald-50 text-emerald-600')}
      ${kartuStat('Otomatis', rows.filter(r=>r.mode_pembinaan==='Otomatis').length,
        'fa-solid fa-robot', 'bg-sky-50 text-sky-600')}
    </div>
    ${panel('Instruksi Pembinaan', `<div class="table-wrap"><table>
      <thead><tr><th>Tanggal</th><th>Santri</th><th>Kategori</th><th>Tahap</th>
        <th>Bentuk Pembinaan</th><th>Pemicu</th><th>Status</th><th class="text-right">Aksi</th></tr></thead>
      <tbody>${rows.map(r=>{
        const selesai = r.status_pembinaan === 'Selesai';
        return `<tr>
          <td class="td-cell text-xs whitespace-nowrap">${tgl(r.tanggal_pembinaan)}</td>
          <td class="td-cell"><p class="font-bold text-slate-700">${esc(r.siswa?.nama_siswa||'-')}</p>
            <p class="text-[11px] text-slate-400">${esc(r.nisn)} · ${esc(r.siswa?.kelas||'-')}</p></td>
          <td class="td-cell"><span class="badge ${badgeKategori(r.kategori)}">${esc(r.kategori)}</span></td>
          <td class="td-cell text-center"><span class="text-xs font-black text-sky-700">Ke-${r.pengulangan_ke}</span></td>
          <td class="td-cell font-semibold text-slate-700">${esc(r.bentuk_pembinaan)}</td>
          <td class="td-cell text-xs text-slate-500">${esc(r.deskripsi_pelanggaran||'-')}</td>
          <td class="td-cell"><span class="badge ${selesai?'badge-ok':'badge-pending'}">${esc(r.status_pembinaan)}</span></td>
          <td class="td-cell text-right">${bolehTulis()?`
            <button class="btn-ghost !py-1.5 ${selesai?'!text-amber-700':'!text-emerald-700'}"
              data-pbn="${esc(r.id_pembinaan)}|${selesai?'Dalam Proses':'Selesai'}">
              ${selesai?'Buka Lagi':'Selesaikan'}</button>`:''}</td>
        </tr>`;}).join('') ||
        '<tr><td colspan="8" class="td-cell text-center text-slate-400 py-10">Belum ada instruksi pembinaan.</td></tr>'}
      </tbody></table></div>`)}`;

  $('viewRoot').addEventListener('click', async e => {
    const b = e.target.closest('[data-pbn]');
    if (!b) return;
    const [id, status] = b.dataset.pbn.split('|');
    try {
      await q(db.rpc('ubah_status_pembinaan', { p_id:id, p_status:status }), 'pembinaan');
      toast('success', 'Status pembinaan: ' + status);
      viewPembinaan();
    } catch (err) { fireError(err); }
  });
}

// ---------------------------------------------------------------------
// 10. MASTER PELANGGARAN
// ---------------------------------------------------------------------
async function viewMaster() {
  APP.cache.master = [];
  const master = await muatMaster();
  const { data: bidang } = await db.from('master_bidang').select('*').order('nama_bidang');
  APP.cache.bidang = bidang || [];

  $('viewRoot').innerHTML = panel('Master Pelanggaran', `
    <div class="table-wrap"><table>
      <thead><tr><th>Kode</th><th>Nama Pelanggaran</th><th>Kategori</th>
        <th>Bobot</th><th>Sumber</th><th>Bidang</th><th>Jenjang</th></tr></thead>
      <tbody>${master.map(m=>`<tr>
        <td class="td-cell font-mono text-xs">${esc(m.kode_pelanggaran)}</td>
        <td class="td-cell font-bold text-slate-700">${esc(m.nama_pelanggaran)}</td>
        <td class="td-cell"><span class="badge ${badgeKategori(m.kategori)}">${esc(m.kategori)}</span></td>
        <td class="td-cell font-black">${m.bobot_poin}</td>
        <td class="td-cell text-xs">${esc(m.sumber)}</td>
        <td class="td-cell text-xs font-semibold text-sky-700">${esc(m.bidang)}</td>
        <td class="td-cell text-xs">${esc(m.jenjang)}</td></tr>`).join('') ||
        '<tr><td colspan="7" class="td-cell text-center text-slate-400 py-10">Belum ada master.</td></tr>'}
      </tbody></table></div>`,
    isAdmin() ? `<button class="btn-primary" id="btnAddMaster"><i class="fa-solid fa-plus"></i>Tambah</button>` : ''
  );

  if ($('btnAddMaster')) $('btnAddMaster').addEventListener('click', async () => {
    const res = await Swal.fire({
      title:'Tambah Jenis Pelanggaran', width:560, showCancelButton:true,
      confirmButtonText:'Simpan', cancelButtonText:'Batal', confirmButtonColor:'#0284c7',
      showLoaderOnConfirm:true, allowOutsideClick:()=>!Swal.isLoading(),
      html:`<div class="text-left space-y-3">
        <div class="grid grid-cols-2 gap-3">
          <div><label class="form-label">Kode</label><input id="mKode" class="form-input"></div>
          <div><label class="form-label">Bobot Poin</label>
            <input id="mBobot" type="number" class="form-input" value="5"></div>
        </div>
        <div><label class="form-label">Nama Pelanggaran</label><input id="mNama" class="form-input"></div>
        <div class="grid grid-cols-3 gap-3">
          <div><label class="form-label">Kategori</label><select id="mKategori" class="form-input">
            <option>Ringan</option><option>Sedang</option><option>Berat</option></select></div>
          <div><label class="form-label">Sumber</label><select id="mSumber" class="form-input">
            <option>Pengasuhan</option><option>Madrasah</option></select></div>
          <div><label class="form-label">Jenjang</label><select id="mJenjang" class="form-input">
            <option>Semua</option><option>MTs</option><option>MA</option></select></div>
        </div>
        <div><label class="form-label">Bidang</label><select id="mBidang" class="form-input">
          ${APP.cache.bidang.map(b=>`<option>${esc(b.nama_bidang)}</option>`).join('')}
        </select></div></div>`,
      preConfirm: async () => {
        const payload = {
          kode_pelanggaran: document.getElementById('mKode').value.trim(),
          nama_pelanggaran: document.getElementById('mNama').value.trim(),
          kategori: document.getElementById('mKategori').value,
          bobot_poin: Number(document.getElementById('mBobot').value) || 0,
          sumber: document.getElementById('mSumber').value,
          bidang: document.getElementById('mBidang').value,
          jenjang: document.getElementById('mJenjang').value
        };
        if (!payload.kode_pelanggaran || !payload.nama_pelanggaran) {
          Swal.showValidationMessage('Kode dan nama wajib diisi.'); return false;
        }
        const { error } = await db.from('master_pelanggaran').insert(payload);
        if (error) { Swal.showValidationMessage(error.message); return false; }
        return true;
      }
    });
    if (res.isConfirmed) { toast('success','Master pelanggaran ditambahkan'); viewMaster(); }
  });
}

// ---------------------------------------------------------------------
// 11. PENGGUNA (Admin)
// ---------------------------------------------------------------------
async function viewPengguna() {
  const { data } = await q(db.from('profiles').select('*').order('nama'), 'profiles');

  $('viewRoot').innerHTML = panel('Manajemen Pengguna', `
    <div class="px-5 py-3 bg-sky-50 border-b border-sky-100 text-xs text-sky-800">
      <i class="fa-solid fa-circle-info mr-1"></i>
      Akun baru dibuat di <b>Dashboard Supabase &gt; Authentication &gt; Users</b>,
      lalu peran dan kelas binaannya diatur di sini.
    </div>
    <div class="table-wrap"><table>
      <thead><tr><th>Username</th><th>Nama</th><th>Peran</th><th>Kelas Binaan</th>
        <th>Unit</th><th>Status</th><th class="text-right">Aksi</th></tr></thead>
      <tbody>${(data||[]).map(u=>`<tr>
        <td class="td-cell font-mono text-xs">${esc(u.username)}</td>
        <td class="td-cell font-bold text-slate-700">${esc(u.nama)}</td>
        <td class="td-cell"><span class="badge ${u.role==='Admin'?'badge-ok':'badge-pending'}">${esc(u.role)}</span></td>
        <td class="td-cell text-xs">${esc((u.kelas_binaan||[]).join(', ') || '-')}</td>
        <td class="td-cell text-xs">${esc(u.unit_akses)}${u.jenjang_akses!=='Semua'?' · '+esc(u.jenjang_akses):''}</td>
        <td class="td-cell text-xs">${u.aktif?'Aktif':'Nonaktif'}</td>
        <td class="td-cell text-right">
          <button class="text-sky-600 text-xs font-bold" data-edit="${esc(u.id)}">
            <i class="fa-solid fa-pen-to-square"></i> Ubah</button></td>
      </tr>`).join('')}</tbody></table></div>`);

  $('viewRoot').addEventListener('click', async e => {
    const b = e.target.closest('[data-edit]');
    if (!b) return;
    const u = (data||[]).find(x => x.id === b.dataset.edit);
    const res = await Swal.fire({
      title:'Ubah Pengguna', width:520, showCancelButton:true,
      confirmButtonText:'Simpan', cancelButtonText:'Batal', confirmButtonColor:'#0284c7',
      showLoaderOnConfirm:true, allowOutsideClick:()=>!Swal.isLoading(),
      html:`<div class="text-left space-y-3">
        <div><label class="form-label">Nama</label>
          <input id="uNama" class="form-input" value="${esc(u.nama)}"></div>
        <div><label class="form-label">Peran</label><select id="uRole" class="form-input">
          ${['Admin','Guru','Walas','Guru BK','Guru Piket','Ustadz GEN-Z','Osis','Pimpinan']
            .map(r=>`<option ${r===u.role?'selected':''}>${r}</option>`).join('')}
        </select></div>
        <div><label class="form-label">Kelas Binaan (pisahkan koma)</label>
          <input id="uKelas" class="form-input" value="${esc((u.kelas_binaan||[]).join(', '))}"></div>
        <div class="grid grid-cols-2 gap-3">
          <div><label class="form-label">Unit Akses</label><select id="uUnit" class="form-input">
            ${['Semua','Pengasuhan','Madrasah'].map(x=>`<option ${x===u.unit_akses?'selected':''}>${x}</option>`).join('')}
          </select></div>
          <div><label class="form-label">Status</label><select id="uAktif" class="form-input">
            <option value="true" ${u.aktif?'selected':''}>Aktif</option>
            <option value="false" ${!u.aktif?'selected':''}>Nonaktif</option>
          </select></div>
        </div></div>`,
      preConfirm: async () => {
        const { error } = await db.from('profiles').update({
          nama: document.getElementById('uNama').value.trim(),
          role: document.getElementById('uRole').value,
          kelas_binaan: document.getElementById('uKelas').value
            .split(',').map(x=>x.trim()).filter(Boolean),
          unit_akses: document.getElementById('uUnit').value,
          aktif: document.getElementById('uAktif').value === 'true'
        }).eq('id', u.id);
        if (error) { Swal.showValidationMessage(error.message); return false; }
        return true;
      }
    });
    if (res.isConfirmed) { toast('success','Pengguna diperbarui'); viewPengguna(); }
  });
}

// ---------------------------------------------------------------------
// 12. CETAK LAPORAN
// ---------------------------------------------------------------------
async function cetakLaporan(nisn) {
  loading(true);
  try {
    const { data } = await q(db.rpc('laporan_santri', { p_nisn: nisn }), 'laporan_santri');
    const s = data.siswa || {};
    const dicetak = new Date().toLocaleDateString('id-ID',
      { day:'2-digit', month:'long', year:'numeric' });

    const baris = (arr, kolom, kosong) => arr.length
      ? arr.map(kolom).join('')
      : `<tr><td colspan="9" style="text-align:center;padding:10px;color:#94a3b8;">${kosong}</td></tr>`;

    const th = (t) => `<th style="border:1px solid #cbd5e1;padding:5px;">${t}</th>`;
    const td = (t, c) => `<td style="border:1px solid #cbd5e1;padding:5px;${c||''}">${esc(t)}</td>`;

    $('printArea').innerHTML = `
      <div style="font-family:Arial,sans-serif;color:#1e293b;padding:16px;">
        <div style="text-align:center;border-bottom:2px solid #1e293b;padding-bottom:12px;margin-bottom:16px;">
          <h1 style="font-size:17px;margin:0;">LAPORAN PERKEMBANGAN SANTRI</h1>
          <p style="font-size:11px;margin:4px 0 0;color:#64748b;">Dayah Ruhul Qurani · Dicetak ${dicetak}</p>
        </div>

        <table style="width:100%;font-size:12px;margin-bottom:16px;">
          <tr><td style="width:170px;padding:2px 0;"><b>Nama Santri</b></td><td>: ${esc(s.nama_siswa)}</td></tr>
          <tr><td style="padding:2px 0;"><b>NISN</b></td><td>: ${esc(s.nisn)}</td></tr>
          <tr><td style="padding:2px 0;"><b>Jenjang / Kelas</b></td><td>: ${esc(s.jenjang||'-')} / ${esc(s.kelas||'-')}</td></tr>
          <tr><td style="padding:2px 0;"><b>Asrama</b></td><td>: ${esc(s.asrama||'-')}</td></tr>
          <tr><td style="padding:2px 0;"><b>Total Poin</b></td><td>: ${s.total_poin_pelanggaran||0}</td></tr>
        </table>

        <h3 style="font-size:13px;border-bottom:1px solid #cbd5e1;padding-bottom:4px;">1. Presensi Madrasah</h3>
        <table style="width:100%;font-size:11px;border-collapse:collapse;margin-bottom:16px;">
          <thead><tr style="background:#f1f5f9;">${['Bulan','Hadir','Izin','Sakit','Alpa'].map(th).join('')}</tr></thead>
          <tbody>${baris(data.presensi||[], p =>
            `<tr>${td(p.bulan)}${td(p.hadir,'text-align:center')}${td(p.izin,'text-align:center')}${td(p.sakit,'text-align:center')}${td(p.alpa,'text-align:center')}</tr>`,
            'Belum ada data presensi.')}</tbody>
        </table>

        <h3 style="font-size:13px;border-bottom:1px solid #cbd5e1;padding-bottom:4px;">2. Akumulasi Perkembangan</h3>
        <table style="width:100%;font-size:11px;border-collapse:collapse;margin-bottom:16px;">
          <thead><tr style="background:#f1f5f9;">${['Kategori','Catatan','Jumlah'].map(th).join('')}</tr></thead>
          <tbody>${baris(data.rekap||[], r =>
            `<tr>${td(r.kategori)}${td(r.deskripsi)}${td(r.jumlah,'text-align:center')}</tr>`,
            'Tidak ada akumulasi.')}</tbody>
        </table>

        <h3 style="font-size:13px;border-bottom:1px solid #cbd5e1;padding-bottom:4px;">3. Riwayat Perkembangan</h3>
        <table style="width:100%;font-size:10.5px;border-collapse:collapse;margin-bottom:16px;">
          <thead><tr style="background:#f1f5f9;">
            ${['Tanggal','Bidang','Catatan','Kategori','Poin','Petugas','Keterangan'].map(th).join('')}</tr></thead>
          <tbody>${baris((data.perkembangan||[]).slice().reverse(), p =>
            `<tr>${td(tgl(p.tanggal))}${td(p.bidang)}${td(p.judul)}${td(p.kategori)}${td(p.poin,'text-align:center')}${td(p.penindak||'-')}${td(p.catatan||'-')}</tr>`,
            'Tidak ada catatan.')}</tbody>
        </table>

        <h3 style="font-size:13px;border-bottom:1px solid #cbd5e1;padding-bottom:4px;">4. Riwayat Perizinan</h3>
        <table style="width:100%;font-size:11px;border-collapse:collapse;margin-bottom:16px;">
          <thead><tr style="background:#f1f5f9;">
            ${['Mulai','Selesai','Jenis','Alasan','Status'].map(th).join('')}</tr></thead>
          <tbody>${baris(data.perizinan||[], z =>
            `<tr>${td(tgl(z.tanggal_mulai))}${td(tgl(z.tanggal_selesai))}${td(z.jenis_izin)}${td(z.alasan||'-')}${td(z.status_persetujuan)}</tr>`,
            'Tidak ada perizinan.')}</tbody>
        </table>

        <h3 style="font-size:13px;border-bottom:1px solid #cbd5e1;padding-bottom:4px;">5. Instrumen Pembinaan</h3>
        <table style="width:100%;font-size:11px;border-collapse:collapse;margin-bottom:24px;">
          <thead><tr style="background:#f1f5f9;">
            ${['Tanggal','Kategori','Tahap','Bentuk Pembinaan','Status'].map(th).join('')}</tr></thead>
          <tbody>${baris(data.pembinaan||[], b =>
            `<tr>${td(tgl(b.tanggal_pembinaan))}${td(b.kategori)}${td('Ke-'+b.pengulangan_ke,'text-align:center')}${td(b.bentuk_pembinaan)}${td(b.status_pembinaan)}</tr>`,
            'Belum ada instrumen pembinaan.')}</tbody>
        </table>

        <table style="width:100%;font-size:12px;margin-top:36px;page-break-inside:avoid;">
          <tr><td style="width:50%;text-align:center;">Musyrif Asrama</td>
              <td style="width:50%;text-align:center;">Wali Santri</td></tr>
          <tr><td style="height:58px;"></td><td></td></tr>
          <tr><td style="text-align:center;">(________________________)</td>
              <td style="text-align:center;">(________________________)</td></tr>
        </table>
      </div>`;

    window.print();
  } catch (err) { fireError(err); }
  finally { loading(false); }
}

// ---------------------------------------------------------------------
// 13. REALTIME
// ---------------------------------------------------------------------
function aktifkanRealtime() {
  APP.channel = db.channel('rq-live')
    .on('postgres_changes', { event:'*', schema:'public', table:'log_perizinan' }, () => {
      refreshBadgePending();
      if (APP.view === 'perizinan') viewPerizinan();
    })
    .on('postgres_changes', { event:'INSERT', schema:'public', table:'log_pelanggaran' }, () => {
      if (APP.view === 'pelanggaran') viewPelanggaran();
      if (APP.view === 'dashboard') viewDashboard();
    })
    .subscribe((status) => {
      $('liveDot').classList.toggle('hidden', status !== 'SUBSCRIBED');
      $('liveDot').classList.toggle('inline-flex', status === 'SUBSCRIBED');
    });
}

// ---------------------------------------------------------------------
// 14. START — pulihkan sesi bila masih berlaku
// ---------------------------------------------------------------------
(async function start() {
  const { data: { session } } = await db.auth.getSession();
  if (session) await masukAplikasi();
})();
