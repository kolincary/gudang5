import { supabase } from '../lib/supabase';

export const PROTECTED_SYNC_RAKS = [
  'LANTAI 2',
  'LANTAI 4',
  'ECER-M',
  'ECER-O',
  'ECER-N',
  'BLOK-I'
];

export const isProtectedSyncRak = (rak: string | null | undefined): boolean => {
  if (!rak) return false;
  const clean = rak.trim().toUpperCase();
  return PROTECTED_SYNC_RAKS.some(p => clean === p);
};

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
  isProtected: boolean;
  protectReason?: string;
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
  restorableItems: MismatchedOutRakItem[];
  protectedItems: MismatchedOutRakItem[];
  totalOutScanned: number;
  totalInReceipts: number;
  timestamp: string;
}

/**
 * Parses user input that may contain multiple SKUs separated by commas, newlines, tabs, or semicolons
 */
export function parseMultipleSkus(input?: string | string[]): string[] {
  if (!input) return [];
  if (Array.isArray(input)) {
    return Array.from(new Set(input.map(s => s.trim().toUpperCase()).filter(Boolean)));
  }
  return Array.from(new Set(
    input
      .split(/[\r\n,;\t]+/)
      .map(s => s.trim().toUpperCase())
      .filter(Boolean)
  ));
}

export async function scanMismatchedOutLogs(
  skuFilter?: string | string[],
  onProgress?: (stage: string, percent: number) => void
): Promise<SyncOutRakScanResult> {
  const parsedSkus = parseMultipleSkus(skuFilter);
  const pageSize = 1000;

  // --- Step 1: Fetch IN receipts (gudang J or H) ---
  if (onProgress) onProgress('Memindai Nota Barang Masuk (Gudang J & H)...', 15);

  let inLogs: any[] = [];
  if (parsedSkus.length > 0) {
    const chunkSize = 50;
    for (let i = 0; i < parsedSkus.length; i += chunkSize) {
      const chunk = parsedSkus.slice(i, i + chunkSize);
      let inPage = 0;
      while (true) {
        let inQuery = supabase
          .from('database_log')
          .select('id, sku, type, gudang, rak, sub_rak, jumlah, tgl, tgl_scan, waktu, user_name, created_at')
          .eq('type', 'IN')
          .or('gudang.eq.J,gudang.eq.H');

        if (chunk.length === 1) {
          inQuery = inQuery.eq('sku', chunk[0]);
        } else {
          inQuery = inQuery.in('sku', chunk);
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
    }
  } else {
    let inPage = 0;
    while (true) {
      const { data, error } = await supabase
        .from('database_log')
        .select('id, sku, type, gudang, rak, sub_rak, jumlah, tgl, tgl_scan, waktu, user_name, created_at')
        .eq('type', 'IN')
        .or('gudang.eq.J,gudang.eq.H')
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
  if (parsedSkus.length > 0) {
    const chunkSize = 50;
    for (let i = 0; i < parsedSkus.length; i += chunkSize) {
      const chunk = parsedSkus.slice(i, i + chunkSize);
      let outPage = 0;
      while (true) {
        let outQuery = supabase
          .from('database_log')
          .select('id, sku, type, gudang, rak, sub_rak, jumlah, tgl, tgl_scan, waktu, user_name, created_at')
          .eq('type', 'OUT')
          .neq('gudang', 'TRANSFER');

        if (chunk.length === 1) {
          outQuery = outQuery.eq('sku', chunk[0]);
        } else {
          outQuery = outQuery.in('sku', chunk);
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
        if (outPage > 250) break;
      }
    }
  } else {
    let outPage = 0;
    while (true) {
      const { data, error } = await supabase
        .from('database_log')
        .select('id, sku, type, gudang, rak, sub_rak, jumlah, tgl, tgl_scan, waktu, user_name, created_at')
        .eq('type', 'OUT')
        .neq('gudang', 'TRANSFER')
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
      if (outPage > 250) break;
    }
  }

  // --- Step 3: Match OUT with IN and identify rak differences ---
  if (onProgress) onProgress('Menganalisis Ketidaksesuaian Rak...', 85);

  const mismatchedItems: MismatchedOutRakItem[] = [];
  const restorableItems: MismatchedOutRakItem[] = [];
  const protectedItems: MismatchedOutRakItem[] = [];

  outLogs.forEach((out) => {
    if (!out.sku || !out.tgl_scan) return;
    const key = `${out.sku.trim().toUpperCase()}|${out.tgl_scan.trim()}`;
    const matchingIns = inReceiptsMap.get(key);
    if (!matchingIns || matchingIns.length === 0) return;

    // Sort matching INs by created_at to pick the most relevant receipt
    const sortedIns = [...matchingIns].sort(
      (a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()
    );
    const chosenIn = sortedIns[0];

    const currentRak = (out.rak || '').trim();
    const correctRak = (chosenIn.rak || '').trim();
    const currentSubRak = (out.sub_rak || '').trim();
    const correctSubRak = (chosenIn.sub_rak || chosenIn.rak || '').trim();

    // Check if rack or sub_rak is mismatched
    const isRakMismatch = currentRak.toUpperCase() !== correctRak.toUpperCase();
    const isSubRakMismatch = currentSubRak.toUpperCase() !== correctSubRak.toUpperCase();

    if (isRakMismatch || isSubRakMismatch) {
      const isProt = isProtectedSyncRak(currentRak) || isProtectedSyncRak(correctRak);
      const protectReason = isProt
        ? `Rak ${currentRak} termasuk daftar rak khusus (LANTAI 2, LANTAI 4, ECER, BLOK-I) yang diproteksi`
        : undefined;

      const item: MismatchedOutRakItem = {
        id: out.id,
        sku: out.sku || '',
        gudang: out.gudang || '',
        jumlah: Number(out.jumlah || 0),
        tgl: out.tgl || '',
        tgl_scan: out.tgl_scan || '',
        waktu: out.waktu || '',
        user: out.user_name || '',
        created_at: out.created_at || '',
        currentRak,
        currentSubRak,
        correctRak,
        correctSubRak,
        isProtected: isProt,
        protectReason,
        inReceipt: {
          id: chosenIn.id,
          tgl: chosenIn.tgl || '',
          tgl_scan: chosenIn.tgl_scan || '',
          waktu: chosenIn.waktu || '',
          gudang: chosenIn.gudang || '',
          rak: chosenIn.rak || '',
          sub_rak: chosenIn.sub_rak || '',
          jumlah: Number(chosenIn.jumlah || 0)
        }
      };

      mismatchedItems.push(item);
      if (isProt) {
        protectedItems.push(item);
      } else {
        restorableItems.push(item);
      }
    }
  });

  return {
    mismatchedItems,
    restorableItems,
    protectedItems,
    totalOutScanned: outLogs.length,
    totalInReceipts: inLogs.length,
    timestamp: new Date().toISOString()
  };
}

export async function restoreOutRakLogs(
  updates: Array<{ id: string; correctRak: string; correctSubRak: string }>,
  onProgress?: (processed: number, total: number) => void
): Promise<{ successCount: number; errorCount: number; errors: any[] }> {
  const batchSize = 50;
  let successCount = 0;
  let errorCount = 0;
  const errors: any[] = [];

  // Group updates by target rak + sub_rak to batch update
  const groupedUpdates = new Map<string, { rak: string; sub_rak: string; ids: string[] }>();
  updates.forEach((u) => {
    const key = `${u.correctRak}|||${u.correctSubRak}`;
    if (!groupedUpdates.has(key)) {
      groupedUpdates.set(key, { rak: u.correctRak, sub_rak: u.correctSubRak, ids: [] });
    }
    groupedUpdates.get(key)!.ids.push(u.id);
  });

  let processed = 0;
  const total = updates.length;

  for (const group of groupedUpdates.values()) {
    for (let i = 0; i < group.ids.length; i += batchSize) {
      const chunkIds = group.ids.slice(i, i + batchSize);
      const { error } = await supabase
        .from('database_log')
        .update({
          rak: group.rak,
          sub_rak: group.sub_rak,
          log_update_user: 'DEVMODE: Sync Rak OUT Nota Masuk'
        })
        .in('id', chunkIds);

      if (error) {
        console.error('Error updating OUT rak batch:', error);
        errorCount += chunkIds.length;
        errors.push(error);
      } else {
        successCount += chunkIds.length;
      }

      processed += chunkIds.length;
      if (onProgress) {
        onProgress(Math.min(processed, total), total);
      }
    }
  }

  return { successCount, errorCount, errors };
}
