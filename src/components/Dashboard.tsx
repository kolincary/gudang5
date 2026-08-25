import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { X, RefreshCw, Search, Package } from 'lucide-react';
import { Button } from './ui/Button';
import { Toast } from './ui/Toast';
import { StockTableSkeleton } from './ui/SkeletonLoader';
import { supabase, fetchAllStockItems, warmupConnection } from '../lib/supabase';
import { queryOptimizer } from '../lib/queryOptimizer';
import { useDatabaseConfig } from '../lib/DatabaseContext';
import { DatabaseService } from '../lib/DatabaseService';

// Cache untuk optimasi performa
const CACHE_PRODUCTS_KEY = 'dashboard_products_cache';
const CACHE_STOCK_KEY = 'dashboard_stock_cache';
const CACHE_LOGS_KEY = 'dashboard_logs_cache';

interface ProductStock {
  nama_produk: string;
  stok_masuk: number;
  stok_keluar: number;
  tersedia: number;
  lokasi_rak: string;
  packing: string;
}

interface DatabaseLogEntry {
  id: string;
  sku: string;
  jumlah: number;
  type: 'IN' | 'OUT' | 'MOVE';
  rak: string;
  created_at: string;
}

// Debounce hook untuk search
const useDebounce = (value: string, delay: number) => {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
};

// Komponen Dropdown yang sudah dioptimasi
const OptimizedSearchDropdown = ({
  options,
  value,
  onChange,
  onSelect,
  onKeyDown,
  onFocus,
  placeholder,
  loading,
  highlightedIndex,
  showDropdown,
  clearSearch,
  inputRef,
  maxDisplayItems = 50
}: {
  options: { nama: string }[];
  value: string;
  onChange: (value: string) => void;
  onSelect: (value: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onFocus: () => void;
  placeholder: string;
  loading: boolean;
  highlightedIndex: number;
  showDropdown: boolean;
  clearSearch: () => void;
  inputRef: React.RefObject<HTMLInputElement>;
  maxDisplayItems?: number;
}) => {
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Filter dan limit options untuk performa - hanya filter jika ada input
  const filteredOptions = useMemo(() => {
    if (!value || value.length < 1) {
      return options.slice(0, maxDisplayItems);
    }
    const lowerValue = value.toLowerCase();
    const filtered = options.filter(product =>
      product.nama.toLowerCase().includes(lowerValue)
    );
    return filtered.slice(0, maxDisplayItems);
  }, [options, value, maxDisplayItems]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        // Hapus onSelect('') karena ini yang menyebabkan re-render tidak perlu
        // onSelect('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [inputRef, onSelect]);

  useEffect(() => {
    if (dropdownRef.current && highlightedIndex >= 0 && highlightedIndex < filteredOptions.length) {
      const highlightedElement = dropdownRef.current.children[highlightedIndex];
      if (highlightedElement) {
        highlightedElement.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [highlightedIndex, filteredOptions.length]);

  return (
    <div className="relative product-dropdown-container">
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          onKeyDown={onKeyDown}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={onFocus}
          className="product-input w-full px-5 py-4 pr-14 border-[1.5px] border-gray-200/90 hover:border-blue-300 rounded-[22px] focus:outline-none focus:ring-[4px] focus:ring-blue-100/60 focus:border-blue-500 bg-white font-semibold text-gray-800 placeholder:text-gray-400 transition-all shadow-[0_4px_25px_-5px_rgba(0,0,0,0.06)] text-[15px] z-10"
          placeholder={placeholder}
        />
        <div className="absolute right-3 top-1/2 transform -translate-y-1/2 flex items-center gap-2 z-20">
          {value && (
            <button
              onClick={clearSearch}
              className="p-1.5 bg-gray-50 hover:bg-gray-100 text-gray-400 hover:text-red-500 rounded-xl transition-all border border-gray-100"
              aria-label="Hapus pencarian"
            >
              <X className="h-4 w-4" />
            </button>
          )}
          <div className="p-1.5 text-blue-400 pointer-events-none">
            <Search className="h-5 w-5" strokeWidth={2.5} />
          </div>
        </div>
      </div>

      {showDropdown && (
        <div
          ref={dropdownRef}
          className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-300 rounded-md shadow-lg z-50 max-h-64 overflow-y-auto"
        >
          {filteredOptions.length > 0 ? (
            <>
              {filteredOptions.map((product, index) => (
                <div
                  key={product.nama}
                  onClick={() => onSelect(product.nama)}
                  className={`px-4 py-4 text-base md:text-sm cursor-pointer border-b border-gray-100 last:border-b-0 text-gray-900 ${index === highlightedIndex
                    ? 'bg-blue-100 text-blue-900'
                    : 'bg-white hover:bg-blue-50'
                    }`}
                >
                  {product.nama}
                </div>
              ))}
              {options.length > maxDisplayItems && (
                <div className="px-3 py-2 text-xs text-gray-500 bg-gray-50 border-t">
                  Menampilkan {Math.min(filteredOptions.length, maxDisplayItems)} dari {options.length} produk
                </div>
              )}
            </>
          ) : loading ? (
            <div className="px-3 py-3 text-sm text-gray-500 text-center">
              <div className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-4 w-4 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span>Memuat data...</span>
              </div>
            </div>
          ) : (
            <div className="px-3 py-3 text-sm text-gray-500 text-center">
              {value.length > 0 ? 'Produk tidak ditemukan' : 'Ketik untuk mencari produk'}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export function Dashboard() {
  const { readMode } = useDatabaseConfig();
  const [selectedProduct, setSelectedProduct] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [productStocks, setProductStocks] = useState<ProductStock[]>([]);
  const [allProducts, setAllProducts] = useState<{ nama: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [backgroundLoading, setBackgroundLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [totalProductStock, setTotalProductStock] = useState<number>(0);

  // Cache untuk performa instant
  const [logCache, setLogCache] = useState<Map<string, DatabaseLogEntry[]>>(new Map());

  const debouncedSearchTerm = useDebounce(searchTerm, 300);

  const inputRef = useRef<HTMLInputElement>(null);
  const selectedProductRef = useRef<string>(selectedProduct);

  const [toast, setToast] = useState<{
    isOpen: boolean;
    message: string;
    type: 'success' | 'info' | 'warning' | 'error';
  }>({
    isOpen: false,
    message: '',
    type: 'info'
  });

  const showToast = useCallback((message: string, type: 'success' | 'info' | 'warning' | 'error' = 'info') => {
    setToast({ isOpen: true, message, type });
    setTimeout(() => {
      setToast({ isOpen: false, message: '', type: 'info' });
    }, 4000);
  }, []);

  const latestRequestedProductRef = useRef<string>('');

  useEffect(() => {
    // Keep reference updated
    latestRequestedProductRef.current = selectedProduct;
  }, [selectedProduct]);

  useEffect(() => {
    const initDashboard = async () => {
      // 1. Prioritaskan cache agar UI instant
      const cachedProducts = localStorage.getItem(CACHE_PRODUCTS_KEY);
      if (cachedProducts) {
        try {
          const parsed = JSON.parse(cachedProducts);
          setAllProducts(parsed);
          setInitialLoading(false);
          console.log('⚡ Dashboard: Instant load from products cache');
        } catch (e) {
          console.error('Error parsing cache:', e);
        }
      }

      // 2. Jalankan warmup di background (jangan ditunggu/await if we want instant UI)
      // TAPI fetch data utama tetap harus dijalankan
      Promise.all([
        warmupConnection(),
        queryOptimizer.warmupCache()
      ]).catch(err => console.error('Background init error:', err));

      // 3. Selalu fetch data terbaru di background
      await loadDashboardData(cachedProducts ? false : true);
    };
    initDashboard();
  }, []);

  useEffect(() => {
    selectedProductRef.current = selectedProduct;
  }, [selectedProduct]);

  useEffect(() => {
    if (!dataLoaded) return;

    let subscriptionActive = false;

    const setupSubscription = () => {
      const channel = supabase
        .channel('dashboard-realtime', {
          config: {
            broadcast: { self: true },
            presence: { key: '' },
          },
        })
        .on('postgres_changes',
          { event: '*', schema: 'public', table: 'stock_items' },
          async (payload) => {
            console.log('🔄 INSTANT update: stock_items', payload);
            const currentProduct = selectedProductRef.current;

            // Clear ALL cache instantly
            queryOptimizer.invalidateProductCache(currentProduct);
            setLogCache(new Map());
            localStorage.removeItem(CACHE_PRODUCTS_KEY);
            localStorage.removeItem(CACHE_STOCK_KEY);

            // Immediate reload
            await loadDashboardData(true);

            if (currentProduct) {
              await updateProductStocks(currentProduct, true);
            }
          }
        )
        .on('postgres_changes',
          { event: '*', schema: 'public', table: 'database_log' },
          async (payload) => {
            console.log('🔄 INSTANT update: database_log', payload);
            const currentProduct = selectedProductRef.current;

            // Clear ALL cache instantly
            setLogCache(new Map());
            localStorage.removeItem(CACHE_LOGS_KEY);

            if (currentProduct) {
              queryOptimizer.invalidateStockCalculation(currentProduct, '');
              await updateProductStocks(currentProduct, true);
            }

            await loadDashboardData(true);
          }
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            subscriptionActive = true;
            console.log('✓ Realtime subscriptions ACTIVE - INSTANT MODE');
          } else if (status === 'CHANNEL_ERROR') {
            console.error('❌ Realtime subscription error');
          } else if (status === 'CLOSED') {
            console.warn('⚠️ Realtime subscription closed');
          }
        });

      return channel;
    };

    const visibilityHandler = async () => {
      if (!document.hidden && subscriptionActive) {
        console.log('Tab visible - INSTANT refresh');
        await loadDashboardData(true);
        if (selectedProductRef.current) {
          await updateProductStocks(selectedProductRef.current, true);
        }
      }
    };

    document.addEventListener('visibilitychange', visibilityHandler);
    const channel = setupSubscription();

    return () => {
      document.removeEventListener('visibilitychange', visibilityHandler);
      supabase.removeChannel(channel);
      subscriptionActive = false;
    };
  }, [dataLoaded]);

  // Update product stocks when selected product changes
  // useEffect ini sekarang hanya bergantung pada selectedProduct, bukan searchTerm
  useEffect(() => {
    if (selectedProduct) {
      updateProductStocks(selectedProduct);
    } else {
      setProductStocks([]);
    }
  }, [selectedProduct]);

  const loadDashboardData = async (force: boolean = false) => {
    // Jika force, kita hajar saja walau sedang loading (kecuali refreshing)
    if (!force && (backgroundLoading || isRefreshing)) {
      console.log('⏸️  Skipping loadDashboardData - already loading');
      return;
    }

    if (force) {
      console.log('🔥 FORCE LOAD: Clearing all local caches');
      localStorage.removeItem(CACHE_PRODUCTS_KEY);
      localStorage.removeItem(CACHE_STOCK_KEY);
      localStorage.removeItem(CACHE_LOGS_KEY);
    }

    try {
      setBackgroundLoading(true);
      setInitialLoading(false);

      const stockResult = await fetchAllStockItems();
      if (!stockResult.success) {
        throw new Error('Failed to load stock items');
      }
      const stockItems = stockResult.data || [];

      // Extract unique products for dropdown
      const uniqueProductNames = [...new Set(stockItems.map(item => item.nama_produk))];
      const productsForDropdown = uniqueProductNames.sort().map(nama => ({ nama }));
      setAllProducts(productsForDropdown);

      // Simpan ke local storage untuk akses cepat di load berikutnya
      try {
        localStorage.setItem(CACHE_PRODUCTS_KEY, JSON.stringify(productsForDropdown));
      } catch (error) {
        console.error('Error caching products:', error);
      }

      // Set dataLoaded to true after successful load
      setDataLoaded(true);

    } catch (error: any) {
      console.error('Error loading dashboard data:', error);
      const errorMsg = error.message || '';
      if (errorMsg.includes('42501') || errorMsg.toLowerCase().includes('permission denied')) {
        showToast('Akses ditolak (RLS). Silakan periksa policy di tabel stock_items dan products.', 'error');
      } else {
        showToast('Koneksi ke server gagal. Silakan periksa koneksi internet Anda dan refresh halaman.', 'error');
      }
    } finally {
      setBackgroundLoading(false);
      setInitialLoading(false);
    }
  };


  const updateProductStocks = async (productName: string, force: boolean = false) => {
    if (!productName) {
      setProductStocks([]);
      setTotalProductStock(0);
      return;
    }

    // Set the latest requested product to track freshness
    latestRequestedProductRef.current = productName;

    try {
      setLoading(true);
      console.log(`📊 Dashboard: Loading ${productName} ${force ? '(FORCE - NO CACHE)' : '(with cache)'}`);

      // Step 1: Ambil semua stock_items untuk produk ini (Supabase)
      let items: any[] = [];
      try {
        const { data: stockItems, error: stockError } = await supabase
          .from('stock_items')
          .select('*')
          .ilike('nama_produk', productName)
          .eq('status', 'Aktif');

        if (stockError && readMode !== 'firebase') throw stockError;
        items = stockItems || [];
      } catch (err) {
        console.error('Error loading stock_items (Fallback to logs if in Firebase mode):', err);
      }
      console.log(`   - Found ${items.length} stock items from Supabase`);

      // Step 2: Ambil semua log untuk produk ini SEKALIGUS menggunakan DatabaseService (Supabase/Firebase)
      let allLogs: any[] = [];
      try {
          allLogs = await DatabaseService.fetchLogsBySku(productName, readMode);
      } catch (logError) {
          console.error('Error fetching logs:', logError);
      }

      console.log(`   - Found ${allLogs.length} log entries (Mode: ${readMode})`);

      // Jika tidak ada data sama sekali, return kosong
      if (items.length === 0 && allLogs.length === 0) {
        setProductStocks([]);
        setTotalProductStock(0);
        return;
      }

      // Step 3: Buat map log berdasarkan rak (in-memory, same as DataGudang)
      const logMap = new Map<string, any[]>();
      const uniqueRacksFromLogs = new Set<string>();
      
      allLogs.forEach(log => {
        const rakName = log.rak?.toString().trim() || '';
        const key = rakName.toLowerCase();
        if (!logMap.has(key)) {
          logMap.set(key, []);
        }
        logMap.get(key)!.push(log);
        if (rakName) uniqueRacksFromLogs.add(rakName);
      });

      // Step 3.5: Buat daftar rak final (gabungan dari stock_items dan log yang mungkin yatim piatu di Firebase)
      const existingRacks = new Set(items.map(i => (i.rak || '').toLowerCase().trim()));
      uniqueRacksFromLogs.forEach(rakName => {
        if (!existingRacks.has(rakName.toLowerCase())) {
           // Buat item virtual jika Supabase kosong tapi log ada di Firebase
           items.push({
              nama_produk: productName,
              rak: rakName,
              stok_awal: 0,
              packing: ''
           });
        }
      });

      let bestPacking = '';
      for (const item of items) {
        const p = (item.packing || '').trim();
        if (p.length > bestPacking.length && p.toUpperCase() !== 'CTN/') {
          bestPacking = p;
        }
      }
      if (!bestPacking && items.length > 0) {
        bestPacking = items[0].packing || '';
      }

      // Step 4: Hitung per item
      const productStockData: ProductStock[] = items.map((item) => {
        const rakKey = item.rak?.toString().trim().toLowerCase() || '';
        const itemLogs = logMap.get(rakKey) || [];

        const masuk = itemLogs.filter(e => e.type === 'IN').reduce((sum, e) => sum + (e.jumlah || 0), 0);
        const keluar = itemLogs.filter(e => e.type === 'OUT').reduce((sum, e) => sum + (e.jumlah || 0), 0);
        const tersedia = (item.stok_awal || 0) + masuk - keluar;

        console.log(`   📦 ${item.rak}: stok_awal=${item.stok_awal || 0}, masuk=${masuk}, keluar=${keluar}, tersedia=${tersedia}`);

        return {
          nama_produk: item.nama_produk,
          stok_masuk: masuk,
          stok_keluar: keluar,
          tersedia: tersedia,
          lokasi_rak: item.rak,
          packing: bestPacking,
        };
      });

      // CHECK: If user has searched for something else while we were waiting, ignore this result
      if (latestRequestedProductRef.current !== productName) {
        console.log(`✋ Ignoring stale result for ${productName} (User is now on ${latestRequestedProductRef.current})`);
        return;
      }

      const total = productStockData.reduce((sum, stock) => sum + stock.tersedia, 0);
      setTotalProductStock(total);
      setProductStocks(productStockData);
    } catch (error) {
      // Only show error if we are still on the same product
      if (latestRequestedProductRef.current === productName) {
        console.error('Error loading product stock:', error);
        showToast('Koneksi ke server gagal. Silakan periksa koneksi internet Anda dan coba lagi.', 'error');
      }
    } finally {
      // Only turn off loading if we are still on the same product
      if (latestRequestedProductRef.current === productName) {
        setLoading(false);
      }
    }
  };


  const refreshData = useCallback(async () => {
    console.log('🔄 REFRESH CLICKED - INSTANT MODE (NO CACHE)');

    setIsRefreshing(true);

    try {
      // NUCLEAR OPTION: Clear EVERYTHING instantly
      setLogCache(new Map());

      // Clear ALL cache systems
      queryOptimizer.invalidateAllCache();

      // Clear ALL localStorage cache
      localStorage.removeItem(CACHE_PRODUCTS_KEY);
      localStorage.removeItem(CACHE_STOCK_KEY);
      localStorage.removeItem(CACHE_LOGS_KEY);

      // Force reload dashboard data - NO CACHE
      await loadDashboardData(true);

      // Use ref to get the absolute latest selection, in case user changed it during refresh
      if (selectedProductRef.current) {
        await updateProductStocks(selectedProductRef.current, true);
      }

      showToast('✓ Data ter-refresh real-time', 'success');
    } catch (error) {
      console.error('Error refreshing data:', error);
      showToast('Gagal refresh data', 'error');
    } finally {
      setIsRefreshing(false);
    }
  }, [showToast]);

  const handleInputFocus = useCallback(() => {
    // Selalu tampilkan dropdown saat fokus, terlepas dari status loading
    setShowDropdown(true);
  }, []);

  // ==========================================================
  // MODIFIKASI DIMULAI DI SINI
  // ==========================================================
  const handleInputChange = useCallback((value: string) => {
    // Menghapus spasi hanya di akhir string
    const trimmedValue = value.trimEnd();

    setSearchTerm(trimmedValue);
    setHighlightedIndex(0);

    // Selalu show dropdown saat user mengetik, tidak peduli status loading
    if (trimmedValue.length > 0) {
      setShowDropdown(true);
    }

    // Gunakan trimmedValue untuk pengecekan
    if (trimmedValue === '') {
      setProductStocks([]);
      setSelectedProduct('');
      setTotalProductStock(0); // <-- Reset total stok
      setShowDropdown(false);
    }
  }, []);
  // ==========================================================
  // MODIFIKASI SELESAI
  // ==========================================================

  const handleSelectProduct = useCallback((productName: string) => {
    setSearchTerm(productName);
    setSelectedProduct(productName);
    setShowDropdown(false);
  }, []);

  const clearSearch = useCallback(() => {
    setSearchTerm('');
    setSelectedProduct('');
    setHighlightedIndex(0);
    setProductStocks([]);
    setTotalProductStock(0); // <-- Reset total stok
    setShowDropdown(false);
    if (inputRef.current) {
      inputRef.current.focus(); // Pastikan fokus kembali ke input setelah dibersihkan
    }
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const filtered = allProducts.filter(product =>
      product.nama && product.nama.toLowerCase().includes(searchTerm.toLowerCase())
    ).slice(0, 50);

    if (e.key === 'ArrowDown' && showDropdown && filtered.length > 0) {
      e.preventDefault();
      setHighlightedIndex((prev) =>
        prev >= filtered.length - 1 ? 0 : prev + 1
      );
    } else if (e.key === 'ArrowUp' && showDropdown && filtered.length > 0) {
      e.preventDefault();
      setHighlightedIndex((prev) =>
        prev <= 0 ? filtered.length - 1 : prev - 1
      );
    } else if (e.key === 'Enter' && showDropdown && highlightedIndex >= 0 && highlightedIndex < filtered.length) {
      e.preventDefault();
      handleSelectProduct(filtered[highlightedIndex].nama);
      if (inputRef.current) {
        inputRef.current.blur(); // Opsional: hilangkan fokus setelah memilih
      }
    } else if (e.key === 'Escape') {
      setShowDropdown(false);
      setHighlightedIndex(0);
      if (inputRef.current) {
        inputRef.current.blur();
      }
    } else if (e.key === 'Enter' && !showDropdown && searchTerm) {
      // Jika Enter ditekan tanpa dropdown terbuka, coba cari produk dari searchTerm
      const exactMatch = allProducts.find(p => p.nama.toLowerCase() === searchTerm.toLowerCase());
      if (exactMatch) {
        handleSelectProduct(exactMatch.nama);
      }
    }
  }, [allProducts, searchTerm, showDropdown, highlightedIndex, handleSelectProduct]);


  // Click outside handler
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (inputRef.current && !inputRef.current.contains(target) && !target.closest('.product-dropdown-container')) {
        setShowDropdown(false);
      }
    };
    if (showDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showDropdown]);

  const renderFormattedLokasiRak = (lokasi: string) => {
    if (!lokasi) return <span className="text-gray-400 font-medium">-</span>;
    
    const parts = lokasi.split(',').map(p => p.trim());
    const isTemp = parts.some(p => p.toUpperCase().startsWith('TEMP'));
    
    const formattedParts = parts.map(part => {
      if (part.toUpperCase().startsWith('TEMP')) {
        return `${part} (DALAM PENGECEKAN)`;
      }
      return part;
    });

    const label = formattedParts.join(', ');

    return (
      <span
        className={`inline-block px-3 py-1.5 rounded-lg text-xs font-bold leading-tight max-w-[280px] break-words whitespace-normal text-center shadow-sm ${
          isTemp
            ? 'bg-amber-100 text-amber-900 border border-amber-300'
            : 'bg-gray-100 text-gray-800 border border-gray-200'
        }`}
      >
        {label}
      </span>
    );
  };

  return (
    <>
      <Toast
        isOpen={toast.isOpen}
        message={toast.message}
        type={toast.type}
        onClose={() => setToast({ isOpen: false, message: '', type: 'info' })}
      />

      {/* ======================================================== */}
      {/* PREMIUM RESPONSIVE HEADER & SEARCH (Mobile & Desktop) */}
      {/* ======================================================== */}
      <div className="flex flex-col mb-8 lg:mb-12">
        {/* Full Immersive Background Banner with Floating Shapes */}
        <div className="bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 pt-[90px] lg:pt-0 lg:h-[310px] pb-[75px] lg:pb-0 px-6 lg:px-12 rounded-b-[40px] lg:rounded-b-[55px] shadow-2xl shadow-blue-900/20 relative overflow-hidden transition-all duration-500 flex flex-col justify-center">

          {/* Decorative Background Icon */}
          <div className="absolute -top-6 -right-6 text-white opacity-5">
            <Package className="w-64 h-64 lg:w-96 lg:h-96" />
          </div>

          {/* Decorative Floating Shapes (Circles & Squares) */}
          <div className="absolute top-10 right-10 w-32 h-32 bg-white/10 rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute top-24 left-1/4 w-16 h-16 bg-white/5 border border-white/20 rounded-2xl rotate-[35deg] backdrop-blur-sm hidden lg:block"></div>
          <div className="absolute bottom-10 right-1/3 w-12 h-12 bg-white/10 rounded-full border border-white/20 hidden lg:block"></div>
          <div className="absolute top-1/2 right-10 w-20 h-20 bg-blue-400/20 rounded-3xl -rotate-12 blur-xl hidden lg:block"></div>
          <div className="absolute -bottom-5 left-1/2 w-40 h-10 bg-white/5 rounded-full blur-xl"></div>

          {/* Text Content */}
          <div className="relative z-10 w-full flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6 uppercase">
            <div className="max-w-2xl">
              <div className="flex items-center gap-2 mb-2 lg:mb-3 opacity-90">
                <div className="w-8 h-[2px] bg-white rounded-full"></div>
                <span className="text-[10px] lg:text-[12px] font-black tracking-[0.3em] text-white">Digital System v5</span>
              </div>
              <h1 className="text-[34px] lg:text-[54px] font-black text-white tracking-tight leading-[1.1] mb-2">
                Gudang <span className="text-blue-200">Kalindo</span>
              </h1>
              <div className="text-blue-100/90 font-medium text-[14px] lg:text-[18px] leading-relaxed max-w-[90%] normal-case">
                {initialLoading ? (
                  <span className="animate-pulse flex items-center gap-2">
                    <RefreshCw className="w-4 h-4 animate-spin" /> Menghubungkan ke pusat data...
                  </span>
                ) : (
                  <div className="flex items-center gap-3">
                    <span className="relative flex h-3 w-3">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                    </span>
                    <span className="font-black text-white tracking-wide">{allProducts.length.toLocaleString()}</span> SKU Aktif Terdeteksi
                  </div>
                )}
              </div>
            </div>

            {/* Desktop Refresh Button */}
            <div className="hidden lg:block">
              <Button
                onClick={refreshData}
                disabled={isRefreshing || backgroundLoading}
                className="h-14 px-8 bg-white/15 hover:bg-white/25 text-white font-black rounded-2xl shadow-xl transition-all duration-300 transform hover:scale-105 active:scale-95 flex items-center gap-3 border border-white/20 backdrop-blur-md"
              >
                <RefreshCw className={`h-5 w-5 ${isRefreshing ? 'animate-spin' : 'text-white/80'}`} />
                REFRESH DATA
              </Button>
            </div>
          </div>
        </div>

        {/* Floating Search Bar */}
        <div className="relative z-30 -mt-[48px] lg:-mt-[55px] px-2 lg:px-24">
          <div className="bg-white/95 backdrop-blur-2xl rounded-[28px] lg:rounded-[35px] shadow-[0_20px_50px_-15px_rgba(31,41,55,0.25)] p-1.5 lg:p-2.5 border border-white max-w-5xl mx-auto transition-all hover:shadow-[0_25px_60px_-15px_rgba(31,41,55,0.3)]">
            <OptimizedSearchDropdown
              options={allProducts}
              value={searchTerm}
              onChange={handleInputChange}
              onSelect={handleSelectProduct}
              onKeyDown={handleKeyDown}
              onFocus={handleInputFocus}
              placeholder={initialLoading ? "Memuat SKU..." : "Mulai ketik nama barang untuk mencari di database..."}
              loading={initialLoading}
              highlightedIndex={highlightedIndex}
              showDropdown={showDropdown}
              clearSearch={clearSearch}
              inputRef={inputRef}
              maxDisplayItems={50}
            />
          </div>
        </div>
        {/* ======================================================== */}
        {/* RESULT & DATA AREA (Responsive Container) */}
        {/* ======================================================== */}
        <div className="space-y-6 lg:space-y-10 lg:px-8 pb-12">

          {/* Mobile Sticky Refresh Button */}
          <div className="lg:hidden fixed bottom-6 right-6 z-[60]">
            <Button
              onClick={refreshData}
              disabled={isRefreshing}
              className="h-14 w-14 rounded-full bg-blue-600 hover:bg-blue-700 text-white shadow-2xl flex items-center justify-center active:scale-95 transition-all p-0 border-none"
            >
              <RefreshCw className={`h-6 w-6 ${isRefreshing ? 'animate-spin' : ''}`} />
            </Button>
          </div>

          {/* RESULT SECTION (Keep Logic Intact) */}
          {loading && selectedProduct && (
            <div className="my-6"><StockTableSkeleton /></div>
          )}

          {!loading && productStocks.length > 0 && (
            <div className="space-y-6 my-6 fade-in">
              {/* Bagian Total Stok Keseluruhan - Premium High Contrast Green */}
              <div className={`${totalProductStock >= 0
                ? 'bg-gradient-to-br from-emerald-600 via-emerald-700 to-teal-800 shadow-[0_15px_35px_-5px_rgba(16,185,129,0.3)] border-emerald-500/30'
                : 'bg-gradient-to-br from-rose-600 via-red-700 to-red-900 shadow-[0_15px_35px_-5px_rgba(225,29,72,0.3)] border-red-500/30'
                } rounded-[28px] p-8 text-center border text-white relative overflow-hidden isolate transition-all duration-500 hover:scale-[1.01]`}>

                {/* Glass Texture & Glow Effect */}
                <div className="absolute inset-0 bg-white/10 opacity-30 mix-blend-overlay"></div>
                <div className="absolute -top-24 -left-24 w-64 h-64 bg-white/10 rounded-full blur-3xl animate-pulse"></div>
                <div className="absolute -bottom-24 -right-24 w-64 h-64 bg-emerald-400/20 rounded-full blur-3xl"></div>

                <h4 className="font-black text-[13px] flex items-center justify-center gap-3 relative z-10 text-emerald-50/80 tracking-[0.2em] uppercase mb-4">
                  <div className="h-1 w-8 bg-emerald-400 rounded-full"></div>
                  <Package className="h-5 w-5" />
                  Stok Keseluruhan
                  <div className="h-1 w-8 bg-emerald-400 rounded-full"></div>
                </h4>

                <div className="relative z-10 flex flex-col items-center">
                  <p className="text-[64px] font-black leading-none tracking-tighter drop-shadow-lg">
                    {totalProductStock.toLocaleString()}
                  </p>
                  <p className="text-[14px] mt-4 font-black uppercase tracking-[0.2em] text-emerald-100/90">Unit Produk Tersedia</p>
                </div>
              </div>

              {/* Tabel Detail per Rak */}
              <div className="bg-white rounded-2xl overflow-hidden shadow-xl shadow-gray-200/50 border border-gray-100">
                {/* Desktop view */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-gradient-to-r from-blue-600 to-blue-700 text-white">
                        <th className="px-6 py-4 text-left text-sm font-semibold border-r border-blue-500">Nama Barang</th>
                        <th className="px-6 py-4 text-center text-sm font-semibold border-r border-blue-500">Packing</th>
                        <th className="px-6 py-4 text-center text-sm font-semibold border-r border-blue-500">
                          <div className="flex items-center justify-center gap-1">
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 11l5-5m0 0l5 5m-5-5v12" />
                            </svg>
                            Stok Masuk
                          </div>
                        </th>
                        <th className="px-6 py-4 text-center text-sm font-semibold border-r border-blue-500">
                          <div className="flex items-center justify-center gap-1">
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 13l-5 5m0 0l-5-5m5 5V6" />
                            </svg>
                            Stok Keluar
                          </div>
                        </th>
                        <th className="px-6 py-4 text-center text-sm font-semibold border-r border-blue-500">Tersedia</th>
                        <th className="px-6 py-4 text-center text-sm font-semibold">Lokasi Rak</th>
                      </tr>
                    </thead>
                    <tbody>
                      {productStocks.map((stock, index) => (
                        <tr key={index} className={`${index % 2 === 0 ? 'bg-gray-50' : 'bg-white'} border-b border-gray-100 hover:bg-blue-50 transition-colors`}>
                          <td className="px-6 py-4 text-sm font-medium text-gray-900 border-r border-gray-200">{stock.nama_produk}</td>
                          <td className="px-6 py-4 text-sm text-center border-r border-gray-200">
                            <span className="text-rose-600 font-bold bg-rose-50 px-3 py-1 rounded-md text-xs border border-rose-100 whitespace-nowrap">
                              {stock.packing && !stock.packing.toUpperCase().startsWith('CTN/') ? `CTN/${stock.packing}` : (stock.packing || '-')}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-sm text-center border-r border-gray-200">
                            <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full font-semibold ${stock.stok_masuk > 0
                              ? 'bg-green-100 text-green-700'
                              : 'bg-gray-100 text-gray-400'
                              }`}>
                              {stock.stok_masuk.toLocaleString()}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-sm text-center border-r border-gray-200">
                            <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full font-semibold ${stock.stok_keluar > 0
                              ? 'bg-red-100 text-red-700'
                              : 'bg-gray-100 text-gray-400'
                              }`}>
                              {stock.stok_keluar.toLocaleString()}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-sm text-center border-r border-gray-200">
                            <span className="inline-flex items-center gap-1 bg-blue-600 text-white px-4 py-1.5 rounded-lg font-bold text-base">
                              {stock.tersedia.toLocaleString()}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-sm text-center">
                            {renderFormattedLokasiRak(stock.lokasi_rak)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile view - Premium Card UI */}
                <div className="md:hidden flex flex-col gap-5 p-4 bg-gray-50/50">
                  {productStocks.map((stock, index) => (
                    <div key={index} className="bg-white rounded-[20px] p-5 shadow-[0_8px_30px_-6px_rgba(0,0,0,0.1)] border border-gray-200/70 hover:border-blue-200 flex flex-col gap-5 relative overflow-hidden group hover:shadow-[0_12px_35px_-6px_rgba(0,0,0,0.15)] transition-all duration-300">
                      {/* Decorative Line border on Left */}
                      <div className="absolute left-0 top-0 bottom-0 w-[5px] bg-gradient-to-b from-blue-500 to-blue-400 rounded-l-[20px] opacity-90 group-hover:w-[6px] transition-all"></div>
                      {/* Card Header */}
                      <div className="flex items-start justify-between">
                        <div className="flex flex-col gap-1 flex-1 pr-3">
                          <div className="flex flex-wrap items-center gap-2 mb-1">
                            <span className="text-[10px] font-bold text-blue-500 uppercase tracking-widest bg-blue-50 w-fit px-2 py-0.5 rounded-md">SKU Info</span>
                            <span className="text-[10px] font-bold text-rose-600 uppercase tracking-widest bg-rose-50 border border-rose-100 w-fit px-2 py-0.5 rounded-md">
                              {stock.packing && !stock.packing.toUpperCase().startsWith('CTN/') ? `CTN/${stock.packing}` : (stock.packing || '-')}
                            </span>
                          </div>
                          <h4 className="text-[16px] font-black text-gray-900 leading-tight">{stock.nama_produk}</h4>
                        </div>
                        <span className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center text-xs font-black">
                          #{index + 1}
                        </span>
                      </div>

                      {/* Stats Grid */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-gray-50 p-4 rounded-2xl">
                          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Masuk</p>
                          <div className={`flex items-center gap-2 ${stock.stok_masuk > 0 ? 'text-emerald-500' : 'text-gray-400'}`}>
                            <span className="text-2xl font-black">{stock.stok_masuk.toLocaleString()}</span>
                          </div>
                        </div>

                        <div className="bg-gray-50 p-4 rounded-2xl">
                          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Keluar</p>
                          <div className={`flex items-center gap-2 ${stock.stok_keluar > 0 ? 'text-red-500' : 'text-gray-400'}`}>
                            <span className="text-2xl font-black">{stock.stok_keluar.toLocaleString()}</span>
                          </div>
                        </div>
                      </div>

                      {/* Bottom Info */}
                      <div className="flex items-center justify-between pt-1 gap-2">
                        <div className="flex flex-col gap-1 min-w-0 flex-1">
                          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Lokasi Rak</span>
                          <div>
                            {renderFormattedLokasiRak(stock.lokasi_rak)}
                          </div>
                        </div>

                        <div className="flex flex-col items-end gap-1">
                          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Tersedia</span>
                          <span className={`inline-flex px-5 py-2.5 rounded-xl font-black text-[20px] ${stock.tersedia > 0
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-200 text-gray-600'
                            }`}>
                            {stock.tersedia.toLocaleString()}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ========================================= */}
          {/* NEW PERFORMANCE CARDS SECTION */}
          {/* ========================================= */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-8 pb-10">
            {/* Status Card */}
            <div className="bg-white rounded-[22px] p-6 shadow-[0_8px_25px_-5px_rgba(0,0,0,0.05)] border border-gray-100 flex items-center justify-between group hover:shadow-[0_12px_35px_-5px_rgba(0,0,0,0.08)] transition-all">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-[18px] bg-emerald-50 flex items-center justify-center ring-4 ring-emerald-50/50">
                  <div className="w-4 h-4 rounded-full bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.6)] group-hover:scale-110 transition-transform"></div>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-[11px] font-black text-gray-400 tracking-[0.15em] uppercase">Status</span>
                  <span className="text-[18px] font-black text-emerald-500">Connected</span>
                </div>
              </div>
              <div className="text-gray-200">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-10 h-10">
                  <path d="M4 11.532C4 8.478 6.478 6 9.532 6c.942 0 1.84.234 2.65.656C13.251 4.545 15.429 3 18 3c3.866 0 7 3.134 7 7 0 .285-.017.566-.05.842C26.069 11.233 27 12.83 27 14.613c0 2.976-2.412 5.387-5.387 5.387h-16C2.613 20 0 17.387 0 14.012c0-2.822 1.914-5.228 4.536-5.875A5.503 5.503 0 0 1 4 11.532Z" />
                </svg>
              </div>
            </div>

            {/* Total SKU Card */}
            <div className="bg-white rounded-[22px] p-6 shadow-[0_8px_25px_-5px_rgba(0,0,0,0.05)] border border-gray-100 flex items-center gap-5 hover:shadow-[0_12px_35px_-5px_rgba(0,0,0,0.08)] transition-all">
              <div className="w-14 h-14 rounded-[18px] bg-blue-50 flex items-center justify-center text-blue-600 ring-4 ring-blue-50/50">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-7 h-7">
                  <path d="M2 7.02l9.646-5.568a1 1 0 0 1 .708 0L22 7.02M2 7.02l9.646 5.568a1 1 0 0 0 .708 0L22 7.02M2 7.02v9.96c0 .356.185.688.496.868L12 23m10-15.98v9.96c0 .356-.185.688-.496.868L12 23m0 0v-10.412" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                </svg>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-[11px] font-black text-gray-400 tracking-[0.15em] uppercase">Total SKU</span>
                <span className="text-[20px] font-black text-gray-900 leading-none">{allProducts.length.toLocaleString()}</span>
              </div>
            </div>

            {/* Cache Card */}
            <div className="bg-white rounded-[22px] p-6 shadow-[0_8px_25px_-5px_rgba(0,0,0,0.05)] border border-gray-100 flex items-center gap-5 hover:shadow-[0_12px_35px_-5px_rgba(0,0,0,0.08)] transition-all">
              <div className="w-14 h-14 rounded-[18px] bg-gray-50 flex items-center justify-center text-gray-600 border border-gray-100 ring-4 ring-gray-50/50">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="w-7 h-7 -ml-0.5" strokeWidth={2.5}>
                  <rect x="4" y="4" width="16" height="16" rx="2" ry="2" />
                  <rect x="9" y="9" width="6" height="6" />
                  <line x1="9" y1="1" x2="9" y2="4" /><line x1="15" y1="1" x2="15" y2="4" />
                  <line x1="9" y1="20" x2="9" y2="23" /><line x1="15" y1="20" x2="15" y2="23" />
                  <line x1="20" y1="9" x2="23" y2="9" /><line x1="20" y1="14" x2="23" y2="14" />
                  <line x1="1" y1="9" x2="4" y2="9" /><line x1="1" y1="14" x2="4" y2="14" />
                </svg>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-[11px] font-black text-gray-400 tracking-[0.15em] uppercase">Cache</span>
                <span className="text-[20px] font-black text-gray-900 leading-none">{logCache.size}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}