#!/usr/bin/env node
/* alat/periksa-teks-v283.cjs — chemint v2.83 · penjaga teks penjelasan
 *
 *   node alat/periksa-teks-v283.cjs          → daftar sisa + keluar 1 bila ada yang belum diputuskan
 *   node alat/periksa-teks-v283.cjs --json   → keluaran mesin (dipakai uji-v283 bagian E)
 *
 * Aturan (rancangan v2.83 §5.5): subjudul & paragraf yang MENERANGKAN cara kerja fitur dihapus;
 * validasi/galat, judul keadaan kosong, subjudul berisi DATA, title/aria-label, dan scroll-hint tetap.
 * Yang tetap dicatat di TETAP (berkas → potongan awal teks), supaya teks penjelas baru tidak
 * menyusup diam-diam: setiap teks baru di kelas-kelas ini harus diputuskan dulu di sini.
 */
'use strict';
const fs = require('fs'), path = require('path');
const AKAR = path.resolve(__dirname, '..');
const BERKAS = ['app.js', 'sidang.js', 'mentor.js', 'sarpras.js', 'penempatan.js', 'meja.js', 'index.html'];
const KELAS = /class="(sub|hint|sd-kecil|lab-sub|brk-sub|sk-sub|sp-sub|bk-sub|as-lede|sp-hero-ket|sp-lembar-sub)"[^>]*>([^<]*)/g;
/* kosong(judul, 'deskripsi …') — deskripsi literal lebih dari 8 kata dianggap penjelas */
const KOSONG = /kosong\(\s*(['`])((?:\\.|(?!\1).)*)\1\s*,\s*(['`])((?:\\.|(?!\3).)*)\3/g;

/* Teks yang DIPERTAHANKAN (bukan penjelas): berkas → awal teks (cukup potongan unik). */
const TETAP = require('./periksa-teks-v283-tetap.json');

const kata = (t) => t.replace(/\$\{[^}]*\}/g, ' x ').trim().split(/\s+/).filter(Boolean).length;
function pindai() {
  const sisa = [];
  for (const f of BERKAS) {
    const p = path.join(AKAR, f); if (!fs.existsSync(p)) continue;
    const s = fs.readFileSync(p, 'utf8');
    const baris = (i) => s.slice(0, i).split('\n').length;
    const tetap = TETAP[f] || [];
    const dipertahankan = (t) => tetap.some(x => t.trim().startsWith(x));
    for (const m of s.matchAll(KELAS)) {
      const teks = m[2].trim();
      if (!teks || /^\$\{[^}]*\}$/.test(teks)) continue;   // isi dinamis murni (data)
      if (dipertahankan(teks)) continue;
      sisa.push({ berkas: f, baris: baris(m.index), kelas: m[1], teks: teks.slice(0, 140) });
    }
    for (const m of s.matchAll(KOSONG)) {
      const teks = m[4].trim();
      if (kata(teks) <= 8 || dipertahankan(teks)) continue;
      sisa.push({ berkas: f, baris: baris(m.index), kelas: 'kosong()', teks: teks.slice(0, 140) });
    }
  }
  return sisa;
}
if (require.main === module) {
  const sisa = pindai();
  if (process.argv.includes('--json')) { process.stdout.write(JSON.stringify(sisa)); }
  else {
    sisa.forEach(x => console.log(`${x.berkas}:${x.baris}  [${x.kelas}]  ${x.teks}`));
    console.log(`\n${sisa.length} teks penjelas belum diputuskan`);
  }
  process.exit(sisa.length ? 1 : 0);
}
module.exports = { pindai };
