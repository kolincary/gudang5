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

async function testMatchingLogic() {
  const transferLogs = await query('database_log?gudang=eq.TRANSFER&or=(rak.eq.LANTAI 4,rak.eq.LANTAI 2)&order=created_at.asc&limit=3000');
  const uniqueSkus = Array.from(new Set(transferLogs.map(r => r.sku).filter(Boolean)));

  console.log(`Checking ${uniqueSkus.length} unique SKUs...`);

  const previewUpdates = [];

  for (const sku of uniqueSkus) {
    const allLogs = await query(`database_log?sku=eq.${encodeURIComponent(sku)}&order=created_at.asc`);
    
    // Transfer logs
    const tfLogs = allLogs.filter(r => r.gudang === 'TRANSFER' && (r.rak === 'LANTAI 4' || r.rak === 'LANTAI 2'));
    
    // Original receipts at LANTAI 4 (type IN, gudang != TRANSFER)
    const inLt4Receipts = allLogs.filter(r => r.type === 'IN' && r.rak === 'LANTAI 4' && r.gudang !== 'TRANSFER');
    
    // Out deductions at LANTAI 2 (type OUT, gudang != TRANSFER)
    const outLt2Deductions = allLogs.filter(r => r.type === 'OUT' && r.rak === 'LANTAI 2' && r.gudang !== 'TRANSFER');

    tfLogs.forEach(tf => {
      const currentScan = (tf.tgl_scan || tf.tgl || '').trim();
      
      // Determine if currentScan is dummy (e.g., 2025 date when transfer happened later, or doesn't match any receipt/deduction)
      // Find matching receipt in LT4
      let targetScan = currentScan;
      let matchedReason = '';

      // If current scan starts with 2025, look for latest IN receipt in LT4 created before or around transfer
      if (currentScan.startsWith('2025') && inLt4Receipts.length > 0) {
        const tfCreated = new Date(tf.created_at || 0).getTime();
        // find receipt before transfer or closest receipt
        let bestReceipt = null;
        for (let i = inLt4Receipts.length - 1; i >= 0; i--) {
          const rCreated = new Date(inLt4Receipts[i].created_at || 0).getTime();
          if (rCreated <= tfCreated + 86400000) {
            bestReceipt = inLt4Receipts[i];
            break;
          }
        }
        if (!bestReceipt) bestReceipt = inLt4Receipts[inLt4Receipts.length - 1];

        if (bestReceipt) {
          targetScan = bestReceipt.tgl_scan || bestReceipt.tgl;
          matchedReason = `Mengikuti Nota Masuk LT4: ${bestReceipt.gudang} (${bestReceipt.tgl_scan || bestReceipt.tgl})`;
        }
      } else if (currentScan.startsWith('2025') && outLt2Deductions.length > 0) {
        // If no inLt4Receipts, check first OUT deduction in LT2
        const firstOut = outLt2Deductions[0];
        targetScan = firstOut.tgl_scan || firstOut.tgl;
        matchedReason = `Mengikuti OUT Penjualan LT2: ${firstOut.gudang} (${firstOut.tgl_scan || firstOut.tgl})`;
      }

      const isMismatch = targetScan !== currentScan;

      previewUpdates.push({
        id: tf.id,
        sku: tf.sku,
        type: tf.type,
        rak: tf.rak,
        jumlah: tf.jumlah,
        currentScan,
        targetScan,
        isMismatch,
        matchedReason
      });
    });
  }

  const mismatches = previewUpdates.filter(p => p.isMismatch);
  console.log(`\nTotal Transfer Rows: ${previewUpdates.length}`);
  console.log(`Rows Needing Alignment: ${mismatches.length}`);
  
  mismatches.slice(0, 20).forEach(m => {
    console.log(`[${m.type} ${m.rak}] ${m.sku} (${m.jumlah} pcs): ${m.currentScan} ➔ ${m.targetScan} | ${m.matchedReason}`);
  });
}

testMatchingLogic();
