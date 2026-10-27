/* uji-v261.cjs — v2.60 (Vite) + v2.61 (grafik dimuat lambat, Kalender Sebaran)
 *
 * Aplikasi UTUH, Supabase tiruan (uji/mock.cjs). Tiga varian dibandingkan:
 *   dasar  = rilis sebelumnya (folder RQDASAR, mis. hasil `git show origin/main`)   [opsional]
 *   sumber = berkas di akar repo apa adanya (pustaka dari CDN → dialihkan ke node_modules)
 *   build  = dist-uji/ (npm run bangun:uji)
 *
 *   npm run bangun:uji && node uji/uji-v261.cjs
 *   RQDASAR=/folder/rilis-lama node uji/uji-v261.cjs   → ikut membandingkan dengan rilis lama
 *   RQCEPAT=1 → lewati uji kecepatan (dipakai alur terbit GitHub Actions)
 */
const fs = require('fs'), path = require('path'), http = require('http'), zlib = require('zlib');
const { chromium } = require('playwright');
const { MOCK } = require('./mock.cjs');

const AKAR = path.resolve(__dirname, '..');
const NM = path.join(AKAR, 'node_modules');
const KELUAR = path.join(__dirname, 'keluaran'); fs.mkdirSync(KELUAR, { recursive: true });
const DASAR = process.env.RQDASAR || '';
const CEPAT = process.env.RQCEPAT === '1';
const JENIS = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };

let lulus = 0, gagal = 0;
const cek = (j, ok, info) => { ok ? lulus++ : gagal++; console.log(`${ok ? '  ok  ' : ' GAGAL'} ${j}${info !== undefined ? '  · ' + JSON.stringify(info) : ''}`); };

function layani(dir, port) {
  return new Promise(ok => {
    const s = http.createServer((req, res) => {
      const p = decodeURIComponent(req.url.split('?')[0]);
      const f = path.join(dir, p === '/' ? 'index.html' : p);
      if (!f.startsWith(dir) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
      const isi = fs.readFileSync(f), ext = path.extname(f);
      const gz = /\.(html|js|css|webmanifest)$/.test(ext) && /gzip/.test(req.headers['accept-encoding'] || '');
      res.writeHead(200, { 'Content-Type': JENIS[ext] || 'application/octet-stream', ...(gz ? { 'Content-Encoding': 'gzip' } : {}) });
      res.end(gz ? zlib.gzipSync(isi, { level: 6 }) : isi);
    }).listen(port, '127.0.0.1', () => ok(s));
  });
}

/* Pustaka CDN → berkas lokal. `blokir` meniru jaringan yang menolak pustaka grafik. */
async function bukaKonteks(browser, o = {}) {
  const ctx = await browser.newContext({ viewport: o.vp || { width: 1280, height: 860 }, deviceScaleFactor: o.dpr || 1,
    serviceWorkers: 'block', isMobile: !!o.hp, hasTouch: !!o.hp, reducedMotion: o.gerak ? 'no-preference' : 'reduce' });
  const catat = { grafik: [] };
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, async (route) => {
    const u = route.request().url();
    if (/chart\.js@|echarts@/.test(u)) catat.grafik.push(u);
    if (o.blokir && o.blokir.test(u)) return route.abort();
    if (o.tunda && o.tunda.test(u)) await new Promise(r => setTimeout(r, o.tundaMs || 1500));
    if (u.includes('supabase-js')) return route.fulfill({ contentType: 'application/javascript', body: MOCK });
    if (u.includes('sweetalert2')) return route.fulfill({ contentType: 'application/javascript', path: NM + '/sweetalert2/dist/sweetalert2.all.min.js' });
    if (u.includes('chart.js@')) return route.fulfill({ contentType: 'application/javascript', path: NM + '/chart.js/dist/chart.umd.min.js' });
    if (u.includes('echarts@')) return route.fulfill({ contentType: 'application/javascript', path: NM + '/echarts/dist/echarts.min.js' });
    return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
  });
  // Potongan pustaka hasil build (same-origin) — bisa diblokir/ditunda juga.
  await ctx.route(/127\.0\.0\.1:\d+\/pustaka\//, async (route) => {
    catat.grafik.push(route.request().url());
    if (o.blokir && o.blokir.test(route.request().url())) return route.abort();
    if (o.tunda && o.tunda.test(route.request().url())) await new Promise(r => setTimeout(r, o.tundaMs || 1500));
    return route.continue();
  });
  return { ctx, catat };
}

async function masuk(browser, url, o = {}) {
  const { ctx, catat } = await bukaKonteks(browser, o);
  const page = await ctx.newPage();
  const galat = [], peringatan = [];
  page.on('pageerror', e => galat.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') galat.push('console: ' + m.text()); if (m.type() === 'warning') peringatan.push(m.text()); });
  await page.addInitScript((g) => { try { localStorage.setItem('rq-efek-pilih', g ? 'penuh' : 'hemat'); localStorage.setItem('rq.tur.v1.u-admin', '{"t":0}'); } catch (e) {} }, !!o.gerak);
  if (o.net) {
    const c = await ctx.newCDPSession(page);
    await c.send('Network.enable');
    await c.send('Network.emulateNetworkConditions', { offline: false, latency: o.net.rtt, downloadThroughput: o.net.dl, uploadThroughput: o.net.ul });
    await c.send('Emulation.setCPUThrottlingRate', { rate: o.net.cpu });
  }
  const t0 = Date.now();
  await page.goto(url, { waitUntil: 'commit' });
  // v2.57.3: sesi tersimpan tetap menunggu tombol Masuk.
  await page.waitForFunction(() => { const b = document.getElementById('btnLogin'); return typeof APP !== 'undefined' && b && b.offsetParent && !b.disabled && /Sesi masih aktif/.test(document.body.innerText); }, null, { timeout: 120000 });
  const tLogin = Date.now() - t0, t1 = Date.now();
  await page.click('#btnLogin');
  await page.waitForFunction(() => typeof APP !== 'undefined' && APP.profil && document.querySelector('#viewRoot .stats, #viewRoot .card'), null, { timeout: 120000 });
  return { ctx, page, galat, peringatan, catat, tLogin, tSiap: tLogin + (Date.now() - t1) };
}

const MENU = ['dashboard', 'analisis', 'radar', 'pimpinan', 'bk', 'keterlibatan', 'asatidz', 'siswa', 'pelanggaran', 'prestasi',
  'tahfiz', 'audit', 'tutupbuku', 'rekap', 'bidang', 'perizinan', 'pembinaan', 'rekapbina', 'master', 'pengguna'];

async function telusuriMenu(page) {
  const hasil = {};
  for (const m of MENU) {
    await page.evaluate(v => navigateTo(v), m);
    // Tunggu grafik yang menunggu pustaka selesai digambar.
    await page.waitForFunction(() => !Object.values(APP.charts || {}).some(c => c && c._menungguPustaka && !c.batal), null, { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(500);
    hasil[m] = await page.evaluate(() => ({
      kartu: document.querySelectorAll('#viewRoot .card, #viewRoot .stat').length,
      // Grafik Chart.js yang terdaftar (termasuk yang ditunda sampai tergulir ke layar); kalender dihitung terpisah.
      grafik: Object.keys(APP.charts || {}).filter(k => k !== 'kalSebaran').length,
      kanvas: [...document.querySelectorAll('#viewRoot canvas')].filter(c => !c.closest('#kalSebaran')).length
    }));
  }
  return hasil;
}

(async () => {
  const sumber = await layani(AKAR, 4611);
  const build = await layani(path.join(AKAR, 'dist-uji'), 4612);
  const dasar = DASAR ? await layani(path.resolve(DASAR), 4613) : null;
  const URL_ = { sumber: 'http://127.0.0.1:4611/', build: 'http://127.0.0.1:4612/', dasar: 'http://127.0.0.1:4613/' };
  const browser = await chromium.launch();
  const ringkas = {};

  console.log('\nA · Berkas hasil build');
  const dist = (f) => fs.readFileSync(path.join(AKAR, 'dist-uji', f), 'utf8');
  cek('A1 index.html: vendor.js mendahului app.js, tanpa tag CDN supabase/sweetalert2/chart.js',
    dist('index.html').indexOf('src="./vendor.js"') > 0 && dist('index.html').indexOf('src="./vendor.js"') < dist('index.html').indexOf('src="app.js"')
    && !/jsdelivr\.net\/npm\/(@supabase|sweetalert2|chart\.js)/.test(dist('index.html')));
  cek('A2 manifest tetap di akar (start_url/scope tidak bergeser)', dist('index.html').includes('<link rel="manifest" href="manifest.webmanifest">') && fs.existsSync(path.join(AKAR, 'dist-uji/manifest.webmanifest')));
  cek('A3 sw.js: VERSI rq-v2.6x + ./vendor.js di INTI', /VERSI\s+=\s+'rq-v2\.6\d'/.test(dist('sw.js')) && dist('sw.js').includes("'./vendor.js',"));
  const potongan = fs.readdirSync(path.join(AKAR, 'dist-uji/pustaka'));
  cek('A4 potongan pustaka terpisah: chart-*.js & echarts-chemint-*.js', potongan.some(f => /^chart-.+\.js$/.test(f)) && potongan.some(f => /^echarts-chemint-.+\.js$/.test(f)), potongan);
  cek('A5 vendor.js tidak memuat Chart.js maupun ECharts', !/Chart\.js v4|registerController|zrender/i.test(dist('vendor.js')));
  for (const f of ['app.js', 'meja.js', 'panggung.js', 'showreel.js']) {
    const a = fs.statSync(path.join(AKAR, f)).size, b = fs.statSync(path.join(AKAR, 'dist-uji', f)).size;
    cek(`A6 ${f} dipadatkan (${Math.round(a / 1024)} → ${Math.round(b / 1024)} KB)`, b < a * 0.85);
  }

  const varian = DASAR ? ['dasar', 'sumber', 'build'] : ['sumber', 'build'];
  const jejak = {};
  for (const v of varian) {
    console.log(`\nB · ${v}: telusur 20 menu`);
    const s = await masuk(browser, URL_[v]);
    if (v !== 'dasar') {
      const awal = await s.page.evaluate(() => ({ chart: typeof window.Chart, echarts: typeof window.echarts }));
      cek(`B1 ${v}: Chart.js & ECharts BELUM dimuat saat Ringkasan tampil`, awal.chart === 'undefined' && awal.echarts === 'undefined', awal);
      cek(`B2 ${v}: tidak ada unduhan pustaka grafik di muat pertama`, s.catat.grafik.length === 0, s.catat.grafik);
    }
    jejak[v] = await telusuriMenu(s.page);
    cek(`B3 ${v}: 20 menu tanpa galat`, s.galat.length === 0, s.galat.slice(0, 5));
    const plug = s.peringatan.filter(t => /plugin (sorot|tarik|panggung)/.test(t));
    cek(`B4 ${v}: plugin Chart.js terdaftar tanpa peringatan`, plug.length === 0, plug);
    if (v !== 'dasar') {
      const info = await s.page.evaluate(() => ({ jalur: PUSTAKA_LAMBAT.chart.jalur, plugin: ['sorot', 'tarikMonster', 'panggungGrafik'].map(id => !!(Chart.registry.plugins.get(id))) }));
      cek(`B5 ${v}: Chart.js dimuat lewat jalur ${v === 'build' ? 'vite' : 'cdn'}, 3 plugin chemint terdaftar`, info.jalur === (v === 'build' ? 'vite' : 'cdn') && info.plugin.every(Boolean), info);
    }
    await s.ctx.close();
  }
  // Rilis lama → v2.61: Analitik bertambah tepat 1 kartu (Kalender Sebaran); selebihnya harus identik.
  const banding = (a, b) => MENU.filter(m => {
    const x = jejak[a][m], y = jejak[b][m];
    if (a === 'dasar' && m === 'analisis') return !(y.kartu === x.kartu + 1 && y.grafik === x.grafik && y.kanvas === x.kanvas);
    return JSON.stringify(x) !== JSON.stringify(y);
  });
  cek('B6 sumber = build di setiap menu (kartu & grafik)', banding('sumber', 'build').length === 0, banding('sumber', 'build').map(m => [m, jejak.sumber[m], jejak.build[m]]));
  if (DASAR) cek('B7 rilis lama → sumber: sama di 19 menu; Analitik +1 kartu (Kalender), grafik Chart.js sama', banding('dasar', 'sumber').length === 0,
    banding('dasar', 'sumber').map(m => [m, jejak.dasar[m], jejak.sumber[m]]));
  ringkas.menu = jejak;

  console.log('\nC · Kalender Sebaran');
  for (const v of ['sumber', 'build']) {
    const s = await masuk(browser, URL_[v]);
    await s.page.evaluate(() => navigateTo('analisis'));
    await s.page.waitForFunction(() => APP.charts.kalSebaran && document.querySelector('#kalSebaran canvas'), null, { timeout: 20000 });
    const k = await s.page.evaluate(async () => {
      const opsi = APP.charts.kalSebaran.echarts.getOption();
      const data = opsi.series[0].data, jumlah = data.reduce((a, d) => a + d[1], 0);
      const per = periodeRingkasan();
      const awal = data[0][0], akhir = data[data.length - 1][0];
      const rows = lingkupDetail(await muatDetail(), false).filter(r => { const t = kunciTgl(r.tanggal); return t >= awal && t <= akhir; });
      const urutKartu = [...document.querySelectorAll('#viewRoot > *')].map(e => e.id || e.className.split(' ')[0]);
      return { jumlah, harapan: rows.length, hari: data.length, awal, akhir, bulan: per.bulan,
        cerita: document.querySelector('.kal-cerita').textContent, potongan: opsi.visualMap[0].pieces.length,
        sebelumSebaran: urutKartu.indexOf('kalKartu') === urutKartu.indexOf('blokSebaran') - 1,
        jalur: PUSTAKA_LAMBAT.echarts.jalur };
    });
    cek(`C1 ${v}: jumlah di kalender = jumlah catatan pada rentang`, k.jumlah === k.harapan && k.jumlah > 0, { jumlah: k.jumlah, harapan: k.harapan });
    cek(`C2 ${v}: rentang = jendela berdata s.d. hari ini (${k.awal} → ${k.akhir})`, k.awal.endsWith('-01') && k.akhir <= new Date().toISOString().slice(0, 10) && k.hari > 28);
    cek(`C3 ${v}: kalimat cerita ada`, /Hari tersibuk: .+\(rata-rata .+ catatan\)/.test(k.cerita), k.cerita);
    cek(`C4 ${v}: kartu tepat sebelum Peta Perkembangan; ECharts lewat ${k.jalur}`, k.sebelumSebaran && k.jalur === (v === 'build' ? 'vite' : 'cdn'));
    // Pindah halaman → instans ECharts dibuang.
    await s.page.evaluate(() => navigateTo('siswa'));
    const sisa = await s.page.evaluate(() => ({ kal: !!APP.charts.kalSebaran, kanvas: !!document.querySelector('#kalSebaran') }));
    cek(`C5 ${v}: pindah halaman → kalender dibersihkan`, !sisa.kal && !sisa.kanvas, sisa);
    cek(`C6 ${v}: tanpa galat`, s.galat.length === 0, s.galat.slice(0, 5));
    if (v === 'build') {
      await s.page.evaluate(() => navigateTo('analisis'));
      await s.page.waitForFunction(() => document.querySelector('#kalSebaran canvas'));
      await s.page.waitForTimeout(600);
      await s.page.locator('#kalKartu').screenshot({ path: path.join(KELUAR, 'v261-kalender-desktop.png') });
      await s.page.evaluate(() => document.getElementById('chPekan').closest('.card').scrollIntoView({ block: 'start' }));
      await s.page.waitForTimeout(400);
      await s.page.screenshot({ path: path.join(KELUAR, 'v261-analisis-desktop.png') });
    }
    await s.ctx.close();
  }
  { // HP
    const s = await masuk(browser, URL_.build, { vp: { width: 390, height: 844 }, hp: true, dpr: 2 });
    await s.page.evaluate(() => navigateTo('analisis'));
    await s.page.waitForFunction(() => document.querySelector('#kalSebaran canvas'), null, { timeout: 20000 });
    await s.page.waitForTimeout(600);
    const hp = await s.page.evaluate(() => { const o = APP.charts.kalSebaran.echarts.getOption(); const k = document.getElementById('kalSebaran');
      return { orient: o.calendar[0].orient, lebar: k.clientWidth, tinggi: k.clientHeight, lembar: document.querySelector('#kalKartu .tag').textContent, luber: document.documentElement.scrollWidth > innerWidth + 1 }; });
    cek('C7 HP: kalender tegak, 3 lembar, tanpa gulir mendatar', hp.orient === 'vertical' && !hp.luber && hp.tinggi < 520, hp);
    await s.page.locator('#kalKartu').screenshot({ path: path.join(KELUAR, 'v261-kalender-hp.png') });
    cek('C8 HP: tanpa galat', s.galat.length === 0, s.galat.slice(0, 5));
    await s.ctx.close();
  }

  console.log('\nD · Ketahanan');
  for (const v of ['sumber', 'build']) {
    // D1: pustaka grafik gagal diunduh → pesan santun + Coba lagi berhasil setelah sambungan pulih.
    // build: potongan Vite DAN cadangan CDN sama-sama diblokir (jaringan benar-benar putus untuk pustaka).
    const blokir = v === 'build' ? /\/pustaka\/|chart\.js@|echarts@/ : /chart\.js@|echarts@/;
    const o = { blokir };
    const s = await masuk(browser, URL_[v], o);
    await s.page.evaluate(() => navigateTo('analisis'));
    await s.page.waitForFunction(() => document.querySelectorAll('.grafik-gagal').length >= 2, null, { timeout: 15000 }).catch(() => {});
    const n = await s.page.evaluate(() => ({ gagal: document.querySelectorAll('.grafik-gagal').length, teks: document.querySelector('.grafik-gagal')?.innerText }));
    cek(`D1 ${v}: pustaka diblokir → pesan "Grafik belum termuat" di tiap kotak (${n.gagal})`, n.gagal >= 6 && /Grafik belum termuat/.test(n.teks || ''), n);
    o.blokir = null;   // sambungan pulih (build: import() gagal disimpan peramban → app.js beralih ke CDN)
    await s.page.locator('#chPekan').locator('..').locator('.grafik-gagal button').click();
    await s.page.waitForFunction(() => window.Chart && Chart.getChart && Chart.getChart(document.getElementById('chPekan')), null, { timeout: 15000 }).catch(() => {});
    const pulih = await s.page.evaluate(() => !!(window.Chart && Chart.getChart(document.getElementById('chPekan'))));
    cek(`D2 ${v}: Coba lagi → grafik tergambar`, pulih);
    const gal = s.galat.filter(g => !/ERR_FAILED|net::|Failed to load resource|dynamically imported module|Importing a module script failed/i.test(g));
    cek(`D3 ${v}: tanpa galat skrip (selain unduhan yang memang diblokir)`, gal.length === 0, gal.slice(0, 5));
    await s.ctx.close();
  }
  { // D4: pindah halaman saat pustaka sedang diunduh lambat
    const s = await masuk(browser, URL_.build, { tunda: /\/pustaka\//, tundaMs: 1800 });
    await s.page.evaluate(() => { navigateTo('analisis'); });
    await s.page.waitForTimeout(500);
    await s.page.evaluate(() => navigateTo('siswa'));
    await s.page.waitForTimeout(2500);
    const r = await s.page.evaluate(() => ({ view: APP.view, grafik: Object.keys(APP.charts).length, kanvas: document.querySelectorAll('#viewRoot canvas').length, kal: !!document.getElementById('kalKartu') }));
    cek('D4 build: pindah halaman saat pustaka lambat → tidak ada grafik nyasar', r.view === 'siswa' && r.grafik === 0 && r.kanvas === 0 && !r.kal, r);
    cek('D5 build: tanpa galat', s.galat.length === 0, s.galat.slice(0, 5));
    await s.ctx.close();
  }
  { // D6: pemadatan tidak merusak Web Worker (dibangun dari toString) & hujan monster mode penuh
    const s = await masuk(browser, URL_.build, { gerak: true });
    const w = await s.page.evaluate(async () => {
      const csv = 'nisn;nama_siswa;kelas\n2400001;"Ahmad; Fadhil";X-C\n2400002;Siti;IX-F\n';
      Pekerja.gagal = false;
      const a = await Pekerja.panggil('uraiCsv', [csv], () => 'CADANGAN');
      const b = PEKERJA_ASLI.uraiCsv(csv);
      return { worker: a !== 'CADANGAN', sama: JSON.stringify(a) === JSON.stringify(b) };
    });
    cek('D6 build: Web Worker (CSV) jalan & hasilnya = utas utama', w.worker && w.sama, w);
    await s.page.waitForTimeout(2500);
    const pek = s.peringatan.filter(t => /\[pekerja\]/.test(t));
    cek('D7 build: mode penuh (hujan monster) tanpa galat pekerja', s.galat.length === 0 && pek.length === 0, { galat: s.galat.slice(0, 3), pek });
    await s.ctx.close();
  }
  { // D8: pramuat diam-diam sesudah halaman pertama (≈5 dtk) — grafik siap sebelum Analitik dibuka
    const s = await masuk(browser, URL_.build);
    await s.page.waitForFunction(() => !!window.Chart, null, { timeout: 15000 }).catch(() => {});
    const r = await s.page.evaluate(() => ({ chart: !!window.Chart, echarts: !!window.echarts }));
    cek('D8 build: Chart.js dipramuat saat menganggur; ECharts tetap menunggu Analitik', r.chart && !r.echarts, r);
    await s.ctx.close();
  }

  if (!CEPAT) {
    console.log('\nE · Kecepatan muat pertama (HP 390 px, CPU 4×, median 3)');
    const PROFIL = { '4G (9 Mbps, RTT 70 ms)': { dl: 9e6 / 8, ul: 3e6 / 8, rtt: 70, cpu: 4 }, 'sinyal lemah (1,6 Mbps, RTT 300 ms)': { dl: 1.6e6 / 8, ul: 0.75e6 / 8, rtt: 300, cpu: 4 } };
    ringkas.kecepatan = {};
    for (const [label, net] of Object.entries(PROFIL)) {
      ringkas.kecepatan[label] = {};
      for (const v of varian) {
        const u = [];
        for (let i = 0; i < 3; i++) {
          const s = await masuk(browser, URL_[v], { net, hp: true, vp: { width: 390, height: 844 } });
          const tr = await s.page.evaluate(() => performance.getEntriesByType('resource').filter(e => /127\.0\.0\.1/.test(e.name)).reduce((a, e) => a + e.transferSize, 0)
            + (performance.getEntriesByType('navigation')[0] || {}).transferSize);
          u.push({ login: s.tLogin, siap: s.tSiap, kb: Math.round(tr / 1000) });
          await s.ctx.close();
        }
        u.sort((a, b) => a.siap - b.siap);
        ringkas.kecepatan[label][v] = u[1];
      }
      console.log('  ', label, JSON.stringify(ringkas.kecepatan[label]));
    }
  }

  await browser.close(); sumber.close(); build.close(); dasar && dasar.close();
  fs.writeFileSync(path.join(KELUAR, 'hasil-v261.json'), JSON.stringify(ringkas, null, 1));
  console.log(`\n${lulus} lulus, ${gagal} gagal`);
  process.exit(gagal ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
