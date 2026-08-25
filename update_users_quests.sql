-- 1. Tambah kolom is_blocked ke tabel app_users jika belum ada
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN DEFAULT false;

-- 2. Buat tabel daily_quests
CREATE TABLE IF NOT EXISTS daily_quests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_email TEXT NOT NULL,
    target_sku TEXT NOT NULL,
    system_stock NUMERIC NOT NULL,
    physical_stock NUMERIC,
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'COMPLETED')),
    assigned_date DATE NOT NULL DEFAULT CURRENT_DATE,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Constraint: satu user maksimal satu quest PENDING per hari (opsional, tapi disarankan)
    UNIQUE (user_email, target_sku, assigned_date)
);

-- 3. Set RLS (Row Level Security) untuk daily_quests
ALTER TABLE daily_quests ENABLE ROW LEVEL SECURITY;

-- Grant access ke anon dan authenticated (Wajib agar DevMode bisa akses)
GRANT ALL ON daily_quests TO anon, authenticated;

-- Hapus policy lama jika ada
DROP POLICY IF EXISTS "Allow authenticated read access on daily_quests" ON daily_quests;
DROP POLICY IF EXISTS "Allow authenticated insert access on daily_quests" ON daily_quests;
DROP POLICY IF EXISTS "Allow authenticated update access on daily_quests" ON daily_quests;
DROP POLICY IF EXISTS "Allow authenticated delete access on daily_quests" ON daily_quests;
DROP POLICY IF EXISTS "Allow public all access on daily_quests" ON daily_quests;

-- Buat 1 Policy Universal untuk semua operasi (CRUD) yang mengizinkan akses penuh
CREATE POLICY "Allow public all access on daily_quests" 
  ON daily_quests FOR ALL USING (true) WITH CHECK (true);
