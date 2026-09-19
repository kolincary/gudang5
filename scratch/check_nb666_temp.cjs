const supabaseUrl = 'https://eojyqaffjqiuxldprwph.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVvanlxYWZmanFpdXhsZHByd3BoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk1ODYwNzUsImV4cCI6MjEwNTE2MjA3NX0.pGTbwCdpMOG8X4N-_GZJidulS7KmzZd82ocv6zFUmuA';

async function main() {
  const stockRes = await fetch(`${supabaseUrl}/rest/v1/stock_items?nama_produk=eq.BOOK-NB-666`, {
    headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
  });
  const stocks = await stockRes.json();
  console.log('=== STOCK_ITEMS FOR BOOK-NB-666 ===');
  stocks.forEach(s => console.log(`  ID: ${s.id} | rak: ${s.rak} | sub_rak: ${s.sub_rak} | masuk: ${s.masuk} | keluar: ${s.keluar} | tersedia: ${s.tersedia} | status: ${s.status}`));

  const logRes = await fetch(`${supabaseUrl}/rest/v1/database_log?sku=eq.BOOK-NB-666&or=(rak.eq.TEMP-A,sub_rak.eq.TEMP-A)`, {
    headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
  });
  const logs = await logRes.json();
  console.log(`=== DATABASE_LOG FOR BOOK-NB-666 IN TEMP-A (${logs.length} logs) ===`);
  logs.forEach(l => console.log(`  [${l.created_at}] type: ${l.type} | gudang: ${l.gudang} | rak: ${l.rak} | sub_rak: ${l.sub_rak} | jumlah: ${l.jumlah}`));
}
main();
