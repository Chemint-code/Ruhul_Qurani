-- ROLLBACK v2.55 Kabar Wali — menghapus dua fungsi dan tabel baru beserta isinya
-- (jejak "wali sudah dikabari"). Data lain tidak tersentuh.
-- app.js v2.55 tetap berjalan tanpa keduanya: butir wali hanya tidak berkurang.
drop function if exists public.kabar_wali_tercatat(date);
drop function if exists public.catat_kabar_wali(text, text);
drop table if exists public.kabar_wali_log;
