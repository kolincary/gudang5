import { supabase } from '../lib/supabase';

const STORAGE_KEY = 'last_auto_fix_transfer_timestamp';
const ONE_HOUR_MS = 60 * 60 * 1000;
let isExecuting = false;

/**
 * Runs the TRANSFER date fixing logic completely in the background.
 * Matches all TRANSFER logs (both OUT and IN) with original supplier IN receipts.
 */
export const runAutoFixTransferDates = async (silent = true): Promise<number> => {
  try {
    if (!silent) console.log('🔄 Checking background TRANSFER dates across all logs...');

    // 1. Fetch all TRANSFER log entries with pagination to bypass 1000 limit
    let allTransferLogs: any[] = [];
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

    if (allTransferLogs.length === 0) {
      return 0;
    }

    // Extract unique SKUs
    const uniqueSkusMap = new Map<string, string>();
    allTransferLogs.forEach(l => {
      const rawSku = (l.sku || '').trim();
      if (rawSku) uniqueSkusMap.set(rawSku.toUpperCase(), rawSku);
    });

    const uniqueSkus = Array.from(uniqueSkusMap.values());
    if (uniqueSkus.length === 0) return 0;

    // 2. Fetch original supplier IN receipt logs per unique SKU using .in()
    const inReceiptsBySku = new Map<string, any[]>();
    const skuChunkSize = 50;

    for (let i = 0; i < uniqueSkus.length; i += skuChunkSize) {
      const chunkSkus = uniqueSkus.slice(i, i + skuChunkSize);
      const { data: inData, error: inError } = await supabase
        .from('database_log')
        .select('sku, tgl, tgl_scan, waktu, rak, created_at')
        .in('sku', chunkSkus)
        .eq('type', 'IN')
        .neq('gudang', 'TRANSFER')
        .order('created_at', { ascending: true });

      if (inError) {
        console.warn('Error fetching chunk receipts in autoFixTransferService:', inError);
      }

      if (inData) {
        inData.forEach(row => {
          const k = (row.sku || '').trim().toUpperCase();
          if (!inReceiptsBySku.has(k)) inReceiptsBySku.set(k, []);
          inReceiptsBySku.get(k)!.push({
            tgl: row.tgl,
            tgl_scan: row.tgl_scan || row.tgl,
            waktu: row.waktu,
            rak: (row.rak || '').trim().toUpperCase(),
            createdAt: new Date(row.created_at).getTime()
          });
        });
      }
    }

    // Helper to find chronological IN date, prioritizing matching origin rack
    const findCorrectDate = (normSku: string, transferTimestamp: number, transferRak?: string) => {
      const list = inReceiptsBySku.get(normSku);
      if (!list || list.length === 0) return null;

      // 1. Try exact match by rack first if transferRak is provided
      if (transferRak) {
        const cleanRak = transferRak.trim().toUpperCase();
        // Look for receipt with matching rack created before or near transfer
        for (let i = list.length - 1; i >= 0; i--) {
          if (list[i].rak === cleanRak && list[i].createdAt <= transferTimestamp + 60000) {
            return list[i];
          }
        }
        // If not found before transfer, any matching rack receipt
        const anyRakMatch = list.find(l => l.rak === cleanRak);
        if (anyRakMatch) return anyRakMatch;
      }

      // 2. Fallback to closest chronological IN receipt before transfer
      for (let i = list.length - 1; i >= 0; i--) {
        if (list[i].createdAt <= transferTimestamp + 60000) {
          return list[i];
        }
      }
      return list[0];
    };

    // 3. Process all TRANSFER rows (both OUT and IN)
    const updatesMap = new Map<string, { tgl: string; tgl_scan: string; waktu?: string }>();

    allTransferLogs.forEach(row => {
      const normSku = (row.sku || '').trim().toUpperCase();
      const transferTime = new Date(row.created_at).getTime();
      const matched = findCorrectDate(normSku, transferTime, row.rak);

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

    if (updatesMap.size === 0) {
      if (!silent) console.log('✓ All TRANSFER dates are already accurate.');
      return 0;
    }

    // 4. Ultra-fast batch update: Group by target payload and update with .in('id', chunkIds)
    const payloadGroups = new Map<string, { tgl: string; tgl_scan: string; waktu?: string; ids: string[] }>();
    updatesMap.forEach((val, id) => {
      const key = `${val.tgl}|||${val.tgl_scan}|||${val.waktu || ''}`;
      if (!payloadGroups.has(key)) {
        payloadGroups.set(key, { tgl: val.tgl, tgl_scan: val.tgl_scan, waktu: val.waktu, ids: [] });
      }
      payloadGroups.get(key)!.ids.push(id);
    });

    let updatedCount = 0;
    const updateChunkSize = 100;

    for (const group of payloadGroups.values()) {
      for (let i = 0; i < group.ids.length; i += updateChunkSize) {
        const chunkIds = group.ids.slice(i, i + updateChunkSize);
        const updatePayload: any = {
          tgl: group.tgl,
          tgl_scan: group.tgl_scan,
          log_update_user: 'AUTO_BG: Fix Transfer Date'
        };
        if (group.waktu) {
          updatePayload.waktu = group.waktu;
        }

        const { error: updateErr } = await supabase
          .from('database_log')
          .update(updatePayload)
          .in('id', chunkIds);

        if (!updateErr) {
          updatedCount += chunkIds.length;
        }
      }
    }

    console.log(`✓ Background Auto-Fix Transfer: Successfully synced ${updatedCount} rows.`);
    return updatedCount;
  } catch (error) {
    console.error('Error in runAutoFixTransferDates:', error);
    return 0;
  }
};

/**
 * Initializes the background scheduler.
 * Runs every 1 hour automatically while users are active on the website.
 * Multi-tab & Multi-user safe via timestamp check.
 */
export const startAutoFixTransferScheduler = () => {
  const checkAndRun = async () => {
    if (isExecuting) return;

    try {
      const lastRunStr = localStorage.getItem(STORAGE_KEY);
      const lastRun = lastRunStr ? parseInt(lastRunStr, 10) : 0;
      const now = Date.now();

      // Check if 1 hour (3600000 ms) has passed
      if (now - lastRun < ONE_HOUR_MS) {
        return;
      }

      // Mark timestamp immediately to prevent concurrent runs across tabs
      localStorage.setItem(STORAGE_KEY, now.toString());
      isExecuting = true;

      // Run background fix silently
      await runAutoFixTransferDates(true);
    } catch (e) {
      console.warn('Background auto fix transfer encountered error:', e);
    } finally {
      isExecuting = false;
    }
  };

  // Initial check 10 seconds after app loads
  const initialTimer = setTimeout(() => {
    if ('requestIdleCallback' in window) {
      (window as any).requestIdleCallback(() => checkAndRun());
    } else {
      checkAndRun();
    }
  }, 10000);

  // Periodic check every 5 minutes
  const interval = setInterval(() => {
    if ('requestIdleCallback' in window) {
      (window as any).requestIdleCallback(() => checkAndRun());
    } else {
      checkAndRun();
    }
  }, 5 * 60 * 1000);

  return () => {
    clearTimeout(initialTimer);
    clearInterval(interval);
  };
};
