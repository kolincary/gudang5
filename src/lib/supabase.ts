import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL!;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY!;

// Auto-cleanup if Supabase project changed
if (typeof window !== 'undefined') {
  const lastUrl = localStorage.getItem('last_supabase_url');
  if (lastUrl && lastUrl !== supabaseUrl) {
    console.log('🔄 Supabase project URL changed. Clearing obsolete local storage...');
    localStorage.clear();
    sessionStorage.clear();
  }
  localStorage.setItem('last_supabase_url', supabaseUrl);
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  db: {
    schema: 'public',
  },
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
  global: {
    headers: {
      'x-connection-warmup': 'true',
    },
  },
});

let isConnectionWarmed = false;

export const warmupConnection = async () => {
  if (isConnectionWarmed) return;

  try {
    console.log('🔥 Warming up database connection...');
    const startTime = performance.now();

    await Promise.all([
      supabase.from('products').select('id').limit(1).maybeSingle(),
      supabase.from('stock_items').select('id').limit(1).maybeSingle(),
    ]);

    isConnectionWarmed = true;
    const endTime = performance.now();
    console.log(`✓ Connection warmed up in ${(endTime - startTime).toFixed(0)}ms`);
  } catch (error) {
    console.error('Connection warmup failed:', error);
  }
};

if (typeof window !== 'undefined') {
  warmupConnection();
}

// Utility function to fetch all products from Supabase (Parallelized)
export const fetchAllProducts = async (onProgress?: (current: number, total: number) => void, namesOnly: boolean = false) => {
  try {
    console.log(`🚀 Starting parallel load of all products (${namesOnly ? 'names only' : 'full data'})...`);
    const startTime = performance.now();

    const selectColumns = namesOnly ? 'nama' : 'id, id_barang, sku_code, nama, satuan, product_type_id, status, created_at, updated_at';
    const batchSize = 1000;

    // 1. Get total count first
    const { count, error: countError } = await supabase
      .from('products')
      .select('id', { count: 'exact', head: true });

    if (countError) throw countError;
    const totalCount = count || 0;

    if (totalCount === 0) return { data: [], totalCount: 0, success: true };

    // 2. Prepare parallel batches
    const numBatches = Math.ceil(totalCount / batchSize);
    const batchPromises = [];

    for (let i = 0; i < numBatches; i++) {
      const from = i * batchSize;
      const to = from + batchSize - 1;
      batchPromises.push(
        supabase
          .from('products')
          .select(selectColumns)
          .range(from, to)
          .order('nama', { ascending: true })
      );
    }

    // 3. Fire all requests in parallel
    const results = await Promise.all(batchPromises);

    // Check for errors in any batch
    const errors = results.filter(r => r.error).map(r => r.error);
    if (errors.length > 0) throw errors[0];

    const allData = results.flatMap(r => r.data || []);
    const endTime = performance.now();

    console.log(`✓ Successfully loaded ${allData.length} products in ${(endTime - startTime).toFixed(0)}ms`);

    if (onProgress) onProgress(allData.length, totalCount);

    return {
      data: allData,
      totalCount,
      success: true
    };

  } catch (error) {
    console.error('Error fetching all products:', error);
    return {
      data: [],
      totalCount: 0,
      success: false,
      error
    };
  }
};

// Utility function to fetch all stock items from Supabase (Parallelized)
export const fetchAllStockItems = async () => {
  try {
    console.log('🚀 Starting parallel load of all stock items...');
    const startTime = performance.now();
    const batchSize = 1000;

    // 1. Get count
    const { count, error: countError } = await supabase
      .from('stock_items')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'Aktif');

    if (countError) throw countError;
    const totalCount = count || 0;

    if (totalCount === 0) return { data: [], totalCount: 0, success: true };

    // 2. Prepare batches
    const numBatches = Math.ceil(totalCount / batchSize);
    const batchPromises = [];

    for (let i = 0; i < numBatches; i++) {
      const from = i * batchSize;
      const to = from + batchSize - 1;
      batchPromises.push(
        supabase
          .from('stock_items')
          .select('*')
          .eq('status', 'Aktif')
          .range(from, to)
          .order('nama_produk', { ascending: true })
      );
    }

    const results = await Promise.all(batchPromises);
    const errors = results.filter(r => r.error).map(r => r.error);
    if (errors.length > 0) throw errors[0];

    const allData = results.flatMap(r => r.data || []);
    const endTime = performance.now();
    console.log(`✓ Successfully loaded ${allData.length} stock items in ${(endTime - startTime).toFixed(0)}ms`);

    return {
      data: allData,
      totalCount,
      success: true
    };
  } catch (error) {
    console.error('Error fetching all stock items:', error);
    return {
      data: [],
      totalCount: 0,
      success: false,
      error
    };
  }
};

// Utility function to fetch all database log entries from Supabase (bypassing 1000 limit)
export const fetchAllDatabaseLogs = async () => {
  try {
    console.log('Starting to load all database log entries from database...');

    let allData: any[] = [];
    let from = 0;
    const batchSize = 1000;
    let hasMore = true;
    let totalCount = 0;

    while (hasMore) {
      const { data, error, count } = await supabase
        .from('database_log')
        .select('*', { count: 'exact' })
        .range(from, from + batchSize - 1)
        .order('created_at', { ascending: false });

      if (error) {
        console.error(`Error loading batch ${from}-${from + batchSize - 1}:`, error);
        throw error;
      }

      if (data && data.length > 0) {
        allData = [...allData, ...data];
        console.log(`Loaded batch: ${from + 1}-${from + data.length}, Total so far: ${allData.length}`);

        // Set total count from first batch
        if (from === 0 && count !== null) {
          totalCount = count;
          console.log(`Total database log entries in database: ${count}`);
        }

        // Check if we have more data
        if (data.length < batchSize) {
          hasMore = false;
          console.log('Reached end of database log data');
        } else {
          from += batchSize;
        }
      } else {
        hasMore = false;
        console.log('No more database log data to load');
      }

      // Add small delay to prevent overwhelming the database
      if (hasMore) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    console.log(`✓ Successfully loaded all ${allData.length} database log entries from database`);

    return {
      data: allData,
      totalCount: totalCount || allData.length,
      success: true
    };

  } catch (error) {
    console.error('Error fetching all database log entries:', error);
    return {
      data: [],
      totalCount: 0,
      success: false,
      error
    };
  }
};

interface DatabaseLogEntry {
  id: string;
  sku: string;
  jumlah: number;
  type: 'IN' | 'OUT' | 'MOVE';
  rak: string;
  created_at: string;
}

export const calculateAccurateStock = async (namaProduk: string, rak: string): Promise<number> => {
  if (!namaProduk.trim() || !rak.trim()) {
    return 0;
  }

  try {
    const stockItem = await supabase
      .from('stock_items')
      .select('stok_awal')
      .ilike('nama_produk', namaProduk.trim())
      .ilike('rak', rak.trim())
      .eq('status', 'Aktif')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (stockItem.error) {
      console.error(`❌ Error fetching stock item for ${namaProduk} @ ${rak}:`, stockItem.error);
      // Don't return 0 yet, try to continue with log calculation
    }

    const stokAwal = stockItem.data?.stok_awal || 0;

    const { data: logData, error: logError } = await supabase
      .from('database_log')
      .select('jumlah, type, rak')
      .ilike('sku', namaProduk.trim())
      .in('type', ['IN', 'OUT']);

    if (logError) {
      console.error('Error fetching log data:', logError);
      return stokAwal;
    }

    const logEntries = logData || [];
    const targetRakLower = rak.trim().toLowerCase();

    // Filter logs for the specific rack using the same logic as Dashboard
    const itemLogs = logEntries.filter(log => 
      (log.rak || '').toString().trim().toLowerCase() === targetRakLower
    );

    const masuk = itemLogs
      .filter(log => log.type === 'IN')
      .reduce((sum, log) => sum + (log.jumlah || 0), 0);

    const keluar = itemLogs
      .filter(log => log.type === 'OUT')
      .reduce((sum, log) => sum + (log.jumlah || 0), 0);

    const tersedia = stokAwal + masuk - keluar;

    console.log(`📊 Accurate stock calculation (Dashboard Parity): ${namaProduk} @ ${rak} = ${stokAwal} + ${masuk} - ${keluar} = ${tersedia}`);

    return tersedia;
  } catch (error) {
    console.error('Error calculating accurate stock:', error);
    return 0;
  }
};

interface StockItemWithAccurateData {
  id: string;
  nama_produk: string;
  packing: string;
  rak: string;
  sub_rak?: string;
  satuan: string;
  tersedia: number;
  status: string;
  stok_awal: number;
  masuk: number;
  keluar: number;
}

export const calculateAccurateStockForAllItems = async (
  stockItems: any[],
  logEntries: DatabaseLogEntry[]
): Promise<StockItemWithAccurateData[]> => {
  try {
    const logMap = new Map<string, DatabaseLogEntry[]>();

    logEntries.forEach(log => {
      const normalizedProduk = log.sku?.toLowerCase().trim() || '';
      const normalizedRak = log.rak?.toLowerCase().trim() || '';
      const key = `${normalizedProduk}|${normalizedRak}`;

      if (!logMap.has(key)) {
        logMap.set(key, []);
      }
      logMap.get(key)!.push(log);
    });

    const accurateItems: StockItemWithAccurateData[] = stockItems.map(item => {
      const normalizedProduk = item.nama_produk?.toLowerCase().trim() || '';
      const normalizedRak = item.rak?.toLowerCase().trim() || '';
      const key = `${normalizedProduk}|${normalizedRak}`;

      const itemLogs = logMap.get(key) || [];

      const masuk = itemLogs
        .filter(log => log.type === 'IN')
        .reduce((sum, log) => sum + (log.jumlah || 0), 0);

      const keluar = itemLogs
        .filter(log => log.type === 'OUT')
        .reduce((sum, log) => sum + (log.jumlah || 0), 0);

      const stokAwal = item.stok_awal || 0;
      const tersedia = stokAwal + masuk - keluar;

      return {
        ...item,
        stok_awal: stokAwal,
        masuk,
        keluar,
        tersedia: tersedia
      };
    });

    return accurateItems;
  } catch (error) {
    console.error('Error calculating accurate stock for all items:', error);
    return stockItems.map(item => ({
      ...item,
      stok_awal: item.stok_awal || 0,
      masuk: 0,
      keluar: 0,
      tersedia: item.tersedia || 0
    }));
  }
};