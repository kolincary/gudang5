import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envText = fs.readFileSync('.env', 'utf-8');
const env = {};
envText.split('\n').forEach(line => {
  const [k, ...v] = line.split('=');
  if (k && v.length) env[k.trim()] = v.join('=').trim();
});

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

async function checkSpecificLog() {
  const targetIds = [
    '0f11b4ef-741a-47a0-8fe1-4975ae27dd14', // BOOK-NB-666
    'ca4ef9cd-16da-4f3f-b56a-ca4240c479ef', // BOOK-NB-740/YELLOW
    '9c9b41c5-3e33-4540-b6eb-9b0feb8d44c7', // BOOK-NB-722/A5/1SET
    '74438770-59e6-41c1-acb7-85ed082de0e1', // BAG-B-002/BLACK
    '13c780b5-25da-4b6c-a7f5-042d45215414', // BOOK-CLBK-3504/1PC
    '1c9fd609-af57-4ab6-9fcb-f2d1dea89000', // MARKER-WM-60/1PCS
    '2872858d-e973-4c72-874a-ab62a33750fc'  // CLIP-260PTL/1DRUM/12PCS
  ];

  for (const id of targetIds) {
    const { data } = await supabase.from('database_log').select('*').eq('id', id);
    if (data && data.length > 0) {
      const l = data[0];
      console.log(`LOG id=${l.id}: sku=${l.sku}, type=${l.type}, rak=${l.rak}, tgl_scan=${l.tgl_scan}, created_at=${l.created_at}, status=${l.status}, uName=${l.user_name}, gudang=${l.gudang}`);
    }
  }
}

checkSpecificLog();
