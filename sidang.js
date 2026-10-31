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
 *
 *  v2.65 · BERKAS PERKARA
 *    Tombol "Berkas perkara" → isi susunan majelis (Hakim Ketua, Hakim
 *    Anggota I/II, Panitera) → pilih cakupan & kertas → PDF: daftar panggil
 *    per kelas, rincian perkara per bidang/kategori/tahap, dan kolom tanda
 *    tangan majelis (nama diketik, tanda tangan dengan pena). PDF digambar
 *    langsung dengan jsPDF (teks vektor: tajam dicetak, berkas kecil).
 *    Mode PERSIAPAN: mulai 19.00 WIB malam sebelum hari sidang, OSDA sudah
 *    menerima berkas sidang besok (lihat / unduh saja, belum bisa memutus).
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
  /** v2.65: OSDA di luar hari sidang tanpa mode persiapan → reses. */
  const reses = (d = S.data) => !!d && d.role === 'Osis' && !d.buka && !d.pratinjau;
  const persiapan = (d = S.data) => !!d && d.role === 'Osis' && !d.buka && !!d.pratinjau;
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
      : persiapan(d)
        ? `<span class="sd-status persiapan" title="Persiapan sidang ${esc(labelHari(d.sesi_berkas || d.berikut, true))}"><i class="fa-solid fa-list-check"></i><span>Persiapan</span></span>`
        : `<span class="sd-status reses" title="Reses — bukan hari sidang"><i class="fa-solid fa-clock"></i><span>Reses</span></span>`;
    const berkas = bolehBerkas() ? `<button type="button" class="sd-ikon sd-ikon-berkas" data-aksi="berkas" title="Unduh berkas perkara (PDF)">
        <i class="fa-solid fa-file-pdf"></i><span class="sr-only">Berkas perkara</span></button>` : '';
    const unit = d && !d.unit_terkunci ? `<div class="sd-unit" role="group" aria-label="Unit asrama">
        ${[['', 'Semua'], ['putra', 'Putra'], ['putri', 'Putri']].map(([v, l]) =>
          `<button type="button" data-aksi="unit" data-nilai="${v}" aria-pressed="${(S.unit || '') === v}">${l}</button>`).join('')}
      </div>` : '';
    const bunyi = majelis() ? `<button type="button" class="sd-ikon" data-aksi="bunyi" aria-pressed="${bunyiAktif()}" title="${bunyiAktif() ? 'Matikan bunyi palu' : 'Nyalakan bunyi palu'}">
        <i class="fa-solid fa-gavel"></i><span class="sr-only">Bunyi palu</span></button>` : '';
    kanan.innerHTML = status + unit + berkas + bunyi +
      `<button type="button" class="sd-ikon" data-aksi="segarkan" title="Muat ulang berkas"><i class="fa-solid fa-rotate"></i><span class="sr-only">Muat ulang</span></button>`;
  }

  function kalimatHakim() {
    const d = S.data;
    if (S.galat) return 'Berkas belum bisa dibuka. Periksa sambungan, lalu muat ulang.';
    if (!d) return 'Bismillah. Berkas perkara sedang disiapkan…';
    if (reses(d)) return `Majelis sedang reses. Sidang berikutnya ${labelHari(d.berikut, true)}.`;
    if (persiapan(d)) return butir().some(b => b.status === 'menunggu')
      ? `Persiapan sidang ${labelHari(d.sesi_berkas || d.berikut, true)}. Unduh berkas perkara untuk memanggil nama-nama ananda.`
      : `Persiapan sidang ${labelHari(d.sesi_berkas || d.berikut, true)}. Alhamdulillah, belum ada perkara yang menunggu.`;
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
    S.ekspresi = S.galat ? 'serius' : reses(d) ? 'tidur' : S.ekspresi === 'tidur' ? 'normal' : S.ekspresi;
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
    if (reses(d)) { el.innerHTML = htmlReses(); return; }

    const bs = daftarBidang();
    const sB = saranDari(bs);
    const pengamat = !majelis()
      ? `<p class="sd-catatan"><i class="fa-solid fa-eye"></i>Mode pengamat: Anda melihat berkas${d.peran === 'pengamat' && d.role !== 'Admin' ? ' sesuai lingkup akun Anda' : ''}. Membacakan dan memberikan putusan adalah tugas majelis OSDA.</p>` : '';
    const catResus = persiapan(d)
      ? `<p class="sd-catatan sd-catatan-persiapan"><i class="fa-solid fa-list-check"></i><span>Mode persiapan: berkas sidang <b>${esc(labelHari(d.sesi_berkas || d.berikut, true))}</b> sudah tersusun. Unduh dan cetak daftar panggilnya malam ini; putusan baru bisa dibacakan besok.</span></p>`
      : majelis() && !d.buka
      ? `<p class="sd-catatan"><i class="fa-solid fa-clock"></i>Hari ini bukan hari sidang. Sebagai Admin Anda tetap dapat memutus; OSDA baru bisa membuka ruang ini pada ${esc(jadwalTeks())}.</p>` : '';

    let html = `${pengamat}${catResus}
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
      <p class="sd-kecil">Perkara yang masuk sampai saat itu otomatis tersusun di berkas. Mulai pukul 19.00 malam sebelum hari sidang, berkasnya sudah bisa diunduh dan dicetak untuk memanggil nama-nama ananda.</p>
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
      ${bolehBerkas() ? `<button type="button" class="sd-btn sd-btn-emas sd-btn-berkas" data-aksi="berkas"><i class="fa-solid fa-file-pdf"></i>Unduh berkas perkara</button>
        <p class="sd-kecil">Daftar panggil per kelas, rincian perkara, dan kolom tanda tangan majelis. Siap dicetak A4 atau F4.</p>` : ''}
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

  /* =================================================================
   *  v2.65 · BERKAS PERKARA (PDF) + SUSUNAN MAJELIS
   *  ---------------------------------------------------------------
   *  Digambar langsung dengan jsPDF (bawaan pustaka html2pdf yang sudah
   *  dipakai laporan santri; dimuat app.js saat perlu). Teks vektor:
   *  tajam saat dicetak, ringan dibuat di HP, berkas hanya puluhan KB.
   *  Huruf Helvetica bawaan PDF hanya mengenal Latin-1, jadi semua teks
   *  disaring teksPdf() lebih dulu.
   * ================================================================= */
  const JABATAN = [['ketua', 'Hakim Ketua'], ['anggota1', 'Hakim Anggota I'], ['anggota2', 'Hakim Anggota II'], ['panitera', 'Panitera']];
  const tunggu = (l) => l.filter(b => b.status === 'menunggu');
  const bolehBerkas = () => !!S.data && !S.galat && !reses() && tunggu(butir()).length > 0;
  const sesiBerkas = () => S.data?.sesi_berkas || (S.data?.buka ? S.data.hari : S.data?.berikut) || S.data?.hari;
  const unitBerkas = () => S.data?.unit === 'putri' ? 'Putri' : S.data?.unit === 'putra' ? 'Putra' : 'Putra & Putri';
  const kunciMajelis = () => `rq-sidang-majelis-${S.data?.unit || 'semua'}`;
  const santriUnik = (l) => new Set(l.map(b => `${b.nama}|${b.kelas}`)).size;
  const urutTeks = (a, b) => String(a || '').localeCompare(String(b || ''), 'id', { numeric: true, sensitivity: 'base' });
  /** Kelas berangka Romawi: VII-D < VIII-A < IX-F < X-C (bukan urutan abjad). */
  const ROMAWI = { I: 1, V: 5, X: 10, L: 50 };
  const angkaKelas = (k) => { const r = (String(k || '').match(/^[IVXL]+/i) || [''])[0].toUpperCase(); let n = 0;
    for (let i = 0; i < r.length; i++) { const v = ROMAWI[r[i]], w = ROMAWI[r[i + 1]] || 0; n += v < w ? -v : v; } return n || 99; };
  const urutKelas = (a, b) => angkaKelas(a) - angkaKelas(b) || urutTeks(a, b);

  /** Nama majelis: dari server (sesi ini) → kalau belum ada, isian terakhir di perangkat ini. */
  function majelisAwal() {
    const srv = S.data?.majelis;
    if (srv && srv.ketua) return srv;
    try { return JSON.parse(localStorage.getItem(kunciMajelis()) || 'null') || {}; } catch (e) { return {}; }
  }

  /** Pilihan isi berkas: semua → bidang terbuka → tahap terbuka (yang kosong dibuang). */
  function pilihanCakupan() {
    const o = [{ k: 'semua', label: 'Semua perkara menunggu', list: tunggu(butir()) }];
    if (S.bidang) o.push({ k: 'bidang', label: `Bidang ${S.bidang}`, list: tunggu(diBidang()) });
    if (S.bidang && S.kategori && S.tahap != null) o.push({ k: 'tahap', label: `${S.bidang} · ${S.kategori} · tahap ke-${S.tahap || '?'}`, list: tunggu(diTahap()) });
    return o.filter(x => x.list.length);
  }

  /** Teks aman untuk Helvetica (WinAnsi): tanda kutip/pisah dirapikan, diakritik dilepas. */
  function teksPdf(s) {
    return String(s == null ? '' : s)
      .replace(/[‘’ʼʻ]/g, "'").replace(/[“”]/g, '"')
      .replace(/[–—−]/g, '-').replace(/…/g, '...').replace(/[•●]/g, '-')
      .normalize('NFKD').replace(/[̀-ͯ]/g, '')
      .replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, '').replace(/\s+/g, ' ').trim();
  }
  const tglPanjang = (k) => { const d = tglObj(k); return `${d.getUTCDate()} ${BULAN[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };

  /** Bahan PDF yang sudah tersusun (dipisah supaya bisa diuji tanpa jsPDF). */
  function isiBerkas(list, majelisNama, cakupanLabel) {
    // I · Daftar panggil: satu baris per santri (bisa membawa >1 perkara), dikelompokkan per kelas.
    const peta = new Map();
    list.forEach(b => {
      const k = `${b.nama}|${b.kelas}`;
      const x = peta.get(k) || { nama: b.nama, kelas: b.kelas, kamar: b.kamar, hadir: b.hadir, n: 0 };
      x.n++; if (!hadir(b)) x.hadir = b.hadir; peta.set(k, x);
    });
    const santri = [...peta.values()].sort((a, b) => urutKelas(a.kelas, b.kelas) || urutTeks(a.nama, b.nama));
    const panggil = [...kelompok(santri, s => s.kelas || '-')].map(([kelas, l]) => ({ kelas, santri: l }));
    // II · Rincian: bidang → kategori (Sedang dulu) → tahap → bentuk.
    const rincian = [...kelompok(list, b => b.bidang || 'Belum Dipetakan')].sort((a, b) => b[1].length - a[1].length || urutTeks(a[0], b[0]))
      .map(([bidang, lb]) => ({
        bidang, n: lb.length,
        sub: [...kelompok(lb, b => `${b.kategori}|${Number(b.tahap) || 0}|${b.bentuk || '-'}`)]
          .map(([k, l]) => { const [kategori, tahap, bentuk] = k.split('|'); return { kategori, tahap: Number(tahap), bentuk, ket: l.find(x => x.ket)?.ket || '',
            baris: l.slice().sort((a, b) => urutKelas(a.kelas, b.kelas) || urutTeks(a.nama, b.nama)) }; })
          .sort((a, b) => (a.kategori === b.kategori ? 0 : a.kategori === 'Sedang' ? -1 : 1) || a.tahap - b.tahap || urutTeks(a.bentuk, b.bentuk))
      }));
    return { sesi: sesiBerkas(), unit: unitBerkas(), cakupan: cakupanLabel, nPerkara: list.length, nSantri: santri.length,
      panggil, rincian, majelis: majelisNama || {}, persiapan: persiapan(), dicetak: new Date() };
  }

  /**
   * Gambar berkas ke dokumen jsPDF yang masih kosong.
   * kertas: baris UKURAN_KERTAS dari app.js ({ lebar, tinggi, margin:[atas,kiri,bawah,kanan], format }).
   */
  function gambarBerkasPdf(pdf, kertas, isi, logo) {
    const [mT, mL, mB, mR] = kertas.margin;
    const W = kertas.lebar, H = kertas.tinggi, L = W - mL - mR, KAKI = 8;
    const PT = 0.3528;
    let y = mT;
    const huruf = (n, g) => { pdf.setFont('helvetica', g || 'normal'); pdf.setFontSize(n); };
    const tinta = (r, g, b) => pdf.setTextColor(r, g, b);
    const sisa = () => H - mB - KAKI - y;
    const halamanBaru = () => { pdf.addPage(Array.isArray(kertas.format) ? kertas.format.slice() : kertas.format, 'portrait'); y = mT; };
    const naik = (fs) => fs * PT * 0.8;                     // jarak puncak huruf → garis dasar

    /* ---- kop ---- */
    if (logo && logo.uri) {
      const h = 18, w = Math.min(28, h * (logo.w || 160) / (logo.h || 94));
      try { pdf.addImage(logo.uri, 'PNG', mL, y, w, h, 'logoKopSidang', 'FAST'); } catch (e) { console.warn('[berkas] logo dilewati:', e.message); }
    }
    huruf(6.8); tinta(100, 116, 139); pdf.text('SISTEM INFORMASI PENGEMBANGAN SANTRI', W / 2, y + 4, { align: 'center' });
    huruf(15, 'bold'); tinta(15, 23, 42); pdf.text('DAYAH RUHUL QURANI', W / 2, y + 10.4, { align: 'center' });
    huruf(7.6); tinta(100, 116, 139); pdf.text(teksPdf(`Aceh Barat, Provinsi Aceh · Majelis Ta'dib OSDA ${isi.unit}`), W / 2, y + 15, { align: 'center' });
    y += 20.5;
    pdf.setDrawColor(15, 23, 42); pdf.setLineWidth(0.7); pdf.line(mL, y, W - mR, y);
    pdf.setLineWidth(0.25); pdf.line(mL, y + 1.1, W - mR, y + 1.1);
    y += 7;

    /* ---- judul ---- */
    huruf(12.5, 'bold'); tinta(28, 26, 46); pdf.text("BERKAS PERKARA SIDANG TA'DIB", W / 2, y, { align: 'center' });
    y += 5.2;
    huruf(9.5); pdf.text(teksPdf(`OSDA ${isi.unit} · ${labelHari(isi.sesi, true)}`), W / 2, y, { align: 'center' });
    y += 4.8;
    huruf(7.8); tinta(90, 96, 112);
    pdf.text(teksPdf(`${isi.cakupan} · ${angka(isi.nPerkara)} perkara · ${angka(isi.nSantri)} santri · Ringan & Sedang, angkatan VII-X`), W / 2, y, { align: 'center' });
    y += 7;

    /* ---- tabel berpaginasi ---- */
    const PAD = 1.6;
    function tabel(kolom, baris) {
      const tetap = kolom.reduce((a, k) => a + (k.lebar || 0), 0);
      const bobot = kolom.reduce((a, k) => a + (k.lebar ? 0 : (k.bobot || 1)), 0);
      const lebar = kolom.map(k => k.lebar || (L - tetap) * (k.bobot || 1) / bobot);
      const kepala = () => {
        const h = 6.6;
        pdf.setFillColor(28, 26, 46); pdf.rect(mL, y, L, h, 'F');
        huruf(7.4, 'bold'); tinta(247, 241, 220);
        let x = mL;
        kolom.forEach((k, i) => {
          const tx = k.rata === 'center' ? x + lebar[i] / 2 : x + PAD;
          pdf.text(k.judul, tx, y + h / 2 + 1.2, { align: k.rata === 'center' ? 'center' : 'left' });
          x += lebar[i];
        });
        y += h;
      };
      if (sisa() < 22) halamanBaru();
      kepala();
      let zebra = 0, no = 0;
      baris.forEach((b, bi) => {
        if (b.grup) {
          const h = b.tingkat === 2 ? 6 : 6.6;
          // judul kelompok tidak boleh tertinggal sendirian di dasar halaman
          if (sisa() < h + 7.5) { halamanBaru(); kepala(); }
          if (b.tingkat === 2) pdf.setFillColor(246, 241, 226); else pdf.setFillColor(232, 225, 205);
          pdf.rect(mL, y, L, h, 'F');
          huruf(b.tingkat === 2 ? 7.8 : 8.4, 'bold'); tinta(28, 26, 46);
          const kanan = b.kanan ? teksPdf(b.kanan) : '';
          huruf(7.4); const lebarKanan = kanan ? pdf.getTextWidth(kanan) + 4 : 0;
          huruf(b.tingkat === 2 ? 7.8 : 8.4, 'bold');
          const potong = pdf.splitTextToSize(teksPdf(b.grup), L - PAD * 2 - lebarKanan - 4);
          const kiri = (potong[0] || '') + (potong.length > 1 ? '...' : '');
          pdf.text(kiri, mL + PAD, y + h / 2 + 1.2);
          if (kanan) { huruf(7.4); tinta(74, 71, 99); pdf.text(kanan, W - mR - PAD, y + h / 2 + 1.2, { align: 'right' }); }
          y += h; zebra = 0;
          if (b.nol) no = 0;
          return;
        }
        const FS = 8.2, LH = FS * PT * 1.22;
        no++;
        const sel = b.sel.map(t => t === '#' ? String(no) : t);
        const isiSel = sel.map((t, i) => kolom[i].cek ? [] : (huruf(FS, kolom[i].tebal ? 'bold' : 'normal'), pdf.splitTextToSize(teksPdf(t), lebar[i] - PAD * 2)));
        const nBaris = Math.max(1, ...isiSel.map(l => l.length));
        const h = Math.max(6.2, nBaris * LH + 2.8);
        if (sisa() < h) { halamanBaru(); kepala(); }
        if (zebra++ % 2) { pdf.setFillColor(249, 247, 242); pdf.rect(mL, y, L, h, 'F'); }
        pdf.setDrawColor(217, 211, 195); pdf.setLineWidth(0.15); pdf.line(mL, y + h, W - mR, y + h);
        let x = mL;
        sel.forEach((t, i) => {
          const k = kolom[i];
          if (k.cek) {
            const s = 3.6; pdf.setDrawColor(74, 71, 99); pdf.setLineWidth(0.3);
            pdf.rect(x + (lebar[i] - s) / 2, y + (h - s) / 2, s, s);
          } else if (isiSel[i].length) {
            huruf(FS, k.tebal ? 'bold' : 'normal');
            if (k.redup) tinta(96, 102, 118); else tinta(28, 26, 46);
            const tx = k.rata === 'center' ? x + lebar[i] / 2 : x + PAD;
            pdf.text(isiSel[i], tx, y + 1.4 + naik(FS), { align: k.rata === 'center' ? 'center' : 'left', lineHeightFactor: 1.22 });
          }
          x += lebar[i];
        });
        y += h;
      });
      y += 5;
    }
    function judulBagian(t, kanan) {
      if (sisa() < 26) halamanBaru();
      huruf(10.5, 'bold'); tinta(142, 27, 50); pdf.text(t, mL, y + 3.6);
      if (kanan) { huruf(7.6); tinta(96, 102, 118); pdf.text(teksPdf(kanan), W - mR, y + 3.6, { align: 'right' }); }
      y += 6.6;
    }

    /* ---- I · daftar panggil ---- */
    judulBagian('I. DAFTAR PANGGIL', 'Centang kolom Hadir saat nama dipanggil');
    const barisPanggil = [];
    isi.panggil.forEach(g => {
      barisPanggil.push({ grup: `Kelas ${g.kelas}`, kanan: `${angka(g.santri.length)} santri`, nol: false });
      g.santri.forEach(s => barisPanggil.push({ sel: ['#', s.nama, s.kamar ? `Kamar ${s.kamar}` : '-', `${angka(s.n)} perkara`, hadir(s) ? '' : s.hadir, ''] }));
    });
    tabel([
      { judul: 'No', lebar: 10, rata: 'center', redup: true },
      { judul: 'Nama santri', tebal: true },
      { judul: 'Kamar', lebar: 22, rata: 'center' },
      { judul: 'Perkara', lebar: 20, rata: 'center' },
      { judul: 'Keterangan', lebar: 30, redup: true },
      { judul: 'Hadir', lebar: 14, rata: 'center', cek: true }
    ], barisPanggil);

    /* ---- II · rincian perkara ---- */
    judulBagian('II. RINCIAN PERKARA', 'Centang kolom Dibacakan saat putusan dibacakan');
    const barisRinci = [];
    isi.rincian.forEach(r => {
      barisRinci.push({ grup: `Bidang ${r.bidang}`, kanan: `${angka(r.n)} perkara` });
      r.sub.forEach(sb => {
        barisRinci.push({ grup: `${sb.kategori} · tahap ke-${sb.tahap || '?'} · Pembinaan: ${sb.bentuk}${sb.ket ? ` (${sb.ket})` : ''}`, kanan: `${angka(sb.baris.length)}`, tingkat: 2, nol: true });
        sb.baris.forEach(b => barisRinci.push({ sel: ['#', b.nama, b.kelas, b.pelanggaran, labelTgl(b.tanggal), ''] }));
      });
    });
    tabel([
      { judul: 'No', lebar: 10, rata: 'center', redup: true },
      { judul: 'Nama santri', bobot: 0.9, tebal: true },
      { judul: 'Kelas', lebar: 16, rata: 'center' },
      { judul: 'Pelanggaran', bobot: 1.25 },
      { judul: 'Dicatat', lebar: 16, rata: 'center', redup: true },
      { judul: 'Dibacakan', lebar: 18, rata: 'center', cek: true }
    ], barisRinci);

    /* ---- III · majelis sidang ---- */
    if (sisa() < 58) halamanBaru();
    judulBagian('III. MAJELIS SIDANG');
    huruf(9); tinta(28, 26, 46);
    pdf.text(teksPdf(`Meulaboh, ${tglPanjang(isi.sesi)}`), W - mR, y + 2, { align: 'right' });
    y += 8;
    const kol = L / JABATAN.length;
    JABATAN.forEach(([k, label], i) => {
      const cx = mL + kol * i + kol / 2;
      huruf(8.6, 'bold'); tinta(74, 71, 99); pdf.text(label, cx, y, { align: 'center' });
      pdf.setDrawColor(28, 26, 46); pdf.setLineWidth(0.3); pdf.line(cx - kol / 2 + 5, y + 24, cx + kol / 2 - 5, y + 24);
      const nama = teksPdf(isi.majelis[k] || '');
      if (nama) { huruf(8.8, 'bold'); tinta(28, 26, 46); pdf.text(pdf.splitTextToSize(nama, kol - 8), cx, y + 28.5, { align: 'center', lineHeightFactor: 1.2 }); }
      else { huruf(8.4); tinta(150, 156, 170); pdf.text('(nama & tanda tangan)', cx, y + 28.5, { align: 'center' }); }
    });
    y += 38;
    huruf(7.4); tinta(110, 116, 130);
    const jam = (() => { try { return isi.dicetak.toLocaleString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' }); } catch (e) { return ''; } })();
    pdf.text(pdf.splitTextToSize(teksPdf(`Berkas disusun chemint ${jam} WIB${isi.persiapan ? ' (persiapan malam sebelum sidang)' : ''}. Perkara yang masuk sesudah waktu itu belum tercantum. Majelis membubuhkan tanda tangan dengan pena setelah sidang selesai.`), L), mL, y);

    /* ---- kaki setiap halaman ---- */
    const n = pdf.internal.getNumberOfPages();
    for (let i = 1; i <= n; i++) {
      pdf.setPage(i);
      huruf(7.2); tinta(150, 160, 172);
      pdf.text(teksPdf(`Berkas Perkara Sidang Ta'dib · OSDA ${isi.unit} · ${labelHari(isi.sesi, true)}`), mL, H - 6);
      pdf.text(`Halaman ${i} dari ${n}`, W - mR, H - 6, { align: 'right' });
    }
    return n;
  }

  async function bukaBerkas() {
    if (!bolehBerkas()) return A.toast('info', 'Tidak ada perkara yang menunggu sidang.');
    if (!A.pdfBaru) return A.toast('error', 'Pembuat PDF belum tersedia. Muat ulang aplikasi.');
    const m = majelisAwal();
    const ops = pilihanCakupan();
    const kertasL = A.kertasDaftar ? A.kertasDaftar() : [{ kode: 'A4', nama: 'A4', ukuran: '210 × 297 mm' }];
    const kAwal = A.kertasTersimpan ? A.kertasTersimpan() : 'A4';
    const isiMajelis = majelis();
    const sesi = sesiBerkas();
    const radio = (nama, nilai, judul, kecil, on) => `<label class="sd-opsi${on ? ' on' : ''}"><input type="radio" name="${nama}" value="${esc(nilai)}"${on ? ' checked' : ''}>
        <b>${esc(judul)}</b>${kecil ? `<small>${esc(kecil)}</small>` : ''}</label>`;
    const res = await A.Swal.fire({
      title: 'Berkas perkara',
      width: 640, showCancelButton: true, showDenyButton: true, reverseButtons: false,
      confirmButtonText: '<i class="fa-solid fa-file-pdf"></i> Unduh PDF',
      denyButtonText: '<i class="fa-solid fa-print"></i> Buka & cetak',
      cancelButtonText: 'Batal', confirmButtonColor: '#8E1B32', denyButtonColor: '#334155',
      showLoaderOnConfirm: true, showLoaderOnDeny: true, allowOutsideClick: () => !A.Swal.isLoading(),
      html: `<div class="sd-swal sd-berkas-form">
        <p class="sd-berkas-sesi"><i class="fa-solid fa-scale-balanced"></i><span>Sidang <b>${esc(labelHari(sesi, true))}</b> · OSDA ${esc(unitBerkas())}${persiapan() ? ' <em>persiapan</em>' : ''}</span></p>
        ${isiMajelis ? `<fieldset><legend>Majelis sidang</legend>
          <div class="sd-majelis-isian">${JABATAN.map(([k, l]) => `<label>${esc(l)}${k === 'ketua' ? ' <span class="sd-wajib">wajib</span>' : ''}
            <input type="text" id="sdM-${k}" maxlength="80" autocomplete="off" value="${esc(m[k] || '')}" placeholder="${k === 'panitera' ? 'Pencatat sidang' : 'Nama lengkap'}"></label>`).join('')}</div>
          <p class="sd-kecil">Nama tercetak di bawah ruang tanda tangan. Tanda tangan dibubuhkan dengan pena setelah berkas dicetak.</p>
        </fieldset>` : `<p class="sd-kecil">Majelis: ${m.ketua ? esc(JABATAN.map(([k, l]) => m[k] ? `${l} ${m[k]}` : '').filter(Boolean).join(' · ')) : 'belum diisi OSDA; kolom tanda tangan dicetak kosong.'}</p>`}
        <fieldset><legend>Isi berkas</legend>
          <div class="sd-opsi-daftar">${ops.map((o, i) => radio('sdCakupan', o.k, o.label, `${angka(o.list.length)} perkara · ${angka(santriUnik(o.list))} santri`, i === 0)).join('')}</div>
        </fieldset>
        <fieldset><legend>Kertas</legend>
          <div class="sd-opsi-daftar sd-opsi-baris">${kertasL.map(k => radio('sdKertas', k.kode, k.nama, k.ukuran, k.kode === kAwal)).join('')}</div>
        </fieldset>
      </div>`,
      didOpen: (el) => {
        el.addEventListener('change', (e) => {
          const r = e.target.closest('input[type="radio"]'); if (!r) return;
          el.querySelectorAll(`input[name="${r.name}"]`).forEach(x => x.closest('.sd-opsi')?.classList.toggle('on', x.checked));
        });
        if (isiMajelis && !m.ketua) setTimeout(() => el.querySelector('#sdM-ketua')?.focus(), 80);
      },
      preConfirm: () => siapkanBerkas('unduh'),
      preDeny: () => siapkanBerkas('cetak')
    });
    if (!(res.isConfirmed || res.isDenied) || !res.value) return;
    ucap('Berkas perkara siap. Panggil nama-nama ananda per kelas, lalu bacakan putusannya.', 'senang');
  }

  /** Kumpulkan isian → simpan majelis → bangun & serahkan PDF. Galat ditampilkan di jendela. */
  async function siapkanBerkas(aksi) {
    const pop = A.Swal.getPopup();
    const ambil = (id) => (pop.querySelector('#' + id)?.value || '').replace(/\s+/g, ' ').trim();
    const mj = majelis() ? Object.fromEntries(JABATAN.map(([k]) => [k, ambil('sdM-' + k)])) : (S.data?.majelis || {});
    if (majelis() && mj.ketua.length < 2) {
      A.Swal.showValidationMessage('Nama Hakim Ketua wajib diisi.');
      pop.querySelector('#sdM-ketua')?.focus();
      return false;
    }
    const kode = pop.querySelector('input[name="sdKertas"]:checked')?.value || 'A4';
    const cak = pilihanCakupan().find(o => o.k === (pop.querySelector('input[name="sdCakupan"]:checked')?.value || 'semua')) || pilihanCakupan()[0];
    if (!cak) { A.Swal.showValidationMessage('Tidak ada perkara yang menunggu.'); return false; }

    if (majelis()) {
      try { localStorage.setItem(kunciMajelis(), JSON.stringify(mj)); } catch (e) {}
      try {
        const { data, error } = await A.db.rpc('sidang_majelis_simpan', {
          p_sesi: sesiBerkas(), p_unit: S.data?.unit || null, p_ketua: mj.ketua,
          p_anggota1: mj.anggota1 || null, p_anggota2: mj.anggota2 || null, p_panitera: mj.panitera || null });
        if (error) throw error;
        if (S.data) S.data.majelis = data || mj;
      } catch (e) {
        // Berkas tetap dibuat: nama majelis tetap tercetak dari isian ini.
        console.warn('[berkas] majelis belum tersimpan di server:', e?.message || e);
        A.toast('warning', 'Nama majelis tercetak, tetapi belum tersimpan di server.');
      }
    }
    try {
      A.simpanKertas?.(kode);
      const [{ pdf, kertas }, logo] = await Promise.all([A.pdfBaru(kode), A.logoKop ? A.logoKop().catch(() => null) : null]);
      const isi = isiBerkas(cak.list, mj, cak.label);
      gambarBerkasPdf(pdf, kertas, isi, logo);
      const nama = `Berkas Sidang Tadib OSDA ${unitBerkas().replace(/ & /g, '-')} ${isi.sesi}${cak.k === 'semua' ? '' : ' - ' + teksPdf(cak.label).replace(/[^\w .-]+/g, ' ').trim()}.pdf`;
      if (aksi === 'cetak') {
        let buka = null;
        try { pdf.autoPrint(); buka = window.open(pdf.output('bloburl'), '_blank'); } catch (e) { buka = null; }
        if (!buka) { pdf.save(nama); A.toast('info', 'Jendela cetak diblokir peramban; PDF diunduh. Cetak dari berkas itu.'); }
      } else {
        pdf.save(nama);
        A.toast('success', `Berkas perkara (${kertas.nama}) diunduh: ${angka(isi.nPerkara)} perkara, ${angka(isi.nSantri)} santri.`);
      }
      return true;
    } catch (e) {
      A.Swal.showValidationMessage(`PDF gagal dibuat: ${e?.message || e}`);
      return false;
    }
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
    const mj = d.majelis;
    if (mj && mj.ketua && d.sesi_berkas === d.hari) {
      t += `\nMajelis: Hakim Ketua ${mj.ketua}` + (mj.anggota1 || mj.anggota2 ? ` · Hakim Anggota ${[mj.anggota1, mj.anggota2].filter(Boolean).join(', ')}` : '')
        + (mj.panitera ? ` · Panitera ${mj.panitera}` : '') + '\n';
    }
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
    if (a === 'berkas') return bukaBerkas();
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

  window.RQSidang = { buka, tutup, terbuka: () => !!S.akar, _uji: { S, daftarBidang, daftarKategori, daftarTahap, pilihanCakupan, isiBerkas, gambarBerkasPdf, teksPdf } };
})();
