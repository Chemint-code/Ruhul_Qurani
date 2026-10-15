-- =====================================================================
-- v2.54 — ASATIDZ: galeri para pendidik + profil progres (aditif)
-- ---------------------------------------------------------------------
-- Tiga fungsi BARU. Tidak ada tabel, kolom, trigger, atau RLS yang diubah.
--
--   _jejak_pendidik(p_dari)      internal, satu aliran "siapa mencatat apa"
--                                dari 7 tabel. Tidak bisa dipanggil klien.
--   tim_pendidik_rpc()           galeri: semua pendidik + denyut 30 hari.
--   profil_pendidik_rpc(p_guru)  profil satu pendidik: progres kelas
--                                binaan, aktivitas 84 hari, jejak terbaru.
--
-- Hak baca (keputusan pemilik, 15 Okt 2026):
--   · Semua akun login melihat ANGKA RINGKAS tanpa nama santri.
--   · Nama santri hanya untuk Admin, Pimpinan, Wakasis, Guru BK (kelas
--     binaannya sendiri), dan pendidik itu sendiri.
--   · Untuk penonton tanpa hak nama, ringkasan pelanggaran/pembinaan di
--     jejak juga dikosongkan (kelas + waktu + jenis bisa menunjuk orang).
--
-- PREFLIGHT (read-only, 15 Okt 2026, sebelum migrasi):
--   · Fungsi bernama %pendidik%/%asatidz%/%tim% : tidak ada.
--   · profiles aktif 24; pendidik menurut aturan di bawah 21
--     (tanpa Osis "OSDA-RQ" dan Admin tanpa korps "Ibu Bendahara").
--   · foto_aset profil_guru aktif: 15 akun punya foto.
--   · log_pelanggaran.status: Active 1821 / Archived 22.
--   · log_pembinaan.status_pembinaan: Selesai 1105 (semua punya
--     diselesaikan_pada & pembina_id) / Dalam Proses 717.
--   · log_prestasi.status: Active 108 / archived 1. log_tahfiz: Active 51.
--   · siswa.status_santri: Aktif 734 (putra 400, putri 334).
--   · Catatan tertua: log_pembinaan 2026-08-12.
--   · RLS log_pelanggaran/log_pembinaan membatasi Guru ke kelas binaannya
--     → tanpa RPC, profil guru lain terbaca nol. Itu alasan RPC ini.
-- =====================================================================

create or replace function public._jejak_pendidik(p_dari timestamptz)
returns table(guru uuid, jenis text, waktu timestamptz, nisn text, kelas text, ringkas text)
language sql stable security definer set search_path = ''
as $$
  select l.dibuat_oleh, 'pelanggaran', l.created_at, l.nisn, null::text,
         coalesce(m.nama_pelanggaran, l.kode_pelanggaran)
    from public.log_pelanggaran l
    left join public.master_pelanggaran m on m.kode_pelanggaran = l.kode_pelanggaran
   where l.dibuat_oleh is not null and l.created_at >= p_dari
     and coalesce(l.status, 'Active') <> 'Archived'
  union all
  select p.pembina_id, 'pembinaan', p.diselesaikan_pada, p.nisn, null,
         coalesce(nullif(p.bentuk_pembinaan, ''), 'Pembinaan ' || coalesce(p.kategori, ''))
    from public.log_pembinaan p
   where p.status_pembinaan = 'Selesai' and p.pembina_id is not null and p.diselesaikan_pada >= p_dari
  union all
  select r.pencatat_id, 'prestasi', r.dibuat, r.nisn, r.kelas, r.judul
    from public.log_prestasi r
   where r.pencatat_id is not null and r.dibuat >= p_dari and lower(coalesce(r.status, 'active')) <> 'archived'
  union all
  select t.musyrif_id, 'tahfiz', t.dibuat, t.nisn, t.kelas, concat_ws(' · ', t.jenis, t.surah)
    from public.log_tahfiz t
   where t.musyrif_id is not null and t.dibuat >= p_dari and lower(coalesce(t.status, 'active')) <> 'archived'
  union all
  select z.dibuat_oleh, 'izin', z.created_at, z.nisn, null, coalesce(nullif(z.jenis_izin, ''), 'Izin')
    from public.log_perizinan z
   where z.dibuat_oleh is not null and z.created_at >= p_dari
  union all
  select c.user_id, 'laporan', c.waktu, c.nisn, c.kelas, 'Laporan ' || coalesce(c.periode, '')
    from public.log_cetak_laporan c
   where c.user_id is not null and c.waktu >= p_dari
  union all
  -- Presensi madrasah ditulis per santri per pekan → satu peristiwa per kelas-pekan.
  select d.dicatat_oleh, 'presensi', max(d.diperbarui), null, d.kelas,
         'Presensi pekan ' || d.minggu || ' · ' || count(*) || ' santri'
    from public.data_presensi d
   where d.dicatat_oleh is not null and d.diperbarui >= p_dari
   group by d.dicatat_oleh, d.kelas, d.tahun, d.bulan, d.minggu
$$;

revoke all on function public._jejak_pendidik(timestamptz) from public, anon, authenticated;

comment on function public._jejak_pendidik(timestamptz) is
  'v2.54 (internal): aliran aktivitas pendidik dari 7 tabel log. Hanya dipanggil RPC SECURITY DEFINER v2.54.';

/* ---------------------------------------------------------------------
 * Siapa yang dihitung "pendidik".
 * ------------------------------------------------------------------- */
create or replace function public._pendidik(p_role text, p_korps text)
returns boolean language sql immutable set search_path = ''
as $$
  select p_role in ('Pimpinan','Wakasis','Guru','Walas','Guru BK','Guru Piket','Ustadz GEN-Z')
      or (p_role = 'Admin' and nullif(p_korps, '') is not null)
$$;
revoke all on function public._pendidik(text, text) from public, anon, authenticated;

/* ---------------------------------------------------------------------
 * GALERI
 * ------------------------------------------------------------------- */
create or replace function public.tim_pendidik_rpc()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_hari  date := (now() at time zone 'Asia/Jakarta')::date;
  v_bulan date := date_trunc('month', (now() at time zone 'Asia/Jakarta'))::date;
  v_hasil jsonb;
begin
  if auth.uid() is null or public.my_role() = '' then
    raise exception 'Akses ditolak.';
  end if;

  with g as (
    select p.id, p.nama, p.role, p.korps, coalesce(p.kelas_binaan, '{}') kelas_binaan
      from public.profiles p
     where p.aktif and public._pendidik(p.role, p.korps)
  ),
  f as (
    select distinct on (fa.relasi_id) fa.relasi_id, fa.url_publik, fa.ukuran_kb
      from public.foto_aset fa
     where fa.kategori = 'profil_guru' and fa.is_aktif
     order by fa.relasi_id, fa.tanggal_upload desc
  ),
  j as (
    select x.guru, x.waktu, (x.waktu at time zone 'Asia/Jakarta')::date hari
      from public._jejak_pendidik('2000-01-01'::timestamptz) x
     where x.guru in (select id from g)
  ),
  s as (select kelas, count(*) n from public.siswa where status_santri = 'Aktif' group by kelas),
  semua as (select count(*) n from public.siswa where status_santri = 'Aktif')
  select jsonb_build_object(
    'hari', v_hari,
    'santri_aktif', (select n from semua),
    'kelas_aktif', (select count(*) from s),
    'pendidik', coalesce(jsonb_agg(jsonb_build_object(
      'id', g.id, 'nama', g.nama, 'role', g.role, 'korps', g.korps,
      'kelas_binaan', to_jsonb(g.kelas_binaan),
      'foto', f.url_publik, 'foto_kb', f.ukuran_kb,
      'santri', case when g.role = 'Pimpinan' and cardinality(g.kelas_binaan) = 0
                     then (select n from semua)
                     else (select coalesce(sum(s.n), 0) from s where s.kelas = any(g.kelas_binaan)) end,
      'aktivitas_30', (select count(*) from j where j.guru = g.id and j.hari > v_hari - 30),
      'hari_aktif_30', (select count(distinct j.hari) from j where j.guru = g.id and j.hari > v_hari - 30),
      'bulan_ini', (select count(*) from j where j.guru = g.id and j.hari >= v_bulan),
      'sepanjang', (select count(*) from j where j.guru = g.id),
      'terakhir', (select max(j.waktu) from j where j.guru = g.id),
      'denyut', (select jsonb_agg(coalesce(c.n, 0) order by d.h)
                   from generate_series(v_hari - 29, v_hari, interval '1 day') d(h)
                   left join (select j.hari, count(*) n from j where j.guru = g.id group by j.hari) c on c.hari = d.h::date)
    ) order by g.nama), '[]'::jsonb)
  ) into v_hasil
  from g left join f on f.relasi_id = g.id::text;

  return v_hasil;
end;
$$;

revoke all on function public.tim_pendidik_rpc() from public, anon;
grant execute on function public.tim_pendidik_rpc() to authenticated;
comment on function public.tim_pendidik_rpc() is
  'v2.54: galeri Asatidz. Semua akun login. Tanpa data santri perorangan.';

/* ---------------------------------------------------------------------
 * PROFIL SATU PENDIDIK
 * ------------------------------------------------------------------- */
create or replace function public.profil_pendidik_rpc(p_guru uuid)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_saya        uuid := auth.uid();
  v_role_saya   text := public.my_role();
  v_binaan_saya text[];
  v_g           record;
  v_hari        date := (now() at time zone 'Asia/Jakarta')::date;
  v_bulan       date := date_trunc('month', (now() at time zone 'Asia/Jakarta'))::date;
  v_lalu        date;
  v_lalu_batas  date;
  v_awal_data   date;
  v_lingkup     text[];
  v_jenis_lingk text;
  v_nama_semua  boolean;
  v_foto        text;
  v_kelas       jsonb;
  v_total       jsonb;
  v_tren        jsonb;
  v_perhatian   jsonb;
  v_bintang     jsonb;
  v_jejak       jsonb;
  v_ringkas     jsonb;
begin
  if v_saya is null or v_role_saya = '' then
    raise exception 'Akses ditolak.';
  end if;

  select p.id, p.nama, p.role, p.korps, coalesce(p.kelas_binaan, '{}') kelas_binaan
    into v_g
    from public.profiles p
   where p.id = p_guru and p.aktif and public._pendidik(p.role, p.korps);
  if not found then
    raise exception 'Profil pendidik tidak ditemukan.';
  end if;

  select coalesce(kelas_binaan, '{}') into v_binaan_saya from public.profiles where id = v_saya;
  v_nama_semua := v_role_saya in ('Admin','Pimpinan','Wakasis') or v_saya = p_guru;

  select distinct on (fa.relasi_id) fa.url_publik into v_foto
    from public.foto_aset fa
   where fa.kategori = 'profil_guru' and fa.is_aktif and fa.relasi_id = p_guru::text
   order by fa.relasi_id, fa.tanggal_upload desc;

  -- Lingkup kelas: binaan sendiri; Pimpinan tanpa binaan = seluruh dayah.
  if cardinality(v_g.kelas_binaan) > 0 then
    v_lingkup := v_g.kelas_binaan; v_jenis_lingk := 'binaan';
  elsif v_g.role = 'Pimpinan' then
    select array_agg(distinct kelas order by kelas) into v_lingkup from public.siswa where status_santri = 'Aktif';
    v_jenis_lingk := 'dayah';
  else
    v_lingkup := '{}'; v_jenis_lingk := 'lintas';
  end if;

  -- Pembanding adil: bulan lalu sampai tanggal yang sama.
  v_lalu := (v_bulan - interval '1 month')::date;
  v_lalu_batas := least((v_lalu + (v_hari - v_bulan))::date, (v_bulan - 1));
  select least(
           (select min(tanggal) from public.log_pelanggaran),
           (select min(tanggal_pembinaan) from public.log_pembinaan)) into v_awal_data;

  /* ---- progres per kelas ------------------------------------------ */
  with s as (
    select s.nisn, s.kelas, s.unit_gender, s.status_keberadaan,
           case when date_trunc('month', s.poin_bulan) = v_bulan then coalesce(s.poin_bulan_ini, 0) else 0 end poin
      from public.siswa s
     where s.status_santri = 'Aktif' and s.kelas = any(v_lingkup)
  ),
  plg as (
    select s.kelas,
           count(*) filter (where l.tanggal >= v_bulan and l.tanggal <= v_hari) bln,
           count(*) filter (where l.tanggal between v_lalu and v_lalu_batas) lalu,
           count(*) filter (where l.tanggal >= v_bulan and l.tanggal <= v_hari and m.kategori = 'Berat') berat
      from public.log_pelanggaran l
      join s on s.nisn = l.nisn
      left join public.master_pelanggaran m on m.kode_pelanggaran = l.kode_pelanggaran
     where coalesce(l.status, 'Active') <> 'Archived' and l.tanggal >= v_lalu
     group by s.kelas
  ),
  pbn as (
    select s.kelas,
           count(*) filter (where p.status_pembinaan = 'Selesai') selesai,
           count(*) filter (where p.status_pembinaan <> 'Selesai') proses
      from public.log_pembinaan p join s on s.nisn = p.nisn
     where p.tanggal_pembinaan >= v_bulan and p.tanggal_pembinaan <= v_hari
     group by s.kelas
  ),
  prs as (
    select s.kelas, count(*) n, coalesce(sum(r.poin), 0) poin
      from public.log_prestasi r join s on s.nisn = r.nisn
     where lower(coalesce(r.status, 'active')) <> 'archived' and r.tanggal >= v_bulan and r.tanggal <= v_hari
     group by s.kelas
  ),
  thf as (
    select s.kelas, count(*) n, coalesce(sum(t.capaian_halaman), 0) hal
      from public.log_tahfiz t join s on s.nisn = t.nisn
     where lower(coalesce(t.status, 'active')) <> 'archived' and t.tanggal >= v_bulan and t.tanggal <= v_hari
     group by s.kelas
  ),
  k as (
    select s.kelas,
           count(*) santri,
           count(*) filter (where s.unit_gender = 'putri') putri,
           count(*) filter (where s.poin = 0) bersih,
           coalesce(sum(s.poin), 0) poin,
           count(*) filter (where s.status_keberadaan = 'Izin Keluar') izin,
           count(*) filter (where s.status_keberadaan = 'Sakit') sakit
      from s group by s.kelas
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'kelas', k.kelas, 'santri', k.santri, 'putri', k.putri, 'bersih', k.bersih, 'poin', k.poin,
           'izin', k.izin, 'sakit', k.sakit,
           'plg', coalesce(plg.bln, 0), 'plg_lalu', coalesce(plg.lalu, 0), 'berat', coalesce(plg.berat, 0),
           'pbn_selesai', coalesce(pbn.selesai, 0), 'pbn_proses', coalesce(pbn.proses, 0),
           'prestasi', coalesce(prs.n, 0), 'prestasi_poin', coalesce(prs.poin, 0),
           'tahfiz', coalesce(thf.n, 0), 'halaman', coalesce(thf.hal, 0)
         ) order by k.kelas), '[]'::jsonb)
    into v_kelas
    from k
    left join plg on plg.kelas = k.kelas
    left join pbn on pbn.kelas = k.kelas
    left join prs on prs.kelas = k.kelas
    left join thf on thf.kelas = k.kelas;

  select jsonb_build_object(
           'santri',      coalesce(sum((e->>'santri')::int), 0),
           'putri',       coalesce(sum((e->>'putri')::int), 0),
           'bersih',      coalesce(sum((e->>'bersih')::int), 0),
           'poin',        coalesce(sum((e->>'poin')::int), 0),
           'izin',        coalesce(sum((e->>'izin')::int), 0),
           'sakit',       coalesce(sum((e->>'sakit')::int), 0),
           'plg',         coalesce(sum((e->>'plg')::int), 0),
           'plg_lalu',    coalesce(sum((e->>'plg_lalu')::int), 0),
           'berat',       coalesce(sum((e->>'berat')::int), 0),
           'pbn_selesai', coalesce(sum((e->>'pbn_selesai')::int), 0),
           'pbn_proses',  coalesce(sum((e->>'pbn_proses')::int), 0),
           'prestasi',    coalesce(sum((e->>'prestasi')::int), 0),
           'tahfiz',      coalesce(sum((e->>'tahfiz')::int), 0),
           'halaman',     coalesce(sum((e->>'halaman')::numeric), 0))
    into v_total
    from jsonb_array_elements(v_kelas) e;

  /* ---- tren 6 lembar (tidak sebelum data pertama) ------------------ */
  with b as (
    select (date_trunc('month', v_bulan - (i || ' month')::interval))::date bln
      from generate_series(0, 5) i
  ),
  b2 as (select bln from b where bln >= date_trunc('month', coalesce(v_awal_data, v_bulan))::date),
  s as (select nisn from public.siswa where status_santri = 'Aktif' and kelas = any(v_lingkup))
  select coalesce(jsonb_agg(jsonb_build_object(
           'bulan', to_char(b2.bln, 'YYYY-MM'),
           'plg', (select count(*) from public.log_pelanggaran l join s on s.nisn = l.nisn
                    where coalesce(l.status,'Active') <> 'Archived'
                      and l.tanggal >= b2.bln and l.tanggal < (b2.bln + interval '1 month')::date),
           'baik', (select count(*) from public.log_prestasi r join s on s.nisn = r.nisn
                    where lower(coalesce(r.status,'active')) <> 'archived'
                      and r.tanggal >= b2.bln and r.tanggal < (b2.bln + interval '1 month')::date)
                 + (select count(*) from public.log_tahfiz t join s on s.nisn = t.nisn
                    where lower(coalesce(t.status,'active')) <> 'archived'
                      and t.tanggal >= b2.bln and t.tanggal < (b2.bln + interval '1 month')::date),
           'pbn_selesai', (select count(*) from public.log_pembinaan p join s on s.nisn = p.nisn
                    where p.status_pembinaan = 'Selesai'
                      and p.tanggal_pembinaan >= b2.bln and p.tanggal_pembinaan < (b2.bln + interval '1 month')::date),
           'pbn', (select count(*) from public.log_pembinaan p join s on s.nisn = p.nisn
                    where p.tanggal_pembinaan >= b2.bln and p.tanggal_pembinaan < (b2.bln + interval '1 month')::date)
         ) order by b2.bln), '[]'::jsonb)
    into v_tren from b2;

  /* ---- nama santri: hanya untuk yang berhak ----------------------- */
  with s as (
    select s.nisn, s.nama_siswa, s.kelas,
           case when date_trunc('month', s.poin_bulan) = v_bulan then coalesce(s.poin_bulan_ini, 0) else 0 end poin
      from public.siswa s
     where s.status_santri = 'Aktif' and s.kelas = any(v_lingkup)
       and (v_nama_semua or (v_role_saya = 'Guru BK' and s.kelas = any(v_binaan_saya)))
  )
  select coalesce(jsonb_agg(x order by (x->>'poin')::int desc, x->>'nama'), '[]'::jsonb) into v_perhatian
    from (select jsonb_build_object('nisn', nisn, 'nama', nama_siswa, 'kelas', kelas, 'poin', poin) x
            from s where poin > 0 order by poin desc, nama_siswa limit 6) q;

  with s as (
    select s.nisn, s.nama_siswa, s.kelas from public.siswa s
     where s.status_santri = 'Aktif' and s.kelas = any(v_lingkup)
       and (v_nama_semua or (v_role_saya = 'Guru BK' and s.kelas = any(v_binaan_saya)))
  ), b as (
    select s.nisn, s.nama_siswa, s.kelas, count(*) n from (
        select nisn from public.log_prestasi where lower(coalesce(status,'active')) <> 'archived' and tanggal >= v_bulan and tanggal <= v_hari
        union all
        select nisn from public.log_tahfiz where lower(coalesce(status,'active')) <> 'archived' and tanggal >= v_bulan and tanggal <= v_hari
      ) a join s on s.nisn = a.nisn
     group by s.nisn, s.nama_siswa, s.kelas
  )
  select coalesce(jsonb_agg(jsonb_build_object('nisn', nisn, 'nama', nama_siswa, 'kelas', kelas, 'n', n) order by n desc, nama_siswa), '[]'::jsonb)
    into v_bintang
    from (select * from b order by n desc, nama_siswa limit 6) q;

  /* ---- aktivitas pendidik (satu kueri, tanpa tabel sementara) ---- */
  with j as (
    select x.jenis, x.waktu, (x.waktu at time zone 'Asia/Jakarta')::date hari, x.nisn,
           coalesce(x.kelas, s.kelas) kelas, x.ringkas, s.nama_siswa
      from public._jejak_pendidik('2000-01-01'::timestamptz) x
      left join public.siswa s on s.nisn = x.nisn
     where x.guru = p_guru
  ),
  harian as (
    select jsonb_agg(coalesce(c.n, 0) order by d.h) v
      from generate_series(v_hari - 83, v_hari, interval '1 day') d(h)
      left join (select hari, count(*) n from j group by hari) c on c.hari = d.h::date
  ),
  per_jenis as (
    select coalesce(jsonb_object_agg(jenis, jsonb_build_object('bulan', bln, 'sepanjang', total)), '{}'::jsonb) v
      from (select jenis, count(*) filter (where hari >= v_bulan) bln, count(*) total from j group by jenis) q
  ),
  terbaru as (
    select coalesce(jsonb_agg(jsonb_build_object(
             'jenis', t.jenis, 'waktu', t.waktu, 'kelas', t.kelas,
             'ringkas', case when t.boleh or t.jenis in ('prestasi','tahfiz','presensi','laporan') then t.ringkas end,
             'nama',    case when t.boleh then t.nama_siswa end
           ) order by t.waktu desc), '[]'::jsonb) v
      from (select j.*, (v_nama_semua or (v_role_saya = 'Guru BK' and j.kelas = any(v_binaan_saya))) boleh
              from j order by j.waktu desc limit 12) t
  )
  select jsonb_build_object(
           'terakhir',         (select max(waktu) from j),
           'pertama',          (select min(waktu) from j),
           'hari_aktif_bulan', (select count(distinct hari) from j where hari >= v_bulan),
           'bulan',            (select count(*) from j where hari >= v_bulan),
           'sepanjang',        (select count(*) from j),
           'harian',           (select v from harian),
           'per_jenis',        (select v from per_jenis)),
         (select v from terbaru)
    into v_ringkas, v_jejak;

  return jsonb_build_object(
    'hari', v_hari, 'bulan', to_char(v_bulan, 'YYYY-MM'),
    'pembanding', jsonb_build_object('dari', v_lalu, 'sampai', v_lalu_batas),
    'boleh_nama', v_nama_semua or (v_role_saya = 'Guru BK' and v_lingkup && v_binaan_saya),
    'pendidik', jsonb_build_object('id', v_g.id, 'nama', v_g.nama, 'role', v_g.role, 'korps', v_g.korps,
                                   'kelas_binaan', to_jsonb(v_g.kelas_binaan), 'foto', v_foto),
    'lingkup', jsonb_build_object('jenis', v_jenis_lingk, 'kelas', to_jsonb(v_lingkup)),
    'kelas', v_kelas, 'total', v_total, 'tren', v_tren,
    'perhatian', v_perhatian, 'bintang', v_bintang,
    'aktivitas', v_ringkas,
    'jejak', v_jejak
  );
end;
$$;

revoke all on function public.profil_pendidik_rpc(uuid) from public, anon;
grant execute on function public.profil_pendidik_rpc(uuid) to authenticated;
comment on function public.profil_pendidik_rpc(uuid) is
  'v2.54: profil Asatidz. Angka ringkas untuk semua akun login; nama santri hanya Admin/Pimpinan/Wakasis/BK (binaannya)/pendidik itu sendiri.';
