/* reel-bantu.js — pembantu uji v2.47: buka layar masuk TANPA sesi, huruf asli dari @fontsource. */
const H = require('./harness.js');
const D = require('./dasar-uji.js');
const { path, fs, CDN } = H;
const FS = CDN + '/@fontsource';
const HURUF = [
  ['Inter Tight', 'normal', 400, 'inter-tight/files/inter-tight-latin-400-normal.woff2'],
  ['Inter Tight', 'normal', 500, 'inter-tight/files/inter-tight-latin-500-normal.woff2'],
  ['Inter Tight', 'normal', 600, 'inter-tight/files/inter-tight-latin-600-normal.woff2'],
  ['Inter Tight', 'normal', 700, 'inter-tight/files/inter-tight-latin-700-normal.woff2'],
  ['Inter Tight', 'normal', 800, 'inter-tight/files/inter-tight-latin-800-normal.woff2'],
  ['Instrument Serif', 'normal', 400, 'instrument-serif/files/instrument-serif-latin-400-normal.woff2'],
  ['Instrument Serif', 'italic', 400, 'instrument-serif/files/instrument-serif-latin-400-italic.woff2'],
  ['IBM Plex Mono', 'normal', 400, 'ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff2'],
  ['IBM Plex Mono', 'normal', 500, 'ibm-plex-mono/files/ibm-plex-mono-latin-500-normal.woff2'],
  ['IBM Plex Mono', 'normal', 600, 'ibm-plex-mono/files/ibm-plex-mono-latin-600-normal.woff2'],
  ['Amiri', 'normal', 400, 'amiri/files/amiri-arabic-400-normal.woff2'],
  ['Amiri', 'normal', 700, 'amiri/files/amiri-arabic-700-normal.woff2']
];
/* MOCK harness + masuk sungguhan: signInWithPassword membuat sesi (getSession membacanya). */
const MOCK = H.MOCK
  .replace("const sesi = window.__TANPASESI", "let sesi = window.__TANPASESI")
  .replace("signInWithPassword: async()=>({data:{},error:null})",
           "signInWithPassword: async()=>{ sesi = { user:{ id:(window.__SAYA||'u-admin'), email:'admin@x' }, access_token:'t' }; return {data:{},error:null}; }");
if (MOCK === H.MOCK || !MOCK.includes('let sesi')) throw new Error('MOCK masuk tidak tersuntik: pola harness.js berubah');
const MONA = `@font-face{font-family:'Mona Sans';font-style:italic;font-weight:200 900;font-stretch:75% 125%;font-display:swap;src:url(https://fonts.gstatic.com/mona/latin-wdth-italic.woff2) format('woff2');}\n`;
const CSS = MONA + HURUF.map(([f, s, w, p]) => `@font-face{font-family:'${f}';font-style:${s};font-weight:${w};font-display:swap;src:url(https://fonts.gstatic.com/${p}) format('woff2');}`).join('\n');

async function bukaLogin(browser, url, o = {}) {
  const ctx = await browser.newContext({ recordVideo: o.video, viewport: o.viewport || { width: 1366, height: 860 }, serviceWorkers: 'block',
    reducedMotion: o.reduce ? 'reduce' : 'no-preference', isMobile: !!o.mobile, hasTouch: !!o.mobile,
    deviceScaleFactor: o.dsf || 1 });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, async (route) => {
    const u = route.request().url();
    if (u.includes('supabase-js')) return route.fulfill({ contentType: 'application/javascript', body: MOCK });
    if (u.includes('sweetalert2')) return route.fulfill({ contentType: 'application/javascript', path: CDN + '/sweetalert2/dist/sweetalert2.all.min.js' });
    if (u.includes('chart.js')) return route.fulfill({ contentType: 'application/javascript', path: CDN + '/chart.js/dist/chart.umd.min.js' });
    if (u.includes('fonts.googleapis.com')) return route.fulfill({ contentType: 'text/css', body: CSS });
    if (u.startsWith('https://fonts.gstatic.com/')) return route.fulfill({ contentType: 'font/woff2', path: FS + '/' + u.slice(26) });
    return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
  });
  if (o.awal) await ctx.addInitScript(o.awal);
  if (!o.sesi) await ctx.addInitScript(() => { window.__TANPASESI = true; });   // o.sesi: pengguna bersesi (mode singgah v2.47.2)
  const page = await ctx.newPage();
  page.__galat = [];
  page.on('pageerror', e => page.__galat.push('pageerror: ' + e.message + ' @ ' + String(e.stack).split('\n').slice(1,3).join(' | ')));
  page.on('console', m => { if (m.type() === 'error') page.__galat.push('console: ' + m.text()); });
  await page.goto(url);
  if (o.tanpaTunggu) return { ctx, page };
  await page.waitForFunction(() => window.RQReel && window.RQReel.keadaan().hidup, null, { timeout: 25000 });
  await page.evaluate(() => document.fonts.ready);
  return { ctx, page };
}
module.exports = { MOCK, bukaLogin, layani: D.layani };
