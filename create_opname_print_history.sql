-- ==============================================================================
-- TABLE: opname_print_history
-- Menyimpan riwayat data stock opname yang telah selesai dicetak label QR thermal
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.opname_print_history (
    id TEXT PRIMARY KEY,
    sku TEXT NOT NULL,
    nama_produk TEXT,
    rak TEXT NOT NULL,
    sub_rak TEXT,
    jumlah NUMERIC DEFAULT 0,
    box_count INTEGER DEFAULT 1,
    user_name TEXT,
    tgl TEXT,
    waktu TEXT,
    tgl_scan TEXT,
    status TEXT DEFAULT 'PRINTED',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index untuk pencarian cepat berdasarkan SKU, Rak, dan Tanggal
CREATE INDEX IF NOT EXISTS idx_opname_print_history_sku ON public.opname_print_history (sku);
CREATE INDEX IF NOT EXISTS idx_opname_print_history_rak ON public.opname_print_history (rak);
CREATE INDEX IF NOT EXISTS idx_opname_print_history_created_at ON public.opname_print_history (created_at DESC);

-- Enable RLS
ALTER TABLE public.opname_print_history ENABLE ROW LEVEL SECURITY;

-- Allow read & write for authenticated/anon users
CREATE POLICY "Allow public read opname_print_history"
ON public.opname_print_history FOR SELECT
USING (true);

CREATE POLICY "Allow public insert opname_print_history"
ON public.opname_print_history FOR INSERT
WITH CHECK (true);

CREATE POLICY "Allow public update opname_print_history"
ON public.opname_print_history FOR UPDATE
USING (true);

CREATE POLICY "Allow public delete opname_print_history"
ON public.opname_print_history FOR DELETE
USING (true);
