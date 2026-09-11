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
  // Fetch transfers with rak LANTAI 4 and LANTAI 2
  const transfers = await query('database_log?gudang=eq.TRANSFER&or=(rak.eq.LANTAI 4,rak.eq.LANTAI 2)&order=created_at.asc&limit=1000');
  console.log(`Found ${transfers.length} transfer records with rak LANTAI 4 / LANTAI 2`);

  // Group by SKU
  const bySku = {};
  transfers.forEach(t => {
    if (!bySku[t.sku]) bySku[t.sku] = [];
    bySku[t.sku].push(t);
  });

  const skus = Object.keys(bySku);
  console.log(`Total unique SKUs: ${skus.length}`);
  
  skus.forEach(sku => {
    const list = bySku[sku];
    console.log(`\nSKU: ${sku} (${list.length} transfer rows)`);
    list.forEach(r => {
      console.log(`  [${r.type}] Rak: ${r.rak} | Jml: ${r.jumlah} | TglScan: ${r.tgl_scan} | Tgl: ${r.tgl} | ID: ${r.id}`);
    });
  });
}

run();
