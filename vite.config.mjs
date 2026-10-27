/* chemint · vite.config.mjs — Vite tahap 1 (v2.60)
 *
 * Prinsip: berkas sumber tetap bisa dibuka apa adanya (tanpa build).
 * Build hanya MEMADATKAN dan MENGGANTI jalur pustaka:
 *   · app.js, meja.js, panggung.js, showreel.js tetap skrip klasik dengan nama
 *     yang sama — dipadatkan Oxc (nama tingkat atas TIDAK diubah, karena
 *     onclick di HTML, pembungkus fungsi, dan Web Worker dari toString()
 *     bergantung padanya).
 *   · Tag CDN supabase-js & sweetalert2 → satu vendor.js swa-saji.
 *   · Chart.js & ECharts → potongan pustaka/*.js, dimuat app.js saat perlu.
 *   · sw.js: './vendor.js' ditambahkan ke INTI.
 *   · manifest.webmanifest TIDAK dipindah (start_url/scope relatif terhadapnya).
 *
 *   npm run bangun       → dist/      (yang diterbitkan)
 *   npm run bangun:uji   → dist-uji/  (Supabase diganti tiruan, untuk uji/)
 */
import { defineConfig, minify } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const AKAR = path.dirname(new URL(import.meta.url).pathname);
const UJI = process.env.RQ_UJI === '1';
const KLASIK = ['app.js', 'meja.js', 'panggung.js', 'showreel.js', 'sidang.js'];   // v2.64: + sidang.js
const SALIN = ['manifest.webmanifest', 'favicon-64.png', 'icon-192.png', 'icon-512.png', 'icon-512-maskable.png', 'diagnosa.html',
  'ikon/fa-solid-subset.woff2', 'ikon/fa-regular-subset.woff2', 'ikon/fa-brands-subset.woff2'];
/* v2.62: gaya klasik — hanya komentar yang dibuang (bukan dipadatkan lightningcss:
   pemadat mengubah `max-width` menjadi sintaks rentang & warna menjadi oklab(), yang
   tidak dikenal Safari lama). Nama berkas tetap agar tercantum di INTI sw.js.
   Tag <link>-nya disembunyikan dari Vite (lihat GAYA_TAG). */
const GAYA = ['gaya.css', 'ikon/fa-subset.css'];
const GAYA_TAG = (f) => `<link rel="stylesheet" href="${f}">`;
const GAYA_PENANDA = (f) => `<!--RQ_GAYA:${f}-->`;
const TAG_CDN = (paket) => new RegExp(`<script defer src="https://cdn\\.jsdelivr\\.net/npm/${paket.replace(/[./]/g, '\\$&')}@[^"]+"></script>\\n?`);

/** Buang komentar CSS di luar string; selebihnya byte demi byte sama. */
function buangKomentarCss(css) {
  let o = '', i = 0, q = null;
  while (i < css.length) {
    const c = css[i];
    if (q) { o += c; if (c === '\\') { o += css[i + 1] ?? ''; i += 2; continue; } if (c === q) q = null; i++; continue; }
    if (c === '"' || c === "'") { q = c; o += c; i++; continue; }
    if (c === '/' && css[i + 1] === '*') { const z = css.indexOf('*/', i + 2); i = z < 0 ? css.length : z + 2; continue; }
    o += c; i++;
  }
  return o.replace(/\n[ \t]*\n+/g, '\n');
}

function chemint() {
  return {
    name: 'chemint-tahap-1',
    enforce: 'pre',   // resolveId tiruan harus mendahului penyelesai modul bawaan Vite

    // Supabase tiruan untuk uji (hanya bangun:uji).
    resolveId(id) { if (UJI && id === '@supabase/supabase-js') return '\0supabase-tiruan'; },
    load(id) {
      if (id !== '\0supabase-tiruan') return;
      const { MOCK } = createRequire(import.meta.url)('./uji/mock.cjs');
      return MOCK + '\nexport const createClient = window.supabase.createClient;\n';
    },

    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        const sb = TAG_CDN('@supabase/supabase-js'), sw = TAG_CDN('sweetalert2');
        if (!sb.test(html) || !sw.test(html)) throw new Error('[chemint] tag CDN supabase-js/sweetalert2 tidak ditemukan di index.html');
        html = html.replace(sb, '<script type="module" src="./vite/vendor.js"></script>\n').replace(sw, '');
        for (const f of GAYA) {
          if (!html.includes(GAYA_TAG(f))) throw new Error(`[chemint] ${GAYA_TAG(f)} tidak ditemukan di index.html`);
          html = html.replace(GAYA_TAG(f), GAYA_PENANDA(f));
        }
        if (TAG_CDN('chart.js').test(html)) this.warn?.('[chemint] tag CDN chart.js masih ada — dibiarkan (index.html lama).');
        // Lindungi manifest dari pemindahan ke assets/ (start_url & scope relatif terhadap berkasnya).
        return html.replace('<link rel="manifest" href="manifest.webmanifest">', '<link rel="manifest" href="__RQ_MANIFEST__">');
      }
    },

    async generateBundle() {
      // 1. Skrip klasik: padatkan, nama berkas tetap.
      for (const f of KLASIK) {
        const kode = fs.readFileSync(path.join(AKAR, f), 'utf8');
        const r = await minify(f, kode, { compress: true, mangle: { toplevel: false }, codegen: { removeWhitespace: true }, module: false, sourcemap: false });
        if (r.errors && r.errors.length) throw new Error(`[chemint] gagal memadatkan ${f}: ${JSON.stringify(r.errors).slice(0, 400)}`);
        this.emitFile({ type: 'asset', fileName: f, source: r.code });
      }
      // 1b. Gaya: buang komentar saja, nama berkas tetap.
      for (const f of GAYA) this.emitFile({ type: 'asset', fileName: f, source: buangKomentarCss(fs.readFileSync(path.join(AKAR, f), 'utf8')) });
      // 2. Berkas statis apa adanya.
      for (const f of SALIN) this.emitFile({ type: 'asset', fileName: f, source: fs.readFileSync(path.join(AKAR, f)) });
      // 3. Service worker: vendor.js ikut INTI (cache-first, ganti hanya saat VERSI naik).
      const sw = fs.readFileSync(path.join(AKAR, 'sw.js'), 'utf8');
      const swBaru = sw.replace("  './app.js',\n", "  './app.js',\n  './vendor.js',        // v2.60: hasil Vite (supabase-js + sweetalert2)\n");
      if (swBaru === sw) throw new Error("[chemint] baris './app.js', di INTI sw.js tidak ditemukan");
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: swBaru });
    }
  };
}

/* index.html sesudah Vite menyuntikkan vendor.js: kembalikan alamat manifest,
   pastikan rangkaian skrip lengkap dan berurutan. */
function periksaHtml() {
  return {
    name: 'chemint-periksa-html',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        html = html.replace('__RQ_MANIFEST__', 'manifest.webmanifest');
        for (const f of GAYA) html = html.replace(GAYA_PENANDA(f), GAYA_TAG(f));
        for (const wajib of ['src="./vendor.js"', 'src="app.js"', 'href="manifest.webmanifest"', ...GAYA.map(GAYA_TAG)])
          if (!html.includes(wajib)) throw new Error(`[chemint] index.html hasil build tidak memuat ${wajib}`);
        if (html.indexOf('src="./vendor.js"') > html.indexOf('src="app.js"')) throw new Error('[chemint] vendor.js harus mendahului app.js');
        return html;
      }
    }
  };
}

export default defineConfig({
  root: AKAR,
  base: './',
  publicDir: false,
  logLevel: 'info',
  plugins: [chemint(), periksaHtml()],
  build: {
    outDir: UJI ? 'dist-uji' : 'dist',
    emptyOutDir: true,
    target: ['es2020', 'safari14'],      // setara batas app.js (Safari ≥ 14.5)
    modulePreload: false,                // potongan pustaka hanya diunduh saat diminta
    reportCompressedSize: true,
    rolldownOptions: {
      output: {
        entryFileNames: 'vendor.js',
        chunkFileNames: (c) => `pustaka/${c.name === 'auto' ? 'chart' : c.name}-[hash].js`,   // chart.js/auto → chart-*.js
        assetFileNames: 'pustaka/[name]-[hash][extname]'
      }
    }
  }
});
