# Ruhul_Qurani
Sistem Web Musyrif

## Bangun & terbit (v2.60)
Berkas di akar repo adalah **sumber** dan tetap bisa dibuka apa adanya.
Situs yang tayang dibangun Vite lewat GitHub Actions (`.github/workflows/terbit.yml`):

```bash
npm ci
npm run bangun       # → dist/  (yang diterbitkan)
npm run bangun:uji   # → dist-uji/ (Supabase tiruan)
node uji/uji-v261.cjs
```

Setiap rilis tetap wajib menaikkan `VERSI` di `sw.js`.
