import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Card, CardContent } from './ui/Card';
import { Button } from './ui/Button';
import { Toast } from './ui/Toast';
import { Modal } from './ui/Modal';
import { Search, ChevronLeft, ChevronRight, ChevronDown, Check, Plus, CreditCard as Edit2, Trash2, X, Upload, Download, FileText, CheckCircle, RefreshCw, Filter, Calendar, Lock, Warehouse, Database, LayoutGrid, List, Wrench, Sparkles, Scale, AlertCircle, PackageCheck, RotateCcw } from 'lucide-react';
import { EntriDataModal } from './EntriDataModal';
import { ConfirmDialog } from './ui/ConfirmDialog';
import { supabase, fetchAllStockItems } from '../lib/supabase';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { performStockSync } from '../services/stockSyncService';
import { verifyPin } from '../lib/pinValidator';
import { useDatabaseConfig } from '../lib/DatabaseContext';
import { DatabaseService } from '../lib/DatabaseService';

export interface RedistributionMove {
  id: string;
  sku: string;
  rak: string;
  fromTgl: string;
  toTgl: string;
  jumlah: number;
}

const formatDateDisplay = (dateStr: string): string => {
  if (!dateStr) return '';
  let cleanStr = dateStr.trim();
  if (cleanStr.includes(' ') || cleanStr.includes('T')) {
    cleanStr = cleanStr.split(/[ T]/)[0];
  }
  if (/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.test(cleanStr)) {
    const match = cleanStr.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
    if (match) {
      return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
    }
  }
  if (/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.test(cleanStr)) {
    const match = cleanStr.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    if (match) {
      let day = match[1];
      let month = match[2];
      const year = match[3];
      if (parseInt(month) > 12 && parseInt(day) <= 12) {
        [day, month] = [month, day];
      }
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }
  }
  return cleanStr;
};


// Global Cache for instant load & PIN Session
let globalStockCache: any[] = [];
let isPinVerifiedSession = false;

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

export interface StockReport {
  id: string;
  nama_produk: string;
  packing: string;
  rak: string;
  sub_rak?: string;
  satuan: string;
  stok_awal: number;
  masuk: number;
  keluar: number;
  tersedia: number;
  status?: string;
  created_at?: string;
  updated_at?: string;
}



interface ImportProgress {
  isImporting: boolean;
  progress: number;
  total: number;
  current: number;
  message: string;
}

interface PaginationInfo {
  currentPage: number;
  totalPages: number;
  totalCount: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

// --- TIPE BARU UNTUK FILTER CANGGIH ---
type FilterableColumn = keyof Omit<StockReport, 'id' | 'created_at' | 'updated_at' | 'status'>;
type FilterValues = Set<string | number>;
type ActiveFilters = Partial<Record<FilterableColumn, FilterValues>>;

interface ExportProgress {
  isExporting: boolean;
  progress: number;
  total: number;
  current: number;
  stage: string;
  message: string;
}

interface SnapshotFilter {
  enabled: boolean;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
}

export interface RedistributionMove {
  id: string;
  sku: string;
  actionType: 'FIX_RAK' | 'FIX_TGL_SCAN' | 'FIX_RAK_DAN_TGL';
  fromRak: string;
  toRak: string;
  fromTgl: string;
  toTgl: string;
  jumlah: number;
  keterangan: string;
}

const parseDateToTime = (dateStr: string): number => {
  const norm = formatDateDisplay(dateStr);
  if (!norm) return 0;
  const time = new Date(norm).getTime();
  return isNaN(time) ? 0 : time;
};

// --- KOMPONEN BARU: FILTER POPOVER ---
const FilterPopover: React.FC<{
  column: { key: FilterableColumn; name: string; };
  position: { top: number; left: number };
  allOptions: (string | number)[];
  activeFilters: ActiveFilters;
  onApplyFilter: (columnKey: FilterableColumn, selected: FilterValues) => void;
  onClose: () => void;
}> = ({ column, position, allOptions, activeFilters, onApplyFilter, onClose }) => {
  const popoverRef = useRef<HTMLDivElement>(null);
  const [localSelection, setLocalSelection] = useState<FilterValues>(() => activeFilters[column.key] || new Set());
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  const handleApply = () => {
    onApplyFilter(column.key, localSelection);
    onClose();
  };

  const handleReset = () => {
    setLocalSelection(new Set());
    onApplyFilter(column.key, new Set());
    onClose();
  };

  const filteredOptions = useMemo(() =>
    allOptions.filter(opt => String(opt).toLowerCase().includes(searchTerm.toLowerCase())),
    [allOptions, searchTerm]
  );

  const isAllSelected = useMemo(() =>
    allOptions.length > 0 && localSelection.size === allOptions.length,
    [allOptions, localSelection]
  );

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalSelection(e.target.checked ? new Set(allOptions) : new Set());
  };

  const handleOptionToggle = (option: string | number) => {
    const newSelected = new Set(localSelection);
    if (newSelected.has(option)) newSelected.delete(option);
    else newSelected.add(option);
    setLocalSelection(newSelected);
  };

  return (
    <div
      ref={popoverRef}
      className="fixed bg-white border border-gray-300 rounded-md shadow-lg z-50 w-72 p-3 space-y-2"
      style={{ top: position.top, left: position.left }}
      onClick={e => e.stopPropagation()}
    >
      <h4 className="font-semibold text-sm text-gray-800">Filter berdasarkan {column.name}</h4>
      <input
        type="text"
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 text-black"
        placeholder="Cari nilai..."
        autoFocus
      />
      <div className="max-h-48 overflow-y-auto space-y-1 text-gray-700 pr-1 border-t border-b py-2 my-2">
        {allOptions.length > 0 && (
          <div className="flex items-center space-x-2 p-1 border-b">
            <input type="checkbox" id="select-all" checked={isAllSelected} onChange={handleSelectAll} className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
            <label htmlFor="select-all" className="text-sm font-medium">(Pilih Semua)</label>
          </div>
        )}
        {filteredOptions.map((option, index) => (
          <div key={index} className="flex items-center space-x-2 p-1 hover:bg-gray-100 rounded">
            <input type="checkbox" id={`${column.key}-${index}`} checked={localSelection.has(option)} onChange={() => handleOptionToggle(option)} className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
            <label htmlFor={`${column.key}-${index}`} className="text-sm truncate" title={String(option)}>{String(option)}</label>
          </div>
        ))}
        {filteredOptions.length === 0 && <div className="text-sm text-gray-500 text-center py-2">Tidak ada data</div>}
      </div>
      <div className="flex justify-end pt-2 space-x-2 border-t mt-2">
        <Button variant="secondary" size="sm" onClick={handleReset}>Reset</Button>
        <Button variant="primary" size="sm" onClick={handleApply}>OK</Button>
      </div>
    </div>
  );
};

export function DataGudang() {
  const { readMode, writeMode } = useDatabaseConfig();
  // State management
  const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' }>({ key: 'created_at', direction: 'desc' });
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRack, setSelectedRack] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);
  const [isEntriModalOpen, setIsEntriModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [stockData, setStockData] = useState<StockReport[]>(globalStockCache);
  const allStockItemsRef = useRef<StockReport[]>(globalStockCache);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [editingItem, setEditingItem] = useState<StockReport | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isSelectingAllPages, setIsSelectingAllPages] = useState(false);
  const [isBulkEditModalOpen, setIsBulkEditModalOpen] = useState(false);
  const [bulkEditItems, setBulkEditItems] = useState<StockReport[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [rackSearchTerm, setRackSearchTerm] = useState('');
  const [showRackDropdown, setShowRackDropdown] = useState(false);
  const [importProgress, setImportProgress] = useState<ImportProgress>({
    isImporting: false,
    progress: 0,
    total: 0,
    current: 0,
    message: ''
  });
  const [deleteConfirm, setDeleteConfirm] = useState<{
    isOpen: boolean;
    itemId: string;
    itemName: string;
  }>({
    isOpen: false,
    itemId: '',
    itemName: ''
  });
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState({
    isOpen: false,
    count: 0
  });
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

  const [exportProgress, setExportProgress] = useState<ExportProgress>({
    isExporting: false,
    progress: 0,
    total: 0,
    current: 0,
    stage: '',
    message: ''
  });

  // Pagination info
  const [paginationInfo, setPaginationInfo] = useState<PaginationInfo>({
    currentPage: 1,
    totalPages: 0,
    totalCount: 0,
    hasNextPage: false,
    hasPrevPage: false
  });

  // Cache untuk database log entries (untuk kalkulasi masuk/keluar)
  const [logCache, setLogCache] = useState<Map<string, any[]>>(new Map());
  const [uniqueRacks, setUniqueRacks] = useState<string[]>([]);

  // --- STATE BARU UNTUK FILTER CANGGIH ---
  const [filters, setFilters] = useState<ActiveFilters>({});
  const [activeFilterColumn, setActiveFilterColumn] = useState<FilterableColumn | null>(null);
  const [popoverPosition, setPopoverPosition] = useState({ top: 0, left: 0 });
  const [allColumnOptions, setAllColumnOptions] = useState<Record<string, (string | number)[]>>({});
  const [currentPageColumnOptions, setCurrentPageColumnOptions] = useState<Record<string, (string | number)[]>>({}); // Untuk kolom kalkulasi
  const filterIconRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const rackDropdownRef = useRef<HTMLDivElement>(null);
  const rackInputRef = useRef<HTMLInputElement>(null);

  // --- MULTI-SKU BALANCE REDISTRIBUTION STATE ---
  const [isAnalyzingBalance, setIsAnalyzingBalance] = useState(false);
  const [isExecutingBalanceFix, setIsExecutingBalanceFix] = useState(false);
  const [isRedistributePreviewOpen, setIsRedistributePreviewOpen] = useState(false);
  const [redistributeMoves, setRedistributeMoves] = useState<RedistributionMove[]>([]);
  const [previewSearchTerm, setPreviewSearchTerm] = useState('');

  // Click outside to close rack dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        rackDropdownRef.current &&
        !rackDropdownRef.current.contains(event.target as Node) &&
        rackInputRef.current &&
        !rackInputRef.current.contains(event.target as Node)
      ) {
        setShowRackDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // --- PIN PROTECTION STATE ---
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const [pin, setPin] = useState('');
  const [pinMessage, setPinMessage] = useState({ text: '', type: '' });
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const [pinLoading, setPinLoading] = useState(false);
  const pinInputRef = useRef<HTMLInputElement>(null);

  const handleActionWithPin = (action: () => void) => {
    if (isPinVerifiedSession) {
      action();
      return;
    }
    setPendingAction(() => action);
    setIsPinModalOpen(true);
    setPin('');
    setPinMessage({ text: '', type: '' });
  };

  const handlePinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPinLoading(true);
    const isValid = await verifyPin(pin);
    setPinLoading(false);
    if (isValid) {
      isPinVerifiedSession = true;
      setPinMessage({ text: 'PIN Benar!', type: 'success' });
      setTimeout(() => {
        setIsPinModalOpen(false);
        if (pendingAction) {
          pendingAction();
          setPendingAction(null);
        }
        setPinMessage({ text: '', type: '' });
      }, 500);
    } else {
      setPinMessage({ text: 'PIN Salah. Coba lagi.', type: 'error' });
      setPin('');
      if (pinInputRef.current) pinInputRef.current.focus();
    }
  };

  useEffect(() => {
    if (isPinModalOpen && pinInputRef.current) {
      pinInputRef.current.focus();
    }
  }, [isPinModalOpen]);

  // State untuk Filter Minus
  const [showMinusOnly, setShowMinusOnly] = useState(false);
  const showMinusOnlyRef = useRef(false);

  useEffect(() => {
    showMinusOnlyRef.current = showMinusOnly;
  }, [showMinusOnly]);

  // State untuk Filter Hanya Ada Stok (Kecuali Qty 0) - Khusus jika Filter Rak Aktif
  const [showAvailableOnly, setShowAvailableOnly] = useState(false);
  const showAvailableOnlyRef = useRef(false);

  useEffect(() => {
    showAvailableOnlyRef.current = showAvailableOnly;
  }, [showAvailableOnly]);

  const isRakFiltered = Boolean(selectedRack && selectedRack !== 'Semua Rak');

  // Otomatis nonaktifkan filter stok tersedia jika filter rak di-reset / dikosongkan
  useEffect(() => {
    if (!isRakFiltered && showAvailableOnly) {
      setShowAvailableOnly(false);
    }
  }, [isRakFiltered, showAvailableOnly]);

  const handleToggleAvailableOnly = () => {
    if (!isRakFiltered) {
      showToast('Pilih filter rak terlebih dahulu untuk mengaktifkan filter ini!', 'warning');
      return;
    }
    const nextState = !showAvailableOnly;
    setShowAvailableOnly(nextState);
    if (nextState && showMinusOnly) {
      setShowMinusOnly(false);
    }
    setCurrentPage(1);
    showToast(
      nextState
        ? `Filter aktif: Hanya menampilkan produk dengan stok tersedia (Qty ≠ 0) di rak "${selectedRack}"`
        : 'Filter dinonaktifkan: Menampilkan semua stok',
      'info'
    );
  };

  const hasActiveFilters = Boolean(
    searchTerm ||
    (selectedRack && selectedRack !== 'Semua Rak') ||
    showMinusOnly ||
    showAvailableOnly ||
    Object.keys(filters).length > 0
  );

  const handleResetAllFilters = useCallback(() => {
    setSearchTerm('');
    setRackSearchTerm('');
    setSelectedRack('');
    setShowRackDropdown(false);
    setShowMinusOnly(false);
    setShowAvailableOnly(false);
    setFilters({});
    setCurrentPage(1);
    showToast('Semua filter berhasil di-reset', 'info');
  }, [showToast]);

  // State untuk Snapshot Filter (SO Mode)
  const [snapshotFilter, setSnapshotFilter] = useState<SnapshotFilter>(() => {
    const saved = localStorage.getItem('datagudang_snapshot_filter');
    if (saved) {
      return JSON.parse(saved);
    }
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    return {
      enabled: false,
      startDate: yesterday.toISOString().split('T')[0],
      startTime: '00:00:00',
      endDate: yesterday.toISOString().split('T')[0],
      endTime: '23:59:59'
    };
  });
  const [showSnapshotModal, setShowSnapshotModal] = useState(false);

  // Debounced search term
  const debouncedSearchTerm = useDebounce(searchTerm, 500);

  // Real-time listener untuk Master Barang (stock_items)
  useEffect(() => {
    if (readMode !== 'firebase') return;
    
    const unsub = onSnapshot(collection(db, 'stock_items'), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as StockReport[];
      // Hanya update jika ada perubahan jumlah data atau perubahan signifikan agar tidak infinite loop
      allStockItemsRef.current = data;
      // Memicu re-render data saat ini
      setSearchTerm(prev => prev); 
    });
    return () => unsub();
  }, [readMode]);

  // Load initial data dan setup
  useEffect(() => {
    loadInitialData();
    loadUniqueRacks();
    // Memuat opsi untuk filter canggih
    const loadAllFilterOptions = async () => {
      const options: Record<string, (string | number)[]> = {};
      // Tambahkan stok_awal ke kolom yang diambil dari seluruh database
      const columnsToFetch: FilterableColumn[] = ['nama_produk', 'packing', 'rak', 'sub_rak', 'satuan', 'stok_awal'];
      for (const col of columnsToFetch) {
        const { data, error } = await supabase.from('stock_items').select(col).limit(3000);
        if (!error && data) {
          const uniqueValues = [...new Set(data.map(item => (item as any)[col]).filter(val => val !== null && val !== ''))];
          // Sort numerik jika kolomnya stok_awal
          if (col === 'stok_awal') {
            uniqueValues.sort((a, b) => (a as number) - (b as number));
          } else {
            uniqueValues.sort();
          }
          options[col] = uniqueValues;
        }
      }
      setAllColumnOptions(options);
    };
    loadAllFilterOptions();
  }, []);

  // Load data when filters or pagination change
  useEffect(() => {
    if (!initialLoading) {
      loadStockData();
    }
  }, [debouncedSearchTerm, selectedRack, currentPage, itemsPerPage, filters, snapshotFilter.enabled, showMinusOnly, showAvailableOnly, sortConfig]); // Menggunakan 'filters' tunggal

  const loadInitialData = async () => {
    try {
      await loadStockData(globalStockCache.length === 0); // Force fetch if cache is empty, else silent background fetch

    } catch (error) {
      console.error('Error loading initial data:', error);
      showToast('Gagal memuat data awal', 'error');
    } finally {
      setInitialLoading(false);
    }
  };

  const loadStockData = async (showLoader = false) => {
    try {
      if (showLoader && stockData.length === 0) {
        setLoading(true);
      } else {
        setLoading(true); // Always set loading to show the background sync indicator
      }

      let query = supabase
        .from('stock_items')
        .select('*', { count: 'exact' })
        .eq('status', 'Aktif')
        .order(sortConfig.key === 'nama_produk' ? 'nama_produk' : 'created_at', { ascending: sortConfig.direction === 'asc' });

      // Apply search filter
      if (debouncedSearchTerm) {
        query = query.or(`nama_produk.ilike.%${debouncedSearchTerm}%,rak.ilike.%${debouncedSearchTerm}%`);
      }

      // Apply rack filter (only if selected rack is not empty / not 'Semua Rak')
      if (selectedRack && selectedRack !== 'Semua Rak') {
        query = query.ilike('rak', `%${selectedRack}%`);
      }

      // Apply Minus Filter
      if (showMinusOnly) {
        query = query.lt('tersedia', 0);
      }

      // Apply Available Only / Non-Zero Stock Filter (Kecuali Qty 0)
      if (showAvailableOnly) {
        query = query.neq('tersedia', 0);
      }

      // Apply advanced filters untuk kolom database
      for (const key in filters) {
        const filterKey = key as FilterableColumn;
        if (!['masuk', 'keluar', 'tersedia'].includes(filterKey)) {
          const selectedValues = filters[filterKey];
          if (selectedValues && selectedValues.size > 0) {
            query = query.in(filterKey, Array.from(selectedValues));
          }
        }
      }

      // Apply pagination
      const from = (currentPage - 1) * itemsPerPage;
      const to = from + itemsPerPage - 1;
      query = query.range(from, to);

      const { data, error, count } = await query;

      if (error) {
        console.error('Error loading stock data:', error);
        showToast('Gagal memuat data stok', 'error');
        return;
      }

      const items = data || [];



      // Calculate masuk/keluar using batch fetching
      const skus = items.map(item => item.nama_produk);

      // Fetch logs for all items on this page in one query
      let logQuery = supabase
        .from('database_log')
        .select('sku, rak, type, jumlah, created_at')
        .in('sku', skus)
        .in('type', ['IN', 'OUT']);

      // Apply snapshot filter if enabled
      if (snapshotFilter.enabled) {
        const startDateTime = `${snapshotFilter.startDate}T${snapshotFilter.startTime}`;
        const endDateTime = `${snapshotFilter.endDate}T${snapshotFilter.endTime}`;
        logQuery = logQuery.gte('created_at', startDateTime).lte('created_at', endDateTime);
      }

      const { data: logData, error: logError } = await logQuery;

      if (logError) {
        console.error('Error fetching batch logs:', logError);
      }

      const batchLogs = logData || [];

      // Group logs by SKU + Rak for faster lookup
      const logMap = new Map<string, any[]>();
      batchLogs.forEach(log => {
        const key = `${log.sku}|${log.rak}`;
        if (!logMap.has(key)) {
          logMap.set(key, []);
        }
        logMap.get(key)!.push(log);
      });

      // Map items with calculated stock
      let stockReports = items.map((item) => {
        const key = `${item.nama_produk}|${item.rak}`;
        const itemLogs = logMap.get(key) || [];

        const masuk = itemLogs.filter(e => e.type === 'IN').reduce((sum, e) => sum + (e.jumlah || 0), 0);
        const keluar = itemLogs.filter(e => e.type === 'OUT').reduce((sum, e) => sum + (e.jumlah || 0), 0);
        const tersedia = (item.stok_awal || 0) + masuk - keluar;

        return {
          ...item,
          masuk,
          keluar,
          tersedia
        };
      });

      // Ambil opsi filter untuk kolom kalkulasi dari data yang sudah dimuat
      const currentPageOptions: Record<string, (string | number)[]> = {};
      currentPageOptions['masuk'] = [...new Set(stockReports.map(item => item.masuk))].sort((a, b) => a - b);
      currentPageOptions['keluar'] = [...new Set(stockReports.map(item => item.keluar))].sort((a, b) => a - b);
      currentPageOptions['tersedia'] = [...new Set(stockReports.map(item => item.tersedia))].sort((a, b) => a - b);
      setCurrentPageColumnOptions(currentPageOptions);

      // Terapkan filter untuk kolom kalkulasi secara client-side
      const calculatedCols: FilterableColumn[] = ['masuk', 'keluar', 'tersedia'];
      for (const col of calculatedCols) {
        const selectedValues = filters[col];
        if (selectedValues && selectedValues.size > 0) {
          stockReports = stockReports.filter(item => selectedValues.has(item[col]));
        }
      }

      // Pastikan filter minus diterapkan pada data hasil kalkulasi
      if (showMinusOnly) {
        stockReports = stockReports.filter(item => item.tersedia < 0);
      }

      // Pastikan filter hanya stok tersedia (Qty ≠ 0) diterapkan
      if (showAvailableOnly) {
        stockReports = stockReports.filter(item => item.tersedia !== 0);
      }

      globalStockCache = [...stockReports];
      setStockData(stockReports);

      // Update pagination info
      const totalPages = Math.ceil((count || 0) / itemsPerPage);
      setPaginationInfo({
        currentPage,
        totalPages,
        totalCount: count || 0,
        hasNextPage: currentPage < totalPages,
        hasPrevPage: currentPage > 1
      });

    } catch (error) {
      console.error('Error loading stock data:', error);
      showToast('Terjadi kesalahan saat memuat data', 'error');
    } finally {
      setLoading(false);
    }
  };





  const loadUniqueRacks = async () => {
    try {
      const [racksRes, stockRacksRes] = await Promise.all([
        supabase
          .from('rack_locations')
          .select('nama')
          .eq('status', 'Aktif')
          .order('nama', { ascending: true }),
        supabase
          .from('stock_items')
          .select('rak')
          .not('rak', 'is', null)
          .limit(10000)
      ]);

      const allRacks = new Set<string>();
      (racksRes.data || []).forEach((r: any) => {
        if (r.nama && r.nama.trim()) allRacks.add(r.nama.trim());
      });
      (stockRacksRes.data || []).forEach((r: any) => {
        if (r.rak && r.rak.trim()) allRacks.add(r.rak.trim());
      });

      const sortedRacks = Array.from(allRacks).sort((a, b) =>
        a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
      );
      setUniqueRacks(sortedRacks);
    } catch (error) {
      console.error('Error loading unique racks:', error);
    }
  };

  // Multi-SKU Balance Check & Redistribution Logic (Like Database Log)
  const handleCheckBalanceSelected = async () => {
    if (selectedIds.size === 0) {
      showToast('Pilih setidaknya 1 SKU untuk cek saldo.', 'warning');
      return;
    }

    // Extract selected SKUs
    const selectedSkus = Array.from(selectedIds)
      .map(id => stockData.find(item => item.id === id)?.nama_produk)
      .filter((sku): sku is string => Boolean(sku && sku.trim()));

    const uniqueSkus = Array.from(new Set(selectedSkus));
    if (uniqueSkus.length === 0) {
      showToast('Tidak ada SKU terpilih yang valid.', 'warning');
      return;
    }

    try {
      setIsAnalyzingBalance(true);
      showToast(`Menganalisis saldo stok untuk ${uniqueSkus.length} SKU...`, 'info');

      // Fetch logs in chunks of 50 SKUs to avoid URL size limit
      const batchSize = 50;
      let allLogs: any[] = [];

      for (let i = 0; i < uniqueSkus.length; i += batchSize) {
        const skuChunk = uniqueSkus.slice(i, i + batchSize);
        const { data, error } = await supabase
          .from('database_log')
          .select('id, sku, rak, sub_rak, tgl_scan, type, jumlah')
          .in('sku', skuChunk)
          .or('type.ilike.%IN%,type.ilike.%OUT%')
          .order('id', { ascending: true });

        if (error) throw error;
        if (data) allLogs.push(...data);
      }

      if (allLogs.length === 0) {
        showToast('Tidak ditemukan riwayat log transaksi untuk SKU terpilih.', 'warning');
        return;
      }

      // Group logs by SKU
      const skuGroups = new Map<string, any[]>();
      allLogs.forEach(log => {
        const normSku = (log.sku || '').trim().toUpperCase();
        if (!skuGroups.has(normSku)) skuGroups.set(normSku, []);
        skuGroups.get(normSku)!.push(log);
      });

      const moves: RedistributionMove[] = [];

      skuGroups.forEach((logs, normSku) => {
        // Group into (rak|tgl_scan)
        const groups = new Map<string, {
          balance: number;
          tglScanRaw: string;
          normalizedTglScan: string;
          tglScanTime: number;
          rak: string;
          outRows: any[];
        }>();

        logs.forEach(log => {
          const normRak = (log.rak || '').trim().toUpperCase();
          const normTglScan = formatDateDisplay(log.tgl_scan) || 'No Date';
          const normType = (log.type || '').trim().toUpperCase();
          const finalType = normType.includes('IN') ? 'IN' : 'OUT';
          const key = `${normRak}|${normTglScan}`;

          if (!groups.has(key)) {
            groups.set(key, {
              balance: 0,
              tglScanRaw: (log.tgl_scan || '').trim(),
              normalizedTglScan: normTglScan,
              tglScanTime: parseDateToTime(normTglScan),
              rak: (log.rak || '').trim(),
              outRows: []
            });
          }

          const g = groups.get(key)!;
          const qty = Number(log.jumlah || 0);
          if (finalType === 'IN') {
            g.balance += qty;
          } else {
            g.balance -= qty;
            g.outRows.push({
              id: log.id,
              jumlah: qty,
              rak: (log.rak || '').trim(),
              sub_rak: (log.sub_rak || log.rak || '').trim(),
              tglScan: (log.tgl_scan || '').trim()
            });
          }
        });

        const groupList = Array.from(groups.values());
        const deficitGroups = groupList.filter(g => g.balance < 0);
        const surplusGroups = groupList.filter(g => g.balance > 0);

        // PHASE 1: Cross-Rak Fix for the EXACT SAME Tgl Scan (e.g. IN at B7 on 2025-09-12, OUT at UTAMA on 2025-09-12)
        deficitGroups.forEach(negG => {
          if (negG.balance >= 0) return;

          const sameDateSurplus = surplusGroups.find(
            posG => posG.balance > 0 && posG.normalizedTglScan === negG.normalizedTglScan && posG.rak.toUpperCase() !== negG.rak.toUpperCase()
          );

          if (sameDateSurplus) {
            const rows = [...negG.outRows].sort((a, b) => b.jumlah - a.jumlah);
            for (const row of rows) {
              if (negG.balance >= 0 || sameDateSurplus.balance <= 0) break;
              if (row.jumlah <= sameDateSurplus.balance || negG.balance + row.jumlah <= 0) {
                moves.push({
                  id: row.id,
                  sku: normSku,
                  actionType: 'FIX_RAK',
                  fromRak: negG.rak,
                  toRak: sameDateSurplus.rak,
                  fromTgl: negG.tglScanRaw,
                  toTgl: sameDateSurplus.tglScanRaw,
                  jumlah: row.jumlah,
                  keterangan: `Perbaiki Rak: ${negG.rak} → ${sameDateSurplus.rak} (Tgl Scan: ${negG.normalizedTglScan})`
                });

                negG.balance += row.jumlah;
                sameDateSurplus.balance -= row.jumlah;
              }
            }
          }
        });

        // PHASE 2: Same Rak, Nearest Date Proximity (Chronological date proximity within the same Rak)
        deficitGroups.forEach(negG => {
          if (negG.balance >= 0) return;

          const sameRakSurpluses = surplusGroups
            .filter(posG => posG.balance > 0 && posG.rak.toUpperCase() === negG.rak.toUpperCase())
            .sort((a, b) => Math.abs(a.tglScanTime - negG.tglScanTime) - Math.abs(b.tglScanTime - negG.tglScanTime));

          for (const posG of sameRakSurpluses) {
            if (negG.balance >= 0) break;
            const rows = [...negG.outRows].sort((a, b) => b.jumlah - a.jumlah);

            for (const row of rows) {
              if (negG.balance >= 0 || posG.balance <= 0) break;
              moves.push({
                id: row.id,
                sku: normSku,
                actionType: 'FIX_TGL_SCAN',
                fromRak: negG.rak,
                toRak: posG.rak,
                fromTgl: negG.tglScanRaw,
                toTgl: posG.tglScanRaw,
                jumlah: row.jumlah,
                keterangan: `Perbaiki Tgl Scan di Rak ${negG.rak}: ${negG.tglScanRaw} → ${posG.tglScanRaw}`
              });

              negG.balance += row.jumlah;
              posG.balance -= row.jumlah;
            }
          }
        });

        // PHASE 3: Cross-Rak, Nearest Date Proximity (Fallback if any remaining)
        deficitGroups.forEach(negG => {
          if (negG.balance >= 0) return;

          const crossSurpluses = surplusGroups
            .filter(posG => posG.balance > 0)
            .sort((a, b) => Math.abs(a.tglScanTime - negG.tglScanTime) - Math.abs(b.tglScanTime - negG.tglScanTime));

          for (const posG of crossSurpluses) {
            if (negG.balance >= 0) break;
            const rows = [...negG.outRows].sort((a, b) => b.jumlah - a.jumlah);

            for (const row of rows) {
              if (negG.balance >= 0 || posG.balance <= 0) break;
              moves.push({
                id: row.id,
                sku: normSku,
                actionType: 'FIX_RAK_DAN_TGL',
                fromRak: negG.rak,
                toRak: posG.rak,
                fromTgl: negG.tglScanRaw,
                toTgl: posG.tglScanRaw,
                jumlah: row.jumlah,
                keterangan: `Perbaiki Rak & Tgl: ${negG.rak} (${negG.tglScanRaw}) → ${posG.rak} (${posG.tglScanRaw})`
              });

              negG.balance += row.jumlah;
              posG.balance -= row.jumlah;
            }
          }
        });
      });

      if (moves.length === 0) {
        showToast(`Analisis selesai! Semua saldo pada ${uniqueSkus.length} SKU terpilih sudah seimbang / tidak ada selisih.`, 'info');
        setSelectedIds(new Set());
      } else {
        setRedistributeMoves(moves);
        setPreviewSearchTerm('');
        setIsRedistributePreviewOpen(true);
      }
    } catch (error: any) {
      console.error('Error analyzing balance for selected SKUs:', error);
      showToast(`Gagal melakukan analisis saldo: ${error.message}`, 'error');
    } finally {
      setIsAnalyzingBalance(false);
    }
  };

  const handleExecuteRedistribute = async () => {
    if (redistributeMoves.length === 0) return;

    try {
      setIsExecutingBalanceFix(true);
      showToast(`Memproses ${redistributeMoves.length} pembaruan perbaikan saldo & rak...`, 'info');

      const batchSize = 50;
      let successCount = 0;

      for (let i = 0; i < redistributeMoves.length; i += batchSize) {
        const batch = redistributeMoves.slice(i, i + batchSize);
        const promises = batch.map(move => {
          const updatePayload: Record<string, any> = {
            log_update_user: 'DEVMODE: Smart Balance Fix'
          };
          if (move.toTgl !== move.fromTgl) {
            updatePayload.tgl_scan = move.toTgl;
          }
          if (move.toRak !== move.fromRak) {
            updatePayload.rak = move.toRak;
            updatePayload.sub_rak = move.toRak;
          }
          return supabase
            .from('database_log')
            .update(updatePayload)
            .eq('id', move.id);
        });

        const results = await Promise.all(promises);
        results.forEach(res => {
          if (!res.error) successCount++;
        });
      }

      showToast(`Sukses memperbarui ${successCount} data log! Memuat ulang stok...`, 'success');
      setIsRedistributePreviewOpen(false);
      setRedistributeMoves([]);
      setSelectedIds(new Set());
      loadStockData(true);
    } catch (error: any) {
      console.error('Error executing redistribution:', error);
      showToast('Terjadi kesalahan saat mengeksekusi perbaikan saldo.', 'error');
    } finally {
      setIsExecutingBalanceFix(false);
    }
  };

  // Filtered redistribution moves for preview modal
  const filteredMoves = useMemo(() => {
    if (!previewSearchTerm) return redistributeMoves;
    const term = previewSearchTerm.toLowerCase();
    return redistributeMoves.filter(
      m =>
        m.sku.toLowerCase().includes(term) ||
        m.fromRak.toLowerCase().includes(term) ||
        m.toRak.toLowerCase().includes(term) ||
        m.fromTgl.toLowerCase().includes(term) ||
        m.toTgl.toLowerCase().includes(term) ||
        m.keterangan.toLowerCase().includes(term)
    );
  }, [redistributeMoves, previewSearchTerm]);

  // Memoized filtered racks for dropdown
  const filteredRacks = useMemo(() => {
    if (!rackSearchTerm.trim()) return uniqueRacks;
    const term = rackSearchTerm.toLowerCase().trim();
    return uniqueRacks.filter(rack =>
      rack.toLowerCase().includes(term)
    );
  }, [uniqueRacks, rackSearchTerm]);

  const handlePageChange = useCallback((newPage: number) => {
    if (newPage >= 1 && newPage <= paginationInfo.totalPages) {
      setCurrentPage(newPage);
    }
  }, [paginationInfo.totalPages]);

  const handleItemsPerPageChange = useCallback((newItemsPerPage: number) => {
    setItemsPerPage(newItemsPerPage);
    setCurrentPage(1); // Reset to first page
  }, []);

  const handleRackSelect = useCallback((rack: string) => {
    setSelectedRack(rack);
    setRackSearchTerm('');
    setShowRackDropdown(false);
    setCurrentPage(1); // Reset to first page when filter changes
  }, []);

  const clearRackFilter = useCallback(() => {
    setRackSearchTerm('');
    setSelectedRack('');
    setShowRackDropdown(false);
    setCurrentPage(1);
  }, []);

  const clearSearch = useCallback(() => {
    setSearchTerm('');
    setCurrentPage(1);
  }, []);

  const refreshData = useCallback(() => {
    setLogCache(new Map()); // Clear cache
    // Reset filter
    clearSearch();
    clearRackFilter();
    // Jika mode firebase, data sudah realtime, cukup pancing render ulang.
    // Jika supabase, paksa ambil data lagi.
    if (readMode === 'firebase') {
      loadStockData(false);
    } else {
      loadStockData(true);
    }
    loadUniqueRacks();
    showToast('Sinkronisasi selesai', 'success');
  }, [clearSearch, clearRackFilter, readMode]);

  // Snapshot filter handlers
  const handleApplySnapshot = () => {
    const newSnapshot = { ...snapshotFilter, enabled: true };
    setSnapshotFilter(newSnapshot);
    localStorage.setItem('datagudang_snapshot_filter', JSON.stringify(newSnapshot));
    setShowSnapshotModal(false);
    setLogCache(new Map());
    loadStockData();
    showToast(`Mode SO aktif: ${newSnapshot.startDate} ${newSnapshot.startTime} - ${newSnapshot.endDate} ${newSnapshot.endTime}`, 'info');
  };

  const handleDisableSnapshot = () => {
    const newSnapshot = { ...snapshotFilter, enabled: false };
    setSnapshotFilter(newSnapshot);
    localStorage.setItem('datagudang_snapshot_filter', JSON.stringify(newSnapshot));
    setLogCache(new Map());
    loadStockData();
    showToast('Mode Real-time diaktifkan', 'success');
  };

  const handleSetQuickSnapshot = (type: 'yesterday_15' | 'yesterday_full' | 'today_morning' | 'one_year') => {
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);

    let updates: Partial<SnapshotFilter> = {};

    if (type === 'yesterday_15') {
      updates = {
        startDate: yesterday.toISOString().split('T')[0],
        startTime: '15:00:00',
        endDate: yesterday.toISOString().split('T')[0],
        endTime: '15:00:00'
      };
    } else if (type === 'yesterday_full') {
      updates = {
        startDate: yesterday.toISOString().split('T')[0],
        startTime: '00:00:00',
        endDate: yesterday.toISOString().split('T')[0],
        endTime: '23:59:59'
      };
    } else if (type === 'today_morning') {
      updates = {
        startDate: now.toISOString().split('T')[0],
        startTime: '00:00:00',
        endDate: now.toISOString().split('T')[0],
        endTime: '08:00:00'
      };
    } else if (type === 'one_year') {
      updates = {
        startDate: '2025-01-01',
        startTime: '06:00:00',
        endDate: now.toISOString().split('T')[0],
        endTime: '23:59:59'
      };
    }

    setSnapshotFilter(prev => ({ ...prev, ...updates }));
  };

  // Handle outside clicks for dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.rack-dropdown-container')) {
        setShowRackDropdown(false);
      }
    };

    if (showRackDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showRackDropdown]);

  const handleSaveNewItems = async (newItems: StockReport[]) => {
    try {
      // Pengecekan Duplikat (Hanya jika bukan mode pure Firebase, karena Firebase belum ada index khusus duplikat)
      if (writeMode !== 'firebase') {
        for (const item of newItems) {
          const { data: existing, error: checkError } = await supabase
            .from('stock_items')
            .select('id')
            .eq('nama_produk', item.nama_produk)
            .eq('rak', item.rak)
            .eq('sub_rak', item.sub_rak || item.rak)
            .eq('status', 'Aktif')
            .limit(1);

          if (checkError) {
            console.error('Error checking duplicate:', checkError);
            continue;
          }

          if (existing && existing.length > 0) {
            showToast(`Gagal: Produk "${item.nama_produk}" di Rak "${item.rak}" Sub Rak "${item.sub_rak || item.rak}" sudah ada di database! (Duplikat terdeteksi)`, 'error');
            return;
          }
        }
      }

      const supabaseItems = newItems.map(item => ({
        nama_produk: item.nama_produk,
        packing: item.packing,
        rak: item.rak,
        sub_rak: item.sub_rak,
        satuan: item.satuan,
        stok_awal: item.stok_awal,
        status: 'Aktif'
      }));

      const { data, error } = await DatabaseService.insertStockItems(supabaseItems, writeMode);

      if (error) {
        console.error('Error saving new items:', error);
        showToast('Gagal menyimpan data baru', 'error');
        return;
      }

      if (data && Array.isArray(data)) {
        allStockItemsRef.current = [...data, ...allStockItemsRef.current];
      }
      showToast(`${newItems.length} item berhasil ditambahkan!`, 'success');
      loadStockData(false);
    } catch (error) {
      console.error('Error saving new items:', error);
      showToast('Terjadi kesalahan saat menyimpan data', 'error');
    }
  };

  const handleEdit = useCallback((item: StockReport) => {
    setEditingItem(item);
    setIsEditModalOpen(true);
  }, []);

  const handleDeleteClick = useCallback((item: StockReport) => {
    setDeleteConfirm({
      isOpen: true,
      itemId: item.id,
      itemName: item.nama_produk
    });
  }, []);

  const confirmDelete = async () => {
    try {
      const { error } = await DatabaseService.deleteStockItem(deleteConfirm.itemId, writeMode);

      if (error) {
        console.error('Error deleting item:', error);
        showToast('Gagal menghapus data', 'error');
        return;
      }

      showToast(`Data "${deleteConfirm.itemName}" berhasil dihapus!`, 'success');
      setDeleteConfirm({ isOpen: false, itemId: '', itemName: '' });
      allStockItemsRef.current = allStockItemsRef.current.filter(item => item.id !== deleteConfirm.itemId);
      loadStockData(false);
    } catch (error) {
      console.error('Error deleting item:', error);
      showToast('Terjadi kesalahan saat menghapus data', 'error');
    }
  };

  const handleDeleteBulkClick = useCallback(() => {
    if (selectedIds.size === 0) return;
    setBulkDeleteConfirm({
      isOpen: true,
      count: selectedIds.size
    });
  }, [selectedIds]);

  const confirmBulkDelete = async () => {
    try {
      const idsToDelete = Array.from(selectedIds);
      let failCount = 0;
      let successCount = 0;

      for (const id of idsToDelete) {
        const { error } = await DatabaseService.deleteStockItem(id, writeMode);

        if (error) {
          console.error('Error deleting item:', error);
          failCount++;
        } else {
          successCount++;
        }
      }

      if (failCount > 0) {
        showToast(`Berhasil hapus ${successCount} data, Gagal ${failCount} data`, 'warning');
      } else {
        showToast(`Berhasil menghapus ${successCount} data terpilih!`, 'success');
      }

      setBulkDeleteConfirm({ isOpen: false, count: 0 });
      allStockItemsRef.current = allStockItemsRef.current.filter(item => !selectedIds.has(item.id));
      setSelectedIds(new Set());
      loadStockData(false);
    } catch (error) {
      console.error('Error bulk deleting items:', error);
      showToast('Terjadi kesalahan saat menghapus data massal', 'error');
    }
  };

  const handleUpdateItem = async (updatedItems: StockReport[]) => {
    if (updatedItems.length === 0 || !editingItem) return;

    try {
      const updatedItem = updatedItems[0];

      // Pengecekan Duplikat (Kecuali ID yang sedang di-edit)
      if (writeMode !== 'firebase') {
        const { data: existing, error: checkError } = await supabase
          .from('stock_items')
          .select('id')
          .eq('nama_produk', updatedItem.nama_produk)
          .eq('rak', updatedItem.rak)
          .eq('sub_rak', updatedItem.sub_rak || updatedItem.rak)
          .eq('status', 'Aktif')
          .neq('id', editingItem.id)
          .limit(1);

        if (checkError) {
          console.error('Error checking duplicate:', checkError);
        }

        if (existing && existing.length > 0) {
          showToast(`Gagal: Kombinasi Produk "${updatedItem.nama_produk}", Rak "${updatedItem.rak}", dan Sub Rak "${updatedItem.sub_rak || updatedItem.rak}" sudah ada di database!`, 'error');
          return;
        }
      }

      const updates = {
        nama_produk: updatedItem.nama_produk,
        packing: updatedItem.packing,
        rak: updatedItem.rak,
        sub_rak: updatedItem.sub_rak,
        satuan: updatedItem.satuan,
        stok_awal: updatedItem.stok_awal,
        status: 'Aktif'
      };
      
      const { error } = await DatabaseService.updateStockItem(editingItem.id, updates, writeMode);

      if (error) {
        console.error('Error updating item:', error);
        showToast('Gagal mengupdate data', 'error');
        return;
      }

      showToast(`Data "${updatedItem.nama_produk}" berhasil diupdate!`, 'success');
      setIsEditModalOpen(false);
      setEditingItem(null);
      
      allStockItemsRef.current = allStockItemsRef.current.map(item => 
        item.id === editingItem.id ? { ...item, ...updates } : item
      );
      loadStockData(false);
    } catch (error) {
      console.error('Error updating item:', error);
      showToast('Terjadi kesalahan saat mengupdate data', 'error');
    }
  };

  const isCurrentPageAllSelected = useMemo(() => {
    return stockData.length > 0 && stockData.every(item => selectedIds.has(item.id));
  }, [stockData, selectedIds]);

  const isCurrentPageSomeSelected = useMemo(() => {
    return stockData.some(item => selectedIds.has(item.id)) && !isCurrentPageAllSelected;
  }, [stockData, selectedIds, isCurrentPageAllSelected]);

  const currentPageSelectedCount = useMemo(() => {
    return stockData.filter(item => selectedIds.has(item.id)).length;
  }, [stockData, selectedIds]);

  const handleSelectAll = useCallback((e?: React.ChangeEvent<HTMLInputElement>) => {
    const shouldSelectAll = e ? e.target.checked : !isCurrentPageAllSelected;
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (shouldSelectAll) {
        stockData.forEach(item => next.add(item.id));
      } else {
        stockData.forEach(item => next.delete(item.id));
      }
      return next;
    });
  }, [stockData, isCurrentPageAllSelected]);

  const handleSelectRow = useCallback((id: string) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  }, []);

  const handleSelectAllAcrossPages = async () => {
    try {
      setIsSelectingAllPages(true);
      showToast('Mengambil semua data sesuai filter aktif...', 'info');

      let query = supabase
        .from('stock_items')
        .select('id')
        .eq('status', 'Aktif');

      // Apply search filter
      if (debouncedSearchTerm) {
        query = query.or(`nama_produk.ilike.%${debouncedSearchTerm}%,rak.ilike.%${debouncedSearchTerm}%`);
      }

      // Apply rack filter
      if (debouncedRackFilter && debouncedRackFilter !== 'Semua Rak') {
        query = query.ilike('rak', `%${debouncedRackFilter}%`);
      }

      // Apply Minus Filter
      if (showMinusOnly) {
        query = query.lt('tersedia', 0);
      }

      // Apply Available Only Filter
      if (showAvailableOnly) {
        query = query.neq('tersedia', 0);
      }

      // Apply non-calculated column filters
      for (const key in filters) {
        const filterKey = key as FilterableColumn;
        if (!['masuk', 'keluar', 'tersedia'].includes(filterKey)) {
          const selectedValues = filters[filterKey];
          if (selectedValues && selectedValues.size > 0) {
            query = query.in(filterKey, Array.from(selectedValues));
          }
        }
      }

      let allIds: string[] = [];
      let page = 0;
      const pageSize = 1000;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await query.range(page * pageSize, (page + 1) * pageSize - 1);
        if (error) throw error;
        if (data && data.length > 0) {
          data.forEach((row: any) => allIds.push(row.id));
          if (data.length < pageSize) {
            hasMore = false;
          } else {
            page++;
          }
        } else {
          hasMore = false;
        }
      }

      setSelectedIds(new Set(allIds));
      showToast(`Berhasil memilih ${allIds.length.toLocaleString()} data di semua halaman!`, 'success');
    } catch (err: any) {
      console.error('Error selecting all across pages:', err);
      showToast(`Gagal memilih semua data: ${err.message || 'Terjadi kesalahan'}`, 'error');
    } finally {
      setIsSelectingAllPages(false);
    }
  };

  const handleOpenBulkEdit = useCallback(async () => {
    if (selectedIds.size === 0) return;
    let itemsToEdit = stockData.filter(item => selectedIds.has(item.id));
    
    if (itemsToEdit.length < selectedIds.size) {
      const selectedIdArray = Array.from(selectedIds);
      const cachedItems = allStockItemsRef.current.filter(item => selectedIds.has(item.id));
      const foundMap = new Map<string, StockReport>();
      itemsToEdit.forEach(i => foundMap.set(i.id, i));
      cachedItems.forEach(i => foundMap.set(i.id, i));

      const missingIds = selectedIdArray.filter(id => !foundMap.has(id));
      if (missingIds.length > 0) {
        for (let i = 0; i < missingIds.length; i += 500) {
          const chunk = missingIds.slice(i, i + 500);
          const { data } = await supabase.from('stock_items').select('*').in('id', chunk);
          if (data) {
            data.forEach((item: any) => foundMap.set(item.id, item));
          }
        }
      }
      itemsToEdit = Array.from(foundMap.values());
    }

    setBulkEditItems(itemsToEdit);
    setIsBulkEditModalOpen(true);
  }, [selectedIds, stockData]);

  const handleSaveBulkEdit = async (updatedItems: StockReport[]) => {
    if (updatedItems.length === 0) return;

    try {
      let successCount = 0;
      let failCount = 0;

      for (const item of updatedItems) {
        const updates = {
          packing: item.packing,
          rak: item.rak,
          sub_rak: item.sub_rak,
          satuan: item.satuan,
          stok_awal: item.stok_awal,
          status: 'Aktif'
        };
        const { error } = await DatabaseService.updateStockItem(item.id, updates, writeMode);

        if (error) {
          console.error('Error updating item:', error);
          failCount++;
        } else {
          successCount++;
        }
      }

      if (failCount > 0) {
        showToast(`Berhasil update ${successCount} data, Gagal ${failCount} data`, 'warning');
      } else {
        showToast(`Berhasil update ${successCount} data!`, 'success');
      }

      setIsBulkEditModalOpen(false);
      setSelectedIds(new Set());
      setBulkEditItems([]);
      
      // Update cache locally
      const updatedItemsMap = new Map(updatedItems.map(item => [item.id, item]));
      allStockItemsRef.current = allStockItemsRef.current.map(item => 
        updatedItemsMap.has(item.id) 
          ? { ...item, packing: updatedItemsMap.get(item.id)!.packing, rak: updatedItemsMap.get(item.id)!.rak, sub_rak: updatedItemsMap.get(item.id)!.sub_rak, satuan: updatedItemsMap.get(item.id)!.satuan, stok_awal: updatedItemsMap.get(item.id)!.stok_awal }
          : item
      );
      loadStockData(false);
    } catch (error) {
      console.error('Error bulk updating items:', error);
      showToast('Terjadi kesalahan saat mengupdate data massal', 'error');
    }
  };

  const [isAuditing, setIsAuditing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<{
    isRunning: boolean;
    current: number;
    total: number;
    percentage: number;
    message: string;
  }>({
    isRunning: false,
    current: 0,
    total: 0,
    percentage: 0,
    message: ''
  });

  const handleAuditAndFixDataGudang = async () => {
    try {
      setIsAuditing(true);
      setSyncProgress({
        isRunning: true,
        current: 0,
        total: 0,
        percentage: 0,
        message: 'Menganalisis database stok...'
      });
      showToast('Memulai sinkronisasi data packing...', 'info');

      const stockResult = await fetchAllStockItems();
      if (!stockResult.success) {
        throw new Error('Gagal memuat data stock items');
      }

      const allItems = stockResult.data.filter(item => item.status === 'Aktif');
      
      // Group items by normalized product name
      const productGroups = new Map<string, any[]>();
      allItems.forEach(item => {
        const normName = (item.nama_produk || '').trim().toUpperCase();
        if (!productGroups.has(normName)) {
          productGroups.set(normName, []);
        }
        productGroups.get(normName)!.push(item);
      });

      // Find references for packing
      const packingReferenceMap = new Map<string, string>();
      for (const [productName, items] of productGroups) {
        const bestPacking = items
          .map(i => (i.packing || '').trim().toUpperCase())
          .filter(p => p && p !== 'CTN/' && p.length > 4)
          .sort((a, b) => b.length - a.length)[0];
        if (bestPacking) {
          packingReferenceMap.set(productName, bestPacking);
        }
      }

      const itemsToUpdate: { id: string; updates: Partial<StockReport>; reasons: string[] }[] = [];

      allItems.forEach(item => {
        const normName = (item.nama_produk || '').trim().toUpperCase();
        const currentPacking = (item.packing || '').trim().toUpperCase();
        const currentRak = (item.rak || '').trim().toUpperCase();
        const currentSubRak = (item.sub_rak || '').trim().toUpperCase();
        const currentSatuan = (item.satuan || '').trim().toUpperCase();

        const updates: any = {};
        const reasons: string[] = [];

        // 1. Audit & Fix Packing
        const suggestedPacking = packingReferenceMap.get(normName);
        if ((!currentPacking || currentPacking === 'CTN/' || currentPacking === '') && suggestedPacking) {
          updates.packing = suggestedPacking;
          reasons.push('Packing dilengkapi');
        } else if (currentPacking && !currentPacking.startsWith('CTN/')) {
          updates.packing = `CTN/${currentPacking}`;
          reasons.push('Prefix CTN/ ditambahkan');
        }

        // 2. Audit & Fix Sub Rak
        if (!currentSubRak || currentSubRak === '') {
          updates.sub_rak = currentRak || 'UTAMA';
          reasons.push('Sub rak diisi otomatis');
        }

        // 3. Audit & Fix Satuan
        if (!currentSatuan || currentSatuan === '') {
          updates.satuan = 'PCS';
          reasons.push('Satuan diisi PCS');
        }

        // 4. Normalisasi Huruf Besar & Trimming
        if (item.nama_produk !== normName) {
          updates.nama_produk = normName;
        }
        if (item.rak !== currentRak) {
          updates.rak = currentRak;
        }

        if (Object.keys(updates).length > 0) {
          itemsToUpdate.push({
            id: item.id,
            updates,
            reasons
          });
        }
      });

      if (itemsToUpdate.length === 0) {
        setSyncProgress({
          isRunning: true,
          current: allItems.length,
          total: allItems.length,
          percentage: 100,
          message: 'Semua data packing sudah lengkap & terstruktur!'
        });
        showToast('✅ Semua data gudang (Packing, Sub Rak, Satuan) sudah lengkap dan rapi!', 'success');
        setTimeout(() => {
          setSyncProgress(prev => ({ ...prev, isRunning: false }));
        }, 2000);
        return;
      }

      setSyncProgress({
        isRunning: true,
        current: 0,
        total: itemsToUpdate.length,
        percentage: 0,
        message: `Menemukan ${itemsToUpdate.length} data packing yang perlu disinkronkan...`
      });

      showToast(`Ditemukan ${itemsToUpdate.length} data yang perlu diselaraskan. Memproses sinkronisasi data...`, 'info');

      // Update in parallel batches of 20
      const batchSize = 20;
      let successCount = 0;
      let failCount = 0;

      for (let i = 0; i < itemsToUpdate.length; i += batchSize) {
        const batch = itemsToUpdate.slice(i, i + batchSize);
        const promises = batch.map(item =>
          DatabaseService.updateStockItem(item.id, item.updates, writeMode)
        );

        const results = await Promise.all(promises);
        results.forEach(res => {
          if (res.error) {
            failCount++;
          } else {
            successCount++;
          }
        });

        const currentProcessed = Math.min(i + batch.length, itemsToUpdate.length);
        const percent = Math.round((currentProcessed / itemsToUpdate.length) * 100);

        setSyncProgress({
          isRunning: true,
          current: currentProcessed,
          total: itemsToUpdate.length,
          percentage: percent,
          message: `Menyinkronkan data: ${currentProcessed} dari ${itemsToUpdate.length} (${percent}%)`
        });
      }

      setSyncProgress({
        isRunning: true,
        current: itemsToUpdate.length,
        total: itemsToUpdate.length,
        percentage: 100,
        message: `Sinkronisasi selesai! Berhasil memperbarui ${successCount} data!`
      });

      showToast(`🎉 Sinkronisasi selesai! Berhasil memperbarui ${successCount} data packing!${failCount > 0 ? ` (${failCount} gagal)` : ''}`, 'success');
      loadStockData(true);

    } catch (error) {
      console.error('Error during sync packing:', error);
      showToast('Terjadi kesalahan saat melakukan sinkronisasi data', 'error');
    } finally {
      setIsAuditing(false);
      setTimeout(() => {
        setSyncProgress(prev => ({ ...prev, isRunning: false }));
      }, 3000);
    }
  };

  const handleExport = useCallback(async (isOnlySelectedParam?: boolean) => {
    try {
      const isOnlySelected = typeof isOnlySelectedParam === 'boolean'
        ? isOnlySelectedParam
        : (selectedIds.size > 0);

      setExportProgress({
        isExporting: true,
        progress: 10,
        total: 0,
        current: 0,
        stage: 'fetching',
        message: isOnlySelected
          ? `Memuat ${selectedIds.size} data terpilih untuk export...`
          : 'Memuat seluruh data sesuai filter aktif untuk export...'
      });

      let itemsToExport: any[] = [];

      if (isOnlySelected && selectedIds.size > 0) {
        const idArray = Array.from(selectedIds);
        const batchSize = 500;
        for (let i = 0; i < idArray.length; i += batchSize) {
          const chunk = idArray.slice(i, i + batchSize);
          const { data, error } = await supabase
            .from('stock_items')
            .select('*')
            .in('id', chunk);

          if (error) throw error;
          if (data) itemsToExport.push(...data);

          setExportProgress(prev => ({
            ...prev,
            progress: Math.min(40, Math.floor((itemsToExport.length / idArray.length) * 40)),
            current: itemsToExport.length,
            total: idArray.length,
            message: `Memuat data terpilih: ${itemsToExport.length} / ${idArray.length}...`
          }));
        }
      } else {
        // Export all matching active filters across all pages
        let query = supabase
          .from('stock_items')
          .select('*')
          .eq('status', 'Aktif')
          .order(sortConfig.key === 'nama_produk' ? 'nama_produk' : 'created_at', { ascending: sortConfig.direction === 'asc' });

        if (debouncedSearchTerm) {
          query = query.or(`nama_produk.ilike.%${debouncedSearchTerm}%,rak.ilike.%${debouncedSearchTerm}%`);
        }
        if (selectedRack && selectedRack !== 'Semua Rak') {
          query = query.ilike('rak', `%${selectedRack}%`);
        }
        if (showMinusOnly) {
          query = query.lt('tersedia', 0);
        }
        if (showAvailableOnly) {
          query = query.neq('tersedia', 0);
        }
        for (const key in filters) {
          const filterKey = key as FilterableColumn;
          if (!['masuk', 'keluar', 'tersedia'].includes(filterKey)) {
            const selectedValues = filters[filterKey];
            if (selectedValues && selectedValues.size > 0) {
              query = query.in(filterKey, Array.from(selectedValues));
            }
          }
        }

        const totalExpected = paginationInfo.totalCount || 1000;
        let page = 0;
        const pageSize = 1000;
        let hasMore = true;

        while (hasMore) {
          const from = page * pageSize;
          const to = from + pageSize - 1;
          const { data, error } = await query.range(from, to);
          if (error) throw error;

          if (data && data.length > 0) {
            itemsToExport.push(...data);
            setExportProgress(prev => ({
              ...prev,
              progress: Math.min(40, Math.floor((itemsToExport.length / totalExpected) * 40)),
              current: itemsToExport.length,
              total: totalExpected,
              message: `Memuat data filter: ${itemsToExport.length} baris...`
            }));
            if (data.length < pageSize) {
              hasMore = false;
            } else {
              page++;
            }
          } else {
            hasMore = false;
          }
        }
      }

      if (itemsToExport.length === 0) {
        showToast('Tidak ada data yang ditemukan untuk diexport.', 'warning');
        setExportProgress({ isExporting: false, progress: 0, total: 0, current: 0, stage: '', message: '' });
        return;
      }

      // Calculate masuk & keluar from database_log
      setExportProgress({
        isExporting: true,
        progress: 45,
        total: itemsToExport.length,
        current: 0,
        stage: 'calculating',
        message: `Menghitung transaksi log untuk ${itemsToExport.length.toLocaleString()} data...`
      });

      const uniqueSkus = Array.from(new Set(itemsToExport.map(i => i.nama_produk)));
      const logBatchSize = 100;
      let allLogs: any[] = [];

      for (let i = 0; i < uniqueSkus.length; i += logBatchSize) {
        const skuChunk = uniqueSkus.slice(i, i + logBatchSize);
        let logQuery = supabase
          .from('database_log')
          .select('sku, rak, type, jumlah, created_at')
          .in('sku', skuChunk)
          .in('type', ['IN', 'OUT']);

        if (snapshotFilter.enabled) {
          const startDateTime = `${snapshotFilter.startDate}T${snapshotFilter.startTime}`;
          const endDateTime = `${snapshotFilter.endDate}T${snapshotFilter.endTime}`;
          logQuery = logQuery.gte('created_at', startDateTime).lte('created_at', endDateTime);
        }

        const { data: logData, error: logErr } = await logQuery;
        if (!logErr && logData) {
          allLogs.push(...logData);
        }

        const calcProgress = 45 + Math.floor(((i + skuChunk.length) / uniqueSkus.length) * 35);
        setExportProgress(prev => ({
          ...prev,
          progress: Math.min(80, calcProgress),
          current: i + skuChunk.length,
          total: uniqueSkus.length,
          message: `Menghitung kalkulasi stok: ${i + skuChunk.length} / ${uniqueSkus.length} SKU...`
        }));
      }

      // Group logs by SKU|Rak
      const logMap = new Map<string, { masuk: number, keluar: number }>();
      allLogs.forEach(log => {
        const key = `${log.sku}|${log.rak}`;
        if (!logMap.has(key)) logMap.set(key, { masuk: 0, keluar: 0 });
        const current = logMap.get(key)!;
        if (log.type === 'IN') current.masuk += (log.jumlah || 0);
        if (log.type === 'OUT') current.keluar += (log.jumlah || 0);
      });

      // Map calculation to items
      let processedReports = itemsToExport.map(item => {
        const key = `${item.nama_produk}|${item.rak}`;
        const calc = logMap.get(key) || { masuk: 0, keluar: 0 };
        const masuk = calc.masuk;
        const keluar = calc.keluar;
        const tersedia = (item.stok_awal || 0) + masuk - keluar;
        return {
          ...item,
          masuk,
          keluar,
          tersedia
        };
      });

      // Client-side filter for calculated fields if active
      const calculatedCols: FilterableColumn[] = ['masuk', 'keluar', 'tersedia'];
      for (const col of calculatedCols) {
        const selectedValues = filters[col];
        if (selectedValues && selectedValues.size > 0) {
          processedReports = processedReports.filter(item => selectedValues.has(item[col]));
        }
      }

      if (showMinusOnly) {
        processedReports = processedReports.filter(item => item.tersedia < 0);
      }

      if (showAvailableOnly) {
        processedReports = processedReports.filter(item => item.tersedia !== 0);
      }

      setExportProgress({
        isExporting: true,
        progress: 85,
        total: processedReports.length,
        current: processedReports.length,
        stage: 'exporting',
        message: `Membuat file CSV untuk ${processedReports.length.toLocaleString()} data...`
      });

      const headers = ['Nama Produk', 'Packing', 'Rak', 'Sub Rak', 'Satuan', 'Stok Awal', 'Masuk', 'Keluar', 'Tersedia'];
      const csvContent = [
        headers.join(','),
        ...processedReports.map(item => [
          `"${item.nama_produk || ''}"`,
          `"${item.packing || ''}"`,
          `"${item.rak || ''}"`,
          `"${item.sub_rak || ''}"`,
          `"${item.satuan || ''}"`,
          item.stok_awal || 0,
          item.masuk || 0,
          item.keluar || 0,
          item.tersedia || 0
        ].join(','))
      ].join('\n');

      setExportProgress({
        isExporting: true,
        progress: 95,
        total: processedReports.length,
        current: processedReports.length,
        stage: 'downloading',
        message: 'Mengunduh file CSV...'
      });

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      const filePrefix = isOnlySelected ? 'data-gudang-terpilih' : (selectedRack ? `data-gudang-rak-${selectedRack}` : 'data-gudang');
      link.setAttribute('download', `${filePrefix}-${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setExportProgress({
        isExporting: true,
        progress: 100,
        total: processedReports.length,
        current: processedReports.length,
        stage: 'complete',
        message: 'Export selesai!'
      });

      showToast(`Export berhasil! ${processedReports.length.toLocaleString()} data telah diunduh.`, 'success');
      setTimeout(() => {
        setExportProgress({ isExporting: false, progress: 0, total: 0, current: 0, stage: '', message: '' });
      }, 1500);

    } catch (error: any) {
      console.error('Error exporting data:', error);
      showToast(`Terjadi kesalahan saat export data: ${error.message || 'Error'}`, 'error');
      setExportProgress({ isExporting: false, progress: 0, total: 0, current: 0, stage: '', message: '' });
    }
  }, [selectedIds, debouncedSearchTerm, selectedRack, showMinusOnly, showAvailableOnly, filters, sortConfig, snapshotFilter, paginationInfo, showToast]);

  const handleExportAllWithSubtotal = async () => {
    try {
      // DEBUG: Cek status filter
      showToast(`Debug Export: Filter Minus = ${showMinusOnly ? 'AKTIF' : 'NON-AKTIF'}`, 'info');
      console.log('Export All Debug: showMinusOnly =', showMinusOnly);

      setExportProgress({
        isExporting: true,
        progress: 0,
        total: 0,
        current: 0,
        stage: 'syncing',
        message: 'Menjalankan sinkronisasi stok...'
      });

      // STEP 1: Jalankan sinkronisasi stok dulu (HANYA JIKA TIDAK FILTER MINUS)
      // Jika filter minus aktif, kita skip sync untuk performa, karena user hanya ingin lihat data yang ada
      if (!showMinusOnly) {
        const syncResult = await performStockSync((progress) => {
          setExportProgress({
            isExporting: true,
            progress: Math.floor(progress.progress * 0.5), // 0-50% untuk sync
            total: progress.total || 0,
            current: progress.current || 0,
            stage: 'syncing',
            message: progress.message
          });
        });

        if (!syncResult.success) {
          showToast('Gagal melakukan sinkronisasi stok', 'error');
          setExportProgress({ isExporting: false, progress: 0, total: 0, current: 0, stage: '', message: '' });
          return;
        }
      } else {
        // Skip sync message
        setExportProgress({
          isExporting: true,
          progress: 10,
          total: 0,
          current: 0,
          stage: 'syncing',
          message: 'Melewati sinkronisasi (Mode Hanya Minus)...'
        });
        await new Promise(resolve => setTimeout(resolve, 500)); // Sedikit delay untuk UX
      }

      setExportProgress({
        isExporting: true,
        progress: 50,
        total: 0,
        current: 0,
        stage: 'fetching',
        message: snapshotFilter.enabled
          ? `Memuat data untuk Snapshot Mode (${snapshotFilter.startDate} s/d ${snapshotFilter.endDate})...`
          : 'Memuat data yang sudah disinkronkan...'
      });

      // STEP 2: Fetch all stock items
      const stockResult = await fetchAllStockItems();
      if (!stockResult.success) {
        showToast('Gagal memuat data untuk export', 'error');
        setExportProgress({ isExporting: false, progress: 0, total: 0, current: 0, stage: '', message: '' });
        return;
      }

      const allStockItems = stockResult.data;
      const total = allStockItems.length;

      // VARIASI: Jika Mode SO Aktif, kita hitung MANUAL dari log (bukan ambil dari kolom database)
      var itemsWithCalculation;
      if (snapshotFilter.enabled) {
        setExportProgress(prev => ({ ...prev, progress: 55, message: 'Memuat data log untuk perhitungan snapshot...' }));

        // Fetch ALL logs within snapshot range
        const startDateTime = `${snapshotFilter.startDate}T${snapshotFilter.startTime}`;
        const endDateTime = `${snapshotFilter.endDate}T${snapshotFilter.endTime}`;

        const { data: snapshotLogs, error: logError } = await supabase
          .from('database_log')
          .select('sku, rak, type, jumlah')
          .in('type', ['IN', 'OUT'])
          .gte('created_at', startDateTime)
          .lte('created_at', endDateTime);

        if (logError) {
          console.error('Error fetching snapshot logs:', logError);
        }

        const logs = snapshotLogs || [];

        // Group logs by SKU|Rak for O(1)
        const logMap = new Map<string, { masuk: number, keluar: number }>();
        logs.forEach(log => {
          const key = `${log.sku}|${log.rak}`;
          if (!logMap.has(key)) logMap.set(key, { masuk: 0, keluar: 0 });
          const current = logMap.get(key)!;
          if (log.type === 'IN') current.masuk += (log.jumlah || 0);
          if (log.type === 'OUT') current.keluar += (log.jumlah || 0);
        });

        // Apply calculation to all items
        itemsWithCalculation = allStockItems.map(item => {
          const key = `${item.nama_produk}|${item.rak}`;
          const calc = logMap.get(key) || { masuk: 0, keluar: 0 };
          return {
            ...item,
            masuk: calc.masuk,
            keluar: calc.keluar,
            tersedia: (item.stok_awal || 0) + calc.masuk - calc.keluar
          };
        });
      } else {
        // Mode normal: pakai data yang sudah disinkronkan di database
        itemsWithCalculation = allStockItems.map(item => ({
          ...item,
          masuk: item.masuk || 0,
          keluar: item.keluar || 0,
          tersedia: item.tersedia || 0
        }));
      }

      // Filter jika mode "Hanya Minus" aktif
      console.log('Export All Debug: showMinusOnly =', showMinusOnly);
      console.log('Export All Debug: Total items before filter =', itemsWithCalculation.length);

      if (showMinusOnly) {
        itemsWithCalculation = itemsWithCalculation.filter(item => item.tersedia < 0);
        console.log('Export All Debug: Total items after filter =', itemsWithCalculation.length);
      }

      if (showAvailableOnly) {
        itemsWithCalculation = itemsWithCalculation.filter(item => item.tersedia !== 0);
      }

      setExportProgress({
        isExporting: true,
        progress: 70,
        total,
        current: total,
        stage: 'grouping',
        message: `Mengelompokkan ${itemsWithCalculation.length.toLocaleString()} data...`
      });

      // Function to check if rak/sub_rak matches A1-Z1000 pattern
      const isUtamaPattern = (value: string | undefined): boolean => {
        if (!value) return false;
        const upperValue = value.toUpperCase().trim();

        // Already UTAMA
        if (upperValue === 'UTAMA') return true;

        // Pattern: single letter A-Z followed by number 1-1000
        const pattern = /^([A-Z])(\d+)$/;
        const match = upperValue.match(pattern);
        if (match) {
          const number = parseInt(match[2], 10);
          return number >= 1 && number <= 1000;
        }
        return false;
      };

      // Step 1: Convert A1-Z1000 pattern to UTAMA for rak and sub_rak
      const processedData = itemsWithCalculation.map(item => {
        const processedRak = isUtamaPattern(item.rak) ? 'UTAMA' : item.rak;
        const processedSubRak = isUtamaPattern(item.sub_rak) ? 'UTAMA' : (item.sub_rak || '');

        return {
          ...item,
          rak: processedRak,
          sub_rak: processedSubRak
        };
      });

      // Step 2: Separate UTAMA items (both rak and sub_rak must be UTAMA) from others
      const utamaItems: any[] = [];
      const nonUtamaItems: any[] = [];

      processedData.forEach(item => {
        if (item.rak === 'UTAMA' && item.sub_rak === 'UTAMA') {
          utamaItems.push(item);
        } else {
          nonUtamaItems.push(item);
        }
      });

      // Step 3: Group UTAMA items by nama_produk for subtotal
      const productGroups = new Map<string, any[]>();
      utamaItems.forEach(item => {
        if (!productGroups.has(item.nama_produk)) {
          productGroups.set(item.nama_produk, []);
        }
        productGroups.get(item.nama_produk)!.push(item);
      });

      // Step 4: Create subtotaled UTAMA items
      const subtotaledUtamaItems: any[] = [];
      for (const [, items] of productGroups) {
        const firstItem = items[0];
        const subtotal = {
          ...firstItem,
          stok_awal: items.reduce((sum, item) => sum + (item.stok_awal || 0), 0),
          masuk: items.reduce((sum, item) => sum + (item.masuk || 0), 0),
          keluar: items.reduce((sum, item) => sum + (item.keluar || 0), 0),
          tersedia: items.reduce((sum, item) => sum + (item.tersedia || 0), 0)
        };
        subtotaledUtamaItems.push(subtotal);
      }

      // Step 5: Combine subtotaled UTAMA items with non-UTAMA items
      const finalData = [...subtotaledUtamaItems, ...nonUtamaItems];

      setExportProgress({
        isExporting: true,
        progress: 85,
        total,
        current: total,
        stage: 'exporting',
        message: `Membuat file export dengan ${finalData.length.toLocaleString()} baris...`
      });

      // Step 6: Create CSV content
      const headers = ['Nama Produk', 'Packing', 'Rak', 'Sub Rak', 'Satuan', 'Stok Awal', 'Masuk', 'Keluar', 'Tersedia', 'Status'];
      const csvContent = [
        headers.join(','),
        ...finalData.map(item => [
          `"${item.nama_produk}"`,
          `"${item.packing}"`,
          `"${item.rak}"`,
          `"${item.sub_rak || ''}"`,
          `"${item.satuan}"`,
          item.stok_awal || 0,
          item.masuk || 0,
          item.keluar || 0,
          item.tersedia || 0,
          `"${item.status}"`
        ].join(','))
      ].join('\n');

      setExportProgress({
        isExporting: true,
        progress: 95,
        total,
        current: total,
        stage: 'downloading',
        message: 'Menyiapkan file download...'
      });

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `data-gudang-all-${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setExportProgress({
        isExporting: true,
        progress: 100,
        total,
        current: total,
        stage: 'complete',
        message: 'Export selesai!'
      });

      setTimeout(() => {
        setExportProgress({ isExporting: false, progress: 0, total: 0, current: 0, stage: '', message: '' });
        showToast(`Export berhasil! ${finalData.length.toLocaleString()} data (${subtotaledUtamaItems.length} UTAMA + ${nonUtamaItems.length} lainnya)`, 'success');
      }, 1000);

    } catch (error) {
      console.error('Error exporting all data with subtotal:', error);
      showToast('Terjadi kesalahan saat export semua data', 'error');
      setExportProgress({ isExporting: false, progress: 0, total: 0, current: 0, stage: '', message: '' });
    }
  };


  const handleFileSelect = useCallback((file: File) => {
    if (file && (file.type === 'text/csv' || file.name.endsWith('.csv'))) {
      processCSVFile(file);
    } else {
      showToast('Silakan pilih file CSV yang valid', 'error');
    }
  }, []);

  const processCSVFile = async (file: File) => {
    try {
      setImportProgress({ isImporting: true, progress: 0, total: 0, current: 0, message: 'Membaca file CSV...' });

      const text = await file.text();
      const lines = text.split('\n').filter(line => line.trim());

      const dataLines = lines.length > 0 && (lines[0].toLowerCase().includes('nama') || lines[0].toLowerCase().includes('produk')) ? lines.slice(1) : lines;

      const total = dataLines.length;
      setImportProgress(prev => ({ ...prev, total, message: `Memproses ${total} baris data...` }));

      const importData: any[] = [];
      let duplicateCount = 0;

      for (let i = 0; i < dataLines.length; i++) {
        const line = dataLines[i];
        const columns = line.includes(';') ? line.split(';') : line.split(',');
        const [nama_produk, packing = 'CTN/', rak, sub_rak = '', satuan = 'PCS'] = columns.map(c => c.trim().replace(/^"|"$/g, ''));

        if (nama_produk && rak) {
          const { data: existing } = await supabase.from('stock_items').select('id').eq('nama_produk', nama_produk).eq('rak', rak).limit(1);

          if (existing && existing.length > 0) {
            duplicateCount++;
          } else {
            importData.push({ nama_produk, packing, rak, sub_rak, satuan, stok_awal: 0, status: 'Aktif' });
          }
        }

        setImportProgress(prev => ({ ...prev, progress: Math.round(((i + 1) / total) * 100), current: i + 1, message: `Memproses baris ${i + 1} dari ${total}...` }));
      }

      if (importData.length > 0) {
        await supabase.from('stock_items').insert(importData);
      }
      showToast(`Import selesai. ${importData.length} data baru ditambahkan. ${duplicateCount} duplikat diabaikan.`, 'success');

    } catch (error) {
      console.error('Error processing CSV:', error);
      showToast('Terjadi kesalahan saat memproses file CSV', 'error');
    } finally {
      setImportProgress({ isImporting: false, progress: 0, total: 0, current: 0, message: '' });
      setIsImportModalOpen(false);
      loadStockData(true);
    }
  };

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  }, [handleFileSelect]);

  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFileSelect(e.target.files[0]);
    }
  }, [handleFileSelect]);

  const headers_new: { key: FilterableColumn; name: string; className: string; }[] = [
    { key: 'nama_produk', name: 'Nama Produk', className: 'px-4 py-3 text-left text-sm font-medium border-r border-blue-500' },
    { key: 'packing', name: 'Packing', className: 'px-4 py-3 text-center text-sm font-medium border-r border-blue-500' },
    { key: 'rak', name: 'Rak', className: 'px-4 py-3 text-center text-sm font-medium border-r border-blue-500' },
    { key: 'sub_rak', name: 'Sub Rak', className: 'px-4 py-3 text-center text-sm font-medium border-r border-blue-500' },
    { key: 'satuan', name: 'Satuan', className: 'px-4 py-3 text-center text-sm font-medium border-r border-blue-500' },
    { key: 'stok_awal', name: 'Stok Awal', className: 'px-4 py-3 text-center text-sm font-medium border-r border-blue-500' },
    { key: 'masuk', name: 'Masuk', className: 'px-4 py-3 text-center text-sm font-medium border-r border-blue-500' },
    { key: 'keluar', name: 'Keluar', className: 'px-4 py-3 text-center text-sm font-medium border-r border-blue-500' },
    { key: 'tersedia', name: 'Tersedia', className: 'px-4 py-3 text-center text-sm font-medium border-r border-blue-500' }
  ];

  const handleOpenFilter = (key: FilterableColumn) => {
    const iconRef = filterIconRefs.current[key];
    if (iconRef) {
      const rect = iconRef.getBoundingClientRect();
      const popoverWidth = 288;
      let left = rect.left + window.scrollX - (popoverWidth / 2) + (rect.width / 2);
      if (left < 10) left = 10;
      if (left + popoverWidth > window.innerWidth) {
        left = window.innerWidth - popoverWidth - 10;
      }
      setPopoverPosition({ top: rect.bottom + window.scrollY + 5, left });
      setActiveFilterColumn(key);
    }
  };

  const handleApplyFilter = (key: FilterableColumn, selected: FilterValues) => {
    const newFilters = { ...filters };
    if (selected.size > 0) {
      newFilters[key] = selected;
    } else {
      delete newFilters[key];
    }
    setFilters(newFilters);
    // Untuk filter client-side, kita tidak perlu reset halaman. Untuk server-side, ya.
    if (!['masuk', 'keluar', 'tersedia'].includes(key)) {
      setCurrentPage(1);
    }
  };



  return (
    <>
      <Toast
        isOpen={toast.isOpen}
        message={toast.message}
        type={toast.type}
        onClose={() => setToast({ isOpen: false, message: '', type: 'info' })}
      />

      {activeFilterColumn && (
        <FilterPopover
          column={headers_new.find(h => h.key === activeFilterColumn)!}
          position={popoverPosition}
          allOptions={
            ['masuk', 'keluar', 'tersedia'].includes(activeFilterColumn)
              ? currentPageColumnOptions[activeFilterColumn] || []
              : allColumnOptions[activeFilterColumn] || []
          }
          activeFilters={filters}
          onApplyFilter={handleApplyFilter}
          onClose={() => setActiveFilterColumn(null)}
        />
      )}

      {/* Export Progress Modal */}
      <Modal
        isOpen={exportProgress.isExporting}
        onClose={() => { }}
        title="Export Data"
        size="md"
      >
        <div className="space-y-4">
          <div className="text-center">
            <div className="w-16 h-16 bg-teal-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Download className="h-8 w-8 text-teal-600" />
            </div>
            <h4 className="text-lg font-semibold text-gray-800 mb-2">
              {exportProgress.stage === 'complete' ? 'Export Selesai!' : 'Mengekspor Data'}
            </h4>
            <p className="text-sm text-gray-600">
              {exportProgress.message}
            </p>
          </div>

          {/* Progress Bar */}
          <div className="w-full bg-gray-200 rounded-full h-3">
            <div
              className="bg-teal-600 h-3 rounded-full transition-all duration-300 ease-out"
              style={{ width: `${exportProgress.progress}%` }}
            ></div>
          </div>

          <div className="flex justify-between text-sm text-gray-600">
            <span>{exportProgress.current.toLocaleString()} / {exportProgress.total.toLocaleString()}</span>
            <span>{exportProgress.progress}%</span>
          </div>

          {exportProgress.progress === 100 && (
            <div className="flex items-center justify-center space-x-2 text-green-600">
              <CheckCircle className="h-5 w-5" />
              <span className="font-medium">File berhasil diunduh!</span>
            </div>
          )}
        </div>
      </Modal>

      {/* PREMIUM IMMERSIVE HEADER (310px) */}
      <div className="flex flex-col mb-8 lg:mb-12 uppercase">
        <div className="bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 pt-[90px] lg:pt-0 lg:h-[310px] pb-[75px] lg:pb-0 px-6 lg:px-12 rounded-b-[40px] lg:rounded-b-[55px] shadow-2xl shadow-blue-900/40 relative overflow-hidden transition-all duration-500 flex flex-col justify-center">

          {/* Decorative Background Icon */}
          <div className="absolute -top-12 -right-12 text-white opacity-5">
            <Database className="w-72 h-72 lg:w-[480px] lg:h-[480px]" />
          </div>

          {/* Decorative Floating Elements */}
          <div className="absolute top-1/4 left-1/4 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute bottom-10 right-1/3 w-20 h-20 bg-indigo-500/10 rounded-3xl rotate-12 blur-xl"></div>

          {/* Text Content */}
          <div className="relative z-10 w-full flex flex-col lg:flex-row lg:items-end lg:justify-between gap-8 uppercase text-left">
            <div className="max-w-2xl">
              <div className="flex items-center gap-2 mb-3 lg:mb-4 opacity-90">
                <div className="w-10 h-[2px] bg-blue-400 rounded-full"></div>
                <span className="text-[10px] lg:text-[12px] font-black tracking-[0.4em] text-blue-100">Central Inventory Database</span>
              </div>
              <h1 className="text-[34px] lg:text-[58px] font-black text-white tracking-tighter leading-[1] mb-3 uppercase">
                Data <span className="text-blue-400">Gudang</span>
              </h1>
              <div className="text-blue-100/80 font-medium text-[14px] lg:text-[18px] leading-relaxed max-w-[90%] normal-case flex flex-wrap items-center gap-3">
                <div className="px-3 py-1 bg-white/10 rounded-full backdrop-blur-sm border border-white/10 flex items-center gap-2">
                  <span className="relative flex h-2 w-2">
                    <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${snapshotFilter.enabled ? 'bg-amber-400' : 'bg-blue-400'} opacity-75`}></span>
                    <span className={`relative inline-flex rounded-full h-2 w-2 ${snapshotFilter.enabled ? 'bg-amber-500' : 'bg-blue-500'}`}></span>
                  </span>
                  <span className="text-[11px] font-bold tracking-widest uppercase">
                    {snapshotFilter.enabled ? 'SO Mode Active' : 'Real-time Stock'}
                  </span>
                </div>
                <span className="opacity-60 hidden sm:inline">|</span>
                <span className="text-[13px] lg:text-[16px]">
                  {loading || initialLoading ? (
                    <span className="animate-pulse">Menghitung stok real-time...</span>
                  ) : (
                    <span><span className="font-black text-white">{paginationInfo.totalCount.toLocaleString()}</span> Total SKU Aktif Tersimpan</span>
                  )}
                </span>
              </div>
            </div>

            {/* Global Actions Container - Unified */}
            <div className="relative z-10 flex flex-wrap gap-2 lg:gap-3 lg:mb-2 items-center">
              {/* Desktop & Mobile Actions */}
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={refreshData}
                  disabled={loading}
                  className="h-11 px-4 lg:px-5 bg-white/10 hover:bg-white/20 text-white font-black rounded-2xl shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2.5 border border-white/30 backdrop-blur-xl disabled:opacity-50"
                  title="Perbarui Data"
                >
                  <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                  <span className="uppercase text-[10px] lg:text-xs font-black hidden sm:inline">Refresh</span>
                </button>

                <button
                  onClick={handleAuditAndFixDataGudang}
                  disabled={isAuditing || loading}
                  className="h-11 px-4 lg:px-5 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-black rounded-2xl shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2.5 border border-emerald-400/50 backdrop-blur-md disabled:opacity-50"
                  title="Sinkron & Lengkapi Data Packing Otomatis"
                >
                  <Wrench className={`h-4 w-4 ${isAuditing ? 'animate-spin' : ''}`} />
                  <span className="uppercase text-[10px] lg:text-xs font-black">Sinkron Data Packing</span>
                </button>

                {snapshotFilter.enabled ? (
                  <button
                    onClick={handleDisableSnapshot}
                    className="h-11 px-4 lg:px-5 bg-rose-500/80 hover:bg-rose-600 text-white font-black rounded-2xl shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2.5 border border-rose-400/50 backdrop-blur-md"
                  >
                    <X className="h-4 w-4" />
                    <span className="uppercase text-[10px] lg:text-xs font-black">Exit SO Mode</span>
                  </button>
                ) : (
                  <button
                    onClick={() => setShowSnapshotModal(true)}
                    className="h-11 px-4 lg:px-5 bg-amber-500/80 hover:bg-amber-600 text-white font-black rounded-2xl shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2.5 border border-amber-400/50 backdrop-blur-md"
                  >
                    <Calendar className="h-4 w-4" />
                    <span className="uppercase text-[10px] lg:text-xs font-black">Mode SO</span>
                  </button>
                )}

                <button
                  onClick={() => handleActionWithPin(() => setIsImportModalOpen(true))}
                  className="h-11 px-4 lg:px-5 bg-orange-500/80 hover:bg-orange-600 text-white font-black rounded-2xl shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2.5 border border-orange-400/50 backdrop-blur-md"
                >
                  <Upload className="h-4 w-4" />
                  <span className="uppercase text-[10px] lg:text-xs font-black hidden sm:inline">Import</span>
                </button>

                <div className="flex gap-1 bg-white/10 p-1 rounded-[18px] border border-white/10 backdrop-blur-md">
                  <button
                    onClick={() => handleActionWithPin(handleExport)}
                    className="h-9 px-3 lg:px-4 hover:bg-white/10 text-white font-black rounded-[14px] transition-all flex items-center gap-2"
                  >
                    <Download className="h-4 w-4" />
                    <span className="uppercase text-[10px] font-black hidden lg:inline">Export</span>
                  </button>
                  <button
                    onClick={() => handleActionWithPin(handleExportAllWithSubtotal)}
                    disabled={exportProgress.isExporting}
                    className="h-9 px-3 lg:px-4 bg-emerald-500 hover:bg-emerald-600 text-white font-black rounded-[14px] shadow-lg transition-all flex items-center gap-2 border border-emerald-400/50 disabled:opacity-50"
                  >
                    <span className="uppercase text-[10px] font-black">Export All</span>
                  </button>
                </div>

                {/* Edit Terpilih top button removed */}
                
                <button
                  onClick={() => setIsEntriModalOpen(true)}
                  className="h-11 px-5 lg:px-6 bg-blue-500 hover:bg-blue-400 text-white font-black rounded-2xl shadow-[0_8px_25px_rgba(59,130,246,0.35)] transition-all active:scale-95 flex items-center justify-center gap-2.5 border border-blue-400/50"
                >
                  <Plus className="h-4 w-4" />
                  <span className="uppercase text-[10px] lg:text-xs font-black">Entri Data</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-6 lg:px-10 pb-12 -mt-6 lg:-mt-10">

        {/* Floating / Sticky Progress Presentation Banner when Syncing Data Packing */}
        {syncProgress.isRunning && (
          <div className="bg-slate-900 text-white p-5 rounded-3xl border-2 border-emerald-500/50 shadow-2xl shadow-emerald-950/20 mb-6 animate-in fade-in slide-in-from-top-4 duration-300">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-emerald-500/20 text-emerald-400 rounded-2xl border border-emerald-500/30">
                  <RefreshCw className="w-5 h-5 animate-spin" />
                </div>
                <div>
                  <h4 className="text-sm font-black uppercase tracking-wider text-emerald-300 flex items-center gap-2">
                    Proses Sinkronisasi Data Packing
                  </h4>
                  <p className="text-xs text-slate-300 font-medium mt-0.5">{syncProgress.message}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 self-end sm:self-auto">
                <span className="text-2xl font-black text-emerald-400 font-mono tracking-tight">
                  {syncProgress.percentage}%
                </span>
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest bg-slate-800 px-3 py-1 rounded-xl border border-slate-700">
                  {syncProgress.current} / {syncProgress.total} SKU
                </span>
              </div>
            </div>

            {/* Visual Progress Bar */}
            <div className="w-full bg-slate-800/80 rounded-full h-3.5 p-0.5 border border-slate-700/80 overflow-hidden">
              <div
                className="bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-400 h-full rounded-full transition-all duration-300 shadow-[0_0_15px_rgba(16,185,129,0.6)]"
                style={{ width: `${Math.max(syncProgress.percentage, 4)}%` }}
              ></div>
            </div>
          </div>
        )}

        {/* Floating / Sticky Progress Presentation Banner when Exporting Data */}
        {exportProgress.isExporting && (
          <div className="bg-slate-900 text-white p-5 rounded-3xl border-2 border-blue-500/50 shadow-2xl shadow-blue-950/20 mb-6 animate-in fade-in slide-in-from-top-4 duration-300">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-blue-500/20 text-blue-400 rounded-2xl border border-blue-500/30">
                  <Download className="w-5 h-5 animate-bounce" />
                </div>
                <div>
                  <h4 className="text-sm font-black uppercase tracking-wider text-blue-300 flex items-center gap-2">
                    Proses Export Data Berkelanjutan
                  </h4>
                  <p className="text-xs text-slate-300 font-medium mt-0.5">{exportProgress.message}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 self-end sm:self-auto">
                <span className="text-2xl font-black text-blue-400 font-mono tracking-tight">
                  {exportProgress.progress}%
                </span>
                {exportProgress.total > 0 && (
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest bg-slate-800 px-3 py-1 rounded-xl border border-slate-700">
                    {exportProgress.current} / {exportProgress.total}
                  </span>
                )}
              </div>
            </div>

            {/* Visual Progress Bar */}
            <div className="w-full bg-slate-800/80 rounded-full h-3.5 p-0.5 border border-slate-700/80 overflow-hidden">
              <div
                className="bg-gradient-to-r from-blue-500 via-indigo-400 to-cyan-400 h-full rounded-full transition-all duration-300 shadow-[0_0_15px_rgba(59,130,246,0.6)]"
                style={{ width: `${Math.max(exportProgress.progress, 4)}%` }}
              ></div>
            </div>
          </div>
        )}

        {/* Data Summary Dashboard */}
        <div className="hidden lg:grid grid-cols-4 gap-4 mb-4">
          <div className="bg-white rounded-[20px] border-l-4 border-l-blue-500 border-t border-r border-b border-gray-100/80 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] p-4 px-5 flex items-center justify-between relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-r from-blue-50/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            <div className="flex items-center gap-4 relative z-10">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center shadow-lg shadow-blue-500/20">
                <Database className="h-5 w-5" />
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-0.5">Total Database</span>
                <div className="flex items-baseline gap-1.5 mt-1">
                  <span className="text-2xl font-black text-gray-800 leading-none">{paginationInfo.totalCount.toLocaleString()}</span>
                </div>
              </div>
            </div>
            <div className="relative z-10 flex flex-col items-end gap-1">
              <span className="text-[10px] font-semibold text-gray-400">Master SKU</span>
            </div>
          </div>

          <div className="bg-white rounded-[20px] border-l-4 border-l-emerald-500 border-t border-r border-b border-gray-100/80 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] p-4 px-5 flex items-center justify-between relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-r from-emerald-50/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            <div className="flex items-center gap-4 relative z-10">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white flex items-center justify-center shadow-lg shadow-emerald-500/20">
                <LayoutGrid className="h-5 w-5" />
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-0.5">Data Dimuat</span>
                <div className="flex items-baseline gap-1.5 mt-1">
                  <span className="text-2xl font-black text-gray-800 leading-none">{stockData.length}</span>
                </div>
              </div>
            </div>
            <div className="relative z-10 flex flex-col items-end gap-1">
              <span className="text-[10px] font-semibold text-gray-400">SKU Aktif</span>
            </div>
          </div>

          <div className="bg-white rounded-[20px] border-l-4 border-l-amber-500 border-t border-r border-b border-gray-100/80 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] p-4 px-5 flex items-center justify-between relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-r from-amber-50/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            <div className="flex items-center gap-4 relative z-10">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-500 text-white flex items-center justify-center shadow-lg shadow-amber-500/20">
                <FileText className="h-5 w-5" />
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-0.5">Halaman</span>
                <div className="flex items-baseline gap-1.5 mt-1">
                  <span className="text-2xl font-black text-gray-800 leading-none">{paginationInfo.currentPage}</span>
                  <span className="text-xs font-semibold text-gray-400">/ {paginationInfo.totalPages}</span>
                </div>
              </div>
            </div>
            <div className="relative z-10 flex flex-col items-end gap-1">
              <span className="text-[10px] font-semibold text-gray-400">Saat ini</span>
            </div>
          </div>

          <div className="bg-white rounded-[20px] border-l-4 border-l-purple-500 border-t border-r border-b border-gray-100/80 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] p-4 px-5 flex items-center justify-between relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-r from-purple-50/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            <div className="flex items-center gap-4 relative z-10">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-500 to-fuchsia-600 text-white flex items-center justify-center shadow-lg shadow-purple-500/20">
                <List className="h-5 w-5" />
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-0.5">Per Halaman</span>
                <div className="flex items-baseline gap-1.5 mt-1">
                  <span className="text-2xl font-black text-gray-800 leading-none">{itemsPerPage}</span>
                </div>
              </div>
            </div>
            <div className="relative z-10 flex flex-col items-end gap-1">
              <span className="text-[10px] font-semibold text-gray-400">Baris Data</span>
            </div>
          </div>
        </div>

        {/* Unified Search & Table Wrapper */}
        <div className="bg-white shadow-[0_8px_30px_rgba(0,0,0,0.04)] rounded-[20px] border border-blue-100 flex flex-col relative overflow-hidden mb-8">
          
          {/* Search Toolbar */}
          <div className="bg-blue-600 p-4 lg:p-5 relative z-10 flex flex-col gap-4">
            
            {/* Bulk Action Overlay (Appears when items selected) */}
            {selectedIds.size > 0 && (
              <div className="absolute inset-0 bg-blue-700 z-30 px-4 lg:px-6 flex items-center justify-between animate-in fade-in slide-in-from-top-2">
                <div className="flex items-center gap-3">
                  <div className="bg-white text-blue-700 h-8 w-8 rounded-lg flex items-center justify-center font-black shadow-sm">
                    {selectedIds.size}
                  </div>
                  <span className="text-white font-bold tracking-wide text-sm">Data Terpilih</span>
                </div>
                <div className="flex items-center gap-2 lg:gap-3">
                  <button
                    onClick={() => handleActionWithPin(() => handleExport(true))}
                    disabled={exportProgress.isExporting}
                    className="h-9 px-3.5 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-xl shadow-md transition-all active:scale-95 flex items-center gap-1.5 border border-emerald-400 cursor-pointer disabled:opacity-50"
                    title="Export CSV data terpilih lintas halaman"
                  >
                    <Download className="h-4 w-4" />
                    <span className="text-xs lg:text-sm">Export Terpilih ({selectedIds.size})</span>
                  </button>
                  <button
                    onClick={handleCheckBalanceSelected}
                    disabled={isAnalyzingBalance}
                    className="h-9 px-3.5 bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-600 hover:to-emerald-700 text-white font-bold rounded-xl shadow-md transition-all active:scale-95 flex items-center gap-1.5 border border-teal-400 cursor-pointer"
                    title="Analisis dan Perbaiki Saldo Lebih Potong untuk SKU terpilih"
                  >
                    {isAnalyzingBalance ? (
                      <RefreshCw className="h-4 w-4 animate-spin" />
                    ) : (
                      <Scale className="h-4 w-4" />
                    )}
                    <span className="text-xs lg:text-sm">
                      {isAnalyzingBalance ? 'Menganalisis...' : 'Cek Saldo'}
                    </span>
                  </button>
                  <button
                    onClick={handleOpenBulkEdit}
                    className="h-9 px-3.5 bg-white hover:bg-gray-50 text-blue-700 font-bold rounded-xl shadow-md transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer"
                  >
                    <Edit2 className="h-4 w-4" />
                    <span className="text-xs lg:text-sm">Edit</span>
                  </button>
                  <button
                    onClick={handleDeleteBulkClick}
                    className="h-9 px-3.5 bg-rose-500 hover:bg-rose-600 text-white font-bold rounded-xl shadow-lg transition-all active:scale-95 flex items-center gap-1.5 border border-rose-400 cursor-pointer"
                  >
                    <Trash2 className="h-4 w-4" />
                    <span className="text-xs lg:text-sm">Hapus</span>
                  </button>
                  <div className="w-px h-6 bg-blue-400/50 mx-1 lg:mx-2"></div>
                  <button 
                    onClick={() => {
                      const e = { target: { checked: false } } as React.ChangeEvent<HTMLInputElement>;
                      handleSelectAll(e);
                    }} 
                    className="h-9 w-9 flex items-center justify-center hover:bg-white/20 rounded-full transition-colors text-white cursor-pointer"
                    title="Batal Pilih"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>
            )}

            {/* Search Inputs (Grid) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 md:gap-4 items-center">
              
              {/* Search Product */}
              <div className="relative lg:col-span-3">
                <Search className="absolute left-3.5 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full pl-10 pr-10 py-2.5 text-sm text-gray-800 bg-white rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition-all font-medium placeholder-gray-400 shadow-sm"
                  placeholder="Cari nama produk, sku, atau rak..."
                />
                {searchTerm && (
                  <button
                    onClick={clearSearch}
                    className="absolute right-2 top-1/2 transform -translate-y-1/2 p-1.5 hover:bg-gray-100 rounded-full transition-colors text-gray-400 hover:text-gray-600"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              
              {/* Sort Dropdown */}
              <div className="lg:col-span-2">
                <select
                  value={sortConfig.key + '|' + sortConfig.direction}
                  onChange={(e) => {
                    const [key, direction] = e.target.value.split('|');
                    setSortConfig({ key, direction: direction as 'asc' | 'desc' });
                    setCurrentPage(1);
                  }}
                  className="w-full py-2.5 px-3 text-sm text-gray-800 bg-white rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition-all shadow-sm"
                >
                  <option value="created_at|desc">Terbaru Ditambahkan</option>
                  <option value="created_at|asc">Terlama Ditambahkan</option>
                  <option value="nama_produk|asc">Nama Produk (A-Z)</option>
                  <option value="nama_produk|desc">Nama Produk (Z-A)</option>
                </select>
              </div>

              {/* Filters */}
              <div className="grid grid-cols-2 lg:grid-cols-7 gap-3 lg:col-span-7">
                
                {/* Rack Filter */}
                <div ref={rackDropdownRef} className="relative lg:col-span-3 rack-dropdown-container">
                  <div
                    onClick={() => {
                      if (uniqueRacks.length > 0) {
                        setShowRackDropdown(!showRackDropdown);
                        if (!showRackDropdown) {
                          setRackSearchTerm('');
                          setTimeout(() => rackInputRef.current?.focus(), 50);
                        }
                      }
                    }}
                    className={`w-full flex items-center justify-between pl-10 pr-9 py-2.5 text-sm rounded-xl border transition-all cursor-pointer shadow-sm select-none ${
                      selectedRack
                        ? 'bg-blue-50/90 border-blue-300 text-blue-900 font-bold hover:bg-blue-100/70'
                        : 'bg-white border-gray-200 text-gray-700 font-medium hover:border-gray-300 hover:bg-gray-50/50'
                    } ${uniqueRacks.length === 0 ? 'opacity-60 cursor-not-allowed' : ''}`}
                  >
                    <Warehouse className={`absolute left-3.5 top-1/2 transform -translate-y-1/2 h-4 w-4 pointer-events-none transition-colors ${selectedRack ? 'text-blue-600' : 'text-gray-400'}`} />
                    
                    <span className="truncate pr-1">
                      {selectedRack ? selectedRack : 'Semua Rak'}
                    </span>

                    <div className="absolute right-2.5 top-1/2 transform -translate-y-1/2 flex items-center gap-1">
                      {selectedRack && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            clearRackFilter();
                          }}
                          className="p-1 hover:bg-blue-200/70 rounded-full transition-colors text-blue-600 hover:text-blue-800"
                          title="Reset ke Semua Rak"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                      <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${showRackDropdown ? 'rotate-180 text-blue-600' : 'text-gray-400'}`} />
                    </div>
                  </div>

                  {showRackDropdown && (
                    <div
                      className="absolute top-full left-0 right-0 mt-2 bg-white border border-gray-200/90 rounded-2xl shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {/* Search box inside dropdown */}
                      <div className="p-2 border-b border-gray-100 bg-gray-50/90">
                        <div className="relative">
                          <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
                          <input
                            ref={rackInputRef}
                            type="text"
                            value={rackSearchTerm}
                            onChange={(e) => setRackSearchTerm(e.target.value)}
                            className="w-full pl-8 pr-7 py-2 text-xs text-gray-800 bg-white rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent font-medium placeholder-gray-400"
                            placeholder="Cari nama rak..."
                            autoFocus
                          />
                          {rackSearchTerm && (
                            <button
                              type="button"
                              onClick={() => setRackSearchTerm('')}
                              className="absolute right-2 top-1/2 transform -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Options list */}
                      <div className="max-h-60 overflow-y-auto divide-y divide-gray-50">
                        {/* Option: Semua Rak */}
                        <div
                          onClick={() => {
                            clearRackFilter();
                          }}
                          className={`px-3.5 py-2.5 text-sm cursor-pointer flex items-center justify-between transition-colors ${
                            !selectedRack
                              ? 'bg-blue-50 text-blue-700 font-bold'
                              : 'text-gray-700 hover:bg-gray-50'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <Warehouse className="h-4 w-4 text-blue-500" />
                            <span>Semua Rak</span>
                          </div>
                          {!selectedRack && <Check className="h-4 w-4 text-blue-600" />}
                        </div>

                        {/* List of filtered unique racks */}
                        {filteredRacks.map((rack) => {
                          const isSelected = selectedRack === rack;
                          return (
                            <div
                              key={rack}
                              onClick={() => handleRackSelect(rack)}
                              className={`px-3.5 py-2.5 text-sm cursor-pointer flex items-center justify-between transition-colors ${
                                isSelected
                                  ? 'bg-blue-600 text-white font-bold'
                                  : 'text-gray-700 hover:bg-blue-50 hover:text-blue-700'
                              }`}
                            >
                              <span className="truncate">{rack}</span>
                              {isSelected && <Check className="h-4 w-4 text-white" />}
                            </div>
                          );
                        })}

                        {filteredRacks.length === 0 && (
                          <div className="px-4 py-4 text-xs text-gray-400 text-center font-medium">
                            Tidak ada rak yang cocok
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Items per page */}
                <div className="lg:col-span-2 relative">
                  <select
                    value={itemsPerPage}
                    onChange={(e) => handleItemsPerPageChange(Number(e.target.value))}
                    className="w-full px-3 py-2.5 text-sm text-gray-800 bg-white rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition-all font-bold appearance-none text-center cursor-pointer shadow-sm"
                  >
                    <option value={20}>20 / Hal</option>
                    <option value={50}>50 / Hal</option>
                    <option value={100}>100 / Hal</option>
                    <option value={200}>200 / Hal</option>
                  </select>
                  <div className="absolute right-3 top-1/2 transform -translate-y-1/2 pointer-events-none text-gray-400">
                    <ChevronRight className="h-3 w-3 rotate-90" />
                  </div>
                </div>

                {/* Hanya Minus */}
                <div className={`lg:col-span-2 flex items-center justify-center rounded-xl border transition-all cursor-pointer active:scale-95 py-2.5 shadow-sm ${showMinusOnly ? 'bg-rose-500 border-rose-400 text-white' : 'bg-white border-gray-200 hover:bg-gray-50 text-gray-700'}`} onClick={() => {
                  setShowMinusOnly(!showMinusOnly);
                  setCurrentPage(1);
                }}>
                  <span className="text-xs font-bold tracking-wide">{showMinusOnly ? 'Minus Saja' : 'Semua Stok'}</span>
                </div>
              </div>
            </div>

            {/* Bottom row of Toolbar: Item Count & Mode SO */}
            <div className="flex items-center justify-between pt-3 mt-1 border-t border-blue-500/30 flex-wrap gap-2">
              <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-blue-100 flex-wrap">
                <div className="h-1.5 w-1.5 bg-blue-300 rounded-full animate-pulse shadow-[0_0_8px_rgba(147,197,253,0.8)]"></div>
                <span>Total {paginationInfo.totalCount.toLocaleString()} SKU Aktif</span>
                {showAvailableOnly && (
                  <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 text-[10px] normal-case font-semibold">
                    Filter: Ada Stok (Qty ≠ 0)
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {/* Tombol Reset Semua Filter (Di samping kiri Ada Stok Saja) */}
                <button
                  type="button"
                  onClick={handleResetAllFilters}
                  disabled={!hasActiveFilters}
                  className={`h-9 px-3.5 rounded-xl flex items-center justify-center gap-1.5 text-xs font-bold transition-all shadow-sm select-none ${
                    hasActiveFilters
                      ? 'bg-rose-500 hover:bg-rose-600 text-white active:scale-95 cursor-pointer'
                      : 'bg-slate-900/40 text-slate-300/60 cursor-not-allowed opacity-75'
                  }`}
                  title={hasActiveFilters ? 'Reset semua filter yang aktif (pencarian, rak, status stok, filter kolom)' : 'Tidak ada filter yang sedang aktif'}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>Reset Filter</span>
                </button>

                {/* Tombol Khusus Samping Kiri Mode SO */}
                <button
                  type="button"
                  onClick={handleToggleAvailableOnly}
                  disabled={!isRakFiltered}
                  className={`h-9 px-3.5 rounded-xl flex items-center justify-center gap-2 text-xs font-bold transition-all shadow-sm select-none ${
                    !isRakFiltered
                      ? 'bg-slate-900/40 text-slate-300/70 cursor-not-allowed opacity-75'
                      : showAvailableOnly
                      ? 'bg-emerald-500 hover:bg-emerald-600 text-white font-bold active:scale-95 cursor-pointer'
                      : 'bg-white hover:bg-slate-100 text-blue-900 font-bold active:scale-95 cursor-pointer'
                  }`}
                  title={
                    !isRakFiltered
                      ? 'Pilih filter rak terlebih dahulu untuk mengaktifkan filter ini'
                      : showAvailableOnly
                      ? 'Filter aktif: Menampilkan hanya produk dengan stok tersedia (Qty ≠ 0). Klik untuk reset.'
                      : `Klik untuk hanya menampilkan produk dengan stok tersedia (Qty ≠ 0) di rak ${selectedRack}`
                  }
                >
                  {showAvailableOnly ? (
                    <PackageCheck className="h-4 w-4 text-white" />
                  ) : !isRakFiltered ? (
                    <Lock className="h-3.5 w-3.5 text-amber-400" />
                  ) : (
                    <PackageCheck className="h-4 w-4 text-emerald-600" />
                  )}
                  <span>{showAvailableOnly ? 'Ada Stok Saja' : 'Hanya Ada Stok'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowSnapshotModal(true)}
                  className={`h-9 px-4 rounded-xl flex items-center justify-center gap-2 text-xs font-bold transition-all active:scale-95 shadow-sm select-none ${
                    snapshotFilter.enabled
                      ? 'bg-amber-400 hover:bg-amber-500 text-amber-950 font-bold animate-pulse'
                      : 'bg-white/20 hover:bg-white/30 text-white font-bold'
                  }`}
                  title="Filter data stok berdasarkan rentang tanggal/jam (Mode Stock Opname)"
                >
                  <Calendar className="h-3.5 w-3.5" />
                  <span>Mode SO</span>
                </button>
              </div>
            </div>
          </div>

        {/* Snapshot Filter Modal (SO Mode) */}
        <Modal
          isOpen={showSnapshotModal}
          onClose={() => setShowSnapshotModal(false)}
          title="Mode Stock Opname (SO) - Filter Berdasarkan Waktu"
          size="lg"
        >
          <div className="space-y-6">
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <div className="flex items-center space-x-2 mb-2">
                <Calendar className="h-5 w-5 text-yellow-600" />
                <h4 className="font-semibold text-yellow-800">Mode Stock Opname</h4>
              </div>
              <p className="text-sm text-yellow-700">
                Fitur ini memungkinkan Anda melihat snapshot data gudang pada rentang waktu tertentu berdasarkan log historis dari tabel <code className="bg-yellow-100 px-1 rounded">database_log</code>. Sangat berguna untuk melakukan Stock Opname (SO) sebagian barang tanpa harus mengecek semua SKU.
              </p>
            </div>

            {/* Quick Presets */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">Preset Cepat:</label>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  onClick={() => handleSetQuickSnapshot('yesterday_15')}
                  className="h-9 px-3 bg-blue-100/50 hover:bg-blue-200/70 text-blue-800 font-bold rounded-xl border border-blue-200 backdrop-blur-sm transition-all text-xs uppercase tracking-tight"
                >
                  Kemarin Jam 15:00
                </Button>
                <Button
                  onClick={() => handleSetQuickSnapshot('yesterday_full')}
                  className="h-9 px-3 bg-emerald-100/50 hover:bg-emerald-200/70 text-emerald-800 font-bold rounded-xl border border-emerald-200 backdrop-blur-sm transition-all text-xs uppercase tracking-tight"
                >
                  Kemarin Seharian
                </Button>
                <Button
                  onClick={() => handleSetQuickSnapshot('today_morning')}
                  className="h-9 px-3 bg-purple-100/50 hover:bg-purple-200/70 text-purple-800 font-bold rounded-xl border border-purple-200 backdrop-blur-sm transition-all text-xs uppercase tracking-tight"
                >
                  Hari Ini Pagi (00:00-08:00)
                </Button>
                <Button
                  onClick={() => handleSetQuickSnapshot('one_year')}
                  className="h-9 px-3 bg-orange-100/50 hover:bg-orange-200/70 text-orange-800 font-bold rounded-xl border border-orange-200 backdrop-blur-sm transition-all text-xs uppercase tracking-tight"
                >
                  Rentang 1 Tahun (01/01/2025 06:00)
                </Button>
              </div>
            </div>

            {/* Custom Date Time Range */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">Tanggal Mulai:</label>
                <input
                  type="date"
                  value={snapshotFilter.startDate}
                  onChange={(e) => setSnapshotFilter(prev => ({ ...prev, startDate: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">Waktu Mulai:</label>
                <input
                  type="time"
                  step="1"
                  value={snapshotFilter.startTime}
                  onChange={(e) => setSnapshotFilter(prev => ({ ...prev, startTime: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  style={{
                    WebkitAppearance: 'textfield',
                    MozAppearance: 'textfield',
                    display: 'flex',
                    alignItems: 'center'
                  }}
                />
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">Tanggal Akhir:</label>
                <input
                  type="date"
                  value={snapshotFilter.endDate}
                  onChange={(e) => setSnapshotFilter(prev => ({ ...prev, endDate: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">Waktu Akhir:</label>
                <input
                  type="time"
                  step="1"
                  value={snapshotFilter.endTime}
                  onChange={(e) => setSnapshotFilter(prev => ({ ...prev, endTime: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  style={{
                    WebkitAppearance: 'textfield',
                    MozAppearance: 'textfield',
                    display: 'flex',
                    alignItems: 'center'
                  }}
                />
              </div>
            </div>

            {/* Preview */}
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
              <p className="text-sm text-gray-600">
                <span className="font-medium">Snapshot akan menampilkan:</span> Data stok dari log yang tercatat antara <span className="text-blue-600 font-semibold">{snapshotFilter.startDate} {snapshotFilter.startTime}</span> sampai <span className="text-blue-600 font-semibold">{snapshotFilter.endDate} {snapshotFilter.endTime}</span>
              </p>
            </div>

            {/* Actions */}
            <div className="flex justify-end space-x-3 pt-4 border-t">
              <Button
                onClick={() => setShowSnapshotModal(false)}
                className="h-10 px-6 bg-white/10 hover:bg-white/20 text-slate-600 font-bold rounded-xl shadow-sm transition-all border border-slate-200 backdrop-blur-xl"
              >
                Batal
              </Button>
              <Button
                onClick={handleApplySnapshot}
                className="h-10 px-6 bg-gradient-to-br from-amber-400 to-orange-600 hover:from-amber-500 hover:to-orange-700 text-white font-bold rounded-xl shadow-[0_4px_12px_rgba(245,158,11,0.3)] hover:shadow-orange-500/40 transition-all duration-300 transform hover:scale-105 active:scale-95 flex items-center justify-center gap-2 border border-white/20 backdrop-blur-md"
              >
                <Plus className="h-5 w-5" />
                <span className="tracking-wide uppercase text-sm">Terapkan Mode SO</span>
              </Button>
            </div>
          </div>
        </Modal>

        {/* Import Modal */}
        <Modal
          isOpen={isImportModalOpen}
          onClose={() => setIsImportModalOpen(false)}
          title="Import Data Gudang dari CSV"
          size="lg"
        >
          <div className="space-y-6">
            {!importProgress.isImporting ? (
              <>
                {/* Format Instructions */}
                <div className="bg-white p-6 rounded-[2.5rem] border-2 border-blue-50 shadow-sm text-left">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="h-2 w-2 bg-blue-500 rounded-full animate-pulse"></div>
                    <h4 className="font-black text-xs uppercase tracking-widest text-blue-900">Panduan Kolom (CSV)</h4>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                    <div className="p-3 bg-gray-50 rounded-xl border border-gray-100 text-center">
                      <p className="text-[8px] font-black text-blue-600 uppercase">Kolom A</p>
                      <p className="text-[10px] font-bold text-gray-700 truncate">Nama Produk</p>
                    </div>
                    <div className="p-3 bg-gray-50 rounded-xl border border-gray-100 text-center">
                      <p className="text-[8px] font-black text-blue-600 uppercase">Kolom B</p>
                      <p className="text-[10px] font-bold text-gray-700 truncate">Packing</p>
                    </div>
                    <div className="p-3 bg-gray-50 rounded-xl border border-gray-100 text-center">
                      <p className="text-[8px] font-black text-blue-600 uppercase">Kolom C</p>
                      <p className="text-[10px] font-bold text-gray-700 truncate">Rak</p>
                    </div>
                    <div className="p-3 bg-gray-50 rounded-xl border border-gray-100 text-center">
                      <p className="text-[8px] font-black text-blue-600 uppercase">Kolom D</p>
                      <p className="text-[10px] font-bold text-gray-700 truncate">Sub Rak</p>
                    </div>
                    <div className="p-3 bg-gray-50 rounded-xl border border-gray-100 text-center">
                      <p className="text-[8px] font-black text-blue-600 uppercase">Kolom E</p>
                      <p className="text-[10px] font-bold text-gray-700 truncate">Satuan</p>
                    </div>
                  </div>
                  <p className="mt-4 text-[9px] font-medium text-blue-500/70 italic text-center">* Baris pertama diabaikan (Header). Stok awal otomatis 0.</p>
                </div>

                {/* Drag & Drop Area */}
                <div
                  className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${dragActive
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'
                    }`}
                  onDragEnter={handleDrag}
                  onDragLeave={handleDrag}
                  onDragOver={handleDrag}
                  onDrop={handleDrop}
                >
                  <Upload className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-lg font-medium text-gray-700 mb-2">
                    Drag & Drop file CSV di sini
                  </p>
                  <p className="text-sm text-gray-500 mb-4">
                    atau klik tombol di bawah untuk memilih file
                  </p>
                  <input
                    type="file"
                    accept=".csv"
                    onChange={handleFileInputChange}
                    className="hidden"
                    id="csv-file-input"
                  />
                  <div className="flex justify-center gap-3">
                    <Button
                      type="button"
                      onClick={() => document.getElementById('csv-file-input')?.click()}
                      className="h-11 px-6 bg-gradient-to-br from-blue-500 to-blue-700 hover:from-blue-600 hover:to-blue-800 text-white font-bold rounded-xl shadow-[0_4px_15px_rgba(37,99,235,0.4)] hover:shadow-blue-500/50 transition-all duration-300 transform hover:scale-105 active:scale-95 flex items-center justify-center gap-2 border border-white/20 backdrop-blur-md"
                    >
                      <Upload className="h-5 w-5" />
                      <span className="tracking-wide uppercase text-sm">Pilih File CSV</span>
                    </Button>
                    <Button
                      type="button"
                      onClick={() => {
                        const csvContent = "NAMA_PRODUK,PACKING,RAK,SUB_RAK,SATUAN\nPRODUK CONTOH A,CTN/,UTAMA,,PCS\nPRODUK CONTOH B,,LANTAI 4,SUB-A,BOX";
                        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                        const url = URL.createObjectURL(blob);
                        const link = document.createElement("a");
                        link.setAttribute("href", url);
                        link.setAttribute("download", "Template_Data_Gudang.csv");
                        document.body.appendChild(link);
                        link.click();
                        document.body.removeChild(link);
                      }}
                      className="h-11 px-6 bg-white hover:bg-blue-50 text-blue-700 font-black rounded-xl shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2 border-2 border-blue-100"
                    >
                      <Download className="h-5 w-5" />
                      <span className="tracking-wide uppercase text-sm">Unduh Template</span>
                    </Button>
                  </div>
                </div>
              </>
            ) : (
              /* Import Progress */
              <div className="space-y-4">
                <div className="text-center">
                  <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Upload className="h-8 w-8 text-blue-600" />
                  </div>
                  <h4 className="text-lg font-semibold text-gray-800 mb-2">
                    Mengimpor Data Gudang
                  </h4>
                  <p className="text-sm text-gray-600">
                    {importProgress.message}
                  </p>
                </div>

                {/* Progress Bar */}
                <div className="w-full bg-gray-200 rounded-full h-3">
                  <div
                    className="bg-blue-600 h-3 rounded-full transition-all duration-300 ease-out"
                    style={{ width: `${importProgress.progress}%` }}
                  ></div>
                </div>

                <div className="flex justify-between text-sm text-gray-600">
                  <span>{importProgress.current} / {importProgress.total}</span>
                  <span>{importProgress.progress}%</span>
                </div>

                {importProgress.progress === 100 && (
                  <div className="flex items-center justify-center space-x-2 text-green-600">
                    <CheckCircle className="h-5 w-5" />
                    <span className="font-medium">Import berhasil!</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </Modal>

        {/* Table Content */}
        <div className="relative z-0">
            {loading && stockData.length === 0 && (
              <div className="absolute inset-0 bg-white/50 backdrop-blur-sm z-20 flex items-center justify-center">
                <div className="bg-white p-6 rounded-2xl shadow-xl flex items-center gap-4">
                  <div className="animate-spin rounded-full h-8 w-8 border-4 border-blue-100 border-t-blue-600"></div>
                  <div className="text-blue-800 font-bold tracking-wide">Memuat data...</div>
                </div>
              </div>
            )}
            
            {/* Background Sync Indicator */}
            {loading && stockData.length > 0 && (
              <div className="absolute top-2 right-2 bg-blue-600 text-white text-[10px] px-3 py-1 rounded-full shadow-md z-30 flex items-center gap-2 animate-pulse">
                <RefreshCw className="h-3 w-3 animate-spin" />
                Sinkronisasi latar belakang...
              </div>
            )}

            {/* Banner Pemilihan Berkelanjutan (Multi-Page Selection Helper Banner) */}
            {selectedIds.size > 0 && (
              <div className="bg-gradient-to-r from-blue-50 via-indigo-50 to-blue-50 border-b border-blue-200 px-4 lg:px-6 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs text-blue-900 font-medium animate-in fade-in duration-200">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center justify-center bg-blue-600 text-white font-black text-[11px] px-2.5 py-0.5 rounded-lg shadow-sm">
                    {selectedIds.size}
                  </span>
                  <span>
                    {selectedIds.size >= paginationInfo.totalCount && paginationInfo.totalCount > 0 ? (
                      <span>
                        Semua <strong>{selectedIds.size.toLocaleString()}</strong> data di semua halaman telah dipilih (sesuai filter aktif).
                      </span>
                    ) : (
                      <span>
                        <strong>{currentPageSelectedCount}</strong> data di halaman ini terpilih (Total <strong>{selectedIds.size.toLocaleString()}</strong> terpilih lintas halaman).
                      </span>
                    )}
                  </span>
                </div>
                <div className="flex items-center gap-4">
                  {selectedIds.size < paginationInfo.totalCount && (
                    <button
                      type="button"
                      disabled={isSelectingAllPages}
                      onClick={handleSelectAllAcrossPages}
                      className="font-black text-blue-700 hover:text-blue-900 underline underline-offset-4 flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer"
                    >
                      {isSelectingAllPages ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Mengambil {paginationInfo.totalCount.toLocaleString()} data...</span>
                        </>
                      ) : (
                        <span>
                          Pilih semua {paginationInfo.totalCount.toLocaleString()} data di semua halaman (sesuai filter aktif)
                        </span>
                      )}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setSelectedIds(new Set())}
                    className="font-bold text-rose-600 hover:text-rose-800 underline underline-offset-4 transition-colors cursor-pointer"
                  >
                    Batalkan pilihan
                  </button>
                </div>
              </div>
            )}

            <div className="overflow-x-auto min-h-[400px]">
              <table className="w-full">
                <thead className="bg-blue-50/80 backdrop-blur-md border-b border-blue-100 text-blue-900 sticky top-0 z-10">
                  <tr>
                    <th className="px-4 py-3.5 text-center w-12">
                      <input 
                        type="checkbox" 
                        onChange={handleSelectAll} 
                        checked={isCurrentPageAllSelected}
                        ref={(el) => {
                          if (el) {
                            el.indeterminate = isCurrentPageSomeSelected;
                          }
                        }}
                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer shadow-sm"
                        title="Pilih Semua di Halaman Ini"
                      />
                    </th>
                    {headers_new.map((header) => {
                      const isFiltered = filters[header.key] && filters[header.key]!.size > 0;
                      return (
                        <th key={header.key} className={`${header.className} text-[10px] font-black uppercase tracking-widest px-4 py-3.5`}>
                          <div className="flex items-center justify-between gap-2">
                            <span className='truncate'>{header.name}</span>
                            <button 
                              ref={el => filterIconRefs.current[header.key] = el} 
                              onClick={(e) => { 
                                e.stopPropagation(); 
                                activeFilterColumn === header.key ? setActiveFilterColumn(null) : handleOpenFilter(header.key) 
                              }}
                              className="p-1 rounded-md hover:bg-blue-100 transition-colors"
                            >
                              <Filter className={`h-3.5 w-3.5 transition-colors ${isFiltered ? 'text-amber-500' : 'text-blue-400'}`} />
                            </button>
                          </div>
                        </th>
                      )
                    })}
                    <th className="px-4 py-3.5 text-center text-[10px] font-black uppercase tracking-widest w-24">Aksi</th>
                  </tr>
                </thead>
                <tbody className="text-sm">
                  {stockData.map((item, index) => (
                    <tr key={item.id} className="bg-white hover:bg-blue-50/60 border-b border-gray-100 transition-colors group">
                      <td className="px-4 py-3 text-center border-r border-gray-50">
                        <input 
                          type="checkbox"
                          checked={selectedIds.has(item.id)}
                          onChange={() => handleSelectRow(item.id)}
                          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer transition-transform group-hover:scale-110"
                        />
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-800 border-r border-gray-50">{item.nama_produk}</td>
                      <td className="px-4 py-3 text-center border-r border-gray-50">
                        <span className="text-rose-600 font-bold bg-rose-50 px-2 py-1 rounded-md text-xs border border-rose-100">
                          {item.packing && !item.packing.toUpperCase().startsWith('CTN/') ? `CTN/${item.packing}` : item.packing}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center border-r border-gray-50 font-medium text-gray-600">{item.rak}</td>
                      <td className="px-4 py-3 text-center border-r border-gray-50 text-gray-500">{item.sub_rak || '-'}</td>
                      <td className="px-4 py-3 text-center border-r border-gray-50">
                        <span className="bg-gray-100 text-gray-600 text-xs font-bold px-2 py-1 rounded-md">{item.satuan}</span>
                      </td>
                      <td className="px-4 py-3 text-center border-r border-gray-50">
                        <span className="text-gray-400 font-medium">{item.stok_awal}</span>
                      </td>
                      <td className="px-4 py-3 text-center border-r border-gray-50">
                        <span className={item.masuk > 0 ? 'text-emerald-600 font-bold bg-emerald-50 px-2 py-1 rounded-md' : 'text-gray-300'}>
                          {item.masuk || 0}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center border-r border-gray-50">
                        <span className={item.keluar > 0 ? 'text-rose-600 font-bold bg-rose-50 px-2 py-1 rounded-md' : 'text-gray-300'}>
                          {item.keluar || 0}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center border-r border-gray-50">
                        <div className={`inline-flex items-center justify-center min-w-[3rem] px-2.5 py-1 rounded-lg font-black text-white shadow-sm ${item.tersedia < 0 ? 'bg-gradient-to-r from-rose-500 to-red-600 shadow-rose-500/30' : item.tersedia === 0 ? 'bg-gradient-to-r from-gray-400 to-gray-500' : 'bg-gradient-to-r from-blue-500 to-indigo-600 shadow-blue-500/30'}`}>
                          {item.tersedia}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex justify-center space-x-2 opacity-60 group-hover:opacity-100 transition-opacity">
                          <Button
                            onClick={() => handleEdit(item)}
                            className="h-8 w-8 p-0 bg-blue-50 hover:bg-blue-600 text-blue-600 hover:text-white font-bold rounded-lg transition-all flex items-center justify-center border border-blue-100 hover:border-transparent hover:shadow-[0_4px_10px_rgba(37,99,235,0.3)] hover:scale-110 active:scale-95"
                            title="Edit Data"
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button
                            onClick={() => handleDeleteClick(item)}
                            className="h-8 w-8 p-0 bg-rose-50 hover:bg-rose-600 text-rose-600 hover:text-white font-bold rounded-lg transition-all flex items-center justify-center border border-rose-100 hover:border-transparent hover:shadow-[0_4px_10px_rgba(225,29,72,0.3)] hover:scale-110 active:scale-95"
                            title="Hapus Data"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {stockData.length === 0 && !loading && (
                    <tr>
                      <td colSpan={11} className="px-4 py-16 text-center">
                        <div className="flex flex-col items-center justify-center text-gray-400">
                          <Database className="h-12 w-12 mb-3 opacity-20" />
                          <p className="font-medium text-gray-500 text-lg">{searchTerm || selectedRack || Object.keys(filters).length > 0 ? 'Tidak ada data yang sesuai dengan filter' : 'Belum ada data stok'}</p>
                          <p className="text-sm mt-1">Coba sesuaikan filter pencarian atau tambahkan data baru.</p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
        </div>
        </div>

        {/* Pagination */}
        {paginationInfo.totalPages > 1 && (
          <div className="flex items-center justify-between bg-gray-50 p-4 rounded-lg">
            <div className="flex items-center space-x-4">
              <p className="text-sm text-gray-700">
                Menampilkan {((currentPage - 1) * itemsPerPage) + 1} sampai {Math.min(currentPage * itemsPerPage, paginationInfo.totalCount)} dari {paginationInfo.totalCount.toLocaleString()} data
              </p>
              <div className="flex items-center space-x-2">
                <span className="text-sm text-gray-600">Per halaman:</span>
                <select
                  value={itemsPerPage}
                  onChange={(e) => handleItemsPerPageChange(Number(e.target.value))}
                  className="px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                  <option value={200}>200</option>
                </select>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Button
                onClick={() => handlePageChange(1)}
                disabled={currentPage === 1}
                className="h-9 px-3 bg-white/10 hover:bg-white/20 text-slate-700 font-bold rounded-xl shadow-[0_2px_8px_rgba(0,0,0,0.05)] transition-all duration-300 transform hover:scale-105 active:scale-95 flex items-center justify-center border border-slate-200 backdrop-blur-xl disabled:opacity-30 disabled:scale-100"
                title="Halaman Pertama"
              >
                ««
              </Button>
              <Button
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={!paginationInfo.hasPrevPage}
                className="h-9 px-3 bg-white/10 hover:bg-white/20 text-slate-700 font-bold rounded-xl shadow-[0_2px_8px_rgba(0,0,0,0.05)] transition-all duration-300 transform hover:scale-105 active:scale-95 flex items-center justify-center border border-slate-200 backdrop-blur-xl disabled:opacity-30 disabled:scale-100"
                title="Halaman Sebelumnya"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm font-bold px-4 py-2 bg-white/50 rounded-xl border border-slate-200 backdrop-blur-sm min-w-[80px] text-center shadow-inner">
                {currentPage.toLocaleString()} / {paginationInfo.totalPages.toLocaleString()}
              </span>
              <Button
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={!paginationInfo.hasNextPage}
                className="h-9 px-3 bg-white/10 hover:bg-white/20 text-slate-700 font-bold rounded-xl shadow-[0_2px_8px_rgba(0,0,0,0.05)] transition-all duration-300 transform hover:scale-105 active:scale-95 flex items-center justify-center border border-slate-200 backdrop-blur-xl disabled:opacity-30 disabled:scale-100"
                title="Halaman Berikutnya"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button
                onClick={() => handlePageChange(paginationInfo.totalPages)}
                disabled={currentPage === paginationInfo.totalPages}
                className="h-9 px-3 bg-white/10 hover:bg-white/20 text-slate-700 font-bold rounded-xl shadow-[0_2px_8px_rgba(0,0,0,0.05)] transition-all duration-300 transform hover:scale-105 active:scale-95 flex items-center justify-center border border-slate-200 backdrop-blur-xl disabled:opacity-30 disabled:scale-100"
                title="Halaman Terakhir"
              >
                »»
              </Button>
            </div>
          </div>
        )}

        {/* Performance Info */}
        <div className="bg-gray-50 p-3 rounded text-sm text-gray-600">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <span className="font-medium">Mode:</span>
              <span className="ml-1 text-green-600">Optimized Pagination</span>
            </div>
            <div>
              <span className="font-medium">Cache:</span>
              <span className="ml-1 text-blue-600">{logCache.size} entries</span>
            </div>
            <div>
              <span className="font-medium">Halaman:</span> {currentPage} / {paginationInfo.totalPages}
            </div>
            <div>
              <span className="font-medium">Total:</span> {paginationInfo.totalCount.toLocaleString()} items
            </div>
          </div>
        </div>

        {/* Entry Data Modal */}
        <EntriDataModal
          isOpen={isEntriModalOpen}
          onClose={() => setIsEntriModalOpen(false)}
          onSave={handleSaveNewItems}
        />

        {/* Edit Modal */}
        {editingItem && (
          <EntriDataModal
            isOpen={isEditModalOpen}
            onClose={() => {
              setIsEditModalOpen(false);
              setEditingItem(null);
            }}
            onSave={handleUpdateItem}
            editData={editingItem}
          />
        )}

        {/* Bulk Edit Modal */}
        {bulkEditItems.length > 0 && (
          <EntriDataModal
            isOpen={isBulkEditModalOpen}
            onClose={() => {
              setIsBulkEditModalOpen(false);
              setBulkEditItems([]);
            }}
            onSave={handleSaveBulkEdit}
            editDataArray={bulkEditItems}
          />
        )}

        {/* Delete Confirmation */}
        <ConfirmDialog
          isOpen={deleteConfirm.isOpen}
          onClose={() => setDeleteConfirm({ isOpen: false, itemId: '', itemName: '' })}
          onConfirm={confirmDelete}
          title="Konfirmasi Hapus"
          message={`Apakah Anda yakin ingin menghapus data "${deleteConfirm.itemName}"? Tindakan ini tidak dapat dibatalkan.`}
        />

        {/* Bulk Delete Confirmation */}
        <ConfirmDialog
          isOpen={bulkDeleteConfirm.isOpen}
          onClose={() => setBulkDeleteConfirm({ isOpen: false, count: 0 })}
          onConfirm={confirmBulkDelete}
          title="Konfirmasi Hapus Massal"
          message={`Apakah Anda yakin ingin menghapus ${bulkDeleteConfirm.count} data yang dipilih? Tindakan ini tidak dapat dibatalkan.`}
        />

        {/* Preview Modal Perbaikan Saldo (Lebih Potong) Multi-SKU */}
        <Modal
          isOpen={isRedistributePreviewOpen}
          onClose={() => {
            if (!isExecutingBalanceFix) {
              setIsRedistributePreviewOpen(false);
              setSelectedIds(new Set());
            }
          }}
          title="Preview Perbaikan Saldo (Lebih Potong)"
          subtitle="Analisis & rekomendasi pemindahan data log OUT untuk menyeimbangkan stok minus"
          size="4xl"
        >
          <div className="space-y-4">
            {/* Stats Overview */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="bg-amber-50 border border-amber-200/80 rounded-2xl p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center font-bold shadow-md shadow-amber-500/20">
                  <Scale className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-[11px] font-bold text-amber-700 uppercase tracking-wider">Total Pemindahan</div>
                  <div className="text-xl font-black text-amber-900">{redistributeMoves.length} <span className="text-xs font-semibold text-amber-700">Baris Log</span></div>
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-200/80 rounded-2xl p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold shadow-md shadow-blue-500/20">
                  <Database className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-[11px] font-bold text-blue-700 uppercase tracking-wider">SKU Diperbaiki</div>
                  <div className="text-xl font-black text-blue-900">{new Set(redistributeMoves.map(m => m.sku)).size} <span className="text-xs font-semibold text-blue-700">Master SKU</span></div>
                </div>
              </div>

              <div className="bg-emerald-50 border border-emerald-200/80 rounded-2xl p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold shadow-md shadow-emerald-500/20">
                  <CheckCircle className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider">Total Kuantitas</div>
                  <div className="text-xl font-black text-emerald-900">{redistributeMoves.reduce((s, m) => s + m.jumlah, 0).toLocaleString()} <span className="text-xs font-semibold text-emerald-700">PCS</span></div>
                </div>
              </div>
            </div>

            {/* Notice / Info */}
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 rounded-xl p-3.5 flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
              <p className="text-xs text-blue-800 leading-relaxed">
                Sistem menganalisis transaksi <strong>OUT</strong> yang menyebabkan defisit (minus) dan mencocokkannya secara cerdas: memprioritaskan <strong>perbaikan Rak</strong> untuk tanggal scan yang sama, lalu <strong>perbaikan Tanggal Scan</strong> terdekat di rak yang bersangkutan.
              </p>
            </div>

            {/* Search within Preview */}
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
              <input
                type="text"
                value={previewSearchTerm}
                onChange={(e) => setPreviewSearchTerm(e.target.value)}
                placeholder="Cari SKU, Rak, Tanggal, atau Keterangan..."
                className="w-full pl-10 pr-4 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all text-gray-800"
              />
            </div>

            {/* Table of Recommended Moves */}
            <div className="border border-gray-200 rounded-2xl overflow-hidden max-h-[420px] overflow-y-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-gray-100 text-gray-700 font-bold sticky top-0 z-10 border-b border-gray-200">
                  <tr>
                    <th className="py-2.5 px-3 w-10 text-center">No</th>
                    <th className="py-2.5 px-3">SKU</th>
                    <th className="py-2.5 px-3 text-center">Jenis Perbaikan</th>
                    <th className="py-2.5 px-3 text-center">Perubahan Rak</th>
                    <th className="py-2.5 px-3 text-center">Perubahan Tgl Scan</th>
                    <th className="py-2.5 px-3 text-center">Qty</th>
                    <th className="py-2.5 px-3">Keterangan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {filteredMoves.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-gray-400 font-medium">
                        Tidak ada data rekomendasi yang sesuai dengan pencarian.
                      </td>
                    </tr>
                  ) : (
                    filteredMoves.map((move, idx) => (
                      <tr key={move.id || idx} className="hover:bg-blue-50/50 transition-colors">
                        <td className="py-2.5 px-3 text-center text-gray-400 font-mono text-[11px]">{idx + 1}</td>
                        <td className="py-2.5 px-3 font-black text-gray-900 font-mono text-[11px]">{move.sku}</td>
                        <td className="py-2.5 px-3 text-center">
                          {move.actionType === 'FIX_RAK' && (
                            <span className="inline-block px-2.5 py-1 bg-blue-50 text-blue-700 border border-blue-200 font-bold rounded-lg text-[10px] tracking-wide uppercase">
                              Pindah Rak
                            </span>
                          )}
                          {move.actionType === 'FIX_TGL_SCAN' && (
                            <span className="inline-block px-2.5 py-1 bg-amber-50 text-amber-700 border border-amber-200 font-bold rounded-lg text-[10px] tracking-wide uppercase">
                              Pindah Tgl Scan
                            </span>
                          )}
                          {move.actionType === 'FIX_RAK_DAN_TGL' && (
                            <span className="inline-block px-2.5 py-1 bg-purple-50 text-purple-700 border border-purple-200 font-bold rounded-lg text-[10px] tracking-wide uppercase">
                              Pindah Rak & Tgl
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          {move.fromRak.toUpperCase() !== move.toRak.toUpperCase() ? (
                            <div className="flex items-center justify-center gap-1.5 font-bold">
                              <span className="px-2 py-0.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-md text-[11px]">
                                {move.fromRak}
                              </span>
                              <span className="text-gray-400">→</span>
                              <span className="px-2 py-0.5 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-md text-[11px]">
                                {move.toRak}
                              </span>
                            </div>
                          ) : (
                            <span className="inline-block px-2 py-0.5 bg-gray-100 text-gray-700 font-bold rounded-md text-[11px]">
                              {move.fromRak}
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          {move.fromTgl !== move.toTgl ? (
                            <div className="flex items-center justify-center gap-1.5 font-semibold">
                              <span className="px-2 py-0.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-md text-[10px]">
                                {move.fromTgl || '(Kosong)'}
                              </span>
                              <span className="text-gray-400">→</span>
                              <span className="px-2 py-0.5 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-md text-[10px]">
                                {move.toTgl || '(Kosong)'}
                              </span>
                            </div>
                          ) : (
                            <span className="inline-block px-2 py-0.5 bg-gray-50 border border-gray-200 text-gray-700 rounded-md text-[10px]">
                              {move.fromTgl || '(Kosong)'}
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-center font-black text-blue-700">
                          <span className="inline-block px-2.5 py-0.5 bg-blue-50 text-blue-700 font-black rounded-full border border-blue-200 text-[11px]">
                            {move.jumlah}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-gray-600 text-[11px] font-medium">
                          {move.keterangan}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-between pt-2 border-t border-gray-100">
              <span className="text-xs text-gray-500">
                Menampilkan <strong>{filteredMoves.length}</strong> dari <strong>{redistributeMoves.length}</strong> pemindahan
              </span>
              <div className="flex items-center gap-3">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setIsRedistributePreviewOpen(false);
                    setSelectedIds(new Set());
                  }}
                  disabled={isExecutingBalanceFix}
                  className="h-10 px-5 rounded-xl font-bold"
                >
                  Batal
                </Button>
                <button
                  type="button"
                  onClick={handleExecuteRedistribute}
                  disabled={isExecutingBalanceFix || redistributeMoves.length === 0}
                  className="h-10 px-6 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold rounded-xl shadow-lg shadow-emerald-600/20 active:scale-95 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  {isExecutingBalanceFix ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      <span>Menerapkan ({redistributeMoves.length})...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" />
                      <span>Terapkan Perbaikan ({redistributeMoves.length})</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </Modal>

        {/* PIN Modal Protection */}
        <Modal
          isOpen={isPinModalOpen}
          onClose={() => setIsPinModalOpen(false)}
          title="Verifikasi PIN Keamanan"
          size="sm"
        >
          <form onSubmit={handlePinSubmit} className="space-y-4">
            <div className="text-center">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Lock className="h-8 w-8 text-blue-600" />
              </div>
              <p className="text-sm text-gray-600">
                Masukkan PIN 4-digit untuk melanjutkan aksi ini.
              </p>
            </div>

            <div className="relative">
              <input
                ref={pinInputRef}
                type="password"
                maxLength={4}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                className="w-full text-center text-3xl tracking-[1em] font-bold py-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none transition-all"
                placeholder="****"
                autoFocus
              />
            </div>

            {pinMessage.text && (
              <div className={`text-center text-sm font-medium p-2 rounded-lg ${pinMessage.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                {pinMessage.text}
              </div>
            )}

            <div className="flex space-x-3 pt-2">
              <Button
                type="button"
                variant="secondary"
                className="w-full h-11"
                onClick={() => setIsPinModalOpen(false)}
              >
                Batal
              </Button>
              <Button
                type="submit"
                variant="primary"
                className="w-full h-11"
                disabled={pin.length < 4}
              >
                Konfirmasi
              </Button>
            </div>
          </form>
        </Modal>
        {/* Mobile Sticky Action Bar */}
        <div className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-2xl p-4 border-t border-gray-100 shadow-[0_-8px_30px_rgba(0,0,0,0.08)] flex gap-2 animate-in slide-in-from-bottom-5">
          <Button
            onClick={() => setIsEntriModalOpen(true)}
            className="flex-1 h-14 bg-blue-600 hover:bg-blue-700 text-white font-black rounded-2xl shadow-lg shadow-blue-200 flex flex-col items-center justify-center gap-0.5 active:scale-95 transition-all border-none"
          >
            <Plus className="h-5 w-5" />
            <span className="text-[10px] uppercase tracking-tighter">Entri</span>
          </Button>
          <Button
            onClick={() => handleActionWithPin(() => setIsImportModalOpen(true))}
            className="flex-1 h-14 bg-orange-500 hover:bg-orange-600 text-white font-black rounded-2xl shadow-lg shadow-orange-200 flex flex-col items-center justify-center gap-0.5 active:scale-95 transition-all border-none"
          >
            <Upload className="h-5 w-5" />
            <span className="text-[10px] uppercase tracking-tighter">Import</span>
          </Button>
          <Button
            onClick={() => handleActionWithPin(handleExport)}
            className="flex-1 h-14 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-2xl shadow-lg shadow-emerald-200 flex flex-col items-center justify-center gap-0.5 active:scale-95 transition-all border-none"
          >
            <Download className="h-5 w-5" />
            <span className="text-[10px] uppercase tracking-tighter">Export</span>
          </Button>
        </div>

        {/* Bottom Spacer for Mobile Sticky Bar */}
        <div className="h-24 lg:hidden"></div>
      </div>
    </>
  );
}
