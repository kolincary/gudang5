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
  const transferLogs = await query('database_log?gudang=eq.TRANSFER&or=(rak.eq.LANTAI 4,rak.eq.LANTAI 2)&order=created_at.asc&limit=3000');
  const uniqueSkus = Array.from(new Set(transferLogs.map(r => r.sku).filter(Boolean)));
  
  const rows = [];
  for (const sku of uniqueSkus) {
    const allLogs = await query(`database_log?sku=eq.${encodeURIComponent(sku)}&order=created_at.asc`);
    const tfOutLt4 = allLogs.filter(r => r.gudang === 'TRANSFER' && r.type === 'OUT' && r.rak === 'LANTAI 4');
    const tfInLt2 = allLogs.filter(r => r.gudang === 'TRANSFER' && r.type === 'IN' && r.rak === 'LANTAI 2');
    
    const qtyOutLt4 = tfOutLt4.reduce((s, r) => s + Number(r.jumlah || 0), 0);
    const qtyInLt2 = tfInLt2.reduce((s, r) => s + Number(r.jumlah || 0), 0);
    
    if (qtyOutLt4 > 0 || qtyInLt2 > 0) {
      const tfDates = Array.from(new Set([...tfOutLt4, ...tfInLt2].map(r => r.tgl_scan || r.tgl)));
      const inLt4 = allLogs.filter(r => r.type === 'IN' && r.rak === 'LANTAI 4' && r.gudang !== 'TRANSFER');
      const inLt4Dates = Array.from(new Set(inLt4.map(r => r.tgl_scan || r.tgl)));
      
      const outLt2 = allLogs.filter(r => r.type === 'OUT' && r.rak === 'LANTAI 2' && r.gudang !== 'TRANSFER');
      const outLt2Qty = outLt2.reduce((s, r) => s + Number(r.jumlah || 0), 0);
      const outLt2Dates = Array.from(new Set(outLt2.map(r => r.tgl_scan || r.tgl)));

      rows.push({
        sku,
        qtyTransfer: qtyOutLt4 || qtyInLt2,
        tfDate: tfDates[0] || '-',
        inLt4Actual: inLt4Dates.slice(-2).join(', ') || '-',
        outLt2Count: outLt2.length,
        outLt2Qty,
        outLt2Dates: outLt2Dates.slice(-3).join(', ') || '-',
        hasIssue: tfDates.some(d => d.startsWith('2025'))
      });
    }
  }

  console.log('Total SKUs with LANTAI 4 -> LANTAI 2 transfer:', rows.length);
  rows.forEach((r, idx) => {
    console.log(`${idx + 1}. [${r.sku}] Qty: ${r.qtyTransfer} | Tgl Transfer: ${r.tfDate} | Nota Masuk Asli LT4: ${r.inLt4Actual} | OUT LT2 Qty: ${r.outLt2Qty} (${r.outLt2Dates}) | Issue: ${r.hasIssue ? '⚠️ Tgl Dummy 2025' : '✅ Match'}`);
  });
}

run();
