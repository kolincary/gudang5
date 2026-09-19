const supabaseUrl = 'https://eojyqaffjqiuxldprwph.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVvanlxYWZmanFpdXhsZHByd3BoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk1ODYwNzUsImV4cCI6MjEwNTE2MjA3NX0.pGTbwCdpMOG8X4N-_GZJidulS7KmzZd82ocv6zFUmuA';

async function main() {
  // 1. Fetch all stock_items in TEMP-A
  const stockRes = await fetch(`${supabaseUrl}/rest/v1/stock_items?rak=eq.TEMP-A&select=id,nama_produk,rak,masuk,keluar,tersedia`, {
    headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
  });
  const tempItems = await stockRes.json();

  // 2. Fetch all database_log entries for TEMP-A
  const logRes = await fetch(`${supabaseUrl}/rest/v1/database_log?or=(rak.eq.TEMP-A,sub_rak.eq.TEMP-A)&select=sku,type,jumlah,rak,sub_rak`, {
    headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
  });
  const logs = await logRes.json();

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

  // 4. Update mismatched rows in stock_items
  let updatedCount = 0;
  for (const it of tempItems) {
    const sku = (it.nama_produk || '').trim();
    const ledger = ledgerMap.get(sku) || { in: 0, out: 0 };
    const ledgerTersedia = Math.max(0, ledger.in - ledger.out);
    
    if (it.tersedia !== ledgerTersedia || it.masuk !== ledger.in || it.keluar !== ledger.out) {
      console.log(`Syncing ${sku} [${it.id}]: masuk ${it.masuk}->${ledger.in}, keluar ${it.keluar}->${ledger.out}, tersedia ${it.tersedia}->${ledgerTersedia}`);
      const patchRes = await fetch(`${supabaseUrl}/rest/v1/stock_items?id=eq.${it.id}`, {
        method: 'PATCH',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({
          masuk: ledger.in,
          keluar: ledger.out,
          tersedia: ledgerTersedia
        })
      });
      if (patchRes.ok) {
        updatedCount++;
      } else {
        console.error(`Failed to update ${sku}:`, await patchRes.text());
      }
    }
  }

  console.log(`\nSuccessfully synchronized ${updatedCount} items in stock_items for TEMP-A!`);
}
main().catch(console.error);
