/* =====================================================================
 * showreel.js — v2.47 · SHOWREEL 10 DETIK DI LAYAR MASUK
 * ---------------------------------------------------------------------
 *  Satu kanvas 2D di lapisan paling belakang #loginScreen (di atas foto
 *  dayah & .login-wash, di bawah kolom kiri dan kartu masuk). Tidak ada
 *  pustaka, tidak ada aset unduhan, tidak ada panggilan Supabase, tidak
 *  ada data santri. Semua teks statis.
 *
 *  SATU SUMBER WAKTU
 *    `waktu` dimajukan sekali per bingkai requestAnimationFrame (dibatasi
 *    100 ms per bingkai supaya bingkai macet memperlambat, bukan
 *    melompati). Setiap bingkai digambar oleh fungsi murni gambar(t),
 *    t = waktu mod 10 000. Bingkai 10 000 = bingkai 0 (keduanya gelap:
 *    hanya debu sekitar yang geraknya periodik tepat 10 detik).
 *
 *  Tidak membaca kolom isian apa pun, tidak mendengarkan ketikan. Satu-
 *  satunya pendengar: visibilitychange, matchMedia reduced-motion,
 *  ResizeObserver #loginScreen, MutationObserver kelas #loginScreen.
 *
 *  Dimuat oleh pemuat kecil di index.html HANYA saat layar masuk benar-
 *  benar tampil (layar muat tertutup, tidak ada sesi). Pengguna yang
 *  sudah masuk tidak pernah mengunduh atau menjalankan berkas ini.
 * ===================================================================== */
(function () {
  'use strict';
  if (window.RQReel) return;

  /* ---------- Konfigurasi tunggal ---------- */
  const KONFIG = {
    DURASI: 10000,
    TINGKAT: 'otomatis',          // 'otomatis' | 'penuh' | 'sedang' | 'ringan'
    AMBANG_RINGAN: 24,            // rerata ms/bingkai detik pertama > 24 → ringan
    AMBANG_SEDANG: 18,            //                                   > 18 → sedang
    MODUL: { grid: true, buka: true, ketik: true, geometri: true, data: true,
             irisan: true, merek: true, debu: true, hud: true, butir: true }
  };
  const TINGKAT = {
    penuh:  { dpr: 2,   px: 3.2e6, debu: 54, butir: true,  kabur: 3, kroma: true,  fps: 60, grid: 1,    sinar: true },
    sedang: { dpr: 1.5, px: 1.7e6, debu: 30, butir: false, kabur: 1, kroma: true,  fps: 60, grid: 1.25, sinar: true },
    ringan: { dpr: 1,   px: 0.8e6, debu: 12, butir: false, kabur: 0, kroma: false, fps: 30, grid: 1.7,  sinar: false }
  };
  const URUT = ['penuh', 'sedang', 'ringan'];

  /* ---------- Warna (selaras token index.html) ---------- */
  const W_ = {
    tinta: '#061826', navy: '#0B2B45', navy2: '#123C5E', laut: '#14618B', lautHi: '#1B7AAD',
    langit: '#5FB4E0', pucat: '#CFE3F0', kuningan: '#C9A227', kuninganHi: '#E8CC6B',
    emas: '#F2C94C', putih: '#F4F7FA'
  };
  const F = {
    sans: "'Inter Tight', system-ui, -apple-system, sans-serif",
    serif: "'Instrument Serif', Georgia, serif",
    mono: "'IBM Plex Mono', ui-monospace, monospace",
    ar: "'Amiri', 'Noto Naskh Arabic', serif"
  };

  /* ---------- Matematika gerak ---------- */
  const TAU = Math.PI * 2;
  const seg = (t, a, b) => t <= a ? 0 : t >= b ? 1 : (t - a) / (b - a);
  const lerp = (a, b, p) => a + (b - a) * p;
  const E = {
    expoOut: x => x >= 1 ? 1 : 1 - Math.pow(2, -10 * x),
    expoIn: x => x <= 0 ? 0 : Math.pow(2, 10 * x - 10),
    expoInOut: x => x <= 0 ? 0 : x >= 1 ? 1 : x < .5 ? Math.pow(2, 20 * x - 10) / 2 : (2 - Math.pow(2, -20 * x + 10)) / 2,
    backOut: x => { const s = 1.70158; return 1 + (s + 1) * Math.pow(x - 1, 3) + s * Math.pow(x - 1, 2); },
    backIn: x => { const s = 1.70158; return (s + 1) * x * x * x - s * x * x; },
    // pegas lembut: lewat ±13 %, lalu mengendap
    elastis: x => x <= 0 ? 0 : x >= 1 ? 1 : 1 - Math.exp(-6.5 * x) * Math.cos(x * Math.PI * 3.2),
    sineInOut: x => -(Math.cos(Math.PI * x) - 1) / 2,
    quartOut: x => 1 - Math.pow(1 - x, 4)
  };
  const acak = (i) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

  /* ---------- Keadaan ---------- */
  const R = {
    hidup: false, jalan: false, poster: false, raf: 0, akhir: 0, waktu: 0, bingkai: 0,
    beku: null, tingkat: 'penuh', tingkatAwal: 'penuh', sebab: 'bawaan',
    ukur: [], ukurSelesai: false, jendela: [], tataVer: 0, gambarMs: [],
    scr: null, kanvas: null, ctx: null, mo: null, ro: null, mq: null,
    lebarLalu: 0, tinggiLalu: 0, tundaTata: 0, lebarCache: new Map(), sprite: {}
  };
  let ctx = null, L = null;   // L = tata letak (CSS px)

  /* =================================================================
   *  TATA LETAK — dihitung saat mulai, saat lebar berubah, atau saat
   *  tinggi berubah TANPA kolom isian berfokus (= bukan papan ketik HP).
   * ================================================================= */
  function rel(el, b) {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (!r.width && !r.height) return null;
    return { x: r.left - b.left, y: r.top - b.top, w: r.width, h: r.height, b: r.bottom - b.top, r: r.right - b.left };
  }
  function hitungTata() {
    const scr = R.scr, b = scr.getBoundingClientRect();
    const Wc = Math.max(1, Math.round(scr.clientWidth)), Hc = Math.max(1, Math.round(scr.offsetHeight));
    const art = rel(scr.querySelector('.login-art'), b);
    const merek = rel(scr.querySelector('.brandmark'), b);
    const tapak = rel(scr.querySelector('.login-tapak'), b);
    const kartu = rel(scr.querySelector('.login-card'), b);
    const pang = rel(document.getElementById('lpPanggung'), b);
    const sempit = Wc <= 900;
    let x0, x1, y0, y1;
    if (!sempit && art) {
      x0 = art.x + 46; x1 = art.r - 30;
      y0 = (merek ? merek.b : art.y + 100) + 26;
      y1 = (tapak && tapak.h > 4 ? tapak.y : art.b - 52) - 18;
    } else {
      x0 = 16; x1 = Wc - 16;
      y0 = (merek ? merek.b : 80) + 14;
      const bawah = pang ? pang.y + pang.h * 0.12 : (kartu ? kartu.y : Hc * 0.5);
      y1 = bawah - 8;
    }
    if (y1 - y0 < 90) { y0 = Math.max(4, y1 - 90); }
    const w = Math.max(120, x1 - x0), h = Math.max(80, y1 - y0);
    return { W: Wc, H: Hc, sempit, S: { x: x0, y: y0, w, h, cx: x0 + w / 2, cy: y0 + h / 2 }, u: Math.min(w, h) };
  }

  function pasangResolusi() {
    const t = TINGKAT[R.tingkat];
    const dpr = Math.min(window.devicePixelRatio || 1, t.dpr);
    const k = Math.min(dpr, Math.sqrt(t.px / (L.W * L.H)));
    L.k = Math.max(0.5, k);
    const bw = Math.round(L.W * L.k), bh = Math.round(L.H * L.k);
    if (R.kanvas.width !== bw) R.kanvas.width = bw;
    if (R.kanvas.height !== bh) R.kanvas.height = bh;
    R.scr.dataset.reel = R.poster ? 'poster' : R.tingkat;
  }

  function tataUlang() {
    L = hitungTata();
    R.lebarLalu = L.W; R.tinggiLalu = L.H;
    R.lebarCache.clear();
    hitungUkuranTeks();
    pasangResolusi();
    buatSprite();
    R.tataVer++;
  }

  /* ---------- Ukuran teks per tata letak ---------- */
  function lebar(font, s) {
    const k = font + '|' + s;
    let v = R.lebarCache.get(k);
    if (v === undefined) { ctx.font = font; v = ctx.measureText(s).width; R.lebarCache.set(k, v); }
    return v;
  }
  /** Posisi x tiap huruf (kerning bawaan ikut terhitung lewat prefiks). */
  function posHuruf(font, s) {
    const k = '#pos|' + font + '|' + s;
    let v = R.lebarCache.get(k);
    if (!v) { v = []; for (let i = 0; i < s.length; i++) v.push(lebar(font, s.slice(0, i))); v.push(lebar(font, s)); R.lebarCache.set(k, v); }
    return v;
  }
  const fSans = (px, w = 800) => `${w} ${px.toFixed(1)}px ${F.sans}`;
  function hitungUkuranTeks() {
    const S = L.S;
    ctx.font = fSans(100);
    const wP = ctx.measureText('PRESTASI.').width || 560;
    L.fsKata = Math.max(26, Math.min(100 * S.w * 0.88 / wP, S.h * 0.34, 190));
    const wC = ctx.measureText('chemint').width || 420;
    L.fsMerek = Math.max(34, Math.min(100 * S.w * 0.8 / (wC * 1.0), S.h * 0.36, 230));
    ctx.font = fSans(100);
    const wI = ctx.measureText('PANTAU.').width || 460;
    L.fsIris = Math.max(20, Math.min(S.h * 0.24 * 0.74, 100 * S.w * 0.72 / wI, 150));
    L.fsKecil = Math.max(9, Math.min(11.5, S.w / 44));
  }

  /* ---------- Sprite pra-render (dibuat ulang hanya saat tata berubah) ---------- */
  function kanvasKecil(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function buatSprite() {
    const sp = R.sprite;
    const pijar = (warna) => {
      const c = kanvasKecil(64, 64), g = c.getContext('2d');
      const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, warna); gr.addColorStop(.25, warna.replace(/[\d.]+\)$/, '.45)')); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return c;
    };
    if (!sp.pijarEmas) {
      sp.pijarEmas = pijar('rgba(242,201,76,1)');
      sp.pijarLangit = pijar('rgba(140,200,235,1)');
      sp.pijarPutih = pijar('rgba(244,247,250,1)');
      // girih: dua persegi & belah ketupat — motif bintang delapan aplikasi
      const g1 = kanvasKecil(96, 96), a = g1.getContext('2d');
      a.strokeStyle = 'rgba(207,227,240,.55)'; a.lineWidth = 1;
      a.beginPath(); a.moveTo(48, 0); a.lineTo(96, 48); a.lineTo(48, 96); a.lineTo(0, 48); a.closePath();
      a.rect(14, 14, 68, 68); a.stroke();
      a.beginPath(); a.arc(48, 48, 12, 0, TAU); a.stroke();
      sp.girih = g1;
      // songket: belah ketupat bersusun (abstrak), tanpa gambar makhluk
      const g2 = kanvasKecil(40, 40), s = g2.getContext('2d');
      s.strokeStyle = 'rgba(255,255,255,.9)'; s.lineWidth = 1.2;
      s.beginPath(); s.moveTo(20, 4); s.lineTo(36, 20); s.lineTo(20, 36); s.lineTo(4, 20); s.closePath(); s.stroke();
      s.beginPath(); s.moveTo(20, 13); s.lineTo(27, 20); s.lineTo(20, 27); s.lineTo(13, 20); s.closePath();
      s.fillStyle = 'rgba(255,255,255,.9)'; s.fill();
      sp.songket = g2;
      // butir film
      const g3 = kanvasKecil(128, 128), n = g3.getContext('2d'), im = n.createImageData(128, 128);
      for (let i = 0; i < im.data.length; i += 4) { const v = acak(i * .37) * 255; im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = 255; }
      n.putImageData(im, 0, 0);
      sp.butir = g3;
    }
    sp.polaGirih = ctx.createPattern(sp.girih, 'repeat');
    sp.polaSongket = ctx.createPattern(sp.songket, 'repeat');
    sp.polaButir = ctx.createPattern(sp.butir, 'repeat');
  }

  /* =================================================================
   *  ALAT GAMBAR
   * ================================================================= */
  function garis(x1, y1, x2, y2, w, warna, a = 1, pijar = true) {
    ctx.lineCap = 'round';
    if (pijar && R.tingkat !== 'ringan') {
      ctx.globalAlpha = a * .18; ctx.strokeStyle = warna; ctx.lineWidth = w * 5;
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    }
    ctx.globalAlpha = a; ctx.strokeStyle = warna; ctx.lineWidth = w;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    ctx.globalAlpha = 1;
  }
  function titikPijar(sprite, x, y, r, a) {
    if (a <= 0.003 || r <= 0) return;
    ctx.globalAlpha = Math.min(1, a);
    ctx.drawImage(sprite, x - r, y - r, r * 2, r * 2);
    ctx.globalAlpha = 1;
  }
  /** Poligon/polilin digambar sebagian (efek stroke-dashoffset). */
  function polilinSebagian(p, frac, tutup) {
    const n = p.length / 2, m = tutup ? n : n - 1;
    let total = 0; const pj = [];
    for (let i = 0; i < m; i++) {
      const j = (i + 1) % n, d = Math.hypot(p[j * 2] - p[i * 2], p[j * 2 + 1] - p[i * 2 + 1]);
      pj.push(d); total += d;
    }
    let sisa = total * Math.max(0, Math.min(1, frac));
    ctx.beginPath(); ctx.moveTo(p[0], p[1]);
    for (let i = 0; i < m && sisa > 0; i++) {
      const j = (i + 1) % n, f = Math.min(1, sisa / pj[i]);
      ctx.lineTo(lerp(p[i * 2], p[j * 2], f), lerp(p[i * 2 + 1], p[j * 2 + 1], f));
      sisa -= pj[i];
    }
  }
  function klipPersegi(x, y, w, h) { ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip(); }

  /* =================================================================
   *  LAPIS SEKITAR — debu periodik (aman untuk loop), HUD, butir
   * ================================================================= */
  function kameraData(t) {
    // pergeseran kamera berlapis selama beat data (dipakai juga oleh debu)
    if (t < 4500 || t > 6600) return 0;
    return -L.S.w * 0.06 * E.sineInOut(seg(t, 4500, 6300));
  }
  function lapisDebu(t) {
    if (!KONFIG.MODUL.debu) return;
    const n = TINGKAT[R.tingkat].debu, D = KONFIG.DURASI, Wc = L.W, Hc = L.H;
    const cam = kameraData(t), fase = t / D;
    for (let i = 0; i < n; i++) {
      const z = .3 + acak(i * 7.1) * .7;                     // kedalaman 0,3–1
      const k = 1 + Math.floor(acak(i * 3.3) * 2);             // putaran utuh per 10 dtk
      const bx = acak(i * 1.7) * Wc, by = acak(i * 2.9) * (Hc + 40);
      // naik tepat k kali tinggi layar per 10 dtk → posisi di detik 10 = detik 0
      let y = (by - k * fase * (Hc + 40)) % (Hc + 40);
      if (y < 0) y += Hc + 40; y -= 20;
      const x = bx + Math.sin(TAU * (fase * k) + i) * 14 * z + cam * z;
      const a = (.10 + .30 * z) * (.6 + .4 * Math.sin(TAU * fase * 2 + i * 1.3));
      const r = z > .88 && R.tingkat === 'penuh' ? 7 + z * 9 : .9 + z * 2.4;
      titikPijar(z > .88 && R.tingkat === 'penuh' ? R.sprite.pijarLangit : R.sprite.pijarPutih, x, y, r * 2.2, z > .88 ? a * .35 : a);
    }
  }
  function lapisHud(t) {
    if (!KONFIG.MODUL.hud) return;
    const a = Math.min(E.expoOut(seg(t, 700, 1100)), 1 - seg(t, 9150, 9450));
    if (a <= 0) return;
    const S = L.S, m = 12, p = E.expoOut(seg(t, 700, 1150));
    ctx.strokeStyle = W_.pucat; ctx.globalAlpha = .38 * a; ctx.lineWidth = 1;
    const sudut = [[S.x, S.y, 1, 1], [S.x + S.w, S.y, -1, 1], [S.x, S.y + S.h, 1, -1], [S.x + S.w, S.y + S.h, -1, -1]];
    ctx.beginPath();
    for (const [x, y, dx, dy] of sudut) {
      ctx.moveTo(x + dx * m * p, y); ctx.lineTo(x, y); ctx.lineTo(x, y + dy * m * p);
    }
    ctx.stroke(); ctx.globalAlpha = 1;
    if (S.w < 400 || R.poster) return;   // poster: tanpa label beat
    // label: nama beat bergulir di sudut kanan atas
    const BEAT = [[0, 'BUKA'], [1200, 'KATA'], [3000, 'GEOMETRI'], [4600, 'DATA'], [6200, 'IRISAN'], [7800, 'MEREK']];
    let i = 0; for (let j = 0; j < BEAT.length; j++) if (t >= BEAT[j][0]) i = j;
    const ganti = seg(t, BEAT[i][0], BEAT[i][0] + 260);
    const fs = L.fsKecil;
    ctx.font = `500 ${fs}px ${F.mono}`; ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic';
    ctx.save(); klipPersegi(S.x + S.w - 220, S.y - fs * 2.4, 220, fs * 1.6);
    const y = S.y - fs * 1.1, off = (1 - E.expoOut(ganti)) * fs * 1.4;
    ctx.fillStyle = W_.pucat; ctx.globalAlpha = .55 * a;
    ctx.fillText(`0${i + 1} / 06 — ${BEAT[i][1]}`, S.x + S.w, y + off);
    if (ganti < 1 && i > 0) ctx.fillText(`0${i} / 06 — ${BEAT[i - 1][1]}`, S.x + S.w, y + off - fs * 1.4);
    ctx.restore();
    ctx.textAlign = 'left'; ctx.globalAlpha = .45 * a; ctx.fillStyle = W_.pucat;
    ctx.fillText('MEULABOH · ACEH BARAT', S.x + 20, S.y + S.h - 2);   // di dalam bingkai: tidak menabrak .login-foot
    ctx.globalAlpha = 1;
  }
  function lapisButir(t) {
    if (!KONFIG.MODUL.butir || !TINGKAT[R.tingkat].butir) return;
    const o = Math.floor(t / 41.667);
    ctx.save();
    ctx.translate(-acak(o) * 128, -acak(o + 7) * 128);
    ctx.globalAlpha = .045; ctx.fillStyle = R.sprite.polaButir;
    ctx.fillRect(0, 0, L.W + 128, L.H + 128);
    ctx.restore();
  }

  /* =================================================================
   *  BEAT 0 · BUKA (0–1,2 dtk): garis menyala → titik → grid bernapas
   * ================================================================= */
  function beatBuka(t) {
    if (!KONFIG.MODUL.buka || t > 1300) return;
    const S = L.S, u = L.u, Lm = S.w * 0.46;
    let half = 0;
    if (t < 420) half = Lm * E.expoOut(t / 420);
    else if (t < 600) half = Lm * (1 - E.expoIn((t - 420) / 180));
    if (half > .4) garis(S.cx - half, S.cy, S.cx + half, S.cy, 1.5, W_.kuninganHi, 1);
    const p = seg(t, 500, 860);
    if (p > 0 && p < 1) titikPijar(R.sprite.pijarEmas, S.cx, S.cy, u * .05 * (1 + 2.2 * E.expoOut(p)), .9 * (1 - p));
    const q = seg(t, 600, 1180);
    if (q > 0 && q < 1) {
      ctx.globalAlpha = .45 * (1 - q); ctx.strokeStyle = W_.kuninganHi; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(S.cx, S.cy, u * .7 * E.expoOut(q), 0, TAU); ctx.stroke(); ctx.globalAlpha = 1;
    }
  }
  function lapisGrid(t) {
    if (!KONFIG.MODUL.grid || t < 540 || t > 3200) return;
    const S = L.S, u = L.u, g = u / 10 * TINGKAT[R.tingkat].grid;
    const fokus = E.expoOut(seg(t, 560, 1000));
    const skala = 1 + .14 * (1 - fokus);
    const aGlob = (t < 1200 ? 1 : lerp(1, .26, E.expoOut(seg(t, 1200, 1500)))) * (1 - seg(t, 2750, 3150));
    if (aGlob <= 0) return;
    const geser = t > 1200 ? -(t - 1200) * .012 : 0;
    const nx = Math.ceil(S.w / g / 2) + 1, ny = Math.ceil(S.h / g / 2) + 1;
    const dmax = Math.hypot(nx, ny);
    ctx.fillStyle = W_.pucat; ctx.globalAlpha = aGlob * (.35 + .65 * fokus);
    ctx.beginPath();
    for (let i = -nx; i <= nx; i++) for (let j = -ny; j <= ny; j++) {
      const d = Math.hypot(i, j) / dmax;
      const k = E.backOut(seg(t, 560 + d * 320, 980 + d * 320));
      if (k <= 0) continue;
      const napas = .72 + .38 * Math.sin(TAU * (t / 1500) - d * 5);
      const r = Math.max(.2, u * .0075 * k * napas * (1 + 1.8 * (1 - fokus)));
      const x = S.cx + i * g * skala + geser, y = S.cy + j * g * skala;
      if (x < S.x - g || x > S.x + S.w + g || y < S.y - g || y > S.y + S.h + g) continue;
      ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, TAU);
    }
    ctx.fill(); ctx.globalAlpha = 1;
  }

  /* =================================================================
   *  BEAT 1 · TIPOGRAFI KINETIK (1,2–3,0 dtk)
   *  Huruf naik dari balik topeng garis dasar (stagger 24 ms); ganti
   *  kata dengan sapuan bilah emas (clip), bukan pudar.
   * ================================================================= */
  const KATA = [
    { k: 'DISIPLIN', c: '01 · CATATAN KEDISIPLINAN' },
    { k: 'TAHFIZ', c: '02 · HAFALAN AL-QUR’AN' },
    { k: 'PRESTASI', c: '03 · PRESTASI & APRESIASI' }
  ];
  const T_KATA = 1200, P_KATA = 600, D_SAPU = 340;
  function sapuan(t, i) {           // posisi tepi depan bilah untuk masuknya kata i (i ≥ 1)
    const a = T_KATA + i * P_KATA - 140, p = seg(t, a, a + D_SAPU);
    const S = L.S, bw = L.fsKata * .55;
    return { p, bw, e: lerp(S.x - bw - 30, S.x + S.w + bw + 30, E.expoInOut(p)), mulai: a };
  }
  function beatKetik(t) {
    if (!KONFIG.MODUL.ketik || t < T_KATA || t > 3200) return;
    const S = L.S, fs = L.fsKata, font = fSans(fs), y0 = S.cy + fs * .30;
    const kotakY = y0 - fs * .86, kotakH = fs * 1.12;
    for (let i = 0; i < KATA.length; i++) {
      // jendela klip horizontal kata i
      let xa = -1e4, xb = 1e4;
      if (i > 0) { const s = sapuan(t, i); if (s.p <= 0) continue; if (s.p < 1) xb = s.e - s.bw; }
      if (i < KATA.length - 1) { const s = sapuan(t, i + 1); if (s.p >= 1) continue; if (s.p > 0) xa = s.e; }
      const masuk = i === 0 ? T_KATA : sapuan(t, i).mulai + 60;
      const kata = KATA[i].k, pos = posHuruf(font, kata + '.'), lw = pos[pos.length - 1];
      const x0 = S.cx - lw / 2;
      // runtuh menjadi garis di akhir beat (kata terakhir)
      let sy = 1, aKata = 1;
      if (i === KATA.length - 1) {
        const r = seg(t, 2860, 3020); sy = 1 - .985 * E.backIn(r);
        aKata = 1 - seg(t, 3020, 3060);
      }
      if (aKata <= 0) {
        const h = (lw / 2) * (1 - E.expoIn(seg(t, 3020, 3170)));
        if (h > .5) garis(S.cx - h, y0 - fs * .34, S.cx + h, y0 - fs * .34, 1.6, W_.kuninganHi, 1);
        continue;
      }
      ctx.save();
      klipPersegi(Math.max(xa, -10), kotakY - fs * .6, Math.min(xb, L.W + 10) - Math.max(xa, -10), kotakH + fs * 1.2);
      // gema garis luar di belakang (lapis kedalaman, bergerak lebih lambat)
      const umur = t - masuk;
      ctx.font = fSans(fs * 1.32); ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      ctx.globalAlpha = .10 * aKata; ctx.strokeStyle = W_.pucat; ctx.lineWidth = 1;
      ctx.strokeText(kata, S.cx + 24 - umur * .04, y0 + fs * .18);
      ctx.globalAlpha = 1;
      // huruf
      ctx.save();
      klipPersegi(-10, kotakY, L.W + 20, kotakH);
      ctx.font = font; ctx.textAlign = 'left';
      const cyH = y0 - fs * .36;
      ctx.translate(0, cyH); ctx.scale(1, sy); ctx.translate(0, -cyH);
      for (let j = 0; j < kata.length + 1; j++) {
        const p = E.expoOut(seg(t, masuk + j * 24, masuk + j * 24 + 480));
        if (p <= 0) continue;
        const ch = j < kata.length ? kata[j] : '.';
        ctx.fillStyle = j < kata.length ? W_.putih : W_.emas;
        ctx.fillText(ch, x0 + pos[j], y0 + (1 - p) * fs * 1.08);
      }
      ctx.restore();
      // keterangan mono: ketik-tulis
      if (sy > .5) {
        const c = KATA[i].c, n = Math.floor(c.length * seg(t, masuk + 140, masuk + 400));
        if (n > 0) {
          ctx.font = `500 ${L.fsKecil}px ${F.mono}`; ctx.textAlign = 'left';
          const cx = x0 + 2, cy = y0 + fs * .34 + L.fsKecil;
          ctx.fillStyle = W_.pucat; ctx.globalAlpha = .82;
          const tampil = c.slice(0, n);
          ctx.fillText(tampil, cx, cy);
          if (n < c.length) { ctx.fillStyle = W_.emas; ctx.fillRect(cx + lebar(ctx.font, tampil) + 2, cy - L.fsKecil * .8, L.fsKecil * .55, L.fsKecil * .95); }
          ctx.globalAlpha = 1;
        }
      }
      ctx.restore();
    }
    // bilah sapuan emas
    for (let i = 1; i < KATA.length; i++) {
      const s = sapuan(t, i);
      if (s.p <= 0 || s.p >= 1) continue;
      ctx.fillStyle = W_.emas;
      ctx.fillRect(s.e - s.bw, kotakY - fs * .04, s.bw, kotakH + fs * .08);
      ctx.fillStyle = W_.putih; ctx.globalAlpha = .8;
      ctx.fillRect(s.e - 2, kotakY - fs * .04, 2, kotakH + fs * .08);
      ctx.globalAlpha = 1;
    }
  }

  /* =================================================================
   *  BEAT 2 · GEOMETRI (3,0–4,6 dtk)
   *  Titik → 8 jari-jari → dua persegi tergambar (bintang delapan) →
   *  isi → morf: bintang tajam (pucuk rebung) → oktagon → lingkaran
   *  yang diserahkan ke beat data sebagai cincin luar.
   * ================================================================= */
  function bintang(cx, cy, Ro, Ri, rot) {
    const v = [];
    for (let i = 0; i < 16; i++) {
      const a = -Math.PI / 2 + rot + i * Math.PI / 8, r = i % 2 ? Ri : Ro;
      v.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
    const p = [];   // 64 titik: 4 sampel per sisi supaya morf ke lingkaran mulus
    for (let i = 0; i < 16; i++) {
      const j = (i + 1) % 16;
      for (let s = 0; s < 4; s++) p.push(lerp(v[i * 2], v[j * 2], s / 4), lerp(v[i * 2 + 1], v[j * 2 + 1], s / 4));
    }
    return p;
  }
  function keLingkaran(p, cx, cy, Rc, f) {
    if (f <= 0) return p;
    const q = new Array(p.length);
    for (let i = 0; i < p.length; i += 2) {
      const a = Math.atan2(p[i + 1] - cy, p[i] - cx);
      q[i] = lerp(p[i], cx + Math.cos(a) * Rc, f); q[i + 1] = lerp(p[i + 1], cy + Math.sin(a) * Rc, f);
    }
    return q;
  }
  const KF = [[3640, 1, .765, 0], [3900, 1.2, .42, Math.PI / 8], [4160, .9, .83, Math.PI / 4]];
  function paramMorf(t) {
    if (t <= KF[0][0]) return KF[0].slice(1);
    for (let i = 0; i < KF.length - 1; i++) {
      const a = KF[i], b = KF[i + 1];
      if (t <= b[0]) { const p = E.backOut(seg(t, a[0], a[0] + 230)); return [lerp(a[1], b[1], p), lerp(a[2], b[2], p), lerp(a[3], b[3], p)]; }
    }
    return KF[KF.length - 1].slice(1);
  }
  function tataCincin() {
    const S = L.S, lebarStage = S.w >= S.h * 1.15;
    if (lebarStage) return { lebar: true, cx: S.x + S.w * .27, cy: S.cy, R: Math.min(S.h * .34, S.w * .22),
      bx0: S.x + S.w * .53, bx1: S.x + S.w * .97, by0: S.cy - S.h * .30, by1: S.cy + S.h * .32 };
    return { lebar: false, cx: S.cx, cy: S.y + S.h * .30, R: Math.min(S.w * .26, S.h * .2),
      bx0: S.x + S.w * .1, bx1: S.x + S.w * .9, by0: S.y + S.h * .6, by1: S.y + S.h * .94 };
  }
  function beatGeometri(t) {
    if (!KONFIG.MODUL.geometri || t < 3000 || t > 4800) return;
    const S = L.S, u = L.u, R0 = u * .34, cx = S.cx, cy = S.cy;
    // pola girih latar: lapis belakang, berputar lebih lambat
    const aG = Math.min(seg(t, 3050, 3500), 1 - seg(t, 4400, 4800)) * .55;
    if (aG > 0 && R.sprite.polaGirih.setTransform && typeof DOMMatrix === 'function') {
      const m = new DOMMatrix().translate(cx, cy).rotate((t - 3000) * .006).scale(1.15 + u / 900);
      R.sprite.polaGirih.setTransform(m);
      ctx.globalAlpha = aG * .22; ctx.fillStyle = R.sprite.polaGirih;
      ctx.fillRect(S.x - 40, S.y - 40, S.w + 80, S.h + 80); ctx.globalAlpha = 1;
    }
    const rotBasis = Math.max(0, t - 3640) * .00012;
    // jari-jari
    const aJ = 1 - seg(t, 3600, 3820);
    if (aJ > 0) {
      ctx.strokeStyle = W_.pucat; ctx.lineWidth = 1; ctx.globalAlpha = .5 * aJ; ctx.beginPath();
      for (let k = 0; k < 8; k++) {
        const a = -Math.PI / 2 + k * Math.PI / 4, l = R0 * 1.06 * E.expoOut(seg(t, 3120 + k * 12, 3380 + k * 12));
        ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * l, cy + Math.sin(a) * l);
      }
      ctx.stroke(); ctx.globalAlpha = 1;
    }
    titikPijar(R.sprite.pijarEmas, cx, cy, u * .06, (1 - seg(t, 3100, 3400)) * seg(t, 3020, 3110));
    // dua persegi + oktagon + lingkaran luar, digambar seperti pena
    const aGaris = 1 - seg(t, 3640, 3740);
    if (aGaris > 0) {
      const persegi = (rot) => { const p = []; for (let i = 0; i < 4; i++) { const a = -Math.PI / 2 + rot + i * Math.PI / 2; p.push(cx + Math.cos(a) * R0, cy + Math.sin(a) * R0); } return p; };
      ctx.lineJoin = 'miter'; ctx.strokeStyle = W_.kuninganHi; ctx.lineWidth = 1.6; ctx.globalAlpha = aGaris;
      polilinSebagian(persegi(0), E.expoInOut(seg(t, 3180, 3560)), true); ctx.stroke();
      polilinSebagian(persegi(Math.PI / 4), E.expoInOut(seg(t, 3260, 3640)), true); ctx.stroke();
      const okt = []; for (let i = 0; i < 8; i++) { const a = -Math.PI / 2 + Math.PI / 8 + i * Math.PI / 4; okt.push(cx + Math.cos(a) * R0 * .765, cy + Math.sin(a) * R0 * .765); }
      ctx.globalAlpha = .45 * aGaris; ctx.strokeStyle = W_.pucat; ctx.lineWidth = 1;
      polilinSebagian(okt, E.expoInOut(seg(t, 3380, 3700)), true); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    const pl = E.expoInOut(seg(t, 3300, 3700)), aL = 1 - seg(t, 4100, 4400);
    if (pl > 0 && aL > 0) {
      ctx.globalAlpha = .32 * aL; ctx.strokeStyle = W_.pucat; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(cx, cy, R0 * 1.2, -Math.PI / 2, -Math.PI / 2 + TAU * pl); ctx.stroke(); ctx.globalAlpha = 1;
    }
    // bentuk morf
    if (t >= 3560 && t < 4760) {
      const [ro, ri, rot] = paramMorf(t);
      let denyut = 1;
      for (const b of [3900, 4160]) { const d = t - b; if (d >= 0 && d < 300) denyut += .07 * Math.exp(-d / 70) * Math.sin(d / 300 * Math.PI); }
      let p = bintang(cx, cy, R0 * ro * denyut, R0 * ri * denyut, rot + rotBasis);
      const c = tataCincin();
      const fL = E.expoInOut(seg(t, 4200, 4440));
      p = keLingkaran(p, cx, cy, R0 * .9, fL);
      // 4440–4760: lingkaran berpindah ke posisi cincin data
      const pin = E.expoInOut(seg(t, 4440, 4760));
      if (pin > 0) {
        const ncx = lerp(cx, c.cx, pin), ncy = lerp(cy, c.cy, pin), nr = lerp(R0 * .9, c.R, pin);
        p = keLingkaran(bintang(ncx, ncy, nr, nr, 0), ncx, ncy, nr, 1);
      }
      const aIsi = seg(t, 3560, 3720);
      ctx.beginPath(); ctx.moveTo(p[0], p[1]); for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i], p[i + 1]); ctx.closePath();
      ctx.globalAlpha = .16 * aIsi * (1 - pin); ctx.fillStyle = W_.kuningan; ctx.fill();
      ctx.globalAlpha = seg(t, 3640, 3740) * (1 - pin * .55); ctx.strokeStyle = W_.kuninganHi; ctx.lineWidth = 1.7; ctx.lineJoin = 'round'; ctx.stroke();
      ctx.globalAlpha = 1;
      // pucuk rebung: 8 segitiga memancar
      for (let k = 0; k < 8; k++) {
        const h = R0 * .4 * E.backOut(seg(t, 3860 + k * 20, 4080 + k * 20)) * (1 - E.expoIn(seg(t, 4120, 4300)));
        if (h <= .5) continue;
        const a = -Math.PI / 2 + rot + rotBasis + k * Math.PI / 4, r0 = R0 * 1.32, bw = R0 * .13;
        const ux = Math.cos(a), uy = Math.sin(a), vx = -uy, vy = ux;
        const bx = cx + ux * r0, by = cy + uy * r0;
        ctx.strokeStyle = W_.kuningan; ctx.lineWidth = 1.2; ctx.beginPath();
        ctx.moveTo(bx - vx * bw, by - vy * bw); ctx.lineTo(bx + ux * h, by + uy * h); ctx.lineTo(bx + vx * bw, by + vy * bw);
        ctx.moveTo(bx - vx * bw * .5 + ux * h * .25, by - vy * bw * .5 + uy * h * .25); ctx.lineTo(bx + ux * h * .62, by + uy * h * .62);
        ctx.lineTo(bx + vx * bw * .5 + ux * h * .25, by + vy * bw * .5 + uy * h * .25);
        ctx.stroke();
      }
    }
    // nama dayah dalam aksara Arab — tenang: tanpa glitch, tanpa irisan
    const aA = Math.min(seg(t, 3520, 3700), 1 - seg(t, 4080, 4260));
    if (aA > 0) {
      const fsA = Math.max(16, R0 * .3), fontA = `700 ${fsA}px ${F.ar}`;
      ctx.font = fontA; ctx.direction = 'rtl'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const wA = lebar(fontA, 'روح القرآن') + 8, buka = E.expoOut(seg(t, 3520, 3860));
      ctx.save(); klipPersegi(cx + wA / 2 - wA * buka, cy - fsA, wA * buka, fsA * 2);
      ctx.globalAlpha = aA; ctx.fillStyle = W_.kuninganHi;
      ctx.fillText('روح القرآن', cx, cy + (1 - buka) * 6);
      ctx.restore(); ctx.direction = 'ltr'; ctx.textBaseline = 'alphabetic'; ctx.globalAlpha = 1;
    }
  }

  /* =================================================================
   *  BEAT 3 · DATA ABSTRAK (4,6–6,2 dtk) — ilustrasi, bukan data santri
   *  Cincin tumbuh elastis, penghitung odometer 30 JUZ → 114 SURAH
   *  (fakta mushaf, bukan angka santri), batang & garis tergambar.
   * ================================================================= */
  const BATANG = [.38, .55, .47, .68, .6, .82, .94];
  function odometer(nilai, x, y, fs, kolomMin) {
    ctx.font = fSans(fs); ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    const dw = lebar(fSans(fs), '0') * 1.02;
    const tampakRatus = Math.max(0, Math.min(1, nilai >= 100 ? 1 : Math.max(0, (nilai - 99))));
    const nKol = kolomMin + tampakRatus;
    const kiri = x - dw * nKol / 2;
    const kol = [];
    for (let k = 0; k < 3; k++) {
      const b = Math.pow(10, k);
      const pos = k === 0 ? nilai : Math.floor(nilai / b) + Math.max(0, (nilai % b) - (b - 1));
      kol.push(pos);
    }
    ctx.save(); klipPersegi(x - dw * 2.2, y - fs * .82, dw * 4.4, fs * .98);
    for (let k = 0; k < 3; k++) {
      const pos = kol[k];
      if (k === 2 && tampakRatus <= 0) continue;
      if (k === 1 && nilai < 1 && kolomMin < 2) continue;
      const d = Math.floor(pos) % 10, f = pos - Math.floor(pos);
      const cx = kiri + dw * (nKol - 1 - k) + dw / 2 + (k === 2 ? 0 : 0);
      ctx.globalAlpha = k === 2 ? tampakRatus : 1;
      ctx.fillText(String(d), cx, y - f * fs);
      ctx.fillText(String((d + 1) % 10), cx, y + (1 - f) * fs);
    }
    ctx.restore(); ctx.globalAlpha = 1;
  }
  function adeganData(t, gx, a) {
    const c = tataCincin(), cam = kameraData(t);
    const mid = cam * .6 + gx;
    ctx.save(); ctx.translate(mid, 0); ctx.globalAlpha = a;
    // cincin
    const WARNA = [W_.emas, W_.langit, W_.pucat], TARGET = [.86, .72, .94];
    for (let i = 0; i < 3; i++) {
      const r = c.R * (1 - i * .24), lw = c.R * .12;
      const jejak = i === 0 ? seg(t, 4700, 4760) : E.expoInOut(seg(t, 4600 + i * 60, 4820 + i * 60));
      ctx.lineWidth = lw; ctx.lineCap = 'round';
      ctx.strokeStyle = W_.pucat; ctx.globalAlpha = a * .1;
      ctx.beginPath(); ctx.arc(c.cx, c.cy, r, -Math.PI / 2, -Math.PI / 2 + TAU * jejak); ctx.stroke();
      const p = TARGET[i] * E.elastis(seg(t, 4680 + i * 90, 4680 + i * 90 + 1000));
      if (p > .002) {
        ctx.globalAlpha = a; ctx.strokeStyle = WARNA[i];
        ctx.beginPath(); ctx.arc(c.cx, c.cy, r, -Math.PI / 2, -Math.PI / 2 + TAU * p); ctx.stroke();
      }
    }
    ctx.globalAlpha = a;
    // penghitung
    const fsN = c.R * .5;
    let v = 30 * E.expoOut(seg(t, 4700, 5350));
    if (t > 5500) v = lerp(30, 114, E.expoOut(seg(t, 5500, 6050)));
    ctx.fillStyle = W_.putih;
    odometer(v, c.cx, c.cy + fsN * .32, fsN, 2);
    const lbl = t < 5600 ? 'JUZ' : 'SURAH', aLbl = t < 5600 ? 1 - seg(t, 5480, 5600) : seg(t, 5600, 5720);
    ctx.font = `600 ${Math.max(8, c.R * .13)}px ${F.mono}`; ctx.textAlign = 'center';
    ctx.fillStyle = W_.pucat; ctx.globalAlpha = a * aLbl * .85;
    ctx.fillText(lbl, c.cx, c.cy + fsN * .32 + c.R * .2);
    ctx.globalAlpha = a;
    // grid bantu + batang
    const n = BATANG.length, slot = (c.bx1 - c.bx0) / n, bw = slot * .56, rentang = c.by1 - c.by0;
    ctx.strokeStyle = W_.pucat; ctx.lineWidth = 1;
    for (let g = 0; g < 4; g++) {
      const y = c.by1 - rentang * g / 3, p = E.expoOut(seg(t, 4700 + g * 40, 4950 + g * 40));
      ctx.globalAlpha = a * (g ? .1 : .3);
      ctx.beginPath(); ctx.moveTo(c.bx0, y); ctx.lineTo(lerp(c.bx0, c.bx1, p), y); ctx.stroke();
    }
    const gr = ctx.createLinearGradient(0, c.by0, 0, c.by1);
    gr.addColorStop(0, W_.lautHi); gr.addColorStop(1, W_.navy2);
    for (let i = 0; i < n; i++) {
      const h = BATANG[i] * rentang * E.elastis(seg(t, 4760 + i * 55, 4760 + i * 55 + 900));
      if (h <= .5) continue;
      const x = c.bx0 + slot * i + (slot - bw) / 2;
      ctx.globalAlpha = a * .92; ctx.fillStyle = gr; ctx.fillRect(x, c.by1 - h, bw, h);
      ctx.globalAlpha = a; ctx.fillStyle = W_.kuninganHi; ctx.fillRect(x, c.by1 - h, bw, 2);
    }
    // garis tren tergambar + titik penunggang
    const pts = [];
    for (let i = 0; i < n; i++) pts.push(c.bx0 + slot * (i + .5), c.by1 - BATANG[i] * rentang - rentang * .1 - (i % 2 ? rentang * .04 : 0));
    const pg = E.expoInOut(seg(t, 5150, 5750));
    if (pg > 0) {
      const lg = ctx.createLinearGradient(c.bx0, 0, c.bx1, 0);
      lg.addColorStop(0, W_.langit); lg.addColorStop(1, W_.emas);
      ctx.globalAlpha = a; ctx.strokeStyle = lg; ctx.lineWidth = 2; ctx.lineJoin = 'round';
      polilinSebagian(pts, pg, false); ctx.stroke();
      // ujung
      let tot = 0; const pj = [];
      for (let i = 0; i < n - 1; i++) { const d = Math.hypot(pts[i * 2 + 2] - pts[i * 2], pts[i * 2 + 3] - pts[i * 2 + 1]); pj.push(d); tot += d; }
      let s = tot * pg, ex = pts[0], ey = pts[1];
      for (let i = 0; i < n - 1; i++) { if (s <= pj[i]) { ex = lerp(pts[i * 2], pts[i * 2 + 2], s / pj[i]); ey = lerp(pts[i * 2 + 1], pts[i * 2 + 3], s / pj[i]); break; } s -= pj[i]; ex = pts[i * 2 + 2]; ey = pts[i * 2 + 3]; }
      const nadi = pg >= 1 ? 1 + .25 * Math.sin((t - 5750) / 120) : 1;
      titikPijar(R.sprite.pijarEmas, ex, ey, 14 * nadi, a * .9);
      ctx.fillStyle = W_.putih; ctx.beginPath(); ctx.arc(ex, ey, 2.6, 0, TAU); ctx.fill();
    }
    // keterangan jujur
    const aK = seg(t, 4800, 5000);
    if (aK > 0) {
      ctx.font = `500 ${L.fsKecil}px ${F.mono}`; ctx.textAlign = 'left'; ctx.fillStyle = W_.pucat;
      ctx.globalAlpha = a * aK * .7;
      ctx.fillText('PERKEMBANGAN · ILUSTRASI', c.bx0, c.by0 - L.fsKecil * 1.4);
    }
    ctx.restore(); ctx.globalAlpha = 1;
  }
  function beatData(t) {
    if (!KONFIG.MODUL.data || t < 4580 || t > 6500) return;
    // whip-pan 6,18–6,46 dtk dengan kabur gerak (salinan tergeser)
    const pw = seg(t, 6180, 6460), gx = -E.expoIn(pw) * L.W * .95;
    const kabur = TINGKAT[R.tingkat].kabur;
    if (pw > 0 && kabur) {
      const v = -E.expoIn(Math.min(1, pw + .06)) * L.W * .95 - gx;
      for (let i = kabur; i >= 1; i--) adeganData(t, gx - v * i * .5, .22 / i);
    }
    if (pw < 1) adeganData(t, gx, 1);
    // garis kecepatan
    const sl = seg(t, 6230, 6560);
    if (sl > 0 && sl < 1) {
      ctx.strokeStyle = W_.pucat; ctx.lineWidth = 1;
      for (let i = 0; i < 9; i++) {
        const y = L.S.y + acak(i * 5.3) * L.S.h, x = L.W * (1.2 - E.expoOut(seg(sl, i * .04, .6 + i * .04)) * 1.6);
        ctx.globalAlpha = .35 * Math.sin(Math.PI * sl);
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + L.W * .3, y); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
  }

  /* =================================================================
   *  BEAT 4 · IRISAN (6,2–7,8 dtk): panel bergeser berurutan membawa
   *  CATAT. PANTAU. BINA. — glitch 2 bingkai (tanpa kilat terang) —
   *  panel keluar seperti cambuk.
   * ================================================================= */
  function barisIrisan() {
    const S = L.S;
    return [
      { y: S.y + S.h * .08,  h: S.h * .24,  kata: 'CATAT', no: '01', dari: -1, w: W_.navy2, tx: W_.putih, ti: W_.emas, u: 0 },
      { y: S.y + S.h * .335, h: S.h * .035, dari: 1, w: W_.emas, u: 3 },
      { y: S.y + S.h * .38,  h: S.h * .24,  kata: 'PANTAU', no: '02', dari: 1, w: W_.kuningan, tx: W_.tinta, ti: W_.putih, u: 1 },
      { y: S.y + S.h * .635, h: S.h * .035, dari: -1, w: W_.langit, u: 4 },
      { y: S.y + S.h * .68,  h: S.h * .24,  kata: 'BINA', no: '03', dari: -1, w: W_.laut, tx: W_.putih, ti: W_.emas, u: 2 }
    ];
  }
  function beatIrisan(t) {
    if (!KONFIG.MODUL.irisan || t < 6380 || t > 8000) return;
    const S = L.S, Wc = L.W, fs = L.fsIris, font = fSans(fs);
    const glitch = t >= 7330 && t < 7364, gi = Math.floor((t - 7330) / 17);
    const kroma = TINGKAT[R.tingkat].kroma;
    for (const b of barisIrisan()) {
      const mulai = 6380 + b.u * 55, dur = b.kata ? 420 : 340;
      const masuk = E.expoOut(seg(t, mulai, mulai + dur));
      const kel = 7420 + (4 - b.u) * 45, keluar = E.expoIn(seg(t, kel, kel + 340));
      if (masuk <= 0 || keluar >= 1) continue;
      let ox = b.dari * Wc * (1 - masuk) - b.dari * Wc * keluar;
      if (glitch) ox += (acak(gi * 13 + b.u) - .5) * 48;
      ctx.save(); klipPersegi(0, b.y, Wc, b.h);
      ctx.translate(ox, 0);
      ctx.fillStyle = b.w; ctx.fillRect(0, b.y, Wc, b.h);
      if (b.kata) {
        // tekstur songket, bergeser berlawanan arah (paralaks)
        ctx.save(); ctx.translate(-b.dari * (t - mulai) * .03, b.y);
        ctx.globalAlpha = .09; ctx.fillStyle = R.sprite.polaSongket; ctx.fillRect(-60, 0, Wc + 120, b.h);
        ctx.restore(); ctx.globalAlpha = 1;
        const geser = -b.dari * (t - mulai) * .022, x = S.x + S.w * .04 + geser, y = b.y + b.h * .5 + fs * .36;
        ctx.font = font; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
        if (glitch && kroma) {
          ctx.globalAlpha = .55; ctx.fillStyle = W_.langit; ctx.fillText(b.kata + '.', x - 4, y);
          ctx.fillStyle = W_.emas; ctx.fillText(b.kata + '.', x + 4, y); ctx.globalAlpha = 1;
        }
        ctx.fillStyle = b.tx; ctx.fillText(b.kata, x, y);
        ctx.fillStyle = b.ti; ctx.fillText('.', x + lebar(font, b.kata), y);
        ctx.font = `600 ${L.fsKecil}px ${F.mono}`; ctx.textAlign = 'right';
        ctx.globalAlpha = .7; ctx.fillStyle = b.tx;
        ctx.fillText(b.no, S.x + S.w - 4, b.y + L.fsKecil * 1.8); ctx.globalAlpha = 1;
      }
      ctx.restore();
    }
  }

  /* =================================================================
   *  BEAT 5 · KLIMAKS MEREK (7,8–9,2 dtk) + BEAT 6 · PULANG (9,2–10)
   * ================================================================= */
  const TAGLINE = ['Setiap', 'catatan', 'adalah', 'amanah.'];
  function tataMerek() {
    const S = L.S, fs = L.fsMerek, font = fSans(fs);
    const pos = posHuruf(font, 'chemint'), Wn = pos[pos.length - 1];
    const sub = Math.max(10, fs * .11), tag = Math.max(14, Math.min(fs * .21, 30));
    const tinggi = fs * .78 + fs * .2 + sub * 1.8 + tag * 2.1;
    const atas = S.cy - tinggi / 2, base = atas + fs * .76;
    return { fs, font, pos, Wn, x0: S.cx - Wn / 2, base, garisY: base + fs * .2, sub, subY: base + fs * .2 + sub * 1.75,
      tag, tagY: base + fs * .2 + sub * 1.8 + tag * 1.55 };
  }
  function beatMerek(t) {
    if (!KONFIG.MODUL.merek || t < 7480) return;
    const S = L.S, m = tataMerek(), kat = 'chemint', n = kat.length;
    // partikel memusat (implosi) 7,5–8,45 dtk
    if (t < 8500) {
      const N = Math.round(TINGKAT[R.tingkat].debu * .8);
      for (let i = 0; i < N; i++) {
        const p = E.expoOut(seg(t, 7500 + i * 6, 8250 + i * 6));
        if (p <= 0 || p >= 1) continue;
        const a0 = acak(i * 9.1) * TAU, r0 = L.u * (.7 + acak(i * 4.4) * .5);
        const sx = S.cx + Math.cos(a0) * r0 * 1.3, sy = S.cy + Math.sin(a0) * r0;
        const ex = m.x0 + acak(i * 2.2) * m.Wn, ey = m.base - acak(i * 3.7) * m.fs * .7;
        const x = lerp(sx, ex, p), y = lerp(sy, ey, p);
        const px = lerp(sx, ex, Math.max(0, p - .08)), py = lerp(sy, ey, Math.max(0, p - .08));
        ctx.globalAlpha = Math.sin(Math.PI * p) * .8; ctx.strokeStyle = i % 3 ? W_.kuninganHi : W_.pucat; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(x, y); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    if (t < 7740) return;
    const pulang = seg(t, 9300, 9520), pudar = seg(t, 9480, 9600);
    // pancaran sinar tipis (lapis belakang)
    const aS = Math.min(seg(t, 7900, 8300), 1 - seg(t, 9150, 9400));
    if (aS > 0 && TINGKAT[R.tingkat].sinar) {
      ctx.strokeStyle = W_.kuninganHi; ctx.lineWidth = 1; ctx.globalAlpha = .07 * aS; ctx.beginPath();
      const cx = S.cx, cy = m.base - m.fs * .35, rr = L.u * .75, rot = (t - 7900) * .00015;
      for (let k = 0; k < 16; k++) { const a = rot + k * TAU / 16; ctx.moveTo(cx + Math.cos(a) * rr * .35, cy + Math.sin(a) * rr * .35); ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); }
      ctx.stroke(); ctx.globalAlpha = 1;
    }
    // halo
    const aH = Math.min(seg(t, 7900, 8500), 1 - seg(t, 9250, 9600));
    if (aH > 0) {
      ctx.globalAlpha = .22 * aH;
      ctx.drawImage(R.sprite.pijarEmas, S.cx - m.Wn * .75, m.base - m.fs * 1.15, m.Wn * 1.5, m.fs * 1.5);
      ctx.globalAlpha = 1;
    }
    // huruf — kerning merapat, muncul dari tengah ke tepi
    if (pudar < 1) {
      const ls = lerp(.55, -.02, E.expoOut(seg(t, 7760, 8450))) * m.fs;
      const sy = 1 - .97 * E.backIn(pulang);
      const pS = lerp(-.3, 1.3, E.expoInOut(seg(t, 8250, 9000)));
      const gr = ctx.createLinearGradient(m.x0 - m.Wn * .1, 0, m.x0 + m.Wn * 1.1, 0);
      const stop = (o, c) => { if (o >= 0 && o <= 1) gr.addColorStop(o, c); };
      gr.addColorStop(0, W_.putih);
      stop(pS - .16, W_.putih); stop(pS - .05, W_.kuninganHi); stop(pS, '#FFF1C2'); stop(pS + .05, W_.kuninganHi); stop(pS + .16, W_.putih);
      gr.addColorStop(1, W_.putih);
      ctx.font = m.font; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      const cyH = m.base - m.fs * .36;
      ctx.save(); ctx.translate(0, cyH); ctx.scale(1, sy); ctx.translate(0, -cyH);
      const mantap = E.expoOut(seg(t, 7760, 8600));
      for (let j = 0; j < n; j++) {
        const d = Math.abs(j - (n - 1) / 2);
        const a = E.expoOut(seg(t, 7780 + d * 45, 8160 + d * 45));
        if (a <= 0) continue;
        const x = m.x0 + m.pos[j] + ls * (j - (n - 1) / 2), y = m.base + (1 - a) * m.fs * .22;
        ctx.globalAlpha = a * (1 - pudar);
        if (TINGKAT[R.tingkat].kroma) {
          const dl = 1 + 5 * (1 - mantap);
          ctx.globalAlpha = a * (1 - pudar) * .5;
          ctx.fillStyle = W_.langit; ctx.fillText(kat[j], x - dl, y);
          ctx.fillStyle = W_.kuningan; ctx.fillText(kat[j], x + dl, y);
          ctx.globalAlpha = a * (1 - pudar);
        }
        ctx.fillStyle = gr; ctx.fillText(kat[j], x, y);
      }
      ctx.restore(); ctx.globalAlpha = 1;
    }
    // garis aturan: muncul 8,25 dtk; saat pulang menjadi garis frame 0
    const tumbuh = E.expoOut(seg(t, 8250, 8700));
    if (tumbuh > 0) {
      const susut = 1 - E.expoInOut(seg(t, 9550, 9900));
      const y = lerp(m.garisY, S.cy, E.expoInOut(seg(t, 9500, 9800)));
      const half = (m.Wn / 2) * tumbuh * susut;
      const a = (1 - seg(t, 9860, 9990)) * (1 + .3 * pudar);
      if (half > .4 && a > 0) garis(S.cx - half, y, S.cx + half, y, 1.5, W_.kuninganHi, Math.min(1, a));
    }
    // RUHUL QURANI (kiri) · روح القرآن (kanan)
    const aSub = 1 - seg(t, 9240, 9440);
    if (aSub > 0) {
      const fsub = `700 ${m.sub.toFixed(1)}px ${F.sans}`, teks = 'RUHUL QURANI';
      const jarak = m.sub * .34;
      ctx.save(); klipPersegi(m.x0 - 4, m.subY - m.sub * 1.25, m.Wn + 8, m.sub * 1.6);
      ctx.font = fsub; ctx.textAlign = 'left'; ctx.fillStyle = W_.pucat;
      let x = m.x0;
      for (let j = 0; j < teks.length; j++) {
        const p = E.expoOut(seg(t, 8350 + j * 12, 8750 + j * 12));
        ctx.globalAlpha = aSub;
        ctx.fillText(teks[j], x, m.subY + (1 - p) * m.sub * 1.4 + (1 - aSub) * m.sub * 1.4);
        x += lebar(fsub, teks[j]) + jarak;
      }
      const lebarLatin = x - m.x0, fsAr = m.sub * 1.5, fontAr = `700 ${fsAr.toFixed(1)}px ${F.ar}`;
      const wAr = lebar(fontAr, 'روح القرآن');
      if (lebarLatin + wAr + 24 < m.Wn) {
        const buka = E.expoOut(seg(t, 8450, 8850));
        ctx.restore(); ctx.save();
        klipPersegi(m.x0 + m.Wn - wAr * buka - 2, m.subY - fsAr * 1.1, wAr * buka + 4, fsAr * 1.5);
        ctx.font = fontAr; ctx.direction = 'rtl'; ctx.textAlign = 'right'; ctx.fillStyle = W_.kuninganHi;
        ctx.globalAlpha = aSub; ctx.fillText('روح القرآن', m.x0 + m.Wn, m.subY + m.sub * .1);
        ctx.direction = 'ltr';
      }
      ctx.restore(); ctx.globalAlpha = 1;
    }
    // tagline serif miring, kata demi kata
    const fontT = `italic 400 ${m.tag.toFixed(1)}px ${F.serif}`;
    let total = 0; const lebarK = TAGLINE.map(k => { const w = lebar(fontT, k); total += w; return w; });
    const spasi = lebar(fontT, ' '); total += spasi * (TAGLINE.length - 1);
    let x = S.cx - total / 2;
    ctx.font = fontT; ctx.textAlign = 'left'; ctx.fillStyle = W_.putih;
    for (let i = 0; i < TAGLINE.length; i++) {
      const p = E.expoOut(seg(t, 8550 + i * 70, 8970 + i * 70));
      const q = E.expoIn(seg(t, 9200 + (TAGLINE.length - 1 - i) * 30, 9420 + (TAGLINE.length - 1 - i) * 30));
      const a = p * (1 - q);
      if (a > 0) { ctx.globalAlpha = a * .92; ctx.fillText(TAGLINE[i], x, m.tagY + (1 - p) * 10 + q * 8); }
      x += lebarK[i] + spasi;
    }
    ctx.globalAlpha = 1;
  }

  /* =================================================================
   *  BINGKAI
   * ================================================================= */
  function gambar(t) {
    const m0 = performance.now();
    ctx.setTransform(L.k, 0, 0, L.k, 0, 0);
    ctx.clearRect(0, 0, L.W, L.H);
    lapisDebu(t);
    lapisGrid(t);
    beatBuka(t);
    beatKetik(t);
    beatGeometri(t);
    beatData(t);
    beatIrisan(t);
    beatMerek(t);
    lapisHud(t);
    lapisButir(t);
    R.bingkai++;
    const d = performance.now() - m0;
    R.gambarMs.push(d); if (R.gambarMs.length > 240) R.gambarMs.shift();
  }

  /* ---------- Jam induk ---------- */
  function tik(kini) {
    R.raf = requestAnimationFrame(tik);
    if (!R.akhir) { R.akhir = kini; gambar(R.waktu % KONFIG.DURASI); return; }
    const dt = kini - R.akhir;
    if (TINGKAT[R.tingkat].fps === 30 && dt < 30) return;
    R.akhir = kini;
    if (R.beku === null) R.waktu += Math.min(dt, 100);
    pantauKinerja(dt);
    gambar(R.beku === null ? R.waktu % KONFIG.DURASI : R.beku);
  }
  function pantauKinerja(dt) {
    if (R.beku !== null || KONFIG.TINGKAT !== 'otomatis') return;
    if (!R.ukurSelesai) {
      // Pemanasan 500 ms (bingkai gelap pembuka): app.js masih sibuk tepat
      // setelah layar muat tertutup; jangan hukum perangkat karena itu.
      R.pemanasan = (R.pemanasan || 0) + dt;
      if (R.pemanasan < 500) return;
      R.ukur.push(dt);
      const total = R.ukur.reduce((a, b) => a + b, 0);
      if (total >= 1000 && R.ukur.length > 8) {
        // rerata setelah membuang 10 % bingkai terlama (satu GC/parse tidak menentukan nasib)
        const urut = R.ukur.slice().sort((a, b) => a - b), sampel = urut.slice(0, Math.max(1, Math.floor(urut.length * .9)));
        const rata = sampel.reduce((a, b) => a + b, 0) / sampel.length;
        R.ukurSelesai = true; R.rataAwal = +rata.toFixed(2);
        if (rata > KONFIG.AMBANG_RINGAN) gantiTingkat('ringan', 'ukur');
        else if (rata > KONFIG.AMBANG_SEDANG && R.tingkat === 'penuh') gantiTingkat('sedang', 'ukur');
      }
      return;
    }
    if (R.tingkat === 'ringan') return;
    R.jendela.push(dt); if (R.jendela.length > 90) R.jendela.shift();
    if (R.jendela.length === 90) {
      const rata = R.jendela.reduce((a, b) => a + b, 0) / 90;
      if (rata > 28) { gantiTingkat(URUT[URUT.indexOf(R.tingkat) + 1], 'pantau'); R.jendela = []; }
    }
  }
  function gantiTingkat(tk, sebab) {
    if (!TINGKAT[tk] || tk === R.tingkat) return;
    R.tingkat = tk; R.sebab = sebab;
    pasangResolusi(); buatSprite();
  }

  /* ---------- Tingkat awal: hemat data / baterai / pilihan pengguna ---------- */
  function tingkatAwal() {
    if (KONFIG.TINGKAT !== 'otomatis') return [KONFIG.TINGKAT, 'konfig'];
    try {
      const k = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
      if (k && (k.saveData || /(^|-)2g$/.test(String(k.effectiveType || '')))) return ['ringan', 'hemat-data'];
    } catch (e) {}
    try { if (localStorage.getItem('rq-efek-pilih') === 'hemat') return ['ringan', 'pilihan-hemat']; } catch (e) {}
    if (document.documentElement.classList.contains('hemat')) return ['sedang', 'kelas-hemat'];
    return ['penuh', 'bawaan'];
  }
  function periksaBaterai() {
    if (KONFIG.TINGKAT !== 'otomatis' || typeof navigator.getBattery !== 'function') return;
    navigator.getBattery().then(b => {
      if (R.hidup && b && !b.charging && b.level < .25) gantiTingkat('ringan', 'baterai');
    }).catch(() => {});
  }

  /* =================================================================
   *  DAUR HIDUP
   * ================================================================= */
  function gerakDikurangi() { return !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); }
  function tampil() {
    const lm = document.getElementById('layarMuat');
    return R.scr && !R.scr.classList.contains('hidden') && (!lm || lm.classList.contains('tutup'));
  }
  function jalankanLoop() {
    if (R.poster || R.raf || document.hidden) return;
    R.akhir = 0; R.jalan = true;
    R.raf = requestAnimationFrame(tik);
  }
  function hentikanLoop() {
    if (R.raf) cancelAnimationFrame(R.raf);
    R.raf = 0; R.akhir = 0; R.jalan = false;
  }
  function onVis() { if (document.hidden) hentikanLoop(); else if (R.hidup) jalankanLoop(); }
  function onGerak() {
    if (!R.hidup) return;
    R.poster = gerakDikurangi();
    if (R.poster) { hentikanLoop(); pasangResolusi(); gambarPoster(); }
    else { pasangResolusi(); jalankanLoop(); }
  }
  /** Poster gerak-dikurangi: satu bingkai klimaks yang sudah mengendap. */
  function gambarPoster() { gambar(9060); }

  function onUkuran() {
    clearTimeout(R.tundaTata);
    R.tundaTata = setTimeout(() => {
      if (!R.hidup) return;
      const lebarBaru = Math.round(R.scr.clientWidth), tinggiBaru = Math.round(R.scr.offsetHeight);
      if (lebarBaru === R.lebarLalu && tinggiBaru === R.tinggiLalu) return;
      const isi = document.activeElement && R.scr.contains(document.activeElement) && /^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName);
      // Papan ketik HP: hanya tinggi yang berubah saat kolom berfokus → JANGAN tata ulang.
      if (lebarBaru === R.lebarLalu && isi) return;
      tataUlang();
      if (R.poster || !R.raf) gambar(R.poster ? 9060 : (R.beku ?? R.waktu % KONFIG.DURASI));
    }, 160);
  }

  function mulai() {
    if (R.hidup) return;
    const scr = R.scr = document.getElementById('loginScreen');
    if (!scr) return;
    const kanvas = document.createElement('canvas');
    kanvas.className = 'rq-reel';
    kanvas.setAttribute('aria-hidden', 'true');
    kanvas.setAttribute('role', 'presentation');
    const c2 = kanvas.getContext && kanvas.getContext('2d', { alpha: true });
    if (!c2) return;
    const wash = scr.querySelector('.login-wash');
    if (wash && wash.nextSibling) scr.insertBefore(kanvas, wash.nextSibling); else scr.insertBefore(kanvas, scr.firstChild);
    R.kanvas = kanvas; ctx = R.ctx = c2;
    R.hidup = true;
    const [tk, sebab] = tingkatAwal();
    R.tingkat = R.tingkatAwal = tk; R.sebab = sebab;
    R.poster = gerakDikurangi();
    R.ukur = []; R.pemanasan = 0; R.ukurSelesai = tk === 'ringan'; R.jendela = []; R.waktu = 0; R.bingkai = 0; R.beku = null;
    scr.classList.add('ada-reel');
    tataUlang();
    document.addEventListener('visibilitychange', onVis);
    if (window.matchMedia) { R.mq = matchMedia('(prefers-reduced-motion: reduce)'); R.mq.addEventListener?.('change', onGerak); }
    if (typeof ResizeObserver === 'function') { R.ro = new ResizeObserver(onUkuran); R.ro.observe(scr); }
    else window.addEventListener('resize', onUkuran);
    periksaBaterai();
    // Huruf sudah dipakai halaman masuk; bila baru tiba, ukuran teks dihitung ulang.
    if (document.fonts && document.fonts.load) {
      Promise.all(['800 40px "Inter Tight"', 'italic 400 30px "Instrument Serif"', '500 12px "IBM Plex Mono"', '700 30px Amiri']
        .map(f => document.fonts.load(f, f.includes('Amiri') ? 'روح' : 'Aa').catch(() => {})))
        .then(() => { if (R.hidup) { R.lebarCache.clear(); hitungUkuranTeks(); if (R.poster) gambarPoster(); } });
    }
    if (R.poster) gambarPoster(); else jalankanLoop();
  }

  /** Bersihkan sepenuhnya: rAF, pendengar, pengamat ukuran, kanvas. */
  function hentikan() {
    if (!R.hidup) return;
    hentikanLoop();
    clearTimeout(R.tundaTata);
    document.removeEventListener('visibilitychange', onVis);
    R.mq?.removeEventListener?.('change', onGerak); R.mq = null;
    if (R.ro) { R.ro.disconnect(); R.ro = null; } else window.removeEventListener('resize', onUkuran);
    if (R.kanvas) { R.kanvas.width = 0; R.kanvas.height = 0; R.kanvas.remove(); }
    R.kanvas = null; ctx = R.ctx = null; R.sprite = {}; R.lebarCache.clear();
    R.scr.classList.remove('ada-reel'); delete R.scr.dataset.reel;
    R.hidup = false;
  }

  /* Pengamat tunggal kelas #loginScreen & #layarMuat: masuk berhasil →
     #loginScreen.hidden → hentikan(). Tampil lagi → mulai lagi. */
  function pantau() {
    const scr = document.getElementById('loginScreen'); if (!scr) return;
    R.scr = scr;
    const periksa = () => { if (tampil()) mulai(); else hentikan(); };
    R.mo = new MutationObserver(periksa);
    R.mo.observe(scr, { attributes: true, attributeFilter: ['class'] });
    const lm = document.getElementById('layarMuat');
    if (lm) R.mo.observe(lm, { attributes: true, attributeFilter: ['class'] });
    periksa();
  }

  /* API kecil — dipakai uji otomatis & penelusuran, bukan oleh aplikasi. */
  window.RQReel = {
    versi: 'v2.47', KONFIG, TINGKAT,
    keadaan: () => ({
      hidup: R.hidup, jalan: R.jalan, poster: R.poster, tingkat: R.tingkat, tingkatAwal: R.tingkatAwal, sebab: R.sebab,
      waktu: R.waktu, t: R.waktu % KONFIG.DURASI, bingkai: R.bingkai, tataVer: R.tataVer, rataAwal: R.rataAwal ?? null,
      gambarMs: R.gambarMs.length ? +(R.gambarMs.reduce((a, b) => a + b, 0) / R.gambarMs.length).toFixed(3) : null,
      kanvas: R.kanvas ? [R.kanvas.width, R.kanvas.height] : null, stage: L ? L.S : null, raf: !!R.raf
    }),
    lompat: (ms) => { R.beku = ((ms % KONFIG.DURASI) + KONFIG.DURASI) % KONFIG.DURASI; if (R.hidup) gambar(R.beku); },
    lanjut: () => { R.beku = null; },
    tingkat: (tk) => { if (TINGKAT[tk]) { KONFIG.TINGKAT = tk; gantiTingkat(tk, 'paksa'); if (R.beku !== null) gambar(R.beku); } },
    hentikan, mulai
  };

  pantau();
})();
