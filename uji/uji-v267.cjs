/* uji-v267.cjs — v2.67 PETA AMANAH (navigasi berbasis tugas)
 *
 *   npm run bangun:uji && node uji/uji-v267.cjs
 *   (RQ_POTRET=1 → tangkapan layar ke uji/keluaran/)
 *
 * A · berkas: VERSI, susunan menu, nama tunggal, ikon subset.
 * B · aplikasi utuh (sumber & build, Supabase tiruan):
 *     menu per peran, nama = judul = tab, jejak kelompok, riwayat #alamat &
 *     tombol Kembali (halaman, laci, Lentera, dialog), tautan langsung,
 *     Lentera (halaman, santri, perintah, papan ketik), Catat desktop,
 *     laci Akun, Denyut, saringan seperlunya, sematkan bilah sisi,
 *     kelompok diingat, bilah bawah tetap per peran, Laci Amanah,
 *     tipe View Transition naik/turun/balik.
 */
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const { masuk, layani, AKAR, KELUAR } = require('./potret-v267.cjs');
const POTRET = process.env.RQ_POTRET === '1';

let lulus = 0, gagal = 0;
const cek = (j, ok, info) => { ok ? lulus++ : gagal++; console.log(`${ok ? '  ok  ' : ' GAGAL'} ${j}${!ok && info !== undefined ? '  · ' + JSON.stringify(info) : ''}`); };
const baca = (...p) => fs.readFileSync(path.join(AKAR, ...p), 'utf8');
const potret = async (p, n) => { if (POTRET) await p.screenshot({ path: path.join(KELUAR, n + '.png') }); };
const tunggu = (p, fn, arg, ms = 15000) => p.waitForFunction(fn, arg, { timeout: ms });
const keHal = async (p, v) => { await p.evaluate((x) => navigateTo(x), v); await tunggu(p, (x) => APP.view === x && !APP.navSibuk, v); await p.waitForTimeout(150); };
const tabBawah = (p) => p.evaluate(() => [...document.querySelectorAll('#tabBar > .tab')].filter(t => t.getClientRects().length).map(t => t.id || t.dataset.view));

(async () => {
  console.log('\nA · Berkas');
  cek('A1 sw.js: VERSI rq-v2.67', /VERSI\s+=\s+'rq-v2\.(6[7-9]|[7-9]\d)(\.\d+)?'/.test(baca('sw.js')));
  const ih = baca('index.html');
  const grup = [...ih.matchAll(/data-grup="([a-z]+)"/g)].map(m => m[1]);
  cek('A2 index.html: kelompok berbasis tugas, berurutan', JSON.stringify(grup) === JSON.stringify(['beranda', 'catat', 'tindak', 'santri', 'laporan', 'pedoman', 'kelola']), grup);
  const nav = ih.slice(ih.indexOf('id="navMenu"'), ih.indexOf('</nav>', ih.indexOf('id="navMenu"')));
  const views = [...nav.matchAll(/data-view="([a-z]+)"/g)].map(m => m[1]);
  cek('A3 setiap halaman tepat satu kali di menu (tanpa "Unit Operasional"/"Sistem")', new Set(views).size === views.length && views.length === 27 + (views.includes('banding') ? 1 : 0) + (views.includes('kelalaian') ? 1 : 0) && !/Unit Operasional|>Sistem</.test(nav), views.length);   // v2.68: + Eksekusi Banding · v2.69: + Kelalaian Pengesahan
  const ikon = JSON.parse(baca('ikon', 'daftar.json'));
  cek('A4 ikon baru masuk subset (fa-house, fa-thumbtack)', ikon.ikon.includes('fa-house') && ikon.ikon.includes('fa-thumbtack') && !ikon.tak_dikenal.length);
  const app = baca('app.js');
  cek('A5 app.js: pembungkus, bukan penimpaan (navigateTo/rapikanGrupNav dibungkus)', /const asli = navigateTo;/.test(app.slice(app.indexOf('v2.67 — PETA AMANAH'))) && /const asli = rapikanGrupNav;/.test(app.slice(app.indexOf('v2.67 — PETA AMANAH'))));
  cek('A6 tanpa perubahan database (tidak ada db.rpc/insert baru di v2.67)', !/db\.(rpc|from)\(/.test(app.slice(app.indexOf('v2.67 — PETA AMANAH'), app.indexOf('v2.68 — ANTREAN PANGGIL') > 0 ? app.indexOf('v2.68 — ANTREAN PANGGIL') : undefined)));

  const s1 = await layani(AKAR), s2 = await layani(path.join(AKAR, 'dist-uji'));
  const URL_ = { sumber: `http://127.0.0.1:${s1.address().port}/`, build: `http://127.0.0.1:${s2.address().port}/` };
  const browser = await chromium.launch();

  for (const v of ['sumber', 'build']) {
    console.log(`\nB · ${v}`);
    { // ------------------------- Guru · desktop 1366 -------------------------
      const s = await masuk(browser, URL_[v], { peran: 'Guru', kelas: ['VIII-D'] }), p = s.page;
      const m = await p.evaluate(() => ({
        grup: [...document.querySelectorAll('#navMenu .nav-grup:not(.hidden)')].map(g => [g.dataset.grup, g.open, g.classList.contains('tunggal')]),
        datar: document.getElementById('navMenu').classList.contains('nav-datar'),
        hash: location.hash
      }));
      cek(`B1 ${v}: Guru — Beranda tunggal, Catat/Tindak Lanjut terbuka, Pedoman tunggal tampil, tanpa Pengelolaan`,
        JSON.stringify(m.grup) === JSON.stringify([['beranda', true, true], ['catat', true, false], ['tindak', true, false], ['santri', false, false], ['laporan', false, false], ['pedoman', true, true]]) && !m.datar, m.grup);
      cek(`B2 ${v}: halaman awal tercatat di alamat (#dashboard)`, m.hash === '#dashboard', m.hash);

      // Nama tunggal: label menu = judul halaman; eyebrow = kelompok
      const beda = [];
      for (const view of ['pengasuhan', 'pembinaan', 'siswa', 'analisis', 'master', 'pesan']) {
        await keHal(p, view);
        const r = await p.evaluate((x) => ({ menu: document.querySelector(`#navMenu [data-view="${x}"]`).firstChild.nextSibling.textContent.trim(),
          judul: document.getElementById('pageTitle').textContent.trim(), lat: document.querySelector('#pageEyebrow .lat').textContent.trim(), grup: (PA.GRUP.find(g => g.views.includes(x)) || {}).label }), view);
        if (r.menu !== r.judul || r.lat !== r.grup) beda.push([view, r]);
      }
      cek(`B3 ${v}: nama menu = judul halaman, eyebrow = nama kelompok`, !beda.length, beda);

      // Riwayat & tombol Kembali
      await keHal(p, 'dashboard'); await keHal(p, 'pembinaan'); await keHal(p, 'analisis');
      cek(`B4 ${v}: alamat mengikuti halaman (#analisis)`, await p.evaluate(() => location.hash === '#analisis' && history.state && history.state.rq === 'analisis'));
      await p.evaluate(() => history.back()); await tunggu(p, () => APP.view === 'pembinaan' && !APP.navSibuk);
      cek(`B5 ${v}: Kembali → halaman sebelumnya (Pembinaan)`, await p.evaluate(() => location.hash === '#pembinaan'));
      await p.evaluate(() => history.back()); await tunggu(p, () => APP.view === 'dashboard' && !APP.navSibuk);
      await p.evaluate(() => history.forward()); await tunggu(p, () => APP.view === 'pembinaan' && !APP.navSibuk);
      cek(`B6 ${v}: Maju juga bekerja`, true);

      // Jejak saudara
      await p.click('#pageEyebrow'); await p.waitForSelector('#jejakPop.buka');
      const jp = await p.evaluate(() => [...document.querySelectorAll('#jejakPop [data-jejak]')].map(b => [b.dataset.jejak, b.classList.contains('kini')]));
      cek(`B7 ${v}: jejak Tindak Lanjut berisi saudara yang boleh dibuka, halaman ini ditandai`, JSON.stringify(jp) === JSON.stringify([['pembinaan', true], ['pesan', false], ['sidang', false]]), jp);
      await potret(p, `v267-jejak-${v}`);
      await p.click('#jejakPop [data-jejak="pesan"]'); await tunggu(p, () => APP.view === 'pesan' && !APP.navSibuk);
      cek(`B8 ${v}: memilih saudara → pindah, popover tertutup`, await p.evaluate(() => !document.getElementById('jejakPop')));

      // Lentera — halaman
      await keHal(p, 'dashboard');
      await p.keyboard.press('Control+k'); await p.waitForSelector('#lentera.buka');
      cek(`B9 ${v}: Ctrl+K membuka Lentera, fokus di kotak masukan, entri riwayat lapisan`, await p.evaluate(() => document.activeElement.id === 'ltMasuk' && history.state && history.state.lapis === 'lentera'));
      const kosong = await p.evaluate(() => [...document.querySelectorAll('#ltDaftar .lt-judul')].map(x => x.textContent));
      cek(`B10 ${v}: Lentera kosong menawarkan kerja cepat & baru dibuka`, kosong[0] === 'Kerja cepat' && kosong.includes('Baru dibuka'), kosong);
      await p.keyboard.type('rekap'); await p.waitForTimeout(400);
      const hr = await p.evaluate(() => [...document.querySelectorAll('#ltDaftar .lt-item')].map(b => b.querySelector('b').textContent));
      cek(`B11 ${v}: "rekap" → Rekap Pembinaan teratas; Rekap Pelanggaran (Admin) tidak muncul untuk Guru`, hr[0] === 'Rekap Pembinaan' && !hr.includes('Rekap Pelanggaran'), hr);
      await potret(p, `v267-lentera-${v}`);
      await p.keyboard.press('Enter'); await tunggu(p, () => APP.view === 'rekapbina' && !APP.navSibuk);
      await p.waitForTimeout(200);
      cek(`B12 ${v}: Enter → membuka halaman, Lentera tertutup, entri lapisan diganti alamat baru`, await p.evaluate(() => document.getElementById('lentera').hidden && location.hash === '#rekapbina' && !(history.state || {}).lapis));
      await p.evaluate(() => history.back()); await tunggu(p, () => APP.view === 'dashboard' && !APP.navSibuk);
      cek(`B13 ${v}: Kembali sesudah Lentera → halaman sebelum Lentera (Ringkasan)`, true);

      // Lentera — santri (pencarian ditiru)
      await p.evaluate(() => { window.__detail = []; cariSantriRingkas = async () => [{ nisn: '24000008', nama_siswa: 'Santri 8', kelas: 'VIII-D', jenjang: 'MTs' }];
        bukaDetailSantri = async (n) => { window.__detail.push(n); }; });
      await p.keyboard.press('/'); await p.waitForSelector('#lentera.buka');
      await p.keyboard.type('2400'); await tunggu(p, () => document.querySelector('#ltDaftar .lt-huruf'));
      const sj = await p.evaluate(() => [...document.querySelectorAll('#ltDaftar .lt-judul')].map(x => x.textContent));
      cek(`B14 ${v}: "/" membuka Lentera; NISN → bagian Santri lebih dulu`, sj[0] === 'Santri', sj);
      await p.keyboard.press('Enter'); await tunggu(p, () => window.__detail.length === 1);
      await p.waitForTimeout(300);
      cek(`B15 ${v}: Enter pada santri → rincian santri dibuka sesudah entri Lentera dibuang`, await p.evaluate(() => window.__detail[0] === '24000008' && document.getElementById('lentera').hidden && !(history.state || {}).lapis && APP.view === 'dashboard'));
      // tombol Kembali saat Lentera terbuka → tutup Lentera, halaman tetap
      await p.keyboard.press('Control+k'); await p.waitForSelector('#lentera.buka');
      await p.evaluate(() => history.back()); await tunggu(p, () => document.getElementById('lentera').hidden);
      await p.waitForTimeout(200);
      cek(`B16 ${v}: Kembali saat Lentera terbuka → Lentera tertutup, halaman tetap`, await p.evaluate(() => APP.view === 'dashboard' && location.hash === '#dashboard'));

      // Catat desktop + pintasan C
      cek(`B17 ${v}: tombol Catat bilah atas tampil untuk Guru`, await p.evaluate(() => !!document.getElementById('btnCatatAtas').getClientRects().length));
      await p.keyboard.press('c'); await p.waitForSelector('.swal2-popup', { timeout: 15000 });
      cek(`B18 ${v}: tombol C membuka formulir catat pelanggaran`, await p.evaluate(() => /pelanggaran/i.test(document.querySelector('.swal2-popup').textContent)));
      await p.evaluate(() => history.back()); await tunggu(p, () => !Swal.isVisible());
      cek(`B19 ${v}: Kembali saat formulir terbuka → formulir tertutup, halaman tetap`, await p.evaluate(() => APP.view === 'dashboard'));

      // Laci Akun
      await p.click('#btnAkun'); await p.waitForSelector('#akunLaci.tampil');
      const ak = await p.evaluate(() => [...document.querySelectorAll('#akunLaci > .pbar-btn')].filter(b => b.getClientRects().length).map(b => b.id));
      cek(`B20 ${v}: laci Akun berisi Identitas, Tampilan, Bantuan, Segarkan, Keluar (urut)`, JSON.stringify(ak) === JSON.stringify(['pbarBtnStudio', 'btnEfek', 'btnBantuan', 'btnSegarkan', 'btnAkunKeluar']), ak);
      await potret(p, `v267-akun-${v}`);
      await p.keyboard.press('Escape');
      cek(`B21 ${v}: Esc menutup laci Akun`, await p.evaluate(() => document.getElementById('akunLaci').hidden));

      // Denyut
      const d0 = await p.evaluate(() => document.getElementById('denyut').dataset.keadaan);
      await p.evaluate(() => { document.getElementById('antreText').textContent = '3'; document.getElementById('antreBadge').classList.add('on'); });
      await p.waitForTimeout(100);
      const d1 = await p.evaluate(() => [document.getElementById('denyut').dataset.keadaan, document.getElementById('denyutTeks').textContent]);
      await p.evaluate(() => document.getElementById('luringBadge').classList.add('on')); await p.waitForTimeout(100);
      const d2 = await p.evaluate(() => document.getElementById('denyut').dataset.keadaan);
      await p.evaluate(() => { document.getElementById('luringBadge').classList.remove('on'); document.getElementById('antreBadge').classList.remove('on'); });
      cek(`B22 ${v}: Denyut — satu titik: tersambung → antre (3 menunggu) → luring`, ['langsung', 'tenang'].includes(d0) && d1[0] === 'antre' && d1[1] === '3 menunggu' && d2 === 'luring', [d0, d1, d2]);

      // Saringan seperlunya
      const sar = async () => p.evaluate(() => !!document.getElementById('periodeBox').getClientRects().length);
      const sDash = await sar(); await keHal(p, 'asatidz'); const sAs = await sar();
      cek(`B23 ${v}: saringan tampil di Ringkasan, disembunyikan di Para Pendidik`, sDash && !sAs, [sDash, sAs]);

      // Sematkan
      const sm = await p.evaluate(() => ({ t: document.getElementById('sidebar').classList.contains('tersemat'), ml: getComputedStyle(document.querySelector('.main')).marginLeft }));
      await p.evaluate(() => document.getElementById('btnSemat').click()); await p.waitForTimeout(450);
      const sm2 = await p.evaluate(() => ({ t: document.getElementById('sidebar').classList.contains('tersemat'), ml: getComputedStyle(document.querySelector('.main')).marginLeft, ls: localStorage.getItem('rq.sisi.v1') }));
      cek(`B24 ${v}: 1366 px → bilah sisi tersemat (isi bergeser 266 px); lepas → rel 70 px, diingat`, sm.t && sm.ml === '266px' && !sm2.t && sm2.ml === '70px' && sm2.ls === 'lepas', [sm, sm2]);

      // Kelompok diingat
      await p.evaluate(() => { const g = document.querySelector('#navMenu [data-grup="catat"]'); g.open = false; });
      await p.waitForTimeout(100);
      cek(`B25 ${v}: kelompok yang ditutup diingat per akun`, await p.evaluate(() => !JSON.parse(localStorage.getItem('rq.grup.v1.u-admin')).includes('catat')));

      // Lentera di langit; turun ke bilah atas saat langit tergulir lewat
      await keHal(p, 'rekapbina');
      const l0 = await p.evaluate(() => ({ langit: !!document.getElementById('btnLenteraLangit').getClientRects().length, atas: getComputedStyle(document.getElementById('btnLentera')).visibility }));
      await p.evaluate(() => { document.querySelector('.main').style.minHeight = '3000px'; window.scrollTo(0, 600); }); await p.waitForTimeout(500);
      const l1 = await p.evaluate(() => ({ lewat: document.querySelector('.topbar').classList.contains('langit-lewat'), atas: getComputedStyle(document.getElementById('btnLentera')).visibility }));
      await p.evaluate(() => { window.scrollTo(0, 0); document.querySelector('.main').style.minHeight = ''; });
      cek(`B25b ${v}: kotak cari di langit; lentera kecil muncul di bilah atas hanya saat langit tergulir lewat`, l0.langit && l0.atas === 'hidden' && l1.lewat && l1.atas === 'visible', [l0, l1]);
      cek(`B26 ${v}: tanpa galat halaman`, s.galat.length === 0, s.galat.slice(0, 4));
      await s.ctx.close();
    }
    { // ------------------------- Tautan langsung -------------------------
      const s = await masuk(browser, URL_[v], { peran: 'Guru', kelas: ['VIII-D'], hash: '#perizinan' });
      cek(`B27 ${v}: tautan #perizinan → langsung ke Perizinan sesudah masuk`, await s.page.evaluate(() => APP.view === 'perizinan' && location.hash === '#perizinan'));
      await s.ctx.close();
      const t = await masuk(browser, URL_[v], { peran: 'Guru', kelas: ['VIII-D'], hash: '#pengguna' });
      cek(`B28 ${v}: tautan ke halaman tanpa hak → halaman awal peran`, await t.page.evaluate(() => APP.view === 'dashboard' && location.hash === '#dashboard'));
      await t.ctx.close();
    }
    { // ------------------------- Gerak: tipe View Transition -------------------------
      const s = await masuk(browser, URL_[v], { peran: 'Admin', super: true, gerak: true }), p = s.page;
      await p.evaluate(() => { try { terapkanHemat(false); } catch (e) {} document.documentElement.classList.remove('hemat'); MULUS.kurangGerak = false; });
      const tipe = async (x) => p.evaluate(async (x) => { const j = navigateTo(x); const t = VT.jalan ? [...VT.jalan.types] : null; await j; await new Promise(r => setTimeout(r, 450)); return t; }, x);
      const t1 = await tipe('rekapbina');   // Beranda → Laporan: naik
      const t2 = await tipe('analisis');    // Laporan → Laporan: geser (urutan menu)
      const t3 = await tipe('pembinaan');   // Laporan → Tindak Lanjut: turun
      const t4 = await p.evaluate(async () => { window.__abaikan = PA.abaikanPop; history.back(); await new Promise(r => setTimeout(r, 60)); const t = VT.jalan ? [...VT.jalan.types] : null; await new Promise(r => setTimeout(r, 600)); return [t, APP.view, window.__abaikan]; });
      cek(`B29 ${v}: pindah kelompok = naik/turun, sekelompok = geser, Kembali = balik`,
        JSON.stringify(t1) === '["naik"]' && JSON.stringify(t2) === '["mundur"]' && JSON.stringify(t3) === '["turun"]' && JSON.stringify(t4[0]) === '["balik"]' && t4[1] === 'analisis', [t1, t2, t3, t4]);
      cek(`B30 ${v}: tanpa galat halaman (mode gerak penuh)`, s.galat.length === 0, s.galat.slice(0, 4));
      await s.ctx.close();
    }
    { // ------------------------- 1180 px: bawaan tidak tersemat -------------------------
      const s = await masuk(browser, URL_[v], { peran: 'Admin', super: true, vp: { width: 1180, height: 860 } });
      cek(`B31 ${v}: 1180 px → bawaan rel ramping (tidak tersemat)`, await s.page.evaluate(() => !document.getElementById('sidebar').classList.contains('tersemat')));
      cek(`B32 ${v}: Admin — 7 kelompok, Kotak Saran OSDA tampil untuk super admin`, await s.page.evaluate(() =>
        document.querySelectorAll('#navMenu .nav-grup:not(.hidden)').length === 7 && !document.querySelector('#navMenu [data-view="kotaksaran"]').classList.contains('hidden')));
      await s.ctx.close();
    }
    { // ------------------------- HP · Guru -------------------------
      const s = await masuk(browser, URL_[v], { hp: true, peran: 'Guru', kelas: ['VIII-D'] }), p = s.page;
      const t = await tabBawah(p);
      const pusat = await p.evaluate(() => { const b = document.getElementById('tabCatat').getBoundingClientRect(); return Math.abs(b.left + b.width / 2 - innerWidth / 2) < 2; });
      cek(`B33 ${v}: HP Guru — Ringkasan · Santri | Catat | Tindak Lanjut · Menu, Catat di tengah`, JSON.stringify(t) === JSON.stringify(['dashboard', 'siswa', 'tabCatat', 'tabTindak', 'tabMenu']) && pusat, t);
      await p.click('#tabTindak'); await p.waitForSelector('#laciAmanah.buka');
      const la = await p.evaluate(() => ({ it: [...document.querySelectorAll('#laDaftar [data-la]')].map(b => b.dataset.la), lapis: (history.state || {}).lapis,
        angka: document.querySelector('#laDaftar [data-la="perizinan"] .la-angka')?.textContent, tab: document.querySelector('#tabTindak .tab-hitung')?.textContent }));
      cek(`B34 ${v}: Laci Amanah — Pembinaan, Pesan, Perizinan, Sidang, Rekap Pembinaan; angka izin sama dengan tab`,
        JSON.stringify(la.it) === JSON.stringify(['pembinaan', 'pesan', 'perizinan', 'sidang', 'rekapbina']) && la.lapis === 'amanah' && !!la.angka && la.angka === la.tab, la);
      await potret(p, `v267-hp-laci-amanah-${v}`);
      await p.evaluate(() => history.back()); await tunggu(p, () => document.getElementById('laciAmanah').hidden);
      cek(`B35 ${v}: Kembali menutup Laci Amanah, halaman tetap`, await p.evaluate(() => APP.view === 'dashboard' && location.hash === '#dashboard'));
      await p.click('#tabTindak'); await p.waitForSelector('#laciAmanah.buka');
      await p.click('#laDaftar [data-la="pembinaan"]'); await tunggu(p, () => APP.view === 'pembinaan' && !APP.navSibuk);
      await p.waitForTimeout(250);
      cek(`B36 ${v}: memilih dari laci → pindah, laci tertutup, tab Tindak Lanjut menyala`, await p.evaluate(() =>
        document.getElementById('laciAmanah').hidden && location.hash === '#pembinaan' && !(history.state || {}).lapis && document.getElementById('tabTindak').classList.contains('active')));
      await p.evaluate(() => history.back()); await tunggu(p, () => APP.view === 'dashboard' && !APP.navSibuk);
      cek(`B37 ${v}: Kembali sesudah memilih dari laci → Ringkasan (bukan laci)`, true);
      // Laci menu
      await p.click('#tabMenu'); await p.waitForTimeout(350);
      cek(`B38 ${v}: laci menu ikut riwayat`, await p.evaluate(() => document.getElementById('sidebar').classList.contains('open') && (history.state || {}).lapis === 'menu'));
      await p.evaluate(() => history.back()); await tunggu(p, () => !document.getElementById('sidebar').classList.contains('open'));
      cek(`B39 ${v}: Kembali menutup laci menu, halaman tetap`, await p.evaluate(() => APP.view === 'dashboard'));
      await p.click('#tabMenu'); await p.waitForTimeout(350);
      await p.click('#navMenu [data-view="tahfiz"]'); await tunggu(p, () => APP.view === 'tahfiz' && !APP.navSibuk); await p.waitForTimeout(250);
      cek(`B40 ${v}: memilih menu dari laci → #tahfiz, entri laci diganti`, await p.evaluate(() => location.hash === '#tahfiz' && !(history.state || {}).lapis && !document.getElementById('sidebar').classList.contains('open')));
      await p.evaluate(() => history.back()); await tunggu(p, () => APP.view === 'dashboard' && !APP.navSibuk);
      cek(`B41 ${v}: Kembali → Ringkasan`, true);
      cek(`B42 ${v}: HP — titik Denyut tersembunyi saat tenang; lentera di bilah atas`, await p.evaluate(() => !document.getElementById('denyut').getClientRects().length && !!document.getElementById('btnLentera').getClientRects().length));
      cek(`B43 ${v}: tanpa galat halaman (HP)`, s.galat.length === 0, s.galat.slice(0, 4));
      await s.ctx.close();
    }
    for (const [peran, harap, datar] of [
      ['Osis', ['dashboard', 'siswa', 'tabCatat', 'sidang', 'tabMenu'], true],
      ['Pimpinan', ['pimpinan', 'asatidz', 'bidang', 'pesan', 'tabMenu'], true],
      ['Klinik', ['perizinan', 'asatidz', 'tabMenu'], true],
      ['Guru Piket', ['dashboard', 'siswa', 'perizinan', 'tabTindak', 'tabMenu'], false]]) {
      const s = await masuk(browser, URL_[v], { hp: true, peran, korps: peran === 'Osis' ? 'Osis Putra' : null });
      const t = await tabBawah(s.page);
      const dt = await s.page.evaluate(() => document.getElementById('navMenu').classList.contains('nav-datar'));
      cek(`B44 ${v}: ${peran} — bilah bawah tetap ${harap.join(' · ')}; menu ${datar ? 'datar' : 'berlipat'}`, JSON.stringify(t) === JSON.stringify(harap) && dt === datar, [t, dt]);
      if (peran === 'Pimpinan') cek(`B45 ${v}: Pimpinan — tanpa tombol Catat`, await s.page.evaluate(() => document.getElementById('tabCatat').classList.contains('hidden') && document.getElementById('btnCatatAtas').classList.contains('hidden')));
      cek(`B46 ${v}: ${peran} — tanpa galat`, s.galat.length === 0, s.galat.slice(0, 3));
      await s.ctx.close();
    }
  }
  await browser.close(); s1.close(); s2.close();
  console.log(`\n${lulus} lulus · ${gagal} gagal`);
  process.exit(gagal ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
