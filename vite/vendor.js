/* chemint · vite/vendor.js — titik masuk modul hasil build Vite (v2.60).
 *
 * Menggantikan tag CDN supabase-js & sweetalert2 di index.html: pustaka kini
 * tersaji dari github.io sendiri (versi dikunci package-lock.json), ikut cache
 * inti service worker, dan tidak lagi bergantung pada jsdelivr.
 *
 * Pustaka grafik TIDAK ikut di sini. app.js memintanya lewat muatPustaka()
 * saat halaman bergrafik dibuka; Vite memecahnya menjadi potongan terpisah
 * di folder pustaka/ (dynamic import).
 *
 * Modul dijalankan sesudah HTML selesai diurai dan SEBELUM app.js (defer),
 * jadi window.supabase & window.Swal sudah ada saat app.js berjalan. */
import { createClient } from '@supabase/supabase-js';
import Swal from 'sweetalert2';

window.supabase = { createClient };
window.Swal = Swal;

window.RQPustaka = {
  chart:   () => import('chart.js/auto').then((m) => m.default),
  echarts: () => import('./echarts-chemint.js').then((m) => m.echarts)
};
