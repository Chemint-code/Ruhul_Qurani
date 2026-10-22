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
             irisan: true, merek: true, debu: true, hud: true, butir: true, aktor: true }
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
    return { W: Wc, H: Hc, sempit, S: { x: x0, y: y0, w, h, cx: x0 + w / 2, cy: y0 + h / 2 }, u: Math.min(w, h), K: kartu };
  }

  function pasangResolusi() {
    const t = TINGKAT[R.tingkat];
    const dpr = Math.min(window.devicePixelRatio || 1, t.dpr);
    const k = Math.min(dpr, Math.sqrt(t.px / (L.W * L.H)));
    L.k = Math.max(0.5, k);
    const bw = Math.round(L.W * L.k), bh = Math.round(L.H * L.k);
    if (R.kanvas.width !== bw) R.kanvas.width = bw;
    if (R.kanvas.height !== bh) R.kanvas.height = bh;
    if (AK.kanvas) {
      if (AK.kanvas.width !== bw) AK.kanvas.width = bw;
      if (AK.kanvas.height !== bh) AK.kanvas.height = bh;
      AK.kosong = false; AK.aset = null;     // ukuran kanvas berubah → konteks direset: buat ulang gradasi/pola
    }
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
    if (v === undefined) { ctx.font = font; regang(font); v = ctx.measureText(s).width; regang(''); R.lebarCache.set(k, v); }
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
  /* v2.47.2 — merek "Chemint-Dest": Mona Sans (GitHub, 2024) Black Italic
     dengan sumbu lebar 125 % — grotesk variabel terbaru yang lebar & miring,
     cocok untuk gerak cepat. Cadangan: Inter Tight miring. */
  const MEREK = 'Chemint-Dest', I_GARIS = MEREK.indexOf('-');
  const fMerek = (px) => `italic 900 ${px.toFixed(1)}px 'Mona Sans', ${F.sans}`;
  const regang = (font) => { if ('fontStretch' in ctx) ctx.fontStretch = /Mona Sans/.test(font) ? 'expanded' : 'normal'; };
  function hitungUkuranTeks() {
    const S = L.S;
    ctx.font = fSans(100);
    const wP = ctx.measureText('PRESTASI.').width || 560;
    L.fsKata = Math.max(26, Math.min(100 * S.w * 0.88 / wP, S.h * 0.34, 190));
    ctx.font = fMerek(100); regang(ctx.font);
    const wC = ctx.measureText(MEREK).width || 820;
    regang('');
    L.fsMerek = Math.max(26, Math.min(100 * S.w * 0.84 / wC, S.h * 0.3, 200));
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
    const S = L.S, fs = L.fsMerek, font = fMerek(fs);
    const pos = posHuruf(font, MEREK), Wn = pos[pos.length - 1];
    const sub = Math.max(10, fs * .11), tag = Math.max(14, Math.min(fs * .21, 30));
    const tinggi = fs * .78 + fs * .2 + sub * 1.8 + tag * 2.1;
    const atas = S.cy - tinggi / 2, base = atas + fs * .76;
    return { fs, font, pos, Wn, x0: S.cx - Wn / 2, base, garisY: base + fs * .2, sub, subY: base + fs * .2 + sub * 1.75,
      tag, tagY: base + fs * .2 + sub * 1.8 + tag * 1.55 };
  }
  function beatMerek(t) {
    if (!KONFIG.MODUL.merek || t < 7480) return;
    const S = L.S, m = tataMerek(), kat = MEREK, n = kat.length;
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
      const ls = lerp(.3, -.01, E.expoOut(seg(t, 7760, 8450))) * m.fs;
      const sy = 1 - .97 * E.backIn(pulang);
      const pS = lerp(-.3, 1.3, E.expoInOut(seg(t, 8250, 9000)));
      const gr = ctx.createLinearGradient(m.x0 - m.Wn * .1, 0, m.x0 + m.Wn * 1.1, 0);
      const stop = (o, c) => { if (o >= 0 && o <= 1) gr.addColorStop(o, c); };
      gr.addColorStop(0, W_.putih);
      stop(pS - .16, W_.putih); stop(pS - .05, W_.kuninganHi); stop(pS, '#FFF1C2'); stop(pS + .05, W_.kuninganHi); stop(pS + .16, W_.putih);
      gr.addColorStop(1, W_.putih);
      ctx.font = m.font; regang(m.font); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      const cyH = m.base - m.fs * .36;
      ctx.save(); ctx.translate(0, cyH); ctx.scale(1, sy); ctx.translate(0, -cyH);
      const mantap = E.expoOut(seg(t, 7760, 8600));
      // "Dest": emas berkilau searah sapuan; tanda hubung = bilah emas miring (sama dengan gerbang masuk)
      const grD = ctx.createLinearGradient(m.x0, m.base - m.fs * .75, m.x0 + m.Wn, m.base);
      grD.addColorStop(0, '#FFF1C2'); grD.addColorStop(.5, W_.emas); grD.addColorStop(1, W_.kuninganHi);
      for (let j = 0; j < n; j++) {
        const d = Math.abs(j - (n - 1) / 2);
        const a = E.expoOut(seg(t, 7780 + d * 45, 8160 + d * 45));
        if (a <= 0) continue;
        const x = m.x0 + m.pos[j] + ls * (j - (n - 1) / 2), y = m.base + (1 - a) * m.fs * .22;
        ctx.globalAlpha = a * (1 - pudar);
        if (j === I_GARIS) {
          const lb = m.pos[j + 1] - m.pos[j], h = m.fs * .15, yb = y - m.fs * .36;
          ctx.save(); ctx.translate(x + lb * .5, yb); ctx.transform(1, 0, -.25, 1, 0, 0);
          ctx.fillStyle = W_.emas; ctx.fillRect(-lb * .42 * a, -h / 2, lb * .84 * a, h);
          ctx.restore(); continue;
        }
        if (TINGKAT[R.tingkat].kroma) {
          const dl = 1 + 5 * (1 - mantap);
          ctx.globalAlpha = a * (1 - pudar) * .5;
          ctx.fillStyle = W_.langit; ctx.fillText(kat[j], x - dl, y);
          ctx.fillStyle = W_.kuningan; ctx.fillText(kat[j], x + dl, y);
          ctx.globalAlpha = a * (1 - pudar);
        }
        ctx.fillStyle = j > I_GARIS ? grD : gr; ctx.fillText(kat[j], x, y);
      }
      ctx.restore(); ctx.globalAlpha = 1; regang('');
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
   *  v2.47.1 · AKTOR — SI PECI SANG NINJA & SI PAYUNG
   * -----------------------------------------------------------------
   *  Kanvas kedua `.rq-aktor` (z 3: di atas kartu, tanpa pointer) yang
   *  digerakkan JAM YANG SAMA dengan showreel. Posisi, pose, ekor syal,
   *  kelopak, asap — semuanya fungsi murni dari t, jadi bingkai 10 000 =
   *  bingkai 0 (keduanya kosong) dan setiap pijakan jatuh tepat pada
   *  ketukan showreel:
   *    0,54  asap → Si Peci muncul di titik hentakan
   *    1,25  mendarat tepat saat huruf pertama naik
   *    1,66 / 2,26  menebas bersama bilah emas (bilah = jejak qalam emasnya)
   *    2,86  menunggangi kata yang remuk, 3,11 dilontarkan jari-jari girih
   *    3,88 / 4,14  berdiri di ujung pucuk rebung, pindah tepat pada denyut
   *    4,44  berlari di atas lingkaran yang berpindah menjadi cincin data
   *    4,95–5,91  melompati 7 batang, mendarat di puncak lentingan masing-masing
   *    6,18  melompat saat whip-pan, mendarat di panel CATAT · PANTAU · BINA
   *    7,33  ikut ter-glitch 2 bingkai, 7,56 dilontarkan panel BINA
   *    7,78  menyambar tepi kartu tepat saat "chemint" menghantam
   *    8,48  satu tangan terlepas — Si Payung menangkapnya (amanah)
   *    9,30  "pulang": Si Peci lenyap dalam asap, Si Payung terbang dengan
   *          payungnya saat garis aturan menyusut ke titik.
   *  Si Payung: turun berpayung di 2,88, memutar payung pada denyut 3,90 &
   *  4,16 (semburan kelopak), meluncur di garis tren sebagai kepala pena
   *  (5,15–5,75), tersapu whip-pan, melayang di atas panel, lalu mendarat
   *  di tepi kartu tepat saat sapuan emas merek (8,25).
   *  Tidak membaca isian, tidak menyentuh DOM selain kanvasnya sendiri.
   * ================================================================= */
  const AK = { kanvas: null, ctx: null, aset: null, ver: -1, g: null, kosong: false };
  let ca = null;
  const PI = Math.PI, HALF = PI / 2;
  const busur = (p) => Math.sin(PI * Math.max(0, Math.min(1, p)));
  /** Pegas pendaratan: 1 − amp·e^(−dt/τ)·cos(dt/w); dt < 0 → 1. */
  const pegas = (dt, amp = .26, tau = 85, w = 44) => dt < 0 ? 1 : 1 - amp * Math.exp(-dt / tau) * Math.cos(dt / w);

  /* ---------- Aset: Path2D (satuan viewBox SVG asli v2.40) + gradasi ---------- */
  function asetAktor() {
    if (AK.aset) return AK.aset;
    const P2 = (d) => new Path2D(d);
    const rg = (x, y, r, s) => { const g = ca.createRadialGradient(x, y, 0, x, y, r); s.forEach(([o, c]) => g.addColorStop(o, c)); return g; };
    const lg = (x0, y0, x1, y1, s) => { const g = ca.createLinearGradient(x0, y0, x1, y1); s.forEach(([o, c]) => g.addColorStop(o, c)); return g; };
    const a = {};
    /* Si Peci (viewBox 120 × 132, pusat badan 60,72) */
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
    // kain kotak sarung: pola 14 satuan digambar 2× lalu dipetakan balik
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

    /* Si Payung (viewBox 0 -24 150 194, pusat badan 75,110) */
    const tepi = [-64, -42.7, -21.3, 0, 21.3, 42.7, 64];
    let rim = '';
    for (let i = tepi.length - 1; i > 0; i--) rim += `Q${((tepi[i] + tepi[i - 1]) / 2).toFixed(1)} -91 ${tepi[i - 1]} -84`;
    a.jKanopi = P2(`M-64 -84C-61 -113 -32 -125 0 -125C32 -125 61 -113 64 -84${rim}Z`);
    a.jKubah = P2('M-64 -84C-61 -113 -32 -125 0 -125C32 -125 61 -113 64 -84');
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

    /* kelopak sakura (bitmap kecil, 3 rona) */
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
    /* asap: bola lembut putih kebiruan */
    const as = kanvasKecil(64, 64), ag = as.getContext('2d');
    const gr = ag.createRadialGradient(26, 24, 2, 32, 32, 31);
    gr.addColorStop(0, 'rgba(255,255,255,.95)'); gr.addColorStop(.5, 'rgba(214,228,240,.75)'); gr.addColorStop(1, 'rgba(160,182,204,0)');
    ag.fillStyle = gr; ag.fillRect(0, 0, 64, 64);
    a.asap = as;
    AK.aset = a;
    return a;
  }

  /* ---------- Geometri aktor (dihitung ulang hanya saat tata letak berubah) ---------- */
  function geoAktor() {
    if (AK.g && AK.ver === R.tataVer) return AK.g;
    const S = L.S, u = L.u, fs = L.fsKata;
    const Hn = Math.max(40, Math.min(104, u * .19)), k = Hn / 128;
    const Hp = Hn * 1.04, kp = Hp / 122;
    const y0 = S.cy + fs * .30;
    const K = L.K && L.K.w > 40 ? L.K : { x: S.x + S.w * .55, y: S.y + S.h * .25, w: S.w * .4, h: S.h * .6 };
    const g = {
      Hn, k, B: 58.5 * k, Hp, kp, Bp: 58.5 * kp,
      y0, yTop: y0 - fs * .73, cyH: y0 - fs * .36, yGaris: y0 - fs * .34,
      xL: S.x + Hn * .5, xR: S.x + S.w - Hn * .5, R0: u * .34, c: tataCincin(), ir: barisIrisan(), K,
      G: { x: Math.max(K.x + K.w * .62, K.x + K.w - Hn * .56), y: K.y + 1.5 },   // dekat sudut kanan: sisi kartu yang kosong       // pegangan di tepi atas kartu (sisi kanan kosong)
      hang: 84 * k,                                  // tangan → pusat badan saat bergelantung
      xPay: S.x + S.w * .82
    };
    g.Pd = { x: Math.min(g.G.x + Hp * .44, K.x + K.w - Hp * .3), y: K.y };   // pijakan Si Payung
    g.M = { x: g.G.x + 15 * k, y: K.y + 14 * k };                           // tangan bertemu tangan
    AK.g = g; AK.ver = R.tataVer;
    return g;
  }

  /* ---------- Permukaan showreel yang dipijak (rumus sama dengan beat) ---------- */
  function midData(t) { return kameraData(t) * .6 - E.expoIn(seg(t, 6180, 6460)) * L.W * .95; }
  function puncakBatang(t, i) {
    const c = AK.g.c, n = BATANG.length, slot = (c.bx1 - c.bx0) / n, rentang = c.by1 - c.by0;
    const h = BATANG[i] * rentang * E.elastis(seg(t, 4760 + i * 55, 4760 + i * 55 + 900));
    return { x: c.bx0 + slot * (i + .5) + midData(t), y: c.by1 - h };
  }
  function titikTren(t) {
    const c = AK.g.c, n = BATANG.length, slot = (c.bx1 - c.bx0) / n, rentang = c.by1 - c.by0, m = midData(t);
    const pts = [];
    for (let i = 0; i < n; i++) pts.push(c.bx0 + slot * (i + .5) + m, c.by1 - BATANG[i] * rentang - rentang * .1 - (i % 2 ? rentang * .04 : 0));
    let tot = 0; const pj = [];
    for (let i = 0; i < n - 1; i++) { const d = Math.hypot(pts[i * 2 + 2] - pts[i * 2], pts[i * 2 + 3] - pts[i * 2 + 1]); pj.push(d); tot += d; }
    let s = tot * E.expoInOut(seg(t, 5150, 5750));
    for (let i = 0; i < n - 1; i++) {
      if (s <= pj[i]) { const f = s / pj[i]; return { x: lerp(pts[i * 2], pts[i * 2 + 2], f), y: lerp(pts[i * 2 + 1], pts[i * 2 + 3], f), a: Math.atan2(pts[i * 2 + 3] - pts[i * 2 + 1], pts[i * 2 + 2] - pts[i * 2]) }; }
      s -= pj[i];
    }
    return { x: pts[n * 2 - 2], y: pts[n * 2 - 1], a: Math.atan2(pts[n * 2 - 1] - pts[n * 2 - 3], pts[n * 2 - 2] - pts[n * 2 - 4]) };
  }
  function ujungRebung(t, kk) {
    const S = L.S, R0 = AK.g.R0, rot = paramMorf(t)[2] + Math.max(0, t - 3640) * .00012;
    const h = R0 * .4 * E.backOut(seg(t, 3860 + kk * 20, 4080 + kk * 20)) * (1 - E.expoIn(seg(t, 4120, 4300)));
    const a = -HALF + rot + kk * PI / 4, r = R0 * 1.32 + Math.max(0, h);
    return { x: S.cx + Math.cos(a) * r, y: S.cy + Math.sin(a) * r, a };
  }
  function puncakLingkaran(t) {
    const S = L.S, c = AK.g.c, R0 = AK.g.R0;
    if (t >= 4760) return { x: c.cx + midData(t), y: c.cy - c.R * 1.06 };
    const pin = E.expoInOut(seg(t, 4440, 4760));
    const nr = lerp(R0 * lerp(1.02, .9, E.expoInOut(seg(t, 4200, 4440))), c.R * 1.06, pin);
    return { x: lerp(S.cx, c.cx, pin), y: lerp(S.cy, c.cy, pin) - nr };
  }
  function oxPanel(b, t) {
    const mulai = 6380 + b.u * 55, masuk = E.expoOut(seg(t, mulai, mulai + (b.kata ? 420 : 340)));
    const kel = 7420 + (4 - b.u) * 45, keluar = E.expoIn(seg(t, kel, kel + 340));
    let ox = b.dari * L.W * (1 - masuk) - b.dari * L.W * keluar;
    if (t >= 7330 && t < 7364) ox += (acak(Math.floor((t - 7330) / 17) * 13 + b.u) - .5) * 48;
    return ox;
  }

  /* =================================================================
   *  POSE — Si Peci. Satuan anggota badan = satuan viewBox (120 × 132).
   *  Sudut lengan = arah kanvas (0 kanan, π/2 bawah) dalam ruang lokal.
   * ================================================================= */
  function poseKosongN() {
    return { x: 0, y: 0, rot: 0, sx: 1, sy: 1, f: 1, a: 1, aL: HALF + .42, aR: HALF - .42, pL: 22, pR: 22, tL: null, tR: null,
      kL: [0, 0], kR: [0, 0], mata: 'tekad', lx: 0, ly: 0, pena: 0, penA: 0, depan: false, kabur: 0, kontak: false, sarung: 0 };
  }
  /** Kaki menapak di (fx, fy); rotasi berporos di kaki. */
  function diKaki(P, fx, fy, B) { P.x = fx + Math.sin(P.rot) * B * P.sy; P.y = fy - Math.cos(P.rot) * B * P.sy; P.kontak = true; }
  /** Terbang: titik kaki pada lintasan; rotasi di pusat badan (ujung lintasan selalu tegak). */
  function diUdara(P, fx, fy, B) { P.x = fx; P.y = fy - B; P.kontak = false; }
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
  /** Lompatan kaki-ke-kaki; A & B boleh bergerak (dievaluasi pada t yang sama). */
  function lompat(P, t, t0, t1, A, Bt, tinggi, putar, B) {
    const p = seg(t, t0, t1);
    udara(P, p, putar);
    diUdara(P, lerp(A.x, Bt.x, p), lerp(A.y, Bt.y, p) - tinggi * 4 * p * (1 - p), B);
    return p;
  }
  function balikHadap(P, t, t0, dari, ke, dur = 60) {
    const p = seg(t, t0, t0 + dur);
    P.f = p < .5 ? dari : ke; P.sx *= Math.max(.08, Math.abs(Math.cos(PI * p)));
  }

  function poseNinja(t) {
    if (t < 540 || t >= 9350) return null;
    const g = geoAktor(), S = L.S, k = g.k, B = g.B, Hn = g.Hn, fs = L.fsKata;
    const P = poseKosongN();
    const ir = g.ir, CATAT = ir[0], PANTAU = ir[2], BINA = ir[4];

    /* 1 · Muncul dari asap di titik hentakan (0,54), jongkok, siap */
    if (t < 790) {
      P.sy = t < 700 ? lerp(.5, 1, E.backOut(seg(t, 540, 700))) : 1 - .2 * E.sineInOut(seg(t, 700, 790));
      P.sx = 1 + (1 - P.sy) * .8;
      P.a = E.expoOut(seg(t, 540, 590));
      P.aL = HALF + 1.1; P.aR = HALF - 1.1 - .6 * seg(t, 700, 790);
      P.kL = [-6, 0]; P.kR = [6, 0];
      diKaki(P, S.cx, S.cy, B); return P;
    }
    /* 2 · Salto belakang ke tepi kiri; mendarat saat huruf pertama naik (1,25) */
    if (t < 1250) {
      lompat(P, t, 790, 1250, { x: S.cx, y: S.cy }, { x: g.xL, y: g.y0 }, fs * 1.0 + Hn * .9, -1, B);
      return P;
    }
    /* 3 · Menghunus qalam emas, ancang-ancang */
    if (t < 1660) return siapTebas(P, t, 1250, 1560, g.xL, g);
    /* 4 · Tebasan 1 bersama bilah emas */
    if (t < 2060) return tebas(P, t, 1, g);
    /* 5 · Salto depan kembali ke kiri di atas kata TAHFIZ */
    if (t < 2250) {
      P.f = -1; P.pena = 1; P.penA = -HALF - .5;
      lompat(P, t, 2060, 2250, { x: g.xR, y: g.y0 }, { x: g.xL, y: g.y0 }, fs * 1.15 + Hn * .7, 1, B);
      P.kabur = 1; return P;
    }
    if (t < 2360) {
      mendarat(P, t - 2250); balikHadap(P, t, 2252, -1, 1, 56);
      P.pena = 1; P.depan = true; P.aR = -.35; P.penA = -1.05; P.aL = HALF + .6;
      const anc = E.sineInOut(seg(t, 2300, 2360)); P.sy *= 1 - .16 * anc; P.sx *= 1 + .1 * anc; P.rot = -.12 * anc;
      diKaki(P, g.xL, g.y0, B); return P;
    }
    /* 6 · Tebasan 2 */
    if (t < 2660) return tebas(P, t, 2, g);
    /* 7 · Naik ke puncak PRESTASI, menunggangi remuknya */
    if (t < 2860) {
      P.f = -1; P.pena = 1; P.penA = -HALF;
      lompat(P, t, 2660, 2860, { x: g.xR, y: g.y0 }, { x: S.cx, y: g.yTop }, Hn * .9, 1, B);
      return P;
    }
    if (t < 3020) {
      const sy = 1 - .985 * E.backIn(seg(t, 2860, 3020));
      P.f = -1; mendarat(P, t - 2860);
      P.mata = 'kaget'; P.aL = -HALF - .6; P.aR = -HALF + .6;
      diKaki(P, S.cx, g.cyH + (g.yTop - g.cyH) * sy, B); return P;
    }
    /* 8 · Garis menyusut di bawah kaki → oleng satu kaki */
    if (t < 3110) {
      P.f = -1; P.mata = 'kaget';
      const w = Math.sin((t - 3020) / 32);
      P.rot = .2 * w; P.aL = PI + .3 + .7 * Math.sin(t / 38); P.aR = -.3 - .7 * Math.sin(t / 38 + 1.4);
      P.kL = [-4, -12]; P.sy = 1 - .12 * seg(t, 3060, 3110);
      diKaki(P, S.cx, g.yGaris, B); return P;
    }
    /* 9 · Dilontarkan jari-jari girih (3,11) → mendarat di ujung pucuk rebung (3,88) */
    if (t < 3880) {
      const A = { x: S.cx, y: g.yGaris }, T = ujungRebung(t, 0);
      const puncak = S.y - Hn * .2;
      const H = Math.max(Hn, (A.y + T.y) / 2 - puncak);
      P.mata = seg(t, 3110, 3300) < 1 ? 'kaget' : 'tekad';
      lompat(P, t, 3110, 3880, A, T, H, 2, B);
      P.kabur = t < 3300 ? 1 : 0; return P;
    }
    if (t < 4140) {
      const T = ujungRebung(t, 0);
      P.rot = T.a + HALF; mendarat(P, t - 3880);
      P.kL = [-3, -14]; P.aL = PI - .1 + .25 * Math.sin(t / 70); P.aR = -.1 - .25 * Math.sin(t / 70);
      P.pena = 1; P.depan = true; P.penA = P.aR - 1.2;
      diKaki(P, T.x, T.y, B); return P;
    }
    if (t < 4200) {
      P.f = -1;
      lompat(P, t, 4140, 4200, ujungRebung(t, 0), ujungRebung(t, 7), Hn * .32, 0, B); return P;
    }
    if (t < 4280) {
      const T = ujungRebung(t, 7);
      P.f = -1; P.rot = T.a + HALF; mendarat(P, t - 4200);
      P.aL = PI - .2; P.aR = -.2; diKaki(P, T.x, T.y, B); return P;
    }
    /* 10 · Jatuh ke puncak lingkaran, lalu berlari di atasnya saat ia pindah menjadi cincin */
    if (t < 4400) {
      P.mata = 'kaget';
      lompat(P, t, 4280, 4400, ujungRebung(4280, 7), puncakLingkaran(t), Hn * .15, 0, B);
      P.aL = -HALF - .5; P.aR = -HALF + .5; return P;
    }
    if (t < 4760) {
      const T = puncakLingkaran(t);
      mendarat(P, t - 4400);
      if (t > 4440 && L.S.w >= L.S.h * 1.15) lari(P, t, 80);
      diKaki(P, T.x, T.y, B); if (P.bob) P.y += P.bob * k; return P;
    }
    /* 11 · Melompati tujuh batang — tiap pendaratan di puncak lentingan */
    if (t < 4950) {
      lompat(P, t, 4760, 4950, puncakLingkaran(t), puncakBatang(t, 0), Hn * .55, 0, B); return P;
    }
    if (t < 5910) {
      const i = Math.floor((t - 4950) / 160), q = t - 4950 - i * 160;
      if (q < 42) {
        const T = puncakBatang(t, i);
        mendarat(P, q); P.aL = HALF + .9; P.aR = HALF - .9; P.kL = [-5, 0]; P.kR = [5, 0];
        diKaki(P, T.x, T.y, B); return P;
      }
      lompat(P, t, 4950 + i * 160 + 42, 4950 + (i + 1) * 160, puncakBatang(t, i), puncakBatang(t, i + 1), Hn * .42, i % 2, B);
      return P;
    }
    if (t < 6180) {
      const T = puncakBatang(t, 6);
      mendarat(P, t - 5910);
      const pom = busur(seg(t, 6020, 6140));
      P.mata = t > 5990 ? 'senang' : 'tekad';
      P.pena = 1; P.depan = true; P.aR = -HALF - .15 - .2 * pom; P.penA = -HALF - .1;
      P.aL = HALF + .3; P.sy *= 1 + .06 * pom;
      if (t > 6120) { P.sy *= 1 - .2 * E.sineInOut(seg(t, 6120, 6180)); P.mata = 'tekad'; }
      diKaki(P, T.x, T.y, B); return P;
    }
    /* 12 · Whip-pan: melompat dari batang yang tersapu, mendarat di panel CATAT */
    const xCatat = S.x + S.w * .62;
    if (t < 6560) {
      P.f = -1; P.kabur = t < 6460 ? 1 : 0;
      const A = puncakBatang(6180, 6);
      lompat(P, t, 6180, 6560, A, { x: xCatat + oxPanel(CATAT, t), y: CATAT.y }, Math.max(Hn, A.y - S.y + Hn * .2), 1, B);
      return P;
    }
    const geserC = (t2) => oxPanel(CATAT, t2) - oxPanel(CATAT, 6560);
    if (t < 6820) {
      P.f = -1; mendarat(P, t - 6560);
      const p = E.sineInOut(seg(t, 6640, 6820));
      if (t > 6640) lari(P, t, 70);
      diKaki(P, lerp(xCatat, S.x + S.w * .3, p) + geserC(t), CATAT.y, B); if (P.bob) P.y += P.bob * k; return P;
    }
    const xP0 = S.x + S.w * .2, xP1 = S.x + S.w * .64, xB = S.x + S.w * .72;
    if (t < 6940) {
      P.f = -1;
      lompat(P, t, 6820, 6940, { x: S.x + S.w * .3 + geserC(t), y: CATAT.y }, { x: xP0 + oxPanel(PANTAU, t), y: PANTAU.y }, Hn * .3, 0, B);
      return P;
    }
    const geserP = (t2) => oxPanel(PANTAU, t2) - oxPanel(PANTAU, 6940);
    if (t < 7150) {
      mendarat(P, t - 6940); balikHadap(P, t, 6942, -1, 1, 50);
      const p = E.sineInOut(seg(t, 6990, 7150));
      if (t > 6990) lari(P, t, 70);
      diKaki(P, lerp(xP0, xP1, p) + geserP(t), PANTAU.y, B); if (P.bob) P.y += P.bob * k; return P;
    }
    if (t < 7270) {
      lompat(P, t, 7150, 7270, { x: xP1 + geserP(t), y: PANTAU.y }, { x: xB + oxPanel(BINA, t) - oxPanel(BINA, 7270), y: BINA.y }, Hn * .32, 1, B);
      return P;
    }
    /* 13 · Di panel BINA: ikut ter-glitch, lalu dilontarkan panel yang keluar ke kanan */
    const geserB = (t2) => oxPanel(BINA, t2) - oxPanel(BINA, 7270);
    if (t < 7560) {
      mendarat(P, t - 7270);
      P.pena = 0;
      if (t > 7420) { P.sy *= 1 - .22 * E.sineInOut(seg(t, 7420, 7520)); P.rot = .12 * seg(t, 7420, 7520); P.aL = HALF + 1.2; P.aR = HALF - 1.4; }
      diKaki(P, xB + geserB(t), BINA.y, B); return P;
    }
    if (t < 7780) {
      const p = seg(t, 7560, 7780);
      const A = { x: xB + geserB(7560), y: BINA.y - B };
      const T = { x: g.G.x, y: g.G.y + g.hang };
      const H = Math.max(Hn * .7, (A.y + T.y) / 2 - (Math.min(A.y, T.y) - Hn * .9));
      udara(P, p, 2);
      P.x = lerp(A.x, T.x, p); P.y = lerp(A.y, T.y, p) - H * 4 * p * (1 - p);
      if (p > .72) { const r = E.expoOut(seg(p, .72, 1)); P.aL = lerp(P.aL, -HALF - .18, r); P.aR = lerp(P.aR, -HALF + .18, r); P.kL = [0, 0]; P.kR = [0, 0]; }
      P.kabur = 1; return P;
    }
    /* 14 · Bergelantung di tepi kartu (7,78 – 9,30) */
    {
      const dt = t - 7780;
      let th = .62 * Math.exp(-dt / 460) * Math.sin(dt / 118);
      const lepas = seg(t, 8480, 8540), tolong = E.expoOut(seg(t, 8620, 8780));
      if (t > 8480) th += .26 * Math.exp(-(t - 8480) / 230) * Math.sin((t - 8480) / 64);
      const gx = g.G.x - 12 * k * lepas * (1 - tolong) + 4 * k * tolong, off = g.hang + 8 * k * lepas * (1 - tolong);
      P.rot = -th - .2 * lepas * (1 - tolong) + .08 * tolong;
      P.x = gx + Math.sin(th) * off; P.y = g.G.y + Math.cos(th) * off;
      const tangkap = pegas(dt, .14, 120, 40); P.sy = 2 - tangkap; P.sx = tangkap;
      P.tL = { x: g.G.x - 13 * k, y: g.G.y - 2 * k };
      if (t < 8480) P.tR = { x: g.G.x + 13 * k, y: g.G.y - 2 * k };
      else if (t < 8620) { P.tR = null; P.aR = -.4 + .55 * Math.sin((t - 8480) / 42); P.pR = 22; }
      else P.tR = g.M;
      const ay = Math.sin(dt / 118 - .9) * Math.exp(-dt / 600);
      P.kL = [-th * 16 + ay * 4, 3]; P.kR = [-th * 16 + ay * 5 + 1.5 * Math.sin(t / 170), 3];
      P.mata = t < 7900 ? 'kaget' : t < 8480 ? 'tekad' : t < 8640 ? 'kaget' : t < 8900 ? 'khawatir' : 'senang';
      P.lx = t < 8480 ? -2.5 : t < 8640 ? 0 : 3; P.ly = t < 8480 ? -1.5 : 0;
      if (t >= 9300) { const q = seg(t, 9300, 9345); P.a = 1 - q; P.sx *= 1 + .25 * q; P.sy *= 1 + .25 * q; }
      return P;
    }
  }
  function siapTebas(P, t, tDarat, tAncang, x, g) {
    mendarat(P, t - tDarat);
    const h = E.backOut(seg(t, tDarat + 80, tDarat + 230));
    P.pena = h > .02 ? 1 : 0; P.depan = h > .3;
    P.aR = lerp(-HALF - .9, -.35, h); P.penA = lerp(-2.5, -1.05, h);
    P.aL = HALF + .6;
    const anc = E.sineInOut(seg(t, tAncang, tAncang + 100));
    P.sy *= 1 - .16 * anc; P.sx *= 1 + .1 * anc; P.rot = -.12 * anc;
    diKaki(P, x, g.y0, g.B); return P;
  }
  /** Tebasan: Si Peci melesat di tepi depan bilah emas; tergelincir di tepi kanan panggung. */
  function tebas(P, t, i, g) {
    const s = sapuan(t, i), ujung = s.e + g.Hn * .2;
    P.pena = 1; P.depan = true;
    if (ujung < g.xL) {                      // bilah belum tiba: tetap jongkok ancang-ancang
      const getar = Math.sin(t / 23) * .012;
      P.sy = .84 + getar; P.sx = 1.1; P.rot = -.12;
      P.aR = -.35; P.penA = -1.05; P.aL = HALF + .6;
      diKaki(P, g.xL, g.y0, g.B); return P;
    }
    if (ujung < g.xR) {                      // melesat
      lari(P, t, 46);
      P.rot = .42; P.aR = .55; P.penA = PI - .22; P.aL = PI - .35; P.kabur = 1;
      diKaki(P, ujung, g.y0, g.B); P.y += (P.bob || 0) * g.k; return P;
    }
    // tergelincir (rem) — percikan di kaki
    const pRem = Math.min(1, (ujung - g.xR) / (g.Hn * 1.6));
    P.rot = lerp(.42, -.32, E.expoOut(pRem)); P.kL = [10, 0]; P.kR = [-4, -3];
    P.aR = -.3; P.penA = -1.3; P.aL = HALF + 1.4; P.rem = 1 - pRem;
    if (t > s.mulai + 340) { const q = seg(t, s.mulai + 340, s.mulai + 400); P.rot = lerp(-.32, 0, q); P.sy = 1 - .15 * busur(q); P.rem = 0; }
    diKaki(P, g.xR, g.y0, g.B); return P;
  }

  /* =================================================================
   *  POSE — Si Payung. Satuan = viewBox (0 −24 150 194), pusat 75,110.
   * ================================================================= */
  function poseKosongJ() {
    return { x: 0, y: 0, rot: 0, sx: 1, sy: 1, f: 1, a: 1, hx: 112, hy: 130, uA: -.33, buka: 1, putar: 0, uDepan: false,
      lA: 2.05, lP: 25, tL: null, mata: 'normal', mulut: 'normal', lx: 0, ly: 0, kembang: 0, angin: 0, kaki: 0, kabur: 0 };
  }
  function diKakiJ(P, fx, fy, Bp) { P.x = fx + Math.sin(P.rot) * Bp * P.sy; P.y = fy - Math.cos(P.rot) * Bp * P.sy; }
  /** Pose melayang berpayung: payung di atas kepala, gamis mengembang. */
  function melayang(P, t, condong = 0) {
    P.hx = 86 + condong * 10; P.hy = 34; P.uA = condong * .5; P.uDepan = true;
    P.kembang = .8; P.kaki = 1; P.lA = 2.3 + .2 * Math.sin(t / 260); P.lP = 24;
  }
  function putaranPayung(t) {
    // putaran dasar + dua putaran cepat pada denyut morf 3,90 & 4,16
    let ph = t * .0016;
    for (const b of [3900, 4160]) ph += TAU * E.expoOut(seg(t, b, b + 520));
    if (t > 9450) ph += TAU * 1.5 * E.expoOut(seg(t, 9450, 9950));
    return ph;
  }
  function posePayung(t) {
    if (t < 2880 || t >= 9990) return null;
    if (t >= 6460 && t < 6900) return null;
    const g = geoAktor(), S = L.S, kp = g.kp, Bp = g.Bp, Hp = g.Hp;
    const P = poseKosongJ();
    P.putar = putaranPayung(t);
    const kedip = [[3300, 3380], [4700, 4780], [7120, 7200], [8350, 8420]].some(([a, b]) => t >= a && t < b);
    const yLayang = S.cy - g.R0 * .72;
    /* 1 · Turun berpayung (2,88–3,56) */
    if (t < 3560) {
      const p = E.quartOut(seg(t, 2880, 3560));
      melayang(P, t, Math.sin((t - 2880) / 300) * .5);
      P.x = g.xPay + Math.sin((t - 2880) / 300) * Hp * .22;
      P.y = lerp(S.y - Hp * 2.2, yLayang, p);
      P.rot = Math.cos((t - 2880) / 300) * .1; P.angin = -.6 * (1 - p);
      P.a = E.expoOut(seg(t, 2880, 3000));
      P.mata = kedip ? 'pejam' : 'normal'; return P;
    }
    /* 2 · Menari di atas girih: putar payung + kelopak pada tiap denyut */
    if (t < 4400) {
      melayang(P, t, 0);
      let lonjak = 0;
      for (const b of [3900, 4160]) lonjak += busur(seg(t, b, b + 300)) * Hp * .16;
      P.x = g.xPay + Math.sin((t - 2880) / 300) * Hp * .22 * (1 - seg(t, 3560, 4400));
      P.y = yLayang + Math.sin((t - 3560) / 340) * 3 - lonjak;
      P.rot = Math.cos((t - 2880) / 300) * .1 * (1 - seg(t, 3560, 3900));
      P.mata = kedip ? 'pejam' : (t > 3900 ? 'senang' : 'normal'); P.mulut = t > 3900 ? 'senang' : 'normal';
      P.kembang = .8 + .2 * lonjak / (Hp * .16 + .01); return P;
    }
    /* 3 · Meluncur turun ke pangkal garis tren (4,40–5,15) */
    if (t < 5150) {
      const p = E.sineInOut(seg(t, 4400, 5150));
      const A = { x: g.xPay, y: yLayang + Bp }, T = titikTren(5150);
      melayang(P, t, -.6 * busur(p));
      const fx = lerp(A.x, T.x, p), fy = lerp(A.y, T.y, p) - Hp * .5 * busur(p);
      P.rot = -.12 * busur(p);
      if (p > .85) { const q = seg(p, .85, 1); P.kaki = 1 - q; P.kembang = .8 * (1 - q); P.hy = lerp(34, 120, q); P.hx = lerp(80, 112, q); P.uA = lerp(P.uA, -.5, q); }
      diKakiJ(P, fx, fy, Bp);
      P.mata = kedip ? 'pejam' : 'normal'; return P;
    }
    /* 4 · Meluncur di garis tren sebagai kepala pena (5,15–5,75) */
    if (t < 5750) {
      const T = titikTren(t);
      const laju = busur(seg(t, 5150, 5750));
      P.rot = .35 * laju + T.a * .5; P.hx = 116; P.hy = 116; P.uA = -.55 - .35 * laju;
      P.angin = -1 * laju; P.kembang = .25 * laju; P.lA = 2.5 + .3 * laju; P.lP = 26;
      P.mata = 'senang'; P.mulut = 'senang';
      diKakiJ(P, T.x, T.y, Bp); return P;
    }
    /* 5 · Lepas landas dari ujung garis, melayang; whip-pan menyapunya */
    {
      if (t < 6900) {
        const T = titikTren(5750), p = E.expoOut(seg(t, 5750, 6050)), q = E.expoOut(seg(t, 5750, 5900));
        melayang(P, t, .3 * (1 - p));
        P.hx = lerp(116, P.hx, q); P.hy = lerp(116, P.hy, q); P.uA = lerp(-.55, P.uA, q); P.uDepan = q > .5;
        P.kembang *= q; P.kaki = q; P.rot = lerp(T.a * .5, 0, q);
        const m = midData(t) - midData(5750);
        P.x = T.x + Hp * .35 * p + m; P.y = T.y - Bp - Hp * .9 * p + Math.sin((t - 5750) / 260) * 3;
        P.mata = 'senang'; P.mulut = 'senang';
        if (t > 6180) { P.kabur = 1; P.mata = 'kaget'; P.mulut = 'o'; P.angin = 1; P.rot = -.3 * seg(t, 6180, 6300); }
        return P;
      }
    }
    /* 6 · Melayang dari kiri di atas panel (6,90–7,95), menuju kartu */
    if (t < 7950) {
      const yAtas = S.y + Hp * 1.3;
      const T = { x: g.Pd.x, y: g.Pd.y - Hp * 1.7 };
      melayang(P, t, .6);
      if (t < 7420) {
        const p = E.sineInOut(seg(t, 6900, 7420));
        P.x = lerp(-Hp, S.x + S.w * .62, p); P.y = yAtas + Math.sin((t - 6900) / 230) * Hp * .1;
      } else {
        const p = E.sineInOut(seg(t, 7420, 7950));
        const a0 = { x: S.x + S.w * .62, y: yAtas };
        const cx = (a0.x + T.x) / 2, cy = Math.min(a0.y, T.y) - Hp * .6;
        P.x = (1 - p) * (1 - p) * a0.x + 2 * (1 - p) * p * cx + p * p * T.x;
        P.y = (1 - p) * (1 - p) * a0.y + 2 * (1 - p) * p * cy + p * p * T.y;
        melayang(P, t, .6 * (1 - p));
      }
      P.rot = .14; P.angin = -.7; P.a = E.expoOut(seg(t, 6900, 7020));
      P.mata = kedip ? 'pejam' : 'normal'; return P;
    }
    /* 7 · Mendarat di tepi kartu saat sapuan emas (8,25) */
    if (t < 8250) {
      const p = E.sineInOut(seg(t, 7950, 8250));
      melayang(P, t, 0);
      P.kembang = .8 * (1 - p * .5);
      const fy = lerp(g.Pd.y - Hp * 1.7 + Bp, g.Pd.y, p);
      diKakiJ(P, g.Pd.x, fy, Bp);
      P.mata = kedip ? 'pejam' : 'normal'; return P;
    }
    /* 8 · Berlutut memayungi & mengulurkan tangan (8,25–9,30) */
    if (t < 9450) {
      const dt = t - 8250;
      const s = pegas(dt, .2, 90, 46);
      const turun = E.sineInOut(seg(t, 8260, 8460));
      P.sy = s * (1 - .1 * turun); P.sx = 1 + (1 - s) * .8;
      P.rot = -.3 * turun;
      P.hx = lerp(86, 108, turun); P.hy = lerp(34, 100, turun); P.uA = lerp(0, -.62, turun); P.uDepan = turun < .5;
      P.buka = 1 - .12 * turun;
      P.kembang = .3 * (1 - turun);
      P.lx = -2.5; P.ly = 2;
      const raih = E.backOut(seg(t, 8520, 8640)) * (1 - E.expoOut(seg(t, 9330, 9450)));
      if (raih > 0) { P.tL = g.M; P.tLp = raih; }
      if (t >= 8480 && t < 8640) { P.mata = 'kaget'; P.mulut = 'o'; }
      else if (t >= 8640 && t < 8900) { P.mata = 'khawatir'; P.mulut = 'o'; }
      else if (t >= 8900 && t < 9300) { P.mata = 'senang'; P.mulut = 'senang'; }
      else if (t >= 9300) { P.mata = 'kaget'; P.mulut = 'o'; P.lx = Math.sin((t - 9300) / 40) * 3; }
      else P.mata = kedip ? 'pejam' : 'normal';
      diKakiJ(P, g.Pd.x, g.Pd.y, Bp); return P;
    }
    /* 9 · Pulang: payung mekar, terbang ke atas saat garis menyusut */
    {
      const p = seg(t, 9520, 9950), q = E.expoOut(seg(t, 9450, 9540));
      melayang(P, t, .2);
      P.hx = lerp(108, P.hx, q); P.hy = lerp(100, P.hy, q); P.uA = lerp(-.62, P.uA, q); P.uDepan = q > .5;
      P.rot = lerp(-.3, .06 * Math.sin((t - 9450) / 160), q);
      P.buka = lerp(.88, 1, q);
      P.mata = 'senang'; P.mulut = 'senang';
      const jongkok = busur(seg(t, 9450, 9530));
      P.sy = (1 - .1 * (1 - q)) * (1 - .14 * jongkok); P.sx = 1 + .1 * jongkok;
      const naik = E.expoIn(p) * (g.Pd.y + Hp * 2.4) + p * Hp * .5;
      diKakiJ(P, g.Pd.x + Hp * .6 * E.sineInOut(p), g.Pd.y - naik, Bp);
      P.kaki = p > 0 ? 1 : 0; P.kembang = .9 * Math.min(1, p * 4);
      P.a = 1 - seg(t, 9740, 9950); return P;
    }
  }

  /* =================================================================
   *  GAMBAR — Si Peci
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
    const kiri = sisi < 0, px = kiri ? 27 : 93, py = kiri ? 60 : 60;
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
    ca.strokeStyle = '#F2C94C'; ca.lineWidth = .9; ca.beginPath(); ca.moveTo(pj * .64, 0); ca.lineTo(pj * .8, 0); ca.stroke();
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
    ca.globalAlpha *= .9; ca.beginPath(); ca.arc(44.6 + lx, 63 + ly, 1.5, 0, TAU); ca.arc(72.6 + lx, 63 + ly, 1.5, 0, TAU); ca.fill(); ca.globalAlpha /= .9;
    if (P.mata === 'tekad' || P.mata === 'khawatir') {
      // kelopak atas: tekad = miring ke dalam (fokus), khawatir = miring ke luar
      const kd = P.mata === 'tekad';
      ca.save();
      ca.beginPath(); ca.ellipse(46, 57, 11.6, 12.8, 0, 0, TAU); ca.ellipse(74, 57, 11.6, 12.8, 0, 0, TAU); ca.clip();
      ca.fillStyle = '#3F9AD0';
      ca.beginPath();
      if (kd) { ca.moveTo(33, 40); ca.lineTo(33, 49); ca.lineTo(58, 55); ca.lineTo(58, 40); ca.moveTo(62, 40); ca.lineTo(62, 55); ca.lineTo(87, 49); ca.lineTo(87, 40); }
      else { ca.moveTo(33, 40); ca.lineTo(33, 52); ca.lineTo(58, 46); ca.lineTo(58, 40); ca.moveTo(62, 40); ca.lineTo(62, 46); ca.lineTo(87, 52); ca.lineTo(87, 40); }
      ca.fill(); ca.restore();
      ca.lineWidth = 2.6;
      ca.beginPath();
      if (kd) { ca.moveTo(34, 48.6); ca.lineTo(57.5, 54.4); ca.moveTo(62.5, 54.4); ca.lineTo(86, 48.6); }
      else { ca.moveTo(35, 51.6); ca.lineTo(57, 46.2); ca.moveTo(63, 46.2); ca.lineTo(85, 51.6); }
      ca.stroke();
    }
  }
  /** Ekor syal: posisi simpul pada t, t−20, t−40 … (jejak waktu) + bentuk diam + kibar. */
  function syal(t, P) {
    const g = AK.g, k = g.k, N = 9, pts = [];
    for (let i = 0; i <= N; i++) {
      const Q = i === 0 ? P : (poseNinja(((t - i * 20) % 1e4 + 1e4) % 1e4) || P);
      const w = keDunia(Q, 17, 73, k, 60, 72);
      const kib = Math.sin(t / 85 - i * .9) * i * .55 * k;
      pts.push(w.x - P.f * i * 3.4 * k, w.y + i * 1.1 * k + i * i * .12 * k + kib);
    }
    // batasi panjang ruas (deterministik) supaya jejak laju tidak memanjang tak wajar
    const maks = 6.2 * k;
    for (let i = 1; i <= N; i++) {
      const dx = pts[i * 2] - pts[i * 2 - 2], dy = pts[i * 2 + 1] - pts[i * 2 - 1], d = Math.hypot(dx, dy);
      if (d > maks) { pts[i * 2] = pts[i * 2 - 2] + dx / d * maks; pts[i * 2 + 1] = pts[i * 2 - 1] + dy / d * maks; }
    }
    for (const [geser, lebarP, warna] of [[1.6, 4.2, '#16223F'], [-1.4, 3.6, '#22345E']]) {
      ca.beginPath();
      const kiri = [], kanan = [];
      for (let i = 0; i <= N; i++) {
        const j = Math.min(N, i + 1), h = Math.max(0, i - 1);
        const tx = pts[j * 2] - pts[h * 2], ty = pts[j * 2 + 1] - pts[h * 2 + 1], d = Math.hypot(tx, ty) || 1;
        const nx = -ty / d, ny = tx / d, w = lebarP * k * (1 - i / (N + 2));
        const ox = pts[i * 2] + nx * geser * k, oy = pts[i * 2 + 1] + ny * geser * k + i * geser * .3 * k;
        kiri.push(ox + nx * w, oy + ny * w); kanan.push(ox - nx * w, oy - ny * w);
      }
      ca.moveTo(kiri[0], kiri[1]);
      for (let i = 1; i <= N; i++) ca.lineTo(kiri[i * 2], kiri[i * 2 + 1]);
      for (let i = N; i >= 0; i--) ca.lineTo(kanan[i * 2], kanan[i * 2 + 1]);
      ca.closePath(); ca.fillStyle = warna; ca.fill();
      // ujung emas
      ca.fillStyle = W_.emas; ca.beginPath(); ca.arc(pts[N * 2] , pts[N * 2 + 1], 2.2 * k, 0, TAU); ca.fill();
    }
  }
  function gambarNinja(P, t, opsi = {}) {
    const A = asetAktor(), g = AK.g, k = g.k;
    ca.save();
    ca.globalAlpha = P.a * (opsi.alpha ?? 1);
    if (!opsi.hantu) syal(t, P);
    ca.translate(P.x, P.y); ca.rotate(P.rot); ca.scale(P.f * P.sx * k, P.sy * k); ca.translate(-60, -72);
    // qalam di punggung (di belakang badan)
    if (!P.pena) pena(30, 100, -.85, 130);
    lenganN(P, -1);
    // kaki
    for (const [cx, kk, warna] of [[44, P.kL, '#1F6A9E'], [76, P.kR, '#2777AE']]) {
      ca.fillStyle = warna; ca.beginPath(); ca.ellipse(cx + kk[0], 124 + kk[1], 11.5, 6.5, 0, 0, TAU); ca.fill();
      ca.fillStyle = 'rgba(255,255,255,.22)'; ca.beginPath(); ca.ellipse(cx - 2 + kk[0], 122 + kk[1], 6, 2.4, 0, 0, TAU); ca.fill();
    }
    let tangan = null;
    if (!P.depan) tangan = lenganN(P, 1);
    if (P.pena && !P.depan && tangan) pena(tangan.x, tangan.y, P.penA, 92);
    // badan
    ca.fillStyle = A.gKulitN; ca.fill(A.nBadan);
    ca.save(); ca.globalAlpha *= .55; ca.strokeStyle = '#9ADCFB'; ca.lineWidth = 2.2; ca.lineCap = 'round'; ca.stroke(A.nRim); ca.restore();
    ca.save(); ca.globalAlpha *= .62; ca.fillStyle = A.gPerut; ca.beginPath(); ca.ellipse(60, 98, 26, 10, 0, 0, TAU); ca.fill(); ca.restore();
    ca.fillStyle = '#FFE9B0'; ca.fill(A.nTanduk1); ca.fillStyle = '#F6D98E'; ca.fill(A.nTanduk2);
    // sarung (diangkat ala ninja) + sabuk emas bersimpul
    ca.save();
    if (P.sarung) { ca.translate(60, 86); ca.transform(1, 0, P.sarung, 1, 0, 0); ca.translate(-60, -86); }
    ca.fillStyle = A.polaKotak || '#7E1F33'; ca.fill(A.nSarung);
    ca.fillStyle = A.gSarungBayang; ca.fill(A.nSarung);
    ca.strokeStyle = 'rgba(58,12,24,.5)'; ca.lineWidth = 1.4; ca.beginPath(); ca.moveTo(58, 92); ca.lineTo(64, 116); ca.stroke();
    ca.restore();
    ca.fillStyle = A.gSabuk; ca.fill(A.nSabuk);
    ca.fillStyle = '#C9A227'; ca.beginPath(); ca.moveTo(24, 88); ca.lineTo(14, 100); ca.lineTo(20, 101); ca.lineTo(27, 91); ca.closePath(); ca.fill();
    ca.beginPath(); ca.moveTo(27, 88); ca.lineTo(25, 102); ca.lineTo(30, 101); ca.lineTo(31, 90); ca.closePath(); ca.fill();
    ca.fillStyle = '#E8CC6B'; ca.beginPath(); ca.ellipse(27, 88.5, 4.2, 3.6, 0, 0, TAU); ca.fill();
    // cadar ninja (dipotong mengikuti badan)
    ca.save(); ca.clip(A.nBadan);
    ca.fillStyle = A.gTopeng; ca.fill(A.nTopeng);
    ca.strokeStyle = 'rgba(232,204,107,.75)'; ca.lineWidth = 1.2; ca.stroke(A.nTopengAtas);
    ca.strokeStyle = 'rgba(255,255,255,.08)'; ca.lineWidth = 1; ca.beginPath(); ca.moveTo(40, 74); ca.quadraticCurveTo(52, 80, 48, 86); ca.moveTo(80, 74); ca.quadraticCurveTo(70, 80, 74, 86); ca.stroke();
    ca.restore();
    // pipi merona mengintip di atas cadar
    ca.save(); ca.globalAlpha *= .5; ca.fillStyle = '#FF7FAA';
    ca.beginPath(); ca.ellipse(31, 64, 6.5, 2.6, 0, 0, TAU); ca.ellipse(89, 64, 6.5, 2.6, 0, 0, TAU); ca.fill(); ca.restore();
    // oklusi + peci
    ca.save(); ca.globalAlpha *= .3; ca.fillStyle = '#0B3A5E'; ca.beginPath(); ca.ellipse(60, 29, 25, 4.5, 0, 0, TAU); ca.fill(); ca.restore();
    ca.fillStyle = A.gPeci; ca.fill(A.nPeci); ca.fillStyle = A.gPeciKilap; ca.fill(A.nPeci);
    ca.fillStyle = '#403A5E'; ca.beginPath(); ca.ellipse(60, 7.4, 21, 3, 0, 0, TAU); ca.fill();
    ca.strokeStyle = 'rgba(232,204,107,.8)'; ca.lineWidth = 1.3; ca.beginPath(); ca.moveTo(36, 25.5); ca.quadraticCurveTo(60, 31, 84, 25.5); ca.stroke();
    // kilap spekular (cahaya kanan atas)
    ca.save(); ca.globalAlpha *= .42; ca.fillStyle = '#fff'; ca.beginPath(); ca.ellipse(85, 40, 7, 11, .49, 0, TAU); ca.fill();
    ca.globalAlpha /= .42; ca.globalAlpha *= .55; ca.beginPath(); ca.arc(92, 54, 2.2, 0, TAU); ca.fill(); ca.restore();
    mataN(P);
    if (P.depan) {
      tangan = lenganN(P, 1);
      if (P.pena) pena(tangan.x, tangan.y, P.penA, 92);
    }
    ca.restore();
  }

  /* =================================================================
   *  GAMBAR — Si Payung
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
    // bunga di kubah berputar mengelilingi tangkai (ilusi 3D)
    for (let i = 0; i < 11; i++) {
      const az = i * 2.39996 + P.putar, c = Math.cos(az);
      if (c < -.15) continue;
      const y = -96 - acak(i * 3.1) * 22, rr = 64 * Math.sqrt(Math.max(0, 1 - Math.pow((y + 84) / -42, 2)) * .6 + .4);
      const x = Math.sin(az) * rr, s = .7 + acak(i * 7.7) * .6;
      ca.save(); ca.translate(x, y); ca.scale(s * Math.max(.2, c), s); ca.rotate(acak(i) * 6);
      ca.globalAlpha *= Math.min(1, (c + .15) * 3);
      ca.fillStyle = '#F7A6C3'; ca.fill(A.jBunga);
      ca.fillStyle = '#E0578A'; ca.beginPath(); ca.arc(0, 0, 1.9, 0, TAU); ca.fill();
      ca.fillStyle = '#FFE08A'; ca.beginPath(); ca.arc(0, 0, .8, 0, TAU); ca.fill();
      ca.restore();
    }
    ca.globalAlpha *= .5; ca.strokeStyle = '#fff'; ca.lineWidth = 5; ca.stroke(A.jKilapKubah); ca.globalAlpha /= .5;
    ca.save(); ca.globalAlpha *= .7; ca.fillStyle = '#fff'; ca.beginPath(); ca.ellipse(30, -112, 16, 6, .31, 0, TAU); ca.fill(); ca.restore();
    ca.restore();
    // rusuk yang ikut berputar
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
    ca.fillStyle = '#E8CC6B'; ca.beginPath(); ca.arc(0, -127 - 30 * (1 - b) * 0, 3, 0, TAU); ca.fill();
    ca.restore();
  }
  function gambarPayung(P, t, opsi = {}) {
    const A = asetAktor(), g = AK.g, kp = g.kp;
    ca.save();
    ca.globalAlpha = P.a * (opsi.alpha ?? 1);
    ca.translate(P.x, P.y); ca.rotate(P.rot); ca.scale(P.f * P.sx * kp, P.sy * kp); ca.translate(-75, -110);
    const lenganKanan = () => {
      if (Math.hypot(P.hx - 112, P.hy - 130) > 6) {
        ca.strokeStyle = '#F2B2CA'; ca.lineWidth = 12; ca.lineCap = 'round';
        ca.beginPath(); ca.moveTo(100, 112); ca.quadraticCurveTo((100 + P.hx) / 2 + 8, (112 + P.hy) / 2, P.hx, P.hy); ca.stroke();
      }
    };
    if (P.uDepan) lenganKanan();
    if (!P.uDepan) payung(P);
    // kaki (menjuntai saat melayang)
    const dj = P.kaki ? Math.sin(t / 180) * 3 : 0;
    ca.fillStyle = '#2E9C7A'; ca.beginPath(); ca.ellipse(62, 163 + P.kaki * 4 + dj, 10, 5.5, P.kaki * .3, 0, TAU); ca.fill();
    ca.fillStyle = '#35A884'; ca.beginPath(); ca.ellipse(88, 163 + P.kaki * 4 - dj, 10, 5.5, -P.kaki * .3, 0, TAU); ca.fill();
    // gamis mengembang
    const kb = P.kembang, an = P.angin;
    const hy = 158 - kb * 7, hl = 40 - kb * 11 + an * 6, hr = 110 + kb * 11 + an * 6;
    const ombak = Math.sin(t / 110) * kb * 3;
    ca.fillStyle = A.gGamis; ca.beginPath();
    ca.moveTo(47, 118); ca.quadraticCurveTo(75, 112, 103, 118); ca.lineTo(hr, hy + ombak);
    ca.quadraticCurveTo(75 + an * 5, 166 - kb * 12, hl, hy - ombak); ca.closePath(); ca.fill();
    ca.save(); ca.globalAlpha *= .5; ca.strokeStyle = '#7D69C6'; ca.lineWidth = 1.2; ca.stroke(A.jGamisLipat); ca.restore();
    // jilbab: tepi bawah berkibar mengikuti angin
    const jw = an * 7, jk = Math.sin(t / 95) * (Math.abs(an) + kb * .5) * 2.4;
    ca.fillStyle = A.gJilbab; ca.beginPath();
    ca.moveTo(75, 46); ca.bezierCurveTo(104, 46, 118, 68, 118, 92); ca.bezierCurveTo(118, 108, 121 + jw * .4, 120, 124 + jw, 128 + jk);
    ca.quadraticCurveTo(75 + jw, 142 - kb * 4, 26 + jw, 128 - jk); ca.bezierCurveTo(29 + jw * .4, 120, 32, 108, 32, 92);
    ca.bezierCurveTo(32, 68, 46, 46, 75, 46); ca.closePath(); ca.fill();
    ca.save(); ca.globalAlpha *= .8; ca.strokeStyle = '#E28DB0'; ca.lineWidth = 1.6; ca.stroke(A.jJilbabGaris);
    ca.globalAlpha /= .8; ca.globalAlpha *= .7; ca.lineWidth = 1.4; ca.stroke(A.jJilbabLipat); ca.restore();
    // lengan kiri — mengulur (ke titik dunia) atau menari
    {
      let sud = P.lA, pj = P.lP;
      if (P.tL) {
        const l = keLokal(P, P.tL.x, P.tL.y, kp, 75, 110);
        const sT = Math.atan2(l.y - 112, l.x - 50), pT = Math.max(14, Math.min(120, Math.hypot(l.x - 50, l.y - 112)));
        sud = lerp(sud, sT, P.tLp); pj = lerp(pj, pT, P.tLp);
      }
      const ex = 50 + Math.cos(sud) * pj, ey = 112 + Math.sin(sud) * pj;
      ca.strokeStyle = '#F2B2CA'; ca.lineWidth = 13; ca.lineCap = 'round';
      ca.beginPath(); ca.moveTo(50, 112); ca.lineTo(ex - Math.cos(sud) * 4, ey - Math.sin(sud) * 4); ca.stroke();
      ca.fillStyle = '#5CCFA8'; ca.beginPath(); ca.ellipse(ex, ey, 6.5, 6, 0, 0, TAU); ca.fill();
    }
    // wajah
    ca.fillStyle = A.gKulitJ; ca.beginPath(); ca.ellipse(75, 89, 29, 26, 0, 0, TAU); ca.fill();
    ca.save(); ca.setLineDash([2.4, 2.2]); ca.globalAlpha *= .85; ca.strokeStyle = '#fff'; ca.lineWidth = 2.2;
    ca.beginPath(); ca.ellipse(75, 89, 30.4, 27.4, 0, 0, TAU); ca.stroke(); ca.restore();
    ca.save(); ca.globalAlpha *= .55; ca.strokeStyle = '#D97BA2'; ca.lineWidth = 1.2; ca.beginPath(); ca.ellipse(75, 89, 32, 29, 0, 0, TAU); ca.stroke(); ca.restore();
    // bros sakura
    ca.save(); ca.translate(75, 119); ca.scale(.72, .72); ca.fillStyle = '#F7A6C3'; ca.fill(A.jBunga);
    ca.fillStyle = '#E0578A'; ca.beginPath(); ca.arc(0, 0, 1.9, 0, TAU); ca.fill(); ca.restore();
    ca.fillStyle = '#E8CC6B'; ca.beginPath(); ca.arc(75, 119, 1.6, 0, TAU); ca.fill();
    // kilap & pipi
    ca.save(); ca.fillStyle = '#fff'; ca.globalAlpha *= .6; ca.beginPath(); ca.ellipse(96, 64, 5, 9, .59, 0, TAU); ca.fill();
    ca.globalAlpha /= .6; ca.globalAlpha *= .35; ca.beginPath(); ca.ellipse(93, 76, 4, 6, .52, 0, TAU); ca.fill(); ca.restore();
    ca.save(); ca.globalAlpha *= .55; ca.fillStyle = '#FF7FAA'; ca.beginPath(); ca.ellipse(55, 99, 6.5, 3.6, 0, 0, TAU); ca.ellipse(95, 99, 6.5, 3.6, 0, 0, TAU); ca.fill(); ca.restore();
    mataJ(P);
    if (P.uDepan) payung(P); else lenganKanan();
    ca.fillStyle = '#4FC39C'; ca.beginPath(); ca.ellipse(P.hx, P.hy, 7, 6.4, 0, 0, TAU); ca.fill();
    ca.save(); ca.globalAlpha *= .35; ca.fillStyle = '#fff'; ca.beginPath(); ca.ellipse(P.hx + 2, P.hy - 2, 2.6, 1.6, 0, 0, TAU); ca.fill(); ca.restore();
    ca.restore();
  }
  function mataJ(P) {
    const A = AK.aset, tinta = '#1B1030', lx = P.lx, ly = P.ly;
    ca.lineCap = 'round'; ca.lineJoin = 'round'; ca.strokeStyle = tinta;
    if (P.mata === 'senang') { ca.lineWidth = 3; ca.stroke(A.jSenang); }
    else if (P.mata === 'pejam') { ca.lineWidth = 2.6; ca.stroke(A.jPejam); }
    else {
      const kg = P.mata === 'kaget', kw = P.mata === 'khawatir';
      ca.fillStyle = '#fff'; ca.beginPath(); ca.ellipse(63, 86, 9.6, 10.8, 0, 0, TAU); ca.ellipse(87, 86, 9.6, 10.8, 0, 0, TAU); ca.fill();
      if (kg) { ca.fillStyle = tinta; ca.beginPath(); ca.arc(63 + lx * .4, 86 + ly * .4, 3.2, 0, TAU); ca.arc(87 + lx * .4, 86 + ly * .4, 3.2, 0, TAU); ca.fill(); }
      else {
        ca.fillStyle = A.gPupilJ; ca.beginPath(); ca.ellipse(64 + lx, 88 + ly, kw ? 5.4 : 6.4, kw ? 6.4 : 7.4, 0, 0, TAU); ca.ellipse(88 + lx, 88 + ly, kw ? 5.4 : 6.4, kw ? 6.4 : 7.4, 0, 0, TAU); ca.fill();
        ca.fillStyle = '#fff'; ca.beginPath(); ca.arc(66.8 + lx, 84.4 + ly, 2.8, 0, TAU); ca.arc(90.8 + lx, 84.4 + ly, 2.8, 0, TAU); ca.fill();
      }
      ca.lineWidth = 1.8; ca.stroke(A.jBulu);
      if (kw) { ca.lineWidth = 2.2; ca.stroke(A.jAlisKhawatir); }
    }
    if (P.mulut === 'senang') {
      ca.fillStyle = '#7A1235'; ca.fill(A.jMulutSenang); ca.lineWidth = 2; ca.stroke(A.jMulutSenang);
      ca.fillStyle = '#FF6F9F'; ca.beginPath(); ca.ellipse(75, 106, 4.4, 2.6, 0, 0, TAU); ca.fill();
    } else if (P.mulut === 'o') {
      ca.fillStyle = '#6A1030'; ca.beginPath(); ca.ellipse(75, 103, 3.4, 4, 0, 0, TAU); ca.fill();
    } else { ca.lineWidth = 2.3; ca.stroke(A.jMulut); }
  }

  /* =================================================================
   *  EFEK — asap, debu, percikan, kelopak, hati, tanda seru
   * ================================================================= */
  function asap(t, t0, x, y, ukuran) {
    const d = t - t0; if (d < 0 || d > 700) return;
    const A = AK.aset;
    for (let i = 0; i < 11; i++) {
      const a = i / 11 * TAU + acak(i * 5.7) * .5, p = E.expoOut(Math.min(1, d / 420));
      const r = ukuran * (.25 + .75 * p) * (.55 + acak(i * 2.3) * .6);
      const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r * .8 - d * .02 * ukuran / 40;
      const s = ukuran * (.5 + acak(i * 9.1) * .45) * (.6 + .6 * p);
      ca.globalAlpha = (1 - E.quartOut(Math.min(1, d / 700))) * .9;
      ca.drawImage(A.asap, px - s, py - s, s * 2, s * 2);
    }
    // bintik kilau
    ca.fillStyle = W_.emas;
    for (let i = 0; i < 5; i++) {
      const a = i / 5 * TAU + .4, r = ukuran * (.6 + 1.1 * E.expoOut(Math.min(1, d / 360)));
      ca.globalAlpha = Math.max(0, 1 - d / 420);
      bintangKecil(x + Math.cos(a) * r, y + Math.sin(a) * r, ukuran * .12 * (1 - d / 700));
    }
    ca.globalAlpha = 1;
  }
  function bintangKecil(x, y, r) {
    if (r <= .3) return;
    ca.beginPath(); ca.moveTo(x, y - r); ca.quadraticCurveTo(x, y, x + r, y); ca.quadraticCurveTo(x, y, x, y + r);
    ca.quadraticCurveTo(x, y, x - r, y); ca.quadraticCurveTo(x, y, x, y - r); ca.fill();
  }
  function kakiDunia(P) { const B = AK.g.B * P.sy; return { x: P.x - Math.sin(P.rot) * B, y: P.y + Math.cos(P.rot) * B }; }
  const DARAT = [1250, 2250, 2860, 4400, 4950, 5110, 5270, 5430, 5590, 5750, 5910, 6560, 6940, 7270];
  function debu(t) {
    const g = AK.g, A = AK.aset;
    for (const t0 of DARAT) {
      const d = t - t0; if (d < 0 || d > 420) continue;
      const P = poseNinja(t0 + .01); if (!P) continue;
      const kk = kakiDunia(P), p = E.expoOut(d / 420), besar = t0 >= 4950 && t0 < 5910 ? .55 : 1;
      for (let i = 0; i < 6; i++) {
        const arah = (i - 2.5) / 2.5;
        const x = kk.x + arah * g.Hn * (.25 + .5 * p) * besar, y = kk.y - Math.abs(arah) * g.Hn * .08 * p - g.Hn * .04;
        const s = g.Hn * .09 * besar * (.6 + .8 * p);
        ca.globalAlpha = .38 * (1 - p) * (1 - p);
        ca.drawImage(A.asap, x - s, y - s, s * 2, s * 2);
      }
    }
    ca.globalAlpha = 1;
  }
  function percikan(t, P) {
    if (!P || !P.rem) return;
    const kk = kakiDunia(P), g = AK.g;
    ca.strokeStyle = W_.emas; ca.lineWidth = 1.4; ca.lineCap = 'round';
    for (let i = 0; i < 7; i++) {
      const fase = ((t / 140 + acak(i * 3.3)) % 1), a = -PI + .35 + acak(i * 7.1) * .9;
      const r = g.Hn * (.15 + .55 * fase);
      ca.globalAlpha = P.rem * (1 - fase);
      const x = kk.x + Math.cos(a) * r, y = kk.y + Math.sin(a) * r * .6 + fase * fase * g.Hn * .2;
      ca.beginPath(); ca.moveTo(x, y); ca.lineTo(x - Math.cos(a) * 5, y - Math.sin(a) * 3); ca.stroke();
    }
    ca.globalAlpha = 1;
  }
  function garisLaju(t) {
    if (t < 3110 || t > 3330) return;
    const S = L.S, g = AK.g, p = seg(t, 3110, 3330);
    ca.strokeStyle = W_.pucat; ca.lineWidth = 1.2;
    for (let i = 0; i < 6; i++) {
      const x = S.cx + (i - 2.5) * g.Hn * .18, y = g.yGaris - p * S.h * .55 + acak(i) * g.Hn;
      ca.globalAlpha = .5 * busur(p);
      ca.beginPath(); ca.moveTo(x, y); ca.lineTo(x, y + g.Hn * (.5 + acak(i * 4) * .6)); ca.stroke();
    }
    ca.globalAlpha = 1;
  }
  /* Kelopak: tiap kelopak lahir pada waktu tetap dari tepi payung Si Payung
     (posisi lahir dihitung ulang dari pose pada waktu lahirnya → murni). */
  const KELOPAK = (() => {
    const d = [];
    const tambah = (t0, t1, jarak, jenis) => { for (let t = t0, i = 0; t < t1; t += jarak, i++) d.push({ t: t + acak(t) * jarak * .5, j: jenis, i: d.length }); };
    tambah(2900, 3560, 110, 'turun');
    for (const b of [3900, 4160]) for (let i = 0; i < 9; i++) d.push({ t: b + i * 6, j: 'sembur', i: d.length, sud: i / 9 * TAU });
    tambah(5170, 5740, 55, 'jejak');
    tambah(6920, 7940, 120, 'turun');
    tambah(8250, 8300, 8, 'darat');
    for (let i = 0; i < 12; i++) d.push({ t: 9455 + i * 9, j: 'sembur', i: d.length, sud: i / 12 * TAU });
    return d;
  })();
  function kelopak(t) {
    const A = AK.aset, g = AK.g, kp = g.kp, tk = R.tingkat;
    const sisa = 1 - seg(t, 9720, 9990);
    for (const k of KELOPAK) {
      if (tk === 'ringan' && k.i % 2) continue;
      const d = t - k.t; const umur = k.j === 'sembur' ? 1300 : 1800;
      if (d < 0 || d > umur) continue;
      const P = posePayung(k.t); if (!P) continue;
      const u = d / 1000, r = acak(k.i * 1.37);
      // titik lahir: tepi kanopi (satuan payung) → dunia
      const rimX = (r - .5) * 120 * P.buka;
      const ca0 = Math.cos(P.uA), sa0 = Math.sin(P.uA);
      const ux = P.hx + rimX * ca0 - (-102) * sa0, uy = P.hy + rimX * sa0 + (-102) * ca0;
      const o = keDunia(P, ux, uy, kp, 75, 110);
      let x = o.x, y = o.y;
      if (k.j === 'sembur') {
        const v = g.Hp * 2.4, tau = .32, jarakS = v * tau * (1 - Math.exp(-u / tau));
        x += Math.cos(k.sud) * jarakS; y += Math.sin(k.sud) * jarakS + 30 * u * u;
      } else {
        x += (-24 - r * 30) * u + Math.sin(u * (1.6 + r) * 3 + r * 6) * (10 + r * 14);
        y += (48 + r * 40) * u;
      }
      const s = (8 + r * 7) * Math.max(.7, g.Hn / 70);
      const umurP = d / umur;
      ca.globalAlpha = Math.min(1, d / 120) * (1 - umurP * umurP) * sisa * .95;
      ca.save(); ca.translate(x, y); ca.rotate(r * 6 + u * (1.5 + r * 2)); ca.scale(Math.max(.18, Math.abs(Math.cos(u * (2 + r * 3) + r * 5))), 1);
      ca.drawImage(A.kelopak[k.i % 3], -s / 2, -s / 2, s, s); ca.restore();
    }
    ca.globalAlpha = 1;
  }
  function hati(x, y, s) {
    ca.beginPath(); ca.moveTo(x, y + s * .35);
    ca.bezierCurveTo(x - s * .9, y - s * .25, x - s * .45, y - s * .95, x, y - s * .45);
    ca.bezierCurveTo(x + s * .45, y - s * .95, x + s * .9, y - s * .25, x, y + s * .35); ca.fill();
  }
  function tandaCerita(t, N) {
    const g = AK.g;
    // tanda seru & keringat saat tangan terlepas
    if (N && t >= 8480 && t < 8820) {
      const p = seg(t, 8480, 8560), q = 1 - seg(t, 8700, 8820);
      const kepala = keDunia(N, 60, 2, g.k, 60, 72);
      ca.globalAlpha = q;
      ca.font = `800 ${(g.Hn * .42 * E.backOut(p)).toFixed(1)}px ${F.sans}`; ca.textAlign = 'center'; ca.fillStyle = '#FFD76A';
      ca.fillText('!', kepala.x - g.Hn * .5, kepala.y + g.Hn * .1);
      const kr = keDunia(N, 96, 38, g.k, 60, 72), jatuh = seg(t, 8500, 8800);
      ca.fillStyle = '#9FE0FF'; ca.globalAlpha = q * .9;
      const kx = kr.x + jatuh * g.Hn * .1, ky = kr.y + jatuh * g.Hn * .3, rs = g.Hn * .06;
      ca.beginPath(); ca.moveTo(kx, ky - rs * 2); ca.quadraticCurveTo(kx + rs * 1.2, ky, kx, ky + rs); ca.quadraticCurveTo(kx - rs * 1.2, ky, kx, ky - rs * 2); ca.fill();
      ca.globalAlpha = 1;
    }
    // hati di antara keduanya (9,02 – 9,60)
    if (t >= 9020 && t < 9600) {
      const p = seg(t, 9020, 9600), s = g.Hn * .28 * E.backOut(Math.min(1, p * 3.5));
      ca.fillStyle = '#FF6F9F'; ca.globalAlpha = 1 - E.expoIn(p);
      hati((g.G.x + g.Pd.x) / 2 + Math.sin(p * 9) * 4, g.K.y - g.Hn * (.55 + .9 * p), s);
      ca.globalAlpha = 1;
    }
  }

  /* =================================================================
   *  LAPIS AKTOR — dipanggil gambar(t) pada jam yang sama
   * ================================================================= */
  function lapisAktor(t) {
    if (!ca) return;
    if (!KONFIG.MODUL.aktor) { if (!AK.kosong) { ca.setTransform(1, 0, 0, 1, 0, 0); ca.clearRect(0, 0, AK.kanvas.width, AK.kanvas.height); AK.kosong = true; } return; }
    ca.setTransform(L.k, 0, 0, L.k, 0, 0);
    const N = poseNinja(t), J = posePayung(t);
    if (t < 520 || t >= 9995) {
      if (!AK.kosong) { ca.clearRect(0, 0, L.W, L.H); AK.kosong = true; }
      return;
    }
    AK.kosong = false;
    ca.clearRect(0, 0, L.W, L.H);
    geoAktor(); asetAktor();
    const g = AK.g, tk = TINGKAT[R.tingkat], hantu = tk.kabur;
    const glitch = t >= 7330 && t < 7364;
    // urutan: kelopak belakang → Si Payung → Si Peci → efek depan
    kelopak(t);
    if (J) {
      if (J.kabur && hantu) for (let i = Math.min(2, hantu); i >= 1; i--) { const Q = posePayung(t - i * 22); if (Q) gambarPayung(Q, t, { alpha: .2 / i }); }
      gambarPayung(J, t);
    }
    debu(t);
    garisLaju(t);
    if (N) {
      if (N.kabur && hantu) {
        for (let i = hantu; i >= 1; i--) {
          const Q = poseNinja(t - i * 18);
          if (Q) { ca.save(); ca.globalCompositeOperation = 'lighter'; gambarNinja(Q, t, { alpha: .16 / i, hantu: true }); ca.restore(); }
        }
      }
      if (glitch && tk.kroma) {
        const dx = (acak(Math.floor((t - 7330) / 17) * 13 + 2) - .5) * 48;
        ca.save(); ca.globalCompositeOperation = 'lighter';
        gambarNinja(Object.assign({}, N, { x: N.x + dx - 5 }), t, { alpha: .35, hantu: true });
        gambarNinja(Object.assign({}, N, { x: N.x + dx + 5 }), t, { alpha: .35, hantu: true });
        ca.restore();
      }
      gambarNinja(N, t);
      percikan(t, N);
    }
    // asap kemunculan & kepergian
    asap(t, 540, L.S.cx, L.S.cy - g.B * .7, g.Hn * .55);
    if (t >= 9290) { const P = poseNinja(9299.9); if (P) asap(t, 9300, P.x, P.y, g.Hn * .7); }
    tandaCerita(t, N);
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
    lapisAktor(t);
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
    // v2.47.1: kanvas aktor di atas kartu (z 3), tanpa pointer, jam yang sama
    if (KONFIG.MODUL.aktor) {
      const ka = document.createElement('canvas');
      ka.className = 'rq-aktor'; ka.setAttribute('aria-hidden', 'true'); ka.setAttribute('role', 'presentation');
      const c3 = ka.getContext && ka.getContext('2d', { alpha: true });
      if (c3) { scr.appendChild(ka); AK.kanvas = ka; ca = AK.ctx = c3; AK.aset = null; AK.g = null; AK.ver = -1; }
    }
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
      Promise.all(['italic 900 40px "Mona Sans"', '800 40px "Inter Tight"', 'italic 400 30px "Instrument Serif"', '500 12px "IBM Plex Mono"', '700 30px Amiri']
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
    if (AK.kanvas) { AK.kanvas.width = 0; AK.kanvas.height = 0; AK.kanvas.remove(); }
    AK.kanvas = null; ca = AK.ctx = null; AK.aset = null; AK.g = null; AK.ver = -1;
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


  /* =================================================================
   *  v2.47.2 · GERBANG "Chemint-Dest" — transisi saat Masuk ditekan
   * -----------------------------------------------------------------
   *  1  (0–0,52 dtk)  tirai navy menutup; huruf meluncur dari kanan
   *                   (miring, kabur → tajam), bilah emas tanda hubung
   *                   tumbuh, kilat cahaya menyapu → `tertutup` selesai.
   *  ·  (menunggu)    bila server lambat: keterangan mono muncul 1,1 dtk.
   *  2  buka() 0,46   KAMERA MENEROBOS bilah emas: kata membesar dengan
   *                   poros di tengah bilah sampai emas memenuhi layar.
   *  3  buka() 0,52   sapuan diagonal (sudut miring huruf) membuka
   *                   aplikasi; aplikasi mengendap dari skala 1,03.
   *  batal()          gagal masuk → memudar 0,2 dtk, kartu kembali.
   *  Gerak dikurangi: hanya pudar masuk/keluar.
   * ================================================================= */
  function gerbang() {
    if (!document.body || typeof document.body.animate !== 'function') return null;
    const kurang = gerakDikurangi();
    const el = document.createElement('div');
    el.className = 'rq-gerbang'; el.setAttribute('aria-hidden', 'true');
    const huruf = [...MEREK].map((c, i) => i === I_GARIS ? '<i class="rq-g-garis"></i>'
      : `<span class="${i > I_GARIS ? 'rq-g-dest' : ''}">${c}</span>`).join('');
    el.innerHTML = `<div class="rq-g-tirai"></div><div class="rq-g-kilat"></div>
      <div class="rq-g-kata">${huruf}</div><div class="rq-g-ket">MENYIAPKAN CATATAN SANTRI</div>`;
    document.body.appendChild(el);
    const tirai = el.querySelector('.rq-g-tirai'), kilat = el.querySelector('.rq-g-kilat');
    const kata = el.querySelector('.rq-g-kata'), ket = el.querySelector('.rq-g-ket'), garisEl = el.querySelector('.rq-g-garis');
    // pas selebar 88 % layar
    const lw = kata.getBoundingClientRect().width, batas = innerWidth * .88;
    if (lw > batas) kata.style.fontSize = (parseFloat(getComputedStyle(kata).fontSize) * batas / lw).toFixed(1) + 'px';
    const anim = [];
    const A = (n, kf, o) => { const a = n.animate(kf, Object.assign({ fill: 'both' }, o)); anim.push(a); return a; };
    let selesai = false, okTutup;
    const tertutup = new Promise(r => { okTutup = r; });
    const lepas = () => { if (selesai) return; selesai = true; clearTimeout(tKet); el.remove(); };
    if (kurang) A(el, [{ opacity: 0 }, { opacity: 1 }], { duration: 160 }).finished.then(okTutup, okTutup);
    else {
      A(tirai, [{ opacity: 0, transform: 'scale(1.08)' }, { opacity: 1, transform: 'none' }], { duration: 260, easing: 'cubic-bezier(.2,.8,.2,1)' });
      [...kata.children].forEach((h, i) => {
        if (h === garisEl) A(h, [{ transform: 'skewX(-14deg) scaleX(0)' }, { transform: 'skewX(-14deg) scaleX(1.25)', offset: .7 }, { transform: 'skewX(-14deg) scaleX(1)' }],
          { duration: 380, delay: 150, easing: 'cubic-bezier(.16,1,.3,1)' });
        else A(h, [{ transform: 'translateX(1.1em) skewX(-18deg)', opacity: 0, filter: 'blur(5px)' },
          { transform: 'none', opacity: 1, filter: 'blur(0)' }], { duration: 480, delay: 30 + i * 22, easing: 'cubic-bezier(.16,1,.3,1)' });
      });
      A(kilat, [{ transform: 'translateX(-70vw) skewX(-20deg)', opacity: 0 }, { opacity: 1, offset: .3 }, { transform: 'translateX(70vw) skewX(-20deg)', opacity: 0 }],
        { duration: 620, delay: 200, easing: 'cubic-bezier(.45,0,.2,1)' });
      setTimeout(okTutup, 540);
    }
    const tKet = setTimeout(() => { if (!selesai) A(ket, [{ opacity: 0, transform: 'translateY(6px)' }, { opacity: .72, transform: 'none' }], { duration: 300 }); }, 1100);
    return {
      tertutup,
      buka() {
        if (selesai) return Promise.resolve();
        clearTimeout(tKet);
        const app = document.getElementById('appShell');
        if (kurang) return A(el, [{ opacity: 1 }, { opacity: 0 }], { duration: 220 }).finished.then(lepas, lepas);
        A(ket, [{ opacity: getComputedStyle(ket).opacity }, { opacity: 0 }], { duration: 120 });
        const rk = kata.getBoundingClientRect(), rg = garisEl.getBoundingClientRect();
        kata.style.transformOrigin = `${(rg.left + rg.width / 2 - rk.left).toFixed(1)}px ${(rg.top + rg.height / 2 - rk.top).toFixed(1)}px`;
        const S = Math.max(innerWidth / Math.max(1, rg.width), innerHeight / Math.max(1, rg.height)) * 2.4;
        return A(kata, [{ transform: 'scale(1)' }, { transform: `scale(${S.toFixed(1)})` }], { duration: 460, easing: 'cubic-bezier(.7,0,.84,0)' })
          .finished.then(() => {
            // v2.48: aplikasi mulai terlihat → Ringkasan melepas gerak masuk yang ditahannya.
            document.dispatchEvent(new CustomEvent('rq:gerbang-terbuka'));
            if (app) app.animate([{ transform: 'scale(1.03)', filter: 'brightness(1.12)' }, { transform: 'none', filter: 'none' }], { duration: 640, easing: 'cubic-bezier(.16,1,.3,1)' });
            return A(el, [{ clipPath: 'polygon(0% 0%, 130% 0%, 130% 100%, -22% 100%)' },
              { clipPath: 'polygon(152% 0%, 130% 0%, 130% 100%, 130% 100%)' }], { duration: 520, easing: 'cubic-bezier(.65,0,.35,1)' }).finished;
          }).then(lepas, lepas);
      },
      batal() {
        if (selesai) return;
        clearTimeout(tKet);
        A(el, [{ opacity: 1 }, { opacity: 0 }], { duration: 200 }).finished.then(lepas, lepas);
      }
    };
  }

  /* API kecil — dipakai uji otomatis & penelusuran; gerbang() dipakai app.js saat Masuk. */
  window.RQReel = {
    versi: 'v2.47.2', KONFIG, TINGKAT, gerbang,
    keadaan: () => ({
      hidup: R.hidup, jalan: R.jalan, poster: R.poster, tingkat: R.tingkat, tingkatAwal: R.tingkatAwal, sebab: R.sebab,
      waktu: R.waktu, t: R.waktu % KONFIG.DURASI, bingkai: R.bingkai, tataVer: R.tataVer, rataAwal: R.rataAwal ?? null,
      gambarMs: R.gambarMs.length ? +(R.gambarMs.reduce((a, b) => a + b, 0) / R.gambarMs.length).toFixed(3) : null,
      kanvas: R.kanvas ? [R.kanvas.width, R.kanvas.height] : null, stage: L ? L.S : null, raf: !!R.raf,
      aktor: AK.kanvas ? [AK.kanvas.width, AK.kanvas.height] : null
    }),
    lompat: (ms) => { R.beku = ((ms % KONFIG.DURASI) + KONFIG.DURASI) % KONFIG.DURASI; if (R.hidup) gambar(R.beku); },
    lanjut: () => { R.beku = null; },
    tingkat: (tk) => { if (TINGKAT[tk]) { KONFIG.TINGKAT = tk; gantiTingkat(tk, 'paksa'); if (R.beku !== null) gambar(R.beku); } },
    hentikan, mulai,
    pose: (ms) => (L ? { peci: poseNinja(((ms % 1e4) + 1e4) % 1e4), payung: posePayung(((ms % 1e4) + 1e4) % 1e4), g: geoAktor() } : null)
  };

  pantau();
})();
