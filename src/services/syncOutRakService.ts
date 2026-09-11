import { supabase } from '../lib/supabase';

export interface MismatchedOutRakItem {
  id: string;
  sku: string;
  gudang: string;
  jumlah: number;
  tgl: string;
  tgl_scan: string;
  waktu: string;
  user?: string;
  created_at?: string;
  currentRak: string;
  currentSubRak?: string;
  correctRak: string;
  correctSubRak: string;
  inReceipt: {
    id: string;
    tgl: string;
    tgl_scan: string;
    waktu: string;
    gudang: string;
    rak: string;
    sub_rak?: string;
    jumlah: number;
  };
}

export interface SyncOutRakScanResult {
  mismatchedItems: MismatchedOutRakItem[];
  totalOutScanned: number;
  totalInReceipts: number;
  timestamp: string;
}

export async function scanMismatchedOutLogs(
  skuFilter?: string,
  onProgress?: (stage: string, percent: number) => void
): Promise<SyncOutRakScanResult> {
  const pageSize = 1000;

  // --- Step 1: Fetch IN receipts (gudang J or H) ---
  if (onProgress) onProgress('Memindai Nota Barang Masuk (Gudang J & H)...', 15);

  let inLogs: any[] = [];
  let inPage = 0;

  while (true) {
    let inQuery = supabase
      .from('database_log')
      .select('id, sku, type, gudang, rak, sub_rak, jumlah, tgl, tgl_scan, waktu, user_name, created_at')
      .eq('type', 'IN')
      .or('gudang.eq.J,gudang.eq.H');

    if (skuFilter && skuFilter.trim()) {
      inQuery = inQuery.eq('sku', skuFilter.trim());
    }

    const { data, error } = await inQuery
      .order('created_at', { ascending: false })
      .range(inPage * pageSize, (inPage + 1) * pageSize - 1);

    if (error) {
      console.error('Error fetching IN receipts:', error);
      throw error;
    }

    if (!data || data.length === 0) break;
    inLogs.push(...data);
    if (data.length < pageSize) break;
    inPage++;
    if (inPage > 100) break;
  }

  // Group IN receipts by `${sku}|${tgl_scan}`
  const inReceiptsMap = new Map<string, any[]>();
  inLogs.forEach((r) => {
    if (!r.sku || !r.tgl_scan) return;
    const key = `${r.sku.trim().toUpperCase()}|${r.tgl_scan.trim()}`;
    if (!inReceiptsMap.has(key)) {
      inReceiptsMap.set(key, []);
    }
    inReceiptsMap.get(key)!.push(r);
  });

  // --- Step 2: Fetch OUT logs (non-TRANSFER) ---
  if (onProgress) onProgress('Memindai Transaksi Potong Keluar (OUT)...', 50);

  let outLogs: any[] = [];
  let outPage = 0;

  while (true) {
    let outQuery = supabase
      .from('database_log')
      .select('id, sku, type, gudang, rak, sub_rak, jumlah, tgl, tgl_scan, waktu, user_name, created_at')
      .eq('type', 'OUT')
      .neq('gudang', 'TRANSFER');

    if (skuFilter && skuFilter.trim()) {
      outQuery = outQuery.eq('sku', skuFilter.trim());
    }

    const { data, error } = await outQuery
      .order('created_at', { ascending: false })
      .range(outPage * pageSize, (outPage + 1) * pageSize - 1);

    if (error) {
      console.error('Error fetching OUT logs:', error);
      throw error;
    }

    if (!data || data.length === 0) break;
    outLogs.push(...data);
    if (data.length < pageSize) break;
    outPage++;
    // If scanning a specific SKU, finish all pages; if scanning all, guard at 250k
    if (outPage > 250) break;
  }

  // --- Step 3: Match OUT with IN and identify rak differences ---
  if (onProgress) onProgress('Menganalisis Ketidaksesuaian Rak...', 85);

  const mismatchedItems: MismatchedOutRakItem[] = [];

  outLogs.forEach((out) => {
    if (!out.sku || !out.tgl_scan) return;
    const key = `${out.sku.trim().toUpperCase()}|${out.tgl_scan.trim()}`;
    const matchingIns = inReceiptsMap.get(key);
    if (!matchingIns || matchingIns.length === 0) return;

    // Pick the matching IN receipt
    const inReceipt = matchingIns[0];

    const curRak = (out.rak || '').trim();
    const curSubRak = (out.sub_rak || '').trim();
    const corRak = (inReceipt.rak || '').trim();
    const corSubRak = (inReceipt.sub_rak || inReceipt.rak || '').trim();

    const isRakDiff = curRak.toUpperCase() !== corRak.toUpperCase();
    const isSubRakDiff = curSubRak && corSubRak && curSubRak.toUpperCase() !== corSubRak.toUpperCase();

    if (isRakDiff || isSubRakDiff) {
      mismatchedItems.push({
        id: out.id,
        sku: out.sku,
        gudang: out.gudang || '',
        jumlah: Number(out.jumlah || 0),
        tgl: out.tgl || '',
        tgl_scan: out.tgl_scan || '',
        waktu: out.waktu || '',
        user: out.user_name || '',
        created_at: out.created_at || '',
        currentRak: curRak,
        currentSubRak: curSubRak,
        correctRak: corRak,
        correctSubRak: corSubRak,
        inReceipt: {
          id: inReceipt.id,
          tgl: inReceipt.tgl || '',
          tgl_scan: inReceipt.tgl_scan || '',
          waktu: inReceipt.waktu || '',
          gudang: inReceipt.gudang || '',
          rak: corRak,
          sub_rak: corSubRak,
          jumlah: Number(inReceipt.jumlah || 0)
        }
      });
    }
  });

  if (onProgress) onProgress('Selesai', 100);

  return {
    mismatchedItems,
    totalOutScanned: outLogs.length,
    totalInReceipts: inLogs.length,
    timestamp: new Date().toISOString()
  };
}

export async function restoreOutRakLogs(
  itemsToFix: { id: string; correctRak: string; correctSubRak: string }[],
  onProgress?: (processed: number, total: number) => void
): Promise<{ successCount: number; errorCount: number; errors: any[] }> {
  const batchSize = 30;
  let successCount = 0;
  let errorCount = 0;
  const errors: any[] = [];

  for (let i = 0; i < itemsToFix.length; i += batchSize) {
    const chunk = itemsToFix.slice(i, i + batchSize);

    const promises = chunk.map(async (item) => {
      try {
        const { error } = await supabase
          .from('database_log')
          .update({
            rak: item.correctRak,
            sub_rak: item.correctSubRak,
            log_update_user: 'DEVMODE: Sinkron Rak Nota Masuk'
          })
          .eq('id', item.id);

        if (error) {
          errorCount++;
          errors.push(error);
        } else {
          successCount++;
        }
      } catch (err) {
        errorCount++;
        errors.push(err);
      }
    });

    await Promise.all(promises);

    if (onProgress) {
      onProgress(Math.min(i + chunk.length, itemsToFix.length), itemsToFix.length);
    }
  }

  return { successCount, errorCount, errors };
}
