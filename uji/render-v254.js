/* render-v254.js — ASATIDZ · PARA PENDIDIK (aplikasi UTUH, Supabase tiruan)
 *   RQDIR=<repo> NODE_PATH=/tmp/cdn/node_modules node uji/render-v254.js
 *   RQSHOT=<folder> → simpan tangkapan layar.  RQVIDEO=<folder> → rekam video.
 */
const H = require('./harness.js');
const { cek, semuaGalat } = H;
const fs = require('fs'), path = require('path');
const SHOT = process.env.RQSHOT || '', VIDEO = process.env.RQVIDEO || '';
const foto = async (page, nama, full = false) => { if (SHOT) { fs.mkdirSync(SHOT, { recursive: true }); await page.screenshot({ path: path.join(SHOT, nama + '.png'), fullPage: full }); } };

/* ---------- Data tiruan (nama sintetis; bentuk = keluaran RPC asli) ---------- */
const NAMA = ['Ust. Ahmad Fauzan, S.Pd.', 'Ust. Bahrul Ilmi', 'Ust. Cut Mahdi, Lc.', 'Ust. Dzikri Ramadhan', 'Ust. Faisal Akbar, M.Pd.',
  'Ust. Ghazali Umar', 'Ust. Hafidz Qurrata', 'Ust. Ikhsan Nur', 'Ust. Jamaluddin, S.H.', 'Ust. Khalid Ma\'ruf', 'Ust. Luthfi Hakim',
  'Ust. Miftahul Jannah'];
const KELAS = [['VII-D'], ['VII-E'], ['VII-F'], ['VIII-D'], ['VIII-E'], ['VIII-F'], ['IX-D', 'IX-F'], ['IX-E'], ['X-C'], ['X-D'], ['XI-C', 'XI-D'], ['XII-C', 'XII-D']];
const den = (s) => Array.from({ length: 30 }, (_, i) => Math.max(0, Math.round(Math.sin(i * .7 + s) * 6 + (i % 9 === s % 9 ? 30 : 0) + (i % 4))));
const P = (port) => `http://127.0.0.1:${port}/uji/potret/`;
function tim(port) {
  const kini = new Date().toISOString();
  const p = [
    { id: 'p-pim', nama: 'Dr. Abdul Hakim Zuhri, Lc., M.A.', role: 'Pimpinan', korps: null, kelas_binaan: [], foto: P(port) + '13.jpg', foto_kb: 39, santri: 734, denyut: Array(30).fill(0), terakhir: null },
    ...NAMA.map((n, i) => ({ id: 'g-' + i, nama: n, role: i === 3 ? 'Admin' : 'Guru', korps: 'Musyrif Asrama Putra', kelas_binaan: KELAS[i],
      foto: i === 5 || i === 9 ? null : P(port) + (i % 13) + '.jpg', foto_kb: i === 1 ? 2687 : i === 4 ? 3932 : 400, santri: 28 + i % 4 * 9,
      denyut: den(i), terakhir: i % 3 === 0 ? kini : '2026-10-10T08:00:00Z' })),
    { id: 'g-putri', nama: 'Ustz. Nurul Aini', role: 'Guru', korps: 'Musyrifah Asrama Putri', kelas_binaan: ['VII-C'], foto: P(port) + '7.jpg', foto_kb: 948, santri: 28, denyut: den(4), terakhir: kini },
    { id: 'g-bk1', nama: 'Rahmah Hayati, S.Sos.', role: 'Guru BK', korps: null, kelas_binaan: ['VII-D', 'VII-E', 'VII-F', 'VIII-D', 'VIII-E', 'VIII-F', 'IX-D', 'IX-E', 'IX-F'], foto: null, santri: 255, denyut: Array(30).fill(0), terakhir: null },
    { id: 'g-walas', nama: 'Ust. Rizal Fahmi, M.H.', role: 'Walas', korps: null, kelas_binaan: ['XI-D'], foto: null, santri: 27, denyut: Array(30).fill(0), terakhir: null }
  ].map(g => ({ aktivitas_30: g.denyut.reduce((a, b) => a + b, 0), hari_aktif_30: g.denyut.filter(Boolean).length, bulan_ini: 12, sepanjang: 200, ...g }));
  return { hari: new Date().toISOString().slice(0, 10), santri_aktif: 734, kelas_aktif: 28, pendidik: p };
}
const SANTRI = ['Ahmad Luthfi', 'Daffa Novri', 'Muhammad Alif', 'Teuku Akhdan', 'Syauqi Zawawi', 'Muhammad Zahril', 'Khairul Fuadi', 'Hammam Salim'];
function profil(id, port, boleh = true) {
  const t = tim(port).pendidik.find(g => g.id === id) || tim(port).pendidik[1];
  const bulan = new Date().toISOString().slice(0, 7), hari = new Date().toISOString().slice(0, 10);
  const kelasArr = t.role === 'Pimpinan' ? ['VII-C', 'VII-D', 'VII-E', 'VII-F', 'VIII-D', 'VIII-E', 'VIII-F', 'IX-D', 'IX-E', 'IX-F', 'X-C', 'X-D', 'XI-C', 'XI-D', 'XII-C', 'XII-D'] : t.kelas_binaan;
  const kelas = kelasArr.map((k, i) => ({ kelas: k, santri: 26 + i % 3, putri: /-C$/.test(k) && /^VII/.test(k) ? 28 : 0, bersih: 13 + i % 5, poin: 195 + i * 7, izin: 2, sakit: 4 - i % 2,
    plg: 17 + i * 2, plg_lalu: 11 + i * 3, berat: i % 4 === 0 ? 1 : 0, pbn_selesai: 6 + i, pbn_proses: i % 3 ? 11 : 0, prestasi: 3 + i % 2, prestasi_poin: 20, tahfiz: 2, halaman: 3.5 }));
  const sum = (k) => kelas.reduce((a, x) => a + Number(x[k]), 0);
  const total = Object.fromEntries(['santri', 'putri', 'bersih', 'poin', 'izin', 'sakit', 'plg', 'plg_lalu', 'berat', 'pbn_selesai', 'pbn_proses', 'prestasi', 'tahfiz', 'halaman'].map(k => [k, sum(k)]));
  const harian = Array.from({ length: 84 }, (_, i) => i < 36 ? 0 : Math.max(0, Math.round(Math.sin(i * .9) * 4 + (i % 11 === 3 ? 26 : 0) + (i % 5 === 0 ? 3 : 0))));
  const jenis = ['pelanggaran', 'izin', 'pembinaan', 'prestasi', 'tahfiz', 'laporan'];
  return {
    hari, bulan, pembanding: { dari: `${bulan.slice(0, 5)}${String(Number(bulan.slice(5)) - 1).padStart(2, '0')}-01`, sampai: `${bulan.slice(0, 5)}${String(Number(bulan.slice(5)) - 1).padStart(2, '0')}-${hari.slice(8)}` },
    boleh_nama: boleh,
    pendidik: { id: t.id, nama: t.nama, role: t.role, korps: t.korps, kelas_binaan: t.kelas_binaan, foto: t.foto },
    lingkup: { jenis: t.role === 'Pimpinan' ? 'dayah' : kelasArr.length ? 'binaan' : 'lintas', kelas: kelasArr },
    kelas, total,
    tren: [{ bulan: '2026-08', plg: 11, baik: 0, pbn: 11, pbn_selesai: 11 }, { bulan: '2026-09', plg: 29, baik: 3, pbn: 29, pbn_selesai: 22 }, { bulan: '2026-10', plg: 36, baik: 5, pbn: 36, pbn_selesai: 12 }],
    perhatian: boleh ? SANTRI.slice(0, 5).map((n, i) => ({ nisn: '2501' + i, nama: n.toUpperCase(), kelas: kelasArr[i % kelasArr.length] || 'X-D', poin: 25 - i * 3 })) : [],
    bintang: boleh ? SANTRI.slice(3, 6).map((n, i) => ({ nisn: '2502' + i, nama: n.toUpperCase(), kelas: kelasArr[0] || 'X-D', n: 3 - i })) : [],
    aktivitas: { terakhir: new Date(Date.now() - 3 * 3600e3).toISOString(), pertama: '2026-08-30T15:42:56Z', hari_aktif_bulan: 7, bulan: 42, sepanjang: 221,
      harian, per_jenis: { pelanggaran: { bulan: 36, sepanjang: 58 }, laporan: { bulan: 0, sepanjang: 98 }, pembinaan: { bulan: 4, sepanjang: 33 }, izin: { bulan: 6, sepanjang: 32 } } },
    jejak: Array.from({ length: 10 }, (_, i) => ({ jenis: jenis[i % jenis.length], waktu: new Date(Date.now() - i * 7.3 * 3600e3).toISOString(), kelas: kelasArr[i % Math.max(1, kelasArr.length)] || null,
      ringkas: boleh || ['prestasi', 'tahfiz', 'laporan'].includes(jenis[i % jenis.length]) ? ['Terlambat ke masjid', 'Keperluan keluarga', 'Teguran lisan', 'Membantu kebersihan asrama', 'Ziyadah · Al-Mulk', 'Laporan Oktober 2026'][i % 6] : null,
      nama: boleh ? SANTRI[i % SANTRI.length].toUpperCase() : null }))
  };
}

/* MOCK harness + dua RPC v2.54 (window.__TIM / __PROFIL diisi lewat init). */
const MOCK54 = H.MOCK.replace("if (nama === 'kehadiran_analisis') {", `
      if (nama === 'tim_pendidik_rpc') { if (window.__RPC54_GAGAL) return new Promise(r=>setTimeout(()=>r({data:null,error:{message:'Could not find the function public.tim_pendidik_rpc without parameters'}}),JEDA)); return new Promise(r=>setTimeout(()=>r({ data: JSON.parse(JSON.stringify(window.__TIM)), error:null }), JEDA)); }
      if (nama === 'profil_pendidik_rpc') return new Promise(r=>setTimeout(()=>r({ data: JSON.parse(JSON.stringify((window.__PROFIL||{})[arg.p_guru] || (window.__PROFIL||{})['*'])), error:null }), window.__JEDA_PROFIL || JEDA));
      if (nama === 'kehadiran_analisis') {`);
require.cache[require.resolve('./harness.js')].exports.MOCK = MOCK54;

const animJalan = () => document.getAnimations().filter(a => a.playState === 'running' && a.effect && a.effect.target
  && document.getElementById('viewRoot').contains(a.effect.target)).length;

async function buka(browser, url, port, o = {}) {
  const P = {}; tim(port).pendidik.forEach(g => { P[g.id] = profil(g.id, port, o.boleh !== false); });
  const init = (a) => { window.__TIM = a.tim; window.__PROFIL = a.profil; if (a.gagal) window.__RPC54_GAGAL = true; if (a.jeda) window.__JEDA_PROFIL = a.jeda; };
  const h = await H.bukaHalaman(browser, url, { turSudah: true, ...o, init: () => { try { localStorage.setItem('rq-singgah', 'mati'); } catch (e) {} } });
  await h.page.evaluate(init, { tim: tim(port), profil: P, gagal: !!o.gagal, jeda: o.jeda || 0 });
  await h.page.waitForFunction(() => !layarTertutup() && !(TIRAI_NY.el && !TIRAI_NY.el.classList.contains('tutup')), null, { timeout: 15000 }).catch(() => {});
  // Kabar "Lembar baru" (SweetAlert) menahan View Transition — tutup dulu, seperti pengguna menutupnya.
  await h.page.waitForTimeout(600);
  await h.page.mouse.move(o.viewport ? o.viewport.width - 40 : 900, 400);   // kursor jauh dari bilah samping (bilah melebar saat disentuh)
  await h.page.evaluate(() => { try { Swal.close(); } catch (e) {} });
  await h.page.waitForFunction(() => !document.querySelector('.swal2-container'), null, { timeout: 5000 }).catch(() => {});
  return h;
}

module.exports = { buka, tim, profil };
if (require.main === module) (async () => {
  H.server.listen(0, '127.0.0.1');
  await new Promise(r => H.server.once('listening', r));
  const port = H.server.address().port, url = `http://127.0.0.1:${port}/`;
  const browser = await H.chromium.launch({ executablePath: process.env.RQCHROME || undefined });

  /* ---- 1 · Desktop penuh: dinding, singkap, miring, buka profil ---- */
  {
    console.log('\n[Dinding desktop · Admin]');
    const vctx = VIDEO ? { recordVideo: { dir: VIDEO, size: { width: 1280, height: 820 } } } : {};
    const { ctx, page } = await buka(browser, url, port, { viewport: { width: 1280, height: 820 }, ...vctx });
    const ada = await page.evaluate(() => ({ nav: !!document.querySelector('#sidebar [data-view="asatidz"]:not(.hidden)'), versi: APP.versi }));
    cek('menu "Para Pendidik" tampil untuk Admin; versi rq-v2.54', ada.nav && ada.versi === 'rq-v2.54', ada);
    const t0 = await page.evaluate(() => { window.__t0 = performance.now(); navigateTo('asatidz'); return 0; });
    await page.waitForSelector('#asPanggung .as-wajah', { timeout: 8000 });
    await page.waitForTimeout(380);
    const pentas = await page.evaluate(() => {
      const an = document.getAnimations().filter(a => a.effect && a.effect.target && document.getElementById('viewRoot').contains(a.effect.target) && a.startTime != null);
      const mulai = Math.min(...an.map(a => a.startTime)), akhir = Math.max(...an.map(a => a.startTime + a.effect.getComputedTiming().endTime));
      return { n: an.length, ms: Math.round(akhir - mulai) };
    });
    cek('pentas dinding (tirai potret + judul) ≤ 1,6 dtk dari gerak pertama sampai terakhir', pentas.ms <= 1600, pentas);
    const tengah = await page.evaluate(() => ({ jalan: document.getAnimations().filter(a => a.playState === 'running').length,
      wajah: document.querySelectorAll('#asDinding .as-wajah').length, kk: document.querySelectorAll('#asJudul .kk').length,
      judul: document.getElementById('asJudul').textContent.replace(/\s+/g, ' ').trim(), sorot: !!document.querySelector('.as-sorot'),
      kelompok: [...document.querySelectorAll('.as-kelompok')].map(s => s.dataset.kel) }));
    cek('dinding: 16 potret (1 sorot pimpinan + 15), 5 kelompok berurutan, judul utuh dipecah per kata', tengah.wajah === 16 && tengah.sorot
      && tengah.kelompok.join() === 'pimpinan,musyrif,musyrifah,bk,walas' && tengah.judul === 'Para Pendidik' && tengah.kk === 2, tengah);
    cek('singkap sedang berjalan (animasi aktif)', tengah.jalan > 5, tengah.jalan);
    await foto(page, '01-dinding-tengah-singkap');
    await page.waitForFunction((f) => (new Function('return ' + f))()() === 0, animJalan.toString(), { timeout: 5000, polling: 30 }).catch(() => {});
    const durasi = await page.evaluate(() => Math.round(performance.now() - window.__t0));
    cek('dinding tenang ≤ 2,4 dtk sejak menu ditekan (termasuk jeda RPC 250 ms & transisi halaman)', durasi <= 2400, durasi);
    const akhir = await page.evaluate(() => ({ tahan: document.querySelectorAll('.as-tahan').length, tahanId: [...document.querySelectorAll('.as-tahan')].map(x => x.dataset.asId),
      clip: getComputedStyle(document.querySelector('.as-kisi .as-bingkai')).clipPath,
      monogram: document.querySelectorAll('.as-foto.as-tanpa').length, termuat: document.querySelectorAll('.as-foto.as-termuat').length,
      hidup: document.querySelectorAll('.as-hidup').length, catatanAdmin: !!document.getElementById('asRamping') }));
    cek('keadaan akhir: tanpa tahanan, potret utuh; foto kosong → monogram; foto tiruan termuat', akhir.tahan === 0 && (akhir.clip === 'none' || /inset\(0/.test(akhir.clip)) && akhir.monogram === 4 && akhir.termuat >= 10, akhir);
    cek('catatan Admin "Rampingkan foto" muncul (ada foto > 700 KB)', akhir.catatanAdmin, akhir);
    await foto(page, '02-dinding-akhir');
    await foto(page, '03-dinding-penuh', true);

    // Saring & cari
    await page.click('[data-as-saring="bk"]');
    const bk = await page.evaluate(() => [...document.querySelectorAll('.as-kelompok:not(.hidden)')].map(s => s.dataset.kel).join());
    await page.click('[data-as-saring="semua"]');
    await page.fill('#asCari', 'xi-d');
    await page.waitForTimeout(250);
    const cari = await page.evaluate(() => [...document.querySelectorAll('.as-wajah')].filter(w => w.offsetParent).map(w => w.dataset.asId).sort().join());
    cek('saring BK → hanya kelompok bk; cari "xi-d" → pembina XI-C/XI-D, BK? tidak, walas XI-D', bk === 'bk' && cari === 'g-10,g-walas', { bk, cari });
    await page.fill('#asCari', 'zzz'); await page.waitForTimeout(250);
    cek('pencarian kosong → pesan arahan', await page.evaluate(() => !document.getElementById('asKosong').classList.contains('hidden')));
    await page.fill('#asCari', ''); await page.waitForTimeout(250);

    // Miring mengikuti kursor
    const w = await page.$('.as-kisi .as-wajah:nth-child(3)');
    await w.scrollIntoViewIfNeeded(); await page.waitForTimeout(200);
    const kotak = await w.boundingBox();
    await page.mouse.move(kotak.x + kotak.width * .85, kotak.y + kotak.height * .2, { steps: 4 });
    await page.waitForTimeout(250);
    const miring = await page.evaluate(() => { const el = document.querySelector('.as-wajah.miring'); return el ? { rx: el.style.getPropertyValue('--rx'), ry: el.style.getPropertyValue('--ry'), filter: getComputedStyle(el.querySelector('.as-foto')).filter } : null; });
    cek('potret miring mengikuti kursor & menyala berwarna saat disentuh', miring && parseFloat(miring.ry) > 2 && parseFloat(miring.rx) > 1, miring);
    await page.waitForTimeout(500);
    await foto(page, '04-dinding-hover');

    // Buka profil: View Transition + potret bernama as-wajah
    await page.evaluate(() => { window.__vt = 0; const asli = document.startViewTransition.bind(document);
      document.startViewTransition = (x) => { window.__vt++; const v = asli(x); window.__vtNama = [...document.querySelectorAll('.as-vt')].length; return v; }; });
    await page.click('.as-kisi .as-wajah[data-as-id="g-10"]');
    await page.waitForSelector('#asProfil .as-kelas, #asProfil .as-tabel-kelas', { timeout: 8000 });
    await page.waitForFunction(() => !(TIRAI_NY.el && !TIRAI_NY.el.classList.contains('tutup')), null, { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(260);
    await foto(page, '05-profil-tengah');
    await page.waitForFunction((f) => (new Function('return ' + f))()() === 0 && document.querySelector('#asVonis .benang-u'), animJalan.toString(), { timeout: 6000, polling: 30 }).catch(() => {});
    await page.waitForTimeout(300);
    const pr = await page.evaluate(() => ({ vt: window.__vt, nama: window.__vtNama, judul: document.getElementById('pageTitle').textContent,
      vonis: document.getElementById('asVonis').textContent.replace(/\s+/g, ' ').trim(), sorot: document.querySelector('#asVonis .benang-sorot')?.textContent.replace(/\s+/g, ' ').trim(),
      u: !!document.querySelector('#asVonis .benang-u'), kelas: document.querySelectorAll('.as-kelas').length, cincin: document.querySelector('.as-cincin-angka')?.textContent,
      peta: document.querySelectorAll('.as-peta-sel > i').length, jenis: document.querySelectorAll('.as-jenis li').length, lini: document.querySelectorAll('.as-linimasa li').length,
      namaSantri: document.querySelectorAll('.as-santri').length, navAktif: !!document.querySelector('#sidebar [data-view="asatidz"].active'),
      fakta: [...document.querySelectorAll('.as-fakta dd')].map(d => d.textContent.trim()), sisaVt: document.querySelectorAll('.as-vt').length }));
    cek('klik potret → View Transition dengan satu potret bernama as-wajah', pr.vt >= 1 && pr.nama === 1, pr);
    cek('profil: vonis utuh "Kelas XI-C, XI-D: … pelanggaran …", subjek digaris benang', /^Kelas XI-C, XI-D: \d+ pelanggaran sejak 1 \w+/.test(pr.vonis) && pr.sorot === 'Kelas XI-C, XI-D' && pr.u, pr);
    cek('profil: 2 kartu kelas + cincin, peta 84 sel, rincian jenis, linimasa 10, 8 nama santri', pr.kelas === 2 && /%$/.test(pr.cincin) && pr.peta === 84 && pr.jenis === 4 && pr.lini === 10 && pr.namaSantri === 8, pr);
    cek('angka fakta final terbaca (hitung naik selesai), bilah samping tetap "Para Pendidik"', pr.fakta[1] === '7' && pr.fakta[2] === '42' && pr.navAktif, pr.fakta);
    await foto(page, '06-profil-akhir');
    await foto(page, '07-profil-penuh', true);

    // Kembali → dinding tanpa pentas ulang, potret sasaran bernama
    await page.click('[data-as-kembali]');
    await page.waitForSelector('#asPanggung', { timeout: 6000 });
    const kb = await page.evaluate(() => ({ vt: window.__vt, tahan: document.querySelectorAll('.as-tahan').length,
      sasaran: document.querySelector('.as-vt')?.closest('.as-wajah')?.dataset.asId || null }));
    cek('kembali: View Transition kedua, potret g-10 jadi sasaran, dinding tidak ditahan', kb.vt >= 2 && kb.sasaran === 'g-10' && kb.tahan === 0, kb);
    await page.waitForTimeout(900);

    // Profil pimpinan (lingkup dayah → tabel kelas)
    await page.click('.as-sorot .as-tombol');
    await page.waitForSelector('#asProfil .as-tabel-kelas', { timeout: 8000 });
    await page.waitForFunction((f) => (new Function('return ' + f))()() === 0, animJalan.toString(), { timeout: 6000, polling: 30 }).catch(() => {});
    const pim = await page.evaluate(() => ({ baris: document.querySelectorAll('.as-tk-baris:not(.as-tk-kepala)').length, vonis: document.getElementById('asVonis').textContent.replace(/\s+/g, ' ').trim() }));
    cek('profil pimpinan: "Seluruh dayah" + 16 baris kelas', pim.baris === 16 && /^Seluruh dayah:/.test(pim.vonis), pim);
    await foto(page, '08-profil-pimpinan', true);
    await ctx.close();
  }

  /* ---- 2 · HP 390 px: dinding & profil, tanpa nama (Guru lain) ---- */
  {
    console.log('\n[HP 390 · Guru tanpa hak nama]');
    const vctx = VIDEO ? { recordVideo: { dir: VIDEO, size: { width: 390, height: 844 } } } : {};
    const { ctx, page } = await buka(browser, url, port, { viewport: { width: 390, height: 844 }, mobile: true, peran: 'Guru', kelas: ['VIII-D'], boleh: false, ...vctx });
    await page.evaluate(() => navigateTo('asatidz'));
    await page.waitForSelector('#asPanggung .as-wajah', { timeout: 8000 });
    await page.waitForTimeout(1900);
    const hp = await page.evaluate(() => ({ lebar: document.documentElement.scrollWidth, kol: getComputedStyle(document.querySelector('.as-kisi')).gridTemplateColumns.split(' ').length, admin: !!document.getElementById('asRamping') }));
    cek('HP: tanpa gulir mendatar, 2 kolom potret, catatan Admin tidak tampil untuk Guru', hp.lebar <= 390 && hp.kol === 2 && !hp.admin, hp);
    await foto(page, '09-hp-dinding');
    await page.tap('.as-kisi .as-wajah[data-as-id="g-1"]');
    await page.waitForSelector('#asProfil .as-kelas', { timeout: 8000 });
    await page.waitForTimeout(1800);
    const hp2 = await page.evaluate(() => ({ lebar: document.documentElement.scrollWidth, hak: !!document.querySelector('.as-catatan-hak'), nama: document.querySelectorAll('.as-santri').length,
      lini: [...document.querySelectorAll('.as-linimasa small')].map(s => s.textContent.trim()).slice(0, 3) }));
    cek('HP profil: tanpa gulir mendatar; tanpa hak → catatan kunci, nol nama santri, linimasa hanya kelas', hp2.lebar <= 390 && hp2.hak && hp2.nama === 0 && hp2.lini.every(t => /^kelas /.test(t)), hp2);
    await foto(page, '10-hp-profil', true);
    await ctx.close();
  }

  /* ---- 3 · Kurangi gerak: tanpa animasi, data utuh ---- */
  {
    console.log('\n[Kurangi gerak]');
    const { ctx, page } = await buka(browser, url, port, { viewport: { width: 1280, height: 820 }, reduced: true });
    await page.evaluate(() => navigateTo('asatidz'));
    await page.waitForSelector('#asPanggung .as-wajah', { timeout: 8000 });
    await page.waitForTimeout(150);
    const r = await page.evaluate(() => ({ jalan: document.getAnimations().filter(a => a.playState === 'running' && document.getElementById('viewRoot').contains(a.effect?.target)).length, tahan: document.querySelectorAll('.as-tahan').length }));
    cek('kurangi gerak: nol animasi di dinding, nol tahanan', r.jalan === 0 && r.tahan === 0, r);
    await page.click('.as-kisi .as-wajah');
    await page.waitForSelector('#asProfil .as-kelas', { timeout: 8000 });
    await page.waitForTimeout(150);
    const r2 = await page.evaluate(() => ({ jalan: document.getAnimations().filter(a => a.playState === 'running' && document.getElementById('viewRoot').contains(a.effect?.target)).length,
      u: !!document.querySelector('#asVonis .benang-u'), vt: document.querySelectorAll('.as-vt').length }));
    cek('kurangi gerak: profil tanpa animasi & tanpa transisi bersama; garis benang statis tetap ada', r2.jalan === 0 && r2.u && r2.vt === 0, r2);
    await ctx.close();
  }

  /* ---- 4 · Mode hemat + RPC belum dipasang ---- */
  {
    console.log('\n[Hemat · RPC belum ada]');
    const { ctx, page } = await buka(browser, url, port, { viewport: { width: 1280, height: 820 }, hemat: true, gagal: true });
    await page.evaluate(() => navigateTo('asatidz'));
    await page.waitForSelector('#viewRoot .card-note', { timeout: 8000 });
    const t = await page.evaluate(() => document.querySelector('#viewRoot .card-note').textContent);
    cek('RPC belum ada → pesan arahan migrasi v2.54', /migrasi 20261015_v2_54_asatidz\.sql/.test(t), t.trim().slice(0, 120));
    await ctx.close();
  }

  /* ---- 5 · Profil sendiri lewat nama di bilah profil + navigasi langsung tanpa pilihan ---- */
  {
    console.log('\n[Pintasan profil sendiri]');
    const { ctx, page } = await buka(browser, url, port, { viewport: { width: 1280, height: 820 }, peran: 'Guru', kelas: ['VII-D'], korps: 'Musyrif Asrama Putra' });
    await page.evaluate(() => { AS.pilih = null; navigateTo('pendidik'); });
    await page.waitForSelector('#asPanggung', { timeout: 8000 });
    cek('"pendidik" tanpa pilihan → dinding', true);
    await page.evaluate(() => { APP.profil.id = 'g-0'; document.getElementById('pbarNama').click(); });
    await page.waitForSelector('#asProfil .as-kelas', { timeout: 8000 });
    const s = await page.evaluate(() => document.getElementById('asNamaBesar').textContent);
    cek('klik nama di bilah profil → profil sendiri', /Ahmad Fauzan/.test(s), s);
    await ctx.close();
  }

  const galat = semuaGalat.filter(g => !/favicon|ERR_|net::|Failed to load resource|\[asatidz\] \{message: Could not find/.test(g));
  cek('nol galat halaman', galat.length === 0, galat.slice(0, 5));
  H.ringkas();
  await browser.close(); H.server.close();
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
