import { supabase } from '../lib/supabase';

const STORAGE_KEY = 'last_auto_fix_transfer_timestamp';
const ONE_HOUR_MS = 60 * 60 * 1000;
let isExecuting = false;

/**
 * Runs the TRANSFER date fixing logic completely in the background.
 * Matches TRANSFER OUT & IN pairs with original supplier IN receipts.
 */
export const runAutoFixTransferDates = async (silent = true): Promise<number> => {
  try {
    if (!silent) console.log('🔄 Checking background TRANSFER dates...');

    // 1. Fetch all TRANSFER log entries
    const { data: allTransferLogs, error: transferError } = await supabase
      .from('database_log')
      .select('id, sku, type, tgl, tgl_scan, waktu, jumlah, created_at')
      .eq('gudang', 'TRANSFER');

    if (transferError || !allTransferLogs || allTransferLogs.length === 0) {
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

    // 2. Fetch original IN receipt logs per unique SKU
    const inReceiptsBySku = new Map<string, any[]>();
    const skuChunkSize = 25;

    for (let i = 0; i < uniqueSkus.length; i += skuChunkSize) {
      const chunkSkus = uniqueSkus.slice(i, i + skuChunkSize);
      await Promise.all(
        chunkSkus.map(async (sku) => {
          const { data } = await supabase
            .from('database_log')
            .select('tgl, tgl_scan, created_at')
            .ilike('sku', sku)
            .eq('type', 'IN')
            .neq('gudang', 'TRANSFER')
            .order('created_at', { ascending: true });

          if (data && data.length > 0) {
            const formatted = data.map(d => ({
              tgl: d.tgl,
              tgl_scan: d.tgl_scan || d.tgl,
              createdAt: new Date(d.created_at).getTime()
            }));
            inReceiptsBySku.set(sku.toUpperCase(), formatted);
          }
        })
      );
    }

    // Helper to find chronological IN date
    const findCorrectDate = (normSku: string, transferTimestamp: number) => {
      const list = inReceiptsBySku.get(normSku);
      if (!list || list.length === 0) return null;
      for (let i = list.length - 1; i >= 0; i--) {
        if (list[i].createdAt <= transferTimestamp) {
          return list[i];
        }
      }
      return list[0];
    };

    // 3. Process TRANSFER OUT logs and match pairs
    const updatesMap = new Map<string, { tgl: string; tgl_scan: string }>();
    const outPairs = new Map<string, { tgl: string; tgl_scan: string }>();

    const outLogs = allTransferLogs.filter(l => (l.type || '').trim().toUpperCase() === 'OUT');
    const inLogs = allTransferLogs.filter(l => (l.type || '').trim().toUpperCase() === 'IN');

    outLogs.forEach(outRow => {
      const normSku = (outRow.sku || '').trim().toUpperCase();
      const transferTime = new Date(outRow.created_at).getTime();
      const matched = findCorrectDate(normSku, transferTime);

      if (matched) {
        const correctTgl = matched.tgl;
        const correctTglScan = matched.tgl_scan;

        if (outRow.tgl !== correctTgl || outRow.tgl_scan !== correctTglScan) {
          updatesMap.set(outRow.id, { tgl: correctTgl, tgl_scan: correctTglScan });
        }

        const pairKey = `${normSku}|${(outRow.waktu || '').trim()}|${outRow.jumlah}`;
        outPairs.set(pairKey, { tgl: correctTgl, tgl_scan: correctTglScan });
      }
    });

    inLogs.forEach(inRow => {
      const normSku = (inRow.sku || '').trim().toUpperCase();
      const pairKey = `${normSku}|${(inRow.waktu || '').trim()}|${inRow.jumlah}`;
      const pairMatched = outPairs.get(pairKey);

      if (pairMatched) {
        if (inRow.tgl !== pairMatched.tgl || inRow.tgl_scan !== pairMatched.tgl_scan) {
          updatesMap.set(inRow.id, { tgl: pairMatched.tgl, tgl_scan: pairMatched.tgl_scan });
        }
      }
    });

    if (updatesMap.size === 0) {
      if (!silent) console.log('✓ All TRANSFER dates are already accurate.');
      return 0;
    }

    // 4. Batch update updatesMap in parallel chunks of 50
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
              log_update_user: 'AUTO_BG: Fix Transfer Date'
            })
            .eq('id', id)
        )
      );
      updatedCount += chunk.length;
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
