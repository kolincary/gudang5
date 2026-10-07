const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('.env', 'utf-8');
const urlMatch = env.match(/VITE_SUPABASE_URL\s*=\s*(.*)/);
const keyMatch = env.match(/VITE_SUPABASE_ANON_KEY\s*=\s*(.*)/);
const supabase = createClient(urlMatch[1].trim(), keyMatch[1].trim());

async function check() {
  const { data: allLogs, error } = await supabase
    .from('database_log')
    .select('*')
    .eq('sku', 'CORRECTION-CF-S209A')
    .in('type', ['OUT', 'MOVE']);

  console.log(`Total OUT/MOVE logs: ${allLogs.length}`);

  allLogs.forEach(log => {
    const logIdStr = String(log.id);
    const uName = (log.user_name || log.user || '').toLowerCase().trim();
    const gudang = (log.gudang || '').toUpperCase().trim();
    const status = (log.status || log.keterangan || '').toUpperCase().trim();
    const type = (log.type || '').toUpperCase().trim();

    let excludedReason = null;
    if (type === 'MOVE' && status !== 'REVISI_KARANTINA') {
      excludedReason = `MOVE with status=${status}`;
    } else if (gudang === 'TRANSFER' || gudang === 'SYSTEM' || status === 'TRANSFER_REVISI') {
      excludedReason = `gudang=${gudang} or status=${status}`;
    } else if (uName.includes('dev mode') || uName.includes('devmode') || uName.includes('developer') || uName.includes('auto_bg')) {
      excludedReason = `uName=${uName}`;
    }

    console.log(`ID: ${log.id} | tgl: ${log.tgl} | tgl_scan: ${log.tgl_scan} | type: ${log.type} | gudang: ${log.gudang} | user: ${log.user_name} | status: ${log.status} | is_adj: ${log.is_adjustment} | EXCLUDED: ${excludedReason || 'NO (INCLUDED)'}`);
  });
}
check();
