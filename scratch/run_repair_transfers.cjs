const { createClient } = require('@supabase/supabase-js');
const supabase = createClient('https://ajeohbobmvxtaicmpfgs.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFqZW9oYm9ibXZ4dGFpY21wZmdzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg4NTI3NzgsImV4cCI6MjEwNDQyODc3OH0.N9vDWiCXoS6TQ5uBZkFPNGDgcC95ZWxq5oZLIxTpor0');

async function repair() {
  console.log('🔄 Fetching all TRANSFER logs with pagination...');
  let allTransferLogs = [];
  let from = 0;
  const fetchBatchSize = 1000;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from('database_log')
      .select('id, sku, type, tgl, tgl_scan, waktu, jumlah, rak, created_at')
      .eq('gudang', 'TRANSFER')
      .order('created_at', { ascending: false })
      .range(from, from + fetchBatchSize - 1);

    if (error) {
      console.error('Error fetching transfers:', error);
      break;
    }

    if (data && data.length > 0) {
      allTransferLogs.push(...data);
      from += fetchBatchSize;
      if (data.length < fetchBatchSize) hasMore = false;
    } else {
      hasMore = false;
    }
  }

  console.log(`Total transfer logs fetched: ${allTransferLogs.length}`);

  const uniqueSkusMap = new Map();
  allTransferLogs.forEach(l => {
    const rawSku = (l.sku || '').trim();
    if (rawSku) uniqueSkusMap.set(rawSku.toUpperCase(), rawSku);
  });

  const uniqueSkus = Array.from(uniqueSkusMap.values());
  console.log(`Unique SKUs in transfers: ${uniqueSkus.length}`);

  // Fetch IN receipts in chunks of 50 using .in() filter for high speed
  const inReceiptsBySku = new Map();
  const skuChunkSize = 50;

  for (let i = 0; i < uniqueSkus.length; i += skuChunkSize) {
    const chunk = uniqueSkus.slice(i, i + skuChunkSize);
    const { data: inData, error: inError } = await supabase
      .from('database_log')
      .select('sku, tgl, tgl_scan, waktu, rak, created_at')
      .in('sku', chunk)
      .eq('type', 'IN')
      .neq('gudang', 'TRANSFER')
      .order('created_at', { ascending: true });

    if (inError) {
      console.error('Error fetching chunk receipts:', inError);
    }

    if (inData) {
      inData.forEach(row => {
        const k = (row.sku || '').trim().toUpperCase();
        if (!inReceiptsBySku.has(k)) inReceiptsBySku.set(k, []);
        inReceiptsBySku.get(k).push({
          tgl: row.tgl,
          tgl_scan: row.tgl_scan || row.tgl,
          waktu: row.waktu,
          createdAt: new Date(row.created_at).getTime()
        });
      });
    }
    process.stdout.write(`\rLoaded receipts for ${Math.min(i + skuChunkSize, uniqueSkus.length)} / ${uniqueSkus.length} SKUs...`);
  }

  console.log(`\nLoaded receipts for ${inReceiptsBySku.size} SKUs.`);

  const findCorrectDate = (normSku, transferTimestamp) => {
    const list = inReceiptsBySku.get(normSku);
    if (!list || list.length === 0) return null;
    for (let i = list.length - 1; i >= 0; i--) {
      if (list[i].createdAt <= transferTimestamp + 60000) {
        return list[i];
      }
    }
    return list[0];
  };

  const updatesMap = new Map();

  allTransferLogs.forEach(row => {
    const normSku = (row.sku || '').trim().toUpperCase();
    const transferTime = new Date(row.created_at).getTime();
    const matched = findCorrectDate(normSku, transferTime);

    if (matched) {
      const correctTgl = matched.tgl;
      const correctTglScan = matched.tgl_scan;
      const correctWaktu = matched.waktu || row.waktu;

      const needsTglUpdate = row.tgl !== correctTgl;
      const needsScanUpdate = row.tgl_scan !== correctTglScan;
      const needsWaktuUpdate = correctWaktu && row.waktu !== correctWaktu;

      if (needsTglUpdate || needsScanUpdate || needsWaktuUpdate) {
        updatesMap.set(row.id, {
          tgl: correctTgl,
          tgl_scan: correctTglScan,
          waktu: correctWaktu
        });
      }
    }
  });

  console.log(`Total transfer rows requiring date/time sync: ${updatesMap.size}`);

  if (updatesMap.size === 0) {
    console.log('✓ All transfer rows already synchronized!');
    return;
  }

  const entries = Array.from(updatesMap.entries());
  let updatedCount = 0;
  const updateBatchSize = 50;

  for (let i = 0; i < entries.length; i += updateBatchSize) {
    const chunk = entries.slice(i, i + updateBatchSize);
    await Promise.all(
      chunk.map(([id, val]) =>
        supabase
          .from('database_log')
          .update({
            tgl: val.tgl,
            tgl_scan: val.tgl_scan,
            waktu: val.waktu,
            log_update_user: 'AUTO_BG: Fix Transfer Date'
          })
          .eq('id', id)
      )
    );
    updatedCount += chunk.length;
    process.stdout.write(`\rProgress: ${updatedCount} / ${entries.length} rows updated...`);
  }

  console.log(`\n✅ Finished updating ${updatedCount} transfer rows!`);
}

repair();
