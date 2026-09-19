const supabaseUrl = 'https://eojyqaffjqiuxldprwph.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVvanlxYWZmanFpdXhsZHByd3BoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk1ODYwNzUsImV4cCI6MjEwNTE2MjA3NX0.pGTbwCdpMOG8X4N-_GZJidulS7KmzZd82ocv6zFUmuA';

async function main() {
  // 1. Fetch all stock_items in TEMP-A
  const stockRes = await fetch(`${supabaseUrl}/rest/v1/stock_items?rak=eq.TEMP-A&select=id,nama_produk,rak,masuk,keluar,tersedia`, {
    headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
  });
  const tempItems = await stockRes.json();
  console.log(`Found ${tempItems.length} items in stock_items for TEMP-A.`);

  // 2. Fetch all database_log entries for TEMP-A
  const logRes = await fetch(`${supabaseUrl}/rest/v1/database_log?or=(rak.eq.TEMP-A,sub_rak.eq.TEMP-A)&select=sku,type,jumlah,rak,sub_rak`, {
    headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
  });
  const logs = await logRes.json();
  console.log(`Found ${logs.length} database_log entries for TEMP-A.`);

  // 3. Compute ledger balance per SKU
  const ledgerMap = new Map();
  logs.forEach(l => {
    const sku = (l.sku || '').trim();
    if (!sku) return;
    if (!ledgerMap.has(sku)) ledgerMap.set(sku, { in: 0, out: 0 });
    const stat = ledgerMap.get(sku);
    const qty = Number(l.jumlah) || 0;
    if (l.type === 'IN') stat.in += qty;
    else if (l.type === 'OUT') stat.out += qty;
  });

  // 4. Compare with stock_items
  const mismatches = [];
  tempItems.forEach(it => {
    const sku = (it.nama_produk || '').trim();
    const ledger = ledgerMap.get(sku) || { in: 0, out: 0 };
    const ledgerTersedia = Math.max(0, ledger.in - ledger.out);
    if (it.tersedia !== ledgerTersedia) {
      mismatches.push({
        id: it.id,
        sku,
        stock_items_tersedia: it.tersedia,
        ledger_in: ledger.in,
        ledger_out: ledger.out,
        ledger_tersedia: ledgerTersedia,
        selisih: it.tersedia - ledgerTersedia
      });
    }
  });

  console.log(`\n=== MISMATCHES IN TEMP-A: ${mismatches.length} items ===`);
  mismatches.forEach(m => {
    console.log(`  ${m.sku}: stock_items=${m.stock_items_tersedia} vs ledger=${m.ledger_tersedia} (selisih: +${m.selisih}) [ID: ${m.id}]`);
  });
}
main();
