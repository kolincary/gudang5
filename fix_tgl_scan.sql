-- Jalankan kode ini berulang-ulang di SQL Editor Supabase 
-- sampai pesan status di pojok kanan bawah menunjukkan "Success. 0 rows affected."

UPDATE database_log
SET tgl_scan = tgl
WHERE id IN (
  SELECT id
  FROM database_log
  WHERE type = 'IN' 
    AND gudang = 'TRANSFER'
    AND (tgl_scan IS NULL OR trim(tgl_scan) = '' OR tgl_scan != tgl)
  LIMIT 5000
);
