/* potret-v267.cjs — tangkapan layar navigasi (bukan uji). node uji/potret-v267.cjs [awalan] */
const fs = require('fs'), path = require('path'), http = require('http');
const { chromium } = require('playwright');
const { MOCK } = require('./mock.cjs');
const AKAR = path.resolve(__dirname, '..'), NM = path.join(AKAR, 'node_modules');
const KELUAR = path.join(__dirname, 'keluaran'); fs.mkdirSync(KELUAR, { recursive: true });
const JENIS = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.woff2': 'font/woff2' };
function layani(dir) { return new Promise(ok => { const s = http.createServer((req, res) => { const p = decodeURIComponent(req.url.split('?')[0]); const f = path.join(dir, p === '/' ? 'index.html' : p);
  if (!f.startsWith(dir) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': JENIS[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f)); }).listen(0, '127.0.0.1', () => ok(s)); }); }
async function masuk(browser, url, o = {}) {
  const ctx = await browser.newContext({ viewport: o.vp || (o.hp ? { width: 390, height: 844 } : { width: 1366, height: 860 }), deviceScaleFactor: o.hp ? 2 : 1, isMobile: !!o.hp, hasTouch: !!o.hp, serviceWorkers: 'block', reducedMotion: o.gerak ? 'no-preference' : 'reduce', ...(o.video ? { recordVideo: { dir: o.video, size: o.vp || (o.hp ? { width: 390, height: 844 } : { width: 1366, height: 860 }) } } : {}) });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, async (route) => { const u = route.request().url();
    if (u.includes('supabase-js')) return route.fulfill({ contentType: 'application/javascript', body: MOCK });
    if (u.includes('sweetalert2')) return route.fulfill({ contentType: 'application/javascript', path: NM + '/sweetalert2/dist/sweetalert2.all.min.js' });
    if (u.includes('chart.js@')) return route.fulfill({ contentType: 'application/javascript', path: NM + '/chart.js/dist/chart.umd.min.js' });
    if (u.includes('echarts@')) return route.fulfill({ contentType: 'application/javascript', path: NM + '/echarts/dist/echarts.min.js' });
    if (u.includes('fonts.g')) return route.abort();
    return route.fulfill({ status: 200, contentType: 'text/css', body: '' }); });
  const page = await ctx.newPage(); const galat = [];
  page.on('pageerror', e => galat.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_/.test(m.text())) galat.push('console: ' + m.text()); });
  await page.addInitScript(`(${(o) => { window.__PERAN = o.peran || 'Admin'; window.__KELAS = o.kelas || []; window.__KORPS = o.korps || null; if (o.super) window.__SUPER = true;
    try { localStorage.setItem('rq-efek-pilih', o.gerak ? 'penuh' : 'hemat'); localStorage.setItem('rq.tur.v1.u-admin', '{"t":0}'); if (o.langit) localStorage.setItem('rq-langit', o.langit); } catch (e) {}
    window.__RPC = Object.assign(window.__RPC || {}, { adalah_super_admin: () => ({ data: !!o.super, error: null }) }); }})(${JSON.stringify(o)});`);
  await page.goto(url + (o.hash || ''), { waitUntil: 'commit' });
  await page.waitForFunction(() => { const b = document.getElementById('btnLogin'); return typeof APP !== 'undefined' && b && b.offsetParent && !b.disabled; }, null, { timeout: 120000 });
  await page.click('#btnLogin');
  await page.waitForFunction(() => typeof APP !== 'undefined' && APP.profil && document.querySelector('#viewRoot') && document.querySelector('#viewRoot').children.length, null, { timeout: 120000 });
  await page.waitForTimeout(1800);
  return { ctx, page, galat };
}
module.exports = { masuk, layani, KELUAR, AKAR };
if (require.main === module) (async () => {
  const awal = process.argv[2] || 'lama';
  const srv = await layani(AKAR); const url = `http://127.0.0.1:${srv.address().port}/`;
  const browser = await chromium.launch();
  for (const [nama, o] of [['guru-desk', { peran: 'Guru', kelas: ['VIII-D'], korps: 'Musyrif Asrama Putra' }], ['guru-hp', { hp: true, peran: 'Guru', kelas: ['VIII-D'] }], ['admin-desk', { peran: 'Admin', super: true }]]) {
    const s = await masuk(browser, url, o);
    await s.page.screenshot({ path: path.join(KELUAR, `${awal}-${nama}.png`) });
    if (o.hp) { await s.page.click('#tabMenu'); await s.page.waitForTimeout(600); await s.page.screenshot({ path: path.join(KELUAR, `${awal}-${nama}-menu.png`) }); }
    else { await s.page.mouse.move(30, 300); await s.page.mouse.move(36, 320); await s.page.waitForTimeout(700); await s.page.screenshot({ path: path.join(KELUAR, `${awal}-${nama}-sisi.png`) }); }
    console.log(nama, s.galat.slice(0, 3)); await s.ctx.close(); }
  await browser.close(); srv.close();
})();
