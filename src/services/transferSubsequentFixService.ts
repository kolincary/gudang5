import { supabase } from '../lib/supabase';
import { DatabaseService } from '../lib/DatabaseService';
import { DatabaseLogEntry } from '../components/DatabaseLog';
import { queryOptimizer } from '../lib/queryOptimizer';

export interface TransferMismatchItem {
  id: string;
  sku: string;
  tgl: string;
  waktu: string;
  tgl_scan?: string;
  user?: string;
  gudang?: string;
  type: string;
  jumlah: number;
  currentRak: string;
  currentSubRak?: string;
  suggestedRak: string;
  suggestedSubRak: string;
  reason: string;
  originRakBalance: number;
  destinationRakBalance: number;
}

export interface TransferMismatchDiagnosis {
  hasTransfer: boolean;
  transferDate: string;
  transferTime: string;
  transferOriginRak: string;
  transferDestinationRak: string;
  transferDestinationSubRak: string;
  transferQty: number;
  originRakBalance: number;
  destinationRakBalance: number;
  rackBalances: Record<string, number>;
  mismatches: TransferMismatchItem[];
  isImbalanced: boolean;
}

const normalizeDate = (dateStr?: string): string => {
  if (!dateStr) return '';
  let clean = dateStr.trim();
  if (clean.includes(' ') || clean.includes('T')) {
    clean = clean.split(/[ T]/)[0];
  }
  if (/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.test(clean)) {
    const m = clean.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
    if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  }
  if (/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.test(clean)) {
    const m = clean.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    if (m) {
      let d = m[1];
      let mo = m[2];
      const y = m[3];
      if (parseInt(mo) > 12 && parseInt(d) <= 12) [d, mo] = [mo, d];
      return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
  }
  return clean;
};

const normalizeTime = (timeStr?: string): string => {
  if (!timeStr) return '00:00:00';
  const clean = timeStr.trim().replace(/\./g, ':');
  const parts = clean.split(':');
  const h = (parts[0] || '00').padStart(2, '0');
  const m = (parts[1] || '00').padStart(2, '0');
  const s = (parts[2] || '00').padStart(2, '0');
  return `${h}:${m}:${s}`;
};

/**
 * Diagnoses whether there is a transfer allocation mismatch in the subsequent transactions.
 * For example, an item was transferred from Rack A29 to Rack A30, but a later OUT transaction
 * was erroneously deducted from A29 instead of A30, causing A29 to be in deficit (-72)
 * and A30 to retain a surplus (+72).
 */
export async function auditSubsequentTransferMismatch(
  referenceEntry: DatabaseLogEntry,
  candidateLogs?: DatabaseLogEntry[]
): Promise<TransferMismatchDiagnosis> {
  if (!referenceEntry || !referenceEntry.sku) {
    return {
      hasTransfer: false,
      transferDate: '',
      transferTime: '',
      transferOriginRak: '',
      transferDestinationRak: '',
      transferDestinationSubRak: '',
      transferQty: 0,
      originRakBalance: 0,
      destinationRakBalance: 0,
      rackBalances: {},
      mismatches: [],
      isImbalanced: false
    };
  }

  const targetSku = referenceEntry.sku.trim();
  const refDateNorm = normalizeDate(referenceEntry.tgl);
  const refTimeNorm = normalizeTime(referenceEntry.waktu);

  // 1. Fetch all transactions for this SKU safely with pagination and select('*')
  let allSkuLogs: any[] = [];
  try {
    let from = 0;
    const batchSize = 1000;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabase
        .from('database_log')
        .select('*')
        .ilike('sku', targetSku)
        .order('id', { ascending: true })
        .range(from, from + batchSize - 1);

      if (error) {
        console.warn('Error fetching all logs for SKU in transfer audit:', error);
        break;
      }

      if (data && data.length > 0) {
        allSkuLogs.push(...data);
        if (data.length < batchSize) {
          hasMore = false;
        } else {
          from += batchSize;
        }
      } else {
        hasMore = false;
      }
    }
  } catch (err) {
    console.error('Exception fetching SKU logs for transfer audit:', err);
  }

  // 1.5. Fetch initial stock from stock_items (mirroring Dashboard.tsx)
  const stockItemsMap: Record<string, number> = {};
  try {
    const { data: stockItems } = await supabase
      .from('stock_items')
      .select('rak, stok_awal')
      .ilike('nama_produk', targetSku)
      .eq('status', 'Aktif');

    if (stockItems && stockItems.length > 0) {
      stockItems.forEach((si: any) => {
        const r = (si.rak || '').trim().toUpperCase();
        if (r) {
          stockItemsMap[r] = (stockItemsMap[r] || 0) + Number(si.stok_awal || 0);
        }
      });
    }
  } catch (sErr) {
    console.warn('Warning fetching stock_items for audit:', sErr);
  }

  // Calculate current stock balance per rack (exactly matching Dashboard)
  const rackBalances: Record<string, number> = { ...stockItemsMap };
  allSkuLogs.forEach((row) => {
    const rakKey = (row.rak || '').trim().toUpperCase();
    if (!rakKey) return;
    const qty = Number(row.jumlah || 0);
    if (row.type === 'IN') {
      rackBalances[rakKey] = (rackBalances[rakKey] || 0) + qty;
    } else if (row.type === 'OUT') {
      rackBalances[rakKey] = (rackBalances[rakKey] || 0) - qty;
    }
  });

  // 2. Identify Transfer details (Origin Rak, Destination Rak, Qty)
  let originRak = '';
  let destinationRak = '';
  let destinationSubRak = '';
  let transferQty = 0;
  let transferDate = referenceEntry.tgl;
  let transferTime = referenceEntry.waktu;
  let hasTransfer = false;

  const isRefTransfer =
    (referenceEntry.gudang || '').toUpperCase().includes('TRANSFER') ||
    referenceEntry.type === 'MOVE';

  const pool = allSkuLogs.length > 0 ? allSkuLogs : (candidateLogs || []);

  if (isRefTransfer) {
    hasTransfer = true;
    if (referenceEntry.type === 'IN') {
      destinationRak = (referenceEntry.rak || '').trim().toUpperCase();
      destinationSubRak = (referenceEntry.sub_rak || referenceEntry.rak || '').trim().toUpperCase();
      transferQty = Number(referenceEntry.jumlah || 0);

      // Find matching paired OUT transfer
      const pairedOut =
        pool.find(
          (l) =>
            l.id !== referenceEntry.id &&
            l.type === 'OUT' &&
            ((l.gudang || '').toUpperCase().includes('TRANSFER') || l.type === 'MOVE') &&
            normalizeDate(l.tgl) === refDateNorm &&
            normalizeTime(l.waktu) === refTimeNorm
        ) ||
        pool.find(
          (l) =>
            l.id !== referenceEntry.id &&
            l.type === 'OUT' &&
            ((l.gudang || '').toUpperCase().includes('TRANSFER') || l.type === 'MOVE') &&
            normalizeDate(l.tgl) === refDateNorm &&
            Number(l.jumlah || 0) === transferQty
        );

      if (pairedOut) {
        originRak = (pairedOut.rak || '').trim().toUpperCase();
      }
    } else if (referenceEntry.type === 'OUT') {
      originRak = (referenceEntry.rak || '').trim().toUpperCase();
      transferQty = Number(referenceEntry.jumlah || 0);

      // Find matching paired IN transfer
      const pairedIn =
        pool.find(
          (l) =>
            l.id !== referenceEntry.id &&
            l.type === 'IN' &&
            ((l.gudang || '').toUpperCase().includes('TRANSFER') || l.type === 'MOVE') &&
            normalizeDate(l.tgl) === refDateNorm &&
            normalizeTime(l.waktu) === refTimeNorm
        ) ||
        pool.find(
          (l) =>
            l.id !== referenceEntry.id &&
            l.type === 'IN' &&
            ((l.gudang || '').toUpperCase().includes('TRANSFER') || l.type === 'MOVE') &&
            normalizeDate(l.tgl) === refDateNorm &&
            Number(l.jumlah || 0) === transferQty
        );

      if (pairedIn) {
        destinationRak = (pairedIn.rak || '').trim().toUpperCase();
        destinationSubRak = (pairedIn.sub_rak || pairedIn.rak || '').trim().toUpperCase();
      }
    }
  }

  // Fallback 1: If paired transfer was not found via strict timestamp, search pool for any matching transfer pair
  if (!originRak || !destinationRak) {
    const transferLogs = pool.filter(
      (l) => (l.gudang || '').toUpperCase().includes('TRANSFER') || l.type === 'MOVE'
    );
    for (let i = transferLogs.length - 1; i >= 0; i--) {
      const cur = transferLogs[i];
      if (cur.type === 'IN') {
        const pair = transferLogs.find(
          (p) =>
            p.id !== cur.id &&
            p.type === 'OUT' &&
            normalizeDate(p.tgl) === normalizeDate(cur.tgl) &&
            normalizeTime(p.waktu) === normalizeTime(cur.waktu)
        ) || transferLogs.find(
          (p) =>
            p.id !== cur.id &&
            p.type === 'OUT' &&
            normalizeDate(p.tgl) === normalizeDate(cur.tgl) &&
            Number(p.jumlah || 0) === Number(cur.jumlah || 0)
        );

        if (pair) {
          destinationRak = (cur.rak || '').trim().toUpperCase();
          destinationSubRak = (cur.sub_rak || cur.rak || '').trim().toUpperCase();
          originRak = (pair.rak || '').trim().toUpperCase();
          transferQty = Number(cur.jumlah || 0);
          transferDate = cur.tgl;
          transferTime = cur.waktu;
          hasTransfer = true;
          break;
        }
      }
    }
  }

  // Fallback 2: Smart Correlation with Dashboard Balances
  // If originRak is known (e.g. A29) but destinationRak is missing,
  // find which rack has a positive surplus in rackBalances that received a transfer
  if (originRak && !destinationRak) {
    const transferInLog = pool.find(
      (l) =>
        l.type === 'IN' &&
        ((l.gudang || '').toUpperCase().includes('TRANSFER') || l.type === 'MOVE') &&
        (l.rak || '').trim().toUpperCase() !== originRak
    );
    if (transferInLog) {
      destinationRak = (transferInLog.rak || '').trim().toUpperCase();
      destinationSubRak = (transferInLog.sub_rak || transferInLog.rak || '').trim().toUpperCase();
      hasTransfer = true;
    } else {
      // Pick rack with maximum positive surplus
      const surplusEntries = Object.entries(rackBalances).filter(([r, b]) => r !== originRak && b > 0);
      if (surplusEntries.length > 0) {
        surplusEntries.sort((a, b) => b[1] - a[1]);
        destinationRak = surplusEntries[0][0];
        destinationSubRak = destinationRak;
        hasTransfer = true;
      }
    }
  } else if (destinationRak && !originRak) {
    const transferOutLog = pool.find(
      (l) =>
        l.type === 'OUT' &&
        ((l.gudang || '').toUpperCase().includes('TRANSFER') || l.type === 'MOVE') &&
        (l.rak || '').trim().toUpperCase() !== destinationRak
    );
    if (transferOutLog) {
      originRak = (transferOutLog.rak || '').trim().toUpperCase();
      hasTransfer = true;
    } else {
      // Pick rack with deficit
      const deficitEntries = Object.entries(rackBalances).filter(([r, b]) => r !== destinationRak && b < 0);
      if (deficitEntries.length > 0) {
        deficitEntries.sort((a, b) => a[1] - b[1]);
        originRak = deficitEntries[0][0];
        hasTransfer = true;
      }
    }
  }

  // 3. Scan subsequent transactions for erroneous OUT deductions
  const subsequentList = (candidateLogs && candidateLogs.length > 0 ? candidateLogs : pool).filter((l) => {
    if (l.id === referenceEntry.id) return false;
    const dNorm = normalizeDate(l.tgl);
    const tNorm = normalizeTime(l.waktu);
    if (dNorm > refDateNorm) return true;
    if (dNorm === refDateNorm) return tNorm > refTimeNorm;
    return false;
  });

  const mismatches: TransferMismatchItem[] = [];

  const origBal = originRak ? (rackBalances[originRak] ?? 0) : 0;
  const destBal = destinationRak ? (rackBalances[destinationRak] ?? 0) : 0;
  const isImbalanced = (origBal < 0 && destBal > 0) || (origBal < 0);

  subsequentList.forEach((log) => {
    // Only inspect OUT transactions (pemotongan barang staf)
    if (log.type !== 'OUT') return;
    if ((log.gudang || '').toUpperCase().includes('TRANSFER')) return; // ignore transfer records themselves

    const currentRakNorm = (log.rak || '').trim().toUpperCase();
    const destRakNorm = (destinationRak || '').trim().toUpperCase();
    const origRakNorm = (originRak || '').trim().toUpperCase();

    if (!destRakNorm || currentRakNorm === destRakNorm) return;

    const currentRakBal = rackBalances[currentRakNorm] ?? 0;
    const isOriginRack = origRakNorm && currentRakNorm === origRakNorm;
    const isDeficitRack = currentRakBal < 0;
    const isDestSurplus = destBal > 0;

    // Trigger criteria:
    // 1. Transaction was deducted from the origin rack after goods were transferred to destination rack
    // OR 2. Transaction was deducted from a rack currently running in deficit while destination rack has surplus
    if (isOriginRack || (isDeficitRack && isDestSurplus)) {
      mismatches.push({
        id: log.id,
        sku: log.sku || targetSku,
        tgl: log.tgl,
        waktu: log.waktu,
        tgl_scan: log.tgl_scan,
        user: (log as any).user_name || log.user || '',
        gudang: log.gudang,
        type: log.type,
        jumlah: Number(log.jumlah || 0),
        currentRak: log.rak,
        currentSubRak: log.sub_rak,
        suggestedRak: destinationRak,
        suggestedSubRak: destinationSubRak || destinationRak,
        reason: isOriginRack
          ? `Barang telah ditransfer ke rak ${destinationRak}, namun staf memotong stok keluar di rak asal ${log.rak} (Saldo ${log.rak}: ${currentRakBal} unit, Saldo ${destinationRak}: +${destBal} unit).`
          : `Rak ${log.rak} tercatat defisit (${currentRakBal} unit) sementara rak tujuan transfer ${destinationRak} memiliki surplus stok (+${destBal} unit).`,
        originRakBalance: currentRakBal,
        destinationRakBalance: destBal
      });
    }
  });

  return {
    hasTransfer,
    transferDate,
    transferTime,
    transferOriginRak: originRak,
    transferDestinationRak: destinationRak,
    transferDestinationSubRak: destinationSubRak || destinationRak,
    transferQty,
    originRakBalance: origBal,
    destinationRakBalance: destBal,
    rackBalances,
    mismatches,
    isImbalanced
  };
}

/**
 * Executes rack correction for the selected mismatched logs.
 * Updates database_log rows and purges all dashboard & stock caches.
 */
export async function executeSubsequentTransferFix(
  items: TransferMismatchItem[],
  currentUser: string = 'DEVMODE'
): Promise<{ success: boolean; updatedCount: number; errors: any[] }> {
  if (!items || items.length === 0) {
    return { success: true, updatedCount: 0, errors: [] };
  }

  let updatedCount = 0;
  const errors: any[] = [];

  for (const item of items) {
    const updatePayload = {
      rak: item.suggestedRak,
      sub_rak: item.suggestedSubRak || item.suggestedRak,
      log_update_user: `${currentUser} (Fix Salah Rak Transfer ${item.currentRak}->${item.suggestedRak})`
    };

    try {
      // 1. Update in Supabase
      const { error: sbError } = await supabase
        .from('database_log')
        .update(updatePayload)
        .eq('id', item.id);

      if (sbError) {
        console.error(`Failed to update log ${item.id} in Supabase:`, sbError);
        errors.push({ id: item.id, error: sbError });
        continue;
      }

      // 2. Dual-write update to Firestore if supported
      try {
        await DatabaseService.updateLog(item.id, updatePayload, 'both');
      } catch (fbErr) {
        console.warn('Firebase sync warning during transfer fix:', fbErr);
      }

      updatedCount++;
    } catch (err: any) {
      console.error(`Exception updating log ${item.id}:`, err);
      errors.push({ id: item.id, error: err });
    }
  }

  // 3. Purge stock and dashboard caches to reflect clean balances immediately
  try {
    queryOptimizer.invalidateAllCache();
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.removeItem('dashboard_stock_cache');
      localStorage.removeItem('dashboard_products_cache');
      localStorage.removeItem('dashboard_logs_cache');
      localStorage.removeItem('stock_cache');
      localStorage.removeItem('globalStockCache');
    }
  } catch (cErr) {
    console.warn('Error clearing stock cache:', cErr);
  }

  return {
    success: errors.length === 0,
    updatedCount,
    errors
  };
}
