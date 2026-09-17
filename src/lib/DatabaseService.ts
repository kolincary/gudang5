import { supabase } from './supabase';
import { collection, getDocs, query as firestoreQuery, where, orderBy, limit, doc, setDoc, writeBatch, deleteDoc, getDoc, increment } from 'firebase/firestore';
import { db } from './firebase';
import { skuConversionService } from '../services/skuConversionService';

const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

const STOCK_COLLECTION = 'stock_items';

const COLLECTION_NAME = 'stock-lt3'; // Mimics database_log

export type DatabaseReadMode = 'supabase' | 'firebase';
export type DatabaseWriteMode = 'supabase' | 'firebase' | 'both';

export const DatabaseService = {
  async fetchLogs(options: {
    mode: DatabaseReadMode;
    filters: any;
    sortConfig: any;
    page: number;
    itemsPerPage: number;
    isMultiSearchSku: boolean;
  }) {
    if (options.mode === 'supabase') {
      let query = supabase
        .from('database_log')
        .select('*', { count: 'exact' });

      // Apply filters (Supabase logic)
      const { filters, isMultiSearchSku } = options;
      if (filters.sku) {
        if (isMultiSearchSku) {
          const skus = filters.sku.split(/[\n,]+/).map((s: string) => s.trim()).filter(Boolean);
          if (skus.length > 0) query = query.in('sku', skus);
        } else {
          query = query.eq('sku', filters.sku);
        }
      }
      if (filters.type) query = query.eq('type', filters.type);
      if (filters.gudang) query = query.ilike('gudang', `%${filters.gudang}%`);
      if (filters.user) query = query.ilike('user_name', `%${filters.user}%`);
      if (filters.rak) query = query.ilike('rak', `%${filters.rak}%`);
      if (filters.tanggal) {
        if (/^\d{4}-\d{2}-\d{2}$/.test(filters.tanggal)) {
          const [y, m, d] = filters.tanggal.split('-');
          query = query.or(`tgl.ilike.%${filters.tanggal}%,tgl.ilike.%${d}/${m}/${y}%,tgl.ilike.%${d}-${m}-${y}%`);
        } else {
          query = query.ilike('tgl', `%${filters.tanggal}%`);
        }
      }
      if (filters.waktu) query = query.ilike('waktu', `%${filters.waktu}%`);
      if (filters.tglScan) {
        if (/^\d{4}-\d{2}-\d{2}$/.test(filters.tglScan)) {
          const [y, m, d] = filters.tglScan.split('-');
          query = query.or(`tgl_scan.ilike.%${filters.tglScan}%,tgl_scan.ilike.%${d}/${m}/${y}%,tgl_scan.ilike.%${d}-${m}-${y}%`);
        } else {
          query = query.ilike('tgl_scan', `%${filters.tglScan}%`);
        }
      }
      if (filters.isAdjustment) query = query.eq('is_adjustment', filters.isAdjustment === 'true');

      // Apply Sort
      if (options.sortConfig) {
        if (options.sortConfig.key === 'tgl') {
          query = query.order('tgl_normalized', { ascending: options.sortConfig.direction === 'asc' });
        } else {
          query = query.order(options.sortConfig.key, { ascending: options.sortConfig.direction === 'asc' });
        }
        query = query
          .order('created_at', { ascending: false })
          .order('id', { ascending: false });
      } else {
        query = query
          .order('tgl_normalized', { ascending: false })
          .order('waktu', { ascending: false })
          .order('created_at', { ascending: false })
          .order('id', { ascending: false });
      }

      // Pagination
      const from = (options.page - 1) * options.itemsPerPage;
      const to = from + options.itemsPerPage - 1;
      query = query.range(from, to);

      const { data, count, error } = await query;
      if (error) throw error;
      return { data, count };
    } else {
      // FIREBASE FALLBACK LOGIC
      const colRef = collection(db, COLLECTION_NAME);
      let q = firestoreQuery(colRef);

      // Note: Firestore doesn't support generic 'ilike'. For fallback, we do exact matches where possible.
      const { filters, isMultiSearchSku } = options;
      if (filters.sku) {
        if (isMultiSearchSku) {
           const skus = filters.sku.split(/[\n,]+/).map((s: string) => s.trim()).filter(Boolean);
           if (skus.length > 0) q = firestoreQuery(q, where('sku', 'in', skus.slice(0, 10))); // Firebase 'in' is limited to 10
        } else {
           q = firestoreQuery(q, where('sku', '==', filters.sku));
        }
      }
      if (filters.type) q = firestoreQuery(q, where('type', '==', filters.type));
      if (filters.tanggal) q = firestoreQuery(q, where('tgl', '==', filters.tanggal));
      if (filters.tglScan) q = firestoreQuery(q, where('tgl_scan', '==', filters.tglScan));
      if (filters.isAdjustment) q = firestoreQuery(q, where('is_adjustment', '==', filters.isAdjustment === 'true'));
      
      // Get exact count first
      const { getCountFromServer } = await import('firebase/firestore');
      const countSnapshot = await getCountFromServer(q);
      const totalCount = countSnapshot.data().count;

      // Apply Sort
      if (options.sortConfig) {
        if (options.sortConfig.key === 'tgl') {
          q = firestoreQuery(q, orderBy('tgl_normalized', options.sortConfig.direction === 'asc' ? 'asc' : 'desc'));
        } else {
          q = firestoreQuery(q, orderBy(options.sortConfig.key, options.sortConfig.direction === 'asc' ? 'asc' : 'desc'));
        }
      } else {
        q = firestoreQuery(q, orderBy('tgl_normalized', 'desc'), orderBy('waktu', 'desc'));
      }
      
      // Calculate fetch limit based on page
      const limitCount = options.page * options.itemsPerPage;
      q = firestoreQuery(q, limit(limitCount));

      const snapshot = await getDocs(q);
      const allFetchedData = snapshot.docs.map(doc => doc.data());
      
      // Slice for current page
      const from = (options.page - 1) * options.itemsPerPage;
      const paginatedData = allFetchedData.slice(from);

      return { data: paginatedData, count: totalCount };
    }
  },

  async fetchLogsBySku(sku: string, mode: DatabaseReadMode) {
    if (mode === 'supabase') {
      const allLogs: any[] = [];
      let from = 0;
      const batchSize = 1000;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await supabase
          .from('database_log')
          .select('sku, rak, type, jumlah, created_at')
          .ilike('sku', sku)
          .in('type', ['IN', 'OUT'])
          .order('id', { ascending: true })
          .range(from, from + batchSize - 1);

        if (error) throw error;

        if (data && data.length > 0) {
          allLogs.push(...data);
          if (data.length < batchSize) {
            hasMore = false;
          } else {
            from += batchSize;
          }
        } else {
          hasMore = false;
        }
      }
      return allLogs;
    } else {
      const colRef = collection(db, COLLECTION_NAME);
      // Since Firebase lacks ilike, we do exact match. For Dashboard, productName is usually exact.
      // And we filter type locally since 'in' array filtering can be tricky combined with sku exact match in Firestore (needs composite index).
      const q = firestoreQuery(colRef, where('sku', '==', sku));
      const snapshot = await getDocs(q);
      const allData = snapshot.docs.map(doc => doc.data());
      return allData.filter(log => log.type === 'IN' || log.type === 'OUT');
    }
  },

  async insertLogs(items: any[], mode: DatabaseWriteMode) {
    if (mode === 'supabase' || mode === 'both') {
      const { data, error } = await supabase.from('database_log').insert(items).select();
      if (error) throw error;
      
      if (mode === 'both' && data) {
        (async () => {
          try {
            const chunkSize = 50;
            for (let i = 0; i < data.length; i += chunkSize) {
              const chunk = data.slice(i, i + chunkSize);
              const firestoreBatch = writeBatch(db);
              for (const item of chunk) {
                const docRef = doc(db, COLLECTION_NAME, item.id.toString());
                firestoreBatch.set(docRef, item);
              }
              await firestoreBatch.commit();
              await delay(500);
            }
            console.log('Firebase dual-write success for insertLogs');
          } catch (fbError) {
            console.error('Firebase dual-write failed:', fbError);
          }
        })();
      }
      return { data, error: null };
    } else if (mode === 'firebase') {
      // Pure firebase mode. Generate random IDs for the new logs.
      try {
        const newItems = [];
        const chunkSize = 50;
        for (let i = 0; i < items.length; i += chunkSize) {
          const chunk = items.slice(i, i + chunkSize);
          const firestoreBatch = writeBatch(db);
          for (const item of chunk) {
            const docRef = doc(collection(db, COLLECTION_NAME));
            const newItem = { ...item, id: docRef.id };
            firestoreBatch.set(docRef, newItem);
            newItems.push(newItem);
          }
          await firestoreBatch.commit();
        }
        return { data: newItems, error: null };
      } catch (error) {
        throw error;
      }
    }
  },

  async updateLog(id: string | number, updates: any, mode: DatabaseWriteMode) {
    if (mode === 'supabase' || mode === 'both') {
      const { error } = await supabase.from('database_log').update(updates).eq('id', id);
      if (error) throw error;
      
      if (mode === 'both') {
        (async () => {
          try {
            const docRef = doc(db, COLLECTION_NAME, id.toString());
            await setDoc(docRef, updates, { merge: true });
          } catch (fbError) {
            console.error('Firebase dual-write update failed:', fbError);
          }
        })();
      }
    } else if (mode === 'firebase') {
      try {
        const docRef = doc(db, COLLECTION_NAME, id.toString());
        await setDoc(docRef, updates, { merge: true });
      } catch (error) {
        throw error;
      }
    }
  },

  async reverseSyncOutToLantai3(items: any[]) {
    try {
      const STOK_COLLECTION = 'stok_lantai3';
      const TRX_COLLECTION = 'transaksi_lantai3';

      const outItems = items.filter(i => (i.type || '').toUpperCase().includes('OUT') && i.sku && i.jumlah);
      if (outItems.length === 0) return;

      const batch = writeBatch(db);

      // Fetch conversion map to reverse accurately in PCS
      const conversions = skuConversionService.getCachedConversions();
      const convMap = new Map<string, { sku_pcs: string; qty: number }>();
      conversions.forEach(c => {
        if (c.sku_konversi && c.sku_pcs) {
          convMap.set(c.sku_konversi.trim().toLowerCase(), {
            sku_pcs: c.sku_pcs.trim(),
            qty: Number(c.qty) || 1
          });
        }
      });
      
      const aggregated = new Map<string, {
         qtyToDeduct: number,
         monthlyDeducts: Map<string, { total: number, daily: Map<string, number> }>
      }>();

      for (const item of outItems) {
        let dateStr = new Date().toISOString().split('T')[0];
        if (item.tgl_scan) {
          if (item.tgl_scan.includes('T')) dateStr = item.tgl_scan.split('T')[0];
          else if (item.tgl_scan.includes(' ')) dateStr = item.tgl_scan.split(' ')[0];
          else dateStr = item.tgl_scan;
        }

        const yearMonth = dateStr.substring(0, 7);
        const todayKey = dateStr;

        const rawSku = (item.sku || '').trim();
        const conv = convMap.get(rawSku.toLowerCase());
        const finalSku = conv ? conv.sku_pcs : rawSku;
        const finalQty = conv ? (Number(item.jumlah) || 0) * conv.qty : (Number(item.jumlah) || 0);

        if (!aggregated.has(finalSku)) {
           aggregated.set(finalSku, { qtyToDeduct: 0, monthlyDeducts: new Map() });
        }
        
        const skuData = aggregated.get(finalSku)!;
        skuData.qtyToDeduct += finalQty;

        if (!skuData.monthlyDeducts.has(yearMonth)) {
            skuData.monthlyDeducts.set(yearMonth, { total: 0, daily: new Map() });
        }

        const monthData = skuData.monthlyDeducts.get(yearMonth)!;
        monthData.total += finalQty;
        
        const currentDaily = monthData.daily.get(todayKey) || 0;
        monthData.daily.set(todayKey, currentDaily + finalQty);
      }

      for (const [sku, skuData] of aggregated.entries()) {
          const stokDocId = sku.replace(/\//g, '_');
          const stokRef = doc(db, STOK_COLLECTION, stokDocId);
          
          batch.update(stokRef, {
             qty: increment(-skuData.qtyToDeduct),
             updated_at: new Date().toISOString()
          });

          for (const [yearMonth, monthData] of skuData.monthlyDeducts.entries()) {
             const trxDocId = `${stokDocId}_${yearMonth}`;
             const trxRef = doc(db, TRX_COLLECTION, trxDocId);
             
             const updates: any = {
                total_in: increment(-monthData.total),
                updated_at: new Date().toISOString()
             };
             
             for (const [todayKey, dailyQty] of monthData.daily.entries()) {
                updates[`harian.${todayKey}.in`] = increment(-dailyQty);
             }
             batch.update(trxRef, updates);
          }
      }

      await batch.commit();
      console.log('✅ Berhasil membatalkan transaksi OUT di Stok Lantai 3 (Firestore)');
    } catch (error) {
      console.error('Error in reverseSyncOutToLantai3:', error);
    }
  },

  async deleteLog(id: string | number, mode: DatabaseWriteMode) {
    let logDataToReverse: any = null;

    if (mode === 'supabase' || mode === 'both') {
      // Fetch the log first so we can reverse it if needed
      const { data: logData } = await supabase.from('database_log').select('sku, jumlah, tgl_scan, type').eq('id', id).single();
      if (logData) logDataToReverse = logData;

      const { error } = await supabase.from('database_log').delete().eq('id', id);
      if (error) throw error;
      
      if (mode === 'both') {
        (async () => {
          try {
            const docRef = doc(db, COLLECTION_NAME, id.toString());
            await deleteDoc(docRef);
          } catch (fbError) {
            console.error('Firebase dual-write delete failed:', fbError);
          }
        })();
      }
    } else if (mode === 'firebase') {
      try {
        const docRef = doc(db, COLLECTION_NAME, id.toString());
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) logDataToReverse = docSnap.data();

        await deleteDoc(docRef);
      } catch (error) {
        throw error;
      }
    }

    // Try to reverse Lantai 3 if applicable
    if (logDataToReverse) {
      await this.reverseSyncOutToLantai3([logDataToReverse]);
    }
  },

  async bulkDeleteLogs(ids: (string | number)[], mode: DatabaseWriteMode) {
    const batchSize = 50;
    let totalErrors = 0;
    let allLogsToReverse: any[] = [];

    // We fetch all records first to reverse them in Lantai 3
    if (mode === 'supabase' || mode === 'both') {
       for (let i = 0; i < ids.length; i += batchSize) {
          const batch = ids.slice(i, i + batchSize);
          const { data } = await supabase.from('database_log').select('sku, jumlah, tgl_scan, type').in('id', batch);
          if (data) allLogsToReverse.push(...data);
       }
    }

    for (let i = 0; i < ids.length; i += batchSize) {
      const batch = ids.slice(i, i + batchSize);
      if (mode === 'supabase' || mode === 'both') {
        const { error } = await supabase.from('database_log').delete().in('id', batch);
        if (error) {
          console.error('Supabase bulk delete failed:', error);
          totalErrors += batch.length;
          continue;
        }
      }
      if (mode === 'firebase' || mode === 'both') {
        const fbPromise = (async () => {
          try {
            const firestoreBatch = writeBatch(db);
            for (const id of batch) {
              // If purely firebase, we haven't fetched the data yet, but doing it inside a batch loop might be expensive.
              // Usually they use supabase, so we handle the common case well.
              firestoreBatch.delete(doc(db, COLLECTION_NAME, id.toString()));
            }
            await firestoreBatch.commit();
          } catch (fbError) {
            console.error('Firebase bulk delete failed:', fbError);
            if (mode === 'firebase') totalErrors += batch.length;
          }
        })();
        if (mode === 'firebase') await fbPromise;
      }
    }

    if (allLogsToReverse.length > 0) {
        await this.reverseSyncOutToLantai3(allLogsToReverse);
    }

    if (totalErrors > 0) throw new Error(`Failed to delete ${totalErrors} records.`);
  },

  async fetchActiveProducts(mode: DatabaseReadMode) {
    if (mode === 'supabase') {
      const allData: any[] = [];
      let from = 0;
      const batchSize = 1000;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await supabase
          .from('products')
          .select('sku_code, nama')
          .eq('status', 'Aktif')
          .range(from, from + batchSize - 1);

        if (error) throw error;

        if (data && data.length > 0) {
          allData.push(...data);
          from += batchSize;
          hasMore = data.length === batchSize;
        } else {
          hasMore = false;
        }
      }
      return allData;
    } else {
      const colRef = collection(db, 'products');
      const q = firestoreQuery(colRef, where('status', '==', 'Aktif'));
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => doc.data());
    }
  },

  async fetchAllStockItems(mode: DatabaseReadMode) {
    if (mode === 'supabase') {
      const allData: any[] = [];
      let from = 0;
      const batchSize = 1000;
      let hasMore = true;
      let totalCount = 0;

      while (hasMore) {
        const { data, error, count } = await supabase
          .from('stock_items')
          .select('*', { count: 'exact' })
          .eq('status', 'Aktif')
          .order('nama_produk', { ascending: true })
          .range(from, from + batchSize - 1);

        if (error) throw error;

        if (count !== null && totalCount === 0) totalCount = count;

        if (data && data.length > 0) {
          allData.push(...data);
          from += batchSize;
          hasMore = data.length === batchSize;
        } else {
          hasMore = false;
        }
      }
      return { data: allData, count: totalCount || allData.length };
    } else {
      // Fetch all from Firebase for local pagination
      const colRef = collection(db, STOCK_COLLECTION);
      const q = firestoreQuery(colRef, where('status', '==', 'Aktif'));
      const snapshot = await getDocs(q);
      const data = snapshot.docs.map(doc => doc.data());
      return { data, count: data.length };
    }
  },

  async insertStockItems(items: any[], mode: DatabaseWriteMode) {
    if (mode === 'supabase' || mode === 'both') {
      const { data, error } = await supabase.from('stock_items').insert(items).select();
      if (error) throw error;
      
      if (mode === 'both' && data) {
        (async () => {
          try {
            const chunkSize = 50;
            for (let i = 0; i < data.length; i += chunkSize) {
              const chunk = data.slice(i, i + chunkSize);
              const firestoreBatch = writeBatch(db);
              for (const item of chunk) {
                const docRef = doc(db, STOCK_COLLECTION, item.id);
                firestoreBatch.set(docRef, item);
              }
              await firestoreBatch.commit();
              await delay(500);
            }
            console.log('Firebase dual-write success for insertStockItems');
          } catch (fbError) {
            console.error('Firebase dual-write failed:', fbError);
          }
        })();
      }
      return { data, error: null };
    } else if (mode === 'firebase') {
      // Pure firebase mode. Generate random IDs.
      try {
        const newItems = [];
        const chunkSize = 50;
        for (let i = 0; i < items.length; i += chunkSize) {
          const chunk = items.slice(i, i + chunkSize);
          const firestoreBatch = writeBatch(db);
          for (const item of chunk) {
            const docRef = doc(collection(db, STOCK_COLLECTION));
            const newItem = { ...item, id: docRef.id, created_at: new Date().toISOString() };
            firestoreBatch.set(docRef, newItem);
            newItems.push(newItem);
          }
          await firestoreBatch.commit();
        }
        return { data: newItems, error: null };
      } catch (error) {
        throw error;
      }
    }
  },

  async updateStockItem(id: string, updates: any, mode: DatabaseWriteMode) {
    if (mode === 'supabase' || mode === 'both') {
      const { error } = await supabase.from('stock_items').update(updates).eq('id', id);
      if (error) throw error;

      if (mode === 'both') {
        (async () => {
          try {
            const docRef = doc(db, STOCK_COLLECTION, id);
            await setDoc(docRef, updates, { merge: true });
          } catch (fbError) {
            console.error('Firebase dual-write update failed:', fbError);
          }
        })();
      }
      return { error: null };
    } else if (mode === 'firebase') {
      const docRef = doc(db, STOCK_COLLECTION, id);
      await setDoc(docRef, updates, { merge: true });
      return { error: null };
    }
  },

  async deleteStockItem(id: string, mode: DatabaseWriteMode) {
    if (mode === 'supabase' || mode === 'both') {
      const { error } = await supabase.from('stock_items').delete().eq('id', id);
      if (error) throw error;

      if (mode === 'both') {
        (async () => {
          try {
            const docRef = doc(db, STOCK_COLLECTION, id);
            await deleteDoc(docRef);
          } catch (fbError) {
            console.error('Firebase dual-write delete failed:', fbError);
          }
        })();
      }
      return { error: null };
    } else if (mode === 'firebase') {
      const docRef = doc(db, STOCK_COLLECTION, id);
      await deleteDoc(docRef);
      return { error: null };
    }
  },

  async insertMasterData(table: string, items: any[], mode: DatabaseWriteMode) {
    if (mode === 'supabase' || mode === 'both') {
      const { data, error } = await supabase.from(table).insert(items).select();
      if (error) throw error;
      
      if (mode === 'both' && data) {
        (async () => {
          try {
            const chunkSize = 50;
            for (let i = 0; i < data.length; i += chunkSize) {
              const chunk = data.slice(i, i + chunkSize);
              const firestoreBatch = writeBatch(db);
              for (const item of chunk) {
                const docRef = doc(db, table, item.id);
                firestoreBatch.set(docRef, item);
              }
              await firestoreBatch.commit();
              await delay(500);
            }
            console.log(`Firebase dual-write success for insertMasterData ${table}`);
          } catch (fbError) {
            console.error(`Firebase dual-write failed for ${table}:`, fbError);
          }
        })();
      }
      return { data, error: null };
    } else if (mode === 'firebase') {
      try {
        const newItems = [];
        const chunkSize = 50;
        for (let i = 0; i < items.length; i += chunkSize) {
          const chunk = items.slice(i, i + chunkSize);
          const firestoreBatch = writeBatch(db);
          for (const item of chunk) {
            const docRef = doc(collection(db, table));
            const newItem = { ...item, id: docRef.id, created_at: new Date().toISOString() };
            firestoreBatch.set(docRef, newItem);
            newItems.push(newItem);
          }
          await firestoreBatch.commit();
        }
        return { data: newItems, error: null };
      } catch (error) {
        throw error;
      }
    }
  },

  async updateMasterData(table: string, id: string, updates: any, mode: DatabaseWriteMode) {
    if (mode === 'supabase' || mode === 'both') {
      const { error } = await supabase.from(table).update(updates).eq('id', id);
      if (error) throw error;

      if (mode === 'both') {
        (async () => {
          try {
            const docRef = doc(db, table, id);
            await setDoc(docRef, updates, { merge: true });
          } catch (fbError) {
            console.error(`Firebase dual-write update failed for ${table}:`, fbError);
          }
        })();
      }
      return { error: null };
    } else if (mode === 'firebase') {
      const docRef = doc(db, table, id);
      await setDoc(docRef, updates, { merge: true });
      return { error: null };
    }
  },

  async updateMasterDataByField(table: string, field: string, value: string, updates: any, mode: DatabaseWriteMode) {
    if (mode === 'supabase' || mode === 'both') {
      const { error } = await supabase.from(table).update(updates).eq(field, value);
      if (error) throw error;

      if (mode === 'both') {
        (async () => {
          try {
            const q = firestoreQuery(collection(db, table), where(field, '==', value));
            const snap = await getDocs(q);
            if (!snap.empty) {
              const docRef = doc(db, table, snap.docs[0].id);
              await setDoc(docRef, updates, { merge: true });
            }
          } catch (fbError) {
            console.error(`Firebase dual-write update failed for ${table} by ${field}:`, fbError);
          }
        })();
      }
      return { error: null };
    } else if (mode === 'firebase') {
      const q = firestoreQuery(collection(db, table), where(field, '==', value));
      const snap = await getDocs(q);
      if (!snap.empty) {
        const docRef = doc(db, table, snap.docs[0].id);
        await setDoc(docRef, updates, { merge: true });
      }
      return { error: null };
    }
  },

  async deleteMasterData(table: string, id: string, mode: DatabaseWriteMode) {
    if (mode === 'supabase' || mode === 'both') {
      const { error } = await supabase.from(table).delete().eq('id', id);
      if (error) throw error;

      if (mode === 'both') {
        (async () => {
          try {
            const docRef = doc(db, table, id);
            await deleteDoc(docRef);
          } catch (fbError) {
            console.error(`Firebase dual-write delete failed for ${table}:`, fbError);
          }
        })();
      }
      return { error: null };
    } else if (mode === 'firebase') {
      const docRef = doc(db, table, id);
      await deleteDoc(docRef);
      return { error: null };
    }
  },

  async upsertMasterData(table: string, items: any[], conflictKey: string, mode: DatabaseWriteMode) {
    if (mode === 'supabase' || mode === 'both') {
      const { data, error } = await supabase.from(table).upsert(items, { onConflict: conflictKey }).select();
      if (error) throw error;
      
      if (mode === 'both' && data) {
        (async () => {
          try {
            const chunkSize = 50;
            for (let i = 0; i < data.length; i += chunkSize) {
              const chunk = data.slice(i, i + chunkSize);
              const firestoreBatch = writeBatch(db);
              for (const item of chunk) {
                const docRef = doc(db, table, item.id);
                firestoreBatch.set(docRef, item, { merge: true });
              }
              await firestoreBatch.commit();
              await delay(500);
            }
            console.log(`Firebase dual-write success for upsertMasterData ${table}`);
          } catch (fbError) {
            console.error(`Firebase dual-write failed for ${table}:`, fbError);
          }
        })();
      }
      return { data, error: null };
    } else if (mode === 'firebase') {
      try {
        const firestoreBatch = writeBatch(db);
        const newItems = [];
        for (const item of items) {
          let docId = item.id;
          if (!docId) {
            // Try to find if it exists by conflict key
            const q = firestoreQuery(collection(db, table), where(conflictKey, '==', item[conflictKey]));
            const snap = await getDocs(q);
            if (!snap.empty) {
              docId = snap.docs[0].id;
            } else {
              docId = doc(collection(db, table)).id;
            }
          }
          const docRef = doc(db, table, docId);
          const finalItem = { ...item, id: docId };
          firestoreBatch.set(docRef, finalItem, { merge: true });
          newItems.push(finalItem);
        }
        await firestoreBatch.commit();
        return { data: newItems, error: null };
      } catch (error) {
        throw error;
      }
    }
  },

  async syncMasterDataToFirebase() {
    try {
      console.log('Starting sync of stock_items to Firebase...');
      // 1. Fetch all stock items from Supabase
      let allData: any[] = [];
      let from = 0;
      const batchSize = 1000;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await supabase
          .from('stock_items')
          .select('*')
          .range(from, from + batchSize - 1);

        if (error) throw error;

        if (data && data.length > 0) {
          allData = [...allData, ...data];
          if (data.length < batchSize) {
            hasMore = false;
          } else {
            from += batchSize;
          }
        } else {
          hasMore = false;
        }
      }

      console.log(`Found ${allData.length} stock items in Supabase.`);

      // 2. Batch write to Firebase
      const FB_BATCH_LIMIT = 500;
      let currentBatch = writeBatch(db);
      let operationCount = 0;

      for (const item of allData) {
        const docRef = doc(db, STOCK_COLLECTION, item.id);
        currentBatch.set(docRef, item);
        operationCount++;

        if (operationCount === FB_BATCH_LIMIT) {
          await currentBatch.commit();
          console.log(`Committed ${operationCount} items to Firebase.`);
          currentBatch = writeBatch(db);
          operationCount = 0;
          // Throttling to prevent "resource-exhausted" error
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      if (operationCount > 0) {
        await currentBatch.commit();
        console.log(`Committed final ${operationCount} items to Firebase.`);
      }

      console.log('Sync Master Data to Firebase complete!');
      return { success: true, count: allData.length };
    } catch (error) {
      console.error('Error syncing master data:', error);
      throw error;
    }
  },

  async syncLogsToFirebase() {
    try {
      console.log('Starting sync of database_log to Firebase...');
      let from = 0;
      const batchSize = 1000;
      let hasMore = true;
      let totalSynced = 0;

      const FB_BATCH_LIMIT = 250; // Kurangi limit batch Firebase untuk mencegah resource-exhausted

      while (hasMore) {
        const { data, error } = await supabase
          .from('database_log')
          .select('*')
          .range(from, from + batchSize - 1);

        if (error) throw error;

        if (data && data.length > 0) {
          // Langsung upload data yang baru difetch ke Firebase
          let currentBatch = writeBatch(db);
          let operationCount = 0;

          for (const item of data) {
            const docRef = doc(db, COLLECTION_NAME, item.id.toString());
            currentBatch.set(docRef, item);
            operationCount++;

            if (operationCount === FB_BATCH_LIMIT) {
              await currentBatch.commit();
              totalSynced += operationCount;
              console.log(`Committed ${totalSynced} logs to Firebase...`);
              currentBatch = writeBatch(db);
              operationCount = 0;
              // Throttling yang sangat konservatif (2 detik setiap 250 item = 125 item/detik)
              await new Promise(resolve => setTimeout(resolve, 2000));
            }
          }

          if (operationCount > 0) {
            await currentBatch.commit();
            totalSynced += operationCount;
            console.log(`Committed ${totalSynced} logs to Firebase...`);
            await new Promise(resolve => setTimeout(resolve, 2000));
          }

          if (data.length < batchSize) {
            hasMore = false;
          } else {
            from += batchSize;
          }
        } else {
          hasMore = false;
        }
      }

      console.log('Sync Logs to Firebase complete!');
      return { success: true, count: totalSynced };
    } catch (error) {
      console.error('Error syncing logs:', error);
      throw error;
    }
  },

  /**
   * Sinkronisasi data OUT dari gudang utama ke Stok Lantai 3 (Firestore only).
   * - Menambahkan/membuat dokumen di koleksi `stok_lantai3` (1 doc per SKU).
   * - Mencatat riwayat di koleksi `transaksi_lantai3` (horizontal: 1 doc per SKU per bulan).
   */
  async syncOutToLantai3(items: { sku: string; jumlah: number; gudang?: string; rak?: string; sub_rak?: string; user_name?: string }[]) {
    try {
      const STOK_COLLECTION = 'stok_lantai3';
      const TRX_COLLECTION = 'transaksi_lantai3';

      const now = new Date();
      const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

      // Fetch conversion map to convert accurately to PCS
      const conversions = skuConversionService.getCachedConversions();
      const convMap = new Map<string, { sku_pcs: string; qty: number }>();
      conversions.forEach(c => {
        if (c.sku_konversi && c.sku_pcs) {
          convMap.set(c.sku_konversi.trim().toLowerCase(), {
            sku_pcs: c.sku_pcs.trim(),
            qty: Number(c.qty) || 1
          });
        }
      });

      // Aggregate items by converted SKU to minimize writes
      const aggregated = new Map<string, { qty: number; gudang: string; rak: string; sub_rak: string }>();
      for (const item of items) {
        const rawSku = (item.sku || '').trim();
        const conv = convMap.get(rawSku.toLowerCase());
        const finalSku = conv ? conv.sku_pcs : rawSku;
        const finalQty = conv ? (Number(item.jumlah) || 0) * conv.qty : (Number(item.jumlah) || 0);

        const existing = aggregated.get(finalSku);
        if (existing) {
          existing.qty += finalQty;
        } else {
          aggregated.set(finalSku, {
            qty: finalQty,
            gudang: item.gudang || '',
            rak: item.rak || '',
            sub_rak: item.sub_rak || ''
          });
        }
      }

      // Process in batches of 50 (Firestore batch limit = 500 ops)
      const entries = Array.from(aggregated.entries());
      const chunkSize = 25; // each entry = 2 ops (stok + transaksi), so 25 * 2 = 50 ops max

      for (let i = 0; i < entries.length; i += chunkSize) {
        const chunk = entries.slice(i, i + chunkSize);
        const batch = writeBatch(db);

        for (const [sku, data] of chunk) {
          // 1. Upsert stok_lantai3: use SKU as document ID
          const stokDocId = sku.replace(/\//g, '_'); // Replace slashes for valid Firestore doc ID
          const stokRef = doc(db, STOK_COLLECTION, stokDocId);
          
          // Check if doc exists
          const stokSnap = await getDoc(stokRef);
          if (stokSnap.exists()) {
            // Increment existing qty
            batch.update(stokRef, {
              qty: increment(data.qty),
              updated_at: now.toISOString()
            });
          } else {
            // Create new document
            batch.set(stokRef, {
              nama_produk: sku,
              qty: data.qty,
              qty_lama_terpakai: 0,
              satuan: '',
              packing: '',
              rak: data.rak,
              sub_rak: data.sub_rak,
              created_at: now.toISOString(),
              updated_at: now.toISOString()
            });
          }

          // 2. Upsert transaksi_lantai3: horizontal map per SKU per month
          const trxDocId = `${stokDocId}_${yearMonth}`;
          const trxRef = doc(db, TRX_COLLECTION, trxDocId);
          const trxSnap = await getDoc(trxRef);

          if (trxSnap.exists()) {
            // Increment totals and daily data
            batch.update(trxRef, {
              total_in: increment(data.qty),
              [`harian.${todayKey}.in`]: increment(data.qty),
              updated_at: now.toISOString()
            });
          } else {
            // Create new monthly document
            batch.set(trxRef, {
              nama_produk: sku,
              bulan: yearMonth,
              total_in: data.qty,
              total_out: 0,
              harian: {
                [todayKey]: { in: data.qty, out: 0 }
              },
              created_at: now.toISOString(),
              updated_at: now.toISOString()
            });
          }
        }

        await batch.commit();
      }

      console.log(`✅ Synced ${aggregated.size} SKU(s) to Lantai 3 Firestore`);
      return { success: true, count: aggregated.size };
    } catch (error) {
      console.error('❌ Error syncing OUT to Lantai 3:', error);
      return { success: false, error };
    }
  },

  async insertKarantina(item: any, mode: DatabaseWriteMode = 'both') {
    let supabaseResult: any = null;
    let supabaseError: any = null;
    const docId = item.id || ('kr_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7));
    const itemWithId = {
      ...item,
      id: docId,
      created_at: item.created_at || new Date().toISOString()
    };

    // 1. Always save to localStorage immediately for instant client-side persistence
    if (typeof window !== 'undefined') {
      try {
        const rawLocal = localStorage.getItem('karantina_revisi_items');
        const localList = rawLocal ? JSON.parse(rawLocal) : [];
        const filtered = Array.isArray(localList)
          ? localList.filter((x: any) => String(x.id) !== String(itemWithId.id) && String(x.original_log_id || '') !== String(itemWithId.original_log_id || ''))
          : [];
        filtered.unshift(itemWithId);
        localStorage.setItem('karantina_revisi_items', JSON.stringify(filtered));
      } catch (lsErr) {
        console.warn('LocalStorage save karantina warning:', lsErr);
      }
    }

    // 2. Try Supabase dedicated table 'karantina_revisi_out'
    if (mode === 'supabase' || mode === 'both') {
      try {
        const payloadToInsert: any = {
          original_log_id: item.original_log_id ? String(item.original_log_id) : null,
          sku: item.sku,
          nama_barang: item.nama_barang || item.sku,
          packing: item.packing || '',
          jumlah: Number(item.jumlah) || 0,
          rak_asal: item.rak_asal || null,
          sub_rak_tujuan: item.sub_rak_tujuan || null,
          tgl_out_asli: item.tgl_out_asli || null,
          gudang: item.gudang || null,
          user_pemotong_out: item.user_pemotong_out || null,
          user_penarik: item.user_penarik || null,
          keterangan_out_asli: item.keterangan_out_asli || null,
          status: item.status || 'MENUNGGU_REVISI',
          sisa_fisik_belum_cocok: Number(item.sisa_fisik_belum_cocok) || 0,
          catatan_crosscheck: item.catatan_crosscheck || null,
          revisi_by: item.revisi_by || null,
          revisi_at: item.revisi_at || null,
          created_at: item.created_at || new Date().toISOString()
        };

        let { data, error } = await supabase
          .from('karantina_revisi_out')
          .insert([payloadToInsert])
          .select();
        
        // Auto-retry if table is missing 'gudang' column
        if (error && (error.message?.toLowerCase().includes('gudang') || error.code === 'PGRST204')) {
          const { gudang, ...withoutGudang } = payloadToInsert;
          const retryRes = await supabase
            .from('karantina_revisi_out')
            .insert([withoutGudang])
            .select();
          data = retryRes.data;
          error = retryRes.error;
        }

        if (!error && data && data.length > 0) {
          supabaseResult = data;
        } else if (error) {
          console.warn('Supabase karantina_revisi_out insert notice:', error.message || error);
        }
      } catch (err) {
        console.warn('Supabase insertKarantina karantina_revisi_out exception:', err);
      }

      // 3. Dual-storage / Fallback to 'quarantined_items' table (guaranteed to exist in schema)
      try {
        const qMeta = {
          is_revisi_out: true,
          local_id: itemWithId.id,
          sku: itemWithId.sku,
          nama_barang: itemWithId.nama_barang,
          packing: itemWithId.packing,
          rak_asal: itemWithId.rak_asal,
          sub_rak_tujuan: itemWithId.sub_rak_tujuan,
          tgl_out_asli: itemWithId.tgl_out_asli,
          tgl_out: itemWithId.tgl_out || itemWithId.tgl_out_asli,
          gudang: itemWithId.gudang,
          user_pemotong_out: itemWithId.user_pemotong_out,
          user_penarik: itemWithId.user_penarik,
          keterangan_out_asli: itemWithId.keterangan_out_asli,
          sisa_fisik_belum_cocok: itemWithId.sisa_fisik_belum_cocok || 0,
          catatan_crosscheck: itemWithId.catatan_crosscheck || null,
          revisi_by: itemWithId.revisi_by || null,
          revisi_at: itemWithId.revisi_at || null,
          created_at: itemWithId.created_at
        };

        const qPayload = {
          tanggal: itemWithId.tgl_out_asli || new Date().toISOString().split('T')[0],
          waktu: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
          nama_produk: itemWithId.sku,
          jumlah: Number(itemWithId.jumlah) || 0,
          type: 'OUT_REVISI',
          gudang: itemWithId.gudang || 'GUDANG 5',
          rak: itemWithId.sub_rak_tujuan || itemWithId.rak_asal || 'TEMP-A',
          tgl_scan: itemWithId.tgl_out_asli || new Date().toISOString().split('T')[0],
          user_name: itemWithId.user_penarik || 'System',
          original_row_id: String(itemWithId.original_log_id || ''),
          status: itemWithId.status || 'MENUNGGU_REVISI',
          validation_errors: [JSON.stringify(qMeta)]
        };

        const { data: qData, error: qErr } = await supabase
          .from('quarantined_items')
          .insert([qPayload])
          .select();

        if (!qErr && qData && qData.length > 0) {
          if (!supabaseResult) {
            supabaseResult = [
              {
                ...itemWithId,
                id: qData[0].id
              }
            ];
          }
        } else if (qErr) {
          console.warn('quarantined_items fallback insert notice:', qErr.message || qErr);
        }
      } catch (errQ) {
        console.warn('quarantined_items fallback exception:', errQ);
      }
    }

    // 4. Dual-write backup to Firestore
    try {
      const docRef = doc(db, 'karantina_revisi_out', String(docId));
      await setDoc(docRef, itemWithId, { merge: true });
    } catch (fbErr) {
      // Ignored if permissions not configured
    }

    return { data: supabaseResult || [itemWithId], error: null };
  },

  async fetchKarantina(mode: DatabaseReadMode = 'supabase') {
    const itemMap = new Map<string, any>();

    // 1. Fetch from 'karantina_revisi_out' table
    if (mode === 'supabase') {
      try {
        const { data, error } = await supabase
          .from('karantina_revisi_out')
          .select('*')
          .order('created_at', { ascending: false });
        if (!error && Array.isArray(data)) {
          for (const item of data) {
            const key = `kro_${item.id}`;
            itemMap.set(key, item);
          }
        }
      } catch (e) {
        // Table may not exist yet, continue to quarantined_items
      }
    }

    // 2. Fetch from 'quarantined_items' table (OUT_REVISI)
    try {
      const { data: qData, error: qError } = await supabase
        .from('quarantined_items')
        .select('*')
        .eq('type', 'OUT_REVISI')
        .order('created_at', { ascending: false });

      if (!qError && Array.isArray(qData)) {
        for (const row of qData) {
          let meta: any = {};
          try {
            if (Array.isArray(row.validation_errors) && row.validation_errors[0]) {
              meta = typeof row.validation_errors[0] === 'string' ? JSON.parse(row.validation_errors[0]) : row.validation_errors[0];
            }
          } catch {}

          const itemFormatted = {
            id: row.id,
            original_log_id: row.original_row_id || meta.original_log_id || null,
            sku: meta.sku || row.nama_produk,
            nama_barang: meta.nama_barang || row.nama_produk,
            packing: meta.packing || '',
            jumlah: Number(row.jumlah) || 0,
            rak_asal: meta.rak_asal || 'TEMP-A',
            sub_rak_tujuan: meta.sub_rak_tujuan || row.rak || 'UTAMA',
            tgl_out_asli: meta.tgl_out_asli || row.tanggal || '',
            tgl_out: meta.tgl_out || meta.tgl_out_asli || row.tanggal || '',
            gudang: row.gudang || meta.gudang || 'GUDANG 5',
            user_pemotong_out: meta.user_pemotong_out || 'System',
            user_penarik: meta.user_penarik || row.user_name || 'System',
            keterangan_out_asli: meta.keterangan_out_asli || '-',
            status: row.status || meta.status || 'MENUNGGU_REVISI',
            sisa_fisik_belum_cocok: Number(meta.sisa_fisik_belum_cocok) || 0,
            catatan_crosscheck: meta.catatan_crosscheck || null,
            revisi_by: meta.revisi_by || null,
            revisi_at: meta.revisi_at || null,
            created_at: row.created_at || meta.created_at || new Date().toISOString()
          };

          const key = `qi_${row.id}`;
          // Avoid duplicate if already mapped from karantina_revisi_out with same ID, original_log_id, or SKU + timestamp
          const isDuplicate = Array.from(itemMap.values()).some((existing: any) => 
            String(existing.id) === String(itemFormatted.id) ||
            (existing.original_log_id && itemFormatted.original_log_id && String(existing.original_log_id) === String(itemFormatted.original_log_id)) ||
            (existing.sku === itemFormatted.sku && Math.abs(new Date(existing.created_at || 0).getTime() - new Date(itemFormatted.created_at || 0).getTime()) < 5000)
          );

          if (!isDuplicate) {
            itemMap.set(key, itemFormatted);
          }
        }
      }
    } catch (qErr) {
      console.warn('Error fetching from quarantined_items:', qErr);
    }

    // 3. Merge LocalStorage items (ensures instant local presence)
    if (typeof window !== 'undefined') {
      try {
        const rawLocal = localStorage.getItem('karantina_revisi_items');
        if (rawLocal) {
          const localList = JSON.parse(rawLocal);
          if (Array.isArray(localList)) {
            for (const item of localList) {
              const key = `loc_${item.id}`;
              const isAlreadyPresent = Array.from(itemMap.values()).some((existing: any) => 
                String(existing.id) === String(item.id) ||
                (existing.original_log_id && item.original_log_id && String(existing.original_log_id) === String(item.original_log_id)) ||
                (existing.sku === item.sku && Math.abs(new Date(existing.created_at || 0).getTime() - new Date(item.created_at || 0).getTime()) < 5000)
              );
              if (!isAlreadyPresent) {
                itemMap.set(key, item);
              }
            }
          }
        }
      } catch (lsErr) {
        console.warn('Error reading local karantina items:', lsErr);
      }
    }

    // 4. Fallback to Firestore if still empty
    if (itemMap.size === 0) {
      try {
        const colRef = collection(db, 'karantina_revisi_out');
        const snap = await getDocs(firestoreQuery(colRef, orderBy('created_at', 'desc')));
        if (!snap.empty) {
          snap.docs.forEach(d => {
            const data = { ...d.data(), id: d.id };
            itemMap.set(`fs_${d.id}`, data);
          });
        }
      } catch (fbErr) {
        // Ignore Firestore error
      }
    }

    const sortedResult = Array.from(itemMap.values()).sort((a, b) => {
      const timeA = new Date(a.created_at || 0).getTime();
      const timeB = new Date(b.created_at || 0).getTime();
      return timeB - timeA;
    });

    return { data: sortedResult, error: null };
  },

  async updateKarantina(id: string | number, updates: any, mode: DatabaseWriteMode = 'both', originalLogId?: string | number) {
    const idStr = String(id || '').trim();
    const origIdStr = (originalLogId ? String(originalLogId) : '').trim();
    const isNumericId = typeof id === 'number' || (/^\d+$/.test(idStr) && !isNaN(Number(idStr)));
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idStr);

    const matchIds = new Set<string>();
    if (idStr) matchIds.add(idStr);
    if (origIdStr && origIdStr !== 'null' && origIdStr !== 'undefined') matchIds.add(origIdStr);

    // 1. Update in LocalStorage
    if (typeof window !== 'undefined') {
      try {
        const rawLocal = localStorage.getItem('karantina_revisi_items');
        if (rawLocal) {
          const localList = JSON.parse(rawLocal);
          if (Array.isArray(localList)) {
            const updatedList = localList.map((item: any) => {
              const itemId = String(item.id || '').trim();
              const itemOrigId = String(item.original_log_id || '').trim();
              if (matchIds.has(itemId) || (itemOrigId && matchIds.has(itemOrigId))) {
                return { ...item, ...updates };
              }
              return item;
            });
            localStorage.setItem('karantina_revisi_items', JSON.stringify(updatedList));
          }
        }
      } catch (lsErr) {
        console.warn('LocalStorage update karantina warning:', lsErr);
      }
    }

    // 2. Update in 'karantina_revisi_out'
    if (mode === 'supabase' || mode === 'both') {
      try {
        if (isNumericId) {
          await supabase.from('karantina_revisi_out').update(updates).eq('id', Number(idStr));
        }
        if (origIdStr) {
          await supabase.from('karantina_revisi_out').update(updates).eq('original_log_id', origIdStr);
        }
        if (!isNumericId && idStr) {
          await supabase.from('karantina_revisi_out').update(updates).eq('original_log_id', idStr);
        }
      } catch (e) {
        // Ignore
      }

      // 3. Update in 'quarantined_items'
      try {
        const qUpdates: any = {};
        if (updates.status) qUpdates.status = updates.status;
        if (Object.keys(qUpdates).length > 0) {
          if (isUuid) {
            await supabase.from('quarantined_items').update(qUpdates).eq('id', idStr);
          }
          if (origIdStr) {
            await supabase.from('quarantined_items').update(qUpdates).eq('original_row_id', origIdStr);
          }
          if (idStr && idStr !== origIdStr) {
            await supabase.from('quarantined_items').update(qUpdates).eq('original_row_id', idStr);
          }
        }
      } catch (e) {
        // Ignore
      }
    }

    // 4. Update in Firestore
    try {
      for (const mId of matchIds) {
        const docRef = doc(db, 'karantina_revisi_out', mId);
        await setDoc(docRef, updates, { merge: true }).catch(() => {});
      }
    } catch (e) {
      // Ignore
    }
  },

  async deleteKarantina(id: string | number, mode: DatabaseWriteMode = 'both', originalLogId?: string | number) {
    const idStr = String(id || '').trim();
    const origIdStr = (originalLogId ? String(originalLogId) : '').trim();
    const isNumericId = typeof id === 'number' || (/^\d+$/.test(idStr) && !isNaN(Number(idStr)));
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idStr);

    const matchIds = new Set<string>();
    if (idStr) matchIds.add(idStr);
    if (origIdStr && origIdStr !== 'null' && origIdStr !== 'undefined') matchIds.add(origIdStr);

    // 1. Delete from LocalStorage strictly by any matching id or original_log_id
    if (typeof window !== 'undefined') {
      try {
        const rawLocal = localStorage.getItem('karantina_revisi_items');
        if (rawLocal) {
          const localList = JSON.parse(rawLocal);
          if (Array.isArray(localList)) {
            const filtered = localList.filter((item: any) => {
              const itemId = String(item.id || '').trim();
              const itemOrigId = String(item.original_log_id || '').trim();
              if (matchIds.has(itemId)) return false;
              if (itemOrigId && matchIds.has(itemOrigId)) return false;
              return true;
            });
            localStorage.setItem('karantina_revisi_items', JSON.stringify(filtered));
          }
        }
      } catch (lsErr) {
        console.warn('LocalStorage delete karantina warning:', lsErr);
      }
    }

    // 2. Delete from 'karantina_revisi_out'
    if (mode === 'supabase' || mode === 'both') {
      try {
        if (isNumericId) {
          await supabase.from('karantina_revisi_out').delete().eq('id', Number(idStr));
        }
        if (origIdStr) {
          await supabase.from('karantina_revisi_out').delete().eq('original_log_id', origIdStr);
        }
        if (!isNumericId && idStr) {
          await supabase.from('karantina_revisi_out').delete().eq('original_log_id', idStr);
        }
      } catch (e) {
        console.warn('karantina_revisi_out delete notice:', e);
      }

      // 3. Delete from 'quarantined_items'
      try {
        if (isUuid) {
          await supabase.from('quarantined_items').delete().eq('id', idStr);
        }
        if (origIdStr) {
          await supabase.from('quarantined_items').delete().eq('original_row_id', origIdStr);
        }
        if (idStr && idStr !== origIdStr) {
          await supabase.from('quarantined_items').delete().eq('original_row_id', idStr);
        }
      } catch (e) {
        console.warn('quarantined_items delete notice:', e);
      }

      // 4. Auto-restore original log in database_log if originalLogId exists
      const targetLogIds = new Set<string>();
      if (origIdStr && origIdStr !== 'null' && origIdStr !== 'undefined') targetLogIds.add(origIdStr);
      if (isUuid) targetLogIds.add(idStr);

      for (const tLogId of targetLogIds) {
        try {
          // Revert log from MOVE / REVISI_KARANTINA back to OUT / COMPLETED
          await supabase
            .from('database_log')
            .update({
              type: 'OUT',
              status: 'COMPLETED',
              log_update_user: '[RESTORED] Dibatalkan dari Wadah Karantina'
            })
            .eq('id', tLogId);
        } catch (dbLogErr) {
          console.warn('Auto-restore database_log warning:', dbLogErr);
        }
      }
    }

    // 5. Delete from Firestore
    try {
      for (const mId of matchIds) {
        const docRef = doc(db, 'karantina_revisi_out', mId);
        await deleteDoc(docRef).catch(() => {});
      }
      if (origIdStr) {
        const colRef = collection(db, 'karantina_revisi_out');
        const qSnap = await getDocs(firestoreQuery(colRef, where('original_log_id', '==', origIdStr)));
        for (const d of qSnap.docs) {
          await deleteDoc(d.ref).catch(() => {});
        }
      }
    } catch (e) {
      // Ignore
    }
  }
};

