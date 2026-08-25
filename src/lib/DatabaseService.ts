import { supabase } from './supabase';
import { collection, getDocs, query as firestoreQuery, where, orderBy, limit, doc, setDoc, writeBatch, deleteDoc, getDoc, increment } from 'firebase/firestore';
import { db } from './firebase';

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
        query = query.order('id', { ascending: false });
      } else {
        query = query
          .order('tgl_normalized', { ascending: false })
          .order('waktu', { ascending: false })
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
      const { data, error } = await supabase
        .from('database_log')
        .select('sku, rak, type, jumlah')
        .ilike('sku', sku)
        .in('type', ['IN', 'OUT']);
      if (error) throw error;
      return data || [];
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

        if (!aggregated.has(item.sku)) {
           aggregated.set(item.sku, { qtyToDeduct: 0, monthlyDeducts: new Map() });
        }
        
        const skuData = aggregated.get(item.sku)!;
        skuData.qtyToDeduct += Number(item.jumlah);

        if (!skuData.monthlyDeducts.has(yearMonth)) {
            skuData.monthlyDeducts.set(yearMonth, { total: 0, daily: new Map() });
        }

        const monthData = skuData.monthlyDeducts.get(yearMonth)!;
        monthData.total += Number(item.jumlah);
        
        const currentDaily = monthData.daily.get(todayKey) || 0;
        monthData.daily.set(todayKey, currentDaily + Number(item.jumlah));
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

      // Aggregate items by SKU to minimize writes
      const aggregated = new Map<string, { qty: number; gudang: string; rak: string; sub_rak: string }>();
      for (const item of items) {
        const existing = aggregated.get(item.sku);
        if (existing) {
          existing.qty += item.jumlah;
        } else {
          aggregated.set(item.sku, {
            qty: item.jumlah,
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
  }
};
