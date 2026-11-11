/* =====================================================================
 * sarpras.js — v2.73 · SARPRAS ASRAMA: PENGATURAN
 * ---------------------------------------------------------------------
 *  Dimuat lambat oleh app.js (muatSarprasJs) saat menu "Pengaturan
 *  Sarpras" dibuka. Rancangan: claude/rancangan-v2.73-sarpras-asrama.md.
 *
 *  Tujuh tab: Lokasi · Butir · Standar isi · Penugasan · Kelompok
 *  pelanggaran · Setelan · Impor. Semua tulis lewat RPC sarpras_*;
 *  basis data yang memutuskan boleh/tidak (pengelola), hapus/nonaktif,
 *  dan versi standar. Admin yang bukan pengelola melihat halaman ini
 *  hanya-baca — tombol tulis tidak digambar sama sekali.
 *
 *  Tidak ada nama lembaga, unit, kamar, atau sayap yang ditanam di sini:
 *  label diambil dari setelan "istilah", struktur dari tabel.
 *  Bergantung pada utilitas app.js: db, $, esc, kartu, kosong, toast,
 *  fireError, onKlik, angka, hariIni, prMuatXlsx, APP, SEMUA_ROLE.
 * ===================================================================== */
(function () {
  'use strict';

  const SP = {
    data: null, peta: null, pengelola: false, tab: 'lokasi',
    cariButir: '', pilih: new Set(), saring: { unit: '', zona: '', lantai: '' }, mulai: null,
    impor: null, profil: null, master: null, unitSiswa: null, kel: null
  };

  const ISTILAH_BAWAAN = { lembaga: 'Lembaga', unit: 'Unit', asrama: 'Asrama', kamar: 'Kamar', musyrif: 'Musyrif', sayap: 'Sayap',
    bilik: 'Bilik', titik: 'Titik', butir: 'Butir', ditanggung: 'Ditanggung lembaga', penghuni: 'Penghuni', gedung: 'Gedung', lantai: 'Lantai' };
  const IKON_ZONA = ['fa-bed', 'fa-stairs', 'fa-layer-group', 'fa-door-open', 'fa-mosque', 'fa-school', 'fa-house', 'fa-chalkboard', 'fa-kit-medical', 'fa-flask'];
  const IKON_KEL = ['fa-triangle-exclamation', 'fa-eye', 'fa-bed', 'fa-stairs', 'fa-leaf', 'fa-bolt', 'fa-door-open', 'fa-scale-balanced'];
  const HARI = [[1, 'Senin'], [2, 'Selasa'], [3, 'Rabu'], [4, 'Kamis'], [5, 'Jumat'], [6, 'Sabtu'], [7, 'Ahad']];
  const KOLOM_IMPOR = {
    butir: ['nama', 'kategori', 'satuan', 'zona', 'ditanggung', 'urutan'],
    lokasi: ['unit', 'zona', 'induk', 'nama', 'nomor', 'gedung', 'lantai', 'kapasitas', 'titik_periksa'],
    standar: ['unit', 'lokasi', 'butir', 'jumlah', 'spesifikasi', 'berlaku_mulai']
  };
  /* Kolom yang, bila tidak ada di berkas, mempertahankan nilai lama (sarpras_impor v2.73.1). */
  const KOLOM_TETAP = { butir: ['kategori', 'satuan', 'zona', 'ditanggung', 'urutan'], lokasi: ['nomor', 'gedung', 'lantai', 'kapasitas', 'titik_periksa'], standar: ['spesifikasi'] };
  const KUNCI_TERAKHIR = 'rq.sarpras.butirTerakhir';

  /* ---------- utilitas ---------------------------------------------- */
  const setelan = (k, bawaan) => { const v = SP.data?.setelan?.[k]; return v === undefined || v === null ? bawaan : v; };
  const istilah = (k) => (setelan('istilah', {}) || {})[k] || ISTILAH_BAWAAN[k] || k;
  const salin = (o) => JSON.parse(JSON.stringify(o ?? null));
  const zona = (kode) => (SP.data?.zona || []).find(z => z.kode === kode) || null;
  const unit = (id) => (SP.data?.unit || []).find(u => u.id === id) || null;
  const butir = (id) => (SP.data?.butir || []).find(b => b.id === id) || null;
  const galatTeks = (e) => {
    const m = e?.message || String(e || '');
    return /sarpras_|does not exist|Could not find|PGRST20/.test(m + (e?.code || '')) ? 'Modul sarpras belum terpasang di server. Terapkan migrasi v2.73.' : m;
  };
  const tulis = (s) => (SP.pengelola ? s : '');
  const btn = (aksi, label, ikon, data = {}, kelas = 'btn-ghost') => tulis(`<button type="button" class="btn ${kelas} btn-sm" data-sp="${aksi}" data-sp-tulis
      ${Object.entries(data).map(([k, v]) => `data-${k}="${esc(v ?? '')}"`).join(' ')}><i class="fa-solid ${ikon}"></i>${esc(label)}</button>`);
  const labelTingkat = (z, d) => { const t = z?.label_tingkat || []; return t[Math.min(d, Math.max(0, t.length - 1))] || istilah('titik'); };
  const urutkan = (a, b) => (a.urutan - b.urutan) || ((a.nomor ?? 1e9) - (b.nomor ?? 1e9)) || String(a.nama).localeCompare(String(b.nama), 'id', { numeric: true });

  async function rpc(nama, arg) {
    const { data, error } = await db.rpc(nama, arg);
    if (error) throw error;
    return data;
  }

  /* ---------- pohon lokasi ------------------------------------------ */
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
  function aktifEfektif(l, peta = SP.peta) {
    let x = l, langkah = 0;
    while (x && langkah++ < 64) { if (!x.aktif) return false; x = x.induk_id ? peta.byId.get(x.induk_id) : null; }
    return true;
  }
  const kedalaman = (l) => { let d = 0, x = l; while (x?.induk_id && d < 64) { x = SP.peta.byId.get(x.induk_id); d++; } return d; };
  const jalurNama = (l) => { const n = []; let x = l, d = 0; while (x && d++ < 64) { n.unshift(x.nama); x = x.induk_id ? SP.peta.byId.get(x.induk_id) : null; } return n.join(' › '); };
  const turunan = (id) => { const h = new Set(), st = [id]; while (st.length) { const k = st.pop(); (SP.peta.anak.get(k) || []).forEach(c => { if (!h.has(c.id)) { h.add(c.id); st.push(c.id); } }); } return h; };
  const standarDi = (lokId) => (SP.data.standar || []).filter(s => s.lokasi_id === lokId);

  /* ---------- CSV ---------------------------------------------------- */
  /** Baca CSV: pemisah dideteksi dari baris pertama (; , tab), BOM & CR dibuang, kutip ganda didukung. */
  function bacaCsv(teks) {
    const t = String(teks || '').replace(/^﻿/, '');
    const pertama = t.split(/\r?\n/, 1)[0] || '';
    const hitung = (c) => { let n = 0, q = false; for (const ch of pertama) { if (ch === '"') q = !q; else if (!q && ch === c) n++; } return n; };
    const calon = [';', ',', '\t'].map(c => [c, hitung(c)]).sort((a, b) => b[1] - a[1]);
    const pisah = calon[0][1] > 0 ? calon[0][0] : ',';
    const hasil = []; let baris = [], sel = '', q = false;
    for (let i = 0; i < t.length; i++) {
      const ch = t[i];
      if (q) { if (ch === '"') { if (t[i + 1] === '"') { sel += '"'; i++; } else q = false; } else sel += ch; continue; }
      if (ch === '"') { q = true; continue; }
      if (ch === pisah) { baris.push(sel); sel = ''; continue; }
      if (ch === '\r') continue;
      if (ch === '\n') { baris.push(sel); hasil.push(baris); baris = []; sel = ''; continue; }
      sel += ch;
    }
    if (sel !== '' || baris.length) { baris.push(sel); hasil.push(baris); }
    return hasil.filter(b => b.some(x => String(x).trim() !== ''));
  }
  function barisKeObjek(rows) {
    if (!rows.length) return [];
    const judul = rows[0].map(h => String(h).replace(/^﻿/, '').trim().toLowerCase().replace(/\s+/g, '_'));
    return rows.slice(1).map(r => Object.fromEntries(judul.map((h, i) => [h, String(r[i] ?? '').trim()]).filter(([h]) => h)));
  }

  /* ---------- muat ---------------------------------------------------- */
  async function muat() {
    const [st, un, zo, lo, bu, sd, tg, saya] = await Promise.all([
      db.from('sarpras_setelan').select('kunci,nilai'),
      db.from('sarpras_unit').select('*').order('urutan'),
      db.from('sarpras_zona').select('*').order('urutan'),
      db.from('sarpras_lokasi').select('*').order('urutan'),
      db.from('sarpras_butir').select('*').order('urutan'),
      db.from('sarpras_standar').select('*').is('berlaku_sampai', null),
      db.from('sarpras_tugas').select('*').is('selesai', null),
      db.rpc('sarpras_saya')
    ]);
    for (const r of [st, un, zo, lo, bu, sd, tg]) if (r.error) throw r.error;
    SP.pengelola = !saya.error && !!saya.data?.pengelola;
    SP.data = {
      setelan: Object.fromEntries((st.data || []).map(r => [r.kunci, r.nilai])),
      unit: un.data || [], zona: zo.data || [], lokasi: lo.data || [], butir: bu.data || [], standar: sd.data || [], tugas: tg.data || []
    };
    SP.peta = petaPohon(SP.data.lokasi);
    if (!SP.mulai) SP.mulai = hariIni();
  }
  async function muatProfil() {
    if (SP.profil) return SP.profil;
    const { data, error } = await db.from('profiles').select('id,nama,role,korps,kelas_binaan,aktif').eq('aktif', true).order('nama');
    if (error) throw error;
    SP.profil = data || [];
    return SP.profil;
  }
  async function muatMaster() {
    if (SP.master) return SP.master;
    const { data, error } = await db.from('master_pelanggaran').select('kode_pelanggaran,nama_pelanggaran,kategori,bidang,unit_gender').order('kode_pelanggaran');
    if (error) throw error;
    SP.master = data || [];
    return SP.master;
  }
  async function muatUnitSiswa() {
    if (SP.unitSiswa) return SP.unitSiswa;
    try {
      const rows = typeof muatSiswa === 'function' ? await muatSiswa() : [];
      SP.unitSiswa = [...new Set((rows || []).map(s => s.unit_gender).filter(Boolean))].sort();
    } catch (e) { SP.unitSiswa = []; }
    return SP.unitSiswa;
  }
  async function segarkan(pesan) {
    try { await muat(); } catch (e) { return fireError(e); }
    if (APP.view !== 'sarprasatur') return;
    gambarPanel();
    if (pesan) toast('success', pesan);
  }

  /* ---------- kerangka ------------------------------------------------ */
  const TAB = () => [
    ['lokasi', 'Lokasi', 'fa-sitemap'], ['butir', istilah('butir'), 'fa-list-ul'], ['standar', 'Standar isi', 'fa-table-list'],
    ['tugas', 'Penugasan', 'fa-users-gear'], ['kelompok', 'Kelompok pelanggaran', 'fa-scale-balanced'],
    ['setelan', 'Setelan', 'fa-sliders'], ['impor', 'Impor', 'fa-file-csv']
  ];

  async function atur(akar) {
    try { await muat(); }
    catch (e) {
      if (APP.view !== 'sarprasatur') return;
      akar.innerHTML = kartu('Pengaturan Sarpras', `<div class="card-body">${kosong('Pengaturan belum bisa dimuat', galatTeks(e), 'fa-triangle-exclamation')}</div>`);
      return;
    }
    if (APP.view !== 'sarprasatur') return;
    akar.innerHTML = `<div class="sp-atur">
      ${SP.pengelola ? '' : `<p class="sp-baca"><i class="fa-solid fa-lock"></i>Hanya-baca. Perubahan dilakukan pengelola sarpras.</p>`}
      <p class="sp-catatan" id="spCatatanAktif" hidden></p>
      <nav class="sp-tab" role="tablist" aria-label="Bagian pengaturan sarpras">
        ${TAB().map(([k, l, i]) => `<button type="button" role="tab" class="sp-tab-b" data-sp-tab="${k}" aria-selected="${k === SP.tab}"><i class="fa-solid ${i}"></i><span>${esc(l)}</span></button>`).join('')}
      </nav>
      <div id="spPanel" class="sp-panel" role="tabpanel"></div>
    </div>`;
    gambarPanel();
    onKlik(klik);
  }

  function gambarPanel() {
    const panel = $('spPanel'); if (!panel) return;
    document.querySelectorAll('[data-sp-tab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.spTab === SP.tab)));
    const cat = $('spCatatanAktif');
    if (cat) {
      const mati = SP.pengelola && setelan('aktif', false) !== true;
      cat.hidden = !mati;
      cat.innerHTML = mati ? '<i class="fa-solid fa-circle-info"></i>Modul belum diaktifkan. Lengkapi lokasi dan standar isi, lalu nyalakan di tab Setelan.' : '';
    }
    const p = { lokasi: panelLokasi, butir: panelButir, standar: panelStandar, tugas: panelTugas, kelompok: panelKelompok, setelan: panelSetelan, impor: panelImpor }[SP.tab];
    try { p(panel); } catch (e) { panel.innerHTML = kosong('Bagian ini gagal digambar', e?.message || String(e), 'fa-triangle-exclamation'); console.error(e); }
  }

  /* ---------- klik (satu pendengar untuk seluruh halaman) ------------- */
  async function klik(e) {
    const t = e.target.closest('[data-sp-tab]');
    if (t) { SP.tab = t.dataset.spTab; return gambarPanel(); }
    const b = e.target.closest('[data-sp]'); if (!b || b.disabled) return;
    const d = b.dataset, aksi = d.sp;
    try {
      if (aksi === 'unit-tambah' || aksi === 'unit-ubah') return formUnit(aksi === 'unit-ubah' ? unit(d.id) : null);
      if (aksi === 'zona-tambah' || aksi === 'zona-ubah') return formZona(aksi === 'zona-ubah' ? zona(d.kode) : null);
      if (aksi === 'zona-hapus') return hapusZona(d.kode);
      if (aksi === 'lok-tambah') return formLokasi({ unit_id: d.unit, zona: d.zona, induk_id: d.induk || null });
      if (aksi === 'lok-ubah') return formLokasi(SP.peta.byId.get(d.id));
      if (aksi === 'lok-hapus') return hapusLokasi(d.id);
      if (aksi === 'lok-aktif') { await rpc('sarpras_lokasi_aktif', { p_id: d.id, p_aktif: true }); return segarkan('Lokasi diaktifkan kembali.'); }
      if (aksi === 'kamar-data') return kamarDariData(d.unit);
      if (aksi === 'butir-tambah' || aksi === 'butir-ubah') return formButir(aksi === 'butir-ubah' ? butir(d.id) : null);
      if (aksi === 'butir-hapus') return hapusButir(d.id);
      if (aksi === 'butir-aktif') { await rpc('sarpras_butir_aktif', { p_id: d.id, p_aktif: true }); return segarkan('Butir diaktifkan kembali.'); }
      if (aksi === 'std-tambah') return pilihButirStandar([...SP.pilih]);
      if (aksi === 'std-ubah') return pilihButirStandar([...SP.pilih], d.butir);
      if (aksi === 'std-keluar') return keluarkanStandar([...SP.pilih], d.butir);
      if (aksi === 'std-salin') return salinStandar();
      if (aksi === 'tugas-atur') return aturTugas(d.id);
      if (aksi === 'kel-tambah') return kelTambahKode(+d.i, d.kode);
      if (aksi === 'kel-buang') return kelBuangKode(+d.i, d.kode);
      if (aksi === 'kel-baru') { SP.kel.push({ kode: '', nama: 'Kelompok baru', ikon: IKON_KEL[0], pelanggaran: [] }); return gambarPanel(); }
      if (aksi === 'kel-hapus') { SP.kel.splice(+d.i, 1); return gambarPanel(); }
      if (aksi === 'kel-simpan') return simpanKelompok(b);
      if (aksi === 'set-simpan') return simpanSetelan(d.kunci, b);
      if (aksi === 'set-baris') return tambahBaris(d.kunci);
      if (aksi === 'set-buang') { b.closest('[data-baris]')?.remove(); return; }
      if (aksi === 'impor-periksa') return jalankanImpor(true, b);
      if (aksi === 'impor-simpan') return jalankanImpor(false, b);
      if (aksi === 'impor-umum') return templatUmum();
    } catch (err) { fireError(err); }
  }

  /* =====================================================================
   * TAB LOKASI
   * ===================================================================== */
  function tandaLokasi(l, z) {
    const t = [];
    if (l.nomor !== null && l.nomor !== undefined) t.push(`No. ${l.nomor}`);
    if (l.gedung) t.push(esc(l.gedung));
    if (l.lantai) t.push(`${esc(istilah('lantai'))} ${esc(l.lantai)}`);
    if (z?.berpenghuni && l.kapasitas) t.push(`${l.kapasitas} ${esc(istilah('penghuni').toLowerCase())}`);
    const n = standarDi(l.id).length; if (n) t.push(`${n} butir`);
    if (l.titik_periksa) t.push('<span class="sp-titik"><i class="fa-solid fa-clipboard-check"></i>titik periksa</span>');
    if (!l.aktif) t.push('<span class="sp-off">nonaktif</span>');
    else if (!aktifEfektif(l)) t.push('<span class="sp-off">ikut nonaktif</span>');
    return t.map(x => `<span class="sp-tanda">${x}</span>`).join('');
  }
  function itemLokasi(l, z, d) {
    const anak = SP.peta.anak.get(l.id) || [];
    const ikut = l.aktif && !aktifEfektif(l);
    const bolehAnak = d + 1 < Math.max(1, (z?.label_tingkat || []).length);
    return `<li class="sp-lok${l.aktif ? '' : ' sp-nonaktif'}${ikut ? ' sp-ikut-nonaktif' : ''}" data-id="${esc(l.id)}">
      <div class="sp-lok-baris">
        <span class="sp-lok-nama">${esc(l.nama)}</span>
        <span class="sp-lok-tanda">${tandaLokasi(l, z)}</span>
        <span class="sp-lok-aksi">
          ${bolehAnak && l.aktif ? btn('lok-tambah', labelTingkat(z, d + 1), 'fa-plus', { unit: l.unit_id, zona: l.zona, induk: l.id }) : ''}
          ${btn('lok-ubah', 'Ubah', 'fa-pen-to-square', { id: l.id })}
          ${l.aktif ? btn('lok-hapus', 'Hapus', 'fa-trash-can', { id: l.id }) : btn('lok-aktif', 'Aktifkan', 'fa-rotate', { id: l.id })}
        </span>
      </div>
      ${anak.length ? `<ul class="sp-pohon">${anak.map(c => itemLokasi(c, z, d + 1)).join('')}</ul>` : ''}
    </li>`;
  }
  function panelLokasi(panel) {
    const units = [...SP.data.unit].sort(urutkan);
    const zonas = [...SP.data.zona].sort(urutkan);
    const kepala = `<div class="sp-kepala">
        <p class="sp-pengantar">Susun lokasi per unit: ${esc(istilah('kamar').toLowerCase())}, titik ${esc(istilah('asrama').toLowerCase())} umum, dan ${esc(labelTingkat(zona('kamar_mandi'), 0).toLowerCase())} kamar mandi beserta isinya.</p>
        <span class="sp-kepala-aksi">${btn('unit-tambah', 'Tambah ' + istilah('unit').toLowerCase(), 'fa-plus', {}, 'btn-primary')}${btn('zona-tambah', 'Tambah zona', 'fa-layer-group')}</span>
      </div>`;
    if (!units.length) {
      panel.innerHTML = kepala + kosong(`Belum ada ${istilah('unit').toLowerCase()}`, SP.pengelola ? `Mulai dengan menambah ${istilah('unit').toLowerCase()} asrama.` : 'Pengelola belum menyusun lokasi.', 'fa-sitemap');
      return;
    }
    panel.innerHTML = kepala + units.map(u => {
      const milik = SP.peta.akar.filter(l => l.unit_id === u.id);
      const nLok = SP.data.lokasi.filter(l => l.unit_id === u.id).length;
      const zTampil = zonas.filter(z => z.aktif || milik.some(l => l.zona === z.kode));
      return `<section class="sp-unit card${u.aktif ? '' : ' sp-nonaktif'}" data-unit="${esc(u.id)}">
        <header class="sp-unit-kepala">
          <div><h3>${esc(u.nama)}</h3><small>${nLok} lokasi${u.kunci_siswa ? ` · data santri: ${esc(u.kunci_siswa)}` : ' · belum dipetakan ke data santri'}</small></div>
          <span class="sp-unit-aksi">${btn('unit-ubah', 'Ubah', 'fa-pen-to-square', { id: u.id })}
            ${u.kunci_siswa ? btn('kamar-data', istilah('kamar') + ' dari data santri', 'fa-bed', { unit: u.id }) : ''}</span>
        </header>
        ${zTampil.map(z => {
          const akar = milik.filter(l => l.zona === z.kode);
          return `<div class="sp-zona" data-zona="${esc(z.kode)}">
            <div class="sp-zona-kepala">
              <h4><i class="fa-solid ${esc(z.ikon || 'fa-layer-group')}"></i>${esc(z.nama)}${z.aktif ? '' : ' <span class="sp-off">nonaktif</span>'}</h4>
              <small>diperiksa tiap ${angka(z.frekuensi_hari)} hari${z.berpenghuni ? ' · berpenghuni' : ''}</small>
              <span class="sp-zona-aksi">${z.aktif ? btn('lok-tambah', labelTingkat(z, 0), 'fa-plus', { unit: u.id, zona: z.kode }) : ''}
                ${btn('zona-ubah', 'Zona', 'fa-pen-to-square', { kode: z.kode })}${z.bawaan ? '' : btn('zona-hapus', 'Hapus zona', 'fa-trash-can', { kode: z.kode })}</span>
            </div>
            ${akar.length ? `<ul class="sp-pohon sp-akar">${akar.map(l => itemLokasi(l, z, 0)).join('')}</ul>` : `<p class="sp-kosong">Belum ada ${esc(labelTingkat(z, 0).toLowerCase())}.</p>`}
          </div>`;
        }).join('')}
      </section>`;
    }).join('');
  }

  async function formUnit(u) {
    const kunci = await muatUnitSiswa();
    const r = await Swal.fire({
      title: u ? `Ubah ${istilah('unit').toLowerCase()}` : `Tambah ${istilah('unit').toLowerCase()}`, width: 520, showCancelButton: true,
      confirmButtonText: 'Simpan', cancelButtonText: 'Batal', confirmButtonColor: '#14618B', showLoaderOnConfirm: true,
      allowOutsideClick: () => !Swal.isLoading(),
      html: `<div class="stack sp-form">
        <label class="label" for="spUnitNama">Nama</label><input id="spUnitNama" class="input" maxlength="80" value="${esc(u?.nama || '')}">
        <label class="label" for="spUnitKunci">Data santri yang dipetakan</label>
        <select id="spUnitKunci" class="input"><option value="">— tidak dipetakan —</option>
          ${[...new Set([...kunci, ...(u?.kunci_siswa ? [u.kunci_siswa] : [])])].map(k => `<option value="${esc(k)}" ${u?.kunci_siswa === k ? 'selected' : ''}>${esc(k)}</option>`).join('')}</select>
        <label class="label" for="spUnitUrut">Urutan</label><input id="spUnitUrut" class="input" inputmode="numeric" value="${esc(u?.urutan ?? 0)}">
      </div>`,
      preConfirm: async () => {
        const nama = $('spUnitNama').value.trim();
        if (!nama) { Swal.showValidationMessage('Nama wajib diisi.'); return false; }
        try { return await rpc('sarpras_unit_simpan', { p: { id: u?.id || null, nama, kunci_siswa: $('spUnitKunci').value || null, urutan: Number($('spUnitUrut').value) || 0 } }); }
        catch (e) { Swal.showValidationMessage(e.message); return false; }
      }
    });
    if (r.isConfirmed) segarkan('Tersimpan.');
  }

  async function formZona(z) {
    const r = await Swal.fire({
      title: z ? 'Ubah zona' : 'Tambah zona', width: 560, showCancelButton: true, confirmButtonText: 'Simpan', cancelButtonText: 'Batal',
      confirmButtonColor: '#14618B', showLoaderOnConfirm: true, allowOutsideClick: () => !Swal.isLoading(),
      html: `<div class="stack sp-form">
        <label class="label" for="spZonaKode">Kode</label>
        <input id="spZonaKode" class="input" maxlength="40" placeholder="huruf kecil, mis. dapur" value="${esc(z?.kode || '')}" ${z ? 'readonly' : ''}>
        <label class="label" for="spZonaNama">Nama</label><input id="spZonaNama" class="input" maxlength="60" value="${esc(z?.nama || '')}">
        <label class="label" for="spZonaFrek">Diperiksa tiap … hari</label><input id="spZonaFrek" class="input" inputmode="numeric" value="${esc(z?.frekuensi_hari ?? 30)}">
        <label class="label" for="spZonaTingkat">Sebutan tingkat (pisahkan koma)</label>
        <input id="spZonaTingkat" class="input" placeholder="mis. Ruang, Sudut" value="${esc((z?.label_tingkat || []).join(', '))}">
        <label class="label" for="spZonaIkon">Ikon</label>
        <select id="spZonaIkon" class="input">${IKON_ZONA.map(i => `<option value="${i}" ${z?.ikon === i ? 'selected' : ''}>${i.replace('fa-', '')}</option>`).join('')}</select>
        <label class="switch-row"><input type="checkbox" id="spZonaHuni" ${z?.berpenghuni ? 'checked' : ''}><span>Berpenghuni (terhubung ke santri)</span></label>
        ${z ? `<label class="switch-row"><input type="checkbox" id="spZonaAktif" ${z.aktif ? 'checked' : ''}><span>Aktif</span></label>` : ''}
      </div>`,
      preConfirm: async () => {
        const p = { kode: $('spZonaKode').value.trim().toLowerCase(), nama: $('spZonaNama').value.trim(), frekuensi_hari: Number($('spZonaFrek').value) || 30,
          label_tingkat: $('spZonaTingkat').value.split(',').map(s => s.trim()).filter(Boolean), ikon: $('spZonaIkon').value,
          berpenghuni: $('spZonaHuni').checked };
        if (z) p.aktif = $('spZonaAktif').checked;
        try { return await rpc('sarpras_zona_simpan', { p }); } catch (e) { Swal.showValidationMessage(e.message); return false; }
      }
    });
    if (r.isConfirmed) segarkan('Zona tersimpan.');
  }

  async function hapusZona(kode) {
    const z = zona(kode); if (!z) return;
    const ok = await Swal.fire({ title: `Hapus zona ${z.nama}?`, icon: 'warning', showCancelButton: true, confirmButtonText: 'Hapus', cancelButtonText: 'Batal',
      confirmButtonColor: '#8E1B32', html: '<p>Zona yang sudah berisi lokasi hanya dinonaktifkan.</p>' });
    if (!ok.isConfirmed) return;
    const h = await rpc('sarpras_zona_hapus', { p_kode: kode });
    segarkan(h.aksi === 'hapus' ? 'Zona dihapus.' : `Zona dinonaktifkan (${h.lokasi} lokasi).`);
  }

  async function formLokasi(l) {
    const baru = !l.id;
    const z = zona(l.zona), u = unit(l.unit_id);
    const d = l.induk_id ? kedalaman(SP.peta.byId.get(l.induk_id) || {}) + 1 : 0;
    const label = labelTingkat(z, baru ? d : kedalaman(l));
    const larang = baru ? new Set() : new Set([l.id, ...turunan(l.id)]);
    const calonInduk = SP.data.lokasi.filter(x => x.unit_id === l.unit_id && x.zona === l.zona && x.aktif && !larang.has(x.id)).sort(urutkan);
    const r = await Swal.fire({
      title: `${baru ? 'Tambah' : 'Ubah'} ${label.toLowerCase()}`, width: 560, showCancelButton: true, confirmButtonText: 'Simpan', cancelButtonText: 'Batal',
      confirmButtonColor: '#14618B', showLoaderOnConfirm: true, allowOutsideClick: () => !Swal.isLoading(),
      html: `<div class="stack sp-form">
        <p class="hint" style="margin:0 0 6px">${esc(u?.nama || '')} · ${esc(z?.nama || l.zona)}</p>
        <label class="label" for="spLokNama">Nama</label><input id="spLokNama" class="input" maxlength="80" value="${esc(l.nama || '')}">
        <div class="sp-dua">
          <div><label class="label" for="spLokNomor">Nomor (opsional)</label><input id="spLokNomor" class="input" inputmode="numeric" value="${esc(l.nomor ?? '')}"></div>
          <div><label class="label" for="spLokLantai">${esc(istilah('lantai'))}</label><input id="spLokLantai" class="input" maxlength="20" value="${esc(l.lantai || '')}"></div>
        </div>
        <div class="sp-dua">
          <div><label class="label" for="spLokGedung">${esc(istilah('gedung'))}</label><input id="spLokGedung" class="input" maxlength="40" value="${esc(l.gedung || '')}"></div>
          <div><label class="label" for="spLokKapasitas">Kapasitas</label><input id="spLokKapasitas" class="input" inputmode="numeric" value="${esc(l.kapasitas ?? '')}" ${z?.berpenghuni ? '' : 'disabled'}></div>
        </div>
        <label class="label" for="spLokInduk">Induk</label>
        <select id="spLokInduk" class="input"><option value="">— tingkat teratas —</option>
          ${calonInduk.map(x => `<option value="${esc(x.id)}" ${x.id === l.induk_id ? 'selected' : ''}>${esc(jalurNama(x))}</option>`).join('')}</select>
        <label class="switch-row"><input type="checkbox" id="spLokTitik" ${(baru ? !l.induk_id : l.titik_periksa) ? 'checked' : ''}>
          <span>Titik periksa: satu pemeriksaan mencakup lokasi ini dan seluruh isinya</span></label>
      </div>`,
      didOpen: () => setTimeout(() => $('spLokNama')?.focus(), 80),
      preConfirm: async () => {
        const nama = $('spLokNama').value.trim();
        const nomor = $('spLokNomor').value.trim(), kap = $('spLokKapasitas').value.trim();
        if (!nama) { Swal.showValidationMessage('Nama wajib diisi.'); return false; }
        if (nomor && !/^\d{1,4}$/.test(nomor)) { Swal.showValidationMessage('Nomor harus angka.'); return false; }
        if (kap && !/^\d{1,3}$/.test(kap)) { Swal.showValidationMessage('Kapasitas harus angka.'); return false; }
        const p = { id: l.id || null, unit_id: l.unit_id, zona: l.zona, induk_id: $('spLokInduk').value || null, nama,
          nomor: nomor ? Number(nomor) : null, gedung: $('spLokGedung').value.trim() || null, lantai: $('spLokLantai').value.trim() || null,
          kapasitas: kap ? Number(kap) : null, titik_periksa: $('spLokTitik').checked };
        try { return await rpc('sarpras_lokasi_simpan', { p }); } catch (e) { Swal.showValidationMessage(e.message); return false; }
      }
    });
    if (r.isConfirmed) segarkan('Lokasi tersimpan.');
  }

  async function hapusLokasi(id) {
    const l = SP.peta.byId.get(id); if (!l) return;
    const anak = (SP.peta.anak.get(id) || []).length, n = standarDi(id).length;
    const ok = await Swal.fire({ title: `Hapus ${l.nama}?`, icon: 'warning', showCancelButton: true, cancelButtonText: 'Batal',
      confirmButtonText: anak ? 'Nonaktifkan' : 'Hapus', confirmButtonColor: '#8E1B32',
      html: anak ? `<p>Lokasi ini punya <b>${anak}</b> turunan, jadi hanya dinonaktifkan. Turunannya ikut nonaktif.</p>`
        : `<p>${n ? `Standar isinya (${n} butir) ikut terhapus. ` : ''}Bila sudah punya riwayat, lokasi hanya dinonaktifkan dan riwayatnya tetap utuh.</p>` });
    if (!ok.isConfirmed) return;
    const h = await rpc('sarpras_lokasi_hapus', { p_id: id });
    segarkan(h.aksi === 'hapus' ? 'Lokasi dihapus.' : 'Lokasi dinonaktifkan.');
  }

  async function kamarDariData(unitId) {
    const u = unit(unitId); if (!u) return;
    const ok = await Swal.fire({ title: `${istilah('kamar')} dari data santri`, icon: 'question', showCancelButton: true, confirmButtonText: 'Buat', cancelButtonText: 'Batal',
      confirmButtonColor: '#14618B', html: `<p>Lokasi ${esc(istilah('kamar').toLowerCase())} dibuat untuk setiap nomor yang sudah tercatat pada santri aktif ${esc(u.nama)}. Yang sudah ada tidak digandakan.</p>` });
    if (!ok.isConfirmed) return;
    const h = await rpc('sarpras_kamar_dari_data', { p_unit: unitId });
    segarkan(`${h.dibuat} ${istilah('kamar').toLowerCase()} dibuat${h.ada ? `, ${h.ada} sudah ada` : ''}.`);
  }

  /* =====================================================================
   * TAB BUTIR
   * ===================================================================== */
  function panelButir(panel) {
    const q = SP.cariButir.trim().toLowerCase();
    const pakai = new Map();
    SP.data.standar.forEach(s => pakai.set(s.butir_id, (pakai.get(s.butir_id) || new Set()).add(s.lokasi_id)));
    const daftar = [...SP.data.butir].sort(urutkan).filter(b => !q || `${b.nama} ${b.kategori || ''}`.toLowerCase().includes(q));
    const namaZona = (zs) => (zs || []).length ? zs.map(k => esc(zona(k)?.nama || k)).join(', ') : 'semua';
    panel.innerHTML = `<div class="sp-kepala">
        <input id="spCariButir" class="input sp-cari" type="search" placeholder="Cari ${esc(istilah('butir').toLowerCase())} atau kategori…" value="${esc(SP.cariButir)}">
        <span class="sp-kepala-aksi">${btn('butir-tambah', 'Tambah ' + istilah('butir').toLowerCase(), 'fa-plus', {}, 'btn-primary')}</span>
      </div>
      ${daftar.length ? `<div class="tbl"><table class="sp-tbl"><thead><tr><th>Nama</th><th>Kategori</th><th>Satuan</th><th>Zona</th><th>${esc(istilah('ditanggung'))}</th><th>Dipakai</th><th></th></tr></thead>
        <tbody>${daftar.map(b => `<tr class="sp-butir${b.aktif ? '' : ' sp-nonaktif'}" data-id="${esc(b.id)}">
          <td><b>${esc(b.nama)}</b>${b.aktif ? '' : ' <span class="sp-off">nonaktif</span>'}</td><td>${esc(b.kategori || '-')}</td><td>${esc(b.satuan || '-')}</td>
          <td>${namaZona(b.zona)}</td><td>${b.ditanggung ? 'ya' : 'tidak'}</td><td>${angka((pakai.get(b.id) || new Set()).size)} lokasi</td>
          <td class="sp-aksi-sel">${btn('butir-ubah', 'Ubah', 'fa-pen-to-square', { id: b.id })}
            ${b.aktif ? btn('butir-hapus', 'Hapus', 'fa-trash-can', { id: b.id }) : btn('butir-aktif', 'Aktifkan', 'fa-rotate', { id: b.id })}</td></tr>`).join('')}</tbody></table></div>`
        : kosong(q ? 'Tidak ada yang cocok' : `Katalog ${istilah('butir').toLowerCase()} masih kosong`, q ? 'Coba kata lain.' : (SP.pengelola ? 'Tambah satu per satu atau pakai templat di tab Impor.' : ''), 'fa-list-ul')}`;
    $('spCariButir')?.addEventListener('input', (e) => {
      SP.cariButir = e.target.value;
      const pos = e.target.selectionStart;
      panelButir(panel);
      const i = $('spCariButir'); i.focus(); try { i.setSelectionRange(pos, pos); } catch (er) {}
    });
  }

  async function formButir(b, sesudah) {
    const kategori = [...new Set(SP.data.butir.map(x => x.kategori).filter(Boolean))].sort();
    const r = await Swal.fire({
      title: b ? `Ubah ${istilah('butir').toLowerCase()}` : `Tambah ${istilah('butir').toLowerCase()}`, width: 560, showCancelButton: true,
      confirmButtonText: 'Simpan', cancelButtonText: 'Batal', confirmButtonColor: '#14618B', showLoaderOnConfirm: true,
      allowOutsideClick: () => !Swal.isLoading(),
      html: `<div class="stack sp-form">
        <label class="label" for="spButNama">Nama</label><input id="spButNama" class="input" maxlength="80" value="${esc(b?.nama || '')}">
        <div class="sp-dua">
          <div><label class="label" for="spButKat">Kategori</label><input id="spButKat" class="input" list="spDaftarKat" maxlength="40" value="${esc(b?.kategori || '')}">
            <datalist id="spDaftarKat">${kategori.map(k => `<option value="${esc(k)}">`).join('')}</datalist></div>
          <div><label class="label" for="spButSatuan">Satuan</label><input id="spButSatuan" class="input" maxlength="20" value="${esc(b?.satuan || '')}"></div>
        </div>
        <span class="label">Berlaku di zona <small>(kosong = semua)</small></span>
        <div class="sp-centang">${SP.data.zona.map(z => `<label class="switch-row"><input type="checkbox" class="spButZona" value="${esc(z.kode)}" ${(b?.zona || []).includes(z.kode) ? 'checked' : ''}><span>${esc(z.nama)}</span></label>`).join('')}</div>
        <label class="switch-row"><input type="checkbox" id="spButTanggung" ${b ? (b.ditanggung ? 'checked' : '') : 'checked'}><span>${esc(istilah('ditanggung'))}</span></label>
      </div>`,
      didOpen: () => setTimeout(() => $('spButNama')?.focus(), 80),
      preConfirm: async () => {
        const nama = $('spButNama').value.trim();
        if (!nama) { Swal.showValidationMessage('Nama wajib diisi.'); return false; }
        const p = { id: b?.id || null, nama, kategori: $('spButKat').value.trim() || null, satuan: $('spButSatuan').value.trim() || null,
          zona: [...document.querySelectorAll('.spButZona:checked')].map(x => x.value), ditanggung: $('spButTanggung').checked };
        try { return await rpc('sarpras_butir_simpan', { p }); } catch (e) { Swal.showValidationMessage(e.message); return false; }
      }
    });
    if (!r.isConfirmed) return null;
    await segarkan(sesudah ? null : 'Tersimpan.');
    return r.value?.id || null;
  }

  async function hapusButir(id) {
    const b = butir(id); if (!b) return;
    const d = await rpc('sarpras_butir_dampak', { p_id: id });
    const riwayat = Number(d.kasus || 0) + Number(d.laporan || 0) > 0;
    const ok = await Swal.fire({
      title: `${riwayat ? 'Nonaktifkan' : 'Hapus'} ${b.nama}?`, icon: 'warning', showCancelButton: true, cancelButtonText: 'Batal',
      confirmButtonText: riwayat ? 'Nonaktifkan' : 'Hapus', confirmButtonColor: '#8E1B32',
      html: riwayat
        ? `<p>${esc(b.nama)} sudah punya <b>${angka(d.kasus)}</b> riwayat kerusakan${Number(d.laporan) ? ` dan termuat di <b>${angka(d.laporan)}</b> laporan` : ''}. Riwayat tetap utuh; butir ini hanya tidak muncul lagi di pemeriksaan berikutnya.</p>`
        : `<p>${Number(d.lokasi) ? `Dipakai di <b>${angka(d.lokasi)}</b> lokasi; standar isinya ikut terhapus.` : 'Belum dipakai di lokasi mana pun.'}</p>`
    });
    if (!ok.isConfirmed) return;
    const h = await rpc('sarpras_butir_hapus', { p_id: id });
    segarkan(h.aksi === 'hapus' ? 'Butir dihapus.' : 'Butir dinonaktifkan.');
  }

  /* =====================================================================
   * TAB STANDAR ISI
   * ===================================================================== */
  function lokasiTerpilihSah() {
    return [...SP.pilih].filter(id => { const l = SP.peta.byId.get(id); return l && aktifEfektif(l); });
  }
  function panelStandar(panel) {
    const s = SP.saring;
    const lok = SP.data.lokasi.filter(l => aktifEfektif(l)
      && (!s.unit || l.unit_id === s.unit) && (!s.zona || l.zona === s.zona) && (!s.lantai || (l.lantai || '') === s.lantai))
      .sort((a, b) => jalurNama(a).localeCompare(jalurNama(b), 'id', { numeric: true }));
    SP.pilih = new Set(lokasiTerpilihSah());
    const lantai = [...new Set(SP.data.lokasi.map(l => l.lantai).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), 'id', { numeric: true }));
    const terpilih = [...SP.pilih];
    const satu = terpilih.length === 1 ? SP.peta.byId.get(terpilih[0]) : null;

    let kanan;
    if (!terpilih.length) kanan = kosong('Pilih lokasi', 'Centang satu lokasi untuk melihat isinya, atau beberapa sekaligus untuk menerapkan butir yang sama.', 'fa-table-list');
    else if (satu) {
      const isi = standarDi(satu.id).map(x => ({ ...x, b: butir(x.butir_id) })).sort((a, b) => urutkan(a.b || {}, b.b || {}));
      kanan = `<h4 class="sp-sub">${esc(jalurNama(satu))}</h4>
        ${isi.length ? `<div class="tbl"><table class="sp-tbl"><thead><tr><th>${esc(istilah('butir'))}</th><th>Jumlah</th><th>Spesifikasi</th><th>Sejak</th><th></th></tr></thead>
          <tbody>${isi.map(x => `<tr data-butir="${esc(x.butir_id)}"><td>${esc(x.b?.nama || '?')}${x.b && !x.b.aktif ? ' <span class="sp-off">nonaktif</span>' : ''}${x.ditanggung_khusus === false ? ' <span class="sp-tanda">bukan tanggungan</span>' : ''}</td>
            <td>${angka(x.jumlah)} ${esc(x.b?.satuan || '')}</td><td>${esc(x.spesifikasi || '-')}</td><td>${esc(tgl(x.berlaku_mulai))}</td>
            <td class="sp-aksi-sel">${btn('std-ubah', 'Ubah', 'fa-pen-to-square', { butir: x.butir_id })}${btn('std-keluar', 'Keluarkan', 'fa-minus', { butir: x.butir_id })}</td></tr>`).join('')}</tbody></table></div>`
          : `<p class="sp-kosong">Belum ada isi standar.</p>`}
        <p class="sp-baris-aksi">${btn('std-tambah', 'Tambah ' + istilah('butir').toLowerCase(), 'fa-plus', {}, 'btn-primary')}${btn('std-salin', 'Samakan dari lokasi lain…', 'fa-copy')}</p>`;
    } else {
      kanan = `<h4 class="sp-sub">${angka(terpilih.length)} lokasi dipilih</h4>
        <p class="hint">Butir yang diterapkan berlaku untuk semua lokasi terpilih. Lokasi yang zonanya tidak cocok dengan butir dilewati.</p>
        <p class="sp-baris-aksi">${btn('std-tambah', 'Terapkan ' + istilah('butir').toLowerCase(), 'fa-plus', {}, 'btn-primary')}${btn('std-keluar', 'Keluarkan ' + istilah('butir').toLowerCase(), 'fa-minus')}${btn('std-salin', 'Samakan dari lokasi lain…', 'fa-copy')}</p>`;
    }

    panel.innerHTML = `<div class="sp-standar">
      <aside class="sp-std-kiri">
        <div class="sp-saring">
          <select id="spSarUnit" class="input"><option value="">Semua ${esc(istilah('unit').toLowerCase())}</option>${SP.data.unit.map(u => `<option value="${esc(u.id)}" ${s.unit === u.id ? 'selected' : ''}>${esc(u.nama)}</option>`).join('')}</select>
          <select id="spSarZona" class="input"><option value="">Semua zona</option>${SP.data.zona.map(z => `<option value="${esc(z.kode)}" ${s.zona === z.kode ? 'selected' : ''}>${esc(z.nama)}</option>`).join('')}</select>
          <select id="spSarLantai" class="input"><option value="">Semua ${esc(istilah('lantai').toLowerCase())}</option>${lantai.map(x => `<option value="${esc(x)}" ${s.lantai === x ? 'selected' : ''}>${esc(istilah('lantai'))} ${esc(x)}</option>`).join('')}</select>
        </div>
        <label class="switch-row sp-semua"><input type="checkbox" id="spPilihSemua" ${lok.length && lok.every(l => SP.pilih.has(l.id)) ? 'checked' : ''}><span>Pilih semua yang tampil (${angka(lok.length)})</span></label>
        <ul class="sp-pilih-lok">${lok.map(l => `<li><label class="switch-row"><input type="checkbox" value="${esc(l.id)}" ${SP.pilih.has(l.id) ? 'checked' : ''}>
          <span>${esc(jalurNama(l))} <small>${angka(standarDi(l.id).length)} butir</small></span></label></li>`).join('') || '<li class="sp-kosong">Tidak ada lokasi.</li>'}</ul>
      </aside>
      <section class="sp-std-kanan">
        <div class="sp-mulai"><label class="label" for="spMulai">Berlaku mulai</label><input id="spMulai" type="date" class="input" value="${esc(SP.mulai)}" ${SP.pengelola ? '' : 'disabled'}></div>
        ${kanan}
      </section></div>`;

    const saring = (k, el) => el?.addEventListener('change', () => { SP.saring[k] = el.value; panelStandar(panel); });
    saring('unit', $('spSarUnit')); saring('zona', $('spSarZona')); saring('lantai', $('spSarLantai'));
    $('spMulai')?.addEventListener('change', (e) => { SP.mulai = e.target.value || hariIni(); });
    panel.querySelectorAll('.sp-pilih-lok input[type=checkbox]').forEach(c => c.addEventListener('change', () => {
      if (c.checked) SP.pilih.add(c.value); else SP.pilih.delete(c.value);
      panelStandar(panel);
    }));
    $('spPilihSemua')?.addEventListener('change', (e) => { lok.forEach(l => e.target.checked ? SP.pilih.add(l.id) : SP.pilih.delete(l.id)); panelStandar(panel); });
  }

  function catatTerakhir(id) {
    try {
      const a = JSON.parse(localStorage.getItem(KUNCI_TERAKHIR) || '[]').filter(x => x !== id);
      a.unshift(id); localStorage.setItem(KUNCI_TERAKHIR, JSON.stringify(a.slice(0, 8)));
    } catch (e) {}
  }
  function butirTerakhir() { try { return JSON.parse(localStorage.getItem(KUNCI_TERAKHIR) || '[]'); } catch (e) { return []; } }
  function ringkasHasil(h) {
    const b = [];
    if (h.baru) b.push(`${h.baru} baru`); if (h.ubah) b.push(`${h.ubah} diubah`); if (h.tutup) b.push(`${h.tutup} dikeluarkan`); if (h.sama) b.push(`${h.sama} tetap`);
    if ((h.lewati || []).length) b.push(`${h.lewati.length} dilewati (${[...new Set(h.lewati.map(x => x.alasan))].join('; ')})`);
    return b.join(' · ') || 'Tidak ada perubahan';
  }

  /** Pemilih butir untuk standar: cari, terakhir dipakai, tambah butir baru di tempat. */
  async function pilihButirStandar(lokIds, butirId) {
    if (!lokIds.length) return;
    const zonaPilih = new Set(lokIds.map(id => SP.peta.byId.get(id)?.zona));
    const cocok = (b) => b.aktif && (!(b.zona || []).length || b.zona.some(z => zonaPilih.has(z)));
    const satu = lokIds.length === 1 ? standarDi(lokIds[0]).find(s => s.butir_id === butirId) : null;
    let pilih = butirId || null;
    const daftarHtml = (q) => {
      const t = butirTerakhir();
      const arr = SP.data.butir.filter(cocok).filter(b => !q || `${b.nama} ${b.kategori || ''}`.toLowerCase().includes(q))
        .sort((a, b) => ((t.indexOf(a.id) + 1 || 99) - (t.indexOf(b.id) + 1 || 99)) || urutkan(a, b)).slice(0, 40);
      return arr.map(b => `<label class="switch-row sp-pil-butir"><input type="radio" name="spPilButir" value="${esc(b.id)}" ${b.id === pilih ? 'checked' : ''}>
        <span>${esc(b.nama)} <small>${esc(b.kategori || '')}${t.includes(b.id) ? ' · baru dipakai' : ''}</small></span></label>`).join('') || '<p class="sp-kosong">Tidak ada yang cocok.</p>';
    };
    const r = await Swal.fire({
      title: butirId ? `Ubah ${istilah('butir').toLowerCase()}` : `Terapkan ${istilah('butir').toLowerCase()}`, width: 600, showCancelButton: true,
      confirmButtonText: 'Terapkan', cancelButtonText: 'Batal', confirmButtonColor: '#14618B', showLoaderOnConfirm: true,
      allowOutsideClick: () => !Swal.isLoading(),
      html: `<div class="stack sp-form">
        <p class="hint" style="margin:0">${lokIds.length === 1 ? esc(jalurNama(SP.peta.byId.get(lokIds[0]))) : `${angka(lokIds.length)} lokasi`} · berlaku mulai ${esc(tgl(SP.mulai))}</p>
        ${butirId ? `<p><b>${esc(butir(butirId)?.nama || '')}</b></p>` : `<input id="spPilCari" class="input" type="search" placeholder="Cari…">
          <div id="spPilDaftar" class="sp-pil-daftar">${daftarHtml('')}</div>
          <button type="button" class="btn btn-ghost btn-sm" id="spPilBaru"><i class="fa-solid fa-plus"></i>${esc(istilah('butir'))} baru</button>`}
        <div class="sp-dua">
          <div><label class="label" for="spStdJumlah">Jumlah</label><input id="spStdJumlah" class="input" inputmode="numeric" value="${esc(satu?.jumlah ?? 1)}"></div>
          <div><label class="label" for="spStdSpes">Spesifikasi (opsional)</label><input id="spStdSpes" class="input" maxlength="80" placeholder="mis. bahan, merek" value="${esc(satu?.spesifikasi || '')}"></div>
        </div>
        <label class="switch-row"><input type="checkbox" id="spStdBukan" ${satu?.ditanggung_khusus === false ? 'checked' : ''}><span>Di lokasi ini bukan ${esc(istilah('ditanggung').toLowerCase())}</span></label>
      </div>`,
      didOpen: () => {
        const c = $('spPilCari'), d = $('spPilDaftar');
        c?.addEventListener('input', () => { d.innerHTML = daftarHtml(c.value.trim().toLowerCase()); });
        d?.addEventListener('change', (e) => { if (e.target.name === 'spPilButir') pilih = e.target.value; });
        $('spPilBaru')?.addEventListener('click', async () => {
          Swal.close();
          const idBaru = await formButir(null, true);
          if (idBaru) { catatTerakhir(idBaru); pilihButirStandar(lokIds); }
        });
      },
      preConfirm: async () => {
        const id = butirId || pilih || document.querySelector('input[name=spPilButir]:checked')?.value;
        const j = $('spStdJumlah').value.trim();
        if (!id) { Swal.showValidationMessage(`Pilih ${istilah('butir').toLowerCase()} lebih dulu.`); return false; }
        if (!/^\d{1,4}$/.test(j) || Number(j) < 1) { Swal.showValidationMessage('Jumlah minimal 1.'); return false; }
        try {
          const h = await rpc('sarpras_standar_terapkan', { p_lokasi: lokIds, p_butir: id, p_jumlah: Number(j),
            p_spesifikasi: $('spStdSpes').value.trim() || null, p_mulai: SP.mulai, p_ditanggung_khusus: $('spStdBukan').checked ? false : null });
          catatTerakhir(id);
          return h;
        } catch (e) { Swal.showValidationMessage(e.message); return false; }
      }
    });
    if (r.isConfirmed && r.value) segarkan(ringkasHasil(r.value));
  }

  async function keluarkanStandar(lokIds, butirId) {
    if (!lokIds.length) return;
    let id = butirId;
    if (!id) {
      const ada = [...new Set(lokIds.flatMap(l => standarDi(l).map(s => s.butir_id)))].map(butir).filter(Boolean).sort(urutkan);
      if (!ada.length) return toast('info', 'Lokasi terpilih belum punya isi standar.');
      const r = await Swal.fire({ title: `Keluarkan ${istilah('butir').toLowerCase()}`, input: 'select', inputOptions: Object.fromEntries(ada.map(b => [b.id, b.nama])),
        showCancelButton: true, confirmButtonText: 'Lanjut', cancelButtonText: 'Batal', confirmButtonColor: '#14618B' });
      if (!r.isConfirmed) return; id = r.value;
    }
    const ok = await Swal.fire({ title: `Keluarkan ${butir(id)?.nama || ''}?`, icon: 'warning', showCancelButton: true, confirmButtonText: 'Keluarkan', cancelButtonText: 'Batal',
      confirmButtonColor: '#8E1B32', html: `<p>Berlaku mulai ${esc(tgl(SP.mulai))} untuk ${angka(lokIds.length)} lokasi. Standar lama tetap tercatat sebagai riwayat.</p>` });
    if (!ok.isConfirmed) return;
    const h = await rpc('sarpras_standar_terapkan', { p_lokasi: lokIds, p_butir: id, p_jumlah: 0, p_spesifikasi: null, p_mulai: SP.mulai, p_ditanggung_khusus: null });
    segarkan(ringkasHasil(h));
  }

  async function salinStandar() {
    const tujuan = [...SP.pilih]; if (!tujuan.length) return;
    const sumber = SP.data.lokasi.filter(l => aktifEfektif(l) && standarDi(l.id).length).sort((a, b) => jalurNama(a).localeCompare(jalurNama(b), 'id', { numeric: true }));
    if (!sumber.length) return toast('info', 'Belum ada lokasi yang punya isi standar.');
    const r = await Swal.fire({
      title: 'Samakan isi dari lokasi lain', width: 560, showCancelButton: true, confirmButtonText: 'Samakan', cancelButtonText: 'Batal',
      confirmButtonColor: '#14618B', showLoaderOnConfirm: true, allowOutsideClick: () => !Swal.isLoading(),
      html: `<div class="stack sp-form">
        <label class="label" for="spSalinDari">Contoh isi dari</label>
        <select id="spSalinDari" class="input">${sumber.map(l => `<option value="${esc(l.id)}">${esc(jalurNama(l))} (${standarDi(l.id).length} butir)</option>`).join('')}</select>
        <label class="switch-row"><input type="checkbox" id="spSalinSama"><span>Keluarkan butir yang tidak ada di contoh</span></label>
        <p class="hint">Diterapkan ke ${angka(tujuan.length)} lokasi terpilih, berlaku mulai ${esc(tgl(SP.mulai))}.</p></div>`,
      preConfirm: async () => {
        try { return await rpc('sarpras_standar_salin', { p_dari: $('spSalinDari').value, p_ke: tujuan, p_samakan: $('spSalinSama').checked, p_mulai: SP.mulai }); }
        catch (e) { Swal.showValidationMessage(e.message); return false; }
      }
    });
    if (r.isConfirmed && r.value) segarkan(ringkasHasil(r.value));
  }

  /* =====================================================================
   * TAB PENUGASAN
   * ===================================================================== */
  async function panelTugas(panel) {
    panel.innerHTML = `<p class="sp-kosong"><i class="fa-solid fa-circle-notch fa-spin"></i> Memuat akun…</p>`;
    let akun;
    try { akun = await muatProfil(); } catch (e) { panel.innerHTML = kosong('Daftar akun tidak dapat dimuat', e.message, 'fa-users-gear'); return; }
    if (SP.tab !== 'tugas' || APP.view !== 'sarprasatur') return;
    const tanpa = new Set(setelan('peran_tanpa_tugas', []));
    const daftar = akun.filter(a => !tanpa.has(a.role));
    const lokasiAkun = (id) => SP.data.tugas.filter(t => t.profil_id === id).map(t => SP.peta.byId.get(t.lokasi_id)).filter(Boolean);
    panel.innerHTML = `<p class="sp-pengantar">Lokasi yang menjadi amanah pemeriksaan tiap ${esc(istilah('musyrif').toLowerCase())}. Tugas di satu lokasi mencakup seluruh isinya.</p>
      <ul class="sp-tugas">${daftar.map(a => {
        const l = lokasiAkun(a.id);
        return `<li class="sp-tugas-baris" data-id="${esc(a.id)}"><div><b>${esc(a.nama)}</b><small>${esc(a.role)}${a.korps ? ' · ' + esc(a.korps) : ''}</small></div>
          <div class="sp-chip-daftar">${l.length ? l.map(x => `<span class="sp-chip">${esc(jalurNama(x))}</span>`).join('') : '<span class="sp-kosong">belum ditugaskan</span>'}</div>
          ${btn('tugas-atur', 'Atur', 'fa-pen-to-square', { id: a.id })}</li>`;
      }).join('') || `<li class="sp-kosong">Tidak ada akun yang dapat ditugaskan.</li>`}</ul>`;
  }

  async function aturTugas(profilId) {
    const a = (SP.profil || []).find(x => x.id === profilId); if (!a) return;
    const lama = new Set(SP.data.tugas.filter(t => t.profil_id === profilId).map(t => t.lokasi_id));
    const calon = SP.data.lokasi.filter(l => aktifEfektif(l) && (l.titik_periksa || lama.has(l.id)))
      .sort((x, y) => (unit(x.unit_id)?.urutan ?? 0) - (unit(y.unit_id)?.urutan ?? 0) || jalurNama(x).localeCompare(jalurNama(y), 'id', { numeric: true }));
    const r = await Swal.fire({
      title: `Tugas ${a.nama}`, width: 600, showCancelButton: true, confirmButtonText: 'Simpan', cancelButtonText: 'Batal', confirmButtonColor: '#14618B',
      showLoaderOnConfirm: true, allowOutsideClick: () => !Swal.isLoading(),
      html: `<div class="stack sp-form"><input id="spTgCari" class="input" type="search" placeholder="Saring lokasi…">
        <div class="sp-pil-daftar" id="spTgDaftar">${calon.map(l => `<label class="switch-row" data-cari="${esc((unit(l.unit_id)?.nama || '') + ' ' + jalurNama(l)).toLowerCase()}">
          <input type="checkbox" value="${esc(l.id)}" ${lama.has(l.id) ? 'checked' : ''}><span>${esc(jalurNama(l))} <small>${esc(unit(l.unit_id)?.nama || '')} · ${esc(zona(l.zona)?.nama || '')}</small></span></label>`).join('') || '<p class="sp-kosong">Belum ada titik periksa.</p>'}</div></div>`,
      didOpen: () => $('spTgCari')?.addEventListener('input', (e) => {
        const q = e.target.value.trim().toLowerCase();
        document.querySelectorAll('#spTgDaftar [data-cari]').forEach(el => { el.hidden = q && !el.dataset.cari.includes(q); });
      }),
      preConfirm: async () => {
        const baru = new Set([...document.querySelectorAll('#spTgDaftar input:checked')].map(x => x.value));
        const buka = [...baru].filter(x => !lama.has(x)), tutup = [...lama].filter(x => !baru.has(x));
        try {
          if (buka.length) await rpc('sarpras_tugas_simpan', { p_profil: profilId, p_lokasi: buka, p_aktif: true });
          if (tutup.length) await rpc('sarpras_tugas_simpan', { p_profil: profilId, p_lokasi: tutup, p_aktif: false });
          return { buka: buka.length, tutup: tutup.length };
        } catch (e) { Swal.showValidationMessage(e.message); return false; }
      }
    });
    if (r.isConfirmed && r.value) segarkan(`${r.value.buka} tugas ditambah, ${r.value.tutup} diakhiri.`);
  }

  /* =====================================================================
   * TAB KELOMPOK PELANGGARAN
   * ===================================================================== */
  async function panelKelompok(panel) {
    if (!SP.kel) SP.kel = salin(setelan('kelompok_pelanggaran', [])) || [];
    let master = [];
    try { master = await muatMaster(); } catch (e) { /* tanpa nama pelanggaran pun tetap jalan */ }
    if (SP.tab !== 'kelompok' || APP.view !== 'sarprasatur') return;
    const nama = new Map(master.map(m => [m.kode_pelanggaran, m.nama_pelanggaran]));
    panel.innerHTML = `<p class="sp-pengantar">Pelanggaran yang berkaitan dengan sarana asrama, dikelompokkan untuk Peta Kamar.</p>
      <div class="sp-kel-daftar">${SP.kel.map((k, i) => `<section class="sp-kel card" data-i="${i}">
        <header class="sp-kel-kepala"><i class="fa-solid ${esc(k.ikon || IKON_KEL[0])}"></i>
          ${SP.pengelola ? `<input class="input sp-kel-nama" data-kel-nama="${i}" maxlength="40" value="${esc(k.nama)}">
            <select class="input sp-kel-ikon" data-kel-ikon="${i}">${IKON_KEL.map(x => `<option value="${x}" ${x === k.ikon ? 'selected' : ''}>${x.replace('fa-', '')}</option>`).join('')}</select>
            ${btn('kel-hapus', 'Hapus', 'fa-trash-can', { i })}` : `<h4>${esc(k.nama)}</h4>`}
        </header>
        <div class="sp-chip-daftar">${(k.pelanggaran || []).map(c => `<span class="sp-chip"><b>${esc(c)}</b> ${esc(nama.get(c) || '')}
          ${SP.pengelola ? `<button type="button" class="sp-chip-x" data-sp="kel-buang" data-sp-tulis data-i="${i}" data-kode="${esc(c)}" aria-label="Keluarkan ${esc(c)}"><i class="fa-solid fa-xmark"></i></button>` : ''}</span>`).join('') || '<span class="sp-kosong">belum ada</span>'}</div>
        ${SP.pengelola ? `<div class="sp-kel-tambah"><input class="input" type="search" data-kel-cari="${i}" placeholder="Tambah: ketik kode atau nama pelanggaran…">
          <div class="sp-kel-hasil" data-kel-hasil="${i}"></div></div>` : ''}
      </section>`).join('') || kosong('Belum ada kelompok', '', 'fa-scale-balanced')}</div>
      <p class="sp-baris-aksi">${btn('kel-baru', 'Tambah kelompok', 'fa-plus')}${btn('kel-simpan', 'Simpan kelompok', 'fa-floppy-disk', {}, 'btn-primary')}</p>`;
    panel.querySelectorAll('[data-kel-nama]').forEach(el => el.addEventListener('input', () => { SP.kel[+el.dataset.kelNama].nama = el.value; }));
    panel.querySelectorAll('[data-kel-ikon]').forEach(el => el.addEventListener('change', () => { SP.kel[+el.dataset.kelIkon].ikon = el.value; gambarPanel(); }));
    panel.querySelectorAll('[data-kel-cari]').forEach(el => el.addEventListener('input', () => {
      const i = +el.dataset.kelCari, q = el.value.trim().toLowerCase();
      const ada = new Set(SP.kel[i].pelanggaran || []);
      const hasil = q.length < 2 ? [] : master.filter(m => !ada.has(m.kode_pelanggaran) && `${m.kode_pelanggaran} ${m.nama_pelanggaran}`.toLowerCase().includes(q)).slice(0, 8);
      panel.querySelector(`[data-kel-hasil="${i}"]`).innerHTML = hasil.map(m => `<button type="button" class="sp-kel-calon" data-sp="kel-tambah" data-sp-tulis data-i="${i}" data-kode="${esc(m.kode_pelanggaran)}">
        <b>${esc(m.kode_pelanggaran)}</b> ${esc(m.nama_pelanggaran)} <small>${esc(m.kategori || '')}</small></button>`).join('');
    }));
  }
  function kelTambahKode(i, kode) { const k = SP.kel[i]; if (!k) return; k.pelanggaran = [...new Set([...(k.pelanggaran || []), kode])]; gambarPanel(); }
  function kelBuangKode(i, kode) { const k = SP.kel[i]; if (!k) return; k.pelanggaran = (k.pelanggaran || []).filter(c => c !== kode); gambarPanel(); }
  const slug = (t) => String(t || '').toLowerCase().normalize('NFKD').replace(/[^\w\s]/g, '').trim().replace(/\s+/g, '_').replace(/[^a-z_]/g, '').slice(0, 40) || 'kelompok';
  async function simpanKelompok(b) {
    const pakai = new Set();
    const nilai = SP.kel.map(k => {
      let kode = k.kode || slug(k.nama), n = 2; const dasar = kode;
      while (pakai.has(kode)) kode = `${dasar}_${n++}`;
      pakai.add(kode);
      return { kode, nama: String(k.nama || '').trim() || kode, ikon: k.ikon || IKON_KEL[0], pelanggaran: [...new Set(k.pelanggaran || [])] };
    });
    if (nilai.some(k => !k.nama)) return toast('error', 'Setiap kelompok perlu nama.');
    b.disabled = true;
    try { await rpc('sarpras_setelan_simpan', { p_kunci: 'kelompok_pelanggaran', p_nilai: nilai }); SP.kel = null; await segarkan('Kelompok pelanggaran tersimpan.'); }
    finally { b.disabled = false; }
  }

  /* =====================================================================
   * TAB SETELAN — editor deklaratif
   * ===================================================================== */
  const BAGIAN = () => [
    { kunci: 'aktif', judul: 'Modul', akar: 'centang', label: 'Modul sarpras aktif (halaman pemeriksaan tampil bagi yang ditugaskan)' },
    { kunci: 'lembaga', judul: 'Identitas lembaga', bidang: [['nama', 'Nama lembaga', 'teks'], ['alamat', 'Alamat', 'teks']] },
    { kunci: 'penerima', judul: 'Penerima laporan', bidang: [['nama', 'Nama unit penerima', 'teks']] },
    { kunci: 'penandatangan', judul: 'Penandatangan laporan', daftar: [['jabatan', 'Jabatan', 'teks'], ['nama', 'Nama', 'teks']] },
    { kunci: 'pengelola', judul: 'Pengelola tambahan', akun: true },
    { kunci: 'istilah', judul: 'Istilah', bidang: Object.keys(ISTILAH_BAWAAN).map(k => [k, ISTILAH_BAWAAN[k], 'teks']) },
    { kunci: 'skala', judul: 'Skala kondisi', daftar: [['kode', 'Kode', 'kode'], ['label', 'Label', 'teks'], ['bobot', 'Bobot', 'angka']] },
    { kunci: 'penyebab', judul: 'Penyebab kerusakan', daftar: [['kode', 'Kode', 'kode'], ['label', 'Label', 'teks']] },
    { kunci: 'kode_pelanggaran_rusak', judul: 'Pelanggaran untuk kerusakan', ket: 'Kode yang terisi otomatis saat musyrif mencatat pelanggaran dari laporan kerusakan.',
      bidang: (setelan('penyebab', []) || []).map(p => [p.kode, p.label, 'teks']) },
    { kunci: 'laporan', judul: 'Kalender laporan', bidang: [['awal_pekan', 'Awal pekan', 'hari'], ['perbaikan_besar_hari', 'Perbaikan besar bila rusak lebih dari (hari)', 'angka']],
      daftarDi: ['semester', [['nama', 'Semester', 'teks'], ['mulai', 'Mulai (BB-HH)', 'teks'], ['sampai', 'Sampai (BB-HH)', 'teks']]] },
    { kunci: 'peran_kamar', judul: 'Peran khusus di kamar', daftar: [['kode', 'Kode', 'kode'], ['label', 'Label', 'teks'], ['keluar_statistik', 'Keluar dari angka kamar', 'centang']] },
    { kunci: 'aturan_penempatan', judul: 'Aturan penempatan (opsional)', ket: 'Hanya peringatan, tidak memblokir penempatan.',
      bidang: [['aktif', 'Nyalakan peringatan', 'centang'], ['pengawas.peran', 'Kode peran pengawas', 'teks'], ['pengawas.angkatan_asal', 'Angkatan asal pengawas', 'koma'],
        ['pengawas.angkatan_dijaga', 'Angkatan kamar yang dijaga', 'koma'], ['satu_angkatan', 'Kamar wajib satu angkatan', 'koma']] },
    { kunci: 'evaluasi', judul: 'Evaluasi', bidang: [['berulang_kali', 'Rusak berulang: minimal … kali', 'angka'], ['berulang_hari', 'dalam … hari', 'angka'], ['arah_ambang', 'Ambang arah penyebab (0–1)', 'desimal']] },
    { kunci: 'peran_tanpa_tugas', judul: 'Peran yang tidak diberi tugas', pilihan: typeof SEMUA_ROLE !== 'undefined' ? SEMUA_ROLE : [] },
    { kunci: 'foto', judul: 'Foto', bidang: [['sisi', 'Sisi terpanjang (px)', 'angka'], ['kb', 'Ukuran maksimal (KB)', 'angka'], ['maks', 'Foto per laporan', 'angka']] }
  ];
  const ambil = (o, jalur) => jalur.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
  const taruh = (o, jalur, v) => { const k = jalur.split('.'); let a = o; k.slice(0, -1).forEach(x => { if (a[x] == null || typeof a[x] !== 'object') a[x] = {}; a = a[x]; }); a[k[k.length - 1]] = v; };
  const mati = () => (SP.pengelola ? '' : 'disabled');

  function inputBidang(jalur, label, jenis, nilai) {
    const id = 'spSet_' + jalur.replace(/\W/g, '_') + '_' + Math.random().toString(36).slice(2, 7);
    if (jenis === 'centang') return `<label class="switch-row"><input type="checkbox" data-jalur="${esc(jalur)}" data-jenis="centang" ${nilai ? 'checked' : ''} ${mati()}><span>${esc(label)}</span></label>`;
    if (jenis === 'hari') return `<div class="field"><label class="label" for="${id}">${esc(label)}</label><select id="${id}" class="input" data-jalur="${esc(jalur)}" data-jenis="angka" ${mati()}>
      ${HARI.map(([v, n]) => `<option value="${v}" ${Number(nilai) === v ? 'selected' : ''}>${n}</option>`).join('')}</select></div>`;
    const v = jenis === 'koma' ? (nilai || []).join(', ') : (nilai ?? '');
    return `<div class="field"><label class="label" for="${id}">${esc(label)}</label><input id="${id}" class="input" data-jalur="${esc(jalur)}" data-jenis="${jenis}"
      ${jenis === 'angka' || jenis === 'desimal' ? 'inputmode="decimal"' : ''} value="${esc(v)}" ${mati()}></div>`;
  }
  function barisDaftar(kolom, r, lama) {
    return `<div class="sp-set-baris" data-baris>${kolom.map(([k, l, j]) => j === 'centang'
      ? `<label class="switch-row"><input type="checkbox" data-kol="${k}" data-jenis="centang" ${r?.[k] ? 'checked' : ''} ${mati()}><span>${esc(l)}</span></label>`
      : `<input class="input" data-kol="${k}" data-jenis="${j}" placeholder="${esc(l)}" aria-label="${esc(l)}" value="${esc(r?.[k] ?? '')}" ${mati()} ${j === 'kode' && lama ? 'readonly' : ''}>`).join('')}
      ${tulis(`<button type="button" class="btn btn-ghost btn-sm" data-sp="set-buang" data-sp-tulis aria-label="Buang baris"><i class="fa-solid fa-xmark"></i></button>`)}</div>`;
  }
  async function panelSetelan(panel) {
    const bagian = BAGIAN();
    let akun = [];
    if (bagian.some(b => b.akun)) { try { akun = (await muatProfil()).filter(a => a.role === 'Admin'); } catch (e) {} }
    if (SP.tab !== 'setelan' || APP.view !== 'sarprasatur') return;
    panel.innerHTML = `<div class="sp-set-kisi">${bagian.map(b => {
      const nilai = setelan(b.kunci, null);
      let isi = '';
      if (b.akar === 'centang') isi = inputBidang('', b.label, 'centang', nilai === true);
      if (b.bidang) isi += b.bidang.map(([j, l, t]) => inputBidang(j, l, t, ambil(nilai || {}, j))).join('');
      if (b.daftar) isi += `<div class="sp-set-daftar" data-kolom='${esc(JSON.stringify(b.daftar))}'>${(nilai || []).map(r => barisDaftar(b.daftar, r, true)).join('')}</div>
        ${tulis(`<button type="button" class="btn btn-ghost btn-sm" data-sp="set-baris" data-sp-tulis data-kunci="${b.kunci}"><i class="fa-solid fa-plus"></i>Tambah baris</button>`)}`;
      if (b.daftarDi) { const [k, kol] = b.daftarDi; isi += `<span class="label">${esc(k === 'semester' ? 'Semester' : k)}</span>
        <div class="sp-set-daftar" data-di="${k}" data-kolom='${esc(JSON.stringify(kol))}'>${(ambil(nilai || {}, k) || []).map(r => barisDaftar(kol, r, false)).join('')}</div>
        ${tulis(`<button type="button" class="btn btn-ghost btn-sm" data-sp="set-baris" data-sp-tulis data-kunci="${b.kunci}"><i class="fa-solid fa-plus"></i>Tambah baris</button>`)}`; }
      if (b.pilihan) isi += `<div class="sp-centang">${b.pilihan.map(p => `<label class="switch-row"><input type="checkbox" data-pilihan value="${esc(p)}" ${(nilai || []).includes(p) ? 'checked' : ''} ${mati()}><span>${esc(p)}</span></label>`).join('')}</div>`;
      if (b.akun) isi += akun.length ? `<div class="sp-centang">${akun.map(a => `<label class="switch-row"><input type="checkbox" data-pilihan value="${esc(a.id)}" ${(nilai || []).includes(a.id) ? 'checked' : ''} ${mati()}><span>${esc(a.nama)}</span></label>`).join('')}</div>
        <p class="hint">Super admin selalu menjadi pengelola.</p>` : '<p class="sp-kosong">Daftar akun tidak tersedia.</p>';
      return `<section class="card sp-set" data-sp-bagian="${b.kunci}"><header><h4>${esc(b.judul)}</h4>${b.ket ? `<p class="hint">${esc(b.ket)}</p>` : ''}</header>
        <div class="sp-set-isi">${isi}</div>
        ${tulis(`<p class="sp-baris-aksi"><button type="button" class="btn btn-primary btn-sm" data-sp="set-simpan" data-sp-tulis data-kunci="${b.kunci}"><i class="fa-solid fa-floppy-disk"></i>Simpan</button></p>`)}</section>`;
    }).join('')}</div>`;
  }
  function tambahBaris(kunci) {
    const sec = document.querySelector(`[data-sp-bagian="${kunci}"] .sp-set-daftar`); if (!sec) return;
    sec.insertAdjacentHTML('beforeend', barisDaftar(JSON.parse(sec.dataset.kolom), {}, false));
  }
  const nilaiInput = (el) => {
    const j = el.dataset.jenis;
    if (j === 'centang') return el.checked;
    if (j === 'angka') { const n = Number(String(el.value).trim()); return Number.isFinite(n) ? n : 0; }
    if (j === 'desimal') { const n = Number(String(el.value).replace(',', '.').trim()); return Number.isFinite(n) ? n : 0; }
    if (j === 'koma') return String(el.value).split(',').map(s => s.trim()).filter(Boolean);
    if (j === 'kode') return String(el.value).trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
    const t = String(el.value).trim(); return t === '' ? null : t;
  };
  const bacaDaftar = (wadah) => [...wadah.querySelectorAll('[data-baris]')].map(r => {
    const o = {}; r.querySelectorAll('[data-kol]').forEach(el => { o[el.dataset.kol] = nilaiInput(el); }); return o;
  }).filter(o => Object.values(o).some(v => v !== null && v !== '' && v !== false));
  async function simpanSetelan(kunci, b) {
    const sec = document.querySelector(`[data-sp-bagian="${kunci}"]`); if (!sec) return;
    const def = BAGIAN().find(x => x.kunci === kunci);
    let nilai = salin(setelan(kunci, null));
    if (def.akar === 'centang') nilai = sec.querySelector('[data-jalur]').checked;
    else if (def.daftar) nilai = bacaDaftar(sec.querySelector('.sp-set-daftar'));
    else if (def.pilihan || def.akun) nilai = [...sec.querySelectorAll('[data-pilihan]:checked')].map(x => x.value);
    else {
      nilai = nilai && typeof nilai === 'object' && !Array.isArray(nilai) ? nilai : {};
      sec.querySelectorAll('[data-jalur]').forEach(el => taruh(nilai, el.dataset.jalur, nilaiInput(el)));
      if (def.daftarDi) taruh(nilai, def.daftarDi[0], bacaDaftar(sec.querySelector(`[data-di="${def.daftarDi[0]}"]`)));
    }
    if (def.daftar && nilai.some(o => o.kode !== undefined && !o.kode)) return toast('error', 'Setiap baris perlu kode.');
    b.disabled = true;
    try { await rpc('sarpras_setelan_simpan', { p_kunci: kunci, p_nilai: nilai }); await segarkan(`${def.judul} tersimpan.`); }
    catch (e) { fireError(e); }
    finally { b.disabled = false; }
  }

  /* =====================================================================
   * TAB IMPOR
   * ===================================================================== */
  function panelImpor(panel) {
    const jenis = SP.impor?.jenis || 'butir';
    const im = SP.impor && SP.impor.jenis === jenis ? SP.impor : null;
    const kolom = KOLOM_IMPOR[jenis];
    panel.innerHTML = `<p class="sp-pengantar">Impor dari CSV atau Excel. Baris pertama berisi judul kolom. Semua baris diperiksa dulu; bila ada yang salah, tidak satu pun disimpan.
        Data yang sudah ada dicocokkan menurut nama. Kolom yang tidak ada di berkas tidak mengubah data lama, sedangkan sel kosong berarti dikosongkan.</p>
      <div class="sp-impor-kepala">
        <label class="label" for="spImporJenis">Jenis</label>
        <select id="spImporJenis" class="input">${Object.keys(KOLOM_IMPOR).map(k => `<option value="${k}" ${k === jenis ? 'selected' : ''}>${k === 'butir' ? 'Katalog ' + istilah('butir').toLowerCase() : k === 'lokasi' ? 'Lokasi' : 'Standar isi'}</option>`).join('')}</select>
        <a class="btn btn-ghost btn-sm" href="templat-csv/templat-sarpras-${jenis}.csv" download><i class="fa-solid fa-download"></i>Templat</a>
        ${jenis === 'butir' ? btn('impor-umum', 'Pakai templat butir umum', 'fa-list-check') : ''}
      </div>
      <p class="hint">Kolom: ${kolom.map(k => `<code>${k}</code>`).join(' ')}</p>
      ${tulis(`<label class="btn btn-ghost btn-sm sp-berkas"><i class="fa-solid fa-file-arrow-up"></i>Pilih berkas .csv / .xlsx
        <input type="file" id="spImporBerkas" accept=".csv,.txt,.xlsx,.xls,.ods" hidden></label>`)}
      <div id="spImporIsi">${im ? pratinjauImpor(im) : ''}</div>`;
    $('spImporJenis')?.addEventListener('change', (e) => { SP.impor = { jenis: e.target.value, baris: [], hasil: null, nama: '' }; panelImpor(panel); });
    $('spImporBerkas')?.addEventListener('change', async (e) => {
      const f = e.target.files?.[0]; if (!f) return;
      try {
        const rows = await bacaBerkas(f);
        SP.impor = { jenis: $('spImporJenis').value, baris: barisKeObjek(rows), hasil: null, nama: f.name };
        $('spImporIsi').innerHTML = pratinjauImpor(SP.impor);
      } catch (er) { fireError(er); }
    });
  }
  async function bacaBerkas(f) {
    if (/\.(xlsx|xls|ods)$/i.test(f.name)) {
      const X = await prMuatXlsx();
      const wb = X.read(await f.arrayBuffer(), { type: 'array' });
      return X.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: '' });
    }
    return bacaCsv(await f.text());
  }
  function pratinjauImpor(im) {
    const kol = KOLOM_IMPOR[im.jenis];
    const ada = new Set(im.baris.flatMap(o => Object.keys(o)));
    const lain = [...ada].filter(k => !kol.includes(k));
    const tetap = im.baris.length ? KOLOM_TETAP[im.jenis].filter(k => !ada.has(k)) : [];
    const salah = new Map((im.hasil?.salah || []).map(s => [s.baris, s.pesan]));
    const h = im.hasil;
    return `<p class="sp-sub">${esc(im.nama || '')} · ${angka(im.baris.length)} baris${lain.length ? ` · kolom diabaikan: ${lain.map(esc).join(', ')}` : ''}</p>
      ${tetap.length ? `<p class="hint sp-tetap"><i class="fa-solid fa-circle-info"></i> Tidak diubah pada data yang sudah ada: ${tetap.map(k => `<code>${esc(k)}</code>`).join(' ')}</p>` : ''}
      <div class="tbl sp-pratinjau"><table class="sp-tbl"><thead><tr><th>#</th>${kol.map(k => `<th>${k}</th>`).join('')}</tr></thead>
        <tbody>${im.baris.slice(0, 50).map((o, i) => `<tr class="${salah.has(i + 1) ? 'sp-salah' : ''}"><td>${i + 1}</td>${kol.map(k => `<td>${esc(o[k] ?? '')}</td>`).join('')}</tr>
          ${salah.has(i + 1) ? `<tr class="sp-salah-pesan"><td></td><td colspan="${kol.length}"><i class="fa-solid fa-triangle-exclamation"></i>${esc(salah.get(i + 1))}</td></tr>` : ''}`).join('')}</tbody></table></div>
      ${im.baris.length > 50 ? `<p class="hint">Menampilkan 50 dari ${angka(im.baris.length)} baris.</p>` : ''}
      <div id="spImporHasil">${h ? (h.ok
        ? `<p class="sp-ok"><i class="fa-solid fa-circle-check"></i>${h.kering ? 'Siap disimpan' : 'Tersimpan'}: ${angka(h.baru)} baru, ${angka(h.ubah)} diubah.</p>`
        : `<p class="sp-gagal"><i class="fa-solid fa-triangle-exclamation"></i>${angka(h.salah.length)} baris perlu dibetulkan. Belum ada yang tersimpan.</p>`) : ''}</div>
      <p class="sp-baris-aksi">${tulis(`<button type="button" class="btn btn-ghost btn-sm" id="spImporPeriksa" data-sp="impor-periksa" data-sp-tulis><i class="fa-solid fa-list-check"></i>Periksa</button>
        <button type="button" class="btn btn-primary btn-sm" id="spImporSimpan" data-sp="impor-simpan" data-sp-tulis ${h && h.ok && h.kering ? '' : 'disabled'}><i class="fa-solid fa-floppy-disk"></i>Simpan</button>`)}</p>`;
  }
  async function jalankanImpor(kering, b) {
    const im = SP.impor; if (!im || !im.baris.length) return toast('info', 'Pilih berkas lebih dulu.');
    b.disabled = true;
    try {
      im.hasil = await rpc('sarpras_impor', { p_jenis: im.jenis, p_baris: im.baris, p_kering: kering });
      $('spImporIsi').innerHTML = pratinjauImpor(im);
      if (!kering && im.hasil.ok) { await segarkan(`Impor tersimpan: ${im.hasil.baru} baru, ${im.hasil.ubah} diubah.`); }
    } catch (e) { fireError(e); }
    finally { b.disabled = false; }
  }
  async function templatUmum() {
    const res = await fetch('templat-csv/templat-sarpras-butir-umum.csv', { cache: 'no-store' });
    if (!res.ok) return toast('error', 'Templat tidak ditemukan.');
    SP.impor = { jenis: 'butir', baris: barisKeObjek(bacaCsv(await res.text())), hasil: null, nama: 'templat butir umum' };
    gambarPanel();
  }

  window.RQSarpras = { atur, _uji: { bacaCsv, barisKeObjek, petaPohon, aktifEfektif: (l) => aktifEfektif(l), SP } };
})();
