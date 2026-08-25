const { createClient } = require('@supabase/supabase-js');
const supabase = createClient('https://wgmvlkeuaemvgksltnzl.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndnbXZsa2V1YWVtdmdrc2x0bnpsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI2NzY1NDMsImV4cCI6MjA5ODI1MjU0M30.3SWaWv9E7rWPAhWFDVhkrsGgQANDS1HeJ973sWj8jes');

async function check() {
  const { data, error } = await supabase.from('database_log').select('*').order('created_at', { ascending: false }).limit(20);
  console.log(JSON.stringify(data || error, null, 2));
}
check();
