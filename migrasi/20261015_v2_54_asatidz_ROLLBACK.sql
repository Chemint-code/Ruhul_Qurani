-- ROLLBACK v2.54 Asatidz — hanya menghapus fungsi baru; tidak ada data yang tersentuh.
-- Jalankan HANYA bila app.js v2.54 sudah ditarik (halaman Asatidz memanggil dua RPC ini).
drop function if exists public.profil_pendidik_rpc(uuid);
drop function if exists public.tim_pendidik_rpc();
drop function if exists public._pendidik(text, text);
drop function if exists public._jejak_pendidik(timestamptz);
