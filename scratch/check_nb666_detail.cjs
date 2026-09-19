const supabaseUrl = 'https://eojyqaffjqiuxldprwph.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVvanlxYWZmanFpdXhsZHByd3BoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk1ODYwNzUsImV4cCI6MjEwNTE2MjA3NX0.pGTbwCdpMOG8X4N-_GZJidulS7KmzZd82ocv6zFUmuA';

async function main() {
  const stockRes = await fetch(`${supabaseUrl}/rest/v1/stock_items?id=eq.0b6ca922-3db7-4142-bdce-a474e4af01ce`, {
    headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
  });
  const stock = await stockRes.json();
  console.log('stock_items row:', JSON.stringify(stock, null, 2));

  const allLogsRes = await fetch(`${supabaseUrl}/rest/v1/database_log?sku=eq.BOOK-NB-666&created_at=gte.2026-09-18T00:00:00Z&order=created_at.desc`, {
    headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
  });
  const allLogs = await allLogsRes.json();
  console.log(`Logs since Sept 18 (${allLogs.length}):`);
  allLogs.forEach(l => console.log(`  [${l.created_at}] type: ${l.type} | gudang: ${l.gudang} | rak: ${l.rak} | sub_rak: ${l.sub_rak} | jumlah: ${l.jumlah} | user: ${l.user_name}`));
}
main();
