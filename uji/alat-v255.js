/* alat-v255.js — pembuka aplikasi UTUH (Supabase tiruan, data Agt–Okt 2026,
 * waktu dibekukan 20 Okt 2026 10.00 WIB) untuk uji & render v2.55.
 *   RQDIR=<folder app.js> node uji/uji-v255.js
 */
const fs = require('fs'), path = require('path'), http = require('http');
const NM = process.env.NM || '/tmp/cdn/node_modules';
const { chromium } = require(NM + '/playwright');
const H = require('./harness.js');
const DIR = process.env.RQDIR || path.join(__dirname, '..');
const DATA = require('./data-v255.js');

let MOCK = H.MOCK.replace(/const T = \{[\s\S]*?\n  \};\n  window.__LOG/, 'const T = window.__T;\n  window.__LOG');
MOCK = MOCK.replace("if (nama === 'kehadiran_analisis') {",
  "if (window.__RPC_TIRUAN && window.__RPC_TIRUAN[nama]) { const f = window.__RPC_TIRUAN[nama]; return new Promise(r=>setTimeout(()=>r(f(arg)),JEDA)); }\n      if (nama === 'kehadiran_analisis') {");
if (!MOCK.includes('window.__T;') || !MOCK.includes('__RPC_TIRUAN')) throw new Error('MOCK tidak tertambal');

function fontsCss(port) {
  const pick = [['inter-tight', ['400', '500', '600', '700', '800']], ['instrument-serif', ['400', '400-italic']], ['ibm-plex-mono', ['400', '500', '600']], ['amiri', ['400', '700']]];
  let css = '';
  for (const [p, ws] of pick) for (const w of ws) { const f = `${NM}/@fontsource/${p}/${w}.css`; if (fs.existsSync(f)) css += fs.readFileSync(f, 'utf8').replace(/url\(\.\/files\//g, `url(http://127.0.0.1:${port}/__nm/@fontsource/${p}/files/`); }
  return css;
}
function layani() {
  const J = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.woff': 'font/woff', '.png': 'image/png', '.webmanifest': 'application/json' };
  return http.createServer((req, res) => {
    const p = decodeURIComponent(req.url.split('?')[0]);
    const f = p.startsWith('/__nm/') ? path.join(NM, p.slice(6)) : path.join(DIR, p === '/' ? 'index.html' : p);
    if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': J[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
  });
}

const galat = [];
/** o: { mobile, peran, jam ('2026-10-20T10:00:00+07:00'), init(fn), data(obj→obj), rpcKabar ('ada'|'hilang') } */
async function buka(browser, port, o = {}) {
  const mobile = !!o.mobile, vp = mobile ? { width: 390, height: 844 } : { width: 1366, height: 800 };
  const ctx = await browser.newContext({ viewport: vp, serviceWorkers: 'block', isMobile: mobile, hasTouch: mobile,
    deviceScaleFactor: o.dsf || 1, reducedMotion: 'reduce', timezoneId: 'Asia/Jakarta', locale: 'id-ID' });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, async (route) => {
    const u = route.request().url();
    if (u.includes('supabase-js')) return route.fulfill({ contentType: 'application/javascript', body: MOCK });
    if (u.includes('sweetalert2')) return route.fulfill({ contentType: 'application/javascript', path: NM + '/sweetalert2/dist/sweetalert2.all.min.js' });
    if (u.includes('chart.js')) return route.fulfill({ contentType: 'application/javascript', path: NM + '/chart.js/dist/chart.umd.min.js' });
    if (u.includes('font-awesome')) return route.fulfill({ contentType: 'text/css', body: fs.readFileSync(NM + '/@fortawesome/fontawesome-free/css/all.min.css', 'utf8').replace(/url\(\.\.\/webfonts\//g, `url(http://127.0.0.1:${port}/__nm/@fortawesome/fontawesome-free/webfonts/`) });
    if (u.includes('fonts.googleapis')) return route.fulfill({ contentType: 'text/css', body: fontsCss(port) });
    return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
  });
  const page = await ctx.newPage();
  page.on('pageerror', e => galat.push('pageerror: ' + e.message + ' @ ' + String(e.stack).split('\n').slice(1, 3).join(' | ')));
  page.on('console', m => { if (m.type() === 'error' && !/404|Failed to load resource/.test(m.text())) galat.push('console: ' + m.text()); });
  const t = new Date(o.jam || '2026-10-20T10:00:00+07:00').getTime();
  await page.addInitScript((t) => { const A = Date, g = t - A.now(); class G extends A { constructor(...a) { super(...(a.length ? a : [A.now() + g])); } static now() { return A.now() + g; } } window.Date = G; }, t);
  let T = DATA(); if (o.data) T = o.data(T);
  await page.addInitScript((a) => {
    window.__T = a.T; window.__PERAN = a.peran || 'Admin';
    if (a.peran && a.peran !== 'Admin') window.__T.profiles[0].role = a.peran;
    if (a.kelas) window.__T.profiles[0].kelas_binaan = a.kelas;
    window.__KABAR = [];
    window.__RPC_TIRUAN = {
      bulan_terkunci: () => ({ data: [{ bulan: '2026-08', ditutup_pada: '2026-09-01T00:00:00Z', terkunci: true }, { bulan: '2026-09', ditutup_pada: '2026-10-01T00:00:00Z', terkunci: true }], error: null })
    };
    if (a.rpcKabar !== 'hilang') {
      window.__RPC_TIRUAN.kabar_wali_tercatat = () => ({ data: window.__KABAR.map(k => ({ id_pembinaan: k.id, terakhir: k.waktu, kali: 1 })), error: null });
      window.__RPC_TIRUAN.catat_kabar_wali = (arg) => { const w = new Date().toISOString(); window.__KABAR.push({ id: arg.p_id_pembinaan, waktu: w }); return { data: w, error: null }; };
    } else {
      const hilang = (n) => () => ({ data: null, error: { code: 'PGRST202', message: `Could not find the function public.${n}` } });
      window.__RPC_TIRUAN.kabar_wali_tercatat = hilang('kabar_wali_tercatat');
      window.__RPC_TIRUAN.catat_kabar_wali = hilang('catat_kabar_wali');
    }
    try { localStorage.setItem('rq-singgah', 'mati'); localStorage.setItem('rq.tur.v1.u-admin', '{"t":0}'); localStorage.setItem('rq-efek-pilih', 'penuh'); localStorage.setItem('rq_lembar_umum', '2026-10'); } catch (e) {}
  }, { T, peran: o.peran, kelas: o.kelas, rpcKabar: o.rpcKabar });
  if (o.init) await page.addInitScript(o.init);
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.waitForFunction(() => typeof APP !== 'undefined' && APP.profil && APP.viewTampil && !APP.navSibuk && document.querySelector('#viewRoot > *:not(.rq-rangka)'), null, { timeout: 30000 });
  await page.waitForTimeout(1500);
  await page.evaluate(() => { try { Swal.close(); } catch (e) {} });
  await page.mouse.move(vp.width - 20, vp.height - 20);
  return { ctx, page };
}
const tungguNav = (page) => page.waitForFunction(() => !APP.navSibuk, null, { timeout: 20000 }).then(() => page.waitForTimeout(700));

let lulus = 0, gagal = 0;
const cek = (j, ok, info) => { ok ? lulus++ : gagal++; console.log(`${ok ? '  ok  ' : ' GAGAL'} ${j}${info !== undefined ? '  · ' + JSON.stringify(info) : ''}`); };
const hasil = () => ({ lulus, gagal });
module.exports = { chromium, layani, buka, tungguNav, cek, hasil, galat, DIR };
