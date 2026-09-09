const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  'https://ajeohbobmvxtaicmpfgs.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFqZW9oYm9ibXZ4dGFpY21wZmdzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg4NTI3NzgsImV4cCI6MjEwNDQyODc3OH0.N9vDWiCXoS6TQ5uBZkFPNGDgcC95ZWxq5oZLIxTpor0'
);

async function checkTransferLogs() {
  console.log('Querying TRANSFER logs...');
  const { data, error } = await supabase
    .from('database_log')
    .select('id, sku, type, gudang, rak, sub_rak, jumlah, tgl, tgl_scan, waktu, created_at, user_name')
    .eq('gudang', 'TRANSFER')
    .order('created_at', { ascending: false })
    .limit(30);

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log(`Found ${data.length} recent transfer logs:`);
  console.table(data.map(d => ({
    id: d.id,
    sku: d.sku,
    type: d.type,
    rak: d.rak,
    qty: d.jumlah,
    tgl: d.tgl,
    tgl_scan: d.tgl_scan,
    waktu: d.waktu,
    created_at: d.created_at,
    user: d.user_name
  })));
}

checkTransferLogs();
