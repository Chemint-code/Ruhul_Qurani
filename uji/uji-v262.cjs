/* uji-v262.cjs — v2.62 RAPI & RINGAN
 *
 *   npm run bangun:uji && node uji/uji-v262.cjs
 *
 * A · berkas: gaya keluar dari index.html, ikon swa-saji lengkap, INTI sw.js
 * B · aplikasi utuh (sumber & build, Supabase tiruan):
 *     gaya sumber = gaya build (CSSOM), ikon tergambar, Saring HP, tab Catat,
 *     pita Lembar Baru, kelas muat-halaman tidak lagi di <html>, tag Hadir netral,
 *     klon PDF tetap membawa ikon.
 */
const fs = require('fs'), path = require('path'), http = require('http');
const { chromium } = require('playwright');
const { MOCK } = require('./mock.cjs');

const AKAR = path.resolve(__dirname, '..');
const NM = path.join(AKAR, 'node_modules');
const KELUAR = path.join(__dirname, 'keluaran'); fs.mkdirSync(KELUAR, { recursive: true });
const JENIS = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.woff2': 'font/woff2' };

let lulus = 0, gagal = 0;
const cek = (j, ok, info) => { ok ? lulus++ : gagal++; console.log(`${ok ? '  ok  ' : ' GAGAL'} ${j}${info !== undefined ? '  · ' + JSON.stringify(info) : ''}`); };
const baca = (...p) => fs.readFileSync(path.join(AKAR, ...p), 'utf8');

function layani(dir, port) {
  return new Promise(ok => {
    const s = http.createServer((req, res) => {
      const p = decodeURIComponent(req.url.split('?')[0]);
      const f = path.join(dir, p === '/' ? 'index.html' : p);
      if (!f.startsWith(dir) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'Content-Type': JENIS[path.extname(f)] || 'application/octet-stream' });
      res.end(fs.readFileSync(f));
    }).listen(port, '127.0.0.1', () => ok(s));
  });
}

async function masuk(browser, url, o = {}) {
  const ctx = await browser.newContext({ viewport: o.hp ? { width: 390, height: 844 } : { width: 1366, height: 820 },
    deviceScaleFactor: o.hp ? 2 : 1, isMobile: !!o.hp, hasTouch: !!o.hp, serviceWorkers: 'block', reducedMotion: 'reduce' });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, async (route) => {
    const u = route.request().url();
    if (u.includes('supabase-js')) return route.fulfill({ contentType: 'application/javascript', body: MOCK });
    if (u.includes('sweetalert2')) return route.fulfill({ contentType: 'application/javascript', path: NM + '/sweetalert2/dist/sweetalert2.all.min.js' });
    if (u.includes('chart.js@')) return route.fulfill({ contentType: 'application/javascript', path: NM + '/chart.js/dist/chart.umd.min.js' });
    if (u.includes('echarts@')) return route.fulfill({ contentType: 'application/javascript', path: NM + '/echarts/dist/echarts.min.js' });
    return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
  });
  const page = await ctx.newPage();
  const galat = [];
  page.on('pageerror', e => galat.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_CONNECTION_REFUSED/.test(m.text())) galat.push('console: ' + m.text()); });
  await page.addInitScript((o) => {
    if (o.peran) { window.__PERAN = o.peran; window.__KELAS = ['VIII-D']; }
    try { localStorage.setItem('rq-efek-pilih', 'hemat'); localStorage.setItem('rq.tur.v1.u-admin', '{"t":0}'); } catch (e) {}
    // Catat setiap kali <html> mendapat kelas muat-/ungkap-halaman.
    window.__htmlMuat = 0;
    const pasang = () => {
      if (!document.documentElement) return setTimeout(pasang, 0);
      new MutationObserver(() => { if (/muat-halaman|ungkap-halaman/.test(document.documentElement.className)) window.__htmlMuat++; })
        .observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    };
    pasang();
  }, { peran: o.peran || null });
  await page.goto(url, { waitUntil: 'commit' });
  await page.waitForFunction(() => { const b = document.getElementById('btnLogin'); return typeof APP !== 'undefined' && b && b.offsetParent && !b.disabled; }, null, { timeout: 120000 });
  await page.click('#btnLogin');
  await page.waitForFunction(() => typeof APP !== 'undefined' && APP.profil && document.querySelector('#viewRoot') && document.querySelector('#viewRoot').children.length, null, { timeout: 120000 });
  await page.waitForTimeout(1200);
  return { ctx, page, galat };
}

const ikonKosong = (page) => page.evaluate(() => [...document.querySelectorAll('i[class*="fa-"]')]
  .filter(i => i.getClientRects().length && getComputedStyle(i, '::before').content === 'none').map(i => i.className).slice(0, 8));

(async () => {
  console.log('\nA · Berkas');
  const html = baca('index.html');
  const kepala = html.slice(0, html.indexOf('</head>'));
  cek('A1 index.html: tanpa blok <style>, memuat gaya.css & ikon/fa-subset.css', !/<style[\s>]/i.test(kepala)
    && kepala.includes('<link rel="stylesheet" href="gaya.css">') && kepala.includes('<link rel="stylesheet" href="ikon/fa-subset.css">'));
  cek('A2 tidak lagi memuat Font Awesome dari cdnjs', !/cdnjs\.cloudflare\.com\/ajax\/libs\/font-awesome/.test(html));
  cek('A3 index.html < 40 KB (dulu ±480 KB)', Buffer.byteLength(html) < 40 * 1024, Math.round(Buffer.byteLength(html) / 1024) + ' KB');

  // Setiap nama fa-* yang dipakai harus ada di subset (penjaga bila ikon baru ditambahkan).
  const sumber = ['app.js', 'meja.js', 'panggung.js', 'showreel.js', 'index.html', 'gaya.css'].map(f => baca(f)).join('\n');
  const subset = baca('ikon', 'fa-subset.css');
  const UTIL = /^fa-(subset|solid|regular|brands|spin|fw|lg|xs|sm|\d+x|rotate|flip|beat|fade|shake|bounce|pulse|stack|border|pull|li|ul|inverse|sharp|classic|duotone|layers)/;
  const nama = [...new Set(sumber.match(/(?<![\w-])fa-[a-z0-9]+(?:-[a-z0-9]+)*/g))]
    .filter(n => !UTIL.test(n) && !sumber.includes(n + '-${'));
  const hilang = nama.filter(n => !new RegExp(`\\.${n}::?before\\{`).test(subset));
  cek(`A4 ${nama.length} ikon dipakai, semuanya ada di ikon/fa-subset.css (bila gagal: python3 alat/subset-ikon.py)`, hilang.length === 0, hilang);
  for (const f of ['fa-solid-subset.woff2', 'fa-regular-subset.woff2', 'fa-brands-subset.woff2'])
    cek(`A5 ikon/${f} ada & kecil`, fs.existsSync(path.join(AKAR, 'ikon', f)) && fs.statSync(path.join(AKAR, 'ikon', f)).size < 40 * 1024);
  for (const [label, sw] of [['sumber', baca('sw.js')], ['build', baca('dist-uji', 'sw.js')]]) {
    const ok = ["'./gaya.css'", "'./ikon/fa-subset.css'", "'./ikon/fa-solid-subset.woff2'", "'./ikon/fa-regular-subset.woff2'", "'./ikon/fa-brands-subset.woff2'"].every(x => sw.includes(x));
    cek(`A6 sw.js ${label}: VERSI rq-v2.62, gaya & ikon di INTI dan POLA_INTI`, ok && /VERSI\s+=\s+'rq-v2\.62'/.test(sw) && /gaya\\\.css\$/.test(sw) && /\\\/ikon\\\//.test(sw));
  }
  const dhtml = baca('dist-uji', 'index.html');
  cek('A7 build: tag gaya & ikon utuh, berkas dengan nama tetap', dhtml.includes('href="gaya.css"') && dhtml.includes('href="ikon/fa-subset.css"')
    && fs.existsSync(path.join(AKAR, 'dist-uji', 'gaya.css')) && fs.existsSync(path.join(AKAR, 'dist-uji', 'ikon', 'fa-solid-subset.woff2')));
  cek('A8 build: komentar dibuang, gaya.css lebih kecil', fs.statSync(path.join(AKAR, 'dist-uji', 'gaya.css')).size < fs.statSync(path.join(AKAR, 'gaya.css')).size * .95);

  const sSumber = await layani(AKAR, 4621), sBuild = await layani(path.join(AKAR, 'dist-uji'), 4622);
  const URL_ = { sumber: 'http://127.0.0.1:4621/', build: 'http://127.0.0.1:4622/' };
  const browser = await chromium.launch();

  console.log('\nB · Gaya sumber = gaya build');
  const cssom = async (u) => { const p = await browser.newPage(); await p.goto(u + 'manifest.webmanifest');
    await p.setContent(`<link rel="stylesheet" href="${u}gaya.css">`); await p.waitForFunction(() => document.styleSheets.length && document.styleSheets[0].cssRules.length);
    const r = await p.evaluate(() => { const o = []; const w = (l, pre) => { for (const x of l) { o.push(pre + (x.selectorText !== undefined ? x.selectorText + '{' + x.style.cssText + '}' : (x.cssRules ? '' : x.cssText)).replace(/\s+/g, ' ')); if (x.cssRules) w(x.cssRules, pre + (x.conditionText || x.name || '') + '»'); } }; w(document.styleSheets[0].cssRules, ''); return o; });
    await p.close(); return r; };
  const [ca, cb] = [await cssom(URL_.sumber), await cssom(URL_.build)];
  cek(`B1 CSSOM gaya.css sumber = build (${ca.length} aturan)`, ca.length > 3000 && JSON.stringify(ca) === JSON.stringify(cb));

  for (const v of ['sumber', 'build']) {
    console.log(`\nC · ${v}`);
    { // HP · Admin
      const s = await masuk(browser, URL_[v], { hp: true });
      const p = s.page;
      const pita = await p.evaluate(() => ({ ada: !!document.getElementById('pitaLembar'), sebelumTab: document.getElementById('pitaLembar')?.nextElementSibling?.classList.contains('lembar-tabs') }));
      cek(`C1 ${v}: pita Lembar Baru di Ringkasan, di atas tab bulan (bukan toast)`, pita.ada && pita.sebelumTab && !(await p.$('.swal2-toast')), pita);
      await p.screenshot({ path: path.join(KELUAR, `v262-${v}-hp-ringkasan.png`) });
      await p.click('#pitaLembar .pita-tutup');
      await p.evaluate(() => navigateTo('siswa')); await p.waitForTimeout(400);
      await p.evaluate(() => navigateTo('dashboard')); await p.waitForTimeout(800);
      cek(`C2 ${v}: pita ditutup → tidak muncul lagi bulan ini`, !(await p.$('#pitaLembar')) && await p.evaluate(() => localStorage.getItem('rq_lembar_umum') === bulanIni()));

      const bar = await p.evaluate(() => ({ tinggi: Math.round(document.querySelector('.topbar').getBoundingClientRect().height),
        tombol: !!document.getElementById('btnSaring').getClientRects().length, teks: document.querySelector('#btnSaring .sr-teks').textContent,
        periode: document.getElementById('periodeBox').getClientRects().length }));
      cek(`C3 ${v}: HP — bilah atas terlipat ≤ 72 px, tombol Saring berisi keadaan`, bar.tinggi <= 72 && bar.tombol && /^\w{3} \d{4}/.test(bar.teks) && bar.periode === 0, bar);
      await p.click('#btnSaring'); await p.waitForTimeout(200);
      const buka = await p.evaluate(() => ({ periode: document.getElementById('periodeBox').getClientRects().length > 0, aria: document.getElementById('btnSaring').getAttribute('aria-expanded') }));
      cek(`C4 ${v}: ketuk Saring → penyaring tampil`, buka.periode && buka.aria === 'true', buka);
      await p.evaluate(() => { const i = document.getElementById('perBulan'); i.value = '2026-09'; i.dispatchEvent(new Event('change', { bubbles: true })); });
      await p.waitForTimeout(600);
      cek(`C5 ${v}: ganti periode → teks Saring ikut`, (await p.textContent('#btnSaring .sr-teks')).startsWith('Sep 2026'));
      await p.evaluate(() => { const i = document.getElementById('perBulan'); i.value = bulanIni(); i.dispatchEvent(new Event('change', { bubbles: true })); });

      cek(`C6 ${v}: tab Catat tampil untuk Admin, di antara Santri dan Izin`, await p.evaluate(() => { const b = document.getElementById('tabCatat');
        return b && b.getClientRects().length > 0 && b.previousElementSibling?.dataset.view === 'siswa' && b.nextElementSibling?.dataset.view === 'perizinan'; }));
      await p.evaluate(() => { APP.ctx.unit = APP.ctx.unit === 'Semua' ? 'Pengasuhan' : APP.ctx.unit; });
      await p.click('#tabCatat');
      await p.waitForSelector('.swal2-popup', { timeout: 5000 }).catch(() => {});
      cek(`C7 ${v}: tab Catat membuka dialog Catat Pelanggaran`, /Catat Pelanggaran/.test(await p.textContent('.swal2-title').catch(() => '')));
      await p.evaluate(() => Swal.close()); await p.waitForTimeout(300);

      const MENU = ['pelanggaran', 'pembinaan', 'perizinan', 'prestasi', 'tahfiz', 'pengasuhan', 'madrasah', 'lab', 'analisis', 'siswa'];
      const kosong = [];
      for (const m of MENU) { await p.evaluate(m => navigateTo(m), m); await p.waitForTimeout(700); const k = await ikonKosong(p); if (k.length) kosong.push([m, k]); }
      cek(`C8 ${v}: ${MENU.length} halaman — semua ikon tergambar`, kosong.length === 0, kosong);
      cek(`C9 ${v}: kelas muat-/ungkap-halaman tidak pernah dipasang di <html>`, await p.evaluate(() => window.__htmlMuat === 0));
      const hadir = await p.evaluate(() => [...document.querySelectorAll('#viewRoot .tag')].filter(t => t.textContent.trim() === 'Hadir').map(t => t.className));
      cek(`C10 ${v}: tag "Hadir" netral (tag-off)`, hadir.length > 0 && hadir.every(c => /tag-off/.test(c)), hadir.slice(0, 2));
      await p.evaluate(() => navigateTo('pelanggaran')); await p.waitForTimeout(600);
      const kepala = await p.evaluate(() => { const h = document.querySelector('.adm-head'); return { p: getComputedStyle(h.querySelector('.adm-head-main > p')).display, meta: getComputedStyle(h.querySelector('.adm-meta')).display, catat: !!document.getElementById('btnAddPlg')?.getClientRects().length, tinggi: Math.round(h.getBoundingClientRect().height) }; });
      cek(`C11 ${v}: HP — kepala Pelanggaran ringkas, tombol Catat tetap`, kepala.p === 'none' && kepala.meta === 'none' && kepala.catat, kepala);
      await p.evaluate(() => navigateTo('lab')); await p.waitForTimeout(600);
      cek(`C12 ${v}: HP — pemilih jendela Laboratorium tetap tampil`, await p.evaluate(() => !!document.getElementById('labHari')?.getClientRects().length));
      await p.screenshot({ path: path.join(KELUAR, `v262-${v}-hp-lab.png`) });
      const pdf = await p.evaluate(() => { const d = new DOMParser().parseFromString(document.documentElement.outerHTML, 'text/html'); siapkanKlonPdf(d);
        return { ikon: !!d.querySelector('link[href*="fa-subset"]'), gaya: !!d.querySelector('link[href="gaya.css"]') }; });
      cek(`C13 ${v}: klon PDF membawa ikon swa-saji, gaya aplikasi dilepas`, pdf.ikon && !pdf.gaya, pdf);
      cek(`C14 ${v}: HP Admin tanpa galat`, s.galat.length === 0, s.galat.slice(0, 4));
      await s.ctx.close();
    }
    { // HP · Pimpinan (tidak boleh mencatat) & Guru (boleh)
      const sp = await masuk(browser, URL_[v], { hp: true, peran: 'Pimpinan' });
      cek(`C15 ${v}: tab Catat tersembunyi untuk Pimpinan`, await sp.page.evaluate(() => document.getElementById('tabCatat').classList.contains('hidden')));
      await sp.ctx.close();
      const sg = await masuk(browser, URL_[v], { hp: true, peran: 'Guru' });
      const g = await sg.page.evaluate(() => ({ catat: !document.getElementById('tabCatat').classList.contains('hidden'), saring: document.querySelector('#btnSaring .sr-teks').textContent }));
      cek(`C16 ${v}: Guru — tab Catat tampil, Saring menyebut asramanya`, g.catat && /Asrama Putra/.test(g.saring), g);
      cek(`C17 ${v}: Guru tanpa galat`, sg.galat.length === 0, sg.galat.slice(0, 4));
      await sg.ctx.close();
    }
    { // Desktop: tidak berubah
      const s = await masuk(browser, URL_[v]);
      const d = await s.page.evaluate(() => ({ saring: document.getElementById('btnSaring').getClientRects().length, periode: document.getElementById('periodeBox').getClientRects().length > 0,
        catat: document.getElementById('tabCatat').getClientRects().length }));
      cek(`C18 ${v}: desktop — penyaring tetap terbuka, tanpa tombol Saring & tab Catat`, d.saring === 0 && d.periode && d.catat === 0, d);
      const k = await ikonKosong(s.page);
      cek(`C19 ${v}: desktop — ikon bilah sisi & bilah atas tergambar`, k.length === 0, k);
      await s.page.screenshot({ path: path.join(KELUAR, `v262-${v}-desktop.png`) });
      cek(`C20 ${v}: desktop tanpa galat`, s.galat.length === 0, s.galat.slice(0, 4));
      await s.ctx.close();
    }
  }

  await browser.close(); sSumber.close(); sBuild.close();
  console.log(`\n${lulus} lulus, ${gagal} gagal`);
  process.exit(gagal ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
