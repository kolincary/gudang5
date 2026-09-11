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
  console.log('--- Inspect Transfers involving LANTAI 4 and LANTAI 2 ---');
  // Find transfers with rak LANTAI 4 or LANTAI 2
  const logs = await query('database_log?gudang=eq.TRANSFER&or=(rak.eq.LANTAI 4,rak.eq.LANTAI 2)&order=created_at.desc&limit=50');
  console.log(`Found ${logs.length} transfer logs involving LANTAI 4 / LANTAI 2:`);
  logs.slice(0, 20).forEach(r => {
    console.log(`ID: ${r.id.slice(0,8)} | SKU: ${r.sku} | Type: ${r.type} | Rak: ${r.rak} | Sub: ${r.sub_rak} | Qty: ${r.jumlah} | TglScan: ${r.tgl_scan} | Tgl: ${r.tgl} | Waktu: ${r.waktu} | User: ${r.user_name || r.user}`);
  });
}

inspect();
