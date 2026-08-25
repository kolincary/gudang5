import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://wgmvlkeuaemvgksltnzl.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndnbXZsa2V1YWVtdmdrc2x0bnpsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI2NzY1NDMsImV4cCI6MjA5ODI1MjU0M30.3SWaWv9E7rWPAhWFDVhkrsGgQANDS1HeJ973sWj8jes'
);

async function test() {
  const { data, error } = await supabase.from('app_users').update({ bypass_pin_log: true }).eq('email', 'jgilbeth5@gmail.com');
  console.log('Update Error:', error);
}

test();
