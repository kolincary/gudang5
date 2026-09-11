const supabaseUrl = 'https://ajeohbobmvxtaicmpfgs.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFqZW9oYm9ibXZ4dGFpY21wZmdzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg4NTI3NzgsImV4cCI6MjEwNDQyODc3OH0.N9vDWiCXoS6TQ5uBZkFPNGDgcC95ZWxq5oZLIxTpor0';

async function test() {
  const res = await fetch(`${supabaseUrl}/rest/v1/database_log?sku=eq.LAMINATING-LM-03&type=eq.IN&order=created_at.asc`, {
    headers: {
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json'
    }
  });
  const data = await res.json();
  console.log(`Found ${data.length} IN records for LAMINATING-LM-03:`);
  data.forEach(r => {
    console.log(`ID: ${r.id.slice(0,8)} | Rak: ${r.rak} | Gudang: ${r.gudang} | Qty: ${r.jumlah} | TglScan: ${r.tgl_scan} | Tgl: ${r.tgl} | Waktu: ${r.waktu}`);
  });
}

test();
