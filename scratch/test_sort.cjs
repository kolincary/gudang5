const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('.env', 'utf-8');
const urlMatch = env.match(/VITE_SUPABASE_URL\s*=\s*(.*)/);
const keyMatch = env.match(/VITE_SUPABASE_ANON_KEY\s*=\s*(.*)/);
const supabase = createClient(urlMatch[1].trim(), keyMatch[1].trim());

async function check() {
  const { data } = await supabase
    .from('database_log')
    .select('id, tgl, tgl_scan, jumlah, user_name, created_at, type')
    .eq('sku', 'CORRECTION-CF-S209A')
    .in('type', ['OUT', 'MOVE']);
  data.sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
  data.forEach((r, idx) => {
    console.log((idx+1) + '. ID: ' + r.id + ' | tgl: ' + r.tgl + ' | tgl_scan: ' + r.tgl_scan + ' | user: ' + r.user_name + ' | qty: ' + r.jumlah + ' | created_at: ' + r.created_at + ' | type: ' + r.type);
  });
}
check();
