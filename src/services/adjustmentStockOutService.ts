import { supabase } from '../lib/supabase';
import { DatabaseService, DatabaseWriteMode } from '../lib/DatabaseService';
import { getRealtimeDateTime } from '../lib/transferDateHelper';

export interface AvailableStockItem {
  id: string;
  nama_produk: string;
  rak: string;
  sub_rak: string;
  satuan: string;
  packing: string;
  stok_awal: number;
  masuk: number;
  keluar: number;
  tersedia: number;
  outQty: number; // Jumlah yang akan di-out
  isSelected: boolean;
}

export interface AdjustmentStockOutSummary {
  totalSkusRequested: number;
  totalSkusFound: number;
  totalLocationsFound: number;
  totalStockAvailable: number;
  totalOutQty: number;
}

export interface ExecuteAdjustmentResult {
  success: boolean;
  processedCount: number;
  totalQtyOut: number;
  insertedLogsCount: number;
  updatedStockCount: number;
  error?: string;
}

/**
 * Parses user input that may contain multiple SKUs separated by commas, newlines, tabs, or semicolons
 */
export function parseMultipleSkus(input?: string | string[]): string[] {
  if (!input) return [];
  if (Array.isArray(input)) {
    return Array.from(new Set(input.map(s => s.trim()).filter(Boolean)));
  }
  return Array.from(new Set(
    input
      .split(/[\r\n,;\t]+/)
      .map(s => s.trim())
      .filter(Boolean)
  ));
}

/**
 * Fetches stock items for the specified SKUs where available stock (tersedia) > 0.
 * Mirrors Dashboard logic: filters out empty racks and aggregates if needed.
 */
export async function fetchAvailableStockForSkus(
  skus: string[],
  onProgress?: (stage: string, percent: number) => void
): Promise<{ items: AvailableStockItem[]; notFoundSkus: string[] }> {
  const cleanSkus = parseMultipleSkus(skus);
  if (cleanSkus.length === 0) {
    return { items: [], notFoundSkus: [] };
  }

  if (onProgress) onProgress('Memulai query stok barang...', 10);

  const CHUNK_SIZE = 50;
  const rawStockItems: any[] = [];
  const skuSetLower = new Set(cleanSkus.map(s => s.toLowerCase()));

  // If searching for just a single SKU or wildcard
  if (cleanSkus.length === 1 && cleanSkus[0].length >= 2) {
    const term = cleanSkus[0];
    const { data, error } = await supabase
      .from('stock_items')
      .select('id, nama_produk, packing, rak, sub_rak, satuan, stok_awal, masuk, keluar, tersedia, status')
      .ilike('nama_produk', `%${term}%`)
      .eq('status', 'Aktif');

    if (error) {
      console.error('Error querying single SKU stock_items:', error);
      throw error;
    }
    if (data) rawStockItems.push(...data);
  } else {
    // Multi SKU chunked querying
    const chunks: string[][] = [];
    for (let i = 0; i < cleanSkus.length; i += CHUNK_SIZE) {
      chunks.push(cleanSkus.slice(i, i + CHUNK_SIZE));
    }

    for (let c = 0; c < chunks.length; c++) {
      const chunk = chunks[c];
      const { data, error } = await supabase
        .from('stock_items')
        .select('id, nama_produk, packing, rak, sub_rak, satuan, stok_awal, masuk, keluar, tersedia, status')
        .in('nama_produk', chunk)
        .eq('status', 'Aktif');

      if (error) {
        console.error(`Error querying stock_items chunk ${c + 1}:`, error);
        throw error;
      }
      if (data) rawStockItems.push(...data);

      if (onProgress) {
        const percent = 10 + Math.round(((c + 1) / chunks.length) * 70);
        onProgress(`Memuat data (${c + 1}/${chunks.length} batch)...`, percent);
      }
    }
  }

  if (onProgress) onProgress('Menganalisis dan menyaring stok tersedia...', 85);

  // Process, calculate true physical stock, and filter only tersedia > 0
  const availableItems: AvailableStockItem[] = [];
  const foundSkusSet = new Set<string>();

  for (const item of rawStockItems) {
    const skuName = (item.nama_produk || '').trim();
    if (!skuName) continue;

    const formulaTersedia = (Number(item.stok_awal) || 0) + (Number(item.masuk) || 0) - (Number(item.keluar) || 0);
    const verifiedTersedia = (item.masuk !== undefined && item.keluar !== undefined && (Number(item.masuk) > 0 || Number(item.keluar) > 0 || (Number(item.stok_awal) || 0) > 0))
      ? formulaTersedia
      : (Number(item.tersedia) || 0);

    // Filter: HANYA yang tersedia > 0 di berbagai rak
    if (verifiedTersedia > 0) {
      foundSkusSet.add(skuName.toLowerCase());
      availableItems.push({
        id: item.id,
        nama_produk: skuName,
        rak: item.rak || '-',
        sub_rak: item.sub_rak || item.rak || '-',
        satuan: item.satuan || 'PCS',
        packing: item.packing || '',
        stok_awal: Number(item.stok_awal) || 0,
        masuk: Number(item.masuk) || 0,
        keluar: Number(item.keluar) || 0,
        tersedia: verifiedTersedia,
        outQty: verifiedTersedia, // Default out qty = seluruh stok tersedia
        isSelected: true // Default selected
      });
    }
  }

  // Find which requested SKUs had no available stock
  const notFoundSkus = cleanSkus.filter(s => !foundSkusSet.has(s.toLowerCase()));

  // Sort by SKU asc, Rak asc
  availableItems.sort((a, b) => {
    const skuComp = a.nama_produk.localeCompare(b.nama_produk);
    if (skuComp !== 0) return skuComp;
    return a.rak.localeCompare(b.rak);
  });

  if (onProgress) onProgress('Selesai memuat stok tersedia', 100);

  return {
    items: availableItems,
    notFoundSkus
  };
}

/**
 * Executes the Adjustment Stock OUT for selected items:
 * 1. Inserts OUT logs into database_log with gudang = 'PENYESUAIAN STOK OUT'
 * 2. Updates stock_items (keluar & tersedia)
 * 3. Handles dual-write (Supabase & Firebase)
 */
export async function executeAdjustmentStockOut(
  itemsToOut: AvailableStockItem[],
  options: {
    userName: string;
    writeMode: DatabaseWriteMode;
    onProgress?: (percent: number, current: number, total: number, message: string) => void;
  }
): Promise<ExecuteAdjustmentResult> {
  const validItems = itemsToOut.filter(i => i.isSelected && Number(i.outQty) > 0);
  if (validItems.length === 0) {
    return {
      success: false,
      processedCount: 0,
      totalQtyOut: 0,
      insertedLogsCount: 0,
      updatedStockCount: 0,
      error: 'Tidak ada item terpilih dengan Qty OUT > 0'
    };
  }

  const { userName, writeMode, onProgress } = options;
  const now = new Date();
  const { todayTgl, nowWaktu } = getRealtimeDateTime(now);
  let baseTimestamp = now.getTime();

  const total = validItems.length;
  let totalQtyOut = 0;
  const logEntries: any[] = [];

  if (onProgress) onProgress(10, 0, total, 'Menyiapkan entri log OUT penyesuaian...');

  // 1. Prepare log entries
  validItems.forEach((item, idx) => {
    const outQty = Math.min(Number(item.outQty) || 0, item.tersedia);
    totalQtyOut += outQty;
    baseTimestamp += 50; // increment created_at to preserve order

    logEntries.push({
      tgl: todayTgl,
      waktu: nowWaktu,
      sku: item.nama_produk,
      jumlah: outQty,
      type: 'OUT',
      gudang: 'PENYESUAIAN STOK OUT',
      rak: item.rak,
      sub_rak: item.sub_rak || item.rak,
      tgl_scan: todayTgl,
      tgl_normalized: todayTgl,
      is_adjustment: true,
      user_name: userName || 'DevMode Penyesuaian',
      created_at: new Date(baseTimestamp).toISOString()
    });
  });

  // 2. Insert logs in chunks
  const LOG_CHUNK_SIZE = 50;
  let insertedLogsCount = 0;
  for (let i = 0; i < logEntries.length; i += LOG_CHUNK_SIZE) {
    const chunk = logEntries.slice(i, i + LOG_CHUNK_SIZE);
    const { error: logError } = await DatabaseService.insertLogs(chunk, writeMode);
    if (logError) {
      console.error('Error creating adjustment stock out log entries:', logError);
      throw new Error(`Gagal mencatat log penyesuaian: ${logError.message}`);
    }
    insertedLogsCount += chunk.length;

    if (onProgress) {
      const percent = 10 + Math.round((insertedLogsCount / logEntries.length) * 40);
      onProgress(percent, insertedLogsCount, logEntries.length, `Menyimpan database log (${insertedLogsCount}/${logEntries.length})...`);
    }
  }

  // 3. Update stock_items in chunks / parallel
  if (onProgress) onProgress(55, 0, total, 'Memperbarui stok fisik (stock_items)...');

  let updatedStockCount = 0;
  const STOCK_UPDATE_CHUNK = 10;
  for (let i = 0; i < validItems.length; i += STOCK_UPDATE_CHUNK) {
    const chunk = validItems.slice(i, i + STOCK_UPDATE_CHUNK);
    await Promise.all(
      chunk.map(async (item) => {
        const outQty = Math.min(Number(item.outQty) || 0, item.tersedia);
        const newKeluar = (item.keluar || 0) + outQty;
        const newTersedia = Math.max(0, (item.tersedia || 0) - outQty);

        await DatabaseService.updateStockItem(
          item.id,
          {
            keluar: newKeluar,
            tersedia: newTersedia
          },
          writeMode
        );
      })
    );

    updatedStockCount += chunk.length;
    if (onProgress) {
      const percent = 55 + Math.round((updatedStockCount / total) * 40);
      onProgress(percent, updatedStockCount, total, `Memotong stok rak (${updatedStockCount}/${total})...`);
    }
  }

  if (onProgress) onProgress(100, total, total, 'Penyesuaian stok OUT berhasil diselesaikan!');

  return {
    success: true,
    processedCount: total,
    totalQtyOut,
    insertedLogsCount,
    updatedStockCount
  };
}
