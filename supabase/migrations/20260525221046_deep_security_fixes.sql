/*
  # Deep Security Fixes & User Management

  1. Security Fixes
    - Remove public read access from master data tables:
      - warehouses
      - product_types
      - units
      - products
      - rack_locations
    - Remove public read access from stock_item_backfill_log
    - Replace with authenticated-only read access
  
  2. New Tables
    - `app_users` table to track authenticated users
      - id (uuid, references auth.users)
      - email (text)
      - full_name (text)
      - avatar_url (text)
      - role (text, default 'staff')
      - last_login (timestamptz)
      - created_at (timestamptz)

  3. Security on app_users
    - Enable RLS
    - Authenticated users can read all profiles (for User Management UI)
    - Users can only update their own profiles (handled by trigger or specific policy)
    - App inserts are allowed for matching authenticated IDs
*/

-- =========================================================================
-- 1. REVOKE PUBLIC ACCESS ON MASTER DATA
-- =========================================================================

-- Warehouses
DROP POLICY IF EXISTS "Allow public read access on warehouses" ON warehouses;
CREATE POLICY "Allow authenticated read access on warehouses" 
  ON warehouses FOR SELECT TO authenticated USING (true);

-- Product Types
DROP POLICY IF EXISTS "Allow public read access on product_types" ON product_types;
CREATE POLICY "Allow authenticated read access on product_types" 
  ON product_types FOR SELECT TO authenticated USING (true);

-- Units
DROP POLICY IF EXISTS "Allow public read access on units" ON units;
CREATE POLICY "Allow authenticated read access on units" 
  ON units FOR SELECT TO authenticated USING (true);

-- Products
DROP POLICY IF EXISTS "Allow public read access on products" ON products;
CREATE POLICY "Allow authenticated read access on products" 
  ON products FOR SELECT TO authenticated USING (true);

-- Rack Locations
DROP POLICY IF EXISTS "Allow public read access on rack_locations" ON rack_locations;
CREATE POLICY "Allow authenticated read access on rack_locations" 
  ON rack_locations FOR SELECT TO authenticated USING (true);

-- Stock Item Backfill Log
DROP POLICY IF EXISTS "Allow public read access to backfill logs" ON stock_item_backfill_log;
-- Note: "Allow authenticated access to backfill logs" already exists from previous migration


-- =========================================================================
-- 2. CREATE APP_USERS TABLE
-- =========================================================================

CREATE TABLE IF NOT EXISTS app_users (
  id uuid PRIMARY KEY, -- Links to auth.users.id
  email text UNIQUE NOT NULL,
  full_name text,
  avatar_url text,
  role text DEFAULT 'staff' CHECK (role IN ('staff', 'admin')),
  last_login timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE app_users ENABLE ROW LEVEL SECURITY;

-- Policy: Everyone who is authenticated can see the list of users
CREATE POLICY "Authenticated users can read all app_users"
  ON app_users
  FOR SELECT
  TO authenticated
  USING (true);

-- Policy: Authenticated users can insert their own record on login
CREATE POLICY "Users can insert their own profile"
  ON app_users
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- Policy: Authenticated users can update their own record
CREATE POLICY "Users can update their own profile"
  ON app_users
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Create trigger to automatically update last_login
CREATE OR REPLACE FUNCTION update_app_users_last_login()
RETURNS TRIGGER AS $$
BEGIN
  NEW.last_login = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_app_users_login
  BEFORE UPDATE ON app_users
  FOR EACH ROW
  EXECUTE FUNCTION update_app_users_last_login();

-- Index for fast searching
CREATE INDEX IF NOT EXISTS idx_app_users_email ON app_users(email);
