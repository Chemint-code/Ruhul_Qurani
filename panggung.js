/* =====================================================================
 * panggung.js — v2.51 · PANGGUNG GRAFIK DI RINGKASAN
 * ---------------------------------------------------------------------
 *  Si Peci (ninja) dan Si Payung — aktor yang sama dengan showreel layar
 *  masuk (showreel.js v2.47.1; bentuk & warna disalin, bukan digambar
 *  ulang) — menggelar pertunjukan di atas kartu-kartu grafik Ringkasan:
 *
 *    LARI   → Si Peci berlari masuk menyusuri tepi atas kartu grafik,
 *             Si Payung turun berpayung.
 *    TARIK  → Si Peci melempar tali ke ujung data terbesar lalu menariknya
 *             dalam tiga sentakan; grafik tumbuh mengikuti tarikannya.
 *    SIHIR  → Si Payung memutar payungnya, percikan bintang melesat ke
 *             grafik, dan warna merekah dari titik sihir (grafik ditahan
 *             kelabu sampai disihir).
 *    LONCAT → salto ke grafik berikutnya (bersebelahan, atau bergantian).
 *    GELINCIR → meluncur di tepi kartu turun ke grafik di bawahnya.
 *    ASAP   → bila grafik berikutnya jauh, Si Peci menghilang dalam asap
 *             dan muncul di sana.
 *
 *  Pertunjukan mengikuti gulir: aktor hanya bergerak ke grafik yang
 *  sedang terlihat. Grafik yang terlewat (tergulir ke atas) langsung utuh;
 *  grafik yang terlihat tetapi belum didatangi 6 detik juga utuh sendiri.
 *  Data tidak pernah tersembunyi lama.
 *
 *  Satu kanvas `position:fixed` (z-index di bawah bilah atas & tab bawah,
 *  pointer-events:none). Satu loop rAF yang berhenti total saat aktor
 *  diam atau tak terlihat. Mode hemat: ≤ 30 fps, kanvas 1×, partikel
 *  lebih sedikit — gerak TETAP ada. prefers-reduced-motion: panggung
 *  tidak dimuat sama sekali (app.js tidak menahan grafik).
 *
 *  Satu-satunya pintu ke grafik: window.RQ_PANGGUNG (app.js v2.51).
 * ===================================================================== */
(function () {
  'use strict';
  if (window.RQPanggung) return;
  const API = window.RQ_PANGGUNG;
  if (!API) return;

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
    kanvas: null, ctx: null, dpr: 1, lebar: 0, tinggi: 0,
    raf: 0, lalu: 0, gambarLalu: 0, hidup: true,
    hemat: false, Hn: 54, k: .42, B: 24, Hp: 56, kp: .46, Bp: 27,
    antre: [],            // item grafik (dari app.js), urut letak
    target: null,         // item yang sedang dikerjakan
    aksi: null,           // { jenis, t0, dur, ... }
    N: null, J: null,     // pose aktor (koordinat dokumen)
    diPanggung: false,    // aktor sudah masuk
    giliran: 0,           // pemilih loncat/gelincir
    partikel: [],
    jejakSyal: [],
    diamSejak: 0,
    terlihatSejak: new Map(),
    tTerakhirGulir: 0
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
   *  GEOMETRI PANGGUNG (koordinat dokumen)
   * ================================================================= */
  function ukurAktor() {
    const w = innerWidth;
    S.Hn = klem(w * .052, 50, 72);
    S.k = S.Hn / 128; S.B = 58.5 * S.k;
    S.Hp = S.Hn * 1.04; S.kp = S.Hp / 122; S.Bp = 58.5 * S.kp;
    AK.g = { k: S.k, kp: S.kp };
  }
  function kotak(el) {
    const r = el.getBoundingClientRect();
    return { kiri: r.left + scrollX, kanan: r.right + scrollX, atas: r.top + scrollY, bawah: r.bottom + scrollY, lebar: r.width, tinggi: r.height };
  }
  function geomItem(it) {
    const k = kotak(it.kartu), kv = kotak(it.chart.canvas);
    return { k, kv, tanah: k.atas };
  }
  /** Titik pijak kedua aktor di tepi atas kartu item. */
  function pijakan(it) {
    const g = geomItem(it), j = API.jangkar(it);
    const ax = j ? j.x + scrollX : (g.kv.kiri + g.kv.kanan) / 2;
    const tepi = S.Hn * .75;
    const xN = klem(ax, g.k.kiri + tepi, g.k.kanan - tepi);
    const tengah = (g.k.kiri + g.k.kanan) / 2;
    const jarakJ = Math.max(S.Hp * 1.2, g.k.lebar * .2);
    let xJ = xN > tengah ? g.k.kiri + jarakJ : g.k.kanan - jarakJ;
    if (Math.abs(xJ - xN) < S.Hn * 1.4) xJ = xN + (xN > tengah ? -1 : 1) * S.Hn * 1.6;
    return { xN, xJ: klem(xJ, g.k.kiri + S.Hp * .5, g.k.kanan - S.Hp * .5), y: g.tanah, g };
  }
  /** Seberapa terlihat kanvas grafik (0..1) di viewport, dikurangi bilah atas. */
  function terlihat(it) {
    const r = it.chart.canvas.getBoundingClientRect();
    const atas = Math.max(r.top, batasAtas()), bawah = Math.min(r.bottom, batasBawah());
    return r.height > 0 ? klem((bawah - atas) / Math.min(r.height, innerHeight * .6), 0, 1) : 0;
  }
  function batasAtas() { const t = document.querySelector('.topbar'); return t ? Math.max(0, t.getBoundingClientRect().bottom) : 0; }
  function batasBawah() {
    const t = document.querySelector('.tabbar');
    const r = t && getComputedStyle(t).display !== 'none' ? t.getBoundingClientRect().top : innerHeight;
    return Math.min(innerHeight, r);
  }
  function aktorTerlihat() {
    if (!S.N) return false;
    const ya = (P, H) => P.y - H < scrollY + innerHeight && P.y + H > scrollY && P.x > scrollX - H && P.x < scrollX + innerWidth + H;
    return ya(S.N, S.Hn * 1.5) || ya(S.J, S.Hp * 2.2);
  }

  /* =================================================================
   *  AKSI — koreografi
   *  Setiap aksi: { jenis, t0, dur, langkah(t, u) } ; u = 0..1
   * ================================================================= */
  function mulaiAksi(jenis, dur, langkah, selesai) {
    S.aksi = { jenis, t0: performance.now(), dur, langkah, selesai };
  }

  /** Aktor masuk ke panggung: Si Peci berlari dari tepi kiri layar, Si Payung turun berpayung. */
  function aksiMasuk(it) {
    const p = pijakan(it);
    const N = S.N = poseKosongN(), J = S.J = poseKosongJ();
    const x0 = scrollX - S.Hn * 1.2;
    const dur = klem(Math.abs(p.xN - x0) / .62, 700, 1500);
    const yJ0 = scrollY + batasAtas() - S.Hp * 2.4;
    const xJ0 = p.xJ + S.Hp * 1.2;
    S.diPanggung = true;
    mulaiAksi('masuk', dur + 260, (t, u) => {
      const ms = t - S.aksi.t0;
      // Si Peci: lari, mengerem, lalu siap
      const pl = E.sineInOut(seg(ms, 0, dur));
      Object.assign(N, poseKosongN()); N.f = 1;
      if (ms < dur) { lari(N, ms); N.rot = .16; diKaki(N, lerp(x0, p.xN, pl), p.y, S.B); tambahGarisLaju(N, 1); }
      else { mendarat(N, ms - dur); N.rot = 0; diKaki(N, p.xN, p.y, S.B); }
      // Si Payung: melayang turun
      Object.assign(J, poseKosongJ());
      const pj = E.quartOut(seg(ms, 120, dur + 200));
      if (pj < 1) {
        melayang(J, ms, Math.sin(ms / 300) * .4);
        J.x = lerp(xJ0, p.xJ, pj) + Math.sin(ms / 300) * S.Hp * .15;
        J.y = lerp(yJ0, p.y - S.Bp, pj);
        J.rot = Math.cos(ms / 300) * .1; J.angin = -.6 * (1 - pj);
      } else { J.x = p.xJ; diKaki(J, p.xJ, p.y, S.Bp); }
      J.f = p.xJ > p.xN ? -1 : 1;
    }, () => { debu(p.xN, p.y, 6); aksiTarik(it); });
  }

  /** TARIK + SIHIR di satu grafik. */
  function aksiTarik(it) {
    if (it.status !== 'tahan') return aksiSorak(it);
    it.status = 'jalan';
    const N = S.N, J = S.J;
    const p = pijakan(it);
    const HENTAK = [.36, .72, 1], SEG = S.hemat ? 480 : 540, ANC = .42;
    const T_LEMPAR = 320, T_TARIK = T_LEMPAR + SEG * HENTAK.length, DUR = T_TARIK + 760;
    const T_SIHIR = 520, D_SIHIR = 1350;
    let tahapLalu = -1, tTuntas = false;
    const kv = p.g.kv;
    const rMaks = Math.hypot(kv.lebar, kv.tinggi) * 1.05;
    // titik sihir: tengah-atas kanvas (koordinat lokal kanvas)
    const mxL = kv.lebar * (p.xJ > p.xN ? .7 : .3), myL = kv.tinggi * .35;
    API.warna(it, 0, mxL, myL);
    mulaiAksi('tarik', DUR, (t) => {
      const ms = t - S.aksi.t0;
      const j = API.jangkar(it);
      const jd = j ? { x: j.x + scrollX, y: j.y + scrollY } : { x: p.xN, y: p.y + 40 };
      /* -------- Si Peci -------- */
      Object.assign(N, poseKosongN());
      N.f = jd.x >= p.xN ? 1 : -1;
      N.tali = null;
      if (ms < T_LEMPAR) {                                  // lempar tali
        const u = ms / T_LEMPAR;
        N.aR = -HALF - .6 + 2.2 * E.backOut(u); N.aL = HALF + .6;
        N.mata = 'tekad';
        diKaki(N, p.xN, p.y, S.B);
        const tg = keDunia(N, 93, 60, S.k, 60, 72);
        N.tali = { a: tg, b: { x: lerp(tg.x, jd.x, E.expoOut(u)), y: lerp(tg.y, jd.y, E.expoOut(u)) }, lendut: 1 - u * .6 };
      } else if (ms < T_TARIK) {                            // tiga sentakan
        const tt = ms - T_LEMPAR, s = Math.min(HENTAK.length - 1, Math.floor(tt / SEG));
        const u = (tt - s * SEG) / SEG;
        let lendut;
        if (u < ANC) {                                      // ancang-ancang: menunduk, tali menegang
          const kk = E.sineInOut(u / ANC);
          N.sy = 1 - .16 * kk; N.sx = 1 + .12 * kk; N.rot = -N.f * .2 * kk;
          lendut = .3 * (1 - kk);
        } else {                                            // sentak!
          if (s !== tahapLalu) { tahapLalu = s; API.tahap(it, HENTAK[s], Math.round(SEG * (1 - ANC)), 'easeOutBack'); debu(p.xN, p.y, 7, N.f > 0 ? PI : 0); }
          const kk = (u - ANC) / (1 - ANC), lent = Math.max(0, 1 - kk * 1.6);
          N.sy = 1 + .14 * lent; N.sx = 1 - .08 * lent; N.rot = -N.f * (.32 * lent);
          N.mata = 'tekad';
          lendut = 0;
        }
        diKaki(N, p.xN - N.f * 4 * S.k * (u < ANC ? 1 : 0), p.y, S.B);
        const pegang = keDunia(N, 60 + 34, 66, S.k, 60, 72);
        N.tL = N.tR = { x: lerp(pegang.x, jd.x, .14), y: lerp(pegang.y, jd.y, .14) };
        N.depan = true;
        N.tali = { a: N.tR, b: jd, lendut };
      } else {                                              // tali dilepas, bersorak
        const u = seg(ms, T_TARIK, DUR);
        if (!tTuntas && ms > T_TARIK + 220) { tTuntas = true; API.tuntas(it, { simpanTabir: true }); }
        const lompat = busur(seg(ms, T_TARIK + 120, T_TARIK + 560));
        N.mata = 'senang'; N.aL = -HALF - .7; N.aR = -HALF + .7;
        diKaki(N, p.xN, p.y - lompat * S.Hn * .45, S.B);
        if (lompat > 0) { N.kL = [-4, -10 * lompat]; N.kR = [4, -10 * lompat]; }
        if (u < .25) N.tali = { a: keDunia(N, 93, 60, S.k, 60, 72), b: { x: lerp(jd.x, N.x, E.expoOut(u * 4)), y: lerp(jd.y, N.y, E.expoOut(u * 4)) }, lendut: .8 };
      }
      N.lx = N.f * 2; N.ly = 3;
      /* -------- Si Payung -------- */
      Object.assign(J, poseKosongJ());
      J.f = jd.x >= p.xJ ? 1 : -1;
      diKaki(J, p.xJ, p.y, S.Bp);
      const tv = { x: kv.kiri + mxL, y: kv.atas + myL };
      if (ms < T_SIHIR) {                                   // payung dibuka & diangkat
        const u = E.backOut(ms / T_SIHIR);
        J.uDepan = true; J.hx = lerp(112, 96, u); J.hy = lerp(130, 58, u); J.uA = lerp(-.33, .25, u);
        J.buka = lerp(.6, 1, u); J.putar = ms * .004; J.mata = 'normal';
      } else if (ms < T_SIHIR + D_SIHIR) {                  // sihir: payung berputar, bintang melesat
        const u = (ms - T_SIHIR) / D_SIHIR;
        J.uDepan = true; J.hx = 96; J.hy = 58 + Math.sin(ms / 70) * 2; J.uA = .25 + Math.sin(ms / 160) * .12;
        J.putar = ms * .004 + TAU * 3 * E.sineInOut(u); J.mata = 'senang'; J.mulut = 'o';
        J.tL = tv; J.sy = 1 + Math.sin(ms / 90) * .02;
        const ujung = ujungPayung(J);
        // percikan bintang dari ujung payung ke titik sihir
        if (Math.random() < (S.hemat ? .35 : .8)) {
          const dx = tv.x - ujung.x, dy = tv.y - ujung.y, d = Math.hypot(dx, dy) || 1, v = 380 + Math.random() * 160;
          bintang(ujung.x, ujung.y, dx / d * v + (Math.random() - .5) * 80, dy / d * v - 60 - Math.random() * 60,
            Math.min(900, d / v * 1000 + 160), 2.4 + Math.random() * 2.4, Math.random() < .3 ? '#F7A6C3' : W_.emas);
        }
        // warna merekah dari titik sihir (mulai sesudah bintang pertama sampai)
        const r = rMaks * E.sineInOut(seg(u, .18, 1));
        API.warna(it, r, mxL, myL);
        S.cincin = { it, x: tv.x, y: tv.y, r, a: 1 - seg(u, .85, 1), kv };
      } else {                                              // bersorak, kelopak
        if (S.cincin) { S.cincin = null; API.warna(it, rMaks * 2, mxL, myL); kelopakDi(ujungPayung(J).x, ujungPayung(J).y, 12); }
        const u = seg(ms, T_SIHIR + D_SIHIR, DUR);
        J.uDepan = true; J.hx = 96; J.hy = 58; J.uA = .25 * (1 - u); J.putar = ms * .004; J.mata = 'senang'; J.mulut = 'senang';
        J.y -= busur(u) * S.Hp * .25;
      }
    }, () => {
      S.cincin = null;
      API.tuntas(it);                                        // pasti utuh + tabir dilepas
      aksiSorak(it);
    });
  }

  function aksiSorak(it) {
    it.status = 'selesai';
    S.selesai = it;
    S.aksi = null;                                           // pilih langkah berikutnya
  }

  /** LONCAT: salto ke grafik lain. Si Payung melayang menyusul. */
  function aksiLoncat(it) {
    const N = S.N, J = S.J;
    const p = pijakan(it);
    const a = { x: N.x, y: N.y + S.B }, b = { x: p.xN, y: p.y };
    const aJ = { x: J.x, y: J.y + S.Bp }, bJ = { x: p.xJ, y: p.y };
    const tinggi = Math.max(S.Hn * 1.6, Math.min(innerHeight * .35, Math.abs(b.y - a.y) * .35 + S.Hn * 1.4));
    const ANC = 180, DUR = S.hemat ? 820 : 900, DJ = DUR + 260;
    N.f = b.x >= a.x ? 1 : -1;
    mulaiAksi('loncat', DJ + 160, (t) => {
      const ms = t - S.aksi.t0;
      Object.assign(N, poseKosongN()); N.f = b.x >= a.x ? 1 : -1;
      if (ms < ANC) { const kk = E.sineInOut(ms / ANC); N.sy = 1 - .22 * kk; N.sx = 1 + .14 * kk; diKaki(N, a.x, a.y, S.B); }
      else if (ms < ANC + DUR) {
        const u = (ms - ANC) / DUR;
        udara(N, u, 1);
        N.x = lerp(a.x, b.x, E.sineInOut(u));
        N.y = lerp(a.y, b.y, u) - busur(u) * tinggi - S.B;
        if (u < .1) debu(a.x, a.y, 4);
        N.mata = u < .5 ? 'tekad' : 'senang';
      } else { mendarat(N, ms - ANC - DUR); diKaki(N, b.x, b.y, S.B); if (!N._debu) { N._debu = 1; debu(b.x, b.y, 7); } }
      // Si Payung
      Object.assign(J, poseKosongJ());
      const uj = seg(ms, 120, DJ);
      if (uj <= 0) diKaki(J, aJ.x, aJ.y, S.Bp);
      else if (uj < 1) {
        const e = E.sineInOut(uj);
        melayang(J, ms, (bJ.x - aJ.x) > 0 ? .5 : -.5);
        J.x = lerp(aJ.x, bJ.x, e);
        J.y = lerp(aJ.y, bJ.y, e) - busur(uj) * tinggi * .8 - S.Bp;
        J.rot = (bJ.x > aJ.x ? 1 : -1) * .12 * busur(uj); J.angin = (bJ.x > aJ.x ? -1 : 1) * .6;
      } else diKaki(J, bJ.x, bJ.y, S.Bp);
      J.f = p.xJ > p.xN ? -1 : 1;
    }, () => { N._debu = 0; aksiTarik(it); });
  }

  /** Letakkan aktor tepat di luar tepi layar terdekat (tetap di kolom yang sama). */
  function pindahKeTepiLayar() {
    const N = S.N, J = S.J, atas = (N.y + S.B) < scrollY;
    const yTepi = atas ? scrollY + batasAtas() - S.Hn * .2 : scrollY + batasBawah() + S.Hn * 1.2;
    const xN = klem(N.x, scrollX + S.Hn, scrollX + innerWidth - S.Hn);
    N.x = xN; N.y = yTepi - S.B;
    J.x = klem(J.x, scrollX + S.Hp, scrollX + innerWidth - S.Hp); J.y = yTepi - S.Bp - S.Hp * .4;
    S.selesai = null;
  }

  /** GELINCIR: berlari ke tepi kartu, lalu meluncur turun ke kartu berikutnya. */
  function aksiGelincir(it, dariLuar = false) {
    const N = S.N, J = S.J;
    const p = pijakan(it);
    const a = { x: N.x, y: N.y + S.B };
    const kKini = S.selesai ? geomItem(S.selesai).k : { kiri: a.x - 100, kanan: a.x + 100 };
    // tepi kartu yang paling dekat ke tujuan (dan masih di layar)
    const keKanan = p.xN >= (kKini.kiri + kKini.kanan) / 2;
    const xTepi = dariLuar ? a.x : klem(keKanan ? kKini.kanan - S.Hn * .3 : kKini.kiri + S.Hn * .3, scrollX + S.Hn, scrollX + innerWidth - S.Hn);
    const tepi = { x: xTepi, y: a.y };
    const b = { x: p.xN, y: p.y };
    const DL = klem(Math.abs(tepi.x - a.x) / .7, 160, 700);
    const DS = klem(Math.hypot(b.x - tepi.x, b.y - tepi.y) / 1.1, 520, 1150);
    const ruas = { x: tepi.x + (keKanan ? 1 : -1) * S.Hn * .6, y: tepi.y + S.Hn * .2 };
    const DUR = DL + DS + 220;
    const aJ = { x: J.x, y: J.y + S.Bp }, bJ = { x: p.xJ, y: p.y };
    mulaiAksi('gelincir', DUR + 300, (t) => {
      const ms = t - S.aksi.t0;
      Object.assign(N, poseKosongN());
      if (ms < DL) {                                         // lari ke tepi
        N.f = tepi.x >= a.x ? 1 : -1; lari(N, ms, 90); N.rot = .16 * N.f;
        diKaki(N, lerp(a.x, tepi.x, E.sineInOut(ms / DL)), a.y, S.B);
        tambahGarisLaju(N, N.f);
      } else if (ms < DL + DS) {                             // meluncur (kurva kuadrat lewat bibir kartu)
        const u = E.quadIn(Math.min(1, (ms - DL) / DS) * .85 + .15 * Math.min(1, (ms - DL) / DS));
        const q = (s) => ({ x: (1 - s) * (1 - s) * tepi.x + 2 * (1 - s) * s * ruas.x + s * s * b.x,
                            y: (1 - s) * (1 - s) * tepi.y + 2 * (1 - s) * s * ruas.y + s * s * b.y });
        const pt = q(u), pt2 = q(Math.min(1, u + .02));
        const sud = Math.atan2(pt2.y - pt.y, pt2.x - pt.x);
        N.f = pt2.x >= pt.x ? 1 : -1;
        N.rot = (N.f > 0 ? sud : sud - PI) * .55;
        N.kL = [14, -6]; N.kR = [18, -3];                    // kaki ke depan, duduk meluncur
        N.aL = -HALF - .9; N.aR = -HALF + .9;                 // tangan ke atas: "wiii!"
        N.sy = .9; N.sx = 1.06; N.sarung = -.25 * N.f;
        N.mata = u < .55 ? 'kaget' : 'senang';
        N.x = pt.x; N.y = pt.y - S.B * .82;
        if (Math.random() < (S.hemat ? .25 : .6)) tambahPartikel({ j: 'garis', x: N.x - Math.cos(sud) * S.Hn * .5, y: N.y + S.B * .6,
          dx: Math.cos(sud) * S.Hn * .9, dy: Math.sin(sud) * S.Hn * .9, umur: 260, t0: performance.now() });
      } else {                                               // mendarat
        if (!N._debu) { N._debu = 1; debu(b.x, b.y, 8); }
        N.f = b.x >= tepi.x ? 1 : -1;
        mendarat(N, ms - DL - DS); diKaki(N, b.x, b.y, S.B); N.mata = 'senang';
      }
      // Si Payung: berpayung turun (parasut) mengikuti dengan sedikit tertinggal
      Object.assign(J, poseKosongJ());
      const uj = seg(ms, DL * .6, DUR + 120);
      if (uj <= 0) diKaki(J, aJ.x, aJ.y, S.Bp);
      else if (uj < 1) {
        const e = E.sineInOut(uj);
        melayang(J, ms, Math.sin(ms / 260) * .5);
        J.x = lerp(aJ.x, bJ.x, e) + Math.sin(ms / 260) * S.Hp * .25;
        J.y = lerp(aJ.y, bJ.y, E.quartOut(uj)) - S.Bp - busur(uj) * S.Hp * .4;
        J.rot = Math.cos(ms / 260) * .12; J.angin = -.5;
      } else diKaki(J, bJ.x, bJ.y, S.Bp);
      J.f = p.xJ > p.xN ? -1 : 1;
    }, () => { N._debu = 0; aksiTarik(it); });
  }

  /** ASAP: grafik berikutnya jauh / aktor tak terlihat — muncul dari kepulan asap. */
  function aksiAsap(it) {
    const N = S.N || (S.N = poseKosongN()), J = S.J || (S.J = poseKosongJ());
    const p = pijakan(it);
    const lamaN = { x: N.x, y: N.y }, adaLama = S.diPanggung && aktorTerlihat();
    if (adaLama) asapDi(lamaN.x, lamaN.y, S.Hn * .9);
    const DUR = 760;
    S.diPanggung = true;
    let muncul = false;
    mulaiAksi('asap', DUR, (t) => {
      const ms = t - S.aksi.t0;
      Object.assign(N, poseKosongN());
      const u = seg(ms, 240, 520);
      if (!muncul && ms >= 240) { muncul = true; asapDi(p.xN, p.y - S.B, S.Hn * 1.1); }
      N.a = u; N.sy = lerp(.5, 1, E.backOut(u)); N.sx = 1 + (1 - N.sy) * .8;
      N.mata = 'tekad'; diKaki(N, p.xN, p.y, S.B);
      Object.assign(J, poseKosongJ());
      const uj = E.quartOut(seg(ms, 80, DUR));
      melayang(J, ms, 0);
      J.x = p.xJ; J.y = lerp(scrollY + batasAtas() - S.Hp * 2, p.y - S.Bp, uj);
      if (uj >= 1) { Object.assign(J, poseKosongJ()); diKaki(J, p.xJ, p.y, S.Bp); }
      J.f = p.xJ > p.xN ? -1 : 1;
    }, () => aksiTarik(it));
  }

  /** Diam di tempat: bernapas, berkedip, menoleh ke arah gulir. */
  function poseDiam(t) {
    const N = S.N, J = S.J; if (!N || !J) return;
    const ka = S.selesai ? pijakan(S.selesai) : null;
    const fx = N.x, fy = ka ? ka.y : N.y + S.B;
    const fJx = J.x, fJy = ka ? ka.y : J.y + S.Bp;
    const fN = N.f, fJ = J.f;
    Object.assign(N, poseKosongN()); N.f = fN;
    N.sy = 1 + Math.sin(t / 420) * .025; N.mata = (t % 3400) < 140 ? 'pejam' : 'normal';
    N.ly = S.arahGulir > 0 ? 4 : S.arahGulir < 0 ? -4 : 1;
    N.aL = HALF + .5; N.aR = HALF - .5;
    diKaki(N, fx, fy, S.B);
    Object.assign(J, poseKosongJ()); J.f = fJ;
    J.putar = t * .0012; J.sy = 1 + Math.sin(t / 470 + 1) * .02;
    J.mata = ((t + 1700) % 3800) < 140 ? 'pejam' : 'normal';
    J.ly = N.ly;
    diKaki(J, fJx, fJy, S.Bp);
  }

  function tambahGarisLaju(P, arah) {
    if (S.hemat || Math.random() > .35) return;
    tambahPartikel({ j: 'garis', x: P.x - arah * S.Hn * .4, y: P.y + (Math.random() - .3) * S.Hn * .5,
      dx: arah * S.Hn * .7, dy: 0, umur: 220, t0: performance.now() });
  }

  /* =================================================================
   *  SUTRADARA — memilih grafik berikutnya mengikuti gulir
   * ================================================================= */
  const BATAS_TUNGGU = 6000;
  function urutkanAntre() {
    S.antre = S.antre.filter(it => !it.mati && it.chart && it.chart.canvas.isConnected);
    S.antre.sort((a, b) => {
      const ra = a.kartu.getBoundingClientRect(), rb = b.kartu.getBoundingClientRect();
      return Math.abs(ra.top - rb.top) > 30 ? ra.top - rb.top : ra.left - rb.left;
    });
  }
  function rapikanTerlewat(kini) {
    for (const it of S.antre) {
      if (it.status !== 'tahan') continue;
      const r = it.chart.canvas.getBoundingClientRect();
      if (r.bottom < batasAtas() - 40) { API.tuntas(it, { animasi: true }); continue; }    // tergulir lewat
      const v = terlihat(it);
      if (v > .2) {
        if (!S.terlihatSejak.has(it)) S.terlihatSejak.set(it, kini);
        else if (kini - S.terlihatSejak.get(it) > BATAS_TUNGGU && S.target !== it) API.tuntas(it, { animasi: true });
      }
    }
  }
  function pilihTarget() {
    const kandidat = S.antre.filter(it => it.status === 'tahan' && terlihat(it) > .35);
    if (!kandidat.length) return null;
    if (!S.selesai) return kandidat[0];
    // utamakan grafik berikutnya dalam urutan halaman
    const iKini = S.antre.indexOf(S.selesai);
    return kandidat.find(it => S.antre.indexOf(it) > iKini) || kandidat[0];
  }
  function jalankanBerikut() {
    const it = pilihTarget();
    if (!it) return false;
    S.target = it;
    if (!S.diPanggung || !S.N) { aksiMasuk(it); return true; }
    // Aktor tertinggal di luar layar (pengguna menggulir): mereka "datang" dari
    // tepi layar terdekat — meluncur turun / meloncat naik — bukan menghilang.
    let dariLuar = false;
    if (!aktorTerlihat()) { pindahKeTepiLayar(); dariLuar = true; }
    const p = pijakan(it);
    const dx = p.xN - S.N.x, dy = p.y - (S.N.y + S.B);
    if (!dariLuar && Math.abs(dy) > innerHeight * 1.4) { aksiAsap(it); return true; }
    const sebelah = Math.abs(dy) < 60 && Math.abs(dx) > S.Hn * 2;
    const g = S.giliran++;
    if (sebelah || dy < -20 || g % 2 === 0) aksiLoncat(it);
    else aksiGelincir(it, dariLuar);
    return true;
  }

  /* =================================================================
   *  LOOP
   * ================================================================= */
  function pastikanKanvas() {
    if (S.kanvas && S.kanvas.isConnected) return;
    const cv = document.createElement('canvas');
    cv.className = 'pg-kanvas';
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
    S.lebar = innerWidth; S.tinggi = innerHeight;
    S.kanvas.width = Math.round(S.lebar * S.dpr); S.kanvas.height = Math.round(S.tinggi * S.dpr);
    S.kanvas.style.width = S.lebar + 'px'; S.kanvas.style.height = S.tinggi + 'px';
    ukurAktor();
  }
  function bangunkan() { if (!S.raf && S.hidup) { S.lalu = performance.now(); S.raf = requestAnimationFrame(langkah); } }

  function langkah(kini) {
    S.raf = 0;
    if (!S.hidup || API.view() !== 'dashboard') return hentikan();
    if (document.hidden) return;                              // visibilitychange membangunkan lagi
    const dt = Math.min(.05, (kini - S.lalu) / 1000); S.lalu = kini;
    if (S.hemat && kini - S.gambarLalu < 32) { S.raf = requestAnimationFrame(langkah); return; }
    S.gambarLalu = kini;
    try {
      urutkanAntre();
      rapikanTerlewat(kini);
      if (!S.aksi) {
        if (jalankanBerikut()) S.diamSejak = 0;
        else if (!S.diamSejak) S.diamSejak = kini;
      }
      if (S.aksi) {
        const a = S.aksi, u = Math.min(1, (kini - a.t0) / a.dur);
        a.langkah(kini, u);
        if (u >= 1 && S.aksi === a) { S.aksi = null; a.selesai && a.selesai(); }
      } else poseDiam(kini);
      if (S.N) { S.jejakSyal.unshift(keDunia(S.N, 17, 73, S.k, 60, 72)); if (S.jejakSyal.length > 18) S.jejakSyal.length = 18; }
      gambar(kini, dt);
    } catch (e) {
      console.warn('panggung berhenti:', e.message);
      API.lepasSemua('galat panggung');
      return hentikan();
    }
    // Berhenti total bila diam > 2,5 dtk tanpa partikel, atau aktor tak terlihat & tak ada aksi.
    const diamLama = !S.aksi && S.diamSejak && kini - S.diamSejak > 2500 && !S.partikel.length;
    const adaTahan = S.antre.some(it => it.status === 'tahan');
    if (diamLama && !adaTahan) return;                        // semua beres → tidur (gulir membangunkan)
    if (diamLama && !aktorTerlihat()) return;
    S.raf = requestAnimationFrame(langkah);
  }

  function gambar(kini, dt) {
    const c = S.ctx; ca = c;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, S.kanvas.width, S.kanvas.height);
    if (!S.N) return;
    c.setTransform(S.dpr, 0, 0, S.dpr, -scrollX * S.dpr, -scrollY * S.dpr);
    // cincin sihir (dipotong di kanvas grafik)
    if (S.cincin && S.cincin.r > 2) {
      const r = S.cincin, kv = kotak(r.it.chart.canvas);
      c.save(); c.beginPath(); c.rect(kv.kiri, kv.atas, kv.lebar, kv.tinggi); c.clip();
      c.globalAlpha = .55 * r.a; c.strokeStyle = W_.kuninganHi; c.lineWidth = 3;
      c.beginPath(); c.arc(r.x, r.y, r.r, 0, TAU); c.stroke();
      c.fillStyle = W_.emas;
      const n = S.hemat ? 10 : 22;
      for (let i = 0; i < n; i++) {
        const a = i / n * TAU + kini / 900;
        c.globalAlpha = r.a * (.5 + .5 * Math.sin(kini / 80 + i));
        bintangKecil(r.x + Math.cos(a) * r.r, r.y + Math.sin(a) * r.r, 3.4);
      }
      c.restore();
    }
    if (S.N.tali) tali(S.N.tali.a, S.N.tali.b, S.N.tali.lendut);
    // bayangan di tanah
    for (const [P, B, H] of [[S.J, S.Bp, S.Hp], [S.N, S.B, S.Hn]]) {
      if (!P || P.a <= 0) continue;
      c.save(); c.globalAlpha = .16 * P.a; c.fillStyle = '#0B2B45';
      c.beginPath(); c.ellipse(P.x, P.y + B * P.sy + 2, H * .34, H * .07, 0, 0, TAU); c.fill(); c.restore();
    }
    gambarPayung(S.J, kini);
    if (S.cincin) {                                           // cahaya di ujung payung saat menyihir
      const u = ujungPayung(S.J), A = asetAktor(), s = S.Hp * (.5 + .12 * Math.sin(kini / 60));
      c.save(); c.globalAlpha = .9; c.drawImage(A.cahaya, u.x - s, u.y - s, s * 2, s * 2); c.restore();
    }
    gambarNinja(S.N, kini);
    langkahPartikel(dt, kini);
    c.globalAlpha = 1;
  }

  /* =================================================================
   *  API
   * ================================================================= */
  function daftar(it) {
    if (!S.hidup) mulaiUlang();
    if (it && !S.antre.includes(it)) S.antre.push(it);
    pastikanKanvas();
    tungguLayar(bangunkan);
  }
  /** Jangan bermain di balik layar muat / gerbang masuk. */
  function tungguLayar(fn) {
    const tertutup = () => (typeof layarTertutup === 'function' ? layarTertutup() : false);
    if (!tertutup()) return fn();
    const t0 = Date.now();
    const cek = () => { if (!tertutup() || Date.now() - t0 > 15000) fn(); else setTimeout(cek, 120); };
    setTimeout(cek, 120);
  }
  function hentikan() {
    S.hidup = false;
    if (S.raf) cancelAnimationFrame(S.raf);
    S.raf = 0;
    if (S.kanvas) S.kanvas.remove();
    S.kanvas = null; S.ctx = null;
    S.antre = []; S.target = null; S.aksi = null; S.N = null; S.J = null; S.selesai = null;
    S.diPanggung = false; S.partikel = []; S.jejakSyal = []; S.cincin = null; S.terlihatSejak = new Map();
  }
  function mulaiUlang() { S.hidup = true; S.giliran = 0; S.diamSejak = 0; }

  let yLalu = scrollY;
  addEventListener('scroll', () => {
    S.arahGulir = Math.sign(scrollY - yLalu); yLalu = scrollY;
    S.diamSejak = S.aksi ? 0 : S.diamSejak && performance.now() - S.diamSejak > 2500 ? performance.now() - 2000 : S.diamSejak;
    if (S.hidup && S.kanvas) bangunkan();
  }, { passive: true });
  addEventListener('resize', () => { if (S.kanvas) { ukurKanvas(); bangunkan(); } }, { passive: true });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && S.kanvas) bangunkan(); });

  window.RQPanggung = { daftar, hentikan, _S: S };
  // Grafik yang sudah terdaftar sebelum berkas ini selesai dimuat.
  try { API.items().forEach(daftar); } catch (e) { API.lepasSemua('daftar awal gagal'); }
})();
