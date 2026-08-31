-- ==============================================================================
-- SQL SETUP UNTUK TABEL role_notifications (Kelola Notifikasi Wajib / Blocking)
-- Jalankan query ini di Supabase SQL Editor
-- ==============================================================================

-- 1. Buat tabel role_notifications jika belum ada
CREATE TABLE IF NOT EXISTS public.role_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message TEXT NOT NULL,
    target_role TEXT NOT NULL DEFAULT 'all',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_by TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Aktifkan Row Level Security (RLS)
ALTER TABLE public.role_notifications ENABLE ROW LEVEL SECURITY;

-- 3. Berikan hak akses (GRANT) ke role anon dan authenticated
GRANT ALL ON public.role_notifications TO anon, authenticated;

-- 4. Buat Policy agar user dapat membaca, membuat, mengubah status, dan menghapus notifikasi
DROP POLICY IF EXISTS "Allow public all access on role_notifications" ON public.role_notifications;
CREATE POLICY "Allow public all access on role_notifications" 
  ON public.role_notifications 
  FOR ALL 
  TO public, anon, authenticated
  USING (true) 
  WITH CHECK (true);

-- 5. Tambahkan ke Realtime Publication agar perubahan langsung terdeteksi seketika (Instant)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'role_notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.role_notifications;
  END IF;
END $$;
