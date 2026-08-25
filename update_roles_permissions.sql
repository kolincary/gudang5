-- 1. Hapus constraint check lama pada kolom role jika ada
ALTER TABLE app_users DROP CONSTRAINT IF EXISTS app_users_role_check;

-- 2. Konversi data role lama ke format role baru
UPDATE app_users SET role = 'staf_admin' WHERE role = 'admin';
UPDATE app_users SET role = 'staf_gudang' WHERE role = 'staff';
UPDATE app_users SET role = 'staf_gudang' WHERE role NOT IN ('staf_gudang', 'staf_admin', 'developer') OR role IS NULL;

-- 3. Set nilai default baru dan tambahkan constraint check baru
ALTER TABLE app_users ALTER COLUMN role SET DEFAULT 'staf_gudang';
ALTER TABLE app_users ADD CONSTRAINT app_users_role_check CHECK (role IN ('staf_gudang', 'staf_admin', 'developer'));

-- 4. Buat tabel role_permissions
CREATE TABLE IF NOT EXISTS role_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role TEXT NOT NULL CHECK (role IN ('staf_gudang', 'staf_admin', 'developer')),
    menu_path TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(role, menu_path)
);

-- 5. Konfigurasi keamanan untuk role_permissions
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;

GRANT ALL ON role_permissions TO anon, authenticated;

DROP POLICY IF EXISTS "Allow public all access on role_permissions" ON role_permissions;
CREATE POLICY "Allow public all access on role_permissions" 
  ON role_permissions FOR ALL USING (true) WITH CHECK (true);
