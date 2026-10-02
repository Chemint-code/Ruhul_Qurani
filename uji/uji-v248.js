/* uji-v248.js — Ringkasan Bulan Ini: data bulan berjalan + tren, gerak selaras layar masuk
 * (aplikasi UTUH, Supabase tiruan).
 *   RQDIR=<app v2.48> RQASLI=<app v2.47.2> [RQBAGIAN=1,2] node uji-v248.js
 * 1 fungsi murni · 2 angka & grafik bulan ini · 3 pemilih periode · 4 Pimpinan & IPP tidak berubah
 * 5 gerak (hitung naik, sambut sekali per sesi, hemat, gerak dikurangi) · 6 tiga lebar layar */
const H = require('./harness.js');
const D = require('./dasar-uji.js');
const { chromium, path, fs, CDN } = H;
const DIR  = process.env.RQDIR  || path.join(process.env.HOME, 'Ruhul_Qurani');
const ASLI = process.env.RQASLI || path.join(process.env.HOME, 'Downloads/Chemint/2.47.2');
const KELUAR = path.join(__dirname, 'keluaran-v248'); fs.mkdirSync(KELUAR, { recursive: true });
const KINI = '2026-09-22T09:00:00+07:00';
/* Pelanggaran tiruan: 300 baris September (tgl 1–20, 15/hari) + 200 baris Agustus (tgl 1–25, 8/hari).
 * Pada 22 Sep: bulan ini = 300; pembanding 1–22 Agu = 22 × 8 = 176 → naik 70 %. */
const DETAIL = `detail_data: Array.from({length:500},(_,i)=>({ id_log:'L'+n(i,5), nisn:'24'+n(i%120,6), nama_siswa:'Santri '+(i%120), kelas:KELAS[(i%120)%8],
      tanggal: i<300 ? '2026-09-'+n(1+i%20,2) : '2026-08-'+n(1+(i-300)%25,2), kategori:['Ringan','Sedang','Berat'][i%3],
      nama_pelanggaran:'Uji '+(i%7), bidang:['Ibadah','Kedisiplinan','Akhlak'][i%3], bobot_pelanggaran:5, status:'Active', updated_at:'2026-09-02T00:00:00Z' })),`;
const MOCK = H.MOCK.replace(/detail_data: Array\.from\(.*\n/, DETAIL + '\n')
  .replace("if (nama === 'kehadiran_analisis') {", `if (nama === 'laporan_santri_aman') {
        const n = String(arg.p_nisn), sw = T.siswa.find(x => x.nisn === n) || {};
        const mine = (t) => T[t].filter(r => String(r.nisn) === n);
        return new Promise(r=>setTimeout(()=>r({ data:{ siswa:{ ...sw, total_poin_pelanggaran: mine('detail_data').length * 5 },
          perkembangan: mine('detail_data').map(d => ({ poin:d.bobot_pelanggaran, judul:d.nama_pelanggaran, bidang:d.bidang, tanggal:d.tanggal, kategori:d.kategori, penindak:'Ust. Uji', catatan:'' })),
          pembinaan: mine('log_pembinaan'), perizinan: mine('log_perizinan').map(z => ({ ...z, jenis_izin:'Pulang', alasan:'uji' })), presensi:[], rekap:[] }, error:null }),30));
      }
      if (nama === 'kehadiran_analisis') {`);
if (MOCK === H.MOCK || !MOCK.includes('laporan_santri_aman')) throw new Error('MOCK tidak tersuntik: pola harness.js berubah');
let lulus = 0, gagal = 0;
const cek = (j, ok, info) => { ok ? lulus++ : gagal++; console.log(`${ok ? '  ok  ' : ' GAGAL'} ${j}${info !== undefined ? '  · ' + JSON.stringify(info) : ''}`); };
const BAGIAN = (process.env.RQBAGIAN || '').split(',').filter(Boolean);
const jalan = (n) => !BAGIAN.length || BAGIAN.includes(String(n));

(async () => {
  const srv = D.layani(DIR).listen(0), srvAsli = D.layani(ASLI).listen(0);
  const URL = `http://127.0.0.1:${srv.address().port}/`, URL_ASLI = `http://127.0.0.1:${srvAsli.address().port}/`;
  const browser = await chromium.launch({ executablePath: process.env.RQCHROME || undefined });
  const galat = [];
  async function buka(url, peran, o = {}) {
    const ctx = await browser.newContext({ viewport: o.viewport || { width: 1366, height: 860 }, serviceWorkers: 'block',
      reducedMotion: o.kurang ? 'reduce' : 'no-preference', isMobile: !!o.mobile, hasTouch: !!o.mobile });
    await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, async (route) => {
      const u = route.request().url();
      if (u.includes('supabase-js')) return route.fulfill({ contentType: 'application/javascript', body: MOCK });
      if (u.includes('sweetalert2')) return route.fulfill({ contentType: 'application/javascript', path: CDN + '/sweetalert2/dist/sweetalert2.all.min.js' });
      if (u.includes('chart.js'))    return route.fulfill({ contentType: 'application/javascript', path: CDN + '/chart.js/dist/chart.umd.min.js' });
      return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
    });
    const page = await ctx.newPage();
    await page.addInitScript((t) => { const Asli = Date, geser = t - Asli.now();
      class DateGeser extends Asli { constructor(...a) { super(...(a.length ? a : [Asli.now() + geser])); } static now() { return Asli.now() + geser; } }
      window.Date = DateGeser; }, new Date(o.kini || KINI).getTime());
    page.on('pageerror', e => galat.push(peran + ' pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') galat.push(peran + ' console: ' + m.text()); });
    await page.addInitScript((a) => {
      // bawaan = perangkat pengguna yang sebenarnya: 4 inti, mode efek "otomatis" (tanpa pilihan tersimpan)
      Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => (a.bawaan ? 4 : 8) });
      try { localStorage.setItem('rq-singgah', 'mati'); if (!a.bawaan) localStorage.setItem('rq-efek-pilih', a.hemat ? 'hemat' : 'penuh');
            localStorage.setItem('rq.tur.v1.u-admin', '{"t":0}'); } catch (e) {}
      window.__PERAN = a.peran; if (a.kelas) window.__KELAS = a.kelas;
    }, { peran, kelas: o.kelas || null, hemat: !!o.hemat, bawaan: !!o.bawaan });
    if (o.awal) await page.addInitScript(o.awal);
    await page.goto(url);
    await page.waitForFunction(() => typeof APP !== 'undefined' && APP.profil && document.querySelector('#viewRoot .stats, #viewRoot .card'), null, { timeout: 25000 });
    return { ctx, page };
  }
  const jeda = (p, ms = 800) => p.waitForTimeout(ms);
  const tungguSebaran = (p) => p.waitForFunction(() => { const b = document.getElementById('blokSebaran'); return b && b.querySelector('.card'); }, null, { timeout: 25000 });
  /** Grafik di luar layar ditunda; gulir ke kanvasnya lalu tunggu grafik sungguhan. */
  const grafik = async (p, kunci, id) => {
    await p.evaluate((i) => document.getElementById(i).scrollIntoView({ block: 'center' }), id);
    await p.waitForFunction((k) => APP.charts[k] && APP.charts[k].data, kunci, { timeout: 8000 });
    return p.evaluate((k) => { const c = APP.charts[k]; return { tipe: c.config.type, label: c.data.labels.length,
      ds: c.data.datasets.map(d => ({ label: d.label, jumlah: d.data.reduce((s, x) => s + (Number(x) || 0), 0), n: d.data.length, nol: d.data.filter(x => x == null).length })) }; }, kunci);
  };
  /** Kartu angka: { label: { nilai, kaki, tren, nada } } sesudah hitung naik selesai. */
  const kartu = (p) => p.evaluate(() => Object.fromEntries([...document.querySelectorAll('#viewRoot > .stats .stat')].map(s => [s.querySelector('.k').textContent.trim(), {
    nilai: s.querySelector('.v').textContent.trim(), kaki: (s.querySelector('.f')?.innerText || '').replace(/\s+/g, ' ').trim(),
    tren: s.querySelector('.rb-tren')?.textContent.replace(/\s+/g, ' ').trim() || null, nada: s.querySelector('.rb-tren')?.dataset.nada || null }])));

  if (jalan(1)) {
    console.log('\n[1] Fungsi murni: periode Ringkasan, belah bulan, lencana tren, cerita harian');
    const b = await buka(URL, 'Admin', { kurang: true });
    const r = await b.page.evaluate(() => {
      const ada = typeof periodeRingkasan === 'function' && typeof belahBulan === 'function' && typeof lencanaBanding === 'function' && !!CERITA.harian;
      if (!ada) return { ada };
      const p = (th, bl, hr) => periodeRingkasan(new Date(th, bl - 1, hr));
      const sep = p(2026, 9, 22), jan = p(2027, 1, 5), mar = p(2026, 3, 31), satu = p(2026, 10, 1);
      const simpan = { ...APP.periode };
      APP.periode = { aktif: true, bulan: '2026-08', basis: 'kejadian' };
      const agu = p(2026, 9, 22);
      APP.periode = simpan;
      const baris = [{ t: '2026-09-01' }, { t: '2026-09-30' }, { t: '2026-08-22' }, { t: '2026-08-23' }, { t: '2026-07-01' }, { t: '' }];
      const bb = belahBulan(baris, 't', sep);
      const iz = belahBulanIzin([{ tanggal_mulai: '2026-08-29', tanggal_selesai: '2026-09-03' }, { tanggal_mulai: '2026-08-25', tanggal_selesai: '2026-08-26' },
        { tanggal_mulai: '2026-09-10' }, { tanggal_mulai: '2026-08-10' }], sep);
      const h = CERITA.harian([3, 9, 2, null, null], [4, 4, 4, 4, 4], { batas: 3, label: 'September 2026', frasaLalu: '1–3 Agustus' });
      const h0 = CERITA.harian([0, 0, null], [0, 0, 0], { batas: 2, label: 'Oktober 2026', frasaLalu: '1–2 September' });
      return { ada, sep, jan, mar, satu, agu, bb: [bb.ini.length, bb.lalu.length, bb.laluPenuh.length], iz: [iz.ini.length, iz.lalu.length, iz.laluPenuh.length],
        naik: lencanaBanding(300, 176, { frasa: '1–22 Agustus' }), kecil: lencanaBanding(4, 2, { frasa: 'x' }), nol: lencanaBanding(9, 0, { frasa: 'x' }),
        turun: lencanaBanding(80, 100, { frasa: 'x' }), netral: lencanaBanding(300, 176, { frasa: 'x', netral: true }), h, h0,
        lamaUtuh: [lencanaTren(null), lencanaTren(2), lencanaTren(-2)] };
    });
    cek('Fungsi baru tersedia', r.ada === true, r.ada);
    if (r.ada) {
      cek('22 Sep 2026, periode mati → bulan ini September, pembanding 1–22 Agustus', r.sep.bulan === '2026-09' && r.sep.lalu === '2026-08' && r.sep.batas === 22 && r.sep.berjalan === true && r.sep.label === 'September 2026' && r.sep.frasaLalu === '1–22 Agustus', r.sep);
      cek('Januari → pembanding Desember tahun sebelumnya', r.jan.bulan === '2027-01' && r.jan.lalu === '2026-12' && r.jan.frasaLalu === '1–5 Desember', r.jan);
      cek('31 Maret → Februari utuh (batas melewati panjang bulan lalu)', r.mar.lalu === '2026-02' && r.mar.frasaLalu === 'Februari', r.mar);
      cek('Tanggal 1 → pembanding "1 September"', r.satu.batas === 1 && r.satu.frasaLalu === '1 September', r.satu);
      cek('Pemilih periode Agustus → bulan Agustus utuh, pembanding Juli', r.agu.bulan === '2026-08' && r.agu.lalu === '2026-07' && r.agu.berjalan === false && r.agu.batas === 31 && r.agu.frasaLalu === 'Juli', r.agu);
      cek('belahBulan: bulan ini 2, bulan lalu s.d. tgl 22 = 1, bulan lalu utuh 2', JSON.stringify(r.bb) === '[2,1,2]', r.bb);
      cek('belahBulanIzin: izin lintas bulan masuk bulan ini; pembanding hanya yang menyentuh 1–22 Agu (1 dari 3)', JSON.stringify(r.iz) === '[2,1,3]', r.iz);
      cek('lencanaTren() lama (panel sebaran) tidak tertimpa', /belum cukup/.test(r.lamaUtuh[0]) && /tren-x/.test(r.lamaUtuh[0]) && r.lamaUtuh[1] !== r.lamaUtuh[2] && !/rb-tren/.test(r.lamaUtuh.join('')), r.lamaUtuh);
      cek('lencanaBanding 300 vs 176 → naik 70 %, nada waspada', /naik 70/.test(r.naik) && /data-nada="waspada"/.test(r.naik), r.naik);
      cek('lencanaBanding angka kecil (4 vs 2) → stabil, tidak didramatisasi', /stabil/.test(r.kecil) && /data-nada="netral"/.test(r.kecil), r.kecil);
      cek('lencanaBanding 9 vs 0 → "dari nol", tanpa persen', /dari nol/.test(r.nol) && !/%/.test(r.nol.replace(/<[^>]+>/g, '')), r.nol);
      cek('lencanaBanding turun → nada baik; metrik netral tidak diberi nada', /turun 20/.test(r.turun) && /data-nada="baik"/.test(r.turun) && /data-nada="netral"/.test(r.netral) && /naik 70/.test(r.netral), [r.turun, r.netral]);
      cek('CERITA.harian: total s.d. batas, pembanding, hari tersibuk disorot', /<b>14<\/b>/.test(r.h.teks) && /1–3 Agustus/.test(r.h.teks) && r.h.sorot && r.h.sorot.indeks === 1 && r.h.sorot.label === '9', r.h);
      cek('CERITA.harian: bulan kosong → kalimat tenang tanpa sorotan', /Belum ada catatan/.test(r.h0.teks) && r.h0.sorot === null, r.h0);
    }
    await b.ctx.close();
  }

  if (jalan(2)) {
    console.log('\n[2] Ringkasan: angka dan grafik = bulan ini, tren terhadap bulan lalu');
    const b = await buka(URL, 'Admin', { kurang: true });
    const k = await kartu(b.page);
    cek('Enam kartu: Santri Aktif, Pelanggaran, Poin Pelanggaran, Perizinan, Pembinaan, Tahfiz', JSON.stringify(Object.keys(k)) === '["Santri Aktif","Pelanggaran","Poin Pelanggaran","Perizinan","Pembinaan","Tahfiz (halaman)"]', Object.keys(k));
    cek('Poin Pelanggaran = 1.500 (300 × 5, bulan ini saja), naik 70 % vs 880', k['Poin Pelanggaran']?.nilai === '1.500' && /naik 70/.test(k['Poin Pelanggaran']?.tren || '') && k['Poin Pelanggaran']?.nada === 'waspada', k['Poin Pelanggaran']);
    cek('Tahfiz = 59,5 halaman dari 40 setoran; naik dari nol dibaca kabar BAIK', k['Tahfiz (halaman)']?.nilai === '59,5' && /40 setoran/.test(k['Tahfiz (halaman)']?.kaki || '') && k['Tahfiz (halaman)']?.nada === 'baik', k['Tahfiz (halaman)']);
    cek('Pelanggaran = 300 (September saja, bukan 500 akumulasi)', k.Pelanggaran?.nilai === '300', k.Pelanggaran);
    cek('Pelanggaran: lencana "naik 70 %" (waspada) vs 1–22 Agu', /naik 70/.test(k.Pelanggaran?.tren || '') && k.Pelanggaran?.nada === 'waspada' && /1–22 Agu/.test(k.Pelanggaran?.kaki || ''), k.Pelanggaran);
    cek('Perizinan = 60, 15 menunggu; lencana netral', k.Perizinan?.nilai === '60' && /15 menunggu/.test(k.Perizinan?.kaki || '') && k.Perizinan?.nada === 'netral', k.Perizinan);
    cek('Pembinaan = 1.100 bulan ini, 158 berproses', k.Pembinaan?.nilai === '1.100' && /158 berproses/.test(k.Pembinaan?.kaki || ''), k.Pembinaan);
    const per = await b.page.evaluate(() => document.querySelector('#viewRoot .rb-periode')?.innerText.replace(/\s+/g, ' ').trim() || '');
    cek('Baris periode: "September 2026" dan pembanding "1–22 Agustus"', /September 2026/.test(per) && /1–22 Agustus/.test(per), per);
    const g = await grafik(b.page, 'pekan', 'chPekan');
    cek('Gelombang harian: 30 hari, dua garis (bulan ini 300, Agustus utuh 200)', g.tipe === 'line' && g.label === 30 && g.ds.length === 2 && g.ds[0].jumlah === 300 && g.ds[1].jumlah === 200, g);
    cek('Gelombang harian: hari sesudah tanggal 22 dikosongkan (8 hari)', g.ds[0].nol === 8, g.ds[0]);
    const gk = await grafik(b.page, 'kategori', 'chKategori');
    cek('Proporsi kategori berjumlah 300', gk.ds[0].jumlah === 300, gk);
    const ga = await grafik(b.page, 'angkatan', 'chAngkatan');
    cek('Per angkatan: batang bulan ini (300) vs bulan lalu s.d. tgl 22 (176)', ga.tipe === 'bar' && ga.ds.length === 2 && ga.ds[0].jumlah === 300 && ga.ds[1].jumlah === 176, ga);
    const gb = await grafik(b.page, 'bidang', 'chBidang');
    cek('Per bidang berjumlah 300', gb.ds[0].jumlah === 300, gb);
    const gi = await grafik(b.page, 'izin', 'chIzin');
    cek('Izin harian: 30 hari, 60 santri mulai izin', gi.label === 30 && gi.ds[0].jumlah === 60, gi);
    const t = await b.page.evaluate(() => { const luar = [...document.querySelectorAll('#viewRoot > :not(#blokSebaran)')].map(e => e.innerText).join('\n');
      return { tigaBulan: /3 bulan terakhir|tiga bulan terakhir|14 hari terakhir/i.test(luar),
        cerita: document.getElementById('chPekan').closest('.card').querySelector('.cerita')?.innerText || '',
        top: [...document.querySelectorAll('#viewRoot .rank .c')].map(e => e.textContent.trim()),
        mini: [...document.getElementById('chIzin').closest('.card').querySelectorAll('.minis .mini b')].map(e => e.textContent.trim()),
        amanah: [...document.querySelectorAll('.sapa .amanah .teks')].map(e => e.innerText.replace(/\s+/g, ' ').trim()) }; });
    cek('Tidak ada lagi keterangan "3 bulan terakhir" / "14 hari terakhir" di kartu utama', !t.tigaBulan, t.tigaBulan);
    cek('Kalimat cerita gelombang menyebut 300 catatan dan pembanding Agustus', /300/.test(t.cerita) && /Agustus/.test(t.cerita), t.cerita);
    cek('5 terbanyak dihitung dari September (≤ 300 total, urut menurun)', t.top.length === 5 && t.top.map(x => parseInt(x)).every((v, i, a) => (i === 0 || a[i - 1] >= v) && v <= 45), t.top);
    cek('Kedisiplinan perizinan: 45 sesuai · 0 telat · 15 menunggu · 60 total', JSON.stringify(t.mini) === '["45","0","15","60"]', t.mini);
    cek('Amanah tertunda tetap tampil (izin menunggu, pembinaan belum selesai)', t.amanah.some(x => /15\s*izin menunggu/.test(x)) && t.amanah.some(x => /158\s*pembinaan belum diselesaikan/.test(x)), t.amanah);
    await tungguSebaran(b.page);
    const cat = await b.page.evaluate(() => document.querySelector('#blokSebaran .rb-jendela')?.innerText || '');
    cek('Peta Perkembangan: keterangan — peta 6 bulan, Indeks Peringatan dari lembar bulan ini', /6 bulan/.test(cat) && /lembar September 2026/.test(cat), cat);
    await b.ctx.close();
  }

  if (jalan(3)) {
    console.log('\n[3] Pemilih periode: bulan terpilih + pembanding bulan sebelumnya; reset kembali ke bulan ini');
    const b = await buka(URL, 'Admin', { kurang: true });
    await b.page.evaluate(() => setPeriode('2026-08', 'kejadian', true));
    await b.page.waitForFunction(() => /Agustus 2026/.test(document.querySelector('#viewRoot .rb-periode')?.innerText || ''), null, { timeout: 10000 });
    let k = await kartu(b.page);
    cek('Agustus dipilih → Pelanggaran 200 (Agustus utuh), pembanding Juli (nol)', k.Pelanggaran?.nilai === '200' && /dari nol/.test(k.Pelanggaran?.tren || '') && /Jul/.test(k.Pelanggaran?.kaki || ''), k.Pelanggaran);
    const g = await grafik(b.page, 'pekan', 'chPekan');
    cek('Gelombang Agustus: 31 hari, tidak ada hari dikosongkan', g.label === 31 && g.ds[0].jumlah === 200 && g.ds[0].nol === 0, g);
    await b.page.evaluate(() => setPeriode('2026-08', 'kejadian', false));
    await b.page.waitForFunction(() => /September 2026/.test(document.querySelector('#viewRoot .rb-periode')?.innerText || ''), null, { timeout: 10000 });
    k = await kartu(b.page);
    cek('Reset periode → kembali ke September (300)', k.Pelanggaran?.nilai === '300', k.Pelanggaran);
    await b.ctx.close();
    // Awal bulan: 1 Oktober, belum ada catatan → halaman tetap utuh dan jujur
    const c = await buka(URL, 'Admin', { kurang: true, kini: '2026-10-01T08:00:00+07:00' });
    k = await kartu(c.page);
    const g2 = await grafik(c.page, 'pekan', 'chPekan');
    cek('1 Oktober: Pelanggaran 0, pembanding "1 Sep" (15) → turun, garis bayangan September tetap ada', k.Pelanggaran?.nilai === '0' && /1 Sep/.test(k.Pelanggaran?.kaki || '') && g2.ds[1].jumlah === 300 && g2.label === 31, [k.Pelanggaran, g2]);
    await c.ctx.close();
  }

  if (jalan(4)) {
    console.log('\n[4] Yang TIDAK boleh berubah: Dashboard Pimpinan (90 hari), panel IPP, Radar mini');
    const stats = (p) => p.evaluate(() => [...document.querySelectorAll('#viewRoot .stats .stat')].map(s => [s.querySelector('.k').textContent.trim(), s.querySelector('.v').textContent.trim(), (s.querySelector('.f')?.textContent || '').trim()]));
    const a = await buka(URL_ASLI, 'Pimpinan', { kurang: true }); await jeda(a.page, 1500); const lama = await stats(a.page); await a.ctx.close();
    const b = await buka(URL, 'Pimpinan', { kurang: true });      await jeda(b.page, 1500); const baru = await stats(b.page);
    cek('Pimpinan: semua kartu angka identik dengan v2.47.2 (label, nilai, kaki)', lama.length >= 6 && lama[1][0] === 'Pelanggaran 90h' && JSON.stringify(lama) === JSON.stringify(baru), { lama: lama.length, baru: baru.length });
    const meta = await b.page.evaluate(() => ({ kartu: [...document.querySelectorAll('#viewRoot .card-head')].some(h => /90 hari terakhir/.test(h.innerText)), rentang: PIM.rentang }));
    cek('Pimpinan: jendela 90 hari kalender (25 Jun – 22 Sep 2026)', meta.kartu && /25 Jun 2026/.test(meta.rentang) && /22 Sep 2026/.test(meta.rentang), meta);
    await b.ctx.close();
    const tagIpp = (p) => p.evaluate(() => {
      const k = [...document.querySelectorAll('#blokSebaran .card')].find(c => c.querySelector('h3')?.textContent === 'Indeks Peringatan Pembinaan');
      return k ? { tag: [...k.querySelectorAll('.card-head .tag')].map(t => t.textContent.trim()), baris: [...k.querySelectorAll('.ipp-baris b')].map(x => x.textContent.trim()),
        sub: k.querySelector('.card-head .sub')?.textContent.trim() || '', sebab: k.querySelector('.ipp-baris small')?.textContent.trim() || '', teks: k.innerText } : null; });
    const sbTren = (p) => p.evaluate(() => [...document.querySelectorAll('#blokSebaran .sb-tren')].map(e => e.innerHTML.replace(/\s+/g, ' ').trim()));
    { const x = await buka(URL_ASLI, 'Admin', { kurang: true }); await tungguSebaran(x.page); await jeda(x.page, 600); const lama = [await tagIpp(x.page), await sbTren(x.page)]; await x.ctx.close();
      const y = await buka(URL, 'Admin', { kurang: true });      await tungguSebaran(y.page); await jeda(y.page, 600); const baru = [await tagIpp(y.page), await sbTren(y.page)];
      cek('Peta Perkembangan (6 bulan): lencana tren matriks sebaran identik dengan v2.47.2', lama[1].length > 0 && JSON.stringify(lama[1]) === JSON.stringify(baru[1]), { lama: lama[1].length, baru: baru[1].length });
      // v2.47.2: 60 hari (24 Jul – 22 Sep) → Santri 1 terbebani 25 poin. Lembar September saja: 15 poin.
      cek('IPP lama memang 60 hari (acuan: beban 25 poin)', /60 hari terakhir/.test(lama[0].sub) && /25 poin/.test(lama[0].sebab), [lama[0].sub, lama[0].sebab]);
      cek('IPP baru = lembar September (01–22 Sep): beban 15 poin, tidak membawa Agustus', /Lembar September 2026/.test(baru[0].sub) && /01 Sep 2026/.test(baru[0].sub) && /22 Sep 2026/.test(baru[0].sub) && /15 poin/.test(baru[0].sebab), [baru[0].sub, baru[0].sebab]);
      cek('IPP baru: tier dihitung dari bulan ini (120 santri tier 2, 0 tier 3)', JSON.stringify(baru[0].tag) === '["Tier 3: 0","Tier 2: 120","Tier 1: 0"]', baru[0].tag);
      const mini = await y.page.evaluate(() => (document.getElementById('radarMini')?.innerText || '').replace(/\s+/g, ' ').trim());
      cek('Radar mini tetap tampil dan membaca IPP yang sama', /Radar Amanah/.test(mini) && /120 tier 2/.test(mini), mini);
      // Lembar Agustus (pemilih periode): IPP dari Agustus utuh, beban maksimal 10 poin
      await y.page.evaluate(() => setPeriode('2026-08', 'kejadian', true));
      await y.page.waitForFunction(() => /Lembar Agustus 2026/.test(document.getElementById('blokSebaran')?.innerText || ''), null, { timeout: 20000 });
      const agu = await tagIpp(y.page);
      cek('Pemilih periode Agustus → IPP lembar Agustus (01–31 Agu), beban 10 poin', /01 Agu 2026/.test(agu.sub) && /31 Agu 2026/.test(agu.sub) && /10 poin/.test(agu.sebab), [agu.sub, agu.sebab]);
      await y.page.evaluate(() => setPeriode('2025-01', 'kejadian', true));
      await y.page.waitForFunction(() => /enam bulan terakhir/.test(document.getElementById('blokSebaran')?.innerText || ''), null, { timeout: 20000 }).catch(() => {});
      const tua = await y.page.evaluate(() => /Indeks Peringatan hanya tersedia untuk enam bulan terakhir/.test(document.getElementById('blokSebaran').innerText));
      cek('Bulan di luar enam bulan → IPP tidak dihitung, diberi keterangan (bukan "semua tier 1")', tua, tua);
      await y.ctx.close(); }
    { const y = await buka(URL, 'Guru', { kelas: ['VIII-D'], kurang: true }); const k = await kartu(y.page);
      // VIII-D = santri ke-1 dari tiap 8 → 15 santri; baris i dengan (i%120)%8==1
      const harap = Array.from({ length: 300 }, (_, i) => i).filter(i => (i % 120) % 8 === 1).length;
      cek('Guru VIII-D: Pelanggaran bulan ini hanya kelas binaan', k.Pelanggaran?.nilai === String(harap), [k.Pelanggaran, harap]);
      await y.ctx.close(); }
  }

  if (jalan(5)) {
    console.log('\n[5] Gerak: hitung naik, sambutan sekali per sesi, mode hemat, gerak dikurangi');
    // Rekam nilai kartu Pelanggaran tiap bingkai sejak kartu muncul.
    const REKAM = () => { window.__rekam = []; const tik = () => { const v = document.querySelectorAll('#viewRoot > .stats .stat .v')[1];
      if (v) window.__rekam.push(v.textContent.trim()); if (window.__rekam.length < 3000) requestAnimationFrame(tik); }; requestAnimationFrame(tik); };
    const TINGGI = { viewport: { width: 1366, height: 1500 } };   // kartu angka langsung terlihat
    { const b = await buka(URL, 'Admin', Object.assign({ awal: REKAM }, TINGGI));
      const r0 = await b.page.evaluate(() => ({ sambut: document.getElementById('viewRoot').classList.contains('rb-sambut'),
        h2: getComputedStyle(document.querySelector('.sapa h2')).animationName, garis: getComputedStyle(document.querySelector('.sapa .eyebrow .rule')).animationName }));
      await b.page.waitForFunction(() => document.querySelectorAll('#viewRoot > .stats .stat .v')[1].textContent.trim() === '300' && document.querySelector('#viewRoot .stat.rb-tampak'), null, { timeout: 12000 });
      await jeda(b.page, 300);
      const r = await b.page.evaluate(() => { const unik = [...new Set(window.__rekam)].map(x => Number(x.replace(/\./g, '')));
        return { unik: unik.length, awal: unik[0], akhir: unik[unik.length - 1], monoton: unik.every((v, i, a) => i === 0 || a[i - 1] <= v),
          kilau: document.querySelectorAll('#viewRoot .stat .stat-sorot').length, tampak: document.querySelectorAll('#viewRoot .stat.rb-tampak').length,
          sapu: getComputedStyle(document.querySelector('#viewRoot .stat .stat-sorot'), '::after').animationName,
          tren: getComputedStyle(document.querySelector('#viewRoot .rb-tren')).animationName, tahan: document.getElementById('viewRoot').classList.contains('rb-tahan') }; });
      cek('Angka Pelanggaran menghitung naik (monoton) dari 0 dan berakhir di 300', r.unik >= 8 && r.awal === 0 && r.akhir === 300 && r.monoton, r);
      cek('Tiba: mode sambut, judul "mengambil fokus", garis digambar', r0.sambut && r0.h2 === 'masukJudul' && r0.garis === 'masukGaris', r0);
      cek('Kartu terlihat → .rb-tampak, lencana tren masuk, kilau menyapu, tahanan dilepas', r.tampak === 6 && r.tren === 'rbTren' && r.sapu === 'sapuKilauLogin' && !r.tahan, r);
      cek('Tiap kartu angka punya lapis sorot (kursor & kilau)', r.kilau === 6, r.kilau);
      await jeda(b.page, 2200);
      const op = await b.page.evaluate(() => [...document.querySelectorAll('#viewRoot .rb-tren, #viewRoot .rb-tren-ket')].map(e => getComputedStyle(e).opacity));
      cek('Sesudah gerak selesai semua lencana & keterangannya terlihat penuh', op.length === 10 && op.every(o => o === '1'), op);
      // Sorot kursor menulis --sx/--sy pada kartu angka
      const kotak = await b.page.evaluate(() => { const s = document.querySelectorAll('#viewRoot > .stats .stat')[1].getBoundingClientRect(); return { x: s.left + s.width / 2, y: s.top + s.height / 2 }; });
      await b.page.mouse.move(kotak.x - 5, kotak.y - 5); await b.page.mouse.move(kotak.x, kotak.y); await jeda(b.page, 600);
      const s = await b.page.evaluate(() => { const st = document.querySelectorAll('#viewRoot > .stats .stat')[1];
        return { disorot: st.classList.contains('disorot'), sx: st.style.getPropertyValue('--sx'), op: getComputedStyle(st.querySelector('.stat-sorot'), '::before').opacity }; });
      cek('Kursor di atas kartu angka → sorot menyala mengikuti kursor', s.disorot && /px/.test(s.sx) && Number(s.op) > .9, s);
      // Kunjungan kedua dalam sesi yang sama: ringkas
      await b.page.evaluate(() => navigateTo('siswa')); await jeda(b.page, 1200);
      await b.page.evaluate(() => navigateTo('dashboard')); await b.page.waitForSelector('#viewRoot > .stats'); await jeda(b.page, 1600);
      const r2 = await b.page.evaluate(() => ({ sambut: document.getElementById('viewRoot').classList.contains('rb-sambut'), nilai: document.querySelectorAll('#viewRoot > .stats .stat .v')[1].textContent.trim() }));
      cek('Kunjungan kedua: tanpa mode sambut, angka tetap berakhir benar', !r2.sambut && r2.nilai === '300', r2);
      // Penyegaran halaman yang sama: angka yang tidak berubah tidak bergerak
      await b.page.evaluate(() => { window.__rekam = []; return navigateTo('dashboard'); }); await jeda(b.page, 1500);
      const r3 = await b.page.evaluate(() => [...new Set(window.__rekam)]);
      cek('Penyegaran halaman yang sama: angka yang tetap tidak dihitung ulang dari nol', r3.length === 1 && r3[0] === '300', r3);
      // Ganti periode: angka bergulir dari nilai lama (300) ke nilai baru (200), tidak lewat nol
      await b.page.evaluate(() => { window.__rekam = []; setPeriode('2026-08', 'kejadian', true); });
      await b.page.waitForFunction(() => /Agustus 2026/.test(document.querySelector('#viewRoot .rb-periode')?.innerText || ''), null, { timeout: 10000 }); await jeda(b.page, 1500);
      const r4 = await b.page.evaluate(() => [...new Set(window.__rekam)].map(x => Number(x.replace(/\./g, ''))));
      cek('Ganti periode: angka bergulir 300 → 200 tanpa melewati nol', r4[r4.length - 1] === 200 && Math.min(...r4) >= 200 && r4.length >= 3, [r4.length, r4[0], r4[r4.length - 1], Math.min(...r4)]);
      await b.ctx.close(); }
    // Pemicu gulir: di layar pendek kartu angka di bawah lipatan → menunggu sampai tergulir masuk
    { const b = await buka(URL, 'Admin', { viewport: { width: 1366, height: 700 } }); await jeda(b.page, 2500);
      const a = await b.page.evaluate(() => { const st = document.querySelectorAll('#viewRoot > .stats .stat')[1];
        return { bawah: st.getBoundingClientRect().top > innerHeight, nilai: st.querySelector('.v').textContent.trim(), tampak: st.classList.contains('rb-tampak') }; });
      cek('Kartu di bawah lipatan: gerak belum dimulai (menunggu digulir)', a.bawah && a.nilai === '0' && !a.tampak, a);
      await b.page.evaluate(() => document.querySelector('#viewRoot > .stats').scrollIntoView({ block: 'center' }));
      await b.page.waitForFunction(() => document.querySelectorAll('#viewRoot > .stats .stat .v')[1].textContent.trim() === '300', null, { timeout: 6000 });
      const z = await b.page.evaluate(() => document.querySelectorAll('#viewRoot .stat.rb-tampak').length);
      cek('Tergulir masuk → menghitung sampai 300, keenam kartu .rb-tampak', z === 6, z);
      await b.page.screenshot({ path: path.join(KELUAR, 'ringkasan-kartu-1366.png') });
      // Cetak: angka yang belum sempat bergulir tetap tercetak utuh
      await b.page.evaluate(() => navigateTo('siswa')); await jeda(b.page, 1000);
      await b.page.evaluate(() => navigateTo('dashboard')); await b.page.waitForSelector('#viewRoot > .stats'); await jeda(b.page, 800);
      const c = await b.page.evaluate(() => { const v = () => document.querySelectorAll('#viewRoot > .stats .stat .v')[1].textContent.trim();
        const sebelum = v(); window.dispatchEvent(new Event('beforeprint')); return [sebelum, v()]; });
      cek('beforeprint: angka yang masih menunggu langsung dituntaskan', c[0] === '0' && c[1] === '300', c);
      await b.ctx.close(); }
    // Kerangka Peta Perkembangan tampil selagi dimuat
    { const b = await buka(URL, 'Admin', { awal: () => { const t = setInterval(() => { const k = document.getElementById('blokSebaran'), r = document.getElementById('rangkaSebaran');
        if (k && r && r.querySelector('.rq-sk')) { window.__rangkaSebaran = { sibuk: k.getAttribute('aria-busy'), kosong: k.children.length === 0 }; clearInterval(t); } }, 10); } });
      await tungguSebaran(b.page);
      const r = await b.page.evaluate(() => ({ rangka: window.__rangkaSebaran, sibuk: document.getElementById('blokSebaran').getAttribute('aria-busy'), sisa: document.querySelectorAll('#viewRoot .rb-rangka').length }));
      cek('Peta Perkembangan: kerangka berkilau selagi dimuat (wadah tetap kosong), hilang sesudah siap', r.rangka && r.rangka.sibuk === 'true' && r.rangka.kosong && r.sibuk !== 'true' && r.sisa === 0, r);
      await b.ctx.close(); }
    { const b = await buka(URL, 'Admin', Object.assign({ awal: REKAM }, TINGGI, { kurang: true })); await jeda(b.page, 1500);
      const r = await b.page.evaluate(() => ({ unik: [...new Set(window.__rekam)], sambut: document.getElementById('viewRoot').classList.contains('rb-sambut'),
        kilau: [...document.querySelectorAll('#viewRoot .stat-sorot')].map(e => getComputedStyle(e).display).filter(d => d !== 'none').length,
        h2: getComputedStyle(document.querySelector('.sapa h2')).animationName, gulir: document.getElementById('viewRoot').classList.contains('rb-gulir'),
        tren: [...document.querySelectorAll('#viewRoot .rb-tren')].map(e => getComputedStyle(e).opacity + '/' + getComputedStyle(e).animationName) }));
      cek('gerak dikurangi: angka langsung final (tanpa hitung naik), tanpa sambutan & kilau', r.unik.length === 1 && r.unik[0] === '300' && !r.sambut && r.kilau === 0 && r.h2 !== 'masukJudul', r);
      cek('gerak dikurangi: lencana tren langsung terlihat, tanpa animasi', !r.gulir && r.tren.length === 5 && r.tren.every(t => t === '1/none'), r.tren);
      await b.ctx.close(); }
    // Mode hemat = keadaan BAWAAN kebanyakan perangkat (≤ 4 inti, layar sentuh): gerak tetap ada, versi ringan.
    for (const [nama, o] of [['mode hemat (dipilih)', Object.assign({ hemat: true }, TINGGI)], ['perangkat 4 inti, efek otomatis', Object.assign({ bawaan: true }, TINGGI)],
                             ['HP sentuh 360, efek otomatis', { bawaan: true, mobile: true, viewport: { width: 360, height: 760 } }]]) {
      const b = await buka(URL, 'Admin', Object.assign({ awal: REKAM }, o));
      const hemat = await b.page.evaluate(() => document.documentElement.classList.contains('hemat'));
      await b.page.evaluate(() => document.querySelector('#viewRoot > .stats').scrollIntoView({ block: 'center' }));
      await b.page.waitForFunction(() => document.querySelectorAll('#viewRoot > .stats .stat .v')[1].textContent.trim() === '300' && document.querySelector('#viewRoot .stat.rb-tampak'), null, { timeout: 12000 });
      const r = await b.page.evaluate(() => { const unik = [...new Set(window.__rekam)].map(x => Number(x.replace(/\./g, '')));
        return { unik: unik.length, awal: unik[0], akhir: unik[unik.length - 1], sambut: document.getElementById('viewRoot').classList.contains('rb-sambut'),
          kilau: [...document.querySelectorAll('#viewRoot .stat-sorot')].map(e => getComputedStyle(e).display).filter(d => d !== 'none').length,
          tren: getComputedStyle(document.querySelector('#viewRoot .stat.rb-tampak .rb-tren')).animationName,
          garis: getComputedStyle(document.querySelector('#viewRoot .rb-periode .rule')).animationName,
          h2: getComputedStyle(document.querySelector('.sapa h2')).animationName }; });
      cek(`${nama}: memang mode hemat`, hemat === true, hemat);
      cek(`${nama}: angka tetap menghitung naik 0 → 300, lencana tren masuk, garis digambar`, r.unik >= 3 && r.awal === 0 && r.akhir === 300 && r.tren === 'rbTren' && r.garis === 'masukGaris', r);
      cek(`${nama}: versi ringan — tanpa sambutan penuh, tanpa kabur, tanpa kilau/sorot`, !r.sambut && r.kilau === 0 && r.h2 !== 'masukJudul', r);
      await jeda(b.page, 1500);
      const op = await b.page.evaluate(() => [...document.querySelectorAll('#viewRoot .rb-tren, #viewRoot .rb-tren-ket')].map(e => getComputedStyle(e).opacity));
      cek(`${nama}: sesudah gerak selesai semua lencana terlihat penuh`, op.length === 10 && op.every(x => x === '1'), op);
      await b.ctx.close();
    }
    { const b = await buka(URL, 'Pimpinan', { bawaan: true }); await jeda(b.page, 300);
      const r = await b.page.evaluate(() => ({ hemat: document.documentElement.classList.contains('hemat'), h2: getComputedStyle(document.querySelector('#viewRoot .hero h2')).animationName, garis: getComputedStyle(document.querySelector('#viewRoot .hero .eyebrow .rule')).animationName }));
      cek('Pimpinan di perangkat 4 inti: hero tetap bergerak (naik tanpa kabur, garis digambar)', r.hemat && r.h2 === 'masukNaik' && r.garis === 'masukGaris', r);
      await b.ctx.close(); }
    { const b = await buka(URL, 'Pimpinan', {}); await jeda(b.page, 400);
      const r = await b.page.evaluate(() => ({ h2: getComputedStyle(document.querySelector('#viewRoot .hero h2')).animationName, garis: getComputedStyle(document.querySelector('#viewRoot .hero .eyebrow .rule')).animationName }));
      cek('Pimpinan: hero memakai gerak layar masuk (judul fokus, garis digambar)', r.h2 === 'masukJudul' && r.garis === 'masukGaris', r);
      await jeda(b.page, 2500);
      const v = await b.page.evaluate(() => [...document.querySelectorAll('#viewRoot .stats .stat .v')].map(e => e.textContent.trim()));
      cek('Pimpinan: sesudah hitung naik, nilai kartu utuh (Santri 120, Pelanggaran 90h 500)', v[0] === '120' && v[1] === '500', v);
      await b.ctx.close(); }
  }

  if (jalan(6)) {
    console.log('\n[6] Tiga lebar layar: tanpa luapan mendatar, lencana tidak terpotong');
    for (const [nama, vp, mobile] of [['HP 360', { width: 360, height: 760 }, true], ['tablet 768', { width: 768, height: 1024 }, true], ['desktop 1280', { width: 1280, height: 800 }, false]]) {
      const b = await buka(URL, 'Admin', { viewport: vp, mobile }); await tungguSebaran(b.page);
      await b.page.evaluate(() => document.querySelector('#viewRoot > .stats').scrollIntoView({ block: 'center' })); await jeda(b.page, 3200);
      const r = await b.page.evaluate(() => { const lebar = document.documentElement.clientWidth;
        const luap = [...document.querySelectorAll('#viewRoot .stat, #viewRoot .rb-periode, #viewRoot .rb-tren, #viewRoot > .grid-2 > .card, #viewRoot .cs-baris')].filter(e => { const k = e.getBoundingClientRect(); return k.right > lebar + 1 || k.left < -1; }).length;
        const potong = [...document.querySelectorAll('#viewRoot .stat')].filter(s => { const a = s.getBoundingClientRect(); return [...s.querySelectorAll('.rb-tren, .rb-tren-ket, .f')].some(t => { const k = t.getBoundingClientRect(); return k.right > a.right + 1 || k.bottom > a.bottom + 1; }); }).length;
        return { gulirX: document.documentElement.scrollWidth - lebar, luap, potong, kartu: document.querySelectorAll('#viewRoot > .stats .stat').length,
          nilai: document.querySelectorAll('#viewRoot > .stats .stat .v')[1].textContent.trim() }; });
      cek(`${nama}: tanpa gulir mendatar, tak ada elemen meluap/terpotong, angka final 300`, r.gulirX <= 0 && r.luap === 0 && r.potong === 0 && r.kartu === 6 && r.nilai === '300', r);
      await b.page.evaluate(() => window.scrollTo(0, 0)); await jeda(b.page, 300);
      await b.page.screenshot({ path: path.join(KELUAR, `ringkasan-${vp.width}.png`), fullPage: true });
      await b.ctx.close();
    }
  }

  if (jalan(7)) {
    console.log('\n[7] Lewat layar masuk + gerbang (singgah): gerak ditahan sampai gerbang terbuka, lalu berjalan');
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 1500 }, serviceWorkers: 'block' });
    await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, async (route) => { const u = route.request().url();
      if (u.includes('supabase-js')) return route.fulfill({ contentType: 'application/javascript', body: MOCK });
      if (u.includes('sweetalert2')) return route.fulfill({ contentType: 'application/javascript', path: CDN + '/sweetalert2/dist/sweetalert2.all.min.js' });
      if (u.includes('chart.js'))    return route.fulfill({ contentType: 'application/javascript', path: CDN + '/chart.js/dist/chart.umd.min.js' });
      return route.fulfill({ status: 200, contentType: 'text/css', body: '' }); });
    const page = await ctx.newPage();
    page.on('pageerror', e => galat.push('gerbang pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') galat.push('gerbang console: ' + m.text()); });
    await page.addInitScript((t) => { const Asli = Date, geser = t - Asli.now();
      class DateGeser extends Asli { constructor(...a) { super(...(a.length ? a : [Asli.now() + geser])); } static now() { return Asli.now() + geser; } }
      window.Date = DateGeser; }, new Date(KINI).getTime());
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 });
      try { localStorage.setItem('rq-efek-pilih', 'penuh'); localStorage.setItem('rq.tur.v1.u-admin', '{"t":0}'); } catch (e) {}
      window.__PERAN = 'Admin'; window.__ev = 0; window.__catat = [];
      document.addEventListener('rq:gerbang-terbuka', () => { window.__ev++; });
      const tik = () => { const v = document.querySelectorAll('#viewRoot > .stats .stat .v')[1], r = document.getElementById('viewRoot');
        if (v) window.__catat.push([v.textContent.trim(), r.classList.contains('rb-tahan'), !!document.querySelector('.rq-gerbang'), window.__ev]);
        if (window.__catat.length < 4000) requestAnimationFrame(tik); }; requestAnimationFrame(tik);
    });
    await page.goto(URL);
    await page.waitForFunction(() => typeof formLogin !== 'undefined' && formLogin.dataset.sesi === 'aktif' && window.RQReel && typeof RQReel.gerbang === 'function', null, { timeout: 25000 }).catch(() => {});
    const siap = await page.evaluate(() => ({ login: !document.getElementById('loginScreen').classList.contains('hidden'), sesi: formLogin.dataset.sesi || null, reel: !!(window.RQReel && RQReel.gerbang) }));
    cek('Bersesi → singgah di layar masuk, gerbang tersedia', siap.login && siap.sesi === 'aktif' && siap.reel, siap);
    if (siap.login && siap.reel) {
      await page.click('#btnLogin');
      await page.waitForFunction(() => APP.profil && !document.querySelector('.rq-gerbang') && document.querySelector('#viewRoot > .stats'), null, { timeout: 25000 });
      await page.waitForFunction(() => document.querySelectorAll('#viewRoot > .stats .stat .v')[1].textContent.trim() === '300', null, { timeout: 12000 });
      const r = await page.evaluate(() => { const c = window.__catat;
        const selamaTertutup = c.filter(x => x[2] && x[3] === 0);            // gerbang masih menutup, belum ada peristiwa
        const pertamaJalan = c.findIndex(x => x[0] !== '0');
        return { peristiwa: window.__ev, bingkaiTertutup: selamaTertutup.length,
          tertahan: selamaTertutup.length > 0 && selamaTertutup.every(x => x[0] === '0' && x[1] === true),
          mulaiSesudahPeristiwa: pertamaJalan > 0 && c[pertamaJalan][3] >= 1,
          akhir: document.querySelectorAll('#viewRoot > .stats .stat .v')[1].textContent.trim(), tahan: document.getElementById('viewRoot').classList.contains('rb-tahan'),
          sambut: document.getElementById('viewRoot').classList.contains('rb-sambut'), tampak: document.querySelectorAll('#viewRoot .stat.rb-tampak').length }; });
      cek('Gerbang mengirim peristiwa rq:gerbang-terbuka satu kali', r.peristiwa === 1, r.peristiwa);
      cek('Selama gerbang menutup: angka tetap 0 dan gerak ditahan', r.tertahan, { bingkai: r.bingkaiTertutup });
      cek('Sesudah gerbang terbuka: tahanan dilepas, mode sambut, angka menghitung sampai 300', r.mulaiSesudahPeristiwa && !r.tahan && r.sambut && r.tampak === 6 && r.akhir === '300', r);
    }
    await ctx.close();
  }

  if (jalan(8)) {
    console.log('\n[8] Lembar baru: Cermin Muhasabah, Cermin per Santri, rincian santri per lembar, Rekap bulan lalu');
    // Harapan dihitung ulang di sini dari rumus data tiruan (bukan dari aplikasi).
    const ini = {}, lalu = {}, agu = {};
    for (let i = 0; i < 500; i++) { const n = '24' + String(i % 120).padStart(6, '0');
      if (i < 300) ini[n] = (ini[n] || 0) + 5;
      else { agu[n] = (agu[n] || 0) + 5; if (1 + (i - 300) % 25 <= 22) lalu[n] = (lalu[n] || 0) + 5; } }
    const semua = Array.from({ length: 120 }, (_, i) => '24' + String(i).padStart(6, '0'));
    const hTurun = semua.filter(n => (lalu[n] || 0) > (ini[n] || 0)).length, hNaik = semua.filter(n => (ini[n] || 0) > (lalu[n] || 0)).length;
    const b = await buka(URL, 'Admin', { kurang: true, viewport: { width: 1366, height: 1200 } });
    const c = await b.page.evaluate(() => { const k = [...document.querySelectorAll('#viewRoot .card')].find(x => x.querySelector('h3')?.textContent === 'Cermin Muhasabah');
      return k ? [...k.querySelectorAll('tbody tr')].map(tr => ({ ini: tr.classList.contains('cm-ini'), sel: [...tr.cells].map(td => td.innerText.replace(/\s+/g, ' ').trim()), buka: tr.querySelector('[data-lembar]')?.dataset.lembar ?? null })) : null; });
    cek('Cermin Muhasabah: enam lembar, September di atas sebagai "lembar ini · s.d. tgl 22"', c && c.length === 6 && c[0].ini && /September 2026/.test(c[0].sel[0]) && /s\.d\. tgl 22/.test(c[0].sel[0]) && /April 2026/.test(c[5].sel[0]), c && c.map(x => x.sel[0]));
    cek('Cermin: September 300 catatan · 1.500 poin · 60 izin · 1.100 pembinaan · 59,5 hlm', c && JSON.stringify(c[0].sel.slice(1)) === '["300","1.500","60","1.100","59,5","0"]', c && c[0].sel);
    cek('Cermin: Agustus dihitung sendiri — 200 catatan · 1.000 poin, tidak terbawa ke September', c && JSON.stringify(c[1].sel.slice(1, 3)) === '["200","1.000"]' && c[1].buka === '2026-08', c && c[1]);
    const cs = await b.page.evaluate(() => { const k = [...document.querySelectorAll('#viewRoot .card')].find(x => x.querySelector('h3')?.textContent === 'Cermin per Santri');
      const kol = (s) => { const e = k.querySelector('.cs-kolom.' + s); return { jumlah: parseInt(e.querySelector('.cs-judul span').textContent), baris: [...e.querySelectorAll('.cs-baris')].map(x => ({ nisn: x.dataset.detail, teks: x.innerText.replace(/\s+/g, ' ').trim() })) }; };
      return k ? { turun: kol('turun'), naik: kol('naik'), kaki: k.querySelector('.sb-kaki').innerText } : null; });
    cek(`Cermin per Santri: ${hTurun} santri poin turun, ${hNaik} naik (dihitung ulang dari data)`, cs && cs.turun.jumlah === hTurun && cs.naik.jumlah === hNaik && cs.naik.baris.length === Math.min(5, hNaik), cs && { turun: cs.turun.jumlah, naik: cs.naik.jumlah });
    const atas = cs && cs.naik.baris[0];
    cek('Baris teratas "poin naik": angka lalu → kini cocok dengan data', !!atas && atas.teks.includes(`${lalu[atas.nisn] || 0} ${ini[atas.nisn] || 0}poin`.replace(' ', ' ')) || (!!atas && new RegExp(`${lalu[atas.nisn] || 0}\\s+${ini[atas.nisn] || 0}\\s*poin`).test(atas.teks)), atas);
    cek('Cermin per Santri menyatakan diri sebagai perbandingan, bukan tren', cs && /perbandingan dua bulan, bukan tren/.test(cs.kaki), cs && cs.kaki);
    // Rincian santri pada lembar September
    const bacaDetail = () => b.page.evaluate(() => { const h = Swal.getHtmlContainer(); if (!h) return null;
      return { lembar: h.querySelector('.detail-lembar')?.innerText.replace(/\s+/g, ' ').trim() || '', on: h.querySelector('.detail-lembar')?.classList.contains('on'),
        poin: h.querySelector('.poin-badge .v')?.textContent.trim(), label4: [...h.querySelectorAll('.poin-badge .k')].map(e => e.textContent.trim())[3],
        cermin: [...h.querySelectorAll('.cm-santri tbody tr')].map(tr => [...tr.cells].map(td => td.innerText.replace(/\s+/g, ' ').trim())),
        linimasa: [...h.querySelectorAll('p.label')].map(e => e.textContent.trim()).find(t => /^Linimasa/.test(t)) || '', bulanPlg: [...new Set([...h.querySelectorAll('.tl-item .when')].map(e => (e.textContent.match(/\d{2} (\w{3}) \d{4}/) || [])[1]))] }; });
    if (atas) {
      await b.page.$eval(`#viewRoot .cs-kolom.naik .cs-baris[data-detail="${atas.nisn}"]`, el => el.dispatchEvent(new MouseEvent('click', { bubbles: true })));
      await b.page.waitForSelector('.swal2-popup .detail-lembar', { timeout: 10000 });
      let d = await bacaDetail();
      cek('Ketuk santri → rincian dibuka pada lembar September; poin = poin bulan itu (bukan akumulasi)', d.on && /Lembar September 2026/.test(d.lembar) && d.poin === String(ini[atas.nisn]) && d.label4 === 'Hlm Tahfiz', d);
      cek('Rincian: linimasa hanya berisi catatan September', d.linimasa === 'Linimasa September 2026' && JSON.stringify(d.bulanPlg) === '["Sep"]', [d.linimasa, d.bulanPlg]);
      cek('Rincian: cermin enam lembar milik santri itu (Sep & Agu sesuai data)', d.cermin.length === 6 && d.cermin[0][2] === String(ini[atas.nisn]) && d.cermin[1][2] === String(agu[atas.nisn] || 0), d.cermin.slice(0, 2));
      await b.page.$eval('.swal2-popup [data-dl="2026-08"]', el => el.dispatchEvent(new MouseEvent('click', { bubbles: true })));
      await b.page.waitForFunction(() => /Lembar Agustus 2026/.test(Swal.getHtmlContainer()?.querySelector('.detail-lembar')?.innerText || ''), null, { timeout: 10000 });
      d = await bacaDetail();
      cek('Rincian: "Buka" pada baris Agustus → lembar Agustus, poin Agustus', d.poin === String(agu[atas.nisn] || 0) && (d.bulanPlg.length === 0 || JSON.stringify(d.bulanPlg) === '["Agu"]'), d);
      await b.page.$eval('.swal2-popup [data-dl="semua"]', el => el.dispatchEvent(new MouseEvent('click', { bubbles: true })));
      await b.page.waitForFunction(() => /seluruh riwayat/i.test(Swal.getHtmlContainer()?.querySelector('.detail-lembar')?.innerText || '') && !Swal.getHtmlContainer().querySelector('.detail-lembar.on'), null, { timeout: 10000 });
      d = await bacaDetail();
      cek('Rincian: "Seluruh riwayat" → poin akumulasi tersimpan, linimasa lengkap', d.poin === String((ini[atas.nisn] || 0) + (agu[atas.nisn] || 0)) && d.linimasa === 'Linimasa Lengkap' && d.label4 === 'Juz Hafal', d);
      await b.page.evaluate(() => Swal.close()); await jeda(b.page, 400);
    }
    // Cermin → buka lembar Agustus → kembali ke bulan ini
    await b.page.$eval('#viewRoot [data-lembar="2026-08"]', el => el.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    await b.page.waitForFunction(() => /Agustus 2026/.test(document.querySelector('#viewRoot .rb-periode')?.innerText || ''), null, { timeout: 10000 });
    const p1 = await b.page.evaluate(() => ({ aktif: APP.periode.aktif, bulan: APP.periode.bulan, tombol: !!document.querySelector('#viewRoot [data-lembar=""]') }));
    cek('Cermin: "Buka" Agustus → seluruh Ringkasan pindah ke lembar Agustus, ada tombol "Bulan ini"', p1.aktif && p1.bulan === '2026-08' && p1.tombol, p1);
    // Guru membuka Rekap bulan lalu → Detail santri = lembar bulan itu
    await b.page.evaluate(() => navigateTo('rekap')); await b.page.waitForSelector('#rkHasil .rekap-item [data-detail]', { timeout: 15000 });
    const nisnRk = await b.page.$eval('#rkHasil .rekap-item [data-detail]', el => el.dataset.detail);
    await b.page.$eval('#rkHasil .rekap-item [data-detail]', el => el.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    await b.page.waitForSelector('.swal2-popup .detail-lembar', { timeout: 10000 });
    const dr = await bacaDetail();
    cek('Rekap (periode Agustus) → Detail: lembar Agustus, poin & linimasa hanya Agustus', dr.on && /Lembar Agustus 2026/.test(dr.lembar) && dr.poin === String(agu[nisnRk] || 0) && JSON.stringify(dr.bulanPlg) === '["Agu"]', { nisnRk, dr });
    await b.page.evaluate(() => Swal.close()); await jeda(b.page, 300);
    await b.page.evaluate(() => navigateTo('dashboard')); await b.page.waitForSelector('#viewRoot [data-lembar=""]', { timeout: 15000 });
    await b.page.$eval('#viewRoot .card-head [data-lembar=""]', el => el.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    await b.page.waitForFunction(() => /September 2026/.test(document.querySelector('#viewRoot .rb-periode')?.innerText || ''), null, { timeout: 10000 });
    cek('"Bulan ini" → kembali ke lembar September, pemilih periode dilepas', await b.page.evaluate(() => !APP.periode.aktif), null);
    await b.page.screenshot({ path: path.join(KELUAR, 'cermin-1366.png') });
    await b.ctx.close();
    // Profil santri tanpa periode: perilaku lama (seluruh riwayat) + tawaran membuka lembar bulan ini
    { const y = await buka(URL, 'Admin', { kurang: true });
      await y.page.evaluate(() => { bukaDetailSantri('24000001'); }); await y.page.waitForSelector('.swal2-popup .detail-lembar', { timeout: 10000 });
      const d = await y.page.evaluate(() => { const h = Swal.getHtmlContainer(); return { on: h.querySelector('.detail-lembar').classList.contains('on'), tombol: h.querySelector('[data-dl]')?.textContent.trim(), linimasa: [...h.querySelectorAll('p.label')].map(e => e.textContent.trim()).find(t => /^Linimasa/.test(t)) || '' }; });
      cek('Tanpa periode & tanpa lembar: rincian tetap seluruh riwayat, dengan tombol "Buka lembar September 2026"', !d.on && d.tombol === 'Buka lembar September 2026' && d.linimasa === 'Linimasa Lengkap', d);
      await y.ctx.close(); }
  }

  cek('Nol galat JS', galat.length === 0, galat.slice(0, 4));
  console.log(`\n${lulus} lulus, ${gagal} gagal`);
  await browser.close(); srv.close(); srvAsli.close();
  process.exit(gagal ? 1 : 0);
})();
