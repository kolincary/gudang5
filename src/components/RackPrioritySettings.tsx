import React, { useState, useEffect, useMemo, useDeferredValue } from 'react';
import { Card, CardContent } from './ui/Card';
import { Button } from './ui/Button';
import { supabase } from '../lib/supabase';
import { Toast } from './ui/Toast';
import {
  Search,
  X,
  RefreshCw,
  Filter,
  CheckSquare,
  Square,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  CheckCircle2,
  XCircle,
  Layers,
  Sparkles,
  SlidersHorizontal,
  Check
} from 'lucide-react';

interface ProductRackItem {
  id: string;
  nama_produk: string;
  rak: string;
  is_excluded: boolean;
}

interface StockItem {
  nama_produk: string;
  rak: string;
}

export function RackPrioritySettings() {
  const [productRacks, setProductRacks] = useState<ProductRackItem[]>([]);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [rackFilter, setRackFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  const [uniqueRacks, setUniqueRacks] = useState<string[]>([]);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(100);

  // Deferred search term for lag-free typing
  const deferredSearchTerm = useDeferredValue(searchTerm);

  const showToast = (message: string, type: 'success' | 'error' | 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchAllStockData = async () => {
    let allData: StockItem[] = [];
    let from = 0;
    const pageSizeChunk = 1000;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabase
        .from('stock_items')
        .select('nama_produk, rak')
        .eq('status', 'Aktif')
        .not('rak', 'is', null)
        .not('rak', 'eq', '')
        .order('nama_produk', { ascending: true })
        .order('rak', { ascending: true })
        .range(from, from + pageSizeChunk - 1);

      if (error) throw error;

      if (data && data.length > 0) {
        allData = [...allData, ...data];
        from += pageSizeChunk;
        hasMore = data.length === pageSizeChunk;
      } else {
        hasMore = false;
      }
    }

    return allData;
  };

  const fetchAllExclusionData = async () => {
    let allData: any[] = [];
    let from = 0;
    const pageSizeChunk = 1000;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabase
        .from('product_rack_exclusions')
        .select('*')
        .range(from, from + pageSizeChunk - 1);

      if (error) throw error;

      if (data && data.length > 0) {
        allData = [...allData, ...data];
        from += pageSizeChunk;
        hasMore = data.length === pageSizeChunk;
      } else {
        hasMore = false;
      }
    }

    return allData;
  };

  const fetchAllRackLocations = async () => {
    let allData: string[] = [];
    let from = 0;
    const pageSizeChunk = 1000;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabase
        .from('rack_locations')
        .select('nama')
        .order('nama', { ascending: true })
        .range(from, from + pageSizeChunk - 1);

      if (error) throw error;

      if (data && data.length > 0) {
        allData = [...allData, ...data.map((item: any) => item.nama)];
        from += pageSizeChunk;
        hasMore = data.length === pageSizeChunk;
      } else {
        hasMore = false;
      }
    }

    return allData;
  };

  const loadData = async () => {
    try {
      setLoading(true);

      const [stockData, exclusionData, rackLocationsData] = await Promise.all([
        fetchAllStockData(),
        fetchAllExclusionData(),
        fetchAllRackLocations()
      ]);

      const uniqueProductRacks = new Map<string, StockItem>();
      stockData.forEach((item: StockItem) => {
        const key = `${item.nama_produk}|${item.rak}`;
        if (!uniqueProductRacks.has(key)) {
          uniqueProductRacks.set(key, item);
        }
      });

      setUniqueRacks(rackLocationsData);

      const exclusionMap = new Map<string, boolean>();
      exclusionData.forEach((item: any) => {
        const key = `${item.nama_produk}|${item.rak}`;
        exclusionMap.set(key, item.is_excluded);
      });

      const productRackItems: ProductRackItem[] = [];
      uniqueProductRacks.forEach((item, key) => {
        productRackItems.push({
          id: key,
          nama_produk: item.nama_produk,
          rak: item.rak,
          is_excluded: exclusionMap.get(key) || false
        });
      });

      setProductRacks(productRackItems);
    } catch (error) {
      console.error('Error loading data:', error);
      showToast('Gagal memuat data', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Filtered dataset
  const filteredData = useMemo(() => {
    const term = deferredSearchTerm.trim().toLowerCase();
    return productRacks.filter(item => {
      const matchSearch = !term ||
        item.nama_produk.toLowerCase().includes(term) ||
        item.rak.toLowerCase().includes(term);

      const matchRack = !rackFilter || item.rak === rackFilter;

      const matchStatus =
        statusFilter === 'ALL' ||
        (statusFilter === 'ACTIVE' && !item.is_excluded) ||
        (statusFilter === 'INACTIVE' && item.is_excluded);

      return matchSearch && matchRack && matchStatus;
    });
  }, [productRacks, deferredSearchTerm, rackFilter, statusFilter]);

  // Reset page to 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [deferredSearchTerm, rackFilter, statusFilter, pageSize]);

  // Pagination calculation
  const totalPages = Math.max(1, Math.ceil(filteredData.length / pageSize));
  const validCurrentPage = Math.min(Math.max(1, currentPage), totalPages);

  const paginatedData = useMemo(() => {
    const startIndex = (validCurrentPage - 1) * pageSize;
    return filteredData.slice(startIndex, startIndex + pageSize);
  }, [filteredData, validCurrentPage, pageSize]);

  // Overall stats
  const stats = useMemo(() => {
    let active = 0;
    let inactive = 0;
    productRacks.forEach(item => {
      if (item.is_excluded) inactive++;
      else active++;
    });
    return { total: productRacks.length, active, inactive };
  }, [productRacks]);

  // Selection helpers
  const isAllPageSelected = useMemo(() => {
    if (paginatedData.length === 0) return false;
    return paginatedData.every(item => selectedItems.has(item.id));
  }, [paginatedData, selectedItems]);

  const isAllFilteredSelected = useMemo(() => {
    if (filteredData.length === 0) return false;
    return filteredData.every(item => selectedItems.has(item.id));
  }, [filteredData, selectedItems]);

  const handleToggleSelectPage = () => {
    const newSelected = new Set(selectedItems);
    if (isAllPageSelected) {
      paginatedData.forEach(item => newSelected.delete(item.id));
    } else {
      paginatedData.forEach(item => newSelected.add(item.id));
    }
    setSelectedItems(newSelected);
  };

  const handleSelectAllFiltered = () => {
    const newSelected = new Set(selectedItems);
    filteredData.forEach(item => newSelected.add(item.id));
    setSelectedItems(newSelected);
  };

  const handleClearSelection = () => {
    setSelectedItems(new Set());
  };

  const handleSelectItem = (id: string) => {
    const newSelected = new Set(selectedItems);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedItems(newSelected);
  };

  // Fast single-row toggle
  const handleSingleToggle = async (item: ProductRackItem) => {
    const targetExcluded = !item.is_excluded;

    // Optimistic UI update
    setProductRacks(prev =>
      prev.map(p => (p.id === item.id ? { ...p, is_excluded: targetExcluded } : p))
    );

    try {
      const { error } = await supabase
        .from('product_rack_exclusions')
        .upsert({
          nama_produk: item.nama_produk,
          rak: item.rak,
          is_excluded: targetExcluded
        }, {
          onConflict: 'nama_produk,rak'
        });

      if (error) throw error;

      showToast(
        `${item.nama_produk} (${item.rak}) ${targetExcluded ? 'dinonaktifkan' : 'diaktifkan'}`,
        'success'
      );
    } catch (error) {
      console.error('Error updating exclusion:', error);
      // Revert optimistic update
      setProductRacks(prev =>
        prev.map(p => (p.id === item.id ? { ...p, is_excluded: item.is_excluded } : p))
      );
      showToast('Gagal menyimpan perubahan', 'error');
    }
  };

  // Fast batch toggle with chunking & optimistic update
  const handleToggleExclusion = async (enable: boolean) => {
    if (selectedItems.size === 0) {
      showToast('Pilih item terlebih dahulu', 'info');
      return;
    }

    const selectedIdsList = Array.from(selectedItems);
    const updates: { nama_produk: string; rak: string; is_excluded: boolean }[] = [];

    selectedIdsList.forEach(id => {
      const item = productRacks.find(p => p.id === id);
      if (item) {
        updates.push({
          nama_produk: item.nama_produk,
          rak: item.rak,
          is_excluded: enable
        });
      }
    });

    if (updates.length === 0) return;

    try {
      setSaving(true);

      // Optimistic update
      setProductRacks(prev =>
        prev.map(p => (selectedItems.has(p.id) ? { ...p, is_excluded: enable } : p))
      );

      // Batch in chunks of 100 for maximum speed and safety
      const CHUNK_SIZE = 100;
      for (let i = 0; i < updates.length; i += CHUNK_SIZE) {
        const chunk = updates.slice(i, i + CHUNK_SIZE);
        const { error } = await supabase
          .from('product_rack_exclusions')
          .upsert(chunk, { onConflict: 'nama_produk,rak' });

        if (error) throw error;
      }

      showToast(
        `Berhasil ${enable ? 'menonaktifkan' : 'mengaktifkan'} ${updates.length} item`,
        'success'
      );

      setSelectedItems(new Set());
    } catch (error) {
      console.error('Error updating exclusions:', error);
      showToast('Gagal menyimpan perubahan', 'error');
      // Reload on error to restore true state
      await loadData();
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 bg-white rounded-xl shadow-xs border border-gray-200">
        <RefreshCw className="h-10 w-10 animate-spin text-blue-600 mb-3" />
        <p className="text-gray-700 font-semibold text-base">Memuat Pengaturan Prioritas Rak...</p>
        <p className="text-gray-400 text-xs mt-1">Mengambil data produk dan lokasi rak</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      {/* Header Banner */}
      <div className="bg-gradient-to-r from-blue-700 via-blue-600 to-indigo-700 text-white p-5 rounded-2xl shadow-sm border border-blue-800">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-white/10 backdrop-blur-md rounded-xl">
                <SlidersHorizontal className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-black tracking-tight">PENGATURAN PRIORITAS RAK</h1>
                <p className="text-xs text-blue-100 mt-0.5">
                  Atur produk dan rak yang ingin dikecualikan dari auto-select sistem scanning
                </p>
              </div>
            </div>
          </div>
          <Button
            onClick={loadData}
            variant="secondary"
            disabled={loading || saving}
            className="bg-white/95 hover:bg-white text-blue-700 font-bold shadow-xs hover:shadow transition-all px-4 py-2"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh Data
          </Button>
        </div>

        {/* Quick Stat Pills */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
          <div className="bg-white/10 backdrop-blur-md border border-white/15 rounded-xl p-3">
            <span className="text-[11px] font-medium text-blue-100 block">Total Produk - Rak</span>
            <span className="text-xl font-black">{stats.total.toLocaleString()}</span>
          </div>
          <div className="bg-white/10 backdrop-blur-md border border-white/15 rounded-xl p-3">
            <span className="text-[11px] font-medium text-emerald-200 block">Status Aktif (Auto)</span>
            <span className="text-xl font-black text-emerald-300">{stats.active.toLocaleString()}</span>
          </div>
          <div className="bg-white/10 backdrop-blur-md border border-white/15 rounded-xl p-3">
            <span className="text-[11px] font-medium text-rose-200 block">Nonaktif (Diabaikan)</span>
            <span className="text-xl font-black text-rose-300">{stats.inactive.toLocaleString()}</span>
          </div>
          <div className="bg-white/10 backdrop-blur-md border border-white/15 rounded-xl p-3">
            <span className="text-[11px] font-medium text-amber-200 block">Item Dipilih</span>
            <span className="text-xl font-black text-amber-300">{selectedItems.size.toLocaleString()}</span>
          </div>
        </div>
      </div>

      {/* Filter & Action Controls Bar */}
      <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs space-y-3">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          {/* Search & Select Filters */}
          <div className="flex flex-wrap items-center gap-3 flex-1">
            {/* Search Input */}
            <div className="relative flex-1 min-w-[240px]">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-8 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-medium"
                placeholder="Cari SKU / nama produk / rak..."
              />
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2.5 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* Filter Rak */}
            <div className="relative min-w-[150px]">
              <select
                value={rackFilter}
                onChange={(e) => setRackFilter(e.target.value)}
                className="w-full px-3 py-2 text-sm pr-8 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white font-medium cursor-pointer"
              >
                <option value="">Semua Rak ({uniqueRacks.length})</option>
                {uniqueRacks.map(rack => (
                  <option key={rack} value={rack}>{rack}</option>
                ))}
              </select>
            </div>

            {/* Filter Status */}
            <div className="flex rounded-lg border border-gray-200 p-0.5 bg-gray-50">
              <button
                type="button"
                onClick={() => setStatusFilter('ALL')}
                className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${
                  statusFilter === 'ALL'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Semua ({filteredData.length})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('ACTIVE')}
                className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${
                  statusFilter === 'ACTIVE'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-gray-600 hover:text-emerald-700'
                }`}
              >
                Aktif
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('INACTIVE')}
                className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${
                  statusFilter === 'INACTIVE'
                    ? 'bg-rose-600 text-white shadow-xs'
                    : 'text-gray-600 hover:text-rose-700'
                }`}
              >
                Nonaktif
              </button>
            </div>
          </div>

          {/* Batch Action Buttons */}
          <div className="flex items-center gap-2 shrink-0">
            <Button
              onClick={() => handleToggleExclusion(true)}
              disabled={selectedItems.size === 0 || saving}
              variant="danger"
              size="sm"
              className="bg-rose-600 hover:bg-rose-700 text-white font-bold px-3 py-2 text-xs flex items-center gap-1.5 shadow-xs disabled:opacity-40"
            >
              <XCircle className="h-4 w-4" />
              Nonaktifkan ({selectedItems.size})
            </Button>
            <Button
              onClick={() => handleToggleExclusion(false)}
              disabled={selectedItems.size === 0 || saving}
              variant="success"
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 py-2 text-xs flex items-center gap-1.5 shadow-xs disabled:opacity-40"
            >
              <CheckCircle2 className="h-4 w-4" />
              Aktifkan ({selectedItems.size})
            </Button>
          </div>
        </div>

        {/* Selection Bar Info if items selected */}
        {selectedItems.size > 0 && (
          <div className="bg-blue-50/90 border border-blue-200 rounded-lg px-3.5 py-2 flex flex-wrap items-center justify-between gap-2 text-xs text-blue-900">
            <div className="flex items-center gap-2">
              <span className="font-bold">
                {selectedItems.size} item dipilih
              </span>
              {!isAllFilteredSelected && filteredData.length > selectedItems.size && (
                <button
                  onClick={handleSelectAllFiltered}
                  className="font-bold text-blue-700 hover:underline hover:text-blue-900 ml-2"
                >
                  Pilih semua {filteredData.length.toLocaleString()} data hasil filter
                </button>
              )}
            </div>
            <button
              onClick={handleClearSelection}
              className="text-red-600 hover:text-red-800 font-bold hover:underline"
            >
              Batalkan Pilihan
            </button>
          </div>
        )}
      </div>

      {/* Main Table Card */}
      <Card className="border border-gray-200 shadow-xs overflow-hidden rounded-xl">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-blue-600 text-white text-xs uppercase tracking-wider font-bold">
                <tr>
                  <th className="px-3 py-3 text-center w-12 border-r border-blue-500">
                    <button
                      type="button"
                      onClick={handleToggleSelectPage}
                      title={isAllPageSelected ? "Hapus centang halaman ini" : "Centang semua halaman ini"}
                      className="text-white hover:text-blue-200 p-0.5 rounded transition-colors inline-flex items-center justify-center"
                    >
                      {isAllPageSelected ? (
                        <CheckSquare className="h-5 w-5" />
                      ) : (
                        <Square className="h-5 w-5" />
                      )}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left border-r border-blue-500">Nama Produk / SKU</th>
                  <th className="px-4 py-3 text-center w-36 border-r border-blue-500">Lokasi Rak</th>
                  <th className="px-4 py-3 text-center w-40 border-r border-blue-500">Status Auto-Select</th>
                  <th className="px-4 py-3 text-center w-32">Aksi Cepat</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 text-sm">
                {paginatedData.map((item, index) => {
                  const isSelected = selectedItems.has(item.id);
                  const isExcluded = item.is_excluded;

                  return (
                    <tr
                      key={item.id}
                      className={`transition-colors ${
                        isSelected
                          ? 'bg-blue-100 hover:bg-blue-150'
                          : isExcluded
                            ? 'bg-red-50/40 hover:bg-red-50/70'
                            : index % 2 === 0
                              ? 'bg-white hover:bg-blue-50/60'
                              : 'bg-blue-50/30 hover:bg-blue-50/80'
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="px-3 py-2.5 text-center border-r border-gray-200">
                        <button
                          type="button"
                          onClick={() => handleSelectItem(item.id)}
                          className="text-blue-600 hover:text-blue-800 p-0.5 rounded transition-colors inline-flex items-center justify-center"
                        >
                          {isSelected ? (
                            <CheckSquare className="h-5 w-5 text-blue-600" />
                          ) : (
                            <Square className="h-5 w-5 text-gray-400 hover:text-gray-600" />
                          )}
                        </button>
                      </td>

                      {/* Nama Produk */}
                      <td className="px-4 py-2.5 border-r border-gray-200">
                        <span className="font-bold text-gray-900 font-mono text-sm block">
                          {item.nama_produk}
                        </span>
                      </td>

                      {/* Rak */}
                      <td className="px-4 py-2.5 text-center border-r border-gray-200">
                        <span className="inline-block px-3 py-1 bg-blue-100 text-blue-900 rounded-lg font-bold text-xs font-mono border border-blue-200">
                          {item.rak}
                        </span>
                      </td>

                      {/* Status Auto Select */}
                      <td className="px-4 py-2.5 text-center border-r border-gray-200">
                        {isExcluded ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-rose-100 text-rose-800 rounded-full text-xs font-black border border-rose-200 shadow-2xs">
                            <XCircle className="h-3.5 w-3.5 text-rose-600" />
                            NONAKTIF
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-100 text-emerald-800 rounded-full text-xs font-black border border-emerald-200 shadow-2xs">
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                            AKTIF
                          </span>
                        )}
                      </td>

                      {/* Quick Single Toggle */}
                      <td className="px-4 py-2.5 text-center">
                        <button
                          type="button"
                          onClick={() => handleSingleToggle(item)}
                          disabled={saving}
                          className={`px-3 py-1 text-xs font-bold rounded-lg transition-all border shadow-2xs ${
                            isExcluded
                              ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-300'
                              : 'bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-300'
                          }`}
                        >
                          {isExcluded ? 'Aktifkan' : 'Nonaktifkan'}
                        </button>
                      </td>
                    </tr>
                  );
                })}

                {paginatedData.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-12 text-center text-gray-500">
                      <div className="max-w-xs mx-auto space-y-2">
                        <Filter className="h-8 w-8 text-gray-300 mx-auto" />
                        <p className="font-semibold text-gray-700">Tidak ada data yang cocok</p>
                        <p className="text-xs text-gray-400">
                          Coba ubah kata kunci pencarian atau reset filter rak / status
                        </p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Pagination & Footer Info */}
      <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs flex flex-col md:flex-row items-center justify-between gap-4 text-xs">
        {/* Info Rows */}
        <div className="text-gray-600 font-medium">
          Menampilkan{' '}
          <span className="font-bold text-gray-900">
            {filteredData.length === 0 ? 0 : (validCurrentPage - 1) * pageSize + 1}
          </span>
          {' - '}
          <span className="font-bold text-gray-900">
            {Math.min(validCurrentPage * pageSize, filteredData.length)}
          </span>{' '}
          dari <span className="font-bold text-gray-900">{filteredData.length.toLocaleString()}</span> data
          {productRacks.length !== filteredData.length && (
            <span className="text-gray-400 ml-1">
              (difilter dari {productRacks.length.toLocaleString()} total)
            </span>
          )}
        </div>

        {/* Page Size & Navigation Controls */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Per Page Select */}
          <div className="flex items-center gap-1.5 text-gray-700 font-medium">
            <span>Per hal:</span>
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="border border-gray-300 rounded-md px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 font-bold text-xs"
            >
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={250}>250</option>
              <option value={500}>500</option>
            </select>
          </div>

          {/* Pagination Buttons */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage(1)}
              disabled={validCurrentPage <= 1}
              className="p-1.5 rounded-md border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:pointer-events-none"
              title="Halaman Pertama"
            >
              <ChevronsLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={validCurrentPage <= 1}
              className="p-1.5 rounded-md border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:pointer-events-none"
              title="Halaman Sebelumnya"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>

            <span className="px-3 py-1 font-bold text-gray-800 bg-gray-50 border border-gray-200 rounded-md">
              Hal {validCurrentPage} / {totalPages}
            </span>

            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={validCurrentPage >= totalPages}
              className="p-1.5 rounded-md border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:pointer-events-none"
              title="Halaman Selanjutnya"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <button
              onClick={() => setCurrentPage(totalPages)}
              disabled={validCurrentPage >= totalPages}
              className="p-1.5 rounded-md border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:pointer-events-none"
              title="Halaman Terakhir"
            >
              <ChevronsRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
