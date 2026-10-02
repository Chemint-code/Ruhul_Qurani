-- =====================================================================
-- chemint v2.51 — KUNCI BULAN: pembinaan pada bulan yang sudah Tutup Buku
-- tidak bisa diubah atau dihapus oleh siapa pun (termasuk Admin), sampai
-- Admin membuka kunci bulan itu di menu Tutup Buku. Aditif; RLS tidak
-- disentuh.
--
-- Yang dikunci = isi buku SAAT DITUTUP: baris pembinaan yang sudah ada
-- ketika bulan itu ditutup. Baris yang lahir sesudahnya (pelanggaran
-- bulan itu yang diinput terlambat) tetap bisa diselesaikan, dan tampil
-- sebagai perubahan ("Berubah") di Tutup Buku.
--
-- Preflight (2 Okt 2026, read-only):
--   · tutup_buku: 2026-08 (ditutup 28 Sep), 2026-09 (ditutup 1 Okt 18.34 UTC)
--   · log_pembinaan sebelum Oktober yang belum Selesai: 639
--   · log_pembinaan tidak punya kolom waktu dibuat → ditambah `dibuat_pada`
--     (baris lama = NULL = sudah ada sebelum v2.51 → ikut terkunci)
--   · trg_pembinaan_arsip menghapus pembinaan Otomatis yang belum selesai
--     saat pelanggarannya diarsipkan → pada bulan terkunci ikut ditolak
-- =====================================================================

set lock_timeout = '5s';   -- jangan menahan aplikasi bila tabel sedang sibuk

-- 1 · Kolom ---------------------------------------------------------------
alter table public.tutup_buku add column if not exists terkunci boolean not null default true;
comment on column public.tutup_buku.terkunci is
  'v2.51: true = pembinaan bulan ini yang sudah ada saat ditutup tidak bisa diubah/dihapus.';

alter table public.log_pembinaan add column if not exists dibuat_pada timestamptz;
alter table public.log_pembinaan alter column dibuat_pada set default now();
comment on column public.log_pembinaan.dibuat_pada is
  'v2.51: waktu baris dibuat. NULL = baris lama (sebelum v2.51).';

-- 2 · Penjaga -------------------------------------------------------------
create or replace function public.trg_pbn_kunci_bulan()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare
  v_bulan date;
  v_tutup timestamptz;
  c_nama constant text[] := array['Januari','Februari','Maret','April','Mei','Juni','Juli',
                                  'Agustus','September','Oktober','November','Desember'];
begin
  -- Jalan pintas pemeliharaan (migrasi/perbaikan data oleh pengelola):
  --   set local rq.buka_kunci = 'ya';
  if coalesce(current_setting('rq.buka_kunci', true), '') = 'ya' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  v_bulan := date_trunc('month', old.tanggal_pembinaan)::date;
  select t.ditutup_pada into v_tutup from public.tutup_buku t
   where t.periode = v_bulan and t.terkunci;

  if found and (old.dibuat_pada is null or old.dibuat_pada <= v_tutup) then
    raise exception 'Pembinaan % % sudah dikunci (Tutup Buku). Admin dapat membuka kuncinya di menu Tutup Buku.',
      c_nama[extract(month from v_bulan)::int], extract(year from v_bulan)::int
      using errcode = 'P0001';
  end if;

  -- Baris yang belum terkunci juga tidak boleh dipindah ke bulan terkunci.
  if tg_op = 'UPDATE' and new.tanggal_pembinaan is distinct from old.tanggal_pembinaan then
    if exists (select 1 from public.tutup_buku t
                where t.periode = date_trunc('month', new.tanggal_pembinaan)::date and t.terkunci) then
      raise exception 'Tanggal pembinaan tidak boleh dipindah ke bulan yang sudah dikunci.' using errcode = 'P0001';
    end if;
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end $function$;
revoke all on function public.trg_pbn_kunci_bulan() from public, anon, authenticated;

-- CREATE OR REPLACE TRIGGER (PG14+): tanpa DROP — pernyataan DROP membuat
-- MCP Supabase menunggu konfirmasi dan terhenti (2 Okt 2026).
create or replace trigger trg_pbn_kunci_bulan
  before update or delete on public.log_pembinaan
  for each row execute function public.trg_pbn_kunci_bulan();

-- 3 · Baca status kunci (semua akun masuk) ---------------------------------
create or replace function public.bulan_terkunci()
returns jsonb language sql stable security definer set search_path to 'public' as $function$
  select coalesce(jsonb_agg(jsonb_build_object(
           'bulan', to_char(t.periode, 'YYYY-MM'),
           'ditutup_pada', t.ditutup_pada,
           'terkunci', t.terkunci) order by t.periode desc), '[]'::jsonb)
  from public.tutup_buku t
  where auth.uid() is not null;
$function$;
revoke all on function public.bulan_terkunci() from public, anon;
grant execute on function public.bulan_terkunci() to authenticated;

-- 4 · Buka / kunci lagi (Admin) --------------------------------------------
create or replace function public.atur_kunci_bulan(p_periode date, p_kunci boolean)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare v_bulan date := date_trunc('month', p_periode)::date;
begin
  perform public._wajib_admin();
  update public.tutup_buku set terkunci = coalesce(p_kunci, true) where periode = v_bulan;
  if not found then raise exception 'Bulan % belum ditutup.', to_char(v_bulan, 'YYYY-MM'); end if;
  return jsonb_build_object('bulan', to_char(v_bulan, 'YYYY-MM'), 'terkunci', coalesce(p_kunci, true));
end $function$;
revoke all on function public.atur_kunci_bulan(date, boolean) from public, anon;
grant execute on function public.atur_kunci_bulan(date, boolean) to authenticated;

-- Status live 2 Okt 2026 ±15.55 WIB: DIJALANKAN (apply_migration + revoke terpisah).
