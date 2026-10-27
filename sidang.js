/* =====================================================================
 * sidang.js — v2.64 · RUANG SIDANG TA'DIB (Majelis OSDA)
 * ---------------------------------------------------------------------
 *  Halaman layar penuh yang terpisah dari kerangka aplikasi (bilah sisi,
 *  bilah atas, dan tab bawah disembunyikan). Dimuat lambat oleh app.js
 *  hanya ketika menu "Ruang Sidang Ta'dib" dibuka.
 *
 *  ALUR MAJELIS (OSDA; Admin boleh ikut memutus)
 *    1 Bidang    → disarankan sistem: bidang dengan perkara terbanyak
 *    2 Kategori  → Ringan / Sedang (Berat = otonomi musyrif, tidak tampil)
 *    3 Tahap     → pengulangan ke-n, lengkap dengan bentuk pembinaannya
 *    4 Putusan   → daftar santri + bentuk pembinaan (isi tabel pembinaan)
 *    Bacakan     → layar pembacaan putusan satu per satu, palu diketuk
 *    Diberikan   → laporan terkirim ke musyrif kelas (alur Ustadz GEN-Z);
 *                  musyrif menekan "Sahkan Selesai" → tuntas.
 *
 *  Batas sesungguhnya ada di database (migrasi v2.64): RPC sidang_* hanya
 *  melayani Ringan/Sedang angkatan VII–X, unit OSDA dari korps, dan hari
 *  Senin/Rabu/Jumat/Sabtu (WIB). Halaman ini hanya menampilkan & meminta.
 *
 *  Gerak: hanya transform & opacity (CSS). "Kurangi gerak" → tanpa tirai
 *  dan tanpa ayunan palu. Bunyi palu (WebAudio, tanpa berkas) bisa
 *  dimatikan dan selalu mati di mode hemat.
 *
 *  Satu-satunya pintu ke aplikasi: window.RQ_SIDANG (app.js v2.64).
 * ===================================================================== */
(function () {
  'use strict';
  if (window.RQSidang) return;
  const A = window.RQ_SIDANG;
  if (!A) return;

  const esc = A.esc;
  const angka = (n) => Number(n || 0).toLocaleString('id-ID');
  const HARI = ['Ahad', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  const HARI_SIDANG = [1, 3, 5, 6];   // ISO: Senin, Rabu, Jumat, Sabtu — sama dengan sidang_hari() di database
  const URUT_STATUS = { menunggu: 0, dibacakan: 1, diberikan: 2, tuntas: 3 };
  const LABEL_STATUS = { menunggu: 'Menunggu sidang', dibacakan: 'Sudah dibacakan', diberikan: 'Di tangan musyrif', tuntas: 'Tuntas' };
  const AYAT = 'وَإِذَا حَكَمْتُمْ بَيْنَ النَّاسِ أَنْ تَحْكُمُوا بِالْعَدْلِ';

  const S = {
    akar: null, data: null, unit: null, token: 0, sibuk: false, galat: '',
    bidang: '', kategori: '', tahap: null, pilih: new Set(), cari: '',
    tampil: 'aktif',             // 'aktif' (menunggu+dibacakan) | 'semua'
    bubble: '', ekspresi: 'normal', baca: null, histori: false
  };

  /* ---------- tanggal (WIB) ---------- */
  const tglObj = (k) => new Date(String(k).slice(0, 10) + 'T12:00:00+07:00');
  const isoDow = (k) => { const d = tglObj(k).getUTCDay(); return d === 0 ? 7 : d; };
  function labelHari(k, panjang) {
    if (!k) return '-';
    const d = tglObj(k);
    const h = HARI[d.getUTCDay()], t = d.getUTCDate(), b = BULAN[d.getUTCMonth()];
    return panjang ? `${h}, ${t} ${b} ${d.getUTCFullYear()}` : `${h}, ${t} ${b.slice(0, 3)}`;
  }
  /** Tanggal WIB 'YYYY-MM-DD' dari cap waktu server (yang dikirim dalam UTC). */
  const kunciWib = (ts) => { try { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date(ts)); } catch (e) { return String(ts || '').slice(0, 10); } };
  const labelTgl = (k) => { if (!k) return '-'; const d = tglObj(k); return `${d.getUTCDate()} ${BULAN[d.getUTCMonth()].slice(0, 3)}`; };
  const jamWib = (ts) => { try { return new Date(ts).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' }); } catch (e) { return ''; } };
  const jadwalTeks = () => HARI_SIDANG.map(i => HARI[i % 7]).join(', ').replace(/, ([^,]+)$/, ' dan $1');

  /* ---------- gerak & bunyi ---------- */
  const bolehGerak = () => !A.kurangGerak();
  const bunyiAktif = () => { try { return localStorage.getItem('rq-sidang-bunyi') !== 'mati'; } catch (e) { return true; } };
  let audio = null;
  function ketukBunyi(kali = 1) {
    if (!bunyiAktif() || A.hemat()) return;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      const t0 = audio.currentTime + .01;
      for (let i = 0; i < kali; i++) {
        const t = t0 + i * .32;
        // badan kayu: sinus rendah yang cepat padam
        const o = audio.createOscillator(), g = audio.createGain();
        o.type = 'sine'; o.frequency.setValueAtTime(190, t); o.frequency.exponentialRampToValueAtTime(95, t + .12);
        g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.55, t + .004); g.gain.exponentialRampToValueAtTime(.0001, t + .18);
        o.connect(g).connect(audio.destination); o.start(t); o.stop(t + .2);
        // ketukan: derau pendek tersaring
        const n = Math.floor(audio.sampleRate * .05), buf = audio.createBuffer(1, n, audio.sampleRate), x = buf.getChannelData(0);
        for (let j = 0; j < n; j++) x[j] = (Math.random() * 2 - 1) * Math.pow(1 - j / n, 3);
        const s = audio.createBufferSource(), f = audio.createBiquadFilter(), g2 = audio.createGain();
        s.buffer = buf; f.type = 'bandpass'; f.frequency.value = 1400; f.Q.value = 1.2; g2.gain.value = .5;
        s.connect(f).connect(g2).connect(audio.destination); s.start(t);
      }
    } catch (e) {}
  }
  /** Ayunkan palu `kali` kali (gerak + bunyi). Mengembalikan janji selesai. */
  function ketukPalu(kali = 1, akar) {
    ketukBunyi(kali);
    const svg = (akar || S.akar)?.querySelectorAll('.sd-hakim');
    if (!svg || !svg.length || !bolehGerak()) return Promise.resolve();
    svg.forEach(el => { el.style.setProperty('--ketuk', kali); el.classList.remove('ketuk'); void el.getBoundingClientRect(); el.classList.add('ketuk'); });
    return new Promise(ok => setTimeout(() => { svg.forEach(el => el.classList.remove('ketuk')); ok(); }, 320 * kali + 120));
  }

  /* =================================================================
   *  HAKIM — dua tokoh orisinal turunan Si Peci & Si Payung, bertoga
   *  hitam berbef putih dan berlis marun (toga sidang), memegang palu.
   *  Satu sumber cahaya: kanan atas. Ekspresi: data-ekspresi pada
   *  .sd-hakim → normal | serius | senang | tidur.
   * ================================================================= */
  function bagianToga(P, warnaLengan) {
    return `
    <path d="M30 140Q100 124 170 140L178 196H22Z" fill="url(#${P}Toga)"/>
    <path d="M30 140Q100 124 170 140" style="fill:none;stroke:#4B4466;stroke-width:1.4;opacity:.8"/>
    <path d="M88 132 78 196M112 132 122 196" style="fill:none;stroke:#8E1B32;stroke-width:8;stroke-linecap:round"/>
    <path d="M88 132 78 196M112 132 122 196" style="fill:none;stroke:#C2415B;stroke-width:1.4;opacity:.7"/>
    <path d="M60 150Q58 172 62 196M140 150Q142 172 138 196" style="fill:none;stroke:#000;stroke-width:1.4;opacity:.35"/>
    <path d="M92.5 130h15l-2.2 30h-10.6z" fill="#F7F8FC" stroke="#C9CCDA" stroke-width="1"/>
    <path d="M100 131v28" style="stroke:#C9CCDA;stroke-width:1"/>
    <circle cx="100" cy="171" r="5.4" fill="#E8CC6B" stroke="#A07F14" stroke-width="1"/>
    <path d="M97.4 171h5.2M100 168.4v5.2" style="stroke:#A07F14;stroke-width:1"/>
    <!-- lengan kiri bersandar di meja -->
    <ellipse cx="44" cy="164" rx="12" ry="19" transform="rotate(28 44 164)" fill="url(#${P}Toga)"/>
    <circle cx="36" cy="180" r="7.5" fill="${warnaLengan}"/>`;
  }
  function bagianPalu(P, warnaTangan) {
    // Digambar pada pose MENGETUK; CSS memutarnya ke pose terangkat (−52°) di poros bahu (160,132).
    return `
    <g class="sd-palu">
      <ellipse cx="169" cy="145" rx="10.5" ry="19" transform="rotate(-38 169 145)" fill="url(#${P}Toga)"/>
      <path d="M176 152 210 162" style="stroke:#6B3A1F;stroke-width:5;stroke-linecap:round"/>
      <path d="M176 151 209 160.6" style="stroke:#B07A45;stroke-width:1.4;stroke-linecap:round;opacity:.8"/>
      <g transform="translate(212 163) rotate(16)">
        <rect x="-8" y="-16" width="16" height="32" rx="5" fill="#5A2E16"/>
        <rect x="-8" y="-16" width="16" height="32" rx="5" fill="url(#${P}Kayu)"/>
        <rect x="-8.6" y="-9" width="17.2" height="3.2" fill="#E8CC6B"/><rect x="-8.6" y="6" width="17.2" height="3.2" fill="#E8CC6B"/>
      </g>
      <circle cx="178" cy="153" r="8" fill="${warnaTangan}"/>
    </g>`;
  }
  const bagianLandasan = (P) => `
    <ellipse class="sd-gema" cx="214" cy="184" rx="20" ry="6" style="fill:none;stroke:#F2C94C;stroke-width:2"/>
    <ellipse cx="214" cy="186" rx="17" ry="5.5" fill="#3A1D0E"/>
    <path d="M197 186v5q17 6 34 0v-5" fill="#5A2E16"/>
    <ellipse cx="214" cy="185" rx="17" ry="5.5" fill="url(#${P}Kayu)"/>`;
  const defsBersama = (P) => `
    <linearGradient id="${P}Toga" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#3A3458"/><stop offset=".45" stop-color="#1E1A31"/><stop offset="1" stop-color="#0E0C18"/>
    </linearGradient>
    <linearGradient id="${P}Kayu" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#C08552"/><stop offset=".5" stop-color="#8A4F26"/><stop offset="1" stop-color="#4E2810"/>
    </linearGradient>
    <linearGradient id="${P}Putih" x1="0" y1="0" x2="0" y2="1">
      <stop offset=".55" stop-color="#fff"/><stop offset="1" stop-color="#DCE8F3"/>
    </linearGradient>`;
  const tinta = '#1B1030';
  const garis = `fill:none;stroke:${tinta};stroke-width:3.2;stroke-linecap:round;stroke-linejoin:round`;

  function svgHakimPeci() {
    const P = 'sdP';
    return `<svg class="sd-hakim-svg" viewBox="0 0 236 196" aria-hidden="true" focusable="false">
    <defs>${defsBersama(P)}
      <radialGradient id="${P}Kulit" cx="68%" cy="26%" r="78%">
        <stop offset="0" stop-color="#B9E6FB"/><stop offset=".38" stop-color="#58B4E6"/>
        <stop offset=".8" stop-color="#2A7DB8"/><stop offset="1" stop-color="#1A5C8F"/>
      </radialGradient>
      <linearGradient id="${P}Peci" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#3B3656"/><stop offset=".55" stop-color="#1D1A2E"/><stop offset="1" stop-color="#0D0B17"/>
      </linearGradient>
      <radialGradient id="${P}Pupil" cx="42%" cy="38%" r="70%">
        <stop offset="0" stop-color="#5A4AA0"/><stop offset=".55" stop-color="#241646"/><stop offset="1" stop-color="#120A24"/>
      </radialGradient>
    </defs>
    <path d="M100 22C140 22 166 54 168 96C170 136 162 170 100 172C38 170 30 136 32 96C34 54 60 22 100 22Z" fill="url(#${P}Kulit)"/>
    <path d="M40 120C44 140 58 152 80 156" style="fill:none;stroke:#9ADCFB;stroke-width:2.6;stroke-linecap:round;opacity:.5"/>
    <path d="M64 38 49 17 71 28Z" fill="#FFE9B0"/><path d="M136 38 151 17 129 28Z" fill="#F6D98E"/>
    <ellipse cx="100" cy="44" rx="40" ry="7" fill="#0B3A5E" opacity=".3"/>
    <path d="M60 42C60 30 62 18 65.6 11.6Q100 3.2 134.4 11.6C138 18 140 30 140 42Q100 50.5 60 42Z" fill="url(#${P}Peci)"/>
    <ellipse cx="100" cy="11" rx="34" ry="4.8" fill="#403A5E"/>
    <path d="M61 38Q100 46 139 38" style="fill:none;stroke:#57507A;stroke-width:1.4;opacity:.7"/>
    <path d="M118 13 121 41" style="stroke:#fff;stroke-width:4;opacity:.08"/>
    <ellipse cx="141" cy="62" rx="9" ry="15" transform="rotate(28 141 62)" fill="#fff" opacity=".4"/>
    <ellipse cx="64" cy="106" rx="10" ry="5.6" fill="#FF7FAA" opacity=".45"/><ellipse cx="136" cy="106" rx="10" ry="5.6" fill="#FF7FAA" opacity=".45"/>
    <g class="e e-mata">
      <ellipse cx="80" cy="82" rx="15.5" ry="17" fill="url(#${P}Putih)"/><ellipse cx="120" cy="82" rx="15.5" ry="17" fill="url(#${P}Putih)"/>
      <ellipse cx="82" cy="85" rx="10" ry="11.4" fill="url(#${P}Pupil)"/><ellipse cx="122" cy="85" rx="10" ry="11.4" fill="url(#${P}Pupil)"/>
      <circle cx="86.4" cy="79.4" r="4.4" fill="#fff"/><circle cx="126.4" cy="79.4" r="4.4" fill="#fff"/>
      <circle cx="78" cy="90.6" r="2" fill="#fff" opacity=".9"/><circle cx="118" cy="90.6" r="2" fill="#fff" opacity=".9"/>
    </g>
    <g class="e e-alis"><path d="M63 60 92 67M137 60 108 67" style="${garis};stroke-width:4"/></g>
    <g class="e e-tidur"><path d="M66 84Q80 92 94 84M106 84Q120 92 134 84" style="${garis}"/></g>
    <g class="e e-senang-mata"><path d="M67 86Q80 70 93 86M107 86Q120 70 133 86" style="${garis};stroke-width:3.8"/></g>
    <g class="e e-mulut"><path d="M90 110Q95 115 100 110Q105 115 110 110" style="${garis}"/><path d="M94.6 112.4 96.4 116.4 98.2 113Z" fill="#fff"/></g>
    <g class="e e-mulut-serius"><path d="M90 113H110" style="${garis}"/></g>
    <g class="e e-mulut-senang"><path d="M86 107Q100 128 114 107Z" fill="#7A1235" stroke="${tinta}" stroke-width="2.6" stroke-linejoin="round"/><ellipse cx="100" cy="118" rx="6.4" ry="3.6" fill="#FF6F9F"/></g>
    <g class="e e-zzz" style="font:700 15px 'Inter Tight',system-ui,sans-serif;fill:#E8CC6B"><text x="150" y="40">z</text><text x="162" y="26" font-size="19">Z</text></g>
    ${bagianToga(P, '#3E97CE')}
    ${bagianLandasan(P)}
    ${bagianPalu(P, '#3E97CE')}
  </svg>`;
  }

  function svgHakimJilbab() {
    const P = 'sdJ';
    const bunga = (x, y, s, r) => `<use href="#${P}Bunga" transform="translate(${x} ${y}) rotate(${r}) scale(${s})"/>`;
    return `<svg class="sd-hakim-svg" viewBox="0 0 236 196" aria-hidden="true" focusable="false">
    <defs>${defsBersama(P)}
      <radialGradient id="${P}Kulit" cx="66%" cy="28%" r="80%">
        <stop offset="0" stop-color="#D2FBEA"/><stop offset=".4" stop-color="#7EE0BD"/>
        <stop offset=".82" stop-color="#3DB28C"/><stop offset="1" stop-color="#2A8C6D"/>
      </radialGradient>
      <radialGradient id="${P}Jilbab" cx="64%" cy="22%" r="85%">
        <stop offset="0" stop-color="#FFF6FA"/><stop offset=".45" stop-color="#FFD9E7"/>
        <stop offset=".85" stop-color="#F3A9C4"/><stop offset="1" stop-color="#E48AAE"/>
      </radialGradient>
      <radialGradient id="${P}Pupil" cx="42%" cy="38%" r="70%">
        <stop offset="0" stop-color="#6A4AA8"/><stop offset=".55" stop-color="#2A1650"/><stop offset="1" stop-color="#140A28"/>
      </radialGradient>
      <g id="${P}Bunga">
        <g fill="#F7A6C3">
          <path d="M0-1C-2-4-2.4-7 0-8.6C2.4-7 2-4 0-1Z"/><path d="M0-1C-2-4-2.4-7 0-8.6C2.4-7 2-4 0-1Z" transform="rotate(72)"/>
          <path d="M0-1C-2-4-2.4-7 0-8.6C2.4-7 2-4 0-1Z" transform="rotate(144)"/><path d="M0-1C-2-4-2.4-7 0-8.6C2.4-7 2-4 0-1Z" transform="rotate(216)"/>
          <path d="M0-1C-2-4-2.4-7 0-8.6C2.4-7 2-4 0-1Z" transform="rotate(288)"/>
        </g><circle r="1.9" fill="#E0578A"/><circle r=".8" fill="#FFE08A"/>
      </g>
    </defs>
    <path d="M100 18C146 18 168 54 168 96C168 118 172 134 177 146Q100 166 23 146C28 134 32 118 32 96C32 54 54 18 100 18Z" fill="url(#${P}Jilbab)"/>
    <path d="M38 132Q100 154 162 132" style="fill:none;stroke:#E28DB0;stroke-width:2;opacity:.8"/>
    <ellipse cx="135" cy="40" rx="7" ry="13" transform="rotate(34 135 40)" fill="#fff" opacity=".6"/>
    <ellipse cx="100" cy="90" rx="44" ry="39" fill="url(#${P}Kulit)"/>
    <ellipse cx="100" cy="90" rx="46.2" ry="41.2" style="fill:none;stroke:#fff;stroke-width:2.6;stroke-dasharray:3 2.6;opacity:.85"/>
    <ellipse cx="100" cy="90" rx="48.5" ry="43.5" style="fill:none;stroke:#D97BA2;stroke-width:1.4;opacity:.55"/>
    <ellipse cx="129" cy="72" rx="5.4" ry="8" transform="rotate(30 129 72)" fill="#fff" opacity=".35"/>
    <ellipse cx="70" cy="104" rx="9.4" ry="5.2" fill="#FF7FAA" opacity=".5"/><ellipse cx="130" cy="104" rx="9.4" ry="5.2" fill="#FF7FAA" opacity=".5"/>
    <g class="e e-mata">
      <ellipse cx="83" cy="86" rx="13.6" ry="15.2" fill="url(#${P}Putih)"/><ellipse cx="117" cy="86" rx="13.6" ry="15.2" fill="url(#${P}Putih)"/>
      <ellipse cx="84.6" cy="89" rx="9" ry="10.4" fill="url(#${P}Pupil)"/><ellipse cx="118.6" cy="89" rx="9" ry="10.4" fill="url(#${P}Pupil)"/>
      <circle cx="88.6" cy="83.8" r="4" fill="#fff"/><circle cx="122.6" cy="83.8" r="4" fill="#fff"/>
      <circle cx="81" cy="94" r="1.8" fill="#fff" opacity=".9"/><circle cx="115" cy="94" r="1.8" fill="#fff" opacity=".9"/>
      <path d="M70 78 65 74M72 73.6 69 69M130 78 135 74M128 73.6 131 69" style="${garis};stroke-width:2.2"/>
    </g>
    <g class="e e-alis"><path d="M67 64 93 70M133 64 107 70" style="${garis};stroke-width:3.6"/></g>
    <g class="e e-tidur"><path d="M70 88Q83 95 96 88M104 88Q117 95 130 88" style="${garis}"/></g>
    <g class="e e-senang-mata"><path d="M71 90Q83 75 95 90M105 90Q117 75 129 90" style="${garis};stroke-width:3.6"/></g>
    <g class="e e-mulut"><path d="M91 110Q95.5 114.4 100 110Q104.5 114.4 109 110" style="${garis}"/></g>
    <g class="e e-mulut-serius"><path d="M91 112.6H109" style="${garis}"/></g>
    <g class="e e-mulut-senang"><path d="M87 107Q100 126 113 107Z" fill="#7A1235" stroke="${tinta}" stroke-width="2.4" stroke-linejoin="round"/><ellipse cx="100" cy="117" rx="6" ry="3.4" fill="#FF6F9F"/></g>
    <g class="e e-zzz" style="font:700 15px 'Inter Tight',system-ui,sans-serif;fill:#F7A6C3"><text x="152" y="34">z</text><text x="164" y="20" font-size="19">Z</text></g>
    ${bagianToga(P, '#5CCFA8')}
    <g transform="translate(100 129) scale(1.1)"><use href="#${P}Bunga"/></g>
    ${bunga(58, 150, .9, 20)}${bunga(146, 154, .75, -15)}
    ${bagianLandasan(P)}
    ${bagianPalu(P, '#5CCFA8')}
  </svg>`;
  }

  const unitHakim = () => (S.data?.unit || S.unit) === 'putri' ? 'putri' : 'putra';
  function hakimHtml(kelas = '') {
    const putri = unitHakim() === 'putri';
    return `<div class="sd-hakim ${kelas}" data-ekspresi="${esc(S.ekspresi)}" data-unit="${putri ? 'putri' : 'putra'}">
      ${putri ? svgHakimJilbab() : svgHakimPeci()}</div>`;
  }

  /* =================================================================
   *  DATA
   * ================================================================= */
  const majelis = () => S.data?.peran === 'majelis';
  const butir = () => S.data?.butir || [];
  const aktif = (b) => b.status === 'menunggu' || b.status === 'dibacakan';
  const hadir = (b) => !b.hadir || b.hadir === 'Hadir';
  const bolehPutus = () => majelis() && (S.data?.buka || S.data?.role === 'Admin');

  async function muat(diam) {
    const t = ++S.token;
    if (!diam) { S.sibuk = true; gambarIsi(); }
    try {
      const { data, error } = await A.db.rpc('sidang_berkas', { p_unit: S.unit || null });
      if (t !== S.token) return;
      if (error) throw error;
      if (!data || !Array.isArray(data.butir)) throw new Error('Jawaban server tidak dikenali. Pastikan migrasi v2.64 sudah diterapkan.');
      S.data = data; S.galat = '';
      if (data.unit_terkunci) S.unit = data.unit;
      rapikanPilihan();
    } catch (e) {
      if (t !== S.token) return;
      const m = String(e?.message || e);
      S.galat = /sidang_berkas|function .* does not exist|Could not find the function/i.test(m)
        ? 'Ruang Sidang belum aktif di server. Admin perlu menerapkan migrasi v2.64 (sidang_tadib).'
        : m;
    } finally {
      if (t === S.token) { S.sibuk = false; gambarSemua(); }
    }
  }

  /** Bidang/kategori/tahap tetap sah setelah data berubah; pilihan yang hilang dibuang. */
  function rapikanPilihan() {
    const ada = new Set(butir().map(b => b.id));
    [...S.pilih].forEach(id => { if (!ada.has(id)) S.pilih.delete(id); });
    const bs = daftarBidang();
    if (S.bidang && !bs.some(x => x.nama === S.bidang)) { S.bidang = ''; S.kategori = ''; S.tahap = null; }
    if (S.bidang) {
      const ks = daftarKategori();
      if (S.kategori && !ks.some(x => x.nama === S.kategori)) { S.kategori = ''; S.tahap = null; }
      if (S.kategori && S.tahap != null && !daftarTahap().some(x => x.tahap === S.tahap)) S.tahap = null;
    }
  }

  function hitung(list) {
    const c = { total: list.length, menunggu: 0, dibacakan: 0, diberikan: 0, tuntas: 0 };
    list.forEach(b => { c[b.status] = (c[b.status] || 0) + 1; });
    c.aktif = c.menunggu + c.dibacakan;
    return c;
  }
  function kelompok(list, kunci) {
    const m = new Map();
    list.forEach(b => { const k = kunci(b); if (!m.has(k)) m.set(k, []); m.get(k).push(b); });
    return m;
  }
  /** Urut: perkara aktif terbanyak lebih dulu → yang teratas "disarankan". */
  function daftarBidang() {
    const m = kelompok(butir(), b => b.bidang || 'Belum Dipetakan');
    return [...m].map(([nama, l]) => ({ nama, ...hitung(l) }))
      .sort((a, b) => b.aktif - a.aktif || b.total - a.total || a.nama.localeCompare(b.nama));
  }
  const diBidang = () => butir().filter(b => b.bidang === S.bidang);
  function daftarKategori() {
    const m = kelompok(diBidang(), b => b.kategori);
    return ['Sedang', 'Ringan'].filter(k => m.has(k)).map(k => ({ nama: k, ...hitung(m.get(k)) }))
      .sort((a, b) => b.aktif - a.aktif || (a.nama === 'Sedang' ? -1 : 1));
  }
  const diKategori = () => diBidang().filter(b => b.kategori === S.kategori);
  function daftarTahap() {
    const m = kelompok(diKategori(), b => Number(b.tahap) || 0);
    return [...m].map(([tahap, l]) => {
      const bentuk = [...kelompok(l, b => b.bentuk || '-').entries()].sort((a, b) => b[1].length - a[1].length)[0]?.[0] || '-';
      return { tahap, bentuk, ...hitung(l) };
    }).sort((a, b) => a.tahap - b.tahap);
  }
  /** Saran = item dengan perkara aktif terbanyak (seri: urutan bawaan). */
  const saranDari = (arr) => { let t = null; arr.forEach(x => { if (x.aktif && (!t || x.aktif > t.aktif)) t = x; }); return t; };
  const diTahap = () => diKategori().filter(b => (Number(b.tahap) || 0) === S.tahap);
  function daftarTampil() {
    const k = S.cari.trim().toLowerCase();
    return diTahap()
      .filter(b => S.tampil === 'semua' || aktif(b))
      .filter(b => !k || [b.nama, b.kelas, b.pelanggaran, b.kamar && `kamar ${b.kamar}`].join(' ').toLowerCase().includes(k))
      .sort((a, b) => URUT_STATUS[a.status] - URUT_STATUS[b.status] || String(a.kelas).localeCompare(String(b.kelas)) || String(a.nama).localeCompare(String(b.nama)));
  }

  /* =================================================================
   *  GAMBAR
   * ================================================================= */
  function kerangka() {
    const el = document.createElement('section');
    el.id = 'ruangSidang';
    el.className = 'sd';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', "Ruang Sidang Ta'dib");
    el.innerHTML = `
      <header class="sd-atas">
        <button type="button" class="sd-keluar" data-aksi="keluar" aria-label="Keluar dari ruang sidang"><i class="fa-solid fa-arrow-left"></i><span>Keluar</span></button>
        <div class="sd-judul"><b>Majelis Ta'dib</b><span id="sdSub"></span></div>
        <div class="sd-atas-kanan" id="sdKanan"></div>
      </header>
      <div class="sd-gulir" id="sdGulir">
        <div class="sd-panggung" id="sdPanggung"></div>
        <div class="sd-isi" id="sdIsi"></div>
      </div>
      <div class="sd-aksi" id="sdAksi" hidden></div>
      <div class="sd-tirai" id="sdTirai" aria-hidden="true"><i></i><i></i></div>`;
    return el;
  }

  function gambarSemua() { gambarAtas(); gambarPanggung(); gambarIsi(); gambarAksi(); }

  function gambarAtas() {
    if (!S.akar) return;
    const d = S.data;
    const unitLbl = (u) => u === 'putri' ? 'Putri' : u === 'putra' ? 'Putra' : 'Dua unit';
    S.akar.querySelector('#sdSub').textContent = d
      ? `${d.role === 'Osis' ? 'OSDA' : 'Pengamatan'} ${unitLbl(d.unit)} · ${labelHari(d.hari)}`
      : 'Memuat berkas…';
    const kanan = S.akar.querySelector('#sdKanan');
    const status = !d ? '' : d.buka
      ? `<span class="sd-status buka" title="Hari sidang"><i class="fa-solid fa-circle-dot"></i><span>Hari sidang</span></span>`
      : `<span class="sd-status reses" title="Reses — bukan hari sidang"><i class="fa-solid fa-clock"></i><span>Reses</span></span>`;
    const unit = d && !d.unit_terkunci ? `<div class="sd-unit" role="group" aria-label="Unit asrama">
        ${[['', 'Semua'], ['putra', 'Putra'], ['putri', 'Putri']].map(([v, l]) =>
          `<button type="button" data-aksi="unit" data-nilai="${v}" aria-pressed="${(S.unit || '') === v}">${l}</button>`).join('')}
      </div>` : '';
    const bunyi = majelis() ? `<button type="button" class="sd-ikon" data-aksi="bunyi" aria-pressed="${bunyiAktif()}" title="${bunyiAktif() ? 'Matikan bunyi palu' : 'Nyalakan bunyi palu'}">
        <i class="fa-solid fa-gavel"></i><span class="sr-only">Bunyi palu</span></button>` : '';
    kanan.innerHTML = status + unit + bunyi +
      `<button type="button" class="sd-ikon" data-aksi="segarkan" title="Muat ulang berkas"><i class="fa-solid fa-rotate"></i><span class="sr-only">Muat ulang</span></button>`;
  }

  function kalimatHakim() {
    const d = S.data;
    if (S.galat) return 'Berkas belum bisa dibuka. Periksa sambungan, lalu muat ulang.';
    if (!d) return 'Bismillah. Berkas perkara sedang disiapkan…';
    if (d.role === 'Osis' && !d.buka) return `Majelis sedang reses. Sidang berikutnya ${labelHari(d.berikut, true)}.`;
    if (!majelis()) return 'Anda hadir sebagai pengamat. Putusan dibacakan dan diberikan oleh majelis OSDA.';
    if (!butir().length) return 'Alhamdulillah, tidak ada perkara Ringan atau Sedang yang menunggu sidang.';
    if (S.bubble) return S.bubble;
    if (!S.bidang) {
      const s = saranDari(daftarBidang());
      return s ? `Sidang dibuka. Pilih bidang perkara. Saran majelis: ${s.nama}, ${angka(s.aktif)} perkara menunggu.`
               : 'Semua perkara sudah diputus. Tinggal menunggu pengesahan musyrif.';
    }
    if (!S.kategori) return `Bidang ${S.bidang}. Pilih kategori yang akan disidangkan.`;
    if (S.tahap == null) return `Kategori ${S.kategori}. Pilih tahap pengulangan; bentuk pembinaannya ikut tampil.`;
    const c = hitung(diTahap());
    if (!c.aktif) return 'Alhamdulillah, tahap ini sudah diputus semuanya.';
    if (c.dibacakan && !c.menunggu) return 'Putusan sudah dibacakan. Laksanakan pembinaannya, lalu tandai "sudah diberikan".';
    return 'Pilih santri yang hadir, lalu bacakan putusannya.';
  }

  function gambarPanggung() {
    if (!S.akar) return;
    const d = S.data;
    const reses = d && d.role === 'Osis' && !d.buka;
    S.ekspresi = S.galat ? 'serius' : reses ? 'tidur' : S.ekspresi === 'tidur' ? 'normal' : S.ekspresi;
    const el = S.akar.querySelector('#sdPanggung');
    el.dataset.unit = unitHakim();
    el.innerHTML = `
      <div class="sd-lengkung" aria-hidden="true"><span class="ar" lang="ar" dir="rtl">${AYAT}</span><small>QS. An-Nisā' [4]: 58</small></div>
      <div class="sd-kursi">
        ${hakimHtml('besar')}
        <p class="sd-bicara" id="sdBicara" aria-live="polite">${esc(kalimatHakim())}</p>
      </div>
      <div class="sd-meja" aria-hidden="true"><span class="sd-plakat"><i class="fa-solid fa-scale-balanced"></i>Majelis Ta'dib ${unitHakim() === 'putri' ? 'Putri' : 'Putra'}</span></div>`;
  }
  function ucap(teks, ekspresi) {
    S.bubble = teks || '';
    if (ekspresi) S.ekspresi = ekspresi;
    const b = S.akar?.querySelector('#sdBicara'); if (b) b.textContent = kalimatHakim();
    S.akar?.querySelectorAll('.sd-hakim').forEach(h => { h.dataset.ekspresi = S.ekspresi; });
  }

  function chip(aksi, nilai, isi, on, saran, nonaktif) {
    return `<button type="button" class="sd-chip${on ? ' on' : ''}" data-aksi="${aksi}" data-nilai="${esc(nilai)}" aria-pressed="${!!on}"${nonaktif ? ' disabled' : ''}>
      ${isi}${saran ? '<em class="sd-saran">Disarankan</em>' : ''}</button>`;
  }
  const angkaChip = (c) => `<span class="sd-hitung" title="${angka(c.aktif)} menunggu diputus dari ${angka(c.total)} perkara"><span class="sd-n">${angka(c.aktif)}</span>${c.total > c.aktif ? `<span class="sd-n-sisa">/${angka(c.total)}</span>` : ''}</span>`;

  function gambarIsi() {
    if (!S.akar) return;
    const el = S.akar.querySelector('#sdIsi');
    const d = S.data;
    if (S.sibuk && !d) { el.innerHTML = `<div class="sd-kertas sd-muat"><i class="fa-solid fa-circle-notch fa-spin"></i>Membuka berkas perkara…</div>`; return; }
    if (S.galat) {
      el.innerHTML = `<div class="sd-kertas sd-kosong"><i class="fa-solid fa-triangle-exclamation"></i><b>Berkas belum terbuka</b>
        <p>${esc(S.galat)}</p><button type="button" class="sd-btn" data-aksi="segarkan"><i class="fa-solid fa-rotate"></i>Coba lagi</button></div>`;
      return;
    }
    if (!d) return;
    if (d.role === 'Osis' && !d.buka) { el.innerHTML = htmlReses(); return; }

    const bs = daftarBidang();
    const sB = saranDari(bs);
    const pengamat = !majelis()
      ? `<p class="sd-catatan"><i class="fa-solid fa-eye"></i>Mode pengamat: Anda melihat berkas${d.peran === 'pengamat' && d.role !== 'Admin' ? ' sesuai lingkup akun Anda' : ''}. Membacakan dan memberikan putusan adalah tugas majelis OSDA.</p>` : '';
    const reses = majelis() && !d.buka
      ? `<p class="sd-catatan"><i class="fa-solid fa-clock"></i>Hari ini bukan hari sidang. Sebagai Admin Anda tetap dapat memutus; OSDA baru bisa membuka ruang ini pada ${esc(jadwalTeks())}.</p>` : '';

    let html = `${pengamat}${reses}
      <ol class="sd-langkah" aria-label="Urutan persidangan">
        <li class="${S.bidang ? 'selesai' : 'kini'}"><span>1</span>Bidang</li>
        <li class="${S.kategori ? 'selesai' : S.bidang ? 'kini' : ''}"><span>2</span>Kategori</li>
        <li class="${S.tahap != null ? 'selesai' : S.kategori ? 'kini' : ''}"><span>3</span>Tahap</li>
        <li class="${S.tahap != null ? 'kini' : ''}"><span>4</span>Putusan</li>
      </ol>
      <div class="sd-baris-pilih">
        <h3>Bidang perkara</h3>
        <div class="sd-chips">${bs.length ? bs.map(b => chip('bidang', b.nama, `<b>${esc(b.nama)}</b>${angkaChip(b)}`, b.nama === S.bidang, sB && sB.nama === b.nama && !S.bidang)).join('')
          : '<p class="sd-hampa">Tidak ada perkara Ringan atau Sedang untuk angkatan VII–X.</p>'}</div>
      </div>`;

    if (S.bidang) {
      const ks = daftarKategori(), sK = saranDari(ks);
      html += `<div class="sd-baris-pilih">
        <h3>Kategori</h3>
        <div class="sd-chips">${ks.map(k => chip('kategori', k.nama, `<b class="sd-kat ${k.nama === 'Sedang' ? 'sedang' : 'ringan'}">${k.nama}</b>${angkaChip(k)}`,
          k.nama === S.kategori, sK && sK.nama === k.nama && S.kategori !== k.nama)).join('')}</div>
      </div>`;
    }
    if (S.kategori) {
      const ts = daftarTahap(), sT = saranDari(ts);
      html += `<div class="sd-baris-pilih">
        <h3>Tahap pengulangan</h3>
        <div class="sd-chips sd-chips-tahap">${ts.map(t => chip('tahap', t.tahap, `<b>Ke-${t.tahap || '?'}</b><small>${esc(t.bentuk)}</small>${angkaChip(t)}`,
          t.tahap === S.tahap, sT && sT.tahap === t.tahap && S.tahap !== t.tahap)).join('')}</div>
      </div>`;
    }
    if (S.tahap != null) html += htmlPutusan();
    el.innerHTML = `<div class="sd-utama">${html}</div>${htmlRekap()}`;
    if (S.sibuk) el.classList.add('sd-redup'); else el.classList.remove('sd-redup');
  }

  function htmlReses() {
    const d = S.data;
    return `<div class="sd-kertas sd-kosong sd-reses">
      <i class="fa-solid fa-calendar-day"></i>
      <b>Majelis sedang reses</b>
      <p>Ruang Sidang dibuka pada ${esc(jadwalTeks())}. Sidang berikutnya <strong>${esc(labelHari(d.berikut, true))}</strong>.</p>
      <p class="sd-kecil">Perkara yang masuk sampai saat itu otomatis tersusun di berkas; tidak ada yang perlu disiapkan.</p>
    </div>`;
  }

  function htmlPutusan() {
    const semua = diTahap();
    const c = hitung(semua);
    const list = daftarTampil();
    const grup = kelompok(list, b => b.bentuk || '-');
    const musyrif = S.data?.musyrif || {};
    const boleh = bolehPutus();
    const calon = list.filter(b => aktif(b) && hadir(b));
    const semuaTerpilih = calon.length > 0 && calon.every(b => S.pilih.has(b.id));
    const baris = (b) => {
      const bisaPilih = boleh && aktif(b);
      const tgl = b.status === 'diberikan' ? `Diberikan ${labelTgl(kunciWib(b.diberikan_pada))} ${jamWib(b.diberikan_pada)}`
        : b.status === 'dibacakan' ? `Dibacakan ${labelTgl(b.sesi)}` : b.status === 'tuntas' ? 'Disahkan musyrif' : `Dicatat ${labelTgl(b.tanggal)}`;
      const ke = b.status === 'diberikan' && b.penerima ? b.penerima.join(', ') : (musyrif[b.kelas] || []).join(', ');
      const bisaBatal = boleh && (b.status === 'dibacakan' || b.status === 'diberikan') && (S.data.role === 'Admin' || b.sesi === S.data.hari);
      return `<li class="sd-santri st-${b.status}${S.pilih.has(b.id) ? ' dipilih' : ''}" data-id="${esc(b.id)}">
        ${bisaPilih ? `<label class="sd-cek"><input type="checkbox" data-aksi="pilih" value="${esc(b.id)}" ${S.pilih.has(b.id) ? 'checked' : ''} aria-label="Pilih ${esc(b.nama)}"><span></span></label>` : boleh ? '<span class="sd-cek-ruang"></span>' : ''}
        <div class="sd-santri-isi">
          <b>${esc(b.nama)}</b>
          <span class="sd-meta">${esc(b.kelas)}${b.kamar ? ` · Kamar ${esc(b.kamar)}` : ''}${!hadir(b) ? ` · <em class="sd-absen"><i class="fa-solid ${/sakit/i.test(b.hadir) ? 'fa-bed' : 'fa-door-open'}"></i>${esc(b.hadir)}</em>` : ''}</span>
          <span class="sd-pelanggaran">${esc(b.pelanggaran)}</span>
        </div>
        <div class="sd-santri-status">
          <span class="sd-tag t-${b.status}">${LABEL_STATUS[b.status]}</span>
          <small>${esc(tgl)}</small>
          ${ke ? `<small class="sd-ke"><i class="fa-solid fa-user-tie"></i>${esc(ke)}</small>` : ''}
          ${bisaBatal ? `<button type="button" class="sd-batal" data-aksi="batal" data-nilai="${esc(b.id)}">Batalkan</button>` : ''}
        </div>
      </li>`;
    };
    const kepala = `<div class="sd-putusan-kepala">
        <div><h3>Daftar santri & putusan</h3>
          <p>${esc(S.bidang)} · ${esc(S.kategori)} · tahap ke-${S.tahap || '?'} — ${angka(c.menunggu)} menunggu, ${angka(c.dibacakan)} dibacakan, ${angka(c.diberikan)} di musyrif, ${angka(c.tuntas)} tuntas</p></div>
        <div class="sd-alat">
          <label class="sd-cari"><i class="fa-solid fa-magnifying-glass"></i><input type="search" id="sdCari" placeholder="Cari nama, kelas, kamar…" value="${esc(S.cari)}" aria-label="Cari santri"></label>
          <button type="button" class="sd-btn sd-btn-tipis" data-aksi="tampil" aria-pressed="${S.tampil === 'semua'}">${S.tampil === 'semua' ? 'Sembunyikan yang selesai' : 'Tampilkan yang selesai'}</button>
          ${boleh ? `<button type="button" class="sd-btn sd-btn-tipis" data-aksi="pilih-hadir">${semuaTerpilih ? 'Kosongkan pilihan' : 'Pilih semua yang hadir'}</button>` : ''}
        </div>
      </div>`;
    if (!list.length) return `<div class="sd-kertas sd-putusan">${kepala}<p class="sd-hampa">${c.aktif ? 'Tidak ada yang cocok dengan pencarian.' : 'Semua perkara di tahap ini sudah diputus. Tekan "Tampilkan yang selesai" untuk melihat jejaknya.'}</p></div>`;
    return `<div class="sd-kertas sd-putusan">${kepala}
      ${[...grup].map(([bentuk, l]) => {
        const ket = l.find(x => x.ket)?.ket;
        return `<section class="sd-amar">
          <div class="sd-amar-kepala"><span>Bentuk pembinaan</span><b>${esc(bentuk)}</b>${ket ? `<small>${esc(ket)}</small>` : ''}</div>
          <ul class="sd-daftar${boleh ? '' : ' tanpa-pilih'}">${l.map(baris).join('')}</ul>
        </section>`;
      }).join('')}
    </div>`;
  }

  function sesiHariIni() {
    const h = S.data?.hari;
    const hariIni = (b) => b.diberikan_pada && kunciWib(b.diberikan_pada) === h;
    const l = butir().filter(b => b.sesi === h || hariIni(b));
    return { list: l, dibacakan: l.filter(b => b.sesi === h).length, diberikan: l.filter(hariIni).length, tuntas: l.filter(b => b.status === 'tuntas').length };
  }
  function htmlRekap() {
    const all = hitung(butir());
    const s = sesiHariIni();
    return `<aside class="sd-kertas sd-rekap" aria-label="Rekap sidang">
      <h3>Rekap berkas</h3>
      <dl>
        <div><dt>Menunggu sidang</dt><dd>${angka(all.menunggu)}</dd></div>
        <div><dt>Sudah dibacakan, belum diberikan</dt><dd>${angka(all.dibacakan)}</dd></div>
        <div><dt>Di tangan musyrif</dt><dd>${angka(all.diberikan)}</dd></div>
        <div><dt>Tuntas</dt><dd>${angka(all.tuntas)}</dd></div>
      </dl>
      ${s.list.length ? `<p class="sd-kecil">Sidang hari ini: ${angka(s.dibacakan)} putusan dibacakan, ${angka(s.diberikan)} sudah diberikan.</p>
        <button type="button" class="sd-btn sd-btn-tipis" data-aksi="berita-acara"><i class="fa-solid fa-copy"></i>Salin berita acara hari ini</button>` : ''}
    </aside>`;
  }

  function gambarAksi() {
    if (!S.akar) return;
    const el = S.akar.querySelector('#sdAksi');
    const boleh = bolehPutus() && S.tahap != null;
    const dipilih = butir().filter(b => S.pilih.has(b.id));
    const nBaca = dipilih.filter(b => b.status === 'menunggu').length;
    const nBeri = dipilih.filter(b => b.status === 'dibacakan').length;
    el.hidden = !boleh;
    if (!boleh) return;
    el.innerHTML = `
      <span class="sd-aksi-info">${dipilih.length ? `${angka(dipilih.length)} santri dipilih` : 'Belum ada santri dipilih'}</span>
      <button type="button" class="sd-btn sd-btn-emas" data-aksi="bacakan" ${nBaca ? '' : 'disabled'}>
        <i class="fa-solid fa-gavel"></i><span>Bacakan<span class="sd-pjg"> putusan</span>${nBaca ? ` (${angka(nBaca)})` : ''}</span></button>
      <button type="button" class="sd-btn sd-btn-hijau" data-aksi="berikan" ${nBeri ? '' : 'disabled'} title="Tandai sudah diberikan dan kirim laporan ke musyrif kelas">
        <i class="fa-solid fa-paper-plane"></i><span>Sudah diberikan<span class="sd-pjg">, kirim ke musyrif</span>${nBeri ? ` (${angka(nBeri)})` : ''}</span></button>`;
  }

  /* =================================================================
   *  PEMBACAAN PUTUSAN — satu per satu, palu diketuk di setiap amar
   * ================================================================= */
  function bukaPembacaan() {
    const l = butir().filter(b => S.pilih.has(b.id) && b.status === 'menunggu')
      .sort((a, b) => String(a.kelas).localeCompare(String(b.kelas)) || String(a.nama).localeCompare(String(b.nama)));
    if (!l.length) return;
    S.baca = { list: l, i: 0, ringkas: false, kunci: false };
    const el = document.createElement('div');
    el.className = 'sd-baca';
    el.id = 'sdBaca';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', 'Pembacaan putusan');
    S.akar.appendChild(el);
    gambarBaca();
    requestAnimationFrame(() => el.classList.add('buka'));
    ketukPalu(1, el);
    el.querySelector('[data-aksi="baca-lanjut"]')?.focus();
  }
  function gambarBaca() {
    const el = S.akar?.querySelector('#sdBaca'); if (!el || !S.baca) return;
    const { list, i, ringkas } = S.baca;
    const b = list[i], akhir = i === list.length - 1;
    el.innerHTML = `
      <div class="sd-baca-panggung">${hakimHtml('baca')}</div>
      <div class="sd-gulungan">
        <div class="sd-gulungan-atas">
          <span>Putusan ${ringkas ? 'majelis' : `${i + 1} dari ${list.length}`}</span>
          <button type="button" class="sd-btn sd-btn-tipis" data-aksi="baca-ringkas">${ringkas ? 'Satu per satu' : 'Lihat semua sekaligus'}</button>
        </div>
        ${ringkas ? `<ol class="sd-baca-semua">${list.map(x => `<li><b>${esc(x.nama)}</b> <span>${esc(x.kelas)}</span><small>${esc(x.pelanggaran)}</small><em>${esc(x.bentuk)}</em></li>`).join('')}</ol>`
        : `<div class="sd-amar-baca" data-i="${i}">
            <p class="sd-pembuka">Majelis Ta'dib menimbang perkara ananda</p>
            <h2>${esc(b.nama)}</h2>
            <p class="sd-baca-meta">${esc(b.kelas)}${b.kamar ? ` · Kamar ${esc(b.kamar)}` : ''}</p>
            <dl>
              <div><dt>Pelanggaran</dt><dd>${esc(b.pelanggaran)}</dd></div>
              <div><dt>Kategori</dt><dd>${esc(b.kategori)} · pengulangan ke-${esc(b.tahap || '?')} bulan ini</dd></div>
            </dl>
            <p class="sd-pembuka">dan memutuskan pembinaan berupa</p>
            <p class="sd-bentuk">${esc(b.bentuk)}</p>
            ${b.ket ? `<p class="sd-kecil">${esc(b.ket)}</p>` : ''}
            ${!hadir(b) ? `<p class="sd-catatan"><i class="fa-solid fa-circle-info"></i>Tercatat ${esc(b.hadir)}. Bila ananda tidak hadir, lewati dan bacakan pada sidang berikutnya.</p>` : ''}
          </div>`}
        <div class="sd-baca-aksi">
          <button type="button" class="sd-btn sd-btn-tipis" data-aksi="baca-tutup">Tunda</button>
          ${!ringkas && list.length > 1 ? `<button type="button" class="sd-btn sd-btn-tipis" data-aksi="baca-lewati">Lewati ananda ini</button>` : ''}
          ${!ringkas && i > 0 ? `<button type="button" class="sd-btn sd-btn-tipis" data-aksi="baca-mundur"><i class="fa-solid fa-chevron-left"></i>Sebelumnya</button>` : ''}
          <button type="button" class="sd-btn sd-btn-emas" data-aksi="baca-lanjut">
            <i class="fa-solid fa-gavel"></i>${ringkas || akhir ? `Ketuk palu: sahkan ${angka(list.length)} putusan` : 'Ketuk palu, lanjut'}</button>
        </div>
      </div>`;
  }
  function tutupPembacaan() {
    const el = S.akar?.querySelector('#sdBaca');
    S.baca = null;
    if (!el) return;
    el.classList.remove('buka');
    setTimeout(() => el.remove(), bolehGerak() ? 260 : 0);
    S.akar.querySelector('[data-aksi="bacakan"]')?.focus();
  }
  async function lanjutBaca() {
    const B = S.baca; if (!B || B.kunci) return;
    if (!B.ringkas && B.i < B.list.length - 1) {
      B.kunci = true; await ketukPalu(1, S.akar.querySelector('#sdBaca')); B.kunci = false;
      B.i++; gambarBaca(); return;
    }
    // ketukan terakhir: putusan sah dibacakan
    B.kunci = true;
    const ids = B.list.map(b => b.id);
    const btn = S.akar.querySelector('#sdBaca [data-aksi="baca-lanjut"]');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i>Mencatat…'; }
    try {
      const { data, error } = await A.db.rpc('sidang_bacakan', { p_ids: ids });
      if (error) throw error;
      ucap('', 'serius');
      await ketukPalu(3, S.akar.querySelector('#sdBaca'));
      capKertas('Dibacakan');
      A.sync('done', 'Putusan dibacakan');
      A.toast('success', `${angka(data?.dibacakan || 0)} putusan dibacakan${data?.dilewati ? ` · ${angka(data.dilewati)} dilewati` : ''}`);
      tutupPembacaan();
      ucap(`${angka(data?.dibacakan || 0)} putusan telah dibacakan. Laksanakan pembinaannya, lalu tandai "sudah diberikan".`, 'normal');
      await muat(true);
    } catch (e) {
      B.kunci = false;
      if (btn) { btn.disabled = false; }
      gambarBaca();
      A.fireError(e);
    }
  }

  /** Cap lilin "Dibacakan"/"Diberikan" — satu momen konfirmasi. */
  function capKertas(teks) {
    if (!S.akar) return;
    const c = document.createElement('div');
    c.className = 'sd-cap';
    c.setAttribute('aria-hidden', 'true');
    c.innerHTML = `<span>${esc(teks)}</span>`;
    S.akar.appendChild(c);
    setTimeout(() => c.remove(), bolehGerak() ? 1500 : 700);
  }

  /* =================================================================
   *  DIBERIKAN → laporan ke musyrif
   * ================================================================= */
  async function berikan() {
    const l = butir().filter(b => S.pilih.has(b.id) && b.status === 'dibacakan');
    if (!l.length) return;
    const musyrif = S.data?.musyrif || {};
    const perKelas = kelompok(l, b => b.kelas);
    const tanpa = [...perKelas.keys()].filter(k => !(musyrif[k] || []).length);
    const res = await A.Swal.fire({
      title: `Tandai ${angka(l.length)} putusan sudah diberikan?`,
      width: 640, showCancelButton: true, confirmButtonText: '<i class="fa-solid fa-paper-plane"></i> Kirim ke musyrif',
      cancelButtonText: 'Batal', confirmButtonColor: '#0F766E', showLoaderOnConfirm: true,
      allowOutsideClick: () => !A.Swal.isLoading(),
      html: `<div class="sd-swal">
        <p>Laporan putusan dikirim ke musyrif kelas masing-masing. Pembinaan baru <b>tuntas</b> setelah musyrif menekan "Sahkan Selesai".</p>
        <ul>${[...perKelas].map(([k, x]) => `<li><b>${esc(k)}</b> · ${angka(x.length)} santri → ${esc((musyrif[k] || ['Admin (kelas belum punya musyrif)']).join(', '))}</li>`).join('')}</ul>
        ${tanpa.length ? `<p class="sd-kecil">Kelas ${esc(tanpa.join(', '))} belum punya musyrif; laporannya dikirim ke Admin.</p>` : ''}
        <label for="sdCatatan">Catatan majelis (boleh dikosongkan)</label>
        <textarea id="sdCatatan" rows="3" maxlength="500" placeholder="Contoh: hukuman dijalankan ba'da Ashar di halaman asrama; semua santri hadir."></textarea>
      </div>`,
      preConfirm: async () => {
        try {
          const { data, error } = await A.db.rpc('sidang_serahkan', { p_ids: l.map(b => b.id), p_catatan: document.getElementById('sdCatatan')?.value || null });
          if (error) throw error;
          return data;
        } catch (e) { A.Swal.showValidationMessage(e.message || 'Gagal mengirim laporan.'); return false; }
      }
    });
    if (!res.isConfirmed || !res.value) return;
    const v = res.value;
    l.forEach(b => S.pilih.delete(b.id));
    await ketukPalu(1);
    capKertas('Diberikan');
    A.sync('done', 'Laporan terkirim');
    A.segarkanPesan();
    const lewat = Array.isArray(v.dilewati) ? v.dilewati : [];
    if (lewat.length) A.Swal.fire({ icon: 'info', title: `${angka(v.diberikan)} terkirim, ${angka(lewat.length)} dilewati`,
      html: `<div class="sd-swal"><ul>${lewat.map(x => `<li><b>${esc(x.nama)}</b> — ${esc(x.sebab)}</li>`).join('')}</ul></div>` });
    else A.toast('success', `${angka(v.diberikan)} putusan terkirim ke musyrif`);
    ucap(`Laporan terkirim ke musyrif. Pembinaan tuntas setelah disahkan.`, 'senang');
    await muat(true);
  }

  async function batal(id) {
    const b = butir().find(x => x.id === id); if (!b) return;
    const k = await A.Swal.fire({
      icon: 'question', title: 'Batalkan putusan ini?',
      html: `<div class="sd-swal"><p><b>${esc(b.nama)}</b> (${esc(b.kelas)}) kembali ke daftar "menunggu sidang".${b.status === 'diberikan' ? ' Laporan yang sudah dikirim ke musyrif ikut ditarik.' : ''}</p></div>`,
      showCancelButton: true, confirmButtonText: 'Ya, batalkan', cancelButtonText: 'Tidak', confirmButtonColor: '#9F1239'
    });
    if (!k.isConfirmed) return;
    try {
      const { error } = await A.db.rpc('sidang_batal', { p_id: id });
      if (error) throw error;
      A.toast('success', 'Putusan dibatalkan');
      if (b.status === 'diberikan') A.segarkanPesan();
      await muat(true);
    } catch (e) { A.fireError(e); }
  }

  /* ---------- berita acara (teks untuk grup WA / arsip syura) ---------- */
  async function beritaAcara() {
    const d = S.data, s = sesiHariIni();
    const per = kelompok(s.list.sort((a, b) => String(a.bidang).localeCompare(b.bidang) || String(a.kelas).localeCompare(b.kelas)), b => b.bidang);
    let t = `BERITA ACARA SIDANG TA'DIB OSDA ${d.unit === 'putri' ? 'PUTRI' : 'PUTRA'}\n${labelHari(d.hari, true)}\n\n`
      + `Dibacakan: ${s.dibacakan} putusan · Diberikan: ${s.diberikan} · Tuntas: ${s.tuntas}\n`;
    per.forEach((l, bidang) => {
      t += `\n${bidang}\n`;
      l.forEach((b, i) => { t += `${i + 1}. ${b.nama} (${b.kelas}) — ${b.pelanggaran} — ${b.kategori} ke-${b.tahap || '?'} — ${b.bentuk} — ${LABEL_STATUS[b.status]}\n`; });
    });
    t += `\nDicatat chemint · ${d.nama || ''}`;
    try { await navigator.clipboard.writeText(t); A.toast('success', 'Berita acara disalin'); }
    catch (e) {
      A.Swal.fire({ title: 'Berita acara', width: 640, html: `<textarea class="sd-salin" rows="12" readonly>${esc(t)}</textarea>`, confirmButtonText: 'Tutup' });
    }
  }

  /* =================================================================
   *  INTERAKSI
   * ================================================================= */
  function pilihLangkah(jenis, nilai) {
    S.pilih.clear(); S.cari = ''; S.bubble = '';
    if (jenis === 'bidang') {
      S.bidang = S.bidang === nilai ? '' : nilai; S.kategori = ''; S.tahap = null;
      // saran sistem langsung dipasang; OSDA tetap bebas menggantinya
      if (S.bidang) { const k = saranDari(daftarKategori()); if (k) { S.kategori = k.nama; const t = saranDari(daftarTahap()); if (t) S.tahap = t.tahap; } }
      if (S.bidang) ucap(S.kategori ? `Bidang ${S.bidang}. Sistem menyarankan kategori ${S.kategori}${S.tahap != null ? `, tahap ke-${S.tahap}` : ''}. Silakan ganti bila perlu.` : '');
    } else if (jenis === 'kategori') {
      S.kategori = nilai; S.tahap = null;
      const t = saranDari(daftarTahap()); if (t) S.tahap = t.tahap;
    } else if (jenis === 'tahap') {
      S.tahap = Number(nilai);
    }
    gambarIsi(); gambarAksi();
    if (jenis !== 'bidang') ucap('');
    if (S.tahap != null) S.akar.querySelector('.sd-putusan')?.scrollIntoView({ behavior: bolehGerak() ? 'smooth' : 'auto', block: 'start' });
  }

  function onKlik(e) {
    const t = e.target.closest('[data-aksi]'); if (!t || !S.akar.contains(t)) return;
    const a = t.dataset.aksi, v = t.dataset.nilai;
    if (a === 'pilih') return;   // ditangani 'change'
    if (a === 'keluar') return A.keluar();
    if (a === 'segarkan') return muat();
    if (a === 'unit') { S.unit = v || null; S.bidang = ''; S.kategori = ''; S.tahap = null; S.pilih.clear(); S.data = null; gambarSemua(); return muat(); }
    if (a === 'bunyi') { try { localStorage.setItem('rq-sidang-bunyi', bunyiAktif() ? 'mati' : 'nyala'); } catch (er) {} gambarAtas(); if (bunyiAktif()) ketukBunyi(1); return; }
    if (a === 'bidang' || a === 'kategori' || a === 'tahap') return pilihLangkah(a, v);
    if (a === 'tampil') { S.tampil = S.tampil === 'semua' ? 'aktif' : 'semua'; gambarIsi(); return; }
    if (a === 'pilih-hadir') {
      const l = daftarTampil().filter(b => aktif(b) && hadir(b));
      const semua = l.length && l.every(b => S.pilih.has(b.id));
      l.forEach(b => semua ? S.pilih.delete(b.id) : S.pilih.add(b.id));
      gambarIsi(); gambarAksi(); return;
    }
    if (a === 'bacakan') return bukaPembacaan();
    if (a === 'berikan') return berikan();
    if (a === 'batal') return batal(v);
    if (a === 'berita-acara') return beritaAcara();
    if (a === 'baca-lanjut') return lanjutBaca();
    if (a === 'baca-mundur') { if (S.baca && S.baca.i > 0) { S.baca.i--; gambarBaca(); } return; }
    if (a === 'baca-lewati') {
      const B = S.baca; if (!B) return;
      const [x] = B.list.splice(B.i, 1); S.pilih.delete(x.id);
      if (!B.list.length) { tutupPembacaan(); gambarIsi(); gambarAksi(); return; }
      if (B.i >= B.list.length) B.i = B.list.length - 1;
      gambarBaca(); gambarIsi(); gambarAksi(); return;
    }
    if (a === 'baca-ringkas') { if (S.baca) { S.baca.ringkas = !S.baca.ringkas; gambarBaca(); } return; }
    if (a === 'baca-tutup') return tutupPembacaan();
  }
  function onUbah(e) {
    const c = e.target.closest('input[data-aksi="pilih"]'); if (!c) return;
    c.checked ? S.pilih.add(c.value) : S.pilih.delete(c.value);
    c.closest('.sd-santri')?.classList.toggle('dipilih', c.checked);
    gambarAksi();
  }
  let tCari = 0;
  function onKetik(e) {
    if (e.target.id !== 'sdCari') return;
    const v = e.target.value;
    clearTimeout(tCari);
    tCari = setTimeout(() => {
      S.cari = v; gambarIsi();
      const inp = S.akar.querySelector('#sdCari'); if (inp) { inp.focus(); inp.setSelectionRange(v.length, v.length); }
    }, 220);
  }
  function onTombol(e) {
    if (S.baca) {
      if (e.key === 'Escape') { e.preventDefault(); return tutupPembacaan(); }
      if (e.key === 'ArrowRight') { e.preventDefault(); return lanjutBaca(); }
      if (e.key === 'ArrowLeft' && S.baca.i > 0) { e.preventDefault(); S.baca.i--; return gambarBaca(); }
      return;
    }
    if (e.key === 'Escape' && !document.querySelector('.swal2-container')) A.keluar();
  }
  function onTampak() { if (document.visibilityState === 'visible' && S.akar && !S.baca) muat(true); }

  /* ---------- tirai pembuka: sekali per hari per akun ---------- */
  function bukaTirai() {
    const tirai = S.akar.querySelector('#sdTirai');
    const kunci = `rq-sidang-tirai-${new Date().toDateString()}-${A.profil()?.id || ''}`;
    let sudah = false; try { sudah = sessionStorage.getItem(kunci) === '1'; } catch (e) {}
    if (sudah || !bolehGerak()) { tirai.remove(); return false; }
    try { sessionStorage.setItem(kunci, '1'); } catch (e) {}
    S.akar.classList.add('sd-pembukaan');
    const selesai = () => { tirai.remove(); S.akar?.classList.remove('sd-pembukaan'); };
    requestAnimationFrame(() => requestAnimationFrame(() => tirai.classList.add('buka')));
    tirai.addEventListener('click', selesai, { once: true });
    setTimeout(selesai, 1500);
    return true;
  }

  /* =================================================================
   *  PINTU
   * ================================================================= */
  function buka() {
    if (S.akar && document.body.contains(S.akar)) { muat(true); return; }
    S.akar = kerangka();
    S.data = null; S.galat = ''; S.bubble = ''; S.ekspresi = 'normal'; S.pilih.clear();
    if (!S.unit) S.unit = A.unitAwal() || null;
    document.body.appendChild(S.akar);
    document.body.classList.add('di-sidang');
    S.akar.addEventListener('click', onKlik);
    S.akar.addEventListener('change', onUbah);
    S.akar.addEventListener('input', onKetik);
    document.addEventListener('keydown', onTombol);
    document.addEventListener('visibilitychange', onTampak);
    gambarSemua();
    const tirai = bukaTirai();
    muat().then(() => {
      // palu pembuka: tiga ketukan saat sidang dibuka (majelis, hari sidang)
      if (tirai && majelis() && S.data?.buka) setTimeout(() => ketukPalu(3), 500);
    });
    try { if (!history.state || !history.state.rqSidang) { history.pushState({ rqSidang: 1 }, ''); S.histori = true; } } catch (e) {}
    setTimeout(() => S.akar?.querySelector('.sd-keluar')?.focus(), 60);
  }
  function tutup() {
    if (!S.akar) return;
    S.token++;
    S.akar.removeEventListener('click', onKlik);
    document.removeEventListener('keydown', onTombol);
    document.removeEventListener('visibilitychange', onTampak);
    S.akar.remove(); S.akar = null; S.baca = null;
    document.body.classList.remove('di-sidang');
    if (S.histori) { S.histori = false; try { if (history.state && history.state.rqSidang) history.back(); } catch (e) {} }
  }
  window.addEventListener('popstate', () => { if (S.akar) { S.histori = false; A.keluar(); } });

  window.RQSidang = { buka, tutup, terbuka: () => !!S.akar, _uji: { S, daftarBidang, daftarKategori, daftarTahap } };
})();
