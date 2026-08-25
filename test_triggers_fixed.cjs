const { createClient } = require('@supabase/supabase-js');
const supabase = createClient('https://wgmvlkeuaemvgksltnzl.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndnbXZsa2V1YWVtdmdrc2x0bnpsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI2NzY1NDMsImV4cCI6MjA5ODI1MjU0M30.3SWaWv9E7rWPAhWFDVhkrsGgQANDS1HeJ973sWj8jes');

async function check() {
  const { data, error } = await supabase.rpc('execute_sql', { sql_query: "SELECT trigger_name, event_manipulation, event_object_table, action_statement FROM information_schema.triggers WHERE event_object_table = 'database_log'" });
  if (error) {
     const { data: d2, error: e2 } = await supabase.rpc('query_sql', { query: "SELECT trigger_name, action_statement FROM information_schema.triggers WHERE event_object_table = 'database_log'" });
     console.log(JSON.stringify(d2 || e2, null, 2));
  } else {
     console.log(JSON.stringify(data, null, 2));
  }
}
check();
