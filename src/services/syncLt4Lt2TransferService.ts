import { supabase } from '../lib/supabase';

export interface Lt4Lt2TransferItem {
  id: string;
  sku: string;
  type: 'IN' | 'OUT';
  gudang: string;
  rak: string;
  sub_rak?: string;
  jumlah: number;
  tgl: string;
  tgl_scan: string;
  waktu?: string;
  created_at: string;
  currentScanDate: string;
  targetScanDate: string;
  targetWaktu?: string;
  isMismatch: boolean;
  matchReason: string;
  selected?: boolean;
}

export interface Lt4Lt2ScanResult {
  totalScanned: number;
  totalQtyTransferred: number;
  mismatchCount: number;
  matchedCount: number;
  items: Lt4Lt2TransferItem[];
}

/**
 * Normalizes SKU strings for matching
 */
const norm = (str?: string) => (str || '').trim().toUpperCase();

/**
 * Scans all TRANSFER records between LANTAI 4 and LANTAI 2 and pairs them
 * with their true incoming supplier receipts or sales OUT deductions.
 */
export async function scanLt4Lt2Transfers(filterSku?: string): Promise<Lt4Lt2ScanResult> {
  const cleanFilter = (filterSku || '').trim();

  // 1. Fetch all TRANSFER records involving LANTAI 4 or LANTAI 2
  let transferLogs: any[] = [];
  let from = 0;
  const batchSize = 1000;
  let hasMore = true;

  while (hasMore) {
    let query = supabase
      .from('database_log')
      .select('id, sku, type, gudang, rak, sub_rak, jumlah, tgl, tgl_scan, waktu, created_at, user_name')
      .eq('gudang', 'TRANSFER')
      .or('rak.eq.LANTAI 4,rak.eq.LANTAI 2')
      .order('created_at', { ascending: true })
      .range(from, from + batchSize - 1);

    if (cleanFilter) {
      query = query.ilike('sku', `%${cleanFilter}%`);
    }

    const { data, error } = await query;
    if (error) {
      console.error('Error fetching LT4-LT2 transfer logs:', error);
      throw error;
    }

    if (data && data.length > 0) {
      transferLogs.push(...data);
      from += batchSize;
      if (data.length < batchSize) hasMore = false;
    } else {
      hasMore = false;
    }
  }

  if (transferLogs.length === 0) {
    return {
      totalScanned: 0,
      totalQtyTransferred: 0,
      mismatchCount: 0,
      matchedCount: 0,
      items: []
    };
  }

  // 2. Extract unique SKUs
  const uniqueSkus = Array.from(new Set(transferLogs.map(r => norm(r.sku)).filter(Boolean)));

  // 3. Fetch Supplier Receipts in LANTAI 4 (type=IN, gudang!=TRANSFER) and regular OUTs in LANTAI 2 (type=OUT, gudang!=TRANSFER)
  const inReceiptsBySku = new Map<string, any[]>();
  const outDeductionsBySku = new Map<string, any[]>();
  const chunkSkuSize = 40;

  for (let i = 0; i < uniqueSkus.length; i += chunkSkuSize) {
    const chunk = uniqueSkus.slice(i, i + chunkSkuSize);

    // IN in LANTAI 4
    const { data: inData, error: inErr } = await supabase
      .from('database_log')
      .select('id, sku, type, gudang, rak, jumlah, tgl, tgl_scan, waktu, created_at')
      .in('sku', chunk)
      .eq('type', 'IN')
      .eq('rak', 'LANTAI 4')
      .neq('gudang', 'TRANSFER')
      .order('created_at', { ascending: true });

    if (inErr) console.warn('Error fetching inData in scanLt4Lt2Transfers:', inErr);
    if (inData) {
      inData.forEach(row => {
        const k = norm(row.sku);
        if (!inReceiptsBySku.has(k)) inReceiptsBySku.set(k, []);
        inReceiptsBySku.get(k)!.push(row);
      });
    }

    // OUT in LANTAI 2
    const { data: outData, error: outErr } = await supabase
      .from('database_log')
      .select('id, sku, type, gudang, rak, jumlah, tgl, tgl_scan, waktu, created_at')
      .in('sku', chunk)
      .eq('type', 'OUT')
      .eq('rak', 'LANTAI 2')
      .neq('gudang', 'TRANSFER')
      .order('created_at', { ascending: true });

    if (outErr) console.warn('Error fetching outData in scanLt4Lt2Transfers:', outErr);
    if (outData) {
      outData.forEach(row => {
        const k = norm(row.sku);
        if (!outDeductionsBySku.has(k)) outDeductionsBySku.set(k, []);
        outDeductionsBySku.get(k)!.push(row);
      });
    }
  }

  // 4. Evaluate each transfer log
  const items: Lt4Lt2TransferItem[] = [];
  let totalQtyTransferred = 0;

  transferLogs.forEach(tf => {
    const skuKey = norm(tf.sku);
    const inLt4List = inReceiptsBySku.get(skuKey) || [];
    const outLt2List = outDeductionsBySku.get(skuKey) || [];

    const currentScan = (tf.tgl_scan || tf.tgl || '').trim();
    const currentWaktu = tf.waktu || '';
    const tfCreated = new Date(tf.created_at || 0).getTime();

    let targetScan = currentScan;
    let targetWaktu = currentWaktu;
    let matchReason = 'Sudah sesuai / Klop';

    // Check if the currentScan is a dummy 2025 date while actual receipts are in 2026, or general mismatch
    const isDummy2025 = currentScan.startsWith('2025');

    if (isDummy2025 && inLt4List.length > 0) {
      // Find latest receipt in LT4 created before or around the transfer
      let matchedReceipt = null;
      for (let idx = inLt4List.length - 1; idx >= 0; idx--) {
        const rCreated = new Date(inLt4List[idx].created_at || 0).getTime();
        if (rCreated <= tfCreated + 86400000) {
          matchedReceipt = inLt4List[idx];
          break;
        }
      }
      if (!matchedReceipt) {
        matchedReceipt = inLt4List[inLt4List.length - 1];
      }

      if (matchedReceipt) {
        targetScan = (matchedReceipt.tgl_scan || matchedReceipt.tgl || '').trim();
        targetWaktu = matchedReceipt.waktu || currentWaktu;
        matchReason = `Nota Masuk LT4: Gudang ${matchedReceipt.gudang} (${targetScan})`;
      }
    } else if (isDummy2025 && outLt2List.length > 0) {
      // Fallback: Use the first sales deduction date on LANTAI 2
      const firstOut = outLt2List[0];
      targetScan = (firstOut.tgl_scan || firstOut.tgl || '').trim();
      targetWaktu = firstOut.waktu || currentWaktu;
      matchReason = `Dipotong di LT2: Gudang ${firstOut.gudang} (${targetScan})`;
    }

    const isMismatch = targetScan !== currentScan;
    totalQtyTransferred += Number(tf.jumlah || 0);

    items.push({
      id: tf.id,
      sku: tf.sku,
      type: tf.type,
      gudang: tf.gudang,
      rak: tf.rak,
      sub_rak: tf.sub_rak,
      jumlah: Number(tf.jumlah || 0),
      tgl: tf.tgl,
      tgl_scan: currentScan,
      waktu: tf.waktu,
      created_at: tf.created_at,
      currentScanDate: currentScan,
      targetScanDate: targetScan,
      targetWaktu,
      isMismatch,
      matchReason: isMismatch ? matchReason : '✅ Tanggal sudah sesuai',
      selected: isMismatch
    });
  });

  const mismatchCount = items.filter(i => i.isMismatch).length;
  const matchedCount = items.filter(i => !i.isMismatch).length;

  return {
    totalScanned: items.length,
    totalQtyTransferred,
    mismatchCount,
    matchedCount,
    items
  };
}

/**
 * Synchronizes a single transfer log entry's tgl_scan
 */
export async function syncSingleLt4Lt2Transfer(
  item: Lt4Lt2TransferItem,
  userName?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const updatePayload: any = {
      tgl_scan: item.targetScanDate,
      log_update_user: `DEVMODE: Sync LT4->LT2 (${userName || 'admin'})`
    };

    if (item.targetWaktu) {
      updatePayload.waktu = item.targetWaktu;
    }

    const { error } = await supabase
      .from('database_log')
      .update(updatePayload)
      .eq('id', item.id);

    if (error) throw error;
    return { success: true };
  } catch (err: any) {
    console.error('Error syncing single LT4->LT2 transfer:', err);
    return { success: false, error: err.message || 'Gagal update database' };
  }
}

/**
 * Synchronizes a batch of transfer log entries' tgl_scan grouped by target payload
 */
export async function syncBatchLt4Lt2Transfers(
  items: Lt4Lt2TransferItem[],
  userName?: string
): Promise<{ successCount: number; failCount: number; errors: string[] }> {
  let successCount = 0;
  let failCount = 0;
  const errors: string[] = [];

  // Group by targetScanDate + targetWaktu to do minimal SQL calls
  const groups = new Map<string, { targetScanDate: string; targetWaktu?: string; ids: string[] }>();

  items.forEach(it => {
    const key = `${it.targetScanDate}|||${it.targetWaktu || ''}`;
    if (!groups.has(key)) {
      groups.set(key, { targetScanDate: it.targetScanDate, targetWaktu: it.targetWaktu, ids: [] });
    }
    groups.get(key)!.ids.push(it.id);
  });

  const chunkSize = 100;

  for (const group of groups.values()) {
    for (let i = 0; i < group.ids.length; i += chunkSize) {
      const chunkIds = group.ids.slice(i, i + chunkSize);
      try {
        const updatePayload: any = {
          tgl_scan: group.targetScanDate,
          log_update_user: `DEVMODE: Sync LT4->LT2 Bulk (${userName || 'admin'})`
        };

        if (group.targetWaktu) {
          updatePayload.waktu = group.targetWaktu;
        }

        const { error } = await supabase
          .from('database_log')
          .update(updatePayload)
          .in('id', chunkIds);

        if (error) {
          failCount += chunkIds.length;
          errors.push(error.message);
        } else {
          successCount += chunkIds.length;
        }
      } catch (err: any) {
        failCount += chunkIds.length;
        errors.push(err.message || 'Gagal update chunk');
      }
    }
  }

  return { successCount, failCount, errors };
}
