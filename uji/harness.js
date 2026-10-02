/* uji-v237.js — tombol Ingatkan Musyrif: pratinjau, angka = dasbor, kirim, hasil per musyrif, animasi pesawat (aplikasi UTUH, Supabase tiruan). node uji-v237.js */
const fs = require('fs'), path = require('path'), http = require('http');
const { chromium } = require('playwright');
const DIR = process.env.RQDIR || __dirname, CDN = '/tmp/cdn/node_modules';

const MOCK = `
(function(){
  const JEDA = 250;
  const n = (i, w) => String(i).padStart(w, '0');
  const KELAS = ['VII-D','VIII-D','IX-F','X-C','XI-C','XII-D','VII-A','X-A'];
  const T = {
    profiles: [
      { id:'u-admin', nama:'Nyak Al Azwansyah, S.Sos.', aktif:true, kelas_binaan:(window.__KELAS||[]), unit_akses:null, jenjang_akses:null, korps:(window.__KORPS||null), role:(window.__PERAN||'Admin') },
      { id:'11111111-1111-1111-1111-111111111111', nama:'Ust. Musyrif Satu', aktif:true, kelas_binaan:['VIII-D'], korps:null, role:'Guru' },
      { id:'22222222-2222-2222-2222-222222222222', nama:'Ustz. Musyrifah Dua', aktif:true, kelas_binaan:['IX-F','XII-D'], korps:null, role:'Guru' },
      { id:'33333333-3333-3333-3333-333333333333', nama:'Ust. Tanpa Nomor', aktif:true, kelas_binaan:['X-C'], korps:null, role:'Guru' },
      { id:'44444444-4444-4444-4444-444444444444', nama:'Walas Bukan Musyrif', aktif:true, kelas_binaan:['XI-C'], korps:null, role:'Walas' }
    ],
    siswa: Array.from({length:120},(_,i)=>({ nisn:'24'+n(i,6), nama_siswa:'Santri '+i, kelas:KELAS[i%8], jenjang:i%2?'MA':'MTs', status:'Aktif', unit_gender:(/-(A|B)$/.test(KELAS[i%8])||(/^(VII|VIII|IX)-C$/.test(KELAS[i%8]))?'putri':'putra'), total_poin_pelanggaran:i*2, updated_at:'2026-09-01T00:00:00Z' })),
    detail_data: Array.from({length:1250},(_,i)=>({ id_log:'L'+n(i,5), nisn:'24'+n(i%120,6), nama_siswa:'Santri '+(i%120), kelas:KELAS[(i%120)%8], tanggal:'2026-09-'+n(1+i%20,2), kategori:['Ringan','Sedang','Berat'][i%3], nama_pelanggaran:'Uji', status:'Active', updated_at:new Date(Date.UTC(2026,8,2)+i*60000).toISOString() })),
    log_pembinaan: Array.from({length:1100},(_,i)=>({ id_pembinaan:'PBN'+n(i,5), nisn:'24'+n(i%120,6), tanggal_pembinaan:'2026-09-'+n(1+i%20,2), kategori:'Ringan', status_pembinaan:(typeof window.__PROSES==='number' ? (i<window.__PROSES?'Proses':'Selesai') : (i%7?'Selesai':'Proses')), status_record:'Active', updated_at:'2026-09-02T00:00:00Z' })),
    log_perizinan: Array.from({length:60},(_,i)=>({ id_izin:'IZN'+n(i,4), nisn:'24'+n(i%120,6), tanggal_mulai:'2026-09-'+n(1+i%20,2), status_persetujuan:i%4?'Sesuai Waktu':'Pending', updated_at:'2026-09-02T00:00:00Z' })),
    log_tahfiz: Array.from({length:40},(_,i)=>({ id:i+1, nisn:'24'+n(i%120,6), kelas:KELAS[(i%120)%8], jenjang:'MTs', tanggal:'2026-09-'+n(1+i%20,2), jenis:i%2?'Ziyadah':'Murajaah', capaian_halaman:1+(i%3)*.5, kelancaran:i%4?'Jayyid':'Mumtaz', status:'Active' })),
    goal_santri: Array.from({length:14},(_,i)=>({ id:i+1, nisn:'24'+n(i*7%120,6), periode:'2026-09', judul:'Target '+i, status:['Tercapai','Sebagian','Belum Tercapai','Berjalan'][i%4] })),
    target_tahfiz: Array.from({length:10},(_,i)=>({ id:i+1, nisn:'24'+n(i*6%120,6), periode:'2026-09', target_halaman:2+i%3 })),
    wa_kontak: [{ profile_id:'11111111-1111-1111-1111-111111111111', no_wa:'6281111111111' }, { profile_id:'22222222-2222-2222-2222-222222222222', no_wa:'6282222222222' }],
    wa_log: [],
    audit_log: Array.from({length:3200},(_,i)=>({ id:i+1, waktu:new Date(Date.UTC(2026,8,22,0,0,0)-i*60000).toISOString(), tabel:['log_pelanggaran','log_pembinaan','log_perizinan'][i%3], aksi:['INSERT','UPDATE','DELETE'][i%3], baris_id:'X'+i, nisn:'24'+n(i%120,6), user_nama:'Musyrif '+(i%7), user_role:'Musyrif', ringkas:'Ringkasan '+i, dihapus_pada:null, data_lama:{a:1}, data_baru:{a:2} }))
  };
  window.__LOG = [];
  function q(tabel){
    const f=[]; let urut=[], rentang=null, batas=null, satu=false, opsi={}, kolom='*', ubah=null;
    const b = {
      select(k,o){ if(k) kolom=k; opsi=o||{}; return b; },
      insert(){ ubah='insert'; return b; }, update(){ ubah='update'; return b; }, upsert(){ ubah='upsert'; return b; }, delete(){ ubah='delete'; return b; },
      eq(k,v){ f.push(r=>String(r[k])===String(v)); return b; }, neq(k,v){ f.push(r=>r[k]!==v); return b; },
      gt(k,v){ f.push(r=>r[k]>v); return b; }, gte(k,v){ f.push(r=>r[k]>=v); return b; },
      lt(k,v){ f.push(r=>r[k]<v); return b; }, lte(k,v){ f.push(r=>r[k]<=v); return b; },
      in(k,v){ f.push(r=>v.map(String).includes(String(r[k]))); return b; },
      is(k,v){ f.push(r=>(r[k]??null)===v); return b; },
      not(k,op,v){ if(op==='is') f.push(r=>(r[k]??null)!==v); return b; },
      or(s){ const parts=s.split(',').map(p=>{const [c,,pat]=p.split('.'); const t=pat.replace(/\\*/g,'').toLowerCase(); return r=>String(r[c]??'').toLowerCase().includes(t);}); f.push(r=>parts.some(fn=>fn(r))); return b; },
      ilike(k,v){ const t=v.replace(/[%*]/g,'').toLowerCase(); f.push(r=>String(r[k]??'').toLowerCase().includes(t)); return b; },
      contains(){ return b; }, filter(){ return b; }, match(){ return b; },
      order(k,o){ urut.push([k,o?.ascending!==false]); return b; },
      range(a,z){ rentang=[a,z]; return b; }, limit(x){ batas=x; return b; },
      single(){ satu=true; return b; }, maybeSingle(){ satu=true; return b; },
      then(ok,gagal){
        __LOG.push({ t:tabel, kolom, opsi:JSON.stringify(opsi), rentang });
        let rows=(T[tabel]||[]).filter(r=>f.every(fn=>fn(r)));
        const jumlah=rows.length;
        rows.sort((x,y)=>{for(const [k,a] of urut){if(x[k]<y[k])return a?-1:1;if(x[k]>y[k])return a?1:-1;}return 0;});
        if(rentang) rows=rows.slice(rentang[0], Math.min(rentang[1]+1, rentang[0]+1000));
        if(batas) rows=rows.slice(0,batas);
        if(!rentang && !batas) rows=rows.slice(0,1000);
        if(/siswa\\(/.test(kolom)) rows=rows.map(r=>{ const sw=T.siswa.find(x=>x.nisn===r.nisn)||{}; return {...r, siswa:{nama_siswa:sw.nama_siswa||'x',kelas:sw.kelas||'y',jenjang:sw.jenjang||'z'}}; });
        else if(kolom!=='*' && !/\\*/.test(kolom)) { const ks=kolom.split(',').map(s=>s.trim()); rows=rows.map(r=>Object.fromEntries(ks.map(k=>[k,r[k]]))); }
        let data = opsi.head ? null : rows.map(r=>({...r}));
        if(satu) data = data ? (data[0]||null) : null;
        if(ubah) data = satu ? {} : [];
        const hasil={ data, error:null, count: opsi.count ? jumlah : null };
        return new Promise(r=>setTimeout(()=>r(hasil), JEDA)).then(ok,gagal);
      }
    };
    return b;
  }
  const sesi = window.__TANPASESI ? null : { user:{ id:(window.__SAYA||'u-admin'), email:'admin@x' }, access_token:'t' };
  window.supabase = { createClient: () => ({
    from: q,
    rpc: (nama, arg) => {
      __LOG.push({ t:'rpc:'+nama, arg });
      if (nama === 'ingatkan_musyrif_kirim') {
        window.__RPC = (window.__RPC||[]).concat([arg]);
        if (window.__RPC_GAGAL) return new Promise(r=>setTimeout(()=>r({ data:null, error:{ message:'WA bot sedang tidak aktif (wa_setelan.aktif). Gunakan kirim manual.' } }),JEDA));
        const batch = 'ING-UJI-' + window.__RPC.length;
        // bot tiruan: musyrif pertama terkirim, sisanya gagal (Fonnte menolak)
        (arg.p_kiriman||[]).forEach((k,i)=>setTimeout(()=>T.wa_log.push({ jenis:'ingatkan', ref_id:batch, profile_id:k.profile_id,
          status: i===0 ? 'terkirim' : 'gagal', respons: i===0 ? { fonnte:{ status:true } } : { fonnte:{ status:false, reason:'device disconnected' } } }), 700 + i*500));
        return new Promise(r=>setTimeout(()=>r({ data:{ batch, diantrikan:(arg.p_kiriman||[]).length, ditolak:[] }, error:null }),JEDA));
      }
      if (nama === 'kehadiran_analisis') {
        const rows = [], pekan = [];
        ['VIII-D','IX-F','X-C'].forEach(k => [1,2,3].forEach(m => pekan.push({ kelas:k, tahun:2026, bulan:9, minggu:m, status:'selesai' })));
        T.siswa.filter(s=>['VIII-D','IX-F','X-C'].includes(s.kelas)).forEach((s,i)=>{ if (i%3===0) rows.push({ nisn:s.nisn, kelas:s.kelas, tahun:2026, bulan:9, minggu:1+i%3, alpa:2, berizin:i%2 }); });
        return new Promise(r=>setTimeout(()=>r({ data:{ rows, pekan }, error:null }),JEDA));
      }
      return new Promise(r=>setTimeout(()=>r({data:null,error:null}),JEDA));
    },
    auth: { getSession: async()=>({data:{session:sesi}}), getUser: async()=>({data:{user:sesi&&sesi.user}}),
            onAuthStateChange: ()=>({data:{subscription:{unsubscribe(){}}}}), signOut: async()=>({}), signInWithPassword: async()=>({data:{},error:null}) },
    channel: () => { const c={ on(){return c;}, subscribe(cb){ cb&&cb('SUBSCRIBED'); return c; } }; return c; },
    removeChannel(){},
    storage: { from: () => ({ getPublicUrl:(p)=>({data:{publicUrl:'data:,'}}), list: async()=>({data:[],error:null}), upload: async()=>({error:null}), download: async()=>({data:null,error:null}) }) }
  }) };
})();`;

const JENIS = { '.html':'text/html', '.js':'application/javascript', '.css':'text/css', '.webmanifest':'application/json', '.png':'image/png' };
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  const f = path.join(DIR, p === '/' ? 'index.html' : p);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': JENIS[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});

let lulus = 0, gagal = 0;
const cek = (j, ok, info) => { ok ? lulus++ : gagal++; console.log(`${ok ? '  ok  ' : ' GAGAL'} ${j}${info !== undefined ? '  · ' + JSON.stringify(info) : ''}`); };
const semuaGalat = [];

async function bukaHalaman(browser, url, o = {}) {
  const { viewport = { width: 1280, height: 800 }, baru = false, turSudah = false, reduced = false, hemat = false, mobile = false, peran = null } = o;
  const ctx = await browser.newContext({ viewport, serviceWorkers: 'block', reducedMotion: reduced ? 'reduce' : 'no-preference', isMobile: mobile, hasTouch: mobile });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, async (route) => {
    const u = route.request().url();
    if (u.includes('supabase-js')) return route.fulfill({ contentType: 'application/javascript', body: (module.exports.MOCK || MOCK) });
    if (u.includes('sweetalert2')) return route.fulfill({ contentType: 'application/javascript', path: CDN + '/sweetalert2/dist/sweetalert2.all.min.js' });
    if (u.includes('chart.js')) return route.fulfill({ contentType: 'application/javascript', path: CDN + '/chart.js/dist/chart.umd.min.js' });
    if (u.includes('html2pdf')) return route.fulfill({ contentType: 'application/javascript', body: 'window.html2pdf=function(){return {set(){return this},from(){return this},toPdf(){return this},get(){return Promise.resolve({})},save(){return Promise.resolve()}}}' });
    return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
  });
  const page = await ctx.newPage();
  page.on('pageerror', e => semuaGalat.push('pageerror: ' + e.message + ' @ ' + String(e.stack).split('\n').slice(1,4).join(' | ')));
  page.on('console', m => { if (m.type() === 'error') semuaGalat.push('console: ' + m.text()); });
  await page.addInitScript((a) => {
    Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 });
    try { localStorage.setItem('rq-efek-pilih', a.hemat ? 'hemat' : 'penuh'); if (a.turSudah) localStorage.setItem('rq.tur.v1.u-admin', '{"t":0}'); } catch (e) {}
    window.__BARU = a.baru; if (a.peran) window.__PERAN = a.peran; if (a.saya) window.__SAYA = a.saya; if (a.kelas) window.__KELAS = a.kelas; if (a.korps) window.__KORPS = a.korps; if (a.tanpaSesi) window.__TANPASESI = true;
  }, { baru, turSudah, hemat, peran, saya: o.saya || null, kelas: o.kelas || null, korps: o.korps || null, tanpaSesi: !!o.tanpaSesi });
  if (o.init) await page.addInitScript(o.init);
  if (o.cpu) { const c = await ctx.newCDPSession(page); await c.send('Emulation.setCPUThrottlingRate',{rate:o.cpu}); page.__cdp=c; }
  await page.goto(url);
  if (o.tanpaSesi) { await page.waitForTimeout(o.tunggu || 2500); return { ctx, page }; }
  await page.waitForFunction(() => typeof APP !== 'undefined' && APP.profil && document.querySelector('#viewRoot .stats, #viewRoot .card'), null, { timeout: 20000 });
  return { ctx, page };
}
const tunggu = (page, fn, arg, ms = 15000) => page.waitForFunction(fn, arg, { timeout: ms });


module.exports={ringkas:()=>console.log(`${lulus} lulus, ${gagal} gagal`),server,bukaHalaman,tunggu,cek,semuaGalat,MOCK,CDN,chromium,fs,path};
