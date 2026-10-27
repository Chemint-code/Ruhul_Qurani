/* Supabase tiruan untuk uji (asal: Chemint/2.43/harness.js), ditambah data
   bulan Oktober agar grafik Ringkasan/Analitik berisi. */
const MOCK = `
(function(){
  const JEDA = 120;
  const n = (i, w) => String(i).padStart(w, '0');
  const KELAS = ['VII-D','VIII-D','IX-F','X-C','XI-C','XII-D','VII-A','X-A'];
  const BLN = ['2026-08','2026-09','2026-10'];
  const T = {
    profiles: [
      { id:'u-admin', nama:'Nyak Al Azwansyah, S.Sos.', aktif:true, kelas_binaan:(window.__KELAS||[]), unit_akses:null, jenjang_akses:null, korps:(window.__KORPS||null), role:(window.__PERAN||'Admin') },
      { id:'11111111-1111-1111-1111-111111111111', nama:'Ust. Musyrif Satu', aktif:true, kelas_binaan:['VIII-D'], korps:null, role:'Guru' },
      { id:'22222222-2222-2222-2222-222222222222', nama:'Ustz. Musyrifah Dua', aktif:true, kelas_binaan:['IX-F','XII-D'], korps:null, role:'Guru' },
      { id:'33333333-3333-3333-3333-333333333333', nama:'Ust. Tanpa Nomor', aktif:true, kelas_binaan:['X-C'], korps:null, role:'Guru' }
    ],
    siswa: Array.from({length:120},(_,i)=>({ nisn:'24'+n(i,6), nama_siswa:'Santri '+i, kelas:KELAS[i%8], jenjang:i%2?'MA':'MTs', status:'Aktif', status_santri:'Aktif', unit_gender:(/-(A|B)$/.test(KELAS[i%8]))?'putri':'putra', total_poin_pelanggaran:i*2, updated_at:'2026-09-01T00:00:00Z' })),
    detail_data: Array.from({length:1250},(_,i)=>({ id_log:'L'+n(i,5), nisn:'24'+n(i%120,6), nama_siswa:'Santri '+(i%120), kelas:KELAS[(i%120)%8], tanggal:BLN[i%3]+'-'+n(1+((i*i+3*i)%26),2), kategori:['Ringan','Sedang','Berat'][i%3], bidang:['Ibadah','Kedisiplinan','Akhlak','Kebersihan'][i%4], poin:[5,10,15][i%3], nama_pelanggaran:'Uji '+(i%9), status:'Active', sumber:(i%25?'Pengasuhan':'Madrasah'), updated_at:new Date(Date.UTC(2026,8,2)+i*60000).toISOString() })),
    log_pembinaan: Array.from({length:1100},(_,i)=>({ id_pembinaan:'PBN'+n(i,5), nisn:'24'+n(i%120,6), tanggal_pembinaan:BLN[i%3]+'-'+n(1+i%26,2), kategori:'Ringan', status_pembinaan:(i%7?'Selesai':'Proses'), status_record:'Active', updated_at:'2026-09-02T00:00:00Z' })),
    log_perizinan: Array.from({length:60},(_,i)=>({ id_izin:'IZN'+n(i,4), nisn:'24'+n(i%120,6), tanggal_mulai:BLN[i%3]+'-'+n(1+i%20,2), status_persetujuan:i%4?'Sesuai Waktu':'Pending', updated_at:'2026-09-02T00:00:00Z' })),
    log_tahfiz: Array.from({length:40},(_,i)=>({ id:i+1, nisn:'24'+n(i%120,6), kelas:KELAS[(i%120)%8], jenjang:'MTs', tanggal:BLN[i%3]+'-'+n(1+i%20,2), jenis:i%2?'Ziyadah':'Murajaah', capaian_halaman:1+(i%3)*.5, kelancaran:i%4?'Jayyid':'Mumtaz', status:'Active' })),
    goal_santri: [], target_tahfiz: [],
    wa_kontak: [], wa_log: [], audit_log: []
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
      or(s){ const parts=s.split(',').map(p=>{const [c,,pat]=p.split('.'); const t=(pat||'').replace(/\\*/g,'').toLowerCase(); return r=>String(r[c]??'').toLowerCase().includes(t);}); f.push(r=>parts.some(fn=>fn(r))); return b; },
      ilike(k,v){ const t=v.replace(/[%*]/g,'').toLowerCase(); f.push(r=>String(r[k]??'').toLowerCase().includes(t)); return b; },
      contains(){ return b; }, filter(){ return b; }, match(){ return b; },
      order(k,o){ urut.push([k,o?.ascending!==false]); return b; },
      range(a,z){ rentang=[a,z]; return b; }, limit(x){ batas=x; return b; },
      single(){ satu=true; return b; }, maybeSingle(){ satu=true; return b; },
      then(ok,gagal){
        __LOG.push({ t:tabel, kolom });
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
  const sesi = window.__TANPASESI ? null : { user:{ id:'u-admin', email:'admin@x' }, access_token:'t' };
  window.supabase = { createClient: () => ({
    from: q,
    rpc: (nama, arg) => { __LOG.push({ t:'rpc:'+nama, arg }); const f = window.__RPC && window.__RPC[nama]; return new Promise(r=>setTimeout(()=>r(f ? f(arg) : {data:null,error:null}),JEDA)); },
    auth: { getSession: async()=>({data:{session:sesi}}), getUser: async()=>({data:{user:sesi&&sesi.user}}),
            onAuthStateChange: ()=>({data:{subscription:{unsubscribe(){}}}}), signOut: async()=>({}), signInWithPassword: async()=>({data:{},error:null}) },
    channel: () => { const c={ on(){return c;}, subscribe(cb){ cb&&cb('SUBSCRIBED'); return c; } }; return c; },
    removeChannel(){},
    functions: { invoke: async()=>({data:null,error:null}) },
    storage: { from: () => ({ getPublicUrl:(p)=>({data:{publicUrl:'data:,'}}), list: async()=>({data:[],error:null}), upload: async()=>({error:null}), download: async()=>({data:null,error:null}), createSignedUrl: async()=>({data:null,error:null}) }) }
  }) };
})();`;
module.exports = { MOCK };
