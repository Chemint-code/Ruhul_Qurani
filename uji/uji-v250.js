/* uji-v250.js — LEMBAR BARU (poin & tahap per bulan) + rincian Tutup Buku.
 * Fungsi diambil langsung dari app.js (bukan salinan), lalu dijalankan di vm.
 * Jalankan: node uji/uji-v250.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

/** Ambil satu deklarasi `function nama(` / `async function nama(` / `const nama =` utuh. */
function ambil(nama) {
  const pola = new RegExp(`^(async\\s+)?function\\s+${nama}\\s*\\(|^const\\s+${nama}\\s*=`, 'm');
  const m = pola.exec(SRC);
  if (!m) throw new Error(`tidak ditemukan di app.js: ${nama}`);
  let i = m.index;
  if (m[0].startsWith('const')) {           // sampai titik koma di akhir baris
    const akhir = SRC.indexOf(';\n', i);
    return SRC.slice(i, akhir + 1);
  }
  let d = 0, mulai = SRC.indexOf('{', SRC.indexOf(')', i)), j = mulai;
  // lewati daftar parameter yang memuat "{" (mis. opsi = {})
  const paren = SRC.indexOf('(', i); let p = 0, k = paren;
  for (; k < SRC.length; k++) { if (SRC[k] === '(') p++; else if (SRC[k] === ')') { p--; if (!p) break; } }
  j = SRC.indexOf('{', k);
  for (; j < SRC.length; j++) {
    const c = SRC[j];
    if (c === '{') d++;
    else if (c === '}') { d--; if (!d) return SRC.slice(i, j + 1); }
  }
  throw new Error('kurung tidak seimbang: ' + nama);
}

let lulus = 0, gagal = 0;
const uji = async (judul, fn) => {
  try { await fn(); lulus++; console.log('  ✓', judul); }
  catch (e) { gagal++; console.log('  ✗', judul, '\n     ', e.message); }
};
const sama = (a, b, ket = '') => {
  const x = JSON.stringify(a), y = JSON.stringify(b);
  if (x !== y) throw new Error(`${ket} harap ${y}, dapat ${x}`);
};

function konteks(hari = '2026-10-02', detail = []) {
  const ctx = {
    console, Map, Set, Date: class extends Date {
      constructor(...a) { if (a.length) super(...a); else super(`${hari}T09:00:00+07:00`); }
      static now() { return new Date(`${hari}T09:00:00+07:00`).getTime(); }
    },
    muatDetail: async () => detail,
  };
  ctx.amanKosong = async (fn) => fn();
  vm.createContext(ctx);
  const nama = ['kunciTgl', 'tglDari', 'hariIni', 'bulanDari', 'bulanIni', 'aktifDetail', 'mundurBulan',
    'JENDELA_TAHAP_BULAN', 'LEMBAR_TAHAP_SEJAK', 'awalJendelaTahap', 'kunciLembarTahap', 'poinSantri', 'petaTahapPelanggaran',
    'nomorkanBina'];
  vm.runInContext(nama.map(ambil).join('\n') + '\n;this.__ = { ' + nama.join(', ') + ' };', ctx);
  return ctx.__;
}

(async () => {
  console.log('v2.50 · poinSantri');
  await uji('bulan berjalan → poin_bulan_ini', () => {
    const f = konteks().poinSantri;
    sama(f({ poin_bulan_ini: 15, poin_bulan: '2026-10-01', total_poin_pelanggaran: 155 }), 15);
  });
  await uji('poin_bulan bulan lalu (cache melewati tgl 1) → 0', () => {
    const f = konteks('2026-11-01').poinSantri;
    sama(f({ poin_bulan_ini: 40, poin_bulan: '2026-10-01', total_poin_pelanggaran: 200 }), 0);
  });
  await uji('kolom belum ada (DB belum dimigrasi) → jatuh ke total', () => {
    const f = konteks().poinSantri;
    sama(f({ total_poin_pelanggaran: 77 }), 77);
  });
  await uji('santri kosong → 0', () => sama(konteks().poinSantri(null), 0));

  console.log('v2.50 · tahap per lembar bulan');
  const d = (id, tgl, kat = 'Sedang', nisn = '1') => ({ id_log: id, tanggal: tgl, kategori: kat, nisn, status: 'Active' });
  await uji('Oktober mulai dari ke-1 walau ada catatan September', async () => {
    const F = konteks('2026-10-20', [d('a', '2026-09-10'), d('b', '2026-09-20'), d('c', '2026-10-01'), d('e', '2026-10-05')]);
    const p = await F.petaTahapPelanggaran();
    sama([p.get('a').n, p.get('b').n, p.get('c').n, p.get('e').n], [1, 2, 1, 2]);
  });
  await uji('November kembali ke-1', async () => {
    const F = konteks('2026-11-20', [d('c', '2026-10-01'), d('e', '2026-10-05'), d('f', '2026-11-02')]);
    const p = await F.petaTahapPelanggaran();
    sama(p.get('f').n, 1);
    sama(p.get('f').nSeumur, 3, 'nSeumur');
  });
  await uji('sebelum Oktober 2026 tetap jendela 6 bulan (nomor lama tidak bergeser)', async () => {
    const F = konteks('2026-10-20', [d('x', '2026-08-30'), d('y', '2026-09-02')]);
    const p = await F.petaTahapPelanggaran();
    sama([p.get('x').n, p.get('y').n], [1, 2]);
  });
  await uji('kategori dihitung terpisah', async () => {
    const F = konteks('2026-10-20', [d('r1', '2026-10-01', 'Ringan'), d('s1', '2026-10-02', 'Sedang'), d('r2', '2026-10-03', 'Ringan')]);
    const p = await F.petaTahapPelanggaran();
    sama([p.get('r1').n, p.get('s1').n, p.get('r2').n], [1, 1, 2]);
  });
  await uji('awalJendelaTahap: Okt → tgl 1 bulan itu; Sep → mundur 6 bulan', () => {
    const F = konteks();
    sama(F.awalJendelaTahap('2026-10-17'), '2026-10-01');
    sama(F.awalJendelaTahap('2026-09-17'), '2026-03-17');
  });
  await uji('pembinaan manual (tanpa id_log) dinomori per bulan', () => {
    const F = konteks('2026-11-10');
    const rows = [
      { nisn: '1', kategori_bina: 'Sedang', tanggal_pembinaan: '2026-10-03', id_pembinaan: 'p1' },
      { nisn: '1', kategori_bina: 'Sedang', tanggal_pembinaan: '2026-10-09', id_pembinaan: 'p2' },
      { nisn: '1', kategori_bina: 'Sedang', tanggal_pembinaan: '2026-11-02', id_pembinaan: 'p3' }];
    F.nomorkanBina(rows, new Map());
    sama(rows.map(r => r.tahap_hitung), [1, 2, 1]);
  });

  console.log('v2.50 · titik sambung di app.js');
  await uji('tidak ada lagi pemakaian total_poin_pelanggaran sebagai "poin santri" di tabel/monster/ambang', () => {
    const sisa = SRC.split('\n').map((l, i) => [i + 1, l])
      .filter(([, l]) => /total_poin_pelanggaran/.test(l) && !/^\s*(\*|\/\/)/.test(l))
      .filter(([, l]) => !/v2\.50-total|poinSantri|Seluruh Riwayat|seluruh riwayat|poin_bulan|function poinSantri|total_poin_pelanggaran: s \?|s\.total_poin_pelanggaran = poin;|data\.periodeAktif|aktif \? \(data\.poinPeriode/.test(l));
    if (sisa.length) throw new Error('masih ada: ' + sisa.map(([n, l]) => `${n}: ${l.trim().slice(0, 90)}`).join(' | '));
  });
  await uji('Tutup Buku: baris rekap punya tombol Detail ke lembar bulan', () => {
    const f = ambil('tbGambarRekap');
    if (!/data-tb-detail=/.test(f)) throw new Error('tombol data-tb-detail tidak ada di tbGambarRekap');
    const v = ambil('viewTutupBuku');
    if (!/tbDetail\(/.test(v)) throw new Error('klik Detail tidak ditangani di viewTutupBuku');
  });
  await uji('bukaDetailSantri: bawaan lembar bulan berjalan + pita arsip', () => {
    const f = ambil('bukaDetailSantri');
    if (!/bulanIni\(\)\)\)/.test(f.split('\n').find(l => /const lembar =/.test(l)) || '')) throw new Error('lembar bawaan bukan bulanIni()');
    if (!/opsi\.arsip/.test(f)) throw new Error('pita arsip (opsi.arsip) belum ada');
  });

  console.log(`\n${lulus} lulus, ${gagal} gagal`);
  process.exit(gagal ? 1 : 0);
})();
