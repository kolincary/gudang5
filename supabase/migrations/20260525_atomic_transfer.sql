-- Migration: Atomic Transfer RPC
-- =====================================================
-- PENTING: Jalankan SQL ini di Supabase Dashboard → SQL Editor
-- =====================================================

CREATE OR REPLACE FUNCTION execute_transfer(
  p_sku TEXT,
  p_qty INTEGER,
  p_source_rak TEXT,
  p_dest_rak TEXT,
  p_user_email TEXT,
  p_user_name TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_source_stock INTEGER;
  v_source_record_id UUID;
  v_dest_record_id UUID;
  v_dest_stock INTEGER;
BEGIN
  -- 1. Check source stock (FOR UPDATE mencegah race condition)
  SELECT id, jumlah INTO v_source_record_id, v_source_stock 
  FROM stock_items 
  WHERE sku = p_sku AND lokasi_rak = p_source_rak
  FOR UPDATE;

  IF NOT FOUND OR v_source_stock < p_qty THEN
    RAISE EXCEPTION 'Stok tidak mencukupi atau barang tidak ditemukan di rak sumber';
  END IF;

  -- 2. Deduct from source
  UPDATE stock_items SET jumlah = jumlah - p_qty, updated_at = now() WHERE id = v_source_record_id;

  -- 3. Add to dest (FOR UPDATE)
  SELECT id, jumlah INTO v_dest_record_id, v_dest_stock 
  FROM stock_items 
  WHERE sku = p_sku AND lokasi_rak = p_dest_rak
  FOR UPDATE;

  IF FOUND THEN
    UPDATE stock_items SET jumlah = jumlah + p_qty, updated_at = now() WHERE id = v_dest_record_id;
  ELSE
    INSERT INTO stock_items (sku, jumlah, lokasi_rak) VALUES (p_sku, p_qty, p_dest_rak);
  END IF;

  -- 4. Log Source (OUT)
  INSERT INTO database_log (sku, type, jumlah, rak, keterangan, admin)
  VALUES (p_sku, 'OUT', p_qty, p_source_rak, 'TRANSFER OUT KE RAK ' || p_dest_rak, p_user_name);

  -- 5. Log Dest (IN)
  INSERT INTO database_log (sku, type, jumlah, rak, keterangan, admin)
  VALUES (p_sku, 'IN', p_qty, p_dest_rak, 'TRANSFER IN DARI RAK ' || p_source_rak, p_user_name);

  RETURN '{"success": true}'::jsonb;
END;
$$;

-- Hanya izinkan auth users memanggil ini
REVOKE ALL ON FUNCTION execute_transfer(TEXT, INTEGER, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION execute_transfer(TEXT, INTEGER, TEXT, TEXT, TEXT, TEXT) TO authenticated;
