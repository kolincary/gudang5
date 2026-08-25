import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://koauxdwfaokrugbujdpa.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtvYXV4ZHdmYW9rcnVnYnVqZHBhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYwNDQ4NTcsImV4cCI6MjEwMTYyMDg1N30.4BypV3wkFNpQzNNUVRQf7-XNwrqRmVRN970KOU3YQG8'
);

async function test() {
  const { data } = await supabase.from('app_settings').select('*');
  console.log('app_settings:', data);
}

test();
