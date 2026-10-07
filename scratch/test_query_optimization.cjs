const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('.env', 'utf-8');
const urlMatch = env.match(/VITE_SUPABASE_URL\s*=\s*(.*)/);
const keyMatch = env.match(/VITE_SUPABASE_ANON_KEY\s*=\s*(.*)/);
const supabase = createClient(urlMatch[1].trim(), keyMatch[1].trim());

async function searchOutLogs(term) {
  console.time('searchOutLogs: ' + term);
  
  // Strategy:
  // 1. If term has exact or multiple candidates, we query database_log
  // Without order('created_at') in SQL so Postgres does NOT do an expensive sort!
  let query = supabase
    .from('database_log')
    .select('*')
    .in('type', ['OUT', 'MOVE'])
    .limit(100);

  // Check if term is exact or partial
  if (term.includes(' ') || term.length < 5) {
    query = query.ilike('sku', `%${term.trim()}%`);
  } else {
    // Exact or wildcard
    query = query.ilike('sku', `%${term.trim()}%`);
  }

  const { data, error } = await query;
  console.timeEnd('searchOutLogs: ' + term);

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log(`Found ${data.length} rows`);
  // Sort in JS
  data.sort((a, b) => {
    const timeA = new Date(a.created_at || a.tgl).getTime();
    const timeB = new Date(b.created_at || b.tgl).getTime();
    return timeB - timeA;
  });

  data.forEach((r, idx) => {
    console.log(`${idx + 1}. ID: ${r.id.slice(0, 8)} | tgl: ${r.tgl} | tgl_scan: ${r.tgl_scan} | type: ${r.type} | qty: ${r.jumlah} | user: ${r.user_name || '-'} | is_adj: ${r.is_adjustment}`);
  });
}

searchOutLogs('209A');
