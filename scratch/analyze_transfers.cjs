const { createClient } = require('@supabase/supabase-js');
const supabase = createClient('https://ajeohbobmvxtaicmpfgs.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFqZW9oYm9ibXZ4dGFpY21wZmdzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg4NTI3NzgsImV4cCI6MjEwNDQyODc3OH0.N9vDWiCXoS6TQ5uBZkFPNGDgcC95ZWxq5oZLIxTpor0');

async function fetchAllTransfers() {
  let allTransfers = [];
  let from = 0;
  const batchSize = 1000;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from('database_log')
      .select('id, sku, type, gudang, tgl, tgl_scan, waktu, jumlah, rak, created_at')
      .eq('gudang', 'TRANSFER')
      .order('created_at', { ascending: false })
      .range(from, from + batchSize - 1);

    if (error) {
      console.error(error);
      break;
    }

    if (data && data.length > 0) {
      allTransfers.push(...data);
      from += batchSize;
      if (data.length < batchSize) hasMore = false;
    } else {
      hasMore = false;
    }
  }

  return allTransfers;
}

async function analyze() {
  console.log('Fetching ALL TRANSFER logs with pagination...');
  const transfers = await fetchAllTransfers();
  console.log(`Total transfer logs fetched: ${transfers.length}`);

  const skus = [...new Set(transfers.map(t => (t.sku || '').trim().toUpperCase()))].filter(Boolean);
  console.log(`Unique SKUs in transfers: ${skus.length}`);

  // Fetch IN receipts in chunks of 50
  const receiptsMap = new Map();
  const chunkSize = 50;

  for (let i = 0; i < skus.length; i += chunkSize) {
    const chunk = skus.slice(i, i + chunkSize);
    const { data: inData } = await supabase
      .from('database_log')
      .select('sku, tgl, tgl_scan, waktu, created_at, rak')
      .in('sku', chunk)
      .eq('type', 'IN')
      .neq('gudang', 'TRANSFER')
      .order('created_at', { ascending: true });

    if (inData) {
      inData.forEach(row => {
        const k = (row.sku || '').trim().toUpperCase();
        if (!receiptsMap.has(k)) receiptsMap.set(k, []);
        receiptsMap.get(k).push(row);
      });
    }
  }

  console.log(`Loaded receipts for ${receiptsMap.size} SKUs.`);

  const issues = [];
  const inIssues = [];
  const outIssues = [];

  transfers.forEach(tr => {
    const normSku = (tr.sku || '').trim().toUpperCase();
    const receipts = receiptsMap.get(normSku);
    if (!receipts || receipts.length === 0) return;

    const trTime = new Date(tr.created_at).getTime();
    let best = null;
    for (let j = receipts.length - 1; j >= 0; j--) {
      if (new Date(receipts[j].created_at).getTime() <= trTime + 60000) {
        best = receipts[j];
        break;
      }
    }
    if (!best) best = receipts[0];

    const expectedTgl = best.tgl;
    const expectedTglScan = best.tgl_scan || best.tgl;

    const tglMismatch = tr.tgl !== expectedTgl;
    const tglScanMismatch = tr.tgl_scan !== expectedTglScan;

    if (tglMismatch || tglScanMismatch) {
      const issue = {
        id: tr.id,
        sku: tr.sku,
        type: tr.type,
        rak: tr.rak,
        curr_tgl: tr.tgl,
        curr_tgl_scan: tr.tgl_scan,
        exp_tgl: expectedTgl,
        exp_tgl_scan: expectedTglScan,
        created_at: tr.created_at.split('T')[0]
      };
      issues.push(issue);
      if (tr.type === 'IN') inIssues.push(issue);
      if (tr.type === 'OUT') outIssues.push(issue);
    }
  });

  console.log(`\n=== SUMMARY OF ALL TRANSFER DATE ISSUES ===`);
  console.log(`Total transfer logs: ${transfers.length}`);
  console.log(`Total transfer logs with mismatched date: ${issues.length}`);
  console.log(`Total TRANSFER IN with mismatched date: ${inIssues.length}`);
  console.log(`Total TRANSFER OUT with mismatched date: ${outIssues.length}`);

  console.log(`\nSample TRANSFER IN mismatches (first 25):`);
  console.table(inIssues.slice(0, 25));

  console.log(`\nSample TRANSFER OUT mismatches (first 25):`);
  console.table(outIssues.slice(0, 25));
}

analyze();
