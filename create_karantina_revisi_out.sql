-- Migration: Buat tabel karantina_revisi_out di Supabase
-- Salin dan jalankan seluruh script ini di Supabase SQL Editor

CREATE TABLE IF NOT EXISTS public.karantina_revisi_out (
    id BIGSERIAL PRIMARY KEY,
    original_log_id TEXT,
    sku TEXT NOT NULL,
    nama_barang TEXT,
    packing TEXT,
    jumlah NUMERIC NOT NULL DEFAULT 0,
    rak_asal TEXT,
    sub_rak_tujuan TEXT,
    tgl_out_asli TEXT,
    gudang TEXT,
    user_pemotong_out TEXT,
    user_penarik TEXT,
    keterangan_out_asli TEXT,
    status TEXT DEFAULT 'MENUNGGU_REVISI',
    sisa_fisik_belum_cocok NUMERIC DEFAULT 0,
    catatan_crosscheck TEXT,
    revisi_by TEXT,
    revisi_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tambahkan kolom gudang jika tabel sudah dibuat sebelumnya tanpa kolom ini
ALTER TABLE public.karantina_revisi_out ADD COLUMN IF NOT EXISTS gudang TEXT;
ALTER TABLE public.karantina_revisi_out ADD COLUMN IF NOT EXISTS tgl_out TEXT;

-- Index untuk mempercepat query status dan pencarian SKU
CREATE INDEX IF NOT EXISTS idx_karantina_revisi_sku ON public.karantina_revisi_out (sku);
CREATE INDEX IF NOT EXISTS idx_karantina_revisi_status ON public.karantina_revisi_out (status);

-- Aktifkan Row Level Security (RLS)
ALTER TABLE public.karantina_revisi_out ENABLE ROW LEVEL SECURITY;

-- Buat Policy agar aplikasi dapat membaca, menambah, dan mengupdate data karantina
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'karantina_revisi_out' AND policyname = 'karantina_revisi_out_select_all') THEN
        CREATE POLICY "karantina_revisi_out_select_all" ON public.karantina_revisi_out FOR SELECT USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'karantina_revisi_out' AND policyname = 'karantina_revisi_out_insert_all') THEN
        CREATE POLICY "karantina_revisi_out_insert_all" ON public.karantina_revisi_out FOR INSERT WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'karantina_revisi_out' AND policyname = 'karantina_revisi_out_update_all') THEN
        CREATE POLICY "karantina_revisi_out_update_all" ON public.karantina_revisi_out FOR UPDATE USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'karantina_revisi_out' AND policyname = 'karantina_revisi_out_delete_all') THEN
        CREATE POLICY "karantina_revisi_out_delete_all" ON public.karantina_revisi_out FOR DELETE USING (true);
    END IF;
END $$;

-- Aktifkan Realtime Replication untuk tabel karantina_revisi_out
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
        AND schemaname = 'public' 
        AND tablename = 'karantina_revisi_out'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.karantina_revisi_out;
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        NULL; -- Abaikan jika publication belum ada atau sudah ditambahkan
END $$;

-- Berikan hak akses penuh pada tabel dan sequence id untuk role anon, authenticated, service_role
GRANT ALL ON TABLE public.karantina_revisi_out TO anon, authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE public.karantina_revisi_out_id_seq TO anon, authenticated, service_role;
