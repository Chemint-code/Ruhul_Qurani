-- =====================================================================
-- v2.55 — KABAR WALI TERCATAT (aditif)
-- ---------------------------------------------------------------------
-- Satu tabel BARU dan dua fungsi BARU. Tidak ada tabel, kolom, trigger,
-- atau RLS lama yang diubah.
--
--   kabar_wali_log                    jejak "pesan wali sudah dibuka di
--                                     WhatsApp" per baris pembinaan.
--   catat_kabar_wali(id, nomor)       dipanggil klien saat musyrif menekan
--                                     "Buka WhatsApp" di pratinjau Kabari Wali.
--   kabar_wali_tercatat(sejak)        daftar id pembinaan yang sudah dikabari;
--                                     Ringkasan memakainya supaya butir
--                                     "Kabari wali santri" berkurang.
--
-- Mengapa tidak memakai wa_log (rancangan awal K11):
--   wa_log punya CHECK jenis ∈ {izin, ringkasan, uji, grup, perintah,
--   ingatkan} dan status ∈ {terkirim, gagal, dilewati} yang dipakai wa-bot.
--   Menambah jenis berarti mengubah constraint tabel bot. Tabel sendiri
--   lebih aman dan murni aditif.
--
-- Hak: peran yang boleh "Kabari Wali" di aplikasi (IZIN 'wali.kabar'):
--   Admin, Guru, Walas, Guru BK, Pimpinan. Tabel tertutup untuk klien
--   (RLS aktif tanpa kebijakan + revoke); akses hanya lewat dua fungsi ini.
--
-- PREFLIGHT (read-only, 20 Okt 2026, sebelum migrasi):
--   · Tabel/fungsi bernama %kabar%: tidak ada.
--   · log_pembinaan.id_pembinaan bertipe text, unik (count = count distinct).
--   · public.my_role(): security definer, membaca profiles.role akun aktif.
--   · profiles aktif per peran: Admin 4, Guru 13, Guru BK 3, Walas 2,
--     Pimpinan 1, Ustadz GEN-Z 1, Osis 1.
--   · wa_log: kebijakan hanya SELECT untuk Admin; CHECK jenis/status di atas.
--   · Pembinaan terbuka per bulan: Agt 5, Sep 634, Okt 185.
-- =====================================================================

create table if not exists public.kabar_wali_log (
  id            bigserial primary key,
  id_pembinaan  text not null,
  nisn          text,
  pengirim      uuid default auth.uid(),
  nomor         text,
  waktu         timestamptz not null default now()
);
create index if not exists kabar_wali_log_pbn_idx on public.kabar_wali_log (id_pembinaan);
create index if not exists kabar_wali_log_waktu_idx on public.kabar_wali_log (waktu);

alter table public.kabar_wali_log enable row level security;
revoke all on public.kabar_wali_log from anon, authenticated;
revoke all on sequence public.kabar_wali_log_id_seq from anon, authenticated;

create or replace function public.catat_kabar_wali(p_id_pembinaan text, p_nomor text default null)
returns timestamptz
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_nisn  text;
  v_waktu timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Sesi tidak dikenal.' using errcode = '42501';
  end if;
  if public.my_role() not in ('Admin', 'Guru', 'Walas', 'Guru BK', 'Pimpinan') then
    raise exception 'Akun Anda tidak berwenang mengabari wali santri.' using errcode = '42501';
  end if;
  select p.nisn into v_nisn from public.log_pembinaan p where p.id_pembinaan = p_id_pembinaan;
  if not found then
    raise exception 'Data pembinaan % tidak ditemukan.', p_id_pembinaan using errcode = 'P0002';
  end if;
  insert into public.kabar_wali_log (id_pembinaan, nisn, pengirim, nomor)
  values (p_id_pembinaan, v_nisn, auth.uid(), nullif(left(regexp_replace(coalesce(p_nomor, ''), '\D', '', 'g'), 20), ''))
  returning waktu into v_waktu;
  return v_waktu;
end;
$$;

create or replace function public.kabar_wali_tercatat(p_sejak date default (current_date - 120))
returns table(id_pembinaan text, terakhir timestamptz, kali int)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if public.my_role() not in ('Admin', 'Guru', 'Walas', 'Guru BK', 'Pimpinan') then
    return;
  end if;
  return query
    select k.id_pembinaan, max(k.waktu), count(*)::int
      from public.kabar_wali_log k
     where k.waktu >= p_sejak
     group by k.id_pembinaan;
end;
$$;

revoke all on function public.catat_kabar_wali(text, text) from public, anon;
revoke all on function public.kabar_wali_tercatat(date) from public, anon;
grant execute on function public.catat_kabar_wali(text, text) to authenticated;
grant execute on function public.kabar_wali_tercatat(date) to authenticated;
