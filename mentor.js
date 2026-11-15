/* =====================================================================
 * mentor.js — v2.79 · MEJA MENTOR (dimuat lambat oleh app.js: muatMentorJs)
 * ---------------------------------------------------------------------
 *  Rancangan: claude/rancangan-v2.79-v2.80-mentor-inspeksi-sitaan.md.
 *  Ruang kerja mentor bidang OSDA: Ringkasan · Pelanggaran (seluruh santri
 *  VII–XII lewat RPC mentor_pelanggaran) · Agenda mingguan · Standar.
 *  Pengaturan Mentor (super admin): musyrif × bidang.
 *  Hak data ditegakkan RPC mentor_* / bidang_* (migrasi v2.79), bukan di sini.
 *  Tanpa nama lembaga, unit, atau nomor kamar yang ditanam.
 * ===================================================================== */
(function () {
  'use strict';

  const ANGKATAN = ['VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
  const HARI = ['Senin', 'Selasa', 'Rabu', 'Kamis', "Jum'at", 'Sabtu', 'Ahad'];
  const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const SASARAN = { kamar: 'Kamar', koridor: 'Koridor', umum: 'Kamar & koridor' };
  const $ = (id) => document.getElementById(id);
  const APP_ = () => (typeof APP !== 'undefined' ? APP : {});   // APP = const di app.js (bukan properti window)

  /* ---------------- logika murni (diuji lewat _uji) ---------------- */
  const keUTC = (k) => { const [y, m, d] = String(k).split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
  const keKunci = (d) => d.toISOString().slice(0, 10);
  const geser = (k, n) => { const d = keUTC(k); d.setUTCDate(d.getUTCDate() + n); return keKunci(d); };
  /** Senin dari pekan yang memuat tanggal k ('YYYY-MM-DD'). */
  function mingguDari(k) { const d = keUTC(k); const isoDow = (d.getUTCDay() + 6) % 7; return geser(k, -isoDow); }
  /** Ringkasan baris pelanggaran: jumlah per angkatan, butir teratas, santri berulang (≥ 3). */
  function ringkas(rows) {
    const perAngkatan = Object.fromEntries(ANGKATAN.map(a => [a, 0]));
    const butir = new Map(), santri = new Map();
    (rows || []).forEach(r => {
      if (r.angkatan in perAngkatan) perAngkatan[r.angkatan]++;
      const b = butir.get(r.kode) || { kode: r.kode, pelanggaran: r.pelanggaran, n: 0 }; b.n++; butir.set(r.kode, b);
      const s = santri.get(r.nisn) || { nisn: r.nisn, nama: r.nama, kelas: r.kelas, n: 0 }; s.n++; santri.set(r.nisn, s);
    });
    return {
      perAngkatan,
      butirTeratas: [...butir.values()].sort((a, b) => b.n - a.n || String(a.kode).localeCompare(String(b.kode))).slice(0, 5),
      berulang: [...santri.values()].filter(s => s.n >= 3).sort((a, b) => b.n - a.n || String(a.nama).localeCompare(String(b.nama), 'id'))
    };
  }
  const tglPendek = (k) => { if (!k) return '-'; const d = keUTC(k); return `${d.getUTCDate()} ${BULAN[d.getUTCMonth()]}`; };
  const labelPekan = (m) => { const a = keUTC(m), z = keUTC(geser(m, 6));
    return a.getUTCMonth() === z.getUTCMonth() ? `${a.getUTCDate()}–${z.getUTCDate()} ${BULAN[z.getUTCMonth()]} ${z.getUTCFullYear()}`
      : `${a.getUTCDate()} ${BULAN[a.getUTCMonth()]} – ${z.getUTCDate()} ${BULAN[z.getUTCMonth()]} ${z.getUTCFullYear()}`; };
  const unitLabel = (u) => (u === 'putri' ? 'Putri' : 'Putra');
  const galatTeks = (e) => String(e?.message || e || 'Terjadi kesalahan.').replace(/^.*?:\s*(?=[A-Z])/, '');

  /* ---------------- keadaan ---------------- */
  const S = {
    pilih: null,          // { id_bidang, nama, unit }
    pilihan: [],          // bidang × unit yang boleh dibuka
    tab: 'ringkasan',
    pel: { periode: '7', angkatan: '', bidang: null, cari: '' },
    rows: null, rowsKunci: '',
    pekan: null, ringkasRows: null,
    minggu: null, agenda: [],
    standar: []
  };
  const saya = () => APP_().mentor || { mentor: false, super: false, bidang: [] };

  async function rpc(nama, arg) {
    const { data, error } = await db.rpc(nama, arg || {});
    if (error) throw error;
    return data;
  }

  async function siapkanPilihan() {
    const m = saya();
    let p = (m.bidang || []).map(b => ({ id_bidang: b.id_bidang, nama: b.nama, unit: b.unit }));
    if (!p.length && m.super) {
      try {
        const d = await rpc('mentor_daftar');
        p = (d?.bidang || []).flatMap(b => ['putra', 'putri'].map(unit => ({ id_bidang: b.id_bidang, nama: b.nama, unit })));
      } catch (e) { p = []; }
    }
    S.pilihan = p;
    if (!S.pilih || !p.some(x => x.id_bidang === S.pilih.id_bidang && x.unit === S.pilih.unit)) {
      S.pilih = p.find(x => x.id_bidang === 'BDG-KBR') || p[0] || null;
      S.pel.bidang = S.pilih?.id_bidang || null;
    }
  }

  /* ---------------- MEJA MENTOR ---------------- */
  async function meja(akar) {
    S.minggu = S.minggu || mingguDari(hariIni());
    await siapkanPilihan();
    if (APP_().view !== 'mentor') return;
    if (!S.pilih) {
      akar.innerHTML = kartu('Meja Mentor', `<div class="card-body">${kosong('Belum ada bidang', 'Super admin belum menetapkan Anda sebagai mentor bidang.', 'fa-compass')}</div>`);
      return;
    }
    try { document.documentElement.style.setProperty('--mn-atas', (document.querySelector('.topbar')?.offsetHeight || 0) + 'px'); } catch (e) {}
    akar.innerHTML = `<div class="mn-akar">${kepalaHtml()}<nav class="mn-tab" role="tablist">${tabHtml()}</nav><section class="mn-isi" id="mnIsi" aria-live="polite"></section></div>`;
    onKlik(klikMeja);
    await gambarTab();
  }
  function kepalaHtml() {
    const p = S.pilih, banyak = S.pilihan.length > 1;
    return `<header class="mn-kepala">
      <span class="mn-lambang" aria-hidden="true"><i class="fa-solid fa-compass"></i></span>
      <div class="mn-identitas">
        <span class="mn-alis"><i class="fa-solid fa-compass"></i>Mentor · Unit ${esc(unitLabel(p.unit))}</span>
        <h2>${esc(p.nama)}</h2>
        <span class="mn-pekan-label">${esc(labelPekan(S.minggu || mingguDari(hariIni())))}</span>
      </div>
      ${banyak ? `<div class="mn-pilih" role="group" aria-label="Pilih bidang">${S.pilihan.map(x => `<button type="button" class="mn-pil${x.id_bidang === p.id_bidang && x.unit === p.unit ? ' on' : ''}"
          data-mn="bidang" data-id="${esc(x.id_bidang)}" data-unit="${esc(x.unit)}">${esc(x.nama)}${S.pilihan.some(y => y.id_bidang === x.id_bidang && y.unit !== x.unit) ? ` · ${esc(unitLabel(x.unit))}` : ''}</button>`).join('')}</div>` : ''}
    </header>`;
  }
  function tabDaftar() {
    return [['ringkasan', 'Ringkasan', 'fa-layer-group'], ['pelanggaran', 'Pelanggaran', 'fa-scale-balanced'], ['agenda', 'Agenda', 'fa-calendar-days'], ['standar', 'Standar', 'fa-list-check'],
      ...(window.RQMentor?._tabTambahan ? window.RQMentor._tabTambahan(S) : [])];
  }
  const tabHtml = () => tabDaftar().map(([v, l, i]) => `<button type="button" role="tab" aria-selected="${S.tab === v}" class="mn-tab-b${S.tab === v ? ' on' : ''}" data-mn="tab" data-v="${v}"><i class="fa-solid ${i}"></i>${esc(l)}</button>`).join('');

  /** Tab baru → pemintal + animasi masuk. Tab yang sama (sesudah aksi, saring, pekan) → isi lama tetap
   *  di tempat (redup sebentar), lalu diganti tanpa memutar ulang animasi masuk. */
  async function gambarTab() {
    const isi = $('mnIsi'); if (!isi) return;
    const ulang = isi.dataset.tab === S.tab && isi.dataset.siap === '1';
    isi.dataset.tab = S.tab; isi.dataset.siap = '';
    isi.classList.toggle('ulang', ulang);
    if (ulang) isi.classList.add('segar');
    else isi.innerHTML = '<p class="mn-muat"><i class="fa-solid fa-circle-notch fa-spin"></i></p>';
    try {
      if (S.tab === 'ringkasan') await tabRingkasan(isi);
      else if (S.tab === 'pelanggaran') await tabPelanggaran(isi);
      else if (S.tab === 'agenda') await tabAgenda(isi);
      else if (S.tab === 'standar') await tabStandar(isi);
      else if (window.RQMentor?._gambarTambahan) await window.RQMentor._gambarTambahan(S, isi);
    } catch (e) {
      isi.innerHTML = `<div class="card"><div class="card-body">${kosong('Data belum bisa dimuat', galatTeks(e), 'fa-plug-circle-xmark')}</div></div>`;
    } finally {
      if (isi.dataset.tab === S.tab) { isi.dataset.siap = '1'; isi.classList.remove('segar'); }
    }
  }
  /** Paksa gambar baru (pemandangan lain di tab yang sama, mis. denah ↔ lembar periksa). */
  function gambarBaru() { const isi = $('mnIsi'); if (isi) isi.dataset.siap = ''; return gambarTab(); }

  /* -- Ringkasan: 7 hari terakhir -- */
  async function tabRingkasan(isi) {
    const t = hariIni(), dari = geser(t, -6);
    const [rows, agenda] = await Promise.all([
      rpc('mentor_pelanggaran', { p_dari: dari, p_sampai: t, p_bidang: S.pilih.id_bidang, p_unit: S.pilih.unit }),
      rpc('bidang_agenda_daftar', { p_bidang: S.pilih.id_bidang, p_unit: S.pilih.unit, p_minggu: mingguDari(t) }).catch(() => [])
    ]);
    if (S.tab !== 'ringkasan') return;
    const R = ringkas(rows || []), maks = Math.max(1, ...Object.values(R.perAngkatan));
    const total = (rows || []).length, beres = (agenda || []).filter(a => a.terlaksana).length;
    isi.innerHTML = `<div class="mn-ringkas">
      <section class="mn-kartu mn-angkatan-kartu">
        <header><h3>Catatan ${esc(S.pilih.nama)}</h3><span>${esc(tglPendek(dari))} – ${esc(tglPendek(t))} · ${angka(total)} catatan</span></header>
        <div class="mn-angkatan">${ANGKATAN.map((a, i) => `<div class="mn-ang" data-angkatan="${a}" style="--i:${i};--h:${Math.round(100 * R.perAngkatan[a] / maks)}%">
            <span class="mn-batang" aria-hidden="true"><i></i></span><b>${angka(R.perAngkatan[a])}</b><small>${a}</small></div>`).join('')}</div>
      </section>
      <section class="mn-kartu">
        <header><h3>Butir terbanyak</h3></header>
        ${R.butirTeratas.length ? `<ol class="mn-butir">${R.butirTeratas.map(b => `<li><span class="mn-kode">${esc(b.kode)}</span><span>${esc(b.pelanggaran)}</span><b>${angka(b.n)}</b></li>`).join('')}</ol>`
          : '<p class="mn-kosong">Belum ada catatan pada rentang ini.</p>'}
      </section>
      <section class="mn-kartu mn-berulang">
        <header><h3>Santri berulang</h3><span>tiga catatan atau lebih</span></header>
        ${R.berulang.length ? `<ul>${R.berulang.map(s => `<li><span><b>${esc(s.nama)}</b><small>${esc(s.kelas || '')}</small></span><em>${angka(s.n)}×</em></li>`).join('')}</ul>`
          : '<p class="mn-kosong">Tidak ada.</p>'}
      </section>
      <section class="mn-kartu mn-agenda-ringkas">
        <header><h3>Agenda pekan ini</h3><span>${angka(beres)}/${angka((agenda || []).length)} terlaksana</span></header>
        <div class="mn-meter" role="img" aria-label="${angka(beres)} dari ${angka((agenda || []).length)} agenda terlaksana"><i style="--w:${(agenda || []).length ? Math.round(100 * beres / agenda.length) : 0}%"></i></div>
        <button type="button" class="btn btn-ghost btn-sm" data-mn="tab" data-v="agenda"><i class="fa-solid fa-calendar-days"></i>Buka agenda</button>
      </section>
    </div>`;
  }

  /* -- Pelanggaran: seluruh santri, hanya baca -- */
  function rentangPel() {
    const t = hariIni();
    if (S.pel.periode === 'pekan') return [mingguDari(t), t];
    if (S.pel.periode === 'bulan') return [t.slice(0, 8) + '01', t];
    if (S.pel.periode === '30') return [geser(t, -29), t];
    return [geser(t, -6), t];
  }
  async function tabPelanggaran(isi) {
    const [dari, sampai] = rentangPel();
    const kunci = [dari, sampai, S.pel.bidang || '', S.pilih.unit].join('|');
    if (S.rowsKunci !== kunci) { S.rows = await rpc('mentor_pelanggaran', { p_dari: dari, p_sampai: sampai, p_bidang: S.pel.bidang || null, p_unit: S.pilih.unit }) || []; S.rowsKunci = kunci; }
    if (S.tab !== 'pelanggaran') return;
    const PER = [['7', '7 hari'], ['pekan', 'Pekan ini'], ['bulan', 'Bulan ini'], ['30', '30 hari']];
    const bidangOpsi = [...new Map(S.pilihan.map(p => [p.id_bidang, p.nama])).entries()];
    isi.innerHTML = `<section class="mn-saring card">
        <div class="mn-baris-pil">${PER.map(([v, l]) => `<button type="button" class="mn-pil${S.pel.periode === v ? ' on' : ''}" data-mn="periode" data-v="${v}">${esc(l)}</button>`).join('')}</div>
        <div class="mn-baris-pil"><button type="button" class="mn-pil kecil${S.pel.angkatan ? '' : ' on'}" data-mn="angkatan" data-v="">Semua</button>
          ${ANGKATAN.map(a => `<button type="button" class="mn-pil kecil${S.pel.angkatan === a ? ' on' : ''}" data-mn="angkatan" data-v="${a}">${a}</button>`).join('')}</div>
        <div class="mn-saring-bawah">
          <label class="mn-cari"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i><input id="mnCari" type="search" placeholder="Cari nama, kelas, atau butir" value="${esc(S.pel.cari)}" aria-label="Cari"></label>
          <select id="mnBidang" class="input" aria-label="Bidang">${bidangOpsi.map(([id, nama]) => `<option value="${esc(id)}" ${S.pel.bidang === id ? 'selected' : ''}>${esc(nama)}</option>`).join('')}
            <option value="" ${S.pel.bidang ? '' : 'selected'}>Semua bidang</option></select>
        </div>
      </section>
      <div id="mnTabel"></div>`;
    $('mnCari').addEventListener('input', (e) => { S.pel.cari = e.target.value; gambarTabelPel(); });
    $('mnBidang').addEventListener('change', async (e) => { S.pel.bidang = e.target.value || null; await gambarTab(); });
    gambarTabelPel();
  }
  function gambarTabelPel() {
    const el = $('mnTabel'); if (!el) return;
    const q = S.pel.cari.trim().toLowerCase();
    const rows = (S.rows || []).filter(r => (!S.pel.angkatan || r.angkatan === S.pel.angkatan)
      && (!q || [r.nama, r.kelas, r.kode, r.pelanggaran].join(' ').toLowerCase().includes(q)));
    el.innerHTML = rows.length ? `<div class="mn-tabel" role="table" aria-label="Pelanggaran santri">
        <div class="mn-baris kepala" role="row"><span role="columnheader">Tanggal</span><span role="columnheader">Santri</span><span role="columnheader">Butir</span><span role="columnheader">Bidang</span><span role="columnheader">Penindak</span></div>
        ${rows.map(r => `<div class="mn-baris" role="row" data-id="${esc(r.id_log)}">
          <span role="cell" class="mn-tgl">${esc(tglPendek(r.tanggal))}</span>
          <span role="cell" class="mn-sn"><b>${esc(r.nama)}</b><small>${esc(r.kelas || '')}</small></span>
          <span role="cell" class="mn-bt"><span class="mn-kode">${esc(r.kode || '')}</span>${esc(r.pelanggaran || '')}${r.catatan ? `<small>${esc(r.catatan)}</small>` : ''}</span>
          <span role="cell" class="mn-bd">${esc(r.bidang || '')}</span>
          <span role="cell" class="mn-pn">${esc(r.penindak || '')}</span></div>`).join('')}
      </div><p class="mn-jumlah">${angka(rows.length)} catatan</p>`
      : `<div class="card"><div class="card-body">${kosong('Tidak ada catatan', 'Coba ubah periode, angkatan, atau bidang.', 'fa-magnifying-glass')}</div></div>`;
  }

  /* -- Agenda mingguan -- */
  async function tabAgenda(isi) {
    S.agenda = await rpc('bidang_agenda_daftar', { p_bidang: S.pilih.id_bidang, p_unit: S.pilih.unit, p_minggu: S.minggu }) || [];
    if (S.tab !== 'agenda') return;
    const t = hariIni();
    isi.innerHTML = `<section class="mn-agenda">
      <header class="mn-agenda-kepala">
        <button type="button" class="btn btn-ghost btn-sm" data-mn="pekan" data-v="-1" aria-label="Pekan sebelumnya"><i class="fa-solid fa-chevron-left"></i></button>
        <h3>${esc(labelPekan(S.minggu))}</h3>
        <button type="button" class="btn btn-ghost btn-sm" data-mn="pekan" data-v="1" aria-label="Pekan berikutnya"><i class="fa-solid fa-chevron-right"></i></button>
      </header>
      <div class="mn-pekan">${HARI.map((h, i) => {
        const tgl = geser(S.minggu, i), isiHari = S.agenda.filter(a => Number(a.hari) === i + 1);
        return `<div class="mn-hari${tgl === t ? ' kini' : ''}" data-hari="${i + 1}" style="--i:${i}">
          <header><b>${esc(h)}</b><small>${esc(tglPendek(tgl))}</small></header>
          <ul>${isiHari.map(a => `<li class="mn-ag${a.terlaksana ? ' beres' : ''}" data-jenis="${esc(a.jenis)}">
              <button type="button" class="mn-centang" data-mn="agenda-centang" data-id="${esc(a.id)}" aria-pressed="${!!a.terlaksana}" aria-label="${a.terlaksana ? 'Tandai belum' : 'Tandai terlaksana'}"><i class="fa-solid fa-check"></i></button>
              <span><b>${esc(a.judul)}</b><small>${a.jenis === 'inspeksi' ? 'Inspeksi' : 'Kegiatan'}${a.oleh_nama ? ` · ${esc(a.oleh_nama)}` : ''}</small></span>
              <button type="button" class="mn-hapus" data-mn="agenda-hapus" data-id="${esc(a.id)}" aria-label="Hapus"><i class="fa-solid fa-trash"></i></button></li>`).join('')}</ul>
          <button type="button" class="mn-tambah" data-mn="agenda-tambah" data-hari="${i + 1}"><i class="fa-solid fa-plus"></i>Agenda</button>
        </div>`;
      }).join('')}</div>
      ${S.agenda.filter(a => !a.hari).length ? `<p class="mn-jumlah">${angka(S.agenda.filter(a => !a.hari).length)} agenda tanpa hari</p>` : ''}
    </section>`;
  }
  async function tambahAgenda(hari) {
    const r = await Swal.fire({
      title: `Agenda ${HARI[hari - 1]}`, input: 'text', inputPlaceholder: 'Judul kegiatan atau inspeksi', inputAttributes: { maxlength: 120 },
      html: `<select id="mnJenis" class="swal2-select mn-swal-pilih" aria-label="Jenis"><option value="kegiatan">Kegiatan</option><option value="inspeksi">Inspeksi</option></select>`,
      showCancelButton: true, cancelButtonText: 'Batal', confirmButtonText: 'Simpan',
      inputValidator: (v) => (!String(v || '').trim() ? 'Judul agenda wajib diisi.' : null),
      preConfirm: (v) => ({ judul: String(v).trim(), jenis: $('mnJenis')?.value || 'kegiatan' })
    });
    if (!r.isConfirmed) return;
    await rpc('bidang_agenda_simpan', { p: { id_bidang: S.pilih.id_bidang, unit: S.pilih.unit, minggu: S.minggu, hari, judul: r.value.judul, jenis: r.value.jenis } });
    await gambarTab();
  }

  /* -- Standar -- */
  async function tabStandar(isi) {
    S.standar = await rpc('bidang_standar_daftar', { p_bidang: S.pilih.id_bidang, p_unit: S.pilih.unit }) || [];
    if (S.tab !== 'standar') return;
    const aktif = S.standar.filter(s => s.aktif !== false);
    const grup = new Map(); aktif.forEach(s => { if (!grup.has(s.kelompok)) grup.set(s.kelompok, []); grup.get(s.kelompok).push(s); });
    const sup = !!saya().super;
    isi.innerHTML = `<section class="mn-standar">
      ${sup ? `<p class="mn-standar-aksi"><button type="button" class="btn btn-primary btn-sm" data-mn="standar-tambah"><i class="fa-solid fa-plus"></i>Tambah butir</button></p>` : ''}
      ${grup.size ? [...grup.entries()].map(([k, isiK], i) => `<section class="mn-kel" style="--i:${i}"><h4><span>${angka(i + 1)}</span>${esc(k)}</h4>
          <ol>${isiK.map(s => `<li><span>${esc(s.butir)}</span><em class="mn-sasaran" data-s="${esc(s.sasaran)}">${esc(SASARAN[s.sasaran] || s.sasaran)}</em>
            ${sup ? `<button type="button" class="mn-hapus" data-mn="standar-nonaktif" data-id="${esc(s.id)}" aria-label="Nonaktifkan"><i class="fa-solid fa-xmark"></i></button>` : ''}</li>`).join('')}</ol></section>`).join('')
        : `<div class="card"><div class="card-body">${kosong('Belum ada standar', sup ? 'Tambahkan butir standar untuk bidang ini.' : 'Standar bidang ini belum diisi super admin.', 'fa-list-check')}</div></div>`}
    </section>`;
  }
  async function tambahStandar() {
    const r = await Swal.fire({
      title: 'Butir standar', showCancelButton: true, cancelButtonText: 'Batal', confirmButtonText: 'Simpan',
      html: `<div class="mn-form"><label for="mnKel">Kelompok</label><input id="mnKel" class="swal2-input" maxlength="60" list="mnKelDaftar">
        <datalist id="mnKelDaftar">${[...new Set(S.standar.map(s => s.kelompok))].map(k => `<option value="${esc(k)}">`).join('')}</datalist>
        <label for="mnButir">Butir</label><textarea id="mnButir" class="swal2-textarea" maxlength="240"></textarea>
        <label for="mnSas">Berlaku untuk</label><select id="mnSas" class="swal2-select">${Object.entries(SASARAN).map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join('')}</select></div>`,
      preConfirm: () => {
        const kelompok = $('mnKel').value.trim(), butir = $('mnButir').value.trim();
        if (!kelompok || !butir) { Swal.showValidationMessage('Kelompok dan butir wajib diisi.'); return false; }
        return { kelompok, butir, sasaran: $('mnSas').value };
      }
    });
    if (!r.isConfirmed) return;
    await rpc('bidang_standar_simpan', { p: { id_bidang: S.pilih.id_bidang, unit: S.pilih.unit, ...r.value } });
    await gambarTab();
  }

  async function klikMeja(e) {
    const b = e.target.closest('[data-mn]'); if (!b || b.disabled) return;
    const d = b.dataset;
    try {
      switch (d.mn) {
        case 'tab': S.tab = d.v; document.querySelectorAll('.mn-tab-b').forEach(x => { const on = x.dataset.v === d.v; x.classList.toggle('on', on); x.setAttribute('aria-selected', String(on)); }); return gambarTab();
        case 'bidang': S.pilih = S.pilihan.find(x => x.id_bidang === d.id && x.unit === d.unit) || S.pilih; S.pel.bidang = S.pilih.id_bidang; S.rowsKunci = '';
          return meja($('viewRoot'));
        case 'periode': S.pel.periode = d.v; return gambarTab();
        case 'angkatan': S.pel.angkatan = d.v; document.querySelectorAll('[data-mn="angkatan"]').forEach(x => x.classList.toggle('on', x.dataset.v === d.v)); return gambarTabelPel();
        case 'pekan': S.minggu = geser(S.minggu, 7 * Number(d.v)); document.querySelector('.mn-pekan-label')?.replaceChildren(document.createTextNode(labelPekan(S.minggu))); return gambarTab();
        case 'agenda-tambah': return tambahAgenda(Number(d.hari));
        case 'agenda-centang': {
          const a = S.agenda.find(x => String(x.id) === d.id); if (!a) return;
          b.disabled = true;
          await rpc('bidang_agenda_simpan', { p: { id: a.id, terlaksana: !a.terlaksana } });
          return gambarTab();
        }
        case 'agenda-hapus': {
          const ok = await Swal.fire({ title: 'Hapus agenda?', icon: 'warning', showCancelButton: true, cancelButtonText: 'Batal', confirmButtonText: 'Hapus', confirmButtonColor: '#8E1B32' });
          if (!ok.isConfirmed) return;
          await rpc('bidang_agenda_hapus', { p_id: d.id });
          return gambarTab();
        }
        case 'standar-tambah': return tambahStandar();
        case 'standar-nonaktif': await rpc('bidang_standar_simpan', { p: { id: d.id, aktif: false } }); return gambarTab();
        default: if (window.RQMentor?._klikTambahan) return window.RQMentor._klikTambahan(S, b, e);
      }
    } catch (err) { fireError(err); }
  }

  /* ---------------- PENGATURAN MENTOR (super admin) ---------------- */
  const A = { unit: 'putra', data: null };
  async function atur(akar) {
    akar.innerHTML = '<div class="mn-akar mn-atur"><p class="mn-muat"><i class="fa-solid fa-circle-notch fa-spin"></i></p></div>';
    try { A.data = await rpc('mentor_daftar'); }
    catch (e) { akar.innerHTML = kartu('Pengaturan Mentor', `<div class="card-body">${kosong('Tidak bisa dibuka', galatTeks(e), 'fa-lock')}</div>`); return; }
    if (APP_().view !== 'mentoratur') return;
    gambarAtur(akar);
    onKlik(async (e) => { const b = e.target.closest('[data-mn="unit"]'); if (b) { A.unit = b.dataset.v; gambarAtur(akar); } });
  }
  function gambarAtur(akar) {
    const d = A.data || {}, mus = d.musyrif || [], bid = d.bidang || [];
    const ada = new Set((d.tetap || []).map(t => `${t.profil_id}|${t.id_bidang}|${t.unit}`));
    akar.innerHTML = `<div class="mn-akar mn-atur">
      <section class="card mn-saring"><div class="mn-baris-pil">${['putra', 'putri'].map(u => `<button type="button" class="mn-pil${A.unit === u ? ' on' : ''}" data-mn="unit" data-v="${u}">Unit ${esc(unitLabel(u))}</button>`).join('')}</div></section>
      ${mus.length ? `<div class="mn-gulir"><table class="mn-matriks"><thead><tr><th scope="col">Musyrif</th>${bid.map(b => `<th scope="col">${esc(b.nama)}</th>`).join('')}</tr></thead>
        <tbody>${mus.map(m => `<tr><th scope="row"><b>${esc(m.nama)}</b><small>${esc(m.korps || '')} · ${esc(m.role || '')}</small></th>
          ${bid.map(b => `<td><label class="mn-cek"><input type="checkbox" data-mn="tetap" data-profil="${esc(m.id)}" data-bidang="${esc(b.id_bidang)}" ${ada.has(`${m.id}|${b.id_bidang}|${A.unit}`) ? 'checked' : ''}
              aria-label="${esc(m.nama)} mentor ${esc(b.nama)}"><span aria-hidden="true"><i class="fa-solid fa-check"></i></span></label></td>`).join('')}</tr>`).join('')}</tbody></table></div>`
        : `<div class="card"><div class="card-body">${kosong('Belum ada musyrif', 'Akun ber-korps musyrif/musyrifah akan tampil di sini.', 'fa-users-gear')}</div></div>`}
    </div>`;
    akar.querySelectorAll('input[data-mn="tetap"]').forEach(c => c.addEventListener('change', async () => {
      c.disabled = true;
      try {
        await rpc('mentor_tetapkan', { p: { profil_id: c.dataset.profil, id_bidang: c.dataset.bidang, unit: A.unit, aktif: c.checked } });
        const k = `${c.dataset.profil}|${c.dataset.bidang}|${A.unit}`;
        A.data.tetap = (A.data.tetap || []).filter(t => `${t.profil_id}|${t.id_bidang}|${t.unit}` !== k);
        if (c.checked) A.data.tetap.push({ profil_id: c.dataset.profil, id_bidang: c.dataset.bidang, unit: A.unit });
        toast('success', c.checked ? 'Mentor ditetapkan' : 'Penetapan dicabut');
      } catch (e) { c.checked = !c.checked; fireError(e); }
      finally { c.disabled = false; }
    }));
  }

  window.RQMentor = { meja, atur, _uji: { mingguDari, ringkas, geser, S }, _S: S, _rpc: rpc, _gambarTab: () => gambarTab(), _gambarBaru: () => gambarBaru(), _util: { tglPendek, labelPekan, galatTeks, geser, mingguDari, unitLabel } };
})();

/* =====================================================================
 * v2.80 · INSPEKSI KEBERSIHAN & SITAAN (tab tambahan Meja Mentor, khusus bidang Kebersihan)
 *  RPC: mentor_kamar, inspeksi_simpan, sitaan_catat, sitaan_daftar, sitaan_tautkan,
 *  sitaan_serahkan, sitaan_status (migrasi v2.80). Penghuni kamar dibaca dari tabel siswa
 *  (nomor_kamar); butir pelanggaran dari master bidang Kebersihan.
 * ===================================================================== */
(function () {
  'use strict';
  const RM = window.RQMentor; if (!RM) return;
  const KBR = 'BDG-KBR';
  const U = RM._util, rpc = RM._rpc, $ = (id) => document.getElementById(id);
  const APP_ = () => (typeof APP !== 'undefined' ? APP : {});
  const I = { kamar: null, std: null, buka: null, hasil: new Map(), segel: new Map(), saring: 'aktif', sita: null, penghuni: new Map(), master: null };
  const tingkat = (k) => { const s = k?.inspeksi?.skor; return s == null ? 'belum' : s >= 90 ? 'tinggi' : s >= 70 ? 'sedang' : 'rendah'; };
  const STATUS = { disita: 'Disita', permanen: 'Sita permanen', diserahkan: 'Diserahkan', dikembalikan: 'Dikembalikan' };
  const LEWAT = { sidang: 'lewat sidang', mentor: 'oleh mentor', musyrif: 'oleh musyrif' };

  RM._tabTambahan = (S) => (S.pilih?.id_bidang === KBR ? [['inspeksi', 'Inspeksi', 'fa-clipboard-check'], ['sitaan', 'Sitaan', 'fa-box-archive']] : []);
  RM._gambarTambahan = async (S, isi) => {
    if (S.tab === 'inspeksi') return I.buka ? gambarPeriksa(S, isi) : gambarDenah(S, isi);
    if (S.tab === 'sitaan') return gambarSitaan(S, isi);
  };

  /* ---------- data bantu ---------- */
  async function muatStandar(S) {
    if (!I.std || I.std.unit !== S.pilih.unit) I.std = { unit: S.pilih.unit, rows: ((await rpc('bidang_standar_daftar', { p_bidang: KBR, p_unit: S.pilih.unit })) || []).filter(s => s.aktif !== false) };
    return I.std.rows;
  }
  async function penghuni(nomor, unit) {
    const k = `${unit}|${nomor}`;
    if (nomor == null) return [];
    if (!I.penghuni.has(k)) {
      const { data, error } = await db.from('siswa').select('nisn,nama_siswa,kelas,nomor_kamar,unit_gender,status_santri').eq('nomor_kamar', nomor).eq('status_santri', 'Aktif');
      if (error) throw error;
      I.penghuni.set(k, (data || []).filter(s => String(s.unit_gender || 'putra').toLowerCase() === unit).sort((a, b) => String(a.nama_siswa).localeCompare(String(b.nama_siswa), 'id')));
    }
    return I.penghuni.get(k);
  }
  async function masterKbr(unit) {
    if (!I.master || I.master.unit !== unit) {
      const { data, error } = await db.from('master_pelanggaran').select('kode_pelanggaran,nama_pelanggaran,bidang,unit_gender').eq('bidang', 'Kebersihan');
      if (error) throw error;
      I.master = { unit, rows: (data || []).filter(m => unit === 'putri' || String(m.unit_gender || 'putra').toLowerCase() === unit).sort((a, b) => String(a.kode_pelanggaran).localeCompare(String(b.kode_pelanggaran))) };
    }
    return I.master.rows;
  }
  const tglJ = (t) => { try { return new Date(t).toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' }); } catch (e) { return String(t || '').slice(0, 10); } };
  /** Lembar "Berita Acara" untuk sita & tautkan: kop bercap, butir standar sebagai bukti, isian tebal. */
  function lembarBas(o) {
    return {
      html: `<div class="mn-bas">
          <header class="mn-bas-kop"><span class="mn-bas-cap" aria-hidden="true"><i class="fa-solid ${o.cap}"></i></span>
            <span class="mn-bas-judul"><small>${esc(o.alis)}</small><b>${esc(o.judul)}</b></span><time>${esc(o.tgl || '')}</time></header>
          ${o.std ? `<p class="mn-bas-std"><i class="fa-solid fa-triangle-exclamation"></i><span>${esc(o.std)}</span></p>` : ''}
          <div class="mn-bas-isi">${o.isi}</div></div>`,
      showCancelButton: true, cancelButtonText: 'Batal', confirmButtonText: `<i class="fa-solid ${o.ikonOk}"></i>${esc(o.ok)}`,
      buttonsStyling: false, reverseButtons: true, focusConfirm: false,
      customClass: { popup: 'mn-bas-pop', htmlContainer: 'mn-bas-html', actions: 'mn-bas-aksi', confirmButton: 'mn-bas-ok', cancelButton: 'mn-bas-batal', validationMessage: 'mn-bas-galat' },
      didOpen: (pop) => {
        pop.querySelectorAll('.mn-bas-stepper [data-j]').forEach(t => t.addEventListener('click', () => {
          const i = pop.querySelector('#mnJumlah'); i.value = String(Math.min(99, Math.max(1, (Number(i.value) || 1) + Number(t.dataset.j))));
        }));
        pop.querySelector('.mn-bas-utama input, .mn-bas-utama select')?.focus();
      },
      preConfirm: o.preConfirm
    };
  }
  const opsiPemilik = (daftar, lokasi) => `<option value="">${esc(lokasi?.zona === 'koridor' ? 'Milik koridor (tanpa pemilik)' : 'Milik kamar (tanpa pemilik)')}</option>`
    + daftar.map(s => `<option value="${esc(s.nisn)}">${esc(s.nama_siswa)} · ${esc(s.kelas || '')}</option>`).join('');
  const opsiKode = (rows) => `<option value="">Tanpa pelanggaran</option>` + rows.map(m => `<option value="${esc(m.kode_pelanggaran)}">${esc(m.kode_pelanggaran)} · ${esc(m.nama_pelanggaran)}</option>`).join('');

  /* ---------- denah mini ---------- */
  async function gambarDenah(S, isi) {
    I.kamar = await rpc('mentor_kamar', { p_unit: S.pilih.unit }) || [];
    if (S.tab !== 'inspeksi') return;
    const grup = new Map();
    I.kamar.forEach(k => { const lt = k.lantai || ''; if (!grup.has(lt)) grup.set(lt, []); grup.get(lt).push(k); });
    const lantai = [...grup.keys()].sort((a, b) => (a === '') - (b === '') || String(a).localeCompare(String(b), 'id', { numeric: true }));
    let i = 0;
    isi.innerHTML = I.kamar.length ? `<section class="mn-denah">
        <p class="mn-legenda"><span><i class="mn-sw tinggi"></i>≥ 90</span><span><i class="mn-sw sedang"></i>70–89</span><span><i class="mn-sw rendah"></i>&lt; 70</span><span><i class="mn-sw belum"></i>Belum diperiksa</span></p>
        ${lantai.map(lt => `<div class="mn-lantai" data-lantai="${esc(lt)}"><h4>${lt ? `Lantai ${esc(lt)}` : 'Belum berlantai'}</h4>
          <div class="mn-lok-kisi">${grup.get(lt).sort((a, b) => (a.zona === 'koridor') - (b.zona === 'koridor') || (a.nomor ?? 999) - (b.nomor ?? 999)).map(k => `
            <button type="button" class="mn-lok${k.zona === 'koridor' ? ' koridor' : ''}" data-mn="lok" data-id="${esc(k.id)}" data-tingkat="${tingkat(k)}" style="--i:${i++}">
              <span class="mn-lok-nama">${k.zona === 'koridor' ? '<i class="fa-solid fa-stairs" aria-hidden="true"></i>Koridor' : `<span class="pk-plakat kecil"><span class="pk-nomor">${esc(k.nomor)}</span></span>`}</span>
              <b class="mn-lok-skor">${k.inspeksi ? angka(k.inspeksi.skor) : '—'}</b>
              <small>${k.inspeksi ? esc(U.tglPendek(k.inspeksi.tanggal)) : 'belum'}${k.zona === 'kamar' ? ` · ${angka(k.penghuni)} santri` : ''}</small>
              ${Number(k.sitaan_aktif) ? `<span class="mn-lok-sita" title="Sitaan aktif"><i class="fa-solid fa-box-archive" aria-hidden="true"></i>${angka(k.sitaan_aktif)}</span>` : ''}
            </button>`).join('')}</div></div>`).join('')}
      </section>`
      : `<div class="card"><div class="card-body">${kosong('Belum ada kamar', 'Kamar dan koridor diatur di Pengaturan Sarpras.', 'fa-door-open')}</div></div>`;
  }

  /* ---------- lembar periksa ---------- */
  async function gambarPeriksa(S, isi) {
    const k = I.kamar.find(x => x.id === I.buka); if (!k) { I.buka = null; return gambarDenah(S, isi); }
    const std = (await muatStandar(S)).filter(s => k.zona === 'koridor' ? s.sasaran !== 'kamar' : s.sasaran !== 'koridor');
    if (S.tab !== 'inspeksi') return;
    const grup = new Map(); std.forEach(s => { if (!grup.has(s.kelompok)) grup.set(s.kelompok, []); grup.get(s.kelompok).push(s); });
    const tidak = std.filter(s => I.hasil.get(s.id) === false).length;
    isi.innerHTML = `<section class="mn-periksa" data-lokasi="${esc(k.id)}">
      <header class="mn-periksa-kepala">
        <button type="button" class="btn btn-ghost btn-sm" data-mn="periksa-kembali" aria-label="Kembali ke denah"><i class="fa-solid fa-arrow-left"></i></button>
        ${k.zona === 'koridor' ? '<span class="mn-ikon-kor"><i class="fa-solid fa-stairs"></i></span>' : `<span class="pk-plakat"><span class="pk-nomor">${esc(k.nomor)}</span></span>`}
        <div><h3>${esc(k.nama)}</h3><small>${esc(U.tglPendek(hariIni()))}${k.inspeksi ? ` · terakhir ${angka(k.inspeksi.skor)} (${esc(U.tglPendek(k.inspeksi.tanggal))})` : ''}</small></div>
        <span class="mn-skor-kini" aria-live="polite"><b>${angka(Math.round(100 * (std.length - tidak) / Math.max(1, std.length)))}</b><small>skor</small></span>
      </header>
      ${[...grup.entries()].map(([kel, isiK], gi) => `<section class="mn-pkel" style="--i:${gi}"><h4>${esc(kel)}</h4>
        ${isiK.map(s => { const t = I.hasil.get(s.id) === false, seg = I.segel.get(s.id) || [];
          return `<div class="mn-butir-cek${t ? ' tidak' : ''}" data-butir="${esc(s.id)}">
            <p>${esc(s.butir)}</p>
            <div class="mn-saklar" role="group" aria-label="Penilaian">
              <button type="button" data-mn="cek" data-std="${esc(s.id)}" data-v="1" aria-pressed="${!t}"><i class="fa-solid fa-check"></i>Sesuai</button>
              <button type="button" data-mn="cek" data-std="${esc(s.id)}" data-v="0" aria-pressed="${t}"><i class="fa-solid fa-xmark"></i>Tidak</button>
            </div>
            ${t ? `<div class="mn-sita-baris-cek"><button type="button" class="btn btn-sm mn-sita-b" data-mn="sita" data-std="${esc(s.id)}"><i class="fa-solid fa-box-archive"></i>Sita barang</button>
              ${seg.map(x => `<span class="mn-segel" title="${esc(x.barang)}"><i class="fa-solid fa-stamp"></i>Disita · ${esc(x.barang)}${x.jumlah > 1 ? ` ×${angka(x.jumlah)}` : ''}${x.ke ? ` · ke-${angka(x.ke)}` : ''}</span>`).join('')}</div>` : ''}
          </div>`; }).join('')}
      </section>`).join('')}
      <label class="mn-catatan">Catatan<textarea id="mnCatatanIns" maxlength="500" rows="2"></textarea></label>
      <footer class="mn-periksa-kaki"><span>${angka(tidak)} butir tidak sesuai</span>
        <button type="button" class="btn btn-primary" data-mn="inspeksi-simpan"><i class="fa-solid fa-circle-check"></i>Simpan inspeksi</button></footer>
    </section>`;
  }
  async function sita(S, stdId) {
    const k = I.kamar.find(x => x.id === I.buka); const s = (I.std?.rows || []).find(x => x.id === stdId);
    const [daftar, master] = await Promise.all([k.zona === 'kamar' ? penghuni(k.nomor, S.pilih.unit) : [], masterKbr(S.pilih.unit)]);
    const r = await Swal.fire(lembarBas({
      cap: 'fa-box-archive', alis: `Berita acara sitaan · ${k.nama}`, judul: 'Sita barang', tgl: U.tglPendek(hariIni()), std: s?.butir || '', ok: 'Sita barang', ikonOk: 'fa-stamp',
      isi: `<label class="mn-bas-f mn-bas-utama" for="mnBarang"><span>Barang</span>
          <span class="mn-bas-in"><i class="fa-solid fa-box-archive"></i><input id="mnBarang" maxlength="80" autocomplete="off" placeholder="mis. kardus air mineral"></span></label>
        <div class="mn-bas-dua">
          <div class="mn-bas-f"><label for="mnJumlah">Jumlah</label>
            <span class="mn-bas-stepper"><button type="button" data-j="-1" aria-label="Kurangi"><i class="fa-solid fa-minus"></i></button><input id="mnJumlah" type="number" min="1" max="99" value="1" inputmode="numeric"><button type="button" data-j="1" aria-label="Tambah"><i class="fa-solid fa-plus"></i></button></span></div>
          <label class="mn-bas-f" for="mnPemilik"><span>Pemilik</span><span class="mn-bas-pilih"><i class="fa-solid fa-user"></i><select id="mnPemilik">${opsiPemilik(daftar, k)}</select></span></label>
        </div>
        <label class="mn-bas-f" for="mnKode"><span>Pelanggaran</span><span class="mn-bas-pilih"><i class="fa-solid fa-scale-balanced"></i><select id="mnKode">${opsiKode(master)}</select></span></label>
        <label class="mn-bas-f" for="mnKet"><span>Keterangan</span><textarea id="mnKet" maxlength="300" rows="2" placeholder="mis. di bawah ranjang atas"></textarea></label>`,
      preConfirm: () => {
        const barang = $('mnBarang').value.trim(), jumlah = Number($('mnJumlah').value || 1), nisn = $('mnPemilik').value, kode = $('mnKode').value;
        if (!barang) { Swal.showValidationMessage('Nama barang wajib diisi.'); return false; }
        if (!(jumlah >= 1 && jumlah <= 99)) { Swal.showValidationMessage('Jumlah 1–99.'); return false; }
        if (kode && !nisn) { Swal.showValidationMessage('Pelanggaran hanya untuk barang yang jelas pemiliknya.'); return false; }
        return { barang, jumlah, nisn: nisn || null, kode: kode || null, keterangan: $('mnKet').value.trim() || null };
      }
    }));
    if (!r.isConfirmed) return;
    const h = await rpc('sitaan_catat', { p: { lokasi_id: k.id, standar_id: stdId, ...r.value } });
    const seg = I.segel.get(stdId) || []; seg.push({ barang: r.value.barang, jumlah: r.value.jumlah, ke: h?.ke || null }); I.segel.set(stdId, seg);
    k.sitaan_aktif = (Number(k.sitaan_aktif) || 0) + 1;
    toast('success', 'Barang disita', h?.ke ? { sub: `Sitaan ke-${h.ke} santri ini tahun ajaran ini` } : undefined);
    await RM._gambarTab();
  }
  async function simpanInspeksi(S) {
    const k = I.kamar.find(x => x.id === I.buka);
    const std = (I.std?.rows || []).filter(s => k.zona === 'koridor' ? s.sasaran !== 'kamar' : s.sasaran !== 'koridor');
    const hasil = std.map(s => ({ standar_id: s.id, sesuai: I.hasil.get(s.id) !== false }));
    const h = await rpc('inspeksi_simpan', { p: { lokasi_id: k.id, hasil, catatan: $('mnCatatanIns')?.value.trim() || null } });
    toast('success', `Inspeksi ${k.nama} tersimpan`, { sub: `Skor ${h?.skor ?? '-'}` });
    I.buka = null; I.hasil.clear(); I.segel.clear();
    await RM._gambarBaru();
  }

  /* ---------- tab sitaan ---------- */
  async function gambarSitaan(S, isi) {
    I.sita = await rpc('sitaan_daftar', { p_unit: S.pilih.unit }) || { baris: [] };
    if (S.tab !== 'sitaan') return;
    const ambang = I.sita.ambang == null || I.sita.ambang === '' ? null : Number(I.sita.ambang);
    const baris = (I.sita.baris || []).filter(b => I.saring === 'semua' ? true : I.saring === 'diserahkan' ? b.status === 'diserahkan' : ['disita', 'permanen'].includes(b.status));
    const SAR = [['aktif', 'Aktif'], ['diserahkan', 'Diserahkan'], ['semua', 'Semua']];
    isi.innerHTML = `<section class="mn-saring card"><div class="mn-baris-pil">${SAR.map(([v, l]) => `<button type="button" class="mn-pil${I.saring === v ? ' on' : ''}" data-mn="sita-saring" data-v="${v}">${esc(l)}</button>`).join('')}</div>
        <div class="mn-sita-aksi"><button type="button" class="btn btn-primary btn-sm" data-mn="sita-serahkan"><i class="fa-solid fa-circle-check"></i>Serahkan terpilih</button>
          <button type="button" class="btn btn-ghost btn-sm" data-mn="sita-pdf"><i class="fa-solid fa-file-pdf"></i>Rekap 7 hari</button>
          ${ambang ? `<span class="mn-ambang">Sita permanen mulai ke-${angka(ambang)}</span>` : ''}</div></section>
      ${baris.length ? `<ul class="mn-sita">${baris.map(b => {
        const sentuh = ambang && b.ke && b.ke >= ambang;
        return `<li class="mn-sita-baris${sentuh ? ' ambang' : ''}" data-id="${esc(b.id)}" data-status="${esc(b.status)}">
          ${b.status === 'disita' ? `<label class="mn-cek"><input type="checkbox" data-mn="sita-pilih" data-id="${esc(b.id)}" aria-label="Pilih ${esc(b.barang)}"><span aria-hidden="true"><i class="fa-solid fa-check"></i></span></label>` : '<span class="mn-cek-kosong"></span>'}
          <div class="mn-sita-isi"><b>${esc(b.barang)}${b.jumlah > 1 ? ` ×${angka(b.jumlah)}` : ''}</b>
            <small>${esc(b.lokasi || '')} · ${b.nisn ? `${esc(b.nama || b.nisn)} (${esc(b.kelas || '-')})` : 'Milik kamar'} · ${esc(U.tglPendek(String(b.disita_pada || '').slice(0, 10)))}${b.kode ? ` · ${esc(b.kode)}` : ''}</small></div>
          <div class="mn-sita-tanda">${b.ke ? `<span class="mn-ke">ke-${angka(b.ke)}</span>` : ''}<span class="mn-st" data-s="${esc(b.status)}">${esc(STATUS[b.status] || b.status)}${b.diserahkan_lewat ? ` ${esc(LEWAT[b.diserahkan_lewat] || '')}` : ''}</span></div>
          <div class="mn-sita-tombol">
            ${!b.nisn && b.status === 'disita' ? `<button type="button" class="btn btn-ghost btn-sm" data-mn="sita-tautkan" data-id="${esc(b.id)}"><i class="fa-solid fa-user-graduate"></i>Tautkan</button>` : ''}
            ${b.status === 'disita' ? `<button type="button" class="btn btn-ghost btn-sm" data-mn="sita-status" data-v="permanen" data-id="${esc(b.id)}"><i class="fa-solid fa-lock"></i>Permanen</button>` : ''}
            ${['disita', 'permanen'].includes(b.status) ? `<button type="button" class="btn btn-ghost btn-sm" data-mn="sita-status" data-v="dikembalikan" data-id="${esc(b.id)}"><i class="fa-solid fa-rotate-left"></i>Kembalikan</button>` : ''}
          </div></li>`; }).join('')}</ul>`
        : `<div class="card"><div class="card-body">${kosong('Tidak ada sitaan', 'Sitaan tercatat dari lembar inspeksi.', 'fa-box-archive')}</div></div>`}`;
  }
  async function tautkan(S, id) {
    const b = (I.sita?.baris || []).find(x => String(x.id) === String(id)); if (!b) return;
    const [daftar, master] = await Promise.all([penghuni(b.nomor, S.pilih.unit), masterKbr(S.pilih.unit)]);
    const r = await Swal.fire(lembarBas({
      cap: 'fa-user-check', alis: `Tautkan sitaan · ${b.lokasi || ''}`, judul: 'Tautkan ke santri', tgl: U.tglPendek(tglJ(b.disita_pada)), std: `${b.barang}${Number(b.jumlah) > 1 ? ' ×' + b.jumlah : ''}`, ok: 'Tautkan', ikonOk: 'fa-user-check',
      isi: `<label class="mn-bas-f mn-bas-utama" for="mnPemilik"><span>Santri</span><span class="mn-bas-pilih"><i class="fa-solid fa-user"></i><select id="mnPemilik"><option value="">Pilih santri</option>${daftar.map(s => `<option value="${esc(s.nisn)}">${esc(s.nama_siswa)} · ${esc(s.kelas || '')}</option>`).join('')}</select></span></label>
        <label class="mn-bas-f" for="mnKode"><span>Pelanggaran</span><span class="mn-bas-pilih"><i class="fa-solid fa-scale-balanced"></i><select id="mnKode">${opsiKode(master)}</select></span></label>`,
      preConfirm: () => { const nisn = $('mnPemilik').value; if (!nisn) { Swal.showValidationMessage('Pilih santri pemilik barang.'); return false; } return { nisn, kode: $('mnKode').value || null }; }
    }));
    if (!r.isConfirmed) return;
    await rpc('sitaan_tautkan', { p_id: Number(b.id), p_nisn: r.value.nisn, p_kode: r.value.kode });
    toast('success', 'Sitaan ditautkan');
    await RM._gambarTab();
  }
  async function serahkan(S) {
    const ids = [...document.querySelectorAll('input[data-mn="sita-pilih"]:checked')].map(c => Number(c.dataset.id));
    if (!ids.length) return toast('info', 'Pilih barang yang diserahkan.');
    const ok = await Swal.fire({ title: `Serahkan ${angka(ids.length)} barang?`, text: 'Barang dikembalikan kepada pemiliknya oleh mentor.', showCancelButton: true, cancelButtonText: 'Batal', confirmButtonText: 'Serahkan' });
    if (!ok.isConfirmed) return;
    await rpc('sitaan_serahkan', { p_ids: ids, p_lewat: 'mentor' });
    toast('success', 'Barang diserahkan');
    await RM._gambarTab();
  }
  async function ubahStatus(S, id, status) {
    const ok = await Swal.fire({ title: status === 'permanen' ? 'Sita permanen?' : 'Kembalikan barang?', showCancelButton: true, cancelButtonText: 'Batal',
      confirmButtonText: status === 'permanen' ? 'Sita permanen' : 'Kembalikan', confirmButtonColor: status === 'permanen' ? '#8E1B32' : undefined });
    if (!ok.isConfirmed) return;
    await rpc('sitaan_status', { p_id: Number(id), p_status: status });
    await RM._gambarTab();
  }
  async function rekapPdf(S, btn) {
    btn.disabled = true;
    try {
      if (!(await muatSarprasJs()) || !window.RQSarpras?.pdf) throw new Error('Pembuat PDF belum tersedia. Muat ulang aplikasi.');
      const P = window.RQSarpras.pdf, t = hariIni(), dari = U.geser(t, -6);
      const [kamar, sita] = await Promise.all([rpc('mentor_kamar', { p_unit: S.pilih.unit }), rpc('sitaan_daftar', { p_unit: S.pilih.unit })]);
      const { pdf, kertas, logo } = await P.baru();
      const M = P.mesin(pdf, kertas);
      M.kop(logo, {}, '');
      M.judul('REKAP INSPEKSI KEBERSIHAN', [`${U.tglPendek(dari)} - ${U.tglPendek(t)} ${t.slice(0, 4)}`, `Unit ${U.unitLabel(S.pilih.unit)}`]);
      M.subjudul('A. Skor inspeksi terakhir');
      M.tabel([{ judul: 'Lokasi', bobot: 2, tebal: true }, { judul: 'Lantai', lebar: 16, rata: 'center' }, { judul: 'Santri', lebar: 16, rata: 'center' },
        { judul: 'Tanggal', lebar: 24, rata: 'center' }, { judul: 'Skor', lebar: 16, rata: 'center' }, { judul: 'Sitaan aktif', lebar: 22, rata: 'center' }],
        (kamar || []).map(k => ({ sel: [k.nama, k.lantai || '-', k.zona === 'kamar' ? String(k.penghuni) : '-', k.inspeksi ? U.tglPendek(k.inspeksi.tanggal) : '-',
          k.inspeksi ? String(k.inspeksi.skor) : '-', Number(k.sitaan_aktif) ? String(k.sitaan_aktif) : '-'],
          isi: k.inspeksi && k.inspeksi.skor < 70 ? [253, 236, 239] : null })), { fs: 7.6 });
      const baru = (sita?.baris || []).filter(b => String(b.disita_pada || '').slice(0, 10) >= dari);
      M.subjudul('B. Sitaan 7 hari terakhir');
      if (baru.length) M.tabel([{ judul: 'Barang', bobot: 1.6, tebal: true }, { judul: 'Lokasi', bobot: 1 }, { judul: 'Pemilik', bobot: 1.6 }, { judul: 'Ke', lebar: 10, rata: 'center' }, { judul: 'Status', bobot: 1 }],
        baru.map(b => ({ sel: [`${b.barang}${b.jumlah > 1 ? ' x' + b.jumlah : ''}`, b.lokasi || '-', b.nisn ? `${b.nama} (${b.kelas || '-'})` : 'Milik kamar', b.ke ? String(b.ke) : '-', STATUS[b.status] || b.status] })), { fs: 7.6 });
      else M.paragraf('Nihil.', 8.4);
      M.y += 4;
      M.ttd(U.tglPendek(t) + ' ' + t.slice(0, 4), '', [{ jabatan: `Mentor ${S.pilih.nama}`, nama: APP_().profil?.nama || '' }], { dok: 'Rekap Inspeksi Kebersihan', kanan: 'Mentor,' });
      M.kaki(`Rekap Inspeksi Kebersihan - chemint ${P.jamCetak()} WIB`);
      try { pdf.setProperties({ title: 'Rekap Inspeksi Kebersihan', creator: 'chemint' }); } catch (e) {}
      pdf.save(`Rekap Inspeksi Kebersihan ${U.unitLabel(S.pilih.unit)} ${dari} sd ${t}.pdf`);
    } catch (e) { fireError(e); }
    finally { btn.disabled = false; }
  }

  RM._klikTambahan = async (S, b) => {
    const d = b.dataset;
    switch (d.mn) {
      case 'lok': I.buka = d.id; I.hasil.clear(); I.segel.clear(); return RM._gambarBaru();
      case 'periksa-kembali': I.buka = null; return RM._gambarBaru();
      case 'cek': {
        const isi = $('mnIsi'), y = window.scrollY;
        isi.classList.add('ulang');                      // lembar yang sama: tanpa animasi masuk ulang
        I.hasil.set(d.std, d.v === '1');
        await gambarPeriksa(S, isi);                     // tanpa pemutar muat: lembar tetap di tempat
        window.scrollTo({ top: y });
        isi.querySelector(`[data-butir="${CSS.escape(d.std)}"]`)?.classList.add(d.v === '1' ? 'pulih' : 'memantul');
        return;
      }
      case 'sita': return sita(S, d.std);
      case 'inspeksi-simpan': b.disabled = true; try { return await simpanInspeksi(S); } finally { b.disabled = false; }
      case 'sita-saring': I.saring = d.v; return RM._gambarTab();
      case 'sita-tautkan': return tautkan(S, d.id);
      case 'sita-serahkan': return serahkan(S);
      case 'sita-status': return ubahStatus(S, d.id, d.v);
      case 'sita-pdf': return rekapPdf(S, b);
    }
  };
  RM._uji.inspeksi = I;
})();
