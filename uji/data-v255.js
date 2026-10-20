module.exports=(o={})=>{
 const n=(i,w)=>String(i).padStart(w,'0');
 const KELAS=['VII-D','VIII-D','IX-F','X-C','XI-C','XII-D','VII-E','X-D'];
 const NAMA=['Ahmad Luthfi','Daffa Novri','Muhammad Alif','Teuku Akhdan','Syauqi Zawawi','Muhammad Zahril','Khairul Fuadi','Hammam Salim','Rafif Aqil','Zaki Mubarak','Farhan Hakim','Aulia Rahman'];
 const siswa=Array.from({length:180},(_,i)=>({nisn:'25'+n(i,6),nama_siswa:(NAMA[i%12]+' '+String.fromCharCode(65+(i%26))).toUpperCase(),kelas:KELAS[i%8],jenjang:/^(VII|VIII|IX)/.test(KELAS[i%8])?'MTs':'MA',status_santri:'Aktif',unit_gender:'putra',jenis_kelamin:'L',no_hp_orang_tua:'0812'+n(i,7),total_poin_pelanggaran:0,updated_at:'2026-08-01T00:00:00Z'}));
 const JEN=[['Terlambat shalat berjamaah','Ubudiyah','Ringan',5],['Tidak memakai atribut lengkap','Kedisiplinan','Ringan',5],['Berbicara bahasa daerah','Bahasa','Ringan',5],['Kamar tidak rapi','Kebersihan','Ringan',5],['Keluar kompleks tanpa izin','Keamanan','Sedang',15],['Membawa HP','Keamanan','Berat',30],['Tidur saat halaqah','Ubudiyah','Ringan',5]];
 const det=[];let id=0;
 const tambah=(bulan,hari,jml)=>{for(let k=0;k<jml;k++){const j=JEN[(k*7+id)%JEN.length];const s=(k*13+id*3)%180;const d=1+(k%hari);
  det.push({id_log:'L'+n(id++,6),nisn:siswa[s].nisn,nama_siswa:siswa[s].nama_siswa,kelas:siswa[s].kelas,tanggal:`2026-${bulan}-${n(d,2)}`,kategori:j[2],bobot_pelanggaran:j[3],nama_pelanggaran:j[0],bidang:j[1],unit:'Pengasuhan',status:'Active',created_at:`2026-${bulan}-${n(d,2)}T08:00:00Z`,updated_at:`2026-${bulan}-${n(d,2)}T08:00:00Z`});}};
 tambah('08',31,170); tambah('09',30,430); tambah('10',20,260);
 const pb=[];let ip=0;
 const bina=(bulan,hari,jml,prosesTiap)=>{for(let k=0;k<jml;k++){const s=(k*11+ip)%180;const d=1+(k%hari);const kat=k%7===3?'Berat':['Ringan','Ringan','Sedang'][k%3];
  pb.push({id_pembinaan:'PBN'+n(ip++,5),nisn:siswa[s].nisn,tanggal_pembinaan:`2026-${bulan}-${n(d,2)}`,kategori:kat,pengulangan_ke:kat==='Berat'?1:kat==='Ringan'?(k%5===0?11:3):(k%4===0?8:2),id_log_pelanggaran:null,nama_siswa_uji:siswa[s].nama_siswa,bentuk_pembinaan:'Nasihat dan membaca surat Yasin',status_pembinaan:(k%prosesTiap===0)?'Proses':'Selesai',status_record:'Active',mode_pembinaan:'Individu',dipicu_oleh:'otomatis',updated_at:`2026-${bulan}-${n(d,2)}T09:00:00Z`,dibuat_pada:`2026-${bulan}-${n(d,2)}T09:00:00Z`});}};
 bina('08',31,60,9); bina('09',30,140,6); bina('10',20,90,3);
 const izin=[];for(let i=0;i<120;i++){const b=['08','09','10'][i%3];const d=1+i%20;izin.push({id_izin:'IZN'+n(i,4),nisn:siswa[i%180].nisn,tanggal_mulai:`2026-${b}-${n(d,2)}`,tanggal_selesai:`2026-${b}-${n(Math.min(28,d+2),2)}`,status_persetujuan:i%9===0?'Pending':i%5===0?'Telat Balik':'Sesuai Waktu',updated_at:`2026-${b}-01T00:00:00Z`});}
 const thf=[];for(let i=0;i<160;i++){const b=['08','09','10'][i%3];thf.push({id:i+1,nisn:siswa[i%180].nisn,kelas:siswa[i%180].kelas,jenjang:'MTs',tanggal:`2026-${b}-${n(1+i%20,2)}`,jenis:i%2?'Ziyadah':'Murajaah',capaian_halaman:1+(i%3)*.5,kelancaran:'Jayyid',status:'Active'});}
 const prs=[];for(let i=0;i<40;i++){const b=['09','10'][i%2];prs.push({id:i+1,nisn:siswa[(i*5)%180].nisn,tanggal:`2026-${b}-${n(1+i%20,2)}`,nama_prestasi:'Membantu kebersihan',poin:5,status:'Active'});}
 return {
  profiles:[{id:'u-admin',nama:'Nyak Al Azwansyah, S.Sos.',aktif:true,kelas_binaan:[],unit_akses:null,jenjang_akses:null,korps:null,role:'Admin'}],
  siswa, detail_data:det, log_pelanggaran:det, log_pembinaan:pb, log_perizinan:izin, log_tahfiz:thf, log_prestasi:prs,
  goal_santri:[],target_tahfiz:[],wa_kontak:[],wa_log:[],audit_log:[],master_pembinaan:[
   ...Array.from({length:15},(_,i)=>({id_aturan:'R'+(i+1),kategori:'Ringan',pengulangan_ke:i+1,bentuk_pembinaan:'Bentuk Ringan ke-'+(i+1),aktif:true,unit_gender:'putra'})),
   ...Array.from({length:12},(_,i)=>({id_aturan:'S'+(i+1),kategori:'Sedang',pengulangan_ke:i+1,bentuk_pembinaan:'Bentuk Sedang ke-'+(i+1),aktif:true,unit_gender:'putra'})),
   ...Array.from({length:4},(_,i)=>({id_aturan:'B'+(i+1),kategori:'Berat',pengulangan_ke:i+1,bentuk_pembinaan:'Pemanggilan orang tua ke-'+(i+1),aktif:true,unit_gender:'putra'}))]
 };
};
