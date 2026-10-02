/* Dimuat lewat NODE_OPTIONS=--require: regresi lama (yang mengharapkan dasbor langsung terbuka bila bersesi)
   dijalankan dengan sakelar per perangkat rq-singgah = 'mati'. Tidak mengubah berkas uji lama. */
const pw = require('playwright');
const Browser = Object.getPrototypeOf(pw.chromium).constructor; // tidak dipakai
const asliLaunch = pw.chromium.launch.bind(pw.chromium);
pw.chromium.launch = async (...a) => {
  const b = await asliLaunch(...a);
  const asliCtx = b.newContext.bind(b);
  b.newContext = async (...o) => { const c = await asliCtx(...o); await c.addInitScript(() => { try { localStorage.setItem('rq-singgah', 'mati'); } catch (e) {} }); return c; };
  return b;
};
