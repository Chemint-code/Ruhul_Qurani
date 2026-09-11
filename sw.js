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

   ---------------------------------------------------------------------
   CATATAN v2.10 — mengapa pembaruan dulu bisa tidak sampai

   Network-first saja ternyata belum cukup. Ada DUA celah yang membuat
   pengguna tetap membuka versi lama meski berkas di server sudah baru:

     1. Singgahan HTTP peramban. `fetch(req)` biasa masih boleh dilayani
        dari cache peramban sendiri — lapisan yang berada di BAWAH
        service worker dan tidak terlihat olehnya. Kalau server memasang
        `Cache-Control: max-age`, app.js lama bisa terus disajikan
        berhari-hari padahal service worker merasa sudah "ambil dari
        jaringan". Perbaikannya: berkas inti diambil dengan
        `cache: 'reload'`, yang memaksa lewat singgahan HTTP.

     2. Tab yang sedang terbuka. `skipWaiting()` + `clients.claim()`
        membuat service worker baru langsung berkuasa, TETAPI halaman
        yang sudah terbuka tetap menjalankan app.js lama sampai dimuat
        ulang. Musyrif yang membiarkan tab terbuka seharian tidak pernah
        tahu ada pembaruan. Perbaikannya: setelah aktif, service worker
        MEMBERI TAHU semua halaman, dan app.js menawarkan tombol
        "Muat Ulang" — bukan memuat ulang sendiri, supaya isian yang
        belum tersimpan tidak hilang begitu saja.

   CARA MENERBITKAN VERSI BARU
   Cukup ubah satu baris: naikkan nilai VERSI di bawah. Peramban selalu
   memeriksa sw.js dengan melewati singgahan HTTP, jadi perubahan satu
   karakter pun sudah memicu seluruh rangkaian: pasang ulang berkas inti,
   hapus singgahan versi lama, lalu beri tahu halaman yang terbuka.
   ===================================================================== */

const VERSI       = 'rq-v2.12.1';
const CACHE_INTI  = `${VERSI}-inti`;
const CACHE_ASET  = `${VERSI}-aset`;

const INTI = [
  './',
  './index.html',
  './app.js',
  './manifest.webmanifest'
];

/* Berkas yang TIDAK BOLEH dilayani singgahan HTTP peramban. Inilah
   berkas yang berubah setiap kali aplikasi diperbarui; sisanya (gambar
   lambang, ikon) boleh memakai jalur biasa supaya tetap hemat kuota. */
const POLA_INTI = /(?:^\/?$|\/$|index\.html$|app\.js$|manifest\.webmanifest$)/i;

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
    // `cache: 'reload'` memaksa lewat singgahan HTTP peramban — tanpa ini,
    // versi baru bisa "terpasang" tetapi isinya masih berkas lama.
    await Promise.all(INTI.map(async (u) => {
      try {
        const res = await fetch(new Request(u, { cache: 'reload' }));
        if (res && res.ok) await c.put(u, res);
      } catch (err) { /* satu berkas meleset tidak boleh menggagalkan sisanya */ }
    }));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    // Percepat navigasi pertama setelah aktif, bila peramban mendukung.
    if (self.registration.navigationPreload) {
      try { await self.registration.navigationPreload.enable(); } catch (err) {}
    }

    const nama = await caches.keys();
    await Promise.all(nama
      .filter(n => !n.startsWith(VERSI))
      .map(n => caches.delete(n)));
    await self.clients.claim();

    // Beri tahu setiap tab yang sedang terbuka bahwa ada versi baru.
    // Keputusan memuat ulang diserahkan kepada app.js — service worker
    // tidak boleh membuang isian yang belum tersimpan.
    const klien = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    klien.forEach(k => { try { k.postMessage({ tipe: 'versi-baru', versi: VERSI }); } catch (err) {} });
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

/** Berkas kerangka aplikasi yang wajib selalu segar. */
function berkasInti(req, url) {
  return req.mode === 'navigate' || POLA_INTI.test(url.pathname);
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
      const inti = berkasInti(req, url);
      try {
        // Hasil navigation preload dipakai bila sudah tersedia.
        const awal = e.preloadResponse ? await e.preloadResponse : null;
        // Berkas inti diambil dengan melewati singgahan HTTP peramban;
        // aset lain memakai jalur biasa agar tetap hemat kuota.
        const res = awal || await fetch(inti ? new Request(req, { cache: 'reload' }) : req);
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

// ---------------------------------------------------------------------
// Saluran pesan dari halaman.
self.addEventListener('message', (e) => {
  const pesan = e.data;

  // Memungkinkan halaman memaksa pembaruan tanpa menutup tab.
  if (pesan === 'lewati-tunggu' || pesan?.tipe === 'lewati-tunggu') {
    self.skipWaiting();
    return;
  }

  // Halaman menanyakan versi yang sedang melayani — dipakai app.js untuk
  // menampilkan nomor versi pada panel diagnosa.
  if (pesan?.tipe === 'tanya-versi') {
    try { e.source?.postMessage({ tipe: 'versi', versi: VERSI }); } catch (err) {}
    return;
  }

  // Buang seluruh singgahan lalu pasang ulang berkas inti. Jalan keluar
  // terakhir bila satu perangkat benar-benar tersangkut di versi lama.
  if (pesan?.tipe === 'bersihkan-singgahan') {
    e.waitUntil((async () => {
      const nama = await caches.keys();
      await Promise.all(nama.map(n => caches.delete(n)));
      const c = await caches.open(CACHE_INTI);
      await Promise.all(INTI.map(async (u) => {
        try {
          const res = await fetch(new Request(u, { cache: 'reload' }));
          if (res && res.ok) await c.put(u, res);
        } catch (err) {}
      }));
      try { e.source?.postMessage({ tipe: 'singgahan-bersih', versi: VERSI }); } catch (err) {}
    })());
  }
});
