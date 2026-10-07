const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('.env', 'utf-8');
const urlMatch = env.match(/VITE_SUPABASE_URL\s*=\s*(.*)/);
const keyMatch = env.match(/VITE_SUPABASE_ANON_KEY\s*=\s*(.*)/);
const supabase = createClient(urlMatch[1].trim(), keyMatch[1].trim());

async function check() {
  const { data, error } = await supabase
    .from('database_log')
    .select('*')
    .eq('sku', 'CORRECTION-CF-S209A')
    .limit(30);
  if (error) {
    console.error(error);
    return;
  }
  console.log(`Found ${data.length} records:`);
  data.forEach((r, idx) => {
    console.log(`${idx + 1}. ID: ${r.id} | tgl: ${r.tgl} | type: ${r.type} | rak: ${r.rak} | jumlah: ${r.jumlah} | tgl_scan: ${r.tgl_scan} | user: ${r.user_name || r.user} | status: ${r.status} | ket: ${r.keterangan}`);
  });
}
check();
