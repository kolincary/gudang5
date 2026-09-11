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
  // 1. Get all TRANSFER logs where rak is LANTAI 4 or LANTAI 2
  const transfers = await query('database_log?gudang=eq.TRANSFER&or=(rak.eq.LANTAI 4,rak.eq.LANTAI 2)&order=created_at.asc&limit=2000');
  
  // Group by SKU
  const skus = new Set();
  transfers.forEach(t => skus.add(t.sku));

  console.log(`Total transfer records involving LANTAI 4 or LANTAI 2: ${transfers.length}`);
  console.log(`Unique SKUs involved: ${skus.size}`);
  
  // For each SKU, let's analyze what the incoming receipts were in LANTAI 4, what was transferred, and what OUT happened in LANTAI 2
  for (const sku of Array.from(skus)) {
    const skuLogs = await query(`database_log?sku=eq.${encodeURIComponent(sku)}&order=created_at.asc`);
    
    // Transfers
    const tfOutLt4 = skuLogs.filter(r => r.gudang === 'TRANSFER' && r.type === 'OUT' && r.rak === 'LANTAI 4');
    const tfInLt2 = skuLogs.filter(r => r.gudang === 'TRANSFER' && r.type === 'IN' && r.rak === 'LANTAI 2');
    
    if (tfOutLt4.length > 0 || tfInLt2.length > 0) {
      console.log(`\n=== SKU: ${sku} ===`);
      console.log(`  Transfer OUT LT4 count: ${tfOutLt4.length} | Total qty: ${tfOutLt4.reduce((s, r) => s + r.jumlah, 0)}`);
      tfOutLt4.forEach(r => console.log(`    OUT LT4 -> Jml: ${r.jumlah} | TglScan: ${r.tgl_scan} | Tgl: ${r.tgl}`));
      console.log(`  Transfer IN LT2 count: ${tfInLt2.length} | Total qty: ${tfInLt2.reduce((s, r) => s + r.jumlah, 0)}`);
      tfInLt2.forEach(r => console.log(`    IN LT2  -> Jml: ${r.jumlah} | TglScan: ${r.tgl_scan} | Tgl: ${r.tgl}`));
      
      // Check OUT in LANTAI 2
      const outLt2 = skuLogs.filter(r => r.type === 'OUT' && r.rak === 'LANTAI 2' && r.gudang !== 'TRANSFER');
      console.log(`  Sales/Regular OUT from LANTAI 2: ${outLt2.length} records, total qty: ${outLt2.reduce((s, r) => s + r.jumlah, 0)}`);
      outLt2.forEach(r => console.log(`    OUT LT2 (gudang ${r.gudang}) -> Jml: ${r.jumlah} | TglScan: ${r.tgl_scan} | Tgl: ${r.tgl}`));

      // Check IN in LANTAI 4 (original receipts)
      const inLt4 = skuLogs.filter(r => r.type === 'IN' && r.rak === 'LANTAI 4' && r.gudang !== 'TRANSFER');
      console.log(`  Original IN receipts at LANTAI 4: ${inLt4.length} records, total qty: ${inLt4.reduce((s, r) => s + r.jumlah, 0)}`);
      inLt4.slice(-5).forEach(r => console.log(`    IN LT4 (gudang ${r.gudang}) -> Jml: ${r.jumlah} | TglScan: ${r.tgl_scan} | Tgl: ${r.tgl}`));
    }
  }
}

run();
