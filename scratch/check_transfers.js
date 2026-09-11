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

async function run() {
  // Check logs where gudang is TRANSFER and rak in (LANTAI 4, LANTAI 2)
  const transfersLantai = await query('database_log?gudang=eq.TRANSFER&or=(rak.ilike.*LANTAI 4*,rak.ilike.*LANTAI 2*)&limit=100');
  console.log(`Transfers involving LANTAI 4 or LANTAI 2: ${transfersLantai.length}`);
  transfersLantai.slice(0, 30).forEach(r => {
    console.log(`ID: ${r.id} | SKU: ${r.sku} | Type: ${r.type} | Rak: ${r.rak} | Sub: ${r.sub_rak} | Jml: ${r.jumlah} | TglScan: ${r.tgl_scan} | Tgl: ${r.tgl} | Ket: ${r.keterangan || ''}`);
  });
}

run();
