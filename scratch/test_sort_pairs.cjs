const { createClient } = require('@supabase/supabase-js');
const supabase = createClient('https://ajeohbobmvxtaicmpfgs.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFqZW9oYm9ibXZ4dGFpY21wZmdzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg4NTI3NzgsImV4cCI6MjEwNDQyODc3OH0.N9vDWiCXoS6TQ5uBZkFPNGDgcC95ZWxq5oZLIxTpor0');

function sortLogRowsAdvanced(items, sortConfig = null) {
  const isAscending = sortConfig ? sortConfig.direction === 'asc' : false;

  // 1. Identify and link transfer pairs
  const pairedInfo = new Map();
  const transfers = items.filter(i => (i.gudang || '').toUpperCase().includes('TRANSFER'));
  
  const usedIds = new Set();
  const outTransfers = transfers.filter(t => (t.type || '').toUpperCase() === 'OUT');
  const inTransfers = transfers.filter(t => (t.type || '').toUpperCase() === 'IN');

  outTransfers.forEach(outItem => {
    if (usedIds.has(outItem.id)) return;
    const outTime = outItem.created_at ? new Date(outItem.created_at).getTime() : 0;
    const normSku = (outItem.sku || '').trim().toUpperCase();
    const qty = Math.abs(Number(outItem.jumlah || 0));

    let bestIn = null;
    let minDiff = Infinity;

    inTransfers.forEach(inItem => {
      if (usedIds.has(inItem.id)) return;
      if ((inItem.sku || '').trim().toUpperCase() !== normSku) return;
      if (Math.abs(Number(inItem.jumlah || 0)) !== qty) return;

      const inTime = inItem.created_at ? new Date(inItem.created_at).getTime() : 0;
      const diff = Math.abs(inTime - outTime);
      if (diff < minDiff && diff <= 30000) {
        minDiff = diff;
        bestIn = inItem;
      }
    });

    if (bestIn) {
      const groupKey = `pair_${outItem.id}_${bestIn.id}`;
      const inTime = bestIn.created_at ? new Date(bestIn.created_at).getTime() : 0;
      const baseTime = Math.max(outTime, inTime);
      pairedInfo.set(outItem.id, { groupKey, isOut: true, time: baseTime });
      pairedInfo.set(bestIn.id, { groupKey, isOut: false, time: baseTime });
      usedIds.add(outItem.id);
      usedIds.add(bestIn.id);
    }
  });

  return [...items].sort((a, b) => {
    if (sortConfig) {
      const key = sortConfig.key === 'tgl' ? 'tgl_normalized' : sortConfig.key;
      const aVal = a[key] ?? '';
      const bVal = b[key] ?? '';
      if (aVal !== bVal) {
        if (aVal < bVal) return isAscending ? -1 : 1;
        if (aVal > bVal) return isAscending ? 1 : -1;
      }
    } else {
      // Default sort: tgl_normalized DESC
      const aTgl = a.tgl_normalized || a.tgl || '';
      const bTgl = b.tgl_normalized || b.tgl || '';
      if (aTgl !== bTgl) {
        return aTgl > bTgl ? -1 : 1;
      }
      // waktu DESC
      const aWaktu = a.waktu || '';
      const bWaktu = b.waktu || '';
      if (aWaktu !== bWaktu) {
        return aWaktu > bWaktu ? -1 : 1;
      }
    }

    const aPair = pairedInfo.get(a.id);
    const bPair = pairedInfo.get(b.id);

    // If both belong to the exact same pair: OUT first, then IN
    if (aPair && bPair && aPair.groupKey === bPair.groupKey) {
      return aPair.isOut ? -1 : 1;
    }

    // Secondary: created_at timestamp
    const aCreated = aPair ? aPair.time : (a.created_at ? new Date(a.created_at).getTime() : 0);
    const bCreated = bPair ? bPair.time : (b.created_at ? new Date(b.created_at).getTime() : 0);
    if (aCreated !== bCreated) {
      return aCreated > bCreated ? -1 : 1;
    }

    // Group tie breaker to keep pairs from getting separated by other items with same timestamp
    const aKey = aPair ? aPair.groupKey : a.id;
    const bKey = bPair ? bPair.groupKey : b.id;
    if (aKey !== bKey) {
      return aKey > bKey ? -1 : 1;
    }

    return a.id > b.id ? -1 : 1;
  });
}

async function test() {
  const { data } = await supabase
    .from('database_log')
    .select('id, sku, type, gudang, tgl, tgl_scan, waktu, jumlah, rak, created_at')
    .ilike('sku', 'PENCILCOLOR-CP-24PB')
    .order('created_at', { ascending: false })
    .limit(16);

  const mapped = data.map(d => ({
    ...d,
    tgl_normalized: d.tgl
  }));

  const sorted = sortLogRowsAdvanced(mapped);
  console.table(sorted.map(s => ({
    type: s.type,
    gudang: s.gudang,
    rak: s.rak,
    jumlah: s.jumlah,
    tgl: s.tgl,
    waktu: s.waktu,
    created_at: s.created_at.split('T')[1]
  })));
}

test();
