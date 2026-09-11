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

async function inspect(sku) {
  console.log(`\n================== ${sku} ==================`);
  const logs = await query(`database_log?sku=eq.${encodeURIComponent(sku)}&order=created_at.asc`);
  console.log(`Total records: ${logs.length}`);
  logs.forEach(r => {
    console.log(`[${r.type}] Rak: ${r.rak.padEnd(10)} | Gudang: ${r.gudang.padEnd(10)} | Jml: ${String(r.jumlah).padStart(4)} | TglScan: ${r.tgl_scan.padEnd(12)} | Tgl: ${r.tgl}`);
  });
}

async function run() {
  await inspect('LAMINATING-LM-07CO/PASTELPINK');
  await inspect('PAINT-OP-12S');
}

run();
