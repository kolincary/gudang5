import { supabase } from '../lib/supabase';

export interface TransferPurgeItem {
  id: string;
  sku: string;
  type: 'IN' | 'OUT';
  gudang: string;
  rak: string;
  sub_rak?: string;
  jumlah: number;
  tgl: string;
  tgl_scan: string;
  waktu: string;
  user?: string;
  created_at?: string;
  isProtected: boolean;
  protectReason?: string;
}

export interface TransferPurgeScanResult {
  deletableLogs: TransferPurgeItem[];
  protectedLogs: TransferPurgeItem[];
  totalScanned: number;
  timestamp: string;
}

export const PROTECTED_TRANSFER_RAKS = [
  'LANTAI 2',
  'LANTAI 4',
  'ECER-M',
  'ECER-O',
  'ECER-N',
  'BLOK-I'
];

export const isProtectedTransferRak = (rak: string | null | undefined): boolean => {
  if (!rak) return false;
  const clean = rak.trim().toUpperCase();
  return PROTECTED_TRANSFER_RAKS.some(p => clean === p);
};

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

export async function scanTransferLogs(skuFilter?: string | string[]): Promise<TransferPurgeScanResult> {
  const parsedSkus = parseMultipleSkus(skuFilter);
  const pageSize = 1000;
  let allLogs: any[] = [];

  if (parsedSkus.length > 0) {
    const chunkSize = 50;
    for (let i = 0; i < parsedSkus.length; i += chunkSize) {
      const chunk = parsedSkus.slice(i, i + chunkSize);
      let page = 0;
      while (true) {
        let query = supabase
          .from('database_log')
          .select('id, sku, type, gudang, rak, sub_rak, jumlah, tgl, tgl_scan, waktu, user_name, created_at')
          .eq('gudang', 'TRANSFER');

        if (chunk.length === 1) {
          query = query.eq('sku', chunk[0]);
        } else {
          query = query.in('sku', chunk);
        }

        const { data, error } = await query
          .order('created_at', { ascending: false })
          .range(page * pageSize, (page + 1) * pageSize - 1);

        if (error) {
          console.error('Error fetching TRANSFER logs:', error);
          throw error;
        }

        if (!data || data.length === 0) break;
        allLogs.push(...data);
        if (data.length < pageSize) break;
        page++;
        if (page > 30) break;
      }
    }
  } else {
    let page = 0;
    while (true) {
      const { data, error } = await supabase
        .from('database_log')
        .select('id, sku, type, gudang, rak, sub_rak, jumlah, tgl, tgl_scan, waktu, user_name, created_at')
        .eq('gudang', 'TRANSFER')
        .order('created_at', { ascending: false })
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (error) {
        console.error('Error fetching TRANSFER logs:', error);
        throw error;
      }

      if (!data || data.length === 0) break;
      allLogs.push(...data);
      if (data.length < pageSize) break;
      page++;
      if (page > 30) break; // safety guard up to 30k rows
    }
  }

  const deletableLogs: TransferPurgeItem[] = [];
  const protectedLogs: TransferPurgeItem[] = [];

  allLogs.forEach((row) => {
    const isProt = isProtectedTransferRak(row.rak);
    const item: TransferPurgeItem = {
      id: row.id,
      sku: row.sku || '',
      type: (row.type || 'OUT').toUpperCase() as 'IN' | 'OUT',
      gudang: row.gudang || 'TRANSFER',
      rak: row.rak || '',
      sub_rak: row.sub_rak || '',
      jumlah: Number(row.jumlah || 0),
      tgl: row.tgl || '',
      tgl_scan: row.tgl_scan || '',
      waktu: row.waktu || '',
      user: row.user_name || '',
      created_at: row.created_at || '',
      isProtected: isProt,
      protectReason: isProt ? `Rak ${row.rak} termasuk daftar rak yang diproteksi` : undefined
    };

    if (isProt) {
      protectedLogs.push(item);
    } else {
      deletableLogs.push(item);
    }
  });

  return {
    deletableLogs,
    protectedLogs,
    totalScanned: allLogs.length,
    timestamp: new Date().toISOString()
  };
}

export async function deleteTransferLogs(
  idsToDelete: string[],
  onProgress?: (processed: number, total: number) => void
): Promise<{ successCount: number; errorCount: number; errors: any[] }> {
  const batchSize = 50;
  let successCount = 0;
  let errorCount = 0;
  const errors: any[] = [];

  for (let i = 0; i < idsToDelete.length; i += batchSize) {
    const chunk = idsToDelete.slice(i, i + batchSize);
    const { error } = await supabase
      .from('database_log')
      .delete()
      .in('id', chunk);

    if (error) {
      console.error(`Error deleting batch ${i / batchSize + 1}:`, error);
      errorCount += chunk.length;
      errors.push(error);
    } else {
      successCount += chunk.length;
    }

    if (onProgress) {
      onProgress(Math.min(i + chunk.length, idsToDelete.length), idsToDelete.length);
    }
  }

  return { successCount, errorCount, errors };
}
