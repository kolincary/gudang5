const { createClient } = require('@supabase/supabase-js');
const supabase = createClient('https://wgmvlkeuaemvgksltnzl.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndnbXZsa2V1YWVtdmdrc2x0bnpsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI2NzY1NDMsImV4cCI6MjA5ODI1MjU0M30.3SWaWv9E7rWPAhWFDVhkrsGgQANDS1HeJ973sWj8jes');

async function testInsert() {
  const items = [
    {
      tgl: "2025-01-01",
      waktu: "12.00",
      sku: "TEST-SKU",
      jumlah: 10,
      type: "OUT",
      gudang: "TRANSFER",
      rak: "A1",
      tgl_scan: "2025-01-01",
      user_name: "System",
      sub_rak: "A1",
      created_at: new Date(Date.now() + 1000).toISOString()
    },
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
      sub_rak: "A2",
      created_at: new Date(Date.now() + 2000).toISOString()
    }
  ];

  console.log("Inserting:", items);
  const { data, error } = await supabase.from('database_log').insert(items).select();
  console.log("Result:", JSON.stringify(data || error, null, 2));
}

testInsert();
