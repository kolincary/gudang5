-- ==============================================================================
-- SQL Script: Sinkronisasi Kolom sub_rak & rak di database_log (Fix "Masih UTAMA")
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- SKENARIO 1: sub_rak saat ini berisi 'UTAMA', dan rak berisi nama Rak/Lorong asli (misal LORONG-1)
-- Perintah ini akan mengganti sub_rak yang bernilai 'UTAMA' menjadi sama dengan rak.
UPDATE database_log
SET sub_rak = rak
WHERE upper(trim(sub_rak)) = 'UTAMA'
  AND rak IS NOT NULL 
  AND upper(trim(rak)) != 'UTAMA';


-- ------------------------------------------------------------------------------
-- SKENARIO 2: rak saat ini berisi 'UTAMA', tapi sub_rak berisi nama Lorong (misal LORONG-1)
-- Perintah ini akan menyalin isi sub_rak ke kolom rak.
UPDATE database_log
SET rak = sub_rak
WHERE upper(trim(rak)) = 'UTAMA'
  AND sub_rak IS NOT NULL 
  AND upper(trim(sub_rak)) LIKE '%LORONG%';


-- ------------------------------------------------------------------------------
-- SKENARIO 3: Paksa Update sub_rak = rak untuk semua rak yang mengandung kata LORONG
-- (Mencakup 'LORONG-1', 'LORONG 1', 'LORONG-UTAMA', 'LORONG-2', dll.)
UPDATE database_log
SET sub_rak = rak
WHERE rak IS NOT NULL 
  AND upper(trim(rak)) LIKE '%LORONG%'
  AND (sub_rak IS NULL OR trim(sub_rak) = '' OR upper(trim(sub_rak)) = 'UTAMA' OR sub_rak != rak);


-- ------------------------------------------------------------------------------
-- SKENARIO 4: Paksa Update SEMUA sub_rak yang NULL/Kosong/'UTAMA' mengikuti rak (Kecuali rak UTAMA)
UPDATE database_log
SET sub_rak = rak
WHERE (sub_rak IS NULL OR trim(sub_rak) = '' OR upper(trim(sub_rak)) = 'UTAMA')
  AND rak IS NOT NULL 
  AND upper(trim(rak)) != 'UTAMA';
