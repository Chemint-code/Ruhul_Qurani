/* =====================================================================
   SERVICE WORKER — Pengembangan Santri (Dayah Ruhul Qurani)

   Strategi sengaja dibuat sederhana supaya mudah ditelusuri:
     · Kerangka aplikasi (HTML/JS/manifest)  -> network-first, cache
       dipakai hanya bila jaringan gagal. Ini mencegah pengguna
       terjebak pada versi lama setelah aplikasi diperbarui.
     · Aset pihak ketiga (font, ikon, pustaka CDN) -> cache-first,
       karena berversi dan praktis tidak pernah berubah.
     · Permintaan ke Supabase (API/Auth/Storage) -> TIDAK PERNAH
       di-cache. Data santri harus selalu berasal dari server;
       penyimpanan sementara saat luring ditangani antrean di app.js.
   ===================================================================== */

const VERSI       = 'rq-v2.1.0';
const CACHE_INTI  = `${VERSI}-inti`;
const CACHE_ASET  = `${VERSI}-aset`;

const INTI = [
  './',
  './index.html',
  './app.js',
  './manifest.webmanifest'
];

const CDN_DIIZINKAN = [
  'https://fonts.googleapis.com',
  'https://fonts.gstatic.com',
  'https://cdnjs.cloudflare.com',
  'https://cdn.jsdelivr.net'
];

// ---------------------------------------------------------------------
self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE_INTI);
    // addAll gagal total bila satu berkas meleset; tambahkan satu per satu.
    await Promise.all(INTI.map(u => c.add(u).catch(() => {})));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const nama = await caches.keys();
    await Promise.all(nama
      .filter(n => !n.startsWith(VERSI))
      .map(n => caches.delete(n)));
    await self.clients.claim();
  })());
});

// ---------------------------------------------------------------------
function keSupabase(url) {
  return /supabase\.(co|in)$/.test(url.hostname) ||
         url.pathname.startsWith('/rest/') ||
         url.pathname.startsWith('/auth/') ||
         url.pathname.startsWith('/storage/') ||
         url.pathname.startsWith('/realtime/');
}

function asetPihakKetiga(url) {
  return CDN_DIIZINKAN.some(d => url.origin === d);
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // 1. Data & autentikasi: selalu langsung ke jaringan.
  if (keSupabase(url)) return;

  // 2. Aset CDN berversi: cache-first.
  if (asetPihakKetiga(url)) {
    e.respondWith((async () => {
      const c = await caches.open(CACHE_ASET);
      const simpanan = await c.match(req);
      if (simpanan) return simpanan;
      try {
        const res = await fetch(req);
        if (res && (res.ok || res.type === 'opaque')) c.put(req, res.clone());
        return res;
      } catch (err) {
        return simpanan || Response.error();
      }
    })());
    return;
  }

  // 3. Berkas milik aplikasi sendiri: network-first.
  if (url.origin === self.location.origin) {
    e.respondWith((async () => {
      const c = await caches.open(CACHE_INTI);
      try {
        const res = await fetch(req);
        if (res && res.ok) c.put(req, res.clone());
        return res;
      } catch (err) {
        const simpanan = await c.match(req) || await c.match('./index.html');
        if (simpanan) return simpanan;
        return new Response(
          '<h1 style="font-family:system-ui;padding:40px">Sedang luring</h1>' +
          '<p style="font-family:system-ui;padding:0 40px">Halaman ini belum tersimpan di perangkat. ' +
          'Sambungkan internet sebentar, lalu coba lagi.</p>',
          { headers: { 'Content-Type': 'text/html; charset=utf-8' }, status: 503 });
      }
    })());
  }
});

// Memungkinkan halaman memaksa pembaruan tanpa menutup tab.
self.addEventListener('message', (e) => {
  if (e.data === 'lewati-tunggu') self.skipWaiting();
});
