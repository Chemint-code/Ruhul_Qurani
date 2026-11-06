/* =====================================================================
 * sidang.js — v2.69 · RUANG SIDANG TA'DIB: ANTREAN, BANDING, MAJELIS BERNAMA
 * ---------------------------------------------------------------------
 *  Halaman layar penuh yang terpisah dari kerangka aplikasi (bilah sisi,
 *  bilah atas, dan tab bawah disembunyikan). Dimuat lambat oleh app.js
 *  hanya ketika menu "Ruang Sidang Ta'dib" dibuka.
 *
 *  v2.68 menggantikan alur v2.64 (Bidang → Kategori → Tahap → centang →
 *  Bacakan → Sudah diberikan). Rancangan: rancangan-v2.68-antrean-banding.
 *
 *  BERKAS PER SANTRI
 *    Semua perkara Ringan/Sedang angkatan VII–X yang belum tuntas,
 *    dikelompokkan per santri dan diberi kode jumlah perkara:
 *      P1 hijau · P2 emas · P3 jingga · P4+ merah mawar.
 *    Urutan panggil: perkara paling sedikit → tahap tertinggi paling
 *    rendah → Ringan sebelum Sedang → kelas (Romawi) → nama.
 *    Kartu santri: daftar perkara (baru / sudah dibacakan / tertunda /
 *    banding ditolak), tangga tahap sejak tahap terakhir yang tuntas, dan
 *    izin dari tabel perizinan (bukan status keberadaan yang bisa basi).
 *
 *  ANTREAN PANGGIL — papan tik (di HP: empat tombol di layar)
 *    Enter   dipanggil → ketuk palu: dibacakan + diserahkan ke musyrif;
 *            perkara yang sudah di tangan musyrif DIBACAKAN ULANG dan
 *            musyrif menerima pengingat. Enter lagi → nama berikutnya.
 *    ↓       banding: semua perkara santri ditahan → Penasihat Hukum.
 *    Spasi   lewati (berizin / belum datang) → nama berikutnya; di akhir
 *            antrean ditawarkan memanggil ulang yang dilewati.
 *    Del     urungkan ketukan santri ini; bila belum diketuk → mundur
 *            ke santri sebelumnya (Backspace sama dengan Del).
 *    ← →     melihat tanpa memutus.   Esc  kembali ke daftar berkas.
 *    Penyimpanan berjalan di belakang (berurutan per santri); hakim tidak
 *    pernah menunggu server. Yang gagal ditandai dan bisa diketuk ulang.
 *
 *  PENASIHAT HUKUM (tab, akun OSDA yang sama; setiap hari)
 *    Banding per santri → per pasal: Kabulkan (alasan wajib) / Tolak.
 *    Banding manual untuk perkara lama. Yang dikabulkan dieksekusi super
 *    admin di halaman "Eksekusi Banding" (app.js).
 *
 *  v2.69 · MAJELIS BERNAMA · PENGESAHAN OSDA (rancangan-v2.69-majelis-pengesahan)
 *    Susunan majelis dipilih dari santri angkatan XI (tanpa NISN): Hakim
 *    Ketua, dua Hakim Anggota, Panitera, Penasihat, PJ eksekusi per kelompok
 *    bentuk (pembersihan · hafalan · shalat sunnah · pidato), Pembimbing
 *    (ustadz, opsional). Wajib sebelum unduh berkas & palu pertama (kecuali
 *    super admin). Apresiasi tercatat di server saat palu pertama diketuk.
 *    S  sahkan: perkara di tangan musyrif sejak sidang sebelumnya yang sudah
 *       dijalankan → "Disahkan OSDA" (musyrif boleh menyanggah 3 hari).
 *    M  susunan majelis.   Ucapan tercatat (bidang Bahasa) = alat bukti.
 *
 *  v2.70 · ALUR MAHKAMAH (rancangan-v2.70-alur-mahkamah)
 *    Tata letak: Meja Majelis (kursi bisa diklik) di bawah panggung; Bilah
 *    Majelis lengket sesudah panggung tergulir (titik kursi, lompat P1–P4,
 *    cari, Mulai); bilah jempol di HP; Rekap tidak lagi terpotong. Papan tik
 *    daftar: M = susunan majelis, / = cari.
 *    Gerak bermakna, tidak pernah menahan hakim: ① Pelantikan Majelis
 *    (sekali per sesi per unit) ② pembukaan: lengkung & ayat dijahit ③ palu
 *    pertama → cap apresiasi terbang ke kursi ④ diputus → berkas dilipat &
 *    diserahkan ⑤ kartu datang dari "Berikutnya"; lewati disisihkan; banding
 *    menimbang ⑥ cap "Disahkan OSDA" ⑦ penutupan: sapuan emas + 3 ketukan.
 *    Pembimbing dipilih dari Para Pendidik (tim_pendidik_rpc) beserta fotonya;
 *    tetap tersimpan sebagai nama seperti v2.69 (tanpa migrasi).
 *
 *  Batas sesungguhnya ada di database (migrasi v2.64, v2.65, v2.68, v2.69).
 *  Gerak: hanya transform & opacity. "Kurangi gerak" → tanpa tirai, palu,
 *  dan stempel. Bunyi palu (WebAudio) bisa dimatikan; mati di mode hemat.
 *  Satu-satunya pintu ke aplikasi: window.RQ_SIDANG (app.js).
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
  const AYAT = 'وَإِذَا حَكَمْتُمْ بَيْنَ النَّاسِ أَنْ تَحْكُمُوا بِالْعَدْلِ';
  /** Kode jumlah perkara. Warna di layar; di kertas tercetak sebagai teks. */
  const KODE = { 1: { k: 'P1', l: '1 perkara' }, 2: { k: 'P2', l: '2 perkara' }, 3: { k: 'P3', l: '3 perkara' }, 4: { k: 'P4+', l: '4 perkara atau lebih' } };
  const WARNA_PDF = { 1: [209, 250, 229], 2: [254, 243, 199], 3: [255, 237, 213], 4: [255, 228, 230] };
  const TAHAN = new Set(['diajukan', 'dikabulkan']);
  const LABEL_BANDING = {
    diajukan: 'Banding · di penasihat', dikabulkan: 'Banding dikabulkan · menunggu eksekusi',
    ditolak: 'Banding ditolak', dikembalikan: 'Banding dikembalikan super admin', dieksekusi: 'Banding dieksekusi'
  };
  const LABEL_KEADAAN = { dipanggil: 'Belum dipanggil', putus: 'Diputus', banding: 'Banding', lewati: 'Dilewati', kosong: 'Disahkan' };
  /* v2.69: kelompok bentuk pembinaan → penanggung jawab eksekusi (sama dengan sidang_kelompok() di database) */
  const KELOMPOK = { bersih: 'Pembersihan', hafal: 'Hafalan', shalat: 'Shalat Sunnah', pidato: 'Pidato' };
  const URUT_KELOMPOK = ['bersih', 'hafal', 'shalat', 'pidato'];
  const JABATAN_INTI = [['ketua', 'Hakim Ketua'], ['anggota1', 'Hakim Anggota I'], ['anggota2', 'Hakim Anggota II'], ['panitera', 'Panitera'], ['penasihat', 'Penasihat']];

  const S = {
    akar: null, data: null, unit: null, token: 0, sibuk: false, galat: '',
    tab: 'majelis', saring: 0, cari: '',
    bubble: '', ekspresi: 'normal', histori: false,
    santri: new Map(), urutan: [], diBanding: [],
    antre: null,               // { urutan:[kunci], i, ulang, mode:'putus'|'lihat', akhir }
    rantai: new Map(),         // kunci santri → janji simpan berurutan
    gagal: new Map(),          // kunci santri → pesan galat simpan
    tunda: 0,                  // simpanan yang belum selesai
    pendidik: null,            // v2.70: janji daftar Para Pendidik (nama + foto) untuk Pembimbing
    guru: null,                // v2.70: daftar yang sudah termuat
    lantik: null,              // v2.70: { tutup } selama Pelantikan Majelis tampil
    kilauMj: 0,                // v2.70: kursi majelis berkilau sampai cap waktu ini
    ditutup: new Set(),        // v2.70: sesi yang penutupannya sudah dimainkan
    pen: { data: null, sibuk: false, galat: '', saring: 'diajukan', token: 0 }
  };

  /* ---------- tanggal (WIB) ---------- */
  const tglObj = (k) => new Date(String(k).slice(0, 10) + 'T12:00:00+07:00');
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
  const tglJam = (ts) => ts ? `${labelTgl(kunciWib(ts))} ${jamWib(ts)}` : '-';
  const jadwalTeks = () => HARI_SIDANG.map(i => HARI[i % 7]).join(', ').replace(/, ([^,]+)$/, ' dan $1');
  const namaBulan = (ym) => { const m = /^(\d{4})-(\d{2})/.exec(ym || ''); return m ? BULAN[Number(m[2]) - 1] : ''; };

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
   *  DATA — berkas per santri
   * ================================================================= */
  const majelis = () => S.data?.peran === 'majelis';
  const reses = (d = S.data) => !!d && d.role === 'Osis' && !d.buka && !d.pratinjau;
  const persiapan = (d = S.data) => !!d && d.role === 'Osis' && !d.buka && !!d.pratinjau;
  const butir = () => S.data?.butir || [];
  const bolehPutus = () => majelis() && (S.data?.buka || S.data?.role === 'Admin');
  const tahan = (b) => TAHAN.has(b.banding);
  const terbuka = (b) => b.status === 'menunggu' || b.status === 'dibacakan' || b.status === 'diberikan';
  /** Sudah diketuk sesi ini (putus) atau ditahan banding yang diajukan sesi ini. */
  const selesaiSesi = (b) => b.hari_ini === 'putus' || (b.hari_ini === 'banding' && tahan(b));
  const bisaDipanggil = (b) => terbuka(b) && !tahan(b) && b.hari_ini !== 'putus';
  /** v2.69: server mengirim susunan majelis bernama (sidang_berkas versi ≥ 269). */
  const adaPanitia = () => !!S.data?.panitia;
  /** Majelis wajib dilengkapi dulu (super admin dikecualikan). */
  const perluMajelis = () => majelis() && adaPanitia() && !S.data.super && !S.data.panitia.lengkap;
  /** Perkara di tangan musyrif sejak sidang SEBELUMNYA — bisa disahkan OSDA bila sudah dijalankan. */
  const siapSah = (s) => (s?.sesi || []).filter(b => b.status === 'diberikan' && b.sesi && b.sesi < S.data.hari && !tahan(b));
  const urutTeks = (a, b) => String(a || '').localeCompare(String(b || ''), 'id', { numeric: true, sensitivity: 'base' });
  /** Kelas berangka Romawi: VII-D < VIII-A < IX-F < X-C (bukan urutan abjad). */
  const ROMAWI = { I: 1, V: 5, X: 10, L: 50 };
  const angkaKelas = (k) => { const r = (String(k || '').match(/^[IVXL]+/i) || [''])[0].toUpperCase(); let n = 0;
    for (let i = 0; i < r.length; i++) { const v = ROMAWI[r[i]], w = ROMAWI[r[i + 1]] || 0; n += v < w ? -v : v; } return n || 99; };
  const urutKelas = (a, b) => angkaKelas(a) - angkaKelas(b) || urutTeks(a, b);
  const urutPerkara = (a, b) => (a.kategori === b.kategori ? 0 : a.kategori === 'Ringan' ? -1 : 1)
    || (Number(a.tahap) || 0) - (Number(b.tahap) || 0) || urutTeks(a.tanggal, b.tanggal);
  /** Urutan panggil (rancangan v2.68 §3.1). */
  const urutSantri = (a, b) => a.jumlah - b.jumlah || a.tahapMaks - b.tahapMaks || (a.sedang - b.sedang)
    || urutKelas(a.kelas, b.kelas) || urutTeks(a.nama, b.nama);

  function keadaan(s) {
    const l = s.sesi; if (!l.length) return 'kosong';
    const sisa = l.filter(b => !selesaiSesi(b));
    if (!sisa.length) return l.some(b => b.hari_ini === 'putus') ? 'putus' : 'banding';
    if (sisa.length === l.length && sisa.every(b => b.hari_ini === 'lewati')) return 'lewati';
    return 'dipanggil';
  }

  /** Susun ulang peta santri & urutan antrean dari butir (dipanggil setiap data berubah). */
  function susun() {
    const m = new Map();
    for (const b of butir()) {
      const k = b.santri || `${b.nama}|${b.kelas}`;
      if (!m.has(k)) m.set(k, { kunci: k, nama: b.nama, kelas: b.kelas, kamar: b.kamar, hadir: b.hadir, unit: b.unit, nisn: b.nisn, semua: [], langkah: null });
      m.get(k).semua.push(b);
    }
    const info = S.data?.santri || {};
    const lama = S.santri;
    for (const s of m.values()) {
      s.info = info[s.kunci] || {};
      s.langkah = lama.get(s.kunci)?.langkah || null;     // ketukan terakhir (untuk Del) bertahan antar-susun
      s.sesi = s.semua.filter(b => selesaiSesi(b) || bisaDipanggil(b)).sort(urutPerkara);
      s.tertahan = s.semua.filter(b => tahan(b) && b.hari_ini !== 'banding');
      s.jumlah = s.sesi.length;
      s.P = Math.min(Math.max(s.jumlah, 1), 4);
      s.tahapMaks = Math.max(0, ...s.sesi.map(b => Number(b.tahap) || 0));
      s.sedang = s.sesi.some(b => b.kategori === 'Sedang') ? 1 : 0;
      s.baru = s.sesi.filter(b => b.baru).length;
      s.keadaan = keadaan(s);
    }
    S.santri = m;
    const semua = [...m.values()];
    S.urutan = semua.filter(s => s.jumlah > 0).sort(urutSantri).map(s => s.kunci);
    S.diBanding = semua.filter(s => s.jumlah === 0 && s.tertahan.length).sort((a, b) => urutKelas(a.kelas, b.kelas) || urutTeks(a.nama, b.nama));
  }
  const santriDi = (k) => S.santri.get(k);
  const daftarAntre = () => S.urutan.map(santriDi).filter(Boolean);
  function hitungSesi() {
    const c = { total: 0, dipanggil: 0, putus: 0, banding: 0, lewati: 0, perkara: 0, ulang: 0, P: { 1: [0, 0], 2: [0, 0], 3: [0, 0], 4: [0, 0] } };
    for (const s of daftarAntre()) {
      c.total++; c[s.keadaan] = (c[s.keadaan] || 0) + 1;
      c.P[s.P][0]++; if (s.keadaan !== 'dipanggil') c.P[s.P][1]++;
      if (s.keadaan === 'putus') { c.perkara += s.sesi.filter(b => b.hari_ini === 'putus').length; c.ulang += s.sesi.filter(b => b.hari_ini === 'putus' && b.status === 'diberikan' && b.sesi && b.sesi !== S.data.hari).length; }
    }
    return c;
  }

  async function muat(diam) {
    const t = ++S.token;
    if (!diam) { S.sibuk = true; gambarIsi(); }
    try {
      const { data, error } = await A.db.rpc('sidang_berkas', { p_unit: S.unit || null });
      if (t !== S.token) return;
      if (error) throw error;
      if (!data || !Array.isArray(data.butir)) throw new Error('Jawaban server tidak dikenali.');
      if (Number(data.versi) < 268 && data.butir.length) throw new Error('Ruang Sidang v2.68 belum aktif di server. Admin perlu menerapkan migrasi v2.68 (antrean & banding).');
      S.data = data; S.galat = '';
      if (data.unit_terkunci) S.unit = data.unit;
      susun();
    } catch (e) {
      if (t !== S.token) return;
      const m = String(e?.message || e);
      S.galat = /sidang_berkas|function .* does not exist|Could not find the function/i.test(m)
        ? 'Ruang Sidang belum aktif di server. Admin perlu menerapkan migrasi v2.64–v2.68.'
        : m;
    } finally {
      if (t === S.token) { S.sibuk = false; gambarSemua(); if (S.antre) gambarAntre(); }
    }
  }

  /* =================================================================
   *  SIMPAN DI BELAKANG — berurutan per santri, tampilan tidak menunggu
   * ================================================================= */
  const pesanGalat = (e) => String(e?.message || e || 'gagal').replace(/^.*?:\s*(?=[A-Z])/, '');
  function antri(kunci, fn) {
    S.tunda++; gambarSimpan();
    const p = (S.rantai.get(kunci) || Promise.resolve()).then(fn);
    const ekor = p.catch(() => {}).finally(() => {
      S.tunda--; gambarSimpan();
      if (S.rantai.get(kunci) === ekor) S.rantai.delete(kunci);
    });
    S.rantai.set(kunci, ekor);
    return p;
  }
  function potretSantri(s) { return new Map(s.semua.map(b => [b.id, JSON.parse(JSON.stringify(b))])); }
  function pulihkan(s, potret) {
    for (const b of s.semua) {
      const p = potret.get(b.id); if (!p) continue;
      for (const k of Object.keys(b)) if (!(k in p)) delete b[k];
      Object.assign(b, p);
    }
  }

  /** Satu ketukan (putus | banding | lewati) untuk satu santri. */
  function rekam(s, aksi) {
    const ids = s.sesi.filter(b => !selesaiSesi(b)).map(b => b.id);
    if (!ids.length) return false;
    const potret = potretSantri(s);
    const hari = S.data.hari;
    for (const b of s.semua) {
      if (!ids.includes(b.id)) continue;
      b.hari_ini = aksi; b.panggilan = null; b._tunda = true;
      if (aksi === 'putus') {
        if (b.status === 'diberikan') { b.ulang = (Number(b.ulang) || 0) + 1; b._ulangKini = true; }
        else { b.status = 'diberikan'; b.sesi = b.sesi || hari; }
      } else if (aksi === 'banding') b.banding = 'diajukan';
    }
    if (aksi === 'banding') S.data.banding_baru = (Number(S.data.banding_baru) || 0) + ids.length;
    S.gagal.delete(s.kunci);
    const langkah = { aksi, ids, potret, panggilan: null, janji: null };
    s.langkah = langkah;
    const rpc = aksi === 'putus' ? 'sidang_putus' : aksi === 'banding' ? 'sidang_banding_ajukan' : 'sidang_lewati';
    langkah.janji = antri(s.kunci, async () => {
      const { data, error } = await A.db.rpc(rpc, { p_ids: ids });
      if (error) throw error;
      langkah.panggilan = data?.panggilan || null;
      for (const b of s.semua) if (ids.includes(b.id)) { b.panggilan = langkah.panggilan; delete b._tunda; }
      if (aksi === 'putus') {
        // v2.69: ketukan pertama yang tersimpan → server mencatat apresiasi majelis
        if (S.data?.panitia?.lengkap && !S.data.panitia.kredit) { S.data.panitia.kredit = true; if (!S.antre) gambarIsi(); else capApresiasi(); }
        const pen = Array.isArray(data?.penerima) ? data.penerima : [];
        for (const b of s.semua) if (ids.includes(b.id) && !b._ulangKini && pen.length) b.penerima = pen;
        // kelas tanpa musyrif: putusan dibacakan, laporannya belum terkirim
        if (Array.isArray(data?.dilewati) && data.dilewati.length) {
          for (const b of s.semua) if (ids.includes(b.id) && !b._ulangKini) b.status = 'dibacakan';
          A.toast('warning', `${s.nama}: ${data.dilewati[0].sebab}`);
        }
        if (s.kunci === kunciKini()) ucapAntre(s);
      }
      return data;
    }).catch((e) => {
      const kini_ = santriDi(s.kunci);
      if (kini_ && kini_.langkah === langkah) kini_.langkah = null;
      if (s.langkah === langkah) s.langkah = null;
      pulihkan(s, potret);
      if (aksi === 'banding') S.data.banding_baru = Math.max(0, (Number(S.data.banding_baru) || 0) - ids.length);
      const mentah = String(e?.message || e || '');
      if (/Susunan majelis/.test(mentah)) {          // v2.69: gerbang server (kelompok baru / majelis berubah)
        if (S.data?.panitia) S.data.panitia.lengkap = false;
        S.gagal.set(s.kunci, mentah);
        A.toast('error', mentah);
        muat(true);
      } else {
        S.gagal.set(s.kunci, pesanGalat(e));
        A.toast('error', `${s.nama}: belum tersimpan — ${pesanGalat(e)}`);
      }
      susun(); gambarSemua(); if (S.antre) gambarAntre();
    });
    susun();
    return true;
  }

  /** Del: tarik ketukan santri ini (laporan & pengingat ke musyrif ikut ditarik). */
  function urungkan(s) {
    const l = s.langkah;
    // ketukan sebelum halaman dimuat ulang: tidak ada potret lokal, pakai id panggilan dari server
    const pidServer = l ? null : (s.sesi.find(b => b.panggilan && (selesaiSesi(b) || b.hari_ini === 'lewati'))?.panggilan || null);
    if (!l && !pidServer) return false;
    if (l) {
      pulihkan(s, l.potret);
      if (l.aksi === 'banding') S.data.banding_baru = Math.max(0, (Number(S.data.banding_baru) || 0) - l.ids.length);
    } else {
      for (const b of s.sesi) if (b.panggilan === pidServer) { b.hari_ini = null; b._tunda = true; }
    }
    s.langkah = null;
    S.gagal.delete(s.kunci);
    susun();
    antri(s.kunci, async () => {
      let pid = pidServer;
      if (l) { await l.janji; pid = l.panggilan; }
      if (!pid) return;                       // ketukan tadi tidak sempat tersimpan → tak ada yang ditarik
      const { data, error } = await A.db.rpc('sidang_urungkan', { p_id: pid });
      if (error) throw error;
      if (data?.tuntas) A.toast('info', `${angka(data.tuntas)} perkara sudah disahkan musyrif sehingga tidak ikut ditarik.`);
      if (data?.banding_tertahan) A.toast('warning', 'Sebagian banding sudah diputus penasihat dan tidak ikut dicabut.');
      if (!l) await muat(true);
    }).catch((e) => { A.fireError(e); muat(true); });
    return true;
  }

  /* =================================================================
   *  GAMBAR — kerangka, bilah atas, panggung
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
        <div class="sd-bilah" id="sdBilah" hidden inert></div>
        <div class="sd-panggung" id="sdPanggung"></div>
        <nav class="sd-tab" id="sdTab" aria-label="Bagian ruang sidang"></nav>
        <div class="sd-isi" id="sdIsi"></div>
      </div>
      <nav class="sd-jempol" id="sdJempol" aria-label="Aksi cepat majelis" hidden></nav>
      <div class="sd-tirai" id="sdTirai" aria-hidden="true"><i></i><i></i></div>`;
    return el;
  }

  function gambarSemua() { gambarAtas(); gambarPanggung(); gambarTab(); gambarIsi(); }

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
    const mj = d && S.tab === 'majelis' && !reses(d) && S.urutan.length ? titikKursi('sdAtasMj') : '';
    kanan.innerHTML = mj + status + unit + berkas + bunyi +
      `<button type="button" class="sd-ikon" data-aksi="segarkan" title="Muat ulang berkas"><i class="fa-solid fa-rotate"></i><span class="sr-only">Muat ulang</span></button>`;
  }

  function kalimatHakim() {
    const d = S.data;
    if (S.galat) return 'Berkas belum bisa dibuka. Periksa sambungan, lalu muat ulang.';
    if (!d) return 'Bismillah. Berkas perkara sedang disiapkan…';
    if (S.tab === 'penasihat') {
      const n = Number(d.banding_baru) || 0;
      return n ? `Ada ${angka(n)} pasal banding menunggu pertimbangan Penasihat Hukum. Periksa catatannya dengan teliti dan adil.`
               : 'Tidak ada banding yang menunggu. Penasihat juga dapat mengajukan banding manual untuk perkara lama.';
    }
    if (reses(d)) return `Majelis sedang reses. Sidang berikutnya ${labelHari(d.berikut, true)}.`;
    const c = hitungSesi();
    if (persiapan(d)) return c.total
      ? `Persiapan sidang ${labelHari(d.sesi_berkas || d.berikut, true)}: ${angka(c.total)} santri akan dipanggil. Unduh berkasnya malam ini.`
      : `Persiapan sidang ${labelHari(d.sesi_berkas || d.berikut, true)}. Alhamdulillah, belum ada perkara yang menunggu.`;
    if (!majelis()) return 'Anda hadir sebagai pengamat. Putusan dibacakan dan diserahkan oleh majelis OSDA.';
    if (S.bubble) return S.bubble;
    if (!c.total) return 'Alhamdulillah, tidak ada perkara Ringan atau Sedang yang menunggu sidang.';
    if (perluMajelis() && c.dipanggil) { const t = kursiTerisi();
      return `Bismillah. Sebelum palu diketuk, lengkapi dulu susunan majelis — ${angka(t.dari - t.n)} kursi masih kosong. Tekan M atau klik kursinya.`; }
    if (!c.dipanggil) return c.lewati
      ? `Semua sudah dipanggil. ${angka(c.lewati)} santri dilewati — panggil ulang bila sudah hadir.`
      : 'Alhamdulillah, seluruh antrean sudah diputus. Salin berita acara untuk arsip syura.';
    const s = santriDi(S.urutan.find(k => santriDi(k)?.keadaan === 'dipanggil'));
    return `Sidang dibuka. ${angka(c.dipanggil)} santri menunggu dipanggil${s ? `, dimulai dari ananda ${s.nama}` : ''}. Tekan Enter untuk memulai.`;
  }

  function gambarPanggung() {
    if (!S.akar) return;
    const d = S.data;
    S.ekspresi = S.galat ? 'serius' : reses(d) && S.tab !== 'penasihat' ? 'tidur' : S.ekspresi === 'tidur' ? 'normal' : S.ekspresi;
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

  function gambarTab() {
    const el = S.akar?.querySelector('#sdTab'); if (!el) return;
    if (!S.data || !majelis()) { el.hidden = true; return; }
    el.hidden = false;
    const n = Number(S.data.banding_baru) || 0;
    el.innerHTML = `
      <button type="button" data-aksi="tab" data-nilai="majelis" aria-pressed="${S.tab === 'majelis'}"><i class="fa-solid fa-gavel"></i>Majelis</button>
      <button type="button" data-aksi="tab" data-nilai="penasihat" aria-pressed="${S.tab === 'penasihat'}"><i class="fa-solid fa-user-shield"></i>Penasihat Hukum${n ? `<span class="sd-lencana">${angka(n)}</span>` : ''}</button>`;
  }

  /* =================================================================
   *  DAFTAR BERKAS (tab Majelis)
   * ================================================================= */
  const kodeHtml = (P, kecil) => `<span class="sd-kode p${P}${kecil ? ' kecil' : ''}" title="${esc(KODE[P].l)}">${KODE[P].k}</span>`;
  function tandaSantri(s) {
    const t = [];
    if (s.baru) t.push(`<span class="sd-tanda baru">${angka(s.baru)} baru</span>`);
    const ul = s.sesi.filter(b => b.status === 'diberikan' && !b._ulangKini && b.hari_ini !== 'putus').length;
    if (ul) t.push(`<span class="sd-tanda ulang">${angka(ul)} dibacakan ulang</span>`);
    const sah = S.data?.hari ? siapSah(s).length : 0;
    if (sah) t.push(`<span class="sd-tanda siap-sah"><i class="fa-solid fa-stamp"></i>${angka(sah)} siap disahkan</span>`);
    const osda = s.semua.filter(b => b.sah_osda).length;
    if (osda) t.push(`<span class="sd-tanda sah-osda"><i class="fa-solid fa-stamp"></i>${angka(osda)} disahkan OSDA</span>`);
    const tol = s.sesi.filter(b => b.banding === 'ditolak' || b.banding === 'dikembalikan').length;
    if (tol) t.push(`<span class="sd-tanda tolak">banding ditolak</span>`);
    if (s.tertahan.length) t.push(`<span class="sd-tanda tahan"><i class="fa-solid fa-scale-balanced"></i>${angka(s.tertahan.length)} dalam banding</span>`);
    const iz = s.info?.izin;
    if (iz) t.push(`<span class="sd-tanda izin ${iz.kondisi}"><i class="fa-solid ${/sakit/i.test(iz.jenis || '') ? 'fa-bed' : 'fa-door-open'}"></i>${iz.kondisi === 'aktif' ? 'Izin aktif' : 'Izin lewat batas'}</span>`);
    if (S.gagal.has(s.kunci)) t.push(`<span class="sd-tanda gagal"><i class="fa-solid fa-triangle-exclamation"></i>belum tersimpan</span>`);
    return t.join('');
  }
  function barisSantri(s) {
    const st = s.keadaan;
    return `<li><button type="button" class="sd-baris k-${st}" data-aksi="buka-santri" data-nilai="${esc(s.kunci)}">
      ${kodeHtml(s.P)}
      <span class="sd-baris-isi"><b>${esc(s.nama)}</b>
        <small>${esc(s.kelas)}${s.kamar ? ` · Kamar ${esc(s.kamar)}` : ''} · ${angka(s.jumlah)} perkara · tahap tertinggi ke-${angka(s.tahapMaks || 0)}</small>
        <span class="sd-baris-tanda">${tandaSantri(s)}</span></span>
      <span class="sd-baris-keadaan k-${st}">${st === 'putus' ? '<i class="fa-solid fa-check"></i>' : st === 'banding' ? '<i class="fa-solid fa-scale-balanced"></i>' : st === 'lewati' ? '<i class="fa-solid fa-forward"></i>' : ''}${LABEL_KEADAAN[st] || ''}</span>
    </button></li>`;
  }

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
    if (S.tab === 'penasihat' && majelis()) { gambarPenasihat(); return; }
    if (reses(d)) { el.innerHTML = htmlReses(); return; }

    const c = hitungSesi();
    const pengamat = !majelis()
      ? `<p class="sd-catatan"><i class="fa-solid fa-eye"></i>Mode pengamat: Anda melihat berkas${d.role !== 'Admin' ? ' sesuai lingkup akun Anda' : ''}. Memanggil dan memutus adalah tugas majelis OSDA.</p>` : '';
    const catatan = persiapan(d)
      ? `<p class="sd-catatan sd-catatan-persiapan"><i class="fa-solid fa-list-check"></i><span>Mode persiapan: berkas sidang <b>${esc(labelHari(d.sesi_berkas || d.berikut, true))}</b> sudah tersusun. Unduh dan cetak daftar panggilnya malam ini; putusan baru bisa diketuk besok.</span></p>`
      : majelis() && !d.buka
      ? `<p class="sd-catatan"><i class="fa-solid fa-clock"></i>Hari ini bukan hari sidang. Sebagai Admin Anda tetap dapat memutus; OSDA baru bisa memutus pada ${esc(jadwalTeks())}.</p>` : '';
    const antre = daftarAntre();
    const k = S.cari.trim().toLowerCase();
    const tampil = antre.filter(s => (!S.saring || s.P === S.saring)
      && (!k || [s.nama, s.kelas, s.kamar && `kamar ${s.kamar}`, ...s.sesi.map(b => b.pelanggaran)].join(' ').toLowerCase().includes(k)));
    const pertama = antre.find(s => s.keadaan === 'dipanggil');
    const kelompok = [1, 2, 3, 4].map(P => {
      const [n, sudah] = c.P[P];
      return `<button type="button" class="sd-kel p${P}${S.saring === P ? ' on' : ''}" data-aksi="saring" data-nilai="${P}" aria-pressed="${S.saring === P}"${n ? '' : ' disabled'}>
        ${kodeHtml(P)}<span class="sd-kel-isi"><b>${angka(n)} santri</b><small>${esc(KODE[P].l)}</small></span>
        <span class="sd-kel-bilah" style="--isi:${n ? Math.round(sudah / n * 100) : 0}%"><i></i></span></button>`;
    }).join('');
    const mulaiLbl = labelMulai(c);
    const grup = [1, 2, 3, 4].map(P => {
      const l = tampil.filter(s => s.P === P);
      if (!l.length) return '';
      return `<li class="sd-grup" data-p="${P}"><h4>${kodeHtml(P)}<span>${esc(KODE[P].l)}</span><small>${angka(l.length)} santri</small></h4>
        <ol class="sd-berkas">${l.map(barisSantri).join('')}</ol></li>`;
    }).join('');
    const bdg = S.diBanding.length ? `<section class="sd-kertas sd-tertahan">
        <h3><i class="fa-solid fa-scale-balanced"></i>Seluruh perkaranya dalam banding</h3>
        <p class="sd-kecil">Santri berikut tidak dipanggil sampai Penasihat Hukum memutus bandingnya.</p>
        <ul>${S.diBanding.map(s => `<li><b>${esc(s.nama)}</b> <span>${esc(s.kelas)}</span> <em>${s.tertahan.map(b => esc(LABEL_BANDING[b.banding] || '')).filter((x, i, a) => a.indexOf(x) === i).join(' · ')}</em></li>`).join('')}</ul>
      </section>` : '';
    const pita = `<p class="sd-pita-rekap" aria-hidden="true"><span><b>${angka(c.total)}</b> antrean</span><span><b>${angka(c.dipanggil)}</b> menunggu</span>
        <span><i class="fa-solid fa-check"></i><b>${angka(c.putus)}</b></span><span><i class="fa-solid fa-scale-balanced"></i><b>${angka(c.banding)}</b></span><span><i class="fa-solid fa-forward"></i><b>${angka(c.lewati)}</b></span></p>`;

    el.innerHTML = `<div class="sd-utama">${pengamat}${catatan}
        ${htmlMajelisRingkas()}
        <section class="sd-kelompok" aria-label="Kelompok jumlah perkara">${kelompok}</section>
        ${pita}
        <div class="sd-mulai">
          <button type="button" class="sd-btn sd-btn-emas sd-btn-mulai" data-aksi="mulai"${antre.length ? '' : ' disabled'}>
            <i class="fa-solid fa-gavel"></i><span>${mulaiLbl}</span><kbd>Enter</kbd></button>
          <p>${pertama ? `Dimulai dari <b>${esc(pertama.nama)}</b> (${esc(pertama.kelas)}, ${KODE[pertama.P].k}). Perkara paling sedikit dipanggil lebih dulu, lalu tahap terendah.` : antre.length ? 'Semua santri sudah dipanggil.' : 'Belum ada santri di antrean.'}</p>
          <label class="sd-cari"><i class="fa-solid fa-magnifying-glass"></i><input type="search" id="sdCari" placeholder="Cari nama, kelas, kamar…" value="${esc(S.cari)}" aria-label="Cari santri"></label>
        </div>
        <div class="sd-kertas sd-daftar-kertas">
          ${tampil.length ? `<ol class="sd-grup-daftar">${grup}</ol>` : `<p class="sd-hampa">${antre.length ? 'Tidak ada yang cocok dengan saringan.' : 'Tidak ada perkara Ringan atau Sedang untuk angkatan VII–X.'}</p>`}
        </div>
        ${bdg}
      </div>${htmlRekap(c)}`;
    if (S.sibuk) el.classList.add('sd-redup'); else el.classList.remove('sd-redup');
    rapikanFoto(el);
    gambarBilah();
  }
  function labelMulai(c) {
    return bolehPutus() ? (c.dipanggil ? 'Mulai sidang' : c.lewati ? 'Panggil ulang yang dilewati' : 'Lihat antrean') : 'Lihat kartu santri';
  }

  /* =================================================================
   *  v2.70 · BILAH MAJELIS (lengket) & BILAH JEMPOL (HP)
   *  Muncul begitu tombol Mulai tergulir lewat. Tidak menggeser tata letak
   *  (tinggi 0, isinya meluncur turun dengan transform).
   * ================================================================= */
  function titikKursi(id) {
    if (!adaPanitia() || !majelis()) return '';
    const p = S.data.panitia, t = kursiTerisi();
    const k = kursiMajelis().filter(x => x.wajib || x.isi?.nama);
    const kilau = Date.now() < S.kilauMj ? ' kilau' : '';
    return `<button type="button" class="sd-bm-mj${p.lengkap ? ' lengkap' : ''}${kilau}"${id ? ` id="${id}"` : ''} data-aksi="majelis" title="Susunan majelis (M)">
      <span class="sd-bm-titik" aria-hidden="true">${k.map(x => `<i class="${x.isi?.nama ? 'isi' : 'kosong'}${x.id === 'ketua' ? ' ketua' : ''}"></i>`).join('')}</span>
      <span class="sd-bm-mj-teks">${p.lengkap ? (p.kredit ? 'Majelis · apresiasi tercatat' : 'Majelis lengkap') : `Majelis ${angka(t.n)}/${angka(t.dari)}`}</span></button>`;
  }
  function gambarBilah() {
    const b = S.akar?.querySelector('#sdBilah'), j = S.akar?.querySelector('#sdJempol');
    if (!b || !j) return;
    const d = S.data;
    const aktif = !!d && !S.galat && S.tab === 'majelis' && !reses(d) && S.urutan.length > 0;
    b.hidden = !aktif; j.hidden = !aktif;
    if (!aktif) { b.innerHTML = ''; j.innerHTML = ''; b.classList.remove('tampak'); b.inert = true; S.akar.classList.remove('sd-bilah-tampak'); return; }
    const c = hitungSesi();
    const mulai = `<button type="button" class="sd-btn sd-btn-emas sd-bm-mulai" data-aksi="mulai-bilah"><i class="fa-solid fa-gavel"></i><span>${esc(labelMulai(c))}</span><kbd>Enter</kbd></button>`;
    const lompat = [1, 2, 3, 4].filter(P => c.P[P][0]).map(P => `<button type="button" class="sd-bm-p p${P}" data-aksi="lompat" data-nilai="${P}" title="Lompat ke ${esc(KODE[P].l)}">${KODE[P].k}<small>${angka(c.P[P][0])}</small></button>`).join('');
    b.innerHTML = `<div class="sd-bilah-isi">
        <span class="sd-bm-wajah" aria-hidden="true">${hakimHtml('wajah')}</span>
        <span class="sd-bm-judul"><b>${esc(d.buka ? 'Sidang' : persiapan(d) ? 'Persiapan' : 'Berkas')}</b><small>${angka(c.dipanggil)} menunggu · ${angka(c.putus)} diputus</small></span>
        ${titikKursi()}
        <span class="sd-bm-lompat" role="group" aria-label="Lompat ke kelompok">${lompat}</span>
        <button type="button" class="sd-ikon sd-bm-cari" data-aksi="fokus-cari" title="Cari santri (/)"><i class="fa-solid fa-magnifying-glass"></i><span class="sr-only">Cari</span></button>
        ${mulai}
        <button type="button" class="sd-ikon sd-bm-atas" data-aksi="ke-atas" title="Kembali ke atas"><i class="fa-solid fa-arrow-turn-up"></i><span class="sr-only">Ke atas</span></button>
      </div>`;
    j.innerHTML = titikKursi() + mulai;
    aturBilah(true);
  }
  let rafBilah = 0;
  function aturBilah(segera) {
    const jalan = () => {
      rafBilah = 0;
      const g = S.akar?.querySelector('#sdGulir'), b = S.akar?.querySelector('#sdBilah'), m = S.akar?.querySelector('.sd-mulai');
      if (!g || !b) return;
      const tampak = !b.hidden && !!m && m.getBoundingClientRect().bottom < g.getBoundingClientRect().top + 6;
      if (tampak === b.classList.contains('tampak')) return;
      b.classList.toggle('tampak', tampak); b.inert = !tampak;
      S.akar.classList.toggle('sd-bilah-tampak', tampak);
    };
    if (segera) { cancelAnimationFrame(rafBilah); return jalan(); }
    if (!rafBilah) rafBilah = requestAnimationFrame(jalan);
  }
  const gulirHalus = () => bolehGerak() && !A.hemat() ? 'smooth' : 'auto';
  function lompatKe(P) {
    if (S.saring && S.saring !== P) { S.saring = 0; gambarIsi(); }
    const h = S.akar?.querySelector(`.sd-grup[data-p="${P}"]`); if (!h) return;
    h.scrollIntoView({ block: 'start', behavior: gulirHalus() });
    h.classList.remove('disorot'); void h.offsetWidth; h.classList.add('disorot');
    setTimeout(() => h.classList.remove('disorot'), 1400);
    h.querySelector('.sd-baris')?.focus({ preventScroll: true });
  }
  function fokusCari() {
    const i = S.akar?.querySelector('#sdCari'); if (!i) return;
    i.scrollIntoView({ block: 'center', behavior: gulirHalus() });
    i.focus({ preventScroll: true }); i.select();
  }

  function htmlReses() {
    const d = S.data;
    return `<div class="sd-kertas sd-kosong sd-reses">
      <i class="fa-solid fa-calendar-day"></i>
      <b>Majelis sedang reses</b>
      <p>Ruang Sidang dibuka pada ${esc(jadwalTeks())}. Sidang berikutnya <strong>${esc(labelHari(d.berikut, true))}</strong>.</p>
      <p class="sd-kecil">Perkara yang masuk sampai saat itu otomatis tersusun di berkas. Mulai pukul 19.00 malam sebelum hari sidang, berkasnya sudah bisa diunduh dan dicetak. Tab Penasihat Hukum tetap bisa dibuka setiap hari.</p>
    </div>`;
  }

  function htmlRekap(c) {
    return `<aside class="sd-kertas sd-rekap" aria-label="Rekap sidang">
      <h3>Rekap sidang</h3>
      <dl>
        <div><dt>Santri dalam antrean</dt><dd>${angka(c.total)}</dd></div>
        <div><dt>Belum dipanggil</dt><dd>${angka(c.dipanggil)}</dd></div>
        <div><dt><i class="fa-solid fa-check"></i> Diputus</dt><dd>${angka(c.putus)}</dd></div>
        <div><dt><i class="fa-solid fa-scale-balanced"></i> Banding</dt><dd>${angka(c.banding)}</dd></div>
        <div><dt><i class="fa-solid fa-forward"></i> Dilewati</dt><dd>${angka(c.lewati)}</dd></div>
      </dl>
      ${bolehBerkas() ? `<button type="button" class="sd-btn sd-btn-emas sd-btn-berkas" data-aksi="berkas"><i class="fa-solid fa-file-pdf"></i>Unduh berkas perkara</button>
        <p class="sd-kecil">Daftar panggil per kode jumlah perkara, rincian tiap santri, dan kolom tanda tangan majelis. A4 atau F4.</p>` : ''}
      ${c.putus || c.banding || c.lewati ? `<button type="button" class="sd-btn sd-btn-tipis" data-aksi="berita-acara"><i class="fa-solid fa-copy"></i>Salin berita acara hari ini</button>` : ''}
      <div class="sd-papan" aria-hidden="true">
        <p>Papan tik majelis</p>
        <ul><li><kbd>Enter</kbd>ketuk palu · lanjut</li><li><kbd>↓</kbd>banding</li><li><kbd>Spasi</kbd>lewati</li><li><kbd>Del</kbd>mundur</li>${adaPanitia() ? '<li><kbd>S</kbd>sahkan pelaksanaan</li><li><kbd>M</kbd>susunan majelis</li>' : ''}<li><kbd>/</kbd>cari santri</li></ul>
      </div>
    </aside>`;
  }

  /* =================================================================
   *  ANTREAN PANGGIL — layar hakim
   * ================================================================= */
  const kunciKini = () => { const a = S.antre; return a && !a.akhir ? a.urutan[a.i] : null; };
  const kini = () => santriDi(kunciKini());
  const menunggu = (s, ulang) => !!s && (s.keadaan === 'dipanggil' || (ulang && s.keadaan === 'lewati'));
  const faseOf = (s) => !s ? 'akhir' : menunggu(s, S.antre?.ulang) ? 'panggil' : s.keadaan;

  function bukaAntre(kunciAwal, ulang) {
    if (!S.akar || !S.data) return;
    susun();
    const mode = bolehPutus() ? 'putus' : 'lihat';
    const urutan = ulang ? S.urutan.filter(k => santriDi(k)?.keadaan === 'lewati') : S.urutan.slice();
    if (!urutan.length) return;
    let i = kunciAwal ? urutan.indexOf(kunciAwal) : urutan.findIndex(k => menunggu(santriDi(k), ulang));
    const akhir = !kunciAwal && i < 0 && mode === 'putus';
    if (i < 0) i = 0;
    S.antre = { urutan, i, ulang: !!ulang, mode, akhir, arah: '' };
    let el = S.akar.querySelector('#sdAntre');
    if (!el) {
      el = document.createElement('div');
      el.className = 'sd-antre'; el.id = 'sdAntre'; el.tabIndex = -1;
      el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'Antrean panggil');
      S.akar.appendChild(el);
      requestAnimationFrame(() => el.classList.add('buka'));
    }
    gambarAntre();
    el.focus({ preventScroll: true });
  }
  function tutupAntre() {
    const el = S.akar?.querySelector('#sdAntre');
    S.antre = null;
    if (el) { el.classList.remove('buka'); setTimeout(() => el.remove(), bolehGerak() ? 220 : 0); }
    S.bubble = ''; S.ekspresi = 'normal';
    gambarSemua();
    setTimeout(() => S.akar?.querySelector('[data-aksi="mulai"]')?.focus({ preventScroll: true }), 30);
  }
  /** v2.70: ingat letak nama pertama di "Berikutnya" — kartu baru terbang dari sana. */
  function ingatBerikut() {
    const a = S.antre; if (!a || !bolehGerak() || A.hemat()) return;
    const li = S.akar?.querySelector('#sdAntre .sd-berikut li');
    const r = li?.getBoundingClientRect();
    a.flip = r && r.width > 0 ? r : null;
  }
  /** v2.70: kartu yang dilewati disisihkan turun-kiri (salinan sesaat). */
  function sisihkanKartu() {
    if (!bolehGerak() || A.hemat()) return;
    const k = S.akar?.querySelector('#sdAntre .sd-kartu'); if (!k) return;
    const r = k.getBoundingClientRect(), h = k.cloneNode(true);
    h.classList.add('sd-kartu-hantu'); h.removeAttribute('aria-label'); h.setAttribute('aria-hidden', 'true');
    Object.assign(h.style, { position: 'fixed', left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`, margin: 0, zIndex: 5, pointerEvents: 'none', overflow: 'hidden', animation: 'none' });
    S.akar.appendChild(h);
    const an = h.animate([{ transform: 'none', opacity: 1 }, { transform: 'translate(-38px, 54px) rotate(-4deg) scale(.95)', opacity: 0 }], { duration: 280, easing: 'cubic-bezier(.4,0,.8,.4)', fill: 'forwards' });
    an.onfinish = () => h.remove(); setTimeout(() => h.remove(), 600);
  }
  function maju(peristiwa) {
    const a = S.antre; if (!a) return;
    ingatBerikut();
    let j = a.i + 1;
    if (a.mode === 'putus') while (j < a.urutan.length && !menunggu(santriDi(a.urutan[j]), a.ulang)) j++;
    if (j >= a.urutan.length) { if (a.mode === 'putus') a.akhir = true; else j = a.urutan.length - 1; }
    if (!a.akhir) a.i = j;
    a.arah = 'maju';
    gambarAntre(peristiwa);
  }
  function geser(d) {
    const a = S.antre; if (!a) return;
    if (a.akhir) { if (d < 0) { a.akhir = false; a.arah = 'mundur'; gambarAntre(); } return; }
    const j = a.i + d;
    if (j < 0) return;
    if (j >= a.urutan.length) { if (a.mode === 'putus') { a.akhir = true; a.arah = 'maju'; gambarAntre(); } return; }
    if (d > 0) ingatBerikut();
    a.i = j; a.arah = d > 0 ? 'maju' : 'mundur';
    gambarAntre();
  }

  function ketuk(s) {                       // Enter pada santri yang dipanggil
    if (perluMajelis()) { bukaMajelis('ketuk').then(ok => { if (ok && santriDi(s.kunci)) ketuk(santriDi(s.kunci)); else fokusAntre(); }); return; }
    if (!rekam(s, 'putus')) return;
    S.ekspresi = 'serius';
    gambarAntre('putus');
    ketukPalu(1, S.akar.querySelector('#sdAntre')).then(() => { S.ekspresi = 'normal'; S.akar?.querySelectorAll('#sdAntre .sd-hakim').forEach(h => { h.dataset.ekspresi = 'normal'; }); });
  }
  function banding(s) {
    if (!rekam(s, 'banding')) return;
    S.ekspresi = 'serius';
    gambarAntre('banding');
    gambarTab();
  }
  function lewati(s) {
    if (!rekam(s, 'lewati')) return;
    const a = S.antre;
    a.jejak = s.kunci;
    sisihkanKartu();
    maju('lewati');
  }
  function delAntre() {
    const a = S.antre; if (!a) return;
    if (a.akhir) return geser(-1);
    const s = kini();
    const f = faseOf(s);
    if (f === 'putus' || f === 'banding' || (f === 'lewati' && !a.ulang)) {
      if (urungkan(s)) { S.ekspresi = 'normal'; a.arah = ''; gambarAntre('urung'); }
      return;
    }
    geser(-1);
  }
  function enterAntre() {
    const a = S.antre; if (!a) return;
    if (a.akhir) {
      const c = hitungSesi();
      if (a.mode === 'putus' && c.lewati) return bukaAntre(null, true);
      return tutupAntre();
    }
    if (a.mode !== 'putus') return geser(1);
    const s = kini();
    if (faseOf(s) === 'panggil') return ketuk(s);
    maju();
  }

  /* ---------- kartu santri ---------- */
  function htmlIzin(s) {
    const iz = s.info?.izin;
    if (iz) {
      const rentang = iz.mulai === iz.selesai ? labelTgl(iz.mulai) : `${labelTgl(iz.mulai)} – ${labelTgl(iz.selesai)}`;
      return iz.kondisi === 'aktif'
        ? `<div class="sd-izin aktif"><i class="fa-solid ${/sakit/i.test(iz.jenis || '') ? 'fa-bed' : 'fa-door-open'}"></i>
            <span><b>Izin ${esc(iz.jenis || '')} aktif</b> · ${esc(rentang)}${iz.pemberi ? ` · diberikan ${esc(iz.pemberi)}` : ''}
            <small>Bila ananda tidak hadir, tekan <kbd>Spasi</kbd> untuk melewati.</small></span></div>`
        : `<div class="sd-izin lewat"><i class="fa-solid fa-triangle-exclamation"></i>
            <span><b>Izin ${esc(iz.jenis || '')} berakhir ${esc(labelTgl(iz.selesai))}</b> tetapi belum ditutup musyrif.
            <small>Kemungkinan ananda sudah kembali ke dayah — panggil seperti biasa.</small></span></div>`;
    }
    if (s.hadir && s.hadir !== 'Hadir') return `<div class="sd-izin basi"><i class="fa-solid fa-circle-info"></i>
        <span>Status keberadaan tercatat <b>${esc(s.hadir)}</b>, tetapi tidak ada izin aktif di perizinan. <small>Anggap hadir bila ananda ada di ruang sidang.</small></span></div>`;
    return '';
  }

  function tandaPerkara(b) {
    const t = [];
    if (b.hari_ini === 'putus') t.push(b._ulangKini || (b.sesi && b.sesi !== S.data.hari && b.ulang) ? `<span class="sd-tanda ulang"><i class="fa-solid fa-rotate-left"></i>dibacakan ulang</span>` : `<span class="sd-tanda putus"><i class="fa-solid fa-check"></i>diputus</span>`);
    else if (b.status === 'diberikan') t.push(`<span class="sd-tanda ulang">sudah dibacakan ${esc(labelTgl(b.sesi))}${b.ulang ? ` · ulang ${angka(b.ulang)}×` : ''}</span>`);
    else if (b.status === 'dibacakan') t.push(`<span class="sd-tanda ulang">dibacakan ${esc(labelTgl(b.sesi))}, belum diserahkan</span>`);
    if (b.baru) t.push('<span class="sd-tanda baru">baru</span>');
    if (b.lewat && b.hari_ini !== 'putus') t.push(`<span class="sd-tanda tunda">tertunda ${angka(b.lewat)}×</span>`);
    if (b.banding && LABEL_BANDING[b.banding]) t.push(`<span class="sd-tanda ${TAHAN.has(b.banding) ? 'tahan' : 'tolak'}" title="${esc(b.banding_alasan || '')}"><i class="fa-solid fa-scale-balanced"></i>${esc(LABEL_BANDING[b.banding])}</span>`);
    if (b.sanggah) t.push(`<span class="sd-tanda tolak" title="${esc(b.sanggah)}"><i class="fa-solid fa-hand"></i>pengesahan OSDA disanggah musyrif</span>`);
    if (b.status === 'diberikan' && Array.isArray(b.pj) && b.pj.length) t.push(`<span class="sd-tanda pj"><i class="fa-solid fa-user-check"></i>PJ ${esc(b.pj.join(', '))}</span>`);
    return t.join('');
  }
  function htmlPerkara(b) {
    return `<li class="sd-pk kat-${b.kategori === 'Sedang' ? 'sedang' : 'ringan'}${b._tunda ? ' tunda' : ''}">
      <div class="sd-pk-atas"><b>${esc(b.pelanggaran)}</b><time>${esc(labelTgl(b.tanggal))}</time></div>
      <div class="sd-pk-bawah"><span class="sd-pk-kat">${esc(b.kategori)} · ke-${esc(b.tahap || '?')}</span><span class="sd-pk-bentuk">${esc(b.bentuk || '-')}</span></div>
      ${b.ket ? `<p class="sd-pk-ket">${esc(b.ket)}</p>` : ''}
      ${b.ucapan ? `<blockquote class="sd-ucapan"><span><i class="fa-solid fa-quote-left"></i>Alat bukti · ucapan tercatat</span>“${esc(b.ucapan)}”</blockquote>` : ''}
      <div class="sd-pk-tanda">${tandaPerkara(b)}</div>
      ${b.banding_alasan && !TAHAN.has(b.banding) ? `<p class="sd-pk-ket"><i class="fa-solid fa-quote-left"></i> ${esc(b.banding_alasan)}</p>` : ''}
    </li>`;
  }
  /** Tangga tahap per kategori & bulan: dari tahap terakhir yang tuntas sampai tahap berikutnya. */
  function htmlTangga(s) {
    const per = new Map();
    for (const b of s.semua) {
      if (b.kategori !== 'Ringan' && b.kategori !== 'Sedang') continue;
      const bln = String(b.tanggal || '').slice(0, 7);
      const k = `${b.kategori}|${bln}`;
      if (!per.has(k)) per.set(k, []);
      per.get(k).push(b);
    }
    const sesiIds = new Set(s.sesi.map(b => b.id));
    const master = (kat, t) => (S.data?.tangga?.[`${s.unit || 'putra'}|${kat}`] || []).find(x => x.t === t)?.b;
    const blok = [...per].filter(([, l]) => l.some(b => sesiIds.has(b.id))).sort(([a], [b]) => urutTeks(a, b)).map(([k, l]) => {
      const [kat, bln] = k.split('|');
      const tuntas = Number(s.info?.tuntas?.[k]) || 0;
      const maks = Math.max(tuntas, ...l.map(b => Number(b.tahap) || 0));
      const langkah = [];
      if (tuntas) langkah.push(`<li class="t-tuntas" title="${esc(master(kat, tuntas) || '')}"><span>ke-${tuntas}</span><small>tuntas</small></li>`);
      for (let t = tuntas + 1; t <= maks; t++) {
        const b = l.find(x => Number(x.tahap) === t);
        const kelas = !b ? 't-luar' : tahan(b) ? 't-tahan' : b.hari_ini === 'putus' ? 't-putus' : sesiIds.has(b.id) ? 't-kini' : b.status === 'tuntas' ? 't-tuntas' : 't-luar';
        const ket = !b ? 'di luar sidang' : tahan(b) ? 'banding' : b.hari_ini === 'putus' ? 'diputus' : b.status === 'diberikan' ? 'di musyrif' : b.status === 'tuntas' ? 'tuntas' : 'sidang ini';
        langkah.push(`<li class="${kelas}" title="${esc((b && b.bentuk) || master(kat, t) || '')}"><span>ke-${t}</span><small>${ket}</small></li>`);
      }
      const nb = maks + 1, bentukNb = master(kat, nb);
      return `<div class="sd-tangga-baris">
        <p class="sd-tangga-judul">${esc(kat)} · ${esc(namaBulan(bln))}</p>
        <ol class="sd-tangga-anak">${langkah.join('')}<li class="t-awas" title="${esc(bentukNb || 'musyawarah')}"><span>ke-${nb}</span><small>bila mengulang</small></li></ol>
        <p class="sd-tangga-awas"><i class="fa-solid fa-triangle-exclamation"></i>Bila mengulang: <b>${esc(bentukNb || 'ditetapkan melalui musyawarah')}</b></p>
      </div>`;
    });
    return blok.length ? `<section class="sd-tangga" aria-label="Tangga tahap"><h3><i class="fa-solid fa-stairs"></i>Tahapan yang dilalui</h3>${blok.join('')}</section>` : '';
  }

  function kalimatAntre(s, f) {
    if (!s) return '';
    if (S.gagal.has(s.kunci)) return `Ketukan untuk ananda ${s.nama} belum tersimpan. Tekan Enter untuk mengulang.`;
    if (f === 'putus') {
      const pen = [...new Set(s.sesi.flatMap(b => b.penerima || []))];
      return `Putusan ananda ${s.nama} dibacakan dan diserahkan kepada ${pen.length ? pen.join(', ') : 'musyrif kelas'}. Enter untuk ananda berikutnya.`;
    }
    if (f === 'banding') return `Banding ananda ${s.nama} dicatat. Berkasnya diserahkan kepada Penasihat Hukum OSDA.`;
    if (f === 'lewati') return `Ananda ${s.nama} dilewati${s.info?.izin?.kondisi === 'aktif' ? ' karena berizin' : ''}.`;
    if (f === 'kosong') return `Pembinaan ananda ${s.nama} sudah disahkan OSDA. Enter untuk ananda berikutnya.`;
    if (S.antre?.mode !== 'putus') return `Ananda ${s.nama}, ${s.kelas}. ${angka(s.jumlah)} perkara.`;
    const ul = s.sesi.filter(b => b.status === 'diberikan' && b.hari_ini !== 'putus').length;
    const sah = siapSah(s).length;
    return `Dipanggil: ananda ${s.nama}, kelas ${s.kelas}. ${angka(s.jumlah)} perkara${ul ? `, ${angka(ul)} di antaranya dibacakan ulang` : ''}.`
      + (sah ? ` Bila sudah dijalankan, tekan S untuk mengesahkan ${angka(sah)} pembinaan.` : '')
      + (s.info?.izin?.kondisi === 'aktif' ? ' Tercatat berizin — bila tidak hadir, tekan Spasi.' : '');
  }
  function ucapAntre(s) {
    const t = santriDi(s.kunci) || s;          // objek santri disusun ulang setiap data berubah
    const b = S.akar?.querySelector('#sdAntre .sd-bicara'); if (b) b.textContent = kalimatAntre(t, faseOf(t));
  }

  function htmlJalur() {
    const a = S.antre;
    const l = a.urutan.map(santriDi);
    return `<div class="sd-jalur" role="progressbar" aria-valuemin="0" aria-valuemax="${l.length}" aria-valuenow="${l.filter(s => s && s.keadaan !== 'dipanggil').length}" aria-label="Kemajuan antrean">
      ${l.map((s, i) => s ? `<i class="p${s.P} k-${a.ulang && s.keadaan === 'lewati' ? 'dipanggil' : s.keadaan}${i === a.i && !a.akhir ? ' kini' : ''}${i > 0 && l[i - 1] && l[i - 1].P !== s.P ? ' batas' : ''}"></i>` : '').join('')}
    </div>`;
  }

  function gambarAntre(peristiwa) {
    const el = S.akar?.querySelector('#sdAntre'); const a = S.antre;
    if (!el || !a) return;
    // data dimuat ulang: kunci yang hilang (mis. sudah tuntas) dibuang dari urutan
    a.urutan = a.urutan.filter(k => S.santri.has(k));
    if (!a.urutan.length) { tutupAntre(); return; }
    if (a.i >= a.urutan.length) a.i = a.urutan.length - 1;
    const c = hitungSesi();
    const putusMode = a.mode === 'putus';
    const s = a.akhir ? null : kini();
    const f = faseOf(s);
    const bisa = putusMode && !a.akhir;
    const berikut = a.akhir ? [] : a.urutan.slice(a.i + 1).map(santriDi).filter(x => x && (!putusMode || menunggu(x, a.ulang))).slice(0, 3);
    const tombol = (aksi, kbd, ikon, label, on, kelas = '') => `<button type="button" class="sd-kunci ${kelas}" data-aksi="${aksi}"${on ? '' : ' disabled'} aria-keyshortcuts="${kbd.replace('Spasi', 'Space').replace('↓', 'ArrowDown')}">
        <kbd>${kbd}</kbd><span><i class="fa-solid ${ikon}"></i>${label}</span></button>`;
    const stempel = { putus: 'Diputus', banding: 'Banding', lewati: 'Dilewati', kosong: 'Disahkan' }[f] || '';
    const nSah = bisa && s ? siapSah(s).length : 0;
    // ⑦ penutupan: sekali per sesi, ketika tidak ada lagi yang menunggu maupun dilewati
    const kunciTutup = `${S.data?.hari}|${S.data?.unit || ''}`;
    const tutupSidang = a.akhir && putusMode && !c.dipanggil && !c.lewati && c.putus + c.banding > 0 && !S.ditutup.has(kunciTutup);
    if (tutupSidang) { S.ditutup.add(kunciTutup); peristiwa = 'tutup'; }
    // ④ diputus → berkas dilipat & diserahkan
    const pen = s ? [...new Set(s.sesi.flatMap(b => b.penerima || []))] : [];
    const sampul = peristiwa === 'putus' && f === 'putus' && bolehGerak() ? `<div class="sd-sampul" aria-hidden="true"><i class="fa-solid fa-paper-plane"></i>
        <span><b>Berkas diserahkan</b><small>${esc(pen.length ? pen.join(', ') : 'kepada musyrif kelas')}</small></span></div>` : '';
    // ⑥ disahkan OSDA
    const sahBaru = peristiwa === 'sah' && Array.isArray(a.sahBaru) ? a.sahBaru : null; a.sahBaru = null;
    const capSah = sahBaru && sahBaru.length ? `<div class="sd-cap-sah" aria-hidden="true">
        <span class="sd-cap-sah-cap"><span><b>Disahkan</b><small>OSDA</small></span></span>
        <ul>${sahBaru.map((x, i) => `<li style="--i:${i}"><i class="fa-solid fa-stamp"></i>${esc(x)}</li>`).join('')}</ul></div>` : '';
    const flip = a.flip; a.flip = null;

    el.className = `sd-antre buka${peristiwa ? ' ev-' + peristiwa : ''}${a.arah ? ' arah-' + a.arah : ''}${flip && a.arah === 'maju' ? ' flip' : ''}`;
    el.innerHTML = `
      <div class="sd-antre-atas">
        <button type="button" class="sd-keluar" data-aksi="antre-tutup"><i class="fa-solid fa-list"></i><span>Daftar</span><kbd>Esc</kbd></button>
        <div class="sd-antre-jalur">${htmlJalur()}
          <p class="sd-antre-hitung">${a.ulang ? '<b>Panggil ulang</b> · ' : ''}<b>${angka(Math.min(a.i + 1, a.urutan.length))}</b>/${angka(a.urutan.length)}
            <span class="h-putus"><i class="fa-solid fa-check"></i><b>${angka(c.putus)}</b></span><span class="h-banding"><i class="fa-solid fa-scale-balanced"></i><b>${angka(c.banding)}</b></span><span class="h-lewati"><i class="fa-solid fa-forward"></i><b>${angka(c.lewati)}</b></span>
            <span class="sd-simpan" id="sdSimpan"></span></p>
        </div>
        ${putusMode && perluMajelis() ? `<button type="button" class="sd-mj-spanduk" data-aksi="majelis"><i class="fa-solid fa-users-rectangle"></i>
          <span>Susunan majelis belum lengkap: <b>${esc((S.data.panitia.kurang || []).join(', '))}</b></span><kbd>M</kbd></button>` : putusMode ? titikKursi('sdAntreMj') : ''}
      </div>
      <div class="sd-antre-isi">
        <div class="sd-antre-hakim">${hakimHtml('mimbar')}<p class="sd-bicara" aria-live="polite">${esc(a.akhir ? (tutupSidang || (!c.dipanggil && !c.lewati) ? 'Barakallahu fikum, majelis. Sidang ditutup.' : '') : kalimatAntre(s, f))}</p></div>
        ${a.akhir ? htmlAkhir(c, tutupSidang) : `
        <article class="sd-kartu p${s.P} f-${f}" aria-label="Berkas ${esc(s.nama)}">
          <header class="sd-kartu-kepala">
            ${kodeHtml(s.P)}
            <div><h2>${esc(s.nama)}</h2><p>${esc(s.kelas)}${s.kamar ? ` · Kamar ${esc(s.kamar)}` : ''} · ${angka(s.jumlah)} perkara${s.tertahan.length ? ` · ${angka(s.tertahan.length)} lain dalam banding` : ''}</p></div>
            ${stempel ? `<span class="sd-stempel s-${f}" aria-hidden="true"><span>${stempel}</span></span>` : ''}
          </header>
          ${S.gagal.has(s.kunci) ? `<div class="sd-izin gagal"><i class="fa-solid fa-triangle-exclamation"></i><span><b>Belum tersimpan.</b> ${esc(S.gagal.get(s.kunci))}<small>Tekan Enter untuk mengetuk ulang.</small></span></div>` : ''}
          ${htmlIzin(s)}
          <ol class="sd-perkara">${s.sesi.map(htmlPerkara).join('')}</ol>
          ${sampul}${capSah}
          ${htmlTangga(s)}
        </article>
        <aside class="sd-berikut" aria-label="Berikutnya">
          <p>Berikutnya</p>
          ${berikut.length ? `<ol>${berikut.map(x => `<li>${kodeHtml(x.P, true)}<b>${esc(x.nama)}</b><small>${esc(x.kelas)}</small></li>`).join('')}</ol>` : '<p class="sd-hampa">—</p>'}
        </aside>`}
      </div>
      <div class="sd-antre-tombol">
        ${bisa ? `
          ${tombol('a-enter', 'Enter', f === 'panggil' ? 'fa-gavel' : 'fa-arrow-right', f === 'panggil' ? 'Ketuk palu' : 'Berikutnya', true, 'k-enter')}
          ${tombol('a-banding', '↓', 'fa-scale-balanced', 'Banding', f === 'panggil', 'k-banding')}
          ${tombol('a-lewati', 'Spasi', 'fa-forward', 'Lewati', f === 'panggil', 'k-lewati')}
          ${tombol('a-del', 'Del', 'fa-delete-left', f === 'panggil' ? 'Sebelumnya' : 'Urungkan', a.i > 0 || f !== 'panggil', 'k-del')}
          ${nSah ? tombol('a-sahkan', 'S', 'fa-stamp', `Sahkan ${angka(nSah)}`, true, 'k-sahkan') : ''}`
        : a.akhir ? `
          ${tombol('a-enter', 'Enter', c.lewati ? 'fa-rotate-left' : 'fa-list', c.lewati ? `Panggil ulang ${angka(c.lewati)} santri` : 'Kembali ke daftar', true, 'k-enter')}
          ${tombol('a-del', 'Del', 'fa-delete-left', 'Santri terakhir', true, 'k-del')}`
        : `
          ${tombol('a-kiri', '←', 'fa-chevron-left', 'Sebelumnya', a.i > 0)}
          ${tombol('a-kanan', '→', 'fa-chevron-right', 'Berikutnya', a.i < a.urutan.length - 1)}`}
      </div>`;
    el.querySelectorAll('.sd-hakim').forEach(h => { h.dataset.ekspresi = a.akhir ? 'senang' : S.ekspresi; });
    gambarSimpan();
    if (!a.akhir) el.querySelector('.sd-antre-isi')?.scrollTo?.({ top: 0 });
    // ⑤ FLIP: kartu baru berangkat dari letak namanya di "Berikutnya"
    const kartu = el.querySelector('.sd-kartu');
    if (flip && kartu && a.arah === 'maju' && kartu.animate) {
      const r = kartu.getBoundingClientRect();
      if (r.width > 0) {
        const sk = Math.max(.18, Math.min(1, flip.width / r.width));
        kartu.animate([
          { transformOrigin: '0 0', transform: `translate(${(flip.left - r.left).toFixed(1)}px, ${(flip.top - r.top).toFixed(1)}px) scale(${sk.toFixed(3)})`, opacity: .2 },
          { transformOrigin: '0 0', transform: 'none', opacity: 1 }], { duration: 340, easing: 'cubic-bezier(.2,.8,.2,1)' });
      }
    }
    if (tutupSidang && bolehGerak()) setTimeout(() => { if (S.antre?.akhir) ketukPalu(3, el); }, 650);
  }

  /** v2.70 · ③ cap apresiasi emas terbang dari palu ke titik kursi majelis. */
  function capApresiasi() {
    S.kilauMj = Date.now() + 1800;
    const ke = S.akar?.querySelector('#sdAntreMj');
    const dari = S.akar?.querySelector('#sdAntre .sd-hakim .sd-palu') || S.akar?.querySelector('#sdAntre .sd-hakim');
    if (ke) { ke.classList.add('kilau'); const t = ke.querySelector('.sd-bm-mj-teks'); if (t) t.textContent = 'Majelis · apresiasi tercatat'; }
    if (!ke || !dari || !bolehGerak() || A.hemat()) return;
    const a = dari.getBoundingClientRect(), b = ke.getBoundingClientRect();
    const c = document.createElement('span');
    c.className = 'sd-cap-terbang'; c.setAttribute('aria-hidden', 'true');
    c.innerHTML = '<i class="fa-solid fa-medal"></i>';
    c.style.left = `${a.left + a.width / 2 - 18}px`; c.style.top = `${a.top + a.height / 2 - 18}px`;
    S.akar.appendChild(c);
    const dx = b.left + b.width / 2 - (a.left + a.width / 2), dy = b.top + b.height / 2 - (a.top + a.height / 2);
    const an = c.animate([
      { transform: 'translate(0,0) scale(.4) rotate(-30deg)', opacity: 0 },
      { transform: `translate(${dx * .35}px, ${dy * .35 - 70}px) scale(1.25) rotate(-8deg)`, opacity: 1, offset: .35 },
      { transform: `translate(${dx}px, ${dy}px) scale(.55) rotate(0deg)`, opacity: .9 }], { duration: 900, easing: 'cubic-bezier(.45,0,.25,1)', fill: 'forwards' });
    an.onfinish = () => { c.remove(); ke.classList.remove('kilau'); void ke.offsetWidth; ke.classList.add('kilau'); };
    setTimeout(() => c.remove(), 1400);
  }

  function htmlAkhir(c, tutup) {
    const guling = (n) => `<span class="kk"><span class="kk-i">${angka(n)}</span></span>`;
    const sakura = tutup && unitHakim() === 'putri' && bolehGerak() && !A.hemat()
      ? `<span class="sd-sakura" aria-hidden="true">${Array.from({ length: 12 }, (_, i) => `<i style="--x:${(i * 37) % 100}%;--d:${(i * 113) % 900}ms;--r:${(i * 47) % 360}deg"></i>`).join('')}</span>` : '';
    return `<div class="sd-kertas sd-akhir${tutup ? ' tutup' : ''}">${sakura}
      <i class="fa-solid fa-scale-balanced"></i>
      <b>${c.dipanggil ? 'Akhir antrean' : c.lewati ? 'Alhamdulillah, antrean selesai' : 'Alhamdulillah, sidang ditutup'}</b>
      <dl>
        <div style="--i:0"><dt>Diputus</dt><dd>${guling(c.putus)} santri · ${guling(c.perkara)} perkara</dd></div>
        <div style="--i:1"><dt>Banding</dt><dd>${guling(c.banding)} santri</dd></div>
        <div style="--i:2"><dt>Dilewati</dt><dd>${guling(c.lewati)} santri</dd></div>
      </dl>
      <p>${c.lewati ? 'Santri yang dilewati tetap ada di berkas. Bila sudah hadir, panggil ulang sekarang (Enter); bila tidak, mereka dipanggil pada sidang berikutnya.' : 'Laporan sudah dikirim ke musyrif masing-masing. Salin berita acara untuk arsip syura.'}</p>
      <button type="button" class="sd-btn sd-btn-tipis" data-aksi="berita-acara"><i class="fa-solid fa-copy"></i>Salin berita acara</button>
    </div>`;
  }

  function gambarSimpan() {
    const el = S.akar?.querySelector('#sdSimpan'); if (!el) return;
    el.innerHTML = S.tunda ? `<i class="fa-solid fa-circle-notch fa-spin"></i>Menyimpan ${angka(S.tunda)}` : (S.gagal.size ? `<i class="fa-solid fa-triangle-exclamation"></i>${angka(S.gagal.size)} gagal` : '<i class="fa-solid fa-cloud-arrow-up"></i>Tersimpan');
    el.className = 'sd-simpan' + (S.tunda ? ' sibuk' : S.gagal.size ? ' gagal' : '');
  }

  /* =================================================================
   *  PENASIHAT HUKUM — tab di Ruang Sidang (akun OSDA; setiap hari)
   * ================================================================= */
  const STATUS_MANUAL = { menunggu: 'menunggu sidang', dibacakan: 'sudah dibacakan', diberikan: 'di tangan musyrif', tuntas: 'tuntas', musyawarah: 'menunggu musyawarah' };
  async function muatPenasihat(diam) {
    const P = S.pen; const t = ++P.token;
    if (!diam) { P.sibuk = true; if (S.tab === 'penasihat') gambarIsi(); }
    try {
      const { data, error } = await A.db.rpc('banding_daftar');
      if (t !== P.token) return;
      if (error) throw error;
      P.data = data || { banding: [], hitung: {} }; P.galat = '';
      if (S.data) S.data.banding_baru = Number(P.data.hitung?.diajukan) || 0;
    } catch (e) {
      if (t !== P.token) return;
      const m = String(e?.message || e);
      P.galat = /banding_daftar|does not exist|Could not find the function/i.test(m) ? 'Halaman Penasihat Hukum belum aktif di server. Admin perlu menerapkan migrasi v2.68.' : m;
    } finally {
      if (t === P.token) { P.sibuk = false; gambarTab(); if (S.tab === 'penasihat') { gambarIsi(); ucap(''); } }
    }
  }
  const cariBanding = (id) => (S.pen.data?.banding || []).find(x => Number(x.id) === Number(id));

  function htmlPasal(x) {
    const s = x.salinan || {}, k = x.kini;
    const tahap = `${esc(s.kategori || '-')} · tahap ke-${esc(s.tahap ?? '?')}${k && k.tahap !== s.tahap ? ` <em>(kini ke-${esc(k.tahap)})</em>` : ''}`;
    const baris = [
      ['Kategori & tahap', tahap],
      ['Putusan', esc((k && k.bentuk) || s.bentuk || '-')],
      ['Tanggal kejadian', esc(labelHari(s.tanggal, true))],
      ['Keterangan catatan', s.catatan ? `“${esc(s.catatan)}”` : '<span class="sd-redup-teks">tanpa keterangan</span>'],
      ['Penindak', esc(s.penindak || '-')],
      ['Dicatat oleh', `${esc(s.pencatat || '-')}${s.dicatat_pada ? ` <small>· input ${esc(tglJam(s.dicatat_pada))}</small>` : ''}`],
      ['Diajukan', `${x.sumber === 'manual' ? 'Manual oleh penasihat' : 'Di ruang sidang'} · ${esc(labelHari(x.sesi))} <small>· ${esc(x.diajukan_nama || '-')}</small>`],
      x.pokok ? ['Pokok keberatan', `“${esc(x.pokok)}”`] : null,
      x.alasan ? [x.status === 'ditolak' ? 'Alasan penolakan' : 'Alasan pengabulan', `${esc(x.alasan)} <small>· ${esc(x.diputus_nama || '')} ${esc(tglJam(x.diputus_pada))}</small>`] : null,
      x.catatan_admin ? ['Catatan super admin', esc(x.catatan_admin)] : null
    ].filter(Boolean);
    const aksi = x.status === 'diajukan'
      ? `<button type="button" class="sd-btn sd-btn-hijau" data-aksi="pen-kabul" data-nilai="${x.id}"><i class="fa-solid fa-check"></i>Kabulkan</button>
         <button type="button" class="sd-btn sd-btn-marun" data-aksi="pen-tolak" data-nilai="${x.id}"><i class="fa-solid fa-xmark"></i>Tolak</button>
         <button type="button" class="sd-btn sd-btn-tipis" data-aksi="pen-urung" data-nilai="${x.id}" title="Cabut banding: perkara kembali ke antrean sidang">Cabut</button>`
      : (x.status === 'dikabulkan' || x.status === 'ditolak')
      ? `<button type="button" class="sd-btn sd-btn-tipis" data-aksi="pen-urung" data-nilai="${x.id}"><i class="fa-solid fa-rotate-left"></i>Urungkan putusan</button>
         ${x.status === 'dikabulkan' && A.superAdmin?.() ? `<button type="button" class="sd-btn sd-btn-tipis" data-aksi="pen-eksekusi"><i class="fa-solid fa-gavel"></i>Buka halaman eksekusi</button>` : ''}`
      : '';
    return `<li class="sd-pasal st-${esc(x.status)}">
      <div class="sd-pasal-kepala">${s.kode ? `<span class="sd-pasal-kode">${esc(s.kode)}</span>` : ''}<b>${esc(s.pelanggaran || '-')}</b>
        <span class="sd-pasal-status st-${esc(x.status)}">${esc(LABEL_BANDING[x.status] || x.status)}</span></div>
      <dl class="sd-pasal-rinci">${baris.map(([a, b]) => `<div><dt>${a}</dt><dd>${b}</dd></div>`).join('')}</dl>
      ${aksi ? `<div class="sd-pasal-aksi">${aksi}</div>` : ''}
    </li>`;
  }

  function gambarPenasihat() {
    const el = S.akar.querySelector('#sdIsi'); const P = S.pen;
    if (!P.data && !P.galat) {
      el.innerHTML = `<div class="sd-kertas sd-muat"><i class="fa-solid fa-circle-notch fa-spin"></i>Membuka berkas banding…</div>`;
      if (!P.sibuk) muatPenasihat();
      return;
    }
    if (P.galat) {
      el.innerHTML = `<div class="sd-kertas sd-kosong"><i class="fa-solid fa-triangle-exclamation"></i><b>Berkas banding belum terbuka</b><p>${esc(P.galat)}</p>
        <button type="button" class="sd-btn" data-aksi="segarkan"><i class="fa-solid fa-rotate"></i>Coba lagi</button></div>`;
      return;
    }
    const l = P.data.banding || [];
    const n = { diajukan: 0, dikabulkan: 0, selesai: 0, semua: l.length };
    l.forEach(x => { if (x.status === 'diajukan') n.diajukan++; else if (x.status === 'dikabulkan') n.dikabulkan++; else n.selesai++; });
    const cocok = (x) => P.saring === 'semua' || (P.saring === 'selesai' ? !TAHAN.has(x.status) : x.status === P.saring);
    const per = new Map();
    l.filter(cocok).forEach(x => { const k = x.santri || x.salinan?.nama; if (!per.has(k)) per.set(k, []); per.get(k).push(x); });
    const chip = (k, lbl, jml) => `<button type="button" class="sd-chip-pen${P.saring === k ? ' on' : ''}" data-aksi="pen-saring" data-nilai="${k}" aria-pressed="${P.saring === k}">${lbl}<span>${angka(jml)}</span></button>`;
    const kartu = [...per.values()].map(xs => {
      const s0 = xs[0].salinan || {};
      return `<li class="sd-kertas sd-pen-santri">
        <header><span class="sd-pen-ikon"><i class="fa-solid fa-user"></i></span><div><h3>${esc(s0.nama || '-')}</h3>
          <p>${esc(s0.kelas || '')}${s0.kamar ? ` · Kamar ${esc(s0.kamar)}` : ''}${xs[0].nisn ? ` · NISN ${esc(xs[0].nisn)}` : ''} · ${angka(xs.length)} pasal</p></div></header>
        <ol class="sd-pasal-daftar">${xs.map(htmlPasal).join('')}</ol>
      </li>`;
    }).join('');
    el.innerHTML = `<div class="sd-utama sd-pen">
        <div class="sd-pen-kepala">
          <div><h3><i class="fa-solid fa-user-shield"></i>Penasihat Hukum OSDA</h3>
            <p>Periksa setiap pasal yang disanggah: tanggal, keterangan, penindak, dan siapa yang menginput. <b>Kabulkan</b> bila catatan keliru (alasan wajib) — super admin yang mengarsipkan. <b>Tolak</b> bila catatan benar — pasal kembali ke sidang berikutnya.</p></div>
          <button type="button" class="sd-btn sd-btn-emas" data-aksi="pen-manual"><i class="fa-solid fa-plus"></i>Banding manual</button>
        </div>
        <div class="sd-pen-saring">${chip('diajukan', 'Perlu diputus', n.diajukan)}${chip('dikabulkan', 'Menunggu eksekusi', n.dikabulkan)}${chip('selesai', 'Selesai 30 hari', n.selesai)}${chip('semua', 'Semua', n.semua)}</div>
        ${per.size ? `<ol class="sd-pen-daftar">${kartu}</ol>`
          : `<div class="sd-kertas sd-kosong"><i class="fa-solid fa-scale-balanced"></i><b>${P.saring === 'diajukan' ? 'Tidak ada banding yang perlu diputus' : 'Tidak ada banding di saringan ini'}</b>
              <p>Banding datang dari ruang sidang (tombol ↓) atau diajukan manual untuk perkara lama.</p></div>`}
      </div>
      <aside class="sd-kertas sd-rekap"><h3>Alur banding</h3>
        <ol class="sd-alur">
          <li><b>Diajukan</b><span>Hakim menekan ↓, atau penasihat mengajukan manual.</span></li>
          <li><b>Diputus penasihat</b><span>Kabulkan (beralasan) atau tolak, per pasal.</span></li>
          <li><b>Dieksekusi super admin</b><span>Pelanggaran diarsipkan; tahap sesudahnya turun satu, musyrif diberi koreksi.</span></li>
        </ol>
        <p class="sd-kecil">Pasal yang ditolak atau dikembalikan super admin kembali ke antrean sidang berikutnya dengan keterangannya.</p>
      </aside>`;
  }

  async function putusBanding(id, putusan) {
    const x = cariBanding(id); if (!x) return;
    const s = x.salinan || {}, kabul = putusan === 'kabul';
    const res = await A.Swal.fire({
      title: kabul ? 'Kabulkan banding?' : 'Tolak banding?', width: 600,
      showCancelButton: true, confirmButtonText: kabul ? '<i class="fa-solid fa-check"></i> Kabulkan' : '<i class="fa-solid fa-xmark"></i> Tolak',
      cancelButtonText: 'Batal', confirmButtonColor: kabul ? '#0F766E' : '#8E1B32', showLoaderOnConfirm: true,
      allowOutsideClick: () => !A.Swal.isLoading(),
      html: `<div class="sd-swal">
        <p class="sd-swal-pasal"><b>${esc(s.nama || '')}</b> · ${esc(s.kelas || '')}<br>${esc(s.pelanggaran || '-')} · ${esc(labelTgl(s.tanggal))} · ${esc(s.kategori || '')} ke-${esc(s.tahap ?? '?')}</p>
        <p>${kabul ? 'Pasal ini diajukan ke super admin untuk diarsipkan. Setelah dieksekusi, perkara sekategori sesudahnya turun satu tahap.' : 'Pasal ini kembali ke berkas sidang berikutnya dengan keterangan "banding ditolak".'}</p>
        <label for="sdAlasan">${kabul ? 'Alasan pengabulan <span class="sd-wajib">wajib</span>' : 'Alasan penolakan (boleh dikosongkan)'}</label>
        <textarea id="sdAlasan" rows="3" maxlength="500" placeholder="${kabul ? 'Contoh: menurut buku klinik ananda dirawat pada tanggal itu; nama tertukar dengan teman sekamar.' : 'Contoh: mudabbir dan dua saksi membenarkan catatan.'}"></textarea>
      </div>`,
      didOpen: (el) => setTimeout(() => el.querySelector('#sdAlasan')?.focus(), 60),
      preConfirm: async () => {
        const v = (A.Swal.getPopup().querySelector('#sdAlasan')?.value || '').trim();
        if (kabul && v.length < 5) { A.Swal.showValidationMessage('Tuliskan alasan pengabulan (paling sedikit 5 huruf).'); return false; }
        try {
          const { data, error } = await A.db.rpc('banding_putus', { p_id: Number(id), p_putusan: putusan, p_alasan: v || null });
          if (error) throw error;
          return data || true;
        } catch (e) { A.Swal.showValidationMessage(e.message || 'Gagal menyimpan.'); return false; }
      }
    });
    if (!res.isConfirmed) return;
    A.toast('success', kabul ? 'Banding dikabulkan · menunggu eksekusi super admin' : 'Banding ditolak · pasal kembali ke berkas sidang');
    await muatPenasihat(true); muat(true);
  }

  async function urungkanBanding(id) {
    const x = cariBanding(id); if (!x) return;
    const cabut = x.status === 'diajukan';
    const k = await A.Swal.fire({
      icon: 'question', title: cabut ? 'Cabut banding ini?' : 'Urungkan putusan banding?',
      html: `<div class="sd-swal"><p>${cabut ? 'Banding dihapus dan perkaranya kembali ke antrean sidang.' : 'Pasal kembali ke status "di penasihat" untuk dipertimbangkan ulang.'}</p></div>`,
      showCancelButton: true, confirmButtonText: cabut ? 'Ya, cabut' : 'Ya, urungkan', cancelButtonText: 'Tidak', confirmButtonColor: '#8E1B32'
    });
    if (!k.isConfirmed) return;
    try {
      const { error } = await A.db.rpc('banding_urungkan', { p_id: Number(id) });
      if (error) throw error;
      A.toast('success', cabut ? 'Banding dicabut' : 'Putusan banding diurungkan');
      await muatPenasihat(true); muat(true);
    } catch (e) { A.fireError(e); }
  }

  async function bandingManual() {
    const Mn = { hasil: [], pilih: null, t: 0 };
    const gambarHasil = (box) => {
      if (!Mn.hasil.length) { box.innerHTML = '<p class="sd-kecil">Tidak ditemukan santri angkatan VII–X dengan nama itu.</p>'; return; }
      box.innerHTML = Mn.hasil.map((s, i) => `<fieldset class="sd-m-santri${Mn.pilih === i ? ' on' : ''}">
          <legend><label><input type="radio" name="sdMS" value="${i}"${Mn.pilih === i ? ' checked' : ''}><b>${esc(s.nama)}</b><span>${esc(s.kelas || '')}${s.kamar ? ` · Kamar ${esc(s.kamar)}` : ''}</span></label></legend>
          ${Mn.pilih === i ? (s.perkara?.length ? s.perkara.map(p => { const mati = TAHAN.has(p.banding);
            return `<label class="sd-m-pasal${mati ? ' mati' : ''}"><input type="checkbox" value="${esc(p.id)}"${mati ? ' disabled' : ''}>
              <span><b>${esc(p.pelanggaran)}</b><small>${esc(labelTgl(p.tanggal))} · ${esc(p.kategori)} ke-${esc(p.tahap ?? '?')} · ${esc(STATUS_MANUAL[p.status] || p.status)}${mati ? ' · sedang dibanding' : p.banding ? ` · ${esc(LABEL_BANDING[p.banding] || p.banding)}` : ''}</small>
              ${p.catatan ? `<em>“${esc(p.catatan)}”</em>` : ''}</span></label>`; }).join('')
            : '<p class="sd-kecil">Tidak ada pasal Ringan/Sedang di bulan yang belum Tutup Buku.</p>') : ''}
        </fieldset>`).join('');
    };
    const res = await A.Swal.fire({
      title: 'Banding manual', width: 720, showCancelButton: true,
      confirmButtonText: '<i class="fa-solid fa-scale-balanced"></i> Ajukan banding', cancelButtonText: 'Batal',
      confirmButtonColor: '#0F766E', showLoaderOnConfirm: true, allowOutsideClick: () => !A.Swal.isLoading(),
      html: `<div class="sd-swal sd-manual">
        <p>Untuk perkara yang sudah dibacakan sebelum antrean v2.68, yang sudah di tangan musyrif, atau yang tuntas tetapi salah catat. Cari santri, centang pasal yang disanggah, lalu tulis pokok keberatannya.</p>
        <label class="sd-cari sd-cari-penuh"><i class="fa-solid fa-magnifying-glass"></i><input type="search" id="sdMCari" placeholder="Ketik nama santri (paling sedikit 3 huruf)" autocomplete="off"></label>
        <div id="sdMHasil" class="sd-manual-hasil"><p class="sd-kecil">Hasil pencarian tampil di sini.</p></div>
        <label for="sdMPokok">Pokok keberatan santri <span class="sd-wajib">wajib</span></label>
        <textarea id="sdMPokok" rows="3" maxlength="500" placeholder="Contoh: ananda menyatakan sedang di klinik pada 3 November; nama tertukar dengan teman sekamar."></textarea>
      </div>`,
      didOpen: (el) => {
        const inp = el.querySelector('#sdMCari'), box = el.querySelector('#sdMHasil');
        inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') e.preventDefault(); });
        inp.addEventListener('input', () => {
          clearTimeout(Mn.t);
          const v = inp.value.trim();
          if (v.length < 3) { box.innerHTML = '<p class="sd-kecil">Ketik paling sedikit 3 huruf.</p>'; return; }
          Mn.t = setTimeout(async () => {
            box.innerHTML = '<p class="sd-kecil"><i class="fa-solid fa-circle-notch fa-spin"></i> Mencari…</p>';
            try {
              const { data, error } = await A.db.rpc('banding_manual_cari', { p_cari: v });
              if (error) throw error;
              Mn.hasil = Array.isArray(data) ? data : []; Mn.pilih = Mn.hasil.length === 1 ? 0 : null;
              gambarHasil(box);
            } catch (e) { box.innerHTML = `<p class="sd-galat">${esc(e.message || e)}</p>`; }
          }, 300);
        });
        box.addEventListener('change', (e) => { const r = e.target.closest('input[name="sdMS"]'); if (r) { Mn.pilih = Number(r.value); gambarHasil(box); } });
        setTimeout(() => inp.focus(), 60);
      },
      preConfirm: async () => {
        const pop = A.Swal.getPopup();
        const ids = [...pop.querySelectorAll('.sd-m-santri.on input[type="checkbox"]:checked')].map(x => x.value);
        const pokok = (pop.querySelector('#sdMPokok')?.value || '').trim();
        if (!ids.length) { A.Swal.showValidationMessage('Pilih santri, lalu centang paling sedikit satu pasal.'); return false; }
        if (pokok.length < 5) { A.Swal.showValidationMessage('Tuliskan pokok keberatan santri (paling sedikit 5 huruf).'); pop.querySelector('#sdMPokok')?.focus(); return false; }
        try {
          const { data, error } = await A.db.rpc('banding_manual_ajukan', { p_ids: ids, p_pokok: pokok });
          if (error) throw error;
          return data || true;
        } catch (e) { A.Swal.showValidationMessage(e.message || 'Gagal mengajukan.'); return false; }
      }
    });
    if (!res.isConfirmed) return;
    A.toast('success', `${angka(res.value?.banding || 1)} pasal diajukan banding`);
    S.pen.saring = 'diajukan';
    await muatPenasihat(true); muat(true);
  }


  /* =================================================================
   *  v2.69 · SUSUNAN MAJELIS — santri XI dari daftar saran (tanpa NISN)
   *  Wajib lengkap sebelum unduh berkas & palu pertama (kecuali super
   *  admin). Server memeriksa ulang; apresiasi dicatat server.
   * ================================================================= */
  const kelompokTampil = () => { const p = S.data?.panitia || {}; const w = p.wajib || {};
    return URUT_KELOMPOK.filter(k => w[k] || p.isi?.pj?.[k]); };
  /** Nama majelis untuk PDF & berita acara. */
  function namaMajelis() {
    const p = S.data?.panitia;
    if (!p) return { ...(S.data?.majelis || {}), pj: {} };
    const o = { pj: {} };
    JABATAN_INTI.forEach(([k]) => { o[k] = p.isi?.[k]?.nama || ''; });
    Object.entries(p.isi?.pj || {}).forEach(([k, v]) => { o.pj[k] = v?.nama || ''; });
    o.pembimbing = p.pembimbing || '';
    return o;
  }
  /** v2.70: kursi majelis — inti (selalu wajib) + PJ per kelompok bentuk yang ada di berkas. */
  function kursiMajelis() {
    const p = S.data?.panitia || {}, w = p.wajib || {};
    return [...JABATAN_INTI.map(([k, l]) => ({ id: k, label: l, isi: p.isi?.[k], wajib: true, poin: k === 'ketua' ? 15 : 10 })),
      ...kelompokTampil().map(k => ({ id: 'pj-' + k, pj: k, label: `PJ ${KELOMPOK[k]}`, isi: p.isi?.pj?.[k], wajib: !!w[k], poin: 10, nPk: Number(w[k]) || 0 }))];
  }
  const kursiTerisi = () => { const l = kursiMajelis().filter(k => k.wajib); return { n: l.filter(k => k.isi?.nama).length, dari: l.length }; };
  /** Inisial dua huruf untuk medali kursi ("Muhammad" & gelar dilompati). */
  const inisial = (nama) => {
    const k = String(nama || '').replace(/[,.]/g, ' ').split(/\s+/).filter(w => w && !/^(muhammad|muhammmad|m|t|teuku|cut|ust|ustz|ustadz|ustaz|ustadzah|ustazah|tgk)$/i.test(w));
    return (k.length ? k : String(nama || '?').split(/\s+/)).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  };

  /* ---------- v2.70 · Para Pendidik untuk Pembimbing (nama + foto) ---------- */
  function muatPendidik() {
    if (!S.pendidik) S.pendidik = Promise.resolve(A.db.rpc('tim_pendidik_rpc'))
      .then(({ data, error }) => { if (error) throw error; return (data?.pendidik || []).filter(g => g && g.nama).map(g => ({ nama: g.nama, foto: g.foto || '', role: g.role || '' })); })
      .catch(() => [])
      .then(l => { S.guru = l; return l; });
    return S.pendidik;
  }
  const GELAR = /\b(ust|ustz|ustadz|ustaz|ustadzah|ustazah|ustadzat|tgk|teungku|s|pd|sos|sh|lc|ma|hi|th|ag|si|kom|ss|se|mpd|spd|ssos|sag|spdi|mag|mpdi)\b/g;
  const normNama = (s) => String(s || '').toLowerCase().replace(/[^a-z\s]/g, ' ').replace(GELAR, ' ').replace(/\s+/g, ' ').trim();
  function cariPendidik(nama) {
    const k = normNama(nama); if (!k || !Array.isArray(S.guru)) return null;
    return S.guru.find(g => normNama(g.nama) === k)
      || S.guru.find(g => { const n = normNama(g.nama); return n.length > 3 && (n.includes(k) || k.includes(n)); }) || null;
  }
  function fotoGuruHtml(nama, kelas = '') {
    const g = cariPendidik(nama);
    return `<span class="sd-guru-foto ${kelas}" aria-hidden="true">${esc(inisial(nama) || '?')}${g?.foto ? `<img src="${esc(g.foto)}" alt="" loading="lazy" decoding="async" draggable="false" data-foto>` : ''}</span>`;
  }
  /** Foto yang gagal dimuat diganti inisial (tanpa onerror sebaris). */
  function rapikanFoto(akar) {
    akar?.querySelectorAll?.('img[data-foto]:not([data-siap])').forEach(img => {
      img.dataset.siap = '1';
      const ok = () => img.closest('.sd-guru-foto')?.classList.add('termuat');
      if (img.complete && img.naturalWidth) ok(); else img.addEventListener('load', ok, { once: true });
      img.addEventListener('error', () => img.remove(), { once: true });
    });
  }

  /* =================================================================
   *  v2.70 · MEJA MAJELIS — kursi-kursi majelis di bawah panggung.
   *  Kelas `sd-mj-ringkas` dipertahankan (uji & gaya v2.69).
   * ================================================================= */
  function htmlMajelisRingkas() {
    if (!adaPanitia()) return '';
    const p = S.data.panitia, t = kursiTerisi(), bisa = majelis();
    if (p.pembimbing && !S.guru) muatPendidik().then(() => { if (S.akar && !S.antre) gambarIsi(); });
    const kursi = (x, i) => {
      const nama = x.isi?.nama || '', tag = bisa ? 'button' : 'div';
      const atr = bisa ? ` type="button" data-aksi="kursi" data-nilai="${esc(x.id)}" title="${esc(nama ? `${x.label}: ${nama} — ubah` : `Isi ${x.label}`)}"` : '';
      return `<li style="--i:${i}"><${tag}${atr} class="sd-mjk${x.id === 'ketua' ? ' ketua' : ''}${x.pj ? ' pj' : ''} ${nama ? 'isi' : x.wajib ? 'kosong' : 'opsional'}">
        <span class="sd-mjk-medali" aria-hidden="true">${nama ? esc(inisial(nama)) : '<i class="fa-solid fa-plus"></i>'}</span>
        <span class="sd-mjk-teks"><small>${esc(x.label)}${x.nPk ? ` <em>${angka(x.nPk)}</em>` : ''}</small><b>${nama ? esc(nama) : `<em>${x.wajib ? 'belum diisi' : 'boleh kosong'}</em>`}</b>${x.isi?.kelas ? `<i>${esc(x.isi.kelas)}</i>` : ''}</span>
      </${tag}></li>`;
    };
    const kilau = Date.now() < S.kilauMj ? ' kilau' : '';
    return `<section class="sd-mj-ringkas sd-mejamj${p.lengkap ? ' lengkap' : ''}${kilau}" id="sdMejaMj" aria-label="Susunan majelis">
      <header class="sd-mejamj-kepala">
        <h3><i class="fa-solid fa-users-rectangle"></i>Susunan majelis</h3>
        <span class="sd-mejamj-hitung${p.lengkap ? ' ok' : ''}">${p.lengkap ? '<i class="fa-solid fa-circle-check"></i>Lengkap' : `${angka(t.n)}/${angka(t.dari)} kursi wajib`}</span>
        ${p.kredit ? '<span class="sd-tanda putus" title="Apresiasi amanah keadilan sudah tercatat">apresiasi tercatat</span>' : ''}
        ${bisa ? `<button type="button" class="sd-btn sd-btn-tipis sd-mejamj-ubah" data-aksi="majelis"><i class="fa-solid fa-user-pen"></i>${p.lengkap ? 'Ubah susunan majelis' : 'Isi susunan majelis'}<kbd>M</kbd></button>` : ''}
      </header>
      ${!p.lengkap && bisa && !S.data.super ? '<p class="sd-mejamj-pesan"><i class="fa-solid fa-hand-pointer"></i>Klik kursi bertanda + untuk mengisinya. Majelis wajib lengkap sebelum palu pertama dan unduh berkas.</p>' : ''}
      <ol class="sd-mjk-daftar">${kursiMajelis().map(kursi).join('')}</ol>
      ${p.pembimbing ? `<p class="sd-mejamj-pembimbing">${fotoGuruHtml(p.pembimbing)}<span><small>Pembimbing</small><b>${esc(p.pembimbing)}</b></span></p>` : ''}
      ${S.data.super && !p.lengkap ? '<p class="sd-kecil">Super admin boleh bersidang tanpa susunan majelis; apresiasi hanya tercatat bila susunan diisi.</p>' : ''}
    </section>`;
  }

  /** Buka formulir susunan majelis. Mengembalikan true bila tersimpan. */
  async function bukaMajelis(sebab, fokus) {
    if (!adaPanitia() || !majelis()) return true;
    const p = S.data.panitia;
    const pilih = {};
    muatPendidik();
    const baris = kursiMajelis().map(k => ({ ...k,
      ket: k.pj ? (k.wajib ? `${angka(k.nPk)} perkara · 10 poin` : 'tidak ada perkara · boleh dikosongkan') : `${k.poin} poin` }));
    const JUDUL_GRUP = { ketua: ['fa-gavel', 'Majelis hakim'], panitera: ['fa-feather-pointed', 'Panitera & Penasihat'] };
    const pjPertama = baris.find(b => b.pj)?.id;
    const judulGrup = (b) => { const g = JUDUL_GRUP[b.id] || (b.id === pjPertama ? ['fa-user-check', 'Penanggung jawab eksekusi'] : null);
      return g ? `<li class="sd-mj-judul" aria-hidden="true"><i class="fa-solid ${g[0]}"></i>${g[1]}</li>` : ''; };
    const nWajib = baris.filter(b => b.wajib).length;
    baris.forEach(b => { if (b.isi?.kunci) pilih[b.id] = { kunci: b.isi.kunci, nama: b.isi.nama, kelas: b.isi.kelas }; });
    const ket = { berkas: 'sebelum berkas diunduh', mulai: 'sebelum sidang dibuka', ketuk: 'sebelum palu diketuk' }[sebab] || '';
    const res = await A.Swal.fire({
      title: 'Susunan majelis', width: 700, showCancelButton: true,
      confirmButtonText: '<i class="fa-solid fa-floppy-disk"></i> Simpan susunan', cancelButtonText: 'Batal', confirmButtonColor: '#8E1B32',
      showLoaderOnConfirm: true, allowOutsideClick: () => !A.Swal.isLoading(), customClass: { popup: 'sd-mj-pop' },
      html: `<div class="sd-swal sd-mj">
        <p class="sd-berkas-sesi"><i class="fa-solid fa-scale-balanced"></i><span>Sidang <b>${esc(labelHari(sesiBerkas(), true))}</b> · OSDA ${esc(unitBerkas())}${ket ? ` · <em>${esc(ket)}</em>` : ''}</span></p>
        <p class="sd-mj-hitung" aria-live="polite"><span class="sd-mj-hitung-bilah"><i style="--isi:0%"></i></span><span><b id="sdMjN">0</b>/${angka(nWajib)} kursi wajib terisi</span></p>
        ${!p.lengkap && (p.kurang || []).length ? `<p class="sd-mj-kurang"><i class="fa-solid fa-circle-exclamation"></i><span>Belum lengkap: <b>${esc(p.kurang.join(', '))}</b></span></p>` : ''}
        <p class="sd-kecil">Pilih dari santri angkatan XI${unitBerkas() !== 'Putra & Putri' ? ` ${esc(unitBerkas().toLowerCase())}` : ''}; satu santri satu jabatan. Nilai tanggung jawab keadilan menjadi apresiasi otomatis saat palu pertama diketuk: Hakim Ketua 15 poin, lainnya 10 poin. Jumlah PJ mengikuti bentuk pembinaan yang ada di berkas.</p>
        <ol class="sd-mj-daftar">${baris.map(b => `${judulGrup(b)}<li class="sd-mj-baris${b.pj ? ' pj pj-' + b.pj : ''}">
          <label for="sdMj-${b.id}">${esc(b.label)}${b.wajib ? ' <span class="sd-wajib">wajib</span>' : ''}<small>${esc(b.ket)}</small></label>
          <div class="sd-mj-isi"><input type="text" id="sdMj-${b.id}" data-mj="${b.id}" autocomplete="off" maxlength="60" placeholder="Ketik nama santri XI…" value="${esc(b.isi?.nama || '')}"${b.isi?.kunci ? ' data-ok="1"' : ''}>
            <span class="sd-mj-kelas">${esc(b.isi?.kelas || '')}</span>
            <ul class="sd-calon" role="listbox" hidden></ul></div></li>`).join('')}
          <li class="sd-mj-judul" aria-hidden="true"><i class="fa-solid fa-person-chalkboard"></i>Pembimbing</li>
          <li class="sd-mj-baris pembimbing"><label for="sdMj-pembimbing">Pembimbing<small>opsional · ustadz/ustazah · tanpa apresiasi</small></label>
            <div class="sd-mj-isi"><input type="text" id="sdMj-pembimbing" maxlength="80" autocomplete="off" placeholder="Pilih dari Para Pendidik…" value="${esc(p.pembimbing || '')}">
              <ul class="sd-calon sd-calon-guru" role="listbox" hidden></ul></div></li>
        </ol></div>`,
      didOpen: (el) => {
        let t = 0, tok = 0;
        const tutupSemua = () => el.querySelectorAll('.sd-calon').forEach(u => { u.hidden = true; u.innerHTML = ''; });
        // v2.70: penghitung kursi wajib
        const hitungIsi = () => { const n = baris.filter(b => b.wajib && pilih[b.id]).length;
          const nb = el.querySelector('#sdMjN'); if (nb) nb.textContent = angka(n);
          el.querySelector('.sd-mj-hitung-bilah i')?.style.setProperty('--isi', `${nWajib ? Math.round(n / nWajib * 100) : 100}%`);
          el.querySelector('.sd-mj-hitung')?.classList.toggle('ok', n >= nWajib); };
        el.addEventListener('input', () => setTimeout(hitungIsi, 0));
        el.addEventListener('click', () => setTimeout(hitungIsi, 0));
        // v2.70: Pembimbing — saran dari Para Pendidik (nama + foto); ketik bebas tetap boleh
        const inpG = el.querySelector('#sdMj-pembimbing'), ulG = el.querySelector('.sd-calon-guru');
        const saranGuru = () => muatPendidik().then(l => {
          if (document.activeElement !== inpG) return;
          const q = normNama(inpG.value);
          const cocok = l.filter(g => !q || normNama(g.nama).includes(q)).slice(0, 8);
          ulG.innerHTML = cocok.length ? cocok.map(g => `<li><button type="button" role="option" data-guru="${esc(g.nama)}">${fotoGuruHtml(g.nama, 'kecil')}
              <span><b>${esc(g.nama)}</b><small>${esc(g.role === 'Guru' ? 'Para Pendidik' : g.role || 'Para Pendidik')}</small></span></button></li>`).join('')
            : (l.length ? '<li class="sd-calon-kosong">Tidak ada di Para Pendidik — nama yang diketik tetap tersimpan.</li>' : '');
          ulG.hidden = !ulG.innerHTML; rapikanFoto(ulG);
        });
        inpG?.addEventListener('focus', saranGuru);
        inpG?.addEventListener('input', () => { clearTimeout(t); t = setTimeout(saranGuru, 120); });
        el.addEventListener('click', (e) => {
          const g = e.target.closest('.sd-calon-guru button[data-guru]'); if (!g) return;
          inpG.value = g.dataset.guru; ulG.hidden = true; ulG.innerHTML = '';
          A.Swal.getConfirmButton()?.focus();
        });
        inpG?.addEventListener('keydown', (e) => {
          if (e.key !== 'Enter') return;
          const pertama = ulG.querySelector('button[data-guru]');
          if (pertama && !ulG.hidden) { e.preventDefault(); e.stopPropagation(); pertama.click(); }
        });
        el.addEventListener('input', (e) => {
          const inp = e.target.closest('input[data-mj]'); if (!inp) return;
          const id = inp.dataset.mj, ul = inp.parentElement.querySelector('.sd-calon');
          delete pilih[id]; inp.dataset.ok = ''; inp.parentElement.querySelector('.sd-mj-kelas').textContent = '';
          const q = inp.value.replace(/\s+/g, ' ').trim();
          clearTimeout(t);
          if (q.length < 2) { ul.hidden = true; ul.innerHTML = ''; return; }
          t = setTimeout(async () => {
            const my = ++tok;
            try {
              const { data, error } = await A.db.rpc('sidang_calon_panitia', { p_cari: q, p_unit: S.data?.unit || S.unit || null });
              if (error) throw error;
              if (my !== tok) return;
              const dipakai = new Set(Object.entries(pilih).filter(([k]) => k !== id).map(([, v]) => v.kunci));
              ul.innerHTML = (data || []).length ? data.map(c => `<li><button type="button" role="option" data-kunci="${esc(c.kunci)}" data-nama="${esc(c.nama)}" data-kelas="${esc(c.kelas || '')}"${dipakai.has(c.kunci) ? ' disabled' : ''}>
                  <b>${esc(c.nama)}</b><small>${esc(c.kelas || '')}${c.kamar ? ` · Kamar ${esc(c.kamar)}` : ''}${dipakai.has(c.kunci) ? ' · sudah memegang jabatan' : c.tugas ? ` · bertugas ${angka(c.tugas)}× bulan ini` : ''}</small></button></li>`).join('')
                : '<li class="sd-calon-kosong">Tidak ada santri angkatan XI dengan nama itu.</li>';
              ul.hidden = false;
            } catch (er) { ul.innerHTML = `<li class="sd-calon-kosong">${esc(String(er?.message || er))}</li>`; ul.hidden = false; }
          }, 220);
        });
        el.addEventListener('click', (e) => {
          const b = e.target.closest('.sd-calon button[data-kunci]');
          if (!b) { if (!e.target.closest('.sd-mj-isi')) tutupSemua(); return; }
          const inp = b.closest('.sd-mj-isi').querySelector('input[data-mj]');
          pilih[inp.dataset.mj] = { kunci: b.dataset.kunci, nama: b.dataset.nama, kelas: b.dataset.kelas };
          inp.value = b.dataset.nama; inp.dataset.ok = '1';
          inp.parentElement.querySelector('.sd-mj-kelas').textContent = b.dataset.kelas;
          tutupSemua();
          ([...el.querySelectorAll('input[data-mj]')].find(x => !x.dataset.ok) || el.querySelector('#sdMj-pembimbing'))?.focus();
        });
        // Enter di isian memilih saran pertama (bukan menyimpan formulir)
        el.addEventListener('keydown', (e) => {
          const inp = e.target.closest?.('input[data-mj]');
          if (!inp || e.key !== 'Enter') return;
          const pertama = inp.parentElement.querySelector('.sd-calon:not([hidden]) button[data-kunci]:not([disabled])');
          if (pertama) { e.preventDefault(); e.stopPropagation(); pertama.click(); }
        }, true);
        hitungIsi();
        setTimeout(() => {
          const f = fokus && (el.querySelector('#sdMj-' + fokus) || (fokus === 'pembimbing' && inpG));
          const sasaran = f || [...el.querySelectorAll('input[data-mj]')].find(x => !x.dataset.ok) || el.querySelector('input[data-mj]');
          sasaran?.focus(); if (f && f.value) f.select();
          f?.closest('.sd-mj-baris')?.classList.add('disorot');
          if (f) f.scrollIntoView?.({ block: 'nearest' });
        }, 80);
      },
      preConfirm: async () => {
        const pop = A.Swal.getPopup();
        const salah = baris.filter(b => !pilih[b.id] && (pop.querySelector('#sdMj-' + b.id)?.value || '').trim()).map(b => b.label);
        if (salah.length) { A.Swal.showValidationMessage(`${salah.join(', ')}: pilih nama dari daftar saran.`); return false; }
        const kosong = baris.filter(b => b.wajib && !pilih[b.id]).map(b => b.label);
        if (kosong.length) { A.Swal.showValidationMessage(`Belum diisi: ${kosong.join(', ')}.`); return false; }
        const isi = { pj: {} };
        baris.forEach(b => { const v = pilih[b.id]; if (!v) return; if (b.pj) isi.pj[b.pj] = v.kunci; else isi[b.id] = v.kunci; });
        isi.pembimbing = (pop.querySelector('#sdMj-pembimbing')?.value || '').replace(/\s+/g, ' ').trim();
        try {
          const { data, error } = await A.db.rpc('sidang_panitia_simpan', { p_sesi: sesiBerkas(), p_unit: S.data?.unit || S.unit || null, p_isi: isi });
          if (error) throw error;
          return data;
        } catch (er) { A.Swal.showValidationMessage(String(er?.message || er)); return false; }
      }
    });
    if (!res.isConfirmed || !res.value) return false;
    S.data.panitia = res.value;
    const n = namaMajelis();
    S.data.majelis = { ...(S.data.majelis || {}), sesi: sesiBerkas(), ketua: n.ketua, anggota1: n.anggota1, anggota2: n.anggota2, panitera: n.panitera };
    const akanLantik = res.value.lengkap && !sudahDilantik();
    if (!akanLantik) A.toast('success', res.value.kredit ? 'Susunan majelis tersimpan · apresiasi diperbarui' : 'Susunan majelis tersimpan');
    gambarSemua(); if (S.antre) gambarAntre();
    if (akanLantik) await pelantikan();
    return true;
  }

  /* =================================================================
   *  v2.70 · ① PELANTIKAN MAJELIS — sekali per sesi per unit.
   *  Benang Emas menjahit kursi Hakim Ketua ke setiap anggota; nama naik
   *  kata demi kata; Cap "Majelis Sah" + satu ketukan palu. Ketuk / Enter
   *  / Spasi / Esc untuk melanjutkan. Kurangi gerak & hemat: kartu diam.
   * ================================================================= */
  const kunciLantik = () => `rq-sidang-lantik-${sesiBerkas()}-${S.data?.unit || 'semua'}`;
  const sudahDilantik = () => { try { return localStorage.getItem(kunciLantik()) === '1'; } catch (e) { return false; } };
  function pelantikan(paksa) {
    if (!S.akar || !adaPanitia() || S.lantik) return Promise.resolve();
    if (sudahDilantik() && !paksa) return Promise.resolve();
    try { localStorage.setItem(kunciLantik(), '1'); } catch (e) {}
    const diam = !bolehGerak() || A.hemat();
    const k = kursiMajelis().filter(x => x.isi?.nama);
    const cari = (id) => k.find(x => x.id === id);
    const baris = [[cari('anggota1'), cari('ketua'), cari('anggota2')], [cari('panitera'), cari('penasihat')], k.filter(x => x.pj)]
      .map(r => r.filter(Boolean)).filter(r => r.length);
    // urutan jahitan (pola ular, tanpa menyilang): Ketua → Anggota I; Ketua → Anggota II → Penasihat → Panitera → PJ
    const urut = ['ketua', 'anggota1', 'anggota2', 'penasihat', 'panitera', ...k.filter(x => x.pj).map(x => x.id)].filter(id => cari(id));
    const kata = (nama) => String(nama).split(/\s+/).map((w, j) => `<span class="kk"><span class="kk-i" style="--j:${j}">${esc(w)}</span></span>`).join(' ');
    const kursi = (x) => `<li class="sd-lt-kursi${x.id === 'ketua' ? ' ketua' : ''}${x.pj ? ' pj' : ''}" data-id="${esc(x.id)}" style="--u:${urut.indexOf(x.id)}">
        <span class="sd-lt-medali"><span>${esc(inisial(x.isi.nama))}</span></span>
        <small>${esc(x.label)}</small><b>${kata(x.isi.nama)}</b>${x.isi.kelas ? `<i>${esc(x.isi.kelas)}</i>` : ''}<em>+${x.poin}</em></li>`;
    const pb = S.data.panitia.pembimbing;
    const el = document.createElement('div');
    el.className = `sd-lantik${diam ? ' diam' : ''}`;
    el.dataset.unit = unitHakim();
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'Pelantikan majelis');
    el.innerHTML = `<div class="sd-lt-panggung">
        <p class="sd-lt-kop"><span class="ar" lang="ar" dir="rtl">مَجْلِسُ التَّأْدِيبِ</span><small>Sidang ${esc(labelHari(sesiBerkas(), true))} · OSDA ${esc(unitBerkas())}</small></p>
        <h2 class="sd-lt-judul"><span class="kk"><span class="kk-i">Majelis</span></span> <span class="kk"><span class="kk-i" style="--j:1">Ta'dib</span></span> <span class="kk"><span class="kk-i" style="--j:2">dilantik</span></span></h2>
        <div class="sd-lt-bangku">
          <svg class="sd-lt-benang" aria-hidden="true"><path class="sd-lt-cahaya" pathLength="1"/><path class="sd-lt-garis" pathLength="1"/></svg>
          ${baris.map(r => `<ol class="sd-lt-baris">${r.map(kursi).join('')}</ol>`).join('')}
        </div>
        <p class="sd-lt-amanah"><i class="fa-solid fa-medal"></i><span>Amanah keadilan · Hakim Ketua <b>15</b> · anggota <b>10</b> poin — tercatat saat palu pertama diketuk.</span></p>
        ${pb ? `<p class="sd-lt-pembimbing">${fotoGuruHtml(pb, 'besar')}<span><small>Dibimbing oleh</small><b>${esc(pb)}</b></span></p>` : ''}
        <span class="sd-lt-cap" aria-hidden="true"><span><b lang="ar">عَدْل</b>Majelis<br>Sah</span></span>
      </div>
      <p class="sd-lt-lewati">Ketuk atau tekan Enter untuk membuka sidang</p>`;
    S.akar.appendChild(el);
    rapikanFoto(el);
    // benang: lengkung tergantung dari medali ke medali (dihitung sesudah tata letak)
    const bangku = el.querySelector('.sd-lt-bangku');
    const pusat = (id) => { const m = el.querySelector(`.sd-lt-kursi[data-id="${id}"] .sd-lt-medali`); if (!m) return null;
      const r = m.getBoundingClientRect(), b = bangku.getBoundingClientRect(); return [r.left - b.left + r.width / 2, r.top - b.top + r.height / 2]; };
    const titik = urut.map(pusat);
    let d = '', panjang = [0];
    titik.forEach((t, i) => {
      if (!t) { panjang.push(panjang[i - 1] || 0); return; }
      const [x, y] = t;
      if (!i) { d = `M${x.toFixed(1)} ${y.toFixed(1)}`; return; }
      // Anggota II bercabang dari Ketua (sub-jalur baru), selebihnya bersambung
      const dari = urut[i] === 'anggota2' && titik[0] ? titik[0] : titik[i - 1];
      if (!dari) return;
      const [x0, y0] = dari, mx = (x0 + x) / 2, my = Math.max(y0, y) + 26;
      if (dari !== titik[i - 1]) d += ` M${x0.toFixed(1)} ${y0.toFixed(1)}`;
      d += ` Q${mx.toFixed(1)} ${my.toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)}`;
      panjang.push(panjang[i - 1] + Math.hypot(x - x0, y - y0) + 18);
    });
    el.querySelectorAll('.sd-lt-benang path').forEach(p_ => p_.setAttribute('d', d));
    const total = panjang[panjang.length - 1] || 1;
    const MULAI = 380, JAHIT = Math.min(1250, 260 + titik.length * 130);
    urut.forEach((id, i) => el.querySelector(`.sd-lt-kursi[data-id="${id}"]`)?.style.setProperty('--t', `${Math.round(MULAI + (panjang[i] || 0) / total * JAHIT)}ms`));
    el.style.setProperty('--jahit', `${JAHIT}ms`); el.style.setProperty('--cap', `${MULAI + JAHIT + 160}ms`);
    // layar pendek: seluruh panggung diskalakan agar muat (jalur benang sudah diukur sebelum skala)
    const pg = el.querySelector('.sd-lt-panggung'), ruang = el.clientHeight - 72, tinggi = pg.offsetHeight;
    if (tinggi > ruang && ruang > 200) { const sk = Math.max(.58, ruang / tinggi);
      pg.style.transformOrigin = '50% 0'; pg.style.transform = `scale(${sk.toFixed(3)})`; pg.style.marginBottom = `${(-tinggi * (1 - sk)).toFixed(0)}px`; }
    return new Promise(selesai => {
      let habis = false, tCap = 0, tAkhir = 0;
      const mulaiPada = performance.now();
      const tutup = () => {
        if (habis || performance.now() - mulaiPada < 220) return;
        habis = true; clearTimeout(tCap); clearTimeout(tAkhir);
        S.lantik = null;
        el.classList.add('pergi');
        setTimeout(() => { el.remove(); selesai(); }, diam ? 0 : 260);
      };
      S.lantik = { tutup };
      el.addEventListener('click', tutup);
      requestAnimationFrame(() => el.classList.add('tayang'));
      tCap = setTimeout(() => ketukPalu(1, el), diam ? 0 : MULAI + JAHIT + 220);
      tAkhir = setTimeout(tutup, diam ? 2600 : MULAI + JAHIT + 2100);
    });
  }

  /** Mulai / lanjutkan sidang: majelis dilengkapi dulu bila perlu. */
  async function mulaiSidang(kunci, ulang) {
    if (bolehPutus() && perluMajelis() && !(await bukaMajelis('mulai'))) return;
    bukaAntre(kunci, ulang);
  }

  /** S: sahkan pelaksanaan pembinaan yang sudah di tangan musyrif sejak sidang sebelumnya. */
  async function sahkan(s) {
    if (!s || !bolehPutus() || !adaPanitia()) return;
    const l = siapSah(s);
    if (!l.length) { A.toast('info', `Tidak ada pembinaan ${s.nama} dari sidang sebelumnya yang menunggu pengesahan.`); return; }
    if (perluMajelis() && !(await bukaMajelis('ketuk'))) return;
    const kunci = s.kunci;
    const res = await A.Swal.fire({
      title: 'Sahkan pelaksanaan pembinaan', width: 640, showCancelButton: true,
      confirmButtonText: '<i class="fa-solid fa-stamp"></i> Sahkan yang dicentang', cancelButtonText: 'Batal', confirmButtonColor: '#3730A3',
      showLoaderOnConfirm: true, allowOutsideClick: () => !A.Swal.isLoading(),
      html: `<div class="sd-swal sd-sah">
        <p class="sd-kecil">Ananda <b>${esc(s.nama)}</b> · ${esc(s.kelas)}. Centang pembinaan yang <b>benar-benar sudah dijalankan</b> sejak dibacakan, sesuai kesaksian penanggung jawab eksekusi. Pembinaan tercatat <b>Disahkan OSDA</b>; musyrif menerima pesan dan boleh menyanggah dalam 3 hari.</p>
        <ul class="sd-sah-daftar">${l.map(b => `<li><label><input type="checkbox" value="${esc(b.id)}">
          <span><b>${esc(b.pelanggaran)}</b><small>${esc(b.kategori)} ke-${esc(b.tahap || '?')} · ${esc(b.bentuk || '-')}</small>
          <small>Diserahkan ${esc(labelTgl(b.sesi))}${b.penerima ? ` kepada ${esc(b.penerima.join(', '))}` : ''}${Array.isArray(b.pj) && b.pj.length ? ` · saksi PJ ${esc(b.pj.join(', '))}` : ''}</small></span></label></li>`).join('')}</ul></div>`,
      didOpen: (el) => setTimeout(() => el.querySelector('.sd-sah-daftar input')?.focus(), 60),
      preConfirm: async () => {
        const ids = [...A.Swal.getPopup().querySelectorAll('.sd-sah-daftar input:checked')].map(x => x.value);
        if (!ids.length) { A.Swal.showValidationMessage('Centang minimal satu pembinaan yang sudah dijalankan.'); return false; }
        try {
          const { data, error } = await A.db.rpc('sidang_sahkan_osda', { p_ids: ids });
          if (error) throw error;
          return { ids, data: data || {} };
        } catch (er) { A.Swal.showValidationMessage(String(er?.message || er)); return false; }
      }
    });
    if (!res.isConfirmed || !res.value) { fokusAntre(); return; }
    const lewat = res.value.data.dilewati || [];
    const tolak = new Set(lewat.map(x => x.id));
    const t = santriDi(kunci) || s;
    let n = 0;
    const sahNama = [];
    for (const b of t.semua) if (res.value.ids.includes(b.id) && !tolak.has(b.id)) { b.status = 'tuntas'; b.sah_osda = true; delete b.hari_ini; n++; sahNama.push(b.pelanggaran); }
    if (S.antre && bolehGerak()) S.antre.sahBaru = sahNama;
    if (lewat.length) A.toast('warning', `${lewat[0].nama || t.nama}: ${lewat[0].sebab}`);
    if (n) A.toast('success', `${angka(n)} pembinaan ${t.nama} disahkan OSDA`);
    susun();
    if (S.antre) { gambarAntre(n ? 'sah' : ''); fokusAntre(); } else gambarSemua();
  }

  /* =================================================================
   *  BERKAS PERKARA (PDF) + SUSUNAN MAJELIS (v2.65, disusun ulang v2.68)
   *  Digambar langsung dengan jsPDF: teks vektor, tajam, berkas kecil.
   *  Huruf Helvetica bawaan PDF hanya Latin-1 → semua teks lewat teksPdf().
   * ================================================================= */
  const JABATAN = [['ketua', 'Hakim Ketua'], ['anggota1', 'Hakim Anggota I'], ['anggota2', 'Hakim Anggota II'], ['panitera', 'Panitera']];
  const santriBerkas = () => daftarAntre().filter(s => s.keadaan === 'dipanggil' || s.keadaan === 'lewati');
  const bolehBerkas = () => !!S.data && !S.galat && !reses() && santriBerkas().length > 0;
  const sesiBerkas = () => S.data?.sesi_berkas || (S.data?.buka ? S.data.hari : S.data?.berikut) || S.data?.hari;
  const unitBerkas = () => S.data?.unit === 'putri' ? 'Putri' : S.data?.unit === 'putra' ? 'Putra' : 'Putra & Putri';
  const kunciMajelis = () => `rq-sidang-majelis-${S.data?.unit || 'semua'}`;

  /** Nama majelis: dari server (sesi ini) → kalau belum ada, isian terakhir di perangkat ini. */
  function majelisAwal() {
    const srv = S.data?.majelis;
    if (srv && srv.ketua) return srv;
    try { return JSON.parse(localStorage.getItem(kunciMajelis()) || 'null') || {}; } catch (e) { return {}; }
  }
  function pilihanCakupan() {
    const l = santriBerkas();
    const o = [{ k: 'semua', label: 'Semua santri yang belum dipanggil', list: l }];
    [1, 2, 3, 4].forEach(P => { const x = l.filter(s => s.P === P); if (x.length) o.push({ k: 'p' + P, label: `${KODE[P].k} · ${KODE[P].l}`, list: x }); });
    return o.filter(x => x.list.length);
  }
  /** Teks aman untuk Helvetica (WinAnsi): tanda kutip/pisah dirapikan, diakritik dilepas. */
  function teksPdf(s) {
    return String(s == null ? '' : s)
      .replace(/[‘’ʼʻ]/g, "'").replace(/[“”]/g, '"')
      .replace(/[–—−]/g, '-').replace(/…/g, '...').replace(/[•●]/g, '-').replace(/→/g, '->')
      .normalize('NFKD').replace(/[̀-ͯ]/g, '')
      .replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, '').replace(/\s+/g, ' ').trim();
  }
  const tglPanjang = (k) => { const d = tglObj(k); return `${d.getUTCDate()} ${BULAN[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };

  /** Bahan PDF yang sudah tersusun (dipisah supaya bisa diuji tanpa jsPDF). */
  function isiBerkas(list, majelisNama, cakupanLabel) {
    const santri = list.slice().sort(urutSantri).map(s => ({
      nama: s.nama, kelas: s.kelas, kamar: s.kamar, P: s.P, jumlah: s.jumlah,
      izin: s.info?.izin || null, tertahan: s.tertahan.length,
      perkara: s.sesi.filter(b => !selesaiSesi(b)).map(b => ({
        pelanggaran: b.pelanggaran, tanggal: b.tanggal, kategori: b.kategori, tahap: b.tahap, bentuk: b.bentuk,
        ucapan: b.ucapan || null, kelompok: b.kelompok || [], diberikan: b.status === 'diberikan',
        label: [b.baru ? 'baru' : '', b.status === 'diberikan' ? `baca ulang (pertama ${labelTgl(b.sesi)})` : '', b.status === 'dibacakan' ? 'belum diserahkan' : '',
          b.banding === 'ditolak' ? 'banding ditolak' : '', b.banding === 'dikembalikan' ? 'banding dikembalikan' : ''].filter(Boolean).join(', ')
      }))
    }));
    const grup = [1, 2, 3, 4].map(P => ({ P, santri: santri.filter(s => s.P === P) })).filter(g => g.santri.length);
    // v2.69: susunan majelis bernama, tanggungan PJ eksekusi, dan perkara siap disahkan
    const panitia = adaPanitia() ? namaMajelis() : null;
    const pj = !panitia ? [] : URUT_KELOMPOK.map(k => ({ k, label: KELOMPOK[k], nama: panitia.pj[k] || '',
      santri: santri.flatMap(s => s.perkara.filter(p => !p.diberikan && p.kelompok.includes(k))
        .map(p => ({ nama: s.nama, kelas: s.kelas, kamar: s.kamar, bentuk: p.bentuk }))) })).filter(x => x.santri.length || x.nama);
    const batas = sesiBerkas();
    const siap = !panitia ? [] : list.slice().sort(urutSantri).flatMap(s => s.sesi.filter(b => b.status === 'diberikan' && b.sesi && b.sesi < batas && !tahan(b))
      .map(b => ({ nama: s.nama, kelas: s.kelas, pelanggaran: b.pelanggaran, bentuk: b.bentuk, sesi: b.sesi, pj: b.pj || [], penerima: b.penerima || [] })));
    return { sesi: sesiBerkas(), unit: unitBerkas(), cakupan: cakupanLabel, nSantri: santri.length,
      nPerkara: santri.reduce((a, s) => a + s.perkara.length, 0), grup, majelis: majelisNama || {}, panitia, pj, siap,
      persiapan: persiapan(), dicetak: new Date() };
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
    const naik = (fs) => fs * PT * 0.8;

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
    pdf.text(teksPdf(`${isi.cakupan} · ${angka(isi.nSantri)} santri · ${angka(isi.nPerkara)} perkara · Ringan & Sedang, angkatan VII-X`), W / 2, y, { align: 'center' });
    y += 4.4;
    pdf.text(teksPdf('Urutan panggil: perkara paling sedikit lebih dulu, lalu tahap terendah. Kode: P1 = 1 perkara · P2 = 2 · P3 = 3 · P4+ = 4 atau lebih.'), W / 2, y, { align: 'center' });
    y += 6.4;

    /* ---- tabel berpaginasi; sel boleh berupa daftar baris ---- */
    const PAD = 1.6, FS = 8, LH = FS * PT * 1.22;
    function tabel(kolom, baris) {
      const tetap = kolom.reduce((a, k) => a + (k.lebar || 0), 0);
      const bobot = kolom.reduce((a, k) => a + (k.lebar ? 0 : (k.bobot || 1)), 0);
      const lebar = kolom.map(k => k.lebar || (L - tetap) * (k.bobot || 1) / bobot);
      const kepala = () => {
        const h = 6.6;
        pdf.setFillColor(28, 26, 46); pdf.rect(mL, y, L, h, 'F');
        huruf(7.2, 'bold'); tinta(247, 241, 220);
        let x = mL;
        kolom.forEach((k, i) => {
          const tx = k.rata === 'center' ? x + lebar[i] / 2 : x + PAD;
          pdf.text(k.judul, tx, y + h / 2 + 1.2, { align: k.rata === 'center' ? 'center' : 'left' });
          x += lebar[i];
        });
        y += h;
      };
      /** Pecah satu sel menjadi baris-baris bergaya: [{teks, tebal}] */
      const pecah = (sel, k, w) => {
        const daftar = Array.isArray(sel) ? sel : [sel];
        const keluar = [];
        daftar.forEach((t, j) => {
          if (t == null || t === '') return;
          const tebal = (k.tebal && !Array.isArray(sel)) || (k.tebalPertama && j === 0);
          huruf(j && k.kecilSisa ? FS - 0.8 : FS, tebal ? 'bold' : 'normal');
          pdf.splitTextToSize(teksPdf(t), w).forEach(s => keluar.push({ s, tebal, kecil: !!(j && k.kecilSisa) }));
        });
        return keluar;
      };
      if (sisa() < 22) halamanBaru();
      kepala();
      let no = 0;
      baris.forEach((b) => {
        if (b.grup) {
          const h = 7;
          if (sisa() < h + 12) { halamanBaru(); kepala(); }
          pdf.setFillColor(...(b.warna || [232, 225, 205])); pdf.rect(mL, y, L, h, 'F');
          huruf(8.6, 'bold'); tinta(28, 26, 46);
          pdf.text(teksPdf(b.grup), mL + PAD, y + h / 2 + 1.3);
          if (b.kanan) { huruf(7.4); tinta(74, 71, 99); pdf.text(teksPdf(b.kanan), W - mR - PAD, y + h / 2 + 1.3, { align: 'right' }); }
          y += h; no = 0;
          return;
        }
        no++;
        const sel = b.sel.map(t => t === '#' ? String(no) : t);
        const isiSel = sel.map((t, i) => kolom[i].cek ? [] : pecah(t, kolom[i], lebar[i] - PAD * 2));
        const nBaris = Math.max(1, ...isiSel.map(l => l.length));
        const h = Math.max(7, nBaris * LH + 3);
        if (sisa() < h) { halamanBaru(); kepala(); }
        if (b.warna) { pdf.setFillColor(...b.warna); pdf.rect(mL, y, lebar[0], h, 'F'); }
        pdf.setDrawColor(217, 211, 195); pdf.setLineWidth(0.15); pdf.line(mL, y + h, W - mR, y + h);
        let x = mL;
        sel.forEach((t, i) => {
          const k = kolom[i];
          if (k.cek) {
            const s = 3.8; pdf.setDrawColor(74, 71, 99); pdf.setLineWidth(0.3);
            pdf.rect(x + (lebar[i] - s) / 2, y + 2.2, s, s);
          } else {
            let yy = y + 1.5 + naik(FS);
            isiSel[i].forEach(r => {
              huruf(r.kecil ? FS - 0.8 : FS, r.tebal ? 'bold' : 'normal');
              if (k.redup || r.kecil) tinta(84, 90, 108); else tinta(28, 26, 46);
              const tx = k.rata === 'center' ? x + lebar[i] / 2 : x + PAD;
              pdf.text(r.s, tx, yy, { align: k.rata === 'center' ? 'center' : 'left' });
              yy += LH;
            });
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

    /* ---- I · daftar panggil & perkara ---- */
    judulBagian('I. DAFTAR PANGGIL & PERKARA', 'Centang satu kotak untuk setiap santri');
    const baris = [];
    isi.grup.forEach(g => {
      baris.push({ grup: `${KODE[g.P].k} - ${KODE[g.P].l}`, kanan: `${angka(g.santri.length)} santri`, warna: WARNA_PDF[g.P] });
      g.santri.forEach(s => {
        const iz = s.izin ? (s.izin.kondisi === 'aktif' ? `Izin ${s.izin.jenis || ''} s.d. ${labelTgl(s.izin.selesai)}` : `Izin ${s.izin.jenis || ''} lewat batas ${labelTgl(s.izin.selesai)} (belum ditutup)`) : '';
        baris.push({
          warna: WARNA_PDF[g.P],
          sel: ['#',
            [`${s.nama} [${KODE[s.P].k}]`, `${s.kelas}${s.kamar ? ` · Kamar ${s.kamar}` : ''}`, iz, s.tertahan ? `${s.tertahan} perkara lain dalam banding` : ''],
            s.perkara.map(p => `${p.kategori} ke-${p.tahap || '?'}: ${p.pelanggaran} (${labelTgl(p.tanggal)}) -> ${p.bentuk}${p.label ? ` [${p.label}]` : ''}${p.ucapan ? ` · Ucapan tercatat: "${p.ucapan}"` : ''}`),
            '', '', '']
        });
      });
    });
    tabel([
      { judul: 'No', lebar: 9, rata: 'center', redup: true },
      { judul: 'Santri', bobot: 0.82, tebalPertama: true, kecilSisa: true },
      { judul: 'Perkara & putusan', bobot: 1.6 },
      { judul: 'Putus', lebar: 12, rata: 'center', cek: true },
      { judul: 'Banding', lebar: 14, rata: 'center', cek: true },
      { judul: 'Lewati', lebar: 12, rata: 'center', cek: true }
    ], baris);

    let bab = 1;
    const ROMAWI_BAB = ['I', 'II', 'III', 'IV', 'V'];
    /* ---- v2.69 · penanggung jawab eksekusi ---- */
    if (isi.pj && isi.pj.length) {
      judulBagian(`${ROMAWI_BAB[bab++]}. PENANGGUNG JAWAB EKSEKUSI`, 'Dibawa PJ ke lapangan; centang bila pembinaan sudah dijalankan');
      const bPj = [];
      isi.pj.forEach(x => {
        bPj.push({ grup: `PJ ${x.label}: ${x.nama || '(belum ditunjuk)'}`, kanan: `${angka(x.santri.length)} perkara`, warna: [232, 225, 205] });
        x.santri.forEach(z => bPj.push({ sel: ['#', [z.nama, `${z.kelas}${z.kamar ? ` · Kamar ${z.kamar}` : ''}`], z.bentuk || '-', ''] }));
      });
      tabel([
        { judul: 'No', lebar: 9, rata: 'center', redup: true },
        { judul: 'Santri', bobot: 0.9, tebalPertama: true, kecilSisa: true },
        { judul: 'Bentuk pembinaan', bobot: 1.4 },
        { judul: 'Dijalankan', lebar: 20, rata: 'center', cek: true }
      ], bPj);
    }
    /* ---- v2.69 · perkara siap disahkan OSDA ---- */
    if (isi.siap && isi.siap.length) {
      judulBagian(`${ROMAWI_BAB[bab++]}. PERKARA SIAP DISAHKAN`, 'Di tangan musyrif sejak sidang sebelumnya; disahkan bila sudah dijalankan');
      tabel([
        { judul: 'No', lebar: 9, rata: 'center', redup: true },
        { judul: 'Santri', bobot: 0.8, tebalPertama: true, kecilSisa: true },
        { judul: 'Perkara & putusan', bobot: 1.3 },
        { judul: 'Diserahkan & saksi', bobot: 0.9 },
        { judul: 'Sudah', lebar: 14, rata: 'center', cek: true }
      ], isi.siap.map(z => ({ sel: ['#', [z.nama, z.kelas], `${z.pelanggaran} -> ${z.bentuk || '-'}`,
        [`${labelTgl(z.sesi)}${z.penerima.length ? ` · ${z.penerima.join(', ')}` : ''}`, z.pj.length ? `PJ ${z.pj.join(', ')}` : ''], ''] })));
    }

    /* ---- majelis sidang (selalu terakhir: tanda tangan) ---- */
    const JAB = isi.panitia ? JABATAN_INTI : JABATAN;
    const namaJab = isi.panitia || isi.majelis;
    if (sisa() < 58) halamanBaru();
    judulBagian(`${ROMAWI_BAB[bab++]}. MAJELIS SIDANG`);
    huruf(9); tinta(28, 26, 46);
    pdf.text(teksPdf(`Meulaboh, ${tglPanjang(isi.sesi)}`), W - mR, y + 2, { align: 'right' });
    y += 8;
    const kol = L / JAB.length;
    JAB.forEach(([k, label], i) => {
      const cx = mL + kol * i + kol / 2;
      huruf(JAB.length > 4 ? 8 : 8.6, 'bold'); tinta(74, 71, 99); pdf.text(label, cx, y, { align: 'center' });
      pdf.setDrawColor(28, 26, 46); pdf.setLineWidth(0.3); pdf.line(cx - kol / 2 + 4, y + 24, cx + kol / 2 - 4, y + 24);
      const nama = teksPdf(namaJab[k] || '');
      if (nama) { huruf(8.8, 'bold'); tinta(28, 26, 46); pdf.text(pdf.splitTextToSize(nama, kol - 8), cx, y + 28.5, { align: 'center', lineHeightFactor: 1.2 }); }
      else { huruf(8.4); tinta(150, 156, 170); pdf.text('(nama & tanda tangan)', cx, y + 28.5, { align: 'center' }); }
    });
    y += 38;
    if (isi.panitia) {
      const pjNama = URUT_KELOMPOK.filter(k => isi.panitia.pj[k]).map(k => `${KELOMPOK[k]}: ${isi.panitia.pj[k]}`);
      huruf(8); tinta(74, 71, 99);
      const t = [pjNama.length ? `PJ eksekusi - ${pjNama.join(' · ')}` : '', isi.panitia.pembimbing ? `Pembimbing - ${isi.panitia.pembimbing}` : ''].filter(Boolean);
      if (t.length) { const l = pdf.splitTextToSize(teksPdf(t.join('   ')), L); pdf.text(l, mL, y); y += l.length * 3.6 + 2; }
    }
    huruf(7.4); tinta(110, 116, 130);
    const jam = (() => { try { return isi.dicetak.toLocaleString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' }); } catch (e) { return ''; } })();
    pdf.text(pdf.splitTextToSize(teksPdf(`Berkas disusun chemint ${jam} WIB${isi.persiapan ? ' (persiapan malam sebelum sidang)' : ''}. Perkara yang masuk sesudah waktu itu belum tercantum. Banding (santri menyanggah catatan) diserahkan ke Penasihat Hukum OSDA. Majelis membubuhkan tanda tangan dengan pena setelah sidang selesai.`), L), mL, y);

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
    if (!bolehBerkas()) return A.toast('info', 'Tidak ada santri yang menunggu dipanggil.');
    if (!A.pdfBaru) return A.toast('error', 'Pembuat PDF belum tersedia. Muat ulang aplikasi.');
    if (perluMajelis() && !(await bukaMajelis('berkas'))) return;     // v2.69: syarat unduh berkas
    const m = majelisAwal();
    const ops = pilihanCakupan();
    const kertasL = A.kertasDaftar ? A.kertasDaftar() : [{ kode: 'A4', nama: 'A4', ukuran: '210 × 297 mm' }];
    const kAwal = A.kertasTersimpan ? A.kertasTersimpan() : 'A4';
    const isiMajelis = majelis() && !adaPanitia();     // v2.69: nama dipilih di "Susunan majelis", bukan diketik di sini
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
        </fieldset>` : adaPanitia() ? `<fieldset><legend>Majelis sidang</legend><p class="sd-kecil sd-mj-baca">${(() => { const n = namaMajelis();
            const l = [...JABATAN_INTI.map(([k, lb]) => n[k] ? `${lb} <b>${esc(n[k])}</b>` : ''), ...URUT_KELOMPOK.map(k => n.pj[k] ? `PJ ${KELOMPOK[k]} <b>${esc(n.pj[k])}</b>` : ''), n.pembimbing ? `Pembimbing <b>${esc(n.pembimbing)}</b>` : ''].filter(Boolean);
            return l.length ? l.join(' · ') : 'Belum diisi; kolom tanda tangan dicetak kosong.'; })()}</p>
            <p class="sd-kecil">Untuk mengubah, tutup jendela ini lalu tekan <b>Susunan majelis</b>.</p></fieldset>`
          : `<p class="sd-kecil">Majelis: ${m.ketua ? esc(JABATAN.map(([k, l]) => m[k] ? `${l} ${m[k]}` : '').filter(Boolean).join(' · ')) : 'belum diisi OSDA; kolom tanda tangan dicetak kosong.'}</p>`}
        <fieldset><legend>Isi berkas</legend>
          <div class="sd-opsi-daftar">${ops.map((o, i) => radio('sdCakupan', o.k, o.label, `${angka(o.list.length)} santri · ${angka(o.list.reduce((a, s) => a + s.sesi.filter(b => !selesaiSesi(b)).length, 0))} perkara`, i === 0)).join('')}</div>
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
    ucap('Berkas perkara siap. Panggil nama-nama ananda sesuai urutan berkas.', 'senang');
  }

  /** Kumpulkan isian → simpan majelis → bangun & serahkan PDF. Galat ditampilkan di jendela. */
  async function siapkanBerkas(aksi) {
    const pop = A.Swal.getPopup();
    const ambil = (id) => (pop.querySelector('#' + id)?.value || '').replace(/\s+/g, ' ').trim();
    const lama = majelis() && !adaPanitia();
    const mj = lama ? Object.fromEntries(JABATAN.map(([k]) => [k, ambil('sdM-' + k)])) : adaPanitia() ? namaMajelis() : (S.data?.majelis || {});
    if (lama && mj.ketua.length < 2) {
      A.Swal.showValidationMessage('Nama Hakim Ketua wajib diisi.');
      pop.querySelector('#sdM-ketua')?.focus();
      return false;
    }
    const kode = pop.querySelector('input[name="sdKertas"]:checked')?.value || 'A4';
    const cak = pilihanCakupan().find(o => o.k === (pop.querySelector('input[name="sdCakupan"]:checked')?.value || 'semua')) || pilihanCakupan()[0];
    if (!cak) { A.Swal.showValidationMessage('Tidak ada santri yang menunggu dipanggil.'); return false; }

    if (lama) {
      try { localStorage.setItem(kunciMajelis(), JSON.stringify(mj)); } catch (e) {}
      try {
        const { data, error } = await A.db.rpc('sidang_majelis_simpan', {
          p_sesi: sesiBerkas(), p_unit: S.data?.unit || null, p_ketua: mj.ketua,
          p_anggota1: mj.anggota1 || null, p_anggota2: mj.anggota2 || null, p_panitera: mj.panitera || null });
        if (error) throw error;
        if (S.data) S.data.majelis = data || mj;
      } catch (e) {
        console.warn('[berkas] majelis belum tersimpan di server:', e?.message || e);
        A.toast('warning', 'Nama majelis tercetak, tetapi belum tersimpan di server.');
      }
    }
    try {
      A.simpanKertas?.(kode);
      const [{ pdf, kertas }, logo] = await Promise.all([A.pdfBaru(kode), A.logoKop ? A.logoKop().catch(() => null) : null]);
      const isi = isiBerkas(cak.list, mj, cak.label);
      gambarBerkasPdf(pdf, kertas, isi, logo);
      const nama = `Berkas Sidang Tadib OSDA ${unitBerkas().replace(/ & /g, '-')} ${isi.sesi}${cak.k === 'semua' ? '' : ' - ' + teksPdf(KODE[Number(cak.k.slice(1))]?.k || cak.k).replace(/[^\w .+-]+/g, ' ').trim()}.pdf`;
      if (aksi === 'cetak') {
        let buka = null;
        try { pdf.autoPrint(); buka = window.open(pdf.output('bloburl'), '_blank'); } catch (e) { buka = null; }
        if (!buka) { pdf.save(nama); A.toast('info', 'Jendela cetak diblokir peramban; PDF diunduh. Cetak dari berkas itu.'); }
      } else {
        pdf.save(nama);
        A.toast('success', `Berkas perkara (${kertas.nama}) diunduh: ${angka(isi.nSantri)} santri, ${angka(isi.nPerkara)} perkara.`);
      }
      return true;
    } catch (e) {
      A.Swal.showValidationMessage(`PDF gagal dibuat: ${e?.message || e}`);
      return false;
    }
  }

  /* ---------- berita acara (teks untuk grup WA / arsip syura) ---------- */
  async function beritaAcara() {
    const d = S.data; const c = hitungSesi();
    const L = daftarAntre().filter(s => s.keadaan !== 'dipanggil');
    let t = `BERITA ACARA SIDANG TA'DIB OSDA ${d.unit === 'putri' ? 'PUTRI' : 'PUTRA'}\n${labelHari(d.hari, true)}\n\n`
      + `Diputus: ${c.putus} santri (${c.perkara} perkara) · Banding: ${c.banding} · Dilewati: ${c.lewati} · Belum dipanggil: ${c.dipanggil}\n`;
    [1, 2, 3, 4].forEach(P => {
      const l = L.filter(s => s.P === P); if (!l.length) return;
      t += `\n${KODE[P].k} · ${KODE[P].l}\n`;
      l.forEach((s, i) => {
        const pk = s.sesi.map(b => `${b.kategori} ke-${b.tahap || '?'} ${b.pelanggaran}${b.hari_ini === 'putus' && b.status === 'diberikan' && b.sesi && b.sesi !== d.hari ? ' (dibacakan ulang)' : ''}`).join('; ');
        t += `${i + 1}. ${s.nama} (${s.kelas}) — ${LABEL_KEADAAN[s.keadaan]} — ${pk}\n`;
      });
    });
    const osda = butir().filter(b => b.sah_osda && b.status === 'tuntas').length;
    if (osda) t += `Disahkan OSDA (pembinaan sudah dijalankan, belum disahkan musyrif): ${osda} perkara\n`;
    const mj = adaPanitia() ? namaMajelis() : d.majelis;
    if (adaPanitia() && mj.ketua && d.sesi_berkas === d.hari) {
      t += `\nMajelis: Hakim Ketua ${mj.ketua} · Hakim Anggota ${[mj.anggota1, mj.anggota2].filter(Boolean).join(', ')}`
        + ` · Panitera ${mj.panitera || '-'} · Penasihat ${mj.penasihat || '-'}\n`;
      const pj = URUT_KELOMPOK.filter(k => mj.pj[k]).map(k => `${KELOMPOK[k]} ${mj.pj[k]}`);
      if (pj.length) t += `PJ eksekusi: ${pj.join(' · ')}\n`;
      if (mj.pembimbing) t += `Pembimbing: ${mj.pembimbing}\n`;
    } else if (mj && mj.ketua && d.sesi_berkas === d.hari) {
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
  function fokusAntre() { S.akar?.querySelector('#sdAntre')?.focus({ preventScroll: true }); }
  function onKlik(e) {
    const t = e.target.closest('[data-aksi]'); if (!t || !S.akar.contains(t)) return;
    const a = t.dataset.aksi, v = t.dataset.nilai;
    if (a === 'keluar') return A.keluar();
    if (a === 'segarkan') { if (S.tab === 'penasihat') muatPenasihat(); return muat(S.tab === 'penasihat'); }
    if (a === 'unit') { S.unit = v || null; S.saring = 0; S.data = null; S.pen.data = null; S.santri = new Map(); gambarSemua(); return muat(); }
    if (a === 'bunyi') { try { localStorage.setItem('rq-sidang-bunyi', bunyiAktif() ? 'mati' : 'nyala'); } catch (er) {} gambarAtas(); if (bunyiAktif()) ketukBunyi(1); return; }
    if (a === 'tab') { S.tab = v === 'penasihat' ? 'penasihat' : 'majelis'; S.bubble = ''; gambarSemua(); if (S.tab === 'penasihat') muatPenasihat(!!S.pen.data); return; }
    if (a === 'saring') { const P = Number(v); S.saring = S.saring === P ? 0 : P; return gambarIsi(); }
    if (a === 'mulai' || a === 'mulai-bilah') { const c = hitungSesi(); return mulaiSidang(null, bolehPutus() && !c.dipanggil && c.lewati > 0); }
    if (a === 'kursi') return bukaMajelis(null, v);
    if (a === 'lompat') return lompatKe(Number(v));
    if (a === 'fokus-cari') return fokusCari();
    if (a === 'ke-atas') { S.akar.querySelector('#sdGulir')?.scrollTo({ top: 0, behavior: gulirHalus() }); return S.akar.querySelector('[data-aksi="mulai"]')?.focus({ preventScroll: true }); }
    if (a === 'buka-santri') return mulaiSidang(v);
    if (a === 'majelis') return bukaMajelis().then(() => { if (S.antre) fokusAntre(); });
    if (a === 'a-sahkan') return sahkan(kini());
    if (a === 'antre-tutup') return tutupAntre();
    if (a === 'a-enter') { enterAntre(); return fokusAntre(); }
    if (a === 'a-banding') { const s = kini(); if (S.antre?.mode === 'putus' && faseOf(s) === 'panggil') banding(s); return fokusAntre(); }
    if (a === 'a-lewati') { const s = kini(); if (S.antre?.mode === 'putus' && faseOf(s) === 'panggil') lewati(s); return fokusAntre(); }
    if (a === 'a-del') { delAntre(); return fokusAntre(); }
    if (a === 'a-kiri') { geser(-1); return fokusAntre(); }
    if (a === 'a-kanan') { geser(1); return fokusAntre(); }
    if (a === 'berkas') return bukaBerkas();
    if (a === 'berita-acara') return beritaAcara();
    if (a === 'pen-saring') { S.pen.saring = v; return gambarIsi(); }
    if (a === 'pen-kabul') return putusBanding(v, 'kabul');
    if (a === 'pen-tolak') return putusBanding(v, 'tolak');
    if (a === 'pen-urung') return urungkanBanding(v);
    if (a === 'pen-manual') return bandingManual();
    if (a === 'pen-eksekusi') return A.bukaHalaman?.('banding');
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
    // Hanya jendela modal yang menahan papan tik; toast (galat/tersimpan) tidak boleh menghentikan sidang.
    if (!S.akar || document.querySelector('.swal2-popup:not(.swal2-toast)')) return;
    if (S.lantik) {                                  // v2.70: Pelantikan — tombol hanya untuk melanjutkan
      if (['Enter', ' ', 'Spacebar', 'Escape'].includes(e.key)) { e.preventDefault(); if (!e.repeat) S.lantik.tutup(); }
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const ketik = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName || '') || e.target?.isContentEditable;
    if (S.antre) {
      if (ketik) return;
      const k = e.key === 'Spacebar' ? ' ' : e.key;
      const sekali = (fn) => () => { if (!e.repeat) fn(); };   // tombol ditahan tidak memutus berkali-kali
      const peta = {
        Enter: sekali(enterAntre),
        ArrowDown: sekali(() => { const s = kini(); if (S.antre.mode === 'putus' && faseOf(s) === 'panggil') banding(s); }),
        ' ': sekali(() => { const s = kini(); if (S.antre.mode === 'putus' && faseOf(s) === 'panggil') lewati(s); }),
        Delete: sekali(delAntre), Backspace: sekali(delAntre),
        s: sekali(() => { if (S.antre.mode === 'putus' && !S.antre.akhir) sahkan(kini()); }),
        m: sekali(() => { if (adaPanitia() && majelis()) bukaMajelis().then(fokusAntre); }),
        ArrowRight: () => geser(1), ArrowLeft: () => geser(-1),
        Escape: tutupAntre
      };
      const kk = k.length === 1 ? k.toLowerCase() : k;
      if (peta[kk]) { e.preventDefault(); peta[kk](); }
      return;
    }
    if (ketik) return;
    if (e.key === 'Escape') { A.keluar(); return; }
    if (S.tab === 'majelis' && S.data && !reses()) {
      if ((e.key === 'm' || e.key === 'M') && adaPanitia() && majelis() && !e.repeat) { e.preventDefault(); bukaMajelis(); return; }
    }
    if (e.key === 'Enter' && S.tab === 'majelis' && S.data && !reses() && S.urutan.length && !e.target.closest?.('button, a, input, [tabindex]')) {
      e.preventDefault();
      const c = hitungSesi();
      mulaiSidang(null, bolehPutus() && !c.dipanggil && c.lewati > 0);
    }
  }
  /** v2.70: "/" di Ruang Sidang = cari santri. Ditangkap lebih dulu (fase capture) supaya
   *  pencarian umum Lentera tidak terbuka tersembunyi di belakang layar sidang. */
  function onGaris(e) {
    if (e.key !== '/' || !S.akar || e.ctrlKey || e.metaKey || e.altKey) return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName || '') || e.target?.isContentEditable) return;
    if (document.querySelector('.swal2-popup:not(.swal2-toast)')) return;
    e.preventDefault(); e.stopImmediatePropagation();
    if (!S.antre && !S.lantik && S.tab === 'majelis' && S.akar.querySelector('#sdCari')) fokusCari();
  }
  function onTampak() {
    if (document.visibilityState !== 'visible' || !S.akar || S.tunda) return;
    if (!S.antre) muat(true);
    if (S.tab === 'penasihat') muatPenasihat(true);
  }

  /* ---------- tirai pembuka: sekali per hari per akun ---------- */
  function bukaTirai() {
    const tirai = S.akar.querySelector('#sdTirai');
    const kunci = `rq-sidang-tirai-${new Date().toDateString()}-${A.profil()?.id || ''}`;
    let sudah = false; try { sudah = sessionStorage.getItem(kunci) === '1'; } catch (e) {}
    if (sudah || !bolehGerak()) { tirai.remove(); return false; }
    try { sessionStorage.setItem(kunci, '1'); } catch (e) {}
    S.akar.classList.add('sd-pembukaan');
    // v2.70: kelas pembukaan bertahan sebentar sesudah tirai hilang agar lengkung & ayat selesai dijahit
    const selesai = () => { if (!tirai.isConnected) return; tirai.remove(); setTimeout(() => S.akar?.classList.remove('sd-pembukaan'), 900); };
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
    S.data = null; S.galat = ''; S.bubble = ''; S.ekspresi = 'normal'; S.antre = null; S.santri = new Map(); S.urutan = [];
    S.tab = 'majelis'; S.saring = 0; S.cari = ''; S.pen.data = null; S.pen.galat = ''; S.lantik = null;
    if (!S.unit) S.unit = A.unitAwal() || null;
    document.body.appendChild(S.akar);
    document.body.classList.add('di-sidang');
    S.akar.addEventListener('click', onKlik);
    S.akar.addEventListener('input', onKetik);
    S.akar.querySelector('#sdGulir').addEventListener('scroll', () => aturBilah(), { passive: true });
    document.addEventListener('keydown', onTombol);
    window.addEventListener('keydown', onGaris, true);
    document.addEventListener('visibilitychange', onTampak);
    gambarSemua();
    const tirai = bukaTirai();
    muat().then(() => {
      // palu pembuka: tiga ketukan saat sidang dibuka (majelis, hari sidang)
      if (tirai && majelis() && S.data?.buka) setTimeout(() => ketukPalu(3), 1350);
      // Enter pertama langsung memulai sidang: fokus ke tombol "Mulai sidang"
      const f = document.activeElement;
      if (!S.antre && (!f || f === document.body || f.classList?.contains('sd-keluar'))) S.akar?.querySelector('[data-aksi="mulai"]')?.focus({ preventScroll: true });
    });
    try { if (!history.state || !history.state.rqSidang) { history.pushState({ rqSidang: 1 }, ''); S.histori = true; } } catch (e) {}
    setTimeout(() => S.akar?.querySelector('.sd-keluar')?.focus(), 60);
  }
  function tutup() {
    if (!S.akar) return;
    S.token++; S.pen.token++;
    S.akar.removeEventListener('click', onKlik);
    S.akar.removeEventListener('input', onKetik);
    document.removeEventListener('keydown', onTombol);
    window.removeEventListener('keydown', onGaris, true);
    document.removeEventListener('visibilitychange', onTampak);
    if (S.lantik) { S.lantik = null; }
    S.akar.remove(); S.akar = null; S.antre = null;
    document.body.classList.remove('di-sidang');
    if (S.histori) { S.histori = false; try { if (history.state && history.state.rqSidang) history.back(); } catch (e) {} }
  }
  window.addEventListener('popstate', () => { if (S.akar) { if (S.antre) { tutupAntre(); try { history.pushState({ rqSidang: 1 }, ''); S.histori = true; } catch (e) {} return; } S.histori = false; A.keluar(); } });
  window.addEventListener('beforeunload', (e) => { if (S.tunda) { e.preventDefault(); e.returnValue = ''; } });

  window.RQSidang = { buka, tutup, terbuka: () => !!S.akar,
    _uji: { S, susun, daftarAntre, urutSantri, hitungSesi, isiBerkas, gambarBerkasPdf, teksPdf, bukaAntre, pilihanCakupan, kini,
            bukaMajelis, sahkan, siapSah, perluMajelis, namaMajelis,
            kursiMajelis, pelantikan, cariPendidik, muatPendidik, gambarBilah, aturBilah, lompatKe } };
})();
