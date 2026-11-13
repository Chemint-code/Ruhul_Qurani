/* =====================================================================
 * sarpras.js — v2.74 · SARPRAS ASRAMA (ramping)
 * ---------------------------------------------------------------------
 *  Dimuat lambat oleh app.js (muatSarprasJs). Rancangan:
 *  claude/rancangan-v2.74-sarpras-ramping.md.
 *
 *  Prinsip: musyrif hanya MELAPORKAN MASALAH; yang tidak dilaporkan
 *  terhitung baik. Empat halaman:
 *   · lapor(akar)   — Sarpras Asrama: lokasi amanah, ubin barang, Sudah baik,
 *                     cap "sudah dicek, aman", riwayat.
 *   · atur(akar)    — Pengaturan: Kamar & lokasi · Katalog barang · Pelapor.
 *   · laporan(akar) — Laporan untuk unit fasilitas: saring barang & cakupan,
 *                     posisi per tanggal, PDF A4/F4 dan Excel, bertanda tangan.
 *   · peta(akar)    — Peta Kamar: pelanggaran berkelompok + masalah sarana
 *                     per kamar, tanda "Perlu dibahas", Bahan Rapat Evaluasi.
 *
 *  Basis data yang memutuskan hak (RPC sarpras_*). Tidak ada nama
 *  lembaga, unit, nomor kamar, atau jumlah sayap yang ditanam di sini.
 *  Bergantung pada app.js: db, $, esc, kartu, kosong, toast, fireError,
 *  onKlik, angka, hariIni, prMuatXlsx, muatSiswa, APP, Swal, RQ_SIDANG.
 * ===================================================================== */
(function () {
  'use strict';

  const SP = { data: null, peta: null, saya: null, milik: new Set(), masalah: [], cek: [] };
  const UI = {
    lapor: { tab: null, lokasi: null, rw: { status: 'terbuka', zona: '', cari: '' }, pilih: new Set() },
    atur: { tab: 'kamar', unit: null, pilih: new Set(), cari: '' },
    lap: null, peta: null
  };
  const TZ = 'Asia/Jakarta';
  const BIRU = '#14618B', MERAH = '#8E1B32';
  const ISTILAH_BAWAAN = { lembaga: 'Lembaga', unit: 'Unit', asrama: 'Asrama', kamar: 'Kamar', musyrif: 'Musyrif', sayap: 'Sayap',
    bilik: 'Bilik', titik: 'Titik', butir: 'Barang', penghuni: 'Penghuni', gedung: 'Gedung', lantai: 'Lantai' };

  /* ---------- piktogram barang (SVG garis, tanpa pustaka) ------------- */
  const PIKTO = {
    ranjang: 'M4 3v18M20 3v18M4 7.5h16M4 15h16M4 11h16',
    lemari: 'M5 3h14v18H5zM12 3v18M10 10.5v3M14 10.5v3M5 21v1.2M19 21v1.2',
    laci: 'M4 5h16v14H4zM4 12h16M10 8.5h4M10 15.5h4',
    ac: 'M4 5h16a1 1 0 011 1v6a1 1 0 01-1 1H4a1 1 0 01-1-1V6a1 1 0 011-1zM6 9.5h12M8 16l-1 3M12 16v3.5M16 16l1 3',
    gorden: 'M3 3.5h18M5 3.5c0 6 1.5 11.5 4.5 16.5M19 3.5c0 6-1.5 11.5-4.5 16.5M9.5 20H4.5M19.5 20h-5M8 3.5c0 4 1 8 3 11M16 3.5c0 4-1 8-3 11',
    cctv: 'M3 8.5l11.5-4.2 2.2 5.4-11.5 4.2zM16.7 9.7L20 11v3.6l-4.4-1.6M8 13l1.2 3.5H5.5M5.5 14v6M3.5 20h4',
    pintu: 'M6 21V3.5h12V21M3 21h18M14.5 12.2v.6',
    meja: 'M3 8h18M5 8v12.5M19 8v12.5M5 13h14',
    kursi: 'M7 3v10h10V3M7 13v8M17 13v8M7 17h10',
    papan: 'M3 4h18v12H3zM8 20.5l4-4.5 4 4.5M6.5 8.5h7M6.5 11.5h10',
    sound: 'M6 3h12v18H6zM12 17.5a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM12 8a1.4 1.4 0 100-2.8A1.4 1.4 0 0012 8z',
    mic: 'M9 3.5a3 3 0 016 0v7a3 3 0 01-6 0zM6 10.5a6 6 0 0012 0M12 16.5V21M9 21h6',
    lampu: 'M9 18h6M10 21h4M12 3a6 6 0 00-3.8 10.6c.6.5.8 1.3.8 2.1V16h6v-.3c0-.8.2-1.6.8-2.1A6 6 0 0012 3z',
    wc: 'M6 3h7v6.5H6zM4 11h16c0 3.8-3 6.6-7 7v3H9.5v-3.4C6.4 17 4 14.4 4 11z',
    keran: 'M3.5 9h9.5a4 4 0 014 4v2.5M10 9V5.5M7 5.5h6M17 18.5v.4M17 21v.4',
    saluran: 'M12 20a8 8 0 100-16 8 8 0 000 16zM7 10h10M7 14h10M12 4v16',
    kipas: 'M12 13.5a1.5 1.5 0 100-3 1.5 1.5 0 000 3zM12 10.5C11 6 12.5 3 15 3.5s1.5 5-3 7zM13.4 12.6c4.4.9 6.8 3 5.7 5.2s-4.8 1-7.2-3.6zM10.6 12.4c-3.3 3-6.5 3.7-7.3 1.4s2.3-4 7.3-1.4zM12 13.5V21M9 21h6',
    stopkontak: 'M5 4h14v16H5zM9.5 9v2.5M14.5 9v2.5M10 15.5h4',
    jendela: 'M4 3h16v18H4zM12 3v18M4 12h16',
    rak: 'M4 3v18M20 3v18M4 8h16M4 14h16M4 20h16',
    kotak: 'M4 7.5L12 3.5l8 4v9l-8 4-8-4zM4 7.5l8 4 8-4M12 11.5v9',
    lain: 'M6 12.01h.01M12 12.01h.01M18 12.01h.01M3.5 5.5h17v13h-17z'
  };
  const NAMA_PIKTO = { ranjang: 'Ranjang', lemari: 'Lemari', laci: 'Laci', ac: 'AC', gorden: 'Gorden', cctv: 'CCTV', pintu: 'Pintu', meja: 'Meja',
    kursi: 'Kursi', papan: 'Papan tulis', sound: 'Pengeras suara', mic: 'Mikrofon', lampu: 'Lampu', wc: 'Kloset', keran: 'Keran', saluran: 'Saluran',
    kipas: 'Kipas', stopkontak: 'Stop kontak', jendela: 'Jendela', rak: 'Rak', kotak: 'Lainnya' };
  const pikto = (k, kelas = 'sp-pikto') => `<svg class="${kelas}" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${PIKTO[k] || PIKTO.kotak}"/></svg>`;

  /* ---------- utilitas ------------------------------------------------ */
  const setelan = (k, bawaan) => { const v = SP.data?.setelan?.[k]; return v === undefined || v === null ? bawaan : v; };
  const istilah = (k) => (setelan('istilah', {}) || {})[k] || ISTILAH_BAWAAN[k] || k;
  const zona = (kode) => (SP.data?.zona || []).find(z => z.kode === kode) || null;
  const unit = (id) => (SP.data?.unit || []).find(u => u.id === id) || null;
  const butir = (id) => (SP.data?.butir || []).find(b => b.id === id) || null;
  const lok = (id) => SP.peta?.byId.get(id) || null;
  const pengelola = () => !!SP.saya?.pengelola;
  const idSaya = () => APP.profil?.id || '';
  const urutkan = (a, b) => (a.urutan - b.urutan) || ((a.nomor ?? 1e9) - (b.nomor ?? 1e9)) || String(a.nama).localeCompare(String(b.nama), 'id', { numeric: true });
  const tglJkt = (ts) => { if (!ts) return null; try { return new Date(ts).toLocaleDateString('sv-SE', { timeZone: TZ }); } catch (e) { return String(ts).slice(0, 10); } };
  const geser = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const selisih = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 864e5);
  const tglId = (iso, gaya = 'short') => { if (!iso) return '-'; try { return new Date(iso + 'T00:00:00Z').toLocaleDateString('id-ID', { day: 'numeric', month: gaya, year: 'numeric', timeZone: 'UTC' }); } catch (e) { return iso; } };
  const tglPendek = (iso) => { if (!iso) return '-'; try { return new Date(iso + 'T00:00:00Z').toLocaleDateString('id-ID', { day: 'numeric', month: 'short', timeZone: 'UTC' }); } catch (e) { return iso; } };
  const relatif = (iso) => { if (!iso) return ''; const n = selisih(iso, hariIni()); return n <= 0 ? 'hari ini' : n === 1 ? 'kemarin' : `${n} hari lalu`; };
  const galatTeks = (e) => {
    const m = e?.message || String(e || '');
    return /sarpras_masalah|sarpras_cek|sarpras_lokasi_saya|does not exist|Could not find|PGRST20/.test(m + (e?.code || '')) ? 'Modul sarpras v2.74 belum terpasang di server. Terapkan migrasi v2.74.' : m;
  };
  const awalBulan = (iso) => iso.slice(0, 8) + '01';
  const akhirBulan = (iso) => { const d = new Date(iso.slice(0, 8) + '01T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() + 1); d.setUTCDate(0); return d.toISOString().slice(0, 10); };
  const teksPdf = (s) => String(s == null ? '' : s).replace(/[‘’ʼʻ]/g, "'").replace(/[“”]/g, '"').replace(/[–—−]/g, '-')
    .replace(/…/g, '...').replace(/[•●·]/g, '-').replace(/→/g, '->').replace(/×/g, 'x').normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7E\n]/g, '');
  const tombol = (aksi, label, ikon, data = {}, kelas = 'btn-ghost') => `<button type="button" class="btn ${kelas} btn-sm" data-sp="${aksi}"
      ${Object.entries(data).map(([k, v]) => `data-${k}="${esc(v ?? '')}"`).join(' ')}>${ikon ? `<i class="fa-solid ${ikon}"></i>` : ''}${esc(label)}</button>`;
  const swalDasar = { showCancelButton: true, cancelButtonText: 'Batal', confirmButtonColor: BIRU, showLoaderOnConfirm: true, allowOutsideClick: () => !Swal.isLoading() };

  async function rpc(nama, arg) {
    const { data, error } = await db.rpc(nama, arg);
    if (error) throw error;
    return data;
  }
  /** Ambil semua baris (lewat batas 1000 PostgREST). */
  async function ambilSemua(buat) {
    const hasil = [];
    for (let i = 0; i < 50; i++) {
      const { data, error } = await buat().range(i * 1000, i * 1000 + 999);
      if (error) throw error;
      hasil.push(...(data || []));
      if (!data || data.length < 1000) break;
    }
    return hasil;
  }

  /* ---------- pohon lokasi ------------------------------------------- */
  function petaPohon(lokasi) {
    const byId = new Map(), anak = new Map(), akar = [];
    (lokasi || []).forEach(l => byId.set(l.id, l));
    (lokasi || []).forEach(l => {
      if (l.induk_id && byId.has(l.induk_id)) { if (!anak.has(l.induk_id)) anak.set(l.induk_id, []); anak.get(l.induk_id).push(l); }
      else akar.push(l);
    });
    anak.forEach(v => v.sort(urutkan)); akar.sort(urutkan);
    return { byId, anak, akar };
  }
  function aktifEfektif(l) {
    let x = l, n = 0;
    while (x && n++ < 64) { if (!x.aktif) return false; x = x.induk_id ? SP.peta.byId.get(x.induk_id) : null; }
    const u = unit(l.unit_id), z = zona(l.zona);
    return !!(u?.aktif !== false && z?.aktif !== false);
  }
  const jalur = (l) => { const n = []; let x = l, d = 0; while (x && d++ < 64) { n.unshift(x.nama); x = x.induk_id ? SP.peta.byId.get(x.induk_id) : null; } return n.join(' › '); };
  const kedalaman = (l) => { let d = 0, x = l; while (x?.induk_id && d < 64) { x = SP.peta.byId.get(x.induk_id); d++; } return d; };
  const lantaiDari = (l) => { let x = l, d = 0; while (x && d++ < 64) { if (x.lantai) return x.lantai; x = x.induk_id ? SP.peta.byId.get(x.induk_id) : null; } return null; };
  const labelLantai = (v) => v ? `${istilah('lantai')} ${v}` : `Belum ber${istilah('lantai').toLowerCase()}`;
  const labelTingkat = (z, d) => { const t = z?.label_tingkat || []; return t[Math.min(d, Math.max(0, t.length - 1))] || istilah('titik'); };
  const urutLantai = (a, b) => (a === null) - (b === null) || String(a).localeCompare(String(b), 'id', { numeric: true });

  /* ---------- jumlah terpasang ---------------------------------------- */
  const isiKhusus = (lokId, butId) => (SP.data.standar || []).find(s => s.lokasi_id === lokId && s.butir_id === butId) || null;
  function jumlahStandar(l, b) {
    const s = isiKhusus(l.id, b.id); if (s) return s.jumlah;
    if (b.per_anak) return l.kapasitas || null;
    return b.jumlah_tetap ?? null;
  }
  const butirDi = (l) => (SP.data.butir || []).filter(b => b.aktif && (!(b.zona || []).length || b.zona.includes(l.zona))).sort(urutkan);
  function aturanTeks(b, l) {
    if (b.per_anak) return `per ${istilah('penghuni').toLowerCase()}${l ? ` (${l.kapasitas || '?'})` : ''}`;
    if (b.jumlah_tetap) return `tetap ${b.jumlah_tetap}`;
    return 'tidak dibatasi';
  }

  /* ---------- masalah ------------------------------------------------- */
  const terbuka = (m) => !m.batal && !m.selesai_pada;
  const terbukaPada = (m, P) => !m.batal && tglJkt(m.dilaporkan_pada) <= P && (!m.selesai_pada || tglJkt(m.selesai_pada) > P);
  const namaBarang = (m) => m.butir_id ? (butir(m.butir_id)?.nama || 'Barang') : (m.butir_lain || 'Barang lain');
  const ikonBarang = (m) => m.butir_id ? (butir(m.butir_id)?.ikon || 'kotak') : 'lain';
  const namaPenyebab = (k) => (setelan('penyebab', []) || []).find(p => p.kode === k)?.label || '';
  const bolehBatal = (m) => terbuka(m) && (pengelola() || (m.pelapor === idSaya() && tglJkt(m.dilaporkan_pada) === hariIni()));
  /* v2.75: barang milik santri — pemilik dipilih dari penghuni kamar. */
  const milikSantri = (b, l) => !!(b?.milik_santri && zona(l?.zona)?.akses === 'binaan');
  const pemilikTeks = (m) => m.pemilik_nama ? `${m.pemilik_nama}${m.pemilik_kelas ? ` (${m.pemilik_kelas})` : ''}` : '';
  const inisial = (n) => String(n || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(x => x[0]).join('').toUpperCase();
  const PENGHUNI = new Map();
  async function muatPenghuni(lokId, segar) {
    if (!segar && PENGHUNI.has(lokId)) return PENGHUNI.get(lokId);
    const daftar = await rpc('sarpras_penghuni', { p_lokasi: lokId });
    PENGHUNI.set(lokId, daftar || []);
    return daftar || [];
  }
  const waspadaSebab = () => new Set((setelan('peta', {}) || {}).penyebab_waspada || ['lalai', 'rusak']);
  const bolehCatatPelanggaran = (m) => !!(m.nisn && waspadaSebab().has(m.penyebab) && typeof modalCatatPelanggaran === 'function'
    && ['Admin', 'Guru', 'Guru BK', 'Ustadz GEN-Z'].includes(APP.profil?.role));

  /* ---------- muat ---------------------------------------------------- */
  async function muat() {
    const [st, un, zo, lo, bu, sd, saya, milik] = await Promise.all([
      db.from('sarpras_setelan').select('kunci,nilai'),
      db.from('sarpras_unit').select('*').order('urutan'),
      db.from('sarpras_zona').select('*').order('urutan'),
      db.from('sarpras_lokasi').select('*').order('urutan'),
      db.from('sarpras_butir').select('*').order('urutan'),
      db.from('sarpras_standar').select('lokasi_id,butir_id,jumlah').is('berlaku_sampai', null),
      db.rpc('sarpras_saya'),
      db.rpc('sarpras_lokasi_saya')
    ]);
    for (const r of [st, un, zo, lo, bu, sd, saya]) if (r.error) throw r.error;
    SP.saya = saya.data || {};
    SP.milik = new Set(milik.error ? [] : (milik.data || []));
    SP.data = {
      setelan: Object.fromEntries((st.data || []).map(r => [r.kunci, r.nilai])),
      unit: un.data || [], zona: zo.data || [], lokasi: lo.data || [], butir: bu.data || [], standar: sd.data || []
    };
    SP.peta = petaPohon(SP.data.lokasi);
    if (APP) APP.sarpras = SP.saya;
  }
  async function muatMasalah(sejak) {
    const batas = sejak || geser(hariIni(), -120);
    SP.masalah = await ambilSemua(() => db.from('sarpras_masalah').select('*')
      .or(`selesai_pada.is.null,selesai_pada.gte.${batas}`).order('dilaporkan_pada', { ascending: false }));
    return SP.masalah;
  }
  async function muatCek() {
    const { data, error } = await db.from('sarpras_cek').select('lokasi_id,tanggal,oleh').gte('tanggal', geser(hariIni(), -120));
    if (error) throw error;
    SP.cek = data || [];
  }
  async function bukaHalaman(akar, view, judul, jalan) {
    akar.innerHTML = `<div class="sp-kerangka" role="status" aria-label="Membuka ${esc(judul)}">
      <span class="sp-k sp-k-hero"></span><span class="sp-k sp-k-tab"></span>
      <span class="sp-k-kisi">${'<span class="sp-k sp-k-kartu"></span>'.repeat(6)}</span></div>`;
    try { await jalan(); }
    catch (e) {
      if (APP.view !== view) return;
      console.error(e);
      akar.innerHTML = kartu(judul, `<div class="card-body">${kosong('Halaman belum bisa dimuat', galatTeks(e), 'fa-triangle-exclamation')}
        <p style="text-align:center"><button class="btn btn-primary" id="spUlang"><i class="fa-solid fa-rotate"></i>Coba lagi</button></p></div>`);
      $('spUlang')?.addEventListener('click', () => navigateTo(view));
    }
  }
  const tabNav = (daftar, aktif, label) => `<nav class="sp-tab" role="tablist" aria-label="${esc(label)}">
    ${daftar.map(([k, l, i, n]) => `<button type="button" role="tab" class="sp-tab-b" data-sp-tab="${esc(k)}" aria-selected="${k === aktif}">
      <i class="fa-solid ${i}"></i><span>${esc(l)}</span>${n ? `<b class="sp-tab-n">${angka(n)}</b>` : ''}</button>`).join('')}</nav>`;

  /* =====================================================================
   * 1 · SARPRAS ASRAMA — input musyrif
   * ===================================================================== */
  async function lapor(akar) {
    await bukaHalaman(akar, 'sarpras', 'Sarpras Asrama', async () => {
      await muat();
      await Promise.all([muatMasalah(), muatCek(), muatPenempatan()]);
      if (APP.view !== 'sarpras') return;
      gambarLapor(akar);
      onKlik(klikLapor);
    });
  }
  /* v2.76 · tab Penempatan: tersedia bila basis data mengizinkan (penempatan) dan sakelar penempatan_terbuka menyala. */
  /* sakelar penempatan_terbuka hanya menutup musyrif; pengelola tetap boleh (server sama: _sarpras_boleh_tempatkan). */
  const bolehPenempatan = () => !!SP.saya?.penempatan && (!!SP.saya?.penempatan_terbuka || pengelola());
  async function muatPenempatan() {
    SP.penem = null;
    if (!bolehPenempatan()) return;
    try { SP.penem = await rpc('sarpras_penempatan_data', {}); }
    catch (e) { console.error(e); SP.penem = { galat: galatTeks(e) }; }
  }
  /* Lencana = santri binaan yang belum punya kamar. Bila angkatan binaan dikenal, hanya angkatan itu yang dihitung
     (santri angkatan lain tetap bisa dipilih di dialog, tetapi bukan tanggungan penempatan musyrif ini). */
  const nBelumBerkamar = () => {
    const ang = SP.penem?.angkatan_binaan || [];
    return (SP.penem?.santri || []).filter(x => x.nomor_kamar == null && (!ang.length || ang.includes(x.angkatan))).length;
  };
  const lokasiSaya = () => SP.data.lokasi.filter(l => SP.milik.has(l.id) && aktifEfektif(l));
  function zonaSaya() {
    const kode = new Set(lokasiSaya().map(l => l.zona));
    return [...SP.data.zona].sort(urutkan).filter(z => kode.has(z.kode));
  }
  function statusLokasi(l) {
    const buka = SP.masalah.filter(m => m.lokasi_id === l.id && terbuka(m));
    const tgl = [...SP.cek.filter(c => c.lokasi_id === l.id).map(c => c.tanggal),
                 ...SP.masalah.filter(m => m.lokasi_id === l.id && !m.batal).map(m => tglJkt(m.dilaporkan_pada))].sort().pop() || null;
    const frek = zona(l.zona)?.frekuensi_hari || 30;
    return { buka, terakhir: tgl, lewat: !tgl || selisih(tgl, hariIni()) > frek };
  }

  function gambarLapor(akar) {
    const L = UI.lapor;
    const penem = bolehPenempatan();
    const modul = pengelola() || SP.saya.aktif === true;
    if (!modul && !penem) {
      akar.innerHTML = kartu('Sarpras Asrama', `<div class="card-body">${kosong('Belum dibuka', 'Pengelola sarpras sedang menyiapkan data kamar dan barang. Halaman ini terbuka setelah modul diaktifkan.', 'fa-lock')}</div>`);
      return;
    }
    const milik = modul ? lokasiSaya() : [];
    if (modul && !milik.length && !penem) {
      akar.innerHTML = kartu('Sarpras Asrama', `<div class="card-body">${kosong('Belum ada lokasi amanah',
        `${istilah('kamar')} santri binaan Anda tampil di sini setelah nomor ${istilah('kamar').toLowerCase()} mereka tercatat. Asrama umum dan ${istilah('kamar').toLowerCase()} ${istilah('musyrif').toLowerCase()} mengikuti penunjukan pengelola.`, 'fa-bed')}</div>`);
      return;
    }
    const zs = milik.length ? zonaSaya() : [];
    const nBelum = nBelumBerkamar();
    const tabPenem = ['penempatan', 'Penempatan', 'fa-bed', nBelum];   // lencana hanya bila ada yang belum berkamar (nBelum 0 → tanpa angka)
    const tabAda = (k) => (k === 'penempatan' ? penem : k === 'riwayat' ? milik.length > 0 : zs.some(z => z.kode === k));
    if (!L.tab || !tabAda(L.tab)) L.tab = penem && (nBelum > 0 || !zs.length) ? 'penempatan' : (zs[0]?.kode || (milik.length ? 'riwayat' : 'penempatan'));
    const nBuka = SP.masalah.filter(m => terbuka(m) && SP.milik.has(m.lokasi_id)).length;
    const nLewat = milik.filter(l => statusLokasi(l).lewat).length;
    akar.innerHTML = `<div class="sp-lapor">
      <header class="sp-hero card">
        ${modul ? `<div class="sp-hero-teks"><span class="ar">المرافق</span><h3>Amanah sarana</h3>
          <p>${angka(milik.length)} lokasi · <b class="${nBuka ? 'sp-merah' : ''}">${angka(nBuka)} masalah terbuka</b>${nLewat ? ` · ${angka(nLewat)} perlu dicek` : ''}</p></div>
        <p class="sp-hero-ket">Laporkan yang bermasalah saja. Yang tidak dilaporkan terhitung baik.</p>`
        : `<div class="sp-hero-teks"><span class="ar">المرافق</span><h3>Penempatan ${esc(istilah('kamar').toLowerCase())}</h3>
          <p><b class="${nBelum ? 'sp-merah' : ''}">${angka(nBelum)} santri binaan belum berkamar</b></p></div>
        <p class="sp-hero-ket">Pilih ${esc(istilah('kamar').toLowerCase())}, lalu ketuk santri yang tidur di sana.</p>`}
      </header>
      ${tabNav([...(penem && nBelum > 0 ? [tabPenem] : []),
                ...zs.map(z => [z.kode, z.nama, z.ikon || 'fa-layer-group', SP.masalah.filter(m => terbuka(m) && SP.milik.has(m.lokasi_id) && lok(m.lokasi_id)?.zona === z.kode).length]),
                ...(penem && nBelum === 0 ? [tabPenem] : []),
                ...(milik.length ? [['riwayat', 'Riwayat', 'fa-clock-rotate-left', 0]] : [])], L.tab, 'Bagian sarpras')}
      <div id="spPanel" class="sp-panel" role="tabpanel"></div>
    </div>`;
    gambarPanelLapor();
  }
  function gambarPanelLapor() {
    const panel = $('spPanel'); if (!panel) return;
    const L = UI.lapor;
    document.querySelectorAll('[data-sp-tab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.spTab === L.tab)));
    try {
      if (L.tab === 'penempatan') return panelPenempatan(panel);
      if (L.tab === 'riwayat') return panelRiwayat(panel);
      if (L.lokasi && lok(L.lokasi)?.zona === L.tab && SP.milik.has(L.lokasi)) return panelDetail(panel, lok(L.lokasi));
      L.lokasi = null;
      panelDaftarLokasi(panel, L.tab);
    } catch (e) { console.error(e); panel.innerHTML = kosong('Bagian ini gagal digambar', e?.message || String(e), 'fa-triangle-exclamation'); }
  }
  async function panelPenempatan(panel) {
    if (SP.penem?.galat) {
      panel.innerHTML = kosong('Penempatan belum bisa dimuat', SP.penem.galat, 'fa-triangle-exclamation');
      return;
    }
    const data = SP.penem; SP.penem = null;   // dipakai sekali; buka() memuat ulang sendiri sesudahnya
    panel.innerHTML = '<div class="sp-muat" role="status" aria-label="Membuka penempatan"></div>';
    const ok = await muatPenempatanJs();
    if (UI.lapor.tab !== 'penempatan' || !$('spPanel')) return;
    if (!ok) {
      panel.innerHTML = kosong('Penempatan belum bisa dibuka', 'Berkas penempatan gagal dimuat. Periksa sambungan internet, lalu coba lagi.', 'fa-plug-circle-xmark');
      return;
    }
    panel.innerHTML = '';
    await window.RQPenempatan.buka(panel, { data });
  }
  function panelDaftarLokasi(panel, kode) {
    const daftar = lokasiSaya().filter(l => l.zona === kode)
      .sort((a, b) => urutLantai(lantaiDari(a), lantaiDari(b)) || jalur(a).localeCompare(jalur(b), 'id', { numeric: true }));
    const grup = new Map();
    daftar.forEach(l => { const k = lantaiDari(l); if (!grup.has(k)) grup.set(k, []); grup.get(k).push(l); });
    panel.innerHTML = [...grup.entries()].map(([lt, isi]) => `<section class="sp-lantai">
      ${grup.size > 1 || lt ? `<h4 class="sp-lantai-j">${esc(labelLantai(lt))}</h4>` : ''}
      <div class="sp-lk-kisi">${isi.map(l => {
        const s = statusLokasi(l), d = kedalaman(l);
        const ket = s.buka.length ? `${angka(s.buka.length)} masalah` : s.terakhir ? `Aman · ${relatif(s.terakhir)}` : 'Belum dicek';
        return `<button type="button" class="sp-lk${s.buka.length ? ' rusak' : s.lewat ? ' lewat' : ' aman'}${d ? ' anak' : ''}" data-sp="buka" data-id="${esc(l.id)}">
          ${!d && l.nomor != null ? `<span class="pk-plakat sp-lk-plakat" aria-hidden="true"><span class="pk-nomor">${esc(l.nomor)}</span></span>` : ''}
          <span class="sp-lk-nama">${esc(d ? l.nama : jalur(l))}</span>
          ${d ? `<span class="sp-lk-induk">${esc(lok(l.induk_id)?.nama || '')}</span>` : ''}
          <span class="sp-lk-ket"><i class="sp-lk-titik"></i>${esc(ket)}</span>
          ${s.buka.length ? `<span class="sp-lk-ikon">${s.buka.slice(0, 4).map(m => pikto(ikonBarang(m))).join('')}</span>` : ''}
        </button>`;
      }).join('')}</div></section>`).join('');
  }

  function panelDetail(panel, l) {
    const s = statusLokasi(l), z = zona(l.zona);
    const tertutup = SP.masalah.filter(m => m.lokasi_id === l.id && !terbuka(m) && !m.batal).slice(0, 8);
    const daftar = butirDi(l);
    const bukaPer = new Map(); s.buka.forEach(m => { if (m.butir_id) bukaPer.set(m.butir_id, (bukaPer.get(m.butir_id) || 0) + 1); });
    const sub = [labelLantai(lantaiDari(l)), l.kapasitas ? `${l.kapasitas} ${istilah('penghuni').toLowerCase()}` : '', z?.nama || ''].filter(Boolean).join(' · ');
    panel.innerHTML = `<article class="sp-detail card">
      <header class="sp-detail-kepala">
        <button type="button" class="sp-kembali" data-sp="kembali" aria-label="Kembali ke daftar"><i class="fa-solid fa-chevron-left"></i></button>
        <div class="sp-detail-judul"><h3>${esc(jalur(l))}</h3><small>${esc(sub)}</small></div>
        <button type="button" class="btn btn-ghost btn-sm sp-aman" data-sp="aman" data-id="${esc(l.id)}"><i class="fa-solid fa-circle-check"></i>Sudah dicek, aman</button>
      </header>
      ${s.terakhir ? `<p class="sp-detail-cek"><i class="fa-solid fa-clipboard-check"></i>Terakhir dicek ${esc(relatif(s.terakhir))}</p>` : ''}
      ${s.buka.length ? `<section class="sp-buka"><h4>Masih rusak <b>${angka(s.buka.length)}</b></h4>
        <ul class="sp-msl-daftar">${s.buka.map(m => itemMasalah(m, l)).join('')}</ul></section>` : ''}
      ${daftar.some(b => milikSantri(b, l)) ? `<section class="sp-denah" id="spDenah" data-id="${esc(l.id)}"><h4>Denah penghuni</h4>
        <div class="sp-denah-kisi">${'<span class="sp-k sp-k-santri"></span>'.repeat(Math.min(6, l.kapasitas || 4))}</div></section>` : ''}
      <section class="sp-ubin-wadah"><h4>Laporkan masalah</h4>
        <div class="sp-ubin-kisi">${daftar.map(b => {
          const n = jumlahStandar(l, b), r = bukaPer.get(b.id) || 0;
          return `<button type="button" class="sp-ubin${r ? ' ada' : ''}" data-sp="ubin" data-butir="${esc(b.id)}" data-id="${esc(l.id)}">
            ${pikto(b.ikon)}<b>${esc(b.nama)}</b><small>${milikSantri(b, l) ? 'per santri' : n ? `× ${angka(n)}` : '&nbsp;'}</small>${r ? `<i class="sp-ubin-n">${r}</i>` : ''}</button>`;
        }).join('')}
          <button type="button" class="sp-ubin lain" data-sp="ubin" data-butir="" data-id="${esc(l.id)}">${pikto('lain')}<b>Lainnya</b><small>tulis sendiri</small></button>
        </div></section>
      ${tertutup.length ? `<details class="sp-jejak"><summary>Sudah baik (${angka(tertutup.length)} terakhir)</summary>
        <ul class="sp-msl-daftar">${tertutup.map(m => itemMasalah(m, l)).join('')}</ul></details>` : ''}
    </article>`;
    if ($('spDenah')) gambarDenah(l, s.buka);
  }
  async function gambarDenah(l, buka) {
    const wadah = $('spDenah'); if (!wadah) return;
    let daftar;
    try { daftar = await muatPenghuni(l.id); }
    catch (e) { wadah.querySelector('.sp-denah-kisi').innerHTML = `<p class="sp-kosong">${esc(galatTeks(e))}</p>`; return; }
    if (!$('spDenah') || $('spDenah').dataset.id !== l.id) return;
    const milik = butirDi(l).filter(b => milikSantri(b, l));
    const rusak = new Map(); buka.filter(m => m.nisn).forEach(m => rusak.set(`${m.nisn}|${m.butir_id}`, m));
    wadah.querySelector('h4').innerHTML = `Denah penghuni <b class="sp-h4-n">${angka(daftar.length)}${l.kapasitas ? ` / ${angka(l.kapasitas)}` : ''}</b>`;
    wadah.querySelector('.sp-denah-kisi').innerHTML = daftar.length ? daftar.map((x, i) => {
      const nRusak = milik.filter(b => rusak.has(`${x.nisn}|${b.id}`)).length;
      return `<article class="sp-santri${nRusak ? ' rusak' : ''}" style="--i:${i}">
        <span class="sp-ava" aria-hidden="true">${esc(inisial(x.nama))}</span>
        <div class="sp-santri-id"><b>${esc(x.nama)}</b><small>${esc(x.kelas || '')}${x.peran ? ` · <em>${esc(x.peran)}</em>` : ''}</small></div>
        <div class="sp-santri-brg">${milik.map(b => { const m = rusak.get(`${x.nisn}|${b.id}`);
          return `<button type="button" class="sp-mini${m ? ' rusak' : ''}" data-sp="ubin" data-butir="${esc(b.id)}" data-id="${esc(l.id)}" data-nisn="${esc(x.nisn)}"
            title="${esc(`${b.nama} ${x.nama}${m ? ' · ' + m.masalah : ''}`)}" aria-label="${esc(`Laporkan ${b.nama} milik ${x.nama}`)}">${pikto(b.ikon)}</button>`; }).join('')}</div>
      </article>`;
    }).join('') : `<p class="sp-kosong">Belum ada santri yang tercatat di ${esc(istilah('kamar').toLowerCase())} ini. Perbarui nomor kamar santri lebih dulu.</p>`;
  }
  function itemMasalah(m, l, opsi = {}) {
    const b = m.butir_id ? butir(m.butir_id) : null;
    const pasang = b && l ? jumlahStandar(l, b) : null;
    const lapor = tglJkt(m.dilaporkan_pada), tutup = tglJkt(m.selesai_pada);
    const umur = selisih(lapor, tutup || hariIni());
    const ket = [m.jumlah > 1 || pasang ? `${angka(m.jumlah)}${pasang ? ` dari ${angka(pasang)}` : ''} rusak` : '', namaPenyebab(m.penyebab), m.catatan || ''].filter(Boolean);
    const status = m.batal ? '<span class="sp-st batal">dibatalkan</span>' : tutup ? `<span class="sp-st baik">sudah baik ${esc(tglPendek(tutup))}</span>` : '';
    return `<li class="sp-msl${terbuka(m) ? '' : ' tutup'}" data-msl="${m.id}">
      ${opsi.pilih && terbuka(m) ? `<label class="sp-msl-pilih"><input type="checkbox" data-sp-pilih="${m.id}" ${UI.lapor.pilih.has(m.id) ? 'checked' : ''} aria-label="Pilih"></label>` : ''}
      <span class="sp-msl-ikon">${pikto(ikonBarang(m))}</span>
      <div class="sp-msl-isi">
        <b>${esc(namaBarang(m))} · ${esc(m.masalah)}</b>
        ${m.pemilik_nama ? `<span class="sp-msl-milik"><i class="fa-solid fa-user"></i>${esc(pemilikTeks(m))}</span>` : ''}
        ${opsi.lokasi ? `<span class="sp-msl-lok">${esc(l ? jalur(l) : '')}</span>` : ''}
        ${ket.length ? `<span class="sp-msl-ket">${esc(ket.join(' · '))}</span>` : ''}
        <small>sejak ${esc(tglPendek(lapor))} · ${angka(umur)} hari · ${esc(m.pelapor_nama || '')} ${status}</small>
      </div>
      ${terbuka(m) ? `<span class="sp-msl-aksi">
        <button type="button" class="btn btn-sm sp-baik" data-sp="baik" data-msl="${m.id}"><i class="fa-solid fa-check"></i>Sudah baik</button>
        ${bolehCatatPelanggaran(m) ? `<button type="button" class="btn btn-ghost btn-sm sp-plg" data-sp="pelanggaran" data-msl="${m.id}"><i class="fa-solid fa-scale-balanced"></i>Catat pelanggaran</button>` : ''}
        ${bolehBatal(m) ? `<button type="button" class="btn btn-ghost btn-sm" data-sp="batal" data-msl="${m.id}" title="Salah input">Batal</button>` : ''}
      </span>` : ''}
    </li>`;
  }

  async function formLapor(l, b, nisnAwal) {
    const milik = milikSantri(b, l);
    let penghuni = [];
    if (milik) {
      try { penghuni = await muatPenghuni(l.id); } catch (e) { return fireError(e); }
      if (!penghuni.length) return Swal.fire({ icon: 'info', title: 'Belum ada penghuni', confirmButtonColor: BIRU,
        html: `<p>${esc(b.nama)} adalah barang milik santri. Belum ada santri yang tercatat di ${esc(l.nama)}; perbarui nomor kamar santri lebih dulu.</p>` });
    }
    const cap = b && !milik ? jumlahStandar(l, b) : null;
    const pilihan = b ? (b.masalah_umum || []) : [];
    const peny = setelan('penyebab', []) || [];
    const st = { masalah: null, penyebab: null, jumlah: 1, pemilik: new Set(nisnAwal ? [nisnAwal] : []) };
    const awal = nisnAwal ? penghuni.find(x => x.nisn === nisnAwal) : null;
    const r = await Swal.fire({
      ...swalDasar, width: 540, title: b ? `${b.nama}${awal ? ` · ${awal.nama}` : ''}` : 'Barang lain', confirmButtonText: 'Laporkan', customClass: { popup: 'sp-swal' },
      html: `<div class="sp-flapor">
        <p class="sp-flapor-lok">${pikto(b?.ikon || 'lain')}<span>${esc(jalur(l))}${cap ? ` · terpasang ${angka(cap)}` : milik ? ' · satu per santri' : ''}</span></p>
        ${milik ? `<span class="label">Pemilik <small>${awal ? 'boleh ditambah bila sama rusaknya' : 'pilih satu atau beberapa santri'}</small></span>
          <div class="sp-pil sp-pemilik" id="spFMilik">${penghuni.map(x => `<button type="button" class="sp-pil-b kecil" aria-pressed="${st.pemilik.has(x.nisn)}" data-v="${esc(x.nisn)}">
            <span class="sp-ava kecil" aria-hidden="true">${esc(inisial(x.nama))}</span><span>${esc(x.nama)}<small>${esc(x.kelas || '')}</small></span></button>`).join('')}</div>` : ''}
        ${b ? '' : `<label class="label" for="spFBarang">Nama barang</label><input id="spFBarang" class="input" maxlength="80" placeholder="mis. Kipas angin" autocomplete="off">`}
        <span class="label">Masalahnya</span>
        <div class="sp-pil" id="spFMsl" role="radiogroup">${pilihan.map(m => `<button type="button" class="sp-pil-b" role="radio" aria-checked="false" data-v="${esc(m)}">${esc(m)}</button>`).join('')}
          <button type="button" class="sp-pil-b" role="radio" aria-checked="false" data-v="">Lainnya…</button></div>
        <input id="spFMslLain" class="input" maxlength="160" placeholder="Tulis masalahnya" autocomplete="off" ${pilihan.length ? 'hidden' : ''}>
        <div class="sp-fjml"${milik ? ' hidden' : ''}><span class="label">Jumlah rusak</span>
          <div class="sp-stepper"><button type="button" data-d="-1" aria-label="Kurangi">−</button><output id="spFJml">1</output><button type="button" data-d="1" aria-label="Tambah">+</button></div>
          ${cap ? `<small>dari ${angka(cap)}</small>` : ''}</div>
        <span class="label">Penyebab <small>bila diketahui</small></span>
        <div class="sp-pil" id="spFPeny">${peny.map(p => `<button type="button" class="sp-pil-b kecil" aria-pressed="false" data-v="${esc(p.kode)}">${esc(p.label)}</button>`).join('')}</div>
        <textarea id="spFCat" class="input" rows="2" maxlength="500" placeholder="Catatan (opsional)"></textarea>
      </div>`,
      didOpen: (pop) => {
        if (!pilihan.length) st.masalah = '';
        pop.querySelector('#spFMilik')?.addEventListener('click', (e) => {
          const t = e.target.closest('.sp-pil-b'); if (!t) return;
          st.pemilik.has(t.dataset.v) ? st.pemilik.delete(t.dataset.v) : st.pemilik.add(t.dataset.v);
          t.setAttribute('aria-pressed', String(st.pemilik.has(t.dataset.v)));
        });
        pop.querySelector('#spFMsl').addEventListener('click', (e) => {
          const t = e.target.closest('.sp-pil-b'); if (!t) return;
          pop.querySelectorAll('#spFMsl .sp-pil-b').forEach(x => x.setAttribute('aria-checked', String(x === t)));
          st.masalah = t.dataset.v;
          const lain = pop.querySelector('#spFMslLain'); lain.hidden = t.dataset.v !== '';
          if (!lain.hidden) setTimeout(() => lain.focus(), 30);
        });
        pop.querySelector('#spFPeny').addEventListener('click', (e) => {
          const t = e.target.closest('.sp-pil-b'); if (!t) return;
          const on = st.penyebab !== t.dataset.v;
          pop.querySelectorAll('#spFPeny .sp-pil-b').forEach(x => x.setAttribute('aria-pressed', String(on && x === t)));
          st.penyebab = on ? t.dataset.v : null;
        });
        pop.querySelector('.sp-stepper').addEventListener('click', (e) => {
          const t = e.target.closest('[data-d]'); if (!t) return;
          st.jumlah = Math.max(1, Math.min(cap || 9999, st.jumlah + Number(t.dataset.d)));
          pop.querySelector('#spFJml').textContent = st.jumlah;
        });
        setTimeout(() => (pop.querySelector('#spFBarang') || (!pilihan.length && pop.querySelector('#spFMslLain')))?.focus?.(), 80);
      },
      preConfirm: async () => {
        const masalah = st.masalah === '' || st.masalah === null ? ($('spFMslLain')?.value || '').trim() : st.masalah;
        const lain = b ? null : ($('spFBarang')?.value || '').trim();
        if (!b && !lain) { Swal.showValidationMessage('Tulis nama barangnya.'); return false; }
        if (milik && !st.pemilik.size) { Swal.showValidationMessage('Pilih santri pemiliknya.'); return false; }
        if (!masalah) { Swal.showValidationMessage(st.masalah === null && pilihan.length ? 'Pilih masalahnya.' : 'Tulis masalahnya.'); return false; }
        const dasar = { lokasi_id: l.id, butir_id: b?.id || null, butir_lain: lain, masalah, penyebab: st.penyebab, catatan: ($('spFCat')?.value || '').trim() || null };
        try {
          if (!milik) return await rpc('sarpras_masalah_lapor', { p: { ...dasar, jumlah: st.jumlah } });
          let ada = 0;
          for (const nisn of st.pemilik) { const h = await rpc('sarpras_masalah_lapor', { p: { ...dasar, jumlah: 1, nisn } }); if (h?.ada) ada++; }
          return { ada: ada === st.pemilik.size, n: st.pemilik.size };
        } catch (e) { Swal.showValidationMessage(e.message); return false; }
      }
    });
    if (!r.isConfirmed) return;
    const siapa = milik ? [...st.pemilik].map(n => penghuni.find(x => x.nisn === n)?.nama).filter(Boolean) : [];
    toast('success', r.value?.ada ? 'Laporan diperbarui' : 'Masalah dilaporkan',
      { nada: 'catat', sub: `${b ? b.nama : 'Barang lain'} · ${siapa.length ? (siapa.length > 2 ? `${siapa.length} santri` : siapa.join(', ')) : l.nama}${r.value?.ada ? ' · masih tercatat terbuka' : ''}` });
    await segarkanLapor();
  }
  async function segarkanLapor() {
    try { await Promise.all([muatMasalah(), muatCek()]); } catch (e) { return fireError(e); }
    if (APP.view !== 'sarpras') return;
    const pos = scrollY;
    gambarLapor($('viewRoot'));
    window.scrollTo({ top: pos, behavior: 'auto' });
  }
  async function tandaiBaik(ids, sumber) {
    if (!ids.length) return;
    const h = await rpc('sarpras_masalah_baik', { p_ids: ids });
    UI.lapor.pilih.clear();
    toast('success', 'Sudah baik', { nada: 'syukuri', sub: `${angka(h.ditutup)} masalah ditutup${h.ditolak ? ` · ${angka(h.ditolak)} di luar amanah Anda` : ''}` });
    await (sumber === 'atur' ? null : segarkanLapor());
  }

  function panelRiwayat(panel) {
    const R = UI.lapor.rw;
    const zs = [...new Set(SP.masalah.filter(m => SP.milik.has(m.lokasi_id) || pengelola()).map(m => lok(m.lokasi_id)?.zona).filter(Boolean))];
    const q = R.cari.trim().toLowerCase();
    const daftar = SP.masalah.filter(m => (SP.milik.has(m.lokasi_id) || pengelola())
      && (R.status === 'semua' || (R.status === 'terbuka' ? terbuka(m) : (!terbuka(m) && !m.batal)))
      && (!R.zona || lok(m.lokasi_id)?.zona === R.zona)
      && (!q || `${namaBarang(m)} ${m.masalah} ${jalur(lok(m.lokasi_id) || {})} ${m.pelapor_nama || ''}`.toLowerCase().includes(q)));
    const bisaPilih = R.status !== 'baik';
    UI.lapor.pilih = new Set([...UI.lapor.pilih].filter(id => daftar.some(m => m.id === id && terbuka(m))));
    panel.innerHTML = `<div class="sp-saring-baris">
        <select id="spRwStatus" class="input" aria-label="Status"><option value="terbuka">Masih rusak</option><option value="baik">Sudah baik</option><option value="semua">Semua</option></select>
        <select id="spRwZona" class="input" aria-label="Zona"><option value="">Semua zona</option>${zs.map(k => `<option value="${esc(k)}">${esc(zona(k)?.nama || k)}</option>`).join('')}</select>
        <input id="spRwCari" class="input" type="search" placeholder="Cari barang, masalah, lokasi…" value="${esc(R.cari)}">
      </div>
      ${bisaPilih && daftar.some(terbuka) ? `<div class="sp-pilih-bilah${UI.lapor.pilih.size ? ' aktif' : ''}">
        <label class="switch-row"><input type="checkbox" id="spRwSemua" ${UI.lapor.pilih.size && UI.lapor.pilih.size === daftar.filter(terbuka).length ? 'checked' : ''}><span>Pilih semua yang masih rusak</span></label>
        <button type="button" class="btn btn-primary btn-sm" data-sp="baik-pilih" ${UI.lapor.pilih.size ? '' : 'disabled'}><i class="fa-solid fa-check-double"></i>Sudah baik (${angka(UI.lapor.pilih.size)})</button></div>` : ''}
      ${daftar.length ? `<ul class="sp-msl-daftar sp-rw">${daftar.slice(0, 400).map(m => itemMasalah(m, lok(m.lokasi_id), { lokasi: true, pilih: bisaPilih })).join('')}</ul>
        ${daftar.length > 400 ? `<p class="sp-kosong">Menampilkan 400 dari ${angka(daftar.length)}. Persempit dengan saringan.</p>` : ''}`
        : kosong(R.status === 'terbuka' ? 'Tidak ada masalah terbuka' : 'Belum ada riwayat', R.status === 'terbuka' ? 'Seluruh sarana amanah Anda tercatat baik.' : 'Riwayat 120 hari terakhir tampil di sini.', 'fa-circle-check')}`;
    $('spRwStatus').value = R.status; $('spRwZona').value = R.zona;
    $('spRwStatus').addEventListener('change', (e) => { R.status = e.target.value; panelRiwayat(panel); });
    $('spRwZona').addEventListener('change', (e) => { R.zona = e.target.value; panelRiwayat(panel); });
    $('spRwCari').addEventListener('input', (e) => {
      R.cari = e.target.value; const pos = e.target.selectionStart; panelRiwayat(panel);
      const i = $('spRwCari'); i.focus(); try { i.setSelectionRange(pos, pos); } catch (er) {}
    });
    $('spRwSemua')?.addEventListener('change', (e) => {
      UI.lapor.pilih = e.target.checked ? new Set(daftar.filter(terbuka).map(m => m.id)) : new Set(); panelRiwayat(panel);
    });
    panel.querySelectorAll('[data-sp-pilih]').forEach(c => c.addEventListener('change', (e) => {
      const id = Number(e.target.dataset.spPilih); e.target.checked ? UI.lapor.pilih.add(id) : UI.lapor.pilih.delete(id); panelRiwayat(panel);
    }));
  }

  async function klikLapor(e) {
    const t = e.target.closest('[data-sp-tab]');
    if (t) {
      if (UI.lapor.tab === 'penempatan' && window.RQPenempatan?.tanyaBuang && !(await window.RQPenempatan.tanyaBuang())) return;   // I5: draf belum disimpan
      UI.lapor.tab = t.dataset.spTab; UI.lapor.lokasi = null; return gambarPanelLapor();
    }
    const b = e.target.closest('[data-sp]'); if (!b || b.disabled) return;
    const d = b.dataset;
    try {
      if (d.sp === 'buka') { UI.lapor.lokasi = d.id; gambarPanelLapor(); return window.scrollTo({ top: 0, behavior: 'smooth' }); }
      if (d.sp === 'kembali') { UI.lapor.lokasi = null; return gambarPanelLapor(); }
      if (d.sp === 'ubin') return formLapor(lok(d.id), d.butir ? butir(d.butir) : null, d.nisn || null);
      if (d.sp === 'pelanggaran') {
        const m = SP.masalah.find(x => x.id === Number(d.msl)); if (!m) return;
        const kode = (setelan('kode_pelanggaran_rusak', {}) || {})[m.penyebab] || null;
        return modalCatatPelanggaran({ nisn: m.nisn, labelSantri: pemilikTeks(m), kode, labelKode: kode || '',
          catatan: `${namaBarang(m)}: ${m.masalah} (${lok(m.lokasi_id)?.nama || 'sarpras'}, dilaporkan ${tglPendek(tglJkt(m.dilaporkan_pada))})` });
      }
      if (d.sp === 'baik') { b.disabled = true; return tandaiBaik([Number(d.msl)]); }
      if (d.sp === 'baik-pilih') { b.disabled = true; return tandaiBaik([...UI.lapor.pilih]); }
      if (d.sp === 'batal') {
        const m = SP.masalah.find(x => x.id === Number(d.msl)); if (!m) return;
        const ok = await Swal.fire({ title: 'Batalkan laporan ini?', html: `<p>${esc(namaBarang(m))} · ${esc(m.masalah)}</p><p class="hint">Untuk salah input. Laporan tetap tercatat sebagai dibatalkan.</p>`,
          icon: 'question', showCancelButton: true, confirmButtonText: 'Batalkan laporan', cancelButtonText: 'Kembali', confirmButtonColor: MERAH });
        if (!ok.isConfirmed) return;
        await rpc('sarpras_masalah_batal', { p_id: m.id });
        toast('success', 'Laporan dibatalkan');
        return segarkanLapor();
      }
      if (d.sp === 'aman') {
        b.disabled = true;
        await rpc('sarpras_cek_catat', { p_lokasi: d.id });
        toast('success', 'Sudah dicek, aman', { nada: 'akui', sub: `${lok(d.id)?.nama || ''} · ${tglId(hariIni(), 'long')}` });
        return segarkanLapor();
      }
    } catch (err) { b.disabled = false; fireError(err); }
  }

  /* =====================================================================
   * 2 · PENGATURAN SARPRAS
   * ===================================================================== */
  async function atur(akar) {
    await bukaHalaman(akar, 'sarprasatur', 'Pengaturan Sarpras', async () => {
      await muat();
      if (APP.view !== 'sarprasatur') return;
      if (!UI.atur.unit || !unit(UI.atur.unit)) UI.atur.unit = [...SP.data.unit].sort(urutkan)[0]?.id || null;
      gambarAtur(akar);
      onKlik(klikAtur);
    });
  }
  async function segarkanAtur(pesan) {
    try { await muat(); } catch (e) { return fireError(e); }
    if (APP.view !== 'sarprasatur') return;
    const pos = scrollY;
    gambarAtur($('viewRoot'));
    window.scrollTo({ top: pos, behavior: 'auto' });
    if (pesan) toast('success', pesan);
  }
  function gambarAtur(akar) {
    const A = UI.atur;
    const aktif = setelan('aktif', false) === true;
    const penem = setelan('penempatan_terbuka', false) === true;
    const nKamar = SP.data.lokasi.filter(l => zona(l.zona)?.akses === 'binaan' && l.aktif).length;
    akar.innerHTML = `<div class="sp-atur">
      <header class="sp-atur-kepala card">
        <div><h3>Pengaturan Sarpras</h3>
          <small>${angka(nKamar)} ${esc(istilah('kamar').toLowerCase())} · ${angka(SP.data.lokasi.filter(l => l.aktif).length)} lokasi · ${angka(SP.data.butir.filter(b => b.aktif).length)} jenis barang</small></div>
        ${pengelola() ? `<div class="pk-sakelar-kelompok"><label class="sp-sakelar"><input type="checkbox" id="spAktif" ${aktif ? 'checked' : ''}>
            <span class="sp-sakelar-trek" aria-hidden="true"></span><span>${aktif ? 'Modul terbuka untuk musyrif' : 'Modul belum dibuka untuk musyrif'}</span></label>
          <label class="sp-sakelar"><input type="checkbox" id="spPenem" ${penem ? 'checked' : ''}>
            <span class="sp-sakelar-trek" aria-hidden="true"></span><span>${penem ? 'Penempatan terbuka untuk musyrif' : 'Penempatan belum dibuka untuk musyrif'}</span></label></div>`
          : `<div class="pk-sakelar-kelompok"><p class="sp-baca"><i class="fa-solid fa-lock"></i>Hanya-baca. Perubahan dilakukan pengelola sarpras.</p>
             <p class="sp-baca sp-baca-penem"><i class="fa-solid fa-bed"></i>Penempatan ${penem ? 'terbuka' : 'belum dibuka'} untuk musyrif</p></div>`}
      </header>
      ${tabNav([['kamar', `${istilah('kamar')} & lokasi`, 'fa-bed'], ['katalog', 'Katalog barang', 'fa-list-ul'], ['pelapor', 'Pelapor', 'fa-users-gear']], A.tab, 'Bagian pengaturan')}
      <div id="spPanel" class="sp-panel" role="tabpanel"></div>
    </div>`;
    $('spAktif')?.addEventListener('change', async (e) => {
      const nyala = e.target.checked; e.target.disabled = true;
      try {
        await rpc('sarpras_setelan_simpan', { p_kunci: 'aktif', p_nilai: nyala });
        segarkanAtur(nyala ? 'Modul dibuka. Musyrif melihat menu Sarpras setelah memuat ulang aplikasi.' : 'Modul ditutup untuk musyrif.');
      } catch (err) { e.target.checked = !nyala; e.target.disabled = false; fireError(err); }
    });
    $('spPenem')?.addEventListener('change', async (e) => {
      const nyala = e.target.checked; e.target.disabled = true;
      try {
        await rpc('sarpras_setelan_simpan', { p_kunci: 'penempatan_terbuka', p_nilai: nyala });
        segarkanAtur(nyala ? 'Penempatan dibuka. Musyrif melihat menu Sarpras setelah memuat ulang aplikasi.' : 'Penempatan ditutup untuk musyrif.');
      } catch (err) { e.target.checked = !nyala; e.target.disabled = false; fireError(err); }
    });
    gambarPanelAtur();
  }
  function gambarPanelAtur() {
    const panel = $('spPanel'); if (!panel) return;
    document.querySelectorAll('[data-sp-tab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.spTab === UI.atur.tab)));
    try { ({ kamar: panelKamar, katalog: panelKatalog, pelapor: panelPelapor })[UI.atur.tab](panel); }
    catch (e) { console.error(e); panel.innerHTML = kosong('Bagian ini gagal digambar', e?.message || String(e), 'fa-triangle-exclamation'); }
  }
  const tulis = (s) => (pengelola() ? s : '');

  /* ---------- tab Kamar & lokasi ------------------------------------- */
  function panelKamar(panel) {
    const A = UI.atur;
    const units = [...SP.data.unit].sort(urutkan);
    if (!units.length) {
      panel.innerHTML = kosong(`Belum ada ${istilah('unit').toLowerCase()} ${istilah('asrama').toLowerCase()}`,
        pengelola() ? 'Mulai dengan menambah unit asrama, lalu petakan ke data santri.' : 'Pengelola belum menyusun lokasi.', 'fa-sitemap')
        + tulis(`<p style="text-align:center">${tombol('unit-tambah', 'Tambah ' + istilah('unit').toLowerCase(), 'fa-plus', {}, 'btn-primary')}</p>`);
      return;
    }
    const u = unit(A.unit) || units[0]; A.unit = u.id;
    const zs = [...SP.data.zona].sort(urutkan).filter(z => z.aktif || SP.data.lokasi.some(l => l.unit_id === u.id && l.zona === z.kode));
    panel.innerHTML = `<div class="sp-kepala">
        ${units.length > 1 ? `<div class="sp-chip-daftar" role="group" aria-label="Unit">${units.map(x => `<button type="button" class="sp-pil-b${x.id === u.id ? ' on' : ''}" data-sp="unit-pilih" data-id="${esc(x.id)}">${esc(x.nama)}</button>`).join('')}</div>`
          : `<p class="sp-sub">${esc(u.nama)}${u.kunci_siswa ? ` <small>· data santri: ${esc(u.kunci_siswa)}</small>` : ''}</p>`}
        <span class="sp-kepala-aksi">${tulis(tombol('unit-ubah', 'Ubah unit', 'fa-pen-to-square', { id: u.id }) + tombol('unit-tambah', 'Unit', 'fa-plus') + tombol('zona-tambah', 'Zona', 'fa-layer-group'))}</span>
      </div>
      ${zs.map(z => z.akses === 'binaan' ? papanKamar(u, z) : daftarZona(u, z)).join('')}`;
  }
  function papanKamar(u, z) {
    const A = UI.atur;
    const kamar = SP.data.lokasi.filter(l => l.unit_id === u.id && l.zona === z.kode && !l.induk_id)
      .sort((a, b) => (a.nomor ?? 1e9) - (b.nomor ?? 1e9) || String(a.nama).localeCompare(String(b.nama), 'id', { numeric: true }));
    const ids = new Set(kamar.map(l => l.id));
    const pilih = [...A.pilih].filter(id => ids.has(id));
    const grup = new Map();
    kamar.forEach(l => { const k = l.lantai || null; if (!grup.has(k)) grup.set(k, []); grup.get(k).push(l); });
    const ringkas = [...grup.entries()].sort((a, b) => urutLantai(a[0], b[0])).map(([k, v]) => `${labelLantai(k)}: ${v.length}`).join(' · ');
    const satu = pilih.length === 1 ? lok(pilih[0]) : null;
    return `<section class="sp-zona-blok card" data-zona="${esc(z.kode)}">
      <header class="sp-zona-kepala"><h4><i class="fa-solid ${esc(z.ikon || 'fa-bed')}"></i>${esc(z.nama)}</h4>
        <small>${angka(kamar.length)} ${esc(istilah('kamar').toLowerCase())}${ringkas ? ' · ' + esc(ringkas) : ''} · pelapor: ${esc(istilah('musyrif').toLowerCase())} santri penghuni</small>
        <span class="sp-zona-aksi">${tulis(tombol('lok-tambah', istilah('kamar'), 'fa-plus', { unit: u.id, zona: z.kode })
          + (u.kunci_siswa ? tombol('kamar-data', 'Dari data santri', 'fa-user-group', { unit: u.id, zona: z.kode }) : '')
          + tombol('zona-ubah', 'Zona', 'fa-pen-to-square', { kode: z.kode }))}</span></header>
      ${pengelola() && kamar.length ? `<div class="sp-pilih-bilah${pilih.length ? ' aktif' : ''}">
        <span class="sp-pilih-n">${pilih.length ? `${angka(pilih.length)} dipilih` : 'Ketuk kotak untuk memilih'}</span>
        <span class="sp-pilih-aksi">
          ${tombol('pilih-semua', 'Semua', 'fa-check-double', { zona: z.kode, unit: u.id })}
          ${tombol('pilih-rentang', 'Rentang nomor…', 'fa-list-ol', { zona: z.kode, unit: u.id })}
          ${pilih.length ? `${[...new Set(SP.data.lokasi.map(l => l.lantai).filter(Boolean)), '1', '2'].filter((v, i, a) => a.indexOf(v) === i).sort(urutLantai).slice(0, 4)
              .map(v => tombol('lantai', labelLantai(v), 'fa-stairs', { v }, 'btn-ghost sp-lt')).join('')}
            ${tombol('lantai', `${istilah('lantai')} lain…`, '', { v: '?' })}
            ${tombol('kapasitas', 'Kapasitas…', 'fa-users')}
            ${tombol('isi', 'Isi khusus…', 'fa-table-list')}
            ${satu ? tombol('lok-ubah', 'Ubah', 'fa-pen-to-square', { id: satu.id }) + tombol(satu.aktif ? 'lok-hapus' : 'lok-aktif', satu.aktif ? 'Hapus' : 'Aktifkan', satu.aktif ? 'fa-trash-can' : 'fa-rotate', { id: satu.id }) : ''}
            ${tombol('pilih-kosong', 'Batal pilih', 'fa-xmark')}` : ''}
        </span></div>` : ''}
      ${kamar.length ? [...grup.entries()].sort((a, b) => urutLantai(a[0], b[0])).map(([k, isi]) => `<div class="sp-papan-baris">
          <span class="sp-papan-lt">${esc(labelLantai(k))}</span>
          <div class="sp-papan">${isi.map(l => {
            const nIsi = SP.data.standar.filter(s => s.lokasi_id === l.id).length;
            return `<button type="button" class="sp-kotak${A.pilih.has(l.id) ? ' on' : ''}${l.aktif ? '' : ' off'}" data-sp="${pengelola() ? 'kotak' : ''}" data-id="${esc(l.id)}"
              aria-pressed="${A.pilih.has(l.id)}" title="${esc(l.nama)}">
              <b>${esc(l.nomor ?? l.nama)}</b><small>${l.kapasitas ? `${l.kapasitas} ${esc(istilah('penghuni').toLowerCase())}` : 'kapasitas ?'}</small>
              ${nIsi ? `<i class="sp-kotak-isi" title="${nIsi} isi khusus">${nIsi}</i>` : ''}${l.aktif ? '' : '<i class="sp-kotak-off">nonaktif</i>'}</button>`;
          }).join('')}</div></div>`).join('')
        : `<p class="sp-kosong">Belum ada ${esc(istilah('kamar').toLowerCase())}.${u.kunci_siswa && pengelola() ? ' Gunakan "Dari data santri" untuk membuat kamar dari nomor yang sudah tercatat.' : ''}</p>`}
    </section>`;
  }
  function daftarZona(u, z) {
    const akar = SP.peta.akar.filter(l => l.unit_id === u.id && l.zona === z.kode);
    const akses = { penunjukan: 'pelapor: yang ditunjuk', semua_musyrif: `pelapor: semua ${istilah('musyrif').toLowerCase()} unit ini`, admin: 'pelapor: Admin & pengelola', binaan: '' }[z.akses] || '';
    const baris = (l, d) => {
      const anak = SP.peta.anak.get(l.id) || [];
      const nIsi = SP.data.standar.filter(s => s.lokasi_id === l.id).length;
      const bolehAnak = d + 1 < Math.max(1, (z.label_tingkat || []).length);
      const tanda = [l.lantai ? labelLantai(l.lantai) : '', l.kapasitas ? `${l.kapasitas} ${istilah('penghuni').toLowerCase()}` : '',
        nIsi ? `${nIsi} isi khusus` : '', (l.pelapor || []).length ? `${l.pelapor.length} pelapor` : ''].filter(Boolean);
      return `<li class="sp-lok${l.aktif ? '' : ' sp-nonaktif'}"><div class="sp-lok-baris">
          <span class="sp-lok-nama">${esc(l.nama)}</span>
          <span class="sp-lok-tanda">${tanda.map(t => `<span class="sp-tanda">${esc(t)}</span>`).join('')}${l.aktif ? '' : '<span class="sp-off">nonaktif</span>'}</span>
          <span class="sp-lok-aksi">${tulis((bolehAnak && l.aktif ? tombol('lok-tambah', labelTingkat(z, d + 1), 'fa-plus', { unit: u.id, zona: z.kode, induk: l.id }) : '')
            + tombol('isi', 'Isi', 'fa-table-list', { id: l.id }) + tombol('lok-ubah', 'Ubah', 'fa-pen-to-square', { id: l.id })
            + (l.aktif ? tombol('lok-hapus', 'Hapus', 'fa-trash-can', { id: l.id }) : tombol('lok-aktif', 'Aktifkan', 'fa-rotate', { id: l.id })))}</span>
        </div>${anak.length ? `<ul class="sp-pohon">${anak.map(c => baris(c, d + 1)).join('')}</ul>` : ''}</li>`;
    };
    return `<section class="sp-zona-blok card" data-zona="${esc(z.kode)}">
      <header class="sp-zona-kepala"><h4><i class="fa-solid ${esc(z.ikon || 'fa-layer-group')}"></i>${esc(z.nama)}${z.aktif ? '' : ' <span class="sp-off">nonaktif</span>'}</h4>
        <small>${angka(akar.length)} ${esc(labelTingkat(z, 0).toLowerCase())}${akses ? ' · ' + esc(akses) : ''}</small>
        <span class="sp-zona-aksi">${tulis((z.aktif ? tombol('lok-tambah', labelTingkat(z, 0), 'fa-plus', { unit: u.id, zona: z.kode }) : '')
          + tombol('zona-ubah', 'Zona', 'fa-pen-to-square', { kode: z.kode }) + (z.bawaan ? '' : tombol('zona-hapus', 'Hapus zona', 'fa-trash-can', { kode: z.kode })))}</span></header>
      ${akar.length ? `<ul class="sp-pohon sp-akar">${akar.map(l => baris(l, 0)).join('')}</ul>` : `<p class="sp-kosong">Belum ada ${esc(labelTingkat(z, 0).toLowerCase())}.</p>`}
    </section>`;
  }

  async function formUnit(u) {
    let kunci = [];
    try { kunci = [...new Set(((await muatSiswa()) || []).map(s => s.unit_gender).filter(Boolean))].sort(); } catch (e) {}
    const r = await Swal.fire({
      ...swalDasar, width: 500, title: u ? `Ubah ${istilah('unit').toLowerCase()}` : `Tambah ${istilah('unit').toLowerCase()}`, confirmButtonText: 'Simpan',
      html: `<div class="stack sp-form">
        <label class="label" for="spUnitNama">Nama</label><input id="spUnitNama" class="input" maxlength="80" value="${esc(u?.nama || '')}" placeholder="mis. ${esc(istilah('asrama'))} A">
        <label class="label" for="spUnitKunci">Data santri yang dipetakan</label>
        <select id="spUnitKunci" class="input"><option value="">— tidak dipetakan —</option>
          ${[...new Set([...kunci, ...(u?.kunci_siswa ? [u.kunci_siswa] : [])])].map(k => `<option value="${esc(k)}" ${u?.kunci_siswa === k ? 'selected' : ''}>${esc(k)}</option>`).join('')}</select>
      </div>`,
      preConfirm: async () => {
        const nama = $('spUnitNama').value.trim();
        if (!nama) { Swal.showValidationMessage('Nama wajib diisi.'); return false; }
        try { return await rpc('sarpras_unit_simpan', { p: { id: u?.id || null, nama, kunci_siswa: $('spUnitKunci').value || null } }); }
        catch (e) { Swal.showValidationMessage(e.message); return false; }
      }
    });
    if (r.isConfirmed) { UI.atur.unit = r.value?.id || UI.atur.unit; segarkanAtur('Tersimpan.'); }
  }
  async function formZona(z) {
    const AKSES = [['binaan', `${istilah('musyrif')} santri penghuni (otomatis)`], ['semua_musyrif', `Semua ${istilah('musyrif').toLowerCase()} unit itu`], ['penunjukan', 'Hanya yang ditunjuk'], ['admin', 'Hanya Admin & pengelola']];
    const r = await Swal.fire({
      ...swalDasar, width: 540, title: z ? 'Ubah zona' : 'Tambah zona', confirmButtonText: 'Simpan',
      html: `<div class="stack sp-form">
        <label class="label" for="spZonaKode">Kode</label>
        <input id="spZonaKode" class="input" maxlength="40" placeholder="huruf kecil, mis. dapur" value="${esc(z?.kode || '')}" ${z ? 'readonly' : ''}>
        <label class="label" for="spZonaNama">Nama</label><input id="spZonaNama" class="input" maxlength="60" value="${esc(z?.nama || '')}">
        <label class="label" for="spZonaAkses">Siapa yang melapor</label>
        <select id="spZonaAkses" class="input">${AKSES.map(([k, l]) => `<option value="${k}" ${(z?.akses || 'penunjukan') === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>
        <label class="label" for="spZonaTingkat">Sebutan tingkat (pisahkan koma)</label>
        <input id="spZonaTingkat" class="input" placeholder="mis. Sayap, Bilik" value="${esc((z?.label_tingkat || []).join(', '))}">
        <label class="label" for="spZonaFrek">Dianggap perlu dicek setelah … hari</label><input id="spZonaFrek" class="input" inputmode="numeric" value="${esc(z?.frekuensi_hari ?? 30)}">
        ${z ? `<label class="switch-row"><input type="checkbox" id="spZonaAktif" ${z.aktif ? 'checked' : ''}><span>Aktif</span></label>` : ''}
      </div>`,
      preConfirm: async () => {
        const p = { kode: $('spZonaKode').value.trim().toLowerCase(), nama: $('spZonaNama').value.trim(), akses: $('spZonaAkses').value,
          frekuensi_hari: Number($('spZonaFrek').value) || 30, label_tingkat: $('spZonaTingkat').value.split(',').map(s => s.trim()).filter(Boolean),
          ikon: z?.ikon || 'fa-layer-group', berpenghuni: z ? z.berpenghuni : $('spZonaAkses').value === 'binaan' };
        if (z) p.aktif = $('spZonaAktif').checked;
        try { return await rpc('sarpras_zona_simpan', { p }); } catch (e) { Swal.showValidationMessage(e.message); return false; }
      }
    });
    if (r.isConfirmed) segarkanAtur('Zona tersimpan.');
  }
  async function formLokasi(l) {
    const baru = !l.id;
    const z = zona(l.zona), d = l.induk_id ? kedalaman(lok(l.induk_id) || {}) + 1 : 0;
    const label = labelTingkat(z, baru ? d : kedalaman(l));
    const bernomor = z?.akses === 'binaan';
    const r = await Swal.fire({
      ...swalDasar, width: 520, title: `${baru ? 'Tambah' : 'Ubah'} ${label.toLowerCase()}`, confirmButtonText: 'Simpan',
      html: `<div class="stack sp-form">
        <p class="hint" style="margin:0 0 6px">${esc(unit(l.unit_id)?.nama || '')} · ${esc(z?.nama || l.zona)}${l.induk_id ? ' · ' + esc(jalur(lok(l.induk_id))) : ''}</p>
        <label class="label" for="spLokNama">Nama</label><input id="spLokNama" class="input" maxlength="80" value="${esc(l.nama || '')}" placeholder="${bernomor ? `${esc(istilah('kamar'))} 12` : `mis. ${esc(label)} Timur`}">
        <div class="sp-dua">
          ${bernomor ? `<div><label class="label" for="spLokNomor">Nomor</label><input id="spLokNomor" class="input" inputmode="numeric" value="${esc(l.nomor ?? '')}"></div>` : ''}
          <div><label class="label" for="spLokLantai">${esc(istilah('lantai'))}</label><input id="spLokLantai" class="input" maxlength="20" value="${esc(l.lantai || '')}" placeholder="${l.induk_id ? 'ikut induk' : 'mis. 1'}"></div>
          <div><label class="label" for="spLokKap">Kapasitas <small>(${esc(istilah('penghuni').toLowerCase())})</small></label><input id="spLokKap" class="input" inputmode="numeric" value="${esc(l.kapasitas ?? '')}"></div>
        </div>
      </div>`,
      didOpen: () => setTimeout(() => $('spLokNama')?.focus(), 80),
      preConfirm: async () => {
        const nama = $('spLokNama').value.trim(), nomor = ($('spLokNomor')?.value || '').trim(), kap = $('spLokKap').value.trim();
        if (!nama) { Swal.showValidationMessage('Nama wajib diisi.'); return false; }
        if (nomor && !/^\d{1,4}$/.test(nomor)) { Swal.showValidationMessage('Nomor harus angka.'); return false; }
        if (kap && !/^\d{1,3}$/.test(kap)) { Swal.showValidationMessage('Kapasitas harus angka.'); return false; }
        const p = { id: l.id || null, unit_id: l.unit_id, zona: l.zona, induk_id: l.induk_id || null, nama, nomor: bernomor ? (nomor ? Number(nomor) : null) : (l.nomor ?? null),
          gedung: l.gedung || null, lantai: $('spLokLantai').value.trim() || null, kapasitas: kap ? Number(kap) : null, titik_periksa: !l.induk_id };
        try { return await rpc('sarpras_lokasi_simpan', { p }); } catch (e) { Swal.showValidationMessage(e.message); return false; }
      }
    });
    if (r.isConfirmed) segarkanAtur('Lokasi tersimpan.');
  }
  async function hapusLokasi(id) {
    const l = lok(id); if (!l) return;
    const anak = (SP.peta.anak.get(id) || []).length;
    const ok = await Swal.fire({ title: `Hapus ${l.nama}?`, icon: 'warning', showCancelButton: true, cancelButtonText: 'Batal',
      confirmButtonText: anak ? 'Nonaktifkan' : 'Hapus', confirmButtonColor: MERAH,
      html: anak ? `<p>Lokasi ini punya <b>${anak}</b> turunan, jadi hanya dinonaktifkan.</p>`
        : '<p>Bila sudah punya riwayat laporan, lokasi hanya dinonaktifkan dan riwayatnya tetap utuh.</p>' });
    if (!ok.isConfirmed) return;
    const h = await rpc('sarpras_lokasi_hapus', { p_id: id });
    UI.atur.pilih.delete(id);
    segarkanAtur(h.aksi === 'hapus' ? 'Lokasi dihapus.' : `Lokasi dinonaktifkan (${angka(h.riwayat)} riwayat tetap utuh).`);
  }
  async function kamarDariData(unitId, kode) {
    const u = unit(unitId); if (!u) return;
    const ok = await Swal.fire({ title: `${istilah('kamar')} dari data santri`, icon: 'question', showCancelButton: true, confirmButtonText: 'Buat', cancelButtonText: 'Batal',
      confirmButtonColor: BIRU, html: `<p>${esc(istilah('kamar'))} dibuat untuk setiap nomor yang sudah tercatat pada santri aktif ${esc(u.nama)}. Yang sudah ada tidak digandakan.</p>` });
    if (!ok.isConfirmed) return;
    const h = await rpc('sarpras_kamar_dari_data', { p_unit: unitId, p_zona: kode || 'kamar' });
    segarkanAtur(`${angka(h.dibuat)} ${istilah('kamar').toLowerCase()} dibuat${h.ada ? `, ${angka(h.ada)} sudah ada` : ''}.`);
  }
  function kamarDiZona(unitId, kode) { return SP.data.lokasi.filter(l => l.unit_id === unitId && l.zona === kode && !l.induk_id); }
  async function pilihRentang(unitId, kode) {
    const r = await Swal.fire({ ...swalDasar, showLoaderOnConfirm: false, title: 'Pilih rentang nomor', confirmButtonText: 'Pilih',
      html: `<p class="hint">Contoh: <b>1-15</b>, atau <b>1-10, 14, 20-24</b></p><input id="spRentang" class="input" placeholder="1-15" autocomplete="off">`,
      didOpen: () => setTimeout(() => $('spRentang')?.focus(), 60),
      preConfirm: () => {
        const nomor = new Set();
        for (const bag of $('spRentang').value.split(',').map(s => s.trim()).filter(Boolean)) {
          const m = bag.match(/^(\d{1,4})\s*(?:-|–|s\.?d\.?)\s*(\d{1,4})$/) || bag.match(/^(\d{1,4})$/);
          if (!m) { Swal.showValidationMessage(`"${bag}" tidak terbaca.`); return false; }
          const a = Number(m[1]), b = Number(m[2] ?? m[1]);
          for (let i = Math.min(a, b); i <= Math.max(a, b) && i - Math.min(a, b) < 2000; i++) nomor.add(i);
        }
        return nomor;
      } });
    if (!r.isConfirmed) return;
    const kena = kamarDiZona(unitId, kode).filter(l => r.value.has(Number(l.nomor)));
    kena.forEach(l => UI.atur.pilih.add(l.id));
    toast('info', `${angka(kena.length)} ${istilah('kamar').toLowerCase()} dipilih.`);
    gambarPanelAtur();
  }
  async function aturLantai(v) {
    const ids = [...UI.atur.pilih]; if (!ids.length) return;
    let nilai = v;
    if (v === '?') {
      const r = await Swal.fire({ ...swalDasar, showLoaderOnConfirm: false, title: istilah('lantai'), input: 'text', inputPlaceholder: 'mis. 3 atau Dasar', confirmButtonText: 'Terapkan',
        inputValidator: (x) => (!x || !x.trim()) ? 'Isi nama lantai.' : (x.trim().length > 20 ? 'Maksimal 20 huruf.' : null) });
      if (!r.isConfirmed) return; nilai = r.value.trim();
    }
    const h = await rpc('sarpras_lantai_atur', { p_lokasi: ids, p_lantai: nilai });
    UI.atur.pilih.clear();
    segarkanAtur(`${angka(h.diubah)} ${istilah('kamar').toLowerCase()} → ${labelLantai(nilai)}.`);
  }
  async function aturKapasitas() {
    const ids = [...UI.atur.pilih]; if (!ids.length) return;
    const kap = ids.map(id => lok(id)?.kapasitas).filter(Boolean);
    const r = await Swal.fire({ ...swalDasar, showLoaderOnConfirm: false, title: `Kapasitas ${angka(ids.length)} ${istilah('kamar').toLowerCase()}`, input: 'number',
      inputValue: kap.length && kap.every(k => k === kap[0]) ? kap[0] : '', inputAttributes: { min: 1, max: 999, step: 1 }, confirmButtonText: 'Terapkan',
      html: `<p class="hint">Jumlah ${esc(istilah('penghuni').toLowerCase())}. Dipakai barang yang dihitung per ${esc(istilah('penghuni').toLowerCase())} (ranjang, lemari, laci).</p>`,
      inputValidator: (x) => (!/^\d{1,3}$/.test(String(x)) || Number(x) < 1) ? 'Isi angka 1–999.' : null });
    if (!r.isConfirmed) return;
    const h = await rpc('sarpras_kapasitas_atur', { p_lokasi: ids, p_kapasitas: Number(r.value) });
    segarkanAtur(`Kapasitas ${angka(h.diubah)} lokasi: ${r.value}.`);
  }
  async function formIsi(ids) {
    const lks = ids.map(lok).filter(Boolean); if (!lks.length) return;
    const zonaSet = [...new Set(lks.map(l => l.zona))];
    const daftar = (SP.data.butir || []).filter(b => b.aktif && (!(b.zona || []).length || zonaSet.some(k => b.zona.includes(k)))).sort(urutkan);
    const awal = new Map(daftar.map(b => {
      const v = lks.map(l => isiKhusus(l.id, b.id)?.jumlah ?? null);
      return [b.id, v.every(x => x === v[0]) ? v[0] : '*'];
    }));
    const contoh = lks.length === 1 ? lks[0] : null;
    const r = await Swal.fire({
      ...swalDasar, width: 620, title: `Isi khusus · ${lks.length === 1 ? esc(lks[0].nama) : `${angka(lks.length)} lokasi`}`, confirmButtonText: 'Simpan',
      html: `<p class="hint">Kosongkan untuk mengikuti aturan katalog. Isi angka bila lokasi ini berbeda, mis. ${esc(istilah('kamar').toLowerCase())} besar ber-AC 3, atau jumlah kloset tiap sayap.</p>
        <div class="sp-isi-daftar">${daftar.map(b => {
          const v = awal.get(b.id);
          return `<label class="sp-isi-baris">${pikto(b.ikon)}<span><b>${esc(b.nama)}</b><small>aturan: ${esc(aturanTeks(b, contoh))}</small></span>
            <input class="input" type="number" min="0" max="9999" inputmode="numeric" data-butir="${esc(b.id)}" value="${v === null || v === '*' ? '' : v}" placeholder="${v === '*' ? 'beragam' : '–'}"></label>`;
        }).join('')}</div>`,
      preConfirm: async () => {
        const ubah = [...document.querySelectorAll('.sp-isi-daftar input[data-butir]')].map(i => [i.dataset.butir, i.value.trim()])
          .filter(([id, v]) => { const a = awal.get(id); return a === '*' ? v !== '' : String(a ?? '') !== v; });
        try {
          let n = 0;
          for (const [id, v] of ubah) { await rpc('sarpras_isi_simpan', { p_lokasi: ids, p_butir: id, p_jumlah: v === '' ? 0 : Number(v) }); n++; }
          return n;
        } catch (e) { Swal.showValidationMessage(e.message); return false; }
      }
    });
    if (r.isConfirmed) segarkanAtur(r.value ? `${angka(r.value)} isi khusus disimpan.` : 'Tidak ada perubahan.');
  }

  /* ---------- tab Katalog barang -------------------------------------- */
  function panelKatalog(panel) {
    const q = UI.atur.cari.trim().toLowerCase();
    const pakai = new Map(); SP.data.standar.forEach(s => pakai.set(s.butir_id, (pakai.get(s.butir_id) || 0) + 1));
    const daftar = [...SP.data.butir].sort(urutkan).filter(b => !q || `${b.nama} ${b.kategori || ''}`.toLowerCase().includes(q));
    const namaZona = (zs) => (zs || []).length ? zs.map(k => zona(k)?.nama || k).join(', ') : 'semua zona';
    panel.innerHTML = `<div class="sp-kepala">
        <input id="spCariKat" class="input sp-cari" type="search" placeholder="Cari barang atau kategori…" value="${esc(UI.atur.cari)}">
        <span class="sp-kepala-aksi">${tulis(tombol('butir-tambah', 'Tambah barang', 'fa-plus', {}, 'btn-primary'))}</span>
      </div>
      ${daftar.length ? `<div class="sp-kat-kisi">${daftar.map(b => `<article class="sp-kat card${b.aktif ? '' : ' sp-nonaktif'}">
          <span class="sp-kat-ikon">${pikto(b.ikon)}</span>
          <div class="sp-kat-isi"><b>${esc(b.nama)}</b>${b.aktif ? '' : ' <span class="sp-off">nonaktif</span>'}
            <small>${esc(namaZona(b.zona))} · ${esc(aturanTeks(b))}${pakai.get(b.id) ? ` · ${angka(pakai.get(b.id))} isi khusus` : ''}</small>
            ${b.milik_santri ? `<span class="sp-lencana"><i class="fa-solid fa-user"></i>milik ${esc(istilah('penghuni').toLowerCase())}</span>` : ''}
            ${(b.masalah_umum || []).length ? `<span class="sp-kat-msl">${b.masalah_umum.map(m => `<i>${esc(m)}</i>`).join('')}</span>` : '<span class="sp-kat-msl kosong">Belum ada pilihan masalah</span>'}</div>
          <span class="sp-kat-aksi">${tulis(tombol('butir-ubah', 'Ubah', 'fa-pen-to-square', { id: b.id })
            + (b.aktif ? tombol('butir-hapus', 'Hapus', 'fa-trash-can', { id: b.id }) : tombol('butir-aktif', 'Aktifkan', 'fa-rotate', { id: b.id })))}</span>
        </article>`).join('')}</div>`
        : kosong(q ? 'Tidak ada yang cocok' : 'Katalog masih kosong', q ? 'Coba kata lain.' : (pengelola() ? 'Tambahkan barang yang disediakan lembaga.' : ''), 'fa-list-ul')}`;
    $('spCariKat')?.addEventListener('input', (e) => {
      UI.atur.cari = e.target.value; const pos = e.target.selectionStart; panelKatalog(panel);
      const i = $('spCariKat'); i.focus(); try { i.setSelectionRange(pos, pos); } catch (er) {}
    });
  }
  async function formButir(b) {
    const kategori = [...new Set(SP.data.butir.map(x => x.kategori).filter(Boolean))].sort();
    const aturan = b?.per_anak ? 'anak' : b?.jumlah_tetap ? 'tetap' : (b ? 'bebas' : 'tetap');
    let ikon = b?.ikon || 'kotak';
    const r = await Swal.fire({
      ...swalDasar, width: 620, title: b ? 'Ubah barang' : 'Tambah barang', confirmButtonText: 'Simpan',
      html: `<div class="stack sp-form">
        <div class="sp-dua">
          <div><label class="label" for="spButNama">Nama</label><input id="spButNama" class="input" maxlength="80" value="${esc(b?.nama || '')}"></div>
          <div><label class="label" for="spButKat">Kategori</label><input id="spButKat" class="input" list="spDaftarKat" maxlength="40" value="${esc(b?.kategori || '')}">
            <datalist id="spDaftarKat">${kategori.map(k => `<option value="${esc(k)}">`).join('')}</datalist></div>
        </div>
        <span class="label">Gambar</span>
        <div class="sp-pikto-pilih" id="spButIkon">${Object.keys(PIKTO).filter(k => k !== 'lain').map(k => `<button type="button" class="sp-pikto-b${k === ikon ? ' on' : ''}" data-v="${k}" title="${esc(NAMA_PIKTO[k] || k)}" aria-label="${esc(NAMA_PIKTO[k] || k)}">${pikto(k)}</button>`).join('')}</div>
        <span class="label">Berlaku di <small>(kosong = semua zona)</small></span>
        <div class="sp-centang">${[...SP.data.zona].sort(urutkan).map(z => `<label class="switch-row"><input type="checkbox" class="spButZona" value="${esc(z.kode)}" ${(b?.zona || []).includes(z.kode) ? 'checked' : ''}><span>${esc(z.nama)}</span></label>`).join('')}</div>
        <span class="label">Jumlah per lokasi</span>
        <div class="sp-aturan">
          <label class="switch-row"><input type="radio" name="spAturan" value="anak" ${aturan === 'anak' ? 'checked' : ''}><span>Satu per ${esc(istilah('penghuni').toLowerCase())} (ikut kapasitas)</span></label>
          <label class="switch-row"><input type="radio" name="spAturan" value="tetap" ${aturan === 'tetap' ? 'checked' : ''}><span>Tetap</span>
            <input id="spButJml" class="input" type="number" min="1" max="9999" value="${esc(b?.jumlah_tetap ?? 1)}" aria-label="Jumlah tetap"></label>
          <label class="switch-row"><input type="radio" name="spAturan" value="bebas" ${aturan === 'bebas' ? 'checked' : ''}><span>Tidak dibatasi</span></label>
        </div>
        <label class="switch-row sp-milik-sw"><input type="checkbox" id="spButMilik" ${b?.milik_santri ? 'checked' : ''}>
          <span>Milik ${esc(istilah('penghuni').toLowerCase())}: pemilik dipilih saat melapor (ranjang, lemari, laci)</span></label>
        <label class="label" for="spButMsl">Pilihan masalah <small>(satu per baris)</small></label>
        <textarea id="spButMsl" class="input" rows="4" placeholder="Tidak dingin&#10;Bocor air&#10;Mati total">${esc((b?.masalah_umum || []).join('\n'))}</textarea>
      </div>`,
      didOpen: (pop) => pop.querySelector('#spButIkon').addEventListener('click', (e) => {
        const t = e.target.closest('.sp-pikto-b'); if (!t) return;
        ikon = t.dataset.v; pop.querySelectorAll('.sp-pikto-b').forEach(x => x.classList.toggle('on', x === t));
      }),
      preConfirm: async () => {
        const nama = $('spButNama').value.trim();
        if (!nama) { Swal.showValidationMessage('Nama wajib diisi.'); return false; }
        const at = document.querySelector('input[name="spAturan"]:checked')?.value || 'bebas';
        const jml = Number($('spButJml').value);
        if (at === 'tetap' && !(jml >= 1 && jml <= 9999)) { Swal.showValidationMessage('Jumlah tetap 1–9999.'); return false; }
        const msl = [...new Set($('spButMsl').value.split('\n').map(s => s.trim()).filter(Boolean))];
        const p = { id: b?.id || null, nama, kategori: $('spButKat').value.trim() || null, satuan: b?.satuan || null, ikon,
          zona: [...document.querySelectorAll('.spButZona:checked')].map(x => x.value), per_anak: at === 'anak',
          jumlah_tetap: at === 'tetap' ? jml : null, masalah_umum: msl, ditanggung: b ? b.ditanggung : true, milik_santri: $('spButMilik').checked };
        try { return await rpc('sarpras_butir_simpan', { p }); } catch (e) { Swal.showValidationMessage(e.message); return false; }
      }
    });
    if (r.isConfirmed) segarkanAtur('Barang tersimpan.');
  }
  async function hapusButir(id) {
    const b = butir(id); if (!b) return;
    const d = await rpc('sarpras_butir_dampak', { p_id: id });
    const riwayat = Number(d.kasus || 0) > 0;
    const ok = await Swal.fire({
      title: `${riwayat ? 'Nonaktifkan' : 'Hapus'} ${b.nama}?`, icon: 'warning', showCancelButton: true, cancelButtonText: 'Batal',
      confirmButtonText: riwayat ? 'Nonaktifkan' : 'Hapus', confirmButtonColor: MERAH,
      html: riwayat ? `<p>${esc(b.nama)} sudah punya <b>${angka(d.kasus)}</b> riwayat laporan. Riwayat tetap utuh; barang ini hanya tidak muncul lagi saat melapor.</p>`
        : `<p>${Number(d.lokasi) ? `Isi khususnya di <b>${angka(d.lokasi)}</b> lokasi ikut terhapus.` : 'Belum pernah dilaporkan.'}</p>`
    });
    if (!ok.isConfirmed) return;
    const h = await rpc('sarpras_butir_hapus', { p_id: id });
    segarkanAtur(h.aksi === 'hapus' ? 'Barang dihapus.' : 'Barang dinonaktifkan.');
  }

  /* ---------- tab Pelapor --------------------------------------------- */
  let PROFIL = null;
  async function muatProfil() {
    if (PROFIL) return PROFIL;
    const { data, error } = await db.from('profiles').select('id,nama,role,korps,kelas_binaan,aktif').eq('aktif', true).order('nama');
    if (error) throw error;
    return (PROFIL = data || []);
  }
  const tanpaTugas = () => new Set(setelan('peran_tanpa_tugas', []) || []);
  const musyrifKah = (p) => /^musyrif/i.test(p.korps || '') && !tanpaTugas().has(p.role);
  async function panelPelapor(panel) {
    panel.innerHTML = `<div class="sp-muat"><i class="fa-solid fa-circle-notch fa-spin"></i></div>`;
    let prof = [], siswa = [];
    try { [prof, siswa] = await Promise.all([muatProfil(), muatSiswa()]); } catch (e) { panel.innerHTML = kosong('Data akun belum bisa dimuat', e.message, 'fa-triangle-exclamation'); return; }
    if (APP.view !== 'sarprasatur' || UI.atur.tab !== 'pelapor') return;
    const nama = (id) => prof.find(p => p.id === id)?.nama || 'akun nonaktif';
    const u = unit(UI.atur.unit) || SP.data.unit[0];
    const tunjuk = SP.data.lokasi.filter(l => l.aktif && (!u || l.unit_id === u.id) && !['binaan', 'admin'].includes(zona(l.zona)?.akses))
      .sort((a, b) => (zona(a.zona)?.urutan - zona(b.zona)?.urutan) || jalur(a).localeCompare(jalur(b), 'id', { numeric: true }));
    const kamar = u ? SP.data.lokasi.filter(l => l.aktif && l.unit_id === u.id && zona(l.zona)?.akses === 'binaan' && l.nomor != null).sort((a, b) => a.nomor - b.nomor) : [];
    const santri = (siswa || []).filter(s => s.status_santri === 'Aktif' && u && s.unit_gender === u.kunci_siswa && s.nomor_kamar != null);
    const musy = prof.filter(musyrifKah);
    const pegang = (l) => musy.filter(p => santri.some(s => Number(s.nomor_kamar) === Number(l.nomor) && (p.kelas_binaan || []).includes(s.kelas)));
    const tanpa = kamar.filter(l => !pegang(l).length);
    const musyTanpa = musy.filter(p => !kamar.some(l => pegang(l).includes(p)));
    panel.innerHTML = `<section class="sp-zona-blok card">
        <header class="sp-zona-kepala"><h4><i class="fa-solid fa-user-check"></i>Ditunjuk</h4>
          <small>${esc(istilah('kamar'))} ${esc(istilah('musyrif').toLowerCase())} hanya dilapor yang ditunjuk; kamar mandi ditambah ${esc(istilah('musyrif').toLowerCase())} unitnya. Penunjukan pada sayap berlaku juga untuk biliknya. Sarana umum dilapor Admin.</small></header>
        ${tunjuk.length ? `<ul class="sp-tugas">${tunjuk.map(l => `<li class="sp-tugas-baris">
            <div><b>${esc(jalur(l))}</b><small>${esc(zona(l.zona)?.nama || '')}${zona(l.zona)?.akses === 'semua_musyrif' ? ` · semua ${esc(istilah('musyrif').toLowerCase())} unit ini, ditambah:` : ''}</small></div>
            <span class="sp-chip-daftar">${(l.pelapor || []).length ? l.pelapor.map(id => `<span class="sp-chip">${esc(nama(id))}</span>`).join('') : '<span class="sp-kosong">belum ada</span>'}</span>
            ${tulis(tombol('pelapor', 'Atur', 'fa-user-pen', { id: l.id }))}</li>`).join('')}</ul>`
          : '<p class="sp-kosong">Belum ada lokasi asrama umum, kamar mandi, atau kamar musyrif.</p>'}
      </section>
      <section class="sp-zona-blok card">
        <header class="sp-zona-kepala"><h4><i class="fa-solid fa-bed"></i>${esc(istilah('kamar'))} santri · otomatis</h4>
          <small>Dari kelas binaan ${esc(istilah('musyrif').toLowerCase())} dan nomor ${esc(istilah('kamar').toLowerCase())} santri. Berubah sendiri saat penempatan santri diperbarui.</small></header>
        ${kamar.length ? `<div class="tbl"><table class="sp-tbl"><thead><tr><th>${esc(istilah('kamar'))}</th><th>Santri</th><th>Pemegang</th></tr></thead><tbody>
          ${kamar.map(l => { const p = pegang(l), n = santri.filter(s => Number(s.nomor_kamar) === Number(l.nomor)).length;
            return `<tr class="${p.length ? '' : 'sp-tanpa'}"><td><b>${esc(l.nama)}</b></td><td>${angka(n)}${l.kapasitas ? ` / ${angka(l.kapasitas)}` : ''}</td>
              <td>${p.length ? p.map(x => `<span class="sp-chip">${esc(x.nama)}</span>`).join(' ') : `<span class="sp-merah">${n ? `belum dipegang (kelas santri tanpa ${esc(istilah('musyrif').toLowerCase())})` : 'kosong'}</span>`}</td></tr>`; }).join('')}
          </tbody></table></div>` : '<p class="sp-kosong">Belum ada kamar bernomor.</p>'}
        ${tanpa.length || musyTanpa.length ? `<p class="sp-catatan"><i class="fa-solid fa-circle-info"></i>${tanpa.length ? `${angka(tanpa.length)} ${esc(istilah('kamar').toLowerCase())} belum dipegang siapa pun. ` : ''}${musyTanpa.length ? `${angka(musyTanpa.length)} ${esc(istilah('musyrif').toLowerCase())} belum memegang ${esc(istilah('kamar').toLowerCase())}: ${musyTanpa.map(p => esc(p.nama)).join(', ')}.` : ''}</p>` : ''}
      </section>`;
  }
  async function formPelapor(ids) {
    const lks = ids.map(lok).filter(Boolean); if (!lks.length) return;
    const prof = (await muatProfil()).filter(p => !tanpaTugas().has(p.role)).sort((a, b) => (musyrifKah(b) - musyrifKah(a)) || String(a.nama).localeCompare(String(b.nama), 'id'));
    const awal = new Set(lks[0].pelapor || []);
    const r = await Swal.fire({
      ...swalDasar, width: 540, title: `Pelapor · ${esc(lks.map(l => l.nama).join(', '))}`, confirmButtonText: 'Simpan',
      html: `<input id="spPelCari" class="input" type="search" placeholder="Cari nama…" style="margin-bottom:8px">
        <div class="sp-pil-daftar" id="spPelDaftar">${prof.map(p => `<label class="switch-row" data-nama="${esc(String(p.nama).toLowerCase())}">
          <input type="checkbox" value="${esc(p.id)}" ${awal.has(p.id) ? 'checked' : ''}><span>${esc(p.nama)}<small>${esc(p.korps || p.role)}</small></span></label>`).join('')}</div>`,
      didOpen: (pop) => pop.querySelector('#spPelCari').addEventListener('input', (e) => {
        const q = e.target.value.trim().toLowerCase();
        pop.querySelectorAll('#spPelDaftar [data-nama]').forEach(x => { x.hidden = q && !x.dataset.nama.includes(q); });
      }),
      preConfirm: async () => {
        const pilih = [...document.querySelectorAll('#spPelDaftar input:checked')].map(x => x.value);
        try { return await rpc('sarpras_pelapor_simpan', { p_lokasi: ids, p_profil: pilih }); } catch (e) { Swal.showValidationMessage(e.message); return false; }
      }
    });
    if (r.isConfirmed) segarkanAtur('Pelapor tersimpan.');
  }

  async function klikAtur(e) {
    const t = e.target.closest('[data-sp-tab]');
    if (t) { UI.atur.tab = t.dataset.spTab; return gambarPanelAtur(); }
    const b = e.target.closest('[data-sp]'); if (!b || b.disabled || !b.dataset.sp) return;
    const d = b.dataset, A = UI.atur;
    try {
      switch (d.sp) {
        case 'unit-pilih': A.unit = d.id; A.pilih.clear(); return gambarPanelAtur();
        case 'unit-tambah': return formUnit(null);
        case 'unit-ubah': return formUnit(unit(d.id));
        case 'zona-tambah': return formZona(null);
        case 'zona-ubah': return formZona(zona(d.kode));
        case 'zona-hapus': {
          const ok = await Swal.fire({ title: `Hapus zona ${zona(d.kode)?.nama}?`, icon: 'warning', showCancelButton: true, confirmButtonText: 'Hapus', cancelButtonText: 'Batal',
            confirmButtonColor: MERAH, html: '<p>Zona yang sudah berisi lokasi hanya dinonaktifkan.</p>' });
          if (!ok.isConfirmed) return;
          const h = await rpc('sarpras_zona_hapus', { p_kode: d.kode });
          return segarkanAtur(h.aksi === 'hapus' ? 'Zona dihapus.' : 'Zona dinonaktifkan.');
        }
        case 'kotak': A.pilih.has(d.id) ? A.pilih.delete(d.id) : A.pilih.add(d.id); return gambarPanelAtur();
        case 'pilih-semua': kamarDiZona(d.unit, d.zona).forEach(l => A.pilih.add(l.id)); return gambarPanelAtur();
        case 'pilih-kosong': A.pilih.clear(); return gambarPanelAtur();
        case 'pilih-rentang': return pilihRentang(d.unit, d.zona);
        case 'lantai': return aturLantai(d.v);
        case 'kapasitas': return aturKapasitas();
        case 'isi': return formIsi(d.id ? [d.id] : [...A.pilih]);
        case 'lok-tambah': return formLokasi({ unit_id: d.unit, zona: d.zona, induk_id: d.induk || null });
        case 'lok-ubah': return formLokasi(lok(d.id));
        case 'lok-hapus': return hapusLokasi(d.id);
        case 'lok-aktif': await rpc('sarpras_lokasi_aktif', { p_id: d.id, p_aktif: true }); return segarkanAtur('Lokasi diaktifkan kembali.');
        case 'kamar-data': return kamarDariData(d.unit, d.zona);
        case 'butir-tambah': return formButir(null);
        case 'butir-ubah': return formButir(butir(d.id));
        case 'butir-hapus': return hapusButir(d.id);
        case 'butir-aktif': await rpc('sarpras_butir_aktif', { p_id: d.id, p_aktif: true }); return segarkanAtur('Barang diaktifkan kembali.');
        case 'pelapor': return formPelapor([d.id]);
      }
    } catch (err) { fireError(err); }
  }

  /* =====================================================================
   * 3 · LAPORAN SARPRAS (untuk unit fasilitas)
   * ===================================================================== */
  async function laporan(akar) {
    await bukaHalaman(akar, 'sarpraslaporan', 'Laporan Sarpras', async () => {
      await muat();
      await muatMasalah(geser(hariIni(), -400));
      if (APP.view !== 'sarpraslaporan') return;
      if (!UI.lap) UI.lap = { unit: [...SP.data.unit].sort(urutkan)[0]?.id || null, zona: new Set(), lantai: '', lokasi: new Set(), butir: null,
        lain: true, per: hariIni(), sertakanBaik: false, baikSejak: awalBulan(hariIni()), urut: 'lokasi' };
      gambarLaporan(akar);
      onKlik(klikLaporan);
    });
  }
  function lokasiCakupan() {
    const S = UI.lap;
    return SP.data.lokasi.filter(l => (!S.unit || l.unit_id === S.unit) && (!S.zona.size || S.zona.has(l.zona))
      && (!S.lantai || lantaiDari(l) === S.lantai) && (!S.lokasi.size || S.lokasi.has(l.id) || (l.induk_id && S.lokasi.has(l.induk_id))));
  }
  function isiLaporan() {
    const S = UI.lap;
    const ids = new Set(lokasiCakupan().map(l => l.id));
    const cocokBarang = (m) => m.butir_id ? (!S.butir || S.butir.has(m.butir_id)) : S.lain;
    const urutLok = (a, b) => urutLantai(lantaiDari(lok(a.lokasi_id) || {}), lantaiDari(lok(b.lokasi_id) || {}))
      || jalur(lok(a.lokasi_id) || {}).localeCompare(jalur(lok(b.lokasi_id) || {}), 'id', { numeric: true }) || namaBarang(a).localeCompare(namaBarang(b), 'id');
    const umur = (m) => selisih(tglJkt(m.dilaporkan_pada), S.per);
    const buka = SP.masalah.filter(m => ids.has(m.lokasi_id) && cocokBarang(m) && terbukaPada(m, S.per))
      .sort(S.urut === 'umur' ? (a, b) => umur(b) - umur(a) || urutLok(a, b) : urutLok);
    const baik = S.sertakanBaik ? SP.masalah.filter(m => ids.has(m.lokasi_id) && cocokBarang(m) && !m.batal && m.selesai_pada
      && tglJkt(m.selesai_pada) >= S.baikSejak && tglJkt(m.selesai_pada) <= S.per).sort(urutLok) : [];
    const rekap = new Map();
    buka.forEach(m => { const k = namaBarang(m); const r = rekap.get(k) || { barang: k, ikon: ikonBarang(m), kasus: 0, unit: 0, lokasi: new Set() };
      r.kasus++; r.unit += m.jumlah; r.lokasi.add(m.lokasi_id); rekap.set(k, r); });
    return { buka, baik, rekap: [...rekap.values()].sort((a, b) => b.unit - a.unit || a.barang.localeCompare(b.barang, 'id')), umur,
      lokasiN: new Set(buka.map(m => m.lokasi_id)).size, terlama: buka.reduce((a, m) => Math.max(a, umur(m)), 0) };
  }
  function judulCakupan() {
    const S = UI.lap, u = unit(S.unit);
    const z = S.zona.size ? [...S.zona].map(k => zona(k)?.nama || k).join(', ') : `Seluruh ${istilah('asrama').toLowerCase()}`;
    const lok2 = S.lokasi.size ? [...S.lokasi].map(id => lok(id)?.nama).filter(Boolean).join(', ') : '';
    const brg = S.butir ? (S.butir.size <= 4 ? [...S.butir].map(id => butir(id)?.nama).filter(Boolean).join(', ') : `${S.butir.size} jenis barang`) : '';
    return [u?.nama, z, S.lantai ? labelLantai(S.lantai) : '', lok2, brg].filter(Boolean).join(' · ');
  }
  function gambarLaporan(akar) {
    const S = UI.lap;
    const units = [...SP.data.unit].sort(urutkan);
    const zs = [...SP.data.zona].sort(urutkan).filter(z => SP.data.lokasi.some(l => l.zona === z.kode && (!S.unit || l.unit_id === S.unit)));
    const lantai = [...new Set(SP.data.lokasi.filter(l => !S.unit || l.unit_id === S.unit).map(lantaiDari).filter(Boolean))].sort(urutLantai);
    const pilihLok = SP.data.lokasi.filter(l => (!S.unit || l.unit_id === S.unit) && !l.induk_id && (!S.zona.size || S.zona.has(l.zona)) && (!S.lantai || lantaiDari(l) === S.lantai))
      .sort((a, b) => jalur(a).localeCompare(jalur(b), 'id', { numeric: true }));
    const barang = [...SP.data.butir].sort(urutkan).filter(b => b.aktif || SP.masalah.some(m => m.butir_id === b.id));
    const semuaBarang = !S.butir;
    const ttd = setelan('penandatangan', []) || [];
    akar.innerHTML = `<div class="sp-lap">
      <section class="sp-lap-saring card">
        <header class="sp-zona-kepala"><h4><i class="fa-solid fa-sliders"></i>Isi laporan</h4>
          <span class="sp-zona-aksi">${pengelola() ? tombol('kop', 'Kop & tanda tangan', 'fa-signature') : ''}</span></header>
        <div class="sp-lap-grid">
          ${units.length > 1 ? `<div class="sp-lap-f"><span class="label">${esc(istilah('unit'))}</span><div class="sp-pil">${units.map(u => `<button type="button" class="sp-pil-b${u.id === S.unit ? ' on' : ''}" data-sp="l-unit" data-id="${esc(u.id)}">${esc(u.nama)}</button>`).join('')}</div></div>` : ''}
          <div class="sp-lap-f"><span class="label">Cakupan</span><div class="sp-pil">
            <button type="button" class="sp-pil-b${S.zona.size ? '' : ' on'}" data-sp="l-zona" data-v="">Seluruh ${esc(istilah('asrama').toLowerCase())}</button>
            ${zs.map(z => `<button type="button" class="sp-pil-b${S.zona.has(z.kode) ? ' on' : ''}" data-sp="l-zona" data-v="${esc(z.kode)}">${esc(z.nama)}</button>`).join('')}</div></div>
          <div class="sp-lap-f sp-lap-dua">
            <label><span class="label">${esc(istilah('lantai'))}</span><select id="spLapLantai" class="input"><option value="">Semua</option>${lantai.map(v => `<option value="${esc(v)}" ${S.lantai === v ? 'selected' : ''}>${esc(labelLantai(v))}</option>`).join('')}</select></label>
            <label><span class="label">Posisi per tanggal</span><input id="spLapPer" class="input" type="date" value="${esc(S.per)}" max="${esc(hariIni())}"></label>
            <label><span class="label">Urutan</span><select id="spLapUrut" class="input"><option value="lokasi" ${S.urut === 'lokasi' ? 'selected' : ''}>Per lokasi (jalur keliling)</option><option value="umur" ${S.urut === 'umur' ? 'selected' : ''}>Paling lama rusak</option></select></label>
          </div>
          <details class="sp-lap-f sp-lap-lok"${S.lokasi.size ? ' open' : ''}><summary><span class="label">Lokasi tertentu</span> <small>${S.lokasi.size ? `${angka(S.lokasi.size)} dipilih` : 'semua'}</small></summary>
            <div class="sp-pil sp-pil-rapat">${pilihLok.map(l => `<button type="button" class="sp-pil-b kecil${S.lokasi.has(l.id) ? ' on' : ''}" data-sp="l-lok" data-id="${esc(l.id)}">${esc(l.nama)}</button>`).join('')}
            ${S.lokasi.size ? `<button type="button" class="sp-pil-b kecil hapus" data-sp="l-lok" data-id="">Semua lokasi</button>` : ''}</div></details>
          <div class="sp-lap-f"><span class="label">Barang <small>${semuaBarang ? 'semua' : `${angka(S.butir.size)} dipilih`}</small></span>
            <div class="sp-barang-kisi">${barang.map(b => `<label class="sp-barang${semuaBarang || S.butir.has(b.id) ? ' on' : ''}"><input type="checkbox" data-sp-barang="${esc(b.id)}" ${semuaBarang || S.butir.has(b.id) ? 'checked' : ''}>${pikto(b.ikon)}<span>${esc(b.nama)}</span></label>`).join('')}
              <label class="sp-barang${S.lain ? ' on' : ''}"><input type="checkbox" data-sp-barang="__lain" ${S.lain ? 'checked' : ''}>${pikto('lain')}<span>Lainnya</span></label></div>
            <p class="sp-barang-aksi">${tombol('l-barang-semua', 'Semua', 'fa-check-double')}${tombol('l-barang-kosong', 'Kosongkan', 'fa-eraser')}</p></div>
          <div class="sp-lap-f sp-lap-dua">
            <label class="switch-row"><input type="checkbox" id="spLapBaik" ${S.sertakanBaik ? 'checked' : ''}><span>Sertakan yang sudah baik sejak</span></label>
            <input id="spLapBaikSejak" class="input" type="date" value="${esc(S.baikSejak)}" ${S.sertakanBaik ? '' : 'disabled'}>
          </div>
        </div>
      </section>
      <section class="sp-lap-hasil" id="spLapHasil"></section>
      ${!ttd.length && pengelola() ? `<p class="sp-catatan"><i class="fa-solid fa-signature"></i>Penandatangan belum diisi. Tekan "Kop & tanda tangan".</p>` : ''}
    </div>`;
    const ganti = (id, fn) => $(id)?.addEventListener('change', (e) => { fn(e.target); gambarLaporan(akar); });
    ganti('spLapLantai', (t) => { S.lantai = t.value; S.lokasi.clear(); });
    ganti('spLapPer', (t) => { S.per = t.value && t.value <= hariIni() ? t.value : hariIni(); });
    ganti('spLapUrut', (t) => { S.urut = t.value; });
    ganti('spLapBaik', (t) => { S.sertakanBaik = t.checked; });
    ganti('spLapBaikSejak', (t) => { S.baikSejak = t.value || awalBulan(S.per); });
    akar.querySelectorAll('[data-sp-barang]').forEach(c => c.addEventListener('change', (e) => {
      const id = e.target.dataset.spBarang;
      if (id === '__lain') S.lain = e.target.checked;
      else {
        if (!S.butir) S.butir = new Set(barang.map(b => b.id));
        e.target.checked ? S.butir.add(id) : S.butir.delete(id);
        if (S.butir.size === barang.length) S.butir = null;
      }
      gambarLaporan(akar);
    }));
    gambarHasilLaporan();
  }
  function gambarHasilLaporan() {
    const el = $('spLapHasil'); if (!el) return;
    const S = UI.lap, h = isiLaporan();
    const kertas = window.RQ_SIDANG?.kertasDaftar?.() || [{ kode: 'A4', nama: 'A4' }, { kode: 'F4', nama: 'F4' }];
    const kSimpan = window.RQ_SIDANG?.kertasTersimpan?.() || 'A4';
    el.innerHTML = `<div class="sp-lap-ringkas">
        <div class="sp-stat"><b>${angka(h.buka.length)}</b><span>masalah terbuka</span></div>
        <div class="sp-stat"><b>${angka(h.buka.reduce((a, m) => a + m.jumlah, 0))}</b><span>unit rusak</span></div>
        <div class="sp-stat"><b>${angka(h.lokasiN)}</b><span>lokasi terdampak</span></div>
        <div class="sp-stat"><b>${angka(h.terlama)}</b><span>hari terlama</span></div>
        ${S.sertakanBaik ? `<div class="sp-stat baik"><b>${angka(h.baik.length)}</b><span>sudah baik</span></div>` : ''}
      </div>
      <div class="sp-lap-aksi card">
        <div><b>Posisi per ${esc(tglId(S.per, 'long'))}</b><small>${esc(judulCakupan())}</small></div>
        <span class="sp-lap-tombol">
          <select id="spLapKertas" class="input" aria-label="Ukuran kertas">${kertas.map(k => `<option value="${esc(k.kode)}" ${k.kode === kSimpan ? 'selected' : ''}>${esc(k.nama)}${k.ukuran ? ' · ' + esc(k.ukuran) : ''}</option>`).join('')}</select>
          ${tombol('l-pdf', 'PDF', 'fa-file-pdf', {}, 'btn-primary')}${tombol('l-xlsx', 'Excel', 'fa-file-excel')}
        </span>
      </div>
      ${lembarLaporan(h)}`;
    $('spLapKertas')?.addEventListener('change', (e) => window.RQ_SIDANG?.simpanKertas?.(e.target.value));
  }
  /** Pratinjau berbentuk lembar kertas — susunannya sama dengan PDF. */
  function lembarLaporan(h) {
    const S = UI.lap, lb = lembagaKop(), pn = setelan('penerima', {}) || {}, td = (setelan('penandatangan', []) || []).filter(t => t.nama || t.jabatan);
    let g = null;
    const baris = h.buka.map((m, i) => {
      const l = lok(m.lokasi_id), b = m.butir_id ? butir(m.butir_id) : null, p = b && l ? jumlahStandar(l, b) : null, u = h.umur(m);
      const grup = S.urut === 'lokasi' && g !== m.lokasi_id ? (g = m.lokasi_id, `<tr class="grup"><td colspan="7">${esc(jalur(l || {}))} <span>${esc(labelLantai(lantaiDari(l || {})))}</span></td></tr>`) : '';
      return grup + `<tr class="baris"><td class="c">${i + 1}</td>
        <td><span class="sp-sel-barang">${pikto(ikonBarang(m))}<span><b>${esc(namaBarang(m))}</b>${m.pemilik_nama ? `<small>${esc(pemilikTeks(m))}</small>` : ''}${S.urut === 'lokasi' ? '' : `<small>${esc(jalur(l || {}))}</small>`}</span></span></td>
        <td>${esc(m.masalah)}</td><td class="c">${angka(m.jumlah)}${p ? `<small>/${angka(p)}</small>` : ''}</td>
        <td class="c">${esc(tglPendek(tglJkt(m.dilaporkan_pada)))}</td><td class="c${u > 30 ? ' sp-merah' : ''}">${angka(u)} hr</td>
        <td class="ket">${esc([namaPenyebab(m.penyebab), m.catatan].filter(Boolean).join('; '))}</td></tr>`;
    }).join('');
    return `<div class="sp-lembar-wadah"><article class="sp-lembar" aria-label="Pratinjau laporan">
      ${window.RQ_SIDANG?.kopHtml ? `<header class="sp-lembar-kop-baku">${window.RQ_SIDANG.kopHtml()}</header>` : `<header class="sp-lembar-kop"><b>${esc(String(lb.nama || '').toUpperCase())}</b></header>`}
      <h3>LAPORAN KONDISI SARANA ASRAMA</h3>
      <p class="sp-lembar-sub">Posisi per ${esc(tglId(S.per, 'long'))}</p>
      <p class="sp-lembar-ket">${esc(judulCakupan())}${pn.nama ? `<br>Kepada: ${esc(pn.nama)}` : ''}</p>
      ${!h.buka.length && !h.baik.length ? '<p class="sp-lembar-par">Nihil.</p>' : ''}
      ${h.buka.length ? `<h4>A. Masalah yang perlu ditangani</h4>
        <div class="sp-lembar-gulir"><table class="sp-lembar-tbl"><thead><tr><th class="c">No</th><th>Barang</th><th>Masalah</th><th class="c">Jml</th><th class="c">Sejak</th><th class="c">Umur</th><th>Keterangan</th></tr></thead>
        <tbody>${baris}</tbody></table></div>
        <h4>B. Rekap per barang</h4>
        <div class="sp-lembar-gulir"><table class="sp-lembar-tbl sp-lembar-rekap"><thead><tr><th>Barang</th><th class="c">Masalah</th><th class="c">Unit rusak</th><th class="c">Lokasi</th></tr></thead>
        <tbody>${h.rekap.map(r => `<tr class="baris"><td><span class="sp-sel-barang">${pikto(r.ikon)}<b>${esc(r.barang)}</b></span></td><td class="c">${r.kasus}</td><td class="c">${r.unit}</td><td class="c">${r.lokasi.size}</td></tr>`).join('')}</tbody></table></div>` : ''}
      ${h.baik.length ? `<h4>${h.buka.length ? 'C' : 'A'}. Sudah baik sejak ${esc(tglId(S.baikSejak))}</h4>
        <div class="sp-lembar-gulir"><table class="sp-lembar-tbl sp-lembar-baik"><thead><tr><th>Lokasi</th><th>Barang</th><th>Masalah</th><th class="c">Dilaporkan</th><th class="c">Baik</th></tr></thead>
        <tbody>${h.baik.map(m => `<tr class="baris"><td><b>${esc(jalur(lok(m.lokasi_id) || {}))}</b></td><td>${esc(namaBarang(m))}${m.pemilik_nama ? `<small>${esc(pemilikTeks(m))}</small>` : ''}</td><td>${esc(m.masalah)}</td>
          <td class="c">${esc(tglPendek(tglJkt(m.dilaporkan_pada)))}</td><td class="c">${esc(tglPendek(tglJkt(m.selesai_pada)))}</td></tr>`).join('')}</tbody></table></div>` : ''}
      ${td.length ? `<footer class="sp-lembar-ttd">
        ${td[1] ? `<div><span aria-hidden="true">&nbsp;</span><span>Mengetahui,</span><span class="sp-lembar-jab">${esc(td[1].jabatan || '')}</span><i class="sp-lembar-qr" aria-hidden="true"></i><b>${esc(td[1].nama || '')}</b></div>` : '<div></div>'}
        <div><span>${esc([(setelan('lembaga', {}) || {}).kota || 'Meulaboh', tglId(S.per, 'long')].filter(Boolean).join(', '))}</span><span>Penanggung Jawab,</span><span class="sp-lembar-jab">${esc(td[0].jabatan || '')}</span>${qrTtd(td[0], tglId(S.per, 'long'), 'Laporan Kondisi Sarana Asrama')}<b>${esc(td[0].nama || '')}</b></div>
      </footer>` : '<p class="sp-lembar-tanpa">Penanggung jawab belum diisi.</p>'}
    </article></div>`;
  }
  /** QR keabsahan pada pratinjau — sama dengan yang tercetak di PDF. */
  function qrTtd(t, terbit, dok) {
    const A = window.RQ_SIDANG;
    if (!t?.nama || !A?.qr) return '<i class="sp-lembar-qr" aria-hidden="true"></i>';
    const q = A.qr(A.qrTeks ? A.qrTeks({ nama: t.nama, jabatan: t.jabatan, dok, terbit }) : t.nama);
    return q?.uri ? `<img class="sp-lembar-qr" src="${q.uri}" alt="Kode QR keabsahan">` : '<i class="sp-lembar-qr" aria-hidden="true"></i>';
  }
  async function formKop() {
    const lb = setelan('lembaga', {}) || {}, pn = setelan('penerima', {}) || {}, td = setelan('penandatangan', []) || [];
    const t0 = td[0] || {}, t1 = td[1] || {};
    const r = await Swal.fire({
      ...swalDasar, width: 600, title: 'Kop & tanda tangan', confirmButtonText: 'Simpan',
      html: `<div class="stack sp-form">
        <div class="sp-dua"><div><label class="label" for="spKopKota">Tempat tanda tangan</label><input id="spKopKota" class="input" maxlength="60" value="${esc(lb.kota || '')}" placeholder="nama kota"></div>
          <div><label class="label" for="spKopPenerima">Ditujukan kepada</label><input id="spKopPenerima" class="input" maxlength="120" value="${esc(pn.nama || '')}" placeholder="mis. Unit Fasilitas"></div></div>
        <span class="label">Penanggung jawab (kanan, ber-QR keabsahan)</span>
        <div class="sp-dua"><input id="spTtdJab" class="input" maxlength="80" value="${esc(t0.jabatan || '')}" placeholder="Jabatan">
          <input id="spTtdNama" class="input" maxlength="120" value="${esc(t0.nama || '')}" placeholder="Nama lengkap & gelar"></div>
        <span class="label">Mengetahui <small>(opsional, kiri)</small></span>
        <div class="sp-dua"><input id="spTtd2Jab" class="input" maxlength="80" value="${esc(t1.jabatan || '')}" placeholder="Jabatan">
          <input id="spTtd2Nama" class="input" maxlength="120" value="${esc(t1.nama || '')}" placeholder="Nama lengkap & gelar"></div>
      </div>`,
      preConfirm: async () => {
        const v = (id) => $(id).value.trim();
        const ttd = [{ jabatan: v('spTtdJab'), nama: v('spTtdNama') }, { jabatan: v('spTtd2Jab'), nama: v('spTtd2Nama') }].filter(t => t.jabatan || t.nama);
        if (ttd.length === 1 && !ttd[0].nama && v('spTtd2Nama')) { Swal.showValidationMessage('Isi penanggung jawab lebih dulu.'); return false; }
        if (!v('spTtdNama') && v('spTtd2Nama')) { Swal.showValidationMessage('Isi nama penanggung jawab (kanan) lebih dulu.'); return false; }
        try {
          await rpc('sarpras_setelan_simpan', { p_kunci: 'lembaga', p_nilai: { ...lb, kota: v('spKopKota') || null } });
          await rpc('sarpras_setelan_simpan', { p_kunci: 'penerima', p_nilai: { ...pn, nama: v('spKopPenerima') || null } });
          await rpc('sarpras_setelan_simpan', { p_kunci: 'penandatangan', p_nilai: ttd });
          return true;
        } catch (e) { Swal.showValidationMessage(e.message); return false; }
      }
    });
    if (!r.isConfirmed) return;
    await muat();
    gambarLaporan($('viewRoot'));
    toast('success', 'Kop & tanda tangan tersimpan.');
  }

  /* ---------- PDF (jsPDF lewat jembatan RQ_SIDANG) --------------------- */
  function mesinPdf(pdf, kertas) {
    const [mT, mL, mB, mR] = kertas.margin;
    const W = kertas.lebar, H = kertas.tinggi, L = W - mL - mR, KAKI = 9, PT = 0.3528;
    const fmt = () => (Array.isArray(kertas.format) ? kertas.format.slice() : kertas.format);
    const M = { pdf, y: mT, W, H, L, mL, mR, mT, mB };
    M.huruf = (n, g) => { pdf.setFont('helvetica', g || 'normal'); pdf.setFontSize(n); };
    M.tinta = (r, g, b) => pdf.setTextColor(r, g, b);
    M.baru = () => { pdf.addPage(fmt(), 'portrait'); M.y = mT; };
    M.sisa = () => H - mB - KAKI - M.y;
    M.perlu = (h) => { if (M.sisa() < h) { M.baru(); return true; } return false; };
    M.teks = (t, x, y, o) => pdf.text(teksPdf(t), x, y, o);
    M.paragraf = (t, n = 8, w = L, x = mL, warna = [71, 85, 105]) => {
      M.huruf(n); M.tinta(...warna);
      const b = pdf.splitTextToSize(teksPdf(t), w); const lh = n * PT * 1.3;
      b.forEach(s => { M.perlu(lh); pdf.text(s, x, M.y); M.y += lh; });
    };
    M.kop = (logo, lb, sub) => {
      const A = window.RQ_SIDANG;
      if (A?.kopPdf) { M.y = A.kopPdf(pdf, { mL, mR, W, y: M.y, logo }); return; }
      if (logo && logo.uri) {
        const h = 17, w = Math.min(26, h * (logo.w || 160) / (logo.h || 94));
        try { pdf.addImage(logo.uri, 'PNG', mL, M.y, w, h, 'logoKopSarpras', 'FAST'); } catch (e) { console.warn('[sarpras] logo dilewati:', e.message); }
      }
      M.huruf(6.8); M.tinta(100, 116, 139); M.teks(sub, W / 2, M.y + 4, { align: 'center', charSpace: 0.4 });
      M.huruf(14.5, 'bold'); M.tinta(15, 23, 42); M.teks(String(lb.nama || '').toUpperCase(), W / 2, M.y + 10.2, { align: 'center' });
      if (lb.alamat) { M.huruf(7.6); M.tinta(100, 116, 139); M.teks(lb.alamat, W / 2, M.y + 14.8, { align: 'center' }); }
      M.y += 19.5;
      pdf.setDrawColor(15, 23, 42); pdf.setLineWidth(0.7); pdf.line(mL, M.y, W - mR, M.y);
      pdf.setLineWidth(0.25); pdf.line(mL, M.y + 1.1, W - mR, M.y + 1.1);
      M.y += 7;
    };
    M.judul = (judul, baris) => {
      M.huruf(12.5, 'bold'); M.tinta(20, 33, 61); M.teks(judul, W / 2, M.y, { align: 'center' }); M.y += 5.4;
      baris.filter(Boolean).forEach((t, i) => { M.huruf(i ? 7.8 : 9.2, i ? 'normal' : 'bold'); M.tinta(i ? 90 : 40, i ? 96 : 52, i ? 112 : 80); M.teks(t, W / 2, M.y, { align: 'center' }); M.y += i ? 4.2 : 4.8; });
      M.y += 2.2;
    };
    M.subjudul = (t) => { M.perlu(12); M.huruf(9.2, 'bold'); M.tinta(20, 33, 61); M.teks(t, mL, M.y); M.y += 2; pdf.setDrawColor(201, 162, 39); pdf.setLineWidth(0.5); pdf.line(mL, M.y, mL + 18, M.y); M.y += 4.2; };
    /** kolom: [{judul, lebar|bobot, rata}], baris: [{sel:[...], grup?, tebal?, isi?:[r,g,b]}] */
    M.tabel = (kolom, baris, o = {}) => {
      const PAD = 1.5, FS = o.fs || 7.6, LH = FS * PT * 1.25;
      const tetap = kolom.reduce((a, k) => a + (k.lebar || 0), 0), bobot = kolom.reduce((a, k) => a + (k.lebar ? 0 : (k.bobot || 1)), 0);
      const lebar = kolom.map(k => k.lebar || (L - tetap) * (k.bobot || 1) / bobot);
      const kepala = () => {
        const h = 6.4; pdf.setFillColor(20, 33, 61); pdf.rect(mL, M.y, L, h, 'F');
        M.huruf(7, 'bold'); M.tinta(247, 241, 220); let x = mL;
        kolom.forEach((k, i) => { M.teks(k.judul, k.rata === 'center' ? x + lebar[i] / 2 : k.rata === 'right' ? x + lebar[i] - PAD : x + PAD, M.y + 4.3, { align: k.rata || 'left' }); x += lebar[i]; });
        M.y += h;
      };
      M.perlu(16); kepala();
      baris.forEach((r, ri) => {
        if (r.grup) {
          const h = 5.6; if (M.perlu(h + LH * 2 + 4)) kepala();
          pdf.setFillColor(238, 242, 248); pdf.rect(mL, M.y, L, h, 'F');
          M.huruf(7.4, 'bold'); M.tinta(20, 33, 61); M.teks(r.grup, mL + PAD, M.y + 3.9); M.y += h; return;
        }
        M.huruf(FS, r.tebal ? 'bold' : 'normal');
        const sel = kolom.map((k, i) => pdf.splitTextToSize(teksPdf(r.sel[i] ?? ''), lebar[i] - PAD * 2));
        const h = Math.max(...sel.map(s => s.length)) * LH + PAD * 2;
        if (M.perlu(h)) kepala();
        if (r.isi) { pdf.setFillColor(...r.isi); pdf.rect(mL, M.y, L, h, 'F'); }
        else if (ri % 2) { pdf.setFillColor(250, 250, 252); pdf.rect(mL, M.y, L, h, 'F'); }
        let x = mL;
        sel.forEach((s, i) => {
          const k = kolom[i]; M.huruf(FS, r.tebal || (k.tebal && s.length) ? 'bold' : 'normal');
          const w = r.warna?.[i]; w ? M.tinta(...w) : M.tinta(30, 41, 59);
          pdf.text(s, k.rata === 'center' ? x + lebar[i] / 2 : k.rata === 'right' ? x + lebar[i] - PAD : x + PAD, M.y + PAD + FS * PT * 0.95, { align: k.rata || 'left', lineHeightFactor: 1.25 });
          x += lebar[i];
        });
        pdf.setDrawColor(226, 232, 240); pdf.setLineWidth(0.15); pdf.line(mL, M.y + h, W - mR, M.y + h);
        M.y += h;
      });
      M.y += 4;
    };
    /** v2.77: tanda tangan kanan = penanggung jawab, bertanda QR keabsahan chemint. */
    M.ttd = (tgl, kota, daftar, label = {}) => {
      const td = (daftar || []).filter(t => t.nama || t.jabatan); if (!td.length) return;
      const A = window.RQ_SIDANG;
      let qr = null;
      if (td[0].nama && A?.qr) {
        const isi = A.qrTeks ? A.qrTeks({ nama: td[0].nama, jabatan: td[0].jabatan, dok: label.dok, terbit: tgl })
          : [td[0].nama, td[0].jabatan, label.dok, 'Diterbitkan ' + tgl].filter(Boolean).join('\n');
        qr = A.qr(isi);
      }
      const sQr = qr?.uri ? Math.min(29.5, Math.max(20, (qr.modul || 37) * 0.6)) : 0;
      const ruang = Math.max(19, sQr + 3);
      const kol = 72, xKanan = W - mR - kol / 2, xKiri = mL + kol / 2;
      M.perlu(16 + ruang + 6); M.y += 2;
      M.huruf(8.4); M.tinta(30, 41, 59);
      M.teks(`${kota ? kota + ', ' : ''}${tgl}`, xKanan, M.y, { align: 'center' });
      const yRuang = M.y + 12.5, yNama = yRuang + ruang + 2.5;
      const tulisTtd = (t, x, atas) => {
        M.huruf(8.4); M.tinta(30, 41, 59);
        if (atas) M.teks(atas, x, M.y + 4.4, { align: 'center' });
        if (t.jabatan) { M.huruf(8.4, 'bold'); pdf.text(pdf.splitTextToSize(teksPdf(t.jabatan), kol), x, M.y + 8.8, { align: 'center' }); }
        if (t.nama) {
          M.huruf(8.6, 'bold'); M.tinta(15, 23, 42); M.teks(t.nama, x, yNama, { align: 'center' });
          const w = Math.min(kol, pdf.getTextWidth(teksPdf(t.nama))); pdf.setDrawColor(30, 41, 59); pdf.setLineWidth(0.25); pdf.line(x - w / 2, yNama + 0.8, x + w / 2, yNama + 0.8);
        }
      };
      tulisTtd(td[0], xKanan, label.kanan ?? 'Penanggung Jawab,');
      if (sQr) { try { pdf.addImage(qr.uri, 'PNG', xKanan - sQr / 2, yRuang, sQr, sQr, undefined, 'FAST'); } catch (e) { console.warn('[sarpras] QR dilewati:', e.message); } }
      if (td[1]) tulisTtd(td[1], xKiri, label.kiri ?? 'Mengetahui,');
      M.y = yNama + 5;
    };
    M.kaki = (catatan) => {
      const n = pdf.getNumberOfPages();
      for (let i = 1; i <= n; i++) {
        pdf.setPage(i); M.huruf(6.6); M.tinta(120, 130, 150);
        pdf.setDrawColor(226, 232, 240); pdf.setLineWidth(0.2); pdf.line(mL, H - mB - 4.2, W - mR, H - mB - 4.2);
        M.teks(catatan, mL, H - mB - 1); M.teks(`Halaman ${i} dari ${n}`, W - mR, H - mB - 1, { align: 'right' });
      }
    };
    return M;
  }
  async function pdfBaru() {
    const A = window.RQ_SIDANG;
    if (!A?.pdfBaru) throw new Error('Pembuat PDF belum tersedia. Muat ulang aplikasi.');
    const kode = $('spLapKertas')?.value || A.kertasTersimpan?.() || 'A4';
    A.simpanKertas?.(kode);
    const [{ pdf, kertas }, logo] = await Promise.all([A.pdfBaru(kode), A.logoKop ? A.logoKop().catch(() => null) : null]);
    return { pdf, kertas, logo };
  }
  const namaBerkas = (s) => teksPdf(s).replace(/[^\w .,+-]+/g, ' ').replace(/\s+/g, ' ').trim();
  const lembagaKop = () => { const lb = setelan('lembaga', {}) || {}; const u = unit(UI.lap?.unit || UI.peta?.unit); return { ...lb, nama: lb.nama || u?.nama || istilah('lembaga') }; };
  const jamCetak = () => new Date().toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: TZ });

  async function unduhPdfLaporan(btn) {
    const S = UI.lap, h = isiLaporan();
    btn.disabled = true;
    try {
      const { pdf, kertas, logo } = await pdfBaru();
      const M = mesinPdf(pdf, kertas);
      const pn = setelan('penerima', {}) || {};
      M.kop(logo, lembagaKop(), 'SARANA DAN PRASARANA ' + istilah('asrama').toUpperCase());
      M.judul('LAPORAN KONDISI SARANA ASRAMA', [`Posisi per ${tglId(S.per, 'long')}`, judulCakupan(), pn.nama ? `Kepada: ${pn.nama}` : '']);
      if (!h.buka.length && !h.baik.length) { M.paragraf('Nihil.', 8.4, M.L, M.mL, [51, 65, 85]); M.y += 2.5; }
      if (h.buka.length) {
        M.subjudul('A. Masalah yang perlu ditangani');
        const baris = []; let g = null;
        h.buka.forEach((m, i) => {
          const l = lok(m.lokasi_id), b = m.butir_id ? butir(m.butir_id) : null, p = b && l ? jumlahStandar(l, b) : null;
          if (S.urut === 'lokasi' && g !== m.lokasi_id) { g = m.lokasi_id; baris.push({ grup: `${jalur(l || {})}  -  ${labelLantai(lantaiDari(l || {}))}` }); }
          const u = h.umur(m);
          const brg = namaBarang(m) + (m.pemilik_nama ? `\n${pemilikTeks(m)}` : '');
          baris.push({ sel: [String(i + 1), S.urut === 'lokasi' ? brg : `${jalur(l || {})}\n${brg}`, m.masalah,
            `${m.jumlah}${p ? '/' + p : ''}`, tglPendek(tglJkt(m.dilaporkan_pada)), `${u} hr`, [namaPenyebab(m.penyebab), m.catatan].filter(Boolean).join('; ')],
            warna: [null, null, null, null, null, u > 30 ? [180, 35, 60] : null, [90, 96, 112]] });
        });
        M.tabel([{ judul: 'No', lebar: 8, rata: 'center' }, { judul: S.urut === 'lokasi' ? 'Barang' : 'Lokasi / Barang', bobot: 1.25, tebal: true }, { judul: 'Masalah', bobot: 1.5 },
          { judul: 'Jml', lebar: 11, rata: 'center' }, { judul: 'Sejak', lebar: 17, rata: 'center' }, { judul: 'Umur', lebar: 13, rata: 'center' }, { judul: 'Keterangan', bobot: 1.6 }], baris);
        M.subjudul('B. Rekap per barang');
        M.tabel([{ judul: 'Barang', bobot: 2, tebal: true }, { judul: 'Masalah', lebar: 22, rata: 'center' }, { judul: 'Unit rusak', lebar: 24, rata: 'center' }, { judul: 'Lokasi', lebar: 22, rata: 'center' }],
          h.rekap.map(r => ({ sel: [r.barang, String(r.kasus), String(r.unit), String(r.lokasi.size)] })));
      }
      if (h.baik.length) {
        M.subjudul(`${h.buka.length ? 'C' : 'A'}. Sudah baik sejak ${tglId(S.baikSejak)}`);
        M.tabel([{ judul: 'Lokasi', bobot: 1.4, tebal: true }, { judul: 'Barang', bobot: 1.1 }, { judul: 'Masalah', bobot: 1.6 }, { judul: 'Dilaporkan', lebar: 20, rata: 'center' }, { judul: 'Baik', lebar: 18, rata: 'center' }],
          h.baik.map(m => ({ sel: [jalur(lok(m.lokasi_id) || {}), namaBarang(m) + (m.pemilik_nama ? `\n${pemilikTeks(m)}` : ''), m.masalah, tglPendek(tglJkt(m.dilaporkan_pada)), tglPendek(tglJkt(m.selesai_pada))] })));
      }
      M.ttd(tglId(S.per, 'long'), (setelan('lembaga', {}) || {}).kota || 'Meulaboh', setelan('penandatangan', []), { dok: 'Laporan Kondisi Sarana Asrama' });
      M.kaki(`Laporan Sarpras - chemint ${jamCetak()} WIB`);
      try { pdf.setProperties({ title: 'Laporan Kondisi Sarana Asrama', creator: 'chemint' }); } catch (e) {}
      pdf.save(namaBerkas(`Laporan Sarpras ${judulCakupan()} ${S.per}`).slice(0, 120) + '.pdf');
      toast('success', 'Laporan PDF diunduh', { nada: 'akui', sub: `${kertas.nama} · ${angka(h.buka.length)} masalah` });
    } catch (e) { fireError(e); }
    finally { btn.disabled = false; }
  }
  async function unduhXlsx(btn) {
    const S = UI.lap, h = isiLaporan();
    btn.disabled = true;
    try {
      const XLSX = await prMuatXlsx();
      const lb = lembagaKop(), pn = setelan('penerima', {}) || {};
      const K = window.RQ_SIDANG?.kop;
      const kop = K ? [[K.sistem], [K.lembaga], [K.bagian], [`${K.alamat} · ${K.aplikasi}`], []] : [[String(lb.nama || '').toUpperCase()], []];
      const kepala = [...kop, ['LAPORAN KONDISI SARANA ASRAMA'], [`Posisi per ${tglId(S.per, 'long')}`], [judulCakupan()], pn.nama ? [`Kepada: ${pn.nama}`] : [], []];
      const pj = (setelan('penandatangan', []) || []).filter(t => t.nama || t.jabatan)[0];
      const kakiTtd = pj ? [[], [], ...[`${(setelan('lembaga', {}) || {}).kota || 'Meulaboh'}, ${tglId(S.per, 'long')}`, 'Penanggung Jawab,', pj.jabatan || '', '', '', '', pj.nama || ''].map(t => [...Array(12).fill(''), t])] : [];
      const judul = ['No', 'Unit', istilah('lantai'), 'Lokasi', 'Barang', 'Pemilik', 'Kelas', 'Masalah', 'Jumlah rusak', 'Terpasang', 'Dilaporkan', 'Umur (hari)', 'Penyebab', 'Catatan', 'Pelapor'];
      const isi = h.buka.map((m, i) => { const l = lok(m.lokasi_id), b = m.butir_id ? butir(m.butir_id) : null;
        return [i + 1, unit(l?.unit_id)?.nama || '', lantaiDari(l || {}) || '', jalur(l || {}), namaBarang(m), m.pemilik_nama || '', m.pemilik_kelas || '', m.masalah, m.jumlah, b && l ? jumlahStandar(l, b) ?? '' : '',
          tglJkt(m.dilaporkan_pada), h.umur(m), namaPenyebab(m.penyebab), m.catatan || '', m.pelapor_nama || '']; });
      const ws = XLSX.utils.aoa_to_sheet([...kepala, judul, ...isi, ...kakiTtd]);
      ws['!cols'] = [5, 16, 8, 26, 18, 24, 8, 30, 8, 9, 12, 9, 18, 30, 22].map(w => ({ wch: w }));
      ws['!merges'] = kepala.map((r, i) => r.length ? i : -1).filter(i => i >= 0).map(r => ({ s: { r, c: 0 }, e: { r, c: judul.length - 1 } }));
      ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: kepala.length, c: 0 }, e: { r: kepala.length + isi.length, c: judul.length - 1 } }) };
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Masalah');
      const ws2 = XLSX.utils.aoa_to_sheet([['Barang', 'Masalah', 'Unit rusak', 'Lokasi'], ...h.rekap.map(r => [r.barang, r.kasus, r.unit, r.lokasi.size])]);
      ws2['!cols'] = [24, 10, 10, 10].map(w => ({ wch: w }));
      XLSX.utils.book_append_sheet(wb, ws2, 'Rekap barang');
      if (h.baik.length) {
        const ws3 = XLSX.utils.aoa_to_sheet([['Lokasi', 'Barang', 'Pemilik', 'Masalah', 'Jumlah', 'Dilaporkan', 'Sudah baik', 'Pelapor'],
          ...h.baik.map(m => [jalur(lok(m.lokasi_id) || {}), namaBarang(m), pemilikTeks(m), m.masalah, m.jumlah, tglJkt(m.dilaporkan_pada), tglJkt(m.selesai_pada), m.pelapor_nama || ''])]);
        ws3['!cols'] = [26, 18, 24, 30, 8, 12, 12, 22].map(w => ({ wch: w }));
        XLSX.utils.book_append_sheet(wb, ws3, 'Sudah baik');
      }
      XLSX.writeFile(wb, namaBerkas(`Laporan Sarpras ${judulCakupan()} ${S.per}`).slice(0, 120) + '.xlsx');
      toast('success', 'Laporan Excel diunduh', { nada: 'akui', sub: `${angka(h.buka.length)} masalah` });
    } catch (e) { fireError(e); }
    finally { btn.disabled = false; }
  }
  async function klikLaporan(e) {
    const b = e.target.closest('[data-sp]'); if (!b || b.disabled) return;
    const d = b.dataset, S = UI.lap, akar = $('viewRoot');
    try {
      switch (d.sp) {
        case 'l-unit': S.unit = d.id; S.zona.clear(); S.lokasi.clear(); S.lantai = ''; return gambarLaporan(akar);
        case 'l-zona': if (!d.v) S.zona.clear(); else S.zona.has(d.v) ? S.zona.delete(d.v) : S.zona.add(d.v); S.lokasi.clear(); return gambarLaporan(akar);
        case 'l-lok': if (!d.id) S.lokasi.clear(); else S.lokasi.has(d.id) ? S.lokasi.delete(d.id) : S.lokasi.add(d.id); return gambarLaporan(akar);
        case 'l-barang-semua': S.butir = null; S.lain = true; return gambarLaporan(akar);
        case 'l-barang-kosong': S.butir = new Set(); S.lain = false; return gambarLaporan(akar);
        case 'l-pdf': return unduhPdfLaporan(b);
        case 'l-xlsx': return unduhXlsx(b);
        case 'kop': return formKop();
      }
    } catch (err) { fireError(err); }
  }

  /* =====================================================================
   * 4 · PETA KAMAR
   * ===================================================================== */
  async function peta(akar) {
    await bukaHalaman(akar, 'petakamar', 'Peta Kamar', async () => {
      await muat();
      if (!UI.peta) UI.peta = { unit: [...SP.data.unit].filter(u => u.kunci_siswa).sort(urutkan)[0]?.id || null, periode: 'bulan', dari: awalBulan(hariIni()), sampai: hariIni(), sorot: '', hasil: null };
      await muatPeta();
      if (APP.view !== 'petakamar') return;
      gambarPeta(akar);
      onKlik(klikPeta);
    });
  }
  function rentangPeta() {
    const P = UI.peta, t = hariIni();
    if (P.periode === 'bulan') return [awalBulan(t), t];
    if (P.periode === 'lalu') { const a = awalBulan(geser(awalBulan(t), -1)); return [a, akhirBulan(a)]; }
    if (P.periode === '30') return [geser(t, -29), t];
    if (P.periode === 'semester') {
      const th = t.slice(0, 4), md = t.slice(5);
      const s = (setelan('laporan', {})?.semester || []).find(x => x.mulai <= x.sampai ? (md >= x.mulai && md <= x.sampai) : (md >= x.mulai || md <= x.sampai));
      return s ? [`${s.mulai <= md ? th : String(Number(th) - 1)}-${s.mulai}`, t] : [geser(t, -180), t];
    }
    return [P.dari <= P.sampai ? P.dari : P.sampai, P.sampai > t ? t : P.sampai];
  }
  async function muatPeta() {
    const P = UI.peta;
    P.hasil = null;
    if (!P.unit) return;
    const [dari, sampai] = rentangPeta();
    const [h] = await Promise.all([rpc('sarpras_peta_kamar', { p_dari: dari, p_sampai: sampai, p_unit: P.unit }), muatMasalah(geser(dari, -1))]);
    P.hasil = h; P.dari0 = dari; P.sampai0 = sampai;
  }
  function hitungPeta() {
    const P = UI.peta, h = P.hasil; if (!h) return null;
    const kel = (h.kelompok || []).filter(k => k.kode);
    const atur = setelan('peta', {}) || {};
    const ambang = Number(atur.ambang_perusakan) || 2, kodeRusak = atur.kelompok_perusakan || 'perusakan', waspada = new Set(atur.penyebab_waspada || ['lalai', 'rusak']);
    const sumber = new Map((h.kamar || []).map(k => [k.lokasi_id, k.santri || []]));
    const kamar = SP.data.lokasi.filter(l => l.unit_id === P.unit && zona(l.zona)?.akses === 'binaan' && l.nomor != null && (l.aktif || sumber.has(l.id)))
      .sort((a, b) => a.nomor - b.nomor);
    const baris = kamar.map(l => {
      const santri = sumber.get(l.id) || [];
      const inti = santri.filter(s => !s.keluar), luar = santri.filter(s => s.keluar);
      const jum = (arr) => { const o = {}; kel.forEach(k => { o[k.kode] = arr.reduce((a, s) => a + (Number(s.kel?.[k.kode]) || 0), 0); }); return o; };
      const n = jum(inti), nLuar = jum(luar);
      const msl = SP.masalah.filter(m => m.lokasi_id === l.id && !m.batal && (terbukaPada(m, P.sampai0) || (tglJkt(m.dilaporkan_pada) >= P.dari0 && tglJkt(m.dilaporkan_pada) <= P.sampai0)));
      const buka = msl.filter(m => terbukaPada(m, P.sampai0));
      const sebabWaspada = msl.filter(m => waspada.has(m.penyebab));
      const total = Object.values(n).reduce((a, v) => a + v, 0);
      return { l, santri, inti, luar, n, nLuar, total, buka, sebabWaspada, dibahas: (n[kodeRusak] || 0) >= ambang && sebabWaspada.length > 0 };
    });
    const nilai = (r) => P.sorot ? (r.n[P.sorot] || 0) : r.total;
    const maks = Math.max(1, ...baris.map(nilai));
    const totalKel = {}, luarKel = {};
    kel.forEach(k => { totalKel[k.kode] = baris.reduce((a, r) => a + r.n[k.kode], 0); luarKel[k.kode] = baris.reduce((a, r) => a + r.nLuar[k.kode], 0); });
    return { kel, baris, nilai, maks, totalKel, luarKel, ambang, kodeRusak, waspada, belum: h.belum || {} };
  }
  function gambarPeta(akar) {
    const P = UI.peta;
    const units = [...SP.data.unit].filter(u => u.kunci_siswa).sort(urutkan);
    if (!units.length) { akar.innerHTML = kartu('Peta Kamar', `<div class="card-body">${kosong('Belum ada unit yang terpetakan ke data santri', 'Atur di Pengaturan Sarpras.', 'fa-sitemap')}</div>`); return; }
    const H = hitungPeta();
    const PER = [['bulan', 'Bulan ini'], ['lalu', 'Bulan lalu'], ['30', '30 hari'], ['semester', 'Semester ini'], ['bebas', 'Rentang…']];
    const grup = new Map(); (H?.baris || []).forEach(r => { const k = r.l.lantai || null; if (!grup.has(k)) grup.set(k, []); grup.get(k).push(r); });
    const nBerkamar = (H?.baris || []).reduce((a, r) => a + r.santri.length, 0);
    const nDibahas = (H?.baris || []).filter(r => r.dibahas).length;
    akar.innerHTML = `<div class="sp-peta">
      <section class="sp-peta-saring card">
        ${units.length > 1 ? `<div class="sp-pil">${units.map(u => `<button type="button" class="sp-pil-b${u.id === P.unit ? ' on' : ''}" data-sp="p-unit" data-id="${esc(u.id)}">${esc(u.nama)}</button>`).join('')}</div>` : ''}
        <div class="sp-pil">${PER.map(([k, l]) => `<button type="button" class="sp-pil-b${P.periode === k ? ' on' : ''}" data-sp="p-periode" data-v="${k}">${esc(l)}</button>`).join('')}</div>
        ${P.periode === 'bebas' ? `<div class="sp-lap-dua"><input id="spPetaDari" class="input" type="date" value="${esc(P.dari)}" max="${esc(hariIni())}" aria-label="Dari">
          <input id="spPetaSampai" class="input" type="date" value="${esc(P.sampai)}" max="${esc(hariIni())}" aria-label="Sampai">${tombol('p-terap', 'Terapkan', 'fa-check', {}, 'btn-primary')}</div>` : ''}
        <div class="sp-pil sp-sorot"><span class="label">Sorot</span>
          <button type="button" class="sp-pil-b kecil${P.sorot ? '' : ' on'}" data-sp="p-sorot" data-v="">Semua kelompok</button>
          ${(H?.kel || []).map(k => `<button type="button" class="sp-pil-b kecil${P.sorot === k.kode ? ' on' : ''}" data-sp="p-sorot" data-v="${esc(k.kode)}"><i class="fa-solid ${esc(k.ikon || 'fa-circle')}"></i>${esc(k.nama)}</button>`).join('')}</div>
      </section>
      ${H ? `<div class="sp-lap-ringkas">
          <div class="sp-stat teks"><b>${esc(tglPendek(P.dari0))} – ${esc(tglPendek(P.sampai0))}</b><span>periode</span></div>
          ${H.kel.map(k => `<div class="sp-stat${P.sorot === k.kode ? ' sorot' : ''}"><b>${angka(H.totalKel[k.kode])}</b><span>${esc(k.nama)}</span></div>`).join('')}
          <div class="sp-stat${nDibahas ? ' merah' : ''}"><b>${angka(nDibahas)}</b><span>perlu dibahas</span></div>
        </div>
        <div class="sp-lap-aksi card"><div><b>${angka(H.baris.length)} ${esc(istilah('kamar').toLowerCase())} · ${angka(nBerkamar)} santri berkamar</b>
            <small>Berdasarkan ${esc(istilah('kamar').toLowerCase())} santri saat ini. "Perlu dibahas": ${esc(H.kel.find(k => k.kode === H.kodeRusak)?.nama || H.kodeRusak)} ≥ ${angka(H.ambang)} dan ada kerusakan karena kelalaian/perusakan.</small></div>
          <span class="sp-lap-tombol">${pengelola() ? tombol('p-ambang', `Ambang ${H.ambang}`, 'fa-sliders') : ''}
            <select id="spLapKertas" class="input" aria-label="Ukuran kertas">${(window.RQ_SIDANG?.kertasDaftar?.() || [{ kode: 'A4', nama: 'A4' }]).map(k => `<option value="${esc(k.kode)}" ${k.kode === (window.RQ_SIDANG?.kertasTersimpan?.() || 'A4') ? 'selected' : ''}>${esc(k.nama)}</option>`).join('')}</select>
            ${tombol('p-pdf', 'Bahan Rapat', 'fa-file-pdf', {}, 'btn-primary')}</span></div>
        <p class="sp-legenda"><span><i class="sw panas"></i>warna = banyaknya catatan${P.sorot ? ` ${esc(H.kel.find(k => k.kode === P.sorot)?.nama || '')}` : ''}</span>
          <span><i class="sw garis"></i>kurang dari 3 santri, tidak diwarnai</span><span><i class="sw bahas"></i>perlu dibahas</span></p>
        ${H.baris.length ? [...grup.entries()].sort((a, b) => urutLantai(a[0], b[0])).map(([k, isi]) => `<section class="sp-peta-lantai">
            <h4 class="sp-lantai-j">${esc(labelLantai(k))}</h4>
            <div class="sp-peta-kisi">${isi.map((r, i) => {
              const v = H.nilai(r), warna = r.inti.length >= 3 && v ? Math.round(8 + 42 * v / H.maks) : 0;
              return `<button type="button" class="sp-pk${r.dibahas ? ' dibahas' : ''}${r.inti.length < 3 ? ' sedikit' : ''}" data-sp="p-kamar" data-id="${esc(r.l.id)}" style="--p:${warna}%;--i:${i}">
                <span class="sp-pk-kepala"><b>${esc(r.l.nomor)}</b><small>${angka(r.inti.length)}${r.l.kapasitas ? '/' + angka(r.l.kapasitas) : ''} santri${r.luar.length ? ` +${r.luar.length}` : ''}</small></span>
                <span class="sp-pk-angka">${H.kel.filter(kk => r.n[kk.kode]).map(kk => `<i class="${P.sorot === kk.kode ? 'sorot' : ''}" title="${esc(kk.nama)}"><i class="fa-solid ${esc(kk.ikon || 'fa-circle')}"></i>${r.n[kk.kode]}</i>`).join('') || '<em>tanpa catatan</em>'}</span>
                <span class="sp-pk-kaki">${r.buka.length ? `<span class="sp-pk-msl">${r.buka.slice(0, 3).map(m => pikto(ikonBarang(m))).join('')}${r.buka.length} rusak</span>` : '<span class="sp-pk-baik">sarana baik</span>'}
                  ${r.dibahas ? '<span class="sp-pk-tanda">Perlu dibahas</span>' : ''}</span>
              </button>`;
            }).join('')}</div></section>`).join('')
          : kosong(`Belum ada ${istilah('kamar').toLowerCase()} bernomor`, 'Buat kamar di Pengaturan Sarpras.', 'fa-bed')}
        <p class="sp-peta-kaki">${Object.values(H.luarKel).some(Boolean) ? `<span><b>Peran kamar (terpisah):</b> ${H.kel.filter(k => H.luarKel[k.kode]).map(k => `${esc(k.nama)} ${H.luarKel[k.kode]}`).join(' · ')}</span>` : ''}
          <span><b>Belum terpetakan:</b> ${angka(H.belum.santri || 0)} santri tanpa ${esc(istilah('kamar').toLowerCase())}${Object.keys(H.belum.kel || {}).length ? ` · ${H.kel.filter(k => H.belum.kel[k.kode]).map(k => `${esc(k.nama)} ${H.belum.kel[k.kode]}`).join(' · ')} catatan` : ''}</span></p>`
        : kosong('Peta belum bisa dihitung', 'Pilih unit yang terpetakan ke data santri.', 'fa-table-cells')}
    </div>`;
    $('spLapKertas')?.addEventListener('change', (e) => window.RQ_SIDANG?.simpanKertas?.(e.target.value));
  }
  async function detailKamar(id) {
    const H = hitungPeta(); const r = H?.baris.find(x => x.l.id === id); if (!r) return;
    const milikRusak = (nisn) => SP.masalah.filter(m => m.nisn === nisn && m.lokasi_id === r.l.id && !m.batal
      && (terbukaPada(m, UI.peta.sampai0) || (tglJkt(m.dilaporkan_pada) >= UI.peta.dari0 && tglJkt(m.dilaporkan_pada) <= UI.peta.sampai0)));
    const baris = (s) => { const mr = milikRusak(s.nisn);
      return `<tr${s.keluar ? ' class="sp-luar"' : ''}><td><b>${esc(s.nama)}</b><small>${esc(s.kelas || '')}${s.peran ? ' · ' + esc(s.peran) : ''}</small></td>
      ${H.kel.map(k => `<td class="${s.kel?.[k.kode] ? 'ada' : ''}">${s.kel?.[k.kode] || ''}</td>`).join('')}
      <td class="sp-peta-sarana">${mr.map(m => `<span title="${esc(`${namaBarang(m)}: ${m.masalah}`)}">${pikto(ikonBarang(m))}</span>`).join('')}</td></tr>`; };
    await Swal.fire({
      width: 760, showConfirmButton: false, showCloseButton: true, customClass: { popup: 'sp-swal' },
      title: `${esc(r.l.nama)}${r.dibahas ? ' <span class="sp-pk-tanda">Perlu dibahas</span>' : ''}`,
      html: `<p class="hint">${esc(labelLantai(r.l.lantai))} · ${angka(r.inti.length)} santri${r.l.kapasitas ? ` dari ${angka(r.l.kapasitas)}` : ''} · ${esc(tglPendek(UI.peta.dari0))} – ${esc(tglPendek(UI.peta.sampai0))}</p>
        ${r.santri.length ? `<div class="tbl"><table class="sp-tbl sp-peta-tbl"><thead><tr><th>Santri</th>${H.kel.map(k => `<th title="${esc(k.nama)}"><i class="fa-solid ${esc(k.ikon || 'fa-circle')}"></i> ${esc(k.nama)}</th>`).join('')}<th>Barang rusak</th></tr></thead>
          <tbody>${[...r.santri].sort((a, b) => (a.keluar - b.keluar) || Object.values(b.kel || {}).reduce((x, y) => x + y, 0) - Object.values(a.kel || {}).reduce((x, y) => x + y, 0)).map(baris).join('')}</tbody></table></div>`
          : '<p class="sp-kosong">Belum ada santri tercatat di kamar ini.</p>'}
        <h4 class="sp-h4">Sarana</h4>
        ${r.buka.length || r.sebabWaspada.length ? `<ul class="sp-msl-daftar">${[...new Map([...r.buka, ...r.sebabWaspada].map(m => [m.id, m])).values()].map(m => itemMasalah(m, r.l)).join('')}</ul>`
          : '<p class="sp-kosong">Tidak ada masalah sarana pada periode ini.</p>'}`
    });
  }
  async function pdfPeta(btn) {
    const P = UI.peta, H = hitungPeta(); if (!H) return;
    btn.disabled = true;
    try {
      const { pdf, kertas, logo } = await pdfBaru();
      const M = mesinPdf(pdf, kertas);
      const u = unit(P.unit);
      M.kop(logo, lembagaKop(), 'BAHAN RAPAT EVALUASI SANTRI');
      M.judul('PETA KAMAR: PELANGGARAN DAN SARANA', [`${tglId(P.dari0, 'long')} - ${tglId(P.sampai0, 'long')}`, u?.nama || '']);
      M.subjudul('A. Ringkasan per ' + istilah('kamar').toLowerCase());
      const kol = [{ judul: istilah('kamar'), lebar: 15, rata: 'center', tebal: true }, { judul: istilah('lantai'), lebar: 13, rata: 'center' }, { judul: 'Santri', lebar: 14, rata: 'center' },
        ...H.kel.map(k => ({ judul: k.nama, bobot: 1, rata: 'center' })), { judul: 'Sarana rusak', lebar: 20, rata: 'center' }, { judul: 'Tanda', lebar: 26, rata: 'center' }];
      M.tabel(kol, H.baris.map(r => ({ sel: [String(r.l.nomor), r.l.lantai || '-', `${r.inti.length}${r.luar.length ? '+' + r.luar.length : ''}`,
        ...H.kel.map(k => r.n[k.kode] ? String(r.n[k.kode]) : '-'), r.buka.length ? String(r.buka.length) : '-', r.dibahas ? 'Perlu dibahas' : ''],
        isi: r.dibahas ? [253, 236, 239] : null, warna: [null, null, null, ...H.kel.map(() => null), null, r.dibahas ? [150, 25, 50] : null] })), { fs: 7.4 });
      M.tabel([{ judul: 'Jumlah', bobot: 2.2, tebal: true }, ...H.kel.map(k => ({ judul: k.nama, bobot: 1, rata: 'center' }))],
        [{ sel: [`Seluruh ${istilah('kamar').toLowerCase()}`, ...H.kel.map(k => String(H.totalKel[k.kode]))], tebal: true },
         { sel: ['Peran kamar (terpisah)', ...H.kel.map(k => String(H.luarKel[k.kode] || 0))] },
         { sel: [`Belum terpetakan (${H.belum.santri || 0} santri)`, ...H.kel.map(k => String(H.belum.kel?.[k.kode] || 0))] }], { fs: 7.4 });
      const bahas = H.baris.filter(r => r.dibahas || r.total >= H.ambang * 2).sort((a, b) => b.dibahas - a.dibahas || b.total - a.total);
      if (bahas.length) {
        M.subjudul(`B. ${istilah('kamar')} yang perlu dibahas`);
        bahas.forEach(r => {
          const atas = r.inti.filter(s => Object.values(s.kel || {}).some(Boolean))
            .sort((a, b) => Object.values(b.kel).reduce((x, y) => x + y, 0) - Object.values(a.kel).reduce((x, y) => x + y, 0)).slice(0, 6);
          M.tabel([{ judul: `${r.l.nama}${r.dibahas ? '  (perlu dibahas)' : ''}`, bobot: 2.4, tebal: true }, ...H.kel.map(k => ({ judul: k.nama, bobot: 1, rata: 'center' }))],
            [...atas.map(s => ({ sel: [`${s.nama} (${s.kelas || '-'})`, ...H.kel.map(k => s.kel?.[k.kode] ? String(s.kel[k.kode]) : '')] })),
             ...(r.buka.length || r.sebabWaspada.length ? [{ sel: [`Sarana: ${[...new Map([...r.buka, ...r.sebabWaspada].map(m => [m.id, m])).values()].map(m => `${namaBarang(m)} ${m.masalah.toLowerCase()}${m.penyebab ? ' (' + namaPenyebab(m.penyebab).toLowerCase() + ')' : ''}`).join('; ')}`, ...H.kel.map(() => '')], isi: [248, 244, 230] }] : [])], { fs: 7.3 });
        });
      }
      M.subjudul(`${bahas.length ? 'C' : 'B'}. Rumusan tindak lanjut rapat`);
      M.perlu(48);
      pdf.setDrawColor(203, 213, 225); pdf.setLineWidth(0.2);
      for (let i = 0; i < 7; i++) { M.y += 6.5; pdf.line(M.mL, M.y, M.W - M.mR, M.y); }
      M.y += 6;
      M.ttd(tglId(hariIni(), 'long'), (setelan('lembaga', {}) || {}).kota, (setelan('penandatangan', []) || []).slice(0, 1), { dok: 'Bahan Rapat Evaluasi - Peta Kamar' });
      M.kaki(`Bahan Rapat Evaluasi - Peta Kamar - chemint ${jamCetak()} WIB`);
      try { pdf.setProperties({ title: 'Bahan Rapat Evaluasi - Peta Kamar', creator: 'chemint' }); } catch (e) {}
      pdf.save(namaBerkas(`Bahan Rapat Peta Kamar ${u?.nama || ''} ${P.dari0} sd ${P.sampai0}`).slice(0, 120) + '.pdf');
      toast('success', 'Bahan rapat diunduh', { nada: 'akui', sub: `${kertas.nama} · ${angka(H.baris.length)} ${istilah('kamar').toLowerCase()}` });
    } catch (e) { fireError(e); }
    finally { btn.disabled = false; }
  }
  async function klikPeta(e) {
    const b = e.target.closest('[data-sp]'); if (!b || b.disabled) return;
    const d = b.dataset, P = UI.peta, akar = $('viewRoot');
    const ulang = async () => { b.disabled = true; try { await muatPeta(); } finally { b.disabled = false; } if (APP.view === 'petakamar') gambarPeta(akar); };
    try {
      switch (d.sp) {
        case 'p-unit': P.unit = d.id; return ulang();
        case 'p-periode': P.periode = d.v; if (d.v === 'bebas') return gambarPeta(akar); return ulang();
        case 'p-terap': P.dari = $('spPetaDari').value || P.dari; P.sampai = $('spPetaSampai').value || P.sampai; return ulang();
        case 'p-sorot': P.sorot = d.v; return gambarPeta(akar);
        case 'p-kamar': return detailKamar(d.id);
        case 'p-pdf': return pdfPeta(b);
        case 'p-ambang': {
          const lama = setelan('peta', {}) || {};
          const r = await Swal.fire({ ...swalDasar, title: 'Ambang "Perlu dibahas"', input: 'number', inputValue: lama.ambang_perusakan || 2, inputAttributes: { min: 1, max: 99 },
            html: '<p class="hint">Jumlah catatan perusakan dalam periode, ditambah ada kerusakan sarana karena kelalaian atau perusakan.</p>', confirmButtonText: 'Simpan',
            inputValidator: (x) => (!/^\d{1,2}$/.test(String(x)) || Number(x) < 1) ? 'Isi angka 1–99.' : null });
          if (!r.isConfirmed) return;
          await rpc('sarpras_setelan_simpan', { p_kunci: 'peta', p_nilai: { ...lama, ambang_perusakan: Number(r.value) } });
          await muat(); gambarPeta(akar); return toast('success', 'Ambang tersimpan.');
        }
      }
    } catch (err) { fireError(err); }
  }

  /* v2.76 · pembantu untuk penempatan.js (modul terpisah; tidak mengubah perilaku halaman lain). */
  function sesudahPenempatan(nBelum) {
    PENGHUNI.clear();
    const n = document.querySelector('[data-sp-tab="penempatan"] .sp-tab-n');
    if (n) { if (nBelum > 0) n.textContent = String(nBelum); else n.remove(); }
    SP.penem = null;
    db.rpc('sarpras_lokasi_saya').then(({ data, error }) => { if (!error) SP.milik = new Set(data || []); }).catch(() => {});
  }
  window.RQSarpras = { lapor, atur, laporan, peta, pikto, istilah, galatTeks, rpc, sesudahPenempatan, _uji: { teksPdf, terbukaPada, jumlahStandar, tglJkt, selisih, isiLaporan: () => isiLaporan(), SP, UI } };
})();
