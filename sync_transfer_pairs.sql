-- =========================================================================
-- SQL Script: Sinkronisasi Pasangan Tanggal TRANSFER (Optimized & Fast)
-- Jalankan di Supabase SQL Editor
-- =========================================================================

-- 1. Naikkan statement timeout agar query besar tidak kena limit 60 detik
SET statement_timeout = '300s';

-- 2. Buat index cepat untuk mempercepat pencarian kronologis (instant lookup)
CREATE INDEX IF NOT EXISTS idx_db_log_chrono_sync 
ON database_log (upper(trim(sku)), type, created_at);

-- 3. Update TRANSFER OUT menggunakan LATERAL JOIN (Sangat Cepat & Efisien)
WITH transfer_out_matched AS (
  SELECT 
    dl.id AS out_id,
    in_matched.tgl AS match_tgl,
    COALESCE(in_matched.tgl_scan, in_matched.tgl) AS match_tgl_scan
  FROM database_log dl
  CROSS JOIN LATERAL (
    SELECT in_log.tgl, in_log.tgl_scan
    FROM database_log in_log
    WHERE upper(trim(in_log.sku)) = upper(trim(dl.sku))
      AND upper(trim(in_log.type)) = 'IN'
      AND (in_log.gudang IS NULL OR upper(trim(in_log.gudang)) != 'TRANSFER')
      AND in_log.created_at <= dl.created_at
    ORDER BY in_log.created_at DESC
    LIMIT 1
  ) in_matched
  WHERE upper(trim(dl.gudang)) = 'TRANSFER'
    AND upper(trim(dl.type)) = 'OUT'
)
UPDATE database_log dl
SET 
  tgl = tom.match_tgl,
  tgl_scan = tom.match_tgl_scan,
  log_update_user = 'DEVMODE: Chrono Transfer Date Sync'
FROM transfer_out_matched tom
WHERE dl.id = tom.out_id
  AND (dl.tgl != tom.match_tgl OR dl.tgl_scan != tom.match_tgl_scan OR dl.tgl IS NULL OR dl.tgl_scan IS NULL);

-- 4. Samakan log TRANSFER IN dengan log TRANSFER OUT pasangannya (berdasarkan SKU, waktu, jumlah)
WITH transfer_out_current AS (
  SELECT 
    id AS out_id,
    upper(trim(sku)) AS norm_sku,
    waktu,
    jumlah,
    tgl AS out_tgl,
    tgl_scan AS out_tgl_scan,
    created_at AS out_created_at
  FROM database_log
  WHERE upper(trim(gudang)) = 'TRANSFER'
    AND upper(trim(type)) = 'OUT'
)
UPDATE database_log dl
SET 
  tgl = toc.out_tgl,
  tgl_scan = toc.out_tgl_scan,
  log_update_user = 'DEVMODE: Chrono Transfer Date Sync'
FROM transfer_out_current toc
WHERE upper(trim(dl.gudang)) = 'TRANSFER'
  AND upper(trim(dl.type)) = 'IN'
  AND upper(trim(dl.sku)) = toc.norm_sku
  AND dl.waktu = toc.waktu
  AND dl.jumlah = toc.jumlah
  AND abs(extract(epoch from (dl.created_at - toc.out_created_at))) < 10
  AND (dl.tgl != toc.out_tgl OR dl.tgl_scan != toc.out_tgl_scan OR dl.tgl IS NULL OR dl.tgl_scan IS NULL);

-- 5. Cek hasil verifikasi (contoh untuk SKU CLIP-260DR/1DRUM/12PCS)
SELECT id, sku, type, gudang, rak, sub_rak, tgl, tgl_scan, waktu, user_name, log_update_user
FROM database_log
WHERE upper(trim(gudang)) = 'TRANSFER'
  AND upper(trim(sku)) = 'CLIP-260DR/1DRUM/12PCS'
ORDER BY id ASC;
