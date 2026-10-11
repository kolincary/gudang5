import { supabase } from '../lib/supabase';
import { DatabaseLogEntry } from '../components/DatabaseLog';

export interface TransferOutSyncItem {
  id: string;
  sku: string;
  jumlah: number;
  rak: string;
  sub_rak?: string;
  currentTgl: string;
  currentTglScan: string;
  targetTglScan: string;
  targetTgl: string;
  status: 'NEEDS_SYNC' | 'ALREADY_MATCHED' | 'NO_IN_FOUND';
  statusLabel: string;
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;
  matchedInRak: string;
  reason: string;
  created_at: string;
}

export interface TransferOutSyncSummary {
  totalScanned: number;
  totalNeedsSync: number;
  totalAlreadyMatched: number;
  totalNoInFound: number;
  totalQtyNeedsSync: number;
  filteredSku?: string;
}

export interface TransferOutSyncResult {
  summary: TransferOutSyncSummary;
  items: TransferOutSyncItem[];
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

const normalizeRak = (rak?: string): string => {
  return (rak || '').trim().toUpperCase().replace(/\./g, '');
};

/**
 * Scan all TRANSFER OUT rows in database_log, and match them with the
 * authentic IN arrival date in the origin rack (or supplier IN arrival).
 */
export async function scanTransferOutDiscrepancies(targetSkuFilter?: string): Promise<TransferOutSyncResult> {
  const cleanFilterSku = (targetSkuFilter || '').trim();

  // 1. Fetch TRANSFER OUT logs from database_log
  let query = supabase
    .from('database_log')
    .select('id, sku, tgl, tgl_scan, type, gudang, rak, sub_rak, jumlah, waktu, created_at')
    .eq('gudang', 'TRANSFER')
    .eq('type', 'OUT')
    .order('created_at', { ascending: false });

  if (cleanFilterSku) {
    query = query.ilike('sku', cleanFilterSku);
  }

  // Fetch up to 2000 transfer out logs
  const { data: transferOutLogs, error: transferError } = await query.limit(2000);

  if (transferError) {
    throw transferError;
  }

  const outLogs = transferOutLogs || [];
  if (outLogs.length === 0) {
    return {
      summary: {
        totalScanned: 0,
        totalNeedsSync: 0,
        totalAlreadyMatched: 0,
        totalNoInFound: 0,
        totalQtyNeedsSync: 0,
        filteredSku: cleanFilterSku
      },
      items: []
    };
  }

  // 2. Collect unique SKUs from TRANSFER OUT
  const uniqueSkus = Array.from(new Set(outLogs.map(l => (l.sku || '').trim().toUpperCase()))).filter(Boolean);

  // 3. Fetch IN logs for these SKUs in chunks of 50
  const inLogsBySku = new Map<string, DatabaseLogEntry[]>();
  const existingOutsBySku = new Map<string, { rak: string; tgl_scan: string; jumlah: number }[]>();
  const CHUNK_SIZE = 50;

  for (let i = 0; i < uniqueSkus.length; i += CHUNK_SIZE) {
    const skuBatch = uniqueSkus.slice(i, i + CHUNK_SIZE);
    const { data: inData, error: inError } = await supabase
      .from('database_log')
      .select('id, sku, tgl, tgl_scan, type, gudang, rak, sub_rak, jumlah, waktu, created_at')
      .in('sku', skuBatch)
      .eq('type', 'IN')
      .order('created_at', { ascending: true });

    if (!inError && inData) {
      inData.forEach(item => {
        const normSku = (item.sku || '').trim().toUpperCase();
        if (!inLogsBySku.has(normSku)) {
          inLogsBySku.set(normSku, []);
        }
        inLogsBySku.get(normSku)!.push(item as DatabaseLogEntry);
      });
    }

    // Ambil log OUT non-transfer untuk menghitung konsumsi stok di rak & tgl_scan tersebut
    const { data: outNonTransferData } = await supabase
      .from('database_log')
      .select('sku, rak, tgl_scan, jumlah')
      .in('sku', skuBatch)
      .eq('type', 'OUT')
      .neq('gudang', 'TRANSFER');

    if (outNonTransferData) {
      outNonTransferData.forEach(item => {
        const normSku = (item.sku || '').trim().toUpperCase();
        if (!existingOutsBySku.has(normSku)) {
          existingOutsBySku.set(normSku, []);
        }
        existingOutsBySku.get(normSku)!.push({
          rak: normalizeRak(item.rak),
          tgl_scan: normalizeDate(item.tgl_scan),
          jumlah: Number(item.jumlah) || 0
        });
      });
    }
  }

  // Siapkan map kapasitas per IN log (dikurangi konsumsi OUT non-transfer yang sudah ada)
  const inCapacityMap = new Map<string, number>();
  inLogsBySku.forEach((inList, skuKey) => {
    const outs = existingOutsBySku.get(skuKey) || [];
    inList.forEach(inItem => {
      const inRak = normalizeRak(inItem.rak);
      const inScan = normalizeDate(inItem.tgl_scan) || normalizeDate(inItem.tgl);
      // Hitung total OUT non-transfer yang sudah berada di tgl_scan & rak ini
      const consumedOnThisDate = outs
        .filter(o => o.rak === inRak && o.tgl_scan === inScan)
        .reduce((sum, o) => sum + o.jumlah, 0);

      // Sisa kapasitas yang benar-benar tersedia
      const available = Math.max(0, (Number(inItem.jumlah) || 0) - consumedOnThisDate);
      inCapacityMap.set(inItem.id, available);
    });
  });

  // 4. Evaluate each TRANSFER OUT row
  const items: TransferOutSyncItem[] = [];
  let totalNeedsSync = 0;
  let totalAlreadyMatched = 0;
  let totalNoInFound = 0;
  let totalQtyNeedsSync = 0;

  outLogs.forEach(row => {
    const normSku = (row.sku || '').trim().toUpperCase();
    const rowRakNorm = normalizeRak(row.rak);
    const availableInLogs = inLogsBySku.get(normSku) || [];
    const transferCreatedAt = new Date(row.created_at).getTime();
    const rowQty = Number(row.jumlah) || 0;

    // Prioritas 1: Log IN di rak yang SAMA PERSIS dengan kapasitas tersisa yang cukup (>= rowQty)
    let matchedIn = availableInLogs.find(inLog => {
      if (normalizeRak(inLog.rak) !== rowRakNorm) return false;
      if ((inLog.gudang || '').toUpperCase() === 'TRANSFER') return false;
      if (new Date(inLog.created_at || '').getTime() > transferCreatedAt + 60000) return false;
      const cap = inCapacityMap.get(inLog.id) ?? 0;
      return cap >= rowQty;
    });

    // Prioritas 2: Log IN apa pun di rak yang SAMA PERSIS dengan kapasitas tersisa > 0
    if (!matchedIn) {
      matchedIn = availableInLogs.find(inLog => {
        if (normalizeRak(inLog.rak) !== rowRakNorm) return false;
        if (new Date(inLog.created_at || '').getTime() > transferCreatedAt + 60000) return false;
        const cap = inCapacityMap.get(inLog.id) ?? 0;
        return cap > 0;
      });
    }

    // Kurangi kapasitas yang digunakan jika matched
    if (matchedIn) {
      const currentCap = inCapacityMap.get(matchedIn.id) ?? 0;
      inCapacityMap.set(matchedIn.id, Math.max(0, currentCap - rowQty));
    }

    const currentTglNorm = normalizeDate(row.tgl);
    const currentScanNorm = normalizeDate(row.tgl_scan);

    if (matchedIn) {
      const targetScanNorm = normalizeDate(matchedIn.tgl_scan) || normalizeDate(matchedIn.tgl);
      const targetTglNorm = normalizeDate(matchedIn.tgl);

      const isDiscrepant = currentScanNorm !== targetScanNorm;

      if (isDiscrepant) {
        totalNeedsSync++;
        totalQtyNeedsSync += Number(row.jumlah) || 0;
        items.push({
          id: row.id,
          sku: row.sku,
          jumlah: Number(row.jumlah) || 0,
          rak: row.rak,
          sub_rak: row.sub_rak,
          currentTgl: currentTglNorm,
          currentTglScan: currentScanNorm,
          targetTglScan: targetScanNorm,
          targetTgl: targetTglNorm,
          status: 'NEEDS_SYNC',
          statusLabel: '⚠️ Perlu Diselaraskan',
          badgeBg: 'bg-amber-100',
          badgeText: 'text-amber-800',
          badgeBorder: 'border-amber-300',
          matchedInRak: matchedIn.rak,
          reason: `Tgl scan OUT (${currentScanNorm}) tidak sesuai dengan barang masuk di rak asal ${matchedIn.rak} (${targetScanNorm})`,
          created_at: row.created_at
        });
      } else {
        totalAlreadyMatched++;
        items.push({
          id: row.id,
          sku: row.sku,
          jumlah: Number(row.jumlah) || 0,
          rak: row.rak,
          sub_rak: row.sub_rak,
          currentTgl: currentTglNorm,
          currentTglScan: currentScanNorm,
          targetTglScan: targetScanNorm,
          targetTgl: targetTglNorm,
          status: 'ALREADY_MATCHED',
          statusLabel: '✓ Sudah Klop',
          badgeBg: 'bg-emerald-100',
          badgeText: 'text-emerald-800',
          badgeBorder: 'border-emerald-300',
          matchedInRak: matchedIn.rak,
          reason: `Sudah klop dengan tgl masuk di rak ${matchedIn.rak} (${targetScanNorm})`,
          created_at: row.created_at
        });
      }
    } else {
      totalNoInFound++;
      items.push({
        id: row.id,
        sku: row.sku,
        jumlah: Number(row.jumlah) || 0,
        rak: row.rak,
        sub_rak: row.sub_rak,
        currentTgl: currentTglNorm,
        currentTglScan: currentScanNorm,
        targetTglScan: currentScanNorm,
        targetTgl: currentTglNorm,
        status: 'NO_IN_FOUND',
        statusLabel: 'Tidak Ada Data IN',
        badgeBg: 'bg-slate-100',
        badgeText: 'text-slate-700',
        badgeBorder: 'border-slate-300',
        matchedInRak: '-',
        reason: 'Tidak ditemukan riwayat log barang masuk (IN) untuk SKU ini di database',
        created_at: row.created_at
      });
    }
  });

  // Urutkan yang perlu disinkronkan terlebih dahulu
  items.sort((a, b) => {
    if (a.status === 'NEEDS_SYNC' && b.status !== 'NEEDS_SYNC') return -1;
    if (a.status !== 'NEEDS_SYNC' && b.status === 'NEEDS_SYNC') return 1;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  const summary: TransferOutSyncSummary = {
    totalScanned: outLogs.length,
    totalNeedsSync,
    totalAlreadyMatched,
    totalNoInFound,
    totalQtyNeedsSync,
    filteredSku: cleanFilterSku
  };

  return { summary, items };
}

/**
 * Execute batch update in Supabase database_log for all selected TransferOutSyncItem
 */
export async function executeBatchSyncTransferOut(
  itemsToSync: TransferOutSyncItem[],
  onProgress?: (current: number, total: number, percent: number) => void
): Promise<{ successCount: number; errorCount: number; errors: any[] }> {
  const syncCandidates = itemsToSync.filter(i => i.status === 'NEEDS_SYNC');
  const total = syncCandidates.length;

  if (total === 0) {
    return { successCount: 0, errorCount: 0, errors: [] };
  }

  let successCount = 0;
  let errorCount = 0;
  const errors: any[] = [];
  const batchSize = 50;

  for (let i = 0; i < total; i += batchSize) {
    const chunk = syncCandidates.slice(i, i + batchSize);
    const todayStr = new Date().toISOString().slice(0, 10);

    await Promise.all(
      chunk.map(async item => {
        try {
          const { error } = await supabase
            .from('database_log')
            .update({
              tgl_scan: item.targetTglScan,
              log_update_user: `DEVMODE: Sync Transfer Out Scan Date (${todayStr})`
            })
            .eq('id', item.id);

          if (error) {
            errorCount++;
            errors.push({ id: item.id, error });
          } else {
            successCount++;
          }
        } catch (err) {
          errorCount++;
          errors.push({ id: item.id, error: err });
        }
      })
    );

    const current = Math.min(i + batchSize, total);
    const percent = Math.round((current / total) * 100);
    if (onProgress) {
      onProgress(current, total, percent);
    }
  }

  return { successCount, errorCount, errors };
}
