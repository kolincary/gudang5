-- Menambahkan kolom log_audit_saldo ke tabel database_log jika belum ada
ALTER TABLE database_log 
ADD COLUMN IF NOT EXISTS log_audit_saldo TEXT;

-- Memberikan keterangan kolom
COMMENT ON COLUMN database_log.log_audit_saldo IS 'Penanda audit dan penguncian transaksi hasil perbaikan Cek Saldo Stok';
