-- Jalankan berulang-ulang sampai muncul "Success. 0 rows affected."
-- Script ini sudah ditambahkan filter khusus untuk tanggal 1 Juli 2026 s/d 30 Juli 2026

UPDATE database_log
SET sub_rak = rak
WHERE id IN (
  SELECT id
  FROM database_log
  WHERE (sub_rak IS NULL OR trim(sub_rak) = '') 
    AND (rak IS NOT NULL AND trim(rak) != '')
    AND tgl >= '2026-07-01'
    AND tgl <= '2026-07-30'
  LIMIT 5000
);
