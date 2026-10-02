-- =====================================================================
-- chemint v2.50 — LEMBAR BARU: poin & tahap pembinaan kembali nol setiap
-- bulan kalender WIB (menurut tanggal kejadian). Aditif: tidak ada baris
-- data yang dihapus; total_poin_pelanggaran tetap = akumulasi seluruh
-- riwayat. RLS tidak disentuh.
--
-- Berlaku untuk kejadian mulai 1 Oktober 2026. Catatan sebelum itu tetap
-- memakai aturan lama, supaya nomor tahap & surat yang sudah diterima wali
-- tidak bergeser.
--
-- Preflight (2 Okt 2026 ±14.40 WIB, read-only):
--   · pelanggaran per bulan: 2026-08 = 24, 2026-09 = 1.713, 2026-10 = 14
--   · siswa: 734 baris
--   · pembinaan Oktober: 14 (semua Dalam Proses, Otomatis); dinomori ulang
--     per bulan → 8 berubah (Sedang ke-2/ke-3 → ke-1)
--   · rekam_audit hanya melewati UPDATE siswa yang mengubah
--     total_poin_pelanggaran/updated_at → wajib diperluas
--   · trg_pbn_jaga_menunggu & trg_pbn_tutup_laporan tidak terpicu oleh
--     penomoran ulang (status tidak berubah)
-- =====================================================================

-- Pengganti teks fungsi yang aman: gagal bila pola tidak ditemukan tepat
-- `harap` kali (fungsi ini hanya hidup selama sesi migrasi).
create or replace function pg_temp.ganti(d text, lama text, baru text, harap int, label text)
returns text language plpgsql as $f$
declare n int := (length(d) - length(replace(d, lama, ''))) / greatest(length(lama), 1);
begin
  if n <> harap then
    raise exception 'v2.50 [%]: pola ditemukan % kali, harapan %', label, n, harap;
  end if;
  return replace(d, lama, baru);
end $f$;

-- 1 · Kolom poin lembar bulan ---------------------------------------------
alter table public.siswa
  add column if not exists poin_bulan_ini integer not null default 0,
  add column if not exists poin_bulan date;

comment on column public.siswa.poin_bulan_ini is
  'v2.50: poin pelanggaran (non-Archived) bulan kalender WIB yang tertera di poin_bulan.';
comment on column public.siswa.poin_bulan is
  'v2.50: tanggal 1 bulan yang diwakili poin_bulan_ini. Bila bukan bulan berjalan, poin bulan ini = 0.';

-- 2 · Audit: kolom poin otomatis tidak dicatat (sebelum isi ulang massal) --
do $do$
declare d text;
begin
  d := pg_get_functiondef('public.rekam_audit'::regproc);
  d := pg_temp.ganti(d,
    $a$c_bising constant text[] := array['total_poin_pelanggaran','updated_at'];$a$,
    $b$c_bising constant text[] := array['total_poin_pelanggaran','poin_bulan_ini','poin_bulan','updated_at'];$b$,
    1, 'rekam_audit');
  execute d;
end $do$;

-- 3 · Hitung ulang poin: total (tetap) + lembar bulan berjalan -------------
create or replace function public.recalc_total_poin(p_nisn text)
returns integer language sql set search_path to '' as $function$
  update public.siswa s set
    total_poin_pelanggaran = coalesce((
      select sum(m.bobot_poin) from public.log_pelanggaran l
      join public.master_pelanggaran m on m.kode_pelanggaran = l.kode_pelanggaran
      where l.nisn = p_nisn and l.status <> 'Archived'), 0),
    poin_bulan_ini = coalesce((
      select sum(m.bobot_poin) from public.log_pelanggaran l
      join public.master_pelanggaran m on m.kode_pelanggaran = l.kode_pelanggaran
      where l.nisn = p_nisn and l.status <> 'Archived'
        and l.tanggal >= date_trunc('month', now() at time zone 'Asia/Jakarta')::date
        and l.tanggal <  (date_trunc('month', now() at time zone 'Asia/Jakarta') + interval '1 month')::date), 0),
    poin_bulan = date_trunc('month', now() at time zone 'Asia/Jakarta')::date
  where s.nisn = p_nisn
  returning s.total_poin_pelanggaran;
$function$;

-- 4 · Lembar baru: dipanggil cron setiap 00.01 WIB (idempoten) ------------
create or replace function public.rq_lembar_baru()
returns integer language plpgsql security definer set search_path to 'public' as $function$
declare
  v int;
  b date := date_trunc('month', now() at time zone 'Asia/Jakarta')::date;
begin
  with agg as (
    select l.nisn, sum(m.bobot_poin)::int as poin
    from public.log_pelanggaran l
    join public.master_pelanggaran m on m.kode_pelanggaran = l.kode_pelanggaran
    where l.status <> 'Archived' and l.tanggal >= b and l.tanggal < (b + interval '1 month')::date
    group by l.nisn)
  update public.siswa s set poin_bulan_ini = coalesce(a.poin, 0), poin_bulan = b
  from public.siswa x left join agg a on a.nisn = x.nisn
  where s.nisn = x.nisn
    and (s.poin_bulan is distinct from b or s.poin_bulan_ini is distinct from coalesce(a.poin, 0));
  get diagnostics v = row_count;
  return v;
end $function$;
revoke all on function public.rq_lembar_baru() from public, anon, authenticated;

-- recalc_semua_total_poin ikut menyegarkan lembar bulan
create or replace function public.recalc_semua_total_poin()
returns integer language plpgsql security definer set search_path to 'public' as $function$
declare v int;
begin
  with agg as (
    select l.nisn, sum(m.bobot_poin)::int poin
    from public.log_pelanggaran l
    join public.master_pelanggaran m on m.kode_pelanggaran = l.kode_pelanggaran
    where l.status <> 'Archived' group by l.nisn)
  update public.siswa s set total_poin_pelanggaran = coalesce(a.poin, 0)
  from (select nisn from public.siswa) x
  left join agg a on a.nisn = x.nisn
  where s.nisn = x.nisn;
  get diagnostics v = row_count;
  perform public.rq_lembar_baru();
  return v;
end $function$;

-- 5 · Tahap pembinaan per lembar bulan (kejadian ≥ 1 Okt 2026) -------------
do $do$
declare d text;
begin
  d := pg_get_functiondef('public.trg_pembinaan_otomatis'::regproc);
  d := pg_temp.ganti(d,
    $a$where l.nisn = new.nisn and l.status <> 'Archived' and m.kategori = v_kategori;$a$,
    $b$where l.nisn = new.nisn and l.status <> 'Archived' and m.kategori = v_kategori
    -- v2.50 LEMBAR BARU: sejak Oktober 2026 tahap dihitung per bulan kalender.
    and (new.tanggal < date '2026-10-01'
         or date_trunc('month', l.tanggal) = date_trunc('month', new.tanggal));$b$,
    1, 'trg_pembinaan_otomatis v_ke');
  d := pg_temp.ganti(d,
    $a$and m.kategori = v_kategori and l.tanggal > new.tanggal) into v_mundur;$a$,
    $b$and m.kategori = v_kategori and l.tanggal > new.tanggal
      -- v2.50: "input mundur" hanya di dalam lembar bulan yang sama.
      and (new.tanggal < date '2026-10-01'
           or date_trunc('month', l.tanggal) = date_trunc('month', new.tanggal))) into v_mundur;$b$,
    1, 'trg_pembinaan_otomatis v_mundur');
  execute d;
end $do$;

-- 6 · RPC simpan/arsip ikut mengembalikan poin bulan ini --------------------
do $do$
declare d text;
begin
  d := pg_get_functiondef('public.catat_pelanggaran'::regproc);
  d := pg_temp.ganti(d,
    $a$'poin_baru', (select total_poin_pelanggaran from public.siswa where nisn = v_nisn),$a$,
    $b$'poin_baru', (select total_poin_pelanggaran from public.siswa where nisn = v_nisn), 'poin_bulan_baru', (select poin_bulan_ini from public.siswa where nisn = v_nisn),$b$,
    1, 'catat_pelanggaran');
  execute d;

  d := pg_get_functiondef('public.arsipkan_pelanggaran'::regproc);
  d := pg_temp.ganti(d,
    $a$'poin_baru', (select total_poin_pelanggaran from public.siswa where nisn = v_row.nisn));$a$,
    $b$'poin_baru', (select total_poin_pelanggaran from public.siswa where nisn = v_row.nisn),
    'poin_bulan_baru', (select poin_bulan_ini from public.siswa where nisn = v_row.nisn));$b$,
    1, 'arsipkan_pelanggaran');
  execute d;
end $do$;

-- 7 · WA bot ----------------------------------------------------------------
--   Ringkasan musyrif: "santri poin tertinggi" = poin bulan ini.
--   Rekap wali: isinya tetap riwayat (kategori & daftar pelanggaran seumur),
--   jadi `poin` tetap total; `poin_bulan` ditambahkan untuk dipakai wa-bot nanti.
do $do$
declare d text;
begin
  d := pg_get_functiondef('public.wa_data_ringkasan'::regproc);
  d := pg_temp.ganti(d, 'total_poin_pelanggaran', 'poin_bulan_ini', 3, 'wa_data_ringkasan');
  execute d;

  d := pg_get_functiondef('public.wa_data_rekap_wali'::regproc);
  d := pg_temp.ganti(d,
    $a$'poin', coalesce(a.total_poin_pelanggaran, 0),$a$,
    $b$'poin', coalesce(a.total_poin_pelanggaran, 0),
        'poin_bulan', case when a.poin_bulan = date_trunc('month', now() at time zone 'Asia/Jakarta')::date
                           then coalesce(a.poin_bulan_ini, 0) else 0 end,$b$,
    1, 'wa_data_rekap_wali');
  execute d;
end $do$;

-- 8 · Isi awal lembar bulan berjalan untuk semua santri ---------------------
select public.rq_lembar_baru() as santri_diisi;

-- 9 · Penomoran ulang tahap pembinaan Oktober 2026 --------------------------
--     Hanya Dalam Proses + Otomatis + bukan "menunggu". Urutan = urutan input
--     (created_at, id_log), sama dengan cara trigger menghitung.
do $do$
declare v_hitung int; v_cocok int; v_ubah int;
begin
  create temp table _v250_ulang on commit drop as
  with o as (
    select b.id_pembinaan, b.kategori, b.pengulangan_ke as lama,
           coalesce(s.unit_gender, 'putra') as unit,
           (select count(*) from public.log_pelanggaran l2
              join public.master_pelanggaran m2 on m2.kode_pelanggaran = l2.kode_pelanggaran
             where l2.nisn = l.nisn and l2.status <> 'Archived' and m2.kategori = b.kategori
               and date_trunc('month', l2.tanggal) = date_trunc('month', l.tanggal)
               and (l2.created_at, l2.id_log) <= (l.created_at, l.id_log))::int as baru
    from public.log_pembinaan b
    join public.log_pelanggaran l on l.id_log = b.id_log_pelanggaran
    join public.siswa s on s.nisn = l.nisn
    where l.tanggal >= date '2026-10-01' and l.status <> 'Archived'
      and b.status_pembinaan = 'Dalam Proses' and b.mode_pembinaan = 'Otomatis'
      and b.menunggu_alasan is null)
  select o.*, a.id_aturan, a.bentuk_pembinaan
  from o
  left join lateral (
    select mp.id_aturan, mp.bentuk_pembinaan from public.master_pembinaan mp
    where mp.aktif and mp.kategori = o.kategori and mp.pengulangan_ke = o.baru
      and coalesce(mp.unit_gender, 'putra') = o.unit
    order by mp.id_aturan limit 1) a on true
  where o.lama <> o.baru;

  select count(*), count(id_aturan) into v_hitung, v_cocok from _v250_ulang;
  if v_hitung <> v_cocok then
    raise exception 'v2.50: % baris perlu dinomori ulang, tetapi hanya % yang punya aturan master', v_hitung, v_cocok;
  end if;

  update public.log_pembinaan b
     set pengulangan_ke = u.baru, id_aturan = u.id_aturan, bentuk_pembinaan = u.bentuk_pembinaan,
         catatan_pembinaan = 'Pembinaan otomatis kategori ' || u.kategori || ' pengulangan ke-' || u.baru
                             || ' (dinomori ulang v2.50: lembar bulan)'
    from _v250_ulang u
   where b.id_pembinaan = u.id_pembinaan;
  get diagnostics v_ubah = row_count;
  if v_ubah <> v_hitung then
    raise exception 'v2.50: penomoran ulang mengubah % baris, harapan %', v_ubah, v_hitung;
  end if;
  raise notice 'v2.50: % pembinaan Oktober dinomori ulang (preflight 2 Okt: 8)', v_ubah;
end $do$;

-- 10 · Jadwal: 00.01 WIB setiap hari ----------------------------------------
select cron.unschedule('rq-lembar-baru') where exists (select 1 from cron.job where jobname = 'rq-lembar-baru');
select cron.schedule('rq-lembar-baru', '1 17 * * *', $$select public.rq_lembar_baru()$$);
