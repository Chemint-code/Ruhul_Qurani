/* lihat.js — tangkapan layar Ringkasan (bukan uji). node lihat.js */
const H = require('./harness.js'), D = require('./dasar-uji.js'); const { chromium, CDN, path, fs } = H;
const out = path.join(__dirname, 'keluaran-v248');
const src = fs.readFileSync(path.join(__dirname, 'uji-v248.js'), 'utf8');
const DETAIL = src.match(/const DETAIL = `([\s\S]*?)`;/)[1];
const MOCK = H.MOCK.replace(/detail_data: Array\.from\(.*\n/, DETAIL + '\n');
(async () => { const browser = await chromium.launch();
  const srv = D.layani(process.env.HOME + '/Ruhul_Qurani').listen(0);
  for (const [nama, vp, mobile] of [['d1280', { width: 1280, height: 900 }, false], ['hp360', { width: 360, height: 760 }, true]]) {
    const ctx = await browser.newContext({ viewport: vp, serviceWorkers: 'block', isMobile: mobile, hasTouch: mobile, deviceScaleFactor: mobile ? 2 : 1 });
    await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, async (route) => { const u = route.request().url();
      if (u.includes('supabase-js')) return route.fulfill({ contentType: 'application/javascript', body: MOCK });
      if (u.includes('sweetalert2')) return route.fulfill({ contentType: 'application/javascript', path: CDN + '/sweetalert2/dist/sweetalert2.all.min.js' });
      if (u.includes('chart.js')) return route.fulfill({ contentType: 'application/javascript', path: CDN + '/chart.js/dist/chart.umd.min.js' });
      return route.continue().catch(() => {}); });
    const page = await ctx.newPage();
    await page.addInitScript((t) => { const A = Date, g = t - A.now(); class G extends A { constructor(...a) { super(...(a.length ? a : [A.now() + g])); } static now() { return A.now() + g; } } window.Date = G; }, new Date('2026-09-22T09:00:00+07:00').getTime());
    await page.addInitScript(() => { try { localStorage.setItem('rq-singgah', 'mati'); localStorage.setItem('rq.tur.v1.u-admin', '{"t":0}'); } catch (e) {} window.__PERAN = 'Admin'; });
    await page.goto(`http://127.0.0.1:${srv.address().port}/`);
    await page.waitForFunction(() => typeof APP !== 'undefined' && APP.profil && document.querySelector('#viewRoot .stats'), null, { timeout: 25000 });
    await page.waitForTimeout(3000);
    await page.evaluate(() => { const e = document.querySelector('#viewRoot .rb-periode'); window.scrollTo(0, e.getBoundingClientRect().top + scrollY - 90); });
    await page.waitForTimeout(3500); await page.screenshot({ path: `${out}/${nama}-1.png` });
    await page.evaluate(() => { const e = [...document.querySelectorAll('#viewRoot .card')].find(x => x.querySelector('h3')?.textContent === 'Cermin Muhasabah'); window.scrollTo(0, e.getBoundingClientRect().top + scrollY - 90); });
    await page.waitForTimeout(2000); await page.screenshot({ path: `${out}/${nama}-2.png` });
    await ctx.close(); }
  await browser.close(); srv.close(); })();
