const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  'https://ajeohbobmvxtaicmpfgs.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFqZW9oYm9ibXZ4dGFpY21wZmdzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg4NTI3NzgsImV4cCI6MjEwNDQyODc3OH0.N9vDWiCXoS6TQ5uBZkFPNGDgcC95ZWxq5oZLIxTpor0'
);

async function checkSkuHistory() {
  const skus = ['PULPEN-PSBP-177', 'SCISSORS-SC-848', 'CUTTER-TD-103', 'DESKSET-DS-16'];
  for (const sku of skus) {
    console.log(`\n=== History for ${sku} ===`);
    const { data } = await supabase
      .from('database_log')
      .select('id, sku, type, gudang, rak, jumlah, tgl, tgl_scan, waktu, created_at, user_name')
      .ilike('sku', sku)
      .order('created_at', { ascending: true });

    console.table((data || []).map(d => ({
      id: d.id,
      type: d.type,
      gudang: d.gudang,
      rak: d.rak,
      qty: d.jumlah,
      tgl: d.tgl,
      tgl_scan: d.tgl_scan,
      waktu: d.waktu,
      created_at: d.created_at,
      user: d.user_name
    })));
  }
}

checkSkuHistory();
