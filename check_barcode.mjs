import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../../../4_scan kalindo all in one/kalindo-scan - 2026-08-02T011748.989/.env') });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
async function main() {
    const {data} = await supabase.from('scanned_items').select('id, barcode, role').ilike('barcode', '%260818N%').limit(10);
    console.log(data);
}
main();
