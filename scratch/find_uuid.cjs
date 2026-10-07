const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('.env', 'utf-8');
const urlMatch = env.match(/VITE_SUPABASE_URL\s*=\s*(.*)/);
const keyMatch = env.match(/VITE_SUPABASE_ANON_KEY\s*=\s*(.*)/);
const supabase = createClient(urlMatch[1].trim(), keyMatch[1].trim());

async function check() {
  // Let's check RPC or tables
  const tables = [
    'database_log', 'database_log_backup', 'stock_items', 'stock_items_backup',
    'karantina_revisi_out', 'karantina_log', 'transfers', 'stock_history',
    'input_barang_keluar_draft', 'input_barang_masuk_draft', 'temporary_items'
  ];
  for (const t of tables) {
    try {
      const { data, error } = await supabase.from(t).select('*').limit(5);
      if (error) continue;
      // If table exists, try searching by id or query
      const { data: found } = await supabase.from(t).select('*').eq('id', '528356e5-5123-4599-a32d-c893fea8e5a9');
      if (found && found.length > 0) {
        console.log(`FOUND in table ${t}:`, found);
      }
    } catch (e) {}
  }
}
check();
