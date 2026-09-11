import { supabase } from '../lib/supabase';
import { db } from '../lib/firebase';
import { collection, query, where, getDocs, writeBatch, doc } from 'firebase/firestore';

export interface SkuCasingMismatchItem {
  idBarang: string;
  currentName: string;
  targetName: string;
  stockRows: number;
  logRows: number;
  racks: string[];
}

export interface SkuCasingAuditResult {
  totalMaster: number;
  totalStockRows: number;
  totalMismatchSkus: number;
  totalStockMismatchRows: number;
  totalLogMismatchRows: number;
  items: SkuCasingMismatchItem[];
}

export interface SyncSkuCasingProgress {
  stage: 'idle' | 'fetching' | 'syncing' | 'completed' | 'error';
  current: number;
  total: number;
  message: string;
}

// Fetch all rows from a table in parallel batches
async function fetchAllTableRows<T>(table: string, columns: string): Promise<T[]> {
  const batchSize = 1000;
  const { count, error: countError } = await supabase
    .from(table)
    .select('id', { count: 'exact', head: true });

  if (countError) throw countError;
  const totalCount = count || 0;
  if (totalCount === 0) return [];

  const numBatches = Math.ceil(totalCount / batchSize);
  const batchPromises = [];

  for (let i = 0; i < numBatches; i++) {
    const from = i * batchSize;
    const to = from + batchSize - 1;
    batchPromises.push(
      supabase
        .from(table)
        .select(columns)
        .range(from, to)
    );
  }

  const results = await Promise.all(batchPromises);
  const errors = results.filter(r => r.error).map(r => r.error);
  if (errors.length > 0) throw errors[0];

  return results.flatMap(r => (r.data || []) as T[]);
}

export async function auditSkuCasing(
  onProgress?: (progress: SyncSkuCasingProgress) => void
): Promise<SkuCasingAuditResult> {
  onProgress?.({
    stage: 'fetching',
    current: 10,
    total: 100,
    message: 'Memuat data master products dari Data SKU...'
  });

  const products = await fetchAllTableRows<{ id_barang: string; nama: string }>('products', 'id_barang, nama');
  const masterMap = new Map<string, { id_barang: string; nama: string }>();
  products.forEach(p => {
    if (p.nama) masterMap.set(p.nama.toLowerCase().trim(), p);
  });

  onProgress?.({
    stage: 'fetching',
    current: 40,
    total: 100,
    message: 'Memuat seluruh data stock_items dari Data Gudang...'
  });

  const stockItems = await fetchAllTableRows<{ id: string; nama_produk: string; rak: string }>('stock_items', 'id, nama_produk, rak');

  onProgress?.({
    stage: 'fetching',
    current: 70,
    total: 100,
    message: 'Memuat data database_log untuk pengecekan transaksi...'
  });

  const logs = await fetchAllTableRows<{ id: string; sku: string }>('database_log', 'id, sku');

  onProgress?.({
    stage: 'fetching',
    current: 90,
    total: 100,
    message: 'Menganalisis perbedaan huruf besar/kecil...'
  });

  const skuStats = new Map<string, SkuCasingMismatchItem>();

  stockItems.forEach(s => {
    if (!s.nama_produk) return;
    const cur = s.nama_produk.trim();
    const curLower = cur.toLowerCase();

    // 1. Direct match
    let targetName: string | null = null;
    let idBarang = '-';

    const directMaster = masterMap.get(curLower);
    if (directMaster && directMaster.nama !== cur) {
      targetName = directMaster.nama;
      idBarang = directMaster.id_barang || '-';
    } else {
      // 2. Match with suffix like (LANTAI 4)
      const suffixMatch = cur.match(/^(.*?)\s*(\([^\)]+\))\s*$/);
      if (suffixMatch) {
        const baseNameLower = suffixMatch[1].trim().toLowerCase();
        const suffix = suffixMatch[2].trim();
        const baseMaster = masterMap.get(baseNameLower);
        if (baseMaster) {
          const expectedFullName = `${baseMaster.nama} ${suffix}`;
          if (expectedFullName !== cur) {
            targetName = expectedFullName;
            idBarang = baseMaster.id_barang || '-';
          }
        }
      }
    }

    if (targetName) {
      if (!skuStats.has(cur)) {
        skuStats.set(cur, {
          idBarang,
          currentName: cur,
          targetName,
          stockRows: 0,
          logRows: 0,
          racks: []
        });
      }
      const stat = skuStats.get(cur)!;
      stat.stockRows++;
      if (s.rak && !stat.racks.includes(s.rak)) {
        stat.racks.push(s.rak);
      }
    }
  });

  logs.forEach(l => {
    if (!l.sku) return;
    const cur = l.sku.trim();
    const curLower = cur.toLowerCase();

    let targetName: string | null = null;
    let idBarang = '-';

    const directMaster = masterMap.get(curLower);
    if (directMaster && directMaster.nama !== cur) {
      targetName = directMaster.nama;
      idBarang = directMaster.id_barang || '-';
    } else {
      const suffixMatch = cur.match(/^(.*?)\s*(\([^\)]+\))\s*$/);
      if (suffixMatch) {
        const baseNameLower = suffixMatch[1].trim().toLowerCase();
        const suffix = suffixMatch[2].trim();
        const baseMaster = masterMap.get(baseNameLower);
        if (baseMaster) {
          const expectedFullName = `${baseMaster.nama} ${suffix}`;
          if (expectedFullName !== cur) {
            targetName = expectedFullName;
            idBarang = baseMaster.id_barang || '-';
          }
        }
      }
    }

    if (targetName) {
      if (skuStats.has(cur)) {
        skuStats.get(cur)!.logRows++;
      } else {
        skuStats.set(cur, {
          idBarang,
          currentName: cur,
          targetName,
          stockRows: 0,
          logRows: 1,
          racks: []
        });
      }
    }
  });

  const items = Array.from(skuStats.values()).sort((a, b) => a.currentName.localeCompare(b.currentName));
  const totalStockMismatchRows = items.reduce((acc, item) => acc + item.stockRows, 0);
  const totalLogMismatchRows = items.reduce((acc, item) => acc + item.logRows, 0);

  onProgress?.({
    stage: 'completed',
    current: 100,
    total: 100,
    message: `Audit selesai. Ditemukan ${items.length} SKU dengan perbedaan casing.`
  });

  return {
    totalMaster: products.length,
    totalStockRows: stockItems.length,
    totalMismatchSkus: items.length,
    totalStockMismatchRows,
    totalLogMismatchRows,
    items
  };
}

export async function executeSkuCasingSync(
  items: SkuCasingMismatchItem[],
  onProgress?: (progress: SyncSkuCasingProgress) => void
): Promise<{ success: boolean; updatedStockRows: number; updatedLogRows: number; error?: string }> {
  try {
    let updatedStockRows = 0;
    let updatedLogRows = 0;
    const totalItems = items.length;

    for (let i = 0; i < totalItems; i++) {
      const item = items[i];
      onProgress?.({
        stage: 'syncing',
        current: i + 1,
        total: totalItems,
        message: `Menyelaraskan (${i + 1}/${totalItems}): "${item.currentName}" ➔ "${item.targetName}"...`
      });

      // Update stock_items in Supabase
      if (item.stockRows > 0) {
        const { data: stockData, error: stockErr } = await supabase
          .from('stock_items')
          .update({
            nama_produk: item.targetName,
            updated_at: new Date().toISOString()
          })
          .eq('nama_produk', item.currentName)
          .select('id');

        if (stockErr) throw stockErr;
        if (stockData) updatedStockRows += stockData.length;

        // Also update Firebase Firestore stock_items
        try {
          const q = query(collection(db, 'stock_items'), where('nama_produk', '==', item.currentName));
          const snap = await getDocs(q);
          if (!snap.empty) {
            const batch = writeBatch(db);
            snap.docs.forEach(d => {
              batch.update(doc(db, 'stock_items', d.id), {
                nama_produk: item.targetName,
                updated_at: new Date().toISOString()
              });
            });
            await batch.commit();
          }
        } catch (fbErr) {
          console.warn('Firebase sync warning:', fbErr);
        }
      }

      // Update database_log in Supabase
      if (item.logRows > 0) {
        const { data: logData, error: logErr } = await supabase
          .from('database_log')
          .update({ sku: item.targetName })
          .eq('sku', item.currentName)
          .select('id');

        if (logErr) throw logErr;
        if (logData) updatedLogRows += logData.length;
      }
    }

    onProgress?.({
      stage: 'completed',
      current: totalItems,
      total: totalItems,
      message: `Sukses sinkronisasi! ${updatedStockRows} baris stok & ${updatedLogRows} baris log diperbarui.`
    });

    return { success: true, updatedStockRows, updatedLogRows };
  } catch (err: any) {
    console.error('Error executing SKU casing sync:', err);
    onProgress?.({
      stage: 'error',
      current: 0,
      total: 0,
      message: err.message || 'Gagal sinkronisasi data'
    });
    return { success: false, updatedStockRows: 0, updatedLogRows: 0, error: err.message };
  }
}
