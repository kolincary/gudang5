-- =====================================================
-- SECURITY FIX MIGRATION — 25 Mei 2026
-- =====================================================
-- PENTING: Jalankan SQL ini di Supabase Dashboard → SQL Editor
-- =====================================================

-- =====================================================
-- 1. BUAT TABEL app_pins (Validasi PIN Server-Side)
-- =====================================================
CREATE TABLE IF NOT EXISTS app_pins (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  key TEXT UNIQUE NOT NULL,
  pin_value TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS — TIDAK ada policy SELECT untuk user biasa
-- PIN hanya bisa diakses melalui RPC function
ALTER TABLE app_pins ENABLE ROW LEVEL SECURITY;

-- Insert PIN default (8888)
INSERT INTO app_pins (key, pin_value, description)
VALUES ('admin_pin', '8888', 'PIN untuk operasi sensitif (DataGudang, DatabaseLog, InputBarangKeluar)')
ON CONFLICT (key) DO NOTHING;

-- =====================================================
-- 2. BUAT RPC FUNCTION verify_pin (SECURITY DEFINER)
-- =====================================================
-- SECURITY DEFINER = function berjalan dengan hak akses pemilik (superuser)
-- Sehingga user tidak perlu SELECT langsung ke tabel app_pins
-- PIN value TIDAK PERNAH dikirim ke client, hanya true/false

CREATE OR REPLACE FUNCTION verify_pin(p_key TEXT, p_pin TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM app_pins WHERE key = p_key AND pin_value = p_pin
  );
END;
$$;

-- Hanya authenticated users yang boleh memanggil function ini
REVOKE ALL ON FUNCTION verify_pin(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION verify_pin(TEXT, TEXT) TO authenticated;

-- =====================================================
-- 3. FIX RLS database_log — Dari public ke authenticated
-- =====================================================
DROP POLICY IF EXISTS "Enable read access for all users" ON database_log;
DROP POLICY IF EXISTS "Enable insert access for all users" ON database_log;
DROP POLICY IF EXISTS "Enable update access for all users" ON database_log;
DROP POLICY IF EXISTS "Enable delete access for all users" ON database_log;

CREATE POLICY "Authenticated users can read logs"
  ON database_log FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert logs"
  ON database_log FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update logs"
  ON database_log FOR UPDATE
  TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can delete logs"
  ON database_log FOR DELETE
  TO authenticated
  USING (true);

-- =====================================================
-- 4. FIX RLS stock_items — SELECT dari public ke authenticated
-- =====================================================
DROP POLICY IF EXISTS "Allow public read access" ON stock_items;

CREATE POLICY "Authenticated users can read stock"
  ON stock_items FOR SELECT
  TO authenticated
  USING (true);
