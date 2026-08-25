const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env' });

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

async function run() {
  console.log('Fetching all stock items...');
  let hasMore = true;
  let from = 0;
  const allItems = [];
  while (hasMore) {
    const { data } = await supabase.from('stock_items').select('*').range(from, from + 999);
    if (!data || data.length === 0) {
      hasMore = false;
    } else {
      allItems.push(...data);
      from += 1000;
      if (data.length < 1000) hasMore = false;
    }
  }

  console.log('Total items fetched:', allItems.length);

  const groups = new Map();
  for (const item of allItems) {
    const key = item.nama_produk + '|||' + item.rak;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }

  let mergedCount = 0;
  for (const [key, items] of groups.entries()) {
    if (items.length > 1) {
      console.log('Found duplicates for', key, 'count:', items.length);
      // Aggregate
      const master = items[0];
      let sumTersedia = master.tersedia;
      let sumMasuk = master.masuk;
      let sumKeluar = master.keluar;
      let sumAwal = master.stok_awal;

      const toDelete = [];
      for (let i = 1; i < items.length; i++) {
        sumTersedia += items[i].tersedia;
        sumMasuk += items[i].masuk;
        sumKeluar += items[i].keluar;
        sumAwal += items[i].stok_awal;
        toDelete.push(items[i].id);
      }

      console.log('  -> Merging into ID:', master.id, 'New Tersedia:', sumTersedia);
      await supabase.from('stock_items').update({
        tersedia: sumTersedia,
        masuk: sumMasuk,
        keluar: sumKeluar,
        stok_awal: sumAwal
      }).eq('id', master.id);

      for (const id of toDelete) {
        await supabase.from('stock_items').delete().eq('id', id);
      }
      mergedCount++;
    }
  }

  console.log('Cleanup completed. Merged groups:', mergedCount);
}

run();
