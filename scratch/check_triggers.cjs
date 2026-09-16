const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  'https://ajeohbobmvxtaicmpfgs.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFqZW9oYm9ibXZ4dGFpY21wZmdzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg4NTI3NzgsImV4cCI6MjEwNDQyODc3OH0.N9vDWiCXoS6TQ5uBZkFPNGDgcC95ZWxq5oZLIxTpor0'
);

async function checkTriggers() {
  const { data, error } = await supabase.rpc('get_triggers_for_table', { table_name: 'database_log' });
  if (error) {
    console.log('RPC error:', error.message);
  } else {
    console.log('Triggers:', data);
  }
}

checkTriggers();
