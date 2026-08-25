const { createClient } = require('@supabase/supabase-js');
const supabase = createClient('https://wgmvlkeuaemvgksltnzl.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndnbXZsa2V1YWVtdmdrc2x0bnpsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI2NzY1NDMsImV4cCI6MjA5ODI1MjU0M30.3SWaWv9E7rWPAhWFDVhkrsGgQANDS1HeJ973sWj8jes');

async function testInsert() {
  const items = [
    {
      tgl: "2025-01-01",
      waktu: "12.00",
      sku: "TEST-SKU",
      jumlah: 10,
      type: "IN",
      gudang: "TRANSFER",
      rak: "A2",
      tgl_scan: "2025-01-01",
      user_name: "System",
      created_at: new Date(Date.now() + 2000).toISOString()
    }
  ];

  const { data } = await supabase.from('database_log').insert(items).select();
  console.log("Result for TRANSFER IN:", JSON.stringify(data, null, 2));
}

testInsert();
