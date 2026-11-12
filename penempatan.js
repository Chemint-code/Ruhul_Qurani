/* =====================================================================
 * penempatan.js — v2.76 · PENEMPATAN KAMAR oleh musyrif
 * ---------------------------------------------------------------------
 *  Dimuat lambat oleh app.js (muatPenempatanJs). Rancangan:
 *  claude/rancangan-v2.76-penempatan-kamar.md.
 *
 *  Musyrif memilih kamar (rekomendasi se-angkatan lebih dulu), lalu mengetuk
 *  santri binaannya yang tidur di sana. Draf disimpan di memori dan hanya
 *  dikirim saat Simpan (RPC sarpras_penempatan_simpan, atomik). Angkatan dan
 *  kapasitas hanya peringatan lunak; yang memutuskan hak adalah basis data.
 *
 *  Tidak ada nama lembaga, unit, atau nomor kamar yang ditanam di sini;
 *  istilah mengikuti setelan (RQSarpras._uji.SP).
 * ===================================================================== */
(function () {
  'use strict';

  const ANGKATAN_MUDABBIR = ['VII', 'X'];   // kamar yang dijaga mudabbir (santri XI), spesifikasi §3

  /* ---------------- logika murni (diuji lewat _uji) ---------------- */
  const sisa = (k) => (k.kapasitas == null ? null : k.kapasitas - k.penghuni_n);
  const penuh = (k) => k.kapasitas != null && k.penghuni_n >= k.kapasitas;
  const dalamUrutan = (a, b) => (a.nomor - b.nomor) || String(a.nama).localeCompare(String(b.nama), 'id');

  /** Kelompokkan kamar untuk lorong: rekomendasi (se-angkatan, sisa terbanyak dulu), kosong,
   *  mudabbir (kamar VII/X untuk musyrif kelas XI), lainnya, penuh. Kapasitas kosong = tak pernah penuh. */
  function urutkanKamar(kamar, angkatanBinaan) {
    const ang = new Set(angkatanBinaan || []);
    const h = { rekomendasi: [], kosong: [], mudabbir: [], lainnya: [], penuh: [] };
    (kamar || []).forEach((k) => {
      if (penuh(k)) h.penuh.push(k);
      else if (!k.penghuni_n) h.kosong.push(k);
      else if (k.dominan && ang.has(k.dominan)) h.rekomendasi.push(k);
      else if (ang.has('XI') && ANGKATAN_MUDABBIR.includes(k.dominan)) h.mudabbir.push(k);
      else h.lainnya.push(k);
    });
    h.rekomendasi.sort((a, b) => {
      const sa = sisa(a), sb = sisa(b);
      if (sa == null && sb == null) return dalamUrutan(a, b);
      if (sa == null) return 1;
      if (sb == null) return -1;
      return (sb - sa) || dalamUrutan(a, b);
    });
    ['kosong', 'mudabbir', 'lainnya', 'penuh'].forEach((x) => h[x].sort(dalamUrutan));
    return h;
  }

  /** Ringkas draf terhadap keadaan awal: berapa masuk, keluar, dipindah. Yang sama dengan awal tidak dihitung. */
  function ringkasDraf(draf, awal) {
    const r = { masuk: 0, keluar: 0, dipindah: 0 };
    (draf || new Map()).forEach((d, nisn) => {
      const a = awal && awal.has(nisn) ? awal.get(nisn) : null;
      const b = d.nomor == null ? null : d.nomor;
      if ((a == null ? null : a) === b) return;
      if (a == null) r.masuk++;
      else if (b == null) r.keluar++;
      else r.dipindah++;
    });
    return r;
  }

  /** Peringatan lunak untuk satu kamar menurut draf saat ini. Tidak pernah memblokir. */
  function periksaDraf({ draf, awal, kamar, santri }) {
    const hasil = [];
    const peta = new Map((santri || []).map((s) => [s.nisn, s]));
    let masuk = 0, keluar = 0;
    draf.forEach((d, nisn) => {
      const a = awal.has(nisn) ? awal.get(nisn) : null;
      const ke = d.nomor == null ? null : d.nomor;
      const dariSini = a === kamar.nomor, keSini = ke === kamar.nomor;
      if (dariSini && !keSini) keluar++;
      if (keSini && !dariSini) {
        masuk++;
        const s = peta.get(nisn);
        if (!s) return;
        const nama = s.nama;
        if (!s.angkatan) {
          hasil.push({ jenis: 'angkatan_tak_dikenal', nisn, teks: `${nama}: angkatan kelas tidak dikenali.` });
        } else if (kamar.dominan && s.angkatan !== kamar.dominan) {
          if (s.angkatan === 'XI' && ANGKATAN_MUDABBIR.includes(kamar.dominan)) {
            if (!d.mudabbir) hasil.push({ jenis: 'mudabbir', nisn, teks: `${nama}: kamar ${kamar.dominan} dijaga mudabbir (santri XI).` });
          } else {
            hasil.push({ jenis: 'angkatan', nisn, teks: `${nama} (${s.angkatan}) berbeda angkatan dengan ${kamar.nama} (${kamar.dominan}).` });
          }
        }
      }
    });
    if (masuk) {
      if (kamar.kapasitas == null) {
        hasil.push({ jenis: 'kapasitas_kosong', teks: `Kapasitas ${kamar.nama} belum diisi.` });
      } else {
        const sesudah = kamar.penghuni_n - keluar + masuk;
        if (sesudah > kamar.kapasitas) hasil.push({ jenis: 'kapasitas', teks: `${kamar.nama} melebihi kapasitas (${sesudah}/${kamar.kapasitas}).` });
      }
    }
    return hasil;
  }

  /* ---------------- tampilan ---------------- */
  const R = () => window.RQSarpras;
  const ist = (k) => R().istilah(k);
  const e = (t) => esc(t);
  let S = null;

  const inisial = (n) => String(n || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]).join('').toUpperCase();
  const nadaAvatar = (nisn) => 't' + ([...String(nisn)].reduce((a, c) => a + c.charCodeAt(0), 0) % 4);
  const avatar = (nisn, nama, kls = '') => `<span class="pk-avatar ${nadaAvatar(nisn)} ${kls}" data-nisn="${e(nisn)}" aria-hidden="true">${e(inisial(nama))}</span>`;
  const labelKamar = (n) => `${ist('kamar')} ${n}`;
  const labelLantai = (l) => (l === '' ? 'Belum berlantai' : /^\d+$/.test(l) ? `${ist('lantai')} ${l}` : l);
  const warna = (v, cadangan) => (getComputedStyle(document.documentElement).getPropertyValue(v) || '').trim() || cadangan;

  const awalDari = (nisn) => (S.awal.get(nisn) == null ? null : S.awal.get(nisn));
  const kini = (nisn) => (S.draf.has(nisn) ? S.draf.get(nisn).nomor : awalDari(nisn));
  const mudKini = (nisn) => (S.draf.has(nisn) ? !!S.draf.get(nisn).mudabbir : !!S.awalMud.get(nisn));
  function setDraf(nisn, nomor, mud) {
    const m = nomor != null && !!mud;
    if (nomor === awalDari(nisn) && m === !!S.awalMud.get(nisn)) S.draf.delete(nisn);
    else S.draf.set(nisn, { nomor, mudabbir: m });
  }

  function siapkan(d, pertahankan) {
    const lama = pertahankan && S.draf ? S.draf : new Map();
    const santri = d.santri || [];
    S.data = d;
    S.unitId = d.unit_id || null;
    S.santri = santri;
    S.peta = new Map(santri.map((x) => [x.nisn, x]));
    S.awal = new Map(santri.map((x) => [x.nisn, x.nomor_kamar == null ? null : Number(x.nomor_kamar)]));
    S.awalMud = new Map(santri.map((x) => [x.nisn, x.peran_kamar === 'mudabbir']));
    S.kamar = (d.kamar || []).slice().sort(dalamUrutan);
    S.kamarPeta = new Map(S.kamar.map((k) => [Number(k.nomor), k]));
    S.draf = new Map();
    lama.forEach((v, n) => { if (S.peta.has(n)) S.draf.set(n, v); });
  }
  const muatData = (unitId) => R().rpc('sarpras_penempatan_data', unitId ? { p_unit: unitId } : {});

  /** Penghuni satu kamar menurut keadaan awal + draf. */
  function isiKamar(k) {
    const binaan = new Set(S.santri.map((x) => x.nisn));
    const awalDi = S.santri.filter((x) => awalDari(x.nisn) === k.nomor);
    const tetap = awalDi.filter((x) => kini(x.nisn) === k.nomor);
    const keluar = awalDi.filter((x) => kini(x.nisn) !== k.nomor);
    const masuk = S.santri.filter((x) => awalDari(x.nisn) !== k.nomor && kini(x.nisn) === k.nomor);
    const lain = (k.penghuni || []).filter((p) => !binaan.has(p.nisn));
    const anon = k.penghuni == null ? Math.max(0, k.penghuni_n - awalDi.length) : Math.max(0, k.penghuni_n - awalDi.length - lain.length);
    return { tetap, keluar, masuk, lain, anon, sesudah: tetap.length + masuk.length + lain.length + anon };
  }
  const nBelumBerkamar = () => {
    const ang = (S.data && S.data.angkatan_binaan) || [];
    return S.santri.filter((x) => awalDari(x.nisn) == null && (!ang.length || ang.includes(x.angkatan))).length;
  };
  function teksRingkas() {
    const r = ringkasDraf(S.draf, S.awal);
    let peran = 0;
    S.draf.forEach((d, n) => { if (awalDari(n) === d.nomor) peran++; });
    const b = [];
    if (r.masuk) b.push(`${r.masuk} masuk`);
    if (r.keluar) b.push(`${r.keluar} keluar`);
    if (r.dipindah) b.push(`${r.dipindah} dipindah`);
    if (peran) b.push(`${peran} peran`);
    return b.join(' · ');
  }
  const muatanSimpan = () => [...S.draf].map(([nisn, d]) => ({ nisn, nomor_kamar: d.nomor, mudabbir: !!d.mudabbir && d.nomor != null }));
  function peringatanSemua() {
    let n = 0;
    S.kamar.forEach((k) => { for (const d of S.draf.values()) if (d.nomor === k.nomor) { n += periksaDraf({ draf: S.draf, awal: S.awal, kamar: k, santri: S.santri }).length; break; } });
    return n;
  }

  /* ---------- potongan HTML ---------- */
  function kosongHtml(judul, sub, tombol) {
    return `<div class="pk-kosong">${R().pikto('ranjang', 'pk-pikto')}<h3>${e(judul)}</h3><p>${e(sub)}</p>${tombol
      ? `<button type="button" class="btn btn-primary pk-tombol" data-pk="kamar-baru">+ ${e(ist('kamar'))}</button>` : ''}</div>`;
  }
  function pintu(k) {
    const h = isiKamar(k);
    const kap = k.kapasitas == null ? null : Number(k.kapasitas);
    const penuhKini = kap != null && h.sesudah >= kap;
    const isi = kap ? Math.min(100, Math.round((h.sesudah / kap) * 100)) : (h.sesudah ? 50 : 0);
    const ang = k.dominan ? `Angkatan ${k.dominan}` : (k.penghuni_n ? 'Campur' : 'Kosong');
    const draf = [...S.draf.values()].some((d) => d.nomor === k.nomor) || S.santri.some((x) => awalDari(x.nisn) === k.nomor && kini(x.nisn) !== k.nomor);
    return `<button type="button" class="pk-pintu${penuhKini ? ' penuh' : ''}${draf ? ' ada-draf' : ''}" data-pk="buka" data-id="${e(k.id)}" data-nomor="${e(k.nomor)}"
      aria-label="${e(labelKamar(k.nomor))}, ${e(ang)}, terisi ${h.sesudah}${kap != null ? ` dari ${kap}` : ''}${penuhKini ? ', penuh' : ''}">
      <span class="pk-plakat"><span class="pk-nomor">${e(k.nomor)}</span></span>
      <span class="pk-meta"><span>${h.sesudah}/${kap == null ? '–' : kap}</span><small>${e(ang)}</small></span>
      <span class="pk-isi" style="--isi:${isi}%" aria-hidden="true"></span>
      ${penuhKini ? '<span class="pk-penuh">Penuh</span>' : ''}</button>`;
  }
  function koridor(daftar) {
    const peta = new Map();
    daftar.forEach((k) => { const kunci = k.lantai == null ? '' : String(k.lantai); if (!peta.has(kunci)) peta.set(kunci, []); peta.get(kunci).push(k); });
    const urut = [...peta.keys()].sort((a, b) => {
      if (a === '' || b === '') return a === '' ? 1 : -1;
      const na = /^\d+$/.test(a), nb = /^\d+$/.test(b);
      return na && nb ? Number(a) - Number(b) : na ? -1 : nb ? 1 : a.localeCompare(b, 'id');
    });
    return urut.map((l) => `<div class="pk-lantai-baris"><div class="pk-lantai">${e(labelLantai(l))}</div>
      <div class="pk-koridor">${peta.get(l).map(pintu).join('')}</div></div>`).join('');
  }
  function lorongHtml() {
    if (!S.kamar.length) return kosongHtml(`Belum ada ${ist('kamar').toLowerCase()} di unit ini`, `Tambahkan ${ist('kamar').toLowerCase()} pertama agar santri bisa ditempatkan.`, true);
    const g = urutkanKamar(S.kamar, S.data.angkatan_binaan);
    const bagian = [['rekomendasi', 'Cocok untuk santri Anda'], ['kosong', `${ist('kamar')} kosong`], ['mudabbir', 'Dijaga mudabbir']];
    if (S.semua) bagian.push(['lainnya', `${ist('kamar')} lain`], ['penuh', 'Penuh']);
    const sisa = g.lainnya.length + g.penuh.length;
    const n = nBelumBerkamar();
    return `<div class="pk-ringkas"><p><b>${n}</b> santri binaan belum berkamar</p>
        <button type="button" class="btn btn-ghost pk-tombol" data-pk="kamar-baru">+ ${e(ist('kamar'))}</button></div>
      ${bagian.filter(([k]) => g[k].length).map(([k, j]) => `<section class="pk-grup" data-grup="${k}"><h3 class="pk-judul">${e(j)}</h3>${koridor(g[k])}</section>`).join('')}
      ${!S.semua && sisa ? `<button type="button" class="btn btn-ghost pk-tombol pk-semua" data-pk="semua">Lihat semua ${e(ist('kamar').toLowerCase())} (${sisa} lagi)</button>` : ''}`;
  }

  function kepalaHtml(k) {
    const h = isiKamar(k);
    const kap = k.kapasitas == null ? null : Number(k.kapasitas);
    const isi = kap ? Math.min(100, Math.round((h.sesudah / kap) * 100)) : 0;
    return `<button type="button" class="btn btn-ghost pk-tombol pk-kembali" data-pk="kembali">&larr; Semua ${e(ist('kamar').toLowerCase())}</button>
      <div class="pk-plakat besar"><span class="pk-nomor">${e(k.nomor)}</span></div>
      <div class="pk-judul-kamar"><h3>${e(labelKamar(k.nomor))}</h3>
        <p>${e([k.lantai ? labelLantai(String(k.lantai)) : '', k.dominan ? `Angkatan ${k.dominan}` : 'Belum ada angkatan dominan'].filter(Boolean).join(' · '))}</p></div>
      <div class="pk-meter" aria-label="Terisi ${h.sesudah}${kap != null ? ` dari ${kap}` : ''}"><b>${h.sesudah}/${kap == null ? '–' : kap}</b><span class="pk-isi" style="--isi:${isi}%"></span></div>`;
  }

  function ranjangHtml(k) {
    const h = isiKamar(k);
    const kap = k.kapasitas == null ? null : Number(k.kapasitas);
    const total = Math.max(kap == null ? h.sesudah + 4 : kap, h.sesudah + h.keluar.length);
    const sel = [];
    h.lain.forEach((p) => sel.push(`<span class="pk-ranjang terisi terkunci" title="Dikelola musyrif lain">${avatar(p.nisn, p.nama)}<span class="pk-nm">${e(p.nama)}</span><small>${e(p.kelas || '')}</small></span>`));
    for (let i = 0; i < h.anon; i++) sel.push('<span class="pk-ranjang terisi anonim" role="img" aria-label="Terisi (penghuni kelas lain)"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.4"/><path d="M5 20c.6-4 3.4-6 7-6s6.4 2 7 6"/></svg></span>');
    h.tetap.forEach((x) => sel.push(`<button type="button" class="pk-ranjang terisi tetap" data-pk="keluar" data-nisn="${e(x.nisn)}" aria-pressed="false" aria-label="Keluarkan ${e(x.nama)}">${avatar(x.nisn, x.nama)}<span class="pk-nm">${e(x.nama)}</span><small>${S.awalMud.get(x.nisn) ? 'Mudabbir' : e(x.kelas || '')}</small></button>`));
    h.keluar.forEach((x) => sel.push(`<button type="button" class="pk-ranjang keluar" data-pk="keluar" data-nisn="${e(x.nisn)}" aria-pressed="true" aria-label="Batalkan keluar ${e(x.nama)}">${avatar(x.nisn, x.nama)}<span class="pk-nm">${e(x.nama)}</span><small>Keluar</small></button>`));
    h.masuk.forEach((x) => sel.push(`<button type="button" class="pk-ranjang terisi baru" data-pk="batal" data-nisn="${e(x.nisn)}" aria-label="Batalkan masuk ${e(x.nama)}">${avatar(x.nisn, x.nama)}<span class="pk-nm">${e(x.nama)}</span><small>Baru</small></button>`));
    while (sel.length < total) sel.push('<span class="pk-ranjang kosong" aria-hidden="true"></span>');
    return `<div class="pk-ranjang-kisi" role="group" aria-label="Denah ${e(labelKamar(k.nomor))}">${sel.map((x, i) => x.replace('class="pk-ranjang', `data-r="${String(i + 1).padStart(2, '0')}" class="pk-ranjang`)).join('')}</div>`;
  }
  function mudabbirHtml(k) {
    if (!ANGKATAN_MUDABBIR.includes(k.dominan)) return '';
    const h = isiKamar(k);
    const kandidat = h.tetap.concat(h.masuk).filter((x) => x.angkatan === 'XI');
    if (!kandidat.length) return '';
    return `<div class="pk-mud-daftar">${kandidat.map((x) => `<label class="sp-sakelar pk-mud" data-nisn="${e(x.nisn)}"><input type="checkbox" data-pk="mudabbir" data-nisn="${e(x.nisn)}" ${mudKini(x.nisn) ? 'checked' : ''}>
      <span class="sp-sakelar-trek" aria-hidden="true"></span><span>Mudabbir (penjaga ${e(ist('kamar').toLowerCase())}): ${e(x.nama)}</span></label>`).join('')}</div>`;
  }
  function peringatanHtml(k) {
    const w = periksaDraf({ draf: S.draf, awal: S.awal, kamar: k, santri: S.santri });
    if (!w.length) return '';
    return `<ul class="pk-peringatan" aria-label="Peringatan, tidak memblokir">${w.map((x) => `<li data-jenis="${x.jenis}">${e(x.teks)}</li>`).join('')}</ul>`;
  }
  function daftarHtml(k) {
    const q = S.cari.trim().toLowerCase();
    const cocok = (x) => (!S.kelas || x.kelas === S.kelas) && (!q || `${x.nama} ${x.kelas}`.toLowerCase().includes(q));
    const baris = (x, lain) => {
      const a = awalDari(x.nisn), nk = kini(x.nisn), di = nk === k.nomor;
      const st = di ? 'Di sini' : (nk !== a ? `Draf: ${nk == null ? 'keluar' : labelKamar(nk)}` : (lain ? labelKamar(a) : ''));
      return `<li><button type="button" class="pk-santri${di ? ' dipilih' : ''}" data-pk="masuk" data-nisn="${e(x.nisn)}" aria-pressed="${di}">${avatar(x.nisn, x.nama)}
        <span class="pk-sn"><b>${e(x.nama)}</b><small>${e(x.kelas || 'Kelas tidak diketahui')}</small></span><span class="pk-st">${e(lain && !di && nk === a ? labelKamar(a) : st)}</span></button></li>`;
    };
    const belum = S.santri.filter((x) => awalDari(x.nisn) == null && cocok(x)).sort((a, b) => String(a.nama).localeCompare(String(b.nama), 'id'));
    const lain = S.santri.filter((x) => { const a = awalDari(x.nisn); return a != null && a !== k.nomor && cocok(x); })
      .sort((a, b) => (awalDari(a.nisn) - awalDari(b.nisn)) || String(a.nama).localeCompare(String(b.nama), 'id'));
    const adaFilter = !!(q || S.kelas);
    return `<h4 class="pk-sub">Belum berkamar <b>${belum.length}</b></h4>
      ${belum.length ? `<ul class="pk-daftar">${belum.map((x) => baris(x, false)).join('')}</ul>` : `<p class="pk-info">${adaFilter ? 'Tidak ada yang cocok.' : 'Semua santri binaan sudah berkamar.'}</p>`}
      ${lain.length ? `<div class="pk-lain"><h4 class="pk-sub">Berkamar di tempat lain <b>${lain.length}</b></h4><ul class="pk-daftar">${lain.map((x) => baris(x, true)).join('')}</ul></div>` : ''}`;
  }
  function bilahHtml() {
    const t = teksRingkas();
    if (!S.draf.size) return '';
    const w = peringatanSemua();
    return `<div class="pk-bilah" role="region" aria-label="Simpan penempatan">
      ${S.galat ? `<p class="pk-galat" role="alert">${e(S.galat)}</p>` : ''}
      <div class="pk-bilah-isi"><span class="pk-ringkas-teks" aria-hidden="true">${e(t)}${w ? ` <em>· ${w} peringatan</em>` : ''}</span>
        <button type="button" class="btn btn-ghost pk-tombol" data-pk="buang"${S.menyimpan ? ' disabled' : ''}>Batal</button>
        <button type="button" class="btn btn-primary pk-tombol" data-pk="simpan"${S.menyimpan ? ' disabled aria-busy="true"' : ''}>${S.menyimpan ? 'Menyimpan…' : 'Simpan penempatan'}</button></div></div>`;
  }

  /* ---------- render ---------- */
  function jagaFokus(fn) {
    const a = document.activeElement;
    const kunci = a && S.akar.contains(a) && a.dataset && a.dataset.pk ? [a.dataset.pk, a.dataset.nisn || ''] : null;
    fn();
    if (kunci) { const t = S.akar.querySelector(`[data-pk="${kunci[0]}"]${kunci[1] ? `[data-nisn="${CSS.escape(kunci[1])}"]` : ''}`); if (t) t.focus({ preventScroll: true }); }
  }
  function setLive() {
    const l = S.akar.querySelector('.pk-live');
    if (l && l.textContent !== teksRingkas()) l.textContent = teksRingkas();
  }
  function segarkan() {
    jagaFokus(() => {
      const bil = S.akar.querySelector('#pkBilah');
      if (bil) bil.innerHTML = bilahHtml();
      if (S.buka != null) {
        const k = S.kamarPeta.get(S.buka);
        if (k) {
          const set = (id, h) => { const el = S.akar.querySelector(id); if (el) el.innerHTML = h; };
          set('#pkKepala', kepalaHtml(k));
          set('#pkDenahIsi', ranjangHtml(k) + mudabbirHtml(k) + peringatanHtml(k));
          set('#pkDaftarIsi', daftarHtml(k));
        }
      }
      setLive();
    });
  }
  function kepalaUnit() {
    const u = (S.data.unit || []).find((x) => x.id === S.unitId) || {};
    const pilih = (S.data.unit || []).length > 1
      ? `<label class="pk-unit-pilih"><span class="sr-only">Unit</span><select id="pkUnit" aria-label="Unit">${S.data.unit.map((x) => `<option value="${e(x.id)}"${x.id === S.unitId ? ' selected' : ''}>${e(x.nama)}</option>`).join('')}</select></label>`
      : `<p class="pk-unit">${e(u.nama || '')}</p>`;
    return pilih;
  }
  function gambar() {
    const a = S.akar;
    if (!S.unitId) {
      a.innerHTML = `<div class="pk-akar">${kosongHtml(`Belum ada ${ist('unit').toLowerCase()} untuk Anda`,
        `Penempatan tersedia setelah ada ${ist('unit').toLowerCase()} ${ist('asrama').toLowerCase()} dengan santri binaan Anda. Hubungi pengelola bila ini keliru.`, false)}<div class="pk-live" role="status" aria-live="polite"></div></div>`;
      return;
    }
    let isi;
    if (S.buka != null && S.kamarPeta.get(S.buka)) {
      const k = S.kamarPeta.get(S.buka);
      isi = `<section class="pk-denah" aria-label="Denah ${e(labelKamar(k.nomor))}"><header class="pk-denah-kepala" id="pkKepala" tabindex="-1">${kepalaHtml(k)}</header>
        <div class="pk-badan"><div class="pk-kolom-denah" id="pkDenahIsi">${ranjangHtml(k)}${mudabbirHtml(k)}${peringatanHtml(k)}</div>
          <div class="pk-kolom-daftar"><div class="pk-cari"><input id="pkCari" type="search" value="${e(S.cari)}" placeholder="Cari nama atau kelas" aria-label="Cari santri" autocomplete="off">
            ${kelasChip()}</div><div id="pkDaftarIsi">${daftarHtml(k)}</div></div></div></section>`;
    } else { S.buka = null; isi = lorongHtml(); }
    a.innerHTML = `<div class="pk-akar">${S.buka == null ? kepalaUnit() : ''}${isi}<div class="pk-live" role="status" aria-live="polite"></div><div id="pkBilah">${bilahHtml()}</div></div>`;
    setLive();
  }
  function kelasChip() {
    const kelas = [...new Set(S.santri.map((x) => x.kelas).filter(Boolean))].sort((x, y) => String(x).localeCompare(String(y), 'id', { numeric: true }));
    if (kelas.length < 2) return '';
    return `<div class="pk-chip-baris" role="group" aria-label="Saring kelas">${kelas.map((c) => `<button type="button" class="pk-chip${S.kelas === c ? ' aktif' : ''}" data-pk="kelas" data-kelas="${e(c)}" aria-pressed="${S.kelas === c}">${e(c)}</button>`).join('')}</div>`;
  }

  /* ---------- gerak (tiga momen; hanya transform/opacity; mati pada kurangi-gerak, hemat, tenang) ---------- */
  const NAMA = new Set();
  const GERAK = { jalan: null };
  /** Beri nama transisi sementara; dilepas otomatis saat transisi selesai. Dipanggil dari `sebelum`/`sesudah`. */
  function namai(el, nama) { if (!el) return; el.style.viewTransitionName = nama; NAMA.add(el); }
  function lepasNama() { NAMA.forEach((el) => { el.style.viewTransitionName = ''; }); NAMA.clear(); }
  function gerakBoleh() {
    const h = document.documentElement;
    return typeof document.startViewTransition === 'function' && typeof bolehGerak === 'function' && bolehGerak()
      && !h.classList.contains('hemat') && !h.classList.contains('tenang') && !document.hidden
      && !matchMedia('(prefers-reduced-motion: reduce)').matches && !GERAK.jalan
      && !(typeof VT !== 'undefined' && VT.jalan) && !document.querySelector('.swal2-container.swal2-backdrop-show');
  }
  /** Jalankan `perbarui` dengan View Transition bila aman; bila tidak, langsung (tampilan tetap berganti benar). */
  async function gerakAman(perbarui, opsi) {
    const o = opsi || {};
    if (!gerakBoleh()) { await perbarui(); return; }
    let galat = null, vt;
    try {
      if (o.sebelum) o.sebelum();
      document.documentElement.dataset.pkVt = '1';
      vt = document.startViewTransition(async () => {
        try { await perbarui(); if (o.sesudah) o.sesudah(); } catch (err) { galat = err; throw err; }
      });
    } catch (err) {
      lepasNama(); delete document.documentElement.dataset.pkVt;
      await perbarui(); return;
    }
    GERAK.jalan = vt;
    const selesai = () => { lepasNama(); delete document.documentElement.dataset.pkVt; if (GERAK.jalan === vt) GERAK.jalan = null; };
    vt.finished.then(selesai, selesai);
    try { await vt.updateCallbackDone; } catch (err) { /* galat asli dilempar ulang di bawah */ }
    if (galat) throw galat;
  }

  /* ---------- aksi ---------- */
  function bukaKamar(nomor) {
    S.buka = nomor; S.cari = ''; S.kelas = ''; S.galat = '';
    gambar();
    const kepala = S.akar.querySelector('#pkKepala');
    if (kepala) { kepala.focus({ preventScroll: true }); kepala.scrollIntoView({ block: 'start' }); }
  }
  function kembaliKeLorong() {
    S.buka = null; gambar();
    const a = S.akar.querySelector('.pk-akar'); if (a) a.scrollIntoView({ block: 'start' });
  }
  function ketukSantri(nisn) {
    const k = S.kamarPeta.get(S.buka); if (!k || !S.peta.has(nisn)) return;
    if (kini(nisn) === k.nomor) setDraf(nisn, awalDari(nisn), !!S.awalMud.get(nisn));
    else setDraf(nisn, k.nomor, false);
    S.galat = ''; segarkan();
  }
  function ketukKeluar(nisn) {
    if (!S.peta.has(nisn)) return;
    if (S.draf.has(nisn) && S.draf.get(nisn).nomor == null) setDraf(nisn, awalDari(nisn), !!S.awalMud.get(nisn));
    else setDraf(nisn, null, false);
    S.galat = ''; segarkan();
  }
  async function simpan() {
    if (S.menyimpan || !S.draf.size) return;
    S.menyimpan = true; S.galat = ''; segarkan();
    const teks = teksRingkas();
    try {
      await R().rpc('sarpras_penempatan_simpan', { p: { unit_id: S.unitId, perubahan: muatanSimpan() } });
    } catch (err) {
      console.error(err);
      S.menyimpan = false; S.galat = R().galatTeks(err) || 'Penempatan belum tersimpan. Coba lagi.'; segarkan();
      return;
    }
    S.menyimpan = false;
    try { cacheHapus('siswa', 'petaSiswa', 'kelas', 'detail'); } catch (err) { console.error(err); }
    tandaTerima({ nada: 'catat', judul: 'Penempatan tersimpan', sub: teks });
    let baru = null;
    try { baru = await muatData(S.unitId); } catch (err) { console.error(err); S.galat = R().galatTeks(err); }
    await gerakAman(() => { S.draf.clear(); S.buka = null; if (baru) siapkan(baru, false); gambar(); },
      { sebelum: () => namai(S.akar.querySelector('.pk-bilah'), 'pk-bilah') });
    R().sesudahPenempatan(nBelumBerkamar());
  }
  async function dialogKamarBaru() {
    const r = await Swal.fire({
      title: `Tambah ${ist('kamar').toLowerCase()}`,
      html: `<div class="pk-form"><label for="pkNomor">Nomor</label><input id="pkNomor" class="swal2-input" type="number" inputmode="numeric" min="1" max="999" step="1" value="${e(S.data.nomor_berikut || 1)}">
        <label for="pkLantai">${e(ist('lantai'))} <small>(boleh kosong)</small></label><input id="pkLantai" class="swal2-input" type="text" maxlength="20" inputmode="text" autocomplete="off">
        <label for="pkKap">Kapasitas</label><select id="pkKap" class="swal2-select"><option value="16" selected>16 tempat tidur</option><option value="24">24 tempat tidur</option></select></div>`,
      showCancelButton: true, confirmButtonText: 'Tambah', cancelButtonText: 'Batal', confirmButtonColor: warna('--sea', '#14618B'),
      showLoaderOnConfirm: true, focusConfirm: false, allowOutsideClick: () => !Swal.isLoading(),
      preConfirm: async () => {
        const nomor = Number(document.getElementById('pkNomor').value);
        if (!Number.isInteger(nomor) || nomor < 1 || nomor > 999) { Swal.showValidationMessage('Nomor 1 sampai 999.'); return false; }
        const lantai = document.getElementById('pkLantai').value.trim();
        const p = { unit_id: S.unitId, nomor, ...(lantai ? { lantai } : {}), kapasitas: Number(document.getElementById('pkKap').value) };
        try { return await R().rpc('sarpras_kamar_tambah', { p }); }
        catch (err) { Swal.showValidationMessage(R().galatTeks(err) || 'Belum bisa menambah. Coba lagi.'); return false; }
      }
    });
    if (!r.isConfirmed || !r.value) return;
    const nomor = Number(r.value.nomor);
    tandaTerima({ nada: 'akui', judul: `${labelKamar(nomor)} ditambahkan` });
    try { siapkan(await muatData(S.unitId), true); } catch (err) { console.error(err); S.galat = R().galatTeks(err); }
    S.buka = S.kamarPeta.has(nomor) ? nomor : null;
    gambar();
  }
  /* v2.76 (tinjauan akhir, I5): perubahan yang belum disimpan tidak boleh hilang diam-diam saat ganti unit atau pindah tab. */
  const adaDraf = () => !!(S && S.draf && S.draf.size && S.akar && S.akar.isConnected);
  async function tanyaBuang() {
    if (!adaDraf()) return true;
    const r = await Swal.fire({ icon: 'warning', title: 'Buang perubahan?', text: `Penempatan yang belum disimpan (${teksRingkas()}) akan hilang.`,
      showCancelButton: true, confirmButtonText: 'Buang', cancelButtonText: 'Tetap di sini', reverseButtons: true });
    return !!(r && r.isConfirmed);
  }
  async function gantiUnit(id) {
    if (S.draf.size && !(await tanyaBuang())) { gambar(); return; }
    try { const d = await muatData(id); S.buka = null; S.semua = false; S.galat = ''; siapkan(d, false); } catch (err) { console.error(err); S.galat = R().galatTeks(err); }
    gambar();
  }

  function pasang(akar) {
    if (akar._pkKlik) { akar.removeEventListener('click', akar._pkKlik); akar.removeEventListener('change', akar._pkUbah); akar.removeEventListener('input', akar._pkMasuk); }
    akar._pkKlik = (ev) => {
      const t = ev.target.closest && ev.target.closest('[data-pk]');
      if (!t || !akar.contains(t) || t.tagName === 'INPUT') return;
      const a = t.dataset.pk;
      if (S.menyimpan && a !== 'simpan') return;   // I3: draf sedang dikirim; ketukan baru tidak boleh hilang diam-diam
      if (a === 'buka') {
        const n = Number(t.dataset.nomor), plakat = t.querySelector('.pk-plakat');
        gerakAman(() => bukaKamar(n), { sebelum: () => namai(plakat, 'pk-plakat'), sesudah: () => namai(S.akar.querySelector('.pk-plakat.besar'), 'pk-plakat') });
      }
      else if (a === 'kembali') kembaliKeLorong();
      else if (a === 'semua') { S.semua = true; gambar(); }
      else if (a === 'masuk') {
        const nisn = t.dataset.nisn, k = S.kamarPeta.get(S.buka);
        if (k && kini(nisn) !== k.nomor) {   // hanya saat masuk: avatar terbang ke ranjang
          const av = t.querySelector('.pk-avatar');
          gerakAman(() => ketukSantri(nisn), { sebelum: () => namai(av, 'pk-terbang'),
            sesudah: () => namai(S.akar.querySelector(`.pk-ranjang.baru[data-nisn="${CSS.escape(nisn)}"] .pk-avatar`), 'pk-terbang') });
        } else ketukSantri(nisn);
      }
      else if (a === 'keluar') ketukKeluar(t.dataset.nisn);
      else if (a === 'batal') { setDraf(t.dataset.nisn, awalDari(t.dataset.nisn), !!S.awalMud.get(t.dataset.nisn)); segarkan(); }
      else if (a === 'simpan') simpan();
      else if (a === 'buang') { S.draf.clear(); S.galat = ''; gambar(); }
      else if (a === 'kamar-baru') dialogKamarBaru();
      else if (a === 'kelas') { S.kelas = S.kelas === t.dataset.kelas ? '' : t.dataset.kelas; gambar(); }
    };
    akar._pkUbah = (ev) => {
      const t = ev.target;
      if (S.menyimpan) { if (t.id === 'pkUnit') gambar(); return; }
      if (t.id === 'pkUnit') gantiUnit(t.value);
      else if (t.dataset && t.dataset.pk === 'mudabbir') { setDraf(t.dataset.nisn, kini(t.dataset.nisn), t.checked); segarkan(); }
    };
    akar._pkMasuk = (ev) => {
      if (ev.target.id !== 'pkCari') return;
      S.cari = ev.target.value;
      const k = S.kamarPeta.get(S.buka);
      const el = akar.querySelector('#pkDaftarIsi');
      if (k && el) el.innerHTML = daftarHtml(k);
    };
    akar.addEventListener('click', akar._pkKlik);
    akar.addEventListener('change', akar._pkUbah);
    akar.addEventListener('input', akar._pkMasuk);
  }

  /** Buka layar Penempatan di `akar`. `opsi.data` = hasil sarpras_penempatan_data yang sudah dimuat pemanggil. */
  async function buka(akar, opsi) {
    S = { akar, semua: false, buka: null, cari: '', kelas: '', menyimpan: false, galat: '', draf: new Map() };
    pasang(akar);
    let d = opsi && opsi.data;
    try { if (!d) d = await muatData(null); }
    catch (err) {
      console.error(err);
      akar.innerHTML = `<div class="pk-akar">${kosongHtml('Penempatan belum bisa dimuat', R().galatTeks(err), false)}</div>`;
      return;
    }
    siapkan(d, false);
    gambar();
  }

  window.RQPenempatan = { buka, adaDraf, tanyaBuang, _uji: { urutkanKamar, periksaDraf, ringkasDraf, gerakAman } };
})();
