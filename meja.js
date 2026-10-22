/* =====================================================================
 * meja.js — v2.52 · GERAK DUA MEJA (Meja Pimpinan & Meja BK)
 * ---------------------------------------------------------------------
 *  Si Peci (ninja) dan Si Payung — aktor yang sama dengan showreel layar
 *  masuk dan panggung Ringkasan (bentuk & warna DISALIN dari panggung.js
 *  v2.51, bukan digambar ulang) — menggelar dua pertunjukan khusus:
 *
 *  LEMBAR MIZAN (Pimpinan) — "timbangan bulan ini"
 *    MASUK    → Si Peci berlari di tepi atas kartu timbangan; Si Payung
 *               turun berpayung di atas piringan kiri.
 *    LONCAT   → Si Peci bersalto dan mendarat di poros timbangan.
 *    SIHIR    → Si Payung memutar payung; bintang emas jatuh ke piringan
 *               kiri. Kebaikan tercatat mengisi piringan, balok miring ke
 *               kiri.
 *    HUJAN    → catatan pelanggaran berjatuhan satu per satu ke piringan
 *               kanan; balok berayun ke kanan (pegas). Si Peci di poros
 *               kehilangan keseimbangan.
 *    GELINCIR → Si Peci meluncur di balok yang miring ("wiii!"), terlempar
 *               dari ujungnya, bersalto, mendarat.
 *    SAPA     → Si Payung mengetuk piringan kiri: kalimat timbangan
 *               muncul. Wajahnya cemas bila timbangan berat sebelah.
 *    SOROT    → Si Peci menancapkan pena emas di kartu keputusan pertama;
 *               Si Payung menyihir batang angkatan sampai tumbuh.
 *    KELUAR   → asap (Si Peci) dan terbang (Si Payung).
 *
 *  MEJA PENDAMPINGAN (Guru BK)
 *    MASUK → KETUK (Si Payung mengetuk tiap lajur; kartunya bermunculan)
 *    → PESAWAT (Si Peci melempar pesawat kertas ke lajur "Dipanggil")
 *    → KELUAR. Sesudah Guru BK mengirim pesan: ANTAR — Si Peci muncul
 *    di kartu itu dan mengantarnya ke lajur "Dipanggil".
 *
 *  Data tidak pernah tersembunyi lama: app.js menahan tampilan, lalu
 *  melepasnya utuh bila berkas ini gagal/terlambat (3,5 dtk), bila
 *  pertunjukan > 16 dtk, saat berpindah halaman, atau saat mencetak.
 *  Satu kanvas `position:fixed` (pointer-events:none). Mode hemat:
 *  ≤ 30 fps, kanvas 1×, partikel lebih sedikit — gerak TETAP ada.
 *  prefers-reduced-motion: berkas ini tidak dimuat sama sekali.
 *
 *  Satu-satunya pintu ke halaman: window.RQ_MEJA (app.js v2.52).
 * ===================================================================== */
(function () {
  'use strict';
  if (window.RQMeja) return;
  const API = window.RQ_MEJA;
  if (!API) return;

  /* ===== disalin dari panggung.js v2.51 (baris 39–55, 74–549) ===== */
  /* ---------- Matematika gerak (sama dengan showreel.js) ---------- */
  const TAU = Math.PI * 2, PI = Math.PI, HALF = PI / 2;
  const seg = (t, a, b) => t <= a ? 0 : t >= b ? 1 : (t - a) / (b - a);
  const lerp = (a, b, p) => a + (b - a) * p;
  const klem = (v, a, b) => Math.max(a, Math.min(b, v));
  const E = {
    expoOut: x => x >= 1 ? 1 : 1 - Math.pow(2, -10 * x),
    sineInOut: x => -(Math.cos(Math.PI * x) - 1) / 2,
    quartOut: x => 1 - Math.pow(1 - x, 4),
    quadIn: x => x * x,
    backOut: x => { const s = 1.70158; return 1 + (s + 1) * Math.pow(x - 1, 3) + s * Math.pow(x - 1, 2); },
    elastis: x => x <= 0 ? 0 : x >= 1 ? 1 : 1 - Math.exp(-6.5 * x) * Math.cos(x * Math.PI * 3.2)
  };
  const busur = (p) => Math.sin(PI * klem(p, 0, 1));
  const pegas = (dt, amp = .26, tau = 85, w = 44) => dt < 0 ? 1 : 1 - amp * Math.exp(-dt / tau) * Math.cos(dt / w);
  const acak = (i) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  const W_ = { emas: '#F2C94C', kuningan: '#C9A227', kuninganHi: '#E8CC6B', putih: '#F4F7FA' };

  /* ---------- Keadaan ---------- */
  const S = {
    kanvas: null, ctx: null, dpr: 1, raf: 0, lalu: 0, gambarLalu: 0,
    hidup: false, hidupTunggu: false, hemat: false,
    Hn: 54, k: .42, B: 24, Hp: 56, kp: .46, Bp: 27,
    jenis: '', aksi: null, antrian: [], akhir: null, adegan: '', adeganTerakhir: '',
    N: null, J: null, partikel: [], jejakSyal: [],
    sudut: 0, sudutT: null, sudutV: 0, jatuh: [], pesawat: null, amplop: null
  };
  let ca = null;          // konteks yang sedang dipakai fungsi gambar
  const AK = { aset: null, g: { k: .42, kp: .46 } };

  /* =================================================================
   *  ASET AKTOR — disalin dari showreel.js (viewBox SVG asli v2.40)
   * ================================================================= */
  function kanvasKecil(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function asetAktor() {
    if (AK.aset) return AK.aset;
    const P2 = (d) => new Path2D(d);
    const rg = (x, y, r, s) => { const g = ca.createRadialGradient(x, y, 0, x, y, r); s.forEach(([o, c]) => g.addColorStop(o, c)); return g; };
    const lg = (x0, y0, x1, y1, s) => { const g = ca.createLinearGradient(x0, y0, x1, y1); s.forEach(([o, c]) => g.addColorStop(o, c)); return g; };
    const a = {};
    a.nBadan = P2('M60 16C86 16 102 36 104 64C106 92 101 116 60 118C19 116 14 92 16 64C18 36 34 16 60 16Z');
    a.nRim = P2('M22 88C26 104 38 113 56 115');
    a.nSarung = P2('M16.6 86Q60 95 103.4 86L105.6 110Q60 120 14.4 110Z');
    a.nSabuk = P2('M15.8 82.5Q60 91.5 104.2 82.5L104.6 90Q60 99 15.4 90Z');
    a.nTopeng = P2('M10 64Q60 75 110 64L110 84Q60 95 10 84Z');
    a.nTopengAtas = P2('M17 65.6Q60 76.4 103 65.6');
    a.nPeci = P2('M35.5 28C35.5 20 36.5 12 38.8 7.8Q60 2.6 81.2 7.8C83.5 12 84.5 20 84.5 28Q60 33.5 35.5 28Z');
    a.nTanduk1 = P2('M37 27 27.5 14.5 41 21Z'); a.nTanduk2 = P2('M83 27 92.5 14.5 79 21Z');
    a.nSenang = P2('M37 60Q46 49 55 60M65 60Q74 49 83 60');
    a.nPejam = P2('M36 58Q46 64 56 58M64 58Q74 64 84 58');
    a.gKulitN = rg(76, 42, 80, [[0, '#B9E6FB'], [.38, '#58B4E6'], [.8, '#2A7DB8'], [1, '#1A5C8F']]);
    a.gPerut = rg(65, 74, 30, [[0, '#F2FAFF'], [1, '#BFE2F6']]);
    a.gPeci = lg(0, 4, 0, 32, [[0, '#3B3656'], [.55, '#1D1A2E'], [1, '#0D0B17']]);
    a.gPeciKilap = lg(35, 0, 85, 0, [[0, 'rgba(255,255,255,0)'], [.62, 'rgba(255,255,255,0)'], [.74, 'rgba(255,255,255,.24)'], [.86, 'rgba(255,255,255,0)']]);
    a.gTopeng = lg(0, 64, 0, 92, [[0, '#2C4170'], [.5, '#1A2A4C'], [1, '#0E1830']]);
    a.gSabuk = lg(0, 82, 0, 99, [[0, '#FFE18A'], [.45, '#E0B637'], [1, '#8A6A12']]);
    a.gSarungBayang = lg(13, 0, 107, 0, [[0, 'rgba(26,7,16,.55)'], [.3, 'rgba(26,7,16,.12)'], [.72, 'rgba(255,255,255,.08)'], [1, 'rgba(26,7,16,.4)']]);
    a.gPena = lg(0, -3.6, 0, 3.6, [[0, '#FFF3C8'], [.35, '#F2C94C'], [1, '#8A6A12']]);
    a.gPupilN = rg(46, 56, 9, [[0, '#5A4AA0'], [.55, '#241646'], [1, '#120A24']]);
    const kt = kanvasKecil(28, 28), q = kt.getContext('2d');
    q.scale(2, 2);
    q.fillStyle = '#7E1F33'; q.fillRect(0, 0, 14, 14);
    q.globalAlpha = .75; q.fillStyle = '#A33049'; q.fillRect(0, 0, 6, 14);
    q.globalAlpha = .55; q.fillRect(0, 0, 14, 6);
    q.globalAlpha = .85; q.fillStyle = '#E8CC6B'; q.fillRect(9, 0, 1.3, 14);
    q.globalAlpha = .7; q.fillRect(0, 9, 14, 1.3);
    q.globalAlpha = .8; q.fillStyle = '#1E4A3A'; q.fillRect(2.4, 0, 1, 14);
    q.globalAlpha = .6; q.fillRect(0, 2.4, 14, 1);
    a.polaKotak = ca.createPattern(kt, 'repeat');
    if (a.polaKotak && a.polaKotak.setTransform && typeof DOMMatrix === 'function') a.polaKotak.setTransform(new DOMMatrix().scale(.5).rotate(-4));

    const tepi = [-64, -42.7, -21.3, 0, 21.3, 42.7, 64];
    let rim = '';
    for (let i = tepi.length - 1; i > 0; i--) rim += `Q${((tepi[i] + tepi[i - 1]) / 2).toFixed(1)} -91 ${tepi[i - 1]} -84`;
    a.jKanopi = P2(`M-64 -84C-61 -113 -32 -125 0 -125C32 -125 61 -113 64 -84${rim}Z`);
    a.jKilapKubah = P2('M-64 -84C-61 -113 -32 -125 0 -125');
    a.jRim = P2(`M64 -84${rim}`);
    a.jJilbabGaris = P2('M36 118Q75 134 114 118');
    a.jJilbabLipat = P2('M40 104Q42 118 38 126M110 104Q108 118 112 126');
    a.jGamisLipat = P2('M60 124 57 159M90 124 93 159M75 122V162');
    a.jSenang = P2('M55 89Q63 79 71 89M79 89Q87 79 95 89');
    a.jPejam = P2('M54 87Q63 92 72 87M78 87Q87 92 96 87M54 87 50.5 85M96 87 99.5 85');
    a.jBulu = P2('M54 80.5 50.5 78M55.6 77.6 53.4 74.4M96 80.5 99.5 78M94.4 77.6 96.6 74.4');
    a.jAlisKhawatir = P2('M55 74 69 71M81 71 95 74');
    a.jMulut = P2('M69 101Q72 104 75 101Q78 104 81 101');
    a.jMulutSenang = P2('M66 99Q75 113 84 99Z');
    let bunga = '';
    for (let i = 0; i < 5; i++) {
      const r = i * TAU / 5, c = Math.cos(r), s = Math.sin(r);
      const T = (x, y) => `${(x * c - y * s).toFixed(2)} ${(x * s + y * c).toFixed(2)}`;
      bunga += `M${T(0, -1)}C${T(-2, -4)} ${T(-2.4, -7)} ${T(0, -8.6)}C${T(2.4, -7)} ${T(2, -4)} ${T(0, -1)}Z`;
    }
    a.jBunga = P2(bunga);
    a.gKulitJ = rg(84, 78, 46, [[0, '#D2FBEA'], [.4, '#7EE0BD'], [.82, '#3DB28C'], [1, '#2A8C6D']]);
    a.gJilbab = rg(89, 64, 84, [[0, '#FFF6FA'], [.45, '#FFD9E7'], [.85, '#F3A9C4'], [1, '#E48AAE']]);
    a.gGamis = lg(40, 0, 110, 0, [[0, '#8F7AD8'], [.35, '#B7A5F0'], [.7, '#D2C6FA'], [1, '#9A86E0']]);
    a.gKanopi = rg(16, -118, 86, [[0, '#FFFFFF'], [.55, '#FBF8FC'], [.9, '#E9E0EE'], [1, '#DCD0E4']]);
    a.gPupilJ = rg(62, 85, 8, [[0, '#6A4AA8'], [.55, '#2A1650'], [1, '#140A28']]);
    a.kelopak = [['#FFF4F8', '#FBC4D6', '#EE92B3'], ['#FFFFFF', '#FFD6E4', '#F5A9C3'], ['#FFF0F6', '#F7B2CB', '#E27CA2']].map(([x, y, z]) => {
      const c = kanvasKecil(48, 48), g = c.getContext('2d');
      g.scale(48 / 28, 48 / 28);
      g.beginPath(); g.moveTo(14, 26); g.bezierCurveTo(4.5, 21, 3, 10, 8.4, 4.2);
      g.quadraticCurveTo(11.4, 2.2, 14, 6.4); g.quadraticCurveTo(16.6, 2.2, 19.6, 4.2);
      g.bezierCurveTo(25, 10, 23.5, 21, 14, 26); g.closePath();
      const gr = g.createRadialGradient(17, 9, 1, 14, 16, 15);
      gr.addColorStop(0, x); gr.addColorStop(.55, y); gr.addColorStop(1, z);
      g.fillStyle = gr; g.fill();
      g.fillStyle = 'rgba(255,255,255,.55)'; g.beginPath(); g.ellipse(17.5, 11, 2.2, 4.2, .5, 0, TAU); g.fill();
      return c;
    });
    const as = kanvasKecil(64, 64), ag = as.getContext('2d');
    const gr = ag.createRadialGradient(26, 24, 2, 32, 32, 31);
    gr.addColorStop(0, 'rgba(255,255,255,.95)'); gr.addColorStop(.5, 'rgba(214,228,240,.75)'); gr.addColorStop(1, 'rgba(160,182,204,0)');
    ag.fillStyle = gr; ag.fillRect(0, 0, 64, 64);
    a.asap = as;
    // cahaya sihir: bola lembut keemasan
    const ch = kanvasKecil(64, 64), cg = ch.getContext('2d');
    const g2 = cg.createRadialGradient(32, 32, 0, 32, 32, 32);
    g2.addColorStop(0, 'rgba(255,250,220,1)'); g2.addColorStop(.3, 'rgba(242,201,76,.75)'); g2.addColorStop(1, 'rgba(242,201,76,0)');
    cg.fillStyle = g2; cg.fillRect(0, 0, 64, 64);
    a.cahaya = ch;
    AK.aset = a;
    return a;
  }

  /* ---------- Pose ---------- */
  function poseKosongN() {
    return { x: 0, y: 0, rot: 0, sx: 1, sy: 1, f: 1, a: 1, aL: HALF + .42, aR: HALF - .42, pL: 22, pR: 22, tL: null, tR: null,
      kL: [0, 0], kR: [0, 0], mata: 'tekad', lx: 0, ly: 0, pena: 0, penA: 0, depan: false, sarung: 0 };
  }
  function poseKosongJ() {
    return { x: 0, y: 0, rot: 0, sx: 1, sy: 1, f: 1, a: 1, hx: 112, hy: 130, uA: -.33, buka: 1, putar: 0, uDepan: false,
      lA: 2.05, lP: 25, tL: null, mata: 'normal', mulut: 'normal', lx: 0, ly: 0, kembang: 0, angin: 0, kaki: 0 };
  }
  /** Kaki menapak di (fx, fy) dokumen; rotasi berporos di kaki. */
  function diKaki(P, fx, fy, B) { P.x = fx + Math.sin(P.rot) * B * P.sy; P.y = fy - Math.cos(P.rot) * B * P.sy; }
  function udara(P, p, putar) {
    const b = busur(p), lentur = b * (1 - b);
    P.rot = P.f * putar * TAU * E.sineInOut(p);
    P.sy = 1 + .5 * lentur; P.sx = 1 - .32 * lentur;
    const tekuk = putar ? b : b * .5;
    P.kL = [-3 * tekuk, -18 * tekuk]; P.kR = [5 * tekuk, -18 * tekuk];
    P.aL = HALF + .5 + 1.6 * b; P.aR = HALF - .5 - 1.6 * b;
  }
  function mendarat(P, dt) { const s = pegas(dt); P.sy = s; P.sx = 1 + (1 - s) * .9; }
  function lari(P, t, kec = 105) {
    const ph = t / kec * PI, s = Math.sin(ph), c = Math.cos(ph);
    P.kL = [c * 10, -Math.max(0, s) * 10]; P.kR = [-c * 10, -Math.max(0, -s) * 10];
    P.aL = HALF + .3 + c * .8; P.aR = HALF - .3 + c * .8;
    P.rot += .16 * P.f; P.bob = -Math.abs(s) * 3.5;
  }
  function melayang(P, t, condong = 0) {
    P.hx = 86 + condong * 10; P.hy = 34; P.uA = condong * .5; P.uDepan = true;
    P.kembang = .8; P.kaki = 1; P.lA = 2.3 + .2 * Math.sin(t / 260); P.lP = 24;
  }

  /* =================================================================
   *  GAMBAR — Si Peci ninja (salinan showreel.js)
   * ================================================================= */
  function keLokal(P, wx, wy, kk, cxU, cyU) {
    const dx = wx - P.x, dy = wy - P.y, c = Math.cos(P.rot), s = Math.sin(P.rot);
    const lx = dx * c + dy * s, ly = -dx * s + dy * c;
    return { x: lx / (P.f * P.sx * kk) + cxU, y: ly / (P.sy * kk) + cyU };
  }
  function keDunia(P, ux, uy, kk, cxU, cyU) {
    const lx = (ux - cxU) * P.f * P.sx * kk, ly = (uy - cyU) * P.sy * kk, c = Math.cos(P.rot), s = Math.sin(P.rot);
    return { x: P.x + lx * c - ly * s, y: P.y + lx * s + ly * c };
  }
  function lenganKe(px, py, sud, pj, warna, tangan) {
    ca.save(); ca.translate(px, py); ca.rotate(sud - HALF);
    ca.fillStyle = warna;
    ca.beginPath(); ca.ellipse(0, pj / 2, 7, pj / 2 + 3, 0, 0, TAU); ca.fill();
    ca.fillStyle = tangan; ca.beginPath(); ca.arc(0, pj, 6.6, 0, TAU); ca.fill();
    ca.fillStyle = 'rgba(255,255,255,.28)'; ca.beginPath(); ca.ellipse(2, pj - 2.5, 2.6, 1.6, 0, 0, TAU); ca.fill();
    ca.restore();
  }
  function lenganN(P, sisi) {
    const kiri = sisi < 0, px = kiri ? 27 : 93, py = 60;
    let sud = kiri ? P.aL : P.aR, pj = kiri ? P.pL : P.pR;
    const tg = kiri ? P.tL : P.tR;
    if (tg) {
      const l = keLokal(P, tg.x, tg.y, AK.g.k, 60, 72);
      sud = Math.atan2(l.y - py, l.x - px); pj = Math.max(12, Math.min(110, Math.hypot(l.x - px, l.y - py)));
    }
    lenganKe(px, py, sud, pj, kiri ? '#2F84BF' : '#3E97CE', kiri ? '#3A8FC9' : '#4BA3D8');
    return { x: px + Math.cos(sud) * pj, y: py + Math.sin(sud) * pj };
  }
  function pena(x, y, sud, pj) {
    ca.save(); ca.translate(x, y); ca.rotate(sud);
    ca.fillStyle = AK.aset.gPena;
    ca.beginPath(); ca.moveTo(-pj * .28, -3.4); ca.lineTo(pj * .62, -3.4); ca.lineTo(pj * .82, 0); ca.lineTo(pj * .62, 3.4); ca.lineTo(-pj * .28, 3.4);
    ca.arc(-pj * .28, 0, 3.4, HALF, -HALF); ca.closePath(); ca.fill();
    ca.fillStyle = '#1B1030';
    ca.beginPath(); ca.moveTo(pj * .62, -3.4); ca.lineTo(pj * .86, 0); ca.lineTo(pj * .62, 3.4); ca.closePath(); ca.fill();
    ca.fillStyle = '#7A1235'; ca.fillRect(pj * .08, -3.6, 4, 7.2);
    ca.fillStyle = 'rgba(255,255,255,.55)'; ca.fillRect(-pj * .2, -2.4, pj * .7, 1);
    ca.restore();
  }
  function mataN(P) {
    const A = AK.aset, lx = P.lx, ly = P.ly, tinta = '#1B1030';
    ca.lineCap = 'round'; ca.lineJoin = 'round'; ca.strokeStyle = tinta;
    if (P.mata === 'senang') { ca.lineWidth = 3; ca.stroke(A.nSenang); return; }
    if (P.mata === 'pejam') { ca.lineWidth = 2.6; ca.stroke(A.nPejam); return; }
    ca.fillStyle = '#fff';
    ca.beginPath(); ca.ellipse(46, 57, 11, 12.2, 0, 0, TAU); ca.ellipse(74, 57, 11, 12.2, 0, 0, TAU); ca.fill();
    if (P.mata === 'kaget') {
      ca.fillStyle = tinta; ca.beginPath(); ca.arc(46 + lx * .5, 57 + ly * .5, 3.6, 0, TAU); ca.arc(74 + lx * .5, 57 + ly * .5, 3.6, 0, TAU); ca.fill();
      return;
    }
    ca.fillStyle = A.gPupilN;
    ca.beginPath(); ca.ellipse(47.5 + lx, 59 + ly, 7.2, 8.2, 0, 0, TAU); ca.ellipse(75.5 + lx, 59 + ly, 7.2, 8.2, 0, 0, TAU); ca.fill();
    ca.fillStyle = '#fff';
    ca.beginPath(); ca.arc(50.6 + lx, 55 + ly, 3.2, 0, TAU); ca.arc(78.6 + lx, 55 + ly, 3.2, 0, TAU); ca.fill();
    if (P.mata === 'tekad') {
      ca.save();
      ca.beginPath(); ca.ellipse(46, 57, 11.6, 12.8, 0, 0, TAU); ca.ellipse(74, 57, 11.6, 12.8, 0, 0, TAU); ca.clip();
      ca.fillStyle = '#3F9AD0';
      ca.beginPath();
      ca.moveTo(33, 40); ca.lineTo(33, 49); ca.lineTo(58, 55); ca.lineTo(58, 40); ca.moveTo(62, 40); ca.lineTo(62, 55); ca.lineTo(87, 49); ca.lineTo(87, 40);
      ca.fill(); ca.restore();
      ca.lineWidth = 2.6;
      ca.beginPath(); ca.moveTo(34, 48.6); ca.lineTo(57.5, 54.4); ca.moveTo(62.5, 54.4); ca.lineTo(86, 48.6); ca.stroke();
    }
  }
  /** Syal: ujung-ujungnya mengikuti jejak posisi beberapa bingkai lalu. */
  function syal(P, t) {
    const k = AK.g.k, N = 8, pts = [];
    const akar = keDunia(P, 17, 73, k, 60, 72);
    const j = S.jejakSyal;
    for (let i = 0; i <= N; i++) {
      const q = i === 0 ? akar : (j[Math.min(j.length - 1, i * 2)] || akar);
      const kib = Math.sin(t / 85 - i * .9) * i * .55 * k;
      pts.push(q.x - P.f * i * 3.4 * k, q.y + i * 1.1 * k + i * i * .12 * k + kib);
    }
    const maks = 6.2 * k;
    for (let i = 1; i <= N; i++) {
      const dx = pts[i * 2] - pts[i * 2 - 2], dy = pts[i * 2 + 1] - pts[i * 2 - 1], d = Math.hypot(dx, dy);
      if (d > maks) { pts[i * 2] = pts[i * 2 - 2] + dx / d * maks; pts[i * 2 + 1] = pts[i * 2 - 1] + dy / d * maks; }
    }
    for (const [geser, lebarP, warna] of [[1.6, 4.2, '#16223F'], [-1.4, 3.6, '#22345E']]) {
      ca.beginPath();
      const kiri = [], kanan = [];
      for (let i = 0; i <= N; i++) {
        const a = Math.min(N, i + 1), b = Math.max(0, i - 1);
        const tx = pts[a * 2] - pts[b * 2], ty = pts[a * 2 + 1] - pts[b * 2 + 1], d = Math.hypot(tx, ty) || 1;
        const nx = -ty / d, ny = tx / d, w = lebarP * k * (1 - i / (N + 2));
        const ox = pts[i * 2] + nx * geser * k, oy = pts[i * 2 + 1] + ny * geser * k + i * geser * .3 * k;
        kiri.push(ox + nx * w, oy + ny * w); kanan.push(ox - nx * w, oy - ny * w);
      }
      ca.moveTo(kiri[0], kiri[1]);
      for (let i = 1; i <= N; i++) ca.lineTo(kiri[i * 2], kiri[i * 2 + 1]);
      for (let i = N; i >= 0; i--) ca.lineTo(kanan[i * 2], kanan[i * 2 + 1]);
      ca.closePath(); ca.fillStyle = warna; ca.fill();
      ca.fillStyle = W_.emas; ca.beginPath(); ca.arc(pts[N * 2], pts[N * 2 + 1], 2.2 * k, 0, TAU); ca.fill();
    }
  }
  function gambarNinja(P, t) {
    const A = asetAktor(), k = AK.g.k;
    ca.save();
    ca.globalAlpha = P.a;
    if (!S.hemat) syal(P, t);
    ca.translate(P.x, P.y + (P.bob || 0) * k); ca.rotate(P.rot); ca.scale(P.f * P.sx * k, P.sy * k); ca.translate(-60, -72);
    if (!P.pena) pena(30, 100, -.85, 130);
    lenganN(P, -1);
    for (const [cx, kk, warna] of [[44, P.kL, '#1F6A9E'], [76, P.kR, '#2777AE']]) {
      ca.fillStyle = warna; ca.beginPath(); ca.ellipse(cx + kk[0], 124 + kk[1], 11.5, 6.5, 0, 0, TAU); ca.fill();
      ca.fillStyle = 'rgba(255,255,255,.22)'; ca.beginPath(); ca.ellipse(cx - 2 + kk[0], 122 + kk[1], 6, 2.4, 0, 0, TAU); ca.fill();
    }
    let tangan = null;
    if (!P.depan) tangan = lenganN(P, 1);
    if (P.pena && !P.depan && tangan) pena(tangan.x, tangan.y, P.penA, 92);
    ca.fillStyle = A.gKulitN; ca.fill(A.nBadan);
    ca.save(); ca.globalAlpha *= .55; ca.strokeStyle = '#9ADCFB'; ca.lineWidth = 2.2; ca.lineCap = 'round'; ca.stroke(A.nRim); ca.restore();
    ca.save(); ca.globalAlpha *= .62; ca.fillStyle = A.gPerut; ca.beginPath(); ca.ellipse(60, 98, 26, 10, 0, 0, TAU); ca.fill(); ca.restore();
    ca.fillStyle = '#FFE9B0'; ca.fill(A.nTanduk1); ca.fillStyle = '#F6D98E'; ca.fill(A.nTanduk2);
    ca.save();
    if (P.sarung) { ca.translate(60, 86); ca.transform(1, 0, P.sarung, 1, 0, 0); ca.translate(-60, -86); }
    ca.fillStyle = A.polaKotak || '#7E1F33'; ca.fill(A.nSarung);
    ca.fillStyle = A.gSarungBayang; ca.fill(A.nSarung);
    ca.restore();
    ca.fillStyle = A.gSabuk; ca.fill(A.nSabuk);
    ca.fillStyle = '#C9A227'; ca.beginPath(); ca.moveTo(24, 88); ca.lineTo(14, 100); ca.lineTo(20, 101); ca.lineTo(27, 91); ca.closePath(); ca.fill();
    ca.beginPath(); ca.moveTo(27, 88); ca.lineTo(25, 102); ca.lineTo(30, 101); ca.lineTo(31, 90); ca.closePath(); ca.fill();
    ca.fillStyle = '#E8CC6B'; ca.beginPath(); ca.ellipse(27, 88.5, 4.2, 3.6, 0, 0, TAU); ca.fill();
    ca.save(); ca.clip(A.nBadan);
    ca.fillStyle = A.gTopeng; ca.fill(A.nTopeng);
    ca.strokeStyle = 'rgba(232,204,107,.75)'; ca.lineWidth = 1.2; ca.stroke(A.nTopengAtas);
    ca.restore();
    ca.save(); ca.globalAlpha *= .5; ca.fillStyle = '#FF7FAA';
    ca.beginPath(); ca.ellipse(31, 64, 6.5, 2.6, 0, 0, TAU); ca.ellipse(89, 64, 6.5, 2.6, 0, 0, TAU); ca.fill(); ca.restore();
    ca.save(); ca.globalAlpha *= .3; ca.fillStyle = '#0B3A5E'; ca.beginPath(); ca.ellipse(60, 29, 25, 4.5, 0, 0, TAU); ca.fill(); ca.restore();
    ca.fillStyle = A.gPeci; ca.fill(A.nPeci); ca.fillStyle = A.gPeciKilap; ca.fill(A.nPeci);
    ca.fillStyle = '#403A5E'; ca.beginPath(); ca.ellipse(60, 7.4, 21, 3, 0, 0, TAU); ca.fill();
    ca.strokeStyle = 'rgba(232,204,107,.8)'; ca.lineWidth = 1.3; ca.beginPath(); ca.moveTo(36, 25.5); ca.quadraticCurveTo(60, 31, 84, 25.5); ca.stroke();
    ca.save(); ca.globalAlpha *= .42; ca.fillStyle = '#fff'; ca.beginPath(); ca.ellipse(85, 40, 7, 11, .49, 0, TAU); ca.fill(); ca.restore();
    mataN(P);
    if (P.depan) tangan = lenganN(P, 1);
    ca.restore();
  }

  /* =================================================================
   *  GAMBAR — Si Payung (salinan showreel.js)
   * ================================================================= */
  function payung(P) {
    const A = asetAktor();
    ca.save(); ca.translate(P.hx, P.hy); ca.rotate(P.uA);
    ca.lineCap = 'round';
    ca.strokeStyle = '#8C7A6A'; ca.lineWidth = 2.6; ca.beginPath(); ca.moveTo(0, 0); ca.lineTo(0, -104); ca.stroke();
    ca.strokeStyle = '#7A4A2E'; ca.lineWidth = 3.6; ca.beginPath(); ca.moveTo(0, 0); ca.lineTo(0, 9); ca.quadraticCurveTo(0, 15, -6, 15); ca.quadraticCurveTo(-11, 15, -11, 10); ca.stroke();
    ca.translate(0, -18);
    const b = P.buka;
    ca.save(); ca.translate(0, -125); ca.scale(.16 + .84 * b, 1 + .3 * (1 - b)); ca.translate(0, 125);
    ca.fillStyle = A.gKanopi; ca.fill(A.jKanopi);
    ca.save(); ca.clip(A.jKanopi);
    const nB = S.hemat ? 7 : 11;
    for (let i = 0; i < nB; i++) {
      const az = i * 2.39996 + P.putar, c = Math.cos(az);
      if (c < -.15) continue;
      const y = -96 - acak(i * 3.1) * 22, rr = 64 * Math.sqrt(Math.max(0, 1 - Math.pow((y + 84) / -42, 2)) * .6 + .4);
      const x = Math.sin(az) * rr, s = .7 + acak(i * 7.7) * .6;
      ca.save(); ca.translate(x, y); ca.scale(s * Math.max(.2, c), s); ca.rotate(acak(i) * 6);
      ca.globalAlpha *= Math.min(1, (c + .15) * 3);
      ca.fillStyle = '#F7A6C3'; ca.fill(A.jBunga);
      ca.fillStyle = '#E0578A'; ca.beginPath(); ca.arc(0, 0, 1.9, 0, TAU); ca.fill();
      ca.restore();
    }
    ca.globalAlpha *= .5; ca.strokeStyle = '#fff'; ca.lineWidth = 5; ca.stroke(A.jKilapKubah); ca.globalAlpha /= .5;
    ca.restore();
    ca.strokeStyle = '#D8CDE3'; ca.lineWidth = 1.1; ca.beginPath();
    for (let r = 0; r < 8; r++) {
      const az = r * PI / 4 + P.putar;
      if (Math.cos(az) < 0) continue;
      const x = Math.sin(az) * 64;
      ca.moveTo(0, -125); ca.quadraticCurveTo(x * .55, -112, x, -84);
    }
    ca.stroke();
    ca.strokeStyle = '#CDBFD9'; ca.lineWidth = 1.3; ca.stroke(A.jRim);
    ca.restore();
    ca.fillStyle = '#E8CC6B'; ca.beginPath(); ca.arc(0, -127, 3, 0, TAU); ca.fill();
    ca.restore();
  }
  function mataJ(P) {
    const A = AK.aset, tinta = '#1B1030', lx = P.lx, ly = P.ly;
    ca.lineCap = 'round'; ca.lineJoin = 'round'; ca.strokeStyle = tinta;
    if (P.mata === 'senang') { ca.lineWidth = 3; ca.stroke(A.jSenang); }
    else if (P.mata === 'pejam') { ca.lineWidth = 2.6; ca.stroke(A.jPejam); }
    else {
      const kg = P.mata === 'kaget';
      ca.fillStyle = '#fff'; ca.beginPath(); ca.ellipse(63, 86, 9.6, 10.8, 0, 0, TAU); ca.ellipse(87, 86, 9.6, 10.8, 0, 0, TAU); ca.fill();
      if (kg) { ca.fillStyle = tinta; ca.beginPath(); ca.arc(63 + lx * .4, 86 + ly * .4, 3.2, 0, TAU); ca.arc(87 + lx * .4, 86 + ly * .4, 3.2, 0, TAU); ca.fill(); }
      else {
        ca.fillStyle = A.gPupilJ; ca.beginPath(); ca.ellipse(64 + lx, 88 + ly, 6.4, 7.4, 0, 0, TAU); ca.ellipse(88 + lx, 88 + ly, 6.4, 7.4, 0, 0, TAU); ca.fill();
        ca.fillStyle = '#fff'; ca.beginPath(); ca.arc(66.8 + lx, 84.4 + ly, 2.8, 0, TAU); ca.arc(90.8 + lx, 84.4 + ly, 2.8, 0, TAU); ca.fill();
      }
      ca.lineWidth = 1.8; ca.stroke(A.jBulu);
    }
    if (P.mulut === 'senang') {
      ca.fillStyle = '#7A1235'; ca.fill(A.jMulutSenang); ca.lineWidth = 2; ca.stroke(A.jMulutSenang);
      ca.fillStyle = '#FF6F9F'; ca.beginPath(); ca.ellipse(75, 106, 4.4, 2.6, 0, 0, TAU); ca.fill();
    } else if (P.mulut === 'o') {
      ca.fillStyle = '#6A1030'; ca.beginPath(); ca.ellipse(75, 103, 3.4, 4, 0, 0, TAU); ca.fill();
    } else { ca.lineWidth = 2.3; ca.stroke(A.jMulut); }
  }
  function gambarPayung(P, t) {
    const A = asetAktor(), kp = AK.g.kp;
    ca.save();
    ca.globalAlpha = P.a;
    ca.translate(P.x, P.y); ca.rotate(P.rot); ca.scale(P.f * P.sx * kp, P.sy * kp); ca.translate(-75, -110);
    const lenganKanan = () => {
      if (Math.hypot(P.hx - 112, P.hy - 130) > 6) {
        ca.strokeStyle = '#F2B2CA'; ca.lineWidth = 12; ca.lineCap = 'round';
        ca.beginPath(); ca.moveTo(100, 112); ca.quadraticCurveTo((100 + P.hx) / 2 + 8, (112 + P.hy) / 2, P.hx, P.hy); ca.stroke();
      }
    };
    if (P.uDepan) lenganKanan();
    if (!P.uDepan) payung(P);
    const dj = P.kaki ? Math.sin(t / 180) * 3 : 0;
    ca.fillStyle = '#2E9C7A'; ca.beginPath(); ca.ellipse(62, 163 + P.kaki * 4 + dj, 10, 5.5, P.kaki * .3, 0, TAU); ca.fill();
    ca.fillStyle = '#35A884'; ca.beginPath(); ca.ellipse(88, 163 + P.kaki * 4 - dj, 10, 5.5, -P.kaki * .3, 0, TAU); ca.fill();
    const kb = P.kembang, an = P.angin;
    const hy = 158 - kb * 7, hl = 40 - kb * 11 + an * 6, hr = 110 + kb * 11 + an * 6;
    const ombak = Math.sin(t / 110) * kb * 3;
    ca.fillStyle = A.gGamis; ca.beginPath();
    ca.moveTo(47, 118); ca.quadraticCurveTo(75, 112, 103, 118); ca.lineTo(hr, hy + ombak);
    ca.quadraticCurveTo(75 + an * 5, 166 - kb * 12, hl, hy - ombak); ca.closePath(); ca.fill();
    ca.save(); ca.globalAlpha *= .5; ca.strokeStyle = '#7D69C6'; ca.lineWidth = 1.2; ca.stroke(A.jGamisLipat); ca.restore();
    const jw = an * 7, jk = Math.sin(t / 95) * (Math.abs(an) + kb * .5) * 2.4;
    ca.fillStyle = A.gJilbab; ca.beginPath();
    ca.moveTo(75, 46); ca.bezierCurveTo(104, 46, 118, 68, 118, 92); ca.bezierCurveTo(118, 108, 121 + jw * .4, 120, 124 + jw, 128 + jk);
    ca.quadraticCurveTo(75 + jw, 142 - kb * 4, 26 + jw, 128 - jk); ca.bezierCurveTo(29 + jw * .4, 120, 32, 108, 32, 92);
    ca.bezierCurveTo(32, 68, 46, 46, 75, 46); ca.closePath(); ca.fill();
    ca.save(); ca.globalAlpha *= .8; ca.strokeStyle = '#E28DB0'; ca.lineWidth = 1.6; ca.stroke(A.jJilbabGaris);
    ca.globalAlpha /= .8; ca.globalAlpha *= .7; ca.lineWidth = 1.4; ca.stroke(A.jJilbabLipat); ca.restore();
    {
      let sud = P.lA, pj = P.lP;
      if (P.tL) {
        const l = keLokal(P, P.tL.x, P.tL.y, kp, 75, 110);
        sud = Math.atan2(l.y - 112, l.x - 50); pj = Math.max(14, Math.min(48, Math.hypot(l.x - 50, l.y - 112)));
      }
      const ex = 50 + Math.cos(sud) * pj, ey = 112 + Math.sin(sud) * pj;
      ca.strokeStyle = '#F2B2CA'; ca.lineWidth = 13; ca.lineCap = 'round';
      ca.beginPath(); ca.moveTo(50, 112); ca.lineTo(ex - Math.cos(sud) * 4, ey - Math.sin(sud) * 4); ca.stroke();
      ca.fillStyle = '#5CCFA8'; ca.beginPath(); ca.ellipse(ex, ey, 6.5, 6, 0, 0, TAU); ca.fill();
    }
    ca.fillStyle = A.gKulitJ; ca.beginPath(); ca.ellipse(75, 89, 29, 26, 0, 0, TAU); ca.fill();
    ca.save(); ca.setLineDash([2.4, 2.2]); ca.globalAlpha *= .85; ca.strokeStyle = '#fff'; ca.lineWidth = 2.2;
    ca.beginPath(); ca.ellipse(75, 89, 30.4, 27.4, 0, 0, TAU); ca.stroke(); ca.restore();
    ca.save(); ca.translate(75, 119); ca.scale(.72, .72); ca.fillStyle = '#F7A6C3'; ca.fill(A.jBunga); ca.restore();
    ca.save(); ca.fillStyle = '#fff'; ca.globalAlpha *= .6; ca.beginPath(); ca.ellipse(96, 64, 5, 9, .59, 0, TAU); ca.fill(); ca.restore();
    ca.save(); ca.globalAlpha *= .55; ca.fillStyle = '#FF7FAA'; ca.beginPath(); ca.ellipse(55, 99, 6.5, 3.6, 0, 0, TAU); ca.ellipse(95, 99, 6.5, 3.6, 0, 0, TAU); ca.fill(); ca.restore();
    mataJ(P);
    if (P.uDepan) payung(P); else lenganKanan();
    ca.fillStyle = '#4FC39C'; ca.beginPath(); ca.ellipse(P.hx, P.hy, 7, 6.4, 0, 0, TAU); ca.fill();
    ca.restore();
  }
  /** Ujung payung (koordinat dokumen) — sumber percikan sihir. */
  function ujungPayung(P) {
    const s = Math.sin(P.uA), c = Math.cos(P.uA);
    return keDunia(P, P.hx + s * 145, P.hy - c * 145, AK.g.kp, 75, 110);
  }

  /* =================================================================
   *  EFEK — partikel, tali, asap, garis laju
   * ================================================================= */
  const MAKS_PARTIKEL = () => (S.hemat ? 36 : 110);
  function tambahPartikel(p) {
    if (S.partikel.length >= MAKS_PARTIKEL()) S.partikel.shift();
    S.partikel.push(p);
  }
  function debu(x, y, n = 6, arah = 0) {
    for (let i = 0; i < (S.hemat ? Math.ceil(n / 2) : n); i++) {
      const a = PI + (i / (n - 1 || 1)) * PI + arah;
      tambahPartikel({ j: 'debu', x, y, vx: Math.cos(a) * (40 + Math.random() * 60), vy: Math.sin(a) * (20 + Math.random() * 30) - 10,
        r: 3 + Math.random() * 4, umur: 520, t0: performance.now() });
    }
  }
  function asapDi(x, y, ukuran) { tambahPartikel({ j: 'asap', x, y, r: ukuran, umur: 700, t0: performance.now() }); }
  function bintang(x, y, vx, vy, umur = 700, r = 3.2, warna = W_.emas) {
    tambahPartikel({ j: 'bintang', x, y, vx, vy, r, umur, warna, t0: performance.now(), putar: Math.random() * TAU });
  }
  function kelopakDi(x, y, n = 10) {
    for (let i = 0; i < (S.hemat ? Math.ceil(n / 2) : n); i++) {
      const a = -HALF + (Math.random() - .5) * 2.4;
      tambahPartikel({ j: 'kelopak', x, y, vx: Math.cos(a) * (60 + Math.random() * 90), vy: Math.sin(a) * (90 + Math.random() * 80),
        r: 7 + Math.random() * 6, umur: 1200, t0: performance.now(), putar: Math.random() * TAU, img: i % 3 });
    }
  }
  function bintangKecil(x, y, r) {
    if (r <= .3) return;
    ca.beginPath(); ca.moveTo(x, y - r); ca.quadraticCurveTo(x, y, x + r, y); ca.quadraticCurveTo(x, y, x, y + r);
    ca.quadraticCurveTo(x, y, x - r, y); ca.quadraticCurveTo(x, y, x, y - r); ca.fill();
  }
  function langkahPartikel(dt, kini) {
    const A = asetAktor();
    S.partikel = S.partikel.filter(p => kini - p.t0 < p.umur);
    for (const p of S.partikel) {
      const u = (kini - p.t0) / p.umur;
      if (p.j === 'asap') {
        for (let i = 0; i < (S.hemat ? 6 : 10); i++) {
          const a = i / 10 * TAU + acak(i * 5.7) * .5, q = E.expoOut(Math.min(1, u * 1.6));
          const r = p.r * (.25 + .75 * q) * (.55 + acak(i * 2.3) * .6);
          const s = p.r * (.5 + acak(i * 9.1) * .45) * (.6 + .6 * q);
          ca.globalAlpha = (1 - E.quartOut(u)) * .9;
          ca.drawImage(A.asap, p.x + Math.cos(a) * r - s, p.y + Math.sin(a) * r * .8 - s - u * p.r * .4, s * 2, s * 2);
        }
        continue;
      }
      p.x += (p.vx || 0) * dt; p.y += (p.vy || 0) * dt;
      if (p.j === 'debu') {
        p.vy += 60 * dt;
        ca.globalAlpha = (1 - u) * .55; ca.fillStyle = '#C8D3DD';
        ca.beginPath(); ca.arc(p.x, p.y, p.r * (1 + u), 0, TAU); ca.fill();
      } else if (p.j === 'bintang') {
        p.vx *= .985; p.vy = p.vy * .985 + 22 * dt;
        ca.globalAlpha = Math.min(1, (1 - u) * 1.6);
        ca.fillStyle = p.warna;
        bintangKecil(p.x, p.y, p.r * (1 - u * .5) * (1 + .25 * Math.sin(kini / 60 + p.putar)));
      } else if (p.j === 'kelopak') {
        p.vy += 110 * dt; p.vx *= .99; p.putar += dt * 3;
        ca.save(); ca.globalAlpha = 1 - E.quadIn(u); ca.translate(p.x, p.y); ca.rotate(p.putar);
        ca.scale(Math.max(.2, Math.abs(Math.cos(p.putar * 1.3))), 1);
        ca.drawImage(A.kelopak[p.img], -p.r, -p.r, p.r * 2, p.r * 2); ca.restore();
      } else if (p.j === 'garis') {
        ca.globalAlpha = (1 - u) * .5; ca.strokeStyle = '#9FB4C6'; ca.lineWidth = 2; ca.lineCap = 'round';
        ca.beginPath(); ca.moveTo(p.x, p.y); ca.lineTo(p.x - p.dx * (1 - u), p.y - p.dy * (1 - u)); ca.stroke();
      }
    }
    ca.globalAlpha = 1;
  }
  /** Tali emas dari tangan ke ujung data; lendut = kendur (0 tegang … 1 kendur). */
  function tali(a, b, lendut) {
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2 + Math.hypot(b.x - a.x, b.y - a.y) * .18 * lendut;
    ca.lineCap = 'round';
    ca.strokeStyle = 'rgba(80,58,10,.55)'; ca.lineWidth = 4.2;
    ca.beginPath(); ca.moveTo(a.x, a.y); ca.quadraticCurveTo(mx, my, b.x, b.y); ca.stroke();
    ca.strokeStyle = W_.kuningan; ca.lineWidth = 2.6;
    ca.beginPath(); ca.moveTo(a.x, a.y); ca.quadraticCurveTo(mx, my, b.x, b.y); ca.stroke();
    ca.strokeStyle = 'rgba(255,240,180,.75)'; ca.lineWidth = 1; ca.setLineDash([3, 4]);
    ca.beginPath(); ca.moveTo(a.x, a.y); ca.quadraticCurveTo(mx, my, b.x, b.y); ca.stroke(); ca.setLineDash([]);
    // simpul kait di ujung data
    ca.fillStyle = W_.kuninganHi; ca.beginPath(); ca.arc(b.x, b.y, 3.6, 0, TAU); ca.fill();
    ca.strokeStyle = '#8A6A12'; ca.lineWidth = 1.2; ca.stroke();
  }

  /* =================================================================
   *  GEOMETRI (koordinat dokumen)
   * ================================================================= */
  function ukurAktor() {
    const w = innerWidth;
    S.Hn = klem(w * .048, 44, 64);
    S.k = S.Hn / 128; S.B = 58.5 * S.k;
    S.Hp = S.Hn * 1.04; S.kp = S.Hp / 122; S.Bp = 58.5 * S.kp;
    AK.g = { k: S.k, kp: S.kp };
  }
  function kotak(el) {
    const r = el.getBoundingClientRect();
    return { kiri: r.left + scrollX, kanan: r.right + scrollX, atas: r.top + scrollY, bawah: r.bottom + scrollY,
      lebar: r.width, tinggi: r.height, tx: (r.left + r.right) / 2 + scrollX, vr: r };
  }
  function batasAtas() { const t = document.querySelector('.topbar'); return t ? Math.max(0, t.getBoundingClientRect().bottom) : 0; }
  function batasBawah() {
    const t = document.querySelector('.tabbar');
    const r = t && getComputedStyle(t).display !== 'none' ? t.getBoundingClientRect().top : innerHeight;
    return Math.min(innerHeight, r);
  }
  /** Bagian elemen yang tampak di layar (0..1, tinggi). */
  function tampak(el) {
    if (!el) return 0;
    const r = el.getBoundingClientRect();
    if (r.right < 0 || r.left > innerWidth || !r.height) return 0;
    const a = Math.max(r.top, batasAtas()), b = Math.min(r.bottom, batasBawah());
    return klem((b - a) / Math.min(r.height, innerHeight * .7), 0, 1);
  }
  const mendatarTampak = (el) => { const r = el.getBoundingClientRect(); return r.left >= -4 && r.right <= innerWidth + 4; };

  /* =================================================================
   *  PENGGERAK ADEGAN
   *  Setiap adegan: { nama, dur, mulai(), langkah(ms, u, kini), selesai() }
   * ================================================================= */
  function jalankan(jenis, daftar, akhir) {
    S.jenis = jenis; S.antrian = daftar.slice(); S.akhir = akhir || null; S.hidup = true;
    pastikanKanvas();
    berikut();
    bangunkan();
  }
  function berikut() {
    const a = S.antrian.shift();
    if (!a) { S.aksi = null; S.adegan = ''; const f = S.akhir; S.akhir = null; if (f) f(); return; }
    S.aksi = { ...a, t0: performance.now() };
    S.adegan = a.nama; S.adeganTerakhir = a.nama;
    if (S.aksi.mulai) S.aksi.mulai();
  }
  function lewati(nama) { return { nama, dur: 1, langkah() {} }; }

  /* Balok timbangan berpegas menuju sudut sasaran. */
  function langkahBalok(dt) {
    if (S.sudutT === null) return;
    const a = (S.sudutT - S.sudut) * 70 - S.sudutV * 9.5;
    S.sudutV += a * dt; S.sudut += S.sudutV * dt;
    if (Math.abs(S.sudutT - S.sudut) < .02 && Math.abs(S.sudutV) < .05) { S.sudut = S.sudutT; S.sudutV = 0; }
    API.mizan.atur(Math.round(S.sudut * 100) / 100);
  }

  /* Pemberat yang sedang jatuh ke piringan kanan. */
  function gambarJatuh(kini) {
    for (const b of S.jatuh) {
      if (b.mendarat) continue;
      const u = klem((kini - b.t0) / b.dur, 0, 1);
      if (u <= 0) continue;
      const tj = API.mizan.titik(); if (!tj) continue;
      const tx = tj.piringKanan.x + b.dx * tj.skala, ty = tj.piringKanan.y + b.dy * tj.skala;
      const x = lerp(b.x0, tx, E.sineInOut(u)), y = lerp(b.y0, ty, E.quadIn(u));
      ca.globalAlpha = .28; ca.strokeStyle = '#9F1239'; ca.lineWidth = 3 * tj.skala; ca.lineCap = 'round';
      ca.beginPath(); ca.moveTo(x, y - 26 * u * tj.skala); ca.lineTo(x, y); ca.stroke();
      ca.globalAlpha = 1; ca.fillStyle = '#9F1239';
      ca.beginPath(); ca.arc(x, y, 5.4 * tj.skala, 0, TAU); ca.fill();
      ca.fillStyle = 'rgba(255,255,255,.45)'; ca.beginPath(); ca.arc(x - 1.6 * tj.skala, y - 1.8 * tj.skala, 1.6 * tj.skala, 0, TAU); ca.fill();
      if (u >= 1) { b.mendarat = true; b.saat && b.saat(); }
    }
  }

  function gambarPesawat(p) {
    const s = S.Hn * .32;
    ca.save(); ca.translate(p.x, p.y); ca.rotate(p.sud);
    ca.fillStyle = '#F4F7FA'; ca.strokeStyle = '#14618B'; ca.lineWidth = 1.4; ca.lineJoin = 'round';
    ca.beginPath(); ca.moveTo(s, 0); ca.lineTo(-s, -s * .62); ca.lineTo(-s * .45, 0); ca.lineTo(-s, s * .62); ca.closePath(); ca.fill(); ca.stroke();
    ca.beginPath(); ca.moveTo(s, 0); ca.lineTo(-s * .45, 0); ca.stroke();
    ca.restore();
  }
  function gambarAmplop(x, y) {
    const w = S.Hn * .62, h = w * .66;
    ca.save(); ca.translate(x, y);
    ca.fillStyle = '#FFFFFF'; ca.strokeStyle = '#14618B'; ca.lineWidth = 1.6; ca.lineJoin = 'round';
    ca.beginPath(); ca.rect(-w / 2, -h / 2, w, h); ca.fill(); ca.stroke();
    ca.beginPath(); ca.moveTo(-w / 2, -h / 2); ca.lineTo(0, h * .12); ca.lineTo(w / 2, -h / 2); ca.stroke();
    ca.fillStyle = '#C9A227'; ca.beginPath(); ca.arc(0, h * .1, h * .14, 0, TAU); ca.fill();
    ca.restore();
  }
  function tulisWiii(x, y, a) {
    ca.save(); ca.globalAlpha = a; ca.fillStyle = '#0B2B45';
    ca.font = `italic 700 ${Math.round(S.Hn * .3)}px 'Instrument Serif', Georgia, serif`;
    ca.textAlign = 'center'; ca.fillText('wiii!', x, y); ca.restore();
  }

  /** Lompatan berbusur dari a ke b (kaki), tinggi h, salto bila putar. */
  function busurLompat(P, a, b, p, h, putar, B) {
    const x = lerp(a.x, b.x, p), y = lerp(a.y, b.y, p) - h * busur(p);
    udara(P, p, putar);
    diKaki(P, x, y, B);
  }

  /* =================================================================
   *  PERTUNJUKAN · LEMBAR MIZAN
   * ================================================================= */
  function pertunjukanMizan() {
    const M = API.mizan;
    const svg = M.svg(), kartu = M.kartu();
    if (!svg || !kartu) return API.lepas('mizan', 'kartu timbangan tidak ada');
    const kiri = Number(svg.dataset.kiri) || 0, kanan = Number(svg.dataset.kanan) || 0;
    const akhir = M.sudutAkhir();
    const nKanan = svg.querySelectorAll('.mz-pan-kanan .mz-w').length;
    const N = S.N = poseKosongN(), J = S.J = poseKosongJ();
    N.a = 0; J.a = 0;
    S.sudut = 0; S.sudutV = 0; S.sudutT = 0; S.jatuh = [];
    const sudutIsi = (pk, pn) => {
      const r = (kanan * pn - kiri * pk) / Math.max(1, kanan * pn + kiri * pk);
      return (kiri * pk + kanan * pn) ? r * 15 : 0;
    };
    let kakiN = null;

    const melayangDi = (ms, x, y, condong = 0) => {
      Object.assign(J, poseKosongJ()); J.a = 1;
      melayang(J, ms, condong + Math.sin(ms / 420) * .2);
      J.x = x + Math.sin(ms / 520) * S.Hp * .08; J.y = y + Math.sin(ms / 300) * S.Hp * .06;
      J.rot = Math.cos(ms / 380) * .07; J.f = 1;
    };
    const atasPiringKiri = () => { const t = M.titik(); return { x: t.piringKiri.x + S.Hp * .2, y: t.piringKiri.y - S.Hp * 1.95 }; };

    const adegan = [
      { nama: 'masuk', dur: 1300, mulai() {
          const k = kotak(kartu), t = M.titik();
          this.x0 = scrollX - S.Hn * 1.4; this.x1 = t.poros.x - S.Hn * 1.5; this.y = k.atas;
          const tj = atasPiringKiri(); this.j0 = { x: tj.x + S.Hp * 1.4, y: scrollY + batasAtas() - S.Hp * 2 }; this.j1 = tj;
        },
        langkah(ms) {
          const dur = 1050, p = E.sineInOut(seg(ms, 0, dur));
          Object.assign(N, poseKosongN()); N.a = 1; N.f = 1;
          if (ms < dur) { lari(N, ms); N.rot = .16; diKaki(N, lerp(this.x0, this.x1, p), this.y, S.B); tambahGarisLaju(N, 1); }
          else { mendarat(N, ms - dur); N.rot = 0; diKaki(N, this.x1, this.y, S.B); N.mata = 'senang'; }
          const pj = E.quartOut(seg(ms, 100, 1250));
          melayangDi(ms, lerp(this.j0.x, this.j1.x, pj), lerp(this.j0.y, this.j1.y, pj), -.5 * (1 - pj));
          J.angin = -.6 * (1 - pj);
        },
        selesai() { kakiN = { x: this.x1, y: this.y }; debu(this.x1, this.y, 6); } },

      { nama: 'loncat', dur: 760, mulai() { this.a = kakiN; },
        langkah(ms, u) {
          const t = M.titik(); const b = { x: t.poros.x, y: t.poros.y };
          Object.assign(N, poseKosongN()); N.a = 1; N.f = 1; N.mata = 'tekad';
          if (u < .86) busurLompat(N, this.a, b, u / .86, S.Hn * 1.3, 1, S.B);
          else { mendarat(N, ms - 760 * .86); diKaki(N, b.x, b.y, S.B); }
          const tj = atasPiringKiri(); melayangDi(ms + 1300, tj.x, tj.y);
        },
        selesai() { const t = M.titik(); debu(t.poros.x, t.poros.y, 4); } },

      { nama: 'sihir', dur: 1600, mulai() { this.sb = 0; },
        langkah(ms, u, kini) {
          const t = M.titik(), tj = atasPiringKiri();
          melayangDi(ms + 2060, tj.x, tj.y);
          J.putar = ms / 140; J.uA = -.25 + Math.sin(ms / 120) * .25; J.uDepan = true; J.mata = 'senang'; J.mulut = 'senang';
          const pk = E.quartOut(seg(ms, 250, 1350));
          M.isi('kiri', pk);
          S.sudutT = sudutIsi(pk, 0) * .9;
          if (ms - this.sb > (S.hemat ? 110 : 60) && ms < 1350) {
            this.sb = ms;
            const ujung = ujungPayung(J);
            const dx = t.piringKiri.x - ujung.x, dy = t.piringKiri.y - ujung.y;
            bintang(ujung.x, ujung.y, dx * 1.6 + (Math.random() - .5) * 60, dy * 1.4, 620, 3.4);
          }
          Object.assign(N, poseKosongN()); N.a = 1; N.f = -1; N.mata = 'senang'; N.lx = -3;
          diKaki(N, t.poros.x, t.poros.y, S.B);
        },
        selesai() { M.isi('kiri', 1); const t = M.titik(); kelopakDi(t.piringKiri.x, t.piringKiri.y - 6, 8); } },

      !nKanan ? lewati('hujan') : { nama: 'hujan', dur: Math.max(1800, 650 + nKanan * 190), mulai() {
          const k = kotak(kartu), n = Math.max(1, nKanan), kini = performance.now();
          const slot = [[-15,-6],[-5,-6],[5,-6],[15,-6],[-10,-15],[0,-15],[10,-15],[-5,-24],[5,-24]];
          let landed = 0;
          for (let i = 0; i < n; i++) {
            const [dx, dy] = slot[i] || [0, -6];
            const t = M.titik();
            S.jatuh.push({ t0: kini + 260 + i * 190, dur: 430, dx, dy,
              x0: t.piringKanan.x + dx * t.skala + (Math.random() - .5) * 30, y0: Math.max(k.atas - 20, scrollY + batasAtas() - 10),
              saat: () => {
                landed++;
                M.isi('kanan', landed / n);
                S.sudutT = sudutIsi(1, landed / n);
                const tt = M.titik(); debu(tt.piringKanan.x, tt.piringKanan.y + 4 * tt.skala, 3);
              } });
          }
        },
        langkah(ms) {
          const t = M.titik();
          const tj = atasPiringKiri(); melayangDi(ms + 3660, tj.x, tj.y);
          J.mata = ms > 500 ? 'kaget' : 'normal'; J.mulut = 'o'; J.lx = 4; J.ly = -2;
          Object.assign(N, poseKosongN()); N.a = 1; N.f = 1;
          const goyah = Math.sin(ms / 85) * .08 * klem(ms / 600, 0, 1);
          N.rot = S.sudut * Math.PI / 180 * .9 + goyah;
          N.aL = -HALF + .2 + Math.sin(ms / 90) * .7; N.aR = -HALF - .2 - Math.cos(ms / 80) * .7;
          N.mata = 'kaget'; N.kL = [-4, 0]; N.kR = [4, 0];
          diKaki(N, t.poros.x, t.poros.y, S.B);
        },
        selesai() { M.isi('kanan', 1); S.sudutT = akhir; } },

      { nama: 'gelincir', dur: 1250, mulai() {
          const t = M.titik(), k = kotak(kartu);
          this.mulaiT = { x: t.poros.x, y: t.poros.y };
          this.tanah = { x: Math.min(t.ujungKanan.x + S.Hn * .95, k.kanan - S.Hn * .55), y: t.alas.y };
          if (akhir < 0) this.tanah.x = Math.max(t.ujungKiri.x - S.Hn * .95, k.kiri + S.Hn * .55);
          this.arah = akhir < 0 ? -1 : 1;
        },
        langkah(ms, u, kini) {
          const t = M.titik(), ujung = this.arah > 0 ? t.ujungKanan : t.ujungKiri;
          Object.assign(N, poseKosongN()); N.a = 1; N.f = this.arah;
          const tg = 560;
          if (ms < tg) {
            const p = E.quadIn(ms / tg);
            const x = lerp(this.mulaiT.x, ujung.x, p), y = lerp(this.mulaiT.y, ujung.y - 4, p);
            N.rot = S.sudut * Math.PI / 180; N.mata = 'senang'; N.sarung = -.25 * this.arah;
            N.aL = HALF + 1.4; N.aR = HALF - 1.4; N.kL = [-6, -3]; N.kR = [6, -3];
            diKaki(N, x, y, S.B); tambahGarisLaju(N, this.arah);
            tulisWiii(x - this.arah * S.Hn * .9, y - S.Hn * 1.1, klem(ms / 200, 0, 1));
          } else {
            const p = seg(ms, tg, 1100);
            if (p < 1) busurLompat(N, { x: ujung.x, y: ujung.y - 4 }, this.tanah, p, S.Hn * .9, this.arah > 0 ? 1 : -1, S.B);
            else { mendarat(N, ms - 1100); diKaki(N, this.tanah.x, this.tanah.y, S.B); N.mata = 'senang'; }
            if (p < .3) tulisWiii(ujung.x, ujung.y - S.Hn * 1.1, 1 - p / .3);
          }
          const tj = atasPiringKiri(); melayangDi(ms + 5500, tj.x, tj.y); J.mata = 'kaget'; J.mulut = 'o';
          J.lx = this.arah * 4;
        },
        selesai() { debu(this.tanah.x, this.tanah.y, 7); kakiN = this.tanah; } },

      { nama: 'sapa', dur: 1350, mulai() { this.ketuk = false; },
        langkah(ms) {
          const t = M.titik();
          const atas = { x: t.piringKiri.x + S.Hp * .55, y: t.piringKiri.y - S.Hp * .95 };
          const tj = atasPiringKiri();
          const p = E.sineInOut(seg(ms, 0, 500));
          melayangDi(ms + 6800, lerp(tj.x, atas.x, p), lerp(tj.y, atas.y, p));
          if (ms > 450 && ms < 900) { J.uDepan = true; J.uA = -.9 + Math.sin(seg(ms, 450, 900) * PI) * .55; }
          if (ms > 640 && !this.ketuk) {
            this.ketuk = true;
            for (let i = 0; i < (S.hemat ? 6 : 12); i++) { const a = i / 12 * TAU; bintang(t.piringKiri.x, t.piringKiri.y, Math.cos(a) * 120, Math.sin(a) * 120 - 40, 650, 3); }
            M.lepasKartu();
          }
          const berat = Math.abs(akhir) > 8;
          J.mata = ms > 700 ? (berat ? 'normal' : 'senang') : 'normal';
          J.mulut = ms > 700 ? (berat ? 'o' : 'senang') : 'normal';
          J.lx = 0; J.ly = 3;
          Object.assign(N, poseKosongN()); N.a = 1; N.f = -1; N.mata = 'senang';
          const lompat = seg(ms, 650, 1150);
          if (lompat > 0 && lompat < 1) { udara(N, lompat, 0); diKaki(N, kakiN.x, kakiN.y - S.Hn * .5 * busur(lompat), S.B); N.aL = -HALF + .3; N.aR = -HALF - .3; }
          else diKaki(N, kakiN.x, kakiN.y, S.B);
        } },

      { nama: 'sorot', dur: 1700, mulai() {
          const dec = M.keputusan(), ang = M.batangSorot();
          this.dec = dec && tampak(dec) > .6 ? dec : null;
          this.ang = ang && tampak(ang) > .5 ? ang : null;
          if (!this.ang) M.lepasAngkatan();
          if (this.dec) { const k = kotak(this.dec); this.dari = kakiN; this.ke = { x: klem(k.kiri + S.Hn * .9, k.kiri + S.Hn * .6, k.kanan - S.Hn * .6), y: k.atas }; }
          if (this.ang) { const k = kotak(this.ang.querySelector('.mz-ang-tr') || this.ang); this.jA = { x: k.kiri + S.Hp * .4, y: k.atas - S.Hp * 1.15 }; this.jT = { x: k.kiri, y: k.atas + k.tinggi / 2 }; this.kAng = k; }
          this.j0 = { x: J.x, y: J.y }; this.ditancap = false; this.disihir = false;
        },
        langkah(ms) {
          Object.assign(N, poseKosongN()); N.a = 1;
          if (this.dec) {
            const p = seg(ms, 0, 800);
            N.f = this.ke.x >= this.dari.x ? 1 : -1;
            if (p < 1) busurLompat(N, this.dari, this.ke, p, Math.max(S.Hn, Math.abs(this.ke.y - this.dari.y) * .35 + S.Hn * .6), 0, S.B);
            else {
              mendarat(N, ms - 800); diKaki(N, this.ke.x, this.ke.y, S.B); N.mata = 'tekad';
              if (ms > 950) {
                N.pena = 1; N.penA = -HALF + .15; N.aR = -HALF + .2; N.mata = 'senang';
                if (!this.ditancap) { this.ditancap = true; M.sorot(this.dec); debu(this.ke.x, this.ke.y, 4); }
              }
            }
          } else { N.f = -1; diKaki(N, kakiN.x, kakiN.y, S.B); N.mata = 'senang'; N.aL = -HALF + .4 + Math.sin(ms / 110) * .4; }
          if (this.ang) {
            const p = E.sineInOut(seg(ms, 0, 700));
            melayangDi(ms + 8200, lerp(this.j0.x, this.jA.x, p), lerp(this.j0.y, this.jA.y, p));
            if (ms > 700) {
              J.uDepan = true; J.putar = ms / 120; J.uA = .5 + Math.sin(ms / 100) * .2; J.mata = 'senang'; J.mulut = 'senang';
              if (!this.disihir) { this.disihir = true; M.lepasAngkatan(); }
              const ujung = ujungPayung(J);
              if (Math.random() < (S.hemat ? .25 : .5)) {
                const tx = this.kAng.kiri + this.kAng.lebar * seg(ms, 700, 1600), ty = this.jT.y;
                bintang(ujung.x, ujung.y, (tx - ujung.x) * 1.5, (ty - ujung.y) * 1.5, 520, 3);
              }
            }
          } else melayangDi(ms + 8200, this.j0.x, this.j0.y);
        },
        selesai() { M.lepasAngkatan(); } },

      { nama: 'keluar', dur: 1000, mulai() { this.n = { x: N.x, y: N.y }; this.j = { x: J.x, y: J.y }; this.asap = false; },
        langkah(ms) {
          if (!this.asap) { this.asap = true; asapDi(this.n.x, this.n.y, S.Hn * .9); }
          N.a = Math.max(0, 1 - ms / 220);
          const p = E.quadIn(seg(ms, 150, 1000));
          melayangDi(ms + 9900, this.j.x + p * S.Hp * 1.4, this.j.y - p * (this.j.y - scrollY + S.Hp * 3), .5);
          J.a = 1 - seg(ms, 700, 1000); J.mata = 'senang'; J.mulut = 'senang';
          J.lA = -1.2 + Math.sin(ms / 90) * .5;                // melambai
        } }
    ];
    jalankan('mizan', adegan, () => { S.sudutT = akhir; API.mizan.atur(akhir); API.lepas('mizan'); selesaiTampil(); });
  }

  /* =================================================================
   *  PERTUNJUKAN · MEJA PENDAMPINGAN
   * ================================================================= */
  function pertunjukanBk() {
    const B = API.bk, papan = B.papan();
    if (!papan) return API.lepas('bk', 'papan tidak ada');
    const lajur = B.lajur();
    const N = S.N = poseKosongN(), J = S.J = poseKosongJ();
    N.a = 0; J.a = 0;
    let kakiN = null, jB = null;
    const atasLajur = (el) => { const k = kotak(el); return { k, kepala: { x: k.kiri + k.lebar * .5, y: k.atas } }; };
    const melayangDi = (ms, x, y, condong = 0) => {
      Object.assign(J, poseKosongJ()); J.a = 1;
      melayang(J, ms, condong + Math.sin(ms / 420) * .2);
      J.x = x + Math.sin(ms / 520) * S.Hp * .07; J.y = y + Math.sin(ms / 300) * S.Hp * .06; J.rot = Math.cos(ms / 380) * .07;
    };
    const tinggiJ = S.Hp * 1.25;

    const adegan = [
      { nama: 'masuk', dur: 1150, mulai() {
          const l0 = atasLajur(lajur[0]);
          this.x0 = scrollX - S.Hn * 1.3; this.x1 = l0.k.kiri + S.Hn * .7; this.y = l0.k.atas;
          this.j0 = { x: l0.kepala.x + S.Hp * 2, y: scrollY + batasAtas() - S.Hp * 2 };
          this.j1 = { x: l0.kepala.x, y: l0.k.atas - tinggiJ };
        },
        langkah(ms) {
          const dur = 950, p = E.sineInOut(seg(ms, 0, dur));
          Object.assign(N, poseKosongN()); N.a = 1; N.f = 1;
          if (ms < dur) { lari(N, ms); N.rot = .16; diKaki(N, lerp(this.x0, this.x1, p), this.y, S.B); tambahGarisLaju(N, 1); }
          else { mendarat(N, ms - dur); diKaki(N, this.x1, this.y, S.B); N.mata = 'senang'; }
          const pj = E.quartOut(seg(ms, 80, 1100));
          melayangDi(ms, lerp(this.j0.x, this.j1.x, pj), lerp(this.j0.y, this.j1.y, pj), -.5 * (1 - pj));
        },
        selesai() { kakiN = { x: this.x1, y: this.y }; jB = this.j1; } },

      ...lajur.map((el, i) => (!mendatarTampak(el) || tampak(el) <= 0) ? {
        nama: 'ketuk', dur: 140, mulai() { B.buka(i); }, langkah() {
          Object.assign(N, poseKosongN()); N.a = 1; diKaki(N, kakiN.x, kakiN.y, S.B);
          melayangDi(performance.now(), jB.x, jB.y);
        } } : {
        nama: 'ketuk', dur: 820, mulai() {
          const a = atasLajur(el);
          this.j0 = jB; this.j1 = { x: a.kepala.x + S.Hp * .25, y: a.k.atas - tinggiJ };
          this.n0 = kakiN; this.n1 = { x: Math.max(a.k.kiri + S.Hn * .6, this.j1.x - S.Hn * 1.4), y: a.k.atas };
          this.tap = false; this.tCount = a.k;
        },
        langkah(ms) {
          const p = E.sineInOut(seg(ms, 0, 420));
          melayangDi(ms + i * 900, lerp(this.j0.x, this.j1.x, p), lerp(this.j0.y, this.j1.y, p), (this.j1.x - this.j0.x) > 0 ? .4 * (1 - p) : 0);
          if (ms > 400) { J.uDepan = true; J.uA = .9 - Math.sin(seg(ms, 400, 760) * PI) * 1.1; J.mata = 'senang'; J.mulut = 'senang'; }
          if (ms > 560 && !this.tap) {
            this.tap = true; B.buka(i);
            const kx = this.tCount.kanan - 22, ky = this.tCount.atas + 14;
            for (let s = 0; s < (S.hemat ? 4 : 8); s++) { const a = -HALF + (s / 8 - .5) * 2.2; bintang(kx, ky, Math.cos(a) * 110, Math.sin(a) * 110, 560, 2.8); }
            if (i === 0 || i === 3) kelopakDi(this.j1.x, this.j1.y + tinggiJ * .4, 6);
          }
          Object.assign(N, poseKosongN()); N.a = 1; N.f = this.n1.x >= this.n0.x ? 1 : -1;
          const pn = E.sineInOut(seg(ms, 80, 620));
          if (pn > 0 && pn < 1 && Math.abs(this.n1.x - this.n0.x) > 4) { lari(N, ms); N.rot = .14 * N.f; diKaki(N, lerp(this.n0.x, this.n1.x, pn), this.n0.y, S.B); }
          else { diKaki(N, pn >= 1 ? this.n1.x : this.n0.x, this.n0.y, S.B); N.mata = 'senang'; }
        },
        selesai() { kakiN = this.n1; jB = this.j1; } }),

      { nama: 'pesawat', dur: 1300, mulai() {
          const l1 = lajur[1];
          const sasaran = l1 && mendatarTampak(l1) && tampak(l1) > 0 ? atasLajur(l1).k : null;
          this.a = { x: kakiN.x + S.Hn * .3, y: kakiN.y - S.Hn * .9 };
          this.b = sasaran ? { x: sasaran.kanan - 24, y: sasaran.atas + 14 } : { x: scrollX + innerWidth + 60, y: kakiN.y - S.Hn * 2 };
          this.sampai = false; this.sasaran = !!sasaran;
        },
        langkah(ms) {
          Object.assign(N, poseKosongN()); N.a = 1; N.f = 1;
          diKaki(N, kakiN.x, kakiN.y, S.B);
          if (ms < 300) { N.aR = -HALF - .6 + ms / 300 * 1.6; N.mata = 'tekad'; }
          else { N.aR = HALF - .9; N.mata = 'senang'; }
          melayangDi(ms + 5000, jB.x, jB.y);
          const p = seg(ms, 280, 1150);
          if (p > 0 && p < 1) {
            const x = lerp(this.a.x, this.b.x, E.sineInOut(p)), y = lerp(this.a.y, this.b.y, p) - Math.sin(p * PI) * S.Hn * 1.6;
            const x2 = lerp(this.a.x, this.b.x, E.sineInOut(Math.min(1, p + .02))), y2 = lerp(this.a.y, this.b.y, Math.min(1, p + .02)) - Math.sin(Math.min(1, p + .02) * PI) * S.Hn * 1.6;
            S.pesawat = { x, y, sud: Math.atan2(y2 - y, x2 - x) };
            if (!S.hemat && Math.random() < .4) tambahPartikel({ j: 'garis', x, y, dx: (x - x2) * 8, dy: (y - y2) * 8, umur: 300, t0: performance.now() });
          } else S.pesawat = null;
          if (p >= 1 && !this.sampai) { this.sampai = true; if (this.sasaran) { B.buka(1); bintang(this.b.x, this.b.y, 0, -60, 500, 4); } }
        } },

      { nama: 'keluar', dur: 950, mulai() { this.n = { x: N.x, y: N.y }; this.j = jB; this.asap = false; },
        langkah(ms) {
          if (!this.asap) { this.asap = true; asapDi(this.n.x, this.n.y, S.Hn * .9); }
          N.a = Math.max(0, 1 - ms / 220);
          const p = E.quadIn(seg(ms, 120, 950));
          melayangDi(ms + 7000, this.j.x + p * S.Hp, this.j.y - p * (this.j.y - scrollY + S.Hp * 3), .5);
          J.a = 1 - seg(ms, 650, 950); J.lA = -1.2 + Math.sin(ms / 90) * .5;
        } }
    ];
    jalankan('bk', adegan, () => { B.selesai(); API.lepas('bk'); selesaiTampil(); });
  }

  /** Sesudah pesan terkirim: Si Peci mengantar kartu ke lajur "Dipanggil". */
  function antar(daftar) {
    const d = daftar && daftar[0]; if (!d || S.aksi) return;
    if (!S.N) { S.N = poseKosongN(); }
    if (!S.J) { S.J = poseKosongJ(); S.J.a = 0; }
    const N = S.N;
    const a = { x: d.dari.left + scrollX + 28, y: d.dari.top + scrollY }, b = { x: d.ke.left + scrollX + 28, y: d.ke.top + scrollY };
    jalankan('antar', [{ nama: 'antar', dur: 1250, mulai() { asapDi(a.x, a.y - S.Hn * .5, S.Hn * .8); },
      langkah(ms) {
        Object.assign(N, poseKosongN()); N.a = 1; N.f = b.x >= a.x ? 1 : -1;
        const p = seg(ms, 100, 900);
        const x = lerp(a.x, b.x, E.sineInOut(p)), y = lerp(a.y, b.y, E.sineInOut(p));
        if (p > 0 && p < 1) { lari(N, ms); N.rot = .12 * N.f; tambahGarisLaju(N, N.f); }
        else N.mata = 'senang';
        diKaki(N, x, y, S.B);
        const env = { x: N.x, y: N.y - S.Hn * .78 + (p > 0 && p < 1 ? Math.sin(ms / 60) * 2 : 0) };
        N.tL = { x: env.x - S.Hn * .22, y: env.y + S.Hn * .1 }; N.tR = { x: env.x + S.Hn * .22, y: env.y + S.Hn * .1 };
        S.amplop = ms < 1000 ? env : null;
        if (ms > 1000) N.a = Math.max(0, 1 - (ms - 1000) / 200);
        if (ms > 1000 && !this.asap) { this.asap = true; asapDi(N.x, N.y, S.Hn * .8); }
      } }], () => { S.amplop = null; selesaiTampil(); });
  }

  function selesaiTampil() {
    S.adegan = ''; S.aksi = null;
    // biarkan partikel terakhir habis, lalu kanvas dilepas oleh loop
  }

  /* =================================================================
   *  LOOP & KANVAS
   * ================================================================= */
  function pastikanKanvas() {
    if (S.kanvas && S.kanvas.isConnected) return;
    const cv = document.createElement('canvas');
    cv.className = 'mj-kanvas';
    cv.setAttribute('aria-hidden', 'true');
    document.body.appendChild(cv);
    S.kanvas = cv; S.ctx = cv.getContext('2d'); ca = S.ctx;
    AK.aset = null;
    ukurKanvas();
  }
  function ukurKanvas() {
    if (!S.kanvas) return;
    S.hemat = !!API.hemat();
    S.dpr = Math.min(S.hemat ? 1 : 2, window.devicePixelRatio || 1);
    S.kanvas.width = Math.round(innerWidth * S.dpr); S.kanvas.height = Math.round(innerHeight * S.dpr);
    S.kanvas.style.width = innerWidth + 'px'; S.kanvas.style.height = innerHeight + 'px';
    ukurAktor();
  }
  function bangunkan() { if (!S.raf && S.hidup) { S.lalu = performance.now(); S.raf = requestAnimationFrame(langkah); } }

  function langkah(kini) {
    S.raf = 0;
    if (!S.hidup) return;
    const v = API.view();
    if ((S.jenis === 'mizan' && v !== 'pimpinan') || ((S.jenis === 'bk' || S.jenis === 'antar') && v !== 'bk')) return hentikan();
    if (document.hidden) return;
    const dt = Math.min(.05, (kini - S.lalu) / 1000); S.lalu = kini;
    if (S.hemat && kini - S.gambarLalu < 32) { S.raf = requestAnimationFrame(langkah); return; }
    S.gambarLalu = kini;
    try {
      if (S.aksi) {
        const a = S.aksi, ms = kini - a.t0, u = Math.min(1, ms / a.dur);
        a.langkah(ms, u, kini);
        if (u >= 1 && S.aksi === a) { a.selesai && a.selesai(); berikut(); }
      }
      if (S.jenis === 'mizan') langkahBalok(dt);
      if (S.N) { S.jejakSyal.unshift(keDunia(S.N, 17, 73, S.k, 60, 72)); if (S.jejakSyal.length > 18) S.jejakSyal.length = 18; }
      gambar(kini, dt);
    } catch (e) {
      console.warn('meja berhenti:', e.message);
      API.lepas(S.jenis === 'antar' ? null : S.jenis, 'galat meja: ' + e.message);
      return hentikan();
    }
    if (!S.aksi && !S.partikel.length && (S.sudutT === null || S.sudutT === S.sudut)) { return hentikan(true); }
    S.raf = requestAnimationFrame(langkah);
  }

  function gambar(kini, dt) {
    const c = S.ctx; ca = c;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, S.kanvas.width, S.kanvas.height);
    c.setTransform(S.dpr, 0, 0, S.dpr, -scrollX * S.dpr, -scrollY * S.dpr);
    if (S.jatuh && S.jatuh.length) gambarJatuh(kini);
    for (const [P, B, H] of [[S.J, S.Bp, S.Hp], [S.N, S.B, S.Hn]]) {
      if (!P || P.a <= 0) continue;
      c.save(); c.globalAlpha = .14 * P.a; c.fillStyle = '#0B2B45';
      c.beginPath(); c.ellipse(P.x, P.y + B * P.sy + 2, H * .3, H * .06, 0, 0, TAU); c.fill(); c.restore();
    }
    if (S.J && S.J.a > 0) gambarPayung(S.J, kini);
    if (S.N && S.N.a > 0) gambarNinja(S.N, kini);
    if (S.amplop) gambarAmplop(S.amplop.x, S.amplop.y);
    if (S.pesawat) gambarPesawat(S.pesawat);
    langkahPartikel(dt, kini);
    c.globalAlpha = 1;
  }

  function tambahGarisLaju(P, arah) {
    if (S.hemat || Math.random() > .35) return;
    tambahPartikel({ j: 'garis', x: P.x - arah * S.Hn * .5, y: P.y + (Math.random() - .5) * S.Hn * .6,
      dx: -arah * S.Hn * .9, dy: 0, umur: 320, t0: performance.now() });
  }

  /** Jangan bermain di balik layar muat; tunggu kartunya tampak. */
  function tungguSiap(syarat, fn, gagal, maks = 9000) {
    const t0 = Date.now();
    const cek = () => {
      if (!S.hidupTunggu) return;
      if (!API.tertutup() && syarat()) return fn();
      if (Date.now() - t0 > maks) return gagal();
      setTimeout(cek, 140);
    };
    cek();
  }

  function hentikan(alami) {
    S.hidup = false; S.hidupTunggu = false;
    if (S.raf) cancelAnimationFrame(S.raf);
    S.raf = 0;
    if (S.kanvas) S.kanvas.remove();
    S.kanvas = null; S.ctx = null;
    if (!alami && S.aksi && S.jenis && S.jenis !== 'antar') API.lepas(S.jenis);
    S.aksi = null; S.antrian = []; S.N = null; S.J = null; S.partikel = []; S.jejakSyal = [];
    S.jatuh = []; S.pesawat = null; S.amplop = null; S.sudutT = null; S.sudutV = 0; S.adegan = '';
  }

  function mainkan(jenis) {
    hentikan(true);
    S.hidupTunggu = true;
    if (jenis === 'mizan') {
      // Pertunjukan mengikuti gulir: dimulai saat timbangan tampak (≥ 40 %).
      tungguSiap(() => tampak(API.mizan.svg()) > .4, () => { S.hidupTunggu = false; API.mulai('mizan'); pastikanKanvas(); pertunjukanMizan(); },
        () => API.lepas('mizan', 'timbangan tidak terlihat'), 20000);
    } else if (jenis === 'bk') {
      tungguSiap(() => tampak(API.bk.papan()) > .25, () => { S.hidupTunggu = false; API.mulai('bk'); pastikanKanvas(); pertunjukanBk(); },
        () => API.lepas('bk', 'papan tidak terlihat'), 20000);
    }
  }

  addEventListener('scroll', () => { if (S.hidup && S.kanvas) bangunkan(); }, { passive: true });
  addEventListener('resize', () => { if (S.kanvas) { ukurKanvas(); bangunkan(); } }, { passive: true });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && S.kanvas) bangunkan(); });

  window.RQMeja = { mainkan, antar: (d) => { if (API.view() === 'bk') antar(d); }, hentikan: () => hentikan(), _S: S };
})();
