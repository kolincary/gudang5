const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  'https://ajeohbobmvxtaicmpfgs.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFqZW9oYm9ibXZ4dGFpY21wZmdzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg4NTI3NzgsImV4cCI6MjEwNDQyODc3OH0.N9vDWiCXoS6TQ5uBZkFPNGDgcC95ZWxq5oZLIxTpor0'
);

async function run() {
  const { data: logs, error } = await supabase
    .from('database_log')
    .select('id, sku, rak, sub_rak, type, jumlah, tgl, tgl_scan, waktu, user_name, created_at')
    .eq('gudang', 'TRANSFER')
    .order('created_at', { ascending: false })
    .limit(30);

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log('Recent 30 TRANSFER logs:');
  console.table(logs.map(l => ({
    id: l.id,
    sku: l.sku,
    rak: l.rak,
    sub_rak: l.sub_rak,
    type: l.type,
    qty: l.jumlah,
    tgl: l.tgl,
    tgl_scan: l.tgl_scan,
    waktu: l.waktu,
    user: l.user_name,
    created_at: l.created_at
  })));
}

run();
