const supabaseUrl = 'https://eojyqaffjqiuxldprwph.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVvanlxYWZmanFpdXhsZHByd3BoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk1ODYwNzUsImV4cCI6MjEwNTE2MjA3NX0.pGTbwCdpMOG8X4N-_GZJidulS7KmzZd82ocv6zFUmuA';

async function main() {
  // 1. Fetch all stock_items where rak starts with TEMP
  const stockRes = await fetch(`${supabaseUrl}/rest/v1/stock_items?rak=ilike.TEMP*&select=id,nama_produk,rak,masuk,keluar,tersedia`, {
    headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
  });
  const tempItems = await stockRes.json();
  console.log(`Found ${tempItems.length} total items in stock_items for all TEMP racks.`);

  // 2. Fetch all database_log entries for all TEMP racks
  const logRes = await fetch(`${supabaseUrl}/rest/v1/database_log?or=(rak.ilike.TEMP*,sub_rak.ilike.TEMP*)&select=sku,type,jumlah,rak,sub_rak`, {
    headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
  });
  const logs = await logRes.json();
  console.log(`Found ${logs.length} database_log entries for all TEMP racks.`);

  // 3. Compute ledger balance per (rak, sku)
  const ledgerMap = new Map();
  logs.forEach(l => {
    const sku = (l.sku || '').trim().toUpperCase();
    const rak = (l.rak || l.sub_rak || '').trim().toUpperCase();
    if (!sku || !rak) return;
    const key = `${rak}|||${sku}`;
    if (!ledgerMap.has(key)) ledgerMap.set(key, { in: 0, out: 0, rak, sku });
    const stat = ledgerMap.get(key);
    const qty = Number(l.jumlah) || 0;
    if (l.type === 'IN') stat.in += qty;
    else if (l.type === 'OUT') stat.out += qty;
  });

  // 4. Compare with stock_items
  const mismatches = [];
  for (const it of tempItems) {
    const sku = (it.nama_produk || '').trim().toUpperCase();
    const rak = (it.rak || '').trim().toUpperCase();
    const key = `${rak}|||${sku}`;
    const ledger = ledgerMap.get(key) || { in: 0, out: 0 };
    const ledgerTersedia = Math.max(0, ledger.in - ledger.out);
    
    if (it.tersedia !== ledgerTersedia || it.masuk !== ledger.in || it.keluar !== ledger.out) {
      mismatches.push({
        id: it.id,
        rak,
        sku: it.nama_produk,
        stock_items_tersedia: it.tersedia,
        ledger_in: ledger.in,
        ledger_out: ledger.out,
        ledger_tersedia: ledgerTersedia,
        selisih: it.tersedia - ledgerTersedia
      });
    }
  }

  console.log(`\n=== TOTAL MISMATCHES ACROSS ALL TEMP RACKS: ${mismatches.length} items ===`);
  mismatches.forEach(m => {
    console.log(`  [${m.rak}] ${m.sku}: stock_items=${m.stock_items_tersedia} vs ledger=${m.ledger_tersedia} (selisih: +${m.selisih}) [ID: ${m.id}]`);
  });

  if (mismatches.length > 0) {
    console.log(`\nSynchronizing remaining ${mismatches.length} items...`);
    let updated = 0;
    for (const m of mismatches) {
      const patchRes = await fetch(`${supabaseUrl}/rest/v1/stock_items?id=eq.${m.id}`, {
        method: 'PATCH',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({
          masuk: m.ledger_in,
          keluar: m.ledger_out,
          tersedia: m.ledger_tersedia
        })
      });
      if (patchRes.ok) updated++;
    }
    console.log(`Successfully synchronized ${updated} remaining items across all TEMP racks!`);
  }
}
main().catch(console.error);
