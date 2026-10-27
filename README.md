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

## Gaya & ikon (v2.62)
- Seluruh gaya ada di `gaya.css` (dulu 21 blok `<style>` di `index.html`; urutan kaskade sama persis).
- Ikon Font Awesome swa-saji, hanya yang dipakai: `ikon/`. Setiap menambah ikon baru:

```bash
npm i --no-save @fortawesome/fontawesome-free@6.5.1 && pip install fonttools brotli
python3 alat/subset-ikon.py
node uji/uji-v262.cjs   # A4 gagal bila ada ikon yang belum masuk subset
```

