const supabaseUrl = 'https://ajeohbobmvxtaicmpfgs.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFqZW9oYm9ibXZ4dGFpY21wZmdzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg4NTI3NzgsImV4cCI6MjEwNDQyODc3OH0.N9vDWiCXoS6TQ5uBZkFPNGDgcC95ZWxq5oZLIxTpor0';

async function query(endpoint) {
  const res = await fetch(`${supabaseUrl}/rest/v1/${endpoint}`, {
    headers: {
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json'
    }
  });
  return res.json();
}

async function inspect() {
  console.log('--- Inspect LAMINATING-LM-03 ---');
  const logs = await query('database_log?sku=eq.LAMINATING-LM-03&order=created_at.asc&limit=100');
  console.log(`Found ${logs.length} records:`);
  logs.forEach(r => {
    console.log(`[${r.type}] Rak: ${r.rak} | Sub: ${r.sub_rak} | Gudang: ${r.gudang} | Qty: ${r.jumlah} | TglScan: ${r.tgl_scan} | Tgl: ${r.tgl} | Waktu: ${r.waktu} | User: ${r.user_name || r.user} | UpdateUser: ${r.log_update_user || ''}`);
  });
}

inspect();
